# kokoro-model 验收

```bash
pnpm contract:check
pnpm typecheck
pnpm lint
pnpm test:architecture
pnpm test
pnpm build
pnpm verify:standalone
```

真实依赖验收：设置 `DATABASE_URL_MODEL=TARGET` 后运行 `pnpm db:migrate && pnpm smoke:postgresql`；设置
`KOKORO_REDIS_URL=TARGET` 后运行 `pnpm smoke:redis`。正向、分页、租户隔离、权限拒绝、缓存失效和 readiness
测试必须全部通过。
