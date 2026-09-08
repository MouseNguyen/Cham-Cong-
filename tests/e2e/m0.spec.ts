import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {seedM0Destination} from '../integration/admin/m0-fixtures';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { adminFixture, adminPool, seedAttendanceEvidence, seedReleasedRule, type AdminFixture } from '../integration/admin/m0-fixtures';
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

test('M0 full-time holiday snapshot to encrypted PDF and fake receipt', async ({ page, context }) => {
  test.setTimeout(240_000);
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
  const bound=(await pool.query('SELECT e.canonical_input,e.canonical_result,e.input_hash,e.result_hash,s.canonical_payload,s.content_hash FROM pay_run_employees e JOIN attendance_snapshots s ON s.id=e.snapshot_id WHERE e.employee_id=$1',[employeeId])).rows[0];
  const snapshot=JSON.parse(bound.canonical_payload),input=JSON.parse(bound.canonical_input),result=JSON.parse(bound.canonical_result);
  const holidayMs=snapshot.segments.filter((s:{classification:string})=>s.classification==='holiday_daytime').reduce((sum:bigint,s:{durationMs:string})=>sum+BigInt(s.durationMs),0n).toString();
  const evidence={scope:'synthetic_M0',stage:'calculated',snapshotHash:bound.content_hash,inputHash:bound.input_hash,resultHash:bound.result_hash,snapshotHolidayMilliseconds:holidayMs,calculatorHolidayMilliseconds:input.holiday?.payableMilliseconds??null,independentExpected:{divisorHours:'80',premiumBasisPoints:30000,holidayPremiumVnd:'600000',gross:'8600000',employeeInsuranceTotal:'840000',pit:'0',net:'7760000'},actual:result};
  writeFileSync('ops/evidence/PAY-M0-flow.json',JSON.stringify(evidence,null,2)+'\n');
  expect(createHash('sha256').update(bound.canonical_payload).digest('hex')).toBe(bound.content_hash);
  expect(holidayMs,'Approved snapshot must retain the two synthetic holiday hours').toBe('7200000');
  expect(input.holiday?.payableMilliseconds,'M0_HOLIDAY_SNAPSHOT_BINDING_REQUIRED').toBe(holidayMs);
  expect(result).toMatchObject({gross:'8600000',employeeInsuranceTotal:'840000',pit:'0',net:'7760000'});
  await page.getByRole('button', { name: 'Xem giải thích tính lương', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Giải thích tính lương', exact: true })).toContainText('Lương tháng');
  await expect(page.getByRole('dialog', { name: 'Giải thích tính lương', exact: true })).toContainText('Phụ cấp làm ngày lễ ban ngày');
  await expect(page.getByRole('dialog', { name: 'Giải thích tính lương', exact: true })).toContainText('600000');
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
  await expect(page.getByRole('heading',{name:'Giao phiếu lương',exact:true})).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chốt bảng lương', exact: true })).toHaveCount(0);
  const stored = (await pool.query('SELECT p.id,p.status,e.canonical_result,e.result_hash FROM pay_runs p JOIN pay_run_employees e ON e.pay_run_id=p.id WHERE p.workplace_id=$1',[fixture.workplaceId])).rows;
  expect(stored).toHaveLength(1);
  expect(stored[0].status).toBe('finalized');
  expect(JSON.parse(stored[0].canonical_result)).toMatchObject({gross:'8600000',employeeInsuranceTotal:'840000',pit:'0',net:'7760000'});
  await page.reload();
  await page.getByRole('row').filter({ hasText: 'Đã chốt' }).getByRole('button',{name:'Mở kỳ lương',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Giao phiếu lương',exact:true})).toBeVisible();
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'ops/evidence/PAY-M0-finalized.png',fullPage:true});
  await seedM0Destination(pool,fixture.organizationId,employeeId!);
  await page.getByRole('button',{name:'Tải lại biên nhận',exact:true}).click();
  const confirm=async(name:string)=>{await page.getByRole('button',{name,exact:true}).click();await page.getByLabel('Tôi đã kiểm tra và đồng ý thao tác này').check();await page.getByRole('button',{name:'Xác nhận thao tác',exact:true}).click();};
  await confirm('Tạo PDF mã hóa');await expect(page.getByRole('link',{name:'Tải PDF mã hóa',exact:true})).toBeVisible({timeout:60000});
  const download=page.waitForEvent('download');await page.getByRole('link',{name:'Tải PDF mã hóa',exact:true}).click();expect((await download).suggestedFilename()).toMatch(/^[a-f0-9-]+\.pdf$/);
  await confirm('Kiểm tra người nhận');await expect(page.getByText('Bản xem trước đã lưu',{exact:true})).toBeVisible();await confirm('Gửi thử qua bộ giả lập');
  await expect(page.getByTestId('delivery-status')).toContainText('Bộ giả lập đã tiếp nhận');
  await page.reload();await page.getByRole('button',{name:'Mở kỳ lương',exact:true}).click();await expect(page.getByTestId('delivery-status')).toContainText('Bộ giả lập đã tiếp nhận');
  const receipts=(await pool.query("SELECT r.id,r.kind,o.status,p.binding FROM payslip_release_receipts r JOIN payslip_release_previews p ON p.id=r.preview_id JOIN outbox_dispatches o ON o.job_id=r.job_id WHERE r.organization_id=$1 AND r.kind='queued_fake'",[fixture.organizationId])).rows;
  expect(receipts).toHaveLength(1);expect(receipts[0].status).toBe('accepted');expect(receipts[0].binding.employeeId).toBe(employeeId);expect(receipts[0].binding.payRunId).toBe(stored[0].id);
  writeFileSync('ops/evidence/PAY-M0-flow.json',JSON.stringify({...evidence,stage:'fake_accepted',payRunId:stored[0].id,receipt:receipts[0],finalizedResultHash:stored[0].result_hash},null,2)+'\n');
  await page.screenshot({path:'ops/evidence/PAY-M0-delivery.png',fullPage:true});
});
