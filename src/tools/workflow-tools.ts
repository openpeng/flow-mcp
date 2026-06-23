import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { CreateTemplateOptions } from '../types.js';
import {
  advanceWorkflow,
  bindWorkflowAlias,
  createWorkflowTemplate,
  getCurrent,
  getWorkflowStatus,
  listWorkflowInstances,
  overridePrompt,
  startWorkflow,
} from '../engine/workflow-engine.js';
import { listTemplates, loadTemplate } from '../engine/template-store.js';

export const workflowTools: Tool[] = [
  {
    name: 'workflow_list_templates',
    description: 'List available workflow templates.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'workflow_get_template',
    description: 'Get workflow template details and step summary.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Template name' } },
      required: ['name'],
    },
  },
  {
    name: 'workflow_start',
    description: 'Start a workflow instance from a template.',
    inputSchema: {
      type: 'object',
      properties: {
        template: { type: 'string', description: 'Template name' },
        params: { type: 'object', description: 'String workflow parameters', additionalProperties: { type: 'string' } },
        alias: { type: 'string', description: 'Optional instance alias' },
      },
      required: ['template', 'params'],
    },
  },
  {
    name: 'workflow_current',
    description: 'Get the current workflow step and rendered prompt. ID may be an instance id or alias. If omitted, uses the most recently active instance.',
    inputSchema: {
      type: 'object',
      properties: { instance_id: { type: 'string', description: 'Instance ID or alias' } },
    },
  },
  {
    name: 'workflow_advance',
    description: 'Complete the current step and advance the workflow after checkpoint validation.',
    inputSchema: {
      type: 'object',
      properties: {
        instance_id: { type: 'string', description: 'Instance ID or alias' },
        outputs: { type: 'object', description: 'Step outputs', additionalProperties: true },
        confirmed_conditions: { type: 'array', items: { type: 'string' }, description: 'Confirmed natural-language checkpoint conditions' },
        condition_result: { type: 'string', description: 'Branch key for conditional next routing' },
        token_consumed: { type: 'number', description: 'Tokens consumed by this step' },
      },
      required: ['instance_id', 'outputs'],
    },
  },
  {
    name: 'workflow_status',
    description: 'Show full workflow instance status.',
    inputSchema: {
      type: 'object',
      properties: { instance_id: { type: 'string', description: 'Instance ID or alias' } },
      required: ['instance_id'],
    },
  },
  {
    name: 'workflow_list_instances',
    description: 'List workflow instances, optionally filtered by status and template.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'completed', 'all'], description: 'Instance status filter' },
        template: { type: 'string', description: 'Template filter' },
      },
    },
  },
  {
    name: 'workflow_bind',
    description: 'Bind an alias to a workflow instance.',
    inputSchema: {
      type: 'object',
      properties: {
        instance_id: { type: 'string', description: 'Instance ID' },
        alias: { type: 'string', description: 'Alias to bind' },
      },
      required: ['instance_id', 'alias'],
    },
  },
  {
    name: 'workflow_override_prompt',
    description: 'Override a step prompt for one workflow instance only.',
    inputSchema: {
      type: 'object',
      properties: {
        instance_id: { type: 'string', description: 'Instance ID or alias' },
        step_id: { type: 'string', description: 'Step ID' },
        prompt: { type: 'string', description: 'Prompt markdown' },
      },
      required: ['instance_id', 'step_id', 'prompt'],
    },
  },
  {
    name: 'workflow_create_template',
    description: 'Create a workflow template by writing flow.yaml and prompts/*.md.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Template name' },
        description: { type: 'string', description: 'Template description' },
        params: { type: 'object', description: 'Parameter definitions' },
        steps: { type: 'array', description: 'Workflow steps' },
        prompts: { type: 'object', description: 'Step prompts keyed by step id', additionalProperties: { type: 'string' } },
        token_budget: { type: 'object', description: 'Optional token budget' },
        overwrite: { type: 'boolean', description: 'Overwrite existing template' },
      },
      required: ['name', 'description', 'params', 'steps', 'prompts'],
    },
  },
];

