-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ModelDefinitionStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "TenantModelPolicyStatus" AS ENUM ('visible', 'hidden');

-- CreateEnum
CREATE TYPE "ProviderAccountStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "ProviderHealthStatus" AS ENUM ('unknown', 'healthy', 'degraded', 'down');

-- CreateEnum
CREATE TYPE "ModelBindingStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "ModelLabelStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "ModelTransportKind" AS ENUM ('litellm', 'direct', 'internal');

-- CreateTable
CREATE TABLE "model_provider" (
    "provider_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_key" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "secret_handle_ref" TEXT NOT NULL,
    "status" "ProviderAccountStatus" NOT NULL DEFAULT 'active',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "transport_kind" "ModelTransportKind" NOT NULL,
    "health_status" "ProviderHealthStatus" NOT NULL DEFAULT 'unknown',
    "metadata" JSONB,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "delete_reason" TEXT,
    "generation" BIGINT NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_provider_pkey" PRIMARY KEY ("provider_id")
);

-- CreateTable
CREATE TABLE "model_definition" (
    "model_id" TEXT NOT NULL,
    "model_key" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" "ModelDefinitionStatus" NOT NULL DEFAULT 'active',
    "generation" BIGINT NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "delete_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_definition_pkey" PRIMARY KEY ("model_id")
);

-- CreateTable
CREATE TABLE "model_revision" (
    "model_revision_id" TEXT NOT NULL,
    "model_id" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "provider_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_model_name" TEXT NOT NULL,
    "revision_display_name" TEXT NOT NULL,
    "feature_key" TEXT NOT NULL,
    "label_keys" JSONB NOT NULL,
    "input_modalities" JSONB NOT NULL,
    "output_modalities" JSONB NOT NULL,
    "transport" "ModelTransportKind" NOT NULL,
    "gateway_model_name" TEXT,
    "context_window" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "revision_status" "ModelBindingStatus" NOT NULL DEFAULT 'active',
    "published_at" TIMESTAMP(3),
    "retired_at" TIMESTAMP(3),
    "metadata" JSONB,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "delete_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_revision_pkey" PRIMARY KEY ("model_revision_id")
);

-- CreateTable
CREATE TABLE "model_label" (
    "label_id" TEXT NOT NULL,
    "label_key" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "feature_key" TEXT NOT NULL,
    "tier" TEXT,
    "default_revision_id" TEXT,
    "status" "ModelLabelStatus" NOT NULL DEFAULT 'active',
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "delete_reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_label_pkey" PRIMARY KEY ("label_id")
);

-- CreateTable
CREATE TABLE "model_routing_policy" (
    "routing_policy_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "label_key" TEXT NOT NULL,
    "model_revision_id" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "generation" BIGINT NOT NULL DEFAULT 1,
    "status" "TenantModelPolicyStatus" NOT NULL DEFAULT 'visible',
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "delete_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_routing_policy_pkey" PRIMARY KEY ("routing_policy_id")
);

-- CreateTable
CREATE TABLE "model_provider_health_state" (
    "provider_id" TEXT NOT NULL,
    "status" "ProviderHealthStatus" NOT NULL DEFAULT 'unknown',
    "generation" BIGINT NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_provider_health_state_pkey" PRIMARY KEY ("provider_id")
);

-- CreateIndex
CREATE INDEX "model_provider_status_deleted_at_priority_idx" ON "model_provider"("status", "deleted_at", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "model_provider_provider_provider_key_key" ON "model_provider"("provider", "provider_key");

-- CreateIndex
CREATE INDEX "model_definition_status_deleted_at_idx" ON "model_definition"("status", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "model_definition_model_key_key" ON "model_definition"("model_key");

-- CreateIndex
CREATE INDEX "model_revision_model_id_idx" ON "model_revision"("model_id");

-- CreateIndex
CREATE INDEX "model_revision_feature_key_revision_status_deleted_at_prior_idx" ON "model_revision"("feature_key", "revision_status", "deleted_at", "priority");

-- CreateIndex
CREATE INDEX "model_revision_provider_provider_model_name_idx" ON "model_revision"("provider", "provider_model_name");

-- CreateIndex
CREATE UNIQUE INDEX "model_revision_provider_id_provider_model_name_transport_key" ON "model_revision"("provider_id", "provider_model_name", "transport");

-- CreateIndex
CREATE INDEX "model_label_feature_key_status_deleted_at_idx" ON "model_label"("feature_key", "status", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "model_label_label_key_key" ON "model_label"("label_key");

-- CreateIndex
CREATE INDEX "idx_policy_lookup" ON "model_routing_policy"("tenant_id", "label_key", "status", "deleted_at", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "model_routing_policy_tenant_id_label_key_key" ON "model_routing_policy"("tenant_id", "label_key");

-- AddForeignKey
ALTER TABLE "model_revision" ADD CONSTRAINT "model_revision_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "model_definition"("model_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_revision" ADD CONSTRAINT "model_revision_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "model_provider"("provider_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_provider_health_state" ADD CONSTRAINT "model_provider_health_state_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "model_provider"("provider_id") ON DELETE RESTRICT ON UPDATE CASCADE;
