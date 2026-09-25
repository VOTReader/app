/*
   AudioSongsScreen -- Songs of the Letters (README §3.2-3.3, L2; pictures
   final-01, final-02, final-07).

   ONE routed screen ('audio-library-songs') drawing the top frame of a small
   stack kept in the tab's audioColKey (utils/songs-route.js): the hub, a
   collection's or shelf's list. Back pops a frame; screen-routes owns the
   stack and the way out.

   Songs are not scripture and not readings (README §1): nothing here gives
   read credit or touches a letter's key. Every sound goes through the one
   player (AudioPlayer.playSongs); every row's ▶ reads the player's state.

   Cluster H (bundle-h.js, lazy) with the rest of the Listening Library. The
   catalog store, the player, the song pieces (cover, round play, clock,
   icons, choice sheet) and the route helpers stay in bundle-d and are read
   here as FREE GLOBALS — one catalog, one player.
*/

import { SongPage } from './SongPage.jsx';
import { ReadWithMusic, readingLetters } from './ReadWithMusic.jsx';

/** The first chips after All, in the pictures' order; the rest go under More. */
const PRIMARY_STYLES = ['worship', 'pop', 'hip-hop', 'cinematic', 'folk'];
/** Rows of "New from the flock" on the hub; See all opens the ten. */
const NEW_ON_HUB = 2;
const NEW_TOTAL = 10;
/** Collection tiles before "Show all": the four with the most songs (Codex critique of U1, picture final-02). */
const TILES_FIRST = 4;
/** The letter collections, in reading order, as tiles under From the letters. */
const LETTER_COLS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'rebuke', 'wtlb1', 'wtlb2', 'blessed', 'flock', 'timothy'];
const SHELVES = [
  { v: 'shelf:inspired', title: 'Inspired by the letters', cols: ['inspired'] },
  { v: 'shelf:bible', title: 'Bible songs', cols: ['bible'] },
  { v: 'shelf:originals', title: 'Flock originals and prayers', cols: ['originals', 'prayers'] },
];

/** @returns {any} the catalog store, or null before bundle-d published it */
function catalog() {
  return typeof SongCatalog !== 'undefined' ? SongCatalog : null;
}

/** @param {any} song @returns {boolean} */
function visible(song) {
  return !!song && !song.hid && !!song.sh;
}

/** Visible songs of a family list, one count. @param {any[]} fams @returns {number} */
function songsIn(fams) {
  const cat = catalog();
  let n = 0;
  for (const fam of fams) n += cat.versionsOf(fam).length;
  return n;
}

/** A collection's label from the registry, or the catalog's own words. @param {string} col */
function colLabel(col) {
  const entry = typeof COL_BY_KEY !== 'undefined' ? COL_BY_KEY.get(col) : null;
  return (entry && entry.label) || col;
}

/**
 * Families of a letter collection in LETTER order (the order the letters are
 * read), then by first-seen date — README §3.2.
 * @param {any[]} fams @param {string} col @returns {any[]}
 */
function letterOrder(fams, col) {
  const entry = typeof COL_BY_KEY !== 'undefined' ? COL_BY_KEY.get(col) : null;
  const letters = entry && typeof colLetterArr === 'function' ? colLetterArr(entry) : [];
  /** @type {Map<string, number>} */
  const at = new Map();
  letters.forEach((l, i) => { if (l && l.id) at.set(col + ':' + l.id, i); });
  const cat = catalog();
  const firstSeen = (fam) => { const s = cat.featuredOf(fam); return (s && s.fs) || ''; };
  return fams.slice().sort((a, b) => {
    const ia = at.has(a.src && a.src.id) ? at.get(a.src.id) : 1e6;
    const ib = at.has(b.src && b.src.id) ? at.get(b.src.id) : 1e6;
    if (ia !== ib) return ia - ib;
    const fa = firstSeen(a), fb = firstSeen(b);
    return fa < fb ? -1 : fa > fb ? 1 : 0;
  });
}

