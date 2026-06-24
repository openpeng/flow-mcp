import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createTemplate } from './template-store.js';
import { advanceWorkflow, startWorkflow } from './workflow-engine.js';
import { buildWorklog } from './worklog-engine.js';

function tempConfig() {
  const homeDir = mkdtempSync(join(tmpdir(), 'oflow-worklog-'));
  return { homeDir, flowsDir: join(homeDir, 'flows'), dataDir: join(homeDir, 'instances') };
}

test('worklog includes timeline summaries and validation failures', () => {
  const config = tempConfig();
  try {
    createTemplate({
      name: 'worklog-demo',
      description: 'Worklog demo',
      params: {},
      steps: [{ id: 'verify', name: 'Verify', checkpoint: { required_outputs: ['summary'] }, next: null }],
      prompts: { verify: 'verify' },
    }, config);
    const started = startWorkflow('worklog-demo', {}, undefined, config);
    assert.throws(() => advanceWorkflow(started.instance.id, {}, {}, config), /Checkpoint validation failed/);
    advanceWorkflow(started.instance.id, { summary: 'x'.repeat(300) }, {}, config);

    const worklog = buildWorklog(started.instance.id, {}, config);
    assert.match(worklog.markdown, /Validation Failures/);
    assert.match(worklog.markdown, /step.validation_failed/);
    assert.match(worklog.markdown, /…/);
    assert.equal(worklog.summary.completed_steps, 1);
    assert.equal(worklog.summary.failed_validations, 1);

    const summary = buildWorklog(started.instance.id, { mode: 'summary' }, config);
    assert.match(summary.markdown, /Worklog Summary/);
    const written = buildWorklog(started.instance.id, { mode: 'handoff', write_file: true, path: 'worklogs/custom.md' }, config);
    assert.match(written.path ?? '', /custom\.md$/);
  } finally {
    rmSync(config.homeDir, { recursive: true, force: true });
  }
});
