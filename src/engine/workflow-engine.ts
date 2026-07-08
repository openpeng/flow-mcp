import type { ConfigOverrides } from '../config.js';
import type {
  AdvanceOptions,
  CheckpointValidationError,
  CreateTemplateOptions,
  DelegateStepResult,
  ExecutionMode,
  ParamsDef,
  StepToolRef,
  WorkflowAdvanceResult,
  WorkflowCurrentResult,
  WorkflowInstance,
  WorkflowStep,
  WorkflowTemplate,
} from '../types.js';
import { validateCheckpoint } from './checkpoint-engine.js';
import { OflowError } from './errors.js';
import { assertOutputsSize, assertPromptSize } from './limits.js';
import { recordEvent } from './event-log.js';
import { assertStepId } from './security.js';
import {
  createTemplate,
  loadPromptSnapshots,
  loadTemplate,
  normalizeParams,
  validateTemplate,
} from './template-store.js';
import {
  bindAlias,
  ensureAliasAvailable,
  listInstances,
  loadInstance,
  newInstanceId,
  resolveInstance,
  saveInstance,
} from './instance-store.js';
import { renderPrompt } from './prompt-engine.js';
import { buildMemoryInjection, findRelevantMemories, type MemorySummary } from './memory-lookup.js';
import { buildToolContracts } from '../tools/workflow-tools.js';

export function startWorkflow(
  templateName: string,
  params: Record<string, string>,
  alias?: string,
  overrides: ConfigOverrides = {},
): WorkflowCurrentResult {
  const template = loadTemplate(templateName, overrides);
  validateTemplate(template, { templateName, requirePrompts: true, config: overrides });
  const promptSnapshots = loadPromptSnapshots(template, templateName, overrides);
  const normalizedParams = normalizeParams(template.params);
  const resolvedParams = resolveParams(normalizedParams, params);
  if (alias) ensureAliasAvailable(alias, undefined, overrides);

  const now = new Date().toISOString();
  const steps: WorkflowInstance['steps'] = {};
  for (const step of template.steps) steps[step.id] = { status: 'pending' };
  const firstStep = template.steps[0];
  steps[firstStep.id] = { status: 'in_progress', started_at: now };

  const instance: WorkflowInstance = {
    id: newInstanceId(),
    template: templateName,
    params: resolvedParams,
    status: 'active',
    current_step: firstStep.id,
    created_at: now,
    updated_at: now,
    version: 1,
    steps,
    prompt_overrides: {},
    template_snapshot: template,
    prompt_snapshots: promptSnapshots,
    token_usage: { total_consumed: 0, per_step: {} },
    ...(alias ? { alias } : {}),
  };
  const saved = saveInstance(instance, overrides);
  recordEvent('workflow.started', saved.id, { template: templateName, alias }, undefined, overrides);
  recordEvent('step.started', saved.id, { step: firstStep.id }, firstStep.id, overrides);
  return currentFromInstance(saved, { include_memories: true }, overrides);
}

function resolveParams(defs: ParamsDef, params: Record<string, string>): Record<string, string> {
  const resolved: Record<string, string> = {};
  const missing: string[] = [];

  for (const [key, def] of Object.entries(defs)) {
    const value = params[key] ?? def.default;
    if ((value === undefined || value === '') && def.required) missing.push(key);
    if (value !== undefined) resolved[key] = String(value);
    if (value !== undefined && def.pattern && !new RegExp(def.pattern).test(String(value))) {
      throw new OflowError('INVALID_ARGUMENT', `Parameter ${key} pattern mismatch: ${def.pattern}`);
    }
  }

  for (const [key, value] of Object.entries(params)) {
    if (!(key in resolved)) resolved[key] = String(value);
  }

  if (missing.length) throw new OflowError('INVALID_ARGUMENT', `Missing required parameters: ${missing.join(', ')}`);
  return resolved;
}

export function getCurrent(instanceIdOrAlias?: string, options?: { include_memories?: boolean }, overrides: ConfigOverrides = {}): WorkflowCurrentResult {
  let instance: WorkflowInstance | undefined;
  if (instanceIdOrAlias) {
    instance = resolveInstance(instanceIdOrAlias, overrides);
  } else {
    instance = listInstances({ status: 'active' }, overrides).instances[0];
    if (!instance) throw new OflowError('NOT_FOUND', 'No active workflow instance found');
  }
  return currentFromInstance(instance, options, overrides);
}

