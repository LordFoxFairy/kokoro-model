# kokoro-model 技术方案

> 执行级设计以 [Model 设计卡](../technical/backend-design/02-model.md) 为准。

## 定位

`kokoro-model` 是模型 Provider、Model Definition/Revision、站点路由策略和 Provider 健康
投影的唯一业务 owner。它回答“给定 SiteContext 和 label，当前可以解析到哪些已发布模型、
按什么稳定顺序回落、使用哪个 transport”，不执行生成，也不负责扣费。

实现状态：当前 `kokoro-platform/kokoro-model` 仍是迁移来源，使用 Prisma/MySQL 的
`ProviderAccount`、`ModelBinding`、`ModelLabel` 和 `SiteModelPolicy` 表。目标实现以
Root PostgreSQL 的 `database/schema/60-model.sql` 为权威，旧写面迁移完成前不得形成双写。

## 业务职责

拥有：

```text
model_provider             Provider 目录、secretRef 引用、生命周期状态。
model_definition           稳定模型目录实体。
model_revision             Provider 模型参数和能力快照；发布后不可变。
model_routing_policy       Site + label 的路由、优先级和 fallback 输入。
model_provider_health_state Provider 健康状态投影。
```

不拥有：

```text
Site / Identity / 权限       kokoro-iam 及 Site owner。
Provider 网关运行时          LiteLLM 或其它 provider adapter/runtime。
用户余额、价格、扣费          kokoro-credit / kokoro-payment。
Agent 执行、prompt、产物       kokoro-agent / kokoro-storage。
```

旧 `ProviderAccount`、`ModelBinding`、`ModelLabel` 仅作为迁移来源，不是目标领域模型或
第二套生产写入口。

## 数据 owner

```text
model_provider                 kokoro-model catalog/admin application
model_definition/revision      kokoro-model catalog/admin application
model_routing_policy           kokoro-model routing/admin application
model_provider_health_state    kokoro-model health worker
```

Agent、Credit 等仓库可以保存 `model_revision_id` 作为引用，但不得直接读写上述 Model 表。
`site_site` 外键只表达数据库部署顺序和引用完整性，不改变 Site 的业务 owner。

## 目标目录

```text
src/
├── catalog/                         Provider、Definition、Revision
├── routing/                         Resolve、稳定排序和 fallback
├── policies/                        Site/label 路由策略
├── health/                          provider health projection/worker
├── adapters/                        LiteLLM/provider adapter
├── interfaces/{http,rpc,admin}/
├── infrastructure/postgres/
├── generated/                       Root contract 生成物
├── config/
└── main.ts
```

目录按业务模块组织；`adapters/` 只负责外部协议适配，不把 Provider payload、secret 或
网关运行时状态带入 Model domain。

## 公开契约与调用边界

服务间唯一公开解析契约：

```text
kokoro.model.v1.ModelCatalogService/ResolveModel
source: contract/proto/kokoro/model/v1/model_catalog.proto
consumers: kokoro-model, kokoro-agent
```

`ResolveModel` 必须只返回已发布且可用的候选、`routing_policy_generation` 和 digest；不
返回 secret，不启动 Agent，不判断余额，不执行最终扣费。管理 HTTP 面可由 Admin Gateway
调用，但管理路由不是 Agent 的 runtime contract。

Model 对 IAM 只消费 SiteContext/authorization 输入，不 import IAM 实现代码，也不直接查
询 IAM 表。跨仓生成类型只能来自 Root `contract/`，禁止手工维护副本。

## 解析规则

目标解析以同一数据库快照完成：

```text
1. 校验 SiteContext 和 label 输入。
2. 选择 active 的 site routing policy。
3. 仅接受 published revision；active route 必须指向 LiteLLM revision。
4. 以 priority asc + 稳定 revision key 排序。
5. 在同一请求快照内执行 fallback，并返回 generation/digest。
```

`model_revision` 发布后不可修改；Provider/model 参数变化必须创建新 Revision，再由策略
显式切换。解析结果不携带 provider secret，也不隐式跨请求改变排序。

## 当前实现与迁移映射

| 当前 Prisma/MySQL 来源 | 目标 PostgreSQL 事实 | 迁移说明 |
|---|---|---|
| `ProviderAccount` | `model_provider` | 保留 provider/key/status/secretRef；明文 secret 不迁移 |
| `ModelBinding` | `model_definition` + `model_revision` | 每次发布形成 Revision；旧 transport 值需显式映射 |
| `ModelLabel` | `model_routing_policy.label` 的业务输入 | 展示标签不是独立 runtime 写面，除非后续证明其为独立事实 |
| `SiteModelPolicy` | `model_routing_policy` | 迁移为 site + label + revision + priority + status |
| `healthStatus` | `model_provider_health_state` | 健康观测与目录事实分离 |

迁移顺序：先固化 schema/owner，再生成 Resolve consumer，接入只读解析，完成数据映射和
回滚快照，最后切换唯一 writer 并删除旧 Prisma/MySQL 写面。

## 禁止项

- Model 不 import IAM、Credit、Payment、Agent 的实现代码。
- Model 不直接访问其他 owner 的表，不向旧 Platform registry 增加新写入口。
- 不把价格、quota、用户 prompt、原始 provider payload 或 secret 写入 Model persistence。
- 不以目录移动冒充 owner、契约、测试和旧入口迁移完成。

## 测试与完成门禁

必须覆盖：

```text
unit          stable ordering、fallback、transport/secretRef 规则。
database      owner、唯一性、site FK、published revision immutable、active route 约束。
contract      Resolve proto、生成物 provenance、consumer 清单。
integration   site isolation、disabled/unhealthy provider、revision 切换。
architecture  越界 import、跨表写入、旧入口回流。
smoke         唯一生产入口和 Resolve 公开调用面。
```

完成条件是目标目录真实存在、PostgreSQL owner 清单一致、契约生成检查通过、唯一 runtime
writer 已切换，且旧入口已删除或具备明确兼容期限和回滚方案。
