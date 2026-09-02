# kokoro-model

`kokoro-model` 是独立的模型目录与路由解析服务：根据 `tenant_id + label` 选择当前可用的模型 Revision，返回 Provider、模型名、transport、路由 generation 和 digest。它不执行模型生成、不处理 prompt、不扣费，也不保存 provider 明文密钥；LiteLLM 只是可选的外部执行 gateway，不是 Model 的启动依赖。

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

本地开发也可以只启动组合：`docker compose up --build`。HTTP target 与 RPC 是两个独立进程，HTTP production target 同时提供目录与兼容解析入口，
分别使用 `pnpm http:dev` 和 `pnpm rpc:dev`；启动前必须提供 PostgreSQL 的
`DATABASE_URL_MODEL` 和 Redis 的 `KOKORO_REDIS_URL`。不在仓库 `.env` 中保存真实 provider key，
Provider 目录只记录 `secretRef`。

- HTTP: `4221`
- RPC: `4222`
- PostgreSQL: `55432`
- Redis: `56379`
- `/readyz` 必须同时通过 PostgreSQL `SELECT 1` 和 Redis `PING`
- production HTTP：`GET /bff/model-catalog`（BFF tenant catalog）与受内部认证保护的 `POST /resolve`（兼容解析）由同一个监听器提供

初始化目录：先执行 migration，再按环境决定是否执行 `database/70-model.init.postgresql.sql` 和 builtin seed。OpenRouter 快照项默认
`disabled`，选择 `litellm` transport 时必须先在外部 LiteLLM model_list 部署同名 gateway route，再按环境显式启用；不使用 LiteLLM 的本地 profile 可以只运行 Model 的 catalog/resolve，不执行 LiteLLM seed，也不会影响 `/readyz`。
`claude-code` 与 `kokoro-dev-mock` 仍由本地 builtin catalog 管理，不冒充 OpenRouter 标准模型 ID。

Docker image and `pnpm start` use the compiled HTTP production entry `node --conditions=production dist/src/interfaces/http/target-main.js`.
That entry composes the full Model HTTP API, including `GET /bff/model-catalog`, `GET /readyz`, and the
backward-compatible `POST /resolve` route.

Production `/resolve` is a `runtime-internal` route: callers must send the existing
`x-kokoro-service` + `x-kokoro-internal-secret` pair, and the tenant must come from
`x-kokoro-tenant-id`. The body `tenantId` field is not accepted on this formal route.
The standalone `createTargetHttpServer` remains a local fixture for the legacy body-
tenant shape; it is not a production owner API.
The compose migration job uses the build stage for the Prisma CLI; HTTP and RPC services run the compiled
`pnpm start` and `pnpm start:rpc` entries. PostgreSQL and Redis remain the only runtime data boundaries;
LiteLLM is not part of this repository image or process.

## Architecture

```text
interfaces -> application -> domain -> infrastructure/postgresql + infrastructure/redis
```

跨服务只能依赖 Model RPC contract；不得直接读写 Model 表。管理写入成功后必须失效相关 Redis route cache。

完整的 HTTP/RPC 字段、错误码、生命周期和生成验证规则见 [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md)。

## Verification and acceptance

```bash
pnpm check
pnpm test:contract
pnpm test:integration
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
