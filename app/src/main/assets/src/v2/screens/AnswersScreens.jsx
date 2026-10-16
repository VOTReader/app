/* AnswersScreens - Answers Only God Can Give in v2 (mw10; design dz17, pictures 2g-2l, laptop 2g 2i 2j; v2-gaps 16: v2
   opened it as a plain collection). Main's AnswersHome, CommandmentSheet, AnswersResults, AnswersSubject and AnswersAZ
   in the kit, words and data through answers-facts.js:
   - the home (2g, 2h; Back says Home): title, lede, the field (2 letters search Answers as you type), The Ten Commandments
     in the kit's two columns (each row one button), Browse by subject, Every Topic A-Z, main's source line;
   - a commandment (2i): main's sheet as the kit's sheet (the laptop's centred dialog with its x); its reference opens the
     chapter at the verse, a topic opens with Back reading "Commandment VI";
   - searched (2j): Back says Answers and clears the words first (main); a topic opens at the passage that matched, the
     words marked and the Find strip filled (search-landing.js, as a search hit); nothing found offers the whole library
     (the Search tab with the words: openTab('search', { q }), zones' zs28 reads it);
   - a subject (2k) and Every Topic A-Z (2l; a letter scrolls its group to the top), Back says Answers.
   The home keeps its words and its open commandment in its route as it is left (main keeps them in module memory), so
   Back from a topic returns to the same results or the same sheet. A route that names the collection 'answers' (Home
   Recent's topic, Search's Go to) is turned into this place (CollectionScreen). */
import { Icon } from '../Icon.jsx';
import { definePlace } from '../places.js';
import { Sheet } from '../Sheet.jsx';
import { useAnswersCorpusVersion, askAnswersCorpus } from '../corpus.js';
import { refParts, findChapterRoute } from '../footnotes.js';
import {
  answersEntries, answersHome, commandmentSheet, commandmentName, answersResults, moreTopicsWords, MENTIONS_SHOWN,
  answersSubject, subjectTitle, answersAZ, topicRoute,
} from '../answers-facts.js';

const g = /** @type {any} */ (globalThis);

/** main's lede words for the page (the pick's; main's eyebrow and longer line are dropped). */
const TITLE = 'Answers Only God Can Give';
const LEDE = 'The Lord sets the record straight';

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

/** A topic in a list: its short title (and the site's full title under it, in a commandment's sheet), passages, chevron. */
function TopicRow({ row, onOpen }) {
  return (
    <button type="button" className="row ans-t" onClick={onOpen}>
      <span className="tx"><span className="t">{row.t}</span>{row.s ? <span className="s">{row.s}</span> : null}</span>
      {row.n > 0 && <span className="ans-n num" aria-label={row.n === 1 ? '1 passage' : row.n + ' passages'}>{row.n}</span>}
      <span className="chev"><Icon name="chev" /></span>
    </button>
  );
}

/** One commandment as the kit's .grid2 cells: the numeral and its label, one control (the numeral is the label's twin). */
function CommandmentCells({ c, last, on, onOpen }) {
  const cls = (k) => k + (last ? ' last' : '') + (on ? ' on' : '');
  return (
    <>
      <button type="button" className={cls('n')} tabIndex={-1} aria-hidden="true" onClick={onOpen}>{c.numeral}</button>
      <button type="button" className={cls('c')} aria-label={c.aria} onClick={onOpen}>{c.label}</button>
    </>
  );
}

/** main's snippet: the words marked as 3b marks them. @param {{ segs: Array<{ text: string, hit: boolean }> }} props */
function Snippet({ segs }) {
  return <>{segs.map((s, i) => (s.hit ? <mark key={i}>{s.text}</mark> : <React.Fragment key={i}>{s.text}</React.Fragment>))}</>;
}

/** A div that opens like a button (a hit holds blocks a button may not). */
const pressable = (onOpen) => ({
  role: 'button', tabIndex: 0, onClick: onOpen,
  onKeyDown: (/** @type {any} */ e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } },
});

/** 2j: the topic(s) the words name, then the other topics whose passages speak of them, or main's nothing-found. */
function Results({ res, onTopic, onLibrary }) {
  const [all, setAll] = React.useState(false);
  React.useEffect(() => { setAll(false); }, [res.q]);
  if (res.empty) {
    return (
      <div className="g results ans-res" role="status">
        <div className="empty">
          <div className="t">Nothing in Answers speaks of “{res.q}”.</div>
          <button type="button" className="textbtn" onClick={() => onLibrary(res.q)}>Search the whole library for “{res.q}”</button>
        </div>
      </div>
    );
  }
  const shown = all ? res.mentions : res.mentions.slice(0, MENTIONS_SHOWN);
  const more = all ? '' : moreTopicsWords(res.mentions.length);
  return (
    <div className="g results ans-res">
      {res.topics.length > 0 && (
        <div className="grp">
          <span className="label">{res.topicsLabel}</span>
          {res.topics.map((t) => (
            <div key={t.id} className="hit ans-hit" {...pressable(() => onTopic(t))}>
              <div className="where">{t.where}</div>
              <div className="tt">{t.t}</div>
              {t.snippet && <div className="ex"><Snippet segs={t.snippet} /></div>}
              {t.source && <div className="src">{t.source}</div>}
            </div>
          ))}
        </div>
      )}
      {res.mentions.length > 0 && (
        <>
          <div className="sec ans-also"><span className="label">{res.mentionsLabel}</span></div>
          <p className="ans-sum" role="status">{res.summary}</p>
          <div className="ans-list end">
            {shown.map((m) => <TopicRow key={m.id} row={m} onOpen={() => onTopic(m)} />)}
          </div>
          {more && <button type="button" className="more" onClick={() => setAll(true)}>{more}</button>}
        </>
      )}
    </div>
  );
}

