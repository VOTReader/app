/* ═══════════════════════════════════════════════════════════════════════
   ListenScreens — the overhaul's Listen tab (rv1, Corbin's review build;
   never on main). Cluster H (bundle-h, lazy), beside the screens it replaces.
   ═══════════════════════════════════════════════════════════════════════
   Built to the Design canvas (words: "21a Listen", "21c Volume One
   recordings") and the Codex sheets 21 and 37 (look), per the spec in
   lanes/hub/out/overhaul-2026-10-05/reports/audit-listen.md §5:

     ListenRoot     the tab root: Continue listening, THE LETTERS, THE
                    SCRIPTURES, VOICES, STUDIES, SONGS OF THE LETTERS, YOUR
                    LISTENING (always shown, with zero counts). Replaces the
                    old hub, The Volumes and the Studies screens.
     ListenSource   one screen for a letter collection, a study, or a voice
                    ('voice:<code>'): eyebrow, title, one fact line, a gold
                    Play / Resume pill, an outline Download, hairline rows
                    (number, title, "Read by … · status", a state glyph).
     ListenHistory  every recording started, newest first.

   No queue (hub 2026-10-05): a Play starts the natural order the player
   already builds. Nothing here writes a store: the rows read the library,
   positions and downloads stores the player and OfflineAudio own. The player,
   the stores, the shelf helpers and listenEyebrow/listenReaderLine are
   bundle-d globals read at call time (one player, one shelf).
   ═══════════════════════════════════════════════════════════════════════ */

import { useOfflineAudio, useOnline, formatBytes } from '../components/OfflineAudioControls.jsx';
import { studiesList, studyRecordedCount } from './AudioStudiesScreen.jsx';

/** The reader codes a VOICES row stands for, in the canvas's order, with the row's words. */
const VOICES = [
  { code: 'B', name: 'Benjamin', line: 'Every letter Benjamin has read aloud' },
  { code: 'T', name: 'Timothy', line: 'Every letter Timothy has read aloud' },
  { code: 'V', name: 'Synthesized voice', line: 'Every letter read by the synthesized voice' },
];

/** In progress: started at least this far in and not past the player's own end fraction (audit-listen 5.2). */
const IN_PROGRESS_MIN_S = 30;
const IN_PROGRESS_END = 0.97;

const Chevron = () => <svg className="listen-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5.5l6.5 6.5L9 18.5" /></svg>;
const PlayGlyph = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4v16l14-8z" /></svg>;
const Check = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
const Down = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14" /></svg>;
const Bars = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="4" y="10" width="3" height="9" rx="1" /><rect x="10.5" y="5" width="3" height="14" rx="1" /><rect x="17" y="8" width="3" height="11" rx="1" /></svg>;

/** Re-render on the player, the library, the positions, the lazy corpus and the song catalog. */
function useListenStores() {
  React.useSyncExternalStore(AudioPlayer.subscribe, AudioPlayer.getVersion);
  const library = audioLibraryStore();
  React.useSyncExternalStore(
    React.useCallback((cb) => (library && typeof library.subscribe === 'function' ? library.subscribe(cb) : () => {}), [library]),
    React.useCallback(() => (library && typeof library.getVersion === 'function' ? library.getVersion() : 0), [library])
  );
  useAudioPositions();
  React.useEffect(() => { if (typeof window.__loadVotCorpus === 'function') void window.__loadVotCorpus(); }, []);
  const corpus = React.useSyncExternalStore(
    React.useCallback((cb) => (typeof window.__votCorpus !== 'undefined' ? window.__votCorpus.subscribe(cb) : () => {}), []),
    () => (typeof window.__votCorpus !== 'undefined' ? window.__votCorpus.getVersion() : 0)
  );
  const [studiesIn, setStudiesIn] = React.useState(0);
  React.useEffect(() => {
    let live = true;
    const load = /** @type {any} */ (window).loadBibleStudies;
    if (typeof load === 'function') Promise.resolve(load()).then(() => { if (live) setStudiesIn((n) => n + 1); }, () => {});
    return () => { live = false; };
  }, []);
  return { library, version: corpus + ':' + studiesIn };
}

/** The saved position of a track, or null. */
function positionOf(track) {
  const store = audioPositionsStore();
  return store && typeof store.getPosition === 'function' ? store.getPosition(track) : null;
}