/** The newest visible songs by first-seen date (a tie keeps the later catalog row first). @param {number} n */
function newestSongs(n) {
  const all = catalog().songs();
  const list = [];
  for (let i = all.length - 1; i >= 0; i--) if (visible(all[i])) list.push({ s: all[i], i });
  list.sort((a, b) => (a.s.fs < b.s.fs ? 1 : a.s.fs > b.s.fs ? -1 : b.i - a.i));
  // n3-09: one place per song - a song new in three versions took three
  const seen = new Set();
  const out = [];
  for (const x of list) {
    const fam = x.s.f || x.s.id;
    if (seen.has(fam)) continue;
    seen.add(fam);
    out.push(x.s);
    if (out.length >= n) break;
  }
  return out;
}

/** Saved or recent ids as the songs they name — a hidden duplicate stands in for its kept twin. @param {string[]} ids */
function songsOfIds(ids) {
  const cat = catalog();
  const out = [];
  const seen = new Set();
  for (const id of ids) {
    let s = cat.songById(id);
    if (s && s.hid && s.dup) s = cat.songById(s.dup);
    if (visible(s) && !seen.has(s.id)) { seen.add(s.id); out.push(s); }
  }
  return out;
}

/** Kept ids as songs, hidden ones included (a kept song must stay removable). @param {string[]} ids */
function keptSongs(ids) {
  const cat = catalog();
  const out = [];
  for (const id of ids) { const s = cat.songById(id); if (s) out.push(s); }
  return out;
}

/** The italic line of a single song: its maker, else its shelf. @param {any} song */
function songLine(song) {
  return song.cr || catalog().songAlbumLabel(song);
}

/**
 * What a list frame shows: its words, and either families or single songs.
 * @param {string} v @param {any} library
 * @returns {{ eyebrow: string, title: string, families: any[] | null, songs: any[] | null, empty: string }}
 */
export function listContent(v, library) {
  const cat = catalog();
  if (v === 'saved' || v === 'recent') {
    const ids = library ? (v === 'saved' ? library.songSaved() : library.songRecent()) : [];
    return {
      eyebrow: 'Your songs', title: v === 'saved' ? 'Saved songs' : 'Recently played songs',
      families: null, songs: songsOfIds(ids),
      empty: v === 'saved' ? 'Tap Save on any song and it will wait here.' : 'Songs you play will appear here.',
    };
  }
  if (v === 'kept') {
    // K1: newest kept first. A kept song the catalog has since hidden still shows (so it can be removed); its twin
    // stands in for a hidden duplicate, as on the other shelves.
    const keep = typeof SongKeep !== 'undefined' ? SongKeep : null;
    return {
      eyebrow: 'Your songs', title: 'Kept on this phone', families: null, songs: keep ? keptSongs(keep.keptIds()) : [],
      empty: 'Songs you keep play here with no signal. Tap Keep on a song, a collection or the songs of a letter.',
    };
  }
  if (v === 'new') return { eyebrow: 'New from the flock', title: 'New from the flock', families: null, songs: newestSongs(NEW_TOTAL), empty: 'No songs yet.' };
  if (v.indexOf('letter:') === 0) {
    const key = v.slice(7);
    /** @type {any[]} */
    const fams = [];
    for (const s of cat.songsForLetter(key)) {
      const fam = cat.familyById(s.f);
      if (fam && fams.indexOf(fam) < 0) fams.push(fam);
    }
    const letter = songLetterOf({ src: { k: 'letter', id: key, c: 'h' } });
    return { eyebrow: 'Songs from this letter', title: (letter && letter.title) || 'Songs from this letter', families: fams, songs: null, empty: 'No songs from this letter yet.' };
  }
  const shelf = SHELVES.find((x) => x.v === v);
  if (shelf) {
    /** @type {any[]} */
    let fams = [];
    for (const col of shelf.cols) fams = fams.concat(cat.familiesFor({ col }));
    return { eyebrow: 'Songs of the Letters', title: shelf.title, families: fams, songs: null, empty: 'No songs here yet.' };
  }
  const col = v.indexOf('col:') === 0 ? v.slice(4) : '';
  return { eyebrow: 'From the letters', title: col ? colLabel(col) : 'Songs', families: col ? letterOrder(cat.familiesFor({ col }), col) : [], songs: null, empty: 'No songs here yet.' };
}

