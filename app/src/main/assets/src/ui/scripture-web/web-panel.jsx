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
     exits       a chip of a "+n" pill's fan (exits.js): the lines it counts,
                 lit, by the book they go to, each with Open and Follow
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
  connectionTitle, connectionMeta, sheetEyebrow, sheetMeta, listEyebrow, listMeta, arcLine, plural, timesWord, followLabel, openInReaderLabel,
  verseTextFor, WHOLE_WEB, exitsWords, endsOf,
  goOnTitle, goOnRowLabel, allByBookLabel, cameFromLabel, backToLabel, forwardToLabel, pathsLabel, pathsMeta, forkLabel,
} from '../../utils/scripture-web/describe.js';
import {
  GROUP_ROWS, verseText, shortRef, connectionModel, verseModel, rangeModel, letterRows, zoomChapterOf, chapterName,
  exitsModel, waysOn, cameFrom,
} from '../../utils/scripture-web/panel-model.js';
import { refOfVerse } from '../../utils/scripture-web/pick.js';
import { windowCorpus, letterKeyOf } from '../../utils/scripture-web/vot-citations.js';
import { litKeyOf } from '../../utils/scripture-web/focus-state.js';
import { scrollBehavior } from '../../utils/reduced-motion.js';
import { stopOf, branchesOf, visitedOf } from './use-journey.js';
import { showsStop } from './use-web-selection.js';

/** Citations shown before "Show n more". */
export const CITED_SHOWN = 2;
/** A stop's strongest ways on, before "All n by book": the phone's panel holds fewer above the fold. */
export const GO_ON_SHOWN = 6;
export const GO_ON_SHOWN_COMPACT = 4;
/** The trail bar's right-hand fade, CSS px (app.css .sw-trail-stops' mask): the stop where the reader
 * is is scrolled clear of it. */
const TRAIL_FADE = 18;
/** Where nothing is laid out to measure (jsdom, a first render), a quote longer than this many
 * characters stands in for one the two-line clamp cuts, and is offered "more" (Quote measures the
 * clamp itself wherever there is layout). */
const QUOTE_LONG = 180;
/** The band under the close X once the body scrolls (app.css .sw-panel[data-scrolled]::before),
 * CSS px: its height on PC and compact, which is also the scroll over which it comes in whole. */
const BAND_H = 60;
const BAND_H_COMPACT = 54;

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
  if (d.kind === 'exits') return 'exits';
  return 'myweb';
}

/** One key per subject: a new one scrolls the panel to the top and resets what was expanded. A
 * Follow along the same connection keeps it. @param {string} mode @param {any} d @param {any[]} [choices] */
export function subjectKey(mode, d, choices) {
  if (mode === 'list') return 'list';
  if (mode === 'chooser') return 'choose:' + (choices || []).map((c) => c.kind + c.index).join(',');
  if (!d) return '';
  if (d.kind === 'arc') return 'arc:' + (d.index >= 0 ? d.index : 'p' + d.prophecyIndex);
  if (d.kind === 'verse') return 'verse:' + d.verse + (d.verseEnd > d.verse ? '-' + d.verseEnd : '');
  if (d.kind === 'chapter') return 'ch:' + d.chapterIndex;
  if (d.kind === 'bundle') return 'b:' + d.lo + '-' + d.hi;
  if (d.kind === 'letter') return 'l:' + d.letterKey;
  if (d.kind === 'exits') return 'x:' + d.key;
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

/** A section with a tracked-caps head; `collapsible` makes the head a disclosure button. The head
 * is named in the title's own case (w4 screen-reader hunt): the CSS capitals went into the
 * accessible name, and some readers spell an all-caps word letter by letter. */
function Section({ title, collapsible = false, startOpen = true, children, className = '' }) {
  const [open, setOpen] = React.useState(startOpen);
  const shown = !collapsible || open;
  const name = typeof title === 'string' ? title : undefined;
  // A section opened at the panel's foot shows its rows (Corbin, 2026-10-22: "More from Nehemiah
  // 1:5 · 8 connections" opened with its rows under the edge, so the toggle seemed to do nothing).
  // `nearest` leaves a section already in view alone, shows a short one whole and brings a tall
  // one's head to the top, in the panel's own layout, so a turned phone (.sw-rotated) is right too.
  const ref = React.useRef(/** @type {HTMLElement | null} */ (null));
  const opened = React.useRef(false);
  React.useEffect(() => {
    if (!opened.current || !open || !ref.current || typeof ref.current.scrollIntoView !== 'function') return;
    opened.current = false;
    ref.current.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() });
  }, [open]);
  return (
    <section className={'sw-sec ' + className} ref={ref}>
      {collapsible ? (
        <button type="button" className="sw-sec-head sw-sec-toggle" aria-expanded={open} aria-label={name} onClick={() => { opened.current = !open; setOpen(!open); }}>
          <span className="sw-sec-title">{metaItems(title)}</span><Chevron open={open} />
        </button>
      ) : <h3 className="sw-sec-head" aria-label={name}><span className="sw-sec-title">{metaItems(title)}</span></h3>}
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
  if (label === WHOLE_WEB) return 'Whole web';
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
          aria-label={openInReaderLabel(block.ref.label)}>Open in reader <span aria-hidden="true">›</span></button>
        {extra}
      </div>
    </div>
  );
}

