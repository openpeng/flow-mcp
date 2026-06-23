import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { listInboxEntries, markInboxEntries, saveInboxEntries, summarizeInbox } from './inbox-store.js';

function tempConfig() {
  const homeDir = mkdtempSync(join(tmpdir(), 'oflow-inbox-'));
  return { homeDir, flowsDir: join(homeDir, 'flows'), dataDir: join(homeDir, 'instances') };
}

const instanceId = 'wf_20260101000000_abc123';

test('inbox save list mark and summary', () => {
  const config = tempConfig();
  try {
    const saved = saveInboxEntries(instanceId, [{
      source: 'manual',
      type: 'comment',
      title: 'Review needed',
      summary: 'Please review',
      action_required: true,
      timestamp: '2026-01-01T00:00:00.000Z',
    }], config);
    assert.equal(saved.saved_count, 1);
    assert.equal(listInboxEntries(instanceId, { status: 'new' }, config).length, 1);
    assert.equal(summarizeInbox(instanceId, config).action_required, 1);

    const marked = markInboxEntries(instanceId, [saved.entries[0].id], 'acted', config);
    assert.equal(marked.updated_count, 1);
    assert.equal(summarizeInbox(instanceId, config).action_required, 0);
  } finally {
    rmSync(config.homeDir, { recursive: true, force: true });
  }
});

test('inbox deduplicates by external id and fallback key', () => {
  const config = tempConfig();
  try {
    const first = saveInboxEntries(instanceId, [{ source: 'git', type: 'comment', title: 'Same', summary: '1', external_id: 'x1' }], config);
    const duplicate = saveInboxEntries(instanceId, [{ source: 'git', type: 'comment', title: 'Same', summary: '2', external_id: 'x1' }], config);
    assert.equal(first.saved_count, 1);
    assert.equal(duplicate.duplicate_count, 1);

    saveInboxEntries(instanceId, [{ source: 'ci', type: 'failure', title: 'Build failed', summary: '1', timestamp: '2026-01-01T01:00:00.000Z' }], config);
    const fallbackDuplicate = saveInboxEntries(instanceId, [{ source: 'ci', type: 'failure', title: 'Build failed', summary: '2', timestamp: '2026-01-01T02:00:00.000Z' }], config);
    assert.equal(fallbackDuplicate.duplicate_count, 1);
    assert.equal(listInboxEntries(instanceId, {}, config).length, 2);
  } finally {
    rmSync(config.homeDir, { recursive: true, force: true });
  }
});
