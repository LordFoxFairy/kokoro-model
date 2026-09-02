# kokoro-model API 与契约

状态：V1 runtime contract，2026-08-22

## 0. 设计目的

Model 是 Kokoro 的**模型目录与路由决策服务**：把产品能力请求中的 `label`，在受信
`tenant_id` 上下文中解析成当前可执行的 `model_revision`、Provider、transport 和路由版本。
它让 Agent/BFF 不需要知道 Provider 目录、LiteLLM 别名、健康状态或租户可见性规则，
同时让 Billing/Credit 与模型选择解耦。Model 不执行模型调用，也不承担任务编排；Manus API
中的任务异步生命周期、Project、Webhook 和 Structured Output 是可借鉴的契约思想，不属于
Model 的 owner 边界。

本设计吸收 Manus API 的四点：显式版本、稳定 opaque ID、统一错误 envelope、异步/重试边界
清晰；不复制其 `/v2/task.create` operation 命名，也不把 Agent Task 资源塞进 Model。

管理端 catalog/provider mutation 必须携带 `Idempotency-Key`；重复请求返回同一 revision，冲突 payload
返回统一 `model.idempotency_conflict`，不能只依赖 Redis。

## 1. 边界

`kokoro-model` 对外提供两类入口：

1. **跨服务 runtime RPC**：唯一稳定的模型解析契约，由 Root `contract/` 中的 Protobuf 定义。
2. **HTTP 管理/本地运行入口**：供 Admin Gateway、运维和本地 smoke 使用，不作为 Agent 的跨仓领域契约。

Model 只返回可路由的模型元数据，不执行 provider 调用、不返回 secret、不判断余额、不扣费。

## 2. LiteLLM optional boundary

`transport=MODEL_TRANSPORT_LITELLM` 只表示“该 revision 需要一个外部 LiteLLM/OpenAI-compatible
route”。Model 的 `/readyz`、catalog 和 `ResolveModel` 不会连接、探活或启动该 gateway；没有
LiteLLM 时仍可独立启动 Model 并解析非 LiteLLM route/目录。Agent 只有在
`KOKORO_LITELLM_ENABLED=1` 且具备 gateway URL/key 时才执行 LiteLLM route，缺配置返回明确的
provider configuration error。

## 3. RPC contract

权威源：`contract/proto/kokoro/model/v1/model_catalog.proto`

服务：`kokoro.model.v1.ModelCatalogService`；方法：`ResolveModel`。

### Request

```json
{
  "requestId": "req_01",
  "tenantId": "tenant_01",
  "label": "default"
}
```

| 字段 | 必填 | 规则 |
|---|---:|---|
| `request_id` | 是 | 调用链请求标识；不得为空 |
| `tenant_id` | 是 | IAM/System 构建的 opaque 隔离键；Model 不自行从浏览器输入推断 |
| `label` | 是 | 业务路由标签；不得为空 |

### Response

```json
{
  "modelRevisionId": "rev_01",
  "providerId": "provider_01",
  "providerModelName": "gateway-model",
  "transport": "MODEL_TRANSPORT_LITELLM",
  "routingPolicyId": "policy_01",
  "routingPolicyGeneration": "7",
  "digest": "sha256:..."
}
```

`routing_policy_generation` 用于缓存版本和并发读一致性；HTTP 展示层序列化为字符串，避免 JavaScript 整数精度问题。

### RPC error mapping

| 场景 | Connect/gRPC code | 业务语义 |
|---|---|---|
| 缺少必填字段 | `InvalidArgument` | 参数校验失败 |
| 没有可用路由 | `NotFound` | `model.route_not_found` |
| PostgreSQL/Redis 暂时不可用 | `Unavailable` | 依赖失败；仅幂等读可重试 |
| 未分类异常 | `Internal` | 不暴露 SQL、堆栈或 secret |

调用方必须设置有限 deadline；不允许无限等待。

## 4. HTTP production entry

`pnpm start` and the Docker image both start `src/interfaces/http/target-main.ts` from compiled output. This is the single
production HTTP surface: it exposes readiness, the BFF catalog, the management/admin routes, and the
pre-existing `/resolve` compatibility adapter. `/resolve` is a `runtime-internal` route and uses the existing
`x-kokoro-service` + `x-kokoro-internal-secret` authentication pattern. The BFF must call the catalog on this same
listener; it must not assume that `/bff/model-catalog` is served by a separate process.

