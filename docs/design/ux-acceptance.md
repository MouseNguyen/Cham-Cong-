# PAY-W5-01 UX acceptance

## Evidence boundary

Duke approved the final W5 direction on 2026-09-07 with one condition: use the newly supplied The Kay's Gelato logo. Dashboard version 4 and tablet kiosk version 7 now render that exact hash-verified Brand Asset and passed separate Chrome visual checks. The kiosk employee-code, six-digit-PIN, clock-in, clock-out, rejected-credential, unknown-outcome, and recovery paths also passed synthetic interaction checks with immediate PIN clearing. This closes the W5 design-contract scope; product implementation and production evidence remain downstream and are not inferred from these Superdesign previews.

## Acceptance matrix

| Check | Required evidence | Current status |
| --- | --- | --- |
| Warm simple-premium dashboard direction | rendered dashboard v1 owner inspection | passed_owner_direction |
| Corrected blocked-state semantics and no demo grid | remote stored HTML and rendered dashboard | passed_dashboard_v4 |
| Corrected dashboard rendering | rendered dashboard plus owner direction | passed_owner_conditional_logo_requirement_verified |
| One primary action per screen/state | design contract plus representative rendered states | passed_design_contract_runtime_states_deferred |
| Five clean pay-run steps | written state contract plus rendered progress rail | passed_design_contract_runtime_states_deferred |
| Kiosk normal flow within three interactions | rendered tablet flow inspection | passed_owner_final_kiosk_v7 |
| Calculation trace discoverable in one action | written disclosure contract | passed_design_contract_runtime_deferred |
| Blocked/error states explain recovery | rendered representative blocker and unknown-outcome states | passed_dashboard_blocker_and_kiosk_recovery |
| Dashboard contains decision-support only | rendered dashboard inspection | passed_dashboard_v4 |
| Vietnamese-first copy and glyph coverage | rendered text inspection at desktop/tablet sizes | passed_dashboard_and_kiosk_previews |
| Money uses tabular numerals and hierarchy | token and component contract | passed_design_contract_runtime_deferred |
| Keyboard focus and 44 px targets are specified | contract inspection | passed_static |
| Reduced motion and non-color status cues are specified | contract inspection | passed_static |
| Kiosk excludes admin/payroll navigation | screen contract inspection | passed_static |
| Agent tools are read/draft first and confirmation-gated | design-system contract inspection | passed_static |

## Rendered dashboard evidence

- Preview: `https://p.superdesign.dev/draft/1fe18151-3cdd-4453-a54a-3d4c1f4a3a86`
- Active draft version: 4. The current remote v3 baseline was refetched before editing; v4 preserves its kiosk navigation and view-transition behavior and adds only the approved Brand Asset logo.
- Browser evidence: installed Chrome through Playwright CLI, full-page render at 1440 x 900 on 2026-09-07.
- Passed visual checks: exact logo loaded at its natural 2000 x 2000 dimensions; warm restrained palette; clear page and blocker hierarchy; one dominant recovery action; exactly five coherent payroll steps; blocked draft state retained at step 1; component-demo grid absent; no horizontal overflow.
- Preview-only console findings: Tailwind CDN production warning and a 400 response for `favicon.ico`. These do not alter the rendered design and are not evidence about the product runtime.
- Owner result: final direction approved conditional on the supplied logo; the condition is satisfied by the exact asset hash and rendered v4 inspection.

## Rendered tablet kiosk evidence

- Preview: `https://p.superdesign.dev/draft/85ad5cdb-724e-43c6-94a3-e7eb35f678ac`
- Active draft version: 7; its remote refetch matched the logo-integrated local source by SHA-256.
- Browser evidence: installed Chrome through Playwright CLI at a 1280 x 800 landscape-tablet viewport on 2026-09-07.
- Passed visual checks: exact logo loaded at its natural 2000 x 2000 dimensions; no admin shell, employee list, or payroll amounts; distinct employee-code and masked six-digit-PIN fields; two clear 64 px attendance actions; three-step orientation; approved palette and Vietnamese typography; no horizontal overflow.
- Passed synthetic interaction checks: employee code plus six-digit PIN enables exactly the chosen `Vào ca` or `Tan ca` action; incomplete credentials stay disabled; both attendance actions reached the correct success copy; `000000` reached a generic rejected state that says `Chưa ghi nhận chấm công`; `999999` reached an unknown network outcome that forbids credential re-entry and recovered through `Kiểm tra trạng thái`.
- Interaction-count result: passed as three UI interactions after page load—enter employee code, enter six-digit PIN, choose `Vào ca` or `Tan ca`—with no extra confirmation step. The PIN field is cleared immediately on submission in every tested outcome.
- Preview-only console findings: Tailwind CDN production warning and a 400 response for `favicon.ico`. These do not alter the rendered design and are not product-runtime evidence.
- Generation cost: one flow call reported 15 credits; deterministic versions 2-7 used direct imports and no generation credits.
- Owner result: final direction approved conditional on the supplied logo; the condition is satisfied by the exact asset hash and rendered v7 inspection.

## Brand identity evidence

- Repository source: `docs/design/assets/the-kays-gelato-logo.jpg`
- SHA-256: `4f978b7fe2f4299179f2fe57db854816fd3c7d1c8d8ea017a4d6d240fabfbede`
- Superdesign Brand Asset key: `the-kays-gelato-logo`
- Upload purpose/type: `brand` / `logo`
- Exact URL occurrence: one in dashboard v4 and one in kiosk v7; no generic ice-cream substitute remains in either logo position.

## Owner review questions

Owner decision: approved final W5 design on 2026-09-07, conditional on using the supplied updated logo. The condition has been verified at the source, upload, remote-refetch, and rendered-preview layers.

1. Can you identify the next payroll task within five seconds?
2. Does every state make the safe next action obvious?
3. Can you distinguish a warning, a blocker, and a finalized result without relying on color?
4. Is net pay visually clear without hiding deductions or source evidence?
5. Does the kiosk feel like a focused clock device rather than a small admin dashboard?
6. Does the interface feel warm and premium without becoming decorative?

## Stop conditions

- Reject a draft that introduces unapproved fonts, colors, gradients, ornamental charts, or decorative motion.
- Reject any public kiosk concept that exposes admin navigation, employee lists beyond the active interaction, payroll amounts, or reusable secrets.
- Do not approve W5-01 until both desktop and tablet surfaces are directly reviewed.
- Record requested changes as replace iterations; create branches only when the owner asks to compare alternatives.
