/* MatthewScreens - the Matthew Study Bible in v2 (zones v2p5 to design's dz18: 5h the index, 5i-5k a chapter).

   The index (5h, main's ChapterIndex): Back says Studies, the overline ties it to its Studies row, "Matthew" and main's
   subtitle, the book's Listen, then the 28 chapters as 2e's numbered rows: main's chapter title, the minutes and the notes
   weight; a read chapter has its check, the one you are on is lit and brought into view.

   A chapter (5i-5k, main's ChapterView): "Matthew 5" under the overline, main's chapter summary (a tap hides it, then
   "+ Show summary"; off with main's Chapter titles), Listen, then the verses as v2's Bible chapter, keyed as main keys them
   (study:matthew-<n>:<v>) so main's marks, read-along and read tracker find them. Study notes (main's ModeToggle) stays on
   screen, bottom right over the page: PDF puts the Scripture references, the Volumes of Truth notes and Further study
   after the verses; Inline puts each note under the verse that ends its first range, the prose broken there, and a later
   verse the note also covers ends with a pill back to it (main's Reference echoes); Off shows the verses alone. A
   reference with its verse in the app opens 1e's sheet; a note whose letter resolves opens it at the excerpt. */
import { Icon } from '../Icon.jsx';
import { SheetLayer } from '../Sheet.jsx';
import { RefSheet } from './RefSheet.jsx';
import { useMainMarks } from './LetterScreen.jsx';
import { ChapterListenPill, chapterAudio } from '../player/listen.jsx';
import { ChapterReadAlong } from '../player/read-along.jsx';
import { LayerToast } from '../Sheet.jsx';
import { TOAST_MS } from './LetterScreen.jsx';
import { findChapterRoute } from '../footnotes.js';
import { letterRoute } from '../letter-links.js';
import { useVotCorpus } from '../corpus.js';
import { scrollBehavior } from '../../utils/reduced-motion.js';
import { chapterNext, curly } from '../studies-facts.js';
import {
  MATTHEW_KEY, MATTHEW_OVERLINE, verseKey, rowLine, NOTES_VIEWS, useMatthewView, matthewSettings, hasVerse, votNote,
  noteRoute, inlineRuns, noteVerse,
} from '../matthew-facts.js';

const g = /** @type {any} */ (globalThis);

/* ── The index (5h) ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * @param {{ study: any, place: { current: string | null, read: string[] }, gate: any, go: (r: any) => void }} props
 */
