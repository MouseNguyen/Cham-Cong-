export type Role = "owner" | "accountant";
export type UserActor = {kind:"user";userId:string;organizationId:string;role:Role;sessionId:string;mfaSatisfiedAt:Date};
export type Actor = UserActor | {kind:"kiosk";organizationId?:string};
export type Command = "PAYROLL_DRAFT"|"ATTENDANCE_DRAFT"|"ATTENDANCE_APPROVE"|"PAY_RUN_APPROVE"|"PAY_RUN_FINALIZE"|"PAYSLIP_RELEASE"|"CLOCK_EVENT";
export const FRESH_MFA_MS=10*60*1000;
const commands=new Set<string>(["PAYROLL_DRAFT","ATTENDANCE_DRAFT","ATTENDANCE_APPROVE","PAY_RUN_APPROVE","PAY_RUN_FINALIZE","PAYSLIP_RELEASE","CLOCK_EVENT"]);
export function isCommand(value:string):value is Command{return commands.has(value)}
export function authorize(actor:Actor,command:Command,now=new Date(),resource?:{organizationId:string}):void{
 if(!actor||!commands.has(command))throw Error("FORBIDDEN");
 if(actor.kind==="kiosk"){if(command==="CLOCK_EVENT"&&(!resource||actor.organizationId===resource.organizationId))return;throw Error("FORBIDDEN")}
 if(actor.kind!=="user"||!["owner","accountant"].includes(actor.role)||!actor.userId||!actor.sessionId||!actor.organizationId)throw Error("FORBIDDEN");
 if(resource&&resource.organizationId!==actor.organizationId)throw Error("FORBIDDEN");
 if(command==="CLOCK_EVENT")throw Error("FORBIDDEN");
 const age=now.getTime()-actor.mfaSatisfiedAt?.getTime();
 if(!Number.isFinite(age)||age<0)throw Error("FRESH_TOTP_REQUIRED");
 if(command==="PAYROLL_DRAFT"||command==="ATTENDANCE_DRAFT")return;
 if(actor.role!=="owner")throw Error("FORBIDDEN");
 if(age>FRESH_MFA_MS)throw Error("FRESH_TOTP_REQUIRED");
}
