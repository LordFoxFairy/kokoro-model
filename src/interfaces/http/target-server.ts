import Fastify from "fastify";
import { z } from "zod";
import { PostgresModelResolver } from "../../infrastructure/postgres/model-resolver.js";

const resolveRequestSchema = z.object({
  requestId: z.string().min(1),
  siteId: z.string().uuid(),
  label: z.string().min(1),
}).strict();

export function createTargetHttpServer(resolver: PostgresModelResolver) {
  const app = Fastify({ logger: false });
  app.get("/healthz", async () => ({ data: { module: "kokoro-model", status: "ok" } }));
  app.post("/resolve", async (request, reply) => {
    const input = resolveRequestSchema.parse(request.body);
    const result = await resolver.resolve(input);
    if (!result) return reply.code(404).send({ error: { code: "model.route_not_found", message: "no model route matched" } });
    return { data: { ...result, routingPolicyGeneration: result.routingPolicyGeneration.toString() } };
  });
  return app;
}
