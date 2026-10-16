/* LetterScreen - one letter in v2 (picture 1a-letter: overline, title, Listen, the header lines, a hairline, the text,
   then the next letter). Volumes load lazily (window.__loadVotCorpus, index.html); the screen reports ready once the
   letter's text is on the page.

   Marks (picture 4b-mark-paragraph): a tap on a paragraph opens "Mark this paragraph" (marks.js does the work through
   main's own stores), and main's marks show on the text, painted by main's own painter (applyDOMHighlights, bundle-c)
   whenever its stores change. On the phone the sheet waits out a double tap (DOUBLE_TAP_MS): two taps are full screen
   (readalong's useFullScreen; Corbin 10-14: the double tap wins). A gate boot paints nothing and writes nothing.

   References and footnotes (mw6, pictures 1d-1g): a reference "(1 John 3:12)" or a footnote number opens RefSheet at once
   (a footnote number answers anywhere in a 44 px square round it); a chapter link "[Esther 7]" opens the chapter, Back
   says this letter. The letter's footnotes are listed at its foot (FootnoteList), then its links and songs (LetterFoot,
   dz23). Safari (8d): the first mark or note of
   a session in a Safari tab waits on the 7-day notice (SafariNotice.jsx), its paragraph still lit. */
import { Icon, iconSvg } from '../Icon.jsx';
import { CouldNotOpen } from './CouldNotOpen.jsx';
import { LetterBlock, FormatBBlock, titleClass, isMarkable, renderSegments } from '../letter-text.jsx';
import { letterRoute, findLetterRoute } from '../letter-links.js';
import { isFormatB, formatBRefs, footnoteItems, findChapterRoute } from '../footnotes.js';
import { RefSheet, FootnoteList } from './RefSheet.jsx';
import { collectionHead } from '../collection-facts.js';
import { firstSaveWaits, useSafariNotice } from '../safari-gate.js';
import { wtlbHlKey } from '../../utils/hl-keys.js';
import { definePlace } from '../places.js';
import { LayerToast } from '../Sheet.jsx';
import { MarkSheet } from './MarkSheet.jsx';
import {
  paraKey, paragraphOf, paragraphMark, markParagraph, unmarkParagraph, paragraphNote, lastUsedColour, copyParagraph,
  shareParagraph,
} from '../marks.js';
import { kitColour } from '../notes-facts.js';
import { DOUBLE_TAP_MS, FULLSCREEN_GESTURE_EVENT } from '../../utils/fullscreen-gesture-event.js';
import { ListenPill, gateListenToast, startListening, listenRowFor } from '../player/listen.jsx';
import { readerLine } from '../player/view.js';
import { REPEAT_TIMES } from '../../utils/listen-from.js';
import { LetterReadAlong } from '../player/read-along.jsx';
import { landingOf, markWords, unmarkWords, placeAtThird } from '../search-landing.js';
import { whenPainted } from '../gate.js';
import { MoreButton, findItem, autoScrollItem, sungItem, copyLinkItem, useVerbatimSongs } from '../more-menu.jsx';
import { keySiteLink } from '../../utils/passage-copy.js';
import { LetterFoot } from './LetterFoot.jsx';
import { LinkPicker } from './LinkPicker.jsx';
import { sourceOf, removeLink, dressLinkIcons, gateLinkIcons, linkToast } from '../links.js';

