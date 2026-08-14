import { describe, expect, it } from 'vitest'
import { checksum8 } from 'edidts'
import { getSectionRanges } from './byteRanges'

/** Base EDID block declaring one extension. */
function baseBlock(): number[] {
  const block = new Array<number>(128).fill(0x00)
  block.splice(0, 8, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00)
  block[18] = 0x01
  block[19] = 0x04
  block[126] = 1
  block[127] = checksum8(new Uint8Array(block))
  return block
}

/** A DisplayID EDID extension block wrapping the given data blocks. */
function displayIdExtension(blocks: number[]): number[] {
  const SECTION_LENGTH = 126
  const section = new Array<number>(SECTION_LENGTH).fill(0x00)
  section[0] = 0x20
  section[1] = SECTION_LENGTH - 5
  section[2] = 0x04
  blocks.forEach((byte, index) => {
    section[4 + index] = byte
  })
  section[SECTION_LENGTH - 1] = checksum8(new Uint8Array(section))

  const extension = [0x70, ...section, 0x00]
  extension[127] = checksum8(new Uint8Array(extension))
  return extension
}

// Product Identification (0x20), then Type VII timings (0x22).
const PRODUCT_ID = [0x20, 0x00, 0x0c, 0x12, 0x34, 0x56, 0x34, 0x12, 0, 0, 0, 0, 0x01, 0x15, 0x00]
const TYPE_VII = [
  0x22, 0x02, 0x14,
  0xc7, 0x08, 0x02, 0x08, 0x7f, 0x07, 0x4f, 0x00, 0x07, 0x80,
  0x1f, 0x00, 0x37, 0x04, 0x1e, 0x00, 0x10, 0x00, 0x07, 0x00,
]

const edid = new Uint8Array([...baseBlock(), ...displayIdExtension([...PRODUCT_ID, ...TYPE_VII])])

describe('getSectionRanges for DisplayID sections', () => {
  it('highlights the whole extension block for the overview', () => {
    expect(getSectionRanges('did-overview', edid)).toEqual([{ start: 128, end: 256 }])
  })

  it('highlights only the Product Identification data block', () => {
    // Section header occupies 129..132, so the first data block starts at 133.
    expect(getSectionRanges('did-product', edid)).toEqual([
      { start: 133, end: 133 + PRODUCT_ID.length },
    ])
  })

  it('highlights only the timing data block', () => {
    const start = 133 + PRODUCT_ID.length
    expect(getSectionRanges('did-timings', edid)).toEqual([{ start, end: start + TYPE_VII.length }])
  })

  it('returns nothing for a block type the EDID does not contain', () => {
    expect(getSectionRanges('did-tiled', edid)).toEqual([])
  })

  it('routes blocks without a dedicated section to "Other Blocks"', () => {
    // A ContainerID block (0x29) has no dedicated view.
    const containerId = [0x29, 0x00, 0x10, ...new Array<number>(16).fill(0xab)]
    const withContainer = new Uint8Array([...baseBlock(), ...displayIdExtension([...PRODUCT_ID, ...containerId])])
    const start = 133 + PRODUCT_ID.length

    expect(getSectionRanges('did-other', withContainer)).toEqual([
      { start, end: start + containerId.length },
    ])
  })

  it('returns nothing when the EDID has no DisplayID extension', () => {
    const noDisplayId = new Uint8Array(baseBlock())
    expect(getSectionRanges('did-overview', noDisplayId)).toEqual([])
    expect(getSectionRanges('did-product', noDisplayId)).toEqual([])
  })
})
