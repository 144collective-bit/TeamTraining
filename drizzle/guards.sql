-- ============================================================================
-- Integrity guards.
--
-- These enforce at the database level what application code must never be
-- trusted to enforce on its own. Re-runnable.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The event log is append-only.
--    No UPDATE, no DELETE, ever. This is what makes the audit trail a
--    structural property rather than a convention someone can forget.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tt_events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'events is append-only: % on event % is not permitted',
    TG_OP, COALESCE(OLD.id::text, '(unknown)')
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS events_no_update ON events;
CREATE TRIGGER events_no_update
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION tt_events_append_only();

DROP TRIGGER IF EXISTS events_no_delete ON events;
CREATE TRIGGER events_no_delete
  BEFORE DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION tt_events_append_only();

-- ---------------------------------------------------------------------------
-- 2. A published document revision is frozen.
--    Editing a published SOP would silently rewrite what people were trained
--    on. Content, hash and revision number become immutable at publication;
--    only the lifecycle fields needed to supersede or withdraw may change.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tt_revision_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('PUBLISHED', 'SUPERSEDED') THEN
    IF NEW.body::text IS DISTINCT FROM OLD.body::text
       OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
       OR NEW.revision    IS DISTINCT FROM OLD.revision
       OR NEW.document_id IS DISTINCT FROM OLD.document_id
    THEN
      RAISE EXCEPTION
        'document revision % is % and cannot be edited - publish a new revision instead',
        OLD.id, OLD.status
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS doc_revisions_immutable ON document_revisions;
CREATE TRIGGER doc_revisions_immutable
  BEFORE UPDATE ON document_revisions
  FOR EACH ROW EXECUTE FUNCTION tt_revision_immutable();

-- A published revision can never be deleted - training records point at it.
CREATE OR REPLACE FUNCTION tt_revision_no_delete() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('PUBLISHED', 'SUPERSEDED') THEN
    RAISE EXCEPTION
      'document revision % is % and cannot be deleted - withdraw it instead',
      OLD.id, OLD.status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS doc_revisions_no_delete ON document_revisions;
CREATE TRIGGER doc_revisions_no_delete
  BEFORE DELETE ON document_revisions
  FOR EACH ROW EXECUTE FUNCTION tt_revision_no_delete();

-- ---------------------------------------------------------------------------
-- 3. Signatures are immutable.
--    A signature is evidence. Corrections happen by superseding, not editing.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tt_signatures_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'signatures are immutable: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS signatures_no_update ON signatures;
CREATE TRIGGER signatures_no_update
  BEFORE UPDATE OR DELETE ON signatures
  FOR EACH ROW EXECUTE FUNCTION tt_signatures_immutable();

-- ---------------------------------------------------------------------------
-- 4. Only one PUBLISHED revision per document at a time.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS doc_revisions_one_published_idx
  ON document_revisions (document_id)
  WHERE status = 'PUBLISHED';
