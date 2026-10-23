/* AnswersScreens - Answers Only God Can Give in v2 (mw14, 2026-10-22: main's redesign by aogcg, final design f01-f13,
   main 9c7ca376f). Main's screens hosted whole, as the Scripture Web is (mw13): main draws the pages, v2 gives them its
   shell (the top bar's Back, the tabs, the player) and its kit (answers.css: main's Answers block with main's tokens named
   in the kit's terms). bundle-d puts main's components on window (ui/_entry-d.js); main's nav bar, which each of them
   draws inside its ScreenLayout, is hidden, so Back is v2's:
   - the home (f01-f06; place 'answers'): the head with About, Start with a question (the field, six questions, More
     questions), Continue, the Answer of the day (Share as a card), then Contents | A-Z. Main keeps its words, its tab and
     its open sheet in module memory, so Back from a topic returns to the same results or sheet; a new way in (a new route
     object: Home's tile, Search's Go to) starts it afresh (main's resetAnswersLanding). Words typed: Back says Answers and
     clears them first (main's __screenBack, handed to the shell's setBack). Nothing found offers the whole library: the
     Search tab with the words (openTab('search', { q }), zones' zs28 reads it);
   - a shelf (a numbered group, Other Topics; 'answers-shelf'), Charts & videos ('answers-media'), Saved answers
     ('answers-saved');
   - a topic (f07-f11) is v2's letter page with main's AnswersTopic as its body (AnswersTopicBody below): the hero, the
     Contents sheet and running head, the reading with its links and notes, Also see, the foot's Previous and Next in the
     site's order. v2's paragraph sheet, marks, read-along and Find work over its paragraphs (main's wtlb keys).
   A route that names the collection 'answers' (Home Recent's topic, Search's Go to) is turned into the home
   (CollectionScreen). A gate boot draws main's data and stores nothing. */
import { definePlace } from '../places.js';
import { useAnswersCorpusVersion, askAnswersCorpus } from '../corpus.js';
import { refParts, findChapterRoute } from '../footnotes.js';
import { findLetterRoute } from '../letter-links.js';
import { savedSettings } from '../settings-pages.js';
import { readKey } from '../reading-record.js';

const g = /** @type {any} */ (globalThis);

/** ANSWERS once its corpus has landed (the Main Page last), else null. */
export function answersEntries(gl = g) {
  const c = gl.__answersCorpus;
  return c && c.loaded && Array.isArray(gl.ANSWERS) ? gl.ANSWERS : null;
}

/**
 * The topics, asking for the Answers corpus when they are not here yet (a gate boot asks too: its pictures are main's
 * data). 'failed' when the loader says so, or there is no loader and no topics.
 * @returns {{ entries: any[] | null, status: 'loading' | 'ready' | 'failed', retry: () => void }}
 */
function useAnswers() {
  useAnswersCorpusVersion();
  const [asked, setAsked] = React.useState(false);
  const ask = React.useCallback(() => {
    askAnswersCorpus().catch(() => { /* the loader flags the error and bumps its version */ }).then(() => setAsked(true));
  }, []);
  React.useEffect(ask, [ask]);
  const entries = answersEntries();
  const c = g.__answersCorpus;
  const failed = !entries && ((c && c.error) || (asked && !(c && !c.loaded && typeof g.__loadAnswersCorpus === 'function')));
  return { entries, status: entries ? 'ready' : failed ? 'failed' : 'loading', retry: ask };
}

/** The page says so when the topics could not be loaded (offline before they were ever fetched); Try again asks again. */
function NotLoaded({ retry }) {
  return (
    <div className="empty">
      <div className="t">The topics could not be loaded.</div>
      <div className="s">They load the first time Answers opens. Check the connection and try again.</div>
      <button type="button" className="textbtn" onClick={retry}>Try again</button>
    </div>
  );
}

