<script setup lang="ts">
import { computed } from 'vue'
import type {
  DisplayIdBrightnessLuminanceBlock,
  DisplayIdContainerIdBlock,
  DisplayIdCtaEncapsulationBlock,
  DisplayIdDataBlock,
  DisplayIdStereoInterfaceBlock,
  DisplayIdVendorSpecificBlock,
} from 'edidts'
import { DisplayIdDataBlockTag, STEREO_METHOD_NAMES, displayIdBlockName } from 'edidts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import DisplayIDField from './DisplayIDField.vue'
import { TIMING_CODE_TYPES, formatLuminance, labelFor } from '@/lib/displayIdLabels'

const props = defineProps<{
  blocks: DisplayIdDataBlock[]
}>()

/** Tags that have a dedicated view elsewhere in the DisplayID navigation. */
const HANDLED_ELSEWHERE = new Set<number>([
  DisplayIdDataBlockTag.TypeIDetailedTiming,
  DisplayIdDataBlockTag.ProductIdentification,
  DisplayIdDataBlockTag.DisplayParameters,
  DisplayIdDataBlockTag.TypeVIIDetailedTiming,
  DisplayIdDataBlockTag.TypeVIIIEnumeratedTimingCode,
  DisplayIdDataBlockTag.TypeIXFormulaBasedTiming,
  DisplayIdDataBlockTag.TypeXFormulaBasedTiming,
  DisplayIdDataBlockTag.DynamicVideoTimingRangeLimits,
  DisplayIdDataBlockTag.DisplayInterfaceFeatures,
  DisplayIdDataBlockTag.TiledDisplayTopology,
  DisplayIdDataBlockTag.AdaptiveSync,
])

function blocksWithTag<T extends DisplayIdDataBlock>(tag: number): T[] {
  return props.blocks.filter(block => block.tag === tag) as T[]
}

const brightness = computed(() =>
  blocksWithTag<DisplayIdBrightnessLuminanceBlock>(DisplayIdDataBlockTag.BrightnessLuminanceRange),
)
const stereo = computed(() =>
  blocksWithTag<DisplayIdStereoInterfaceBlock>(DisplayIdDataBlockTag.StereoDisplayInterface),
)
const containers = computed(() => blocksWithTag<DisplayIdContainerIdBlock>(DisplayIdDataBlockTag.ContainerId))
const vendors = computed(() => blocksWithTag<DisplayIdVendorSpecificBlock>(DisplayIdDataBlockTag.VendorSpecific))
const encapsulated = computed(() =>
  blocksWithTag<DisplayIdCtaEncapsulationBlock>(DisplayIdDataBlockTag.CtaDataBlockEncapsulation),
)

/**
 * Blocks with no dedicated view and no field-level decoder — chiefly the ARVR
 * blocks, which DisplayID v2.1a Section 4.10 forbids in EDID extensions.
 */
const rawBlocks = computed(() =>
  props.blocks.filter(
    block =>
      !HANDLED_ELSEWHERE.has(block.tag) &&
      block.tag !== DisplayIdDataBlockTag.BrightnessLuminanceRange &&
      block.tag !== DisplayIdDataBlockTag.StereoDisplayInterface &&
      block.tag !== DisplayIdDataBlockTag.ContainerId &&
      block.tag !== DisplayIdDataBlockTag.VendorSpecific &&
      block.tag !== DisplayIdDataBlockTag.CtaDataBlockEncapsulation,
  ),
)

