/** @jsx h */
/** @jsxFrag Fragment */
/* ═══════════════════════════════════════════════════════════════════════
   AnswersHome — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The Answers Only God Can Give landing (route answers-home; AOGCG final
   design f01, f02, f05, f06), top to bottom:

     the head (Topics & Doctrines, the (i) About), the title and the site's
     tagline; "Start with a question" with the search field, the question
     chips, "More questions" and "Surprise me"; the reading path (Start here
     or Continue in the site's order, kept on this device); then Contents | A–Z.

   Contents is the site's own sidebar in its order (the Main Page is the
   Start here card above it, not a row again: ANS1): the Ten Commandments, Other Topics (its page outside the menu last), the twelve
   numbered "Thus Says The Lord..." groups with our short names, the False
   Doctrines index, then Charts & videos and the credit. A query of two or
   more characters replaces everything under the field with the results,
   grouped by topic, in the main search engine's order once its index is
   ready (search200 h8: it put the right topic first twice as often as the
   box's own matcher, utils/answers-ranked.js); before that, title matches
   first, then the site's order (U2: no list is sorted by how much a topic
   says).

   The landing keeps its query, its tab and its open sheet in module memory,
   so Back from a topic returns to the same results, list or sheet (U5);
   entering from the Home card clears it (resetAnswersLanding). The route
   hands `entries` (ANSWERS, the Main Page included) once the lazy corpus has
   landed, null before: the head, title and ask paint at once.
   ═══════════════════════════════════════════════════════════════════════ */

import { h, Fragment } from '../jsx-h.js';
import { ANSWERS_COMMANDMENTS, ANSWERS_MAIN_PAGE_ID, answersShortTitle } from '../../utils/answers-shelves.js';
import { ANSWERS_SIDEBAR, ANSWERS_FD_INDEX_ID, ANSWERS_FD_INDEX_TEXT, ANSWERS_GROUP_NOTE, ANSWERS_NOT_IN_MENU, answersSiteOrder } from '../../utils/answers-site.js';
import {
  NBSP, SEP, pl, ANSWERS_QUESTIONS, ANSWERS_AZ_KEYS, ANSWERS_TAGLINE, answersRowSub, answersSizeWords, answersBrowseShelves,
  answersPlaceOf, answersAZGroups, answersOpenablePool, answersPathState, answersMediaIndex, answersMediaSummary, answersTopSections,
  answersSearchSum, answersSearchSub, answersHitSource, answersClosest, answersDomain, ANSWERS_TSTL_HEAD,
  ANSWERS_BAR_TITLE, answersBarTitleFit,
} from '../../utils/answers-browse.js';
import { answersIndexOf, answersSearch, answersTitleMatches, answersSnippet, answersPlainText, answersPlainLines } from '../../utils/answers-search.js';
import { answersEngineReady, answersRankedSearch } from '../../utils/answers-ranked.js';
import { scrollBehavior } from '../../utils/reduced-motion.js';
import { UiIcon } from '../components/UiIcon.jsx';
import { AnsIcon, AnsRow, Chev, LeadTitle, ReadMark, useAnswersMeta, useAnswersSaved, answersLayoutClass } from '../components/AnswersParts.jsx';
import { MoreQuestionsSheet, CommandmentSheet, AboutSheet } from '../sheets/AnswersSheets.jsx';
import { answersSavedSum } from '../../utils/answers-extras.js';

/** @typedef {{ kind: 'cmd', n: number } | { kind: 'more' } | { kind: 'about' } | null} AnswersSheetState */

let _landing = { query: '', tab: 'contents', sheet: /** @type {AnswersSheetState} */ (null), all: false };
export function resetAnswersLanding() { _landing = { query: '', tab: 'contents', sheet: null, all: false }; }

/* Recent searches: on this device only (f06c), the last five a reader went on to open. */
const RECENT_KEY = 'vot-answers-recent';
function readRecent() {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 5) : []; } catch (_e) { return []; }
}
function writeRecent(list) {
  try { if (list.length) localStorage.setItem(RECENT_KEY, JSON.stringify(list)); else localStorage.removeItem(RECENT_KEY); } catch (_e) { /* private mode: nothing kept */ }
}
function rememberQuery(q) {
  const t = String(q || '').trim();
  if (t.length < 2) return;
  writeRecent([t].concat(readRecent().filter((x) => x.toLowerCase() !== t.toLowerCase())).slice(0, 5));
}

/** The sentence the question chips finish (U9): the field's placeholder when it fits, else the line above the chips. */
export const ANSWERS_ASK_LEAD = 'What does The Lord say about…';

