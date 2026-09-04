export type Minutes = number;

export function minutes(value: number): Minutes {
  if (value < 0) {
    throw new Error('DURATION_NEGATIVE');
  }

  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error('DURATION_NON_INTEGER');
  }

  if (!Number.isSafeInteger(value)) {
    throw new Error('DURATION_UNSAFE_NUMBER');
  }

  return value;
}
