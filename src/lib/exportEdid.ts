import { isTauri, invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'

async function saveViaTauri(bytes: Uint8Array, filename: string) {
  const path = await save({
    defaultPath: filename,
    filters: [{ name: 'EDID Binary', extensions: ['bin', 'dat'] }],
  })
  if (!path) {
    return
  }
  await invoke('save_edid_file', { path, data: Array.from(bytes) })
}

function saveViaBrowserDownload(bytes: Uint8Array, filename: string) {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  const blob = new Blob([buffer], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export async function exportEdidFile(bytes: Uint8Array, filename: string) {
  if (isTauri()) {
    await saveViaTauri(bytes, filename)
    return
  }
  saveViaBrowserDownload(bytes, filename)
}
