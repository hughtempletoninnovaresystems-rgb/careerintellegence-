# Career Intelligence – Work Pack v1.2 implementation return

**Prepared:** 20 October 2026  
**Basis:** the attached `project.zip` checkout and supplied second text document, work pack revision 1.2 (19 October 2026).  
**Status:** amended source archive, **not** a tested deployment or approved new Intelligence Contract release.

## Change summary and release disposition

| Work pack | Implemented in this archive | Not closed / verification required |
|---|---|---|
| Track A – R08 | Lexical leading `U+00A0` indentation in `reassessEditedCapability` corrected in both `analyse-cv` and `no-cv` routes. SQL parameter values were not rewritten. | Live PostgreSQL execution of every lookup/update/count branch; preservation of an evidence value containing `U+00A0`; R08 real save/reload; deployed build/commit. Original SQL interiors already had no NBSP in the inspected edit handler. |
| Track B – DEF-0009 | Clarification evaluation requires nullable `followUpQuestion`/`followUpReason`; required substantive pair for further clarification; full result coverage and stable target-name check; bounded one correction prompt; per-attempt provider auditing; one transaction for question updates, answer inserts, capability/evidence changes, next questions, lifecycle and success-gates. Retry rejects already-answered questions. | Real failure injection, second-round replay, concurrent tabs, post-commit timeout reconciliation and PostgreSQL validation. Current frozen occupational *definitions* are not provably stored; legacy target row IDs/names/revision numbers are contextual, not equivalent to revised frozen identity definitions. |
| Track B – semantics | A legacy `gap` clarification no longer sets *contradictory* evidence or automatically accepts review. Emerging capabilities are staged as unassessed `signal`; new evidence on an existing identity is retained as context. Closed/unresolved gap evidence blocks role completion pending manual resolution. | Review UI / completion policy must be jointly signed off; avoid presenting legacy gap as independent inability. |
| Track C – revised IC | Provider-neutral **draft** policy is in `domain/revised-intelligence-contract.ts`; versioned CI-AI-12 logical Zod contract and semantic cross-references in `ai/revised-contract.ts`; isolated preview in `services/revised-pilot.ts`; explicitly gated OpenAI Responses adapter with structured JSON schema plus server validation. Existing live shared policy is unchanged. | No approved schema mapping, physical migration, mixed-version readers, semantic six-case fixtures, frozen R09 pilot, API benchmarking or production provider switch. No new E0–E3 production persistence is claimed. |
| Track D – UX | Shared `useCareerProcessing` hook: synchronous ref lock and action-specific busy text; CV upload, manual assessment, answer, review, edit, role context, candidate addition and role-completion actions use shared state. Buttons and relevant input fields disable while processing. Accessible live processing message and reduced-motion spinner. Candidate wording from Appendix A placed in the mounted assessment view. | True status reconciliation of **uncertain network/timeout outcomes**, success fresh-read verification on all actions, keyboard/assistive E2E coverage, all future non-journey processing screens. Do not interpret existing HTTP success alone as R08 proof. |
| Candidate correction/add/removal | `add_capability` POST in both routes uses an ownership-checked, duplicate-safe transaction. New candidate statements are unassessed `signal` rows with contextual provenance, and are shown for reassessment; existing edit/reject flows retained. | Confirm the new action against deployed DB constraints and assess candidate-approval semantics before release. |

## Changed implementation anchors

- `app/api/analyse-cv/route.ts`, `app/api/no-cv/route.ts`
- `app/lib/career-intelligence/ai/{schemas,provider,openai-adapter,revised-contract}.ts`
- `app/lib/career-intelligence/domain/revised-intelligence-contract.ts`
- `app/lib/career-intelligence/services/{clarification,candidate-capability,revised-pilot,role-submission}.ts`
- `app/lib/career-intelligence/data/{staging,repository}.ts`
- `app/lib/career-intelligence/http/request-schemas.ts`
- `app/lib/career-intelligence/types.ts`
- `app/ui/dashboard/{cvupload,use-career-processing}.tsx` (the hook is `.ts`, not `.tsx`)
- Test updates and implementation records in `tests/career-intelligence` and `docs/career-intelligence`.

## Processing inventory – mounted Career Intelligence journey

