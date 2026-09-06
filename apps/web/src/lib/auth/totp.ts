import {generate,generateSecret,verify} from "otplib";
export function generateTotpSecret():string{return generateSecret();}
export async function generateTotp(secret:string,now=Date.now()):Promise<string>{return generate({secret,epoch:now/1000,period:30,digits:6});}
export async function matchingTotpStep(secret:string,token:string,now:number):Promise<number|null>{
 if(!/^[0-9]{6}$/.test(token))return null;
 try{const r=await verify({secret,token,epoch:now/1000,epochTolerance:0,period:30,digits:6});return r.valid&&"timeStep" in r?r.timeStep:null}catch{return null}
}
export async function verifyTotp(secret:string,token:string):Promise<boolean>{return (await matchingTotpStep(secret,token,Date.now()))!==null;}
export function totpStep(now=Date.now()):string{return String(Math.floor(now/30_000));}
