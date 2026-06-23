import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTemplateControlPlane } from './template-validator.js';
import type { WorkflowTemplate } from '../types.js';

test('validateTemplateControlPlane reports unreachable steps and duplicate keys', () => {
  const template: WorkflowTemplate = {
    name: 'bad',
    description: 'Bad',
    params: {},
    steps: [
      { id: 'one', name: 'One', next: null },
      { id: 'two', name: 'Two', checkpoint: { evidence: [{ key: 'log' }, { key: 'log' }], approvals: [{ key: 'ok' }, { key: 'ok' }] }, next: null },
    ],
  };
  const result = validateTemplateControlPlane(template, { one: 'ok', two: 'ok' });
  assert.equal(result.valid, false);
  assert.equal(result.errors.some(error => error.code === 'UNREACHABLE_STEP' && error.step_id === 'two'), true);
  assert.equal(result.errors.some(error => error.code === 'DUPLICATE_EVIDENCE_KEY'), true);
  assert.equal(result.errors.some(error => error.code === 'DUPLICATE_APPROVAL_KEY'), true);
});

test('validateTemplateControlPlane reports invalid expressions and prompt refs', () => {
  const template: WorkflowTemplate = {
    name: 'badrefs',
    description: 'Bad refs',
    params: { known: { type: 'string', required: true } },
    steps: [
      { id: 'one', name: 'One', checkpoint: { conditions: [{ check: 'process.exit()' }] }, next: null },
    ],
  };
  const result = validateTemplateControlPlane(template, { one: '{{missing}} {{steps.two.outputs.value}}' });
  assert.equal(result.valid, false);
  assert.equal(result.errors.some(error => error.code === 'INVALID_CHECKPOINT_EXPRESSION'), true);
  assert.equal(result.errors.some(error => error.code === 'UNDECLARED_PARAM_REFERENCE'), true);
  assert.equal(result.errors.some(error => error.code === 'NONEXISTENT_STEP_REFERENCE'), true);
});
