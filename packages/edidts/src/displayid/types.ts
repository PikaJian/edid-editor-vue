/**
 * DisplayID Structure v2.0 types, per VESA DisplayID Standard v2.1a.
 *
 * Section references in comments point at that document.
 */

/** Table 3-1: Data Block Tag Allocation. */
export enum DisplayIdDataBlockTag {
  /** v1.x legacy tag; v2 sections reserve 00h through 1Fh (see ./legacy.ts). */
  TypeIDetailedTiming = 0x03,
  ProductIdentification = 0x20,
  DisplayParameters = 0x21,
  TypeVIIDetailedTiming = 0x22,
  TypeVIIIEnumeratedTimingCode = 0x23,
  TypeIXFormulaBasedTiming = 0x24,
  DynamicVideoTimingRangeLimits = 0x25,
  DisplayInterfaceFeatures = 0x26,
  StereoDisplayInterface = 0x27,
  TiledDisplayTopology = 0x28,
  ContainerId = 0x29,
  TypeXFormulaBasedTiming = 0x2a,
  AdaptiveSync = 0x2b,
  ArvrHmd = 0x2c,
  ArvrLayer = 0x2d,
  BrightnessLuminanceRange = 0x2e,
  VendorSpecific = 0x7e,
  CtaDataBlockEncapsulation = 0x81,
}

export const DISPLAY_ID_BLOCK_NAMES: Record<number, string> = {
  [DisplayIdDataBlockTag.ProductIdentification]: 'Product Identification',
  [DisplayIdDataBlockTag.DisplayParameters]: 'Display Parameters',
  [DisplayIdDataBlockTag.TypeVIIDetailedTiming]: 'Type VII Detailed Timing',
  [DisplayIdDataBlockTag.TypeVIIIEnumeratedTimingCode]: 'Type VIII Enumerated Timing Code',
  [DisplayIdDataBlockTag.TypeIXFormulaBasedTiming]: 'Type IX Formula-based Timing',
  [DisplayIdDataBlockTag.DynamicVideoTimingRangeLimits]: 'Dynamic Video Timing Range Limits',
  [DisplayIdDataBlockTag.DisplayInterfaceFeatures]: 'Display Interface Features',
  [DisplayIdDataBlockTag.StereoDisplayInterface]: 'Stereo Display Interface',
  [DisplayIdDataBlockTag.TiledDisplayTopology]: 'Tiled Display Topology',
  [DisplayIdDataBlockTag.ContainerId]: 'ContainerID',
  [DisplayIdDataBlockTag.TypeXFormulaBasedTiming]: 'Type X Formula-based Timing',
  [DisplayIdDataBlockTag.AdaptiveSync]: 'Adaptive-Sync',
  [DisplayIdDataBlockTag.ArvrHmd]: 'ARVR_HMD',
  [DisplayIdDataBlockTag.ArvrLayer]: 'ARVR_Layer',
  [DisplayIdDataBlockTag.BrightnessLuminanceRange]: 'Brightness Luminance Range',
  [DisplayIdDataBlockTag.VendorSpecific]: 'Vendor-specific',
  [DisplayIdDataBlockTag.CtaDataBlockEncapsulation]: 'CTA-861 Data Block Encapsulation',
};

/**
 * @param structureVersion 1 selects the v1.x legacy tag table, 2 the v2 one.
 *   Defaults to v2 for callers that only deal with v2 sections.
 */
export function displayIdBlockName(tag: number, structureVersion = 2): string {
  if (structureVersion < 2) return displayIdV1BlockName(tag);
  const known = DISPLAY_ID_BLOCK_NAMES[tag];
  if (known) return known;
  if (tag >= 0x2f && tag <= 0x7d) return 'Reserved (VESA)';
  if (tag >= 0x7f && tag <= 0x80) return 'Reserved';
  if (tag >= 0x82) return 'Reserved (external standards organization)';
  return `Unknown (0x${tag.toString(16).padStart(2, '0')})`;
}

/**
 * DisplayID Structure v1.x data block tags.
 *
 * v2.1a Table 3-1 reserves 00h through 1Fh as "legacy data blocks for DisplayID
 * Structure v1.x" without defining them; monitors still ship v1.2 sections, so
 * the names are needed to label what a v1.x section contains.
 */
