<script setup lang="ts">
import { reactive, computed, watch } from 'vue'
import { DetailedTimingDescriptor } from 'edidts'
import type { DetailedTimingInput, SyncType } from 'edidts'
import { Input } from '@/components/ui/input'

const props = defineProps<{
  timing: DetailedTimingDescriptor
}>()

const emit = defineEmits<{
  update: [timing: DetailedTimingDescriptor]
}>()

type NumberField =
  | 'pixelClock'
  | 'horizontalActive'
  | 'horizontalBlanking'
  | 'horizontalSyncOffset'
  | 'horizontalSyncWidth'
  | 'verticalActive'
  | 'verticalBlanking'
  | 'verticalSyncOffset'
  | 'verticalSyncWidth'
  | 'horizontalImageSize'
  | 'verticalImageSize'
  | 'horizontalBorder'
  | 'verticalBorder'

const selectClass = 'flex h-8 w-full rounded-md border border-input dark:bg-input/30 bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'

const syncTypeOptions: Array<{ value: SyncType; label: string }> = [
  { value: 'digital-separate', label: 'Digital Separate' },
  { value: 'digital-composite', label: 'Digital Composite' },
  { value: 'analog-composite', label: 'Analog Composite' },
  { value: 'bipolar-analog-composite', label: 'Bipolar Analog Composite' },
]

function cloneInput(t: DetailedTimingDescriptor): DetailedTimingInput {
  return {
    pixelClock: t.pixelClock,
    horizontalActive: t.horizontalActive,
    horizontalBlanking: t.horizontalBlanking,
    verticalActive: t.verticalActive,
    verticalBlanking: t.verticalBlanking,
    horizontalSyncOffset: t.horizontalSyncOffset,
    horizontalSyncWidth: t.horizontalSyncWidth,
    verticalSyncOffset: t.verticalSyncOffset,
    verticalSyncWidth: t.verticalSyncWidth,
    horizontalImageSize: t.horizontalImageSize,
    verticalImageSize: t.verticalImageSize,
    horizontalBorder: t.horizontalBorder,
    verticalBorder: t.verticalBorder,
    flags: { ...t.flags },
  }
}

const local = reactive<DetailedTimingInput>(cloneInput(props.timing))

watch(
  () => props.timing,
  (next) => Object.assign(local, cloneInput(next)),
  { deep: true },
)

const showHSyncPolarity = computed(() =>
  local.flags?.syncType === 'digital-separate' || local.flags?.syncType === 'digital-composite',
)
const showVSyncPolarity = computed(() => local.flags?.syncType === 'digital-separate')

