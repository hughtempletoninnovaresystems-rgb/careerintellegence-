# Career Intelligence

Career Intelligence is a Next.js App Router prototype being restructured toward a production candidate. The current implementation supports CV-led and manual/no-CV career assessment journeys, role-by-role evidence enrichment, capability review and candidate-profile promotion.

## Technology baseline

- Next.js 14 / React 18
- NextAuth v5 credentials authentication
- Vercel PostgreSQL (`@vercel/postgres`)
- Gemini through `@google/genai`
- PDF/DOCX text extraction using `pdf-extraction` and `mammoth`

## Local setup

1. Install the locked dependencies with `npm ci`.
2. Configure the development database and authentication environment required by the existing Vercel/NextAuth setup.
3. Configure `GEMINI_API_KEY` as a server-side secret. Do not expose it through client-side environment variables.
4. Run `npm run dev`.

Optional Career Intelligence operational configuration is documented in `docs/career-intelligence/BASELINE_RESTRUCTURE.md`.

## Quality commands

- `npm run lint` — Next.js/ESLint checks.
- `npm run test` — Career Intelligence unit tests using the Node 22 test runner and type stripping.
- `npm run prettier:check` — formatting check.
- `npm run build` — production build/type integration check.

A successful command does not by itself constitute production approval. Production readiness is assessed against the six documented gates.

## Architecture and migration

- `docs/career-intelligence/CURRENT_ARCHITECTURE.md`
- `docs/career-intelligence/TARGET_ARCHITECTURE.md`
- `docs/career-intelligence/BASELINE_RESTRUCTURE.md`
- `docs/career-intelligence/GATE_IMPACT.md`

The additive capability-intelligence schema foundation is in `migrations/20260917_capability_intelligence_foundation.sql`. It must be reviewed and applied through the deployment/database change process; it is not executed automatically by application startup.
