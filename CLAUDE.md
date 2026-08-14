# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A client-side Vue 3 app for viewing and editing EDID (Extended Display Identification Data), CEA-861 extension blocks, and DisplayID data. It also ships as a Tauri desktop app, which adds the ability to read EDIDs off physically attached monitors.

The repo is an **npm workspace**. All EDID decode/encode logic lives in the framework-agnostic `edidts` package under `packages/edidts/`; the Vue app in `src/` only renders it.

## Development Commands

- `npm run dev` — Vite dev server. A `predev` hook builds the `edidts` workspace package first.
- `npm run build` — `vue-tsc -b` then `vite build`. **Does not** build `edidts` first (no `prebuild` hook).
- `npm test` / `npm run test:watch` — Vitest across both the app and the package.
- `npm run tauri dev` / `npm run tauri build` — desktop app. A `pretauri` hook builds `edidts` first.
- `cd src-tauri && cargo test --lib` — Rust unit tests. Add `-- --ignored --nocapture` for the test that reads real attached displays.

### Build `edidts` before anything that resolves it

`packages/edidts/dist` is **gitignored** and the app imports `edidts` by package name, resolved through the workspace to that `dist`. Only `predev` and `pretauri` build it automatically. So on a fresh clone, or after deleting `dist`:

```bash
npm run build --workspace=edidts   # or: cd packages/edidts && npm run build
```

Skipping this bites in two non-obvious ways:

- `npm run build` fails with an unresolved-import error for `edidts`.
- `npm test` fails **only** the app-level tests (`src/**/*.test.ts`), because those import `edidts` by name while the package's own tests import `../src/...` directly. You get a mostly-green run with one confusing failure.

A stale or partial `dist` is worse than a missing one: it can silently degrade imported types to `any`/`unknown` and produce type errors in files you did not touch. Rebuild it clean before believing such an error.

### Type-checking gotcha

Root `tsconfig.json` has `"files": []` and only project references, so `npx vue-tsc --noEmit` at the root **checks nothing and exits 0**. The real check is `vue-tsc -b`, i.e. `npm run build`.

## Architecture

### `packages/edidts/` — the data model

Byte-oriented and framework-free. Decoders take a `Uint8Array`; encoders return one. Every decoder has a matching encoder, and round-trip fidelity (decode → encode reproduces the input bytes) is a tested invariant throughout.

- **`src/edid/`** — the base 128-byte block. `EDID` (in `edid/index.ts`) is the top-level class: header, video input, screen size, feature support, chromaticity, established/standard timings, and the four 18-byte descriptor slots from byte 54 (each either a detailed timing or a tagged display descriptor). `EDID.encode()` recomputes checksums.
- **`src/cta/`** — CEA-861 extension blocks. `extension-block.ts` holds `ExtensionBlockParser`, which dispatches a 128-byte extension on its tag byte, plus the CTA data block types (video/audio/speaker/VSDB/extended tag) and `vic-table.ts`.
- **`src/displayid/`** — DisplayID extension blocks (tag `0x70`), covering both Structure v2.x per DisplayID v2.1a and the v1.x legacy tag space. See the dedicated section below.
- **`src/common/`** — shared across the above: checksums, the 18-byte detailed timing descriptor, CVT timing generation, the PnP manufacturer registry, VTB blocks.

`ExtensionBlockParser.decode()` is the single dispatch point for extension blocks. **Adding support for a new extension tag means adding a case there** — a parser module that nothing calls is the failure mode this repo has already hit once.

`EDID.decode()` decodes every complete 128-byte block present in the buffer rather than trusting the extension count in byte 126, because real EDIDs ship with a stale count. When they disagree, `EDID.extensionCountMismatch` is set and re-encoding writes the corrected count.

### `src/` — the Vue app

- **`src/App.vue`** — root layout: `TopNav`, `LeftNav`, a main panel switched on a single `activeSection` ref, and `HexViewer` on the right. Also owns all the mutation handlers passed down to the editors. A hardcoded demo EDID hex string is loaded on mount.
- **`src/composables/useEDID.ts`** — the app's state. Module-level `ref`s (`edidData`, `edid`, `error`) shared by every caller, i.e. a singleton composable, **not** a Pinia store. Exposes `loadFromHex`, `loadFromFile`, `loadFromBytes`, `createBlankEdid`, `clear`.
- **`src/components/layout/`** — `TopNav.vue`, `LeftNav.vue` (the section tree, whose entries are derived from which blocks the loaded EDID actually contains), `HexViewer.vue`.
- **`src/components/edid/`, `cea/`, `displayid/`** — the per-section panels. `edid/` and `cea/` are editors; `displayid/` is currently read-only.
- **`src/lib/byteRanges.ts`** — maps a UI section id to the byte ranges it covers so `HexViewer` can highlight them. It walks the encoded bytes rather than re-deriving offsets from the model. **A new section panel needs an entry here too**, or its bytes silently stop highlighting.
- **`src/lib/readDisplayEdid.ts`** — the only place that should `invoke` the Tauri display-read command. See HANDOFF.md.
- **`src/types/edid.ts`** — `EDIDViewModel` is a `Pick<EDID, ...>` of what the UI reads. Exposing a new `EDID` member to components means adding it to that `Pick`.
- **`src/components/ui/`** — shadcn-vue primitives.

### `src-tauri/`

`display_edid.rs` implements reading EDIDs from attached monitors per OS; `lib.rs` registers the commands. Rust returns raw bytes only — it does no EDID parsing, so a wrong decode is an `edidts` bug. Details and platform caveats in HANDOFF.md.

