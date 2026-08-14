/**
 * 4.8 ContainerID Data Block (tag 29h), DisplayID v2.1a.
 */

import {
  DisplayIdDataBlockTag,
  type DisplayIdContainerIdBlock,
  type DisplayIdDataBlock,
} from './types';

export const CONTAINER_ID_PAYLOAD_LENGTH = 16;

/** Byte group lengths of the canonical 8-4-4-4-12 UUID rendering. */
const UUID_GROUPS = [4, 2, 2, 2, 6] as const;

export function isContainerIdPayloadLengthValid(payloadLength: number): boolean {
  return payloadLength >= CONTAINER_ID_PAYLOAD_LENGTH;
}

/**
 * Renders the UUID as 11223344-5566-7788-99AA-BBCCDDEEFF00, matching 4.8.1.
 *
 * The spec treats the 16 bytes as an opaque value stored first byte first, so
 * no group is byte-swapped.
 */
export function formatContainerId(uuid: Uint8Array): string {
  const hex = Array.from(uuid, (byte) => byte.toString(16).toUpperCase().padStart(2, '0'));
  const groups: string[] = [];
  let offset = 0;

  for (const length of UUID_GROUPS) {
    groups.push(hex.slice(offset, offset + length).join(''));
    offset += length;
  }

  return groups.join('-');
}

export function decodeContainerIdBlock(block: DisplayIdDataBlock): DisplayIdContainerIdBlock {
  const uuid = block.payload.slice(0, CONTAINER_ID_PAYLOAD_LENGTH);

  return {
    ...block,
    tag: DisplayIdDataBlockTag.ContainerId,
    uuid,
    uuidText: formatContainerId(uuid),
  };
}

export function encodeContainerIdBlock(block: DisplayIdContainerIdBlock): Uint8Array {
  const payload = new Uint8Array(CONTAINER_ID_PAYLOAD_LENGTH);
  payload.set(block.uuid.slice(0, CONTAINER_ID_PAYLOAD_LENGTH));
  return payload;
}
