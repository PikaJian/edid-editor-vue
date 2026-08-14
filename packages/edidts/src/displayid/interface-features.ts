/**
 * 4.5 Display Interface Features Data Block (tag 26h), DisplayID v2.1a.
 */

import { decodeBitList, encodeBitList } from './bytes';
import {
  DisplayIdDataBlockTag,
  type DisplayIdColorSpaceEotf,
  type DisplayIdDataBlock,
  type DisplayIdInterfaceFeaturesBlock,
} from './types';

export const INTERFACE_FEATURES_MIN_PAYLOAD_LENGTH = 9;

/** Table 4-27: RGB and YCbCr 4:4:4 start at 6 bpc; the subsampled formats start at 8 bpc. */
const RGB_COLOR_DEPTHS = [6, 8, 10, 12, 14, 16] as const;
const SUBSAMPLED_COLOR_DEPTHS = [8, 10, 12, 14, 16] as const;

/** 4.5.2: the stored value is a multiplier of 74.25 MP/s. */
const YCBCR420_PIXEL_RATE_STEP_MHZ = 74.25;

export function isInterfaceFeaturesPayloadLengthValid(payloadLength: number): boolean {
  return payloadLength >= INTERFACE_FEATURES_MIN_PAYLOAD_LENGTH;
}

export function decodeInterfaceFeaturesBlock(block: DisplayIdDataBlock): DisplayIdInterfaceFeaturesBlock {
  const payload = block.payload;
  const audioFlags = payload[5] ?? 0;
  const colorSpaceFlags = payload[6] ?? 0;
  const additionalCount = (payload[8] ?? 0) & 0x07;
  const additionalColorSpaceEotf: DisplayIdColorSpaceEotf[] = [];

  for (let index = 0; index < additionalCount; index += 1) {
    const byte = payload[9 + index];
    if (byte === undefined) break;
    additionalColorSpaceEotf.push({
      colorSpace: (byte >> 4) & 0x0f,
      eotf: byte & 0x0f,
    });
  }

  const minYcbcr420PixelRateRaw = payload[4] ?? 0;

  return {
    ...block,
    tag: DisplayIdDataBlockTag.DisplayInterfaceFeatures,
    rgbColorDepths: decodeBitList(payload[0] ?? 0, RGB_COLOR_DEPTHS),
    ycbcr444ColorDepths: decodeBitList(payload[1] ?? 0, RGB_COLOR_DEPTHS),
    ycbcr422ColorDepths: decodeBitList(payload[2] ?? 0, SUBSAMPLED_COLOR_DEPTHS),
    ycbcr420ColorDepths: decodeBitList(payload[3] ?? 0, SUBSAMPLED_COLOR_DEPTHS),
    minYcbcr420PixelRateRaw,
    minYcbcr420PixelRateMhz: minYcbcr420PixelRateRaw * YCBCR420_PIXEL_RATE_STEP_MHZ,
    audio48kHz: (audioFlags & 0x20) !== 0,
    audio44kHz: (audioFlags & 0x40) !== 0,
    audio32kHz: (audioFlags & 0x80) !== 0,
    colorSpaceSrgb: (colorSpaceFlags & 0x01) !== 0,
    colorSpaceBt601: (colorSpaceFlags & 0x02) !== 0,
    colorSpaceBt709: (colorSpaceFlags & 0x04) !== 0,
    colorSpaceAdobeRgb: (colorSpaceFlags & 0x08) !== 0,
    colorSpaceDciP3: (colorSpaceFlags & 0x10) !== 0,
    colorSpaceBt2020: (colorSpaceFlags & 0x20) !== 0,
    colorSpaceBt2020St2084: (colorSpaceFlags & 0x40) !== 0,
    additionalColorSpaceEotf,
  };
}

export function encodeInterfaceFeaturesBlock(block: DisplayIdInterfaceFeaturesBlock): Uint8Array {
  const additional = block.additionalColorSpaceEotf.slice(0, 7);
  const payload = new Uint8Array(INTERFACE_FEATURES_MIN_PAYLOAD_LENGTH + additional.length);

  payload[0] = encodeBitList(block.rgbColorDepths, RGB_COLOR_DEPTHS);
  payload[1] = encodeBitList(block.ycbcr444ColorDepths, RGB_COLOR_DEPTHS);
  payload[2] = encodeBitList(block.ycbcr422ColorDepths, SUBSAMPLED_COLOR_DEPTHS);
  payload[3] = encodeBitList(block.ycbcr420ColorDepths, SUBSAMPLED_COLOR_DEPTHS);
  payload[4] = block.minYcbcr420PixelRateRaw & 0xff;

  let audioFlags = 0;
  if (block.audio48kHz) audioFlags |= 0x20;
  if (block.audio44kHz) audioFlags |= 0x40;
  if (block.audio32kHz) audioFlags |= 0x80;
  payload[5] = audioFlags;

  let colorSpaceFlags = 0;
  if (block.colorSpaceSrgb) colorSpaceFlags |= 0x01;
  if (block.colorSpaceBt601) colorSpaceFlags |= 0x02;
  if (block.colorSpaceBt709) colorSpaceFlags |= 0x04;
  if (block.colorSpaceAdobeRgb) colorSpaceFlags |= 0x08;
  if (block.colorSpaceDciP3) colorSpaceFlags |= 0x10;
  if (block.colorSpaceBt2020) colorSpaceFlags |= 0x20;
  if (block.colorSpaceBt2020St2084) colorSpaceFlags |= 0x40;
  payload[6] = colorSpaceFlags;

  // Offset 0Ah (Combination 2) is reserved and cleared to all 0s.
  payload[7] = 0x00;
  payload[8] = additional.length & 0x07;

  additional.forEach((entry, index) => {
    payload[9 + index] = ((entry.colorSpace & 0x0f) << 4) | (entry.eotf & 0x0f);
  });

  return payload;
}
