
import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
function rawPartTime(){
 const r=JSON.parse(readFileSync(new URL('../../../tests/fixtures/payroll/part-time-80h.json',import.meta.url),'utf8')).input;
 r.calculator.sourceArtifactSha256=createHash('sha256').update(['types.ts','calculate.ts','insurance.ts','pit.ts','holiday.ts','trace.ts'].map(p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8')).join('')).digest('hex');
 return r;
}

import {calculatePayroll,inputFromFixture} from '../src/calculate';
import {calculateInsurance} from '../src/insurance';
import {calculatePit} from '../src/pit';
test.each([['25499',false],['25500',true],['25501',true]])('minimum hourly boundary%s',(rate,allowed)=>{
 const raw=rawPartTime();raw.compensation.hourlyRateVnd=rate;raw.attendance.payableMilliseconds='3600000';
 if(allowed)expect(calculatePayroll(inputFromFixture(raw)).gross).toBe(rate);
 else expect(()=>calculatePayroll(inputFromFixture(raw))).toThrow('BELOW_REGIONAL_MINIMUM');
});
test('monthly eligibility is explicit for each fund, date-bound and recomputed',()=>{
 for(const income of ['2529999','2530000','2530001']){
 const raw=rawPartTime();for(const f of raw.insuranceFunds){f.monthlyEligibility.assessedIncomeVnd=income;f.eligible=BigInt(income)>=2530000n;}
 const result=calculatePayroll(inputFromFixture(raw));expect(result.employeeInsuranceTotal).toBe(income==='2529999'?'0':'265650');
 }
 for(const mutate of [(r:ReturnType<typeof rawPartTime>)=>{delete r.insuranceFunds[0].monthlyEligibility;},(r:ReturnType<typeof rawPartTime>)=>{r.insuranceFunds[0].monthlyEligibility.month='2026-07';},(r:ReturnType<typeof rawPartTime>)=>{r.insuranceFunds[0].eligible=true;}]){
 const raw=rawPartTime();mutate(raw);expect(()=>calculatePayroll(inputFromFixture(raw))).toThrow();
 }
});
test('every fund floor and cap has below/at/above coverage',()=>{
 const funds=inputFromFixture(rawPartTime()).insuranceFunds;
 for(const fund of funds)for(const bound of [fund.minimumVnd,fund.maximumVnd])for(const delta of [-1n,0n,1n]){
 const base=bound+delta;const expected=base<fund.minimumVnd?fund.minimumVnd:base>fund.maximumVnd?fund.maximumVnd:base;
 const modified=funds.map(f=>({...f,eligible:true,baseVnd:f.id===fund.id?base:f.baseVnd}));
 const got=calculateInsurance(modified).find(f=>f.id===fund.id)!;
 expect(got.appliedBaseVnd).toBe(expected);
 expect(got.employeeVnd).toBe((expected*BigInt(fund.employeeRateBasisPoints)+5000n)/10000n);
 expect(got.employerVnd).toBe((expected*BigInt(fund.employerRateBasisPoints)+5000n)/10000n);
 }
});
test('each PIT boundary uses independent piecewise expectation',()=>{
 const p=inputFromFixture(rawPartTime()).pit;
 const bands=[10000000n,30000000n,60000000n,100000000n];
 const independent=(x:bigint)=>x<=10000000n?x*5n:x<=30000000n?50000000n+(x-10000000n)*10n:x<=60000000n?250000000n+(x-30000000n)*20n:x<=100000000n?850000000n+(x-60000000n)*30n:2050000000n+(x-100000000n)*35n;
 for(const b of bands)for(const d of [-1n,0n,1n])expect(calculatePit(b+d+p.personalDeductionVnd,0n,p).amountVnd).toBe((independent(b+d)+50n)/100n);
});
test('June earnings/July PIT remain distinct; compensation gaps/conflicts fail closed',()=>{
 const raw=rawPartTime();raw.ruleBinding.componentDates.ordinaryPay='2026-06-30';raw.ruleBinding.componentDates.pit='2026-07-01';
 const r=calculatePayroll(inputFromFixture(raw));expect(r.lines.find(l=>l.code==='ordinary.hourly_pay')?.componentDate).toBe('2026-06-30');expect(r.lines.find(l=>l.code==='pit.withholding')?.componentDate).toBe('2026-07-01');
 raw.compensation.effectiveFrom='2026-07-01';expect(()=>calculatePayroll(inputFromFixture(raw))).toThrow();
 const conflict=rawPartTime();conflict.employment.monthlySalaryVnd='8000000';expect(()=>calculatePayroll(inputFromFixture(conflict))).toThrow();
});