function currentFromInstance(instance: WorkflowInstance, options?: { include_memories?: boolean }, overrides: ConfigOverrides = {}): WorkflowCurrentResult {
  const template = templateForInstance(instance, overrides);
  const step = findStep(template, instance.current_step);
  const promptText = instance.prompt_overrides[step.id] ?? promptForInstance(instance, step.id, overrides);
  const rendered = renderPrompt(promptText, instance);
  const includeMemories = options?.include_memories !== false; // default true

  // Inject relevant memories at the top
  const memoryInjection = includeMemories ? buildMemoryInjection(step.name) : '';
  const prompt = memoryInjection ? memoryInjection + '\n' + rendered : rendered;

  return { instance, step, prompt };
}

function templateForInstance(instance: WorkflowInstance, overrides: ConfigOverrides): WorkflowTemplate {
  if (instance.template_snapshot) return instance.template_snapshot;
  return loadTemplate(instance.template, overrides);
}

function promptForInstance(instance: WorkflowInstance, stepId: string, overrides: ConfigOverrides): string {
  assertStepId(stepId);
  const snapshot = instance.prompt_snapshots?.[stepId];
  if (snapshot !== undefined) return snapshot;
  if (instance.template_snapshot && instance.prompt_snapshots) {
    throw new OflowError('PROMPT_SNAPSHOT_MISSING', stepId);
  }
  const prompts = loadPromptSnapshots(templateForInstance(instance, overrides), instance.template, overrides);
  const prompt = prompts[stepId];
  if (prompt === undefined) throw new OflowError('NOT_FOUND', `Prompt not found in snapshot: ${stepId}`);
  return prompt;
}

export function advanceWorkflow(
  instanceId: string,
  outputs: Record<string, unknown>,
  options: AdvanceOptions = {},
  overrides: ConfigOverrides = {},
): WorkflowAdvanceResult {
  const instance = resolveInstance(instanceId, overrides);
  if (instance.status === 'completed') throw new OflowError('CONFLICT', `Workflow instance already completed: ${instance.id}`);

  assertOutputsSize(outputs);
  const template = templateForInstance(instance, overrides);
  const step = findStep(template, instance.current_step);

  const proposedConsumed = (instance.token_usage?.total_consumed ?? 0) + Math.max(0, options.token_consumed ?? 0);
  if (template.token_budget && proposedConsumed > template.token_budget.total) {
    throw new OflowError('TOKEN_BUDGET_EXHAUSTED', `${proposedConsumed} / ${template.token_budget.total}`);
  }

  const validation = validateCheckpoint(step, outputs, options.confirmed_conditions ?? [], options.evidence ?? {}, options.approvals ?? {});
  if (!validation.ok) {
    const details = checkpointFailureDetails(validation.errors);
    recordEvent('step.validation_failed', instance.id, { errors: validation.errors, details }, step.id, overrides);
    const message = validation.errors.map(error => `${error.message}${error.help ? ` (${error.help})` : ''}`).join('; ');
    throw new OflowError('CHECKPOINT_VALIDATION_FAILED', message, details);
  }

  const expectedVersion = instance.version;
  const now = new Date().toISOString();
  instance.steps[step.id] = {
    ...instance.steps[step.id],
    status: 'done',
    completed_at: now,
    outputs,
    confirmed_conditions: options.confirmed_conditions ?? [],
  };
  instance.token_usage = instance.token_usage ?? { total_consumed: 0, per_step: {} };
  if (options.token_consumed && options.token_consumed > 0) {
    instance.token_usage.total_consumed = proposedConsumed;
    instance.token_usage.per_step[step.id] = options.token_consumed;
  }

  const nextStepId = resolveNextStep(step, options.condition_result);
  if (nextStepId === null) {
    instance.status = 'completed';
    instance.updated_at = now;
    const saved = saveInstance(instance, overrides, { expectedVersion });
    recordEvent('step.completed', saved.id, { outputs }, step.id, overrides);
    recordEvent('workflow.completed', saved.id, { step: step.id }, undefined, overrides);
    return { completed: true, instance: saved };
  }

  const nextStep = findStep(template, nextStepId);
  instance.current_step = nextStep.id;
  instance.steps[nextStep.id] = { ...instance.steps[nextStep.id], status: 'in_progress', started_at: now };
  instance.updated_at = now;
  const saved = saveInstance(instance, overrides, { expectedVersion });

  recordEvent('step.completed', saved.id, { outputs }, step.id, overrides);
  recordEvent('step.started', saved.id, { step: nextStep.id }, nextStep.id, overrides);
  const nextPromptText = saved.prompt_overrides[nextStep.id] ?? promptForInstance(saved, nextStep.id, overrides);
  return {
    completed: false,
    instance: saved,
    next_step: nextStep,
    next_prompt: renderPrompt(nextPromptText, saved),
  };
}

