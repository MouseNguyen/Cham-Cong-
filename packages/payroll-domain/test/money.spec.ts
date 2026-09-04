import { describe, expect, test } from 'vitest';

import {
  minutes,
  multiplyRateByMinutes,
  serializeVnd,
  vndFromNumber,
} from '../src/index';

describe('exact VND and duration primitives', () => {
  test('calculates an hourly amount from approved whole minutes', () => {
    expect(multiplyRateByMinutes(26_000n, 90, 'HALF_UP_VND')).toBe(
      39_000n,
    );
  });

  test('rejects negative and non-integer minute durations deterministically', () => {
    expect(() => minutes(-1)).toThrow('DURATION_NEGATIVE');
    expect(() => minutes(1.5)).toThrow('DURATION_NON_INTEGER');
  });

  test('rejects unsafe JavaScript number conversion instead of rounding', () => {
    expect(() => vndFromNumber(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      'VND_UNSAFE_NUMBER',
    );
  });

  test('serializes VND as a base-10 string', () => {
    expect(serializeVnd(26_000n)).toBe('26000');
  });
});
