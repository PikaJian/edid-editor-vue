<script setup lang="ts">
import { computed } from 'vue'
import type { EDIDViewModel } from '@/types/edid'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const props = defineProps<{
  edid: EDIDViewModel | null
  activeSection: string
}>()

const emit = defineEmits<{
  'update:activeSection': [section: string]
  addCea: []
  removeCea: []
  addCeaBlock: [blockType: string]
  removeCeaBlock: [blockTag: number, extendedTag?: number]
  removeVendorSub: [kind: 'hdmi' | 'hdmiForum']
}>()

const edidChildren = [
  { id: 'display-info', label: 'Display Information' },
  { id: 'color-gamut', label: 'Color Characteristics' },
  { id: 'timings-established', label: 'Established Timings' },
  { id: 'timings-standard', label: 'Standard Timings' },
  { id: 'descriptor-blocks', label: 'Detailed Timing Descriptor' },
]

const hasCEA = computed(() => props.edid?.ceaExtension !== null && props.edid?.ceaExtension !== undefined)

const ceaChildren = computed(() => {
  const cea = props.edid?.ceaExtension
  if (!cea) return []
  const items: { id: string; label: string }[] = [
    { id: 'cea-header', label: 'Header & Flags' },
  ]
  const blocks = cea.dataBlocks
  if (blocks.some(b => b.tag === 0x02)) items.push({ id: 'cea-video', label: 'Video (SVDs)' })
  if (blocks.some(b => b.tag === 0x01)) items.push({ id: 'cea-audio', label: 'Audio (SADs)' })
  if (blocks.some(b => b.tag === 0x04)) items.push({ id: 'cea-speakers', label: 'Speaker Allocation' })
  const hasVsdb = (oui: number) =>
    blocks.some(b => b.tag === 0x03 && (b as { ieeeOui?: number }).ieeeOui === oui)
  if (hasVsdb(0x000C03)) items.push({ id: 'cea-vendor-hdmi', label: 'HDMI 1.4 VSDB' })
  if (hasVsdb(0xC45DD8)) items.push({ id: 'cea-vendor-forum', label: 'HDMI Forum VSDB' })
  const hasExtTag = (tag: number) =>
    blocks.some(b => b.tag === 0x07 && (b as { extendedTag?: number }).extendedTag === tag)
  if (hasExtTag(0x05)) items.push({ id: 'cea-colorimetry', label: 'Colorimetry' })
  if (hasExtTag(0x06) || hasExtTag(0x07)) items.push({ id: 'cea-hdr', label: 'HDR Metadata' })
  if (hasExtTag(0x0E) || hasExtTag(0x0F)) items.push({ id: 'cea-ycbcr420', label: 'YCbCr 4:2:0' })
  const hasVideoCap = blocks.some(b =>
    b.tag === 0x07 && (b as { extendedTag?: number }).extendedTag === 0x00
  )
  if (hasVideoCap) items.push({ id: 'cea-video-cap', label: 'Video Capability' })
  items.push({ id: 'cea-timings', label: 'Detailed Timings' })
  return items
})

