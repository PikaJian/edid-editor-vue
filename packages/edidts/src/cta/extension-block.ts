/**
 * Extension Blocks
 * 
 * Handles encoding and decoding of EDID extension blocks per VESA E-EDID A2.
 * Each extension block is 128 bytes.
 * 
 * CTA-861-G Extended Tag blocks are also supported.
 */

import {
  decodeExtendedDataBlock,
  encodeExtendedDataBlock,
  type CTAExtendedDataBlock,
  type HfEeodbDataBlock,
} from './cta-extended-blocks';
import {
  DetailedTimingDescriptor,
  decodeEdidCtaDetailedTiming,
  encodeEdidCtaDetailedTiming,
  type DetailedTiming,
  type DetailedTimingInput,
  type TimingFlags,
} from '../common/detailed-timing-descriptor';
import {
  decodeVideoTimingBlock,
  encodeVideoTimingBlock,
  type VideoTimingBlock as VTBExtensionBlock,
  type VideoTimingBlockDetailedTiming as VTBDetailedTiming,
} from '../common/video-timing-block';
import { checksum8 } from '../common/checksum';
import {
  decodeDisplayIdSection,
  encodeDisplayIdSection,
  type DisplayIdSection,
} from '../displayid';

export type { VTBExtensionBlock, VTBDetailedTiming };

/** Bytes 1 through 126 of a DisplayID EDID Extension Block (v2.1a Section 2.1). */
const DISPLAY_ID_EDID_SECTION_LENGTH = 126;

/**
 * Shortest legal Sink Capability Data Structure (HDMI 2.1b Table 10-7 notes:
 * "The minimum length of the SCDS is 4"). The model covers PB1 through PB6,
 * but a shorter block is valid and must not be padded out to that.
 */
const HF_VSDB_MIN_SCDS_BYTES = 4;

/** Shortest legal H14b-VSDB payload: the two Source Physical Address bytes. */
const H14B_VSDB_MIN_PAYLOAD_BYTES = 2;

/** H14b-VSDB flags-byte bits this model owns; 0Fh holds latency-present flags. */
const H14B_VSDB_FLAGS_MODELLED = 0xF8;

/**
 * Reads the HDMI Forum EDID Extension Override Data Block, if the CEA
 * extension carries one.
 *
 * Per HDMI 2.1 section 10.3.6 an EDID with more than one extension block keeps
 * base block byte 126 at 1 — so sources that only read two blocks still see a
 * consistent EDID — and states the real count in this block instead. It is
 * therefore the authoritative extension count whenever it is present.
 */
export function getHfEeodbCount(block: ExtensionBlock | null | undefined): number | null {
  if (!block || block.tag !== 0x02) return null;

  const cea = block as CEAExtensionBlock;
  const eeodb = cea.dataBlocks.find(
    b => b.tag === 0x07 && (b as { extendedTag?: number }).extendedTag === 0x78,
  ) as HfEeodbDataBlock | undefined;

  return eeodb?.extensionBlockCount ?? null;
}

export type ExtensionTag = 
  | 0x02  // CEA-861 Extension
  | 0x10  // Video Timing Block Extension
  | 0x40  // Display Information Extension
  | 0x50  // Localized String Extension
  | 0x60  // Digital Packet Video Link Extension
  | 0x70  // DisplayID Extension
  | 0xF0  // Extension Block Map
  | 0xFF  // Manufacturer Defined
  | number;

export interface BaseExtensionBlock {
  tag: ExtensionTag;
  revision: number;
  checksum: number;
  data: Uint8Array;
}

/**
 * CEA-861 Extension Block (Tag 0x02)
 * Used for HDMI, audio, and additional video capabilities
 */
export interface CEAExtensionBlock extends BaseExtensionBlock {
  tag: 0x02;
  dtdOffset: number; // Offset to detailed timing descriptors
  underscan: boolean;
  basicAudio: boolean;
  ycbcr444: boolean;
  ycbcr422: boolean;
  nativeFormats: number;
  dataBlocks: CEADataBlock[];
  detailedTimings: CEADetailedTiming[];
}

export type CEADataBlockTag = 
  | 0x01  // Audio Data Block
  | 0x02  // Video Data Block
  | 0x03  // Vendor Specific Data Block
  | 0x04  // Speaker Allocation Data Block
  | 0x05  // VESA Display Transfer Characteristic
  | 0x07; // Extended Tag

export interface CEADataBlock {
  tag: CEADataBlockTag;
  data: Uint8Array;
}

export interface AudioDataBlock extends CEADataBlock {
  tag: 0x01;
  descriptors: Array<{
    format: number;
    channels: number;
    samplingRates: {
      sr32kHz: boolean;
      sr44_1kHz: boolean;
      sr48kHz: boolean;
      sr88_2kHz: boolean;
      sr96kHz: boolean;
      sr176_4kHz: boolean;
      sr192kHz: boolean;
    };
    bitDepths?: { // For LPCM
      bd16: boolean;
      bd20: boolean;
      bd24: boolean;
    };
    maxBitrate?: number; // For compressed formats, in kHz
  }>;
}

