# Journal Feature — index.html wiring patch

The journal feature ships as **13 fully-segregated module files** under
`app/src/main/assets/src/`. These are complete, tested, and self-contained.

`index.html` needs **8 small additions** to wire them in. Each one is reproduced
verbatim below with its anchor — apply with Find & Replace in your editor (or
via `Edit` tool / patch). Order doesn't matter.

> Why a patch document? My previous attempts to wire these in via `Edit` kept
> getting reverted by a parallel write to `index.html` (likely an open IDE
> buffer auto-saving its stale view). Apply when your editor session is
> stable.

---

## 1. Module load order — script tags

**Find:**

```html
  <!-- BookmarkStore, bkmId — extracted to src/stores/bookmark-store.js -->
  <script src="src/stores/bookmark-store.js"></script>
  <script>
/* hlId and lnkId are now defined in src/stores/link-store.js */
```

**Replace with:**

```html
  <!-- BookmarkStore, bkmId — extracted to src/stores/bookmark-store.js -->
  <script src="src/stores/bookmark-store.js"></script>
  <!-- ─── JOURNAL FEATURE — segregated module set ───
       All depend on CachedStore (defined above) + React (loaded earlier).
       Load order matters: styles → stores → helpers → sheets → screens → chip. -->
  <script src="src/styles/journal-styles.js"></script>
  <script src="src/stores/journal-media-store.js"></script>
  <script src="src/stores/journal-stats-store.js"></script>
  <script src="src/stores/journal-index-store.js"></script>
  <script src="src/data/journal-helpers.js"></script>
  <script src="src/stores/journal-store.js"></script>
  <script src="src/ui/sheets/JournalRecordingSheet.js"></script>
  <script src="src/ui/sheets/JournalInsertSheet.js"></script>
  <script src="src/ui/sheets/JournalNotebookSheet.js"></script>
  <script src="src/ui/sheets/JournalInboundSheet.js"></script>
  <script src="src/ui/screens/JournalHubScreen.js"></script>
  <script src="src/ui/screens/JournalViewerScreen.js"></script>
  <script src="src/ui/screens/JournalEditorScreen.js"></script>
  <script src="src/renderer/dom-journal-chip.js"></script>
  <!-- ─── /JOURNAL ─── -->
  <script>
/* hlId and lnkId are now defined in src/stores/link-store.js */
```

---

## 2. LibraryScreen — Journal tile becomes active

**Find:**

```js
function LibraryScreen({ onBack, onOpenNotes, onOpenLinks, onOpenBookmarks, hlTick, theme, onThemeChange, onSearch, onHistory, historyEnabled }) {
  const noteCount = useMemo(() => NoteStore.count(), [hlTick]);
  const linkCount = useMemo(() => LinkStore.all().length, [hlTick]);
  const bookmarkCount = useMemo(() => (typeof BookmarkStore !== 'undefined' ? BookmarkStore.count() : 0), [hlTick]);
```

**Replace with:**

```js
function LibraryScreen({ onBack, onOpenNotes, onOpenLinks, onOpenBookmarks, onOpenJournal, hlTick, theme, onThemeChange, onSearch, onHistory, historyEnabled }) {
  const noteCount = useMemo(() => NoteStore.count(), [hlTick]);
  const linkCount = useMemo(() => LinkStore.all().length, [hlTick]);
  const bookmarkCount = useMemo(() => (typeof BookmarkStore !== 'undefined' ? BookmarkStore.count() : 0), [hlTick]);
  const journalCount = useMemo(() => (typeof JournalStore !== 'undefined' ? JournalStore.count() : 0), [hlTick]);
  const journalStreak = useMemo(() => (typeof JournalStatsStore !== 'undefined' ? (JournalStatsStore.get().currentStreak || 0) : 0), [hlTick]);
```

---

## 3. LibraryScreen — Journal tile entry (un-ghost it)

**Find:**

```js
      id: 'journal',
      eyebrow: 'Coming Soon',
      title: 'Journal',
      detail: 'Daily reflections',
      placeholder: true,
      icon: React.createElement("svg", { viewBox: "0 0 24 24" },
        React.createElement("path", { d: "M19 4H8a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h11z" }),
        React.createElement("line", { x1: "9", y1: "9", x2: "16", y2: "9" }),
        React.createElement("line", { x1: "9", y1: "13", x2: "16", y2: "13" })
      )
    },
```

**Replace with:**

