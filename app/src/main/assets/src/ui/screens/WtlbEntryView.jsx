/* ═══════════════════════════════════════════════════════════════════════
   WtlbEntryView — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

/** Readable fallback for a {{nav:bookId:ch}} target before the lazy Bible
    corpus loads — "esther" → "Esther". BOOKS[id].title is preferred when
    available; this only keeps the inline link from showing a raw lowercase id. */
function _prettyBookId(id) {
  return String(id).split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function WtlbEntryView({ entry, partLabel, onHome, onNavigate, onSearch, onSettings, onHistory, onNavToChapter, prevBoundary, onPrevBoundary, nextBoundary, onNextBoundary, theme, onThemeChange, onMarkRead, onUnmark: _onUnmark, isRead: _isRead, markAsReadEnabled, showProgressBar, scripturesDict, indexLabel: _indexLabel, footnotesMode, backHint, onBack, onLinkOpen: _onLinkOpen, onInAppLink }) {
  const [scriptureRef, setScriptureRef] = React.useState(null);
  const [scriptureText, setScriptureText] = React.useState(null);
  const [highlightedFn, setHighlightedFn] = React.useState(null);
  const wtlbMainRef = React.useRef(null);
  React.useEffect(() => {
    const pending = window.navHandoff.peek('pendingHighlight');
    if (!pending || pending.letterId !== entry.id || !pending.excerpt) return;
    window.navHandoff.clear('pendingHighlight');
    const excerpt = pending.excerpt;
    const t = setTimeout(() => highlightExcerptInDom(wtlbMainRef.current, excerpt), 80);
    return () => clearTimeout(t);
  }, [entry.id]);

  // Pre-scan paragraphs for scripture refs.
  const refAnalysis = React.useMemo(() => {
    const perParagraph = [];
    const refNumMap = {};
    const orderedRefs = [];
    let num = 0;
    entry.paragraphs.forEach((p) => {
      const arr = [];
      const re = /\{\{ref:([^}]+)\}\}/g;
      let m;
      while ((m = re.exec(p.text)) !== null) {
        const ref = m[1].trim();
        const after = p.text.slice(m.index + m[0].length);
        const stripped = after.replace(/\{\{(?:ref|nav):[^}]+\}\}/g, '');
        const hasWordChar = /\w/.test(stripped);
        const hasLaterMarker = /\{\{(?:ref|nav):/.test(after);
        const trailing = !hasWordChar && !hasLaterMarker;
        let n = null;
        if (footnotesMode && !trailing) {
          if (!(ref in refNumMap)) {
            num++;
            refNumMap[ref] = num;
            orderedRefs.push(ref);
          }
          n = refNumMap[ref];
        }
        arr.push({ ref, trailing, num: n });
      }
      perParagraph.push(arr);
    });
    return { perParagraph, refNumMap, orderedRefs };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identity-based cache key: entry.paragraphs is corpus data (read-only after boot); entry.id uniquely identifies the entry, so [entry.id, footnotesMode] is sufficient. Using [entry, ...] would force re-memoize on any parent re-render that hands a fresh object literal.
  }, [entry.id, footnotesMode]);

  const lookupVerse = (ref) => {
    const perEntry = entry.scriptures || {};
    const dict = scripturesDict || WTLB_SCRIPTURES;
    return perEntry[ref] || dict[ref] || null;
  };

  React.useEffect(() => {
    if (scriptureRef === null) return;
    var prev = window.__closeSheet;
    window.__closeSheet = () => setScriptureRef(null);
    return () => { window.__closeSheet = prev || null; };
  }, [scriptureRef]);

  const openSheetForRef = (ref) => {
    setScriptureRef(ref);
    setScriptureText(lookupVerse(ref));
  };

  const handleBubbleClick = (ref, _n) => {
    openSheetForRef(ref);
  };

  useMarkAsRead(markAsReadEnabled, onMarkRead);

  React.useEffect(() => { setScriptureRef(null); setScriptureText(null); setHighlightedFn(null); }, [entry.id]);

  React.useEffect(() => {
    const root = wtlbMainRef.current;
    if (!root) return;
    root.querySelectorAll('.fn-ref.active').forEach((e) => e.classList.remove('active'));
    if (highlightedFn != null) {
      const el = root.querySelector('.fn-ref[data-fn-num="' + String(highlightedFn).replace(/"/g, '\\"') + '"]');
      if (el) el.classList.add('active');
    }
  }, [highlightedFn, entry.id]);

  const prevEntry = entry.prevEntry;
  const nextEntry = entry.nextEntry;

  const _attrCollectionLabel = (volStr) => {
    if (!volStr) return null;
    const s = String(volStr).trim().toLowerCase();
    const NUMS = { '1':'One', '2':'Two', '3':'Three', '4':'Four', '5':'Five', '6':'Six', '7':'Seven' };
    if (NUMS[s]) return 'Volume ' + NUMS[s];
    const WORDS = ['one','two','three','four','five','six','seven'];
    if (WORDS.includes(s)) return 'Volume ' + s.charAt(0).toUpperCase() + s.slice(1);
    return null;
  };

  const renderLine = (line, consumeRef) => {
    const parts = line.split(/(\*\*.*?\*\*|_.*?_|\{\{ref:[^}]+\}\}|\{\{nav:[^}]+\}\}|\[From [^\]]+\])/g);
    return parts.map((seg, si) => {
      if (!seg) return null;
      if (seg.startsWith('**') && seg.endsWith('**')) return <strong key={si}>{renderLine(seg.slice(2, -2), consumeRef)}</strong>;
      if (seg.startsWith('_') && seg.endsWith('_')) return <em key={si}>{renderLine(seg.slice(1, -1), consumeRef)}</em>;
      const attrMatch = seg.match(/^\[From ["“”](.+?)["“”]\s*~\s*Volume\s+(\d+|[A-Za-z]+)\]$/);
      if (attrMatch && onInAppLink) {
        const title = attrMatch[1];
        const collection = _attrCollectionLabel(attrMatch[2]);
        if (collection) {
          return (
            <span
              key={si}
              className="letter-link-ref"
              onClick={() => onInAppLink(
                { collection: collection, letterTitle: title },
                { sourceLetterTitle: entry.title, sourceVolumeLabel: partLabel || null }
              )}
              title={'Open "' + title + '" in ' + collection}
            >
              {seg}
            </span>
          );
        }
      }
      const refMatch = seg.match(/^\{\{ref:(.+)\}\}$/);
      if (refMatch) {
        const ref = refMatch[1].trim();
        const info = consumeRef();
        if (info && footnotesMode && !info.trailing && info.num != null) {
          const n = info.num;
          return (
            <span
              key={si}
              className={`fn-ref${highlightedFn === n ? " active" : ""}`}
              data-fn-num={n}
              onClick={() => handleBubbleClick(ref, n)}
              title={`Footnote ${n}`}
            >
              {n}
            </span>
          );
        }
        return (
          <a key={si} className="wtlb-cite" href="#" onClick={(e) => { e.preventDefault(); openSheetForRef(ref); }}>
            ({ref})
          </a>
        );
      }
      const navMatch = seg.match(/^\{\{nav:([^:]+):(\d+)\}\}$/);
      if (navMatch) {
        const bookId = navMatch[1], ch = parseInt(navMatch[2], 10);
        // BOOKS is the LAZY Bible corpus (var in bundle-a-bible.js), undeclared
        // until __loadBibleCorpus resolves. A bare BOOKS[bookId] throws a
        // ReferenceError here on a cold-boot WTLB read (VolumesHome pre-fires
        // only the VOT corpus) — the `?.` does NOT guard the base identifier.
        // Guard with typeof; fall back to a readable book name until it loads.
        const bookTitle = (typeof BOOKS !== 'undefined' && BOOKS[bookId]?.title) || _prettyBookId(bookId);
        return (
          <a key={si} className="fn-link" href="#" onClick={(e) => { e.preventDefault(); onNavToChapter(bookId, ch); }}>
            [{bookTitle} {ch}]
          </a>
        );
      }
      return <React.Fragment key={si}>{seg}</React.Fragment>;
    });
  };

  return (
    <ScreenLayout
      showProgress={showProgressBar}
      navChildren={
        <>
          <button className="nav-home nav-back-icon" onClick={onHome} title="← Index" aria-label="Back to Index">‹</button>
          <HomeBtn />
          <div className="nav-arrows">
            <button
              className="nav-arrow-btn"
              disabled={!prevEntry && !prevBoundary}
              onClick={() => prevEntry ? onNavigate(prevEntry.id) : onPrevBoundary && onPrevBoundary()}
              title="Previous"
              aria-label="Previous entry"
            >‹</button>
            <button
              className="nav-arrow-btn"
              disabled={!nextEntry && !nextBoundary}
              onClick={() => nextEntry ? onNavigate(nextEntry.id) : onNextBoundary && onNextBoundary()}
              title="Next"
              aria-label="Next entry"
            >›</button>
          </div>
          <NavButtons
            onSettings={onSettings}
            onHistory={onHistory}
            onSearch={onSearch}
            theme={theme}
            onThemeChange={onThemeChange}
            reading={true}
            chapterBookmark={entry ? { hlKey: 'wtlb:' + entry.id, label: entry.title || (partLabel ? partLabel + ' — Entry ' + entry.num : 'Bookmark') } : null}
          />
        </>
      }
    >
      <StickyChapterNav
        onPrev={() => prevEntry ? onNavigate(prevEntry.id) : onPrevBoundary && onPrevBoundary()}
        onNext={() => nextEntry ? onNavigate(nextEntry.id) : onNextBoundary && onNextBoundary()}
        prevDisabled={!prevEntry && !prevBoundary}
        nextDisabled={!nextEntry && !nextBoundary}
        prevLabel="Previous entry"
        nextLabel="Next entry"
      />

      {backHint && (
        <div className="back-hint-row">
          <button className="back-hint-pill" onClick={onBack} aria-label="Back to source letter">
            <span className="back-hint-arrow">‹</span>Back to{' '}
            <span className="back-hint-title">{backHint.volumeLabel ? `${backHint.volumeLabel} · ${backHint.title}` : backHint.title}</span>
          </button>
        </div>
      )}

      <header className="hero">
        <div className="hero-bg vol" />
        <div className="hero-content">
          <div className="hero-eyebrow">{partLabel} {"\xA0\xB7\xA0"} {entry.num}</div>
          <h1 className="hero-title">{entry.title}</h1>
          <div className="hero-ornament">
            <div className="hero-ornament-line" />
            <div className="hero-ornament-diamond" />
            <div className="hero-ornament-line r" />
          </div>
        </div>
      </header>

      <div className="page-wrapper">
        <div className="content-layout">
          <main className="letter-body" ref={wtlbMainRef}>
            {entry.paragraphs.map((p, pi) => {
              const paraRefs = refAnalysis.perParagraph[pi] || [];
              let refCursor = 0;
              const consumeRef = () => paraRefs[refCursor++];
              return (
                <p
                  key={entry.id + ":" + pi}
                  style={{ textAlign: p.align }}
                  className={p.align === 'center' ? 'letter-poetry' : 'letter-para'}
                  data-hl-key={wtlbHlKey(entry.id, pi)}
                  data-hl-dom={true}
                >
                  <StaticSubtree>
                    {p.text.split('\n').map((line, li, arr) => (
                      <React.Fragment key={li}>
                        {renderLine(line, consumeRef)}
                        {li < arr.length - 1 && <br />}
                      </React.Fragment>
                    ))}
                  </StaticSubtree>
                </p>
              );
            })}

            {/* Reading-end sentinel: end of body text, before footnotes/nav. */}
            <div className="reading-end" />

            {footnotesMode && refAnalysis.orderedRefs.length > 0 && (
              <div className="footnote-list wtlb-footnote-list">
                <div className="footnote-list-header">Footnotes</div>
                {refAnalysis.orderedRefs.map((ref) => {
                  const num = refAnalysis.refNumMap[ref];
                  const verseText = lookupVerse(ref);
                  return (
                    <div key={ref} id={`wtlb-fn-${entry.id}-${num}`} className={`footnote-list-item${highlightedFn === num ? " pulse" : ""}`}>
                      <div className="footnote-list-num">{num}.</div>
                      <div>
                        <span className="footnote-list-ref">{ref}</span>
                        {verseText && <ExpandableVerse text={verseText} refStr={ref} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="ornament-divider">
              <div className="ornament-divider-line" />
              <div className="ornament-divider-symbol">✦</div>
              <div className="ornament-divider-line" />
            </div>

            <div className="bottom-nav">
              {prevEntry ? (
                <button className="bottom-nav-card" onClick={() => onNavigate(prevEntry.id)}>
                  <div className="bottom-nav-label">‹ Previous</div>
                  <div className="bottom-nav-title">{prevEntry.title}</div>
                </button>
              ) : prevBoundary ? (
                <button className="bottom-nav-card" onClick={onPrevBoundary}>
                  <div className="bottom-nav-label">{prevBoundary.short ? `‹ Previous · ${prevBoundary.short}` : "‹ Previous"}</div>
                  <div className="bottom-nav-title">{prevBoundary.title}</div>
                </button>
              ) : (
                <div className="bottom-nav-card placeholder">
                  <div className="bottom-nav-label">‹ Previous</div>
                  <div className="bottom-nav-title">—</div>
                </div>
              )}

              {nextEntry ? (
                <button className="bottom-nav-card next" onClick={() => onNavigate(nextEntry.id)}>
                  <div className="bottom-nav-label">Next ›</div>
                  <div className="bottom-nav-title">{nextEntry.title}</div>
                </button>
              ) : nextBoundary ? (
                <button className="bottom-nav-card next" onClick={onNextBoundary}>
                  <div className="bottom-nav-label">{nextBoundary.short ? `Next · ${nextBoundary.short} ›` : "Next ›"}</div>
                  <div className="bottom-nav-title">{nextBoundary.title}</div>
                </button>
              ) : (
                <div className="bottom-nav-card next placeholder">
                  <div className="bottom-nav-label">Next ›</div>
                  <div className="bottom-nav-title">—</div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      <>
        <div className={`fn-sheet-backdrop${scriptureRef ? " open" : ""}`} onClick={() => setScriptureRef(null)} />
        <div className={`fn-sheet${scriptureRef ? " open" : ""}`}>
          <div className="fn-sheet-handle" />
          {scriptureRef && (
            <>
              <span className="sc-sheet-tag">Scripture Reference</span>
              <span className="sc-sheet-cite">{scriptureRef}</span>
              {scriptureText ? (
                <div className="sc-sheet-verse"><ScriptureVerseText text={scriptureText} cite={scriptureRef} /></div>
              ) : (
                <div className="sc-sheet-verse" style={{ color: 'var(--cream-dim)', fontStyle: 'italic' }}>Verse text not available in app data</div>
              )}
            </>
          )}
        </div>
      </>
    </ScreenLayout>
  );
}
