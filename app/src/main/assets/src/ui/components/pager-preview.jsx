/* ═══════════════════════════════════════════════════════════════════════
   pager-preview — neighbor page shell for the finger-follow page swipe
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-d.js (imported by ScreenLayout).

   The neighbor page that PEEKS in during a swipe is the REAL screen component
   rendered inert (see ScreenLayout `inert` + each reading screen's pager.peek):
   identical UI, width, wrapping, hero, footnote bubbles, and inline
   highlight/note/link/bookmark icons — all present BEFORE the user releases and
   unchanged AFTER the swipe commits, with zero divergence, because the peek IS
   the same component the nav arrows commit to.

   This REPLACED an earlier approach — a parallel set of "inert preview"
   renderers (PreviewLetterBody / PreviewWtlbBody / PreviewVerses /
   PreviewInlineVerses) that re-implemented each screen's body MINUS its
   annotation hooks. That spoof could never stay pixel-identical to the live
   render (it dropped footnote bubbles + annotation icons, flattened sections,
   and capped content, so width/wrapping/inline-icons drifted and study notes
   "popped in" only after release). It was retired in favor of rendering the
   real screen inert; see ScreenLayout's `inert` branch for how a clone claims
   none of the app-wide singletons while still being painted by the same
   document-wide annotation pass (which keys per-element by data-hl-key, so the
   two panes stay isolated).

   This file now owns only:
     • PagerPeek            — the sliding `.pager-peek` shell that hosts either
                              the real inert screen (kind:'screen') or a
                              reading-chain boundary card (kind:'boundary').
     • resolveNeighborLetter — resolve a Letter/WTLB neighbor {id} → its full
                              corpus entry (the verse screens already hold full
                              neighbor chapter objects, so only the VOT letter /
                              WTLB screens need this).

   DOES NOT OWN: the gesture/transform (use-pager-gesture.js) or the pager DOM
   wiring (ScreenLayout.jsx).
   ═══════════════════════════════════════════════════════════════════════ */

// ── Neighbor resolution (Letter / WTLB) ─────────────────────────────────────
// Bible/Matthew screens already hold full neighbor chapter objects; only the
// VOT letter / WTLB screens need to resolve {id} → full entry from the
// in-memory corpus. COL_BY_KEY / colLetterArr / colPreface are cross-bundle
// globals (scripture-resolution.js). Returns null if not found (caller falls
// back to a boundary card).
export function resolveNeighborLetter(volKey, neighborId) {
  if (!volKey || !neighborId || typeof COL_BY_KEY === 'undefined') return null;
  const col = COL_BY_KEY.get(volKey);
  if (!col) return null;
  const arr = (typeof colLetterArr === 'function') ? colLetterArr(col) : [];
  const found = arr.find((l) => l.id === neighborId);
  if (found) return found;
  const pref = (typeof colPreface === 'function') ? colPreface(col) : null;
  return (pref && pref.id === neighborId) ? pref : null;
}

/* PagerPeek — the absolutely-positioned neighbor page that slides in during a
   swipe. ScreenLayout mounts ONE per side (the controller drives its transform
   via peekRef). `desc` is whatever the screen's pager.peek(side) returned:

     { kind:'screen',   el }             → the REAL neighbor screen, rendered
                                           inert (its own `.screen-scroll`)
     { kind:'boundary', eyebrow, title } → a reading-chain boundary card
                                           (e.g. "Previous Book · Genesis 50")
     null                                → dead end; ScreenLayout mounts no peek

   The HTML `inert` attribute (chrome108-native) + CSS pointer-events:none keep
   the clone fully non-interactive and out of the focus / a11y tree. */
export function PagerPeek({ side, desc, peekRef }) {
  // Callback ref: forward the element to the gesture controller's ref AND set the
  // HTML `inert` attribute imperatively. React 18 does NOT forward a JSX `inert`
  // prop (it's only a recognized prop from React 19), so set it on the node —
  // reliable in chrome108 (native) and in jsdom (setAttribute always reflects).
  // Memoized on peekRef (a stable useRef object) so it doesn't churn per render.
  const attach = React.useCallback((el) => {
    if (peekRef) peekRef.current = el;
    if (el) el.setAttribute('inert', '');
  }, [peekRef]);
  if (!desc) return null;
  if (desc.kind === 'boundary') {
    return (
      <div className={`pager-peek pager-peek-${side}`} aria-hidden="true" ref={attach}>
        <div className="pager-peek-boundary">
          <div className="bottom-nav-card">
            <div className="bottom-nav-label">{desc.eyebrow}</div>
            <div className="bottom-nav-title">{desc.title}</div>
          </div>
        </div>
      </div>
    );
  }
  // kind:'screen' — the real neighbor, rendered inert. desc.el already produces
  // its own `.screen-scroll` (via inert ScreenLayout); we only supply the shell.
  return (
    <div className={`pager-peek pager-peek-${side}`} aria-hidden="true" ref={attach}>
      {desc.el}
    </div>
  );
}
