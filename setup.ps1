<#
.SYNOPSIS
    oflow-mcp 全自动安装脚本 (Windows PowerShell)
.DESCRIPTION
    自动完成: npm install -> build -> link -> 配置 MCP Server -> 安装 Skill -> 验证
    支持多个 AI 客户端: TRAE, Cursor, Claude Desktop, Windsurf, Cline
.PARAMETER Client
    目标 AI 客户端: auto | trae | cursor | claude | windsurf | cline (默认: auto)
.PARAMETER Level
    配置级别: global | project (默认: global)
.PARAMETER SrcDir
    oflow-mcp 源码目录 (默认: 脚本所在目录)
.PARAMETER SkipBuild
    跳过编译步骤（如果已经编译过）
.PARAMETER Force
    强制覆盖已有配置
.EXAMPLE
    .\setup.ps1
    .\setup.ps1 -Client cursor -Level project
    .\setup.ps1 -SrcDir "D:\mycode\oflow-mcp" -Force
#>
param(
    [ValidateSet("auto", "trae", "cursor", "claude", "windsurf", "cline")]
    [string]$Client = "auto",

    [ValidateSet("global", "project")]
    [string]$Level = "global",

    [string]$SrcDir = $PSScriptRoot,

    [switch]$SkipBuild,

    [switch]$Force
)

$ErrorActionPreference = "Stop"

function Write-Info($msg)    { Write-Host "[INFO]  $msg" -ForegroundColor Cyan }
function Write-Ok($msg)      { Write-Host "[OK]    $msg" -ForegroundColor Green }
function Write-Warn($msg)   { Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Write-Err($msg)    { Write-Host "[ERROR] $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  oflow-mcp Auto Installer (Windows)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ==============================================================================
# Step 0: 前置条件检测
# ==============================================================================

Write-Info "检测 Node.js..."
$nodeVer = try { node --version 2>&1 } catch { $null }
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrEmpty($nodeVer)) {
    Write-Err "Node.js 未安装！请从 https://nodejs.org 下载 LTS 版本安装后重试。"
    exit 1
}
Write-Ok "Node.js $nodeVer"

$npmVer = try { npm --version 2>&1 } catch { $null }
if ($LASTEXITCODE -ne 0) {
    Write-Err "npm 不可用！"
    exit 1
}
Write-Ok "npm v$npmVer"

# ==============================================================================
# Step 1: 确定源码目录
# ==============================================================================

if (-not (Test-Path "$SrcDir\package.json")) {
    Write-Err "源码目录无效: $SrcDir (未找到 package.json)"
    exit 1
}
Write-Ok "源码目录: $SrcDir"

# ==============================================================================
# Step 2: 编译 (可跳过)
# ==============================================================================

if (-not $SkipBuild) {
    Write-Info "安装依赖..."
    Set-Location $SrcDir
    npm install
    if ($LASTEXITCODE -ne 0) { Write-Err "npm install 失败"; exit 1 }

    Write-Info "编译 TypeScript..."
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Err "npm run build 失败"; exit 1 }
    Write-Ok "编译完成"
} else {
    Write-Warn "跳过编译步骤"
}

# ==============================================================================
# Step 3: 全局注册命令
# ==============================================================================

Write-Info "注册全局命令 (npm link)..."
Set-Location $SrcDir
npm link 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Warn "npm link 可能需要管理员权限，尝试以提升权限运行..."
    # 尝试使用 node 直接解析路径作为 fallback
}
$cmdCheck = Get-Command oflow-mcp -ErrorAction SilentlyContinue
if ($cmdCheck) {
    Write-Ok "oflow-mcp 命令已注册: $($cmdCheck.Source)"
} else {
    Write-Warn "oflow-mcp 命令未找到到 PATH 中，将使用 node 直接调用路径"
    $global:OflowMcpCmd = "node"
    $global:OflowMcpArgs = @("$SrcDir\dist\index.js")
}

# ==============================================================================
# Step 4: 自动检测目标客户端
# ==============================================================================