/** "What does The Lord say about…", or "Search Answers…" when the long words would not fit the field (U9). */
function usePlaceholder(inputRef) {
  const [ph, setPh] = React.useState(ANSWERS_ASK_LEAD);
  React.useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el || typeof getComputedStyle !== 'function') return undefined;
    const measure = () => {
      let ctx = null;
      try { ctx = document.createElement('canvas').getContext('2d'); } catch (_e) { ctx = null; }
      if (!ctx) return;
      const cs = getComputedStyle(el);
      ctx.font = 'italic ' + cs.fontSize + ' ' + cs.fontFamily;
      const room = el.clientWidth - parseFloat(cs.paddingLeft || '0') - parseFloat(cs.paddingRight || '0');
      if (room > 0) setPh(ctx.measureText(ANSWERS_ASK_LEAD).width <= room ? ANSWERS_ASK_LEAD : 'Search Answers…');
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [inputRef]);
  return ph;
}

/**
 * WA1: a pinned jump strip over a list of sections (A-Z letters, Contents parts). The current key only READS the
 * page's scroll (no scrollTop is written here): the last section head at or above the strip's foot. A tapped key
 * holds while the page travels to it, until the reader moves the page.
 */
function useJumpStrip(rootRef, stripRef, attr, first) {
  const [cur, setCur] = React.useState(first);
  const [atEnd, setAtEnd] = React.useState(false);
  const pin = React.useRef(/** @type {string | null} */ (null));
  React.useEffect(() => {
    const root = rootRef.current;
    const scroller = root && root.closest ? root.closest('.screen-scroll') : null;
    if (!root || !scroller) return undefined;
    let raf = 0;
    const read = () => {
      raf = 0;
      const strip = stripRef.current;
      const line = strip ? strip.getBoundingClientRect().bottom + 2 : 0;
      let now = null;
      for (const s of root.querySelectorAll(`[${attr}]`)) {
        if (s.getBoundingClientRect().top <= line) now = s.getAttribute(attr);
        else break;
      }
      if (pin.current) now = pin.current;
      if (now) setCur(now);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read); };
    const unpin = () => { pin.current = null; };
    const MOVES = ['touchstart', 'wheel', 'pointerdown', 'keydown'];
    scroller.addEventListener('scroll', onScroll, { passive: true });
    for (const t of MOVES) scroller.addEventListener(t, unpin, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      for (const t of MOVES) scroller.removeEventListener(t, unpin);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [rootRef, stripRef, attr]);
  // The strip keeps the current key in view by scrolling ITSELF sideways (its own scrollLeft).
  React.useEffect(() => {
    const strip = stripRef.current;
    const key = strip ? strip.querySelector('[aria-current="true"]') : null;
    if (!strip || !key) return;
    const k = /** @type {HTMLElement} */ (key);
    if (k.offsetLeft < strip.scrollLeft || k.offsetLeft + k.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollLeft = Math.max(0, k.offsetLeft - strip.clientWidth / 2 + k.offsetWidth / 2);
    }
  }, [cur, stripRef]);
  const onStripScroll = () => {
    const s = stripRef.current;
    if (s) setAtEnd(s.scrollLeft + s.clientWidth >= s.scrollWidth - 2);
  };
  // A key jumps the way a finger would (scrollIntoView, the reader's own sanctioned move).
  const jump = (L) => {
    const el = rootRef.current && rootRef.current.querySelector(`[${attr}="${L}"]`);
    if (!el) return;
    pin.current = L;
    el.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
    setCur(L);
  };
  return { cur, atEnd, onStripScroll, jump };
}

/** f05: every topic by title, under the sticky letter strip; the current letter follows the page. */
function AZPanel({ entries, meta, isRead, onOpenTopic }) {
  const groups = React.useMemo(() => answersAZGroups(entries), [entries]);
  const present = new Set(groups.map((g) => g.letter));
  const total = groups.reduce((a, g) => a + g.entries.length, 0);
  const rootRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const stripRef = React.useRef(/** @type {HTMLElement | null} */ (null));
  const { cur, atEnd, onStripScroll, jump } = useJumpStrip(rootRef, stripRef, 'data-az', groups.length ? groups[0].letter : '#');
  return (
    <div ref={rootRef}>
      <nav className={'ans-az-strip' + (atEnd ? ' is-end' : '')} aria-label="Jump to letter" ref={stripRef} onScroll={onStripScroll}>
        {ANSWERS_AZ_KEYS.map((L) => (
          <button key={L} type="button" className="ans-az-key" disabled={!present.has(L)} aria-current={cur === L ? 'true' : undefined}
            aria-label={L === '#' ? 'Numbers' : undefined} onClick={() => jump(L)}>{L}</button>
        ))}
      </nav>
      <p className="ans-note">{`${total} topics, filed under their first main word: “Regarding The Holy Days of God” is under H.`}</p>
      {groups.map((g) => (
        <section key={g.letter} data-az={g.letter} aria-labelledby={'ans-az-' + (g.letter === '#' ? 'num' : g.letter)}>
          <div className="ans-az-head">
            <h2 className="ans-az-letter" id={'ans-az-' + (g.letter === '#' ? 'num' : g.letter)}>{g.letter}</h2>
            <span className="ans-count">{pl(g.entries.length, 'topic')}</span>
          </div>
          <div className="ans-box">{g.entries.map((e) => (
            <AnsRow key={e.id} title={<LeadTitle title={e.title} />}
              sub={<>{answersPlaceOf(entries, e.id) + SEP + answersSizeWords(e, meta && meta[e.id], { minutes: false })}{isRead(e.id) ? <>{SEP}<ReadMark /></> : null}</>}
              onClick={() => onOpenTopic(e.id, null, 'Answers')} />
          ))}</div>
        </section>
      ))}
    </div>
  );
}

/**
 * The landing's scrolled-in bar title (ANS1): "Answers Only God Can Give" whole on one line, made smaller when it must
 * be (15 px at least), else "Answers"; never cut. The outer span holds the room and the CSS size, the inner the fit.
 */
function BarTitle() {
  const ref = React.useRef(/** @type {HTMLSpanElement | null} */ (null));
  const [fit, setFit] = React.useState(/** @type {{ full: boolean, size: number | null }} */ ({ full: true, size: null }));
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof getComputedStyle !== 'function') return undefined;
    let ctx = null;
    try { ctx = document.createElement('canvas').getContext('2d'); } catch (_e) { ctx = null; }
    if (!ctx) return undefined;
    const c2 = ctx;
    let live = true;
    const measure = () => {
      if (!live) return;
      const cs = getComputedStyle(el);
      const base = parseFloat(cs.fontSize);
      c2.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + base + 'px ' + cs.fontFamily;
      const next = answersBarTitleFit(c2.measureText(ANSWERS_BAR_TITLE).width, el.clientWidth, base, c2.measureText('Answers').width);
      setFit((f) => (f.full === next.full && f.size === next.size ? f : next));
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(el);
    // a reading face arrives after first paint: measure again once it is in
    const fonts = /** @type {any} */ (document).fonts;
    if (fonts && fonts.addEventListener) fonts.addEventListener('loadingdone', measure);
    if (fonts && fonts.ready) fonts.ready.then(measure, () => {});
    return () => { live = false; if (ro) ro.disconnect(); if (fonts && fonts.removeEventListener) fonts.removeEventListener('loadingdone', measure); };
  }, []);
  return (
    <span className="ans-bar-title" aria-hidden="true" ref={ref}>
      <span style={fit.size ? { fontSize: fit.size + 'px' } : undefined}>{fit.full ? ANSWERS_BAR_TITLE : 'Answers'}</span>
    </span>
  );
}