const addableBlocks = computed(() => {
  const cea = props.edid?.ceaExtension
  if (!cea) return []
  const blocks = cea.dataBlocks
  const options: { type: string; label: string }[] = []
  if (!blocks.some(b => b.tag === 0x02)) options.push({ type: 'video', label: 'Video Data Block' })
  if (!blocks.some(b => b.tag === 0x01)) options.push({ type: 'audio', label: 'Audio Data Block' })
  if (!blocks.some(b => b.tag === 0x04)) options.push({ type: 'speakers', label: 'Speaker Allocation' })
  if (!blocks.some(b => b.tag === 0x07 && (b as { extendedTag?: number }).extendedTag === 0x00))
    options.push({ type: 'video-capability', label: 'Video Capability' })
  if (!blocks.some(b => b.tag === 0x07 && (b as { extendedTag?: number }).extendedTag === 0x05))
    options.push({ type: 'colorimetry', label: 'Colorimetry' })
  if (!blocks.some(b => b.tag === 0x07 && (b as { extendedTag?: number }).extendedTag === 0x06))
    options.push({ type: 'hdr-static', label: 'HDR Static Metadata' })
  if (!blocks.some(b => b.tag === 0x07 && (b as { extendedTag?: number }).extendedTag === 0x0E))
    options.push({ type: 'ycbcr420-video', label: 'YCbCr 4:2:0 Video' })
  if (!blocks.some(b => b.tag === 0x03 && (b as { ieeeOui?: number }).ieeeOui === 0x000C03))
    options.push({ type: 'hdmi-vsdb', label: 'HDMI 1.4 VSDB' })
  if (!blocks.some(b => b.tag === 0x03 && (b as { ieeeOui?: number }).ieeeOui === 0xC45DD8))
    options.push({ type: 'hdmi-forum-vsdb', label: 'HDMI Forum VSDB (2.0/2.1)' })
  return options
})

const displayIdExtensions = computed(() => props.edid?.displayIdExtensions ?? [])

const hasDisplayID = computed(() => displayIdExtensions.value.length > 0)

/**
 * The union of every parsed DisplayID section's blocks. A display may split its
 * blocks across several sections, and the detail views describe the display as
 * a whole rather than one section at a time.
 */
const displayIdBlocks = computed(() =>
  displayIdExtensions.value.flatMap(extension => extension.section?.blocks ?? [])
)

const displayIdChildren = computed(() => {
  const blocks = displayIdBlocks.value
  if (blocks.length === 0) return []

  const has = (...tags: number[]) => blocks.some(b => tags.includes(b.tag))
  const items: { id: string; label: string }[] = []

  if (has(0x20)) items.push({ id: 'did-product', label: 'Product Identification' })
  if (has(0x21)) items.push({ id: 'did-params', label: 'Display Parameters' })
  if (has(0x03, 0x22, 0x23, 0x24, 0x2a)) items.push({ id: 'did-timings', label: 'Video Timings' })
  if (has(0x26)) items.push({ id: 'did-interface', label: 'Interface Features' })
  if (has(0x2b, 0x25)) items.push({ id: 'did-adaptive-sync', label: 'Adaptive-Sync' })
  if (has(0x28)) items.push({ id: 'did-tiled', label: 'Tiled Display' })

  // Anything without a dedicated view above still needs somewhere to surface.
  const covered = [0x03, 0x20, 0x21, 0x22, 0x23, 0x24, 0x2a, 0x26, 0x2b, 0x25, 0x28]
  if (blocks.some(b => !covered.includes(b.tag))) {
    items.push({ id: 'did-other', label: 'Other Blocks' })
  }

  return items
})

function selectSection(id: string) {
  emit('update:activeSection', id)
}
</script>

