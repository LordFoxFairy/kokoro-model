-- Kokoro Model V1 canonical MySQL schema.
-- MySQL 8.0.16+, InnoDB, utf8mb4. Cross-row publication invariants are enforced
-- by the Model application transaction; MySQL has no DEFERRABLE constraints.

CREATE TABLE model_provider (
  provider_id CHAR(36) NOT NULL,
  provider_key VARCHAR(191) NOT NULL,
  display_name VARCHAR(191) NOT NULL,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  secret_handle_ref VARCHAR(191) NULL,
  generation BIGINT UNSIGNED NOT NULL DEFAULT 1,
  deleted_at DATETIME(6) NULL,
  deleted_by VARCHAR(191) NULL,
  delete_reason VARCHAR(500) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  active_identity VARCHAR(191) GENERATED ALWAYS AS (
    IF(deleted_at IS NULL, provider_key, NULL)
  ) STORED,
  PRIMARY KEY (provider_id),
  UNIQUE KEY model_provider_active_key (active_identity),
  KEY model_provider_status_idx (status, deleted_at),
  CONSTRAINT model_provider_generation_ck CHECK (generation > 0),
  CONSTRAINT model_provider_secret_ref_ck CHECK (secret_handle_ref IS NULL OR CHAR_LENGTH(secret_handle_ref) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE model_definition (
  model_id CHAR(36) NOT NULL,
  model_key VARCHAR(191) NOT NULL,
  display_name VARCHAR(191) NOT NULL,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  generation BIGINT UNSIGNED NOT NULL DEFAULT 1,
  deleted_at DATETIME(6) NULL,
  deleted_by VARCHAR(191) NULL,
  delete_reason VARCHAR(500) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  active_identity VARCHAR(191) GENERATED ALWAYS AS (
    IF(deleted_at IS NULL, model_key, NULL)
  ) STORED,
  PRIMARY KEY (model_id),
  UNIQUE KEY model_definition_active_key (active_identity),
  KEY model_definition_status_idx (status, deleted_at),
  CONSTRAINT model_definition_generation_ck CHECK (generation > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE model_revision (
  model_revision_id CHAR(36) NOT NULL,
  model_id CHAR(36) NOT NULL,
  revision INT UNSIGNED NOT NULL,
  provider_id CHAR(36) NOT NULL,
  provider_model_name VARCHAR(191) NOT NULL,
  transport ENUM('litellm', 'direct', 'local') NOT NULL,
  modalities JSON NOT NULL,
  context_window INT UNSIGNED NOT NULL,
  published_at DATETIME(6) NULL,
  retired_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (model_revision_id),
  UNIQUE KEY model_revision_model_revision_key (model_id, revision),
  KEY model_revision_provider_idx (provider_id),
  CONSTRAINT model_revision_model_fk FOREIGN KEY (model_id) REFERENCES model_definition(model_id),
  CONSTRAINT model_revision_provider_fk FOREIGN KEY (provider_id) REFERENCES model_provider(provider_id),
  CONSTRAINT model_revision_revision_ck CHECK (revision > 0),
  CONSTRAINT model_revision_context_window_ck CHECK (context_window > 0),
  CONSTRAINT model_revision_modalities_ck CHECK (JSON_TYPE(modalities) = 'ARRAY' AND JSON_LENGTH(modalities) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE model_label (
  label_id CHAR(36) NOT NULL,
  label_key VARCHAR(191) NOT NULL,
  display_name VARCHAR(191) NOT NULL,
  description VARCHAR(500) NULL,
  feature_key VARCHAR(191) NOT NULL,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  deleted_at DATETIME(6) NULL,
  deleted_by VARCHAR(191) NULL,
  delete_reason VARCHAR(500) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  active_identity VARCHAR(191) GENERATED ALWAYS AS (
    IF(deleted_at IS NULL, label_key, NULL)
  ) STORED,
  PRIMARY KEY (label_id),
  UNIQUE KEY model_label_active_key (active_identity),
  KEY model_label_feature_idx (feature_key, status, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE model_routing_policy (
  routing_policy_id CHAR(36) NOT NULL,
  site_id CHAR(36) NOT NULL,
  label_key VARCHAR(191) NOT NULL,
  model_revision_id CHAR(36) NOT NULL,
  priority INT UNSIGNED NOT NULL,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  generation BIGINT UNSIGNED NOT NULL DEFAULT 1,
  deleted_at DATETIME(6) NULL,
  deleted_by VARCHAR(191) NULL,
  delete_reason VARCHAR(500) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  active_identity VARCHAR(600) GENERATED ALWAYS AS (
    IF(deleted_at IS NULL AND status = 'active', CONCAT(site_id, '#', label_key, '#', priority), NULL)
  ) STORED,
  PRIMARY KEY (routing_policy_id),
  UNIQUE KEY model_routing_policy_active_key (active_identity),
  KEY model_routing_policy_lookup_idx (site_id, label_key, status, deleted_at, priority),
  CONSTRAINT model_routing_policy_site_fk FOREIGN KEY (site_id) REFERENCES site_site(site_id),
  CONSTRAINT model_routing_policy_revision_fk FOREIGN KEY (model_revision_id) REFERENCES model_revision(model_revision_id),
  CONSTRAINT model_routing_policy_generation_ck CHECK (generation > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE model_provider_health_state (
  provider_id CHAR(36) NOT NULL,
  status ENUM('unknown', 'healthy', 'degraded', 'down') NOT NULL DEFAULT 'unknown',
  generation BIGINT UNSIGNED NOT NULL DEFAULT 1,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (provider_id),
  CONSTRAINT model_provider_health_provider_fk FOREIGN KEY (provider_id) REFERENCES model_provider(provider_id),
  CONSTRAINT model_provider_health_generation_ck CHECK (generation > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