const GROUPS_SHOWN = 8;

/** f06: the results, one group per topic, its first hit under it; f06b when nothing answers. */
function Results({ entries, results, titleOnly, query, onOpenTopic, onSearchLibrary, onChip }) {
  const [all, setAll] = React.useState(_landing.all);
  React.useEffect(() => { _landing.all = all; }, [all]);
  const prev = React.useRef(query);
  React.useEffect(() => { if (prev.current !== query) { prev.current = query; setAll(false); } }, [query]);
  const q = query.trim();
  const loading = !!titleOnly;
  const groups = loading ? titleOnly : (results ? results.groups : []);
  if (!loading && !groups.length) {
    const close = answersClosest(entries, q, answersShortTitle);
    return (
      <div className="ans-results" role="status">
        <p className="ans-empty">Nothing in Answers speaks of “{q}”.</p>
        {close.length ? (
          <>
            <h2 className="ans-label">Closest topics</h2>
            {close.map((e) => <AnsRow key={e.id} title={<LeadTitle title={e.title} />} sub={answersPlaceOf(entries, e.id)} onClick={() => onOpenTopic(e.id, null, 'Answers')} />)}
          </>
        ) : (
          <div className="ans-chips">
            {ANSWERS_QUESTIONS.slice(0, 6).map(([qq, id]) => <button key={id} type="button" className="ans-chip" onClick={() => onChip(id)}>{qq}</button>)}
          </div>
        )}
        {onSearchLibrary ? <button type="button" className="ans-textbtn" onClick={() => onSearchLibrary(q)}>Search the whole library for “{q}”<Chev /></button> : null}
      </div>
    );
  }
  const words = results ? results.words : [];
  const shown = all ? groups : groups.slice(0, GROUPS_SHOWN);
  const more = groups.length - shown.length;
  const paraText = (g) => (g.first ? g.entry.paragraphs[g.first.index].text : null);
  // a passage hit opens on its paragraph with find-in-topic preset to the query (U8): the words the hit marked
  const open = (g) => { rememberQuery(q); onOpenTopic(g.entry.id, paraText(g), 'Answers', null, words.length ? { terms: words, label: q.trim() } : null); };
  // WA1 (a-query): "In Answers" and its count as the section head, one card per topic, the whole library last
  const sum = loading ? 'Searching…' : answersSearchSum(results);
  const HEAD = 'In Answers' + SEP;
  return (
    <div className="ans-results">
      <div className="ans-sechead"><h2 className="ans-h2">In Answers</h2><span className="ans-count" aria-live="polite">{sum.startsWith(HEAD) ? sum.slice(HEAD.length) : sum}</span></div>
      {shown.map((g) => {
        const t = paraText(g);
        const plain = t == null ? '' : (g.prose ? answersPlainLines(t) : answersPlainText(t));
        const segs = !loading && t != null ? answersSnippet(plain, words) : null;
        const src = !loading ? answersHitSource(g.entry, g.first, answersPlainText) : '';
        return (
          <button key={g.entry.id} type="button" className="ans-res" onClick={() => open(g)}>
            <span className="ans-row-title"><LeadTitle title={g.entry.title} /></span>
            <span className="ans-row-sub">{answersSearchSub(entries, g)}</span>
            {segs ? <span className="ans-hit-snip">{segs.map((s, i) => (s.hit ? <mark key={i}>{s.text}</mark> : <React.Fragment key={i}>{s.text}</React.Fragment>))}</span> : null}
            {segs && src ? <span className="ans-hit-src">{src}</span> : null}
          </button>
        );
      })}
      {more > 0 ? (
        <button type="button" className="ans-tile-btn ans-more-btn" aria-expanded="false" onClick={() => setAll(true)}>{'Show ' + pl(more, 'more topic')}</button>
      ) : null}
      {onSearchLibrary ? (
        <>
          <div className="ans-sechead"><h2 className="ans-h2">Everywhere else</h2></div>
          <div className="ans-box"><AnsRow one icon="search" title={`Search the whole library for “${q}”`} onClick={() => { rememberQuery(q); onSearchLibrary(q); }} /></div>
        </>
      ) : null}
    </div>
  );
}

