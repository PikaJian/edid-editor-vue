import { VIC_TABLE, type VICDefinition } from 'edidts'

export interface VICGroup {
  label: string
  vics: VICDefinition[]
}

/**
 * Resolution families in ascending order, used to group the VIC picker.
 * Anything not matched falls into "Other".
 */
const FAMILIES: { label: string; match: (v: VICDefinition) => boolean }[] = [
  { label: 'SD / ED (480/576 and below)', match: v => v.height <= 576 },
  { label: '720p HD', match: v => v.height === 720 },
  { label: '1080 Full HD', match: v => v.height === 1080 && v.width === 1920 },
  { label: '2560×1080 ultrawide', match: v => v.height === 1080 && v.width === 2560 },
  { label: '2160 4K UHD (3840/4096)', match: v => v.height === 2160 && v.width <= 4096 },
  { label: '5120×2160 5K ultrawide', match: v => v.height === 2160 && v.width === 5120 },
  { label: '4320 8K UHD (7680)', match: v => v.height === 4320 && v.width <= 7680 },
  { label: '10240×4320 10K ultrawide', match: v => v.height === 4320 && v.width === 10240 },
]

/** Highest refresh first within a family, then by VIC for stability. */
function byRefreshDesc(a: VICDefinition, b: VICDefinition): number {
  if (b.refreshRate !== a.refreshRate) return b.refreshRate - a.refreshRate
  if (a.interlaced !== b.interlaced) return a.interlaced ? 1 : -1
  return a.vic - b.vic
}

/**
 * Group every VIC in the CTA-861 table (1-127, 193-219) by resolution family,
 * excluding any already present in `exclude`.
 */
export function groupAvailableVics(exclude: readonly number[]): VICGroup[] {
  const taken = new Set(exclude)
  const remaining = VIC_TABLE.filter(v => !taken.has(v.vic))

  const groups: VICGroup[] = []
  const claimed = new Set<number>()

  for (const family of FAMILIES) {
    const vics = remaining.filter(v => family.match(v))
    vics.forEach(v => claimed.add(v.vic))
    if (vics.length) groups.push({ label: family.label, vics: vics.sort(byRefreshDesc) })
  }

  const other = remaining.filter(v => !claimed.has(v.vic))
  if (other.length) groups.push({ label: 'Other', vics: other.sort(byRefreshDesc) })

  return groups
}

export function vicOptionLabel(v: VICDefinition): string {
  return `VIC ${v.vic} — ${v.name}`
}
