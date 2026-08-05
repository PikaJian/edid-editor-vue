# Handoff: Read EDID from a connected display

Written for Codex picking this up cold. This document describes the
**"Read from connected display"** feature — reading raw EDID bytes directly
off attached monitors instead of only from a file/hex-paste, in the Tauri
desktop build.

Base commit for this feature: `ebe57dd` (`feat: read EDID directly from
attached displays (desktop build)`), on top of the CEA-editing work in the
commits before it. `git log --oneline -15` for full context.

## 1. Goal

The app already lets you load an EDID from a file or a pasted hex string
(`src/composables/useEDID.ts`). This feature adds a third source: pull the
raw 128(+N×128)-byte EDID blob straight from an actually-attached monitor,
via the OS. This only works in the Tauri desktop build — a browser has no
API for this, so the menu entry is hidden entirely on the web build.

Scope is deliberately narrow: **read only**, no ability to write an EDID
back to a monitor (most OSes don't expose that, and it's out of scope for
an editor). Parsing/decoding is *not* duplicated on the Rust side — Rust
hands back raw bytes, and the existing `edidts` TS package (already used for
file/hex loading) decodes them.

## 2. Frontend ↔ Tauri command contract

### The Tauri command

```rust
// src-tauri/src/display_edid.rs
#[tauri::command]
pub fn read_display_edids() -> Result<Vec<DisplayEdid>, String>

#[derive(Serialize, Clone)]
pub struct DisplayEdid {
  pub id: String,               // "display-0", "display-1", ... stable only within one call
  pub connector: Option<String>,// OS-reported connector/port label, if any
  pub bytes: Vec<u8>,           // raw EDID bytes, exactly as read — not validated beyond the header check below
}
```

Registered in `src-tauri/src/lib.rs`:
```rust
mod display_edid;
...
.invoke_handler(tauri::generate_handler![
  save_edid_file,
  display_edid::read_display_edids
])
```

`serde` serializes `Vec<u8>` as a JSON array of numbers (not base64), so the
JS side receives `bytes: number[]`.

### The frontend wrapper

`src/lib/readDisplayEdid.ts` is the only file that should call `invoke`
directly for this feature — everything else goes through it:

```ts
export interface DisplayEdid {
  id: string
  connector: string | null
  bytes: Uint8Array   // converted from number[] here
}

export function canReadDisplays(): boolean   // wraps isTauri() from @tauri-apps/api/core
export async function readDisplayEdids(): Promise<DisplayEdid[]>
```

`canReadDisplays()` is what gates the menu item — see `TopNav.vue`. There is
no separate "is this feature enabled" flag; presence of the Tauri runtime
*is* the flag. If you ever need to test this in a plain browser, mock
`window.isTauri` and `window.__TAURI_INTERNALS__.invoke` before the app
boots (see `check-display-read.js` under §5 for the exact pattern that was
used to verify this end-to-end without a native build).

### Call flow

```
TopNav "Read from connected display" click
  → emit('read-display')
  → App.vue: handleReadDisplay()
      → readDisplayEdids()  [src/lib/readDisplayEdid.ts]
          → invoke('read_display_edids')  [Tauri IPC]
              → display_edid::read_display_edids()  [Rust]
                  → platform::collect() (macOS/Linux/Windows impl)
                  → dedupe(...)  (drops non-EDID blobs, collapses duplicates)
      ← Vec<DisplayEdid>
  → if 0 displays: set error banner, stop
  → if 1 display: selectDisplay(that one) directly, skip the picker
  → if 2+: open DisplayPickerDialog with the list
DisplayPickerDialog "select" event
  → App.vue: selectDisplay(display)
      → loadFromBytes(display.bytes)  [existing useEDID.ts loader — same one file/hex loading uses]
      → activeSection = 'overview'
```

## 3. What's done

### Rust (`src-tauri/src/display_edid.rs`)

One command, `read_display_edids`, with a platform-specific `collect()`
behind `#[cfg(target_os = "...")]`, all funneled through the same
`dedupe()` (validates the 8-byte EDID magic header `00 FF FF FF FF FF FF
00`, rejects short blobs, collapses byte-identical duplicates that show up
under more than one OS path for the same physical panel).

