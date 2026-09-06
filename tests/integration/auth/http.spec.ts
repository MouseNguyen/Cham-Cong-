import {afterAll,expect,test} from "vitest";
import {testPool,scenario} from "./support";
const pool=testPool();afterAll(()=>pool.end());
const origin="http://127.0.0.1:46217";
function post(path:string,data:unknown,cookie="",csrf="",requestOrigin=origin){return new Request(origin+path,{method:"POST",headers:{"content-type":"application/json",origin:requestOrigin,host:new URL(origin).host,cookie,"x-csrf-token":csrf},body:JSON.stringify(data)});}
test("real auth handlers enforce password+TOTP, secure cookies, role gate and logout CSRF",async()=>{
 const {createAuthHandlers}=await import("../../../apps/web/src/lib/auth/http");
 const s=await scenario(pool,"accountant"),h=createAuthHandlers(s.repo,origin);
 const p=await h.login(post("/api/auth/login",{email:s.email,password:s.password}));
 expect(p.status).toBe(200);const pending=p.headers.get("set-cookie")!.split(";")[0]!;
 expect((await h.session(new Request(origin+"/api/auth/session",{headers:{cookie:pending}}))).status).toBe(401);
 const done=await h.totp(post("/api/auth/totp",{code:await s.code()},pending));
 expect(done.status).toBe(200);const cookies=done.headers.getSetCookie();const set=cookies.find(v=>v.startsWith("pay_slip_session="))!;
 expect(set.includes("Secure")&&set.includes("HttpOnly")&&set.includes("SameSite=Strict")).toBe(true);
 const session=set.split(";")[0]!,body=await done.json();
 expect((await h.authorize(post("/api/auth/authorize",{command:"PAY_RUN_FINALIZE",organizationId:s.org},session,body.csrfToken))).status).toBe(403);
 expect((await h.logout(post("/api/auth/logout",{},session))).status).toBe(403);
 expect((await h.logout(post("/api/auth/logout",{},session,body.csrfToken))).status).toBe(200);
 expect((await h.session(new Request(origin+"/api/auth/session",{headers:{cookie:session}}))).status).toBe(401);
});
test("cross-origin and oversized authentication requests are rejected before authentication",async()=>{
 const {createAuthHandlers}=await import("../../../apps/web/src/lib/auth/http");const s=await scenario(pool);const h=createAuthHandlers(s.repo,origin);
 expect((await h.login(post("/api/auth/login",{email:s.email,password:s.password},"","","https://example.invalid"))).status).toBe(403);
 expect((await h.login(post("/api/auth/login",{email:s.email,password:"x".repeat(5000)}))).status).toBe(400);
});
