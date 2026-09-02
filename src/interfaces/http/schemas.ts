import { z } from "zod";

export const modelTransportKindSchema = z.enum(["litellm", "direct", "internal"]);

export const providerAccountParamsSchema = z
  .object({
    providerAccountId: z.string().min(1),
  })
  .strict();

export const modelBindingParamsSchema = z
  .object({
    modelBindingId: z.string().min(1),
  })
  .strict();

export const deleteRequestSchema = z
  .object({
    deletedBy: z.string().min(1),
    reason: z.string().min(1).optional(),
  })
  .strict();

export const ensureProviderAccountRequestSchema = z
  .object({
    provider: z.string().min(1),
    key: z.string().min(1),
    label: z.string().min(1),
    secretRef: z.string().min(1),
    priority: z.number().int().min(0).optional(),
    transportKind: modelTransportKindSchema,
  })
  .strict();

export const ensureModelBindingRequestSchema = z
  .object({
    providerAccountId: z.string().min(1),
    modelName: z.string().min(1),
    displayName: z.string().min(1),
    featureKey: z.string().min(1),
    labelKeys: z.array(z.string().min(1)).default([]),
    inputModalities: z.array(z.string().min(1)).default([]),
    outputModalities: z.array(z.string().min(1)).default([]),
    transportKind: modelTransportKindSchema,
    gatewayModelName: z.string().min(1).optional(),
    contextWindow: z.number().int().positive().optional(),
    priority: z.number().int().min(0).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    // WHY: litellm 传输必须有 gatewayModelName，否则绑定无法被网关路由（resolve 会返回不可用项）。
    if (value.transportKind === "litellm" && value.gatewayModelName === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["gatewayModelName"],
        message: "gatewayModelName is required when transportKind is litellm",
      });
    }
  });

export const modelLabelStatusSchema = z.enum(["active", "disabled"]);
export const providerHealthStatusSchema = z.enum(["unknown", "healthy", "degraded", "down"]);

export const providerHealthRequestSchema = z
  .object({ status: providerHealthStatusSchema })
  .strict();

// 用户可选「模型标签」= 面向用户的模型目录项;key 唯一(幂等 upsert),featureKey 归类(chat/embedding…)。
export const ensureModelLabelRequestSchema = z
  .object({
    key: z.string().min(1),
    displayName: z.string().min(1),
    description: z.string().min(1).nullable().optional(),
    featureKey: z.string().min(1),
    tier: z.string().min(1).nullable().optional(),
    defaultBindingId: z.string().min(1).nullable().optional(),
    status: modelLabelStatusSchema.optional(),
  })
  .strict();

// 运行时目录查询（runtime 消费侧拉「用户可选模型目录」）：featureKey 可选过滤;只出 active。
export const listModelLabelsQuerySchema = z
  .object({
    featureKey: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict();

export const listModelBindingsQuerySchema = z
  .object({
    featureKey: z.string().min(1).optional(),
    labelKey: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict();

export const listTenantModelPoliciesQuerySchema = z
  .object({
    tenantId: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict();

export const listModelPageQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict();

export const bffModelCatalogQuerySchema = z
  .object({
    featureKey: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict();

export const resolveModelBindingsQuerySchema = z
  .object({
    featureKey: z.string().min(1),
    labelKey: z.string().min(1).optional(),
    transportKind: modelTransportKindSchema.optional(),
  })
  .strict();

export const tenantModelPolicyStatusSchema = z.enum(["visible", "hidden"]);

export const upsertTenantModelPolicyRequestSchema = z
  .object({
    tenantId: z.string().min(1),
    labelKey: z.string().min(1),
    modelRevisionId: z.string().min(1).nullable().optional(),
    priority: z.number().int().min(0).optional(),
    status: tenantModelPolicyStatusSchema,
  })
  .strict();
