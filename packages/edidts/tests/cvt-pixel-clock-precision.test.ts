import { describe, expect, it } from 'vitest'
import { DisplayDescriptorParser } from '../src/edid/display-descriptor'
import type { DisplayRangeLimitsDescriptor } from '../src/edid/display-descriptor'

/**
 * E-EDID A.2 Table 3.28: with CVT support, byte 9 is the max pixel clock
 * rounded *up* to a 10 MHz multiple, and byte 12 bits 7:2 subtract from it in
 * 0.25 MHz steps. Reading byte 9 alone overstates the clock by up to 15.75 MHz.
 */
function cvtRangeLimits(byte9: number, byte12: number): Uint8Array {
  return new Uint8Array([
    0x00, 0x00, 0x00, 0xfd, 0x00,
    48, 160, 30, 125,
    byte9,
    0x04, // CVT supported
    0x11, // CVT version 1.1
    byte12,
    0x00, // max active pixels, low byte
    0xc0, // 4:3 and 16:9
    0x00,
    0x00,
    60,
  ])
}

const decode = (b9: number, b12: number) =>
  DisplayDescriptorParser.decode(cvtRangeLimits(b9, b12)) as DisplayRangeLimitsDescriptor

describe('CVT additional pixel clock precision (byte 12 bits 7:2)', () => {
  it('subtracts nothing when the precision field is zero', () => {
    expect(decode(0x0d, 0x00).maxPixelClock).toBe(130)
  })

  it('subtracts 0.25 MHz per step', () => {
    // 170 MHz declared in byte 9, minus 1 step.
    expect(decode(0x11, 0x01 << 2).maxPixelClock).toBe(169.75)
    // Minus 10 steps = 2.5 MHz.
    expect(decode(0x11, 0x0a << 2).maxPixelClock).toBe(167.5)
  })

  it('handles the largest offset the field can express', () => {
    // 63 steps = 15.75 MHz, the most byte 12 can subtract.
    expect(decode(0x11, 0x3f << 2).maxPixelClock).toBe(154.25)
  })

  it('does not mistake the precision bits for the pixel-count bits', () => {
    // Byte 12 bits 1:0 are the max-active-pixels high bits, not precision.
    const both = decode(0x11, (0x0a << 2) | 0x03)
    expect(both.maxPixelClock).toBe(167.5)
    expect(both.cvt?.maxActivePixelsPerLine).toBe(0x300 * 8)
  })

  it('ignores byte 12 when CVT is not the timing support', () => {
    const gtf = new Uint8Array([
      0x00, 0x00, 0x00, 0xfd, 0x00,
      48, 160, 30, 125,
      0x11,
      0x00, // default GTF
      0x0a, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
    ])
    const d = DisplayDescriptorParser.decode(gtf) as DisplayRangeLimitsDescriptor
    expect(d.maxPixelClock).toBe(170)
  })

  it('round trips every step a normalised descriptor can hold', () => {
    // 40 steps is a full 10 MHz, so byte 9 would have been one lower — only
    // 0..39 are reachable from a value written the canonical way.
    for (const steps of [0, 1, 10, 39]) {
      const original = cvtRangeLimits(0x11, steps << 2)
      const encoded = DisplayDescriptorParser.encode(
        DisplayDescriptorParser.decode(original) as DisplayRangeLimitsDescriptor,
      )
      expect(Array.from(encoded), `steps ${steps}`).toEqual(Array.from(original))
    }
  })

  it('normalises a descriptor that backs off by more than a full 10 MHz', () => {
    // 63 steps under 170 MHz is 154.25, which byte 9 = 16 expresses in 23
    // steps. The spec permits the byte pair as written, but the canonical
    // form is the one with the smaller offset, so encoding does not reproduce
    // the input bytes here — it reproduces the value.
    const original = cvtRangeLimits(0x11, 0x3f << 2)
    const decoded = DisplayDescriptorParser.decode(original) as DisplayRangeLimitsDescriptor
    expect(decoded.maxPixelClock).toBe(154.25)

    const encoded = DisplayDescriptorParser.encode(decoded)
    expect(encoded[9]).toBe(16)
    expect((encoded[12] >> 2) & 0x3f).toBe(23)

    const reparsed = DisplayDescriptorParser.decode(encoded) as DisplayRangeLimitsDescriptor
    expect(reparsed.maxPixelClock).toBe(154.25)
  })

  it('derives byte 9 by rounding up, and byte 12 from the remainder', () => {
    const d = decode(0x11, 0x00)
    d.maxPixelClock = 167.5

    const encoded = DisplayDescriptorParser.encode(d)
    expect(encoded[9]).toBe(0x11) // 170 MHz, rounded up from 167.5
    expect((encoded[12] >> 2) & 0x3f).toBe(10) // 2.5 MHz back off
  })

  it('keeps the offset inside the 39 steps a 10 MHz gap allows', () => {
    // Whatever the value, rounding byte 9 up leaves less than a full 10 MHz to
    // back off, so the field can never need more than 39 of its 63 steps.
    for (const clock of [164, 167.5, 154.25, 0.25, 599.75]) {
      const d = decode(0x11, 0x00)
      d.maxPixelClock = clock

      const encoded = DisplayDescriptorParser.encode(d)
      const steps = (encoded[12] >> 2) & 0x3f
      expect(steps, `clock ${clock}`).toBeLessThan(40)
      expect(encoded[9] * 10 - steps * 0.25, `clock ${clock}`).toBe(clock)
    }
  })
})