/** Whether the reader has read topic `id` (main's isRead('answers', id): vot-state readItems). */
export function answersRead(id, gl = g) {
  try {
    const s = gl.StateStore && typeof gl.StateStore.get === 'function' ? gl.StateStore.get() : null;
    return !!(s && s.readItems && Number(s.readItems[readKey('answers', id)]) > 0);
  } catch (_e) {
    return false;
  }
}

/**
 * The route that opens topic `id` on v2's letter page, or null when it is not in `entries`. A search hit lands on the
 * passage it matched (`excerpt`) with its words marked and Find holding them (`find`: main's { terms, label }); a link to a section
 * (`section`, the site's #fragment) brings that heading up.
 * @param {any[] | null} entries @param {string} id
 * @param {{ excerpt?: string | null, section?: string | null, find?: { terms?: string[], label?: string } | string | null }} [at]
 */
export function topicRoute(entries, id, at = {}) {
  const e = (entries || []).find((x) => x && x.id === id);
  if (!e || typeof e.num !== 'number') return null;
  /** @type {Record<string, any>} */
  const r = { place: 'letter', collection: 'answers', n: e.num };
  if (at.section) r.section = String(at.section);
  else if (at.excerpt) r.excerpt = at.excerpt;
  // main hands a hit's words as { terms, label } (the label as typed)
  const f = at.find;
  const terms = f && typeof f === 'object' ? [].concat(f.terms || []).filter(Boolean) : f ? String(f).trim().split(/\s+/) : [];
  if (terms.length) { r.match = terms; r.label = (f && typeof f === 'object' ? f.label : String(f).trim()) || terms.join(' '); }
  return r;
}

/** A reference main hands on (a commandment's "Exodus 20:13"): the chapter at the verse. @param {string} ref @param {(r: any) => void} go */
function goToRef(ref, go) {
  const parts = refParts(ref);
  if (!parts.length) return;
  findChapterRoute(parts[0].parsed).then((r) => { if (r) go(r); });
}

/**
 * The collection an attribution names ("Volume 2", "two", "The Lord's Rebuke"), by the label v2's letter links read
 * (main's WtlbEntryView _attrCollectionLabel, which answers with the registry's label).
 * @param {string} s @returns {string | null}
 */
export function attributionCollection(s, gl = g) {
  const t = String(s || '').trim().toLowerCase();
  if (!t) return null;
  const words = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];
  const vm = /^(?:volume\s+)?(\d|[a-z]+)$/.exec(t);
  if (vm) {
    const w = /^\d$/.test(vm[1]) ? words[Number(vm[1]) - 1] : vm[1];
    if (w && words.includes(w)) return 'Volume ' + w.charAt(0).toUpperCase() + w.slice(1);
  }
  const cols = Array.isArray(gl.COLLECTIONS) ? gl.COLLECTIONS : [];
  const col = cols.find((c) => c && ((c.registryLabel || '').toLowerCase() === t || (c.label || '').toLowerCase() === t));
  return col ? col.label : String(s).trim();
}

/** A letter an Answers page names ({ collection, letterTitle, excerpt? }), opened on the passage when it says one. */
function openLetter(target, go) {
  if (!target) return;
  const collection = attributionCollection(target.collection);
  findLetterRoute({ collection: collection || target.collection, letterTitle: target.letterTitle }).then((r) => {
    if (r) go(target.excerpt ? { ...r, excerpt: target.excerpt } : r);
  });
}

/**
 * main's __screenBack (a page's own first step back: the home's words cleared) as the shell's setBack while `on`: main
 * sets and clears window.__screenBack itself, so the property is watched.
 * @param {boolean} on @param {((step: { label: string, run: () => void } | null) => void) | undefined} setBack @param {string} label
 */
function useScreenBack(on, setBack, label) {
  React.useEffect(() => {
    if (!on || !setBack) return undefined;
    let cur = null;
    Object.defineProperty(g, '__screenBack', {
      configurable: true,
      get: () => cur,
      set: (fn) => { cur = fn || null; setBack(cur ? { label, run: () => { if (cur) cur(); } } : null); },
    });
    return () => { delete g.__screenBack; g.__screenBack = null; setBack(null); };
  }, [on, setBack, label]);
}

