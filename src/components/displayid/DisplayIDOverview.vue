<script setup lang="ts">
import { computed } from 'vue'
import type { DisplayIDExtensionBlock } from 'edidts'
import { DISPLAY_ID_PRIMARY_USE_CASES, displayIdBlockName } from 'edidts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import DisplayIDField from './DisplayIDField.vue'

const props = defineProps<{
  extensions: DisplayIDExtensionBlock[]
}>()

const sections = computed(() =>
  props.extensions.map((extension, index) => ({
    index,
    error: extension.sectionError,
    section: extension.section,
    blocks: (extension.section?.blocks ?? []).map(block => ({
      tag: block.tag,
      name: displayIdBlockName(block.tag, extension.section?.version ?? 2),
      revision: block.revision,
      payloadLength: block.payloadLength,
    })),
  })),
)

function useCaseLabel(value: number): string {
  return DISPLAY_ID_PRIMARY_USE_CASES[value] ?? `Reserved (${value})`
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>DisplayID Extension</CardTitle>
    </CardHeader>
    <CardContent class="space-y-8 text-sm">
      <section v-for="entry in sections" :key="entry.index" class="space-y-4">
        <h4 v-if="sections.length > 1" class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Section {{ entry.index + 1 }}
        </h4>

        <p v-if="entry.error" class="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-destructive">
          This DisplayID section could not be parsed: {{ entry.error }}
        </p>

        <template v-else-if="entry.section">
          <div class="grid grid-cols-2 gap-x-6 gap-y-1">
            <DisplayIDField
              label="Structure version"
              :value="`${entry.section.version}.${entry.section.revision}`"
            />
            <DisplayIDField label="Primary use case" :value="useCaseLabel(entry.section.primaryUseCase)" />
            <DisplayIDField label="Bytes in section" :value="entry.section.bytesInSection" />
            <DisplayIDField label="Extension count" :value="entry.section.extensionCount" />
            <DisplayIDField label="Fill bytes" :value="entry.section.fillBytes" />
            <DisplayIDField label="Checksum">
              <span
                class="font-mono"
                :class="entry.section.isChecksumValid ? 'text-emerald-500' : 'text-destructive'"
              >
                0x{{ entry.section.checksum.toString(16).toUpperCase().padStart(2, '0') }}
                {{ entry.section.isChecksumValid ? '(valid)' : '(invalid)' }}
              </span>
            </DisplayIDField>
          </div>

          <div>
            <h5 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Data Blocks</h5>
            <div v-if="entry.blocks.length > 0" class="space-y-1">
              <div
                v-for="(block, blockIndex) in entry.blocks"
                :key="`${entry.index}-${blockIndex}`"
                class="flex items-center justify-between gap-2 rounded-md border border-transparent px-3 py-2"
              >
                <span>
                  <span class="font-mono text-muted-foreground mr-2">
                    0x{{ block.tag.toString(16).toUpperCase().padStart(2, '0') }}
                  </span>
                  {{ block.name }}
                </span>
                <span class="font-mono text-muted-foreground text-xs">
                  rev {{ block.revision }} · {{ block.payloadLength }} bytes
                </span>
              </div>
            </div>
            <p v-else class="text-muted-foreground">No data blocks present.</p>
          </div>
        </template>
      </section>
    </CardContent>
  </Card>
</template>
