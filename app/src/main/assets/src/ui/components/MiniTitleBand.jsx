/* ═══════════════════════════════════════════════════════════════════════
   MiniTitleBand — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   THE PAGE NAMES ITSELF ONCE ITS HERO HAS GONE (search200 UX B10, mockup
   ux/mockups/1-sticky-title/PICK.png). A search hit lands mid-letter, and the
   screen named no letter: the hero with its title sat above, out of sight. Once
   the hero has scrolled up under the top bar (or under the "Back to" row hung
   below it), a band pinned there names the page in the hero's own words: its
   eyebrow ("Volume Three · Letter 17") over its title.

   - The band hangs from its host (`.mini-title-anchor`, a zero-height sticky
     row, or the sticky `.back-hint-row`) at the host's bottom edge, so it takes
     no room in the page and moves nothing when it shows.
   - It is no tap target and is aria-hidden: the h1 is the page's heading, and
     this is the same words again, for the eye. But shown, it takes the finger
     itself and does nothing with it (app.css `.mini-title.shown`, pointer-events
     auto): letting touches through opened a "Go to Scripture" card or a footnote
     it hid, and a long-press selected hidden text. Hidden, it lets them through.
   - It reads where the hero is with an IntersectionObserver on the reading
     column (the `.screen-scroll` it sits in), its top edge moved down to the
     band's own bottom (past the "Back to" row, which covers the hero first): it
     shows once what is left of the hero would sit behind it. It writes no scrollTop.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @param {{ heroRef: { current: Element | null }, eyebrow?: string, title?: string, pageKey?: string }} props
 *   heroRef: the page's `.hero`; pageKey: the page shown (a view kept mounted from one page to the next).
 */
export function MiniTitleBand({ heroRef, eyebrow = '', title = '', pageKey = '' }) {
  const bandRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    const band = bandRef.current;
    const hero = heroRef && heroRef.current;
    const IO = /** @type {any} */ (globalThis).IntersectionObserver;
    setShown(false);
    if (!band || !hero || typeof IO !== 'function') return undefined;
    const root = band.closest('.screen-scroll');
    const host = band.parentElement;
    // The line the hero must pass: the band's own bottom edge, under the chrome it hangs from
    // in the column (the "Back to" row; a zero-height anchor adds none). Once what is left of
    // the hero would sit behind the band, the band shows: a landing that left the hero's
    // last 10px under the "Back to" row named no page on screen. (The band lays out while
    // hidden, so its height is there to read.)
    const height = (/** @type {Element | null} */ n) => (n ? Math.max(0, Math.round(n.getBoundingClientRect().height)) : 0);
    const over = height(host) + height(band);
    const io = new IO((/** @type {any[]} */ entries) => {
      const e = entries[entries.length - 1];
      if (!e) return;
      const top = e.rootBounds ? e.rootBounds.top : over;
      // gone above, not below (a page that has not drawn its hero yet is not one read past)
      setShown(!e.isIntersecting && e.boundingClientRect.bottom <= top + 1);
    }, { root, rootMargin: '-' + (over + 1) + 'px 0px 0px 0px', threshold: 0 });
    io.observe(hero);
    return () => io.disconnect();
  }, [heroRef, pageKey]);
  return (
    <div ref={bandRef} className={'mini-title' + (shown ? ' shown' : '')} aria-hidden="true">
      {eyebrow ? <div className="mini-title-eyebrow">{eyebrow}</div> : null}
      <div className="mini-title-name">{title}</div>
    </div>
  );
}

/**
 * How much sits over the reading column's top edge once the hero has gone: the sticky
 * "Back to" row and this band under it. A jump that brings a paragraph to the top
 * (Answers' Contents) sets its scroll margin past both, or the band covers its first line.
 * @param {Element} el an element in the reading column
 */
export function stickyCover(el) {
  const col = (el && el.closest('.screen-scroll')) || document;
  const h = (/** @type {string} */ sel) => { const n = col.querySelector(sel); return n ? n.getBoundingClientRect().height : 0; };
  return h('.back-hint-row') + h('.mini-title');
}
