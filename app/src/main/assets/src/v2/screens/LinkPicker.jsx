/* LinkPicker - "Link to a passage" (mw8, v2-gaps 24; design dz22 4d-4f; main's LinkPicker, VersePickerScreen and
   LetterExcerptPickerScreen): a tall sheet on the phone, a dialog with a Close x on the laptop. "Linking from" the
   paragraph (main's 90-character quote), then Search | Browse | Recent:
   - Search: main's title search (Titles and references: a reference first, then names) or its text search (Words in
     the text, main's engine; then All | Scriptures | Volumes). A verse links at once; a chapter or a letter opens first;
   - Browse: the library in Home's order and v2's names and counts; a book opens its chapters as numbers, a collection
     its letters as rows, each level under a back arrow and its name;
   - Recent: main's newest links as From / To pairs; either end links that place again as it was.
   A chapter's or a letter's words: a verse number (a 44 px target, picked in the click handler) takes the verse whole;
   pressing and dragging chooses words (the system's own selection, washed gold). The footer says what it links.
   Linking is the letter screen's (onLinked); a gate boot draws its row's state and does nothing. */
import { Icon } from '../Icon.jsx';
import { Sheet } from '../Sheet.jsx';
import { findPlaces, placeRow, targetOf, sourceQuote, makeLink, snapWords, verseTarget, wordsTarget, testamentOf, nav } from '../links.js';
import { BOOK_LIST } from '../bible-facts.js';
import { VOLUMES, MORE_LETTERS, colOf } from '../home-facts.js';
import { displayText } from '../marks.js';
import { useBook } from './BibleChapterScreen.jsx';
import { LetterBody, footnoteNear } from './LetterScreen.jsx';

const g = /** @type {any} */ (globalThis);

/** main's three ways to find a place (its tabs), in its order. */
export const TABS = [{ id: 'search', label: 'Search' }, { id: 'browse', label: 'Browse' }, { id: 'recent', label: 'Recent' }];
/** main's text-search corpora (the engine's own `corpus` values). */
export const CORPORA = [{ id: 'all', label: 'All' }, { id: 'scriptures', label: 'Scriptures' }, { id: 'volumes', label: 'Volumes' }];
/** Target kinds whose words open first (main's excerpt picker). */
const WORDS_KINDS = ['letter', 'wtlb', 'blessed', 'holy-days', 'study-letter'];

/**
 * @typedef {{ kind: 'books' | 'matthew' | 'chapters' | 'letters' | 'verses' | 'words' } & Record<string, any>} Level
 *   a list (books, Matthew's or a book's chapters, a collection's letters: `title`, `rows`) or the words of `item` / `target`
 * @typedef {{ endpoint: any, title: string, text: string }} Source
 */

/** A segmented control's or a chip's press props (Enter and Space too). */
function pressProps(fn) {
  return { tabIndex: 0, onClick: fn, onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } } };
}

/** The reader's edition (main's readerTranslation): the text search's index is the one Search builds. */
function readerTranslation() {
  try {
    const s = g.StateStore && typeof g.StateStore.get === 'function' ? g.StateStore.get() : null;
    return (s && s.settings && s.settings.translation) || 'nkjv';
  } catch (_e) { return 'nkjv'; }
}

/** main's recent picks (RecentNavStore), as Places rows. */
function recentPicks() {
  const R = g.RecentNavStore;
  try { return R && typeof R.list === 'function' ? (R.list() || []).filter((it) => it && it.kind).map(placeRow) : []; } catch (_e) { return []; }
}

/** main's newest links, newest first (its Recent tab). */
function recentLinks() {
  const L = g.LinkStore;
  if (!L || typeof L.all !== 'function') return [];
  return (L.all() || []).filter((l) => l && l.source && l.target).slice().sort((a, b) => (b.created || 0) - (a.created || 0)).slice(0, 25);
}

/**
 * The library's top level in Home's order (4e): the Bible, the Study Bible, the seven volumes, the other letters, the
 * studies; v2's names and its own counts (a collection's letters once loaded, else main's index's).
 */
