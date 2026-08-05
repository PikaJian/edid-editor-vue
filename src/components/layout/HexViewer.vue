<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { ScrollArea } from '@/components/ui/scroll-area'
import { rangesToOffsetSet, type ByteRange } from '@/lib/byteRanges'

const props = defineProps<{
  data?: Uint8Array | null
  highlight?: ByteRange[]
}>()

const displayData = computed(() => props.data ?? new Uint8Array(128))
const highlighted = computed(() => rangesToOffsetSet(props.highlight ?? []))
const highlightCount = computed(() => highlighted.value.size)

const firstHighlightRow = computed(() => {
  const ranges = props.highlight ?? []
  if (!ranges.length) return -1
  return Math.floor(Math.min(...ranges.map(r => r.start)) / 8)
})

const rowRefs = ref<Record<number, HTMLElement | null>>({})

function setRowRef(rowIndex: number, el: unknown) {
  rowRefs.value[rowIndex] = (el as HTMLElement | null) ?? null
}

// Bring the highlighted region into view when the active section changes.
// Scrolls the ScrollArea viewport directly rather than using scrollIntoView,
// which would also scroll ancestor containers and shift the whole layout.
watch(firstHighlightRow, async (row) => {
  if (row < 0) return
  await nextTick()
  const rowEl = rowRefs.value[row]
  if (!rowEl) return
  const viewport = rowEl.closest('[data-slot="scroll-area-viewport"]') as HTMLElement | null
  if (!viewport) return
  const target = rowEl.offsetTop - (viewport.clientHeight / 2) + (rowEl.offsetHeight / 2)
  viewport.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
})

function formatHex(byte: number): string {
  return byte.toString(16).padStart(2, '0').toUpperCase()
}

function getRows(data: Uint8Array): number[][] {
  const rows: number[][] = []
  for (let i = 0; i < data.length; i += 8) {
    rows.push(Array.from(data.slice(i, i + 8)))
  }
  return rows
}
</script>

<template>
  <aside class="w-64 h-full min-h-0 border-l border-border bg-background flex flex-col">
    <div class="p-3 border-b border-border flex justify-between items-center shrink-0">
      <h2 class="text-sm font-medium">Hex View</h2>
      <span class="text-xs text-muted-foreground">
        <template v-if="highlightCount">{{ highlightCount }} of {{ displayData.length }} bytes</template>
        <template v-else>{{ displayData.length }} bytes</template>
      </span>
    </div>
    <ScrollArea class="flex-1 min-h-0">
      <div class="p-3 font-mono text-xs">
        <div
          v-for="(row, rowIndex) in getRows(displayData)"
          :key="rowIndex"
          :ref="(el) => setRowRef(rowIndex, el)"
          class="flex gap-1 py-0.5"
        >
          <span class="text-muted-foreground w-8">{{ (rowIndex * 8).toString(16).padStart(3, '0').toUpperCase() }}</span>
          <span
            v-for="(byte, byteIndex) in row"
            :key="byteIndex"
            class="w-6 text-center rounded cursor-default transition-colors"
            :class="highlighted.has((rowIndex * 8) + byteIndex)
              ? 'bg-primary/20 text-primary font-semibold ring-1 ring-primary/40'
              : highlightCount ? 'text-muted-foreground/50 hover:bg-accent' : 'hover:bg-accent'"
            :title="`Offset 0x${((rowIndex * 8) + byteIndex).toString(16).toUpperCase()}`"
          >
            {{ formatHex(byte) }}
          </span>
        </div>
      </div>
    </ScrollArea>
  </aside>
</template>