`GET /readyz` checks PostgreSQL and Redis. In production, the HTTP entry requires the `agent`, `admin`, and
`web-bff` caller secrets at startup. Docker Compose supplies local placeholder values; deployments must inject
independent secret values through the environment.

## 5. HTTP runtime resolve

### `POST /resolve`

用途：HTTP adapter、本地 runtime 和 smoke 验证模型解析。

```json
{
  "requestId": "req_01",
  "label": "default"
}
```

生产 `/resolve` 要求 `x-kokoro-tenant-id` 作为可信内部上下文，并拒绝 body 中的 `tenantId`；
调用方还必须通过 `x-kokoro-service` 和对应的 `x-kokoro-internal-secret`。浏览器字段不能作为授权依据。
跨服务正式调用优先使用下方 RPC。

`createTargetHttpServer` 是本地 target fixture，使用与 production 相同的可信租户请求上下文，且不代表
production owner API。该入口只用于本地 target HTTP 测试与 smoke fixture。

成功响应为 `{ "data": ResolveModelResponse }`；无匹配路由返回 HTTP `404` 和：

```json
{
  "error": {
    "code": "model.route_not_found",
    "message": "no model route matched"
  }
}
```

所有 HTTP 响应都会回显 `requestId`。调用方应优先发送 `x-kokoro-request-id`；缺省时服务生成
本次请求的 id。错误统一为 `{ error: { code, message, details? }, requestId }`，不返回 SQL、堆栈
或 provider 凭据。`/resolve` 的 body `requestId` 仅用于本次请求校验失败时的回显，正式跨仓链路仍以
Root RPC 的 `request_id` 为准。

## 5. HTTP management surface

以下入口只允许内部 Admin Gateway/管理调用方访问，不是 Agent runtime contract：

| 方法 | 路径 | 语义 |
|---|---|---|
| `POST` | `/provider-accounts/ensure` | 幂等创建/更新 Provider 引用 |
| `DELETE` | `/provider-accounts/:providerAccountId` | 软删除 Provider |
| `POST` | `/provider-accounts/:providerAccountId/restore` | 恢复 Provider |
| `POST` | `/model-bindings/ensure` | 创建模型 Revision 输入 |
| `DELETE` | `/model-bindings/:modelBindingId` | 软删除 Binding |
| `POST` | `/model-bindings/:modelBindingId/restore` | 恢复 Binding |
| `POST` | `/model-labels/ensure` | 幂等维护模型标签 |
| `GET` | `/model-labels` | 查询 active 标签 |
| `GET` | `/model-bindings` | 查询 Binding |
| `GET` | `/model-bindings/resolve` | 解析预览；租户上下文来自 `x-kokoro-tenant-id` |
| `GET` | `/bff/model-catalog` | `web-bff` 专用的租户可见目录，租户只来自 `x-kokoro-tenant-id` |

列表接口接受 `limit=1..100` 和 opaque `cursor`。为保持已有本地消费者兼容，`data` 仍是数组，分页
信息位于同层的 `page: { nextCursor? }`；BFF facade 使用浏览器契约风格的
`data: { items, next_cursor? }`。游标绑定资源和查询范围，跨资源、跨 filter 或损坏的游标返回
`400 model.invalid_cursor`。

`/bff/model-catalog` 的成功响应：

```json
{
  "data": {
    "items": [{
      "key": "chat.default",
      "displayName": "Kokoro 默认",
      "featureKey": "chat",
      "availability": "available",
      "capabilities": { "inputModalities": ["text"], "outputModalities": ["text"], "contextWindow": 128000 }
    }]
  },
  "meta": { "request_id": "req_01" }
}
```

目录只返回 active label。`hidden` tenant policy 会从该租户目录剔除；没有 policy 使用全局目录。
`availability` 为 `available`、`provider_unavailable` 或 `unconfigured`，因此 UI 不会把目录存在误报成
可执行。BFF 不执行模型调用，实际 client/执行仍由 Agent runtime 按 Root RPC contract 完成。

