import type { Vnd } from './money';
import type { PitInput, TraceEntry } from './types';
export interface PitCalculation { readonly amountVnd: Vnd; readonly taxableIncomeVnd: Vnd; readonly trace: readonly TraceEntry[]; }
export function calculatePit(gross: Vnd, funds: Vnd, policy: PitInput): PitCalculation {
  if (!Number.isSafeInteger(policy.dependentCount) || policy.dependentCount < 0 || policy.personalDeductionVnd < 0n || policy.dependentDeductionVnd < 0n) throw new Error('PIT_POLICY_INVALID');
  if (!policy.brackets.length || policy.brackets.at(-1)?.upToVnd !== null) throw new Error('PIT_BRACKET_INVALID');
  let boundary=0n;
  for (const [i,b] of policy.brackets.entries()) {
    if (!Number.isInteger(b.rateBasisPoints) || b.rateBasisPoints<0 || b.rateBasisPoints>10000 || (b.upToVnd===null ? i!==policy.brackets.length-1 : b.upToVnd<=boundary)) throw new Error('PIT_BRACKET_INVALID');
    if(b.upToVnd!==null) boundary=b.upToVnd;
  }
  const income=gross-funds-policy.personalDeductionVnd-BigInt(policy.dependentCount)*policy.dependentDeductionVnd;
  const taxableIncomeVnd=income>0n?income:0n;
  let remaining=taxableIncomeVnd, lower=0n, numerator=0n, displayed=0n;
  const trace: TraceEntry[]=[{code:'pit.taxable_income',amountVnd:taxableIncomeVnd,operands:{grossVnd:gross.toString(),employeeInsuranceVnd:funds.toString(),personalDeductionVnd:policy.personalDeductionVnd.toString(),dependentCount:policy.dependentCount,dependentDeductionVnd:policy.dependentDeductionVnd.toString(),formula:'max(0, gross - employee funds - personal deduction - dependents * dependent deduction)'}}];
  for(const [index,b] of policy.brackets.entries()){
    const available=b.upToVnd===null?remaining:b.upToVnd-lower;
    const width=remaining<available?remaining:available;
    const raw=width*BigInt(b.rateBasisPoints), rounded=(raw+5000n)/10000n;
    numerator+=raw;displayed+=rounded;
    trace.push({code:'pit.bracket.'+(index+1),amountVnd:rounded,operands:{taxableSegmentVnd:width.toString(),rateBasisPoints:b.rateBasisPoints,exactNumerator:raw.toString(),denominator:'10000'}});
    remaining-=width;if(b.upToVnd!==null)lower=b.upToVnd;
  }
  const amountVnd=(numerator+5000n)/10000n;
  if(amountVnd!==displayed)trace.push({code:'pit.rounding_reconciliation',amountVnd:amountVnd-displayed,operands:{exactNumerator:numerator.toString(),denominator:'10000',boundary:'once_per_PIT_component'}});
  return {amountVnd,taxableIncomeVnd,trace};
}
