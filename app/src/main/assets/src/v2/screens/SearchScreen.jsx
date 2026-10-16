/* SearchScreen - the Search tab (zv1: pictures 3a-search, 3b-search-results, 5c; zs26 = design dz19: 3b redrawn, 3e Book
   order, 3f the notes line, 3g Recent, 3h one volume).

   One box for the letters, the Bible, Answers and the reader's notes, over main's engine (search-facts.js). The box stays
   the same element from 3a to 3b (only the heading above it goes), so typing the first letter never drops the keyboard.
   Under the chips, as main's Search lays them out: one notes line, Go to, the count, Relevance | Book order, Best matches
   and the groups, or the collections in reading order. Results open in this tab, and Back returns to them as they were
   left (the query, the chip, the order, the places opened, the scroll). A route's `q` (zs28: Answers' "Search the whole
   library for", openTab('search', { q })) opens those words as a new query, everywhere. A gate boot draws its picture from main's engine
   rows (gate-data/search-rows.json) and never starts the engine (its index build writes the Cache API). */
import { Icon } from '../Icon.jsx';
import { definePlace } from '../places.js';
import { readMarks, metaLine } from '../notes-facts.js';
import { GATE_NOW } from '../gate.js';
import { LayerToast } from '../Sheet.jsx';
import { UNDO_MS } from './LetterScreen.jsx';
import { snippet, highlightSpans } from '../../search/snippet.js';
import { applyCorrections } from '../../search/query-parse.js';
import { getRecentSearches, addRecentSearch, removeRecentSearch, restoreRecentSearch } from '../../search/recent-searches.js';
import {
  TRY, SCOPES, GROUPS, ALL_CAP, GOTO_CAP, PAGE, BOOK_FIRST, BOOK_PAGE, RECENT_SHOWN, GATE_ROWS_URL, kept, freshView, groupOf,
  gotoRows, songsFound, groupHits, hitRoute, hitExcerpt, placeStartOf, placesOf, placesLabel, docKey, hitWords, markTerms,
  stopWords, notesMatching, searchSettings, summaryOf, matchCount, topResults, namesAPlace, sortShown, bookSections,
  sectionCount, closeSplit, moreLabel, searchContext, engineScope, didYouMean, gateFound,
} from '../search-facts.js';

const g = /** @type {any} */ (globalThis);
const IDLE = { phase: 'idle', parsed: null, hits: [], terms: [], error: null, corrections: [], unquoted: null, stopWordsOnly: false,
  capped: [], truncated: false, summary: null };
/** main's SearchScreen limits (SEARCH_TOTAL_LIMIT, SEARCH_LIMIT): the same answer main gives. */
const LIMIT = 6000;
const PER_VOLUME = 400;
const START_FAILED = 'Search couldn’t start. Try closing and reopening the app. Your data is safe.';

/** At least two letters or digits: one floods the index with prefixes (main's SRCH-6). */
const searchable = (q) => q.replace(/[^\p{L}\p{N}]/gu, '').length >= 2;
const plural = (n, one, many) => (n === 1 ? one : many);

/** The element that scrolls this page: the laptop's .main, or the phone's .content. */
function scrollerOf(el) {
  return el ? /** @type {HTMLElement | null} */ (el.closest('.main') || el.closest('.content')) : null;
}

/**
 * The engine's answer for `query` (in `ctx`'s place while the scope chip is on): kept from the last visit when it is the
 * same search, else asked for 140 ms after the last keystroke (an older answer arriving late is dropped). The index is
 * built on first use, as main's Search does, its progress counted. A gate boot answers from its picture's engine rows.
 * @param {string} query @param {any} seeded @param {any} ctx @param {ReturnType<typeof searchSettings> | null} settings
 */
