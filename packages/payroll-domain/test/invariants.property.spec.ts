
import {test,expect,vi} from 'vitest';
import fc from 'fast-check';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
function rawPartTime(){
 const r=JSON.parse(readFileSync(new URL('../../../tests/fixtures/payroll/part-time-80h.json',import.meta.url),'utf8')).input;
 r.calculator.sourceArtifactSha256=createHash('sha256').update(['types.ts','calculate.ts','insurance.ts','pit.ts','holiday.ts','trace.ts'].map(p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8')).join('')).digest('hex');
 return r;
}

import {calculatePayroll,inputFromFixture} from '../src/calculate';
test('hourly monotonicity, partition invariance and net reconciliation',()=>{
 fc.assert(fc.property(fc.integer({min:0,max:1000000000}),fc.integer({min:0,max:1000000000}),(a,b)=>{
 const raw=rawPartTime();raw.attendance.payableMilliseconds=String(a);
 const first=calculatePayroll(inputFromFixture(raw));raw.attendance.payableMilliseconds=String(BigInt(a)+BigInt(b));
 const r=calculatePayroll(inputFromFixture(raw));expect(BigInt(r.gross)).toBeGreaterThanOrEqual(BigInt(first.gross));
 expect(BigInt(r.gross)).toBe((26000n*(BigInt(a)+BigInt(b))+1800000n)/3600000n);
 expect(BigInt(r.net)).toBe(BigInt(r.gross)-BigInt(r.employeeInsuranceTotal)-BigInt(r.pit));expect(BigInt(r.net)).toBeLessThanOrEqual(BigInt(r.gross));
 for(const f of raw.insuranceFunds){f.eligible=true;f.monthlyEligibility.assessedIncomeVnd='2530000';}
 const insured=calculatePayroll(inputFromFixture(raw));const net=insured.net;raw.insuranceFunds.forEach((f: {employerRateBasisPoints:number})=>{f.employerRateBasisPoints=9999;});expect(calculatePayroll(inputFromFixture(raw)).net).toBe(net);
 }),{seed:104,numRuns:100});
});
test('system time and timezone do not influence replay',()=>{
 const raw=rawPartTime(),baseline=calculatePayroll(inputFromFixture(raw)).canonicalResult,old=process.env.TZ;
 try{vi.useFakeTimers();for(const tz of ['UTC','America/New_York','Asia/Ho_Chi_Minh']){process.env.TZ=tz;vi.setSystemTime(new Date('2040-01-01T00:00:00Z'));expect(calculatePayroll(inputFromFixture(raw)).canonicalResult).toBe(baseline);}}
 finally{vi.useRealTimers();if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
});
