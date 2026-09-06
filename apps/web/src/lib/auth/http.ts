import type {AuthRepository} from "../db/repositories/auth";
import type {Command} from "./authorization";
import {authorizeCommand} from "../application/commands/authorization";
import {CHALLENGE_COOKIE,cookieValue,secureCookie,expiredCookie,csrfForToken} from "./session";
function json(value:unknown,status=200){return Response.json(value,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}});}
async function body(request:Request):Promise<Record<string,unknown>>{
 if(!request.headers.get("content-type")?.startsWith("application/json"))throw Error("BAD_REQUEST");
 const reader=request.body?.getReader();if(!reader)throw Error("BAD_REQUEST");
 let length=0;const chunks:Uint8Array[]=[];
 try{for(;;){const r=await reader.read();if(r.done)break;length+=r.value.length;if(length>2048){await reader.cancel();throw Error("BAD_REQUEST")}chunks.push(r.value)}}finally{reader.releaseLock()}
 try{const data:unknown=JSON.parse(Buffer.concat(chunks).toString("utf8"));if(!data||typeof data!=="object"||Array.isArray(data))throw Error();return data as Record<string,unknown>}catch{throw Error("BAD_REQUEST")}
}
function text(data:Record<string,unknown>,key:string,max:number){const value=data[key];if(typeof value!=="string"||!value||value.length>max)throw Error("BAD_REQUEST");return value;}
export function createAuthHandlers(repo:AuthRepository,origin:string){
 if(new URL(origin).origin!==origin)throw Error("AUTH_CONFIGURATION_REQUIRED");
 const guarded=(work:(request:Request)=>Promise<Response>)=>async(request:Request):Promise<Response>=>{
  try{
   if(request.method!=="GET"&&(request.headers.get("origin")!==origin||request.headers.get("host")!==new URL(origin).host))throw Error("CSRF");
   if(request.headers.get("sec-fetch-site")==="cross-site")throw Error("CSRF");
   return await work(request);
  }catch(error){
   const code=error instanceof Error?error.message:"UNAVAILABLE";
   const status=code==="BAD_REQUEST"?400:code==="CSRF"||code==="FORBIDDEN"||code==="FRESH_TOTP_REQUIRED"?403:code==="AUTHENTICATION_FAILED"||code==="UNAUTHENTICATED"?401:503;
   return json({code:status===503?"AUTH_UNAVAILABLE":code},status);
  }
 };
 const token=(r:Request)=>{const value=cookieValue(r.headers.get("cookie"));if(!value)throw Error("UNAUTHENTICATED");return value;};
 return {
  login:guarded(async request=>{
   const data=await body(request),result=await repo.passwordLogin(text(data,"email",254),text(data,"password",256),"local-admin");
   const response=json({next:"/login/totp"});response.headers.append("set-cookie",secureCookie(result.challenge,result.expires,CHALLENGE_COOKIE));return response;
  }),
  totp:guarded(async request=>{
   const data=await body(request),code=text(data,"code",6),challenge=cookieValue(request.headers.get("cookie"),CHALLENGE_COOKIE);
   const result=challenge?await repo.completeTotp(challenge,code,"local-admin"):await repo.stepUp(token(request),code,request.headers.get("x-csrf-token")??"","local-admin");
   const response=json({actor:result.actor,csrfToken:result.csrfToken});
   response.headers.append("set-cookie",secureCookie(result.token,result.expires));
   response.headers.append("set-cookie",expiredCookie(CHALLENGE_COOKIE));return response;
  }),
  session:guarded(async request=>{
   const value=token(request),s=await repo.session(value);return json({actor:s.actor,csrfToken:csrfForToken(value),expires:s.expires});
  }),
  logout:guarded(async request=>{
   const value=token(request);await repo.checkCsrf(value,request.headers.get("x-csrf-token")??"");await repo.revoke(value);
   const response=json({ok:true});response.headers.append("set-cookie",expiredCookie());response.headers.append("set-cookie",expiredCookie(CHALLENGE_COOKIE));return response;
  }),
  authorize:guarded(async request=>{
   const data=await body(request);
   const actor=await authorizeCommand(repo,token(request),text(data,"command",64) as Command,{organizationId:text(data,"organizationId",64)},request.headers.get("x-csrf-token")??"");
   // This endpoint checks the common permission boundary; it executes no business command.
   return json({allowed:true,role:actor.role});
  })
 };
}
