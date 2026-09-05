import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { calculatePayroll, inputFromFixture } from '../src/calculate';

function load(name = 'full-time-basic.json') {
  const row = JSON.parse(readFileSync(new URL('../../../tests/fixtures/payroll/' + name, import.meta.url), 'utf8'));
  const sources = ['types.ts','calculate.ts','insurance.ts','pit.ts','holiday.ts','trace.ts'];
  row.input.calculator.sourceArtifactSha256 = createHash('sha256')
    .update(JSON.stringify(sources.map(file => [file, readFileSync(new URL('../src/' + file, import.meta.url), 'utf8')]))).digest('hex');
  return row.input;
}
function amount(result: ReturnType<typeof calculatePayroll>, code: string) {
  return result.lines.find(line => line.code === code)!.amountVnd;
}
describe('full-time synthetic calculation', () => {
  test('matches independent five-fund and progressive PIT values', () => {
    const result = calculatePayroll(inputFromFixture(load()));
    expect(result.totals).toMatchObject({ grossVnd:45_000_000n,employeeInsuranceVnd:4_725_000n,employerInsuranceVnd:9_675_000n,pitVnd:1_977_500n,netVnd:38_297_500n,employerCostVnd:54_675_000n });
    expect(amount(result,'insurance.employee.SI_RETIREMENT_SURVIVORSHIP')).toBe(3_600_000n);
    expect(amount(result,'insurance.employee.HEALTH_INSURANCE')).toBe(675_000n);
    expect(amount(result,'insurance.employee.UNEMPLOYMENT_INSURANCE')).toBe(450_000n);
    expect(amount(result,'insurance.employer.OCCUPATIONAL_ACCIDENT_DISEASE')).toBe(225_000n);
    expect(result.finalizable).toBe(false);
  });
  test.each([
    ['8000000','50600000','840000','1720000','0','7160000'],
    ['40000000','50600000','4200000','8600000','1530000','34270000'],
    ['60000000','46800000','5046000','10194000','4390800','50563200'],
    ['60000000','50600000','5407000','10973000','4318600','50274400'],
  ])('matches independent salary/cap vector %s / %s', (salary,cap,employee,employer,pit,net) => {
    const raw=load();raw.employment.monthlySalaryVnd=salary;
    for(const fund of raw.insuranceFunds){fund.baseVnd=salary;if(fund.id!=='UNEMPLOYMENT_INSURANCE')fund.maximumVnd=cap;}
    const result=calculatePayroll(inputFromFixture(raw));
    expect(result.totals).toMatchObject({employeeInsuranceVnd:BigInt(employee),employerInsuranceVnd:BigInt(employer),pitVnd:BigInt(pit),netVnd:BigInt(net)});
  });
  test('monthly holiday entitlement is already included; only premium adds earnings', () => {
    const raw=load('full-time-holiday-synthetic.json');
    const result=calculatePayroll(inputFromFixture(raw));
    expect(amount(result,'holiday.entitlement')).toBe(0n);
    expect(amount(result,'holiday.daytime_premium')).toBe(600_000n);
    expect(result.totals.netVnd).toBe(7_760_000n);
    raw.holiday.paidEntitlementVnd='100000';
    expect(()=>calculatePayroll(inputFromFixture(raw))).toThrow('HOLIDAY_ENTITLEMENT_DOUBLE_COUNT');
  });
  test.each([['59000',4917n],['60000',5000n],['61000',5083n]])('retains exact sub-minute holiday duration %s', (ms,expected) => {
    const raw=load('full-time-holiday-synthetic.json');raw.holiday.payableMilliseconds=ms;
    expect(amount(calculatePayroll(inputFromFixture(raw)),'holiday.daytime_premium')).toBe(expected);
  });
  test('rounds PIT once for the component, not once per bracket', () => {
    const raw=load();raw.employment.monthlySalaryVnd='5';
    raw.insuranceFunds.forEach((f: {eligible:boolean})=>{f.eligible=false;});
    raw.pit.personalDeductionVnd='0';raw.pit.brackets=[{upToVnd:'1',rateBasisPoints:500},{upToVnd:'4',rateBasisPoints:1000},{upToVnd:null,rateBasisPoints:2000}];
    expect(calculatePayroll(inputFromFixture(raw)).totals.pitVnd).toBe(1n);
  });
  test('binds input, rule policy, calculator source and output versions deterministically', () => {
    const raw=load();const result=calculatePayroll(inputFromFixture(raw));
    expect(result.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.rulePackHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.resultSchemaVersion).toBe('1');
    expect(result.calculator.sourceArtifactSha256).not.toBe('a'.repeat(64));
    for(let i=0;i<100;i++)expect(calculatePayroll(inputFromFixture(raw)).canonicalResult).toBe(result.canonicalResult);
    expect(calculatePayroll(inputFromFixture(reverse(raw))).resultSha256).toBe(result.resultSha256);
    raw.ruleBinding.componentDates.pit='2026-08-30';
    const changed=calculatePayroll(inputFromFixture(raw));expect(changed.inputHash).not.toBe(result.inputHash);expect(changed.rulePackHash).toBe(result.rulePackHash);
    expect(result.trace.some(t=>t.code==='insurance.employee.HEALTH_INSURANCE' && t.operands.baseVnd==='45000000')).toBe(true);
  });
  test('policy hash excludes employee bases, eligibility, dependents and worked duration', () => {
    const raw=load('full-time-holiday-synthetic.json');const first=calculatePayroll(inputFromFixture(raw));
    raw.employment.monthlySalaryVnd='10000000';raw.insuranceFunds[0].baseVnd='10000000';raw.insuranceFunds[0].eligible=false;raw.pit.dependentCount=1;raw.holiday.payableMilliseconds='60000';raw.holiday.ordinaryHourlyDivisorHours='100';
    const other=calculatePayroll(inputFromFixture(raw));expect(other.rulePackHash).toBe(first.rulePackHash);expect(other.inputHash).not.toBe(first.inputHash);
    const rate=load('full-time-holiday-synthetic.json');rate.insuranceFunds[0].employerRateBasisPoints=301;expect(calculatePayroll(inputFromFixture(rate)).rulePackHash).not.toBe(first.rulePackHash);
  });
  test('strict JSON input rejects unknown root and nested fields and omitted component declaration', () => {
    const raw=load();raw.allowances=[{amount:'100000'}];expect(()=>inputFromFixture(raw)).toThrow('COMPONENT_UNSUPPORTED');
    const nested=load();nested.employment.bonus='100000';expect(()=>inputFromFixture(nested)).toThrow('COMPONENT_UNSUPPORTED');
    const missing=load();delete missing.unsupportedComponents;expect(()=>inputFromFixture(missing)).toThrow('COMPONENT_UNSUPPORTED');
  });
  test('every financial line exposes exact formula, rounding and effective-date evidence', () => {
    const result=calculatePayroll(inputFromFixture(load('full-time-holiday-synthetic.json')));
    expect(result.gross).toBe('8600000');expect(result.employerCost).toBe('10320000');expect(result.calculatorArtifactHash).toMatch(/^[a-f0-9]{64}$/);
    for(const l of result.lines){expect(l.formula.length).toBeGreaterThan(0);expect(l.preRounding.numerator).toMatch(/^-?[0-9]+$/);expect(l.preRounding.denominator).toMatch(/^[1-9][0-9]*$/);expect(l.roundedAmountVnd).toBe(l.amountVnd);expect(l.componentDate).toBe('2026-08-31');}
    expect(result.fundContributions).toHaveLength(5);
    expect(result.trace.find(t=>t.code==='pit.taxable_income')?.operands.personalDeductionVnd).toBe('15500000');
  });
  test('does not retain mutable caller bindings in its returned result', () => {
    const input=inputFromFixture(load());const result=calculatePayroll(input);Reflect.set(input.calculator,'version','changed');
    expect(result.calculator.version).toBe('0.1.0');
  });
  test('rejects unsupported JSON components instead of dropping them', () => {
    const raw=load();raw.unsupportedComponents=['UNAPPROVED_ALLOWANCE'];
    expect(()=>calculatePayroll(inputFromFixture(raw))).toThrow('COMPONENT_UNSUPPORTED');
  });
  test('rejects unresolved base policy, inconsistent dates and duplicate funds', () => {
    const raw=load();raw.policy.insuranceBasePolicy='unknown';
    expect(()=>calculatePayroll(inputFromFixture(raw))).toThrow('COMPONENT_BASE_POLICY_UNSUPPORTED');
    const dates=load();dates.insuranceFunds[0].componentDate='2026-08-30';
    expect(()=>calculatePayroll(inputFromFixture(dates))).toThrow('COMPONENT_DATE_POLICY_UNSUPPORTED');
    const dup=load();dup.insuranceFunds.push(dup.insuranceFunds[0]);
    expect(()=>calculatePayroll(inputFromFixture(dup))).toThrow('INSURANCE_FUND_DUPLICATE');
  });
  test('rejects invalid PIT policy even for a zero-tax salary', () => {
    const raw=load();raw.employment.monthlySalaryVnd='8000000';raw.pit.brackets=[];
    expect(()=>calculatePayroll(inputFromFixture(raw))).toThrow('PIT_BRACKET_INVALID');
  });
  test('fails closed for production, unsupported employment/proration/night and mode', () => {
    const raw=load();raw.mode='production';expect(()=>calculatePayroll(inputFromFixture(raw))).toThrow('PRODUCTION_DRAFT_RULES_FORBIDDEN');
    for(const [field,value,error] of [['kind','part_time','EMPLOYMENT_KIND_UNSUPPORTED'],['proration','unpaid_leave','PRORATION_UNSUPPORTED']]){
      const r=load();r.employment[field!]=value;expect(()=>calculatePayroll(inputFromFixture(r))).toThrow(error);
    }
    const night=load();night.attendance.nightWorkMilliseconds='1';expect(()=>calculatePayroll(inputFromFixture(night))).toThrow('NIGHT_WORK_UNSUPPORTED');
    const mode=load();mode.mode='unknown';expect(()=>calculatePayroll(inputFromFixture(mode))).toThrow('PAYROLL_MODE_UNSUPPORTED');
  });
});
function reverse(value: unknown): unknown {
  if(Array.isArray(value))return value.map(reverse);
  if(value!==null && typeof value==='object')return Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reverse(v)]));
  return value;
}