/** A crumb's name for a screen reader: the stop's own label where the crumb abbreviates it. */
function crumbName(g, s) {
  const text = crumbText(g, s);
  return s.label && s.label !== text && s.label !== WHOLE_WEB ? s.label : undefined;
}

/** The words of the crumb where the reader is: a plain span, where an aria-label goes unread (h1104-7),
 * so a short crumb ("Matt 1:23") is hidden from a screen reader and its full name said instead. */
function hereName(g, s) {
  const text = crumbText(g, s);
  const name = crumbName(g, s);
  return name ? <React.Fragment><span aria-hidden="true">{text}</span><span className="sw-sr-only">{name}</span></React.Fragment> : text;
}

/** A stop's verse in its own words, for the paths view: '' for a place (a book, a chapter, the
 * whole web) or a range, which the label names alone. */
function stopText(g, s, translation) {
  if (!(s.verse >= 0 && s.verse < g.total)) return '';
  const r = refOfVerse(g, s.verse);
  return s.label === r.label ? verseText(r, translation) : '';
}

/**
 * Where the trail bar's row scrolls (2026-11-03): the stop where the reader is whole and clear of
 * the right edge's fade, with as many stops before it as fit, the first of them from its own edge.
 * h1104-7: with that stop the last, the row's end clamped the scroll short, so the row began inside
 * the stop before ("7:14 › Matt 1:23 › Isa 9:6", once the paths button narrowed it); `endRoom` is
 * the room the row's end needs for the scroll to reach a stop's edge.
 * @param {{ starts: number[], hereAt: number, hereWidth: number, pad: number, width: number,
 *   scrollWidth: number, fade?: number }} m  where each stop's words start in the row's content
 * @returns {{ scrollLeft: number, endRoom: number }}
 */
export function trailScroll({ starts, hereAt, hereWidth, pad, width, scrollWidth, fade = TRAIL_FADE }) {
  const room = width - pad - fade;
  const end = starts[hereAt] + hereWidth;
  let first = hereAt;
  while (first > 0 && end - starts[first - 1] <= room) first--;
  // and never short of what the stop where the reader is needs to clear the fade
  const want = Math.max(0, first > 0 ? starts[first] - pad : 0, end - (width - fade));
  const max = Math.max(0, scrollWidth - width);
  return { scrollLeft: want, endRoom: Math.max(0, Math.ceil(want - max)) };
}

const ICON = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6,
  strokeLinecap: /** @type {'round'} */ ('round'), strokeLinejoin: /** @type {'round'} */ ('round'), 'aria-hidden': true };

/**
 * THE TRAIL BAR (2026-11-03; mockup r1-phone): pinned over the panel's scroll, so the way back is
 * always in reach. Back and Forward; then the path as crumbs, from where the trail set out, through
 * where the reader is (gold), on along the way they went last (dimmer, ahead), each a stop to go to
 * in one flight; then the paths button once the reader has gone more than one way. Where the panel
 * shows something else than the stop the reader is at (a line tapped on the way), Back is the way
 * back to that stop, and its crumb a button.
 * @param {{ g: any, journey: any, atHere: boolean, branches: number, pathsOpen: boolean,
 *   onPaths: () => void, onMove: () => void }} p
 */
