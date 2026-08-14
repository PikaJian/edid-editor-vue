import { describe, expect, it } from 'vitest'
import {
  decodeDisplayIdSection,
  decodeHalfFloat,
  encodeDisplayIdSection,
  encodeHalfFloat,
  DisplayIdDataBlockTag,
  type DisplayIdAdaptiveSyncBlock,
  type DisplayIdBrightnessLuminanceBlock,
  type DisplayIdContainerIdBlock,
  type DisplayIdCtaEncapsulationBlock,
  type DisplayIdDisplayParametersBlock,
  type DisplayIdDynamicRangeLimitsBlock,
  type DisplayIdInterfaceFeaturesBlock,
  type DisplayIdProductIdentificationBlock,
  type DisplayIdStereoInterfaceBlock,
  type DisplayIdTiledDisplayBlock,
  type DisplayIdTypeIxTimingBlock,
  type DisplayIdTypeViiTimingBlock,
  type DisplayIdTypeViiiTimingBlock,
  type DisplayIdTypeXTimingBlock,
  type DisplayIdVendorSpecificBlock,
} from '../src/displayid'
import { checksum8, isChecksum8Valid } from '../src/common'

/**
 * Wraps data blocks in a section header and a correct checksum.
 *
 * "Bytes in Section" excludes the four header bytes and the checksum, so it is
 * exactly the data block length (Table 2-1).
 */
function section(primaryUseCase: number, blocks: number[]): Uint8Array {
  const data = new Uint8Array([0x20, blocks.length, primaryUseCase, 0x00, ...blocks, 0x00])
  data[data.length - 1] = checksum8(data)
  return data
}

function decodeOnly<T>(blocks: number[]): T {
  return decodeDisplayIdSection(section(0x04, blocks)).blocks[0] as T
}

/** Every decoder must survive a decode -> encode -> decode round trip byte for byte. */
function expectRoundTrip(blocks: number[]): void {
  const original = section(0x04, blocks)
  const encoded = encodeDisplayIdSection(decodeDisplayIdSection(original))
  expect(Array.from(encoded)).toEqual(Array.from(original))
}

describe('IEEE 754 half-precision helpers', () => {
  it('decodes the luminance values used in the DisplayID v2.1a Appendix A example', () => {
    expect(decodeHalfFloat(0x5e40)).toBe(400)
    expect(decodeHalfFloat(0x3800)).toBe(0.5)
  })

  it('round trips representable values', () => {
    for (const bits of [0x0000, 0x3c00, 0x5e40, 0x3800, 0x7bff, 0x0001, 0x0400]) {
      expect(encodeHalfFloat(decodeHalfFloat(bits))).toBe(bits)
    }
  })

  it('preserves the negative zero "no luminance data" sentinel', () => {
    const decoded = decodeHalfFloat(0x8000)
    expect(Object.is(decoded, -0)).toBe(true)
    expect(encodeHalfFloat(decoded)).toBe(0x8000)
  })

  it('clamps overflow to infinity and underflow to zero', () => {
    expect(encodeHalfFloat(1e6)).toBe(0x7c00)
    expect(encodeHalfFloat(1e-9)).toBe(0x0000)
  })
})

