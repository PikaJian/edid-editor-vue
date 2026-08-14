import { decodeDisplayIdBlocks, encodeDisplayIdBlock } from './blocks';
import { checksum8, isChecksum8Valid } from '../common/checksum';
import { DisplayIdDecodeError, type DisplayIdSection } from './types';

const HEADER_LENGTH = 4;
const CHECKSUM_LENGTH = 1;
const MIN_SECTION_LENGTH = HEADER_LENGTH + CHECKSUM_LENGTH;
/** Byte 00h[7:4] holds the structure version (Tables 2-3 and 2-4). */
const DISPLAY_ID_STRUCTURE_VERSION_1 = 1;
const DISPLAY_ID_STRUCTURE_VERSION_2 = 2;

export function decodeDisplayIdSection(data: Uint8Array): DisplayIdSection {
  if (data.length < MIN_SECTION_LENGTH) {
    throw new DisplayIdDecodeError(
      `DisplayID section requires at least ${MIN_SECTION_LENGTH} bytes but only ${data.length} bytes are available`,
    );
  }

  const versionByte = data[0];
  const bytesInSection = data[1];
  const totalLength = bytesInSection + HEADER_LENGTH + CHECKSUM_LENGTH;

  if (data.length < totalLength) {
    throw new DisplayIdDecodeError(
      `DisplayID section declares ${totalLength} bytes but only ${data.length} bytes are available`,
    );
  }

  const sectionBytes = data.slice(0, totalLength);
  const isChecksumValid = isChecksum8Valid(sectionBytes);

  // Only the version nibble is checked. The DisplayID *document* revision (2.1,
  // 2.1a) advances independently of the structure revision in byte 00h[3:0],
  // and blocks carry their own revision, so rejecting a nonzero structure
  // revision here would drop otherwise-parseable sections.
  //
  // v1.x sections are accepted as well: monitors still expose DisplayID v1.2 as
  // an EDID extension, sometimes as the only DisplayID section present. They
  // share this framing and differ in the data block tag space.
  const structureVersion = versionByte >> 4;
  if (
    structureVersion !== DISPLAY_ID_STRUCTURE_VERSION_1 &&
    structureVersion !== DISPLAY_ID_STRUCTURE_VERSION_2
  ) {
    throw new DisplayIdDecodeError(
      `DisplayID section version byte 0x${versionByte.toString(16).padStart(2, '0')} is not a v1.x or v2.x structure`,
    );
  }

  const decodedBlocks = decodeDisplayIdBlocks(
    sectionBytes,
    HEADER_LENGTH,
    totalLength - CHECKSUM_LENGTH,
    structureVersion,
  );

  return {
    version: versionByte >> 4,
    revision: versionByte & 0x0f,
    versionByte,
    bytesInSection,
    totalLength,
    primaryUseCase: sectionBytes[2],
    extensionCount: sectionBytes[3],
    blocks: decodedBlocks.blocks,
    fillBytes: decodedBlocks.fillBytes,
    checksum: sectionBytes[totalLength - 1],
    isChecksumValid,
  };
}

/**
 * @param minimumLength Pads the section with fill bytes so it is at least this
 *   many bytes long. EDID Extension Sections are a fixed 126 bytes (v2.1a
 *   Section 2.1); a section whose blocks already exceed the target keeps its
 *   natural length rather than silently dropping a block.
 */
export function encodeDisplayIdSection(section: DisplayIdSection, minimumLength = 0): Uint8Array {
  const encodedBlocks = section.blocks.map(encodeDisplayIdBlock);
  const blockLength = encodedBlocks.reduce((length, block) => length + block.length, 0);
  const minimumFill = minimumLength - HEADER_LENGTH - CHECKSUM_LENGTH - blockLength;
  const fillBytes = Math.max(section.fillBytes, minimumFill, 0);
  const bytesInSection = blockLength + fillBytes;
  const totalLength = bytesInSection + HEADER_LENGTH + CHECKSUM_LENGTH;
  const encoded = new Uint8Array(totalLength);

  encoded[0] = section.versionByte;
  encoded[1] = bytesInSection & 0xff;
  encoded[2] = section.primaryUseCase & 0xff;
  encoded[3] = section.extensionCount & 0xff;

  let offset = HEADER_LENGTH;
  for (const block of encodedBlocks) {
    encoded.set(block, offset);
    offset += block.length;
  }

  encoded[totalLength - 1] = checksum8(encoded);
  return encoded;
}
