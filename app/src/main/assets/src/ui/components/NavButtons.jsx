/* ═══════════════════════════════════════════════════════════════════════
   NavButtons — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

/* `hide` drops individual icons: ['settings'|'history'|'search'|'theme'].
   Settings/About/History used to hand-copy these SVGs inline purely to omit
   one button. The title strings below are load-bearing — the Settings
   visibility toggles select on them (`.nav-search-btn[title="Search"]`,
   `[title="History"]`, app.css ~434-447). Do NOT reword or normalise them.

   C2-C [C8]: each button also carries an EXPLICIT aria-label with the same
   word. These three were the only icon buttons in the top nav naming
   themselves through `title` alone: a title is a last-resort fallback in the
   accessible-name computation, it is not announced by every AT, and it never
   appears on touch — where this app lives. The label is the name; the title
   stays exactly as it is because CSS reads it. */
export function NavButtons({ onSettings, onHistory, onSearch, theme, onThemeChange, reading, chapterBookmark, hide }) {
  const off = (k) => !!(hide && hide.indexOf(k) !== -1);
  return (
    <>
      {off('settings') ? null : (
      <button className="settings-gear-btn" onClick={onSettings} title="Settings" aria-label="Settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      )}
      {off('history') ? null : (
      <button className={reading ? "nav-search-btn nav-history-reading" : "nav-search-btn"} onClick={onHistory} title="History" aria-label="History">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 .49-5.01" />
        </svg>
      </button>
      )}
      {off('search') ? null : (
      <button className="nav-search-btn" onClick={onSearch} title="Search" aria-label="Search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
      )}
      {chapterBookmark && <ChapterBookmarkBtn chapterBookmark={chapterBookmark} />}
      {off('theme') ? null : <ThemeBtn theme={theme} onThemeChange={onThemeChange} />}
    </>
  );
}