export async function handleWorkflowTool(name: string, args: Record<string, unknown> = {}) {
  try {
    switch (name) {
      case 'workflow_list_templates':
        return ok(formatJson({ templates: listTemplates() }));
      case 'workflow_get_template': {
        const template = loadTemplate(requiredString(args, 'name'));
        return ok(formatJson({
          name: template.name,
          description: template.description,
          params: template.params,
          steps: template.steps.map(step => ({ id: step.id, name: step.name, checkpoint: step.checkpoint, next: step.next })),
          token_budget: template.token_budget,
        }));
      }
      case 'workflow_start': {
        const result = startWorkflow(requiredString(args, 'template'), objectArg<Record<string, string>>(args, 'params'), optionalString(args, 'alias'));
        return ok([
          `✅ Workflow started`,
          `- Instance: \`${result.instance.id}\``,
          result.instance.alias ? `- Alias: \`${result.instance.alias}\`` : undefined,
          `- Template: ${result.instance.template}`,
          `- Current step: **${result.step.name}** (\`${result.step.id}\`)`,
          '',
          result.prompt,
        ].filter(Boolean).join('\n'));
      }
      case 'workflow_current': {
        const result = getCurrent(optionalString(args, 'instance_id'));
        return ok([
          `## Workflow current`,
          `- Instance: \`${result.instance.id}\``,
          `- Status: ${result.instance.status}`,
          `- Current step: **${result.step.name}** (\`${result.step.id}\`)`,
          result.step.checkpoint ? `- Checkpoint: ${JSON.stringify(result.step.checkpoint)}` : undefined,
          '',
          result.prompt,
        ].filter(Boolean).join('\n'));
      }
      case 'workflow_advance': {
        const result = advanceWorkflow(requiredString(args, 'instance_id'), objectArg<Record<string, unknown>>(args, 'outputs'), {
          confirmed_conditions: optionalStringArray(args, 'confirmed_conditions'),
          condition_result: optionalString(args, 'condition_result'),
          token_consumed: optionalNumber(args, 'token_consumed'),
        });
        if (result.completed) {
          return ok(`✅ Workflow completed\n- Instance: \`${result.instance.id}\``);
        }
        return ok([
          `✅ Advanced to **${result.next_step?.name}** (\`${result.next_step?.id}\`)`,
          `- Instance: \`${result.instance.id}\``,
          '',
          result.next_prompt,
        ].filter(Boolean).join('\n'));
      }
      case 'workflow_status': {
        const result = getWorkflowStatus(requiredString(args, 'instance_id'));
        const lines = [`## Workflow status: ${result.instance.template}`, `Instance: \`${result.instance.id}\` | ${result.instance.status}`, ''];
        for (const step of result.steps) {
          const state = result.instance.steps[step.id];
          const icon = state?.status === 'done' ? '✅' : state?.status === 'in_progress' ? '🔄' : '⬜';
          lines.push(`${icon} **${step.name}** (\`${step.id}\`) — ${state?.status ?? 'pending'}`);
          if (state?.outputs) lines.push(`   - outputs: ${JSON.stringify(state.outputs)}`);
        }
        return ok(lines.join('\n'));
      }
      case 'workflow_list_instances': {
        const result = listWorkflowInstances({ status: optionalStatus(args), template: optionalString(args, 'template') });
        return ok(formatJson(result));
      }
      case 'workflow_bind': {
        const instance = bindWorkflowAlias(requiredString(args, 'instance_id'), requiredString(args, 'alias'));
        return ok(`✅ Alias bound\n- Instance: \`${instance.id}\`\n- Alias: \`${instance.alias}\``);
      }
      case 'workflow_override_prompt': {
        const instance = overridePrompt(requiredString(args, 'instance_id'), requiredString(args, 'step_id'), requiredString(args, 'prompt'));
        return ok(`✅ Prompt override saved\n- Instance: \`${instance.id}\`\n- Step: \`${requiredString(args, 'step_id')}\``);
      }
      case 'workflow_create_template': {
        const path = createWorkflowTemplate(args as unknown as CreateTemplateOptions).path;
        return ok(`✅ Template created\n- Path: ${path}`);
      }
      default:
        return null;
    }
  } catch (err) {
    return ok(`❌ ${err instanceof Error ? err.message : String(err)}`);
  }
}

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function formatJson(value: unknown): string {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing required string: ${key}`);
  return value;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function optionalNumber(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  return typeof value === 'number' ? value : undefined;
}

function optionalStringArray(args: Record<string, unknown>, key: string): string[] | undefined {
  const value = args[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined;
}

function objectArg<T extends object>(args: Record<string, unknown>, key: string): T {
  const value = args[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Missing required object: ${key}`);
  return value as T;
}

function optionalStatus(args: Record<string, unknown>): 'active' | 'completed' | 'all' | undefined {
  const value = args.status;
  if (value === 'active' || value === 'completed' || value === 'all') return value;
  return undefined;
}
