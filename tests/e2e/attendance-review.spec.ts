import { test, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import { scenario } from '../integration/auth/support';

import { canonicalizeWeeklySchedule, hashWeeklySchedule, type WeeklySchedule } from '../../packages/attendance-domain/src/schedule';
const url=process.env.PAYSLIP_TEST_DATABASE_URL;if(!url||new URL(url).pathname!=='/payslip_w3_03_synthetic')throw Error('OWNED_REVIEW_DATABASE_REQUIRED');
const pool=new Pool({connectionString:url,max:3});
let owner:Awaited<ReturnType<typeof scenario>>,accountant:Awaited<ReturnType<typeof scenario>>,employeeId:string,workplaceId:string;
test.beforeAll(async()=>{
 const org=process.env.PAYSLIP_ORGANIZATION_ID;if(!org)throw Error('ORG_REQUIRED');owner=await scenario(pool,'owner',org);accountant=await scenario(pool,'accountant',org);workplaceId=randomUUID();await pool.query("INSERT INTO workplaces(id,organization_id,name) VALUES($1,$2,'Synthetic review shop')",[workplaceId,org]);
 employeeId=randomUUID();await pool.query("INSERT INTO employees(id,organization_id,workplace_id,display_name,status) VALUES($1,$2,$3,'Nhân viên thử nghiệm','active')",[employeeId,org,workplaceId]);
 const weekly=Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[day,[{start:'08:00',end:'18:00'}]])) as unknown as WeeklySchedule;const payload=canonicalizeWeeklySchedule(weekly),hash=hashWeeklySchedule(weekly),template=randomUUID();
 await pool.query('INSERT INTO opening_hour_versions(id,organization_id,workplace_id,valid_from,canonical_payload,content_hash) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),org,workplaceId,new Date('2026-07-31T17:00:00Z'),payload,hash]);
 await pool.query("INSERT INTO schedule_templates(id,organization_id,name,canonical_payload,content_hash) VALUES($1,$2,'Synthetic review schedule',$3,$4)",[template,org,payload,hash]);await pool.query('INSERT INTO schedule_assignments(id,organization_id,workplace_id,employee_id,template_id,valid_from) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),org,workplaceId,employeeId,template,new Date('2026-07-31T17:00:00Z')]);
 for(const [direction,at] of [['IN','2026-08-04T01:00:00.000Z'],['OUT','2026-08-04T02:00:00.061Z']]){const id=randomUUID();await pool.query('INSERT INTO clock_events(id,organization_id,workplace_id,employee_id,idempotency_key,direction,occurred_at,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,org,workplaceId,employeeId,id,direction,new Date(at!),createHash('sha256').update(id).digest('hex')]);}
});
test.afterAll(()=>pool.end());
async function signIn(page:Page,account:typeof owner){page.setDefaultTimeout(5000);console.log('review stage: login');await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(account.email);await page.getByLabel('Mật khẩu',{exact:true}).fill(account.password);await page.getByRole('button',{name:'Tiếp tục',exact:true}).click();await expect(page).toHaveURL(/\/login\/totp$/);const remaining=30000-Date.now()%30000;if(remaining<1500)await page.waitForTimeout(remaining+60);account.clock.value=Date.now();await page.getByLabel('Mã xác thực',{exact:true}).fill(await account.code());await page.getByRole('button',{name:'Xác thực',exact:true}).click();await expect(page.getByRole('heading',{name:'Đã đăng nhập',exact:true})).toBeVisible();console.log('review stage: authenticated');await page.goto('/attendance');await page.getByLabel('Nhân viên',{exact:true}).selectOption(employeeId);console.log('review stage: employee selected');await page.getByLabel('Tháng',{exact:true}).fill('2026-08');console.log('review stage: loading month');const loaded=page.waitForResponse(r=>r.url().includes('/api/attendance?employeeId='),{timeout:10000});await page.getByRole('button',{name:'Xem bảng công',exact:true}).click();const response=await loaded;expect(response.status()).toBe(200);console.log('review stage: month loaded');await expect(page.getByRole('heading',{name:'Chấm công gốc',exact:true})).toBeVisible();}

test('accountant proposes and a separate owner approves and freezes the real monthly snapshot',async({browser})=>{
 const makerContext=await browser.newContext({baseURL:'http://127.0.0.1:46217'}),checkerContext=await browser.newContext({baseURL:'http://127.0.0.1:46217'});const maker=await makerContext.newPage(),checker=await checkerContext.newPage();
 try{await signIn(maker,accountant);await expect(maker.getByRole('button',{name:'Phê duyệt đề xuất',exact:true})).toHaveCount(0);await maker.getByLabel('Lý do đề xuất',{exact:true}).fill('Đối chiếu chấm công và lịch làm việc trong dữ liệu thử nghiệm.');await maker.getByRole('button',{name:'Gửi đề xuất',exact:true}).click();await expect(maker.getByRole('status')).toContainText('Đã lưu đề xuất');
 await signIn(checker,owner);await checker.getByLabel('Lý do phê duyệt',{exact:true}).fill('Đã kiểm tra độc lập chấm công gốc và khoảng thời gian đề xuất.');await checker.getByRole('button',{name:'Phê duyệt đề xuất',exact:true}).click();await expect(checker.getByRole('status')).toContainText('Đã phê duyệt');await checker.getByRole('button',{name:'Chốt bảng công tháng',exact:true}).click();await expect(checker.getByRole('heading',{name:'Bảng công đã chốt',exact:true})).toBeVisible();
 const row=(await pool.query('SELECT canonical_payload,content_hash FROM attendance_snapshots WHERE employee_id=$1',[employeeId])).rows[0];expect(row).toBeTruthy();expect(createHash('sha256').update(row.canonical_payload).digest('hex')).toBe(row.content_hash);await expect(checker.getByText(row.content_hash,{exact:true})).toBeVisible();await checker.screenshot({path:'.tmp/PAY-W3-03/review-approved.png',fullPage:true});
 }finally{await makerContext.close().catch(()=>{});await checkerContext.close().catch(()=>{});}
});

test('private review denies unauthenticated access and cross-origin mutations',async({page})=>{
 const unauth=await page.request.get('/api/attendance?list=employees');expect(unauth.status()).toBe(401);await page.goto('/attendance');await expect(page.getByRole('link',{name:'Đăng nhập',exact:true})).toBeVisible();
 const denied=await page.request.post('/api/attendance',{headers:{origin:'https://example.invalid'},data:{action:'finalize',employeeId,workplaceId,month:'2026-08'}});expect([401,403]).toContain(denied.status());
});
