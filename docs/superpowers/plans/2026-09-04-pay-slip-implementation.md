# Pay Slip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The workspace rule **NO WORKTREES** overrides any generic worktree advice; execute in the main checkout with explicit file ownership.

**Goal:** Xây dựng ứng dụng Windows-native tiếng Việt cho The Kay’s Gelato để chấm công, duyệt bảng công, tính lương full-time/part-time có trace, tạo phiếu PDF mã hóa và phát hành an toàn qua Gmail hoặc Zalo thủ công.

**Architecture:** Một Next.js/TypeScript modular monolith dùng PostgreSQL, với `payroll-domain` thuần và tất định, PostgreSQL outbox/worker, kho tài liệu cục bộ có hash, cùng attendance ingress cô lập. Admin/database/private documents ở máy Windows tại nhà; chỉ attendance ingress được phép đi qua Cloudflare Tunnel.

**Tech Stack:** Node.js 24 LTS; Next.js 16.3.3 Active LTS; React/TypeScript phiên bản tương thích được khóa trong `package-lock.json`; PostgreSQL 18.x current minor; Prisma stable production release; Vitest, fast-check, Testing Library, Playwright, axe-core; Decimal.js; Zod; Argon2id/TOTP; Playwright PDF + qpdf AES-256; age encrypted backups; Windows PowerShell service launchers.

**Spec:** `docs/superpowers/plans/2026-09-04-pay-slip-design.md`

## Global Constraints

- Một doanh nghiệp, một nơi làm việc ban đầu, múi giờ `Asia/Ho_Chi_Minh`, chu kỳ tháng dương lịch.
- Chỉ full-time/part-time với hai mẫu hợp đồng 12 tháng; sáu ngày thử việc không đổi lương.
- Tiền là gross VND; không binary floating point; VND chỉ thành integer sau rounding boundary có tên.
- Full-time dùng monthly salary có hiệu lực; part-time dùng approved payable duration × hourly rate có hiệu lực.
- Không mặc định `part_time = insurance_exempt`; mỗi quỹ được xét riêng theo tháng và rule pack.
- PIT tiền lương cư trú dùng lane lũy tiến; Nghị quyết 43/2026/QH16 không làm giảm PIT tiền lương.
- Holiday entitlement và holiday overtime premium 300% là các component riêng; không dùng công thức 400% phổ quát.
- Attendance thô, snapshot đã duyệt, rule pack phát hành, pay run finalized, PDF và receipts là append-only/hash-bound.
- Kế toán lập/kiểm tra; chủ doanh nghiệp duyệt/finalize/phát hành. Backend phải enforce quyền.
- Personal Zalo chỉ manual handoff; Gmail thật, Zalo OA, tunnel, backup restore và iPOS thật là release gates riêng.
- Không Docker trong MVP; không mở router port; không expose admin/database qua attendance URL.
- Giao diện Vietnamese-first, tối đa một primary action mỗi trạng thái, WCAG 2.2 AA, kiosk tối đa ba tương tác sau page ready.
- Không dùng dữ liệu nhân viên thật trước staging pilot được phê duyệt.
- Mọi install, package-manager write, build, test, server, browser, external binary, credential, tunnel hoặc production-data action phải nằm trong execution wave được chủ sở hữu phê duyệt.
- Chỉ commit sau khi focused verification và wave gate pass; `git add` bằng explicit paths; không push.

---

## 1. Cách giao kế hoạch cho Codex hoặc Hermes

Mỗi task bên dưới là một packet độc lập có `task_id`. Agent nhận task phải đọc spec, Global Constraints và riêng task đó. Nếu giao cho Hermes, dùng cùng cấu trúc như ví dụ PAY-W0-01 đã điền đầy đủ dưới đây; không giao câu “làm toàn bộ app”.

```json
{
  "contract_kind": "task_runtime",
  "task_id": "PAY-W0-01",
  "agent_id": "hermes-w0-01",
  "goal": "Tạo npm-workspace scaffold có runtime/lockfile được khóa và lint, typecheck, unit smoke, Next build đều pass",
  "status": "planned",
  "prerequisites": [
    "Owner approved W0 npm metadata queries, exact package installation, tests and one local build"
  ],
  "inputs": [
    "docs/superpowers/plans/2026-09-04-pay-slip-design.md",
    "docs/superpowers/plans/2026-09-04-pay-slip-implementation.md"
  ],
  "owned_files": [
    "package.json", "package-lock.json", ".nvmrc", ".gitignore",
    "tsconfig.base.json", "vitest.workspace.ts", "eslint.config.mjs",
    "apps/web/package.json", "apps/web/next.config.ts",
    "apps/web/src/app/layout.tsx", "apps/web/src/app/page.tsx",
    "packages/contracts/package.json", "packages/payroll-domain/package.json",
    "packages/attendance-domain/package.json", "packages/document-domain/package.json",
    "tests/architecture/runtime-baseline.spec.ts",
    "docs/adr/0001-runtime-baseline.md"
  ],
  "read_only_files": [
    "docs/superpowers/plans/2026-09-04-pay-slip-design.md",
    "docs/superpowers/plans/2026-09-04-pay-slip-implementation.md"
  ],
  "excluded_scope": [
    "Business/domain implementation", "PostgreSQL installation", "server start",
    "browser automation", "credentials", "Cloudflare", "production data"
  ],
  "allowed_actions": [
    "Read the two plan documents",
    "Run the four approved version queries",
    "Install only the exact W0 dependencies",
    "Edit only owned_files",
    "Run lint, typecheck, one architecture test and one Next build"
  ],
  "approval_gates": [
    "Stop if W0 approval does not explicitly include metadata queries, package installation, tests and build"
  ],
  "expected_artifacts": [
    "Pinned package-lock.json",
    "ADR-0001 with official URLs, exact versions and retrieval date",
    "Runtime baseline test",
    "Redacted command receipt"
  ],
  "verification": [
    "npm run lint",
    "npm run typecheck",
    "npm test -- tests/architecture/runtime-baseline.spec.ts",
    "npm run build"
  ],
  "stop_conditions": [
    "Any required file changed outside owned_files",
    "Any secret or production data is required",
    "Second failure at the same evidence layer or one zero-delta attempt"
  ],
  "coverage_proof": [
    "Every created/modified path listed in handoff",
    "All four verification commands reported with exit code"
  ],
  "execution_envelope": {
    "protocol": "F:\\Codex\\.agent\\protocols\\universal-fast-core.md",
    "defaults": "F:\\Codex\\.agent\\runtime\\execution-profile.defaults.json",
    "profile_policy": "fast_core; stricter when security or payroll evidence requires it",
    "core_before_polish": true
  },
  "handoff": {
    "required_fields": [
      "agent_id", "task_id", "status", "summary", "evidence",
      "files_read", "files_modified", "verification", "blocker", "next_action"
    ]
  }
}
```

Codex review gate cho mọi packet:

1. kiểm danh sách file thay đổi so với `owned_files`;
2. đọc artifact và phần code rủi ro cao, không tin kết luận prose;
3. chạy lại focused test quan trọng nếu wave đã cho phép test;
4. xác nhận evidence layer: `structure`, `dry_run`, `approved_runtime`, hoặc `production`;
5. từ chối `done` nếu có skip/blocker không được ghi;
6. merge/commit tuần tự; không cho hai agent cùng ghi một file.

