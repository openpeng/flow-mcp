import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCheckExpression, validateCheckpoint } from './checkpoint-engine.js';
import type { WorkflowStep } from '../types.js';

const step: WorkflowStep = {
  id: 'analyze',
  name: 'Analyze',
  checkpoint: {
    required_outputs: {
      summary: { type: 'string', min_length: 5, pattern: '^hello' },
    },
    conditions: [
      { natural: 'summary produced', check: 'outputs.summary != null AND len(outputs.summary) > 5' },
    ],
  },
  next: null,
};

test('validateCheckpoint passes required outputs and check expressions', () => {
  const result = validateCheckpoint(step, { summary: 'hello world' }, []);
  assert.equal(result.ok, true);
});

test('validateCheckpoint reports missing outputs', () => {
  const result = validateCheckpoint(step, {}, []);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some(error => error.kind === 'required_output'), true);
});

test('evaluateCheckExpression supports OR and parentheses without eval', () => {
  const result = evaluateCheckExpression("(outputs.foo == null OR outputs.foo == 'bar') AND len(outputs.name) > 2", { name: 'demo' });
  assert.deepEqual(result, { ok: true, value: true });
});

test('evaluateCheckExpression fails closed for unsupported expressions', () => {
  const result = evaluateCheckExpression('process.exit()', {});
  assert.equal(result.ok, false);
});

test('validateCheckpoint requires evidence and approvals when declared', () => {
  const evidenceStep: WorkflowStep = {
    id: 'verify',
    name: 'Verify',
    checkpoint: {
      required_outputs: ['summary'],
      optional_outputs: { risk_notes: { type: 'string' } },
      evidence: [{ key: 'test_log', required: true, description: 'Test log' }],
      approvals: [{ key: 'user_confirmed', required: true, description: 'User confirmed' }],
    },
    next: null,
  };

  const missing = validateCheckpoint(evidenceStep, { summary: 'hello' }, [], {}, {});
  assert.equal(missing.ok, false);
  assert.equal(missing.errors.some(error => error.kind === 'evidence' && error.field === 'test_log'), true);
  assert.equal(missing.errors.some(error => error.kind === 'approval' && error.field === 'user_confirmed'), true);

  const passed = validateCheckpoint(evidenceStep, { summary: 'hello' }, [], { test_log: 'npm test passed' }, { user_confirmed: true });
  assert.equal(passed.ok, true);
});

test('validateCheckpoint does not block on missing optional outputs', () => {
  const optionalStep: WorkflowStep = {
    id: 'optional',
    name: 'Optional',
    checkpoint: { required_outputs: ['summary'], optional_outputs: { risk_notes: { type: 'string' } } },
    next: null,
  };
  assert.equal(validateCheckpoint(optionalStep, { summary: 'hello' }).ok, true);
});
