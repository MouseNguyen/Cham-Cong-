import Decimal from 'decimal.js';

import { roundVnd } from './rounding';

export type Vnd = bigint;

export function vndFromNumber(value: number): Vnd {
  if (!Number.isSafeInteger(value)) {
    throw new Error('VND_UNSAFE_NUMBER');
  }

  return roundVnd(new Decimal(value), 'HALF_UP_VND');
}

export function serializeVnd(value: Vnd): string {
  return value.toString(10);
}