describe('Display Parameters data block (tag 21h)', () => {
  // Appendix A, offsets 1Fh through 3Eh.
  const payload = [
    0x21, 0x01, 0x1d,
    0x00, 0x10, 0x70, 0x08, 0x00, 0x10, 0x70, 0x08, 0x00,
    0xcc, 0xea, 0x51, 0x45, 0x64, 0xa6, 0x66, 0x42, 0x0d, 0xfd, 0x34, 0x54,
    0x40, 0x5e, 0x40, 0x5e, 0x00, 0x38, 0x13, 0x78,
  ]

  it('decodes image size, native format, chromaticity, luminance, and gamma', () => {
    const block = decodeOnly<DisplayIdDisplayParametersBlock>(payload)

    expect(block.tag).toBe(DisplayIdDataBlockTag.DisplayParameters)
    expect(block.imageSizeMultiplier).toBe(false)
    expect(block.horizontalImageSizeMm).toBeCloseTo(409.6, 5)
    expect(block.verticalImageSizeMm).toBeCloseTo(216.0, 5)
    expect(block.horizontalPixelCount).toBe(4096)
    expect(block.verticalPixelCount).toBe(2160)

    // Appendix A reads these back as Red x=0.675 y=0.320, White x=0.312 y=0.329.
    expect(block.primary1.x).toBeCloseTo(0.675, 3)
    expect(block.primary1.y).toBeCloseTo(0.320, 3)
    expect(block.primary2.x).toBeCloseTo(0.267, 3)
    expect(block.primary2.y).toBeCloseTo(0.650, 3)
    expect(block.primary3.x).toBeCloseTo(0.150, 3)
    expect(block.primary3.y).toBeCloseTo(0.052, 3)
    expect(block.whitePoint.x).toBeCloseTo(0.312, 3)
    expect(block.whitePoint.y).toBeCloseTo(0.329, 3)

    expect(block.nativeMaxLuminanceFullCoverage).toBe(400)
    expect(block.nativeMaxLuminance10Percent).toBe(400)
    expect(block.nativeMinLuminance).toBe(0.5)

    expect(block.nativeColorDepth).toBe(0x03) // 10 bpc
    expect(block.displayDeviceTechnology).toBe(0x01) // Active matrix LCD
    expect(block.darkThemePreferred).toBe(false)
    expect(block.nativeGamma).toBeCloseTo(2.2, 5)

    expect(block.scanOrientation).toBe(0)
    expect(block.usesCie1976).toBe(false)
    expect(block.speakersNotIntegrated).toBe(false)
  })

  it('reads the image size multiplier out of the block header byte', () => {
    const withMultiplier = [...payload]
    withMultiplier[1] = 0x81 // byte 01h[7] set, Block Revision 1
    const block = decodeOnly<DisplayIdDisplayParametersBlock>(withMultiplier)

    expect(block.imageSizeMultiplier).toBe(true)
    expect(block.horizontalImageSizeMm).toBe(4096)
  })

  it('treats gamma FFh as "not provided"', () => {
    const noGamma = [...payload]
    noGamma[noGamma.length - 1] = 0xff
    expect(decodeOnly<DisplayIdDisplayParametersBlock>(noGamma).nativeGamma).toBeUndefined()
  })

  it('round trips', () => {
    expectRoundTrip(payload)
    expectRoundTrip([...payload.slice(0, 1), 0x81, ...payload.slice(2)])
  })
})

