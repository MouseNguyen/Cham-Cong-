import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';

import draft from '../../../../rules/vn/2026/draft.json';
import sources from '../../../../rules/vn/2026/sources.json';
import { releaseRulePack, validateRulePack } from '../../src/rules/validate';
import type { LegalRulePack } from '../../src/rules/types';

const moneyFields = new Set([
  'monthly', 'hourly', 'personalDeduction', 'dependentDeduction',
  'upTo', 'minimum', 'maximum', 'monthlyWageAtLeast',
]);

function fixture(): LegalRulePack {
  return JSON.parse(JSON.stringify(draft), (key, value: unknown) =>
    moneyFields.has(key) && typeof value === 'string' ? BigInt(value) : value,
  ) as LegalRulePack;
}

// Test-owned seal, independent of the production helper. Synthetic approvals only.
function seal(pack: LegalRulePack): LegalRulePack {
  const fields = {
    id: pack.id, version: pack.version, jurisdiction: pack.jurisdiction,
    applicability: pack.applicability, sourceRefs: pack.sourceRefs,
    rules: pack.rules, roundingRule: pack.roundingRule ?? null,
    releaseBlockers: ('releaseBlockers' in pack ? pack.releaseBlockers : []) ?? [],
  };
  const canonical = JSON.stringify(fields, (_key, value: unknown) => {
    if (typeof value === 'bigint') return value.toString();
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0));
    }
    return value;
  });
  const hash = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return {
    ...pack, contentSha256: hash,
    signatures: {
      accountant: {
        role: 'accountant', signerName: 'Synthetic accountant',
        signedAt: '2026-09-05T00:00:00Z', signedContentSha256: hash,
      },
      externalSpecialist: {
        role: 'external_specialist', signerName: 'Synthetic specialist',
        signedAt: '2026-09-05T00:00:00Z', signedContentSha256: hash,
      },
    },
  };
}

function verifiedPack(): LegalRulePack {
  const pack = fixture();
  return seal({
    ...pack,
    ...{ releaseBlockers: [] },
    sourceRefs: pack.sourceRefs.map(source => ({
      ...source, url: 'https://example.invalid/synthetic/' + source.id,
      contentSha256: 'c'.repeat(64), evidenceStatus: 'verified' as const,
    })),
    rules: {
      ...pack.rules,
      insuranceFunds: pack.rules.insuranceFunds.map(fund => ({
        ...fund, evidenceStatus: 'verified' as const,
      })),
    },
  });
}

describe('rule-pack validation and release gates', () => {
  test('rejects release when either approval is absent', () => {
    const pack = verifiedPack();
    for (const signatures of [
      { accountant: null, externalSpecialist: pack.signatures.externalSpecialist },
      { accountant: pack.signatures.accountant, externalSpecialist: null },
    ]) {
      expect(() => releaseRulePack({ ...pack, signatures }))
        .toThrow('RULE_PACK_SIGNATURES_MISSING');
    }
  });

  test('releases a fully evidenced synthetic pack without modifying its draft input', () => {
    const pack = verifiedPack();
    const result = releaseRulePack(pack);
    expect(result.status).toBe('released');
    expect(result.contentSha256).toBe(pack.contentSha256);
    expect(pack.status).toBe('draft');
  });

  test('rejects altered rule content with matching but stale signatures and hash', () => {
    const pack = verifiedPack();
    expect(() => releaseRulePack({
      ...pack, rules: { ...pack.rules, pit: { ...pack.rules.pit, personalDeduction: 1n } },
    })).toThrow('RULE_PACK_CONTENT_HASH_MISMATCH');
  });

  test('binds the approved content to its pack identity', () => {
    expect(() => releaseRulePack({ ...verifiedPack(), id: 'ANOTHER-PACK' }))
      .toThrow('RULE_PACK_CONTENT_HASH_MISMATCH');
  });

  test.each([
    { contentSha256: null, evidenceStatus: 'verified' as const },
    { contentSha256: 'c'.repeat(64), evidenceStatus: 'verification_required' as const },
  ])('blocks unsealed or unverified source evidence: %j', change => {
    const pack = verifiedPack();
    expect(() => releaseRulePack(seal({
      ...pack, sourceRefs: pack.sourceRefs.map(source => ({ ...source, ...change })),
    }))).toThrow('RULE_PACK_SOURCES_UNVERIFIED');
  });

  test('rejects dangling source IDs even with two matching approvals', () => {
    const pack = verifiedPack();
    expect(() => releaseRulePack(seal({
      ...pack, sourceRefs: pack.sourceRefs.filter(source => source.id !== 'S31'),
    }))).toThrow('RULE_PACK_SOURCE_REFERENCE_MISSING');
  });

  test('rejects an unresolved fund policy with otherwise verified evidence', () => {
    const pack = verifiedPack();
    expect(() => releaseRulePack(seal({
      ...pack, rules: {
        ...pack.rules, insuranceFunds: pack.rules.insuranceFunds.map(fund => ({
          ...fund, evidenceStatus: 'verification_required' as const,
        })),
      },
    }))).toThrow('RULE_PACK_POLICY_UNVERIFIED');
  });

  test('honours an explicit outstanding business or legal blocker', () => {
    expect(() => releaseRulePack(seal({
      ...verifiedPack(), ...{ releaseBlockers: ['COMPANY_CLASSIFICATION_UNCONFIRMED'] },
    }))).toThrow('RULE_PACK_RELEASE_BLOCKED');
  });

  test('released nested values cannot change through either the result or the original draft', () => {
    const input = verifiedPack();
    const released = releaseRulePack(input);
    expect(Reflect.set(released.rules.pit, 'personalDeduction', 1n)).toBe(false);
    expect(Reflect.set(input.rules.pit, 'personalDeduction', 2n)).toBe(true);
    expect(released.rules.pit.personalDeduction).toBe(15_500_000n);
    expect(() => (released.sourceRefs as unknown[]).pop()).toThrow(TypeError);
  });

  test('rejects a malformed content hash', () => {
    expect(() => validateRulePack({ ...fixture(), contentSha256: 'not-a-sha256' }))
      .toThrow('RULE_PACK_HASH_INVALID');
  });

  test('accepts the actual checked-in draft for analysis but never for release', () => {
    expect(validateRulePack(fixture()).status).toBe('draft');
    expect(() => releaseRulePack(fixture())).toThrow('RULE_PACK_SIGNATURES_MISSING');
    expect(sources.map(({ id }) => id)).toEqual([
      ...Array.from({ length: 21 }, (_, index) => 'S' + String(index + 1).padStart(2, '0')),
      'S31',
    ]);
    expect(JSON.stringify(sources)).not.toMatch(/[A-Z]:\\|secret|token|cookie/i);
  });
});