<template>
  <aside class="w-52 border-r border-border bg-background p-3 flex flex-col gap-0.5 text-sm">
    <template v-if="edid">
      <!-- EDID root -->
      <button
        class="flex items-center gap-1.5 px-2 py-1.5 rounded-md font-semibold text-left w-full hover:bg-accent/50 transition-colors"
        :class="activeSection === 'overview' ? 'bg-accent text-accent-foreground' : 'text-foreground'"
        @click="selectSection('overview')"
      >
        EDID
      </button>

      <!-- EDID children -->
      <div class="ml-3 border-l border-border pl-2 flex flex-col gap-0.5">
        <button
          v-for="child in edidChildren"
          :key="child.id"
          class="px-2 py-1 rounded-md text-left w-full hover:bg-accent/50 transition-colors"
          :class="activeSection === child.id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'"
          @click="selectSection(child.id)"
        >
          {{ child.label }}
        </button>
      </div>

      <!-- CEA extension -->
      <template v-if="hasCEA">
        <div class="flex items-center justify-between mt-1">
          <button
            class="flex items-center gap-1.5 px-2 py-1.5 rounded-md font-semibold text-left hover:bg-accent/50 transition-colors flex-1"
            :class="activeSection === 'cea-overview' ? 'bg-accent text-accent-foreground' : 'text-foreground'"
            @click="selectSection('cea-overview')"
          >
            CEA
          </button>
          <Button
            variant="ghost"
            size="sm"
            class="text-destructive hover:text-destructive hover:bg-destructive/10 h-6 w-6 p-0 shrink-0"
            title="Remove CEA extension"
            @click="emit('removeCea')"
          >
            ✕
          </Button>
        </div>

        <!-- CEA children -->
        <div class="ml-3 border-l border-border pl-2 flex flex-col gap-0.5">
          <template v-for="child in ceaChildren" :key="child.id">
            <div v-if="child.id === 'cea-header' || child.id === 'cea-timings'" class="flex">
              <button
                class="px-2 py-1 rounded-md text-left w-full hover:bg-accent/50 transition-colors"
                :class="activeSection === child.id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'"
                @click="selectSection(child.id)"
              >
                {{ child.label }}
              </button>
            </div>
            <div v-else class="flex items-center">
              <button
                class="px-2 py-1 rounded-md text-left flex-1 hover:bg-accent/50 transition-colors"
                :class="activeSection === child.id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'"
                @click="selectSection(child.id)"
              >
                {{ child.label }}
              </button>
              <button
                class="text-destructive hover:text-destructive/80 h-5 w-5 flex items-center justify-center shrink-0 text-xs opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity"
                :title="`Remove ${child.label}`"
                @click.stop="
                  child.id === 'cea-video' ? emit('removeCeaBlock', 0x02) :
                  child.id === 'cea-audio' ? emit('removeCeaBlock', 0x01) :
                  child.id === 'cea-speakers' ? emit('removeCeaBlock', 0x04) :
                  child.id === 'cea-vendor-hdmi' ? emit('removeVendorSub', 'hdmi') :
                  child.id === 'cea-vendor-forum' ? emit('removeVendorSub', 'hdmiForum') :
                  child.id === 'cea-colorimetry' ? emit('removeCeaBlock', 0x07, 0x05) :
                  child.id === 'cea-hdr' ? emit('removeCeaBlock', 0x07, 0x06) :
                  child.id === 'cea-ycbcr420' ? emit('removeCeaBlock', 0x07, 0x0E) :
                  child.id === 'cea-video-cap' ? emit('removeCeaBlock', 0x07, 0x00) :
                  undefined
                "
              >
                ✕
              </button>
            </div>
          </template>

          <!-- Add data block -->
          <DropdownMenu v-if="addableBlocks.length > 0">
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" size="sm" class="w-full text-xs text-muted-foreground mt-0.5 h-7">
                + Add Block
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                v-for="opt in addableBlocks"
                :key="opt.type"
                @click="emit('addCeaBlock', opt.type)"
              >
                {{ opt.label }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </template>

      <!-- Add CEA button -->
      <Button
        v-if="!hasCEA"
        variant="outline"
        size="sm"
        class="mt-2 w-full text-xs"
        @click="emit('addCea')"
      >
        Add CEA Extension
      </Button>

      <!-- DisplayID extension -->
      <template v-if="hasDisplayID">
        <button
          class="flex items-center gap-1.5 px-2 py-1.5 rounded-md font-semibold text-left w-full mt-1 hover:bg-accent/50 transition-colors"
          :class="activeSection === 'did-overview' ? 'bg-accent text-accent-foreground' : 'text-foreground'"
          @click="selectSection('did-overview')"
        >
          DisplayID
        </button>

        <div class="ml-3 border-l border-border pl-2 flex flex-col gap-0.5">
          <button
            v-for="child in displayIdChildren"
            :key="child.id"
            class="px-2 py-1 rounded-md text-left w-full hover:bg-accent/50 transition-colors"
            :class="activeSection === child.id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'"
            @click="selectSection(child.id)"
          >
            {{ child.label }}
          </button>
        </div>
      </template>
    </template>
  </aside>
</template>
