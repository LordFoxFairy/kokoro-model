# kokoro-model 运行说明

## 本地启动

```bash
export DATABASE_URL_MODEL=TARGET
export KOKORO_REDIS_URL=TARGET
pnpm db:migrate
pnpm start
```

默认监听 `127.0.0.1:4221`。`GET /healthz` 只检查进程，`GET /readyz` 检查 PostgreSQL、Redis 和契约生成状态。

## 运维边界

- PostgreSQL 是 Catalog、Provider、Availability 和 revision 的事实源。
- Redis 只用于短 TTL cache、lease 和 coordination，失效时回源 PostgreSQL。
- 实际模型 client、provider 调用和执行回执归 kokoro-agent；Model 不读取 Agent 数据库。
- 迁移只能通过 `pnpm db:migrate` 执行；发布前运行 `pnpm verify:release`。
