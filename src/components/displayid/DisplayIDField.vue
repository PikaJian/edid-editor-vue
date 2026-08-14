<script setup lang="ts">
defineProps<{
  label: string
  value?: string | number | null
  /** Renders the value in the muted colour, for "absent"/"not provided" states. */
  muted?: boolean
}>()
</script>

<template>
  <div class="flex items-center justify-between gap-2 rounded-md border border-transparent px-3 py-2">
    <span class="text-muted-foreground">{{ label }}</span>
    <slot>
      <span class="font-mono" :class="muted ? 'text-muted-foreground' : ''">{{ value }}</span>
    </slot>
  </div>
</template>
