<script setup lang="ts">
import { computed } from 'vue'
import type { DisplayIdProductIdentificationBlock } from 'edidts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import DisplayIDField from './DisplayIDField.vue'

const props = defineProps<{
  block: DisplayIdProductIdentificationBlock | null
}>()

const dateLabel = computed(() => {
  const block = props.block
  if (!block) return '—'
  if (block.year === undefined) return 'Not specified'
  if (block.isModelYear) return `Model year ${block.year}`
  if (block.manufactureWeek === undefined) return `${block.year}`
  return `Week ${block.manufactureWeek}, ${block.year}`
})
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Product Identification</CardTitle>
    </CardHeader>
    <CardContent class="text-sm">
      <div v-if="block" class="grid grid-cols-2 gap-x-6 gap-y-1">
        <DisplayIDField label="IEEE OUI" :value="block.ieeeOuiText" />
        <DisplayIDField
          label="Product ID code"
          :value="`0x${block.productId.toString(16).toUpperCase().padStart(4, '0')}`"
        />
        <DisplayIDField
          label="Serial number"
          :value="block.serialNumber === undefined ? 'Not used' : block.serialNumber"
          :muted="block.serialNumber === undefined"
        />
        <DisplayIDField label="Manufacture date" :value="dateLabel" />
        <DisplayIDField
          label="Product name"
          :value="block.productName || 'Not specified'"
          :muted="!block.productName"
        />
        <DisplayIDField label="Block revision" :value="block.revision" />
      </div>
      <p v-else class="text-muted-foreground">No Product Identification data block present.</p>
    </CardContent>
  </Card>
</template>
