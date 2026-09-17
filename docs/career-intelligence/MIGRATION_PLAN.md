# Career Intelligence Baseline Migration Plan

## Goal

Migrate the structured prototype toward a production-candidate architecture without replacing the tested CV/no-CV behaviour in one high-risk rewrite.

## Work package 0 — Baseline and rollback

- Preserve the supplied project ZIP as the immutable functional baseline.
- Record existing CV/manual route contracts and test evidence.
- Use small, reviewable increments; do not combine the capability data migration with unrelated UI redesign.

Rollback: restore the previous application revision. The capability migration supplied in this increment is additive and is not required by the refactored runtime.

## Work package 1 — Shared lifecycle boundaries (implemented in this increment)

- central authentication/user resolution;
- approved-only repository matching and ownership checks;
- shared request and AI-output validation;
- provider boundary;
- shared capability review, clarification, role context, role snapshot, final review, role submission, profile promotion and CKM proposal services;
- acquisition routes reduced to CV/manual-specific responsibilities.

Verification target: current CV and no-CV journeys behave identically at the API/UI boundary.

## Work package 2 — Capability intelligence foundation (migration supplied; runtime adoption deferred)

- apply additive schema in non-production;
- validate constraints/indexes and existing rows;
- persist Identity Decision Records;
- implement split/subsume result persistence;
- introduce E0-E3/Not Applicable evidence assessments separately from workflow/review status;
- persist evidence provenance and question-to-capability targeting;
- retain ambiguity/current-application/currency independently.

Rollback: application may roll back independently because existing runtime fields remain unchanged. Do not drop new structures after data is written without an explicit data rollback/migration.

## Work package 3 — Data integrity and idempotency

- transaction boundary for profile promotion and repository proposal writes;
- request idempotency for `submit_role` and paid provider work where appropriate;
- recovery/reconciliation path for interrupted writes;
- concurrency tests.

## Work package 4 — Integration/security test expansion

- unauthenticated endpoint tests;
- another-user role/capability mutation tests;
- malformed provider output tests;
- provider timeout/failure tests;
- invalid/oversized upload tests;
- duplicate/repeated submission tests;
- database-write failure and workflow integrity tests;
- regression against the current CV/no-CV E2E suite.

## Work package 5 — Continuous Career Experience (future scope)

When Appendix 5 enters implementation scope, introduce `CareerExperience` as a separate context/evidence object and route it into the same capability identity/evidence/enrichment/user-review services. Do not model experience as a role.
