# Career Intelligence Baseline Restructure — Increment 1

## Classification

Production remediation plus production-candidate restructuring. This increment does not claim that any Production Readiness Gate has passed.

## Current-state findings

The supplied baseline is a Next.js 14 App Router application. The two principal Career Intelligence endpoints, `app/api/analyse-cv/route.ts` and `app/api/no-cv/route.ts`, previously implemented large parallel copies of the same assessment lifecycle. Authentication lookup, repository matching, object ownership checks, capability staging, clarification assessment, capability review, role-context editing, final submission checks, candidate-profile promotion, repository proposal creation and role progression were embedded in route files.

The browser remains responsible for presentation and interaction. Privileged database and AI-provider operations remain server-side.

## Increment 1 changes

Reusable server modules are now located under `app/lib/career-intelligence`:

- `auth.ts` — authenticated user resolution.
- `config.ts` — server-side operational configuration and limits.
- `errors.ts` and `http/error-response.ts` — safe error classification and client mapping.
- `http/correlation.ts` — bounded correlation identifiers.
- `http/request-schemas.ts` — server-side request validation compatible with the existing UI contracts.
- `data/assessments.ts` — assessment and role-assessment creation.
- `data/repository.ts` — approved-only canonical role/capability lookup and object-level role ownership checking.
- `data/staging.ts` — capability staging and clarification-round persistence.
- `success-gates.ts` — common traceability persistence.
- `ai/provider.ts` — Gemini provider boundary with timeout and validated JSON handling.
- `ai/schemas.ts` — bounded AI-output schemas.
- `domain/intelligence-contract.ts` — shared capability-identity/evidence rules derived from the Intelligence Contract.
- `domain/workflow.ts` — explicit role lifecycle transition rules.
- `services/capability-review.ts` — shared Accept/Edit/Reject persistence and canonical rematching of edited names.
- `services/clarification.ts` — shared evidence-enrichment loop using trusted server-side questions rather than client-supplied question/capability descriptions.
- `services/role-context.ts` — shared role-context editing with ownership and lifecycle controls.
- `services/role-snapshot.ts` — one database snapshot model with CV/manual response mappers.
- `services/final-review.ts` — shared final AI consistency check.
- `services/profile-promotion.ts` — common candidate-profile promotion and legacy candidate-knowledge compatibility.
- `services/repository-enrichment.ts` — CKM/repository proposal creation kept separate from candidate approval.
- `services/role-submission.ts` — common final-submission, next-role activation and assessment-completion lifecycle.
- `types.ts` — shared current types plus separate Intelligence Contract dimensions.

The two routes are now acquisition/transport adapters. CV/document ingestion remains specific to `analyse-cv`; manual role acquisition remains specific to `no-cv`. Both then call common assessment services.

The baseline route sizes reduced from approximately 4,115/3,570 lines in the supplied focused code package to approximately 1,430/940 lines after extraction. Line count is not itself a quality measure; it is included only as evidence that duplicated lifecycle implementation was materially removed from the two route adapters.

## Capability-model provision

The accompanying additive migration introduces a foundation for:

- Capability Identity Decision Records;
- split-composite identity results;
- technique/method/tool/technology/context attributes;
- E0/E1/E2/E3/Not Applicable evidence state;
- applicability independent from evidence state;
- current application independent from historical demonstration;
- capability currency;
- provenance-bearing evidence objects and many-to-many evidence links;
- clarification questions targeting more than one independently assessed capability;
- material ambiguity that remains unresolved rather than being inferred away.

Existing `assessment_status`, `capability_status` and `review_status` are deliberately not redefined. The current runtime continues to use them with their existing meanings.

The current routes now share the Intelligence Contract split-versus-subsumption instructions, but the new Identity Decision Record and E0-E3 schema are **not yet authoritative runtime state**. Persisting and governing those new records is a separate migration work package and requires regression/integration testing after the migration is applied.

## CKM governance correction

Candidate profile approval and global CKM governance are now explicitly separated:

- canonical matching reads only `approved` roles, competencies and role-competency relationships;
- newly discovered repository knowledge is created as `proposed` with source provenance;
- a newly proposed repository competency is not assigned to an approved candidate-profile capability as though it were already canonical;
- rejected repository objects/relationships are not silently reactivated by a candidate assessment; the shared enrichment service records a governance conflict and skips that proposal path.

This preserves the distinction between user-approved profile knowledge and globally governed repository knowledge.

## Appendix 5 provision

This increment does not implement the `Update My Career Profile` / continuous-experience UI. It does avoid hard-coding the capability foundation to CV-only acquisition. New identity/evidence/ambiguity records are assessment-scoped with role association optional where appropriate, so a future Career Experience source does not have to be modelled as a new employment role.

