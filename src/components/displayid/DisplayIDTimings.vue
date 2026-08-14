<script setup lang="ts">
import { computed } from 'vue'
import type {
  DisplayIdDataBlock,
  DisplayIdTypeIDetailedTimingBlock,
  DisplayIdTypeIxTimingBlock,
  DisplayIdTypeViiTimingBlock,
  DisplayIdTypeViiiTimingBlock,
  DisplayIdTypeXTimingBlock,
} from 'edidts'
import { DisplayIdDataBlockTag } from 'edidts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import DisplayIDField from './DisplayIDField.vue'
import {
  ASPECT_RATIOS,
  STEREO_SUPPORT,
  TIMING_CODE_TYPES,
  TYPE_IX_FORMULAS,
  TYPE_X_FORMULAS,
  formatPixelClock,
  labelFor,
} from '@/lib/displayIdLabels'

const props = defineProps<{
  blocks: DisplayIdDataBlock[]
}>()

const typeI = computed(
  () => props.blocks.filter(b => b.tag === DisplayIdDataBlockTag.TypeIDetailedTiming) as DisplayIdTypeIDetailedTimingBlock[],
)

const typeVii = computed(
  () => props.blocks.filter(b => b.tag === DisplayIdDataBlockTag.TypeVIIDetailedTiming) as DisplayIdTypeViiTimingBlock[],
)
const typeViii = computed(
  () =>
    props.blocks.filter(
      b => b.tag === DisplayIdDataBlockTag.TypeVIIIEnumeratedTimingCode,
    ) as DisplayIdTypeViiiTimingBlock[],
)
const typeIx = computed(
  () => props.blocks.filter(b => b.tag === DisplayIdDataBlockTag.TypeIXFormulaBasedTiming) as DisplayIdTypeIxTimingBlock[],
)
const typeX = computed(
  () => props.blocks.filter(b => b.tag === DisplayIdDataBlockTag.TypeXFormulaBasedTiming) as DisplayIdTypeXTimingBlock[],
)

const hasAny = computed(
  () =>
    typeI.value.length + typeVii.value.length + typeViii.value.length + typeIx.value.length + typeX.value.length >
    0,
)

/** Refresh rate derived from the detailed timing's own totals. */
function refreshRate(pixelClockKhz: number, hTotal: number, vTotal: number): string {
  if (hTotal === 0 || vTotal === 0) return '—'
  return `${((pixelClockKhz * 1000) / (hTotal * vTotal)).toFixed(3)} Hz`
}

