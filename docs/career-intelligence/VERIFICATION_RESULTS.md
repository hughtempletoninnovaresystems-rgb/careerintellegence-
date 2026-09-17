# Verification Results — Baseline Restructure Increment 1

Date: 2026-09-17

This report records checks actually executed in the preparation environment. It does not assert that any Production Readiness Gate has passed.

## Completed checks

### Structural verification

Command:

```text
node scripts/verify-career-intelligence-structure.mjs
```

Result: **PASS** — 20 required Career Intelligence files were present and both route adapters were checked for the expected shared-module boundaries.

### TypeScript/TSX syntax parse

All `.ts` and `.tsx` files in the supplied/restructured project were parsed with the TypeScript compiler parser, excluding `node_modules` and build output.

Result: **PASS** — 76 TypeScript/TSX files parsed; 0 syntax failures.

This is a syntax check only. It is not equivalent to `tsc --noEmit` because project dependencies were not fully available in the execution environment.

### Local import resolution

A static local-import check was run for relative imports and `@/` project aliases.

Result: **PASS** — 0 unresolved project-local imports.

### Supplied-tree secret-pattern scan

The supplied working tree was scanned for common embedded-secret patterns while excluding dependency/build output and without printing any discovered value.

Result: **PASS for the supplied working tree** — 0 potential hard-coded secret patterns were identified by this limited scan.

This is not a repository-history scan and therefore does not satisfy Gate 2.2 by itself.

### Focused Node tests

Command:

```text
npm test
```

Observed result before dependencies were available:

- correlation-id tests: PASS;
- workflow-transition tests: PASS;
- request-validation and AI-output tests: NOT EXECUTED successfully because the local dependency install was incomplete and `zod` could not be resolved.

Overall command result: **FAIL / ENVIRONMENT BLOCKED**, not an implementation failure established by the available evidence.

### Dependency installation

Attempted:

```text
npm ci
```

and a focused `zod` installation attempt.

Result: **NOT COMPLETED** — package installation timed out in the execution environment, leaving an incomplete `node_modules`. No dependency files from that partial install are included in the delivery ZIP.

## Checks not verified in this environment

The following still need to be run in a normal project environment with dependencies installed from the committed lockfile:

```text
npm ci
npm test
npm run verify:ci-structure
npm run lint
npx tsc --noEmit
npm run prettier:check
npm run build
```

Database-backed integration/E2E tests also remain required before promotion because this environment was not connected to the project database, authentication service or Gemini account.

## Production-readiness interpretation

These results provide implementation evidence for part of Gates 1, 3, 4 and 5 only. They do not establish any gate as complete. In particular, Gate 3 object-level access still requires negative integration tests, Gate 4 requires full dependency-backed quality/build execution, Gate 5 requires database/concurrency/failure testing, and Gates 2/6 require their wider documented assurance activities.
