/* ═══════════════════════════════════════════════════════════════════════
   VolumeLetterIndex — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The contents page of every volume and collection (the seven Volumes,
   Timothy, the Little Flock, The Lord's Rebuke, both parts of Words To Live
   By, The Blessed, The Holy Days): one component, thirteen routes.

   Built from the UI pass's parts as a study's contents page is (vot-ui,
   2026-11-15): a centred hero, the card that says where to go next, Play all,
   then one grouped list. A row is the letter's name over one line of facts,
   date and reading time under it; the one mark says it has been read. The old
   page (a number column, hairline rows, serif caps labels, two columns for
   Words To Live By) is gone with its CSS. */

import { AudioSectionChips } from './AudioPlayButton.jsx';
import { readingChipWpm, readingMinChip } from './ReadingMinChip.jsx';
import { ListGroup, ListRow, NextCard, UiButton, readMark } from './UiParts.jsx';
import { countOf } from '../../utils/download-tree.js';
import { letterDate } from '../../utils/dates.js';
import { studyNextStep } from '../../utils/study-titles.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * @param {{ volumeTitle: string, eyebrow?: string, sub?: string, noun?: string, letters: any[], preface?: any,
 *   onSelect: (id: any) => void, onSelectPreface?: (id: any) => void, currentLetter?: any, isRead?: (id: any) => boolean,
 *   readCount?: (id: any) => number, progressKeyFor?: (id: any) => string, markAsReadEnabled?: boolean,
 *   onPlayAll?: () => void, sections?: any[], onPlaySection?: (i: number) => void, headerExtra?: any }} props
 *   noun: what one item is called ("letter"; "entry" for Words To Live By and The Blessed)
 */
export function VolumeLetterIndex({ volumeTitle, eyebrow, sub, noun = 'letter', letters, preface, onSelect, onSelectPreface, currentLetter, isRead, readCount, progressKeyFor, markAsReadEnabled, onPlayAll, sections, onPlaySection, headerExtra }) {
  const pageRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  // The letter the reader is in sits in the middle of the screen on the way in.
  React.useEffect(() => {
    const cur = pageRef.current && pageRef.current.querySelector('.sty-row[aria-current="true"]');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, []);

  // "~N min" in a row's facts, or "N% · ~M min left" for one the reader is part way through
  // (the one shared chip, components/ReadingMinChip.jsx, keyed as the tracker records).
  const _wpm = readingChipWpm();
  const minChip = (item) => readingMinChip(item, progressKeyFor ? progressKeyFor(item.id) : null, _wpm);

  const order = preface ? [preface, ...letters] : letters;
  const read = (item) => !!(markAsReadEnabled && item && isRead && isRead(item.id));
  const readN = order.filter(read).length;
  const next = studyNextStep(order, currentLetter, read);

  /** Where the item sits: "Letter 12", or "Preface" (the first fact on its row and on the next card). */
  const overOf = (item) => (item === preface ? 'Preface' : item.num != null ? cap(noun) + ' ' + item.num : null);
  /** Its facts: the date in words and the reading time. */
  const factsOf = (item) => {
    const date = item === preface ? '' : letterDate(item.date);
    const chip = minChip(item);
    if (!date && !chip) return null;
    return <>{date}{date && chip ? ' · ' : null}{chip}</>;
  };
  /** A row's one meta line and the next card's, worded alike (hub 11-15: one row is a title and one meta line,
   * so a screen holds six or more): "Letter 12 · April 18, 2005 · ~7 min", "Preface · ~1 min". */
  const nextFacts = (item) => {
    const o = overOf(item), f = factsOf(item);
    return o || f ? <>{o}{o && f ? ' · ' : null}{f}</> : null;
  };
  const open = (item) => (item === preface ? (onSelectPreface && onSelectPreface(item.id)) : onSelect(item.id));

  return (
    <div className="sty" ref={pageRef}>
      <header className="sty-hero">
        <div className="root-eyebrow">{eyebrow || 'The Volumes of Truth'}</div>
        <h1>{volumeTitle}</h1>
        {sub ? <p>{sub}</p> : null}
      </header>
      {next ? (
        <NextCard step={next.k} title={next.ch.title}
          meta={nextFacts(next.ch)}
          done={readN} total={order.length} onClick={() => open(next.ch)} />
      ) : null}
      {/* Streaming audio (2026-08-05): the whole collection queued as one album; Words To Live By also
          offers its parts' range recordings. Absent until the lazy corpus with AUDIO_MANIFEST lands. */}
      {onPlayAll ? <UiButton wide icon="play" onClick={onPlayAll}>Play all</UiButton> : null}
      {sections && onPlaySection ? <AudioSectionChips sections={sections} onPlay={onPlaySection} /> : null}
      {/* A collection's own extras under its title (Holy Days' two playlists). */}
      {headerExtra || null}
      <ListGroup label="Contents" aside={readN > 0 ? readN + ' of ' + order.length + ' read' : countOf(letters.length, noun)}>
        {order.map((item) => (
          <ListRow key={item.id} noLead className="sty-row" title={item.title} meta={nextFacts(item)}
            mark={read(item) ? readMark(Math.max(1, readCount ? readCount(item.id) : 1)) : null}
            current={item.id === currentLetter} onClick={() => open(item)} />
        ))}
      </ListGroup>
    </div>
  );
}
