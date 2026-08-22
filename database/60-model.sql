SET search_path TO kokoro, pg_catalog;

CREATE TABLE model_provider (
  provider_id uuid PRIMARY KEY,
  key text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL,
  secret_handle_ref text,
  generation bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT model_provider_key_key UNIQUE (key),
  CONSTRAINT model_provider_status_ck CHECK (status IN ('active','disabled')),
  CONSTRAINT model_provider_no_inference_secret_ck CHECK (secret_handle_ref IS NULL),
  CONSTRAINT model_provider_generation_ck CHECK (generation > 0)
);

CREATE TABLE model_definition (
  model_id uuid PRIMARY KEY,
  key text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL,
  current_revision_id uuid,
  generation bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT model_definition_key_key UNIQUE (key),
  CONSTRAINT model_definition_model_revision_key UNIQUE (model_id, current_revision_id),
  CONSTRAINT model_definition_status_ck CHECK (status IN ('active','disabled')),
  CONSTRAINT model_definition_generation_ck CHECK (generation > 0)
);

CREATE TABLE model_revision (
  model_revision_id uuid PRIMARY KEY,
  model_id uuid NOT NULL,
  revision integer NOT NULL,
  provider_id uuid NOT NULL,
  provider_model_name text NOT NULL,
  transport text NOT NULL,
  modalities jsonb NOT NULL,
  context_window integer NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT model_revision_revision_model_key UNIQUE (model_revision_id, model_id),
  CONSTRAINT model_revision_model_revision_key UNIQUE (model_id, revision),
  CONSTRAINT model_revision_model_fk
    FOREIGN KEY (model_id) REFERENCES model_definition(model_id) ON DELETE RESTRICT,
  CONSTRAINT model_revision_provider_fk
    FOREIGN KEY (provider_id) REFERENCES model_provider(provider_id) ON DELETE RESTRICT,
  CONSTRAINT model_revision_revision_ck CHECK (revision > 0),
  CONSTRAINT model_revision_transport_ck CHECK (transport IN ('litellm','direct','local')),
  CONSTRAINT model_revision_modalities_ck CHECK (
    jsonb_typeof(modalities) = 'array' AND jsonb_array_length(modalities) > 0
  ),
  CONSTRAINT model_revision_context_window_ck CHECK (context_window > 0)
);

ALTER TABLE model_definition
  ADD CONSTRAINT model_definition_current_revision_fk
  FOREIGN KEY (current_revision_id, model_id)
  REFERENCES model_revision(model_revision_id, model_id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE model_routing_policy (
  routing_policy_id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  label text NOT NULL,
  model_revision_id uuid NOT NULL,
  priority integer NOT NULL,
  status text NOT NULL,
  generation bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT model_routing_policy_site_fk
    FOREIGN KEY (site_id) REFERENCES site_site(site_id) ON DELETE RESTRICT,
  CONSTRAINT model_routing_policy_revision_fk
    FOREIGN KEY (model_revision_id) REFERENCES model_revision(model_revision_id) ON DELETE RESTRICT,
  CONSTRAINT model_routing_policy_site_label_priority_key
    UNIQUE (site_id, label, priority),
  CONSTRAINT model_routing_policy_priority_ck CHECK (priority >= 0),
  CONSTRAINT model_routing_policy_status_ck CHECK (status IN ('active','disabled')),
  CONSTRAINT model_routing_policy_generation_ck CHECK (generation > 0)
);

CREATE TABLE model_provider_health_state (
  provider_id uuid PRIMARY KEY,
  status text NOT NULL,
  generation bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT model_provider_health_state_provider_fk
    FOREIGN KEY (provider_id) REFERENCES model_provider(provider_id) ON DELETE RESTRICT,
  CONSTRAINT model_provider_health_state_slice_a_status_ck CHECK (status = 'unknown'),
  CONSTRAINT model_provider_health_state_generation_ck CHECK (generation > 0)
);

CREATE FUNCTION model_validate_current_revision()
RETURNS trigger LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, kokoro, pg_temp
AS $$
DECLARE revision_published_at timestamptz;
DECLARE revision_transport text;
BEGIN
  IF NEW.current_revision_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT published_at, transport
  INTO revision_published_at, revision_transport
  FROM model_revision
  WHERE model_revision_id = NEW.current_revision_id AND model_id = NEW.model_id;
  IF revision_published_at IS NULL OR revision_transport <> 'litellm' THEN
    RAISE EXCEPTION 'current model revision must be published and LiteLLM'
      USING ERRCODE='23514', CONSTRAINT='model_definition_current_published_ck';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER model_definition_current_revision_trigger
AFTER INSERT OR UPDATE OF current_revision_id ON model_definition
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION model_validate_current_revision();

CREATE FUNCTION model_validate_routing_target()
RETURNS trigger LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, kokoro, pg_temp
AS $$
DECLARE revision_published_at timestamptz;
DECLARE revision_transport text;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NULL;
  END IF;
  SELECT published_at, transport
  INTO revision_published_at, revision_transport
  FROM model_revision
  WHERE model_revision_id = NEW.model_revision_id;
  IF revision_published_at IS NULL OR revision_transport <> 'litellm' THEN
    RAISE EXCEPTION 'active routing policy requires a published LiteLLM revision'
      USING ERRCODE='23514', CONSTRAINT='model_routing_policy_published_litellm_ck';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER model_routing_policy_target_trigger
AFTER INSERT OR UPDATE OF model_revision_id, status ON model_routing_policy
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION model_validate_routing_target();

CREATE FUNCTION model_validate_revision_routes()
RETURNS trigger LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, kokoro, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM model_routing_policy
    WHERE model_revision_id = NEW.model_revision_id AND status = 'active'
  ) AND (NEW.published_at IS NULL OR NEW.transport <> 'litellm')
  THEN
    RAISE EXCEPTION 'routed model revision must remain published and LiteLLM'
      USING ERRCODE='23514', CONSTRAINT='model_revision_live_route_ck';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER model_revision_live_route_trigger
AFTER UPDATE OF published_at, transport ON model_revision
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION model_validate_revision_routes();

CREATE FUNCTION model_reject_published_revision_update()
RETURNS trigger LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, kokoro, pg_temp
AS $$
BEGIN
  IF OLD.published_at IS NOT NULL AND (TG_OP = 'DELETE' OR
    NEW.model_id IS DISTINCT FROM OLD.model_id
    OR NEW.revision IS DISTINCT FROM OLD.revision
    OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
    OR NEW.provider_model_name IS DISTINCT FROM OLD.provider_model_name
    OR NEW.transport IS DISTINCT FROM OLD.transport
    OR NEW.modalities IS DISTINCT FROM OLD.modalities
    OR NEW.context_window IS DISTINCT FROM OLD.context_window
    OR NEW.published_at IS DISTINCT FROM OLD.published_at
  ) THEN
    RAISE EXCEPTION 'published model revision is immutable'
      USING ERRCODE='23514', CONSTRAINT='model_revision_published_immutable_ck';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER model_revision_published_immutable_trigger
BEFORE UPDATE OR DELETE ON model_revision
FOR EACH ROW EXECUTE FUNCTION model_reject_published_revision_update();
