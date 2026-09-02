import { jsonSchema, registerAdminManifestRoute, sendData, sendError, sendZodError } from "@kokoro/service-kit";
import type { FastifyInstance, FastifyReply } from "fastify";
import { ZodError } from "zod";
import type { ModelBindingStatus, ProviderAccountStatus } from "../../domain/enums.js";
import { isModelLifecycleError } from "../../domain/errors.js";
import type { ModelRepository } from "../../application/ports.js";
import { modelAdminManifest } from "../admin/manifest.js";
import {
  deleteRequestSchema,
  modelBindingParamsSchema,
  providerAccountParamsSchema,
  listTenantModelPoliciesQuerySchema,
  listModelPageQuerySchema,
  providerHealthRequestSchema,
  upsertTenantModelPolicyRequestSchema,
} from "./schemas.js";
import { pageWindow } from "../../application/pagination.js";
import { sendPagedData } from "./routes.js";

interface IdParams {
  id: string;
}

export function registerModelAdminRoutes(app: FastifyInstance, repository: ModelRepository): void {
  registerAdminManifestRoute(app, modelAdminManifest);

  app.get<{ Querystring: { limit?: number; cursor?: string } }>("/admin/models/provider-accounts", { schema: { querystring: jsonSchema(listModelPageQuerySchema) } }, async (request, reply) => {
    try {
      const query = listModelPageQuerySchema.parse(request.query);
      const page = pageWindow("admin-provider-accounts", await repository.listProviderAccounts({ includeDeleted: true }), query);
      return sendPagedData(reply, page.items, page.nextCursor);
    } catch (error) {
      return handleAdminModelError(error, reply, "model.provider_account_list_failed");
    }
  },
  );

  app.get<{ Querystring: { limit?: number; cursor?: string } }>("/admin/models/bindings", { schema: { querystring: jsonSchema(listModelPageQuerySchema) } }, async (request, reply) => {
    try {
      const query = listModelPageQuerySchema.parse(request.query);
      const page = pageWindow("admin-model-bindings", await repository.listAllModelBindings({ includeDeleted: true }), query);
      return sendPagedData(reply, page.items, page.nextCursor);
    } catch (error) {
      return handleAdminModelError(error, reply, "model.binding_list_failed");
    }
  },
  );

  app.get<{ Querystring: { limit?: number; cursor?: string } }>("/admin/models/labels", { schema: { querystring: jsonSchema(listModelPageQuerySchema) } }, async (request, reply) => {
    try {
      const query = listModelPageQuerySchema.parse(request.query);
      const page = pageWindow("admin-model-labels", await repository.listModelLabels(), query);
      return sendPagedData(reply, page.items, page.nextCursor);
    } catch (error) {
      return handleAdminModelError(error, reply, "model.label_list_failed");
    }
  },
  );

  app.get<{ Querystring: { tenantId?: string; limit?: number; cursor?: string } }>(
    "/admin/models/tenant-policies",
    { schema: { querystring: jsonSchema(listTenantModelPoliciesQuerySchema) } },
    async (request, reply) => {
      try {
        const query = listTenantModelPoliciesQuerySchema.parse(request.query);
        const page = pageWindow(
          `admin-tenant-policies:${query.tenantId ?? "*"}`,
          await repository.listTenantModelPolicies(query.tenantId),
          query,
        );
        return sendPagedData(reply, page.items, page.nextCursor);
      } catch (error) {
        return handleAdminModelError(error, reply, "model.tenant_policy_list_failed");
      }
    },
  );

  app.post("/admin/models/tenant-policies", { schema: { body: jsonSchema(upsertTenantModelPolicyRequestSchema) } }, async (request, reply) => {
    try {
      const input = upsertTenantModelPolicyRequestSchema.parse(request.body);
      return sendData(reply, await repository.upsertTenantModelPolicy(input));
    } catch (error) {
      if (error instanceof ZodError) {
        return sendZodError(reply, error);
      }
      return sendError(reply, 500, "model.tenant_policy_upsert_failed", "租户模型策略写入失败");
    }
  });

  registerProviderAccountStatusRoute(app, repository, "disable", "disabled");
  registerProviderAccountStatusRoute(app, repository, "enable", "active");
  app.post<{ Params: IdParams }>("/admin/models/provider-accounts/:id/health", { schema: { params: jsonSchema(providerAccountParamsSchema), body: jsonSchema(providerHealthRequestSchema) } }, async (request, reply) => {
    try {
      const input = providerHealthRequestSchema.parse(request.body);
      const account = await repository.setProviderHealthStatus(request.params.id, input.status);
      if (account === null) return sendProviderAccountNotFound(reply);
      return sendData(reply, account);
    } catch (error) {
      return handleAdminModelError(error, reply, "model.provider_health_update_failed");
    }
  });
  registerProviderAccountLifecycleRoutes(app, repository);
  registerModelBindingStatusRoute(app, repository, "disable", "disabled");
  registerModelBindingStatusRoute(app, repository, "enable", "active");
  registerModelBindingLifecycleRoutes(app, repository);
}

