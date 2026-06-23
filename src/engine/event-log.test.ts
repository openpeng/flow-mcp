import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readEvents, recordEvent } from './event-log.js';

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