/** Started and not finished, by the thresholds the player uses. */
function inProgress(track) {
  const p = positionOf(track);
  return !!(p && p.d > 0 && p.t >= IN_PROGRESS_MIN_S && p.t < p.d * IN_PROGRESS_END);
}

/** 0..1 through a track, from its saved position. */
function fractionOf(track) {
  const p = positionOf(track);
  return p && p.d > 0 ? Math.max(0, Math.min(1, p.t / p.d)) : 0;
}

/** "9 min left" from a saved position ('' when unknown). */
function minutesLeft(track) {
  const p = positionOf(track);
  if (!p || !(p.d > 0)) return '';
  return Math.max(1, Math.round((p.d - p.t) / 60)) + ' min left';
}

/** A collection's key: the registry calls it volKey (COL_BY_KEY is keyed by it). */
function keyOf(col) {
  return col ? col.volKey || col.key || '' : '';
}

/** The public letter collections that have recordings (Hidden Manna has none and stays out). */
function letterCollections() {
  const cols = typeof COLLECTIONS !== 'undefined' && Array.isArray(COLLECTIONS) ? COLLECTIONS.filter((c) => c && c.cardId) : [];
  return cols.filter((c) => AudioPlayer.collectionHasAudio(keyOf(c)));
}

/** A collection's recorded letters in reading order (preface first where there is one). */
function recordedLetters(col) {
  const preface = typeof colPreface === 'function' ? colPreface(col) : null;
  const letters = typeof colLetterArr === 'function' ? (colLetterArr(col) || []) : [];
  return (preface ? [preface, ...letters] : letters).filter((l) => l && l.id && AudioPlayer.hasAudio(keyOf(col), l.id));
}

/** "29 letters", "7 entries". */
function countWords(col, n) {
  const entry = !!(col && col.kind && col.kind !== 'letter');
  return n + ' ' + (n === 1 ? (entry ? 'entry' : 'letter') : (entry ? 'entries' : 'letters'));
}

/** Every recorded letter one reader read, grouped by collection: [{ col, letters }]. */
function voiceShelves(code) {
  return letterCollections().map((col) => ({
    col,
    letters: recordedLetters(col).filter((l) => AudioPlayer.renditionsFor(keyOf(col), l, col.label).some((r) => r.reader === code)),
  })).filter((shelf) => shelf.letters.length);
}

/**
 * A hairline row: title, an optional second line, a right glyph (chevron by default).
 * @param {{ title: any, line?: any, onClick: () => void, tag?: string, glyph?: any, className?: string }} props
 */
function ListenRow({ title, line, onClick, tag, glyph, className = '' }) {
  return (
    <button type="button" className={'listen-row ' + className} onClick={onClick}>
      <span className="listen-row-copy">
        <span className="listen-row-title">{title}</span>
        {line ? <span className="listen-row-line">{line}</span> : null}
        {tag ? <span className="listen-tag">{tag}</span> : null}
      </span>
      {glyph === undefined ? <Chevron /> : glyph}
    </button>
  );
}

/** The small-caps gold section label. @param {{ children: any }} props */
function Eyebrow({ children }) {
  return <p className="listen-eyebrow">{children}</p>;
}

/**
 * @param {{
 *   onBack: () => void, backLabel?: string, bibleAudio?: string | null,
 *   onOpenSource: (key: string) => void, onOpenBible: (volKey: string) => void,
 *   onOpenSaved: () => void, onOpenDownloads: () => void, onOpenHistory: () => void,
 *   onOpenSongs: () => void, onReadStudies: () => void, onOpenNowPlaying: () => void,
 *   onSearch: () => void, onHistory: () => void, onSettings: () => void, theme: any, onThemeChange: (t: any) => void,
 * }} props
 */
