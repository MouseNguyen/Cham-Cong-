import {test,expect} from '@playwright/test';
import {deliveryPool,seedIds} from '../integration/admin/delivery-fixtures';
import {scenario} from '../integration/auth/support';
import type {DeliveryToolHost} from '../../apps/web/src/lib/admin/delivery-tools';
const pool=deliveryPool();test.afterAll(()=>pool.end());
test('finalized delivery panel',async({page})=>{
 test.setTimeout(180000);
 const account=await scenario(pool,'owner',seedIds().organizationId);
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(account.email);await page.getByLabel('Mật khẩu',{exact:true}).fill(account.password);await page.getByRole('button',{name:'Tiếp tục',exact:true}).click();
 await expect(page).toHaveURL(/login\/totp/);if(30000-Date.now()%30000<2000)await page.waitForTimeout(2100);account.clock.value=Date.now();
 await page.getByLabel('Mã xác thực',{exact:true}).fill(await account.code());await page.getByRole('button',{name:'Xác thực',exact:true}).click();await expect(page.getByRole('heading',{name:'Đã đăng nhập',exact:true})).toBeVisible();
 await page.goto('/pay-runs');await page.getByRole('button',{name:'Mở kỳ lương',exact:true}).first().click();
 await expect(page.getByRole('heading',{name:'Giao phiếu lương',exact:true})).toBeVisible();
 if(process.env.PAYSLIP_DB_TEST_MODE==='Red')return;
 const confirm=async(name:string)=>{await page.getByRole('button',{name,exact:true}).click();await page.getByLabel('Tôi đã kiểm tra và đồng ý thao tác này').check();await page.getByRole('button',{name:'Xác nhận thao tác',exact:true}).click();};
 await confirm('Tạo PDF mã hóa');await expect(page.getByRole('link',{name:'Tải PDF mã hóa',exact:true})).toBeVisible({timeout:60000});
 const download=page.waitForEvent('download');await page.getByRole('link',{name:'Tải PDF mã hóa',exact:true}).click();expect((await download).suggestedFilename()).toMatch(/^[a-f0-9-]+\.pdf$/);
 await confirm('Kiểm tra người nhận');await expect(page.getByText('Bản xem trước đã lưu',{exact:true})).toBeVisible();
 // Page tools only open normal confirmation UI, and reject extra confirmation fields.
 const result=await page.evaluate(()=>{
  const tools=(window as Window&DeliveryToolHost).paySlipDeliveryTools!;
  const tool=tools.find(t=>t.name==='delivery_review_release')!;let rejected=false;try{tool.execute({confirmed:true});}catch{rejected=true;}
  return {first:tools[0]?.name,rejected,result:tool.execute({}),secretTool:tools.some(t=>t.name.includes('password'))};
 });expect(result).toEqual({first:'delivery_status',rejected:true,result:{status:'human_confirmation_required'},secretTool:false});
 await expect(page.getByRole('button',{name:'Xác nhận thao tác',exact:true})).toBeDisabled();await page.keyboard.press('Escape');
 // Force stale MFA, then exercise real browser step-up and persisted preview reload.
 await pool.query("UPDATE sessions SET mfa_satisfied_at=now()-interval '6 minutes' WHERE user_id=$1 AND revoked_at IS NULL",[account.id]);
 await confirm('Gửi thử qua bộ giả lập');await expect(page.getByText('Cần xác thực hai bước mới. Xác thực lại, rồi mở kỳ lương để kiểm tra.',{exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Xác thực lại trước khi giao',exact:true}).click();
 await page.waitForTimeout(30000-Date.now()%30000+100);account.clock.value=Date.now();await page.getByLabel('Mã xác thực',{exact:true}).fill(await account.code());await page.getByRole('button',{name:'Xác thực',exact:true}).click();await expect(page.getByRole('heading',{name:'Đã đăng nhập',exact:true})).toBeVisible();
 await page.goto('/pay-runs');await page.getByRole('button',{name:'Mở kỳ lương',exact:true}).click();await expect(page.getByText('Bản xem trước đã lưu',{exact:true})).toBeVisible();
 await confirm('Gửi thử qua bộ giả lập');await expect(page.getByTestId('delivery-status')).toContainText('Bộ giả lập đã tiếp nhận');
 await confirm('Xem mật khẩu riêng');
 // Never include the secret in assertion output, screenshot, trace or page-tool output.
 try{
  await expect.poll(()=>page.getByLabel('Mật khẩu PDF',{exact:true}).evaluate(e=>(e.textContent?.length??0)>15)).toBe(true);
  expect(await page.evaluate(()=>!(window as Window&DeliveryToolHost).paySlipDeliveryTools)).toBe(true);
 }finally{await page.getByRole('button',{name:'Ẩn mật khẩu',exact:true}).click();}
 await confirm('Xác nhận đã giao mật khẩu');
 await expect(page.getByRole('list',{name:'Biên nhận đã lưu'})).toContainText('Đã xác nhận giao mật khẩu riêng');
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'ops/evidence/PAY-W5-02b-desktop.png',fullPage:true});
 await page.reload();await page.getByRole('button',{name:'Mở kỳ lương',exact:true}).click();await expect(page.getByTestId('delivery-status')).toContainText('Bộ giả lập đã tiếp nhận');
 await page.setViewportSize({width:800,height:1280});await expect(page.getByRole('list',{name:'Biên nhận đã lưu'})).toContainText('Đã xác nhận giao mật khẩu riêng');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Tải lại biên nhận',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByTestId('delivery-status')).toContainText('Bộ giả lập đã tiếp nhận');
 await page.screenshot({path:'ops/evidence/PAY-W5-02b-tablet.png',fullPage:true});
 const saved=(await pool.query("SELECT count(*)::int n FROM payslip_release_receipts WHERE organization_id=$1 AND kind='queued_fake'",[account.org])).rows[0];expect(saved.n).toBe(1);
 await page.goto('/dashboard');expect(await page.evaluate(()=>!(window as Window&DeliveryToolHost).paySlipDeliveryTools)).toBe(true);
});
