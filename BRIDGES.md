# window.__ Bridges — Registry

Imperative escape hatches between the inline `App()` closure (still
classic-script in `index.html`) and the ES-module clusters (B/C/D).
A bridge is a property on `window` whose name starts with `__`, set by
one side and consumed by the other.

**Why this file exists.** Bridges have no compiler check. A consumer
that misspells `window.__goHome` as `window.__gohome` is a silent
no-op until manual testing surfaces it. There is no per-bridge
inventory anywhere else in the repo — without one, the next session
that adds or removes a bridge has no way to verify both sides match.

**Discipline.** When you add a bridge, add an entry here. When you
remove one, delete the entry. When you rename one, update both
ends *and* this file in the same commit. Grep this file by name
before touching either side.

**Format.** One subsection per bridge. The **Setter** line is the
authoritative file/line where the assignment happens; **Cleanup**
is the restore-form (or "none" if it's a stable lifetime); **Consumers**
lists every place that reads/calls it. Counts shown are as of `14ec520`
(Q2.2 leaf conversion).

---

## 1. Sheet orchestration (10 — owned by `src/hooks/use-sheet-orchestration.js`)

These are all `useEffect`-bound, all cleaned up via `delete window.__X`,
all assigned exactly once each in that hook. The hook's header comment
already enumerates the 10 — this section mirrors it for greppability.

### `__openNote`
- **Setter:** `src/hooks/use-sheet-orchestration.js:177` — `() => { window.__openNote = openNoteSheet; return () => { delete window.__openNote; }; }`
- **Cleanup:** `delete window.__openNote` on hook teardown
- **Consumers:** `renderer/annotation-engine.js` (tap on note mark or note icon), `ui/sheets/SelectionToolbar.js` (link-button + Note action)

### `__openLinkPicker`
- **Setter:** `src/hooks/use-sheet-orchestration.js:170` (paired effect with `openLinkPickerForTarget`)
- **Cleanup:** none in current code (paired effect re-assigns both each render — see also `__openLinkPickerForTarget`)
- **Consumers:** SelectionToolbar (Link button on selection)

### `__openLinkPickerForTarget`
- **Setter:** `src/hooks/use-sheet-orchestration.js:171`
- **Cleanup:** none (re-assigned each render)
- **Consumers:** `ui/sheets/JournalInsertSheet.js` (Insert > Link), SelectionToolbar

### `__openLinkSidebar`
- **Setter:** `src/hooks/use-sheet-orchestration.js:181` — `delete` on cleanup
- **Consumers:** `renderer/dom-links.js:145` (inline link-icon tap)

### `__showAnnChip`
- **Setter:** `src/hooks/use-sheet-orchestration.js:182` — `delete` on cleanup
- **Consumers:** SelectionToolbar (tap on existing highlight/underline mark)

### `__showMultiNote`
- **Setter:** `src/hooks/use-sheet-orchestration.js:183` — `delete` on cleanup
- **Consumers:** `renderer/annotation-engine.js` (multi-icon merge with `data-count > 1`), SelectionToolbar (tap on note mark when multiple groupIds overlap)

### `__openBookmarkPopover`
- **Setter:** `src/hooks/use-sheet-orchestration.js:184` — `delete` on cleanup
- **Consumers:** `renderer/dom-bookmarks.js:24,139,140` (multi-bookmark icon tap), `ui/components/ChapterBookmarkBtn.jsx:20,21`, `ui/components/BookmarkIcon.jsx:25,26`

### `__bookmarkCreate`
- **Setter:** `src/hooks/use-sheet-orchestration.js:188` — `delete` on cleanup
- **Consumers:** `ui/components/ChapterBookmarkBtn.jsx:29,30`, SelectionToolbar (Bookmark action), `index.html:3167`

### `__openJournalInbound`
- **Setter:** `src/hooks/use-sheet-orchestration.js:192`
- **Consumers:** none in current src — set up for future Journal Inbox feature

### `__bookmarkEdit`
- **Setter:** `src/hooks/use-sheet-orchestration.js:201` — has a follow-up call at :226 on the same hook
- **Consumers:** `renderer/dom-bookmarks.js:130` (single-bookmark inline icon tap), `ui/components/BookmarkIcon.jsx:19,20`

---

## 2. The `__closeSheet` stack (single bridge, ~13 callsites)

`__closeSheet` is a generic "the topmost sheet should close itself"
hook for Android back navigation. EVERY sheet/picker that mounts a
backdrop pushes its closer onto the stack (`prev = window.__closeSheet;
window.__closeSheet = myCloser;`) and restores on unmount (`window.__closeSheet
= prev || null`). Used by `use-android-back.js` to dismiss the
top sheet on a hardware-back press.

- **Stackers (push on mount, pop on unmount):**
  - `ui/sheets/VersePickerScreen.js:46-47`
  - `ui/sheets/TabActionSheet.js:19-20`
  - `ui/sheets/LinkSidebar.js:25-26`
  - `ui/sheets/LinkPicker.js:29-30`
  - `ui/sheets/BookmarkCreateSheet.js:129-130`
  - `ui/sheets/LetterExcerptPickerScreen.js:65-66`
  - `ui/screens/ChapterView.js:19-20` (scripture sheet)
  - `ui/screens/LetterView.js:106-107` (scripture sheet)
  - `ui/screens/WtlbEntryView.js:74-75` (scripture sheet)
  - `ui/components/SelectField.jsx:12-13` (dropdown sheet)
- **Consumer:** `src/hooks/use-android-back.js:13,95,130` — invokes the topmost closer, then nulls it.

**Discipline note:** the stack only works if every sheet uses the
save/restore pattern. A sheet that does `window.__closeSheet = fn`
without saving `prev` first will lose any sheet behind it. Greppable
guard: `prev = window.__closeSheet` must appear in every sheet's
setup effect.

### `__screenBack` (screen-internal back interceptor)
- **Setter:** `ui/screens/NotesIndexScreen.jsx` — registered in a `useEffect` ONLY while drilled into a notebook (`window.__screenBack = fn`; cleanup `if (window.__screenBack === fn) window.__screenBack = null`).
- **Consumer:** `src/hooks/use-android-back.js` — called right after the sheet / tabs-overlay checks and BEFORE per-screen routing; returns `"true"`-path when it consumed the press, so an internal navigation level (e.g. a drilled notebook → Notebooks list) is unwound before Back leaves the screen instead of skipping out to the parent.
- **Why a window slot:** the back router lives in bundle-b and the screen state in bundle-d; bundles don't share module state, so the interceptor rides on `window` exactly like `__closeSheet`.

---

## 3. Navigation glue (set in `index.html`'s App() block)

### `__goHome`
- **Setter:** `index.html:1819` (inside an effect; assigns a closure that resets nav state)
- **Cleanup:** none — set once
- **Consumers:** `ui/components/HomeBtn.jsx:9`, `ui/components/FootnoteListSection.jsx:71`

### `__goSearch`
- **Setter:** `index.html:1570` (useEffect, cleanup `= null` at :1571)
- **Cleanup:** `window.__goSearch = null` on effect re-run
- **Consumers:** `ui/sheets/SelectionToolbar.js:488` (Search-selection action)

---

## 4. Reading-state bridges

### `__bumpHlTick`
- **Setter:** `index.html:1113` — useEffect, `delete` on cleanup
- **Cleanup:** `delete window.__bumpHlTick`
- **Consumers:** `ui/components/ChapterBookmarkBtn.jsx:46` (force re-render after bookmark add/delete)

### `__activeNoteGroup`
- **Setter:** `index.html:1190` — written continuously, mirrors `noteSheetTarget.groupId`
- **Cleanup:** none (always reflects current state — nulled when no sheet open)
- **Consumers:** `renderer/annotation-engine.js:332,338` (drives `applyActiveNoteState` wavy-underline)

### `__onReadingComplete`
- **Setter:** `src/hooks/useMarkAsRead.js:40` — useEffect, cleaned to `null` on unmount
- **Cleanup:** `window.__onReadingComplete = null`
- **Consumers:** `ui/components/ScreenLayout.js:24` (post-scroll-bottom fires it)

### `__onDwellCommit`
- **Setter:** `src/hooks/use-reading-dwell.js:140` — useEffect, identity-guarded cleanup
- **Cleanup:** `if (window.__onDwellCommit === commitDwellNow) window.__onDwellCommit = null` (only clears the bridge if it's still mine — prevents racing hooks from clobbering)
- **Consumers:** none in current src (set up for legacy debug — was the path for forced commit; current code commits via direct ref)

---

## 5. Pending-after-nav data slots

These are not function handlers — they're one-shot data fields a navigation
writes just before a screen change, for the destination view to read on mount.

**Migrated to `navHandoff` (D2 — see `src/utils/nav-handoff.js`, the canonical
registry).** The five live one-shot slots — `pendingHighlight`,
`pendingScrollHlKey`, `pendingSearchQuery`, `pendingOpenNote`, `notesReturnCtx`
— are no longer raw `window.__*` properties. They go through the typed
`navHandoff.set / take / peek / clear` API; that module's header documents each
slot's shape, writer, and reader, so this file no longer hand-tracks them (the
old per-slot line numbers had drifted). The backing store is a window-held Map
(`window.__navHandoffSlots`) so writers in bundle-b and readers in bundle-d
share it. (`__pendingLinkExcerpt` was removed in D2 — write-only dead code.)

### `__journalBackStack`
- **Setter:** `src/ui/screens/JournalViewerScreen.js:495,556` — lazy-init (`if (!window.__journalBackStack) window.__journalBackStack = []`)
- **Cleanup:** none (lazy-init pattern; entries pushed/popped by code)
- **Consumers:** JournalViewerScreen back-button handler

---

## 6. Android-bridge handlers (Kotlin → JS callbacks)

Set by the JS side BEFORE invoking a Kotlin bridge that fires a
callback. The Kotlin side calls `webView.evaluateJavascript("window.__foo(...)")`.

### `__setInsets`
- **Setter:** `src/ui/components/FootnoteListSection.jsx:76` — set at module load (function definition)
- **Cleanup:** none — lifetime is the page
- **Consumer:** `MainActivity.kt`'s `injectInsets()` — called whenever window insets change (rotation, keyboard show/hide)

### `__onImportFile`
- **Setter:** `src/ui/screens/SettingsScreen.js:270` — set BEFORE calling `AndroidBridge.openFilePicker()`
- **Cleanup:** self-nulls inside its own body at `:271` (single-shot callback)
- **Consumer:** `MainActivity.kt`'s `filePickerLauncher` result handler

### `__onNativeRecordingComplete`
- **Setter:** `src/ui/sheets/JournalRecordingSheet.js:399` — set on recording-sheet mount
- **Cleanup:** `delete window.__onNativeRecordingComplete` at `:494` on save/cancel
- **Consumer:** `MainActivity.kt`'s `postNativeComplete()` (called when native MediaRecorder finishes)

### `__onMicPermissionResult`
- **Setter:** `src/ui/sheets/JournalRecordingSheet.js:458` — set during permission flow
- **Cleanup:** `delete` at `:462`, `:476`, `:493` (multiple exit paths, all clear)
- **Consumer:** `MainActivity.kt`'s `micPermissionLauncher` / `micPrepLauncher` (permission grant result)

---

## 7. Sheet-internal handlers

### `__hideSelectionToolbar`
- **Setter:** `src/ui/sheets/SelectionToolbar.js:51` — useEffect, cleaned to `null`
- **Cleanup:** `window.__hideSelectionToolbar = null` at :55
- **Consumers:** `src/hooks/use-sheet-orchestration.js:81,239` — called by the auto-dismiss-on-nav-change effect

---

## 8. Data shadows (read-only after init)

### `__ALL_BOOKS`
- **Setter:** `index.html:1458` — `window.__ALL_BOOKS = ALL_BOOKS`
- **Cleanup:** none — stable for the page lifetime
- **Consumer:** `src/data/scripture-resolution.js:96` (parseScriptureRef cross-cluster reference)

### `__NAV_INDEX`
- **Setter:** `src/utils/nav-index.js:181` — cached build, lazy-init on first call to `buildNavIndex`
- **Cleanup:** none — cache for the page lifetime
- **Consumer:** `src/utils/nav-index.js:15` (cache read)

---

## 9. Instrumentation / smoke

### `__votResourceErrs`
- **Setter:** `index.html:45` — `window.__votResourceErrs = []` at startup
- **Mutator:** an inline `addEventListener('error', ...)` that pushes failed `<script>` / `<link>` / `<img>` URLs into the array
- **Consumer:** `tools/smoke.js` reads it during the harness run (`report.resource404`)

### `__homeAnimShown`
- **Setter:** `src/ui/screens/HomeScreen.js:281` — set to `true` on first HomeScreen mount
- **Cleanup:** none — one-shot flag for the page lifetime
- **Consumer:** HomeScreen's own re-mount logic (skips the entry animation on subsequent mounts)

---

## 10. Latent / dead bridges

### `__openScriptureSheet` — **RESOLVED 2026-07-12 (dead-UI sweep) — bridge removed, consumer rewired**
- **Setter:** never existed — every reference was a `typeof window.__openScriptureSheet === 'function'` guard
- **Consumer (rewired):** `JournalViewerScreen` — the guard made the tap on an inline journal `{{ref:Book C:V}}` gold link a silent no-op
- **Resolution (2026-07-12):** the open action item on this bridge was settled by removing the bridge path, not by wiring a setter. Journals have no per-entry scriptures dict to feed a sheet, so `onScriptureRef` (`src/ui/screens/JournalViewerScreen.jsx` ~:550) now navigates straight to the verse instead: `parseRefStr` → `findBook` → `onNavigateToLink({type:'bible', bookId, chapter, verse[, verseEnd]})`, firing `window.__loadBibleCorpus()` with a 40×250ms retry when the lazy Bible corpus isn't resolvable yet. Verified 2026-07-22: no setter and no guarded consumer remain in `src/` — the name survives only in a historical comment at that callsite and in the regression test `JournalViewerScreen.menu.test.jsx` ("inline {{ref:}} links actually navigate (dead-UI sweep 2026-07-12)"). Entry kept as a tombstone so those surviving references stay greppable; no live bridge.

---

## 11. Persistence / export

### `__flushPersistState`
- **Setter:** `src/hooks/use-persisted-state.js` (mount effect, contract 5) — `window.__flushPersistState = flush`, the SAME flush used by the visibilitychange/pagehide/beforeunload/unmount listeners.
- **Cleanup:** `if (window.__flushPersistState === flush) window.__flushPersistState = null` on hook teardown (only clears if still mine — the `__onDwellCommit` pattern).
- **Consumer:** `src/ui/screens/SettingsScreen.jsx` (`_exportV3Web` / `_exportV3Android`) — guarded `if (typeof window.__flushPersistState === 'function') window.__flushPersistState();` immediately before `buildV3Manifest(...)`.
- **Why it exists (U1 + persist-debounce race):** the v3/v2 export reads vot-state STRAIGHT FROM IDB after a `whenSaved()` barrier, but a union still inside the 250 ms persist debounce window has not initiated a `StateStore.set`, so the barrier cannot cover it — a change made within 250 ms of tapping Export would be missing from the ONLY backup. Flushing synchronously first lets the existing barrier await the flushed write. A window bridge (not a module import) because bundle-b (hook) and bundle-d (SettingsScreen) are separate esbuild IIFEs — module-scope registrations do not cross the boundary (same rationale as `navHandoff`). No-op when nothing is pending; clears the pending timer so no duplicate trailing write follows.

---

## Cross-references

- **Hook DAG** for App()-level hooks: the comment block at the App()
  hook-call site in `index.html` (single source of truth for hook
  call order). Bridges from those hooks are listed above by setter.
- **Smoke harness:** `tools/smoke.js`'s `EXPECTED_GLOBALS` list covers
  free-variable globals (vendor + stores + components etc.), not the
  `window.__` bridges. A future smoke extension could add an
  `EXPECTED_BRIDGES` table that runs `typeof window.__X === 'function'`
  after App() mounts; that's a separate task (Q2.x or later).
- **For Android bridges in `MainActivity.kt`:** the Kotlin side has
  a parallel list of `@JavascriptInterface` methods (the JS → Kotlin
  direction). The `window.__on*Result` / `__on*Complete` callbacks in
  section 6 are the return direction for those.