/** Contents (f01, f02): the site's sidebar in its order. A memo, so typing in the field above never re-renders it. */
const Contents = React.memo(/** @param {any} props */ function Contents(props) {
  const { loaded, byId, shelves, meta, isRead, site, onOpenTopic, onOpenGroup, setSheet } = props;
  const rootRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const stripRef = React.useRef(/** @type {HTMLElement | null} */ (null));
  const { cur, atEnd, onStripScroll, jump } = useJumpStrip(rootRef, stripRef, 'data-jump', 'cmd');
  const openTopic = (id) => onOpenTopic(id, null, 'Answers');
  const openSheet = (s) => { if (loaded) setSheet(s); };
  const sub = (e) => (
    <>{answersRowSub(e, meta && meta[e.id])}{isRead(e.id) ? <>{SEP}<ReadMark /></> : null}</>
  );
  const cmdShelves = shelves.commandments;
  const cmdTotal = cmdShelves.reduce((a, s) => a + s.topics.length, 0);
  const groupTotal = shelves.groups.reduce((a, s) => a + s.topics.length, 0);
  const fdEntry = byId.get(ANSWERS_FD_INDEX_ID) || null;
  const fdMeta = meta && meta[ANSWERS_FD_INDEX_ID];
  const tstlHead = shelves.groups.length ? shelves.groups[0].label.replace(/^\d+\.\s*/, '') : ANSWERS_TSTL_HEAD;

  const tablets = ANSWERS_COMMANDMENTS.map((c, i) => {
    const s = cmdShelves[i];
    const n = s ? s.topics.length : 0;
    const read = !!(s && n && s.topics.every((e) => isRead(e.id)));
    const label = (s ? s.label : ANSWERS_SIDEBAR[i]) + (loaded ? ' ' + (n === 1 ? '1 topic' : n + ' topics') + (read ? ', read' : '') : '');
    return (
      <button key={c.n} type="button" className="ans-tablet" aria-haspopup="dialog" aria-label={label} onClick={() => openSheet({ kind: 'cmd', n: c.n })}>
        <span className="ans-num">{c.numeral}</span>
        <span className="ans-row-title">{c.label}{read ? <ReadMark bare /> : null}</span>
      </button>
    );
  });

  // ANS1: the Main Page is the Start here card above, so neither the strip nor the list offers it again
  const parts = [['cmd', 'Ten Commandments']].concat(loaded ? [['other', 'Other topics'], ['tstl', 'Thus Says The Lord']] : [],
    loaded && (shelves.index || fdEntry) ? [['fd', 'False doctrines']] : []);
  return (
    <div role="tabpanel" id="ans-panel-c" aria-labelledby="ans-tab-c" ref={rootRef}>
      {/* WA1 (a-contents): the parts as a pinned strip under the Contents | A-Z switch */}
      <nav className={'ans-az-strip ans-jump-strip' + (atEnd ? ' is-end' : '')} aria-label="Jump to a part" ref={stripRef} onScroll={onStripScroll}>
        {parts.map(([k, t]) => <button key={k} type="button" className="ans-az-key" aria-current={cur === k ? 'true' : undefined} onClick={() => jump(k)}>{t}</button>)}
      </nav>
      <div className="ans-sechead" data-jump="cmd"><h2 className="ans-h2">The Ten Commandments</h2>{loaded ? <span className="ans-count">{pl(cmdTotal, 'topic')}</span> : null}</div>
      <div className="ans-tablets ans-box">{tablets}</div>
      {loaded ? (
        <>
          <div className="ans-sechead" data-jump="other"><h2 className="ans-h2">Other Topics</h2><span className="ans-count">{pl(shelves.otherTopics.length, 'topic')}</span></div>
          <div className="ans-box">{shelves.otherTopics.map((e) => (
            <AnsRow key={e.id} title={<LeadTitle title={e.title} />}
              sub={shelves.other && shelves.other.notInMenu.includes(e) ? <>{answersRowSub(e, meta && meta[e.id])}{SEP}<em>{ANSWERS_NOT_IN_MENU}</em>{isRead(e.id) ? <>{SEP}<ReadMark /></> : null}</> : sub(e)}
              onClick={() => openTopic(e.id)} />
          ))}</div>
          <div className="ans-sechead" data-jump="tstl"><h2 className="ans-h2">{tstlHead}</h2><span className="ans-count">{pl(groupTotal, 'topic')}</span></div>
          <p className="ans-note">{ANSWERS_GROUP_NOTE}</p>
          <div className="ans-box">{shelves.groups.map((g) => {
            const r = g.topics.filter((e) => isRead(e.id)).length;
            return (
              <AnsRow key={g.n} title={g.short}
                sub={pl(g.topics.length, 'topic') + (r ? SEP + r + NBSP + 'read' : '')}
                label={`${g.short}. ${pl(g.topics.length, 'topic').replace(NBSP, ' ')}${r ? `, ${r} read` : ''}`}
                onClick={() => onOpenGroup && onOpenGroup(String(g.num))} />
            );
          })}</div>
          {shelves.index ? <div className="ans-sechead" data-jump="fd"><h2 className="ans-h2">{shelves.index.label}</h2></div> : null}
          {fdEntry ? (
            // The same sentence before the sidecar lands, less its count, so the row keeps its lines (10-22 sweep,
            // Discovery views 6: at 360 px it grew a line, 76 -> 93 px, when the count arrived)
            <div className="ans-box" data-jump={shelves.index ? undefined : 'fd'}><AnsRow title={ANSWERS_FD_INDEX_TEXT} sub={(fdMeta ? pl(answersTopSections(fdMeta).length, 'category') : 'Categories') + ', each answered by The Truth'}
              onClick={() => openTopic(ANSWERS_FD_INDEX_ID)} /></div>
          ) : null}
          {site ? (
            <p className="ans-credit">
              {'From ' + answersDomain(site.site)}<br />{'Captured ' + site.capturedAt}<br />
              <a href="#" role="button" aria-haspopup="dialog" onClick={(e) => { e.preventDefault(); openSheet({ kind: 'about' }); }}>About this collection<Chev /></a>
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
});

/**
 * @param {{ entries: any[] | null, site?: any, isRead?: (id: string) => boolean, pathOn?: boolean, pathLast?: string | null,
 *   fontScale?: any, onBack: () => void, onSearch?: any, onHistory?: any, onSettings?: any, theme?: any,
 *   onThemeChange?: any, onOpenTopic: Function, onOpenGroup?: (key: string) => void, onOpenMedia?: () => void,
 *   onOpenSaved?: () => void, onSearchLibrary?: (q: string) => void, onGoToRef?: (ref: string) => void }} props
 */
export function AnswersHome({ entries, site, isRead: isReadRaw, pathOn = true, pathLast = null, fontScale, onBack, onSearch, onHistory, onSettings, theme, onThemeChange,
  onOpenTopic, onOpenGroup, onOpenMedia, onOpenSaved, onSearchLibrary, onGoToRef }) {
  const meta = useAnswersMeta();
  const loaded = Array.isArray(entries) && entries.length > 0;
  const list = React.useMemo(() => (loaded ? /** @type {any[]} */ (entries) : []), [loaded, entries]);
  const isRead = React.useCallback((id) => !!(pathOn && isReadRaw && isReadRaw(id)), [pathOn, isReadRaw]);
  const [query, setQuery] = React.useState(_landing.query);
  const [tab, setTab] = React.useState(_landing.tab);
  const [sheet, setSheet] = React.useState(/** @type {AnswersSheetState} */ (_landing.sheet));
  const [focused, setFocused] = React.useState(false);
  const [recent, setRecent] = React.useState(readRecent);
  React.useEffect(() => { _landing.query = query; _landing.tab = tab; _landing.sheet = sheet; }, [query, tab, sheet]);
  const inputRef = React.useRef(/** @type {HTMLInputElement | null} */ (null));
  const tabCRef = React.useRef(/** @type {HTMLButtonElement | null} */ (null));
  const tabAzRef = React.useRef(/** @type {HTMLButtonElement | null} */ (null));
  const placeholder = usePlaceholder(inputRef);
  const ts2 = answersLayoutClass(fontScale, false).includes('ans-ts2');

  const byId = React.useMemo(() => new Map(list.map((e) => [e.id, e])), [list]);
  const shelves = React.useMemo(() => answersBrowseShelves(list), [list]);
  const order = React.useMemo(() => answersSiteOrder(list), [list]);
  const posOf = React.useMemo(() => { const m = new Map(order.map((e, i) => [e.id, i])); return (id) => (m.has(id) ? m.get(id) : 1e6); }, [order]);
  const index = React.useMemo(() => answersIndexOf(list), [list]);
  const opts = React.useMemo(() => ({ pos: posOf, sections: (id) => (meta && meta[id] && meta[id].sections) || null }), [posOf, meta]);
  const deferred = React.useDeferredValue(query);
  const q = query.trim();
  const isQuery = q.length >= 2;
  const boxResults = React.useMemo(() => (loaded && deferred.trim().length >= 2 ? answersSearch(index, deferred, opts) : null), [loaded, index, deferred, opts]);
  /* RANKED BY THE MAIN ENGINE (search200 h8): once its index is ready, the engine kept to Answers orders the
     topics (utils/answers-ranked.js); the box's own groups stand in while it builds, or when a search fails.
     While the engine answers, the title matches show as they do while typing ("Searching…"). */
  const dq = deferred.trim();
  const engineOn = loaded && dq.length >= 2 && answersEngineReady(/** @type {any} */ (window).VotSearchMini);
  const [ranked, setRanked] = React.useState(/** @type {{ q: string, r: any } | null} */ (null));
  React.useEffect(() => {
    if (!engineOn) return undefined;
    let live = true;
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    answersRankedSearch(/** @type {any} */ (window).VotSearchMini, index, dq, { ...opts, signal: ctl ? ctl.signal : undefined })
      .then((r) => { if (live) setRanked({ q: dq, r }); }, () => { if (live) setRanked({ q: dq, r: null }); });
    return () => { live = false; if (ctl) ctl.abort(); };
  }, [engineOn, index, dq, opts]);
  const rankedNow = engineOn && ranked && ranked.q === dq ? ranked : null;
  const results = rankedNow && rankedNow.r ? rankedNow.r : boxResults;
  const pending = isQuery && (dq !== q || (engineOn && !rankedNow));
  const titleOnly = React.useMemo(() => (pending && loaded ? answersTitleMatches(index, query, opts) : null), [pending, loaded, index, query, opts]);
  const recentMode = focused && !q && recent.length > 0;
  const media = React.useMemo(() => (loaded && meta ? answersMediaIndex(list, meta) : null), [loaded, list, meta]);
  // O5: the Tools row counts the reader's marks live, and shows only when there are any.
  const savedSum = answersSavedSum(useAnswersSaved(loaded ? list : null));

  // Back with a query typed clears it before it leaves the screen (Android Back order, §2.5).
  React.useEffect(() => {
    if (!query) return undefined;
    const fn = () => { setQuery(''); return true; };
    window.__screenBack = fn;
    return () => { if (window.__screenBack === fn) window.__screenBack = null; };
  }, [query]);
  const handleNavBack = () => { if (query) setQuery(''); else onBack(); };
  const closeSheet = React.useCallback(() => setSheet(null), []);
  const openTopic = (id, anchor, from, section, find) => (find ? onOpenTopic(id, anchor || null, from || 'Answers', section || null, find) : onOpenTopic(id, anchor || null, from || 'Answers'));
  const chip = (id) => openTopic(id, null, 'Answers');

  const main = byId.get(ANSWERS_MAIN_PAGE_ID) || null;
  // Surprise me: a quote paragraph anywhere in Answers, opened on its own words.
  const surprise = () => {
    const all = loaded ? answersOpenablePool(list, meta) : [];
    if (!all.length) return;
    const at = all[Math.floor(Math.random() * all.length)];
    const t = byId.get(at.id);
    if (t) openTopic(at.id, t.paragraphs[at.index].text, 'Answers');
  };

  // The reading path (f01 #8): Continue in the site's order; off in Settings, always the start.
  let path = null;
  if (loaded && main) {
    const st = pathOn ? answersPathState(list, isRead, pathLast) : { kind: 'start', entry: main, n: 0 };
    const topics = order.length - 1;
    // WA1 (a-land): a "Start here" card; the label says which way the path stands
    if (st.kind === 'continue') {
      path = { k: 'Continue', title: <LeadTitle title={st.entry.title} />, sub: st.n + NBSP + 'of ' + topics + NBSP + 'topics' + SEP + 'in the site’s order', id: st.entry.id };
    } else if (st.kind === 'again') {
      path = { k: 'Start again', title: 'Main Page', sub: 'in the site’s order', id: main.id };
    } else {
      path = { k: 'Start here', title: 'Main Page', sub: answersSizeWords(main, meta && meta[main.id]), id: main.id };
    }
  }

  const openSheet = (s) => { if (loaded) setSheet(s); };
  const cmdShelf = sheet && sheet.kind === 'cmd' ? shelves.commandments.find((s) => s.num === sheet.n) : null;
  const contents = <Contents loaded={loaded} byId={byId} shelves={shelves} meta={meta} isRead={isRead} site={site}
    onOpenTopic={onOpenTopic} onOpenGroup={onOpenGroup} setSheet={setSheet} />;

  // A saved A–Z tab waits for the corpus: until then Contents shows, so it is the selected tab.
  const az = tab === 'az' && loaded;
  const onTabKey = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = az ? 'contents' : 'az';
      setTab(next);
      // focus follows the selection (nightly 11-01 #4): a screen reader then reads the tab now selected. A–Z is
      // selected only once the corpus is in (az above): before that, Contents stays selected and keeps the focus.
      const el = (next === 'az' && loaded ? tabAzRef : tabCRef).current;
      if (el) el.focus();
    }
  };

  /* WA1 (a-query): asking takes over the top bar. The field moves there with the first letter and comes back when it
     empties; a field that had the caret keeps it across the move (hadFocus), at the end of the words. */
  const asking = !!query;
  const hadFocus = React.useRef(false);
  React.useEffect(() => {
    const el = inputRef.current;
    if (!el || !hadFocus.current || document.activeElement === el) return;
    el.focus();
    try { el.setSelectionRange(el.value.length, el.value.length); } catch (_e) { /* type=search may refuse */ }
  }, [asking]);
  const field = (
    <div className={'ans-search' + (query ? ' has-q' : '') + (asking ? ' ans-bar-field' : '')}>
      {asking ? <span className="ans-search-lead" aria-hidden="true"><AnsIcon name="search" /></span> : null}
      <input ref={inputRef} className="ans-search-input" type="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false}
        value={query} placeholder={placeholder} aria-label="Search Answers"
        onChange={(e) => { hadFocus.current = true; setQuery(e.target.value); }}
        onFocus={() => { hadFocus.current = true; setRecent(readRecent()); setFocused(true); }}
        onBlur={() => { hadFocus.current = false; setFocused(false); }}
        onKeyDown={(e) => { if (e.key === 'Enter') rememberQuery(query); }} />
      {query ? (
        <button type="button" className="ans-search-btn" aria-label="Clear search" onPointerDown={(e) => e.preventDefault()} onClick={() => { hadFocus.current = true; setQuery(''); }}><AnsIcon name="close" /></button>
      ) : (
        <button type="button" className="ans-search-btn" aria-label="Search" onClick={() => { if (inputRef.current) inputRef.current.focus(); }}><AnsIcon name="search" /></button>
      )}
    </div>
  );

  return (
    <ScreenLayout className={answersLayoutClass(fontScale, true)}
      navChildren={LibraryNav({ onBack: handleNavBack, backLabel: query ? 'Answers' : 'Home', showHome: true, onSettings, onHistory, onSearch, theme, onThemeChange,
        hide: asking ? ['settings', 'history', 'search', 'theme'] : undefined,
        leftExtras: asking ? field : <BarTitle /> })}>
      <div className={'ans-page ans-landing' + (isQuery || recentMode ? ' is-query' : '') + (asking ? ' is-asking' : '')}>
        <div className="ans-landing-a">
          {/* WA1 (a-land): the hero centred; About lives at the foot of Contents */}
          <div className="ans-hero-c">
            <p className="ans-label">Topics &amp; Doctrines</p>
            <h1 className="ans-display"><span className="ans-line">Answers Only</span> <span className="ans-line">God Can Give</span></h1>
            <p className="ans-lede">{(site && site.tagline) || ANSWERS_TAGLINE}</p>
          </div>
          <section className="ans-ask" aria-label="Start with a question" role="search">
            {asking ? null : field}
            {asking || recentMode ? null : (
              <>
                {/* ANS1: the chips finish this sentence; when the field cannot hold it, it stands above them */}
                {placeholder === ANSWERS_ASK_LEAD ? null : <p className="ans-ask-lead">{ANSWERS_ASK_LEAD}</p>}
                <div className="ans-chips">
                  {ANSWERS_QUESTIONS.slice(0, 6).filter(([qq]) => !/holidays/.test(qq)).map(([qq, id]) => <button key={id} type="button" className="ans-chip" onClick={() => chip(id)}>{qq}</button>)}
                  <button type="button" className="ans-chip is-more" aria-haspopup="dialog" onClick={() => openSheet({ kind: 'more' })}>More questions</button>
                  <button type="button" className="ans-chip is-surprise" disabled={!loaded} onClick={surprise}><AnsIcon name="shuffle" />Surprise me</button>
                </div>
              </>
            )}
          </section>
          {isQuery && loaded ? (
            <Results entries={list} results={pending ? null : results} titleOnly={pending ? titleOnly : null} query={pending ? query : deferred}
              onOpenTopic={openTopic} onSearchLibrary={onSearchLibrary} onChip={chip} />
          ) : recentMode ? (
            <div className="ans-results ans-recent">
              <div className="ans-results-sum">
                <p className="ans-label">Recent searches</p>
                <button type="button" className="ans-textbtn" onPointerDown={(e) => e.preventDefault()} onClick={() => { writeRecent([]); setRecent([]); }}>Clear</button>
              </div>
              {recent.map((r) => (
                <button key={r} type="button" className="ans-row" onPointerDown={(e) => e.preventDefault()} onClick={() => setQuery(r)}>
                  <AnsIcon name="search" /><span className="ans-row-body"><span className="ans-row-title">{r}</span></span>
                </button>
              ))}
            </div>
          ) : (
            <>
              {path ? (
                <button type="button" className="ans-start" onClick={() => openTopic(path.id)}>
                  <span className="ans-row-body"><span className="ans-k">{path.k}</span><span className="ans-row-title">{path.title}</span><span className="ans-row-sub">{path.sub}</span></span><Chev />
                </button>
              ) : null}
              {/* WA1 (a-land, a-media, a-saved): both doors always on the landing */}
              <div className="ans-two">
                <button type="button" className="ans-tile-btn" onClick={() => onOpenMedia && onOpenMedia()} aria-label={'Charts and videos' + (media ? ', ' + answersMediaSummary(media) : '')}><UiIcon name="film" size="sm" />Charts and videos</button>
                <button type="button" className="ans-tile-btn" onClick={() => onOpenSaved && onOpenSaved()} aria-label={'Saved answers' + (savedSum ? ', ' + savedSum : '')}><UiIcon name="star" size="sm" />Saved answers</button>
              </div>
            </>
          )}
        </div>
        <div className="ans-landing-b">
          <div className="ans-tabs" role="tablist" aria-label="Browse Answers">
            <button ref={tabCRef} type="button" className="ans-tab" role="tab" id="ans-tab-c" aria-controls="ans-panel-c" aria-selected={!az}
              tabIndex={az ? -1 : 0} onClick={() => setTab('contents')} onKeyDown={onTabKey}>Contents</button>
            <button ref={tabAzRef} type="button" className="ans-tab" role="tab" id="ans-tab-az" aria-controls="ans-panel-az" aria-selected={az}
              tabIndex={az ? 0 : -1} onClick={() => setTab('az')} onKeyDown={onTabKey}>A–Z</button>
          </div>
          {az ? (
            <div role="tabpanel" id="ans-panel-az" aria-labelledby="ans-tab-az">
              <AZPanel entries={list} meta={meta} isRead={isRead} onOpenTopic={openTopic} />
            </div>
          ) : contents}
        </div>
      </div>
      {sheet && sheet.kind === 'more' && loaded ? <MoreQuestionsSheet byId={byId} meta={meta} onOpenTopic={openTopic} onClose={closeSheet} tall={ts2} /> : null}
      {cmdShelf ? <CommandmentSheet shelf={cmdShelf} meta={meta} isRead={isRead} onOpenTopic={openTopic} onGoToRef={onGoToRef} onStep={(n) => openSheet({ kind: 'cmd', n })} onClose={closeSheet} tall={ts2} /> : null}
      {sheet && sheet.kind === 'about' && site ? <AboutSheet site={site} onOpenTopic={openTopic} onClose={closeSheet} /> : null}
    </ScreenLayout>
  );
}

