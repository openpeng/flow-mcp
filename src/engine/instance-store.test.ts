import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { bindAlias, listInstances, loadInstance, saveInstance } from './instance-store.js';
import type { WorkflowInstance } from '../types.js';

function tempConfig() {
  const homeDir = mkdtempSync(join(tmpdir(), 'oflow-instance-'));
  return { homeDir, flowsDir: join(homeDir, 'flows'), dataDir: join(homeDir, 'instances') };
}

function instance(id: string): WorkflowInstance {
  const template = {
    name: 'demo',
    description: 'Demo template',
    params: {},
    steps: [{ id: 'one', name: 'One', next: null }],
  };
  return {
    id,
    template: 'demo',
    params: {},
    status: 'active',
    current_step: 'one',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    steps: { one: { status: 'in_progress' } },
    prompt_overrides: {},
    template_snapshot: template,
    prompt_snapshots: { one: 'prompt' },
  };
}

test('save and load instance round trip', () => {
  const config = tempConfig();
  try {
    saveInstance(instance('wf_20260101000000_abc123'), config);
    assert.equal(loadInstance('wf_20260101000000_abc123', config).id, 'wf_20260101000000_abc123');
  } finally {
    rmSync(config.homeDir, { recursive: true, force: true });
  }
});

test('alias collision is rejected', () => {
  const config = tempConfig();
  try {
    saveInstance(instance('wf_20260101000000_abc123'), config);
    saveInstance(instance('wf_20260101000001_def456'), config);
    bindAlias('wf_20260101000000_abc123', 'demo', config);
    assert.throws(() => bindAlias('wf_20260101000001_def456', 'demo', config), /Alias already bound/);
  } finally {
    rmSync(config.homeDir, { recursive: true, force: true });
  }
});

test('listInstances skips corrupted JSON with warning', () => {
  const config = tempConfig();
  try {
    saveInstance(instance('wf_20260101000000_abc123'), config);
    writeFileSync(join(config.dataDir, 'broken.json'), '{bad json', 'utf-8');
    const result = listInstances({ status: 'all' }, config);
    assert.equal(result.instances.length, 1);
    assert.equal(result.warnings.length, 1);
  } finally {
    rmSync(config.homeDir, { recursive: true, force: true });
  }
});

test('saveInstance rejects stale versions', () => {
  const config = tempConfig();
  try {
    const saved = saveInstance(instance('wf_20260101000000_abc123'), config);
    const stale = { ...saved, updated_at: '2026-01-01T00:01:00.000Z' };
    const fresh = { ...saved, updated_at: '2026-01-01T00:02:00.000Z' };
    saveInstance(fresh, config, { expectedVersion: saved.version });
    assert.throws(() => saveInstance(stale, config, { expectedVersion: saved.version }), /INSTANCE_VERSION_CONFLICT/);
    assert.equal(loadInstance(saved.id, config).updated_at, '2026-01-01T00:02:00.000Z');
  } finally {
    rmSync(config.homeDir, { recursive: true, force: true });
  }
});

test('instance id and alias path traversal inputs are rejected', () => {
  const config = tempConfig();
  try {
    saveInstance(instance('wf_20260101000000_abc123'), config);
    assert.throws(() => loadInstance('../../evil', config), /INVALID_INSTANCE_ID/);
    assert.throws(() => bindAlias('wf_20260101000000_abc123', '../bad', config), /INVALID_ALIAS/);
  } finally {
    rmSync(config.homeDir, { recursive: true, force: true });
  }
});

test('reserved Windows aliases are rejected', () => {
  const config = tempConfig();
  try {
    saveInstance(instance('wf_20260101000000_abc123'), config);
    assert.throws(() => bindAlias('wf_20260101000000_abc123', 'CON', config), /INVALID_ALIAS/);
  } finally {
    rmSync(config.homeDir, { recursive: true, force: true });
  }
});

test('saveInstance rejects updates while instance lock exists', () => {
  const config = tempConfig();
  try {
    saveInstance(instance('wf_20260101000000_abc123'), config);
    mkdirSync(join(config.dataDir, 'wf_20260101000000_abc123.lock'));
    assert.throws(() => saveInstance(instance('wf_20260101000000_abc123'), config, { expectedVersion: 1 }), /INSTANCE_LOCKED/);
  } finally {
    rmSync(config.homeDir, { recursive: true, force: true });
  }
});
