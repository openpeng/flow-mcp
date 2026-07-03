#!/bin/bash
# ==============================================================================
# oflow-mcp 全自动安装脚本 (macOS / Linux)
# ==============================================================================
# 用法:
#   ./setup.sh                              # 自动检测客户端
#   ./setup.sh --client cursor              # 指定客户端
#   ./setup.sh --client all --level global  # 配置所有客户端
#   ./setup.sh --src-dir /path/to/oflow-mcp
#   ./setup.sh --skip-build                 # 跳过编译
#   ./setup.sh --force                      # 强制覆盖
# ==============================================================================

set -euo pipefail

# ---- 颜色输出 ----
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; WHITE='\033[1;37m'; NC='\033[0m'
log_info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_err()   { echo -e "${RED}[ERROR]${NC} $*"; }

# ---- 默认参数 ----
CLIENT="auto"
LEVEL="global"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
SKIP_BUILD=false
FORCE=false

# ---- 参数解析 ----
while [[ $# -gt 0 ]]; do
    case $1 in
        --client)   CLIENT="$2"; shift 2 ;;
        --level)    LEVEL="$2"; shift 2 ;;
        --src-dir)  SRC_DIR="$2"; shift 2 ;;
        --skip-build) SKIP_BUILD=true; shift ;;
        --force)    FORCE=true; shift ;;
        -h|--help)
            echo "用法: $0 [--client auto|trae|cursor|claude|windsurf|cline|all] [--level global|project] [--src-dir PATH] [--skip-build] [--force]"
            exit 0
            ;;
        *) log_err "未知参数: $1"; exit 1 ;;
    esac
done

# ---- 校验 CLIENT ----
VALID_CLIENTS="auto trae cursor claude windsurf cline all"
echo "$VALID_CLIENTS" | grep -qw "$CLIENT" || { log_err "无效客户端: $CLIENT (可选: $VALID_CLIENTS)"; exit 1; }

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  oflow-mcp Auto Installer (macOS/Linux)${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# ==============================================================================
# Step 0: 前置条件检测
# ==============================================================================

log_info "检测 Node.js..."
if ! command -v node &>/dev/null; then
    log_err "Node.js 未安装！请参考: https://nodejs.org"
    if [[ "$(uname)" == "Darwin" ]]; then
        log_info "macOS 推荐安装: brew install node"
    else
        log_info "Ubuntu/Debian 推荐安装:"
        log_info "  curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -"
        log_info "  sudo apt-get install -y nodejs"
    fi
    exit 1
fi
NODE_VER=$(node --version)
log_ok "Node.js $NODE_VER"

if ! command -v npm &>/dev/null; then
    log_err "npm 不可用！"
    exit 1
fi
NPM_VER=$(npm --version)
log_ok "npm v$NPM_VER"

# ==============================================================================
# Step 1: 确定源码目录
# ==============================================================================

if [[ ! -f "$SRC_DIR/package.json" ]]; then
    log_err "源码目录无效: $SRC_DIR (未找到 package.json)"
    exit 1
fi
log_ok "源码目录: $SRC_DIR"

# ==============================================================================
# Step 2: 编译 (可跳过)
# ==============================================================================

if [[ "$SKIP_BUILD" == "false" ]]; then
    log_info "安装依赖..."
    (cd "$SRC_DIR" && npm install)
    log_info "编译 TypeScript..."
    (cd "$SRC_DIR" && npm run build)
    log_ok "编译完成"
else
    log_warn "跳过编译步骤"
fi

# ==============================================================================
# Step 3: 全局注册命令
# ==============================================================================

log_info "注册全局命令 (npm link)..."
(cd "$SRC_DIR" && npm link) 2>/dev/null || {
    log_warn "npm link 失败，尝试 sudo..."
    (cd "$SRC_DIR" && sudo npm link) 2>/dev/null || {
        log_warn "sudo npm link 也失败，将使用 node 直接调用路径"
        OFLOW_CMD="node"
        OFLOW_ARGS=("$SRC_DIR/dist/index.js")
    }
}

# 检查命令是否可用
if command -v oflow-mcp &>/dev/null; then
    OFLOW_CMD="oflow-mcp"
    OFLOW_ARGS=()
    OFLOW_BIN=$(which oflow-mcp)
    log_ok "oflow-mcp 命令已注册: $OLOW_BIN"
elif [[ -z "${OFLOW_CMD:-}" ]]; then
    log_warn "oflow-mcp 命令未在 PATH 中找到"
    OFLOW_CMD="node"
    OFLOW_ARGS=("$SRC_DIR/dist/index.js")
fi

# ==============================================================================
# Step 4: 自动检测目标客户端
# ==============================================================================

detect_client() {
    [[ -d "$HOME/.trae-cn" ]] && echo "trae" && return
    [[ -d "$HOME/.trae" ]]    && echo "trae" && return
    [[ -f "$HOME/.cursor/mcp.json" ]]      && echo "cursor" && return
    [[ -f "$HOME/.windsurf/mcp.json" ]]   && echo "windsurf" && return
    [[ -f "$HOME/Library/Application Support/Claude/claude_desktop_config.json" ]] && echo "claude" && return
    [[ -f "$HOME/.config/Claude/claude_desktop_config.json" ]] && echo "claude" && return
    echo ""
}

if [[ "$CLIENT" == "auto" ]]; then
    DETECTED=$(detect_client)
    if [[ -n "$DETECTED" ]]; then
        CLIENT="$DETECTED"
        log_info "自动检测到客户端: $CLIENT"
    else
        log_warn "未自动检测到已安装的 AI 客户端"
        echo ""
        echo "请选择要配置的客户端:"
        echo "  1. TRAE"
        echo "  2. Cursor"
        echo "  3. Claude Desktop"
        echo "  4. Windsurf"
        echo "  5. Cline (VSCode)"
        echo "  6. 全部配置"
        read -rp "请输入编号 (1-6): " choice
        case $choice in
            1) CLIENT="trae" ;;
            2) CLIENT="cursor" ;;
            3) CLIENT="claude" ;;
            4) CLIENT="windsurf" ;;
            5) CLIENT="cline" ;;
            6) CLIENT="all" ;;
            *) log_err "无效选择"; exit 1 ;;
        esac
    fi
