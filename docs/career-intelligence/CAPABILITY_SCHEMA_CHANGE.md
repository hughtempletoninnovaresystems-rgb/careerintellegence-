# Capability Intelligence Schema Change — Design Note

## Why the existing schema is insufficient

The baseline schema distinguishes capability workflow (`assessment_status`), demonstrated/gap (`capability_status`) and user review (`review_status`). Those fields cannot safely carry the additional meanings required by the Intelligence Contract:

- capability identity decision;
- E0/E1/E2/E3/Not Applicable evidence state;
- applicability;
- historical demonstration versus current application;
- capability currency;
- technique/tool/technology/context attributes;
- one evidence item supporting more than one independently assessed capability;
- one clarification question investigating more than one capability;
- material ambiguity that must remain unresolved rather than inferred away.

The migration therefore adds these concepts rather than reusing an existing status column.

## Additive structures

- `career_capability_identity_decisions` — durable Identity Decision Record at assessment scope with optional role context.
- `career_capability_identity_results` — supports split-composite decisions producing multiple resulting capability identities.
- `career_capability_attributes` — preserves technique/method/tool/technology/context without creating false capability identities.
- `career_role_capabilities.evidence_state` — E0-E3/Not Applicable, independent of workflow and review state.
- `career_role_capabilities.applicability_status` — keeps non-applicability separate from E0.
- `career_role_capabilities.current_application_status` — historical/current/not-established distinction.
- `career_role_capabilities.currency_status` — separate capability-currency assessment.
- `career_capability_evidence` and `career_capability_evidence_links` — provenance-bearing evidence object and many-to-many support relationships.
- `career_question_capability_targets` — allows a coherent question to investigate multiple capabilities while subsequent assessment remains independent.
- `career_capability_ambiguities` — preserves material uncertainty/conflict rather than resolving by assumption.

## Existing fields deliberately retained

No existing status field is removed or redefined. Existing Phase 1 rows continue to retain their current meaning. The new evidence/current-application/currency fields are nullable so they can be introduced through a controlled backfill/adoption process rather than fabricating evidence states for historic rows.

## Governance interaction

The existing `roles`, `competencies` and `role_competencies` lifecycle states remain the CKM governance boundary. Canonical runtime matching is restricted to `approved` records. New candidate-derived repository intelligence remains `proposed`; rejected CKM objects are not reactivated by candidate assessment.

## Appendix 5 boundary

The migration does not yet create the future `CareerExperience` model. To avoid making role the universal source of intelligence, identity decisions, evidence and ambiguity records are assessment-scoped and permit role context to be absent. A future experience record can therefore become an additional provenance/context link without redefining capability identity or evidence semantics.

The Experience schema should be introduced with the profile-maintenance feature rather than speculatively in this baseline migration.

## Adoption sequence

1. Apply migration in a controlled non-production database and validate constraints/indexes against existing data.
2. Introduce Capability Identity Service persistence and its tests.
3. Introduce role-by-role E0-E3/Not Applicable assessment and evidence links.
4. Introduce consolidated current-application/currency/ambiguity projection.
5. Only then treat the new fields as authoritative Career Intelligence state.

Until steps 2-4 are complete, the migration is a foundation and must not be represented as full Intelligence Contract implementation.