const g = /** @type {any} */ (globalThis);
/** The search routes already landed: Back to one keeps where the reader left it (its words are marked again). */
const LANDED = new WeakSet();
/** A value safe inside a "..." attribute selector. @param {string} v */
const cssValue = (v) => String(v).replace(/["\\]/g, '\\$&');
/** How long a toast stays (main's confirmCopied). */
export const TOAST_MS = 2600;
/** How long a toast that can Undo stays: long enough to read it and reach the button. */
export const UNDO_MS = 6000;

/** @param {string} key */
export function collectionOf(key) {
  const map = g.COL_BY_KEY;
  return map && typeof map.get === 'function' ? map.get(key) || null : null;
}

/** @returns {any[] | null} the collection's letters when its volume is loaded */
function lettersOf(col) {
  return col && Array.isArray(g[col.globalName]) ? g[col.globalName] : null;
}

/** The collection's letters, loading the lazy corpus first when needed (null while it loads); [] when it failed to load
    or there is no such collection (the page then says it could not be opened, and is ready: it never waits on nothing).
    `failed` says the corpus did not load (the collection is known, its letters are not here); `retry` asks again
    (main's loader retries after a failure; v2-gaps 39).
    @returns {{ letters: any[] | null, failed: boolean, retry: () => void }} */
export function useLettersLoad(col) {
  const [letters, setLetters] = React.useState(() => (col ? lettersOf(col) : []));
  const missing = !letters;
  React.useEffect(() => {
    if (!missing || !col) return undefined;
    let live = true;
    const load = g.__loadVotCorpus;
    Promise.resolve(typeof load === 'function' ? load() : null)
      .then(() => { if (live) setLetters(lettersOf(col) || []); }, () => { if (live) setLetters([]); });
    return () => { live = false; };
  }, [col, missing]);
  const failed = !!col && !!letters && !letters.length && !lettersOf(col);
  const retry = React.useCallback(() => setLetters(null), []);
  return { letters, failed, retry };
}

/** The collection's letters (useLettersLoad without its outcome). */
export function useLetters(col) {
  return useLettersLoad(col).letters;
}

/** @param {any[]} letters @param {number} n */
export function letterAt(letters, n) {
  return letters.find((l) => l && l.num === n) || null;
}

/** The collection's preface (Volume One's "A Word of Warning"), or null. */
export function prefaceOf(col) {
  const p = col && col.prefaceGlobal ? g[col.prefaceGlobal] : null;
  return p && p.id ? p : null;
}

/** A store's version (main's CachedStore subscribe / getVersion), 0 when the store is not there. */
function useStoreVersion(store) {
  const subscribe = React.useCallback((cb) => (store && typeof store.subscribe === 'function' ? store.subscribe(cb) : () => {}), [store]);
  return React.useSyncExternalStore(subscribe, () => (store && typeof store.getVersion === 'function' ? store.getVersion() : 0));
}

/**
 * main's painter over this page's blocks, again whenever a highlight, a note or a link changes or `letterId` (any key for
 * what the page shows) does: its highlights, then its link icons (main's order), drawn as the kit's (4h). Off for a gate
 * boot. The Bible chapter page uses it too.
 */
export function useMainMarks(on, letterId) {
  const A = on ? g.AnnotationStore : null;
  const annV = useStoreVersion(A);
  const noteV = useStoreVersion(on ? g.NoteStore : null);
  const linkV = useStoreVersion(on ? g.LinkStore : null);
  React.useEffect(() => {
    if (!on || !letterId || typeof g.applyDOMHighlights !== 'function') return;
    try { g.applyDOMHighlights(); } catch (_e) { /* a mid-paint throw re-runs on the next change, as on main */ }
    if (typeof g.applyDOMLinks !== 'function') return;
    try { g.applyDOMLinks(); } catch (_e) { /* as above */ }
    dressLinkIcons(document, iconSvg('link'));
  }, [on, letterId, annV, noteV, linkV]);
}

/**
 * The body's blocks: memoised, so React never re-renders text main's painter has split. `scan`: a Format B entry's
 * reference scan (footnotes.js formatBRefs), which numbers its references in a footnotes-mode collection.
 */
export const LetterBody = React.memo(/** @param {{ letter: any, scan: any }} props */ function LetterBody({ letter, scan }) {
  // Words To Live By, The Blessed and some Holy Days pages keep Format B `paragraphs`, anchored as main's wtlb:<id>:<i>
  if (isFormatB(letter)) {
    return letter.paragraphs.map((p, i) => (
      <FormatBBlock key={i} para={p} hlKey={wtlbHlKey(letter.id, i)} refs={scan ? scan.perParagraph[i] || null : null} />));
  }
  return (letter.blocks || []).map((b, i) => <LetterBlock key={i} block={b} hlKey={isMarkable(b) ? paraKey(letter.id, i) : null} />);
});

/** How far round a footnote number a tap still opens it: half of a 44 px target (the kit's least tap size). */
export const FOOTNOTE_REACH = 22;

/**
 * The footnote number a tap at (x, y) means: the nearest one whose 44 px square (or its own box, when bigger) holds the
 * point; null when none does. Numbers that are not laid out (no box) never answer. `sel` names other small numbers
 * picked the same way (the link picker's verse numbers).
 * @param {Element | null} root @param {number} x @param {number} y
 */
export function footnoteNear(root, x, y, reach = FOOTNOTE_REACH, sel = '.fn-ref') {
  if (!root || typeof x !== 'number' || typeof y !== 'number') return null;
  /** @type {Element | null} */
  let best = null;
  let bestD = Infinity;
  root.querySelectorAll(sel).forEach((el) => {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    const dx = Math.abs(x - (r.left + r.right) / 2);
    const dy = Math.abs(y - (r.top + r.bottom) / 2);
    if (dx > Math.max(reach, r.width / 2) || dy > Math.max(reach, r.height / 2)) return;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = el; }
  });
  return best;
}

/** A Format B entry's overline: "Part One · Entry 46" (Words To Live By), else its collection's name; Answers count topics. */
export function entryEyebrow(col, n) {
  const head = collectionHead(col);
  const part = /^Part /.test(head.eyebrow) ? head.eyebrow.split(' · ')[0] : head.title;
  return part + ' · ' + (col.volKey === 'answers' ? 'Topic ' : 'Entry ') + n;
}

/**
 * Opens a letter the corpus names ({ collection, letterTitle } or { id }) as a new page, loading its volume first when it
 * is not on the page yet; its web address outside the app when it is not in the app.
 * @param {any} target @param {string | null | undefined} url @param {((route: any) => void) | undefined} onGo
 */
function openLetterLink(target, url, onGo) {
  const now = letterRoute(target);
  if (now) { if (onGo) onGo(now); return; }
  findLetterRoute(target).then((r) => {
    if (r && onGo) onGo(r);
    else if (url) window.open(url, '_blank', 'noopener');
  });
}

/** True when a header field has words (a few letters keep From or the note line as rich text: an array of segments). */
const filled = (v) => (Array.isArray(v) ? v.length > 0 : !!(v && String(v).trim()));

/** A header field's words, with its footnote marks when it is rich text. */
const lineOf = (v) => (Array.isArray(v) ? renderSegments(v) : v);

/**
 * "Addendum to <letter>" (main's letter-meta): the letter opens in v2 as a new page (metaAddendumLink names it by its
 * collection and title, metaAddendumInternal by its id), else its web address opens outside the app.
 * @param {{ letter: any, onGo?: (route: any) => void }} props
 */
function Addendum({ letter, onGo }) {
  const target = letter.metaAddendumLink || (letter.metaAddendumInternal ? { id: letter.metaAddendumInternal } : null);
  const url = letter.metaAddendumUrl || null;
  let link = letter.metaAddendum;
  if (target) {
    const open = (e) => {
      e.preventDefault();
      openLetterLink(target, url, onGo);
    };
    link = <a href={url || '#'} onClick={open}>{letter.metaAddendum}</a>;
  } else if (url) {
    link = <a href={url} target="_blank" rel="noopener noreferrer">{letter.metaAddendum}</a>;
  }
  return <span className="addendum">Addendum to {link}</span>;
}

/** Where a study's section intro names its source: "(An excerpt from <letter>)" (5d). */
const SOURCE = '(An excerpt from';

/**
 * A study intro paragraph's words, its source (from "(An excerpt from" to the end) set apart as 5d draws it: roman,
 * smaller, the letter's name a gold cite. The DOM text is unchanged (only a span is added).
 * @param {any[]} segments
 */
export function withSource(segments) {
  const at = segments.findIndex((x) => x && typeof x.v === 'string' && x.v.indexOf(SOURCE) >= 0);
  if (at < 0) return renderSegments(segments);
  const v = /** @type {string} */ (segments[at].v);
  const cut = v.indexOf(SOURCE);
  // the words before the source keep their own segment's look; the source begins at its parenthesis
  const head = renderSegments([...segments.slice(0, at), { ...segments[at], v: v.slice(0, cut) }]);
  const tail = renderSegments([{ t: 'text', v: v.slice(cut) }, ...segments.slice(at + 1)]);
  return <>{head}<span className="src">{tail}</span></>;
}

/**
 * The section intro quote above a letter's text (main's section-intro-quote). Its lines carry main's read-tracker marks
 * (data-read-seg: the read detector counts these words), never a mark anchor (main keeps it out of highlights). A
 * study's (`study`) is 5d's: a gold rule at its left and its source set apart.
 * @param {{ blocks: any[], study?: boolean }} props
 */
const SectionIntro = React.memo(/** @param {{ blocks: any[], study?: boolean }} props */ function SectionIntro({ blocks, study = false }) {
  return (
    <div className={study ? 'sintro' : 'intro-quote'}>
      {blocks.map((b, i) => {
        if (b && b.type === 'heading') return <h3 key={i} className="sec-h" data-read-seg={'intro-h:' + i}>{b.text}</h3>;
        if (!b || !Array.isArray(b.segments)) return null;
        return <p key={i} data-read-seg={'intro-p:' + i}>{study ? withSource(b.segments) : renderSegments(b.segments)}</p>;
      })}
    </div>
  );
});

/**
 * Another page's text read through this one (a study chapter, StudyChapterScreen): the item itself and what the page
 * says about it, in place of a collection's letter. `recorded: false`: a gate's page with no recording (no Listen).
 * `foot`: the item's own links end the page as a letter's do, without songs (a study chapter: main's studyMode, zs27).
 * @typedef {{ letter: any, volKey: string, label: string, eyebrow: string, titleCls?: string, study?: boolean,
 *   body?: any, next?: { k: string, t: string, open: () => void } | null, recorded?: boolean, foot?: boolean }} PageDoc
 */

/**
 * One letter, or with `preface` the collection's preface (its next card is Letter 1), or with `doc` another page's text
 * read the same way (marks, references, footnotes, Listen and the read-along are the letter's).
 * `onGo` opens another letter as a new page (an addendum's).
 * @param {{ collection: string, n?: number, preface?: boolean, onReady?: () => void, onOpenLetter?: (n: number) => void,
 *   gate?: import('../gate.js').GateState | null, desktop?: boolean, waitDoubleTap?: boolean,
 *   onNote?: (target: Record<string, any>) => void, facts?: import('../settings-facts.js').SettingsFacts,
 *   onGo?: (route: any) => void, landAt?: { excerpt?: string, match?: string[], label?: string } | null, doc?: PageDoc | null,
 *   onFind?: (start: { q: string, terms: string[], near: Element | null, nearOff: number }) => void }} props
 *   onFind opens the shell's Find strip on this page (a search landing's words)
 */
export function LetterScreen({ collection, n = 0, preface = false, onReady, onOpenLetter, gate = null, desktop = false,
  waitDoubleTap = false, onNote, facts = {}, onGo, landAt = null, doc = null, onFind }) {
  const col = doc ? null : collectionOf(collection);
  const { letters, failed, retry } = useLettersLoad(col);
  const letter = doc ? doc.letter : letters ? (preface ? prefaceOf(col) : letterAt(letters, n)) : null;
  const bodyRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const headRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const [sheet, setSheet] = React.useState(
    /** @type {null | { el: Element, para: import('../marks.js').Para, colour: string, marked: boolean }} */ (null));
  // Link to another passage (4d-4f): the picker over the tapped paragraph, which stays lit under it.
  const [linking, setLinking] = React.useState(/** @type {null | { endpoint: any, title: string, text: string }} */ (null));
  // One toast at a time: Copy's and Share's words, or Listen's offline line (on a gate boot, 9c's from the page alone).
  // "Linked to ..." is links' own toast (the shell's Links overlay shows it, 4h).
  const [toast, setToast] = React.useState(/** @type {null | { text: string, icon?: string, act?: string, onAct?: () => void }} */ (gateListenToast(gate)));
  const live = !gate;
  useMainMarks(live, letter ? letter.id : null);
  // A reference's or a footnote's sheet: { kind: 'ref', ref, el } (the cite tapped) or { kind: 'fn', num }.
  const [refOpen, setRefOpen] = React.useState(/** @type {null | { kind: 'ref', ref: string, el?: Element | null } | { kind: 'fn', num: string }} */ (null));
  // The first save of a session in a Safari tab waits on the 7-day notice: the paragraph stays lit, its sheet away (8d).
  const [held, setHeld] = React.useState(() => !!(gate && gate.open && gate.open.sheet === 'safari-7day'));
  const noticeUp = useSafariNotice(live);
  React.useEffect(() => {
    if (live && held && !noticeUp) { setHeld(false); setSheet(null); }
  }, [live, held, noticeUp]);
  const volKey = doc ? doc.volKey : col ? col.volKey : '';
  const scan = React.useMemo(() => (letter && isFormatB(letter) ? formatBRefs(letter, volKey) : null), [letter, volKey]);
  const items = React.useMemo(() => footnoteItems(letter, volKey, scan), [letter, volKey, scan]);

  // ready once the letters are there, and on a gate's picker once its picture is drawn (4f's chapter rides the Bible)
  const pickerGate = !!(gate && gate.open && gate.open.sheet === 'link-picker');
  const [pickerShown, setPickerShown] = React.useState(false);
  const onPickerShown = React.useCallback(() => setPickerShown(true), []);
  React.useEffect(() => { if (letters && onReady && (!pickerGate || pickerShown)) onReady(); }, [letters, onReady, pickerGate, pickerShown]);

  // A search hit (v2-gaps 9, 13): once painted (after the shell has put a new page at its top), main's find over it: the
  // Find strip with the query as typed, the search's own places marked, the one at the words it was found by current and
  // brought a third of the way down (design 1i: "a search landing still opens main's pill strings in the same strip, the
  // field filled"). The first time only, so Back keeps the reader's place and a closed strip stays closed. A page drawn
  // without the shell's Find marks those words in their block instead, that place a third of the way down.
  React.useEffect(() => {
    if (!letter || !landAt) return undefined;
    const match = [].concat(landAt.match || []).filter(Boolean);
    const { index, off } = landingOf(letter, landAt.excerpt, match);
    if (index < 0 && !(onFind && match.length)) return undefined;
    let live = true;
    /** @type {HTMLElement | null} */
    let marked = null;
    whenPainted().then(() => {
      const root = bodyRef.current;
      if (!live || !root) return;
      const key = index < 0 ? '' : isFormatB(letter) ? wtlbHlKey(letter.id, index) : paraKey(letter.id, index);
      const el = key ? /** @type {HTMLElement | null} */ (root.querySelector('[data-hl-key="' + cssValue(key) + '"]')) : null;
      if (onFind) {
        if (LANDED.has(landAt)) return;
        LANDED.add(landAt);
        onFind({ q: landAt.label || match[0], terms: match, near: el, nearOff: el ? off : 0 });
        return;
      }
      if (!el) return;
      const mark = markWords(el, match, off);
      marked = el;
      if (LANDED.has(landAt)) return;
      LANDED.add(landAt);
      placeAtThird(mark || el);
    });
    // another hit in the same letter marks its own words, not these too
    return () => { live = false; unmarkWords(marked); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onFind is the shell's open, read when the hit lands
  }, [letter, landAt]);

  // The gate's open sheet, from the page alone: 4b paragraph 1 tapped, gold ringed (8d: the same paragraph under Safari's
  // notice; 4d-4f the link picker over it); 1e a reference's sheet; 1g a footnote's.
  const gateOpen = gate && gate.open ? gate.open : null;
  const open = gateOpen && (gateOpen.sheet === 'mark-paragraph' || gateOpen.sheet === 'safari-7day' || gateOpen.sheet === 'link-picker') ? gateOpen : null;
  const fromLine = letter ? linkingFrom(letter, col, doc, n, preface) : '';
  /** What the picker links from: main's source endpoint for the paragraph, the line naming it, its words. */
  const linkSource = (para) => ({ endpoint: sourceOf(para, letter.title), title: fromLine, text: para.text });
  const openPara = open ? open.para || 0 : -1;
  const openColour = open ? open.colour || 'gold' : '';
  React.useLayoutEffect(() => {
    if (openPara < 0 || !letter || !bodyRef.current) return;
    const el = bodyRef.current.querySelector('[data-hl-key="' + paraKey(letter.id, openPara) + '"]');
    if (!el) return;
    const para = paragraphOf(el);
    setSheet({ el, para, colour: openColour, marked: false });
    if (open && open.sheet === 'link-picker') setLinking(linkSource(para));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the gate's sheet, once its letter is there
  }, [openPara, openColour, letter]);
  // A gate's links (4h, 4i): their icons from the row (main's painter reads the stores, never read on a gate boot).
  const gateLinks = gate && gate.facts && gate.facts.links ? gate.facts.links : null;
  React.useLayoutEffect(() => {
    if (gateLinks && letter && bodyRef.current) gateLinkIcons(bodyRef.current, gateLinks, iconSvg('link'));
  }, [gateLinks, letter]);
  const openRef = gateOpen && gateOpen.sheet === 'ref' ? String(gateOpen.ref || '') : '';
  const openFn = gateOpen && gateOpen.sheet === 'footnote' ? String(gateOpen.num || '') : '';
  React.useLayoutEffect(() => {
    if (!letter) return;
    if (openRef) setRefOpen({ kind: 'ref', ref: openRef });
    else if (openFn) setRefOpen({ kind: 'fn', num: openFn });
  }, [openRef, openFn, letter]);

  // What the sheet is about wears the picture's mark while it is open: a reference the wash, a footnote number the ring.
  React.useEffect(() => {
    const root = bodyRef.current;
    if (!refOpen || !root) return undefined;
    const fn = refOpen.kind === 'fn' ? '.fn-ref[data-fn-num="' + cssValue(refOpen.num) + '"]' : '';
    const el = refOpen.kind === 'ref'
      ? refOpen.el || root.querySelector('.cite[data-ref="' + cssValue(refOpen.ref) + '"]')
      : root.querySelector(fn) || (headRef.current && headRef.current.querySelector(fn));
    if (!el) return undefined;
    el.classList.add('on');
    return () => el.classList.remove('on');
  }, [refOpen]);
  const closeRef = React.useCallback(() => setRefOpen(null), []);
  const goToRef = (parsed) => {
    setRefOpen(null);
    findChapterRoute(parsed).then((r) => { if (r && onGo) onGo(r); });
  };
  const readLink = (link, url) => {
    setRefOpen(null);
    openLetterLink(link, url, onGo);
  };
  /** A cite or a footnote number tapped (or Enter on it): its sheet, or a chapter link's chapter. @param {Element} el */
  const openMark = (el) => {
    const h = /** @type {HTMLElement} */ (el).dataset || {};
    if (el.classList.contains('fn-ref')) { if (h.fnNum) setRefOpen({ kind: 'fn', num: h.fnNum }); return; }
    // a letter the text names (a study's letter-link), or an outside page
    if (h.url) { window.open(h.url, '_blank', 'noopener'); return; }
    if (h.col || h.letter) {
      openLetterLink(h.col && h.title ? { collection: h.col, letterTitle: h.title } : { id: h.letter }, null, onGo);
      return;
    }
    if (h.nav) {
      const [book, ch] = h.nav.split(':');
      if (onGo) onGo({ place: 'bible-chapter', book, chapter: Number(ch) });
      return;
    }
    if (h.ref) setRefOpen({ kind: 'ref', ref: h.ref, el });
  };

  // The tapped paragraph wears the picture's gold bar while its sheet is open.
  React.useEffect(() => {
    if (!sheet) return undefined;
    sheet.el.classList.add('tapped');
    return () => sheet.el.classList.remove('tapped');
  }, [sheet]);

  // The toast goes by itself, later when it can Undo (a gate's stays: it is the picture).
  React.useEffect(() => {
    if (!toast || gate) return undefined;
    const t = setTimeout(() => setToast(null), toast.act ? UNDO_MS : TOAST_MS);
    return () => clearTimeout(t);
  }, [toast, gate]);

  /** Opens the sheet for a block, ringing its own highlight's colour, else the last one used. @param {Element} el */
  const openFor = React.useCallback((el) => {
    const para = paragraphOf(el);
    const own = live && g.AnnotationStore ? paragraphMark(g.AnnotationStore.get(para.key), para) : null;
    setSheet({ el, para, colour: own ? kitColour(own.color) : lastUsedColour(), marked: !!own });
  }, [live]);

  // A tap on a paragraph (not a selection, not a control, not one a peer claimed) opens its sheet; on the phone after the
  // double-tap window, unless the second tap came (full screen's gesture event cancels it).
  const pending = React.useRef(/** @type {any} */ (null));
  const gestureAt = React.useRef(-Infinity);
  React.useEffect(() => {
    const onGesture = () => {
      gestureAt.current = Date.now();
      if (pending.current) { clearTimeout(pending.current); pending.current = null; }
    };
    document.addEventListener(FULLSCREEN_GESTURE_EVENT, onGesture);
    return () => {
      document.removeEventListener(FULLSCREEN_GESTURE_EVENT, onGesture);
      if (pending.current) clearTimeout(pending.current);
    };
  }, []);
  /** The reference, chapter link or footnote number a tap inside `root` means (a footnote within its 44 px square). */
  const markAt = (target, root, e) => target.closest('.cite, .fn-ref')
    || (target.closest('a, button, input, textarea') ? null : footnoteNear(root, e.clientX, e.clientY));
  // The header lines carry footnote numbers too (Timothy's From line); a tap there opens only a mark, never a sheet.
  const onHeadClick = (e) => {
    const target = /** @type {Element} */ (e.target);
    const mark = target && target.closest ? markAt(target, headRef.current, e) : null;
    if (!mark) return;
    e.preventDefault();
    if (!gate) openMark(mark);
  };
  const onBodyClick = (e) => {
    const target = /** @type {Element} */ (e.target);
    if (!target || !target.closest) return;
    // a reference, a chapter link or a footnote number first (a gate boot draws them, never acts)
    const mark = markAt(target, bodyRef.current, e);
    if (mark) {
      e.preventDefault();
      if (!gate) openMark(mark);
      return;
    }
    if (e.defaultPrevented || gate) return;
    const el = target.closest('[data-hl-key]');
    if (!el || target.closest('a, button, input, textarea, [role="button"]')) return;
    const sel = typeof window.getSelection === 'function' ? window.getSelection() : null;
    if (sel && !sel.isCollapsed && String(sel).trim()) return;
    if (Date.now() - gestureAt.current < DOUBLE_TAP_MS) return;
    if (pending.current) clearTimeout(pending.current);
    if (!waitDoubleTap) { openFor(el); return; }
    pending.current = setTimeout(() => { pending.current = null; openFor(el); }, DOUBLE_TAP_MS);
  };

  // Enter or Space on a reference or a footnote number opens it, as a tap does
  const onBodyKey = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const target = /** @type {Element} */ (e.target);
    const mark = target && target.closest ? target.closest('.cite, .fn-ref') : null;
    if (!mark) return;
    e.preventDefault();
    if (!gate) openMark(mark);
  };

  const close = React.useCallback(() => setSheet(null), []);
  const onColour = (kit) => {
    if (!sheet) return;
    if (live && firstSaveWaits()) { setHeld(true); return; }
    if (live) {
      if (sheet.marked && kit === sheet.colour) unmarkParagraph(sheet.para);
      else markParagraph(sheet.para, kit);
    }
    close();
  };
  const onCopy = () => {
    if (!sheet) return;
    const el = sheet.el;
    close();
    if (live) copyParagraph(el).then((words) => { if (words) setToast({ text: words }); });
  };
  const onShare = () => {
    if (!sheet) return;
    const el = sheet.el;
    close();
    if (live) shareParagraph(el).then((words) => { if (words) setToast({ text: words }); });
  };
  // Listen from here (4b, dz16): main's read-along on this page (window.__votListenFrom) plays the letter from the
  // paragraph, or loops it 3 times (Repeat) under main's label for it; a gate draws its row from the page alone.
  const listenFrom = () => (live ? g.__votListenFrom : null);
  const listenRow = !sheet || !letter ? null
    : gateOpen ? (gateOpen.listen ? { reader: readerLine(gateOpen.listen), repeat: true } : null)
    : listenRowFor(listenFrom(), g.AudioPlayer, sheet.para.key, { volKey, letter, collectionLabel: col.label });
  const onListen = () => {
    if (!sheet) return;
    const key = sheet.para.key;
    close();
    const lf = listenFrom();
    if (lf) lf.start(key, null);
  };
  const onRepeat = () => {
    if (!sheet) return;
    const key = sheet.para.key;
    close();
    const lf = listenFrom();
    const label = typeof g._bookmarkSourceLabel === 'function' ? g._bookmarkSourceLabel(key) : letter.title;
    if (lf && typeof lf.repeat === 'function') lf.repeat([key], label, REPEAT_TIMES);
  };
  const onAddNote = () => {
    if (!sheet) return;
    if (live && firstSaveWaits()) { setHeld(true); return; }
    const note = live ? paragraphNote(sheet.para) : { groupId: null };
    const target = { ...sheet.para, groupId: note.groupId };
    close();
    if (live && onNote) onNote(target);
  };

  // Link to another passage (4b): the picker opens over the paragraph; the first save of a Safari session waits on the
  // 7-day notice first, as a highlight's does. A link made closes it with "Linked to ..." and an Undo (4h).
  const onLink = () => {
    if (!sheet || !live) return;
    if (firstSaveWaits()) { setHeld(true); return; }
    setLinking(linkSource(sheet.para));
  };
  const closeLinking = () => { setLinking(null); setSheet(null); };
  const onLinked = (made, target) => {
    closeLinking();
    setToast(null);
    linkToast.set({ text: 'Linked to ' + target.label, act: made.fresh ? 'Undo' : undefined,
      onAct: made.fresh ? () => { removeLink(made.link.id); linkToast.set(null); } : undefined });
  };

  if (!letters) return null;
  if ((!doc && !col) || !letter) return <CouldNotOpen what="letter" retry={failed ? retry : null} />;
  const nextN = preface ? 1 : n + 1;
  const next = doc ? null : letterAt(letters, nextN);
  // a Format B entry (Words To Live By, The Blessed): its part and number above the title, no header lines (1d)
  const fb = isFormatB(letter);
  const unit = fb ? (col.volKey === 'answers' ? 'Topic' : 'Entry') : 'Letter';
  // the header lines (main's letter-meta): date, from, spoken, for; then the note line and "Addendum to ..."
  const meta = [letter.date, letter.from, letter.spoken, letter.forLine].filter(filled).map(lineOf);
  if (filled(letter.noteLine)) meta.push(<span className="note">{lineOf(letter.noteLine)}</span>);
  if (filled(letter.metaAddendum)) meta.push(<Addendum letter={letter} onGo={onGo} />);
  const intro = Array.isArray(letter.sectionIntro) ? letter.sectionIntro : [];
  const label = doc ? doc.label : col.label;
  const card = doc ? doc.next || null
    : next ? { k: 'Next · ' + unit + ' ' + nextN, t: next.title, open: () => onOpenLetter && onOpenLetter(nextN) } : null;
  return (
    <>
      <div className={'page-head g reader-head' + (fb ? ' fb-head' : '')} ref={headRef} onClick={onHeadClick} onKeyDown={onBodyKey}>
        {doc ? <span className="overline eyebrow wrap">{doc.eyebrow}</span>
          : <span className="overline eyebrow">{fb ? entryEyebrow(col, n) : col.label + ' · ' + (preface ? 'Preface' : 'Letter ' + n)}</span>}
        <h1 className={(doc && doc.titleCls) || titleClass(letter.title)}>{letter.title}</h1>
        {!(doc && doc.recorded === false) && (
          <ListenPill gate={gate} collection={collection} n={n} volKey={volKey} letter={letter} collectionLabel={label}
            onToast={setToast} />
        )}
        {meta.length > 0 && <div className="meta">{meta.map((m, i) => <React.Fragment key={i}>{i > 0 && <br />}{m}</React.Fragment>)}</div>}
        {/* the question put to The Lord that the letter answers */}
        {filled(letter.preamble) && <p className="preamble">{lineOf(letter.preamble)}</p>}
      </div>
      <div className="hair" />
      <div className={'body g first' + (fb ? ' fb' : '') + (doc && doc.study ? ' study' : '') + (sheet ? ' marked' : '')}
        ref={bodyRef} onClick={onBodyClick} onKeyDown={onBodyKey}>
        {intro.length > 0 && <SectionIntro blocks={intro} study={!!(doc && doc.study)} />}
        {doc && doc.body ? doc.body : <LetterBody letter={letter} scan={scan} />}
        {/* the end of the text (main's sentinel): auto-scroll comes to rest here, before the footnotes */}
        <span className="reading-end" aria-hidden="true" />
        <FootnoteList items={items} letter={letter} onGo={live ? goToRef : () => {}} onRead={live ? readLink : () => {}} />
        {/* Also read, Related topics, Bible study, Songs from this letter, Audio, Videos (dz23 1k/1l); a study chapter's
            without songs (main's studyMode) */}
        {(!doc || doc.foot) && <LetterFoot letter={letter} volKey={volKey} gate={gate} onGo={onGo} songs={!doc} />}
        {card && (
          <button type="button" className="nextcard" onClick={card.open}>
            <span className="tx"><span className="k">{card.k}</span><span className="t">{card.t}</span></span>
            <span className="chev"><Icon name="chev" /></span>
          </button>
        )}
      </div>
      {/* the sentence being read, lit (readalong rv1 1b): main's read-along over the body's [data-hl-key] blocks */}
      <LetterReadAlong gate={gate} collection={collection} n={n} volKey={volKey} letterId={letter.id} bodyRef={bodyRef}
        on={facts.readAlong !== false} follow={facts.readAlongFollow !== false} onListen={listenHere(live, { volKey, label }, letter, setToast)}
        paragraphs={scan ? letter.paragraphs : null} scan={scan} />
      {sheet && !held && !linking && (
        <MarkSheet colour={sheet.colour} marked={sheet.marked} desktop={desktop} onColour={onColour} onNote={onAddNote}
          onLink={onLink} onCopy={onCopy} onShare={onShare} onClose={close} listen={listenRow} onListen={onListen} onRepeat={onRepeat} />
      )}
      {linking && (
        <LinkPicker source={linking} desktop={desktop} gate={open && open.sheet === 'link-picker' ? open.picker || {} : null}
          onLinked={onLinked} onClose={closeLinking} onShown={onPickerShown} />
      )}
      {refOpen && (
        <RefSheet open={refOpen} letter={letter} items={items} desktop={desktop} onClose={closeRef}
          onGo={live ? goToRef : closeRef} onRead={live ? readLink : closeRef}
          onStep={(num) => setRefOpen({ kind: 'fn', num })} />
      )}
      <LayerToast text={toast && toast.text} icon={toast && toast.icon} act={toast && toast.act} onAct={toast && toast.onAct} />
    </>
  );
}

/**
 * The picker's "Linking from" line (4d): the letter's title, then where it sits ("Volume One, Letter 1"); an entry's or
 * another page's says its collection or its page's name.
 */
function linkingFrom(letter, col, doc, n, preface) {
  const where = doc ? doc.label : !col ? '' : isFormatB(letter) ? col.label : col.label + ', ' + (preface ? 'Preface' : 'Letter ' + n);
  return letter.title + (where ? ' · ' + where : '');
}

/**
 * main's Listen for this letter (Listen from here plays it first; offline it says why, as the pill does), or null when
 * it has no recording or on a gate. `col`: its { volKey, label }.
 * @param {(t: import('../player/listen.jsx').Toast) => void} onToast
 */
function listenHere(live, col, letter, onToast) {
  const A = live ? g.AudioPlayer : null;
  if (!A || typeof A.hasAudio !== 'function' || !A.hasAudio(col.volKey, letter.id)) return null;
  return () => startListening(A, { volKey: col.volKey, letter, collectionLabel: col.label }, onToast);
}

/**
 * The key main bookmarks a whole letter by: LetterView's 'letter:<id>'; a Format B entry (Words To Live By, The Blessed,
 * Holy Days) 'wtlb:<id>', the prefix of its paragraphs' keys, which main's findEntryContext resolves for each of them.
 * @param {{ id: string }} letter
 */
export function letterBookmarkKey(letter) {
  return (isFormatB(letter) ? 'wtlb:' : 'letter:') + letter.id;
}

const noStore = () => () => {};
const zero = () => 0;
function subscribeBookmarks(cb) {
  const B = g.BookmarkStore;
  return B && typeof B.subscribe === 'function' ? B.subscribe(cb) : noStore();
}
function bookmarksVersion() {
  const B = g.BookmarkStore;
  return B && typeof B.getVersion === 'function' ? B.getVersion() : 0;
}

/**
 * The letter's Bookmark (v2-gaps 12; main's ChapterBookmarkBtn): a tap saves the whole letter as main's BookmarkStore
 * keeps it (shown in Notes, and in main's Bookmarks), filled while it is saved; a second tap takes it out again with an
 * Undo (main asked "delete?" first; the kit's toast undoes instead). Only the whole-letter bookmark counts: a bookmark on
 * one of its paragraphs is its own. The first save of a Safari tab waits on the 7-day notice (main drops that tap too).
 * A gate boot draws the empty icon and touches nothing. `item`: another page's text read as a letter (a study chapter,
 * main's same 'letter:<id>' bookmark), `noun` what it is called; `mark` a page main bookmarks under its own key and label
 * (a Matthew chapter: 'study:matthew-5', "Matthew 5 (Study)").
 * @param {{ route: any, gate: any, item?: any, noun?: string, mark?: { key: string, label: string } | null }} props
 */
export function LetterBookmark({ route, gate, item = null, noun = 'letter', mark = null }) {
  const live = !gate;
  const col = item ? null : collectionOf(route.collection);
  const letters = useLetters(col);
  const letter = item || (letters && col ? (route.preface ? prefaceOf(col) : letterAt(letters, route.n)) : null);
  React.useSyncExternalStore(live ? subscribeBookmarks : noStore, live ? bookmarksVersion : zero);
  const [toast, setToast] = React.useState(/** @type {null | { text: string, icon?: string, act?: string, onAct?: () => void }} */ (null));
  React.useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), toast.act ? UNDO_MS : TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);
  const B = live ? g.BookmarkStore : null;
  const key = mark ? mark.key : letter ? letterBookmarkKey(letter) : null;
  const saved = B && key && typeof B.all === 'function' ? (B.all() || []).filter((b) => b && b.hlKey === key) : [];
  const on = saved.length > 0;
  const onClick = () => {
    if (!B || !key || !letter) return;
    if (on) {
      const gone = saved.map((b) => ({ ...b }));
      for (const b of gone) B.remove(b.id);
      setToast({ text: 'Bookmark removed.', act: 'Undo', onAct: () => {
        for (const b of gone) if (!(typeof B.get === 'function' && B.get(b.id))) B.add({ ...b });
        setToast(null);
      } });
      return;
    }
    if (firstSaveWaits()) return;
    const now = Date.now();
    const id = typeof g.bkmId === 'function' ? g.bkmId() : 'bkm_' + now + '_' + Math.random().toString(36).slice(2, 6);
    B.add({ id, hlKey: key, label: (mark && mark.label) || letter.title || 'Letter bookmark', thought: '', created: now, updated: now });
    setToast({ text: 'Bookmarked. It is in Notes.', icon: 'bookmark' });
  };
  return (
    <>
      <button type="button" className="ic" aria-label={on ? 'Remove bookmark' : 'Bookmark this ' + noun} aria-pressed={on}
        onClick={onClick}><Icon name="bookmark" /></button>
      <LayerToast text={toast && toast.text} icon={toast && toast.icon} act={toast && toast.act} onAct={toast && toast.onAct} />
    </>
  );
}