export function libraryRows(tree, gl = g) {
  // the Study Bible's 28 chapters are known before its file loads; its grid comes from main's index once it has
  const rows = [{ id: 'bible', t: 'The Scriptures of Truth', s: BOOK_LIST.length + ' books', open: { kind: 'books' } },
    { id: 'matthew', t: 'Matthew Study Bible', s: (matthewChapters(tree).length || MATTHEW_CHAPTERS) + ' chapters', open: { kind: 'matthew' } }];
  for (const key of VOLUMES.map((v) => v.key).concat(MORE_LETTERS)) {
    const col = colOf(key, gl);
    // main's index files Holy Days under that name, every other collection under its label (nav-index.js)
    const name = col ? (col.volKey === 'holydays' ? 'Holy Days' : col.label) : '';
    const group = col ? tree.collections.find((c) => c.label === name) : null;
    if (!group || !group.entries.length) continue;
    const loaded = Array.isArray(gl[col.globalName]) ? gl[col.globalName].length : group.entries.length;
    rows.push({ id: key, t: col.label, s: loaded + (/^vot-/.test(col.letterScreen || '') ? ' letters' : ' entries'),
      open: { kind: 'letters', title: col.label, rows: group.entries } });
  }
  for (const st of tree.studies) {
    rows.push({ id: 'study:' + st.label, t: st.label, s: st.chapters.length + ' chapters', open: { kind: 'letters', title: st.label, rows: st.chapters } });
  }
  return rows;
}

/** Matthew's chapters in the Study Bible. */
const MATTHEW_CHAPTERS = 28;

/** The Study Bible's chapters in main's index (its chapter items, not its verse items). */
function matthewChapters(tree) {
  return tree.matthewChapters.filter((c) => c.verse == null);
}

/** The verses of a Bible chapter (main's sections) or a Matthew study chapter, with the headings between them. */
function chapterVerses(book, target) {
  if (target.type === 'study') {
    const M = typeof g._matthew === 'function' ? g._matthew() : null;
    const ch = M && M.chapters ? M.chapters.find((c) => c.num === target.chapter) : null;
    return ch ? [{ heading: '', verses: ch.verses || [] }] : null;
  }
  const ch = book && book.chapters ? book.chapters.find((c) => c.num === target.chapter) : null;
  return ch ? (ch.sections || []).map((s) => ({ heading: s.heading || '', verses: s.verses || [] })) : null;
}

/** The letter (or entry, or study chapter) a target names, from main's index of entries. */
function entryOf(target) {
  const id = target.letterId || target.entryId || target.studyChapterId;
  if (!id || typeof g.findEntryContext !== 'function') return null;
  try {
    const ctx = g.findEntryContext(id, String(target.key || '').split(':')[0]);
    return ctx ? ctx.entry || null : null;
  } catch (_e) { return null; }
}

/** A verse taken whole (main's handleVerseTap), or null when the chapter has no such verse. */
function wholeVerse(verses, n) {
  const v = verses.find((x) => x.n === n);
  return v ? { v1: n, v2: n, start: 0, end: (v.text || '').length, text: v.text || '', whole: true } : null;
}

/** The verse picked by a tap: its number within its 44 px square. @param {Element | null} root */
function verseAt(root, e) {
  const t = /** @type {Element} */ (e.target);
  const own = t && t.closest ? t.closest('.vn') : null;
  return own || footnoteNear(root, e.clientX, e.clientY, undefined, '.vn');
}

/**
 * The words the system's selection holds inside `root`: for verses, the verse numbers it starts and ends in and its
 * characters within those verses' words; for a letter, the block it starts in (main keeps an excerpt to one block) and
 * its characters there, pulled in to whole words. Null when nothing (or nothing here) is chosen.
 * @param {Element} root @param {'verses' | 'words'} kind
 */
