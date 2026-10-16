/* StudiesScreen - Studies (picture 2d; Back names Home) and a study's own page (2e; Back names Studies), zones v2p5 to
   design's dz14 pictures.

   Studies lists main's UNIFIED_CHAIN (studies-facts.js): each study's title by design's split rule, its label line ("3
   parts · Bible study", "Matthew · 28 chapters with notes", "Reference · one page") and, only when it has a recording,
   main's coverage words ("Read-along", "Read-along · 14 of 16"). A one-page study opens its chapter (main's selectStudy);
   the last row opens AnswersOnlyGodCanGive.com. Main's "Couldn't load studies." / "Some studies couldn't load." + Try
   again stay. A study's page puts its Preface first, then each Part, which opens its chapters in place, a step in (main
   opens the part holding the chapter you are on); the chapter you are on is gold with a bar, a read one has a check.
   Neither page has a ... (dz15: a page whose ... would hold nothing has none). A gate boot reads its marks from the gate. */
import { Icon } from '../Icon.jsx';
import { CouldNotOpen } from './CouldNotOpen.jsx';
import { definePlace } from '../places.js';
import { useVotCorpus } from '../corpus.js';
import { MatthewIndex } from './MatthewScreens.jsx';
import {
  studyChain, studyById, studyRow, liveCoverage, studyRoute, studyHead, studyEntries, savedStudyPlace, partHolding,
  splitStudyTitle, askStudies, askMatthew, ANSWERS_SITE, MATTHEW_ID,
} from '../studies-facts.js';

const g = /** @type {any} */ (globalThis);

/**
 * main's studies (and, when `matthew`, the Matthew corpus) asked for once per mount: 'loading', then 'ready' or 'failed'
 * (bible-studies.js did not load; Try again asks again).
 * @param {boolean} matthew @returns {{ status: 'loading' | 'ready' | 'failed', retry: () => void }}
 */
export function useStudies(matthew) {
  const [status, setStatus] = React.useState(/** @type {() => 'loading' | 'ready' | 'failed'} */ (
    () => (Array.isArray(g.BIBLE_STUDIES) && (!matthew || g.MATTHEW) ? 'ready' : 'loading')));
  const [asks, setAsks] = React.useState(0);
  React.useEffect(() => {
    let live = true;
    Promise.all([askStudies(), matthew ? askMatthew() : Promise.resolve()]).then(([ok]) => {
      if (live) setStatus(ok ? 'ready' : 'failed');
    });
    return () => { live = false; };
  }, [matthew, asks]);
  const retry = React.useCallback(() => { setStatus('loading'); setAsks((n) => n + 1); }, []);
  return { status, retry };
}

/** One study's row on Studies. @param {{ row: ReturnType<typeof studyRow>, onOpen: () => void }} props */
function StudyRow({ row, onOpen }) {
  return (
    <button type="button" className="row num-row stu" onClick={onOpen}>
      <span className="no">{row.no}</span>
      <span className="tx">
        <span className="t">{row.title}</span>
        <span className="s">
          {row.label}
          {row.cov && <>{' · '}<span className="st cov"><Icon name="readalong" />{row.cov}</span></>}
        </span>
      </span>
    </button>
  );
}

/** @param {import('../places.js').PlaceProps} props */
export function StudiesScreen({ gate, go, onReady }) {
  const { status, retry } = useStudies(true);
  useVotCorpus();   // main's recordings manifest rides the letters' corpus: the marks follow when it lands
  React.useEffect(() => { if (status !== 'loading') onReady(); }, [status, onReady]);
  if (status === 'loading') return null;
  const chain = studyChain();
  const pinned = gate && gate.facts && gate.facts.studies ? gate.facts.studies.coverage || {} : null;
  const rows = chain.map((s, i) => studyRow(s, i, pinned ? pinned[s.id] || null : liveCoverage(s)));
  const failed = status === 'failed';
  return (
    <>
      <div className="page-head g">
        <span className="overline eyebrow">In-depth Bible studies</span>
        <h1 className="display">Studies</h1>
        <p className="lede">Bible and letter studies, and the Matthew Study Bible</p>
      </div>
      <div className="rows end">
        {rows.map((row, i) => <StudyRow key={row.id} row={row} onOpen={() => go(studyRoute(chain[i]))} />)}
        <a className="row num-row stu ext" href={ANSWERS_SITE} target="_blank" rel="noopener noreferrer">
          <span className="no"><Icon name="link" /></span>
          <span className="tx"><span className="t">AnswersOnlyGodCanGive.com</span><span className="s">Opens the website</span></span>
        </a>
      </div>
      {failed && (
        <div className="empty stu-err">
          {/* main's words: the list still holds the Matthew Study Bible (its own corpus), so "some" */}
          <div className="t">{rows.length ? 'Some studies couldn’t load.' : 'Couldn’t load studies.'}</div>
          <button type="button" className="btn2" onClick={retry}>Try again</button>
        </div>
      )}
    </>
  );
}

