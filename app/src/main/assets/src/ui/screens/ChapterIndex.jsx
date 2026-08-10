/* ═══════════════════════════════════════════════════════════════════════
   ChapterIndex — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { AudioPlayer } from '../../utils/audio-player.js';
import { AudioPlayButton } from '../components/AudioPlayButton.jsx';
import { readingChipWpm, readingMinChip } from '../components/ReadingMinChip.jsx';

export function ChapterIndex({ book, onSelect, onBack, backLabel, onSearch, onHistory, onSettings, currentChapter, theme, onThemeChange, isRead, readCount, progressKeyFor, markAsReadEnabled, restoredNames, showChapterTitle, bookmarkKeyFor, bibleAudio = null }) {
  const currentRef = React.useRef(null);
  // Chapter-level bookmark indicator (owner report 2026-08-09): a chapter
  // holding a bookmark — the whole-chapter bookmark or any verse bookmark
  // within it — shows a small flag on its card. Indicator only; managing
  // the bookmark stays with the reading view's header button.
  React.useSyncExternalStore(
    React.useCallback((cb) => (bookmarkKeyFor && typeof BookmarkStore !== 'undefined') ? BookmarkStore.subscribe(cb) : () => {}, [bookmarkKeyFor]),
    () => (bookmarkKeyFor && typeof BookmarkStore !== 'undefined') ? BookmarkStore.getVersion() : 0
  );
  const hasBookmark = (num) => {
    if (!bookmarkKeyFor || typeof BookmarkStore === 'undefined') return false;
    try { return BookmarkStore.getForKeyPrefix(bookmarkKeyFor(num)).length > 0; }
    catch (_e) { return false; }
  };
  React.useEffect(() => {
    if (!currentRef.current) return undefined;
    const timer = setTimeout(() => {
      if (currentRef.current) currentRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => clearTimeout(timer);
  }, []);
  // Restored-Name chrome lookup for the chapter cards. When restoredNames
  // is on, show the restored chapter title; otherwise fall back to the
  // standard. If showChapterTitle is off, titles are hidden entirely.
  const getChapterTitle = (ch) => {
    if (showChapterTitle === false) return null;
    if (restoredNames && typeof BOOKS_RESTORED !== "undefined" && BOOKS_RESTORED[book.id]) {
      const r = BOOKS_RESTORED[book.id].chapters.find((c) => c.num === ch.num);
      if (r && r.title) return r.title;
    }
    return ch.title;
  };
  // Wave 0: the back affordance must name its REAL destination. Callers
  // pass backLabel ("Poetry & Wisdom", "Studies", "Home", …); "Books" is
  // the legacy fallback for any call site that doesn't. One string feeds
  // BOTH the tooltip and the TalkBack label so they can never disagree.
  const backDest = backLabel || "Books";
  // "~N min" per chapter card — or "N% · ~M min left" once the read tracker
  // has left a frontier inside it ([26] smart-resume). The chip itself lives
  // in components/ReadingMinChip.jsx: index cards, letter rows and History
  // rows all render the SAME one. progressKeyFor threads the tracker's
  // v1:<bid>:<cid> key; absent (legacy caller) → cold chip only.
  const _wpm = readingChipWpm();
  const minChip = (ch) => readingMinChip(ch, progressKeyFor ? progressKeyFor(ch.num) : null, _wpm);
  return (
    <ScreenLayout
      navChildren={LibraryNav({
        onBack, backLabel: backDest,
        onSettings, onHistory, onSearch, theme, onThemeChange,
      })}
    >
      <div className="vol-index">
        <div className="vol-index-header">
          <div className="vol-index-eyebrow">Scriptures of Truth</div>
          <h1 className="vol-index-title">{book.title}</h1>
          <div className="vol-index-subtitle">{book.subtitle}</div>
          {/* Whole-book audiobook (2026-08-09): one track per book, streamed
              from the audio-bible release. The selected edition arrives via
              bibleAudio (null = Settings 'Off' / unknown edition); a book the
              edition's manifest doesn't carry self-hides the same way a
              letter without a recording does. */}
          {bibleAudio && AudioPlayer.hasAudio(bibleAudio.volKey, book.id) && (
            <div className="hero-play-row">
              <AudioPlayButton onClick={() => AudioPlayer.playBibleBook({ volKey: bibleAudio.volKey, bookId: book.id, label: bibleAudio.label })} />
            </div>
          )}
          <div className="vol-index-ornament">
            <div className="vol-index-ornament-line" />
            <div className="vol-index-ornament-diamond" />
            <div className="vol-index-ornament-line r" />
          </div>
        </div>
        <div className="chapter-cards">
          {book.chapters.map((ch, _i) => {
            const isCurrent = ch.num === currentChapter;
            return (
              <button
                key={ch.num}
                ref={isCurrent ? currentRef : null}
                className={`chapter-card-btn${isCurrent ? " is-current" : ""}`}
                onClick={() => onSelect(ch.num)}
              >
                <span className="chapter-card-num">{ch.num}</span>
                <div className="chapter-card-divider" />
                <div className="chapter-card-info">
                  {(() => {
                    const t = getChapterTitle(ch);
                    return t
                      ? <div className="chapter-card-title">{t}</div>
                      : <div className="chapter-card-title untitled">Chapter {ch.num}</div>;
                  })()}
                </div>
                {hasBookmark(ch.num) && (
                  <span className="chapter-card-bookmark" aria-label="Bookmarked" title="Bookmarked">
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                  </span>
                )}
                {minChip(ch)}
                {markAsReadEnabled && isRead(ch.num) && (
                  <span className="read-check" aria-label={(readCount && readCount(ch.num) > 1) ? `Read ${readCount(ch.num)} times` : 'Read'}>
                    {"✓"}
                    {readCount && readCount(ch.num) > 1 && <span className="read-check-count" aria-hidden="true">{"×" + readCount(ch.num)}</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </ScreenLayout>
  );
}
