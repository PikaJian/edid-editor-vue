import { isTauri, invoke } from '@tauri-apps/api/core'

/** Mirrors the `DisplayEdid` struct returned by the Rust `read_display_edids` command. */
interface RawDisplayEdid {
  id: string
  connector: string | null
  bytes: number[]
}

export interface DisplayEdid {
  id: string
  connector: string | null
  bytes: Uint8Array
}

/** Reading attached displays needs OS APIs, so it only works in the desktop build. */
export function canReadDisplays(): boolean {
  return isTauri()
}

export async function readDisplayEdids(): Promise<DisplayEdid[]> {
  const raw = await invoke<RawDisplayEdid[]>('read_display_edids')
  return raw.map(d => ({ ...d, bytes: new Uint8Array(d.bytes) }))
}
