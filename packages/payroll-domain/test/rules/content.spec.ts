import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import draft from '../../../../rules/vn/2026/draft.json';
import { canonicalRulePackContent, hashRulePackContent } from '../../src/rules/content';
import type { LegalRulePack } from '../../src/rules/types';

test('canonical rule seal ignores object insertion order but preserves changed values', () => {
  const pack = draft as unknown as LegalRulePack;
  const reordered = Object.fromEntries(Object.entries(pack).reverse()) as unknown as LegalRulePack;
  expect(hashRulePackContent(reordered)).toBe(hashRulePackContent(pack));
  expect(hashRulePackContent({ ...pack, version: 'different' })).not.toBe(hashRulePackContent(pack));
});

test('stored draft uses the independently computed canonical content digest', () => {
  const pack = draft as unknown as LegalRulePack;
  const canonical = canonicalRulePackContent(pack);
  expect(createHash('sha256').update(canonical, 'utf8').digest('hex')).toBe(draft.contentSha256);
  expect(hashRulePackContent(pack)).toBe(draft.contentSha256);
});