/** The title a frame shows, for the back pill of the frame above it. @param {any} frame @param {any} library */
export function songsFrameTitle(frame, library) {
  if (!frame || frame.k === 'hub') return 'Songs of the Letters';
  if (frame.k === 'readings') return 'Letters read with music';
  const cat = catalog();
  if (frame.k === 'song') { const fam = cat && cat.loaded ? cat.familyById(frame.v) : null; return (fam && fam.t) || 'Song'; }
  return cat && cat.loaded ? listContent(frame.v, library).title : 'Songs';
}

/* ── rows ─────────────────────────────────────────────────────────────── */

/**
 * One song family: cover, title, an italic line, its length, and the round ▶. A tap on the row plays the family's
 * lead version (W-02); "N versions ›" opens its song page.
 * `inList`: the row sits in its own collection's list, so its italic line names the version, not the collection again.
 * @param {{ key?: any, fam: any, song?: any, playingId: string, active: boolean, onPlay: (song: any) => void, onOpen?: (fam: any) => void, inList?: boolean }} props
 */
function FamilyRow({ fam, song, playingId, active, onPlay, onOpen, inList = false }) {
  const cat = catalog();
  const lead = song || cat.featuredOf(fam);
  if (!lead) return null;
  const count = cat.versionsOf(fam).length;
  const isCurrent = familyIsPlaying(fam.id, playingId);
  const line = count > 1 ? '' : inList ? lead.cr || lead.v || songLine(lead) : songLine(lead);
  const tap = () => { if (isCurrent) AudioPlayer.toggle(); else onPlay(lead); };
  return (
    <SongListRow song={lead} title={fam.t} line={line} versions={count} onVersions={onOpen ? () => onOpen(fam) : undefined}
      len={songClock(lead.d)} current={isCurrent} playing={isCurrent && active} onPlay={tap} />
  );
}

/**
 * One single song (a saved one, a recent one, a new one, a kept one): cover, title, its maker or shelf in italic,
 * its length, the round ▶ — and Remove on the Kept list. A tap on the row plays it (W-02); a song with other
 * versions carries "N versions ›" to its song page.
 * @param {{ key?: any, song: any, playingId: string, active: boolean, onPlay: (song: any) => void, onOpen?: (song: any) => void, onRemove?: (song: any) => void }} props
 */
function SongRow({ song, playingId, active, onPlay, onOpen, onRemove }) {
  const cat = catalog();
  const fam = cat.familyById(song.f);
  const count = fam ? cat.versionsOf(fam).length : 1;
  const isCurrent = playingId === song.id;
  const tap = () => { if (isCurrent) AudioPlayer.toggle(); else onPlay(song); };
  const line = onRemove ? (song.v || songLine(song)) + ' · ' + formatSongBytes(song.b) : songLine(song);
  return (
    <SongListRow song={song} title={song.t} line={line} versions={count} onVersions={onOpen ? () => onOpen(song) : undefined}
      len={onRemove ? '' : songClock(song.d)} current={isCurrent} playing={isCurrent && active} onPlay={tap}>
      {onRemove ? <button type="button" className="song-keep-remove" onClick={() => onRemove(song)} aria-label={'Remove ' + song.t + ' from this phone'}>Remove</button> : null}
    </SongListRow>
  );
}

/** @param {{ title: string, id?: string, action?: any }} props */
function SectionHead({ title, id, action }) {
  return (
    <div className="songs-section-head">
      <h2 id={id}>{title}</h2>
      {action || null}
    </div>
  );
}

/* ── the screen ───────────────────────────────────────────────────────── */

/**
 * @param {{
 *   route: any[],
 *   onPush: (frame: any) => void,
 *   onReplaceTop: (frame: any) => void,
 *   onBack: () => void,
 *   rootBackLabel?: string,
 *   onSearch: () => void,
 *   onHistory: () => void,
 *   onSettings: () => void,
 *   theme: any,
 *   onThemeChange: (theme: any) => void,
 * }} props
 */
