# Career Intelligence SQL organisation

All **read-only dashboard SQL** for Profile, Capabilities, Experience,
Knowledge and Evidence is now kept under `app/lib/career-intelligence/data/`.
This is a code organisation change, not a database migration.

| Data module | Queries |
| --- | --- |
| `profile.ts` | Profile role timeline, capability/review counts, knowledge totals; calls `evidence.ts` for the evidence total. |
| `capabilities.ts` | Capability list, capability detail, capability-role relationships, and capabilities linked to a knowledge area. |
| `evidence.ts` | Evidence total, evidence for a capability, experience role, or knowledge area. |
| `experience.ts` | Experience timeline queries, role counts and role lookup. |
| `knowledge.ts` | Knowledge-area queries and role-to-knowledge relationships. |
| `domain/career-display.ts` | Shared client-safe date formatting, evidence attention helpers and suggested domain grouping (no SQL). |

## Dashboard integration

- `/dashboard/profile` calls `getCareerProfileData()`.
- `/dashboard/capabilities` calls `getCapabilities()`.
- `/dashboard/capabilities/[id]` calls `getCapabilityDetail(id)`; the detail
  query uses `getCapabilityEvidence()` in the evidence module.
- `/dashboard/experience` and its detail route use `data/experience.ts`; the
  role workspace also imports relationship queries directly from their owning modules.
- `/dashboard/knowledge` and its detail route use `data/knowledge.ts`;
  relevant capability/evidence queries come from their own modules.

Queries still use parameterised `@vercel/postgres` templates and
`getAuthenticatedUserId()` to scope reads to the current user.
No SQL statements or database tables have been added/altered. This change does
not introduce a standalone `/dashboard/evidence` page; evidence continues to
appear where it did before, in capability, experience and knowledge views.

Run `npm run verify:ci-structure` for architecture checks. To compile/run the
app, first install its project dependencies and configure Postgres and auth.
