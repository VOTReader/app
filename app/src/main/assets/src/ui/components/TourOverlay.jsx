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

function _rect(el) {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
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

  // The ringed control, measured each frame while a stop is showing.
  const [rect, setRect] = React.useState(null);
  const [missing, setMissing] = React.useState(false);
  const targetRef = React.useRef(null);
  const descId = 'tour-desc';
  React.useEffect(() => {
    if (!active || !st.ready) return undefined;
    setRect(null); setMissing(false);
    let raf = 0, stopped = false, scrolled = false;
    const started = Date.now();
    let last = null;
    const detach = () => {
      const t = targetRef.current;
      if (t) { t.removeEventListener('click', onTargetClick); if (t.getAttribute('aria-describedby') === descId) t.removeAttribute('aria-describedby'); }
      targetRef.current = null;
    };
    function onTargetClick() { if (ctl && ctl.isPressing && ctl.isPressing()) return; detach(); if (ctl) ctl.targetPressed(); }
    const tick = () => {
      if (stopped) return;
      const el = step && step.target && ctl ? ctl.findTarget(step) : null;
      if (el !== targetRef.current) {
        detach();
        if (el) { targetRef.current = el; el.addEventListener('click', onTargetClick); el.setAttribute('aria-describedby', descId); }
      }
      if (el) {
        if (!scrolled) { scrolled = true; try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (_e) { /* jsdom */ } }
        const r = _rect(el);
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

  if (!active) return null;
  if (!st.ready) return <div className="tour-wait" role="status">One moment…</div>;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 360;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const p = TOUR_RING_PAD;
  const ring = rect ? { left: rect.left - p, top: rect.top - p, width: rect.width + 2 * p, height: rect.height + 2 * p } : null;
  const below = ring ? (ring.top + ring.height + 18 + 220 < vh || ring.top < vh / 2) : false;
  const cardStyle = ring
    ? (below ? { top: Math.round(ring.top + ring.height + 18) + 'px' } : { bottom: Math.round(vh - ring.top + 18) + 'px' })
    : { bottom: '16px' };
  const dims = ring ? [
    { left: 0, top: 0, width: vw, height: Math.max(0, ring.top) },
    { left: 0, top: ring.top + ring.height, width: vw, height: Math.max(0, vh - ring.top - ring.height) },
    { left: 0, top: ring.top, width: Math.max(0, ring.left), height: ring.height },
    { left: ring.left + ring.width, top: ring.top, width: Math.max(0, vw - ring.left - ring.width), height: ring.height },
  ] : [{ left: 0, top: 0, width: vw, height: vh }];
  const px = (n) => Math.round(n) + 'px';
  const first = st.index === 0;
  const primary = step.primary || 'Next';
  const hint = missing ? 'I could not find it on this screen. Press Next to go on.' : (step.tip || null);
  return (
    <>
      {dims.map((d, i) => (
        <div key={i} className="tour-dim" style={{ left: px(d.left), top: px(d.top), width: px(d.width), height: px(d.height) }} onClick={(e) => e.stopPropagation()} />
      ))}
      {ring && <div className="tour-ring" aria-hidden="true" style={{ left: px(ring.left), top: px(ring.top), width: px(ring.width), height: px(ring.height) }} />}
      {ring && <div className={'tour-arrow ' + (below ? 'up' : 'down')} aria-hidden="true" style={{ left: px(ring.left + ring.width / 2 - 10), top: below ? px(ring.top + ring.height + 18 - 20) : px(ring.top - 18) }} />}
      <div className="tour-card" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="tour-title" style={cardStyle}>
        <div className="tour-eyebrow">{step.eyebrow}</div>
        <h2 className="tour-title" id="tour-title">{step.title}</h2>
        <div aria-live="polite">
          <p className="tour-text" id={descId}>{step.text}</p>
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
