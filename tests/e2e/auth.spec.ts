import {test,expect} from "@playwright/test";
import {testPool,scenario} from "../integration/auth/support";
type Account=Awaited<ReturnType<typeof scenario>>;
const pool=testPool();let owner:Account,accountant:Account;
test.beforeAll(async()=>{const org=process.env.PAYSLIP_ORGANIZATION_ID;if(!org)throw Error("SYNTHETIC_ORGANIZATION_REQUIRED");owner=await scenario(pool,"owner",org);accountant=await scenario(pool,"accountant",org);});
test.afterAll(()=>pool.end());
async function signIn(page:import("@playwright/test").Page,s:Account){
 await page.goto("/login");await page.getByLabel("Email",{exact:true}).fill(s.email);await page.getByLabel("Mật khẩu",{exact:true}).fill(s.password);await page.getByRole("button",{name:"Tiếp tục",exact:true}).click();
 await expect(page).toHaveURL(/\/login\/totp$/);
 const remaining=30_000-Date.now()%30_000;if(remaining<1500)await page.waitForTimeout(remaining+50);
 s.clock.value=Date.now();await page.getByLabel("Mã xác thực",{exact:true}).fill(await s.code());await page.getByRole("button",{name:"Xác thực",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Đã đăng nhập",exact:true})).toBeVisible();
}
test("owner completes actual password/TOTP flow with secure cookies and logout revocation",async({page,context})=>{
 await signIn(page,owner);
 const cookies=await context.cookies();expect(cookies.some(c=>c.name==="pay_slip_session"&&c.httpOnly&&c.secure&&c.sameSite==="Strict")).toBe(true);
 expect(await page.evaluate(()=>document.cookie.includes("pay_slip_session")||localStorage.length>0||sessionStorage.length>0)).toBe(false);
 await page.getByRole("button",{name:"Đăng xuất",exact:true}).click();await expect(page.getByRole("heading",{name:"Chào bạn trở lại",exact:true})).toBeVisible();
 expect(await page.evaluate(async()=>(await fetch("/api/auth/session")).status)).toBe(401);
 expect(Number((await pool.query("SELECT count(*) FROM sessions WHERE user_id=$1 AND revoked_at IS NULL",[owner.id])).rows[0].count)).toBe(0);
});
test("accountant cannot finalize through the real API; cross-site mutation is denied",async({page,context})=>{
 await signIn(page,accountant);
 const result=await page.evaluate(async org=>{
  const session=await fetch("/api/auth/session");const state=await session.json();
  const response=await fetch("/api/auth/authorize",{method:"POST",headers:{"content-type":"application/json","x-csrf-token":state.csrfToken},body:JSON.stringify({command:"PAY_RUN_FINALIZE",organizationId:org,role:"owner"})});
  return {sessionStatus:session.status,status:response.status,code:(await response.json()).code};
 },accountant.org);
 expect(result).toEqual({sessionStatus:200,status:403,code:"FORBIDDEN"});
 const cross=await context.request.post("/api/auth/logout",{headers:{origin:"https://example.invalid"}});
 expect(cross.status()).toBe(403);
});
test("invalid password does not advance to MFA or create a session",async({page})=>{
 await page.goto("/login");await page.getByLabel("Email",{exact:true}).fill(owner.email);await page.getByLabel("Mật khẩu",{exact:true}).fill("invalid-synthetic-password");await page.getByRole("button",{name:"Tiếp tục",exact:true}).click();
 await expect(page.getByRole("main").getByRole("alert")).toContainText("Không thể đăng nhập");
 expect(await page.evaluate(async()=>(await fetch("/api/auth/session")).status)).toBe(401);
});
