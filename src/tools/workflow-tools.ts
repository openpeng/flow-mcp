import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { CreateTemplateOptions, InboxPriority, InboxStatus, ToolEnvelope, WorkflowEventType, WorklogMode } from '../types.js';
import { isOflowError, OflowError } from '../engine/errors.js';
import { summarizeOutputs } from '../engine/limits.js';
import { queryEvents } from '../engine/event-log.js';
import { buildDashboard } from '../engine/dashboard-engine.js';
import { saveInboxEntries, listInboxEntries, markInboxEntries } from '../engine/inbox-store.js';
import { buildWorklog } from '../engine/worklog-engine.js';
import { loadPromptSnapshots, listTemplates, loadTemplate, listTemplatesWithRouting } from '../engine/template-store.js';
import { validateTemplateControlPlane } from '../engine/template-validator.js';
import {
  advanceWorkflow,
  bindWorkflowAlias,
  createWorkflowTemplate,
  delegateStep,
  getCurrent,
  getWorkflowStatus,
  listWorkflowInstances,
  overridePrompt,
  startWorkflow,
} from '../engine/workflow-engine.js';
import { findRelevantMemories } from '../engine/memory-lookup.js';

export const workflowTools: Tool[] = [
  {
    name: 'workflow_list_templates',
    description: 'List available workflow templates. Supports optional query parameter for intent-based keyword matching and ranking.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional: describe task intent for keyword-based template matching and ranking' },
      },
    },
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
    description: 'Get the current workflow step and rendered prompt. ID may be an instance id or alias. If omitted, uses the most recently active instance. By default, relevant project memories are injected into the prompt. Set include_memories=false to skip.',
    inputSchema: {
      type: 'object',
      properties: {
        instance_id: { type: 'string', description: 'Instance ID or alias' },
        include_memories: { type: 'boolean', description: 'Include memory summaries at the top of the prompt. Default true.' },
      },
    },
  },
  {
    name: 'workflow_delegate',
    description: 'Delegate current step execution to a sub-agent with only the required tools. Returns step configuration including tools, agent config, and prompt. If can_delegate is false, use workflow_current instead.',
    inputSchema: {
      type: 'object',
      properties: {
        instance_id: { type: 'string', description: 'Instance ID or alias. If omitted, uses most recent active instance.' },
      },
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
        evidence: { type: 'object', description: 'Checkpoint evidence keyed by evidence key', additionalProperties: true },
        approvals: { type: 'object', description: 'Checkpoint approvals keyed by approval key', additionalProperties: true },
      },
      required: ['instance_id', 'outputs'],
    },
  },
  {
    name: 'workflow_status',
    description: 'Show full workflow instance status with output summaries.',
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
  {
    name: 'workflow_events',
    description: 'Query workflow event log by instance, type, step, and limit.',
    inputSchema: {
      type: 'object',
      properties: {
        instance_id: { type: 'string', description: 'Instance ID' },
        type: { type: 'string', description: 'Optional event type filter' },
        step_id: { type: 'string', description: 'Optional step ID filter' },
        limit: { type: 'number', description: 'Max events, default 50, max 200' },
        since: { type: 'string', description: 'Only events at or after this ISO timestamp' },
        until: { type: 'string', description: 'Only events at or before this ISO timestamp' },
        only_failures: { type: 'boolean', description: 'Only validation failure events' },
        include_payload: { type: 'boolean', description: 'Include full event payload' },
        summary: { type: 'boolean', description: 'Return summarized payloads when include_payload is false' },
      },
      required: ['instance_id'],
    },
  },
  {
    name: 'workflow_dashboard',
    description: 'Build an agent dashboard for workflow state, checkpoint blockers, recent events, inbox, and suggested actions.',
    inputSchema: {
      type: 'object',
      properties: {
        instance_id: { type: 'string', description: 'Instance ID or alias. If omitted, uses most recent active instance.' },
        include_prompt: { type: 'boolean', description: 'Include rendered prompt' },
        include_recent_events: { type: 'boolean', description: 'Include recent events' },
        include_inbox: { type: 'boolean', description: 'Include inbox summary and recent entries' },
        event_limit: { type: 'number', description: 'Recent event limit' },
        inbox_limit: { type: 'number', description: 'Recent inbox entry limit' },
        verbose: { type: 'boolean', description: 'Include detailed checkpoint and inbox entries' },
      },
    },
  },
  {
    name: 'workflow_worklog',
    description: 'Generate a Markdown worklog from instance state and events.',
    inputSchema: {
      type: 'object',
      properties: {
        instance_id: { type: 'string', description: 'Instance ID or alias' },
        mode: { type: 'string', enum: ['summary', 'full', 'handoff', 'release_note'], description: 'Worklog rendering mode' },
        write_file: { type: 'boolean', description: 'Write markdown to disk' },
        path: { type: 'string', description: 'Optional path under dataDir when write_file=true' },
      },
      required: ['instance_id'],
    },
  },
  {
    name: 'workflow_inbox_save',
    description: 'Save lightweight inbox entries for a workflow instance.',
    inputSchema: {
      type: 'object',
      properties: {
        instance_id: { type: 'string', description: 'Instance ID' },
        entries: { type: 'array', description: 'Inbox entries to save; supports priority and step_id', items: { type: 'object' } },
      },
      required: ['instance_id', 'entries'],
    },
  },
  {
    name: 'workflow_inbox_list',
    description: 'List lightweight inbox entries for a workflow instance.',
    inputSchema: {
      type: 'object',
      properties: {
        instance_id: { type: 'string', description: 'Instance ID' },
        status: { type: 'string', enum: ['new', 'seen', 'acted'] },
        action_required: { type: 'boolean' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'blocking'] },
        step_id: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['instance_id'],
    },
  },
  {
    name: 'workflow_inbox_mark',
    description: 'Mark inbox entries as seen or acted.',
    inputSchema: {
      type: 'object',
      properties: {
        instance_id: { type: 'string', description: 'Instance ID' },
        entry_ids: { type: 'array', items: { type: 'string' } },
        status: { type: 'string', enum: ['new', 'seen', 'acted'] },
      },
      required: ['instance_id', 'entry_ids', 'status'],
    },
  },
  {
    name: 'workflow_validate_template',
    description: 'Validate a template for control-plane health issues.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Template name' } },
      required: ['name'],
    },
  },
  {
    name: 'workflow_memory_recommend',
    description: 'Recommend project memories relevant to a step name or query. Returns L2-level summaries (name + type + summary).',
    inputSchema: {
      type: 'object',
      properties: {
        step_name: { type: 'string', description: 'Step name or free-text keyword query' },
        limit: { type: 'number', description: 'Max results, default 5' },
      },
      required: ['step_name'],
    },
  },
];

