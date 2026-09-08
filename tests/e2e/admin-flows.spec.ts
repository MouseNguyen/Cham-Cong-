import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { adminFixture, adminPool, seedAttendanceEvidence, seedReleasedRule, type AdminFixture } from '../integration/admin/fixtures';
import { scenario } from '../integration/auth/support';

const pool = adminPool();
const usedTotpSteps = new WeakMap<AdminFixture['owner'], number>();

test.afterAll(async () => {
  await pool.end();
});

async function signIn(page: Page, account: AdminFixture['owner']) {
  page.setDefaultTimeout(5000);
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await expect(page).toHaveURL(/\/login\/totp$/);
  const remaining = 30_000 - (Date.now() % 30_000);
  if (remaining < 1_500 || usedTotpSteps.get(account) === Math.floor(Date.now() / 30_000)) await page.waitForTimeout(remaining + 60);
  account.clock.value = Date.now();
  usedTotpSteps.set(account, Math.floor(account.clock.value / 30_000));
  await page.getByLabel('Mã xác thực', { exact: true }).fill(await account.code());
  await page.getByRole('button', { name: 'Xác thực', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Đã đăng nhập', exact: true })).toBeVisible();
}

async function freshMfa(page: Page, account: AdminFixture['owner']) {
  await page.goto('/login/totp');
  const remaining = 30_000 - (Date.now() % 30_000);
  await page.waitForTimeout(remaining + 60);
  account.clock.value = Date.now();
  await page.getByLabel('Mã xác thực', { exact: true }).fill(await account.code());
  await page.getByRole('button', { name: 'Xác thực', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Đã đăng nhập', exact: true })).toBeVisible();
}

async function switchAccount(context: BrowserContext) {
  await context.clearCookies();
}

async function createdEmployeeId(page: Page, displayName: string) {
  return page.evaluate(async (name) => {
    const response = await fetch('/api/admin?view=employees');
    const payload = await response.json() as { items: Array<{ employeeId: string; displayName: string }> };
    return payload.items.find((employee) => employee.displayName === name)?.employeeId ?? null;
  }, displayName);
}

test('authenticated dashboard exposes payroll work queue', async ({ page }) => {
  test.setTimeout(60_000);
  const fixture = await adminFixture(pool);
  await signIn(page, fixture.owner);
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Việc cần làm hôm nay', exact: true })).toBeVisible({ timeout: 5_000 });
});

test('an unknown create response blocks duplicate payroll submission', async ({ page }) => {
  test.setTimeout(60_000);
  const fixture = await adminFixture(pool);
  await signIn(page, fixture.accountant);
  await page.goto('/pay-runs');
  await page.getByLabel('Cơ sở làm việc', { exact: true }).selectOption(fixture.workplaceId);
  await page.route('**/api/admin', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fetch();
    await route.abort('failed');
  });
  const create = page.getByRole('button', { name: 'Tạo bảng lương tháng 08/2026', exact: true });
  await create.click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Chưa xác nhận được thay đổi');
  await expect(create).toBeDisabled();
  expect((await pool.query('SELECT id FROM pay_runs WHERE workplace_id=$1', [fixture.workplaceId])).rows).toHaveLength(1);
  await page.unroute('**/api/admin');
  await page.reload();
  await page.getByLabel('Cơ sở làm việc', { exact: true }).selectOption(fixture.workplaceId);
  await create.click();
  await expect(page.getByRole('button', { name: 'Tính lương', exact: true })).toBeVisible();
  expect((await pool.query('SELECT id FROM pay_runs WHERE workplace_id=$1', [fixture.workplaceId])).rows).toHaveLength(1);
});

test('an authenticated employee-to-finalized-pay-run flow preserves attendance, authorization, trace, and stored result', async ({ page, context }) => {
  test.setTimeout(180_000);
  const fixture = await adminFixture(pool);
  const name = 'Nhân viên W5 giả lập';

  await signIn(page, fixture.accountant);
  await page.goto('/employees');
  await page.getByLabel('Họ và tên', { exact: true }).fill(name);
  await page.getByLabel('Cơ sở làm việc', { exact: true }).selectOption(fixture.workplaceId);
  await page.getByLabel('Lương tháng (VND)', { exact: true }).fill('8000000');
  await page.getByLabel('Ngày hiệu lực', { exact: true }).fill('2026-07-31');
  await page.getByRole('button', { name: 'Tạo nhân viên', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Đã tạo nhân viên');
  await expect(page.getByRole('table')).toContainText(name);
  await expect(page.getByText('Hợp đồng 12 tháng', { exact: true })).toBeVisible();
  await expect(page.getByText('Thử việc 6 ngày', { exact: true })).toBeVisible();
  const employeeId = await createdEmployeeId(page, name);
  expect(employeeId).not.toBeNull();
  await seedAttendanceEvidence(pool, fixture, employeeId!);

  await page.goto('/attendance');
  await page.getByLabel('Nhân viên', { exact: true }).selectOption(employeeId!);
  await page.getByLabel('Tháng', { exact: true }).fill('2026-08');
  await page.getByRole('button', { name: 'Xem bảng công', exact: true }).click();
  await page.getByLabel('Lý do đề xuất', { exact: true }).fill('Đối chiếu mốc chấm công tổng hợp');
  await page.getByRole('button', { name: 'Gửi đề xuất', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Đã lưu đề xuất');

  await switchAccount(context);
  await signIn(page, fixture.owner);
  await page.goto('/attendance');
  await page.getByLabel('Nhân viên', { exact: true }).selectOption(employeeId!);
  await page.getByLabel('Tháng', { exact: true }).fill('2026-08');
  await page.getByRole('button', { name: 'Xem bảng công', exact: true }).click();
  await page.getByLabel('Lý do phê duyệt', { exact: true }).fill('Đã kiểm tra dữ liệu chấm công');
  await page.getByRole('button', { name: 'Phê duyệt đề xuất', exact: true }).click();
  await page.getByRole('button', { name: 'Chốt bảng công tháng', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bảng công đã chốt', exact: true })).toBeVisible();
  await seedReleasedRule(pool, fixture.organizationId);

  await switchAccount(context);
  const payrollMaker = await scenario(pool, 'accountant', fixture.organizationId);
  await signIn(page, payrollMaker);
  // Use the browser's authenticated fetch: APIRequestContext excludes Secure
  // cookies on http://127.0.0.1 while Chromium permits this loopback context.
  const overviewResponse = await page.evaluate(async () => {
    const response = await fetch('/api/admin?view=overview', { cache: 'no-store' });
    return { status: response.status, body: await response.json() as unknown };
  });
  expect(overviewResponse.status, 'Authenticated calculator boundary').toBe(200);
  const overviewBoundary = overviewResponse.body as { calculator: { available: boolean; periodStart: string; periodEnd: string }; workplaces: Array<{ id: string }> };
  expect(overviewBoundary.calculator, 'Explicit synthetic calculator reached the server').toEqual({ available: true, periodStart: '2026-07-31T17:00:00.000Z', periodEnd: '2026-08-31T17:00:00.000Z' });
  expect(overviewBoundary.workplaces.some(workplace => workplace.id === fixture.workplaceId)).toBe(true);
  await page.goto('/pay-runs');
  await expect(page.locator('.status').filter({ hasText: 'Sẵn sàng tính lương' })).toBeVisible();
  await page.getByLabel('Cơ sở làm việc', { exact: true }).selectOption(fixture.workplaceId);
  await page.getByRole('button', { name: 'Tạo bảng lương tháng 08/2026', exact: true }).click();
  await expect(page.locator('.status').filter({ hasText: 'Nháp' }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Tính lương', exact: true }).click();
  await expect(page.locator('.status').filter({ hasText: 'Đã tính' }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Xem giải thích tính lương', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Giải thích tính lương', exact: true })).toContainText('Lương tháng');
  const evidenceRegion = page.getByRole('region', { name: 'Bằng chứng tính lương đã lưu' });
  await expect(evidenceRegion).toContainText(name);
  const evidenceRow = (await pool.query('SELECT snapshot_hash,compensation_hash,rule_pack_hash,calculator_artifact_hash,input_hash,result_hash FROM pay_run_employees WHERE employee_id=$1', [employeeId])).rows[0] as Record<string, string>;
  for (const hash of Object.values(evidenceRow)) await expect(evidenceRegion).toContainText(hash);
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.getByRole('button', { name: 'Gửi chủ doanh nghiệp duyệt', exact: true }).click();
  await expect(page.locator('.status').filter({ hasText: 'Chờ duyệt' }).last()).toBeVisible();

  const denied = await page.evaluate(async () => {
    const session = await fetch('/api/auth/session');
    const { csrfToken } = await session.json() as { csrfToken: string };
    const payRun = await fetch('/api/admin?view=overview');
    const overview = await payRun.json() as { payRuns: Array<{ id: string; version: number; status: string }> };
    const pending = overview.payRuns.find((run) => run.status === 'review_pending');
    const response = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ action: 'finalizePayRun', confirmed: true, input: { payRunId: pending?.id, expectedVersion: pending?.version } }),
    });
    return { code: (await response.json()).code, status: response.status };
  });
  expect(denied).toEqual({ code: 'FORBIDDEN', status: 403 });

  await switchAccount(context);
  await signIn(page, fixture.owner);
  await page.goto('/pay-runs');
  await page.getByRole('button', { name: 'Mở bảng lương chờ duyệt', exact: true }).click();
  await page.getByRole('button', { name: 'Phê duyệt bảng lương', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận duyệt', exact: true }).click();
  await expect(page.locator('.status').filter({ hasText: 'Đã duyệt' }).last()).toBeVisible();
  await freshMfa(page, fixture.owner);
  await page.goto('/pay-runs');
  await page.getByRole('button', { name: 'Mở bảng lương đã duyệt', exact: true }).click();
  await page.getByRole('button', { name: 'Chốt bảng lương', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Xác nhận chốt bảng lương', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Xác nhận chốt bảng lương', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Chốt bảng lương', exact: true }).click();
  await page.getByLabel('Tôi hiểu bảng lương sẽ được chốt bất biến', { exact: true }).check();
  await page.getByRole('button', { name: 'Xác nhận chốt', exact: true }).click();
  await expect(page.locator('.status').filter({ hasText: 'Đã chốt' }).last()).toBeVisible();
  await expect(page.getByText('Kết quả đã lưu', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chốt bảng lương', exact: true })).toHaveCount(0);
  const stored = (await pool.query('SELECT p.id,p.status,e.canonical_result,e.result_hash FROM pay_runs p JOIN pay_run_employees e ON e.pay_run_id=p.id WHERE p.workplace_id=$1',[fixture.workplaceId])).rows;
  expect(stored).toHaveLength(1);
  expect(stored[0].status).toBe('finalized');
  expect(JSON.parse(stored[0].canonical_result)).toMatchObject({gross:'8000000',employeeInsuranceTotal:'840000',pit:'0',net:'7160000'});
  await page.reload();
  await page.getByRole('row').filter({ hasText: 'Đã chốt' }).getByRole('button',{name:'Mở kỳ lương',exact:true}).click();
  await expect(page.getByText('Kết quả đã lưu',{exact:true})).toBeVisible();
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'ops/evidence/PAY-W5-02a-pay-run-desktop.png',fullPage:true});
});
