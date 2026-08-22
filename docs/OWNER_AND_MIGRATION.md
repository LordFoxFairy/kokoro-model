# Owner and migration contract

## Final owner

`kokoro-model` 是以下事实的唯一 runtime writer：

```text
model_provider
model_definition
model_revision
model_label
model_routing_policy
model_provider_health_state
```

Agent、Credit、Payment 只能保存 `model_revision_id` 等引用，不能直接访问或写入 Model 表。

## Storage rules

- MySQL/InnoDB 保存结构化事实。
- Redis 保存短 TTL cache、短期状态和失效路径，不保存最终业务事实。
- Provider、Definition、Label、Routing Policy 的删除是软删除；Revision 不删除，发布后不可变，以 `retired_at` 或新策略退役。
- 所有默认查询过滤 `deleted_at IS NULL`；后台审计可显式包含已删除记录。
- MySQL 没有可延迟约束；published revision、active route 等跨行不变量在同一 Repository transaction 中校验。

## Canonical artifacts

- SQL: `database/schema/60-model.mysql.sql`
- Prisma schema/migrations: `prisma/`
- Repository: `src/infrastructure/prisma/` and `src/infrastructure/mysql/`
- Redis cache/invalidation: `src/infrastructure/redis/`
- RPC source: `contract/proto/kokoro/model/v1/model_catalog.proto`

PostgreSQL baseline is historical and is not a Model runtime dependency.
