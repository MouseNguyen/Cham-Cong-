import type { Vnd } from './money';
import type { InsuranceFundInput } from './types';
export interface InsuranceContribution { readonly id:string; readonly employeeVnd:Vnd; readonly employerVnd:Vnd; readonly appliedBaseVnd:Vnd; }
const REQUIRED=['SI_SICKNESS_MATERNITY','SI_RETIREMENT_SURVIVORSHIP','OCCUPATIONAL_ACCIDENT_DISEASE','HEALTH_INSURANCE','UNEMPLOYMENT_INSURANCE'];
export function calculateInsurance(funds:readonly InsuranceFundInput[]): readonly InsuranceContribution[] {
  const ids=new Set(funds.map(f=>f.id));
  if(ids.size!==funds.length)throw new Error('INSURANCE_FUND_DUPLICATE');
  if(REQUIRED.some(id=>!ids.has(id)) || [...ids].some(id=>!REQUIRED.includes(id)))throw new Error('INSURANCE_FUND_SET_UNSUPPORTED');
  return funds.map(f=>{
    if(typeof f.eligible!=='boolean' || f.minimumVnd<0n || f.maximumVnd<f.minimumVnd || f.baseVnd<0n)throw new Error('INSURANCE_BASE_INVALID');
    for(const rate of [f.employeeRateBasisPoints,f.employerRateBasisPoints])if(!Number.isSafeInteger(rate)||rate<0||rate>10000)throw new Error('INSURANCE_RATE_INVALID');
    const appliedBaseVnd=!f.eligible?0n:f.baseVnd<f.minimumVnd?f.minimumVnd:f.baseVnd>f.maximumVnd?f.maximumVnd:f.baseVnd;
    return {id:f.id,appliedBaseVnd,employeeVnd:(appliedBaseVnd*BigInt(f.employeeRateBasisPoints)+5000n)/10000n,employerVnd:(appliedBaseVnd*BigInt(f.employerRateBasisPoints)+5000n)/10000n};
  });
}
