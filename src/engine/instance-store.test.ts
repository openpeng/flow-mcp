import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { bindAlias, listInstances, loadInstance, saveInstance } from './instance-store.js';
import type { WorkflowInstance } from '../types.js';

function tempConfig() {
  const homeDir = mkdtempSync(join(tmpdir(), 'oflow-instance-'));
  return { homeDir, flowsDir: join(homeDir, 'flows'), dataDir: join(homeDir, 'instances') };
}

function instance(id: string): WorkflowInstance {
  return {
    id,
    template: 'demo',
    params: {},
    status: 'active',
    current_step: 'one',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    steps: { one: { status: 'in_progress' } },
    prompt_overrides: {},
  };
}

test('save and load instance round trip', () => {
  const config = tempConfig();
  try {
    saveInstance(instance('wf_one'), config);
    assert.equal(loadInstance('wf_one', config).id, 'wf_one');
  } finally {
    rmSync(config.homeDir, { recursive: true, force: true });
  }
});

test('alias collision is rejected', () => {
  const config = tempConfig();
  try {
    saveInstance(instance('wf_one'), config);
    saveInstance(instance('wf_two'), config);
    bindAlias('wf_one', 'demo', config);
    assert.throws(() => bindAlias('wf_two', 'demo', config), /Alias already bound/);
  } finally {
    rmSync(config.homeDir, { recursive: true, force: true });
  }
});

test('listInstances skips corrupted JSON with warning', () => {
  const config = tempConfig();
  try {
    saveInstance(instance('wf_one'), config);
    writeFileSync(join(config.dataDir, 'broken.json'), '{bad json', 'utf-8');
    const result = listInstances({ status: 'all' }, config);
    assert.equal(result.instances.length, 1);
    assert.equal(result.warnings.length, 1);
  } finally {
    rmSync(config.homeDir, { recursive: true, force: true });
  }
});
