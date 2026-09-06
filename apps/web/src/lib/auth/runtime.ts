import {Pool} from "pg";
import {isAbsolute} from "node:path";
import {AuthRepository} from "../db/repositories/auth";
import {createWindowsDpapi} from "../secrets/windows-dpapi";
import {createAuthHandlers} from "./http";
type Runtime={pool:Pool;handlers:ReturnType<typeof createAuthHandlers>};
const state=globalThis as typeof globalThis&{paySlipAuthRuntime?:Runtime};
function runtime():Runtime{
 if(state.paySlipAuthRuntime)return state.paySlipAuthRuntime;
 // Explicit trusted server configuration. Importing the module neither reads
 // credentials nor starts a connection. Never derive these inputs from requests.
 const connection=process.env.PAYSLIP_AUTH_DATABASE_URL,org=process.env.PAYSLIP_ORGANIZATION_ID,root=process.env.PAYSLIP_PROJECT_ROOT,origin=process.env.PAYSLIP_ADMIN_ORIGIN;
 if(!connection||!org||!root||!isAbsolute(root)||!origin)throw Error("AUTH_CONFIGURATION_REQUIRED");
 const pool=new Pool({connectionString:connection,max:4,connectionTimeoutMillis:3000,statement_timeout:10000});
 const repo=new AuthRepository(pool,createWindowsDpapi({projectRoot:root}),{organizationId:org});
 const result={pool,handlers:createAuthHandlers(repo,origin)};state.paySlipAuthRuntime=result;return result;
}
export async function authRoute(name:keyof ReturnType<typeof createAuthHandlers>,request:Request):Promise<Response>{
 try{return await runtime().handlers[name](request)}catch{return Response.json({code:"AUTH_UNAVAILABLE"},{status:503,headers:{"cache-control":"no-store"}})}
}
