/* SnapBox - draws a page snapshot (utils/tab-snap.js) in its box: a Tabs-screen card's picture, or the neighbour
   page that slides in under a swipe (TABS1, 2026-11-11). Painted in a layout effect, so the first frame that shows
   the box already shows the page. `lazy` (the Tabs screen with many cards): a card more than two screens away is
   painted as the list brings it near, before it can be seen. The box is inert: the copy's buttons and links take
   no focus and no tap. */
import { paintSnap } from '../../utils/tab-snap.js';

/** @param {{ snap: any, className?: string, lazy?: boolean }} props */
export function SnapBox({ snap, className = 'tab-snap', lazy = false }) {
  const ref = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  React.useLayoutEffect(() => {
    const box = ref.current;
    if (!box || !snap) return undefined;
    box.setAttribute('inert', '');
    if (!lazy || typeof IntersectionObserver === 'undefined') { paintSnap(box, snap); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); paintSnap(box, snap); }
    }, { rootMargin: '200% 0px' });
    io.observe(box);
    return () => io.disconnect();
  }, [snap, lazy]);
  return <div className={className} aria-hidden="true" ref={ref} />;
}
