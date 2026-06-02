# Vendored runtime libraries — provenance (SE7)

The app ships these third-party libraries as static, pre-minified files in
`app/src/main/assets/` (loaded directly by `index.html` / concatenated into
`bundle-a` — there is no npm pull at runtime). They are **not** the versions in
`package.json` `devDependencies`; those drive the build tooling and the
vitest / JSDOM test stack only. Recorded here so the runtime supply chain is
auditable and a swapped or tampered blob is detectable.

Re-verify after any change to a vendored file:

```sh
cd app/src/main/assets && sha256sum react.min.js react-dom.min.js flexsearch.min.js html2canvas.min.js
```

| File | Version (self-reported) | Bytes | sha256 |
|------|-------------------------|-------|--------|
| `react.min.js` | 18.2.0 | 10737 | `4b4969fa4ef3594324da2c6d78ce8766fbbc2fd121fff395aedf997db0a99a06` |
| `react-dom.min.js` | 18.2.0-next-9e3b772b8-20220608 | 131882 | `21758ed084cd0e37e735722ee4f3957ea960628a29dfa6c3ce1a1d47a2d6e4f7` |
| `flexsearch.min.js` | 0.7.41 | 16480 | `ab0bf1b56ac635ad502a9a6c0dda0467754fc3c696db7b8175a669f8af1a1848` |
| `html2canvas.min.js` | 1.4.1 | 198689 | `e87e550794322e574a1fda0c1549a3c70dae5a93d9113417a429016838eab8cb` |

Versions are self-reported by each blob (the `version="…"` string each library
embeds). FlexSearch 0.7.41 is the version the search engine's AND/OR semantics
were verified against in the search-cluster work (see `AUDIT-PLAN.txt` SR1–SR4).

## Runtime vs. test React version skew

The **shipped runtime React is 18.2.0** (with the matching `18.2.0-next` react-dom
build), while `package.json` pins **React 19.x** for the build + the
vitest / `@testing-library/react` test run. So the app runs on React 18.2.0 on
device, but the component test suite exercises those components under React 19.
This has held since the app was built and it ships correctly; the residual risk
is that a component relying on React-19-only behavior could pass tests yet
misbehave at runtime. Worth aligning the two whenever React is next touched —
flagged here rather than changed, since swapping the vendored runtime React is a
deliberate, separately-verified upgrade (Chromium-69 floor, UMD `this` contract).
