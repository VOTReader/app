/** @jsx h */
/** @jsxFrag Fragment */
/* ═══════════════════════════════════════════════════════════════════════
   AnswersHome — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The Answers Only God Can Give landing (route answers-home; AOGCG final
   design f01, f02, f05, f06), top to bottom:

     the head (Topics & Doctrines, the (i) About), the title and the site's
     tagline; "Start with a question" with the search field, six question
     chips and "More questions"; the reading path (Continue in the site's
     order, kept on this device); the Answer of the day; then Contents | A–Z.

   Contents is the site's own sidebar in its order: the Main Page, the Ten
   Commandments, Other Topics (its page outside the menu last), the twelve
   numbered "Thus Says The Lord..." groups with our short names, the False
   Doctrines index, then Charts & videos and the credit. A query of two or
   more characters replaces everything under the field with the results,
   grouped by topic: title matches first, then the site's order (U2: no
   list anywhere is sorted by how much a topic says).

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
  answersPlaceOf, answersAZGroups, answersSourceParts, answersInlinePieces, answersDailyPool, answersDailyPick,
  answersOpenablePool, answersPathState, answersMediaIndex, answersMediaSummary, answersTopSections,
  answersSearchSum, answersSearchSub, answersHitSource, answersClosest, answersDomain, ANSWERS_TSTL_HEAD,
} from '../../utils/answers-browse.js';
import { answersIndexOf, answersSearch, answersTitleMatches, answersSnippet, answersPlainText, answersPlainLines } from '../../utils/answers-search.js';
import { passageTextBefore } from '../../utils/answers-contents.js';
import { scrollBehavior } from '../../utils/reduced-motion.js';
import { AnsIcon, AnsRow, Chev, LeadTitle, ReadMark, useAnswersMeta, useAnswersSaved, answersLayoutClass } from '../components/AnswersParts.jsx';
import { MoreQuestionsSheet, CommandmentSheet, AboutSheet } from '../sheets/AnswersSheets.jsx';
import { AnswersCardSheet } from '../sheets/AnswersCardSheet.jsx';
import { answersSavedSum, answersCardFor, answersShownText } from '../../utils/answers-extras.js';

/** @typedef {{ kind: 'cmd', n: number } | { kind: 'more' } | { kind: 'about' } | { kind: 'card', card: any } | null} AnswersSheetState */

let _landing = { query: '', tab: 'contents', sheet: /** @type {AnswersSheetState} */ (null), dailyOpen: false, all: false };
export function resetAnswersLanding() { _landing = { query: '', tab: 'contents', sheet: null, dailyOpen: false, all: false }; }

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

/* The day's pool costs tens of ms on a phone; the corpus and its sidecars are fixed arrays once
   loaded, so it is built once per array, not on every landing mount (the search index likewise:
   answersIndexOf). */
let _pool = { of: /** @type {any} */ (null), meta: /** @type {any} */ (null), v: /** @type {any} */ (null) };
/** @param {any[]} entries @param {Record<string, any>} meta */
export function dailyPoolOf(entries, meta) {
  if (_pool.of !== entries || _pool.meta !== meta) _pool = { of: entries, meta, v: answersDailyPool(entries, meta) };
  return _pool.v;
}

