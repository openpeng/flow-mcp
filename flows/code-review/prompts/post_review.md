## 当前任务

打开合并请求页面，在评论区发布完整的代码评审意见。如果没有P0级别bug，额外回复一条内容为 "1" 的评论。

## 上下文

- MR URL：`{{mr_url}}`
- 项目名：`{{steps.parse_mr.outputs.project_name}}`
- 源分支：`{{steps.parse_mr.outputs.source_branch}}`
- 目标分支：`{{steps.parse_mr.outputs.target_branch}}`
- 评审摘要：`{{steps.review_code.outputs.review_summary}}`
- 发现问题：`{{steps.review_code.outputs.issues_found}}`
- 是否有P0 bug：`{{steps.review_code.outputs.has_p0_bug}}`

## Kimi WebBridge 浏览器工具参考

API 地址：`http://127.0.0.1:10086/command`

**页面导航：**
```json
{"action":"navigate","args":{"url":"目标地址","newTab":true,"group_title":"代码评审"},"session":"code-review"}
```

**获取页面内容：**
```json
{"action":"snapshot","args":{},"session":"code-review"}
```

**点击元素：**
```json
{"action":"click","args":{"selector":"@e123"},"session":"code-review"}
```

**填写文本（不推荐使用 fill，推荐使用 evaluate）：**
```json
{"action":"fill","args":{"selector":"@e456","value":"要输入的内容"},"session":"code-review"}
```

**Windows 注意事项：** 必须先将 JSON 写入临时文件再用 `curl.exe --data-binary @temp_file` 发送，不能用 echo/heredoc 内联（中文会乱码）。

## 验证经验与最佳实践

### 1. 评论输入框定位
**推荐方式：使用 evaluate + CSS 选择器**

GitLab MR 页面有多个 textarea，必须定位到正确的评论输入框：

```javascript
// 正确的评论输入框选择器（优先）
const commentInput = document.querySelector('textarea[name="note[note]"], #note-body, .qa-comment-input');

// 错误的选择器（会填到 Description 或其他区域）
// ❌ document.querySelector('textarea.description')
// ❌ document.querySelector('textarea[name="description"]')

// 验证是否找到正确的输入框
if (commentInput) {
  console.log('找到评论输入框:', commentInput.name, commentInput.id);
}
```

### 2. 填写评论内容
**推荐使用 evaluate 而不是 fill**，因为 fill 可能填错文本框：

```javascript
const ta = document.querySelector('textarea[name="note[note]"]');
if (ta) {
  ta.value = '你的评论内容';
  // 必须触发 input 和 change 事件，让页面识别内容变化
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.dispatchEvent(new Event('change', { bubbles: true }));
}
```

### 3. 提交评论按钮定位
```javascript
// GitLab 评论提交按钮的选择器
const submitBtn = document.querySelector('button.btn-success.js-comment-button, button.js-comment-submit-button');
if (submitBtn) {
  submitBtn.click();
}
```

### 4. 验证评论是否成功发布
```javascript
// 检查讨论数量是否变化
const discussionLink = document.querySelector('a[href*="discussion"]');
const count = discussionLink ? discussionLink.textContent : '0';

// 或者检查是否有讨论项
const discussionItems = document.querySelectorAll('.discussion-item');
console.log('讨论项数量:', discussionItems.length);
```

### 5. 常见问题排查
- **问题**：评论填到了 Description 区域而不是评论区
  - **原因**：选择器错误，匹配到了 Description 的 textarea
  - **解决**：使用 `textarea[name="note[note]"]` 精确匹配

- **问题**：点击提交按钮后页面无反应
  - **原因**：表单可能有验证未通过，或按钮不在可视区域
  - **解决**：检查 textarea 是否有值，确保触发了 input/change 事件

- **问题**：MR 已合并后无法提交评论
  - **原因**：GitLab 合并后的 MR 通常关闭了评论功能
  - **解决**：在评审前检查 MR 状态，避免在已合并的 MR 上浪费时间

## 执行步骤

1. **打开MR页面**：
   使用 Kimi WebBridge 打开 `{{mr_url}}`，等待页面完全加载。

2. **检查MR状态**：
   使用 evaluate 检查 MR 是否已合并或关闭：
   ```javascript
   const statusBadge = document.querySelector('.status-badge');
   const statusText = statusBadge ? statusBadge.textContent.trim() : 'unknown';
   // 如果状态是 Merged/Closed，评论功能可能已关闭，需告知用户
   ```

3. **找到评论区**：
   使用 `evaluate` 获取页面上的 textarea，**必须使用精确选择器**定位到评论输入框：
   ```javascript
   const commentInput = document.querySelector('textarea[name="note[note]"], #note-body, .qa-comment-input');
   ```
   如果页面需要展开评论区域，先点击展开。

4. **撰写评审意见**：
   根据 `review_summary` 和 `issues_found` 撰写完整的评审评论，格式建议：

   ```
   ## 代码评审意见

   ### 改动概述
   （简述本次MR的主要内容）

   ### 发现的问题
   - **P0** [文件:行号] 问题描述 → 改进建议
   - **P1** [文件:行号] 问题描述 → 改进建议
   - **P2** [文件:行号] 问题描述 → 改进建议

   ### 提交质量
   （引用commit分析结果）

   ### 总体评价
   （通过/有条件通过/不通过 + 理由）
   ```

5. **发布评审意见**：
   **使用 evaluate 填写评论内容**（不推荐使用 fill，容易填错文本框）：
   ```javascript
   const ta = document.querySelector('textarea[name="note[note]"]');
   if (ta) {
     ta.value = '你的评论内容';
     ta.dispatchEvent(new Event('input', { bubbles: true }));
     ta.dispatchEvent(new Event('change', { bubbles: true }));
   }
   ```
   
   **点击提交按钮**：
   ```javascript
   const submitBtn = document.querySelector('button.btn-success.js-comment-button, button.js-comment-submit-button');
   if (submitBtn) submitBtn.click();
   ```

6. **验证评论是否发布成功**：
   ```javascript
   const discussionItems = document.querySelectorAll('.discussion-item');
   console.log('讨论项数量:', discussionItems.length);
   ```

7. **额外回复 "1"**：
   如果 `has_p0_bug == false`（没有P0级别bug）：
   - 再次找到评论输入框
   - 输入内容为 `1`
   - 提交评论

   如果 `has_p0_bug == true`：
   - 在评审意见中说明存在阻塞性问题，不建议合并
   - 不需要回复 "1"

## 产出物

调用 `workflow_advance` 时提供：

- **review_posted**：`true` 表示评审意见已成功发布
- **p0_check_comment**：
  - 如果没有P0 bug，设置为 `true`（表示已回复"1"）
  - 如果有P0 bug，设置为 `false`（表示未回复"1"，因存在阻塞性问题）

## 完成标准

- [ ] 已成功打开MR页面
- [ ] 已找到评论输入区域
- [ ] 已发布完整的评审意见
- [ ] 已根据是否存在P0 bug完成额外回复（无P0则回复"1"）