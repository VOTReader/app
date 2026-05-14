function LibraryScreen({ onBack, onOpenNotes, hlTick, theme, onThemeChange, onSearch, onHistory, historyEnabled }) {
  const noteCount = useMemo(() => NoteStore.count(), [hlTick]);
  const detail = noteCount === 0 ? 'No notes yet' : (noteCount + (noteCount === 1 ? ' note' : ' notes'));

  const tiles = [
    {
      id: 'notes',
      eyebrow: 'My Notes',
      title: 'Notes',
      detail,
      onClick: onOpenNotes,
      icon: React.createElement("svg", { viewBox: "0 0 24 24" },
        React.createElement("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }),
        React.createElement("polyline", { points: "14 2 14 8 20 8" }),
        React.createElement("line", { x1: "8", y1: "13", x2: "16", y2: "13" }),
        React.createElement("line", { x1: "8", y1: "17", x2: "16", y2: "17" })
      )
    },
    {
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
    {
      id: 'bookmarks',
      eyebrow: 'Coming Soon',
      title: 'Bookmarks',
      detail: 'Saved passages',
      placeholder: true,
      icon: React.createElement("svg", { viewBox: "0 0 24 24" },
        React.createElement("path", { d: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" })
      )
    },
    {
      id: 'highlights',
      eyebrow: 'Coming Soon',
      title: 'Highlights & Underlines',
      detail: 'Browse all marks',
      placeholder: true,
      icon: React.createElement("svg", { viewBox: "0 0 24 24" },
        React.createElement("path", { d: "M9 11l-4 4 4 4 11-11-4-4-7 7" }),
        React.createElement("line", { x1: "13", y1: "7", x2: "17", y2: "11" })
      )
    }
  ];

  return React.createElement(ScreenLayout, {
    navChildren: React.createElement(React.Fragment, null,
      React.createElement("button", { className: "nav-home nav-back-icon", onClick: onBack, title: "Back", "aria-label": "Back" }, "‹"),
      React.createElement("button", { className: "nav-search-btn", onClick: onSearch, title: "Search" },
        React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6" },
          React.createElement("circle", { cx: "11", cy: "11", r: "8" }),
          React.createElement("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" })
        )
      ),
      historyEnabled !== false && React.createElement("button", { className: "nav-search-btn", onClick: onHistory, title: "History" },
        React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" },
          React.createElement("circle", { cx: "12", cy: "12", r: "9" }),
          React.createElement("polyline", { points: "12 7 12 12 15 15" })
        )
      ),
      React.createElement(ThemeBtn, { theme: theme, onThemeChange: onThemeChange })
    )
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
