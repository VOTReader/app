/* ═══════════════════════════════════════════════════════════════════════
   tab-snap — a Tabs-screen card is the tab's own page (TABS1, 2026-11-11)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled with its callers (use-thumbnails in bundle-b,
   TabsOverview).

   WHY. The cards were html2canvas re-draws: a canvas painter that measures
   text itself, so letter-spacing, word gaps and the reading fonts came out
   wrong ("squeezed, blurred, the words run together"), a phone paid 0.5-2 s of
   main thread per picture (two per tab, one per theme), and each tab kept two
   150-400 KB JPEGs in IndexedDB (Corbin, 11-11: "high quality, identical,
   instant, not taking too much space on disk").

   WHAT. A snapshot is the reading area's OWN markup, copied out of the live
   DOM at the moment it stands (cloneNode: same elements, classes and inline
   styles), trimmed to one screen: every block that lies wholly outside the
   visible band becomes an empty spacer of its height, so the copy is a few
   KB of HTML. The card puts it back in a box the width of the live column
   and scales that box to the card. The browser lays it out with the app's own
   stylesheet, fonts and text size, so the text is the text (sharp at any
   pixel density), and the colours come from the theme's CSS variables, so a
   card is always in the CURRENT theme with no second picture and no recapture.
   The first block that starts on screen is the anchor: the card scrolls its
   copy so the anchor sits exactly where it sat live, whatever the spacers
   above it came to.

   The HTML is the app's own render (text escaped by the serializer); the
   copy drops scripts, media, frames and every on* handler, and the stored
   string goes through the same scrub when it is read back.
   ═══════════════════════════════════════════════════════════════════════ */

/** Shape version of a stored snapshot. */
export const SNAP_VERSION = 1;
/** CSS px kept beyond the visible band, above and below. */
const BAND_PAD = 64;
/** Recursion floor: deeper than this a block is copied whole. */
const MAX_DEPTH = 14;
/** Elements a snapshot never carries. */
const DROP = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'AUDIO', 'VIDEO', 'SOURCE', 'TRACK', 'NOSCRIPT', 'TEMPLATE', 'DIALOG']);
const XHTML = 'http://www.w3.org/1999/xhtml';
const BLOCKISH = /^(block|flex|grid|list-item|table|flow-root)$/;

/**
 * Remove what a copy must not carry from ONE element (not its children).
 * HTML ids go (a duplicate id would answer the live page's getElementById);
 * SVG ids stay (a gradient or a <use> inside the drawing points at them).
 * Annotation keys are renamed so no annotation pass or anchor lookup ever
 * finds a card instead of the page.
 * @param {Element} el
 */
export function scrubEl(el) {
  const attrs = el.attributes;
  for (let i = attrs.length - 1; i >= 0; i--) {
    const a = attrs[i];
    const n = a.name.toLowerCase();
    if (n.startsWith('on')
      || n === 'tabindex' || n === 'autofocus' || n === 'contenteditable' || n === 'accesskey'
      || (n === 'id' && el.namespaceURI === XHTML)
      || ((n === 'href' || n === 'src' || n === 'xlink:href' || n === 'action' || n === 'formaction') && /^\s*javascript:/i.test(a.value))) {
      el.removeAttribute(a.name);
    } else if (n.startsWith('data-hl-')) {
      el.removeAttribute(a.name);
      el.setAttribute('data-snap-' + n.slice(8), a.value);
    }
  }
  if (el.tagName === 'IMG') { el.setAttribute('loading', 'eager'); el.setAttribute('decoding', 'sync'); }
}

/** Scrub a whole copied subtree in place (drops DROP elements). @param {Element} root */
export function scrubTree(root) {
  const all = root.querySelectorAll('*');
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (DROP.has(el.tagName)) { el.remove(); continue; }
    scrubEl(el);
  }
}

/**
 * The live reading area to copy: the scroller of the column a screenshot
 * would show (never the Tabs screen's own layout, a pager peek or an inert
 * copy). Null when there is none (Scripture Web, a loading placeholder).
 * @returns {{ layout: Element, viewport: Element | null, scroller: HTMLElement, track: Element | null } | null}
 */