| Platform | Source | Status |
|---|---|---|
| macOS | Walks the whole IORegistry (`IOServicePlane`), reads whichever of `"EDID"` or `"IODisplayEDID"` is present on each entry. See note below — this is *not* the commonly-documented approach. | **Verified against real hardware**, byte-exact vs. `ioreg` output, on macOS 15.1 arm64 (Apple Silicon). |
| Linux | Reads `/sys/class/drm/<connector>/edid` for every connector, skips empty files (nothing plugged in). | **Written, not tested** — no Linux machine was available. |
| Windows | Reads `SYSTEM\CurrentControlSet\Enum\DISPLAY\<PnPID>\<instance>\Device Parameters\EDID` via `winreg`. | **Written, not tested** — no Windows machine was available. This is also why cross-compiling this project to Windows from macOS was flagged as painful in an earlier conversation — if you're picking this up on a Windows box, testing this path is the first thing to do. |
| other | Returns an `Err` string. | intentional — no EDID source exists. |

**macOS gotcha, important if you touch this code:** the "obvious" API
(`IODisplayCreateInfoDictionary` / the `IODisplayEDID` property on
`IODisplayConnect` nodes) **does not work on Apple Silicon**. The property
is gone. On M-series Macs the EDID blob instead lives under a plain
`"EDID"` key on `IOPortTransportStateDisplayPort` nodes. Rather than
hardcode that class name (which could plausibly shift again across macOS
releases), the code walks the *entire* IORegistry service plane and checks
both key names on every node. This is more expensive than a targeted
lookup but the registry is small and this only runs on user action, so it
wasn't worth optimizing.

Cargo dependencies added (`src-tauri/Cargo.toml`), platform-gated so they
don't bloat non-matching builds:
```toml
[target.'cfg(target_os = "macos")'.dependencies]
core-foundation = "0.10"
io-kit-sys = "0.4"
libc = "0.2"

[target.'cfg(target_os = "windows")'.dependencies]
winreg = "0.52"
```
(Linux path only uses `std::fs`, no new dependency.)

### Frontend

- `src/lib/readDisplayEdid.ts` — the IPC wrapper described above.
- `src/components/edid/DisplayPickerDialog.vue` — modal shown when 2+
  displays are found. Decodes each blob with `new EDID(bytes)` from the
  `edidts` package purely to show a human-readable name/resolution in the
  list (falls back to `"<manufacturerId> <productCode>"` if there's no
  product-name descriptor, and to a "could not be decoded" message if
  `new EDID()` throws — a monitor could in principle report a malformed
  blob). This decode is throwaway/display-only; the actual bytes handed to
  `loadFromBytes` are the original raw ones, not round-tripped through this
  decode.
- `src/components/layout/TopNav.vue` — added a `read-display` emit and a
  conditionally-rendered "Read from connected display" menu item, gated on
  `canReadDisplays()`.
- `src/App.vue` — `handleReadDisplay()` (calls the command, decides
  single-display-vs-picker), `selectDisplay()` (feeds bytes into the
  existing `loadFromBytes` from `useEDID.ts`), and the `<DisplayPickerDialog>`
  mount with `v-model:open`.
- `src/components/ui/dialog/` — shadcn-vue Dialog primitive, installed via
  `npx shadcn-vue@latest add dialog` (per this repo's CLAUDE.md convention:
  **never hand-write shadcn components**). Only `Dialog`, `DialogContent`,
  `DialogHeader`, `DialogTitle`, `DialogDescription` are actually used by
  `DisplayPickerDialog.vue`; the rest of the generated files
  (`DialogFooter`, `DialogClose`, `DialogTrigger`, `DialogOverlay`,
  `DialogScrollContent`) are unused scaffolding from the CLI and can stay —
  don't hand-edit them, re-run the CLI if they ever need to change.

