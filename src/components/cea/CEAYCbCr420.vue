<script setup lang="ts">
import { computed } from 'vue'
import { getVICDefinition } from 'edidts'
import type { CEAExtensionBlock, VideoDataBlock, YCbCr420VideoDataBlock, YCbCr420CapabilityMapDataBlock } from 'edidts'
import { groupAvailableVics, vicOptionLabel } from '@/lib/vicOptions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'

const props = defineProps<{
  cea: CEAExtensionBlock
}>()

const emit = defineEmits<{
  update: [field: string, value: unknown]
  addCapabilityMap: []
  removeCapabilityMap: []
}>()

const videoBlock = computed(() =>
  props.cea.dataBlocks.find(b => b.tag === 0x02) as VideoDataBlock | undefined
)
const ycbcr420Video = computed(() =>
  props.cea.dataBlocks.find(
    b => b.tag === 0x07 && (b as { extendedTag?: number }).extendedTag === 0x0E
  ) as YCbCr420VideoDataBlock | undefined
)
const ycbcr420Map = computed(() =>
  props.cea.dataBlocks.find(
    b => b.tag === 0x07 && (b as { extendedTag?: number }).extendedTag === 0x0F
  ) as YCbCr420CapabilityMapDataBlock | undefined
)

const vics = computed(() => ycbcr420Video.value?.vics ?? [])
const selectClass = 'flex h-8 w-full rounded-md border border-input dark:bg-input/30 bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'

function getVicLabel(vic: number): string {
  const def = getVICDefinition(vic)
  if (!def) return `VIC ${vic} (Unknown)`
  return `${def.width}×${def.height}${def.interlaced ? 'i' : 'p'} @ ${def.refreshRate}Hz ${def.aspectRatio}`
}

function toggleNative(index: number, native: boolean) {
  const updated = vics.value.map((v, i) => i === index ? { ...v, native } : v)
  emit('update', 'ycbcr420Video.vics', updated)
}

function removeVic(index: number) {
  const updated = vics.value.filter((_, i) => i !== index)
  emit('update', 'ycbcr420Video.vics', updated)
}

function addVic(vicNumber: number) {
  const updated = [...vics.value, { vic: vicNumber, native: false }]
  emit('update', 'ycbcr420Video.vics', updated)
}

const vicGroups = computed(() => groupAvailableVics(vics.value.map(v => v.vic)))

function hasBit(bitmap: Uint8Array, index: number): boolean {
  const byteIndex = Math.floor(index / 8)
  const bitInByte = index % 8
  if (byteIndex >= bitmap.length) return false
  return (bitmap[byteIndex] & (1 << bitInByte)) !== 0
}

function toggleBit(index: number, value: boolean) {
  if (!ycbcr420Map.value) return
  const byteIndex = Math.floor(index / 8)
  const bitInByte = index % 8
  const size = Math.max(ycbcr420Map.value.capabilityBitmap.length, byteIndex + 1)
  const next = new Uint8Array(size)
  next.set(ycbcr420Map.value.capabilityBitmap)
  if (value) next[byteIndex] |= (1 << bitInByte)
  else next[byteIndex] &= ~(1 << bitInByte)
  emit('update', 'ycbcr420Map.capabilityBitmap', next)
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>YCbCr 4:2:0</CardTitle>
    </CardHeader>
    <CardContent class="space-y-6 text-sm">
      <section v-if="ycbcr420Video">
        <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">YCbCr 4:2:0 Only Formats</h4>
        <div v-if="vics.length > 0" class="space-y-1">
          <div
            v-for="(v, i) in vics"
            :key="i"
            class="flex items-center justify-between gap-3 rounded-md border border-border/40 px-3 py-2 hover:bg-muted/30 transition-colors"
          >
            <div class="flex items-center gap-3 min-w-0">
              <span class="font-mono text-xs text-muted-foreground w-10 shrink-0">VIC {{ v.vic }}</span>
              <span class="text-xs truncate">{{ getVicLabel(v.vic) }}</span>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <label class="flex items-center gap-1.5 text-xs">
                <span class="text-muted-foreground">Native</span>
                <Switch :model-value="v.native" @update:model-value="(val: boolean) => toggleNative(i, val)" />
              </label>
              <Button
                variant="ghost"
                size="sm"
                class="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 px-2"
                @click="removeVic(i)"
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
        <p v-else class="text-muted-foreground">No YCbCr 4:2:0-only formats listed.</p>

        <div class="border-t pt-3 mt-3">
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Add Format</h4>
          <select
            :class="selectClass"
            @change="(e: Event) => {
              const val = parseInt((e.target as HTMLSelectElement).value, 10)
              if (!isNaN(val)) { addVic(val); (e.target as HTMLSelectElement).value = '' }
            }"
          >
            <option value="">Select VIC...</option>
            <optgroup v-for="group in vicGroups" :key="group.label" :label="group.label">
              <option v-for="vic in group.vics" :key="vic.vic" :value="vic.vic">
                {{ vicOptionLabel(vic) }}
              </option>
            </optgroup>
          </select>
        </div>
      </section>
      <p v-else class="text-muted-foreground">No YCbCr 4:2:0 Video Data Block present.</p>

      <section>
        <div class="flex items-center justify-between mb-3">
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">YCbCr 4:2:0 Capability Map</h4>
          <Button
            v-if="ycbcr420Map"
            variant="ghost"
            size="sm"
            class="text-destructive hover:text-destructive hover:bg-destructive/10 h-6 px-2"
            @click="emit('removeCapabilityMap')"
          >
            Remove
          </Button>
          <Button
            v-else
            variant="outline"
            size="sm"
            :disabled="!videoBlock || videoBlock.vics.length === 0"
            @click="emit('addCapabilityMap')"
          >
            Add Capability Map
          </Button>
        </div>
        <p v-if="!videoBlock || videoBlock.vics.length === 0" class="text-muted-foreground">
          Add SVDs to the Video Data Block first.
        </p>
        <div v-else-if="ycbcr420Map" class="space-y-1">
          <p class="text-xs text-muted-foreground mb-2">
            Marks which SVDs in the main Video Data Block also support YCbCr 4:2:0.
          </p>
          <label
            v-for="(svd, i) in videoBlock.vics"
            :key="i"
            class="flex items-center justify-between gap-3 rounded-md border border-transparent px-3 py-2 hover:bg-muted/50 transition-colors"
          >
            <span class="text-xs">VIC {{ svd.vic }} — {{ getVicLabel(svd.vic) }}</span>
            <Switch
              :model-value="hasBit(ycbcr420Map.capabilityBitmap, i)"
              @update:model-value="(v: boolean) => toggleBit(i, v)"
            />
          </label>
        </div>
        <p v-else class="text-muted-foreground">No Capability Map present.</p>
      </section>
    </CardContent>
  </Card>
</template>
