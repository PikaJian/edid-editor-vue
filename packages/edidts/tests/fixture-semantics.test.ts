import { describe, expect, it } from 'vitest'
import { EDID } from '../src/edid'
import { getVICDefinition } from '../src/cta/vic-table'
import {
  APPENDIX_A_EXAMPLE_1,
  LG_TV_SSCR2,
  MSI_MAG272URDF_DISPLAYID_V1,
} from './fixtures'
import type {
  AudioDataBlock,
  VendorSpecificDataBlock,
  VideoDataBlock,
} from '../src/cta/extension-block'
import type { DisplayRangeLimitsDescriptor } from '../src/edid/display-descriptor'
import type { DisplayIdTypeIDetailedTimingBlock } from '../src/displayid'

/**
 * What each fixture is supposed to decode to, asserted field by field.
 *
 * This exists because round-trip fidelity cannot see a decoder and an encoder
 * that are wrong in mirror-image ways — SVD `C2h` decoded to "VIC 66, native"
 * and encoded straight back to `C2h` for as long as the parser existed. Only a
 * claim about the *meaning* catches that.
 *
 * The values here were derived by hand from the raw bytes and the specs, in a
 * separate implementation, rather than captured from this package's output; a
 * table generated from the code under test would only pin current behaviour,
 * including its bugs. Where two parts of an EDID corroborate each other, or
 * where the device's own model number does, that is asserted too — a
 * mirror-image bug cannot fake an agreement with an independent fact.
 */

/** Refresh rate a detailed timing implies, from its own totals. */
function refreshHz(timing: {
  pixelClock: number
  horizontalActive: number
  horizontalBlanking: number
  verticalActive: number
  verticalBlanking: number
}): number {
  const hTotal = timing.horizontalActive + timing.horizontalBlanking
  const vTotal = timing.verticalActive + timing.verticalBlanking
  return (timing.pixelClock * 1e6) / (hTotal * vTotal)
}

/** Horizontal scan rate a timing needs, in kHz. */
function horizontalKhz(timing: { pixelClock: number; horizontalActive: number; horizontalBlanking: number }): number {
  return (timing.pixelClock * 1000) / (timing.horizontalActive + timing.horizontalBlanking)
}

function rangeLimits(edid: EDID): DisplayRangeLimitsDescriptor {
  return edid.displayDescriptors.find(d => d.tag === 0xfd) as DisplayRangeLimitsDescriptor
}

function videoDataBlock(edid: EDID): VideoDataBlock {
  return edid.ceaExtension!.dataBlocks.find(b => b.tag === 0x02) as VideoDataBlock
}

function hdmiForum(edid: EDID): VendorSpecificDataBlock {
  return edid.ceaExtension!.dataBlocks.find(
    b => b.tag === 0x03 && (b as VendorSpecificDataBlock).ieeeOui === 0xc45dd8,
  ) as VendorSpecificDataBlock
}

