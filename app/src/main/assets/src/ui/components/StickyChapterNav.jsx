/* ═══════════════════════════════════════════════════════════════════════
   StickyChapterNav — Cluster D (esbuild bundle-d.js)
   The floating Previous / Next pair over the reading column. vot-ui 1b: the
   kit's floating control (a surface-1 disc with the float shadow, the kit's
   back / chev icons) instead of Cinzel glyphs on black glass with a gold ring.
   ═══════════════════════════════════════════════════════════════════════ */

import { UiIcon } from './UiIcon.jsx';

export function StickyChapterNav({ onPrev, onNext, prevDisabled, nextDisabled, prevLabel, nextLabel }) {
  return (
    <div className="chapter-nav-sticky">
      <button
        className="chapter-nav-sticky-arrow"
        disabled={!!prevDisabled}
        onClick={onPrev}
        title={prevLabel || "Previous"}
        aria-label={prevLabel || "Previous"}
      >
        <UiIcon name="back" />
      </button>
      <button
        className="chapter-nav-sticky-arrow"
        disabled={!!nextDisabled}
        onClick={onNext}
        title={nextLabel || "Next"}
        aria-label={nextLabel || "Next"}
      >
        <UiIcon name="chev" />
      </button>
    </div>
  );
}
