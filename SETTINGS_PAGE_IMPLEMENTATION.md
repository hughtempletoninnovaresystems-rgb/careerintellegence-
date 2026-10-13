# Career Intelligence Settings page (no subscription or billing code)

## Included

- `/dashboard/settings`: responsive Settings page, using existing Tailwind dashboard styling and sidebar link.
- Profile: update the signed-in user's display name. Email is read-only (a secure email-change verification workflow is not yet implemented).
- Security: password change requires the current password, validates minimum 12 characters / <= 72 UTF-8 bytes, and stores a bcrypt hash. It does **not** revoke other existing login sessions.
- Assessment preference: saves preferred target role (does **not** prefill legacy CV/no-CV workflows yet).
- Privacy: authenticated user-scoped JSON **career snapshot**, not a complete subject access export. Includes recorded assessments, role assessments, capabilities, career evidence, candidate knowledge, and promoted profile information.
- Notifications: informational state only; no fake delivery switch without a notification system.
- Accessibility: `reduce_motion` setting persisted server-side and mirrored in local browser storage to apply CSS across dashboard navigation. OS `prefers-reduced-motion` is respected regardless.
- All settings API endpoints derive the user from the authenticated session via `getAuthenticatedUserId`. No client-supplied IDs.
- `app/dashboard/profile/page.tsx` now obtains the current name from the database, so profile edits appear on a fresh read even if NextAuth's JWT retains the old display name.

## Prerequisite database migration

Run the additive `migrations/20261013_user_settings.sql` against the Neon database before deploying the updated page. The table must exist before settings requests succeed.

## New routes

- `GET /api/settings`
- `PATCH /api/settings` with `{ "section": "profile", "name": "...", "preferredRoleTitle": "..." }` or `{ "section": "appearance", "reduceMotion": true }`
- `POST /api/settings/password` with `{ "currentPassword": "...", "newPassword": "..." }`
- `GET /api/settings/export` (downloads JSON)

## Verification

Run:

```sh
npm ci
npm run verify:ci-structure
npm test
npm run build
```

Test on a provisioned staging database: log in, save name + target role, refresh and confirm persistence; try a wrong and a correct current password; verify old password cannot authenticate, new password can; export a JSON snapshot and verify all rows belong to that user; toggle reduced motion, navigate, and refresh. Check a second account cannot read or edit the first account's data.

No live database or deployment credentials were provided with the archive. Live database, session, and end-to-end tests were **not** performed. The local dependency installation is unavailable here; a successful production build is **not claimed**.

No Stripe, subscription or billing functionality was added.
