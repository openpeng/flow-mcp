import test from 'node:test';
import assert from 'node:assert/strict';
import { interpolate, renderPrompt } from './prompt-engine.js';
import type { WorkflowInstance } from '../types.js';

test('interpolate replaces params and keeps unresolved placeholders', () => {
  assert.equal(interpolate('hello {{name}} {{missing}}', { name: 'oflow' }), 'hello oflow {{missing}}');
});

test('renderPrompt can read historical step outputs', () => {
  const instance: WorkflowInstance = {
    id: 'wf_test',
    template: 'basic-dev',
    params: { change_name: 'demo' },
    status: 'active',
    current_step: 'design',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    steps: {
      analyze: { status: 'done', outputs: { analysis_summary: 'analysis ok' } },
      design: { status: 'in_progress' },
    },
    prompt_overrides: {},
  };

  assert.equal(
    renderPrompt('{{change_name}} / {{steps.analyze.outputs.analysis_summary}}', instance),
    'demo / analysis ok',
  );
});
