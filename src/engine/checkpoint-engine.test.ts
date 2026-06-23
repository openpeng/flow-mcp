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
