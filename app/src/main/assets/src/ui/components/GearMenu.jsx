/* ═══════════════════════════════════════════════════════════════════════
   GearMenu — the top bar's gear opens Quick settings (Cluster D, bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   GEAR1 (Corbin 2026-11-12). The gear in every bar that has one (a tab
   root's RootGear, the bar gear NavButtons draws, My Progress) used to go
   straight to Settings. It now opens a bottom sheet of the reader ⋯ sheet's
   last block (QuickSettings.jsx): Text size, Theme, then History, Reading
   plans and Settings. Settings is one more tap, from the sheet's last row.

   The sheet is the reader sheet's frame (.more-menu.rd-menu-sheet over
   .rd-menu-scrim), so it looks the same and the Theme switch sits the same
   distance from the bottom edge. Theme and Text size apply at once behind it
   and keep it open; a door out closes it, then goes.

   Behaviour:
   - registers with the global modal registry while open (a bundle-d sheet
     must use the free global, not an import), so Escape and Android Back
     close it and never leave the screen;
   - closes on a press outside it (the scrim) and on Tab out;
   - ArrowUp / ArrowDown / Home / End move between items; focus goes to the
     first item on open and back to the gear when it is dismissed.
   With no NavMenuContext (a unit test of a screen, a harness) the gear goes
   straight to Settings, as before.
   ═══════════════════════════════════════════════════════════════════════ */

import { NavMenuContext } from './MoreMenu.jsx';
import { QuickSettingsRows, QuickSettingsLive } from './QuickSettings.jsx';

const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"]';
export const QUICK_SETTINGS_LABEL = 'Quick settings';

/** The app's gear drawing (NavButtons, RootNav). */
export const GEAR_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

/**
 * The gear and its Quick settings sheet. `className` keeps each bar's own gear class (root-gear-btn,
 * settings-gear-btn, bar-action); `onSettings` is the screen's way to Settings (the sheet's Settings row).
 * @param {{ className: string, onSettings?: (() => void) | null }} props
 */
export function GearMenuBtn({ className, onSettings = null }) {
  const ctx = React.useContext(NavMenuContext);
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef(/** @type {HTMLButtonElement|null} */ (null));
  const menuRef = React.useRef(/** @type {HTMLDivElement|null} */ (null));

  const close = React.useCallback((/** @type {boolean} */ refocus) => {
    setOpen(false);
    if (refocus && btnRef.current) btnRef.current.focus();
  }, []);

  // Escape and Android Back reach the sheet through the registry, never a listener of its own.
  // (A screen's unit test may run without the global; the app always has it, so the call is stable either way.)
  const useRegistry = typeof useModalRegistry === 'function' ? useModalRegistry : () => {};
  useRegistry({ id: 'quick-settings', dismiss: () => close(true), active: open });

  React.useEffect(() => {
    if (!open) return undefined;
    const first = menuRef.current && menuRef.current.querySelector(ITEM_SELECTOR);
    if (first) /** @type {HTMLElement} */ (first).focus();
    const onDown = (/** @type {Event} */ e) => {
      const t = /** @type {Node} */ (e.target);
      if (menuRef.current && menuRef.current.contains(t)) return;
      if (btnRef.current && btnRef.current.contains(t)) return;
      close(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open, close]);

  if (!ctx || !ctx.enabled) {
    return (
      <button type="button" className={className} onClick={() => { if (onSettings) onSettings(); }} title="Settings" aria-label="Settings">
        {GEAR_ICON}
      </button>
    );
  }

  const onKeyDown = (/** @type {any} */ e) => {
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

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={className + (open ? ' open' : '')}
        onClick={() => setOpen((v) => !v)}
        title={QUICK_SETTINGS_LABEL}
        aria-label={QUICK_SETTINGS_LABEL}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {GEAR_ICON}
      </button>
      {open ? ReactDOM.createPortal(
        <>
          <div className="rd-menu-scrim" aria-hidden="true" />
          <div className="more-menu rd-menu-sheet quick-settings-sheet" role="menu" aria-label={QUICK_SETTINGS_LABEL}
            ref={menuRef} onKeyDown={onKeyDown}>
            <QuickSettingsRows ctx={ctx} go={go} onSettings={onSettings} />
          </div>
          <QuickSettingsLive fontScale={ctx.fontScale} />
        </>,
        document.body,
      ) : null}
    </>
  );
}
