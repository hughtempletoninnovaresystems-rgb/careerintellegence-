-- Career Intelligence provenance/review integrity hardening.
-- Apply after 20260917_capability_intelligence_foundation.sql.
-- Additive and transactional; does not backfill invented source locators.

BEGIN;

ALTER TABLE career_role_capabilities
  ADD COLUMN IF NOT EXISTS revision_no integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reviewed_revision_no integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'career_role_capabilities_revision_positive_check'
  ) THEN
    ALTER TABLE career_role_capabilities
      ADD CONSTRAINT career_role_capabilities_revision_positive_check
      CHECK (revision_no >= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'career_role_capabilities_reviewed_revision_check'
  ) THEN
    ALTER TABLE career_role_capabilities
      ADD CONSTRAINT career_role_capabilities_reviewed_revision_check
      CHECK (reviewed_revision_no IS NULL OR
             (reviewed_revision_no >= 1 AND reviewed_revision_no <= revision_no));
  END IF;
END $$;

ALTER TABLE career_capability_evidence_links
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS capability_revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by_evidence_id uuid
    REFERENCES career_capability_evidence(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_capability_evidence_links_current
  ON career_capability_evidence_links(role_capability_id, relationship_type)
  WHERE is_current=TRUE;

-- A pre-existing link to a generated legacy/revision text snapshot is context,
-- not independent candidate evidence. Keep the record for history, but require
-- a real source contribution before profile promotion.
UPDATE career_capability_evidence_links cel
SET relationship_type='context'
FROM career_capability_evidence ce
WHERE ce.id=cel.evidence_id
  AND ce.source_type IN ('legacy_backfill', 'capability_revision')
  AND cel.relationship_type='supporting';

CREATE TABLE IF NOT EXISTS career_capability_review_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_capability_id uuid NOT NULL
    REFERENCES career_role_capabilities(id) ON DELETE CASCADE,
  revision_no integer NOT NULL,
  review_status varchar(20) NOT NULL,
  actor_user_id text NOT NULL,
  content_hash char(64) NOT NULL,
  effective_name text NOT NULL,
  effective_evidence text,
  demonstrated boolean,
  capability_status varchar(30),
  assessment_status varchar(30),
  canonical_competency_id uuid REFERENCES competencies(id) ON DELETE SET NULL,
  source_evidence_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT career_capability_review_snapshots_revision_check
    CHECK (revision_no >= 1),
  CONSTRAINT career_capability_review_snapshots_status_check
    CHECK (review_status IN ('accepted', 'edited', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_capability_review_snapshots_capability_revision
  ON career_capability_review_snapshots(role_capability_id, revision_no, created_at DESC);

CREATE TABLE IF NOT EXISTS career_ai_invocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar(30) NOT NULL,
  requested_model text NOT NULL,
  actual_model text,
  prompt_sha256 char(64) NOT NULL,
  output_sha256 char(64),
  outcome varchar(30) NOT NULL,
  error_code varchar(80),
  elapsed_ms integer NOT NULL DEFAULT 0,
  assessment_id uuid REFERENCES career_assessments(id) ON DELETE SET NULL,
  role_assessment_id uuid REFERENCES career_role_assessments(id) ON DELETE SET NULL,
  operation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT career_ai_invocations_outcome_check
    CHECK (outcome IN ('succeeded', 'provider_error', 'invalid_output', 'audit_error')),
  CONSTRAINT career_ai_invocations_elapsed_check CHECK (elapsed_ms >= 0)
);

CREATE INDEX IF NOT EXISTS idx_career_ai_invocations_created_at
  ON career_ai_invocations(created_at DESC);

-- Legacy records can be retained as supporting evidence, but no source locator
-- is fabricated. Existing decisions are deliberately not treated as reviewed
-- against this newly defined revision number; they need a fresh candidate review.
WITH legacy AS (
  SELECT
    crc.id AS role_capability_id,
    crc.role_assessment_id,
    cra.assessment_id,
    COALESCE(NULLIF(BTRIM(crc.edited_evidence), ''), NULLIF(BTRIM(crc.evidence), '')) AS evidence_text,
    COALESCE(NULLIF(BTRIM(crc.edited_competency_name), ''), NULLIF(BTRIM(crc.proposed_competency_name), '')) AS effective_name,
    crc.revision_no
  FROM career_role_capabilities crc
  JOIN career_role_assessments cra ON cra.id=crc.role_assessment_id
  WHERE NULLIF(BTRIM(COALESCE(NULLIF(BTRIM(crc.edited_evidence), ''), NULLIF(BTRIM(crc.evidence), ''))), '') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM career_capability_evidence_links l
      WHERE l.role_capability_id=crc.id AND l.is_current=TRUE
    )
), inserted AS (
  INSERT INTO career_capability_evidence (
    assessment_id, role_assessment_id, source_type, evidence_text, provenance, created_at
  )
  SELECT
    assessment_id,
    role_assessment_id,
    'legacy_backfill',
    evidence_text,
    jsonb_build_object(
      'origin', '20261009_provenance_integrity_migration',
      'legacy_role_capability_id', role_capability_id::text,
      'effective_name_at_backfill', effective_name,
      'locatorAvailable', FALSE,
      'note', 'Historical source granularity was not available; this is a text snapshot, not a reconstructed CV or answer locator.'
    ),
    NOW()
  FROM legacy
  RETURNING id, role_assessment_id, evidence_text, provenance
)
INSERT INTO career_capability_evidence_links (
  role_capability_id, evidence_id, relationship_type, is_current, capability_revision, created_at
)
SELECT
  (inserted.provenance->>'legacy_role_capability_id')::uuid,
  inserted.id,
  'context',
  TRUE,
  legacy.revision_no,
  NOW()
FROM inserted
JOIN legacy
  ON legacy.role_capability_id=(inserted.provenance->>'legacy_role_capability_id')::uuid;

-- Revision is advanced for any content/status change that could affect review
-- or promotion. A caller may preserve the review only by explicitly setting
-- reviewed_revision_no to the next revision inside the same update.
CREATE OR REPLACE FUNCTION career_ci_capability_revision_before_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  material_change boolean;
  next_revision integer;
BEGIN
  material_change := ROW(
    NEW.canonical_competency_id,
    NEW.proposed_competency_name,
    NEW.edited_competency_name,
    NEW.evidence,
    NEW.edited_evidence,
    NEW.demonstrated,
    NEW.capability_status,
    NEW.assessment_status,
    NEW.source_type,
    NEW.source_section
  ) IS DISTINCT FROM ROW(
    OLD.canonical_competency_id,
    OLD.proposed_competency_name,
    OLD.edited_competency_name,
    OLD.evidence,
    OLD.edited_evidence,
    OLD.demonstrated,
    OLD.capability_status,
    OLD.assessment_status,
    OLD.source_type,
    OLD.source_section
  );

  IF material_change THEN
    next_revision := OLD.revision_no + 1;
    NEW.revision_no := next_revision;

    IF NEW.reviewed_revision_no IS DISTINCT FROM next_revision THEN
      NEW.reviewed_revision_no := NULL;
      NEW.review_status := 'proposed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_career_ci_capability_revision_before_update ON career_role_capabilities;
CREATE TRIGGER trg_career_ci_capability_revision_before_update
BEFORE UPDATE ON career_role_capabilities
FOR EACH ROW
EXECUTE FUNCTION career_ci_capability_revision_before_update();

-- Retire the former projection on a material change and preserve a new
-- revision's evidence statement. The caller may immediately replace this
-- generic revision record with a source-linked answer record in the same flow.
CREATE OR REPLACE FUNCTION career_ci_capability_evidence_after_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  material_change boolean;
  assessment_uuid uuid;
  evidence_uuid uuid;
  evidence_value text;
  effective_name_value text;
BEGIN
  material_change := ROW(
    NEW.canonical_competency_id,
    NEW.proposed_competency_name,
    NEW.edited_competency_name,
    NEW.evidence,
    NEW.edited_evidence,
    NEW.demonstrated,
    NEW.capability_status,
    NEW.assessment_status,
    NEW.source_type,
    NEW.source_section
  ) IS DISTINCT FROM ROW(
    OLD.canonical_competency_id,
    OLD.proposed_competency_name,
    OLD.edited_competency_name,
    OLD.evidence,
    OLD.edited_evidence,
    OLD.demonstrated,
    OLD.capability_status,
    OLD.assessment_status,
    OLD.source_type,
    OLD.source_section
  );

  IF NOT material_change THEN
    RETURN NEW;
  END IF;

  SELECT assessment_id INTO assessment_uuid
  FROM career_role_assessments
  WHERE id=NEW.role_assessment_id;

  evidence_value := COALESCE(
    NULLIF(BTRIM(NEW.edited_evidence), ''),
    NULLIF(BTRIM(NEW.evidence), '')
  );
  effective_name_value := COALESCE(
    NULLIF(BTRIM(NEW.edited_competency_name), ''),
    NULLIF(BTRIM(NEW.proposed_competency_name), '')
  );

  IF evidence_value IS NULL THEN
    UPDATE career_capability_evidence_links
    SET is_current=FALSE, superseded_at=NOW(), superseded_by_evidence_id=NULL
    WHERE role_capability_id=NEW.id AND is_current=TRUE;
    RETURN NEW;
  END IF;

  INSERT INTO career_capability_evidence (
    assessment_id, role_assessment_id, source_type, evidence_text, provenance, created_at
  )
  VALUES (
    assessment_uuid,
    NEW.role_assessment_id,
    'capability_revision',
    evidence_value,
    jsonb_build_object(
      'origin', 'career_ci_capability_evidence_after_update',
      'capability_revision', NEW.revision_no,
      'effective_name_at_revision', effective_name_value,
      'locatorAvailable', FALSE,
      'note', 'Generic revision snapshot. A source answer/document locator is not inferred by this trigger.'
    ),
    NOW()
  )
  RETURNING id INTO evidence_uuid;

  UPDATE career_capability_evidence_links
  SET
    is_current=FALSE,
    superseded_at=NOW(),
    superseded_by_evidence_id=evidence_uuid
  WHERE role_capability_id=NEW.id AND is_current=TRUE;

  INSERT INTO career_capability_evidence_links (
    role_capability_id, evidence_id, relationship_type, is_current, capability_revision, created_at
  )
  VALUES (
    NEW.id,
    evidence_uuid,
    'context',
    TRUE,
    NEW.revision_no,
    NOW()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_career_ci_capability_evidence_after_update ON career_role_capabilities;
CREATE TRIGGER trg_career_ci_capability_evidence_after_update
AFTER UPDATE ON career_role_capabilities
FOR EACH ROW
EXECUTE FUNCTION career_ci_capability_evidence_after_update();

COMMIT;
