/* ═══════════════════════════════════════════════════════════════════════
   MoreMenu — the top bar's "⋯" menu (Cluster D, esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   THE REDESIGN'S FIRST STRUCTURAL STEP (2026-09-25). The top bar carried
   six to eight equal-weight gold icons (back, home, settings, history,
   search, bookmark, theme, tabs). A UX walk of seven reader journeys ranked
   that the #1 friction — a newcomer cannot tell the icons apart — and all
   three directions of the Codex image mockups (D:/Swarm/calls/ux-0925/)
   folded them into one "more" menu. With settings.compactTopBar on (the
   default), Settings, History and the theme switch leave the bar
   (app.css `body.compact-topbar`) and live here, with names, beside a
   Text size stepper; Back, Home, Search, the bookmark and Tabs stay.

   ScreenLayout mounts the button at the end of every top bar. Its actions
   come from NavMenuContext, provided by ReadingChromeProvider (App owns the
   state; app.jsx is held to an 800-line canary, so it passes one `nav`
   prop there instead of wrapping another provider).

   Behaviour:
   - a dropdown portaled to <body>, anchored under the button's right edge;
   - registers with the modal registry while open, so Escape and Android
     Back close it and never navigate (the W1.5 single-dispatcher contract:
     this component does NOT listen for Escape itself);
   - closes on an outside press, a resize, a scroll of the page, or an
     action that leaves the screen (History, Settings); the theme and text
     size controls keep it open so the reader sees each change land;
   - ArrowUp / ArrowDown / Home / End move between items; focus goes to the
     first item on open and back to ⋯ when the menu is dismissed.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} NavMenuValue
 * @property {boolean} enabled          settings.compactTopBar !== false
 * @property {boolean} historyEnabled   settings.historyEnabled !== false
 * @property {string} theme             'dark' | 'light'
 * @property {(t: string) => void} onThemeChange
 * @property {() => void} onSettings
 * @property {() => void} onHistory
 * @property {string} fontScale         settings.fontScale ("1" = 100 %)
 * @property {(v: string) => void} onFontScale
 */

/** The ⋯ menu's actions and state (a NavMenuValue, or null outside the provider). */
export const NavMenuContext = React.createContext(/** @type {NavMenuValue | null} */ (null));

/** The Settings slider's range and the menu's step (SettingsScreen's TextSizeSliderRow: 0.8-3). */
export const MENU_SCALE_MIN = 0.8;
export const MENU_SCALE_MAX = 3;
export const MENU_SCALE_STEP = 0.1;

/**
 * The next text scale one step up or down, clamped to the slider's range and
 * rounded to two places so repeated steps never drift (1.1 + 0.1 = 1.2).
 * @param {string | number | undefined} current
 * @param {1 | -1} dir
 * @returns {string}
 */
export function stepFontScale(current, dir) {
  const v = parseFloat(String(current));
  const base = Number.isFinite(v) ? v : 1;
  const next = Math.min(MENU_SCALE_MAX, Math.max(MENU_SCALE_MIN, base + dir * MENU_SCALE_STEP));
  return String(Math.round(next * 100) / 100);
}

const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"]';

