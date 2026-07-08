## 当前任务

解析用户提供的合并请求（MR/PR）URL，提取项目名、源分支、目标分支、MR ID等关键信息，并确认本地仓库路径存在。

## 上下文

- MR URL：`{{mr_url}}`
- 本地项目根目录：`{{local_base_path}}`

## 执行步骤

1. **解析MR URL**：从URL中提取以下信息：
   - 项目名（project_name）：URL路径中的项目标识
   - 源分支（source_branch）：要合并的分支
   - 目标分支（target_branch）：合并到的目标分支
   - MR ID（mr_id）：合并请求的编号

   URL格式示例：
   - GitLab: `https://gitlab.example.com/group/project/-/merge_requests/123`
   - GitHub: `https://github.com/owner/repo/pull/123`

2. **确认本地仓库存在**：
   - 拼接本地路径：`{{local_base_path}}/<项目名>`
   - 使用 `LS` 工具检查该路径是否存在
   - 如果不存在，向用户说明并尝试其他可能的路径

3. **验证信息完整性**：
   - 确保项目名、源分支、目标分支都已成功提取
   - 如果URL中没有直接包含分支信息，需要打开页面获取

## 产出物

调用 `workflow_advance` 时提供：

- **project_name**：项目名称，用于定位本地仓库
- **source_branch**：源分支名称（要合并的分支）
- **target_branch**：目标分支名称（合并到的分支）
- **mr_id**：合并请求ID
- **repo_local_path**：本地仓库的绝对路径，如 `e:/gaodun/myproject`

## 完成标准

- [ ] 已从MR URL中解析出项目名
- [ ] 已确定源分支和目标分支
- [ ] 已确认本地仓库路径存在
- [ ] 所有关键信息已提取完整