# Shared UI components

Framework: React 19 with Next.js 16 App Router.

The current frontend has no shared UI primitive directory and no reusable Button, Field, Dialog, Card, Table, navigation, or shell component. Existing visual elements are page-local JSX styled by CSS Modules. PAY-W5-02 will introduce the shared component layer after the W5-01 direction is approved.

Page-specific components intentionally excluded:

- `apps/web/src/app/(admin)/attendance/review-panel.tsx` — attendance workflow container, not a shared primitive.

There is therefore no shared component source to reproduce in this initialization snapshot.
