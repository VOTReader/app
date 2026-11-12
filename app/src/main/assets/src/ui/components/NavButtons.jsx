/* ═══════════════════════════════════════════════════════════════════════
   NavButtons — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { GearMenuBtn } from './GearMenu.jsx';

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
/* Where the Settings gear sits in the DOM. ScreenLayout provides { host } (its slot after the Tabs button) on every
   screen but a tab root, and the gear is drawn into it, so keyboard order on those screens is Back, Search, Tabs,
   gear (the top-bar rule, 2026-11-10) with no CSS `order`. With no provider (a test, a harness) the gear renders
   inline, first, as it always did. */
export const NavGearHost = React.createContext(null);

export function NavButtons({ onSettings, onHistory, onSearch, theme, onThemeChange, reading, chapterBookmark, hide }) {
  const off = (k) => !!(hide && hide.indexOf(k) !== -1);
  // GEAR1: the gear opens Quick settings (text size, theme, History, plans, Settings); Settings is its last row.
  const gear = off('settings') ? null : <GearMenuBtn className="settings-gear-btn" onSettings={onSettings} />;
  return (
    <>
      {/* a Consumer, not a hook: tests (and callers) invoke NavButtons(...) as a plain function */}
      <NavGearHost.Consumer>{(gearHost) => (gearHost ? (gearHost.host ? ReactDOM.createPortal(gear, gearHost.host) : null) : gear)}</NavGearHost.Consumer>
      {off('history') ? null : (
      <button className={reading ? "nav-search-btn nav-history-reading" : "nav-search-btn"} onClick={onHistory} title="History" aria-label="History">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 .49-5.01" />
        </svg>
      </button>
      )}
      {off('search') ? null : (
      <button className="nav-search-btn" onClick={onSearch} title="Search" aria-label="Search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
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
