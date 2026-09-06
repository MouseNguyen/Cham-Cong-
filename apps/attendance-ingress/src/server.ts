import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { ClockRequest, ReconcileRequest } from '../../../packages/contracts/src/attendance.ts';
import type { AttendanceIngressRepository } from '../../../packages/attendance-domain/src/ports.ts';
import { deviceToken } from './device-session.ts';
import { recordClockEvent } from './record-clock-event.ts';
export interface AttendanceServerOptions { readonly repository: AttendanceIngressRepository; readonly now?:()=>Date; }
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const assets:Record<string,{path:URL;type:string}>={
 '/':{path:new URL('./kiosk/index.html',import.meta.url),type:'text/html; charset=utf-8'},
 '/kiosk.css':{path:new URL('./kiosk/kiosk.css',import.meta.url),type:'text/css; charset=utf-8'},
 '/kiosk.js':{path:new URL('../dist/kiosk.js',import.meta.url),type:'text/javascript; charset=utf-8'},
};
function reply(r:ServerResponse,status:number,value:object){r.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});r.end(JSON.stringify(value));}
async function body(r:IncomingMessage){if(!r.headers['content-type']?.startsWith('application/json'))throw Error('BAD');let n=0;const c:Buffer[]=[];for await(const x of r){const b=Buffer.from(x);n+=b.length;if(n>2048)throw Error('BAD');c.push(b)}const v:unknown=JSON.parse(Buffer.concat(c).toString());if(!v||typeof v!=='object'||Array.isArray(v))throw Error('BAD');return v as Record<string,unknown>}
function employeeCode(value:unknown):value is string{return typeof value==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(value);}
function clock(v:Record<string,unknown>):ClockRequest{if(!employeeCode(v.employeeCode)||typeof v.pin!=='string'||!/^\d{6}$/.test(v.pin)||(v.action!=='CLOCK_IN'&&v.action!=='CLOCK_OUT')||typeof v.idempotencyKey!=='string'||!UUID.test(v.idempotencyKey))throw Error('BAD');return {employeeCode:v.employeeCode,pin:v.pin,action:v.action,idempotencyKey:v.idempotencyKey}}
function reconcile(v:Record<string,unknown>):ReconcileRequest{if(!employeeCode(v.employeeCode)||typeof v.idempotencyKey!=='string'||!UUID.test(v.idempotencyKey))throw Error('BAD');return {employeeCode:v.employeeCode,idempotencyKey:v.idempotencyKey}}
function local(r:IncomingMessage){const host=r.headers.host;return (host===`127.0.0.1:${r.socket.localPort}`||host===`localhost:${r.socket.localPort}`)&&(!r.headers.origin||r.headers.origin===`http://${host}`);}
export function createAttendanceServer(options:AttendanceServerOptions):Server{
 const now=options.now??(()=>new Date());
 return createServer(async(req,res)=>{
  const requestId=randomUUID();res.setHeader('x-request-id',requestId);
  const failure={recorded:false,code:'CLOCK_NOT_RECORDED',message:'Không thể ghi nhận chấm công.',nextAction:'CHECK_WITH_MANAGER',requestId};
  try{
   if(!local(req))return reply(res,403,failure);
   const path=new URL(req.url??'/','http://localhost').pathname;
   if(req.method==='GET'&&path==='/health'){let ready=false;try{ready=await options.repository.readiness()}catch{}return reply(res,ready?200:503,{ready});}
   if(req.method==='GET'&&Object.hasOwn(assets,path)){
    const asset=assets[path]!;const data=await readFile(asset.path);
    res.writeHead(200,{'content-type':asset.type,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"});return res.end(data);
   }
   if(req.method!=='POST'||(path!=='/clock'&&path!=='/reconcile'))return reply(res,404,{code:'NOT_FOUND'});
   const token=deviceToken(req.headers),device=token?await options.repository.authenticateDevice(token):null;
   if(!device)return reply(res,401,failure);
   const input=await body(req);
   if(path==='/clock'){const out=await recordClockEvent(options.repository,device,clock(input),now(),requestId);return reply(res,'pending_confirmation'in out?202:out.recorded?200:409,{...out,requestId});}
   const value=reconcile(input);const out=await options.repository.reconcile({...value,deviceId:device.deviceId,sessionId:device.sessionId});
   return out.kind==='recorded'?reply(res,200,{recorded:true,eventId:out.event.id,recordedAt:new Date(out.event.occurredAtUtcMs).toISOString(),nextAllowedAction:out.event.direction==='IN'?'CLOCK_OUT':'CLOCK_IN',requestId}):reply(res,202,{pending_confirmation:true,requestId});
  }catch{return reply(res,400,failure);}
 });
}
