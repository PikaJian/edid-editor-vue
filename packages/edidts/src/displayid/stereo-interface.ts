/**
 * 4.6 Stereo Display Interface Data Block (tag 27h), DisplayID v2.1a.
 *
 * The payload is a length-prefixed interface-method sub-block followed by
 * optional 3D timing descriptors, so the parser follows the declared lengths
 * rather than assuming a fixed layout.
 */

import {
  DisplayIdDataBlockTag,
  type DisplayIdDataBlock,
  type DisplayIdStereoInterfaceBlock,
  type DisplayIdStereoTimingDescriptor,
} from './types';

/** Table 4-32 interface method codes. */
export const STEREO_METHOD_FRAME_SEQUENTIAL = 0x00;
export const STEREO_METHOD_SIDE_BY_SIDE = 0x01;
export const STEREO_METHOD_PIXEL_INTERLEAVED = 0x02;
export const STEREO_METHOD_DUAL_INTERFACE = 0x03;
export const STEREO_METHOD_MULTI_VIEW = 0x04;
export const STEREO_METHOD_STACKED_FRAME = 0x05;
export const STEREO_METHOD_PROPRIETARY = 0xff;

export const STEREO_METHOD_NAMES: Record<number, string> = {
  [STEREO_METHOD_FRAME_SEQUENTIAL]: 'Frame/Field Sequential',
  [STEREO_METHOD_SIDE_BY_SIDE]: 'Side-by-side',
  [STEREO_METHOD_PIXEL_INTERLEAVED]: 'Pixel-interleaved',
  [STEREO_METHOD_DUAL_INTERFACE]: 'Dual interface, left and right separate',
  [STEREO_METHOD_MULTI_VIEW]: 'Multi-view',
  [STEREO_METHOD_STACKED_FRAME]: 'Stacked frame',
  [STEREO_METHOD_PROPRIETARY]: 'Proprietary',
};

/** Byte 01h[7:6], i.e. flag bits 4:3 once the revision nibble is shifted off. */
const STEREO_TIMING_SUPPORT_SHIFT = 3;
/** Byte 01h[6] — timing codes are listed in the block. */
const STEREO_TIMING_CODES_PRESENT = 0x01;

export function isStereoPayloadLengthValid(payloadLength: number): boolean {
  return payloadLength >= 2;
}

export function decodeStereoInterfaceBlock(block: DisplayIdDataBlock): DisplayIdStereoInterfaceBlock {
  const payload = block.payload;
  const stereoTimingSupport = (block.flags >> STEREO_TIMING_SUPPORT_SHIFT) & 0x03;

  // Offset 03h counts the method code byte plus its parameters.
  const methodLength = payload[0] ?? 0;
  const methodCode = payload[1] ?? 0;
  const parameterLength = Math.max(0, methodLength - 1);
  const methodParameters = payload.slice(2, 2 + parameterLength);

  const decoded: DisplayIdStereoInterfaceBlock = {
    ...block,
    tag: DisplayIdDataBlockTag.StereoDisplayInterface,
    stereoTimingSupport,
    methodCode,
    methodParameters,
    timingDescriptors: [],
  };

  switch (methodCode) {
    case STEREO_METHOD_FRAME_SEQUENTIAL:
      decoded.stereoPolarity = ((methodParameters[0] ?? 0) & 0x01) !== 0;
      break;
    case STEREO_METHOD_SIDE_BY_SIDE:
    case STEREO_METHOD_STACKED_FRAME:
      decoded.viewIdentity = ((methodParameters[0] ?? 0) & 0x01) !== 0;
      break;
    case STEREO_METHOD_PIXEL_INTERLEAVED:
      decoded.interleavePattern = methodParameters.slice(0, 8);
      break;
    case STEREO_METHOD_DUAL_INTERFACE: {
      const descriptor = methodParameters[0] ?? 0;
      decoded.carriesLeftEye = (descriptor & 0x01) !== 0;
      decoded.mirroring = (descriptor >> 1) & 0x03;
      break;
    }
    case STEREO_METHOD_MULTI_VIEW:
      decoded.viewCount = methodParameters[0] ?? 0;
      decoded.viewInterleavingMethod = methodParameters[1] ?? 0;
      break;
    default:
      break;
  }

  // Timing descriptors follow the method sub-block when byte 01h[6] is set.
  if ((stereoTimingSupport & STEREO_TIMING_CODES_PRESENT) !== 0) {
    let offset = 1 + methodLength;
    while (offset < payload.length) {
      const header = payload[offset];
      const count = header & 0x1f;
      const codes: number[] = [];
      for (let index = 0; index < count && offset + 1 + index < payload.length; index += 1) {
        codes.push(payload[offset + 1 + index]);
      }
      decoded.timingDescriptors.push({ timingCodeType: (header >> 6) & 0x03, codes });
      offset += 1 + count;
      if (count === 0) break;
    }
  }

  return decoded;
}

export function encodeStereoInterfaceFlags(block: DisplayIdStereoInterfaceBlock): number {
  const flags = block.flags & ~(0x03 << STEREO_TIMING_SUPPORT_SHIFT);
  return flags | ((block.stereoTimingSupport & 0x03) << STEREO_TIMING_SUPPORT_SHIFT);
}

function encodeMethodParameters(block: DisplayIdStereoInterfaceBlock): Uint8Array {
  switch (block.methodCode) {
    case STEREO_METHOD_FRAME_SEQUENTIAL:
      return new Uint8Array([block.stereoPolarity ? 0x01 : 0x00]);
    case STEREO_METHOD_SIDE_BY_SIDE:
    case STEREO_METHOD_STACKED_FRAME:
      return new Uint8Array([block.viewIdentity ? 0x01 : 0x00]);
    case STEREO_METHOD_PIXEL_INTERLEAVED:
      return block.interleavePattern ?? block.methodParameters;
    case STEREO_METHOD_DUAL_INTERFACE:
      return new Uint8Array([(block.carriesLeftEye ? 0x01 : 0x00) | ((block.mirroring ?? 0) & 0x03) << 1]);
    case STEREO_METHOD_MULTI_VIEW:
      return new Uint8Array([block.viewCount ?? 0, block.viewInterleavingMethod ?? 0]);
    default:
      return block.methodParameters;
  }
}

function encodeTimingDescriptors(descriptors: DisplayIdStereoTimingDescriptor[]): Uint8Array {
  const length = descriptors.reduce((total, descriptor) => total + 1 + descriptor.codes.length, 0);
  const bytes = new Uint8Array(length);
  let offset = 0;

  for (const descriptor of descriptors) {
    bytes[offset] = (descriptor.codes.length & 0x1f) | ((descriptor.timingCodeType & 0x03) << 6);
    descriptor.codes.forEach((code, index) => {
      bytes[offset + 1 + index] = code & 0xff;
    });
    offset += 1 + descriptor.codes.length;
  }

  return bytes;
}

export function encodeStereoInterfaceBlock(block: DisplayIdStereoInterfaceBlock): Uint8Array {
  const parameters = encodeMethodParameters(block);
  const timings = encodeTimingDescriptors(block.timingDescriptors);
  const payload = new Uint8Array(2 + parameters.length + timings.length);

  payload[0] = (parameters.length + 1) & 0xff;
  payload[1] = block.methodCode & 0xff;
  payload.set(parameters, 2);
  payload.set(timings, 2 + parameters.length);

  return payload;
}
