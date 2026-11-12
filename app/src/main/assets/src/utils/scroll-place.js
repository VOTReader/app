/* ═══════════════════════════════════════════════════════════════════════
   scroll-place — where a saved reading place puts a column (TABS2, 2026-11-11)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module, bundled where it is imported (use-scroll-memory, ScreenLayout).

   ONE rule for the two things that put a page at its saved place: the live restore (use-scroll-memory startRestore)
   and the swipe neighbour that slides in (ScreenLayout's inert peek, and the pager re-placing it as a drag begins).
   They were two copies; the peek's lacked the header rule below and landed a page left near its top up to ~30 px
   off the place the turn then restored, which read as the page jumping at release.

   A saved record is { y, pct, anchorKey, anchorOff } (or a legacy number). The content anchor (its data-hl-key
   element) wins: the same verse or paragraph goes back to the top, whatever reflowed above it. A NEGATIVE offset on
   the FIRST content element means the top sat in the header (hero, meta), whose height at capture need not be its
   height now, so the pixel y wins there. No anchor element (not rendered yet, or gone): the pixel y.
   ═══════════════════════════════════════════════════════════════════════ */

/** @param {{ width: number, height: number }} r */
export function hasBox(r) { return r.width > 0 || r.height > 0; }

/**
 * Content-coordinate y of an anchor element's top, or null when it is not in the column or has no box now.
 * @param {Element | null} el @param {string | null} anchorKey @returns {number | null}
 */
export function anchorContentTop(el, anchorKey) {
  if (!el || !anchorKey) return null;
  const anchor = el.querySelector('[data-hl-key="' + String(anchorKey).replace(/"/g, '\\"') + '"]');
  if (!anchor) return null;
  const r = anchor.getBoundingClientRect();
  if (!hasBox(r)) return null;
  return (r.top - el.getBoundingClientRect().top) + el.scrollTop;
}

/**
 * Is `anchorKey` the first laid-out data-hl-key element of the column (nothing but the header above it)?
 * @param {Element | null} el @param {string} anchorKey @returns {boolean}
 */
export function isFirstContent(el, anchorKey) {
  const list = el ? el.querySelectorAll('[data-hl-key]') : [];
  for (let i = 0; i < list.length; i++) {
    if (hasBox(list[i].getBoundingClientRect())) return list[i].getAttribute('data-hl-key') === anchorKey;
  }
  return false;
}

/**
 * The scrollTop a saved place gives this column now, and whether the content anchor decided it.
 * @param {Element | null} el
 * @param {any} saved  { y, anchorKey, anchorOff } | number | null
 * @returns {{ y: number, anchored: boolean }}
 */
export function placeTarget(el, saved) {
  const legacyY = saved == null ? 0 : (typeof saved === 'number' ? saved : (typeof saved.y === 'number' ? saved.y : 0));
  const anchorKey = saved && typeof saved === 'object' ? (saved.anchorKey || null) : null;
  const anchorOff = saved && typeof saved === 'object' && typeof saved.anchorOff === 'number' ? saved.anchorOff : 0;
  const aTop = anchorContentTop(el, anchorKey);
  if (aTop != null) {
    if (anchorOff < 0 && isFirstContent(el, anchorKey)) return { y: legacyY, anchored: true };
    return { y: Math.max(0, Math.round(aTop + anchorOff)), anchored: true };
  }
  return { y: legacyY, anchored: false };
}

/**
 * Tell the column's own parts (the mini title band) that a restorer just put it at a place, so they draw for that
 * place in this frame rather than a frame late. Synchronous.
 * @param {Element | null} el
 */
export function announcePlaced(el) {
  try { if (el && typeof Event === 'function') el.dispatchEvent(new Event('vot:placed')); } catch (_e) { /* never block a restore */ }
}
