<script setup lang="ts">
import type { DisplayIdTiledDisplayBlock } from 'edidts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import DisplayIDField from './DisplayIDField.vue'
import { MULTI_TILE_BEHAVIORS, SINGLE_TILE_BEHAVIORS, labelFor } from '@/lib/displayIdLabels'

defineProps<{
  block: DisplayIdTiledDisplayBlock | null
}>()
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Tiled Display Topology</CardTitle>
    </CardHeader>
    <CardContent class="space-y-6 text-sm">
      <template v-if="block">
        <section>
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Topology</h4>
          <div class="grid grid-cols-2 gap-x-6 gap-y-1">
            <DisplayIDField
              label="Total tiles"
              :value="`${block.totalHorizontalTiles} × ${block.totalVerticalTiles}`"
            />
            <DisplayIDField
              label="This tile"
              :value="`column ${block.horizontalTileLocation}, row ${block.verticalTileLocation}`"
            />
            <DisplayIDField
              label="Tile size"
              :value="`${block.horizontalTileSize} × ${block.verticalTileSize}`"
            />
            <DisplayIDField
              label="Enclosure"
              :value="block.singleEnclosure ? 'Single physical enclosure' : 'Multiple enclosures'"
            />
          </div>
        </section>

        <section>
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Behaviour</h4>
          <div class="space-y-1">
            <DisplayIDField
              label="Only tile driven"
              :value="labelFor(SINGLE_TILE_BEHAVIORS, block.singleTileBehavior)"
            />
            <DisplayIDField
              label="Some tiles driven"
              :value="labelFor(MULTI_TILE_BEHAVIORS, block.multiTileBehavior)"
            />
          </div>
        </section>

        <section v-if="block.hasBezelInformation">
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Bezel</h4>
          <div class="grid grid-cols-2 gap-x-6 gap-y-1">
            <DisplayIDField label="Pixel multiplier" :value="block.pixelMultiplier" />
            <DisplayIDField
              label="Top / bottom"
              :value="`${(block.pixelMultiplier * block.topBezelSize * 0.1).toFixed(1)} / ${(block.pixelMultiplier * block.bottomBezelSize * 0.1).toFixed(1)} px`"
            />
            <DisplayIDField
              label="Left / right"
              :value="`${(block.pixelMultiplier * block.leftBezelSize * 0.1).toFixed(1)} / ${(block.pixelMultiplier * block.rightBezelSize * 0.1).toFixed(1)} px`"
            />
          </div>
        </section>

        <section>
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Topology Identity
          </h4>
          <div class="grid grid-cols-2 gap-x-6 gap-y-1">
            <DisplayIDField label="IEEE OUI" :value="block.ieeeOuiText" />
            <DisplayIDField
              label="Product ID code"
              :value="`0x${block.productId.toString(16).toUpperCase().padStart(4, '0')}`"
            />
            <DisplayIDField label="Serial number" :value="block.serialNumber" />
          </div>
        </section>
      </template>
      <p v-else class="text-muted-foreground">No Tiled Display Topology data block present.</p>
    </CardContent>
  </Card>
</template>
