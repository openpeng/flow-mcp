# oflow-mcp

> Agent-native workflow kernel. 工作流不必只能是 Dify、n8n 或扣子。

`oflow-mcp` is a workflow-only MCP server. It treats workflow as an open execution protocol for AI Agents: text-defined, versionable, checkpointed, recoverable, and callable through MCP tools.

## Product positioning

Traditional workflow platforms often center on visual canvases, proprietary node graphs, and hosted platform state. `oflow-mcp` starts from a different premise:

- **Agent native**: prompts, outputs, checkpoints, and step state are first-class workflow concepts.
- **Text is the source of truth**: workflows are `flow.yaml + prompts/*.md`, so they can be reviewed, diffed, versioned, and reused.
- **Verifiable execution**: each step can require outputs, natural confirmations, deterministic checks, and persisted state.
- **Local-first kernel**: the first version runs on MCP + filesystem; UI, connectors, triggers, remote execution, and enterprise governance can layer on top later.
- **Replacement path, not a plugin**: the long-term goal is to replace the core capabilities of general workflow tools such as Dify, n8n, and Coze/扣子, starting with the execution kernel.

## Non-goals for the first release

This first release intentionally excludes:

- TAPD, Confluence, GitLab, CI, or IM integrations
- memory, inbox, init, or instructions tools from `flow-mcp`
- visual canvas UI
- database storage
- multi-tenant permissions

## Install

```bash
npm install
npm run build
```

## Start

```bash
npm start
```

MCP configuration example:

```json
{
  "mcpServers": {
    "oflow-mcp": {
      "command": "node",
      "args": ["/path/to/oflow-mcp/dist/index.js"],
      "env": {
        "OFLOW_MCP_FLOWS_DIR": "/path/to/oflow-mcp/flows",
        "OFLOW_MCP_DATA_DIR": "/tmp/oflow-mcp-instances"
      }
    }
  }
}
```

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `OFLOW_MCP_HOME` | `~/.oflow-mcp` | Base data directory |
| `OFLOW_MCP_FLOWS_DIR` | `$OFLOW_MCP_HOME/flows` | Workflow template directory |
| `OFLOW_MCP_DATA_DIR` | `$OFLOW_MCP_HOME/instances` | Workflow instance directory |

## Tools

`oflow-mcp` exposes only workflow tools:

| Tool | Description |
| --- | --- |
| `workflow_list_templates` | List available templates |
| `workflow_get_template` | Get template details |
| `workflow_start` | Start a workflow instance |
| `workflow_current` | Get current step and rendered prompt |
| `workflow_advance` | Complete current step and advance |
| `workflow_status` | Show full instance status |
| `workflow_list_instances` | List instances |
| `workflow_bind` | Bind alias to an instance |
| `workflow_override_prompt` | Override one step prompt for one instance |
| `workflow_create_template` | Create a template from YAML-like data and prompts |
| `workflow_events` | Query append-only event log by instance/type/step/limit |
| `workflow_dashboard` | Show Agent control-plane state, checkpoint blockers, inbox summary, and suggested actions |
| `workflow_worklog` | Generate a Markdown worklog from instance state and events |
| `workflow_inbox_save` | Save lightweight inbox entries for an instance |
| `workflow_inbox_list` | List lightweight inbox entries |
| `workflow_inbox_mark` | Mark inbox entries as `new`, `seen`, or `acted` |
| `workflow_validate_template` | Report template health issues such as unreachable steps and invalid prompt references |

No `flow_memory_*`, `flow_init`, TAPD, or Confluence tools are exposed. `workflow_inbox_*` is a local lightweight inbox for workflow control-plane coordination; it does not call external systems.

## Template structure

```text
flows/
  basic-dev/
    flow.yaml
    prompts/
      analyze.md
      design.md
      verify.md
```

Minimal `flow.yaml`:

```yaml
name: basic-dev
description: Minimal Agent-native development workflow
params:
  change_name:
    type: string
    required: true
steps:
  - id: analyze
    name: Analyze
    checkpoint:
      required_outputs:
        analysis_summary:
          type: string
          min_length: 20
      optional_outputs:
        risk_notes:
          type: string
      evidence:
        - key: test_log
          required: true
          description: Test log or command output
      approvals:
        - key: user_confirmed
          required: false
          description: User approval when needed
      conditions:
        - natural: analysis_summary has been produced
          check: outputs.analysis_summary != null AND len(outputs.analysis_summary) > 20
    next: design
  - id: design
    name: Design
    next: null
```

