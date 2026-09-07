# Pay Slip design system

## Product and experience

Pay Slip is a Vietnamese-first internal payroll, attendance, payslip, and delivery application for The Kay’s Gelato. It must feel warm, calm, premium, and trustworthy without resembling a consumer gelato menu. Desktop serves the owner and accountant; the attendance kiosk is a separate touch-first surface for the Android iPOS tablet.

Every screen answers:

1. Đang ở đâu?
2. Có vấn đề gì?
3. Phải làm gì tiếp?

Use one primary action per state. Reveal calculation and rule evidence progressively. Never use decorative charts or celebratory motion to obscure payroll risk.

## Brand identity

- Use the owner-supplied The Kay's Gelato logo from `docs/design/assets/the-kays-gelato-logo.jpg`.
- Source SHA-256: `4f978b7fe2f4299179f2fe57db854816fd3c7d1c8d8ea017a4d6d240fabfbede`.
- Superdesign Brand Asset key: `the-kays-gelato-logo`.
- Canonical render URL: `https://vgbujcuwptvheqijyjbe.supabase.co/storage/v1/object/public/hmac-uploads/projects/d8b04b46-809b-44cf-90ce-b95914f0a081/brand-assets/the-kays-gelato-logo/the-kays-gelato-logo.jpg`.
- Preserve the supplied mark exactly. Do not replace it with initials, emoji, generic ice-cream icons, or invented SVG artwork.
- The source has a large cocoa field around the centered mark. Render it in an overflow-hidden square and center-crop at approximately 3.15x scale so the complete cone-and-scoops mark is legible.

## Selected direction

Direction name: **Sổ vận hành ấm áp**.

The structural source is Superdesign prompt mosaic-grid-architecture-style: thin dividers, ordered rectangular regions, clear alignment, and generous negative space. Do not copy its landing-page hero, technical diagrams, monospace-first typography, high-contrast black treatment, or decorative motion. Product requirements override the source.

## Color tokens

| Token | Value | Use |
| --- | --- | --- |
| --canvas | #F8F4EA | warm cream page background |
| --surface | #FFFDF8 | cards, dialogs, table surfaces |
| --surface-muted | #F1EBDD | secondary panels and inactive rows |
| --ink | #24342E | primary text |
| --ink-muted | #617068 | supporting text |
| --cocoa | #5A4034 | warm headings and brand detail |
| --pistachio-700 | #315C47 | safe primary actions |
| --pistachio-100 | #E5EFE7 | success and selected states |
| --berry-700 | #8A2F46 | destructive/error emphasis only |
| --berry-100 | #F8E7EB | error/blocker background |
| --amber-700 | #76551E | warning text |
| --amber-100 | #FFF1D6 | warning/background attention |
| --line | #D8D1C3 | hairlines and boundaries |
| --focus | #1967D2 | visible keyboard focus |

Text and interactive states must meet WCAG 2.2 AA contrast. Color never carries state alone; pair it with a label and icon.

## Typography

- Primary: self-hosted Be Vietnam Pro only after license and Vietnamese glyph bundle are verified.
- Fallback: system-ui, Segoe UI, Arial, sans-serif.
- No decorative serif and no monospace for normal labels.
- Display: 36/44, weight 650.
- Page title: 28/36, weight 650.
- Section title: 20/28, weight 650.
- Body: 15/24, weight 400.
- Label: 13/20, weight 600.
- Meta: 12/18, weight 500.
- Money: body family with tabular numerals; right aligned.

## Geometry

- 8 px grid.
- Content widths: 1280 px desktop maximum; 720 px focused wizard maximum.
- Spacing: 4, 8, 12, 16, 24, 32, 40, 48, 64 px.
- Radius: 12 px controls/cards; 16 px prominent cards/dialogs; pills only for compact status.
- Border: 1 px line token; use structure before shadow.
- Shadow: 0 8px 28px rgba(36, 52, 46, 0.06) for dialogs and lifted panels only.
- Minimum pointer target: 44 by 44 px; kiosk primary targets: at least 64 px high.

## Application shell

Desktop admin uses a restrained left navigation rail and a top context bar:

- Brand: The Kay’s Gelato / Pay Slip.
- Navigation: Tổng quan, Nhân viên, Bảng công, Kỳ lương, Phiếu lương.
- Top context: workplace, payroll month, actor role, account.
- Main content: cream canvas with one dominant work region and optional evidence drawer.

At widths below 900 px, navigation becomes a compact top bar/drawer and content stacks without horizontal page scroll. Tables may use an explicitly labelled internal scroll region.

The kiosk never renders the admin shell. It uses a full-screen cream surface, shop/device identity, six-digit PIN keypad, and one large Vào ca or Tan ca action.

## Core components

- Button: primary pistachio, secondary surface/line, danger berry. One primary per state.
- Field: persistent label, hint/error association, 48 px minimum height.
- Money: tabular, right aligned; net pay receives strongest hierarchy.
- Status: icon plus plain Vietnamese label; never color alone.
- StepFlow: five fixed pay-run states: Nháp → Đã tính → Chờ duyệt → Đã duyệt → Đã chốt.
- DataTable: readable row density, sticky header only when needed, clear empty/error states.
- Dialog: named consequence, affected pay run/employee, cancel first, confirm last.
- TracePanel: summary first; Xem cách tính reveals inputs, formula lines, rule source, hashes, and versions.
- TaskCard: title, blocker/status, next action, due context; no decorative metrics.

## State language

- Loading: Đang tải…
- Empty: say what is absent and the next safe action.
- Warning: state what can continue and what cannot.
- Blocked: name every unresolved condition beside the disabled action.
- Error: state whether anything was committed and the safe retry.
- Success: confirm the durable result and its next owner.
- Disabled: preserve readable contrast and explain why near the control.

## Motion

- 120–200 ms ease-out for hover, focus, drawer, and disclosure transitions.
- No bouncing, parallax, infinite motion, or animated financial totals.
- Respect prefers-reduced-motion by removing nonessential transitions.

## Agent-ready interaction

UI tools enter through normal application services and visible UI state:

- Read: inspect current tenant, visible records, pay-run state, calculation trace, and audit events.
- Draft: prefill changes or prepare a release preview without committing.
- Mutate: disabled unless actor, route, entity state, CSRF, and confirmation are valid.
- External: never exposed as a silent action.

Every invocation shows actor/scope/result in the application audit trail. Missing employee, pay-run, or workplace scope must refuse.

## Prohibited patterns

- Decorative dashboards, vanity charts, gradients, glassmorphism, neon, or dark-mode-first styling.
- Berry as a general accent.
- Hidden payroll details, unlabeled icons, hover-only information, or coordinate-dependent tasks.
- Placeholder release buttons before release services exist.
- Admin navigation or payroll data on the public kiosk surface.
- Claims of visual approval from generated HTML without owner review.
