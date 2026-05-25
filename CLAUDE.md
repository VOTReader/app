# CLAUDE.md — VOTReader-studio briefing

![CI](https://github.com/corbinlythgoe/VOTReader-studio/actions/workflows/ci.yml/badge.svg)

What every agent needs in 30 seconds. For landed work history, see **HISTORY.md**. For deep system reference (annotation engine, COLLECTIONS registry, navigation, audit findings), see **ARCHITECTURE.md**.

**Working dir:** `D:\VOTReader-studio`. The C: OneDrive path is legacy — `C:\Users\corbi\OneDrive\Desktop\VOTReader-studio\app` is a Junction → `D:\VOTReader-studio\app`. Always edit D: files.

---

## Current state (2026-05-24)

- **JSX conversion COMPLETE** (Q2.7-2, `b233cc3`). Every React component is JSX.
- **App() lives in `app/src/main/assets/src/app.jsx`** (Q2.7-1, `c1e3da1`). 2,254 lines after P7b — 17 hooks extracted (15 from P6 + useNavHistoryTracking from P7a + useNav from P7b). App() is hook composition + render tree + nav-helper glue.
- **130+ modules** under `app/src/main/assets/src/` — every screen, sheet, component, store, hook, utility, renderer helper is an ES module.
- **4 cluster bundles** in `app/src/main/assets/dist/`:
  - `bundle-a.js` 11.7 MB — vendor + 21 corpus + search engine (classic-script)
  - `bundle-b.js` 328 KB — stores + components + hooks + journal + scripture-resolution + letter-linking (esbuild IIFE, 31 files)
  - `bundle-c.js` 27 KB — renderer (esbuild IIFE, 3 files)
  - `bundle-d.js` 546 KB — screens + sheets + components + utils + late stores + App() itself (esbuild IIFE, 82 files)

### Q3 ESLint — CLOSED 2026-05-24

- **0 errors / 0 warnings.** Baseline 154/216 → 0/0. CI `--max-warnings 0` locked at `d955e98`; any new warning fails CI. The 55 `eslint-disable-next-line` cites across 31 files were audited at phase close (each cite's named identifiers verified to be read in the corresponding effect body).
- **Pre-commit lint via lint-staged** (`a545d81`): sub-second per-file lint at the commit prompt; same `--max-warnings 0` policy as CI.
- **Bin classification framework** (durable reference for Q4/Q5/Q6 disable cites):
  - Bin 1 — add the dep (eslint's recommended fix; safe for stable setters/callbacks)
  - Bin 2 — disable + ref-mirror / closure-stable cite (useRefMirror, local helpers reading already-tracked closure values)
  - Bin 3 — disable + mount-only or setter-stability cite (`[]`-deps intent; useState setters passed through hook returns)
  - Bin 4 — disable + cache-bust / identity-churn cite (hlTick bump signal, commitDwellNow per-render rebinding)

### Q4 — JSDoc / `tsc --checkJs` (CLOSED 2026-05-24)

37 files typed across utils (11) + stores (11) + hooks (15). App() and the ui/ tree intentionally deferred — that's the App() decomposition phase. See HISTORY.md for the per-commit breakdown.

- **Infrastructure** (`001747b`): `tsconfig.json` `checkJs: true` + `strict: false`; include narrowed to utils/stores/hooks; `_entry-b.js` excluded. `@types/react` + `@types/react-dom` installed. `tools/gen-eslint-globals.py` extended to emit a parallel `tools/globals.generated.d.ts` (331 `declare const X: any;` + Window index signature — cross-bundle is untyped by design). `CachedStoreBase<T>` typedef as the store-layer type root.
- **Pattern** (`b349b02`): `extendStore(base, methods)` helper wraps `Object.assign` with `ThisType<B & M>` so `this` inside store-method literals resolves to BOTH the CachedStore base AND the sibling methods. Lifts every `@ts-nocheck` cleanly.
- **Bundle-b grew** 302→320 KB from JSDoc comments preserved in dev build (esbuild strips comments in minified prod build).
- **Gates live:** `npm run typecheck` runs in CI between lint and build AND in pre-commit Step 3. Zero-tolerance from day one (per [[lint-regression-gate]]); any type error fails the commit.

### Post-Q4 — Q5 safety-net phase CLOSED, App() decomposition IN PROGRESS

**Pinned sequence** (PLAN.txt + [[refactor-after-tests]]): smoke-lite ✅ → Q5 vitest ✅ → **App() decomposition (in progress — P7a landed)**.

**Q5 safety-net phase totals (2026-05-24):**
- **218 tests across 9 files**; 9 of 37 Q4-scope files have direct coverage.
- Coverage ratchet over the phase: statements **1→14**, branches **2→11**, functions **0.4→12**, lines **0.9→15**.
- **Pre-commit gates** (run on src changes, ~5-6s): check_balance → lint-staged → typecheck → vitest → build. CI adds smoke-lite + the gated `test:coverage` variant.

**Q5 commit chain:**
- Infrastructure: smoke-lite (`102b883`), Q5.1 (`742f657`).
- First real test + gate lock: Q5.2 _validateTabState (`a69b739`, 86 tests, 13-rule coverage table).
- Suppress validation: Q5.3 hlTick cache-bust (`ee073f9`) — empirically proved the 24 Bin 4 suppresses guard real refresh behavior (test B asserts stale reads without hlTick in deps).
- Silent-corruption guards: Q5.4 LinkStore migration (`a5fce71`), Q5.5 JournalIndexStore cascade (`02eca54`), Q5.6 useSavedState round-trip (`f3a56c4`), Q5.7 NoteStore cascade (`a3466c1`), Q5.8 useHistory gate (`a9e43c2`), Q5.9 scripture-parse (`41b19ba`).

**Plateau signal recognized** ([[tests-diminishing-returns]]): pre-scripture-parse deltas were +1 per commit on average; the remaining un-tested Q4 surfaces (small utility helpers like book-category, hl-keys, search, tabs, dates, garden) are lower-leverage than App() decomposition. **The safety net is built; time to use it.**

### P7 — App() decomposition (IN PROGRESS, 2026-05-24)

**Goal:** App.jsx under 800 lines. Currently **2,254** (was 2,261 before P7a, 2,256 before P7b).

**Structural measurement (post-P7a):** App() body is lines 24–2253.
- **Logic block:** lines 24–1151 (**1,128 lines** — hooks + callbacks + effects + nav-helper glue).
- **JSX render tree:** lines 1152–2253 (**1,103 lines** — 55 conditional `{screen === "X" && ...}` blocks).

The 50/50 split means **hook extraction alone cannot hit <800.** The render tree by itself is 1,103 lines — that's the floor for any logic-only extraction. PLAN.txt §1 has the two-phase plan and Phase 2's risk profile (CSS selectors, layout shifts, ErrorBoundary placement — render decomposition needs visual smoke walks, not just vitest).

**Phase 1 — logic extraction (active):** target ~1,400–1,600 lines.
- **P7a (LANDED 2026-05-24, `d89775f`)** — useNavHistoryTracking. 18-line useEffect → 115-line hook + 23 vitest tests. The 4-helper disable cite (most architecturally-debted post-Q3 disable in the file, with the extraction candidate named in its own text) moved with the effect. TDZ note: call site lives below `getStudyById`/`getStudyChapter`, mirroring P6l's useAndroidBack. Tests 218→241, branches gate bumped 11→13.
- **P7b (LANDED 2026-05-24)** — useNav. 20 simple nav-chrome helpers extracted (goHome / goScripturesHome / goScriptureGenre / goVolumesHome / 8 navOrigin-pattern: goSettings/goHistory/goAbout/goLibrary/goJournalHub/goNotesIndex/goLinksIndex/goBookmarksIndex/goHighlightsIndex / goJournalViewer / goJournalEditor / 5 trivial switchers: goColIdx/goMatthewIdx/goStudiesHome/goBibleIdx/goToGardenFirst). The 8 navOrigin-pattern `setNavOrigin({ screen, bookId, chapterNum, letterId, studyId, studyChapterId })` literals deduplicate to a single `_captureOrigin()` private helper inside the hook. 34 new vitest tests (8 helper-shape tests + 9 navOrigin-pattern parameterized + 6 journal nav + 3 goColIdx guards + 4 minimality + 4 goHome multi-state). Tests 241→275; statements gate 14→17, functions 12→16, lines 15→17 (branches stays 13 — useNav has few branches). Complex helpers (goTabs / goNavOrigin / goSearch / goSearchOrigin) deliberately deferred to P7c — they need refs + thumbnail-helper deps + 26-line search-context computation; this pilot keeps the param surface narrow ([[low-risk-pilot-first]]).
- **Next (P7c)**: useComplexNav for the 4 deferred helpers (goTabs / goNavOrigin / goSearch / goSearchOrigin) — needs navOriginRef + searchOriginRef + flushScrollToActiveTab + captureActiveTabThumbnail + the window.__goSearch bridge effect.
- **Then**: Bible Studies block (STUDIES/getStudyById/selectStudy/UNIFIED_CHAIN/chain helpers/goToChainEntryFirst/Last) → `useBibleStudies` or split, ~100 lines.
- **Then**: remaining state-coordination glue (handleSelect, handleSurprise, mark-as-read coordinators).

**Phase 2 — render-tree decomposition (PENDING, after Phase 1):** target <800.
- 29 substantive screen blocks total 867 lines; top 5 (garden-view 240, bible-study-chapter 87, matthew-ch 42, bible-ch 40, holy-days-index 37) hold ~447. 26 trivial 4-line letter/index wrappers (~104 lines) collapse via a ScreenRouter pattern.
- **Different risk profile** from Phase 1: render extraction can break CSS selectors targeting the App-level wrapper, shift `useEffect(..., [screen])` semantics, and move ErrorBoundary placement. Each extraction needs visual smoke walk + before/after screenshot, not just tests passing.
- Realistic Phase 2 reduction: ~700–800 lines.

**Post-decomp backlog:** useSyncExternalStore migration (eliminates 24 Bin 4 cites — has test coverage now per Q5.3), bundle-a.js lazy-load (post-Q6 UX), Q6 CSS hardening.

### Roadmap

**`PLAN.txt`** (repo root) is the strategic working memory — slim, current-state. HISTORY.md has the landed-work chapter. CLAUDE.md is the 30-second briefing.

---

## User policies (durable directives, override defaults)

- **App name is "VOTReader"** (personal app; multi-user-shaped but no auth, no organization).
- **NO AI / NO API KEYS / NO LLM** — deferred indefinitely per user 2026-05-11: *"no ai no nothing, no api keys, etc, those are security risks anyway, we'll defer a.i feature."* The LiteLLM nim-proxy is decommissioned. Do not reintroduce.
- **NO credentials / login / auth anywhere.** All personal data stays local on device.
- **NO security risks** — anything that could leak personal data or LAN-expose a service is a defect, not a polish item.
- `android:allowBackup="false"` — Export/Import in Settings → "Your Data" is the only backup mechanism. JSON file, user-owned, no credentials.
- GitHub identity (corbinlythgoe) and Garden image hosting on GitHub Releases are fine for now.
- No Play Store thinking until everything else is done — would also require Timothy's permission first.

---

## File structure

```
D:/VOTReader-studio/
├── CLAUDE.md                          # this briefing
├── HISTORY.md                         # landed work log
├── ARCHITECTURE.md                    # system reference
├── PLAN.txt                           # live strategic working memory
├── package.json, package-lock.json    # esbuild + eslint deps
├── .githooks/pre-commit               # versioned; activate: git config core.hooksPath .githooks
├── tools/
│   ├── build.py                       # emits bundle-a.js
│   ├── preview-server.py              # serves with Cache-Control: no-store
│   ├── smoke.js                       # 12-screen render walk + annotation round-trips
│   └── SMOKE.md                       # smoke harness docs
├── app/src/main/
│   ├── assets/
│   │   ├── index.html                 # 4,043 lines — App() lives in src/app.jsx now
│   │   ├── app.css                    # static CSS (no template literal)
│   │   ├── dist/                      # 4 bundles, regenerated by npm run build
│   │   └── src/
│   │       ├── app.jsx                # function App() — 2,254 lines
│   │       ├── data/                  # scripture-resolution.js + 29 raw corpus files
│   │       ├── stores/                # 11 stores + _entry-b.js
│   │       ├── renderer/              # annotation-engine, dom-links, dom-bookmarks, dom-journal-chip + _entry.js
│   │       ├── ui/
│   │       │   ├── screens/           # 19 screens
│   │       │   ├── components/        # 23 shared components
│   │       │   ├── sheets/            # 17 sheets/pickers
│   │       │   └── _entry-d.js        # esbuild entry for bundle-d
│   │       ├── utils/                 # 11 helper bundles
│   │       ├── hooks/                 # 17 App() hooks (P6 + P7a + P7b)
│   │       ├── components/            # ExpandableText, ErrorBoundary
│   │       └── styles/                # journal-styles
│   └── java/com/votreader/sacredui/MainActivity.kt   # WebView shell + native bridges
└── _ocr_out/, check_balance.py, etc.  # OCR pipeline + data validators
```

**CRITICAL:** Only edit files in `app/src/main/`. Never touch `app/build/`. Always edit D: files, never the C: junction or the `app.OLD-*` backup.

---

## Working-directory health check (run after fresh clone)

```sh
# 1. activate the pre-commit hook
git config core.hooksPath .githooks
# 2. install Node deps (node_modules/ is gitignored)
npm install
# 3. verify the toolchain
node --version    # expect v20+
npx esbuild --version    # expect 0.28+
# 4. rebuild bundles from source (proves the build pipeline works)
npm run build
# 5. preview: serve via tools/preview-server.py (NOT plain python -m http.server)
#    .claude/launch.json already points the preview tool at it.
#    Open index.html, paste tools/smoke.js into preview_eval, call votSmoke()
#    expect PASS line: globals ok, data ok, screens 0 crashed,
#    letterAnn ok, wtlbAnn ok, console.error 0, resource404 0
```

If Node is missing on Windows: `winget install OpenJS.NodeJS.LTS`. Use bash/git-bash for npm commands (PowerShell execution policy blocks `npm.ps1`).

**Preview cache gotcha:** `tools/preview-server.py` sends `Cache-Control: no-store` so reloads always fetch fresh bundles. The plain `python -m http.server` caches `dist/bundle-*.js` heuristically and serves stale bundles after a rebuild — don't use it.

---

## Quick start: app failed to load? read this first

If the app shows a black screen, run the validator:

```bash
pip install esprima  # one-time
python D:/VOTReader-studio/check_balance.py
```

It checks every data file for:
1. **esprima JS parse errors** (authoritative — catches real syntax bugs)
2. **Non-ASCII dashes (en/em) in verse ranges** like `12:18–20` — breaks the renderer's parseRefRange regex, so Unicode superscripts render as **white inline text** instead of gold sup
3. **Smart quotes** (`" " ' '`) used as JSON delimiters instead of ASCII `" '`

These are the three classes of bugs that brace-counting alone misses and any of which causes a black-screen failure or wrong rendering.

### Black-screen failure modes seen in this project

| Symptom | Root cause | Example | How to detect |
|---|---|---|---|
| Black screen at app start | Unescaped `"` inside JSON string value | `"Psalm 50:7": ""Hear, O My people..."" ` | esprima parse error |
| Black screen at app start | Unicode smart quotes used as delimiters | `"t": "text",` | esprima / `check_balance.py` |
| Verse numbers render as **white inline text** instead of gold sup | En dash `–` instead of hyphen `-` in verse range | `Exodus 12:18–20` | `check_balance.py` dash check |
| Footnote sheet shows blank cite | Translation tag mismatch in `nkjv` dict key | `"John 14:6 (CJB)"` not in nkjv | manual verify |
| Tap-through to wrong letter | Letter-link `letterTitle` misattributed | linked to "Subject to No Man" but content is from "A Just God and A Savior" | `misattribution_check.py` |

---

## Permanent rules (never violate)

1. **Verse ranges always use ASCII hyphen `-`**, never en dash `–` or em dash `—`. Affects `chapter:verse-verse` strings in keys, refs, labels, cites — anywhere the renderer parses a verse range. The em dash is fine **only** as separator in compound nkjv values: `"Exodus 12:6 — verse text | Exodus 12:18-20 — verse text"`.

2. **All JSON-style delimiters are ASCII `"`** (or `'` if you must). Smart quotes go INSIDE string values only, where they're typographic content. If a string value contains a literal ASCII `"`, escape it: `\"`.

3. **Run `check_balance.py` after every batch edit.** Single-file edits via `Edit` tool generally don't introduce these, but agent-generated content frequently does (especially OCR-style transcription). The versioned pre-commit hook at `.githooks/pre-commit` does this automatically when any `app/src/main/assets/src/data/*.js` is staged, and runs `npm run build` to regenerate bundles when any bundle-source file is staged. Emergency bypass: `git commit --no-verify` (not recommended).

4. **Footnote NKJV text uses decimal verse markers** (`"19. text 20. text"`) for multi-verse refs, never Unicode superscripts (`¹⁹text ²⁰text`). The `verse-sup` gold inlay rendering only fires when the decimal or superscript-with-clean-range strategy succeeds. Mixed formats fall through to the white-text fallback.

---

## Editing principles

1. **Edit > Write.** Use the Edit tool for surgical changes. Reserve Write for new files.
2. **Read before Edit.** Always Read the target file region first.
3. **No regex at file scope.** User has been burned by this. Local string replacements only.
4. **Preserve other letters.** When editing letter N in a multi-letter file, only touch letter N.
5. **Verify after agent runs.** Diff or re-read the section. Trust but verify.
6. **No new Holy Days originals.** Holy Days is curated cross-references; do not author new content.
7. **Format-preserving.** Volume Two uses unquoted JS keys (`id: "..."`); old volumes use quoted JSON-style (`"id": "..."`). Match the file's existing format.
8. **No bandaid renderers.** If text is broken, fix the source data, not the renderer.
9. **Footnote audience:**
   - Volumes (Format A) → numbered gold bubbles → tap → bottom sheet w/ NKJV verse
   - WTLB / Blessed (Format B) → inline `(Book X:Y)` parenthetical cite → tap → bottom sheet w/ NKJV verse
   - Holy Days entries inherit Format A or B based on `entry.type`

### Anti-patterns (NOT to do)

- Run regex `sed`/`grep -E` at file scope to "patch" footnotes
- Add a CSS bandaid for white verse numbers — fix the data or renderer instead
- Author new Letters that don't exist on the live website
- Use Hidden Manna entries in any public index, search, or home tile
- Add `metaAddendum` fields to letters that don't have an "Also read" on the live site
- Change Volume Two's format (it's the gold standard)
- Mix numbered footnote bubbles with inline `(Ref)` cites in the same letter
- Skip the Read-before-Edit verification

---

## Data formats — collection-by-collection

### Format A: Rich JSON-style (Volumes 1-7, Lord's Rebuke, Letters to Flock, Letters from Timothy, Hidden Manna)

```js
{
  "id": "the-wide-path",                    // URL slug
  "num": 1,                                 // sequence in volume
  "title": "The Wide Path",
  "date": "3/28/05",
  "from": "From The Lord, Our God and Savior",
  "spoken": "The Word of The Lord Spoken to Timothy",
  "forLine": "For All Those Who Have Ears to Hear",
  "audioUrl": "https://thevolumesoftruth.bandcamp.com/...",
  "soundcloudUrl": "...",                   // V1, V3, Timothy only
  "videoVoiceUrl": "https://www.youtube.com/...",
  "videoMusicUrl": "https://www.youtube.com/...",
  "relatedTopics": [
    { "label": "Regarding X", "url": "https://answersonlygodcangive.com/Regarding_X" }
  ],
  "footnotes": {
    "1": { "type": "scripture", "ref": "Isaiah 13:11" },
    "2": { "type": "scripture", "ref": "Psalm 2:12", "seeAlso": { "collection": "Volume Three", "letterTitle": "Grafted In", "label": "Grafted In", "excerpt": "..." } },
    "3": { "type": "note", "text": "Also read: 'Grafted In'", "link": { "collection": "Volume Three", "letterTitle": "Grafted In" } },
    "4": { "type": "note", "text": "External resource", "url": "https://..." }
  },
  "nkjv": {
    "Isaiah 13:11": "I will punish the world for its evil...",
    "Psalm 2:12": "Kiss the Son, lest He be angry..."
  },
  "metaAddendum": "\"Other Letter Title\"",        // Optional (V2 has 2)
  "metaAddendumUrl": "https://...",                // Optional
  "metaAddendumLink": { "collection": "Volume One", "letterTitle": "Other Letter Title" },
  "metaAddendumInternal": "judgment-of-god",       // Same-volume id
  "blocks": [
    { "type": "para", "segments": [
      { "t": "bold-italic", "v": "Thus says The Lord:" },
      { "t": "text", "v": " Peoples of..." },
      { "t": "italic", "v": "I shall surely..." },
      { "t": "fn", "v": "1" }
    ]},
    { "type": "poetry", "lines": [
      [{ "t": "text", "v": "Therefore, turn from this" }],
      [{ "t": "stanza-break" }],
      [{ "t": "italic", "v": "For I AM HE!..." }, { "t": "fn", "v": "2" }]
    ]},
    { "type": "closing", "text": "Says The Lord." },
    { "type": "closing-fn", "segments": [...] },   // Closing with attached footnote
    { "type": "scripture", ... },                  // Quoted scripture block
    { "type": "note", "text": "..." }              // Editorial note block
  ],
  "prevLetter": { "id": "the-wide-path", "title": "..." } | null,
  "nextLetter": { "id": "the-seventh-day", "title": "..." } | null
}
```

**Block types:** `para`, `poetry`, `closing`, `closing-fn`, `note`, `scripture`
**Inline `t` types:** `text`, `italic`, `bold-italic`, `caps`, `fn`, `stanza-break`, `letter-link`

### Format B: Simple paragraph (WTLB One, WTLB Two, The Blessed)

```js
{
  "id": "matters-of-the-heart",
  "num": 11,
  "title": "Matters of the Heart",
  "paragraphs": [
    { "align": "center", "text": "The wailing of the penitent\nBrings forth healing;" },
    { "align": "justify", "text": "Plain prose with _italic_ and **bold** and {{ref:Matthew 4:4}} inline scripture refs and {{nav:esther:7}} bible-chapter nav links." }
  ],
  "scriptures": { "Matthew 4:4": "But He answered..." },   // Optional per-entry NKJV
  "prevEntry": { "id": "...", "title": "..." } | null,    // (used in HOLY_DAYS only)
  "nextEntry": { "id": "...", "title": "..." } | null
}
```

**Inline patterns inside `text`:**
- `_italic_` (single underscore)
- `**bold**` (double asterisk)
- `{{ref:Book Chapter:Verse}}` — tappable scripture popup
- `{{nav:bookId:chapter}}` — navigate to Bible chapter (e.g. `{{nav:esther:7}}`)
- `†` — section divider character (The Blessed)
- `~ [From "Letter Title" ~ Volume X]` — attribution at end of WTLB entry (tap-through wired)

### Format C: Bible book (books.js, books-restored.js, matthew.js, bible-*.js)

```js
{
  "id": "ephesians", "title": "Ephesians",
  "subtitle": "...",
  "chapters": [
    { "num": 1, "title": "...", "sections": [{ "heading": "...", "verses": [{ "n": 1, "text": "..." }] }] }
  ]
}
```

### Format D: Bible Studies (bible-studies.js)

Multi-part studies with chapters. Each study has `parts[].chapterIds[]` referencing chapter entries. Lazy-loaded — saves 4.3 MB from cold-boot.

---

## Letter counts — downloaded vs. live website

| Collection | Downloaded | Status |
|---|---|---|
| Volume One | 29 + preface ("A Word of Warning") | ✅ |
| Volume Two | 29 | ✅ |
| Volume Three | 30 | ✅ |
| Volume Four | 29 | ✅ |
| Volume Five | 29 | ✅ |
| Volume Six | 31 | ✅ |
| Volume Seven | 66 + preface ("The Indignation of The Lord") | ✅ |
| The Lord's Rebuke | 30 + preface ("A Warning") | ✅ |
| Letters to the Flock | 61 + preface ("Be My Examples") | ✅ |
| Letters from Timothy | 14 + preface ("Put All Your Trust in The Holy One") | ✅ |
| WTLB Part One | 149 + intro | ✅ |
| WTLB Part Two | 203 (incl. intro) | ✅ |
| The Blessed | 8 sections + intro | ✅ |
| Hidden Manna | 1 ("Woe to Dallas") | ✅ by design (not publicly indexed) |
| Holy Days | 16 ghost entries (cross-pulled) | ✅ |
| Bible Studies | 7 + Matthew Study Bible (separate file) | partial (see HISTORY §14.5/14.7) |

**Holy Days = ghost album.** Curated cross-references from across other volumes. Each entry has a `sourceLabel` (e.g. "Volume Two"). Audited once for structure/nav; defer content sync until after source sweeps are stable.

**Hidden Manna**: only reachable via Matthew study chain. Do NOT add to public index, search, or home tile.
