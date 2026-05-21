/* ═══════════════════════════════════════════════════════════════════════
   LibraryScreen — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

export function LibraryScreen({ onBack, onOpenNotes, onOpenLinks, onOpenBookmarks, onOpenJournal, onOpenHighlights, hlTick, theme, onThemeChange, onSearch, onHistory, onSettings, historyEnabled }) {
  const noteCount = React.useMemo(() => NoteStore.count(), [hlTick]);
  const linkCount = React.useMemo(() => LinkStore.all().length, [hlTick]);
  const bookmarkCount = React.useMemo(() => (typeof BookmarkStore !== 'undefined' ? BookmarkStore.count() : 0), [hlTick]);
  const journalCount = React.useMemo(() => (typeof JournalStore !== 'undefined' ? JournalStore.count() : 0), [hlTick]);
  // Distinct highlight/underline groups (notes excluded — they have their
  // own hub). Counts groupIds so a multi-paragraph mark is one mark.
  const highlightCount = React.useMemo(() => {
    if (typeof AnnotationStore === 'undefined') return 0;
    const data = AnnotationStore.all() || {};
    const seen = {};
    Object.keys(data).forEach(k => (data[k] || []).forEach(a => {
      if (a.kind === 'highlight' || a.kind === 'underline') seen[a.groupId || a.id] = 1;
    }));
    return Object.keys(seen).length;
  }, [hlTick]);
  const noteDetail = noteCount === 0 ? 'No notes yet' : (noteCount + (noteCount === 1 ? ' note' : ' notes'));
  const linkDetail = linkCount === 0 ? 'No links yet' : (linkCount + (linkCount === 1 ? ' link' : ' links'));

  const tiles = [
    {
      id: 'notes',
      eyebrow: 'My Notes',
      title: 'Notes',
      detail: noteDetail,
      onClick: onOpenNotes,
      icon: React.createElement("svg", { viewBox: "0 0 24 24" },
        React.createElement("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }),
        React.createElement("polyline", { points: "14 2 14 8 20 8" }),
        React.createElement("line", { x1: "8", y1: "13", x2: "16", y2: "13" }),
        React.createElement("line", { x1: "8", y1: "17", x2: "16", y2: "17" })
      )
    },
    {
      id: 'links',
      eyebrow: 'My Links',
      title: 'Links',
      detail: linkDetail,
      onClick: onOpenLinks,
      icon: React.createElement("svg", { viewBox: "0 0 24 24" },
        React.createElement("path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }),
        React.createElement("path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" })
      )
    },
    {
      id: 'journal',
      eyebrow: 'My Journal',
      title: 'Journal',
      detail: journalCount === 0
        ? 'No entries yet'
        : journalCount + (journalCount === 1 ? ' entry' : ' entries'),
      onClick: onOpenJournal,
      icon: React.createElement("svg", { viewBox: "0 0 24 24" },
        React.createElement("path", { d: "M19 4H8a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h11z" }),
        React.createElement("line", { x1: "9", y1: "9", x2: "16", y2: "9" }),
        React.createElement("line", { x1: "9", y1: "13", x2: "16", y2: "13" })
      )
    },
    {
      id: 'bookmarks',
      eyebrow: 'My Bookmarks',
      title: 'Bookmarks',
      detail: bookmarkCount === 0 ? 'No bookmarks yet' : (bookmarkCount + (bookmarkCount === 1 ? ' bookmark' : ' bookmarks')),
      onClick: onOpenBookmarks,
      icon: React.createElement("svg", { viewBox: "0 0 24 24" },
        React.createElement("path", { d: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" })
      )
    },
    {
      id: 'highlights',
      eyebrow: 'My Marks',
      title: 'Highlights & Underlines',
      detail: highlightCount === 0 ? 'No marks yet' : (highlightCount + (highlightCount === 1 ? ' mark' : ' marks')),
      onClick: onOpenHighlights,
      icon: React.createElement("svg", { viewBox: "0 0 24 24" },
        React.createElement("path", { d: "M9 11l-4 4 4 4 11-11-4-4-7 7" }),
        React.createElement("line", { x1: "13", y1: "7", x2: "17", y2: "11" })
      )
    }
  ];

  return React.createElement(ScreenLayout, {
    navChildren: LibraryNav({ onBack: onBack, onSearch: onSearch, onHistory: onHistory, onSettings: onSettings, theme: theme, onThemeChange: onThemeChange })
  },
    React.createElement("div", { className: "library-screen" },
      React.createElement("div", { className: "library-eyebrow" }, "Personal Study"),
      React.createElement("h1", { className: "library-title" }, "Library"),
      React.createElement("p", { className: "library-sub" }, "Your collected notes, reflections, and saved passages."),
      React.createElement("div", { className: "library-grid" },
        tiles.map(t => React.createElement("button", {
          key: t.id,
          className: "library-tile" + (t.placeholder ? ' placeholder' : ''),
          onClick: t.placeholder ? undefined : t.onClick,
          disabled: t.placeholder
        },
          React.createElement("span", { className: "library-tile-icon" }, t.icon),
          React.createElement("span", { className: "library-tile-eyebrow" }, t.eyebrow),
          React.createElement("span", { className: "library-tile-title" }, t.title),
          React.createElement("span", { className: "library-tile-detail" }, t.detail),
          !t.placeholder && React.createElement("span", { className: "library-tile-arrow" }, "›")
        ))
      )
    )
  );
}
