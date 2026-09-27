# Lighthouse mobile baseline, September 2026

This is a measurement only, with no code changes. It records the first mobile Lighthouse baseline for the PWA
and the five changes most likely to move it. Every item below would need its own PR. None of them changes what
the reader sees.

## How it was measured

- **Build:** `npm run build` on `main` at `8a1facb` (2026-09-27). The build was byte-identical to the committed
  `dist/`, and the working tree was clean.
- **Server:** a local static server on 127.0.0.1 serving `app/src/main/assets/`, with gzip and
  `Cache-Control: max-age=600` to mimic GitHub Pages. It was a throwaway script, not committed. The repo's
  `tools/preview-server.py` sends `no-store` and no compression, which would distort the transfer numbers.
- **Tool:** Lighthouse 12.8.2 (`npx lighthouse --form-factor=mobile`) on headless Chromium 141. Throttling was the
  default simulated slow 4G (150 ms RTT, about 1.6 Mbps) with a 4x CPU slowdown on a 412 px wide screen.
- **Runs:** 3 per page, and the table shows the median. Every run was a cold profile, so each one is a first visit
  in which the service worker installs and precaches during the run.
- **Pages.** The app has one URL, so a letter and a Bible chapter were reached through the shared-passage link
  (`?p=`, `src/hooks/use-shared-passage-link.js`), which is what a reader tapping a shared link gets:
  - Home: `/`
  - Letter: `/?p=letter:the-wide-path:0` (Volume Two, "The Wide Path")
  - Bible: `/?p=bible:john:3:16`

## Scores (median of 3)

| Page | Perf | A11y | Best Pr. | SEO | FCP | LCP | TBT | CLS | Speed Index | TTI |
|---|---|---|---|---|---|---|---|---|---|---|
| Home | **83** | 93 | 100 | 100 | 1.5 s | 3.9 s | 250 ms | 0.001 | 1.5 s | 4.4 s |
| Letter | **45** | 94 | 96 | 100 | 1.1 s | 12.7 s | 4,630 ms | 0.001 | 2.5 s | 13.2 s |
| Bible | **45** | 93 | 100 | 100 | 1.5 s | 11.4 s | 4,300 ms | 0.001 | 2.5 s | 11.7 s |

Spread across runs: Home's Performance score was 72, 83 and 84 (the first run had a 630 ms TBT). Letter and Bible
were 44 or 45 in every run. TBT on the reading pages ranged from 3.4 s to 5.9 s.

What the numbers say:

- **First paint is fine everywhere** (FCP 1.1 to 1.5 s), and layout is stable (CLS ≤ 0.001).
- **The reading pages lose on main-thread work, not on the network.** About 96% of the letter's LCP is render
  delay, and 9 to 13 s of main-thread work (4x throttled) happens during load. The single largest contributor on
  every page is html2canvas (item 1).
- **Transfer per page:** Home 462 KiB, Letter 2,020 KiB, Bible 1,841 KiB. The large lazy files (gzip transfer)
  are `bundle-a-bible.js` at 1,412 KB, `src/data/bible-studies.js` at 975 KB and `bundle-a-vot.js` at 621 KB.
- **Accessibility, Best Practices and SEO.** The only accessibility failure is `meta-viewport`: `index.html` sets
  `maximum-scale=1.0, user-scalable=no`, which blocks pinch zoom. It is a deliberate product choice and out of
  scope here, but it caps A11y at about 93. The letter's Best Practices score of 96 comes from two
  `ERR_CERT_AUTHORITY_INVALID` console errors. Those are artifacts of the sandbox proxy (a request for
  `votreader.github.io/songs/catalog.json` and one GitHub Release mp3) and would not happen on a phone.

## Top 5 opportunities

Ranked by expected gain on the reading pages. The gains are estimates from these traces and have not been measured
after a fix. Items 3 and 4 touch `index.html` or the service worker, which another lane owns right now, so
coordinate with that lane before starting them.

### 1. Keep html2canvas tab-thumbnail captures out of page load

- **Evidence.** html2canvas used 4.5 to 8.2 s of main-thread time on the letter and Bible runs (median about 6.5 s)
  and 1.1 to 1.4 s on Home. It was the top entry in `bootup-time` in every run, it owned most of the 20 long tasks
  (each 500 to 1,200 ms), and it is the main source of forced reflows. The trace shows
  `takeThemedScreenshot` → `_ensureHtml2canvas`. The "capture after nav" effect fires 350 ms after a screen
  change, and the dual-theme capture renders the page twice more from a clone.
- **Files.** `app/src/main/assets/src/hooks/use-thumbnails.js` (the capture-after-nav effect and the calm gate) and
  `app/src/main/assets/src/utils/platform-bridge.js` (`_ensureHtml2canvas`, the web screenshot implementation).
- **Change.** On the web, do not capture during load. Either wait until the page has been idle past LCP (for
  example with `requestIdleCallback` and a floor of several seconds after the first render), or capture only when
  a second tab exists. The overview-open path already captures urgently and would still keep the cards correct.
  Android uses native PixelCopy and is not affected.
- **Expected gain.** TBT on the letter and Bible drops from about 4.5 s to under 1 s, and TTI drops by several
  seconds. That is likely +15 to 25 Performance points on the reading pages and about +5 on Home. It also frees the
  main thread on real phones during the first seconds of reading.

### 2. Stop footnoted letters from preloading the whole Bible corpus

- **Evidence.** `GoToRefButton` calls `window.__loadBibleCorpus()` in its mount effect, and every footnote in
  `FootnoteListSection` renders one. So any letter with footnotes downloads `bundle-a-bible.js` (5.0 MB raw,
  1.41 MB gzip) before the reader taps anything, and its parse is a 540 to 610 ms long task. The request initiator
  in the trace is `Cg` in `bundle-d.js`, which is `GoToRefButton`.