function Detect-Client {
    # 按优先级检测已安装的客户端
    if (Test-Path "$env:USERPROFILE\.trae-cn") { return "trae" }
    if (Test-Path "$env:USERPROFILE\.trae") { return "trae" }
    if (Test-Path "$env:USERPROFILE\.cursor\mcp.json") { return "cursor" }
    if (Test-Path "$env:USERPROFILE\.windsurf\mcp.json") { return "windsurf" }
    if (Test-Path "$env:APPDATA\Claude\claude_desktop_config.json") { return "claude" }
    if (Test-Path "$env:LOCALAPPDATA\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json") { return "claude" }
    return ""
}

if ($Client -eq "auto") {
    $detected = Detect-Client
    if ($detected) {
        $Client = $detected
        Write-Info "自动检测到客户端: $Client"
    } else {
        Write-Warn "未自动检测到已安装的 AI 客户端"
        Write-Host ""
        Write-Host "请选择要配置的客户端:" -ForegroundColor White
        Write-Host "  1. TRAE" -ForegroundColor White
        Write-Host "  2. Cursor" -ForegroundColor White
        Write-Host "  3. Claude Desktop" -ForegroundColor White
        Write-Host "  4. Windsurf" -ForegroundColor White
        Write-Host "  5. Cline (VSCode)" -ForegroundColor White
        Write-Host "  6. 全部配置" -ForegroundColor White
        $choice = Read-Host "请输入编号 (1-6)"
        switch ($choice) {
            "1" { $Client = "trae" }
            "2" { $Client = "cursor" }
            "3" { $Client = "claude" }
            "4" { $Client = "windsurf" }
            "5" { $Client = "cline" }
            "6" { $Client = "all" }
            default { Write-Err "无效选择"; exit 1 }
        }
    }
}

# ==============================================================================
# Step 5: 获取 MCP 配置文件路径
# ==============================================================================

function Get-McpPath($client, $level) {
    switch ($client) {
        "trae" {
            if ($level -eq "global") {
                $p1 = "$env:APPDATA\TRAE SOLO CN\User\mcp.json"
                $p2 = "$env:USERPROFILE\.trae-cn\mcp.json"
                if (Test-Path $p1) { return $p1 }
                if (Test-Path $p2) { return $p2 }
                return $p1  # 默认路径，即使不存在也返回（稍后创建）
            } else {
                return ".trae\mcp.json"  # 项目级（相对于工作目录）
            }
        }
        "cursor" {
            if ($level -eq "global") { return "$env:USERPROFILE\.cursor\mcp.json" }
            else { return ".cursor\mcp.json" }
        }
        "claude" {
            # Claude Desktop 只支持全局配置
            $p1 = "$env:APPDATA\Claude\claude_desktop_config.json"
            $p2 = "$env:LOCALAPPDATA\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json"
            if (Test-Path $p1) { return $p1 }
            if (Test-Path $p2) { return $p2 }
            return $p1
        }
        "windsurf" {
            if ($level -eq "global") { return "$env:USERPROFILE\.windsurf\mcp.json" }
            else { return ".windsurf\mcp.json" }
        }
        "cline" {
            # Cline 使用项目级配置
            return ".vscode\cline_mcp_settings.json"
        }
    }
    return $null
}

# 构建 oflow-mcp 的 MCP 配置对象
function Get-OflowConfig($client) {
    $oflowCmd = if ($global:OflowMcpCmd) { $global:OflowMcpCmd } else { "oflow-mcp" }
    $oflowArgs = if ($global:OflowMcpArgs) { $global:OflowMcpArgs } else { @() }

    switch ($client) {
        "claude" {
            # Claude Desktop 旧版配置使用 "command" + "args"
            return @{
                command = $oflowCmd
                args = $oflowArgs
                env = @{ "OFLOW_MCP_FLOWS_DIR" = "$SrcDir\flows" }
            }
        }
        "cline" {
            # Cline 额外支持 disabled 和 autoApprove 字段
            return @{
                command = $oflowCmd
                args = $oflowArgs
                env = @{ "OFLOW_MCP_FLOWS_DIR" = "$SrcDir\flows" }
                disabled = $false
                autoApprove = @()
            }
        }
        default {
            # TRAE / Cursor / Windsurf
            return @{
                command = $oflowCmd
                args = $oflowArgs
                env = @{ "OFLOW_MCP_FLOWS_DIR" = "$SrcDir\flows" }
            }
        }
    }
}