export function liveReadingArea() {
  if (typeof document === 'undefined') return null;
  const layouts = document.querySelectorAll('.screen-layout');
  for (let i = 0; i < layouts.length; i++) {
    const layout = layouts[i];
    if (layout.closest('.tabs-overview-layer, .pager-peek, [inert], .tab-snap')) continue;
    const viewport = layout.querySelector(':scope > .pager-viewport');
    const scroller = /** @type {HTMLElement | null} */ (viewport
      ? viewport.querySelector(':scope > .screen-scroll')
      : layout.querySelector(':scope > .screen-scroll'));
    if (!scroller || scroller.clientWidth < 16 || scroller.clientHeight < 16) continue;
    const track = scroller.querySelector(':scope > .pager-track');
    return { layout, viewport, scroller, track };
  }
  return null;
}

/**
 * Copy the live reading area as it stands.
 * @returns {{ v: number, html: string, w: number, h: number, top: number, st: number, at: number } | null}
 *   html: the markup (layout > [viewport >] scroller > [track >] page), w/h: the scroller's box in CSS px,
 *   top: the anchor's distance below the scroller's top edge, st: the live scrollTop (used when no anchor).
 */
export function snapLiveTab() {
  const area = liveReadingArea();
  return area ? snapArea(area) : null;
}

/**
 * Copy one reading area (the live one, or a tab drawn off screen by TabSnapDrawer, TABS6).
 * The band kept runs from the scroller's top to at least one column width below it (TABS6): a card is wider than it
 * is tall in landscape and on a tablet, and the page under the first screen is what fills its picture to the bottom.
 * @param {{ layout: Element, viewport: Element | null, scroller: HTMLElement, track: Element | null }} area
 * @returns {{ v: number, html: string, w: number, h: number, top: number, st: number, at: number }}
 */
export function snapArea({ layout, viewport, scroller, track }) {
  const sr = scroller.getBoundingClientRect();
  const bandTop = sr.top - BAND_PAD;
  const bandBot = sr.top + Math.max(scroller.clientHeight, scroller.offsetWidth) + BAND_PAD;
  const anchor = { el: /** @type {Element | null} */ (null), top: 0 };

  // `frozen`: inside an absolute, fixed or sticky box (a stuck title bar): never the anchor, whose job is to say
  // where the FLOW was on screen.
  /** @param {Element} live @param {number} depth @param {boolean} frozen @returns {Element} */
  const copy = (live, depth, frozen) => {
    const c = /** @type {Element} */ (live.cloneNode(false));
    scrubEl(c);
    const cs = getComputedStyle(live);
    const d = cs.display;
    // Children of a block (or column-flex) flow can turn into spacers without moving their siblings
    // sideways; in a row, a grid or inline content they are copied whole.
    const flowParent = d === 'block' || d === 'flow-root' || d === 'list-item'
      || ((d === 'flex' || d === 'inline-flex') && cs.flexDirection.indexOf('column') === 0);
    for (let n = live.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) { c.appendChild(n.cloneNode(false)); continue; }
      if (n.nodeType !== 1) continue;
      const el = /** @type {Element} */ (n);
      if (DROP.has(el.tagName)) continue;
      const ccs = getComputedStyle(el);
      const pos = ccs.position;
      const r = el.getBoundingClientRect();
      const outside = r.bottom < bandTop || r.top > bandBot;
      if (outside && (pos === 'absolute' || pos === 'fixed')) continue;   // takes no room in the flow
      if (outside && flowParent && BLOCKISH.test(ccs.display)) {
        const sp = document.createElement('div');
        sp.setAttribute('style', `height:${r.height}px;margin:${ccs.marginTop} 0 ${ccs.marginBottom};padding:0;border:0`);
        c.appendChild(sp);
        continue;
      }
      const held = frozen || pos === 'absolute' || pos === 'fixed' || pos === 'sticky';
      if (!anchor.el && !held && r.height > 0 && r.top >= sr.top - 1) {
        anchor.top = r.top - sr.top;
        anchor.el = el;
      }
      if (depth < MAX_DEPTH && el.childElementCount > 0 && BLOCKISH.test(ccs.display)) {
        const sub = copy(el, depth + 1, held);
        if (anchor.el === el) sub.setAttribute('data-snap-anchor', '');
        c.appendChild(sub);
      } else {
        const whole = /** @type {Element} */ (el.cloneNode(true));
        scrubEl(whole);
        scrubTree(whole);
        if (anchor.el === el) whole.setAttribute('data-snap-anchor', '');
        c.appendChild(whole);
      }
    }
    return c;
  };

  const shell = (/** @type {Element} */ el) => { const c = /** @type {Element} */ (el.cloneNode(false)); scrubEl(c); return c; };
  const page = copy(track || scroller, 0, false);
  let root = page;
  if (track) { const sc = shell(scroller); sc.appendChild(page); root = sc; }
  if (viewport) { const vp = shell(viewport); vp.appendChild(root); root = vp; }
  const ly = shell(layout);
  ly.appendChild(root);
  return {
    v: SNAP_VERSION,
    html: ly.outerHTML,
    w: Math.round(scroller.offsetWidth),
    h: Math.round(scroller.clientHeight),
    top: Math.round(anchor.top * 100) / 100,
    st: Math.round(scroller.scrollTop),
    at: Date.now(),
  };
}

