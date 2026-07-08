## 当前任务

分析源分支相对于目标分支的所有 commit 信息，评估提交质量。

## 上下文

- 项目名：`{{steps.parse_mr.outputs.project_name}}`
- 源分支：`{{steps.parse_mr.outputs.source_branch}}`
- 目标分支：`{{steps.parse_mr.outputs.target_branch}}`
- 本地路径：`{{steps.parse_mr.outputs.repo_local_path}}`
- diff 内容已在前一步获取

## 执行步骤

1. **获取提交历史**：
   在本地仓库执行：
   ```powershell
   git log "{{steps.parse_mr.outputs.target_branch}}...{{steps.parse_mr.outputs.source_branch}}" --oneline --no-merges
   ```
   或获取详细格式：
   ```powershell
   git log "{{steps.parse_mr.outputs.target_branch}}...{{steps.parse_mr.outputs.source_branch}}" --format="%h|%an|%ad|%s" --date=short
   ```

2. **逐条分析 commit**：
   对每个 commit 评估以下内容：
   - **提交信息规范性**：是否清晰描述改动内容，是否符合提交规范（如 conventional commits）
   - **提交粒度**：是否每个 commit 只做一件事，是否存在无关改动混在一个 commit 中
   - **提交作者**：是否正确

3. **统计提交数量**：
   统计本次 MR 包含的 commit 总数。

4. **总结提交质量**：
   - 提交信息是否清晰、规范
   - 是否存在提交粒度问题（如一个 commit 做太多事）
   - 是否存在无意义的提交（如 "fix"、"update" 等模糊描述）
   - 是否建议 squash 合并

## 产出物

调用 `workflow_advance` 时提供：

- **commit_analysis**：提交历史分析结果（至少20个字符），包括：
  - 提交列表（hash、作者、日期、message）
  - 提交信息规范性评估
  - 提交粒度评估
  - 改进建议
- **commit_count**：本次MR包含的commit数量

## 完成标准

- [ ] 已获取源分支到目标分支的所有 commit
- [ ] 已逐条分析 commit 信息
- [ ] 已评估提交规范性和粒度
- [ ] 已统计 commit 数量
- [ ] 已生成提交质量总结