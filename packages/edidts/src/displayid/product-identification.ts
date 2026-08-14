/**
 * 4.1 Product Identification Data Block (tag 20h), DisplayID v2.1a.
 */

import {
  decodeAscii,
  encodeAscii,
  formatIeeeOui,
  readUint16,
  readUint24,
  readUint32,
  writeUint24,
  writeUint32,
} from './bytes';
import {
  DisplayIdDataBlockTag,
  type DisplayIdDataBlock,
  type DisplayIdProductIdentificationBlock,
} from './types';

const MIN_PRODUCT_IDENTIFICATION_PAYLOAD_LENGTH = 12;

/** Table 4-5: FFh in the week field means the year field carries a model year. */
const MODEL_YEAR_TAG = 0xff;

export function decodeProductIdentificationBlock(block: DisplayIdDataBlock): DisplayIdProductIdentificationBlock {
  const payload = block.payload;
  const productNameLength = payload[11] ?? 0;
  const productNameBytes = payload.slice(12, 12 + productNameLength);
  const serialNumber = readUint32(payload, 5);
  const weekByte = payload[9] ?? 0;
  const yearByte = payload[10] ?? 0;
  const ieeeOui = readUint24(payload, 0);

  return {
    ...block,
    tag: DisplayIdDataBlockTag.ProductIdentification,
    ieeeOui,
    ieeeOuiText: formatIeeeOui(ieeeOui),
    productId: readUint16(payload, 3),
    serialNumber: serialNumber === 0 ? undefined : serialNumber,
    manufactureWeek: weekByte === 0 || weekByte === MODEL_YEAR_TAG ? undefined : weekByte,
    year: yearByte === 0 ? undefined : 2000 + yearByte,
    isModelYear: weekByte === MODEL_YEAR_TAG,
    productNameLength,
    productNameBytes,
    productName: decodeAscii(productNameBytes),
  };
}

export function encodeProductIdentificationBlock(block: DisplayIdProductIdentificationBlock): Uint8Array {
  const productNameBytes = block.productNameBytes.length > 0
    ? block.productNameBytes
    : encodeAscii(block.productName);
  const payload = new Uint8Array(MIN_PRODUCT_IDENTIFICATION_PAYLOAD_LENGTH + productNameBytes.length);

  writeUint24(payload, 0, block.ieeeOui);
  payload[3] = block.productId & 0xff;
  payload[4] = (block.productId >> 8) & 0xff;
  writeUint32(payload, 5, block.serialNumber ?? 0);
  payload[9] = block.isModelYear ? MODEL_YEAR_TAG : block.manufactureWeek ?? 0;
  payload[10] = block.year === undefined ? 0 : Math.max(0, block.year - 2000) & 0xff;
  payload[11] = productNameBytes.length & 0xff;
  payload.set(productNameBytes, 12);

  return payload;
}

export function isProductIdentificationPayloadLengthValid(payloadLength: number): boolean {
  return payloadLength >= MIN_PRODUCT_IDENTIFICATION_PAYLOAD_LENGTH;
}
