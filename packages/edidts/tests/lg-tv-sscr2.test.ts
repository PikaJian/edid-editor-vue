import { describe, expect, it } from 'vitest'
import { EDID } from '../src/edid'
import { getVICDefinition } from '../src/cta/vic-table'
import { LG_TV_SSCR2 } from './fixtures'
import type { AudioDataBlock, BlockMapExtension, VideoDataBlock } from '../src/cta/extension-block'

/**
 * A real LG panel, kept because it exercises paths the other fixtures do not:
 * 8-bit SVDs, audio formats whose third byte this package does not interpret,
 * and a malformed Block Map.
 */
describe('LG TV SSCR2', () => {
  const edid = () => new EDID(LG_TV_SSCR2)

  it('is the whole dump', () => {
    // A multi-line hex fixture missing a `+` is still valid JS — automatic
    // semicolon insertion truncates it to the first line and the loader's
    // length check then skips it silently. Pin the length.
    expect(LG_TV_SSCR2.length).toBe(512)
    expect(LG_TV_SSCR2[511]).toBe(0x90)
  })

  it('decodes all four blocks', () => {
    const e = edid()
    expect(e.isValid).toBe(true)
    expect(e.productName).toBe('LG TV SSCR2')
    expect(e.extensionBlocks.map(b => b.tag)).toEqual([0xf0, 0x02, 0x70])
  })

  it('reads the 8-bit SVDs as Cinema 4K, not as native 2560x1080', () => {
    const vdb = edid().ceaExtension!.dataBlocks.find(b => b.tag === 0x02) as VideoDataBlock
    const eightBit = vdb.vics.filter(v => v.vic >= 193)

    expect(eightBit).toEqual([
      { vic: 219, native: false },
      { vic: 218, native: false },
    ])
    expect(getVICDefinition(219)?.name).toBe('4096x2160p @ 120Hz')
    expect(getVICDefinition(218)?.name).toBe('4096x2160p @ 100Hz')

    // Masking with 7Fh gave VIC 91/90 — and claimed they were the panel's
    // native format, on a display whose actual native timing is 3840x2160.
    expect(vdb.vics.some(v => v.native)).toBe(false)
  })

  it('carries the third SAD byte through for formats it does not interpret', () => {
    const adb = edid().ceaExtension!.dataBlocks.find(b => b.tag === 0x01) as AudioDataBlock
    const [lpcm, ac3, eac3, mat] = adb.descriptors

    expect(lpcm.format).toBe(1)
    expect(lpcm.bitDepths).toEqual({ bd16: true, bd20: true, bd24: true })
    expect(ac3.format).toBe(2)
    expect(ac3.maxBitrate).toBe(640)

    // E-AC-3 and MAT: not modelled, so byte 3 is kept verbatim.
    expect(eac3.format).toBe(10)
    expect(eac3.formatSpecific).toBe(0x01)
    expect(mat.format).toBe(12)
    expect(mat.formatSpecific).toBe(0x07)
  })

  it('keeps each Block Map tag in its own slot', () => {
    const map = edid().extensionBlocks[0] as BlockMapExtension

    expect(map.blockTags.length).toBe(126)
    expect(map.blockTags[0]).toBe(0x02) // the CTA extension
    expect(map.blockTags[1]).toBe(0x70) // the DisplayID extension
    expect(map.blockTags[2]).toBe(0x00) // empty slot, not skipped
    expect(map.blockTags[3]).toBe(0x6b) // the panel's stray byte, in place
  })

  it('re-encodes byte for byte except the block map checksum it corrects', () => {
    const encoded = edid().encode()

    const differing: number[] = []
    for (let i = 0; i < LG_TV_SSCR2.length; i++) {
      if (encoded[i] !== LG_TV_SSCR2[i]) differing.push(i)
    }

    // Byte 255 is block 1's checksum. The panel stored 9Eh, which is what the
    // block would checksum to without its stray 6Bh; with that byte present
    // the shipped block is simply invalid. Re-encoding writes the right value.
    expect(differing).toEqual([255])
    expect(LG_TV_SSCR2[255]).toBe(0x9e)
    expect(encoded[255]).toBe(0x33)

    const blockOne = encoded.slice(128, 256)
    expect(blockOne.reduce((sum, b) => sum + b, 0) & 0xff).toBe(0)
  })
})
