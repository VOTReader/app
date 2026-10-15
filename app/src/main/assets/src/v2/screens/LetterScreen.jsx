/* LetterScreen - one letter in v2 (picture 1a-letter: overline, title, Listen, the header lines, a hairline, the text,
   then the next letter). Volumes load lazily (window.__loadVotCorpus, index.html); the screen reports ready once the
   letter's text is on the page.

   Marks (picture 4b-mark-paragraph): a tap on a paragraph opens "Mark this paragraph" (marks.js does the work through
   main's own stores), and main's marks show on the text, painted by main's own painter (applyDOMHighlights, bundle-c)
   whenever its stores change. On the phone the sheet waits out a double tap (DOUBLE_TAP_MS): two taps are full screen
   (readalong's useFullScreen; Corbin 10-14: the double tap wins). A gate boot paints nothing and writes nothing.

   References and footnotes (mw6, pictures 1d-1g): a reference "(1 John 3:12)" or a footnote number opens RefSheet at once
   (a footnote number answers anywhere in a 44 px square round it); a chapter link "[Esther 7]" opens the chapter, Back
   says this letter. The letter's footnotes are listed at its foot (FootnoteList). Safari (8d): the first mark or note of
   a session in a Safari tab waits on the 7-day notice (SafariNotice.jsx), its paragraph still lit. */
import { Icon } from '../Icon.jsx';
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
import { ListenPill, gateListenToast, startListening } from '../player/listen.jsx';
import { LetterReadAlong } from '../player/read-along.jsx';
import { landingOf, markWords, unmarkWords, placeAtThird } from '../search-landing.js';
import { whenPainted } from '../gate.js';

