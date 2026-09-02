import type { ModelLabelStatus, ModelTransportKind, ProviderAccountStatus, ProviderHealthStatus, ModelBindingStatus, TenantModelPolicyStatus } from "../domain/enums.js";

export interface EnsureProviderAccountInput { provider: string; key: string; label: string; secretRef: string; priority?: number | undefined; transportKind: ModelTransportKind; }
export interface EnsureModelBindingInput { providerAccountId: string; modelName: string; displayName: string; featureKey: string; labelKeys: string[]; inputModalities: string[]; outputModalities: string[]; transportKind: ModelTransportKind; gatewayModelName?: string | undefined; contextWindow?: number | undefined; priority?: number | undefined; }
export interface ListModelBindingsFilter { featureKey?: string | undefined; labelKey?: string | undefined; }
export interface ResolveModelInput { featureKey?: string | undefined; labelKey?: string | undefined; transportKind?: ModelTransportKind | undefined; tenantId?: string | undefined; }
export interface EnsureModelLabelInput { key: string; displayName: string; description?: string | null | undefined; featureKey: string; tier?: string | null | undefined; defaultBindingId?: string | null | undefined; status?: ModelLabelStatus | undefined; }
export interface UpsertTenantModelPolicyInput { tenantId: string; labelKey: string; modelRevisionId?: string | null | undefined; priority?: number | undefined; status: TenantModelPolicyStatus; }
export interface DeleteInput { id: string; deletedBy: string; reason?: string | undefined; }
export interface RestoreInput { id: string; }
export interface ListOptions { includeDeleted?: boolean | undefined; }
export type PublicModelAvailability = "available" | "provider_unavailable" | "unconfigured";
export interface PublicModelCatalogItem { readonly key: string; readonly displayName: string; readonly description: string | null; readonly featureKey: string; readonly tier: string | null; readonly availability: PublicModelAvailability; readonly capabilities: { readonly inputModalities: string[]; readonly outputModalities: string[]; readonly contextWindow: number | null; }; }
export type ModelStatusUpdate = { id: string; status: ProviderAccountStatus | ProviderHealthStatus | ModelBindingStatus };
