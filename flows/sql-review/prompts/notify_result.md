## 当前任务

将 SQL 审核的最终结果通知给提审人。

## 上下文

- 提审人：`{{requester}}`
- 审核页面：`{{sql_review_url}}`
- 风险等级：{{steps.review_sql_risk.outputs.risk_level}}
- 风险详情：{{steps.review_sql_risk.outputs.risk_details}}
- 审核结果：{{steps.approve_sql.outputs.approval_result}}

## 执行步骤

1. 汇总本次审核的完整信息，整理为清晰的通知消息：

   ```
   【SQL审核结果通知】

   提审人：{{requester}}
   审核页面：{{sql_review_url}}
   风险等级：{{steps.review_sql_risk.outputs.risk_level}}
   审核操作：已审核通过
   结果详情：{{steps.approve_sql.outputs.approval_result}}

   风险评估：
   {{steps.review_sql_risk.outputs.risk_details}}
   ```

2. 使用 `wechat_send_message` 工具向提审人发送企微通知：

   ```
   wechat_send_message(
     name: "{{requester}}",
     msg: "【SQL审核结果通知】\n\n提审人：{{requester}}\n审核页面：{{sql_review_url}}\n风险等级：{{steps.review_sql_risk.outputs.risk_level}}\n审核操作：已审核通过\n结果详情：{{steps.approve_sql.outputs.approval_result}}\n\n风险评估：\n{{steps.review_sql_risk.outputs.risk_details}}"
   )
   ```

3. 如果姓名查找失败，尝试使用工号（nonum 参数）重新发送。

4. 确认提审人已收到通知。

## 工具说明

- **工具名称**: `wechat_send_message`
- **参数**:
  - `name`（必填）: 提审人姓名或工号
  - `msg`（必填）: 消息内容
  - `nonum`（可选）: 员工工号（姓名查找失败时使用）

## 产出物

调用 `flow_advance` 时提供：

- **notification_done**：`true`（确认通知已完成）
- **final_status**：字符串（至少 10 个字符），最终审核状态的完整描述，包含：
  - 审核结果摘要
  - 如需后续操作的建议
- **wechat_notified**：`true`（确认已通过企微发送通知）

## 完成标准

- [ ] 已汇总完整的审核过程信息
- [ ] 已使用 `wechat_send_message` 工具向提审人发送企微通知
- [ ] 确认通知发送成功（返回 success: true）
- [ ] 流程结束
