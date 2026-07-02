---
name: oflow-mcp
description: 使用 oflow-mcp MCP 工具执行 AI Agent 原生工作流。当用户提到"开始工作流"、"继续工作流"、"当前步骤"、"推进到下一步"时使用此 skill。
---

# oflow-mcp — AI 操作指南

## 概述

`oflow-mcp` 是一个 Agent 原生工作流内核。工作流以 `flow.yaml + prompts/*.md` 文本定义，通过 checkpoint 校验保证执行质量，每个步骤有持久化状态和审计日志。

作为 AI，你的职责：
1. **理解用户意图**：识别用户要启动工作流、继续当前步骤、查看进度还是其他操作
2. **调用工具**：使用 `workflow_*` 工具完成操作
3. **按 prompt 执行**：每个步骤有 Markdown 指引，你按指引执行具体任务
4. **通过 checkpoint 校验**：推进前必须通过 required outputs、conditions、evidence、approvals 校验
5. **推进工作流**：调用 `workflow_advance` 时携带完整的 outputs 和 confirmed_conditions

---

## 工具清单

| 工具 | 用途 | 关键参数 |
|------|------|----------|
| `workflow_list_templates` | 列出可用模板 | 无 |
| `workflow_get_template` | 获取模板详情和步骤摘要 | `name` |
| `workflow_start` | 启动工作流实例 | `template`, `params`, `alias`(可选) |
| `workflow_current` | 获取当前步骤 + 渲染后的 prompt（默认附带相关记忆） | `instance_id`(可选), `include_memories`(可选) |
| `workflow_advance` | 完成当前步骤并推进 | `instance_id`, `outputs`, `confirmed_conditions`(可选), `condition_result`(可选), `token_consumed`(可选), `evidence`(可选), `approvals`(可选) |
| `workflow_status` | 查看工作流全貌（所有步骤状态 + 输出摘要） | `instance_id` |
| `workflow_list_instances` | 列出实例（按状态/模板过滤） | `status`(可选), `template`(可选) |
| `workflow_bind` | 给实例绑定别名 | `instance_id`, `alias` |
| `workflow_override_prompt` | 覆盖某步骤 prompt（仅当前实例） | `instance_id`, `step_id`, `prompt` |
| `workflow_create_template` | 创建新模板（写入 flow.yaml + prompts/*.md） | `name`, `description`, `params`, `steps`, `prompts` |
| `workflow_events` | 查询工作流审计日志（JSONL） | `instance_id`, `type`(可选), `step_id`(可选), `limit`(可选) |
| `workflow_dashboard` | Agent 控制面板：进度、阻塞项、inbox、建议动作 | `instance_id`(可选), `include_prompt`(可选), `verbose`(可选) |
| `workflow_worklog` | 生成 Markdown 工作记录 | `instance_id`, `mode`(optional) |
| `workflow_inbox_save` | 保存轻量 inbox 条目 | `instance_id`, `entries` |
| `workflow_inbox_list` | 列出 inbox 条目 | `instance_id`, `status`(可选), `priority`(可选) |
| `workflow_inbox_mark` | 标记 inbox 条目状态 | `instance_id`, `entry_ids`, `status` |
| `workflow_validate_template` | 校验模板健康状态 | `name` |
| `workflow_memory_recommend` | 推荐与步骤相关的项目记忆 | `step_name`, `limit`(可选) |

**响应格式**：所有工具返回 JSON 信封 `{ "ok": true, "data": {...} }` 或 `{ "ok": false, "error": { "code": "...", "message": "..." } }`。

---

## 核心工作流

### 阶段 1：识别用户意图

| 用户说 | 你应该做 |
|--------|---------|
| "开始 basic-dev 工作流" | `workflow_start` |
| "继续" / "下一步" | `workflow_current` → 按 prompt 执行 → `workflow_advance` |
| "进度怎么样了？" | `workflow_status` 或 `workflow_dashboard` |
| "检查 current 步骤" | `workflow_current`（默认附带相关记忆摘要） |
| "有什么相关记忆" | `workflow_memory_recommend step_name="需求分析"` |

### 阶段 2：启动工作流

```typescript
// 基本用法
workflow_start(
  template: "basic-dev",
  params: { change_name: "demo" }
)

// 带别名（方便跨会话恢复）
workflow_start(
  template: "basic-dev",
  params: { change_name: "demo" },
  alias: "demo-run"
)
```

**返回值解读**：
```json
{
  "ok": true,
  "data": {
    "instance_id": "wf_20260702120000_abc123",
    "alias": "demo-run",
    "template": "basic-dev",
    "status": "active",
    "version": 1,
    "current_step": { "id": "analyze", "name": "Analyze", "checkpoint": {...} },
    "prompt": "> **相关记忆**...\n\n## 当前任务\n..."
  }
}
```

**关键**：不要只是展示返回值。立即按 `prompt` 指引执行操作。

### 阶段 3：获取当前步骤并执行

```typescript
// 不传参：自动使用最近活跃实例
workflow_current()

// 指定实例 ID 或别名
workflow_current(instance_id: "demo-run")

// 关闭记忆注入（减少 token 消耗）
workflow_current(instance_id: "demo-run", include_memories: false)
```

**prompt 顶部会自动附带相关记忆摘要**：
```
> **相关记忆**（基于项目知识库，仅供参考）:
> - [feedback] api-convention-rest — REST API 约定：kebab-case 端点

## 当前任务
按需分析并输出设计文档...
```

### 阶段 4：推进到下一步

这是最关键的一步。`workflow_advance` 会做 checkpoint 校验，校验不通过则拒绝推进。

```typescript
// 基本推进
workflow_advance(
  instance_id: "demo-run",
  outputs: {
    analysis_summary: "核心功能：用户数据导出。技术方案：异步任务队列。"
  },
  confirmed_conditions: ["analysis_summary 已生成"],
  token_consumed: 1500
)

// 带 evidence 和 approvals
workflow_advance(
  instance_id: "demo-run",
  outputs: { ... },
  confirmed_conditions: [...],
  evidence: { test_log: "All tests passed" },
  approvals: { user_confirmed: true }
)
```

**checkpoint 校验维度**：

| 校验项 | 说明 | 示例 |
|--------|------|------|
| `required_outputs` | 必须提供的产出物 | `analysis_summary`、`design_file_path` |
| `optional_outputs` | 可选产出物（不阻断推进） | `risk_notes` |
| `conditions` | 自然语言确认 + 表达式检查 | `len(outputs.analysis_summary) > 20` |
| `evidence` | 必须附带的证据 | `test_log`、`deploy_result` |
| `approvals` | 需要人工批准的项 | `user_confirmed` |

**校验失败时的响应**：
```json
{
  "ok": false,
  "error": {
    "code": "CHECKPOINT_VALIDATION_FAILED",
    "message": "Missing required output: design_file_path (...)",
    "details": {
      "readiness": "blocked",
      "missing_required": ["design_file_path"],
      "missing_evidence": [],
      "missing_approvals": [],
      "suggestions": ["Complete required output: design_file_path"]
    }
  }
}
```

**你应该做**：阅读 `details.suggestions` 中的建议，补充缺失项后重新调用。

### 阶段 5：条件分支

当步骤的 `next` 是分支映射时，需要传 `condition_result`：

```yaml
# flow.yaml
- id: review
  name: Review
  next:
    pass: publish
    fail: fix
```

```typescript
// 通过 → 进入 publish
workflow_advance(instance_id: "...", outputs: {}, condition_result: "pass")

// 不通过 → 进入 fix
workflow_advance(instance_id: "...", outputs: {}, condition_result: "fail")
```

### 阶段 6：流程完成

当最后一步 `next: null` 且校验通过时，`workflow_advance` 返回：

```json
{
  "ok": true,
  "data": {
    "completed": true,
    "instance_id": "wf_...",
    "status": "completed"
  }
}
```

---

## 记忆注入（Memory Injection）

`workflow_current` 默认会在 prompt 顶部注入步骤相关的项目记忆（来自 CodeBuddy 记忆系统）。

**工作原理**：
```
workflow_current → getCurrent()
  ↓
buildMemoryInjection(step.name)
  → findRelevantMemories("需求分析")
    → 扫描 ~/.codebuddy/projects/*/memory/ 下所有记忆文件
    → 按步骤名称关键词匹配（需求分析→需求/analysis/tapd/...）
    → 返回 top 3（按匹配度排序）
  ↓
