import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createTemplate } from './template-store.js';
import { advanceWorkflow, getCurrent, startWorkflow } from './workflow-engine.js';
import { loadInstance } from './instance-store.js';
import { readEvents } from './event-log.js';

function tempConfig() {
  const homeDir = mkdtempSync(join(tmpdir(), 'oflow-workflow-'));
  return { homeDir, flowsDir: join(homeDir, 'flows'), dataDir: join(homeDir, 'instances') };
}

function createDemo(config: ReturnType<typeof tempConfig>) {
  createTemplate({
    name: 'demo',
    description: 'Demo template',
    params: { change_name: { type: 'string', required: true } },
    steps: [
      {
        id: 'analyze',
        name: 'Analyze',
        checkpoint: {
          required_outputs: { analysis_summary: { type: 'string', min_length: 5 } },
          conditions: [{ natural: 'analysis complete', check: 'outputs.analysis_summary != null AND len(outputs.analysis_summary) > 5' }],
        },
        next: 'done',
      },
      {
        id: 'done',
        name: 'Done',
        checkpoint: { required_outputs: ['verification_result'] },
        next: null,
      },
    ],
    prompts: {
      analyze: 'Analyze {{change_name}}',
      done: 'Verify {{steps.analyze.outputs.analysis_summary}}',
    },
  }, config);
}

test('workflow full lifecycle completes', () => {
  const config = tempConfig();
  try {
    createDemo(config);
    const started = startWorkflow('demo', { change_name: 'feature' }, 'feature-run', config);
    assert.equal(started.step.id, 'analyze');
    assert.match(started.prompt, /feature/);
    assert.equal(started.instance.version, 1);
    assert.equal(started.instance.template_snapshot.name, 'demo');
    assert.equal(started.instance.prompt_snapshots.analyze, 'Analyze {{change_name}}');

    const advanced = advanceWorkflow(started.instance.id, { analysis_summary: 'analysis is complete' }, {}, config);
    assert.equal(advanced.completed, false);
    assert.match(advanced.next_prompt ?? '', /analysis is complete/);

    const completed = advanceWorkflow(started.instance.id, { verification_result: 'pass' }, {}, config);
    assert.equal(completed.completed, true);
    assert.equal(loadInstance(started.instance.id, config).status, 'completed');
    assert.deepEqual(readEvents(started.instance.id, config).map(event => event.type), [
      'workflow.started',
      'step.started',
      'step.completed',
      'step.started',
      'step.completed',
      'workflow.completed',
    ]);
  } finally {
    rmSync(config.homeDir, { recursive: true, force: true });
  }
});

test('validation failure does not mutate state', () => {
  const config = tempConfig();
  try {
    createDemo(config);
    const started = startWorkflow('demo', { change_name: 'feature' }, undefined, config);
    assert.throws(() => advanceWorkflow(started.instance.id, {}, {}, config), /Checkpoint validation failed/);
    const current = getCurrent(started.instance.id, config);
    assert.equal(current.step.id, 'analyze');
    assert.equal(current.instance.steps.analyze.status, 'in_progress');
    assert.equal(readEvents(started.instance.id, config).some(event => event.type === 'step.validation_failed'), true);
  } finally {
    rmSync(config.homeDir, { recursive: true, force: true });
  }
});

test('running instances use template and prompt snapshots after template deletion', () => {
  const config = tempConfig();
  try {
    createDemo(config);
    const started = startWorkflow('demo', { change_name: 'feature' }, undefined, config);
    rmSync(config.flowsDir, { recursive: true, force: true });
    const current = getCurrent(started.instance.id, config);
    assert.equal(current.step.id, 'analyze');
    assert.match(current.prompt, /feature/);
    const advanced = advanceWorkflow(started.instance.id, { analysis_summary: 'analysis is complete' }, {}, config);
    assert.match(advanced.next_prompt ?? '', /analysis is complete/);
  } finally {
    rmSync(config.homeDir, { recursive: true, force: true });
  }
});

test('advanceWorkflow blocks on missing required evidence and approval', () => {
  const config = tempConfig();
  try {
    createTemplate({
      name: 'approval-demo',
      description: 'Approval demo',
      params: {},
      steps: [{
        id: 'verify',
        name: 'Verify',
        checkpoint: {
          required_outputs: ['summary'],
          evidence: [{ key: 'test_log', required: true }],
          approvals: [{ key: 'user_confirmed', required: true }],
        },
        next: null,
      }],
      prompts: { verify: 'verify' },
    }, config);
    const started = startWorkflow('approval-demo', {}, undefined, config);
    assert.throws(() => advanceWorkflow(started.instance.id, { summary: 'ok' }, {}, config), /Checkpoint validation failed/);
    assert.equal(loadInstance(started.instance.id, config).steps.verify.status, 'in_progress');
    assert.equal(readEvents(started.instance.id, config).some(event => event.type === 'step.validation_failed'), true);

    const completed = advanceWorkflow(started.instance.id, { summary: 'ok' }, {
      evidence: { test_log: 'passed' },
      approvals: { user_confirmed: true },
    }, config);
    assert.equal(completed.completed, true);
  } finally {
    rmSync(config.homeDir, { recursive: true, force: true });
  }
});
