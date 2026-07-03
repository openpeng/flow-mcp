# oflow-mcp 全自动安装指南

> **本文档面向 AI Agent**。AI 读取此文档后，应按步骤自动执行安装，完成后自动验证。
> 用户只需提供一个指向此文档的 URL，AI 即可全自动完成所有安装步骤。

---

## 安装总览

安装 oflow-mcp 需要完成以下步骤：

| 步骤 | 内容 | 需要重启？ |
|------|------|-----------|
| 1 | 安装 Node.js（如果未安装） | 否 |
| 2 | 获取源码 | 否 |
| 3 | 编译项目 | 否 |
| 4 | 注册全局命令 | 否 |
| 5 | 配置 MCP Server | **是**（需重启 AI 客户端） |
| 6 | 安装 Skill | **是**（需重启 AI 客户端） |
| 7 | 自动验证 | 需在重启后执行 |

步骤 5 和 6 的**重启只需一次**，最后统一重启即可。

---

## 前置条件检测

**AI 应首先执行以下检测命令：**

```powershell
# 检测 Node.js
node --version
# 期望输出: v18+ 或更高

# 检测 npm
npm --version
# 期望输出: 9+ 或更高

# 检测操作系统
$env:OS                    # Windows
uname -s                    # macOS / Linux
```

如果 Node.js 未安装：
- **Windows**: 提示用户从 https://nodejs.org 下载 LTS 版本安装
- **macOS**: 建议使用 `brew install node`
- **Linux**: 建议使用 `curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs`

---

## 步骤 1-4：安装与编译

### 方式 A：从源码安装（推荐，适用于贡献者和自定义部署）

```powershell
# Windows (PowerShell)
cd <WORKSPACE>              # 切换到用户指定的或默认的工作目录
git clone https://gitee.com/<OWNER>/oflow-mcp.git   # 或 GitHub 地址
cd oflow-mcp
npm install
npm run build
npm link                    # 注册全局命令
```

```bash
# macOS / Linux (Bash)
cd <WORKSPACE>
git clone https://gitee.com/<OWNER>/oflow-mcp.git
cd oflow-mcp
npm install
npm run build
sudo npm link               # 注册全局命令
```

### 方式 B：从 npm 安装（适用于普通用户，需先 npm publish）

```bash
npm install -g oflow-mcp
# 安装后 oflow-mcp 命令自动可用，无需单独 npm link
```

**编译完成后验证：**
```powershell
oflow-mcp --version          # 应输出版本号，或正常启动 MCP stdio 协议
# 如果命令未找到，说明 npm link 或全局 PATH 有问题
```

---

## 步骤 5：配置 MCP Server

根据用户使用的 AI 客户端，自动检测并写入对应的 MCP 配置文件。

### AI 自动检测逻辑

AI 应按以下顺序检测用户使用的客户端：

```
1. 检查 $HOME/.trae-cn 或 $HOME/.trae 目录是否存在       → TRAE
2. 检查 $HOME/.cursor/mcp.json 是否存在                  → Cursor
3. 检查 $HOME/.windsurf/mcp.json 是否存在                → Windsurf
4. 检查 %APPDATA%\Claude\claude_desktop_config.json      → Claude Desktop (Windows)
5. 检查 $HOME/Library/Application Support/Claude/...     → Claude Desktop (macOS)
6. 检查项目 .vscode/cline_mcp_settings.json 是否存在     → Cline
7. 以上都不存在 → 询问用户使用哪个客户端
```

### 各客户端配置详情

#### TRAE（含 TRAE SOLO CN）

**配置文件路径：**

| 级别 | Windows | macOS / Linux |
|------|---------|---------------|
| 全局 | `%APPDATA%\TRAE SOLO CN\User\mcp.json` | `~/.trae-cn/mcp.json` |
| 项目 | `<项目>/.trae/mcp.json` | `<项目>/.trae/mcp.json` |

**需要写入的配置：**

如果 `npm link` 全局注册成功（方式 A）：
```json
{
  "mcpServers": {
    "oflow-mcp": {
      "command": "oflow-mcp",
      "args": [],
      "env": {
        "OFLOW_MCP_FLOWS_DIR": "<oflow-mcp源码目录>/flows",
        "OFLOW_MCP_DATA_DIR": "$OFLOW_MCP_HOME/instances"
      }
    }
  }
}
```

