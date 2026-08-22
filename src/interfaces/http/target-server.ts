import Fastify from "fastify";
import { z } from "zod";
import type { ModelResolver } from "../rpc/service.js";

const resolveRequestSchema = z.object({
  requestId: z.string().min(1),
  tenantId: z.string().uuid(),
  label: z.string().min(1),
}).strict();

export interface ReadinessChecks {
  mysql: () => Promise<void>;
  redis: () => Promise<void>;
}

export function createTargetHttpServer(resolver: ModelResolver, checks?: ReadinessChecks) {
  const app = Fastify({ logger: false });
  app.get("/healthz", async () => ({ data: { module: "kokoro-model", status: "ok" } }));
  app.get("/readyz", async (_request, reply) => {
    if (checks) {
      try {
        await Promise.all([checks.mysql(), checks.redis()]);
      } catch {
        return reply.code(503).send({ error: { code: "model.dependencies_not_ready" } });
      }
    }
    return { data: { module: "kokoro-model", status: "ready", dependencies: { mysql: "ok", redis: "ok" } } };
  });
  app.post("/resolve", async (request, reply) => {
    const input = resolveRequestSchema.parse(request.body);
    const result = await resolver(input);
    if (!result) return reply.code(404).send({ error: { code: "model.route_not_found", message: "no model route matched" } });
    return { data: { ...result, routingPolicyGeneration: result.routingPolicyGeneration.toString() } };
  });
  return app;
}