const cellClass = 'px-3 py-2 text-left align-top'
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Video Timings</CardTitle>
    </CardHeader>
    <CardContent class="space-y-8 text-sm">
      <!-- Type I: the DisplayID v1.x detailed timing descriptor -->
      <section v-for="(block, blockIndex) in typeI" :key="`i-${blockIndex}`">
        <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Type I Detailed Timing
          <span class="normal-case font-normal">(DisplayID v1.x, revision {{ block.revision }})</span>
        </h4>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="text-xs uppercase tracking-wide text-muted-foreground">
              <tr class="border-b border-border">
                <th :class="cellClass">#</th>
                <th :class="cellClass">Resolution</th>
                <th :class="cellClass">Pixel clock</th>
                <th :class="cellClass">Refresh</th>
                <th :class="cellClass">H (blank / fp / sync)</th>
                <th :class="cellClass">V (blank / fp / sync)</th>
                <th :class="cellClass">Flags</th>
              </tr>
            </thead>
            <tbody class="font-mono text-xs">
              <tr v-for="(timing, index) in block.timings" :key="index" class="border-b border-border/50">
                <td :class="cellClass">{{ index + 1 }}</td>
                <td :class="cellClass">
                  {{ timing.horizontalActive }} × {{ timing.verticalActive }}
                  <span v-if="timing.interlaced">i</span>
                </td>
                <td :class="cellClass">{{ formatPixelClock(timing.pixelClockKhz) }}</td>
                <td :class="cellClass">
                  {{
                    refreshRate(
                      timing.pixelClockKhz,
                      timing.horizontalActive + timing.horizontalBlank,
                      timing.verticalActive + timing.verticalBlank,
                    )
                  }}
                </td>
                <td :class="cellClass">
                  {{ timing.horizontalBlank }} / {{ timing.horizontalFrontPorch }} /
                  {{ timing.horizontalSyncWidth }}{{ timing.horizontalSyncPositive ? '+' : '−' }}
                </td>
                <td :class="cellClass">
                  {{ timing.verticalBlank }} / {{ timing.verticalFrontPorch }} /
                  {{ timing.verticalSyncWidth }}{{ timing.verticalSyncPositive ? '+' : '−' }}
                </td>
                <td :class="cellClass" class="font-sans">
                  <span class="text-muted-foreground">{{ labelFor(ASPECT_RATIOS, timing.aspectRatio) }}</span>
                  <template v-if="timing.preferred"> · preferred</template>
                  <template v-if="timing.stereoSupport">
                    · {{ labelFor(STEREO_SUPPORT, timing.stereoSupport) }}
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Type VII: full detailed timing descriptors -->
      <section v-for="(block, blockIndex) in typeVii" :key="`vii-${blockIndex}`">
        <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Type VII Detailed Timing
          <span class="normal-case font-normal">
            (revision {{ block.revision }}, {{ block.descriptorSize }}-byte descriptors<template
              v-if="block.dscPassThrough"
            >, DSC pass-through</template>)
          </span>
        </h4>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="text-xs uppercase tracking-wide text-muted-foreground">
              <tr class="border-b border-border">
                <th :class="cellClass">#</th>
                <th :class="cellClass">Resolution</th>
                <th :class="cellClass">Pixel clock</th>
                <th :class="cellClass">Refresh</th>
                <th :class="cellClass">H (blank / fp / sync)</th>
                <th :class="cellClass">V (blank / fp / sync)</th>
                <th :class="cellClass">Flags</th>
              </tr>
            </thead>
            <tbody class="font-mono text-xs">
              <tr v-for="(timing, index) in block.timings" :key="index" class="border-b border-border/50">
                <td :class="cellClass">{{ index + 1 }}</td>
                <td :class="cellClass">
                  {{ timing.horizontalActive }} × {{ timing.verticalActive }}
                  <span v-if="timing.interlaced">i</span>
                </td>
                <td :class="cellClass">{{ formatPixelClock(timing.pixelClockKhz) }}</td>
                <td :class="cellClass">
                  {{
                    refreshRate(
                      timing.pixelClockKhz,
                      timing.horizontalActive + timing.horizontalBlank,
                      timing.verticalActive + timing.verticalBlank,
                    )
                  }}
                </td>
                <td :class="cellClass">
                  {{ timing.horizontalBlank }} / {{ timing.horizontalFrontPorch }} /
                  {{ timing.horizontalSyncWidth }}{{ timing.horizontalSyncPositive ? '+' : '−' }}
                </td>
                <td :class="cellClass">
                  {{ timing.verticalBlank }} / {{ timing.verticalFrontPorch }} /
                  {{ timing.verticalSyncWidth }}{{ timing.verticalSyncPositive ? '+' : '−' }}
                </td>
                <td :class="cellClass" class="font-sans">
                  <span class="text-muted-foreground">{{ labelFor(ASPECT_RATIOS, timing.aspectRatio) }}</span>
                  <template v-if="timing.preferred"> · preferred</template>
                  <template v-if="timing.ycc420"> · YCbCr 4:2:0</template>
                  <template v-if="timing.stereoSupport">
                    · {{ labelFor(STEREO_SUPPORT, timing.stereoSupport) }}
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Type VIII: enumerated timing codes -->
      <section v-for="(block, blockIndex) in typeViii" :key="`viii-${blockIndex}`">
        <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Type VIII Enumerated Timing Codes
          <span class="normal-case font-normal">
            ({{ labelFor(TIMING_CODE_TYPES, block.timingCodeType) }}, {{ block.timingCodeSize }}-byte codes<template
              v-if="block.ycc420"
            >, YCbCr 4:2:0</template>)
          </span>
        </h4>
        <div v-if="block.codes.length > 0" class="flex flex-wrap gap-1.5">
          <span
            v-for="(code, index) in block.codes"
            :key="index"
            class="rounded-md bg-muted px-2 py-1 font-mono text-xs"
          >
            {{ code }}
          </span>
        </div>
        <p v-else class="text-muted-foreground">No timing codes listed.</p>
      </section>

      <!-- Type IX and Type X: formula-based timings -->
      <section v-for="(block, blockIndex) in typeIx" :key="`ix-${blockIndex}`">
        <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Type IX Formula-based Timing
        </h4>
        <div class="space-y-1">
          <DisplayIDField
            v-for="(timing, index) in block.timings"
            :key="index"
            :label="`${timing.horizontalActive} × ${timing.verticalActive} @ ${timing.refreshRate} Hz`"
            :value="
              labelFor(TYPE_IX_FORMULAS, timing.formula) +
              (timing.fractionalRefreshRate ? ' · 1000/1001 variant' : '')
            "
          />
        </div>
      </section>

      <section v-for="(block, blockIndex) in typeX" :key="`x-${blockIndex}`">
        <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Type X Formula-based Timing
          <span class="normal-case font-normal">({{ block.descriptorSize }}-byte descriptors)</span>
        </h4>
        <div class="space-y-1">
          <DisplayIDField
            v-for="(timing, index) in block.timings"
            :key="index"
            :label="`${timing.horizontalActive} × ${timing.verticalActive} @ ${timing.refreshRate} Hz`"
          >
            <span class="text-right">
              <span class="font-mono">{{ labelFor(TYPE_X_FORMULAS, timing.formula) }}</span>
              <span class="text-muted-foreground text-xs block">
                <template v-if="timing.fractionalRefreshRate">1000/1001 variant · </template>
                <template v-if="timing.earlyVSync">early VSync · </template>
                <template v-if="timing.hBlankPixels">{{ timing.hBlankPixels }}px HBlank · </template>
                <template v-if="timing.additionalVBlankMicroseconds">
                  +{{ timing.additionalVBlankMicroseconds }}µs VBlank ·
                </template>
                <template v-if="timing.alternateMinVBlank">alternate min VBlank · </template>
                <template v-if="timing.ycc420">YCbCr 4:2:0</template>
              </span>
            </span>
          </DisplayIDField>
        </div>
      </section>

      <p v-if="!hasAny" class="text-muted-foreground">No video timing data blocks present.</p>
    </CardContent>
  </Card>
</template>
