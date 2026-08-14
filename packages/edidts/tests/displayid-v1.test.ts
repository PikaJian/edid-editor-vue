import { describe, expect, it } from 'vitest'
import { EDID } from '../src/edid'
import {
  DisplayIdDataBlockTag,
  displayIdBlockName,
  type DisplayIdTypeIDetailedTimingBlock,
} from '../src/displayid'
import { MSI_MAG272URDF_DISPLAYID_V1 } from './fixtures'
import type { DisplayIDExtensionBlock } from '../src/cta/extension-block'

/** Refresh rate implied by a detailed timing's own totals. */
function refreshRate(timing: {
  pixelClockKhz: number
  horizontalActive: number
  horizontalBlank: number
  verticalActive: number
  verticalBlank: number
}): number {
  const hTotal = timing.horizontalActive + timing.horizontalBlank
  const vTotal = timing.verticalActive + timing.verticalBlank
  return (timing.pixelClockKhz * 1000) / (hTotal * vTotal)
}

describe('DisplayID v1.2 extension on a real monitor EDID', () => {
  const edid = new EDID(MSI_MAG272URDF_DISPLAYID_V1)

  it('decodes every extension block present even when byte 126 undercounts them', () => {
    expect(edid.extensions).toBe(1) // what the base block claims
    expect(edid.extensionBlocks).toHaveLength(2) // what the file actually holds
    expect(edid.extensionCountMismatch).toBe(true)
    expect(edid.extensionBlocks.map(b => b.tag)).toEqual([0x02, 0x70])
  })

  it('parses the v1.2 section rather than rejecting it as non-v2', () => {
    const [extension] = edid.displayIdExtensions as DisplayIDExtensionBlock[]

    expect(extension.sectionError).toBeNull()
    expect(extension.section).not.toBeNull()
    expect(extension.section!.versionByte).toBe(0x12)
    expect(extension.section!.version).toBe(1)
    expect(extension.section!.revision).toBe(2)
    expect(extension.section!.isChecksumValid).toBe(true)
  })

  it('decodes the legacy Type I detailed timing block', () => {
    const section = (edid.displayIdExtensions[0] as DisplayIDExtensionBlock).section!
    const [block] = section.blocks

    expect(block.tag).toBe(DisplayIdDataBlockTag.TypeIDetailedTiming)
    expect(displayIdBlockName(block.tag, section.version)).toBe('Type I Detailed Timing')

    const timings = (block as DisplayIdTypeIDetailedTimingBlock).timings
    expect(timings).toHaveLength(3)

    // Type I stores the pixel clock in 10 kHz units; reading it as 1 kHz would
    // put these modes at a tenth of their real refresh rate.
    expect(timings.map(t => `${t.horizontalActive}x${t.verticalActive}`)).toEqual([
      '3840x2160',
      '3840x2160',
      '3840x2160',
    ])
    expect(refreshRate(timings[0])).toBeCloseTo(143.85, 1)
    expect(refreshRate(timings[1])).toBeCloseTo(120.0, 2)
    expect(refreshRate(timings[2])).toBeCloseTo(160.0, 2)

    expect(timings[2].pixelClockKhz).toBe(1402880)
    expect(timings[2].horizontalBlank).toBe(160)
    expect(timings[2].horizontalSyncPositive).toBe(true)
    expect(timings[2].verticalSyncPositive).toBe(false)
  })

  it('re-encodes the DisplayID extension byte for byte', () => {
    const encoded = edid.encode()
    expect(Array.from(encoded.slice(256, 384))).toEqual(
      Array.from(MSI_MAG272URDF_DISPLAYID_V1.slice(256, 384)),
    )
  })

  it('writes the corrected extension count when re-encoding', () => {
    const encoded = edid.encode()
    expect(encoded[126]).toBe(2)
    expect(new EDID(encoded).extensionCountMismatch).toBe(false)
  })
})
