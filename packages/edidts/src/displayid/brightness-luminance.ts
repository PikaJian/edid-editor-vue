/**
 * 4.11 Brightness Luminance Range Data Block (tag 2Eh), DisplayID v2.1a.
 */

import { readUint16, writeUint16 } from './bytes';
import { decodeHalfFloat, encodeHalfFloat } from './half-float';
import {
  DisplayIdDataBlockTag,
  type DisplayIdBrightnessLuminanceBlock,
  type DisplayIdDataBlock,
} from './types';

export const BRIGHTNESS_LUMINANCE_PAYLOAD_LENGTH = 6;

export function isBrightnessLuminancePayloadLengthValid(payloadLength: number): boolean {
  return payloadLength >= BRIGHTNESS_LUMINANCE_PAYLOAD_LENGTH;
}

export function decodeBrightnessLuminanceBlock(
  block: DisplayIdDataBlock,
): DisplayIdBrightnessLuminanceBlock {
  return {
    ...block,
    tag: DisplayIdDataBlockTag.BrightnessLuminanceRange,
    minSdrLuminance: decodeHalfFloat(readUint16(block.payload, 0)),
    maxSuggestedSdrLuminance: decodeHalfFloat(readUint16(block.payload, 2)),
    maxBoostSdrLuminance: decodeHalfFloat(readUint16(block.payload, 4)),
  };
}

export function encodeBrightnessLuminanceBlock(block: DisplayIdBrightnessLuminanceBlock): Uint8Array {
  const payload = new Uint8Array(BRIGHTNESS_LUMINANCE_PAYLOAD_LENGTH);

  writeUint16(payload, 0, encodeHalfFloat(block.minSdrLuminance));
  writeUint16(payload, 2, encodeHalfFloat(block.maxSuggestedSdrLuminance));
  writeUint16(payload, 4, encodeHalfFloat(block.maxBoostSdrLuminance));

  return payload;
}
