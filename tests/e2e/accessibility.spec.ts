import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { adminFixture, adminPool, type AdminFixture } from '../integration/admin/fixtures';

const pool = adminPool();
const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');

test.afterAll(async () => {
  await pool.end();
});

async function signIn(page: Page, fixture: AdminFixture) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(fixture.owner.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(fixture.owner.password);
  await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  const remaining = 30_000 - (Date.now() % 30_000);
  if (remaining < 1_500) await page.waitForTimeout(remaining + 60);
  fixture.owner.clock.value = Date.now();
  await page.getByLabel('Mã xác thực', { exact: true }).fill(await fixture.owner.code());
  await page.getByRole('button', { name: 'Xác thực', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Đã đăng nhập', exact: true })).toBeVisible();
}

test('admin shell keeps Vietnamese labels, keyboard focus, 44px controls, and no horizontal overflow at iPOS tablet width', async ({ page }) => {
  page.setDefaultTimeout(5000);
  test.setTimeout(60000);
  const fixture = await adminFixture(pool);
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, fixture);
  await page.goto('/employees');

  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Quản trị bảng lương', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nhân viên', exact: true })).toBeVisible();
  await expect(page.getByLabel('Họ và tên', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Lương tháng (VND)', { exact: true })).toBeVisible();
  await page.addScriptTag({ path: axePath });
  const audit = await page.evaluate(async () => (window as unknown as { axe: { run: (node: Document, options: { runOnly: { type: string; values: string[] } }) => Promise<{ violations: unknown[] }> } }).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }));
  expect(audit.violations).toEqual([]);

  await page.keyboard.press('Tab');
  await expect(page.locator(':focus-visible')).toHaveCount(1);
  const create = page.getByRole('button', { name: 'Tạo nhân viên', exact: true });
  const box = await create.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({path:'ops/evidence/PAY-W5-02a-employees-tablet.png',fullPage:true});
  await page.setViewportSize({ width: 720, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
