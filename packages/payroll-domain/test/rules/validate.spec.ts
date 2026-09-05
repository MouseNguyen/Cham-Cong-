import { describe, expect, test } from 'vitest';

import draft from '../../../../rules/vn/2026/draft.json';
import sources from '../../../../rules/vn/2026/sources.json';
import { releaseRulePack, validateRulePack } from '../../src/rules/validate';
import type { LegalRulePack, RulePackSignature } from '../../src/rules/types';

function signature(role: RulePackSignature['role']): RulePackSignature {
  return {
    role,
    signerName: role === 'accountant' ? 'Kế toán kiểm thử' : 'Chuyên gia độc lập',
    signedAt: '2026-09-05T00:00:00+07:00',
    signedContentSha256: 'b'.repeat(64),
  };
}

function draftPack(): LegalRulePack {
  return {
    id: 'VN-2026-DRAFT',
    version: '2026.1-draft',
    jurisdiction: 'VN',
    status: 'draft',
    applicability: {
      basis: 'earning_period_end',
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
      workplaceRegions: ['VN-REGION-I'],
    },
    sourceRefs: [
      {
        id: 'S12',
        url: 'https://xaydungchinhsach.chinhphu.vn/example',
        contentSha256: null,
        evidenceStatus: 'verification_required',
      },
    ],
    rules: {
      minimumWages: [
        {
          region: 'VN-REGION-I',
          monthly: 5_310_000n,
          hourly: 25_500n,
          effectiveFrom: '2026-01-01',
          effectiveTo: null,
          sourceIds: ['S12', 'S31'],
        },
      ],
      pit: {
        taxPeriod: '2026',
        personalDeduction: 15_500_000n,
        dependentDeduction: 6_200_000n,
        brackets: [
          { upTo: 10_000_000n, rateBasisPoints: 500 },
          { upTo: 30_000_000n, rateBasisPoints: 1_000 },
          { upTo: 60_000_000n, rateBasisPoints: 2_000 },
          { upTo: 100_000_000n, rateBasisPoints: 3_000 },
          { upTo: null, rateBasisPoints: 3_500 },
        ],
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
    },
    contentSha256: 'a'.repeat(64),
    signatures: {
      accountant: null,
      externalSpecialist: null,
    },
  };
}

describe('rule-pack validation and release gates', () => {
  test('rejects production release while either required signature is missing', () => {
    const unsigned = draftPack();

    expect(() => releaseRulePack(unsigned)).toThrow(
      'RULE_PACK_SIGNATURES_MISSING',
    );
    expect(() =>
      releaseRulePack({
        ...unsigned,
        signatures: {
          accountant: signature('accountant'),
          externalSpecialist: null,
        },
      }),
    ).toThrow('RULE_PACK_SIGNATURES_MISSING');
  });

  test('releases a valid pack only when both signatures bind its content hash', () => {
    const draft = draftPack();
    const accountant = {
      ...signature('accountant'),
      signedContentSha256: draft.contentSha256,
    };
    const externalSpecialist = {
      ...signature('external_specialist'),
      signedContentSha256: draft.contentSha256,
    };

    const released = releaseRulePack({
      ...draft,
      signatures: { accountant, externalSpecialist },
    });

    expect(released.status).toBe('released');
    expect(Object.isFrozen(released)).toBe(true);
  });

  test('rejects a malformed content hash before release', () => {
    expect(() =>
      validateRulePack({ ...draftPack(), contentSha256: 'not-a-sha256' }),
    ).toThrow('RULE_PACK_HASH_INVALID');
  });

  test('checked-in fixture stays draft and keeps canonical source IDs public', () => {
    expect(draft.status).toBe('draft');
    expect(draft.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(draft.rules.minimumWages[0]).toEqual({
      region: 'VN-REGION-I',
      monthly: '5310000',
      hourly: '25500',
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
      sourceIds: ['S12', 'S31'],
    });
    expect(sources.map(({ id }) => id)).toEqual([
      ...Array.from({ length: 21 }, (_, index) => `S${String(index + 1).padStart(2, '0')}`),
      'S31',
    ]);
    expect(JSON.stringify(sources)).not.toMatch(/[A-Z]:\\|secret|token|cookie/i);
  });
});
