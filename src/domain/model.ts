import type { DeletionAudit } from "./model-lifecycle.js";

export type ModelTransportKind = "litellm" | "direct" | "internal";
export type ProviderAccountStatus = "active" | "disabled";
export type ProviderHealthStatus = "unknown" | "healthy" | "degraded" | "down";
export type ModelBindingStatus = "active" | "disabled";
export type ModelLabelStatus = "active" | "disabled";
export type TenantModelPolicyStatus = "visible" | "hidden";
export type ModelAvailability = "draft" | "available" | "provider_unavailable" | "disabled" | "retired";

export interface ProviderAccount extends DeletionAudit {
  id: string;
  provider: string;
  key: string;
  label: string;
  secretRef: string;
  status: ProviderAccountStatus;
  priority: number;
  transportKind: ModelTransportKind;
  healthStatus: ProviderHealthStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModelBinding extends DeletionAudit {
  id: string;
  providerAccountId: string;
  provider: string;
  modelName: string;
  displayName: string;
  featureKey: string;
  labelKeys: string[];
  inputModalities: string[];
  outputModalities: string[];
  transportKind: ModelTransportKind;
  gatewayModelName: string | null;
  contextWindow: number | null;
  priority: number;
  status: ModelBindingStatus;
  createdAt: Date;
  updatedAt: Date;
  // Optional on hand-built test doubles; persisted revisions always expose these fields.
  revision?: number;
  publishedAt?: Date | null;
  retiredAt?: Date | null;
  availability?: ModelAvailability;
}

export interface ModelLabel extends DeletionAudit {
  id: string;
  key: string;
  displayName: string;
  description: string | null;
  featureKey: string;
  tier: string | null;
  defaultBindingId: string | null;
  status: ModelLabelStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantModelPolicy extends DeletionAudit {
  id: string;
  tenantId: string;
  labelKey: string;
  status: TenantModelPolicyStatus;
  modelRevisionId?: string | null;
  priority?: number;
  generation?: string;
  createdAt: Date;
  updatedAt: Date;
}
