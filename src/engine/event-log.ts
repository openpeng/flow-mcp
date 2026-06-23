import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getConfig, type ConfigOverrides } from '../config.js';
import type { WorkflowEvent, WorkflowEventType } from '../types.js';
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

function isWorkflowEvent(value: Partial<WorkflowEvent>): value is WorkflowEvent {
  return typeof value.id === 'string'
    && typeof value.instance_id === 'string'
    && typeof value.type === 'string'
    && typeof value.timestamp === 'string';
}
