import { describe, expect, it } from 'vitest'
import { EDID } from '../src/edid'
import { MSI_MAG272URDF_DISPLAYID_V1, APPENDIX_A_EXAMPLE_1 } from './fixtures'
import type { VendorSpecificDataBlock } from '../src/cta/extension-block'

/**
 * Encoding must not discard bytes the model does not decode.
 *
 * Two blocks in this fixture carry more than the model covers: the HF-VSDB's
 * Sink Capability Data Structure runs to PB10 while only PB1-PB6 are decoded
 * (HDMI 2.1b Table 10-7), and the Colorimetry block's byte 4 carries MD0-MD3
 * alongside the DCI-P3 flag this model reads (CTA-861-G Table 70).
 */
describe('CTA extension round trip', () => {
  it('re-encodes the real monitor EDID byte for byte', () => {
    const encoded = new EDID(MSI_MAG272URDF_DISPLAYID_V1).encode()
    expect(Array.from(encoded)).toEqual(Array.from(MSI_MAG272URDF_DISPLAYID_V1))
  })

  it('re-encodes the CTA-only fixture byte for byte', () => {
    const encoded = new EDID(APPENDIX_A_EXAMPLE_1).encode()
    expect(Array.from(encoded)).toEqual(Array.from(APPENDIX_A_EXAMPLE_1))
  })

  it('keeps the HF-VSDB payload at its declared length', () => {
    const edid = new EDID(MSI_MAG272URDF_DISPLAYID_V1)
    const hf = edid.ceaExtension!.dataBlocks.find(
      b => b.tag === 0x03 && (b as VendorSpecificDataBlock).ieeeOui === 0xc45dd8,
    ) as VendorSpecificDataBlock

    // PB1..PB10 — the model decodes PB1..PB6, the rest holds VRR and DSC data.
    expect(hf.payload.length).toBe(10)

    const encoded = edid.encode()
    // CTA offset 36 is the HF-VSDB header: tag 3, length 13 (3 OUI + 10 SCDS).
    expect(encoded[128 + 36]).toBe(0x6d)
    // dtdOffset must not shift when a block keeps its length.
    expect(encoded[128 + 2]).toBe(0x52)
  })

  it('preserves SCDS bytes past the modelled PB6', () => {
    const edid = new EDID(MSI_MAG272URDF_DISPLAYID_V1)
    const encoded = edid.encode()
    const scdsStart = 128 + 36 + 1 + 3 // header, then the 3 OUI bytes

    // PB6..PB10 carry VRRMIN/VRRMAX and the DSC capability fields.
    expect(Array.from(encoded.slice(scdsStart + 5, scdsStart + 10))).toEqual([
      0x30, 0xa0, 0x83, 0x65, 0x23,
    ])
  })

  it('preserves the colorimetry gamut metadata bits', () => {
    const encoded = new EDID(MSI_MAG272URDF_DISPLAYID_V1).encode()
    // CTA offset 67 is byte 4 of the Colorimetry block: MD0 set, DCI-P3 clear.
    expect(encoded[128 + 67]).toBe(0x01)
  })
})

/**
 * The SCDS bit assignments, checked against HDMI 2.1b Table 10-7 rather than
 * against what the previous implementation happened to do — PB5's FAPA and FVA
 * were swapped there, and PB6 was read as flag bits when it carries VRRMIN.
 */
describe('HF-VSDB Sink Capability Data Structure', () => {
  const forum = () => {
    const edid = new EDID(MSI_MAG272URDF_DISPLAYID_V1)
    const block = edid.ceaExtension!.dataBlocks.find(
      b => b.tag === 0x03 && (b as VendorSpecificDataBlock).ieeeOui === 0xc45dd8,
    ) as VendorSpecificDataBlock
    return block.hdmiForum!
  }

  it('reads PB5 flags at their spec bit positions', () => {
    // PB5 is 02h here: ALLM (bit 1) alone.
    const f = forum()
    expect(f.allm).toBe(true)
    expect(f.fva).toBe(false) // bit 2
    expect(f.fapaStartLocation).toBe(false) // bit 0
    expect(f.qms).toBe(false) // bit 6
    expect(f.fapaEndExtended).toBe(false)
    expect(f.negMvrr).toBe(false)
  })

  it('reads the VRR range from PB6 and PB7', () => {
    // PB6 = 30h -> VRRMAX[9:8] = 0, VRRMIN = 48. PB7 = A0h -> VRRMAX = 160.
    // Cross-check: the Display Range Limits descriptor says 48-160 Hz too.
    const f = forum()
    expect(f.vrrMin).toBe(48)
    expect(f.vrrMax).toBe(160)
  })

  it('reads the DSC capability from PB8 through PB10', () => {
    // Previously reported as dsc=false, read from the wrong byte entirely.
    const dsc = forum().dsc!
    expect(dsc.dsc1p2).toBe(true)
    expect(dsc.bpc12).toBe(true)
    expect(dsc.bpc10).toBe(true)
    expect(dsc.native420).toBe(false)
    expect(dsc.maxFrlRate).toBe(6)
    expect(dsc.maxSlices).toBe(5)
    expect(dsc.totalChunkKBytes).toBe(35)
  })

  it('leaves the optional groups undefined on a short SCDS', () => {
    // APPENDIX_A_EXAMPLE_1 carries the 4-byte minimum: PB1..PB4 only.
    const edid = new EDID(APPENDIX_A_EXAMPLE_1)
    const block = edid.ceaExtension!.dataBlocks.find(
      b => b.tag === 0x03 && (b as VendorSpecificDataBlock).ieeeOui === 0xc45dd8,
    ) as VendorSpecificDataBlock
    const f = block.hdmiForum!

    expect(f.maxFrlRate).toBeGreaterThanOrEqual(0)
    expect(f.allm).toBeUndefined()
    expect(f.vrrMin).toBeUndefined()
    expect(f.dsc).toBeUndefined()
  })
})
