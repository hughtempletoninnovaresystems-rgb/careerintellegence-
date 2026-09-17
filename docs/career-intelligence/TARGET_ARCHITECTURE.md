# Career Intelligence Target Production Architecture

```text
Browser / presentation
        |
        | authenticated application requests
        v
Next.js route adapters
  +-- analyse-cv: document/CV acquisition
  +-- no-cv: manual career acquisition
  +-- future experience acquisition
        |
        v
Career Intelligence application services
        |
        +-- Capability Identity Service
        +-- Evidence Assessment / Enrichment Service
        +-- Capability Review Service
        +-- Career Profile Promotion Service
        +-- CKM Proposal / Governance Service
        +-- Workflow / Assurance Service
        |
   +----+----------------------+------------------+
   |                           |                  |
   v                           v                  v
Data-access layer          AI gateway       Audit/observability
(PostgreSQL)              provider-neutral
                               |
                               v
                         Gemini adapter
                         future adapters
```

## Responsibility rules

- Browser: presentation, interaction and convenience validation only.
- Route adapters: authentication entry, request parsing/validation, acquisition-specific mapping and safe HTTP response mapping.
- Application services: workflow orchestration and business rules independent from CV/manual transport shape.
- Domain: capability identity, evidence semantics, lifecycle transitions and approval rules.
- Data layer: SQL/persistence and object ownership queries.
- AI gateway: provider-specific calls, timeout, output parsing/schema validation and later usage/cost controls.
- CKM governance: global repository proposal/approval remains distinct from candidate profile approval.

## Appendix 5 boundary

The future continuous-profile journey is another acquisition adapter into the same evidence/capability lifecycle. A Role is employment context; an Experience is a separate source of evidence. The target architecture must support:

`Person -> Role Instance -> Career Experience -> Evidence -> Capability assessment`

without requiring a new role for every experience. The dedicated Experience data model is deferred until that journey is implemented.
