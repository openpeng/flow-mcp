import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import yaml from 'js-yaml';
import { getConfig, type ConfigOverrides } from '../config.js';
import { OflowError, isOflowError } from './errors.js';
import { assertPromptSize } from './limits.js';
import { assertStepId, assertTemplateName, safeJoin } from './security.js';
import type {
  CreateTemplateOptions,
  ParamsDef,
  RequiredOutputDef,
  TemplateSummary,
  TemplateRouteMatch,
  TemplateRouting,
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
          description_short: template.routing?.description_short,
          step_count: template.steps?.length ?? 0,
          keywords: template.routing?.keywords,
          priority: template.routing?.priority,
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
  if (!existsSync(path)) throw new OflowError('NOT_FOUND', `Template not found: ${name}`);

  try {
    const loaded = yaml.load(readFileSync(path, 'utf-8')) as WorkflowTemplate;
    validateTemplate(loaded, { templateName: name, requirePrompts: false, config: overrides });
    return loaded;
  } catch (err) {
    if (isOflowError(err)) throw err;
    const cause = err instanceof Error ? err.message : String(err);
    throw new OflowError('INVALID_ARGUMENT', `Failed to load template ${name} at ${path}: ${cause}`);
  }
}

export function loadPrompt(templateName: string, stepId: string, overrides: ConfigOverrides = {}): string {
  assertStepId(stepId);
  const path = safeJoin(templateDir(templateName, overrides), 'prompts', `${stepId}.md`);
  if (!existsSync(path)) throw new OflowError('NOT_FOUND', `Prompt not found for ${templateName}/${stepId}: ${path}`);
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
  if (!template || typeof template !== 'object') throw new OflowError('INVALID_ARGUMENT', 'Template must be an object');
  if (!template.name) throw new OflowError('INVALID_ARGUMENT', 'Template name is required');
  assertTemplateName(template.name);
  if (!template.description) throw new OflowError('INVALID_ARGUMENT', `Template ${template.name} description is required`);
  if (!Array.isArray(template.steps) || template.steps.length === 0) {
    throw new OflowError('INVALID_ARGUMENT', `Template ${template.name} must define at least one step`);
  }

  normalizeParams(template.params);

  const stepIds = new Set<string>();
  for (const step of template.steps) {
    validateStepShape(template.name, step);
    if (stepIds.has(step.id)) throw new OflowError('INVALID_ARGUMENT', `Template ${template.name} has duplicate step id: ${step.id}`);
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
          throw new OflowError('INVALID_ARGUMENT', `Template ${template.name} missing prompt content for step: ${step.id}`);
        }
        assertPromptSize(prompt);
      } else {
        const promptPath = safeJoin(templateDir(options.templateName ?? template.name, options.config), 'prompts', `${step.id}.md`);
        if (!existsSync(promptPath)) throw new OflowError('INVALID_ARGUMENT', `Template ${template.name} missing prompt file for step: ${step.id}`);
        assertPromptSize(readFileSync(promptPath, 'utf-8'));
      }
    }
  }
}

function validateStepShape(templateName: string, step: WorkflowStep): void {
  if (!step || typeof step !== 'object') throw new OflowError('INVALID_ARGUMENT', `Template ${templateName} has invalid step`);
  if (!step.id) throw new OflowError('INVALID_ARGUMENT', `Template ${templateName} has a step without id`);
  assertStepId(step.id);
  if (!step.name) throw new OflowError('INVALID_ARGUMENT', `Template ${templateName} step ${step.id} has no name`);
  if (!Object.prototype.hasOwnProperty.call(step, 'next')) {
    throw new OflowError('INVALID_ARGUMENT', `Template ${templateName} step ${step.id} must define next`);
  }

  const requiredOutputs = step.checkpoint?.required_outputs;
  if (requiredOutputs && !Array.isArray(requiredOutputs)) {
    for (const [key, def] of Object.entries(requiredOutputs as Record<string, RequiredOutputDef>)) {
      if (!key || typeof def !== 'object') throw new OflowError('INVALID_ARGUMENT', `Template ${templateName} step ${step.id} has invalid required output`);
    }
  }
}

