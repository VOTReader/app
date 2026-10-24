/* ═══════════════════════════════════════════════════════════════════════
   TourPrompt — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The quiet slim strip that offers "Show me around" once, after About,
   over Home or the first letter (where first run's Begin Reading lands):
   Show me around · Later · × (don't show this again). A few
   hundred bytes on the boot path; the tour itself (TourOverlay) ships in
   bundle-d too (it rode lazy bundle-e until lz1, 2026-10-13).

   Shows only when TourController.shouldPrompt says so: Home, About seen,
   the durable flag unset, the tour not running, and not within three days
   of Maybe later (TOUR_LATER_MS). Nothing is dimmed and nothing is trapped: it is a strip, not
   a dialog — a reader who ignores it loses nothing.
   ═══════════════════════════════════════════════════════════════════════ */

/** @param {{ screen: string, letterId?: string|null }} props */
export function TourPrompt({ screen, letterId }) {
  const ctl = typeof TourController !== 'undefined' ? TourController : null;
  React.useSyncExternalStore(
    React.useCallback((cb) => (ctl ? ctl.subscribe(cb) : () => {}), [ctl]),
    () => (ctl ? ctl.getVersion() : 0)
  );
  // The flag stores are bundle-b globals; subscribe so "Begin Reading" on About
  // (which sets AboutSeen) shows the strip on the very next render.
  const _about = typeof AboutSeenFlagStore !== 'undefined' ? AboutSeenFlagStore : null;
  const _done = typeof TourDoneFlagStore !== 'undefined' ? TourDoneFlagStore : null;
  React.useSyncExternalStore(
    React.useCallback((cb) => (_about ? _about.subscribe(cb) : () => {}), [_about]),
    () => (_about ? _about.getVersion() : 0)
  );
  React.useSyncExternalStore(
    React.useCallback((cb) => (_done ? _done.subscribe(cb) : () => {}), [_done]),
    () => (_done ? _done.getVersion() : 0)
  );
  const show = !!(ctl && ctl.shouldPrompt({ screen, letterId }));
  // The strip is fixed over the foot of Home, and on a 699 px phone it covers the last tile
  // (Settings) with nothing to scroll it clear (emulator, 2026-09-04). Like the player bar
  // (body.audio-bar-open), it declares itself: a body class and its measured height, and
  // app.css pads .screen-scroll by that much, so every tile can still be reached.
  const ref = React.useRef(/** @type {HTMLDivElement|null} */ (null));
  React.useLayoutEffect(() => {
    if (!show) return undefined;
    const root = document.documentElement;
    const measure = () => { const el = ref.current; const h = el ? el.getBoundingClientRect().height : 0; if (h) root.style.setProperty('--tour-prompt-h', Math.round(h) + 'px'); };
    document.body.classList.add('tour-prompt-open');
    measure();
    const ro = typeof ResizeObserver !== 'undefined' && ref.current ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(ref.current);
    return () => { if (ro) ro.disconnect(); document.body.classList.remove('tour-prompt-open'); root.style.removeProperty('--tour-prompt-h'); };
  }, [show]);
  if (!show) return null;
  return (
    <div className="tour-prompt tour-strip" role="region" aria-labelledby="tour-prompt-title" ref={ref}>
      {/* n115/n351 (A07.6): slim strip (Codex mockup lanes/myweb/out/id1/A/mockup/board-r1.png, variant C);
          the card it replaces was 215 px over Home's cards. The minutes come from the tour itself. */}
      <p className="tour-prompt-text" id="tour-prompt-title">
        <span className="tour-prompt-title">New here?</span> Take the {ctl.minutesWord()}-minute tour.
      </p>
      <button type="button" className="tour-btn primary" onClick={() => ctl.start('prompt')}>Show me around</button>
      {/* "Later" on screen; the name keeps the whole phrase (the visible word is inside it). */}
      <button type="button" className="tour-btn quiet" aria-label="Maybe later" onClick={() => ctl.dismissPrompt('later')}>Later</button>
      <button type="button" className="tour-never" aria-label="Don’t show this again" title="Don’t show this again" onClick={() => ctl.dismissPrompt('never')}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  );
}