# ==============================================================================
# Step 6: 写入 MCP 配置
# ==============================================================================

function Write-McpConfig($client, $level) {
    $mcpPath = Get-McpPath $client $level

    Write-Info "配置 MCP: $client ($level) -> $mcpPath"

    # 确保父目录存在
    $parentDir = Split-Path $mcpPath -Parent
    if ($parentDir -and -not (Test-Path $parentDir)) {
        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
    }

    # 如果文件不存在，创建基础结构
    if (-not (Test-Path $mcpPath)) {
        $baseConfig = @{ mcpServers = [ordered]@{} }
        $baseConfig | ConvertTo-Json -Depth 10 | Set-Content -Path $mcpPath -Encoding UTF8
        Write-Info "创建新配置文件: $mcpPath"
    }

    # 读取现有配置
    try {
        $config = Get-Content -Path $mcpPath -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        Write-Err "无法解析配置文件 JSON: $mcpPath"
        Write-Err $_.Exception.Message
        return $false
    }

    # 检查是否已存在
    $hasExisting = $false
    if ($config.mcpServers.PSObject.Properties.Name -contains "oflow-mcp") {
        if ($Force) {
            Write-Warn "oflow-mcp 配置已存在，强制覆盖"
        } else {
            Write-Warn "oflow-mcp 配置已存在，跳过 (使用 -Force 强制覆盖)"
            return $true
        }
    }

    # 构建配置对象
    $oflowConfig = Get-OflowConfig $client

    # 写入配置
    if ($config.mcpServers.PSObject.Properties.Name -contains "oflow-mcp") {
        $config.mcpServers."oflow-mcp" = $oflowConfig
    } else {
        $config.mcpServers | Add-Member -MemberType NoteProperty -Name "oflow-mcp" -Value $oflowConfig -Force
    }

    $config | ConvertTo-Json -Depth 10 | Set-Content -Path $mcpPath -Encoding UTF8
    Write-Ok "MCP 配置写入完成: $mcpPath"
    return $true
}

# 处理多客户端
$clients = if ($Client -eq "all") { @("trae", "cursor", "claude", "windsurf", "cline") } else { @($Client) }

foreach ($c in $clients) {
    $lv = if ($c -eq "claude" -or $c -eq "cline") { "global" } else { $Level }
    Write-McpConfig $c $lv
}

# ==============================================================================
# Step 7: 注入 AI 操作指南
# ==============================================================================

$skillTargets = @()
$guideTargets = @()  # 非 TRAE 客户端的操作指南文件

# TRAE: 原生 Skill 机制
if ($clients -contains "trae" -or $clients -contains "all") {
    $globalSkillDir = "$env:USERPROFILE\.trae-cn\builtin\global\skills\oflow-mcp"
    $skillTargets += $globalSkillDir
    if (Test-Path ".trae\skills") {
        $skillTargets += ".trae\skills\oflow-mcp"
    }
}

# 非 TRAE 客户端: 通过各自机制注入操作指南
$aiGuideContent = @"
# oflow-mcp 工作流操作指南

你是 oflow-mcp 工作流引擎的操作助手。当用户提到"开始工作流"、"继续工作流"、"当前步骤"、"推进到下一步"时，你应该使用 workflow_* 系列工具。

## 核心职责

1. 理解用户意图（启动/继续/查看进度/其他）
2. 调用 workflow_* 工具完成操作
3. 按步骤 prompt 指引执行具体任务
4. 推进前通过 checkpoint 校验（required_outputs、conditions、evidence、approvals）
5. workflow_advance 时携带完整的 outputs 和 confirmed_conditions

## 工具速查

| 工具 | 用途 | 关键参数 |
|------|------|----------|
| workflow_list_templates | 列出可用模板 | 无 |
| workflow_get_template | 获取模板详情 | name |
| workflow_start | 启动实例 | template, params, alias(可选) |
| workflow_current | 获取当前步骤 + prompt | instance_id(可选) |
| workflow_advance | 推进到下一步 | instance_id, outputs, confirmed_conditions |
| workflow_status | 查看全貌 | instance_id |
| workflow_dashboard | 控制面板 | instance_id |