const hasAny = computed(
  () =>
    brightness.value.length +
      stereo.value.length +
      containers.value.length +
      vendors.value.length +
      encapsulated.value.length +
      rawBlocks.value.length >
    0,
)

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ')
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Other Data Blocks</CardTitle>
    </CardHeader>
    <CardContent class="space-y-8 text-sm">
      <section v-for="(block, index) in brightness" :key="`brightness-${index}`">
        <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Brightness Luminance Range
        </h4>
        <div class="grid grid-cols-2 gap-x-6 gap-y-1">
          <DisplayIDField label="Minimum SDR" :value="formatLuminance(block.minSdrLuminance)" />
          <DisplayIDField label="Maximum suggested SDR" :value="formatLuminance(block.maxSuggestedSdrLuminance)" />
          <DisplayIDField label="Maximum boost SDR" :value="formatLuminance(block.maxBoostSdrLuminance)" />
        </div>
      </section>

      <section v-for="(block, index) in stereo" :key="`stereo-${index}`">
        <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Stereo Display Interface
        </h4>
        <div class="grid grid-cols-2 gap-x-6 gap-y-1">
          <DisplayIDField
            label="Interface method"
            :value="STEREO_METHOD_NAMES[block.methodCode] ?? `Reserved (0x${block.methodCode.toString(16)})`"
          />
          <DisplayIDField v-if="block.stereoPolarity !== undefined" label="Stereo sync polarity">
            <span class="font-mono">{{ block.stereoPolarity ? 'High = right eye' : 'High = left eye' }}</span>
          </DisplayIDField>
          <DisplayIDField v-if="block.viewIdentity !== undefined" label="View identity">
            <span class="font-mono">{{ block.viewIdentity ? 'Reversed' : 'Left then right' }}</span>
          </DisplayIDField>
          <DisplayIDField v-if="block.viewCount !== undefined" label="Views" :value="block.viewCount" />
          <DisplayIDField
            v-if="block.carriesLeftEye !== undefined"
            label="This interface carries"
            :value="block.carriesLeftEye ? 'Left-eye view' : 'Right-eye view'"
          />
        </div>
        <div v-if="block.interleavePattern" class="mt-2 px-3">
          <span class="text-muted-foreground text-xs">8×8 interleave pattern</span>
          <p class="font-mono text-xs mt-1">{{ toHex(block.interleavePattern) }}</p>
        </div>
        <div v-for="(descriptor, i) in block.timingDescriptors" :key="i" class="mt-2 px-3">
          <span class="text-muted-foreground text-xs">
            {{ labelFor(TIMING_CODE_TYPES, descriptor.timingCodeType) }} timing codes
          </span>
          <p class="font-mono text-xs mt-1">{{ descriptor.codes.join(', ') }}</p>
        </div>
      </section>

      <section v-for="(block, index) in containers" :key="`container-${index}`">
        <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">ContainerID</h4>
        <DisplayIDField label="UUID" :value="block.uuidText" />
      </section>

      <section v-for="(block, index) in vendors" :key="`vendor-${index}`">
        <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Vendor-specific</h4>
        <div class="space-y-1">
          <DisplayIDField label="IEEE OUI" :value="block.ieeeOuiText" />
          <DisplayIDField label="Payload" :value="`${block.vendorData.length} bytes`" />
        </div>
        <p v-if="block.vendorData.length > 0" class="font-mono text-xs px-3 mt-1 break-all">
          {{ toHex(block.vendorData) }}
        </p>
      </section>

      <section v-for="(block, index) in encapsulated" :key="`cta-${index}`">
        <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          CTA-861 Data Block Encapsulation
        </h4>
        <div class="space-y-1">
          <DisplayIDField
            v-for="(cta, i) in block.ctaBlocks"
            :key="i"
            :label="`CTA tag ${cta.ctaTag}`"
            :value="`${cta.length} bytes: ${toHex(cta.payload)}`"
          />
        </div>
      </section>

      <section v-for="(block, index) in rawBlocks" :key="`raw-${index}`">
        <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          {{ displayIdBlockName(block.tag) }}
          <span class="normal-case font-normal">
            (tag 0x{{ block.tag.toString(16).toUpperCase().padStart(2, '0') }}, revision {{ block.revision }})
          </span>
        </h4>
        <p class="text-muted-foreground text-xs px-3 mb-1">
          Shown as raw bytes — no field-level decoding for this block.
        </p>
        <p class="font-mono text-xs px-3 break-all">{{ toHex(block.payload) }}</p>
      </section>

      <p v-if="!hasAny" class="text-muted-foreground">No further data blocks present.</p>
    </CardContent>
  </Card>
</template>
