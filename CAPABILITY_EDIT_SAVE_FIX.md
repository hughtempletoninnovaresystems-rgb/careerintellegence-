# Capability edit/save fix

## Root cause

The CV capability edit reassessment writes material changes directly to `career_role_capabilities`. The database revision trigger advances `revision_no` on material changes and resets `review_status` to `proposed` unless `reviewed_revision_no` is set to the next revision in the same update. This meant an edit that GIAS successfully reassessed as demonstrated (or as an accepted gap) could be saved but immediately become unreviewed, preventing role submission/completion.

## Changes

- `app/api/analyse-cv/route.ts`: for a demonstrated edit, persist `review_status = 'edited'` and `reviewed_revision_no = revision_no + 1` in the same update so the revision trigger preserves the reviewed state. For an assessed gap, similarly set `reviewed_revision_no = revision_no + 1` alongside `review_status = 'accepted'`. Edits needing clarification remain proposed and must be clarified before submission.
- `app/ui/dashboard/cvupload.tsx`: validate that edited evidence is non-empty before sending the save request, showing a clear message instead of submitting a request the API must reject.

## Verification

`npm run verify:ci-structure` passes. A full `next build` still needs to be run after installing dependencies and configuring the application's environment/database.
