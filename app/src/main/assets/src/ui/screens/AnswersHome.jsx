/* ═══════════════════════════════════════════════════════════════════════
   AnswersHome — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   Answers Only God Can Give (answersonlygodcangive.com, vendored as
   src/data/answers.js). Three screens share this file:

     answers-home     the landing: the "What does The Lord say about…" box,
                      the Ten Commandments tablets, the nine subjects
     answers-subject  one subject's topics (the route passes letterId as the
                      subject id)
     answers-az       every topic, A–Z

   A topic itself opens in WtlbEntryView (answers-entry). The routes hand
   each screen `entries` (ANSWERS) only once the lazy corpus has landed.

   The landing keeps its query and its open commandment in module memory,
   so Back from a topic returns to the same results or the same tablet.
   Entering from the Home card clears it (resetAnswersLanding).
   ═══════════════════════════════════════════════════════════════════════ */

import {
  ANSWERS_COMMANDMENTS, ANSWERS_SUBJECTS, answersCommandmentTopics,
  answersPassageCount, answersShortTitle, answersSortKey, answersIndexLetter, isAttribution,
  answersSubjectById, answersFiledUnder,
} from '../../utils/answers-shelves.js';
import { buildAnswersIndex, searchAnswers, answersSnippet } from '../../utils/answers-search.js';

let _landing = { query: '', sheetN: /** @type {number | null} */ (null) };
export function resetAnswersLanding() { _landing = { query: '', sheetN: null }; }


/** Up to two of a subject's most-spoken topics for its tile — short, and with no
 *  comma or trailing "..." of their own to muddle the list they sit in. */
function tileExamples(topics) {
  const ranked = topics.slice().sort(byPassagesDesc).map((e) => answersShortTitle(e.title));
  const fit = ranked.slice(0, 5).filter((t) => t.length <= 22 && !/,|\.\.\.|…/.test(t)).slice(0, 2);
  return fit.length ? fit : ranked.slice(0, 1);
}

function byPassagesDesc(a, b) {
  return answersPassageCount(b) - answersPassageCount(a) || answersSortKey(a.title).localeCompare(answersSortKey(b.title));
}

function useEntryMap(entries) {
  return React.useMemo(() => new Map((entries || []).map((e) => [e.id, e])), [entries]);
}

function Ornament() {
  return (
    <div className="home-ornament">
      <div className="home-ornament-line" />
      <div className="home-ornament-diamond" />
      <div className="home-ornament-line r" />
    </div>
  );
}

/**
 * A label row: CINZEL LABEL · italic count on the right.
 * @param {{ children?: any, count?: any }} props
 */
function ShelfLabel({ children, count }) {
  return (
    <div className="genre-col-label answers-label">
      <span>{children}</span>
      {count ? <span className="answers-label-count">{count}</span> : null}
    </div>
  );
}

/**
 * One topic in a list: short title (plus the site's full title when asked), passages, ›.
 * @param {{ key?: any, entry: any, count?: number, showFull?: boolean, onOpen: () => void }} props
 */
function TopicRow({ entry, count, showFull, onOpen }) {
  const short = answersShortTitle(entry.title);
  const n = count != null ? count : answersPassageCount(entry);
  return (
    <button type="button" className="answers-topic-row" onClick={onOpen}>
      <span className="answers-topic-text">
        <span className="answers-topic-title">{short}</span>
        {showFull && short !== entry.title ? <span className="answers-topic-full">{entry.title}</span> : null}
      </span>
      {n > 0 ? <span className="answers-topic-count" aria-label={n === 1 ? '1 passage' : `${n} passages`}>{n}</span> : null}
      <span className="answers-topic-arrow" aria-hidden="true">›</span>
    </button>
  );
}

