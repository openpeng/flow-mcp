# TAPD MCP 工具安装与使用指南

TAPD MCP Server 提供 38 个工具，覆盖 8 类 TAPD 资源：Story、Task、Bug、Iteration、Release、Comment、Timesheet、Attachment，外加自定义字段查询/写入、URL 解析、变更历史、workspace 成员名册与代码关联。

## 前置检查

调用任何 `tapd_*` 工具前，先确认 MCP server 已在当前会话注册：
- 当前工具列表里能看到 `tapd_get_story` 等 `tapd_*` 工具 → 已就绪，跳过安装
- 看不到任何 `tapd_*` 工具 → 按下方步骤安装

## 安装配置

### CodeBuddy MCP 配置

在 `~/.codebuddy/.mcp.json` 中添加：

```json
{
  "mcpServers": {
    "tapd": {
      "command": "npx",
      "args": ["-y", "tapd-mcp"],
      "env": {
        "TAPD_API_TOKEN": "在 https://www.tapd.cn/personal_settings/index?tab=personal_token 申请",
        "TAPD_WORKSPACE_ID": "必须，类似https://www.tapd.cn/tapd_fe/37748852/iteration/card/1137748852001004214?q=170a5171b409a4bdc53fe2d9168f45c8中的37748852就是workspace id",
        "TAPD_CURRENT_USER": "必须：中文，你的 TAPD 用户名，与 TAPD 页面显示的一致，用于识别『我』",
        "TAPD_CACHE_DIR": "可选：字段 schema 缓存目录，缺省 ~/.tapd-mcp/cache",
        "TAPD_STORY_CONFIG": "可选：创建 story 后自动补归属字段的规则（JSON 字符串，详见下方 §归属字段配置）"
      }
    }
  }
}
```

完成后重启 agent 或重连 MCP server 即可。

### 环境变量说明

