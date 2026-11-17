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
import { ANSWERS_SIDEBAR, ANSWERS_FD_INDEX_ID, ANSWERS_FD_INDEX_TEXT, answersSiteOrder } from '../../utils/answers-site.js';
import {
  NBSP, SEP, pl, ANSWERS_QUESTIONS, ANSWERS_AZ_KEYS, ANSWERS_TAGLINE, answersSizeWords, answersBrowseShelves,
  answersPlaceOf, answersAZGroups, answersOpenablePool, answersPathState, answersMediaIndex, answersMediaSummary, answersTopSections,
  answersSearchSum, answersSearchSub, answersHitSource, answersClosest, answersDomain, answersMinWords, ANSWERS_OTHER_LABEL,
  ANSWERS_BAR_TITLE, answersBarTitleFit,
} from '../../utils/answers-browse.js';
import { answersIndexOf, answersSearch, answersTitleMatches, answersSnippet, answersPlainText, answersPlainLines } from '../../utils/answers-search.js';
import { answersEngineReady, answersRankedSearch } from '../../utils/answers-ranked.js';
import { scrollBehavior } from '../../utils/reduced-motion.js';
import { UiIcon } from '../components/UiIcon.jsx';
import { AnsIcon, AnsRow, Chev, LeadTitle, ReadMark, useAnswersMeta, useAnswersSaved, answersLayoutClass } from '../components/AnswersParts.jsx';
import { MoreQuestionsSheet, CommandmentSheet, AboutSheet } from '../sheets/AnswersSheets.jsx';
import { answersSavedSum } from '../../utils/answers-extras.js';
import { answersFromSearch, setAnswersFromSearch } from '../../utils/answers-from-search.js';

/** @typedef {{ kind: 'cmd', n: number } | { kind: 'more' } | { kind: 'about' } | null} AnswersSheetState */

/* 0125: the open group (one at a time), the page's scroll and, in A-Z, the scroll it was entered from: Back from a
   topic finds the landing as it was left. */
let _landing = { query: '', tab: 'contents', sheet: /** @type {AnswersSheetState} */ (null), all: false, open: /** @type {string | null} */ (null), scroll: 0, azFrom: 0 };
export function resetAnswersLanding() { _landing = { query: '', tab: 'contents', sheet: null, all: false, open: null, scroll: 0, azFrom: 0 }; setAnswersFromSearch(null); }
/** Search's "Or ask" row: the landing opens holding the words typed in Search, and its Back returns there. @param {string} q */
export function openAnswersLandingFromSearch(q) {
  resetAnswersLanding();
  setAnswersFromSearch(q || '');
  _landing.query = answersFromSearch() || '';
}

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
      // measure in the placeholder's own face: the landing draws it upright, and italic measured narrower (0125)
      let ps = null;
      try { ps = getComputedStyle(el, '::placeholder'); } catch (_e) { ps = null; }
      const f = ps && ps.fontFamily ? ps : cs;
      ctx.font = [f.fontStyle || 'normal', f.fontWeight || '400', f.fontSize || cs.fontSize, f.fontFamily || cs.fontFamily].join(' ');
      const room = el.clientWidth - parseFloat(cs.paddingLeft || '0') - parseFloat(cs.paddingRight || '0');
      // 0125: at text 2.0 on 360 px even "Search Answers…" was cut ("Search Answer…"): the last step is "Search…"
      const ls = parseFloat(f.letterSpacing) || 0;   // 1 px at 30 px text: 15 more px than the canvas says
      if (room > 0) setPh([ANSWERS_ASK_LEAD, 'Search Answers…'].find((t) => ctx.measureText(t).width + ls * t.length <= room) || 'Search…');
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

/**
 * 0125 B, Browse: one list, one pattern (the hub's comparison with the site, Corbin 11-17 "easily comprehensible ...
 * intuitive"). Start here (the site's Main Page; Continue once a reading path is under way), the Ten Commandments
 * tablets (each opens its sheet, where the commandment's own words live), then the thirteen groups, each opening IN
 * PLACE to its topics' plain names (one open at a time; tap again closes), then the False Doctrines index, Charts
 * and videos, Saved answers. A memo, so typing in the field above never re-renders it.
 */
