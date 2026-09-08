import type { Vnd } from './money';
import { calculateHoliday } from './holiday';
import { calculateInsurance } from './insurance';
import { calculatePit } from './pit';
import { canonicalize, sha256 } from './trace';
import type { CalculationLine, PayrollInput, PayrollResult } from './types';

const HASH = /^[a-f0-9]{64}$/;
type BaseLine=Pick<CalculationLine,'code'|'labelVi'|'amountVnd'|'roundingRule'|'ruleBinding'|'reason'>;

export function calculatePayroll(input: PayrollInput): PayrollResult {
  validateInput(input);
  const insurance = calculateInsurance(input.insuranceFunds);
  const employeeInsuranceVnd = sum(insurance.map(fund => fund.employeeVnd));
  const employerInsuranceVnd = sum(insurance.map(fund => fund.employerVnd));
  const hourly=input.compensation?.basis==='hourly_rate'?input.compensation:null;
  const ordinaryMilliseconds=input.attendance.payableMilliseconds-(hourly?(input.holiday?.payableMilliseconds??0n):0n);
  const ordinary=hourly?(hourly.hourlyRateVnd*ordinaryMilliseconds+1800000n)/3600000n:input.employment.monthlySalaryVnd;
  const holiday = calculateHoliday(hourly?hourly.hourlyRateVnd:input.employment.monthlySalaryVnd, input.holiday, hourly!==null);
  const grossVnd = ordinary + holiday.entitlementVnd + holiday.premiumVnd;
  const pit = calculatePit(grossVnd, employeeInsuranceVnd, input.pit);
  const lines: BaseLine[] = [line(hourly?'ordinary.hourly_pay':'ordinary.monthly_salary', hourly?'Lương giờ':'Lương tháng', ordinary, input, hourly?'EXACT_APPROVED_DURATION':'FULL_TIME_MONTHLY_SALARY')];
  if (input.holiday !== null) {
    lines.push(line('holiday.entitlement', 'Quyền hưởng lương ngày lễ', holiday.entitlementVnd, input, 'EXPLICIT_HOLIDAY_ENTITLEMENT'));
    lines.push(line('holiday.daytime_premium', 'Phụ cấp làm ngày lễ ban ngày', holiday.premiumVnd, input, 'EXPLICIT_DIVISOR_AND_300_PERCENT_PREMIUM'));
  }
  for (const fund of insurance) {
    lines.push(line(`insurance.employee.${fund.id}`, `Người lao động đóng ${fund.id}`, fund.employeeVnd, input, 'EXPLICIT_FUND_BASE_AND_RATE'));
    lines.push(line(`insurance.employer.${fund.id}`, `Người sử dụng lao động đóng ${fund.id}`, fund.employerVnd, input, 'EXCLUDED_FROM_EMPLOYEE_NET'));
  }
  lines.push(line('pit.withholding', 'Khấu trừ thuế TNCN', pit.amountVnd, input, 'PROGRESSIVE_BRACKETS'));
  const netVnd = grossVnd - employeeInsuranceVnd - pit.amountVnd;
  const inputHash=sha256(canonicalize(input));
  const rulePackHash=sha256(canonicalize(syntheticPolicyContent(input)));
  const formulaTrace=lines.filter(l=>l.code.startsWith('ordinary.')||l.code.startsWith('insurance.')).map(l=>{
    const fund=insurance.find(f=>l.code.endsWith('.'+f.id));
    const policy=input.insuranceFunds.find(f=>f.id===fund?.id);
    return {code:l.code,amountVnd:l.amountVnd,operands:fund&&policy?{...(policy.monthlyEligibility?{eligibilityMonth:policy.monthlyEligibility.month,assessedIncomeVnd:policy.monthlyEligibility.assessedIncomeVnd.toString(),eligibilityThresholdVnd:policy.monthlyEligibility.thresholdVnd.toString(),eligibilityPolicyVersion:policy.monthlyEligibility.policyVersion}:{}),baseVnd:fund.appliedBaseVnd.toString(),requestedBaseVnd:policy.baseVnd.toString(),minimumVnd:policy.minimumVnd.toString(),maximumVnd:policy.maximumVnd.toString(),eligible:policy.eligible,rateBasisPoints:l.code.startsWith('insurance.employee.')?policy.employeeRateBasisPoints:policy.employerRateBasisPoints,denominator:'10000',exactNumerator:(fund.appliedBaseVnd*BigInt(l.code.startsWith('insurance.employee.')?policy.employeeRateBasisPoints:policy.employerRateBasisPoints)).toString(),componentDate:policy.componentDate}:hourly?{hourlyRateVnd:hourly.hourlyRateVnd.toString(),payableMilliseconds:ordinaryMilliseconds.toString(),exactNumerator:(hourly.hourlyRateVnd*ordinaryMilliseconds).toString(),denominator:'3600000',formula:'hourly_rate'}:{monthlySalaryVnd:input.employment.monthlySalaryVnd.toString(),formula:'monthly_salary'}};
  });
  const trace=[...formulaTrace,...holiday.trace,...pit.trace];
  const auditedLines: CalculationLine[]=lines.map(l=>{
    const operands:Record<string,string|number|boolean>={...(trace.find(t=>t.code===l.code)?.operands??{})};
    let numerator=String(operands.exactNumerator??l.amountVnd),denominator=String(operands.denominator??'1');
    let formula=hourly?'hourlyRateVnd * payableMilliseconds / 3600000':'monthlySalaryVnd';
    if(l.code.startsWith('insurance.'))formula='appliedBaseVnd * rateBasisPoints / 10000';
    if(l.code==='holiday.entitlement')formula=hourly?'explicit paid holiday entitlement':'0 (included in monthly salary)';
    if(l.code==='holiday.daytime_premium')formula=hourly?'hourlyRateVnd * payableMilliseconds * daytimePremiumBasisPoints / (3600000 * 10000)':'monthlySalaryVnd * payableMilliseconds * daytimePremiumBasisPoints / (ordinaryHourlyDivisorHours * 3600000 * 10000)';
    if(l.code==='pit.withholding'){
      numerator=pit.trace.filter(t=>t.code.startsWith('pit.bracket.')).reduce((n,t)=>n+BigInt(t.operands.exactNumerator!),0n).toString();denominator='10000';formula='sum(taxable bracket segment * bracket basis points) / 10000';operands.taxableIncomeVnd=pit.taxableIncomeVnd.toString();
    }
    const componentDate=l.code.startsWith('insurance.')?input.ruleBinding.componentDates.insurance:l.code.startsWith('pit.')?input.ruleBinding.componentDates.pit:input.ruleBinding.componentDates.ordinaryPay;
    return {...l,formula,operands,preRounding:{numerator,denominator},roundedAmountVnd:l.amountVnd,componentDate,ruleId:l.code,ruleVersion:input.ruleBinding.version,evidenceStatus:'synthetic_assumption'};
  });
  const resultCore = {
    gross:grossVnd.toString(),pit:pit.amountVnd.toString(),net:netVnd.toString(),employerCost:(grossVnd+employerInsuranceVnd).toString(),
    employeeInsuranceTotal:employeeInsuranceVnd.toString(),employerInsuranceTotal:employerInsuranceVnd.toString(),
    calculatorVersion:input.calculator.version,calculatorArtifactHash:input.calculator.sourceArtifactSha256,canonicalizationVersion:input.calculator.canonicalizationVersion,
    rulePackKind:'synthetic_materialized_policy' as const, fundContributions:insurance,
    inputHash, rulePackId:input.ruleBinding.id, rulePackHash, resultSchemaVersion:'1',
    status: 'synthetic_preview' as const,
    finalizable: false as const,
    blockers: ['SYNTHETIC_DRAFT_RULES_NONFINALIZABLE'],
    lines:auditedLines,
    trace,
    totals: { grossVnd, employeeInsuranceVnd, employerInsuranceVnd, pitVnd: pit.amountVnd, netVnd, employerCostVnd: grossVnd+employerInsuranceVnd },
    calculator: { ...input.calculator },
  };
  const canonicalResult = canonicalize(resultCore);
  return { ...resultCore, canonicalResult, resultSha256: sha256(canonicalResult) };
}

