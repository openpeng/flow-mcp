## 当前任务

SQL 存在高风险且未确认备份，请向用户展示风险详情并等待确认。

## 上下文

- 审核页面地址：`{{sql_review_url}}`
- 提审人：`{{requester}}`
- **风险等级**：{{steps.review_sql_risk.outputs.risk_level}}
- **风险评估**：{{steps.review_sql_risk.outputs.risk_details}}
- **SQL 内容**：
  ```
  {{steps.review_sql_risk.outputs.sql_content}}
  ```
- **备份状态**：未备份或无法确认备份

## 执行步骤

1. **向用户清晰展示风险信息：**
   - 风险等级：**高危（HIGH）**
   - 具体风险操作说明
   - SQL 语句完整内容
   - 缺失备份的警告
   - 建议：**强烈建议先执行备份后再提交审核**

2. **明确询问用户是否继续：**
   > 该 SQL 为高危操作且未确认备份，存在数据丢失风险。是否仍然继续提交审核？
   > 请回复 **"确认继续"** 或 **"放弃"**。

3. **等待用户明确文字回复**，根据回复设置：
   - 用户回复"确认继续"、"继续"、"yes"、"是" → `user_confirmed = true`
   - 用户回复"放弃"、"取消"、"no"、"否" → `user_confirmed = false`
   - 回复不明确 → 再次询问，直到获得明确回复

## 产出物

调用 `flow_advance` 时提供：

- **user_confirmed**：`true` 或 `false`（用户是否确认继续）
- **confirmation_reason**：用户的确认原因或备注

## 完成标准

- [ ] 已向用户清晰展示所有风险信息
- [ ] 已明确警告备份缺失的风险
- [ ] 已获得用户的明确确认或拒绝
- [ ] 确认继续 → 进入审批步骤；放弃 → 通知提审人