/** The props main's browse screens share (main's _answersNavProps + _answersBrowseProps). */
function browseProps({ gate, go, pop, openTab, entries }) {
  const settings = gate ? {} : savedSettings();
  const pathOn = settings.answersReadingPath !== false;
  return {
    isRead: gate ? () => false : (id) => answersRead(id), pathOn, fontScale: settings.fontScale || 1,
    onBack: pop, onSearch: () => openTab('search'), onHistory: () => {}, onSettings: () => openTab('settings'),
    theme: undefined, onThemeChange: () => {},
    onOpenTopic: (id, anchorText, _from, section, find) => {
      const r = topicRoute(entries, id, { excerpt: anchorText, section, find });
      if (r && !gate) go(r);
    },
  };
}

/** The routes whose home has been started afresh (a route object is one way in; Back remounts the same one). */
const fresh = new WeakSet();

/** @param {import('../places.js').PlaceProps} props */
export function AnswersHomePlace({ route, gate, go, pop, openTab, onReady, setBack }) {
  React.useState(() => {
    if (!fresh.has(route)) { fresh.add(route); if (typeof g.resetAnswersLanding === 'function') g.resetAnswersLanding(); }
    return null;
  });
  const { entries, status, retry } = useAnswers();
  React.useEffect(() => { if (status !== 'loading') onReady(); }, [status, onReady]);
  useScreenBack(!gate, setBack, 'Answers');
  const Main = g.AnswersHome;
  if (status === 'failed') return <NotLoaded retry={retry} />;
  if (typeof Main !== 'function') return null;
  const base = browseProps({ gate, go, pop, openTab, entries });
  const settings = gate ? {} : savedSettings();
  const pathOn = settings.answersReadingPath !== false;
  return (
    <div className="ans-host">
      <Main {...base} entries={entries} site={entries && typeof g.ANSWERS_SITE_META !== 'undefined' ? g.ANSWERS_SITE_META : null}
        pathLast={pathOn && !gate && typeof g.readAnswersPath === 'function' ? g.readAnswersPath() : null}
        onOpenGroup={(key) => go({ place: 'answers-shelf', key: String(key) })}
        onOpenMedia={() => go({ place: 'answers-media' })}
        onOpenSaved={() => go({ place: 'answers-saved' })}
        onSearchLibrary={(q) => openTab('search', { q })}
        onOpenLetter={(target) => { if (!gate) openLetter(target, go); }}
        onGoToRef={(ref) => { if (!gate) goToRef(ref, go); }} />
    </div>
  );
}

/** One of main's browse screens past the home (a shelf, Charts & videos, Saved answers). */
function browsePlace(name, extra) {
  /** @param {import('../places.js').PlaceProps} props */
  return function AnswersBrowsePlace({ route, gate, go, pop, openTab, onReady }) {
    const { entries, status, retry } = useAnswers();
    React.useEffect(() => { if (status !== 'loading') onReady(); }, [status, onReady]);
    const Main = g[name];
    if (status === 'failed') return <NotLoaded retry={retry} />;
    if (!entries || typeof Main !== 'function') return null;
    return (
      <div className="ans-host">
        <Main {...browseProps({ gate, go, pop, openTab, entries })} entries={entries}
          site={typeof g.ANSWERS_SITE_META !== 'undefined' ? g.ANSWERS_SITE_META : null} {...(extra ? extra(route) : {})} />
      </div>
    );
  };
}

/** A shelf's name for Back (main's: a numbered group's short name, else Other Topics). @param {any} r */
export function shelfTitle(r) {
  const found = typeof g.answersShelfByKey === 'function' ? g.answersShelfByKey(answersEntries(), String(r && r.key)) : null;
  const shelf = found ? found.shelf : null;
  return shelf ? (shelf.kind === 'tstl' ? shelf.short : 'Other Topics') : 'Answers';
}