describe('Type VII Detailed Timing data block (tag 22h)', () => {
  // Appendix A timing 1: 4096x2160, and timing 3: 1920x1080.
  const payload = [
    0x22, 0x02, 0x28,
    0xc7, 0x7e, 0x08, 0x88, 0xff, 0x0f, 0x4f, 0x00, 0x07, 0x80,
    0x1f, 0x00, 0x6f, 0x08, 0x3d, 0x00, 0x2f, 0x00, 0x07, 0x00,
    0xc7, 0x08, 0x02, 0x08, 0x7f, 0x07, 0x4f, 0x00, 0x07, 0x80,
    0x1f, 0x00, 0x37, 0x04, 0x1e, 0x00, 0x10, 0x00, 0x07, 0x00,
  ]

  it('decodes both descriptors with the spec\'s "value minus one" encoding', () => {
    const block = decodeOnly<DisplayIdTypeViiTimingBlock>(payload)

    expect(block.descriptorSize).toBe(20)
    expect(block.timings).toHaveLength(2)

    const [first, second] = block.timings
    expect(first.pixelClockKhz).toBe(556744) // 556.744 MP/s
    expect(first.aspectRatio).toBe(0x08) // calculated from the pixel dimensions
    expect(first.interlaced).toBe(false)
    expect(first.stereoSupport).toBe(0)
    expect(first.horizontalActive).toBe(4096)
    expect(first.horizontalBlank).toBe(80)
    expect(first.horizontalFrontPorch).toBe(8)
    expect(first.horizontalSyncWidth).toBe(32)
    expect(first.horizontalSyncPositive).toBe(true)
    expect(first.verticalActive).toBe(2160)
    expect(first.verticalBlank).toBe(62)
    expect(first.verticalFrontPorch).toBe(48)
    expect(first.verticalSyncWidth).toBe(8)
    expect(first.verticalSyncPositive).toBe(false)

    expect(second.pixelClockKhz).toBe(133320)
    expect(second.horizontalActive).toBe(1920)
    expect(second.verticalActive).toBe(1080)
    expect(second.verticalBlank).toBe(31)
    expect(second.verticalFrontPorch).toBe(17)
  })

  it('reads byte 3 bit 7 as YCbCr 4:2:0 for Block Revision 2 and preferred otherwise', () => {
    const revision2 = decodeOnly<DisplayIdTypeViiTimingBlock>(payload)
    expect(revision2.timings[0].ycc420).toBe(true)
    expect(revision2.timings[0].preferred).toBeUndefined()

    const revision0 = decodeOnly<DisplayIdTypeViiTimingBlock>([...payload.slice(0, 1), 0x00, ...payload.slice(2)])
    expect(revision0.timings[0].preferred).toBe(true)
    expect(revision0.timings[0].ycc420).toBeUndefined()
  })

  it('honours the descriptor size field and the DSC pass-through flag', () => {
    // Byte 01h[6:4] = 001b widens descriptors to 21 bytes; byte 01h[3] sets DSC.
    const extended = [
      0x22, 0x1a, 0x15,
      0xc7, 0x7e, 0x08, 0x88, 0xff, 0x0f, 0x4f, 0x00, 0x07, 0x80,
      0x1f, 0x00, 0x6f, 0x08, 0x3d, 0x00, 0x2f, 0x00, 0x07, 0x00, 0x5a,
    ]
    const block = decodeOnly<DisplayIdTypeViiTimingBlock>(extended)

    expect(block.descriptorSize).toBe(21)
    expect(block.dscPassThrough).toBe(true)
    expect(block.timings).toHaveLength(1)
    expect(Array.from(block.timings[0].extraBytes)).toEqual([0x5a])
    expectRoundTrip(extended)
  })

  it('round trips', () => {
    expectRoundTrip(payload)
  })
})

describe('Type VIII Enumerated Timing Code data block (tag 23h)', () => {
  it('decodes 1-byte CTA VIC codes', () => {
    // Byte 01h[7:6] = 01b selects CTA VIC codes.
    const block = decodeOnly<DisplayIdTypeViiiTimingBlock>([0x23, 0x40, 0x03, 0x10, 0x5f, 0x60])

    expect(block.timingCodeSize).toBe(1)
    expect(block.timingCodeType).toBe(1)
    expect(block.ycc420).toBe(false)
    expect(block.codes).toEqual([0x10, 0x5f, 0x60])
    expectRoundTrip([0x23, 0x40, 0x03, 0x10, 0x5f, 0x60])
  })

  it('decodes 2-byte codes and the Revision 1 YCbCr 4:2:0 flag', () => {
    // Byte 01h[3] = 2-byte codes, byte 01h[5] = YCbCr 4:2:0.
    const block = decodeOnly<DisplayIdTypeViiiTimingBlock>([0x23, 0x29, 0x04, 0x34, 0x12, 0x78, 0x56])

    expect(block.timingCodeSize).toBe(2)
    expect(block.ycc420).toBe(true)
    expect(block.codes).toEqual([0x1234, 0x5678])
    expectRoundTrip([0x23, 0x29, 0x04, 0x34, 0x12, 0x78, 0x56])
  })
})

