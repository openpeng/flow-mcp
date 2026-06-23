import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createTemplate } from './template-store.js';
import { startWorkflow } from './workflow-engine.js';
import { buildDashboard } from './dashboard-engine.js';
import { saveInboxEntries } from './inbox-store.js';

function tempConfig() {
  const homeDir = mkdtempSync(join(tmpdir(), 'oflow-dashboard-'));
  return { homeDir, flowsDir: join(homeDir, 'flows'), dataDir: join(homeDir, 'instances') };
}

function createDashboardTemplate(config: ReturnType<typeof tempConfig>) {
  createTemplate({
    name: 'dashboard-demo',
    description: 'Dashboard demo',
    params: { change_name: { type: 'string', required: true } },
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
    prompts: { verify: 'verify {{change_name}}' },
  }, config);
}

test('dashboard shows blockers, prompt, inbox, and suggested actions', () => {
  const config = tempConfig();
  try {
    createDashboardTemplate(config);
    const started = startWorkflow('dashboard-demo', { change_name: 'demo' }, undefined, config);
    saveInboxEntries(started.instance.id, [{ source: 'manual', type: 'comment', title: 'Need review', summary: 'Review', action_required: true }], config);

    const dashboard = buildDashboard(started.instance.id, { include_prompt: true, include_inbox: true, include_recent_events: true }, config);
    assert.match(dashboard.prompt ?? '', /demo/);
    assert.equal(dashboard.checkpoint.can_advance, false);
    assert.deepEqual(dashboard.outputs.missing_required, ['summary']);
    assert.deepEqual(dashboard.outputs.missing_evidence, ['test_log']);
    assert.deepEqual(dashboard.outputs.missing_approvals, ['user_confirmed']);
    assert.equal(dashboard.inbox?.action_required, 1);
    assert.equal(dashboard.suggested_actions.some(action => action.includes('test_log')), true);
  } finally {
    rmSync(config.homeDir, { recursive: true, force: true });
  }
});
