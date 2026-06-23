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

No `flow_memory_*`, `flow_inbox_*`, `flow_init`, TAPD, or Confluence tools are exposed.

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
| worklog hooks | Not supported |
| inbox/memory/external bindings | Not supported |

Supported check expressions:

- `outputs.foo != null`
- `outputs.foo == null`
- `outputs.foo == 'value'`
- `len(outputs.foo) > N`
- `AND`, `OR`, parentheses

Unsupported expressions fail closed and do not mutate workflow state.

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
4. `workflow_advance` with required outputs and confirmed conditions
5. `workflow_status`
6. Continue `workflow_advance` until completed

## Development

```bash
npm install
npm run build
npm test
```

## Common errors

- **Template not found**: set `OFLOW_MCP_FLOWS_DIR` or copy templates to `~/.oflow-mcp/flows`.
- **Prompt not found**: every step requires `prompts/<step_id>.md`.
- **Checkpoint validation failed**: provide required outputs and confirmed conditions.
- **No branch matched**: pass a `condition_result` matching the branch keys in `next`.
- **Alias already bound**: choose another alias or use the existing instance ID.
