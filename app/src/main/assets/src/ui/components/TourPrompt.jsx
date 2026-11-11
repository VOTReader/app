/* ═══════════════════════════════════════════════════════════════════════
   TourPrompt — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The quiet card that offers "Show me around" once, after About, at the
   end of the Read tab (HomeScreen draws it; the UI pass, U §4, 2026-11-11):
   Show me around · Later · × (don't show this again). A few
   hundred bytes on the boot path; the tour itself (TourOverlay) ships in
   bundle-d too (it rode lazy bundle-e until lz1, 2026-10-13).

   Shows only when TourController.shouldPrompt says so: Home only, About seen,
   the durable flag unset, the tour not running, and not within three days
   of Maybe later (TOUR_LATER_MS). Nothing is dimmed and nothing is trapped: it is a card in the
   page, not a dialog and not a float — a reader who ignores it loses nothing.
   ═══════════════════════════════════════════════════════════════════════ */

const cap = (w) => String(w || '').charAt(0).toUpperCase() + String(w || '').slice(1);

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
  // The UI pass (U §4, W1 2026-11-11): the offer is an inline card at the END of the Read tab, in the page's own flow.
  // It never floats over a reader, a menu or a sheet, so it no longer marks the body or pads the scroller.
  if (!show) return null;
  return (
    <div className="tour-prompt tour-strip tour-inline" role="region" aria-labelledby="tour-prompt-title">
      {/* n115/n351 (A07.6): slim strip (Codex mockup lanes/myweb/out/id1/A/mockup/board-r1.png, variant C);
          the card it replaces was 215 px over Home's cards. The minutes come from the tour itself. */}
      {/* WS5 tour (tr-offer, mock settings.html): a gold "New here?" label with × at its right, the title,
          one meta line, then Show me around (primary) and Maybe later (text). */}
      <p className="ui-label tour-prompt-kicker">New here?</p>
      <p className="tour-prompt-text" id="tour-prompt-title">
        <span className="tour-prompt-title">Let me show you around</span>
        <span className="tour-prompt-meta">{cap(ctl.stopsWord())} short stops, about {ctl.minutesWord()} minutes.</span>
      </p>
      <div className="tour-row">
        <button type="button" className="tour-btn primary" onClick={() => ctl.start('prompt')}>Show me around</button>
        <button type="button" className="tour-btn quiet" onClick={() => ctl.dismissPrompt('later')}>Maybe later</button>
      </div>
      <button type="button" className="tour-never" aria-label="Don’t show this again" title="Don’t show this again" onClick={() => ctl.dismissPrompt('never')}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  );
}
