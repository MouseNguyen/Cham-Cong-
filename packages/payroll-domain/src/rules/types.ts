import type { Vnd } from '../money';
import type { RoundingRule } from '../rounding';

export type IsoDate = string;
export type RulePackStatus = 'draft' | 'released';
export type RuleEvidenceStatus = 'verified' | 'verification_required';
export type EffectiveDateBasis = 'earning_period_end' | 'payment_date';

export interface DateInterval {
  readonly effectiveFrom: IsoDate;
  readonly effectiveTo: IsoDate | null;
}

export interface RuleContext {
  readonly earningPeriod: {
    readonly start: IsoDate;
    readonly end: IsoDate;
  };
  readonly paymentDate: IsoDate;
  readonly taxPeriod: string;
  readonly workplaceRegion: string;
  readonly adjustmentOfPayRunId: string | null;
}

export interface RulePackApplicability extends DateInterval {
  readonly basis: EffectiveDateBasis;
  readonly workplaceRegions: readonly string[];
}

export interface RuleSourceReference {
  readonly id: string;
  readonly url: string;
  readonly contentSha256: string | null;
  readonly evidenceStatus: RuleEvidenceStatus;
}

export interface MinimumWageRule extends DateInterval {
  readonly region: string;
  readonly monthly: Vnd;
  readonly hourly: Vnd;
  readonly sourceIds: readonly string[];
}

export interface PitBracket {
  readonly upTo: Vnd | null;
  readonly rateBasisPoints: number;
}

export interface PitPolicy {
  readonly taxPeriod: string;
  readonly personalDeduction: Vnd;
  readonly dependentDeduction: Vnd;
  readonly brackets: readonly PitBracket[];
  readonly businessIncomeReliefExcluded: boolean;
}

export interface InsuranceBaseVersion extends DateInterval {
  readonly minimum: Vnd;
  readonly maximum: Vnd;
  readonly sourceIds: readonly string[];
}

export interface InsuranceFundPolicy extends DateInterval {
  readonly id: string;
  readonly employeeRateBasisPoints: number;
  readonly employerRateBasisPoints: number;
  readonly baseVersions: readonly InsuranceBaseVersion[];
  readonly sourceIds: readonly string[];
  readonly evidenceStatus: RuleEvidenceStatus;
}

export interface PartTimeMonthlyEligibilityRule extends DateInterval {
  readonly id: string;
  readonly fundIds: readonly string[];
  readonly monthlyWageAtLeast: Vnd;
  readonly sourceIds: readonly string[];
}

export interface HolidayPolicy {
  readonly paidEntitlementSeparate: boolean;
  readonly daytimeOvertimePremiumBasisPoints: number;
  readonly includesPaidHolidayEntitlement: boolean;
  readonly nightWork: 'unsupported';
}

export interface LegalRuleSet {
  readonly minimumWages: readonly MinimumWageRule[];
  readonly pit: PitPolicy;
  readonly insuranceFunds: readonly InsuranceFundPolicy[];
  readonly partTimeMonthlyEligibility: readonly PartTimeMonthlyEligibilityRule[];
  readonly holiday: HolidayPolicy;
}

export interface RulePackSignature {
  readonly role: 'accountant' | 'external_specialist';
  readonly signerName: string;
  readonly signedAt: string;
  readonly signedContentSha256: string;
}

export interface LegalRulePack {
  readonly id: string;
  readonly version: string;
  readonly jurisdiction: 'VN';
  readonly status: RulePackStatus;
  readonly applicability: RulePackApplicability;
  readonly sourceRefs: readonly RuleSourceReference[];
  readonly rules: LegalRuleSet;
  readonly contentSha256: string;
  readonly signatures: {
    readonly accountant: RulePackSignature | null;
    readonly externalSpecialist: RulePackSignature | null;
  };
  readonly roundingRule?: RoundingRule;
}
