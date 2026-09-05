import type {
  DateInterval,
  LegalRulePack,
  RuleContext,
} from './types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(value: string): void {
  if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error('RULE_CONTEXT_DATE_INVALID');
  }
}

function contains(interval: DateInterval, date: string): boolean {
  return (
    interval.effectiveFrom <= date &&
    (interval.effectiveTo === null || date <= interval.effectiveTo)
  );
}

function selectionDate(context: RuleContext, pack: LegalRulePack): string {
  return pack.applicability.basis === 'payment_date'
    ? context.paymentDate
    : context.earningPeriod.end;
}

export function resolveRulePack(
  context: RuleContext,
  packs: readonly LegalRulePack[],
): LegalRulePack {
  assertIsoDate(context.earningPeriod.start);
  assertIsoDate(context.earningPeriod.end);
  assertIsoDate(context.paymentDate);

  if (context.earningPeriod.start > context.earningPeriod.end) {
    throw new Error('RULE_CONTEXT_EARNING_PERIOD_INVALID');
  }

  const matches = packs.filter((pack) => {
    const date = selectionDate(context, pack);
    return (
      pack.jurisdiction === 'VN' &&
      pack.rules.pit.taxPeriod === context.taxPeriod &&
      pack.applicability.workplaceRegions.includes(context.workplaceRegion) &&
      contains(pack.applicability, date)
    );
  });

  if (matches.length === 0) {
    throw new Error('RULE_PACK_NOT_FOUND');
  }

  if (matches.length > 1) {
    throw new Error('RULE_PACK_OVERLAP');
  }

  return matches[0]!;
}
