import {denied} from "./assertions";
import {afterAll,expect,test} from "vitest";
import {testPool,scenario,login} from "./support";
import {authorizeCommand} from "../../../apps/web/src/lib/application/commands/authorization";
const pool=testPool();afterAll(()=>pool.end());
test("backend command resolves trusted actor, enforces resource, CSRF and role",async()=>{
 const s=await scenario(pool,"accountant"),session=await login(s);
 await expect(authorizeCommand(s.repo,session.token,"PAYROLL_DRAFT",{organizationId:s.org},session.csrfToken)).resolves.toBeDefined();
 await denied(authorizeCommand(s.repo,session.token,"PAY_RUN_FINALIZE",{organizationId:s.org},session.csrfToken),"FORBIDDEN");
 await denied(authorizeCommand(s.repo,session.token,"PAYROLL_DRAFT",{organizationId:s.org},"wrong"),"CSRF");
 await denied(authorizeCommand(s.repo,session.token,"PAYROLL_DRAFT",{organizationId:"other"},session.csrfToken),"FORBIDDEN");
});
test("fresh owner step-up rotates token and restores privileged authorization",async()=>{
 const s=await scenario(pool),first=await login(s);s.clock.value+=11*60_000;
 await denied(authorizeCommand(s.repo,first.token,"PAY_RUN_FINALIZE",{organizationId:s.org},first.csrfToken),"FRESH_TOTP_REQUIRED");
 const next=await s.repo.stepUp(first.token,await s.code(),first.csrfToken,"source");
 await denied(s.repo.actor(first.token),undefined);
 await expect(authorizeCommand(s.repo,next.token,"PAY_RUN_FINALIZE",{organizationId:s.org},next.csrfToken)).resolves.toBeDefined();
});
test("session expiry and disabled factor invalidate a session",async()=>{
 const s=await scenario(pool),session=await login(s);s.clock.value+=9*60*60_000;
 await denied(s.repo.actor(session.token),undefined);
 s.clock.value-=9*60*60_000;await pool.query("UPDATE mfa_factors SET enabled=false WHERE id=$1",[s.factor]);
 await denied(s.repo.actor(session.token),undefined);
});

test("authorization outcomes are appended with trusted actor and no authentication payload",async()=>{
 const s=await scenario(pool,"accountant"),session=await login(s);
 await authorizeCommand(s.repo,session.token,"PAYROLL_DRAFT",{organizationId:s.org},session.csrfToken);
 await denied(authorizeCommand(s.repo,session.token,"PAY_RUN_FINALIZE",{organizationId:s.org},session.csrfToken),"FORBIDDEN");
 const rows=(await pool.query("SELECT actor_id,action,outcome,account_ref FROM auth_security_events WHERE organization_id=$1 AND action LIKE 'auth.authorization.%' ORDER BY action",[s.org])).rows;
 expect(rows.length).toBe(2);expect(rows.every(r=>r.actor_id===s.id)).toBe(true);expect(rows.map(r=>r.outcome).sort()).toEqual(["denied","passed"]);
 expect([session.token,session.csrfToken,s.secret,s.password].some(value=>JSON.stringify(rows).includes(value))).toBe(false);
});
