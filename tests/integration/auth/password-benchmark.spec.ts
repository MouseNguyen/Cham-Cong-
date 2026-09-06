import {randomBytes} from "node:crypto";
import {mkdirSync,writeFileSync} from "node:fs";
import {expect,test} from "vitest";
import {ARGON2_OPTIONS,hashPassword,verifyPassword} from "../../../apps/web/src/lib/auth/password";
test("Argon2id uses the recorded work factor and verifies on the target Windows host",async()=>{
 const password=randomBytes(24).toString("base64url"),samples:number[]=[];
 for(let i=0;i<3;i++){const start=performance.now();const hash=await hashPassword(password);const parts=hash.split("$");expect(parts.slice(1,3)).toEqual(["argon2id","v=19"]);expect(parts[3]!.split(",").sort()).toEqual(["m=19456","p=1","t=2"]);expect(await verifyPassword(hash,password)).toBe(true);expect(await verifyPassword(hash,"wrong-synthetic-password")).toBe(false);samples.push(Math.round(performance.now()-start));}
 expect(Math.max(...samples)).toBeLessThan(5000);
 mkdirSync("ops/evidence",{recursive:true});
 writeFileSync("ops/evidence/PAY-W2-02-argon2.json",JSON.stringify({task_id:"PAY-W2-02",platform:process.platform,node:process.version,parameters:ARGON2_OPTIONS,samples_ms_hash_plus_two_verifications:samples,maximum_sample_ms:5000,scope:"local synthetic benchmark; not concurrent production capacity"},null,2)+"\n");
});
