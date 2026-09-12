-- ============================================================================
-- Row-level security.
--
-- Tenant isolation is enforced in application code, but a single forgotten
-- WHERE clause would leak one customer's shop floor to another. These policies
-- make that impossible rather than merely unlikely.
--
-- Two roles:
--   the owner   owns the schema. Used for migrations and seeding, and NOT
--               subject to these policies (RLS is not FORCEd), so setup stays
--               simple. This is whoever DATABASE_ADMIN_URL authenticates as.
--   the app     what the application connects as. No superuser, no BYPASSRLS,
--               so every statement it runs is filtered by the policies below.
--               This is whoever DATABASE_URL authenticates as.
--
-- The application role's name and password are taken from DATABASE_URL rather
-- than written here — a credential committed to a repository is not a
-- credential. scripts/apply-sql.mjs extracts them and passes them in as
-- :app_role and :app_password.
--
-- Re-runnable.
-- ============================================================================

\if :{?app_role}
\else
\echo 'app_role was not supplied. Run this through: npm run db:sql'
\quit 1
\endif

-- Available to the DO blocks below, which cannot see the substituted variables
-- because substitution does not reach inside dollar-quoted strings.
SET tt.app_role = :'app_role';
SET tt.app_password = :'app_password';

-- ---------------------------------------------------------------------------
-- The application role
-- ---------------------------------------------------------------------------
DO $create_role$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = current_setting('tt.app_role')
  ) THEN
    EXECUTE format(
      'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE',
      current_setting('tt.app_role'), current_setting('tt.app_password')
    );
  END IF;
END
$create_role$;

-- Out of the session as soon as it has been used. It is still in the server log
-- if log_statement is on, but there is no reason to leave it readable by
-- anything else that runs on this connection.
RESET tt.app_password;

-- Belt and braces, in case the role predates this file or was created by hand
-- with the wrong attributes. Some managed providers do not allow altering
-- another role's superuser attributes; if so, say something rather than fail —
-- npm run test:isolation checks the outcome regardless.
DO $$
BEGIN
  EXECUTE format(
    'ALTER ROLE %I NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE',
    current_setting('tt.app_role')
  );
EXCEPTION WHEN insufficient_privilege OR feature_not_supported THEN
  RAISE NOTICE
    'Could not set attributes on %. Confirm by hand that it has NOSUPERUSER and NOBYPASSRLS, then run: npm run test:isolation',
    current_setting('tt.app_role');
END $$;

GRANT USAGE ON SCHEMA public TO :"app_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"app_role";

-- ---------------------------------------------------------------------------
-- The tenant in scope for the current transaction.
--
-- Returns NULL when unset, and every policy compares with `=`, so an
-- unset context matches nothing. Forgetting to set it fails closed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION app_current_tenant() TO :"app_role";

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
GRANT EXECUTE ON FUNCTION tt_lookup_login(text) TO :"app_role";
GRANT EXECUTE ON FUNCTION tt_resolve_session(text) TO :"app_role";
GRANT EXECUTE ON FUNCTION tt_create_session(text, uuid, timestamptz) TO :"app_role";
GRANT EXECUTE ON FUNCTION tt_destroy_session(text) TO :"app_role";

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

-- ---------------------------------------------------------------------------
-- First-run setup.
--
-- Creating the first organisation necessarily happens before any tenant
-- exists, so it cannot go through the policies either. This function refuses
-- once any organisation is present, which makes it a one-time door rather than
-- a standing bypass.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tt_has_organisation() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM tenants);
$$;

CREATE OR REPLACE FUNCTION tt_bootstrap_organisation(
  p_org_name      text,
  p_slug          text,
  p_site_name     text,
  p_user_name     text,
  p_email         text,
  p_password_hash text,
  p_pin_hash      text
)
RETURNS TABLE (tenant_id uuid, user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid;
  v_user   uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM tenants) THEN
    RAISE EXCEPTION 'An organisation has already been set up.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  INSERT INTO tenants (name, slug, site_name)
  VALUES (p_org_name, p_slug, NULLIF(p_site_name, ''))
  RETURNING id INTO v_tenant;

  INSERT INTO users (tenant_id, email, name, role, status, password_hash, pin_hash, started_on)
  VALUES (v_tenant, lower(p_email), p_user_name, 'ADMIN', 'ACTIVE',
          p_password_hash, p_pin_hash, current_date)
  RETURNING id INTO v_user;

  RETURN QUERY SELECT v_tenant, v_user;
END $$;

REVOKE ALL ON FUNCTION tt_has_organisation() FROM PUBLIC;
REVOKE ALL ON FUNCTION tt_bootstrap_organisation(text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tt_has_organisation() TO :"app_role";
GRANT EXECUTE ON FUNCTION tt_bootstrap_organisation(text, text, text, text, text, text, text) TO :"app_role";
