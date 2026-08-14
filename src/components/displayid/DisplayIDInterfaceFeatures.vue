<script setup lang="ts">
import type { DisplayIdInterfaceFeaturesBlock } from 'edidts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import DisplayIDField from './DisplayIDField.vue'
import { INTERFACE_COLOR_SPACES, INTERFACE_EOTFS, labelFor } from '@/lib/displayIdLabels'

const props = defineProps<{
  block: DisplayIdInterfaceFeaturesBlock | null
}>()

const encodings: { label: string; key: keyof DisplayIdInterfaceFeaturesBlock }[] = [
  { label: 'RGB', key: 'rgbColorDepths' },
  { label: 'YCbCr 4:4:4', key: 'ycbcr444ColorDepths' },
  { label: 'YCbCr 4:2:2', key: 'ycbcr422ColorDepths' },
  { label: 'YCbCr 4:2:0', key: 'ycbcr420ColorDepths' },
]

const colorSpaces: { label: string; key: keyof DisplayIdInterfaceFeaturesBlock }[] = [
  { label: 'sRGB', key: 'colorSpaceSrgb' },
  { label: 'ITU-R BT.601', key: 'colorSpaceBt601' },
  { label: 'ITU-R BT.709 / BT.1886', key: 'colorSpaceBt709' },
  { label: 'Adobe RGB', key: 'colorSpaceAdobeRgb' },
  { label: 'DCI-P3', key: 'colorSpaceDciP3' },
  { label: 'ITU-R BT.2020', key: 'colorSpaceBt2020' },
  { label: 'ITU-R BT.2020 / SMPTE ST 2084', key: 'colorSpaceBt2020St2084' },
]

const audioRates: { label: string; key: keyof DisplayIdInterfaceFeaturesBlock }[] = [
  { label: '32 kHz', key: 'audio32kHz' },
  { label: '44.1 kHz', key: 'audio44kHz' },
  { label: '48 kHz', key: 'audio48kHz' },
]

function depths(key: keyof DisplayIdInterfaceFeaturesBlock): string {
  const value = props.block?.[key] as number[] | undefined
  if (!value || value.length === 0) return 'No support indicated'
  return value.map(bits => `${bits} bpc`).join(', ')
}

function flag(key: keyof DisplayIdInterfaceFeaturesBlock): boolean {
  return props.block?.[key] === true
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Display Interface Features</CardTitle>
    </CardHeader>
    <CardContent class="space-y-6 text-sm">
      <template v-if="block">
        <section>
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Supported Color Depths
          </h4>
          <div class="space-y-1">
            <DisplayIDField
              v-for="encoding in encodings"
              :key="encoding.label"
              :label="encoding.label"
              :value="depths(encoding.key)"
              :muted="(block[encoding.key] as number[]).length === 0"
            />
          </div>
          <p v-if="block.minYcbcr420PixelRateRaw > 0" class="text-muted-foreground text-xs px-3 mt-2">
            YCbCr 4:2:0 is supported only at or above {{ block.minYcbcr420PixelRateMhz }} MP/s.
          </p>
        </section>

        <section>
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Color Space and EOTF
          </h4>
          <div class="grid grid-cols-2 gap-x-6 gap-y-1">
            <DisplayIDField v-for="space in colorSpaces" :key="space.label" :label="space.label">
              <span :class="flag(space.key) ? 'text-emerald-500' : 'text-muted-foreground'">
                {{ flag(space.key) ? 'Supported' : 'Not indicated' }}
              </span>
            </DisplayIDField>
          </div>

          <div v-if="block.additionalColorSpaceEotf.length > 0" class="mt-3 space-y-1">
            <h5 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-3">
              Additional combinations
            </h5>
            <DisplayIDField
              v-for="(entry, index) in block.additionalColorSpaceEotf"
              :key="index"
              :label="labelFor(INTERFACE_COLOR_SPACES, entry.colorSpace)"
              :value="labelFor(INTERFACE_EOTFS, entry.eotf)"
            />
          </div>
        </section>

        <section>
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Interface Audio
          </h4>
          <div class="grid grid-cols-3 gap-x-6 gap-y-1">
            <DisplayIDField v-for="rate in audioRates" :key="rate.label" :label="rate.label">
              <span :class="flag(rate.key) ? 'text-emerald-500' : 'text-muted-foreground'">
                {{ flag(rate.key) ? 'Supported' : 'Not supported' }}
              </span>
            </DisplayIDField>
          </div>
        </section>
      </template>
      <p v-else class="text-muted-foreground">No Display Interface Features data block present.</p>
    </CardContent>
  </Card>
</template>
