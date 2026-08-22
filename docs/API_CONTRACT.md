# kokoro-model API 与契约

状态：V1 runtime contract，2026-08-22

## 1. 边界

`kokoro-model` 对外提供两类入口：

1. **跨服务 runtime RPC**：唯一稳定的模型解析契约，由 Root `contract/` 中的 Protobuf 定义。
2. **HTTP 管理/本地运行入口**：供 Admin Gateway、运维和本地 smoke 使用，不作为 Agent 的跨仓领域契约。

Model 只返回可路由的模型元数据，不执行 provider 调用、不返回 secret、不判断余额、不扣费。

## 2. RPC contract

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
| MySQL/Redis 暂时不可用 | `Unavailable` | 依赖失败；仅幂等读可重试 |
| 未分类异常 | `Internal` | 不暴露 SQL、堆栈或 secret |

调用方必须设置有限 deadline；不允许无限等待。

## 3. HTTP runtime resolve

### `POST /resolve`

用途：HTTP adapter、本地 runtime 和 smoke 验证模型解析。

```json
{
  "requestId": "req_01",
  "tenantId": "tenant_01",
  "label": "default"
}
```

`tenantId` 必须是 UUID；受信入口构建的租户上下文不能被浏览器字段覆盖。

成功响应为 `{ "data": ResolveModelResponse }`；无匹配路由返回 HTTP `404` 和：

```json
{
  "error": {
    "code": "model.route_not_found",
    "message": "no model route matched"
  }
}
```

## 4. HTTP management surface

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

所有写请求必须通过应用层完成关联、软删除、状态和事务校验；数据库不建立外键。跨表读取使用参数化 SQL JOIN，并限制返回列。

## 5. 生命周期与一致性

- Provider、Label、Routing Policy 使用 `deleted_at/deleted_by/delete_reason` 软删除。
- Revision 发布后不可修改；变更必须创建新 Revision，再切换 policy。
- 写入事务提交成功后失效 Redis route cache；Redis 不是最终事实源。
- `tenant_id` 由 IAM/System 提供，Model 不拥有 Tenant 表。
- 关联对象不存在、已删除或状态不允许时，由 Application/Repository 返回稳定业务错误码。

## 6. 生成与验证

修改 RPC 必须修改 Root `.proto`，然后执行：

```bash
pnpm contract:lint
pnpm contract:generate
pnpm verify:contract-provenance
pnpm verify:release
```

禁止手工修改 `src/generated/`；生成物、contract provenance 和 consumer 清单必须一致。