```js
      id: 'journal',
      eyebrow: 'My Journal',
      title: 'Journal',
      detail: journalCount === 0
        ? 'No entries yet'
        : (journalCount + (journalCount === 1 ? ' entry' : ' entries') + (journalStreak > 0 ? ' · ' + journalStreak + '-day streak' : '')),
      onClick: onOpenJournal,
      icon: React.createElement("svg", { viewBox: "0 0 24 24" },
        React.createElement("path", { d: "M19 4H8a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h11z" }),
        React.createElement("line", { x1: "9", y1: "9", x2: "16", y2: "9" }),
        React.createElement("line", { x1: "9", y1: "13", x2: "16", y2: "13" })
      )
    },
```

---

## 4. Nav helpers — add after `goLibrary`

**Find:**

```js
  const goLibrary = () => {setNavOrigin({ screen, bookId, chapterNum, letterId, studyId, studyChapterId });setScreen("library");};
```

**Replace with:**

```js
  const goLibrary = () => {setNavOrigin({ screen, bookId, chapterNum, letterId, studyId, studyChapterId });setScreen("library");};
  // ── Journal nav helpers ──
  const [journalEntryId, setJournalEntryId] = useState(null);
  const goJournalHub = () => {setNavOrigin({ screen, bookId, chapterNum, letterId, studyId, studyChapterId });setScreen("journal-home");};
  const goJournalViewer = (eid) => {if (eid) {setJournalEntryId(eid);setScreen("journal-viewer");}};
  const goJournalEditor = (eid) => {if (eid) {setJournalEntryId(eid);setScreen("journal-editor");}};
  const createAndEditJournal = () => {
    if (typeof JournalStore === 'undefined') return;
    const e = JournalStore.add();
    setHlTick(t => t + 1);
    setJournalEntryId(e.id);
    setScreen("journal-editor");
  };
```

---

## 5. Screen render dispatches

**Find the `screen === "library"` block, ending with `}),`:**

```js
    screen === "library" && /*#__PURE__*/
    React.createElement(LibraryScreen, {
      onBack: goHome,
      onOpenNotes: goNotesIndex,
      onOpenLinks: goLinksIndex,
      onOpenBookmarks: goBookmarksIndex,
      onSearch: goSearch,
      onHistory: goHistory,
      historyEnabled: settings.historyEnabled !== false,
      hlTick: hlTick,
      theme: theme, onThemeChange: setTheme
    }),
```

**Replace with:**

```js
    screen === "library" && /*#__PURE__*/
    React.createElement(LibraryScreen, {
      onBack: goHome,
      onOpenNotes: goNotesIndex,
      onOpenLinks: goLinksIndex,
      onOpenBookmarks: goBookmarksIndex,
      onOpenJournal: goJournalHub,
      onSearch: goSearch,
      onHistory: goHistory,
      historyEnabled: settings.historyEnabled !== false,
      hlTick: hlTick,
      theme: theme, onThemeChange: setTheme
    }),

    screen === "journal-home" && typeof JournalHubScreen !== 'undefined' && /*#__PURE__*/
    React.createElement(JournalHubScreen, {
      onBack: () => setScreen('library'),
      onOpenEntry: (eid) => goJournalViewer(eid),
      onCreateEntry: createAndEditJournal,
      onSearch: goSearch,
      onHistory: goHistory,
      historyEnabled: settings.historyEnabled !== false,
      hlTick: hlTick, setHlTick: setHlTick,
      theme: theme, onThemeChange: setTheme
    }),

    screen === "journal-viewer" && typeof JournalViewerScreen !== 'undefined' && /*#__PURE__*/
    React.createElement(JournalViewerScreen, {
      entryId: journalEntryId,
      onBack: () => setScreen('journal-home'),
      onEdit: () => setScreen('journal-editor'),
      onNavigateToLink: (endpoint, meta) => {
        if (endpoint) {
          setNavOrigin({ screen: 'journal-viewer' });
          navigateToLink(endpoint, meta || { sourceLetterTitle: 'My Journal' });
        }
      },
      onOpenJournalEntry: (eid) => goJournalViewer(eid),
      onSearch: goSearch,
      onHistory: goHistory,
      historyEnabled: settings.historyEnabled !== false,
      hlTick: hlTick, setHlTick: setHlTick,
      theme: theme, onThemeChange: setTheme
    }),

    screen === "journal-editor" && typeof JournalEditorScreen !== 'undefined' && /*#__PURE__*/
    React.createElement(JournalEditorScreen, {
      entryId: journalEntryId,
      onBack: () => goJournalViewer(journalEntryId),
      onSearch: goSearch,
      onHistory: goHistory,
      historyEnabled: settings.historyEnabled !== false,
      hlTick: hlTick, setHlTick: setHlTick,
      theme: theme, onThemeChange: setTheme
    }),
```

---

## 6. Android back handler

**Find:**

```js
      if (s === "bookmarks-index") {setScreen("library");return "true";} else
      if (s === "library") {goHome();return "true";} else
```

**Replace with:**

