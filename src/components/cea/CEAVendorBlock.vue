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
  removeSub: [kind: 'hdmi' | 'hdmiForum']
}>()

const hdmiBlock = computed(() =>
  props.cea.dataBlocks.find(
    b => b.tag === 0x03 && (b as VendorSpecificDataBlock).ieeeOui === 0x000C03
  ) as VendorSpecificDataBlock | undefined
)
const hdmiForumBlock = computed(() =>
  props.cea.dataBlocks.find(
    b => b.tag === 0x03 && (b as VendorSpecificDataBlock).ieeeOui === 0xC45DD8
  ) as VendorSpecificDataBlock | undefined
)
const hdmi = computed(() => hdmiBlock.value?.hdmi)
const forum = computed(() => hdmiForumBlock.value?.hdmiForum)

const rowClass = 'flex items-center justify-between gap-2 rounded-md border border-transparent px-3 py-2 hover:bg-muted/50 transition-colors'
const selectClass = 'flex h-8 w-full rounded-md border border-input dark:bg-input/30 bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'
const frlRates = [0, 1, 2, 3, 4, 5, 6]

function parseNumber(value: string | number, max?: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  const n = Number.isFinite(parsed) ? parsed : 0
  return max !== undefined ? Math.min(Math.max(n, 0), max) : Math.max(n, 0)
}

function updateHdmiField(field: string, value: unknown) {
  emit('update', `hdmiVendor.${field}`, value)
}

function updateHdmiForumField(field: string, value: unknown) {
  emit('update', `hdmiForumVendor.${field}`, value)
}

function updatePhysAddrPart(index: number, value: string | number) {
  if (!hdmi.value) return
  const addr = [...hdmi.value.sourcePhysicalAddress] as [number, number, number, number]
  addr[index] = parseNumber(value, 15)
  updateHdmiField('sourcePhysicalAddress', addr)
}

