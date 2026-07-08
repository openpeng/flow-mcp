import type { ParamsDef, ParamDef, RequiredOutputDef, TemplateValidationResult, ValidationIssue, WorkflowStep, WorkflowTemplate } from '../types.js';
import { collectCheckExpressionOutputRefs, validateCheckExpressionSyntax } from './checkpoint-engine.js';
import { normalizeParams } from './template-store.js';

export function validateTemplateControlPlane(template: WorkflowTemplate, prompts: Record<string, string> = {}): TemplateValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const stepIds = new Set(template.steps.map(step => step.id));
  const params = normalizeParams(template.params);

  checkParamDefaults(params, warnings);
  checkUnreachable(template, errors);
  checkUnusedPrompts(stepIds, prompts, warnings);
  for (const step of template.steps) {
    checkExpressions(step, errors);
    checkEmptyConditions(step, errors);
    checkBranchShape(step, warnings);
    checkDuplicateKeys(step, errors);
    checkMissingDescriptions(step, warnings);
    checkExecutionMode(step, warnings);
    checkStepTools(step, warnings);
    checkStepAgentConfig(step, warnings);
  }
  for (const [stepId, prompt] of Object.entries(prompts)) {
    checkPromptRefs(stepId, prompt, template, stepIds, params, errors, warnings);
  }

  return { valid: errors.length === 0, errors, warnings };
}

function issue(code: string, message: string, severity: 'error' | 'warning', step_id?: string, suggestion?: string): ValidationIssue {
  return { code, message, severity, ...(step_id ? { step_id } : {}), ...(suggestion ? { suggestion } : {}) };
}

function checkParamDefaults(params: ParamsDef, warnings: ValidationIssue[]): void {
  for (const [key, def] of Object.entries(params) as [string, ParamDef][]) {
    if (def.required && def.default !== undefined) {
      warnings.push(issue('PARAM_REQUIRED_WITH_DEFAULT', `Param ${key} is required but also has a default`, 'warning', undefined, 'Either remove required=true or remove the default to avoid ambiguity'));
    }
  }
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
    if (!reachable.has(step.id)) errors.push(issue('UNREACHABLE_STEP', `Step is unreachable: ${step.id}`, 'error', step.id, 'Connect this step from next/branch or remove it'));
  }
}

function nextSteps(step: WorkflowStep): string[] {
  if (step.next === null) return [];
  if (typeof step.next === 'string') return [step.next];

  const obj = step.next as Record<string, unknown>;
  const ids: string[] = [];

  if ('branches' in obj && Array.isArray(obj.branches)) {
    for (const branch of obj.branches as Array<{ step?: string }>) {
      if (typeof branch.step === 'string') ids.push(branch.step);
    }
  }
  if (typeof obj.fallback === 'string') ids.push(obj.fallback);

  for (const v of Object.values(obj)) {
    if (typeof v === 'string' && !ids.includes(v)) ids.push(v);
  }

  return ids;
}

function checkUnusedPrompts(stepIds: Set<string>, prompts: Record<string, string>, warnings: ValidationIssue[]): void {
  for (const stepId of Object.keys(prompts)) {
    if (!stepIds.has(stepId)) warnings.push(issue('UNUSED_PROMPT', `Prompt is not used by any step: ${stepId}`, 'warning', stepId, 'Remove the prompt file or add a matching step'));
  }
}

function checkExpressions(step: WorkflowStep, errors: ValidationIssue[]): void {
  for (const condition of step.checkpoint?.conditions ?? []) {
    if (typeof condition === 'string' || !condition.check) continue;
    const result = validateCheckExpressionSyntax(condition.check);
    if (!result.ok) errors.push(issue('INVALID_CHECKPOINT_EXPRESSION', `Invalid checkpoint expression: ${condition.check}. ${result.error}`, 'error', step.id, 'Use the supported outputs.* expression subset'));
  }
}

function checkEmptyConditions(step: WorkflowStep, errors: ValidationIssue[]): void {
  for (const condition of step.checkpoint?.conditions ?? []) {
    if (typeof condition !== 'string' && !condition.natural && !condition.check) {
      errors.push(issue('EMPTY_CONDITION', 'Condition must define natural or check', 'error', step.id, 'Add a natural confirmation, deterministic check, or remove the condition'));
    }
  }
}

function checkBranchShape(step: WorkflowStep, warnings: ValidationIssue[]): void {
  if (step.next && typeof step.next === 'object') {
    const keys = Object.keys(step.next);
    if (!keys.includes('pass') || !keys.includes('fail')) {
      warnings.push(issue('BRANCH_MISSING_PASS_FAIL', `Branch next should usually include pass/fail keys: ${keys.join(', ')}`, 'warning', step.id, 'Use pass/fail branch keys unless a custom condition_result contract is documented'));
    }
  }
}

