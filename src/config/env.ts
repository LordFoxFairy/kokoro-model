import { z } from "zod";

// 不 .strict()：parse process.env 超集，strict 会被 PATH/HOME 等无关变量拒绝
export const modelEnvSchema = z.object({
  DATABASE_URL_MODEL: z.string().url(),
  KOKORO_MODEL_PORT: z.coerce.number().int().min(1).max(65535).default(4221),
  KOKORO_REDIS_URL: z.string().url().default("redis://127.0.0.1:6379"),
  MODEL_RESOLVE_CACHE_TTL_SECONDS: z.coerce.number().int().min(1).max(86400).default(30),
});

export type ModelEnv = z.infer<typeof modelEnvSchema>;

export function loadModelEnv(env: NodeJS.ProcessEnv = process.env): ModelEnv {
  return modelEnvSchema.parse(env);
}
