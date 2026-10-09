# Career Intelligence – provenance and review-integrity patch

Prepared from the supplied `src.zip` source tree. This is a source patch and SQL migration, not a deployment or a live-database change.

## What changed

- Added `app/lib/career-intelligence/services/provenance.ts` to create evidence records, link each record to a specific capability, retain superseded links, and hash the exact capability/review content.
- New capabilities are inserted together with their initial evidence link in one connected PostgreSQL transaction.
- Clarification answers now retain the database answer UUID and link the resulting supporting/contradictory evidence to both the actual question and answer. One answer can support more than one capability without inventing a question locator.
- Added capability revisions and reviewed revisions. Material capability changes invalidate the previous review. Evidence-link changes also advance the revision, so swapping the active source link cannot leave an old review eligible. Generic revision snapshots and legacy backfills are retained as contextual history, not counted as independent supporting evidence for promotion.
- Added append-only-by-application review snapshots containing the review actor, revision, content hash and exact supporting evidence IDs. They are written in the same transaction as the review-state update; Accept/Reject preserves previously reassessed edited text instead of reverting to the original proposal.
- Profile promotion now requires a demonstrated, assessed capability, a review of its exact current revision, and at least one current supporting evidence link. Edited capabilities retain the candidate-supplied edited text as a distinct source record, and the edited revision must itself be current and reviewed. Submission is blocked when a demonstrated accepted or edited capability lacks the exact current review or current supporting evidence.
- Final profile promotion locks the role and mutable child rows, reloads the snapshot and success-gate reads through the connected transaction client, and rejects stale state with HTTP 409 / `assessment_state_changed` before promotion.
- AI calls are audited with requested model, the provider-reported actual model/version when supplied, SHA-256 hashes of prompt/output (not raw text), outcome, duration and operation. Assessment/role IDs are attached in the shared clarification and final-review services. The field `actual_model` is left NULL when the provider response does not identify the actual model; it is never guessed from the requested model.
- Added `tests/career-intelligence/provenance.test.ts` for exact-current-review eligibility and content-hash behaviour.

## SQL deployment order

1. Confirm the existing `20260917_capability_intelligence_foundation.sql` migration has been applied to the target database.
2. Review `migrations/20261009_provenance_integrity.sql` against a fresh Neon development/staging branch. The migration is additive and transactional; it does not grant production privileges.
3. Apply the migration using the project's normal migration runner. Do not apply it to production before the schema preflight and backup/recovery review.
4. Deploy this source only after the migration has completed, because capability writes and AI calls now depend on the added columns/tables.
5. In staging, test CV and manual acquisition, clarification links, evidence edits, accept/reject review snapshots, stale-submission rejection and two concurrent submissions using separate PostgreSQL connections.

## Legacy records and limitations

- The migration backfills existing evidence text as `legacy_backfill` with `locatorAvailable=false`. It does not pretend that old text can be mapped to a precise CV line or answer after the fact.
- Existing capability rows deliberately start with `reviewed_revision_no=NULL`. Historical review status alone is not proof that the current text/evidence was reviewed under this revision contract. Review legacy demonstrated capabilities again before promotion.
- AI audit `actual_model` is NULL when the provider response omits a model-version field. Requested model and actual model are separate on purpose.
- Raw prompts, raw model output and API keys are not written into audit tables.
- This patch has not been tested against a live Neon database or a real model response. The three focused provenance tests, 14-file TypeScript syntax/transpile check, and structural verification pass. The full suite is blocked by the missing `zod` dependency (the dependency install could not complete in this environment); a configured TypeScript type check and production build must still be run in your development environment after dependencies are installed.

## Local checks

From the project directory, after setting the real development environment and installing dependencies:

```powershell
npm ci
npm test
npx tsc --noEmit
npm run build
```

Review all changes before committing. `.env` and `.env.local` were intentionally excluded from this ZIP; `.env.example` contains blank values only.
