/* ═══════════════════════════════════════════════════════════════════════
   StickyChapterNav — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

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
        {"‹"}
      </button>
      <button
        className="chapter-nav-sticky-arrow"
        disabled={!!nextDisabled}
        onClick={onNext}
        title={nextLabel || "Next"}
        aria-label={nextLabel || "Next"}
      >
        {"›"}
      </button>
    </div>
  );
}
