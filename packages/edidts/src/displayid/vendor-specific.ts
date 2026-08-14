/**
 * 4.12 Vendor-specific Data Block (tag 7Eh) and 4.13 CTA-861 Data Block
 * Encapsulation DisplayID Data Block (tag 81h), DisplayID v2.1a.
 */

import { formatIeeeOui, readUint24, writeUint24 } from './bytes';
import {
  DisplayIdDataBlockTag,
  type DisplayIdCtaEncapsulationBlock,
  type DisplayIdDataBlock,
  type DisplayIdEncapsulatedCtaBlock,
  type DisplayIdVendorSpecificBlock,
} from './types';

export const VENDOR_SPECIFIC_MIN_PAYLOAD_LENGTH = 3;

/** OUI assigned to VESA, used by the Appendix B DisplayPort structure. */
export const VESA_IEEE_OUI_BYTES = [0x3a, 0x02, 0x92] as const;

export function isVendorSpecificPayloadLengthValid(payloadLength: number): boolean {
  return payloadLength >= VENDOR_SPECIFIC_MIN_PAYLOAD_LENGTH;
}

export function decodeVendorSpecificBlock(block: DisplayIdDataBlock): DisplayIdVendorSpecificBlock {
  const ieeeOui = readUint24(block.payload, 0);

  return {
    ...block,
    tag: DisplayIdDataBlockTag.VendorSpecific,
    ieeeOui,
    ieeeOuiText: formatIeeeOui(ieeeOui),
    vendorData: block.payload.slice(VENDOR_SPECIFIC_MIN_PAYLOAD_LENGTH),
  };
}

export function encodeVendorSpecificBlock(block: DisplayIdVendorSpecificBlock): Uint8Array {
  const payload = new Uint8Array(VENDOR_SPECIFIC_MIN_PAYLOAD_LENGTH + block.vendorData.length);

  writeUint24(payload, 0, block.ieeeOui);
  payload.set(block.vendorData, VENDOR_SPECIFIC_MIN_PAYLOAD_LENGTH);

  return payload;
}

/**
 * Table 4-58: each encapsulated CTA block reuses the CTA-861 header byte
 * layout, tag in bits 7:5 and length in bits 4:0.
 */
export function decodeCtaEncapsulationBlock(block: DisplayIdDataBlock): DisplayIdCtaEncapsulationBlock {
  const ctaBlocks: DisplayIdEncapsulatedCtaBlock[] = [];
  let offset = 0;

  while (offset < block.payload.length) {
    const header = block.payload[offset];
    const length = header & 0x1f;
    if (offset + 1 + length > block.payload.length) break;

    ctaBlocks.push({
      ctaTag: (header >> 5) & 0x07,
      length,
      payload: block.payload.slice(offset + 1, offset + 1 + length),
    });

    offset += 1 + length;
    if (length === 0 && header === 0) break;
  }

  return {
    ...block,
    tag: DisplayIdDataBlockTag.CtaDataBlockEncapsulation,
    ctaBlocks,
  };
}

export function encodeCtaEncapsulationBlock(block: DisplayIdCtaEncapsulationBlock): Uint8Array {
  const length = block.ctaBlocks.reduce((total, cta) => total + 1 + cta.payload.length, 0);
  const payload = new Uint8Array(length);
  let offset = 0;

  for (const cta of block.ctaBlocks) {
    payload[offset] = ((cta.ctaTag & 0x07) << 5) | (cta.payload.length & 0x1f);
    payload.set(cta.payload, offset + 1);
    offset += 1 + cta.payload.length;
  }

  return payload;
}
