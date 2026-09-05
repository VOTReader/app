/* ═══════════════════════════════════════════════════════════════════════
   TourOverlay — Cluster E (esbuild bundle-e.js, lazy)
   ═══════════════════════════════════════════════════════════════════════
   "Show me around", drawn over the real screen: four dim panes around the
   ringed control (not one sheet with a hole — so the control itself still
   takes the tap and nothing else does), a gold ring 8 px outside it, and a
   card of plain words beside it. Everything it says comes from
   utils/tour-steps.js; everything it does goes through TourController
   (bundle-b, a free global here like every cross-bundle ref in this
   cluster). It reads that store with useSyncExternalStore and renders
   nothing while the tour is off.

   ACCESSIBILITY (the reason this is its own component and not a div soup):
     - role="dialog" aria-modal, labelled by the stop's title; useFocusTrap
       keeps Tab inside and returns focus on close; the stop text sits in an
       aria-live="polite" region so a screen reader hears each stop without
       a focus jump.
     - useModalRegistry: Escape and Android Back mean Skip through the app's
       ONE dispatcher (use-android-back); no listener of its own.
     - The ringed control keeps its own name and gains aria-describedby
       pointing at the card's sentence while it is ringed.
     - Type is the app's rem ladder (--fs-*), so Text Size scales it; buttons
       are 48 px; colours are tokens; no animation to turn off.

   FINDING THE CONTROL: the stop's screen is mounted by the app after the
   stop's `enter` ran, so the target may arrive a frame or two later. A short
   rAF loop (bounded by TARGET_WAIT_MS) looks for it, scrolls it into view
   once, and then re-measures every frame while the stop is showing so the
   ring follows scroll and resize. Not found in time → no ring, an honest
   hint, and Next still works.
   ═══════════════════════════════════════════════════════════════════════ */

const TOUR_RING_PAD = 8;
const TARGET_WAIT_MS = 3000;
/* The target is scrolled into view whenever it is off screen during this window after the stop
   opens, not once: the one-shot scroll lost to the new screen's scroll-memory reset (scrollTop = 0
   a few frames after mount) and left Export below the fold on a 699 px phone (emulator-5554,
   2026-09-04). After the window the reader's own scrolling is left alone, but a target that leaves
   the screen while the scroller's scrollTop has NOT moved was pushed by a layout shift, not the
   reader (a Settings group above Export finishing its mount, +456 px, emulator at 1.8, 2026-09-04),
   and is brought back whenever that happens. */
const RESCROLL_WINDOW_MS = 2500;
const RESCROLL_EVERY_MS = 300;
/* The card's height before it has been measured (jsdom never measures): the clamp below keeps
   the whole card on screen at this estimate, and at the real height once ResizeObserver reports. */
const CARD_EST_H = 220;
const CARD_EDGE = 12;
const CARD_GAP = 18;
/* At a large text size the card is taller than the room beside the ring (603 px on a 699 px phone at
   1.8), so it is capped to what is left once the ring has its place and scrolls inside itself, with
   the button row stuck to its bottom edge (app.css .tour-row). The ringed control stays visible and
   tappable; below this floor the card wins and covers the ring's far edge instead. */
const CARD_MIN_H = 160;
/* LISTEN STOPS DOCK. While the tour is showing a highlight, the highlight is the brightest thing on
   the screen and nothing sits over the text (Corbin, on his phone, 2026-09-04: the lit sentence was
   under the card and under the dim). So a press stop's card sits on the bottom edge, above the player
   bar when it is up, never beside the ring; and once Listen has been pressed the dim panes leave the
   reading column open from the top of its scroller down to the card, with no ring: the words are the
   ring. The card takes at most DOCK_MAX_FRAC of the screen, and less when the player bar is up, so
   that at least DOCK_OPEN_FRAC of the screen stays open above it (on the emulator at 1.8x, 2026-09-04:
   36 % of 699 above a 100 px bar left 48 % open and the lit sentence wrapped under the card). While
   docked, the card declares itself to the reading column as scroll-padding-bottom, which read-along's
   follow band (ReadAlongHighlight) and the engine's scrollIntoView both measure against. */
const DOCK_MAX_FRAC = 0.36;
const DOCK_OPEN_FRAC = 0.55;