describe('Type IX Formula-based Timing data block (tag 24h)', () => {
  it('decodes a CVT RB v2 descriptor', () => {
    // Formula 010b (CVT v2.1 RB v2), fractional refresh rate option set.
    const block = decodeOnly<DisplayIdTypeIxTimingBlock>([
      0x24, 0x00, 0x06,
      0x12, 0x7f, 0x07, 0x37, 0x04, 0x3b,
    ])

    expect(block.timings).toHaveLength(1)
    const [timing] = block.timings
    expect(timing.formula).toBe(0x02)
    expect(timing.fractionalRefreshRate).toBe(true)
    expect(timing.horizontalActive).toBe(1920)
    expect(timing.verticalActive).toBe(1080)
    expect(timing.refreshRate).toBe(60)
    expectRoundTrip([0x24, 0x00, 0x06, 0x12, 0x7f, 0x07, 0x37, 0x04, 0x3b])
  })
})

describe('Type X Formula-based Timing data block (tag 2Ah)', () => {
  it('decodes a 6-byte descriptor', () => {
    const block = decodeOnly<DisplayIdTypeXTimingBlock>([
      0x2a, 0x00, 0x06,
      0x02, 0x7f, 0x07, 0x37, 0x04, 0x3b,
    ])

    expect(block.descriptorSize).toBe(6)
    expect(block.timings[0].formula).toBe(0x02)
    expect(block.timings[0].refreshRate).toBe(60)
    expect(block.timings[0].hBlankPixels).toBeUndefined()
  })

  it('decodes an 8-byte CVT RB v3 descriptor including HBlank and VBlank extensions', () => {
    // Byte 01h[6:4] = 010b -> 8-byte descriptors.
    // Byte 0 = 0x1b: formula 011b (RB v3), early VSync, 160-pixel HBlank base.
    // Byte 6 = 0x2c: refresh rate high bits 00b, delta HBlank 011b, extra VBlank 001b.
    // Byte 7 = 0x01: alternate minimum VBlank in use.
    const payload = [
      0x2a, 0x20, 0x08,
      0x1b, 0x7f, 0x07, 0x37, 0x04, 0xef, 0x2c, 0x01,
    ]
    const block = decodeOnly<DisplayIdTypeXTimingBlock>(payload)
    const [timing] = block.timings

    expect(block.descriptorSize).toBe(8)
    expect(timing.formula).toBe(0x03)
    expect(timing.earlyVSync).toBe(true)
    expect(timing.hBlank160).toBe(true)
    expect(timing.refreshRate).toBe(240)
    expect(timing.deltaHBlankRaw).toBe(0x03)
    expect(timing.hBlankPixels).toBe(184) // 3 x 8 + 160
    expect(timing.alternateMinVBlank).toBe(true)
    expect(timing.additionalVBlankMicroseconds).toBe(20) // 1 x 20 us
    expectRoundTrip(payload)
  })

  it('extends the refresh rate past 256 Hz with the 7-byte descriptor', () => {
    // Byte 01h[6:4] = 001b -> 7-byte descriptors; refresh rate 0x1FF + 1 = 512 Hz.
    const block = decodeOnly<DisplayIdTypeXTimingBlock>([
      0x2a, 0x10, 0x07,
      0x02, 0x7f, 0x07, 0x37, 0x04, 0xff, 0x01,
    ])

    expect(block.timings[0].refreshRate).toBe(512)
    expectRoundTrip([0x2a, 0x10, 0x07, 0x02, 0x7f, 0x07, 0x37, 0x04, 0xff, 0x01])
  })
})

