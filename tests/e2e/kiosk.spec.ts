import { test, expect } from '@playwright/test';
import { ingressFixture } from '../integration/attendance/ingress-support';
test.use({baseURL:'http://127.0.0.1:46218',viewport:{width:800,height:1100}});
let f:Awaited<ReturnType<typeof ingressFixture>>;
test.beforeEach(async({page,context})=>{f=await ingressFixture();await context.addCookies([{name:'pay_slip_kiosk',value:f.device.token,url:'http://127.0.0.1:46218',httpOnly:true,secure:true,sameSite:'Strict'}]);await page.goto('/');await expect(page.getByRole('heading',{name:'Chấm công'})).toBeVisible({timeout:5000});});
test.afterEach(async()=>{if(f)await f.close()});
async function punch(page:import('@playwright/test').Page,pin=f.pin){await page.getByLabel('Mã nhân viên',{exact:true}).fill(f.code);await page.getByLabel('PIN 6 số',{exact:true}).fill(pin);await page.getByRole('button',{name:'Vào ca',exact:true}).click();}
async function count(){return (await f.app.query('SELECT count(*)::int n FROM clock_events WHERE employee_id=$1',[f.employeeId])).rows[0].n as number;}

test('three interactions record durable attendance and clear PIN',async({page})=>{
 await punch(page);await expect(page.getByRole('status')).toContainText('Đã ghi nhận vào ca');await expect(page.getByLabel('PIN 6 số',{exact:true})).toHaveValue('');expect(await count()).toBe(1);
 await page.getByLabel('PIN 6 số',{exact:true}).fill(f.pin);await page.getByRole('button',{name:'Ra ca',exact:true}).click();await expect(page.getByRole('status')).toContainText('Đã ghi nhận ra ca');expect(await count()).toBe(2);
 expect(await page.evaluate(()=>document.cookie)).not.toContain('pay_slip_kiosk');expect(await page.evaluate(()=>localStorage.length+sessionStorage.length)).toBe(0);
});

test('definitive rejection never shows a saved event',async({page})=>{
 await punch(page,f.pin==='000000'?'999999':'000000');await expect(page.getByRole('status')).toContainText('Chưa ghi nhận chấm công');await expect(page.getByLabel('PIN 6 số',{exact:true})).toHaveValue('');expect(await count()).toBe(0);
});

test('lost response after real commit reconciles the original key without a PIN or duplicate',async({page})=>{
 await page.route('**/clock',async route=>{await route.fetch();await route.abort('failed');},{times:1});
 await page.route('**/reconcile',async route=>{await new Promise(r=>setTimeout(r,700));await route.continue();});
 await punch(page);await expect(page.getByRole('status')).toContainText('Chưa xác nhận được');await expect(page.getByLabel('PIN 6 số',{exact:true})).toHaveValue('');
 await expect(page.getByRole('status')).toContainText('Đã ghi nhận vào ca',{timeout:10000});expect(await count()).toBe(1);expect(await page.evaluate(()=>sessionStorage.length)).toBe(0);
});

test('unreceived command stays uncertain across reload and never retains PIN',async({page})=>{
 await page.route('**/clock',route=>route.abort('failed'));
 await punch(page);await expect(page.getByRole('status')).toContainText('Chưa xác nhận được');const pending=await page.evaluate(()=>sessionStorage.getItem('pay-slip-pending'));expect(pending).toBeTruthy();expect(pending).not.toContain(f.pin);expect(pending).not.toContain(f.device.token);
 await page.reload();await expect(page.getByRole('status')).toContainText('Chưa xác nhận được');await expect(page.getByLabel('PIN 6 số',{exact:true})).toHaveValue('');await expect(page.getByRole('button',{name:'Vào ca',exact:true})).toBeDisabled();expect(await count()).toBe(0);
});

test('tablet and narrow layout preserve 44px controls and expose no employee list or payroll',async({page})=>{
 for(const width of [800,360]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);for(const control of await page.locator('input,button:visible').all()){const b=await control.boundingBox();expect(b?.width).toBeGreaterThanOrEqual(44);expect(b?.height).toBeGreaterThanOrEqual(44);}}
 await expect(page.locator('body')).not.toContainText('Synthetic kiosk employee');await expect(page.locator('body')).not.toContainText('8.000.000');
 await page.setViewportSize({width:800,height:1100});await page.screenshot({path:'.tmp/PAY-W3-02b/kiosk-tablet.png',fullPage:true});
});
