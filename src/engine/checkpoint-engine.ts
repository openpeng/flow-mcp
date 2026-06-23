import type {
  CheckpointValidationError,
  CheckpointValidationResult,
  Condition,
  ConditionDef,
  RequiredOutput,
  RequiredOutputDef,
  WorkflowStep,
} from '../types.js';

export function validateCheckpoint(
  step: WorkflowStep,
  outputs: Record<string, unknown>,
  confirmedConditions: string[] = [],
  evidence: Record<string, unknown> = {},
  approvals: Record<string, unknown> = {},
): CheckpointValidationResult {
  const errors: CheckpointValidationError[] = [];
  validateRequiredOutputs(step, outputs, errors);
  validateEvidence(step, evidence, errors);
  validateApprovals(step, approvals, errors);
  validateConditions(step, outputs, confirmedConditions, errors);
  return { ok: errors.length === 0, errors };
}

function validateRequiredOutputs(step: WorkflowStep, outputs: Record<string, unknown>, errors: CheckpointValidationError[]): void {
  const required = step.checkpoint?.required_outputs ?? [];
  const entries: [string, RequiredOutput][] = Array.isArray(required)
    ? required.map(item => [typeof item === 'string' ? item : '', item])
    : Object.entries(required as Record<string, RequiredOutputDef>);

  for (const [key, def] of entries) {
    if (typeof def === 'string') {
      if (!hasValue(outputs[def])) {
        errors.push({ kind: 'required_output', field: def, message: `Output required: ${def}` });
      }
      continue;
    }

    if (!key) continue;
    const value = outputs[key];
    if (!hasValue(value)) {
      errors.push({ kind: 'required_output', field: key, message: `Output required: ${key}`, help: def.help });
      continue;
    }

    if (def.type && !matchesType(value, def.type)) {
      errors.push({ kind: 'type', field: key, message: `${key} must be ${def.type}`, help: def.help });
    }
    if (def.min_length !== undefined && lengthOf(value) < def.min_length) {
      errors.push({ kind: 'min_length', field: key, message: `${key} too short (need ${def.min_length})`, help: def.help });
    }
    if (def.pattern && typeof value === 'string') {
      try {
        if (!new RegExp(def.pattern).test(value)) {
          errors.push({ kind: 'pattern', field: key, message: `${key} pattern mismatch: ${def.pattern}`, help: def.help });
        }
      } catch {
        errors.push({ kind: 'pattern', field: key, message: `${key} has invalid validation pattern: ${def.pattern}`, help: def.help });
      }
    }
  }
}

function validateEvidence(step: WorkflowStep, evidence: Record<string, unknown>, errors: CheckpointValidationError[]): void {
  for (const def of step.checkpoint?.evidence ?? []) {
    if (!def?.key || def.required === false) continue;
    if (!hasValue(evidence[def.key])) {
      errors.push({ kind: 'evidence', field: def.key, message: `Evidence required: ${def.key}`, help: def.description });
    }
  }
}

function validateApprovals(step: WorkflowStep, approvals: Record<string, unknown>, errors: CheckpointValidationError[]): void {
  for (const def of step.checkpoint?.approvals ?? []) {
    if (!def?.key || def.required === false) continue;
    if (!isApproved(approvals[def.key])) {
      errors.push({ kind: 'approval', field: def.key, message: `Approval required: ${def.key}`, help: def.description });
    }
  }
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function isApproved(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'string') return ['true', 'approved', 'pass', 'yes', 'confirmed'].includes(value.toLowerCase());
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return record.approved === true || record.status === 'approved' || record.confirmed === true;
  }
  return false;
}

function matchesType(value: unknown, type: string): boolean {
  if (type === 'array') return Array.isArray(value);
  if (type === 'null') return value === null;
  if (type === 'integer') return Number.isInteger(value);
  return typeof value === type;
}

function lengthOf(value: unknown): number {
  if (typeof value === 'string' || Array.isArray(value)) return value.length;
  return 0;
}

function validateConditions(
  step: WorkflowStep,
  outputs: Record<string, unknown>,
  confirmedConditions: string[],
  errors: CheckpointValidationError[],
): void {
  const conditions = step.checkpoint?.conditions ?? [];
  for (const condition of conditions) {
    if (typeof condition === 'string') {
      if (!fuzzyMatch(condition, confirmedConditions)) {
        errors.push({ kind: 'condition', message: `Condition not confirmed: ${condition}` });
      }
      continue;
    }

    const def = condition as ConditionDef;
    let passed = false;
    if (def.check) {
      const result = evaluateCheckExpression(def.check, outputs);
      if (result.ok) {
        passed = result.value;
      } else {
        errors.push({ kind: 'expression', message: `Invalid check expression: ${def.check}. ${result.error}`, help: def.help });
        continue;
      }
    }
    if (!passed && def.natural) passed = fuzzyMatch(def.natural, confirmedConditions);
    if (!passed) {
      errors.push({ kind: def.check ? 'check' : 'condition', message: `Condition not met: ${def.natural ?? def.check ?? '(unnamed)'}`, help: def.help });
    }
  }
}

export function fuzzyMatch(required: string, confirmed: string[]): boolean {
  return confirmed.some(candidate => fuzzyContains(required, candidate));
}

