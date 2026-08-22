# kokoro-model 设计卡

状态：V1 目标设计与 runtime 基线已确定；MySQL DDL、Repository、Redis readiness 和 RPC contract 统一。

## 定位

模型目录、Provider、Model Definition/Revision、Binding、Routing Policy 和健康投影的 owner。

## 领域等级

L0/L1。目录和解析规则为主；只有 routing policy 形成复杂状态机时局部升级 L2。

## 拥有 / 不拥有

拥有 provider、model definition/revision、site routing policy、provider health projection，以及
解析请求所需的稳定排序和 fallback 规则。`site_id` 只作为 IAM/Site 提供的上下文标识，Model
不拥有 Site 的生命周期。

不拥有 provider 网关实现、用户余额、套餐权益、Agent 执行、原始大 payload，也不拥有 IAM
的用户/组织/权限表。

应用层的 `ProviderAccount`、`ModelBinding`、`ModelLabel` 和 `SiteModelPolicy` 仅是 domain API；物理事实统一收敛到
`model_provider`、`model_revision` 和 `model_routing_policy`，展示标签只在确有业务事实时
作为 Model 模块内部投影保留。

## 数据 owner 与唯一写入者

| 数据 | 物理表 | owner | runtime writer |
|---|---|---|---|
| Provider 目录与状态 | `model_provider` | kokoro-model | kokoro-model catalog/admin application |
| Model 定义与不可变 Revision | `model_definition`, `model_revision` | kokoro-model | kokoro-model catalog/admin application |
| Site 路由策略 | `model_routing_policy` | kokoro-model | kokoro-model routing/admin application |
| Provider 健康投影 | `model_provider_health_state` | kokoro-model | kokoro-model health worker |

其他仓库只能通过 Model contract 读取解析结果；Agent 的执行清单和 Credit 的扣费事实
可以引用 `model_revision_id`，但不得写入 Model 表。

## 目标目录

```text
src/
├── catalog/
├── routing/
├── policies/
├── health/                         provider health projection/worker
├── adapters/                       LiteLLM/provider adapter；不承载领域规则
├── interfaces/{http,rpc,admin}/
├── infrastructure/mysql/
├── generated/
├── config/
└── main.ts
```

## 关键边界

- LiteLLM 是 `adapters/` 的 provider/gateway 实现，不是 Model domain。
- `ResolveModel` 只返回已发布、可用的候选和 routing generation/digest，不决定最终扣费，
  不启动 Agent，也不返回 provider secret。
- 解析排序必须由 `(site_id, label, priority, stable model revision key)` 决定；fallback
  只能在同一请求快照内进行，不能跨请求隐式改变结果。
- `model_revision` 发布后不可变；替换 provider/model 参数必须创建新 Revision，并由策略
  显式切换。
- Model 对 IAM 只消费 SiteContext/authorization 输入；不直接 import IAM domain，也不
  直接查询 IAM 表。`site_site` 外键是数据库部署顺序上的跨 slice 关系，不代表业务反向拥有。
- secret 只保存 secretRef，不保存明文。

## 公开入口与契约

- 服务间公开入口：`kokoro.model.v1.ModelCatalogService/ResolveModel`。
- 契约源：`contract/proto/kokoro/model/v1/model_catalog.proto`。
- 生成消费方：`kokoro-model` 与 `kokoro-agent`；生成物必须来自 Root `contract/`，不得手改。
- 管理入口可以由 Admin Gateway 调用 Model 的 HTTP/admin surface，但管理路由不是跨仓领域
  契约，也不能被 Agent 当作 runtime API。

## 依赖方向与禁止项

```text
interfaces -> application -> catalog/routing/policies -> infrastructure/mysql
adapters -> application ports（不得反向污染 domain）
```

- 禁止 Model import `kokoro-iam`、`kokoro-credit`、`kokoro-payment`、`kokoro-agent` 的实现代码。
- 禁止直接读取或写入其他 owner 的表；跨表关系只由 Root schema 的显式 FK/验证 SQL 管理。
- 禁止把 LiteLLM provider payload、secret 或用户 prompt 进入 Model domain/persistence。
- 禁止继续扩展旧 Platform registry 作为新的 Model 写入口。

## 100 分证据

- model catalog/binding/policy 的 owner 和唯一性约束明确。
- routing 查询有稳定排序和 fallback 测试。
- provider payload 与 domain 类型隔离。
- Model 不直接访问 Credit 或 Payment 表。
- contract consumer 与生成目录一致。
- published revision 不可变、active route 只能指向已发布 LiteLLM revision。
- 设计审计能区分MySQL DDL、Prisma schema 与 Repository。


## 当前落地证据与迁移门禁

当前代码证据（只证明现状，不等于目标已完成）：

- `database/schema/60-model.mysql.sql`
- `database/slices/slice-a.json`（Model 表清单与 slice 归属）
- `contract/proto/kokoro/model/v1/model_catalog.proto`
- `contract/consumers.yaml`（Model 与 Agent 的生成消费关系）
- `kokoro-platform/kokoro-model`

V1 完成门禁必须同时具备：

- schema 与唯一 owner / runtime writer 清单一致；
- 公开 contract、生成物和 consumer 清单一致；
- 旧 Platform Model 写面已退出 runtime，不存在双写或旧入口回流；
- architecture test 能阻止越界 import、跨表写入和旧入口回流；
- unit、integration、database、contract test 覆盖本卡的核心不变量，包括稳定排序、fallback、
  site 隔离、revision 不可变和 secretRef 不落明文；
- 旧入口或旧写面已删除，或有明确的兼容截止版本和回滚方案。

## 迁移顺序

1. 以 Root MySQL migration/baseline 和 `database/slices/slice-a.json` 固化 Model
   owner、约束和跨 slice FK。
2. 以 `model_catalog.proto` 固化 Resolve 请求/响应，生成 TypeScript/Python consumer，
   先接入只读解析路径。
3. 由 MySQL migration 创建最终表，并通过 Repository transaction 写入 Provider/Definition/Revision/Policy。
4. 所有删除走软删除或状态退役；Revision 保持不可变，Redis 在写入成功后失效。
5. 运行 architecture、database、contract、integration 和公开入口 smoke 验证，确认唯一 runtime writer。