describe('Dynamic Video Timing Range Limits data block (tag 25h)', () => {
  it('decodes pixel clock and refresh rate limits', () => {
    const payload = [
      0x25, 0x00, 0x09,
      0x3f, 0x42, 0x0f, 0xbf, 0x34, 0x5c, 0x30, 0x78, 0x80,
    ]
    const block = decodeOnly<DisplayIdDynamicRangeLimitsBlock>(payload)

    expect(block.minPixelClockKhz).toBe(1000000)
    expect(block.maxPixelClockKhz).toBe(6042816)
    expect(block.minVerticalRefreshRate).toBe(48)
    expect(block.maxVerticalRefreshRate).toBe(120)
    expect(block.seamlessDynamicVideoTiming).toBe(true)
    expectRoundTrip(payload)
  })

  it('widens the maximum refresh rate to 10 bits for Block Revision 1', () => {
    // Byte 0Bh[1:0] = 01b contributes bits 9:8, giving 0x178 = 376 Hz.
    const payload = [
      0x25, 0x01, 0x09,
      0x3f, 0x42, 0x0f, 0xbf, 0x34, 0x5c, 0x30, 0x78, 0x81,
    ]
    const block = decodeOnly<DisplayIdDynamicRangeLimitsBlock>(payload)

    expect(block.maxVerticalRefreshRate).toBe(376)
    expect(block.seamlessDynamicVideoTiming).toBe(true)
    expectRoundTrip(payload)
  })
})

describe('Display Interface Features data block (tag 26h)', () => {
  it('decodes the Appendix A example', () => {
    // Appendix A, offsets 3Fh through 4Ah.
    const payload = [0x26, 0x00, 0x09, 0x06, 0x00, 0x00, 0x00, 0x00, 0x60, 0x01, 0x00, 0x00]
    const block = decodeOnly<DisplayIdInterfaceFeaturesBlock>(payload)

    expect(block.rgbColorDepths).toEqual([8, 10])
    expect(block.ycbcr444ColorDepths).toEqual([])
    expect(block.ycbcr422ColorDepths).toEqual([])
    expect(block.ycbcr420ColorDepths).toEqual([])
    expect(block.minYcbcr420PixelRateMhz).toBe(0)
    expect(block.audio32kHz).toBe(false)
    expect(block.audio44kHz).toBe(true)
    expect(block.audio48kHz).toBe(true)
    expect(block.colorSpaceSrgb).toBe(true)
    expect(block.colorSpaceBt2020).toBe(false)
    expect(block.additionalColorSpaceEotf).toEqual([])
    expectRoundTrip(payload)
  })

  it('decodes subsampled colour depths and additional colour space entries', () => {
    // YCbCr 4:2:2 bit 0 is 8 bpc, not 6 bpc (Table 4-27).
    const payload = [
      0x26, 0x00, 0x0b,
      0x3f, 0x07, 0x01, 0x05, 0x02, 0xe0, 0x41, 0x00, 0x02, 0x68, 0x39,
    ]
    const block = decodeOnly<DisplayIdInterfaceFeaturesBlock>(payload)

    expect(block.rgbColorDepths).toEqual([6, 8, 10, 12, 14, 16])
    expect(block.ycbcr444ColorDepths).toEqual([6, 8, 10])
    expect(block.ycbcr422ColorDepths).toEqual([8])
    expect(block.ycbcr420ColorDepths).toEqual([8, 12])
    expect(block.minYcbcr420PixelRateMhz).toBe(148.5)
    expect(block.colorSpaceSrgb).toBe(true)
    expect(block.colorSpaceBt2020St2084).toBe(true)
    expect(block.additionalColorSpaceEotf).toEqual([
      { colorSpace: 0x6, eotf: 0x8 },
      { colorSpace: 0x3, eotf: 0x9 },
    ])
    expectRoundTrip(payload)
  })
})

