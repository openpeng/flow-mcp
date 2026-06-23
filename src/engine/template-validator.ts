import type { ParamsDef, RequiredOutputDef, TemplateValidationResult, ValidationIssue, WorkflowStep, WorkflowTemplate } from '../types.js';
import { collectCheckExpressionOutputRefs, validateCheckExpressionSyntax } from './checkpoint-engine.js';
import { normalizeParams } from './template-store.js';

export function validateTemplateControlPlane(template: WorkflowTemplate, prompts: Record<string, string> = {}): TemplateValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const stepIds = new Set(template.steps.map(step => step.id));
  const params = normalizeParams(template.params);

  checkUnreachable(template, errors);
  for (const step of template.steps) {
    checkExpressions(step, errors);
    checkDuplicateKeys(step, errors);
  }
  for (const [stepId, prompt] of Object.entries(prompts)) {
    checkPromptRefs(stepId, prompt, template, stepIds, params, errors, warnings);
  }

  return { valid: errors.length === 0, errors, warnings };
}

function checkUnreachable(template: WorkflowTemplate, errors: ValidationIssue[]): void {
  const reachable = new Set<string>();
  const byId = new Map(template.steps.map(step => [step.id, step]));
  const visit = (id: string) => {
    if (reachable.has(id)) return;
    const step = byId.get(id);
    if (!step) return;
    reachable.add(id);
    for (const next of nextSteps(step)) visit(next);
  };
  const first = template.steps[0];
  if (first) visit(first.id);
  for (const step of template.steps) {
    if (!reachable.has(step.id)) errors.push({ code: 'UNREACHABLE_STEP', message: `Step is unreachable: ${step.id}`, step_id: step.id });
  }
}

function nextSteps(step: WorkflowStep): string[] {
  if (step.next === null) return [];
  if (typeof step.next === 'string') return [step.next];
  return Object.values(step.next);
}

function checkExpressions(step: WorkflowStep, errors: ValidationIssue[]): void {
  for (const condition of step.checkpoint?.conditions ?? []) {
    if (typeof condition === 'string' || !condition.check) continue;
    const result = validateCheckExpressionSyntax(condition.check);
    if (!result.ok) errors.push({ code: 'INVALID_CHECKPOINT_EXPRESSION', message: `Invalid checkpoint expression: ${condition.check}. ${result.error}`, step_id: step.id });
  }
}

function checkDuplicateKeys(step: WorkflowStep, errors: ValidationIssue[]): void {
  duplicateKeys(step.checkpoint?.evidence?.map(def => def.key) ?? []).forEach(key => {
    errors.push({ code: 'DUPLICATE_EVIDENCE_KEY', message: `Duplicate evidence key: ${key}`, step_id: step.id });
  });
  duplicateKeys(step.checkpoint?.approvals?.map(def => def.key) ?? []).forEach(key => {
    errors.push({ code: 'DUPLICATE_APPROVAL_KEY', message: `Duplicate approval key: ${key}`, step_id: step.id });
  });
}

function duplicateKeys(keys: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const key of keys.filter(Boolean)) {
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates];
}

function checkPromptRefs(
  stepId: string,
  prompt: string,
  template: WorkflowTemplate,
  stepIds: Set<string>,
  params: ParamsDef,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
): void {
  for (const ref of promptRefs(prompt)) {
    if (ref.startsWith('steps.')) {
      const parts = ref.split('.');
      const refStep = parts[1];
      const outputKey = parts[3];
      if (!stepIds.has(refStep)) {
        errors.push({ code: 'NONEXISTENT_STEP_REFERENCE', message: `Prompt references missing step: ${refStep}`, step_id: stepId });
      } else if (parts[2] === 'outputs' && outputKey) {
        const declared = declaredOutputs(template.steps.find(step => step.id === refStep)!);
        if (declared.size && !declared.has(outputKey)) {
          warnings.push({ code: 'NONEXISTENT_STEP_OUTPUT_REFERENCE', message: `Prompt references undeclared output: ${refStep}.${outputKey}`, step_id: stepId });
        }
      }
      continue;
    }
    const param = ref.startsWith('params.') ? ref.slice('params.'.length) : ref;
    if (param && !param.includes('.') && !(param in params)) {
      errors.push({ code: 'UNDECLARED_PARAM_REFERENCE', message: `Prompt references undeclared param: ${param}`, step_id: stepId });
    }
  }
}

function promptRefs(prompt: string): string[] {
  return [...prompt.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map(match => match[1].trim());
}

function declaredOutputs(step: WorkflowStep): Set<string> {
  const keys = new Set<string>();
  const required = step.checkpoint?.required_outputs ?? [];
  if (Array.isArray(required)) {
    for (const item of required) if (typeof item === 'string') keys.add(item);
  } else {
    for (const key of Object.keys(required as Record<string, RequiredOutputDef>)) keys.add(key);
  }
  for (const key of Object.keys(step.checkpoint?.optional_outputs ?? {})) keys.add(key);
  for (const condition of step.checkpoint?.conditions ?? []) {
    if (typeof condition !== 'string' && condition.check) {
      for (const ref of collectCheckExpressionOutputRefs(condition.check)) keys.add(ref.split('.')[0]);
    }
  }
  return keys;
}