**Dependency note:** the shadcn CLI run for this bumped `reka-ui`,
`@vueuse/core`, and `@lucide/vue` in `package.json` as an unrelated side
effect of scaffolding `dialog`. Those bumps were **deliberately reverted**
(`git checkout package.json package-lock.json` + `npm install`) before
committing, because `reka-ui` is the library backing the `Switch` component
used everywhere else in the app, and a version bump there was an
unnecessary risk to re-verify. If you add another shadcn component later
and the CLI bumps deps again, apply the same judgment — don't let
unrelated dependency churn ride in with a feature commit.

## 4. Data structures — how an EDID is represented, end to end

There are actually **three** representations of the same bytes in play,
which matters if you're debugging a mismatch:

1. **Rust `DisplayEdid.bytes: Vec<u8>`** — raw bytes exactly as the OS
   handed them back. No validation beyond `looks_like_edid()` (magic header
   + length ≥ 128). No decoding on the Rust side at all — Rust does not
   know or care about EDID *structure*, only that it's "byte 0..8 == the
   EDID magic".

2. **TS `DisplayEdid.bytes: Uint8Array`** — same bytes, after
   `invoke()`'s JSON round-trip turned them into `number[]` and
   `readDisplayEdid.ts` wrapped them back into a `Uint8Array`.

3. **`EDID` class instance** (`edidts` package, pre-existing, not part of
   this feature) — the actual structured decode, used two places:
   - `DisplayPickerDialog.vue`'s `describe()`, throwaway, just for the
     picker list labels.
   - `useEDID.ts`'s `setEdidPayload()` → `new EDID(bytes)`, the *real* one
     that becomes the app's live document, after `loadFromBytes()` is
     called from `selectDisplay()`.

No new EDID parsing/model code was added for this feature — it entirely
reuses the existing `edidts` package and `useEDID` composable. If a display
decode looks wrong, the bug is almost certainly in `edidts`, not in
anything under `src-tauri/src/display_edid.rs` or `src/lib/readDisplayEdid.ts`.

### Multi-display picker payload shape

`DisplayPickerDialog` receives the full `DisplayEdid[]` list as-is (not
pre-formatted) and does its own `describe()` pass per item. There's no
Rust-side "pick the best name" logic — deliberately, so the frontend's
existing decoder is the single source of truth for how an EDID's product
name is derived, rather than duplicating that logic in Rust from OS
metadata that's less reliable anyway (e.g. macOS's own `ProductName` in the
Metadata dict next to the EDID key is a *third*, potentially
inconsistent, source of the same information — it was intentionally
ignored in favor of decoding the actual EDID bytes).

## 5. How to run and verify

### Dev server (web-only, no display-read feature visible)
```bash
npm run dev
```
`canReadDisplays()` is false outside Tauri, so the menu item won't appear.
Fine for everything else in the app, but you cannot exercise this feature
this way alone (see the mock-based approach below if you need to iterate
on `DisplayPickerDialog.vue` without rebuilding the Rust side each time).

### Full desktop app (real hardware path)
```bash
npm run tauri dev
```
This compiles the Rust side (`cargo build` under the hood) and launches
the actual native window. File → Read from connected display will hit the
real platform `collect()`. This is the only way to test the Rust side
against real monitors.

### Rust unit tests
```bash
cd src-tauri
cargo test --lib
```
Four tests cover `dedupe()`'s pure logic (header validation, short-blob
rejection, duplicate collapsing, id assignment) — these run on any
platform, no hardware needed.

One more test hits real hardware and is `#[ignore]`d by default:
```bash
cargo test --lib -- --ignored --nocapture
```
`dumps_attached_displays` calls the real `read_display_edids()` and prints
what it found. Useful as a sanity check on a new machine before touching
the frontend at all — if this doesn't find your displays, the bug is
entirely in `platform::collect()` for that OS, not anywhere else.

### Typecheck
```bash
npm run build   # runs vue-tsc -b then vite build
# or, faster, just the check:
npx vue-tsc --noEmit
```

### Testing the picker/frontend flow without native hardware

