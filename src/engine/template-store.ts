import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import yaml from 'js-yaml';
import { getConfig, type ConfigOverrides } from '../config.js';
import { OflowError, isOflowError } from './errors.js';
import { assertPromptSize } from './limits.js';
import { assertStepId, assertTemplateName, safeJoin } from './security.js';
import type {
  CreateTemplateOptions,
  ParamDef,
  ParamsDef,
  RequiredOutputDef,
  RouteRecommendation,
  RouteResult,
  TemplateSummary,
  TemplateRouteMatch,
  TemplateRouting,
  UrlMatchResult,
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

function extractNextStepIds(next: unknown): string[] {
  if (typeof next === 'string') return [next];
  if (next === null || next === undefined) return [];
  if (typeof next !== 'object') return [];

  const obj = next as Record<string, unknown>;
  const ids: string[] = [];

  if ('branches' in obj && Array.isArray(obj.branches)) {
    for (const branch of obj.branches as Array<{ step?: string }>) {
      if (typeof branch.step === 'string') ids.push(branch.step);
    }
  }
  if (typeof obj.fallback === 'string') ids.push(obj.fallback);

  for (const v of Object.values(obj)) {
    if (typeof v === 'string' && !ids.includes(v)) ids.push(v);
  }

  return ids;
}

function validateNext(templateName: string, step: WorkflowStep, stepIds: Set<string>): void {
  const nexts = extractNextStepIds(step.next);
  for (const next of nexts) {
    if (!stepIds.has(next)) {
      throw new OflowError('INVALID_ARGUMENT', `Template ${templateName} step ${step.id} next points to missing step: ${next}`);
    }
  }
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

/** Build trigger phrases for SKILL.md frontmatter from all templates' routing metadata */
export function buildTriggerPhrases(overrides: ConfigOverrides = {}): string {
  const templates = getAllTemplatesRouting(overrides).filter(t => t.routing.keywords.length > 0);
  if (templates.length === 0) return '';

  const phrases = templates.map(t => {
    const kws = t.routing.keywords.slice(0, 3).join('/');
    return `"${t.routing.description_short}（${kws}）"`;
  });

  return `当用户提到 ${phrases.join('、')} 等场景时使用此 skill。`;
}

/** Route a user intent to the best matching template, with rich context for AI activation */
export function routeTemplate(intent: string, overrides: ConfigOverrides = {}): RouteResult {
  const matches = matchTemplatesByIntent(intent, overrides);
  if (matches.length === 0) {
    return { recommended: null, alternatives: [] };
  }

  const [top, ...rest] = matches;

  // Read params definition and first step from the recommended template
  let params: { name: string; type: string; required: boolean; description?: string }[] = [];
  let firstStep: { id: string; title: string } | null = null;
  try {
    const tmpl = loadTemplate(top.template, overrides);
    if (tmpl.params && typeof tmpl.params === 'object' && !Array.isArray(tmpl.params)) {
      const paramDefs = tmpl.params as ParamsDef;
      params = Object.entries(paramDefs).map(([name, def]: [string, ParamDef]) => ({
        name,
        type: def.type,
        required: def.required,
        description: def.description,
      }));
    }
    if (tmpl.steps.length > 0) {
      firstStep = { id: tmpl.steps[0].id, title: tmpl.steps[0].name };
    }
  } catch {
    /* ignore load errors — still return match info without params/first_step */
  }

  // Clean trigger: prefix from keywords_matched for friendly display
  const cleanKeywords = top.keywords_matched.map(k => (k.startsWith('trigger:') ? k.slice(8) : k));
  const matchReason = cleanKeywords.length > 0
    ? `命中关键词 ${cleanKeywords.map(k => `"${k}"`).join('、')}`
    : '触发模式匹配';

  const recommended: RouteRecommendation = {
    template: top.template,
    description: top.description,
    description_short: top.description_short,
    score: top.score,
    keywords_matched: cleanKeywords,
    match_reason: matchReason,
    params,
    first_step: firstStep,
  };

  return {
    recommended,
    alternatives: rest.slice(0, 4),
  };
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

function globToRegex(pattern: string): RegExp {
  let src = '';
  let i = 0;
  while (i < pattern.length) {
    if (pattern[i] === '*' && pattern[i + 1] === '*') {
      src += '.*';
      i += 2;
    } else if (pattern[i] === '*') {
      src += '[^/]*';
      i += 1;
    } else if ('.+?^${}()|[]\\'.includes(pattern[i])) {
      src += '\\' + pattern[i];
      i += 1;
    } else {
      src += pattern[i];
      i += 1;
    }
  }
  return new RegExp('^' + src + '$', 'i');
}

export function matchTemplatesByUrl(url: string, overrides: ConfigOverrides = {}): UrlMatchResult[] {
  const results: UrlMatchResult[] = [];

  for (const summary of listTemplates(overrides)) {
    if (summary.invalid) continue;
    try {
      const tmpl = loadTemplate(summary.name, overrides);
      const patterns = tmpl.url_patterns;
      if (!patterns || patterns.length === 0) continue;

      for (const pattern of patterns) {
        const re = globToRegex(pattern);
        if (re.test(url)) {
          const params: Record<string, string> = {};
          if (tmpl.params && typeof tmpl.params === 'object' && !Array.isArray(tmpl.params)) {
            const paramDefs = tmpl.params as Record<string, { type: string; required: boolean }>;
            for (const [key] of Object.entries(paramDefs)) {
              if (key.includes('url') || key.includes('_url')) {
                params[key] = url;
              }
            }
          }
          results.push({
            template: summary.name,
            description: tmpl.description,
            params,
          });
          break;
        }
      }
    } catch {
      // skip templates that fail to load
    }
  }

  return results;
}
