/* LetterScreen - one letter in v2 (picture 1a-letter: overline, title, Listen, the header lines, a hairline, the text,
   then the next letter). Volumes load lazily (window.__loadVotCorpus, index.html); the screen reports ready once the
   letter's text is on the page.

   Marks (picture 4b-mark-paragraph): a tap on a paragraph opens "Mark this paragraph" (marks.js does the work through
   main's own stores), and main's marks show on the text, painted by main's own painter (applyDOMHighlights, bundle-c)
   whenever its stores change. On the phone the sheet waits out a double tap (DOUBLE_TAP_MS): two taps are full screen
   (readalong's useFullScreen; Corbin 10-14: the double tap wins). A gate boot paints nothing and writes nothing. */
import { Icon } from '../Icon.jsx';
import { LetterBlock, FormatBBlock, titleClass, isMarkable, renderSegments } from '../letter-text.jsx';
import { letterRoute, findLetterRoute } from '../letter-links.js';
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

const g = /** @type {any} */ (globalThis);
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

/** The collection's letters, loading the lazy corpus first when needed; [] when it failed to load. */
export function useLetters(col) {
  const [letters, setLetters] = React.useState(() => lettersOf(col));
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

/** main's painter over this page's blocks, again whenever a highlight or a note changes. Off for a gate boot. */
function useMainMarks(on, letterId) {
  const A = on ? g.AnnotationStore : null;
  const annV = useStoreVersion(A);
  const noteV = useStoreVersion(on ? g.NoteStore : null);
  React.useEffect(() => {
    if (!on || !letterId || typeof g.applyDOMHighlights !== 'function') return;
    try { g.applyDOMHighlights(); } catch (_e) { /* a mid-paint throw re-runs on the next change, as on main */ }
  }, [on, letterId, annV, noteV]);
}

/** The body's blocks: memoised, so React never re-renders text main's painter has split. */
const LetterBody = React.memo(/** @param {{ letter: any }} props */ function LetterBody({ letter }) {
  // Words To Live By, The Blessed and some Holy Days pages keep Format B `paragraphs`, anchored as main's wtlb:<id>:<i>
  if (!Array.isArray(letter.blocks) && Array.isArray(letter.paragraphs)) {
    return letter.paragraphs.map((p, i) => <FormatBBlock key={i} para={p} hlKey={wtlbHlKey(letter.id, i)} />);
  }
  return (letter.blocks || []).map((b, i) => <LetterBlock key={i} block={b} hlKey={isMarkable(b) ? paraKey(letter.id, i) : null} />);
});

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
      const now = letterRoute(target);
      if (now) { if (onGo) onGo(now); return; }
      findLetterRoute(target).then((r) => {
        if (r && onGo) onGo(r);
        else if (url) window.open(url, '_blank', 'noopener');
      });
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
 *   onGo?: (route: any) => void }} props
 */