- **Files.** `app/src/main/assets/src/ui/components/GoToRefButton.jsx` (the mount effect at line 33).
  `FootnoteSheet.jsx` and `FootnoteListSection.jsx` are its callers.
- **Change.** Warm the corpus on `pointerdown` or focus of the button, or schedule it at idle well after LCP. The
  existing tap path already loads the corpus and retries, so the behaviour at tap time does not change.
- **Expected gain.** On a footnoted letter: 1.41 MB less transfer, about 0.5 to 0.6 s less main-thread work, and
  one fewer long task. Under slow 4G those bytes compete with `bundle-a-vot.js` for bandwidth, so letter LCP
  could improve by a few seconds. That needs confirming by measurement.

### 3. Split the Bible corpus so a chapter doesn't wait for every book

- **Evidence.** The Bible page's LCP (11.4 s) is render delay behind `bundle-a-bible.js`. That file holds all 66
  books of NKJV (`src/data/books.js`, 6.9 MB before minify) plus `books-restored.js` and `matthew-plain.js`, and
  all of it has to arrive and parse before John 3 can render.
- **Files.** `tools/build.py` (`A_BIBLE`), `app/src/main/assets/src/data/books.js`, the `bible` loader and
  `__finishBibleInit` in `app/src/main/assets/index.html`, and the `CORPUS_VERSION` / `ASSET_INTEGRITY` handling in
  `app/src/main/assets/service-worker.js`. The `index.html` and service worker parts are owned by another lane.
- **Change.** Emit one file per book, or per testament, with a thin index that defines `BOOKS` lazily. Load the
  requested book first and the rest at idle, so offline precaching still covers everything. Every bare `BOOKS[...]`
  consumer has to tolerate a partly loaded corpus, and the lazy-corpora contract in ARCHITECTURE.md ("Lazy
  corpora") has to be extended to cover it.
- **Expected gain.** A single-book request is tens of KB instead of 1.41 MB. Bible LCP should fall from 11.4 s to
  somewhere near Home's (about 4 s), plus a Performance gain of about +15 on the Bible page. This is the largest
  structural change of the five and needs the corpus-version rules followed exactly.

### 4. Reduce render-blocking CSS and the synchronous bundle-a

- **Evidence.** Lighthouse estimates 570 to 760 ms of render-blocking savings on Home and Bible.
  `dist/app.min.css` is 288 KB raw and 47 KB gzip, and `dist/bundle-a.js` (155 KB raw, 53 KB gzip) is a
  synchronous `<script>` at `index.html:184`, ahead of first paint.
- **Files.** `tools/split-lazy-css.mjs`, which already moves CSS used only by the lazy bundles (e to h) out of the
  boot sheet. Also `app/src/main/assets/index.html` (the `<link>` at line 111 and the `<script>` at line 184),
  which is owned by another lane.
- **Change.** Extend the split to rules used only by screens that are never the first route (Journal editor,
  Matthew study views, sheets), and load bundle-a with `defer` if the boot sequence allows it. The pre-paint theme
  script has to stay inline and blocking, or the first frame will be the wrong theme.
- **Expected gain.** About 0.6 s off FCP and LCP on Home (Lighthouse's estimate), which is roughly +5 Performance
  points on Home. There is no visual change as long as the cascade order is kept, as `split-lazy-css.mjs` already
  guarantees.

### 5. Move screens that are not needed at boot out of bundle-d

- **Evidence.** `unused-javascript` flags 136 to 142 KB of the 185 KB gzip `bundle-d.js` (653 KB raw) as not
  executed during load on every page, which Lighthouse estimates at about 1.1 s. bundle-b has another 37 KB unused.
- **Files.** `app/src/main/assets/src/ui/_entry-d.js` and a new lazy entry, or the existing
  `_entry-e.js` to `_entry-h.js`. The routes go through `_corpusView(...)` in
  `app/src/main/assets/src/ui/screen-routes.jsx`, and the bundle membership tests
  (`tools/bundle-membership.test.js`) and `tools/check-bundle-budget.js` have to be updated to match.
- **Change.** Candidates are the screens that are reached only by navigation: the Matthew and Bible-study chapter
  views, the Journal editor, and the less common sheets. Use the same lazy pattern as bundles e to h.
- **Expected gain.** About 100 KB gzip and about 1 s less parse and compile (4x throttled) on every cold boot. That
  is +3 to 5 Performance points on Home and a faster TTI everywhere.

### Also worth doing (smaller)

- **Minify `src/data/bible-studies.js`.** It is 4.4 MB raw and loads unminified (Lighthouse estimates 263 KiB of
  savings on 975 KB gzip). A shared letter link loads it, and so does opening any Studies screen. Run it through
  `tools/minify-bundle.mjs` the way the corpora are, and serve the result from the loader in
  `app/src/main/assets/src/data/translations.js` (`loadBibleStudies`).
- **An mp3 request on a letter open.** The letter run requested one GitHub Release mp3 (initiator "other") and the
  song catalog before any tap. This is in the audio player's area, which another lane owns, so it is only flagged
  here. It is worth checking that a first open does not spend the reader's data on audio they did not ask for.

## Reproducing

```sh
npm ci && npm run build
# serve app/src/main/assets on 127.0.0.1 with gzip (any static server)
CHROME_PATH=/path/to/chromium npx lighthouse "http://127.0.0.1:8091/?p=bible:john:3:16" \
  --form-factor=mobile --chrome-flags="--headless=new --no-sandbox" --output=html --output-path=./bible.html
```

Re-run on a real Pixel over `chrome://inspect` before and after each fix. Simulated throttling overstates CPU
cost on a Pixel 9 Pro and understates it on a budget phone.
