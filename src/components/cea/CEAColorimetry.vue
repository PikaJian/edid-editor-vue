<script setup lang="ts">
import { computed } from 'vue'
import type { CEAExtensionBlock, ColorimetryDataBlock } from 'edidts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

const props = defineProps<{
  cea: CEAExtensionBlock
}>()

const emit = defineEmits<{
  update: [field: string, value: unknown]
}>()

const colorimetry = computed(() =>
  props.cea.dataBlocks.find(
    b => b.tag === 0x07 && (b as { extendedTag?: number }).extendedTag === 0x05
  ) as ColorimetryDataBlock | undefined
)

const colorimetryFlags: { key: keyof ColorimetryDataBlock; label: string }[] = [
  { key: 'xvYCC601', label: 'xvYCC601' },
  { key: 'xvYCC709', label: 'xvYCC709' },
  { key: 'sYCC601', label: 'sYCC601' },
  { key: 'opYCC601', label: 'opYCC601' },
  { key: 'opRGB', label: 'opRGB' },
  { key: 'bt2020cYCC', label: 'BT.2020 cYCC' },
  { key: 'bt2020YCC', label: 'BT.2020 YCC' },
  { key: 'bt2020RGB', label: 'BT.2020 RGB' },
  { key: 'dciP3', label: 'DCI-P3' },
]

const rowClass = 'flex items-center justify-between gap-2 rounded-md border border-transparent px-3 py-2 hover:bg-muted/50 transition-colors'

function updateFlag(key: string, value: boolean) {
  emit('update', `colorimetry.${key}`, value)
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Colorimetry</CardTitle>
    </CardHeader>
    <CardContent class="text-sm">
      <div v-if="colorimetry" class="grid grid-cols-3 gap-x-6 gap-y-1">
        <label v-for="flag in colorimetryFlags" :key="flag.key" :class="rowClass">
          <span>{{ flag.label }}</span>
          <Switch
            :model-value="colorimetry[flag.key] as boolean"
            @update:model-value="(v: boolean) => updateFlag(flag.key, v)"
          />
        </label>
      </div>
      <p v-else class="text-muted-foreground">No Colorimetry Data Block present.</p>
    </CardContent>
  </Card>
</template>
