# Knowledge + Evidence database/view fix

## Why the previous Knowledge page showed incomplete information

The original query only read `career_role_capabilities.canonical_competency_id`, missing the authoritative saved user-knowledge flow in `candidate_knowledge` and its `knowledge_evidence` records.

## Implemented

- `/dashboard/knowledge` and `/dashboard/knowledge/[id]` now include persisted `candidate_knowledge` and its `competencies`, `roles`, `confidence` and `knowledge_evidence`; assessment-linked competencies and active profile capabilities supplement that data. The UI identifies knowledge actually stored in `candidate_knowledge`.
- `/dashboard/evidence` provides search and filters for experience, capability, source and status; grouped evidence cards; and traceable detail links.
- `/dashboard/evidence/[id]` exposes full evidence text, source, related experience, related capabilities and knowledge, current/historical relationships, source-answer evaluation (when available), and explicitly missing assessment quality fields (never invented).
- Evidence includes records from `career_capability_evidence` + its links, `knowledge_evidence` + `candidate_knowledge`, and non-empty evidence stored on active `candidate_profile_role_capabilities`. Records are identified as `career-UUID`, `knowledge-UUID`, or `profile-UUID`.
- Profile and Experience knowledge/evidence counts now include saved user knowledge/evidence as appropriate; capability/role/knowledge evidence links open the new evidence details.
- SQL remains in `app/lib/career-intelligence/data`; data queries are scoped to the authenticated user.

## Important interpretation

The schema has **no separate knowledge domain taxonomy**. Existing domain headings remain heuristic UI groupings, **not** persisted classifications.

The schema also has **no independent evidence approval or quality rating** columns. "Linked to reviewed capability" is derived from the capability review status; quality, context, action and outcome ratings are shown as "Not recorded" unless provided in the original evidence provenance. The audit trail includes historical/superseded links.

No migrations and no database writes are part of this update.

## Validation

`npm run verify:ci-structure` and `node scripts/verify-career-evidence-knowledge.mjs` pass. TypeScript/TSX syntax parsing passes on the changed files. Full dependency-backed Next.js build and integration tests require installing package dependencies and access to the Postgres database.
