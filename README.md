# kokoro-model

`kokoro-model` 是模型目录与路由解析服务：根据 `tenant_id + label` 选择当前可用的模型 Revision，返回 Provider、模型名、transport、路由 generation 和 digest。它不执行模型生成、不处理 prompt、不扣费，也不保存 provider 明文密钥。

## V1 owner

PostgreSQL 是结构化业务事实源，Redis 是必需运行时依赖：用于 resolve cache、短时运行状态和失效通知。Redis 不是业务最终真源。权威 SQL 为根仓库的 `database/60-model.postgresql.sql`。

标准 Model 目录快照见 `database/70-model.init.postgresql.sql`（根仓镜像为
`database/70-model.init.postgresql.sql`）。该文件由 OpenRouter 公共 Models API 生成，当前快照包含
395 个标准模型 ID，并保存完整的 model/provider/revision/label display name、description、context、
modalities、pricing、supported parameters、canonical slug 和 gateway alias；不包含任何真实凭据，也不预置 tenant policy。

Owned tables:

```text
model_provider
model_definition
model_revision
model_label
model_routing_policy
model_provider_health_state
```

所有可删除的目录/策略实体使用 `deleted_at/deleted_by/delete_reason` 软删除；Revision 发布后不可变，只能通过新 Revision 和策略切换退役。

## Contract

```text
kokoro.model.v1.ModelCatalogService/ResolveModel
contract/proto/kokoro/model/v1/model_catalog.proto
```

生成物必须来自 Root contract toolchain。Resolve 只返回已发布且可用的路由结果，不返回 secret，不执行 provider 调用。

## Runtime

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm seed:builtin
pnpm verify:release
pnpm build
docker compose up --build
```

本地开发也可以只启动组合：`docker compose up --build`。HTTP target 与 RPC 是两个独立进程，
分别使用 `pnpm http:dev` 和 `pnpm rpc:dev`；启动前必须提供 PostgreSQL 的
`DATABASE_URL_MODEL` 和 Redis 的 `KOKORO_REDIS_URL`。不在仓库 `.env` 中保存真实 provider key，
Provider 目录只记录 `secretRef`。

- HTTP: `4221`
- RPC: `4222`
- PostgreSQL: `55432`
- Redis: `56379`
- `/readyz` 必须同时通过 PostgreSQL `SELECT 1` 和 Redis `PING`

初始化目录：先执行 migration，再执行 `database/70-model.init.postgresql.sql`。OpenRouter 快照项默认
`disabled`，必须先在 LiteLLM model_list 部署同名 gateway route，再按环境显式启用；这样不会把“目录存在”误当成“路由已可用”。
`claude-code` 与 `kokoro-dev-mock` 仍由本地 builtin catalog 管理，不冒充 OpenRouter 标准模型 ID。

Docker image uses the compiled HTTP production entry `node dist/src/interfaces/http/target-main.js`.
The compose migration job uses the build stage for the Prisma CLI; HTTP and RPC services run the compiled
`pnpm start` and `pnpm start:rpc` entries. PostgreSQL and Redis remain the only runtime data boundaries.

## Architecture

```text
interfaces -> application -> domain -> infrastructure/postgresql + infrastructure/redis
```

跨服务只能依赖 Model RPC contract；不得直接读写 Model 表。管理写入成功后必须失效相关 Redis route cache。

完整的 HTTP/RPC 字段、错误码、生命周期和生成验证规则见 [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md)。

## Verification and acceptance

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm contract:check
pnpm verify:standalone
pnpm test:architecture
pnpm test:integration       # 需要本地 compose PostgreSQL/Redis
```

验收重点：正向 resolve、负向 strict schema/统一错误、tenant hidden visibility、provider `down`、
Redis cache failure fail-closed、opaque cursor continuation、重复 ensure/policy upsert 幂等、published
revision 状态选择、Root generated contract provenance，以及 `/docs/json` 路由收集。

## Risks and rollback

- 当前分页在 application 层对稳定排序结果做窗口化；后续数据量增长时应将同一 cursor 语义下沉为
  PostgreSQL keyset query，不能改变 token 或排序字段。
- Redis 是必需的 runtime dependency；cache failure 返回 `503`，不会静默使用未知旧路由。回滚时先
  恢复上一版本服务，再保留 PostgreSQL rows；schema 只做向前兼容，不删除已发布 revision。
- Root model proto 属于根仓唯一权威。本仓 `contract/provenance.json` 与生成物只允许通过 Root
  contract toolchain 更新，禁止在本仓手改 generated protobuf。
