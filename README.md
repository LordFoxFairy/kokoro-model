# kokoro-model

模型目录、Provider、Model Definition/Revision、站点路由策略和 Provider 健康投影的业务 owner。

本 README 描述当前迁移来源和最终目标；执行级边界以根仓库的
`docs/kokoro-handbook/technical/backend-design/02-model.md` 为准。

## 当前状态

当前代码仍位于 `kokoro-platform/kokoro-model`，属于 Platform workspace package：

- Prisma datasource 当前为 MySQL；
- 当前模型为 `ProviderAccount`、`ModelBinding`、`ModelLabel`、`SiteModelPolicy`；
- 已有 HTTP/admin、seed、unit test、integration test 和 Docker/Kubernetes 运行入口；
- Root contract 已定义 `kokoro.model.v1.ModelCatalogService/ResolveModel`，当前实现仍需完成 RPC 接入；
- 最终 owner/schema 以根仓库 `database/schema/60-model.sql` 的 MySQL 表为准。

因此当前 package 通过测试不等于 Model 子仓库完成；独立仓库、独立 toolchain/lockfile/CI、契约生成闭环和 MySQL owner 切换仍是完成门禁。

## 最终职责

拥有：

```text
model_provider
model_definition
model_revision
model_routing_policy
model_provider_health_state
```

不拥有 IAM 身份/权限、Credit/Payment 余额与扣费、Agent 执行、LiteLLM 网关运行时、
provider secret 明文或原始 provider payload。

## 最终目录

```text
src/
├── catalog/
├── routing/
├── policies/
├── health/
├── adapters/
├── interfaces/{http,rpc,admin}/
├── infrastructure/mysql/
├── generated/
├── config/
└── main.ts
```

## 契约

```text
source:
  contract/proto/kokoro/model/v1/model_catalog.proto

service:
  kokoro.model.v1.ModelCatalogService/ResolveModel

consumers:
  kokoro-model
  kokoro-agent
```

生成物必须由 Root contract toolchain 生成，不手工修改。Resolve 只返回已发布、可用的
模型候选和 routing generation/digest；不返回 secret、不扣费、不启动 Agent。

## 本地运行（当前迁移来源）

```bash
pnpm --filter @kokoro/model db:generate
pnpm --filter @kokoro/model dev
pnpm --filter @kokoro/model typecheck
pnpm --filter @kokoro/model test
pnpm --filter @kokoro/model test:integration
```

关键配置：

```text
DATABASE_URL_MODEL
KOKORO_MODEL_PORT=4221
KOKORO_MODEL_BASE_URL=http://kokoro-model:4221
```

生产/容器内服务间地址使用 `http://kokoro-model:4221`，不使用 localhost。

## 完成门禁

Model 完成前必须同时具备：

- 独立 Git 仓库、package manager/toolchain、lockfile 和 CI；
- README、技术方案、模块设计卡与实现一致；
- MySQL schema owner 和唯一 runtime writer 清单；
- API/RPC contract、生成客户端、consumer 检查；
- HTTP/RPC 启动入口、配置、部署和本地 smoke；
- architecture、unit、integration、database、contract test；
- 旧 Prisma/MySQL 写面删除或有明确兼容期限和回滚方案。

## 明确不把以下事项当作完成

- 只有 `Hold`/Resolve 切片测试通过；
- 只有 Platform workspace package 可启动；
- 只有设计卡 100/100；
- 只有 Prisma client 生成成功；
- 只有 Docker/Kubernetes manifest 存在。

## Local runtime

The standalone target runs with both MySQL and Redis. Start the closure with `docker compose up --build`; HTTP is exposed on `4221`, RPC on `4222`, MySQL on `53306`, and Redis on `56379`. Readiness requires both dependencies.
