import {afterAll,expect,test} from "vitest";
import {fixture,testPool,input,denied,contract} from "./support";
const pool=testPool();afterAll(()=>pool.end());
test("salary basis and synthetic RegionI minimum boundaries are explicit",async()=>{
 const s=await fixture(pool),base=input(s.workplaceId);
 await denied(s.repo.createEmployee(s.credentials,{...base,compensation:{basis:"hourly_rate",hourlyRateVnd:"26000"}}),"COMPENSATION_BASIS_MISMATCH");
 await denied(s.repo.createEmployee(s.credentials,{...base,compensation:{basis:"monthly_salary",monthlySalaryVnd:"5309999"}}),"BELOW_MINIMUM_WAGE");
 await denied(s.repo.createEmployee(s.credentials,{...base,compensation:{basis:"monthly_salary",monthlySalaryVnd:"5310000.5"}}),"INVALID_MONEY");
 const accepted=await s.repo.createEmployee(s.credentials,{...base,compensation:{basis:"monthly_salary",monthlySalaryVnd:"5310000"}});
 expect(!!accepted.employeeId).toBe(true);
 const part={...base,contract:{...contract,kind:"part_time" as const,templateVersion:"part_time_12_month_v1"},compensation:{basis:"hourly_rate" as const,hourlyRateVnd:"25500"}};
 expect(!!(await s.repo.createEmployee(s.credentials,part)).employeeId).toBe(true);
 await denied(s.repo.createEmployee(s.credentials,{...part,compensation:{basis:"hourly_rate",hourlyRateVnd:"25499"}}),"BELOW_MINIMUM_WAGE");
});
test("changing compensation appends logical closure and preserves original payload/hash",async()=>{
 const s=await fixture(pool),created=await s.repo.createEmployee(s.credentials,input(s.workplaceId));
 const before=(await pool.query("SELECT * FROM compensation_terms WHERE id=$1",[created.compensationId])).rows[0];
 const next=await s.repo.changeCompensation(s.credentials,{employeeId:created.employeeId,expectedTermId:created.compensationId,effectiveFrom:"2026-02-01",compensation:{basis:"monthly_salary",monthlySalaryVnd:"9000000"}});
 expect((await pool.query("SELECT * FROM compensation_terms WHERE id=$1",[created.compensationId])).rows[0]).toEqual(before);
 expect((await s.repo.effectiveCompensation(s.credentials,created.employeeId,new Date("2026-01-31T16:59:59.999Z")))?.id).toBe(created.compensationId);
 expect((await s.repo.effectiveCompensation(s.credentials,created.employeeId,new Date("2026-01-31T17:00:00Z")))?.id).toBe(next.compensationId);
 await denied(s.repo.changeCompensation(s.credentials,{employeeId:created.employeeId,expectedTermId:created.compensationId,effectiveFrom:"2026-03-01",compensation:{basis:"monthly_salary",monthlySalaryVnd:"9500000"}}),"STALE_COMPENSATION");
});
test("concurrent changes serialize to exactly one accepted replacement",async()=>{
 const s=await fixture(pool),created=await s.repo.createEmployee(s.credentials,input(s.workplaceId));
 const change={employeeId:created.employeeId,expectedTermId:created.compensationId,effectiveFrom:"2026-02-01",compensation:{basis:"monthly_salary" as const,monthlySalaryVnd:"9000000"}};
 const results=await Promise.allSettled([s.repo.changeCompensation(s.credentials,change),s.repo.changeCompensation(s.credentials,change)]);
 expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
 expect(Number((await pool.query("SELECT count(*) FROM compensation_terms WHERE employee_id=$1",[created.employeeId])).rows[0].count)).toBe(2);
});
test("overlapping contracts and out-of-contract compensation fail atomically",async()=>{
 const s=await fixture(pool),created=await s.repo.createEmployee(s.credentials,input(s.workplaceId));
 await denied(s.repo.addContract(s.credentials,{employeeId:created.employeeId,contract:{...contract,startDate:"2026-06-01"},compensation:input(s.workplaceId).compensation}),"OVERLAPPING_PERIOD");
 await denied(s.repo.changeCompensation(s.credentials,{employeeId:created.employeeId,expectedTermId:created.compensationId,effectiveFrom:"2027-02-01",compensation:{basis:"monthly_salary",monthlySalaryVnd:"9000000"}}),"COMPENSATION_OUTSIDE_CONTRACT");
 expect(Number((await pool.query("SELECT count(*) FROM compensation_term_closures WHERE employee_id=$1",[created.employeeId])).rows[0].count)).toBe(0);
});