const g = /** @type {any} */ (globalThis);
/** The search routes already landed: Back to one keeps where the reader left it (its words are marked again). */
const LANDED = new WeakSet();
/** A value safe inside a "..." attribute selector. @param {string} v */
const cssValue = (v) => String(v).replace(/["\\]/g, '\\$&');
/** How long a toast stays (main's confirmCopied). */
export const TOAST_MS = 2600;

/** @param {string} key */
export function collectionOf(key) {
  const map = g.COL_BY_KEY;
  return map && typeof map.get === 'function' ? map.get(key) || null : null;
}

/** @returns {any[] | null} the collection's letters when its volume is loaded */
function lettersOf(col) {
  return col && Array.isArray(g[col.globalName]) ? g[col.globalName] : null;
}

/** The collection's letters, loading the lazy corpus first when needed; [] when it failed to load or there is no such
    collection (the page then says it could not be opened, and is ready: it never waits on nothing). */
export function useLetters(col) {
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
  return letters;
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
 * main's painter over this page's blocks, again whenever a highlight or a note changes or `letterId` (any key for what
 * the page shows) does. Off for a gate boot. The Bible chapter page uses it too.
 */
export function useMainMarks(on, letterId) {
  const A = on ? g.AnnotationStore : null;
  const annV = useStoreVersion(A);
  const noteV = useStoreVersion(on ? g.NoteStore : null);
  React.useEffect(() => {
    if (!on || !letterId || typeof g.applyDOMHighlights !== 'function') return;
    try { g.applyDOMHighlights(); } catch (_e) { /* a mid-paint throw re-runs on the next change, as on main */ }
  }, [on, letterId, annV, noteV]);
}

/**
 * The body's blocks: memoised, so React never re-renders text main's painter has split. `scan`: a Format B entry's
 * reference scan (footnotes.js formatBRefs), which numbers its references in a footnotes-mode collection.
 */
const LetterBody = React.memo(/** @param {{ letter: any, scan: any }} props */ function LetterBody({ letter, scan }) {
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
 * point; null when none does. Numbers that are not laid out (no box) never answer.
 * @param {Element | null} root @param {number} x @param {number} y
 */
export function footnoteNear(root, x, y, reach = FOOTNOTE_REACH) {
  if (!root || typeof x !== 'number' || typeof y !== 'number') return null;
  /** @type {Element | null} */
  let best = null;
  let bestD = Infinity;
  root.querySelectorAll('.fn-ref').forEach((el) => {
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

/**
 * The section intro quote above a letter's text (main's section-intro-quote). Its lines carry main's read-tracker marks
 * (data-read-seg: the read detector counts these words), never a mark anchor (main keeps it out of highlights).
 * @param {{ blocks: any[] }} props
 */
const SectionIntro = React.memo(/** @param {{ blocks: any[] }} props */ function SectionIntro({ blocks }) {
  return (
    <div className="intro-quote">
      {blocks.map((b, i) => {
        if (b && b.type === 'heading') return <h3 key={i} className="sec-h" data-read-seg={'intro-h:' + i}>{b.text}</h3>;
        if (!b || !Array.isArray(b.segments)) return null;
        return <p key={i} data-read-seg={'intro-p:' + i}>{renderSegments(b.segments)}</p>;
      })}
    </div>
  );
});

/**
 * One letter, or with `preface` the collection's preface (its next card is Letter 1).
 * `onGo` opens another letter as a new page (an addendum's).
 * @param {{ collection: string, n?: number, preface?: boolean, onReady?: () => void, onOpenLetter?: (n: number) => void,
 *   gate?: import('../gate.js').GateState | null, desktop?: boolean, waitDoubleTap?: boolean,
 *   onNote?: (target: Record<string, any>) => void, facts?: import('../settings-facts.js').SettingsFacts,
 *   onGo?: (route: any) => void, landAt?: { excerpt: string, match?: string[] } | null }} props
 */
export function LetterScreen({ collection, n = 0, preface = false, onReady, onOpenLetter, gate = null, desktop = false,
  waitDoubleTap = false, onNote, facts = {}, onGo, landAt = null }) {
  const col = collectionOf(collection);
  const letters = useLetters(col);
  const letter = letters ? (preface ? prefaceOf(col) : letterAt(letters, n)) : null;
  const bodyRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const headRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const [sheet, setSheet] = React.useState(
    /** @type {null | { el: Element, para: import('../marks.js').Para, colour: string, marked: boolean }} */ (null));
  // One toast at a time: Copy's and Share's words, or Listen's offline line (on a gate boot, 9c's from the page alone).
  const [toast, setToast] = React.useState(/** @type {import('../player/listen.jsx').Toast | null} */ (gateListenToast(gate)));
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
  const volKey = col ? col.volKey : '';
  const scan = React.useMemo(() => (letter && isFormatB(letter) ? formatBRefs(letter, volKey) : null), [letter, volKey]);
  const items = React.useMemo(() => footnoteItems(letter, volKey, scan), [letter, volKey, scan]);

  React.useEffect(() => { if (letters && onReady) onReady(); }, [letters, onReady]);

  // A search hit (v2-gaps 9): the words it was found by marked in their block, and that place a third of the way down
  // once painted (after the shell has put a new page at its top); the first time only, so Back keeps the reader's place.
  React.useEffect(() => {
    if (!letter || !landAt) return undefined;
    const match = [].concat(landAt.match || []).filter(Boolean);
    const { index, off } = landingOf(letter, landAt.excerpt, match);
    if (index < 0) return undefined;
    let live = true;
    /** @type {HTMLElement | null} */
    let marked = null;
    whenPainted().then(() => {
      const root = bodyRef.current;
      if (!live || !root) return;
      const key = isFormatB(letter) ? wtlbHlKey(letter.id, index) : paraKey(letter.id, index);
      const el = /** @type {HTMLElement | null} */ (root.querySelector('[data-hl-key="' + cssValue(key) + '"]'));
      if (!el) return;
      const mark = markWords(el, match, off);
      marked = el;
      if (LANDED.has(landAt)) return;
      LANDED.add(landAt);
      placeAtThird(mark || el);
    });
    // another hit in the same letter marks its own words, not these too
    return () => { live = false; unmarkWords(marked); };
  }, [letter, landAt]);

  // The gate's open sheet, from the page alone: 4b paragraph 1 tapped, gold ringed (8d: the same paragraph under Safari's
  // notice); 1e a reference's sheet; 1g a footnote's.
  const gateOpen = gate && gate.open ? gate.open : null;
  const open = gateOpen && (gateOpen.sheet === 'mark-paragraph' || gateOpen.sheet === 'safari-7day') ? gateOpen : null;
  const openPara = open ? open.para || 0 : -1;
  const openColour = open ? open.colour || 'gold' : '';
  React.useLayoutEffect(() => {
    if (openPara < 0 || !letter || !bodyRef.current) return;
    const el = bodyRef.current.querySelector('[data-hl-key="' + paraKey(letter.id, openPara) + '"]');
    if (el) setSheet({ el, para: paragraphOf(el), colour: openColour, marked: false });
  }, [openPara, openColour, letter]);
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

  // The toast goes by itself (a gate's stays: it is the picture).
  React.useEffect(() => {
    if (!toast || gate) return undefined;
    const t = setTimeout(() => setToast(null), TOAST_MS);
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
  const onAddNote = () => {
    if (!sheet) return;
    if (live && firstSaveWaits()) { setHeld(true); return; }
    const note = live ? paragraphNote(sheet.para) : { groupId: null };
    const target = { ...sheet.para, groupId: note.groupId };
    close();
    if (live && onNote) onNote(target);
  };

  if (!letters) return null;
  if (!col || !letter) {
    return <div className="empty"><div className="t">This letter could not be opened.</div></div>;
  }
  const nextN = preface ? 1 : n + 1;
  const next = letterAt(letters, nextN);
  // a Format B entry (Words To Live By, The Blessed): its part and number above the title, no header lines (1d)
  const fb = isFormatB(letter);
  const unit = fb ? (col.volKey === 'answers' ? 'Topic' : 'Entry') : 'Letter';
  // the header lines (main's letter-meta): date, from, spoken, for; then the note line and "Addendum to ..."
  const meta = [letter.date, letter.from, letter.spoken, letter.forLine].filter(filled).map(lineOf);
  if (filled(letter.noteLine)) meta.push(<span className="note">{lineOf(letter.noteLine)}</span>);
  if (filled(letter.metaAddendum)) meta.push(<Addendum letter={letter} onGo={onGo} />);
  const intro = Array.isArray(letter.sectionIntro) ? letter.sectionIntro : [];
  return (
    <>
      <div className={'page-head g reader-head' + (fb ? ' fb-head' : '')} ref={headRef} onClick={onHeadClick} onKeyDown={onBodyKey}>
        <span className="overline eyebrow">{fb ? entryEyebrow(col, n) : col.label + ' · ' + (preface ? 'Preface' : 'Letter ' + n)}</span>
        <h1 className={titleClass(letter.title)}>{letter.title}</h1>
        <ListenPill gate={gate} collection={collection} n={n} volKey={col.volKey} letter={letter} collectionLabel={col.label}
          onToast={setToast} />
        {meta.length > 0 && <div className="meta">{meta.map((m, i) => <React.Fragment key={i}>{i > 0 && <br />}{m}</React.Fragment>)}</div>}
        {/* the question put to The Lord that the letter answers */}
        {filled(letter.preamble) && <p className="preamble">{lineOf(letter.preamble)}</p>}
      </div>
      <div className="hair" />
      <div className={'body g first' + (fb ? ' fb' : '') + (sheet ? ' marked' : '')} ref={bodyRef} onClick={onBodyClick}
        onKeyDown={onBodyKey}>
        {intro.length > 0 && <SectionIntro blocks={intro} />}
        <LetterBody letter={letter} scan={scan} />
        <FootnoteList items={items} letter={letter} onGo={live ? goToRef : () => {}} onRead={live ? readLink : () => {}} />
        {next && (
          <button type="button" className="nextcard" onClick={() => onOpenLetter && onOpenLetter(nextN)}>
            <span className="tx"><span className="k">Next · {unit} {nextN}</span><span className="t">{next.title}</span></span>
            <span className="chev"><Icon name="chev" /></span>
          </button>
        )}
      </div>
      {/* the sentence being read, lit (readalong rv1 1b): main's read-along over the body's [data-hl-key] blocks */}
      <LetterReadAlong gate={gate} collection={collection} n={n} volKey={col.volKey} letterId={letter.id} bodyRef={bodyRef}
        on={facts.readAlong !== false} follow={facts.readAlongFollow !== false} onListen={listenHere(live, col, letter, setToast)}
        paragraphs={scan ? letter.paragraphs : null} scan={scan} />
      {sheet && !held && (
        <MarkSheet colour={sheet.colour} marked={sheet.marked} desktop={desktop} onColour={onColour} onNote={onAddNote}
          onCopy={onCopy} onShare={onShare} onClose={close} />
      )}
      {refOpen && (
        <RefSheet open={refOpen} letter={letter} items={items} desktop={desktop} onClose={closeRef}
          onGo={live ? goToRef : closeRef} onRead={live ? readLink : closeRef}
          onStep={(num) => setRefOpen({ kind: 'fn', num })} />
      )}
      <LayerToast text={toast && toast.text} icon={toast && toast.icon} />
    </>
  );
}

/**
 * main's Listen for this letter (Listen from here plays it first; offline it says why, as the pill does), or null when
 * it has no recording or on a gate.
 * @param {(t: import('../player/listen.jsx').Toast) => void} onToast
 */
function listenHere(live, col, letter, onToast) {
  const A = live ? g.AudioPlayer : null;
  if (!A || typeof A.hasAudio !== 'function' || !A.hasAudio(col.volKey, letter.id)) return null;
  return () => startListening(A, { volKey: col.volKey, letter, collectionLabel: col.label }, onToast);
}

/** The letter's top bar: Bookmark, Aa (the shell's Text and theme sheet), More. @param {{ open?: (sheet: string) => void }} ctx */
function letterActions({ open }) {
  return (
    <>
      <button type="button" className="ic" aria-label="Bookmark"><Icon name="bookmark" /></button>
      <button type="button" className="ic" aria-label="Text and theme" onClick={() => open && open('text-and-theme')}><Icon name="aa" /></button>
      <button type="button" className="ic" aria-label="More"><Icon name="more" /></button>
    </>
  );
}

/** The letter place: the next-letter card replaces this letter, so Back still names the collection. */
function LetterPlace({ route, replace, go, onReady, gate, desktop, facts }) {
  const openLetter = (n) => replace({ place: 'letter', collection: route.collection, n });
  const openNote = (target) => go({ place: 'note', ...target });
  return <LetterScreen key={route.collection + '/' + (route.preface ? 'P' : route.n)} collection={route.collection} n={route.n}
    preface={!!route.preface} onReady={onReady} onOpenLetter={openLetter} gate={gate} desktop={desktop}
    waitDoubleTap={!desktop && !(facts && facts.doubleTapFullscreen === false)} onNote={openNote} facts={facts || {}} onGo={go}
    landAt={route.excerpt ? route : null} />;
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
});
