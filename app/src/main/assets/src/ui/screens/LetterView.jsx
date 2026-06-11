/* ═══════════════════════════════════════════════════════════════════════
   LetterView — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { useSwipeNav } from '../../hooks/use-swipe-nav.js';

export function LetterView({ letter, onHome, onNavigate, onStudyNavigate, prevBoundary, onPrevBoundary, nextBoundary, onNextBoundary, onSearch, onSettings, onHistory, theme, onThemeChange, surpriseAnchor, onMarkRead, onUnmark: _onUnmark, isRead: _isRead, markAsReadEnabled, showProgressBar, volumeLabel, studyMode, onLetterClick, onInAppLink, backHint, onBack, prophecyCardStatesRef, saveProphecyCardStates, onLinkOpen: _onLinkOpen }) {
  const wrappedInAppLink = onInAppLink ? (link) => onInAppLink(link, { sourceLetterTitle: letter.title, sourceVolumeLabel: volumeLabel }) : null;
  const [highlightedFn, setHighlightedFn] = React.useState(null);
  const [sheetFn, setSheetFn] = React.useState(null);
  const [_surpriseBlockId, setSurpriseBlockId] = React.useState(null); // value unread; setter drives the highlight-pulse effect
  const [highlightExcerpt, setHighlightExcerpt] = React.useState(null);
  const [expandSignal, setExpandSignal] = React.useState(0);
  const [allExpanded, setAllExpanded] = React.useState(true);
  const hasProphecyGroups = letter.blocks.some((b) => b.type === "prophecy-group");

  const mainRef = React.useRef(null);

  const goPrev = () => letter.prevLetter ? onNavigate(letter.prevLetter.id) : onPrevBoundary && onPrevBoundary();
  const goNext = () => letter.nextLetter ? onNavigate(letter.nextLetter.id) : onNextBoundary && onNextBoundary();
  const swipe = useSwipeNav(goNext, goPrev);

  useMarkAsRead(markAsReadEnabled, onMarkRead);

  React.useEffect(() => {
    setHighlightedFn(null);
    setSheetFn(null);
    setScripRef(null);
    setSurpriseBlockId(null);
    const pending = window.navHandoff.peek('pendingHighlight');
    if (pending && pending.letterId === letter.id && pending.excerpt) {
      setHighlightExcerpt(pending.excerpt);
      window.navHandoff.clear('pendingHighlight');
    } else {
      setHighlightExcerpt(null);
    }
  }, [letter.id]);

  React.useEffect(() => {
    if (!highlightExcerpt) return;
    const timer = setTimeout(() => {
      const mark = mainRef.current && mainRef.current.querySelector("mark.letter-highlight");
      if (mark) { mark.scrollIntoView({ block: "center" }); return; }
      highlightExcerptInDom(mainRef.current, highlightExcerpt);
    }, 80);
    return () => clearTimeout(timer);
  }, [highlightExcerpt]);

  React.useEffect(() => {
    if (!surpriseAnchor || surpriseAnchor.type !== "excerpt") return;
    const excerpt = surpriseAnchor.text;
    const blocks = letter.blocks || [];
    let foundId = null;
    for (let i = 0; i < blocks.length; i++) {
      const segs = blocks[i].segments || [];
      const blockText = segs.map((s) => s.v || "").join(" ");
      if (blockText.includes(excerpt.slice(0, 40))) {
        foundId = `letter-block-${i}`;
        break;
      }
    }
    if (!foundId) return;
    setSurpriseBlockId(foundId);
    const timer = setTimeout(() => {
      const el = document.getElementById(foundId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    const fadeTimer = setTimeout(() => setSurpriseBlockId(null), 4000);
    return () => { clearTimeout(timer); clearTimeout(fadeTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identity-based cache key: letter.blocks is corpus data (read-only after boot); letter.id uniquely identifies the letter. Re-running when surpriseAnchor changes OR letter.id changes is the intent — letter.blocks changing without letter.id changing is impossible by design.
  }, [surpriseAnchor, letter.id]);

  const handleFnClick = (num) => {
    setSheetFn((prev) => (prev === num ? null : num));
  };

  const [scripRef, setScripRef] = React.useState(null);
  const handleScripClick = (ref) => {
    setScripRef(ref);
  };
  React.useEffect(() => {
    var closer = sheetFn !== null ? () => setSheetFn(null) : scripRef !== null ? () => setScripRef(null) : null;
    if (!closer) return;
    var prev = window.__closeSheet;
    window.__closeSheet = closer;
    return () => { window.__closeSheet = prev || null; };
  }, [sheetFn, scripRef]);

  // W1.5(a.2) — Escape-key dispatch registrations.
  //   footnote-sheet — listed in the W1.5 modal inventory at PLAN.txt
  //                    line 674 (was "LetterView.jsx:424"; line number
  //                    shifts as wiring lands but the mount site is the
  //                    one-and-only <FootnoteSheet> below).
  //   letter-scripture-sheet — discovered during W1.5(a.2) wiring;
  //                    NOT in the original inventory. It's the inline
  //                    fn-sheet for tapped scripture refs inside a letter.
  //                    Same dismiss semantics as the existing
  //                    __closeSheet wiring above. Inventory extended
  //                    in the closure commit so the count goes 24→25.
  // The two registrations are mutually exclusive in practice (the
  // useEffect above picks one or the other for __closeSheet); since the
  // most-recently-opened wins under registry semantics either way,
  // dispatch order is correct without extra logic.
  useModalRegistry({
    id: 'footnote-sheet',
    dismiss: () => setSheetFn(null),
    active: sheetFn != null,
  });
  useModalRegistry({
    id: 'letter-scripture-sheet',
    dismiss: () => setScripRef(null),
    active: scripRef != null,
  });

  const fnProps = { activeFn: sheetFn != null ? sheetFn : highlightedFn, onFnClick: handleFnClick, onScripClick: handleScripClick, onLetterClick, onInAppLink: wrappedInAppLink, studyMode, footnotes: studyMode ? letter.footnotes : null, highlightText: highlightExcerpt };

  React.useEffect(() => {
    const root = mainRef.current;
    if (!root) return;
    const active = sheetFn != null ? sheetFn : highlightedFn;
    root.querySelectorAll('.fn-ref.active').forEach((e) => e.classList.remove('active'));
    if (active != null) {
      const el = root.querySelector('.fn-ref[data-fn-num="' + String(active).replace(/"/g, '\\"') + '"]');
      if (el) el.classList.add('active');
    }
  }, [sheetFn, highlightedFn, letter.id]);
  const hasFn = letter.footnotes ? Object.keys(letter.footnotes).length > 0 : false;

  return (
    <ScreenLayout
      showProgress={showProgressBar}
      navChildren={
        <>
          <button className="nav-volume nav-back-icon" onClick={onHome} title={`← ${volumeLabel || "Volume Two"}`} aria-label={`Back to ${volumeLabel || "Volume Two"}`}>‹</button>
          <HomeBtn />
          <div className="nav-arrows">
            <button
              className="nav-arrow-btn"
              disabled={!letter.prevLetter && !prevBoundary}
              onClick={() => letter.prevLetter ? onNavigate(letter.prevLetter.id) : onPrevBoundary && onPrevBoundary()}
              title="Previous"
              aria-label="Previous letter"
            >‹</button>
            <button
              className="nav-arrow-btn"
              disabled={!letter.nextLetter && !nextBoundary}
              onClick={() => letter.nextLetter ? onNavigate(letter.nextLetter.id) : onNextBoundary && onNextBoundary()}
              title="Next"
              aria-label="Next letter"
            >›</button>
          </div>
          <NavButtons
            onSettings={onSettings}
            onHistory={onHistory}
            onSearch={onSearch}
            theme={theme}
            onThemeChange={onThemeChange}
            reading={true}
            chapterBookmark={letter ? { hlKey: 'letter:' + letter.id, label: letter.title || 'Letter bookmark' } : null}
            journalRefKey={(typeof jrnRefKeyForLetterByLabel === 'function') ? jrnRefKeyForLetterByLabel(volumeLabel || 'Volume Two', letter && letter.id) : null}
            journalRefLabel={letter && letter.title}
          />
        </>
      }
    >
      <StickyChapterNav
        onPrev={() => letter.prevLetter ? onNavigate(letter.prevLetter.id) : onPrevBoundary && onPrevBoundary()}
        onNext={() => letter.nextLetter ? onNavigate(letter.nextLetter.id) : onNextBoundary && onNextBoundary()}
        prevDisabled={!letter.prevLetter && !prevBoundary}
        nextDisabled={!letter.nextLetter && !nextBoundary}
        prevLabel="Previous letter"
        nextLabel="Next letter"
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
        <div className={`hero-bg ${studyMode ? "study" : "vol"}`} />
        <div className="hero-content">
          <div className="hero-eyebrow">{volumeLabel || "Volume Two"} {"\xA0\xB7\xA0"} {studyMode ? letter.num === 0 ? "Preface" : `Chapter ${letter.num}` : letter.num === 0 ? "Preface" : `Letter ${letter.num}`}</div>
          <h1 className="hero-title">{letter.title}</h1>
          {letter.subtitle && <div className="hero-subtitle">{letter.subtitle}</div>}
          <div className="hero-ornament">
            <div className="hero-ornament-line" />
            <div className="hero-ornament-diamond" />
            <div className="hero-ornament-line r" />
          </div>
        </div>
      </header>

      <div className="page-wrapper" onTouchStart={swipe.onTouchStart} onTouchEnd={swipe.onTouchEnd}>
        <div className="letter-meta">
          <div className="meta-date">{letter.date}</div>
          <div className="meta-from">{letter.from}</div>
          <div className="meta-spoken">{letter.spoken}</div>
          <div className="meta-for">{letter.forLine}</div>
          {letter.noteLine && <div className="meta-note">{Array.isArray(letter.noteLine) ? <Segments segments={letter.noteLine} {...fnProps} /> : letter.noteLine}</div>}
          {letter.metaAddendum && (
            <div className="meta-addendum">Addendum to{' '}
              {letter.metaAddendumLink && wrappedInAppLink ? (
                <a href="#" onClick={(e) => { e.preventDefault(); wrappedInAppLink(letter.metaAddendumLink); }}>{letter.metaAddendum}</a>
              ) : letter.metaAddendumInternal ? (
                <a href="#" onClick={(e) => { e.preventDefault(); onNavigate(letter.metaAddendumInternal); }}>{letter.metaAddendum}</a>
              ) : (
                <a href={letter.metaAddendumUrl} target="_blank" rel="noopener noreferrer">{letter.metaAddendum}</a>
              )}
            </div>
          )}
          {letter.preamble && <div className="meta-preamble">{letter.preamble}</div>}
        </div>

        {letter.sectionIntro && letter.sectionIntro.length > 0 && (
          <div className="section-intro-quote">
            {letter.sectionIntro.map((block, si) => {
              if (block.type === "heading") return <h3 key={si} className="section-intro-heading">{block.text}</h3>;
              if (!block.segments) return null;
              return (
                <p key={si} className="section-intro-text">
                  <Segments segments={block.segments} {...fnProps} />
                </p>
              );
            })}
          </div>
        )}

        <div className="content-layout">
          <main className="letter-body" ref={mainRef}>
            {letter.blocks.map((block, bi) => {
              if (block.type === "intro") return (
                <p key={letter.id + ":" + bi} className="letter-intro" data-hl-key={letterHlKey(letter.id, bi)} data-hl-dom={true}>
                  <StaticSubtree>
                    <Segments segments={block.segments} {...fnProps} />
                  </StaticSubtree>
                </p>
              );

              if (block.type === "heading") return (
                <h2 key={bi} className={`study-heading study-heading-l${block.level || 2}`}>{block.text}</h2>
              );

              if (block.type === "para") return (
                <p key={letter.id + ":" + bi} className="letter-para" data-hl-key={letterHlKey(letter.id, bi)} data-hl-dom={true}>
                  <StaticSubtree>
                    <Segments segments={block.segments} {...fnProps} />
                  </StaticSubtree>
                </p>
              );

              if (block.type === "poetry") {
                if (block.lines) return (
                  <div key={letter.id + ":" + bi} className="letter-poetry" data-hl-key={letterHlKey(letter.id, bi)} data-hl-dom={true}>
                    <StaticSubtree>
                      {block.lines.map((line, li) => (
                        <div key={li} className="poetry-line">
                          <Segments segments={line} {...fnProps} />
                        </div>
                      ))}
                    </StaticSubtree>
                  </div>
                );
                return (
                  <div key={letter.id + ":" + bi} className="letter-poetry" data-hl-key={letterHlKey(letter.id, bi)} data-hl-dom={true}>
                    <StaticSubtree>
                      {(block.segments || []).map((seg, li) => {
                        const lineSeg = { ...seg, v: (seg.v || '').replace(/^\n/, '') };
                        return (
                          <div key={li} className="poetry-line">
                            <Segments segments={[lineSeg]} {...fnProps} />
                          </div>
                        );
                      })}
                    </StaticSubtree>
                  </div>
                );
              }
              if (block.type === "closing") return (
                <div key={letter.id + ":" + bi} className="letter-closing" data-hl-key={letterHlKey(letter.id, bi)} data-hl-dom={true}>
                  <StaticSubtree>{block.text}</StaticSubtree>
                </div>
              );

              if (block.type === "closing-fn") return (
                <div key={letter.id + ":" + bi} className="letter-closing-fn" data-hl-key={letterHlKey(letter.id, bi)} data-hl-dom={true}>
                  <StaticSubtree>
                    <Segments segments={block.segments} {...fnProps} />
                  </StaticSubtree>
                </div>
              );

              if (block.type === "prophecy-group") return (
                <ProphecyGroup
                  key={bi}
                  block={block}
                  fnProps={fnProps}
                  expandSignal={expandSignal}
                  groupKey={letter.id + ":" + bi}
                  statesRef={prophecyCardStatesRef}
                  onSaveStates={saveProphecyCardStates}
                />
              );

              if (block.type === "cover-image") return (
                <div key={bi} className="study-cover-inline">
                  <img src={block.src} alt="Study cover" />
                </div>
              );

              if (block.type === "study-image") return (
                <div key={bi}>
                  <div className="study-image-block">
                    <img src={block.src} alt={block.alt || "Study diagram"} />
                  </div>
                  {block.caption && <p className="study-image-caption">{block.caption}</p>}
                </div>
              );

              return null;
            })}

            {/* Reading-end sentinel: positioned at the actual end of body text. */}
            <div className="reading-end" />

            {hasFn && <FootnoteListSection footnotes={letter.footnotes} nkjv={letter.nkjv} highlightedFn={highlightedFn} onInAppLink={wrappedInAppLink} />}

            <div className="ornament-divider">
              <div className="ornament-divider-line" />
              <div className="ornament-divider-symbol">✦</div>
              <div className="ornament-divider-line" />
            </div>

            <div className="bottom-nav">
              {letter.prevLetter ? (
                <button className="bottom-nav-card" onClick={() => onNavigate(letter.prevLetter.id)}>
                  <div className="bottom-nav-label">‹ Previous Letter</div>
                  <div className="bottom-nav-title">{letter.prevLetter.title}</div>
                </button>
              ) : prevBoundary ? (
                <button className="bottom-nav-card" onClick={onPrevBoundary}>
                  <div className="bottom-nav-label">{prevBoundary.short ? `‹ Previous · ${prevBoundary.short}` : "‹ Previous Book"}</div>
                  <div className="bottom-nav-title">{prevBoundary.title}</div>
                </button>
              ) : (
                <div className="bottom-nav-card placeholder">
                  <div className="bottom-nav-label">‹ Previous Letter</div>
                  <div className="bottom-nav-title">—</div>
                </div>
              )}

              {letter.nextLetter ? (
                <button className="bottom-nav-card next" onClick={() => onNavigate(letter.nextLetter.id)}>
                  <div className="bottom-nav-label">Next Letter ›</div>
                  <div className="bottom-nav-title">{letter.nextLetter.title}</div>
                </button>
              ) : nextBoundary ? (
                <button className="bottom-nav-card next" onClick={onNextBoundary}>
                  <div className="bottom-nav-label">{nextBoundary.short ? `Next · ${nextBoundary.short} ›` : "Next Book ›"}</div>
                  <div className="bottom-nav-title">{nextBoundary.title}</div>
                </button>
              ) : letter.nextLetterExternal ? (
                <a className="bottom-nav-card next" href={letter.nextLetterExternal.url} target="_blank" rel="noopener noreferrer">
                  <div className="bottom-nav-label">Next Letter ›</div>
                  <div className="bottom-nav-title">{letter.nextLetterExternal.title}</div>
                </a>
              ) : (
                <div className="bottom-nav-card next placeholder">
                  <div className="bottom-nav-label">Next Letter ›</div>
                  <div className="bottom-nav-title">—</div>
                </div>
              )}
            </div>

            <div className="related-section">
              {letter.addendum && (
                <div className="related-card">
                  <div className="related-card-title">Also Read</div>
                  {letter.addendumLink && wrappedInAppLink ? (
                    <a className="related-link" href="#" onClick={(e) => { e.preventDefault(); wrappedInAppLink(letter.addendumLink); }}>{letter.addendum}</a>
                  ) : letter.addendumInternal ? (
                    <a className="related-link" href="#" onClick={(e) => { e.preventDefault(); onNavigate(letter.addendumInternal); }}>{letter.addendum}</a>
                  ) : (
                    <a className="related-link" href={letter.addendumUrl} target="_blank" rel="noopener noreferrer">{letter.addendum}</a>
                  )}
                </div>
              )}

              {letter.relatedTopics?.length > 0 && (
                <div className="related-card">
                  <div className="related-card-title">Related Topics</div>
                  {letter.relatedTopics.map((t, i) =>
                    t.link && wrappedInAppLink ? (
                      <a key={i} className="related-link" href="#" onClick={(e) => { e.preventDefault(); wrappedInAppLink(t.link); }}>{t.label}</a>
                    ) : t.internalStudy && onStudyNavigate ? (
                      <a key={i} className="related-link" href="#" onClick={(e) => { e.preventDefault(); onStudyNavigate(t.internalStudy); }}>{t.label}</a>
                    ) : (
                      <a key={i} className="related-link" href={t.url} target="_blank" rel="noopener noreferrer">{t.label}</a>
                    )
                  )}
                </div>
              )}

              {letter.bibleStudies?.length > 0 && (
                <div className="related-card">
                  <div className="related-card-title">Bible Study</div>
                  {letter.bibleStudies.map((s, i) =>
                    s.link && wrappedInAppLink ? (
                      <a key={i} className="related-link" href="#" onClick={(e) => { e.preventDefault(); wrappedInAppLink(s.link); }}>{s.label}</a>
                    ) : s.internalStudy && onStudyNavigate ? (
                      <a key={i} className="related-link" href="#" onClick={(e) => { e.preventDefault(); onStudyNavigate(s.internalStudy); }}>{s.label}</a>
                    ) : (
                      <a key={i} className="related-link" href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a>
                    )
                  )}
                </div>
              )}

              {(letter.audioUrl || letter.soundcloudUrl) && (
                <div className="related-card">
                  <div className="related-card-title">Audio</div>
                  {letter.audioUrl && (
                    <a className="related-link" href={letter.audioUrl} target="_blank" rel="noopener noreferrer">♪ Audio Recording</a>
                  )}
                  {letter.soundcloudUrl && (
                    <a className="related-link" href={letter.soundcloudUrl} target="_blank" rel="noopener noreferrer">♪ Listen on SoundCloud</a>
                  )}
                </div>
              )}

              <div className="related-card">
                <div className="related-card-title">Videos</div>
                {letter.videos?.map((v, i) => (
                  <a key={i} className="related-link" href={v.url} target="_blank" rel="noopener noreferrer">▶ {v.label}</a>
                ))}
                {letter.videoVoiceUrl && (
                  <a className="related-link" href={letter.videoVoiceUrl} target="_blank" rel="noopener noreferrer">▶ {letter.videoVoiceLabel || "Video (with voice over)"}</a>
                )}
                {letter.videoMusicUrl && (
                  <a className="related-link" href={letter.videoMusicUrl} target="_blank" rel="noopener noreferrer">▶ Video (excerpts set to music)</a>
                )}
                <a className="related-link" href="https://www.youtube.com/user/trumpetcallofgod" target="_blank" rel="noopener noreferrer">
                  <span style={{ color: '#cc4444' }}>▶</span> Official YouTube Channel
                </a>
              </div>
            </div>
          </main>
        </div>
      </div>

      <FootnoteSheet
        num={sheetFn}
        fn={sheetFn ? letter.footnotes[sheetFn] : null}
        nkjv={letter.nkjv}
        footnotes={letter.footnotes}
        onNavigate={(newKey) => setSheetFn(newKey)}
        onClose={() => setSheetFn(null)}
        onInAppLink={(link) => { setSheetFn(null); wrappedInAppLink && wrappedInAppLink(link); }}
      />

      <>
        <div className={`fn-sheet-backdrop${scripRef ? " open" : ""}`} onClick={() => setScripRef(null)} />
        <div className={`fn-sheet${scripRef ? " open" : ""}`}>
          <div className="fn-sheet-handle" />
          {scripRef && (
            <>
              <span className="sc-sheet-tag">Scripture Reference</span>
              <span className="sc-sheet-cite">{scripRef}</span>
              {(() => {
                const baked = letter.nkjv && letter.nkjv[scripRef];
                const looked = !baked ? lookupVersesFromBooks(scripRef) : null;
                const text = baked || looked;
                return text
                  ? <div className="sc-sheet-verse"><ScriptureVerseText text={text} cite={scripRef} /></div>
                  : <div className="sc-sheet-verse" style={{ color: 'var(--cream-dim)', fontStyle: 'italic' }}>Verse text not available in app data</div>;
              })()}
            </>
          )}
        </div>
      </>

      {hasProphecyGroups && (
        <ProphecyExpandToggle
          allExpanded={allExpanded}
          onToggle={(expand) => {
            setAllExpanded(expand);
            setExpandSignal(expand ? expandSignal >= 0 ? expandSignal + 1 : 1 : expandSignal <= 0 ? expandSignal - 1 : -1);
            if (prophecyCardStatesRef) {
              const prefix = letter.id + ":";
              Object.keys(prophecyCardStatesRef.current).forEach((k) => {
                if (k.startsWith(prefix)) prophecyCardStatesRef.current[k] = expand;
              });
              saveProphecyCardStates && saveProphecyCardStates();
            }
          }}
        />
      )}
    </ScreenLayout>
  );
}
