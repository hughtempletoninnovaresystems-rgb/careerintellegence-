-- Career Intelligence capability assessment foundation
-- Additive migration only. It deliberately does not repurpose the existing
-- assessment_status/review_status columns because those are workflow/user-review
-- states, not E0-E3 evidence state, applicability, current application or currency.

BEGIN;

CREATE TABLE IF NOT EXISTS career_capability_identity_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES career_assessments(id) ON DELETE CASCADE,
  role_assessment_id uuid REFERENCES career_role_assessments(id) ON DELETE CASCADE,
  candidate_expression text NOT NULL,
  underlying_ability_definition text,
  constituent_abilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  counterfactual_result varchar(30) NOT NULL,
  subsumption_result varchar(50),
  final_decision varchar(40) NOT NULL,
  decision_justification text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT career_capability_identity_decisions_counterfactual_check
    CHECK (counterfactual_result IN ('separate', 'not_required', 'inconclusive')),
  CONSTRAINT career_capability_identity_decisions_final_decision_check
    CHECK (final_decision IN ('accept_capability', 'split_composite', 'subsume_attribute', 'reject_candidate'))
);

CREATE INDEX IF NOT EXISTS idx_capability_identity_decisions_assessment
  ON career_capability_identity_decisions(assessment_id, created_at);

CREATE INDEX IF NOT EXISTS idx_capability_identity_decisions_role
  ON career_capability_identity_decisions(role_assessment_id, created_at)
  WHERE role_assessment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS career_capability_identity_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_decision_id uuid NOT NULL REFERENCES career_capability_identity_decisions(id) ON DELETE CASCADE,
  role_capability_id uuid REFERENCES career_role_capabilities(id) ON DELETE SET NULL,
  canonical_competency_id uuid REFERENCES competencies(id) ON DELETE SET NULL,
  resulting_capability_name text NOT NULL,
  result_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT career_capability_identity_results_order_unique
    UNIQUE(identity_decision_id, result_order)
);

CREATE TABLE IF NOT EXISTS career_capability_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_capability_id uuid NOT NULL REFERENCES career_role_capabilities(id) ON DELETE CASCADE,
  attribute_type varchar(40) NOT NULL,
  attribute_value text NOT NULL,
  context text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT career_capability_attributes_type_check
    CHECK (attribute_type IN (
      'technique', 'method', 'tool', 'technology',
      'application_context', 'responsibility_context', 'specialism'
    ))
);

CREATE INDEX IF NOT EXISTS idx_capability_attributes_capability
  ON career_capability_attributes(role_capability_id, attribute_type);