export interface VideoDataBlock extends CEADataBlock {
  tag: 0x02;
  vics: Array<{
    vic: number;
    native: boolean;
  }>;
}

export interface VendorSpecificDataBlock extends CEADataBlock {
  tag: 0x03;
  ieeeOui: number; // 24-bit IEEE OUI
  payload: Uint8Array;
  // HDMI 1.4 Vendor Specific (OUI = 0x000C03)
  hdmi?: {
    sourcePhysicalAddress: [number, number, number, number];
    supportsAI: boolean;
    dcY444: boolean;
    dc30bit: boolean;
    dc36bit: boolean;
    dc48bit: boolean;
    maxTmdsClockMHz: number;
  };
  /**
   * HDMI Forum Vendor Specific Data Block (OUI = 0xC45DD8).
   *
   * Fields follow the Sink Capability Data Structure of HDMI 2.1b Table 10-7,
   * named PB1 through PB10 there. Everything from PB5 on is optional: a Sink
   * may declare an SCDS as short as 4 bytes, so the later groups are undefined
   * when the block does not reach them.
   */
  hdmiForum?: {
    version: number;              // PB1
    maxTmdsCharacterRate: number; // PB2, in MHz (0 = use the H14b-VSDB value)
    // PB3
    scdc: boolean;               // SCDC_Present
    rr: boolean;                 // RR_Capable
    cableStatus: boolean;        // CABLE_STATUS
    ccbpci: boolean;             // CCBPCI
    lte340McscScramble: boolean; // LTE_340Mcsc_scramble
    independentView: boolean;    // Independent_View
    dualView: boolean;           // Dual_View
    osd3d: boolean;              // 3D_OSD_Disparity
    // PB4
    maxFrlRate: number;          // Max_FRL_Rate, bits 7:4
    uhdVic: boolean;             // UHD_VIC
    dc48bit420: boolean;         // DC_48bit_420
    dc36bit420: boolean;         // DC_36bit_420
    dc30bit420: boolean;         // DC_30bit_420
    // PB5
    fapaEndExtended?: boolean;   // FAPA_End_Extended
    qms?: boolean;               // QMS
    mDelta?: boolean;            // MDelta
    /** Deprecated by HDMI 2.1b; the spec requires this to be cleared. */
    cinemaVrr?: boolean;
    negMvrr?: boolean;           // NEG_MVRR
    fva?: boolean;               // FVA
    allm?: boolean;              // ALLM
    fapaStartLocation?: boolean; // FAPA_start_location
    /** PB6/PB7. A range of 0 means the Sink declares no VRR support. */
    vrrMin?: number;
    vrrMax?: number;
    /** PB8 through PB10, present only on an SCDS that reaches them. */
    dsc?: {
      dsc1p2: boolean;
      native420: boolean;
      qmsTfrMax: boolean;
      qmsTfrMin: boolean;
      allBpp: boolean;
      bpc16: boolean;
      bpc12: boolean;
      bpc10: boolean;
      maxFrlRate: number;
      maxSlices: number;
      totalChunkKBytes: number;
    };
  };
}

export interface SpeakerAllocationBlock extends CEADataBlock {
  tag: 0x04;
  speakers: {
    frontLeftRight: boolean;
    lfe: boolean;
    frontCenter: boolean;
    rearLeftRight: boolean;
    rearCenter: boolean;
    frontLeftRightCenter: boolean;
    rearLeftRightCenter: boolean;
    frontLeftRightWide: boolean;
    frontLeftRightHigh: boolean;
    topCenter: boolean;
    frontCenterHigh: boolean;
  };
}

/**
 * VESA Display Transfer Characteristic Data Block (Tag 5)
 * Contains gamma curve data for the display
 */
export interface VESADisplayTransferCharacteristicBlock extends CEADataBlock {
  tag: 0x05;
  transferType: 'white' | 'red' | 'green' | 'blue';
  numEntries: number; // 8, 16, 32, or 48
  gammaValues: number[]; // Normalized gamma values (0-1)
}

export interface CEADetailedTiming {
  pixelClock: number;
  horizontalActive: number;
  horizontalBlanking: number;
  verticalActive: number;
  verticalBlanking: number;
  horizontalSyncOffset: number;
  horizontalSyncWidth: number;
  verticalSyncOffset: number;
  verticalSyncWidth: number;
  interlaced: boolean;
  horizontalImageSize?: number;
  verticalImageSize?: number;
  horizontalBorder?: number;
  verticalBorder?: number;
  flags?: Partial<TimingFlags>;
}

/**
 * Block Map Extension (Tag 0xF0)
 * Required when there is more than one extension block
 */