function parseNumber(value: string | number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function emitUpdate() {
  emit('update', new DetailedTimingDescriptor(local))
}

function updateNumberField(field: NumberField, value: string | number) {
  local[field] = parseNumber(value)
  emitUpdate()
}

function updateInterlaced(checked: boolean) {
  local.flags = { ...local.flags, interlaced: checked }
  emitUpdate()
}

function updateSyncType(value: SyncType) {
  local.flags = { ...local.flags, syncType: value }
  emitUpdate()
}

function updateHSyncPolarity(value: 'positive' | 'negative') {
  local.flags = { ...local.flags, hSyncPolarity: value }
  emitUpdate()
}

function updateVSyncPolarity(value: 'positive' | 'negative') {
  local.flags = { ...local.flags, vSyncPolarity: value }
  emitUpdate()
}

function onSyncTypeChange(event: Event) {
  updateSyncType((event.target as HTMLSelectElement).value as SyncType)
}

function onHSyncPolarityChange(event: Event) {
  updateHSyncPolarity((event.target as HTMLSelectElement).value as 'positive' | 'negative')
}

function onVSyncPolarityChange(event: Event) {
  updateVSyncPolarity((event.target as HTMLSelectElement).value as 'positive' | 'negative')
}
</script>

<template>
  <div class="space-y-3 text-xs">
    <div class="grid gap-3 sm:grid-cols-3">
      <label class="flex flex-col gap-1">
        Pixel Clock (MHz)
        <Input
          type="number"
          :min="0"
          :step="0.01"
          :model-value="local.pixelClock"
          @update:model-value="(v) => updateNumberField('pixelClock', v)"
        />
      </label>
      <label class="flex items-center gap-2 self-end pb-1.5">
        <input
          type="checkbox"
          class="size-4 rounded border border-input accent-primary"
          :checked="local.flags?.interlaced ?? false"
          @change="(e) => updateInterlaced((e.target as HTMLInputElement).checked)"
        >
        Interlaced
      </label>
    </div>

    <div class="rounded-lg border border-border/40 p-3">
      <p class="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">Horizontal</p>
      <div class="grid gap-3 sm:grid-cols-3">
        <label class="flex flex-col gap-1">
          Active (px)
          <Input
            type="number"
            :min="0"
            :model-value="local.horizontalActive"
            @update:model-value="(v) => updateNumberField('horizontalActive', v)"
          />
        </label>
        <label class="flex flex-col gap-1">
          Blanking (px)
          <Input
            type="number"
            :min="0"
            :model-value="local.horizontalBlanking"
            @update:model-value="(v) => updateNumberField('horizontalBlanking', v)"
          />
        </label>
        <label class="flex flex-col gap-1">
          Sync Offset (px)
          <Input
            type="number"
            :min="0"
            :model-value="local.horizontalSyncOffset"
            @update:model-value="(v) => updateNumberField('horizontalSyncOffset', v)"
          />
        </label>
        <label class="flex flex-col gap-1">
          Sync Width (px)
          <Input
            type="number"
            :min="0"
            :model-value="local.horizontalSyncWidth"
            @update:model-value="(v) => updateNumberField('horizontalSyncWidth', v)"
          />
        </label>
        <label class="flex flex-col gap-1">
          Image Size (mm)
          <Input
            type="number"
            :min="0"
            :model-value="local.horizontalImageSize"
            @update:model-value="(v) => updateNumberField('horizontalImageSize', v)"
          />
        </label>
        <label class="flex flex-col gap-1">
          Border (px)
          <Input
            type="number"
            :min="0"
            :model-value="local.horizontalBorder"
            @update:model-value="(v) => updateNumberField('horizontalBorder', v)"
          />
        </label>
      </div>
    </div>

    <div class="rounded-lg border border-border/40 p-3">
      <p class="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">Vertical</p>
      <div class="grid gap-3 sm:grid-cols-3">
        <label class="flex flex-col gap-1">
          Active (lines)
          <Input
            type="number"
            :min="0"
            :model-value="local.verticalActive"
            @update:model-value="(v) => updateNumberField('verticalActive', v)"
          />
        </label>
        <label class="flex flex-col gap-1">
          Blanking (lines)
          <Input
            type="number"
            :min="0"
            :model-value="local.verticalBlanking"
            @update:model-value="(v) => updateNumberField('verticalBlanking', v)"
          />
        </label>
        <label class="flex flex-col gap-1">
          Sync Offset (lines)
          <Input
            type="number"
            :min="0"
            :model-value="local.verticalSyncOffset"
            @update:model-value="(v) => updateNumberField('verticalSyncOffset', v)"
          />
        </label>
        <label class="flex flex-col gap-1">
          Sync Width (lines)
          <Input
            type="number"
            :min="0"
            :model-value="local.verticalSyncWidth"
            @update:model-value="(v) => updateNumberField('verticalSyncWidth', v)"
          />
        </label>
        <label class="flex flex-col gap-1">
          Image Size (mm)
          <Input
            type="number"
            :min="0"
            :model-value="local.verticalImageSize"
            @update:model-value="(v) => updateNumberField('verticalImageSize', v)"
          />
        </label>
        <label class="flex flex-col gap-1">
          Border (lines)
          <Input
            type="number"
            :min="0"
            :model-value="local.verticalBorder"
            @update:model-value="(v) => updateNumberField('verticalBorder', v)"
          />
        </label>
      </div>
    </div>

    <div class="rounded-lg border border-border/40 p-3">
      <p class="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">Sync</p>
      <div class="grid gap-3 sm:grid-cols-3">
        <label class="flex flex-col gap-1">
          Sync Type
          <select :class="selectClass" :value="local.flags?.syncType" @change="onSyncTypeChange">
            <option v-for="opt in syncTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </label>
        <label v-if="showHSyncPolarity" class="flex flex-col gap-1">
          H Sync Polarity
          <select :class="selectClass" :value="local.flags?.hSyncPolarity" @change="onHSyncPolarityChange">
            <option value="positive">Positive</option>
            <option value="negative">Negative</option>
          </select>
        </label>
        <label v-if="showVSyncPolarity" class="flex flex-col gap-1">
          V Sync Polarity
          <select :class="selectClass" :value="local.flags?.vSyncPolarity" @change="onVSyncPolarityChange">
            <option value="positive">Positive</option>
            <option value="negative">Negative</option>
          </select>
        </label>
      </div>
    </div>
  </div>
</template>
