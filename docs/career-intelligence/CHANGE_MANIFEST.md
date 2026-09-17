# Change Manifest — Career Intelligence Baseline Restructure Increment 1

## Existing files modified

- `app/api/analyse-cv/route.ts` — retained CV/document acquisition while delegating shared lifecycle behaviour to reusable server modules.
- `app/api/no-cv/route.ts` — retained manual acquisition while delegating shared lifecycle behaviour to reusable server modules.
- `auth.ts` — reduced sensitive authentication logging; no credential values are logged.
- `package.json` — added focused test and structural-verification scripts; no runtime dependency was added.
- `README.md` — documented the actual Next.js baseline, setup, checks and migration references.

`app/ui/dashboard/cvupload.tsx` is deliberately unchanged in Increment 1 to preserve the current tested user journey while the server baseline is restructured.

## New server modules

- `app/lib/career-intelligence/auth.ts`
- `app/lib/career-intelligence/config.ts`
- `app/lib/career-intelligence/errors.ts`
- `app/lib/career-intelligence/success-gates.ts`
- `app/lib/career-intelligence/types.ts`
- `app/lib/career-intelligence/utils.ts`
- `app/lib/career-intelligence/ai/parse-json.ts`
- `app/lib/career-intelligence/ai/provider.ts`
- `app/lib/career-intelligence/ai/schemas.ts`
- `app/lib/career-intelligence/data/assessments.ts`
- `app/lib/career-intelligence/data/repository.ts`
- `app/lib/career-intelligence/data/staging.ts`
- `app/lib/career-intelligence/domain/intelligence-contract.ts`
- `app/lib/career-intelligence/domain/workflow.ts`
- `app/lib/career-intelligence/http/correlation.ts`
- `app/lib/career-intelligence/http/error-response.ts`
- `app/lib/career-intelligence/http/request-schemas.ts`
- `app/lib/career-intelligence/services/capability-review.ts`
- `app/lib/career-intelligence/services/clarification.ts`
- `app/lib/career-intelligence/services/final-review.ts`
- `app/lib/career-intelligence/services/profile-promotion.ts`
- `app/lib/career-intelligence/services/repository-enrichment.ts`
- `app/lib/career-intelligence/services/role-context.ts`
- `app/lib/career-intelligence/services/role-lifecycle.ts`
- `app/lib/career-intelligence/services/role-snapshot.ts`
- `app/lib/career-intelligence/services/role-submission.ts`

## Schema/migration artefact

- `migrations/20260917_capability_intelligence_foundation.sql`

The migration is additive. It preserves the meanings of existing `assessment_status`, `capability_status` and `review_status` while introducing distinct foundations for capability identity decisions, E0–E3/Not Applicable evidence state, applicability, current application, currency, evidence provenance/links, multi-capability question targeting and ambiguity.

The new schema is not yet made authoritative by the runtime in this increment. It must be reviewed/applied/tested separately before later services persist Identity Decision Records or E0–E3 assessment state.

## Tests and verification

- `tests/career-intelligence/ai-output.test.ts`
- `tests/career-intelligence/correlation.test.ts`
- `tests/career-intelligence/request-validation.test.ts`
- `tests/career-intelligence/workflow.test.ts`
- `scripts/verify-career-intelligence-structure.mjs`
- `docs/career-intelligence/VERIFICATION_RESULTS.md`

## Architecture/migration documentation

- `docs/career-intelligence/CURRENT_ARCHITECTURE.md`
- `docs/career-intelligence/TARGET_ARCHITECTURE.md`
- `docs/career-intelligence/BASELINE_RESTRUCTURE.md`
- `docs/career-intelligence/CAPABILITY_SCHEMA_CHANGE.md`
- `docs/career-intelligence/GATE_IMPACT.md`
- `docs/career-intelligence/MIGRATION_PLAN.md`

## Deferred intentionally

- full Capability Identity Decision Record runtime persistence;
- authoritative E0–E3 assessment lifecycle;
- Career Experience / Appendix 5 user journey;
- atomic database transaction around final promotion;
- request-level idempotency/concurrency control for first-time submission;
- provider retry/rate/cost policy;
- full object-access/security/database integration suite;
- UI decomposition.

These are separated because combining them into the initial extraction would enlarge the regression surface and would make rollback harder.
