/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/web-panel — the docked panel. Cluster F (bundle-d)
   ═══════════════════════════════════════════════════════════════════════

   ONE panel at the right edge of the web (spec section 3 "Horizontal: the
   panel open" and 4.6; pictures r2-02 PC, r2-06 phone), in place of the
   three floating cards it replaces (the chooser, the Nearby list, the detail
   sheet). It stays mounted while anything is open and changes what it shows:

     list        Nearby: the lit chapter, then its threads (listItems)
     chooser     a tap between close threads: strongest first, each row
                 lighting its thread, then "Zoom to <chapter>"
     connection  a thread: both verses in full in the reader's translation,
                 the Volumes' citations of either, MORE FROM each end
     verse       one verse: its text, its citations, its threads by book
     group       a chapter or a bundle: its threads by book, then the zoom row
     letter      a letter of the Volumes: the verses it cites
     myweb       a link of the reader's own or one of Timothy's threads (the
                 endpoint cards, unchanged)

   Its classes keep the hooks the screen's tests and the gesture layer use:
   the container is .sw-panel plus .sw-list / .sw-choice / .sw-sheet by mode
   (gestures.js SW_CHROME_SELECTOR: the panel is chrome, so a finger on it
   scrolls the panel instead of panning the web).

   Focus (digest #46): role=dialog, aria-modal=false, NO trap. The panel takes
   focus when it opens (Tab then walks into it and on out to the page), takes
   it back only when a change of subject dropped it on <body>, and hands it to
   where the reader was when it closes (useFocusTrap's modal:false return).

   Everything it lists is read at render (panel-model.js), and it re-renders
   when the Bible or the Volumes corpus lands (BRIDGES.md __bibleCorpus /
   __votCorpus) or the Bible Studies load, so a panel opened before them
   fills in (digest B5). The lit set is written through lightThreads only:
   verse mode's own (the threads it lists), a row under hover or focus, a
   book group's header under hover or focus.
   ═══════════════════════════════════════════════════════════════════════ */

import { ConnectionRow } from './connection-row.jsx';
import {
  connectionTitle, connectionMeta, sheetEyebrow, sheetMeta, listEyebrow, listMeta, arcLine, plural, timesWord, followLabel, followLabelShort,
  verseEndpoint, verseTextFor,
} from '../../utils/scripture-web/describe.js';
import {
  GROUP_ROWS, verseText, shortRef, connectionModel, verseModel, rangeModel, letterRows, zoomChapterOf, chapterName,
} from '../../utils/scripture-web/panel-model.js';
import { refOfVerse } from '../../utils/scripture-web/pick.js';
import { windowCorpus, letterKeyOf } from '../../utils/scripture-web/vot-citations.js';
import { litKeyOf } from '../../utils/scripture-web/focus-state.js';

/** Citations shown before "Show n more". */
export const CITED_SHOWN = 2;
/** A quote longer than this many characters is clamped at four lines with "more". */
const QUOTE_LONG = 180;

/** @type {any} */
let corpus = null;
/** vot-citations' corpus over the window's globals; it reads them at call time, so one serves. */
function corpusNow() {
  if (!corpus) corpus = windowCorpus(typeof window !== 'undefined' ? window : globalThis);
  return corpus;
}

/** The letter keys the graph's citations carry, once per graph: a "Verses it cites" link only for a
 * letter letter mode can open. @type {WeakMap<object, Set<string>>} */
const LETTER_KEYS = new WeakMap();
/** @param {any} g */
function letterKeys(g) {
  let s = LETTER_KEYS.get(g);
  if (!s) {
    s = new Set();
    for (const e of (g && Array.isArray(g.votEdges) ? g.votEdges : [])) {
      const k = e && (e.key || letterKeyOf(e));
      if (k) s.add(k);
    }
    LETTER_KEYS.set(g, s);
  }
  return s;
}

/**
 * A lazy corpus's version (index.html's __makeLazyLoader: subscribe / getVersion), so the panel
 * re-renders when it lands. 0 where the loader is absent (tests).
 * @param {string} name  '__bibleCorpus' | '__votCorpus'
 */
function useCorpusVersion(name) {
  const subscribe = React.useCallback((/** @type {() => void} */ cb) => {
    const c = /** @type {any} */ (window)[name];
    return c && typeof c.subscribe === 'function' ? c.subscribe(cb) : () => {};
  }, [name]);
  return React.useSyncExternalStore(subscribe, () => {
    const c = /** @type {any} */ (window)[name];
    return c && typeof c.getVersion === 'function' ? c.getVersion() : 0;
  });
}

/** What the panel shows for an open card. @param {any} d */
export function modeOfDetail(d) {
  if (!d) return null;
  if (d.kind === 'arc') return 'connection';
  if (d.kind === 'verse') return 'verse';
  if (d.kind === 'chapter' || d.kind === 'bundle') return 'group';
  if (d.kind === 'letter') return 'letter';
  return 'myweb';
}

/** One key per subject: a new one scrolls the panel to the top and resets what was expanded. A
 * Follow along the same connection keeps it. @param {string} mode @param {any} d @param {any[]} [choices] */
export function subjectKey(mode, d, choices) {
  if (mode === 'list') return 'list';
  if (mode === 'chooser') return 'choose:' + (choices || []).map((c) => c.kind + c.index).join(',');
  if (!d) return '';
  if (d.kind === 'arc') return 'arc:' + (d.index >= 0 ? d.index : 'p' + d.prophecyIndex);
  if (d.kind === 'verse') return 'verse:' + d.verse;
  if (d.kind === 'chapter') return 'ch:' + d.chapterIndex;
  if (d.kind === 'bundle') return 'b:' + d.lo + '-' + d.hi;
  if (d.kind === 'letter') return 'l:' + d.letterKey;
  return d.kind + ':' + d.index;
}

/** The chooser's rows strongest first (A5: "sort rows by strength and say which"); a My Web row keeps
 * its place. @param {any[]} rows */
export function strongestFirst(rows) {
  return rows.map((r, i) => ({ r, i }))
    .sort((x, y) => (x.r.kind === 'arc' && y.r.kind === 'arc' ? (y.r.votes - x.r.votes) || (x.r.span - y.r.span) : 0) || x.i - y.i)
    .map((x) => x.r);
}

function Chevron({ open }) {
  return (
    <svg className={'sw-chev' + (open ? ' is-open' : '')} viewBox="0 0 24 24" width="18" height="18" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/** A section with a tracked-caps head; `collapsible` makes the head a disclosure button. */
function Section({ title, collapsible = false, startOpen = true, children, className = '' }) {
  const [open, setOpen] = React.useState(startOpen);
  const shown = !collapsible || open;
  return (
    <section className={'sw-sec ' + className}>
      {collapsible ? (
        <button type="button" className="sw-sec-head sw-sec-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="sw-sec-title">{metaItems(title)}</span><Chevron open={open} />
        </button>
      ) : <h3 className="sw-sec-head"><span className="sw-sec-title">{metaItems(title)}</span></h3>}
      {shown ? children : null}
    </section>
  );
}

/**
 * An "A ↔ B" title as two boxes (app.css .sw-title-end), so the line breaks at the arrow and
 * never inside a reference (w4: the phone read "Isaiah 11:1 ↔ Revelation" / "22:16"). The text
 * reads as before; any other title is itself.
 */
function titleEnds(title) {
  if (typeof title !== 'string') return title;
  const at = title.indexOf(' ↔ ');
  if (at < 0) return title;
  return (
    <>
      <span className="sw-title-end">{title.slice(0, at + 2)}</span>{' '}
      <span className="sw-title-end">{title.slice(at + 3)}</span>
    </>
  );
}

/** The panel's head: overline, title, meta (spec 4.6 items 1-3). */
function PanelHead({ over, title, meta }) {
  return (
    <div className="sw-panel-head">
      <div className="sw-sheet-eyebrow sw-panel-over">{over}</div>
      {title ? <h2 className="sw-panel-title">{titleEnds(title)}</h2> : null}
      {meta ? <div className="sw-sheet-meta sw-panel-meta">{metaItems(meta)}</div> : null}
    </div>
  );
}

/** A meta item up to this long is kept whole (metaItems); a longer one is a sentence and wraps. */
const META_WHOLE = 32;

/**
 * A line of items joined by " · " that breaks only between its items and leaves no "·" hanging
 * (w3 review round 2; w4). The phone verse panel read "48 connections · cited in the Volumes 5 /
 * times"; keeping each item whole (84da5587c) then read "48 connections ·" / "cited in the Volumes
 * 5 times". So each item after the first carries its separator at its own head, in a padding the
 * row is pulled left by, and the line clips that strip (app.css, .sw-dots): whichever item starts
 * a line, its dot is in the clipped strip, and every dot left on screen has words on both sides.
 * The text reads as before (" · " between the items). A long item (Nearby's sentence) wraps
 * inside itself.
 * @param {any} meta  a string, or anything else to render as it is
 */
function metaItems(meta) {
  if (typeof meta !== 'string' || meta.indexOf(' · ') < 0) return meta;
  return (
    <span className="sw-dots">
      {meta.split(' · ').map((item, i) => (
        <span key={i} className={'sw-dot-item' + (item.length > META_WHOLE ? ' is-long' : '')}>
          {i ? <span className="sw-dot-sep"> · </span> : null}{item}
        </span>
      ))}
    </span>
  );
}

/**
 * A crumb's words: the place the trail holds, its book abbreviated as a verse crumb's is ("Whole
 * web", "Romans", "John 3", "Isa 7:14"). w4: each crumb named the verse under the centre when the
 * step was taken, so the whole web read "Ps 103:2" (the verse mid-canon) and a book its first
 * verse; the label is what the go-to and the journey say the place is (goto.jsx hereLabel).
 * @param {any} g @param {{ verse: number, label: string }} c
 */
export function crumbText(g, c) {
  const label = typeof c.label === 'string' ? c.label : '';
  if (label === 'the whole web') return 'Whole web';
  if (!(c.verse >= 0 && c.verse < g.total)) return label;
  const r = refOfVerse(g, c.verse);
  if (!label) return shortRef(g, c.verse);
  if (r.abbr && label.indexOf(r.bookTitle + ' ') === 0) return r.abbr + label.slice(r.bookTitle.length);
  return label;
}

/** One verse in full, with "Open in reader ›" (and, for the far end of a connection, its Follow). */
function VerseBlock({ block, heading = true, onOpen, extra = null }) {
  return (
    <div className="sw-verse">
      {heading ? <h3 className="sw-verse-ref">{block.ref.label}</h3> : null}
      <p className={'sw-verse-text' + (block.text ? '' : ' is-pending')}>{block.text || 'The verse is still loading.'}</p>
      <div className="sw-links">
        <button type="button" className="sw-link" onClick={() => onOpen(block.endpoint)}
          aria-label={'Open ' + block.ref.label + ' in the reader'}>Open in reader <span aria-hidden="true">›</span></button>
        {extra}
      </div>
    </div>
  );
}

/**
 * A citing passage's quote: two lines (r2-02), then "more" when the clamp cuts it. w4: "more" asked
 * the text's length (QUOTE_LONG) and not the clamp, so on a phone, where two lines hold about 100
 * characters, a 150-character quote was cut with no way to read the rest. Where there is layout
 * the clamp is measured (and again when the panel's width or the Text Size moves it); the length
 * stands in only where nothing is laid out.
 */
function Quote({ text, children }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(/** @type {HTMLParagraphElement | null} */ (null));
  const [cut, setCut] = React.useState(text.length > QUOTE_LONG);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || open) return undefined;
    const measure = () => { if (el.clientHeight > 0) setCut(el.scrollHeight > el.clientHeight + 1); };
    measure();
    if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, open]);
  const long = cut || open;
  return (
    <React.Fragment>
      <p ref={ref} className={'sw-cite-quote' + (open ? '' : ' is-clamped')}>{text}</p>
      {/* "more" ends the passage's own row of links (w4: on a row of its own it cost a line a quote) */}
      <div className="sw-links">
        {children}
        {long ? (
          <button type="button" className="sw-link sw-link-quiet sw-quote-more" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? 'less' : 'more'}
          </button>
        ) : null}
      </div>
    </React.Fragment>
  );
}

/** CITED IN THE VOLUMES · n (omitted at 0): each citing passage with its letter, collection, quote and
 * "Open letter ›" at the citing paragraph (B4). `showCites` names the passage each one cites. */
function CitedSection({ g, cited, showCites, startOpen, onOpen, openPanel }) {
  const [all, setAll] = React.useState(false);
  if (!cited.length) return null;
  const keys = letterKeys(g);
  const shown = all ? cited : cited.slice(0, CITED_SHOWN);
  return (
    <Section title={'Cited in the Volumes · ' + cited.length} collapsible startOpen={startOpen} className="sw-sec-cited">
      <ul className="sw-cites">
        {shown.map((c) => {
          const links = (
            <React.Fragment>
              {c.endpoint ? (
                <button type="button" className="sw-link" onClick={() => onOpen(c.endpoint)}
                  aria-label={'Open ' + c.title + ' where it cites ' + c.cites}>
                  {c.collection === 'studies' ? 'Open study' : 'Open letter'} <span aria-hidden="true">›</span>
                </button>
              ) : null}
              {keys.has(c.letterKey) ? (
                <button type="button" className="sw-link sw-link-quiet"
                  onClick={() => openPanel({ mode: 'letter', letterKey: c.letterKey }, { back: true })}
                  aria-label={'The verses ' + c.title + ' cites'}>Verses it cites <span aria-hidden="true">›</span></button>
              ) : null}
            </React.Fragment>
          );
          return (
            <li className="sw-cite" key={c.key}>
              <div className="sw-cite-title">{c.title}</div>
              <div className="sw-cite-source">{metaItems(c.collectionName + (showCites(c) ? ' · ' + c.cites : ''))}</div>
              {c.excerpt ? <Quote text={c.excerpt}>{links}</Quote> : <div className="sw-links">{links}</div>}
            </li>
          );
        })}
      </ul>
      {cited.length > shown.length ? (
        <button type="button" className="sw-more" onClick={() => setAll(true)}>Show {cited.length - shown.length} more</button>
      ) : null}
    </Section>
  );
}

/** "Zoom to <chapter>": the panel closes and the chapter fills the web (Q7). */
function ZoomRow({ g, chapterIndex, zoomTo }) {
  if (!(chapterIndex >= 0) || !g.chapters[chapterIndex]) return null;
  const name = chapterName(g, chapterIndex);
  return (
    <button type="button" className="sw-zoom-row" onClick={() => zoomTo(chapterIndex)}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5M11 8.5v5M8.5 11h5" />
      </svg>
      <span>Zoom to {name}</span>
    </button>
  );
}

/**
 * Threads grouped by the book of their other end, canon order, strongest first in each (spec 4.6
 * item 7): a 44 px header per book ("Isaiah · 6") with a chevron, the first open; GROUP_ROWS rows,
 * then "Show n more". A header under hover or focus lights its group's threads.
 */
function ThreadGroups({ groups, tagOf, translation, rowProps, light }) {
  const [open, setOpen] = React.useState(() => new Set(groups.length ? [groups[0].book] : []));
  const [more, setMore] = React.useState(() => new Set());
  const toggle = (book) => setOpen((s) => { const n = new Set(s); if (n.has(book)) n.delete(book); else n.add(book); return n; });
  return (
    <ul className="sw-groups">
      {groups.map((grp) => {
        const isOpen = open.has(grp.book);
        const rows = more.has(grp.book) ? grp.rows : grp.rows.slice(0, GROUP_ROWS);
        const ids = grp.rows.map((r) => r.index);
        return (
          <li className="sw-group" key={grp.book}>
            <button type="button" className="sw-group-head" aria-expanded={isOpen} onClick={() => toggle(grp.book)}
              onMouseEnter={() => light(ids)} onMouseLeave={() => light(null)}
              onFocus={() => light(ids)} onBlur={() => light(null)}>
              <span className="sw-group-title">{grp.title} · {grp.rows.length.toLocaleString()}</span>
              <Chevron open={isOpen} />
            </button>
            {isOpen ? (
              <ul className="sw-rows">
                {rows.map((r) => (
                  <ConnectionRow key={r.index} title={r.other.label} tag={tagOf(r)}
                    text={verseText(r.other, translation)} {...rowProps(r)} />
                ))}
              </ul>
            ) : null}
            {isOpen && grp.rows.length > rows.length ? (
              <button type="button" className="sw-more" onClick={() => setMore((s) => new Set(s).add(grp.book))}>
                Show {(grp.rows.length - rows.length).toLocaleString()} more
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The docked panel. The screen mounts it while anything is open; it decides the mode (list over
 * chooser over card, the precedence the state already has).
 * @param {{
 *   graph: any, mode: string, density: any, translation?: string, compact?: boolean,
 *   listOpen: boolean, listItems: any[], lensOn: boolean, choices: any[] | null, choiceChapter?: number,
 *   choiceCut?: boolean, detail: any,
 *   journey?: any, onClose: () => void, onChoose: (found: any, opts?: any) => void,
 *   openPanel: (spec: any, opts?: any) => boolean, followThread: (info: any) => void,
 *   followRow: (row: any) => void, zoomTo: (chapterIndex: number) => void,
 *   onOpen: (endpoint: any) => void, lightThreads: (ids: ArrayLike<number> | null) => void,
 * }} props
 */
export function WebPanel(props) {
  const {
    graph: g, mode: webMode, density, translation, compact = false, listOpen, listItems, lensOn, choices, choiceChapter = -1,
    choiceCut = false, detail,
    journey, onClose, onChoose, openPanel, followThread, followRow, zoomTo, onOpen, lightThreads,
  } = props;
  const mode = listOpen ? 'list' : choices && choices.length ? 'chooser' : modeOfDetail(detail);
  const key = subjectKey(mode, detail, choices);

  // no trap (digest #46): useFocusTrap's modal:false only hands focus back on close. It is called
  // BEFORE the panel's own focus below, so it remembers where the reader was, not the panel.
  const ref = useFocusTrap(true, { modal: false });
  const bodyRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const firstRef = React.useRef(true);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    const a = document.activeElement;
    if (firstRef.current || !a || a === document.body) {
      try { el.focus({ preventScroll: true }); } catch (_e) { /* best-effort */ }
    }
    firstRef.current = false;
  }, [key, ref]);

  const bibleV = useCorpusVersion('__bibleCorpus');
  const votV = useCorpusVersion('__votCorpus');
  // the Bible Studies, loaded when a study citation is on show without them (its excerpt reads them)
  const [studiesV, setStudiesV] = React.useState(0);

  // the mode's model, read at render; read again when a corpus or the Studies land (one shape per
  // mode, so typed loosely here; panel-model.js types each)
  const model = /** @type {any} */ (React.useMemo(() => {
    if (!g || !detail || mode === 'list' || mode === 'chooser') return null;
    const opts = { density, translation, corpus: corpusNow() };
    if (mode === 'connection') return connectionModel(g, detail, opts);
    if (mode === 'verse') return verseModel(g, detail.verse, opts);
    if (mode === 'group') return rangeModel(g, detail.lo, detail.hi, density);
    if (mode === 'letter') return { rows: letterRows(g, detail.letterKey, translation) };
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the versions are the trigger: the model reads globals they fill
  }, [g, detail, mode, density, translation, bibleV, votV, studiesV]));
  const cited = model && model.cited ? model.cited : [];
  const wantStudies = cited.some((c) => c.collection === 'studies' && !c.excerpt);
  React.useEffect(() => {
    if (!wantStudies || typeof BIBLE_STUDIES !== 'undefined' || typeof loadBibleStudies !== 'function') return undefined;
    let live = true;
    Promise.resolve(loadBibleStudies()).then(() => { if (live) setStudiesV((n) => n + 1); });
    return () => { live = false; };
  }, [wantStudies]);

  // the lit set this mode keeps (verse mode: the threads it lists); a row lights its own over it
  const base = mode === 'verse' && model && model.threads ? model.threads.ids : null;
  const light = React.useCallback((/** @type {ArrayLike<number> | null} */ ids) => {
    if (webMode === 'personal' || typeof lightThreads !== 'function') return;
    lightThreads(ids && ids.length ? ids : base);
  }, [lightThreads, base, webMode]);
  // verse mode keeps its own lit set current: a density change re-lists its threads and the lit set
  // follows (w3 review: it stayed the set the verse was opened at). Keyed on the ids, not the array,
  // so a corpus landing (the same threads) does not take a row's light back
  const baseKey = litKeyOf(base);
  React.useEffect(() => {
    if (mode !== 'verse' || webMode === 'personal' || typeof lightThreads !== 'function') return;
    lightThreads(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- baseKey is base's content: the trigger
  }, [mode, baseKey, webMode, lightThreads]);

  if (!g || !mode) return null;
  const containerClass = 'sw-panel ' + (mode === 'list' ? 'sw-list' : mode === 'chooser' ? 'sw-choice' : 'sw-sheet');
  const label = mode === 'list' ? 'Nearby connections' : mode === 'chooser' ? 'Connections here'
    : sheetEyebrow(detail) + ' details';
  const closeLabel = mode === 'list' ? 'Close nearby connections' : mode === 'chooser' ? 'Close connection choices' : 'Close';

  /** A thread row's actions (spec 4.6: [Open] [Follow]; the row itself shows that connection). */
  const rowProps = (/** @type {any} */ r) => ({
    onMain: () => openPanel({ mode: 'connection', arc: r.index }),
    mainLabel: r.other.label + ', ' + plural(r.votes, 'vote', 'votes') + ': show this connection',
    onOpen: () => onOpen(verseEndpoint(r.other)), openLabel: 'Open ' + r.other.label + ' in the reader',
    onFollow: () => followRow(r), followLabel: 'Follow the line from ' + r.here.label + ' to ' + r.other.label,
    onLight: (/** @type {boolean} */ on) => light(on ? [r.index] : null),
  });
  const votesTag = (/** @type {any} */ r) => plural(r.votes, 'vote', 'votes');
  const fromTag = (/** @type {any} */ r) => 'from ' + shortRef(g, r.hereVerse);
  const sortNote = <p className="sw-sort-note">Strongest first in each book.</p>;

  let body = null;
  if (mode === 'list') {
    // the canon list leads with the chapter it reads (landing 15); My Web lists the reader's links
    const chapter = webMode !== 'personal' && listItems[0] && listItems[0].kind === 'chapter' ? listItems[0] : null;
    body = (
      <React.Fragment>
        <PanelHead over={listEyebrow(webMode, chapter, lensOn)} title={null} meta={listMeta(chapter, listItems.length)} />
        {listItems.length ? (
          <ul className="sw-rows sw-choice-list">
            {listItems.map((item, i) => (
              <ConnectionRow key={i} title={connectionTitle(item)} text={connectionMeta(item)}
                mainClass={'sw-choice-row' + (item.kind === 'chapter' ? ' sw-choice-chapter' : '')}
                onMain={() => onChoose(item)}
                onLight={item.kind === 'arc' ? (on) => light(on ? [item.index] : null) : undefined} />
            ))}
          </ul>
        ) : <div className="sw-list-empty">{webMode === 'personal' ? 'You have no links on the web yet.' : 'No nearby connections at this location.'}</div>}
      </React.Fragment>
    );
  } else if (mode === 'chooser') {
    const rows = strongestFirst(choices || []);
    const arcs = rows.filter((r) => r.kind === 'arc').map((r) => r.index);
    body = (
      <React.Fragment>
        <PanelHead over="Connections here"
          title={choiceCut ? 'The ' + rows.length + ' nearest threads' : plural(rows.length, 'thread', 'threads') + ' close together'}
          meta="Choose the one you meant. Strongest first." />
        <ul className="sw-rows sw-choice-list">
          {rows.map((c) => (
            <ConnectionRow key={c.kind + c.index} title={connectionTitle(c)} text={connectionMeta(c)} mainClass="sw-choice-row"
              onMain={() => onChoose(c)}
              onLight={c.kind === 'arc' ? (on) => light(on ? [c.index] : null) : undefined} />
          ))}
        </ul>
        {webMode !== 'personal' && arcs.length ? <ZoomRow g={g} chapterIndex={choiceChapter >= 0 ? choiceChapter : zoomChapterOf(g, arcs)} zoomTo={zoomTo} /> : null}
      </React.Fragment>
    );
  } else if (mode === 'connection' && model) {
    const farVerse = detail.far === 'to' ? detail.to : detail.from;
    const farEnd = detail.far === 'to' ? detail.b : detail.a;
    // compact, the short words, so Follow shares "Open in reader"'s row (w4; describe.js)
    const followWords = (compact ? followLabelShort : followLabel)(farEnd.label);
    const follow = (
      <button type="button" className="sw-link sw-follow" onClick={() => followThread(detail)}
        aria-label={followWords}><span className="sw-follow-label">{metaItems(followWords)}</span> <span aria-hidden="true">›</span></button>
    );
    body = (
      <React.Fragment>
        <PanelHead over="Connection" title={connectionTitle(detail)} meta={arcLine(detail)} />
        <div className="sw-sec sw-verses">
          {model.ends.map((e) => (
            <VerseBlock key={e.verse} block={e} onOpen={onOpen} extra={e.verse === farVerse ? follow : null} />
          ))}
        </div>
        <CitedSection g={g} cited={cited} showCites={() => true} startOpen={!compact} onOpen={onOpen} openPanel={openPanel} />
        {model.more.map((m, i) => (
          <Section key={m.verse} collapsible startOpen={i === 0} className="sw-sec-more"
            title={'More from ' + m.ref.label + ' · ' + plural(m.total, 'connection', 'connections')}>
            {m.total ? (
              <React.Fragment>
                {sortNote}
                <ThreadGroups groups={m.groups} tagOf={votesTag} translation={translation} rowProps={rowProps} light={light} />
              </React.Fragment>
            ) : <p className="sw-panel-empty">No other threads at this density.</p>}
          </Section>
        ))}
      </React.Fragment>
    );
  } else if (mode === 'verse' && model) {
    const n = model.threads.total;
    body = (
      <React.Fragment>
        <PanelHead over="Verse" title={model.ref.label}
          meta={plural(n, 'connection', 'connections') + (cited.length ? ' · cited in the Volumes ' + timesWord(cited.length) : '')} />
        <div className="sw-sec sw-verses"><VerseBlock block={model} heading={false} onOpen={onOpen} /></div>
        <CitedSection g={g} cited={cited} showCites={(c) => c.cites !== model.ref.label} startOpen={!compact}
          onOpen={onOpen} openPanel={openPanel} />
        <Section title={'Connections · ' + n.toLocaleString()} className="sw-sec-more">
          {n ? (
            <React.Fragment>
              {sortNote}
              <ThreadGroups groups={model.threads.groups} tagOf={votesTag} translation={translation} rowProps={rowProps} light={light} />
            </React.Fragment>
          ) : <p className="sw-panel-empty">No threads at this density.</p>}
        </Section>
      </React.Fragment>
    );
  } else if (mode === 'group' && model) {
    const n = model.threads.total;
    const chapter = detail.kind === 'chapter';
    const title = chapter ? detail.book.title + ' ' + detail.chapter : detail.label;
    const endpoint = chapter
      ? { type: 'bible', key: 'bible:' + detail.book.id + ':' + detail.chapter + ':1', bookId: detail.book.id,
        chapter: detail.chapter, verse: 1, verseEnd: detail.verses, label: title }
      : (detail.cards && detail.cards[0] && detail.cards[0].endpoint) || null;
    body = (
      <React.Fragment>
        <PanelHead over={chapter ? 'Chapter' : 'Bundle'} title={title}
          meta={(chapter ? plural(detail.verses, 'verse', 'verses') + ' · ' : '') + plural(n, 'connection', 'connections')} />
        {endpoint ? (
          <div className="sw-links sw-sec">
            <button type="button" className="sw-link" onClick={() => onOpen(endpoint)}
              aria-label={'Open ' + (endpoint.label || title) + ' in the reader'}>Open in reader <span aria-hidden="true">›</span></button>
          </div>
        ) : null}
        <Section title={'Connections · ' + n.toLocaleString()} className="sw-sec-more">
          {n ? (
            <React.Fragment>
              {sortNote}
              <ThreadGroups groups={model.threads.groups} tagOf={fromTag} translation={translation} rowProps={rowProps} light={light} />
            </React.Fragment>
          ) : <p className="sw-panel-empty">No threads at this density.</p>}
        </Section>
        {webMode !== 'personal' ? <ZoomRow g={g} chapterIndex={model.zoom} zoomTo={zoomTo} /> : null}
      </React.Fragment>
    );
  } else if (mode === 'letter' && model) {
    const rows = model.rows;
    body = (
      <React.Fragment>
        <PanelHead over="In the Volumes" title={detail.title} meta={detail.collectionName} />
        {detail.endpoint ? (
          <div className="sw-links sw-sec">
            <button type="button" className="sw-link" onClick={() => onOpen(detail.endpoint)}
              aria-label={'Open ' + detail.title}>Open letter <span aria-hidden="true">›</span></button>
          </div>
        ) : null}
        <Section title={'Verses it cites · ' + rows.length.toLocaleString()} className="sw-sec-more">
          <ul className="sw-rows">
            {rows.map((r) => (
              <ConnectionRow key={r.verse + '-' + r.verseEnd} title={r.label} text={r.text}
                onMain={() => openPanel({ mode: 'verse', verse: r.verse }, { back: true })}
                mainLabel={r.label + ': show its connections'}
                onOpen={() => onOpen(r.endpoint)} openLabel={'Open ' + r.label + ' in the reader'} />
            ))}
          </ul>
        </Section>
      </React.Fragment>
    );
  } else if (detail) {
    // My Web: the reader's link or Timothy's thread, its two endpoint cards as before
    const cards = detail.cards || [];
    body = (
      <React.Fragment>
        <PanelHead over={sheetEyebrow(detail)} title={connectionTitle(detail)} meta={sheetMeta(detail)} />
        <div className="sw-sheet-cards">
          {cards.map((card, i) => {
            const ep = card.endpoint;
            const preview = (ep && ep.type === 'bible' && !card.preview ? verseTextFor(ep) : '') || card.preview;
            return (
              <button type="button" className="sw-card" key={i} disabled={!ep}
                aria-label={ep ? 'Open ' + card.label + ' in the reader' : card.label}
                onClick={() => ep && onOpen(ep)}>
                <span className="sw-card-eyebrow">{card.eyebrow}</span>
                <span className="sw-card-label">{card.label}</span>
                {card.cat ? <span className="sw-card-cat">{card.cat}</span> : null}
                {preview ? <span className="sw-card-preview">{preview}</span> : null}
                {ep ? <span className="sw-card-go">Open in reader &rsaquo;</span> : null}
              </button>
            );
          })}
        </div>
      </React.Fragment>
    );
  }

  // the way back: the card this one was opened from (a letter from a citation, a verse from a letter)
  const parent = mode !== 'list' && mode !== 'chooser' && detail && detail.parent ? detail.parent : null;
  const parentName = parent ? (parent.kind === 'letter' ? parent.title : parent.kind === 'verse' ? parent.ref.label
    : parent.kind === 'arc' ? connectionTitle(parent) : sheetEyebrow(parent)) : '';
  // the Follow trail (use-journey.js: the navigation stream keeps it): "Gen 3:15 › Isa 7:14 › Matt 1:23"
  const stack = journey && Array.isArray(journey.stack) ? journey.stack : [];
  const crumbs = mode === 'connection' && stack.length >= 2 ? stack : null;
  // Back is the journey's alone: back() flies home and reopens what was open there on landing
  // (use-journey.js); a fly of the panel's own after it took that fly over, so nothing reopened
  const back = () => { if (journey && typeof journey.back === 'function') journey.back(); };
  const credit = webMode !== 'personal' && mode !== 'myweb' && g.attribution
    ? <div className="sw-panel-credit">{g.attribution}</div> : null;

  return (
    <div className={containerClass} ref={ref} tabIndex={-1} role="dialog" aria-modal="false" aria-label={label}
      data-mode={mode} data-lens-on={mode === 'list' ? (lensOn ? '1' : '0') : undefined}>
      <button type="button" className="sw-sheet-close" onClick={onClose} aria-label={closeLabel}>
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
      <div className="sw-panel-body" ref={bodyRef}>
        {crumbs ? (
          <nav className="sw-crumbs" aria-label="Your trail">
            <button type="button" className="sw-crumbs-back" onClick={back} aria-label="Back along the trail">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <ol>
              {crumbs.map((c, i) => (
                <li key={i} className={i === crumbs.length - 1 ? 'is-here' : undefined} aria-current={i === crumbs.length - 1 ? 'location' : undefined}>
                  {crumbText(g, c)}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        {parent ? (
          <button type="button" className="sw-back-link" onClick={() => onChoose(parent, { frame: false })}>
            <span aria-hidden="true">‹ </span>Back to {parentName}
          </button>
        ) : null}
        <div className="sw-panel-content" key={key}>{body}</div>
        {compact ? credit : null}
      </div>
      {compact ? null : credit}
    </div>
  );
}