如果使用 npx 方式（方式 B，推荐用于快速体验）：
```json
{
  "mcpServers": {
    "oflow-mcp": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "oflow-mcp"],
      "env": {}
    }
  }
}
```

> **注意**：Windows 上必须使用 `"command": "cmd", "args": ["/c", "npx", ...]`，不能直接用 `"command": "npx"`。macOS/Linux 可直接使用 `"command": "npx"`。

**写入命令（Windows PowerShell 示例）：**

```powershell
$mcpPath = "$env:APPDATA\TRAE SOLO CN\User\mcp.json"
$config = Get-Content -Path $mcpPath -Raw -Encoding UTF8 | ConvertFrom-Json

# 检查是否已存在
if ($config.mcpServers.PSObject.Properties.Name -contains "oflow-mcp") {
    Write-Host "oflow-mcp MCP already configured, skipping."
} else {
    $oflowConfig = @{
        command = "oflow-mcp"
        args = @()
        env = @{
            "OFLOW_MCP_FLOWS_DIR" = "<实际源码路径>\flows"
        }
    }
    $config.mcpServers | Add-Member -MemberType NoteProperty -Name "oflow-mcp" -Value $oflowConfig
    $config | ConvertTo-Json -Depth 10 | Set-Content -Path $mcpPath -Encoding UTF8
    Write-Host "oflow-mcp MCP configured successfully."
}
```

#### Cursor

**配置文件路径：**

| 级别 | Windows | macOS / Linux |
|------|---------|---------------|
| 全局 | `%USERPROFILE%\.cursor\mcp.json` | `~/.cursor/mcp.json` |
| 项目 | `<项目>/.cursor/mcp.json` | `<项目>/.cursor/mcp.json` |

**需要写入的配置：**

```json
{
  "mcpServers": {
    "oflow-mcp": {
      "command": "oflow-mcp",
      "args": [],
      "env": {}
    }
  }
}
```

> Windows 上同样需要注意 npx 的 `cmd /c` 问题。

#### Claude Desktop

**配置文件路径：**