export async function handleWorkflowTool(name: string, args: Record<string, unknown> = {}) {
  try {
    switch (name) {
      case 'workflow_list_templates': {
        const query = optionalString(args, 'query');
        if (query) {
          const matches = listTemplatesWithRouting(query);
          if (matches.length === 0) {
            return envelope({ templates: listTemplates(), query, note: `No matches found for "${query}". Showing all templates.` });
          }
          return envelope({
            query,
            matches: matches.map(m => ({
              template: m.template,
              score: m.score,
              keywords_matched: m.keywords_matched,
              description_short: m.description_short,
              description: m.description,
              step_count: m.step_count,
            })),
            suggestion: `Recommended: '${matches[0].template}' — use workflow_start template="${matches[0].template}" params={...}`,
          });
        }
        return envelope({ templates: listTemplates() });
      }
      case 'workflow_get_template': {
        const template = loadTemplate(requiredString(args, 'name'));
        return envelope({
          name: template.name,
          description: template.description,
          params: template.params,
          steps: template.steps.map(step => ({ id: step.id, name: step.name, checkpoint: step.checkpoint, next: step.next })),
          token_budget: template.token_budget,
        });
      }
      case 'workflow_start': {
        const result = startWorkflow(requiredString(args, 'template'), paramsArg(args, 'params'), optionalString(args, 'alias'));
        return envelope({
          instance_id: result.instance.id,
          alias: result.instance.alias,
          template: result.instance.template,
          status: result.instance.status,
          version: result.instance.version,
          current_step: { id: result.step.id, name: result.step.name, checkpoint: result.step.checkpoint },
          prompt: result.prompt,
        });
      }
      case 'workflow_current': {
        const result = getCurrent(optionalString(args, 'instance_id'), { include_memories: args.include_memories !== false });
        return envelope({
          instance_id: result.instance.id,
          status: result.instance.status,
          version: result.instance.version,
          current_step: { id: result.step.id, name: result.step.name, checkpoint: result.step.checkpoint },
          prompt: result.prompt,
        });
      }
      case 'workflow_delegate': {
        const result = delegateStep(optionalString(args, 'instance_id'));
        return envelope({
          instance_id: result.instance_id,
          step_id: result.step_id,
          execution_mode: result.execution_mode,
          tools: result.tools,
          agent: result.agent,
          prompt: result.prompt,
          required_outputs: result.required_outputs,
          can_delegate: result.can_delegate,
          launch_context: result.launch_context,
        });
      }
      case 'workflow_advance': {
        const result = advanceWorkflow(requiredString(args, 'instance_id'), objectArg<Record<string, unknown>>(args, 'outputs'), {
          confirmed_conditions: optionalStringArray(args, 'confirmed_conditions'),
          condition_result: optionalString(args, 'condition_result'),
          token_consumed: optionalNumber(args, 'token_consumed'),
          evidence: optionalObject<Record<string, unknown>>(args, 'evidence'),
          approvals: optionalObject<Record<string, unknown>>(args, 'approvals'),
        });
        if (result.completed) {
          return envelope({ instance_id: result.instance.id, status: result.instance.status, version: result.instance.version, completed: true });
        }
        return envelope({
          instance_id: result.instance.id,
          status: result.instance.status,
          version: result.instance.version,
          completed: false,
          next_step: result.next_step ? { id: result.next_step.id, name: result.next_step.name, checkpoint: result.next_step.checkpoint } : undefined,
          next_prompt: result.next_prompt,
        });
      }
      case 'workflow_status': {
        const result = getWorkflowStatus(requiredString(args, 'instance_id'));
        return envelope({
          instance_id: result.instance.id,
          template: result.instance.template,
          status: result.instance.status,
          version: result.instance.version,
          steps: result.steps.map(step => {
            const state = result.instance.steps[step.id];
            return {
              id: step.id,
              name: step.name,
              status: state?.status ?? 'pending',
              started_at: state?.started_at,
              completed_at: state?.completed_at,
              confirmed_conditions: state?.confirmed_conditions,
              outputs: summarizeOutputs(state?.outputs),
            };
          }),
        });
      }
      case 'workflow_list_instances': {
        const result = listWorkflowInstances({ status: optionalStatus(args), template: optionalString(args, 'template') });
        return envelope(result);
      }
      case 'workflow_bind': {
        const instance = bindWorkflowAlias(requiredString(args, 'instance_id'), requiredString(args, 'alias'));
        return envelope({ instance_id: instance.id, alias: instance.alias, version: instance.version });
      }
      case 'workflow_override_prompt': {
        const instance = overridePrompt(requiredString(args, 'instance_id'), requiredString(args, 'step_id'), requiredString(args, 'prompt'));
        return envelope({ instance_id: instance.id, step_id: requiredString(args, 'step_id'), version: instance.version });
      }
      case 'workflow_create_template': {
        const path = createWorkflowTemplate(args as unknown as CreateTemplateOptions).path;
        return envelope({ path });
      }
      case 'workflow_events': {
        return envelope({
          events: queryEvents(requiredString(args, 'instance_id'), {
            type: optionalString(args, 'type') as WorkflowEventType | undefined,
            step_id: optionalString(args, 'step_id'),
            limit: optionalNumber(args, 'limit'),
            since: optionalString(args, 'since'),
            until: optionalString(args, 'until'),
            only_failures: optionalBoolean(args, 'only_failures'),
            include_payload: optionalBoolean(args, 'include_payload'),
            summary: optionalBoolean(args, 'summary'),
          }),
        });
      }
      case 'workflow_dashboard': {
        return envelope(buildDashboard(optionalString(args, 'instance_id'), {
          include_prompt: optionalBoolean(args, 'include_prompt'),
          include_recent_events: optionalBoolean(args, 'include_recent_events'),
          include_inbox: optionalBoolean(args, 'include_inbox'),
          event_limit: optionalNumber(args, 'event_limit'),
          inbox_limit: optionalNumber(args, 'inbox_limit'),
          verbose: optionalBoolean(args, 'verbose'),
        }));
      }
      case 'workflow_worklog': {
        return envelope(buildWorklog(requiredString(args, 'instance_id'), {
          mode: optionalWorklogMode(args),
          write_file: optionalBoolean(args, 'write_file'),
          path: optionalString(args, 'path'),
        }));
      }
      case 'workflow_inbox_save': {
        return envelope(saveInboxEntries(requiredString(args, 'instance_id'), arrayArg(args, 'entries')));
      }
      case 'workflow_inbox_list': {
        return envelope({ entries: listInboxEntries(requiredString(args, 'instance_id'), {
          status: optionalInboxStatus(args),
          action_required: optionalBoolean(args, 'action_required'),
          priority: optionalInboxPriority(args),
          step_id: optionalString(args, 'step_id'),
          limit: optionalNumber(args, 'limit'),
        }) });
      }
      case 'workflow_inbox_mark': {
        return envelope(markInboxEntries(requiredString(args, 'instance_id'), requiredStringArray(args, 'entry_ids'), requiredInboxStatus(args)));
      }
      case 'workflow_validate_template': {
        const name = requiredString(args, 'name');
        const template = loadTemplate(name);
        const prompts = loadPromptSnapshots(template, name);
        return envelope(validateTemplateControlPlane(template, prompts));
      }
      case 'workflow_memory_recommend': {
        const result = findRelevantMemories(requiredString(args, 'step_name'));
        const limit = optionalNumber(args, 'limit') || 5;
        return envelope({
          query: requiredString(args, 'step_name'),
          count: Math.min(result.length, limit),
          memories: result.slice(0, limit).map(m => ({
            name: m.name,
            type: m.type,
            summary: m.summary,
          })),
        });
      }
      default:
        return null;
    }
  } catch (err) {
    if (isOflowError(err)) {
      return envelopeError(err.code, err.message, err.details);
    }
    return envelopeError(errorCode(err), err instanceof Error ? err.message : String(err), errorDetails(err));
  }
}

