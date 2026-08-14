/**
 * 4.7 Tiled Display Topology Data Block (tag 28h), DisplayID v2.1a.
 */

import { formatIeeeOui, readUint16, readUint24, readUint32, writeUint16, writeUint24, writeUint32 } from './bytes';
import {
  DisplayIdDataBlockTag,
  type DisplayIdDataBlock,
  type DisplayIdTiledDisplayBlock,
} from './types';

export const TILED_DISPLAY_PAYLOAD_LENGTH = 22;

export function isTiledDisplayPayloadLengthValid(payloadLength: number): boolean {
  return payloadLength >= TILED_DISPLAY_PAYLOAD_LENGTH;
}

export function decodeTiledDisplayBlock(block: DisplayIdDataBlock): DisplayIdTiledDisplayBlock {
  const payload = block.payload;
  const capabilities = payload[0] ?? 0;
  const countLowBits = payload[1] ?? 0;
  const locationLowBits = payload[2] ?? 0;
  const highBits = payload[3] ?? 0;
  const ieeeOui = readUint24(payload, 13);

  return {
    ...block,
    tag: DisplayIdDataBlockTag.TiledDisplayTopology,
    singleTileBehavior: capabilities & 0x07,
    multiTileBehavior: (capabilities >> 3) & 0x03,
    hasBezelInformation: (capabilities & 0x40) !== 0,
    singleEnclosure: (capabilities & 0x80) !== 0,
    // Tile counts and locations are stored as (value − 1) split across two bytes.
    totalVerticalTiles: (countLowBits & 0x0f) + (((highBits >> 4) & 0x03) << 4) + 1,
    totalHorizontalTiles: ((countLowBits >> 4) & 0x0f) + (((highBits >> 6) & 0x03) << 4) + 1,
    verticalTileLocation: (locationLowBits & 0x0f) + ((highBits & 0x03) << 4) + 1,
    horizontalTileLocation: ((locationLowBits >> 4) & 0x0f) + (((highBits >> 2) & 0x03) << 4) + 1,
    horizontalTileSize: readUint16(payload, 4) + 1,
    verticalTileSize: readUint16(payload, 6) + 1,
    pixelMultiplier: payload[8] ?? 0,
    topBezelSize: payload[9] ?? 0,
    bottomBezelSize: payload[10] ?? 0,
    rightBezelSize: payload[11] ?? 0,
    leftBezelSize: payload[12] ?? 0,
    ieeeOui,
    ieeeOuiText: formatIeeeOui(ieeeOui),
    productId: readUint16(payload, 16),
    serialNumber: readUint32(payload, 18),
  };
}

export function encodeTiledDisplayBlock(block: DisplayIdTiledDisplayBlock): Uint8Array {
  const payload = new Uint8Array(TILED_DISPLAY_PAYLOAD_LENGTH);

  let capabilities = block.singleTileBehavior & 0x07;
  capabilities |= (block.multiTileBehavior & 0x03) << 3;
  if (block.hasBezelInformation) capabilities |= 0x40;
  if (block.singleEnclosure) capabilities |= 0x80;
  payload[0] = capabilities;

  const totalVertical = Math.max(1, block.totalVerticalTiles) - 1;
  const totalHorizontal = Math.max(1, block.totalHorizontalTiles) - 1;
  const locationVertical = Math.max(1, block.verticalTileLocation) - 1;
  const locationHorizontal = Math.max(1, block.horizontalTileLocation) - 1;

  payload[1] = (totalVertical & 0x0f) | ((totalHorizontal & 0x0f) << 4);
  payload[2] = (locationVertical & 0x0f) | ((locationHorizontal & 0x0f) << 4);
  payload[3] =
    ((locationVertical >> 4) & 0x03) |
    (((locationHorizontal >> 4) & 0x03) << 2) |
    (((totalVertical >> 4) & 0x03) << 4) |
    (((totalHorizontal >> 4) & 0x03) << 6);

  writeUint16(payload, 4, Math.max(0, block.horizontalTileSize - 1));
  writeUint16(payload, 6, Math.max(0, block.verticalTileSize - 1));
  payload[8] = block.pixelMultiplier & 0xff;
  payload[9] = block.topBezelSize & 0xff;
  payload[10] = block.bottomBezelSize & 0xff;
  payload[11] = block.rightBezelSize & 0xff;
  payload[12] = block.leftBezelSize & 0xff;
  writeUint24(payload, 13, block.ieeeOui);
  writeUint16(payload, 16, block.productId);
  writeUint32(payload, 18, block.serialNumber);

  return payload;
}