## 2. Bản đồ file đích

```text
apps/web/
  src/app/(admin)/              # dashboard, employees, attendance, pay runs, delivery, settings
  src/app/kiosk/                # giao diện chấm công tối giản
  src/app/api/                  # route handlers mỏng
  src/components/               # design-system components
  src/lib/application/          # commands/queries, quyền, transaction boundaries
  src/lib/auth/                 # password, TOTP, session, CSRF
  src/lib/db/                   # Prisma client và repositories
  src/lib/agent-tools/          # internal typed page-tool registry và adapter tùy chọn
  src/styles/                   # tokens, globals, print/PDF styles
packages/contracts/src/         # Zod request/response schemas, shared IDs/statuses
packages/payroll-domain/src/    # money, rules, payroll calculation, trace; không I/O
packages/payroll-domain/test/   # unit/golden/property tests
packages/attendance-domain/src/ # state machine, anomalies, payable segments, snapshot hash
packages/document-domain/src/   # payslip view model, hashes, artifact contracts
prisma/
  schema.prisma
  migrations/                   # generated + reviewed SQL, including database constraints/triggers
rules/vn/2026/                  # immutable draft/released rule packs và source manifest
tests/
  architecture/                 # import/boundary checks
  integration/                  # PostgreSQL, outbox, auth, immutability
  e2e/                          # Playwright flows
  fixtures/                     # synthetic employees/pay periods/golden cases
  visual/                       # screenshot/PDF baselines
scripts/windows/                # secret protection, start/stop/health, backup/restore
ops/                            # service manifests, runbooks, backup policy, release ledger
.superdesign/                   # design-system.md, resume.json after approved Superdesign wave
docs/adr/                       # runtime, auth, PDF, backup decisions
docs/agent-packets/             # instantiated packets and handoff receipts
```

## 3. Execution waves và phê duyệt

| Wave | Tasks | Core outcome | Gated actions cần preview/phê duyệt trước khi chạy |
|---|---|---|---|
| W0 | PAY-W0-01 | Repo scaffold + test harness | npm queries/install, test/build |
| W1 | PAY-W1-01…04 | Payroll-domain CLI/test slice | tests/build only |
| W2 | PAY-W2-01…03 | PostgreSQL model + auth + employee/contracts | PostgreSQL install/service, migrations, integration tests |
| W3 | PAY-W3-01…03 | Kiosk -> approved attendance snapshot | local server/browser/iPOS test, tunnel only after local pass |
| W4 | PAY-W4-01 | Snapshot -> finalized pay run | server/integration/E2E tests |
| W5 | PAY-W5-01…02 | Approved simple-premium UI + safe page tools | Superdesign CLI/network/credits, browser/visual tests |
| W6 | PAY-W6-01…02 | Encrypted PDF + fake/real delivery | Chromium/qpdf install, Gmail credentials/API only at real gate |
| W7 | PAY-W7-01…03 | Backup/services/retention/security closure | age/qpdf/service tools, G: write, restore drill, security tests |
| W8 | PAY-W8-01 | Two parallel cycles and release decision | real employee data, production tunnel/domain, real Gmail, production operation |

Không gộp quyền Gmail, tunnel, backup hay production data vào một câu “chạy app”. Mỗi effect có receipt riêng.

---

### Task PAY-W0-01: Khóa runtime và dựng testable scaffold

**Files:**
- Create: `package.json`, `package-lock.json`, `.nvmrc`, `.gitignore`, `tsconfig.base.json`, `vitest.workspace.ts`, `eslint.config.mjs`
- Create: `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`
- Create: `packages/contracts/package.json`, `packages/payroll-domain/package.json`, `packages/attendance-domain/package.json`, `packages/document-domain/package.json`
- Create: `tests/architecture/runtime-baseline.spec.ts`, `docs/adr/0001-runtime-baseline.md`

**Interfaces:**
- Produces npm workspaces `apps/*` và `packages/*`; scripts `lint`, `typecheck`, `test`, `test:unit`, `test:integration`, `test:e2e`, `build`.

- [ ] **Step 1: Verify production versions before package writes**

Run after W0 approval:

```powershell
node --version
npm view next@16.3.3 dist.version peerDependencies engines --json
npm view prisma dist-tags engines --json
psql --version
```

Accept Node 24 LTS, Next 16.3.3, PostgreSQL 18 current minor, and Prisma’s current stable production tag compatible with Node 24. Record URLs, exact versions and retrieval date in ADR-0001. Reject prerelease/RC tags.

- [ ] **Step 2: Write the failing architecture test**

```ts
import root from '../../package.json';
import web from '../../apps/web/package.json';
import { expect, test } from 'vitest';

test('runtime baseline is pinned', () => {
  expect(root.engines?.node).toBe('>=24 <25');
  expect(root.packageManager).toMatch(/^npm@\d+\.\d+\.\d+$/);
  expect(web.dependencies.next).toBe('16.3.3');
});
```

- [ ] **Step 3: Run RED**

Run: `npm test -- tests/architecture/runtime-baseline.spec.ts`  
Expected: FAIL because workspace manifests/config do not exist.

- [ ] **Step 4: Create the minimal scaffold and install exact versions**

Use npm workspaces and ESM. Install exact versions only; commit `package-lock.json`. Include `engines.node = ">=24 <25"`, `private = true`, and `packageManager` equal to the observed npm version. Add no business implementation.

- [ ] **Step 5: Run GREEN and build smoke**

Run: `npm run lint && npm run typecheck && npm test -- tests/architecture/runtime-baseline.spec.ts && npm run build`  
Expected: all PASS; Next build produces no network calls at runtime.

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json .nvmrc .gitignore tsconfig.base.json vitest.workspace.ts eslint.config.mjs apps/web packages tests/architecture/runtime-baseline.spec.ts docs/adr/0001-runtime-baseline.md
git commit -m "chore: establish payroll application runtime"
```

### Task PAY-W1-01: Exact money, duration và rounding primitives

**Files:**
- Create: `packages/payroll-domain/src/money.ts`, `packages/payroll-domain/src/duration.ts`, `packages/payroll-domain/src/rounding.ts`, `packages/payroll-domain/src/index.ts`
- Test: `packages/payroll-domain/test/money.spec.ts`, `packages/payroll-domain/test/rounding.property.spec.ts`

**Interfaces:**
- Produces: `type Vnd = bigint`, `type Minutes = number`, `multiplyRateByMinutes(rate: Vnd, minutes: Minutes, rule: RoundingRule): Vnd`, `roundVnd(value: Decimal, rule: RoundingRule): Vnd`.

- [ ] **Step 1: Write RED tests**

```ts
expect(multiplyRateByMinutes(26_000n, 90, 'HALF_UP_VND')).toBe(39_000n);
expect(() => minutes(-1)).toThrow('DURATION_NEGATIVE');
fc.assert(fc.property(fc.integer({ min: 0, max: 1_000_000 }), n =>
  roundVnd(new Decimal(n), 'HALF_UP_VND') === BigInt(n)));
