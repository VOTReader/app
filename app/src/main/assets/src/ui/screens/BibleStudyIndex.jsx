/* ═══════════════════════════════════════════════════════════════════════
   BibleStudyIndex — Cluster G (bundle-d since lz1; lazy bundle-g before)
   ═══════════════════════════════════════════════════════════════════════
   scrollBehavior is a bundle-d global, read at call time rather than
   imported, as the other Cluster G screens do.

   The study's contents in the index-row language Volume One uses (studies
   pass, 2026-11-12): a part is a flat row like the sections under it, not a
   boxed card. Its number column stays empty so part titles, the Preface and
   the section titles share one left edge; a gold label line says "Part 1 ·
   12 sections"; a chevron (the UI pass's) turns when the part is open. */

import { UiIcon } from '../components/UiIcon.jsx';
import { AudioPlayButton } from '../components/AudioPlayButton.jsx';
import { readingChipWpm, readingMinChip } from '../components/ReadingMinChip.jsx';

/**
 * The title's size step: a long study title at Volume One's size filled a
 * third of the screen (108 characters, five bold lines).
 * @param {string} title
 * @returns {string} the extra class for .vol-index-title ('' up to 40 characters)
 */
export function studyTitleSizeClass(title) {
  const n = String(title || '').length;
  if (n > 70) return ' is-long';
  if (n > 40) return ' is-longish';
  return '';
}

/**
 * A part row's gold label: "Part 1 · 12 sections", or just "Part 4" for a part of one section.
 * @param {{ num: any }} part
 * @param {number} sections
 * @returns {string}
 */
export function partRowLabel(part, sections) {
  return sections > 1 ? `Part ${part.num} · ${sections} sections` : `Part ${part.num}`;
}

