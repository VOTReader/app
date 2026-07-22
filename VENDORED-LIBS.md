# Vendored runtime libraries — provenance (SE7)

> Corrected 2026-07-22: the table now reflects the current two-role shipping
> model and drops FlexSearch (retired 2026-07-02 — see below).

The app ships third-party libraries as static, pre-minified blobs — there is
no npm pull at runtime. They are **not** the versions in `package.json`
`devDependencies`; those drive the build tooling and the vitest / JSDOM test
stack only. Recorded here so the runtime supply chain is auditable and a
swapped or tampered blob is detectable.

Blobs play one of two roles today (verified 2026-07-22):

- **Shipped standalone** — the file itself lands in the APK / PWA and is
  served as-is.
- **Build input** — the file is concatenated or esbuild-bundled into a
  `dist/bundle-*.js` at build time. `index.html` loads only
  `dist/bundle-*.js` + `dist/app.min.css`; the source blobs stay in the repo
  but are excluded from the APK by `androidResources.ignoreAssetsPatterns`
  in `app/build.gradle.kts` (`react.min.js`, `react-dom.min.js`,
  `search-data.js` by name; everything under `src/` via `<dir>src`).

Re-verify after any change to a vendored file:

```sh
cd app/src/main/assets && sha256sum react.min.js react-dom.min.js html2canvas.min.js src/search/vendor/minisearch.js
```

| File | Version (self-reported) | Bytes | Role | sha256 |
|------|-------------------------|-------|------|--------|
| `react.min.js` | 18.2.0 | 10737 | build input → `dist/bundle-a.js` | `4b4969fa4ef3594324da2c6d78ce8766fbbc2fd121fff395aedf997db0a99a06` |
| `react-dom.min.js` | 18.2.0-next-9e3b772b8-20220608 | 131882 | build input → `dist/bundle-a.js` | `21758ed084cd0e37e735722ee4f3957ea960628a29dfa6c3ce1a1d47a2d6e4f7` |
| `html2canvas.min.js` | 1.4.1 | 198689 | **shipped standalone** — lazy `<script>` load | `e87e550794322e574a1fda0c1549a3c70dae5a93d9113417a429016838eab8cb` |
| `src/search/vendor/minisearch.js` | 7.2.0 | 64318 | build input → esbuild into `dist/bundle-e.js` | `79ac10272a04c1645db432f71e0e8134777b2274416724eaaccf74246c4a9a33` |

Versions are self-reported by each blob (the `version="…"` / header string
each library embeds). Notes per blob:

- **react / react-dom** stay RAW in the bundle-a concat (`tools/build.py`
  `A` list) — they are UMD builds that read top-level `this`, so they are
  exempt from the PF2 per-file minify.
- **html2canvas** is no longer concatenated into bundle-a (U13): it was
  ~198 KB parsed at every boot but is only used by web tab-thumbnails
  (Android uses native PixelCopy). `platform-bridge._ensureHtml2canvas()`
  lazy-loads it via `<script src="html2canvas.min.js">` on the first web
  screenshot; the file stays SW-precached (`service-worker.js`
  `CORE_ASSETS`) so it's instant/offline.
- **minisearch** is vendored from npm (MIT © Luca Ongaro) as a generated ES
  bundle — do not hand-edit; regenerate per the header comment
  (`npx esbuild node_modules/minisearch/dist/es/index.js --bundle --format=esm`).
  The MiniSearch index shape is defined once in
  `src/search/search-config.js`.

## Retired

- **`flexsearch.min.js` 0.7.41** (sha256
  `ab0bf1b56ac635ad502a9a6c0dda0467754fc3c696db7b8175a669f8af1a1848`) —
  RETIRED 2026-07-02 with the Classic search engine (`search.js`) when the
  owner A/B kept MiniSearch (~97 KB off the cold-boot critical path). The
  file no longer exists in `app/src/main/assets/`; if it reappears in a
  checkout, it's stale — delete it. Hash kept here for the audit trail.

## Runtime vs. test React version skew

The **shipped runtime React is 18.2.0** (with the matching `18.2.0-next` react-dom
build, both inside `dist/bundle-a.js`), while `package.json` pins **React 19.x**
for the build + the vitest / `@testing-library/react` test run. So the app runs
on React 18.2.0 on device, but the component test suite exercises those
components under React 19. This has held since the app was built and it ships
correctly; the residual risk is that a component relying on React-19-only
behavior could pass tests yet misbehave at runtime. Worth aligning the two
whenever React is next touched — flagged here rather than changed, since
swapping the vendored runtime React is a deliberate, separately-verified
upgrade (Chromium-108 floor, UMD `this` contract).
