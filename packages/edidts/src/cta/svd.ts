/**
 * Short Video Descriptor encoding, CTA-861-G section 7.5.1.
 *
 * A byte is not simply "VIC in the low 7 bits, native in bit 7". The spec's
 * pseudo code splits the range four ways, and bit 7 is part of the VIC value
 * in two of them:
 *
 *   0         Reserved
 *   1..64     7-bit VIC, not native
 *   65..127   8-bit VIC (first new set)
 *   128       Reserved
 *   129..192  7-bit VIC, native
 *   193..253  8-bit VIC (second new set)
 *   254, 255  Reserved
 *
 * Masking every byte with 7Fh therefore mis-reads the whole 193..253 range —
 * the 8K and 10K formats CTA-861-G added. SVD C2h is VIC 194 (7680x4320p24),
 * not "VIC 66, native".
 *
 * Used by both the Video Data Block and the YCbCr 4:2:0 Video Data Block:
 * section 7.5.10 says the latter lists SVDs "in the same manner" as 7.5.1.
 */

export interface ShortVideoDescriptor {
  vic: number;
  native: boolean;
}

/** Lowest and highest SVD byte that carries the native flag. */
const NATIVE_RANGE_START = 129;
const NATIVE_RANGE_END = 192;
/** Only a 7-bit VIC has a native encoding at all. */
const MAX_NATIVE_VIC = 64;

export function decodeShortVideoDescriptor(byte: number): ShortVideoDescriptor {
  const native = byte >= NATIVE_RANGE_START && byte <= NATIVE_RANGE_END;
  return {
    vic: native ? byte - 0x80 : byte,
    native,
  };
}

export function encodeShortVideoDescriptor(svd: ShortVideoDescriptor): number {
  const vic = svd.vic & 0xff;

  // Setting the flag on anything above VIC 64 would not mean "this VIC, and
  // native" — it would name a different format. VIC 97 with bit 7 set is E1h,
  // which reads back as VIC 225 from the second 8-bit set. There is no
  // encoding for a native 8-bit VIC, so the flag is dropped rather than
  // silently changing the format.
  if (svd.native && vic >= 1 && vic <= MAX_NATIVE_VIC) return vic + 0x80;

  return vic;
}