/** @param {{ cmd: any, topics: any[], onOpenTopic: Function, onGoToRef?: Function, onDismiss: () => void }} props */
function CommandmentSheet({ cmd, topics, onOpenTopic, onGoToRef, onDismiss }) {
  React.useEffect(() => {
    const prev = window.__closeSheet;
    window.__closeSheet = onDismiss;
    return () => { window.__closeSheet = prev || null; };
  }, [onDismiss]);
  const trapRef = useFocusTrap(true);
  // The verse as books.js carries it opens a quotation it closes several
  // verses later; set alone, the marks are dropped rather than left unpaired.
  const verse = cmd.verse.replace(/^“/, '').replace(/”$/, '');
  const total = topics.reduce((a, e) => a + answersPassageCount(e), 0);
  return ReactDOM.createPortal(
    <>
      <div className="select-sheet-backdrop open" aria-hidden="true" onClick={onDismiss} />
      <div className="select-sheet answers-sheet" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="answers-cmd-title" onClick={(e) => e.stopPropagation()}>
        <SheetHandle onClose={onDismiss} />
        <div className="select-sheet-eyebrow">The {cmd.ordinal} Commandment</div>
        <div className="select-sheet-title" id="answers-cmd-title">{cmd.label}</div>
        <div className="select-sheet-ornament">
          <div className="select-sheet-ornament-line" />
          <div className="select-sheet-ornament-diamond">{'✦'}</div>
          <div className="select-sheet-ornament-line r" />
        </div>
        <blockquote className="answers-sheet-verse">
          <p>{verse}</p>
          {onGoToRef
            ? <button type="button" className="answers-sheet-ref" onClick={() => onGoToRef(cmd.ref)}>{cmd.ref}</button>
            : <span className="answers-sheet-ref">{cmd.ref}</span>}
        </blockquote>
        <ShelfLabel count={total > 0 ? `${total} passages` : null}>{topics.length === 1 ? '1 topic' : `${topics.length} topics`}</ShelfLabel>
        <div className="answers-topic-list" data-autofocus>
          {topics.map((e) => (
            <TopicRow key={e.id} entry={e} showFull onOpen={() => onOpenTopic(e.id, null, 'Commandment ' + cmd.numeral)} />
          ))}
        </div>
      </div>
    </>,
    document.body
  );
}

