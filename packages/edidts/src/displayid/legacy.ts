/**
 * DisplayID Structure v1.x data blocks.
 *
 * DisplayID v2.1a reserves tags 00h through 1Fh for "legacy data blocks for
 * DisplayID Structure v1.x" (Table 3-1) without defining them, and monitors
 * still ship v1.2 sections as EDID extensions — often alongside a v2 one. This
 * module covers that tag space.
 *
 * Field-level decoding here is limited to the Type I Detailed Timing block.
 * v2.1a Section 4.3.1 states that the Type VII descriptor is the v1.2 Type I
 * descriptor "except for Bytes 0, 1, 2 ... which carry the pixel clock
 * information", which pins the layout exactly; Type I stores the pixel clock in
 * 10 kHz units rather than the 1 kHz units Type VII uses. Every other v1.x
 * block keeps its raw payload, since this package has no v1.x specification to
 * verify a field layout against.
 */

import { readUint16, readUint24, writeUint16, writeUint24 } from './bytes';
import {
  DisplayIdDataBlockTag,
  type DisplayIdDataBlock,
  type DisplayIdTypeIDetailedTimingBlock,
  type DisplayIdTypeIDetailedTiming,
} from './types';

/** Descriptor length of a v1.x Type I Detailed Timing entry. */
const TYPE_I_DESCRIPTOR_SIZE = 20;

/** Type I stores the pixel clock in 10 kHz units. */
const TYPE_I_PIXEL_CLOCK_STEP_KHZ = 10;

/** Tags this module owns: the v1.x legacy space plus the v1.x vendor block. */
export function isLegacyBlockTag(tag: number): boolean {
  return tag < 0x20 || tag === 0x7f;
}

function decodeTypeITiming(bytes: Uint8Array): DisplayIdTypeIDetailedTiming {
  const timingOptions = bytes[3] ?? 0;
  const syncOffsetHighByte = bytes[9] ?? 0;
  const verticalSyncOffsetHighByte = bytes[17] ?? 0;

  return {
    pixelClockKhz: (readUint24(bytes, 0) + 1) * TYPE_I_PIXEL_CLOCK_STEP_KHZ,
    aspectRatio: timingOptions & 0x0f,
    interlaced: (timingOptions & 0x10) !== 0,
    stereoSupport: (timingOptions >> 5) & 0x03,
    preferred: (timingOptions & 0x80) !== 0,
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
  };
}

function encodeTypeITiming(timing: DisplayIdTypeIDetailedTiming): Uint8Array {
  const bytes = new Uint8Array(TYPE_I_DESCRIPTOR_SIZE);

  writeUint24(bytes, 0, Math.max(0, Math.round(timing.pixelClockKhz / TYPE_I_PIXEL_CLOCK_STEP_KHZ) - 1));

  let timingOptions = timing.aspectRatio & 0x0f;
  if (timing.interlaced) timingOptions |= 0x10;
  timingOptions |= (timing.stereoSupport & 0x03) << 5;
  if (timing.preferred) timingOptions |= 0x80;
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

  return bytes;
}

export function decodeTypeIDetailedTimingBlock(block: DisplayIdDataBlock): DisplayIdTypeIDetailedTimingBlock {
  const timings: DisplayIdTypeIDetailedTiming[] = [];

  for (
    let offset = 0;
    offset + TYPE_I_DESCRIPTOR_SIZE <= block.payload.length;
    offset += TYPE_I_DESCRIPTOR_SIZE
  ) {
    timings.push(decodeTypeITiming(block.payload.slice(offset, offset + TYPE_I_DESCRIPTOR_SIZE)));
  }

  return {
    ...block,
    tag: DisplayIdDataBlockTag.TypeIDetailedTiming,
    timings,
  };
}

export function encodeTypeIDetailedTimingBlock(block: DisplayIdTypeIDetailedTimingBlock): Uint8Array {
  const payload = new Uint8Array(block.timings.length * TYPE_I_DESCRIPTOR_SIZE);

  block.timings.forEach((timing, index) => {
    payload.set(encodeTypeITiming(timing), index * TYPE_I_DESCRIPTOR_SIZE);
  });

  return payload;
}

export function decodeLegacyBlock(block: DisplayIdDataBlock): DisplayIdDataBlock {
  if (block.tag === DisplayIdDataBlockTag.TypeIDetailedTiming) {
    return decodeTypeIDetailedTimingBlock(block);
  }
  return block;
}

export function encodeLegacyPayload(block: DisplayIdDataBlock): Uint8Array {
  if (block.tag === DisplayIdDataBlockTag.TypeIDetailedTiming) {
    return encodeTypeIDetailedTimingBlock(block as DisplayIdTypeIDetailedTimingBlock);
  }
  return block.payload;
}