export function selectionPick(root, kind, sel = typeof window.getSelection === 'function' ? window.getSelection() : null) {
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  const el = (n) => /** @type {Element | null} */ (n.nodeType === 3 ? n.parentElement : n);
  const offsetIn = (box, node, off) => {
    const r = document.createRange();
    r.selectNodeContents(box);
    try { r.setEnd(node, off); } catch (_e) { return 0; }
    return r.toString().length;
  };
  if (kind === 'verses') {
    const a = el(range.startContainer);
    const b = el(range.endContainer);
    const p1 = a && a.closest('[data-verse]');
    const p2 = b && b.closest('[data-verse]');
    if (!p1 || !p2 || !root.contains(p1) || !root.contains(p2)) return null;
    const w1 = p1.querySelector('.vw');
    const w2 = p2.querySelector('.vw');
    if (!w1 || !w2) return null;
    const t1 = w1.textContent || '';
    const t2 = w2.textContent || '';
    const inWords1 = w1.contains(range.startContainer);
    const start = snapWords(t1, inWords1 ? offsetIn(w1, range.startContainer, range.startOffset) : 0, t1.length).start;
    const end = snapWords(t2, 0, w2.contains(range.endContainer) ? offsetIn(w2, range.endContainer, range.endOffset) : t2.length).end;
    const text = String(sel).replace(/^\s*\d+\s*/, '').trim();
    if (!text) return null;
    return { v1: Number(p1.getAttribute('data-verse')), v2: Number(p2.getAttribute('data-verse')), start, end, text };
  }
  const a = el(range.startContainer);
  const block = a && a.closest('[data-hl-key]');
  if (!block || !root.contains(block)) return null;
  const full = block.textContent || '';
  const raw = offsetIn(block, range.startContainer, range.startOffset);
  const len = block.contains(range.endContainer) ? offsetIn(block, range.endContainer, range.endOffset) - raw : full.length - raw;
  const { start, end } = snapWords(full, raw, raw + len);
  if (end <= start) return null;
  const text = displayText(block, start, end).trim();
  return text ? { block: block.getAttribute('data-hl-key') || '', start, end, text } : null;
}

/**
 * @param {{ source: Source, desktop?: boolean, gate?: any, onLinked: (made: { link: any, fresh: boolean }, target: any) => void,
 *   onClose: () => void, onShown?: () => void }} props
 *   gate: the row's picker state ({ tab, q, scope, places, level, pick, scrollTo }), drawn as it is and inert; onShown
 *   says (on a gate boot) that its picture is drawn
 */
