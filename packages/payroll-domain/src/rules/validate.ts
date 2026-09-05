import { hashRulePackContent } from './content';
import type {
  DateInterval,
  LegalRulePack,
  RulePackSignature,
} from './types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function assertIsoDate(value: string): void {
  if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error('RULE_PACK_DATE_INVALID');
  }
}

function validateInterval(interval: DateInterval): void {
  assertIsoDate(interval.effectiveFrom);
  if (interval.effectiveTo !== null) {
    assertIsoDate(interval.effectiveTo);
    if (interval.effectiveFrom > interval.effectiveTo) {
      throw new Error('RULE_PACK_INTERVAL_INVALID');
    }
  }
}

function validateSignature(
  signature: RulePackSignature | null,
  role: RulePackSignature['role'],
  contentSha256: string,
): void {
  if (signature === null) return;
  if (
    signature.role !== role ||
    signature.signerName.trim() === '' ||
    !SHA256.test(signature.signedContentSha256) ||
    signature.signedContentSha256 !== contentSha256
  ) {
    throw new Error('RULE_PACK_SIGNATURE_INVALID');
  }
}

export function validateRulePack(pack: LegalRulePack): LegalRulePack {
  if (pack.id.trim() === '' || pack.version.trim() === '') {
    throw new Error('RULE_PACK_IDENTITY_INVALID');
  }
  if (!SHA256.test(pack.contentSha256)) {
    throw new Error('RULE_PACK_HASH_INVALID');
  }

  if (hashRulePackContent(pack) !== pack.contentSha256) {
    throw new Error('RULE_PACK_CONTENT_HASH_MISMATCH');
  }

  validateInterval(pack.applicability);
  if (pack.applicability.workplaceRegions.length === 0) {
    throw new Error('RULE_PACK_REGION_MISSING');
  }

  const sourceIds = new Set<string>();
  for (const source of pack.sourceRefs) {
    if (
      source.id.trim() === '' ||
      sourceIds.has(source.id) ||
      !source.url.startsWith('https://') ||
      (source.contentSha256 !== null && !SHA256.test(source.contentSha256))
    ) {
      throw new Error('RULE_PACK_SOURCE_INVALID');
    }
    sourceIds.add(source.id);
  }

  for (const rule of pack.rules.minimumWages) validateInterval(rule);
  for (const fund of pack.rules.insuranceFunds) {
    validateInterval(fund);
    for (const base of fund.baseVersions) validateInterval(base);
  }
  for (const rule of pack.rules.partTimeMonthlyEligibility) {
    validateInterval(rule);
  }

  const brackets = pack.rules.pit.brackets;
  for (let index = 0; index < brackets.length; index += 1) {
    const bracket = brackets[index]!;
    if (
      !Number.isInteger(bracket.rateBasisPoints) ||
      bracket.rateBasisPoints < 0 ||
      bracket.rateBasisPoints > 10_000
    ) {
      throw new Error('RULE_PACK_PIT_BRACKET_INVALID');
    }
    const previous = index === 0 ? undefined : brackets[index - 1];
    if (
      previous?.upTo !== null &&
      bracket.upTo !== null &&
      previous !== undefined &&
      bracket.upTo <= previous.upTo
    ) {
      throw new Error('RULE_PACK_PIT_BRACKET_INVALID');
    }
    if (bracket.upTo === null && index !== brackets.length - 1) {
      throw new Error('RULE_PACK_PIT_BRACKET_INVALID');
    }
  }

  validateSignature(
    pack.signatures.accountant,
    'accountant',
    pack.contentSha256,
  );
  validateSignature(
    pack.signatures.externalSpecialist,
    'external_specialist',
    pack.contentSha256,
  );

  return pack;
}

export function releaseRulePack(pack: LegalRulePack): Readonly<LegalRulePack> {
  if (
    pack.signatures.accountant === null ||
    pack.signatures.externalSpecialist === null
  ) {
    throw new Error('RULE_PACK_SIGNATURES_MISSING');
  }

  validateRulePack(pack);

  assertVerifiedSources(pack);
  if (pack.rules.insuranceFunds.some(fund => fund.evidenceStatus !== 'verified')) {
    throw new Error('RULE_PACK_POLICY_UNVERIFIED');
  }
  if ((pack.releaseBlockers ?? []).length > 0) {
    throw new Error('RULE_PACK_RELEASE_BLOCKED');
  }

  return freezeNested(structuredClone({ ...pack, status: 'released' as const }));
}

function assertVerifiedSources(pack: LegalRulePack): void {
  if (pack.sourceRefs.length === 0 || pack.sourceRefs.some(source =>
    source.evidenceStatus !== 'verified' || source.contentSha256 === null)) {
    throw new Error('RULE_PACK_SOURCES_UNVERIFIED');
  }
  const ids = new Set(pack.sourceRefs.map(source => source.id));
  function inspect(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(inspect);
    } else if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (key === 'sourceIds' && (!Array.isArray(child) ||
          child.some(id => typeof id !== 'string' || !ids.has(id)))) {
          throw new Error('RULE_PACK_SOURCE_REFERENCE_MISSING');
        }
        inspect(child);
      }
    }
  }
  inspect(pack.rules);
}

function freezeNested<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freezeNested);
    Object.freeze(value);
  }
  return value;
}
