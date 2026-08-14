<script setup lang="ts">
import type { DisplayIdDisplayParametersBlock } from 'edidts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import DisplayIDField from './DisplayIDField.vue'
import {
  DISPLAY_TECHNOLOGIES,
  LUMINANCE_INFORMATION,
  NATIVE_COLOR_DEPTHS,
  SCAN_ORIENTATIONS,
  formatChromaticity,
  formatLuminance,
  labelFor,
} from '@/lib/displayIdLabels'

defineProps<{
  block: DisplayIdDisplayParametersBlock | null
}>()
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Display Parameters</CardTitle>
    </CardHeader>
    <CardContent class="space-y-6 text-sm">
      <template v-if="block">
        <section>
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Geometry</h4>
          <div class="grid grid-cols-2 gap-x-6 gap-y-1">
            <DisplayIDField label="Image size" :value="`${block.horizontalImageSizeMm} × ${block.verticalImageSizeMm} mm`" />
            <DisplayIDField
              label="Native format"
              :value="`${block.horizontalPixelCount} × ${block.verticalPixelCount}`"
            />
            <DisplayIDField label="Size precision" :value="block.imageSizeMultiplier ? '1.0 mm' : '0.1 mm'" />
            <DisplayIDField label="Scan orientation" :value="labelFor(SCAN_ORIENTATIONS, block.scanOrientation)" />
          </div>
        </section>

        <section>
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Native Color Chromaticity ({{ block.usesCie1976 ? "CIE 1976 u', v'" : 'CIE 1931 x, y' }})
          </h4>
          <div class="grid grid-cols-2 gap-x-6 gap-y-1">
            <DisplayIDField label="Primary 1" :value="formatChromaticity(block.primary1.x, block.primary1.y)" />
            <DisplayIDField label="Primary 2" :value="formatChromaticity(block.primary2.x, block.primary2.y)" />
            <DisplayIDField label="Primary 3" :value="formatChromaticity(block.primary3.x, block.primary3.y)" />
            <DisplayIDField label="White point" :value="formatChromaticity(block.whitePoint.x, block.whitePoint.y)" />
          </div>
        </section>

        <section>
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Luminance</h4>
          <div class="grid grid-cols-2 gap-x-6 gap-y-1">
            <DisplayIDField
              label="Maximum (full coverage)"
              :value="formatLuminance(block.nativeMaxLuminanceFullCoverage)"
            />
            <DisplayIDField
              label="Maximum (10% rectangle)"
              :value="formatLuminance(block.nativeMaxLuminance10Percent)"
            />
            <DisplayIDField label="Minimum" :value="formatLuminance(block.nativeMinLuminance)" />
            <DisplayIDField
              label="Interpretation"
              :value="labelFor(LUMINANCE_INFORMATION, block.luminanceInformation)"
            />
          </div>
        </section>

        <section>
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Panel</h4>
          <div class="grid grid-cols-2 gap-x-6 gap-y-1">
            <DisplayIDField label="Native color depth" :value="labelFor(NATIVE_COLOR_DEPTHS, block.nativeColorDepth)" />
            <DisplayIDField
              label="Display technology"
              :value="labelFor(DISPLAY_TECHNOLOGIES, block.displayDeviceTechnology)"
            />
            <DisplayIDField
              label="Native gamma EOTF"
              :value="block.nativeGamma === undefined ? 'Not provided' : block.nativeGamma.toFixed(2)"
              :muted="block.nativeGamma === undefined"
            />
            <DisplayIDField label="Theme preference" :value="block.darkThemePreferred ? 'Dark theme preferred' : 'No preference'" />
            <DisplayIDField
              label="Audio speakers"
              :value="block.speakersNotIntegrated ? 'External jack' : 'Integrated'"
            />
            <DisplayIDField label="Block revision" :value="block.revision" />
          </div>
        </section>
      </template>
      <p v-else class="text-muted-foreground">No Display Parameters data block present.</p>
    </CardContent>
  </Card>
</template>
