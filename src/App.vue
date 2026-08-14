<script setup lang="ts">
import { ref, triggerRef, computed, onMounted, type Ref } from 'vue'
import { DetailedTimingDescriptor } from 'edidts'
import type {
  EDID, DisplayDescriptor, ScreenSize, VideoInputDefinition, EstablishedTiming, StandardTiming,
  CEAExtensionBlock, VendorSpecificDataBlock, CEADetailedTiming, ColorimetryDataBlock,
  HDRStaticMetadataDataBlock, YCbCr420VideoDataBlock, YCbCr420CapabilityMapDataBlock, VideoDataBlock,
  DisplayIdAdaptiveSyncBlock, DisplayIdDisplayParametersBlock, DisplayIdDynamicRangeLimitsBlock,
  DisplayIdInterfaceFeaturesBlock, DisplayIdProductIdentificationBlock, DisplayIdTiledDisplayBlock,
} from 'edidts'
import type { EDIDViewModel } from '@/types/edid'
import TopNav from '@/components/layout/TopNav.vue'
import LeftNav from '@/components/layout/LeftNav.vue'
import HexViewer from '@/components/layout/HexViewer.vue'
import EDIDUpload from '@/components/edid/EDIDUpload.vue'
import OverviewSummary from '@/components/edid/OverviewSummary.vue'
import DisplayInfo from '@/components/edid/DisplayInfo.vue'
import ColorCharacteristics from '@/components/edid/ColorCharacteristics.vue'
import EstablishedTimings from '@/components/edid/EstablishedTimings.vue'
import StandardTimings from '@/components/edid/StandardTimings.vue'
import DetailedDescriptors from '@/components/edid/DetailedDescriptors.vue'
import CEAOverview from '@/components/cea/CEAOverview.vue'
import CEAHeaderFlags from '@/components/cea/CEAHeaderFlags.vue'
import CEAVideoBlock from '@/components/cea/CEAVideoBlock.vue'
import CEAAudioBlock from '@/components/cea/CEAAudioBlock.vue'
import CEASpeakerBlock from '@/components/cea/CEASpeakerBlock.vue'
import CEAHdmiVsdb from '@/components/cea/CEAHdmiVsdb.vue'
import CEAHdmiForumVsdb from '@/components/cea/CEAHdmiForumVsdb.vue'
import CEAColorimetry from '@/components/cea/CEAColorimetry.vue'
import CEAHDRMetadata from '@/components/cea/CEAHDRMetadata.vue'
import CEAYCbCr420 from '@/components/cea/CEAYCbCr420.vue'
import CEAVideoCapability from '@/components/cea/CEAVideoCapability.vue'
import CEADetailedTimings from '@/components/cea/CEADetailedTimings.vue'
import DisplayIDOverview from '@/components/displayid/DisplayIDOverview.vue'
import DisplayIDProductId from '@/components/displayid/DisplayIDProductId.vue'
import DisplayIDDisplayParams from '@/components/displayid/DisplayIDDisplayParams.vue'
import DisplayIDTimings from '@/components/displayid/DisplayIDTimings.vue'
import DisplayIDInterfaceFeatures from '@/components/displayid/DisplayIDInterfaceFeatures.vue'
import DisplayIDTiled from '@/components/displayid/DisplayIDTiled.vue'
import DisplayIDAdaptiveSync from '@/components/displayid/DisplayIDAdaptiveSync.vue'
import DisplayIDOtherBlocks from '@/components/displayid/DisplayIDOtherBlocks.vue'
import { useEDID } from '@/composables/useEDID'
import { exportEdidFile } from '@/lib/exportEdid'
import { getSectionRanges } from '@/lib/byteRanges'
import { readDisplayEdids, type DisplayEdid } from '@/lib/readDisplayEdid'
import DisplayPickerDialog from '@/components/edid/DisplayPickerDialog.vue'

const edidStore = useEDID()
const edidRef = edidStore.edid as Ref<EDIDViewModel | null>
const edidRaw = edidStore.edid as Ref<EDID | null>
const { edidData, error, isLoaded, loadFromHex, loadFromFile, loadFromBytes, createBlankEdid } = edidStore