Prompt variables:

- `{{change_name}}` reads workflow params.
- `{{steps.analyze.outputs.analysis_summary}}` reads prior step outputs.
- Unresolved variables are left unchanged for debugging.

## DSL support matrix

| Feature | Status |
| --- | --- |
| `params` object and string-array compatibility | Supported |
| `steps` with `id`, `name`, `checkpoint`, `next` | Supported |
| `next` as string/null/object branch map | Supported |
| `prompts/<step_id>.md` | Supported |
| `required_outputs` array or object | Supported |
| natural conditions | Supported |
| deterministic `check` expressions | Supported subset |
| `token_budget.total` and `token_consumed` | Supported |
| loops | Not supported in first release |
| optimization hints | Not supported |
| worklog generation | Supported through `workflow_worklog` |
| local inbox | Supported through `workflow_inbox_*`; no external sync |
| memory/external bindings | Not supported |

Supported check expressions:

- `outputs.foo != null`
- `outputs.foo == null`
- `outputs.foo == 'value'`
- `len(outputs.foo) > N`
- `AND`, `OR`, parentheses

Unsupported expressions fail closed and do not mutate workflow state.

## Control plane tools

`workflow_events` accepts:

```json
{ "instance_id": "wf_...", "type": "step.completed", "step_id": "verify", "limit": 50 }
```

`limit` defaults to 50 and is capped at 200. Malformed JSONL audit lines are skipped so one bad event does not hide the rest.

`workflow_dashboard` accepts:

```json
{
  "instance_id": "wf_...",
  "include_prompt": true,
  "include_recent_events": true,
  "include_inbox": true
}
```

The dashboard reports checkpoint blockers and suggested actions. It summarizes outputs with keys and short previews rather than returning full output payloads.

`workflow_worklog` returns `{ "markdown": "...", "summary": { ... } }` and does not write files. The generated Markdown includes step timeline, output summaries, validation failures, and current state.

`workflow_inbox_save/list/mark` stores local coordination items under `OFLOW_MCP_DATA_DIR/inbox/<instance_id>.json`. Deduplication uses `external_id` first; otherwise it uses `source + type + title + date`. These tools do not call Git, CI, TAPD, IM, or review systems.

`workflow_validate_template` returns `{ "valid": boolean, "errors": [], "warnings": [] }` for control-plane health checks including unreachable steps, invalid checkpoint expressions, undeclared prompt params, missing step references, and duplicate evidence/approval keys.

## Kernel hardening

The workflow kernel includes the first P0/P1 hardening batch:

- Template names, step ids, instance ids, and aliases are validated before file access.
- Template, instance, and event paths are resolved inside their configured base directories to prevent path traversal.
- Instances carry a `version` field and state writes use optimistic locking to reject stale saves.
- Running instances store `template_snapshot` and `prompt_snapshots`, so later template edits do not change in-flight workflow semantics.
- Key runtime transitions are appended to `events/<instance_id>.jsonl` for audit/debug.
- Prompt, outputs, and instance payload sizes are bounded.
- `workflow_status` returns output keys and short previews rather than full outputs by default.
- Tool responses are JSON envelopes: `{ "ok": true, "data": ... }` or `{ "ok": false, "error": ... }`.

## Example lifecycle

1. `workflow_list_templates`
2. `workflow_start`:

```json
{
  "template": "basic-dev",
  "params": { "change_name": "demo" },
  "alias": "demo-run"
}
```

3. `workflow_current` with `demo-run`
4. `workflow_dashboard` to inspect blockers and suggested actions
5. `workflow_advance` with required outputs, confirmed conditions, and any required evidence/approvals
6. `workflow_events` or `workflow_worklog` for audit/debug
7. Continue `workflow_advance` until completed

## Development

```bash
npm install
npm run build
npm test
```

## Common errors

- **Template not found**: set `OFLOW_MCP_FLOWS_DIR` or copy templates to `~/.oflow-mcp/flows`.
- **Prompt not found**: every step requires `prompts/<step_id>.md`.
- **Checkpoint validation failed**: provide required outputs, confirmed conditions, and any required evidence/approvals.
- **No branch matched**: pass a `condition_result` matching the branch keys in `next`.
- **Alias already bound**: choose another alias or use the existing instance ID.
