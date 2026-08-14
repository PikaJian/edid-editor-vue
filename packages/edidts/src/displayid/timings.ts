/**
 * 4.3 Video Timing Mode-related Data Blocks, DisplayID v2.1a.
 *
 * Covers Type VII detailed timings (tag 22h), Type VIII enumerated timing codes
 * (tag 23h), and the Type IX / Type X formula-based timings (tags 24h and 2Ah).
 *
 * Note the shared "minus one" convention: pixel counts, line counts, refresh
 * rates, and pixel clocks are all stored as (value − 1), so 0000h means 1.
 */

import { readUint16, readUint24, writeUint16, writeUint24 } from './bytes';
import {
  DisplayIdDataBlockTag,
  type DisplayIdDataBlock,
  type DisplayIdTypeIxTiming,
  type DisplayIdTypeIxTimingBlock,
  type DisplayIdTypeViiTiming,
  type DisplayIdTypeViiTimingBlock,
  type DisplayIdTypeViiiTimingBlock,
  type DisplayIdTypeXTiming,
  type DisplayIdTypeXTimingBlock,
} from './types';

const TYPE_VII_BASE_DESCRIPTOR_SIZE = 20;
const TYPE_IX_DESCRIPTOR_SIZE = 6;
const TYPE_X_BASE_DESCRIPTOR_SIZE = 6;

/** Flags are byte 01h shifted right by 3, so byte bit N is flag bit N − 3. */
const TYPE_VII_DSC_PASS_THROUGH_FLAG = 1 << 0; // byte 01h[3]
const TYPE_VII_DESCRIPTOR_SIZE_SHIFT = 1; // byte 01h[6:4]
const TYPE_VIII_CODE_SIZE_FLAG = 1 << 0; // byte 01h[3]
const TYPE_VIII_YCC420_FLAG = 1 << 2; // byte 01h[5]
const TYPE_VIII_CODE_TYPE_SHIFT = 3; // byte 01h[7:6]
const TYPE_X_DESCRIPTOR_SIZE_SHIFT = 1; // byte 01h[6:4]

/** CVT v2.1 RB Timing v3, byte 6[4:2] — see the HBlank table in 4.3.4. */
function resolveHBlankPixels(delta: number, hBlank160: boolean): number {
  if (!hBlank160) return delta * 8 + 80;
  return delta <= 5 ? delta * 8 + 160 : (5 - delta) * 8 + 160;
}

// ---------------------------------------------------------------------------
// Type VII — Detailed Timing (tag 22h)
// ---------------------------------------------------------------------------

function decodeTypeViiTiming(bytes: Uint8Array, revision: number): DisplayIdTypeViiTiming {
  const timingOptions = bytes[3] ?? 0;
  const bit7 = (timingOptions & 0x80) !== 0;
  const syncOffsetHighByte = bytes[9] ?? 0;
  const verticalSyncOffsetHighByte = bytes[17] ?? 0;

  return {
    pixelClockKhz: readUint24(bytes, 0) + 1,
    aspectRatio: timingOptions & 0x0f,
    interlaced: (timingOptions & 0x10) !== 0,
    stereoSupport: (timingOptions >> 5) & 0x03,
    // Block Revision 2 redefined bit 7 from "preferred" to "YCbCr 4:2:0 support".
    preferred: revision >= 2 ? undefined : bit7,
    ycc420: revision >= 2 ? bit7 : undefined,
    horizontalActive: readUint16(bytes, 4) + 1,
    horizontalBlank: readUint16(bytes, 6) + 1,
    horizontalFrontPorch: ((bytes[8] ?? 0) | ((syncOffsetHighByte & 0x7f) << 8)) + 1,
    horizontalSyncPositive: (syncOffsetHighByte & 0x80) !== 0,
    horizontalSyncWidth: readUint16(bytes, 10) + 1,
    verticalActive: readUint16(bytes, 12) + 1,
    verticalBlank: readUint16(bytes, 14) + 1,
    verticalFrontPorch: ((bytes[16] ?? 0) | ((verticalSyncOffsetHighByte & 0x7f) << 8)) + 1,
    verticalSyncPositive: (verticalSyncOffsetHighByte & 0x80) !== 0,
    verticalSyncWidth: readUint16(bytes, 18) + 1,
    extraBytes: bytes.slice(TYPE_VII_BASE_DESCRIPTOR_SIZE),
  };
}