export function BibleStudyIndex({ study, onSelect, onBack, onSearch, onHistory, onSettings, currentChapter, theme, onThemeChange, isRead, readCount, progressKeyFor, markAsReadEnabled, backHint = null, onTapThroughBack, onListen = null }) {
  const currentRef = React.useRef(null);
  const [expandedPart, setExpandedPart] = React.useState(null);

  // Auto-expand the part containing the current reading position
  React.useEffect(() => {
    if (currentChapter && study.parts) {
      const ownerPart = study.parts.find((p) => p.chapterIds.includes(currentChapter));
      if (ownerPart) setExpandedPart(ownerPart.num);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: one-shot auto-expand at study load. study + currentChapter together identify the load; a different study or chapter routes through the parent's setStudyId/setStudyChapterId, which remounts this index via the parent's key=. The []-deps captures the values for THIS instance's lifetime.
  }, []);

  // Scroll current chapter into view after expand
  React.useEffect(() => {
    if (!currentRef.current) return undefined;
    const timer = setTimeout(() => {
      if (currentRef.current) currentRef.current.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
    }, 180);
    return () => clearTimeout(timer);
  }, [expandedPart]);

  // A study's recordings ride AUDIO_MANIFEST in the lazy letter corpus: warm it as
  // the chapter page does, so the Listen pill can appear (the route re-renders when it lands).
  React.useEffect(() => {
    if (typeof window.__loadVotCorpus === 'function') void window.__loadVotCorpus();
  }, []);

  const resolveChapter = (cid) => (study.chapters || []).find((c) => c.id === cid);

  // "~N min" at the row's end, as Volume One's rows show it (the one shared chip).
  // Not on a chapter holding prophecy cards: the counter leaves the cards out by
  // rule (ProphecyCard's reading contract), so Section One, most of it cards,
  // read "~1 min". No number beats a wrong one.
  const _wpm = readingChipWpm();
  const hasCards = (ch) => Array.isArray(ch.blocks) && ch.blocks.some((b) => b && b.type === 'prophecy-group');
  const minChip = (ch) => hasCards(ch) ? null : readingMinChip(ch, progressKeyFor ? progressKeyFor(ch.id) : null, _wpm);

  const readTick = (ch) => (markAsReadEnabled && ch && isRead(ch.id))
    ? <span className="read-check"><span className="sr-only">{(readCount && readCount(ch.id) > 1) ? `Read ${readCount(ch.id)} times` : 'Read'}</span><span aria-hidden="true">{"✓"}</span>{readCount && readCount(ch.id) > 1 && <span className="read-check-count" aria-hidden="true">{"×" + readCount(ch.id)}</span>}</span>
    : null;

  const renderChapterCard = (ch) => {
    if (!ch) return null;
    const isCurrent = ch.id === currentChapter;
    return (
      <button
        key={ch.id}
        ref={isCurrent ? currentRef : null}
        className={`chapter-card-btn${isCurrent ? " is-current" : ""}`}
        aria-current={isCurrent ? 'true' : undefined}
        onClick={() => onSelect(ch.id)}
      >
        <span className="chapter-card-num">{ch.num}</span>
        <div className="chapter-card-divider" />
        <div className="chapter-card-info">
          {ch.title
            ? <div className="chapter-card-title">{ch.title}</div>
            : <div className="chapter-card-title untitled">Part {ch.num}</div>
          }
        </div>
        {minChip(ch)}
        {readTick(ch)}
      </button>
    );
  };

  /** The text column of a part row: label line, title, subtitle. */
  const partInfo = (part, sections) => (
    <div className="chapter-card-info">
      <div className="chapter-card-label">{partRowLabel(part, sections)}</div>
      <div className="chapter-card-title">{part.title}</div>
      {part.subtitle && <div className="part-row-sub">{part.subtitle}</div>}
    </div>
  );

  const navBar = LibraryNav({
    onBack, backLabel: 'Studies',
    onSettings, onHistory, onSearch, theme, onThemeChange,
  });

  return (
    <ScreenLayout navChildren={navBar}>
      {/* Opened as a tap-through (the Listening Library's Studies screen opens a
          study with no recording yet here, item 4b): the same pill
          BibleChapterView shows, so the reader is one tap from where they were. */}
      {backHint && (
        <div className="back-hint-row">
          <button className="back-hint-pill" onClick={onTapThroughBack} aria-label={'Back to ' + backHint.title}>
            <span className="back-hint-lead"><span className="back-hint-arrow">‹</span>Back to</span>{' '}
            <span className="back-hint-title">{backHint.title}</span>
          </button>
        </div>
      )}
      <div className="vol-index">
        <div className="vol-index-header">
          <div className="vol-index-eyebrow">Bible/Letter Study</div>
          <h1 className={'vol-index-title' + studyTitleSizeClass(study.title)}>{study.title}</h1>
          {study.subtitle && <div className="vol-index-subtitle">{study.subtitle}</div>}
          <div className="vol-index-ornament">
            <div className="vol-index-ornament-line" />
            <div className="vol-index-ornament-diamond" />
            <div className="vol-index-ornament-line r" />
          </div>
          {/* A study with a recording: Volume One's pill, opening what Listen > Studies > this study opens. */}
          {onListen && (
            <div className="vol-index-play-row">
              <AudioPlayButton variant="playall" label="Listen" onClick={onListen} />
            </div>
          )}
        </div>
        <div className="chapter-cards">
          {study.parts ? (
            <>
              {study.prefaceId && renderChapterCard(resolveChapter(study.prefaceId))}
              {study.parts.map((part) => {
                const partChapters = part.chapterIds.map(resolveChapter).filter(Boolean);
                const sectionCount = partChapters.length;
                const isSingleSection = sectionCount === 1;
                const isOpen = expandedPart === part.num;

                if (isSingleSection) {
                  /* Single-section part: direct tap goes straight to chapter */
                  const ch = partChapters[0];
                  const isCurrent = ch && ch.id === currentChapter;
                  return (
                    <button
                      key={part.num}
                      ref={isCurrent ? currentRef : null}
                      className={`chapter-card-btn part-row${isCurrent ? " is-current" : ""}`}
                      aria-current={isCurrent ? 'true' : undefined}
                      onClick={() => ch && onSelect(ch.id)}
                    >
                      <span className="chapter-card-num" />
                      {partInfo(part, sectionCount)}
                      {ch && minChip(ch)}
                      {readTick(ch)}
                    </button>
                  );
                }

                /* Multi-section part: accordion; its sections follow it as plain rows */
                const holdsCurrent = !!currentChapter && part.chapterIds.includes(currentChapter);
                return (
                  <React.Fragment key={part.num}>
                    <button
                      className={`chapter-card-btn part-row${isOpen || holdsCurrent ? " is-open" : ""}`}
                      onClick={() => setExpandedPart(isOpen ? null : part.num)}
                      aria-expanded={isOpen}
                    >
                      <span className="chapter-card-num" />
                      {partInfo(part, sectionCount)}
                      <UiIcon name="chev" className="ui-row-chev" />
                    </button>
                    {isOpen && partChapters.map((ch) => renderChapterCard(ch))}
                  </React.Fragment>
                );
              })}
            </>
          ) : (
            /* Flat chapter list fallback for studies without parts */
            (study.chapters || []).map((ch) => renderChapterCard(ch))
          )}
        </div>
      </div>
    </ScreenLayout>
  );
}
