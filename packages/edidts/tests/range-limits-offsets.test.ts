import { describe, expect, it } from 'vitest'
import { DisplayDescriptorParser } from '../src/edid/display-descriptor'
import type { DisplayRangeLimitsDescriptor } from '../src/edid/display-descriptor'
import { EDID } from '../src/edid'
import { MSI_MAG272URDF_DISPLAYID_V1 } from './fixtures'

/**
 * Display Range Limits offsets, E-EDID A.2 §3.10.3.3 Table 3.26.
 *
 * Byte 4 bits 1:0 offset the vertical rates and bits 3:2 the horizontal ones,
 * by 255 of the field's own unit. The tests either side of the pair matter:
 * the maximum is offset for 10b *and* 11b, the minimum only for 11b.
 */
function rangeLimits(offsetFlags: number, rates: [number, number, number, number]): Uint8Array {
  const [minV, maxV, minH, maxH] = rates
  return new Uint8Array([
    0x00, 0x00, 0x00, 0xfd, offsetFlags,
    minV, maxV, minH, maxH,
    0x96, // 1500 MHz max pixel clock
    0x00, // default GTF
    0x0a, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
  ])
}

function decode(offsetFlags: number, rates: [number, number, number, number]) {
  return DisplayDescriptorParser.decode(rangeLimits(offsetFlags, rates)) as DisplayRangeLimitsDescriptor
}

describe('Display Range Limits rate offsets (byte 4)', () => {
  it('applies no offset when the flags are zero', () => {
    const d = decode(0x00, [48, 160, 30, 125])

    expect(d.minVerticalRate).toBe(48)
    expect(d.maxVerticalRate).toBe(160)
    expect(d.minHorizontalRate).toBe(30)
    expect(d.maxHorizontalRate).toBe(125)
  })

  it('offsets only the maximum for 10b, on each axis independently', () => {
    // bits 3:2 = 10b -> horizontal maximum only.
    const horizontal = decode(0x08, [48, 160, 30, 125])
    expect(horizontal.minHorizontalRate).toBe(30) // NOT 285
    expect(horizontal.maxHorizontalRate).toBe(380)
    expect(horizontal.minVerticalRate).toBe(48)
    expect(horizontal.maxVerticalRate).toBe(160)

    // bits 1:0 = 10b -> vertical maximum only.
    const vertical = decode(0x02, [48, 160, 30, 125])
    expect(vertical.minVerticalRate).toBe(48) // NOT 303
    expect(vertical.maxVerticalRate).toBe(415)
    expect(vertical.minHorizontalRate).toBe(30)
    expect(vertical.maxHorizontalRate).toBe(125)
  })

  it('offsets both bounds for 11b', () => {
    const horizontal = decode(0x0c, [48, 160, 30, 125])
    expect(horizontal.minHorizontalRate).toBe(285)
    expect(horizontal.maxHorizontalRate).toBe(380)

    const vertical = decode(0x03, [48, 160, 30, 125])
    expect(vertical.minVerticalRate).toBe(303)
    expect(vertical.maxVerticalRate).toBe(415)
  })

  it('resolves both axes at once', () => {
    // 0x0f = horizontal 11b, vertical 11b.
    const d = decode(0x0f, [48, 160, 30, 125])
    expect([d.minVerticalRate, d.maxVerticalRate]).toEqual([303, 415])
    expect([d.minHorizontalRate, d.maxHorizontalRate]).toEqual([285, 380])
  })

  it('round trips every valid flag combination byte for byte', () => {
    // Table 3.26 permits 00b, 10b and 11b per axis; anything else is reserved.
    for (const vertical of [0x00, 0x02, 0x03]) {
      for (const horizontal of [0x00, 0x02, 0x03]) {
        const flags = vertical | (horizontal << 2)
        const original = rangeLimits(flags, [48, 160, 30, 125])
        const encoded = DisplayDescriptorParser.encode(
          DisplayDescriptorParser.decode(original) as DisplayRangeLimitsDescriptor,
        )
        expect(Array.from(encoded), `flags 0x${flags.toString(16)}`).toEqual(Array.from(original))
      }
    }
  })

  it('derives the flags from resolved rates rather than storing them', () => {
    // A caller that raises the maximum past 255 gets 10b for free.
    const d = decode(0x00, [48, 160, 30, 125])
    d.maxHorizontalRate = 380

    const encoded = DisplayDescriptorParser.encode(d)
    expect(encoded[4]).toBe(0x08)
    expect(encoded[7]).toBe(30)
    expect(encoded[8]).toBe(125)

    // Raising the minimum past 255 needs 11b, since 10b cannot express it.
    d.minHorizontalRate = 300
    const both = DisplayDescriptorParser.encode(d)
    expect(both[4]).toBe(0x0c)
    expect(both[7]).toBe(45)
    expect(both[8]).toBe(125)
  })

  it('clamps a rate beyond the representable 510 instead of wrapping the byte', () => {
    const d = decode(0x00, [48, 160, 30, 125])
    d.maxHorizontalRate = 600

    const encoded = DisplayDescriptorParser.encode(d)
    expect(encoded[4]).toBe(0x08)
    expect(encoded[8]).toBe(255) // 510 - 255, not 600 - 255 = 345 wrapped
    expect((DisplayDescriptorParser.decode(encoded) as DisplayRangeLimitsDescriptor).maxHorizontalRate).toBe(510)
  })

  it('reads the real monitor dump as 380 kHz, not the stored 125', () => {
    const edid = new EDID(MSI_MAG272URDF_DISPLAYID_V1)
    const limits = edid.displayDescriptors.find(
      d => d.tag === 0xfd,
    ) as DisplayRangeLimitsDescriptor

    // Byte 94 is 08h: horizontal maximum offset, vertical not offset.
    expect(limits.minHorizontalRate).toBe(30)
    expect(limits.maxHorizontalRate).toBe(380)
    expect(limits.minVerticalRate).toBe(48)
    expect(limits.maxVerticalRate).toBe(160)

    // 125 kHz would be self-contradictory: this display advertises a 4K 160 Hz
    // mode needing 350.72 kHz, and even its 4K 60 Hz DTD needs 121 kHz.
    expect(limits.maxHorizontalRate).toBeGreaterThan(350.72)
  })

  it('leaves the whole base block byte-identical on re-encode', () => {
    const encoded = new EDID(MSI_MAG272URDF_DISPLAYID_V1).encode()

    // Byte 94 used to be zeroed, which silently rewrote the declared maximum
    // from 380 kHz to 125 kHz and changed the base block checksum with it.
    expect(Array.from(encoded.slice(0, 128))).toEqual(
      Array.from(MSI_MAG272URDF_DISPLAYID_V1.slice(0, 128)),
    )
  })
})
