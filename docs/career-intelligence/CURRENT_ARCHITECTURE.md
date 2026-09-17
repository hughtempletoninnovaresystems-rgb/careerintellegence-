# Career Intelligence Current-State Architecture — After Baseline Restructure Increment 1

The supplied repository is a **Next.js 14 App Router** application. React runs through Next.js; Career Intelligence API endpoints are server-side App Router route handlers.

```text
Browser
  |
  | HTTPS / Next.js fetch
  v
app/ui/dashboard/cvupload.tsx
  |
  +----------------------------+
  |                            |
  v                            v
/api/analyse-cv             /api/no-cv
CV acquisition             Manual acquisition
  |                            |
  +-------------+--------------+
                |
                v
     app/lib/career-intelligence
                |
     +----------+-----------+--------------------+
     |          |           |                    |
     v          v           v                    v
 Auth/ACL    Services    Data access          AI gateway
               |           |                    |
               |           v                    v
               |       PostgreSQL            Gemini
               |
               +-- clarification
               +-- capability review
               +-- role context
               +-- final review
               +-- role submission
               +-- candidate profile promotion
               +-- CKM proposal enrichment
```

## Authentication

NextAuth v5 credentials authentication resolves the signed-in identity server-side. Career Intelligence services resolve the database user ID from the authenticated session. Object-level role operations use a shared ownership query joining `career_role_assessments` to `career_assessments.user_id`.

## Information exchanged

- Browser -> API: CV file or manually entered career/role information, clarification answers, capability review decisions and role edits.
- API -> document extraction: uploaded bytes; extraction is transient in the request process.
- API -> AI gateway: career/role context and evidence required for the bounded assessment task.
- AI gateway -> Gemini: prompt and bounded assessment content; credentials remain server-side.
- Services -> PostgreSQL: assessment state, role state, staged capabilities, questions/answers, success gates, profile snapshots and CKM proposals.
- API -> browser: existing CV/manual response shapes plus safe errors/correlation identifiers.

## File storage

No persistent CV file-storage service is present. Uploaded documents are processed in memory and discarded after request handling. If original-document retention becomes a requirement, storage, encryption/access, retention, export and deletion require a separate Gate 6 design decision.

## Remaining architectural weaknesses / uncertainties

- Final profile/repository promotion consists of multiple database statements and is not yet transactional.
- Clarification assessment is also multi-write and non-transactional.
- Complete request-level idempotency/concurrency control is not yet implemented for first-time simultaneous submissions.
- Capability Identity Decision Records and E0-E3/current-application/currency persistence are schema foundations only, not authoritative runtime state.
- Operational rate/cost controls and production monitoring are not implemented by this increment.
- The existing authentication model is candidate-focused; administrator/recruiter/enterprise roles and permissions require separate definition if in MVP scope.