function envelope<T>(data: T) {
  return text({ ok: true, data });
}

function envelopeError(code: string, message: string, details?: unknown) {
  return text({ ok: false, error: { code, message, ...(details !== undefined ? { details } : {}) } });
}

function text(value: ToolEnvelope) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function errorCode(err: unknown): string {
  if (isOflowError(err)) return err.code;
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('Checkpoint validation failed')) return 'CHECKPOINT_VALIDATION_FAILED';
  if (message.includes('not found')) return 'NOT_FOUND';
  if (message.includes('already')) return 'CONFLICT';
  if (message.includes('Missing required')) return 'INVALID_ARGUMENT';
  return 'INTERNAL_ERROR';
}

function errorDetails(err: unknown): unknown {
  if (isOflowError(err)) return err.details;
  return err && typeof err === 'object' && 'details' in err ? (err as { details?: unknown }).details : undefined;
}

import type { ToolContract } from '../types.js';

export function buildToolContracts(toolNames: (string | { name: string; type: 'mcp' | 'skill' })[]): ToolContract[] {
  const contracts: ToolContract[] = [];
  const oflowTools = new Map(workflowTools.map(t => [t.name, t]));

  for (const toolRef of toolNames) {
    const toolName = typeof toolRef === 'string' ? toolRef : toolRef.name;
    const mcpTool = oflowTools.get(toolName);

    if (mcpTool) {
      contracts.push(toolSchemaToContract(mcpTool));
    } else {
      const toolType = typeof toolRef === 'string' ? 'MCP' : (toolRef.type || 'MCP');
      contracts.push({
        name: toolName,
        description: `External tool: ${toolType === 'skill' ? 'Skill' : 'MCP'}`,
        parameters: [],
      });
    }
  }

  return contracts;
}