describe('Stereo Display Interface data block (tag 27h)', () => {
  it('decodes the frame sequential method', () => {
    const payload = [0x27, 0x00, 0x03, 0x02, 0x00, 0x01]
    const block = decodeOnly<DisplayIdStereoInterfaceBlock>(payload)

    expect(block.methodCode).toBe(0x00)
    expect(block.stereoPolarity).toBe(true)
    expect(block.timingDescriptors).toEqual([])
    expectRoundTrip(payload)
  })

  it('decodes the pixel-interleaved 8x8 pattern', () => {
    const payload = [
      0x27, 0x00, 0x0a,
      0x09, 0x02, 0xff, 0x00, 0xff, 0x00, 0xff, 0x00, 0xff, 0x00,
    ]
    const block = decodeOnly<DisplayIdStereoInterfaceBlock>(payload)

    expect(block.methodCode).toBe(0x02)
    expect(Array.from(block.interleavePattern ?? [])).toEqual([0xff, 0, 0xff, 0, 0xff, 0, 0xff, 0])
    expectRoundTrip(payload)
  })

  it('decodes multi-view parameters and trailing timing codes', () => {
    // Byte 01h[7:6] = 01b -> timing codes are listed in the block.
    const payload = [
      0x27, 0x40, 0x07,
      0x03, 0x04, 0x08, 0x01,
      0x42, 0x10, 0x5f,
    ]
    const block = decodeOnly<DisplayIdStereoInterfaceBlock>(payload)

    expect(block.stereoTimingSupport).toBe(0x01)
    expect(block.methodCode).toBe(0x04)
    expect(block.viewCount).toBe(8)
    expect(block.viewInterleavingMethod).toBe(1)
    expect(block.timingDescriptors).toEqual([{ timingCodeType: 1, codes: [0x10, 0x5f] }])
    expectRoundTrip(payload)
  })
})

describe('Tiled Display Topology data block (tag 28h)', () => {
  it('decodes topology, tile location, size, bezels, and identity', () => {
    // 2x2 topology, this tile at (1, 1); tiles are 1920x2160.
    const payload = [
      0x28, 0x00, 0x16,
      0xc1, 0x11, 0x00, 0x00,
      0x7f, 0x07, 0x6f, 0x08,
      0x3c, 0x0a, 0x0a, 0x05, 0x05,
      0x12, 0x34, 0x56, 0x34, 0x12, 0x78, 0x56, 0x34, 0x12,
    ]
    const block = decodeOnly<DisplayIdTiledDisplayBlock>(payload)

    expect(block.singleEnclosure).toBe(true)
    expect(block.hasBezelInformation).toBe(true)
    expect(block.singleTileBehavior).toBe(0x01)
    expect(block.totalHorizontalTiles).toBe(2)
    expect(block.totalVerticalTiles).toBe(2)
    expect(block.horizontalTileLocation).toBe(1)
    expect(block.verticalTileLocation).toBe(1)
    expect(block.horizontalTileSize).toBe(1920)
    expect(block.verticalTileSize).toBe(2160)
    expect(block.pixelMultiplier).toBe(60)
    expect(block.topBezelSize).toBe(10)
    expect(block.leftBezelSize).toBe(5)
    expect(block.ieeeOuiText).toBe('12-34-56')
    expect(block.productId).toBe(0x1234)
    expect(block.serialNumber).toBe(0x12345678)
    expectRoundTrip(payload)
  })

  it('reassembles tile counts above 16 from their split high bits', () => {
    // Low nibbles 0x0f/0x0f plus high bits 11b/11b -> 64 tiles each way.
    const payload = [
      0x28, 0x00, 0x16,
      0x80, 0xff, 0x00, 0xf0,
      0x7f, 0x07, 0x6f, 0x08,
      0x00, 0x00, 0x00, 0x00, 0x00,
      0x12, 0x34, 0x56, 0x34, 0x12, 0x78, 0x56, 0x34, 0x12,
    ]
    const block = decodeOnly<DisplayIdTiledDisplayBlock>(payload)

    expect(block.totalHorizontalTiles).toBe(64)
    expect(block.totalVerticalTiles).toBe(64)
    expectRoundTrip(payload)
  })
})

describe('ContainerID data block (tag 29h)', () => {
  it('formats the UUID in canonical 8-4-4-4-12 form', () => {
    const payload = [
      0x29, 0x00, 0x10,
      0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88,
      0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00,
    ]
    const block = decodeOnly<DisplayIdContainerIdBlock>(payload)

    expect(block.uuidText).toBe('11223344-5566-7788-99AA-BBCCDDEEFF00')
    expectRoundTrip(payload)
  })
})