/** @param {{ range: string, rows: any[], entries: any[], onPick: (n: number) => void }} props */
function Tablet({ range, rows, entries, onPick }) {
  return (
    <div className="answers-tablet">
      <div className="answers-tablet-range" aria-hidden="true">{range}</div>
      {rows.map((c) => {
        const n = answersCommandmentTopics(entries, c.n).length;
        return (
          <button key={c.n} type="button" className="answers-tablet-row" onClick={() => onPick(c.n)}
            aria-label={`Commandment ${c.numeral}: ${c.label}. ${n === 1 ? '1 topic' : n + ' topics'}`}>
            <span className="answers-tablet-numeral">{c.numeral}</span>
            <span className="answers-tablet-label">{c.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** @param {{ segs: { text: string, hit: boolean }[] }} props */
function HitSnippet({ segs }) {
  return (
    <span className="answers-hit-snippet">
      {segs.map((s, i) => (s.hit ? <mark key={i} className="answers-hit-mark">{s.text}</mark> : <React.Fragment key={i}>{s.text}</React.Fragment>))}
    </span>
  );
}

/** "From “Pentecost” ~ Volume 6" for the passage that starts at paragraph `from`. */
function attributionAfter(entry, from) {
  const paras = (entry && entry.paragraphs) || [];
  for (let i = Math.max(0, from); i < paras.length; i++) {
    const t = paras[i] && paras[i].text;
    if (isAttribution(t)) return t.replace(/^~ \[/, '').replace(/\]$/, '');
  }
  return '';
}

const MENTIONS_SHOWN = 8;

/** @param {{ results: any, query: string, onOpenTopic: Function, onSearchLibrary?: Function }} props */
function AnswersResults({ results, query, onOpenTopic, onSearchLibrary }) {
  const [allMentions, setAllMentions] = React.useState(false);
  React.useEffect(() => { setAllMentions(false); }, [query]);
  const { topics, mentions, mentionPassages, words } = results;
  const open = (row, from) => onOpenTopic(row.entry.id, row.firstPara >= 0 ? row.entry.paragraphs[row.firstPara].text : null, from);
  const shown = allMentions ? mentions : mentions.slice(0, MENTIONS_SHOWN);
  const q = query.trim();
  if (!topics.length && !mentions.length) {
    return (
      <div className="answers-results" role="status">
        <p className="answers-empty">Nothing in Answers speaks of “{q}”.</p>
        {onSearchLibrary && (
          <button type="button" className="answers-more" onClick={() => onSearchLibrary(q)}>Search the whole library for “{q}”</button>
        )}
      </div>
    );
  }
  return (
    <div className="answers-results">
      {topics.length > 0 && (
        <section className="answers-section" aria-label="Matching topics">
          <ShelfLabel>{topics.length === 1 ? 'The topic' : 'Topics'}</ShelfLabel>
          {topics.map((t, i) => {
            const n = answersPassageCount(t.entry);
            const filed = answersFiledUnder(t.entry);
            const snipText = t.firstText || t.leadText;
            const snipPara = t.firstPara >= 0 ? t.firstPara : t.leadPara;
            const snippet = i === 0 && snipText ? answersSnippet(snipText, words) : null;
            const source = i === 0 && snipPara >= 0 ? attributionAfter(t.entry, snipPara) : '';
            return (
              <button key={t.entry.id} type="button" className="answers-hit-card" onClick={() => open(t, 'Answers')}>
                <span className="answers-hit-head">
                  <span className="answers-hit-text">
                    <span className="answers-hit-eyebrow">{[filed, n > 0 ? (n === 1 ? '1 passage' : `${n} passages`) : ''].filter(Boolean).join(' · ')}</span>
                    <span className="answers-hit-title">{t.short}</span>
                  </span>
                  <span className="answers-topic-arrow" aria-hidden="true">›</span>
                </span>
                {snippet && <HitSnippet segs={snippet} />}
                {source && <span className="answers-hit-source">{source}</span>}
              </button>
            );
          })}
        </section>
      )}
      {mentions.length > 0 && (
        <section className="answers-section" aria-label="Topics whose passages mention it">
          <ShelfLabel>{topics.length ? 'Also spoken of in' : 'Spoken of in'}</ShelfLabel>
          <p className="answers-hit-summary" role="status">
            {mentionPassages === 1 ? '1 passage' : `${mentionPassages} ${topics.length ? 'more ' : ''}passages`}, across {mentions.length === 1 ? '1 topic' : `${mentions.length} topics`}
          </p>
          <div className="answers-topic-list">
            {shown.map((m) => (
              <TopicRow key={m.entry.id} entry={m.entry} count={m.hits} onOpen={() => open(m, 'Answers')} />
            ))}
          </div>
          {!allMentions && mentions.length > MENTIONS_SHOWN && (
            <button type="button" className="answers-more" onClick={() => setAllMentions(true)}>
              {mentions.length - MENTIONS_SHOWN} more {mentions.length - MENTIONS_SHOWN === 1 ? 'topic' : 'topics'}
            </button>
          )}
        </section>
      )}
    </div>
  );
}

/** @param {{ onBack: Function, backLabel: string, onSettings?: Function, onHistory?: Function, onSearch?: Function, theme?: any, onThemeChange?: Function, showHome?: boolean }} opts */
function answersNav({ onBack, backLabel, onSettings, onHistory, onSearch, theme, onThemeChange, showHome }) {
  return LibraryNav({ onBack, backLabel, showHome, onSettings, onHistory, onSearch, theme, onThemeChange });
}

/**
 * @param {{ entries: any[], onBack: () => void, onSearch?: any, onHistory?: any, onSettings?: any, theme?: any,
 *   onThemeChange?: any, onOpenTopic: Function, onOpenSubject: (id: string) => void, onOpenAZ: () => void,
 *   onSearchLibrary?: (q: string) => void, onGoToRef?: (ref: string) => void }} props
 */
export function AnswersHome({ entries, onBack, onSearch, onHistory, onSettings, theme, onThemeChange, onOpenTopic, onOpenSubject, onOpenAZ, onSearchLibrary, onGoToRef }) {
  const [query, setQuery] = React.useState(_landing.query);
  const [sheetN, setSheetN] = React.useState(_landing.sheetN);
  React.useEffect(() => { _landing = { query, sheetN }; }, [query, sheetN]);
  const deferredQuery = React.useDeferredValue(query);
  const index = React.useMemo(() => buildAnswersIndex(entries), [entries]);
  const results = React.useMemo(() => (deferredQuery.trim().length >= 2 ? searchAnswers(index, deferredQuery) : null), [index, deferredQuery]);
  const cmdTopicCount = ANSWERS_COMMANDMENTS.reduce((a, c) => a + answersCommandmentTopics(entries, c.n).length, 0);
  const byId = useEntryMap(entries);
  const subjectTopicTotal = ANSWERS_SUBJECTS.reduce((a, s) => a + s.topics.filter((id) => byId.has(id)).length, 0);
  const cmd = sheetN != null ? ANSWERS_COMMANDMENTS.find((c) => c.n === sheetN) : null;
  const closeSheet = React.useCallback(() => setSheetN(null), []);
  // Back with a query typed clears the query before it leaves the screen.
  React.useEffect(() => {
    if (!query) return undefined;
    const fn = () => { setQuery(''); return true; };
    window.__screenBack = fn;
    return () => { if (window.__screenBack === fn) window.__screenBack = null; };
  }, [query]);
  const handleNavBack = () => { if (query) setQuery(''); else onBack(); };

  return (
    <ScreenLayout navChildren={answersNav({ onBack: handleNavBack, backLabel: query ? 'Answers' : 'Home', showHome: false, onSettings, onHistory, onSearch, theme, onThemeChange })}>
      <div className="home-screen volumes-landing answers-landing">
        <div className="home-eyebrow">Topics &amp; Doctrines</div>
        <h1 className="home-title">Answers Only God Can Give</h1>
        <p className="home-sub">The Lord sets the record straight concerning a variety of topics, doctrines and traditions</p>
        <Ornament />
        <div className="answers-ask" role="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m17 17 4 4" /></svg>
          <label htmlFor="answers-ask-input" className="sr-only">Search the topics</label>
          <input
            id="answers-ask-input"
            className="answers-ask-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What does The Lord say about…"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {query ? (
            <button type="button" className="answers-ask-clear" onClick={() => setQuery('')} aria-label="Clear the search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          ) : null}
        </div>

        {results ? (
          <AnswersResults results={results} query={deferredQuery} onOpenTopic={onOpenTopic} onSearchLibrary={onSearchLibrary} />
        ) : (
          <>
            <section className="answers-section" aria-label="The Ten Commandments">
              <ShelfLabel count={`${cmdTopicCount} topics`}>The Ten Commandments</ShelfLabel>
              <div className="answers-tablets">
                <Tablet range="I – V" rows={ANSWERS_COMMANDMENTS.slice(0, 5)} entries={entries} onPick={setSheetN} />
                <Tablet range="VI – X" rows={ANSWERS_COMMANDMENTS.slice(5)} entries={entries} onPick={setSheetN} />
              </div>
            </section>
            <section className="answers-section" aria-label="Browse by subject">
              <ShelfLabel count={`${subjectTopicTotal} topics`}>Browse by subject</ShelfLabel>
              <div className="genre-columns answers-subjects">
                {ANSWERS_SUBJECTS.map((s) => {
                  const topics = s.topics.map((id) => byId.get(id)).filter(Boolean);
                  const examples = tileExamples(topics);
                  return (
                    <button key={s.id} type="button" className="genre-tile answers-subject-tile" onClick={() => onOpenSubject(s.id)}>
                      <div className="genre-tile-title">{s.title}</div>
                      <div className="genre-tile-sub">{`${topics.length} topics · ${examples.join(', ')}…`}</div>
                    </button>
                  );
                })}
                <button type="button" className="genre-tile answers-subject-tile answers-az-tile" onClick={onOpenAZ}>
                  <div className="genre-tile-title">Every Topic, A–Z</div>
                  <div className="genre-tile-sub">{`All ${(entries || []).length} in one list`}</div>
                </button>
              </div>
            </section>
            <p className="answers-source">Gathered from answersonlygodcangive.com.<br />Every passage opens the letter it came from.</p>
          </>
        )}
      </div>
      {cmd && (
        <CommandmentSheet
          cmd={cmd}
          topics={answersCommandmentTopics(entries, cmd.n).slice().sort(byPassagesDesc)}
          onOpenTopic={onOpenTopic}
          onGoToRef={onGoToRef}
          onDismiss={closeSheet}
        />
      )}
    </ScreenLayout>
  );
}

export function AnswersSubject({ entries, subjectId, onBack, onSearch, onHistory, onSettings, theme, onThemeChange, onOpenTopic }) {
  const subject = answersSubjectById(subjectId);
  const byId = useEntryMap(entries);
  const topics = subject ? subject.topics.map((id) => byId.get(id)).filter(Boolean).sort(byPassagesDesc) : [];
  const total = topics.reduce((a, e) => a + answersPassageCount(e), 0);
  const title = subject ? subject.title : 'Answers';
  return (
    <ScreenLayout navChildren={answersNav({ onBack, backLabel: 'Answers', onSettings, onHistory, onSearch, theme, onThemeChange })}>
      <div className="home-screen volumes-landing answers-landing">
        <div className="home-eyebrow">Answers Only God Can Give</div>
        <h1 className="home-title">{title}</h1>
        <p className="home-sub">{`${topics.length} topics · ${total} passages`}</p>
        <Ornament />
        <section className="answers-section" aria-label={title}>
          <ShelfLabel count="Passages">Most spoken of first</ShelfLabel>
          <div className="answers-topic-list">
            {topics.map((e) => <TopicRow key={e.id} entry={e} onOpen={() => onOpenTopic(e.id, null, title)} />)}
          </div>
        </section>
      </div>
    </ScreenLayout>
  );
}

export function AnswersAZ({ entries, onBack, onSearch, onHistory, onSettings, theme, onThemeChange, onOpenTopic }) {
  const groups = React.useMemo(() => {
    const sorted = (entries || []).slice().sort((a, b) => answersSortKey(a.title).localeCompare(answersSortKey(b.title)));
    const out = [];
    for (const e of sorted) {
      const L = answersIndexLetter(e.title);
      if (!out.length || out[out.length - 1].letter !== L) out.push({ letter: L, entries: [] });
      out[out.length - 1].entries.push(e);
    }
    return out;
  }, [entries]);
  const total = (entries || []).reduce((a, e) => a + answersPassageCount(e), 0);
  const listRef = React.useRef(null);
  // A letter jump is the reader's own tap: scrollIntoView moves the page the
  // way a finger would, and nothing else is writing to it on this screen.
  const jump = (L) => {
    const el = listRef.current && listRef.current.querySelector(`[data-az-letter="${L}"]`);
    if (el) el.scrollIntoView({ block: 'start' });
  };
  return (
    <ScreenLayout navChildren={answersNav({ onBack, backLabel: 'Answers', onSettings, onHistory, onSearch, theme, onThemeChange })}>
      <div className="home-screen volumes-landing answers-landing">
        <div className="home-eyebrow">Answers Only God Can Give</div>
        <h1 className="home-title">Every Topic, A–Z</h1>
        <p className="home-sub">{`${(entries || []).length} topics · ${total} passages`}</p>
        <Ornament />
        <nav className="answers-az-jump" aria-label="Jump to a letter">
          {groups.map((g) => (
            <button key={g.letter} type="button" onClick={() => jump(g.letter)} aria-label={g.letter === '#' ? 'Numbers' : g.letter}>{g.letter}</button>
          ))}
        </nav>
        <div className="answers-az-list" ref={listRef}>
          {groups.map((g) => (
            <section key={g.letter} className="answers-section" aria-label={g.letter === '#' ? 'Numbers' : g.letter}>
              <div className="answers-az-letter" data-az-letter={g.letter}>{g.letter}</div>
              <div className="answers-topic-list">
                {g.entries.map((e) => <TopicRow key={e.id} entry={e} onOpen={() => onOpenTopic(e.id, null, 'Every Topic, A–Z')} />)}
              </div>
            </section>
          ))}
        </div>
      </div>
    </ScreenLayout>
  );
}
