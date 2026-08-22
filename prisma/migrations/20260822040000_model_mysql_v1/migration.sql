-- CreateTable
CREATE TABLE `model_provider` (
    `provider_id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `provider_key` VARCHAR(191) NOT NULL,
    `display_name` VARCHAR(191) NOT NULL,
    `secret_handle_ref` VARCHAR(191) NOT NULL,
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    `priority` INTEGER NOT NULL DEFAULT 100,
    `transport_kind` ENUM('litellm', 'direct', 'internal') NOT NULL,
    `health_status` ENUM('unknown', 'healthy', 'degraded', 'down') NOT NULL DEFAULT 'unknown',
    `metadata` JSON NULL,
    `deleted_at` DATETIME(3) NULL,
    `deleted_by` VARCHAR(191) NULL,
    `delete_reason` VARCHAR(191) NULL,
    `generation` BIGINT NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `model_provider_status_deleted_at_priority_idx`(`status`, `deleted_at`, `priority`),
    UNIQUE INDEX `model_provider_provider_provider_key_key`(`provider`, `provider_key`),
    PRIMARY KEY (`provider_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `model_definition` (
    `model_id` VARCHAR(191) NOT NULL,
    `model_key` VARCHAR(191) NOT NULL,
    `display_name` VARCHAR(191) NOT NULL,
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    `generation` BIGINT NOT NULL DEFAULT 1,
    `deleted_at` DATETIME(3) NULL,
    `deleted_by` VARCHAR(191) NULL,
    `delete_reason` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `model_definition_status_deleted_at_idx`(`status`, `deleted_at`),
    PRIMARY KEY (`model_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `model_revision` (
    `model_revision_id` VARCHAR(191) NOT NULL,
    `model_id` VARCHAR(191) NULL,
    `revision` INTEGER NOT NULL DEFAULT 1,
    `provider_id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `provider_model_name` VARCHAR(191) NOT NULL,
    `revision_display_name` VARCHAR(191) NOT NULL,
    `feature_key` VARCHAR(191) NOT NULL,
    `label_keys` JSON NOT NULL,
    `input_modalities` JSON NOT NULL,
    `output_modalities` JSON NOT NULL,
    `transport` ENUM('litellm', 'direct', 'internal') NOT NULL,
    `gateway_model_name` VARCHAR(191) NULL,
    `context_window` INTEGER NULL,
    `priority` INTEGER NOT NULL DEFAULT 100,
    `revision_status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    `published_at` DATETIME(3) NULL,
    `retired_at` DATETIME(3) NULL,
    `metadata` JSON NULL,
    `deleted_at` DATETIME(3) NULL,
    `deleted_by` VARCHAR(191) NULL,
    `delete_reason` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `model_revision_feature_key_revision_status_deleted_at_priori_idx`(`feature_key`, `revision_status`, `deleted_at`, `priority`),
    INDEX `model_revision_provider_provider_model_name_idx`(`provider`, `provider_model_name`),
    UNIQUE INDEX `model_revision_provider_id_provider_model_name_transport_key`(`provider_id`, `provider_model_name`, `transport`),
    PRIMARY KEY (`model_revision_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `model_label` (
    `label_id` VARCHAR(191) NOT NULL,
    `label_key` VARCHAR(191) NOT NULL,
    `display_name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `feature_key` VARCHAR(191) NOT NULL,
    `tier` VARCHAR(191) NULL,
    `default_revision_id` VARCHAR(191) NULL,
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    `deleted_at` DATETIME(3) NULL,
    `deleted_by` VARCHAR(191) NULL,
    `delete_reason` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `model_label_feature_key_status_deleted_at_idx`(`feature_key`, `status`, `deleted_at`),
    UNIQUE INDEX `model_label_label_key_key`(`label_key`),
    PRIMARY KEY (`label_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `model_routing_policy` (
    `routing_policy_id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `label_key` VARCHAR(191) NOT NULL,
    `model_revision_id` VARCHAR(191) NULL,
    `priority` INTEGER NOT NULL DEFAULT 100,
    `generation` BIGINT NOT NULL DEFAULT 1,
    `status` ENUM('visible', 'hidden') NOT NULL DEFAULT 'visible',
    `deleted_at` DATETIME(3) NULL,
    `deleted_by` VARCHAR(191) NULL,
    `delete_reason` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `model_routing_policy_tenant_id_label_key_status_deleted_at_pri_idx`(`tenant_id`, `label_key`, `status`, `deleted_at`, `priority`),
    UNIQUE INDEX `model_routing_policy_tenant_id_label_key_key`(`tenant_id`, `label_key`),
    PRIMARY KEY (`routing_policy_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `model_provider_health_state` (
    `provider_id` VARCHAR(191) NOT NULL,
    `status` ENUM('unknown', 'healthy', 'degraded', 'down') NOT NULL DEFAULT 'unknown',
    `generation` BIGINT NOT NULL DEFAULT 1,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`provider_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `model_revision` ADD CONSTRAINT `model_revision_model_id_fkey` FOREIGN KEY (`model_id`) REFERENCES `model_definition`(`model_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `model_revision` ADD CONSTRAINT `model_revision_provider_id_fkey` FOREIGN KEY (`provider_id`) REFERENCES `model_provider`(`provider_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `model_provider_health_state` ADD CONSTRAINT `model_provider_health_state_provider_id_fkey` FOREIGN KEY (`provider_id`) REFERENCES `model_provider`(`provider_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