function TrailBar({ g, journey, atHere, branches, pathsOpen, onPaths, onMove }) {
  const { path, here, trail } = journey;
  const stopsRef = React.useRef(/** @type {HTMLOListElement | null} */ (null));
  // the crumb where the reader is stays in view as the trail grows: the row scrolls sideways to
  // show it whole with as many stops before it as fit, starting at a stop's own edge, never mid-word
  const hereId = here ? here.id : -1;
  // the paths button, once there, narrows the row
  const forked = branches > 1;
  React.useLayoutEffect(() => {
    const ol = stopsRef.current;
    const el = ol && ol.querySelector('.is-here');
    if (!el) return;
    ol.style.paddingRight = '';
    const lis = Array.from(ol.children);
    const left = ol.getBoundingClientRect().left - ol.scrollLeft;
    // a stop's words (its "›" before them is the li's own): where they start and end in the row
    const words = (/** @type {Element} */ li) => (li.firstElementChild || li).getBoundingClientRect();
    const cs = getComputedStyle(ol);
    const { scrollLeft, endRoom } = trailScroll({
      starts: lis.map((li) => words(li).left - left), hereAt: lis.indexOf(el), hereWidth: words(el).width,
      pad: parseFloat(cs.paddingLeft) || 0, width: ol.clientWidth, scrollWidth: ol.scrollWidth,
    });
    if (endRoom > 0) ol.style.paddingRight = (parseFloat(cs.paddingRight) || 0) + endRoom + 'px';
    ol.scrollLeft = scrollLeft;
  }, [hereId, path.stops.length, forked]);
  if (!here) return null;
  const back = !atHere ? here : stopOf(trail, here.parent);
  const ahead = here.last >= 0 ? stopOf(trail, here.last) : null;
  const act = (/** @type {() => any} */ f) => () => { onMove(); f(); };
  return (
    <nav className="sw-trail" aria-label="Your path">
      <button type="button" className="sw-trail-btn" onClick={act(() => journey.back())} disabled={!back}
        aria-label={back ? backToLabel(back.label || crumbText(g, back)) : 'Back'}>
        <svg {...ICON}><path d="M15 18l-6-6 6-6" /></svg>
      </button>
      <button type="button" className="sw-trail-btn" onClick={act(() => journey.forward())} disabled={!(atHere && ahead)}
        aria-label={atHere && ahead ? forwardToLabel(ahead.label || crumbText(g, ahead)) : 'Forward'}>
        <svg {...ICON}><path d="M9 6l6 6-6 6" /></svg>
      </button>
      <ol className="sw-trail-stops" ref={stopsRef}>
        {path.stops.map((s, i) => {
          const isHere = i === path.here;
          return (
            <li key={s.id} className={isHere ? 'is-here' : i > path.here ? 'is-ahead' : undefined}>
              {isHere && atHere ? <span className="sw-trail-at" aria-current="location">{hereName(g, s)}</span> : (
                <button type="button" className="sw-crumb" onClick={act(() => journey.go(s.id))}
                  aria-current={isHere ? 'location' : undefined} aria-label={crumbName(g, s)}>{crumbText(g, s)}</button>
              )}
            </li>
          );
        })}
      </ol>
      {branches > 1 ? (
        <button type="button" className={'sw-trail-paths' + (pathsOpen ? ' is-on' : '')} onClick={onPaths}
          aria-pressed={pathsOpen} aria-label={pathsLabel(branches)}>
          <svg {...ICON} width={18} height={18}><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="9" r="2" /><path d="M6 7v10M18 11c0 4-6 3-11.2 6.5" /></svg>
          <span aria-hidden="true">{branches}</span>
        </button>
      ) : null}
    </nav>
  );
}

/** A stop's way in (2026-11-03): the verse its thread came from, quiet, with the thread's votes; the
 * whole line is the way back there. */
function CameFrom({ from, onBack }) {
  return (
    <button type="button" className="sw-came" onClick={onBack} aria-label={backToLabel(from.ref.label)}>
      <span className="sw-came-top">
        <svg className="sw-came-icon" {...ICON} width={16} height={16}><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
        <span className="sw-came-ref">{cameFromLabel(from.ref.label)}</span>
        {from.votes != null ? <span className="sw-came-votes">{plural(from.votes, 'vote', 'votes')}</span> : null}
      </span>
      {from.text ? <span className="sw-came-text">{from.text}</span> : null}
    </button>
  );
}

/**
 * YOUR PATHS (2026-11-03; mockup r1-paths): every way the reader has gone, as a transit map. The
 * first path runs down from where the trail set out; each other way on is a path of its own, under
 * a fork naming the stop it left. Each stop goes there in one flight, with its verse's words; where
 * the reader is, is said. Clear asks a second tap (nothing to undo it with).
 * @param {{ g: any, journey: any, translation?: string, onDone: () => void }} p
 */
