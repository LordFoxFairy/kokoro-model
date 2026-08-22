import type { Prisma, PrismaClient } from "../../../generated/prisma/index.js";
import type {
  ModelBinding,
  ModelBindingStatus,
  ModelLabel,
  ProviderAccount,
  ProviderAccountStatus,
  TenantModelPolicy,
} from "../../domain/model.js";
import { ModelLifecycleError, type DeleteInput, type ListOptions, type RestoreInput } from "../../domain/model-lifecycle.js";
import type {
  EnsureModelBindingInput,
  EnsureModelLabelInput,
  EnsureProviderAccountInput,
  ListModelBindingsFilter,
  ModelRepository,
  ResolveModelInput,
  UpsertTenantModelPolicyInput,
} from "../../domain/repository.js";

export class PrismaModelRepository implements ModelRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async ensureProviderAccount(input: EnsureProviderAccountInput): Promise<ProviderAccount> {
    const existing = await this.prisma.providerAccount.findUnique({
      where: {
        provider_key: {
          provider: input.provider,
          key: input.key,
        },
      },
    });
    if (existing?.deletedAt) {
      throw lifecycleError(
        "model.provider_account.deleted",
        `provider account deleted: ${existing.id}`,
        409,
      );
    }

    const account = await this.prisma.providerAccount.upsert({
      where: {
        provider_key: {
          provider: input.provider,
          key: input.key,
        },
      },
      create: {
        provider: input.provider,
        key: input.key,
        label: input.label,
        secretRef: input.secretRef,
        priority: input.priority ?? 100,
        transportKind: input.transportKind,
        status: "active",
      },
      update: {
        label: input.label,
        secretRef: input.secretRef,
        priority: input.priority ?? 100,
        transportKind: input.transportKind,
        status: "active",
      },
    });
    if (account.deletedAt) {
      throw lifecycleError("model.provider_account.deleted", `provider account deleted: ${account.id}`, 409);
    }

