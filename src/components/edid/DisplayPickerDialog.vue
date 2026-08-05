<script setup lang="ts">
import { computed } from 'vue'
import { EDID } from 'edidts'
import type { DisplayEdid } from '@/lib/readDisplayEdid'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const props = defineProps<{
  open: boolean
  displays: DisplayEdid[]
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  select: [display: DisplayEdid]
}>()

interface DisplayChoice {
  display: DisplayEdid
  name: string
  detail: string
}

/**
 * The OS only gives us a connector name, which is often the same for every
 * display. Decoding the blob gives the actual monitor name instead.
 */
function describe(display: DisplayEdid): DisplayChoice {
  let name = 'Unknown display'
  let detail = ''

  try {
    const edid = new EDID(display.bytes)
    const productName = edid.displayDescriptors.find(d => d.tag === 0xFC) as
      | { productName?: string }
      | undefined
    const manufacturer = edid.header.manufacturerId
    name = productName?.productName?.trim() || `${manufacturer} ${edid.header.productCode}`

    const preferred = edid.detailedTimings[0]
    const parts: string[] = []
    if (preferred) {
      parts.push(`${preferred.horizontalActive}×${preferred.verticalActive} @ ${preferred.refreshRate.toFixed(0)}Hz`)
    }
    parts.push(`${display.bytes.length} bytes`)
    if (display.connector) parts.push(display.connector)
    detail = parts.join(' · ')
  } catch {
    detail = `${display.bytes.length} bytes — could not be decoded`
  }

  return { display, name, detail }
}

const choices = computed<DisplayChoice[]>(() => props.displays.map(describe))

function choose(display: DisplayEdid) {
  emit('select', display)
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Select a display</DialogTitle>
        <DialogDescription>
          {{ displays.length }} displays are connected. Choose which EDID to load.
        </DialogDescription>
      </DialogHeader>
      <div class="space-y-2">
        <button
          v-for="choice in choices"
          :key="choice.display.id"
          type="button"
          class="w-full rounded-lg border border-border px-3 py-2 text-left transition-colors hover:border-primary hover:bg-muted focus-visible:border-primary focus-visible:bg-muted outline-none"
          @click="choose(choice.display)"
        >
          <div class="text-sm font-semibold text-foreground">{{ choice.name }}</div>
          <p class="text-xs text-muted-foreground">{{ choice.detail }}</p>
        </button>
      </div>
    </DialogContent>
  </Dialog>
</template>
