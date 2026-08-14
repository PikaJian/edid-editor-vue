/**
 * DisplayID v2.x data block framing (v2.1a Section 3.1) and dispatch to the
 * per-block decoders in Section 4.
 *
 * A block whose payload is too short for its tag is kept as a generic block
 * rather than throwing, so a malformed block never hides the rest of the
 * section.
 */

import {
  DisplayIdDataBlockTag,
  DisplayIdDecodeError,
  type DisplayIdAdaptiveSyncBlock,
  type DisplayIdBrightnessLuminanceBlock,
  type DisplayIdContainerIdBlock,
  type DisplayIdCtaEncapsulationBlock,
  type DisplayIdDataBlock,
  type DisplayIdDisplayParametersBlock,
  type DisplayIdDynamicRangeLimitsBlock,
  type DisplayIdInterfaceFeaturesBlock,
  type DisplayIdProductIdentificationBlock,
  type DisplayIdStereoInterfaceBlock,
  type DisplayIdTiledDisplayBlock,
  type DisplayIdTypeIxTimingBlock,
  type DisplayIdTypeViiTimingBlock,
  type DisplayIdTypeViiiTimingBlock,
  type DisplayIdTypeXTimingBlock,
  type DisplayIdVendorSpecificBlock,
} from './types';
import {
  decodeProductIdentificationBlock,
  encodeProductIdentificationBlock,
  isProductIdentificationPayloadLengthValid,
} from './product-identification';
import {
  decodeDisplayParametersBlock,
  encodeDisplayParametersBlock,
  encodeDisplayParametersFlags,
  isDisplayParametersPayloadLengthValid,
} from './display-parameters';
import {
  decodeTypeIxTimingBlock,
  decodeTypeViiTimingBlock,
  decodeTypeViiiTimingBlock,
  decodeTypeXTimingBlock,
  encodeTypeIxTimingBlock,
  encodeTypeViiTimingBlock,
  encodeTypeViiTimingFlags,
  encodeTypeViiiTimingBlock,
  encodeTypeViiiTimingFlags,
  encodeTypeXTimingBlock,
  encodeTypeXTimingFlags,
} from './timings';
import {
  decodeDynamicRangeLimitsBlock,
  encodeDynamicRangeLimitsBlock,
  isDynamicRangeLimitsPayloadLengthValid,
} from './range-limits';
import {
  decodeInterfaceFeaturesBlock,
  encodeInterfaceFeaturesBlock,
  isInterfaceFeaturesPayloadLengthValid,
} from './interface-features';
import {
  decodeStereoInterfaceBlock,
  encodeStereoInterfaceBlock,
  encodeStereoInterfaceFlags,
  isStereoPayloadLengthValid,
} from './stereo-interface';
import {
  decodeTiledDisplayBlock,
  encodeTiledDisplayBlock,
  isTiledDisplayPayloadLengthValid,
} from './tiled-display';
import {
  decodeContainerIdBlock,
  encodeContainerIdBlock,
  isContainerIdPayloadLengthValid,
} from './container-id';
import { decodeAdaptiveSyncBlock, encodeAdaptiveSyncBlock, encodeAdaptiveSyncFlags } from './adaptive-sync';
import {
  decodeBrightnessLuminanceBlock,
  encodeBrightnessLuminanceBlock,
  isBrightnessLuminancePayloadLengthValid,
} from './brightness-luminance';
import {
  decodeCtaEncapsulationBlock,
  decodeVendorSpecificBlock,
  encodeCtaEncapsulationBlock,
  encodeVendorSpecificBlock,
  isVendorSpecificPayloadLengthValid,
} from './vendor-specific';
import { decodeLegacyBlock, encodeLegacyPayload, isLegacyBlockTag } from './legacy';

export interface DecodeBlocksResult {
  blocks: DisplayIdDataBlock[];
  fillBytes: number;
}

const BLOCK_HEADER_LENGTH = 3;

/**
 * @param structureVersion Section structure version from byte 00h[7:4]. v1.x
 *   sections use the legacy 00h–1Fh tag space that v2 sections reserve.
 */