export const DISPLAY_ID_V1_BLOCK_NAMES: Record<number, string> = {
  0x00: 'Product Identification (v1.x)',
  0x01: 'Display Parameters (v1.x)',
  0x02: 'Color Characteristics (v1.x)',
  0x03: 'Type I Detailed Timing',
  0x04: 'Type II Detailed Timing',
  0x05: 'Type III Short Timing',
  0x06: 'Type IV DMT Timing Code',
  0x07: 'VESA Timing Standard',
  0x08: 'CTA Timing Standard',
  0x09: 'Video Timing Range (v1.x)',
  0x0a: 'Product Serial Number',
  0x0b: 'General Purpose ASCII String',
  0x0c: 'Display Device Data',
  0x0d: 'Interface Power Sequencing',
  0x0e: 'Transfer Characteristics',
  0x0f: 'Display Interface (v1.x)',
  0x10: 'Stereo Display Interface (v1.x)',
  0x11: 'Type V Short Timing',
  0x12: 'Tiled Display Topology (v1.x)',
  0x13: 'Type VI Detailed Timing',
  0x7f: 'Vendor-specific (v1.x)',
};

export function displayIdV1BlockName(tag: number): string {
  return DISPLAY_ID_V1_BLOCK_NAMES[tag] ?? `Unknown v1.x block (0x${tag.toString(16).padStart(2, '0')})`;
}

/** Table 3-2: every data block starts with tag, revision/flags, and payload length. */
export interface DisplayIdDataBlock {
  tag: number;
  revision: number;
  /** Byte 01h bits 7:3 — block-specific, so exposed raw as well as decoded per block. */
  flags: number;
  payloadLength: number;
  payload: Uint8Array;
}

/** 4.1 Product Identification Data Block (tag 20h). */
export interface DisplayIdProductIdentificationBlock extends DisplayIdDataBlock {
  tag: DisplayIdDataBlockTag.ProductIdentification;
  ieeeOui: number;
  ieeeOuiText: string;
  productId: number;
  serialNumber?: number;
  manufactureWeek?: number;
  year?: number;
  isModelYear: boolean;
  productNameLength: number;
  productNameBytes: Uint8Array;
  productName: string;
}

/** 4.2.4 Native Color Chromaticity — a 12-bit (x, y) or (u', v') pair. */
export interface DisplayIdChromaticity {
  /** Raw 12-bit value, 0 through 4095. */
  xRaw: number;
  yRaw: number;
  /** Raw value scaled to the 0..1 fractional representation of 4.2.4.3. */
  x: number;
  y: number;
}

/** 4.2 Display Parameters Data Block (tag 21h). */
export interface DisplayIdDisplayParametersBlock extends DisplayIdDataBlock {
  tag: DisplayIdDataBlockTag.DisplayParameters;
  /** Byte 01h[7]: false = 0.1-mm precision, true = 1.0-mm precision. */
  imageSizeMultiplier: boolean;
  horizontalImageSizeMm: number;
  verticalImageSizeMm: number;
  horizontalPixelCount: number;
  verticalPixelCount: number;
  /** 4.2.3 Feature Support Flags. */
  scanOrientation: number;
  luminanceInformation: number;
  /** false = CIE 1931 x, y; true = CIE 1976 u', v'. */
  usesCie1976: boolean;
  /** Spec phrasing is inverted: the bit is set when speakers are *not* integrated. */
  speakersNotIntegrated: boolean;
  primary1: DisplayIdChromaticity;
  primary2: DisplayIdChromaticity;
  primary3: DisplayIdChromaticity;
  whitePoint: DisplayIdChromaticity;
  /** cd/m². Negative zero means the display declined to report the value. */
  nativeMaxLuminanceFullCoverage: number;
  nativeMaxLuminance10Percent: number;
  nativeMinLuminance: number;
  nativeColorDepth: number;
  displayDeviceTechnology: number;
  /** Block Revision 1 only (4.2.6). */
  darkThemePreferred: boolean;
  /** Native gamma, or undefined when the field holds FFh ("not provided"). */
  nativeGamma?: number;
  nativeGammaRaw: number;
}

