/* ═══════════════════════════════════════════════════════════════════════
   useSwipeNav — horizontal swipe to navigate between entries/chapters
   ═══════════════════════════════════════════════════════════════════════ */

const SWIPE_MIN_DX = 60;
const SWIPE_MAX_DY = 45;

export function swipeDir(dx, dy) {
  if (Math.abs(dx) > SWIPE_MIN_DX && Math.abs(dy) < SWIPE_MAX_DY) return dx < 0 ? 1 : -1;
  return 0;
}

export function useSwipeNav(onNext, onPrev) {
  const touch = React.useRef({ x: 0, y: 0 });
  return {
    onTouchStart(e) {
      if (e.touches.length !== 1) { touch.current.x = NaN; return; }
      // NAV4: ignore a swipe that BEGINS on a tappable element — a drag started on a
      // link, footnote/scripture ref, or an annotation icon is interaction, not a
      // page swipe; flipping the chapter/letter under it is jarring. (Plain text and
      // plain highlights still swipe; a NaN start makes onTouchEnd bail.)
      const t = e.target;
      if (t && t.closest && t.closest('a, button, input, textarea, select, .fn-ref, .inline-scrip-ref, .verse-link-icon, .inline-bookmark-icon, .hl-note-icon')) {
        touch.current.x = NaN;
        return;
      }
      touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    onTouchEnd(e) {
      const s = touch.current;
      if (isNaN(s.x) || e.changedTouches.length !== 1) return;
      if (window.getSelection && String(window.getSelection())) return;
      const dir = swipeDir(e.changedTouches[0].clientX - s.x, e.changedTouches[0].clientY - s.y);
      if (dir > 0) onNext(); else if (dir < 0) onPrev();
    },
  };
}
