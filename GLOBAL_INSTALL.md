# 全局安装配置指南

## 1. 技能已安装到全局

oflow-mcp 技能已安装到全局技能目录：
```
c:\Users\张红梅\.trae-cn\builtin\global\skills\oflow-mcp\SKILL.md
```

## 2. MCP 工具已链接到全局 npm

oflow-mcp 已通过 `npm link` 安装到全局，可以在任意位置使用：
```bash
oflow-mcp
```

## 3. 手动配置到 TRAE Work

由于权限限制，需要手动将以下配置添加到 TRAE Work 的 MCP 配置文件中：

**文件路径**：
```
c:\Users\张红梅\AppData\Roaming\TRAE SOLO CN\User\mcp.json
```

**添加内容**（在 `mcpServers` 对象中添加）：
```json
    "oflow-mcp": {
      "command": "oflow-mcp",
      "args": [],
      "env": {}
    }
```

完整配置示例：
```json
{
  "mcpServers": {
    "Time": {
      "command": "uvx",
      "args": ["mcp-server-time", "--local-timezone=Asia/Shanghai"],
      "env": {},
      "fromGalleryId": "byted-mcp-volcengine.time"
    },
    "gitee": {
      "command": "npx",
      "args": ["-y", "@gitee/mcp-gitee@latest"],
      "env": { "GITEE_ACCESS_TOKEN": "..." },
      "fromGalleryId": "byted-mcp-volcengine.gitee"
    },
    "oflow-mcp": {
      "command": "oflow-mcp",
      "args": [],
      "env": {}
    }
  }
}
```

## 4. 验证安装

配置完成后，重启 TRAE Work，然后在对话中输入：
```
/mcp
```
查看 oflow-mcp 是否出现在 MCP Server 列表中。
