/* SearchScreen - the Search tab (zv1; pictures 3a-search before typing, 3b-search-results).

   One box for the letters, the Bible, Answers and the reader's notes, over main's engine (search-facts.js). The box stays
   the same element from 3a to 3b (only the heading above it goes), so typing the first letter never drops the keyboard.
   Results open in this tab and Back returns to them where the list was left. A gate boot shows the seeded state and never
   starts the engine (its index build writes the Cache API). */
import { Icon } from '../Icon.jsx';
import { definePlace } from '../places.js';
import { readMarks, metaLine } from '../notes-facts.js';
import { GATE_NOW } from '../gate.js';
import { snippet, highlightSpans } from '../../search/snippet.js';
import {
  TRY, SCOPES, GROUPS, ALL_CAP, GOTO_CAP, PAGE, kept, gotoRows, groupHits, hitRoute, markTerms, notesMatching, searchSettings,
} from '../search-facts.js';

const g = /** @type {any} */ (globalThis);
const IDLE = { phase: 'idle', parsed: null, hits: [], terms: [], error: null };
/** main's SearchScreen limits (SEARCH_TOTAL_LIMIT, SEARCH_LIMIT): the same answer main gives. */
const LIMIT = 6000;
const PER_VOLUME = 400;
const START_FAILED = 'Search couldn’t start. Try closing and reopening the app. Your data is safe.';

/** At least two letters or digits: one floods the index with prefixes (main's SRCH-6). */
const searchable = (q) => q.replace(/[^\p{L}\p{N}]/gu, '').length >= 2;

/** The element that scrolls this page: the laptop's .main, or the phone's .content. */
function scrollerOf(el) {
  return el ? /** @type {HTMLElement | null} */ (el.closest('.main') || el.closest('.content')) : null;
}

/**
 * The engine's answer for `query`: kept from the last visit when it is the same search, else asked for 140 ms after the
 * last keystroke (an older answer arriving late is dropped). The index is built on first use, as main's Search does.
 * @param {string} query @param {any} seeded
 */
function useFound(query, seeded) {
  const settings = React.useMemo(() => (seeded ? null : searchSettings()), [seeded]);
  const q = query.trim();
  const memo = settings ? [q, settings.translation, settings.useStopWords, settings.synonyms].join('\u0001') : '';
  const resumed = React.useRef(!seeded && kept.found && kept.memo === memo ? memo : null);
  const [found, setFound] = React.useState(() => {
    if (seeded) return { phase: 'done', parsed: seeded.parsed || null, hits: seeded.hits || [], terms: seeded.terms || [], error: null };
    return resumed.current ? kept.found : IDLE;
  });
  const [building, setBuilding] = React.useState(false);
  const translation = settings ? settings.translation : 'nkjv';

  React.useEffect(() => {
    const E = g.VotSearchMini;
    if (seeded || !E) return undefined;
    if (E.getState().ready && (typeof E.isCurrent !== 'function' || E.isCurrent({ translation }))) return undefined;
    let live = true;
    setBuilding(true);
    Promise.resolve(E.init({ translation })).then(
      () => { if (live) setBuilding(false); },
      () => { if (live) setBuilding(false); },
    );
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
        translation, useStopWords: settings.useStopWords, synonyms: settings.synonyms, scope: null, corpus: 'all',
        limit: LIMIT, perVolume: PER_VOLUME, signal: ctl ? ctl.signal : undefined,
      })).then((r) => {
        if (stale) return;
        const D = g.VotSearchData;
        const terms = markTerms(r.textQuery || r.parsed, r.parsedTerms || [], D && D.STOP_WORDS_TRIMMED);
        const done = { phase: 'done', parsed: r.parsed || null, hits: r.results || [], terms, error: r.error ? START_FAILED : null };
        if (!r.error) Object.assign(kept, { memo, found: done });
        setFound(done);
      }, () => { if (!stale) setFound({ ...IDLE, phase: 'done', error: START_FAILED }); });
    }, 140);
    return () => { stale = true; if (ctl) ctl.abort(); clearTimeout(t); };
  }, [seeded, memo, q, translation, settings]);

  return { ...found, building };
}