/**
 * The letter's ... (1h; more-menu.jsx): Find in this letter / entry / topic, Auto-scroll, Hear it sung (only with a song
 * that sings its words), Copy website link (only where the site has the page: keySiteLink of main's page key).
 * @param {{ route: any, gate?: any, open?: (sheet: string) => void, desktop: boolean }} props
 */
function LetterMore({ route, gate, open, desktop }) {
  const col = collectionOf(route.collection);
  const letters = useLetters(col);
  const letter = letters && col ? (route.preface ? prefaceOf(col) : letterAt(letters, route.n)) : null;
  const songs = useVerbatimSongs(letter && col ? col.volKey + ':' + letter.id : '', gate);
  const title = letter ? letter.title || '' : '';
  return (
    <MoreButton title={title} desktop={desktop} gate={gate} items={[
      findItem(findNoun(route), open),
      autoScrollItem(open, gate),
      sungItem(songs, title),
      letter ? copyLinkItem(keySiteLink(letterBookmarkKey(letter))) : null,
    ]} />
  );
}

/** The letter's top bar: Bookmark, Aa (the shell's Text and theme sheet), More. @param {{ route: any, gate?: any, open?: (sheet: string) => void, desktop: boolean }} ctx */
function letterActions({ route, gate, open, desktop }) {
  return (
    <>
      <LetterBookmark route={route} gate={gate} />
      <button type="button" className="ic" aria-label="Text and theme" onClick={() => open && open('text-and-theme')}><Icon name="aa" /></button>
      <LetterMore route={route} gate={gate} open={open} desktop={desktop} />
    </>
  );
}

