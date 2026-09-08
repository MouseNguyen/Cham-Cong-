import type { Vnd } from './money';
import type { HolidayInput, TraceEntry } from './types';
export function calculateHoliday(salary: Vnd, h: HolidayInput | null, hourly=false): { entitlementVnd: Vnd; premiumVnd: Vnd; trace: readonly TraceEntry[] } {
  if(h===null)return {entitlementVnd:0n,premiumVnd:0n,trace:[]};
  if(h.entitlementTreatment!==(hourly?'explicit_paid':'included_in_monthly'))throw new Error('HOLIDAY_ENTITLEMENT_POLICY_UNSUPPORTED');
  if(!hourly&&h.paidEntitlementVnd!==0n)throw new Error('HOLIDAY_ENTITLEMENT_DOUBLE_COUNT');
  if(h.paidEntitlementVnd<0n||(hourly&&h.ordinaryHourlyDivisorHours!==1n)||h.payableMilliseconds<0n || h.ordinaryHourlyDivisorHours<=0n || !Number.isSafeInteger(h.daytimePremiumBasisPoints) || h.daytimePremiumBasisPoints<30000 || h.daytimePremiumBasisPoints>100000)throw new Error('HOLIDAY_POLICY_INVALID');
  const denominator=h.ordinaryHourlyDivisorHours*3600000n*10000n;
  const numerator=salary*h.payableMilliseconds*BigInt(h.daytimePremiumBasisPoints);
  const premiumVnd=(numerator+denominator/2n)/denominator;
  return {entitlementVnd:hourly?h.paidEntitlementVnd:0n,premiumVnd,trace:[
    {code:'holiday.entitlement',amountVnd:hourly?h.paidEntitlementVnd:0n,operands:{entitlementTreatment:h.entitlementTreatment,reason:hourly?'explicit_paid_entitlement':'already_in_monthly_salary'}},
    {code:'holiday.daytime_premium',amountVnd:premiumVnd,operands:{...(hourly?{hourlyRateVnd:salary.toString()}:{monthlySalaryVnd:salary.toString()}),ordinaryHourlyDivisorHours:h.ordinaryHourlyDivisorHours.toString(),payableMilliseconds:h.payableMilliseconds.toString(),daytimePremiumBasisPoints:h.daytimePremiumBasisPoints,exactNumerator:numerator.toString(),denominator:denominator.toString()}}
  ]};
}
