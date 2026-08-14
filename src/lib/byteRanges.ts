/**
 * Maps a UI section id to the byte range(s) it occupies in the encoded EDID,
 * so the hex view can highlight what the active panel edits.
 *
 * Ranges are derived by walking the encoded bytes rather than re-deriving
 * lengths from the model, so they stay correct however the encoder lays a
 * block out.
 */

export interface ByteRange {
  /** inclusive */
  start: number
  /** exclusive */
  end: number
}

const BLOCK_SIZE = 128

/** Byte offsets within the base 128-byte block, per VESA E-EDID. */
const BASE_RANGES: Record<string, ByteRange[]> = {
  'overview': [{ start: 0, end: BLOCK_SIZE }],
  // Vendor/product id, serial, manufacture date, EDID version + basic display
  // parameters. Skips the fixed 00 FF..FF 00 magic at 0-7, which isn't editable.
  'display-info': [{ start: 8, end: 25 }],
  'color-gamut': [{ start: 25, end: 35 }],
  'timings-established': [{ start: 35, end: 38 }],
  'timings-standard': [{ start: 38, end: 54 }],
  'descriptor-blocks': [{ start: 54, end: 126 }],
}

/** Index of the CEA (tag 0x02) extension block, or -1. */
function findCEABlockStart(data: Uint8Array): number {
  for (let start = BLOCK_SIZE; start + BLOCK_SIZE <= data.length; start += BLOCK_SIZE) {
    if (data[start] === 0x02) return start
  }
  return -1
}

/** Offsets of every DisplayID (tag 0x70) extension block. */
function findDisplayIDBlockStarts(data: Uint8Array): number[] {
  const starts: number[] = []
  for (let start = BLOCK_SIZE; start + BLOCK_SIZE <= data.length; start += BLOCK_SIZE) {
    if (data[start] === 0x70) starts.push(start)
  }
  return starts
}

/**
 * Walks the data blocks of one DisplayID section the way the decoder does:
 * a 3-byte header (tag, revision/flags, payload length) then the payload.
 *
 * The section starts one byte into the extension block and its four header
 * bytes precede the first data block (DisplayID v2.1a Section 2.1).
 */
function walkDisplayIDBlocks(data: Uint8Array, blockStart: number): WalkedBlock[] {
  const SECTION_HEADER = 4
  const blocks: WalkedBlock[] = []
  const sectionStart = blockStart + 1
  const bytesInSection = data[sectionStart + 1]
  const payloadEnd = Math.min(sectionStart + SECTION_HEADER + bytesInSection, blockStart + BLOCK_SIZE - 1)

  let offset = sectionStart + SECTION_HEADER
  while (offset + 3 <= payloadEnd) {
    const tag = data[offset]
    if (tag === 0x00) break // fill bytes run to the checksum

    const payloadLength = data[offset + 2]
    const end = offset + 3 + payloadLength
    if (end > payloadEnd) break

    blocks.push({ tag, range: { start: offset, end } })
    offset = end
  }
  return blocks
}

/** Which DisplayID data block tags each UI section covers. */
const DISPLAY_ID_SECTION_TAGS: Record<string, number[]> = {
  'did-product': [0x20],
  'did-params': [0x21],
  // 0x03 is the DisplayID v1.x Type I detailed timing block.
  'did-timings': [0x03, 0x22, 0x23, 0x24, 0x2a],
  'did-interface': [0x26],
  'did-adaptive-sync': [0x2b, 0x25],
  'did-tiled': [0x28],
}

/** Tags that have their own section above; everything else lands in "Other Blocks". */
const DISPLAY_ID_COVERED_TAGS = Object.values(DISPLAY_ID_SECTION_TAGS).flat()

interface WalkedBlock {
  tag: number
  extendedTag?: number
  /** For vendor-specific blocks (tag 3): the 24-bit IEEE OUI, stored little-endian. */
  ieeeOui?: number
  range: ByteRange
}

/**
 * Walk the CEA data block collection the same way the decoder does:
 * each block is a header byte (tag<<5 | length) followed by `length` payload bytes.
 */