The frontend (`DisplayPickerDialog`, `App.vue`'s wiring) was verified
end-to-end using Playwright against `npm run dev`, by injecting a fake
Tauri runtime *before* the page loads:

```js
await ctx.addInitScript(([displays]) => {
  window.isTauri = true
  window.__TAURI_INTERNALS__ = {
    invoke: async (cmd) => {
      if (cmd === 'read_display_edids') return displays
      throw new Error('unexpected command ' + cmd)
    },
  }
}, [displays])
```
where `displays` were **real** EDID byte arrays pulled from
`ioreg -r -c IOPortTransportStateDisplayPort -w0` on the dev machine (not
synthetic fixtures), so the picker's decode path was exercised against
genuine monitor data. This is the fastest way to iterate on
`DisplayPickerDialog.vue` or the picker-vs-single-display branching logic
in `App.vue` without rebuilding the Rust binary. It does **not** exercise
`display_edid.rs` at all — that still needs `npm run tauri dev` or
`cargo test -- --ignored`.

Byte-exactness of the Rust path was checked by diffing
`cargo test -- --ignored --nocapture`'s hex dump against `ioreg`'s raw
`EDID` property values for the same displays — they matched exactly, which
is the strongest available evidence the IOKit walk isn't subtly
mis-reading anything (e.g. truncating, byte-swapping, or picking up a
stale cached value).

## 6. Next priorities

Roughly in order of what would break or matter first:

1. **Test Linux and Windows for real.** Both `collect()` implementations
   are written against documented OS behavior but have zero runtime
   verification — unlike macOS, which was diffed byte-exact against
   `ioreg`. If you have access to either OS, run
   `cargo test --lib -- --ignored --nocapture` there first, before
   touching anything else, exactly like was done for macOS. Pay particular
   attention to:
   - **Linux:** whether `/sys/class/drm/*/edid` is populated without root
     (it should be world-readable, but confirm on the actual target distro/
     kernel), and whether virtual/headless connectors show up with
     zero-length files that need filtering (the `!bytes.is_empty()` guard
     is there for this, but hasn't been exercised against a machine with
     real disconnected-but-present connectors).
   - **Windows:** whether the registry cache is stale after a monitor swap
     (Windows doesn't always refresh `Device Parameters\EDID` immediately
     on hot-plug — this may need a "refresh"/re-enumeration affordance in
     the UI if it turns out to be an issue in practice, which cannot be
     assessed from a Mac).

2. **Multi-extension-block displays.** The macOS test hardware had one
   display returning 384 bytes (base block + 2 CTA extensions) and it
   round-tripped fine, but that's only one example. If a real-world EDID
   with 3+ extension blocks, or a `0xF0` block-map extension, behaves
   oddly in the picker's `describe()` decode, that's an `edidts`-level bug,
   not this feature's — but it'll surface here first since this is a new
   path for "arbitrary real-world bytes going into `new EDID()`" that
   wasn't as exercised before (file/hex-paste users tend to paste bytes
   they already trust).

3. **Hot-plug / stale state.** There's currently no live-refresh — the
   list is a one-shot `invoke()` per menu click. If a monitor is
   unplugged between opening the picker and clicking an entry, the loaded
   bytes are still whatever was cached at `collect()` time (harmless, just
   stale) rather than an error. Not urgent, but worth a note if a user
   reports "I picked a monitor I'd just unplugged and it loaded the old
   data" — that's expected today, not a bug, but might warrant a
   "Refresh" button in `DisplayPickerDialog.vue` if it comes up.

4. **No permission-prompt handling.** Reading IORegistry data on macOS
   didn't require any Sequoia-style privacy-consent dialog on the dev
   machine tested (Terminal/dev app), but the compiled `.app` bundle under
   Gatekeeper/hardened runtime in a production build has not been tested.
   If the packaged app silently returns zero displays where `cargo tauri
   dev` finds them, look at entitlements/Info.plist first — nothing in
   `src-tauri/capabilities/default.json` currently declares anything
   display-related, and it's untested whether that matters for this API
   (IORegistry reads are not typically TCC-gated, but "typically" isn't
   "confirmed for this exact property".)

5. **Minor: the picker's list has no keyboard nav beyond native `<button>`
   focus order.** Fine for now, but if this dialog grows (e.g. a "show raw
   hex preview" expand-per-row), revisit accessibility.