function checkpointFailureDetails(errors: CheckpointValidationError[]) {
  const missingRequired = errors.filter(error => error.kind === 'required_output').map(error => error.field).filter((field): field is string => Boolean(field));
  const missingEvidence = errors.filter(error => error.kind === 'evidence').map(error => error.field).filter((field): field is string => Boolean(field));
  const missingApprovals = errors.filter(error => error.kind === 'approval').map(error => error.field).filter((field): field is string => Boolean(field));
  return {
    readiness: 'blocked',
    missing_required: missingRequired,
    missing_evidence: missingEvidence,
    missing_approvals: missingApprovals,
    suggestions: [
      ...missingRequired.map(field => `Complete required output: ${field}`),
      ...missingEvidence.map(field => `Attach required evidence: ${field}`),
      ...missingApprovals.map(field => `Collect required approval: ${field}`),
    ],
    errors,
  };
}

function resolveNextStep(step: WorkflowStep, conditionResult?: string): string | null {
  if (step.next === null || typeof step.next === 'string') return step.next;

  const obj = step.next as Record<string, unknown>;

  if ('branches' in obj && Array.isArray(obj.branches)) {
    for (const branch of obj.branches as Array<{ condition?: string; step?: string }>) {
      if (typeof branch.condition === 'string' && typeof branch.step === 'string') {
        try {
          if (new RegExp(branch.condition).test(conditionResult ?? '')) {
            return branch.step;
          }
        } catch { /* skip invalid regex */ }
      }
    }
    if (typeof obj.fallback === 'string') return obj.fallback;
    throw new OflowError('INVALID_ARGUMENT', `No branch matched condition_result "${conditionResult}" for step ${step.id}, and no fallback defined`);
  }

  const key = conditionResult ?? 'pass';
  const next = obj[key];
  if (!next) throw new OflowError('INVALID_ARGUMENT', `No branch matched condition_result "${key}" for step ${step.id}`);
  return next as string;
}

export function getWorkflowStatus(instanceIdOrAlias: string, overrides: ConfigOverrides = {}): { instance: WorkflowInstance; template: WorkflowTemplate; steps: WorkflowStep[] } {
  const instance = resolveInstance(instanceIdOrAlias, overrides);
  const template = templateForInstance(instance, overrides);
  return { instance, template, steps: template.steps };
}

export function listWorkflowInstances(filter: { status?: 'active' | 'completed' | 'all'; template?: string } = {}, overrides: ConfigOverrides = {}) {
  return listInstances(filter, overrides);
}

export function bindWorkflowAlias(instanceId: string, alias: string, overrides: ConfigOverrides = {}): WorkflowInstance {
  return bindAlias(instanceId, alias, overrides);
}

export function overridePrompt(instanceIdOrAlias: string, stepId: string, prompt: string, overrides: ConfigOverrides = {}): WorkflowInstance {
  assertStepId(stepId);
  assertPromptSize(prompt);
  if (!prompt.trim()) throw new OflowError('INVALID_ARGUMENT', 'Prompt must not be empty');
  const instance = resolveInstance(instanceIdOrAlias, overrides);
  const template = templateForInstance(instance, overrides);
  findStep(template, stepId);
  const expectedVersion = instance.version;
  instance.prompt_overrides[stepId] = prompt;
  instance.updated_at = new Date().toISOString();
  const saved = saveInstance(instance, overrides, { expectedVersion });
  recordEvent('prompt.overridden', saved.id, { step_id: stepId }, stepId, overrides);
  return saved;
}