ALTER TABLE career_role_capabilities
  ADD COLUMN IF NOT EXISTS evidence_state varchar(20),
  ADD COLUMN IF NOT EXISTS applicability_status varchar(20),
  ADD COLUMN IF NOT EXISTS current_application_status varchar(30),
  ADD COLUMN IF NOT EXISTS currency_status varchar(30),
  ADD COLUMN IF NOT EXISTS identity_decision_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'career_role_capabilities_evidence_state_check'
  ) THEN
    ALTER TABLE career_role_capabilities
      ADD CONSTRAINT career_role_capabilities_evidence_state_check
      CHECK (evidence_state IS NULL OR evidence_state IN ('E0', 'E1', 'E2', 'E3', 'not_applicable'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'career_role_capabilities_applicability_check'
  ) THEN
    ALTER TABLE career_role_capabilities
      ADD CONSTRAINT career_role_capabilities_applicability_check
      CHECK (applicability_status IS NULL OR applicability_status IN ('applicable', 'not_applicable', 'undetermined'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'career_role_capabilities_applicability_evidence_consistency_check'
  ) THEN
    ALTER TABLE career_role_capabilities
      ADD CONSTRAINT career_role_capabilities_applicability_evidence_consistency_check
      CHECK (
        (applicability_status = 'not_applicable' AND (evidence_state IS NULL OR evidence_state = 'not_applicable'))
        OR
        (applicability_status IS DISTINCT FROM 'not_applicable' AND evidence_state IS DISTINCT FROM 'not_applicable')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'career_role_capabilities_current_application_check'
  ) THEN
    ALTER TABLE career_role_capabilities
      ADD CONSTRAINT career_role_capabilities_current_application_check
      CHECK (current_application_status IS NULL OR current_application_status IN ('current', 'historical', 'not_established', 'not_applicable'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'career_role_capabilities_currency_check'
  ) THEN
    ALTER TABLE career_role_capabilities
      ADD CONSTRAINT career_role_capabilities_currency_check
      CHECK (currency_status IS NULL OR currency_status IN ('current', 'investigation_required', 'uncertain', 'not_assessed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'career_role_capabilities_identity_decision_fkey'
  ) THEN
    ALTER TABLE career_role_capabilities
      ADD CONSTRAINT career_role_capabilities_identity_decision_fkey
      FOREIGN KEY (identity_decision_id)
      REFERENCES career_capability_identity_decisions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_career_role_capabilities_evidence_state
  ON career_role_capabilities(role_assessment_id, evidence_state);

CREATE TABLE IF NOT EXISTS career_capability_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES career_assessments(id) ON DELETE CASCADE,
  role_assessment_id uuid REFERENCES career_role_assessments(id) ON DELETE CASCADE,
  source_question_id uuid REFERENCES career_role_questions(id) ON DELETE SET NULL,
  source_answer_id uuid REFERENCES career_role_answers(id) ON DELETE SET NULL,
  source_type varchar(50) NOT NULL,
  evidence_text text NOT NULL,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_capability_evidence_assessment
  ON career_capability_evidence(assessment_id, created_at);

CREATE INDEX IF NOT EXISTS idx_capability_evidence_role
  ON career_capability_evidence(role_assessment_id, created_at)
  WHERE role_assessment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS career_capability_evidence_links (
  role_capability_id uuid NOT NULL REFERENCES career_role_capabilities(id) ON DELETE CASCADE,
  evidence_id uuid NOT NULL REFERENCES career_capability_evidence(id) ON DELETE CASCADE,
  relationship_type varchar(30) NOT NULL DEFAULT 'supporting',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_capability_id, evidence_id),
  CONSTRAINT career_capability_evidence_links_relationship_check
    CHECK (relationship_type IN ('supporting', 'contradictory', 'currency', 'context'))
);

CREATE TABLE IF NOT EXISTS career_question_capability_targets (
  question_id uuid NOT NULL REFERENCES career_role_questions(id) ON DELETE CASCADE,
  role_capability_id uuid REFERENCES career_role_capabilities(id) ON DELETE SET NULL,
  canonical_competency_id uuid REFERENCES competencies(id) ON DELETE SET NULL,
  capability_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, capability_name)
);

CREATE INDEX IF NOT EXISTS idx_question_capability_targets_role_capability
  ON career_question_capability_targets(role_capability_id)
  WHERE role_capability_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS career_capability_ambiguities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES career_assessments(id) ON DELETE CASCADE,
  role_assessment_id uuid REFERENCES career_role_assessments(id) ON DELETE CASCADE,
  role_capability_id uuid REFERENCES career_role_capabilities(id) ON DELETE SET NULL,
  ambiguity_type varchar(50) NOT NULL,
  description text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'open',
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT career_capability_ambiguities_status_check
    CHECK (status IN ('open', 'resolved', 'accepted_uncertainty'))
);

CREATE INDEX IF NOT EXISTS idx_capability_ambiguities_assessment
  ON career_capability_ambiguities(assessment_id, status);

CREATE INDEX IF NOT EXISTS idx_capability_ambiguities_role
  ON career_capability_ambiguities(role_assessment_id, status)
  WHERE role_assessment_id IS NOT NULL;

COMMIT;
