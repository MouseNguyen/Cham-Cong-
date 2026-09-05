import { createHash } from 'node:crypto';
import type { LegalRulePack } from './types';

/** Version 2: sorted object keys; array order preserved; VND bigint -> decimal string. */
export function canonicalRulePackContent(pack: LegalRulePack): string {
  return JSON.stringify({
    id: pack.id,
    version: pack.version,
    jurisdiction: pack.jurisdiction,
    applicability: pack.applicability,
    sourceRefs: pack.sourceRefs,
    rules: pack.rules,
    roundingRule: pack.roundingRule ?? null,
    releaseBlockers: pack.releaseBlockers ?? [],
  }, (_key, value: unknown) => {
    if (typeof value === 'bigint') return value.toString(10);
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(
        Object.entries(value).sort(([left], [right]) =>
          left < right ? -1 : left > right ? 1 : 0),
      );
    }
    return value;
  });
}

export function hashRulePackContent(pack: LegalRulePack): string {
  return createHash('sha256').update(canonicalRulePackContent(pack), 'utf8').digest('hex');
}