```js
      if (s === "bookmarks-index") {setScreen("library");return "true";} else
      if (s === "journal-home") {setScreen("library");return "true";} else
      if (s === "journal-viewer") {setScreen("journal-home");return "true";} else
      if (s === "journal-editor") {goJournalViewer(journalEntryId);return "true";} else
      if (s === "library") {goHome();return "true";} else
```

---

## 7. Reading-dot exclude list

**Find:**

```js
!["matthew-ch", "bible-ch", "search", "garden-view", "settings", "history", "library", "notes-index", "links-index", "bookmarks-index", "about"].includes(screen)
```

**Replace with:**

```js
!["matthew-ch", "bible-ch", "search", "garden-view", "settings", "history", "library", "notes-index", "links-index", "bookmarks-index", "journal-home", "journal-viewer", "journal-editor", "about"].includes(screen)
```

---

## 8. Tab state validator (last 2 lines before `return s;`)

**Find:**

```js
    if (s.screen === "bible-study-index" && !s.studyId) s.screen = "studies-home";
    return s;
  }
```

**Replace with:**

```js
    if (s.screen === "bible-study-index" && !s.studyId) s.screen = "studies-home";
    // Journal screens require entryId which lives in local state (not tab
    // state), so they can't be reliably restored on reload. Bounce to hub.
    if (s.screen === "journal-viewer" || s.screen === "journal-editor") s.screen = "journal-home";
    return s;
  }
```

---

## 9. Inbound sheet state + bridge

**Find:**

```js
  useEffect(() => { window.__bookmarkCreate = (info) => setBookmarkCreatePending(info || null); return () => { delete window.__bookmarkCreate; }; }, []);
```

**Replace with:**

```js
  useEffect(() => { window.__bookmarkCreate = (info) => setBookmarkCreatePending(info || null); return () => { delete window.__bookmarkCreate; }; }, []);
  // Journal inbound sheet bridge — opened from JournalChip in NavButtons.
  const [inboundJournalPayload, setInboundJournalPayload] = useState(null);
  useEffect(() => {
    window.__openJournalInbound = (refKey, label) => setInboundJournalPayload(refKey ? { refKey, label } : null);
    return () => { delete window.__openJournalInbound; };
  }, []);
```

---

## 10. Inbound sheet render — above the BookmarkCreateSheet block

**Find:**

```js
    bookmarkCreatePending && React.createElement(BookmarkCreateSheet, {
```

**Replace with:**

```js
    inboundJournalPayload && typeof JournalInboundSheet !== 'undefined' && React.createElement(JournalInboundSheet, {
      refKey: inboundJournalPayload.refKey,
      resourceLabel: inboundJournalPayload.label,
      onClose: () => setInboundJournalPayload(null),
      onOpenEntry: (entry) => {
        setInboundJournalPayload(null);
        if (entry && entry.id) goJournalViewer(entry.id);
      }
    }),

    bookmarkCreatePending && React.createElement(BookmarkCreateSheet, {
```

---

## 11 (OPTIONAL — defer if React #31 errors recur). NavButtons chip prop

The journal inbound chip in NavButtons surfaces "N journal entries on this
letter" in the reading toolbar. It was the last polish item I tried to wire in
and **may interact with the pre-existing `[object CSS]` React #31 issue** noted
in `CLAUDE.md §21.3`. I'd recommend landing items 1-10 first, verifying clean
operation, and adding the chip in a separate follow-up.

When ready, the change is:

**NavButtons signature** (find):

```js
function NavButtons({ onSettings, onHistory, onSearch, theme, onThemeChange, reading, chapterBookmark, hlTick }) {
```

(replace) →

```js
function NavButtons({ onSettings, onHistory, onSearch, theme, onThemeChange, reading, chapterBookmark, hlTick, journalRefKey, journalRefLabel }) {
```

**NavButtons body** (find):

```js
    chapterBookmark && React.createElement(ChapterBookmarkBtn, { chapterBookmark: chapterBookmark, hlTick: hlTick }),
    React.createElement(ThemeBtn, { theme: theme, onThemeChange: onThemeChange }));
}
```

(replace) →

```js
    chapterBookmark && React.createElement(ChapterBookmarkBtn, { chapterBookmark: chapterBookmark, hlTick: hlTick }),
    journalRefKey && typeof JournalChip !== 'undefined' && React.createElement(JournalChip, {
      refKey: journalRefKey,
      hlTick: hlTick,
      label: journalRefLabel,
      onClick: function(rk, lbl) { if (typeof window.__openJournalInbound === 'function') window.__openJournalInbound(rk, lbl); }
    }),
    React.createElement(ThemeBtn, { theme: theme, onThemeChange: onThemeChange }));
}
```

