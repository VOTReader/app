/* ═══════════════════════════════════════════════════════════════════════
   FootnoteListSection — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function FootnoteListSection({ footnotes, nkjv, highlightedFn, onInAppLink }) {
  const entries = Object.entries(footnotes);
  if (entries.length === 0) return null;
  const scrollToBubble = (num) => {
    // Find the first in-body bubble matching this footnote number and scroll
    // it into view. Brief pulse handled by the bubble's `.active` state if
    // the parent wires `highlightedFn`; we just do the scroll here.
    try {
      const el = document.querySelector(`.fn-ref[data-fn-num="${num}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (_e) { /* DOM access — element may not exist or API unsupported */ }
  };
  return (
    <div className="footnote-list">
      <div className="footnote-list-header">Footnotes</div>
      {entries.map(([num, fn]) => (
        <div
          key={num}
          id={`fn-item-${num}`}
          className={`footnote-list-item${highlightedFn === num ? " pulse" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => scrollToBubble(num)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scrollToBubble(num); } }}
          title={`Jump back to footnote ${num} in the body`}
        >
          <div className="footnote-list-num">{num}{"."}</div>
          <div>
            {fn.type === "scripture" ? (
              <>
                <span className="footnote-list-ref">{fn.ref}</span>
                {nkjv[fn.ref] ? <ExpandableVerse text={nkjv[fn.ref]} refStr={fn.ref} /> :
                  <span className="footnote-list-missing">{" — verse text not available"}</span>}
                {fn.seeAlso && (
                  <div style={{ marginTop: "0.5rem" }}>
                    <span style={{ fontFamily: "'Cinzel',serif", fontSize: "0.6rem", letterSpacing: "0.18em", color: "var(--gold-dim)", textTransform: "uppercase", marginRight: "0.4rem" }}>Also see:</span>
                    <span style={{ fontStyle: "italic" }}>{fn.seeAlso.label || fn.seeAlso.letterTitle}</span>
                    <InAppLinkButton compact={true} link={{ collection: fn.seeAlso.collection, letterTitle: fn.seeAlso.letterTitle, excerpt: fn.seeAlso.excerpt }} onActivate={onInAppLink} />
                  </div>
                )}
              </>
            ) : (
              <>
                {fn.text && !(fn.link && _fnTextRedundantWithLink(fn.text, fn.link)) && <span className="footnote-list-note-text">{fn.text}{fn.link && " "}</span>}
                {fn.link && <InAppLinkButton compact={true} link={fn.link} onActivate={onInAppLink} />}
                {fn.url && <span className={(fn.link || fn.text) ? "footnote-list-url-extra" : "footnote-list-note-text"}><a href={fn.url} target="_blank" rel="noopener noreferrer" className="fn-link" onClick={(e) => e.stopPropagation()}>{(fn.link || fn.text) ? "Open external link" : fn.url}</a></span>}
                {!fn.text && !fn.link && !fn.url && <span className="footnote-list-missing">(no content attached)</span>}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );

};
/* ═══════════════════════════════════════════════════════════════
   MATTHEW / BIBLE READER COMPONENTS
   (ThemeBtn, ModeToggle, InlineNotes, StudyPanels,
    BookSelector, ChapterIndex, ChapterView)
═══════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════
   MODE TOGGLE
═══════════════════════════════════════════════════════════════ */
/* ThemeBtn → extracted to src/ui/components/ThemeBtn.js */

/* ── Global Home button. Calls window.__goHome which App sets on mount. ── */
/* HomeBtn → extracted to src/ui/components/HomeBtn.js */

/* ── Inset bridge: MainActivity calls this after page load so CSS
   variables reflect the real device camera cutout / status bar height ── */
window.__setInsets = function (top, bottom) {
  document.documentElement.style.setProperty('--inset-top', top + 'px');
  document.documentElement.style.setProperty('--inset-bottom', bottom + 'px');
}
