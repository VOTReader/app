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