const Browse = React.memo(/** @param {any} props */ function Browse(props) {
  const { loaded, byId, shelves, meta, isRead, site, path, open, setOpen, onOpenTopic, setSheet, onOpenMedia, onOpenSaved, mediaLabel, savedLabel } = props;
  const openTopic = (/** @type {string} */ id, from = '') => onOpenTopic(id, null, from || 'Answers');
  const openSheet = (s) => { if (loaded) setSheet(s); };
  const cmdShelves = shelves.commandments;
  const fdEntry = byId.get(ANSWERS_FD_INDEX_ID) || null;
  const fdMeta = meta && meta[ANSWERS_FD_INDEX_ID];

  const tablets = ANSWERS_COMMANDMENTS.map((c, i) => {
    const s = cmdShelves[i];
    const n = s ? s.topics.length : 0;
    const read = !!(s && n && s.topics.every((e) => isRead(e.id)));
    const label = (s ? s.label : ANSWERS_SIDEBAR[i]) + (loaded ? ' ' + (n === 1 ? '1 topic' : n + ' topics') + (read ? ', read' : '') : '');
    return (
      <button key={c.n} type="button" className="ans-tablet" aria-haspopup="dialog" aria-label={label} onClick={() => openSheet({ kind: 'cmd', n: c.n })}>
        <span className="ans-num">{c.numeral}</span>
        <span className="ans-row-title">{c.label}{read ? <ReadMark bare /> : null}</span>
        {/* 0125 (a): the tablet says what it opens */}
        {loaded ? <span className="ans-row-sub">{pl(n, 'topic')}<Chev /></span> : null}
      </button>
    );
  });

  // The thirteen: the site's Other Topics, then its twelve numbered groups by our short names.
  const groups = loaded
    ? [{ key: 'other', title: ANSWERS_OTHER_LABEL, topics: shelves.otherTopics }].concat(shelves.groups.map((g) => ({ key: String(g.num), title: g.short, topics: g.topics })))
    : [];
  return (
    <div className="ans-browse">
      {path ? (
        <div className="ans-box">
          <AnsRow className="ans-start-row" title={path.title} sub={path.sub} onClick={() => openTopic(path.id)} />
        </div>
      ) : null}
      <div className="ans-sechead"><h2 className="ans-h2">The Ten Commandments</h2></div>
      <div className="ans-tablets ans-box">{tablets}</div>
      {loaded ? (
        <>
          <div className="ans-sechead"><h2 className="ans-h2">Topics</h2></div>
          <div className="ans-box ans-groups">{groups.map((g) => {
            const on = open === g.key;
            const read = g.topics.filter((e) => isRead(e.id)).length;
            const first = g.topics.find((e) => !isRead(e.id));
            const start = read && first ? first : g.topics[0];
            return (
              <div key={g.key} className={'ans-group' + (on ? ' is-open' : '')} data-group={g.key}>
                <button type="button" className="ans-row ans-group-row" aria-expanded={on} aria-controls={'ans-g-' + g.key} onClick={() => setOpen(on ? null : g.key)}>
                  <span className="ans-row-body"><span className="ans-row-title">{g.title}{g.topics.length && read === g.topics.length ? <ReadMark bare /> : null}</span></span>
                  <Chev dir={on ? 'up' : 'down'} />
                </button>
                {on ? (
                  <ul className="ans-group-topics" id={'ans-g-' + g.key} aria-label={g.title}>
                    {g.topics.map((e) => (
                      <li key={e.id}>
                        <button type="button" className="ans-group-topic" onClick={() => openTopic(e.id, g.title)}>
                          <span className="ans-topic-name"><LeadTitle title={e.title} />{isRead(e.id) ? <ReadMark bare /> : null}</span>
                        </button>
                      </li>
                    ))}
                    {g.topics.length > 1 && start ? (
                      <li><button type="button" className="ans-textbtn ans-group-all" onClick={() => openTopic(start.id, g.title)}>{`Read all ${g.topics.length} in order`}<Chev /></button></li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
            );
          })}</div>
          <div className="ans-box ans-more-rows">
            {fdEntry ? (
              <AnsRow title={ANSWERS_FD_INDEX_TEXT} sub={(fdMeta ? pl(answersTopSections(fdMeta).length, 'category') : 'Categories') + ', each answered by The Truth'}
                onClick={() => openTopic(ANSWERS_FD_INDEX_ID)} />
            ) : null}
            <button type="button" className="ans-row ans-icon-row" onClick={() => onOpenMedia && onOpenMedia()} aria-label={mediaLabel}>
              <UiIcon name="film" size="sm" /><span className="ans-row-body"><span className="ans-row-title">Charts and videos</span></span><Chev />
            </button>
            <button type="button" className="ans-row ans-icon-row" onClick={() => onOpenSaved && onOpenSaved()} aria-label={savedLabel}>
              <UiIcon name="star" size="sm" /><span className="ans-row-body"><span className="ans-row-title">Saved answers</span></span><Chev />
            </button>
          </div>
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
  onOpenTopic, onOpenGroup: _openGroup, onOpenMedia, onOpenSaved, onSearchLibrary, onGoToRef }) {
  const meta = useAnswersMeta();
  const loaded = Array.isArray(entries) && entries.length > 0;
  const list = React.useMemo(() => (loaded ? /** @type {any[]} */ (entries) : []), [loaded, entries]);
  const isRead = React.useCallback((id) => !!(pathOn && isReadRaw && isReadRaw(id)), [pathOn, isReadRaw]);
  const [query, setQuery] = React.useState(_landing.query);
  const [tab, setTab] = React.useState(_landing.tab);
  const [sheet, setSheet] = React.useState(/** @type {AnswersSheetState} */ (_landing.sheet));
  const [open, setOpen] = React.useState(_landing.open);
  const [focused, setFocused] = React.useState(false);
  const [recent, setRecent] = React.useState(readRecent);
  React.useEffect(() => { _landing.query = query; _landing.tab = tab; _landing.sheet = sheet; _landing.open = open; }, [query, tab, sheet, open]);
  const inputRef = React.useRef(/** @type {HTMLInputElement | null} */ (null));
  const pageRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const browseRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const leaveAZ = React.useCallback(() => { setTab('contents'); }, []);
  const scrollerOf = () => (pageRef.current && pageRef.current.closest ? /** @type {HTMLElement | null} */ (pageRef.current.closest('.screen-scroll')) : null);
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
  // Opened from Search's "Or ask" with his words still in the box, Back goes straight back to Search (PL-SEARCH 2).
  const carried = answersFromSearch();
  const backClears = !!query && !(carried !== null && query.trim() === carried);
  const azBack = tab === 'az' && !backClears;
  React.useEffect(() => {
    if (!backClears && !azBack) return undefined;
    const fn = () => { if (backClears) setQuery(''); else leaveAZ(); return true; };
    window.__screenBack = fn;
    return () => { if (window.__screenBack === fn) window.__screenBack = null; };
  }, [backClears, azBack, leaveAZ]);
  const handleNavBack = () => { if (backClears) setQuery(''); else if (azBack) leaveAZ(); else onBack(); };
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

  // The reading path (f01 #8): Continue in the site's order; off in Settings, always the start. 0125 B/E: a row,
  // "Start here", the site's Main Page called what it is to a reader (its page says "Introduction").
  let path = null;
  if (loaded && main) {
    const st = pathOn ? answersPathState(list, isRead, pathLast) : { kind: 'start', entry: main, n: 0 };
    const topics = order.length - 1;
    if (st.kind === 'continue') {
      path = { title: <>{'Continue: '}<LeadTitle title={st.entry.title} /></>, sub: st.n + NBSP + 'of ' + topics + NBSP + 'topics' + SEP + 'in the site’s order', id: st.entry.id };
    } else if (st.kind === 'again') {
      path = { title: 'Start again', sub: 'introduction' + SEP + 'in the site’s order', id: main.id };
    } else {
      const m = meta && meta[main.id];
      path = { title: 'Start here', sub: 'introduction' + (m ? SEP + answersMinWords(m) : ''), id: main.id };
    }
  }

  const openSheet = (s) => { if (loaded) setSheet(s); };
  const cmdShelf = sheet && sheet.kind === 'cmd' ? shelves.commandments.find((s) => s.num === sheet.n) : null;
  const mediaLabel = 'Charts and videos' + (media ? ', ' + answersMediaSummary(media) : '');
  const savedLabel = 'Saved answers' + (savedSum ? ', ' + savedSum : '');
  const browse = <Browse loaded={loaded} byId={byId} shelves={shelves} meta={meta} isRead={isRead} site={site} path={path} open={open} setOpen={setOpen}
    onOpenTopic={onOpenTopic} setSheet={setSheet} onOpenMedia={onOpenMedia} onOpenSaved={onOpenSaved} mediaLabel={mediaLabel} savedLabel={savedLabel} />;

  // A saved A–Z waits for the corpus: until then the groups show.
  const az = tab === 'az' && loaded;
  /* 0125 (b): A–Z is a mode of the landing. The Browse head's link enters it (at its head); Back, or "By group",
     leaves it at the scroll it was entered from. */
  const enterAZ = () => {
    const sc = scrollerOf();
    _landing.azFrom = sc ? sc.scrollTop : 0;
    setTab('az');
  };
  const azWas = React.useRef(az);
  React.useLayoutEffect(() => {
    if (azWas.current === az) return;
    azWas.current = az;
    const sc = scrollerOf();
    if (!sc) return;
    if (az) { const head = browseRef.current; if (head) sc.scrollTop = Math.max(0, sc.scrollTop + head.getBoundingClientRect().top - sc.getBoundingClientRect().top); }
    else sc.scrollTop = _landing.azFrom;
  }, [az]);
  // The page's scroll, kept for Back from a topic and put back once the lists are in.
  const restored = React.useRef(false);
  React.useLayoutEffect(() => {
    const sc = scrollerOf();
    if (!sc) return undefined;
    if (loaded && !restored.current) { restored.current = true; if (_landing.scroll > 0) sc.scrollTop = _landing.scroll; }
    const keep = () => { _landing.scroll = sc.scrollTop; };
    sc.addEventListener('scroll', keep, { passive: true });
    return () => sc.removeEventListener('scroll', keep);
  }, [loaded]);

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
      navChildren={LibraryNav({ onBack: handleNavBack, backLabel: backClears ? 'Answers' : carried !== null ? 'Search' : 'Home', showHome: true, onSettings, onHistory, onSearch, theme, onThemeChange,
        hide: asking ? ['settings', 'history', 'search', 'theme'] : undefined,
        leftExtras: asking ? field : <BarTitle /> })}>
      <div className={'ans-page ans-landing' + (isQuery || recentMode ? ' is-query' : '') + (asking ? ' is-asking' : '')} ref={pageRef}>
        <div className="ans-landing-a">
          {/* WA1 (a-land): the hero centred; About lives at the foot of Browse */}
          <div className="ans-hero-c">
            <p className="ans-label">Topics &amp; Doctrines</p>
            <h1 className="ans-display"><span className="ans-line">Answers Only</span> <span className="ans-line">God Can Give</span></h1>
            <p className="ans-lede">{(site && site.tagline) || ANSWERS_TAGLINE}</p>
          </div>
          <section className="ans-ask" aria-label="Start with a question" role="search">
            {asking ? null : field}
            {asking || recentMode ? null : (
              <>
                {/* ANS1: the questions finish this sentence; when the field cannot hold it, it stands above them */}
                {placeholder === ANSWERS_ASK_LEAD ? null : <p className="ans-ask-lead">{ANSWERS_ASK_LEAD}</p>}
                {/* 0125 A: three questions as plain links in one running line, then More questions (Surprise me is its sheet's first row) */}
                <p className="ans-qs">
                  {ANSWERS_QUESTIONS.slice(0, 6).filter(([qq]) => !/holidays/.test(qq)).slice(0, 3).map(([qq, id]) => (
                    <React.Fragment key={id}><button type="button" className="ans-q" onClick={() => chip(id)}>{qq}</button>{' '}</React.Fragment>
                  ))}
                  <button type="button" className="ans-q is-more" aria-haspopup="dialog" onClick={() => openSheet({ kind: 'more' })}>More questions</button>
                </p>
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
          ) : null}
        </div>
        <div className="ans-landing-b" ref={browseRef}>
          {/* 0125 A: Browse, and A-Z as a link at its right (A-Z is a mode of the landing; Back leaves it) */}
          <div className="ans-sechead ans-browse-head">
            <h2 className="ans-h2">{az ? 'All topics, A–Z' : 'Browse'}</h2>
            {loaded ? (az
              ? <button type="button" className="ans-head-link" onClick={leaveAZ}>By group</button>
              : <button type="button" className="ans-head-link" onClick={enterAZ}>A–Z</button>) : null}
          </div>
          {az ? <div id="ans-panel-az"><AZPanel entries={list} meta={meta} isRead={isRead} onOpenTopic={openTopic} /></div> : browse}
        </div>
      </div>
      {sheet && sheet.kind === 'more' && loaded ? <MoreQuestionsSheet byId={byId} meta={meta} onOpenTopic={openTopic} onSurprise={surprise} onClose={closeSheet} tall={ts2} /> : null}
      {cmdShelf ? <CommandmentSheet shelf={cmdShelf} meta={meta} isRead={isRead} onOpenTopic={openTopic} onGoToRef={onGoToRef} onStep={(n) => openSheet({ kind: 'cmd', n })} onClose={closeSheet} tall={ts2} /> : null}
      {sheet && sheet.kind === 'about' && site ? <AboutSheet site={site} onOpenTopic={openTopic} onClose={closeSheet} /> : null}
    </ScreenLayout>
  );
}

