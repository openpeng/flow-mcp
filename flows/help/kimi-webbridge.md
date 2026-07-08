# Kimi WebBridge 浏览器自动化工具安装与使用指南

Kimi WebBridge 提供浏览器自动化能力，用于在 Chrome/Edge 浏览器中执行页面导航、表单填写、元素操作等任务。

## 前置检查

1. 检查安装路径：
   - Windows: `C:\Users\<user>\.kimi-webbridge\bin\kimi-webbridge.exe`
2. 运行 `kimi-webbridge status` 确认 daemon 运行状态 + extension 连接状态

## 安装配置

提示用户在 https://www.kimi.com/zh-cn/features/webbridge 安装浏览器本地插件，必须安装。

### 安装命令

```powershell
irm https://cdn.kimi.com/webbridge/install.ps1 | iex
```
 
### 安装后步骤

1. 在 Chrome/Edge 浏览器中启用 Kimi WebBridge 扩展
2. 确认 daemon 已启动：
   - Windows: `& "$env:USERPROFILE\.kimi-webbridge\bin\kimi-webbridge.exe" start`
3. 确认 browser extension 已连接（status 中 `extension_connected: true`） 未连接，提示用户在 https://www.kimi.com/zh-cn/features/webbridge 安装浏览器本地插件

## 使用说明

### API Endpoint

```
http://127.0.0.1:10086/command
```

### 常用操作

**页面导航：**
```json
{
  "action": "navigate",
  "url": "<目标地址>",
  "session": "<会话名>",
  "newTab": true
}
```

**获取页面元素：**
```javascript
JSON.stringify([...document.querySelector('select').options].map(o => ({value: o.value, text: o.text})))
```

**设置表单值：**
```javascript
sel.value = '<选项值>';
sel.dispatchEvent(new Event('change', {bubbles: true}))
```

### Windows 注意事项

必须先将 JSON 写入临时文件再用 `curl.exe --data-binary @temp_file` 发送，不能用 echo/heredoc 内联（中文会乱码）。

## 完成标准

- [ ] Kimi WebBridge daemon 已启动（port 10086）
- [ ] Browser extension 已连接
- [ ] 工具就绪，可以继续
