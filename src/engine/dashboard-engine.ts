import type { ConfigOverrides } from '../config.js';
import type { DashboardProgress, DashboardRisk, SuggestedAction, SuggestedActionRisk, WorkflowDashboardResult, WorkflowInstance, WorkflowStep, WorkflowTemplate } from '../types.js';
import { queryEvents } from './event-log.js';
import { inspectCheckpoint } from './checkpoint-inspector.js';
import { summarizeInbox, listInboxEntries } from './inbox-store.js';
import { renderPrompt } from './prompt-engine.js';
import { listInstances, resolveInstance } from './instance-store.js';

export interface DashboardOptions {
  include_prompt?: boolean;
  include_recent_events?: boolean;
  include_inbox?: boolean;
  event_limit?: number;
  inbox_limit?: number;
  verbose?: boolean;
}

export function buildDashboard(instanceIdOrAlias: string | undefined, options: DashboardOptions = {}, overrides: ConfigOverrides = {}): WorkflowDashboardResult {
  const instance = instanceIdOrAlias
    ? resolveInstance(instanceIdOrAlias, overrides)
    : listInstances({ status: 'active' }, overrides).instances[0];
  if (!instance) throw new Error('No active workflow instance found');

  const template = templateForInstance(instance);
  const step = findStep(template, instance.current_step);
  const inspection = inspectCheckpoint(instance, step);
  const recentEvents = options.include_recent_events
    ? queryEvents(instance.id, { limit: options.event_limit, summary: true }, overrides)
    : undefined;
  const validationFailures = queryEvents(instance.id, { only_failures: true, limit: 200 }, overrides).length;
  const inboxSummary = options.include_inbox ? summarizeInbox(instance.id, overrides) : undefined;
  const inboxEntries = options.include_inbox && options.verbose ? listInboxEntries(instance.id, { limit: options.inbox_limit ?? 20 }, overrides) : undefined;
  const prompt = options.include_prompt ? renderPrompt(instance.prompt_overrides[step.id] ?? instance.prompt_snapshots[step.id] ?? '', instance) : undefined;
  const progress = buildProgress(instance, template);
  const risk = buildRisk(!inspection.can_advance, validationFailures, inboxSummary?.blocking ?? 0, inboxSummary?.high ?? 0);

  return {
    instance: {
      id: instance.id,
      template: instance.template,
      status: instance.status,
      current_step: instance.current_step,
      version: instance.version,
    },
    current_step: { id: step.id, name: step.name, checkpoint: options.verbose ? step.checkpoint : undefined },
    progress,
    risk,
    ...(prompt !== undefined ? { prompt } : {}),
    outputs: inspection,
    checkpoint: { readiness: inspection.readiness, can_advance: inspection.can_advance, blocking_reasons: inspection.blocking_reasons },
    ...(recentEvents ? { recent_events: recentEvents } : {}),
    ...(inboxSummary ? { inbox: { ...inboxSummary, ...(inboxEntries ? { entries: inboxEntries } : {}) } } : {}),
    suggested_actions: suggestedActions(inspection, inboxSummary?.action_required ?? 0, inboxSummary?.blocking ?? 0, validationFailures > 0),
    warnings: inspection.optional_missing.map(key => `Optional output missing: ${key}`),
  };
}

function templateForInstance(instance: WorkflowInstance): WorkflowTemplate {
  return instance.template_snapshot;
}

function findStep(template: WorkflowTemplate, stepId: string): WorkflowStep {
  const step = template.steps.find(candidate => candidate.id === stepId);
  if (!step) throw new Error(`Step not found in template ${template.name}: ${stepId}`);
  return step;
}

function buildProgress(instance: WorkflowInstance, template: WorkflowTemplate): DashboardProgress {
  const total = template.steps.length;
  const completed = template.steps.filter(step => instance.steps[step.id]?.status === 'done').length;
  const currentIndex = Math.max(0, template.steps.findIndex(step => step.id === instance.current_step)) + 1;
  return { total_steps: total, completed_steps: completed, current_index: currentIndex, percent: total ? Math.round((completed / total) * 100) : 0 };
}

function buildRisk(checkpointBlocked: boolean, validationFailures: number, inboxBlocking: number, inboxHigh: number): DashboardRisk {
  let level: SuggestedActionRisk = 'low';
  if (checkpointBlocked || validationFailures > 0 || inboxHigh > 0) level = 'medium';
  if (inboxBlocking > 0) level = 'blocking';
  return { level, checkpoint_blocked: checkpointBlocked, validation_failures: validationFailures, inbox_blocking: inboxBlocking, inbox_high: inboxHigh };
}

function suggestedActions(inspection: { missing_required: string[]; missing_evidence: string[]; missing_approvals: string[]; can_advance: boolean }, inboxActionRequired: number, inboxBlocking: number, hasValidationFailure: boolean): SuggestedAction[] {
  const actions: SuggestedAction[] = [];
  for (const key of inspection.missing_required) actions.push(action('provide_output', `Complete required output: ${key}`, 'required output missing', 'workflow_advance', 'medium'));
  for (const key of inspection.missing_evidence) actions.push(action('provide_evidence', `Attach required evidence: ${key}`, 'required evidence missing', 'workflow_advance', 'medium'));
  for (const key of inspection.missing_approvals) actions.push(action('provide_approval', `Collect required approval: ${key}`, 'required approval missing', 'workflow_advance', 'medium'));
  if (inboxActionRequired > 0) actions.push(action('review_inbox', `Resolve ${inboxActionRequired} inbox item(s)`, 'inbox has action_required items', 'workflow_inbox_list', inboxBlocking > 0 ? 'blocking' : 'high'));
  if (hasValidationFailure) actions.push(action('review_validation_failure', 'Review validation failure before advancing', 'recent validation failures exist', 'workflow_events', 'medium'));
  if (actions.length === 0 && inspection.can_advance) actions.push(action('advance_workflow', 'Ready to advance workflow', 'no blocking checkpoint or inbox issue detected', 'workflow_advance', 'low'));
  return actions;
}

function action(actionType: string, title: string, reason: string, toolHint: string, risk: SuggestedActionRisk): SuggestedAction {
  return { action_type: actionType, title, reason, tool_hint: toolHint, risk };
}
