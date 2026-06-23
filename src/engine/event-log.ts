import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getConfig, type ConfigOverrides } from '../config.js';
import type { WorkflowEvent, WorkflowEventType } from '../types.js';
import { assertInstanceId, safeJoin } from './security.js';

function eventsDir(overrides: ConfigOverrides = {}): string {
  return safeJoin(getConfig(overrides).dataDir, 'events');
}

function eventPath(instanceId: string, overrides: ConfigOverrides = {}): string {
  assertInstanceId(instanceId);
  return safeJoin(eventsDir(overrides), `${instanceId}.jsonl`);
}

export function newEvent(type: WorkflowEventType, instanceId: string, payload?: unknown, stepId?: string): WorkflowEvent {
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
  return readFileSync(path, 'utf-8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line) as WorkflowEvent);
}
