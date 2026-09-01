# kokoro-model 风险

- Provider API 变更：通过 immutable catalog revision 和 availability 状态隔离，Agent 只消费公开 contract。
- Redis 丢失：缓存可重建；任何模型事实不得只写 Redis。
- 契约漂移：`pnpm contract:check` 和 provenance gate 在发布前阻断。
- 真实 provider 调用不在本仓验收范围，由 kokoro-agent 的 runtime/adapter 测试覆盖。