export interface BlockMapExtension extends BaseExtensionBlock {
  tag: 0xF0;
  blockTags: number[]; // Up to 126 extension block tags
}

/**
 * DisplayID Extension Block (Tag 0x70)
 *
 * Per DisplayID v2.1a Section 2.1, the 128 bytes are the 0x70 tag, a 126-byte
 * fixed-length DisplayID Section, and the EDID extension checksum. The
 * DisplayID Section carries its own checksum, so the two are validated
 * independently.
 */
export interface DisplayIDExtensionBlock extends BaseExtensionBlock {
  tag: 0x70;
  section: DisplayIdSection | null;
  /** Why the section failed to parse, when `section` is null. */
  sectionError: string | null;
}

export type ExtensionBlock =
  | CEAExtensionBlock
  | VTBExtensionBlock
  | BlockMapExtension
  | DisplayIDExtensionBlock
  | BaseExtensionBlock;

export class ExtensionBlockParser {
  /**
   * Decode an extension block from 128 bytes
   */
  static decode(data: Uint8Array): ExtensionBlock | null {
    if (data.length < 128) return null;

    const tag = data[0] as ExtensionTag;
    const revision = data[1];
    const checksum = data[127];

    const base: BaseExtensionBlock = {
      tag,
      revision,
      checksum,
      data: data.slice(2, 127),
    };

    switch (tag) {
      case 0x02:
        return this.decodeCEA(data, base);
      case 0x10:
        return this.decodeVTB(data, base);
      case 0x70:
        return this.decodeDisplayID(data, base);
      case 0xF0:
        return this.decodeBlockMap(data, base);
      default:
        return base;
    }
  }

  /**
   * Encode an extension block to 128 bytes
   */
  static encode(block: ExtensionBlock): Uint8Array {
    const bytes = new Uint8Array(128);
    bytes[0] = block.tag;
    bytes[1] = block.revision;

    switch (block.tag) {
      case 0x02:
        this.encodeCEA(bytes, block as CEAExtensionBlock);
        break;
      case 0x10:
        bytes.set(encodeVideoTimingBlock(block as VTBExtensionBlock).slice(2, 127), 2);
        break;
      case 0x70:
        this.encodeDisplayID(bytes, block as DisplayIDExtensionBlock);
        break;
      case 0xF0:
        this.encodeBlockMap(bytes, block as BlockMapExtension);
        break;
      default:
        bytes.set(block.data.slice(0, 125), 2);
    }

    bytes[127] = checksum8(bytes, 127);
    return bytes;
  }

  private static decodeCEA(data: Uint8Array, base: BaseExtensionBlock): CEAExtensionBlock {
    const dtdOffset = data[2];
    const flags = data[3];

    const cea: CEAExtensionBlock = {
      ...base,
      tag: 0x02,
      dtdOffset,
      underscan: (flags & 0x80) !== 0,
      basicAudio: (flags & 0x40) !== 0,
      ycbcr444: (flags & 0x20) !== 0,
      ycbcr422: (flags & 0x10) !== 0,
      nativeFormats: flags & 0x0F,
      dataBlocks: [],
      detailedTimings: [],
    };

    // Parse data blocks (from offset 4 to dtdOffset)
    if (dtdOffset > 4) {
      let offset = 4;
      while (offset < dtdOffset && offset < 127) {
        const header = data[offset];
        const blockTag = (header >> 5) & 0x07;
        const blockLength = header & 0x1F;
        
        if (offset + 1 + blockLength > dtdOffset) break;

        const blockData = data.slice(offset + 1, offset + 1 + blockLength);
        
        const block = this.decodeCEADataBlock(blockTag as CEADataBlockTag, blockData);
        if (block) {
          cea.dataBlocks.push(block);
        }

        offset += 1 + blockLength;
      }
    }

    // Parse detailed timings (from dtdOffset to end, each 18 bytes)
    if (dtdOffset > 0 && dtdOffset < 127) {
      let offset = dtdOffset;
      while (offset + 18 <= 127) {
        const pixelClock = (data[offset + 1] << 8) | data[offset];
        if (pixelClock === 0) break; // No more timings

        const timing = decodeEdidCtaDetailedTiming(data.slice(offset, offset + 18));
        if (!timing) break;
        cea.detailedTimings.push(this.toCEADetailedTiming(timing));

        offset += 18;
      }
    }

    return cea;
  }

  private static decodeCEADataBlock(tag: CEADataBlockTag, data: Uint8Array): CEADataBlock | CTAExtendedDataBlock | null {
    switch (tag) {
      case 0x01: // Audio Data Block
        return this.decodeAudioDataBlock(data);
      case 0x02: // Video Data Block
        return this.decodeVideoDataBlock(data);
      case 0x03: // Vendor Specific Data Block
        return this.decodeVendorSpecificBlock(data);
      case 0x04: // Speaker Allocation
        return this.decodeSpeakerAllocationBlock(data);
      case 0x05: // VESA Display Transfer Characteristic
        return this.decodeVESADisplayTransferBlock(data);
      case 0x07: // Extended Tag Block (CTA-861-G)
        return decodeExtendedDataBlock(data);
      default:
        return { tag, data };
    }
  }

