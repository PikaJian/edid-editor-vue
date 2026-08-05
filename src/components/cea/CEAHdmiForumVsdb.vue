<script setup lang="ts">
import { computed } from 'vue'
import type { CEAExtensionBlock, VendorSpecificDataBlock } from 'edidts'
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

const forum = computed(() => (
  props.cea.dataBlocks.find(
    b => b.tag === 0x03 && (b as VendorSpecificDataBlock).ieeeOui === 0xC45DD8
  ) as VendorSpecificDataBlock | undefined
)?.hdmiForum)

const rowClass = 'flex items-center justify-between gap-2 rounded-md border border-transparent px-3 py-2 hover:bg-muted/50 transition-colors'
const selectClass = 'flex h-8 w-full rounded-md border border-input dark:bg-input/30 bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'
const frlRates = [0, 1, 2, 3, 4, 5, 6]

function parseNumber(value: string | number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0
}

function updateField(field: string, value: unknown) {
  emit('update', `hdmiForumVendor.${field}`, value)
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
      <CardTitle>HDMI Forum VSDB (2.0/2.1)</CardTitle>
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
              <span>VRR</span>
              <Switch :model-value="forum.vrr" @update:model-value="(v: boolean) => updateField('vrr', v)" />
            </label>
            <label :class="rowClass">
              <span>ALLM</span>
              <Switch :model-value="forum.allm" @update:model-value="(v: boolean) => updateField('allm', v)" />
            </label>
            <label :class="rowClass">
              <span>DSC</span>
              <Switch :model-value="forum.dsc" @update:model-value="(v: boolean) => updateField('dsc', v)" />
            </label>
            <label :class="rowClass">
              <span>CinemaVRR</span>
              <Switch :model-value="forum.cnmVrr" @update:model-value="(v: boolean) => updateField('cnmVrr', v)" />
            </label>
            <label :class="rowClass">
              <span>FAPA</span>
              <Switch :model-value="forum.fapa" @update:model-value="(v: boolean) => updateField('fapa', v)" />
            </label>
            <label :class="rowClass">
              <span>FVA</span>
              <Switch :model-value="forum.fva" @update:model-value="(v: boolean) => updateField('fva', v)" />
            </label>
            <label :class="rowClass">
              <span>UHD 4K</span>
              <Switch :model-value="forum.uhd4k" @update:model-value="(v: boolean) => updateField('uhd4k', v)" />
            </label>
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
      <p v-else class="text-muted-foreground">No HDMI Forum VSDB present.</p>
    </CardContent>
  </Card>
</template>
