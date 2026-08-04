<script setup lang="ts">
import { computed } from 'vue'
import type { CEAExtensionBlock, HDRStaticMetadataDataBlock, HDRDynamicMetadataDataBlock } from 'edidts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'

const props = defineProps<{
  cea: CEAExtensionBlock
}>()

const emit = defineEmits<{
  update: [field: string, value: unknown]
}>()

function findExtended<T>(extTag: number): T | undefined {
  return props.cea.dataBlocks.find(
    b => b.tag === 0x07 && (b as { extendedTag?: number }).extendedTag === extTag
  ) as T | undefined
}

const hdrStatic = computed(() => findExtended<HDRStaticMetadataDataBlock>(0x06))
const hdrDynamic = computed(() => findExtended<HDRDynamicMetadataDataBlock>(0x07))

const rowClass = 'flex items-center justify-between gap-2 rounded-md border border-transparent px-3 py-2 hover:bg-muted/50 transition-colors'

function updateEotf(key: keyof HDRStaticMetadataDataBlock['eotf'], value: boolean) {
  if (!hdrStatic.value) return
  emit('update', 'hdrStatic.eotf', { ...hdrStatic.value.eotf, [key]: value })
}

function parseNumber(value: string | number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toggleMaxLuminance(enabled: boolean) {
  emit('update', 'hdrStatic.maxLuminance', enabled ? 1000 : undefined)
  if (!enabled) {
    emit('update', 'hdrStatic.maxFrameAvgLuminance', undefined)
    emit('update', 'hdrStatic.minLuminance', undefined)
  }
}

function toggleMaxFrameAvg(enabled: boolean) {
  emit('update', 'hdrStatic.maxFrameAvgLuminance', enabled ? (hdrStatic.value?.maxLuminance ?? 1000) : undefined)
  if (!enabled) {
    emit('update', 'hdrStatic.minLuminance', undefined)
  }
}

function toggleMinLuminance(enabled: boolean) {
  emit('update', 'hdrStatic.minLuminance', enabled ? 0.05 : undefined)
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>HDR Metadata</CardTitle>
    </CardHeader>
    <CardContent class="space-y-6 text-sm">
      <section v-if="hdrStatic">
        <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Supported EOTFs</h4>
        <div class="grid grid-cols-2 gap-x-6 gap-y-1 mb-4">
          <label :class="rowClass">
            <span>Traditional Gamma SDR</span>
            <Switch :model-value="hdrStatic.eotf.traditionalGammaSDR" @update:model-value="(v: boolean) => updateEotf('traditionalGammaSDR', v)" />
          </label>
          <label :class="rowClass">
            <span>Traditional Gamma HDR</span>
            <Switch :model-value="hdrStatic.eotf.traditionalGammaHDR" @update:model-value="(v: boolean) => updateEotf('traditionalGammaHDR', v)" />
          </label>
          <label :class="rowClass">
            <span>SMPTE ST 2084 (HDR10)</span>
            <Switch :model-value="hdrStatic.eotf.smpte2084" @update:model-value="(v: boolean) => updateEotf('smpte2084', v)" />
          </label>
          <label :class="rowClass">
            <span>Hybrid Log-Gamma (HLG)</span>
            <Switch :model-value="hdrStatic.eotf.hlg" @update:model-value="(v: boolean) => updateEotf('hlg', v)" />
          </label>
        </div>

        <label :class="rowClass">
          <span>Static Metadata Type 1</span>
          <Switch
            :model-value="hdrStatic.staticMetadataType1"
            @update:model-value="(v: boolean) => emit('update', 'hdrStatic.staticMetadataType1', v)"
          />
        </label>

        <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-4 mb-3">Luminance</h4>
        <div class="space-y-3">
          <label :class="rowClass">
            <span>Max Luminance</span>
            <Switch :model-value="hdrStatic.maxLuminance !== undefined" @update:model-value="toggleMaxLuminance" />
          </label>
          <div v-if="hdrStatic.maxLuminance !== undefined" class="pl-4">
            <Input
              type="number" :min="0" :step="10"
              :model-value="hdrStatic.maxLuminance"
              @update:model-value="(v) => emit('update', 'hdrStatic.maxLuminance', parseNumber(v))"
            />
            <p class="text-[11px] text-muted-foreground mt-1">cd/m²</p>
          </div>

          <label v-if="hdrStatic.maxLuminance !== undefined" :class="rowClass">
            <span>Max Frame-Avg Luminance</span>
            <Switch :model-value="hdrStatic.maxFrameAvgLuminance !== undefined" @update:model-value="toggleMaxFrameAvg" />
          </label>
          <div v-if="hdrStatic.maxFrameAvgLuminance !== undefined" class="pl-4">
            <Input
              type="number" :min="0" :step="10"
              :model-value="hdrStatic.maxFrameAvgLuminance"
              @update:model-value="(v) => emit('update', 'hdrStatic.maxFrameAvgLuminance', parseNumber(v))"
            />
            <p class="text-[11px] text-muted-foreground mt-1">cd/m²</p>
          </div>

          <label v-if="hdrStatic.maxFrameAvgLuminance !== undefined" :class="rowClass">
            <span>Min Luminance</span>
            <Switch :model-value="hdrStatic.minLuminance !== undefined" @update:model-value="toggleMinLuminance" />
          </label>
          <div v-if="hdrStatic.minLuminance !== undefined" class="pl-4">
            <Input
              type="number" :min="0" :step="0.01"
              :model-value="hdrStatic.minLuminance"
              @update:model-value="(v) => emit('update', 'hdrStatic.minLuminance', parseNumber(v))"
            />
            <p class="text-[11px] text-muted-foreground mt-1">cd/m²</p>
          </div>
        </div>
      </section>
      <p v-else class="text-muted-foreground">No HDR Static Metadata block present.</p>

      <section v-if="hdrDynamic">
        <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">HDR Dynamic Metadata</h4>
        <div :class="rowClass">
          <span>Supported Types</span>
          <span class="font-mono">{{ hdrDynamic.supportedTypes.join(', ') || 'None' }}</span>
        </div>
      </section>
    </CardContent>
  </Card>
</template>
