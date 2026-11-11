/* ═══════════════════════════════════════════════════════════════════════
   RootNav — the top bar of the three tab roots (the layout pass, 2026-11-10)
   ═══════════════════════════════════════════════════════════════════════
   Read, Listen and Library share one bar (mocks read.png, listen.png,
   library.png): the place's name, Search, the Tabs button (ScreenLayout
   draws it) and the Settings gear. No Back (a root is the top), no About
   (it lives in Settings > Help) and no ⋯ menu (its items have homes: plans
   and history in the Library, theme and text size in Settings).

   The gear is its own class, not .settings-gear-btn: the compact bar and
   the "Settings Gear" switch hide that one everywhere, and on a root the
   gear is the only way to Settings.

     <ScreenLayout root navChildren={rootNavStart({ title, onSearch })} navEnd={<RootGear onSettings={...} />}>
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * The bar's start: the name, then Search (hidden with Search switched off, as everywhere: body.no-search).
 * @param {{ title: string, onSearch?: () => void }} props
 */
export function rootNavStart({ title, onSearch }) {
  return (
    <>
      <h1 className="root-title">{title}</h1>
      {onSearch ? (
        <button type="button" className="nav-search-btn" onClick={onSearch} title="Search" aria-label="Search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      ) : null}
    </>
  );
}

/** The Settings gear after Tabs, the app's own gear drawing (NavButtons). @param {{ onSettings: () => void }} props */
export function RootGear({ onSettings }) {
  return (
    <button type="button" className="root-gear-btn" onClick={onSettings} title="Settings" aria-label="Settings">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>
  );
}
