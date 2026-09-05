/* ═══════════════════════════════════════════════════════════════════════
   TourPrompt — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The quiet strip at the foot of Home that offers "Show me around" once,
   after About: Show me around · Maybe later · Don't show this again. A few
   hundred bytes on the boot path; the tour itself (TourOverlay) rides the
   lazy bundle-e and is loaded by TourController.start().

   Shows only when TourController.shouldPrompt says so: Home, About seen,
   the durable flag unset, the tour not running, and not after Maybe later
   this launch. Nothing is dimmed and nothing is trapped: it is a strip, not
   a dialog — a reader who ignores it loses nothing.
   ═══════════════════════════════════════════════════════════════════════ */

export function TourPrompt({ screen }) {
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
  if (!ctl || !ctl.shouldPrompt({ screen })) return null;
  return (
    <div className="tour-prompt" role="region" aria-labelledby="tour-prompt-title">
      <h2 className="tour-prompt-title" id="tour-prompt-title">New here?</h2>
      <p className="tour-prompt-text">Let me show you around: six short stops, about two minutes.</p>
      <div className="tour-row">
        <button type="button" className="tour-btn primary" onClick={() => ctl.start('prompt')}>Show me around</button>
        <button type="button" className="tour-btn" onClick={() => ctl.dismissPrompt('later')}>Maybe later</button>
      </div>
      <button type="button" className="tour-never" onClick={() => ctl.dismissPrompt('never')}>Don&rsquo;t show this again</button>
    </div>
  );
}