describe('Adaptive-Sync data block (tag 2Bh)', () => {
  it('decodes an operation mode and range descriptor', () => {
    // Byte 0 = 0x05: native panel range, FAVT + AVT supported.
    // Bytes 3:4 encode the maximum refresh rate as (value - 1) = 0xEF -> 240 Hz.
    const payload = [
      0x2b, 0x00, 0x06,
      0x05, 0x14, 0x30, 0xef, 0x00, 0x08,
    ]
    const block = decodeOnly<DisplayIdAdaptiveSyncBlock>(payload)

    expect(block.descriptorSize).toBe(6)
    expect(block.ranges).toHaveLength(1)

    const [range] = block.ranges
    expect(range.nativePanelRange).toBe(true)
    expect(range.supportedModes).toBe(0x01)
    expect(range.seamlessTransitionNotSupported).toBe(false)
    expect(range.minRefreshRate).toBe(48)
    expect(range.maxRefreshRate).toBe(240)
    expect(range.maxSingleFrameDurationIncreaseMs).toBe(5) // 0x14 in 6.2 format
    expect(range.maxSingleFrameDurationDecreaseMs).toBe(2)
    expectRoundTrip(payload)
  })

  it('decodes a maximum refresh rate above 256 Hz', () => {
    // (0x01 << 8 | 0xdf) + 1 = 480 Hz.
    const block = decodeOnly<DisplayIdAdaptiveSyncBlock>([
      0x2b, 0x00, 0x06,
      0x00, 0x00, 0x30, 0xdf, 0x01, 0x00,
    ])

    expect(block.ranges[0].maxRefreshRate).toBe(480)
  })
})

describe('Brightness Luminance Range data block (tag 2Eh)', () => {
  it('decodes the three half-precision luminance values', () => {
    // 5 cd/m2, 500 cd/m2, 1500 cd/m2 - the worked example in 4.11.
    const payload = [0x2e, 0x00, 0x06, 0x00, 0x45, 0xd0, 0x5f, 0xdc, 0x65]
    const block = decodeOnly<DisplayIdBrightnessLuminanceBlock>(payload)

    expect(block.minSdrLuminance).toBe(5)
    expect(block.maxSuggestedSdrLuminance).toBe(500)
    expect(block.maxBoostSdrLuminance).toBe(1500)
    expectRoundTrip(payload)
  })
})

describe('Vendor-specific data block (tag 7Eh)', () => {
  it('splits the IEEE OUI from the vendor payload', () => {
    // Appendix A / Appendix B: the VESA organization block, OUI 3A-02-92.
    const payload = [0x7e, 0x00, 0x05, 0x3a, 0x02, 0x92, 0x81, 0x00]
    const block = decodeOnly<DisplayIdVendorSpecificBlock>(payload)

    expect(block.ieeeOuiText).toBe('3A-02-92')
    expect(Array.from(block.vendorData)).toEqual([0x81, 0x00])
    expectRoundTrip(payload)
  })
})

describe('CTA-861 Data Block Encapsulation data block (tag 81h)', () => {
  it('unpacks the encapsulated CTA blocks', () => {
    // A speaker allocation block (tag 4, length 3) and an audio block (tag 1, length 3).
    const payload = [
      0x81, 0x00, 0x08,
      0x83, 0x01, 0x00, 0x00,
      0x23, 0x09, 0x07, 0x07,
    ]
    const block = decodeOnly<DisplayIdCtaEncapsulationBlock>(payload)

    expect(block.ctaBlocks).toHaveLength(2)
    expect(block.ctaBlocks[0].ctaTag).toBe(0x04)
    expect(Array.from(block.ctaBlocks[0].payload)).toEqual([0x01, 0x00, 0x00])
    expect(block.ctaBlocks[1].ctaTag).toBe(0x01)
    expect(Array.from(block.ctaBlocks[1].payload)).toEqual([0x09, 0x07, 0x07])
    expectRoundTrip(payload)
  })
})