export function inputFromFixture(raw: unknown): PayrollInput {
  const root = record(raw, 'FIXTURE_INVALID');
  const input = record(root, 'FIXTURE_INVALID');
  const employment = record(input.employment, 'FIXTURE_EMPLOYMENT_INVALID');
  const ruleBinding = record(input.ruleBinding, 'FIXTURE_RULE_BINDING_INVALID');
  const dates = record(ruleBinding.componentDates, 'FIXTURE_COMPONENT_DATES_INVALID');
  const attendance = record(input.attendance, 'FIXTURE_ATTENDANCE_INVALID');
  const calculator = record(input.calculator, 'FIXTURE_CALCULATOR_INVALID');
  const pit = record(input.pit, 'FIXTURE_PIT_INVALID');
  const policy=record(input.policy,'COMPONENT_BASE_POLICY_UNSUPPORTED');
  return {
    ...(input.compensation===undefined?{}:{compensation:compensationFromFixture(input.compensation)}),
    mode: text(input.mode, 'FIXTURE_MODE_INVALID') as PayrollInput['mode'],
    policy:{insuranceBasePolicy:text(policy.insuranceBasePolicy,'COMPONENT_BASE_POLICY_UNSUPPORTED'),pitBasePolicy:text(policy.pitBasePolicy,'COMPONENT_BASE_POLICY_UNSUPPORTED'),evidence:text(policy.evidence,'COMPONENT_BASE_POLICY_UNSUPPORTED'),holidayPremiumBasisPoints:integer(policy.holidayPremiumBasisPoints,'COMPONENT_BASE_POLICY_UNSUPPORTED'),holidayEntitlementTreatment:text(policy.holidayEntitlementTreatment,'COMPONENT_BASE_POLICY_UNSUPPORTED')},
    calculator: { id: text(calculator.id, 'FIXTURE_CALCULATOR_INVALID'), version: text(calculator.version, 'FIXTURE_CALCULATOR_INVALID'), canonicalizationVersion: text(calculator.canonicalizationVersion, 'FIXTURE_CALCULATOR_INVALID'), sourceArtifactSha256: text(calculator.sourceArtifactSha256, 'FIXTURE_CALCULATOR_INVALID') },
    employment: { kind: text(employment.kind, 'FIXTURE_EMPLOYMENT_INVALID') as PayrollInput['employment']['kind'], monthlySalaryVnd: vnd(employment.monthlySalaryVnd), proration: text(employment.proration, 'FIXTURE_EMPLOYMENT_INVALID') as PayrollInput['employment']['proration'] },
    ruleBinding: { id: text(ruleBinding.id, 'FIXTURE_RULE_BINDING_INVALID'), version: text(ruleBinding.version, 'FIXTURE_RULE_BINDING_INVALID'), status: text(ruleBinding.status, 'FIXTURE_RULE_BINDING_INVALID') as PayrollInput['ruleBinding']['status'], componentDates: { ordinaryPay: text(dates.ordinaryPay, 'FIXTURE_COMPONENT_DATES_INVALID'), insurance: text(dates.insurance, 'FIXTURE_COMPONENT_DATES_INVALID'), pit: text(dates.pit, 'FIXTURE_COMPONENT_DATES_INVALID') } },
    attendance: { rawMilliseconds: vnd(attendance.rawMilliseconds), payableMilliseconds: vnd(attendance.payableMilliseconds), nightWorkMilliseconds: vnd(attendance.nightWorkMilliseconds) },
    insuranceFunds: array(input.insuranceFunds, 'FIXTURE_INSURANCE_INVALID').map((entry) => { const fund = record(entry, 'FIXTURE_INSURANCE_INVALID'); return { ...(fund.monthlyEligibility===undefined?{}:{monthlyEligibility:eligibilityFromFixture(fund.monthlyEligibility)}), id: text(fund.id, 'FIXTURE_INSURANCE_INVALID'), eligible: bool(fund.eligible, 'FIXTURE_INSURANCE_INVALID'), baseVnd: vnd(fund.baseVnd), minimumVnd: vnd(fund.minimumVnd), maximumVnd: vnd(fund.maximumVnd), employeeRateBasisPoints: integer(fund.employeeRateBasisPoints, 'FIXTURE_INSURANCE_INVALID'), employerRateBasisPoints: integer(fund.employerRateBasisPoints, 'FIXTURE_INSURANCE_INVALID'), componentDate: text(fund.componentDate, 'FIXTURE_INSURANCE_INVALID') }; }),
    pit: { personalDeductionVnd: vnd(pit.personalDeductionVnd), dependentCount: integer(pit.dependentCount, 'FIXTURE_PIT_INVALID'), dependentDeductionVnd: vnd(pit.dependentDeductionVnd), brackets: array(pit.brackets, 'FIXTURE_PIT_INVALID').map((entry) => { const bracket = record(entry, 'FIXTURE_PIT_BRACKET_INVALID'); return { upToVnd: bracket.upToVnd === null ? null : vnd(bracket.upToVnd), rateBasisPoints: integer(bracket.rateBasisPoints, 'FIXTURE_PIT_INVALID') }; }) },
    holiday: input.holiday === null ? null : holidayFromFixture(input.holiday),
    unsupportedComponents: array(input.unsupportedComponents,'COMPONENT_UNSUPPORTED').map(v=>text(v,'COMPONENT_UNSUPPORTED')),
  };
}