| 变量 | 必填 | 说明 |
|------|------|------|
| `TAPD_API_TOKEN` | **是** | TAPD API Token，在 [TAPD 开放平台](https://www.tapd.cn/tapd_api_token/token) 申请 |
| `TAPD_WORKSPACE_ID` | 否 | 默认 workspace id，设置后调用工具时可省略此参数 |
| `TAPD_CURRENT_USER` | 否 | TAPD 用户名（与 TAPD 页面显示一致），用于识别"我" |
| `TAPD_CACHE_DIR` | 否 | 字段 schema 缓存目录，默认 `~/.tapd-mcp/cache` |
| `TAPD_STORY_CONFIG` | 否 | 创建 Story 后自动补归属字段的规则 JSON 字符串 |

### 故障排查

| 错误信息 | 原因 | 解决方式 |
|----------|------|----------|
| `TAPD_API_TOKEN environment variable is required` | Token 未配置 | 在 env 中添加 `TAPD_API_TOKEN` |
| `Unknown tool: tapd_*` 或工具不可见 | 配置未生效 | 重启 / 重连 MCP |
| `TAPD API error: 401 / 403` | Token 失效或越权 | 检查 Token 是否有该 workspace 的访问权限 |
| `Invalid TAPD URL` | URL 格式不支持 | 改用 `workspace_id` + `id` 显式传参 |

## 工具速查表（38 个）

| 资源 | 读 | 写 |
|------|------|------|
| Story | `tapd_get_story`, `tapd_list_stories`, `tapd_get_story_commits`, `tapd_get_story_changes` | `tapd_create_story`, `tapd_update_story`, `tapd_set_story_custom_field`, `tapd_apply_story_defaults` |
| Task | `tapd_get_task`, `tapd_list_tasks` | `tapd_create_task`, `tapd_update_task` |
| Bug | `tapd_get_bug`, `tapd_list_bugs`, `tapd_get_story_related_bugs` | `tapd_create_bug`, `tapd_update_bug` |
| Iteration | `tapd_get_iteration`, `tapd_list_iterations` | `tapd_create_iteration`, `tapd_update_iteration` |
| Release | `tapd_get_release`, `tapd_list_releases` | `tapd_create_release`, `tapd_update_release` |
| Comment | `tapd_list_comments` | `tapd_add_comment` |
| Timesheet | `tapd_list_timesheets` | `tapd_add_timesheet`, `tapd_update_timesheet`, `tapd_delete_timesheet` |
| Attachment | `tapd_list_attachments` | `tapd_upload_attachment` |
| Custom Fields | `tapd_get_custom_fields_settings` | — |
| Config | `tapd_get_config` | — |
| Util | `tapd_parse_url`, `tapd_get_current_user`, `tapd_list_workspace_users` | — |

## 关键约定

### workspace_id
- 大多数工具需要 `workspace_id`。环境变量 `TAPD_WORKSPACE_ID` 存在时可省略，否则必填。
- `tapd_get_story` / `tapd_get_task` / `tapd_get_bug` 支持 `url` 参数，可不提供 `workspace_id`。
- 不知道 wsid 又没默认值时，先调 `tapd_parse_url` 从链接解析。

### 识别"我"
- `tapd_get_current_user` 返回 API token 持有者的身份。
- 用户问"我负责的"、"分配给我"等相对身份问题时，先调用此工具拿到 user id。

### fields 字段裁剪（Story 的 get/list）
- 不传 / 空 → 默认 `id,name,status`（轻量）
- 传 `"id,name,status,owner,priority,description,iteration_id,created"` → 按需返回
- 传 `"*"` 或 `"all"` → 返回全部 ~260 字段（慎用）

### 需求描述中的图片处理

TAPD 需求的描述字段为 HTML 富文本，常包含 `<img>` 标签嵌入的图片（设计稿、流程图、截图等）。文字描述往往无法完全传达视觉信息，需要用专用工具下载图片后进行视觉分析。

**方式一（推荐）：`tapd_get_story` 自动下载**

获取 Story 时传入 `download_images=true`，自动下载描述中的所有内联图片：

```
tapd_get_story workspace_id="..." id="<需求ID>" fields="*" download_images=true
```

返回结果包含 `_images: { count, items: [{local_path, ...}], errors }`。`count=0` 表示描述中无图片，否则直接读取 `_images.items[].local_path` 文件进行视觉分析。这是最简单的方式，一步完成需求获取和图片下载。

**方式二（按需）：`tapd_get_image` 单独下载**

用于未走自动下载的场景（如 Task 类型、外部引用图片）：

```
tapd_get_image workspace_id="..." image_path="/tfl/captures/2026-06/tapd_xxx.png"
```

`image_path` 从描述 HTML 的 `<img src="...">` 中提取，支持两种格式：
- TAPD 相对路径：`/tfl/captures/2026-06/tapd_xxx.png`
- 完整 URL：`https://www.tapd.cn/tfl/captures/2026-06/tapd_xxx.png`

返回 `{ image_path, local_path, mime_type, size }`，读取 `local_path` 文件进行视觉分析。

**常见图片场景**：
- **设计稿/原型图** → 理解 UI 布局、交互流程、视觉规范
- **流程图/架构图** → 理解业务流程、状态变迁、分支逻辑
- **截图/标注** → 理解 Bug 现象、期望效果、问题位置
- **数据表格截图** → 提取数据结构和内容

**图片分析输出**：将图片解读结果纳入需求分析，确保对需求的完整理解（文字 + 视觉）。

### 状态枚举（写入用英文 key）
- Story：`planning` / `developing` / `testing` / `resolved` / `closed` / `rejected`
- Task：`open` / `progressing` / `done`
- Bug：`new` / `in_progress` / `resolved` / `verified` / `closed` / `rejected` / `reopened`
- 优先级：`1`~`4`，`1=最高`

### URL 解析
支持的格式：
- `tapd.cn/tapd_fe/<wsid>/story/detail/<id>`
- `tapd.cn/tapd_fe/<wsid>/<type>/view/<id>`
- `tapd.cn/<wsid>/prong/<type>/view/<id>`

## 归属字段配置

创建 Story 后的归属字段补全机制（env 驱动）：

**1. 配置 `TAPD_STORY_CONFIG` 环境变量（JSON 字符串）：**

```json
{
  "workspaces": {
    "37748852": {
      "story_defaults": {
        "需求类型": "业务需求",
        "成本归属": "科技研发中心/科技研发中心/所有项目平摊成本"
      },
      "story_field_rules": {
        "项目归属": [
          { "match": "题库",                  "value": "常规项目/题库" },
          { "match": "财经云|课程",           "value": "常规项目/课程产品" },
          { "match": "acca|中级经济师|机考",  "value": "常规项目/机考" },
          { "match": "cfa.*出海",             "value": "常规项目/CFA出海" },
          { "match": "ep5|预测分|备考计划",   "value": "战略项目/EP5" }
        ]
      }
    }
  }
}
```

语义：
- `story_defaults`：无条件默认值
- `story_field_rules`：按 Story 名做大小写不敏感正则匹配，第一条命中即赢
- 简写：单 workspace 可省 `workspaces` 外层
- 改完规则需重启 MCP server

**2. 创建 Story 后一键补齐：**

```
tapd_create_story workspace_id="..." name="题库后台导出 csv"
tapd_apply_story_defaults workspace_id="..." story_id="..."
```

`tapd_apply_story_defaults` 按优先级合成字段值并写入：`overrides` > `story_defaults` > `story_field_rules`。

> cascade 字段值必须用 `/` 作为完整路径分隔符。最稳的探路办法：`tapd_list_stories fields="id,custom_field_X" iteration_id="<近期迭代>" limit=10` 抄已有 Story 的现成值。

## 常见坑

- `tapd_list_stories` 的 `status` 过滤只接受英文 key，传中文筛不到
- `fields="*"` 会返回 ~260 列，只在单条详情里用
- `effort` / `effort_completed` / `timespent` 必须是字符串数字（`"8"`），别传 number
- `tapd_list_bugs` 返回的缺陷 `story_id` 恒为 null，获取需求关联缺陷用 `tapd_get_story_related_bugs`
- `tapd_update_timesheet` / `tapd_delete_timesheet` 需 API token 额外勾选对应权限
- 字段 schema 缓存可能过期，给 `refresh=true` 强刷
- 写空字符串清字段：`tapd_set_story_custom_field value=""` 显式放行

## 详细文档

完整技能文档参考：https://gitlab.gaodun.com/gaodun/skills/blob/master/tapd-mcp/SKILL.md
