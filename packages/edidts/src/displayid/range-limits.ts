/**
 * 4.4 Dynamic Video Timing Range Limits Data Block (tag 25h), DisplayID v2.1a.
 *
 * Superseded by the Adaptive-Sync data block for new designs, but still present
 * in shipping EDIDs.
 */

import { readUint24, writeUint24 } from './bytes';
import {
  DisplayIdDataBlockTag,
  type DisplayIdDataBlock,
  type DisplayIdDynamicRangeLimitsBlock,
} from './types';

export const DYNAMIC_RANGE_LIMITS_PAYLOAD_LENGTH = 9;

export function isDynamicRangeLimitsPayloadLengthValid(payloadLength: number): boolean {
  return payloadLength >= DYNAMIC_RANGE_LIMITS_PAYLOAD_LENGTH;
}

export function decodeDynamicRangeLimitsBlock(block: DisplayIdDataBlock): DisplayIdDynamicRangeLimitsBlock {
  const payload = block.payload;
  const flagsByte = payload[8] ?? 0;

  // Block Revision 1 widened the maximum refresh rate to 10 bits (Table 4-24).
  const maxVerticalRefreshRate =
    block.revision >= 1 ? (payload[7] ?? 0) | ((flagsByte & 0x03) << 8) : (payload[7] ?? 0);

  return {
    ...block,
    tag: DisplayIdDataBlockTag.DynamicVideoTimingRangeLimits,
    minPixelClockKhz: readUint24(payload, 0) + 1,
    maxPixelClockKhz: readUint24(payload, 3) + 1,
    minVerticalRefreshRate: payload[6] ?? 0,
    maxVerticalRefreshRate,
    seamlessDynamicVideoTiming: (flagsByte & 0x80) !== 0,
  };
}

export function encodeDynamicRangeLimitsBlock(block: DisplayIdDynamicRangeLimitsBlock): Uint8Array {
  const payload = new Uint8Array(DYNAMIC_RANGE_LIMITS_PAYLOAD_LENGTH);

  writeUint24(payload, 0, Math.max(0, block.minPixelClockKhz - 1));
  writeUint24(payload, 3, Math.max(0, block.maxPixelClockKhz - 1));
  payload[6] = block.minVerticalRefreshRate & 0xff;
  payload[7] = block.maxVerticalRefreshRate & 0xff;

  let flagsByte = 0;
  if (block.revision >= 1) flagsByte |= (block.maxVerticalRefreshRate >> 8) & 0x03;
  if (block.seamlessDynamicVideoTiming) flagsByte |= 0x80;
  payload[8] = flagsByte;

  return payload;
}
