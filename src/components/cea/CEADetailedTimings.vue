<script setup lang="ts">
import { computed, ref } from 'vue'
import { DetailedTimingDescriptor } from 'edidts'
import type { CEAExtensionBlock, CEADetailedTiming } from 'edidts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import DetailedTimingEditor from '@/components/edid/descriptors/DetailedTimingEditor.vue'

const props = defineProps<{
  cea: CEAExtensionBlock
}>()

const emit = defineEmits<{
  addTiming: []
  removeTiming: [index: number]
  updateTiming: [index: number, timing: CEADetailedTiming]
}>()

const timings = computed(() => props.cea.detailedTimings)
const expandedTimings = ref<Set<number>>(new Set())

function toggleDetails(index: number) {
  const next = new Set(expandedTimings.value)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  expandedTimings.value = next
}

function refreshRate(t: CEADetailedTiming): string {
  const hTotal = t.horizontalActive + t.horizontalBlanking
  const vTotal = t.verticalActive + t.verticalBlanking
  if (hTotal === 0 || vTotal === 0) return '0.00'
  const rate = (t.pixelClock * 1_000_000) / (hTotal * vTotal)
  return rate.toFixed(2)
}

function toDescriptor(t: CEADetailedTiming): DetailedTimingDescriptor {
  return new DetailedTimingDescriptor({
    pixelClock: t.pixelClock,
    horizontalActive: t.horizontalActive,
    horizontalBlanking: t.horizontalBlanking,
    verticalActive: t.verticalActive,
    verticalBlanking: t.verticalBlanking,
    horizontalSyncOffset: t.horizontalSyncOffset,
    horizontalSyncWidth: t.horizontalSyncWidth,
    verticalSyncOffset: t.verticalSyncOffset,
    verticalSyncWidth: t.verticalSyncWidth,
    horizontalImageSize: t.horizontalImageSize ?? 0,
    verticalImageSize: t.verticalImageSize ?? 0,
    horizontalBorder: t.horizontalBorder ?? 0,
    verticalBorder: t.verticalBorder ?? 0,
    flags: { ...t.flags, interlaced: t.interlaced },
  })
}

function fromDescriptor(d: DetailedTimingDescriptor): CEADetailedTiming {
  return {
    pixelClock: d.pixelClock,
    horizontalActive: d.horizontalActive,
    horizontalBlanking: d.horizontalBlanking,
    verticalActive: d.verticalActive,
    verticalBlanking: d.verticalBlanking,
    horizontalSyncOffset: d.horizontalSyncOffset,
    horizontalSyncWidth: d.horizontalSyncWidth,
    verticalSyncOffset: d.verticalSyncOffset,
    verticalSyncWidth: d.verticalSyncWidth,
    interlaced: d.flags.interlaced,
    horizontalImageSize: d.horizontalImageSize,
    verticalImageSize: d.verticalImageSize,
    horizontalBorder: d.horizontalBorder,
    verticalBorder: d.verticalBorder,
    flags: { ...d.flags },
  }
}
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between">
      <CardTitle>CEA Detailed Timings</CardTitle>
      <Button variant="outline" size="sm" @click="emit('addTiming')">
        Add Timing
      </Button>
    </CardHeader>
    <CardContent class="space-y-4 text-sm">
      <div v-if="timings.length > 0" class="space-y-3">
        <div
          v-for="(timing, i) in timings"
          :key="i"
          class="rounded-2xl border border-border/60 bg-card/40 shadow-sm"
        >
          <div class="flex flex-wrap items-start gap-4 border-b border-border/40 p-4">
            <div>
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Timing {{ i + 1 }}</p>
              <p class="text-lg font-semibold text-foreground">
                {{ timing.horizontalActive }}×{{ timing.verticalActive }}{{ timing.interlaced ? 'i' : 'p' }} ·
                {{ refreshRate(timing) }} Hz
              </p>
              <p class="text-xs text-muted-foreground">{{ timing.pixelClock.toFixed(2) }} MHz pixel clock</p>
            </div>
            <div class="ml-auto flex items-center gap-3">
              <span class="rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-xs font-semibold text-muted-foreground">
                {{ timing.interlaced ? 'Interlaced' : 'Progressive' }}
              </span>
              <button
                type="button"
                class="text-xs font-semibold text-foreground/80 hover:text-primary"
                @click="toggleDetails(i)"
              >
                {{ expandedTimings.has(i) ? 'Hide details' : 'Show details' }}
              </button>
              <Button
                variant="ghost"
                size="sm"
                class="text-destructive hover:text-destructive hover:bg-destructive/10"
                @click="emit('removeTiming', i)"
              >
                Remove
              </Button>
            </div>
          </div>

          <div
            v-if="expandedTimings.has(i)"
            class="border-t border-border/40 p-4 text-xs text-muted-foreground"
          >
            <DetailedTimingEditor
              :timing="toDescriptor(timing)"
              @update="(updated) => emit('updateTiming', i, fromDescriptor(updated))"
            />
          </div>
        </div>
      </div>
      <p v-else class="text-muted-foreground">No detailed timing descriptors in CEA extension.</p>
    </CardContent>
  </Card>
</template>
