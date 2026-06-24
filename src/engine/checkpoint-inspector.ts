import type { CheckpointInspectionResult, RequiredOutput, RequiredOutputDef, WorkflowInstance, WorkflowStep } from '../types.js';

export function inspectCheckpoint(instance: WorkflowInstance, step: WorkflowStep): CheckpointInspectionResult {
  const state = instance.steps[step.id];
  const outputs = state?.outputs ?? {};
  const completed = Object.keys(outputs);
  const required = requiredOutputKeys(step);
  const optional = Object.keys(step.checkpoint?.optional_outputs ?? {});
  const missingRequired = required.filter(key => !hasValue(outputs[key]));
  const optionalMissing = optional.filter(key => !hasValue(outputs[key]));
  const missingEvidence = (step.checkpoint?.evidence ?? [])
    .filter(def => def.required !== false)
    .map(def => def.key)
    .filter(key => !hasValue(outputs[key]));
  const missingApprovals = (step.checkpoint?.approvals ?? [])
    .filter(def => def.required !== false)
    .map(def => def.key)
    .filter(key => !isApproved(outputs[key]));
  const blockingReasons = [
    ...missingRequired.map(key => `Complete required output: ${key}`),
    ...missingEvidence.map(key => `Attach required evidence: ${key}`),
    ...missingApprovals.map(key => `Collect required approval: ${key}`),
  ];

  return {
    completed,
    missing_required: missingRequired,
    optional_missing: optionalMissing,
    missing_evidence: missingEvidence,
    missing_approvals: missingApprovals,
    can_advance: blockingReasons.length === 0,
    readiness: blockingReasons.length ? 'blocked' : optionalMissing.length ? 'warning' : 'ready',
    blocking_reasons: blockingReasons,
    suggestions: blockingReasons.length ? blockingReasons : ['Ready to advance workflow'],
  };
}

export function requiredOutputKeys(step: WorkflowStep): string[] {
  const required = step.checkpoint?.required_outputs ?? [];
  if (Array.isArray(required)) {
    return required.map(outputKey).filter((key): key is string => Boolean(key));
  }
  return Object.keys(required as Record<string, RequiredOutputDef>);
}

function outputKey(output: RequiredOutput): string | undefined {
  return typeof output === 'string' ? output : undefined;
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function isApproved(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'string') return ['true', 'approved', 'pass', 'yes', 'confirmed'].includes(value.toLowerCase());
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return record.approved === true || record.status === 'approved' || record.confirmed === true;
  }
  return false;
}
