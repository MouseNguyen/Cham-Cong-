# Page dependency trees

## / — Home

Entry: `apps/web/src/app/page.tsx`

Dependencies:

- `apps/web/src/app/layout.tsx`

## /login — Authentication

Entry: `apps/web/src/app/login/page.tsx`

Dependencies:

- `apps/web/src/app/login/auth.module.css`
- `apps/web/src/app/layout.tsx`
- external: `next/link`, `next/navigation`, React

## /login/totp — Fresh MFA

Entry: `apps/web/src/app/login/totp/page.tsx`

Dependencies:

- `apps/web/src/app/login/auth.module.css`
- `apps/web/src/app/layout.tsx`
- external: `next/link`, `next/navigation`, React

## /attendance — Attendance review

Entry: `apps/web/src/app/(admin)/attendance/page.tsx`

Dependencies:

- `apps/web/src/app/(admin)/attendance/review-panel.tsx`
  - `apps/web/src/app/(admin)/attendance/review.module.css`
  - `packages/contracts/src/attendance-review.ts` (types only)
  - external: `next/link`, React
- `apps/web/src/app/layout.tsx`

The future dashboard, employee, pay-run, calculation-detail, and release screens are new targets. The attendance page is the closest existing operational-flow anchor, while login is the closest compact form anchor.