export function createWorkflowTemplate(options: CreateTemplateOptions, overrides: ConfigOverrides = {}): { path: string } {
  return createTemplate(options, overrides);
}

const BASE_TOOLS = ['search', 'general_purpose_task'];

export function delegateStep(instanceIdOrAlias?: string, overrides: ConfigOverrides = {}): DelegateStepResult {
  let instance: WorkflowInstance | undefined;
  if (instanceIdOrAlias) {
    instance = resolveInstance(instanceIdOrAlias, overrides);
  } else {
    instance = listInstances({ status: 'active' }, overrides).instances[0];
    if (!instance) throw new OflowError('NOT_FOUND', 'No active workflow instance found');
  }
  const template = templateForInstance(instance, overrides);
  const step = findStep(template, instance.current_step);

  const executionMode: ExecutionMode = step.execution ?? 'inline';
  const stepTools = step.tools ?? [];
  const allTools = mergeBaseAndStepTools(stepTools);
  const requiredOutputs = extractRequiredOutputs(step);

  const canDelegate = executionMode === 'delegate';

  const promptText = instance.prompt_overrides[step.id] ?? promptForInstance(instance, step.id, overrides);
  const rendered = renderPrompt(promptText, instance);
  const memoryInjection = buildMemoryInjection(step.name);
  const prompt = memoryInjection ? memoryInjection + '\n' + rendered : rendered;

  const launchContext = buildLaunchContext(instance, step, template, allTools);

  return {
    instance_id: instance.id,
    step_id: step.id,
    execution_mode: executionMode,
    tools: allTools,
    agent: step.agent,
    prompt,
    required_outputs: requiredOutputs,
    can_delegate: canDelegate,
    launch_context: launchContext,
  };
}

function buildLaunchContext(
  instance: WorkflowInstance,
  step: WorkflowStep,
  template: WorkflowTemplate,
  tools: (string | { name: string; type: 'mcp' | 'skill' })[],
): { previous_outputs: Record<string, Record<string, unknown>>; memory_summary: string; project_context?: string; tools_contract: { name: string; description: string; parameters: { name: string; type: string; required: boolean; description?: string }[] }[] } {
  const previousOutputs: Record<string, Record<string, unknown>> = {};
  for (const [stepId, stepState] of Object.entries(instance.steps)) {
    if (stepId !== step.id && stepState.status === 'done' && stepState.outputs && Object.keys(stepState.outputs).length > 0) {
      previousOutputs[stepId] = stepState.outputs as Record<string, unknown>;
    }
  }

  const mems = findRelevantMemories(step.name);
  const memorySummary = mems.length > 0
    ? mems.map((m: MemorySummary) => `[${m.type}] ${m.name}: ${m.summary}`).join('\n')
    : '';

  const toolsContract = buildToolContracts(tools);

  return {
    previous_outputs: previousOutputs,
    memory_summary: memorySummary,
    ...(template.global_context ? { project_context: template.global_context } : {}),
    tools_contract: toolsContract,
  };
}

function mergeBaseAndStepTools(stepTools: (string | StepToolRef)[]): (string | StepToolRef)[] {
  const result: (string | StepToolRef)[] = [...BASE_TOOLS];
  const seenNames = new Set(BASE_TOOLS);

  for (const tool of stepTools) {
    const name = typeof tool === 'string' ? tool : tool.name;
    if (!seenNames.has(name)) {
      seenNames.add(name);
      result.push(tool);
    }
  }

  return result;
}

function extractRequiredOutputs(step: WorkflowStep): string[] {
  const outputs: string[] = [];
  const required = step.checkpoint?.required_outputs ?? [];

  if (Array.isArray(required)) {
    for (const item of required) {
      if (typeof item === 'string') {
        outputs.push(item);
      } else if (item && typeof item === 'object') {
        outputs.push(...Object.keys(item));
      }
    }
  } else if (required && typeof required === 'object') {
    outputs.push(...Object.keys(required));
  }

  return outputs;
}

function findStep(template: WorkflowTemplate, stepId: string): WorkflowStep {
  assertStepId(stepId);
  const step = template.steps.find(candidate => candidate.id === stepId);
  if (!step) throw new OflowError('NOT_FOUND', `Step not found in template ${template.name}: ${stepId}`);
  return step;
}
