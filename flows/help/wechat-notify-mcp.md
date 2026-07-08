# 企微通知 MCP 工具使用指南

企微通知工具通过企业微信给员工发送消息，用于工作流中的通知环节。

## 工具信息

- **工具名称**: `wechat_send_message`
- **MCP 服务**: `http://dy.gaodunwangxiao.com/mcp/server/JSioZA6Wtm91riA0/mcp`
- **功能**: 通过企业微信向员工发送消息通知

## 参数说明

| 参数 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `name` | ✅ | string | 员工姓名或工号（部分用户可用中文名，部分需要工号） |
| `msg` | ✅ | string | 消息内容 |
| `nonum` | ❌ | string | 员工工号，当姓名查找失败时需要提供 |

## 使用示例

### 基本用法

```
使用 wechat_send_message 工具发送通知：

name: 李九安
msg: |
  【SQL审核结果通知】
  
  工单：user_question_record移除无用字段
  状态：审核通过
  风险等级：HIGH
  审核页面：https://dms.gaodunwangxiao.com/workflow/107546
  
  风险详情：
  该SQL包含2个DROP COLUMN操作，属于不可逆的破坏性DDL。
  影响行数：16638行
  备份状态：未备份
```

### 姓名查找失败时使用工号

```
使用 wechat_send_message 工具发送通知：

name: 李九安
nonum: LJ001
msg: |
  【审核通知】您的工单已通过审核。
```

## 配置说明

- **默认服务地址**: `http://dy.gaodunwangxiao.com/mcp/server/JSioZA6Wtm91riA0/mcp`
- **环境变量**: 可通过 `WECHAT_NOTIFY_MCP_URL` 覆盖服务地址

## 工作流集成

在 flow.yaml 的步骤中声明使用该工具：

```yaml
steps:
  - id: notify_result
    name: 通知审核结果
    tools:
      - wechat_send_message
    checkpoint:
      required_outputs:
        wechat_notified:
          type: boolean
```

## 返回值

```json
{
  "ok": true,
  "data": {
    "success": true,
    "message": "{\"errcode\":0,\"errmsg\":\"ok\",\"msgid\":\"...\"}"
  }
}
```

## 完成标准

- [ ] 调用 `wechat_send_message` 工具成功
- [ ] 返回 `success: true`
- [ ] 提审人已收到企微消息
