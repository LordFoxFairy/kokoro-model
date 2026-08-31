-- Kokoro Model V1 initial catalog data.
-- Purpose: materialize the model configurations already declared by the LiteLLM
-- deployment files and kokoro-model builtin catalog into MySQL.
--
-- This file is idempotent and contains no secrets. secret_handle_ref always points
-- to an environment/secret-manager reference. Tenant policies are intentionally not
-- seeded here because tenant_id is owned by IAM/System and must come from real tenant
-- configuration.
--
-- Run after 60-model.mysql.sql / Prisma migration:
--   mysql --protocol=tcp -h HOST -P PORT -u USER -p DATABASE < 70-model.init.mysql.sql

-- Logical model definitions: stable catalog identity and human-facing display name.
INSERT INTO `model_definition`
  (`model_id`, `model_key`, `display_name`, `status`, `generation`, `deleted_at`, `deleted_by`, `delete_reason`, `created_at`, `updated_at`)
VALUES
  ('mdl_claude_code', 'claude-code', 'Claude Code', 'active', 1, NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('mdl_kokoro_dev_mock', 'kokoro-dev-mock', 'Kokoro Dev Mock', 'active', 1, NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('mdl_openai_gpt4o_mini', 'kokoro-openai-gpt-4o-mini', 'OpenAI GPT-4o mini', 'active', 1, NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('mdl_anthropic_claude_sonnet', 'kokoro-anthropic-claude-sonnet', 'Anthropic Claude Sonnet', 'active', 1, NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('mdl_openai_compatible', 'kokoro-openai-compatible', 'OpenAI Compatible', 'active', 1, NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
AS new
ON DUPLICATE KEY UPDATE
  `display_name` = new.`display_name`,
  `status` = new.`status`,
  `deleted_at` = NULL,
  `deleted_by` = NULL,
  `delete_reason` = NULL,
  `updated_at` = CURRENT_TIMESTAMP(3);

-- Provider accounts: only references are stored; credentials remain outside MySQL.
INSERT INTO `model_provider`
  (`provider_id`, `provider`, `provider_key`, `display_name`, `secret_handle_ref`, `status`, `priority`, `transport_kind`, `health_status`, `metadata`, `deleted_at`, `deleted_by`, `delete_reason`, `generation`, `created_at`, `updated_at`)
VALUES
  ('prv_litellm_gateway', 'litellm', 'gateway', 'Kokoro LiteLLM Gateway', 'env:LITELLM_MASTER_KEY', 'active', 100, 'litellm', 'unknown', JSON_OBJECT('role', 'gateway', 'description', 'Stable Kokoro gateway facade'), NULL, NULL, NULL, 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('prv_openai_gpt4o_mini', 'openai', 'gpt-4o-mini', 'OpenAI GPT-4o mini', 'env:OPENAI_API_KEY', 'active', 100, 'litellm', 'unknown', JSON_OBJECT('gatewayConfig', 'kokoro-openai-gpt-4o-mini', 'description', 'Example LiteLLM deployment'), NULL, NULL, NULL, 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('prv_anthropic_claude_sonnet', 'anthropic', 'claude-sonnet', 'Anthropic Claude Sonnet', 'env:ANTHROPIC_API_KEY', 'active', 100, 'litellm', 'unknown', JSON_OBJECT('gatewayConfig', 'kokoro-anthropic-claude-sonnet', 'description', 'Example LiteLLM deployment'), NULL, NULL, NULL, 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('prv_openai_compatible', 'openai', 'compatible', 'OpenAI Compatible Endpoint', 'env:OPENAI_COMPAT_API_KEY', 'active', 100, 'litellm', 'unknown', JSON_OBJECT('gatewayConfig', 'kokoro-openai-compatible', 'description', 'Example configurable OpenAI-compatible endpoint'), NULL, NULL, NULL, 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
AS new
ON DUPLICATE KEY UPDATE
  `display_name` = new.`display_name`,
  `secret_handle_ref` = new.`secret_handle_ref`,
  `status` = new.`status`,
  `priority` = new.`priority`,
  `transport_kind` = new.`transport_kind`,
  `metadata` = new.`metadata`,
  `deleted_at` = NULL,
  `deleted_by` = NULL,
  `delete_reason` = NULL,
  `updated_at` = CURRENT_TIMESTAMP(3);

-- Published revisions. gateway_model_name must exactly match LiteLLM model_name.
INSERT INTO `model_revision`
  (`model_revision_id`, `model_id`, `revision`, `provider_id`, `provider`, `provider_model_name`, `revision_display_name`, `feature_key`, `label_keys`, `input_modalities`, `output_modalities`, `transport`, `gateway_model_name`, `context_window`, `priority`, `revision_status`, `published_at`, `retired_at`, `metadata`, `deleted_at`, `deleted_by`, `delete_reason`, `created_at`, `updated_at`)
VALUES
  ('rev_claude_code_v1', 'mdl_claude_code', 1, 'prv_litellm_gateway', 'litellm', 'claude-code', 'Claude Code（LiteLLM 门面）', 'chat', JSON_ARRAY('claude-code'), JSON_ARRAY('text'), JSON_ARRAY('text'), 'litellm', 'claude-code', NULL, 100, 'active', CURRENT_TIMESTAMP(3), NULL, JSON_OBJECT('description', '对外稳定别名；实际后端由 LiteLLM 环境配置决定', 'source', 'kokoro-model builtin catalog'), NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('rev_kokoro_dev_mock_v1', 'mdl_kokoro_dev_mock', 1, 'prv_litellm_gateway', 'litellm', 'kokoro-dev-mock', 'Kokoro Dev Mock（本地链路）', 'chat', JSON_ARRAY('kokoro-dev-mock'), JSON_ARRAY('text'), JSON_ARRAY('text'), 'litellm', 'kokoro-dev-mock', NULL, 900, 'active', CURRENT_TIMESTAMP(3), NULL, JSON_OBJECT('description', '仅用于本地 smoke 的固定响应模型', 'environment', 'development-only'), NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('rev_openai_gpt4o_mini_v1', 'mdl_openai_gpt4o_mini', '1', 'prv_openai_gpt4o_mini', 'openai', 'gpt-4o-mini', 'OpenAI GPT-4o mini', 'chat', JSON_ARRAY('kokoro-openai-gpt-4o-mini'), JSON_ARRAY('text'), JSON_ARRAY('text'), 'litellm', 'kokoro-openai-gpt-4o-mini', NULL, 100, 'active', CURRENT_TIMESTAMP(3), NULL, JSON_OBJECT('description', 'LiteLLM example deployment'), NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('rev_anthropic_claude_sonnet_v1', 'mdl_anthropic_claude_sonnet', 1, 'prv_anthropic_claude_sonnet', 'anthropic', 'claude-sonnet-4-20250514', 'Anthropic Claude Sonnet', 'chat', JSON_ARRAY('kokoro-anthropic-claude-sonnet'), JSON_ARRAY('text'), JSON_ARRAY('text'), 'litellm', 'kokoro-anthropic-claude-sonnet', NULL, 100, 'active', CURRENT_TIMESTAMP(3), NULL, JSON_OBJECT('description', 'LiteLLM example deployment'), NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('rev_openai_compatible_v1', 'mdl_openai_compatible', 1, 'prv_openai_compatible', 'openai', 'gpt-4o-mini', 'OpenAI Compatible Endpoint', 'chat', JSON_ARRAY('kokoro-openai-compatible'), JSON_ARRAY('text'), JSON_ARRAY('text'), 'litellm', 'kokoro-openai-compatible', NULL, 100, 'active', CURRENT_TIMESTAMP(3), NULL, JSON_OBJECT('description', '可配置 OpenAI-compatible endpoint；base URL 由环境注入'), NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
AS new
ON DUPLICATE KEY UPDATE
  `model_id` = new.`model_id`,
  `revision_display_name` = new.`revision_display_name`,
  `label_keys` = new.`label_keys`,
  `input_modalities` = new.`input_modalities`,
  `output_modalities` = new.`output_modalities`,
  `gateway_model_name` = new.`gateway_model_name`,
  `priority` = new.`priority`,
  `revision_status` = new.`revision_status`,
  `published_at` = new.`published_at`,
  `retired_at` = new.`retired_at`,
  `metadata` = new.`metadata`,
  `deleted_at` = NULL,
  `deleted_by` = NULL,
  `delete_reason` = NULL,
  `updated_at` = CURRENT_TIMESTAMP(3);

-- User-visible model options. display_name/description are intentionally explicit.
INSERT INTO `model_label`
  (`label_id`, `label_key`, `display_name`, `description`, `feature_key`, `tier`, `default_revision_id`, `status`, `deleted_at`, `deleted_by`, `delete_reason`, `created_at`, `updated_at`)
VALUES
  ('lbl_claude_code', 'claude-code', 'Kokoro 默认', '平台内置默认模型（claude-code 门面 → LiteLLM）', 'chat', 'standard', 'rev_claude_code_v1', 'active', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('lbl_kokoro_dev_mock', 'kokoro-dev-mock', 'Kokoro Dev Mock', '本地开发链路固定响应模型，不用于生产', 'chat', 'dev', 'rev_kokoro_dev_mock_v1', 'disabled', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('lbl_openai_gpt4o_mini', 'kokoro-openai-gpt-4o-mini', 'OpenAI GPT-4o mini', '通过 LiteLLM 调用 OpenAI GPT-4o mini', 'chat', 'standard', 'rev_openai_gpt4o_mini_v1', 'active', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('lbl_anthropic_claude_sonnet', 'kokoro-anthropic-claude-sonnet', 'Anthropic Claude Sonnet', '通过 LiteLLM 调用 Anthropic Claude Sonnet', 'chat', 'standard', 'rev_anthropic_claude_sonnet_v1', 'active', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('lbl_openai_compatible', 'kokoro-openai-compatible', 'OpenAI Compatible', '可配置的 OpenAI-compatible provider endpoint', 'chat', 'custom', 'rev_openai_compatible_v1', 'active', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
AS new
ON DUPLICATE KEY UPDATE
  `display_name` = new.`display_name`,
  `description` = new.`description`,
  `feature_key` = new.`feature_key`,
  `tier` = new.`tier`,
  `default_revision_id` = new.`default_revision_id`,
  `status` = new.`status`,
  `deleted_at` = NULL,
  `deleted_by` = NULL,
  `delete_reason` = NULL,
  `updated_at` = CURRENT_TIMESTAMP(3);