describe('MSI MAG 272URDF — 27" 4K 160 Hz gaming monitor', () => {
  const edid = () => new EDID(MSI_MAG272URDF_DISPLAYID_V1)

  it('identifies the display', () => {
    const e = edid()
    expect(e.header.manufacturerId).toBe('MSI')
    expect(e.header.productCode).toBe(15591)
    expect(e.header.weekOfManufacture).toBe(44)
    expect(e.header.yearOfManufacture).toBe(2024)
    expect(e.productName).toBe('MAG 272URDF')
    expect(e.videoInput.isDigital).toBe(true)
    expect(e.gamma).toBe(2.2)
  })

  it('reports a screen size matching the 27 inches in its model number', () => {
    const { horizontalCm, verticalCm } = edid().screenSize
    expect(horizontalCm).toBe(60)
    expect(verticalCm).toBe(34)

    // 60 x 34 cm is a 68.9 cm diagonal, 27.1 inches. "272URDF" claims 27, so
    // the decode agrees with something written on the box.
    const diagonalInches = Math.hypot(horizontalCm!, verticalCm!) / 2.54
    expect(diagonalInches).toBeGreaterThan(26.5)
    expect(diagonalInches).toBeLessThan(27.5)
  })

  it('decodes both detailed timings', () => {
    const [uhd, fhd] = edid().detailedTimings as unknown as Parameters<typeof refreshHz>[0][]

    expect([uhd.horizontalActive, uhd.verticalActive]).toEqual([3840, 2160])
    expect(uhd.pixelClock).toBe(533.25)
    expect(refreshHz(uhd)).toBeCloseTo(60, 2)

    expect([fhd.horizontalActive, fhd.verticalActive]).toEqual([1920, 1080])
    expect(fhd.pixelClock).toBe(148.5)
    expect(refreshHz(fhd)).toBeCloseTo(60, 2)
  })

  it('reports a horizontal rate range wide enough for the modes it advertises', () => {
    const limits = rangeLimits(edid())

    expect(limits.minVerticalRate).toBe(48)
    expect(limits.maxVerticalRate).toBe(160)
    expect(limits.minHorizontalRate).toBe(30)
    expect(limits.maxHorizontalRate).toBe(380)
    expect(limits.maxPixelClock).toBe(1500)

    // Byte 4's offset flags put the maximum at 125 + 255. Dropping them
    // reports 125 kHz, which this display's own timings already exceed: its
    // base-block 4K 60 Hz mode is reduced-blanking (hTotal 4000) and needs
    // 133.3 kHz, and the DisplayID block advertises 4K at 160 Hz, needing
    // 350.7 kHz. 380 accommodates both; 125 accommodates neither.
    const uhd60 = edid().detailedTimings[0] as unknown as Parameters<typeof horizontalKhz>[0]
    expect(horizontalKhz(uhd60)).toBeCloseTo(133.31, 1)
    expect(limits.maxHorizontalRate).toBeGreaterThan(horizontalKhz(uhd60))
    expect(limits.maxHorizontalRate).toBeGreaterThan(350.72)
  })

  it('lists the CEA video codes in order, with 1080p60 marked native', () => {
    expect(videoDataBlock(edid()).vics).toEqual([
      { vic: 1, native: false },
      { vic: 3, native: false },
      { vic: 2, native: false },
      { vic: 4, native: false },
      { vic: 16, native: true },
      { vic: 18, native: false },
      { vic: 17, native: false },
      { vic: 19, native: false },
      { vic: 63, native: false },
      { vic: 47, native: false },
      { vic: 97, native: false },
      { vic: 118, native: false },
    ])
    expect(getVICDefinition(16)?.name).toBe('1920x1080p @ 60Hz')
    expect(getVICDefinition(118)?.name).toBe('3840x2160p @ 120Hz')
  })

  it('declares stereo LPCM at up to 24 bits', () => {
    const [lpcm] = (edid().ceaExtension!.dataBlocks.find(b => b.tag === 0x01) as AudioDataBlock).descriptors
    expect(lpcm.format).toBe(1)
    expect(lpcm.channels).toBe(2)
    expect(lpcm.bitDepths).toEqual({ bd16: true, bd20: true, bd24: true })
  })

  it('declares a VRR range that matches its Display Range Limits', () => {
    const e = edid()
    const forum = hdmiForum(e).hdmiForum!

    expect(forum.maxTmdsCharacterRate).toBe(600)
    expect(forum.maxFrlRate).toBe(6)
    expect(forum.allm).toBe(true)
    expect(forum.fva).toBe(false)
    expect(forum.qms).toBe(false)
    expect(forum.vrrMin).toBe(48)
    expect(forum.vrrMax).toBe(160)

    // Two independent parts of this EDID, decoded by different code paths,
    // have to agree — they do, and a bug in either bit layout would break it.
    expect([forum.vrrMin, forum.vrrMax]).toEqual([
      rangeLimits(e).minVerticalRate,
      rangeLimits(e).maxVerticalRate,
    ])
  })

  it('declares DSC 1.2 at 10 and 12 bpc', () => {
    const dsc = hdmiForum(edid()).hdmiForum!.dsc!
    expect(dsc.dsc1p2).toBe(true)
    expect(dsc.bpc10).toBe(true)
    expect(dsc.bpc12).toBe(true)
    expect(dsc.bpc16).toBe(false)
    expect(dsc.maxFrlRate).toBe(6)
    expect(dsc.maxSlices).toBe(5)
    expect(dsc.totalChunkKBytes).toBe(35)
  })

  it('carries a DisplayID v1.2 section whose timings reach 160 Hz', () => {
    const [extension] = edid().displayIdExtensions
    const section = extension.section!

    expect(section.version).toBe(1)
    expect(section.revision).toBe(2)

    const timings = (section.blocks[0] as DisplayIdTypeIDetailedTimingBlock).timings
    const rates = timings.map(t =>
      (t.pixelClockKhz * 1000) /
      ((t.horizontalActive + t.horizontalBlank) * (t.verticalActive + t.verticalBlank)),
    )

    expect(timings.map(t => `${t.horizontalActive}x${t.verticalActive}`)).toEqual([
      '3840x2160',
      '3840x2160',
      '3840x2160',
    ])
    expect(rates[0]).toBeCloseTo(143.85, 1)
    expect(rates[1]).toBeCloseTo(120, 1)
    expect(rates[2]).toBeCloseTo(160, 1)

    // The panel's fastest mode is exactly the maximum its range limits allow.
    expect(Math.round(rates[2])).toBe(rangeLimits(edid()).maxVerticalRate)
  })
})