```

- [ ] **Step 2: Run RED**

Run: `npm run test:unit -- --run packages/payroll-domain/test/money.spec.ts packages/payroll-domain/test/rounding.property.spec.ts`  
Expected: FAIL on missing exports.

- [ ] **Step 3: Implement minimum exact primitives**

Use Decimal.js only inside arithmetic; convert to `bigint` exactly once at the named rounding boundary. Reject non-integer/negative minutes and unsafe JSON number conversion. API contracts serialize VND as base-10 strings.

- [ ] **Step 4: Run GREEN and typecheck**

Run: `npm run test:unit -- --run packages/payroll-domain/test/money.spec.ts packages/payroll-domain/test/rounding.property.spec.ts && npm run typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit explicit paths**

Commit message: `feat(payroll): add exact VND arithmetic`.

### Task PAY-W1-02: Rule-pack contract và effective-date resolver

**Files:**
- Create: `packages/payroll-domain/src/rules/types.ts`, `packages/payroll-domain/src/rules/resolve.ts`, `packages/payroll-domain/src/rules/validate.ts`
- Create: `rules/vn/2026/draft.json`, `rules/vn/2026/sources.json`
- Test: `packages/payroll-domain/test/rules/resolve.spec.ts`, `packages/payroll-domain/test/rules/validate.spec.ts`

**Interfaces:**
- Consumes: `Vnd`, `RoundingRule`.
- Produces: `LegalRulePack`, `RuleContext { earningPeriod, paymentDate, taxPeriod, workplaceRegion, adjustmentOfPayRunId }`, `resolveRulePack(context, packs)`.

- [ ] **Step 1: Write tests for date and status gates**

```ts
expect(resolveRulePack(june2026, [beforeJuly, fromJuly]).id).toBe(beforeJuly.id);
expect(resolveRulePack(july2026, [beforeJuly, fromJuly]).id).toBe(fromJuly.id);
expect(() => releaseRulePack(unsignedDraft)).toThrow('RULE_PACK_SIGNATURES_MISSING');
expect(() => resolveRulePack(context, overlappingPacks)).toThrow('RULE_PACK_OVERLAP');
```

- [ ] **Step 2: Run RED**

Run: `npm run test:unit -- --run packages/payroll-domain/test/rules`  
Expected: FAIL on missing resolver.

- [ ] **Step 3: Implement typed immutable packs**

Include source IDs/URLs, effective interval, Region I floor 5,310,000/month and 25,500/hour from 01/01/2026, PIT five-bracket schedule, separate fund policies, part-time monthly eligibility threshold versions, holiday entitlement/premium separation, content SHA-256, accountant signature metadata and external-specialist signature metadata. The checked-in 2026 file remains `draft`; production finalization rejects it until signatures are present.

- [ ] **Step 4: Run GREEN and fixture validation**

Run: `npm run test:unit -- --run packages/payroll-domain/test/rules && npm run typecheck`  
Expected: PASS; source manifest references `S01`–`S21`, `S31` as applicable and contains no inaccessible local secret.

- [ ] **Step 5: Commit**

Commit message: `feat(payroll): add versioned Vietnam rule packs`.

### Task PAY-W1-03: Full-time deterministic payroll vertical slice

**Files:**
- Create: `packages/payroll-domain/src/types.ts`, `packages/payroll-domain/src/calculate.ts`, `packages/payroll-domain/src/insurance.ts`, `packages/payroll-domain/src/pit.ts`, `packages/payroll-domain/src/holiday.ts`, `packages/payroll-domain/src/trace.ts`
- Test: `packages/payroll-domain/test/full-time.golden.spec.ts`, `tests/fixtures/payroll/full-time-basic.json`, `tests/fixtures/payroll/full-time-holiday-synthetic.json`

**Interfaces:**
- Produces: `calculatePayroll(input: PayrollInput): PayrollResult`.
- `PayrollResult` contains `gross`, fund-by-fund employee/employer amounts, `pit`, `net`, `employerCost`, `lines`, `rulePackId`, `rulePackHash`, `inputHash`.

- [ ] **Step 1: Write basic RED golden test**

```ts
const result = calculatePayroll(fullTimeBasic({ monthlySalary: '8000000' }));
expect(result.gross).toBe('8000000');
expect(result.employeeInsuranceTotal).toBe('840000');
expect(result.pit).toBe('0');
expect(result.net).toBe('7160000');
expect(result.employerInsuranceTotal).toBe('1720000');
expect(result.lines.every(line => line.ruleId && line.roundingRule)).toBe(true);
```

- [ ] **Step 2: Run RED**

Run: `npm run test:unit -- --run packages/payroll-domain/test/full-time.golden.spec.ts`  
Expected: FAIL on missing calculator.

- [ ] **Step 3: Implement the minimum pure pipeline**

Order: validate supported scope -> resolve compensation/rules -> ordinary earnings -> separate holiday entitlement/premium -> gross -> per-fund deductions/contributions -> taxable income -> progressive PIT -> net/employer cost -> trace/hash. Reject 22:00–06:00, unsigned production rules and unsupported components with stable error codes.

- [ ] **Step 4: Run GREEN and determinism check**