The dedicated `CareerExperience` model remains deferred until that feature enters implementation scope; introducing it now would be speculative.

## Production Gate mapping

- **Gate 1 — Architecture:** directly affected. Common server boundaries and thin acquisition routes have been introduced; current/target architecture is documented.
- **Gate 2 — Credentials:** reviewed only. Provider credentials remain server-side; repository-history scanning, credential inventory and rotation evidence are outside this increment.
- **Gate 3 — Authentication/data access:** directly affected. Shared server authentication and object-level role ownership controls are used for protected role mutations.
- **Gate 4 — Code quality:** directly affected. High-risk duplicated lifecycle logic was extracted; schemas and focused automated tests were added. Full dependency-backed quality checks must still be executed in a complete install.
- **Gate 5 — Reliability:** directly affected. Input/AI-output validation, time bounds, size bounds, lifecycle checks, safe errors, repeat-completion handling and correlation IDs were added. Transactionality/idempotency under concurrent writes remains incomplete.
- **Gate 6 — Privacy/security:** reviewed for logging/minimisation only. Formal privacy/security artefacts and release approval remain outside this increment.

## Next migration work packages

1. Apply and verify the additive capability-intelligence migration in a controlled non-production database.
2. Implement the Capability Identity Decision Record application service and make split/subsume decisions durable before E0-E3 becomes authoritative.
3. Implement role-by-role E0-E3/Not Applicable evidence persistence, independent question targeting and evidence links.
4. Add current-application, currency and ambiguity assessment to the career-level projection without overwriting historical role evidence.
5. Introduce database transaction/idempotency controls around final role promotion, profile snapshot rebuild and repository proposal writes.
6. Add database-backed integration tests for authentication, object-level authorisation, repeated submissions, concurrent updates and partial-write recovery.
7. Add operational rate/cost controls and monitoring around the AI gateway.
8. Add the Appendix 5 Career Experience acquisition model/journey when explicitly brought into implementation scope.

## Known limitations / residual risks

- Candidate profile promotion is deliberately repeatable but is not yet one atomic database transaction. A mid-operation database failure can therefore leave partial state requiring retry/reconciliation.
- Two truly concurrent first-time submissions can still perform duplicate final AI checks before database uniqueness/lifecycle controls converge. Completed-role replay avoids later duplicate provider calls, but full request-level idempotency remains outstanding.
- Clarification persistence is not transactional across answer, evaluation, staged capability and follow-up writes.
- Provider timeout bounds the application wait, but the underlying Gemini request is not actively aborted by the current SDK wrapper.
- No provider retry is performed in this increment. Retry/cost/rate policy requires an operational decision.
- The new capability-intelligence migration is not yet consumed as authoritative runtime persistence; the Intelligence Contract is therefore only partially implemented.
- `strict` TypeScript mode remains disabled to avoid combining this focused restructure with a whole-codebase strictness migration.

## Configuration introduced

The following non-secret environment settings are optional and have defaults:

- `GEMINI_MODEL` — provider model identifier.
- `CAREER_AI_TIMEOUT_MS` — maximum application wait for a provider call; default 45 seconds.
- `CAREER_CV_MAX_FILE_BYTES` — server-side upload-size limit; default 10 MiB.
- `CAREER_CV_MAX_TEXT_CHARS` — extracted CV text ceiling; default 200,000 characters.

`GEMINI_API_KEY` remains a server-side secret and is not exposed to the client.

## Migration / rollback

1. Install dependencies from the committed lockfile in an environment with package-registry access.
2. Run `npm test`, `npm run verify:ci-structure`, `npm run lint`, `tsc --noEmit` and `npm run build` before deployment.
3. Regression-test the existing CV and no-CV journeys against the current schema before applying the additive migration; the current runtime does not depend on the new tables/columns.
4. Review and apply `migrations/20260917_capability_intelligence_foundation.sql` in a controlled non-production environment.
5. Validate constraints/indexes and existing Phase 1 records after migration.
6. Implement and test Identity Decision Record/E0-E3 persistence before enabling those fields as authoritative profile intelligence.
7. The migration is additive, so application rollback does not require immediate schema rollback. Once new identity/evidence data is written, dropping the new structures would be destructive and must be handled as a separate data migration.

## TypeScript configuration note

The supplied repository context did not contain a `tsconfig.json` even though the application uses TypeScript and `@/` path aliases. A standard Next.js-compatible configuration is included so build behaviour and test imports are explicit. `strict` remains `false` in this increment; enabling it should be a separate Gate 4 remediation with its own defect/test cycle.