describe('LG TV SSCR2 — large 4K TV', () => {
  const edid = () => new EDID(LG_TV_SSCR2)

  it('identifies the display', () => {
    const e = edid()
    expect(e.header.manufacturerId).toBe('GSM') // Goldstar, i.e. LG
    expect(e.header.productCode).toBe(33741)
    expect(e.header.yearOfManufacture).toBe(2025)
    expect(e.productName).toBe('LG TV SSCR2')
    expect(e.screenSize.horizontalCm).toBe(160)
    expect(e.screenSize.verticalCm).toBe(90)
  })

  it('decodes the 8-bit video codes as Cinema 4K rather than ultrawide', () => {
    const vics = videoDataBlock(edid()).vics

    expect(vics).toHaveLength(29)
    expect(vics.slice(0, 8)).toEqual([
      { vic: 97, native: false },
      { vic: 96, native: false },
      { vic: 118, native: false },
      { vic: 117, native: false },
      { vic: 102, native: false },
      { vic: 101, native: false },
      { vic: 219, native: false },
      { vic: 218, native: false },
    ])

    // The two that a 7Fh mask misreads. 4096-wide, not 2560-wide, and not
    // native — this panel's own detailed timing is 3840x2160.
    expect(getVICDefinition(219)?.name).toBe('4096x2160p @ 120Hz')
    expect(getVICDefinition(218)?.name).toBe('4096x2160p @ 100Hz')
    expect(vics.some(v => v.native)).toBe(false)
  })

  it('decodes its detailed timings', () => {
    const [uhd, qhd] = edid().detailedTimings as unknown as Parameters<typeof refreshHz>[0][]

    expect([uhd.horizontalActive, uhd.verticalActive]).toEqual([3840, 2160])
    expect(uhd.pixelClock).toBe(594)
    expect(refreshHz(uhd)).toBeCloseTo(60, 2)
    // 594 MHz for 4K 60 is the CTA-standard clock, which VIC 97 also names.
    expect(getVICDefinition(97)?.pixelClock).toBe(594)

    expect([qhd.horizontalActive, qhd.verticalActive]).toEqual([2560, 1440])
    expect(refreshHz(qhd)).toBeCloseTo(120, 2)
  })

  it('declares four audio formats, two of them beyond what the model covers', () => {
    const sads = (edid().ceaExtension!.dataBlocks.find(b => b.tag === 0x01) as AudioDataBlock).descriptors

    expect(sads.map(d => [d.format, d.channels])).toEqual([
      [1, 2],   // LPCM
      [2, 6],   // AC-3
      [10, 8],  // Enhanced AC-3
      [12, 8],  // MAT (Dolby TrueHD)
    ])

    expect(sads[0].bitDepths).toEqual({ bd16: true, bd20: true, bd24: true })
    expect(sads[1].maxBitrate).toBe(640)

    // E-AC-3 and MAT have no interpretation here, so byte 3 is kept raw
    // rather than zeroed — dropping it costs the TV real capability.
    expect(sads[2].formatSpecific).toBe(0x01)
    expect(sads[3].formatSpecific).toBe(0x07)
  })

  it('declares QMS and a VRR range within its vertical rate limits', () => {
    const e = edid()
    const forum = hdmiForum(e).hdmiForum!
    const limits = rangeLimits(e)

    expect(forum.maxTmdsCharacterRate).toBe(600)
    expect(forum.maxFrlRate).toBe(6)
    expect(forum.qms).toBe(true)
    expect(forum.allm).toBe(false)
    expect(forum.vrrMin).toBe(40)
    expect(forum.vrrMax).toBe(144)
    expect(forum.dsc?.dsc1p2).toBe(true)
    expect(forum.dsc?.maxSlices).toBe(3)

    // Unlike the MSI, the VRR window is narrower than the overall vertical
    // range rather than equal to it — but it still has to sit inside it.
    expect(limits.minVerticalRate).toBe(24)
    expect(limits.maxVerticalRate).toBe(144)
    expect(forum.vrrMin!).toBeGreaterThanOrEqual(limits.minVerticalRate)
    expect(forum.vrrMax!).toBeLessThanOrEqual(limits.maxVerticalRate)
  })

  it('keeps every Block Map slot, including the stray byte the panel ships', () => {
    const map = edid().extensionBlocks[0] as { tag: number; blockTags: number[] }

    expect(map.tag).toBe(0xf0)
    expect(map.blockTags.slice(0, 4)).toEqual([0x02, 0x70, 0x00, 0x6b])
    expect(map.blockTags).toHaveLength(126)
  })
})

