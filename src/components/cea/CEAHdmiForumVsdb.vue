<script setup lang="ts">
import { computed } from 'vue'
import type { CEAExtensionBlock, SinkCapabilityDataStructure, VendorSpecificDataBlock } from 'edidts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

const props = defineProps<{
  cea: CEAExtensionBlock
}>()

const emit = defineEmits<{
  update: [field: string, value: unknown]
  remove: []
}>()

/**
 * The Sink Capability Data Structure, from whichever block carries it.
 *
 * HDMI 2.1b defines two containers for the same structure: the HF-VSDB
 * (section 10.3.2.1) and the HF-SCDB (10.3.2.2), the latter for sinks where a
 * second Vendor Specific Data Block is unwanted. A sink includes one or the
 * other, so this panel shows whichever is present.
 */
const source = computed<'vsdb' | 'scdb' | null>(() => {
  const blocks = props.cea.dataBlocks
  if (blocks.some(b => b.tag === 0x03 && (b as VendorSpecificDataBlock).ieeeOui === 0xC45DD8)) {
    return 'vsdb'
  }
  if (blocks.some(b => b.tag === 0x07 && (b as { extendedTag?: number }).extendedTag === 0x79)) {
    return 'scdb'
  }
  return null
})

const forum = computed(() => {
  if (source.value === 'scdb') {
    return (
      props.cea.dataBlocks.find(
        b => b.tag === 0x07 && (b as { extendedTag?: number }).extendedTag === 0x79,
      ) as { scds?: SinkCapabilityDataStructure } | undefined
    )?.scds
  }
  return (
    props.cea.dataBlocks.find(
      b => b.tag === 0x03 && (b as VendorSpecificDataBlock).ieeeOui === 0xC45DD8
    ) as VendorSpecificDataBlock | undefined
  )?.hdmiForum
})

/** DSC colour depths the sink accepts, per HDMI 2.1b Table 10-7 PB8. */
const dscColorDepths = computed(() => {
  const dsc = forum.value?.dsc
  if (!dsc) return '—'
  const depths = [
    dsc.bpc10 && '10 bpc',
    dsc.bpc12 && '12 bpc',
    dsc.bpc16 && '16 bpc',
  ].filter(Boolean)
  return depths.length ? depths.join(', ') : 'None declared'
})

const rowClass = 'flex items-center justify-between gap-2 rounded-md border border-transparent px-3 py-2 hover:bg-muted/50 transition-colors'
const selectClass = 'flex h-8 w-full rounded-md border border-input dark:bg-input/30 bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'
const frlRates = [0, 1, 2, 3, 4, 5, 6]

function parseNumber(value: string | number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0
}

function updateField(field: string, value: unknown) {
  // The two containers hold the same structure but live in different blocks,
  // so the handler needs to know which one to write back to.
  emit('update', `${source.value === 'scdb' ? 'hfScdb' : 'hdmiForumVendor'}.${field}`, value)
}

function onMaxFrlRateChange(event: Event) {
  updateField('maxFrlRate', Number((event.target as HTMLSelectElement).value))
}