fi

# ==============================================================================
# Step 5: 获取 MCP 配置文件路径
# ==============================================================================

get_mcp_path() {
    local client="$1" level="$2"
    case "$client" in
        trae)
            if [[ "$level" == "global" ]]; then
                # macOS/Linux
                [[ -f "$HOME/.trae-cn/mcp.json" ]] && echo "$HOME/.trae-cn/mcp.json" && return
                [[ -f "$HOME/.trae/mcp.json" ]]    && echo "$HOME/.trae/mcp.json" && return
                echo "$HOME/.trae-cn/mcp.json"
            else
                echo ".trae/mcp.json"
            fi
            ;;
        cursor)
            if [[ "$level" == "global" ]]; then echo "$HOME/.cursor/mcp.json"; else echo ".cursor/mcp.json"; fi
            ;;
        claude)
            # Claude Desktop 只支持全局
            if [[ "$(uname)" == "Darwin" ]]; then
                echo "$HOME/Library/Application Support/Claude/claude_desktop_config.json"
            else
                echo "$HOME/.config/Claude/claude_desktop_config.json"
            fi
            ;;
        windsurf)
            if [[ "$level" == "global" ]]; then echo "$HOME/.windsurf/mcp.json"; else echo ".windsurf/mcp.json"; fi
            ;;
        cline)
            echo ".vscode/cline_mcp_settings.json"
            ;;
    esac
}

# ==============================================================================
# Step 6: 写入 MCP 配置
# ==============================================================================

write_mcp_config() {
    local client="$1" level="$2"
    local mcp_path
    mcp_path=$(get_mcp_path "$client" "$level")

    log_info "配置 MCP: $client ($level) -> $mcp_path"

    # 确保父目录存在
    local parent_dir
    parent_dir=$(dirname "$mcp_path")
    mkdir -p "$parent_dir"

    # 如果文件不存在，创建基础结构
    if [[ ! -f "$mcp_path" ]]; then
        echo '{"mcpServers":{}}' > "$mcp_path"
        log_info "创建新配置文件: $mcp_path"
    fi

    # 检查是否已存在
    if grep -q '"oflow-mcp"' "$mcp_path"; then
        if [[ "$FORCE" == "true" ]]; then
            log_warn "oflow-mcp 配置已存在，强制覆盖"
        else
            log_warn "oflow-mcp 配置已存在，跳过 (使用 --force 强制覆盖)"
            return 0
        fi
    fi

    # 使用 node 安全合并 JSON（确保格式正确）
    node -e "
    const fs = require('fs');
    const path = '$mcp_path';
    const config = JSON.parse(fs.readFileSync(path, 'utf8'));
    config.mcpServers['oflow-mcp'] = {
        command: '$OFLOW_CMD',
        args: $(node -e "console.log(JSON.stringify(${OFLOW_ARGS:-[]}))"),
        env: { OFLOW_MCP_FLOWS_DIR: '$SRC_DIR/flows' }
    };
    fs.writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
    console.log('MCP configured.');
    "

    if [[ $? -eq 0 ]]; then
        log_ok "MCP 配置写入完成: $mcp_path"
        return 0
    else
        log_err "MCP 配置写入失败: $mcp_path"
        return 1
    fi
}