/** 2i: a commandment, its verse and reference, then its topics most passages first. */
function CommandmentSheet({ sheet, desktop, onClose, onTopic, onRef }) {
  return (
    <Sheet kind="ref cmd" label={sheet.overline + ': ' + sheet.label} desktop={desktop} closeX onClose={onClose}>
      <span className="overline">{sheet.overline}</span>
      <div className="ref-h">{sheet.label}</div>
      <p className="ref-v">{sheet.verse}</p>
      <button type="button" className="textbtn sm cmd-go" onClick={() => onRef(sheet.ref)}>{sheet.ref}<Icon name="arrowR" /></button>
      <div className="ans-lab"><span className="label">{sheet.topicsLabel}</span>{sheet.passages && <span className="ans-k num">{sheet.passages}</span>}</div>
      <div className="ans-list">
        {sheet.rows.map((r) => <TopicRow key={r.id} row={r} onOpen={() => onTopic(r)} />)}
      </div>
    </Sheet>
  );
}

/** @param {import('../places.js').PlaceProps} props */
export function AnswersHome({ route, gate, desktop, go, replace, openTab, onReady, setBack }) {
  const { entries, status, retry } = useAnswers();
  const [query, setQuery] = React.useState(() => String(route.q || ''));
  const [sheetN, setSheetN] = React.useState(() => (route.cmd != null ? Number(route.cmd) : null));
  const words = React.useDeferredValue(query);
  const home = React.useMemo(() => (entries ? answersHome(entries) : null), [entries]);
  const res = React.useMemo(() => (entries ? answersResults(entries, words) : null), [entries, words]);
  const sheet = entries && sheetN != null ? commandmentSheet(entries, sheetN) : null;
  React.useEffect(() => { if (status !== 'loading') onReady(); }, [status, onReady]);
  // Back with words typed clears them before it leaves the page (main's __screenBack); the bar then says Answers
  const typed = !!query;
  React.useEffect(() => {
    if (!typed || !setBack) return undefined;
    setBack({ label: 'Answers', run: () => setQuery('') });
    return () => setBack(null);
  }, [typed, setBack]);
  const inputRef = React.useRef(/** @type {HTMLInputElement | null} */ (null));

  /** Leaves for `next`, this page keeping its words and open commandment for Back. */
  const leave = (next, cmd = sheetN) => {
    /** @type {Record<string, any>} */
    const here = { ...route };
    delete here.q;
    delete here.cmd;
    if (query) here.q = query;
    if (cmd != null) here.cmd = cmd;
    replace(here);
    go(next);
  };
  // a topic the words found opens at the passage that matched, marked, the Find strip holding the words as typed (the
  // results drawn can trail the field by a keystroke while the reader types: the words are the field's, not theirs)
  const openHit = (row) => {
    const r = topicRoute(entries, row.id);
    const typedNow = query.trim();
    const now = res && res.q === typedNow ? res : answersResults(entries, typedNow);
    if (!r || !now) return;
    leave({ ...r, match: now.words, label: typedNow, ...(row.at ? { excerpt: row.at } : {}) }, null);
  };
  const openListed = (row, cmd) => {
    const r = topicRoute(entries, row.id);
    if (r) leave(r, cmd);
  };
  const openRef = (ref) => {
    const parts = refParts(ref);
    if (!parts.length) return;
    findChapterRoute(parts[0].parsed).then((r) => { if (r) leave(r); });
  };
  const library = (q) => openTab('search', { q });
  const clear = () => { setQuery(''); if (inputRef.current) inputRef.current.focus(); };
  // a gate boot draws the field as the picture does, keeping focus (gold edge, caret) with the keyboard closed
  const drawnFocus = !!(gate && query);

  return (
    <>
      <div className="page-head g">
        <h1 className="display">{TITLE}</h1>
        <p className="lede">{LEDE}</p>
        <div className={'field' + (drawnFocus ? ' focus' : '')} role="search">
          <input ref={inputRef} className="q" type="text" value={query} placeholder="What does The Lord say about…"
            aria-label="Search the topics" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search"
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
          {drawnFocus && <span className="caret" />}
          {query ? <button type="button" className="clear" aria-label="Clear the search" onClick={clear}><Icon name="close" /></button>
            : <Icon name="search" />}
        </div>
      </div>
      {status === 'failed' && <NotLoaded retry={retry} />}
      {res ? <Results res={res} onTopic={openHit} onLibrary={library} /> : home && (
        <>
          <div className="ans-sec">
            <h2 className="h2">The Ten Commandments</h2>
            <div className="grid2 cmds">
              {[home.left, home.right].map((cmds, ci) => (
                <div className="col" key={ci}>
                  {cmds.map((c, i) => (
                    <CommandmentCells key={c.n} c={c} last={i === cmds.length - 1} on={c.n === sheetN} onOpen={() => setSheetN(c.n)} />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="sec g ans-subj"><span className="label">Browse by subject</span></div>
          <div className="rows end">
            {home.subjects.map((s) => (
              <TopicRow key={s.id} row={{ t: s.t, s: s.s, n: 0 }} onOpen={() => leave({ place: 'answers/subject', subject: s.id })} />
            ))}
            <TopicRow row={{ t: 'Every Topic, A–Z', s: home.all, n: 0 }} onOpen={() => leave({ place: 'answers/a-z' })} />
          </div>
          <p className="hint g ans-src">Gathered from answersonlygodcangive.com. Every passage opens the letter it came from.</p>
        </>
      )}
      {sheet && (
        <CommandmentSheet sheet={sheet} desktop={desktop} onClose={() => setSheetN(null)}
          onTopic={(r) => openListed(r, sheet.n)} onRef={openRef} />
      )}
    </>
  );
}

/** 2k: a subject's topics, most spoken of first. @param {import('../places.js').PlaceProps} props */
export function AnswersSubjectScreen({ route, go, onReady }) {
  const { entries, status, retry } = useAnswers();
  const page = entries ? answersSubject(entries, route.subject) : null;
  React.useEffect(() => { if (status !== 'loading') onReady(); }, [status, onReady]);
  if (status === 'failed') return <NotLoaded retry={retry} />;
  if (!entries) return null;
  if (!page) return <div className="empty"><div className="t">This subject is not in Answers.</div></div>;
  const open = (row) => { const r = topicRoute(entries, row.id); if (r) go(r); };
  return (
    <>
      <div className="page-head g">
        <span className="overline eyebrow">{TITLE}</span>
        <h1 className="display">{page.title}</h1>
        <p className="lede">{page.lede}</p>
      </div>
      <div className="g"><div className="ans-lab"><span className="label">Most spoken of first</span><span className="ans-k">Passages</span></div></div>
      <div className="rows end ans-list">
        {page.rows.map((r) => <TopicRow key={r.id} row={r} onOpen={() => open(r)} />)}
      </div>
    </>
  );
}

/** 2l: every topic A-Z under its letter; a letter in the jump grid scrolls its group to the top. */
export function AnswersAZScreen({ go, onReady }) {
  const { entries, status, retry } = useAnswers();
  const page = React.useMemo(() => (entries ? answersAZ(entries) : null), [entries]);
  const listRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  React.useEffect(() => { if (status !== 'loading') onReady(); }, [status, onReady]);
  if (status === 'failed') return <NotLoaded retry={retry} />;
  if (!page || !entries) return null;
  const open = (row) => { const r = topicRoute(entries, row.id); if (r) go(r); };
  // the reader's own tap: the page moves as a finger would move it (main's scrollIntoView)
  const jump = (L) => {
    const el = listRef.current && listRef.current.querySelector('[data-az-letter="' + L + '"]');
    if (el) el.scrollIntoView({ block: 'start' });
  };
  return (
    <>
      <div className="page-head g">
        <span className="overline eyebrow">{TITLE}</span>
        <h1 className="display">Every Topic, A–Z</h1>
        <p className="lede">{page.lede}</p>
        <nav className="azj" aria-label="Jump to a letter">
          {page.groups.map((grp) => (
            <button key={grp.letter} type="button" aria-label={grp.letter === '#' ? 'Numbers' : grp.letter} onClick={() => jump(grp.letter)}>{grp.letter}</button>
          ))}
        </nav>
      </div>
      <div ref={listRef}>
        {page.groups.map((grp) => (
          <section key={grp.letter} aria-label={grp.letter === '#' ? 'Numbers' : grp.letter}>
            <div className="g"><span className="label az-l" data-az-letter={grp.letter}>{grp.letter}</span></div>
            <div className="rows end ans-list">
              {grp.rows.map((r) => <TopicRow key={r.id} row={r} onOpen={() => open(r)} />)}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

/** What Back says on a page opened from the home: the commandment whose sheet was open, else Answers. */
export function answersHomeTitle(r) {
  return (r && r.cmd != null && commandmentName(r.cmd)) || 'Answers';
}

definePlace('answers', { Screen: AnswersHome, contentClass: 'content ans', title: answersHomeTitle });
definePlace('answers/subject', {
  Screen: AnswersSubjectScreen, contentClass: 'content ans', title: (r) => subjectTitle(r.subject) || 'Answers',
});
definePlace('answers/a-z', { Screen: AnswersAZScreen, contentClass: 'content ans', title: () => 'Every Topic, A–Z' });