prompt 顶部注入记忆摘要
```

**关闭注入**（减少 ~100 tokens）：`workflow_current(include_memories: false)`

**显式推荐**：`workflow_memory_recommend(step_name: "代码开发")` → 返回匹配的记忆列表。

---

## 实例持久化与快照

`oflow-mcp` 有完整的状态保护机制：

- **实例快照**：启动时保存 `template_snapshot` + `prompt_snapshots`，之后模板修改不影响运行中的实例
- **乐观锁**：每个实例有 `version` 字段，并发写会被拒绝（`CONFLICT` 错误）
- **审计日志**：每次关键操作自动写入 `events/<instance_id>.jsonl`
- **工作记录**：`workflow_worklog` 可生成 Markdown 时间线报告

**跨会话恢复**：
```
👤 "继续 demo-run"
🤖 workflow_current(instance_id: "demo-run") → 返回当前步骤 + prompt
```

---

## 完整示例

### 从启动到完成

```
👤 "用 basic-dev 开始 demo 工作流"
🤖 workflow_start(template: "basic-dev", params: { change_name: "demo" }, alias: "demo-run")

   返回：✅ 当前步骤 Analyze
   prompt 包含相关记忆 + 步骤指引
   
🤖 按 prompt 执行：
   1. 分析 change_name=demo 的需求
   2. 输出 analysis_summary
   
