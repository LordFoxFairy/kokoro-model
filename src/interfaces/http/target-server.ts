import Fastify from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { isModelDependencyError } from "../../domain/model-lifecycle.js";
import type { ModelResolver } from "../rpc/service.js";

const resolveRequestSchema = z.object({
  requestId: z.string().min(1),
  tenantId: z.string().uuid(),
  label: z.string().min(1),
}).strict();

export interface ReadinessChecks {
  postgresql: () => Promise<void>;
  redis: () => Promise<void>;
}

export function createTargetHttpServer(resolver: ModelResolver, checks?: ReadinessChecks) {
  const app = Fastify({ logger: false });
  app.get("/healthz", async (request) => ({
    data: { module: "kokoro-model", status: "ok" },
    requestId: requestId(request.headers["x-kokoro-request-id"], request.id),
  }));
  app.get("/readyz", async (request, reply) => {
    const id = requestId(request.headers["x-kokoro-request-id"], request.id);
    if (checks) {
      try {
        await Promise.all([checks.postgresql(), checks.redis()]);
      } catch {
        return reply.code(503).send({
          error: { code: "model.dependencies_not_ready", message: "model dependencies are not ready" },
          requestId: id,
        });
      }
    }
    return {
      data: { module: "kokoro-model", status: "ready", dependencies: { postgresql: "ok", redis: "ok" } },
      requestId: id,
    };
  });
  app.post("/resolve", async (request, reply) => {
    const body = request.body as Record<string, unknown> | null;
    const inputRequestId = typeof body?.requestId === "string" ? body.requestId : undefined;
    const id = inputRequestId ?? requestId(request.headers["x-kokoro-request-id"], request.id);
    try {
      const input = resolveRequestSchema.parse(request.body);
      const result = await resolver(input);
      if (!result) {
        return reply.code(404).send({
          error: { code: "model.route_not_found", message: "no model route matched" },
          requestId: id,
        });
      }
      return {
        data: { ...result, routingPolicyGeneration: result.routingPolicyGeneration.toString() },
        requestId: id,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: { code: "request.invalid", message: "request is invalid", details: error.issues },
          requestId: id,
        });
      }
      if (isModelDependencyError(error)) {
        return reply.code(503).send({
          error: { code: error.code, message: "model dependencies are unavailable" },
          requestId: id,
        });
      }
      return reply.code(500).send({
        error: { code: "internal.error", message: "internal error" },
        requestId: id,
      });
    }
  });
  return app;
}

function requestId(value: string | string[] | undefined, fallback: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (Array.isArray(value) && value[0]) return value[0];
  return fallback || randomUUID();
}
