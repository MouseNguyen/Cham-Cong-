
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {test,expect} from 'vitest';
import {calculatePayroll,inputFromFixture} from '../src/calculate';
import {canonicalize} from '../src/trace';
export function rawPartTime(){
 const r=JSON.parse(readFileSync(new URL('../../../tests/fixtures/payroll/part-time-80h.json',import.meta.url),'utf8')).input;
 r.calculator.sourceArtifactSha256=createHash('sha256').update(['types.ts','calculate.ts','insurance.ts','pit.ts','holiday.ts','trace.ts'].map(p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8')).join('')).digest('hex');
 return r;
}
test('80 hours at26000 has independent gross/net2080000 and sealed draft review',()=>{
 const raw=rawPartTime(),input=inputFromFixture(raw),r=calculatePayroll(input);
 expect(r).toMatchObject({gross:'2080000',net:'2080000',pit:'0',employeeInsuranceTotal:'0',employerInsuranceTotal:'0',finalizable:false});
 const line=r.lines.find(l=>l.code==='ordinary.hourly_pay')!;
 expect(line.preRounding).toEqual({numerator:'7488000000000',denominator:'3600000'});
 expect(r.lines.some(l=>l.code==='PIT_RESOLUTION_43_REDUCTION')).toBe(false);

});
test.each([['59000','426'],['60000','433'],['61000','441'],['180000','1300'],['900','7']])('exact hourly duration %s rounds once to%s',(ms,expected)=>{
 const raw=rawPartTime();raw.attendance.payableMilliseconds=ms;
 expect(calculatePayroll(inputFromFixture(raw)).gross).toBe(expected);
});
test('explicit hourly holiday entitlement and premium remain separate',()=>{
 const raw=rawPartTime();raw.attendance.payableMilliseconds='7200000';raw.policy.holidayEntitlementTreatment='explicit_paid';
 raw.holiday={entitlementTreatment:'explicit_paid',paidEntitlementVnd:'52000',ordinaryHourlyDivisorHours:'1',daytimePremiumBasisPoints:30000,payableMilliseconds:'7200000'};
 const r=calculatePayroll(inputFromFixture(raw));
 expect(r.gross).toBe('208000');expect(r.lines.find(l=>l.code==='holiday.daytime_premium')?.amountVnd).toBe(156000n);
});

test('holiday duration cannot exceed approved total',()=>{
 const raw=rawPartTime();raw.attendance.payableMilliseconds='1';raw.policy.holidayEntitlementTreatment='explicit_paid';
 raw.holiday={entitlementTreatment:'explicit_paid',paidEntitlementVnd:'0',ordinaryHourlyDivisorHours:'1',daytimePremiumBasisPoints:30000,payableMilliseconds:'2'};
 expect(()=>calculatePayroll(inputFromFixture(raw))).toThrow('HOLIDAY_DURATION_EXCEEDS_APPROVED');
});

test('export all hourly golden cases with independent expected values for unsigned review',()=>{
 const rows:Record<string,unknown>[]=[];
 const append=(id:string,raw:ReturnType<typeof rawPartTime>,expected:Record<string,string>)=>{
  const input=inputFromFixture(raw),result=calculatePayroll(input);expect(result).toMatchObject(expected);
  rows.push({id,status:'draft_review',independentExpected:expected,canonicalInput:canonicalize(input),canonicalResult:result.canonicalResult,resultHash:result.resultSha256});
 };
 append('PT-80H',rawPartTime(),{gross:'2080000',net:'2080000'});
 for(const [ms,expected] of [['59000','426'],['60000','433'],['61000','441'],['180000','1300'],['900','7']]){
  const raw=rawPartTime();raw.attendance.payableMilliseconds=ms;append('PT-MS-'+ms,raw,{gross:expected!});
 }
 for(const rate of ['25500','25501']){const raw=rawPartTime();raw.compensation.hourlyRateVnd=rate;raw.attendance.payableMilliseconds='3600000';append('PT-MIN-'+rate,raw,{gross:rate});}
 const boundary=JSON.parse(readFileSync(new URL('../../../tests/fixtures/payroll/part-time-insurance-boundaries.json',import.meta.url),'utf8'));
 for(const entry of boundary.cases){
  const raw=rawPartTime();for(const f of raw.insuranceFunds){f.monthlyEligibility.assessedIncomeVnd=entry.income;f.eligible=entry.eligible;}
  append('PT-ELIGIBILITY-'+entry.income,raw,{gross:'2080000',employeeInsuranceTotal:entry.eligible?'265650':'0',employerInsuranceTotal:entry.eligible?'543950':'0',net:entry.eligible?'1814350':'2080000'});
 }
 const h=rawPartTime();h.attendance.payableMilliseconds='7200000';h.policy.holidayEntitlementTreatment='explicit_paid';h.holiday={entitlementTreatment:'explicit_paid',paidEntitlementVnd:'52000',ordinaryHourlyDivisorHours:'1',daytimePremiumBasisPoints:30000,payableMilliseconds:'7200000'};
 append('PT-HOLIDAY',h,{gross:'208000',net:'208000'});
 mkdirSync('tests/fixtures/payroll/review-pack',{recursive:true});
 writeFileSync('tests/fixtures/payroll/review-pack/PAY-W1-04.json',JSON.stringify({status:'draft_review',evidence:'synthetic_assumption',signatures:[],rows},null,2)+'\n');
});
