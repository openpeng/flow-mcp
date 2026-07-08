## 当前任务

审查页面中的 SQL 语句，评估风险等级并检查备份情况。

## 上下文

- 审核页面地址：`{{sql_review_url}}`
- 提审人：`{{requester}}`
- 页面状态：{{steps.open_check_page.outputs.page_status}}

## 浏览器工具参考（Kimi WebBridge）

当前浏览器页面已在第 1 步打开，继续使用 Kimi WebBridge（`http://127.0.0.1:10086/command`）获取页面内容：

**获取页面中的 SQL 语句：**
```javascript
// 查找 SQL 代码区域（常见：textarea、pre、code、div.sql 等）
const sqlEl = document.querySelector('textarea, pre.sql, code.sql, .sql-content, .sql-text, [class*=sql]');
sqlEl ? sqlEl.textContent || sqlEl.value : document.body.innerText
```

**检查备份勾选状态：**
```javascript
// 查找"已备份"相关复选框
JSON.stringify([...document.querySelectorAll('input[type=checkbox]')].map(cb => ({
  text: (cb.labels?.[0]?.textContent || cb.parentElement?.textContent || '').trim(),
  checked: cb.checked
})))
```

## 执行步骤

1. 使用 Kimi WebBridge 注入 JS 从当前浏览器页面中提取 **SQL 语句完整内容**
2. 对 SQL 进行安全性审查，重点检查：
   - **高危操作**：`DROP`、`TRUNCATE`、`DELETE` 无 WHERE 条件、`ALTER TABLE DROP COLUMN` 等破坏性操作
   - **中等风险**：`DELETE` 有 WHERE 条件、`UPDATE` 大批量、`ALTER TABLE` 修改列
   - **低风险**：`SELECT` 查询、`INSERT` 少量数据、`SHOW`/`DESC`/`EXPLAIN` 等只读操作
3. 检查页面中是否有备份声明或备份操作：
   - 注入 JS 检查用户是否勾选了"已备份"确认框
   - 页面中是否提示数据已备份
   - SQL 语句中是否包含备份语句（如 mysqldump、CREATE TABLE ... AS SELECT 备份表等）
4. 给出明确的风险结论

## 风险评估标准

| 风险等级 | 判断标准 |
|---------|---------|
| **high** | 包含 DROP/TRUNCATE/DELETE 无 WHERE、ALTER TABLE DROP COLUMN 等不可逆破坏性操作，且未确认备份 |
| **medium** | 包含 UPDATE 大量数据、DELETE 有条件、ALTER TABLE 修改列，或高风险但有备份确认 |
| **low** | 仅包含 SELECT 查询、INSERT 少量数据、SHOW/DESC/EXPLAIN 等只读或低影响操作 |

## 产出物

调用 `flow_advance` 时提供：

- **sql_content**：页面中 SQL 语句的完整内容（至少 10 个字符）
- **risk_level**：风险等级，值为 `high` / `medium` / `low`
- **risk_details**：详细的风险说明（至少 10 个字符），包括：
  - 识别到的具体风险操作（如 "DELETE FROM users 无 WHERE 条件"）
  - 影响范围评估
  - 是否可逆
- **has_backup**：`true` 或 `false`，是否已确认有备份

## 完成标准

- [ ] 已提取页面中的 SQL 语句完整内容
- [ ] 已逐条分析 SQL 的风险操作
- [ ] 已给出明确的风险等级
- [ ] 已确认备份状态
- [ ] 如果风险为 high 且无备份，将进入用户确认环节