function _rect(el) {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}
/** The nearest scrolling ancestor, or null. */
function _scrollerEl(el) {
  let e = el && el.parentElement;
  while (e && e !== document.body) {
    try {
      const st = getComputedStyle(e);
      if (/(auto|scroll)/.test(st.overflowY) && e.scrollHeight > e.clientHeight) return e;
    } catch (_e) { break; }
    e = e.parentElement;
  }
  return null;
}
/** The top edge of the nearest scrolling ancestor: the highest a scrolled-to-start target can sit. */
function _scrollerTop(el) {
  const s = _scrollerEl(el);
  return s ? Math.max(0, s.getBoundingClientRect().top) : 0;
}
function _sameRect(a, b) {
  return !!a && !!b && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}

export function TourOverlay({ waitMs = TARGET_WAIT_MS } = {}) {
  const ctl = typeof TourController !== 'undefined' ? TourController : null;
  React.useSyncExternalStore(
    React.useCallback((cb) => (ctl ? ctl.subscribe(cb) : () => {}), [ctl]),
    () => (ctl ? ctl.getVersion() : 0)
  );
  const st = ctl ? ctl.getState() : { active: false };
  const step = st.step;
  const active = !!(ctl && st.active);
  const trapRef = useFocusTrap(active && st.ready);
  useModalRegistry({ id: 'tour', dismiss: () => { if (ctl) ctl.skip(); }, active });

  // The card element (its measured height feeds the placement below and the scroll choice above).
  const cardRef = React.useRef(/** @type {HTMLElement|null} */ (null));
  // The ringed control, measured each frame while a stop is showing.
  const [rect, setRect] = React.useState(null);
  const [missing, setMissing] = React.useState(false);
  // The player bar's top edge while it is up (the docked card sits above it), else null.
  const [barTop, setBarTop] = React.useState(/** @type {number|null} */ (null));
  const targetRef = React.useRef(null);
  // The top of the target's scroller, kept from the last frame that had a target: the reader's own
  // tap on Listen detaches the target for a frame, and the opened column must not blink.
  const scrollerTopRef = React.useRef(0);
  // The target's scroller itself, for the same reason: the docked card's scroll-padding lives on it.
  const scrollerRef = React.useRef(/** @type {HTMLElement|null} */ (null));
  const descId = 'tour-desc';
  React.useEffect(() => {
    if (!active || !st.ready) return undefined;
    setRect(null); setMissing(false);
    let raf = 0, stopped = false, scrolled = false, lastScroll = 0, seenTop = null;
    const started = Date.now();
    // lastBar starts undefined, never null: the first reading of a stop must reach state even when
    // it is "no bar", or the bar the previous stop's playback raised would dock this stop's card
    // 70 px too high (e2e-tour, the Bible stop after Listen, 2026-09-04).
    let last = null, lastBar;
    const docked = !!(step && step.act === 'press');
    const detach = () => {
      const t = targetRef.current;
      if (t) { t.removeEventListener('click', onTargetClick); if (t.getAttribute('aria-describedby') === descId) t.removeAttribute('aria-describedby'); }
      targetRef.current = null;
    };
    function onTargetClick() { if (ctl && ctl.isPressing && ctl.isPressing()) return; detach(); if (ctl) ctl.targetPressed(); }
    const tick = () => {
      if (stopped) return;
      const el = step && step.target && ctl ? ctl.findTarget(step) : null;
      const bar = document.querySelector('.audio-bar');
      const bt = bar ? bar.getBoundingClientRect().top : null;
      if (bt !== lastBar) { lastBar = bt; setBarTop(bt); }
      if (el !== targetRef.current) {
        detach();
        if (el) { targetRef.current = el; el.addEventListener('click', onTargetClick); el.setAttribute('aria-describedby', descId); }
      }
      if (el) {
        const r = _rect(el);
        const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
        const off = r.top < 0 || r.top + r.height > vh;
        const now = Date.now();
        // The scroller's position the last time the target was on screen: unchanged and off = layout shift.
        const sc = _scrollerEl(el);
        if (sc) scrollerRef.current = sc;
        const scTop = sc ? sc.scrollTop : 0;
        const shifted = off && seenTop != null && scTop === seenTop;
        if (!off) seenTop = scTop;
        // Where the card would go: if it fits on neither side of the ring where the ring sits now,
        // but would below the ring once the ring is scrolled to the top of its screen (the tall
        // Listen card at a large text size), scroll it there instead of to the centre.
        const cardEl = cardRef.current;
        const ch = cardEl ? cardEl.getBoundingClientRect().height || CARD_EST_H : CARD_EST_H;
        const ringH = r.height + 2 * TOUR_RING_PAD;
        const fitsBelow = r.top - TOUR_RING_PAD + ringH + CARD_GAP + ch <= vh - CARD_EDGE;
        const fitsAbove = r.top - TOUR_RING_PAD - CARD_GAP - ch >= CARD_EDGE;
        const top0 = sc ? Math.max(0, sc.getBoundingClientRect().top) : 0;
        scrollerTopRef.current = top0;
        const fitsAtStart = top0 + ringH + CARD_GAP + ch + CARD_EDGE <= vh;
        const block = off ? 'center' : (!docked && !fitsBelow && !fitsAbove && fitsAtStart && r.top - TOUR_RING_PAD > top0 + 1 ? 'start' : null);
        if (!scrolled || (block && (now - started < RESCROLL_WINDOW_MS || shifted) && now - lastScroll >= RESCROLL_EVERY_MS)) {
          scrolled = true; lastScroll = now;
          try { el.scrollIntoView({ block: block || 'center', inline: 'nearest' }); } catch (_e) { /* jsdom */ }
        }
        if (!_sameRect(r, last)) { last = r; setRect(r); }
        if (missing) setMissing(false);
      } else if (step && step.target && Date.now() - started > waitMs) {
        if (last) { last = null; setRect(null); }
        setMissing(true);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { stopped = true; cancelAnimationFrame(raf); detach(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, st.ready, st.index, waitMs]);

  // The card's real height, so the clamp below can keep all of it (Skip and Next) on screen.
  const [cardH, setCardH] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => { const h = el.getBoundingClientRect().height; if (h) setCardH((prev) => (prev === h ? prev : h)); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active, st.ready, st.index, st.pressed]);
  const setCardEl = React.useCallback((el) => { cardRef.current = el; if (trapRef) trapRef.current = el; }, [trapRef]);

  // While a card is docked, the reading column's scroller carries the card's height as
  // scroll-padding-bottom (set from the geometry below, after each render; cleared when the card
  // leaves). Read-along's follow band then measures the room the reader can see.
  const dockPadRef = React.useRef(0);
  const padOnRef = React.useRef(/** @type {HTMLElement|null} */ (null));
  React.useEffect(() => {
    const s = active && dockPadRef.current > 0 ? scrollerRef.current : null;
    const prev = padOnRef.current;
    if (prev && prev !== s) { prev.style.scrollPaddingBottom = ''; padOnRef.current = null; }
    if (s) { const v = Math.round(dockPadRef.current) + 'px'; if (s.style.scrollPaddingBottom !== v) s.style.scrollPaddingBottom = v; padOnRef.current = s; }
  });
  React.useEffect(() => () => { const p = padOnRef.current; if (p) { p.style.scrollPaddingBottom = ''; padOnRef.current = null; } }, []);

  if (!active) return null;
  if (!st.ready) return <div className="tour-wait" role="status">One moment…</div>;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 360;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const p = TOUR_RING_PAD;
  const ring = rect ? { left: rect.left - p, top: rect.top - p, width: rect.width + 2 * p, height: rect.height + 2 * p } : null;
  // WHERE THE CARD GOES. Below the ring when it fits, else above when that fits, else on the side
  // with more room — and always clamped inside the viewport, over the ring's far edge if it must:
  // a card the reader cannot reach is a tour they cannot leave (Export at the bottom edge, and the
  // Letters tile at a large text size, both on a 699 px phone).
  // Room beside the ring, when the ring is on screen: the card is capped to it (see CARD_MIN_H).
  const ringOn = !!ring && ring.top >= 0 && ring.top + ring.height <= vh;
  const top0 = ringOn && targetRef.current ? _scrollerTop(targetRef.current) : 0;
  const docked = !!(step && step.act === 'press');
  dockPadRef.current = 0;
  const dockBottom = CARD_EDGE + (barTop != null && barTop > 0 && barTop < vh ? vh - barTop : 0);
  const cap = docked ? Math.max(CARD_MIN_H, Math.min(Math.round(vh * DOCK_MAX_FRAC), Math.floor(vh - dockBottom - vh * DOCK_OPEN_FRAC)))
    : ringOn ? Math.max(CARD_MIN_H, vh - top0 - ring.height - CARD_GAP - CARD_EDGE) : vh - 2 * CARD_EDGE;
  const h = Math.min(cardH || CARD_EST_H, cap);
  let below = false, cardTop = 0;
  if (docked) {
    cardTop = Math.max(CARD_EDGE, vh - dockBottom - h);
    dockPadRef.current = vh - cardTop;
  } else if (ring) {
    const fitsBelow = ring.top + ring.height + CARD_GAP + h <= vh - CARD_EDGE;
    const fitsAbove = ring.top - CARD_GAP - h >= CARD_EDGE;
    below = fitsBelow || (!fitsAbove && ring.top < vh / 2);
    cardTop = below ? ring.top + ring.height + CARD_GAP : ring.top - CARD_GAP - h;
    cardTop = Math.min(Math.max(cardTop, CARD_EDGE), Math.max(CARD_EDGE, vh - CARD_EDGE - h));
  }
  const clear = !docked && ring ? (cardTop >= ring.top + ring.height || cardTop + h <= ring.top) : false;
  const cardStyle = docked ? { bottom: Math.round(dockBottom) + 'px', maxHeight: Math.round(cap) + 'px' }
    : ring ? { top: Math.round(cardTop) + 'px', maxHeight: Math.round(cap) + 'px' } : { bottom: '16px' };
  // What the dims leave open: the ringed control, or, once Listen is pressed, the reading column
  // from the top of its scroller down to the card (the lit words are somewhere in it).
  const opened = docked && st.pressed;
  const winTop = opened ? (targetRef.current ? _scrollerTop(targetRef.current) : scrollerTopRef.current) : 0;
  const win = opened ? { left: 0, top: winTop, width: vw, height: Math.max(0, cardTop - winTop) } : ring;
  const dims = win ? [
    { left: 0, top: 0, width: vw, height: Math.max(0, win.top) },
    { left: 0, top: win.top + win.height, width: vw, height: Math.max(0, vh - win.top - win.height) },
    { left: 0, top: win.top, width: Math.max(0, win.left), height: win.height },
    { left: win.left + win.width, top: win.top, width: Math.max(0, vw - win.left - win.width), height: win.height },
  ] : [{ left: 0, top: 0, width: vw, height: vh }];
  const px = (n) => Math.round(n) + 'px';
  const first = st.index === 0;
  const primary = step.primary || 'Next';
  // After the tour (or the reader) pressed the ringed control, the card says what to look for.
  const text = st.pressed && step.after ? step.after : step.text;
  const hint = missing ? 'I could not find it on this screen. Press Next to go on.' : (st.pressed ? null : (step.tip || null));
  return (
    <>
      {dims.map((d, i) => (
        <div key={i} className="tour-dim" style={{ left: px(d.left), top: px(d.top), width: px(d.width), height: px(d.height) }} onClick={(e) => e.stopPropagation()} />
      ))}
      {ring && !opened && <div className="tour-ring" aria-hidden="true" style={{ left: px(ring.left), top: px(ring.top), width: px(ring.width), height: px(ring.height) }} />}
      {ring && clear && <div className={'tour-arrow ' + (below ? 'up' : 'down')} aria-hidden="true" style={{ left: px(ring.left + ring.width / 2 - 10), top: below ? px(cardTop - 20) : px(cardTop + h) }} />}
      <div className={'tour-card' + (docked ? ' docked' : '')} ref={setCardEl} role="dialog" aria-modal="true" aria-labelledby="tour-title" style={cardStyle}>
        <div className="tour-eyebrow">{step.eyebrow}</div>
        <h2 className="tour-title" id="tour-title">{step.title}</h2>
        <div aria-live="polite">
          <p className="tour-text" id={descId}>{text}</p>
          {hint && <p className="tour-tip">{hint}</p>}
        </div>
        <div className="tour-row">
          <button type="button" className="tour-btn quiet" aria-label="Leave the tour" onClick={() => ctl.skip()}>Skip</button>
          <span className="tour-sp" />
          <button type="button" className="tour-btn" aria-label="Previous stop" disabled={first} onClick={() => ctl.back()}>Back</button>
          <button type="button" className="tour-btn primary" data-autofocus onClick={() => ctl.next()}>{primary}</button>
        </div>
      </div>
    </>
  );
}