function toolSchemaToContract(tool: Tool): ToolContract {
  const schema = tool.inputSchema as { type?: string; properties?: Record<string, { type?: string; description?: string }>; required?: string[] } || {};
  const properties = schema.properties || {};
  const required = schema.required || [];

  const parameters = Object.entries(properties).map(([name, prop]) => ({
    name,
    type: prop.type || 'string',
    required: required.includes(name),
    description: prop.description,
  }));

  return {
    name: tool.name,
    description: tool.description || '',
    parameters,
  };
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || !value.trim()) throw new OflowError('INVALID_ARGUMENT', `Missing required string: ${key}`);
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
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new OflowError('INVALID_ARGUMENT', `Missing required object: ${key}`);
  return value as T;
}

function optionalObject<T extends object>(args: Record<string, unknown>, key: string): T | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new OflowError('INVALID_ARGUMENT', `Invalid object: ${key}`);
  return value as T;
}

function arrayArg<T>(args: Record<string, unknown>, key: string): T[] {
  const value = args[key];
  if (!Array.isArray(value)) throw new OflowError('INVALID_ARGUMENT', `Missing required array: ${key}`);
  return value as T[];
}

function requiredStringArray(args: Record<string, unknown>, key: string): string[] {
  const value = args[key];
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new OflowError('INVALID_ARGUMENT', `Missing required string array: ${key}`);
  return value as string[];
}

