import { afterAll, beforeAll, expect, test } from 'vitest';
import { login } from '../auth/support';
import { adminFixture, adminPool, type AdminFixture } from './fixtures';

const pool = adminPool();
const origin = process.env.PAYSLIP_ADMIN_TEST_ORIGIN;
let fixture: AdminFixture;

beforeAll(async () => {
  if (!origin) throw new Error('ADMIN_TEST_ORIGIN_REQUIRED');
  fixture = await adminFixture(pool);
});

afterAll(async () => {
  await pool.end();
});

test('live admin HTTP endpoint requires an authentic session, exact origin, and CSRF before mutations', async () => {
  if (!origin) throw Error('ADMIN_TEST_ORIGIN_REQUIRED');
  const unauthenticated = await fetch(`${origin}/api/admin?view=overview`);
  expect(unauthenticated.status).toBe(401);
  expect(await unauthenticated.json()).toEqual({ code: 'UNAUTHENTICATED' });

  const session = await login(fixture.accountant);
  const cookie = `pay_slip_session=${session.token}`;
  const overview = await fetch(`${origin}/api/admin?view=overview`, { headers: { cookie } });
  expect(overview.status).toBe(200);
  expect((await overview.json() as { workplaces: Array<{ id: string }> }).workplaces.map((workplace) => workplace.id)).toContain(fixture.workplaceId);

  const payload = JSON.stringify({ action: 'createEmployee', input: { workplaceId: fixture.workplaceId } });
  const missingCsrf = await fetch(`${origin}/api/admin`, { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin }, body: payload });
  expect(missingCsrf.status).toBe(403);
  expect(await missingCsrf.json()).toEqual({ code: 'CSRF' });

  const crossOrigin = await fetch(`${origin}/api/admin`, { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: 'https://example.invalid', 'x-csrf-token': session.csrfToken }, body: payload });
  expect(crossOrigin.status).toBe(403);
  expect(await crossOrigin.json()).toEqual({ code: 'CSRF' });
});

test('the owner cannot create a maker run through the admin workflow', async () => {
  if (!origin) throw Error('ADMIN_TEST_ORIGIN_REQUIRED');
  const session = await login(fixture.owner);
  const response = await fetch(`${origin}/api/admin`, { method: 'POST', headers: {
    'content-type': 'application/json', cookie: `pay_slip_session=${session.token}`, origin, 'x-csrf-token': session.csrfToken,
  }, body: JSON.stringify({ action: 'createPayRun', input: { workplaceId: fixture.workplaceId, periodStart: '2026-07-31T17:00:00.000Z', periodEnd: '2026-08-31T17:00:00.000Z' } }) });
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ code: 'ACCOUNTANT_MAKER_REQUIRED' });
});