/** "Volume 7" → "Volume Seven", the registry's label a letter tap resolves by (as the topic page's source lines). */
function collectionLabel(vol) {
  const s = String(vol || '').trim().toLowerCase();
  const NUMS = { 1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven' };
  const m = s.startsWith('volume ') ? s.slice(7).trim() : s;
  const n = /** @type {Record<string, string>} */ (NUMS)[m];
  if (n) return 'Volume ' + n;
  const word = Object.values(NUMS).find((w) => w.toLowerCase() === m);
  if (word) return 'Volume ' + word;
  if (typeof COLLECTIONS !== 'undefined') {
    const col = COLLECTIONS.find((c) => c.registryLabel && (c.registryLabel.toLowerCase() === s || (c.label || '').toLowerCase() === s));
    if (col) return col.registryLabel;
  }
  return null;
}

/** A Format B paragraph as the reading page draws its marks: bold, italic, line breaks, "(ref)". */
function Inline({ text }) {
  return (
    <>
      {answersInlinePieces(text).map((p, i) => {
        if (p.br) return <br key={i} />;
        const t = p.i ? <em>{p.t}</em> : p.t;
        return p.b ? <strong key={i}>{t}</strong> : <React.Fragment key={i}>{t}</React.Fragment>;
      })}
    </>
  );
}

/** "What does The Lord say about…", or "Search Answers…" when the long words would not fit the field (U9). */
function usePlaceholder(inputRef) {
  const LONG = 'What does The Lord say about…';
  const [ph, setPh] = React.useState(LONG);
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
      if (room > 0) setPh(ctx.measureText(LONG).width <= room ? LONG : 'Search Answers…');
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
 * The Answer of the day (f01 #9-13): one whole excerpt by the local date, the same for everyone on
 * that date: its dated header, every quote paragraph, its source; Read in context, Open to an answer.
 */
function DailyAnswer({ entries, byId, meta, now, onOpenTopic, onOpenLetter, onShare }) {
  const pool = React.useMemo(() => dailyPoolOf(entries, meta), [entries, meta]);
  const [open, setOpen] = React.useState(_landing.dailyOpen);
  React.useEffect(() => { _landing.dailyOpen = open; }, [open]);
  const pick = answersDailyPick(pool, now || new Date());
  const e = pick ? byId.get(pick.id) : null;
  if (!pick || !e) return null;
  const P = e.paragraphs;
  const src = answersSourceParts(P[pick.attr].text);
  const wording = ((((meta && meta[pick.id]) || {}).attr || {})[pick.attr] || {}).wording || 'From';
  const openSource = (ev) => {
    ev.preventDefault();
    const collection = src ? collectionLabel(src.collection) : null;
    if (!src || !collection || !onOpenLetter) return;
    const title = src.title.replace(/^[“"]/, '').replace(/[”"]$/, '');
    const excerpt = passageTextBefore(P, pick.attr);
    onOpenLetter(excerpt ? { collection, letterTitle: title, excerpt } : { collection, letterTitle: title });
  };
  // O6: today's excerpt as a card, its words as the page shows them, its source and date its own.
  const share = () => {
    const item = answersIndexOf(entries).find((t) => t.entry === e);
    const words = pick.quote.map((i) => answersShownText(P[i].text)).join('\n');
    onShare(answersCardFor(e, item, pick.quote[0], words, ((meta && meta[pick.id]) || {}).sections));
  };
  const randomAnswer = () => {
    const all = answersOpenablePool(entries, meta);
    if (!all.length) return;
    const at = all[Math.floor(Math.random() * all.length)];
    const t = byId.get(at.id);
    if (t) onOpenTopic(at.id, t.paragraphs[at.index].text, 'Answers');
  };
  return (
    <section className={'ans-daily' + (open ? ' is-open' : '')} aria-labelledby="ans-daily-h">
      <div className="ans-daily-head">
        <h2 className="ans-h2" id="ans-daily-h">Answer of the day</h2>
        {onShare ? <button type="button" className="ans-iconbtn" aria-label="Share as a card" aria-haspopup="dialog" onClick={share}><AnsIcon name="share" /></button> : null}
      </div>
      {pick.head >= 0 ? <p className="ans-metarow"><Inline text={P[pick.head].text} /></p> : null}
      <blockquote className="ans-quote">
        {pick.quote.map((i, k) => (k ? <React.Fragment key={i}><br /><Inline text={P[i].text} /></React.Fragment> : <Inline key={i} text={P[i].text} />))}
      </blockquote>
      {src ? (
        <p className="ans-src">
          <a href="#" onClick={openSource} aria-label={`${wording} ${src.title}, ${src.collection}. Opens the letter.`}>
            <span className="ans-src-t" data-w={wording}>{src.title}</span><span className="ans-src-c">{src.collection}</span><Chev />
          </a>
        </p>
      ) : null}
      <button type="button" className="ans-textbtn ans-daily-more" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide today’s answer' : 'Show today’s answer'}<Chev dir="down" />
      </button>
      <div className="ans-actions">
        <button type="button" className="ans-textbtn" onClick={() => onOpenTopic(pick.id, P[pick.quote[0]].text, 'Answers')}>Read in context<Chev /></button>
        <button type="button" className="ans-textbtn" onClick={randomAnswer}><AnsIcon name="shuffle" />Open to an answer</button>
      </div>
    </section>
  );
}

/** f05: every topic by title, under the sticky letter strip; the current letter follows the page. */
function AZPanel({ entries, meta, isRead, onOpenTopic }) {
  const groups = React.useMemo(() => answersAZGroups(entries), [entries]);
  const present = new Set(groups.map((g) => g.letter));
  const total = groups.reduce((a, g) => a + g.entries.length, 0);
  const [cur, setCur] = React.useState(groups.length ? groups[0].letter : '#');
  const [atEnd, setAtEnd] = React.useState(false);
  const rootRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const stripRef = React.useRef(/** @type {HTMLElement | null} */ (null));
  // A tapped key holds while the page travels to it and wherever that ends, until the reader moves the
  // page: a last letter too short to reach the strip (W) would otherwise read as the one above it (V).
  const pin = React.useRef(/** @type {string | null} */ (null));
  // The current letter only READS the page's scroll (no scrollTop is written here): the last
  // letter head at or above the strip's foot.
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
      for (const s of root.querySelectorAll('section[data-az]')) {
        if (s.getBoundingClientRect().top <= line) now = s.getAttribute('data-az');
        else break;
      }
      if (pin.current) now = pin.current;
      if (now) setCur(now);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read); };
    // The reader's own hand on the page (a finger, the wheel, a key, the scrollbar) lets the page lead again.
    const unpin = () => { pin.current = null; };
    const MOVES = ['touchstart', 'wheel', 'pointerdown', 'keydown'];
    scroller.addEventListener('scroll', onScroll, { passive: true });
    for (const t of MOVES) scroller.addEventListener(t, unpin, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      for (const t of MOVES) scroller.removeEventListener(t, unpin);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  // The strip keeps the current key in view by scrolling ITSELF sideways (its own scrollLeft).
  React.useEffect(() => {
    const strip = stripRef.current;
    const key = strip ? strip.querySelector('[aria-current="true"]') : null;
    if (!strip || !key) return;
    const k = /** @type {HTMLElement} */ (key);
    if (k.offsetLeft < strip.scrollLeft || k.offsetLeft + k.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollLeft = Math.max(0, k.offsetLeft - strip.clientWidth / 2 + k.offsetWidth / 2);
    }
  }, [cur]);
  const onStripScroll = () => {
    const s = stripRef.current;
    if (s) setAtEnd(s.scrollLeft + s.clientWidth >= s.scrollWidth - 2);
  };
  // A key jumps the way a finger would (scrollIntoView, the reader's own sanctioned move).
  const jump = (L) => {
    const el = rootRef.current && rootRef.current.querySelector(`section[data-az="${L}"]`);
    if (!el) return;
    pin.current = L;
    el.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
    setCur(L);
  };
  return (
    <div ref={rootRef}>
      <nav className={'ans-az-strip' + (atEnd ? ' is-end' : '')} aria-label="Jump to letter" ref={stripRef} onScroll={onStripScroll}>
        {ANSWERS_AZ_KEYS.map((L) => (
          <button key={L} type="button" className="ans-az-key" disabled={!present.has(L)} aria-current={cur === L ? 'true' : undefined}
            aria-label={L === '#' ? 'Numbers' : undefined} onClick={() => jump(L)}>{L}</button>
        ))}
      </nav>
      <p className="ans-note">{`All ${total} topics by title, filed under their first main word: “Regarding The Holy Days of God” is under H.`}</p>
      {groups.map((g) => (
        <section key={g.letter} data-az={g.letter} aria-labelledby={'ans-az-' + (g.letter === '#' ? 'num' : g.letter)}>
          <div className="ans-az-head">
            <h2 className="ans-az-letter" id={'ans-az-' + (g.letter === '#' ? 'num' : g.letter)}>{g.letter}</h2>
            <span className="ans-count">{pl(g.entries.length, 'topic')}</span>
          </div>
          {g.entries.map((e) => (
            <AnsRow key={e.id} title={<LeadTitle title={e.title} />}
              sub={<>{answersPlaceOf(entries, e.id) + SEP + answersSizeWords(e, meta && meta[e.id], { minutes: false })}{isRead(e.id) ? <>{SEP}<ReadMark /></> : null}</>}
              onClick={() => onOpenTopic(e.id, null, 'Answers')} />
          ))}
        </section>
      ))}
    </div>
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
  return (
    <div className="ans-results">
      <div className="ans-results-sum">
        <p className="ans-meta" aria-live="polite">{loading ? 'Searching…' : answersSearchSum(results)}</p>
        {onSearchLibrary ? <button type="button" className="ans-textbtn" onClick={() => { rememberQuery(q); onSearchLibrary(q); }}>Search all of VOTReader<Chev /></button> : null}
      </div>
      {shown.map((g) => {
        const t = paraText(g);
        const plain = t == null ? '' : (g.prose ? answersPlainLines(t) : answersPlainText(t));
        const segs = !loading && t != null ? answersSnippet(plain, words) : null;
        const src = !loading ? answersHitSource(g.entry, g.first, answersPlainText) : '';
        return (
          <React.Fragment key={g.entry.id}>
            <AnsRow title={<LeadTitle title={g.entry.title} />} sub={answersSearchSub(entries, g)} onClick={() => open(g)} />
            {segs ? (
              <button type="button" className="ans-hit" onClick={() => open(g)}>
                <span className="ans-hit-snip">{segs.map((s, i) => (s.hit ? <mark key={i}>{s.text}</mark> : <React.Fragment key={i}>{s.text}</React.Fragment>))}</span>
                {src ? <span className="ans-hit-src">{src}</span> : null}
              </button>
            ) : null}
          </React.Fragment>
        );
      })}
      {more > 0 ? (
        <button type="button" className="ans-textbtn" aria-expanded="false" onClick={() => setAll(true)}>
          {'Show ' + pl(more, 'more topic')}<Chev dir="down" />
        </button>
      ) : null}
    </div>
  );
}

/** Contents (f01, f02): the site's sidebar in its order. A memo, so typing in the field above never re-renders it. */
const Contents = React.memo(/** @param {any} props */ function Contents(props) {
  const { loaded, byId, shelves, meta, isRead, media, saved, site, onOpenTopic, onOpenGroup, onOpenMedia, onOpenSaved, setSheet } = props;
  const openTopic = (id) => onOpenTopic(id, null, 'Answers');
  const openSheet = (s) => { if (loaded) setSheet(s); };
  const sub = (e) => (
    <>{answersRowSub(e, meta && meta[e.id])}{isRead(e.id) ? <>{SEP}<ReadMark /></> : null}</>
  );
  const main = byId.get(ANSWERS_MAIN_PAGE_ID) || null;
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

  return (
    <div role="tabpanel" id="ans-panel-c" aria-labelledby="ans-tab-c">
      <AnsRow title="Main Page" sub={main ? sub(main) : null} onClick={() => openTopic(ANSWERS_MAIN_PAGE_ID)} />
      <div className="ans-sechead"><h2 className="ans-h2">The Ten Commandments</h2>{loaded ? <span className="ans-count">{pl(cmdTotal, 'topic') + ' across all ten'}</span> : null}</div>
      <div className="ans-tablets">{tablets}</div>
      {loaded ? (
        <>
          <div className="ans-sechead"><h2 className="ans-h2">Other Topics</h2><span className="ans-count">{pl(shelves.otherTopics.length, 'topic')}</span></div>
          {shelves.otherTopics.map((e) => (
            <AnsRow key={e.id} title={<LeadTitle title={e.title} />}
              sub={shelves.other && shelves.other.notInMenu.includes(e) ? <>{answersRowSub(e, meta && meta[e.id])}{SEP}<em>{ANSWERS_NOT_IN_MENU}</em>{isRead(e.id) ? <>{SEP}<ReadMark /></> : null}</> : sub(e)}
              onClick={() => openTopic(e.id)} />
          ))}
          <div className="ans-sechead"><h2 className="ans-h2">{tstlHead}</h2><span className="ans-count">{pl(groupTotal, 'topic')}</span></div>
          <p className="ans-note">{ANSWERS_GROUP_NOTE}</p>
          {shelves.groups.map((g) => {
            const r = g.topics.filter((e) => isRead(e.id)).length;
            return (
              <AnsRow key={g.n} num={g.num} title={g.short}
                sub={pl(g.topics.length, 'topic') + (r ? SEP + r + NBSP + 'read' : '')}
                label={`${g.label} ${g.short}. ${pl(g.topics.length, 'topic').replace(NBSP, ' ')}${r ? `, ${r} read` : ''}`}
                onClick={() => onOpenGroup && onOpenGroup(String(g.num))} />
            );
          })}
          {shelves.index ? <div className="ans-sechead"><h2 className="ans-h2">{shelves.index.label}</h2></div> : null}
          {fdEntry ? (
            <AnsRow title={ANSWERS_FD_INDEX_TEXT} sub={fdMeta ? pl(answersTopSections(fdMeta).length, 'category') + ', each answered by The Truth' : null}
              onClick={() => openTopic(ANSWERS_FD_INDEX_ID)} />
          ) : null}
          <div className="ans-tools">
            <AnsRow icon="chart" title="Charts & videos" sub={answersMediaSummary(media)} onClick={() => onOpenMedia && onOpenMedia()} />
            {saved && onOpenSaved ? <AnsRow icon="bookmark" title="Saved answers" sub={saved} onClick={() => onOpenSaved()} /> : null}
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
 *   fontScale?: any, now?: Date, onBack: () => void, onSearch?: any, onHistory?: any, onSettings?: any, theme?: any,
 *   onThemeChange?: any, onOpenTopic: Function, onOpenGroup?: (key: string) => void, onOpenMedia?: () => void,
 *   onOpenSaved?: () => void, onSearchLibrary?: (q: string) => void, onGoToRef?: (ref: string) => void, onOpenLetter?: (target: any) => void }} props
 */
export function AnswersHome({ entries, site, isRead: isReadRaw, pathOn = true, pathLast = null, fontScale, now, onBack, onSearch, onHistory, onSettings, theme, onThemeChange,
  onOpenTopic, onOpenGroup, onOpenMedia, onOpenSaved, onSearchLibrary, onGoToRef, onOpenLetter }) {
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
  const results = React.useMemo(() => (loaded && deferred.trim().length >= 2 ? answersSearch(index, deferred, opts) : null), [loaded, index, deferred, opts]);
  const pending = isQuery && deferred.trim() !== q;
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

  // The reading path (f01 #8): Continue in the site's order; off in Settings, always the start.
  let path = null;
  if (loaded && main) {
    const st = pathOn ? answersPathState(list, isRead, pathLast) : { kind: 'start', entry: main, n: 0 };
    const topics = order.length - 1;
    if (st.kind === 'continue') {
      path = { title: <>Continue: <LeadTitle title={st.entry.title} /></>, sub: st.n + NBSP + 'of ' + topics + NBSP + 'topics' + SEP + 'in the site’s order', id: st.entry.id };
    } else if (st.kind === 'again') {
      path = { title: 'Start again at the beginning', sub: 'Main Page' + SEP + 'in the site’s order', id: main.id };
    } else {
      path = { title: 'Start at the beginning', sub: ['Main Page', answersSizeWords(main, meta && meta[main.id])].filter(Boolean).join(SEP), id: main.id };
    }
  }

  const openSheet = (s) => { if (loaded) setSheet(s); };
  const cmdShelf = sheet && sheet.kind === 'cmd' ? shelves.commandments.find((s) => s.num === sheet.n) : null;
  const contents = <Contents loaded={loaded} byId={byId} shelves={shelves} meta={meta} isRead={isRead} media={media} saved={savedSum} site={site}
    onOpenTopic={onOpenTopic} onOpenGroup={onOpenGroup} onOpenMedia={onOpenMedia} onOpenSaved={onOpenSaved} setSheet={setSheet} />;

  // A saved A–Z tab waits for the corpus: until then Contents shows, so it is the selected tab.
  const az = tab === 'az' && loaded;
  const onTabKey = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); setTab(az ? 'contents' : 'az'); }
  };

  return (
    <ScreenLayout className={answersLayoutClass(fontScale, true)}
      navChildren={LibraryNav({ onBack: handleNavBack, backLabel: query ? 'Answers' : 'Home', showHome: true, onSettings, onHistory, onSearch, theme, onThemeChange })}>
      <div className={'ans-page ans-landing' + (isQuery || recentMode ? ' is-query' : '')}>
        <div className="ans-landing-a">
          <div className="ans-head">
            <p className="ans-label">Topics &amp; Doctrines</p>
            <button type="button" className="ans-iconbtn" aria-label="About this collection" aria-haspopup="dialog" onClick={() => openSheet({ kind: 'about' })}><AnsIcon name="info" /></button>
          </div>
          <h1 className="ans-display"><span className="ans-line">Answers Only</span> <span className="ans-line">God Can Give</span></h1>
          <p className="ans-lede">{(site && site.tagline) || ANSWERS_TAGLINE}</p>
          <section className="ans-ask" aria-labelledby="ans-ask-h" role="search">
            <div className="ans-ask-head">
              <h2 className="ans-label" id="ans-ask-h">Start with a question</h2>
              <button type="button" className="ans-textbtn" aria-haspopup="dialog" onClick={() => openSheet({ kind: 'more' })}>More questions<Chev /></button>
            </div>
            <div className="ans-search">
              <input ref={inputRef} className="ans-search-input" type="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false}
                value={query} placeholder={placeholder} aria-label="Search Answers"
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => { setRecent(readRecent()); setFocused(true); }}
                onBlur={() => setFocused(false)}
                onKeyDown={(e) => { if (e.key === 'Enter') rememberQuery(query); }} />
              {query ? (
                <button type="button" className="ans-search-btn" aria-label="Clear search" onClick={() => { setQuery(''); if (inputRef.current) inputRef.current.focus(); }}><AnsIcon name="close" /></button>
              ) : (
                <button type="button" className="ans-search-btn" aria-label="Search" onClick={() => { if (inputRef.current) inputRef.current.focus(); }}><AnsIcon name="search" /></button>
              )}
            </div>
            {isQuery || recentMode ? null : (
              <div className="ans-chips">
                {ANSWERS_QUESTIONS.slice(0, 6).map(([qq, id]) => <button key={id} type="button" className="ans-chip" onClick={() => chip(id)}>{qq}</button>)}
              </div>
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
                <div className="ans-path"><AnsRow title={path.title} sub={path.sub} onClick={() => openTopic(path.id)} /></div>
              ) : null}
              {loaded && meta ? <DailyAnswer entries={list} byId={byId} meta={meta} now={now} onOpenTopic={openTopic} onOpenLetter={onOpenLetter} onShare={(card) => setSheet({ kind: 'card', card })} /> : null}
            </>
          )}
        </div>
        <div className="ans-landing-b">
          <div className="ans-tabs" role="tablist" aria-label="Browse Answers">
            <button type="button" className="ans-tab" role="tab" id="ans-tab-c" aria-controls="ans-panel-c" aria-selected={!az}
              tabIndex={az ? -1 : 0} onClick={() => setTab('contents')} onKeyDown={onTabKey}>Contents</button>
            <button type="button" className="ans-tab" role="tab" id="ans-tab-az" aria-controls="ans-panel-az" aria-selected={az}
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
      {cmdShelf ? <CommandmentSheet shelf={cmdShelf} meta={meta} isRead={isRead} onOpenTopic={openTopic} onGoToRef={onGoToRef} onClose={closeSheet} tall={ts2} /> : null}
      {sheet && sheet.kind === 'about' && site ? <AboutSheet site={site} onOpenTopic={openTopic} onClose={closeSheet} /> : null}
      {sheet && sheet.kind === 'card' && loaded ? <AnswersCardSheet card={sheet.card} onClose={closeSheet} /> : null}
    </ScreenLayout>
  );
}

