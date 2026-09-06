import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { hashPassword } from "../../../apps/web/src/lib/auth/password";
import { generateTotpSecret, generateTotp } from "../../../apps/web/src/lib/auth/totp";
import { createWindowsDpapi } from "../../../apps/web/src/lib/secrets/windows-dpapi";
import { AuthRepository } from "../../../apps/web/src/lib/db/repositories/auth";

export function testPool() {
 const value=process.env.PAYSLIP_TEST_DATABASE_URL;
 if(!value) throw Error("OWNED_TEST_DATABASE_REQUIRED");
 const u=new URL(value);
 if(u.hostname!=="127.0.0.1"||u.port!=="55432"||u.pathname!=="/payslip_w2_02_auth_synthetic"||u.username!=="payslip_app")throw Error("UNSAFE_TEST_DATABASE");
 return new Pool({connectionString:value,max:4,statement_timeout:10000});
}
export const protector=createWindowsDpapi({projectRoot:process.cwd()});
export async function scenario(pool:Pool,role:"owner"|"accountant"="owner",organizationId?:string) {
 const org=organizationId??randomUUID(),id=randomUUID(),factor=randomUUID(),email=id+"@example.invalid";
 const password=randomBytes(24).toString("base64url"),secret=generateTotpSecret();
 const raw=Buffer.from(secret);let ciphertext:Buffer;
 try{ciphertext=await protector.protect(raw,"pay-slip/totp/v1")}finally{raw.fill(0)}
 await pool.query("INSERT INTO organizations(id,name) VALUES($1,'Synthetic Auth') ON CONFLICT DO NOTHING",[org]);
 await pool.query("INSERT INTO users(id,organization_id,role,email,password_hash) VALUES($1,$2,$3,$4,$5)",[id,org,role,email,await hashPassword(password)]);
 await pool.query("INSERT INTO mfa_factors(id,organization_id,user_id,encrypted_secret_ref) VALUES($1,$2,$3,$4)",[factor,org,id,ciphertext.toString("base64")]);ciphertext.fill(0);
 const clock={value:Date.now()};
 const repo=new AuthRepository(pool,protector,{organizationId:org,now:()=>new Date(clock.value)});
 return {org,id,factor,email,password,secret,clock,repo,code:()=>generateTotp(secret,clock.value)};
}
export async function login(s:Awaited<ReturnType<typeof scenario>>) {
 const pending=await s.repo.passwordLogin(s.email,s.password,"synthetic-local");
 return s.repo.completeTotp(pending.challenge,await s.code(),"synthetic-local");
}
