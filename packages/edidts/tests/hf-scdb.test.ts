import { describe, expect, it } from 'vitest'
import { decodeExtendedDataBlock, encodeExtendedDataBlock } from '../src/cta/cta-extended-blocks'
import type { HfScdbDataBlock } from '../src/cta/cta-extended-blocks'
import { decodeSinkCapabilityDataStructure } from '../src/cta/extension-block'
import type { SinkCapabilityDataStructure } from '../src/cta/extension-block'

/**
 * HDMI Forum Sink Capability Data Block, HDMI 2.1b section 10.3.2.2.
 *
 * Extended tag 79h, then two Reserved bytes, then the same Sink Capability
 * Data Structure the HF-VSDB carries after its OUI. A source that parses one
 * "shall also be capable of parsing" the other.
 */

// The SCDS from the MSI panel: 600 MHz TMDS, FRL 6, ALLM, VRR 48-160, DSC 1.2.
const SCDS = [0x01, 0x78, 0x80, 0x63, 0x02, 0x30, 0xa0, 0x83, 0x65, 0x23]

function hfScdb(scds: number[] = SCDS, reserved: number[] = [0x00, 0x00]) {
  return new Uint8Array([0x79, ...reserved, ...scds])
}

describe('HF-SCDB (extended tag 79h)', () => {
  it('decodes the same capability structure as an HF-VSDB', () => {
    const block = decodeExtendedDataBlock(hfScdb()) as HfScdbDataBlock

    expect(block.tag).toBe(0x07)
    expect(block.extendedTag).toBe(0x79)

    // Byte-identical to what the VSDB path produces for the same SCDS.
    expect(block.scds).toEqual(decodeSinkCapabilityDataStructure(new Uint8Array(SCDS)))
  })

  it('reads the capability fields through', () => {
    const { scds } = decodeExtendedDataBlock(hfScdb()) as HfScdbDataBlock

    expect(scds.maxTmdsCharacterRate).toBe(600)
    expect(scds.maxFrlRate).toBe(6)
    expect(scds.allm).toBe(true)
    expect(scds.vrrMin).toBe(48)
    expect(scds.vrrMax).toBe(160)
    expect(scds.dsc?.dsc1p2).toBe(true)
    expect(scds.dsc?.maxSlices).toBe(5)
  })

  it('starts the SCDS after the two reserved bytes, not at byte 2', () => {
    // Off by those two and PB1 would read 00h instead of the version.
    const { scds } = decodeExtendedDataBlock(hfScdb()) as HfScdbDataBlock
    expect(scds.version).toBe(1)
  })

  it('round trips, reserved bytes included', () => {
    const original = hfScdb()
    const encoded = encodeExtendedDataBlock(
      decodeExtendedDataBlock(original) as HfScdbDataBlock,
    )
    expect(Array.from(encoded)).toEqual(Array.from(original))
  })

  it('preserves reserved bytes that are not zero', () => {
    // Spec says Reserved(0), but a sink that writes something else should not
    // have it silently rewritten.
    const original = hfScdb(SCDS, [0xaa, 0xbb])
    const block = decodeExtendedDataBlock(original) as HfScdbDataBlock

    expect(Array.from(block.reservedBytes)).toEqual([0xaa, 0xbb])
    expect(Array.from(encodeExtendedDataBlock(block))).toEqual(Array.from(original))
  })

  it('accepts the 4-byte minimum SCDS', () => {
    const short = hfScdb([0x01, 0x78, 0x80, 0x63])
    const block = decodeExtendedDataBlock(short) as HfScdbDataBlock

    expect(block.scds.maxFrlRate).toBe(6)
    expect(block.scds.allm).toBeUndefined()
    expect(block.scds.dsc).toBeUndefined()
    expect(Array.from(encodeExtendedDataBlock(block))).toEqual(Array.from(short))
  })

  it('keeps SCDS bytes past the modelled PB10', () => {
    const withReserved = hfScdb([...SCDS, 0x11, 0x22])
    const block = decodeExtendedDataBlock(withReserved) as HfScdbDataBlock

    expect(Array.from(encodeExtendedDataBlock(block))).toEqual(Array.from(withReserved))
  })

  it('maps each PB5 bit to its own field', () => {
    // No fixture sets these, so a swap between two of them is invisible to
    // any test driven by real data — FAPA and FVA were transposed for exactly
    // that reason. One bit at a time, per HDMI 2.1b Table 10-7.
    const fields: [number, keyof SinkCapabilityDataStructure][] = [
      [0x80, 'fapaEndExtended'],
      [0x40, 'qms'],
      [0x20, 'mDelta'],
      [0x10, 'cinemaVrr'],
      [0x08, 'negMvrr'],
      [0x04, 'fva'],
      [0x02, 'allm'],
      [0x01, 'fapaStartLocation'],
    ]

    for (const [bit, field] of fields) {
      const scds = decodeSinkCapabilityDataStructure(
        new Uint8Array([0x01, 0x78, 0x00, 0x00, bit]),
      )

      for (const [, other] of fields) {
        expect(scds[other], `PB5 ${bit.toString(2)} -> ${other}`).toBe(other === field)
      }
    }
  })

  it('maps each PB3 bit to its own field', () => {
    const fields: [number, keyof SinkCapabilityDataStructure][] = [
      [0x80, 'scdc'],
      [0x40, 'rr'],
      [0x20, 'cableStatus'],
      [0x10, 'ccbpci'],
      [0x08, 'lte340McscScramble'],
      [0x04, 'independentView'],
      [0x02, 'dualView'],
      [0x01, 'osd3d'],
    ]

    for (const [bit, field] of fields) {
      const scds = decodeSinkCapabilityDataStructure(new Uint8Array([0x01, 0x78, bit, 0x00]))
      for (const [, other] of fields) {
        expect(scds[other], `PB3 ${bit.toString(2)} -> ${other}`).toBe(other === field)
      }
    }
  })

  it('splits PB4 into the FRL rate and the 4:2:0 colour depths', () => {
    const depths: [number, keyof SinkCapabilityDataStructure][] = [
      [0x08, 'uhdVic'],
      [0x04, 'dc48bit420'],
      [0x02, 'dc36bit420'],
      [0x01, 'dc30bit420'],
    ]

    for (const [bit, field] of depths) {
      const scds = decodeSinkCapabilityDataStructure(new Uint8Array([0x01, 0x78, 0x00, bit]))
      expect(scds.maxFrlRate).toBe(0)
      for (const [, other] of depths) {
        expect(scds[other], `PB4 ${bit.toString(2)} -> ${other}`).toBe(other === field)
      }
    }

    // Bits 7:4 are the rate, and must not leak into the depth flags.
    const rate = decodeSinkCapabilityDataStructure(new Uint8Array([0x01, 0x78, 0x00, 0x60]))
    expect(rate.maxFrlRate).toBe(6)
    expect([rate.uhdVic, rate.dc48bit420, rate.dc36bit420, rate.dc30bit420]).toEqual([
      false, false, false, false,
    ])
  })
})
