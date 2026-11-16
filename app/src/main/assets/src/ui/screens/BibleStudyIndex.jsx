/* ═══════════════════════════════════════════════════════════════════════
   BibleStudyIndex — Cluster G (bundle-d since lz1; lazy bundle-g before)
   ═══════════════════════════════════════════════════════════════════════
   The study's contents in the UI pass's parts (second studies pass,
   2026-11-12; the first only re-dressed the old index rows, and the page
   still read as the old look): a centred hero as Answers has, a card that
   says where to go next, and one grouped list as The Scriptures of Truth
   has. A part is a row that opens its sections under it. */

import { ListGroup, ListRow, NextCard, UiButton, readMark as readMarkOf } from '../components/UiParts.jsx';
import { BarAction } from '../components/RootNav.jsx';
import { UiIcon } from '../components/UiIcon.jsx';
import { readingChipWpm, readingMinChip } from '../components/ReadingMinChip.jsx';
import { countOf } from '../../utils/download-tree.js';
import { studyTitleParts, chapterTitleParts, studyNextStep } from '../../utils/study-titles.js';

export function BibleStudyIndex({ study, onSelect, onBack, onSearch, currentChapter, isRead, readCount, progressKeyFor, markAsReadEnabled, backHint = null, onTapThroughBack, onListen = null }) {
  const [expandedPart, setExpandedPart] = React.useState(null);

  // Auto-expand the part containing the current reading position
  React.useEffect(() => {
    if (currentChapter && study.parts) {
      const ownerPart = study.parts.find((p) => p.chapterIds.includes(currentChapter));
      if (ownerPart) setExpandedPart(ownerPart.num);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: one-shot auto-expand at study load. study + currentChapter together identify the load; a different study or chapter routes through the parent's setStudyId/setStudyChapterId, which remounts this index via the parent's key=. The []-deps captures the values for THIS instance's lifetime.
  }, []);

  // A study's recordings ride AUDIO_MANIFEST in the lazy letter corpus: warm it as
  // the chapter page does, so the Listen button can appear (the route re-renders when it lands).
  React.useEffect(() => {
    if (typeof window.__loadVotCorpus === 'function') void window.__loadVotCorpus();
  }, []);

  const chapters = study.chapters || [];
  const resolveChapter = (cid) => chapters.find((c) => c.id === cid);
  const { head, tail, extensive } = studyTitleParts(study.title, study.subtitle);

  // The study in reading order: the preface, then each part's sections; a study without parts is its list.
  const order = study.parts
    ? [study.prefaceId ? resolveChapter(study.prefaceId) : null, ...study.parts.flatMap((p) => p.chapterIds.map(resolveChapter))].filter(Boolean)
    : chapters;
  const read = (ch) => !!(markAsReadEnabled && ch && isRead(ch.id));
  const readN = order.filter(read).length;
  const next = studyNextStep(order, currentChapter, read);

  // "~N min" in a row's meta line (the one shared chip). Not on a chapter holding
  // prophecy cards: the counter leaves the cards out by rule (ProphecyCard's
  // reading contract), so Section One, most of it cards, read "~1 min". No
  // number beats a wrong one.
  const _wpm = readingChipWpm();
  const hasCards = (ch) => Array.isArray(ch.blocks) && ch.blocks.some((b) => b && b.type === 'prophecy-group');
  const minChip = (ch) => hasCards(ch) ? null : readingMinChip(ch, progressKeyFor ? progressKeyFor(ch.id) : null, _wpm);

  const names = (ch) => (ch.title ? chapterTitleParts(ch.title, head) : { over: '', name: 'Part ' + ch.num });

  /** A read chapter's one mark (the kit's readMark). */
  const readMark = (ch) => (read(ch) ? readMarkOf(Math.max(1, readCount ? readCount(ch.id) : 1)) : null);

  const chapterRow = (ch) => {
    if (!ch) return null;
    const t = names(ch);
    return (
      <ListRow key={ch.id} noLead className="sty-row" over={t.over || null} title={t.name} meta={minChip(ch)} mark={readMark(ch)}
        current={ch.id === currentChapter} onClick={() => onSelect(ch.id)} />
    );
  };

  const partLabel = (part) => <span className="root-eyebrow">{'Part ' + part.num}</span>;

  const partRows = (part) => {
    const partChapters = part.chapterIds.map(resolveChapter).filter(Boolean);
    if (partChapters.length === 1) {
      /* A part of one section: the row goes straight to it */
      const ch = partChapters[0];
      const chip = minChip(ch);
      return (
        <ListRow key={'p' + part.num} noLead className="sty-row" over={partLabel(part)} title={part.title}
          meta={part.subtitle || chip ? <>{part.subtitle}{part.subtitle && chip ? ' · ' : null}{chip}</> : null}
          mark={readMark(ch)} current={ch.id === currentChapter} onClick={() => onSelect(ch.id)} />
      );
    }
    const isOpen = expandedPart === part.num;
    const done = partChapters.filter(read).length;
    const facts = [part.subtitle, countOf(partChapters.length, 'section'), done ? done + ' read' : ''].filter(Boolean).join(' · ');
    return (
      <React.Fragment key={'p' + part.num}>
        <ListRow noLead className="sty-row sty-part" over={partLabel(part)} title={part.title} meta={facts}
          expanded={isOpen} onClick={() => setExpandedPart(isOpen ? null : part.num)} />
        {isOpen ? <div className="root-sublist">{partChapters.map(chapterRow)}</div> : null}
      </React.Fragment>
    );
  };

  /** The card under the hero: where to go next, and how far through the study the reader is. */
  const nextCard = () => {
    if (!next) return null;
    const t = names(next.ch);
    const part = study.parts ? study.parts.find((p) => p.chapterIds.includes(next.ch.id)) : null;
    const where = [part ? 'Part ' + part.num : '', t.over].filter(Boolean).join(' · ');
    const chip = minChip(next.ch);
    return (
      <NextCard step={next.k} title={t.name} meta={where || chip ? <>{where}{where && chip ? ' · ' : null}{chip}</> : null}
        done={readN} total={order.length} onClick={() => onSelect(next.ch.id)} />
    );
  };

  return (
    // The utility bar as a volume's contents page has (rule 11): Back to Studies, Search, Tabs; a blank title.
    <ScreenLayout utility={{
      title: '', onBack, backLabel: 'Back to Studies',
      actions: [onSearch ? <BarAction key="s" icon="search" label="Search" onClick={onSearch} /> : null],
    }}>
      {/* Opened as a tap-through (the Listening Library's Studies screen opens a
          study with no recording yet here, item 4b): the same pill
          BibleChapterView shows, so the reader is one tap from where they were. */}
      {backHint && (
        <div className="back-hint-row">
          <button className="back-hint-pill" onClick={onTapThroughBack} aria-label={'Back to ' + backHint.title}>
            <span className="back-hint-lead"><UiIcon name="back" size="sm" className="back-hint-arrow" />Back to</span>{' '}
            <span className="back-hint-title">{backHint.title}</span>
          </button>
        </div>
      )}
      <div className="sty">
        <header className="sty-hero">
          <div className="root-eyebrow">{extensive ? 'Extensive Bible/Letter Study' : 'Bible/Letter Study'}</div>
          <h1>{head}</h1>
          {tail ? <p>{tail}</p> : null}
        </header>
        {nextCard()}
        {/* A study with a recording: what Listen > Studies > this study opens. */}
        {onListen ? <UiButton wide icon="head" onClick={onListen}>Listen</UiButton> : null}
        <ListGroup label="Contents"
          aside={readN > 0 ? readN + ' of ' + order.length + ' read' : countOf(study.parts ? study.parts.length : order.length, 'part')}>
          {study.parts ? (
            <>
              {study.prefaceId ? chapterRow(resolveChapter(study.prefaceId)) : null}
              {study.parts.map(partRows)}
            </>
          ) : chapters.map(chapterRow)}
        </ListGroup>
      </div>
    </ScreenLayout>
  );
}