/** Text with the query's words underlined (main's highlightSpans: whole words, phrases as one). */
function Marked({ text, terms }) {
  const spans = highlightSpans(text, terms);
  return <>{spans.map((s, i) => (s.hit ? <mark key={i}>{s.text}</mark> : <React.Fragment key={i}>{s.text}</React.Fragment>))}</>;
}

/**
 * One result row: where it is, its title, the words around the match. Opens its place in this tab.
 * @param {{ where: string, title?: string, excerpt?: string, bx?: boolean, terms?: string[], onOpen?: () => void }} props
 */
function Hit({ where, title, excerpt, bx, terms, onOpen }) {
  const keys = onOpen ? { role: 'button', tabIndex: 0, onClick: onOpen,
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } } } : {};
  return (
    <div className="hit" {...keys}>
      <div className="where">{where}</div>
      {title ? <div className="tt">{title}</div> : null}
      {excerpt ? <div className={'ex' + (bx ? ' bx' : '')}><Marked text={excerpt} terms={terms} /></div> : null}
    </div>
  );
}

/**
 * An engine hit as a row: verses quote the whole verse; letters and Answers show the words around the match. A letter's
 * route carries the query as typed: its Find strip opens with it (main's find.label).
 */
function EngineHit({ hit, terms, query, go }) {
  const d = hit.doc;
  const words = hit.terms && hit.terms.length ? terms.concat(hit.terms.filter((t) => terms.indexOf(t) < 0)) : terms;
  const found = hitRoute(d, terms, undefined, hit.terms);
  const label = String(query || '').trim();
  const route = found && found.place === 'letter' && label ? { ...found, label } : found;
  const bible = d.kind === 'verse' || d.kind === 'heading' || d.kind === 'chapter-title';
  const excerpt = hit.excerpt || (bible ? (d.kind === 'heading' ? d.heading || d.text : d.text) : snippet(d.text || '', words, 180));
  return <Hit where={d.ref || ''} title={bible ? '' : d.title} excerpt={excerpt} bx={bible} terms={words}
    onOpen={route ? () => go(route) : undefined} />;
}

