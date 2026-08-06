# edid-editor

Client side EDID Viewer and editor

The project is a continuation of [goedid](https://github.com/thyge/goedid)

The project is implimented as a vue app but all EDID decoding and editing is contained in the [edidts](https://github.com/thyge/edid-editor/tree/main/src/edidts) directory.
##  Goals:
* Being able to visualise EDID, CEA and DisplayID
* Being able to edit key aspects of EDID CEA and DisplayID

### TODOS:
* Create CVT generator for adding Detailed Timing Descriptions to EDID and CEA extension
* Create CEA Block generator for adding CEA blocks to CEA extension

## Building

This is an npm-workspaces monorepo: the root is the Vue app, and
`packages/edidts` is a separate library package that the app depends on
via `"edidts": "workspace:*"`. The app additionally has a Tauri shell in
`src-tauri/` that wraps the same Vue frontend into a native desktop app.
So "building the app" can mean three different things depending on what
you want out of it — a browser build, a desktop build, or just running
it locally. All three are covered below.

### 0. Prerequisites

* **Node.js** and **npm** (developed against Node 22; npm workspaces
  require npm 7+).
* **Rust + Cargo** — only needed for the desktop (Tauri) build, not for
  the plain web build. Check with `rustc --version` / `cargo --version`;
  install via [rustup](https://rustup.rs) if missing. `src-tauri/Cargo.toml`
  declares `rust-version = "1.77.2"` as the floor.
* **Tauri's native prerequisites** — again, desktop build only. These are
  OS-specific system packages (Xcode Command Line Tools on macOS, the
  WebView2 runtime on Windows — usually already present on Windows 10/11,
  and `webkit2gtk`/build tooling on Linux). Follow the official
  [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/)
  for your OS rather than guessing package names here.

Install all workspace dependencies once from the repo root:

```bash
npm install
```

### 1. Build the `edidts` library first

`packages/edidts/dist` is **not committed to git** (see `.gitignore`:
`packages/*/dist`) and there is no `postinstall`/`prepare` hook that
builds it automatically. Because the app imports `edidts` by package name
(not by a relative/`src` path), Vite and `vue-tsc` resolve it through
`packages/edidts/package.json`'s `main`/`module`/`types` fields, which all
point into `dist/`. **On a fresh clone, `dist/` doesn't exist yet — build
it before touching the app:**

```bash
cd packages/edidts
npm run build      # tsc && vite build -> packages/edidts/dist/
cd ..
```

Equivalently, from the repo root: `npm run build --workspace=edidts`.

> **If you ever see confusing TypeScript errors** in app files that don't
> look related to your change (implicit-`any` on values whose type comes
> from an `edidts` import, or a type suddenly showing as `unknown`), the
> most likely cause is a **stale or partial `packages/edidts/dist`** —
> e.g. left over from an interrupted build. `vite-plugin-dts` emits one
> `.d.ts` file per source file plus a bundled `index.d.ts`; if a rebuild
> got interrupted, `index.d.ts` can end up referencing sibling `.d.ts`
> files that were never (re)written, which degrades those imported types
> silently instead of failing loudly. Fix: `rm -rf packages/edidts/dist`
> and rebuild it with the command above, then retry.

### 2. Build the Vue app (web)

From the repo root:

```bash
npm run build
```

This runs `vue-tsc -b && vite build`:
* `vue-tsc -b` type-checks the whole project in TypeScript's *build*
  (composite/project-references) mode. This is **not** the same as
  running `vue-tsc --noEmit` directly — the root `tsconfig.json` has an
  empty `files: []` and only lists `references`, so a plain `--noEmit`
  invocation at the root silently checks nothing. Use `vue-tsc -b`
  (or just `npm run build`, which always does) to actually type-check
  the app.
* `vite build` bundles the app into static files at **`dist/`**
  (HTML/CSS/JS, no server needed) — this is the same `dist/` referenced
  by `src-tauri/tauri.conf.json`'s `frontendDist`, which is how the
  desktop build gets its frontend.

Other useful root scripts:

```bash
npm run dev       # Vite dev server at http://localhost:5173, with HMR
npm run preview   # serve the dist/ output produced by `npm run build`, for a quick sanity check
npm run test      # vitest run — the edidts encode/decode unit tests (packages/edidts/tests)
```

`npm run dev` only needs step 0 + `npm install` + a built `edidts`
(step 1) — it does not require Rust/Tauri at all, since it's just the
browser-facing Vue app.

### 3. Build the desktop app (Tauri)

The desktop shell reuses the exact same Vue frontend — `tauri.conf.json`'s
`beforeBuildCommand`/`beforeDevCommand` call `npm run build`/`npm run dev`
for you, so you don't need to build the frontend by hand first (steps 1–2
still need to have been done at least once so the workspace and its
dependencies exist, but the Tauri CLI re-runs the frontend build itself
as part of its own build).

```bash
npm run tauri dev     # launches a real native window, hot-reloading the Vue frontend inside it
npm run tauri build   # produces a release build + installer/bundle for your current OS
```

`npm run tauri build` compiles the Rust backend (`src-tauri/`) in release
mode, then bundles it with the built frontend into a native package. On
this machine (macOS), that produces:

```
src-tauri/target/release/app                              # the raw executable
src-tauri/target/release/bundle/macos/EDID Editor.app      # the .app bundle
src-tauri/target/release/bundle/dmg/EDID Editor_<version>_<arch>.dmg   # a distributable disk image
```

The equivalent on Windows would be an `.exe`/`.msi`/NSIS installer under
`src-tauri/target/release/bundle/`, and on Linux a `.deb`/AppImage —
`tauri.conf.json` sets `bundle.targets: "all"`, so whatever bundle
formats make sense for the OS you're building *on* all get produced.

**Tauri builds for the platform and architecture you build it on** — it
does not cross-compile by default. Building a Windows `.exe` requires
building on (or targeting) Windows; you can't reliably produce one from
macOS without a Windows VM/machine or CI (e.g. a GitHub Actions job using
a `windows-latest` runner). The same applies in the other direction.

### Inspired by:

* https://tomverbeure.github.io/video_timings_calculator
* https://github.com/dgallegos/edidreader
* https://github.com/ValZapod/edid-decode
* https://www.monitortests.com/forum/Thread-Custom-Resolution-Utility-CRU