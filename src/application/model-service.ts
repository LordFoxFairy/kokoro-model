import type {
  EnsureModelBindingInput,
  EnsureModelLabelInput,
  EnsureProviderAccountInput,
  ListModelBindingsFilter,
  ModelRepository,
  ResolveModelInput,
  UpsertTenantModelPolicyInput,
} from "../domain/repository.js";
import type { DeleteInput, RestoreInput } from "../domain/model-lifecycle.js";
import type { ModelBinding, ModelLabel } from "../domain/model.js";
import { pageWindow, type PageInput, type PageResult } from "./pagination.js";

export type PublicModelAvailability = "available" | "provider_unavailable" | "unconfigured";

export interface PublicModelCatalogItem {
  readonly key: string;
  readonly displayName: string;
  readonly description: string | null;
  readonly featureKey: string;
  readonly tier: string | null;
  readonly availability: PublicModelAvailability;
  readonly capabilities: {
    readonly inputModalities: string[];
    readonly outputModalities: string[];
    readonly contextWindow: number | null;
  };
}

export class ModelService {
  constructor(private readonly repository: ModelRepository) {}

  async ensureProviderAccount(input: EnsureProviderAccountInput) {
    return this.repository.ensureProviderAccount(input);
  }

  async ensureModelBinding(input: EnsureModelBindingInput) {
    return this.repository.ensureModelBinding(input);
  }

  async listModelBindings(filter: ListModelBindingsFilter) {
    return this.repository.listModelBindings(filter);
  }

  async listModelBindingsPage(filter: ListModelBindingsFilter, page: PageInput): Promise<PageResult<ModelBinding>> {
    return pageWindow(
      `model-bindings:${filter.featureKey ?? "*"}:${filter.labelKey ?? "*"}`,
      await this.listModelBindings(filter),
      page,
    );
  }

  async listModelLabels() {
    return this.repository.listModelLabels();
  }

  // 运行时目录（runtime 消费）：只出 active，可按 featureKey 过滤。目录空/过滤后空都合法（消费侧回落）。
  async listActiveModelLabels(featureKey?: string | undefined) {
    const labels = await this.repository.listModelLabels();
    return labels.filter(
      (label) => label.status === "active" && (featureKey === undefined || label.featureKey === featureKey),
    );
  }

  async listActiveModelLabelsPage(
    page: PageInput,
    featureKey?: string | undefined,
  ): Promise<PageResult<ModelLabel>> {
    return pageWindow(
      `model-labels:${featureKey ?? "*"}`,
      await this.listActiveModelLabels(featureKey),
      page,
    );
  }

  async ensureModelLabel(input: EnsureModelLabelInput) {
    return this.repository.ensureModelLabel(input);
  }

  async resolveModelBindings(input: ResolveModelInput) {
    return this.repository.resolveModelBindings(input);
  }

  async setProviderHealthStatus(id: string, status: Parameters<ModelRepository["setProviderHealthStatus"]>[1]) {
    return this.repository.setProviderHealthStatus(id, status);
  }

  async listProviderAccounts(options?: Parameters<ModelRepository["listProviderAccounts"]>[0]) {
    return this.repository.listProviderAccounts(options);
  }

  async listAllModelBindings(options?: Parameters<ModelRepository["listAllModelBindings"]>[0]) {
    return this.repository.listAllModelBindings(options);
  }

  async deleteProviderAccount(input: DeleteInput) {
    return this.repository.deleteProviderAccount(input);
  }

  async restoreProviderAccount(input: RestoreInput) {
    return this.repository.restoreProviderAccount(input);
  }

  async deleteModelBinding(input: DeleteInput) {
    return this.repository.deleteModelBinding(input);
  }

  async restoreModelBinding(input: RestoreInput) {
    return this.repository.restoreModelBinding(input);
  }

  async upsertTenantModelPolicy(input: UpsertTenantModelPolicyInput) {
    return this.repository.upsertTenantModelPolicy(input);
  }

  async listTenantModelPolicies(tenantId?: string | undefined) {
    return this.repository.listTenantModelPolicies(tenantId);
  }

  async listTenantModelPoliciesPage(tenantId: string | undefined, page: PageInput) {
    return pageWindow(
      `tenant-model-policies:${tenantId ?? "*"}`,
      await this.listTenantModelPolicies(tenantId),
      page,
    );
  }

  async listPublicModelCatalog(
    tenantId: string,
    featureKey: string | undefined,
    page: PageInput,
  ): Promise<PageResult<PublicModelCatalogItem>> {
    const labels = await this.listActiveModelLabels(featureKey);
    const policies = await this.listTenantModelPolicies(tenantId);
    const hidden = new Set(
      policies.filter((policy) => policy.status === "hidden").map((policy) => policy.labelKey),
    );
    const visible = labels.filter((label) => !hidden.has(label.key));
    const items = await Promise.all(visible.map(async (label) => this.toPublicCatalogItem(label, tenantId)));
    return pageWindow(`public-model-catalog:${tenantId}:${featureKey ?? "*"}`, items, page);
  }

  private async toPublicCatalogItem(label: ModelLabel, tenantId: string): Promise<PublicModelCatalogItem> {
    const filter = { featureKey: label.featureKey, labelKey: label.key };
    const available = await this.resolveModelBindings({ ...filter, tenantId });
    const configured = await this.listModelBindings(filter);
    const first = available[0] ?? configured[0];
    return {
      key: label.key,
      displayName: label.displayName,
      description: label.description,
      featureKey: label.featureKey,
      tier: label.tier,
      availability: available.length > 0 ? "available" : configured.length > 0 ? "provider_unavailable" : "unconfigured",
      capabilities: {
        inputModalities: first?.inputModalities ?? [],
        outputModalities: first?.outputModalities ?? [],
        contextWindow: first?.contextWindow ?? null,
      },
    };
  }
}