function PathsView({ g, journey, translation, onDone }) {
  const branches = branchesOf(journey.trail);
  const [arming, setArming] = React.useState(false);
  React.useEffect(() => {
    if (!arming) return undefined;
    const t = setTimeout(() => setArming(false), 4000);
    return () => clearTimeout(t);
  }, [arming]);
  const hereId = journey.here ? journey.here.id : -1;
  return (
    <React.Fragment>
      <PanelHead over="Your paths" title={null} meta={pathsMeta(branches.length, journey.trail.stops.length)} />
      <ol className="sw-paths">
        {branches.map((b) => (
          <li key={b.stops[0].id} className={'sw-path' + (b.from ? ' is-fork' : '') + (b.current ? ' is-current' : '')}>
            <ol className="sw-path-stops">
              {/* a path that leaves another begins at the stop it leaves from, small and hollow */}
              {b.from ? (
                <li className="sw-path-stop is-from">
                  <button type="button" className="sw-path-go" onClick={() => { onDone(); journey.go(/** @type {any} */ (b.from).id); }}
                    aria-label={forkLabel(b.from.label || crumbText(g, b.from))}>
                    <span className="sw-path-top"><span className="sw-path-ref">{forkLabel(b.from.label === WHOLE_WEB ? 'the whole web' : b.from.label || crumbText(g, b.from))}</span></span>
                  </button>
                </li>
              ) : null}
              {b.stops.map((s) => {
                const isHere = s.id === hereId;
                const text = stopText(g, s, translation);
                return (
                  <li key={s.id} className={'sw-path-stop' + (isHere ? ' is-here' : '')}>
                    <button type="button" className="sw-path-go" aria-current={isHere ? 'location' : undefined}
                      onClick={() => { onDone(); journey.go(s.id); }}>
                      <span className="sw-path-top">
                        <span className="sw-path-ref">{s.label === WHOLE_WEB ? 'Whole web' : s.label || crumbText(g, s)}</span>
                        {isHere ? <span className="sw-path-here">You are here</span> : null}
                      </span>
                      {text ? <span className="sw-path-text">{text}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ol>
      <button type="button" className={'sw-paths-clear' + (arming ? ' is-arming' : '')}
        onClick={() => { if (arming) { onDone(); journey.clear(); } else setArming(true); }}>
        {arming ? 'Tap again to clear your paths' : 'Clear paths'}
      </button>
    </React.Fragment>
  );
}

/**
 * A citing passage's quote: two lines (r2-02), then "more" when the clamp cuts it. w4: "more" asked
 * the text's length (QUOTE_LONG) and not the clamp, so on a phone, where two lines hold about 100
 * characters, a 150-character quote was cut with no way to read the rest. Where there is layout
 * the clamp is measured (and again when the panel's width or the Text Size moves it); the length
 * stands in only where nothing is laid out.
 */
function Quote({ text, title, children }) {
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
        {/* each passage's own "more", so a list of them is not "more, more, more" (ideas audit s27.1) */}
        {long ? (
          <button type="button" className="sw-link sw-link-quiet sw-quote-more" aria-expanded={open} onClick={() => setOpen(!open)}
            aria-label={title ? (open ? 'less of ' : 'more of ') + title : undefined}>
            {open ? 'less' : 'more'}
          </button>
        ) : null}
      </div>
    </React.Fragment>
  );
}

/** CITED IN THE VOLUMES · n (omitted at 0): each citing passage with its letter, collection, quote and
 * "Open letter ›" at the citing paragraph (B4). `showCites` names the passage each one cites;
 * `onRetry`, when the Bible Studies failed to load, loads them again (their quotes read them). */
function CitedSection({ g, cited, showCites, startOpen, onOpen, openPanel, onRetry = null }) {
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
              {c.excerpt ? <Quote text={c.excerpt} title={c.title}>{links}</Quote> : <div className="sw-links">{links}</div>}
            </li>
          );
        })}
      </ul>
      {onRetry ? (
        <p className="sw-panel-empty sw-cite-failed">
          The study text did not load.{' '}
          <button type="button" className="sw-link" onClick={onRetry}>Try again</button>
        </p>
      ) : null}
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
  // a group opened by its header shows its rows, as a Section does (the dead-control hunt,
  // 2026-10-22: "Deuteronomy · 46" opened with every row under the panel's edge)
  const items = React.useRef(/** @type {Map<number, HTMLLIElement>} */ (new Map()));
  const opened = React.useRef(/** @type {number | null} */ (null));
  React.useEffect(() => {
    const book = opened.current;
    opened.current = null;
    const el = book == null ? null : items.current.get(book);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() });
  }, [open]);
  const toggle = (book) => setOpen((s) => {
    const n = new Set(s);
    if (n.has(book)) n.delete(book); else { n.add(book); opened.current = book; }
    return n;
  });
  return (
    <ul className="sw-groups">
      {groups.map((grp) => {
        const isOpen = open.has(grp.book);
        const rows = more.has(grp.book) ? grp.rows : grp.rows.slice(0, GROUP_ROWS);
        const ids = grp.rows.map((r) => r.index);
        return (
          <li className="sw-group" key={grp.book}
            ref={(el) => { if (el) items.current.set(grp.book, el); else items.current.delete(grp.book); }}>
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
 *   pathsOpen?: boolean, setPathsOpen?: (open: boolean) => void,
 * }} props
 */
export function WebPanel(props) {
  const {
    graph: g, mode: webMode, density, translation, compact = false, listOpen, listItems, lensOn, choices, choiceChapter = -1,
    choiceCut = false, detail,
    journey, onClose, onChoose, openPanel, followThread, followRow, zoomTo, onOpen, lightThreads,
  } = props;
  // the paths view's switch: the screen's when it passes one (so Escape and Back see it), else its own
  const [ownPaths, setOwnPaths] = React.useState(false);
  const pathsOpen = props.setPathsOpen ? !!props.pathsOpen : ownPaths;
  const setPathsOpen = props.setPathsOpen || setOwnPaths;
  const mode = listOpen ? 'list' : choices && choices.length ? 'chooser' : modeOfDetail(detail);
  const key = subjectKey(mode, detail, choices);
  // the trail (use-journey.js): where the reader is on it, and whether this panel shows that stop
  const trail = journey && journey.trail ? journey.trail : null;
  const here = journey && journey.here ? journey.here : null;
  const atHere = !!here && showsStop(here, detail, choices, listOpen);
  // a verse panel at the stop the reader is at: its thread in is where they came from, not a way on
  const via = atHere && mode === 'verse' && here.via && !here.via.prophecy ? here.via.arc : -1;
  const stopCount = trail ? trail.stops.length : 0;
  // the trail bar (use-journey.js: the navigation stream keeps the trail) once the reader has gone
  // somewhere from where they set out: pinned over the scroll, in every mode but My Web's
  const trailShown = webMode !== 'personal' && !!here && stopCount >= 2;
  // the paths view, over whatever the panel shows; a new subject puts it away
  React.useEffect(() => { setPathsOpen(false); }, [key, setPathsOpen]);
  // and a closed panel leaves it put away for the next time it opens
  React.useEffect(() => () => setPathsOpen(false), [setPathsOpen]);
  const showPaths = pathsOpen && trailShown;
  const contentKey = showPaths ? 'paths' : key;

  // no trap (digest #46): useFocusTrap's modal:false only hands focus back on close. It is called
  // BEFORE the panel's own focus below, so it remembers where the reader was, not the panel.
  const ref = useFocusTrap(true, { modal: false });
  const bodyRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  // the body scrolled off its top: app.css lays a band under the pinned close X (w4 review). It
  // comes in with the scroll (--sw-scrolled, 0 to 1), whole once the head has scrolled the band's
  // own height: switched on whole, its solid top hid the trail a 3 px nudge had barely moved
  const [scrolled, setScrolled] = React.useState(false);
  const bandH = compact ? BAND_H_COMPACT : BAND_H;
  const onBodyScroll = React.useCallback((/** @type {any} */ e) => {
    const top = e.currentTarget.scrollTop;
    const el = ref.current;
    if (el) el.style.setProperty('--sw-scrolled', String(Math.min(1, Math.max(0, top) / bandH)));
    const s = top > 1;
    setScrolled((was) => (was === s ? was : s));
  }, [ref, bandH]);
  const firstRef = React.useRef(true);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    el.style.setProperty('--sw-scrolled', '0');
    setScrolled(false);
    const a = document.activeElement;
    if (firstRef.current || !a || a === document.body) {
      try { el.focus({ preventScroll: true }); } catch (_e) { /* best-effort */ }
    }
    firstRef.current = false;
    // Your paths opens on where the reader is (h1104-7): on a phone a later path's foot is below the fold
    const at = contentKey === 'paths' && bodyRef.current ? bodyRef.current.querySelector('.sw-path-stop.is-here') : null;
    if (at && typeof at.scrollIntoView === 'function') at.scrollIntoView({ block: 'nearest' });
  }, [contentKey, ref]);

  const bibleV = useCorpusVersion('__bibleCorpus');
  const votV = useCorpusVersion('__votCorpus');
  // the Bible Studies, loaded when a study citation is on show without them (its excerpt reads them)
  const [studiesV, setStudiesV] = React.useState(0);
  // the load failed (loadBibleStudies resolves false, or threw): the cited section says so and
  // offers Try again, as the Studies screen does (n6-09), not quotes missing for good (s27.2)
  const [studiesFailed, setStudiesFailed] = React.useState(false);
  const [studiesTry, setStudiesTry] = React.useState(0);

  // the mode's model, read at render; read again when a corpus or the Studies land (one shape per
  // mode, so typed loosely here; panel-model.js types each)
  const model = /** @type {any} */ (React.useMemo(() => {
    if (!g || !detail || mode === 'list' || mode === 'chooser') return null;
    const opts = { density, translation, corpus: corpusNow() };
    if (mode === 'connection') return connectionModel(g, detail, opts);
    if (mode === 'verse') return verseModel(g, detail.verse, Object.assign(opts, { verseEnd: detail.verseEnd, skip: via }));
    if (mode === 'group') return rangeModel(g, detail.lo, detail.hi, density);
    if (mode === 'letter') return { rows: letterRows(g, detail.letterKey, translation) };
    if (mode === 'exits') return exitsModel(g, detail);
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the versions are the trigger: the model reads globals they fill
  }, [g, detail, mode, density, translation, via, bibleV, votV, studiesV]));
  const cited = model && model.cited ? model.cited : [];
  const wantStudies = cited.some((c) => c.collection === 'studies' && !c.excerpt);
  React.useEffect(() => {
    if (!wantStudies || typeof BIBLE_STUDIES !== 'undefined' || typeof loadBibleStudies !== 'function') return undefined;
    let live = true;
    Promise.resolve(loadBibleStudies()).then((ok) => {
      if (!live) return;
      setStudiesFailed(ok === false);
      setStudiesV((n) => n + 1);
    }, () => { if (live) setStudiesFailed(true); });
    return () => { live = false; };
  }, [wantStudies, studiesTry]);
  const retryStudies = studiesFailed && wantStudies
    ? () => { setStudiesFailed(false); setStudiesTry((n) => n + 1); } : null;

  // the lit set this mode keeps (verse mode: the threads it lists; exits mode: the lines it counts,
  // lit when it opened); a row lights its own over it. A stop the reader came to along a thread
  // lights only the ways on it lists first (2026-11-03): the web then shows the path in, the path
  // behind, and the few ways the panel offers, not every thread of the verse over the chain
  const goShown = compact ? GO_ON_SHOWN_COMPACT : GO_ON_SHOWN;
  const ways = React.useMemo(() => (mode === 'verse' && model && model.threads ? waysOn(model.threads) : null), [mode, model]);
  const firstWays = React.useMemo(() => (via >= 0 && ways ? ways.slice(0, goShown).map((r) => r.index) : null), [via, ways, goShown]);
  const base = mode === 'verse' && model && model.threads ? (firstWays || model.threads.ids)
    : mode === 'exits' && detail && detail.ids ? detail.ids : null;
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

  /** A thread row (2026-11-03): a way on. The whole row follows the thread to the verse it names
   * (followRow: that verse becomes a stop of the trail, its panel opens there), and says whether
   * the reader has stood there on one of their paths. Open in reader is the stop's own. */
  const visited = trail ? visitedOf(trail) : null;
  const rowProps = (/** @type {any} */ r) => {
    const seen = !!visited && visited.has(r.otherVerse);
    return {
      go: true, visited: seen,
      onMain: () => followRow(r),
      mainLabel: goOnRowLabel(r.other.label, r.votes, seen),
      onLight: (/** @type {boolean} */ on) => light(on ? [r.index] : null),
    };
  };
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
    // a thread's far end in its own words, so close threads tell apart by more than a reference
    // (ideas audit A10.6): the end away from the tapped chapter, else the later one
    const quoteOf = (/** @type {any} */ c) => {
      if (c.kind !== 'arc') return '';
      const near = (/** @type {number} */ v) => choiceChapter >= 0 && g.chapterOfVerse[v] === choiceChapter;
      const end = near(c.from) && !near(c.to) ? c.b : near(c.to) && !near(c.from) ? c.a : endsOf(c)[1];
      const text = verseText(end, translation);
      return text ? end.label + ' ' + text : '';
    };
    const arcs = rows.filter((r) => r.kind === 'arc').map((r) => r.index);
    body = (
      <React.Fragment>
        <PanelHead over="Connections here"
          title={choiceCut ? 'The ' + rows.length + ' nearest threads' : plural(rows.length, 'thread', 'threads') + ' close together'}
          meta="Choose the one you meant. Strongest first, by readers’ votes." />
        <ul className="sw-rows sw-choice-list">
          {rows.map((c) => (
            <ConnectionRow key={c.kind + c.index} title={connectionTitle(c)} text={connectionMeta(c)} quote={quoteOf(c)} mainClass="sw-choice-row"
              onMain={() => onChoose(c)}
              onLight={c.kind === 'arc' ? (on) => light(on ? [c.index] : null) : undefined} />
          ))}
        </ul>
        {webMode !== 'personal' && arcs.length ? <ZoomRow g={g} chapterIndex={choiceChapter >= 0 ? choiceChapter : zoomChapterOf(g, arcs)} zoomTo={zoomTo} /> : null}
      </React.Fragment>
    );
  } else if (mode === 'connection' && model) {
    // "Follow to <that end>" on each end (2026-11-03): a line is a fork in the road, and either end
    // is a way on; it shares "Open in reader"'s row (w4; describe.js). The end where the reader
    // stands has none: they are there
    const followTo = (/** @type {any} */ e) => {
      if (here && atHereVerse(here, e.verse)) return null;
      const words = followLabel(e.ref.label);
      const far = e.verse === detail.to ? 'to' : 'from';
      return (
        <button type="button" className="sw-link sw-follow" onClick={() => followThread(Object.assign({}, detail, { far }))}
          aria-label={words}><span className="sw-follow-label">{metaItems(words)}</span> <span aria-hidden="true">›</span></button>
      );
    };
    body = (
      <React.Fragment>
        <PanelHead over="Connection" title={connectionTitle(detail)} meta={arcLine(detail)} />
        <div className="sw-sec sw-verses">
          {model.ends.map((e) => (
            <VerseBlock key={e.verse} block={e} onOpen={onOpen} extra={followTo(e)} />
          ))}
        </div>
        <CitedSection g={g} cited={cited} showCites={() => true} startOpen={!compact} onOpen={onOpen} openPanel={openPanel}
          onRetry={retryStudies} />
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
    // A STOP (2026-11-03; mockup r1-phone): where the reader stands, in full; the verse they came
    // from, quiet, as the way back; then the ways on, strongest first, one tap each; every thread by
    // book under them; then the Volumes' citations
    const n = model.threads.total;
    const shown = (ways || []).slice(0, goShown);
    const from = atHere && here.via ? cameFrom(g, detail.verse, here.via, translation) : null;
    const total = n + (via >= 0 ? 1 : 0);
    // on the phone the way in is one quiet link beside "Open in reader", so the ways on stay above
    // the fold; with room, a block with the verse it came from in its own words
    const fromLink = from && compact ? (
      <button type="button" className="sw-link sw-link-quiet sw-came-link" onClick={() => journey.back()}
        aria-label={backToLabel(from.ref.label)}>
        <svg className="sw-came-icon" {...ICON} width={16} height={16}><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
        {cameFromLabel(shortRef(g, from.verse))}{from.votes != null ? ' · ' + plural(from.votes, 'vote', 'votes') : ''}
      </button>
    ) : null;
    body = (
      <React.Fragment>
        <PanelHead over={detail.verseEnd > detail.verse ? 'Verses' : 'Verse'} title={detail.label || model.ref.label}
          meta={plural(total, 'connection', 'connections') + (cited.length ? ' · cited in the Volumes ' + timesWord(cited.length) : '')} />
        <div className="sw-sec sw-verses"><VerseBlock block={model} heading={false} onOpen={onOpen} extra={fromLink} /></div>
        {from && !compact ? <CameFrom from={from} onBack={() => journey.back()} /> : null}
        <Section title={goOnTitle(n)} className="sw-sec-go">
          {n ? (
            <React.Fragment>
              <ul className="sw-rows sw-go-list">
                {shown.map((r) => (
                  <ConnectionRow key={r.index} title={r.other.label} tag={votesTag(r)} text={verseText(r.other, translation)} {...rowProps(r)} />
                ))}
              </ul>
              {n > shown.length ? (
                <Section key={'all:' + key} title={allByBookLabel(n)} collapsible startOpen={false} className="sw-sec-all">
                  {sortNote}
                  <ThreadGroups groups={model.threads.groups} tagOf={votesTag} translation={translation} rowProps={rowProps} light={light} />
                </Section>
              ) : null}
            </React.Fragment>
          ) : <p className="sw-panel-empty">{from ? 'No other threads at this density.' : 'No threads at this density.'}</p>}
        </Section>
        <CitedSection g={g} cited={cited} showCites={(c) => c.cites !== model.ref.label} startOpen={!compact}
          onOpen={onOpen} openPanel={openPanel} onRetry={retryStudies} />
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
              aria-label={openInReaderLabel(endpoint.label || title)}>Open in reader <span aria-hidden="true">›</span></button>
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
  } else if (mode === 'exits' && model) {
    // a fan chip's lines (exits.js): where they go, by book, each row's Follow taking the reader to
    // its far end; the column's chapter on its zoom row, as group mode has
    const words = exitsWords(detail);
    const n = model.threads.total;
    body = (
      <React.Fragment>
        <PanelHead over={words.over} title={words.title} meta={words.meta} />
        <Section title={'Connections · ' + n.toLocaleString()} className="sw-sec-more">
          {n ? (
            <React.Fragment>
              {sortNote}
              <ThreadGroups groups={model.threads.groups} tagOf={fromTag} translation={translation} rowProps={rowProps} light={light} />
            </React.Fragment>
          ) : <p className="sw-panel-empty">No threads at this density.</p>}
        </Section>
        {webMode !== 'personal' && model.zoom >= 0 ? <ZoomRow g={g} chapterIndex={model.zoom} zoomTo={zoomTo} /> : null}
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
                onOpen={() => onOpen(r.endpoint)} openLabel={openInReaderLabel(r.label)} />
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
                aria-label={ep ? openInReaderLabel(card.label) : card.label}
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
  const branches = trailShown ? branchesOf(/** @type {any} */ (trail)).length : 0;

  return (
    <div className={containerClass} ref={ref} tabIndex={-1} role="dialog" aria-modal="false"
      aria-label={showPaths ? 'Your paths' : label}
      data-mode={showPaths ? 'paths' : mode} data-lens-on={mode === 'list' ? (lensOn ? '1' : '0') : undefined}
      data-scrolled={scrolled ? '1' : undefined} data-trail={trailShown ? '1' : undefined}>
      <button type="button" className="sw-sheet-close" onClick={onClose} aria-label={closeLabel}>
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
      {trailShown ? (
        <TrailBar g={g} journey={journey} atHere={atHere && !showPaths} branches={branches} pathsOpen={showPaths}
          onPaths={() => setPathsOpen(!showPaths)} onMove={() => setPathsOpen(false)} />
      ) : null}
      {/* a document inside the dialog (w4 quality hunt): the screen's root is role="application"
          for the web's keys, and there NVDA and JAWS stop the virtual cursor, so the verses the
          panel exists to show read only in browse mode, which a document turns back on */}
      <div className="sw-panel-body" ref={bodyRef} onScroll={onBodyScroll} role="document">
        {parent && !showPaths ? (
          <button type="button" className="sw-back-link" onClick={() => onChoose(parent, { frame: false })}>
            <span aria-hidden="true">‹ </span>Back to {parentName}
          </button>
        ) : null}
        <div className="sw-panel-content" key={contentKey}>
          {showPaths ? <PathsView g={g} journey={journey} translation={translation} onDone={() => setPathsOpen(false)} /> : body}
        </div>
      </div>
    </div>
  );
}

/** Whether stop `s` is the reader standing at this verse: a verse's stop (a book's or a chapter's
 * stands at its first verse, but is no verse of its own). @param {any} s @param {number} verse */
function atHereVerse(s, verse) {
  return s.verse === verse && (!!s.via || !!(s.open && s.open.mode === 'verse'));
}
