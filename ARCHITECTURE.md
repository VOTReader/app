# ARCHITECTURE.md — System reference

Deep dives into annotation, navigation, state management, and rendering. Read when working on those systems. For the current briefing, see CLAUDE.md. For commit history, see HISTORY.md.

---

## Current-systems addendum (2026-08-10 refresh — [18], audio added)

The sections below this one predate several landed systems. This addendum is the CURRENT index of them; each system's full contract lives in its module header (the file IS the deep doc — read it before editing).

- **Search = MiniSearch only** (`src/search/`, bundle-e, `window.VotSearchMini`): BM25 + fuzzy + synonyms + warm IDB cache; Classic/FlexSearch retired 2026-07-02. Query parse (refs/commands) in `query-parse.js`; golden-quality suite `src/search/golden.test.js`. Result-side filter chips + canonical verse sort are CLIENT views in `utils/search.js` ([8]).
- **8 bundles**: a (react + boot data), a-bible / a-matthew / a-vot (lazy corpora), b (stores/hooks/bridge), c (renderer), d (screens/sheets/utils), e (lazy Settings/Search/Garden). `--target=chrome108` mandatory (Permanent Rule 6). Entry files (`_entry-b/-d` etc.) Object.assign every export onto window — bare-name globals + the 460-entry generated eslint/tsc globals.
- **Backup v3 streaming container** (`VOTBACK1`, `utils/backup-container.js` + `utils/backup-android.js` + Kotlin `StorageManager`): manifest frame + per-media frames + trailing manifest CRC-32; GB-scale bounded memory on both platforms. Read-only **Verify a Backup** in Settings runs the whole read path without applying ([15]).
- **Modal registry + focus traps** (`hooks/use-modal-registry.js`, `hooks/use-focus-trap.js`): Escape is dispatched ONLY by the app-level W1.5(c) dispatcher via the registry's z-ordered stack; Tab is contained per-dialog by useFocusTrap (topmost-trap-wins stack, focus restore on close) ([13]).
- **Real-inert pager peeks** (swipe navigation): the peek IS the destination screen rendered inert (`.pager-peek-*`, ViewPager2-style finger-follow); commit is a flushSync single task. Peeks must gate on entry SHAPE, not resolution (the Holy Days mixed-format lesson).
- **Tab thumbnails** (`hooks/use-thumbnails.js`): dual-theme clone renders (html2canvas via the bridge) captured ONLY after nav / overview-open heal / resize — the scroll-stop capture path is RETIRED (on-device profiling; do not re-add) and non-urgent captures wait out the interaction calm gate. Tabs also carry `customTitle` + `pinned` ([7]; pinned survive bulk closes).
- **Android frame pacing**: MainActivity votes the WebView at panel peak refresh (View + window votes, API 35+); Battery Saver's system 60 Hz cap outranks them by design. `backdrop-filter` is banned on chrome that overlays live scrolling content (alpha-bumped instead).
- **Theme**: dark-first `:root` tokens, `body.light` full swap, `body.amoled` True-Black surface modifier on dark ([10], `settings.trueBlack`, boot pre-paint applies all classes).
- **Auto-scroll reading transport** (`hooks/use-autoscroll.js` + `ui/components/AutoScrollControl.jsx`): lines/min over a MEASURED line height, the scrollTop lease, `.reading-end` reading-zone stop, dwell + auto-advance via the pager's own boundary policy. Full map in **§20**.
- **Reading-measurement engine** (2026-08-03: `utils/word-count.js` + `hooks/use-read-tracker.js` + `stores/reading-stats-store.js`): ONE word-count definition shared by app + the corpus baseline gate; the geometry-sweep read detector (NOT IntersectionObserver — deliberate, see **§21**); count-valued readItems; ReadingStatsStore ledger (IDB v8) + per-item frontiers (recording-only since 2026-08-04 — **scroll-position resume owns reopening**; the frontier jump was retired). Full map in **§21**.
- **One shared top-nav**: `ui/components/LibraryNav.jsx` renders every screen's nav (2026-07-30; SearchScreen + GardenView are the two documented exceptions). Full map, and its selector/measurement couplings, in **§18.10b**.
- **Milestones = ONE engine** (2026-08-10 owner decision): `utils/achievements.js` owns every threshold. `MilestonesScreen` renders `buildAchievements(...).categories` (the full ~84); My Progress's compact strip renders `.featured`, the ten items that used to be a second table in `reading-stats-store` — the SAME item objects, so the two surfaces cannot disagree and featuring adds nothing to any total. The store keeps only the persisted once-ever unlock ledger for the toast, driven from `FEATURED_UNLOCK_DEFS` (legacy key space intact, so no saved unlock is invalidated). `achievements.js` is pure and rides bundles b + d, the arrangement `utils/audio-track.js` already has.
- **Audio subsystem** (2026-08-05 → 08-10: `utils/audio-player.js` + `utils/audio-track.js` + two generated manifests + `AudioPositionsStore`/`AudioLibraryStore` + the native card): 729 letter recordings and three per-chapter Bible editions (1,189 chapters each) stream from immutable GitHub Release assets behind ONE frozen prefix list; forward-only queues, book-scoped Bible queues, durable per-recording resume, listening that earns read credit. Full map in **§23**.

---

## Tab state machine

`index.html` was a pre-compiled (Babel-output `React.createElement`) single-file React app. Today `function App()` lives in `app/src/main/assets/src/app.jsx` (extracted Q2.7-1, converted to JSX Q2.7-2). Screen state is held per-tab in a tab state machine.