export function decodeDisplayIdBlocks(
  data: Uint8Array,
  startOffset: number,
  endOffset: number,
  structureVersion = 2,
): DecodeBlocksResult {
  const blocks: DisplayIdDataBlock[] = [];
  let offset = startOffset;
  let fillBytes = 0;

  while (offset < endOffset) {
    const tag = data[offset];

    if (tag === 0x00) {
      fillBytes = endOffset - offset;
      break;
    }

    if (offset + BLOCK_HEADER_LENGTH > endOffset) {
      throw new DisplayIdDecodeError('DisplayID data block header extends past the section payload');
    }

    const revisionAndFlags = data[offset + 1];
    const payloadLength = data[offset + 2];
    const blockEnd = offset + BLOCK_HEADER_LENGTH + payloadLength;

    if (blockEnd > endOffset) {
      throw new DisplayIdDecodeError(
        `DisplayID data block at offset ${offset} declares ${payloadLength} payload bytes past the section payload`,
      );
    }

    if (structureVersion >= 2 && tag < DisplayIdDataBlockTag.ProductIdentification) {
      throw new DisplayIdDecodeError(
        `DisplayID v2.0 reserves legacy data block tag 0x${tag.toString(16).padStart(2, '0')}`,
      );
    }

    const genericBlock: DisplayIdDataBlock = {
      tag,
      revision: revisionAndFlags & 0x07,
      flags: revisionAndFlags >> 3,
      payloadLength,
      payload: data.slice(offset + BLOCK_HEADER_LENGTH, blockEnd),
    };

    blocks.push(
      structureVersion < 2 ? decodeLegacyBlock(genericBlock) : decodeKnownBlock(genericBlock),
    );

    offset = blockEnd;
  }

  return { blocks, fillBytes };
}

export function encodeDisplayIdBlock(block: DisplayIdDataBlock): Uint8Array {
  const payload = encodeKnownPayload(block);
  const encoded = new Uint8Array(BLOCK_HEADER_LENGTH + payload.length);

  encoded[0] = block.tag & 0xff;
  encoded[1] = ((encodeKnownFlags(block) & 0x1f) << 3) | (block.revision & 0x07);
  encoded[2] = payload.length & 0xff;
  encoded.set(payload, BLOCK_HEADER_LENGTH);

  return encoded;
}

function decodeKnownBlock(block: DisplayIdDataBlock): DisplayIdDataBlock {
  switch (block.tag) {
    case DisplayIdDataBlockTag.ProductIdentification:
      return isProductIdentificationPayloadLengthValid(block.payloadLength)
        ? decodeProductIdentificationBlock(block)
        : block;
    case DisplayIdDataBlockTag.DisplayParameters:
      return isDisplayParametersPayloadLengthValid(block.payloadLength)
        ? decodeDisplayParametersBlock(block)
        : block;
    case DisplayIdDataBlockTag.TypeVIIDetailedTiming:
      return decodeTypeViiTimingBlock(block);
    case DisplayIdDataBlockTag.TypeVIIIEnumeratedTimingCode:
      return decodeTypeViiiTimingBlock(block);
    case DisplayIdDataBlockTag.TypeIXFormulaBasedTiming:
      return decodeTypeIxTimingBlock(block);
    case DisplayIdDataBlockTag.TypeXFormulaBasedTiming:
      return decodeTypeXTimingBlock(block);
    case DisplayIdDataBlockTag.DynamicVideoTimingRangeLimits:
      return isDynamicRangeLimitsPayloadLengthValid(block.payloadLength)
        ? decodeDynamicRangeLimitsBlock(block)
        : block;
    case DisplayIdDataBlockTag.DisplayInterfaceFeatures:
      return isInterfaceFeaturesPayloadLengthValid(block.payloadLength)
        ? decodeInterfaceFeaturesBlock(block)
        : block;
    case DisplayIdDataBlockTag.StereoDisplayInterface:
      return isStereoPayloadLengthValid(block.payloadLength) ? decodeStereoInterfaceBlock(block) : block;
    case DisplayIdDataBlockTag.TiledDisplayTopology:
      return isTiledDisplayPayloadLengthValid(block.payloadLength) ? decodeTiledDisplayBlock(block) : block;
    case DisplayIdDataBlockTag.ContainerId:
      return isContainerIdPayloadLengthValid(block.payloadLength) ? decodeContainerIdBlock(block) : block;
    case DisplayIdDataBlockTag.AdaptiveSync:
      return decodeAdaptiveSyncBlock(block);
    case DisplayIdDataBlockTag.BrightnessLuminanceRange:
      return isBrightnessLuminancePayloadLengthValid(block.payloadLength)
        ? decodeBrightnessLuminanceBlock(block)
        : block;
    case DisplayIdDataBlockTag.VendorSpecific:
      return isVendorSpecificPayloadLengthValid(block.payloadLength) ? decodeVendorSpecificBlock(block) : block;
    case DisplayIdDataBlockTag.CtaDataBlockEncapsulation:
      return decodeCtaEncapsulationBlock(block);
    // ARVR_HMD (2Ch) and ARVR_Layer (2Dh) are not permitted in EDID Extension
    // Sections (4.10), so they stay generic and keep their raw payload.
    default:
      return block;
  }
}