Call the same fixture 100 times and require byte-identical canonical JSON/hash. Run unit test and typecheck; expected PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(payroll): calculate traced full-time payroll`.

### Task PAY-W1-04: Part-time, legal boundaries và property tests

**Files:**
- Modify: `packages/payroll-domain/src/calculate.ts`, `packages/payroll-domain/src/insurance.ts`
- Create: `packages/payroll-domain/test/part-time.golden.spec.ts`, `packages/payroll-domain/test/legal-boundaries.spec.ts`, `packages/payroll-domain/test/invariants.property.spec.ts`
- Create: `tests/fixtures/payroll/part-time-80h.json`, `tests/fixtures/payroll/part-time-insurance-boundaries.json`

**Interfaces:**
- Extends `PayrollInput.compensation` with discriminated union `monthly_salary | hourly_rate`; no optional undefined placeholders.

- [ ] **Step 1: Write RED boundary tests**

```ts
expect(calculatePayroll(partTime({ rate: '26000', minutes: 4_800 })).gross).toBe('2080000');
expect(() => calculatePayroll(partTime({ rate: '25499', minutes: 60 }))).toThrow('BELOW_REGIONAL_MINIMUM');
expect(calculatePayroll(partTime({ rate: '25500', minutes: 60 })).gross).toBe('25500');
expect(result.lines.find(x => x.code === 'PIT_RESOLUTION_43_REDUCTION')).toBeUndefined();
```

- [ ] **Step 2: Add property tests**

Properties: net never exceeds gross unless an explicit positive reimbursement policy says so; employer contributions never reduce net; increasing approved minutes cannot reduce ordinary hourly earnings; changing system clock/timezone cannot change result; part-time eligibility is resolved per pay month.

- [ ] **Step 3: Run RED, implement minimum branch, then GREEN**

Run RED first. Implement discriminated compensation logic and monthly fund eligibility. Re-run targeted tests and all payroll-domain tests; expected PASS.

- [ ] **Step 4: Independent accountant fixture gate**

Export canonical input/result/trace JSON for every golden case to `tests/fixtures/payroll/review-pack/`. Mark each `draft_review` until accountant and external specialist signatures are attached; runtime cannot promote a draft case to production rule evidence.

- [ ] **Step 5: Commit**

Commit message: `feat(payroll): cover part-time and rule boundaries`.

### Task PAY-W2-01: PostgreSQL schema, invariants và repositories

**Files:**
- Create: `prisma/schema.prisma`, `prisma.config.ts`, `prisma/migrations/202609040001_initial/migration.sql`
- Create: `apps/web/src/lib/db/client.ts`, `apps/web/src/lib/db/repositories/*.ts`
- Test: `tests/integration/db/effective-dates.spec.ts`, `tests/integration/db/immutability.spec.ts`, `tests/integration/db/hash-bindings.spec.ts`

**Interfaces:**
- Consumes domain IDs/statuses; produces repositories with transaction-bound command methods.
- API money values remain decimal strings; database VND columns use `BIGINT`.

- [ ] **Step 1: Write RED integration tests**

Tests insert overlapping compensation terms, mutate a finalized pay run, delete a raw clock event and bind a pay run to a mismatched snapshot hash. Each operation must fail with a named database/application error.

- [ ] **Step 2: Run RED against a disposable local database**

Run: `npm run test:integration -- --run tests/integration/db`  
Expected: FAIL before schema/migration exists. Never point `DATABASE_URL` at a real payroll database.

- [ ] **Step 3: Implement schema and reviewed SQL constraints**

Create all entities listed in the design spec. Add exclusion/unique/check constraints for effective periods/idempotency and database triggers or privileges preventing update/delete of protected finalized tables. Repositories require expected version for state changes and append audit in the same transaction.

- [ ] **Step 4: Migrate disposable DB and run GREEN**

Run: `npm exec prisma migrate deploy && npm run test:integration -- --run tests/integration/db`  
Expected: PASS; migration down/restore strategy is documented in `ops/runbooks/database-migration.md`.

- [ ] **Step 5: Commit**

Commit message: `feat(data): enforce immutable payroll records`.

### Task PAY-W2-02: Owner/accountant authentication và authorization

**Files:**
- Create: `apps/web/src/lib/auth/password.ts`, `totp.ts`, `session.ts`, `csrf.ts`, `authorization.ts`
- Create: `apps/web/src/lib/application/commands/authorization.ts`
- Create: `apps/web/src/app/login/page.tsx`, `apps/web/src/app/login/totp/page.tsx`
- Test: `tests/integration/auth/*.spec.ts`, `tests/e2e/auth.spec.ts`

**Interfaces:**
- Produces `Actor { userId, role: 'owner' | 'accountant', sessionId, mfaSatisfiedAt }` and `authorize(actor, command, resource)`.

- [ ] **Step 1: Write RED authorization matrix tests**

Assert accountant can create/calculate drafts but cannot approve attendance, finalize or release; owner can approve/finalize/release only with fresh TOTP; kiosk principal can only create attendance events. Test direct service/API calls, not only hidden buttons.

- [ ] **Step 2: Write RED session negative tests**

Cover Argon2id verification, lockout/rate limit, session rotation, expiry, CSRF failure, replayed TOTP and redacted audit output.

- [ ] **Step 3: Implement minimal auth core**

Benchmark Argon2id on target Windows host and record parameters; store only hashes/secrets protected by the Windows adapter. Use `HttpOnly`, `Secure`, suitable `SameSite`, rotating session IDs and server-side revocation. Never log passwords, TOTP seeds or cookies.

- [ ] **Step 4: Run GREEN**

Run integration tests then Playwright auth test with synthetic accounts; expected PASS, including backend denials.

- [ ] **Step 5: Commit**

Commit message: `feat(auth): enforce owner accountant maker checker`.

### Task PAY-W2-03: Employee, contract, compensation và verified delivery destination

**Files:**
- Create: `packages/contracts/src/employee.ts`, `packages/contracts/src/compensation.ts`
- Create: `apps/web/src/lib/application/commands/create-employee.ts`, `add-contract.ts`, `change-compensation.ts`, `change-email.ts`, `verify-email-code.ts`, `deactivate-employee.ts`
- Create: `apps/web/src/lib/application/queries/get-employee.ts`, `list-employees.ts`
- Test: `tests/integration/employees/lifecycle.spec.ts`, `compensation-effective-dates.spec.ts`, `email-verification.spec.ts`

**Interfaces:**
- `CompensationTerm` là discriminated union: `{ basis:'monthly_salary', monthlySalaryVnd:string } | { basis:'hourly_rate', hourlyRateVnd:string }`.
- `DeliveryDestination` có address, effective interval, verification status/version và không chứa email verification code dạng rõ.

- [ ] **Step 1: Write RED scope and compensation tests**

Accept only Vietnamese resident employee plus approved full-time/part-time 12-month contract profiles. Full-time requires monthly salary and rejects hourly rate; part-time does the inverse. Six-day probation is metadata and day seven does not create a new compensation term. Reject overlapping terms and 2026 Region I values below 5,310,000/month or 25,500/hour.

- [ ] **Step 2: Run RED**

Run: `npm run test:integration -- --run tests/integration/employees`  
Expected: FAIL on missing commands.

- [ ] **Step 3: Implement employee lifecycle commands**

Every compensation/email change closes the previous effective interval and creates a new record in one transaction. Deactivation revokes sessions/kiosk access and pending delivery drafts but preserves payroll history. Unsupported contract/population returns stable blocker code and next action.

- [ ] **Step 4: Implement low-sensitivity email verification**

Generate a one-time random code with expiry/attempt limit, store only its hash, and send a message containing no payroll or sensitive identity data through the outbox. A delivery destination becomes verified only after correct code entry. Address change invalidates verification and every pending payslip draft.

- [ ] **Step 5: Run GREEN and commit**

Run employee integration tests and typecheck; expected PASS. Commit message: `feat(employees): manage effective contracts and destinations`.

### Task PAY-W3-01: Scheduling và attendance state machine

**Files:**
- Create: `packages/attendance-domain/src/types.ts`, `state-machine.ts`, `anomalies.ts`, `payable-segments.ts`, `snapshot.ts`
- Create: `apps/web/src/lib/application/commands/save-weekly-schedule.ts`, `set-schedule-exception.ts`
- Create: `apps/web/src/lib/application/queries/get-effective-schedule.ts`
- Test: `packages/attendance-domain/test/state-machine.spec.ts`, `anomalies.spec.ts`, `snapshot.spec.ts`, `tests/integration/attendance/schedule-effective-dates.spec.ts`

**Interfaces:**
- Produces `acceptClockCommand`, `detectAttendanceExceptions`, `classifySegment`, `buildAttendanceSnapshot`, `hashAttendanceSnapshot`.

- [ ] **Step 1: Write RED state-machine tests**

Cover IN->OUT happy path, duplicate command with same idempotency key returning same event, concurrent IN commands producing one accepted event, OUT without IN, overlap, out-of-shift, public-holiday and 22:00–06:00 flags.

- [ ] **Step 2: Write paid-break and payroll-boundary tests**

Six-hour and ten-hour shifts keep all approved minutes; no scheduled/assumed break is deducted. Full-time variance emits review context but never a salary deduction. Part-time output contains only approved payable minutes.

- [ ] **Step 3: Run RED, implement pure state machine, run GREEN**

Run: `npm run test:unit -- --run packages/attendance-domain/test` before and after implementation. Expected final PASS.

- [ ] **Step 4: Implement effective-dated schedule commands**

Store the approved opening pattern—Monday closed, Tuesday–Friday 15:00–21:00, Saturday–Sunday 11:00–21:00—plus per-employee weekly assignments and per-date/public-holiday exceptions. A future Tuesday–Friday 11:00–21:00 change creates a new version; it never rewrites earlier attendance.

- [ ] **Step 5: Add canonical snapshot hash test**

Reordering input records must not change the canonical snapshot; changing one approved minute, classification or approver must change its SHA-256.

- [ ] **Step 6: Commit**

Commit message: `feat(attendance): add auditable attendance state machine`.

### Task PAY-W3-02: Attendance ingress API và iPOS kiosk

**Files:**
- Create: `packages/contracts/src/attendance.ts`
- Create: `apps/web/src/app/api/attendance/events/route.ts`, `apps/web/src/lib/application/commands/record-clock-event.ts`
- Create: `apps/web/src/app/kiosk/page.tsx`, `apps/web/src/app/kiosk/kiosk-form.tsx`, `apps/web/src/styles/kiosk.css`
- Test: `tests/integration/attendance/ingress.spec.ts`, `tests/e2e/kiosk.spec.ts`

**Interfaces:**
- Input: `{ employeeCode: string, pin: string, action: 'CLOCK_IN'|'CLOCK_OUT', idempotencyKey: uuid }`.
- Output success: `{ recorded: true, eventId, recordedAt, nextAllowedAction }`; failure: `{ recorded: false, code, message, nextAction }`.

- [ ] **Step 1: Write RED API tests**

Require durable transaction before `recorded:true`; retry same key returns same event; wrong PIN response does not reveal whether code exists; DB outage returns `recorded:false` and creates no phantom audit/event.

- [ ] **Step 2: Implement command and isolated route**

Route may access employee code/PIN status and attendance repositories only. Add IP/session rate limit, request ID and redacted audit. It cannot import payroll, document or admin query modules; architecture test enforces this.

- [ ] **Step 3: Write RED kiosk UI test**

Playwright enters code, six-digit PIN and action in three interactions, sees success only after response, resets sensitive fields, and sees **Chưa ghi nhận chấm công** when the request fails. Verify 44×44 targets and no salary/name-list exposure.

- [ ] **Step 4: Implement minimal kiosk UI and run GREEN**

Run targeted integration and Playwright tests at approved local runtime. Do not open a tunnel yet. Expected PASS.

- [ ] **Step 5: Real iPOS canary gate**

After local PASS and separate browser approval, test actual Android browser viewport, touch, keyboard, tab preservation, reconnect and failure state. Save version, screenshots and result in `ops/evidence/ipos-canary-<date>.md`.

- [ ] **Step 6: Commit**

Commit message: `feat(attendance): add isolated iPOS kiosk ingress`.

### Task PAY-W3-03: Attendance review, corrections và immutable snapshot

**Files:**
- Create: `apps/web/src/lib/application/commands/draft-attendance-classification.ts`, `approve-attendance-exception.ts`, `finalize-attendance-snapshot.ts`
- Create: `apps/web/src/lib/application/queries/list-attendance-exceptions.ts`
- Create: `apps/web/src/app/(admin)/attendance/page.tsx`, `review-panel.tsx`
- Test: `tests/integration/attendance/review.spec.ts`, `tests/e2e/attendance-review.spec.ts`

**Interfaces:**
- Accountant produces a proposal; owner approval produces an append-only decision; `finalizeAttendanceSnapshot(period)` returns snapshot ID/hash or structured blockers.

- [ ] **Step 1: Write RED maker-checker tests**

Assert accountant cannot approve own proposal; owner cannot finalize with unresolved exception; changing raw/correction evidence after approval invalidates candidate hash; rejected time never silently becomes payable.

- [ ] **Step 2: Implement transactional commands**

Every decision stores actor/time/reason/source segment/expected version. Snapshot contains canonical approved segments and exclusions, not only total hours.

- [ ] **Step 3: Write UI RED test then implement review flow**

The screen groups blockers first, shows exact raw/scheduled time and one recommended next action, then lets accountant draft and owner approve in separate sessions. No action is enabled outside valid state.

- [ ] **Step 4: Run GREEN**

Run integration and E2E tests; expected PASS with immutable snapshot hash receipt.

- [ ] **Step 5: Commit**

Commit message: `feat(attendance): approve immutable monthly snapshots`.

### Task PAY-W4-01: Pay-run orchestration, review và finalization

**Files:**
- Create: `packages/contracts/src/pay-run.ts`
- Create: `apps/web/src/lib/application/commands/create-pay-run.ts`, `calculate-pay-run.ts`, `submit-pay-run.ts`, `approve-pay-run.ts`, `finalize-pay-run.ts`, `create-adjustment-run.ts`
- Create: `apps/web/src/lib/application/queries/get-pay-run.ts`, `explain-calculation.ts`
- Test: `tests/integration/pay-runs/lifecycle.spec.ts`, `tests/integration/pay-runs/reproducibility.spec.ts`

**Interfaces:**
- Commands consume exact attendance snapshot ID/hash, compensation term IDs, rule pack ID/hash and expected pay-run version.
- Produces stored calculation lines and canonical result hash.

- [ ] **Step 1: Write RED lifecycle tests**

Cover valid transition chain; missing/changed snapshot; unsigned rule pack; accountant attempting approval/finalize; double finalize; mutation after finalize; adjustment run linking to original.

- [ ] **Step 2: Write RED reproducibility test**

Reload a historical finalized run after active salary/rule changes and require byte-identical result/trace/hash from frozen inputs.

- [ ] **Step 3: Implement commands through one transaction boundary**

Persist input snapshot before result, call only pure payroll-domain, append approval/audit events, and use compare-and-swap status/version. No PDF or email inside finalize transaction; enqueue outbox work after commit.

- [ ] **Step 4: Run GREEN**

Run all pay-run integration and payroll-domain tests. Expected PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(payruns): finalize reproducible payroll runs`.

### Task PAY-W5-01: Superdesign system và approved visual direction

**Files:**
- Create: `.superdesign/design-system.md`, `.superdesign/resume.json`
- Create: `docs/design/screen-inventory.md`, `docs/design/ux-acceptance.md`
- No application code in this task.

**Interfaces:**
- Produces one owner-approved base draft ID/canvas URL, token/component contract and page prompts for dashboard, kiosk, attendance review, pay-run wizard, calculation detail and payslip release.

- [ ] **Step 1: Prepare the exact gated preview**

Preview `npx --yes @superdesign/cli@latest` network use, selected model, number of generations/credit ceiling, files sent as context, outputs, browser opening and residue. Obtain explicit approval before running.

- [ ] **Step 2: Create the design system**

Follow the brand-new-project Superdesign route: search style prompts once, choose one primary source, then write `.superdesign/design-system.md` with only the cream/ink/pistachio/berry palette, Vietnamese typography, 8 px grid, 12–16 px radii, light shadows, tabular money, accessible states and reduced-motion behavior. Do not blend a competing style.

- [ ] **Step 3: Generate one base draft and two bounded branches only if requested**

Use one `-p` for the base draft and always pass the design-system context plus the user’s verbatim request. Surface canvas URL. Use `branch` only for alternatives and `replace` for feedback on the selected direction. Record IDs/fingerprints in `resume.json`.

- [ ] **Step 4: Approve flows and record acceptance**

Owner reviews desktop admin and tablet kiosk. Record pass/fail for one-primary-action, five-step clean pay run, three-interaction kiosk, trace discoverability, blocked/error states and non-decorative dashboard. Do not mark visual runtime pass from HTML alone.

- [ ] **Step 5: Commit design artifacts after approval**

Commit message: `docs(design): approve simple premium payroll UI`.

### Task PAY-W5-02: Admin UI, responsive components và agent-ready registry

**Files:**
- Create: `apps/web/src/styles/tokens.css`, `globals.css`, `print.css`
- Create: `apps/web/src/components/{Button,Field,Money,Status,StepFlow,DataTable,Dialog,TracePanel}.tsx`
- Create: admin pages listed in the design spec
- Create: `apps/web/src/lib/agent-tools/{types,registry,webmcp-adapter}.ts`
- Test: `tests/e2e/admin-flows.spec.ts`, `tests/e2e/accessibility.spec.ts`, `tests/agent-tools/registry.spec.ts`, `tests/agent-tools/evals.spec.ts`, `tests/visual/*.spec.ts`

**Interfaces:**
- Page tools expose typed read/draft/confirmed commands through the same application services as UI; `enabledWhen` filters by actor, route and entity state.

- [ ] **Step 1: Write component and accessibility RED tests**

Test focus, labels, error association, keyboard dialogs, 44×44 interactive targets, tabular money, reduced motion, no horizontal scroll and WCAG 2.2 AA checks with axe.

- [ ] **Step 2: Implement tokens/components from approved design only**

Self-host verified Vietnamese font files; provide system fallback. Implement loading, empty, warning, error, blocked, success and disabled states for every core component.

- [ ] **Step 3: Write RED workflow tests then implement pages**

Cover add full-time/part-time employee conditional fields, attendance blocker review, five-step pay run, one-click trace reveal and owner release preview. Tests must assert copy and state, not brittle coordinates.

- [ ] **Step 4: Write RED page-tool evals**

Expected mappings include “Giải thích lương nhân viên X” -> `explainCalculation` read; “Chuẩn bị gửi phiếu” -> `previewPayslipRelease` draft; “Gửi ngay” without confirmation -> no mutating tool. Missing employee/pay-run scope must refuse.

- [ ] **Step 5: Implement internal registry and optional WebMCP adapter**

Each tool declares input/output schema, risk, `readOnlyHint`, `requiresConfirmation`, `enabledWhen`; dynamic registrations use `AbortController`. Invocation writes redacted audit and cannot bypass service validation.

- [ ] **Step 6: Run GREEN and visual baseline review**

Run component, agent-tool, E2E, axe and screenshot tests in approved browser runtime. Owner/accountant perform the defined tasks; record friction findings before acceptance.

- [ ] **Step 7: Commit**

Commit message: `feat(ui): add simple premium payroll workflows`.

### Task PAY-W6-01: Vietnamese payslip PDF, hash và password encryption

**Files:**
- Create: `packages/document-domain/src/payslip-view-model.ts`, `artifact.ts`
- Create: `apps/web/src/lib/documents/render-payslip.ts`, `encrypt-pdf.ts`, `store-document.ts`
- Create: `apps/web/src/templates/payslip.vi.tsx`, `apps/web/src/styles/payslip.css`
- Create: `docs/adr/0002-pdf-encryption.md`
- Test: `tests/integration/documents/payslip.spec.ts`, `tests/e2e/payslip-preview.spec.ts`, `tests/visual/payslip.spec.ts`

**Interfaces:**
- `generatePayslip(finalizedPayRunEmployeeId): DocumentArtifact { id, employeeId, payRunId, path, sha256, bytes, mime, encryption }`.

- [ ] **Step 1: Write RED content/binding tests**

Assert PDF text includes employee/period/components/gross/fund deductions/PIT/net/employer contribution/rule version/payslip ID, excludes full CCCD/bank/BHXH, and rejects non-finalized or hash-mismatched pay runs.

- [ ] **Step 2: Write RED encryption tests**

Generate strong random employee password and separate random owner password; pass secrets by stdin/in-memory, never CLI args/log. Require qpdf AES-256, failure to open without password, success with employee password, and `qpdf --show-encryption` confirmation.

- [ ] **Step 3: Implement render -> encrypt -> atomic store**

Use Playwright print CSS with embedded/self-hosted Vietnamese font. Render to temp, encrypt to temp, verify, calculate SHA-256, atomically move to protected document directory, then commit metadata. Delete temp files on success/failure.

- [ ] **Step 4: Run content and visual GREEN**

Test one-page and multi-page PDFs, long Vietnamese names, VND alignment and print margins. Compare extracted text and rendered PNG baseline. Expected PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(payslips): render encrypted Vietnamese PDFs`.

### Task PAY-W6-02: PostgreSQL outbox, Gmail adapter và Zalo manual handoff

**Files:**
- Create: `apps/web/src/lib/delivery/types.ts`, `outbox.ts`, `worker.ts`, `fake-adapter.ts`, `gmail-adapter.ts`, `zalo-manual-adapter.ts`, `password-handoff.ts`
- Create: `apps/web/src/lib/application/commands/preview-payslip-release.ts`, `release-payslips.ts`, `confirm-manual-delivery.ts`
- Create: `apps/web/src/app/(admin)/delivery/page.tsx`
- Test: `tests/integration/delivery/outbox.spec.ts`, `recipient-isolation.spec.ts`, `gmail-contract.spec.ts`, `zalo-manual.spec.ts`

**Interfaces:**
- `DeliveryDraft` binds exactly one employee, verified destination, period, payslip ID and PDF hash.
- `DeliveryAdapter.send(draft): ProviderAccepted | Failed`; manual adapter never returns `Delivered`.

- [ ] **Step 1: Write RED fake-outbox tests**

Cover one recipient/no CC/BCC, no salary in subject/body, attachment hash, idempotent enqueue/send, bounded exponential retries, dead-letter state, crash-after-provider-acceptance reconciliation and one employee never receiving another file.

- [ ] **Step 2: Implement worker with fake adapter only**

Use `FOR UPDATE SKIP LOCKED`, lease expiry, stable idempotency key and append-only attempts. Calculation/PDF remain available when a delivery provider is down.

- [ ] **Step 3: Write Gmail contract tests and implement disabled adapter**

Adapter uses OAuth 2.0 Gmail send scope only, refresh token from Windows secret adapter, RFC-compliant MIME with one PDF, and redacted errors. It remains disabled until 2SV/account authorization and real-gate evidence pass.

- [ ] **Step 4: Implement Zalo manual flow**

Preview exact employee/period/file/hash and neutral copy text. Confirmation records `operator_confirmed_manual`, operator, time, destination descriptor and optional note; never stores Zalo credential/session and never labels provider delivery.

Implement a separate password-handoff draft for in-person, phone call or owner-confirmed Zalo message. The password must never appear in the payslip email, filename, delivery receipt or audit log; the receipt stores only employee, channel descriptor, operator, time and password version ID.

- [ ] **Step 5: Run GREEN with fake provider**

Run all delivery integration tests with synthetic employees. Expected PASS.

- [ ] **Step 6: Bounded real Gmail gate**

With separate approval: enable 2SV, configure OAuth/consent, authorize exact account/scope, send one synthetic PDF to an owner-controlled address, verify provider ID, revoke token and prove subsequent failure. Save a redacted receipt; never persist token values.

- [ ] **Step 7: Commit**

Commit message: `feat(delivery): send employee-bound payslips safely`.

### Task PAY-W7-01: DPAPI secrets, encrypted backups và restore drill

**Files:**
- Create: `scripts/windows/protect-secret.ps1`, `unprotect-secret.ps1`, `backup.ps1`, `restore-test.ps1`
- Create: `apps/web/src/lib/secrets/windows-dpapi.ts`, `apps/web/src/lib/operations/backup-health.ts`
- Create: `ops/backup-policy.json`, `ops/runbooks/backup-restore.md`
- Test: `tests/integration/operations/secrets.windows.spec.ts`, `backup-path.spec.ts`, `restore.spec.ts`

**Interfaces:**
- Secret scripts accept secret bytes through stdin only and emit ciphertext/plaintext through a captured pipe; no secret in arguments/logs.
- Backup accepts exact root `G:\PaySlip-Backups` and age recipient public key; restore requires separately held private key.

- [ ] **Step 1: Write RED secret and path tests**

Round-trip a synthetic secret under the intended Windows service identity; assert ciphertext differs, other identity cannot decrypt, logs contain no secret. Reject `G:\`, `G:\Other`, traversal, symlink/junction escape and missing target drive.

- [ ] **Step 2: Implement DPAPI adapter and age backup manifest**

Use DPAPI `CurrentUser` for service-held OAuth/PDF-password ciphertext. For portable backup, encrypt tar/archive content to an age public recipient so the private recovery key can remain off-PC. Manifest includes schema, created time, DB dump hash, document count/hash, rule/audit hashes and app version.

- [ ] **Step 3: Implement retention and health**

Schedule immediately after finalize and 02:00 daily. Keep 14 daily, 8 weekly, 12 monthly without deleting the last known-good set. Health reports drive missing, free space, last success, verification and recovery-key drill date.

- [ ] **Step 4: Run synthetic write and restore drill only after G: approval**

Write only under `G:\PaySlip-Backups`; independently resolve every path before write/delete. Restore into a fresh temp directory/database, compare schema/count/SHA-256, open one synthetic payslip, then remove only the verified temp target. Save receipt in `ops/evidence/backup-restore-<date>.md`.

- [ ] **Step 5: Run GREEN and commit**

Expected: path, encryption, retention and restore tests PASS. Commit message: `feat(ops): add encrypted verified payroll backups`.

### Task PAY-W7-02: Windows service lifecycle, health và incident runbooks

**Files:**
- Create: `scripts/windows/start-pay-slip.ps1`, `stop-pay-slip.ps1`, `health-pay-slip.ps1`
- Create: `ops/services/pay-slip-services.json`
- Create: `ops/runbooks/{startup-shutdown,attendance-outage,database-failure,tunnel-failure,gmail-failure,backup-failure,data-incident,private-admin-access}.md`
- Test: `tests/integration/operations/service-lifecycle.windows.spec.ts`, `health.spec.ts`, `private-admin-boundary.spec.ts`

**Interfaces:**
- Admin `127.0.0.1:46217`; attendance `127.0.0.1:46218`; PostgreSQL loopback approximately `55432` after exact listener preflight; worker no port.

- [ ] **Step 1: Write RED ownership/lifecycle tests**

If a port is owned by an unrelated process, startup fails and reports PID/executable/command line without stopping it. Owned startup passes only after health; Ctrl+C/startup failure/stop helper removes exact owned process tree and listener.

- [ ] **Step 2: Implement bounded supervisor scripts**

Order database -> admin/attendance -> worker. Use hidden background windows only for owned services, finite retries/backoff, PID receipt and shutdown cleanup. No broad process-name kill.

- [ ] **Step 3: Implement health and degraded-state UI**

Report database, admin, attendance, outbox, backup freshness and tunnel configuration separately. Kiosk must fail closed when attendance health is unavailable.

- [ ] **Step 4: Lock the multi-PC private-admin boundary**

Keep admin bound to loopback for the first local-host run. Before enabling a second PC, record one owner-approved private channel in `ops/runbooks/private-admin-access.md`, with named-device/user authentication, revocation, MFA, no shared kiosk credential, no reuse of the attendance hostname and a direct negative test proving unauthenticated Internet access cannot reach admin. Provider installation/account/network use is a separate gate; if no channel is approved, multi-PC admin remains disabled without blocking local-host administration.

- [ ] **Step 5: Dry-run then approved runtime test**

First inspect command/action plan without starting services. After explicit approval, run start/health/stop and verify no listener remains. Save exact cleanup receipt.

- [ ] **Step 6: Commit**

Commit message: `feat(ops): manage Windows payroll services safely`.

### Task PAY-W7-03: Record-class retention, legal hold và deletion workflow

**Files:**
- Create: `apps/web/src/lib/retention/types.ts`, `evaluate-retention.ts`
- Create: `apps/web/src/lib/application/commands/request-data-action.ts`, `place-legal-hold.ts`, `approve-retention-action.ts`, `execute-retention-action.ts`
- Create: `ops/retention-policy.json`, `ops/vendor-register.json`, `ops/runbooks/data-subject-request.md`
- Test: `tests/integration/retention/policy.spec.ts`, `legal-hold.spec.ts`, `deletion-audit.spec.ts`

**Interfaces:**
- `evaluateRetention(recordClass, dates, policyVersion, legalHolds)` returns `retain | eligible_for_review | blocked_by_hold`; it never deletes.
- Deletion/anonymization requires a separately approved command, exact record IDs and append-only receipt.

- [ ] **Step 1: Write RED policy tests**

Test employee contact/profile data separately from accounting/payroll records, delivery receipts, audit events, security logs and backups. Legal hold always blocks deletion. An unsigned retention policy cannot authorize destruction.

- [ ] **Step 2: Run RED and implement evaluator**

Run: `npm run test:integration -- --run tests/integration/retention` before and after the pure evaluator. Keep statutory durations/status in the signed effective-dated policy file, not TypeScript constants.

- [ ] **Step 3: Implement draft -> owner approval -> exact execution workflow**

The accountant may create a data-action draft; owner reviews scope/effect; backend rechecks policy/hold at execution time. No broad employee delete command exists. Backups retain their own expiry and tombstone manifest so restored data cannot silently reactivate deleted contact data.

- [ ] **Step 4: Verify audit and negative paths**

Assert unauthorized request, expired approval, active legal hold, path/scope widening and policy-version drift all fail closed. Receipts contain actor/time/record class/IDs/policy/hash/result but no deleted payload.

- [ ] **Step 5: Commit**

Commit message: `feat(privacy): enforce record-class retention and holds`.

### Task PAY-W8-01: End-to-end, security, parallel cycles và release ledger

**Files:**
- Create: `tests/e2e/full-time-cycle.spec.ts`, `part-time-cycle.spec.ts`, `holiday-cycle.spec.ts`, `recipient-isolation.spec.ts`, `permissions.spec.ts`, `outage-recovery.spec.ts`
- Create: `tests/security/{authz,csrf,rate-limit,log-redaction,file-access,tunnel-boundary}.spec.ts`
- Create: `ops/release/claim-ledger.md`, `ops/release/no-go-checklist.md`, `ops/release/parallel-cycle-template.csv`

**Interfaces:**
- Produces one claim ledger where every evidence layer is `passed`, `blocked`, `not_run` or `not_required`, with exact blocker count.

- [ ] **Step 1: Write complete E2E RED suite**

Full-time: employee -> schedule -> punches -> snapshot -> payroll -> finalize -> encrypted PDF -> fake delivery. Part-time: approved minutes and insurance boundaries. Holiday: entitlement and premium separate. Negative paths: night work, unsupported contract, unresolved exception, unsigned rules, wrong role, wrong recipient and provider outage.

- [ ] **Step 2: Run focused suites and repair only causal failures**

Use order: unit -> integration -> E2E -> visual/accessibility -> security -> backup restore. After two same-layer failures or one zero-delta attempt, freeze the attempt family and research before one repair/fallback.

- [ ] **Step 3: Complete independent reviews**

Accountant signs every golden input/result/rounding case. External specialist signs rule matrix, source versions, PIT lane, insurance decisions and holiday cases. Security reviewer checks the actual ingress/auth/file/delivery boundaries. Record names/dates/artifact hashes, never credentials.

- [ ] **Step 4: Run two parallel payroll cycles**

Only after real-data approval and required security gates. For each employee/component/fund/PIT/net, compare app output with accountant’s independent calculation. Every non-zero variance has a cause, correction, rerun and signed disposition.

- [ ] **Step 5: Verify real integrations separately**

Require iPOS receipt, named Cloudflare Tunnel/domain/security receipt, Gmail send/revoke receipt, backup/restore receipt and Windows restart/lifecycle receipt. Quick Tunnel, fake email or local browser cannot substitute for production evidence.

- [ ] **Step 6: Make release decision from claim ledger**

Release only when all NO-GO rows pass and blocker count is zero. Otherwise state `partial`, `blocked`, or `runtime-unverified` and list exact blockers; do not call the app production-ready.

- [ ] **Step 7: Commit verified release artifacts**

Use explicit non-secret paths. Commit message: `test: verify payroll pilot release gates`. Never push; report commit SHA and exact push command to the owner.

---

## 4. Mandatory review checkpoints

1. **After W0:** runtime/lockfile/architecture only; no product claim.
2. **After W1:** pure payroll slice and draft golden pack; no database/UI claim.
3. **After W3:** local kiosk-to-snapshot behavior; no public tunnel claim until separate gate.
4. **After W4:** deterministic finalized synthetic pay run; first runnable core outcome.
5. **After W5:** owner-approved simple-premium UI and agent-tool safety.
6. **After W6:** encrypted PDF + fake delivery; Gmail real evidence remains separate.
7. **After W7:** Windows lifecycle and synthetic restore proof.
8. **After W8:** specialist signatures, real integrations and two parallel cycles decide production status.

## 5. Spec-to-task coverage review

| Spec sections | Owning task(s) | Direct evidence expected |
|---|---|---|
| 1–4 Product outcome, scope, legal limits | PAY-W1-02…04, PAY-W8-01 | rule fixtures, signed review pack, release ledger |
| 5–7 Architecture, flow, immutable data | PAY-W0-01, PAY-W2-01, PAY-W4-01 | build, DB invariant tests, reproducibility tests |
| 8 Scheduling/attendance | PAY-W3-01…03 | state-machine, ingress, iPOS and snapshot receipts |
| 9 Payroll rules | PAY-W1-01…04 | unit/golden/property and accountant cases |
| 10 Pay-run lifecycle | PAY-W4-01 | lifecycle, maker-checker and adjustment tests |
| 11 Payslip/delivery | PAY-W6-01…02 | PDF content/encryption/visual and recipient-isolation receipts |
| 12 Security/privacy/retention | PAY-W2-02, PAY-W7-01…03, PAY-W8-01 | auth negative, redaction, retention/hold, path and security tests |
| 13 Backup/Windows operations | PAY-W7-01…02 | restore, service lifecycle and cleanup receipts |
| 14 Simple-premium UX | PAY-W5-01…02 | owner-approved canvas, axe, task-flow and visual evidence |
| 15 Agent-ready interface | PAY-W5-02 | schema export, state gating, negative tool evals, audit |
| 16 Codex/Hermes contract | all tasks + packet template | ownership checks and structured handoffs |
| 17–19 Verification/GO-NO-GO/ledger | PAY-W8-01 | complete claim ledger with exact blocker count |

Coverage result at planning layer: every design section has at least one owning task. This table is not runtime evidence.

## 6. Recommended agent allocation

Codex có thể thực hiện tuần tự toàn bộ plan. Nếu dùng Hermes, giao từng task riêng và Codex review giữa các task. Không giao song song các task có chung file:

| Packet | Có thể giao độc lập khi prerequisite pass | File ownership chính |
|---|---|---|
| PAY-W1-01 | sau W0 | `packages/payroll-domain/src/money*`, `duration*`, `rounding*` |
| PAY-W5-01 | sau spec, không phụ thuộc code | `.superdesign/`, `docs/design/` |
| PAY-W7-02 runbook drafting | sau khi port/service contract chốt; read-only runtime | `ops/runbooks/`, `ops/services/` |

Mọi phần còn lại nên nối tiếp vì dùng shared contracts/schema. Một Hermes packet không được tự spawn worker khác, sửa Prisma cùng lúc với agent khác hoặc chạy gated action chưa liệt kê.

## 7. Định nghĩa hoàn tất

Implementation chỉ được gọi là hoàn tất khi:

- mọi task ở trên có handoff receipt và focused verification;
- spec coverage không có requirement thiếu owner task;
- mọi code step và command trong kế hoạch đều cụ thể, không có chỗ trống để agent tự đoán;
- type/signature giữa contracts, domain, repositories, UI và agent tools khớp;
- claim ledger có zero blocker cho production layer;
- specialist signatures, iPOS, named tunnel/domain, Gmail, encrypted PDF, backup restore, Windows lifecycle, security và hai parallel cycles đều `passed` bằng bằng chứng trực tiếp.

Nếu bất kỳ lớp nào `not_run` hoặc `blocked`, báo đúng lớp đó và không nâng mức tuyên bố.
