## 当前任务

使用 Kimi WebBridge 浏览器工具打开 SQL 审核页面，确认页面是否支持审核。

## 上下文

- 审核页面地址：`{{sql_review_url}}`
- 提审人：`{{requester}}`

## 浏览器工具参考（Kimi WebBridge）

API 地址：`http://127.0.0.1:10086/command`

**页面导航：**
```json
{
  "action": "navigate",
  "url": "<目标地址>",
  "session": "<会话名>",
  "newTab": true
}
```

**获取页面内容（注入 JS）：**
```javascript
// 获取页面完整文本内容
document.body.innerText

// 查找特定按钮
JSON.stringify([...document.querySelectorAll('button')].map(b => ({text: b.textContent.trim(), visible: b.offsetParent !== null})))

// 查找包含"审核通过"的按钮
[...document.querySelectorAll('button, a, input[type=submit]')].filter(el => /审核通过|通过|Approve/.test(el.textContent))
```

**Windows 注意事项：** 必须先将 JSON 写入临时文件再用 `curl.exe --data-binary @temp_file` 发送，不能用 echo/heredoc 内联（中文会乱码）。

## 执行步骤

1. 确认 Kimi WebBridge daemon 已启动（`kimi-webbridge status` 检查 `extension_connected: true`）
2. 使用 `navigate` action 打开页面 `{{sql_review_url}}`，建议 `newTab: true`
3. 等待页面完全加载后，执行 JS 获取页面内容、查找审核按钮
4. 重点检查页面中是否存在 **"审核通过"** 或类似功能的审核按钮（如"通过"、"Approve"、"同意"等）
5. 根据检查结果判断：
   - **存在审核按钮**：说明可以进行审核，设置 `has_approve_button = true`
   - **不存在审核按钮**：可能原因：
     - 该页面不支持审核操作（不是审核页面）
     - 审核已经完成，按钮已消失
     - 当前登录用户无审核权限

## 产出物

调用 `flow_advance` 时提供：

- **page_loaded**：`true`（确认页面成功加载）
- **has_approve_button**：`true` 或 `false`（是否存在审核通过按钮）
- **page_status**：字符串，详细描述页面当前状态，至少 10 个字符。包括：
  - 页面标题
  - 是否有审核按钮
  - 如果有，按钮的文字和位置
  - 如果没有，页面上显示的状态信息（如"审核已完成"、"待审核"、报错信息等）

## 完成标准

- [ ] 浏览器已成功打开审核页面
- [ ] 页面内容已完整加载
- [ ] 已确认是否存在"审核通过"按钮
- [ ] 已记录详细的页面状态信息