function encodeKnownPayload(block: DisplayIdDataBlock): Uint8Array {
  // v1.x tags do not overlap the v2 tag space, so the tag alone picks the table.
  if (isLegacyBlockTag(block.tag)) return encodeLegacyPayload(block);

  switch (block.tag) {
    case DisplayIdDataBlockTag.ProductIdentification:
      return isProductIdentificationPayloadLengthValid(block.payloadLength)
        ? encodeProductIdentificationBlock(block as DisplayIdProductIdentificationBlock)
        : block.payload;
    case DisplayIdDataBlockTag.DisplayParameters:
      return isDisplayParametersPayloadLengthValid(block.payloadLength)
        ? encodeDisplayParametersBlock(block as DisplayIdDisplayParametersBlock)
        : block.payload;
    case DisplayIdDataBlockTag.TypeVIIDetailedTiming:
      return encodeTypeViiTimingBlock(block as DisplayIdTypeViiTimingBlock);
    case DisplayIdDataBlockTag.TypeVIIIEnumeratedTimingCode:
      return encodeTypeViiiTimingBlock(block as DisplayIdTypeViiiTimingBlock);
    case DisplayIdDataBlockTag.TypeIXFormulaBasedTiming:
      return encodeTypeIxTimingBlock(block as DisplayIdTypeIxTimingBlock);
    case DisplayIdDataBlockTag.TypeXFormulaBasedTiming:
      return encodeTypeXTimingBlock(block as DisplayIdTypeXTimingBlock);
    case DisplayIdDataBlockTag.DynamicVideoTimingRangeLimits:
      return isDynamicRangeLimitsPayloadLengthValid(block.payloadLength)
        ? encodeDynamicRangeLimitsBlock(block as DisplayIdDynamicRangeLimitsBlock)
        : block.payload;
    case DisplayIdDataBlockTag.DisplayInterfaceFeatures:
      return isInterfaceFeaturesPayloadLengthValid(block.payloadLength)
        ? encodeInterfaceFeaturesBlock(block as DisplayIdInterfaceFeaturesBlock)
        : block.payload;
    case DisplayIdDataBlockTag.StereoDisplayInterface:
      return isStereoPayloadLengthValid(block.payloadLength)
        ? encodeStereoInterfaceBlock(block as DisplayIdStereoInterfaceBlock)
        : block.payload;
    case DisplayIdDataBlockTag.TiledDisplayTopology:
      return isTiledDisplayPayloadLengthValid(block.payloadLength)
        ? encodeTiledDisplayBlock(block as DisplayIdTiledDisplayBlock)
        : block.payload;
    case DisplayIdDataBlockTag.ContainerId:
      return isContainerIdPayloadLengthValid(block.payloadLength)
        ? encodeContainerIdBlock(block as DisplayIdContainerIdBlock)
        : block.payload;
    case DisplayIdDataBlockTag.AdaptiveSync:
      return encodeAdaptiveSyncBlock(block as DisplayIdAdaptiveSyncBlock);
    case DisplayIdDataBlockTag.BrightnessLuminanceRange:
      return isBrightnessLuminancePayloadLengthValid(block.payloadLength)
        ? encodeBrightnessLuminanceBlock(block as DisplayIdBrightnessLuminanceBlock)
        : block.payload;
    case DisplayIdDataBlockTag.VendorSpecific:
      return isVendorSpecificPayloadLengthValid(block.payloadLength)
        ? encodeVendorSpecificBlock(block as DisplayIdVendorSpecificBlock)
        : block.payload;
    case DisplayIdDataBlockTag.CtaDataBlockEncapsulation:
      return encodeCtaEncapsulationBlock(block as DisplayIdCtaEncapsulationBlock);
    default:
      return block.payload;
  }
}

/** Blocks that carry decoded fields in byte 01h[7:3] rebuild it from those fields. */
function encodeKnownFlags(block: DisplayIdDataBlock): number {
  switch (block.tag) {
    case DisplayIdDataBlockTag.DisplayParameters:
      return isDisplayParametersPayloadLengthValid(block.payloadLength)
        ? encodeDisplayParametersFlags(block as DisplayIdDisplayParametersBlock)
        : block.flags;
    case DisplayIdDataBlockTag.TypeVIIDetailedTiming:
      return encodeTypeViiTimingFlags(block as DisplayIdTypeViiTimingBlock);
    case DisplayIdDataBlockTag.TypeVIIIEnumeratedTimingCode:
      return encodeTypeViiiTimingFlags(block as DisplayIdTypeViiiTimingBlock);
    case DisplayIdDataBlockTag.TypeXFormulaBasedTiming:
      return encodeTypeXTimingFlags(block as DisplayIdTypeXTimingBlock);
    case DisplayIdDataBlockTag.StereoDisplayInterface:
      return isStereoPayloadLengthValid(block.payloadLength)
        ? encodeStereoInterfaceFlags(block as DisplayIdStereoInterfaceBlock)
        : block.flags;
    case DisplayIdDataBlockTag.AdaptiveSync:
      return encodeAdaptiveSyncFlags(block as DisplayIdAdaptiveSyncBlock);
    default:
      return block.flags;
  }
}
