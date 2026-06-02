# ARCHITECTURE.md — System reference

Deep dives into annotation, navigation, state management, and rendering. Read when working on those systems. For the current briefing, see CLAUDE.md. For commit history, see HISTORY.md.

---

## Tab state machine

`index.html` was a pre-compiled (Babel-output `React.createElement`) single-file React app. Today `function App()` lives in `app/src/main/assets/src/app.jsx` (extracted Q2.7-1, converted to JSX Q2.7-2). Screen state is held per-tab in a tab state machine.

- **App()** at `app/src/main/assets/src/app.jsx` — **~798 lines**, held at **≤800 by the P11 canary gate** (`tools/check-app-size.js`), after the P6–P11 hook-extraction phases. Composes **~33 extracted hooks** (`src/hooks/`) + the render tree + nav-helper glue. (CQ1: counts drift — verify against the file, don't trust the number.)
- **Per-tab fields** via `tabField('screen')` — each tab maintains independent `screen`, `letterId`, `bookId`, `chapterNum`, `studyId`, `studyChapterId`, scroll positions, etc.
- **`tabs` + `activeTabIdx`** arrays — multi-tab in-app browsing.
- **`fromLetterStack`** per tab — drives **back-pill** navigation. Capped at 50 entries (was unbounded — caught in audit item 40).
- **Source screen restore** in `handleAndroidBack` — pops `fromLetterStack` and restores `sourceScreen` / `sourceLetterId` / `sourceBookId`.

### Back-pill (top of letter screen)

- CSS class: `.back-hint-pill`
- Renders only when `fromLetterStack.length > 0` (i.e. user arrived via tap-through)
- Shown in `LetterView`, `WtlbEntryView`, `BibleChapterView`, and `ChapterView`
- `backHint` object built from top of `fromLetterStack`
- Android hardware back: pops `fromLetterStack` and restores source state
- `openInAppLetter` is the function that pushes onto the stack — **always use this for tap-through**

---

## P6 extraction workflow (proven + hardened through P6d–P6g — follow this exactly)

This is the canonical workflow for any future App() decomposition or hook extraction. P6 completed all 15 hooks with zero regressions using this discipline.

1. **Recon** — (a) map the target's lines; (b) classify every `useEffect` single-vs-mixed concern; (c) **for any function/callback threaded as a hook param, verify it is a `useCallback` (stable identity), not a plain function recreated each render** — a plain function as a param re-fires the consuming hook's effects every render; check stability, not just presence; (d) **assess SPLIT feasibility — explicitly answer "can this extraction be two smaller commits? If yes, name the two clusters and their boundary. If no, explain why not." Force the decision; don't let a wide diff slide as one commit by default**; (e) if the target carries `window.__*` bridges, enumerate EVERY bridge by name.

2. **Brief** — write the HARD hook signature (input/output type sigs, not just line ranges) + DO NOT MOVE callsite list + invariants. Tell the coding agent: *"Follow the structure of `src/hooks/use-thumbnails.js` — named `export function`, destructured params object, no default export, `React.*`-prefixed hooks, header comment with OWNS/DOES NOT OWN/PARAMS/RETURNS/STORAGE."* **TWO MANDATORY brief contents added after P6g retro:** (i) **The targeted test scenario is WRITTEN INTO THE BRIEF here — before the agent codes — not discovered after smoke.** A specific scenario ("open X → trigger Y → navigate away → confirm Z"), not a vague intent. (ii) If the hook carries `window.__*` bridges, the brief contains the **exhaustive named checklist** with each bridge's **expected cleanup form spelled out literally** — e.g. `window.__openNote = null`, not just "`__openNote` has a cleanup" — so the Step 4 diff review is a mechanical name-by-name match.

3. **Code** — coding agent (or direct) writes the hook + edits App().

4. **Diff review** — 2-min read of `git diff` BEFORE smoke. Agents drop lines / mis-thread params in ways smoke won't catch. For bridge hooks, check each `window.__*` cleanup against the brief's checklist by name.

5. **Verify** — `npm run build` + smoke harness, then **run the targeted test that Step 2 already specified.** (It is pre-written, not improvised here — improvising the test at verify time invites hand-waving.) Snapshot/restore any localStorage / IndexedDB the test touches. Examples that earned their place: P6d "enable tabs → navigate → confirm thumbnail captured to IndexedDB" (caught `tabsEnabled` threading, invisible to smoke since the walk runs tabs-off); P6e "scroll → navigate away → back → confirm restored" + "fresh screen → confirm scroll-to-top" (both branches); P6f "shortened dwellMs → commit fires" + "navigate away before dwell → commit cancelled" (both paths); P6g "toggle theme → body.light" + "toggle a setting → its body class" (both dep-array halves).

6. **Commit** — one hook = one commit. Record the new `App()` line count in the message.

### P6 hardening principles

- **Bare `let`/`const` over `export let`/`export const`** for truly module-private mutable state — strict-mode is satisfied by the binding alone.

- **Composition-level sink pattern** (named P6g): when a fused `useEffect` has two concerns with DIFFERENT dep surfaces — one causally owned by the hook, one a cross-cutting sink touching many subsystems — SPLIT it. The owned concern moves into the hook; the cross-cutting sink STAYS in App() until every one of its deps is itself a hook return, then it consolidates into its own hook. Don't give a domain hook custody of state it doesn't own.

- **Agent-cutoff recovery**: if a coding agent is interrupted, Edit/Write are atomic so no file is half-written — `git diff` each target file, confirm each is syntactically whole (`node --check` for hook files; build + smoke for the whole), and the only loss is the agent's text report, which you reconstruct from the diff.

- **DIFF REVIEW IS THE PRIMARY REGRESSION CATCH — not a formality, not just "Step 4".** It reads as one item in the numbered workflow; it carries more weight than that. Across P6d–P6h the 2-minute read of the actual `git diff` BEFORE running anything caught a missing return key and three leaky `window.__*` bridges — the exact class of regression smoke **cannot** see (smoke only walks tabs-off; recon misses things by nature). Recon and smoke are necessary but neither is the catch point. The diff read is. Never skip it, never rush it, never run the build/smoke first and treat the diff as a rubber-stamp afterward. Read the diff cold, line by line, against the brief.

- **EXPECT ONE PRE-EXISTING-BUG DISCOVERY PER EXTRACTION.** Every hook P6d–P6h surfaced exactly one latent bug the extraction merely *exposed* — leaky bridges, a missing return key, the BookmarkPopover prop mismatch, the bookmark icon absent from `HighlightableText` views. This is not coincidence: surgical extraction forces reading code closely enough to see what was always broken. Posture: expect the discovery, document it cleanly, fix it in a SEPARATE commit if it's out of the extraction's scope, and keep the extraction commit pure. The workflow produces clarity as a side effect of discipline — that is what makes the run trustworthy.

- **DEAD CODE GETS ITS OWN COMMIT BEFORE THE EXTRACTION.** When recon surfaces dead code in the target region — a function defined but never called, a state variable written but never read — remove it in its own commit first, then extract. Bundling the removal into the extraction commit makes the diff unreadable and makes it impossible for a future reader to tell whether the code was removed *because* of the extraction or because it was pre-existing rot. Clean the site before you build on it. Example: `popFromLetter` (defined-but-never-called, removed at `309194e`) before the P6i extraction (`80eed25`).

### Post-P6 hook call-order DAG

The authoritative call-order graph — 13 App()-level hooks, numbered, each annotated with its hook dependencies — is the comment block at the App() hook-call site in `app/src/main/assets/src/app.jsx` (originally committed at `eb2de5d` in index.html, then carried over to app.jsx during Q2.7-1). **That comment is the single source of truth.** It is deliberately NOT duplicated here: a maintained second copy is exactly what drifts. The true tail is `… → useTabActions → usePersistedState → useNavigateToLink → useAndroidBack` (useAndroidBack is HARD-LAST — it must follow every `go*` nav helper, and `goStudiesHome` is defined deep in App()). Do NOT reorder hook calls without consulting the app.jsx graph.

---

## Section 17 — Annotation System (Highlights, Underlines, Notes, Links)

Major rewrite 2026-05-09: kind-aware annotations, distinct note visuals, tap-to-act chip with inline confirm, read+edit NoteSheet. Library/notebooks/multi-note disambiguation landed in subsequent commits (see §17.13 + §17.14).

### 17.1 Architecture overview

Today the annotation layer lives in modules (extracted P1):

- **Storage layer** (`src/stores/`): `AnnotationStore` on `vot-annotations` (aliased as `HighlightStore` for back-compat), `NoteStore` on `vot-notes`, `LinkStore` on `vot-links`. Migration `migrateAnnotations()` runs once on first load and rewrites old `vot-highlights` data into the new schema.
- **HighlightableText** (`src/renderer/annotation-engine.js`): React component that renders plain-text strings with kind-aware `<mark>` wrappers based on character offsets. Computes per-group first/last segment so notes get a left ribbon and a trailing icon exactly once per group.
- **applyDOMHighlights()** (`src/renderer/annotation-engine.js`): post-React DOM walker that wraps annotated ranges in any `[data-hl-key][data-hl-dom]` container. Same kind-aware logic as `HighlightableText` for `LetterView`/`WtlbEntryView`.
- **SelectionToolbar** (`src/ui/sheets/SelectionToolbar.js`): floating popup; appears when user selects text inside a `[data-hl-key]` element.
- **AnnotationActionChip** (`src/ui/sheets/AnnotationActionChip.js`, replaces old `HlRemoveMenu`): floating chip that appears when user TAPS an existing highlight or underline mark. Buttons: ✕ Remove · 🎨 Color · 📝 Note (convert). Tap ✕ → chip morphs in place to an inline confirm strip ("Remove this highlight?" · Cancel · Yes, remove). Tap 🎨 → chip swaps to a 10-color row. Tap 📝 → flips kind to 'note' + opens NoteSheet edit mode. Outside-tap dismisses entirely. **Notes do NOT use this chip** — tap on a note routes directly to NoteSheet read mode.
- **NoteSheet** (`src/ui/sheets/NoteSheet.js`): bottom sheet for the full note experience. Two modes: `read` (default) and `edit`. Read mode shows the anchored quote, the note body (or a "tap ⋯ → Edit to add one" empty state), and a `⋯` menu with Edit · Change color · Add to notebook · Share · Delete. Delete uses the same inline-confirm pattern as the chip. Edit mode shows a textarea + Cancel/Save.
- **LinkIcon, LinkSidebar, LinkPicker**: link system — scoped per `hlKey`, persisted to `vot-links`.

### 17.2 Storage models

```js
// vot-annotations  (segment records — the rendering anchors)
{
  "<hlKey>": [
    {
      id,                 // segment id (one per container span)
      groupId,            // shared by ALL segments of a logical annotation; ALWAYS present
      kind,               // 'highlight' | 'underline' | 'note'
      color,              // one of HL_COLORS (yellow|green|pink|red|orange|blue|purple|teal|brown|gray)
      start, end,         // char offsets within the container
      text,               // captured text of THIS segment
      created, updated
    }
  ]
}
// hlKey examples:
//   bible:proverbs:2:1                     (Bible verse)
//   letter:the-wide-path:7                  (LetterView block index)
//   wtlb:matters-of-the-heart:0             (WTLB paragraph index)
//   study:matthew-22:11                     (Matthew SB verse)
// Single-segment annotations have groupId === id.
// Multi-paragraph / multi-verse selections produce N segments sharing one groupId.

// vot-notes  (note bodies — first-class records keyed by groupId)
{
  "<groupId>": {
    groupId,
    notebookIds: [],      // [] = Uncategorized; multi-membership supported
    body,                 // the user's note text (may be '' for fresh notes)
    color,                // matches the segments' color
    fullText,             // joined text across all segments (for indexing / display)
    keys: [...],          // every hlKey the note touches (for navigation)
    created, updated
  }
}

// vot-links
[
  {
    id, created,
    a: { type:'bible', key, bookId, chapter, verse, label, preview },
    b: { type:'bible', key, bookId, chapter, verse, label, preview }
  }
]

// vot-ann-migrated  ('1' once one-time migration of vot-highlights → vot-annotations + vot-notes has run)
// vot-highlights  (legacy — left in place after migration as a backup; safe to remove after a few release cycles)
```

### 17.3 Three kinds — visual + behavioral matrix

| Kind | Mark visual (default) | Mark visual (active) | End-of-span affordance | Tap behavior |
|---|---|---|---|---|
| **highlight** | Solid color band (`.hl-{color}`) over text | (same — always shown) | None | Action chip (Remove · Color · Note) |
| **underline** | Colored solid bottom border (`.hl-underline.hl-{color}`), no background | (same) | None | Action chip (Remove · Color · Note) |
| **note** | **Plain text** — `.hl-note:not(.is-active)` strips background, border, padding, AND text-decoration via `!important`. The text reads completely unadorned. | **Wavy underline** in the note's color — `.hl-note.is-active` sets `text-decoration-line: underline; text-decoration-style: wavy; text-decoration-thickness: 1.6px`. The wavy style is intentionally chosen to read as "annotation" and is visually distinct from highlight (solid bg) and underline (solid bottom border). | A single 📝 icon at the end of the WHOLE group (one per group, not per container) | Opens NoteSheet (read mode) directly |

The trailing icon is rendered by `applyNoteIcons()` — a global post-render walker. It strips every existing `.hl-note-icon` and re-inserts exactly one icon per group, anchored to the GLOBAL last `mark.hl-note[data-group-id]` in document order. Called from the same post-render effect that runs `applyDOMHighlights()` and `applyDOMLinks()`.

The active-state lookup is driven by `applyActiveNoteState()` (called from the post-render effect and when `noteSheetTarget` changes). It reads `window.__activeNoteGroup`, strips any prior `.is-active`, then adds `.is-active` to every `mark.hl-note[data-group-id="…"]` and `.hl-note-icon[data-group-id="…"]` matching the open note. Multi-paragraph notes light up across all containers simultaneously.

**Why wavy and not tint+ribbon (the original design)?** First feedback round: tint + ribbon on every paragraph of a multi-paragraph note read as cluttered and didn't fit the app aesthetic (gold/cream/dark literary feel). Wavy underline is a single, restrained signal that universally reads as "annotation" and sits visually parallel to the existing solid-underline kind without being mistaken for it. The per-color rules use `!important` because the `text-decoration` shorthand expansion in the base `.hl-note.is-active` rule sets `text-decoration-color: currentColor`, which would otherwise win the cascade despite the more-specific `.hl-note.is-active.hl-{color}` selector.

**One icon, not N.** The end-of-span 📝 icon must appear EXACTLY ONCE per note group, no matter how many paragraphs/verses the note spans. Per-container emission (the original design) put one icon in each touching container, which read as multiple separate notes. The fix: HighlightableText and applyDOMHighlights no longer emit any icons; `applyNoteIcons()` does it globally after every render.

**Icon color follows note color.** `applyNoteIcons()` parses the `hl-{color}` class off the last segment's mark and copies it onto the icon span. CSS rules `.hl-note-icon.hl-{color} svg { stroke: <hex>; }` set the stroke per color — except for `hl-yellow`, which has NO override so it falls back to the default `var(--gold)`.

### 17.4 Two rendering strategies

| Strategy | Used by | How |
|---|---|---|
| **HighlightableText (React)** | `BibleChapterView` (Bible verses), `ChapterView` (Matthew study) — anywhere the text is a single plain string | Component takes `{text, hlKey, hlTick}`, splits into segments using stored `start/end` offsets, renders one `<mark class="hl-mark hl-{kind} hl-{color}">` per segment + a trailing `.hl-note-icon` after note last-segments |
| **DOM-based overlay** | `LetterView` (mixed segment children), `WtlbEntryView` (paragraphs with inline patterns) | Container gets `data-hl-key={key}` + `data-hl-dom={true}`. After React renders, `applyDOMHighlights()` walks `[data-hl-dom]` containers, computes char offsets via `TreeWalker`, splits text nodes, wraps in `<mark class="hl-mark hl-dom hl-{kind?} hl-{color}">` and emits a trailing `.hl-note-icon` after note last-segments |

The DOM overlay re-runs on every `hlTick` change. Existing `mark.hl-dom` AND `.hl-note-icon` elements are stripped before re-applying.

For **multi-container** annotations (one groupId, segments in different containers), each container renders its own first-segment ribbon and last-segment 📝 icon. Tap any icon or any segment → opens the same shared note (groupId routing). Removal always operates on the whole group via `AnnotationStore.removeGroup(groupId)` + `NoteStore.remove(groupId)`.

### 17.5 Per-view integration map

| View | Container | hlKey format |
|---|---|---|
| BibleChapterView | `<HighlightableText>` per verse | `bible:{bookId}:{chapter}:{verse}` |
| ChapterView (Matthew) | `<HighlightableText>` per verse | `study:matthew-{chapter}:{verse}` |
| LetterView blocks | `<p data-hl-key="letter:{id}:{bi}" data-hl-dom>` | `letter:{letterId}:{blockIndex}` |
| WtlbEntryView paragraphs | `<p data-hl-key="wtlb:{id}:{pi}" data-hl-dom>` | `wtlb:{entryId}:{paragraphIndex}` |

### 17.6 Tap routing (in SelectionToolbar's pointer lifecycle)

On `pointerup` (collapsed selection — i.e. a tap, not a drag-select):
1. If target is `.hl-note-icon` → call `window.__openNote(groupId)` (read mode).
2. If target is inside `mark.hl-mark[data-kind="note"]` → call `window.__openNote(groupId)` (read mode).
3. If target is inside any other `mark.hl-mark` → call `window.__showAnnChip(x, y, hlKey, groupId)` (action chip).
4. Otherwise → `computeAndShow()` for normal selection toolbar.

Same routing applies to `contextmenu` (Android long-press / right-click).

### 17.7 SelectionToolbar UX (top-of-selection, NEW selections)

```
┌─────────────────────────────────────────┐
│ [A] [A̲] │ ⓞ ⓞ ⓞ ⓞ ⓞ ⓞ ✕            >  │   ← style + colors (scrollable)
│ ─────────────────────────────────────── │
│ [📝]  [🔗]  [📋]  [↗]  [🔍]               │   ← actions
│ NOTE  LINK  COPY SHARE SEARCH            │
└─────────────────────────────────────────┘
```

- **Style toggle**: "A" highlight, "A̲" underline.
- **Color circles**: 10 saturated colors. Tap → creates a new annotation of `kind=activeStyle` (highlight/underline) with that color, removing any overlapping groups first.
- **Note button**: bypasses style; either converts an existing covering group to `kind:'note'` or creates a new note-kind annotation. Always opens NoteSheet edit mode after.

### 17.8 Action handlers

- **Note** (`handleNote`): finds any covering group; converts it OR creates a fresh note-kind group. Builds/refreshes the `NoteStore` record from the segments. Opens NoteSheet with `startInEditMode=true`.
- **Link** / **Copy** / **Share** / **Search**: unchanged from the previous design.
- **Action chip → Remove**: in-chip confirm step → `AnnotationStore.removeGroup(groupId)` + `NoteStore.remove(groupId)`.
- **Action chip → Color**: swaps to color row; tap a color → `AnnotationStore.recolorGroup(groupId, c)` + `NoteStore.update(groupId, { color: c })` (note color stays in sync).
- **Action chip → Note**: `AnnotationStore.convertGroup(groupId, 'note')` + `NoteStore.set(groupId, …)` + opens NoteSheet edit mode.

### 17.7b LinkPicker — full navigation picker

The picker is a full-height bottom sheet that handles ALL nav targets across the app, modeled after the LDS Gospel Library "Link" screen.

**Components near `bookCategory()`:**

- **`buildNavIndex()`** — lazily builds (and caches on `window.__NAV_INDEX`) a flat list of every navigable target across the app. Total ~1969 items across:
  - Bible book chapters (every book × chapter combo, ~1189 entries)
  - Volume One–Seven letters (each `LETTERS_V*` array)
  - Letters from Timothy / to the Flock / Lord's Rebuke
  - Words To Live By Part One / Part Two entries
  - The Blessed sections, Holy Days entries
  - Matthew Study Bible chapters
  - Each item has: `kind`, `label`, `category`, plus `aliases[]` — alternate strings users might type. Bible has built-in 3-letter abbreviations (`gen`, `eph`, `mt`, `1cor`, etc).

- **`searchNavIndex(query, limit)`** — ranked candidate matcher:
  1. Tries Bible reference parser first — handles `Eph 6:5`, `Genesis 1:1-3`, `1 Cor 7:32-35`. Bible refs score 1000 (always top).
  2. For everything else, scores aliases: exact 900; starts-with 700 − len-diff; contains 400 − position; title-contains 200.

- **`navItemToEndpoint(item)`** — converts a nav-index item into a link-store endpoint object.
- **`navItemPreview(item)`** — fetches verse text for Bible/study chapter previews.

**Smart-input examples that work:**

| Input | Result |
|---|---|
| `Eph 6` | Ephesians 6 |
| `Eph 6:5` | Ephesians 6:5 |
| `1 Cor 7:32-35` | 1 Corinthians 7:32-35 |
| `Matt 22` | Matthew 22 |
| `v1l2` | Honor Not the Day of the Dead... Honor God (V1 L2) |
| `Vol 2 Letter 5` | The Holy Spirit |
| `WTLB1 33` | Trust, Obey and Love |
| `The Wide Path` | The Wide Path (direct title) |
| `wisdom` | Multiple "wisdom" letters across collections |

**`RecentNavStore`** — localStorage-backed `vot-recent-nav`. Caps at 30 entries, dedupes by kind+id, sorted newest-first. The picker shows the top 20 in its "Recent" section when the search input is empty.

**LinkPicker refinement flow:**
1. User picks a target from search results → `createLinkTo(item)`
2. If target is a Bible/study chapter without a specific verse → opens `VersePickerScreen` (tap verse to select, tap again to extend range)
3. If target is a letter/WTLB/Blessed/Holy Days entry → opens `LetterExcerptPickerScreen` (renders entry body as plain text blocks; user selects a text range)
4. On confirm, `persistLink()` creates a `LinkStore` entry with both endpoints and deduplicates

### 17.7c Highlight color palette

```
yellow → #ffd700  (the OG highlighter)
green  → #76ff03  (lime/highlighter green)
pink   → #ff4081  (hot pink)
red    → #f44336  (classic red)
orange → #ff9100  (bright orange)
blue   → #2196f3  (vivid blue)
purple → #ba68c8  (vivid purple)
teal   → #00bcd4  (was previously called 'cyan')
brown  → #8d6e63  (subtle, low-emphasis)
gray   → #9e9e9e  (subtle, low-emphasis)
```

**Back-compat:** The old palette used `'cyan'` (value `#4dd0e1`). Old saved highlights with `color: 'cyan'` still render — `.hl-cyan` and `.hl-underline.hl-cyan` rules are kept as compat shims (rendering the new teal value).

### 17.7e Selection-toolbar pointerup lifecycle

The toolbar uses a `dragRef` + `pointerdown`/`pointerup`/`touchend`/`contextmenu` lifecycle:
- `pointerdown` → `dragRef.current = true`, hide stale toolbar
- `pointerup` / `touchend` → schedule `computeAndShow()` 60ms later (lets selection finalize)
- `selectionchange` → only HIDES the toolbar (when selection collapses)
- `contextmenu` (Android long-press) → also schedules `computeAndShow()` 80ms later

Result: toolbar appears once after selection settles, rather than following the cursor pixel-by-pixel during drag.

### 17.9 CSS classes

```css
/* Highlights */
.hl-mark              /* base mark wrapper */
.hl-blue/purple/red/orange/green/cyan    /* solid fills */
body.light .hl-blue/...                   /* light-mode variants */
.hl-underline         /* removes background, applies text-decoration: underline */
.hl-underline.hl-blue { text-decoration-color: #4fc3f7; }   /* per-color */

/* Selection toolbar */
.sel-toolbar          /* container */
.sel-toolbar-row      /* horizontal flex row */
.sel-style-btn        /* "A" buttons (.active when current style) */
.sel-style-btn-underline   /* underlined "A" variant */
.sel-toolbar-divider  /* vertical 1px separator */
.sel-toolbar-colors   /* color row (overflow-x: auto) */
.sel-color-btn        /* circles (.active when current selection matches) */
.sel-color-underline  /* shows as ring instead of fill */
.sel-color-clear      /* ✕ remove button */
.sel-toolbar-actions  /* 5-column grid for action buttons */
.sel-action-btn       /* one action button */

/* Link icon next to verse */
.verse-link-icon      /* the small chain icon */
.inline-link-icon     /* 13×13 chain SVG, gold tint — injected by applyDOMLinks */

/* Link sidebar */
.link-sidebar-overlay /* dim backdrop */
.link-sidebar         /* right-side panel */
.link-sidebar-header  /* close X + title row */
.link-sidebar-date    /* date row */
.link-sidebar-body    /* card list */
.link-card            /* one card */
.link-card-header     /* ref + chain icon row */
.link-card-ref        /* reference label */
.link-card-chain      /* chain icon SVG */
.link-card-cat        /* category subtitle */
.link-card-preview    /* verse text */
.link-card-remove     /* "Remove link" */

/* Link picker bottom sheet */
.link-picker-overlay  /* backdrop */
.link-picker-sheet    /* sheet */
.link-picker-input    /* ref input */
.link-picker-suggestions  /* dropdown */
.link-picker-btn      /* "Create Link" CTA */

/* Note kind — distinct from highlight/underline */
.hl-note                            /* base */
.hl-note:not(.is-active)            /* strips bg, border, padding, decoration via !important */
.hl-note.is-active                  /* wavy underline — applied to ALL segments of the open note's group */
.hl-note.is-active.hl-{color}       /* per-color text-decoration-color (!important) */
.hl-note-icon                       /* 14px 📝 SVG; tappable; one per group (added by applyNoteIcons) */
.hl-note-icon.is-active             /* brightens while the parent note is open */
.hl-note-icon-badge::after          /* small gold count badge for multi-note merge */

/* Annotation action chip (replaces hl-remove-menu) */
.ann-chip                  /* container — appears on tap */
.ann-chip-btn              /* main 3-button row (Remove · Color · Note) */
.ann-chip-confirm          /* inline confirm strip in place */
.ann-chip-confirm-q        /* "Remove this highlight?" question */
.ann-chip-confirm-cancel
.ann-chip-confirm-yes
.ann-chip-colors           /* color-picker mode: 10 circles + back arrow */
.ann-chip-color-btn[data-color="…"]   /* one circle */
.ann-chip-back             /* "‹" back to main mode */

/* Note sheet */
.note-sheet-overlay
.note-sheet
.note-sheet-header         /* color dot + title + ⋯ menu button */
.note-sheet-color-dot
.note-sheet-title
.note-sheet-menu-btn       /* the ⋯ button */
.note-sheet-anchor         /* italic quote of the anchored text */
.note-sheet-body           /* read-mode body display */
.note-sheet-empty          /* "No note text yet…" placeholder */
.note-sheet-textarea       /* edit-mode input */
.note-sheet-footer         /* Cancel/Save in edit mode; Edit in read mode */
.note-sheet-save
.note-sheet-secondary
.note-sheet-menu           /* dropdown panel under the header */
.note-sheet-menu-item      /* one menu button */
.note-sheet-menu-item.danger     /* Delete note */
.note-sheet-menu-colors    /* color sub-panel inside ⋯ menu */
```

### 17.13 Library, Notes index, Notebooks, Multi-note popover

**Library** is a top-level destination, accessible from the home screen as the 6th nav tile (between Studies and Settings). It hosts four sub-spaces; Notes is active, Bookmarks landed too.

`HomeScreen.ITEMS_BY_ID.library` and `DEFAULT_ORDER` were extended; `App.handleSelect` routes `id === 'library'` → `goLibrary()` which sets `screen='library'` (with `setNavOrigin` so the back arrow returns to wherever the user came from — usually home).

**NotesIndexScreen** lives at `screen='notes-index'` and is the user's primary review surface. Includes:
- A header with "My Notes" title and a count.
- A pill-style search input that matches against note body, anchored quote, AND source label (substring, case-insensitive).
- Filter chips: All · Uncategorized · one chip per notebook. Tap to focus; All resets.
- A sort menu popover anchored under the "Sort: Recent ▾" button: Recent · Source · Color.
- A list of `NoteRow`s with: color swatch · source label (Cinzel gold) · relative date · 2-line body preview · 1-line italic anchored quote · subtle Cinzel notebook chips (first 2 + `+N` overflow).
- Empty states: "No Notes Yet" with a hint pointing the user to long-press text in any chapter, OR "No Matches" when filter/search excludes everything.

Tapping a row navigates to the source chapter via `navigateToLink(noteSourceNav(note))`, and stashes the groupId on `window.__pendingOpenNote`. The post-render effect in `App` consumes the flag and opens the NoteSheet on arrival, with a 60ms inner timeout so the marks have rendered first.

**NotebookStore** is a list-based store on `vot-notebooks` (`{ list: [{ id, name, sortIndex, created, updated }] }`). Notebooks have NO color (kept simple per user direction); the color belongs to the note. CRUD: `add(name)`, `rename(id, name)`, `remove(id)` (cascades via `NoteStore.pruneNotebook(id)`), `list()`, `get(id)`.

**`NoteStore.toggleNotebook(groupId, notebookId)`** flips a notebook's membership on a note. **Multi-membership is supported** — a note can live in 0, 1, or many notebooks. The `notebookIds: []` array on each note record is the source of truth.

**Source label generation** is handled by `noteSourceLabel(note)` and `noteSourceNav(note)` near `bookCategory()`:
- Bible/study keys (`bible:proverbs:2:1` etc.) → "Proverbs 2:1-3" via `_verseRangeLabel` which compresses sorted verse numbers into ranges with commas.
- Letter/WTLB/Blessed/Holy-Days keys → letter title via `findEntryContext()`.

**Multi-note overlap support**:
- `applyHighlight` (highlight/underline create path) still removes overlapping groups (recolor semantics).
- `handleNote` (note-create path): only converts an OVERLAPPING NON-NOTE group (highlight/underline → note). When the overlap is itself a note, it creates a NEW stacked note alongside.
- `applyNoteIcons` MERGES icons that share an insertion point. When multiple groups share an anchor it renders a single `.hl-note-icon.hl-note-icon-badge` with `data-count="N"` and `data-group-ids="g1,g2,…"`. The CSS `.hl-note-icon-badge::after` adds a small gold count badge.
- `MultiNotePopover` (overlay + popover, anchored at the tap point) lists each note: color swatch, body preview, relative date, notebook tags. Tap a row → opens that note's sheet.
- Tap routing in SelectionToolbar:
  - Tap on a `.hl-note-icon` reads `data-group-ids`. >1 → call `__showMultiNote(groupIds, x, y)`. 1 → `__openNote(groupId)`.
  - Tap on a `mark.hl-note` queries `document.elementsFromPoint(x, y)` to find ALL note marks at the tap point. >1 distinct groupIds → popover. Otherwise direct open.

### 17.14 Overlap rendering — sweep-line refactor

`HighlightableText` (Bible verses + Matthew study) supports overlapping annotations of ANY kind (highlight, underline, note can stack in any combination) via **sweep-line segmentation**:

1. Collect every annotation's clamped `start`/`end` plus `0` and `text.length` into a sorted boundary list.
2. Each adjacent pair of boundaries defines a SEGMENT in which the set of active annotations is constant.
3. For each segment, render a chain of NESTED `<mark>` elements — one per active annotation. Order: outermost = earliest start (id tiebreak); innermost = latest start. CSS cascade then does the right thing: a highlight's background paints first, an underline's solid bottom border paints over it, and a note's wavy underline paints on top of both.

Multiple `<mark>` elements may now exist for a single annotation (one per segment the annotation spans). `applyNoteIcons` keys by `data-group-id` and keeps the LAST mark per group in document order — so each group still emits exactly ONE icon (at the rightmost segment that contains it).

`first-segment` and `last-segment` classes are now computed against the segment index, not the annotation index.

**applyHighlight relaxation**: the recolor flow used to remove ANY overlapping group when a new highlight/underline was created. It now removes only EXACT-RANGE matches. This preserves the "select same text, pick new color → recolor" UX, while allowing partial overlaps to STACK. A user can layer:
- Big yellow highlight on a verse (0–30)
- A red highlight on words 5–10 inside that verse
- A blue underline on word 12–14
- A green note on words 6–8

All four coexist.

**Icon merge by character offset**: `applyNoteIcons` merge key is `hlKey + ':' + charEnd` (where `charEnd` comes from `Range.toString().length` after `setEndAfter(mark)`). When two notes end at the same character position — even if their last marks are NESTED in different DOM levels — they share one icon with a `data-count="N"` badge.

### 17.15 Word-boundary snap + icon-wrap fix

**Problem 1**: When a user's selection ended mid-word, the icon insertion sat BEFORE the wrap-point space, causing the line to break between the noted text and the icon.

**Problem 2**: Even after fixing the icon position, the mark element ending mid-word caused mid-word line breaks because adjacent inline elements form a soft-wrap opportunity at the element boundary.

**Fix 1 (icon insertion)** in `applyNoteIcons` — when the icon's insertion point is `beforeNode` and the preceding text ends with a regular space, MOVE that space from the preceding text to the leading edge of the tail. The wrap point now sits AFTER the icon.

```js
const prev = ip.node.previousSibling;
if (prev && prev.nodeType === 3 && / $/.test(prev.nodeValue)) {
  prev.nodeValue = prev.nodeValue.replace(/ $/, '');
  ip.node.nodeValue = ' ' + ip.node.nodeValue;
}
```

**Fix 2 (word-boundary snap at the data layer)** — `snapRangeToWords(text, start, end)` expands a selection range outward until both endpoints land on word boundaries. Applied at every annotation creation site. This matches the convention of every major reader app (Kindle, Apple Books, LDS Gospel Library).

```js
function snapRangeToWords(text, start, end) {
  const isWord = (c) => !!c && /[\w’'-]/.test(c);
  while (start > 0 && isWord(text[start - 1]) && isWord(text[start])) start--;
  while (end < text.length && isWord(text[end - 1]) && isWord(text[end])) end++;
  return { start, end };
}
```

### 17.16 Back-pill on Bible/Matthew + Notebook Manager

**1. Tap-through back-pill on Bible chapter destinations.** `BibleChapterView` and `ChapterView` now accept `backHint` and `onTapThroughBack` props. New `tapThroughBack()` helper in App pops the top of `fromLetterStack` (via `fromLetterRef.current` — `tabField` setters' updater functions run async) and restores state.

**2. Notebook management from the Notes index.** The Notes index has a Notebooks button that opens `NotebookManagerSheet` — a bottom sheet that lists every notebook with note count, ✎ rename, × delete, and a `[name input] [Create]` strip. Distinct from `NotebookPickerSheet`: the picker has checkbox rows that toggle membership for a specific note; the manager has no note context, just CRUD.

### 17.17 Notes hub restructure — tabs + notebook cards + drilled view

The Notes hub is a tabbed two-screen layout:

**Notebooks tab** (default landing) shows a card grid:
- First card always: **Uncategorized** ("Default" eyebrow, dashed border).
- One card per user notebook (gold name, "Notebook" eyebrow, count).
- Last card: **+ New Notebook** (dashed, gold-dim) — tap → inline `[name input] [Cancel] [Create]` form.
- Tap any card → drills into that notebook's notes.

**Drilled-in view**:
- Header row: `‹` back arrow · notebook title · **Rename** button · **Delete** button (omitted for Uncategorized).
- Rename: inline text input replaces the title; Enter/blur commits, Esc cancels.
- Delete: inline confirm strip ("Notes will move to Uncategorized") → cascades.
- Sort toggle button: "Newest first ↓" / "Oldest first ↑" — single-click toggle.
- Rows: full NoteRow components.

**All Notes tab**: flat chronological list of every note. Single sort toggle: "Newest first ↓" / "Oldest first ↑".

**State machine** in `NotesIndexScreen`:
- `tab`: `'notebooks' | 'all-notes'`
- `drilledNbId`: `null | 'uncategorized' | <notebookId>`
- `newNbInline`, `newNbName`: inline +New form state.
- `renaming`, `renameValue`, `confirmDeleteNb`: inline rename/delete state in drilled view.

**`NoteRow` is a top-level component** so it can be shared across the drilled view and All Notes tab.

### 17.18 Single-shot back-pill

User feedback: the "Back to My Notes" pill persisted after the user navigated to a different chapter. It should only show on the IMMEDIATE destination of the tap-through and disappear the moment the user moves on.

Fix: each entry pushed by `_navToLinkRef.current` records a **`destSnapshot`** — the expected `{screen, bookId, chapterNum, letterId, studyId, studyChapterId}` of the destination, computed from the endpoint type BEFORE the state changes happen.

Two consumers:
1. **`backHint` computation** — when the top stack entry has a `destSnapshot`, the pill renders ONLY if every snapshot field matches the current state.
2. **Prune effect** — a useEffect that pops the entry if `destSnapshot` doesn't match the current state. Keeps the stack clean.

Legacy push paths (like `openInAppLetter` used by letter→letter footnote tap-throughs) don't set `destSnapshot`, so they keep the existing multi-level back behavior — only the Notes-index path opts into single-shot semantics.

### 17.11b Default-vs-active note rendering

Three rounds of feedback shaped the final note rendering:

**Round 1**: Notes always showed faint tint + ribbon → too busy, didn't fit the app aesthetic.
**Round 2**: Default plain text + tint-on-active was OK, but the active-state still looked too much like a faint highlight. User asked for active-state to be visually distinct from BOTH highlight and underline. Also: a multi-paragraph note was rendering one trailing icon per container.

**Final rendering rules**:
- **Inactive**: `.hl-note:not(.is-active)` strips background, border-left, padding-left, AND text-decoration with `!important`. Text reads completely plain.
- **Active**: `.hl-note.is-active` applies a wavy underline.
- **One icon per group**: `applyNoteIcons()` is a post-render DOM walker (now exported from `src/renderer/annotation-engine.js`).
- **Sheet stacking**: NoteSheet returns a single `<div class="note-sheet-overlay">` whose CHILD is `<div class="note-sheet">`. The overlay's flex layout (align-items: flex-end) positions the sheet, and the sheet's `e.stopPropagation()` prevents the overlay's click-to-close from firing through it.

---

## Section 18 — Architectural refactor (COLLECTIONS, CachedStore, NavButtons, boundaryConfig, etc.)

Major code-quality pass on 2026-05-09: eliminated ~200 lines of duplicate branching, extracted shared patterns, unified scripture reference parsing, fixed a UX bug in history cards.

### 18.1 COLLECTIONS registry (`src/data/scripture-resolution.js`)

Single source of truth for all 15 content collections. Replaces 150+ duplicate if/else/switch branches scattered across navigation, back-routing, search, last-read tracking, and data loading.

```js
const COLLECTIONS = [
  { volKey: 'one', cardId: 'volume-one', readKey: 'volume-one', globalName: 'LETTERS_V1',
    prefaceGlobal: 'LETTERS_V1_PREFACE', letterScreen: 'vot-one-letter',
    indexScreen: 'vot-one-index', label: 'Volume One', registryLabel: 'Volume One',
    searchVolId: 'v1', kind: 'letter', surpriseType: 'vot-one' },
  // ... 14 more entries (all volumes, Timothy, Flock, Rebuke, WTLB 1/2, Blessed, Holy Days, Hidden Manna)
];
```

**Derived lookup maps (O(1) access):**
- `COL_BY_KEY` — volKey → collection (`COL_BY_KEY.get('three')`)
- `COL_BY_CARD` — cardId → collection (home card routing)
- `COL_BY_LETTER_SC` — letterScreen → collection (back handler)
- `COL_BY_INDEX_SC` — indexScreen → collection (back handler, history card labels)
- `COL_BY_SEARCH_ID` — searchVolId → collection (search result routing)
- `COL_BY_READ_KEY` — readKey → collection (mark-as-read system)
- `LETTER_SCREEN_SET` — Set of all letter screens (derived from COLLECTIONS)

**Helper functions:**
- `colLetters(col)` — get the letter array from window[col.globalName]
- `colPreface(col)` — get the preface entry if it exists
- `colLetterArr(col)` — safe array version of colLetters
- `goColIdx(volKey)` — navigate to a collection's index screen

**Fields per collection:**

| Field | Purpose | Example |
|---|---|---|
| `volKey` | Internal key | `'one'`, `'wtlb1'`, `'hm'` |
| `cardId` | Home screen card id | `'volume-one'`, null for hidden manna |
| `readKey` | localStorage mark-as-read key | `'volume-one'`, `'wtlb-one'`, `'hidden-manna'` |
| `globalName` | window global with letter data | `'LETTERS_V1'`, `'WTLB_ONE'` |
| `prefaceGlobal` | window global with preface entry | `'LETTERS_V1_PREFACE'` or null |
| `letterScreen` | Screen state for reading | `'vot-one-letter'`, `'wtlb-one-entry'` |
| `indexScreen` | Screen state for letter list | `'vot-one-index'` or null |
| `label` | Display label | `'Volume One'` |
| `registryLabel` | VOT_LETTER_REGISTRY label (for tap-through) | `'Volume One'` |
| `searchVolId` | Search engine volume id | `'v1'` |
| `kind` | Collection type | `'letter'`, `'wtlb'`, `'blessed'`, `'holy-days'` |
| `surpriseType` | Surprise/random button pool id | `'vot-one'` or null |

### 18.2 CachedStore factory (`src/stores/cached-store.js`)

Extracted shared localStorage cache pattern from HighlightStore, LinkStore, and RecentNavStore.

```js
function CachedStore(storageKey, defaultVal) {
  return { _cache: null, _load() {...}, _save() {...}, raw() {...} };
}
const HighlightStore = Object.assign(CachedStore('vot-highlights', {}), { get, all, add, update, remove, removeAllForKey });
const LinkStore = Object.assign(CachedStore('vot-links', []), { getForKey, getForKeyPrefix, all, add, remove });
const RecentNavStore = Object.assign(CachedStore('vot-recent-nav', []), { list, add });
```

### 18.3 Scripture reference primitives

Five shared functions replace duplicate ref-parsing codepaths:

- **`_allBooks()`** — canonical accessor for book data
- **`_matthew()`** — canonical accessor for Matthew Study Bible data. Returns the MATTHEW object or null.
- **`_studies()`** — canonical accessor for Bible Studies array. Returns the array or `[]`.
- **`parseRefStr(str)`** — parses "Book Chapter:Verse-End (Tag)" into `{rawBook, chapter, verse, verseEnd, tag}`.
- **`findBook(rawName)`** — case-insensitive book-name-to-id resolver with plural tolerance ("Psalm" → "psalms"), abbreviation matching ("Eph" → "ephesians"), and id matching.

Used by: `parseScriptureRef`, `lookupVersesFromBooks`, `searchNavIndex`, `resolveVerseText`, `buildNavIndex`, `navItemPreview`, `findEntryContext`, `VOT_LETTER_REGISTRY`, `MATTHEW_CHAIN_ENTRY`.

### 18.4 Consolidated navigation

- **14 `goVotXxxIdx` functions → 1 `goColIdx(volKey)`**
- **`VOL_SCREEN_MAP` (14-entry map in goToLastRead) → `COL_BY_KEY.get(volKey).letterScreen`**
- **`_volLabels` (8-entry map in HistoryEntryCard) → `COL_BY_INDEX_SC.get(entry.volumeScreen).label`**

### 18.5 Last-read state consolidation

Three separate state variables (`lastReadLetter`, `lastReadLetterV1`, `lastReadLetterMap`) consolidated into one unified `lastReadLetterMap` with backward-compatible migration from old localStorage keys.

### 18.6 sharedViewProps pattern

Common props passed to every LetterView and WtlbEntryView extracted into a reusable object:
```js
sharedViewProps = {
  onSearch, onSettings, onHistory, theme, onThemeChange, surpriseAnchor,
  onInAppLink, backHint, hlTick, onLinkOpen, onBack, markAsReadEnabled, showProgressBar
};
// Usage: React.createElement(LetterView, Object.assign({}, sharedViewProps, { letter, volumeLabel, ... }))
```
All 17 render blocks converted. Bug fix: the bible-study-chapter LetterView was missing `onSettings` and `onHistory` props; adding sharedViewProps fixed that gap.

### 18.7 UX fix: history card titles

`HistoryEntryCard` was computing `title` (the actual letter/chapter title) but displaying `fallback` ("Letter 5" / "Chapter 12") in the card. Fixed to show `title || fallback`.

### 18.8 Refactoring summary

| Change | Lines eliminated | Risk |
|---|---|---|
| COLLECTIONS registry | ~150 (14 if-branches × ~10 code paths) | Low — derived maps + helpers |
| CachedStore factory | ~40 (duplicate _cache/_load/_save) | Low — Object.assign preserves methods |
| goColIdx consolidation | ~13 (14 functions → 1) | Low — pure setScreen wrappers |
| parseRefStr + findBook | ~50 (3 duplicate regex + book-matching blocks) | Low — shared by existing callers |
| _allBooks() dedup | ~8 (5 inline copies → 1 function) | Low — identical semantics |
| sharedViewProps | ~150 total (17 blocks × ~9 lines each) | Low — Object.assign spread |
| History title fix | 0 (bug fix) | Low — uses existing data |
| NavButtons extraction | ~240 (24 usages × ~10 lines each) | Low — pure presentational component |
| colReadNavProps + colIdxProps | ~120 (30 blocks × ~4 lines each) | Low — derived from COLLECTIONS registry |
| _goFirst/_goLast boundary maps | ~30 (29 named consts → 10-line loop) | Low — identical semantics via COLLECTIONS |
| _findLetter helper | ~8 (10 inline .find() → 1 helper) | Low — identical semantics |
| History recording loop | ~25 (13 if-else branches → 3 lines) | Low — COL_BY_LETTER_SC lookup |
| History consumption + WTLB_SCREEN_MAP removal | ~5 (6 lines → 3 + deleted map) | Low — COL_BY_INDEX_SC lookup |
| _idxNav() extraction | ~42 (14 index screens × 3 lines each) | Low — identical nav bar fragment |
| IIFE elimination (WTLB1/2, Blessed) | ~18 (3 IIFEs × 6 lines wrapping) | Low — _findLetter pre-resolves |
| _navToChapter extraction | ~12 (4 identical closures → 1) | Low — pure handler dedup |
| colLetterArr in index screens | ~4 (2 typeof safety checks) | Low — colLetterArr is equivalent |
| HD/HM IIFE simplification | ~6 (entry lookup + null guard) | Low — pre-resolved variable |
| getScrollKey COLLECTIONS dispatch | ~4 (hardcoded screen list → kind lookup) | Low — COL_BY_LETTER_SC |
| Reading-dot exclude list | ~1 (21-item array → LETTER_SCREEN_SET + 6) | Low — set + short array |
| linkPreface/linkWtlbEntries loops | ~10 (12 hardcoded calls → 2 COLLECTIONS loops) | Low — identical semantics |
| _matthew() + _studies() helpers | ~20 (5 duplicate typeof guards → 2 helpers) | Low — identical semantics |
| typeof guard elimination (VolumesHome + Settings) | ~6 (6 typeof guards → colLetterArr()) | Low — colLetterArr has typeof safety |
| VOT_LETTER_REGISTRY typeof cleanup | ~3 (2 typeof guards → colLetterArr + _studies) | Low — identical semantics |
| buildNavIndex MATTHEW accessor | ~2 (window.MATTHEW → _matthew()) | Low — same semantics |
| Dead code: WtlbTextLine removed | ~11 lines | Low — superseded by renderTextWithScripRefs |
| CSS debris: duplicate .hl-underline rules | ~2 lines | Low — stale palette-transition leftovers |
| ErrorBoundary class component | +12 lines (new) | Low — wraps App, catches render errors |
| boundaryConfig() helper + READING_CHAIN | ~80 (14 boundary blocks × ~8 lines: V1–V7 + Timothy/Flock/Rebuke + WTLB1/2 + Blessed + HolyDays) | Medium — verified 7 boundary transitions in browser |
| Inline link icons via applyDOMLinks | +60 lines (new function + CSS) | Low — replaces per-paragraph icon with per-range icon |
| Underline highlight skip-ink fix | +1 CSS line | Low — fixes descender clipping in y/g/p/q/j |

### 18.10 NavButtons component

Extracted presentational component (`src/ui/components/NavButtons.js`) rendering the 4-button nav cluster: settings gear, history clock, search magnifier, ThemeBtn. Used across 24 screens.

**Props:**
- `onSettings`, `onHistory`, `onSearch` — click handlers
- `theme`, `onThemeChange` — passed through to `ThemeBtn`
- `reading` (optional) — when truthy, adds `nav-history-reading` CSS class to the history button (reading-mode styling)

**Intentionally left inline (2 screens):**
- `HistoryScreen` renders settings + search + theme but NO history button
- `SettingsScreen` renders history + search + theme but NO settings button

### 18.11 colReadNavProps + colIdxProps

Two helpers defined inside `App()` that derive read-tracking and navigation props from `COLLECTIONS` via `COL_BY_KEY`, eliminating all hardcoded `readKey` strings from render blocks.

**`colReadNavProps(volKey, clearSurprise)`** — returns 5 props for letter/entry screens:
- `onMarkRead: () => markRead(rk, letterId)` — rk from `COL_BY_KEY.get(volKey).readKey`
- `onUnmark: () => unmarkRead(rk, letterId)`
- `isRead: (id) => isRead(rk, id)`
- `onNavigate: (id) => { if (clearSurprise) setSurpriseAnchor(null); setLetterId(id); setActiveReadKey(...); }`
- `onHome: () => goColIdx(volKey)`

**`colIdxProps(volKey)`** — returns 5 props for index screens:
- `onSelect: (id) => { setLetterId(id); setActiveReadKey(...); setScreen(col.letterScreen); }`
- `onSelectPreface`: same function if `col.prefaceGlobal` exists, else `undefined`
- `currentLetter`: reading-dot indicator based on `activeReadKey` match
- `isRead: (id) => isRead(col.readKey, id)`
- `markAsReadEnabled: settings.markAsRead`

**Coverage:** 16 letter/entry render blocks + 14 index render blocks = 30 total. Bible-study chapters use `studyReadKey(study.slug)` (dynamic per study) and are excluded.

### 18.12 _goFirst / _goLast boundary maps

Replaced 29 named `goToVolumeX` / `goToXLast` constants with two maps generated by a COLLECTIONS loop:

```js
var _goFirst = {}, _goLast = {};
COLLECTIONS.forEach(function(col) {
  if (!col.letterScreen) return;
  var arr = colLetterArr(col);
  var pref = colPreface(col);
  _goFirst[col.volKey] = pref ? _firstPreface(pref, arr, col.volKey, col.letterScreen) : _first(arr, col.volKey, col.letterScreen);
  _goLast[col.volKey] = _last(arr, col.volKey, col.letterScreen);
});
```

**Kept standalone (not in COLLECTIONS):**
- `goToRevelationLast` — Bible, not a collection
- `goToGardenFirst` — special screen, not letter-based

### 18.13 LinkPicker / navigation search architecture

**Two search engines — intentionally different:**

| Engine | Used by | Indexes | Purpose |
|---|---|---|---|
| `searchNavIndex()` + `buildNavIndex()` | LinkPicker, RecentNavStore | ~2000 navigable destination titles + aliases | "Navigate to Proverbs 2:6" — alias-based fuzzy match |
| `VotSearch` (FlexSearch, `search.js`) | SearchScreen | ~200K+ text segments across all content | "Find verses about mercy" — full-text phrase match |

These solve different UX problems: content search vs. destination lookup. Using FlexSearch for the nav picker would be over-engineering; using alias matching for content search would be inadequate.

**buildNavIndex derives from COLLECTIONS**: loops `COLLECTIONS` with per-kind alias generation via `NAV_ALIAS_BASES` lookup. Bible chapters, Bible Studies, and Matthew Study remain as separate loops (not in COLLECTIONS).

**COL_NAV_ICON map** (module scope, derived from COLLECTIONS): maps `col.label` → 2-char abbreviation for LinkPicker row icons (`V1`..`V7`, `LT`, `LF`, `LR`, `W1`, `W2`, `TB`, `HD`, `HM`).

**Key functions:**
- `buildNavIndex()`: builds flat navigable-item list, cached on `window.__NAV_INDEX`
- `searchNavIndex(query, limit)`: scored alias matching + Bible ref parsing
- `navItemToEndpoint(item)`: converts nav item → link endpoint object
- `buildSourceEndpoint(sourceKey, ...)`: converts hlKey → link source endpoint
- `persistLink(source, target)`: dedup + store
- `findEntryContext(id, kindHint)`: centralized entry lookup across all COLLECTIONS + Bible Studies

### 18.14 IIFE elimination + _navToChapter + colLetterArr

Pre-resolved entry variables:
```js
const wtlb1Entry = _findLetter('wtlb1');
const wtlb2Entry = _findLetter('wtlb2');
const blessedEntry = _findLetter('blessed');
const hdEntry = _findLetter('holydays');
const hmEntry = _findLetter('hm');
```

`_findLetter(volKey)` already handles `colLetterArr` safety, so these replace verbose `typeof X !== 'undefined' ? X : []).find(...)` patterns inside IIFEs.

**IIFEs eliminated (3):** WTLB1, WTLB2, and Blessed entry screens.

**IIFEs simplified (2):** Holy Days and Hidden Manna still need IIFEs (HD for type dispatch + boundary vars, HM for `goHomeFromHM` closure), but their entry lookup lines are removed.

**`_navToChapter`:** shared handler extracted from 4 identical inline closures in WtlbEntryView render blocks.

**`getScrollKey` COLLECTIONS dispatch:** replaced 4 lines of hardcoded screen-string checks with `COL_BY_LETTER_SC.get(scr)` + kind-based prefix derivation. Maps `kind` to scroll-key prefix: `letter` → `letter-`, `wtlb` → `wtlb-`, `blessed` → `blessed-`, `holy-days` → `holyday-`.

**Reading-dot exclude list:** replaced 21-item hardcoded array with `LETTER_SCREEN_SET.has(screen)` + 6-item short array.

### 18.15 Global accessor helpers

**typeof guard elimination:** All remaining `typeof X !== 'undefined'` guards for globals covered by COLLECTIONS (`WTLB_ONE`, `WTLB_TWO`, `THE_BLESSED`, `HOLY_DAYS`) replaced with `colLetterArr(COL_BY_KEY.get(volKey))` which has typeof safety built in.

**Result:** Zero raw `typeof WTLB_*`, `typeof THE_BLESSED`, `typeof HOLY_DAYS`, `typeof BIBLE_STUDIES`, or `window.MATTHEW` references remain outside the helper definitions themselves.

### 18.17 boundaryConfig + READING_CHAIN

The biggest remaining duplication after section 18.16 was the prev/next boundary configs in render blocks. Each of the 14 letter-shaped collections had ~6-12 lines computing:
1. Which adjacent collection is "previous" / "next" in the reading chain
2. What title to display on the boundary card
3. Conditional skip-when-empty logic (Blessed → Flock falls back when Blessed has no entries)
4. Cross-family label switching

**Module-scope additions:**
```js
const _BOUNDARY_SHORT = { flock: 'Little Flock', holydays: 'Holy Days', wtlb1: 'Part One', wtlb2: 'Part Two' };
const _BOUNDARY_SHORT_OUTSIDE = { wtlb1: 'Words To Live By', wtlb2: 'Words To Live By' };
COLLECTIONS.forEach(c => {
  c.short = _BOUNDARY_SHORT[c.volKey] || c.label;
  c.shortFromOutside = _BOUNDARY_SHORT_OUTSIDE[c.volKey] || null;
});

const READING_CHAIN = ['one','two','three','four','five','six','seven','rebuke','wtlb1','wtlb2','blessed','flock','timothy','holydays'];
```

**App-scope helper:**
```js
const boundaryConfig = (volKey, entry) => {
  const sourceCol = COL_BY_KEY.get(volKey);
  // Walk back through chain skipping empties → prev boundary
  // Walk forward through chain skipping empties → next boundary
  // Special: V1.prev = Revelation; HolyDays.next = Garden
  return { prevBoundary, onPrevBoundary, nextBoundary, onNextBoundary };
};
```

**Render block call site (was ~6-12 lines per block, now 1):**
```js
React.createElement(LetterView, Object.assign({}, sharedViewProps, colReadNavProps('three', true), boundaryConfig('three', letterV3), {
  letter: letterV3, volumeLabel: "Volume Three" }))
```

**Verified live in browser** — 14 boundary transitions tested via direct state injection (V1 preface → Revelation 22 (special endpoint), V1 last → V2 first, V2 last → V3 first, V3 first → V2 last, V3 last → V4 first, V6 last → V7 preface, V7 last → Rebuke preface, Rebuke last → WTLB1 first, WTLB1 first → Rebuke last, WTLB2 last → Blessed first, Blessed last → Flock preface, Flock preface → Blessed last, Timothy preface → Flock last, HolyDays last → "A Return to the Garden").

### 18.18 Inline link icons + underline descender fix

**Inline link icons:** Previously, when a passage in a letter/WTLB block contained one or more cross-reference links, a single chain icon appeared at the END of the entire paragraph. This was confusing — users couldn't tell WHICH text was linked.

Fix: replaced per-paragraph icon with per-range icons via DOM injection. New module-scope `applyDOMLinks()` walks every `[data-hl-key][data-hl-dom]` container, looks up links via `LinkStore.getForKeyPrefix(blockKey)`, parses each endpoint's `:start-end` suffix, and injects an inline `<span class="inline-link-icon">` at exactly the end-character position of each linked range. Pattern mirrors `applyDOMHighlights()`.

**Useful runtime gotcha:** RAF (`requestAnimationFrame`) intermittently failed to fire the apply-DOM-effects callback in this preview environment; switched to `setTimeout(0)` for reliability:
```js
useEffect(() => {
  const t = setTimeout(() => { applyDOMHighlights(); applyDOMLinks(); }, 0);
  return () => clearTimeout(t);
}, [hlTick, screen, letterId]);
```

**Underline descender fix:** Underline-style highlights were visually skipping through letters with descenders (y, g, p, q, j). Two-line CSS fix at `.hl-underline`:
```css
text-underline-offset: 3px;        /* was 2px — push line below baseline */
text-decoration-skip-ink: none;    /* don't auto-skip through descenders */
```

### 18.16 ErrorBoundary

Class component wrapping `<App>` at the root render call. Catches unhandled render errors (from malformed data, missing globals, etc.) and shows a "Something went wrong" screen with the error message and a "Reload App" button — instead of the previous behavior of a blank white/black screen.

```js
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(err) { return { error: err }; }
  render() { /* gold-themed error UI with reload button */ }
}
// root.render(createElement(ErrorBoundary, null, createElement(App, null)));
```

Uses the app's gold color scheme (`#e0c97f`) so the error screen feels in-brand rather than jarring.

---

## Section 19 — Deep-dive audit & fixes (2026-05-09)

Comprehensive 5-agent parallel audit of the entire app: data formats, renderer code quality, CSS, navigation/state, and cross-cutting concerns. Found 48 issues across 5 severity tiers.

### 19.1 Bugs fixed (items 1-5)

| # | Bug | Fix |
|---|---|---|
| 1 | `.link-sidebar-overlay` referenced `selSheetBackdropIn` but keyframes are named `selectSheetBackdropIn` — fade-in animation was silently broken | Changed animation name to `selectSheetBackdropIn` |
| 2 | Garden view used `var(--font-cinzel)` and `var(--font-garamond)` which were never defined in `:root` — garden elements got browser default font instead of Cinzel/EB Garamond | Added `--font-cinzel` and `--font-garamond` to `:root` CSS variables |
| 3 | `wtlb-one-entry`, `wtlb-two-entry`, `blessed-entry`, `holy-days-entry` screens had no startup validation — app could reload to blank screen if `vot-state` saved one of these with stale `letterId`. Also: `garden-view` with null `gardenPage` was unvalidated | Extracted `_validateTabState()` function, applied to both legacy single-tab state AND each tab in multi-tab `saved.tabs[]` array |
| 4 | `WtlbEntryView` had its own `wtlb-scroll-${id}` localStorage scroll system racing with the App-level `tab.scrollPositions` system | Removed WtlbEntryView's independent scroll persistence entirely |
| 5 | `navigateToLink` (LinkSidebar card tap) bypassed `fromLetterStack` — navigating via cross-reference link produced no back-pill, Android back went to volume index instead of source letter | Refactored `navigateToLink` to use a ref-based deferred pattern: stable `useCallback` shell reads `_navToLinkRef.current` |

### 19.2 Architectural improvement: _validateTabState

The startup validation was previously inline in `saved = useMemo(...)` and only ran on the legacy single-tab `s` object. Multi-tab users could have invalid tab states that bypassed validation entirely.

New `_validateTabState(s)` function runs on both `s` (legacy) and each `s.tabs[i]` (multi-tab). Covers all 44 screen states.

### 19.3 Full audit findings inventory (items 6-48)

**Fixed (2026-05-09, second pass):**

| # | Issue | Fix |
|---|---|---|
| 8 | Two independent OT book-set definitions | `bookCategory()` now falls back to `OT_BOOK_IDS` (derived from `BIBLE_BOOK_LIST`) when available; inline Set kept as early-load fallback |
| 9 | `bookCategory()` rebuilt Set on every call | Hoisted `_OT_BOOKS_INLINE` to module scope |
| 10 | `tabField()` created new setter references every render | Cached setters via `_tabSetters` ref + `_uatRef` for stable identity |
| 11 | `useEffect` without dependency array (`__onDwellCommit`) | Added `[commitDwellNow]` dependency |
| 12 | `__closeSheet` stacking fragile in 3 components | ChapterView, WtlbEntryView, LetterView all converted to save/restore pattern |
| 13 | `navOrigin` missing `studyId`/`studyChapterId` | Added both fields to goSettings/goHistory capture and goNavOrigin restore |
| 15 | `__onReadingComplete` duplicated in 4 views | Extracted `useMarkAsRead(enabled, callback)` hook; 4 call sites replaced |
| 18 | Dead code `matthewTile = null` + 4 render sites | Removed variable and all 4 createElement wrappers in ScripturesHome |
| 19 | `findBook()` name collision (module-scope vs describeTab local) | Renamed local lambda to `resolveBook` in describeTab |
| 21 | Unused search exports (SYNONYM_MAP, SYNONYM_GROUPS, stemWord, phoneticKey) | Removed from search-data.js exports |
| 22 | `parseInt` without radix | Added `, 10` to all 11 occurrences across parseRefStr, buildSourceEndpoint, findEntryContext, parseRefRanges, renderLine |
| 23 | Silent empty `catch` in CachedStore._save | Added `console.warn('localStorage write failed for', storageKey, e)` |
| 24 | Duplicate `.section-block`/`.section-heading` CSS rules | Removed first set; kept canonical set in Bible reader section |
| 25 | Empty CSS rule blocks | Commented out `.letter-list-item`, `.letter-body`, `.search-screen` |
| 26 | Unused `@keyframes` | Removed `fadeUp`, `fadeIn`, `homeHeroIn`, `homeOrnIn` (confirmed zero CSS/JS references) |
| 27 | Unused CSS variables `--bg4`, `--study-bg` | Removed from both `:root` and `body.light` |
| 28 | `--gold-border-faint` referenced but never defined | Simplified to `var(--gold-border)` |
| 30 | Raw hex colors | Defined `--link-blue` (#6cb4dc dark / #4a90b8 light) and `--accent-pink` (#f48fb1 dark / #c2185b light) CSS variables; replaced 7 hex usages. Also replaced 3× `#e6dece` → `var(--bg3)` and 1× `#ede7d8` → `var(--bg2)` in body.light rules |
| 40 | `fromLetterStack` unbounded growth | Added 50-entry cap in `pushFromLetter` |

**Reviewed, deferred with rationale:**

| # | Issue | Rationale for deferring |
|---|---|---|
| 6 | `LETTERS` naming in volume-two.js | COLLECTIONS registry handles via `globalName: 'LETTERS'`. Rename touches data file + all references — large mechanical change, no functional bug |
| 7 | `nextLetterExternal` unique field | Working correctly. 3 references all properly conditional |
| 14 | InlineNotes/StudyPanels ~90% identical | Different CSS class prefixes + StudyPanels has group wrappers with titles |
| 16 | Bottom-nav card duplication | Differ in data shape (entry.id vs chapter.num, boundary label variants) |
| 17 | Scripture sheet duplication | 98% similar but verse lookup strategy differs (pre-computed vs IIFE) |
| 20 | Stale Unicode superscript stripping | Harmless defensive code. Guards against data regressions |
| 29 | ~50 distinct font-size values | Informational. Consolidation = large CSS refactor with visual regression risk |
| 31 | `transition: all` on 30 elements | Changing to explicit properties risks visual regressions |
| 32 | z-index gaps (600→8000) | Intentional separation between content layers and overlay layers |
| 33 | `!important` flags (~34 declarations) | Each has legitimate specificity reason. The 4 stripping rules on `.hl-note:not(.is-active)` are the best candidates for future cleanup via `:where()` or `@layer` |
| 34 | Quoting style split (V2 unquoted vs JSON-quoted) | Cosmetic. No functional impact |
| 35 | Trailing commas in bible-lsv.js / bible-ylt.js | Valid JS. 4.7MB files each. Cosmetic only |
| 36 | Minified vs pretty-printed | Informational |
| 37 | Missing videoMusicUrl in some collections | Data completeness issue. Some letters genuinely lack video music URLs on the live site |
| 38 | `seeAlso` used exactly once | Informational. Working correctly |
| 39 | `metaAddendum` two linking patterns | Both patterns (`metaAddendumLink` + `metaAddendumInternal`) serve different purposes. Working correctly |
| 41 | No focus traps on modals/sheets | Accessibility improvement. Complex to implement across all modal/sheet components |
| 42 | Limited keyboard navigation | Accessibility improvement. Complex |
| 43 | Three `setInterval` polls for scroll container | Polls wait for `__scrollEl` global (set by React ref callback). Polls are cheap (300ms, single ref comparison) |
| 44 | `-webkit-overflow-scrolling: touch` deprecated | Harmless. Removing could break momentum scrolling on older iOS WebViews |
| 45 | React 18.2.0 one minor behind | Upgrade carries risk for zero functional gain in this app |
| 46 | Hidden Manna not in search token map | Intentional by design — Hidden Manna is not publicly indexed |
| 47 | 17 `window.*` globals | These are the React↔imperative bridge for Android WebView back handler, scroll container, and inter-component communication |
| 48 | Magic timeout values | Informational. Named constants would help readability but change no behavior |

### 19.4 Key architectural insights from the audit

**Two search engines are intentional:** `searchNavIndex()` (alias-based, ~2000 items) is for destination lookup in LinkPicker. `VotSearch` (FlexSearch, ~200K+ segments) is for content search in SearchScreen. Different UX problems, different engines. Do NOT merge.

**`navigateToLink` vs `openInAppLetter`:** Both navigate to letters, but from different UX flows. `openInAppLetter` handles footnote tap-throughs (knows the source letter title for back-pill label). `navigateToLink` handles cross-reference link card taps (source may be Bible, study, or letter — no guaranteed source title). Both now push onto `fromLetterStack`.

**Event listener cleanup is solid** — all addEventListener/removeEventListener pairs are properly balanced. No memory leaks from event listeners.

**Accessibility is reasonable** — proper `aria-label` usage, semantic `<button>` elements, good color contrast (10.5:1 dark, 5.2:1 light). Main gaps: no focus traps on modals, limited keyboard navigation beyond browser defaults.

---

## Section 6 — Critical rendering paths

### 6.1 Footnote tap behavior

- `Segments` component (`src/ui/components/Segments.js`): inline `fn` segment renders gold superscript bubble (`fn-ref` class).
- Tapping → `FootnoteSheet` (`src/ui/components/FootnoteSheet.js`) bottom sheet, three branches:
  - `fn.type === "scripture"` → renders `fn.ref` + NKJV verse text (resolved from per-letter `nkjv[fn.ref]`)
  - `fn.link` → renders note text + `InAppLinkButton` (cross-volume tap-through)
  - `fn.url` → external `<a class="fn-link">`
  - Plain text fallback
- `seeAlso` field on a scripture footnote adds an "Also see" cross-link.
- Bottom-of-page `FootnoteListSection` mirrors the same branches with `ExpandableVerse` for long quotes.
- Day 2 enhancements landed: silent verse-blank fallback, fn.link+fn.url coexistence, prev/next nav inside the sheet ("Footnote N of M" + circular ‹/› buttons), `.fn-ref.active` visible on touch.

### 6.2 NKJV scripture text resolution

- Primary: per-letter `nkjv` dict on the letter object (`nkjv?.[fn.ref]`)
- WTLB fallback: per-entry `entry.scriptures` first, then global `WTLB_SCRIPTURES` (from `wtlb-scriptures.js`)
- Fallback for Bible chapters: `lookupVersesFromBooks(ref)` walks `ALL_BOOKS` to find verse text
- **PRINCIPLE per user**: footnote NKJV text should be **hardcoded into the letter's `nkjv` dict**. Only translation-tagged refs (e.g. "Psalm 113:7 (ASV)") should depart from NKJV. **No lookup scripts.**

### 6.3 Verse-number gold "inlay" (`<sup class="verse-sup">`)

- Created in `VerseWithNumbers` (`src/ui/components/VerseWithNumbers.js`).
- ✅ Multi-verse path (`splitIntoVerses` succeeds): emits `<sup class="verse-sup">N</sup>` followed by text
- ⚠️ Single-verse fallback: just emits `<span>{cleaned}</span>` — no gold inlay
- ⚠️ Strategy 1 fallback (sentence-boundary split): never wraps superscripts in gold

### 6.4 Cross-letter navigation

- `prevLetter` / `nextLetter` (Volumes) — read by LetterView (sticky arrows + bottom cards)
- `prevEntry` / `nextEntry` (WTLB / Holy Days) — read by WtlbEntryView
- `metaAddendum` — three branches: `metaAddendumLink` / `metaAddendumInternal` / `metaAddendumUrl`
- `relatedTopics` — links to answersonlygodcangive.com or in-app
- `addendum` "Also Read" card
- All tap-through must go through `openInAppLetter` so the back-pill is wired

### 6.5 Audio/video links

- `audioUrl` → "♪ Audio Recording"
- `soundcloudUrl` → "♪ Listen on SoundCloud"
- `videos[]` → ▶ each label
- `videoVoiceUrl` → ▶ {videoVoiceLabel || "Video (with voice over)"}
- `videoMusicUrl` → ▶ "Video (excerpts set to music)"
- Always-shown YouTube channel link

### 6.6 BUG TAXONOMY — data-corruption patterns (D1–D10)

The user's first batch of screenshots revealed these *categories* of data corruption. **The fix is in the data, not the renderer** (per user: "fix the foundational data so that isn't even a thing anymore"). All historical instances have been fixed (see HISTORY §14); these patterns remain documented because they CAN recur when adding new content. Agents adding or auditing data files must look for and repair these patterns.

| # | Pattern | Visible symptom | Root cause | Repair |
|---|---|---|---|---|
| **D1** | Ref string contains the entire verse text | Footnote sheet shows the full verse twice — once in the gold "ref" label header, once as italic body | `"ref": "Book X:Y NKJV (corrected): 13 ...verse text..."` with the same long key in `nkjv` dict | Strip ref to just the citation; put verse text only in the `nkjv` dict value |
| **D2** | Verse numbers render in white italic, not gold sup | "9. 10. 11. 12. 13." appear as plain inline body text (cream italic) | Source `nkjv` value uses unusual prefix or has bracketed editorial note, so Strategy 0 marker regex `(?:^|(?<=\s))(N)\.\s+` fails → falls through to Strategy 1 sentence split which never wraps in `<sup>` | Reformat the nkjv value to clean `"9. text 10. text..."` form (decimal dot, single space, no editorial brackets between markers) |
| **D3** | Defunct `[N]` rendering as plain bracketed body text | "I AM COME [1] - I have come..." with `[1]` in regular cream | Source segment is `{ "t": "text", "v": "I AM COME [1] - ..." }` — bracket markers were never converted into `{ "t": "fn", "v": "1" }` segments | Split the text segment, insert `{ "t": "fn", "v": "N" }` segment, ensure preceding/following text has correct spacing |
| **D4** | Translation-tagged ref shows label only, no verse text | Footnote header says "John 14:6 (CJB)" with empty body | `"ref": "John 14:6 (CJB)"` exists in `footnotes` but the `nkjv` dict has key `"John 14:6"` (no tag), or has no key at all | Add `nkjv` entry keyed exactly as `"John 14:6 (CJB)"` with the CJB translation text. **Tagged refs MUST use that translation's text**, not NKJV |
| **D5** | Doubled verse markers in scripture text | `²⁰20. ²¹"I do not pray... 22. ²²And the glory..."` — both Unicode superscripts AND text `N. ` markers | Source nkjv value was concatenated from two formats (bolls.life Unicode + a manual fix that added `N. `) | Use ONE format: `"13. text 14. text 15. text"` (decimal dot, no Unicode supers). Strip all Unicode `⁰-⁹` from nkjv values |
| **D6** | Doubled superscript without text duplication | `³² text. ³³ text. ³³ text.` — same verse number rendered twice in superscript | Source nkjv value has a verse split into multiple parts each prefixed with the same superscript | Merge each verse's parts into one segment so each verse number appears once |
| **D7** | Ref/cite parser glitch | Eyebrow shows "SCRIPTURE REFERENCE · 19:12 1" / Title shows "Corinthians 7:32-35" (the leading "1 " was eaten) | A `{{ref:1 Corinthians 7:32-35}}` got chunked at "1 " somewhere upstream; the data may have a stray leading "1 " or the ref dict key is wrong | Verify ref keys are EXACT match between footnotes' `ref` and the `nkjv` dict key; use `"1 Corinthians 7:32-35"` consistently |
| **D8** | Glued text near refs | "Shouldeverruntogether[Matt 4:4]" — no space between body and ref | WTLB / Blessed source text is `"...together{{ref:Matt 4:4}}..."` with no space before `{{ref:` | Add a single space before `{{ref:` and `{{nav:` tokens during the sweep |
| **D9** | Compound refs not split | `"Isaiah 40:13; Romans 11:34"` shown as one long unsplit chunk | Compound refs should be pipe-separated with em-dash: `"Isaiah 40:13 — verse text \| Romans 11:34 — verse text"` | Reformat compound nkjv values; if multiple separate footnotes are wanted, split into separate `"1": {ref:...}, "2": {ref:...}` entries |
| **D10** | Mixed footnote affordances | Same footnote shows BOTH a numbered gold bubble AND a plain inline link | Source data has the same ref both as a `{type:"note", link:..., url:...}` and as a numbered scripture footnote | Pick ONE: scripture footnote (bubble) OR cross-reference note (bubble that opens sheet with `seeAlso` link). Never both for the same content |

### 6.7 Renderer guardrails (defensive only)

- Unicode-superscript strip in scripture rendering: `replace(/^[⁰¹²³⁴⁵⁶⁷⁸⁹]+\s*/, "")`. Harmless defense; rely on data being clean.
- `Segments` collision guard injects a leading space for Volumes (Format A). WTLB/Blessed (Format B) has no equivalent; fix at data level.
- The `ann.style` defensive fallback guards were removed in P5f (one-shot annotation migration makes them unreachable).

---

## CSS variables reference

- `--gold`, `--gold-bright`, `--gold-dim`, `--gold-border`, `--gold-faint`, `--gold-glow`
- `--cream-dim`, `--bg`, `--bg3`
- `--tap-ref`, `--tap-ref-sub`, `--tap-ref-active` (inline scripture ref colors)
- `--link-blue` (#6cb4dc dark / #4a90b8 light)
- `--accent-pink` (#f48fb1 dark / #c2185b light)
- `--font-cinzel`, `--font-garamond`
- `--inset-top` (injected by Android `MainActivity.injectInsets()`)

Verse numbers MUST be `var(--gold)`. Body text is `--cream-dim`.