export function MatthewIndex({ study, place, gate, go }) {
  const book = g.MATTHEW || null;
  const live = !gate;
  const audio = React.useMemo(() => chapterAudio(MATTHEW_KEY, gate), [gate]);
  const curRef = React.useRef(/** @type {HTMLButtonElement | null} */ (null));
  // a real visit brings the chapter you are on into view, as main's index does (a gate keeps its picture's scroll)
  React.useEffect(() => {
    const el = curRef.current;
    if (gate || !el || typeof el.scrollIntoView !== 'function') return;
    const r = el.getBoundingClientRect();
    if (r.bottom > (g.innerHeight || 0) - 80) el.scrollIntoView({ block: 'center' });
  }, [gate]);
  const read = new Set(place.read);
  // .mtx: the kit's Matthew page (the place's content keeps its own class)
  return (
    <div className="mtx">
      <div className="page-head g">
        <span className="overline eyebrow">{MATTHEW_OVERLINE}</span>
        <h1 className="display">{(book && book.title) || 'Matthew'}</h1>
        {book && book.subtitle && <p className="lede">{book.subtitle}</p>}
        {audio && <ChapterListenPill gate={gate} book={MATTHEW_KEY} chapter={null} volKey={audio.volKey} label={audio.label} />}
      </div>
      <div className="rows end mti">
        {(study.chapters || []).map((ch) => {
          const id = String(ch.num);
          const current = id === place.current;
          const line = rowLine(ch, live);
          return (
            <button key={id} type="button" ref={current ? curRef : undefined} className={'row num-row stc mtr' + (current ? ' cur' : '')}
              aria-current={current ? 'true' : undefined}
              onClick={() => go({ place: 'study-chapter', study: study.id, chapter: id })}>
              <span className="no">{ch.num}</span>
              <span className="tx"><span className="t">{ch.title || 'Chapter ' + ch.num}</span>{line && <span className="s">{line}</span>}</span>
              {read.has(id) && <span className="rd" aria-label="Read"><Icon name="check" /></span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Study notes (5i-5k) ─────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * main's ModeToggle in the kit (.msw): a caption, then PDF | Inline | Off, one pressed. It lives in the shell's layer, over
 * the page and outside its scroll, bottom right above the tab bar (studies.css places it; hidden while auto-scroll's
 * pill is open, main's app.css:631).
 * @param {{ mode: import('../matthew-facts.js').NotesMode, onPick: (m: import('../matthew-facts.js').NotesMode) => void }} props
 */
export function StudyNotesSwitch({ mode, onPick }) {
  const layer = React.useContext(SheetLayer);
  const card = (
    <div className="msw" role="group" aria-labelledby="msw-c" data-zone="msw">
      <span className="label" id="msw-c">Study notes</span>
      <div className="seg">
        {NOTES_VIEWS.map((v) => (
          <button key={v.id} type="button" className={mode === v.id ? 'on' : ''} aria-pressed={mode === v.id} title={v.title}
            onClick={() => { if (v.id !== mode) onPick(v.id); }}>
            <Icon name={v.icon} />{v.label}
          </button>
        ))}
      </div>
    </div>
  );
  return layer && g.ReactDOM && typeof g.ReactDOM.createPortal === 'function' ? g.ReactDOM.createPortal(card, layer) : card;
}

/* ── The notes ───────────────────────────────────────────────────────────────────────────────────────────────────── */

/** @typedef {{ onRef: (s: any) => void, onNote: (n: any, dest: any) => void, live: boolean, votTick: number }} NoteActs */

/**
 * One Scripture reference: a button with its chevron when main has the verse, else plain words (markable, as main's).
 * @param {{ s: any, hlKey: string, acts: NoteActs }} props
 */
function RefRow({ s, hlKey, acts }) {
  if (hasVerse(s)) {
    return (
      <button type="button" className="sref" onClick={() => acts.onRef(s)}>
        <span className="tag num">{s.ref}</span><span className="ct">{s.cite}</span><span className="chev"><Icon name="chev" /></span>
      </button>
    );
  }
  return (
    <div className="sref pl" data-hl-key={hlKey} data-hl-dom="true">
      <span className="tag num">{s.ref}</span><span className="ct">{s.cite}</span>
    </div>
  );
}

/**
 * One Volumes of Truth note: its reference, volume and chevron (or main's HM), the letter's title, the excerpt (three
 * lines). A button when its letter resolves; plain words otherwise.
 * @param {{ n: any, hlKey: string, acts: NoteActs }} props
 */
function VotRow({ n, hlKey, acts }) {
  const { vol, dest, hm } = votNote(n);
  const tap = !!dest;
  const badge = hm ? <span className="hm" title="Hidden Manna — The Word of The Lord Spoken to Timothy">HM</span>
    : tap ? <span className="chev"><Icon name="chev" /></span> : null;
  const inner = (
    <>
      <span className="vh"><span className="tag num">{n.ref}</span>{vol && <span className="vol">{vol}</span>}{badge}</span>
      <span className="vt">{'“' + curly(n.letter || '') + '”'}</span>
      {n.excerpt && <span className="vx">{n.excerpt}</span>}
    </>
  );
  return tap
    ? <button type="button" className="vnote" onClick={() => acts.onNote(n, dest)}>{inner}</button>
    : <div className="vnote" data-hl-key={hlKey} data-hl-dom="true">{inner}</div>;
}

/**
 * PDF (5i, 5j): the panels after the verses, kit cards (main's StudyPanels; no counts; a panel with no rows not drawn),
 * the end of the text, then Further study (main draws it in both views).
 * @param {{ ch: any, pdf: boolean, acts: NoteActs }} props
 */
const Panels = React.memo(/** @param {{ ch: any, pdf: boolean, acts: NoteActs }} props */ function Panels({ ch, pdf, acts }) {
  const base = verseKey(ch.num, 'panel');
  const scr = pdf ? ch.scriptures || [] : [];
  const vot = pdf ? ch.votNotes || [] : [];
  const links = Array.isArray(ch.links) ? ch.links : [];
  return (
    <div className="g spn">
      {scr.length > 0 && (
        <section className="spg sp-scr">
          <h2 className="label">Scripture references</h2>
          <div className="spc">{scr.map((s, i) => <RefRow key={'s' + i} s={s} hlKey={base + '-s' + i} acts={acts} />)}</div>
        </section>
      )}
      {vot.length > 0 && (
        <section className="spg sp-vot">
          <h2 className="label">Volumes of Truth notes</h2>
          <div className="spc">{vot.map((n, i) => <VotRow key={'v' + i} n={n} hlKey={base + '-v' + i} acts={acts} />)}</div>
        </section>
      )}
      {/* the end of the text (main's sentinel): auto-scroll comes to rest here, before Further study */}
      <span className="reading-end" aria-hidden="true" />
      {links.length > 0 && (
        <section className="spg sp-fur">
          <h2 className="label">Further study</h2>
          <div className="spc">
            {links.map((l, i) => (
              <a key={i} className="slink" href={l.url} target="_blank" rel="noopener noreferrer">
                <span className="t">{l.label}</span><Icon name="link" />
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
});

/**
 * A verse: its number and its words (the box main's painter marks), then any pills back to a note above it.
 * @param {{ ch: any, v: any, echo: string[], onEcho: ((ref: string) => void) | null }} props
 */
function Verse({ ch, v, echo, onEcho }) {
  const key = verseKey(ch.num, v.n);
  return (
    <>
      <span className="v" id={'v-' + v.n} data-read-seg={'v' + v.n} data-hl-key={key}>
        <span className="vn">{v.n}</span>
        <span className="vt" data-hl-key={key} data-hl-dom="true">{v.text}</span>
        {echo.map((ref) => (
          <React.Fragment key={ref}>
            {' '}
            <button type="button" className="echo" title={'See note at ' + ref} aria-label={'See note at ' + ref}
              onClick={() => onEcho && onEcho(ref)}><Icon name="arrowUp" />{ref}</button>
          </React.Fragment>
        ))}
      </span>{' '}
    </>
  );
}

const NO_ECHO = /** @type {string[]} */ ([]);

/**
 * The verses in the view chosen. Memoised: React never re-renders words main's painter has split (a new view, or the
 * letters' corpus arriving, is a new body).
 * @param {{ ch: any, mode: string, echoes: boolean, acts: NoteActs, bodyRef: any }} props
 */
const Verses = React.memo(/** @param {{ ch: any, mode: string, echoes: boolean, acts: NoteActs, bodyRef: any }} props */
  function Verses({ ch, mode, echoes, acts, bodyRef }) {
    const onEcho = (/** @type {string} */ ref) => {
      const n = noteVerse(ref);
      const el = n != null && bodyRef.current ? bodyRef.current.querySelector('#v-' + n) : null;
      if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
    };
    if (mode !== 'inline') {
      return <p>{(ch.verses || []).map((v) => <Verse key={v.n} ch={ch} v={v} echo={NO_ECHO} onEcho={null} />)}</p>;
    }
    return inlineRuns(ch, echoes).map((run, i) => (
      <React.Fragment key={i}>
        <p>{run.verses.map((x) => <Verse key={x.v.n} ch={ch} v={x.v} echo={x.echo} onEcho={onEcho} />)}</p>
        {run.notes && (
          <div className="inl">
            {run.notes.scriptures.map((s, j) => <RefRow key={'s' + j} s={s} hlKey={verseKey(ch.num, run.verses[run.verses.length - 1].v.n) + '-s' + j} acts={acts} />)}
            {run.notes.votNotes.map((n, j) => <VotRow key={'v' + j} n={n} hlKey={verseKey(ch.num, run.verses[run.verses.length - 1].v.n) + '-v' + j} acts={acts} />)}
          </div>
        )}
      </React.Fragment>
    ));
  });

/* ── A chapter (5i-5k) ───────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * One Matthew chapter. `study` is v2's Matthew row (studies-facts), `ch` main's MATTHEW chapter.
 * @param {{ study: any, ch: any, gate: any, go: (r: any) => void, replace: (r: any) => void, onReady: () => void,
 *   desktop: boolean, facts: any }} props
 */
export function MatthewChapter({ study, ch, gate, go, replace, onReady, desktop, facts }) {
  const live = !gate;
  const view = useMatthewView(gate);
  const set = matthewSettings(facts);
  // the letters' corpus (main's resolveVotLetter reads it), asked for in the background as main's matthew-ch route does;
  // the notes are drawn again when it lands (a note's chevron, its tap)
  const votStatus = useVotCorpus();
  const vot = { tick: votStatus === 'ready' ? 1 : 0, settled: votStatus !== 'loading' };
  const bodyRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const audio = React.useMemo(() => chapterAudio(MATTHEW_KEY, gate), [gate]);
  const [refOpen, setRefOpen] = React.useState(/** @type {{ kind: 'ref', ref: string } | null} */ (null));
  const [toast, setToast] = React.useState(/** @type {import('../player/listen.jsx').Toast | null} */ (null));
  React.useEffect(() => {
    if (!toast || gate) return undefined;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast, gate]);
  // main's highlights on the verses and the plain notes, painted again when the view or the notes change
  useMainMarks(live, [ch.num, view.mode, vot.tick].join('|'));
  // ready once the notes can say where they go (a gate's picture draws the chevrons); a real page at once
  React.useEffect(() => { if (live || vot.settled) onReady(); }, [live, vot.settled, onReady]);

  // the rows' taps, stable across renders (the verses are memoised against them)
  const goRef = React.useRef(go);
  goRef.current = go;
  const acts = React.useMemo(() => /** @type {NoteActs} */ ({
    live,
    votTick: vot.tick,
    onRef: (s) => setRefOpen({ kind: 'ref', ref: s.cite }),
    onNote: (n, dest) => {
      if (!live) return;
      const r = noteRoute(dest, n.excerpt, letterRoute);
      if (r) goRef.current(r);
    },
  }), [live, vot.tick]);
  const closeRef = () => setRefOpen(null);
  const goToRef = (parsed) => {
    setRefOpen(null);
    findChapterRoute(parsed).then((r) => { if (r) go(r); });
  };

  const nx = chapterNext(study, ch);
  const titled = set.titles && !!ch.title;
  return (
    <div className="mtx">
      <div className="page-head g reader-head">
        <span className="overline eyebrow">{MATTHEW_OVERLINE}</span>
        <h1 className="display">{'Matthew ' + ch.num}</h1>
        {titled && !view.hideSummary && (
          <p className="lede"><button type="button" className="sum" title="Tap to hide summary"
            onClick={() => view.setHideSummary(true)}>{ch.title}</button></p>
        )}
        {titled && view.hideSummary && (
          <button type="button" className="textbtn sm sum-show" aria-label="Show chapter summary"
            onClick={() => view.setHideSummary(false)}>+ Show summary</button>
        )}
        {audio && <ChapterListenPill gate={gate} book={MATTHEW_KEY} chapter={ch.num} volKey={audio.volKey} label={audio.label} onToast={setToast} />}
      </div>
      <div className={'body g bible mtb' + (view.mode === 'inline' ? ' inline' : '')} ref={bodyRef}
        data-copy-key={'study:' + MATTHEW_KEY + '-' + ch.num}>
        <Verses key={view.mode + ':' + vot.tick} ch={ch} mode={view.mode} echoes={set.echoes} acts={acts} bodyRef={bodyRef} />
      </div>
      {view.mode === 'off' ? <span className="reading-end" aria-hidden="true" /> : <Panels ch={ch} pdf={view.mode === 'pdf'} acts={acts} />}
      {nx && (
        <div className="g mt-next">
          <button type="button" className="nextcard" onClick={() => (nx.replace ? replace(nx.route) : go(nx.route))}>
            <span className="tx"><span className="k">{nx.k}</span><span className="t">{nx.t}</span></span>
            <span className="chev"><Icon name="chev" /></span>
          </button>
        </div>
      )}
      {/* the verse being read, lit: main's read-along over the verses' study keys */}
      {audio && (
        <ChapterReadAlong gate={gate} book={MATTHEW_KEY} chapter={ch.num} volKey={audio.volKey} bodyRef={bodyRef}
          on={facts.readAlong !== false} follow={facts.readAlongFollow !== false} keyOf={verseKey} />
      )}
      <StudyNotesSwitch mode={view.mode} onPick={view.setMode} />
      {refOpen && (
        <RefSheet open={refOpen} letter={{ nkjv: g.MATTHEW_NKJV || null }} items={[]} desktop={desktop} onClose={closeRef}
          onGo={live ? goToRef : closeRef} onRead={closeRef} onStep={() => {}} />
      )}
      <LayerToast text={toast && toast.text} icon={toast && toast.icon} />
    </div>
  );
}