describe('DisplayID v2.1a Appendix A worked example', () => {
  /**
   * Table A-1 verbatim, except for byte 01h.
   *
   * The published example declares 86h (134) "Bytes in Section", which places
   * the section end at offset 8Ah - exactly where the Vendor-specific block
   * starts - while its checksum covers all 147 bytes. Byte 01h was evidently
   * not updated when that block was appended to the example. The value below is
   * the one the normative rule in Table 2-1 requires (N - 5 = 142), with the
   * checksum recomputed to match.
   */
  const appendixSection = new Uint8Array([
    0x20, 0x8e, 0x04, 0x00,
    0x20, 0x00, 0x18,
    0x12, 0x34, 0x56, 0x34, 0x12, 0x78, 0x56, 0x34, 0x12, 0x01, 0x15, 0x0c,
    0x44, 0x69, 0x73, 0x70, 0x6c, 0x61, 0x79, 0x20, 0x4e, 0x61, 0x6d, 0x65,
    0x21, 0x00, 0x1d,
    0x00, 0x10, 0x70, 0x08, 0x00, 0x10, 0x70, 0x08, 0x00,
    0xcc, 0xea, 0x51, 0x45, 0x64, 0xa6, 0x66, 0x42, 0x0d, 0xfd, 0x34, 0x54,
    0x40, 0x5e, 0x40, 0x5e, 0x00, 0x38, 0x13, 0x78,
    0x26, 0x00, 0x09,
    0x06, 0x00, 0x00, 0x00, 0x00, 0x60, 0x01, 0x00, 0x00,
    0x22, 0x00, 0x3c,
    0xc7, 0x7e, 0x08, 0x88, 0xff, 0x0f, 0x4f, 0x00, 0x07, 0x80,
    0x1f, 0x00, 0x6f, 0x08, 0x3d, 0x00, 0x2f, 0x00, 0x07, 0x00,
    0x5d, 0x94, 0x03, 0x08, 0xff, 0x09, 0x4f, 0x00, 0x07, 0x80,
    0x1f, 0x00, 0x9f, 0x05, 0x28, 0x00, 0x1a, 0x00, 0x07, 0x00,
    0xc7, 0x08, 0x02, 0x08, 0x7f, 0x07, 0x4f, 0x00, 0x07, 0x80,
    0x1f, 0x00, 0x37, 0x04, 0x1e, 0x00, 0x10, 0x00, 0x07, 0x00,
    0x7e, 0x00, 0x05,
    0x3a, 0x02, 0x92, 0x81, 0x00,
    0x78,
  ])

  it('decodes every block in the example section', () => {
    const decoded = decodeDisplayIdSection(appendixSection)

    expect(decoded.version).toBe(2)
    expect(decoded.primaryUseCase).toBe(0x04) // Desktop productivity display
    expect(decoded.extensionCount).toBe(0)
    expect(decoded.isChecksumValid).toBe(true)
    expect(decoded.blocks.map(b => b.tag)).toEqual([
      DisplayIdDataBlockTag.ProductIdentification,
      DisplayIdDataBlockTag.DisplayParameters,
      DisplayIdDataBlockTag.DisplayInterfaceFeatures,
      DisplayIdDataBlockTag.TypeVIIDetailedTiming,
      DisplayIdDataBlockTag.VendorSpecific,
    ])

    const product = decoded.blocks[0] as DisplayIdProductIdentificationBlock
    expect(product.ieeeOuiText).toBe('12-34-56')
    expect(product.productId).toBe(0x1234)
    expect(product.serialNumber).toBe(0x12345678)
    expect(product.manufactureWeek).toBe(1)
    expect(product.year).toBe(2021)
    expect(product.productName).toBe('Display Name')

    const timings = decoded.blocks[3] as DisplayIdTypeViiTimingBlock
    expect(timings.timings.map(t => `${t.horizontalActive}x${t.verticalActive}`)).toEqual([
      '4096x2160',
      '2560x1440',
      '1920x1080',
    ])
  })

  it('re-encodes the example section byte for byte', () => {
    const encoded = encodeDisplayIdSection(decodeDisplayIdSection(appendixSection))

    expect(Array.from(encoded)).toEqual(Array.from(appendixSection))
    expect(isChecksum8Valid(encoded)).toBe(true)
  })
})