function checkDuplicateKeys(step: WorkflowStep, errors: ValidationIssue[]): void {
  duplicateKeys(step.checkpoint?.evidence?.map(def => def.key) ?? []).forEach(key => {
    errors.push(issue('DUPLICATE_EVIDENCE_KEY', `Duplicate evidence key: ${key}`, 'error', step.id, 'Use unique evidence keys'));
  });
  duplicateKeys(step.checkpoint?.approvals?.map(def => def.key) ?? []).forEach(key => {
    errors.push(issue('DUPLICATE_APPROVAL_KEY', `Duplicate approval key: ${key}`, 'error', step.id, 'Use unique approval keys'));
  });
}

function checkMissingDescriptions(step: WorkflowStep, warnings: ValidationIssue[]): void {
  for (const def of step.checkpoint?.evidence ?? []) {
    if (!def.description) warnings.push(issue('EVIDENCE_DESCRIPTION_MISSING', `Evidence ${def.key} has no description`, 'warning', step.id, 'Add description so dashboard can explain what to attach'));
  }
  for (const def of step.checkpoint?.approvals ?? []) {
    if (!def.description) warnings.push(issue('APPROVAL_DESCRIPTION_MISSING', `Approval ${def.key} has no description`, 'warning', step.id, 'Add description so dashboard can explain who/what should approve'));
  }
}

function checkExecutionMode(step: WorkflowStep, warnings: ValidationIssue[]): void {
  if (step.execution && !['inline', 'delegate'].includes(step.execution)) {
    warnings.push(issue('INVALID_EXECUTION_MODE', `Invalid execution mode: ${step.execution}`, 'warning', step.id, 'Use "inline" or "delegate"'));
  }
}

function checkStepTools(step: WorkflowStep, warnings: ValidationIssue[]): void {
  if (!step.tools) return;
  for (const tool of step.tools) {
    if (typeof tool === 'string') {
      if (!tool.trim()) warnings.push(issue('EMPTY_TOOL_NAME', 'Tool name is empty', 'warning', step.id, 'Provide a valid tool name'));
    } else if (tool && typeof tool === 'object') {
      if (!tool.name || !tool.name.trim()) warnings.push(issue('EMPTY_TOOL_NAME', 'Tool name is empty', 'warning', step.id, 'Provide a valid tool name'));
      if (tool.type && !['mcp', 'skill'].includes(tool.type)) warnings.push(issue('INVALID_TOOL_TYPE', `Invalid tool type: ${tool.type}`, 'warning', step.id, 'Use "mcp" or "skill"'));
    }
  }
}

function checkStepAgentConfig(step: WorkflowStep, warnings: ValidationIssue[]): void {
  if (!step.agent) return;
  if (step.agent.temperature !== undefined && (step.agent.temperature < 0 || step.agent.temperature > 2)) {
    warnings.push(issue('INVALID_AGENT_TEMPERATURE', `Temperature should be between 0 and 2: ${step.agent.temperature}`, 'warning', step.id, 'Use a value between 0 and 2'));
  }
  if (step.agent.max_tokens !== undefined && step.agent.max_tokens <= 0) {
    warnings.push(issue('INVALID_AGENT_MAX_TOKENS', `max_tokens should be positive: ${step.agent.max_tokens}`, 'warning', step.id, 'Use a positive number'));
  }
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
        errors.push(issue('NONEXISTENT_STEP_REFERENCE', `Prompt references missing step: ${refStep}`, 'error', stepId, 'Fix the step id or add the referenced step'));
      } else if (parts[2] === 'outputs' && outputKey) {
        const declared = declaredOutputs(template.steps.find(step => step.id === refStep)!);
        if (declared.size && !declared.has(outputKey)) {
          warnings.push(issue('NONEXISTENT_STEP_OUTPUT_REFERENCE', `Prompt references undeclared output: ${refStep}.${outputKey}`, 'warning', stepId, 'Declare the output in required_outputs/optional_outputs or fix the prompt reference'));
        }
      }
      continue;
    }
    const param = ref.startsWith('params.') ? ref.slice('params.'.length) : ref;
    if (param && !param.includes('.') && !(param in params)) {
      errors.push(issue('UNDECLARED_PARAM_REFERENCE', `Prompt references undeclared param: ${param}`, 'error', stepId, 'Declare the param in flow.yaml or fix the prompt reference'));
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