- **App()** at `app/src/main/assets/src/app.jsx` — **~798 lines**, held at **≤800 by the P11 canary gate** (`tools/check-app-size.js`), after the P6–P11 hook-extraction phases. Composes **~33 extracted hooks** (`src/hooks/`) + the render tree + nav-helper glue. (CQ1: counts drift — verify against the file, don't trust the number.)
- **Per-tab fields** via `tabField('screen')` — each tab maintains independent `screen`, `letterId`, `bookId`, `chapterNum`, `studyId`, `studyChapterId`, scroll positions, etc.
- **`tabs` + `activeTabIdx`** arrays — multi-tab in-app browsing.
- **`fromLetterStack`** per tab — drives **back-pill** navigation. Capped at 50 entries (was unbounded — caught in audit item 40).
- **Source screen restore** in `handleAndroidBack` — pops `fromLetterStack` and restores the popped entry's captured position.

### Back-pill (System 1 — the canonical one)

Owned by `hooks/use-from-letter-stack.js`. **That module header is the contract; this is the map.** Current as of 2026-07-30/31 — the pill now renders on every reading/destination screen EXCEPT History, which is the owner's deliberate exception.

- CSS class: `.back-hint-pill`, inside a `position: sticky` `.back-hint-row`. **One pill maximum per screen** — two sticky rows double-cover the content.
- **SEVEN tracked position fields**, both in a pushed entry's `source*` capture and in its `destSnapshot`: `screen`, `bookId`, `chapterNum`, `letterId`, `studyId`, `studyChapterId`, and (added 07-30) **`journalEntryId`**. `journalEntryId` is App()-local `useState`, not a tabField, but is threaded identically.
- **`destSnapshot`** records the expected destination at PUSH time. The pill renders only while every non-nullish snapshot field still matches current state, and a prune effect pops a stale top entry. `!= null` (not `=== undefined`) is the don't-care test — push paths explicitly null out unused fields, and old persisted tabs deserialize without `journalEntryId` at all; both must mean "don't care".
- **`backHint` vs `backActive` are NOT the same thing** (07-30 split). An entry pushed with **`silent: true`** suppresses the PILL but stays a live back target — History pushes these, because the owner does not want a pill on links tapped from History, but hardware back must still return there. So: `backHint` = the `{title, volumeLabel}` the pill renders (null for silent entries), `backActive` = "a live top entry exists, silent or not". **Hardware back keys off `backActive`. The pill keys off `backHint`.** Wiring one to the other reintroduces the bug.
- `tapThroughBack()` pops the top and restores its captured position; it also clears the `pendingHighlight` nav-handoff slot.
- **`pushFromLetter` is the only writer.** `openInAppLetter` / `goToLetterFromMatthew` / the deferred `_navToLinkRef.current` body all call it. Legacy pushes without a `destSnapshot` keep the multi-level letter→letter behavior.
- **journal-viewer precedence** (`JournalViewerScreen`): the private journal→journal stack wins; only if it is empty does the cross-screen `backHint` render. The pill calls `tapThroughBack` **directly**, not `window.handleAndroidBack` — the hardware-back handler's journal branch walks the same precedence in the same order (see `hooks/use-android-back.js`), and routing the pill through it would mean re-deriving the decision twice.

### The three pill systems (all live — know which one you are in)

1. **`fromLetterStack` / `backHint`** — THE canonical cross-screen back pill, above. Any new tap-through goes here.
2. **The journal→journal private stack** (`__journalBackStack`, JournalViewerScreen) — entry-to-entry navigation WITHIN the journal. A satellite: it never leaves the journal, and it takes precedence over System 1 on that one screen.
3. **`notesReturnCtx`** (`utils/nav-handoff.js`, set by NotesIndexScreen / screen-routes, consumed by NotesIndexScreen on mount) — a one-shot handoff that restores the notes hub's `{tab, drilledNbId}` and its own `backPill` label when you come back. Also a satellite: it restores UI STATE, it is not a nav stack.

Systems 2 and 3 are deliberate and stay. Do not "unify" them into System 1 — but do not add a fourth.

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

Tapping a row navigates to the source chapter via `navigateToLink(…)` and stashes the groupId for the destination to consume; `use-dom-annotation-sync` takes it and opens the NoteSheet on arrival, once the marks have rendered. **`window.__pendingOpenNote` is STALE (corrected 07-31)** — the stash is a `utils/nav-handoff.js` slot named `pendingOpenNote`, alongside `notesReturnCtx` / `pendingHighlight` / `pendingScrollHlKey` / `pendingSearchQuery`; the ad-hoc `window.__*` globals were consolidated into that one registry (its module header documents every slot's writer/reader/clearer — read it before adding one).

**Per-segment row taps (07-30).** A note can span several chapters, and the row used to be one tap target that navigated to the first key only. `noteSourceSegments(note)` (in `utils/note-source.js`) now returns one `{label, nav}` per chapter group, and `NoteRow` renders each as its own tap target. Both it and `noteSourceLabel` are built on the same `_chapterGroups()` grouping, so **a row's label and its tap targets can never drift apart**. Each segment's `nav` carries `verse` and, when the group spans more than one verse, **`verseEnd`** — so arriving flashes the whole range rather than the first verse.

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

**1. Tap-through back-pill on Bible chapter destinations.** `BibleChapterView` and `ChapterView` now accept `backHint` and `onTapThroughBack` props. New `tapThroughBack()` helper in App pops the top of `fromLetterStack` (via `fromLetterRef.current` — `tabField` setters' updater functions run async) and restores state. *(Since 07-30 this is no longer a Bible/Matthew special case — the pill renders on every destination screen except History, and `tapThroughBack` now lives in `useFromLetterStack`. See "Back-pill (System 1)" at the top of this file.)*

**2. Notebook management from the Notes index.** ~~`NotebookManagerSheet`~~ **— STALE, corrected 07-31: no such component exists.** Notebook CRUD lives inline in `NotesIndexScreen` instead: the Notebooks tab's card grid carries the `+ New Notebook` inline form, and rename/delete are inline controls in the drilled-in header (see §17.17). `NotebookPickerSheet` is real and unchanged — checkbox rows toggling membership for one specific note.

### 17.17 Notes hub restructure — tabs + notebook cards + drilled view

The Notes hub is a tabbed two-screen layout:

**Notebooks tab** (default landing) shows a card grid:
- First card always: **Uncategorized** ("Default" eyebrow, dashed border).
- One card per user notebook (gold name, "Notebook" eyebrow, count).
- Last card: **+ New Notebook** (dashed, gold-dim) — tap → inline `[name input] [Cancel] [Create]` form.
- Tap any card → drills into that notebook's notes.

**Drilled-in view** *(header restructured 07-30 — the name used to share one row with the actions and got crushed at high `--font-scale`, and the hub's "My Notes" header stacked on top of it)*:
- **Two rows.** `.nb-drilled-titlerow` = `‹` back arrow + `h1.nb-drilled-title` (the notebook name) + `.nb-drilled-count`. `.nb-drilled-actions` sits on its own row below: **Share** (only when the notebook has notes) · **Rename** · **Color** · **Delete** — the last three are user-notebook-only, so Uncategorized shows Share alone. Rename mode swaps the whole action row for Save / Cancel. The hub's "My Notes" header is suppressed while drilled (`!drilledNbId`) — rendering both stacked two headers on top of each other. Action targets are **44px**, not the old 24px.
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

Fix: each entry pushed by `_navToLinkRef.current` records a **`destSnapshot`** — the expected destination, computed from the endpoint type BEFORE the state changes happen. **Seven fields since 07-30**: `{screen, bookId, chapterNum, letterId, studyId, studyChapterId, journalEntryId}`.

Two consumers:
1. **`backHint` computation** — when the top stack entry has a `destSnapshot`, the pill renders ONLY if every snapshot field matches the current state.
2. **Prune effect** — a useEffect that pops the entry if `destSnapshot` doesn't match the current state. Keeps the stack clean.

Legacy push paths (like `openInAppLetter` used by letter→letter footnote tap-throughs) don't set `destSnapshot`, so they keep the existing multi-level back behavior — only paths that opt in get single-shot semantics.

**Two corrections landed 07-30, both worth knowing before touching `_destMatches`:**

- **The nullish test is `!= null`, not `=== undefined`.** Push paths explicitly null out the fields they don't constrain, so a strict-undefined check treated an explicit `null` as a real constraint, compared it against live state, failed, and **silently pruned the pill in the primary cross-screen flow** (Notes index → Bible/Study → the expected "Back to My Notes"). Both `null` and `undefined` must mean "don't care" — which also covers old persisted tabs deserializing without `journalEntryId` at all.
- **The journal branch's snapshot used to contradict itself**, so a notes→journal pill was pruned on the very frame it arrived. Fixed alongside adding `journalEntryId` as the 7th field.

**`silent: true`** (History's push flag) is separate from `destSnapshot` and does NOT prune anything: it suppresses the pill while leaving the entry a live back target. See "Back-pill (System 1)" at the top of this file for the `backHint`/`backActive` split it forced.

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

**`splitCompoundRef(refStr)` (added 2026-07-30)** — THE shared splitter for compound references. `parseRefStr` handles ONE reference; a great many cites in the corpus are compounds, and before this they rendered as a single tap target that navigated to the first passage (or, for `the-blessed.js`'s `{{ref:}}` chips, to nothing at all — silent dead taps). Returns `{ref, index, parsed}[]`, where `ref` is a canonical self-contained string and `index` is the part's ordinal among the source's `;`/`,`-delimited chunks.

- Semicolon split, with **book carry-forward**: `"Daniel 9:27; 11:31; 12:11"` → 3 parts, segments 2..N inheriting `Daniel`.
- Comma expansion: `"Matthew 5:3-4, 7"` → 2 parts.
- **Chapter-qualified comma tails**: a tail inherits the book AND the chapter *unless it names its own* — `"Exodus 20:12, 21:17"` is two different chapters. Found by auditing all 23 compound cites in `matthew.js`, not guessed.
- Cross-chapter ranges (`"Revelation 21:1-22:5"`) navigate to the START.
- Dash normalization (Permanent Rule 1) runs FIRST, and is 1-char→1-char so chunk ordinals still line up with the raw string.
- Chunks that parse to nothing are dropped individually — the rest of the compound still works.

`index` is what lets a renderer rebuild the ORIGINAL string character-for-character (separators and all) while making each chunk its own tap target. **That is load-bearing, not cosmetic**: journal blocks are annotatable and highlight offsets walk that text, so a re-render that changed even one character would shift every annotation on the entry.

**`parseRefStr` was deliberately NOT changed to return an array.** Its single-object shape is a pinned contract (4 `toEqual` tests) and it is the search-ranking choke point — `nav-index.js` gives its hits a 1000-point boost. The split belongs at the callers, in ONE place, which is what `splitCompoundRef` is. Consumers: `GoToRefButton`, the journal `{{ref:}}` chips. `lookupVersesFromBooks` is untouched for the same reason.

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
  onInAppLink, backHint, hlTick, onLinkOpen, onBack, markAsReadEnabled
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

**Intentionally left inline (2 screens):** *(superseded 2026-07-30 — NavButtons gained a per-icon `hide` array, so these two screens now go through LibraryNav like everything else, passing `hide={['history']}` / `hide={['settings']}`.)*
- `HistoryScreen` renders settings + search + theme but NO history button
- `SettingsScreen` renders history + search + theme but NO settings button

### 18.10b LibraryNav — THE top-nav module (2026-07-30)

`ui/components/LibraryNav.jsx`. Before this, **19 hand-rolled nav implementations** across 54 routes; the back arrow was only enlarged on the ones that happened to spell the class list right. Two separate bugs came out of that, and both were structural rather than cosmetic:

1. **LetterView's `nav-volume`.** Its back button carried `nav-volume` alongside `nav-back-icon`. `.nav-volume` sat AFTER `.nav-back-icon` at equal specificity — in the main block AND again in the px chrome-pin block at the end of app.css — so it **lost the cascade** and shrank the arrow to 11.52px on 13 screens. `.nav-volume` is **deleted**, with a tombstone comment at app.css:549. Do not reintroduce it.
2. **`_idxNav` never adopted the icon back at all.** The 2026-07-14 icon-back change simply never reached the 14 index screens.

**Call convention: a plain FUNCTION returning a fragment** — `LibraryNav({…})`, never `<LibraryNav …/>`. Every call site and several test stubs depend on that, which also means **it must never hold hooks**.

**Options (all optional):** `onBack`, `backLabel` (destination NAME → title `"← X"` / aria `"Back to X"`), `backTitle` (legacy raw string; `backLabel` wins), `hideBack`, `showHome` (default true), `onHomeBefore`, `leftExtras` / `rightExtras`, `arrows` (`{onPrev, onNext, prevDisabled, nextDisabled, prevTitle, nextTitle, prevLabel, nextLabel}`), `reading`, `chapterBookmark` (`{hlKey, label}`), `hide` (`['settings'|'history'|'search'|'theme']`), plus the `onSettings`/`onHistory`/`onSearch`/`theme`/`onThemeChange` passthroughs.

**The two documented exceptions — both deliberate, both commented at their call site:**
- **SearchScreen** — the search input row REPLACES the whole right half of the nav (no Home, no icon cluster), and app.css:319 already exempts it via `:not(:has(~ .srch-input-row))`.
- **GardenView** — the one screen that bypasses `ScreenLayout` entirely for immersive `.garden-top-bar` chrome. Adopting the shared nav would be a rewrite, not a consolidation.

**LOAD-BEARING COUPLINGS — check every one of these before changing this module's markup.** They are all selector- or measurement-based, so none of them fails loudly:
- The back button keeps **BOTH** classes: `nav-home` (the right-cluster `margin-right: auto` anchor, app.css:318-319) and `nav-back-icon` (the 2.1rem glyph, app.css:544 + the px pin at the end of the file).
- **`HomeBtn`'s `title="Home"` is a selector**, not a tooltip — app.css:318 anchors the right cluster off `[title="Home"]`.
- **NavButtons' title strings** `"Settings"` / `"History"` / `"Search"` are what the Settings visibility toggles select on (`body.no-search` / `body.no-history` / `body:not(.history-in-nav)`, app.css:320-338). Renaming a title silently breaks a user setting.
- The **chrome-pin block** at the end of app.css restates `.nav-home` and `.nav-back-icon` sizes in **px** so nav chrome does not scale with `--font-scale`. Any new nav size must be restated there or it will grow with the text slider.
- **`top-nav` is in `SCREENSHOT_IGNORE_CLASSES`** (`utils/platform-bridge.js`) — html2canvas drops the whole nav from tab thumbnails. Anything moved INTO the nav disappears from thumbnails; anything moved OUT of it starts appearing in them.
- **`.top-nav`'s height is measured at runtime** by `ui/sheets/SelectionToolbar.jsx` (placement) and `hooks/use-thumbnails.js` (`navHeightDp` for the native crop). Changing the nav's height silently changes both.
- `ScreenLayout` appends `ResumeReadingNavBtn` + `TabsNavBtn` itself — **LibraryNav must never render either**, or every screen gets duplicates.

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
| `VotSearchMini` (MiniSearch, bundle-e `src/search/`) | SearchScreen | every verse/letter/entry/study segment | "Find verses about mercy" — BM25 + fuzzy full-text match |

These solve different UX problems: content search vs. destination lookup. Using the full-text engine for the nav picker would be over-engineering; using alias matching for content search would be inadequate. (Classic/FlexSearch retired 2026-07-02 — MiniSearch is THE content engine.)

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

## Section 20 — Auto-scroll reading transport

Landed 07-21/22, extended 07-30. Two modules, plus a settings block. **Read `hooks/use-autoscroll.js`'s header before touching any of it** — the model is argued there at length; this section is the map.

### 20.1 The transport (`hooks/use-autoscroll.js`)

**It is a TRANSPORT, not an animation.** It owns the reading container's `scrollTop` over time, competes with the user for that same property, and must yield instantly and losslessly. Both ways an autoscroller feels bad — it fights the finger, or it moves in visible steps — are controller problems, not CSS problems.

Structure mirrors `usePagerGesture`: a **pure controller factory** (`createAutoScroll`) driven by injected I/O (element accessor, frame source, clock, metrics, navigation), so it unit-tests with a manual clock and no DOM. `useAutoScroll` is the thin React wrapper that owns the listeners and the browser-side I/O only.

**THE SCROLLTOP LEASE.** Four writers touch this container's `scrollTop`: the user's finger, `use-scroll-memory`'s `startRestore` (up to 90 rAF attempts, flagged by `body.scroll-restoring`), the pager's swipe settle, and this controller. **At most one may write at a time.** Every pause rule is that one invariant applied to a different revoker — which is why the restore interlock, the pointer yield and the external-nav stop are the same mechanism rather than three special cases.

**Speed is stored in LINES per minute, never px/second.** The app has a continuous 80–160% text-size slider; a px/s speed would silently change reading pace by up to 2× when the reader resizes text. `measureLineHeight(el)` probes `[data-hl-key]` — the annotation engine's marker, carried by body text on all four reading screens — and `lineHeightOf(node)` resolves one node's px line height (with a font-size fallback, because `getComputedStyle` can return the keyword `normal`). Range `MIN_LPM 4` … `MAX_LPM 40`, default 16, via `clampLpm`.

**Motion model:** rAF + a float position accumulator written straight to `scrollTop` (`scrollTo({behavior:'smooth'})` is browser-owned and uninterruptible; `scrollBy()` on an interval quantizes and visibly steps). **Read-first, then write** — reading `scrollTop` back after writing is a forced sync layout 60×/s on the same thread that owns the scroll. `dt` is clamped (`MAX_DT`): a dropped frame must LOSE motion, never bank it. Constant velocity in the steady state; easing lives only in the ramps and the end brake.

**Drift absorb is NOT a pause signal.** Chrome's scroll anchoring rewrites `scrollTop` whenever content above the viewport reflows (lazy images, `content-visibility` resolving, note icons injecting). That is a legitimate external write to absorb, not user intent — conflating them would fire spurious pauses on exactly the screens carrying the most annotations. **Pointer events own pause; scroll deltas own resync only** (`DRIFT_PX` sits clear of device-pixel snapping, which is measurable at 1/DPR).

**End of page = the `.reading-end` sentinel, not `scrollHeight`.** The sentinel sits at the end of BODY text, before the footnote list, the ornament divider and the chain-nav cards — scrolling to `scrollHeight` would grind through a Format A letter's whole footnote apparatus before advancing. `computeEndTarget` rests it at `END_STOP_FRACTION` (2/3) down the viewport, because people read around the MIDDLE of the screen; clamped to the true scroll max, so a short page just bottoms out.

**Auto-advance reuses the pager's own neighbor descriptor**, so boundary policy is inherited rather than reimplemented: `peek('next') === null` → dead end; `desc.kind === 'boundary'` → cross-collection edge, do not auto-cross; `desc.kind === 'screen'` → advance. Navigation runs through `commitReadingNav` — the same atomic flushSync + annotation-apply contract the swipe commit uses — so the new page is painted WITH its highlights before the first frame of resumed motion. There is **no `skipRestore` plumbing**: after an advance the controller waits out `body.scroll-restoring` and resyncs from wherever scroll memory landed.

**Dwell + `rearmDwell()` (07-30).** `armDwell()` sets `advanceAt = dwellStartedAt + max(configured, remaining MIN_PAGE_MS)` — measured from **`dwellStartedAt`, not from now**, which is what makes a mid-countdown edit land on the deadline the new setting describes instead of double-counting time already sat. `rearmDwell()` is the entry point the pill's ± stepper drives (a no-op unless `state === 'enddwell'`); without it, `reachedEnd` had already baked the old value into a timer and the edit would silently apply only to the NEXT page. `clampEndDwell` (0–15s) lives in this module rather than with the provider that used to own it, so the pill can clamp its own stepper without importing its parent (a cycle).

**Runaway guards** (a phone in a pocket must not read the whole Bible): `MIN_PAGE_MS` (4s) floors time-on-page so a run of short WTLB entries cannot chain at timer speed; `MAX_CHAIN` (20) caps consecutive advances with zero user interaction, and any real interaction resets the chain.

States: `idle | running | paused | enddwell | ended | advancing`. Side effects on the active states: `body.autoscroll-running` and the native keep-screen-on flag (released back to the user's own `keepScreenOn` preference, never blindly to false).

### 20.2 The pill (`ui/components/AutoScrollControl.jsx`)

Rendered by `ScreenLayout` on reading screens only (`pager` is passed exclusively by the four reading screens) and **never inside an inert pager peek** — the inert branch returns first, so a peek can never portal a second control onto the live viewport. **Portaled to `<body>`**, because a `position: fixed` element inside `.pager-track` is displaced by the swipe-settle transform (same fix as ScriptureSheet / FootnoteSheet). `body.autoscroll-on` marks the app as carrying the pill so colliding bottom-centre chrome can stand down; distinct from `body.autoscroll-running`.

**Controls:** speed − / play-pause / + / (when auto-continue is on) a timer button that toggles the **dwell row**, plus a readout. During `enddwell` the whole row is replaced by ± around the live countdown plus Cancel — so the dwell row is suppressed then (`showDwellRow` requires `state !== 'enddwell'`), otherwise the ± would be duplicated along with their accessible names. Dwell step is 500ms, the same grain the Settings slider offers, so the two writers agree on which values exist. **Idle fade**: after ~3s of uninterrupted motion the pill drops to a whisper; any touch restores it.

**MEASURED words/min — `measureWordsPerLine(el)`, and the trap in it.** The Settings screen used to show `lpm × 9` as an estimated wpm. That guess is **deleted**. The pill now shows `lines/min × measured words-per-line`, and shows **nothing** when the page yields no measurement — a made-up rate is worse than none.

Counting the LINES is the subtle part, because `data-hl-key` is not always on the same kind of box:
- On the verse screens it lands on **inline spans**, where `getClientRects()` is one rect per visual line, and `height / line-height` is a line short (an inline's box spans font boxes, not full line boxes).
- On LetterView it is on the **`<p class="letter-para">` itself — a BLOCK**, whose `getClientRects()` is a single border box no matter how many lines it wraps to.

**The naive per-line map assumed the inline case and would have shipped ~2000 wpm on letters.** Taking `max(getClientRects().length, round(height / lineHeightOf(node)))` is exact in both regimes and needs no display sniffing. Two things must be skipped: the annotation engine also hangs `data-hl-key` on the note **icon** (zero words — drags the average down), and `.letter-para` carries `content-visibility: auto`, so a scrolled-past paragraph is **not laid out** and reports zero height while still returning all its text. **A zero-height box means "no measurement here", never "one line".**

**It forces synchronous layout, so it must never run on the frame path** (the 2026-07-28 responsiveness lesson). Once per page, in `requestIdleCallback` (timeout 1500, `setTimeout(0)` fallback) — which also keeps the forced layout clear of the post-advance scroll restore's own ~1.5s frame loop.

### 20.3 Settings keys

Read in `ui/components/ReadingChromeProvider.jsx`, which builds the `AutoScrollContext` value: `autoScroll` (master enable) · `autoScrollLpm` (speed, clamped by `clampLpm`) · `autoScrollNext` (auto-continue; also gates whether the dwell knob exists at all) · `autoScrollEndMs` (dwell, clamped by `clampEndDwell`) · `keepScreenOn` (the user's global preference the controller must restore to, not override). Config is app-wide and arrives via context; per-screen wiring (the scroll container ref, the pager) arrives as props.

---

## Section 21 — Reading-measurement engine (2026-08-03)

Three modules, three bundle homes; module headers are the deep docs (read them
before editing — this section is the map, not the contract):

- `utils/word-count.js` (bundle-d): `countItemWords` — the SINGLE definition of
  "how many words is this item" (Format A/B/C/Matthew; body text only; memoized).
  `tools/validate-schemas.js` imports the SAME shipped module for the word-count
  baseline gate (`tools/word-count-baseline.json`, per-item; `--update-wordcounts`
  regenerates), so app and gate cannot disagree. The gate exists to catch
  eaten/duplicated corpus content BETWEEN full faithfulness audits.
- `hooks/use-read-tracker.js` (bundle-b; called as a bare global from
  ScreenLayout on every screen): the detector.
  **READ ⇔ coverage ≥90% by words AND visibility-honest activeMs ≥
  clamp(words×100ms, 8s, 300s).** Segments are the `[data-hl-key]` blocks every
  reading view already stamps (the same attribute the annotation engine §17 and
  `measureWordsPerLine` trust); credit = 800ms continuous meaningful visibility.
  ┌─ WHY A GEOMETRY SWEEP, NOT IntersectionObserver ─────────────────────┐
  │ IO with practical thresholds structurally cannot credit a block      │
  │ taller than ~2 viewports (long poetry; ALL of Text Size 300%), and   │
  │ element-keyed IO state dies when a view re-renders content under the │
  │ same placeKey (the BibleChapterView headings toggle). The 2 Hz       │
  │ batched gBCR sweep + credit keyed by hl-key STRING fixes both.       │
  │ Do not "optimize" this back to IO.                                   │
  └──────────────────────────────────────────────────────────────────────┘
  Bridges: `__onReadingComplete` (arm flag + completion sink, once per
  placeKey visit) + `__readTrackerMeta` (frontier key) — see BRIDGES.md; the
  per-view inert guards keep peek clones from ever claiming either.
- `stores/reading-stats-store.js` (bundle-b): `vot-reading-stats`, **IDB v8**.
  Ledger (words/time/completions/rereads/wordsByDay) + wpm samples (median;
  sampled at VISIT END, never the completion instant — that instant is pinned
  to the 600wpm floor by construction) + per-item frontiers (credited segment
  indices; LRU 50; cleared on completion). **Frontiers are RECORDING-ONLY as
  of 2026-08-04**: the frontier jump that used to move the viewport to the
  first unread paragraph was retired by owner call — `use-scroll-memory`'s
  saved position owns reopening, full stop. The data still accumulates for the
  reading record and the held skim indicator (BACKLOG [21]). ★ Adding ANY new
  CachedStore requires
  `IDBAdapter.STORE_NAMES` + a DB version bump, or it hydrates `'degraded'`
  and queues writes silently forever — with a 100%-green unit suite. ★
- readItems is COUNT-valued (`useMarkAsRead.js`; legacy `true` reads as 1, no
  migration). Detector completions increment + feed the ledger + record the
  reading DAY (streak coherence); manual toggles set the first mark only.
- Consumers: MyProgress (Words Read / Reading Pace / Re-reads / 14-day bars),
  `~N min` index chips, count-aware `✓ ×N` read marks.
- **Verification rule:** jsdom has no layout and a non-compositing page
  (hidden tab, undisplayed Browser pane) delivers no geometry/IO — the ONLY
  faithful end-to-end check is `npm run e2e:read`
  (`tools/e2e-read-detector.mjs`, headless compositing Chromium). This drove
  out the IDB-registration P0 the unit suite could not see.
- Deliberately absent: skim indicator (owner-HELD, BACKLOG [21]);
  TTS/milestones/year-in-review/etc. (BACKLOG [22]–[26]).

---

## Section 22 — Read-along (audio-synced sentence wash)

While a letter's recorded track is playing, the sentence being read gets a soft gold wash and the page follows it. One component, one generated corpus, two settings. Module header is the deep doc — this is the map.

**Data.** `src/data/audio-sync.js`, generated by `tools/align-audio.py` (forced alignment against the mirrored MP3s; DO NOT EDIT the output). Rides **bundle-a-vot** (~213 KB raw) alongside `audio-manifest.js`, on the same reasoning: every screen that can show a play button has the VOT corpus loaded by definition. Classic-script `var AUDIO_SYNC`, so it is a window global like `AUDIO_MANIFEST`.

```
AUDIO_SYNC["volKey:letterId"] = [[startSec, blockIndex, charStart, charEnd, partIndex], …]
```
Sorted by `startSec`. `charStart`/`charEnd` are offsets in the BLOCK's DOM `textContent` domain — the same domain the annotation engine (§17) measures — and `partIndex` splits multi-part letters. `charStart === charEnd === -1` is the Format-B sentinel meaning "paint the whole paragraph" (WTLB char offsets shift with `footnotesMode`); the path exists, the corpus does not use it yet.

**Coverage: 230 of the 729 recorded items** — 229 across the seven main Volumes plus one Letters-from-Timothy entry; no WTLB / Blessed / Holy-Days entry is aligned yet. Everything else plays with no wash: the component finds no rows for the key and paints nothing. Extending coverage is a re-run of `align-audio.py`, not a code change (FABLE5-BACKLOG [22] tracks the TTS fallback for the unaligned remainder).

**The component** — `ui/components/ReadAlongHighlight.jsx` (bundle-d), mounted by `LetterView` and `WtlbEntryView` on the LIVE pane only (`!inert`: a swipe peek must not fight over the one global `::highlight` registration, nor write the live container's scrollTop). Renders `null`; it is an effect bundle. It subscribes to the `AudioPlayer` store, binary-searches the fragment for the current clock (with a 0.15s lead — the eye should beat the ear), builds a `Range` over the block's text nodes with a TreeWalker, and registers it as `::highlight(vot-reading)` through the **CSS Custom Highlight API** (Chrome 105+; the floor is 108). **No DOM mutation** — annotations, selection and the read detector are untouched. The offset mapper returns `null` rather than throwing when a row's offsets fall past the end of the rendered text, so a stale alignment row costs one unpainted sentence, never a crashed reading screen.

**It is the FIFTH scrollTop writer**, and §20.1's lease is the reason most of the file exists:
- **Stands down while another writer is flagged** — `body.autoscroll-running` or `body.scroll-restoring`. Checked before starting, and again on every frame of an in-flight glide.
- **User intent revokes it** — a `wheel` / `touchmove` / `pointerdown` on `.screen-scroll` (capture + passive, same as the transport's own yield listeners) suspends follow-scroll for 4s and cancels any glide. Recorded as a **ref timestamp**: a yield must never re-render the reading screen mid-playback.
- **The motion is ours.** It originally shipped `scrollBy({behavior:'smooth'})` — the exact thing use-autoscroll's header rejects by name, because browser-owned smooth scrolling is uninterruptible and the lease can never be handed back. It is now a short (260 ms) rAF glide, every frame a plain `scrollTop =` assignment, read-first against the last value we WROTE (`DRIFT_PX 1.5`, same device-pixel reasoning), aborting on any other writer. `prefers-reduced-motion` collapses it to one assignment. The target keeps the spoken sentence inside the 25%–60% band, aimed at 35% down the container.
- The container is resolved with `closest('.screen-scroll')` from the body ref, never a document query, so a peek's cloned container can't be mistaken for the live one.

**Settings** (`hooks/use-settings.js`, both default **ON**, in Settings → Listening — the group that also owns Bible Audio, Letter Voice and Default Speed): `readAlongHighlight` gates the paint — and with it everything, since there is nothing to follow — and `readAlongFollow` gates only the scroll, so a reader can keep the wash without the motion. They reach the two reading views through `sharedViewProps` (`readAlongOn` / `readAlongFollow`), the way every other settings-driven reading behaviour does.

**Coverage:** `ReadAlongHighlight.test.jsx` drives the real `AudioPlayer` singleton through a fake media element, with a hand-drained frame source so the glide's timestamps are exact — the lease rules, both settings gates, the binary search at its boundaries, and the mapper's silent `null` are each RED-proven. `tools/smoke.js`'s **Read-along wiring** step checks the other half in the real app without playing anything: the corpus is wired, every block a fragment names exists under the hl-key the component builds, and the Highlight API round-trips (or is cleanly absent).

---

## Section 23 — Audio subsystem (streaming letters + recorded Bible)

~4,200 lines across the player, the trust boundary, two IDB stores, two generated manifests and a native bridge. This is the reference map; each module header is still the deep doc for its own file. Line anchors are as of 2026-08-10 — verify with `grep -n` before trusting one.

### 23.1 The trust boundary — what a URL is allowed to be

Every played or persisted track points at an immutable GitHub Release asset, and `utils/audio-track.js` owns the whole rule. **`RELEASE_PREFIXES`** (`audio-track.js:45`) is a frozen eight-entry list — `audio-v1` (letters), `audio-bible-v1` (the retired whole-book Bible tracks), and the OT/NT tag PAIRS for the three per-chapter editions (`audio-wop-v1/v2`, `audio-brm-v1/v2`, `audio-web-v1/v2`). A release caps at 1,000 assets and each edition is 1,189 chapters, which is why an edition needs two tags at all.

`isVotAudioUrl()` (`:178`) is the only membership test: prefix match against that list, then `ASSET_NAME` (`^[A-Za-z0-9_-]+\.mp3$`) on the remainder — so `…/audio-bible-v1/../escape.mp3` and `…/x.ogg` both fail. It gates `normalizeAudioTrack()` (`:197`, the import/restore boundary for saved recordings), `AudioPositionsStore`'s key check, and the player's own restore path. Widening this list is the one change in the subsystem that can turn the app into a generic remote loader.

**Routing** is `bibleAudioAssetUrl()` (`:158`): the asset NAME picks the tag. `wop1_`/`wop2_`, `brm1_`/`brm2_`, `web1_`/`web2_` prefixes route to that edition's OT/NT release; everything else falls through to `audio-bible-v1`. The fall-through is load-bearing — legacy whole-book ids look like `brm-kjv_genesis`, which shares three characters with `brm1_` and must NOT be captured, or every saved recording's URL would change and stop resolving. Letters use the simpler `audioAssetUrl()` (`:141`) against `audio-v1`. The player picks between them per volKey: `_isBibleVol` / `_mapFor` / `_assetUrlFor` (`audio-player.js:153-157`) are the three lines where the two corpora diverge.

**Why GitHub Releases at all:** Drive was the original host and 403s every request carrying `Sec-Fetch-Site: cross-site` (anti-hotlinking — curl passes only because it sends no sec-fetch headers). Never retarget back. R2 is the documented contingency.

### 23.2 The manifests — two generated corpora, one expanded by loop

**Letters** — `src/data/audio-manifest.js` (generated by `tools/gen-audio-manifest.mjs`), rides **bundle-a-vot** with the VOT corpus: `AUDIO_MANIFEST["volKey:letterId"] = [[assetId, readerCode, partLabel?], …]`, plus `AUDIO_SECTIONS` (WTLB range compilations) and `AUDIO_ALTERNATES` (the ~42 letters with a second complete reading). All three are classic-script `var` globals read at CALL time through `_manifest()`/`_sections()`/`_alternates()` (`audio-player.js:140-147`) — never at import time, because they are lazy.

**Bible** — `src/data/bible-audio-manifest.js` (generated by `tools/gen-bible-audio-manifest.mjs`), rides **bundle-a** (critical path, ~4 KB minified) so Settings, the boot restore and `matthew-idx` work before the Bible corpus loads. Three globals:

- `BIBLE_AUDIO_BOOKS` — canonical 66-book order, `[appBookId, title]`, titles taken from `books.js` so the audio book ids ARE the corpus book ids by construction (this is what lets the read-credit bridge write into the reader's own key space).
- `BIBLE_AUDIO_MANIFEST` — declared EMPTY at `bible-audio-manifest.js:86` and filled by the **expansion IIFE** at `:155-241`: a `[bookId, testament, chapterCount]` table × a three-entry editions table `[['bible-brm-kjv','brm'], ['bible-wop-nkjv','wop'], ['bible-web','web']]`, emitting `<prefix><testament>_<bookId>_<NNN>` asset names with a `Chapter N` partLabel. 2,378 rows generated from ~1 KB of source instead of written out. A fourth edition of the same shape is ONE entry in that editions array plus a registry entry plus two prefixes.
- `BIBLE_AUDIO_CHAPTERS` (`:87`) — `"volKey:bookId" → [sec, …]` chapter-start offsets into the RETIRED whole-book BRM track (1,189 rows, every boundary independently belt-verified). It survives as **resume-migration data**: a snapshot saved before the per-chapter switch holds a book-relative clock, and this index is what turns it into (chapter, offset-within-chapter). Retire after the next release.

**Registry** — `BIBLE_AUDIO_EDITIONS` (`audio-track.js:61`) maps a `settings.bibleAudio` value to `{ label, short, translation, volKey }`; `bibleAudioEdition()` (`:121`) resolves it with a `hasOwnProperty` guard (settings values are import-restorable, so `'toString'` must not resolve). It lives in `audio-track.js`, not the lazy manifest, so Settings can list editions before any corpus lands, and is published on `globalThis` for the classic-globals Settings screen (`:116`). Every `volKey` starts `bible-`, which is the single prefix test the player branches on.

### 23.3 playBibleBook — branching on SHAPE, never on edition id

`playBibleBook()` (`audio-player.js:883`) takes `{ volKey, bookId, label, chapterNum, noResume }` and does two things:

1. **Scope is THE BOOK** (owner directive 2026-08-10): `items` is filtered to the one book, so a chapter tap queues that book's remaining chapters and auto-advance ends where the book ends — never the rest of the Bible.
2. **Shape decides how "chapter N" is honored.** `perChapter = parts.length > 1` (`:900`). Per-chapter → the chapter is a queue POSITION, passed as `startPartIndex` (`:904`, clamped inside the book). Whole-book → one part per book, so the chapter is a SEEK: `bibleChapterStart()` (`:923`) reads `BIBLE_AUDIO_CHAPTERS` and `_seekOnMetadata()` arms it (`:911`).

The branch is on the SHAPE the manifest declares, never on an edition id, which is why WEB joined as a third voice with no player change at all. `bibleChapterStart` returns 0 for chapter 1, an unknown book or an uncovered row — an index gap degrades to "start at the book", never to a wrong offset.

Consumers: the hero Listen pill on `ChapterIndex` (book index — no chapter named, so the book starts at chapter 1), `BibleChapterView` and `MatthewChapterView`/`ChapterView` (chapter named), the desk's edition chips (`AudioManagerSheet.jsx:123`, always with `noResume`), and `AudioCollectionScreen`'s per-book chapter disclosure.

### 23.4 The forward-only horizon

`playCollection()` (`audio-player.js:1648`) is the album engine both corpora share, and its contract is **forward-only** (owner directive 2026-08-09): `startId` slices the built queue at the chosen item, so nothing behind it is ever queued and `prev()` simply clamps at the start. A reader stepping backward past where they began is disorienting; the horizon persists, so it survives a reboot too.

Three refinements sit on top, applied in this order inside the `startKey` block:

- **`startReader`** swaps the START item for another reader's complete rendition (`:1665-1679`) — the rest of the collection keeps the manifest's primary reading. Renditions are never interleaved.
- **`startPartIndex`** advances the horizon INTO the start item's parts (`:1682-1687`) — same rule, chapter/part-grained. It is applied **after** the voice swap (2026-08-10): the older order let the rendition swap re-grow the parts the index had just trimmed, so "Part 2, read by Timothy" rebuilt as Part 1.
- **`noResume`** suppresses the durable resume for this start (`:1704`) — the desk's voice switch promises "starts this again", and a remembered position from a DIFFERENT recording's pacing would drop the listener mid-sentence.

`_rememberOutgoingPosition()` fires first (`:1692`): a new queue replacing the old one is a boundary like a track change, or the outgoing recording loses up to the throttle window.

`_tracksFor()` (`:999`) is what expands a manifest row into Tracks, and owns one display rule: a per-chapter Bible book (`_isBibleVol && parts.length > 1`) titles each track by its CHAPTER ("Psalms 117") while keeping the `Chapter N` partLabel — 150 rows that all read "Psalms" named nothing. `displayPartLabel()` (`audio-track.js:236`) then suppresses the resulting echo on the bar and the desk head, and only there.

### 23.5 The `loadedmetadata` seek contract

`_seekOnMetadata(at)` (`audio-player.js:1246`) is the ONE deferred-seek primitive: a `currentTime` assignment before `loadedmetadata` is ignored or throws, so every seek that must survive a `src` assignment goes through it, `{ once: true }`. Boot restore, durable resume, the whole-book chapter offset and the whole-book→per-chapter migration all use it.

Ordering matters and is deliberate: `playBibleBook` arms the resume seek first (inside `playCollection`) and then adds its own chapter seek SECOND, so the chapter the reader actually tapped wins the assignment over a remembered position. `noResume` is the only way to skip the first.

### 23.6 `vot-audio-positions` — durable per-recording resume (IDB v10)

`stores/audio-positions-store.js`. The player's `vot-audio-pos` localStorage snapshot is ONE slot (it remembers the last thing playing); this store is the per-recording memory beside it.

- **Shape**: `url → { t, d, at }` — seconds in, length, last-touch epoch. Three numbers, no media.
- **Keys are URLs**, re-checked through `isVotAudioUrl` on every read and write (`_url()`, `:71`), so no arbitrary address can enter the map.
- **LRU capped at `MAX_AUDIO_POSITIONS = 200`** (`:21`) by last touch. **Key insertion order IS the LRU order** — writes delete before re-inserting — so pruning costs no sort and an oversized import truncates to the FRESHEST 200 rather than an arbitrary 200.
- Clocks are clamped to `MAX_POSITION_SECONDS` (100 h) and rounded to a tenth of a second, the player's own resolution.

**Write rules** (`audio-player.js:1169` `_rememberPosition`): a ≥1/s throttle with a `force` bypass at deliberate boundaries, and a **uniform 30 s floor** (`AUDIO_RESUME_MIN_SEC`) applied on the WRITE path since 2026-08-10 — including the forced stop/pause writes. A position under 30 s can never resume, so storing one files a row that means exactly what no row means while spending an LRU slot; skipping chapters through a book used to file a dead row per chapter and evict the real places the listener left. The same test covers a zero clock, which matters because `_start()` sets `_state.time = 0` before metadata lands.

**Attribution (R8)**: the position belongs to the track being LEFT, so every transport move that mutates `_state.qi` calls `_rememberOutgoingPosition()` (`:1195`) FIRST. A track heard to its end is FORGOTTEN — `_forgetPosition` (`:1200`) deletes it pre-advance and `_finishedUrl` flags the URL so the advance cannot write the ending clock back in. `stop()` writes before clearing live state: the ✕ ends the session, not the memory.

**Read rules** (`_resumeAt`, `:1224`, thresholds shared from `audio-track.js:258-263` so library rows describe exactly what a tap will do): resume when `t ≥ 30` and `t < 0.97 × d`, seeking to `t − 5` (rewind-on-resume). `d = 0` (metadata never arrived) resumes on the clock alone. **Emergent and pinned as correct**: a recording shorter than ~31 s can never resume, since the two tests together require `d > 30 / 0.97`.

**Migration**: `_migrateWholeBookResume()` (`:1381`) converts a pre-switch whole-book snapshot — an `audio-bible-v1` URL with a clock measured against the WHOLE BOOK — into the right chapter track plus an offset inside it, using `BIBLE_AUDIO_CHAPTERS`.

**The seven registration legs** every user-data store must land together (`user-data-parity.test.js` is the canary that makes a miss go RED): `STORE_NAMES` and the `DB_VERSION` bump in `stores/idb-adapter.js`; `idb-adapter.test.js`; the `_entry-b.js` import + window map; `STORE_SHAPES` in `utils/import-validators.js`; SettingsScreen's export entry (`method: 'replaceAll'` unless the store's own writer takes a different shape); and `USER_DATA_STORES` in `utils/user-data-size.js`. The parity test exists because `vot-audio-library` (v9) shipped with leg 6 missing for a release.

**The parity test is FOUR-way since C2-D [D2]** (2026-08-10). Its first three legs read each other — the export map, the "Your Data" list, and the import shapes — which means a store *all three* never heard of stays invisible in a fully green suite. That is not hypothetical: `vot-library-order` (v4), `vot-note-default` (v3) and `vot-ann-hint-dismissed` (v7) had been in the schema for months, in the app's write path the whole time, and in no backup list at all — the reader's Library tile arrangement, the note style+colour every new note inherits, and a dismissed coach-mark simply died with the device. Leg 4 starts from `IDBAdapter.STORE_NAMES` and asserts both directions against what the backup touches, with **`meta` the single exempt name, pinned by exact match** (it holds migration bookkeeping and the storage-growth series, and is deliberately outside `USER_DATA_STORES` so the series cannot inflate the number it trends). The burden is now the right way round: a new store is the reader's to keep unless its author says, in that test, why it is not.

**`vot-state` is a cross-tab MERGE store since C2-D [D4]**, and the only one whose merge is field-discriminating (`mergeStateStore`, `stores/store-merge.js`). Session fields — `tabs`, `activeTabIdx`, `theme`, `settings`, `activeReadKey` — stay last-writer-wins on purpose: a stomped write costs nothing durable, because the losing tab still holds its own copy and `usePersistedState` reflushes the whole union on its next tick, and merging two tab strips would resurrect closed tabs and invent an arrangement neither window had. The accumulating maps — `readItems`, `lastReadChapters`, `lastReadLetterMap` — are merged, because for them a stomped write is permanent: `readItems` is the marked-as-read ledger behind My Progress, the reading streak and the 84 achievements. All three go through `mergeMapByKey` **with `base`**, so `unmarkRead` / `clearReadForBook` / `clearAllProgress` are honored rather than resurrected by a sibling's stale copy; read counts resolve to the higher of the two (they only climb, and two tabs crediting one chapter must not double it). **Consequence for `cached-store.js`:** the boot-script `lsShim` write now sits ABOVE the merge/blind split in `_save` — it used to live inside the blind branch, after the merge path's early `return`, on the comment "no merge store uses lsShim". vot-state is now both, and it stays a *synchronous* write so a theme flip followed immediately by a tab close cannot reopen into the old theme.

### 23.7 `vot-audio-library` — the Listening Library's metadata (IDB v9)

`stores/audio-library-store.js`. Small metadata only — saved recordings (cap 100), a bounded recent list (cap 30), the playback-rate preference, and two monotonic lifetime counters. No media bytes, no arbitrary URL field; every track in or out passes `normalizeAudioTrack`.

**`plays` vs `completions` are deliberately two counters** because starting a recording and finishing one are different acts and My Progress shows both:

- `countPlay()` (`:239`) — lifetime recordings STARTED. Never called from `_start()`, which also runs for auto-advance, next/prev, `playAt` and the boot-resume rebuild; counting starts there would credit a whole queue to one tap on Play All.
- `countCompletion()` (`:264`) — recordings heard to their END, fired from `_countCompletion()` (`audio-player.js:723`) at the same moment the read credit is granted, so it counts WHOLE recordings (a multi-part letter counts once, when its last part ends).
- On restore, `plays` takes a conservative lower bound from `recent.length` when the field is absent (`:136`); `completions` gets NO inference — a pre-counter library holds no evidence about what ever reached its last second, and an invented number would be a lie about the reader's own listening.

**Recents policy (post-C2-A/W1)**: `recordPlayed()` (`:218`) moved out of `_start()` and onto `_countPlay()`'s four user-initiated entry points (`audio-player.js:1524`). It had fired on every auto-advance, so one Genesis evening flushed all 30 rows AND repointed "Resume last" at a chapter nobody chose. The shelf answers *what did I put on* — a decision, not a track boundary. The two counters are isolated inside `_countPlay` in nested try/catch: a failing shelf write must not cost the play count, and neither may stand between a tap and audio.

**Continuation (C2-A/A1)**: a shelf row or "Resume last" is one Track, and used to play as a queue of ONE. `_locateTrack()` (`:1569`) now finds that recording in the LIVE manifests by its immutable URL and `playTrack()` (`:1768`) rebuilds around it — a Bible chapter gets its book from that chapter forward, a letter its collection forward on the exact rendition and part the row names. Only a URL no manifest carries any more (a legacy whole-book asset, a retired recording, a range compilation) still plays alone.

### 23.8 The read-credit bridge

A recording played to its end counts like a read (owner directive 2026-08-09). `_notifyListened()` (`audio-player.js:692`) fires from `'ended'` BEFORE `next()` advances; range-compilation sections carry `key: null` and never notify. **Two completion grains, because the corpus has two:**

- a LETTER is one recording that may be split across parts, so it scores when its LAST part ends — the same-key guard against the following track is what waits for it;
- a BIBLE CHAPTER is a whole recording of its own. Every shipped edition is per-chapter and a book's chapters all share one key, so the letter guard credited a 50-chapter book exactly once, and only when the queue happened to hold the whole book. Bible tracks therefore notify **per track**, independent of queue shape, carrying the chapter parsed from `partLabel` (`_chapterOfTrack`, `:672`).

The App side is `window.__votAudioListened(volKey, itemId, chapterNum)` in `hooks/useMarkAsRead.js:243` — a fail-quiet window bridge, never an import across bundles. A `bible-*` volKey resolves into the SAME chapter key space `BibleChapterView`'s own mark-as-read writes (`v1:<bookId>:<chapter>`), so a listened chapter checks its index card, counts toward the Scripture-chapter milestones and records a reading day for the streak. A whole-book legacy recording names no chapter: it counts as finished in the Listening Library but claims no chapter read. Letters resolve through `COL_BY_KEY`'s `readKey`, which has no `bible-*` entry — that mismatch was the whole defect.

### 23.9 The native media card

Android only, and the JS player stays the single source of playback truth in both directions.

**Out** — `_syncNative()` (`audio-player.js:409`) pushes `(title, artist, isPlaying, position, duration, rate)` through `AndroidBridge.setAudioNowPlaying` (`AppInterface.kt:150`) to `AudioKeepAliveService`'s `MediaSessionCompat` + MediaStyle notification. It is **edge-driven**: called from `_mediaSession`, `_syncMediaSessionState` and the transport edges, and deliberately NOT from `_syncMediaSessionPosition`, which runs at 1 Hz off `timeupdate` (`:344` says so at the call site). The card's second line is `_cardArtist()` (`:396`): a Bible chapter names its EDITION, because those tracks carry no reader and all three editions would otherwise read "The Volumes of Truth" alike.

**Back** — the service's `commandSink` (`AudioKeepAliveService.kt:360`, wired in `MainActivity.kt:506`) forwards `(cmd, posMs)` over `JsBridge` as `window.__votMediaCommand` (`JsEvent.kt:56`), received by `_installNativeTransport()` (`audio-player.js:430`). `play`/`pause`/`toggle` all resolve through `toggle()` — the system only offers Play while paused and Pause while playing, so the edge is always the right one. A bad command can never crash the player.

Pause keeps the card alive (keep-alive releases only on idle; the paused notification detaches from the FGS so it is swipeable, and swiping stops the service). Separately, `_setAudioActive()` (`:226`) is the keep-alive edge that lets the WebView keep playing with the screen off.

### 23.10 Prefetch, and what it must never warm

`_warmTargets()` (`audio-player.js:598`) warms the next `PREFETCH_AHEAD = 2` queued URLs into the HTTP cache through a detached, never-playing element — a sliding window, skipped on Save-Data / 2g / a poor connection or while the current track is still filling. The one hard exclusion is a prefix test for `AUDIO_BIBLE_RELEASE_PREFIX`: whole-book tracks are 30–260 MB, so "warming" one is a full audiobook download. Every shipped edition is per-chapter and warms like a letter.

### 23.11 Where audio touches the reading surface

Read-along's follow-scroll is the **fifth** sanctioned writer of `.screen-scroll`'s `scrollTop`, and the lease it obeys is documented in two places that must stay in agreement: the block in `hooks/use-autoscroll.js:18-31` (which enumerates all five) and `ui/components/ReadAlongHighlight.jsx:23-54` (which states the three ways follow-scroll yields). Full map in **§22**; the transport itself in **§20.1**. At most one writer may write at a time — read both blocks before adding a sixth.

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

**Two search engines are intentional:** `searchNavIndex()` (alias-based, ~2000 items) is for destination lookup in LinkPicker. `VotSearchMini` (MiniSearch, bundle-e) is for content search in SearchScreen. Different UX problems, different engines. Do NOT merge.

**`navigateToLink` vs `openInAppLetter`:** Both navigate to letters, but from different UX flows. `openInAppLetter` handles footnote tap-throughs (knows the source letter title for back-pill label). `navigateToLink` handles cross-reference link card taps (source may be Bible, study, or letter — no guaranteed source title). Both now push onto `fromLetterStack`.

**Event listener cleanup is solid** — all addEventListener/removeEventListener pairs are properly balanced. No memory leaks from event listeners.

**Accessibility is reasonable** — proper `aria-label` usage, semantic `<button>` elements, good color contrast (10.5:1 dark, 5.2:1 light). Main gaps: no focus traps on modals, limited keyboard navigation beyond browser defaults.

---

## Lazy corpora — the contract, the one race class, and why it stays (2026-08-04)

Four lazy loaders hang off `window`: `__bibleCorpus`/`__loadBibleCorpus` (BOOKS), `__matthewCorpus` (MATTHEW), `__votCorpus` (the letter corpora), `__screensE` (Settings/Search/Garden). Each is idempotent and **async-notify-only** — it never bumps state synchronously, which is what makes the render-phase kick inside `_corpusView` safe.

**The rule.** `useLazyBundles` subscribes App() to all four versions, so anything read **during render** self-heals when a corpus lands. The one shape that does NOT self-heal is an **effect that reads a corpus and has a dependency array not containing a corpus signal**: it fires once, finds the global absent, returns, and never runs again — a corpus arriving changes none of its deps. That is precisely how Bible/Matthew/study visits were being dropped from History before this session.

So: **any effect that reads a lazy corpus (directly, or through `_findLetter` / `getStudyById` / `findEntryContext` / `_allBooks` / `_matthew`) must either have no dependency array or carry its own retry.** As of 2026-08-04 exactly three effects read one, and all three are dep-less: `use-android-back.js` (registers a handler that reads at event time), `use-nav-history-tracking.js` (dep-less + a `recordedKeyRef` fire-once guard), `use-reading-position-nav.js`. No `useMemo`/`useState` initializer captures a corpus. `SearchScreen` `Promise.all`s all three corpora before `E.init()`, so the index can never be built against a partial corpus.

**Is lazy loading still warranted?** Measured, not assumed (desktop Chrome, local server, current build):

| | bytes | starts at |
|---|---|---|
| boot path: bundle-a + b + c + d | **960 KB** | 29–53 ms → **DOMContentLoaded 65 ms** |
| `bundle-a-vot` | 2,144 KB | 79 ms (after interactive) |
| `bundle-a-bible` | 4,878 KB | 123 ms (after interactive) |
| `bundle-a-matthew` | 481 KB | only when a Matthew surface asks |

**Keep it.** Laziness removes ~7.5 MB from the first-paint path while still delivering the corpora within ~60 ms of interactive — and a mid-range Android WebView parses JS several times slower than this desktop measurement, which is the environment the boot budget actually exists for (the Q8 work that created these bundles took bundle-a from 11.7 MB to ~816 KB). Note what it is *not*: `HomeScreen` pre-warms the Bible corpus for Surprise, so this is **deferral, not avoidance** — the bytes still arrive on almost every session. The win is the paint, not the traffic. Making the corpora eager would buy nothing and put 7.5 MB back in front of the first frame.

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

## Type scale (2026-08-04) — one ladder, one setting

Every font-size in the app names a token from a single 13-step ladder declared once in `app.css :root`. Before this, 590 declarations across 15 files used **103 distinct hand-picked values** — ten of them between 8.8px and 10.9px, in two unrelated families (decimal in `app.css`, 16ths-based in the injected journal styles). A reader who raised Text Size for a letter still met 8.8px type in Settings.

| family | form | scales with Text Size? | use |
|---|---|---|---|
| `--fs-10` … `--fs-48` | rem | **yes** (root `--font-scale`) | all content + UI type |
| `--fsc-10` … `--fsc-48` | px | no | nav / floating chrome + glyph icons |

Steps: 10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 30, 36, 48. **The number is the px size at scale 1**, so ordering is obvious in a diff. `--fs-16` is the body/reading anchor. **`--fs-10` is a hard floor** — nothing renders below 10px at scale 1 (the owner's audience is older readers; that floor was the one snap that moved type *up*).

- **`--fsc-N` are the chrome twins of `--fs-N`.** The chrome-pin block at the END of `app.css` re-states nav/floating chrome in px so Text Size can't balloon the top nav or the ‹ › pagers (owner: "must NOT expand icons"). That block used to restate hand-computed decimals (`0.56rem` here, `8.96px` there) which could silently drift; both sides now name the same step.
- **Exceptions, deliberate:** `em` font-sizes (verse sups, the external-link ↗ marker, inline refs — parent-relative BY DESIGN so they follow whatever they sit in) and the three `clamp()` fluid headings (ends are tokens; the vw term between them is the point).
- **Enforced:** `tools/check-type-scale.js` (npm `check:type-scale`, pre-commit + CI) fails on any literal rem/px font-size outside the ladder's own declaration. Need a size that doesn't exist? Add the step — and its `--fsc-` twin — in `:root`.

## Every custom property must be declared (2026-08-10, C2-D [D8])

An undeclared `var()` does not degrade — it **deletes the declaration**. The reference resolves to the guaranteed-invalid value, the whole declaration becomes invalid at computed-value time, and every longhand falls to `unset`; for `border-style` that is `none`. `border: 1px solid var(--border)` therefore computes to `none 0px`, not to a default colour.

That shipped. **`--border` was referenced 13 times** — `app.css` ×4, `styles/journal-styles.js` ×6, `HighlightsScreen.jsx` ×3 — and declared nowhere, so none of those borders had ever painted (probed live in the preview before the fix). Two were worse than cosmetic: `.hlx-search` and `.jrn-search` declare their focus ring as a *border-colour* change, and a border that does not exist cannot change colour, so both search boxes had **no focus indicator at all**; the unselected Highlights type chips read as bare text rather than chips. It is now declared beside `--gold-border` as the quiet neutral twin — `rgba(200,164,86,0.16)` dark (the hairline the audio-library cards and shelf rows already draw) and `rgba(110,98,76,0.18)` light (the picker header/footer's).

**`tools/check-css-tokens.js`** (npm `check:css-tokens`, pre-commit + CI) generalizes what `check-type-scale.js` did for `--fs-*` only: any `var(--name)` **with no fallback** whose name is never declared fails the build, naming every reference site. Three things count as declaring it — a `--name:` anywhere in the scanned tree (including JS-injected stylesheets and `index.html`), or a `style.setProperty('--name', …)` call, which is **discovered rather than allowlisted** (`--font-scale`, `--keyboard-height`, `--card-ar`, `--inset-top`, `--inset-bottom` all arrive that way and needed no listing). `var(--name, fallback)` is deliberately not flagged: a fallback IS the author saying what absence means, and it keeps the declaration valid. Block comments are blanked before scanning, so prose naming a token is not a violation.

## CSS variables reference

- `--fs-10` … `--fs-48` / `--fsc-10` … `--fsc-48` (the type scale — see above; never inline a literal font-size)
- `--gold`, `--gold-bright`, `--gold-dim`, `--gold-border`, `--gold-faint`, `--gold-glow`
- `--border` (the quiet neutral hairline — cards/pills/inputs that want an edge without announcing it; `--gold-border` is the loud one)
- `--cream-dim`, `--bg`, `--bg3`
- `--tap-ref`, `--tap-ref-sub`, `--tap-ref-active` (inline scripture ref colors)
- `--link-blue` (#6cb4dc dark / #4a90b8 light)
- `--accent-pink` (#f48fb1 dark / #c2185b light)
- `--font-cinzel`, `--font-garamond`
- `--inset-top` (injected by Android `MainActivity.injectInsets()`)

Verse numbers MUST be `var(--gold)`. Body text is `--cream-dim`.
