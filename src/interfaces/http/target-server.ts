import Fastify from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { isModelDependencyError } from "../../domain/errors.js";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ModelResolver } from "../rpc/service.js";

const trustedResolveRequestSchema = z.object({
  requestId: z.string().min(1),
  label: z.string().min(1),
}).strict();

export interface ReadinessChecks {
  postgresql: () => Promise<void>;
  redis: () => Promise<void>;
}

export function registerTargetReadinessRoute(app: FastifyInstance, checks?: ReadinessChecks): void {
  app.get("/readyz", async (request, reply) => {
    const id = requestId(request.headers["x-kokoro-request-id"], request.id);
    if (checks) {
      try {
        await Promise.all([checks.postgresql(), checks.redis()]);
      } catch {
        await reply.code(503).send({
          error: { code: "model.dependencies_not_ready", message: "model dependencies are not ready" },
          meta: { request_id: id },
        });
        return;
      }
    }
    return {
      data: { module: "kokoro-model", status: "ready", dependencies: { postgresql: "ok", redis: "ok" } },
      meta: { request_id: id },
    };
  });
}

export function registerTargetResolveRoute(app: FastifyInstance, resolver: ModelResolver): void {
  app.post("/resolve", async (request, reply) => {
    const body = request.body as Record<string, unknown> | null;
    const inputRequestId = typeof body?.requestId === "string" ? body.requestId : undefined;
    const tenantId = headerValue(request.headers["x-kokoro-tenant-id"]);
    const id = inputRequestId ?? requestId(request.headers["x-kokoro-request-id"], request.id);
    try {
      if (tenantId === null) {
        return reply.code(400).send({
          error: { code: "model.tenant_required", message: "tenant context is required" },
          meta: { request_id: id },
        });
      }
      const input = trustedResolveRequestSchema.parse(request.body);
      const response = await resolveTarget(reply, resolver, { ...input, tenantId }, id);
      return response;
    } catch (error) {
      return resolveTargetError(reply, error, id);
    }
  });
}

export function createTargetHttpServer(resolver: ModelResolver, checks?: ReadinessChecks) {
  const app = Fastify({ logger: false });
  app.get("/healthz", async (request) => ({
    data: { module: "kokoro-model", status: "ok" },
    meta: { request_id: requestId(request.headers["x-kokoro-request-id"], request.id) },
  }));
  registerTargetReadinessRoute(app, checks);
  registerTargetResolveRoute(app, resolver);
  return app;
}

async function resolveTarget(
  reply: FastifyReply,
  resolver: ModelResolver,
  input: { requestId: string; tenantId: string; label: string },
  id: string,
) {
  const result = await resolver(input);
  if (!result) {
    return reply.code(404).send({
      error: { code: "model.route_not_found", message: "no model route matched" },
      meta: { request_id: id },
    });
  }
  return reply.send({
    data: { ...result, routingPolicyGeneration: result.routingPolicyGeneration.toString() },
    meta: { request_id: id },
  });
}

function resolveTargetError(reply: FastifyReply, error: unknown, id: string) {
  if (error instanceof z.ZodError) {
    return reply.code(400).send({
      error: { code: "request.invalid", message: "request is invalid", details: error.issues },
      meta: { request_id: id },
    });
  }
  if (isModelDependencyError(error)) {
    return reply.code(503).send({
      error: { code: error.code, message: "model dependencies are unavailable" },
      meta: { request_id: id },
    });
  }
  return reply.code(500).send({
    error: { code: "internal.error", message: "internal error" },
    meta: { request_id: id },
  });
}

function requestId(value: string | string[] | undefined, fallback: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (Array.isArray(value) && value[0]) return value[0];
  return fallback || randomUUID();
}

function headerValue(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.trim() || null;
}