export function LinkPicker({ source, desktop = false, gate = null, onLinked, onClose, onShown }) {
  const [tab, setTab] = React.useState(gate ? gate.tab || 'search' : 'search');
  const [q, setQ] = React.useState(gate ? gate.q || '' : '');
  const [scope, setScope] = React.useState(gate ? gate.scope || 'titles' : 'titles');
  const [corpus, setCorpus] = React.useState('all');
  const [levels, setLevels] = React.useState(/** @type {Level[]} */ (gate && gate.level ? [gate.level] : []));
  const [ver, setVer] = React.useState(0);
  const inputRef = React.useRef(/** @type {HTMLInputElement | null} */ (null));
  const level = levels.length ? levels[levels.length - 1] : null;

  // The places come from main's corpora: ask for them, and look again as each lands (main's index re-derives).
  React.useEffect(() => {
    if (gate) return undefined;
    let live = true;
    const loads = ['__loadBibleCorpus', '__loadVotCorpus', '__loadMatthewCorpus', '__loadAnswersCorpus', 'loadBibleStudies'].map((f) =>
      (typeof g[f] === 'function' ? Promise.resolve().then(() => g[f]()).catch(() => {}) : Promise.resolve()));
    loads.forEach((p) => p.then(() => { if (live) setVer((v) => v + 1); }));
    return () => { live = false; };
  }, [gate]);
  React.useEffect(() => {
    if (gate || desktop) return undefined;
    const t = setTimeout(() => { if (inputRef.current && !level) inputRef.current.focus(); }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the field takes the keyboard once, when the picker opens
  }, []);

  // a gate's picture is drawn at once, unless it shows words, which say so themselves once their text is there
  React.useEffect(() => {
    if (gate && onShown && !(level && (level.kind === 'verses' || level.kind === 'words'))) onShown();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as the picker opens
  }, []);

  const link = (target) => {
    if (gate || !target) return;
    const made = makeLink(source.endpoint, target);
    if (made) onLinked(made, target);
  };
  /** A place chosen: a verse links at once, a chapter or a letter opens its words first (main's createLinkTo). */
  const choose = (item) => {
    if (gate || !item) return;
    const target = targetOf(item);
    if (!target) return;
    try { if (g.RecentNavStore && typeof g.RecentNavStore.add === 'function') g.RecentNavStore.add(item); } catch (_e) { /* best effort */ }
    if ((target.type === 'bible' || target.type === 'study') && target.verse == null) setLevels((l) => l.concat([{ kind: 'verses', item, target }]));
    else if (WORDS_KINDS.includes(target.type)) setLevels((l) => l.concat([{ kind: 'words', item, target }]));
    else link(target);
  };
  const push = (lv) => { if (!gate) setLevels((l) => l.concat([lv])); };
  const back = () => { if (!gate) setLevels((l) => l.slice(0, -1)); };

  let body;
  if (level && (level.kind === 'verses' || level.kind === 'words')) {
    body = <Words level={level} source={source} desktop={desktop} gate={gate} onBack={back} onLink={link} onShown={onShown} />;
  } else if (level) {
    body = (
      <>
        <LevelHead title={level.kind === 'books' ? 'The Scriptures of Truth' : level.kind === 'matthew' ? 'Matthew Study Bible' : level.title} onBack={back} />
        <div className="lkb lkl2">
          {level.kind === 'chapters' || level.kind === 'matthew' ? (
            <div className="chgrid num">
              {(level.kind === 'matthew' ? matthewChapters(navTree()).map((c) => ({ n: c.chapter, item: c })) : level.rows).map((r) => (
                <button key={r.n} type="button" className="ch" onClick={() => choose(r.item)}>{r.n}</button>
              ))}
            </div>
          ) : (
            <div className="lkrows">
              {level.kind === 'books' ? BOOK_LIST.map((b) => (
                <button key={b.id} type="button" className="srow" onClick={() => push({ kind: 'chapters', title: b.title,
                  rows: Array.from({ length: b.chapters }, (_x, i) => ({ n: i + 1, item: chapterItem(b, i + 1) })) })}>
                  <span className="tx"><span className="t">{b.title}</span><span className="s">{b.chapters + (b.chapters === 1 ? ' chapter' : ' chapters')}</span></span>
                  <span className="chev"><Icon name="chev" /></span>
                </button>
              )) : level.rows.map((it, i) => (
                <button key={i} type="button" className="srow" onClick={() => choose(it)}>
                  <span className="tx"><span className="t">{it.label}</span></span>
                  <span className="chev"><Icon name="chev" /></span>
                </button>
              ))}
            </div>
          )}
        </div>
      </>
    );
  } else {
    body = (
      <>
        <div className="sh">Link to a passage</div>
        <div className="lkf">
          <span className="overline">Linking from</span>
          <div className="lkft">{source.title}</div>
          <div className="lkfq">{sourceQuote(source.text)}</div>
        </div>
        <div className="seg lkt" role="tablist" aria-label="How to find it">
          {TABS.map((t) => (
            <span key={t.id} role="tab" aria-selected={t.id === tab} className={t.id === tab ? 'on' : undefined}
              {...pressProps(() => { if (!gate) setTab(t.id); })}>{t.label}</span>
          ))}
        </div>
        <div className="lkb">
          {tab === 'search' ? <SearchTab q={q} setQ={setQ} scope={scope} setScope={setScope} corpus={corpus} setCorpus={setCorpus}
            gate={gate} inputRef={inputRef} ver={ver} onChoose={choose} />
            : tab === 'browse' ? <BrowseRows gate={gate} ver={ver} onOpen={push} />
            : <RecentTab gate={gate} onReuse={(ep) => link({ ...ep })} />}
        </div>
      </>
    );
  }
  return (
    <Sheet kind={'lkp' + (desktop ? '' : ' tall')} label="Link to a passage" desktop={desktop} closeX onClose={onClose}>
      {body}
    </Sheet>
  );
}

/** main's nav item for a Bible chapter (its Browse grid): what navItemToEndpoint makes a chapter endpoint of. */
function chapterItem(book, n) {
  return { kind: 'bible-chapter', bookId: book.id, chapter: n, label: book.title + ' ' + n, title: book.title, category: testamentOf(book.id) };
}

/** A level's back arrow and name (4f). */
function LevelHead({ title, onBack }) {
  return (
    <div className="lkbk">
      <button type="button" className="ic" aria-label="Back one level" onClick={onBack}><Icon name="arrowL" /></button>
      <div className="sh">{title}</div>
    </div>
  );
}

/** One Places row (4d): the place, its kind, a verse's words; the link icon when one tap links it. */
function PlaceButton({ row, onChoose }) {
  return (
    <button type="button" className="lkr" onClick={() => onChoose(row.item)}>
      <span className="lead"><Icon name={row.icon} /></span>
      <span className="tx">
        <span className="t">{row.t}</span>
        {row.s && <span className="s">{row.s}</span>}
        {row.v && <span className="v">{row.v}</span>}
      </span>
      <Icon name={row.direct ? 'link' : 'chev'} className={row.direct ? '' : 'go'} />
    </button>
  );
}

function SearchTab({ q, setQ, scope, setScope, corpus, setCorpus, gate, inputRef, ver, onChoose }) {
  const query = q.trim();
  const titles = React.useMemo(() => (gate ? (gate.places || []).map((p) => ({ item: null, icon: 'book', direct: true, ...p }))
    : scope === 'titles' ? findPlaces(query) : []),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- ver: look again as a corpus lands
  [gate, scope, query, ver]);
  const hits = useTextHits(gate ? '' : query, scope === 'words', corpus);
  const recent = React.useMemo(() => (gate || query ? [] : recentPicks()), [gate, query]);

  let body;
  if (!query) {
    body = recent.length ? (
      <>
        <span className="label lkl">Recent</span>
        {recent.map((r, i) => <PlaceButton key={i} row={r} onChoose={onChoose} />)}
      </>
    ) : (
      <div className="empty lke">
        <div className="t">Search to link</div>
        <div className="s">Try a title or a reference like “Eph 6:5”, or search the words in the text.</div>
      </div>
    );
  } else if (scope === 'titles') {
    body = titles.length ? (
      <>
        <span className="label lkl">Places</span>
        {titles.map((r, i) => <PlaceButton key={i} row={r} onChoose={onChoose} />)}
        <p className="lkn">A verse links at once. A chapter or a letter opens first, so you can choose its words.</p>
      </>
    ) : (
      <div className="empty lke">
        <div className="t">No titles match</div>
        <button type="button" className="textbtn" onClick={() => setScope('words')}>Search the words instead</button>
      </div>
    );
  } else if (query.length < 3) {
    body = <p className="lkn">Type at least three letters to search the text.</p>;
  } else if (hits === 'building' || hits === null) {
    body = <p className="lkn">{hits === 'building' ? 'Getting the text search ready…' : ''}</p>;
  } else {
    body = hits.length ? (
      <>
        <span className="label lkl">In the text</span>
        {hits.map((r, i) => <PlaceButton key={i} row={r} onChoose={onChoose} />)}
      </>
    ) : <div className="empty lke"><div className="t">Nothing in the text matches</div></div>;
  }
  return (
    <>
      <div className={'field' + (gate && q ? ' focus' : '')}>
        <input ref={inputRef} className="q" type="text" value={q} readOnly={!!gate} aria-label="Search for a place"
          placeholder={scope === 'words' ? 'Search any phrase in the text' : 'Search titles and references'}
          autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search"
          onChange={(e) => setQ(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        {q ? <button type="button" className="clear" aria-label="Clear" onClick={() => { if (!gate) { setQ(''); if (inputRef.current) inputRef.current.focus(); } }}><Icon name="close" /></button>
          : <Icon name="search" />}
      </div>
      <div className="chips lks" role="radiogroup" aria-label="Search in">
        {[{ id: 'titles', label: 'Titles and references' }, { id: 'words', label: 'Words in the text' }].map((c) => (
          <span key={c.id} className={'chip' + (c.id === scope ? ' on' : '')} role="radio" aria-checked={c.id === scope}
            {...pressProps(() => { if (!gate) setScope(c.id); })}>{c.label}</span>
        ))}
      </div>
      {scope === 'words' && (
        <div className="chips lks lkc2" role="radiogroup" aria-label="Search which">
          {CORPORA.map((c) => (
            <span key={c.id} className={'chip' + (c.id === corpus ? ' on' : '')} role="radio" aria-checked={c.id === corpus}
              {...pressProps(() => setCorpus(c.id))}>{c.label}</span>
          ))}
        </div>
      )}
      {body}
    </>
  );
}

/**
 * main's text search for the picker (its "In the text"): the engine on the reader's edition, a quarter second after
 * typing stops, one row per place. null while idle, 'building' while the index is made, else the rows.
 */
function useTextHits(query, on, corpus) {
  const [hits, setHits] = React.useState(/** @type {any} */ (null));
  React.useEffect(() => {
    if (!on || query.length < 3) { setHits(null); return undefined; }
    const E = g.VotSearchMini;
    if (!E) { setHits([]); return undefined; }
    let stale = false;
    const t = setTimeout(() => {
      const translation = readerTranslation();
      const ready = E.getState && E.getState().ready;
      if (!ready) setHits('building');
      Promise.resolve(ready ? null : E.init({ translation })).catch(() => {})
        .then(() => E.search(query, { limit: 60, corpus, translation }))
        .then((res) => {
          if (stale) return;
          const seen = new Set();
          const terms = res && res.parsedTerms && res.parsedTerms.length ? res.parsedTerms : query.split(/\s+/);
          const rows = [];
          for (const r of (res && res.results) || []) {
            const toItem = nav('contentDocToNavItem');
            const item = r && r.doc && toItem ? toItem(r.doc) : null;
            if (!item) continue;
            const k = [item.kind, item.bookId, item.chapter, item.verse, item.letterId || item.entryId, item.studyChapterId].join('|');
            if (seen.has(k)) continue;
            seen.add(k);
            const row = placeRow(item);
            row.v = typeof E.snippet === 'function' ? E.snippet(r.doc.text || '', terms, 110) : '';
            rows.push(row);
            if (rows.length >= 20) break;
          }
          setHits(rows);
        }, () => { if (!stale) setHits([]); });
    }, 250);
    return () => { stale = true; clearTimeout(t); };
  }, [query, on, corpus]);
  return hits;
}

/** Browse's top level (4e). */
function BrowseRows({ gate, ver, onOpen }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- ver: the index re-derives as each corpus lands
  const rows = React.useMemo(() => libraryRows(navTree(), g), [ver]);
  return (
    <div className="lkrows">
      {rows.map((r) => (
        <button key={r.id} type="button" className="srow" onClick={() => { if (!gate) onOpen(r.open); }}>
          <span className="tx"><span className="t">{r.t}</span><span className="s">{r.s}</span></span>
          <span className="chev"><Icon name="chev" /></span>
        </button>
      ))}
    </div>
  );
}

/** main's library tree, or an empty one when its index cannot be built yet. */
function navTree() {
  const build = nav('buildNavTree');
  try { if (build) return build(); } catch (_e) { /* an empty tree below */ }
  return { bibleBooks: [], matthewChapters: [], collections: [], studies: [] };
}

/** Recent (main's): the newest links, either end used again in one tap. */
function RecentTab({ gate, onReuse }) {
  const links = React.useMemo(() => (gate ? [] : recentLinks()), [gate]);
  if (!links.length) {
    return (
      <div className="empty lke">
        <div className="t">No links yet</div>
        <div className="s">Links you make show here, so you can link the same places again in one tap.</div>
      </div>
    );
  }
  return (
    <>
      <p className="lkn lkn0">Tap either end of a link to use that place again.</p>
      {links.map((l) => (
        <div key={l.id} className="lkpair">
          {[['From', l.source], ['To', l.target]].map(([k, ep]) => (
            <button key={k} type="button" className="lkend" onClick={() => onReuse(ep)}>
              <span className="je">{k}</span><span className="t">{ep.label || ''}</span>
            </button>
          ))}
        </div>
      ))}
    </>
  );
}

/**
 * A chapter's or a letter's words (4f, 4g): the back arrow and its name, the hint, the text, the footer.
 * @param {{ level: any, source: Source, desktop: boolean, gate: any, onBack: () => void, onLink: (t: any) => void,
 *   onShown?: () => void }} props
 */
function Words({ level, source, desktop, gate, onBack, onLink, onShown }) {
  const verses = level.kind === 'verses';
  const target = level.target;
  const book = useBook(verses && target.type === 'bible' ? target.bookId : null);
  const boxRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const [chosenPick, setPick] = React.useState(/** @type {any} */ (gate && gate.pick ? gate.pick : null));
  const sections = verses ? chapterVerses(book, target) : null;
  const entry = verses ? null : entryOf(target);
  const flat = sections ? sections.flatMap((s) => s.verses) : [];
  const shown = flat.length;
  // a verse taken whole by number (a gate row names only the number)
  const pick = chosenPick && chosenPick.whole && chosenPick.text == null ? wholeVerse(flat, chosenPick.v1) : chosenPick;
  const bookTitle = target.type === 'study' ? 'Matthew' : (level.item && level.item.title) || (book && book.title) || '';
  const title = verses ? bookTitle + ' ' + target.chapter : (entry && entry.title) || target.label || '';

  // the system's selection, read a moment after it changes (every way one is made fires selectionchange: long-press,
  // the handles, a mouse drag, the keyboard; main's capture)
  React.useEffect(() => {
    if (gate) return undefined;
    let t = null;
    const read = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        const box = boxRef.current;
        const p = box ? selectionPick(box, verses ? 'verses' : 'words') : null;
        if (p) setPick(p);
      }, 150);
    };
    document.addEventListener('selectionchange', read);
    return () => { document.removeEventListener('selectionchange', read); if (t) clearTimeout(t); };
  }, [gate, verses]);
  // the gate's picture: the list scrolled to its verse
  React.useLayoutEffect(() => {
    const box = boxRef.current;
    if (!gate || !gate.scrollTo || !box) return;
    const p = /** @type {HTMLElement | null} */ (box.querySelector('[data-verse="' + gate.scrollTo + '"]'));
    if (p) box.scrollTop = p.offsetTop - box.offsetTop;
  }, [gate, shown]);
  // a gate's picture is drawn once its text is (or once it is known there is none)
  const drawn = verses ? book !== undefined || target.type === 'study' : true;
  React.useEffect(() => { if (gate && onShown && drawn) onShown(); }, [gate, onShown, drawn, shown]);
  // a letter's text is the page's (LetterBody): main's painter must not mark it here
  React.useLayoutEffect(() => {
    const box = boxRef.current;
    if (box) box.querySelectorAll('[data-hl-dom]').forEach((el) => el.removeAttribute('data-hl-dom'));
  });

  const onBoxClick = (e) => {
    if (!verses || gate) return;
    const vn = verseAt(boxRef.current, e);
    if (!vn) return;
    e.preventDefault();
    const whole = wholeVerse(flat, Number(vn.getAttribute('data-n')));
    if (!whole) return;
    setPick(whole);
    try { const sel = window.getSelection(); if (sel && sel.removeAllRanges) sel.removeAllRanges(); } catch (_e) { /* no selection to clear */ }
  };

  const noun = target.type === 'study-letter' ? 'chapter' : target.type === 'letter' ? 'letter' : 'entry';
  const chosen = verses ? (pick ? verseTarget(target, pick, flat, bookTitle) : null) : (pick ? wordsTarget(target, pick) : null);
  const hint = verses
    ? (desktop ? 'Click a verse number for the whole verse, or drag over words.' : 'Tap a verse number for the whole verse, or press and drag over words.')
    : (desktop ? 'Drag over the words you want.' : 'Press and drag over the words you want.');
  const from = source.endpoint && source.endpoint.label ? 'From ' + source.endpoint.label + '. ' : '';
  return (
    <>
      <LevelHead title={title} onBack={onBack} />
      <p className="lkh">{from + hint}</p>
      <div ref={boxRef} className={'lkb ' + (verses ? 'lkv' : 'lkw')} onClick={onBoxClick}>
        {verses ? (sections || []).map((s, i) => (
          <React.Fragment key={i}>
            {s.heading && <h3 className="lkvh">{s.heading}</h3>}
            {s.verses.map((v) => {
              const on = !!(pick && pick.whole && pick.v1 === v.n);
              return (
                <p key={v.n} data-verse={v.n} className={on ? 'sel' : undefined}>
                  <button type="button" className={'vn' + (on ? ' on' : '')} data-n={v.n} aria-label={'Select verse ' + v.n} aria-pressed={on}>{v.n}</button>
                  <span className={'vw' + (on ? ' selw' : '')}>{v.text}</span>
                </p>
              );
            })}
          </React.Fragment>
        )) : entry ? <LetterBody letter={entry} scan={null} /> : null}
      </div>
      <div className="lkfoot">
        <button type="button" className={'pill block' + (chosen ? '' : ' disabled')} disabled={!chosen} onClick={() => { if (chosen) onLink(chosen); }}>
          <span>{chosen ? (verses ? 'Link ' + chosen.label : 'Link these words') : (verses ? 'Choose a verse or some words' : 'Choose some words')}</span>
          <Icon name="link" />
        </button>
        {!verses && <button type="button" className="textbtn lkall" onClick={() => onLink({ ...target })}>{'Link the whole ' + noun}</button>}
      </div>
    </>
  );
}
