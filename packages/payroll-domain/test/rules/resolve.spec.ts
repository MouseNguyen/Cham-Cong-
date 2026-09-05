import { describe, expect, test } from 'vitest';

import { resolveRulePack } from '../../src/rules/resolve';
import type { LegalRulePack, RuleContext } from '../../src/rules/types';

const EMPTY_RULES: LegalRulePack['rules'] = {
  minimumWages: [],
  pit: {
    taxPeriod: '2026',
    personalDeduction: 0n,
    dependentDeduction: 0n,
    brackets: [],
    businessIncomeReliefExcluded: true,
  },
  insuranceFunds: [],
  partTimeMonthlyEligibility: [],
  holiday: {
    paidEntitlementSeparate: true,
    daytimeOvertimePremiumBasisPoints: 30_000,
    includesPaidHolidayEntitlement: false,
    nightWork: 'unsupported',
  },
};

function pack(
  id: string,
  effectiveFrom: string,
  effectiveTo: string | null,
): LegalRulePack {
  return {
    id,
    version: id,
    jurisdiction: 'VN',
    status: 'draft',
    applicability: {
      basis: 'earning_period_end',
      effectiveFrom,
      effectiveTo,
      workplaceRegions: ['VN-REGION-I'],
    },
    sourceRefs: [],
    rules: EMPTY_RULES,
    contentSha256: 'a'.repeat(64),
    signatures: {
      accountant: null,
      externalSpecialist: null,
    },
  };
}

function context(month: '06' | '07'): RuleContext {
  return {
    earningPeriod: {
      start: `2026-${month}-01`,
      end: `2026-${month}-${month === '06' ? '30' : '31'}`,
    },
    paymentDate: `2026-${month}-31`.replace('-06-31', '-06-30'),
    taxPeriod: '2026',
    workplaceRegion: 'VN-REGION-I',
    adjustmentOfPayRunId: null,
  };
}

describe('resolveRulePack', () => {
  test('selects the June and July packs using the earning-period boundary', () => {
    const beforeJuly = pack('VN-2026-H1', '2026-01-01', '2026-06-30');
    const fromJuly = pack('VN-2026-H2', '2026-07-01', null);

    expect(resolveRulePack(context('06'), [beforeJuly, fromJuly]).id).toBe(
      beforeJuly.id,
    );
    expect(resolveRulePack(context('07'), [beforeJuly, fromJuly]).id).toBe(
      fromJuly.id,
    );
  });

  test('rejects overlapping packs instead of choosing by input order', () => {
    const first = pack('VN-2026-A', '2026-01-01', null);
    const second = pack('VN-2026-B', '2026-06-01', null);

    expect(() => resolveRulePack(context('07'), [first, second])).toThrow(
      'RULE_PACK_OVERLAP',
    );
  });

  test('fails closed when no pack matches the workplace region', () => {
    const regionOne = pack('VN-2026-I', '2026-01-01', null);

    expect(() =>
      resolveRulePack(
        { ...context('07'), workplaceRegion: 'VN-REGION-II' },
        [regionOne],
      ),
    ).toThrow('RULE_PACK_NOT_FOUND');
  });
});