function useFound(query, seeded, ctx, settings) {
  const q = query.trim();
  const memo = settings ? [q, settings.translation, settings.useStopWords, settings.synonyms, ctx ? ctx.key : ''].join('\u0001') : '';
  const resumed = React.useRef(!seeded && kept.found && kept.memo === memo ? memo : null);
  const [found, setFound] = React.useState(() => {
    if (seeded) return seeded.data ? gateFound(seeded.data) : { ...IDLE, phase: seeded.rows ? 'searching' : 'idle' };
    return resumed.current ? kept.found : IDLE;
  });
  const [build, setBuild] = React.useState(/** @type {{ on: boolean, done?: number, total?: number }} */ ({ on: false }));
  const translation = settings ? settings.translation : 'nkjv';

  // A gate picture's rows, fetched (they would push the bundle past its budget), never the engine.
  React.useEffect(() => {
    if (!seeded || !seeded.rows || seeded.data) return undefined;
    let live = true;
    const fail = () => { if (live) setFound({ ...IDLE, phase: 'done', error: 'No search rows for ' + seeded.rows }); };
    fetch(GATE_ROWS_URL).then((r) => r.json()).then((all) => {
      if (!live) return;
      if (all && all[seeded.rows]) setFound(gateFound(all[seeded.rows])); else fail();
    }, fail);
    return () => { live = false; };
  }, [seeded]);

  React.useEffect(() => {
    const E = g.VotSearchMini;
    if (seeded || !E) return undefined;
    if (E.getState().ready && (typeof E.isCurrent !== 'function' || E.isCurrent({ translation }))) return undefined;
    let live = true;
    setBuild({ on: true });
    const end = () => { if (live) setBuild({ on: false }); };
    Promise.resolve(E.init({ translation, onProgress: (done, total) => { if (live) setBuild({ on: true, done, total }); } }))
      .then(end, end);
    return () => { live = false; };
  }, [seeded, translation]);

  React.useEffect(() => {
    if (seeded) return undefined;
    if (resumed.current === memo) return undefined;
    resumed.current = null;
    if (!searchable(q)) { setFound(IDLE); return undefined; }
    const E = g.VotSearchMini;
    if (!E) { setFound({ ...IDLE, phase: 'done', error: START_FAILED }); return undefined; }
    let stale = false;
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = setTimeout(() => {
      setFound((f) => ({ ...f, phase: 'searching' }));
      Promise.resolve(E.search(q, {
        translation, useStopWords: settings.useStopWords, synonyms: settings.synonyms, scope: engineScope(ctx), corpus: 'all',
        limit: LIMIT, perVolume: PER_VOLUME, signal: ctl ? ctl.signal : undefined,
      })).then((r) => {
        if (stale) return;
        const terms = markTerms(r.textQuery || r.parsed, r.parsedTerms || [], stopWords());
        const done = { phase: 'done', parsed: r.parsed || null, hits: r.results || [], terms, error: r.error ? START_FAILED : null,
          corrections: r.corrections || [], unquoted: r.unquoted || null, stopWordsOnly: !!r.stopWordsOnly, capped: r.capped || [],
          truncated: !!r.truncated, summary: null };
        if (!r.error) Object.assign(kept, { memo, found: done });
        setFound(done);
      }, () => { if (!stale) setFound({ ...IDLE, phase: 'done', error: START_FAILED }); });
    }, 140);
    return () => { stale = true; if (ctl) ctl.abort(); clearTimeout(t); };
  }, [seeded, memo, q, translation, settings, ctx]);

  return { ...found, build };
}

/** Text with the query's words underlined (main's highlightSpans: whole words, phrases as one). */
function Marked({ text, terms }) {
  const spans = highlightSpans(text, terms);
  return <>{spans.map((s, i) => (s.hit ? <mark key={i}>{s.text}</mark> : <React.Fragment key={i}>{s.text}</React.Fragment>))}</>;
}

/**
 * One result row: where it is, its title, the words around the match. Opens its place in this tab. `places` closes the row
 * over the more-places line drawn under it (.hp).
 * @param {{ where: string, title?: string, excerpt?: string, bx?: boolean, terms?: string[], places?: boolean, onOpen?: () => void }} props
 */
function Hit({ where, title, excerpt, bx, terms, places, onOpen }) {
  const keys = onOpen ? { role: 'button', tabIndex: 0, onClick: onOpen,
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } } } : {};
  return (
    <div className={places ? 'hit hp' : 'hit'} {...keys}>
      <div className="where">{where}</div>
      {title ? <div className="tt">{title}</div> : null}
      {excerpt ? <div className={'ex' + (bx ? ' bx' : '')}><Marked text={excerpt} terms={terms} /></div> : null}
    </div>
  );
}

