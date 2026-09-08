import { describe, it, expect } from 'vitest'
import { EDID } from '../src/edid'
import { EstablishedTiming } from '../src/edid/established-timing'
import { loadEdidFixtures } from './fixture-loader'

const edidFixtures = await loadEdidFixtures()

/**
 * Byte offsets a fixture is expected to differ at after a decode/encode cycle,
 * keyed by fixture name. Anything not listed here must round trip exactly.
 *
 * An entry is a claim that the *input* is wrong and the encoder is right, so
 * each one needs a reason. A difference that turns up without one is a bug:
 * every silent-rewrite defect this package has had — the HF-EEODB extension
 * count, the Display Range Limits offsets, the CTA data blocks — would have
 * shown up here as an unexplained offset.
 */
const EXPECTED_ENCODE_DIFFERENCES: Record<string, number[]> = {
  // Byte 255 is the Block Map extension's checksum. This panel ships a stray
  // 6Bh in a slot no block uses, and stores the checksum that byte's absence
  // would produce, so the block as shipped does not add up. Re-encoding keeps
  // the byte where it is and writes the checksum the content actually needs.
  // See tests/lg-tv-sscr2.test.ts, which pins both halves of that.
  LG_TV_SSCR2: [255],
}

describe('Test EDID compatibility', () => {
  it.each(edidFixtures)('should parse $source/$name without throwing', ({ data }) => {
    expect(() => {
      const edid = new EDID(data)
      expect(edid).toBeDefined()
    }).not.toThrow()
  })

  it.each(edidFixtures)('should have valid header signature for $source/$name', ({ data }) => {
    const edid = new EDID(data)
    
    expect(edid.header).toBeDefined()
    expect(edid.header.manufacturerId).toMatch(/^[A-Z]{3}$/)
  })

  it.each(edidFixtures)('should have valid checksum for $source/$name', ({ data }) => {
    const edid = new EDID(data)
    
    expect(edid.isValid).toBe(true)
  })

  it.each(edidFixtures)('should re-encode $source/$name byte for byte', ({ name, data }) => {
    const encoded = new EDID(data).encode()

    const differing: number[] = []
    for (let i = 0; i < Math.max(data.length, encoded.length); i += 1) {
      if (encoded[i] !== data[i]) differing.push(i)
    }

    expect(encoded.length).toBe(data.length)
    expect(differing).toEqual(EXPECTED_ENCODE_DIFFERENCES[name] ?? [])
  })

  it.each(edidFixtures)('should still decode to the same values after re-encoding $source/$name', ({ data }) => {
    const original = new EDID(data)
    const decoded = new EDID(original.encode())

    expect(decoded.header.manufacturerId).toBe(original.header.manufacturerId)
    expect(decoded.header.productCode).toBe(original.header.productCode)
    expect(decoded.isValid).toBe(true)
  })

  it.each(edidFixtures)('should encode modifications correctly for $source/$name', ({ data }) => {
    const edid = new EDID(data)
    
    const originalManufacturer = edid.header.manufacturerId
    const originalYear = edid.header.yearOfManufacture
    
    edid.header.manufacturerId = 'ZZZ'
    edid.header.yearOfManufacture = 2025
    
    const encoded = edid.encode()
    const decoded = new EDID(encoded)
    
    expect(decoded.header.manufacturerId).toBe('ZZZ')
    expect(decoded.header.yearOfManufacture).toBe(2025)
    expect(decoded.header.manufacturerId).not.toBe(originalManufacturer)
    expect(decoded.isValid).toBe(true)
    
    decoded.header.manufacturerId = originalManufacturer
    decoded.header.yearOfManufacture = originalYear
    const restored = new EDID(decoded.encode())
    expect(restored.header.manufacturerId).toBe(originalManufacturer)
    expect(restored.isValid).toBe(true)
  })

  it.each(edidFixtures)('should encode established timing changes for $source/$name', ({ data }) => {
    const edid = new EDID(data)

    const originalTimings = edid.establishedTimings
    const originalIds = originalTimings.map(t => t.id)
    const missingTimingDef = EstablishedTiming.TIMING_MAP.find(
      timing => !originalIds.includes(timing.id) && !timing.name.startsWith('Reserved')
    )

    if (missingTimingDef) {
      edid.establishedTimings = [
        ...originalTimings,
        new EstablishedTiming(missingTimingDef),
      ]

      const encoded = edid.encode()
      const decoded = new EDID(encoded)

      expect(decoded.establishedTimings.some(t => t.id === missingTimingDef.id)).toBe(true)
      expect(decoded.isValid).toBe(true)
    } else if (originalTimings.length > 0) {
      const removedTiming = originalTimings[0]
      edid.establishedTimings = originalTimings.slice(1)

      const encoded = edid.encode()
      const decoded = new EDID(encoded)

      expect(decoded.establishedTimings.some(t => t.id === removedTiming.id)).toBe(false)
      expect(decoded.isValid).toBe(true)
    } else {
      expect.fail('Unable to modify established timings for this EDID sample')
    }
  })

  it.each(edidFixtures)('should extract timing information from $source/$name', ({ data }) => {
    const edid = new EDID(data)
    
    expect(edid.establishedTimings).toBeInstanceOf(Array)
    expect(edid.standardTimings).toBeInstanceOf(Array)
    expect(edid.detailedTimings).toBeInstanceOf(Array)
  })
})

describe('Test EDID content extraction', () => {
  it.each(edidFixtures)('should extract display info from $source/$name', ({ data }) => {
    const edid = new EDID(data)
    
    expect(edid.header.edidVersion).toBeGreaterThanOrEqual(1)
    expect(edid.header.edidRevision).toBeGreaterThanOrEqual(0)
    expect(typeof edid.gamma).toBe('number')
  })
})