function holidayFromFixture(value: unknown): NonNullable<PayrollInput['holiday']> { const holiday = record(value, 'FIXTURE_HOLIDAY_INVALID'); return { entitlementTreatment:text(holiday.entitlementTreatment,'HOLIDAY_ENTITLEMENT_POLICY_UNSUPPORTED'), paidEntitlementVnd: vnd(holiday.paidEntitlementVnd), ordinaryHourlyDivisorHours: vnd(holiday.ordinaryHourlyDivisorHours), daytimePremiumBasisPoints: integer(holiday.daytimePremiumBasisPoints, 'FIXTURE_HOLIDAY_INVALID'), payableMilliseconds: vnd(holiday.payableMilliseconds) }; }
function line(code: string, labelVi: string, amountVnd: Vnd, input: PayrollInput, reason: string): BaseLine { return { code, labelVi, amountVnd, roundingRule: 'HALF_UP_VND', ruleBinding: `${input.ruleBinding.id}@${input.ruleBinding.version}`, reason }; }
function sum(values: readonly Vnd[]): Vnd { return values.reduce((total, value) => total + value, 0n); }
function validateInput(input: PayrollInput): void {
  if (!HASH.test(input.calculator.sourceArtifactSha256)) throw new Error('CALCULATOR_ARTIFACT_HASH_INVALID');
  if (input.mode === 'production' && input.ruleBinding.status === 'draft') throw new Error('PRODUCTION_DRAFT_RULES_FORBIDDEN');
  if (input.mode === 'production') throw new Error('PRODUCTION_CALCULATION_UNSUPPORTED');
  if (input.mode !== 'synthetic_preview') throw new Error('PAYROLL_MODE_UNSUPPORTED');
  if(input.policy.insuranceBasePolicy!=='explicit_per_fund'||input.policy.pitBasePolicy!=='all_earnings_less_employee_funds'||input.policy.evidence!=='synthetic_assumption')throw new Error('COMPONENT_BASE_POLICY_UNSUPPORTED');
  if(!(input.policy.holidayEntitlementTreatment==='included_in_monthly'||(input.compensation?.basis==='hourly_rate'&&input.policy.holidayEntitlementTreatment==='explicit_paid'))||!Number.isSafeInteger(input.policy.holidayPremiumBasisPoints)||input.policy.holidayPremiumBasisPoints<30000||input.policy.holidayPremiumBasisPoints>100000)throw new Error('HOLIDAY_POLICY_INVALID');
  if(input.holiday && (input.holiday.daytimePremiumBasisPoints!==input.policy.holidayPremiumBasisPoints||input.holiday.entitlementTreatment!==input.policy.holidayEntitlementTreatment))throw new Error('HOLIDAY_POLICY_BINDING_MISMATCH');
  if(input.employment.monthlySalaryVnd<0n)throw new Error('SALARY_INVALID');
  if(input.calculator.canonicalizationVersion!=='1')throw new Error('CANONICALIZATION_VERSION_UNSUPPORTED');
  const c=input.compensation;
  if(input.employment.kind==='part_time'){
    if(c?.basis!=='hourly_rate')throw new Error('EMPLOYMENT_KIND_UNSUPPORTED');
    if(input.employment.monthlySalaryVnd!==0n)throw new Error('COMPENSATION_BINDING_MISMATCH');
    if(c.minimumHourlyRateVnd<=0n||!c.policyVersion.trim()||!validDate(c.effectiveFrom)||!validDate(c.effectiveTo)||c.effectiveFrom>c.effectiveTo||input.ruleBinding.componentDates.ordinaryPay<c.effectiveFrom||input.ruleBinding.componentDates.ordinaryPay>c.effectiveTo)throw new Error('COMPENSATION_POLICY_INVALID');
    if(input.holiday&&input.holiday.payableMilliseconds>input.attendance.payableMilliseconds)throw new Error('HOLIDAY_DURATION_EXCEEDS_APPROVED');
    if(c.hourlyRateVnd<c.minimumHourlyRateVnd)throw new Error('BELOW_REGIONAL_MINIMUM');
    for(const f of input.insuranceFunds){
      const e=f.monthlyEligibility;
      if(!e||e.month!==f.componentDate.slice(0,7)||!e.policyVersion.trim()||e.assessedIncomeVnd<0n||e.thresholdVnd<=0n||f.eligible!==(e.assessedIncomeVnd>=e.thresholdVnd))throw new Error('MONTHLY_ELIGIBILITY_INVALID');
    }
  }else if(input.employment.kind!=='full_time')throw new Error('EMPLOYMENT_KIND_UNSUPPORTED');
  else if(c&&(c.basis!=='monthly_salary'||c.monthlySalaryVnd!==input.employment.monthlySalaryVnd))throw new Error('COMPENSATION_BINDING_MISMATCH');
  if (input.employment.proration !== 'none') throw new Error('PRORATION_UNSUPPORTED');
  if (input.attendance.nightWorkMilliseconds !== 0n) throw new Error('NIGHT_WORK_UNSUPPORTED');
  if (input.attendance.rawMilliseconds < 0n || input.attendance.payableMilliseconds < 0n) throw new Error('ATTENDANCE_DURATION_INVALID');
  if (input.unsupportedComponents.length > 0) throw new Error('COMPONENT_UNSUPPORTED');
  if (Object.values(input.ruleBinding.componentDates).some(date => !validDate(date)) || input.insuranceFunds.some(fund => fund.componentDate !== input.ruleBinding.componentDates.insurance)) throw new Error('COMPONENT_DATE_POLICY_UNSUPPORTED');
}
function record(value: unknown, error: string): Record<string, unknown> { if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(error); const data=value as Record<string,unknown>; const allowed=JSON_KEYS[error]; if(allowed&&Object.keys(data).some(key=>!allowed.includes(key)))throw new Error('COMPONENT_UNSUPPORTED'); return data; }
function array(value: unknown, error: string): unknown[] { if (!Array.isArray(value)) throw new Error(error); return value; }
function text(value: unknown, error: string): string { if (typeof value !== 'string' || value.trim() === '') throw new Error(error); return value; }
function bool(value: unknown, error: string): boolean { if (typeof value !== 'boolean') throw new Error(error); return value; }
function integer(value: unknown, error: string): number { if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error(error); return value; }
function vnd(value: unknown): Vnd { const amount = text(value, 'FIXTURE_VND_INVALID'); if (!/^\d+$/.test(amount)) throw new Error('FIXTURE_VND_INVALID'); return BigInt(amount); }