  private static decodeAudioDataBlock(data: Uint8Array): AudioDataBlock {
    const descriptors: AudioDataBlock['descriptors'] = [];
    
    for (let i = 0; i + 3 <= data.length; i += 3) {
      const format = (data[i] >> 3) & 0x0F;
      const channels = (data[i] & 0x07) + 1;
      const rates = data[i + 1];
      
      const descriptor: AudioDataBlock['descriptors'][0] = {
        format,
        channels,
        samplingRates: {
          sr32kHz: (rates & 0x01) !== 0,
          sr44_1kHz: (rates & 0x02) !== 0,
          sr48kHz: (rates & 0x04) !== 0,
          sr88_2kHz: (rates & 0x08) !== 0,
          sr96kHz: (rates & 0x10) !== 0,
          sr176_4kHz: (rates & 0x20) !== 0,
          sr192kHz: (rates & 0x40) !== 0,
        },
      };

      if (format === 1) { // LPCM
        descriptor.bitDepths = {
          bd16: (data[i + 2] & 0x01) !== 0,
          bd20: (data[i + 2] & 0x02) !== 0,
          bd24: (data[i + 2] & 0x04) !== 0,
        };
      } else if (format >= 2 && format <= 8) {
        descriptor.maxBitrate = data[i + 2] * 8;
      }

      descriptors.push(descriptor);
    }

    return { tag: 0x01, data, descriptors };
  }

  private static decodeVideoDataBlock(data: Uint8Array): VideoDataBlock {
    const vics: VideoDataBlock['vics'] = [];
    
    for (let i = 0; i < data.length; i++) {
      const byte = data[i];
      vics.push({
        vic: byte & 0x7F,
        native: (byte & 0x80) !== 0,
      });
    }

    return { tag: 0x02, data, vics };
  }

  private static decodeVendorSpecificBlock(data: Uint8Array): VendorSpecificDataBlock {
    if (data.length < 3) {
      return { tag: 0x03, data, ieeeOui: 0, payload: new Uint8Array() };
    }

    const ieeeOui = data[0] | (data[1] << 8) | (data[2] << 16);
    const payload = data.slice(3);

    const block: VendorSpecificDataBlock = {
      tag: 0x03,
      data,
      ieeeOui,
      payload,
    };

    // HDMI Vendor Specific (OUI 0x000C03)
    if (ieeeOui === 0x000C03 && payload.length >= 2) {
      const physAddr = payload[0] << 8 | payload[1];
      block.hdmi = {
        sourcePhysicalAddress: [
          (physAddr >> 12) & 0x0F,
          (physAddr >> 8) & 0x0F,
          (physAddr >> 4) & 0x0F,
          physAddr & 0x0F,
        ],
        supportsAI: payload.length >= 3 && (payload[2] & 0x80) !== 0,
        dcY444: payload.length >= 3 && (payload[2] & 0x08) !== 0,
        dc30bit: payload.length >= 3 && (payload[2] & 0x10) !== 0,
        dc36bit: payload.length >= 3 && (payload[2] & 0x20) !== 0,
        dc48bit: payload.length >= 3 && (payload[2] & 0x40) !== 0,
        maxTmdsClockMHz: payload.length >= 4 ? payload[3] * 5 : 0,
      };
    }

    // HDMI Forum Vendor Specific (OUI 0xC45DD8). The payload is the Sink
    // Capability Data Structure, PB1..PB28 of HDMI 2.1b Table 10-7.
    if (ieeeOui === 0xC45DD8 && payload.length >= 4) {
      const pb = (n: number): number => payload[n - 1] ?? 0;
      const pb3 = pb(3);
      const pb4 = pb(4);

      block.hdmiForum = {
        version: pb(1),
        maxTmdsCharacterRate: pb(2) * 5,

        scdc: (pb3 & 0x80) !== 0,
        rr: (pb3 & 0x40) !== 0,
        cableStatus: (pb3 & 0x20) !== 0,
        ccbpci: (pb3 & 0x10) !== 0,
        lte340McscScramble: (pb3 & 0x08) !== 0,
        independentView: (pb3 & 0x04) !== 0,
        dualView: (pb3 & 0x02) !== 0,
        osd3d: (pb3 & 0x01) !== 0,

        maxFrlRate: (pb4 >> 4) & 0x0F,
        uhdVic: (pb4 & 0x08) !== 0,
        dc48bit420: (pb4 & 0x04) !== 0,
        dc36bit420: (pb4 & 0x02) !== 0,
        dc30bit420: (pb4 & 0x01) !== 0,
      };

      if (payload.length >= 5) {
        const pb5 = pb(5);
        block.hdmiForum.fapaEndExtended = (pb5 & 0x80) !== 0;
        block.hdmiForum.qms = (pb5 & 0x40) !== 0;
        block.hdmiForum.mDelta = (pb5 & 0x20) !== 0;
        block.hdmiForum.cinemaVrr = (pb5 & 0x10) !== 0;
        block.hdmiForum.negMvrr = (pb5 & 0x08) !== 0;
        block.hdmiForum.fva = (pb5 & 0x04) !== 0;
        block.hdmiForum.allm = (pb5 & 0x02) !== 0;
        block.hdmiForum.fapaStartLocation = (pb5 & 0x01) !== 0;
      }

      // VRRMIN is PB6 bits 5:0; VRRMAX spans PB6 bits 7:6 and all of PB7.
      if (payload.length >= 7) {
        block.hdmiForum.vrrMin = pb(6) & 0x3F;
        block.hdmiForum.vrrMax = (((pb(6) >> 6) & 0x03) << 8) | pb(7);
      }

      if (payload.length >= 10) {
        const pb8 = pb(8);
        const pb9 = pb(9);
        block.hdmiForum.dsc = {
          dsc1p2: (pb8 & 0x80) !== 0,
          native420: (pb8 & 0x40) !== 0,
          qmsTfrMax: (pb8 & 0x20) !== 0,
          qmsTfrMin: (pb8 & 0x10) !== 0,
          allBpp: (pb8 & 0x08) !== 0,
          bpc16: (pb8 & 0x04) !== 0,
          bpc12: (pb8 & 0x02) !== 0,
          bpc10: (pb8 & 0x01) !== 0,
          maxFrlRate: (pb9 >> 4) & 0x0F,
          maxSlices: pb9 & 0x0F,
          totalChunkKBytes: pb(10) & 0x3F,
        };
      }
    }

    return block;
  }

