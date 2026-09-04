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
