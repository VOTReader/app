/* ═══════════════════════════════════════════════════════════════════════
   ChapterIndex — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   A Bible book's chapters (bible-idx) and the Matthew study's (matthew-idx).

   Built from the UI pass's parts as a volume's contents page is (vot-ui,
   2026-11-15): a centred hero with the book's Listen, the card that says
   where to go next, the strip of chapter numbers for a long book, then one
   grouped list. A row is the chapter's heading over one line of facts
   ("Chapter 5 · ~5 min"); the one mark says it has been read. The old page
   (a gold number column, hairline rows, .chapter-card* and .vol-index*) is
   gone with its CSS. */

import { BarAction } from '../components/RootNav.jsx';
import { countOf } from '../../utils/download-tree.js';
import { AudioPlayer } from '../../utils/audio-player.js';
import { HeroListen, bibleHero } from '../components/AudioPlayButton.jsx';
import { readingChipWpm, readingMinChip } from '../components/ReadingMinChip.jsx';
import { ListGroup, ListRow, NextCard, readMark } from '../components/UiParts.jsx';
import { UiIcon } from '../components/UiIcon.jsx';
import { scrollBehavior } from '../../utils/reduced-motion.js';
import { studyNextStep } from '../../utils/study-titles.js';

export function ChapterIndex({ book, eyebrow, onSelect, onBack, backLabel, onSearch, currentChapter, isRead, readCount, progressKeyFor, markAsReadEnabled, restoredNames, showChapterTitle, bookmarkKeyFor, bibleAudio = null, noteWeights = null }) {
  const pageRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  // A chapter holding a bookmark (the whole chapter or any verse in it) says so in its facts (owner report
  // 2026-08-09). Indicator only; the reading view's header button manages the bookmark.
  React.useSyncExternalStore(
    React.useCallback((cb) => (bookmarkKeyFor && typeof BookmarkStore !== 'undefined') ? BookmarkStore.subscribe(cb) : () => {}, [bookmarkKeyFor]),
    () => (bookmarkKeyFor && typeof BookmarkStore !== 'undefined') ? BookmarkStore.getVersion() : 0
  );
  const hasBookmark = (num) => {
    if (!bookmarkKeyFor || typeof BookmarkStore === 'undefined') return false;
    try { return BookmarkStore.getForKeyPrefix(bookmarkKeyFor(num)).length > 0; }
    catch (_e) { return false; }
  };
  // The chapter the reader is in sits in the middle of the screen on the way in.
  React.useEffect(() => {
    const timer = setTimeout(() => {
      const cur = pageRef.current && pageRef.current.querySelector('.sty-row[aria-current="true"]');
      if (cur && cur.scrollIntoView) cur.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
    }, 120);
    return () => clearTimeout(timer);
  }, []);
  // The chapter's heading: the restored one when Restored Names is on, none when Chapter Titles is off.
  const titleOf = (ch) => {
    if (showChapterTitle === false) return null;
    if (restoredNames && typeof BOOKS_RESTORED !== 'undefined' && BOOKS_RESTORED[book.id]) {
      const r = BOOKS_RESTORED[book.id].chapters.find((c) => c.num === ch.num);
      if (r && r.title) return r.title;
    }
    return ch.title || null;
  };
  // Wave 0: Back names its real destination ("Gospels", "Studies", ...); "Books" is the legacy fallback.
  const backDest = backLabel || 'Books';
  // "~N min", or "N% read · ~M min left" for a chapter part read (the one shared chip, keyed as the tracker records).
  const _wpm = readingChipWpm();
  const minChip = (ch) => readingMinChip(ch, progressKeyFor ? progressKeyFor(ch.num) : null, _wpm);
  // Half-baked 8 (main aac60f2b9): on the Matthew study the fact is a plain count ("12 notes"), from the chapter's
  // own votNotes; a chapter with none shows nothing. `noteWeights` now only marks the study index (the ratio it
  // carried read as jargon). The minute chip counts verses only, by design.
  const noteChip = (ch) => {
    const n = noteWeights && Array.isArray(ch.votNotes) ? ch.votNotes.length : 0;
    if (!(n > 0)) return null;
    return <span className="idx-note-chip">{n} {n === 1 ? 'note' : 'notes'}</span>;
  };
  /** One line of facts, joined by middots; parts that are null drop out. */
  const facts = (parts) => {
    const on = parts.filter(Boolean);
    return on.length ? on.map((p, i) => <React.Fragment key={i}>{i ? ' · ' : null}{p}</React.Fragment>) : null;
  };
  /** "Chapter 5" leads the facts when a heading is the row's name; an untitled row is named "Chapter 5" itself. */
  const where = (ch) => (titleOf(ch) ? 'Chapter ' + ch.num : null);
  const bookmark = (ch) => (hasBookmark(ch.num)
    ? <span className="sty-bm"><UiIcon name="mark" size="sm" filled /><span className="sr-only">Bookmarked</span></span>
    : null);

  /** A row's facts: the bookmark mark, then "Chapter 5 · ~5 min · 12 notes" (null when there are none). */
  const rowFacts = (ch) => {
    const bm = bookmark(ch), f = facts([where(ch), minChip(ch), noteChip(ch)]);
    return bm || f ? <>{bm}{f}</> : null;
  };
  const chapters = book.chapters;
  const read = (ch) => !!(markAsReadEnabled && ch && isRead && isRead(ch.num));
  const readN = chapters.filter(read).length;
  const byId = chapters.map((ch) => ({ id: ch.num, ch }));
  const step = studyNextStep(byId, currentChapter, (x) => read(x.ch));
  // The card shows only once there is progress (Continue / Up next): at zero it repeated row 1 word for word and, at
  // text 2.0, pushed every chapter row off the first screen; all read ('Read again') leaves the list to speak.
  const next = step && (step.k === 'Continue' || step.k === 'Up next') ? step.ch.ch : null;

  return (
    <ScreenLayout
      utility={{ title: '', onBack, backLabel: 'Back to ' + backDest,
        actions: [onSearch ? <BarAction key="s" icon="search" label="Search" onClick={onSearch} /> : null] }}
    >
      <div className="sty" ref={pageRef}>
        <header className="sty-hero">
          <div className="root-eyebrow">{eyebrow || 'The Holy Bible'}</div>
          <h1>{book.title}</h1>
          <p>{book.subtitle ? book.subtitle + ' · ' : ''}{countOf(chapters.length, 'chapter')}</p>
          {/* The recorded edition (null = Settings 'Off'): the book from its first chapter, auto-advance carrying
              on; a book the edition's manifest does not carry hides it. */}
          {bibleAudio && AudioPlayer.hasAudio(bibleAudio.volKey, book.id) ? <HeroListen {...bibleHero(bibleAudio, book)} /> : null}
        </header>
        {next ? (
          <NextCard step={step.k} title={titleOf(next) || 'Chapter ' + next.num}
            meta={facts([where(next), minChip(next)])}
            done={readN} total={chapters.length} onClick={() => onSelect(next.num)} />
        ) : null}
        {chapters.length > 1 ? (
          <nav className="rd-book-strip" aria-label="Chapters">
            {chapters.map((ch) => (
              <button key={ch.num} type="button" className={'rd-book-num' + (ch.num === currentChapter ? ' is-current' : '')}
                aria-label={'Chapter ' + ch.num} aria-current={ch.num === currentChapter ? 'true' : undefined}
                onClick={() => onSelect(ch.num)}>{ch.num}</button>
            ))}
          </nav>
        ) : null}
        <ListGroup label="Chapters" aside={readN > 0 ? readN + ' of ' + chapters.length + ' read' : countOf(chapters.length, 'chapter')}>
          {chapters.map((ch) => (
            <ListRow key={ch.num} noLead className="sty-row" title={titleOf(ch) || 'Chapter ' + ch.num}
              meta={rowFacts(ch)}
              mark={read(ch) ? readMark(Math.max(1, readCount ? readCount(ch.num) : 1)) : null}
              current={ch.num === currentChapter} onClick={() => onSelect(ch.num)} />
          ))}
        </ListGroup>
      </div>
    </ScreenLayout>
  );
}
