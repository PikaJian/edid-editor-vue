/**
 * Human-readable labels for the DisplayID v2.1a enumerated fields.
 *
 * The decoder in `edidts` keeps raw numeric values so the data model stays
 * faithful to the bytes; this module is the presentation layer for them.
 */

/** 4.2.3 Feature Support Flags, Scan Orientation. */
export const SCAN_ORIENTATIONS = [
  'Left to right, top to bottom',
  'Right to left, top to bottom',
  'Top to bottom, right to left',
  'Bottom to top, right to left',
  'Right to left, bottom to top',
  'Left to right, bottom to top',
  'Bottom to top, left to right',
  'Top to bottom, left to right',
]

/** 4.2.3 Luminance Information. */
export const LUMINANCE_INFORMATION = [
  'Minimum guaranteed value',
  'Guidance for the source device',
]

/** 4.2.6 Native Color Depth. */
export const NATIVE_COLOR_DEPTHS = [
  'Not defined',
  '6 bpc',
  '8 bpc',
  '10 bpc',
  '12 bpc',
  '16 bpc',
]

/** 4.2.6 Display Device Technology. */
export const DISPLAY_TECHNOLOGIES = [
  'Not specified',
  'Active matrix LCD',
  'Organic LED',
]

/** 4.3.1 Aspect Ratio (Table 4-18). */
export const ASPECT_RATIOS = [
  '1:1',
  '5:4',
  '4:3',
  '15:9',
  '16:9',
  '16:10',
  '64:27',
  '256:135',
  'Calculated from pixel counts',
]

/** Shared by the Type VII, IX, and X timing descriptors. */
export const STEREO_SUPPORT = [
  'Mono only',
  'Stereo only',
  'Mono or stereo (user selectable)',
]

/** 4.3.2 and 4.6 Timing Code Type. */
export const TIMING_CODE_TYPES = ['DMT', 'CTA VIC', 'HDMI VIC']

/** 4.3.3 Type IX Timing Formula/Algorithm. */
export const TYPE_IX_FORMULAS = [
  'CVT standard CRT-based timing',
  'CVT v1.2 RB Timing v1',
  'CVT v2.1 RB Timing v2',
]

/** 4.3.4 Type X Timing Formula/Algorithm. */
export const TYPE_X_FORMULAS = [
  'CVT v1.2 standard CRT-based timing',
  'CVT v1.2 RB Timing v1',
  'CVT v2.1 RB Timing v2',
  'CVT v2.1 RB Timing v3',
]

/** 4.5.4 Supported Interface Color Space. */
export const INTERFACE_COLOR_SPACES = [
  'Not defined',
  'sRGB',
  'ITU-R BT.601',
  'ITU-R BT.709',
  'Adobe RGB',
  'DCI-P3',
  'ITU-R BT.2020',
  'Custom',
]

/** 4.5.4 Supported Interface EOTF. */
export const INTERFACE_EOTFS = [
  'Not defined',
  'sRGB',
  'ITU-R BT.601',
  'ITU-R BT.1886 (BT.709)',
  'Adobe RGB',
  'DCI-P3',
  'ITU-R BT.2020',
  'Gamma function',
  'SMPTE ST 2084',
  'Hybrid Log',
  'Custom',
]

/** 4.7.1 Tile behaviour when it is the only tile driven. */
export const SINGLE_TILE_BEHAVIORS = [
  'Not described by this revision',
  'Displayed at the tile location',
  'Scaled to fit the entire tiled display',
  'Cloned to all other tiles',
]

/** 4.7.1 Tile behaviour when some but not all tiles are driven. */
export const MULTI_TILE_BEHAVIORS = [
  'Not described by this revision',
  'Displayed at the tile location',
]

/** 4.9 Supported Adaptive-Sync Modes. */
export const ADAPTIVE_SYNC_MODES = [
  'Fixed-Average VTotal (FAVT)',
  'Fixed-Average VTotal and Adaptive VTotal (FAVT + AVT)',
]

/** Looks a label up, falling back to the raw value for reserved encodings. */
export function labelFor(labels: readonly string[], value: number): string {
  return labels[value] ?? `Reserved (${value})`
}

/** Formats a pixel clock stored in kP/s as MP/s, the unit the spec uses. */
export function formatPixelClock(kiloPixelsPerSecond: number): string {
  return `${(kiloPixelsPerSecond / 1000).toFixed(3)} MP/s`
}

/**
 * Formats a luminance field, honouring the -0 "not provided" sentinel that
 * DisplayID uses in place of a separate validity flag (4.2.5).
 */
export function formatLuminance(value: number): string {
  if (Object.is(value, -0)) return 'Not provided'
  if (!Number.isFinite(value)) return '—'
  return `${value} cd/m²`
}

/** Renders a chromaticity pair at the precision the 12-bit encoding supports. */
export function formatChromaticity(x: number, y: number): string {
  return `${x.toFixed(4)}, ${y.toFixed(4)}`
}
