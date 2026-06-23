import type { ConfigOverrides } from '../config.js';
import type { WorkflowDashboardResult, WorkflowInstance, WorkflowStep, WorkflowTemplate } from '../types.js';
import { queryEvents } from './event-log.js';
import { inspectCheckpoint } from './checkpoint-inspector.js';
import { summarizeInbox, listInboxEntries } from './inbox-store.js';
import { summarizeOutputs } from './limits.js';
import { renderPrompt } from './prompt-engine.js';
import { listInstances, resolveInstance } from './instance-store.js';

export interface DashboardOptions {
  include_prompt?: boolean;
  include_recent_events?: boolean;
  include_inbox?: boolean;
  event_limit?: number;
  inbox_limit?: number;
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
    ? queryEvents(instance.id, { limit: options.event_limit }, overrides).map(summarizeEvent)
    : undefined;
  const inboxSummary = options.include_inbox ? summarizeInbox(instance.id, overrides) : undefined;
  const inboxEntries = options.include_inbox ? listInboxEntries(instance.id, { limit: options.inbox_limit ?? 20 }, overrides) : undefined;
  const prompt = options.include_prompt ? renderPrompt(instance.prompt_overrides[step.id] ?? instance.prompt_snapshots[step.id] ?? '', instance) : undefined;

  return {
    instance: {
      id: instance.id,
      template: instance.template,
      status: instance.status,
      current_step: instance.current_step,
      version: instance.version,
    },
    current_step: { id: step.id, name: step.name, checkpoint: step.checkpoint },
    ...(prompt !== undefined ? { prompt } : {}),
    outputs: inspection,
    checkpoint: { can_advance: inspection.can_advance, blocking_reasons: inspection.blocking_reasons },
    ...(recentEvents ? { recent_events: recentEvents } : {}),
    ...(inboxSummary ? { inbox: { ...inboxSummary, ...(inboxEntries ? { entries: inboxEntries } : {}) } } : {}),
    suggested_actions: suggestedActions(inspection, inboxSummary?.action_required ?? 0, recentEvents?.some(event => event.type === 'step.validation_failed') ?? false),
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

function summarizeEvent<T extends { payload?: unknown }>(event: T): T {
  if (!event.payload || typeof event.payload !== 'object') return event;
  const payload = event.payload as Record<string, unknown>;
  if (!('outputs' in payload)) return event;
  return { ...event, payload: { ...payload, outputs: summarizeOutputs(payload.outputs as Record<string, unknown>) } };
}

function suggestedActions(inspection: { blocking_reasons: string[]; can_advance: boolean }, inboxActionRequired: number, hasValidationFailure: boolean): string[] {
  const actions = [...inspection.blocking_reasons];
  if (inboxActionRequired > 0) actions.push(`Resolve ${inboxActionRequired} inbox item(s)`);
  if (hasValidationFailure) actions.push('Review validation failure before advancing');
  if (actions.length === 0 && inspection.can_advance) actions.push('Ready to advance workflow');
  return actions;
}
