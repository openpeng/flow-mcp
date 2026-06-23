import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createTemplate, listTemplates, loadPrompt, loadTemplate } from './template-store.js';

function tempConfig() {
  const homeDir = mkdtempSync(join(tmpdir(), 'oflow-template-'));
  return { homeDir, flowsDir: join(homeDir, 'flows'), dataDir: join(homeDir, 'instances') };
}

test('create, list, load template and prompt', () => {
  const config = tempConfig();
  try {
    createTemplate({
      name: 'demo',
      description: 'Demo template',
      params: { change_name: { type: 'string', required: true } },
      steps: [{ id: 'one', name: 'One', next: null }],
      prompts: { one: 'hello {{change_name}}' },
    }, config);

    assert.equal(listTemplates(config)[0].name, 'demo');
    assert.equal(loadTemplate('demo', config).steps[0].id, 'one');
    assert.equal(loadPrompt('demo', 'one', config), 'hello {{change_name}}');
  } finally {
    rmSync(config.homeDir, { recursive: true, force: true });
  }
});

test('createTemplate rejects broken next references', () => {
  const config = tempConfig();
  try {
    assert.throws(() => createTemplate({
      name: 'bad',
      description: 'Bad template',
      params: {},
      steps: [{ id: 'one', name: 'One', next: 'missing' }],
      prompts: { one: 'prompt' },
    }, config), /missing step/);
  } finally {
    rmSync(config.homeDir, { recursive: true, force: true });
  }
});

test('createTemplate rejects path traversal names and step ids', () => {
  const config = tempConfig();
  try {
    assert.throws(() => createTemplate({
      name: '../../evil',
      description: 'Bad template',
      params: {},
      steps: [{ id: 'one', name: 'One', next: null }],
      prompts: { one: 'prompt' },
    }, config), /INVALID_TEMPLATE_NAME/);

    assert.throws(() => createTemplate({
      name: 'bad-step',
      description: 'Bad step',
      params: {},
      steps: [{ id: '../one', name: 'One', next: null }],
      prompts: { '../one': 'prompt' },
    }, config), /INVALID_STEP_ID/);
  } finally {
    rmSync(config.homeDir, { recursive: true, force: true });
  }
});
