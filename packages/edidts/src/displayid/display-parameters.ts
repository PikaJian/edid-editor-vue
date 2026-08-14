/**
 * 4.2 Display Parameters Data Block (tag 21h), DisplayID v2.1a.
 */

import { readUint16, writeUint16 } from './bytes';
import { decodeHalfFloat, encodeHalfFloat } from './half-float';
import {
  DisplayIdDataBlockTag,
  type DisplayIdChromaticity,
  type DisplayIdDataBlock,
  type DisplayIdDisplayParametersBlock,
} from './types';

export const DISPLAY_PARAMETERS_PAYLOAD_LENGTH = 29;

/** Byte 01h[7] selects between 0.1-mm and 1.0-mm units (4.2.1). */
const IMAGE_SIZE_MULTIPLIER_FLAG = 1 << 4; // flags are byte 01h shifted right by 3

/** 12-bit binary fractions, where bit 11 is 2^-1 (4.2.4.3). */
const CHROMATICITY_SCALE = 4096;

export function isDisplayParametersPayloadLengthValid(payloadLength: number): boolean {
  return payloadLength >= DISPLAY_PARAMETERS_PAYLOAD_LENGTH;
}

function decodeChromaticity(payload: Uint8Array, offset: number): DisplayIdChromaticity {
  const first = payload[offset] ?? 0;
  const second = payload[offset + 1] ?? 0;
  const third = payload[offset + 2] ?? 0;

  const xRaw = first | ((second & 0x0f) << 8);
  const yRaw = ((second >> 4) & 0x0f) | (third << 4);

  return {
    xRaw,
    yRaw,
    x: xRaw / CHROMATICITY_SCALE,
    y: yRaw / CHROMATICITY_SCALE,
  };
}

function encodeChromaticity(payload: Uint8Array, offset: number, value: DisplayIdChromaticity): void {
  const xRaw = value.xRaw & 0xfff;
  const yRaw = value.yRaw & 0xfff;

  payload[offset] = xRaw & 0xff;
  payload[offset + 1] = ((xRaw >> 8) & 0x0f) | ((yRaw & 0x0f) << 4);
  payload[offset + 2] = (yRaw >> 4) & 0xff;
}

export function decodeDisplayParametersBlock(block: DisplayIdDataBlock): DisplayIdDisplayParametersBlock {
  const payload = block.payload;
  const imageSizeMultiplier = (block.flags & IMAGE_SIZE_MULTIPLIER_FLAG) !== 0;
  const sizeUnitMm = imageSizeMultiplier ? 1 : 0.1;
  const featureFlags = payload[8] ?? 0;
  const colorDepthByte = payload[27] ?? 0;
  const gammaRaw = payload[28] ?? 0;

  return {
    ...block,
    tag: DisplayIdDataBlockTag.DisplayParameters,
    imageSizeMultiplier,
    horizontalImageSizeMm: readUint16(payload, 0) * sizeUnitMm,
    verticalImageSizeMm: readUint16(payload, 2) * sizeUnitMm,
    horizontalPixelCount: readUint16(payload, 4),
    verticalPixelCount: readUint16(payload, 6),
    scanOrientation: featureFlags & 0x07,
    luminanceInformation: (featureFlags >> 3) & 0x03,
    usesCie1976: (featureFlags & 0x40) !== 0,
    speakersNotIntegrated: (featureFlags & 0x80) !== 0,
    primary1: decodeChromaticity(payload, 9),
    primary2: decodeChromaticity(payload, 12),
    primary3: decodeChromaticity(payload, 15),
    whitePoint: decodeChromaticity(payload, 18),
    nativeMaxLuminanceFullCoverage: decodeHalfFloat(readUint16(payload, 21)),
    nativeMaxLuminance10Percent: decodeHalfFloat(readUint16(payload, 23)),
    nativeMinLuminance: decodeHalfFloat(readUint16(payload, 25)),
    nativeColorDepth: colorDepthByte & 0x07,
    displayDeviceTechnology: (colorDepthByte >> 4) & 0x07,
    darkThemePreferred: (colorDepthByte & 0x80) !== 0,
    nativeGamma: gammaRaw === 0xff ? undefined : (gammaRaw + 100) / 100,
    nativeGammaRaw: gammaRaw,
  };
}

export function encodeDisplayParametersFlags(block: DisplayIdDisplayParametersBlock): number {
  const preserved = block.flags & ~IMAGE_SIZE_MULTIPLIER_FLAG;
  return block.imageSizeMultiplier ? preserved | IMAGE_SIZE_MULTIPLIER_FLAG : preserved;
}

export function encodeDisplayParametersBlock(block: DisplayIdDisplayParametersBlock): Uint8Array {
  // Keep any trailing bytes a future revision may have added.
  const payload = new Uint8Array(Math.max(DISPLAY_PARAMETERS_PAYLOAD_LENGTH, block.payload.length));
  payload.set(block.payload.slice(DISPLAY_PARAMETERS_PAYLOAD_LENGTH), DISPLAY_PARAMETERS_PAYLOAD_LENGTH);

  const sizeUnitMm = block.imageSizeMultiplier ? 1 : 0.1;
  writeUint16(payload, 0, Math.round(block.horizontalImageSizeMm / sizeUnitMm));
  writeUint16(payload, 2, Math.round(block.verticalImageSizeMm / sizeUnitMm));
  writeUint16(payload, 4, block.horizontalPixelCount);
  writeUint16(payload, 6, block.verticalPixelCount);

  let featureFlags = block.scanOrientation & 0x07;
  featureFlags |= (block.luminanceInformation & 0x03) << 3;
  if (block.usesCie1976) featureFlags |= 0x40;
  if (block.speakersNotIntegrated) featureFlags |= 0x80;
  payload[8] = featureFlags;

  encodeChromaticity(payload, 9, block.primary1);
  encodeChromaticity(payload, 12, block.primary2);
  encodeChromaticity(payload, 15, block.primary3);
  encodeChromaticity(payload, 18, block.whitePoint);

  writeUint16(payload, 21, encodeHalfFloat(block.nativeMaxLuminanceFullCoverage));
  writeUint16(payload, 23, encodeHalfFloat(block.nativeMaxLuminance10Percent));
  writeUint16(payload, 25, encodeHalfFloat(block.nativeMinLuminance));

  let colorDepthByte = block.nativeColorDepth & 0x07;
  colorDepthByte |= (block.displayDeviceTechnology & 0x07) << 4;
  if (block.darkThemePreferred) colorDepthByte |= 0x80;
  payload[27] = colorDepthByte;

  payload[28] =
    block.nativeGamma === undefined ? 0xff : Math.max(0, Math.min(255, Math.round(block.nativeGamma * 100) - 100));

  return payload;
}