/**
 * A stored value read back: a well-formed snapshot (its markup scrubbed again), else null.
 * @param {any} v
 */
export function readSnap(v) {
  if (!v || typeof v !== 'object' || v.v !== SNAP_VERSION || typeof v.html !== 'string' || !v.html
    || !(v.w > 0) || !(v.h > 0)) return null;
  if (typeof document === 'undefined') return v;
  const t = document.createElement('template');
  t.innerHTML = v.html;
  scrubTree(/** @type {any} */ (t.content));
  const html = Array.from(t.content.childNodes).map((n) => (n.nodeType === 1 ? /** @type {Element} */ (n).outerHTML : '')).join('');
  return html ? { ...v, html } : null;
}

/**
 * Draw a snapshot into a card's picture box: the copy at the live column's
 * width, scaled to the box, scrolled so its anchor sits where it sat live.
 * It fills the box edge to edge (TABS6): the width by the scale, the height by
 * letting the copy's column run on below the first screen as far as the box
 * reaches (with room added at the end, so a page read to its bottom keeps the
 * place it had on screen). Synchronous (a layout effect calls it, so the first
 * painted frame has it).
 * @param {HTMLElement} box
 * @param {{ html: string, w: number, h: number, top: number, st: number }} snap
 * @returns {boolean} false when the box has no width yet
 */
export function paintSnap(box, snap) {
  const bw = box.clientWidth;
  if (!bw) return false;
  const s = bw / snap.w;
  const tall = Math.max(snap.h, Math.ceil(box.clientHeight / s));
  const page = document.createElement('div');
  page.className = 'tab-snap-page';
  page.style.width = snap.w + 'px';
  page.style.setProperty('--snap-h', tall + 'px');
  page.style.transform = `scale(${s})`;
  page.innerHTML = snap.html;
  box.replaceChildren(page);
  const sc = /** @type {HTMLElement | null} */ (page.querySelector('.screen-scroll'));
  if (!sc) return true;
  if (tall > snap.h) {
    const room = document.createElement('div');
    room.className = 'tab-snap-room';
    room.style.height = (tall - snap.h) + 'px';
    sc.appendChild(room);
  }
  const a = page.querySelector('[data-snap-anchor]');
  if (a) {
    const off = (a.getBoundingClientRect().top - sc.getBoundingClientRect().top) / s + sc.scrollTop;
    sc.scrollTop = Math.max(0, off - snap.top);
  } else {
    sc.scrollTop = snap.st || 0;
  }
  return true;
}