export function ListenRoot(props) {
  const { library } = useListenStores();
  const offline = useOfflineAudio();
  const online = useOnline();
  const songs = typeof SongCatalog !== 'undefined' ? SongCatalog : null;
  React.useSyncExternalStore(
    React.useCallback((cb) => (songs ? songs.subscribe(cb) : () => {}), [songs]),
    React.useCallback(() => (songs ? songs.getVersion() : 0), [songs])
  );
  React.useEffect(() => { if (songs && !songs.loaded) void songs.load(); }, [songs]);

  const state = AudioPlayer.getState();
  const current = Array.isArray(state.queue) ? state.queue[state.qi] || null : null;
  const recent = library && typeof library.recent === 'function' ? library.recent() : [];
  const saved = library && typeof library.saved === 'function' ? library.saved() : [];
  // The hero: what is loaded now, else the newest recording still in progress, else the newest started.
  const started = recent.filter((t) => t && !(current && t.url === current.url));
  const going = started.filter(inProgress);
  const hero = current || going[0] || recent[0] || null;
  const more = going.filter((t) => t !== hero).slice(0, 2);
  const heroActive = !!(hero && current && hero.url === current.url && (state.status === 'playing' || state.status === 'loading'));

  const resume = (/** @type {any} */ track) => {
    if (current && track.url === current.url) { if (!heroActive) AudioPlayer.toggle(); }
    else AudioPlayer.playTrack(track);
    props.onOpenNowPlaying();
  };

  const collections = letterCollections();
  const editions = Object.entries(BIBLE_AUDIO_EDITIONS).filter(([, e]) => bibleAudioOffered(e));
  const voiceCounts = VOICES.map((v) => ({ ...v, count: voiceShelves(v.code).reduce((n, s) => n + s.letters.length, 0) })).filter((v) => v.count);
  const studies = studiesList();
  const recordedStudies = studies.filter((s) => studyRecordedCount(s) > 0);
  const songTotal = songs && songs.loaded ? songs.songs().filter((s) => !s.hid && s.sh).length : 0;
  const downloads = offline ? offline.items() : [];
  const first = collections[0] || null;
  const yourEdition = props.bibleAudio && BIBLE_AUDIO_EDITIONS[props.bibleAudio] ? props.bibleAudio : null;

  return (
    <ScreenLayout navChildren={LibraryNav({ onBack: props.onBack, backLabel: props.backLabel, showHome: false, onSearch: props.onSearch, onHistory: props.onHistory, onSettings: props.onSettings, theme: props.theme, onThemeChange: props.onThemeChange })}>
      <div className="listen-screen">
        <h1 className="listen-title">Listen</h1>
        {!online ? (
          <p className="listen-offline" role="status">Offline · downloads still play <button type="button" onClick={props.onOpenDownloads}>Downloads ›</button></p>
        ) : null}

        {hero ? (
          <section className="listen-hero" aria-labelledby="listen-hero-title">
            <Eyebrow>{listenEyebrow(hero)}</Eyebrow>
            <h2 id="listen-hero-title" className="listen-hero-title">{trackName(hero)}</h2>
            <p className="listen-hero-line">{[listenReaderLine(hero), minutesLeft(hero)].filter(Boolean).join(' · ')}</p>
            <div className="listen-progress" aria-hidden="true"><span style={{ width: Math.round(fractionOf(hero) * 100) + '%' }} /></div>
            <button type="button" className="listen-pill" onClick={() => (heroActive ? props.onOpenNowPlaying() : resume(hero))}><PlayGlyph />{heroActive ? 'Now Playing' : 'Resume'}</button>
          </section>
        ) : (
          <section className="listen-hero" aria-labelledby="listen-hero-title">
            <h2 id="listen-hero-title" className="listen-hero-title">Hear the Letters read aloud</h2>
            {first ? <button type="button" className="listen-pill" onClick={() => props.onOpenSource(keyOf(first))}><PlayGlyph />{'Start with ' + first.label}</button> : null}
            {yourEdition ? <ListenRow title="The Bible, chapter by chapter" onClick={() => props.onOpenBible(BIBLE_AUDIO_EDITIONS[yourEdition].volKey)} /> : null}
          </section>
        )}
        {more.map((t) => (
          <ListenRow key={t.url} title={trackName(t)} line={[t.sub, minutesLeft(t)].filter(Boolean).join(' · ')} onClick={() => resume(t)} />
        ))}

        <Eyebrow>The Letters</Eyebrow>
        {collections.map((col) => (
          <ListenRow key={keyOf(col)} title={col.label} line={countWords(col, recordedLetters(col).length)} onClick={() => props.onOpenSource(keyOf(col))} />
        ))}

        <Eyebrow>The Scriptures</Eyebrow>
        {editions.map(([id, e]) => (
          <ListenRow key={e.volKey} title={e.label} line={/** @type {any} */ (e).description || ''} tag={id === yourEdition ? 'Your Bible voice' : ''} onClick={() => props.onOpenBible(e.volKey)} />
        ))}

        {voiceCounts.length ? <Eyebrow>Voices</Eyebrow> : null}
        {voiceCounts.map((v) => (
          <ListenRow key={v.code} title={v.name} line={v.count + (v.count === 1 ? ' letter' : ' letters')} onClick={() => props.onOpenSource('voice:' + v.code)} />
        ))}

        {studies.length ? <Eyebrow>Studies</Eyebrow> : null}
        {recordedStudies.map((s) => (
          <ListenRow key={s.id} title={s.title} line={studyRecordedCount(s) + ' of ' + s.chapters.length + ' chapters recorded'} onClick={() => props.onOpenSource('study:' + s.id)} />
        ))}
        {studies.length > recordedStudies.length ? (
          <ListenRow title={(studies.length - recordedStudies.length) + ' more studies to read'} onClick={props.onReadStudies} />
        ) : null}

        <Eyebrow>Songs of the Letters</Eyebrow>
        <ListenRow title={songTotal >= 1000 ? 'Over 1,000 songs' : songTotal ? songCountLabel(songTotal) : 'Songs'} line="made by the flock" onClick={props.onOpenSongs} />

        <Eyebrow>Your Listening</Eyebrow>
        <ListenRow title={'Saved · ' + saved.length} onClick={props.onOpenSaved} />
        <ListenRow title={'Downloads · ' + downloads.length + (offline && downloads.length ? ' · ' + formatBytes(offline.totalBytes()) : '')} onClick={props.onOpenDownloads} />
        <ListenRow title="History" onClick={props.onOpenHistory} />
      </div>
    </ScreenLayout>
  );
}