export function LetterScreen({ collection, n = 0, preface = false, onReady, onOpenLetter, gate = null, desktop = false,
  waitDoubleTap = false, onNote, facts = {}, onGo }) {
  const col = collectionOf(collection);
  const letters = useLetters(col);
  const letter = letters ? (preface ? prefaceOf(col) : letterAt(letters, n)) : null;
  const bodyRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const [sheet, setSheet] = React.useState(
    /** @type {null | { el: Element, para: import('../marks.js').Para, colour: string, marked: boolean }} */ (null));
  // One toast at a time: Copy's and Share's words, or Listen's offline line (on a gate boot, 9c's from the page alone).
  const [toast, setToast] = React.useState(/** @type {import('../player/listen.jsx').Toast | null} */ (gateListenToast(gate)));
  const live = !gate;
  useMainMarks(live, letter ? letter.id : null);

  React.useEffect(() => { if (letters && onReady) onReady(); }, [letters, onReady]);

  // The gate's open sheet (states.json 4b: paragraph 1 tapped, gold ringed), from the page alone.
  const open = gate && gate.open && gate.open.sheet === 'mark-paragraph' ? gate.open : null;
  const openPara = open ? open.para || 0 : -1;
  const openColour = open ? open.colour || 'gold' : '';
  React.useLayoutEffect(() => {
    if (openPara < 0 || !letter || !bodyRef.current) return;
    const el = bodyRef.current.querySelector('[data-hl-key="' + paraKey(letter.id, openPara) + '"]');
    if (el) setSheet({ el, para: paragraphOf(el), colour: openColour, marked: false });
  }, [openPara, openColour, letter]);

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
  const onBodyClick = (e) => {
    if (e.defaultPrevented || gate) return;
    const target = /** @type {Element} */ (e.target);
    const el = target && target.closest ? target.closest('[data-hl-key]') : null;
    if (!el || target.closest('a, button, input, textarea, [role="button"]')) return;
    const sel = typeof window.getSelection === 'function' ? window.getSelection() : null;
    if (sel && !sel.isCollapsed && String(sel).trim()) return;
    if (Date.now() - gestureAt.current < DOUBLE_TAP_MS) return;
    if (pending.current) clearTimeout(pending.current);
    if (!waitDoubleTap) { openFor(el); return; }
    pending.current = setTimeout(() => { pending.current = null; openFor(el); }, DOUBLE_TAP_MS);
  };

  const close = React.useCallback(() => setSheet(null), []);
  const onColour = (kit) => {
    if (!sheet) return;
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
  // the header lines (main's letter-meta): date, from, spoken, for; then the note line and "Addendum to ..."
  const meta = [letter.date, letter.from, letter.spoken, letter.forLine].filter(filled).map(lineOf);
  if (filled(letter.noteLine)) meta.push(<span className="note">{lineOf(letter.noteLine)}</span>);
  if (filled(letter.metaAddendum)) meta.push(<Addendum letter={letter} onGo={onGo} />);
  const intro = Array.isArray(letter.sectionIntro) ? letter.sectionIntro : [];
  return (
    <>
      <div className="page-head g reader-head">
        <span className="overline eyebrow">{col.label} · {preface ? 'Preface' : 'Letter ' + n}</span>
        <h1 className={titleClass(letter.title)}>{letter.title}</h1>
        <ListenPill gate={gate} collection={collection} n={n} volKey={col.volKey} letter={letter} collectionLabel={col.label}
          onToast={setToast} />
        {meta.length > 0 && <div className="meta">{meta.map((m, i) => <React.Fragment key={i}>{i > 0 && <br />}{m}</React.Fragment>)}</div>}
        {/* the question put to The Lord that the letter answers */}
        {filled(letter.preamble) && <p className="preamble">{lineOf(letter.preamble)}</p>}
      </div>
      <div className="hair" />
      <div className={'body g first' + (sheet ? ' marked' : '')} ref={bodyRef} onClick={onBodyClick}>
        {intro.length > 0 && <SectionIntro blocks={intro} />}
        <LetterBody letter={letter} />
        {next && (
          <button type="button" className="nextcard" onClick={() => onOpenLetter && onOpenLetter(nextN)}>
            <span className="tx"><span className="k">Next · Letter {nextN}</span><span className="t">{next.title}</span></span>
            <span className="chev"><Icon name="chev" /></span>
          </button>
        )}
      </div>
      {/* the sentence being read, lit (readalong rv1 1b): main's read-along over the body's [data-hl-key] blocks */}
      <LetterReadAlong gate={gate} collection={collection} n={n} volKey={col.volKey} letterId={letter.id} bodyRef={bodyRef}
        on={facts.readAlong !== false} follow={facts.readAlongFollow !== false} onListen={listenHere(live, col, letter, setToast)} />
      {sheet && (
        <MarkSheet colour={sheet.colour} marked={sheet.marked} desktop={desktop} onColour={onColour} onNote={onAddNote}
          onCopy={onCopy} onShare={onShare} onClose={close} />
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
    waitDoubleTap={!desktop && !(facts && facts.doubleTapFullscreen === false)} onNote={openNote} facts={facts || {}} onGo={go} />;
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