/** 4.3.1 Type VII Detailed Timing Descriptor (Table 4-18). */
export interface DisplayIdTypeViiTiming {
  /** Pixel clock in kP/s; the spec stores this as (value − 1). */
  pixelClockKhz: number;
  aspectRatio: number;
  interlaced: boolean;
  stereoSupport: number;
  /** Block Revisions 0 and 1: byte 3 bit 7 marks the preferred timing. */
  preferred?: boolean;
  /** Block Revision 2: byte 3 bit 7 becomes explicit YCbCr 4:2:0 support. */
  ycc420?: boolean;
  horizontalActive: number;
  horizontalBlank: number;
  horizontalFrontPorch: number;
  horizontalSyncWidth: number;
  horizontalSyncPositive: boolean;
  verticalActive: number;
  verticalBlank: number;
  verticalFrontPorch: number;
  verticalSyncWidth: number;
  verticalSyncPositive: boolean;
  /** Bytes past the 20 this revision defines, kept so encoding stays lossless. */
  extraBytes: Uint8Array;
}

/**
 * A v1.x Type I Detailed Timing descriptor.
 *
 * Identical in layout to Type VII except that the pixel clock is stored in
 * 10 kHz units and byte 3 bit 7 always means "preferred" (v2.1a Section 4.3.1).
 */
export interface DisplayIdTypeIDetailedTiming {
  /** Pixel clock in kP/s, already scaled from the descriptor's 10 kHz units. */
  pixelClockKhz: number;
  aspectRatio: number;
  interlaced: boolean;
  stereoSupport: number;
  preferred: boolean;
  horizontalActive: number;
  horizontalBlank: number;
  horizontalFrontPorch: number;
  horizontalSyncWidth: number;
  horizontalSyncPositive: boolean;
  verticalActive: number;
  verticalBlank: number;
  verticalFrontPorch: number;
  verticalSyncWidth: number;
  verticalSyncPositive: boolean;
}

/** DisplayID v1.x Type I Detailed Timing data block (tag 03h). */
export interface DisplayIdTypeIDetailedTimingBlock extends DisplayIdDataBlock {
  tag: DisplayIdDataBlockTag.TypeIDetailedTiming;
  timings: DisplayIdTypeIDetailedTiming[];
}

/** 4.3.1 Type VII Timing – Detailed Timing Data Block (tag 22h). */
export interface DisplayIdTypeViiTimingBlock extends DisplayIdDataBlock {
  tag: DisplayIdDataBlockTag.TypeVIIDetailedTiming;
  /** Byte 01h[3], Block Revisions 1 and 2. */
  dscPassThrough: boolean;
  /** Byte 01h[6:4]: descriptor size is 20 + this value. */
  descriptorSize: number;
  timings: DisplayIdTypeViiTiming[];
}

/** 4.3.2 Type VIII Timing – Enumerated Timing Code Data Block (tag 23h). */
export interface DisplayIdTypeViiiTimingBlock extends DisplayIdDataBlock {
  tag: DisplayIdDataBlockTag.TypeVIIIEnumeratedTimingCode;
  /** 1 or 2 bytes per code (byte 01h[3]). */
  timingCodeSize: number;
  /** 0 = DMT, 1 = CTA VIC, 2 = HDMI VIC. */
  timingCodeType: number;
  /** Block Revision 1 only (byte 01h[5]). */
  ycc420: boolean;
  codes: number[];
}

/** 4.3.3 Type IX Formula-based Timing Descriptor (Table 4-21). */
export interface DisplayIdTypeIxTiming {
  formula: number;
  /** Also advertises the refresh rate × 1000/1001 variant. */
  fractionalRefreshRate: boolean;
  stereoSupport: number;
  horizontalActive: number;
  verticalActive: number;
  refreshRate: number;
}

/** 4.3.3 Type IX Timing – Formula-based Timing Data Block (tag 24h). */
export interface DisplayIdTypeIxTimingBlock extends DisplayIdDataBlock {
  tag: DisplayIdDataBlockTag.TypeIXFormulaBasedTiming;
  timings: DisplayIdTypeIxTiming[];
}

