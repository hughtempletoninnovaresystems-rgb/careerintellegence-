# Knowledge and Experience pages

New routes:

- `/dashboard/experience` — searchable, filterable career timeline (All / Current / Needs Attention); **Add Experience** opens the existing manual assessment flow.
- `/dashboard/experience/[id]` — owned role workspace with Overview, Capabilities, Knowledge and Evidence tabs.
- `/dashboard/knowledge` — searchable, filterable areas grouped under display-only domain headings.
- `/dashboard/knowledge/[id]` — knowledge relationships, related capability links, recorded role context and evidence, with expandable evidence list.

These pages share the existing violet/slate Tailwind design of Capabilities, the dashboard navigation, and the same signed-in user's `career_assessments` ownership scoping. No demo records are inserted.

## Existing schema mapping

- The existing app does not yet have a dedicated CareerExperience table. Timeline entries are `career_role_assessments` (employment roles). A separate experience/evidence-acquisition model will need its own migration and workflow when implemented.
- There is no standalone persisted knowledge-area/domain taxonomy in the supplied project. The Knowledge page uses distinct canonical `competencies` that are actually referenced by the user's `career_role_capabilities`, matching how the existing Career Profile counts knowledge. Domains are *display-only suggested name-based groupings*, not stored facts.
- Evidence is read from `career_capability_evidence_links` with `is_current = TRUE` and `career_capability_evidence`. Counts and links are user-scoped.
- Add Experience launches the existing manual assessment form at `/dashboard?source=manual`. It does not silently mutate the database. Completion uses the current manual assessment API.

## Prerequisites

Deploy with your existing Postgres schema and previously required Career Intelligence migrations. These pages do not add tables or change any existing schema. Signed-in access and a working `POSTGRES_URL` / Vercel Postgres configuration are required.
