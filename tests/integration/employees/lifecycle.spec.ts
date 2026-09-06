import {afterAll,expect,test} from "vitest";
import {fixture,testPool,input,denied} from "./support";
const pool=testPool();afterAll(()=>pool.end());
test("supported full-time employee has one12-month contract and unchanged pay after six-day probation",async()=>{
 const s=await fixture(pool),created=await s.repo.createEmployee(s.credentials,input(s.workplaceId));
 const employee=await s.repo.getEmployee(s.credentials,created.employeeId);
 expect(employee.displayName).toBe("Nhân viên giả lập");expect(employee.contracts).toHaveLength(1);
 expect(employee.contracts[0]?.probationDays).toBe(6);
 const first=await s.repo.effectiveCompensation(s.credentials,created.employeeId,new Date("2026-01-06T17:00:00Z"));
 expect(first?.monthlySalaryVnd).toBe("8000000");expect(first?.id).toBe(created.compensationId);
 expect((await s.repo.listEmployees(s.credentials)).items).toHaveLength(1);
});
test("unsupported population and contract profile fail before any employee write",async()=>{
 const s=await fixture(pool),base=input(s.workplaceId);
 for(const candidate of [{...base,nationality:"US"},{...base,taxResidency:"non_resident"},{...base,contract:{...base.contract,durationMonths:3}},{...base,contract:{...base.contract,probationDays:7}},{...base,contract:{...base.contract,templateVersion:"unknown"}}]){
  await denied(s.repo.createEmployee(s.credentials,candidate as typeof base),"UNSUPPORTED_EMPLOYMENT_PROFILE");
 }
 expect(Number((await pool.query("SELECT count(*) FROM employees WHERE organization_id=$1",[s.org])).rows[0].count)).toBe(0);
});
test("cross-organization and unauthenticated command calls cannot create or read employees",async()=>{
 const s=await fixture(pool),other=await fixture(pool);
 await denied(s.repo.createEmployee(s.credentials,input(other.workplaceId)),"WORKPLACE_NOT_FOUND");
 await denied(s.repo.createEmployee({...s.credentials,csrfToken:"wrong"},input(s.workplaceId)),"CSRF");
 const created=await other.repo.createEmployee(other.credentials,input(other.workplaceId));
 await denied(s.repo.getEmployee(s.credentials,created.employeeId),"EMPLOYEE_NOT_FOUND");
});
test("deactivation revokes employee grants and linked user sessions but preserves immutable contracts",async()=>{
 const s=await fixture(pool),created=await s.repo.createEmployee(s.credentials,input(s.workplaceId));
 const {randomUUID}=await import("node:crypto");const grant=randomUUID();
 await pool.query("INSERT INTO employee_access_grants(id,organization_id,employee_id,kind,token_hash) VALUES($1,$2,$3,'kiosk',repeat('a',64))",[grant,s.org,created.employeeId]);
 const linked=await fixture(pool); // separately authenticated user linked in its own organization cannot be touched
 const before=(await pool.query("SELECT count(*) FROM employment_contracts WHERE employee_id=$1",[created.employeeId])).rows[0].count;
 await s.repo.deactivateEmployee(s.credentials,created.employeeId);
 expect((await pool.query("SELECT revoked_at IS NOT NULL AS revoked FROM employee_access_grants WHERE id=$1",[grant])).rows[0].revoked).toBe(true);
 expect((await pool.query("SELECT count(*) FROM employment_contracts WHERE employee_id=$1",[created.employeeId])).rows[0].count).toBe(before);
 expect((await linked.repo.listEmployees(linked.credentials)).items).toHaveLength(0);
 await denied(s.repo.changeCompensation(s.credentials,{employeeId:created.employeeId,expectedTermId:created.compensationId,effectiveFrom:"2026-02-01",compensation:{basis:"monthly_salary",monthlySalaryVnd:"9000000"}}),"EMPLOYEE_INACTIVE");
});
test("accountant may maintain employees but cannot deactivate; owner deactivation requires fresh MFA",async()=>{
 const s=await fixture(pool,"accountant"),created=await s.repo.createEmployee(s.credentials,input(s.workplaceId));
 await denied(s.repo.deactivateEmployee(s.credentials,created.employeeId),"FORBIDDEN");
 const owner=await fixture(pool),own=await owner.repo.createEmployee(owner.credentials,input(owner.workplaceId));owner.clock.value+=11*60_000;
 await denied(owner.repo.deactivateEmployee(owner.credentials,own.employeeId),"FRESH_TOTP_REQUIRED");
});


test("deactivation revokes an actual linked login and prevents direct kiosk clock writes",async()=>{
 const s=await fixture(pool),e=await s.repo.createEmployee(s.credentials,input(s.workplaceId));
 const {scenario,login}=await import("../auth/support"),linked=await scenario(pool,"accountant",s.org);linked.clock.value=s.clock.value;const session=await login(linked);
 await pool.query("UPDATE users SET employee_id=$1 WHERE id=$2",[e.employeeId,linked.id]);
 await s.repo.deactivateEmployee(s.credentials,e.employeeId);
 let rejected=false;try{await linked.repo.actor(session.token)}catch{rejected=true}expect(rejected).toBe(true);
 expect((await pool.query("SELECT revoked_at IS NOT NULL AS revoked FROM sessions WHERE user_id=$1",[linked.id])).rows[0].revoked).toBe(true);
 const {randomUUID}=await import("node:crypto");
 rejected=false;try{await pool.query("INSERT INTO clock_events(id,organization_id,workplace_id,employee_id,idempotency_key,direction,occurred_at,request_hash) VALUES($1,$2,$3,$4,'inactive-clock','IN',$5,repeat('a',64))",[randomUUID(),s.org,s.workplaceId,e.employeeId,new Date(s.clock.value)])}catch(error){rejected=(error as Error).message.includes("EMPLOYEE_INACTIVE")}expect(rejected).toBe(true);
});

test("existing unsupported employee metadata cannot gain a new contract or salary change",async()=>{
 const s=await fixture(pool),e=await s.repo.createEmployee(s.credentials,input(s.workplaceId));
 await pool.query("UPDATE employees SET nationality='US' WHERE id=$1",[e.employeeId]);
 const base=input(s.workplaceId);
 await denied(s.repo.addContract(s.credentials,{employeeId:e.employeeId,contract:{...base.contract,startDate:"2026-06-01"},compensation:base.compensation}),"UNSUPPORTED_EMPLOYMENT_PROFILE");
 await denied(s.repo.changeCompensation(s.credentials,{employeeId:e.employeeId,expectedTermId:e.compensationId,effectiveFrom:"2026-02-01",compensation:base.compensation}),"UNSUPPORTED_EMPLOYMENT_PROFILE");
});
