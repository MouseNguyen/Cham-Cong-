# PAY-W5-01 screen inventory

Status: design contract drafted; Superdesign runtime and owner visual acceptance not yet run.

## Primary surfaces

| Surface | Actor/device | Primary job | Primary action | Required states |
| --- | --- | --- | --- | --- |
| Đăng nhập / MFA | owner, accountant | establish authenticated session | Tiếp tục / Xác thực | idle, busy, invalid, disconnected, authenticated |
| Tổng quan — Việc cần làm hôm nay | owner, accountant desktop | identify the next blocking task | open highest-priority task | ready, empty, warning, blocked |
| Nhân viên | accountant desktop | manage synthetic employee records and effective compensation | Thêm nhân viên | loading, empty, active, inactive, validation error |
| Bảng công | accountant/owner desktop, responsive tablet | review raw events, proposals, and frozen snapshots | role/state-specific next action | unresolved, proposed, approved, finalized, stale |
| Kỳ lương | accountant/owner desktop | run the five-state maker-checker workflow | state-specific transition | draft, calculated, review_pending, approved, finalized |
| Chi tiết cách tính | owner, accountant | explain one employee result without recalculation | Xem nguồn quy tắc | summary, expanded trace, unavailable evidence |
| Phiếu lương | owner desktop | preview immutable artifact and delivery destination | Chuẩn bị gửi phiếu | unavailable until W6 services, preview, blocked, released |
| Kiosk chấm công | enrolled iPOS tablet | create or reconcile one clock action | Vào ca / Tan ca | ready, checking, committed, unknown, rejected |

## Dashboard composition

- Header shows workplace, payroll month, actor role, and account access.
- First region is a task queue, not a chart.
- Secondary summary shows employee count, attendance blockers, and current pay-run state only when they change a decision.
- Each card states status, blocker, and one next action.
- Sensitive amounts are visible only to authorized admin roles.

## Five-step pay-run flow

1. Nháp: select exact approved attendance snapshot and compensation/rule bindings.
2. Đã tính: show totals, employee rows, and one-click Xem cách tính.
3. Chờ duyệt: lock maker edits and show owner review checklist.
4. Đã duyệt: require fresh MFA and show the consequence of finalization.
5. Đã chốt: immutable result, audit/version evidence, and downstream artifact status.

Invalid transitions must appear as state explanations, not as enabled buttons that fail after clicking.

## Kiosk interaction budget

The normal flow is at most three interactions:

1. enter employee code;
2. enter six-digit PIN;
3. choose Vào ca or Tan ca.

Unknown network outcomes preserve the idempotency key and show Chưa xác nhận được — đang kiểm tra; they never claim the punch was not recorded.

## Responsive boundaries

- Desktop: 1280 px content maximum, stable navigation, two-column evidence layouts where useful.
- Tablet admin: stack cards and form regions; retain 44 px targets and no page-level horizontal scroll.
- iPOS kiosk: separate full-screen surface with 64 px primary controls and no admin shell.
- Mobile is supported for basic review but is not the primary payroll workstation.
