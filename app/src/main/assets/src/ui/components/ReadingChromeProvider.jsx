/* ═══════════════════════════════════════════════════════════════════════
   ReadingChromeProvider — Cluster D (esbuild bundle-d.js)
   ───────────────────────────────────────────────────────────────────────
   One provider for the floating reading chrome that App owns but does not
   render: the resume-reading dot (top nav) and the autoscroll transport
   (portaled pill). Both need App-level state — the current screen, the
   reading position, user settings — and neither is worth its own wrapper
   in app.jsx, which is held to a hard 800-line canary.

   Contexts carry CONFIG only. Per-screen wiring (the scroll container, the
   pager descriptor) reaches AutoScrollControl as props from ScreenLayout,
   because that is where it exists.
   ═══════════════════════════════════════════════════════════════════════ */

import { ReadingDotContext } from './ResumeReadingNavBtn.jsx';
import { AutoScrollContext } from './AutoScrollControl.jsx';
import { clampLpm, clampEndDwell } from '../../hooks/use-autoscroll.js';

// The dwell clamp moved next to clampLpm in the transport module (the pill's
// own stepper needs it, and importing this file from there would be a cycle).
// Re-exported here because this is the seam everything else already imports.
export { clampEndDwell };

export function ReadingChromeProvider({ screen, dotEnabled, onGo, settings, updateSetting, children }) {
  const s = settings || {};
  // Deliberately un-memoized (carried over from app.jsx): goToLastRead reads
  // live nav state from its closure, and the sole consumer is one tiny button.
  const dotValue = { screen, enabled: !!dotEnabled, onGo };
  const autoValue = React.useMemo(() => ({
    enabled: !!s.autoScroll,
    speedLpm: clampLpm(s.autoScrollLpm),
    autoNext: !!s.autoScrollNext,
    endDwellMs: clampEndDwell(s.autoScrollEndMs),
    keepScreenOnPref: s.keepScreenOn !== false,
    onSpeedChange: (lpm) => { if (updateSetting) updateSetting('autoScrollLpm', String(lpm)); },
    // Same write-back shape for the dwell, so the countdown can be tuned from
    // the pill without a trip to Settings. Clamped here, not at the caller.
    onDwellChange: (ms) => { if (updateSetting) updateSetting('autoScrollEndMs', String(clampEndDwell(ms))); },
  }), [s.autoScroll, s.autoScrollLpm, s.autoScrollNext, s.autoScrollEndMs, s.keepScreenOn, updateSetting]);

  return (
    <ReadingDotContext.Provider value={dotValue}>
      <AutoScrollContext.Provider value={autoValue}>
        {children}
      </AutoScrollContext.Provider>
    </ReadingDotContext.Provider>
  );
}
