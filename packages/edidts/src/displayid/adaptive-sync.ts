/**
 * 4.9 Adaptive-Sync Data Block (tag 2Bh), DisplayID v2.1a.
 */

import {
  DisplayIdDataBlockTag,
  type DisplayIdAdaptiveSyncBlock,
  type DisplayIdAdaptiveSyncRange,
  type DisplayIdDataBlock,
} from './types';

const BASE_DESCRIPTOR_SIZE = 6;
/** Byte 01h[6:4], i.e. flag bits 3:1 once the revision nibble is shifted off. */
const DESCRIPTOR_SIZE_SHIFT = 1;

/** Bytes 1 and 5 are 6.2 fixed-point milliseconds (Table 4-52). */
const FIXED_POINT_6_2_DIVISOR = 4;

export const ADAPTIVE_SYNC_MODE_NAMES: Record<number, string> = {
  0: 'Fixed-Average VTotal (FAVT)',
  1: 'Fixed-Average VTotal and Adaptive VTotal (FAVT + AVT)',
};

function decodeRange(bytes: Uint8Array, size: number): DisplayIdAdaptiveSyncRange {
  const operation = bytes[0] ?? 0;

  return {
    nativePanelRange: (operation & 0x01) !== 0,
    frameDurationIncreaseTolerance: (operation & 0x02) !== 0,
    supportedModes: (operation >> 2) & 0x03,
    seamlessTransitionNotSupported: (operation & 0x10) !== 0,
    frameDurationDecreaseTolerance: (operation & 0x20) !== 0,
    maxSingleFrameDurationIncreaseMs: (bytes[1] ?? 0) / FIXED_POINT_6_2_DIVISOR,
    minRefreshRate: bytes[2] ?? 0,
    // Stored as (value − 1) across byte 3 and byte 4[1:0]: 000h means 1 Hz.
    maxRefreshRate: ((bytes[3] ?? 0) | (((bytes[4] ?? 0) & 0x03) << 8)) + 1,
    maxSingleFrameDurationDecreaseMs: (bytes[5] ?? 0) / FIXED_POINT_6_2_DIVISOR,
    extraBytes: bytes.slice(BASE_DESCRIPTOR_SIZE, size),
  };
}

function encodeRange(range: DisplayIdAdaptiveSyncRange, size: number): Uint8Array {
  const bytes = new Uint8Array(size);

  let operation = 0;
  if (range.nativePanelRange) operation |= 0x01;
  if (range.frameDurationIncreaseTolerance) operation |= 0x02;
  operation |= (range.supportedModes & 0x03) << 2;
  if (range.seamlessTransitionNotSupported) operation |= 0x10;
  if (range.frameDurationDecreaseTolerance) operation |= 0x20;
  bytes[0] = operation;

  bytes[1] = Math.round(range.maxSingleFrameDurationIncreaseMs * FIXED_POINT_6_2_DIVISOR) & 0xff;
  bytes[2] = range.minRefreshRate & 0xff;

  const maxRefreshRate = Math.max(0, range.maxRefreshRate - 1);
  bytes[3] = maxRefreshRate & 0xff;
  bytes[4] = (maxRefreshRate >> 8) & 0x03;
  bytes[5] = Math.round(range.maxSingleFrameDurationDecreaseMs * FIXED_POINT_6_2_DIVISOR) & 0xff;
  bytes.set(range.extraBytes.slice(0, Math.max(0, size - BASE_DESCRIPTOR_SIZE)), BASE_DESCRIPTOR_SIZE);

  return bytes;
}

export function decodeAdaptiveSyncBlock(block: DisplayIdDataBlock): DisplayIdAdaptiveSyncBlock {
  const descriptorSize = BASE_DESCRIPTOR_SIZE + ((block.flags >> DESCRIPTOR_SIZE_SHIFT) & 0x07);
  const ranges: DisplayIdAdaptiveSyncRange[] = [];

  for (let offset = 0; offset + descriptorSize <= block.payload.length; offset += descriptorSize) {
    ranges.push(decodeRange(block.payload.slice(offset, offset + descriptorSize), descriptorSize));
  }

  return {
    ...block,
    tag: DisplayIdDataBlockTag.AdaptiveSync,
    descriptorSize,
    ranges,
  };
}

export function encodeAdaptiveSyncFlags(block: DisplayIdAdaptiveSyncBlock): number {
  const descriptorSizeField = Math.max(0, block.descriptorSize - BASE_DESCRIPTOR_SIZE) & 0x07;
  const flags = block.flags & ~(0x07 << DESCRIPTOR_SIZE_SHIFT);
  return flags | (descriptorSizeField << DESCRIPTOR_SIZE_SHIFT);
}

export function encodeAdaptiveSyncBlock(block: DisplayIdAdaptiveSyncBlock): Uint8Array {
  const size = Math.max(BASE_DESCRIPTOR_SIZE, block.descriptorSize);
  const payload = new Uint8Array(block.ranges.length * size);

  block.ranges.forEach((range, index) => {
    payload.set(encodeRange(range, size), index * size);
  });

  return payload;
}
