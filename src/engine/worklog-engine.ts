import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { getConfig, type ConfigOverrides } from '../config.js';
import type { WorkflowEvent, WorkflowInstance, WorkflowStep, WorkflowTemplate, WorkflowWorklogResult, WorklogMode } from '../types.js';
import { queryEvents } from './event-log.js';
import { summarizeOutputs } from './limits.js';
import { resolveInstance } from './instance-store.js';
import { safeJoin } from './security.js';

export interface WorklogOptions {
  mode?: WorklogMode;
  write_file?: boolean;
  path?: string;
}

export function buildWorklog(instanceIdOrAlias: string, options: WorklogOptions = {}, overrides: ConfigOverrides = {}): WorkflowWorklogResult {
  const instance = resolveInstance(instanceIdOrAlias, overrides);
  const template = instance.template_snapshot;
  const events = queryEvents(instance.id, { limit: 200, summary: true }, overrides);
  const failed = events.filter(event => event.type === 'step.validation_failed');
  const completedSteps = template.steps.filter(step => instance.steps[step.id]?.status === 'done').length;
  const mode = options.mode ?? 'full';
  const markdown = renderMarkdown(mode, instance, template, events, failed);
  const path = options.write_file ? writeWorklog(instance.id, markdown, options.path, overrides) : undefined;
  return {
    markdown,
    summary: {
      completed_steps: completedSteps,
      failed_validations: failed.length,
      latest_step: instance.current_step,
    },
    ...(path ? { path } : {}),
  };
}

function renderMarkdown(mode: WorklogMode, instance: WorkflowInstance, template: WorkflowTemplate, events: WorkflowEvent[], failed: WorkflowEvent[]): string {
  if (mode === 'release_note') return renderReleaseNote(instance, template, failed);
  if (mode === 'summary') return renderSummary(instance, template, failed);
  if (mode === 'handoff') return renderHandoff(instance, template, failed);
  return renderFull(instance, template, events, failed);
}

function renderSummary(instance: WorkflowInstance, template: WorkflowTemplate, failed: WorkflowEvent[]): string {
  const completed = template.steps.filter(step => instance.steps[step.id]?.status === 'done').length;
  return [
    `# Worklog Summary: ${instance.id}`,
    '',
    `- Template: ${instance.template}`,
    `- Status: ${instance.status}`,
    `- Current step: ${instance.current_step}`,
    `- Progress: ${completed}/${template.steps.length}`,
    `- Validation failures: ${failed.length}`,
    '',
  ].join('\n');
}

function renderHandoff(instance: WorkflowInstance, template: WorkflowTemplate, failed: WorkflowEvent[]): string {
  const lines = renderSummary(instance, template, failed).split('\n');
  lines.push('## Handoff Notes', '');
  lines.push('- Continue from current step if status is active.');
  lines.push('- Review validation failures before retrying blocked steps.');
  lines.push('');
  lines.push('## Step Outputs', '');
  for (const step of template.steps) renderStep(lines, instance, step);
  return `${lines.join('\n')}\n`;
}

function renderReleaseNote(instance: WorkflowInstance, template: WorkflowTemplate, failed: WorkflowEvent[]): string {
  return [
    `# Release Note: ${instance.template}`,
    '',
    `- Instance: ${instance.id}`,
    `- Status: ${instance.status}`,
    `- Completed steps: ${template.steps.filter(step => instance.steps[step.id]?.status === 'done').length}/${template.steps.length}`,
    `- Validation failures reviewed: ${failed.length}`,
    '',
  ].join('\n');
}

function renderFull(instance: WorkflowInstance, template: WorkflowTemplate, events: WorkflowEvent[], failed: WorkflowEvent[]): string {
  const lines: string[] = [];
  lines.push(`# Worklog: ${instance.id}`);
  lines.push('');
  lines.push(`- Template: ${instance.template}`);
  lines.push(`- Status: ${instance.status}`);
  lines.push(`- Current step: ${instance.current_step}`);
  lines.push(`- Created: ${instance.created_at}`);
  lines.push(`- Updated: ${instance.updated_at}`);
  lines.push('');
  lines.push('## Step Summary');
  lines.push('');
  for (const step of template.steps) renderStep(lines, instance, step);
  lines.push('');
  lines.push('## Timeline');
  lines.push('');
  for (const event of events) {
    lines.push(`- ${event.timestamp} ${event.type}${event.step_id ? ` (${event.step_id})` : ''}`);
  }
  if (failed.length) {
    lines.push('');
    lines.push('## Validation Failures');
    lines.push('');
    for (const event of failed) {
      lines.push(`- ${event.timestamp} ${event.step_id ?? '-'}: ${summarizePayload(event.payload)}`);
    }
  }
  lines.push('');
  lines.push('## Risks');
  lines.push('');
  lines.push(failed.length ? `- ${failed.length} checkpoint validation failure(s) need review.` : '- No checkpoint validation failures recorded.');
  return `${lines.join('\n')}\n`;
}

function renderStep(lines: string[], instance: WorkflowInstance, step: WorkflowStep): void {
  const state = instance.steps[step.id];
  lines.push(`### ${step.id}: ${step.name}`);
  lines.push('');
  lines.push(`- Status: ${state?.status ?? 'pending'}`);
  if (state?.started_at) lines.push(`- Started: ${state.started_at}`);
  if (state?.completed_at) lines.push(`- Completed: ${state.completed_at}`);
  const outputs = summarizeOutputs(state?.outputs);
  if (outputs) {
    lines.push(`- Output keys: ${outputs.output_keys.join(', ') || '-'}`);
    for (const [key, preview] of Object.entries(outputs.outputs_preview)) {
      lines.push(`  - ${key}: ${preview}`);
    }
  }
  if (state?.confirmed_conditions?.length) lines.push(`- Confirmed conditions: ${state.confirmed_conditions.join('; ')}`);
  lines.push('');
}

function writeWorklog(instanceId: string, markdown: string, requestedPath: string | undefined, overrides: ConfigOverrides): string {
  const dataDir = getConfig(overrides).dataDir;
  const path = requestedPath ? safeJoin(dataDir, requestedPath) : safeJoin(dataDir, 'worklogs', `${instanceId}.md`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, markdown, 'utf-8');
  return path;
}

function summarizePayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return payload === undefined ? '' : String(payload);
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.errors)) {
    return record.errors.map(error => {
      if (error && typeof error === 'object' && 'message' in error) return String((error as Record<string, unknown>).message);
      return String(error);
    }).join('; ');
  }
  return JSON.stringify(record).slice(0, 300);
}