  private static decodeSpeakerAllocationBlock(data: Uint8Array): SpeakerAllocationBlock {
    const byte1 = data[0] || 0;
    const byte2 = data[1] || 0;

    return {
      tag: 0x04,
      data,
      speakers: {
        frontLeftRight: (byte1 & 0x01) !== 0,
        lfe: (byte1 & 0x02) !== 0,
        frontCenter: (byte1 & 0x04) !== 0,
        rearLeftRight: (byte1 & 0x08) !== 0,
        rearCenter: (byte1 & 0x10) !== 0,
        frontLeftRightCenter: (byte1 & 0x20) !== 0,
        rearLeftRightCenter: (byte1 & 0x40) !== 0,
        frontLeftRightWide: (byte1 & 0x80) !== 0,
        frontLeftRightHigh: (byte2 & 0x01) !== 0,
        topCenter: (byte2 & 0x02) !== 0,
        frontCenterHigh: (byte2 & 0x04) !== 0,
      },
    };
  }

  private static decodeVESADisplayTransferBlock(data: Uint8Array): VESADisplayTransferCharacteristicBlock {
    if (data.length < 1) {
      return { tag: 0x05, data, transferType: 'white', numEntries: 0, gammaValues: [] };
    }

    const header = data[0];
    const typeCode = (header >> 5) & 0x03;
    const numEntriesCode = (header >> 3) & 0x03;
    
    const typeMap: Record<number, 'white' | 'red' | 'green' | 'blue'> = {
      0: 'white',
      1: 'red',
      2: 'green',
      3: 'blue',
    };
    
    const numEntriesMap: Record<number, number> = {
      0: 8,
      1: 16,
      2: 32,
      3: 48,
    };
    
    const transferType = typeMap[typeCode] ?? 'white';
    const numEntries = numEntriesMap[numEntriesCode] ?? 8;
    
    const gammaValues: number[] = [];
    for (let i = 1; i < data.length && gammaValues.length < numEntries; i++) {
      gammaValues.push(data[i] / 255);
    }
    
    return {
      tag: 0x05,
      data,
      transferType,
      numEntries,
      gammaValues,
    };
  }

  private static decodeVTB(data: Uint8Array, base: BaseExtensionBlock): VTBExtensionBlock {
    return decodeVideoTimingBlock(data, base);
  }

