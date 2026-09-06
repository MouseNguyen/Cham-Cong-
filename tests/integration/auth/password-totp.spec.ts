import {denied} from "./assertions";
import {afterAll,expect,test} from "vitest";
import {testPool,scenario,login} from "./support";
const pool=testPool(); afterAll(()=>pool.end());
test("password is only a challenge; MFA issues a hashed revocable owner session",async()=>{
 const s=await scenario(pool);const pending=await s.repo.passwordLogin(s.email,s.password,"source");
 await denied(s.repo.actor(pending.challenge),undefined);
 const session=await s.repo.completeTotp(pending.challenge,await s.code(),"source");
 expect((await s.repo.actor(session.token)).userId===s.id).toBe(true);
 const stored=(await pool.query("SELECT token_hash,csrf_hash FROM sessions WHERE user_id=$1",[s.id])).rows[0];
 expect(stored.token_hash!==session.token&&stored.csrf_hash!==session.csrfToken).toBe(true);
 await s.repo.revoke(session.token);await denied(s.repo.actor(session.token),undefined);
});
test("wrong passwords lock the account and cannot be bypassed with a valid password",async()=>{
 const s=await scenario(pool);for(let i=0;i<5;i++)await denied(s.repo.passwordLogin(s.email,"invalid-password","source"),"AUTHENTICATION_FAILED");
 await denied(s.repo.passwordLogin(s.email,s.password,"source"),"AUTHENTICATION_FAILED");
 s.clock.value+=16*60_000;expect(!!(await s.repo.passwordLogin(s.email,s.password,"source")).challenge).toBe(true);
});
test("wrong OTP locks the account across fresh password challenges",async()=>{
 const s=await scenario(pool);const p=await s.repo.passwordLogin(s.email,s.password,"source");
 const actual=await s.code();const wrong=actual==="000000"?"111111":"000000";
 for(let i=0;i<5;i++)await denied(s.repo.completeTotp(p.challenge,wrong,"source"),"AUTHENTICATION_FAILED");
 await denied(s.repo.passwordLogin(s.email,s.password,"source"),"AUTHENTICATION_FAILED");
});
test("concurrent copies of an OTP can consume only one challenge/session",async()=>{
 const s=await scenario(pool);const p=await s.repo.passwordLogin(s.email,s.password,"source");const code=await s.code();
 const results=await Promise.allSettled([s.repo.completeTotp(p.challenge,code,"source"),s.repo.completeTotp(p.challenge,code,"source")]);
 expect(results.filter(r=>r.status==="fulfilled").length).toBe(1);
 expect(Number((await pool.query("SELECT count(*) FROM sessions WHERE user_id=$1",[s.id])).rows[0].count)).toBe(1);
});
test("one OTP cannot be reused through a second challenge",async()=>{
 const s=await scenario(pool);await login(s);const p=await s.repo.passwordLogin(s.email,s.password,"source");
 await denied(s.repo.completeTotp(p.challenge,await s.code(),"source"),"AUTHENTICATION_FAILED");
});
test("new login rotates sessions and an expired challenge never authenticates",async()=>{
 const s=await scenario(pool);const first=await login(s);s.clock.value+=30_000;const second=await login(s);
 await denied(s.repo.actor(first.token),undefined);expect((await s.repo.actor(second.token)).userId===s.id).toBe(true);
 const p=await s.repo.passwordLogin(s.email,s.password,"source");s.clock.value+=6*60_000;
 await denied(s.repo.completeTotp(p.challenge,await s.code(),"source"),"AUTHENTICATION_FAILED");
});
test("disabled user or factor denies session access and login",async()=>{
 const s=await scenario(pool);const session=await login(s);
 await pool.query("UPDATE users SET active=false WHERE id=$1",[s.id]);
 await denied(s.repo.actor(session.token),undefined);
 await denied(s.repo.passwordLogin(s.email,s.password,"source"),undefined);
});
test("DPAPI tampering fails closed and audit records do not contain auth payloads",async()=>{
 const s=await scenario(pool);const p=await s.repo.passwordLogin(s.email,s.password,"source");
 await pool.query("UPDATE mfa_factors SET encrypted_secret_ref=$1 WHERE id=$2",["c3ludGhldGljLWludmFsaWQ=",s.factor]);
 await denied(s.repo.completeTotp(p.challenge,await s.code(),"source"),"AUTHENTICATION_FAILED");
 const audit=(await pool.query("SELECT action,outcome,account_ref FROM auth_security_events WHERE organization_id=$1",[s.org])).rows;
 expect(audit.length>0).toBe(true);const text=JSON.stringify(audit);
 expect([s.password,s.secret,p.challenge].some(v=>text.includes(v))).toBe(false);
 await denied(pool.query("DELETE FROM auth_security_events WHERE organization_id=$1",[s.org]),undefined);
});
