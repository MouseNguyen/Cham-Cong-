import Decimal from 'decimal.js';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import { roundVnd } from '../src/index';

describe('HALF_UP_VND rounding', () => {
  test('preserves every non-negative whole-VND Decimal exactly', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), (value) => {
        return roundVnd(new Decimal(value), 'HALF_UP_VND') === BigInt(value);
      }),
    );
  });

  test('rounds fractional VND at the named HALF_UP boundary', () => {
    expect(roundVnd(new Decimal('1.5'), 'HALF_UP_VND')).toBe(2n);
    expect(roundVnd(new Decimal('1.49'), 'HALF_UP_VND')).toBe(1n);
  });
});