function encodeTypeViiTiming(timing: DisplayIdTypeViiTiming, size: number, revision: number): Uint8Array {
  const bytes = new Uint8Array(size);

  writeUint24(bytes, 0, Math.max(0, timing.pixelClockKhz - 1));

  let timingOptions = timing.aspectRatio & 0x0f;
  if (timing.interlaced) timingOptions |= 0x10;
  timingOptions |= (timing.stereoSupport & 0x03) << 5;
  if (revision >= 2 ? timing.ycc420 : timing.preferred) timingOptions |= 0x80;
  bytes[3] = timingOptions;

  writeUint16(bytes, 4, Math.max(0, timing.horizontalActive - 1));
  writeUint16(bytes, 6, Math.max(0, timing.horizontalBlank - 1));

  const horizontalFrontPorch = Math.max(0, timing.horizontalFrontPorch - 1);
  bytes[8] = horizontalFrontPorch & 0xff;
  bytes[9] = ((horizontalFrontPorch >> 8) & 0x7f) | (timing.horizontalSyncPositive ? 0x80 : 0x00);

  writeUint16(bytes, 10, Math.max(0, timing.horizontalSyncWidth - 1));
  writeUint16(bytes, 12, Math.max(0, timing.verticalActive - 1));
  writeUint16(bytes, 14, Math.max(0, timing.verticalBlank - 1));

  const verticalFrontPorch = Math.max(0, timing.verticalFrontPorch - 1);
  bytes[16] = verticalFrontPorch & 0xff;
  bytes[17] = ((verticalFrontPorch >> 8) & 0x7f) | (timing.verticalSyncPositive ? 0x80 : 0x00);

  writeUint16(bytes, 18, Math.max(0, timing.verticalSyncWidth - 1));
  bytes.set(timing.extraBytes.slice(0, Math.max(0, size - TYPE_VII_BASE_DESCRIPTOR_SIZE)), TYPE_VII_BASE_DESCRIPTOR_SIZE);

  return bytes;
}

export function decodeTypeViiTimingBlock(block: DisplayIdDataBlock): DisplayIdTypeViiTimingBlock {
  // Block Revision 0 leaves bits 6:4 reserved, which reads back as the base size.
  const descriptorSize =
    TYPE_VII_BASE_DESCRIPTOR_SIZE + ((block.flags >> TYPE_VII_DESCRIPTOR_SIZE_SHIFT) & 0x07);
  const timings: DisplayIdTypeViiTiming[] = [];

  for (let offset = 0; offset + descriptorSize <= block.payload.length; offset += descriptorSize) {
    timings.push(decodeTypeViiTiming(block.payload.slice(offset, offset + descriptorSize), block.revision));
  }

  return {
    ...block,
    tag: DisplayIdDataBlockTag.TypeVIIDetailedTiming,
    dscPassThrough: (block.flags & TYPE_VII_DSC_PASS_THROUGH_FLAG) !== 0,
    descriptorSize,
    timings,
  };
}

export function encodeTypeViiTimingFlags(block: DisplayIdTypeViiTimingBlock): number {
  const descriptorSizeField = Math.max(0, block.descriptorSize - TYPE_VII_BASE_DESCRIPTOR_SIZE) & 0x07;
  let flags = block.flags & ~(TYPE_VII_DSC_PASS_THROUGH_FLAG | (0x07 << TYPE_VII_DESCRIPTOR_SIZE_SHIFT));
  if (block.dscPassThrough) flags |= TYPE_VII_DSC_PASS_THROUGH_FLAG;
  return flags | (descriptorSizeField << TYPE_VII_DESCRIPTOR_SIZE_SHIFT);
}

export function encodeTypeViiTimingBlock(block: DisplayIdTypeViiTimingBlock): Uint8Array {
  const size = Math.max(TYPE_VII_BASE_DESCRIPTOR_SIZE, block.descriptorSize);
  const payload = new Uint8Array(block.timings.length * size);

  block.timings.forEach((timing, index) => {
    payload.set(encodeTypeViiTiming(timing, size, block.revision), index * size);
  });

  return payload;
}

// ---------------------------------------------------------------------------
// Type VIII — Enumerated Timing Code (tag 23h)
// ---------------------------------------------------------------------------

export function decodeTypeViiiTimingBlock(block: DisplayIdDataBlock): DisplayIdTypeViiiTimingBlock {
  const timingCodeSize = (block.flags & TYPE_VIII_CODE_SIZE_FLAG) !== 0 ? 2 : 1;
  const codes: number[] = [];

  for (let offset = 0; offset + timingCodeSize <= block.payload.length; offset += timingCodeSize) {
    codes.push(timingCodeSize === 2 ? readUint16(block.payload, offset) : block.payload[offset]);
  }

  return {
    ...block,
    tag: DisplayIdDataBlockTag.TypeVIIIEnumeratedTimingCode,
    timingCodeSize,
    timingCodeType: (block.flags >> TYPE_VIII_CODE_TYPE_SHIFT) & 0x03,
    ycc420: (block.flags & TYPE_VIII_YCC420_FLAG) !== 0,
    codes,
  };
}