| Action | Mounted UI handler | Server handler | Busy text | Lock / outcome |
|---|---|---|---|---|
| Upload CV | `uploadCV` | `/api/analyse-cv` multipart | Reading your CV and identifying your career history… | Buttons/inputs locked, message on error, client state populated after response |
| Start no-CV | `startManualAssessment` | `/api/no-cv`, `start_manual` | Assessing the information provided for this role… | Same lock and role update |
| Submit answers | `assessClarificationAnswers` | both routes `assess_role` | Assessing and recording your responses… | Transaction/server stale guard; preserve typed responses on failure |
| Accept/reject | `reviewCapability` | both routes `review_capability` | Checking and recording your review decision… | Lock/visible failure, review remains server-authoritative |
| Edit evidence | `saveCapabilityEdit` | both routes `review_capability` `edited` | Checking and recording your changes… | Lock, input preserved; actual R08 reload must still be run |
| Add evidence identity | `addCapabilityProposal` | both routes `add_capability` | Recording your capability statement for assessment… | Unassessed proposal, duplicate check, no automatic approval |
| Save role context | `saveRoleContext` | both routes `update_role_context` | Checking and recording your role information… | Lock and server result |
| Complete role | `submitRole` | both routes `submit_role` | Compiling and recording your responses for this role… | Lock and server transaction; existing optimistic result checks need deployed proof |

**CI-UX-001 – standing rule:** Every newly added processing action should use shared immediate screen-local busy state, prevent conflicting inputs and double clicks, show labelled progress with accessible live status, preserve typed input, and distinguish confirmed success, known failure and unknown commit outcome. Before considering this rule fully implemented, add server operation-ID status/readback reconciliation for timeout-after-commit and extend coverage beyond the mounted journey.

## Revised-IC mapping gate – do not apply speculative DDL

The supplied migrations suggest a number of existing capabilities: `career_role_capabilities.evidence_state`, `career_capability_identity_decisions`, `career_capability_evidence`, `career_capability_evidence_links`, `career_question_capability_targets`, `career_capability_ambiguities` and `career_ai_invocations`. These are **repository claims only**, not evidence that the deployed database matches.

Before permitting revised-IC writes, inspect the current branch and deployed PostgreSQL catalog for column types/defaults, checks, indexes, triggers, RLS/grants and migration state. Approve a field-by-field mapping for definition revisions, E0–E3 vs grade-null holds, supplemental holds, unresolved mapping, governance decisions, materiality, source attribution, idempotency, review revisions and stored policy/model versions. Then deliver additive DDL/rollback and mixed-version reader changes. Do not infer E0–E3 from legacy `demonstrated`, `gap`, `confidence` or older evidence labels.

## Pilot flags and safety

**Live default stays Gemini and legacy policy.** The new preview service is not wired to the customer-facing route. `runRevisedIntelligencePreview` requires `CAREER_REVISED_PILOT_ENABLED=true`. OpenAI comparison additionally requires `CAREER_OPENAI_PILOT_ENABLED=true`, `OPENAI_API_KEY` and an independently verified `OPENAI_MODEL` API identifier. Passing `pilotProvider: "openai"` is explicit; merely configuring a provider environment variable does not switch production. Never enable before gate reviews. Compare identical frozen sources and reviewed controls; do not use historic R06/R07 answers in the R09 CV-only fixture.

## Local check record

- Passed: `node scripts/verify-career-intelligence-structure.mjs` (26 required files, 2 routes).
- Passed: `node --experimental-strip-types --test tests/career-intelligence/workflow.test.ts` (2 tests).
- Passed: all app/test `.ts`/`.tsx` source files parsed by locally installed TypeScript parser without syntax diagnostics (this is **not** type-checking).
- Blocked: `npm ci` failed with network `EAI_AGAIN` resolving npm registry packages; dependencies were not installed. As a result, full `npm test`, `npm run lint`, `tsc --noEmit` and `npm run build` cannot be reported passed.
- Blocked: PostgreSQL/deployed environment, API credentials and confidential reviewed R09/C01–C06 fixtures are not provided. No live DB or provider execution was performed.

### Next acceptance sequence

1. Install dependencies using access to npm; run build/type/lint and all unit tests. Resolve errors before deploy.
2. Compare live schema and deployed commit; review additive DDL/mapping separately.
3. Execute R08 edit/save/reload and real `U+00A0` evidence preservation on an isolated PostgreSQL branch.
4. Run DEF-0009 sufficient/insufficient/emerging tests; inject mutation failure mid-transaction; test duplicate and stale requests.
5. Run UI slow-response, timeout-after-commit, reduced-motion, keyboard and focus checks; add server readback and operation-status reconciliation.
6. Approve revised-IC completion eligibility matrix; run bounded OpenAI/Gemini pilot with frozen controls and record model, tokens/cost/latency, source fidelity, grades, and mismatches.
7. Authorise production feature flags only after acceptance and rollback rehearsal.

**No release gate is declared passed by this archive.**
