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
   ## SQL 审核结果通知

   提审人：{{requester}}
   审核页面：{{sql_review_url}}
   风险等级：{{steps.review_sql_risk.outputs.risk_level}}
   审核操作：已审核通过
   结果详情：{{steps.approve_sql.outputs.approval_result}}

   风险评估：
   {{steps.review_sql_risk.outputs.risk_details}}
   ```

2. 将消息通知给提审人 `{{requester}}`。如果有可用的通知渠道（如企业微信 MCP 工具、邮件等），通过相应渠道发送；否则在对话中公告结果。

3. 确认提审人已收到通知。

## 产出物

调用 `flow_advance` 时提供：

- **notification_done**：`true`（确认通知已完成）
- **final_status**：字符串（至少 10 个字符），最终审核状态的完整描述，包含：
  - 审核结果摘要
  - 如需后续操作的建议

## 完成标准

- [ ] 已汇总完整的审核过程信息
- [ ] 已将结果通知给提审人 `{{requester}}`
- [ ] 流程结束