    return mapProviderAccount(account);
  }

  async ensureModelBinding(input: EnsureModelBindingInput): Promise<ModelBinding> {
    const account = await this.prisma.providerAccount.findUnique({
      where: {
        id: input.providerAccountId,
      },
    });
    if (account === null) {
      throw lifecycleError(
        "model.provider_account.not_found",
        `provider account not found: ${input.providerAccountId}`,
        404,
      );
    }
    if (account.deletedAt) {
      throw lifecycleError(
        "model.provider_account.deleted",
        `provider account deleted: ${input.providerAccountId}`,
        409,
      );
    }

    const existing = await this.prisma.modelBinding.findUnique({
      where: {
        providerAccountId_modelName_transportKind: {
          providerAccountId: input.providerAccountId,
          modelName: input.modelName,
          transportKind: input.transportKind,
        },
      },
    });
    if (existing?.deletedAt) {
      throw lifecycleError("model.binding.deleted", `model binding deleted: ${existing.id}`, 409);
    }

    const binding = await this.prisma.modelBinding.upsert({
      where: {
        providerAccountId_modelName_transportKind: {
          providerAccountId: input.providerAccountId,
          modelName: input.modelName,
          transportKind: input.transportKind,
        },
      },
      create: {
        providerAccountId: input.providerAccountId,
        provider: account.provider,
        modelName: input.modelName,
        displayName: input.displayName,
        featureKey: input.featureKey,
        labelKeys: input.labelKeys,
        inputModalities: input.inputModalities,
        outputModalities: input.outputModalities,
        transportKind: input.transportKind,
        ...defined("gatewayModelName", input.gatewayModelName),
        ...defined("contextWindow", input.contextWindow),
        priority: input.priority ?? 100,
        status: "active",
        publishedAt: new Date(),
      },
      update: {
        provider: account.provider,
        displayName: input.displayName,
        featureKey: input.featureKey,
        labelKeys: input.labelKeys,
        inputModalities: input.inputModalities,
        outputModalities: input.outputModalities,
        transportKind: input.transportKind,
        gatewayModelName: input.gatewayModelName ?? null,
        contextWindow: input.contextWindow ?? null,
        priority: input.priority ?? 100,
        status: "active",
        publishedAt: new Date(),
      },
    });
    if (binding.deletedAt) {
      throw lifecycleError("model.binding.deleted", `model binding deleted: ${binding.id}`, 409);
    }

    return mapModelBinding(binding);
  }

  async listModelBindings(filter: ListModelBindingsFilter): Promise<ModelBinding[]> {
    const bindings = await this.prisma.modelBinding.findMany({
      where: {
        status: "active",
        deletedAt: null,
        ...defined("featureKey", filter.featureKey),
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });

    return bindings
      .map(mapModelBinding)
      .filter((binding) => !filter.labelKey || binding.labelKeys.includes(filter.labelKey));
  }

  async resolveModelBindings(input: ResolveModelInput): Promise<ModelBinding[]> {
    const bindings = await this.prisma.modelBinding.findMany({
      where: {
        status: "active",
        deletedAt: null,
        featureKey: input.featureKey,
        transportKind: input.transportKind ?? "litellm",
        publishedAt: { not: null },
        providerAccount: { status: "active", deletedAt: null, healthStatus: { not: "down" } },
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });

    const hiddenLabels = await this.hiddenLabelKeys(input.tenantId);

    return bindings
      .map(mapModelBinding)
      .filter((binding) => !input.labelKey || binding.labelKeys.includes(input.labelKey))
      .filter((binding) => !binding.labelKeys.some((key) => hiddenLabels.has(key)));
  }

  // 缺省 tenantId 返回空集合 → resolve 行为同旧（不按站过滤）。
  private async hiddenLabelKeys(tenantId: string | undefined): Promise<Set<string>> {
    if (tenantId === undefined) {
      return new Set();
    }
    const policies = await this.prisma.tenantModelPolicy.findMany({
      where: { tenantId, status: "hidden", deletedAt: null },
    });
    return new Set(policies.map((policy) => policy.labelKey));
  }

  async listProviderAccounts(options?: ListOptions): Promise<ProviderAccount[]> {
    const accounts = await this.prisma.providerAccount.findMany({
      where: visibleRows(options),
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      take: 100,
    });

    return accounts.map(mapProviderAccount);
  }

  async listAllModelBindings(options?: ListOptions): Promise<ModelBinding[]> {
    const bindings = await this.prisma.modelBinding.findMany({
      where: visibleRows(options),
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return bindings.map(mapModelBinding);
  }

  async listModelLabels(): Promise<ModelLabel[]> {
    const labels = await this.prisma.modelLabel.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return labels.map(mapModelLabel);
  }

  async ensureModelLabel(input: EnsureModelLabelInput): Promise<ModelLabel> {
    // key 唯一 → 幂等 upsert；description/tier/defaultBindingId 显式可空（传 null 即清除）。
    const label = await this.prisma.modelLabel.upsert({
      where: { key: input.key },
      create: {
        key: input.key,
        displayName: input.displayName,
        description: input.description ?? null,
        featureKey: input.featureKey,
        tier: input.tier ?? null,
        defaultBindingId: input.defaultBindingId ?? null,
        status: input.status ?? "active",
      },
      update: {
        displayName: input.displayName,
        description: input.description ?? null,
        featureKey: input.featureKey,
        tier: input.tier ?? null,
        defaultBindingId: input.defaultBindingId ?? null,
        ...defined("status", input.status),
        ...restoreData(),
      },
    });
    return mapModelLabel(label);
  }

  async setProviderAccountStatus(
    id: string,
    status: ProviderAccountStatus,
  ): Promise<ProviderAccount | null> {
    const account = await this.prisma.providerAccount.findUnique({ where: { id } });
    if (account === null) {
      return null;
    }

    const updated = await this.prisma.providerAccount.update({
      where: { id },
      data: { status },
    });

    return mapProviderAccount(updated);
  }

  async setModelBindingStatus(
    id: string,
    status: ModelBindingStatus,
  ): Promise<ModelBinding | null> {
    const binding = await this.prisma.modelBinding.findUnique({ where: { id } });
    if (binding === null) {
      return null;
    }

    const updated = await this.prisma.modelBinding.update({
      where: { id },
      data: { status },
    });

    return mapModelBinding(updated);
  }

  async deleteProviderAccount(input: DeleteInput): Promise<ProviderAccount> {
    const existing = await this.prisma.providerAccount.findUnique({ where: { id: input.id } });
    if (existing === null) {
      throw lifecycleError("model.provider_account.not_found", `provider account not found: ${input.id}`, 404);
    }
    if (existing.deletedAt) {
      return mapProviderAccount(existing);
    }

    const deleted = await this.prisma.providerAccount.update({
      where: { id: input.id },
      data: deletionData(input),
    });

    return mapProviderAccount(deleted);
  }

  async restoreProviderAccount(input: RestoreInput): Promise<ProviderAccount> {
    const existing = await this.prisma.providerAccount.findUnique({ where: { id: input.id } });
    if (existing === null) {
      throw lifecycleError("model.provider_account.not_found", `provider account not found: ${input.id}`, 404);
    }
    if (!existing.deletedAt) {
      return mapProviderAccount(existing);
    }

    const restored = await this.prisma.providerAccount.update({
      where: { id: input.id },
      data: restoreData(),
    });

    return mapProviderAccount(restored);
  }

  async deleteModelBinding(input: DeleteInput): Promise<ModelBinding> {
    const existing = await this.prisma.modelBinding.findUnique({ where: { id: input.id } });
    if (existing === null) {
      throw lifecycleError("model.binding.not_found", `model binding not found: ${input.id}`, 404);
    }
    if (existing.deletedAt) {
      return mapModelBinding(existing);
    }

    const deleted = await this.prisma.modelBinding.update({
      where: { id: input.id },
      data: deletionData(input),
    });

    return mapModelBinding(deleted);
  }

  async restoreModelBinding(input: RestoreInput): Promise<ModelBinding> {
    const existing = await this.prisma.modelBinding.findUnique({ where: { id: input.id } });
    if (existing === null) {
      throw lifecycleError("model.binding.not_found", `model binding not found: ${input.id}`, 404);
    }
    if (!existing.deletedAt) {
      return mapModelBinding(existing);
    }

    const restored = await this.prisma.modelBinding.update({
      where: { id: input.id },
      data: restoreData(),
    });

    return mapModelBinding(restored);
  }

  async upsertTenantModelPolicy(input: UpsertTenantModelPolicyInput): Promise<TenantModelPolicy> {
    const policy = await this.prisma.tenantModelPolicy.upsert({
      where: {
        uq_policy_tenant_label: { tenantId: input.tenantId, labelKey: input.labelKey },
      },
      create: { tenantId: input.tenantId, labelKey: input.labelKey, status: input.status },
      update: { status: input.status },
    });

    return mapTenantModelPolicy(policy);
  }

  async listTenantModelPolicies(tenantId: string | undefined): Promise<TenantModelPolicy[]> {
    const policies = await this.prisma.tenantModelPolicy.findMany({
      where: tenantId === undefined ? { deletedAt: null } : { tenantId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return policies.map(mapTenantModelPolicy);
  }
}

function mapTenantModelPolicy(policy: {
  id: string;
  tenantId: string;
  labelKey: string;
  status: "visible" | "hidden";
  deletedAt: Date | null;
  deletedBy: string | null;
  deleteReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}): TenantModelPolicy {
  return {
    id: policy.id,
    tenantId: policy.tenantId,
    labelKey: policy.labelKey,
    status: policy.status,
    deletedAt: policy.deletedAt,
    deletedBy: policy.deletedBy,
    deleteReason: policy.deleteReason,
    createdAt: policy.createdAt,
    updatedAt: policy.updatedAt,
  };
}

function defined<Key extends string, Value>(
  key: Key,
  value: Value | undefined,
): Partial<Record<Key, Value>> {
  if (value === undefined) {
    return {};
  }
  const out: Partial<Record<Key, Value>> = {};
  out[key] = value;
  return out;
}

function visibleRows(options: ListOptions | undefined): { deletedAt: null } | Record<string, never> {
  return options?.includeDeleted === true ? {} : { deletedAt: null };
}

function deletionData(input: DeleteInput): {
  deletedAt: Date;
  deletedBy: string;
  deleteReason: string | null;
} {
  return {
    deletedAt: new Date(),
    deletedBy: input.deletedBy,
    deleteReason: input.reason ?? null,
  };
}

function restoreData(): {
  deletedAt: null;
  deletedBy: null;
  deleteReason: null;
} {
  return {
    deletedAt: null,
    deletedBy: null,
    deleteReason: null,
  };
}

function lifecycleError(
  code: ConstructorParameters<typeof ModelLifecycleError>[0],
  message: string,
  statusCode: number,
): ModelLifecycleError {
  return new ModelLifecycleError(code, message, statusCode);
}

function mapProviderAccount(account: {
  id: string;
  provider: string;
  key: string;
  label: string;
  secretRef: string | null;
  status: "active" | "disabled";
  priority: number;
  transportKind: "litellm" | "direct" | "internal" | "local";
  healthStatus: "unknown" | "healthy" | "degraded" | "down";
  deletedAt: Date | null;
  deletedBy: string | null;
  deleteReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ProviderAccount {
  return {
    id: account.id,
    provider: account.provider,
    key: account.key,
    label: account.label,
    secretRef: account.secretRef ?? "",
    status: account.status,
    priority: account.priority,
    transportKind: mapTransport(account.transportKind),
    healthStatus: account.healthStatus,
    deletedAt: account.deletedAt,
    deletedBy: account.deletedBy,
    deleteReason: account.deleteReason,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function mapModelLabel(label: {
  id: string;
  key: string;
  displayName: string;
  description: string | null;
  featureKey: string;
  tier: string | null;
  defaultBindingId: string | null;
  status: "active" | "disabled";
  deletedAt: Date | null;
  deletedBy: string | null;
  deleteReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ModelLabel {
  return {
    id: label.id,
    key: label.key,
    displayName: label.displayName,
    description: label.description,
    featureKey: label.featureKey,
    tier: label.tier,
    defaultBindingId: label.defaultBindingId,
    status: label.status,
    deletedAt: label.deletedAt,
    deletedBy: label.deletedBy,
    deleteReason: label.deleteReason,
    createdAt: label.createdAt,
    updatedAt: label.updatedAt,
  };
}

function mapModelBinding(binding: {
  id: string;
  providerAccountId: string;
  provider: string;
  modelName: string;
  displayName: string;
  featureKey: string;
  labelKeys: Prisma.JsonValue;
  inputModalities: Prisma.JsonValue;
  outputModalities: Prisma.JsonValue;
  transportKind: "litellm" | "direct" | "internal" | "local";
  gatewayModelName: string | null;
  contextWindow: number | null;
  priority: number;
  status: "active" | "disabled";
  deletedAt: Date | null;
  deletedBy: string | null;
  deleteReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ModelBinding {
  return {
    id: binding.id,
    providerAccountId: binding.providerAccountId,
    provider: binding.provider,
    modelName: binding.modelName,
    displayName: binding.displayName,
    featureKey: binding.featureKey,
    labelKeys: stringArray(binding.labelKeys),
    inputModalities: stringArray(binding.inputModalities),
    outputModalities: stringArray(binding.outputModalities),
    transportKind: mapTransport(binding.transportKind),
    gatewayModelName: binding.gatewayModelName,
    contextWindow: binding.contextWindow,
    priority: binding.priority,
    status: binding.status,
    deletedAt: binding.deletedAt,
    deletedBy: binding.deletedBy,
    deleteReason: binding.deleteReason,
    createdAt: binding.createdAt,
    updatedAt: binding.updatedAt,
  };
}

function stringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function mapTransport(value: "litellm" | "direct" | "internal" | "local"): "litellm" | "direct" | "internal" {
  return value === "local" ? "internal" : value;
}
