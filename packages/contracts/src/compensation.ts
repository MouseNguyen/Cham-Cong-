import {fail} from "./employee";
export type CompensationTerm={basis:"monthly_salary";monthlySalaryVnd:string}|{basis:"hourly_rate";hourlyRateVnd:string};
export const SYNTHETIC_MINIMUM_POLICY="2026-region-i-fixture-v1";
export function validateCompensation(kind:"full_time"|"part_time",term:CompensationTerm,effective:Date):{monthly:string|null;hourly:string|null}{
 const monthly=kind==="full_time";
 if(!term||term.basis!==(monthly?"monthly_salary":"hourly_rate"))fail("COMPENSATION_BASIS_MISMATCH");
 const data=term as unknown as Record<string,unknown>,key=monthly?"monthlySalaryVnd":"hourlyRateVnd",value=data[key];
 if(Object.keys(data).sort().join(",")!==["basis",key].sort().join(",")||typeof value!=="string"||!/^[1-9]\d{0,18}$/.test(value)||BigInt(value)>9223372036854775807n)fail("INVALID_MONEY");
 // Explicit synthetic2026 policy. A later effective-year requires a separately versioned input.
 if(new Date(effective.getTime()+7*3600000).getUTCFullYear()!==2026)fail("MINIMUM_POLICY_UNAVAILABLE");
 if(BigInt(value)<(monthly?5310000n:25500n))fail("BELOW_MINIMUM_WAGE");
 return {monthly:monthly?value:null,hourly:monthly?null:value};
}