function registerProviderAccountStatusRoute(
  app: FastifyInstance,
  repository: ModelRepository,
  action: "disable" | "enable",
  status: ProviderAccountStatus,
): void {
  app.post<{ Params: IdParams }>(
    `/admin/models/provider-accounts/:id/${action}`,
    async (request, reply) => {
      const account = await repository.setProviderAccountStatus(request.params.id, status);
      if (account === null) {
        return sendProviderAccountNotFound(reply);
      }
      return sendData(reply, account);
    },
  );
}

function registerProviderAccountLifecycleRoutes(app: FastifyInstance, repository: ModelRepository): void {
  app.delete("/admin/models/provider-accounts/:providerAccountId", async (request, reply) => {
    try {
      const { providerAccountId } = providerAccountParamsSchema.parse(request.params);
      const input = deleteRequestSchema.parse(request.body);
      const result = await repository.deleteProviderAccount({
        id: providerAccountId,
        deletedBy: input.deletedBy,
        reason: input.reason,
      });
      return sendData(reply, result);
    } catch (error) {
      return handleAdminModelError(error, reply, "model.provider_account_delete_failed");
    }
  });

  app.post("/admin/models/provider-accounts/:providerAccountId/restore", async (request, reply) => {
    try {
      const { providerAccountId } = providerAccountParamsSchema.parse(request.params);
      const result = await repository.restoreProviderAccount({ id: providerAccountId });
      return sendData(reply, result);
    } catch (error) {
      return handleAdminModelError(error, reply, "model.provider_account_restore_failed");
    }
  });
}

function registerModelBindingStatusRoute(
  app: FastifyInstance,
  repository: ModelRepository,
  action: "disable" | "enable",
  status: ModelBindingStatus,
): void {
  app.post<{ Params: IdParams }>(
    `/admin/models/bindings/:id/${action}`,
    async (request, reply) => {
      const binding = await repository.setModelBindingStatus(request.params.id, status);
      if (binding === null) {
        return sendModelBindingNotFound(reply);
      }
      return sendData(reply, binding);
    },
  );
}

function registerModelBindingLifecycleRoutes(app: FastifyInstance, repository: ModelRepository): void {
  app.delete("/admin/models/bindings/:modelBindingId", async (request, reply) => {
    try {
      const { modelBindingId } = modelBindingParamsSchema.parse(request.params);
      const input = deleteRequestSchema.parse(request.body);
      const result = await repository.deleteModelBinding({
        id: modelBindingId,
        deletedBy: input.deletedBy,
        reason: input.reason,
      });
      return sendData(reply, result);
    } catch (error) {
      return handleAdminModelError(error, reply, "model.binding_delete_failed");
    }
  });

  app.post("/admin/models/bindings/:modelBindingId/restore", async (request, reply) => {
    try {
      const { modelBindingId } = modelBindingParamsSchema.parse(request.params);
      const result = await repository.restoreModelBinding({ id: modelBindingId });
      return sendData(reply, result);
    } catch (error) {
      return handleAdminModelError(error, reply, "model.binding_restore_failed");
    }
  });
}

function handleAdminModelError(error: unknown, reply: FastifyReply, fallbackCode: string) {
  if (error instanceof ZodError) {
    return sendZodError(reply, error);
  }
  if (isModelLifecycleError(error)) {
    return sendError(reply, error.statusCode, error.code, error.message);
  }
  if (error instanceof Error && (error.message === "model.invalid_cursor" || error.message === "model.invalid_page")) {
    return sendError(reply, 400, error.message, "分页参数无效");
  }
  return sendError(reply, 500, fallbackCode, "模型管理操作失败");
}

function sendProviderAccountNotFound(reply: FastifyReply) {
  return sendError(reply, 404, "model.provider_account_not_found", "Provider 账号不存在");
}

function sendModelBindingNotFound(reply: FastifyReply) {
  return sendError(reply, 404, "model.binding_not_found", "模型绑定不存在");
}