function validateNext(templateName: string, step: WorkflowStep, stepIds: Set<string>): void {
  if (step.next === null) return;
  if (typeof step.next === 'string') {
    if (!stepIds.has(step.next)) {
      throw new OflowError('INVALID_ARGUMENT', `Template ${templateName} step ${step.id} next points to missing step: ${step.next}`);
    }
    return;
  }
  if (typeof step.next === 'object') {
    for (const [branch, target] of Object.entries(step.next)) {
      if (!stepIds.has(target)) {
        throw new OflowError('INVALID_ARGUMENT', `Template ${templateName} step ${step.id} branch ${branch} points to missing step: ${target}`);
      }
    }
    return;
  }
  throw new OflowError('INVALID_ARGUMENT', `Template ${templateName} step ${step.id} has invalid next`);
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
    throw new OflowError('CONFLICT', `Template already exists: ${options.name}`);
  }

  const promptsDir = safeJoin(dir, 'prompts');
  mkdirSync(promptsDir, { recursive: true });
  writeFileSync(safeJoin(dir, 'flow.yaml'), yaml.dump(template, { lineWidth: 120, noRefs: true }), 'utf-8');

  for (const step of options.steps) {
    writeFileSync(safeJoin(promptsDir, `${step.id}.md`), options.prompts[step.id], 'utf-8');
  }

  return { path: dir };
}

// ─── Phase 8: Template routing (L0 → L1 → L2 discovery) ───

/** Get routing metadata for a single template */
export function getTemplateRouting(name: string, overrides: ConfigOverrides = {}): TemplateRouting | undefined {
  try {
    const def = loadTemplate(name, overrides);
    return def.routing;
  } catch {
    return undefined;
  }
}

/** Collect routing metadata from all templates */
export function getAllTemplatesRouting(overrides: ConfigOverrides = {}): { name: string; description: string; routing: TemplateRouting; step_count: number }[] {
  const results: { name: string; description: string; routing: TemplateRouting; step_count: number }[] = [];
  for (const summary of listTemplates(overrides)) {
    if (summary.invalid) continue;
    try {
      const def = loadTemplate(summary.name, overrides);
      if (def.routing) {
        results.push({ name: summary.name, description: summary.description, routing: def.routing, step_count: summary.step_count });
      } else {
        results.push({
          name: summary.name,
          description: summary.description,
          routing: {
            keywords: [],
            description_short: summary.description.slice(0, 50),
            priority: 0,
          },
          step_count: summary.step_count,
        });
      }
    } catch { /* skip broken */ }
  }
  return results.sort((a, b) => b.routing.priority - a.routing.priority);
}

/** Match templates by user intent keyword matching */
export function matchTemplatesByIntent(intent: string, overrides: ConfigOverrides = {}): TemplateRouteMatch[] {
  const normalized = intent.toLowerCase();
  const results: TemplateRouteMatch[] = [];

  for (const { name, description, routing, step_count } of getAllTemplatesRouting(overrides)) {
    if (routing.keywords.length === 0 && !routing.triggers) continue;

    const matchedKeywords: string[] = [];

    for (const kw of routing.keywords) {
      if (normalized.includes(kw.toLowerCase())) {
        matchedKeywords.push(kw);
      }
    }

    if (routing.triggers) {
      for (const trigger of routing.triggers) {
        try {
          if (new RegExp(trigger, 'i').test(normalized)) {
            matchedKeywords.push(`trigger:${trigger}`);
          }
        } catch { /* skip invalid regex */ }
      }
    }

    if (matchedKeywords.length > 0) {
      results.push({
        template: name,
        description,
        description_short: routing.description_short,
        score: matchedKeywords.length + routing.priority,
        keywords_matched: matchedKeywords,
        priority: routing.priority,
        step_count,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/** Build compact routing table for AI instruction injection */
export function buildRoutingTable(overrides: ConfigOverrides = {}): string {
  const templates = getAllTemplatesRouting(overrides);
  if (templates.length === 0) return '';

  const hasRouting = templates.filter(t => t.routing.keywords.length > 0);
  if (hasRouting.length === 0) return '';

  const lines = [
    '| 使用场景 | 模板 | 关键词触发 |',
    '|------|------|------|',
  ];

  for (const t of hasRouting) {
    lines.push(`| ${t.routing.description_short} | \`${t.name}\` | ${t.routing.keywords.join(', ')} |`);
  }

  return lines.join('\n');
}

/** List templates with routing info, optionally filtered by query */
export function listTemplatesWithRouting(query?: string, overrides: ConfigOverrides = {}): TemplateRouteMatch[] {
  if (!query) {
    return getAllTemplatesRouting(overrides).map(t => ({
      template: t.name,
      description: t.description,
      description_short: t.routing.description_short,
      score: t.routing.priority,
      keywords_matched: [],
      priority: t.routing.priority,
      step_count: t.step_count,
    }));
  }
  return matchTemplatesByIntent(query, overrides);
}