## 核心工作流

1. **识别意图**: 用户说"开始 basic-dev 工作流" -> workflow_start
2. **获取步骤**: workflow_current -> 按返回的 prompt 执行
3. **推进**: workflow_advance 时提供所有 required_outputs
4. **校验失败**: 读取 error.details.suggestions，补充后重试

## 完整指南

详见源码目录 SKILL.md。触发关键词: 开始工作流、继续工作流、当前步骤、推进到下一步。
"@

if ($clients -contains "cursor" -or $clients -contains "all") {
    $cursorRulesPath = "$SrcDir\.cursorrules"
    Set-Content -Path $cursorRulesPath -Value $aiGuideContent -Encoding UTF8 -Force
    $guideTargets += @{ path = $cursorRulesPath; client = "Cursor"; type = ".cursorrules" }
    Write-Ok "Cursor 操作指南已写入: $cursorRulesPath"
}

if ($clients -contains "cline" -or $clients -contains "all") {
    $clineRulesPath = "$SrcDir\.clinerules"
    Set-Content -Path $clineRulesPath -Value $aiGuideContent -Encoding UTF8 -Force
    $guideTargets += @{ path = $clineRulesPath; client = "Cline"; type = ".clinerules" }
    Write-Ok "Cline 操作指南已写入: $clineRulesPath"
}

if ($clients -contains "windsurf" -or $clients -contains "all") {
    $windsurfDir = "$SrcDir\.windsurf\rules"
    if (-not (Test-Path $windsurfDir)) { New-Item -ItemType Directory -Path $windsurfDir -Force | Out-Null }
    $windsurfPath = "$windsurfDir\oflow-mcp.md"
    Set-Content -Path $windsurfPath -Value $aiGuideContent -Encoding UTF8 -Force
    $guideTargets += @{ path = $windsurfPath; client = "Windsurf"; type = "rules" }
    Write-Ok "Windsurf 操作指南已写入: $windsurfPath"
}

if ($clients -contains "claude" -or $clients -contains "all") {
    Write-Info "Claude Desktop 不支持文件级自动加载，请在 Claude 的 Project Instructions 中手动粘贴操作指南"
    Write-Info "操作指南已保存到: $SrcDir\AI_GUIDE.md (供手动复制)"
    Set-Content -Path "$SrcDir\AI_GUIDE.md" -Value $aiGuideContent -Encoding UTF8 -Force
}

# 安装 TRAE Skill
if ($skillTargets.Count -gt 0) {
    foreach ($skillDir in $skillTargets) {
        Write-Info "安装 TRAE Skill -> $skillDir"
        if (-not (Test-Path $skillDir)) {
            New-Item -ItemType Directory -Path $skillDir -Force | Out-Null
        }
        Copy-Item -Path "$SrcDir\SKILL.md" -Destination "$skillDir\SKILL.md" -Force
        Write-Ok "TRAE Skill 已安装: $skillDir"
    }
}

# ==============================================================================
# Step 8: 自动验证
# ==============================================================================

Write-Host ""
Write-Host "---------- 验证安装结果 ----------" -ForegroundColor Cyan
Write-Host ""

$allPassed = $true

# 验证 1: 命令可用
$cmdResult = Get-Command oflow-mcp -ErrorAction SilentlyContinue
if ($cmdResult) {
    Write-Ok "[PASS] oflow-mcp 命令可用: $($cmdResult.Source)"
} elseif ($global:OflowMcpCmd) {
    Write-Ok "[PASS] oflow-mcp 可通过 node 调用: $SrcDir\dist\index.js"
} else {
    Write-Err "[FAIL] oflow-mcp 命令不可用"
    $allPassed = $false
}

