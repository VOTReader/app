/* ═══════════════════════════════════════════════════════════════════════
   ScripturesHome — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

export function ScripturesHome({ onSelect, onGenre, onBack, onSearch, onHistory, onSettings, theme, onThemeChange, onMatthewStudy, layout }) {
  const handleTile = (group) => {
    if (group.single) {onSelect(group.books[0].id, true);} else
    onGenre(group.id);
  };
  const handleBook = (id) => {onSelect(id);};
  const allGenres = [...SCRIPTURE_GENRES.ot, ...SCRIPTURE_GENRES.nt];
  const allBooks = allGenres.flatMap((g) => g.books);

  const navBar = /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/
  React.createElement("button", { className: "nav-home", onClick: onBack }, "\u2190 Home"), /*#__PURE__*/
  React.createElement(NavButtons, { onSettings: onSettings, onHistory: onHistory, onSearch: onSearch, theme: theme, onThemeChange: onThemeChange })
  );

  const hero = /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/
  React.createElement("div", { className: "home-eyebrow" }, "New King James Version"), /*#__PURE__*/
  React.createElement("h1", { className: "home-title" }, "The Scriptures of Truth"), /*#__PURE__*/
  React.createElement("div", { className: "home-ornament" }, /*#__PURE__*/
  React.createElement("div", { className: "home-ornament-line" }), /*#__PURE__*/
  React.createElement("div", { className: "home-ornament-diamond" }), /*#__PURE__*/
  React.createElement("div", { className: "home-ornament-line r" })
  )
  );

  /* ── GENRE GRID (default) ── */
  if (layout === "genre" || !layout) return (/*#__PURE__*/
    React.createElement(ScreenLayout, { navChildren: navBar }, /*#__PURE__*/
    React.createElement("div", { className: "home-screen scriptures-landing" },
    hero, /*#__PURE__*/
    React.createElement("div", { className: "genre-columns" }, /*#__PURE__*/
    React.createElement("div", { className: "genre-col genre-col-stretch" }, /*#__PURE__*/
    React.createElement("div", { className: "genre-col-label" }, "Old Testament"),
    SCRIPTURE_GENRES.ot.map((g) => {
      const totalCh = g.books.reduce((s, b) => s + (BOOKS[b.id]?.chapters.length || 0), 0);
      const bookCount = g.books.length;
      const bookLabel = `${bookCount} ${bookCount === 1 ? "Book" : "Books"}`;
      return (/*#__PURE__*/
        React.createElement("button", { key: g.id, className: "genre-tile", onClick: () => handleTile(g) }, /*#__PURE__*/
        React.createElement("div", { className: "genre-tile-title" }, g.label), /*#__PURE__*/
        React.createElement("div", { className: "genre-tile-sub" }, bookLabel, " \xB7 ", totalCh, " Chapters")
        ));

    })
    ), /*#__PURE__*/
    React.createElement("div", { className: "genre-col genre-col-stretch" }, /*#__PURE__*/
    React.createElement("div", { className: "genre-col-label" }, "New Testament"),
    SCRIPTURE_GENRES.nt.map((g) => {
      const totalCh = g.books.reduce((s, b) => s + (BOOKS[b.id]?.chapters.length || 0), 0);
      const bookCount = g.books.length;
      const bookLabel = `${bookCount} ${bookCount === 1 ? "Book" : "Books"}`;
      return (/*#__PURE__*/
        React.createElement("button", { key: g.id, className: "genre-tile", onClick: () => handleTile(g) }, /*#__PURE__*/
        React.createElement("div", { className: "genre-tile-title" }, g.label), /*#__PURE__*/
        React.createElement("div", { className: "genre-tile-sub" }, bookLabel, " \xB7 ", totalCh, " Chapters")
        ));

    })
    )
    )
    )
    ));


  /* ── COMPACT LIST ── */
  if (layout === "compact") return (/*#__PURE__*/
    React.createElement(ScreenLayout, { navChildren: navBar }, /*#__PURE__*/
    React.createElement("div", { className: "home-screen" },
    hero, /*#__PURE__*/
    React.createElement("div", { className: "compact-list" },
    [
    { label: "Old Testament", genres: SCRIPTURE_GENRES.ot },
    { label: "New Testament", genres: SCRIPTURE_GENRES.nt }].
    map((section) => /*#__PURE__*/
    React.createElement(React.Fragment, { key: section.label }, /*#__PURE__*/
    React.createElement("div", { className: "compact-list-header", style: { fontSize: "0.65rem", color: "var(--gold)", marginTop: "0.8rem" } }, section.label),
    section.genres.map((g) => /*#__PURE__*/
    React.createElement("div", { key: g.id, className: "compact-list-group" }, /*#__PURE__*/
    React.createElement("div", { className: "compact-list-header" }, g.label),
    g.books.map((b) => /*#__PURE__*/
    React.createElement("button", { key: b.id, className: "compact-list-item", onClick: () => handleBook(b.id) }, /*#__PURE__*/
    React.createElement("span", { className: "compact-list-title" }, b.title), /*#__PURE__*/
    React.createElement("span", { className: "compact-list-detail" }, b.detail)
    )
    )
    )
    )
    )
    )
    )
    )
    ));


  /* ── BOOK GRID ── */
  if (layout === "grid") return (/*#__PURE__*/
    React.createElement(ScreenLayout, { navChildren: navBar }, /*#__PURE__*/
    React.createElement("div", { className: "home-screen" },
    hero, /*#__PURE__*/
    React.createElement("div", { className: "flat-grid" },
    allBooks.map((b) => /*#__PURE__*/
    React.createElement("button", { key: b.id, className: "flat-grid-card", onClick: () => handleBook(b.id) }, /*#__PURE__*/
    React.createElement("div", { className: "flat-grid-title" }, b.title), /*#__PURE__*/
    React.createElement("div", { className: "flat-grid-detail" }, b.detail)
    )
    )
    )
    )
    ));


  /* ── CANONICAL SCROLL ── */
  const otBooks = SCRIPTURE_GENRES.ot.flatMap((g) => g.books);
  const ntBooks = SCRIPTURE_GENRES.nt.flatMap((g) => g.books);
  let canonNum = 0;
  return (/*#__PURE__*/
    React.createElement(ScreenLayout, { navChildren: navBar }, /*#__PURE__*/
    React.createElement("div", { className: "home-screen" },
    hero, /*#__PURE__*/
    React.createElement("div", { className: "canon-scroll" }, /*#__PURE__*/
    React.createElement("div", { className: "canon-scroll-divider" }, "Old Testament"),
    otBooks.map((b) => {
      canonNum++;
      return (/*#__PURE__*/
        React.createElement("button", { key: b.id, className: "canon-card", style: { animationDelay: `${canonNum * 0.3 % 5}s` }, onClick: () => handleBook(b.id) }, /*#__PURE__*/
        React.createElement("span", { className: "canon-card-num" }, String(canonNum).padStart(2, "0")), /*#__PURE__*/
        React.createElement("div", { className: "canon-card-body" }, /*#__PURE__*/
        React.createElement("div", { className: "canon-card-title" }, b.title),
        CANON_SUBTITLES[b.id] && /*#__PURE__*/React.createElement("div", { className: "canon-card-sub" }, CANON_SUBTITLES[b.id]), /*#__PURE__*/
        React.createElement("div", { className: "canon-card-detail" }, b.detail)
        )
        ));

    }), /*#__PURE__*/
    React.createElement("div", { className: "canon-scroll-divider" }, "New Testament"),
    ntBooks.map((b) => {
      canonNum++;
      return (/*#__PURE__*/
        React.createElement("button", { key: b.id, className: "canon-card", style: { animationDelay: `${canonNum * 0.3 % 5}s` }, onClick: () => handleBook(b.id) }, /*#__PURE__*/
        React.createElement("span", { className: "canon-card-num" }, String(canonNum).padStart(2, "0")), /*#__PURE__*/
        React.createElement("div", { className: "canon-card-body" }, /*#__PURE__*/
        React.createElement("div", { className: "canon-card-title" }, b.title),
        CANON_SUBTITLES[b.id] && /*#__PURE__*/React.createElement("div", { className: "canon-card-sub" }, CANON_SUBTITLES[b.id]), /*#__PURE__*/
        React.createElement("div", { className: "canon-card-detail" }, b.detail)
        )
        ));

    })
    )
    )
    ));

}