# 处理多客户端
IFS=' ' read -ra CLIENTS <<< "$(if [[ "$CLIENT" == "all" ]]; then echo "trae cursor claude windsurf cline"; else echo "$CLIENT"; fi)"

FAILED=0
for c in "${CLIENTS[@]}"; do
    lv="global"
    # Claude 和 Cline 只支持全局
    [[ "$c" != "claude" && "$c" != "cline" ]] && lv="$LEVEL"
    write_mcp_config "$c" "$lv" || FAILED=$((FAILED + 1))
done

# ==============================================================================
# Step 7: 安装 Skill (仅 TRAE)
# ==============================================================================

SKILL_TARGETS=()

install_skill() {
    local target_dir="$1"
    log_info "安装 Skill -> $target_dir"
    mkdir -p "$target_dir"
    cp "$SRC_DIR/SKILL.md" "$target_dir/SKILL.md"
    log_ok "Skill 已安装: $target_dir"
}

for c in "${CLIENTS[@]}"; do
    if [[ "$c" == "trae" ]]; then
        # 全局 Skill
        SKILL_TARGETS+=("$HOME/.trae-cn/builtin/global/skills/oflow-mcp")
        # 项目级 Skill
        if [[ -d ".trae/skills" ]]; then
            SKILL_TARGETS+=(".trae/skills/oflow-mcp")
        fi
    fi
done

if [[ ${#SKILL_TARGETS[@]} -gt 0 ]]; then
    for sd in "${SKILL_TARGETS[@]}"; do
        install_skill "$sd"
    done
else
    log_info "当前客户端不需要安装 Skill（仅 TRAE 支持 Skill）"
fi

# ==============================================================================
# Step 8: 自动验证
# ==============================================================================

echo ""
echo -e "${CYAN}---------- 验证安装结果 ----------${NC}"
echo ""

ALL_PASSED=true

# 验证 1: 命令可用
if command -v oflow-mcp &>/dev/null; then
    log_ok "[PASS] oflow-mcp 命令可用: $(which oflow-mcp)"
else
    log_warn "[WARN] oflow-mcp 命令未在 PATH 中 (可通过 node $SRC_DIR/dist/index.js 调用)"
fi

# 验证 2: MCP 配置文件
for c in "${CLIENTS[@]}"; do
    lv="global"
    [[ "$c" != "claude" && "$c" != "cline" ]] && lv="$LEVEL"
    mcp_path=$(get_mcp_path "$c" "$lv")
    if [[ -f "$mcp_path" ]] && grep -q '"oflow-mcp"' "$mcp_path"; then
        log_ok "[PASS] $c MCP 配置存在"
    elif [[ -f "$mcp_path" ]]; then
        log_err "[FAIL] $c MCP 配置中未找到 oflow-mcp"
        ALL_PASSED=false
    else
        log_warn "[WARN] $c 配置文件不存在: $mcp_path"
    fi
done

# 验证 3: Skill 文件
for sd in "${SKILL_TARGETS[@]}"; do
    if [[ -f "$sd/SKILL.md" ]] && grep -q 'name:\s*oflow-mcp' "$sd/SKILL.md"; then
        log_ok "[PASS] Skill 文件有效: $sd"
    else
        log_err "[FAIL] Skill 文件不存在或无效: $sd"
        ALL_PASSED=false
    fi
done

# 验证 4: MCP stdio 协议测试
log_info "测试 MCP 协议响应..."
INIT_MSG='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"setup-test","version":"1.0"}}}'
TMP_IN=$(mktemp)
TMP_OUT=$(mktemp)
trap "rm -f $TMP_IN $TMP_OUT" EXIT

echo "$INIT_MSG" > "$TMP_IN"
timeout 3 node "$SRC_DIR/dist/index.js" < "$TMP_IN" > "$TMP_OUT" 2>/dev/null || true
if grep -q '"result"' "$TMP_OUT" 2>/dev/null; then
    log_ok "[PASS] MCP Server 协议响应正常"
else
    log_warn "[WARN] MCP Server 协议测试无响应（可能需要重启客户端后生效）"
fi

rm -f "$TMP_IN" "$TMP_OUT"

# ==============================================================================
# 结果汇总
# ==============================================================================

echo ""
echo -e "${CYAN}============================================${NC}"
if [[ "$ALL_PASSED" == "true" && "$FAILED" -eq 0 ]]; then
    echo -e "${GREEN}  安装完成！所有验证均通过${NC}"
else
    echo -e "${YELLOW}  安装完成，但部分验证未通过${NC}"
fi
echo -e "${CYAN}============================================${NC}"
echo ""
echo "下一步操作:"
echo "  1. 重启 AI 客户端（TRAE / Cursor / Claude Desktop 等）"
echo "  2. 在对话中输入 /mcp 验证 MCP Server 连接"
echo "  3. 尝试使用: '列出工作流模板' 或 'workflow_list_templates'"
echo ""
