/* ═══════════════════════════════════════════════════════════════════════
   FootnoteSheet — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function FootnoteSheet({ num, fn, nkjv, footnotes, onClose, onInAppLink, onNavigate }) {
  const isOpen = num !== null;
  const verse = fn?.type === "scripture" ? nkjv?.[fn.ref] || null : null;
  // Build ordered key list once we know the footnotes dict; keys are
  // typically numeric strings ("1", "2", "10"), so sort numerically when
  // possible and fall back to lexical order for unusual keys.
  const orderedKeys = footnotes ? Object.keys(footnotes).sort((a, b) => {
    const na = parseInt(a, 10), nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  }) : [];
  const curIdx = num != null ? orderedKeys.indexOf(String(num)) : -1;
  const prevKey = curIdx > 0 ? orderedKeys[curIdx - 1] : null;
  const nextKey = curIdx >= 0 && curIdx < orderedKeys.length - 1 ? orderedKeys[curIdx + 1] : null;
  const total = orderedKeys.length;
  const showNav = total > 1 && onNavigate && curIdx !== -1;
  return (
    <>
      <div className={`fn-sheet-backdrop${isOpen ? " open" : ""}`} onClick={onClose} />
      <div className={`fn-sheet${isOpen ? " open" : ""}`}>
        <div className="fn-sheet-handle" />
        {fn && (
          <>
            <div className="fn-sheet-num-row">
              <div className="fn-sheet-num">
                Footnote {num}
                {showNav && <span className="fn-sheet-num-of"> of {total}</span>}
              </div>
              {showNav && (
                <div className="fn-sheet-nav">
                  <button
                    className="fn-sheet-nav-btn"
                    onClick={() => prevKey != null && onNavigate(prevKey)}
                    disabled={prevKey == null}
                    aria-label="Previous footnote"
                    title="Previous footnote"
                  >
                    ‹
                  </button>
                  <button
                    className="fn-sheet-nav-btn"
                    onClick={() => nextKey != null && onNavigate(nextKey)}
                    disabled={nextKey == null}
                    aria-label="Next footnote"
                    title="Next footnote"
                  >
                    ›
                  </button>
                </div>
              )}
            </div>
            {fn.type === "scripture" ? (
              <>
                <span className="fn-sheet-ref">{fn.ref}</span>
                {verse ? (
                  <div className="fn-sheet-verse">
                    <ScriptureVerseText text={verse} cite={fn.ref} />
                  </div>
                ) : (
                  <div className="fn-sheet-verse-missing">
                    Verse text isn’t available for this reference. The footnote points to <strong>{fn.ref}</strong>, but no matching entry was found in this letter’s scripture dictionary.
                  </div>
                )}
                {fn.seeAlso && (
                  <div className="fn-sheet-see-also">
                    <span className="fn-sheet-see-also-label">Also see</span>
                    <InAppLinkButton
                      link={{ collection: fn.seeAlso.collection, letterTitle: fn.seeAlso.letterTitle, excerpt: fn.seeAlso.excerpt }}
                      onActivate={onInAppLink}
                      label={fn.seeAlso.label || fn.seeAlso.letterTitle}
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                {fn.text && !(fn.link && _fnTextRedundantWithLink(fn.text, fn.link)) && (
                  <div className="fn-sheet-note">{fn.text}</div>
                )}
                {fn.link && <InAppLinkButton link={fn.link} onActivate={onInAppLink} />}
                {fn.url && (
                  <div className={(fn.link || fn.text) ? "fn-sheet-url-extra" : "fn-sheet-note"}>
                    <a href={fn.url} target="_blank" rel="noopener noreferrer" className="fn-link">
                      {(fn.link || fn.text) ? "Open external link" : fn.url}
                    </a>
                  </div>
                )}
                {!fn.text && !fn.link && !fn.url && (
                  <div className="fn-sheet-verse-missing">This footnote has no content attached.</div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