export function MoreMenuBtn() {
  const ctx = React.useContext(NavMenuContext);
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState(/** @type {{top:number,right:number}|null} */ (null));
  const btnRef = React.useRef(/** @type {HTMLButtonElement|null} */ (null));
  const menuRef = React.useRef(/** @type {HTMLDivElement|null} */ (null));

  const close = React.useCallback((/** @type {boolean} */ refocus) => {
    setOpen(false);
    if (refocus && btnRef.current) btnRef.current.focus();
  }, []);

  // Escape and Android Back reach the menu through the registry, never a listener of its own.
  useModalRegistry({ id: 'more-menu', dismiss: () => close(true), active: open });

  React.useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: Math.round(r.bottom + 6), right: Math.max(8, Math.round(window.innerWidth - r.right)) });
  }, [open]);

  // Focus the first item once the menu exists: it mounts one commit after `open`
  // (it waits for the button's position), so this keys on the position too.
  const placed = open && pos != null;
  React.useEffect(() => {
    if (!placed) return;
    const first = menuRef.current && menuRef.current.querySelector(ITEM_SELECTOR);
    if (first) /** @type {HTMLElement} */ (first).focus();
  }, [placed]);

  React.useEffect(() => {
    if (!open) return undefined;
    const onDown = (/** @type {Event} */ e) => {
      const t = /** @type {Node} */ (e.target);
      if (menuRef.current && menuRef.current.contains(t)) return;
      if (btnRef.current && btnRef.current.contains(t)) return;
      close(false);
    };
    // A resize re-anchors rather than closes: mobile browsers resize as their URL bar
    // slides, and a rotation keeps the same bar, so the menu follows its button.
    const onResize = () => {
      if (!btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: Math.round(r.bottom + 6), right: Math.max(8, Math.round(window.innerWidth - r.right)) });
    };
    const onScroll = (/** @type {Event} */ e) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      close(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', onResize);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open, close]);

  if (!ctx || !ctx.enabled) return null;

  const onKeyDown = (/** @type {any} */ e) => {
    // A disabled step button (text at its limit) cannot take focus, so it is not a stop.
    const items = menuRef.current
      ? /** @type {HTMLElement[]} */ ([...menuRef.current.querySelectorAll(ITEM_SELECTOR)])
          .filter((el) => !(/** @type {HTMLButtonElement} */ (el)).disabled)
      : [];
    if (!items.length) return;
    const at = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    let to = -1;
    if (e.key === 'ArrowDown') to = at < 0 ? 0 : (at + 1) % items.length;
    else if (e.key === 'ArrowUp') to = at < 0 ? items.length - 1 : (at - 1 + items.length) % items.length;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = items.length - 1;
    else if (e.key === 'Tab') { close(false); return; }
    if (to >= 0) { e.preventDefault(); items[to].focus(); }
  };

  /** Leave the screen: close first, then act (the next screen owns focus). */
  const go = (/** @type {() => void} */ fn) => () => { close(false); if (typeof fn === 'function') fn(); };
  const pct = Math.round(parseFloat(String(ctx.fontScale || '1')) * 100) || 100;
  const theme = ctx.theme === 'light' ? 'light' : 'dark';

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={'nav-more-btn' + (open ? ' open' : '')}
        onClick={() => setOpen((v) => !v)}
        title="More"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
        </svg>
      </button>
      {open && pos ? ReactDOM.createPortal(
        <div
          className="more-menu"
          role="menu"
          aria-label="More"
          ref={menuRef}
          style={{ top: pos.top + 'px', right: pos.right + 'px' }}
          onKeyDown={onKeyDown}
        >
          {ctx.historyEnabled ? (
            <button type="button" role="menuitem" className="more-menu-item" onClick={go(ctx.onHistory)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-5.01" />
              </svg>
              <span>History</span>
            </button>
          ) : null}
          <div className="more-menu-row" role="group" aria-label="Theme">
            <span className="more-menu-row-label">Theme</span>
            <span className="more-menu-seg">
              <button type="button" role="menuitemradio" aria-checked={theme === 'dark'} className={theme === 'dark' ? 'on' : ''}
                onClick={() => { if (theme !== 'dark') ctx.onThemeChange('dark'); }}>Dark</button>
              <button type="button" role="menuitemradio" aria-checked={theme === 'light'} className={theme === 'light' ? 'on' : ''}
                onClick={() => { if (theme !== 'light') ctx.onThemeChange('light'); }}>Light</button>
            </span>
          </div>
          <div className="more-menu-row" role="group" aria-label="Text size">
            <span className="more-menu-row-label">Text size</span>
            <span className="more-menu-step">
              <button type="button" role="menuitem" aria-label="Smaller text" disabled={pct <= MENU_SCALE_MIN * 100}
                onClick={() => ctx.onFontScale(stepFontScale(ctx.fontScale, -1))}>A−</button>
              <span className="more-menu-step-value" aria-live="polite">{pct === 100 ? 'Standard' : pct + '%'}</span>
              <button type="button" role="menuitem" aria-label="Larger text" disabled={pct >= MENU_SCALE_MAX * 100}
                onClick={() => ctx.onFontScale(stepFontScale(ctx.fontScale, 1))}>A+</button>
            </span>
          </div>
          <button type="button" role="menuitem" className="more-menu-item" onClick={go(ctx.onSettings)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Settings</span>
          </button>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
