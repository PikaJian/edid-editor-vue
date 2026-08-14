<script setup lang="ts">
import type { DisplayIdAdaptiveSyncBlock, DisplayIdDynamicRangeLimitsBlock } from 'edidts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import DisplayIDField from './DisplayIDField.vue'
import { ADAPTIVE_SYNC_MODES, formatPixelClock, labelFor } from '@/lib/displayIdLabels'

defineProps<{
  adaptiveSync: DisplayIdAdaptiveSyncBlock | null
  rangeLimits: DisplayIdDynamicRangeLimitsBlock | null
}>()
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Adaptive-Sync</CardTitle>
    </CardHeader>
    <CardContent class="space-y-8 text-sm">
      <section v-if="adaptiveSync">
        <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Operation Modes and Ranges
        </h4>
        <div
          v-for="(range, index) in adaptiveSync.ranges"
          :key="index"
          class="mb-4 last:mb-0 rounded-md border border-border p-2"
        >
          <div class="grid grid-cols-2 gap-x-6 gap-y-1">
            <DisplayIDField
              label="Refresh rate range"
              :value="`${range.minRefreshRate} – ${range.maxRefreshRate} Hz`"
            />
            <DisplayIDField label="Supported modes" :value="labelFor(ADAPTIVE_SYNC_MODES, range.supportedModes)" />
            <DisplayIDField
              label="Panel range"
              :value="range.nativePanelRange ? 'Native (no frame buffering)' : 'Non-native (buffered)'"
            />
            <DisplayIDField
              label="Seamless transition"
              :value="range.seamlessTransitionNotSupported ? 'Not supported' : 'Supported'"
            />
            <DisplayIDField
              label="Max frame duration increase"
              :value="
                range.maxSingleFrameDurationIncreaseMs === 0
                  ? 'No jitter limit'
                  : `${range.maxSingleFrameDurationIncreaseMs} ms`
              "
            />
            <DisplayIDField
              label="Max frame duration decrease"
              :value="
                range.maxSingleFrameDurationDecreaseMs === 0
                  ? 'No jitter limit'
                  : `${range.maxSingleFrameDurationDecreaseMs} ms`
              "
            />
          </div>
        </div>
        <p v-if="adaptiveSync.ranges.length === 0" class="text-muted-foreground">
          The block declares no operation mode descriptors.
        </p>
      </section>

      <section v-if="rangeLimits">
        <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Dynamic Video Timing Range Limits
          <span class="normal-case font-normal">(legacy)</span>
        </h4>
        <div class="grid grid-cols-2 gap-x-6 gap-y-1">
          <DisplayIDField
            label="Vertical refresh range"
            :value="`${rangeLimits.minVerticalRefreshRate} – ${rangeLimits.maxVerticalRefreshRate} Hz`"
          />
          <DisplayIDField
            label="Seamless timing change"
            :value="rangeLimits.seamlessDynamicVideoTiming ? 'Supported' : 'Not supported'"
          />
          <DisplayIDField label="Minimum pixel clock" :value="formatPixelClock(rangeLimits.minPixelClockKhz)" />
          <DisplayIDField label="Maximum pixel clock" :value="formatPixelClock(rangeLimits.maxPixelClockKhz)" />
        </div>
      </section>

      <p v-if="!adaptiveSync && !rangeLimits" class="text-muted-foreground">
        No Adaptive-Sync or Dynamic Video Timing Range Limits data block present.
      </p>
    </CardContent>
  </Card>
</template>
