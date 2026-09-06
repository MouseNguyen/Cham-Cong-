import { Pool } from 'pg';
import { isAbsolute } from 'node:path';
import { AuthRepository } from '../db/repositories/auth';
import { AttendanceReviewRepository } from '../db/repositories/attendance-review';
import { createWindowsDpapi } from '../secrets/windows-dpapi';
import { cookieValue } from '../auth/session';
import type { AttendanceReviewDraftInput, AttendanceReviewApprovalInput } from '../../../../../packages/contracts/src/attendance-review';

type Runtime={pool:Pool;auth:AuthRepository;review:AttendanceReviewRepository;org:string;origin:string};
const state=globalThis as typeof globalThis&{attendanceReviewRuntime?:Runtime};
function runtime():Runtime{
 if(state.attendanceReviewRuntime)return state.attendanceReviewRuntime;
 const connection=process.env.PAYSLIP_AUTH_DATABASE_URL,org=process.env.PAYSLIP_ORGANIZATION_ID,root=process.env.PAYSLIP_PROJECT_ROOT,origin=process.env.PAYSLIP_ADMIN_ORIGIN;
 if(!connection||!org||!root||!isAbsolute(root)||!origin||new URL(origin).origin!==origin)throw Error('CONFIGURATION_REQUIRED');
 const pool=new Pool({connectionString:connection,max:4,connectionTimeoutMillis:3000,statement_timeout:10000});const protector=createWindowsDpapi({projectRoot:root});
 return state.attendanceReviewRuntime={pool,org,origin,auth:new AuthRepository(pool,protector,{organizationId:org}),review:new AttendanceReviewRepository(pool,protector,{organizationId:org})};
}
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
function scope(v:Record<string,unknown>){const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;if(typeof v.employeeId!=='string'||!uuid.test(v.employeeId)||typeof v.workplaceId!=='string'||!uuid.test(v.workplaceId)||typeof v.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(v.month))throw Error('BAD_REQUEST');return {employeeId:v.employeeId,workplaceId:v.workplaceId,month:v.month as AttendanceReviewDraftInput['month']};}
async function readBody(request:Request){if(!request.headers.get('content-type')?.startsWith('application/json'))throw Error('BAD_REQUEST');const reader=request.body?.getReader();if(!reader)throw Error('BAD_REQUEST');const chunks:Uint8Array[]=[];let size=0;try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>131072){await reader.cancel();throw Error('BAD_REQUEST')}chunks.push(next.value);}}finally{reader.releaseLock()}const value:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw Error('BAD_REQUEST');return value as Record<string,unknown>;}
export async function attendanceRoute(request:Request):Promise<Response>{
 try{
  const r=runtime(),token=cookieValue(request.headers.get('cookie'));if(!token)throw Error('UNAUTHENTICATED');
  if(request.headers.get('sec-fetch-site')==='cross-site'||request.headers.get('host')!==new URL(r.origin).host)throw Error('CSRF');
  const session=await r.auth.session(token);if(session.actor.organizationId!==r.org)throw Error('FORBIDDEN');
  if(request.method==='GET'){
   const url=new URL(request.url);if(url.searchParams.get('list')==='employees')return json({employees:(await r.pool.query('SELECT id,workplace_id AS "workplaceId",display_name AS "displayName" FROM employees WHERE organization_id=$1 ORDER BY display_name,id LIMIT 200',[r.org])).rows});
   return json(await r.review.list(token,scope(Object.fromEntries(url.searchParams))));
  }
  if(request.method!=='POST')return json({code:'METHOD_NOT_ALLOWED'},405);
  if(request.headers.get('origin')!==r.origin)throw Error('CSRF');
  const v=await readBody(request),target=scope(v);const credentials={sessionToken:token,csrfToken:request.headers.get('x-csrf-token')??''};
  if(!Number.isSafeInteger(v.expectedVersion)||(v.expectedVersion as number)<0)throw Error('BAD_REQUEST');const expectedVersion=v.expectedVersion as number;
  if(v.action==='draft'){
   if(typeof v.sourceHash!=='string'||typeof v.reason!=='string'||!Array.isArray(v.segments)||!Array.isArray(v.exclusions)||v.segments.length>500||v.exclusions.length>1000)throw Error('BAD_REQUEST');
   return json(await r.review.draft(credentials,{...target,expectedVersion,sourceHash:v.sourceHash,reason:v.reason,segments:v.segments as AttendanceReviewDraftInput['segments'],exclusions:v.exclusions as AttendanceReviewDraftInput['exclusions']}));
  }
  if(typeof v.candidateHash!=='string')throw Error('BAD_REQUEST');
  if(v.action==='approve'){if(typeof v.reason!=='string')throw Error('BAD_REQUEST');return json(await r.review.approve(credentials,{...target,expectedVersion,candidateHash:v.candidateHash,reason:v.reason} as AttendanceReviewApprovalInput));}
  if(v.action==='finalize')return json(await r.review.finalize(credentials,{...target,expectedVersion,candidateHash:v.candidateHash,reason:'Chốt bảng công theo đề xuất đã duyệt'}));
  throw Error('BAD_REQUEST');
 }catch(error){
  const code=error instanceof Error?error.message:'ATTENDANCE_UNAVAILABLE';
  if(['UNAUTHENTICATED','AUTHENTICATION_FAILED'].includes(code))return json({code},401);
  if(['FORBIDDEN','CSRF','FRESH_TOTP_REQUIRED'].includes(code))return json({code},403);
  if(/^[A-Z][A-Z_]{2,80}$/.test(code)&&!['CONFIGURATION_REQUIRED'].includes(code))return json({code},code==='BAD_REQUEST'?400:409);
  return json({code:'ATTENDANCE_UNAVAILABLE'},503);
 }
}
