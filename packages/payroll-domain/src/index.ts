import Decimal from 'decimal.js';

import { minutes, type Minutes } from './duration';
import type { Vnd } from './money';
import { roundVnd, type RoundingRule } from './rounding';

export { minutes, type Minutes } from './duration';
export { serializeVnd, vndFromNumber, type Vnd } from './money';
export { roundVnd, type RoundingRule } from './rounding';

export function multiplyRateByMinutes(
  rate: Vnd,
  duration: Minutes,
  rule: RoundingRule,
): Vnd {
  const approvedMinutes = minutes(duration);
  const exactAmount = new Decimal(rate.toString())
    .mul(approvedMinutes)
    .div(60);

  return roundVnd(exactAmount, rule);
}
