import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import yaml from 'js-yaml';
import { getConfig, type ConfigOverrides } from '../config.js';
import { assertPromptSize } from './limits.js';
import { assertStepId, assertTemplateName, safeJoin } from './security.js';
import type {
  CreateTemplateOptions,
  ParamsDef,
  RequiredOutputDef,
  TemplateSummary,
  WorkflowStep,
  WorkflowTemplate,
} from '../types.js';

export function normalizeParams(params: string[] | ParamsDef | undefined): ParamsDef {
  if (!params) return {};
  if (Array.isArray(params)) {
    const def: ParamsDef = {};
    for (const p of params) {
      def[p] = { type: 'string', required: true };
    }
    return def;
  }
  return params;
}

export function templateDir(name: string, overrides: ConfigOverrides = {}): string {
  assertTemplateName(name);
  return safeJoin(getConfig(overrides).flowsDir, name);
}

function templatePath(name: string, overrides: ConfigOverrides = {}): string {
  return safeJoin(templateDir(name, overrides), 'flow.yaml');
}

export function listTemplates(overrides: ConfigOverrides = {}): TemplateSummary[] {
  const { flowsDir } = getConfig(overrides);
  if (!existsSync(flowsDir)) return [];

  return readdirSync(flowsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const name = entry.name;
      let path = safeJoin(flowsDir, name);
      try {
        path = templateDir(name, overrides);
        const template = loadTemplate(name, overrides);
        return {
          name: template.name,
          description: template.description,
          step_count: template.steps?.length ?? 0,
          path,
        };
      } catch (err) {
        return {
          name,
          description: '',
          step_count: 0,
          path,
          invalid: true,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    });
}

export function loadTemplate(name: string, overrides: ConfigOverrides = {}): WorkflowTemplate {
  const path = templatePath(name, overrides);
  if (!existsSync(path)) throw new Error(`Template not found: ${name}`);

  try {
    const loaded = yaml.load(readFileSync(path, 'utf-8')) as WorkflowTemplate;
    validateTemplate(loaded, { templateName: name, requirePrompts: false, config: overrides });
    return loaded;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Template ')) throw err;
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to load template ${name} at ${path}: ${cause}`);
  }
}

export function loadPrompt(templateName: string, stepId: string, overrides: ConfigOverrides = {}): string {
  assertStepId(stepId);
  const path = safeJoin(templateDir(templateName, overrides), 'prompts', `${stepId}.md`);
  if (!existsSync(path)) throw new Error(`Prompt not found for ${templateName}/${stepId}: ${path}`);
  const prompt = readFileSync(path, 'utf-8');
  assertPromptSize(prompt);
  return prompt;
}

export function loadPromptSnapshots(template: WorkflowTemplate, templateName = template.name, overrides: ConfigOverrides = {}): Record<string, string> {
  const snapshots: Record<string, string> = {};
  for (const step of template.steps) {
    snapshots[step.id] = loadPrompt(templateName, step.id, overrides);
  }
  return snapshots;
}

export interface ValidateTemplateOptions {
  templateName?: string;
  prompts?: Record<string, string>;
  requirePrompts?: boolean;
  config?: ConfigOverrides;
}

export function validateTemplate(template: WorkflowTemplate, options: ValidateTemplateOptions = {}): void {
  if (!template || typeof template !== 'object') throw new Error('Template must be an object');
  if (!template.name) throw new Error('Template name is required');
  assertTemplateName(template.name);
  if (!template.description) throw new Error(`Template ${template.name} description is required`);
  if (!Array.isArray(template.steps) || template.steps.length === 0) {
    throw new Error(`Template ${template.name} must define at least one step`);
  }

  normalizeParams(template.params);

  const stepIds = new Set<string>();
  for (const step of template.steps) {
    validateStepShape(template.name, step);
    if (stepIds.has(step.id)) throw new Error(`Template ${template.name} has duplicate step id: ${step.id}`);
    stepIds.add(step.id);
  }

  for (const step of template.steps) {
    validateNext(template.name, step, stepIds);
  }

  if (options.requirePrompts) {
    for (const step of template.steps) {
      if (options.prompts) {
        const prompt = options.prompts[step.id];
        if (typeof prompt !== 'string' || !prompt.trim()) {
          throw new Error(`Template ${template.name} missing prompt content for step: ${step.id}`);
        }
        assertPromptSize(prompt);
      } else {
        const promptPath = safeJoin(templateDir(options.templateName ?? template.name, options.config), 'prompts', `${step.id}.md`);
        if (!existsSync(promptPath)) throw new Error(`Template ${template.name} missing prompt file for step: ${step.id}`);
        assertPromptSize(readFileSync(promptPath, 'utf-8'));
      }
    }
  }
}

function validateStepShape(templateName: string, step: WorkflowStep): void {
  if (!step || typeof step !== 'object') throw new Error(`Template ${templateName} has invalid step`);
  if (!step.id) throw new Error(`Template ${templateName} has a step without id`);
  assertStepId(step.id);
  if (!step.name) throw new Error(`Template ${templateName} step ${step.id} has no name`);
  if (!Object.prototype.hasOwnProperty.call(step, 'next')) {
    throw new Error(`Template ${templateName} step ${step.id} must define next`);
  }

  const requiredOutputs = step.checkpoint?.required_outputs;
  if (requiredOutputs && !Array.isArray(requiredOutputs)) {
    for (const [key, def] of Object.entries(requiredOutputs as Record<string, RequiredOutputDef>)) {
      if (!key || typeof def !== 'object') throw new Error(`Template ${templateName} step ${step.id} has invalid required output`);
    }
  }
}

function validateNext(templateName: string, step: WorkflowStep, stepIds: Set<string>): void {
  if (step.next === null) return;
  if (typeof step.next === 'string') {
    if (!stepIds.has(step.next)) {
      throw new Error(`Template ${templateName} step ${step.id} next points to missing step: ${step.next}`);
    }
    return;
  }
  if (typeof step.next === 'object') {
    for (const [branch, target] of Object.entries(step.next)) {
      if (!stepIds.has(target)) {
        throw new Error(`Template ${templateName} step ${step.id} branch ${branch} points to missing step: ${target}`);
      }
    }
    return;
  }
  throw new Error(`Template ${templateName} step ${step.id} has invalid next`);
}

export function createTemplate(options: CreateTemplateOptions, overrides: ConfigOverrides = {}): { path: string } {
  const template: WorkflowTemplate = {
    name: options.name,
    description: options.description,
    params: options.params,
    steps: options.steps,
    ...(options.token_budget ? { token_budget: options.token_budget } : {}),
  };

  validateTemplate(template, { prompts: options.prompts, requirePrompts: true });

  const dir = templateDir(options.name, overrides);
  if (existsSync(dir) && !options.overwrite) {
    throw new Error(`Template already exists: ${options.name}`);
  }

  const promptsDir = safeJoin(dir, 'prompts');
  mkdirSync(promptsDir, { recursive: true });
  writeFileSync(safeJoin(dir, 'flow.yaml'), yaml.dump(template, { lineWidth: 120, noRefs: true }), 'utf-8');

  for (const step of options.steps) {
    writeFileSync(safeJoin(promptsDir, `${step.id}.md`), options.prompts[step.id], 'utf-8');
  }

  return { path: dir };
}