/** One of the reader's marks as a row (In your notes). */
function NoteHit({ mark: m, now, terms, go }) {
  const text = m.note || m.text || m.quote || '';
  return <Hit where={metaLine(m, now)} title={m.title || ''} excerpt={text ? snippet(text, terms, 180) : ''} terms={terms}
    onOpen={m.open ? () => go(m.open) : undefined} />;
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

/** @param {import('../places.js').PlaceProps} props */
export function SearchScreen({ gate, go, onReady }) {
  const seeded = React.useMemo(() => (gate ? (gate.facts && gate.facts.search) || { query: '', scope: 'all', hits: [], marks: [] } : null), [gate]);
  const [query, setQuery] = React.useState(() => (seeded ? seeded.query : kept.query));
  const [scope, setScope] = React.useState(() => (seeded ? seeded.scope || 'all' : kept.scope));
  const [shown, setShown] = React.useState(PAGE);
  const found = useFound(query, seeded);
  const marks = React.useMemo(() => (seeded ? seeded.marks || [] : readMarks().marks), [seeded]);
  const now = seeded ? GATE_NOW : Date.now();
  const rootRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const inputRef = React.useRef(/** @type {HTMLInputElement | null} */ (null));

  React.useEffect(() => { onReady(); }, [onReady]);
  React.useEffect(() => { if (!seeded) Object.assign(kept, { query, scope }); }, [seeded, query, scope]);
  // Back from a result: the list where it was left (after the shell has put the new page at its top).
  React.useEffect(() => {
    const top = seeded ? 0 : kept.top;
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

  const type = (v) => { setQuery(v); setShown(PAGE); kept.top = 0; };
  const clear = () => { type(''); if (inputRef.current) inputRef.current.focus(); };
  const pick = (s) => { setScope(s); setShown(PAGE); };
  const empty = !query;
  const q = query.trim();
  const terms = found.terms || [];

  const field = (
    <div className={'field' + (seeded && seeded.focus ? ' focus' : '')}>
      <input ref={inputRef} className="q" type="text" value={query} placeholder="Words, a verse, a letter’s name"
        aria-label="Search" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search"
        onChange={(e) => type(e.currentTarget.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
      {empty ? <Icon name="search" /> : <button type="button" className="clear" aria-label="Clear" onClick={clear}><Icon name="close" /></button>}
    </div>
  );

  let body = null;
  if (empty) {
    body = (
      <>
        <span className="label try">Try</span>
        <div className="chips">
          {TRY.map((t) => <button key={t} type="button" className="chip" onClick={() => type(t)}>{t}</button>)}
        </div>
        <p className="hint">One search for the letters, the Bible, Answers and your notes. Results open in this tab, so Back brings you back to them.</p>
      </>
    );
  } else {
    const by = groupHits(found.hits);
    const notes = searchable(q) ? notesMatching(q, marks) : [];
    const lists = { ...by, notes };
    const gotos = scope === 'all' && searchable(q) ? gotoRows(q, found.parsed, found.hits) : [];
    const any = gotos.length || GROUPS.some((gr) => (scope === 'all' || scope === gr.id) && lists[gr.id].length);
    const row = (gr) => (gr.id === 'notes'
      ? (m) => <NoteHit key={m.id} mark={m} now={now} terms={q.split(/\s+/)} go={go} />
      : (h, i) => <EngineHit key={(h.doc && h.doc.id) || i} hit={h} terms={terms} query={q} go={go} />);
    let status = null;
    if (found.error) status = <p className="hint">{found.error}</p>;
    else if (!any && searchable(q) && (found.building || found.phase !== 'done')) {
      status = <p className="hint">{found.building ? 'Getting search ready…' : 'Searching…'}</p>;
    } else if (!any && searchable(q)) {
      status = <div className="empty"><div className="t">No results for “{q}”</div><div className="s">Try a different search term.</div></div>;
    }
    body = (
      <>
        <div className="chips scroll scopes" role="group" aria-label="Search in">
          {SCOPES.map((s) => (
            <button key={s.id} type="button" className={'chip' + (s.id === scope ? ' on' : '')} aria-pressed={s.id === scope}
              onClick={() => pick(s.id)}>{s.label}</button>
          ))}
        </div>
        {status}
        {gotos.length ? (
          <div className="grp">
            <span className="label">Go to</span>
            {gotos.slice(0, GOTO_CAP).map((r) => <Hit key={r.key} where={r.where} title={r.title} onOpen={() => go(r.route)} />)}
          </div>
        ) : null}
        {GROUPS.filter((gr) => scope === 'all' || scope === gr.id).map((gr) => (
          <Group key={gr.id} label={gr.label} items={lists[gr.id]} cap={scope === 'all' ? ALL_CAP : shown}
            more={scope === 'all' ? gr.more : 'Show more'}
            onMore={scope === 'all' ? () => pick(gr.id) : () => setShown((n) => n + PAGE)}>
            {row(gr)}
          </Group>
        ))}
      </>
    );
  }

  return (
    <div ref={rootRef} className={empty ? 'page-head g tabroot' : 'g results'}>
      {empty ? <h1 className="display">Search</h1> : null}
      {field}
      {body}
    </div>
  );
}

definePlace('search', {
  Screen: SearchScreen,
  title: () => 'Search',
  actions: ({ go }) => <button type="button" className="ic" aria-label="More" onClick={() => go({ place: 'settings' })}><Icon name="more" /></button>,
});