test("referenced compensation can close after the payroll period without rewriting any frozen input",async()=>{
 const {finalizeSyntheticPayRun,prepareSyntheticPayRunForFinalization,seedScenario}=await import("../db/support");const c=await pool.connect();let f;try{f=await seedScenario(c)}finally{c.release()}
 const s=await fixture(pool,"owner",f.orgId),own=await s.repo.createEmployee(s.credentials,input(f.workplaceId));
 const {randomUUID}=await import("node:crypto");const snapshot=randomUUID();
 await pool.query("INSERT INTO attendance_snapshots(id,organization_id,workplace_id,employee_id,period_start,period_end,canonical_payload,content_hash,status,approved_by) SELECT $1,organization_id,workplace_id,$2,period_start,period_end,canonical_payload,content_hash,status,approved_by FROM attendance_snapshots WHERE id=$3",[snapshot,own.employeeId,f.snapshotId]);
 const ownTerm=(await pool.query("SELECT content_hash FROM compensation_terms WHERE id=$1",[own.compensationId])).rows[0];
 await pool.query("UPDATE pay_run_employees SET employee_id=$1,compensation_id=$2,compensation_hash=$3,snapshot_id=$4 WHERE id=$5",[own.employeeId,own.compensationId,ownTerm.content_hash,snapshot,f.runEmployeeId]);
 const {withTransaction}=await import("../../../apps/web/src/lib/db/transaction");
 const approvedVersion=await withTransaction(pool,tx=>prepareSyntheticPayRunForFinalization(tx,{id:f.runId,expectedVersion:0,actorId:s.id}));
 await withTransaction(pool,tx=>finalizeSyntheticPayRun(tx,{id:f.runId,expectedVersion:approvedVersion,actorId:s.id,idempotencyKey:'pay-run:'+f.runId+':finalized:'+(approvedVersion+1)}));
 const before=(await pool.query("SELECT * FROM pay_run_employees WHERE id=$1",[f.runEmployeeId])).rows[0],term=(await pool.query("SELECT * FROM compensation_terms WHERE id=$1",[own.compensationId])).rows[0];
 await denied(s.repo.changeCompensation(s.credentials,{employeeId:own.employeeId,expectedTermId:own.compensationId,effectiveFrom:"2026-09-01",compensation:{basis:"monthly_salary",monthlySalaryVnd:"9000000"}}),"HISTORICAL_PERIOD_CONFLICT");
 await s.repo.changeCompensation(s.credentials,{employeeId:own.employeeId,expectedTermId:own.compensationId,effectiveFrom:"2026-10-01",compensation:{basis:"monthly_salary",monthlySalaryVnd:"9000000"}});
 expect((await pool.query("SELECT * FROM pay_run_employees WHERE id=$1",[f.runEmployeeId])).rows[0]).toEqual(before);
 expect((await pool.query("SELECT * FROM compensation_terms WHERE id=$1",[own.compensationId])).rows[0]).toEqual(term);
});


test("closed source rows and closure records are immutable even without payroll references",async()=>{
 const s=await fixture(pool),e=await s.repo.createEmployee(s.credentials,input(s.workplaceId));
 await s.repo.changeCompensation(s.credentials,{employeeId:e.employeeId,expectedTermId:e.compensationId,effectiveFrom:"2026-02-01",compensation:{basis:"monthly_salary",monthlySalaryVnd:"9000000"}});
 let rejected=false;try{await pool.query("UPDATE compensation_terms SET monthly_salary_vnd=8100000 WHERE id=$1",[e.compensationId])}catch{rejected=true}expect(rejected).toBe(true);
 rejected=false;try{await pool.query("DELETE FROM compensation_term_closures WHERE term_id=$1",[e.compensationId])}catch{rejected=true}expect(rejected).toBe(true);
});