describe('Panasonic ET-MDNHM10 — the fixture named APPENDIX_A_EXAMPLE_1', () => {
  // The name is a misnomer inherited from the goedid samples: VESA E-EDID A.2
  // Appendix A Example 1 is a 128-byte base block for an "ABC LCD21" made by
  // "ABC", dated 2007. This is a 256-byte dump from a real Panasonic device.
  const edid = () => new EDID(APPENDIX_A_EXAMPLE_1)

  it('identifies the display', () => {
    const e = edid()
    expect(e.header.manufacturerId).toBe('MEI') // Panasonic's PnP id
    expect(e.productName).toBe('ET-MDNHM10')
    expect(e.header.yearOfManufacture).toBe(2015)
  })

  it('decodes its rate limits without inventing an offset', () => {
    const limits = rangeLimits(edid())

    // Byte 4 is 00h here, so nothing is offset — the unusual-looking 23 Hz
    // and 15 kHz minima are what the device actually declares.
    expect(limits.minVerticalRate).toBe(23)
    expect(limits.maxVerticalRate).toBe(121)
    expect(limits.minHorizontalRate).toBe(15)
    expect(limits.maxHorizontalRate).toBe(150)
    expect(limits.maxPixelClock).toBe(600)
  })

  it('decodes its video codes, all of them 7-bit', () => {
    const vics = videoDataBlock(edid()).vics

    expect(vics).toHaveLength(23)
    expect(vics.slice(0, 6).map(v => v.vic)).toEqual([97, 96, 95, 94, 93, 102])
    // Nothing here reaches the 8-bit ranges, which is why this fixture never
    // exercised the SVD bug.
    expect(vics.every(v => v.vic < 193)).toBe(true)
    expect(vics.some(v => v.native)).toBe(false)
  })

  it('carries a 4-byte minimum SCDS, so the optional groups are absent', () => {
    const forum = hdmiForum(edid()).hdmiForum!

    expect(forum.maxTmdsCharacterRate).toBe(600)
    expect(forum.allm).toBeUndefined()
    expect(forum.vrrMin).toBeUndefined()
    expect(forum.dsc).toBeUndefined()
  })
})
