# kokoro-model

`kokoro-model` 是模型目录与路由解析服务：根据 `tenant_id + label` 选择当前可用的模型 Revision，返回 Provider、模型名、transport、路由 generation 和 digest。它不执行模型生成、不处理 prompt、不扣费，也不保存 provider 明文密钥。

## V1 owner

MySQL 是结构化业务事实源，Redis 是必需运行时依赖：用于 resolve cache、短时运行状态和失效通知。Redis 不是业务最终真源。权威 SQL 为根仓库的 `database/schema/60-model.mysql.sql`。

已有 LiteLLM 配置的可重复初始数据见 `database/70-model.init.mysql.sql`（根仓镜像为
`database/schema/70-model.init.mysql.sql`）。它包含完整的 model/provider/revision/label
display name、description、gateway alias 和 secret reference；不包含任何真实凭据，也不预置 tenant policy。

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
pnpm verify:release
docker compose up --build
```

- HTTP: `4221`
- RPC: `4222`
- MySQL: `53306`
- Redis: `56379`
- `/readyz` 必须同时通过 MySQL `SELECT 1` 和 Redis `PING`

初始化目录：先执行 migration，再执行 `database/70-model.init.mysql.sql`。其中
`kokoro-dev-mock` 默认 `disabled`，只保留为本地配置记录，避免进入生产运行时。

## Architecture

```text
interfaces -> application -> domain -> infrastructure/mysql + infrastructure/redis
```

跨服务只能依赖 Model RPC contract；不得直接读写 Model 表。管理写入成功后必须失效相关 Redis route cache。

完整的 HTTP/RPC 字段、错误码、生命周期和生成验证规则见 [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md)。
