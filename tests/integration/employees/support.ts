import {Pool} from "pg";
import {scenario,login,protector} from "../auth/support";
export function testPool(){const value=process.env.PAYSLIP_TEST_DATABASE_URL;if(!value)throw Error("OWNED_TEST_DATABASE_REQUIRED");const u=new URL(value);if(u.hostname!=="127.0.0.1"||u.port!=="55432"||u.pathname!=="/payslip_w2_03_synthetic"||u.username!=="payslip_app")throw Error("UNSAFE_TEST_DATABASE");return new Pool({connectionString:value,max:4,statement_timeout:10000});}
export async function fixture(pool:Pool,role:"owner"|"accountant"="owner",organizationId?:string){
 const s=await scenario(pool,role,organizationId);s.clock.value=Date.parse("2026-01-01T00:00:00Z");const session=await login(s);
 const {randomUUID}=await import("node:crypto");const workplaceId=randomUUID();
 await pool.query("INSERT INTO workplaces(id,organization_id,name) VALUES($1,$2,'Synthetic workplace')",[workplaceId,s.org]);
 const {EmployeesRepository}=await import("../../../apps/web/src/lib/db/repositories/employees");
 const repo=new EmployeesRepository(pool,protector,{organizationId:s.org,now:()=>new Date(s.clock.value)});
 return {...s,workplaceId,repo,credentials:{sessionToken:session.token,csrfToken:session.csrfToken}};
}
export const contract={kind:"full_time" as const,templateVersion:"full_time_12_month_v1",startDate:"2026-01-01",durationMonths:12 as const,probationDays:6 as const};
export const salary={basis:"monthly_salary" as const,monthlySalaryVnd:"8000000"};
export function input(workplaceId:string){return {workplaceId,displayName:"Nhân viên giả lập",nationality:"VN" as const,taxResidency:"resident" as const,contract,compensation:salary};}
export async function denied(action:Promise<unknown>,code:string){let actual="NO_ERROR";try{await action}catch(e){actual=e instanceof Error?e.message:"UNKNOWN"}if(actual!==code)throw Error("Expected "+code+"; received "+actual);}