export function fuzzyContains(required: string, candidate: string): boolean {
  const normalize = (s: string) => s.toLowerCase()
    .replace(/[\s，。、；：！？"「」『』（）【】《》、''""'·—…]+/g, ' ')
    .trim();
  const requiredNorm = normalize(required);
  const candidateNorm = normalize(candidate);

  if (!requiredNorm || !candidateNorm) return false;
  if (candidateNorm.includes(requiredNorm) || requiredNorm.includes(candidateNorm)) return true;

  const requiredWords = new Set(requiredNorm.split(/\s+/).filter(word => word.length > 1));
  const candidateWords = new Set(candidateNorm.split(/\s+/).filter(word => word.length > 1));
  if (!requiredWords.size) return false;
  const overlap = [...requiredWords].filter(word => candidateWords.has(word)).length;
  return overlap / requiredWords.size >= 0.6;
}

interface EvalResult {
  ok: boolean;
  value: boolean;
  error?: string;
}

export function evaluateCheckExpression(expression: string, outputs: Record<string, unknown>): EvalResult {
  try {
    return { ok: true, value: evalExpression(stripOuterParens(expression.trim()), outputs) };
  } catch (err) {
    return { ok: false, value: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function validateCheckExpressionSyntax(expression: string): { ok: boolean; error?: string } {
  try {
    collectExpressionReferences(stripOuterParens(expression.trim()));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function collectCheckExpressionOutputRefs(expression: string): string[] {
  return collectExpressionReferences(stripOuterParens(expression.trim()));
}

function evalExpression(expression: string, outputs: Record<string, unknown>): boolean {
  const expr = stripOuterParens(expression.trim());
  const orParts = splitLogical(expr, 'OR');
  if (orParts.length > 1) return orParts.some(part => evalExpression(part, outputs));
  const andParts = splitLogical(expr, 'AND');
  if (andParts.length > 1) return andParts.every(part => evalExpression(part, outputs));
  return evalAtomic(expr, outputs);
}

function collectExpressionReferences(expression: string): string[] {
  const expr = stripOuterParens(expression.trim());
  const orParts = splitLogical(expr, 'OR');
  if (orParts.length > 1) return unique(orParts.flatMap(collectExpressionReferences));
  const andParts = splitLogical(expr, 'AND');
  if (andParts.length > 1) return unique(andParts.flatMap(collectExpressionReferences));
  return collectAtomicReference(expr);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function stripOuterParens(expression: string): string {
  let expr = expression.trim();
  while (expr.startsWith('(') && expr.endsWith(')') && enclosesWholeExpression(expr)) {
    expr = expr.slice(1, -1).trim();
  }
  return expr;
}

function enclosesWholeExpression(expression: string): boolean {
  let depth = 0;
  for (let i = 0; i < expression.length; i++) {
    const char = expression[i];
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (depth === 0 && i < expression.length - 1) return false;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function splitLogical(expression: string, op: 'AND' | 'OR'): string[] {
  const parts: string[] = [];
  let depth = 0;
  let last = 0;
  const re = new RegExp(`\\b${op}\\b`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(expression)) !== null) {
    const before = expression.slice(last, match.index);
    depth += (before.match(/\(/g) ?? []).length - (before.match(/\)/g) ?? []).length;
    if (depth === 0) {
      parts.push(expression.slice(last, match.index).trim());
      last = match.index + match[0].length;
    }
  }
  parts.push(expression.slice(last).trim());
  return parts.filter(Boolean);
}

function evalAtomic(expression: string, outputs: Record<string, unknown>): boolean {
  const expr = expression.trim();
  let match = expr.match(/^outputs\.([A-Za-z0-9_.-]+)\s*!=\s*null$/);
  if (match) return resolveOutput(outputs, match[1]) != null;
  match = expr.match(/^outputs\.([A-Za-z0-9_.-]+)\s*==\s*null$/);
  if (match) return resolveOutput(outputs, match[1]) == null;
  match = expr.match(/^outputs\.([A-Za-z0-9_.-]+)\s*==\s*'([^']*)'$/);
  if (match) return String(resolveOutput(outputs, match[1])) === match[2];
  match = expr.match(/^len\(outputs\.([A-Za-z0-9_.-]+)\)\s*>\s*(\d+)$/);
  if (match) return lengthOf(resolveOutput(outputs, match[1])) > Number(match[2]);
  throw new Error(`Unsupported expression: ${expression}`);
}

function collectAtomicReference(expression: string): string[] {
  const expr = expression.trim();
  let match = expr.match(/^outputs\.([A-Za-z0-9_.-]+)\s*(?:!=|==)\s*null$/);
  if (match) return [match[1]];
  match = expr.match(/^outputs\.([A-Za-z0-9_.-]+)\s*==\s*'[^']*'$/);
  if (match) return [match[1]];
  match = expr.match(/^len\(outputs\.([A-Za-z0-9_.-]+)\)\s*>\s*\d+$/);
  if (match) return [match[1]];
  throw new Error(`Unsupported expression: ${expression}`);
}

function resolveOutput(outputs: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((obj, part) => {
    if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[part];
    return undefined;
  }, outputs);
}