/** Find in this <noun> (main's FindInUnit hosts): an Answers topic, a compilation's entry, else a letter. @param {any} r */
function findNoun(r) {
  const col = collectionOf(r.collection);
  const list = col && Array.isArray(g[col.globalName]) ? g[col.globalName] : null;
  const letter = list ? (r.preface ? prefaceOf(col) : letterAt(list, r.n)) : null;
  if (!col) return 'letter';
  if (col.volKey === 'answers') return 'topic';
  return letter && isFormatB(letter) ? 'entry' : 'letter';
}

/** The letter place: the next-letter card replaces this letter, so Back still names the collection. @param {import('../places.js').PlaceProps} props */
function LetterPlace({ route, replace, go, onReady, gate, desktop, facts, open }) {
  const openLetter = (n) => replace({ place: 'letter', collection: route.collection, n });
  const openNote = (target) => go({ place: 'note', ...target });
  return <LetterScreen key={route.collection + '/' + (route.preface ? 'P' : route.n)} collection={route.collection} n={route.n}
    preface={!!route.preface} onReady={onReady} onOpenLetter={openLetter} gate={gate} desktop={desktop}
    waitDoubleTap={!desktop && !(facts && facts.doubleTapFullscreen === false)} onNote={openNote} facts={facts || {}} onGo={go}
    landAt={route.excerpt || (route.match && route.match.length) ? route : null}
    onFind={open && !gate ? (start) => open('find', start) : undefined} />;
}

definePlace('letter', {
  Screen: LetterPlace,
  // Back on the page above a letter says its title (or the collection's name until the volume has loaded)
  title: (r) => {
    const col = collectionOf(r.collection);
    const list = col && Array.isArray(g[col.globalName]) ? g[col.globalName] : null;
    const letter = list ? (r.preface ? prefaceOf(col) : letterAt(list, r.n)) : null;
    return letter ? letter.title : (col ? col.label : '');
  },
  actions: letterActions,
  contentClass: 'content reader',
  find: findNoun,
});
