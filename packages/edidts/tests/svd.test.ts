import { describe, expect, it } from 'vitest'
import {
  decodeShortVideoDescriptor,
  encodeShortVideoDescriptor,
} from '../src/cta/svd'
import { getVICDefinition } from '../src/cta/vic-table'

/**
 * CTA-861-G section 7.5.1. The pseudo code splits the byte range four ways and
 * bit 7 belongs to the VIC in two of them, so a blanket `byte & 0x7F` misreads
 * every code from 193 up.
 */
describe('Short Video Descriptor', () => {
  it('reads 1..64 as a 7-bit VIC that is not native', () => {
    expect(decodeShortVideoDescriptor(0x01)).toEqual({ vic: 1, native: false })
    expect(decodeShortVideoDescriptor(0x10)).toEqual({ vic: 16, native: false })
    expect(decodeShortVideoDescriptor(0x40)).toEqual({ vic: 64, native: false })
  })

  it('reads 65..127 as an 8-bit VIC from the first new set', () => {
    expect(decodeShortVideoDescriptor(0x41)).toEqual({ vic: 65, native: false })
    expect(decodeShortVideoDescriptor(0x61)).toEqual({ vic: 97, native: false })
    expect(decodeShortVideoDescriptor(0x7f)).toEqual({ vic: 127, native: false })
  })

  it('reads 129..192 as a 7-bit VIC that is native', () => {
    expect(decodeShortVideoDescriptor(0x81)).toEqual({ vic: 1, native: true })
    expect(decodeShortVideoDescriptor(0x90)).toEqual({ vic: 16, native: true })
    expect(decodeShortVideoDescriptor(0xc0)).toEqual({ vic: 64, native: true })
  })

  it('reads 193..253 as an 8-bit VIC from the second new set', () => {
    // The regression this fixes: C2h was decoded as VIC 66 with native set.
    expect(decodeShortVideoDescriptor(0xc2)).toEqual({ vic: 194, native: false })
    expect(decodeShortVideoDescriptor(0xc1)).toEqual({ vic: 193, native: false })
    expect(decodeShortVideoDescriptor(0xfd)).toEqual({ vic: 253, native: false })
  })

  it('names a real 8K format that the old masking hid', () => {
    const { vic } = decodeShortVideoDescriptor(0xc2)
    expect(getVICDefinition(vic)?.name).toBe('7680x4320p @ 24Hz')

    // What the previous code produced instead: an 8K format read as 720p25,
    // and flagged native on top.
    expect(getVICDefinition(0xc2 & 0x7f)?.name).toBe('1280x720p @ 25Hz 64:27')
  })

  it('leaves the reserved codes alone', () => {
    for (const reserved of [0x00, 0x80, 0xfe, 0xff]) {
      expect(decodeShortVideoDescriptor(reserved)).toEqual({ vic: reserved, native: false })
    }
  })

  it('round trips every byte value', () => {
    for (let byte = 0; byte <= 0xff; byte++) {
      expect(encodeShortVideoDescriptor(decodeShortVideoDescriptor(byte)), `byte ${byte}`).toBe(byte)
    }
  })

  it('encodes a native 7-bit VIC into the 129..192 range', () => {
    expect(encodeShortVideoDescriptor({ vic: 16, native: true })).toBe(0x90)
    expect(encodeShortVideoDescriptor({ vic: 16, native: false })).toBe(0x10)
  })

  it('drops native on an 8-bit VIC rather than naming a different format', () => {
    // 97 | 0x80 is E1h, which reads back as VIC 225 — a different format, not
    // "97, native". There is no encoding for a native 8-bit VIC.
    expect(encodeShortVideoDescriptor({ vic: 97, native: true })).toBe(97)
    expect(encodeShortVideoDescriptor({ vic: 194, native: true })).toBe(194)
  })
})