function validDate(date:string):boolean { if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;const n=Date.parse(date+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===date; }

function syntheticPolicyContent(input:PayrollInput):unknown {
  return {kind:'synthetic_materialized_policy',id:input.ruleBinding.id,version:input.ruleBinding.version,policy:input.policy,
    ...(input.compensation?.basis==='hourly_rate'?{hourlyPolicy:{minimumHourlyRateVnd:input.compensation.minimumHourlyRateVnd,policyVersion:input.compensation.policyVersion,effectiveFrom:input.compensation.effectiveFrom,effectiveTo:input.compensation.effectiveTo}}:{}),
    funds:input.insuranceFunds.map(f=>({... (f.monthlyEligibility?{monthlyPolicy:{thresholdVnd:f.monthlyEligibility.thresholdVnd,policyVersion:f.monthlyEligibility.policyVersion}}:{}),id:f.id,minimumVnd:f.minimumVnd,maximumVnd:f.maximumVnd,employeeRateBasisPoints:f.employeeRateBasisPoints,employerRateBasisPoints:f.employerRateBasisPoints})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),
    pit:{personalDeductionVnd:input.pit.personalDeductionVnd,dependentDeductionVnd:input.pit.dependentDeductionVnd,brackets:input.pit.brackets}};
}
const JSON_KEYS:Record<string,readonly string[]>={
  FIXTURE_INVALID:['compensation','mode','calculator','employment','ruleBinding','attendance','insuranceFunds','pit','holiday','policy','unsupportedComponents'],
  FIXTURE_COMPENSATION_INVALID:['basis','monthlySalaryVnd','hourlyRateVnd','minimumHourlyRateVnd','policyVersion','effectiveFrom','effectiveTo'],
  FIXTURE_ELIGIBILITY_INVALID:['month','assessedIncomeVnd','thresholdVnd','policyVersion'],
  FIXTURE_EMPLOYMENT_INVALID:['kind','monthlySalaryVnd','proration'],
  FIXTURE_RULE_BINDING_INVALID:['id','version','status','componentDates'],
  FIXTURE_COMPONENT_DATES_INVALID:['ordinaryPay','insurance','pit'],
  FIXTURE_ATTENDANCE_INVALID:['rawMilliseconds','payableMilliseconds','nightWorkMilliseconds'],
  FIXTURE_CALCULATOR_INVALID:['id','version','canonicalizationVersion','sourceArtifactSha256'],
  FIXTURE_PIT_INVALID:['personalDeductionVnd','dependentCount','dependentDeductionVnd','brackets'],
  FIXTURE_PIT_BRACKET_INVALID:['upToVnd','rateBasisPoints'],
  COMPONENT_BASE_POLICY_UNSUPPORTED:['insuranceBasePolicy','pitBasePolicy','evidence','holidayPremiumBasisPoints','holidayEntitlementTreatment'],
  FIXTURE_INSURANCE_INVALID:['monthlyEligibility','id','eligible','baseVnd','minimumVnd','maximumVnd','employeeRateBasisPoints','employerRateBasisPoints','componentDate'],
  FIXTURE_HOLIDAY_INVALID:['paidEntitlementVnd','ordinaryHourlyDivisorHours','daytimePremiumBasisPoints','payableMilliseconds','entitlementTreatment']
};

function compensationFromFixture(value:unknown):NonNullable<PayrollInput['compensation']>{
 const c=record(value,'FIXTURE_COMPENSATION_INVALID');
 if(c.basis==='monthly_salary'){
  if(Object.keys(c).some(k=>!['basis','monthlySalaryVnd'].includes(k)))throw Error('COMPENSATION_BINDING_MISMATCH');
  return {basis:'monthly_salary',monthlySalaryVnd:vnd(c.monthlySalaryVnd)};
 }
 if(c.basis!=='hourly_rate'||c.monthlySalaryVnd!==undefined)throw Error('COMPENSATION_BINDING_MISMATCH');
 return {basis:'hourly_rate',hourlyRateVnd:vnd(c.hourlyRateVnd),minimumHourlyRateVnd:vnd(c.minimumHourlyRateVnd),policyVersion:text(c.policyVersion,'COMPENSATION_POLICY_INVALID'),effectiveFrom:text(c.effectiveFrom,'COMPENSATION_POLICY_INVALID'),effectiveTo:text(c.effectiveTo,'COMPENSATION_POLICY_INVALID')};
}
function eligibilityFromFixture(value:unknown):NonNullable<PayrollInput['insuranceFunds'][number]['monthlyEligibility']>{
 const e=record(value,'FIXTURE_ELIGIBILITY_INVALID');
 return {month:text(e.month,'MONTHLY_ELIGIBILITY_INVALID'),assessedIncomeVnd:vnd(e.assessedIncomeVnd),thresholdVnd:vnd(e.thresholdVnd),policyVersion:text(e.policyVersion,'MONTHLY_ELIGIBILITY_INVALID')};
}
