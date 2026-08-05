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

const hdmi = computed(() => (
  props.cea.dataBlocks.find(
    b => b.tag === 0x03 && (b as VendorSpecificDataBlock).ieeeOui === 0x000C03
  ) as VendorSpecificDataBlock | undefined
)?.hdmi)

const rowClass = 'flex items-center justify-between gap-2 rounded-md border border-transparent px-3 py-2 hover:bg-muted/50 transition-colors'

function parseNumber(value: string | number, max?: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  const n = Number.isFinite(parsed) ? parsed : 0
  return max !== undefined ? Math.min(Math.max(n, 0), max) : Math.max(n, 0)
}

function updateField(field: string, value: unknown) {
  emit('update', `hdmiVendor.${field}`, value)
}

function updatePhysAddrPart(index: number, value: string | number) {
  if (!hdmi.value) return
  const addr = [...hdmi.value.sourcePhysicalAddress] as [number, number, number, number]
  addr[index] = parseNumber(value, 15)
  updateField('sourcePhysicalAddress', addr)
}
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between">
      <CardTitle>HDMI 1.4 VSDB</CardTitle>
      <Button
        v-if="hdmi"
        variant="ghost"
        size="sm"
        class="text-destructive hover:text-destructive hover:bg-destructive/10"
        @click="emit('remove')"
      >
        Remove
      </Button>
    </CardHeader>
    <CardContent class="space-y-4 text-sm">
      <template v-if="hdmi">
        <p class="text-xs text-muted-foreground">IEEE OUI 00-0C-03 — HDMI Licensing, LLC</p>
        <div class="grid grid-cols-2 gap-x-6 gap-y-3">
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">Source Physical Address</label>
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
              @update:model-value="(v) => updateField('maxTmdsClockMHz', parseNumber(v))"
            />
          </div>
        </div>

        <section>
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Capabilities</h4>
          <div class="grid grid-cols-2 gap-x-6 gap-y-1">
            <label :class="rowClass">
              <span>AI Support</span>
              <Switch :model-value="hdmi.supportsAI" @update:model-value="(v: boolean) => updateField('supportsAI', v)" />
            </label>
            <label :class="rowClass">
              <span>DC Y444</span>
              <Switch :model-value="hdmi.dcY444" @update:model-value="(v: boolean) => updateField('dcY444', v)" />
            </label>
          </div>
        </section>

        <section>
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Deep Color</h4>
          <div class="grid grid-cols-3 gap-x-6 gap-y-1">
            <label :class="rowClass">
              <span>30-bit</span>
              <Switch :model-value="hdmi.dc30bit" @update:model-value="(v: boolean) => updateField('dc30bit', v)" />
            </label>
            <label :class="rowClass">
              <span>36-bit</span>
              <Switch :model-value="hdmi.dc36bit" @update:model-value="(v: boolean) => updateField('dc36bit', v)" />
            </label>
            <label :class="rowClass">
              <span>48-bit</span>
              <Switch :model-value="hdmi.dc48bit" @update:model-value="(v: boolean) => updateField('dc48bit', v)" />
            </label>
          </div>
        </section>
      </template>
      <p v-else class="text-muted-foreground">No HDMI 1.4 VSDB present.</p>
    </CardContent>
  </Card>
</template>
