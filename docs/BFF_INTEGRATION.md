# kokoro-model BFF v1 接入说明

BFF 只通过本仓公开的 generated client/HTTP v1 读取模型目录和可用性，不读取 PostgreSQL 或 Redis。

- 请求必须携带可信服务上下文、`request_id` 和租户/站点作用域。
- 列表使用 opaque cursor；BFF 原样传递 `next_cursor`，不自行拼接数据库分页。
- Model 返回 provider/model 的公开契约和能力声明；BFF 不把 provider secret、内部 endpoint 或 Agent runtime 字段下发到 Web。
- Agent 通过 Model contract 解析选择结果，实际调用仍由 Agent 执行。

机器可读契约见 [`API_CONTRACT.md`](API_CONTRACT.md)，根仓 `contract/` 是跨仓 wire authority。