| 平台 | 路径 |
|------|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows (常规安装) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Windows (Microsoft Store) | `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

**需要写入的配置（写入到 mcpServers 对象中）：**

```json
{
  "mcpServers": {
    "oflow-mcp": {
      "command": "oflow-mcp",
      "args": [],
      "env": {}
    }
  }
}
```

#### Windsurf

**配置文件路径：**

| 级别 | Windows | macOS / Linux |
|------|---------|---------------|
| 全局 | `%USERPROFILE%\.windsurf\mcp.json` | `~/.windsurf/mcp.json` |
| 项目 | `<项目>/.windsurf/mcp.json` | `<项目>/.windsurf/mcp.json` |

**需要写入的配置（格式同 Cursor）：**

```json
{
  "mcpServers": {
    "oflow-mcp": {
      "command": "oflow-mcp",
      "args": [],
      "env": {}
    }
  }
}
```

#### Cline (VSCode 插件)

**配置文件路径：** `<项目>/.vscode/cline_mcp_settings.json`

**需要写入的配置：**

```json
{
  "mcpServers": {
    "oflow-mcp": {
      "command": "oflow-mcp",
      "args": [],
      "env": {},
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### 写入注意事项（AI 必须遵守）

1. **先读取再写入**：使用 Read 工具读取现有配置文件，解析 JSON 后合并，切勿覆盖已有配置
2. **幂等性**：如果 `oflow-mcp` 配置已存在，跳过写入并提示用户
3. **JSON 格式**：写入时使用 `ConvertTo-Json -Depth 10`（PowerShell）或 `jq`（Bash）确保 JSON 格式正确
4. **编码**：Windows 上务必使用 UTF-8 编码写入

---

## 步骤 6：安装 Skill

### TRAE 的 Skill 安装

TRAE 是目前唯一支持 Skill 机制的主流客户端。其他客户端（Cursor、Claude Desktop、Windsurf、Cline）无需此步骤。

#### Skill 安装路径

| 级别 | 路径 | 适用场景 |
|------|------|---------|
| 全局（推荐） | `~/.trae-cn/builtin/global/skills/oflow-mcp/SKILL.md` | 所有项目可用 |
| 项目级 | `<项目>/.trae/skills/oflow-mcp/SKILL.md` | 仅当前项目 |

**推荐安装到全局**，这样所有项目都能使用工作流功能。

#### 安装命令（Windows PowerShell）

```powershell
# 创建目标目录
$skillDir = "$env:USERPROFILE\.trae-cn\builtin\global\skills\oflow-mcp"
if (-not (Test-Path $skillDir)) {
    New-Item -ItemType Directory -Path $skillDir -Force | Out-Null
}

# 复制 SKILL.md
Copy-Item -Path "<oflow-mcp源码目录>\SKILL.md" -Destination "$skillDir\SKILL.md" -Force
Write-Host "Skill installed to: $skillDir"
```

#### 安装命令（macOS / Linux）

```bash
# 创建目标目录
SKILL_DIR="$HOME/.trae-cn/builtin/global/skills/oflow-mcp"
mkdir -p "$SKILL_DIR"

# 复制 SKILL.md
cp "<oflow-mcp源码目录>/SKILL.md" "$SKILL_DIR/SKILL.md"
echo "Skill installed to: $SKILL_DIR"
```

#### 验证 Skill 安装

```powershell
# 检查文件是否存在且包含正确的 frontmatter
$skillFile = "$env:USERPROFILE\.trae-cn\builtin\global\skills\oflow-mcp\SKILL.md"
if (Test-Path $skillFile) {
    $content = Get-Content $skillFile -Raw
    if ($content -match 'name:\s*oflow-mcp') {
        Write-Host "Skill installation verified: OK" -ForegroundColor Green
    } else {
        Write-Host "Skill frontmatter is invalid!" -ForegroundColor Red
    }
} else {
    Write-Host "Skill file not found!" -ForegroundColor Red
}
```

### 非 TRAE 客户端

Cursor、Claude Desktop、Windsurf、Cline 不支持 Skill 机制，跳过此步骤。
oflow-mcp 的 AI 操作指南（SKILL.md）可以作为独立文档提供给用户参考，但不会被自动加载。

---

## 步骤 7：自动验证

**在重启 AI 客户端后，执行以下验证。**

> **AI 注意**：如果 AI 无法自行重启客户端，应提示用户重启，并在用户确认重启后继续执行验证。

### 验证 MCP Server 连接

**方法 1：通过 MCP 工具调用验证（推荐）**

如果 AI 自身能够调用 MCP 工具，直接调用：
```
调用 workflow_list_templates 工具
期望结果：返回可用工作流模板列表（如 basic-dev）
如果工具不存在或调用失败，说明 MCP Server 未正确连接
```

**方法 2：通过命令行验证 MCP Server 可执行性**

```powershell
# 验证 oflow-mcp 命令可用
oflow-mcp --version 2>&1
# 或者测试 MCP stdio 协议能否启动
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | oflow-mcp
# 期望输出：JSON-RPC 响应，包含 MCP Server 能力信息
```

```bash
# macOS / Linux
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | oflow-mcp
```

### 验证配置文件

```powershell
# Windows - 验证 TRAE MCP 配置
$mcpPath = "$env:APPDATA\TRAE SOLO CN\User\mcp.json"
$config = Get-Content $mcpPath -Raw | ConvertFrom-Json
if ($config.mcpServers."oflow-mcp") {
    Write-Host "MCP config verified: OK" -ForegroundColor Green
    $config.mcpServers."oflow-mcp" | ConvertTo-Json
} else {
    Write-Host "MCP config NOT found!" -ForegroundColor Red
}

# 验证 Skill 安装
$skillFile = "$env:USERPROFILE\.trae-cn\builtin\global\skills\oflow-mcp\SKILL.md"
if (Test-Path $skillFile) {
    Write-Host "Skill file verified: OK" -ForegroundColor Green
} else {
    Write-Host "Skill file NOT found!" -ForegroundColor Red
}
```

### 验证结果汇总

AI 应向用户报告以下验证结果：

| 检查项 | 期望结果 | 命令/方法 |
|--------|---------|-----------|
| `oflow-mcp` 命令可用 | 命令找到且可执行 | `oflow-mcp --version` |
| MCP 配置已写入 | `oflow-mcp` 出现在配置中 | 读取 mcp.json |
| MCP Server 已连接 | `workflow_*` 工具可调用 | 调用 `workflow_list_templates` |
| Skill 已安装（TRAE） | SKILL.md 在正确路径 | `Test-Path $skillFile` |
| 工作流模板可访问 | 返回模板列表 | 调用 `workflow_list_templates` |

---

## 故障排除

### 常见问题及解决

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| `oflow-mcp: command not found` | npm link 失败或 PATH 问题 | 重新执行 `npm link`，检查 `$env:PATH` |
| MCP 配置写入失败 | JSON 格式错误或权限不足 | 使用 `ConvertTo-Json -Depth 10`，以管理员身份运行 |
| MCP Server 连接失败 | 命令路径错误或 Node.js 版本过低 | 检查 `node --version` >= 18 |
| Skill 未被加载 | SKILL.md frontmatter 格式错误 | 确保 `name: oflow-mcp` 在 YAML frontmatter 中 |
| Windows 上 npx 不工作 | .cmd 文件无法直接作为 command | 改用 `"command": "cmd", "args": ["/c", "npx", ...]` |
| npm link 需要管理员权限 | Windows 需要管理员/开发者模式 | 以管理员身份运行 PowerShell |
| Claude Desktop 配置不生效 | 配置路径错误（Store 版 vs 常规版） | 检查两个可能的路径 |

---

## 快速安装命令摘要（AI 可直接复制执行）

以下命令序列涵盖 Windows + TRAE 的完整安装（最常见场景）：

```powershell
# === 前置检测 ===
Write-Host "=== oflow-mcp 全自动安装 ===" -ForegroundColor Cyan
$nodeVer = node --version 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Node.js not found. Please install from https://nodejs.org" -ForegroundColor Red; exit 1 }
Write-Host "Node.js: $nodeVer" -ForegroundColor Green

# === 变量配置（AI 根据实际情况修改）===
$SRC_DIR = "<oflow-mcp源码目录>"           # 源码路径
$MCP_PATH = "$env:APPDATA\TRAE SOLO CN\User\mcp.json"
$SKILL_DIR = "$env:USERPROFILE\.trae-cn\builtin\global\skills\oflow-mcp"

# === 编译 ===
Set-Location $SRC_DIR
npm install
npm run build
npm link
Write-Host "Build and link complete." -ForegroundColor Green

# === 配置 MCP ===
if (Test-Path $MCP_PATH) {
    $config = Get-Content $MCP_PATH -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not ($config.mcpServers.PSObject.Properties.Name -contains "oflow-mcp")) {
        $oflowConfig = @{ command = "oflow-mcp"; args = @(); env = @{ "OFLOW_MCP_FLOWS_DIR" = "$SRC_DIR\flows" } }
        $config.mcpServers | Add-Member -MemberType NoteProperty -Name "oflow-mcp" -Value $oflowConfig
        $config | ConvertTo-Json -Depth 10 | Set-Content $MCP_PATH -Encoding UTF8
        Write-Host "MCP configured." -ForegroundColor Green
    } else {
        Write-Host "MCP already configured, skipping." -ForegroundColor Yellow
    }
} else {
    Write-Host "WARNING: MCP config file not found at $MCP_PATH" -ForegroundColor Yellow
}

# === 安装 Skill ===
if (-not (Test-Path $SKILL_DIR)) { New-Item -ItemType Directory -Path $SKILL_DIR -Force | Out-Null }
Copy-Item -Path "$SRC_DIR\SKILL.md" -Destination "$SKILL_DIR\SKILL.md" -Force
Write-Host "Skill installed." -ForegroundColor Green

# === 验证 ===
$cmdResult = Get-Command oflow-mcp -ErrorAction SilentlyContinue
if ($cmdResult) { Write-Host "VERIFIED: oflow-mcp command available" -ForegroundColor Green }
else { Write-Host "FAILED: oflow-mcp command not found" -ForegroundColor Red }

$skillExists = Test-Path "$SKILL_DIR\SKILL.md"
if ($skillExists) { Write-Host "VERIFIED: Skill file exists" -ForegroundColor Green }
else { Write-Host "FAILED: Skill file not found" -ForegroundColor Red }

Write-Host ""
Write-Host "=== 安装完成！请重启 AI 客户端后使用 ===" -ForegroundColor Cyan
Write-Host "重启后请输入: /mcp  (验证 MCP 连接)" -ForegroundColor Cyan
```

### macOS / Linux 版本

```bash
#!/bin/bash
set -e

echo "=== oflow-mcp 全自动安装 ==="

# === 前置检测 ===
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js not found. Please install from https://nodejs.org"
    exit 1
fi
echo "Node.js: $(node --version)"

# === 变量配置 ===
SRC_DIR="<oflow-mcp源码目录>"
MCP_PATH="$HOME/.trae-cn/mcp.json"                # TRAE
# MCP_PATH="$HOME/.cursor/mcp.json"              # Cursor (按需切换)
SKILL_DIR="$HOME/.trae-cn/builtin/global/skills/oflow-mcp"

# === 编译 ===
cd "$SRC_DIR"
npm install
npm run build
npm link   # macOS/Linux 可能需要 sudo

# === 配置 MCP ===
if [ -f "$MCP_PATH" ]; then
    if ! grep -q '"oflow-mcp"' "$MCP_PATH"; then
        # 使用 node 脚本安全合并 JSON
        node -e "
        const fs = require('fs');
        const config = JSON.parse(fs.readFileSync('$MCP_PATH', 'utf8'));
        config.mcpServers['oflow-mcp'] = {
            command: 'oflow-mcp',
            args: [],
            env: { OFLOW_MCP_FLOWS_DIR: '$SRC_DIR/flows' }
        };
        fs.writeFileSync('$MCP_PATH', JSON.stringify(config, null, 2));
        console.log('MCP configured.');
        "
    else
        echo "MCP already configured, skipping."
    fi
else
    echo "WARNING: MCP config file not found at $MCP_PATH"
fi

# === 安装 Skill ===
mkdir -p "$SKILL_DIR"
cp "$SRC_DIR/SKILL.md" "$SKILL_DIR/SKILL.md"
echo "Skill installed."

# === 验证 ===
if command -v oflow-mcp &> /dev/null; then
    echo "VERIFIED: oflow-mcp command available"
else
    echo "FAILED: oflow-mcp command not found"
fi

if [ -f "$SKILL_DIR/SKILL.md" ]; then
    echo "VERIFIED: Skill file exists"
else
    echo "FAILED: Skill file not found"
fi

echo ""
echo "=== 安装完成！请重启 AI 客户端后使用 ==="
```

---

## 附：各客户端 MCP 配置路径速查

| 客户端 | 平台 | 全局路径 | 项目级路径 | Skill 支持 |
|--------|------|---------|-----------|-----------|
| TRAE | Windows | `%APPDATA%\TRAE SOLO CN\User\mcp.json` | `<项目>/.trae/mcp.json` | `.trae/skills/` |
| TRAE | macOS/Linux | `~/.trae-cn/mcp.json` | `<项目>/.trae/mcp.json` | `.trae/skills/` |
| Cursor | Windows | `%USERPROFILE%\.cursor\mcp.json` | `<项目>/.cursor/mcp.json` | 无 |
| Cursor | macOS/Linux | `~/.cursor/mcp.json` | `<项目>/.cursor/mcp.json` | 无 |
| Claude Desktop | Windows | `%APPDATA%\Claude\claude_desktop_config.json` | `<项目>/.mcp.json` | 无 |
| Claude Desktop | macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` | `<项目>/.mcp.json` | 无 |
| Claude Desktop | Linux | `~/.config/Claude/claude_desktop_config.json` | `<项目>/.mcp.json` | 无 |
| Windsurf | Windows | `%USERPROFILE%\.windsurf\mcp.json` | `<项目>/.windsurf/mcp.json` | 无 |
| Windsurf | macOS/Linux | `~/.windsurf/mcp.json` | `<项目>/.windsurf/mcp.json` | 无 |
| Cline | 全平台 | VSCode 全局存储 | `.vscode/cline_mcp_settings.json` | 无 |
