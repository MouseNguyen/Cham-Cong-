import {randomUUID,randomBytes} from "node:crypto";
import type {Pool,PoolClient} from "pg";
import type {WindowsSecretProtector} from "../../secrets/windows-dpapi";
import {hashSecret,validCsrf} from "../../auth/csrf";
import {newSessionSecrets} from "../../auth/session";
import {hashPassword,verifyPassword} from "../../auth/password";
import {matchingTotpStep} from "../../auth/totp";
import {isCommand,type UserActor,type Role} from "../../auth/authorization";
import {withTransaction} from "../transaction";

const GENERIC="AUTHENTICATION_FAILED",LOCK_MS=15*60_000,SESSION_MS=8*60*60_000;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
type User={id:string;organization_id:string;email:string;role:Role;password_hash:string|null;active:boolean};
type Rate={key_hash:string;failure_count:number;locked_until:Date|null;updated_at:Date};
type SessionRow={id:string;user_id:string;organization_id:string;role:Role;csrf_hash:string|null;mfa_satisfied_at:Date|null;expires_at:Date;revoked_at:Date|null};
type Failure={error:string};
export type AuthSession={token:string;csrfToken:string;expires:Date;actor:UserActor};
export class AuthRepository{
 private readonly organizationId:string;
 private readonly clock:()=>Date;
 private readonly dummy:Promise<string>;
 constructor(private readonly pool:Pool,private readonly protector:WindowsSecretProtector,options:{organizationId:string;now?:()=>Date}){
  if(!options?.organizationId)throw Error("AUTH_CONFIGURATION_REQUIRED");
  this.organizationId=options.organizationId;this.clock=options.now??(()=>new Date());
  this.dummy=hashPassword(randomBytes(24).toString("base64url"));
 }
 now():Date{return this.clock();}
 private async audit(c:PoolClient,action:string,outcome:"passed"|"denied",userId:string|null,accountRef:string){
  await c.query("INSERT INTO auth_security_events(id,organization_id,actor_id,action,outcome,account_ref,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)",[randomUUID(),this.organizationId,userId,action,outcome,accountRef,this.now()]);
 }
 private async rate(c:PoolClient,key:string):Promise<Rate>{
  const now=this.now();
  await c.query("INSERT INTO auth_rate_limits(key_hash,updated_at) VALUES($1,$2) ON CONFLICT DO NOTHING",[key,now]);
  let row=(await c.query<Rate>("SELECT * FROM auth_rate_limits WHERE key_hash=$1 FOR UPDATE",[key])).rows[0]!;
  if((row.locked_until&&row.locked_until<=now)||row.updated_at.getTime()<now.getTime()-LOCK_MS){
   row=(await c.query<Rate>("UPDATE auth_rate_limits SET failure_count=0,locked_until=NULL,updated_at=$2 WHERE key_hash=$1 RETURNING *",[key,now])).rows[0]!;
  }return row;
 }
 private async sourceAllowed(c:PoolClient,source:string):Promise<boolean>{
  const key=hashSecret(this.organizationId+":source:"+source.slice(0,128)),r=await this.rate(c,key),now=this.now();
  if(r.locked_until&&r.locked_until>now)return false;
  const count=r.failure_count+1;
  await c.query("UPDATE auth_rate_limits SET failure_count=$2,locked_until=$3,updated_at=$4 WHERE key_hash=$1",[key,count,count>=40?new Date(now.getTime()+LOCK_MS):null,now]);
  return count<40;
 }
 private accountKey(email:string):string{return hashSecret(this.organizationId+":account:"+email.toLowerCase());}
 private async failed(c:PoolClient,key:string,userId:string|null,action:string):Promise<Failure>{
  const r=await this.rate(c,key),count=r.failure_count+1,now=this.now();
  await c.query("UPDATE auth_rate_limits SET failure_count=$2,locked_until=$3,updated_at=$4 WHERE key_hash=$1",[key,count,count>=5?new Date(now.getTime()+LOCK_MS):null,now]);
  await this.audit(c,action,"denied",userId,key);return {error:GENERIC};
 }
 private unwrap<T>(result:T|Failure):T{if(result&&typeof result==="object"&&"error" in result)throw Error(String(result.error));return result as T;}
 async passwordLogin(email:string,password:string,source="local-admin"):Promise<{challenge:string;expires:Date}>{
  if(typeof email!=="string"||email.length>254||typeof password!=="string"||password.length>256)throw Error(GENERIC);
  const normalized=email.trim().toLowerCase(),key=this.accountKey(normalized);
  const result=await withTransaction(this.pool,async c=>{
   const sourceOk=await this.sourceAllowed(c,source),rate=await this.rate(c,key);
   const user=(await c.query<User>("SELECT * FROM users WHERE organization_id=$1 AND lower(email)=$2 FOR UPDATE",[this.organizationId,normalized])).rows[0];
   if(!sourceOk||(rate.locked_until&&rate.locked_until>this.now())){await this.audit(c,"auth.password","denied",user?.id??null,key);return {error:GENERIC};}
   const correct=await verifyPassword(user?.password_hash??await this.dummy,password);
   if(!user?.active||!correct)return this.failed(c,key,user?.id??null,"auth.password");
   const factor=(await c.query("SELECT id FROM mfa_factors WHERE user_id=$1 AND organization_id=$2 AND enabled",[user.id,this.organizationId])).rows[0];
   if(!factor)return this.failed(c,key,user.id,"auth.password");
   const challenge=randomBytes(32).toString("base64url"),expires=new Date(this.now().getTime()+5*60_000);
   await c.query("INSERT INTO auth_login_challenges(id,organization_id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4,$5)",[randomUUID(),this.organizationId,user.id,hashSecret(challenge),expires]);
   await this.audit(c,"auth.password","passed",user.id,key);return {challenge,expires};
  });return this.unwrap(result);
 }
 private async consumeFactor(c:PoolClient,user:User,code:string):Promise<boolean>{
  const factor=(await c.query<{id:string;encrypted_secret_ref:string}>("SELECT id,encrypted_secret_ref FROM mfa_factors WHERE user_id=$1 AND organization_id=$2 AND enabled FOR UPDATE",[user.id,this.organizationId])).rows[0];
  if(!factor)return false;
  const encrypted=Buffer.from(factor.encrypted_secret_ref,"base64");let plain:Buffer|undefined;let step:number|null=null;
  try{plain=await this.protector.unprotect(encrypted,"pay-slip/totp/v1");step=await matchingTotpStep(plain.toString("utf8"),code,this.now().getTime());}catch{return false}finally{encrypted.fill(0);plain?.fill(0)}
  if(step===null)return false;
  const result=await c.query("INSERT INTO auth_totp_replays(factor_id,time_step,consumed_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[factor.id,String(step),this.now()]);
  return result.rowCount===1;
 }
 private async issue(c:PoolClient,user:User):Promise<AuthSession>{
  const s=newSessionSecrets(),id=randomUUID(),now=this.now(),expires=new Date(now.getTime()+SESSION_MS);
  await c.query("INSERT INTO sessions(id,organization_id,user_id,token_hash,csrf_hash,mfa_satisfied_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)",[id,this.organizationId,user.id,s.tokenHash,s.csrfHash,now,expires]);
  await c.query("UPDATE sessions SET revoked_at=$1,replaced_by_id=$2 WHERE user_id=$3 AND organization_id=$4 AND id<>$2 AND revoked_at IS NULL",[now,id,user.id,this.organizationId]);
  await c.query("UPDATE auth_rate_limits SET failure_count=0,locked_until=NULL,updated_at=$2 WHERE key_hash=$1",[this.accountKey(user.email),now]);
  await this.audit(c,"auth.session.created","passed",user.id,this.accountKey(user.email));
  return {token:s.token,csrfToken:s.csrfToken,expires,actor:{kind:"user",userId:user.id,organizationId:this.organizationId,role:user.role,sessionId:id,mfaSatisfiedAt:now}};
 }
 async completeTotp(challenge:string,code:string,source="local-admin"):Promise<AuthSession>{
  if(typeof challenge!=="string"||!TOKEN.test(challenge)||typeof code!=="string"||code.length>6)throw Error(GENERIC);
  const result=await withTransaction(this.pool,async c=>{
   const sourceOk=await this.sourceAllowed(c,source);
   const found=(await c.query<{user_id:string;email:string}>("SELECT ch.user_id,u.email FROM auth_login_challenges ch JOIN users u ON u.id=ch.user_id AND u.organization_id=ch.organization_id WHERE ch.token_hash=$1 AND ch.organization_id=$2",[hashSecret(challenge),this.organizationId])).rows[0];
   if(!found||!sourceOk){await this.audit(c,"auth.totp","denied",null,hashSecret("invalid-challenge"));return {error:GENERIC};}
   const key=this.accountKey(found.email),rate=await this.rate(c,key);
   const user=(await c.query<User>("SELECT * FROM users WHERE id=$1 AND organization_id=$2 FOR UPDATE",[found.user_id,this.organizationId])).rows[0]!;
   const ch=(await c.query<{id:string;expires_at:Date;used_at:Date|null}>("SELECT * FROM auth_login_challenges WHERE token_hash=$1 AND organization_id=$2 FOR UPDATE",[hashSecret(challenge),this.organizationId])).rows[0];
   if(!user.active||!ch||ch.used_at||ch.expires_at<=this.now()||(rate.locked_until&&rate.locked_until>this.now()))return this.failed(c,key,user.id,"auth.totp");
   if(!await this.consumeFactor(c,user,code))return this.failed(c,key,user.id,"auth.totp");
   await c.query("UPDATE auth_login_challenges SET used_at=$2 WHERE id=$1",[ch.id,this.now()]);
   return this.issue(c,user);
  });return this.unwrap(result);
 }
 async session(token:string):Promise<{actor:UserActor;csrfHash:string;expires:Date}>{
  if(typeof token!=="string"||!TOKEN.test(token))throw Error("UNAUTHENTICATED");
  const row=(await this.pool.query<SessionRow>("SELECT s.*,u.role FROM sessions s JOIN users u ON u.id=s.user_id AND u.organization_id=s.organization_id WHERE s.token_hash=$1 AND s.organization_id=$2 AND s.revoked_at IS NULL AND s.expires_at>$3 AND u.active AND EXISTS(SELECT 1 FROM mfa_factors f WHERE f.user_id=u.id AND f.organization_id=u.organization_id AND f.enabled)",[hashSecret(token),this.organizationId,this.now()])).rows[0];
  if(!row?.csrf_hash||!row.mfa_satisfied_at||row.mfa_satisfied_at>this.now()||!["owner","accountant"].includes(row.role))throw Error("UNAUTHENTICATED");
  return {actor:{kind:"user",userId:row.user_id,organizationId:row.organization_id,role:row.role,sessionId:row.id,mfaSatisfiedAt:row.mfa_satisfied_at},csrfHash:row.csrf_hash,expires:row.expires_at};
 }
 async actor(token:string):Promise<UserActor>{return (await this.session(token)).actor;}
 async checkCsrf(token:string,csrf:string):Promise<UserActor>{const s=await this.session(token);if(!validCsrf(s.csrfHash,csrf))throw Error("CSRF");return s.actor;}
 async stepUp(token:string,code:string,csrf:string,source="local-admin"):Promise<AuthSession>{
  const actor=await this.checkCsrf(token,csrf);
  const result=await withTransaction(this.pool,async c=>{
   const sourceOk=await this.sourceAllowed(c,source);
   const found=(await c.query<User>("SELECT * FROM users WHERE id=$1 AND organization_id=$2",[actor.userId,this.organizationId])).rows[0]!;
   const key=this.accountKey(found.email),rate=await this.rate(c,key);
   const user=(await c.query<User>("SELECT * FROM users WHERE id=$1 AND organization_id=$2 FOR UPDATE",[actor.userId,this.organizationId])).rows[0]!;
   const s=(await c.query<SessionRow>("SELECT * FROM sessions WHERE id=$1 AND token_hash=$2 FOR UPDATE",[actor.sessionId,hashSecret(token)])).rows[0];
   if(!sourceOk||!user.active||!s||s.revoked_at||s.expires_at<=this.now()||!validCsrf(s.csrf_hash??"",csrf)||(rate.locked_until&&rate.locked_until>this.now()))return this.failed(c,key,user.id,"auth.stepup");
   if(!await this.consumeFactor(c,user,code))return this.failed(c,key,user.id,"auth.stepup");
   return this.issue(c,user);
  });return this.unwrap(result);
 }
 async recordAuthorization(actor:UserActor,command:string,outcome:"passed"|"denied",resource:{organizationId:string}):Promise<void>{
  if(actor.organizationId!==this.organizationId)throw Error("FORBIDDEN");
  const action="auth.authorization."+(isCommand(command)?command:"UNKNOWN");
  await withTransaction(this.pool,c=>this.audit(c,action,outcome,actor.userId,hashSecret(resource.organizationId)));
 }
 async revoke(token:string):Promise<void>{
  const session=await this.session(token);
  await withTransaction(this.pool,async c=>{
   await c.query("UPDATE sessions SET revoked_at=$2 WHERE id=$1 AND revoked_at IS NULL",[session.actor.sessionId,this.now()]);
   await this.audit(c,"auth.logout","passed",session.actor.userId,hashSecret(session.actor.userId));
  });
 }
}
