## 当前任务

进入本地项目目录，使用 **git worktree** 模式创建独立工作目录来检出源分支和目标分支，避免污染本地当前分支。

## 上下文

- 项目名：`{{steps.parse_mr.outputs.project_name}}`
- 源分支：`{{steps.parse_mr.outputs.source_branch}}`
- 目标分支：`{{steps.parse_mr.outputs.target_branch}}`
- 本地路径：`{{steps.parse_mr.outputs.repo_local_path}}`

## 执行步骤

1. **进入本地仓库目录**：
   ```powershell
   cd "{{steps.parse_mr.outputs.repo_local_path}}"
   ```

2. **获取远程最新代码**：
   ```powershell
   git fetch origin
   ```
   记录 fetch 结果。

3. **清理已存在的 worktree（如有）**：
   ```powershell
   git worktree list
   ```
   如果已存在同名的 worktree，先移除：
   ```powershell
   git worktree remove "../{{steps.parse_mr.outputs.project_name}}_review_source" --force
   git worktree remove "../{{steps.parse_mr.outputs.project_name}}_review_target" --force
   ```

4. **使用 worktree 创建源分支工作目录**：
   ```powershell
   git worktree add "../{{steps.parse_mr.outputs.project_name}}_review_source" "origin/{{steps.parse_mr.outputs.source_branch}}"
   ```
   如果本地已有该分支，也可以直接：
   ```powershell
   git worktree add "../{{steps.parse_mr.outputs.project_name}}_review_source" "{{steps.parse_mr.outputs.source_branch}}"
   ```

5. **使用 worktree 创建目标分支工作目录**：
   ```powershell
   git worktree add "../{{steps.parse_mr.outputs.project_name}}_review_target" "origin/{{steps.parse_mr.outputs.target_branch}}"
   ```
   或：
   ```powershell
   git worktree add "../{{steps.parse_mr.outputs.project_name}}_review_target" "{{steps.parse_mr.outputs.target_branch}}"
   ```

6. **验证 worktree 创建成功**：
   ```powershell
   git worktree list
   ```
   确认两个 worktree 都已列出且路径正确。

7. **获取代码差异**：
   在主仓库目录执行：
   ```powershell
   git diff "{{steps.parse_mr.outputs.target_branch}}...{{steps.parse_mr.outputs.source_branch}}"
   ```
   或基于 origin：
   ```powershell
   git diff "origin/{{steps.parse_mr.outputs.target_branch}}...origin/{{steps.parse_mr.outputs.source_branch}}"
   ```
   将 diff 内容完整保存下来供后续步骤使用。

8. **（可选）获取文件列表**：
   ```powershell
   git diff --name-only "origin/{{steps.parse_mr.outputs.target_branch}}...origin/{{steps.parse_mr.outputs.source_branch}}"
   ```

## 产出物

调用 `workflow_advance` 时提供：

- **repo_ready**：`true` 表示本地仓库已准备好
- **git_fetch_result**：git fetch 的执行结果摘要
- **diff_content**：源分支到目标分支的完整 diff 内容（至少包含主要改动的文件列表和关键代码差异）
- **source_worktree_path**：源分支 worktree 的绝对路径，如 `e:/gaodun/myproject_review_source`
- **target_worktree_path**：目标分支 worktree 的绝对路径，如 `e:/gaodun/myproject_review_target`

## 完成标准

- [ ] 已进入本地项目目录
- [ ] 已执行 git fetch 获取最新远程代码
- [ ] 已使用 git worktree 成功创建源分支工作目录
- [ ] 已使用 git worktree 成功创建目标分支工作目录
- [ ] 已获取两个分支之间的代码差异
- [ ] diff 内容完整可读取
- [ ] 本地原分支未受到污染