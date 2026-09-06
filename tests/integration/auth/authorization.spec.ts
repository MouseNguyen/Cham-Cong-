import {expect,test} from "vitest";
import {authorize,type Actor,type Command} from "../../../apps/web/src/lib/auth/authorization";
const now=new Date("2026-09-06T05:00:00Z");
const owner={kind:"user" as const,userId:"synthetic-owner",organizationId:"synthetic-org",role:"owner" as const,sessionId:"synthetic-session",mfaSatisfiedAt:now};
const commands:Command[]=["PAYROLL_DRAFT","ATTENDANCE_DRAFT","ATTENDANCE_APPROVE","PAY_RUN_APPROVE","PAY_RUN_FINALIZE","PAYSLIP_RELEASE","CLOCK_EVENT","EMPLOYEE_READ","EMPLOYEE_MANAGE","EMPLOYEE_DEACTIVATE","SCHEDULE_READ","SCHEDULE_MANAGE"];
const principals:{name:string;actor:Actor;allowed:Command[]}[]=[
 {name:"fresh owner",actor:owner,allowed:commands.filter(c=>c!=="CLOCK_EVENT")},
 {name:"stale owner",actor:{...owner,mfaSatisfiedAt:new Date(now.getTime()-660000)},allowed:["PAYROLL_DRAFT","ATTENDANCE_DRAFT","EMPLOYEE_READ","EMPLOYEE_MANAGE","SCHEDULE_READ","SCHEDULE_MANAGE"]},
 {name:"accountant",actor:{...owner,role:"accountant"},allowed:["PAYROLL_DRAFT","ATTENDANCE_DRAFT","EMPLOYEE_READ","EMPLOYEE_MANAGE","SCHEDULE_READ","SCHEDULE_MANAGE"]},
 {name:"kiosk",actor:{kind:"kiosk",organizationId:owner.organizationId},allowed:["CLOCK_EVENT"]}
];
for(const p of principals)for(const command of commands)test(p.name+" "+command,()=>{
 const action=()=>authorize(p.actor,command,now,{organizationId:owner.organizationId});
 if(p.allowed.includes(command))expect(action).not.toThrow();else expect(action).toThrow();
});
test("unknown command, cross-organization and invalid/future MFA fail closed",()=>{
 expect(()=>authorize(owner,"UNKNOWN" as Command,now)).toThrow("FORBIDDEN");
 expect(()=>authorize(owner,"PAYROLL_DRAFT",now,{organizationId:"other"})).toThrow("FORBIDDEN");
 for(const mfaSatisfiedAt of [new Date(NaN),new Date(now.getTime()+1)])expect(()=>authorize({...owner,mfaSatisfiedAt},"PAY_RUN_FINALIZE",now)).toThrow("FRESH_TOTP_REQUIRED");
});
