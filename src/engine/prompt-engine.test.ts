import test from 'node:test';
import assert from 'node:assert/strict';
import { interpolate, renderPrompt } from './prompt-engine.js';
import type { WorkflowInstance } from '../types.js';

test('interpolate replaces params and keeps unresolved placeholders', () => {
  assert.equal(interpolate('hello {{name}} {{missing}}', { name: 'oflow' }), 'hello oflow {{missing}}');
});

test('renderPrompt can read historical step outputs', () => {
  const template = {
    name: 'basic-dev',
    description: 'Basic dev',
    params: { change_name: { type: 'string', required: true } },
    steps: [
      { id: 'analyze', name: 'Analyze', next: 'design' },
      { id: 'design', name: 'Design', next: null },
    ],
  };
  const instance: WorkflowInstance = {
    id: 'wf_20260101000000_abc123',
    template: 'basic-dev',
    params: { change_name: 'demo' },
    status: 'active',
    current_step: 'design',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    steps: {
      analyze: { status: 'done', outputs: { analysis_summary: 'analysis ok' } },
      design: { status: 'in_progress' },
    },
    prompt_overrides: {},
    template_snapshot: template,
    prompt_snapshots: { analyze: 'analyze', design: 'design' },
  };

  assert.equal(
    renderPrompt('{{change_name}} / {{steps.analyze.outputs.analysis_summary}}', instance),
    'demo / analysis ok',
  );
});