所有写请求必须通过应用层完成关联、软删除、状态和事务校验；数据库不建立外键。跨表读取使用参数化 SQL JOIN，并限制返回列。

## 6. 生命周期与一致性

- Provider、Label、Routing Policy 使用 `deleted_at/deleted_by/delete_reason` 软删除。
- Revision 发布后不可修改；变更必须创建新 Revision，再切换 policy。
- 写入事务提交成功后失效 Redis route cache；Redis 不是最终事实源。
- `tenant_id` 由 IAM/System 提供，Model 不拥有 Tenant 表。
- 关联对象不存在、已删除或状态不允许时，由 Application/Repository 返回稳定业务错误码。
- Model schema 不建立外键；业务关联由事务内 Application/Repository 校验，读取关联使用参数化 JOIN。
- V1 没有 visible tenant policy 时使用全局 label 默认路由；存在 hidden policy 时不返回该 label。
- Provider availability 状态为 `unknown -> healthy/degraded/down` 的健康投影；`down` 不参与 resolve，
  `degraded` 仍可参与 resolve。Binding 的 `publishedAt/retiredAt/status` 组成 revision 状态视图：
  未发布为 `draft`，已发布且 provider 可用为 `available`，禁用为 `disabled`，退役/软删除为 `retired`。
- tenant policy 的 `(tenant_id, label_key)` 是幂等键；Provider、Binding、Label 的 ensure 也分别使用业务唯一键。
  重试相同 payload 返回同一资源，不产生重复记录。管理写入须由 Admin Gateway 以 `admin` caller 进入；
  BFF 只允许 `web-bff` caller 读取 tenant-scoped catalog，agent 只允许 runtime-internal 读取。

## 7. 统一错误与权限矩阵

| Surface | caller | tenant 来源 | 失败语义 |
|---|---|---|---|
| Root Resolve RPC | Agent/受信 runtime | RPC `tenant_id` | `InvalidArgument` / `NotFound` / `Unavailable` / `Internal` |
| `POST /resolve` | agent 等 runtime-internal | `x-kokoro-tenant-id`；body `tenantId` 被拒绝 | 未认证 `401`；缺 tenant `400 model.tenant_required`；统一 HTTP error envelope |
| `/model-bindings/resolve` | agent 等 runtime-internal | `x-kokoro-tenant-id`，缺省仅限内部预览 | 统一 HTTP error envelope |
| `/bff/model-catalog` | web-bff | 必须有 `x-kokoro-tenant-id` | 缺 tenant 为 `400 model.tenant_required` |
| `/admin/models/*` | admin | 管理 gateway 的授权上下文 | route-access 先认证 caller，再由 manifest permission 做操作授权 |

Model 不导入 IAM、Agent、Credit 或 Billing 的实现，也不把 request body 中的 tenant 当作授权依据。
`x-kokoro-service` 和对应 per-caller secret 是服务间身份；生产缺少 `agent`、`admin` 或 `web-bff`
凭据时启动失败。

## 8. 生成与验证

修改 RPC 必须修改 Root `.proto`，然后执行：

```bash
pnpm contract:lint
pnpm contract:generate
pnpm verify:contract-provenance
pnpm verify:release
```

禁止手工修改 `src/generated/`；生成物、contract provenance 和 consumer 清单必须一致。

## 9. 初始模型目录

`database/70-model.init.postgresql.sql` 是 OpenRouter 公共 Models API 的幂等快照 materialization，当前包含 395 个标准模型 ID，例如
`openai/gpt-4o-mini`、`anthropic/claude-sonnet-4.6`、`google/gemini-2.5-pro`、`deepseek/deepseek-chat` 和 `qwen/qwen3-30b-a3b`。
完整名称和 metadata 以 SQL 快照中的 `model_definition`/`model_revision` 为准，不再人为拼接 `kokoro-openai-*` 这类非标准 ID。

OpenRouter 快照的 revision/label 默认 disabled；部署同名 LiteLLM route 后再显式启用。`claude-code` 与 `kokoro-dev-mock` 是 Kokoro 本地 facade/mock，单独保留。

SQL 只写 `env:*` secret reference，不写 key；tenant policy 不在初始化脚本中生成，必须由 IAM/System
提供真实 `tenant_id` 后通过管理流程写入。