export function encodeTypeViiiTimingFlags(block: DisplayIdTypeViiiTimingBlock): number {
  let flags =
    block.flags & ~(TYPE_VIII_CODE_SIZE_FLAG | TYPE_VIII_YCC420_FLAG | (0x03 << TYPE_VIII_CODE_TYPE_SHIFT));
  if (block.timingCodeSize === 2) flags |= TYPE_VIII_CODE_SIZE_FLAG;
  if (block.ycc420) flags |= TYPE_VIII_YCC420_FLAG;
  return flags | ((block.timingCodeType & 0x03) << TYPE_VIII_CODE_TYPE_SHIFT);
}

export function encodeTypeViiiTimingBlock(block: DisplayIdTypeViiiTimingBlock): Uint8Array {
  const size = block.timingCodeSize === 2 ? 2 : 1;
  const payload = new Uint8Array(block.codes.length * size);

  block.codes.forEach((code, index) => {
    if (size === 2) {
      writeUint16(payload, index * 2, code);
    } else {
      payload[index] = code & 0xff;
    }
  });

  return payload;
}

// ---------------------------------------------------------------------------
// Type IX — Formula-based Timing (tag 24h)
// ---------------------------------------------------------------------------

function decodeTypeIxTiming(bytes: Uint8Array): DisplayIdTypeIxTiming {
  const timingOptions = bytes[0] ?? 0;

  return {
    formula: timingOptions & 0x07,
    fractionalRefreshRate: (timingOptions & 0x10) !== 0,
    stereoSupport: (timingOptions >> 5) & 0x03,
    horizontalActive: readUint16(bytes, 1) + 1,
    verticalActive: readUint16(bytes, 3) + 1,
    refreshRate: (bytes[5] ?? 0) + 1,
  };
}

export function decodeTypeIxTimingBlock(block: DisplayIdDataBlock): DisplayIdTypeIxTimingBlock {
  const timings: DisplayIdTypeIxTiming[] = [];

  for (
    let offset = 0;
    offset + TYPE_IX_DESCRIPTOR_SIZE <= block.payload.length;
    offset += TYPE_IX_DESCRIPTOR_SIZE
  ) {
    timings.push(decodeTypeIxTiming(block.payload.slice(offset, offset + TYPE_IX_DESCRIPTOR_SIZE)));
  }

  return {
    ...block,
    tag: DisplayIdDataBlockTag.TypeIXFormulaBasedTiming,
    timings,
  };
}

export function encodeTypeIxTimingBlock(block: DisplayIdTypeIxTimingBlock): Uint8Array {
  const payload = new Uint8Array(block.timings.length * TYPE_IX_DESCRIPTOR_SIZE);

  block.timings.forEach((timing, index) => {
    const offset = index * TYPE_IX_DESCRIPTOR_SIZE;
    let timingOptions = timing.formula & 0x07;
    if (timing.fractionalRefreshRate) timingOptions |= 0x10;
    timingOptions |= (timing.stereoSupport & 0x03) << 5;

    payload[offset] = timingOptions;
    writeUint16(payload, offset + 1, Math.max(0, timing.horizontalActive - 1));
    writeUint16(payload, offset + 3, Math.max(0, timing.verticalActive - 1));
    payload[offset + 5] = Math.max(0, timing.refreshRate - 1) & 0xff;
  });

  return payload;
}

// ---------------------------------------------------------------------------
// Type X — Formula-based Timing (tag 2Ah)
// ---------------------------------------------------------------------------

/** CVT v2.1 RB Timing v3, where byte 0[3] and byte 0[4] change meaning. */
const CVT_RB_V3 = 0x03;
/** CVT v2.1 RB Timing v2, where byte 0[4] is the fractional refresh rate option. */
const CVT_RB_V2 = 0x02;

