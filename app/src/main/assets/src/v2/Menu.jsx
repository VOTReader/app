/* Menu - the laptop's ... menu (design's D6, dz15; main's MoreMenu): anchored under its button by the caller's CSS (.menu
   inside a .col.anc / .panel.anc), no scrim, no title, no Cancel. A press outside it (not on its button, whose own click
   toggles it), Escape, a scroll outside it or a resize closes it; Escape and Tab-away hand focus back as APG's menu button
   does (Escape to the button). ArrowUp / ArrowDown / Home / End move between its items, wrapping. Items are the
   caller's: any [role=menuitem | menuitemradio | menuitemcheckbox] inside, best given tabIndex={-1}. Now playing's ...
   (2f, readalong) and the reading pages' ... (1h, 5g, myweb) share it. */

const ITEMS = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';

/** The menu's items that can take focus, in order. @param {HTMLElement | null} menu @returns {HTMLElement[]} */
function itemsOf(menu) {
  if (!menu) return [];
  return /** @type {HTMLElement[]} */ ([...menu.querySelectorAll(ITEMS)])
    .filter((el) => !(/** @type {any} */ (el).disabled) && el.getAttribute('aria-disabled') !== 'true');
}

/**
 * @param {{ label: string, anchorRef: { current: HTMLElement | null }, onClose: () => void, className?: string,
 *   zone?: string, focusFirst?: boolean, children?: any }} props
 *   focusFirst moves focus to the first item on open (a gate boot that draws the menu open passes false: no ring)
 */
export function Menu({ label, anchorRef, onClose, className = '', zone = 'menu', focusFirst = true, children }) {
  const ref = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  React.useEffect(() => {
    const menu = ref.current;
    if (focusFirst) { const first = itemsOf(menu)[0]; if (first) first.focus(); }
    const inside = (t) => !!(menu && t instanceof Node && menu.contains(t));
    const onDown = (e) => {
      const anchor = anchorRef.current;
      if (inside(e.target) || (anchor && e.target instanceof Node && anchor.contains(e.target))) return;
      closeRef.current();
    };
    const onScroll = (e) => { if (!inside(e.target)) closeRef.current(); };
    const onResize = () => closeRef.current();
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      closeRef.current();
      if (anchorRef.current) anchorRef.current.focus();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchorRef, focusFirst]);
  const onKeyDown = (e) => {
    if (e.key === 'Tab') { closeRef.current(); return; }
    const list = itemsOf(ref.current);
    if (!list.length) return;
    const at = list.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    let to = -1;
    if (e.key === 'ArrowDown') to = at < 0 ? 0 : (at + 1) % list.length;
    else if (e.key === 'ArrowUp') to = at < 0 ? list.length - 1 : (at - 1 + list.length) % list.length;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = list.length - 1;
    if (to >= 0) { e.preventDefault(); list[to].focus(); }
  };
  return (
    <div ref={ref} className={'menu' + (className ? ' ' + className : '')} role="menu" aria-label={label} data-zone={zone}
      onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}