### Tech stack

Vue 3 (`<script setup>`), Vite 8, TypeScript 6, Tailwind CSS v4 via `@tailwindcss/vite`, shadcn-vue (new-york / neutral), Vitest, Tauri 2, `@vueuse/core`, `reka-ui`, `@lucide/vue`. Path alias `@/` → `./src/`.

Note the app and the package pin **different major versions of Vitest** (root 4.x, `packages/edidts` 1.x). `npm test` from the root runs everything under the root's version; `npm test` inside the package uses its own. Prefer the root command so both suites run the same way CI would.

`pinia` is listed in `package.json` but **unused** — there is no `createPinia()` call and no `src/stores/`. Don't add state there on the assumption it's already wired up; extend `useEDID.ts` instead.

## DisplayID specifics

`DisplayID_v2_1a.pdf` in the repo root is the VESA DisplayID v2.1a spec (gitignored). There is **no v1.3 spec available here**, which bounds what can be implemented for v1.x — see below.

Two structure versions coexist in the wild and both are supported:

- **v2.x** (version byte `0x2n`): data block tags `20h`–`2Eh`, `7Eh`, `81h`. Decoded per spec section 4.
- **v1.x** (version byte `0x1n`, e.g. `0x12` for v1.2): the legacy `00h`–`1Fh` tag space that v2 reserves. Handled in `displayid/legacy.ts`. **This is what many shipping monitors actually use.** Only the Type I detailed timing block (`03h`) is decoded field by field; everything else keeps its raw payload and a correct name, because guessing a layout without the v1.3 spec would be worse than showing bytes.

`decodeDisplayIdSection` derives the structure version from byte `00h[7:4]` and threads it into block decoding, so **any new block work has to be explicit about which version's tag space it belongs to**.

Things about this format that have already caused bugs:

- **DisplayID 2.1a is the *document* version; the *structure* version byte stays `0x20`.** Do not expect `0x21`. Blocks carry their own revision numbers.
- **Nearly every count is stored as (value − 1).** Pixel counts, line counts, refresh rates, pixel clocks: `0000h` means 1.
- **Pixel clock units differ per timing type.** Type VII is 1 kHz; v1.x Type I is 10 kHz. Getting this wrong yields refresh rates off by 10×, which looks plausible enough to miss.
- **Descriptor sizes are variable**, read from header bits (Type VII byte `01h[6:4]`, Type X and Adaptive-Sync likewise). Never assume the base size.
- **The same bit can change meaning across block revisions.** Type VII byte 3 bit 7 is "preferred" at revisions 0–1 and "YCbCr 4:2:0 support" at revision 2.
- **Luminance fields are IEEE 754 half-precision, and negative zero is the "not provided" sentinel** — so the sign of zero must survive a round trip (`half-float.ts`, `Object.is(v, -0)`).
- **ARVR_HMD (`2Ch`) / ARVR_Layer (`2Dh`) are deliberately not field-decoded.** Spec §4.10 forbids them in EDID Extension Sections, which is all this app reads.
- **Appendix A of the spec is internally inconsistent.** Its byte `01h` declares 134 bytes-in-section while the checksum covers all 147; the test fixture uses the value Table 2-1 mandates and says why. Don't "fix" the fixture to match the PDF.

## Important Conventions

- **Follow the spec, and cite it.** Comments in `packages/edidts/src/` reference section/table numbers (e.g. "v2.1a Table 4-18"). Keep doing that — it is what makes these bit layouts reviewable.
- **Verify against real bytes, not plausibility.** `packages/edidts/tests/fixtures.ts` holds full EDIDs, including real monitor dumps; `testedids.test.ts` auto-collects every exported `Uint8Array` that looks like an EDID and round-trips it. When adding a fixture as a multi-line hex string, **remember the `+` between lines** — JS automatic semicolon insertion makes the missing operator *valid syntax* that silently truncates the constant to its first line, and the fixture loader's length check then skips it, so tests stay green while covering nothing.
- **Bit/byte parsing:** mask and shift in the decoder, reverse it exactly in the encoder, and add a round-trip test. Preserve trailing bytes a future revision might add rather than dropping them.
- **Decode defensively.** A malformed or short block should degrade to a generic/raw block, not throw, so one bad block cannot hide the rest of a section. A whole section that fails to parse is reported via `sectionError` rather than failing the entire EDID parse.
- **TypeScript strictness differs by project.** `strict` is on everywhere, but `noUnusedLocals`/`noUnusedParameters` are **enabled in `packages/edidts` and disabled in the app** (`tsconfig.app.json`). Unused variables fail the package build, not the app build.
- **Reactivity caveat:** the model is plain classes over `Uint8Array`, which Vue cannot deep-track. Mutations go through `App.vue`'s handlers, which reassign arrays/objects and then call `syncEdid()` → `edid.encode()` → `triggerRef`. Mutating a `Uint8Array` element in place will not re-render.
- **Adding UI components:** only add shadcn-vue primitives via the CLI (`npx shadcn-vue@latest add <component>`). Never hand-write or hand-edit them. The CLI also tends to bump unrelated deps (`reka-ui`, `@vueuse/core`, `@lucide/vue`) as a side effect — revert that churn before committing rather than letting it ride along with a feature.
- **Don't let tooling noise into commits.** Running `npm install` can rewrite `package-lock.json` with optional platform-specific dependency churn unrelated to your change; check `git diff` before staging.
