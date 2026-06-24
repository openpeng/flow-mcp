import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { WorkflowEvent } from '../types.js';
import { queryEvents, readEvents, recordEvent } from './event-log.js';

function tempConfig() {
  const homeDir = mkdtempSync(join(tmpdir(), 'oflow-events-'));
  return { homeDir, flowsDir: join(homeDir, 'flows'), dataDir: join(homeDir, 'instances') };
}

test('recordEvent rejects invalid step ids', () => {
  const config = tempConfig();
  try {
    assert.throws(() => recordEvent('step.started', 'wf_20260101000000_abc123', {}, '../bad', config), /INVALID_STEP_ID/);
  } finally {
    rmSync(config.homeDir, { recursive: true, force: true });
  }
});

test('readEvents skips malformed event lines and keeps valid events', () => {
  const config = tempConfig();
  try {
    const instanceId = 'wf_20260101000000_abc123';
    recordEvent('workflow.started', instanceId, { ok: true }, undefined, config);
    appendFileSync(join(config.dataDir, 'events', `${instanceId}.jsonl`), '{bad json\n{"id":"evt_bad"}\n', 'utf-8');
    const events = readEvents(instanceId, config);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'workflow.started');
  } finally {
    rmSync(config.homeDir, { recursive: true, force: true });
  }
});

test('queryEvents filters by type and step id with limit bounds', () => {
  const config = tempConfig();
  try {
    const instanceId = 'wf_20260101000000_abc123';
    recordEvent('workflow.started', instanceId, {}, undefined, config);
    recordEvent('step.started', instanceId, {}, 'one', config);
    recordEvent('step.completed', instanceId, {}, 'one', config);
    recordEvent('step.started', instanceId, {}, 'two', config);

    assert.deepEqual(queryEvents(instanceId, { type: 'step.started' }, config).map(event => event.step_id), ['one', 'two']);
    assert.deepEqual(queryEvents(instanceId, { step_id: 'one' }, config).map(event => event.type), ['step.started', 'step.completed']);
    assert.deepEqual(queryEvents(instanceId, { limit: 2 }, config).map(event => event.type), ['step.completed', 'step.started']);
    assert.throws(() => queryEvents(instanceId, { limit: 0 }, config), /INVALID_ARGUMENT/);
  } finally {
    rmSync(config.homeDir, { recursive: true, force: true });
  }
});

test('queryEvents supports time filters failures and payload controls', () => {
  const config = tempConfig();
  try {
    const instanceId = 'wf_20260101000000_abc123';
    recordEvent('workflow.started', instanceId, { outputs: { raw: 'secret' } }, undefined, config);
    recordEvent('step.validation_failed', instanceId, { errors: [{ message: 'bad' }] }, 'one', config);
    const path = join(config.dataDir, 'events', `${instanceId}.jsonl`);
    const events = readFileSync(path, 'utf-8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as WorkflowEvent);
    events[0].timestamp = '2026-01-01T00:00:00.000Z';
    events[1].timestamp = '2026-01-02T00:00:00.000Z';
    writeFileSync(path, `${events.map(event => JSON.stringify(event)).join('\n')}\n`, 'utf-8');

    assert.deepEqual(queryEvents(instanceId, { since: '2026-01-01T12:00:00.000Z', include_payload: true }, config).map(event => event.type), ['step.validation_failed']);
    assert.deepEqual(queryEvents(instanceId, { only_failures: true, include_payload: true }, config).map(event => event.type), ['step.validation_failed']);
    assert.equal(queryEvents(instanceId, { include_payload: false }, config)[0].payload, undefined);
    assert.deepEqual(queryEvents(instanceId, { summary: true }, config)[0].payload, { outputs: { output_keys: ['raw'], outputs_preview: { raw: 'secret' } } });
  } finally {
    rmSync(config.homeDir, { recursive: true, force: true });
  }
});
