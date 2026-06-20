# Contributing to VOTReader/app

> Last updated: 2026-05-10. See **PLAN.txt** for the live improvement plan
> and **CLAUDE.md** for stable project knowledge.

---

## Working directory

**Primary:** `D:\VOTReader-studio\` — all edits go here.

**Legacy:** `C:\Users\corbi\OneDrive\Desktop\VOTReader-studio\` — the
`/app` subfolder is a Windows Junction pointing at `D:\VOTReader-studio\app`.
**Never edit through the C: path.** Read it if you need to (it's the same
files), but only edit on D:.

---

## Running the app

### PC (development)

The simplest path is to open `app/src/main/assets/index.html` directly in a
browser. The app is a self-contained single-file React app.

For a more realistic dev environment (so relative URLs resolve correctly
and you can test service-worker-style features later), run an HTTP server:

```bash
cd app/src/main/assets
python -m http.server 8090
# Then visit http://localhost:8090/index.html
```

### Android APK

Build with Gradle:

```bash
./gradlew assembleDebug
# APK at: app/build/outputs/apk/debug/app-debug.apk
```

The Android shell is a thin WebView (`MainActivity.kt`) that loads
`index.html` from assets. All UI lives in the HTML/JS — there is no
native Kotlin rendering.

---

## Validating data

Run this after any data file edit:

```bash
python check_balance.py
```

This catches three classes of bugs that ALL cause a black-screen failure:

1. **JS parse errors** (esprima-validated) — unbalanced braces/brackets/parens
2. **Smart quotes used as JSON delimiters** (`"` instead of `"`)
3. **Unicode dashes in verse ranges** (`12:18–20` instead of `12:18-20`)

Other validators:

```bash
python misattribution_check.py     # MTAM letter-link audit
python excerpt_audit.py            # verify excerpt source titles exist
python ocr_gap_check.py            # OCR coverage check (only if you ran OCR)
```

See **CLAUDE.md** "Quick start" section for the full bug taxonomy.

---

## Architecture overview

The whole app is one file: `app/src/main/assets/index.html` (~12,500 lines,
~708 KB). It's a pre-compiled React 18 app — raw `React.createElement`,
no JSX, no bundler.

**Key files:**

```
app/src/main/assets/
├── index.html             ← THE WHOLE APP
├── search.js              FlexSearch-based search engine (~1,500 lines)
├── search-data.js         search data dictionaries (~600 lines)
├── react.min.js, react-dom.min.js
├── flexsearch.min.js, html2canvas.min.js
├── data-schema.d.ts       NEW: unified schema for Phase 2 (design only)
├── data-normalize.js      NEW: normalizer skeleton (Phase 2 starting point)
└── data/                  ~28 data files, ~46 MB total
    ├── volume-{one..seven}.js     Volumes 1-7
    ├── lords-rebuke.js, letters-flock.js, letters-timothy.js
    ├── wtlb-{one,two}.js, wtlb-scriptures.js
    ├── the-blessed.js, holy-days.js, hidden-manna.js
    ├── matthew.js, matthew-nkjv.js, matthew-plain.js
    ├── bible-studies.js
    ├── books.js, books-restored.js
    └── bible-{kjv,asv,bsb,hnv,lsv,web,ylt}.js  (lazy-loaded alts)
```

**Central registry:** the `COLLECTIONS` array in index.html (~line 3414)
is the source of truth for all 15 content collections. Lookup maps
(`COL_BY_KEY`, `COL_BY_CARD`, `COL_BY_LETTER_SC`, etc.) derive from it.
When adding/removing/renaming a collection, edit COLLECTIONS first.

---

## Editing principles

1. **Edit before Write.** Use the targeted Edit tool for surgical changes;
   reserve Write for new files.
2. **Read before Edit.** Always read the target region first.
3. **No regex at file scope.** Local string replacements only.
4. **Preserve other entries.** When editing letter N in a multi-letter file,
   only touch letter N.
5. **Verify after every batch.** Open the app, check the affected screen.
6. **Format-preserving.** Volume Two uses unquoted JS keys (`id: "..."`);
   other volumes use JSON-quoted (`"id": "..."`). Match the file's
   existing format. (Phase 2 will unify this.)

---

## Coordinating with parallel work

This project may have multiple Claude sessions running concurrently. The
authoritative coordination document is **PLAN.txt** at the project root.
Before making non-trivial changes:

1. Re-read **PLAN.txt** for the current phase and active work.
2. Check **CLAUDE.md** for stable conventions and the bug taxonomy.
3. If you're starting a new feature or refactor, update PLAN.txt to claim
   the work area before starting.

**Currently in progress (parallel session):**
- **Notebooks feature** — UI for organizing notes by topic, in
  `src/ui/screens/Library*` and related sheets. The data model already
  exists in `NoteStore` (`notebookIds[]` field). Do NOT touch
  `AnnotationStore` / `NoteStore` core in ways that conflict.

---

## Common bug patterns to avoid

The renderer has known data-quality patterns documented in CLAUDE.md
section 6.6 as **D1 through D10**. Most common:

- **D3** — orphaned `[N]` brackets in body text (legacy footnote markers
  not converted to `{t:'fn',v:'N'}` segments)
- **D8** — glued text near refs (`"verse{{ref:Matt 4:4}}"` with no space)
- **D9** — compound refs not split with `" | "` separator
- **D4** — translation-tagged ref (e.g., `"John 14:6 (CJB)"`) missing
  from the entry's `nkjv` dict (must use that translation's text, not NKJV)

When fixing data bugs, fix the SOURCE, not the renderer. The renderer
should serve clean data; defensive renderer guardrails are bandaids that
hide future regressions.

---

## Getting started checklist

1. Read **PLAN.txt** end-to-end — understand the 5-phase improvement strategy.
2. Read **CLAUDE.md** sections 1-7 — understand the app's architecture and
   the current data formats.
3. Open `app/src/main/assets/index.html` in a browser — explore the app
   from a user perspective.
4. Run `python check_balance.py` — confirm your data files pass.
5. Pick a Phase 1 task from PLAN.txt (smallest scope) — execute, verify,
   move on.

---

## Where to put new code

Until Phase 3 (modularization) lands, all code goes into `index.html`.
After Phase 3, the layout will be:

```
app/src/main/assets/
├── index.html             ← thin shell (boot only)
├── src/
│   ├── stores/            ← localStorage-backed stores
│   ├── data/              ← COLLECTIONS, scripture-refs, nav-index
│   ├── hooks/             ← custom React hooks
│   ├── ui/
│   │   ├── atoms/         ← NavButtons, HomeBtn, etc.
│   │   ├── sheets/        ← NoteSheet, LinkPicker, etc.
│   │   └── screens/       ← LetterView, BibleChapterView, etc.
│   ├── App.js             ← root component
│   └── boot.js            ← CSS injection + ReactDOM mount
└── (data/ unchanged)
```

When Phase 3 lands, follow the layer rules: pure logic before atoms,
atoms before sheets, sheets before screens. See PLAN.txt §3.3 for the
modularization order.