function frlRateLabel(rate: number): string {
  const labels: Record<number, string> = {
    0: 'None',
    1: '3 Gbps (3 lanes)',
    2: '6 Gbps (3 lanes)',
    3: '6 Gbps (4 lanes)',
    4: '8 Gbps (4 lanes)',
    5: '10 Gbps (4 lanes)',
    6: '12 Gbps (4 lanes)',
  }
  return labels[rate] ?? `Rate ${rate}`
}
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between">
      <CardTitle>{{ source === 'scdb' ? 'HDMI Forum SCDB (2.1)' : 'HDMI Forum VSDB (2.0/2.1)' }}</CardTitle>
      <Button
        v-if="forum"
        variant="ghost"
        size="sm"
        class="text-destructive hover:text-destructive hover:bg-destructive/10"
        @click="emit('remove')"
      >
        Remove
      </Button>
    </CardHeader>
    <CardContent class="space-y-4 text-sm">
      <template v-if="forum">
        <p class="text-xs text-muted-foreground">IEEE OUI C4-5D-D8 — HDMI Forum</p>
        <div class="grid grid-cols-2 gap-x-6 gap-y-3">
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">Version</label>
            <Input
              type="number" :min="0"
              :model-value="forum.version"
              @update:model-value="(v) => updateField('version', parseNumber(v))"
            />
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">Max TMDS Character Rate (MHz)</label>
            <Input
              type="number" :min="0" :step="5"
              :model-value="forum.maxTmdsCharacterRate"
              @update:model-value="(v) => updateField('maxTmdsCharacterRate', parseNumber(v))"
            />
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">Max FRL Rate</label>
            <select :class="selectClass" :value="forum.maxFrlRate" @change="onMaxFrlRateChange">
              <option v-for="rate in frlRates" :key="rate" :value="rate">{{ frlRateLabel(rate) }}</option>
            </select>
          </div>
          <label :class="rowClass">
            <span>SCDC Present</span>
            <Switch :model-value="forum.scdc" @update:model-value="(v: boolean) => updateField('scdc', v)" />
          </label>
        </div>

        <section>
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">HDMI 2.1 Features</h4>
          <div class="grid grid-cols-3 gap-x-6 gap-y-1">
            <label :class="rowClass">
              <span>ALLM</span>
              <Switch :model-value="forum.allm ?? false" @update:model-value="(v: boolean) => updateField('allm', v)" />
            </label>
            <label :class="rowClass">
              <span>QMS</span>
              <Switch :model-value="forum.qms ?? false" @update:model-value="(v: boolean) => updateField('qms', v)" />
            </label>
            <label :class="rowClass">
              <span>FVA</span>
              <Switch :model-value="forum.fva ?? false" @update:model-value="(v: boolean) => updateField('fva', v)" />
            </label>
            <label :class="rowClass">
              <span>FAPA start location</span>
              <Switch
                :model-value="forum.fapaStartLocation ?? false"
                @update:model-value="(v: boolean) => updateField('fapaStartLocation', v)"
              />
            </label>
            <label :class="rowClass">
              <span>FAPA end extended</span>
              <Switch
                :model-value="forum.fapaEndExtended ?? false"
                @update:model-value="(v: boolean) => updateField('fapaEndExtended', v)"
              />
            </label>
            <label :class="rowClass">
              <span>M-Delta</span>
              <Switch :model-value="forum.mDelta ?? false" @update:model-value="(v: boolean) => updateField('mDelta', v)" />
            </label>
            <label :class="rowClass">
              <span>NEG_MVRR</span>
              <Switch :model-value="forum.negMvrr ?? false" @update:model-value="(v: boolean) => updateField('negMvrr', v)" />
            </label>
            <label :class="rowClass">
              <span>UHD VIC</span>
              <Switch :model-value="forum.uhdVic" @update:model-value="(v: boolean) => updateField('uhdVic', v)" />
            </label>
            <label :class="rowClass">
              <span>Cable status</span>
              <Switch
                :model-value="forum.cableStatus"
                @update:model-value="(v: boolean) => updateField('cableStatus', v)"
              />
            </label>
          </div>
        </section>

        <section>
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Variable Refresh Rate
            <span class="normal-case font-normal">— a range of 0 means VRR is not declared</span>
          </h4>
          <div class="grid grid-cols-2 gap-x-6 gap-y-1">
            <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              VRR min (Hz)
              <Input
                type="number"
                :min="0"
                :max="63"
                :model-value="forum.vrrMin ?? 0"
                @update:model-value="(v) => updateField('vrrMin', Number(v))"
              />
            </label>
            <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              VRR max (Hz)
              <Input
                type="number"
                :min="0"
                :max="1023"
                :model-value="forum.vrrMax ?? 0"
                @update:model-value="(v) => updateField('vrrMax', Number(v))"
              />
            </label>
          </div>
        </section>

        <section v-if="forum.dsc">
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Display Stream Compression
          </h4>
          <div class="grid grid-cols-3 gap-x-6 gap-y-1">
            <div :class="rowClass">
              <span>DSC 1.2</span>
              <span :class="forum.dsc.dsc1p2 ? 'text-emerald-500' : 'text-muted-foreground'">
                {{ forum.dsc.dsc1p2 ? 'Supported' : 'No' }}
              </span>
            </div>
            <div :class="rowClass">
              <span>Native 4:2:0</span>
              <span :class="forum.dsc.native420 ? 'text-emerald-500' : 'text-muted-foreground'">
                {{ forum.dsc.native420 ? 'Supported' : 'No' }}
              </span>
            </div>
            <div :class="rowClass">
              <span>All bpp</span>
              <span :class="forum.dsc.allBpp ? 'text-emerald-500' : 'text-muted-foreground'">
                {{ forum.dsc.allBpp ? 'Supported' : 'No' }}
              </span>
            </div>
            <div :class="rowClass">
              <span>Colour depth</span>
              <span class="font-mono text-xs">{{ dscColorDepths }}</span>
            </div>
            <div :class="rowClass">
              <span>Max FRL rate</span>
              <span class="font-mono">{{ forum.dsc.maxFrlRate }}</span>
            </div>
            <div :class="rowClass">
              <span>Max slices</span>
              <span class="font-mono">{{ forum.dsc.maxSlices }}</span>
            </div>
            <div :class="rowClass">
              <span>Total chunk kBytes</span>
              <span class="font-mono">{{ forum.dsc.totalChunkKBytes }}</span>
            </div>
          </div>
        </section>

        <section>
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Advanced</h4>
          <div class="grid grid-cols-2 gap-x-6 gap-y-1">
            <label :class="rowClass">
              <span>LTE 340Mcsc Scramble</span>
              <Switch :model-value="forum.lte340McscScramble" @update:model-value="(v: boolean) => updateField('lte340McscScramble', v)" />
            </label>
            <label :class="rowClass">
              <span>Independent View</span>
              <Switch :model-value="forum.independentView" @update:model-value="(v: boolean) => updateField('independentView', v)" />
            </label>
            <label :class="rowClass">
              <span>Dual View</span>
              <Switch :model-value="forum.dualView" @update:model-value="(v: boolean) => updateField('dualView', v)" />
            </label>
            <label :class="rowClass">
              <span>3D OSD Disparity</span>
              <Switch :model-value="forum.osd3d" @update:model-value="(v: boolean) => updateField('osd3d', v)" />
            </label>
          </div>
        </section>

        <section>
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Deep Color 4:2:0</h4>
          <div class="grid grid-cols-3 gap-x-6 gap-y-1">
            <label :class="rowClass">
              <span>30-bit</span>
              <Switch :model-value="forum.dc30bit420" @update:model-value="(v: boolean) => updateField('dc30bit420', v)" />
            </label>
            <label :class="rowClass">
              <span>36-bit</span>
              <Switch :model-value="forum.dc36bit420" @update:model-value="(v: boolean) => updateField('dc36bit420', v)" />
            </label>
            <label :class="rowClass">
              <span>48-bit</span>
              <Switch :model-value="forum.dc48bit420" @update:model-value="(v: boolean) => updateField('dc48bit420', v)" />
            </label>
          </div>
        </section>
      </template>
      <p v-else class="text-muted-foreground">No HDMI Forum VSDB or SCDB present.</p>
    </CardContent>
  </Card>
</template>
