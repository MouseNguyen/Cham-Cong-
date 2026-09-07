# Route map

The app uses the Next.js 16 App Router. There is no separate router configuration.

| URL | Entry file | Layout | Current purpose |
| --- | --- | --- | --- |
| `/` | `apps/web/src/app/page.tsx` | RootLayout | Minimal product/runtime landing page |
| `/login` | `apps/web/src/app/login/page.tsx` | RootLayout | Email/password sign-in and authenticated-session summary |
| `/login/totp` | `apps/web/src/app/login/totp/page.tsx` | RootLayout | Six-digit TOTP verification |
| `/attendance` | `apps/web/src/app/(admin)/attendance/page.tsx` | RootLayout | Accountant/owner attendance review and snapshot finalization |
| `/api/auth/*` | `apps/web/src/app/api/auth/*/route.ts` | none | Authentication service endpoints |
| `/api/attendance` | `apps/web/src/app/api/attendance/route.ts` | none | Attendance query and command endpoint |
| `/api/health` | `apps/web/src/app/api/health/route.ts` | none | Local health endpoint |

Planned W5 pages do not exist yet and must use the new-target-in-existing-codebase Superdesign route.
