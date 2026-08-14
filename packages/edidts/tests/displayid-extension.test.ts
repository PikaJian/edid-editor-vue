import { describe, expect, it } from 'vitest'
import { EDID } from '../src/edid'
import { checksum8 } from '../src/common'
import {
  DisplayIdDataBlockTag,
  type DisplayIdAdaptiveSyncBlock,
  type DisplayIdDisplayParametersBlock,
  type DisplayIdProductIdentificationBlock,
  type DisplayIdTypeViiTimingBlock,
} from '../src/displayid'
import { DISPLAYID_V2_EXTENSION } from './fixtures'
import type { DisplayIDExtensionBlock } from '../src/cta/extension-block'

/** A minimal but valid base EDID with the extension count set. */
function baseBlock(extensionCount: number): number[] {
  const block = new Array<number>(128).fill(0x00)
  block.splice(0, 8, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00)
  block[8] = 0x34
  block[9] = 0xa9 // manufacturer id
  block[18] = 0x01 // EDID version 1
  block[19] = 0x04 // revision 4
  block[20] = 0x80 // digital input
  block[126] = extensionCount
  block[127] = checksum8(new Uint8Array(block))
  return block
}

/**
 * Builds a DisplayID EDID Extension Block per v2.1a Section 2.1: the 70h tag,
 * a 126-byte fixed-length DisplayID Section, then the EDID checksum.
 */
function displayIdExtension(blocks: number[]): number[] {
  const SECTION_LENGTH = 126
  const section = new Array<number>(SECTION_LENGTH).fill(0x00)
  section[0] = 0x20 // DisplayID Structure v2.0
  section[1] = SECTION_LENGTH - 5 // Bytes in Section = 79h (121)
  section[2] = 0x04 // Desktop productivity display
  section[3] = 0x00 // Extension Count
  blocks.forEach((byte, index) => {
    section[4 + index] = byte
  })
  section[SECTION_LENGTH - 1] = checksum8(new Uint8Array(section))

  const extension = [0x70, ...section, 0x00]
  extension[127] = checksum8(new Uint8Array(extension))
  return extension
}

const PRODUCT_IDENTIFICATION_BLOCK = [
  0x20, 0x00, 0x11,
  0x12, 0x34, 0x56, // IEEE OUI
  0x34, 0x12, // product id
  0x78, 0x56, 0x34, 0x12, // serial number
  0x01, 0x15, // week 1, year 2021
  0x05, 0x50, 0x61, 0x6e, 0x65, 0x6c, // "Panel"
]

const TYPE_VII_TIMING_BLOCK = [
  0x22, 0x02, 0x14,
  0xc7, 0x08, 0x02, 0x08, 0x7f, 0x07, 0x4f, 0x00, 0x07, 0x80,
  0x1f, 0x00, 0x37, 0x04, 0x1e, 0x00, 0x10, 0x00, 0x07, 0x00,
]

describe('DisplayID EDID extension block (tag 70h)', () => {
  const edidBytes = new Uint8Array([
    ...baseBlock(1),
    ...displayIdExtension([...PRODUCT_IDENTIFICATION_BLOCK, ...TYPE_VII_TIMING_BLOCK]),
  ])

  it('parses the DisplayID section carried in an EDID extension', () => {
    const edid = new EDID(edidBytes)

    expect(edid.extensionBlocks).toHaveLength(1)
    const extension = edid.extensionBlocks[0] as DisplayIDExtensionBlock
    expect(extension.tag).toBe(0x70)
    expect(extension.sectionError).toBeNull()
    expect(extension.section).not.toBeNull()

    const section = extension.section!
    expect(section.version).toBe(2)
    expect(section.primaryUseCase).toBe(0x04)
    expect(section.isChecksumValid).toBe(true)
    expect(section.blocks.map(b => b.tag)).toEqual([
      DisplayIdDataBlockTag.ProductIdentification,
      DisplayIdDataBlockTag.TypeVIIDetailedTiming,
    ])

    const product = section.blocks[0] as DisplayIdProductIdentificationBlock
    expect(product.productName).toBe('Panel')
    expect(product.ieeeOuiText).toBe('12-34-56')

    const timings = section.blocks[1] as DisplayIdTypeViiTimingBlock
    expect(timings.timings[0].horizontalActive).toBe(1920)
    expect(timings.timings[0].verticalActive).toBe(1080)
  })

  it('exposes DisplayID extensions through the EDID helper', () => {
    const edid = new EDID(edidBytes)

    expect(edid.displayIdExtensions).toHaveLength(1)
    expect(edid.displayIdExtensions[0].section?.blocks).toHaveLength(2)
  })

  it('re-encodes the extension byte for byte', () => {
    const edid = new EDID(edidBytes)
    const encoded = edid.encode()

    expect(Array.from(encoded.slice(128, 256))).toEqual(Array.from(edidBytes.slice(128, 256)))
  })

  it('reports a malformed section instead of failing the whole EDID parse', () => {
    const broken = new Uint8Array(edidBytes)
    broken[129] = 0x30 // structure version 3, which is neither v1.x nor v2.x
    broken[255] = 0x00
    broken[255] = checksum8(broken.slice(128, 256))

    const edid = new EDID(broken)
    const extension = edid.extensionBlocks[0] as DisplayIDExtensionBlock

    expect(edid.isValid).toBe(true)
    expect(extension.section).toBeNull()
    expect(extension.sectionError).toContain('is not a v1.x or v2.x structure')
  })

  it('decodes the DisplayID extension fixture end to end', () => {
    const edid = new EDID(DISPLAYID_V2_EXTENSION)
    const [extension] = edid.displayIdExtensions

    expect(edid.isValid).toBe(true)
    expect(extension.sectionError).toBeNull()
    expect(extension.section?.isChecksumValid).toBe(true)
    expect(extension.section?.primaryUseCase).toBe(0x05) // Desktop gaming display

    const blocks = extension.section!.blocks
    expect(blocks.map(b => b.tag)).toEqual([
      DisplayIdDataBlockTag.ProductIdentification,
      DisplayIdDataBlockTag.DisplayParameters,
      DisplayIdDataBlockTag.DisplayInterfaceFeatures,
      DisplayIdDataBlockTag.TypeVIIDetailedTiming,
      DisplayIdDataBlockTag.AdaptiveSync,
    ])

    const parameters = blocks[1] as DisplayIdDisplayParametersBlock
    expect(parameters.horizontalPixelCount).toBe(3840)
    expect(parameters.verticalPixelCount).toBe(2160)
    expect(parameters.nativeMaxLuminance10Percent).toBe(500)

    const adaptiveSync = blocks[4] as DisplayIdAdaptiveSyncBlock
    expect(adaptiveSync.ranges[0].minRefreshRate).toBe(48)
    expect(adaptiveSync.ranges[0].maxRefreshRate).toBe(144)
  })

  it('pads an edited section back out to the fixed 126-byte extension length', () => {
    const edid = new EDID(edidBytes)
    const extension = edid.extensionBlocks[0] as DisplayIDExtensionBlock

    // Dropping a block shrinks the payload; the section must still fill the block.
    extension.section!.blocks = extension.section!.blocks.slice(0, 1)
    const encoded = edid.encode()

    expect(encoded.length).toBe(256)
    expect(encoded[129]).toBe(0x20)
    expect(encoded[130]).toBe(126 - 5)

    const reparsed = new EDID(encoded).extensionBlocks[0] as DisplayIDExtensionBlock
    expect(reparsed.section?.isChecksumValid).toBe(true)
    expect(reparsed.section?.blocks).toHaveLength(1)
  })
})