/**
 * An engine hit as a row (main's SrchCard): where it is, its title, its words (a verse whole). A letter, entry or topic
 * that says the words in more places ends with main's "1 more place in this letter", which lists them under the row, each
 * opening the text there (main's placeStart). A letter's route carries the query as typed: its Find strip opens with it.
 * @param {{ hit: any, terms: string[], stop: Set<string>, label: string, open: (route: any) => void, placesOpen: boolean,
 *   onPlaces: () => void }} props
 */
function EngineHit({ hit, terms, stop, label, open, placesOpen, onPlaces }) {
  const d = hit.doc;
  const at = placeStartOf(hit);
  const words = React.useMemo(() => hitWords(terms, hit.terms, stop), [terms, hit, stop]);
  const excerpt = React.useMemo(() => hitExcerpt(d, words, at), [d, words, at]);
  const places = React.useMemo(() => placesOf(d, words, at), [d, words, at]);
  const routeAt = (start) => {
    const r = hitRoute(d, terms, undefined, hit.terms, start);
    return r && r.place === 'letter' && label ? { ...r, label } : r;
  };
  const route = routeAt(at);
  const bible = groupOf(d) === 'bible';
  const n = places.list.length;
  const row = <Hit where={d.ref || ''} title={bible ? '' : d.title} excerpt={excerpt} bx={bible} terms={words} places={n > 0}
    onOpen={route ? () => open(route) : undefined} />;
  if (!n) return row;
  return (
    <>
      {row}
      <div className="hit-x">
        <button type="button" className="sr-more" aria-expanded={placesOpen} onClick={onPlaces}>
          {placesLabel(n, places.unit)}<Icon name="chev" />
        </button>
        {placesOpen ? (
          <div className="sr-pl">
            {places.list.map((p) => {
              const r = routeAt(p.start);
              return (
                <button key={p.start} type="button" className="sr-p" disabled={!r} onClick={r ? () => open(r) : undefined}>
                  <Marked text={p.clip} terms={words} />
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </>
  );
}

/** One of the reader's marks as a row (In your notes). */
function NoteHit({ mark: m, now, terms, open }) {
  const text = m.note || m.text || m.quote || '';
  return <Hit where={metaLine(m, now)} title={m.title || ''} excerpt={text ? snippet(text, terms, 180) : ''} terms={terms}
    onOpen={m.open ? () => open(m.open) : undefined} />;
}

/** @param {{ items: any[], label: string, cap: number, more?: string, onMore?: () => void, children: (it: any, i: number) => any }} props */
function Group({ label, items, cap, more, onMore, children }) {
  if (!items.length) return null;
  return (
    <div className="grp">
      <span className="label">{label}</span>
      {items.slice(0, cap).map(children)}
      {items.length > cap && onMore ? <button type="button" className="more" onClick={onMore}>{more}</button> : null}
    </div>
  );
}

/**
 * Book order's collections (3e, main's SrchGroup in reading order): each its .sr-col head ("Volume Seven · 1 letter") and
 * its rows, the first ten each while there are several (main's SRCH_BOOK_FIRST_PAGE), then "Show N more" by fifty.
 * @param {{ sections: any[], list: string, shown: Record<string, number>, row: (h: any, list: string) => any,
 *   onMore: (key: string, n: number) => void }} props
 */
function Sections({ sections, list, shown, row, onMore }) {
  return sections.map((sec) => {
    const key = list + '|' + sec.key;
    const n = shown[key] || (sections.length > 1 ? BOOK_FIRST : BOOK_PAGE);
    const left = sec.items.length - n;
    return (
      <React.Fragment key={key}>
        <div className="sr-col">{sec.label}<span className="n">{'· ' + sectionCount(sec)}</span></div>
        {sec.items.slice(0, n).map((h) => row(h, list))}
        {left > 0 ? <button type="button" className="more" onClick={() => onMore(key, n + BOOK_PAGE)}>{moreLabel(left)}</button> : null}
      </React.Fragment>
    );
  });
}

/** @param {import('../places.js').PlaceProps} props */
export function SearchScreen({ route, gate, go, onReady }) {
  const seeded = React.useMemo(() => (gate ? (gate.facts && gate.facts.search) || { query: '' } : null), [gate]);
  const settings = React.useMemo(() => (seeded ? null : searchSettings()), [seeded]);
  const ctx = React.useMemo(() => searchContext(route && route.from), [route]);
  // Search asked for words (Answers' "Search the whole library for", mw10 2j): a route's q opens them as a new query,
  // everywhere, in Relevance; once per route, so Back to Search keeps what was typed since
  const asked = !seeded && route && typeof route.q === 'string' ? route : null;
  const [query, setQuery] = React.useState(() => (seeded ? seeded.query || '' : asked ? asked.q : kept.query));
  const [scope, setScope] = React.useState(() => (seeded ? seeded.scope || 'all' : asked ? 'all' : kept.scope));
  const [scoped, setScoped] = React.useState(() => !!ctx && !asked && (seeded ? !!seeded.scoped : kept.scoped === ctx.key));
  const scopeCtx = scoped ? ctx : null;
  const found = useFound(query, seeded, scopeCtx, settings);
  const q = query.trim();
  // The query's view: Relevance, partial matches hidden, places closed with every new query (main :395, :437).
  const [viewState, setView] = React.useState(() => (seeded
    ? { ...freshView((seeded.query || '').trim()), book: seeded.order === 'book', loose: !!seeded.loose }
    : asked ? freshView(asked.q.trim()) : kept.view));
  const took = React.useRef(asked);
  React.useEffect(() => {
    if (!asked || took.current === asked) return;
    took.current = asked;
    setQuery(asked.q);
    setScope('all');
    setScoped(false);
    setView(freshView(asked.q.trim()));
    kept.top = 0;
  }, [asked]);
  const view = viewState.q === q ? viewState : freshView(q);
  const patch = (p) => setView({ ...view, ...p });
  const history = seeded ? true : settings.history;
  const [recents, setRecents] = React.useState(() => (seeded ? seeded.recent || [] : history ? getRecentSearches() : []));
  const [toast, setToast] = React.useState(/** @type {{ text: string, onAct: () => void } | null} */ (null));
  const marks = React.useMemo(() => (seeded ? seeded.marks || [] : readMarks().marks), [seeded]);
  const now = seeded ? GATE_NOW : Date.now();
  const rootRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const inputRef = React.useRef(/** @type {HTMLInputElement | null} */ (null));

  // main's songs row reads the loaded catalog: a catalog that arrives later shows it (never fetched from here)
  const catalog = !seeded && g.SongCatalog && typeof g.SongCatalog.subscribe === 'function' ? g.SongCatalog : null;
  React.useSyncExternalStore(
    React.useCallback((cb) => (catalog ? catalog.subscribe(cb) : () => {}), [catalog]),
    React.useCallback(() => (catalog ? catalog.getVersion() : 0), [catalog]));

  const waiting = !!(seeded && seeded.rows && found.phase !== 'done');
  React.useEffect(() => { if (!waiting) onReady(); }, [onReady, waiting]);
  React.useEffect(() => {
    if (!seeded) Object.assign(kept, { query, scope, view, scoped: scoped && ctx ? ctx.key : null });
  });
  // The box emptied: the recent list as it is now (a search recorded since shows).
  React.useEffect(() => { if (!seeded && !query && history) setRecents(getRecentSearches()); }, [seeded, query, history]);
  React.useEffect(() => {
    if (!toast || seeded) return undefined;
    const t = setTimeout(() => setToast(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [toast, seeded]);
  // Back from a result: the list where it was left (after the shell has put the new page at its top).
  React.useEffect(() => {
    const top = seeded || took.current ? 0 : kept.top; // words asked for start at the top
    if (!top) return undefined;
    const raf = g.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
    const cancel = g.cancelAnimationFrame || clearTimeout;
    const id = raf(() => { const sc = scrollerOf(rootRef.current); if (sc) sc.scrollTop = top; });
    return () => cancel(id);
  }, [seeded]);
  React.useLayoutEffect(() => {
    const el = rootRef.current;
    return () => { const sc = scrollerOf(el); if (!seeded && sc) kept.top = sc.scrollTop; };
  }, [seeded]);

  const type = (v) => { setQuery(v); kept.top = 0; };
  const clear = () => { type(''); if (inputRef.current) inputRef.current.focus(); };
  // main's recordSearch: on Enter or on opening a result, never per keystroke; nothing with history off
  const record = () => { if (!seeded && history && searchable(q)) addRecentSearch(q); };
  const open = (r) => { record(); go(r); };
  const removeRecent = (r) => {
    const was = recents;
    setRecents(seeded ? was.filter((x) => x !== r) : removeRecentSearch(r));
    setToast({ text: 'Removed “' + r + '”', onAct: () => { setRecents(seeded ? was : restoreRecentSearch(r, was.indexOf(r))); setToast(null); } });
  };
  const empty = !query;

  const field = (
    <div className={'field' + (seeded && seeded.focus ? ' focus' : '')}>
      <input ref={inputRef} className="q" type="text" value={query} placeholder="Words, a verse, a letter’s name"
        aria-label="Search" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search"
        onChange={(e) => type(e.currentTarget.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { record(); e.currentTarget.blur(); } }} />
      {empty ? <Icon name="search" /> : <button type="button" className="clear" aria-label="Clear" onClick={clear}><Icon name="close" /></button>}
    </div>
  );

  let body = null;
  if (empty) {
    const shownRecents = history ? recents.slice(0, RECENT_SHOWN) : [];
    body = (
      <>
        {shownRecents.length ? (
          <>
            <span className="label rec">Recent</span>
            <div className="chips">
              {shownRecents.map((r) => (
                <span key={r} className="chip rc">
                  <button type="button" className="rq" onClick={() => type(r)}>{r}</button>
                  <button type="button" className="x" aria-label={'Remove recent search ' + r} onClick={() => removeRecent(r)}>
                    <Icon name="close" />
                  </button>
                </span>
              ))}
            </div>
          </>
        ) : null}
        <span className="label try">Try</span>
        <div className="chips">
          {TRY.map((t) => <button key={t} type="button" className="chip" onClick={() => type(t)}>{t}</button>)}
        </div>
        {shownRecents.length ? null : (
          <p className="hint">One search for the letters, the Bible, Answers and your notes. Results open in this tab, so Back brings you back to them.</p>
        )}
      </>
    );
  } else {
    const all = scope === 'all';
    const done = found.phase === 'done';
    const by = groupHits(found.hits);
    const notes = searchable(q) && !scopeCtx ? notesMatching(q, marks) : [];
    const lists = { ...by, notes };
    const shownHits = scope === 'notes' ? [] : all ? found.hits : by[scope];
    const stop = stopWords();
    // Go to stays out of one place's results (3h: "the results come from that place only", one group)
    const gotos = all && !scopeCtx && searchable(q) ? gotoRows(q, found.parsed, seeded ? seeded.songs || 0 : songsFound(q)) : [];
    const sum = found.summary && all
      ? { count: found.summary.count, sections: found.summary.sections, more: !!found.summary.capped }
      : summaryOf(shownHits, { capped: found.capped, truncated: found.truncated });
    const best = all && !scopeCtx ? topResults(found.hits, sum.sections, namesAPlace(found.parsed)) : [];
    const seg = done && shownHits.length > 0 && sortShown(best, shownHits);
    const book = seg && view.book;
    const split = book ? closeSplit(shownHits) : null;
    const anyShown = gotos.length > 0 || notes.length > 0 || (scope === 'notes' ? false : shownHits.some((h) => groupOf(h.doc)));
    const none = done && !found.error && !found.hits.length;

    const row = (h, list) => {
      const key = list + '|' + docKey(h.doc);
      const isOpen = view.opened.includes(key);
      return <EngineHit key={key} hit={h} terms={found.terms} stop={stop} label={q} open={open} placesOpen={isOpen}
        onPlaces={() => patch({ opened: isOpen ? view.opened.filter((k) => k !== key) : view.opened.concat(key) })} />;
    };
    const page = (key, n) => patch({ shown: { ...view.shown, [key]: n } });
    const noteRow = (m) => <NoteHit key={m.id} mark={m} now={now} terms={q.split(/\s+/)} open={open} />;
    const notesGroup = (
      <Group label="In your notes" items={scope === 'notes' || all ? notes : []} cap={all ? ALL_CAP : view.shown.notes || PAGE}
        more={all ? 'More in your notes' : 'Show more'} onMore={all ? () => setScope('notes') : () => page('notes', (view.shown.notes || PAGE) + PAGE)}>
        {noteRow}
      </Group>
    );

    // One notes line under the chips (dz19 3f), in main's words.
    let note = null;
    if (found.error) note = <p className="hint">{found.error}</p>;
    else if (!/[\p{L}\p{N}]/u.test(q)) note = <p className="sr-fix">Type a word, a title or a reference to search.</p>;
    else if (found.build.on && searchable(q)) {
      const { done: n = 0, total = 0 } = found.build;
      note = (
        <div className="sr-fix" role="status" aria-live="polite">
          {'Building search index…' + (total ? ' ' + n.toLocaleString('en-US') + ' / ' + total.toLocaleString('en-US') : '')}
          <div className="sr-bar"><i style={{ width: (total ? Math.min(100, (100 * n) / total) : 0) + '%' }} /></div>
        </div>
      );
    } else if (!done && searchable(q) && !anyShown) note = <p className="sr-fix" role="status" aria-live="polite">Searching…</p>;
    else if (done && found.hits.length && found.corrections.length) {
      const fixed = applyCorrections(q, found.corrections);
      note = (
        <p className="sr-fix">
          No results for {found.corrections.map((c, i) => <React.Fragment key={c.from}>{i > 0 ? ', ' : ''}“{c.from}”</React.Fragment>)}.
          {' Showing results for '}<button type="button" onClick={() => type(fixed)}>{fixed}</button>.
        </p>
      );
    } else if (done && found.hits.length && found.unquoted) {
      note = <p className="sr-fix">No exact match for “{found.unquoted}”. Showing results for its words.</p>;
    } else if (none && found.stopWordsOnly) {
      note = <p className="sr-fix">“{q}” is in nearly every verse and letter. Add another word to search.</p>;
    } else if (none) {
      const dym = didYouMean(q, found.parsed, 0);
      if (dym) note = <p className="sr-fix">No results for “{q}” — did you mean <button type="button" onClick={() => type(dym)}>{dym}</button>?</p>;
      else if (scopeCtx) {
        note = (
          <p className="sr-fix">
            No results for “{q}” in {scopeCtx.label}. <button type="button" onClick={() => setScoped(false)}>Search everywhere</button>
          </p>
        );
      }
    }
    // While the last answer's rows still show, the new search is said, not drawn (no jump).
    const live = !note && !done && searchable(q) ? <span className="sr-live" role="status" aria-live="polite">Searching…</span> : null;
    const nothing = !note && done && searchable(q) && !anyShown
      ? <div className="empty"><div className="t">No results for “{q}”</div><div className="s">Try a different search term.</div></div>
      : null;

    let list = null;
    if (scope === 'notes') list = notesGroup;
    else if (book) {
      const sections = split ? null : bookSections(shownHits);
      const loose = split ? (found.summary && all ? found.summary.loose : split.looseCount) : 0;
      const capped = found.summary && all ? !!found.summary.capped : found.capped.length > 0 || found.truncated;
      list = (
        <>
          {split ? (
            <>
              <div className="grp">
                <span className="label">Closest matches</span>
                <Sections sections={split.close} list="close" shown={view.shown} row={row} onMore={page} />
              </div>
              {view.loose ? (
                <div className="grp">
                  <span className="label">Partial matches</span>
                  <Sections sections={split.loose} list="loose" shown={view.shown} row={row} onMore={page} />
                </div>
              ) : (
                <button type="button" className="btn2 sr-part" onClick={() => patch({ loose: true })}>
                  {'Show ' + matchCount(loose, capped) + ' partial ' + plural(loose, 'match', 'matches')}
                </button>
              )}
            </>
          ) : (
            <div className="grp"><Sections sections={sections} list="book" shown={view.shown} row={row} onMore={page} /></div>
          )}
          {all ? notesGroup : null}
        </>
      );
    } else {
      list = (
        <>
          {best.length ? (
            <div className="grp">
              <span className="label">Best matches</span>
              {best.map((h) => row(h, 'best'))}
            </div>
          ) : null}
          {scopeCtx ? (
            <Group label={'In ' + scopeCtx.label} items={found.hits.filter((h) => groupOf(h.doc))} cap={view.shown.ctx || PAGE}
              more="Show more" onMore={() => page('ctx', (view.shown.ctx || PAGE) + PAGE)}>
              {(h) => row(h, 'ctx')}
            </Group>
          ) : GROUPS.filter((gr) => gr.id !== 'notes' && (all || scope === gr.id)).map((gr) => (
            <Group key={gr.id} label={gr.label} items={lists[gr.id]} cap={all ? ALL_CAP : view.shown[gr.id] || PAGE}
              more={all ? gr.more : 'Show more'}
              onMore={all ? () => setScope(gr.id) : () => page(gr.id, (view.shown[gr.id] || PAGE) + PAGE)}>
              {(h) => row(h, gr.id)}
            </Group>
          ))}
          {all ? notesGroup : null}
        </>
      );
    }

    body = (
      <>
        <div className="chips scroll scopes" role="group" aria-label="Search in">
          {scopeCtx ? (
            <span className="chip on rc">
              {'In ' + scopeCtx.label}
              <button type="button" className="x" aria-label="Search everywhere" onClick={() => setScoped(false)}><Icon name="close" /></button>
            </span>
          ) : (
            <>
              {ctx ? (
                <button type="button" className="chip ctx" onClick={() => { setScoped(true); setScope('all'); }}>
                  <Icon name="search" />{'In ' + ctx.label}
                </button>
              ) : null}
              {SCOPES.map((s) => (
                <button key={s.id} type="button" className={'chip' + (s.id === scope ? ' on' : '')} aria-pressed={s.id === scope}
                  onClick={() => setScope(s.id)}>{s.label}</button>
              ))}
            </>
          )}
        </div>
        {note}
        {live}
        {gotos.length ? (
          <div className="grp">
            <span className="label">Go to</span>
            {gotos.slice(0, GOTO_CAP).map((r) => <Hit key={r.key} where={r.where} title={r.title} onOpen={() => open(r.route)} />)}
          </div>
        ) : null}
        {done && shownHits.length ? (
          <p className="sr-sum">
            Found <b>{matchCount(sum.count, sum.more) + ' ' + plural(sum.count, 'match', 'matches')}</b>
            {scopeCtx ? <> in <b>{scopeCtx.label}</b></> : <> across <b>{sum.sections + ' ' + plural(sum.sections, 'section', 'sections')}</b></>}
          </p>
        ) : null}
        {seg ? (
          <>
            <div className="seg sr-seg" role="group" aria-label="Order results">
              {[['Relevance', false], ['Book order', true]].map(([name, b]) => (
                <span key={String(name)} role="button" tabIndex={0} className={view.book === b ? 'on' : undefined} aria-pressed={view.book === b}
                  onClick={() => patch({ book: b })}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); patch({ book: b }); } }}>{name}</span>
              ))}
            </div>
            <p className="sr-nt">{view.book ? 'Genesis to Revelation, then Volume One onward' : 'Best matches first'}</p>
          </>
        ) : null}
        {list}
        {nothing}
      </>
    );
  }

  return (
    <div ref={rootRef} className={empty ? 'page-head g tabroot' : 'g results'}>
      {empty ? <h1 className="display">Search</h1> : null}
      {field}
      {body}
      <LayerToast text={toast ? toast.text : null} act={toast ? 'Undo' : undefined} onAct={toast ? toast.onAct : undefined} />
    </div>
  );
}

definePlace('search', {
  Screen: SearchScreen,
  title: () => 'Search',
  actions: ({ go }) => <button type="button" className="ic" aria-label="More" onClick={() => go({ place: 'settings' })}><Icon name="more" /></button>,
});