/** 4.3.4 Type X Formula-based Timing Descriptor (Table 4-23). */
export interface DisplayIdTypeXTiming {
  formula: number;
  /** CVT v2.1 RB Timing v3 (formula 3) only: byte 0[3]. */
  earlyVSync?: boolean;
  /** CVT v2.1 RB Timing v2 (formula 2) only: byte 0[4]. */
  fractionalRefreshRate?: boolean;
  /** RB Timing v3 only: byte 0[4], false = 80-pixel HBlank, true = 160-pixel. */
  hBlank160?: boolean;
  stereoSupport: number;
  ycc420: boolean;
  horizontalActive: number;
  verticalActive: number;
  refreshRate: number;
  /** 7- and 8-byte descriptors, RB Timing v3: resolved HBlank in pixels. */
  hBlankPixels?: number;
  deltaHBlankRaw?: number;
  /** 8-byte descriptors, RB Timing v3. */
  additionalVBlankRaw?: number;
  additionalVBlankMicroseconds?: number;
  alternateMinVBlank?: boolean;
}

/** 4.3.4 Type X Timing – Formula-based Timing Data Block (tag 2Ah). */
export interface DisplayIdTypeXTimingBlock extends DisplayIdDataBlock {
  tag: DisplayIdDataBlockTag.TypeXFormulaBasedTiming;
  /** Byte 01h[6:4]: descriptor size is 6 + this value (6, 7, or 8 bytes). */
  descriptorSize: number;
  timings: DisplayIdTypeXTiming[];
}

/** 4.4 Dynamic Video Timing Range Limits Data Block (tag 25h). */
export interface DisplayIdDynamicRangeLimitsBlock extends DisplayIdDataBlock {
  tag: DisplayIdDataBlockTag.DynamicVideoTimingRangeLimits;
  minPixelClockKhz: number;
  maxPixelClockKhz: number;
  minVerticalRefreshRate: number;
  maxVerticalRefreshRate: number;
  seamlessDynamicVideoTiming: boolean;
}

/** 4.5.4 One entry of the Additional Supported Interface Color Space and EOTF list. */
export interface DisplayIdColorSpaceEotf {
  colorSpace: number;
  eotf: number;
}

/** 4.5 Display Interface Features Data Block (tag 26h). */
export interface DisplayIdInterfaceFeaturesBlock extends DisplayIdDataBlock {
  tag: DisplayIdDataBlockTag.DisplayInterfaceFeatures;
  /** Supported bits per primary colour, per pixel encoding (4.5.1). */
  rgbColorDepths: number[];
  ycbcr444ColorDepths: number[];
  ycbcr422ColorDepths: number[];
  ycbcr420ColorDepths: number[];
  /** 4.5.2: minimum pixel rate in MP/s (74.25 × the stored multiplier). */
  minYcbcr420PixelRateMhz: number;
  minYcbcr420PixelRateRaw: number;
  audio32kHz: boolean;
  audio44kHz: boolean;
  audio48kHz: boolean;
  /** 4.5.4 Combination 1 flags, indexed by the spec's bit order. */
  colorSpaceSrgb: boolean;
  colorSpaceBt601: boolean;
  colorSpaceBt709: boolean;
  colorSpaceAdobeRgb: boolean;
  colorSpaceDciP3: boolean;
  colorSpaceBt2020: boolean;
  colorSpaceBt2020St2084: boolean;
  additionalColorSpaceEotf: DisplayIdColorSpaceEotf[];
}

/** 4.6 Stereo Display Interface Data Block (tag 27h). */
export interface DisplayIdStereoTimingDescriptor {
  timingCodeType: number;
  codes: number[];
}

export interface DisplayIdStereoInterfaceBlock extends DisplayIdDataBlock {
  tag: DisplayIdDataBlockTag.StereoDisplayInterface;
  /** Byte 01h[7:6]. */
  stereoTimingSupport: number;
  /** 4.6.1 Table 4-32 interface method code. */
  methodCode: number;
  methodParameters: Uint8Array;
  /** Method 00h: stereo sync polarity. */
  stereoPolarity?: boolean;
  /** Methods 01h and 05h: view identity. */
  viewIdentity?: boolean;
  /** Method 02h: the 8×8 interleave pattern. */
  interleavePattern?: Uint8Array;
  /** Method 03h. */
  carriesLeftEye?: boolean;
  mirroring?: number;
  /** Method 04h. */
  viewCount?: number;
  viewInterleavingMethod?: number;
  timingDescriptors: DisplayIdStereoTimingDescriptor[];
}