function onMaxFrlRateChange(event: Event) {
  updateHdmiForumField('maxFrlRate', Number((event.target as HTMLSelectElement).value))
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
    <CardHeader>
      <CardTitle>HDMI / Vendor Specific</CardTitle>
    </CardHeader>
    <CardContent class="space-y-6 text-sm">
      <section v-if="hdmi">
        <div class="flex items-center justify-between mb-3">
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">HDMI 1.4 VSDB</h4>
          <Button
            variant="ghost"
            size="sm"
            class="text-destructive hover:text-destructive hover:bg-destructive/10 h-6 px-2"
            @click="emit('removeSub', 'hdmi')"
          >
            Remove
          </Button>
        </div>
        <div class="grid grid-cols-2 gap-x-6 gap-y-3">
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">Physical Address</label>
            <div class="flex items-center gap-1">
              <Input
                type="number" :min="0" :max="15" class="w-14"
                :model-value="hdmi.sourcePhysicalAddress[0]"
                @update:model-value="(v) => updatePhysAddrPart(0, v)"
              />
              <span class="text-muted-foreground">.</span>
              <Input
                type="number" :min="0" :max="15" class="w-14"
                :model-value="hdmi.sourcePhysicalAddress[1]"
                @update:model-value="(v) => updatePhysAddrPart(1, v)"
              />
              <span class="text-muted-foreground">.</span>
              <Input
                type="number" :min="0" :max="15" class="w-14"
                :model-value="hdmi.sourcePhysicalAddress[2]"
                @update:model-value="(v) => updatePhysAddrPart(2, v)"
              />
              <span class="text-muted-foreground">.</span>
              <Input
                type="number" :min="0" :max="15" class="w-14"
                :model-value="hdmi.sourcePhysicalAddress[3]"
                @update:model-value="(v) => updatePhysAddrPart(3, v)"
              />
            </div>
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">Max TMDS Clock (MHz)</label>
            <Input
              type="number" :min="0" :step="5"
              :model-value="hdmi.maxTmdsClockMHz"
              @update:model-value="(v) => updateHdmiField('maxTmdsClockMHz', parseNumber(v))"
            />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-x-6 gap-y-1 mt-3">
          <label :class="rowClass">
            <span>AI Support</span>
            <Switch :checked="hdmi.supportsAI" @update:checked="(v: boolean) => updateHdmiField('supportsAI', v)" />
          </label>
          <label :class="rowClass">
            <span>DC Y444</span>
            <Switch :checked="hdmi.dcY444" @update:checked="(v: boolean) => updateHdmiField('dcY444', v)" />
          </label>
          <label :class="rowClass">
            <span>Deep Color 30-bit</span>
            <Switch :checked="hdmi.dc30bit" @update:checked="(v: boolean) => updateHdmiField('dc30bit', v)" />
          </label>
          <label :class="rowClass">
            <span>Deep Color 36-bit</span>
            <Switch :checked="hdmi.dc36bit" @update:checked="(v: boolean) => updateHdmiField('dc36bit', v)" />
          </label>
          <label :class="rowClass">
            <span>Deep Color 48-bit</span>
            <Switch :checked="hdmi.dc48bit" @update:checked="(v: boolean) => updateHdmiField('dc48bit', v)" />
          </label>
        </div>
      </section>
      <p v-else class="text-muted-foreground">No HDMI 1.4 VSDB present.</p>

      <section v-if="forum">
        <div class="flex items-center justify-between mb-3">
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">HDMI Forum VSDB (2.0/2.1)</h4>
          <Button
            variant="ghost"
            size="sm"
            class="text-destructive hover:text-destructive hover:bg-destructive/10 h-6 px-2"
            @click="emit('removeSub', 'hdmiForum')"
          >
            Remove
          </Button>
        </div>
        <div class="grid grid-cols-2 gap-x-6 gap-y-3">
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">Version</label>
            <Input
              type="number" :min="0"
              :model-value="forum.version"
              @update:model-value="(v) => updateHdmiForumField('version', parseNumber(v))"
            />
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">Max TMDS Rate (MHz)</label>
            <Input
              type="number" :min="0" :step="5"
              :model-value="forum.maxTmdsCharacterRate"
              @update:model-value="(v) => updateHdmiForumField('maxTmdsCharacterRate', parseNumber(v))"
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
            <Switch :checked="forum.scdc" @update:checked="(v: boolean) => updateHdmiForumField('scdc', v)" />
          </label>
        </div>

        <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-4 mb-3">HDMI 2.1 Features</h4>
        <div class="grid grid-cols-3 gap-x-6 gap-y-1">
          <label :class="rowClass">
            <span>VRR</span>
            <Switch :checked="forum.vrr" @update:checked="(v: boolean) => updateHdmiForumField('vrr', v)" />
          </label>
          <label :class="rowClass">
            <span>ALLM</span>
            <Switch :checked="forum.allm" @update:checked="(v: boolean) => updateHdmiForumField('allm', v)" />
          </label>
          <label :class="rowClass">
            <span>DSC</span>
            <Switch :checked="forum.dsc" @update:checked="(v: boolean) => updateHdmiForumField('dsc', v)" />
          </label>
          <label :class="rowClass">
            <span>CinemaVRR</span>
            <Switch :checked="forum.cnmVrr" @update:checked="(v: boolean) => updateHdmiForumField('cnmVrr', v)" />
          </label>
          <label :class="rowClass">
            <span>FAPA</span>
            <Switch :checked="forum.fapa" @update:checked="(v: boolean) => updateHdmiForumField('fapa', v)" />
          </label>
          <label :class="rowClass">
            <span>FVA</span>
            <Switch :checked="forum.fva" @update:checked="(v: boolean) => updateHdmiForumField('fva', v)" />
          </label>
          <label :class="rowClass">
            <span>UHD 4K</span>
            <Switch :checked="forum.uhd4k" @update:checked="(v: boolean) => updateHdmiForumField('uhd4k', v)" />
          </label>
        </div>

        <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-4 mb-3">Deep Color 4:2:0</h4>
        <div class="grid grid-cols-3 gap-x-6 gap-y-1">
          <label :class="rowClass">
            <span>30-bit</span>
            <Switch :checked="forum.dc30bit420" @update:checked="(v: boolean) => updateHdmiForumField('dc30bit420', v)" />
          </label>
          <label :class="rowClass">
            <span>36-bit</span>
            <Switch :checked="forum.dc36bit420" @update:checked="(v: boolean) => updateHdmiForumField('dc36bit420', v)" />
          </label>
          <label :class="rowClass">
            <span>48-bit</span>
            <Switch :checked="forum.dc48bit420" @update:checked="(v: boolean) => updateHdmiForumField('dc48bit420', v)" />
          </label>
        </div>
      </section>
      <p v-else class="text-muted-foreground">No HDMI Forum VSDB present.</p>
    </CardContent>
  </Card>
</template>