onMounted(() => {
  loadFromHex(
    "00,FF,FF,FF,FF,FF,FF,00,34,A9,1C,D1,01,01,01,01," +
    "00,19,01,03,80,DD,7D,78,0A,06,12,AF,51,4E,AD,24," +
    "0B,4C,51,20,08,00,A9,C0,A9,40,90,40,01,01,01,01," +
    "01,01,01,01,01,01,08,E8,00,30,F2,70,5A,80,B0,58," +
    "8A,00,1C,00,74,00,00,1E,02,3A,80,18,71,38,2D,40," +
    "58,2C,45,00,1C,00,74,00,00,1E,00,00,00,FC,00,45," +
    "54,2D,4D,44,4E,48,4D,31,30,0A,20,20,00,00,00,FD," +
    "00,17,79,0F,96,3C,00,0A,20,20,20,20,20,20,01,75," +
    "02,03,41,B1,57,61,60,5F,5E,5D,66,65,64,63,62,3F," +
    "10,1F,05,14,22,21,20,04,13,02,11,01,E3,05,E0,00," +
    "6E,03,0C,00,10,00,38,3C,20,08,80,01,02,03,04,67," +
    "D8,5D,C4,01,78,80,03,E2,00,FF,E2,0F,63,E3,06,0D," +
    "01,28,3C,80,A0,70,B0,23,40,30,20,36,00,66,00,64," +
    "00,00,1A,00,00,00,00,00,00,00,00,00,00,00,00,00," +
    "00,00,00,00,00,00,00,00,00,00,00,00,00,00,00,00," +
    "00,00,00,00,00,00,00,00,00,00,00,00,00,00,00,5A"
  )
})

const activeSection = ref('overview')

const displayChoices = ref<DisplayEdid[]>([])
const displayPickerOpen = ref(false)

function selectDisplay(display: DisplayEdid) {
  loadFromBytes(display.bytes)
  activeSection.value = 'overview'
}