function decodeTypeXTiming(bytes: Uint8Array, size: number): DisplayIdTypeXTiming {
  const timingOptions = bytes[0] ?? 0;
  const formula = timingOptions & 0x07;
  const bit4 = (timingOptions & 0x10) !== 0;

  const timing: DisplayIdTypeXTiming = {
    formula,
    earlyVSync: formula === CVT_RB_V3 ? (timingOptions & 0x08) !== 0 : undefined,
    fractionalRefreshRate: formula === CVT_RB_V2 ? bit4 : undefined,
    hBlank160: formula === CVT_RB_V3 ? bit4 : undefined,
    stereoSupport: (timingOptions >> 5) & 0x03,
    ycc420: (timingOptions & 0x80) !== 0,
    horizontalActive: readUint16(bytes, 1) + 1,
    verticalActive: readUint16(bytes, 3) + 1,
    refreshRate: (bytes[5] ?? 0) + 1,
  };

  if (size >= 7) {
    // The 7-byte descriptor widens the refresh rate to 10 bits.
    timing.refreshRate = ((bytes[5] ?? 0) | (((bytes[6] ?? 0) & 0x03) << 8)) + 1;

    if (formula === CVT_RB_V3) {
      const delta = ((bytes[6] ?? 0) >> 2) & 0x07;
      timing.deltaHBlankRaw = delta;
      timing.hBlankPixels = resolveHBlankPixels(delta, timing.hBlank160 === true);

      const additionalVBlank = ((bytes[6] ?? 0) >> 5) & 0x07;
      timing.additionalVBlankRaw = additionalVBlank;
    }
  }

  if (size >= 8) {
    const alternateMinVBlank = ((bytes[7] ?? 0) & 0x01) !== 0;
    timing.alternateMinVBlank = alternateMinVBlank;
    if (timing.additionalVBlankRaw !== undefined) {
      timing.additionalVBlankMicroseconds = timing.additionalVBlankRaw * (alternateMinVBlank ? 20 : 35);
    }
  } else if (timing.additionalVBlankRaw !== undefined) {
    // Without byte 7 the nominal (460 µs) minimum VBlank applies.
    timing.additionalVBlankMicroseconds = timing.additionalVBlankRaw * 35;
  }

  return timing;
}

function encodeTypeXTiming(timing: DisplayIdTypeXTiming, size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  const formula = timing.formula & 0x07;

  let timingOptions = formula;
  if (formula === CVT_RB_V3 && timing.earlyVSync) timingOptions |= 0x08;
  if (formula === CVT_RB_V3 ? timing.hBlank160 : timing.fractionalRefreshRate) timingOptions |= 0x10;
  timingOptions |= (timing.stereoSupport & 0x03) << 5;
  if (timing.ycc420) timingOptions |= 0x80;
  bytes[0] = timingOptions;

  writeUint16(bytes, 1, Math.max(0, timing.horizontalActive - 1));
  writeUint16(bytes, 3, Math.max(0, timing.verticalActive - 1));

  const refreshRate = Math.max(0, timing.refreshRate - 1);
  bytes[5] = refreshRate & 0xff;

  if (size >= 7) {
    let byte6 = (refreshRate >> 8) & 0x03;
    if (formula === CVT_RB_V3) {
      byte6 |= ((timing.deltaHBlankRaw ?? 0) & 0x07) << 2;
      byte6 |= ((timing.additionalVBlankRaw ?? 0) & 0x07) << 5;
    }
    bytes[6] = byte6;
  }

  if (size >= 8) {
    bytes[7] = timing.alternateMinVBlank ? 0x01 : 0x00;
  }

  return bytes;
}

export function decodeTypeXTimingBlock(block: DisplayIdDataBlock): DisplayIdTypeXTimingBlock {
  const descriptorSize =
    TYPE_X_BASE_DESCRIPTOR_SIZE + ((block.flags >> TYPE_X_DESCRIPTOR_SIZE_SHIFT) & 0x07);
  const timings: DisplayIdTypeXTiming[] = [];

  for (let offset = 0; offset + descriptorSize <= block.payload.length; offset += descriptorSize) {
    timings.push(decodeTypeXTiming(block.payload.slice(offset, offset + descriptorSize), descriptorSize));
  }

  return {
    ...block,
    tag: DisplayIdDataBlockTag.TypeXFormulaBasedTiming,
    descriptorSize,
    timings,
  };
}

export function encodeTypeXTimingFlags(block: DisplayIdTypeXTimingBlock): number {
  const descriptorSizeField = Math.max(0, block.descriptorSize - TYPE_X_BASE_DESCRIPTOR_SIZE) & 0x07;
  const flags = block.flags & ~(0x07 << TYPE_X_DESCRIPTOR_SIZE_SHIFT);
  return flags | (descriptorSizeField << TYPE_X_DESCRIPTOR_SIZE_SHIFT);
}

export function encodeTypeXTimingBlock(block: DisplayIdTypeXTimingBlock): Uint8Array {
  const size = Math.max(TYPE_X_BASE_DESCRIPTOR_SIZE, block.descriptorSize);
  const payload = new Uint8Array(block.timings.length * size);

  block.timings.forEach((timing, index) => {
    payload.set(encodeTypeXTiming(timing, size), index * size);
  });

  return payload;
}