  /**
   * The DisplayID Section occupies bytes 1 through 126, between the extension
   * tag and the EDID checksum (DisplayID v2.1a Section 2.1).
   *
   * A section that fails to parse is reported rather than thrown, so one bad
   * DisplayID extension cannot make the whole EDID unreadable.
   */
  private static decodeDisplayID(data: Uint8Array, base: BaseExtensionBlock): DisplayIDExtensionBlock {
    try {
      return {
        ...base,
        tag: 0x70,
        section: decodeDisplayIdSection(data.slice(1, 127)),
        sectionError: null,
      };
    } catch (error) {
      return {
        ...base,
        tag: 0x70,
        section: null,
        sectionError: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private static encodeDisplayID(bytes: Uint8Array, block: DisplayIDExtensionBlock): void {
    // Without a parsed section the original 125 payload bytes are all we have,
    // and `data` starts at byte 2, so byte 1 has to be restored separately.
    if (!block.section) {
      bytes[1] = block.revision;
      bytes.set(block.data.slice(0, 125), 2);
      return;
    }

    const encoded = encodeDisplayIdSection(block.section, DISPLAY_ID_EDID_SECTION_LENGTH);
    bytes.set(encoded.slice(0, DISPLAY_ID_EDID_SECTION_LENGTH), 1);
  }

  private static decodeBlockMap(data: Uint8Array, base: BaseExtensionBlock): BlockMapExtension {
    const blockTags: number[] = [];
    for (let i = 1; i < 127; i++) {
      if (data[i] !== 0x00) {
        blockTags.push(data[i]);
      }
    }
    return {
      ...base,
      tag: 0xF0,
      blockTags,
    };
  }

  private static encodeCEA(bytes: Uint8Array, cea: CEAExtensionBlock): void {
    let offset = 4;
    for (const block of cea.dataBlocks) {
      const encoded = this.encodeCEADataBlock(block);
      const header = ((block.tag & 0x07) << 5) | (encoded.length & 0x1F);
      bytes[offset] = header;
      bytes.set(encoded, offset + 1);
      offset += 1 + encoded.length;
    }

    const dtdOffset = (cea.detailedTimings.length > 0 || offset > 4) ? offset : 0;
    bytes[2] = dtdOffset;

    for (const timing of cea.detailedTimings) {
      if (offset + 18 > 127) break;
      bytes.set(encodeEdidCtaDetailedTiming(this.toDetailedTimingInput(timing)), offset);
      offset += 18;
    }

    let flags = 0;
    if (cea.underscan) flags |= 0x80;
    if (cea.basicAudio) flags |= 0x40;
    if (cea.ycbcr444) flags |= 0x20;
    if (cea.ycbcr422) flags |= 0x10;
    flags |= cea.nativeFormats & 0x0F;
    bytes[3] = flags;
  }

  private static encodeCEADataBlock(block: CEADataBlock): Uint8Array {
    switch (block.tag) {
      case 0x01:
        return this.encodeAudioDataBlock(block as AudioDataBlock);
      case 0x02:
        return this.encodeVideoDataBlock(block as VideoDataBlock);
      case 0x03:
        return this.encodeVendorSpecificDataBlock(block as VendorSpecificDataBlock);
      case 0x04:
        return this.encodeSpeakerAllocationBlock(block as SpeakerAllocationBlock);
      case 0x07:
        return encodeExtendedDataBlock(block as CTAExtendedDataBlock);
      default:
        return block.data;
    }
  }

  private static encodeAudioDataBlock(block: AudioDataBlock): Uint8Array {
    const bytes: number[] = [];
    for (const desc of block.descriptors) {
      let byte1 = ((desc.format & 0x0F) << 3) | ((desc.channels - 1) & 0x07);
      let byte2 = 0;
      if (desc.samplingRates.sr32kHz) byte2 |= 0x01;
      if (desc.samplingRates.sr44_1kHz) byte2 |= 0x02;
      if (desc.samplingRates.sr48kHz) byte2 |= 0x04;
      if (desc.samplingRates.sr88_2kHz) byte2 |= 0x08;
      if (desc.samplingRates.sr96kHz) byte2 |= 0x10;
      if (desc.samplingRates.sr176_4kHz) byte2 |= 0x20;
      if (desc.samplingRates.sr192kHz) byte2 |= 0x40;
      let byte3 = 0;
      if (desc.format === 1 && desc.bitDepths) {
        if (desc.bitDepths.bd16) byte3 |= 0x01;
        if (desc.bitDepths.bd20) byte3 |= 0x02;
        if (desc.bitDepths.bd24) byte3 |= 0x04;
      } else if (desc.maxBitrate !== undefined) {
        byte3 = Math.round(desc.maxBitrate / 8) & 0xFF;
      }
      bytes.push(byte1, byte2, byte3);
    }
    return new Uint8Array(bytes);
  }

  private static encodeVideoDataBlock(block: VideoDataBlock): Uint8Array {
    const bytes = new Uint8Array(block.vics.length);
    for (let i = 0; i < block.vics.length; i++) {
      bytes[i] = (block.vics[i].native ? 0x80 : 0) | (block.vics[i].vic & 0x7F);
    }
    return bytes;
  }

  private static encodeVendorSpecificDataBlock(block: VendorSpecificDataBlock): Uint8Array {
    const oui = block.ieeeOui & 0xFFFFFF;
    const ouiBytes = [oui & 0xFF, (oui >> 8) & 0xFF, (oui >> 16) & 0xFF];

    if (block.ieeeOui === 0x000C03 && block.hdmi) {
      const h = block.hdmi;
      const physAddr =
        ((h.sourcePhysicalAddress[0] & 0x0F) << 12) |
        ((h.sourcePhysicalAddress[1] & 0x0F) << 8) |
        ((h.sourcePhysicalAddress[2] & 0x0F) << 4) |
        (h.sourcePhysicalAddress[3] & 0x0F);

      let flagsByte = 0;
      if (h.supportsAI) flagsByte |= 0x80;
      if (h.dc48bit) flagsByte |= 0x40;
      if (h.dc36bit) flagsByte |= 0x20;
      if (h.dc30bit) flagsByte |= 0x10;
      if (h.dcY444) flagsByte |= 0x08;

      // H14b section 8.3.2 lets this block run well past the four bytes
      // modelled here — latency fields, HDMI_VIC and the 3D structures all
      // follow — so keep whatever length was decoded and write back only the
      // modelled bytes. Bits 3:0 of the flags byte are likewise not decoded.
      const payload = new Uint8Array(Math.max(H14B_VSDB_MIN_PAYLOAD_BYTES, block.payload.length));
      payload.set(block.payload.slice(0, payload.length));

      payload[0] = (physAddr >> 8) & 0xFF;
      payload[1] = physAddr & 0xFF;
      // Everything past the physical address is optional in H14b.
      if (payload.length > 2) payload[2] = (payload[2] & ~H14B_VSDB_FLAGS_MODELLED) | flagsByte;
      if (payload.length > 3) payload[3] = Math.round(h.maxTmdsClockMHz / 5) & 0xFF;

      return new Uint8Array([...ouiBytes, ...payload]);
    }

    if (block.ieeeOui === 0xC45DD8 && block.hdmiForum) {
      const f = block.hdmiForum;

      // Keep the declared SCDS length: HDMI 2.1b section 10.3.2.1 requires a
      // source to honour it "including any Reserved bytes present at the end",
      // and PB11 onward is reserved space this model does not interpret.
      const scds = new Uint8Array(Math.max(HF_VSDB_MIN_SCDS_BYTES, block.payload.length));
      scds.set(block.payload.slice(0, scds.length));

      scds[0] = f.version & 0xFF;
      scds[1] = Math.round(f.maxTmdsCharacterRate / 5) & 0xFF;

      let pb3 = 0;
      if (f.scdc) pb3 |= 0x80;
      if (f.rr) pb3 |= 0x40;
      if (f.cableStatus) pb3 |= 0x20;
      if (f.ccbpci) pb3 |= 0x10;
      if (f.lte340McscScramble) pb3 |= 0x08;
      if (f.independentView) pb3 |= 0x04;
      if (f.dualView) pb3 |= 0x02;
      if (f.osd3d) pb3 |= 0x01;
      scds[2] = pb3;

      let pb4 = (f.maxFrlRate & 0x0F) << 4;
      if (f.uhdVic) pb4 |= 0x08;
      if (f.dc48bit420) pb4 |= 0x04;
      if (f.dc36bit420) pb4 |= 0x02;
      if (f.dc30bit420) pb4 |= 0x01;
      scds[3] = pb4;

      if (scds.length > 4) {
        let pb5 = 0;
        if (f.fapaEndExtended) pb5 |= 0x80;
        if (f.qms) pb5 |= 0x40;
        if (f.mDelta) pb5 |= 0x20;
        if (f.cinemaVrr) pb5 |= 0x10;
        if (f.negMvrr) pb5 |= 0x08;
        if (f.fva) pb5 |= 0x04;
        if (f.allm) pb5 |= 0x02;
        if (f.fapaStartLocation) pb5 |= 0x01;
        scds[4] = pb5;
      }

      if (scds.length > 6) {
        const vrrMin = f.vrrMin ?? 0;
        const vrrMax = f.vrrMax ?? 0;
        scds[5] = ((vrrMax >> 8) & 0x03) << 6 | (vrrMin & 0x3F);
        scds[6] = vrrMax & 0xFF;
      }

      if (scds.length > 9 && f.dsc) {
        const d = f.dsc;
        let pb8 = 0;
        if (d.dsc1p2) pb8 |= 0x80;
        if (d.native420) pb8 |= 0x40;
        if (d.qmsTfrMax) pb8 |= 0x20;
        if (d.qmsTfrMin) pb8 |= 0x10;
        if (d.allBpp) pb8 |= 0x08;
        if (d.bpc16) pb8 |= 0x04;
        if (d.bpc12) pb8 |= 0x02;
        if (d.bpc10) pb8 |= 0x01;
        scds[7] = pb8;
        scds[8] = ((d.maxFrlRate & 0x0F) << 4) | (d.maxSlices & 0x0F);
        // PB10 bits 7:6 are Reserved(0); keep whatever was decoded there.
        scds[9] = (scds[9] & 0xC0) | (d.totalChunkKBytes & 0x3F);
      }

      return new Uint8Array([...ouiBytes, ...scds]);
    }

    return new Uint8Array([...ouiBytes, ...block.payload]);
  }

  private static encodeSpeakerAllocationBlock(block: SpeakerAllocationBlock): Uint8Array {
    const s = block.speakers;
    let byte1 = 0;
    let byte2 = 0;
    if (s.frontLeftRight) byte1 |= 0x01;
    if (s.lfe) byte1 |= 0x02;
    if (s.frontCenter) byte1 |= 0x04;
    if (s.rearLeftRight) byte1 |= 0x08;
    if (s.rearCenter) byte1 |= 0x10;
    if (s.frontLeftRightCenter) byte1 |= 0x20;
    if (s.rearLeftRightCenter) byte1 |= 0x40;
    if (s.frontLeftRightWide) byte1 |= 0x80;
    if (s.frontLeftRightHigh) byte2 |= 0x01;
    if (s.topCenter) byte2 |= 0x02;
    if (s.frontCenterHigh) byte2 |= 0x04;
    return new Uint8Array([byte1, byte2, 0]);
  }

  private static encodeBlockMap(bytes: Uint8Array, blockMap: BlockMapExtension): void {
    for (let i = 0; i < blockMap.blockTags.length && i < 126; i++) {
      bytes[1 + i] = blockMap.blockTags[i];
    }
  }

  private static toCEADetailedTiming(timing: DetailedTiming): CEADetailedTiming {
    return Object.assign(timing, { interlaced: timing.flags.interlaced });
  }

  private static toDetailedTimingInput(timing: DetailedTimingDescriptor | CEADetailedTiming): DetailedTimingInput {
    if (timing instanceof DetailedTimingDescriptor) {
      if ('interlaced' in timing) {
        timing.flags.interlaced = Boolean(timing.interlaced);
      }
      return timing;
    }

    return {
      pixelClock: timing.pixelClock,
      horizontalActive: timing.horizontalActive,
      horizontalBlanking: timing.horizontalBlanking,
      verticalActive: timing.verticalActive,
      verticalBlanking: timing.verticalBlanking,
      horizontalSyncOffset: timing.horizontalSyncOffset,
      horizontalSyncWidth: timing.horizontalSyncWidth,
      verticalSyncOffset: timing.verticalSyncOffset,
      verticalSyncWidth: timing.verticalSyncWidth,
      horizontalImageSize: timing.horizontalImageSize,
      verticalImageSize: timing.verticalImageSize,
      horizontalBorder: timing.horizontalBorder,
      verticalBorder: timing.verticalBorder,
      flags: {
        ...timing.flags,
        interlaced: timing.flags?.interlaced ?? timing.interlaced,
      },
    };
  }
}

/**
 * Helper to find HDMI vendor specific block (HDMI 1.4)
 */
export function findHDMIBlock(cea: CEAExtensionBlock): VendorSpecificDataBlock | null {
  const vsdb = cea.dataBlocks.find(
    b => b.tag === 0x03 && (b as VendorSpecificDataBlock).ieeeOui === 0x000C03
  );
  return vsdb as VendorSpecificDataBlock ?? null;
}

/**
 * Helper to find HDMI Forum vendor specific block (HDMI 2.0/2.1)
 */
export function findHDMIForumBlock(cea: CEAExtensionBlock): VendorSpecificDataBlock | null {
  const vsdb = cea.dataBlocks.find(
    b => b.tag === 0x03 && (b as VendorSpecificDataBlock).ieeeOui === 0xC45DD8
  );
  return vsdb as VendorSpecificDataBlock ?? null;
}

/**
 * Helper to get supported video formats from CEA
 */
export function getSupportedVICs(cea: CEAExtensionBlock): number[] {
  const vdb = cea.dataBlocks.find(b => b.tag === 0x02) as VideoDataBlock | undefined;
  return vdb?.vics.map(v => v.vic) ?? [];
}

/**
 * Helper to check if display supports HDMI 2.1 features
 */
export function getHDMI21Features(cea: CEAExtensionBlock): {
  vrr: boolean;
  allm: boolean;
  qms: boolean;
  dsc: boolean;
  maxFrlRate: number;
} | null {
  const forum = findHDMIForumBlock(cea);
  if (!forum?.hdmiForum) return null;
  
  const f = forum.hdmiForum;

  return {
    // A Sink declares VRR through the PB6/PB7 range, not a flag bit.
    vrr: (f.vrrMax ?? 0) > 0,
    allm: f.allm === true,
    qms: f.qms === true,
    dsc: f.dsc?.dsc1p2 === true,
    maxFrlRate: f.maxFrlRate,
  };
}