export function AudioSongsScreen({ route, onPush, onReplaceTop, onBack, rootBackLabel = 'Listening Library', onSearch, onHistory, onSettings, theme, onThemeChange }) {
  const cat = catalog();
  React.useSyncExternalStore(
    React.useCallback((cb) => (cat ? cat.subscribe(cb) : () => {}), [cat]),
    React.useCallback(() => (cat ? cat.getVersion() : 0), [cat])
  );
  const library = audioLibraryStore();
  React.useSyncExternalStore(
    React.useCallback((cb) => library && typeof library.subscribe === 'function' ? library.subscribe(cb) : () => {}, [library]),
    React.useCallback(() => library && typeof library.getVersion === 'function' ? library.getVersion() : 0, [library])
  );
  React.useSyncExternalStore(AudioPlayer.subscribe, AudioPlayer.getVersion);
  // The letters' titles (the Find box and "From the letter") ride the lazy VOT corpus.
  React.useSyncExternalStore(
    React.useCallback((cb) => typeof window.__votCorpus !== 'undefined' ? window.__votCorpus.subscribe(cb) : () => {}, []),
    () => typeof window.__votCorpus !== 'undefined' ? window.__votCorpus.getVersion() : 0
  );
  React.useEffect(() => {
    if (cat && !cat.loaded) void cat.load();
    if (typeof window.__loadVotCorpus === 'function') void window.__loadVotCorpus();
  }, [cat]);

  const frames = Array.isArray(route) && route.length ? route : [{ k: 'hub' }];
  const top = frames[frames.length - 1];
  const backLabel = frames.length > 1 ? songsFrameTitle(frames[frames.length - 2], library) : rootBackLabel;
  const state = AudioPlayer.getState();
  const playingId = currentSongId(state);
  const active = playerIsActive(state);

  let body;
  if (!cat || !cat.loaded) {
    body = cat && cat.error ? (
      <div className="songs-state" role="status">
        <p>Songs need a connection the first time.</p>
        <button type="button" className="songs-outline-action" onClick={() => { void cat.load(); }}>Try again</button>
      </div>
    ) : (
      <div className="songs-skeleton" role="status" aria-label="Loading songs">
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="songs-skeleton-row"><span /><span><i /><i /></span></div>)}
      </div>
    );
  } else if (top.k === 'readings') {
    body = <ReadWithMusic state={state} />;
  } else if (top.k === 'song') {
    body = <SongPage familyId={top.v} library={library} playingId={playingId} active={active} onPush={onPush} FamilyRow={FamilyRow} />;
  } else if (top.k === 'list') {
    body = <SongsList frame={top} library={library} playingId={playingId} active={active} onPush={onPush} />;
  } else {
    body = <SongsHub frame={top} library={library} playingId={playingId} active={active} onPush={onPush} onReplaceTop={onReplaceTop} />;
  }

  return (
    <ScreenLayout navChildren={LibraryNav({ onBack, backLabel, showHome: false, onSearch, onHistory, onSettings, theme, onThemeChange })}>
      <div className="songs-screen">
        {top.k === 'hub' || !cat || !cat.loaded ? (
          <header className="songs-hero">
            <div className="songs-eyebrow">Sung by the flock</div>
            <h1>Songs of the Letters</h1>
            <p className="songs-intro">Songs made by members of the flock with Suno, from the words of The Volumes of Truth.</p>
          </header>
        ) : null}
        {body}
      </div>
    </ScreenLayout>
  );
}

/**
 * The hub: Shuffle all, Find, style chips, then either the results or the shelves.
 * @param {{ frame: any, library: any, playingId: string, active: boolean, onPush: (f: any) => void, onReplaceTop: (f: any) => void }} props
 */