/** 4.7 Tiled Display Topology Data Block (tag 28h). */
export interface DisplayIdTiledDisplayBlock extends DisplayIdDataBlock {
  tag: DisplayIdDataBlockTag.TiledDisplayTopology;
  singleTileBehavior: number;
  multiTileBehavior: number;
  hasBezelInformation: boolean;
  singleEnclosure: boolean;
  totalHorizontalTiles: number;
  totalVerticalTiles: number;
  horizontalTileLocation: number;
  verticalTileLocation: number;
  horizontalTileSize: number;
  verticalTileSize: number;
  pixelMultiplier: number;
  topBezelSize: number;
  bottomBezelSize: number;
  rightBezelSize: number;
  leftBezelSize: number;
  ieeeOui: number;
  ieeeOuiText: string;
  productId: number;
  serialNumber: number;
}

/** 4.8 ContainerID Data Block (tag 29h). */
export interface DisplayIdContainerIdBlock extends DisplayIdDataBlock {
  tag: DisplayIdDataBlockTag.ContainerId;
  uuid: Uint8Array;
  uuidText: string;
}

/** 4.9 Adaptive-Sync Operation Mode and Range Descriptor (Table 4-52). */
export interface DisplayIdAdaptiveSyncRange {
  nativePanelRange: boolean;
  frameDurationIncreaseTolerance: boolean;
  frameDurationDecreaseTolerance: boolean;
  supportedModes: number;
  seamlessTransitionNotSupported: boolean;
  /** 6.2 fixed-point milliseconds. */
  maxSingleFrameDurationIncreaseMs: number;
  maxSingleFrameDurationDecreaseMs: number;
  minRefreshRate: number;
  maxRefreshRate: number;
  /** Bytes past the 6 this revision defines, kept so encoding stays lossless. */
  extraBytes: Uint8Array;
}

/** 4.9 Adaptive-Sync Data Block (tag 2Bh). */
export interface DisplayIdAdaptiveSyncBlock extends DisplayIdDataBlock {
  tag: DisplayIdDataBlockTag.AdaptiveSync;
  /** Byte 01h[6:4]: descriptor size is 6 + this value. */
  descriptorSize: number;
  ranges: DisplayIdAdaptiveSyncRange[];
}

/** 4.11 Brightness Luminance Range Data Block (tag 2Eh). */
export interface DisplayIdBrightnessLuminanceBlock extends DisplayIdDataBlock {
  tag: DisplayIdDataBlockTag.BrightnessLuminanceRange;
  /** cd/m². Negative zero means the display declined to report the value. */
  minSdrLuminance: number;
  maxSuggestedSdrLuminance: number;
  maxBoostSdrLuminance: number;
}

/** 4.12 Vendor-specific Data Block (tag 7Eh). */
export interface DisplayIdVendorSpecificBlock extends DisplayIdDataBlock {
  tag: DisplayIdDataBlockTag.VendorSpecific;
  ieeeOui: number;
  ieeeOuiText: string;
  vendorData: Uint8Array;
}

/** 4.13 One CTA data block carried inside the encapsulation block. */
export interface DisplayIdEncapsulatedCtaBlock {
  ctaTag: number;
  length: number;
  payload: Uint8Array;
}

/** 4.13 CTA-861 Data Block Encapsulation DisplayID Data Block (tag 81h). */
export interface DisplayIdCtaEncapsulationBlock extends DisplayIdDataBlock {
  tag: DisplayIdDataBlockTag.CtaDataBlockEncapsulation;
  ctaBlocks: DisplayIdEncapsulatedCtaBlock[];
}

/** Tables 2-3 and 2-4: a DisplayID Base or Extension Section. */
export interface DisplayIdSection {
  /** Structure version from byte 00h[7:4]: 1 for v1.x, 2 for v2.x. */
  version: number;
  revision: number;
  versionByte: number;
  bytesInSection: number;
  totalLength: number;
  primaryUseCase: number;
  extensionCount: number;
  blocks: DisplayIdDataBlock[];
  fillBytes: number;
  checksum: number;
  isChecksumValid: boolean;
}

/** Table 2-3: Display Product Primary Use Case. */
export const DISPLAY_ID_PRIMARY_USE_CASES: Record<number, string> = {
  0x0: 'Same as base section / extension',
  0x1: 'Test structure',
  0x2: 'Generic display',
  0x3: 'Television',
  0x4: 'Desktop productivity display',
  0x5: 'Desktop gaming display',
  0x6: 'Presentation display',
  0x7: 'Head-mounted VR display',
  0x8: 'Head-mounted AR display',
};

export class DisplayIdDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DisplayIdDecodeError';
  }
}
