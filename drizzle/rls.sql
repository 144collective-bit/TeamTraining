-- ============================================================================
-- Row-level security.
--
-- Tenant isolation is enforced in application code, but a single forgotten
-- WHERE clause would leak one customer's shop floor to another. These policies
-- make that impossible rather than merely unlikely.
--
-- Two roles:
--   tt        owns the schema. Used for migrations and seeding, and NOT subject
--             to these policies (RLS is not FORCEd), so setup stays simple.
--   tt_app    what the application connects as. No superuser, no BYPASSRLS, so
--             every statement it runs is filtered by the policies below.
--
-- Re-runnable.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The application role
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tt_app') THEN
    CREATE ROLE tt_app LOGIN PASSWORD 'tt_app' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- Explicitly, in case the role predates this file.
ALTER ROLE tt_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

GRANT USAGE ON SCHEMA public TO tt_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tt_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tt_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tt_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO tt_app;

-- ---------------------------------------------------------------------------
-- The tenant in scope for the current transaction.
--
-- Returns NULL when unset, and every policy compares with `=`, so an
-- unset context matches nothing. Forgetting to set it fails closed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION app_current_tenant() TO tt_app;

-- ---------------------------------------------------------------------------
-- Pre-authentication lookups.
--
-- Sign-in and session resolution happen before any tenant is known, so they
-- cannot go through the policies. These two functions are the only way past
-- them: narrow, SECURITY DEFINER, and returning only what auth needs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tt_lookup_login(p_email text)
RETURNS TABLE (id uuid, tenant_id uuid, password_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.tenant_id, u.password_hash
  FROM users u
  WHERE lower(u.email) = lower(p_email) AND u.status = 'ACTIVE'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION tt_resolve_session(p_session_id text)
RETURNS TABLE (id uuid, tenant_id uuid, name text, email text, role user_role, job_title text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.tenant_id, u.name, u.email, u.role, u.job_title
  FROM auth_sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.id = p_session_id
    AND s.expires_at > now()
    AND u.status = 'ACTIVE'
  LIMIT 1;
$$;

-- Creating and destroying a session is also pre-context.
CREATE OR REPLACE FUNCTION tt_create_session(p_id text, p_user_id uuid, p_expires timestamptz)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO auth_sessions (id, user_id, expires_at) VALUES (p_id, p_user_id, p_expires);
$$;

CREATE OR REPLACE FUNCTION tt_destroy_session(p_id text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM auth_sessions WHERE id = p_id;
$$;

REVOKE ALL ON FUNCTION tt_lookup_login(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tt_resolve_session(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tt_create_session(text, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION tt_destroy_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tt_lookup_login(text) TO tt_app;
GRANT EXECUTE ON FUNCTION tt_resolve_session(text) TO tt_app;
GRANT EXECUTE ON FUNCTION tt_create_session(text, uuid, timestamptz) TO tt_app;
GRANT EXECUTE ON FUNCTION tt_destroy_session(text) TO tt_app;

-- ---------------------------------------------------------------------------
-- Policies
--
-- Every table carrying tenant_id gets the same shape: you may see and write
-- rows belonging to the tenant in scope, and nothing else. WITH CHECK stops a
-- row being written into another tenant, which USING alone would allow.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'users', 'areas', 'machines', 'documents', 'document_revisions',
    'attachments', 'competence_records', 'training_sessions', 'daily_sign_offs',
    'assessments', 'inductions', 'induction_items', 'signatures', 'events'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$
      CREATE POLICY tenant_isolation ON %I
        USING (tenant_id = app_current_tenant())
        WITH CHECK (tenant_id = app_current_tenant())
    $p$, t);
  END LOOP;
END $$;

-- The tenants table keys on its own id rather than a tenant_id column.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenants;
CREATE POLICY tenant_isolation ON tenants
  USING (id = app_current_tenant())
  WITH CHECK (id = app_current_tenant());

-- Sessions belong to a tenant through their user. Reached post-authentication
-- only; sign-in and sign-out go through the definer functions above.
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON auth_sessions;
CREATE POLICY tenant_isolation ON auth_sessions
  USING (EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth_sessions.user_id AND u.tenant_id = app_current_tenant()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth_sessions.user_id AND u.tenant_id = app_current_tenant()
  ));