/** A chapter's row on a study's page. */
function ChapterRow({ c, current, read, onOpen, rowRef }) {
  return (
    <button type="button" ref={rowRef} className={'row num-row stc' + (current ? ' cur' : '')} onClick={onOpen}
      aria-current={current ? 'true' : undefined}>
      <span className="no">{c.no}</span>
      <span className="tx"><span className="t">{c.title}</span></span>
      {read && <span className="rd" aria-label="Read"><Icon name="check" /></span>}
    </button>
  );
}

/** @param {import('../places.js').PlaceProps} props */
export function StudyScreen({ route, gate, go, onReady }) {
  const { status, retry } = useStudies(route.study === MATTHEW_ID);
  const study = status === 'loading' ? null : studyById(route.study);
  const place = React.useMemo(() => {
    if (!study) return { current: null, read: [] };
    if (gate) {
      const f = gate.facts && gate.facts.studies && gate.facts.studies.place;
      return { current: (f && f.current) || null, read: (f && f.read) || [] };
    }
    return savedStudyPlace(study);
  }, [study, gate]);
  // main opens the part holding the chapter you are on; the gate names its open parts
  const [open, setOpen] = React.useState(/** @type {number[] | null} */ (null));
  const shown = open || (gate && gate.facts && gate.facts.studies && gate.facts.studies.open)
    || (study && place.current ? [partHolding(study, place.current)].filter((n) => n != null) : []);
  const curRef = React.useRef(/** @type {HTMLButtonElement | null} */ (null));
  React.useEffect(() => { if (status !== 'loading') onReady(); }, [status, onReady]);
  // a real visit brings the chapter you are on into view, as main's index does (a gate keeps its picture's scroll)
  React.useEffect(() => {
    const el = curRef.current;
    if (gate || !el || typeof el.scrollIntoView !== 'function') return;
    const r = el.getBoundingClientRect();
    if (r.bottom > (g.innerHeight || 0) - 80) el.scrollIntoView({ block: 'center' });
  }, [gate, study]);
  if (status === 'loading') return null;
  if (!study) return <CouldNotOpen what="study" retry={status === 'failed' ? retry : null} />;
  // the Matthew Study Bible is a book with notes: main's chapter index (5h)
  if (study.isMatthewStudy) return <MatthewIndex study={study} place={place} gate={gate} go={go} />;

  const head = studyHead(study);
  const entries = studyEntries(study);
  const read = new Set(place.read);
  const openChapter = (id) => () => go({ place: 'study-chapter', study: study.id, chapter: id });
  const chapterRow = (c) => (
    <ChapterRow key={c.id} c={c} current={c.id === place.current} read={read.has(c.id)} onOpen={openChapter(c.id)}
      rowRef={c.id === place.current ? curRef : undefined} />
  );
  const toggle = (num) => () => setOpen(shown.includes(num) ? shown.filter((n) => n !== num) : [...shown, num]);
  return (
    <>
      <div className="page-head g">
        <span className="overline eyebrow">{head.eyebrow}</span>
        <h1 className={'display' + (head.size ? ' ' + head.size : '')}>{head.title}</h1>
        {head.lede && <p className="lede">{head.lede}</p>}
      </div>
      <div className="rows end sti">
        {entries.map((e) => {
          if (e.kind === 'chapter') return chapterRow(e);
          // a part with one chapter goes straight to it (main's single-section card)
          if (e.chapters.length === 1) {
            const c = e.chapters[0];
            return (
              <button type="button" key={'p' + e.num} className={'row part' + (c.id === place.current ? ' cur' : '')} onClick={openChapter(c.id)}>
                <span className="tx"><span className="overline">{'Part ' + e.num}</span><span className="t">{e.title}</span><span className="s">{e.sub}</span></span>
                {read.has(c.id) && <span className="rd" aria-label="Read"><Icon name="check" /></span>}
              </button>
            );
          }
          const isOpen = shown.includes(e.num);
          return (
            <React.Fragment key={'p' + e.num}>
              <button type="button" className={'row part' + (isOpen ? ' open' : '')} aria-expanded={isOpen} onClick={toggle(e.num)}>
                <span className="tx"><span className="overline">{'Part ' + e.num}</span><span className="t">{e.title}</span><span className="s">{e.sub}</span></span>
                <span className="chev"><Icon name="chev" /></span>
              </button>
              {isOpen && <div className="pch">{e.chapters.map(chapterRow)}</div>}
            </React.Fragment>
          );
        })}
      </div>
    </>
  );
}

definePlace('studies', { Screen: StudiesScreen, title: () => 'Studies' });
definePlace('study', {
  Screen: StudyScreen,
  // Back on a chapter names the study as lists do ("YAHUSHUA More Than a Man", 5d)
  title: (r) => {
    // Back on a Matthew chapter says the book (5i)
    if (r.study === MATTHEW_ID) return 'Matthew';
    const s = Array.isArray(g.BIBLE_STUDIES) ? studyById(r.study) : null;
    return s ? splitStudyTitle(s.title).title : 'Study';
  },
});
