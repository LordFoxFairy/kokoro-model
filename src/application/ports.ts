import type { ModelBinding, ModelLabel, ProviderAccount, TenantModelPolicy } from "../domain/models.js";
import type { ModelBindingStatus, ProviderAccountStatus, ProviderHealthStatus } from "../domain/enums.js";
import type { DeleteInput, EnsureModelBindingInput, EnsureModelLabelInput, EnsureProviderAccountInput, ListModelBindingsFilter, ListOptions, ResolveModelInput, RestoreInput, UpsertTenantModelPolicyInput } from "./dto.js";

export interface ModelRepository {
  ensureProviderAccount(input: EnsureProviderAccountInput): Promise<ProviderAccount>;
  ensureModelBinding(input: EnsureModelBindingInput): Promise<ModelBinding>;
  listModelBindings(filter: ListModelBindingsFilter): Promise<ModelBinding[]>;
  resolveModelBindings(input: ResolveModelInput): Promise<ModelBinding[]>;
  listProviderAccounts(options?: ListOptions): Promise<ProviderAccount[]>;
  listAllModelBindings(options?: ListOptions): Promise<ModelBinding[]>;
  listModelLabels(): Promise<ModelLabel[]>;
  ensureModelLabel(input: EnsureModelLabelInput): Promise<ModelLabel>;
  setProviderAccountStatus(id: string, status: ProviderAccountStatus): Promise<ProviderAccount | null>;
  setProviderHealthStatus(id: string, status: ProviderHealthStatus): Promise<ProviderAccount | null>;
  setModelBindingStatus(id: string, status: ModelBindingStatus): Promise<ModelBinding | null>;
  deleteProviderAccount(input: DeleteInput): Promise<ProviderAccount>;
  restoreProviderAccount(input: RestoreInput): Promise<ProviderAccount>;
  deleteModelBinding(input: DeleteInput): Promise<ModelBinding>;
  restoreModelBinding(input: RestoreInput): Promise<ModelBinding>;
  upsertTenantModelPolicy(input: UpsertTenantModelPolicyInput): Promise<TenantModelPolicy>;
  listTenantModelPolicies(tenantId?: string | undefined): Promise<TenantModelPolicy[]>;
}