function optionalBoolean(args: Record<string, unknown>, key: string): boolean | undefined {
  const value = args[key];
  return typeof value === 'boolean' ? value : undefined;
}

function paramsArg(args: Record<string, unknown>, key: string): Record<string, string> {
  const value = objectArg<Record<string, unknown>>(args, key);
  const params: Record<string, string> = {};
  for (const [paramKey, paramValue] of Object.entries(value)) {
    if (typeof paramValue === 'object' && paramValue !== null) throw new OflowError('INVALID_ARGUMENT', `Invalid parameter value: ${paramKey}`);
    params[paramKey] = String(paramValue);
  }
  return params;
}

function optionalStatus(args: Record<string, unknown>): 'active' | 'completed' | 'all' | undefined {
  const value = args.status;
  if (value === 'active' || value === 'completed' || value === 'all') return value;
  return undefined;
}

function optionalInboxStatus(args: Record<string, unknown>): InboxStatus | undefined {
  const value = args.status;
  if (value === 'new' || value === 'seen' || value === 'acted') return value;
  return undefined;
}

function requiredInboxStatus(args: Record<string, unknown>): InboxStatus {
  const status = optionalInboxStatus(args);
  if (!status) throw new OflowError('INVALID_ARGUMENT', 'Missing required string: status');
  return status;
}

function optionalInboxPriority(args: Record<string, unknown>): InboxPriority | undefined {
  const value = args.priority;
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'blocking') return value;
  return undefined;
}

function optionalWorklogMode(args: Record<string, unknown>): WorklogMode | undefined {
  const value = args.mode;
  if (value === 'summary' || value === 'full' || value === 'handoff' || value === 'release_note') return value;
  return undefined;
}
