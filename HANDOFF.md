# Handoff

Written for whoever (or whatever) picks this up cold. Read CLAUDE.md first for repo layout and conventions; this document is the state of play and the open threads.

Three features are documented, in the order their sections appear:

1. **DisplayID extension block parsing** — §1–§5. Merged; editing still unimplemented.
2. **Read EDID from a connected display** — §6. Shipped; two platforms still unverified.
3. **CI builds and releases the desktop app** — §7. Shipped; `v0.1.0` is published.

---

## Where things stand

| | |
|---|---|
| Branch | `main` is current. `feat/displayid-parsing` is merged and can be deleted. |
| PR | [#1](https://github.com/PikaJian/edid-editor-vue/pull/1) — **merged** as `99625de`; the feature commit is `859b491` |
| Tests | 164 passing (`npm test`), plus 4 Rust (`cd src-tauri && cargo test --lib`, 1 more `#[ignore]`d) |
| Release | [v0.1.0](https://github.com/PikaJian/edid-editor-vue/releases/tag/v0.1.0) — published, tagged at `e1937c4`. Universal macOS `.dmg`, Windows `.msi` + NSIS `-setup.exe`, all built by CI. See §7. |
| Untracked | `edid.bin` in the repo root — a real MSI MAG 272URDF dump used while debugging. Its bytes are already committed as a fixture, so the file itself is deliberately not tracked. |

`origin` is `PikaJian/edid-editor-vue`; `upstream` is `thyge/edid-editor`. Nothing has been pushed to upstream, so origin is ahead of it by everything described here. GitHub does **not** record origin as a fork of upstream (`fork=false`, `parent=none`) — they are linked only by the local remote. Two consequences: `gh` resolves this working copy to **upstream** unless told otherwise, so every `gh` command here needs `-R PikaJian/edid-editor-vue` (or run `gh repo set-default` once); and Actions was enabled from the start, since it is the fork case that needs manual enabling.

---

# 1. DisplayID parsing — goal

Make DisplayID extension blocks readable. They previously rendered nothing at all.

Scope delivered: full decode **and** encode in `edidts` for the DisplayID data blocks, plus read-only UI panels. Editing DisplayID fields from the UI is **not** implemented — the request was to be able to read them, and the encoders exist for round-trip fidelity rather than to back an editor.

## 2. Why it was broken — three independent causes

All three had to be fixed; any one of them alone would still have produced an empty view.

1. **Extension tag `0x70` was never routed.** `ExtensionBlockParser.decode()` handled `0x02`, `0x10` and `0xF0` only; DisplayID fell through to the generic branch. The `displayid/` module already existed in the package and **was never called by anything**. If a future extension type looks "implemented but dead", check the dispatch switch first.

2. **The extension count byte was trusted.** `EDID.decode()` looped `i < bytes[126]`. The MSI dump declares **1** extension while carrying **2** (CTA + DisplayID), all three blocks checksum-valid, so the DisplayID block was never even read. Now every complete 128-byte block present is decoded and the disagreement surfaces as `EDID.extensionCountMismatch`.

3. **No UI existed.** `LeftNav` rendered a disabled, greyed-out "DisplayID" button and `App.vue` had no view to route to.

A fourth issue only appeared once real hardware was tested: the section decoder required version byte `0x20` **exactly**, so the v1.2 section in the MSI dump was rejected outright. See §4.

## 3. What was implemented

### `packages/edidts/src/displayid/`

`section.ts` and `blocks.ts` handle framing and dispatch; one module per data block. `bytes.ts` (little-endian readers, OUI formatting) and `half-float.ts` (IEEE 754 binary16 incl. the `-0` sentinel) are the shared helpers.

Decoded and encoded per DisplayID v2.1a section 4:

| Tag | Block | Tag | Block |
|---|---|---|---|
| `20h` | Product Identification | `2Ah` | Type X Formula-based Timing |
| `21h` | Display Parameters | `2Bh` | Adaptive-Sync |
| `22h` | Type VII Detailed Timing | `2Eh` | Brightness Luminance Range |
| `23h` | Type VIII Enumerated Timing Code | `7Eh` | Vendor-specific |
| `24h` | Type IX Formula-based Timing | `81h` | CTA-861 Encapsulation |
| `25h` | Dynamic Video Timing Range Limits | `26h` | Display Interface Features |
| `27h` | Stereo Display Interface | `28h` | Tiled Display Topology |
| `29h` | ContainerID | | |

`2Ch`/`2Dh` (ARVR) are named but kept raw — spec §4.10 forbids them in EDID Extension Sections.

The format traps that cost time (minus-one encoding, per-type pixel clock units, variable descriptor sizes, revision-dependent bit meanings, the half-float `-0` sentinel) are written up in **CLAUDE.md → DisplayID specifics** rather than repeated here.

### Wiring and UI

- `cta/extension-block.ts` — `DisplayIDExtensionBlock` (tag `0x70`), decode/encode cases. The section occupies bytes 1–126 of the extension; a section that fails to parse is reported via `sectionError` instead of throwing, so one bad block cannot make a whole EDID unreadable.
- `edid/index.ts` — `EDID.displayIdExtensions` getter, all-blocks-present decoding, `extensionCountMismatch`.
- `src/components/displayid/` — 8 read-only panels. `DisplayIDField.vue` is the shared label/value row.
- `src/lib/displayIdLabels.ts` — presentation-layer labels for the spec's enumerations, kept out of the decoder so the model stays numeric and faithful to the bytes.
- `LeftNav.vue` — DisplayID children derived from the blocks actually present, so a monitor with one block gets one entry.
- `byteRanges.ts` — per-block hex highlighting, walking the encoded bytes.
- `App.vue` — an amber warning banner when `extensionCountMismatch` is set.

### Behaviour change worth knowing

Re-encoding an EDID whose byte 126 was wrong **writes the corrected count**, which also changes the base block checksum. Saving such a file does not reproduce the input bytes. This is intentional and called out in the PR, but it is the one place where "load then save" is not a no-op.

## 4. The v1.x discovery — and what it implies

`edid.bin` (MSI MAG 272URDF) turned out to carry a **DisplayID Structure v1.2** section, not v2.x. Version byte `0x12`, containing legacy tag `03h` = Type I Detailed Timing with three 4K timings.

The v2.1a spec pins Type I's layout precisely enough to implement: §4.3.1 states the Type VII descriptor is the v1.2 Type I descriptor *"except for Bytes 0, 1, 2 … which carry the pixel clock information"*. Type I uses **10 kHz** units where Type VII uses 1 kHz. The numbers confirm it — 10 kHz yields exactly 120.00 and 160.00 Hz, while 1 kHz would give 12 and 16 Hz.

**Implication for future work:** v1.x is not a legacy curiosity, it is what monitors in hand actually ship. `displayid/legacy.ts` currently field-decodes only `03h`. Extending it needs the **DisplayID v1.3 specification**, which is not in this repo — the other v1.x tags have correct names and raw payloads, and guessing their layouts from memory would be worse than showing bytes. If someone supplies that spec, `legacy.ts` is where the work goes and Type I is the pattern to follow.

Incidentally this explains what the block is *for*: those three timings (120 / 143.85 / 160 Hz at 4K) need 1097–1403 MHz pixel clocks, and the 18-byte DTD used by base EDID and CTA has a 16-bit/10 kHz clock field capping at **655.35 MHz**. They physically cannot be expressed anywhere else. 4K60 (533 MHz) sits in the base block's first DTD, and the standard modes have CTA VICs; DisplayID exists here purely to carry what neither can represent.

## 5. Testing

`npm test` → 164 passing, in four groups:

- **`displayid-blocks.test.ts`** — per-block decode plus byte-for-byte round trip. Includes the spec's **Appendix A worked example**, checked against the interpretations the PDF itself prints (chromaticity 0.675/0.320, 400 cd/m², gamma 2.2, three timings).
- **`displayid-extension.test.ts`** — the tag `0x70` path end to end, malformed-section reporting, and fixed-length repadding.
- **`displayid-v1.test.ts`** — the real MSI dump: undercounted extensions, v1.2 acceptance, Type I refresh rates, round trip, corrected count on re-encode.
- **`src/lib/byteRanges.displayid.test.ts`** — hex highlight ranges.

Fixtures live in `packages/edidts/tests/fixtures.ts`: `DISPLAYID_V2_EXTENSION` (synthetic v2.0, 4K144-shaped) and `MSI_MAG272URDF_DISPLAYID_V1` (the real dump, verified byte-identical to `edid.bin`). `testedids.test.ts` auto-collects both and round-trips them.

Two traps encountered while writing these, both of which produced *green* runs that tested nothing:

- A multi-line hex fixture missing the `+` between string literals is valid JS via automatic semicolon insertion; the constant silently truncates to its first line and the loader's length check then skips it. Caught only by asserting the fixture equals `edid.bin` on disk.
- App-level tests import `edidts` by package name and fail if `packages/edidts/dist` is absent, while the package's own tests import `../src` and pass. See CLAUDE.md.

### Open items

1. **DisplayID editing is not implemented.** Panels are read-only. The encoders are all there and round-trip tested, so wiring an editor is mostly UI: follow the `App.vue` handler → `syncEdid()` pattern the CEA panels use. Note the fixed 126-byte section length — `encodeDisplayIdSection` takes a `minimumLength` and pads with fill bytes, and a section whose blocks exceed the target keeps its natural length rather than silently dropping one, so an editor needs to surface "no room left" itself.
2. **v1.x blocks beyond Type I** — see §4; blocked on the v1.3 spec.
3. **Multiple DisplayID sections.** The detail panels show the union of all sections' blocks, which is right for describing one display, but if a real EDID ever carries conflicting blocks across sections the UI gives no way to tell them apart. The overview lists each section separately. No such EDID has been seen; revisit if one turns up.
4. **`edid.bin` is untracked.** If it should be a checked-in sample, its bytes are already in `fixtures.ts` — decide whether a duplicate binary is wanted.

---

# 6. Read EDID from a connected display (shipped)

Base commit `ebe57dd`. Pulls raw EDID bytes off attached monitors in the Tauri desktop build; hidden entirely on the web build, since browsers have no such API. **Read only** — writing an EDID back to a monitor is out of scope. Rust returns raw bytes and does no parsing, so a wrong decode is an `edidts` bug, not a bug here.

### Contract

```rust
// src-tauri/src/display_edid.rs
#[tauri::command]
pub fn read_display_edids() -> Result<Vec<DisplayEdid>, String>

pub struct DisplayEdid {
  pub id: String,                // "display-0", ... stable only within one call
  pub connector: Option<String>, // OS-reported label, if any
  pub bytes: Vec<u8>,            // raw, validated only for the EDID magic + length >= 128
}
```

`serde` sends `Vec<u8>` as a JSON number array. `src/lib/readDisplayEdid.ts` is the **only** place that should call `invoke` for this, and converts to `Uint8Array`. `canReadDisplays()` (wrapping `isTauri()`) gates the `TopNav` menu item — the Tauri runtime's presence *is* the feature flag.

Flow: `TopNav` → `App.vue: handleReadDisplay()` → `readDisplayEdids()` → Rust `collect()` → `dedupe()`. Zero displays sets the error banner; one skips the picker; two or more open `DisplayPickerDialog`. Selecting feeds the original raw bytes to `loadFromBytes()` — the dialog's own `new EDID(bytes)` decode is throwaway, only for list labels.

### Platform status

| Platform | Source | Status |
|---|---|---|
| macOS | Walks the whole IORegistry service plane, reading `"EDID"` or `"IODisplayEDID"` on every node | **Verified byte-exact against `ioreg`**, macOS 15.1 arm64 |
| Linux | `/sys/class/drm/<connector>/edid`, skipping empty files | **Written, never run** |
| Windows | `SYSTEM\CurrentControlSet\Enum\DISPLAY\...\Device Parameters\EDID` via `winreg` | **Written, never run** |
| other | returns `Err` | intentional |

**macOS gotcha, important if you touch this:** the commonly-documented approach (`IODisplayCreateInfoDictionary` / `IODisplayEDID` on `IODisplayConnect` nodes) **does not work on Apple Silicon** — the property is gone. There the blob lives under a plain `"EDID"` key on `IOPortTransportStateDisplayPort` nodes. Rather than hardcode a class name that may shift again, the code walks the entire registry and checks both keys. Slower than a targeted lookup, but the registry is small and this only runs on user action.

Platform-gated Cargo deps: `core-foundation`/`io-kit-sys`/`libc` on macOS, `winreg` on Windows, nothing extra on Linux.

### Verifying without native hardware

`dedupe()`'s pure logic has four `cargo test --lib` tests that run anywhere. The real-hardware test is `#[ignore]`d: `cargo test --lib -- --ignored --nocapture` prints what it found — run this first on a new machine, since a failure there localises the bug to `platform::collect()`.

The frontend flow was verified with Playwright against `npm run dev` by injecting a fake Tauri runtime before page load:

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

with **real** EDID arrays from `ioreg -r -c IOPortTransportStateDisplayPort -w0`, not synthetic ones. Fastest way to iterate on the picker without rebuilding Rust; exercises none of `display_edid.rs`.

### Open items

1. **Test Linux and Windows for real** — both are written against documented behavior with zero runtime verification. Start with `cargo test --lib -- --ignored --nocapture`. For Linux, confirm `/sys/class/drm/*/edid` is readable without root on the target distro and that disconnected connectors yield the empty files the `!bytes.is_empty()` guard expects. For Windows, check whether the registry value goes stale after a monitor swap — if so this may need a refresh affordance in the UI.
2. **Hot-plug / stale state.** The list is a one-shot `invoke()` per menu click. Unplugging between opening the picker and choosing an entry loads the cached bytes rather than erroring. Expected today, not a bug; a "Refresh" button in `DisplayPickerDialog.vue` would fix it if users hit it.
3. **Packaged-app permissions untested.** IORegistry reads needed no privacy consent in dev, but the signed `.app` under hardened runtime has not been tried. If the bundle finds zero displays where `tauri dev` finds them, look at entitlements/Info.plist first.
4. **Picker keyboard nav** is native `<button>` focus order only. Fine now; revisit if the dialog grows.

---

# 7. CI builds and releases the desktop app (shipped)

`.github/workflows/release.yml`. Tauri does not cross-compile, so each platform needs its own runner; the workflow fans out over a matrix and lets `tauri-apps/tauri-action` do the build and the release upload.

| Runner | Rust target | Bundles |
|---|---|---|
| `macos-latest` | `universal-apple-darwin` (both arches installed) | `.dmg` only — see below |
| `windows-latest` | `x86_64-pc-windows-msvc` | `.msi` + NSIS `-setup.exe` |

Linux is deliberately absent — the request was macOS and Windows. Adding it is one matrix entry plus Tauri's `webkit2gtk`/`libappindicator` apt packages, which the other two runners need nothing equivalent to.

### Cutting a release

```bash
# 1. bump `version` in src-tauri/tauri.conf.json
# 2. tag and push
git tag -a v0.1.0 -m "..."
git push origin v0.1.0
```

Both runners build, then attach their bundles to a **draft** release. Publish it by hand (`gh release edit vX.Y.Z --draft=false`, plus `-R`). Draft is deliberate: the two jobs finish minutes apart, and a published release would be visible while still half-empty. `releaseDraft: false` in the workflow makes it automatic if that trade is ever worth making.

`workflow_dispatch` (Actions → Release → Run workflow) builds both platforms **without** creating a release — `tagName` resolves to an empty string on a non-tag ref, which tauri-action treats as build-only — and uploads the bundles as workflow artifacts instead. Use this to check a build before committing to a tag.

With a warm `Swatinem/rust-cache` a full run is ~7 minutes. Cold it is ~19, dominated by the Windows job and the macOS universal build compiling twice.

### Things that were not obvious

- **`npm ci` needs a step that `npm run dev` never did.** `tauri.conf.json`'s `beforeBuildCommand` is `npm run build`, which has no `prebuild` hook, and `packages/edidts/dist` is gitignored — so CI's fresh clone must run `npm run build --workspace=edidts` explicitly or the frontend build dies on an unresolved `edidts` import. This is the CLAUDE.md footgun, hit exactly as documented.
- **The committed lock file was internally inconsistent and only `npm ci` cared.** It carried a top-level `@emnapi/wasi-threads` but not the `@emnapi/core`/`@emnapi/runtime` that depend on it; npm had pruned those optional platform-specific packages. `npm install` tolerates that, `npm ci` refuses, so both runners failed before compiling anything. Fixed in `67414f2` by `npm install --package-lock-only` — additions only, no dependency version changes. **If you ever regenerate the lock on one platform, check those additions survive**; losing them silently breaks CI while local installs stay fine.
- **A tag that disagrees with `tauri.conf.json` fails the job up front**, by design — otherwise `v0.2.0` could ship an app reporting `0.1.0`. Only `tauri.conf.json` is checked; `package.json` is still `0.0.0` and does not feed the app version.
- **The bundled binary needed `mainBinaryName`.** It took its name from the Cargo package (`app`), so the first build shipped `Contents/MacOS/app` and `app.exe`. `mainBinaryName: "EDID Editor"` (`e1937c4`) makes the CLI rename it; the value carries no extension, since Tauri adds the per-platform one.
- **`bundle.targets: "all"` also emits the updater-format `.app.tar.gz`**, which tauri-action then attaches — a second 6MB download next to the `.dmg` with no purpose, since nothing configures an updater. CI passes `--bundles dmg` (`59dcd52`) rather than narrowing the config, so local `npm run tauri build` and the README's description of it stay as they were.

### What was actually verified

The macOS bundle was downloaded and mounted: `EDID Editor.app`, executable `Contents/MacOS/EDID Editor`, `lipo -archs` → `x86_64 arm64`, `CFBundleExecutable = EDID Editor`, version `0.1.0`. Windows was confirmed from the build log only (`Built application at: ...\release\EDID Editor.exe`, `Finished 2 bundles`) — **an installer that builds is not an installer that runs.**

### Open items

1. **Nobody has run the Windows build.** This is the same gap as §6 open item 1, but narrower now: the Windows `display_edid.rs` path compiles, and there is an installer to test with. Install `EDID Editor_0.1.0_x64-setup.exe`, attach a monitor, and check the registry read actually returns bytes.
2. **Nothing is code-signed.** macOS Gatekeeper blocks the first launch and Windows SmartScreen warns; the release body says so and gives the workarounds. Fixing it needs an Apple Developer ID certificate and a Windows code-signing certificate as repository secrets — see [Tauri's signing docs](https://v2.tauri.app/distribute/sign/). Note that signing macOS properly also means notarization, which is a separate credential and a build-time network round trip.
3. **`v0.1.0`'s tagged tree predates the `--bundles dmg` fix.** The published release is correct — the stray `.app.tar.gz` was deleted from the draft rather than rebuilt, since the `.dmg` is byte-identical either way — but re-running that tag's workflow would re-attach it. The flag decides which bundles are emitted, not what goes inside the `.dmg`, which is why deleting the asset was enough. Harmless; noted so it is not mistaken for a regression.
4. **`actions/upload-artifact@v4` raises a Node 20 deprecation warning** (currently forced onto Node 24). Bumping to v5 clears it. Affects only the artifact step, which tag runs skip entirely.
