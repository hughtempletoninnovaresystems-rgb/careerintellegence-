# R08 edit-capability AI validation fix

## Failure addressed

The shared Gemini JSON parser raises `AIProviderError` when model output is malformed or fails Zod validation. Both CV and manual-role reassessment prompts allow empty clarification strings for non-clarification outcomes, but their prior schemas incorrectly demanded a non-empty clarification question whenever the clarification object was present. This could cause an otherwise legitimate edit to fail before the database update.

The specific payload behind correlation ID `06dbadc5-8632-4e87-bb1b-ac0a8e87edb5` could not be recovered from the uploaded archive, so this is a code-grounded failure mode rather than a claim about the exact model output for that request.

## Changes

- `app/lib/career-intelligence/ai/schemas.ts`: one shared, outcome-conditional reassessment schema for CV and no-CV edits. Demonstrated output requires assessed evidence; clarification output requires a non-blank question; a gap may have empty model-authored evidence.
- `app/api/analyse-cv/route.ts` and `app/api/no-cv/route.ts`: use the shared schema and retain the candidate's exact submitted evidence if a non-demonstrated outcome has an empty AI-authored evidence field. The persisted edited name, edited evidence, and SQL parameters are unchanged.
- `app/api/no-cv/route.ts`: correct U+00A0 SQL indentation in all six reassessment SQL blocks, matching the previous CV fix.
- `app/lib/career-intelligence/ai/provider.ts`: request `application/json`, retry an invalid JSON/schema response at most once with a corrective prompt, and audit each invocation. Only error type and Zod field paths are logged, never source evidence or raw model text.
- `app/lib/career-intelligence/ai/parse-json.ts`: distinguish JSON syntax failures from schema mismatches in safe diagnostic metadata.
- `tests/career-intelligence/edited-capability-ai.test.ts`: regression coverage for demonstrated/gap/clarification cases, malformed JSON and SQL whitespace.

## Checks run in this environment

- Source syntax checked with TypeScript `transpileModule` for all edited TS files: passed.
- `npm run verify:ci-structure`: passed.
- `npm test`: 7 tests passed; 3 tests could not execute because dependencies, including `zod`, are not installed in the uploaded project and package install could not complete in this environment.
- For each reassessment function, all six SQL blocks contain zero U+00A0 characters, with the same SQL interpolation expressions as the input archive.

## Remaining live acceptance checks

With the project's dependencies and environment available: `npm ci && npm test && npm run build`.
Deploy using the existing Bitbucket/Vercel pipeline, then edit an R08 capability and save. Confirm the API returns success, refresh and make a new read from PostgreSQL, and verify the edited name/evidence and reassessment outcome persist before testing role completion. No Neon write/read or deployment was performed in this environment.

To inspect the audit context without exposing candidate data:

```sql
SELECT created_at, operation, requested_model, actual_model,
       outcome, error_code, elapsed_ms
FROM career_ai_invocations
WHERE operation IN ('cv_capability_edit_reassessment',
                    'manual_capability_edit_reassessment')
ORDER BY created_at DESC
LIMIT 20;
```