/**
 * One recording row of a Source: number, title, "Read by … · status", a state glyph that downloads on tap.
 * @param {{ n: any, title: string, tracks: any[], reader: string, playing: boolean, onPlay: () => void, offline: any, online: boolean, name: string }} props
 */
function SourceRow({ n, title, tracks, reader, playing, onPlay, offline, online, name }) {
  const urls = tracks.map((t) => t.url);
  const status = offline && urls.length ? offline.statusOf(urls[0]) : '';
  const onPhone = !!(offline && urls.length && urls.every((u) => offline.isSaved(u)));
  const busy = status === 'downloading' || status === 'queued';
  const prog = busy && typeof offline.progressOf === 'function' ? offline.progressOf(urls[0]) : null;
  const progress = prog && prog.total > 0 ? prog.bytes / prog.total : 0;
  const left = tracks.map(minutesLeft).find(Boolean) || '';
  const done = !left && tracks.some((t) => { const p = positionOf(t); return !!(p && p.d > 0 && p.t >= p.d * IN_PROGRESS_END); });
  const parts = tracks.length > 1 ? tracks.length + ' parts' : '';
  const line = [reader, parts, playing ? 'playing' : busy ? 'downloading' + (progress ? ' ' + Math.round(progress * 100) + '%' : '') : left || (done ? 'Finished' : '')].filter(Boolean).join(' · ');
  const unavailable = !online && !onPhone;
  let glyph = null;
  if (playing) glyph = <span className="listen-glyph is-gold" aria-label="Playing"><Bars /></span>;
  else if (onPhone) glyph = <span className="listen-glyph is-gold" aria-label="On this phone"><Check /></span>;
  else if (busy) glyph = <span className="listen-glyph listen-ring" aria-label={'Downloading' + (progress ? ', ' + Math.round(progress * 100) + ' percent' : '')} style={/** @type {any} */ ({ '--p': Math.round(progress * 100) + '%' })} />;
  else if (offline && online) glyph = <button type="button" className="listen-glyph" aria-label={'Download ' + name} onClick={(e) => { e.stopPropagation(); offline.download(tracks.map((t) => ({ url: t.url, key: t.key, title: t.title }))); }}><Down /></button>;
  return (
    <div className={'listen-source-row' + (playing ? ' is-playing' : '') + (unavailable ? ' is-unavailable' : '')}>
      <button type="button" className="listen-source-hit" onClick={onPlay} disabled={unavailable} aria-label={'Play ' + name}>
        <span className="listen-num">{n}</span>
        <span className="listen-row-copy">
          <span className="listen-row-title">{title}</span>
          <span className="listen-row-line">{unavailable ? 'Needs a connection' : line}</span>
        </span>
      </button>
      {glyph}
    </div>
  );
}