function walkCEADataBlocks(data: Uint8Array, ceaStart: number): WalkedBlock[] {
  const blocks: WalkedBlock[] = []
  const dtdOffset = data[ceaStart + 2]
  if (dtdOffset <= 4) return blocks

  let offset = 4
  while (offset < dtdOffset && offset < BLOCK_SIZE - 1) {
    const header = data[ceaStart + offset]
    const tag = (header >> 5) & 0x07
    const length = header & 0x1F
    if (offset + 1 + length > dtdOffset) break

    blocks.push({
      tag,
      extendedTag: tag === 0x07 ? data[ceaStart + offset + 1] : undefined,
      ieeeOui: tag === 0x03 && length >= 3
        ? data[ceaStart + offset + 1] |
          (data[ceaStart + offset + 2] << 8) |
          (data[ceaStart + offset + 3] << 16)
        : undefined,
      range: { start: ceaStart + offset, end: ceaStart + offset + 1 + length },
    })
    offset += 1 + length
  }
  return blocks
}

/** Detailed timings run from dtdOffset up to the checksum, in 18-byte units. */
function ceaTimingRange(data: Uint8Array, ceaStart: number): ByteRange[] {
  const dtdOffset = data[ceaStart + 2]
  if (dtdOffset === 0 || dtdOffset >= BLOCK_SIZE - 1) return []

  let offset = dtdOffset
  while (offset + 18 <= BLOCK_SIZE - 1) {
    const pixelClock = (data[ceaStart + offset + 1] << 8) | data[ceaStart + offset]
    if (pixelClock === 0) break
    offset += 18
  }
  if (offset === dtdOffset) return []
  return [{ start: ceaStart + dtdOffset, end: ceaStart + offset }]
}

/** Which data blocks a CEA section maps to. */
function matchesSection(section: string, block: WalkedBlock): boolean {
  switch (section) {
    case 'cea-video': return block.tag === 0x02
    case 'cea-audio': return block.tag === 0x01
    case 'cea-speakers': return block.tag === 0x04
    case 'cea-vendor-hdmi': return block.tag === 0x03 && block.ieeeOui === 0x000C03
    case 'cea-vendor-forum': return block.tag === 0x03 && block.ieeeOui === 0xC45DD8
    case 'cea-video-cap': return block.tag === 0x07 && block.extendedTag === 0x00
    case 'cea-colorimetry': return block.tag === 0x07 && block.extendedTag === 0x05
    case 'cea-hdr': return block.tag === 0x07 && (block.extendedTag === 0x06 || block.extendedTag === 0x07)
    case 'cea-ycbcr420': return block.tag === 0x07 && (block.extendedTag === 0x0E || block.extendedTag === 0x0F)
    default: return false
  }
}

export function getSectionRanges(section: string, data: Uint8Array | null | undefined): ByteRange[] {
  if (!data || data.length === 0) return []

  const base = BASE_RANGES[section]
  if (base) return base.filter(r => r.start < data.length)

  if (section.startsWith('did-')) {
    const starts = findDisplayIDBlockStarts(data)
    if (starts.length === 0) return []

    if (section === 'did-overview') {
      return starts.map(start => ({ start, end: Math.min(start + BLOCK_SIZE, data.length) }))
    }

    const tags = DISPLAY_ID_SECTION_TAGS[section]
    return starts
      .flatMap(start => walkDisplayIDBlocks(data, start))
      .filter(block => (tags ? tags.includes(block.tag) : !DISPLAY_ID_COVERED_TAGS.includes(block.tag)))
      .map(block => block.range)
  }

  if (!section.startsWith('cea-')) return []

  const ceaStart = findCEABlockStart(data)
  if (ceaStart === -1) return []

  if (section === 'cea-overview') {
    return [{ start: ceaStart, end: Math.min(ceaStart + BLOCK_SIZE, data.length) }]
  }
  if (section === 'cea-header') {
    return [{ start: ceaStart, end: ceaStart + 4 }]
  }
  if (section === 'cea-timings') {
    return ceaTimingRange(data, ceaStart)
  }

  return walkCEADataBlocks(data, ceaStart)
    .filter(b => matchesSection(section, b))
    .map(b => b.range)
}

/** Flattens ranges into a set of byte offsets for O(1) lookup while rendering. */
export function rangesToOffsetSet(ranges: readonly ByteRange[]): Set<number> {
  const set = new Set<number>()
  for (const r of ranges) {
    for (let i = r.start; i < r.end; i++) set.add(i)
  }
  return set
}
