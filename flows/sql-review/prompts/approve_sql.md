## 当前任务

在审核页面中点击"审核通过"按钮，提交 SQL 审核。使用 Kimi WebBridge 进行浏览器交互。

## 上下文

- 审核页面地址：`{{sql_review_url}}`
- 提审人：`{{requester}}`
- 风险等级：{{steps.review_sql_risk.outputs.risk_level}}
- 当前浏览器页面已在第 1 步打开，继续使用同一 session 操作

## 浏览器工具参考（Kimi WebBridge）

API 地址：`http://127.0.0.1:10086/command`

**点击按钮（注入 JS 查找并点击）：**
```javascript
// 查找"审核通过"按钮并点击
const btn = [...document.querySelectorAll('button, a, input[type=submit], span.btn')]
  .find(el => /审核通过/.test(el.textContent));
if (btn) { btn.click(); 'clicked'; } else { 'not found'; }
```

**处理确认弹窗：**
```javascript
// 查找确认弹窗中的确定按钮
const confirmBtn = [...document.querySelectorAll('button')]
  .find(el => /确定|确认|OK|Yes/.test(el.textContent));
if (confirmBtn) confirmBtn.click();
```

**获取页面反馈信息（点击后检查结果）：**
```javascript
// 获取页面提示信息
document.querySelector('.message, .toast, .alert, .result, .notification')?.textContent
|| document.body.innerText.substring(0, 500)
```

**Windows 注意事项：** 必须先将 JSON/JS 写入临时文件再用 `curl.exe --data-binary @temp_file` 发送。

## 执行步骤

1. 确认当前浏览器页面仍在审核页面。如果页面已关闭或过期，使用 `navigate` 重新打开 `{{sql_review_url}}`
2. 使用 Kimi WebBridge 注入 JS 定位 **"审核通过"** 按钮并点击：
   - 通过文字匹配查找按钮元素
   - 如果按钮有唯一 ID 或 class，也可通过选择器定位
   - 注意可能有多个按钮，确保点击的是审核通过相关按钮
3. 点击后检查是否有确认弹窗：
   - 如有弹窗（如"确定通过审核？"），注入 JS 点击确认按钮
4. 等待页面响应后，获取页面反馈内容，确认提交成功：
   - 查看页面提示信息（如"审核成功"、"操作成功"、"提交成功"等）
   - 如有错误，记录错误信息

## 产出物

调用 `flow_advance` 时提供：

- **approval_submitted**：`true`（确认审核已提交）
- **approval_result**：字符串（至少 10 个字符），描述提交后的结果，包括：
  - 页面返回的提示信息
  - 提交是否成功
  - 任何错误或警告信息

## 完成标准

- [ ] 成功定位并点击"审核通过"按钮
- [ ] 确认审核结果已提交
- [ ] 记录提交后的页面反馈信息
- [ ] 如有必要，截图保存审核结果