# 验证 2: MCP 配置文件
foreach ($c in $clients) {
    $lv = if ($c -eq "claude" -or $c -eq "cline") { "global" } else { $Level }
    $mcpPath = Get-McpPath $c $lv
    if (Test-Path $mcpPath) {
        try {
            $cfg = Get-Content $mcpPath -Raw | ConvertFrom-Json
            if ($cfg.mcpServers.PSObject.Properties.Name -contains "oflow-mcp") {
                Write-Ok "[PASS] $c MCP 配置存在"
            } else {
                Write-Err "[FAIL] $c MCP 配置中未找到 oflow-mcp"
                $allPassed = $false
            }
        } catch {
            Write-Warn "[WARN] $c 配置文件 JSON 解析失败"
        }
    } else {
        Write-Warn "[WARN] $c 配置文件不存在: $mcpPath"
    }
}

# 验证 3: 操作指南文件
if ($skillTargets.Count -gt 0) {
    foreach ($sd in $skillTargets) {
        if (Test-Path "$sd\SKILL.md") {
            $skillContent = Get-Content "$sd\SKILL.md" -Raw
            if ($skillContent -match 'name:\s*oflow-mcp') {
                Write-Ok "[PASS] TRAE Skill 文件有效: $sd"
            } else {
                Write-Err "[FAIL] TRAE Skill frontmatter 无效: $sd"
                $allPassed = $false
            }
        } else {
            Write-Err "[FAIL] TRAE Skill 文件不存在: $sd"
            $allPassed = $false
        }
    }
}

if ($guideTargets.Count -gt 0) {
    foreach ($gt in $guideTargets) {
        if (Test-Path $gt.path) {
            Write-Ok "[PASS] $($gt.client) 操作指南已写入: $($gt.path)"
        } else {
            Write-Err "[FAIL] $($gt.client) 操作指南未找到: $($gt.path)"
            $allPassed = $false
        }
    }
}

# 验证 4: MCP stdio 协议测试
Write-Info "测试 MCP 协议响应..."
try {
    $initMsg = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"setup-test","version":"1.0"}}}'
    $proc = Start-Process -FilePath "node" -ArgumentList "$SrcDir\dist\index.js" -NoNewWindow -RedirectStandardInput "$env:TEMP\oflow-test-in.txt" -RedirectStandardOutput "$env:TEMP\oflow-test-out.txt" -PassThru
    Set-Content "$env:TEMP\oflow-test-in.txt" -Value $initMsg -Encoding UTF8
    Start-Sleep -Milliseconds 2000
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    $output = Get-Content "$env:TEMP\oflow-test-out.txt" -Raw -ErrorAction SilentlyContinue
    if ($output -and $output -match '"result"') {
        Write-Ok "[PASS] MCP Server 协议响应正常"
    } else {
        Write-Warn "[WARN] MCP Server 协议测试无响应（可能需要重启客户端后生效）"
    }
    Remove-Item "$env:TEMP\oflow-test-in.txt" -Force -ErrorAction SilentlyContinue
    Remove-Item "$env:TEMP\oflow-test-out.txt" -Force -ErrorAction SilentlyContinue
} catch {
    Write-Warn "[WARN] MCP 协议测试跳过"
}

# ==============================================================================
# 结果汇总
# ==============================================================================

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
if ($allPassed) {
    Write-Host "  安装完成！所有验证均通过" -ForegroundColor Green
} else {
    Write-Host "  安装完成，但部分验证未通过" -ForegroundColor Yellow
}
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "下一步操作:" -ForegroundColor White
Write-Host "  1. 重启 AI 客户端（TRAE / Cursor / Claude Desktop 等）" -ForegroundColor White
Write-Host "  2. 在对话中输入 /mcp 验证 MCP Server 连接" -ForegroundColor White
Write-Host "  3. 尝试使用: '列出工作流模板' 或 'workflow_list_templates'" -ForegroundColor White

if ($guideTargets.Count -gt 0) {
    Write-Host ""
    Write-Host "操作指南文件已生成在源码目录，请按需复制到你的工作项目中:" -ForegroundColor Yellow
    foreach ($gt in $guideTargets) {
        Write-Host "  - $($gt.client): 复制 $($gt.path) -> <你的项目根目录>/" -ForegroundColor White
    }
}
if ($clients -contains "claude" -or $clients -contains "all") {
    Write-Host "  - Claude Desktop: 打开 Claude Project Instructions，粘贴 $SrcDir\AI_GUIDE.md 内容" -ForegroundColor White
}
Write-Host ""
