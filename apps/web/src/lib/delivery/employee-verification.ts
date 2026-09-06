import {randomUUID} from "node:crypto";
import type {Pool} from "pg";
import type {WindowsSecretProtector} from "../secrets/windows-dpapi";
import {withTransaction} from "../db/transaction";
import {finishAttempt} from "./outbox";
import {SUBJECT,verificationBody,type FakeAdapter,type Lease} from "./types";
import {assertSyntheticMessage} from "./fake-adapter";
const PURPOSE="pay-slip/email-verification/v1";
/** Fake-only dispatch holds the employee and job locks through the in-memory send.
 * Cancellation therefore serializes with dispatch; no external provider is called here.
 */
export async function dispatchEmployeeVerification(pool:Pool,protector:WindowsSecretProtector,input:{organizationId:string;jobId:string;now:Date},adapter:FakeAdapter):Promise<string>{
 return withTransaction(pool,async tx=>{
  const j=(await tx.query("SELECT * FROM outbox_jobs WHERE id=$1 AND organization_id=$2 AND kind='synthetic_destination_verification'",[input.jobId,input.organizationId])).rows[0];if(!j)return "not_found";
  const employee=(await tx.query("SELECT status FROM employees WHERE id=$1 AND organization_id=$2 FOR UPDATE",[j.employee_id,input.organizationId])).rows[0];
  const state=(await tx.query("SELECT * FROM outbox_dispatches WHERE job_id=$1 FOR UPDATE",[j.id])).rows[0];if(!state)return "not_found";
  if(state.status==="accepted")return "accepted";if(state.status==="dead_letter")return "cancelled";
  const v=(await tx.query("SELECT * FROM employee_email_verifications WHERE job_id=$1",[j.id])).rows[0];
  if(employee?.status!=="active"||!v||v.invalidated_at||v.expires_at<=input.now||v.verified_at||v.attempts>=5){
   await tx.query("UPDATE outbox_dispatches SET status='dead_letter',terminal_reason='verification_inactive',lease_token=NULL,lease_phase=NULL,lease_expires_at=NULL,worker_id=NULL WHERE job_id=$1",[j.id]);return "cancelled";
  }
  if(state.available_at>input.now||state.status==="leased")return "pending";
  const phase=state.status==="reconcile"?"reconcile":"send";
  if((phase==="send"?state.send_attempts:state.reconcile_attempts)>=3){
   await tx.query("UPDATE outbox_dispatches SET status='dead_letter',terminal_reason='attempt_budget_exhausted' WHERE job_id=$1",[j.id]);return "cancelled";
  }
  const destination=(await tx.query("SELECT d.address FROM delivery_destinations d LEFT JOIN delivery_destination_closures c ON c.destination_id=d.id WHERE d.id=$1 AND (LEAST(d.valid_to,c.effective_to) IS NULL OR LEAST(d.valid_to,c.effective_to)>$2)",[j.destination_id,input.now])).rows[0];
  if(!destination)throw Error("DESTINATION_MISMATCH");
  if(j.payload.purpose!==PURPOSE)throw Error("INVALID_VERIFICATION_PAYLOAD");
  let plain:Buffer|undefined;const encrypted=Buffer.from(j.payload.ciphertext,"base64");
  try{
   plain=await protector.unprotect(encrypted,PURPOSE);const code=plain.toString("utf8");if(!/^\d{6}$/.test(code))throw Error("INVALID_VERIFICATION_PAYLOAD");
   const message={jobId:j.id,idempotencyKey:j.id,to:destination.address,subject:SUBJECT,body:verificationBody(code)};assertSyntheticMessage(message);
   const token=randomUUID(),generation=Number(state.generation)+1;
   await tx.query("UPDATE outbox_dispatches SET status='leased',lease_token=$2,generation=$3,lease_phase=$4,worker_id='employee-fake',lease_expires_at=$5,send_attempts=send_attempts+$6,reconcile_attempts=reconcile_attempts+$7 WHERE job_id=$1",[j.id,token,generation,phase,new Date(input.now.getTime()+300000),phase==="send"?1:0,phase==="reconcile"?1:0]);
   await tx.query("INSERT INTO outbox_dispatch_attempts(id,job_id,organization_id,generation,phase,event,outcome,created_at) VALUES($1,$2,$3,$4,$5,'claim','claimed',$6)",[randomUUID(),j.id,input.organizationId,generation,phase,input.now]);
   const lease:Lease={jobId:j.id,organizationId:input.organizationId,token,generation,phase,message};
   const outcome=phase==="send"?await adapter.send(message):await adapter.reconcile(message);
   await finishAttempt(tx,lease,outcome,input.now);return outcome.kind;
  }finally{plain?.fill(0);encrypted.fill(0)}
 });
}