🤖 workflow_advance(
     instance_id: "demo-run",
     outputs: { analysis_summary: "核心功能：..." },
     confirmed_conditions: ["analysis_summary 已生成"]
   )
   返回：✅ 已推进到 Design，completed=false
   
🤖 按 Design prompt 执行：
   1. 设计技术方案
   2. 输出 design_doc
   
🤖 workflow_advance(
     instance_id: "demo-run",
     outputs: { design_doc: "技术方案：..." },
     confirmed_conditions: ["设计文档已完成"]
   )

   返回：✅ completed=true，工作流结束
```

### 查看进度

```
👤 "demo-run 到哪了？"
🤖 workflow_status(instance_id: "demo-run")
   返回：
   ✅ Analyze — completed
   🔄 Design  — in_progress  ← 当前
   ⬜ Verify  — pending
```

### 打开控制面板

```
👤 "打开 demo-run 的仪表盘"
🤖 workflow_dashboard(instance_id: "demo-run", include_inbox: true)
   返回：
   - progress: 1/3 completed, risk: low
   - current_step: Design (in_progress)
   - checkpoint blockers: (none)
   - inbox: 0 unread
   - suggested_actions: [advance to next step]
```

---

## 常见错误处理

### CHECKPOINT_VALIDATION_FAILED
```
error.code = "CHECKPOINT_VALIDATION_FAILED"
```
查看 `error.details.missing_required` / `missing_evidence` / `missing_approvals`，按 `suggestions` 补充后重试。

### NOT_FOUND
```
error.code = "NOT_FOUND"
```
实例 ID 或别名不存在。用 `workflow_list_instances` 查找。

### CONFLICT
```
error.code = "CONFLICT"
```
实例版本冲突（并发写入），重新获取后重试。或实例已完成无法继续。

### TOKEN_BUDGET_EXHAUSTED
```
error.code = "TOKEN_BUDGET_EXHAUSTED"
```
当前实例的 token 预算已耗尽，无法继续推进。

---

## 最佳实践

1. **主动执行，而非被动提示**：拿到 prompt 后立即按指引操作，不要只是展示给用户
2. **理解 checkpoint 的意义**：每个校验项都是质量保证，不要为了推进而推进
3. **善用别名**：`workflow_start` 时设置 `alias`，后续通过别名恢复
4. **完整记录 outputs**：即使不在 `required_outputs` 中，也建议记录关键信息供后续步骤引用
5. **遇到校验失败时不盲目重试**：先读 `details.suggestions`，补充缺失项后再推进
6. **利用记忆注入**：`workflow_current` 默认附带相关记忆，让 AI 在上下文中自然获取项目知识
7. **使用 dashboard 诊断**：卡住时调用 `workflow_dashboard` 查看 blocker 和建议动作

---

## 变量插值

Prompt 文件支持两种变量：

### 启动参数
```markdown
变更名称：{{change_name}}
```

### 前序步骤产出物
```markdown
分析结果：{{steps.analyze.outputs.analysis_summary}}
```

调用 `workflow_advance` 时务必提供完整的 `outputs`，这些值会被注入到后续步骤的 prompt 中。

---

## 检查表达式

Checkpoint 的 `conditions.check` 支持：
- `outputs.foo != null` / `outputs.foo == null`
- `outputs.foo == 'value'`
- `len(outputs.foo) > N`
- `AND`、`OR`、括号组合

不支持的表达式会以 `fail closed` 拒绝推进，不改变工作流状态。

---

*最后更新：2026-07-02*
