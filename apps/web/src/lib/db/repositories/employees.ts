import {randomUUID,randomInt} from "node:crypto";
import type {Pool,PoolClient} from "pg";
import type {WindowsSecretProtector} from "../../secrets/windows-dpapi";
import {AuthRepository} from "./auth";
import {authorize,type Command,type UserActor} from "../../auth/authorization";
import {hashSecret,validCsrf} from "../../auth/csrf";
import {withTransaction} from "../transaction";
import {contractDates,localDate,fail,type ContractProfile,type CreateEmployeeInput,type Credentials,type DeliveryDestination} from "../../../../../../packages/contracts/src/employee";
import {validateCompensation,SYNTHETIC_MINIMUM_POLICY,type CompensationTerm} from "../../../../../../packages/contracts/src/compensation";
import {dispatchEmployeeVerification} from "../../delivery/employee-verification";
import type {FakeAdapter} from "../../delivery/types";
type EmployeeRow={id:string;display_name:string;status:string;workplace_id:string;nationality:string|null;tax_residency:string|null};
type ContractRow={id:string;kind:"full_time"|"part_time";valid_from:Date;valid_to:Date;template_version:string|null;probation_days:number|null};
type TermRow={id:string;contract_id:string;valid_from:Date;valid_to:Date|null;effective_to:Date|null;content_hash:string;monthly_salary_vnd:string|null;hourly_rate_vnd:string|null};
const PURPOSE="pay-slip/email-verification/v1";
export class EmployeesRepository{
 private readonly auth:AuthRepository;
 private readonly now:()=>Date;
 private readonly org:string;
 constructor(private readonly pool:Pool,private readonly protector:WindowsSecretProtector,options:{organizationId:string;now?:()=>Date}){
  this.org=options.organizationId;this.now=options.now??(()=>new Date());this.auth=new AuthRepository(pool,protector,options);
 }
 private async command<T>(credentials:Credentials,permission:Command,work:(tx:PoolClient,actor:UserActor)=>Promise<T>):Promise<T>{
  const actor=await this.auth.checkCsrf(credentials.sessionToken,credentials.csrfToken);
  try{return await withTransaction(this.pool,async tx=>{
   const user=(await tx.query("SELECT role,active FROM users WHERE id=$1 AND organization_id=$2 FOR UPDATE",[actor.userId,this.org])).rows[0];
   const session=(await tx.query("SELECT * FROM sessions WHERE id=$1 AND organization_id=$2 AND token_hash=$3 FOR UPDATE",[actor.sessionId,this.org,hashSecret(credentials.sessionToken)])).rows[0];
   if(!user?.active||!session||session.revoked_at||session.expires_at<=this.now()||!session.mfa_satisfied_at)fail("UNAUTHENTICATED");
   if(!validCsrf(session.csrf_hash,credentials.csrfToken))fail("CSRF");
   const trusted={...actor,role:user.role,mfaSatisfiedAt:session.mfa_satisfied_at} as UserActor;
   authorize(trusted,permission,this.now(),{organizationId:this.org});
   return work(tx,trusted);
  })}catch(e){if((e as {code?:string}).code==="23P01")fail("OVERLAPPING_PERIOD");throw e;}
 }
 private async employee(tx:PoolClient,id:string,active=true):Promise<EmployeeRow>{
  const row=(await tx.query<EmployeeRow>("SELECT id,display_name,status,workplace_id,nationality,tax_residency FROM employees WHERE id=$1 AND organization_id=$2 FOR UPDATE",[id,this.org])).rows[0];
  if(!row)fail("EMPLOYEE_NOT_FOUND");if(active&&row.status!=="active")fail("EMPLOYEE_INACTIVE");return row;
 }
 private supportedEmployee(e:EmployeeRow){if(e.nationality!=="VN"||e.tax_residency!=="resident")fail("UNSUPPORTED_EMPLOYMENT_PROFILE");}
 private async audit(tx:PoolClient,actor:UserActor,action:string,target:string){await tx.query("INSERT INTO audit_events(id,organization_id,actor_id,action,aggregate_id,created_at) VALUES($1,$2,$3,$4,$5,$6)",[randomUUID(),this.org,actor.userId,action,target,this.now()]);}
 private async insertContract(tx:PoolClient,employeeId:string,profile:ContractProfile,compensation:CompensationTerm){
  const dates=contractDates(profile),amount=validateCompensation(profile.kind,compensation,dates.from),contractId=randomUUID(),compensationId=randomUUID();
  await tx.query("INSERT INTO employment_contracts(id,organization_id,employee_id,kind,valid_from,valid_to,template_version,probation_days,population_policy_version) VALUES($1,$2,$3,$4,$5,$6,$7,6,'vn-resident-synthetic-v1')",[contractId,this.org,employeeId,profile.kind,dates.from,dates.to,profile.templateVersion]);
  const payload=JSON.stringify({schema:"compensation-v1",evidence:"synthetic",minimumPolicy:SYNTHETIC_MINIMUM_POLICY,contractId,effectiveFrom:dates.from.toISOString(),compensation});
  await tx.query("INSERT INTO compensation_terms(id,organization_id,employee_id,contract_id,monthly_salary_vnd,hourly_rate_vnd,valid_from,valid_to,canonical_payload,content_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",[compensationId,this.org,employeeId,contractId,amount.monthly,amount.hourly,dates.from,dates.to,payload,hashSecret(payload)]);
  return {employeeId,contractId,compensationId};
 }
 async createEmployee(credentials:Credentials,input:CreateEmployeeInput){
  if(input.nationality!=="VN"||input.taxResidency!=="resident")fail("UNSUPPORTED_EMPLOYMENT_PROFILE");
  contractDates(input.contract);
  if(typeof input.displayName!=="string"||!input.displayName.trim()||input.displayName.length>150)fail("INVALID_DISPLAY_NAME");
  return this.command(credentials,"EMPLOYEE_MANAGE",async(tx,actor)=>{
   if(!(await tx.query("SELECT id FROM workplaces WHERE id=$1 AND organization_id=$2",[input.workplaceId,this.org])).rowCount)fail("WORKPLACE_NOT_FOUND");
   const id=randomUUID();
   await tx.query("INSERT INTO employees(id,organization_id,workplace_id,display_name,nationality,tax_residency) VALUES($1,$2,$3,$4,'VN','resident')",[id,this.org,input.workplaceId,input.displayName.trim()]);
   const result=await this.insertContract(tx,id,input.contract,input.compensation);await this.audit(tx,actor,"employee.created",id);return result;
  });
 }
 async addContract(credentials:Credentials,input:{employeeId:string;contract:ContractProfile;compensation:CompensationTerm}){
  return this.command(credentials,"EMPLOYEE_MANAGE",async(tx,actor)=>{this.supportedEmployee(await this.employee(tx,input.employeeId));const result=await this.insertContract(tx,input.employeeId,input.contract,input.compensation);await this.audit(tx,actor,"employee.contract.added",input.employeeId);return result;});
 }
 private async termAt(tx:PoolClient,employeeId:string,at:Date):Promise<TermRow|undefined>{
  return (await tx.query<TermRow>("SELECT t.*,LEAST(t.valid_to,c.effective_to) AS effective_to FROM compensation_terms t LEFT JOIN compensation_term_closures c ON c.term_id=t.id WHERE t.organization_id=$1 AND t.employee_id=$2 AND t.valid_from<=$3 AND (LEAST(t.valid_to,c.effective_to) IS NULL OR LEAST(t.valid_to,c.effective_to)>$3) FOR UPDATE OF t",[this.org,employeeId,at])).rows[0];
 }
 async changeCompensation(credentials:Credentials,input:{employeeId:string;expectedTermId:string;effectiveFrom:string;compensation:CompensationTerm}){
  const at=localDate(input.effectiveFrom);if(at<this.now())fail("RETROACTIVE_CHANGE");
  return this.command(credentials,"EMPLOYEE_MANAGE",async(tx,actor)=>{
   this.supportedEmployee(await this.employee(tx,input.employeeId));
   const original=(await tx.query<TermRow>("SELECT * FROM compensation_terms WHERE id=$1 AND organization_id=$2 AND employee_id=$3 FOR UPDATE",[input.expectedTermId,this.org,input.employeeId])).rows[0];
   if(!original)fail("STALE_COMPENSATION");
   const contract=(await tx.query<ContractRow>("SELECT * FROM employment_contracts WHERE id=$1 AND organization_id=$2",[original.contract_id,this.org])).rows[0];
   if(!contract||at<contract.valid_from||at>=contract.valid_to)fail("COMPENSATION_OUTSIDE_CONTRACT");
   if(contract.template_version!==contract.kind+"_12_month_v1"||contract.probation_days!==6)fail("UNSUPPORTED_EMPLOYMENT_PROFILE");
   const current=await this.termAt(tx,input.employeeId,at);
   if(!current||current.id!==original.id)fail("STALE_COMPENSATION");
   if(at<=original.valid_from)fail("INVALID_EFFECTIVE_DATE");
   const amount=validateCompensation(contract.kind,input.compensation,at);
   await tx.query("INSERT INTO compensation_term_closures(term_id,organization_id,employee_id,source_hash,effective_to) VALUES($1,$2,$3,$4,$5)",[original.id,this.org,input.employeeId,original.content_hash,at]);
   const id=randomUUID(),payload=JSON.stringify({schema:"compensation-v1",evidence:"synthetic",minimumPolicy:SYNTHETIC_MINIMUM_POLICY,contractId:contract.id,effectiveFrom:at.toISOString(),compensation:input.compensation});
   await tx.query("INSERT INTO compensation_terms(id,organization_id,employee_id,contract_id,monthly_salary_vnd,hourly_rate_vnd,valid_from,valid_to,canonical_payload,content_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",[id,this.org,input.employeeId,contract.id,amount.monthly,amount.hourly,at,contract.valid_to,payload,hashSecret(payload)]);
   await this.audit(tx,actor,"employee.compensation.changed",input.employeeId);return {compensationId:id};
  });
 }
 async effectiveCompensation(credentials:Credentials,employeeId:string,at:Date){
  if(!Number.isFinite(at.getTime()))fail("INVALID_EFFECTIVE_DATE");
  return this.command(credentials,"EMPLOYEE_READ",async tx=>{await this.employee(tx,employeeId,false);const t=await this.termAt(tx,employeeId,at);return t?{id:t.id,monthlySalaryVnd:t.monthly_salary_vnd,hourlyRateVnd:t.hourly_rate_vnd,validFrom:t.valid_from.toISOString(),validTo:t.effective_to?.toISOString()??null}:null;});
 }
 private async destination(tx:PoolClient,employeeId:string){
  return (await tx.query<{id:string;address:string;valid_from:Date;effective_to:Date|null;content_hash:string;verified_at:Date|null;invalidated_at:Date|null}>("SELECT d.id,d.address,d.valid_from,d.content_hash,LEAST(d.valid_to,c.effective_to) AS effective_to,v.verified_at,v.invalidated_at FROM delivery_destinations d LEFT JOIN delivery_destination_closures c ON c.destination_id=d.id LEFT JOIN employee_email_verifications v ON v.destination_id=d.id WHERE d.organization_id=$1 AND d.employee_id=$2 AND d.channel='email' AND d.valid_from<=$3 AND (LEAST(d.valid_to,c.effective_to) IS NULL OR LEAST(d.valid_to,c.effective_to)>$3) FOR UPDATE OF d",[this.org,employeeId,this.now()])).rows[0];
 }
 private async invalidate(tx:PoolClient,employeeId:string,reason:string){
  await tx.query("UPDATE delivery_drafts SET status='invalidated',version=version+1 WHERE organization_id=$1 AND employee_id=$2 AND status='draft'",[this.org,employeeId]);
  await tx.query("UPDATE employee_email_verifications SET invalidated_at=$3 WHERE organization_id=$1 AND employee_id=$2 AND invalidated_at IS NULL",[this.org,employeeId,this.now()]);
  await tx.query("UPDATE outbox_dispatches d SET status='dead_letter',terminal_reason=$3,lease_token=NULL,lease_phase=NULL,lease_expires_at=NULL,worker_id=NULL FROM outbox_jobs j WHERE d.job_id=j.id AND j.organization_id=$1 AND j.employee_id=$2 AND d.status IN ('pending','leased','retry_wait','reconcile')",[this.org,employeeId,reason]);
 }
 async changeEmail(credentials:Credentials,input:{employeeId:string;expectedDestinationId:string|null;address:string}){
  if(typeof input.address!=="string"||input.address.length>254||!/^[A-Za-z0-9._+-]+@example\.invalid$/.test(input.address))fail("SYNTHETIC_ONLY");
  return this.command(credentials,"EMPLOYEE_MANAGE",async(tx,actor)=>{
   await this.employee(tx,input.employeeId);const prior=await this.destination(tx,input.employeeId);
   if((prior?.id??null)!==input.expectedDestinationId)fail("STALE_DESTINATION");
   if(prior&&this.now()<=prior.valid_from)fail("INVALID_EFFECTIVE_DATE");
   const id=randomUUID(),jobId=randomUUID(),verificationId=randomUUID(),now=this.now();
   if(prior)await tx.query("INSERT INTO delivery_destination_closures(destination_id,organization_id,employee_id,source_hash,effective_to) VALUES($1,$2,$3,$4,$5)",[prior.id,this.org,input.employeeId,prior.content_hash,now]);
   await this.invalidate(tx,input.employeeId,"destination_changed");
   const payload=JSON.stringify({schema:"destination-v1",evidence:"synthetic",address:input.address,effectiveFrom:now.toISOString()}),hash=hashSecret(payload);
   await tx.query("INSERT INTO delivery_destinations(id,organization_id,employee_id,channel,address,valid_from,canonical_payload,content_hash) VALUES($1,$2,$3,'email',$4,$5,$6,$7)",[id,this.org,input.employeeId,input.address,now,payload,hash]);
   const code=String(randomInt(0,1000000)).padStart(6,"0"),plain=Buffer.from(code);let encrypted:Buffer;
   try{encrypted=await this.protector.protect(plain,PURPOSE)}finally{plain.fill(0)}
   let transport:string;try{transport=encrypted.toString("base64")}finally{encrypted.fill(0)}
   await tx.query("INSERT INTO outbox_jobs(id,organization_id,pay_run_id,kind,employee_id,destination_id,destination_hash,idempotency_key,payload,created_at) VALUES($1,$2,NULL,'synthetic_destination_verification',$3,$4,$5,$6,$7,$8)",[jobId,this.org,input.employeeId,id,hash,"verify:"+id,{ciphertext:transport,purpose:PURPOSE},now]);
   await tx.query("INSERT INTO outbox_dispatches(job_id,organization_id,available_at) VALUES($1,$2,$3)",[jobId,this.org,now]);
   await tx.query("INSERT INTO employee_email_verifications(id,organization_id,employee_id,destination_id,job_id,code_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)",[verificationId,this.org,input.employeeId,id,jobId,hashSecret(id+":"+code),new Date(now.getTime()+10*60000)]);
   await this.audit(tx,actor,"employee.email.changed",input.employeeId);return {destinationId:id,jobId};
  });
 }
 async verifyEmailCode(credentials:Credentials,input:{employeeId:string;destinationId:string;code:string}):Promise<void>{
  const ok=await this.command(credentials,"EMPLOYEE_MANAGE",async(tx,actor)=>{
   await this.employee(tx,input.employeeId);const current=await this.destination(tx,input.employeeId);
   const v=(await tx.query("SELECT * FROM employee_email_verifications WHERE destination_id=$1 AND employee_id=$2 AND organization_id=$3 FOR UPDATE",[input.destinationId,input.employeeId,this.org])).rows[0];
   if(!v||current?.id!==input.destinationId||v.invalidated_at||v.verified_at||v.expires_at<=this.now()||v.attempts>=5)return false;
   if(typeof input.code!=="string"||!/^\d{6}$/.test(input.code)||!validCsrf(v.code_hash,input.destinationId+":"+input.code)){
    await tx.query("UPDATE employee_email_verifications SET attempts=attempts+1 WHERE id=$1",[v.id]);await this.audit(tx,actor,"employee.email.verification.denied",input.employeeId);return false;
   }
   await tx.query("UPDATE employee_email_verifications SET verified_at=$2 WHERE id=$1",[v.id,this.now()]);await this.audit(tx,actor,"employee.email.verified",input.employeeId);return true;
  });if(!ok)fail("VERIFICATION_FAILED");
 }
 async deactivateEmployee(credentials:Credentials,employeeId:string){
  return this.command(credentials,"EMPLOYEE_DEACTIVATE",async(tx,actor)=>{
   await this.employee(tx,employeeId);
   await tx.query("UPDATE employees SET status='inactive' WHERE id=$1 AND organization_id=$2",[employeeId,this.org]);
   await tx.query("UPDATE employee_access_grants SET revoked_at=$3 WHERE employee_id=$1 AND organization_id=$2 AND revoked_at IS NULL",[employeeId,this.org,this.now()]);
   await tx.query("UPDATE users SET active=false WHERE employee_id=$1 AND organization_id=$2",[employeeId,this.org]);
   await tx.query("UPDATE sessions SET revoked_at=$3 WHERE organization_id=$2 AND user_id IN (SELECT id FROM users WHERE employee_id=$1 AND organization_id=$2) AND revoked_at IS NULL",[employeeId,this.org,this.now()]);
   await this.invalidate(tx,employeeId,"employee_inactive");await this.audit(tx,actor,"employee.deactivated",employeeId);
   return {employeeId,status:"inactive" as const};
  });
 }
 async getEmployee(credentials:Credentials,employeeId:string){
  return this.command(credentials,"EMPLOYEE_READ",async tx=>{
   const e=await this.employee(tx,employeeId,false),d=await this.destination(tx,employeeId);
   const contracts=(await tx.query<ContractRow>("SELECT * FROM employment_contracts WHERE organization_id=$1 AND employee_id=$2 ORDER BY valid_from",[this.org,employeeId])).rows.map(c=>({id:c.id,kind:c.kind,validFrom:c.valid_from.toISOString(),validTo:c.valid_to?.toISOString()??null,probationDays:c.probation_days}));
   const destination:DeliveryDestination|null=d?{id:d.id,address:d.address,validFrom:d.valid_from.toISOString(),validTo:d.effective_to?.toISOString()??null,verificationStatus:d.verified_at&&!d.invalidated_at?"verified":"pending",version:d.content_hash}:null;
   return {employeeId:e.id,displayName:e.display_name,status:e.status,workplaceId:e.workplace_id,contracts,destination};
  });
 }
 async listEmployees(credentials:Credentials,options:{limit?:number;after?:string}={}){
  const limit=options.limit??50;if(!Number.isInteger(limit)||limit<1||limit>100)fail("INVALID_PAGE");
  return this.command(credentials,"EMPLOYEE_READ",async tx=>{
   const rows=(await tx.query<EmployeeRow>("SELECT id,display_name,status,workplace_id FROM employees WHERE organization_id=$1 AND ($2::uuid IS NULL OR id>$2::uuid) ORDER BY id LIMIT $3",[this.org,options.after??null,limit+1])).rows;
   const more=rows.length>limit,items=rows.slice(0,limit).map(e=>({employeeId:e.id,displayName:e.display_name,status:e.status,workplaceId:e.workplace_id}));
   return {items,nextCursor:more?items.at(-1)!.employeeId:null};
  });
 }
 async dispatchVerification(jobId:string,adapter:FakeAdapter){return dispatchEmployeeVerification(this.pool,this.protector,{organizationId:this.org,jobId,now:this.now()},adapter);}
}
