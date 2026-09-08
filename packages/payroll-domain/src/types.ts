import type { Vnd } from './money';

export type PayrollMode = 'synthetic_preview' | 'production';
export type EmploymentKind = 'full_time' | 'part_time';

export interface CalculatorBinding {
  readonly id: string;
  readonly version: string;
  readonly canonicalizationVersion: string;
  readonly sourceArtifactSha256: string;
}

export interface PayrollInput {
  mode: PayrollMode;
  compensation?: {basis:'monthly_salary';monthlySalaryVnd:Vnd} | {basis:'hourly_rate';hourlyRateVnd:Vnd;minimumHourlyRateVnd:Vnd;policyVersion:string;effectiveFrom:string;effectiveTo:string};
  policy: { insuranceBasePolicy:string; pitBasePolicy:string; evidence:string; holidayPremiumBasisPoints:number; holidayEntitlementTreatment:string };
  calculator: CalculatorBinding;
  employment: { kind: EmploymentKind; monthlySalaryVnd: Vnd; proration: 'none' | 'unpaid_leave' };
  ruleBinding: {
    id: string;
    version: string;
    status: 'draft' | 'released';
    componentDates: { ordinaryPay: string; insurance: string; pit: string };
  };
  attendance: { rawMilliseconds: bigint; payableMilliseconds: bigint; nightWorkMilliseconds: bigint };
  insuranceFunds: readonly InsuranceFundInput[];
  pit: PitInput;
  holiday: HolidayInput | null;
  unsupportedComponents: readonly string[];
}

export interface InsuranceFundInput {
  readonly id: string;
  readonly eligible: boolean;
  readonly monthlyEligibility?: {month:string;assessedIncomeVnd:Vnd;thresholdVnd:Vnd;policyVersion:string};
  readonly baseVnd: Vnd;
  readonly minimumVnd: Vnd;
  readonly maximumVnd: Vnd;
  readonly employeeRateBasisPoints: number;
  readonly employerRateBasisPoints: number;
  readonly componentDate: string;
}

export interface PitInput {
  readonly personalDeductionVnd: Vnd;
  readonly dependentCount: number;
  readonly dependentDeductionVnd: Vnd;
  readonly brackets: readonly { upToVnd: Vnd | null; rateBasisPoints: number }[];
}

export interface HolidayInput {
  readonly entitlementTreatment: string;
  payableMilliseconds: bigint;
  readonly paidEntitlementVnd: Vnd;
  readonly ordinaryHourlyDivisorHours: bigint;
  readonly daytimePremiumBasisPoints: number;
}

export interface CalculationLine {
  readonly formula: string;
  readonly operands: Readonly<Record<string,string|number|boolean>>;
  readonly preRounding: { numerator:string; denominator:string };
  readonly roundedAmountVnd: Vnd;
  readonly componentDate: string;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly evidenceStatus: 'synthetic_assumption';
  readonly code: string;
  readonly labelVi: string;
  readonly amountVnd: Vnd;
  readonly roundingRule: 'HALF_UP_VND';
  readonly ruleBinding: string;
  readonly reason: string;
}

export interface TraceEntry {
  readonly code: string;
  readonly amountVnd: Vnd;
  readonly operands: Readonly<Record<string, string | number | boolean>>;
}

export interface PayrollResult {
  readonly gross:string; readonly pit:string; readonly net:string; readonly employerCost:string;
  readonly employeeInsuranceTotal:string; readonly employerInsuranceTotal:string;
  readonly calculatorVersion:string; readonly calculatorArtifactHash:string; readonly canonicalizationVersion:string;
  readonly rulePackKind:'synthetic_materialized_policy';
  readonly fundContributions: readonly {id:string;employeeVnd:Vnd;employerVnd:Vnd;appliedBaseVnd:Vnd}[];
  readonly inputHash: string;
  readonly rulePackId: string;
  readonly rulePackHash: string;
  readonly resultSchemaVersion: string;
  readonly status: 'synthetic_preview';
  readonly finalizable: false;
  readonly blockers: readonly string[];
  readonly lines: readonly CalculationLine[];
  readonly trace: readonly TraceEntry[];
  readonly totals: { grossVnd: Vnd; employeeInsuranceVnd: Vnd; employerInsuranceVnd: Vnd; pitVnd: Vnd; netVnd: Vnd; employerCostVnd: Vnd };
  readonly calculator: CalculatorBinding;
  readonly canonicalResult: string;
  readonly resultSha256: string;
}