function SongsHub({ frame, library, playingId, active, onPush, onReplaceTop }) {
  const cat = catalog();
  const version = cat.getVersion();
  const [query, setQuery] = React.useState(frame.q || '');
  const [style, setStyle] = React.useState(frame.st || '');
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [allTiles, setAllTiles] = React.useState(false);
  // A frame restored or pushed with a query (Search's shortcut row) refills the box. The hub's own write-back
  // below echoes here too, so the box is only reset when the frame says something else.
  React.useEffect(() => {
    setQuery((q) => (q === (frame.q || '') ? q : frame.q || ''));
    setStyle(frame.st || '');
  }, [frame.q, frame.st]);
  // W2-07: the Find words and the chip live in the hub's frame as they change (a short pause after typing), so
  // a letter opened from the desk and Back return to the same results. Only while the hub is on top: a list
  // opened over it writes its own frame first (`open`), and unmounting drops a write still waiting.
  const replaceTopRef = React.useRef(onReplaceTop);
  replaceTopRef.current = onReplaceTop;
  const hubFrame = () => {
    const keep = { k: 'hub' };
    if (query.trim()) keep.q = query;
    if (style) keep.st = style;
    return keep;
  };
  React.useEffect(() => {
    if ((frame.q || '') === (query.trim() ? query : '') && (frame.st || '') === style) return undefined;
    const t = setTimeout(() => replaceTopRef.current(hubFrame()), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hubFrame reads query and style, the deps
  }, [query, style, frame.q, frame.st]);

  const styles = cat.styles();
  const styleCounts = React.useMemo(() => {
    /** @type {Record<string, number>} */
    const out = {};
    for (const key of Object.keys(styles)) out[key] = cat.familiesFor({ style: key }).length;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  const primary = PRIMARY_STYLES.filter((k) => styles[k]);
  const more = Object.keys(styles).filter((k) => primary.indexOf(k) < 0 && styleCounts[k] > 0)
    .sort((a, b) => styleCounts[b] - styleCounts[a]);

  const words = query.trim() ? query.trim().split(/\s+/) : [];
  const filtering = !!(words.length || style);
  // A letter's title joins the words once the letters land: the screen re-renders on the corpus, and
  // findSongFamilies rebuilds its cache by the corpus version.
  const results = filtering ? findSongFamilies(query, style) : [];
  const leadOf = (fam) => (style ? cat.versionsOf(fam).find((s) => s.st.indexOf(style) >= 0 || s.dl === style || (style === 'spanish' && s.lang === 'es')) : null) || cat.featuredOf(fam);

  const shuffleCount = style ? styleCounts[style] || 0 : 0;
  const shuffleLabel = style ? 'Shuffle ' + (styles[style] || style) + ' (' + shuffleCount.toLocaleString('en-US') + ')' : 'Shuffle all songs';
  const shuffle = () => {
    AudioPlayer.playSongs({ filter: style ? { style } : {}, shuffle: true, onePerFamily: true, label: style ? (styles[style] || style) + ' songs' : 'Songs of the Letters' });
  };
  // Leaving the hub keeps its Find box and chip in its frame, so Back returns to the same results.
  const open = (next) => {
    onReplaceTop(hubFrame());
    onPush(next);
  };
  const playResults = (song) => {
    AudioPlayer.playSongs({ ids: results.map(leadOf).filter(Boolean).map((s) => s.id), startId: song.id, label: 'Songs of the Letters' });
  };

  const newest = newestSongs(NEW_TOTAL);
  const readings = readingLetters();
  const savedCount = library ? songsOfIds(library.songSaved()).length : 0;
  // K1: the songs kept on this phone (and, after a restore, those the backup lists but the phone lacks).
  const keep = useSongKeep();
  const keptIds = keep.keptIds();
  const missingCount = keep.missing().length;
  const recentCount = library ? songsOfIds(library.songRecent()).length : 0;
  // The biggest collections first (ties keep reading order); the rest one tap away.
  const tiles = LETTER_COLS.map((col, i) => {
    const fams = letterOrder(cat.familiesFor({ col }), col);
    return { col, fams, n: songsIn(fams), i };
  }).filter((t) => t.fams.length).sort((a, b) => b.n - a.n || a.i - b.i);
  const shownTiles = allTiles ? tiles : tiles.slice(0, TILES_FIRST);

  return (
    <>
      <div className="songs-controls">
        <button type="button" className="songs-shuffle" onClick={shuffle}><ShuffleIcon /><span>{shuffleLabel}</span></button>
        <div className="songs-find">
          <SearchIcon />
          <label>
            <span className="sr-only">Find a song, a letter, or a maker</span>
            <input type="search" aria-label="Find a song" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a song, a letter, or a maker" enterKeyHint="search" />
          </label>
          {query ? <button type="button" className="songs-find-clear" onClick={() => setQuery('')} aria-label="Clear the song search"><CloseIcon /></button> : null}
        </div>
        <div className="songs-chips" role="group" aria-label="Styles">
          <button type="button" className={'songs-chip' + (!style ? ' is-on' : '')} aria-pressed={!style} onClick={() => setStyle('')}>All</button>
          {primary.map((key) => (
            <button key={key} type="button" className={'songs-chip' + (style === key ? ' is-on' : '')} aria-pressed={style === key} onClick={() => setStyle(style === key ? '' : key)}>{styles[key]}</button>
          ))}
          {more.length ? (
            <button type="button" className={'songs-chip songs-chip-more' + (more.indexOf(style) >= 0 ? ' is-on' : '')} aria-haspopup="dialog" onClick={() => setMoreOpen(true)}>
              {more.indexOf(style) >= 0 ? styles[style] : 'More'}<span aria-hidden="true">▾</span>
            </button>
          ) : null}
        </div>
      </div>
      {moreOpen ? (
        <ChoiceSheet
          eyebrow="Songs of the Letters" title="More styles" value={style}
          options={more.map((key) => ({ id: key, label: styles[key], meta: songCountLabel(styleCounts[key]) }))}
          onChange={setStyle} onClose={() => setMoreOpen(false)}
        />
      ) : null}

      {filtering ? (
        <section className="songs-section" aria-labelledby="songs-results">
          <SectionHead id="songs-results" title={style && !words.length ? (styles[style] || 'Songs') : 'Songs'} action={<span className="songs-section-count" aria-live="polite">{songCountLabel(results.length)}</span>} />
          {results.length ? (
            <div className="songs-list">{results.map((fam) => <FamilyRow key={fam.id} fam={fam} song={leadOf(fam)} playingId={playingId} active={active} onPlay={playResults} onOpen={(f) => open({ k: 'song', v: f.id })} />)}</div>
          ) : (
            <p className="songs-empty">No song by that name. Try a word from the letter.</p>
          )}
        </section>
      ) : (
        <>
          {newest.length ? (
            <section className="songs-section" aria-labelledby="songs-new">
              <SectionHead id="songs-new" title="New from the flock" action={newest.length > NEW_ON_HUB ? <button type="button" className="songs-see-all" onClick={() => open({ k: 'list', v: 'new' })}>See all<ChevronRightIcon /></button> : null} />
              <div className="songs-card songs-list">
                {newest.slice(0, NEW_ON_HUB).map((song) => <SongRow key={song.id} song={song} playingId={playingId} active={active} onPlay={(s) => AudioPlayer.playSongs({ ids: newest.map((x) => x.id), startId: s.id, label: 'New from the flock' })} onOpen={(s) => open({ k: 'song', v: s.f })} />)}
              </div>
            </section>
          ) : null}

          <section className="songs-section" aria-labelledby="songs-yours">
            <SectionHead id="songs-yours" title="Your songs" />
            <div className="songs-card">
              <button type="button" className="songs-nav-row" onClick={() => open({ k: 'list', v: 'saved' })}>
                <span className="songs-nav-mark" aria-hidden="true"><StarIcon filled={savedCount > 0} /></span>
                <span className="songs-nav-label">Saved songs</span>
                <span className="songs-nav-count">{savedCount}</span>
                <ChevronRightIcon />
              </button>
              <button type="button" className="songs-nav-row" onClick={() => open({ k: 'list', v: 'recent' })}>
                <span className="songs-nav-mark" aria-hidden="true"><RecentIcon /></span>
                <span className="songs-nav-label">Recently played songs</span>
                <span className="songs-nav-count">{recentCount}</span>
                <ChevronRightIcon />
              </button>
              {keep && keep.availability() !== 'none' ? (
                <button type="button" className="songs-nav-row" onClick={() => open({ k: 'list', v: 'kept' })}>
                  <span className="songs-nav-mark" aria-hidden="true"><KeepIcon /></span>
                  <span className="songs-nav-label">Kept on this phone</span>
                  <span className="songs-nav-count">{keptIds.length ? keptIds.length + ' · ' + formatSongBytes(keep.bytesOf(keptIds)) : missingCount ? 'Download again' : '0'}</span>
                  <ChevronRightIcon />
                </button>
              ) : null}
            </div>
          </section>

          {tiles.length ? (
            <section className="songs-section" aria-labelledby="songs-letters">
              <SectionHead id="songs-letters" title="From the letters" />
              <div className="songs-tiles">
                {shownTiles.map(({ col, fams, n }) => (
                  <button key={col} type="button" className="songs-tile" onClick={() => open({ k: 'list', v: 'col:' + col })}>
                    <span className="songs-mosaic" aria-hidden="true">
                      {[0, 1, 2, 3].map((i) => <SongCover key={i} song={fams[i] ? cat.featuredOf(fams[i]) : null} />)}
                    </span>
                    <span className="songs-tile-copy"><strong>{colLabel(col)}</strong><small>{songCountLabel(n)}</small></span>
                    <ChevronRightIcon />
                  </button>
                ))}
              </div>
              {tiles.length > TILES_FIRST ? (
                <button type="button" className="songs-see-all songs-tiles-more" aria-expanded={allTiles} onClick={() => setAllTiles(!allTiles)}>
                  {allTiles ? 'Show fewer collections' : 'Show all ' + tiles.length + ' collections'}<ChevronRightIcon />
                </button>
              ) : null}
            </section>
          ) : null}

          <section className="songs-section songs-shelves" aria-label="More songs">
            {SHELVES.map((shelf) => {
              let fams = [];
              for (const col of shelf.cols) fams = fams.concat(cat.familiesFor({ col }));
              if (!fams.length) return null;
              return (
                <button key={shelf.v} type="button" className="songs-shelf" onClick={() => open({ k: 'list', v: shelf.v })}>
                  <span className="songs-shelf-title">{shelf.title}</span>
                  <span className="songs-shelf-count">{songCountLabel(songsIn(fams))}</span>
                  <ChevronRightIcon />
                </button>
              );
            })}
            {readings.length ? (
              <button type="button" className="songs-shelf" onClick={() => open({ k: 'readings' })}>
                <span className="songs-shelf-title">Letters read with music</span>
                <span className="songs-shelf-count">{songCountLabel(readings.length, 'letter', 'letters')}</span>
                <ChevronRightIcon />
              </button>
            ) : null}
          </section>
        </>
      )}
    </>
  );
}

/**
 * A collection's or shelf's list: its title, Play all and Shuffle, its rows.
 * @param {{ frame: any, library: any, playingId: string, active: boolean, onPush: (f: any) => void }} props
 */
function SongsList({ frame, library, playingId, active, onPush }) {
  const cat = catalog();
  const keep = useSongKeep();
  const [askingRemoveAll, setAskingRemoveAll] = React.useState(false);
  const keptList = frame.v === 'kept';
  const content = listContent(frame.v, library);
  const fams = content.families;
  // A family row in a letter's list leads with that letter's own version.
  const letterKey = frame.v.indexOf('letter:') === 0 ? frame.v.slice(7) : '';
  const leadFor = (fam) => (letterKey ? cat.versionsOf(fam).find((s) => s.src && s.src.id === letterKey) : null) || cat.featuredOf(fam);
  const leads = fams ? fams.map(leadFor).filter(Boolean) : content.songs || [];
  const count = fams ? songsIn(fams) : leads.length;
  const seconds = (fams ? fams.reduce((sum, fam) => sum + cat.versionsOf(fam).reduce((a, s) => a + s.d, 0), 0) : leads.reduce((a, s) => a + s.d, 0));
  const hours = seconds >= 3600 ? (Math.round(seconds / 360) / 10) + ' h' : Math.max(1, Math.round(seconds / 60)) + ' min';
  const ids = leads.map((s) => s.id);
  const play = (song, shuffle) => AudioPlayer.playSongs({ ids, startId: song ? song.id : undefined, shuffle: !!shuffle, label: content.title });
  // K1: Keep all keeps every version shown here (the count the header states); the Kept list removes instead.
  /** @type {string[]} */
  const allIds = fams ? fams.reduce((out, fam) => out.concat(cat.versionsOf(fam).map((s) => s.id)), /** @type {string[]} */ ([])) : ids;
  const missing = keptList ? keep.missing() : [];
  const keptBytes = keptList ? keep.bytesOf(ids) : 0;

  return (
    <>
      <header className="songs-hero songs-list-hero">
        <div className="songs-eyebrow">{content.eyebrow}</div>
        <h1>{content.title}</h1>
        {count ? <p className="songs-intro">{fams && count > fams.length
          // n3-09: Play all plays one version per song, so the songs and their versions are counted apart
          ? songCountLabel(fams.length) + ' · ' + songCountLabel(count, 'version', 'versions')
          : songCountLabel(count)} · {keptList ? formatSongBytes(keptBytes) + ' · they play with no signal' : hours}</p> : null}
        {ids.length ? (
          <div className="songs-list-actions">
            <button type="button" className="songs-shuffle songs-play-all" onClick={() => play(null, false)}><PlayIcon /><span>Play all</span></button>
            {ids.length > 1 ? <button type="button" className="songs-outline-action" onClick={() => play(null, true)}><ShuffleIcon /><span>Shuffle</span></button> : null}
          </div>
        ) : null}
        {!keptList && allIds.length ? (
          <SongKeepAction ids={allIds} noteKey={'keep-list-' + frame.v} label={allIds.length > 1 ? 'Keep all ' + allIds.length.toLocaleString('en-US') : 'Keep this song'} />
        ) : null}
        {keptList && missing.length ? (
          <div className="song-keep-restore">
            <p>{'Your backup lists ' + songCountLabel(missing.length) + ' kept on this phone that are not on it now.'}</p>
            <SongKeepAction ids={missing} noteKey="keep-restore" label={'Download your ' + songCountLabel(missing.length) + ' again ({size})'} />
          </div>
        ) : null}
        {keptList && ids.length ? (
          askingRemoveAll ? (
            // W2-05: the Downloads screen's own strip (AudioOfflineScreen), words and buttons alike.
            <div className="offline-confirm" role="group" aria-label="Remove all kept songs">
              <p className="offline-confirm-title">{'Remove all ' + songCountLabel(ids.length) + ' (' + formatSongBytes(keptBytes) + ') from this phone?'}</p>
              <p className="offline-confirm-line">They can be kept again.</p>
              <div className="offline-confirm-actions">
                <button type="button" className="offline-confirm-cancel" onClick={() => setAskingRemoveAll(false)}>Keep them</button>
                <button type="button" className="offline-confirm-go" onClick={() => { void keep.removeAll(); setAskingRemoveAll(false); }}>Yes, remove all</button>
              </div>
            </div>
          ) : (
            <button type="button" className="songs-see-all song-keep-remove-all" onClick={() => setAskingRemoveAll(true)}>Remove all from this phone</button>
          )
        ) : null}
      </header>
      <section className="songs-section" aria-label={content.title}>
        {fams && fams.length ? (
          <div className="songs-list">{fams.map((fam) => <FamilyRow key={fam.id} fam={fam} song={leadFor(fam)} playingId={playingId} active={active} onPlay={(s) => play(s, false)} onOpen={(f) => onPush({ k: 'song', v: f.id })} inList />)}</div>
        ) : content.songs && content.songs.length ? (
          <div className="songs-list">{content.songs.map((song) => <SongRow key={song.id} song={song} playingId={playingId} active={active} onPlay={(s) => play(s, false)} onOpen={(s) => onPush({ k: 'song', v: s.f })} onRemove={keptList ? (s) => { void keep.remove([s.id]); } : undefined} />)}</div>
        ) : (
          <p className="songs-empty">{content.empty}</p>
        )}
      </section>
    </>
  );
}
