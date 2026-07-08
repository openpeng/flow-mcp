# Confluence MCP 工具安装与使用指南

Confluence MCP 服务器提供 Confluence 知识库的读取和搜索能力，可用于查找历史需求、技术方案、问题记录和踩坑经验。

## 前置检查

调用前确认 MCP 工具列表中是否有以下工具：
- `confluence_page_detail`（读取单页，参数 `cf_url`）
- `confluence搜索`（搜索知识库，参数 `query`）

## 安装配置

### CodeBuddy MCP 配置

在 `~/.codebuddy/.mcp.json` 中添加两个 MCP 服务器：

```json
{
  "mcpServers": {
    "confluence-search": {
      "url": "http://dy.gaodunwangxiao.com/mcp/server/8YplUNg10WS6L5RE/mcp"
    },
    "confluence-read": {
      "url": "http://dy.gaodunwangxiao.com/mcp/server/3HHD6dOdK1eJF1U5/mcp"
    }
  }
}
```

完成后重启 CodeBuddy 或重连 MCP server 即可。

### MCP 服务器说明

| 服务器 | 工具名 | 用途 | URL |
|--------|--------|------|-----|
| Confluence 搜索 | `confluence搜索` | 全文搜索 Confluence 知识库 | `http://dy.gaodunwangxiao.com/mcp/server/8YplUNg10WS6L5RE/mcp` |
| Confluence 读取 | `confluence_page_detail` | 读取指定 Confluence 页面详情 | `http://dy.gaodunwangxiao.com/mcp/server/3HHD6dOdK1eJF1U5/mcp` |

## 使用场景

### 需求分析阶段
- 搜索 Confluence 链接（域名含 `confluence.gaodunwangxiao.com`）获取详细描述
- 搜索相关功能的历史需求和讨论
- 搜索类似需求的技术方案参考
- 搜索已知的注意事项和坑点

### 设计阶段
- 搜索技术方案关键词（业务线名称、功能模块名、技术组件名）
- 搜索历史架构决策（ADR）、设计评审记录
- 搜索相似功能的实现方案和踩坑经验

### 评审阶段
- 搜索依赖系统/模块的历史评审结论和已知问题
- 搜索历史被 BLOCKED 的需求及其原因
- 搜索相关功能的测试策略和覆盖率要求

### 开发排错阶段
- 搜索错误信息或异常关键词
- 搜索相关技术组件的问题记录和解决方案
- 搜索历史 Bug 修复经验和踩坑记录

### 联调阶段
- 搜索涉及的接口/模块名称 + 常见问题关键词
- 搜索依赖系统/服务的已知集成问题和注意事项
- 搜索历史联调异常场景和解决方法

## 典型用法

```
// 搜索知识库
confluence搜索(query="<需求关键词>")

// 读取单页
confluence_page_detail(cf_url="<Confluence 链接地址>")
```

## 注意事项

- Confluence 域名：`confluence.gaodunwangxiao.com`
- 搜索时使用精准关键词，避免过泛的搜索词
- 对搜索结果中的关键页面，使用 `confluence_page_detail` 读取详情
