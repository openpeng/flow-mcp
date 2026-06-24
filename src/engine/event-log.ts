import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getConfig, type ConfigOverrides } from '../config.js';
import type { WorkflowEvent, WorkflowEventType, WorkflowEventsQuery } from '../types.js';
import { summarizeOutputs } from './limits.js';
import { assertInstanceId, assertStepId, safeJoin } from './security.js';

function eventsDir(overrides: ConfigOverrides = {}): string {
  return safeJoin(getConfig(overrides).dataDir, 'events');
}

function eventPath(instanceId: string, overrides: ConfigOverrides = {}): string {
  assertInstanceId(instanceId);
  return safeJoin(eventsDir(overrides), `${instanceId}.jsonl`);
}

export function newEvent(type: WorkflowEventType, instanceId: string, payload?: unknown, stepId?: string): WorkflowEvent {
  assertInstanceId(instanceId);
  if (stepId) assertStepId(stepId);
  return {
    id: `evt_${uuidv4().slice(0, 12)}`,
    instance_id: instanceId,
    type,
    timestamp: new Date().toISOString(),
    ...(stepId ? { step_id: stepId } : {}),
    ...(payload !== undefined ? { payload } : {}),
  };
}

export function appendEvent(event: WorkflowEvent, overrides: ConfigOverrides = {}): void {
  const path = eventPath(event.instance_id, overrides);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(event)}\n`, 'utf-8');
}

export function recordEvent(type: WorkflowEventType, instanceId: string, payload?: unknown, stepId?: string, overrides: ConfigOverrides = {}): WorkflowEvent {
  const event = newEvent(type, instanceId, payload, stepId);
  appendEvent(event, overrides);
  return event;
}

export function readEvents(instanceId: string, overrides: ConfigOverrides = {}): WorkflowEvent[] {
  const path = eventPath(instanceId, overrides);
  if (!existsSync(path)) return [];
  const events: WorkflowEvent[] = [];
  for (const line of readFileSync(path, 'utf-8').split(/\r?\n/).filter(Boolean)) {
    try {
      const event = JSON.parse(line) as Partial<WorkflowEvent>;
      if (isWorkflowEvent(event)) events.push(event);
    } catch {
      // Skip malformed audit lines so one bad record does not hide the rest.
    }
  }
  return events;
}

export function queryEvents(instanceId: string, query: WorkflowEventsQuery = {}, overrides: ConfigOverrides = {}): WorkflowEvent[] {
  if (query.step_id) assertStepId(query.step_id);
  const limit = normalizeLimit(query.limit);
  const since = parseOptionalDate(query.since, 'since');
  const until = parseOptionalDate(query.until, 'until');
  const events = readEvents(instanceId, overrides)
    .filter(event => !query.type || event.type === query.type)
    .filter(event => !query.only_failures || event.type === 'step.validation_failed')
    .filter(event => !query.step_id || event.step_id === query.step_id)
    .filter(event => !since || new Date(event.timestamp).getTime() >= since)
    .filter(event => !until || new Date(event.timestamp).getTime() <= until);
  return events.slice(-limit).map(event => summarizeEvent(event, query));
}

function summarizeEvent(event: WorkflowEvent, query: WorkflowEventsQuery): WorkflowEvent {
  if (query.include_payload) return event;
  if (!event.payload) return event;
  if (!query.summary) return { ...event, payload: undefined };
  return { ...event, payload: summarizePayload(event.payload) };
}

function summarizePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const record = payload as Record<string, unknown>;
  if ('outputs' in record && record.outputs && typeof record.outputs === 'object') {
    return { ...record, outputs: summarizeOutputs(record.outputs as Record<string, unknown>) };
  }
  if ('errors' in record) return { errors: record.errors };
  return { keys: Object.keys(record) };
}

function parseOptionalDate(value: string | undefined, key: string): number | undefined {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) throw new Error(`INVALID_ARGUMENT: ${key} must be an ISO timestamp`);
  return time;
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return 50;
  if (!Number.isFinite(limit) || limit < 1) throw new Error('INVALID_ARGUMENT: limit must be a positive number');
  return Math.min(Math.floor(limit), 200);
}

function isWorkflowEvent(value: Partial<WorkflowEvent>): value is WorkflowEvent {
  return typeof value.id === 'string'
    && typeof value.instance_id === 'string'
    && typeof value.type === 'string'
    && typeof value.timestamp === 'string';
}