Then in **LetterView's NavButtons callsite** (find):

```js
      React.createElement(NavButtons, { onSettings: onSettings, onHistory: onHistory, onSearch: onSearch, theme: theme, onThemeChange: onThemeChange, reading: true,
        chapterBookmark: letter ? { hlKey: 'letter:' + letter.id, label: letter.title || 'Letter bookmark' } : null,
        hlTick: hlTick })
```

(replace) →

```js
      React.createElement(NavButtons, { onSettings: onSettings, onHistory: onHistory, onSearch: onSearch, theme: theme, onThemeChange: onThemeChange, reading: true,
        chapterBookmark: letter ? { hlKey: 'letter:' + letter.id, label: letter.title || 'Letter bookmark' } : null,
        journalRefKey: (typeof jrnRefKeyForLetterByLabel === 'function') ? jrnRefKeyForLetterByLabel(volumeLabel || 'Volume Two', letter && letter.id) : null,
        journalRefLabel: letter && letter.title,
        hlTick: hlTick })
```

And **BibleChapterView's NavButtons callsite** (find):

```js
      React.createElement(NavButtons, { onSettings: onSettings, onHistory: onHistory, onSearch: onSearch, theme: theme, onThemeChange: onThemeChange, reading: true,
        chapterBookmark: (book && chapter) ? { hlKey: 'bible:' + book.id + ':' + chapter.num, label: (book.title || book.id) + ' ' + chapter.num } : null,
        hlTick: hlTick })
```

(replace) →

```js
      React.createElement(NavButtons, { onSettings: onSettings, onHistory: onHistory, onSearch: onSearch, theme: theme, onThemeChange: onThemeChange, reading: true,
        chapterBookmark: (book && chapter) ? { hlKey: 'bible:' + book.id + ':' + chapter.num, label: (book.title || book.id) + ' ' + chapter.num } : null,
        journalRefKey: (book && chapter && typeof jrnRefKeyForChapter === 'function') ? jrnRefKeyForChapter(book.id, chapter.num) : null,
        journalRefLabel: (book && chapter) ? ((book.title || book.id) + ' ' + chapter.num) : null,
        hlTick: hlTick })
```

---

## Verification (do this after applying)

Hard-reload the app in the preview, then:

```js
({
  modules: {
    JournalStore: typeof JournalStore,            // 'object'
    JournalHubScreen: typeof JournalHubScreen,    // 'function'
    JournalChip: typeof JournalChip,              // 'function'
    JournalIndexStore: typeof JournalIndexStore,  // 'object'
    JournalMediaStore: typeof JournalMediaStore,  // 'object'
  },
  stylesInjected: !!document.getElementById('jrn-styles')  // true
})
```

Then via UI:

1. Home → Library — Journal tile reads "No entries yet"
2. Click Journal — Hub renders with empty state, FAB visible bottom-right
3. Tap FAB → editor opens with a fresh entry
4. Type title + body → debounced "Saved" indicator
5. Toolbar → Insert → "Letter or chapter card" → search "wide path" → tap result
   → letter card appears as a block in the editor
6. Back → viewer renders the entry with the letter card embed
7. Tap embedded letter card → navigates to the actual letter with single-shot
   back-pill "Back to My Journal · <entry title>"
8. (After applying item 11) Inbound chip in letter nav shows badge "1"

All of that was verified end-to-end during development before the
clobbering issue forced me to stop wiring.

---

## File inventory — the segregated module set

```
app/src/main/assets/src/
├── styles/journal-styles.js                    195 lines  CSS injection
├── stores/journal-media-store.js               190 lines  IndexedDB blobs
├── stores/journal-stats-store.js               140 lines  streaks + milestones
├── stores/journal-index-store.js               120 lines  reverse-link index
├── stores/journal-store.js                     200 lines  entries CRUD + journal-notebook store
├── data/journal-helpers.js                     260 lines  block model + source resolvers
├── ui/sheets/JournalRecordingSheet.js          230 lines  audio capture UI
├── ui/sheets/JournalInsertSheet.js             230 lines  + button menu + pickers
├── ui/sheets/JournalNotebookSheet.js           120 lines  notebook assign/manage
├── ui/sheets/JournalInboundSheet.js             60 lines  inbound entries list
├── ui/screens/JournalHubScreen.js              330 lines  hub w/ tabs, stats, notebooks
├── ui/screens/JournalViewerScreen.js           290 lines  read-only viewer + block renderer
├── ui/screens/JournalEditorScreen.js           320 lines  block-based editor
└── renderer/dom-journal-chip.js                 75 lines  inbound chip component
                                              ─────────
                                              ~2760 lines total
```

Plus `journal-scaffolding.html` (clickable UI demo, 65 KB) at repo root.