/**
 * A topic's page: main's AnswersTopic inside v2's letter body (`bodyRef`), with main's hand-offs as v2's routes. `onDrawn`
 * says the paragraphs are on the page (main waits up to 300 ms for the sidecars, then draws plain), so a search landing
 * finds them. `onRef` opens v2's reference sheet for a cite.
 * @param {{ letter: any, bodyRef: any, route: any, gate: any, go: (r: any) => void, replace: (r: any) => void,
 *   openTab: (id: string, extra?: any) => void, onRef: (ref: string) => void, onDrawn: () => void }} props
 */
export function AnswersTopicBody({ letter, bodyRef, route, gate, go, replace, openTab, onRef, onDrawn }) {
  const Main = g.AnswersTopic;
  const useMeta = typeof g.useAnswersMetaState === 'function' ? g.useAnswersMetaState : () => [null, false];
  const [metaAll, metaFailed] = useMeta(true);
  const [waited, setWaited] = React.useState(false);
  React.useEffect(() => {
    setWaited(false);
    if (metaAll) return undefined;
    const t = setTimeout(() => setWaited(true), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per topic; the sidecar's arrival ends the wait
  }, [letter.id]);
  const ready = !!metaAll || waited;
  // the keyed paragraphs mount late (and again decorated): main's mark pass runs over them again
  React.useEffect(() => {
    if (!ready) return;
    onDrawn();
    if (!gate && typeof g.answersHlDomChanged === 'function') g.answersHlDomChanged();
  }, [ready, !!metaAll, letter.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The running head (shown on scroll up once the hero has gone) is main's: it reads the page's scroller as
  // .screen-scroll and draws into .screen-layout, so v2's scroller and its box wear those names while a topic is open.
  React.useEffect(() => {
    const sc = bodyRef.current && bodyRef.current.closest('.content');
    const box = sc && sc.parentElement;
    if (!sc || !box) return undefined;
    sc.classList.add('screen-scroll');
    box.classList.add('screen-layout', 'ans-layout');
    box.style.setProperty('--dock-nav-bottom', Math.max(0, sc.offsetTop - 4) + 'px');
    return () => { sc.classList.remove('screen-scroll'); box.classList.remove('screen-layout', 'ans-layout'); box.style.removeProperty('--dock-nav-bottom'); };
  }, [bodyRef, letter.id]);

  const [landed, setLanded] = React.useState(-1);
  const timer = React.useRef(/** @type {any} */ (0));
  React.useEffect(() => () => clearTimeout(timer.current), []);
  React.useEffect(() => setLanded(-1), [letter.id]);
  const key = (i) => (typeof g.wtlbHlKey === 'function' ? g.wtlbHlKey(letter.id, i) : 'wtlb:' + letter.id + ':' + i);
  /** main's jumpToPara: the paragraph (or the made-up heading just before it) to the top, under the running head. */
  const jump = React.useCallback((/** @type {number} */ index, /** @type {{ pulse?: boolean, el?: HTMLElement | null }} */ o = {}) => {
    const root = bodyRef.current;
    let el = o.el || (root && /** @type {HTMLElement | null} */ (root.querySelector('[data-hl-key="' + key(index) + '"]')));
    if (!el) return;
    const prev = /** @type {HTMLElement | null} */ (el.previousElementSibling);
    if (!o.el && prev && prev.matches('h2.ans-sh:not([data-hl-key])')) el = prev;
    const cover = typeof g.answersHeadCover === 'function' ? g.answersHeadCover() : 0;
    el.style.scrollMarginTop = (cover + 8) + 'px';
    el.scrollIntoView({ block: 'start' });
    if (o.pulse === false) return;
    setLanded(index);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setLanded(-1), 4000);
  }, [bodyRef, letter.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // A link to a section (the site's #fragment) brings its heading up once the topic is drawn, the first time only
  const sectionDone = React.useRef(/** @type {any} */ (null));
  React.useEffect(() => {
    if (!ready || !route || !route.section || sectionDone.current === route || typeof g.answersAnchorPara !== 'function') return undefined;
    sectionDone.current = route;
    const meta = typeof g.answersMetaFor === 'function' ? g.answersMetaFor(letter.id) : null;
    const at = g.answersAnchorPara(letter, route.section, meta);
    if (at < 0) return undefined;
    const t = setTimeout(() => jump(at), 150);
    return () => clearTimeout(t);
  }, [ready, route, letter, jump]);

  const entries = answersEntries();
  const settings = gate ? {} : savedSettings();
  const pathOn = settings.answersReadingPath !== false;
  const layout = typeof g.answersLayoutClass === 'function' ? g.answersLayoutClass(settings.fontScale || 1, false) : '';
  const live = !gate;
  const to = (r) => { if (r && live) go(r); };
  const nav = {
    entries,
    isRead: live ? answersRead : () => false,
    pathOn,
    openTopic: (id, anchor) => to(topicRoute(entries, id, { section: anchor })),
    // Previous and Next in the site's order read on, as the letter's next card does (no new Back step)
    go: (id) => { const r = topicRoute(entries, id); if (r && live) replace(r); },
    openGroup: (key) => to({ place: 'answers-shelf', key: String(key) }),
    openLanding: () => to({ place: 'answers' }),
    openStudy: (slug, url) => {
      if (!live) return;
      if (typeof g.getStudyById === 'function' && g.getStudyById(slug)) go({ place: 'study', study: slug });
      else if (url) window.open(url, '_blank', 'noopener');
    },
    searchLibrary: (q) => { if (live) openTab('search', { q }); },
    goToRef: (ref) => { if (live) goToRef(ref, go); },
  };
  const act = {
    cite: (ref) => { if (live) onRef(ref); },
    jump,
    letter: (target) => { if (live) openLetter(target, go); },
    // a source chip opens its letter ON the passage it closes
    source: (pi) => {
      if (!live) return;
      const p = letter.paragraphs[pi];
      const parts = /^~ \[From ["“”](.+?)["“”]\s*~\s*(.+?)\]$/.exec(String((p && p.text) || '').trim());
      if (!parts) return;
      const excerpt = typeof g.passageTextBefore === 'function' ? g.passageTextBefore(letter.paragraphs, pi) : '';
      openLetter(excerpt ? { collection: parts[2], letterTitle: parts[1], excerpt } : { collection: parts[2], letterTitle: parts[1] }, go);
    },
  };
  if (typeof Main !== 'function') return null;
  return (
    <div className={'ans-topic-host ' + layout}>
      <Main entry={letter} entries={entries} meta={metaAll ? metaAll[letter.id] || null : null} metaAll={metaAll}
        metaFailed={metaFailed} site={typeof g.ANSWERS_SITE_META !== 'undefined' ? g.ANSWERS_SITE_META : null} ready={ready}
        inert={false} ts2={layout.includes('ans-ts2')} landedPara={landed} mainRef={bodyRef} isRead={nav.isRead}
        pathOn={pathOn} findOn={!!(route && route.match && route.match.length)} nav={nav} act={act} />
    </div>
  );
}

definePlace('answers', { Screen: AnswersHomePlace, contentClass: 'content ans', title: () => 'Answers' });
definePlace('answers-shelf', {
  Screen: browsePlace('AnswersShelf', (r) => ({ groupKey: String(r.key) })), contentClass: 'content ans', title: shelfTitle,
});
definePlace('answers-media', { Screen: browsePlace('AnswersMedia'), contentClass: 'content ans', title: () => 'Charts & videos' });
definePlace('answers-saved', { Screen: browsePlace('AnswersSaved'), contentClass: 'content ans', title: () => 'Saved answers' });
