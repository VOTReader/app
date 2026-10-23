/* ═══════════════════════════════════════════════════════════════════════
   RowMenu — a recording row's "⋯" (downloads brief 3a, picture 14)
   ═══════════════════════════════════════════════════════════════════════
   Download · 11 MB / Remove · 13 MB, Choose more…, Open the letter: the
   row's actions that do not start playback. A long-press on the row (the
   contextmenu event a phone raises for it) opens the same menu.

   It looks and behaves like the top bar's ⋯ (MoreMenu.jsx): a dropdown
   portaled to <body> under the button's right edge (above it when the row
   sits low on the screen), registered with the modal registry so Escape and
   Android Back close it, closed by an outside press or the reader scrolling,
   ArrowUp / ArrowDown / Home / End between items, focus on the first item on
   open and back on ⋯ when dismissed.
   ═══════════════════════════════════════════════════════════════════════ */

const ITEM_SELECTOR = '[role="menuitem"]';

/** @type {Record<string, any>} */
const ICONS = {
  download: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11" /><path d="M7 10.5l5 5 5-5" /><path d="M5 19.5h14" /></svg>,
  remove: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4.5 7h15" /><path d="M9.5 7V4.8h5V7" /><path d="M6.5 7l1 12.5h9l1-12.5" /></svg>,
  cancel: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M9 9l6 6M15 9l-6 6" /></svg>,
  choose: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6.5h9M4 12h6M4 17.5h6" /><path d="M13 15.5l2.5 2.5L20 13" /></svg>,
  open: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M12 6.5C9.8 5 7 4.6 3.5 5v13c3.5-.4 6.3 0 8.5 1.5 2.2-1.5 5-1.9 8.5-1.5V5c-3.5-.4-6.3 0-8.5 1.5z" /><path d="M12 6.5v13" /></svg>,
};

/** @typedef {{ id: string, text: string, icon: string, onSelect: () => void, disabled?: boolean }} RowMenuItem */

/**
 * @param {{ label: string, items: RowMenuItem[] }} props label names the row: "More for Christmas"
 */
export function RowMenu({ label, items }) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState(/** @type {{ top: number, left: number } | null} */ (null));
  const btnRef = React.useRef(/** @type {HTMLButtonElement | null} */ (null));
  const menuRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const id = React.useId();

  const close = React.useCallback((/** @type {boolean} */ refocus) => {
    setOpen(false);
    setPos(null);
    if (refocus && btnRef.current) btnRef.current.focus();
  }, []);
  useModalRegistry({ id: 'row-menu' + id, dismiss: () => close(true), active: open });

  const place = React.useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const h = menuRef.current ? menuRef.current.offsetHeight : 0;
    const w = menuRef.current ? menuRef.current.offsetWidth : 0;
    const below = Math.round(r.bottom + 6);
    // A row low on the screen opens its menu upward rather than under the bottom bar.
    const top = h && below + h > window.innerHeight - 8 && r.top - h - 6 >= 8 ? Math.round(r.top - h - 6) : below;
    // Its right edge under the button's, held 8 px inside the screen (a ⋯ left of centre would push it off the left).
    const left = Math.max(8, Math.min(Math.round(r.right - w), window.innerWidth - w - 8));
    setPos({ top, left });
  }, []);

  React.useLayoutEffect(() => { if (open) place(); }, [open, place]);
  // Once the menu has its height, flip it up if it would run off the bottom.
  const placed = open && pos != null;
  React.useLayoutEffect(() => { if (placed) place(); }, [placed, place]);
  React.useEffect(() => {
    if (!placed) return;
    const first = menuRef.current && menuRef.current.querySelector(ITEM_SELECTOR + ':not([disabled])');
    if (first) /** @type {HTMLElement} */ (first).focus();
  }, [placed]);

  React.useEffect(() => {
    if (!open) return undefined;
    const onDown = (/** @type {Event} */ e) => {
      const t = /** @type {Node} */ (e.target);
      if ((menuRef.current && menuRef.current.contains(t)) || (btnRef.current && btnRef.current.contains(t))) return;
      close(false);
    };
    // The reader's scroll closes it (a wheel or a touch drag), never the app's own scrollTop writes (MoreMenu, v022).
    const onUserScroll = (/** @type {Event} */ e) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      close(false);
    };
    const passive = { capture: true, passive: true };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', place);
    document.addEventListener('wheel', onUserScroll, passive);
    document.addEventListener('touchmove', onUserScroll, passive);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', place);
      document.removeEventListener('wheel', onUserScroll, true);
      document.removeEventListener('touchmove', onUserScroll, true);
    };
  }, [open, close, place]);

  if (!items.length) return null;

  const onKeyDown = (/** @type {any} */ e) => {
    const all = menuRef.current ? /** @type {HTMLButtonElement[]} */ ([...menuRef.current.querySelectorAll(ITEM_SELECTOR)]).filter((el) => !el.disabled) : [];
    if (!all.length) return;
    const at = all.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
    let to = -1;
    if (e.key === 'ArrowDown') to = at < 0 ? 0 : (at + 1) % all.length;
    else if (e.key === 'ArrowUp') to = at < 0 ? all.length - 1 : (at - 1 + all.length) % all.length;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = all.length - 1;
    else if (e.key === 'Tab') { close(false); return; }
    if (to >= 0) { e.preventDefault(); all[to].focus(); }
  };

  return (
    <>
      <button ref={btnRef} type="button" className={'row-menu-btn' + (open ? ' open' : '')} aria-haspopup="menu" aria-expanded={open}
        aria-controls={open ? 'row-menu' + id : undefined} aria-label={label} onClick={() => (open ? close(false) : setOpen(true))}>
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="18.5" cy="12" r="1.7" /></svg>
      </button>
      {open ? ReactDOM.createPortal(
        <div ref={menuRef} id={'row-menu' + id} className="more-menu row-menu" role="menu" aria-label={label} onKeyDown={onKeyDown}
          style={pos ? { top: pos.top, left: pos.left, right: 'auto' } : { visibility: 'hidden', top: 0, left: 8 }}>
          {items.map((it) => (
            <button key={it.id} type="button" role="menuitem" className="more-menu-item" disabled={!!it.disabled}
              onClick={() => { close(true); it.onSelect(); }}>
              {ICONS[it.icon] || null}<span>{it.text}</span>
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </>
  );
}

/**
 * A long-press on a row (a phone's contextmenu) or a right-click opens the row's ⋯ menu instead of the browser's.
 * @param {any} e the row's contextmenu event
 */
export function openRowMenu(e) {
  const btn = e.currentTarget && e.currentTarget.querySelector('.row-menu-btn');
  if (!btn || btn.getAttribute('aria-expanded') === 'true') return;
  e.preventDefault();
  btn.click();
}
