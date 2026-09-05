import type { Vnd } from './money';
import type { HolidayInput, TraceEntry } from './types';
export function calculateHoliday(salary: Vnd, h: HolidayInput | null): { entitlementVnd: Vnd; premiumVnd: Vnd; trace: readonly TraceEntry[] } {
  if(h===null)return {entitlementVnd:0n,premiumVnd:0n,trace:[]};
  if(h.entitlementTreatment!=='included_in_monthly')throw new Error('HOLIDAY_ENTITLEMENT_POLICY_UNSUPPORTED');
  if(h.paidEntitlementVnd!==0n)throw new Error('HOLIDAY_ENTITLEMENT_DOUBLE_COUNT');
  if(h.payableMilliseconds<0n || h.ordinaryHourlyDivisorHours<=0n || !Number.isSafeInteger(h.daytimePremiumBasisPoints) || h.daytimePremiumBasisPoints<30000 || h.daytimePremiumBasisPoints>100000)throw new Error('HOLIDAY_POLICY_INVALID');
  const denominator=h.ordinaryHourlyDivisorHours*3600000n*10000n;
  const numerator=salary*h.payableMilliseconds*BigInt(h.daytimePremiumBasisPoints);
  const premiumVnd=(numerator+denominator/2n)/denominator;
  return {entitlementVnd:0n,premiumVnd,trace:[
    {code:'holiday.entitlement',amountVnd:0n,operands:{entitlementTreatment:h.entitlementTreatment,reason:'already_in_monthly_salary'}},
    {code:'holiday.daytime_premium',amountVnd:premiumVnd,operands:{monthlySalaryVnd:salary.toString(),ordinaryHourlyDivisorHours:h.ordinaryHourlyDivisorHours.toString(),payableMilliseconds:h.payableMilliseconds.toString(),daytimePremiumBasisPoints:h.daytimePremiumBasisPoints,exactNumerator:numerator.toString(),denominator:denominator.toString()}}
  ]};
}
