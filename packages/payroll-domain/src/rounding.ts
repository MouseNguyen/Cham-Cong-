import Decimal from 'decimal.js';

import type { Vnd } from './money';

export type RoundingRule = 'HALF_UP_VND';

export function roundVnd(value: Decimal, rule: RoundingRule): Vnd {
  if (rule !== 'HALF_UP_VND') {
    throw new Error('ROUNDING_RULE_UNSUPPORTED');
  }

  if (!value.isFinite()) {
    throw new Error('ROUNDING_VALUE_NON_FINITE');
  }

  return toRoundedVnd(value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP));
}

function toRoundedVnd(value: Decimal): Vnd {
  return BigInt(value.toFixed(0));
}
