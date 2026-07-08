# 阿里云日志 MCP 工具安装与使用指南

阿里云日志 MCP Server（`mcp__aliyun-log`）用于查询和分析阿里云 SLS（Simple Log Service）日志，支持查询日志、实时 tail 日志、列出项目和 Logstore 等操作。

## 前置检查

调用前确认 MCP 工具列表中是否有以下工具：
- `sls_query_logs` — 查询日志
- `sls_tail_logs` — 实时 tail 日志
- `sls_list_projects` — 列出可用的日志 Project
- `sls_list_logstores` — 列出指定 Project 下的 Logstore
- `sls_get_credentials` — 确认访问凭据

## 安装配置

### CodeBuddy MCP 配置

在 `~/.codebuddy/.mcp.json` 中添加：

```json
{
  "mcpServers": {
    "aliyun-log": {
      "command": "npx",
      "args": ["-y", "@openpeng/alilog-mcp"],
      "env": {
        "CONSUL_URL": "https://dev-consul.gaodunwangxiao.com",
        "CONSUL_PATH_ENDPOINT": "gaodun/config_center/public/ALI_SLS_ENDPOINT",
        "CONSUL_PATH_AK_ID": "gaodun/config_center/public/ALI_SLS_ACCESS_KEY_ID",
        "CONSUL_PATH_AK_SECRET": "gaodun/config_center/public/ALI_SLS_ACCESS_KEY_SECRET",
        "CRED_SOURCE": "consul"
      }
    }
  }
}
```

完成后重启 CodeBuddy 或重连 MCP server 即可。

### 环境变量说明

| 变量 | 必填 | 说明 |
|------|------|------|
| `CONSUL_URL` | 是 | Consul 配置中心地址 |
| `CONSUL_PATH_ENDPOINT` | 是 | Consul 中 SLS Endpoint 的路径 |
| `CONSUL_PATH_AK_ID` | 是 | Consul 中 SLS AccessKey ID 的路径 |
| `CONSUL_PATH_AK_SECRET` | 是 | Consul 中 SLS AccessKey Secret 的路径 |
| `CRED_SOURCE` | 是 | 凭据来源，固定为 `consul` |

## 主要工具

| 工具 | 用途 |
|------|------|
| `sls_list_projects` | 列出所有可访问的日志 Project |
| `sls_list_logstores` | 列出指定 Project 下的 Logstore |
| `sls_get_credentials` | 确认当前访问凭据是否有效 |
| `sls_query_logs` | 按时间和条件查询日志 |
| `sls_tail_logs` | 实时追踪日志输出 |

## 使用步骤

1. 如果 Project / Logstore 不明确，先调用 `sls_list_projects` 和 `sls_list_logstores` 浏览可用资源
2. 调用 `sls_get_credentials` 确认访问凭据
3. 使用 `sls_query_logs` 执行查询：
   - 优先搜索错误级别日志
   - 搜索问题相关的关键词（接口名、异常类型、模块名等）
   - 关注问题发生时间点前后的异常日志
4. 如果日志量大，使用 `sls_tail_logs` 实时观察日志流

## 使用场景

### 故障排查
- 根据运行环境和项目/服务名确定 Project 和 Logstore
- 确认查询时间窗口（最近 1 小时、今天、昨天等）
- 根据问题描述构造 SLS 查询语句
- 提取关键线索用于根因分析

## 注意事项

- 凭证通过 Consul 配置中心动态获取，首次调用 `sls_get_credentials` 确认可用
- 查询时间范围不宜过大，避免返回过多数据
- 大日志量场景优先使用 `sls_tail_logs` 实时跟踪
