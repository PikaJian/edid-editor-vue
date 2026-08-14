/**
 * IEEE 754 half-precision (binary16) helpers.
 *
 * DisplayID v2.1a stores every luminance value as a half-precision float
 * (Display Parameters 4.2.5, Brightness Luminance Range 4.11). The spec uses
 * negative zero as the "this field carries no data" sentinel, so the sign of
 * zero has to survive a decode/encode round trip.
 */

const MIN_NORMAL = 6.103515625e-5; // 2^-14
const MIN_SUBNORMAL = 5.960464477539063e-8; // 2^-24
/** Halfway between the largest finite half (65504) and the first overflow step. */
const OVERFLOW_THRESHOLD = 65520;

export function decodeHalfFloat(bits: number): number {
  const sign = (bits >> 15) & 0x01;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x3ff;

  let magnitude: number;
  if (exponent === 0) {
    magnitude = fraction * MIN_SUBNORMAL;
  } else if (exponent === 0x1f) {
    magnitude = fraction === 0 ? Infinity : NaN;
  } else {
    magnitude = (fraction + 1024) * Math.pow(2, exponent - 25);
  }

  return sign === 1 ? -magnitude : magnitude;
}

export function encodeHalfFloat(value: number): number {
  if (Number.isNaN(value)) return 0x7e00;

  // Object.is separates -0 from 0, which is what makes the "no data" sentinel work.
  const sign = value < 0 || Object.is(value, -0) ? 0x8000 : 0x0000;
  const magnitude = Math.abs(value);

  if (magnitude === 0) return sign;
  if (!Number.isFinite(magnitude) || magnitude >= OVERFLOW_THRESHOLD) return sign | 0x7c00;

  if (magnitude < MIN_NORMAL) {
    const fraction = Math.round(magnitude / MIN_SUBNORMAL);
    // Rounding up out of the subnormal range lands on the smallest normal.
    return fraction >= 0x400 ? sign | 0x0400 : sign | fraction;
  }

  let exponent = Math.floor(Math.log2(magnitude));
  // log2 is not exact at power-of-two boundaries; nudge the exponent back into range.
  if (magnitude / Math.pow(2, exponent) >= 2) exponent += 1;
  if (magnitude / Math.pow(2, exponent) < 1) exponent -= 1;

  let fraction = Math.round((magnitude / Math.pow(2, exponent) - 1) * 1024);
  if (fraction === 1024) {
    exponent += 1;
    fraction = 0;
  }
  if (exponent > 15) return sign | 0x7c00;

  return sign | ((exponent + 15) << 10) | fraction;
}

/** True when a luminance field carries the spec's -0 "not provided" sentinel. */
export function isLuminanceUnset(value: number): boolean {
  return Object.is(value, -0);
}