/**
 * A letter collection ('<volKey>'), a study ('study:<id>') or a voice ('voice:<code>').
 * @param {{ sourceKey: string, onBack: () => void, backLabel?: string, onOpenNowPlaying: () => void,
 *   onSearch: () => void, onHistory: () => void, onSettings: () => void, theme: any, onThemeChange: (t: any) => void }} props
 */
export function ListenSource(props) {
  useListenStores();
  const offline = useOfflineAudio();
  const online = useOnline();
  const key = props.sourceKey || '';
  const state = AudioPlayer.getState();
  const current = Array.isArray(state.queue) ? state.queue[state.qi] || null : null;
  const live = state.status === 'playing' || state.status === 'loading';

  /** @type {{ eyebrow: string, title: string, line: string, groups: Array<{ heading: string, volKey: string, label: string, col: any, items: any[], reader: string | null }> }} */
  let src = { eyebrow: '', title: '', line: '', groups: [] };
  if (key.lastIndexOf('voice:', 0) === 0) {
    const v = VOICES.find((x) => x.code === key.slice(6)) || null;
    const shelves = v ? voiceShelves(v.code) : [];
    src = { eyebrow: 'Voices', title: v ? v.name : '', line: v ? v.line : '', groups: shelves.map((s) => ({ heading: s.col.label, volKey: keyOf(s.col), label: s.col.label, col: s.col, items: s.letters, reader: v ? v.code : null })) };
  } else if (key.lastIndexOf('study:', 0) === 0) {
    const study = studiesList().find((s) => s && (s.id === key.slice(6) || s.slug === key.slice(6))) || null;
    const items = study && Array.isArray(study.chapters) ? study.chapters.filter((c) => c && AudioPlayer.hasAudio('study', c.id)) : [];
    src = { eyebrow: 'Studies', title: study ? study.title : '', line: items.length + (items.length === 1 ? ' chapter' : ' chapters') + ' · read-along', groups: [{ heading: '', volKey: 'study', label: study ? study.title : '', col: { kind: 'chapter' }, items, reader: null }] };
  } else {
    const col = typeof COL_BY_KEY !== 'undefined' ? COL_BY_KEY.get(key) : null;
    const items = col ? recordedLetters(col) : [];
    src = { eyebrow: 'The Letters', title: col ? col.label : '', line: col ? countWords(col, items.length) + ' · read-along' : '', groups: col ? [{ heading: '', volKey: key, label: col.label, col, items, reader: null }] : [] };
  }

  const tracksOf = (/** @type {any} */ g, /** @type {any} */ item) => {
    if (g.reader) {
      const r = AudioPlayer.renditionsFor(g.volKey, item, g.label).find((x) => x.reader === g.reader);
      return r ? r.tracks : [];
    }
    return AudioPlayer.playbackTracks(g.volKey, item, g.label);
  };
  const play = (/** @type {any} */ g, /** @type {any} */ item) => {
    if (current && current.key === g.volKey + ':' + item.id) { if (!live) AudioPlayer.toggle(); props.onOpenNowPlaying(); return; }
    AudioPlayer.playCollection({ volKey: g.volKey, items: g.items, collectionLabel: g.label, startId: item.id, startReader: g.reader || undefined });
    props.onOpenNowPlaying();
  };
  // Resume: the first row in progress, else Play from the top.
  let resumeAt = null;
  for (const g of src.groups) {
    for (const item of g.items) { if (tracksOf(g, item).some(inProgress)) { resumeAt = { g, item }; break; } }
    if (resumeAt) break;
  }
  const firstGroup = src.groups[0] || null;
  const allTracks = src.groups.flatMap((g) => g.items.map((item) => tracksOf(g, item)));
  const sizeKnown = offline && typeof offline.sizeOf === 'function' ? allTracks.flat().reduce((n, t) => n + (offline.sizeOf(t.url) || 0), 0) : 0;
  const allOnPhone = !!(offline && allTracks.length && allTracks.every((ts) => ts.every((t) => offline.isSaved(t.url))));
  const downloadAll = () => {
    if (!offline) return;
    offline.download(allTracks.flat().map((t) => ({ url: t.url, key: t.key, title: t.title })));
  };
  const numberOf = (/** @type {any} */ g, /** @type {any} */ item, /** @type {number} */ i) => (item.num === 0 ? '·' : item.num || i + 1);
  const resumeWord = resumeAt ? (resumeAt.g.col && resumeAt.g.col.kind === 'chapter' ? 'Chapter ' : 'Letter ') + numberOf(resumeAt.g, resumeAt.item, resumeAt.g.items.indexOf(resumeAt.item)) : '';

  return (
    <ScreenLayout navChildren={LibraryNav({ onBack: props.onBack, backLabel: props.backLabel, showHome: false, onSearch: props.onSearch, onHistory: props.onHistory, onSettings: props.onSettings, theme: props.theme, onThemeChange: props.onThemeChange })}>
      <div className="listen-screen listen-source">
        <Eyebrow>{src.eyebrow}</Eyebrow>
        <h1 className="listen-source-title">{src.title || 'Recordings'}</h1>
        {src.line ? <p className="listen-source-line">{src.line}</p> : null}
        {firstGroup && firstGroup.items.length ? (
          <div className="listen-source-actions">
            <button type="button" className="listen-pill" disabled={!online && !allOnPhone && !resumeAt} onClick={() => (resumeAt ? play(resumeAt.g, resumeAt.item) : play(firstGroup, firstGroup.items[0]))}>
              <PlayGlyph />{resumeAt ? 'Resume · ' + resumeWord : key.lastIndexOf('voice:', 0) === 0 ? 'Play all' : 'Play'}
            </button>
            {offline ? (
              <button type="button" className="listen-outline" disabled={allOnPhone || !online} onClick={downloadAll}>
                {allOnPhone ? 'Downloaded' : 'Download' + (sizeKnown ? ' · ' + formatBytes(sizeKnown) : '')}
              </button>
            ) : null}
          </div>
        ) : <p className="listen-source-line">Not recorded yet.</p>}
        {src.groups.map((g) => (
          <section key={g.volKey + g.heading} className="listen-source-group" aria-label={g.heading || src.title}>
            {g.heading ? <Eyebrow>{g.heading}</Eyebrow> : null}
            {g.items.map((item, i) => {
              const tracks = tracksOf(g, item);
              const reader = g.reader ? '' : listenReaderLine(tracks[0]);
              return (
                <SourceRow key={item.id} n={numberOf(g, item, i)} title={item.title || 'Untitled'} tracks={tracks} reader={reader}
                  playing={!!(current && live && current.key === g.volKey + ':' + item.id)} onPlay={() => play(g, item)}
                  offline={offline} online={online} name={item.title || 'this recording'} />
              );
            })}
          </section>
        ))}
      </div>
    </ScreenLayout>
  );
}

/**
 * Every recording started, newest first (YOUR LISTENING › History).
 * @param {{ onBack: () => void, backLabel?: string, onOpenNowPlaying: () => void,
 *   onSearch: () => void, onHistory: () => void, onSettings: () => void, theme: any, onThemeChange: (t: any) => void }} props
 */
export function ListenHistory(props) {
  const { library } = useListenStores();
  const recent = library && typeof library.recent === 'function' ? library.recent() : [];
  return (
    <ScreenLayout navChildren={LibraryNav({ onBack: props.onBack, backLabel: props.backLabel, showHome: false, onSearch: props.onSearch, onHistory: props.onHistory, onSettings: props.onSettings, theme: props.theme, onThemeChange: props.onThemeChange })}>
      <div className="listen-screen">
        <Eyebrow>Your Listening</Eyebrow>
        <h1 className="listen-source-title">History</h1>
        {recent.map((t) => (
          <ListenRow key={t.url} title={trackName(t)} line={[listenEyebrow(t), minutesLeft(t), relativePlayedAt(t.playedAt)].filter(Boolean).join(' · ')}
            onClick={() => { AudioPlayer.playTrack(t); props.onOpenNowPlaying(); }} />
        ))}
      </div>
    </ScreenLayout>
  );
}