async function handleReadDisplay() {
  try {
    error.value = null
    const displays = await readDisplayEdids()
    if (displays.length === 0) {
      error.value = 'No display EDID could be read from this machine.'
      return
    }
    // Only worth asking which one when there is more than one.
    if (displays.length === 1) {
      selectDisplay(displays[0])
      return
    }
    displayChoices.value = displays
    displayPickerOpen.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

function handleSaveEdid() {
  if (!edidData.value) return
  exportEdidFile(edidData.value, 'edid.bin')
}

function addTiming() {
  if (!edidRaw.value) return
  const timings = [...edidRaw.value.detailedTimings, new DetailedTimingDescriptor()]
  edidRaw.value.detailedTimings = timings
  syncEdid()
}

function removeTiming(index: number) {
  if (!edidRaw.value) return
  const timings = edidRaw.value.detailedTimings.filter((_, i) => i !== index)
  edidRaw.value.detailedTimings = timings
  syncEdid()
}

function updateTiming(index: number, timing: DetailedTimingDescriptor) {
  if (!edidRaw.value) return
  const timings = [...edidRaw.value.detailedTimings]
  if (index < 0 || index >= timings.length) return
  timings[index] = timing
  edidRaw.value.detailedTimings = timings
  syncEdid()
}

function createDefaultDescriptor(tag: number): DisplayDescriptor {
  switch (tag) {
    case 0xFC: return { tag: 0xFC, productName: '' }
    case 0xFF: return { tag: 0xFF, serialNumber: '' }
    case 0xFE: return { tag: 0xFE, data: '' }
    case 0xFD: return {
      tag: 0xFD,
      minVerticalRate: 48, maxVerticalRate: 75,
      minHorizontalRate: 30, maxHorizontalRate: 83,
      maxPixelClock: 170,
      timingSupport: 'default-gtf' as const,
    }
    case 0xFB: return { tag: 0xFB, colorPoints: [] }
    case 0xFA: return { tag: 0xFA, timings: [] }
    case 0xF9: return {
      tag: 0xF9, version: 3,
      redA3: 0, redA2: 0, greenA3: 0, greenA2: 0, blueA3: 0, blueA2: 0,
    }
    case 0xF8: return { tag: 0xF8, timings: [] }
    case 0xF7: return { tag: 0xF7, timings: [] }
    default: return { tag: 0x10 }
  }
}

function addDescriptor(tag: number) {
  if (!edidRaw.value) return
  const descriptor = createDefaultDescriptor(tag)
  const descriptors = [...edidRaw.value.displayDescriptors, descriptor]
  edidRaw.value.displayDescriptors = descriptors
  syncEdid()
}

function removeDescriptor(index: number) {
  if (!edidRaw.value) return
  const meaningful = edidRaw.value.displayDescriptors.filter(d => d.tag !== 0x10)
  meaningful.splice(index, 1)
  const dummies = edidRaw.value.displayDescriptors.filter(d => d.tag === 0x10)
  edidRaw.value.displayDescriptors = [...meaningful, ...dummies]
  syncEdid()
}

function updateDescriptor(index: number, descriptor: DisplayDescriptor) {
  if (!edidRaw.value) return
  const descriptors = [...edidRaw.value.displayDescriptors]
  if (index < 0 || index >= descriptors.length) return
  descriptors[index] = descriptor
  edidRaw.value.displayDescriptors = descriptors
  syncEdid()
}

function syncEdid() {
  if (!edidRaw.value) return
  const encoded = edidRaw.value.encode()
  edidStore.edidData.value = encoded
  triggerRef(edidStore.edid)
}

function updateDisplayInfo(field: string, value: unknown) {
  if (!edidRaw.value) return
  const edid = edidRaw.value

  if (field.startsWith('header.')) {
    const key = field.slice(7) as keyof typeof edid.header
    ;(edid.header as unknown as Record<string, unknown>)[key] = value
    edid.header = edid.header
  } else if (field === 'videoInput') {
    edid.videoInput = value as VideoInputDefinition
  } else if (field === 'screenSize') {
    edid.screenSize = value as ScreenSize
  } else if (field === 'gamma') {
    edid.gamma = value as number
  } else if (field.startsWith('featureSupport.')) {
    const key = field.slice(15) as keyof typeof edid.featureSupport.features
    ;(edid.featureSupport.features as unknown as Record<string, unknown>)[key] = value
    edid.featureSupport = edid.featureSupport
  }

  syncEdid()
}

function updateTimings(field: string, value: unknown) {
  if (!edidRaw.value) return
  if (field === 'establishedTimings') {
    edidRaw.value.establishedTimings = value as EstablishedTiming[]
  } else if (field === 'standardTimings') {
    edidRaw.value.standardTimings = value as StandardTiming[]
  }
  syncEdid()
}

const ceaExtension = computed(() => edidRef.value?.ceaExtension ?? null)

const displayIdExtensions = computed(() => edidRef.value?.displayIdExtensions ?? [])

/** Blocks from every parsed DisplayID section, in section then block order. */
const displayIdBlocks = computed(() =>
  displayIdExtensions.value.flatMap(extension => extension.section?.blocks ?? [])
)

/** Finds the first block with a tag; DisplayID allows at most one of each of these. */
function displayIdBlock<T>(tag: number): T | null {
  return (displayIdBlocks.value.find(block => block.tag === tag) as T | undefined) ?? null
}

const displayIdProduct = computed(() =>
  displayIdBlock<DisplayIdProductIdentificationBlock>(0x20)
)
const displayIdParams = computed(() => displayIdBlock<DisplayIdDisplayParametersBlock>(0x21))
const displayIdInterface = computed(() => displayIdBlock<DisplayIdInterfaceFeaturesBlock>(0x26))
const displayIdTiled = computed(() => displayIdBlock<DisplayIdTiledDisplayBlock>(0x28))
const displayIdAdaptiveSync = computed(() => displayIdBlock<DisplayIdAdaptiveSyncBlock>(0x2b))
const displayIdRangeLimits = computed(() => displayIdBlock<DisplayIdDynamicRangeLimitsBlock>(0x25))

const highlightedBytes = computed(() => getSectionRanges(activeSection.value, edidData.value))

function addCEAExtension() {
  if (!edidRaw.value) return
  const blankCEA: CEAExtensionBlock = {
    tag: 0x02,
    revision: 3,
    checksum: 0,
    data: new Uint8Array(125),
    dtdOffset: 4,
    underscan: false,
    basicAudio: false,
    ycbcr444: false,
    ycbcr422: false,
    nativeFormats: 0,
    dataBlocks: [],
    detailedTimings: [],
  }
  edidRaw.value.extensionBlocks = [...edidRaw.value.extensionBlocks, blankCEA]
  activeSection.value = 'cea-overview'
  syncEdid()
}

function removeCEAExtension() {
  if (!edidRaw.value) return
  edidRaw.value.extensionBlocks = edidRaw.value.extensionBlocks.filter(b => b.tag !== 0x02)
  if (activeSection.value.startsWith('cea-')) {
    activeSection.value = 'overview'
  }
  syncEdid()
}

function addCEADataBlock(blockType: string) {
  if (!edidRaw.value || !edidRaw.value.ceaExtension) return
  const cea = edidRaw.value.ceaExtension
  const empty = new Uint8Array(0)

  switch (blockType) {
    case 'video':
      cea.dataBlocks.push({ tag: 0x02, data: empty, vics: [] } as unknown as import('edidts').CEADataBlock)
      activeSection.value = 'cea-video'
      break
    case 'audio':
      cea.dataBlocks.push({ tag: 0x01, data: empty, descriptors: [] } as unknown as import('edidts').CEADataBlock)
      activeSection.value = 'cea-audio'
      break
    case 'speakers':
      cea.dataBlocks.push({
        tag: 0x04, data: empty,
        speakers: {
          frontLeftRight: true, lfe: false, frontCenter: false,
          rearLeftRight: false, rearCenter: false, frontLeftRightCenter: false,
          rearLeftRightCenter: false, frontLeftRightWide: false,
          frontLeftRightHigh: false, topCenter: false, frontCenterHigh: false,
        },
      } as unknown as import('edidts').CEADataBlock)
      activeSection.value = 'cea-speakers'
      break
    case 'video-capability':
      cea.dataBlocks.push({
        tag: 0x07, extendedTag: 0x00, data: empty,
        ceVideoScanBehavior: 'not_supported',
        itVideoScanBehavior: 'not_supported',
        ptVideoScanBehavior: 'not_supported',
        quantizationRangeSelectable: false,
        quantizationRangeYCC: false,
      } as unknown as import('edidts').CEADataBlock)
      activeSection.value = 'cea-video-cap'
      break
    case 'colorimetry':
      cea.dataBlocks.push({
        tag: 0x07, extendedTag: 0x05, data: empty,
        xvYCC601: false, xvYCC709: false, sYCC601: false, opYCC601: false,
        opRGB: false, bt2020cYCC: false, bt2020YCC: false, bt2020RGB: false, dciP3: false,
      } as unknown as import('edidts').CEADataBlock)
      activeSection.value = 'cea-colorimetry'
      break
    case 'hdr-static':
      cea.dataBlocks.push({
        tag: 0x07, extendedTag: 0x06, data: empty,
        eotf: { traditionalGammaSDR: false, traditionalGammaHDR: false, smpte2084: false, hlg: false },
        staticMetadataType1: false,
      } as unknown as import('edidts').CEADataBlock)
      activeSection.value = 'cea-hdr'
      break
    case 'ycbcr420-video':
      cea.dataBlocks.push({
        tag: 0x07, extendedTag: 0x0E, data: empty,
        vics: [],
      } as unknown as import('edidts').CEADataBlock)
      activeSection.value = 'cea-ycbcr420'
      break
    case 'hdmi-vsdb':
      cea.dataBlocks.push({
        tag: 0x03, data: empty,
        ieeeOui: 0x000C03,
        payload: new Uint8Array([0, 0, 0]),
        hdmi: {
          sourcePhysicalAddress: [0, 0, 0, 0],
          supportsAI: false, dcY444: false, dc30bit: false, dc36bit: false, dc48bit: false,
          maxTmdsClockMHz: 0,
        },
      } as unknown as import('edidts').CEADataBlock)
      activeSection.value = 'cea-vendor-hdmi'
      break
    case 'hdmi-forum-vsdb':
      cea.dataBlocks.push({
        tag: 0x03, data: empty,
        ieeeOui: 0xC45DD8,
        payload: new Uint8Array([1, 0, 0, 0, 0, 0]),
        hdmiForum: {
          version: 1, maxTmdsCharacterRate: 0, scdc: false, rr: false, lte340McscScramble: false,
          independentView: false, dualView: false, osd3d: false, dc30bit420: false, dc36bit420: false,
          dc48bit420: false, uhd4k: false, vrr: false, fapa: false, allm: false, fva: false,
          cnmVrr: false, dsc: false, maxFrlRate: 0,
        },
      } as unknown as import('edidts').CEADataBlock)
      activeSection.value = 'cea-vendor-forum'
      break
  }
  syncEdid()
}

function removeVendorSubBlock(kind: 'hdmi' | 'hdmiForum') {
  if (!edidRaw.value || !edidRaw.value.ceaExtension) return
  const cea = edidRaw.value.ceaExtension
  const targetOui = kind === 'hdmi' ? 0x000C03 : 0xC45DD8
  cea.dataBlocks = cea.dataBlocks.filter(
    b => !(b.tag === 0x03 && (b as VendorSpecificDataBlock).ieeeOui === targetOui)
  )
  // The section being viewed no longer exists — fall back to the CEA overview.
  activeSection.value = 'cea-overview'
  syncEdid()
}

function addYCbCr420CapabilityMap() {
  if (!edidRaw.value || !edidRaw.value.ceaExtension) return
  const cea = edidRaw.value.ceaExtension
  const videoBlock = cea.dataBlocks.find(b => b.tag === 0x02) as VideoDataBlock | undefined
  const byteCount = Math.max(1, Math.ceil((videoBlock?.vics.length ?? 0) / 8))
  cea.dataBlocks.push({
    tag: 0x07, extendedTag: 0x0F, data: new Uint8Array(0),
    capabilityBitmap: new Uint8Array(byteCount),
  } as unknown as import('edidts').CEADataBlock)
  syncEdid()
}

function removeYCbCr420CapabilityMap() {
  if (!edidRaw.value || !edidRaw.value.ceaExtension) return
  const cea = edidRaw.value.ceaExtension
  cea.dataBlocks = cea.dataBlocks.filter(
    b => !(b.tag === 0x07 && (b as { extendedTag?: number }).extendedTag === 0x0F)
  )
  syncEdid()
}

function addCEATiming() {
  if (!edidRaw.value || !edidRaw.value.ceaExtension) return
  const cea = edidRaw.value.ceaExtension
  const timing: CEADetailedTiming = {
    pixelClock: 0,
    horizontalActive: 0,
    horizontalBlanking: 0,
    verticalActive: 0,
    verticalBlanking: 0,
    horizontalSyncOffset: 0,
    horizontalSyncWidth: 0,
    verticalSyncOffset: 0,
    verticalSyncWidth: 0,
    interlaced: false,
    horizontalImageSize: 0,
    verticalImageSize: 0,
    horizontalBorder: 0,
    verticalBorder: 0,
    flags: {
      interlaced: false,
      stereoMode: 'none',
      syncType: 'digital-separate',
      vSyncPolarity: 'positive',
      hSyncPolarity: 'positive',
      serrationOnVSync: false,
      syncOnAllChannels: false,
      syncOnGreen: false,
    },
  }
  cea.detailedTimings = [...cea.detailedTimings, timing]
  activeSection.value = 'cea-timings'
  syncEdid()
}

function removeCEATiming(index: number) {
  if (!edidRaw.value || !edidRaw.value.ceaExtension) return
  const cea = edidRaw.value.ceaExtension
  cea.detailedTimings = cea.detailedTimings.filter((_, i) => i !== index)
  syncEdid()
}

function updateCEATiming(index: number, timing: CEADetailedTiming) {
  if (!edidRaw.value || !edidRaw.value.ceaExtension) return
  const cea = edidRaw.value.ceaExtension
  const timings = [...cea.detailedTimings]
  if (index < 0 || index >= timings.length) return
  timings[index] = timing
  cea.detailedTimings = timings
  syncEdid()
}

function removeCEADataBlock(blockTag: number, extendedTag?: number) {
  if (!edidRaw.value || !edidRaw.value.ceaExtension) return
  const cea = edidRaw.value.ceaExtension
  if (extendedTag !== undefined) {
    cea.dataBlocks = cea.dataBlocks.filter(b =>
      !(b.tag === 0x07 && (b as { extendedTag?: number }).extendedTag === extendedTag)
    )
  } else {
    const idx = cea.dataBlocks.findIndex(b => b.tag === blockTag)
    if (idx !== -1) cea.dataBlocks.splice(idx, 1)
  }
  if (activeSection.value.startsWith('cea-')) {
    activeSection.value = 'cea-overview'
  }
  syncEdid()
}

function updateCEA(field: string, value: unknown) {
  if (!edidRaw.value || !edidRaw.value.ceaExtension) return
  const cea = edidRaw.value.ceaExtension

  if (field === 'revision') {
    cea.revision = value as number
  } else if (field === 'underscan' || field === 'basicAudio' || field === 'ycbcr444' || field === 'ycbcr422') {
    ;(cea as unknown as Record<string, unknown>)[field] = value
  } else if (field === 'nativeFormats') {
    cea.nativeFormats = value as number
  } else if (field === 'videoBlock.vics') {
    const vdb = cea.dataBlocks.find(b => b.tag === 0x02)
    if (vdb) {
      ;(vdb as unknown as Record<string, unknown>).vics = value
    }
  } else if (field === 'audioBlock.descriptors') {
    const adb = cea.dataBlocks.find(b => b.tag === 0x01)
    if (adb) {
      ;(adb as unknown as Record<string, unknown>).descriptors = value
    }
  } else if (field === 'speakerBlock.speakers') {
    const spk = cea.dataBlocks.find(b => b.tag === 0x04)
    if (spk) {
      ;(spk as unknown as Record<string, unknown>).speakers = value
    }
  } else if (field.startsWith('videoCapability.')) {
    const vcdb = cea.dataBlocks.find(
      b => b.tag === 0x07 && (b as { extendedTag?: number }).extendedTag === 0x00
    )
    if (vcdb) {
      const key = field.slice('videoCapability.'.length)
      ;(vcdb as unknown as Record<string, unknown>)[key] = value
    }
  } else if (field.startsWith('hdmiVendor.')) {
    const vsdb = cea.dataBlocks.find(
      b => b.tag === 0x03 && (b as VendorSpecificDataBlock).ieeeOui === 0x000C03
    ) as VendorSpecificDataBlock | undefined
    if (vsdb?.hdmi) {
      const key = field.slice('hdmiVendor.'.length)
      ;(vsdb.hdmi as unknown as Record<string, unknown>)[key] = value
    }
  } else if (field.startsWith('hdmiForumVendor.')) {
    const hf = cea.dataBlocks.find(
      b => b.tag === 0x03 && (b as VendorSpecificDataBlock).ieeeOui === 0xC45DD8
    ) as VendorSpecificDataBlock | undefined
    if (hf?.hdmiForum) {
      const key = field.slice('hdmiForumVendor.'.length)
      ;(hf.hdmiForum as unknown as Record<string, unknown>)[key] = value
    }
  } else if (field.startsWith('colorimetry.')) {
    const colorimetry = cea.dataBlocks.find(
      b => b.tag === 0x07 && (b as { extendedTag?: number }).extendedTag === 0x05
    ) as ColorimetryDataBlock | undefined
    if (colorimetry) {
      const key = field.slice('colorimetry.'.length)
      ;(colorimetry as unknown as Record<string, unknown>)[key] = value
    }
  } else if (field.startsWith('hdrStatic.')) {
    const hdrStatic = cea.dataBlocks.find(
      b => b.tag === 0x07 && (b as { extendedTag?: number }).extendedTag === 0x06
    ) as HDRStaticMetadataDataBlock | undefined
    if (hdrStatic) {
      const key = field.slice('hdrStatic.'.length)
      ;(hdrStatic as unknown as Record<string, unknown>)[key] = value
    }
  } else if (field.startsWith('ycbcr420Video.')) {
    const ycbcr420Video = cea.dataBlocks.find(
      b => b.tag === 0x07 && (b as { extendedTag?: number }).extendedTag === 0x0E
    ) as YCbCr420VideoDataBlock | undefined
    if (ycbcr420Video) {
      const key = field.slice('ycbcr420Video.'.length)
      ;(ycbcr420Video as unknown as Record<string, unknown>)[key] = value
    }
  } else if (field.startsWith('ycbcr420Map.')) {
    const ycbcr420Map = cea.dataBlocks.find(
      b => b.tag === 0x07 && (b as { extendedTag?: number }).extendedTag === 0x0F
    ) as YCbCr420CapabilityMapDataBlock | undefined
    if (ycbcr420Map) {
      const key = field.slice('ycbcr420Map.'.length)
      ;(ycbcr420Map as unknown as Record<string, unknown>)[key] = value
    }
  }

  syncEdid()
}
</script>

<template>
  <div class="h-screen flex flex-col bg-background text-foreground">
    <TopNav
      @import-file="loadFromFile"
      @load-hex="loadFromHex"
      @new-edid="createBlankEdid"
      @save-edid="handleSaveEdid"
      @read-display="handleReadDisplay"
    />
    <DisplayPickerDialog
      v-model:open="displayPickerOpen"
      :displays="displayChoices"
      @select="selectDisplay"
    />
    <div class="flex flex-1 overflow-hidden">
      <LeftNav :edid="edidRef" v-model:active-section="activeSection" @add-cea="addCEAExtension" @remove-cea="removeCEAExtension" @add-cea-block="addCEADataBlock" @remove-cea-block="removeCEADataBlock" @remove-vendor-sub="removeVendorSubBlock" />
      <main class="flex-1 p-4 overflow-auto">
        <div v-if="error" class="mb-4 p-4 bg-destructive/10 border border-destructive rounded-lg text-destructive">
          {{ error }}
        </div>

        <div
          v-if="edidRef?.extensionCountMismatch"
          class="mb-4 p-4 bg-amber-500/10 border border-amber-500 rounded-lg text-amber-600 dark:text-amber-400 text-sm"
        >
          This EDID declares {{ edidRaw?.extensions }} extension block(s) at byte 126 but contains
          {{ edidRef.extensionBlocks.length }}. All blocks present are shown; saving will write the corrected count.
        </div>

        <div v-if="!isLoaded" class="max-w-xl mx-auto">
          <EDIDUpload @load-hex="loadFromHex" @load-file="loadFromFile" />
        </div>

        <div v-else class="max-w-4xl">
          <OverviewSummary v-if="activeSection === 'overview'" :edid="edidRef!" />
          <DisplayInfo v-else-if="activeSection === 'display-info'" :edid="edidRef!" @update="updateDisplayInfo" />
          <ColorCharacteristics v-else-if="activeSection === 'color-gamut'" :edid="edidRef!" />
          <EstablishedTimings
            v-else-if="activeSection === 'timings-established'"
            :edid="edidRef!"
            @update="updateTimings"
          />
          <StandardTimings
            v-else-if="activeSection === 'timings-standard'"
            :edid="edidRef!"
            @update="updateTimings"
          />
          <DetailedDescriptors
            v-else-if="activeSection === 'descriptor-blocks'"
            :edid="edidRef!"
            @add-timing="addTiming"
            @remove-timing="removeTiming"
            @update-timing="updateTiming"
            @add-descriptor="addDescriptor"
            @remove-descriptor="removeDescriptor"
            @update-descriptor="updateDescriptor"
          />

          <!-- CEA sections -->
          <CEAOverview v-else-if="activeSection === 'cea-overview' && ceaExtension" :cea="ceaExtension" />
          <CEAHeaderFlags v-else-if="activeSection === 'cea-header' && ceaExtension" :cea="ceaExtension" @update="updateCEA" />
          <CEAVideoBlock v-else-if="activeSection === 'cea-video' && ceaExtension" :cea="ceaExtension" @update="updateCEA" />
          <CEAAudioBlock v-else-if="activeSection === 'cea-audio' && ceaExtension" :cea="ceaExtension" @update="updateCEA" />
          <CEASpeakerBlock v-else-if="activeSection === 'cea-speakers' && ceaExtension" :cea="ceaExtension" @update="updateCEA" />
          <CEAHdmiVsdb
            v-else-if="activeSection === 'cea-vendor-hdmi' && ceaExtension"
            :cea="ceaExtension"
            @update="updateCEA"
            @remove="removeVendorSubBlock('hdmi')"
          />
          <CEAHdmiForumVsdb
            v-else-if="activeSection === 'cea-vendor-forum' && ceaExtension"
            :cea="ceaExtension"
            @update="updateCEA"
            @remove="removeVendorSubBlock('hdmiForum')"
          />
          <CEAColorimetry v-else-if="activeSection === 'cea-colorimetry' && ceaExtension" :cea="ceaExtension" @update="updateCEA" />
          <CEAHDRMetadata v-else-if="activeSection === 'cea-hdr' && ceaExtension" :cea="ceaExtension" @update="updateCEA" />
          <CEAYCbCr420
            v-else-if="activeSection === 'cea-ycbcr420' && ceaExtension"
            :cea="ceaExtension"
            @update="updateCEA"
            @add-capability-map="addYCbCr420CapabilityMap"
            @remove-capability-map="removeYCbCr420CapabilityMap"
          />
          <CEAVideoCapability v-else-if="activeSection === 'cea-video-cap' && ceaExtension" :cea="ceaExtension" @update="updateCEA" />
          <CEADetailedTimings
            v-else-if="activeSection === 'cea-timings' && ceaExtension"
            :cea="ceaExtension"
            @add-timing="addCEATiming"
            @remove-timing="removeCEATiming"
            @update-timing="updateCEATiming"
          />

          <!-- DisplayID sections -->
          <DisplayIDOverview
            v-else-if="activeSection === 'did-overview'"
            :extensions="displayIdExtensions"
          />
          <DisplayIDProductId v-else-if="activeSection === 'did-product'" :block="displayIdProduct" />
          <DisplayIDDisplayParams v-else-if="activeSection === 'did-params'" :block="displayIdParams" />
          <DisplayIDTimings v-else-if="activeSection === 'did-timings'" :blocks="displayIdBlocks" />
          <DisplayIDInterfaceFeatures
            v-else-if="activeSection === 'did-interface'"
            :block="displayIdInterface"
          />
          <DisplayIDAdaptiveSync
            v-else-if="activeSection === 'did-adaptive-sync'"
            :adaptive-sync="displayIdAdaptiveSync"
            :range-limits="displayIdRangeLimits"
          />
          <DisplayIDTiled v-else-if="activeSection === 'did-tiled'" :block="displayIdTiled" />
          <DisplayIDOtherBlocks v-else-if="activeSection === 'did-other'" :blocks="displayIdBlocks" />
        </div>
      </main>
      <section id="hex-viewer" class="h-full scroll-mt-24">
        <HexViewer :data="edidData" :highlight="highlightedBytes" />
      </section>
    </div>
  </div>
</template>
