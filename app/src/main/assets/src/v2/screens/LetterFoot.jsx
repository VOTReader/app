/* LetterFoot - a letter's foot (mw7, v2-gaps 21 + 18's card; design dz23, pictures 1k and 1l): main's related-section
   (LetterView.jsx 578-670) after the Footnotes list and before the Next card, in main's order: Also read, Related topics,
   Bible study, Songs from this letter, Audio, Videos. A group shows only when the letter has it; a letter with none ends
   as before (1f).

   A row in the app wears a chevron: a letter the corpus names opens as a new page (Back says this letter), an Answers topic
   that main's index places (bundle-d's window.__answersIdForUrl, utils/answers-links.js) opens as one once the Answers
   corpus is in. A row that leaves the app wears the ext arrow and is a plain link (target=_blank: the system browser in the
   APK, a new tab on the web, as main). One change from main (design): a video row whose address is the channel's front page
   (187 of 213 videoMusicUrl values) is not a video of this letter, so it is dropped, and the channel alone makes no group.

   Songs from this letter (main's LetterSongsCard): with Settings > Hear it sung on and songs that sing the letter's words,
   up to 3 rows (one per song, its versions behind "N versions" on the Songs place), "All N songs of this letter" past 3,
   then main's keep button and its other states (bundle-d's SongKeep). A gate boot draws its row's open.songs, inert. */
import { Icon } from '../Icon.jsx';
import { letterRoute, findLetterRoute } from '../letter-links.js';
import { askAnswersCorpus } from '../corpus.js';
import { useVerbatimSongs } from '../more-menu.jsx';
import { useOnline } from '../offline-facts.js';
import { placeFor } from '../places.js';

const g = /** @type {any} */ (globalThis);
const NO_SUB = () => () => {};
const ZERO = () => 0;

/** Main's own channel row (LetterView.jsx: always last in Videos). */
export const CHANNEL_URL = 'https://www.youtube.com/user/trumpetcallofgod';
/** Main's CARD_SONGS: the card's rows; past these, "All N songs of this letter". */
export const CARD_SONGS = 3;

/** True when `url` is the channel's front page (http or https, www or not, a trailing slash or not). @param {any} url */
export function isChannel(url) {
  return typeof url === 'string' && /^https?:\/\/(www\.)?youtube\.com\/user\/trumpetcallofgod\/?$/i.test(url.trim());
}

const HOSTS = [[/(^|\.)bandcamp\.com$/i, 'Bandcamp'], [/(^|\.)(youtube\.com|youtu\.be)$/i, 'YouTube'], [/(^|\.)dropbox\.com$/i, 'Dropbox']];

/** The word on a row's right for where it goes ("Bandcamp", "YouTube"), or '' for a host with no name here. @param {any} url */
export function hostOf(url) {
  let h = '';
  try { h = new URL(String(url)).hostname; } catch (_e) { return ''; }
  const hit = HOSTS.find(([re]) => /** @type {RegExp} */ (re).test(h));
  return hit ? /** @type {string} */ (hit[1]) : '';
}

/**
 * @typedef {{ t: string, url?: string, host?: string, lead?: string, link?: any, answers?: string }} FootRow
 *   link: a letter the corpus names ({ collection, letterTitle } or { id }); answers: an Answers topic id; neither = out
 * @typedef {{ id: string, label: string, rows: FootRow[] }} FootGroup
 */

/** A related row (Related topics, Bible study) as main sends it. @returns {FootRow | null} */
function relatedRow(t, gl) {
  if (!t || !t.label) return null;
  if (t.link) return { t: t.label, url: t.url, link: t.link };
  const place = typeof gl.__answersIdForUrl === 'function' ? gl.__answersIdForUrl : null;
  const answers = place && t.url ? place(t.url) : null;
  if (answers) return { t: t.label, url: t.url, answers };
  return t.url ? { t: t.label, url: t.url } : null;
}

/**
 * The foot's link groups, in main's order (songs are their own card, between Bible study and Audio).
 * @param {any} letter @returns {{ before: FootGroup[], after: FootGroup[] }}
 */
export function footGroups(letter, gl = g) {
  /** @type {FootGroup[]} */
  const before = [];
  /** @type {FootGroup[]} */
  const after = [];
  if (!letter) return { before, after };
  if (letter.addendum) {
    const link = letter.addendumLink || (letter.addendumInternal ? { id: letter.addendumInternal } : null);
    const row = link ? { t: letter.addendum, url: letter.addendumUrl, link } : letter.addendumUrl ? { t: letter.addendum, url: letter.addendumUrl } : null;
    if (row) before.push({ id: 'also', label: 'Also read', rows: [row] });
  }
  for (const [id, label, list] of [['related', 'Related topics', letter.relatedTopics], ['study', 'Bible study', letter.bibleStudies]]) {
    const rows = (Array.isArray(list) ? list : []).map((t) => relatedRow(t, gl)).filter(Boolean);
    if (rows.length) before.push({ id: /** @type {string} */ (id), label: /** @type {string} */ (label), rows: /** @type {FootRow[]} */ (rows) });
  }
  /** @type {FootRow[]} */
  const audio = [];
  if (letter.audioUrl) audio.push({ t: 'Audio recording', url: letter.audioUrl, host: hostOf(letter.audioUrl), lead: 'music' });
  if (letter.soundcloudUrl) audio.push({ t: 'Listen on SoundCloud', url: letter.soundcloudUrl, lead: 'music' });
  if (audio.length) after.push({ id: 'audio', label: 'Audio', rows: audio });
  /** @type {FootRow[]} */
  const videos = [];
  for (const v of Array.isArray(letter.videos) ? letter.videos : []) {
    if (v && v.url && v.label && !isChannel(v.url)) videos.push({ t: v.label, url: v.url, host: hostOf(v.url), lead: 'play' });
  }
  if (letter.videoVoiceUrl && !isChannel(letter.videoVoiceUrl)) {
    videos.push({ t: letter.videoVoiceLabel || 'Video (with voice over)', url: letter.videoVoiceUrl, host: hostOf(letter.videoVoiceUrl), lead: 'play' });
  }
  if (letter.videoMusicUrl && !isChannel(letter.videoMusicUrl)) {
    videos.push({ t: 'Video (excerpts set to music)', url: letter.videoMusicUrl, host: hostOf(letter.videoMusicUrl), lead: 'play' });
  }
  if (videos.length) {
    videos.push({ t: 'Official YouTube channel', url: CHANNEL_URL, lead: 'play' });
    after.push({ id: 'videos', label: 'Videos', rows: videos });
  }
  return { before, after };
}

/** Main's formatSongBytes (utils/song-keep.js): MB = bytes / 1e6, one decimal under 10. @param {number} n */
export function songBytes(n) {
  if (!(n > 0)) return '0 MB';
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + ' GB';
  const mb = n / 1e6;
  return (mb < 10 ? mb.toFixed(1).replace(/\.0$/, '') : String(Math.round(mb))) + ' MB';
}

/** Main's songClock: 201.2 -> "3:21". @param {any} value */
export function songClock(value) {
  const total = Math.max(0, Math.round(Number(value) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const ss = (total % 60 < 10 ? '0' : '') + (total % 60);
  return h ? h + ':' + (m < 10 ? '0' : '') + m + ':' + ss : m + ':' + ss;
}

/** Re-renders when a bundle-d store says it changed (never on a gate boot). */
function useStore(store) {
  const live = !!(store && typeof store.subscribe === 'function' && typeof store.getVersion === 'function');
  React.useSyncExternalStore(live ? store.subscribe : NO_SUB, live ? store.getVersion : ZERO);
}

/**
 * Opens a row in the app: a letter the corpus names, or an Answers topic once that corpus is in; its address outside the
 * app when neither is there.
 * @param {FootRow} row @param {((route: any) => void) | undefined} onGo
 */
export function openRow(row, onGo, gl = g) {
  const out = () => { if (row.url) gl.open(row.url, '_blank', 'noopener'); };
  if (row.link) {
    const now = letterRoute(row.link, gl);
    if (now) { if (onGo) onGo(now); return Promise.resolve(); }
    return findLetterRoute(row.link, gl).then((r) => { if (r && onGo) onGo(r); else out(); });
  }
  if (row.answers) {
    const id = row.answers;
    return askAnswersCorpus(gl).then(() => letterRoute({ id }, gl), () => null).then((r) => { if (r && onGo) onGo(r); else out(); });
  }
  out();
  return Promise.resolve();
}

/** @param {{ row: FootRow, live: boolean, onGo?: (route: any) => void }} props */
function Row({ row, live, onGo }) {
  if (row.link || row.answers) {
    return (
      <button type="button" className="lfr" onClick={() => { if (live) void openRow(row, onGo); }}>
        <span className="tx">{row.t}</span><Icon name="chev" />
      </button>
    );
  }
  return (
    <a className="lfr out" href={row.url} target="_blank" rel="noopener noreferrer" aria-label={row.t + ', opens outside the app'}
      onClick={live ? undefined : (e) => e.preventDefault()}>
      {row.lead && <Icon name={row.lead} size={16} className="lead" />}
      <span className="tx">{row.t}</span>
      {row.host && <span className="host">{row.host}</span>}
      <Icon name="ext" />
    </a>
  );
}

/** @param {{ group: FootGroup, live: boolean, onGo?: (route: any) => void }} props */
function Group({ group, live, onGo }) {
  return (
    <div className="lfg" data-foot={group.id}>
      <span className="label">{group.label}</span>
      {group.rows.map((row, i) => <Row key={i} row={row} live={live} onGo={onGo} />)}
    </div>
  );
}

/**
 * @typedef {{ id: string, t?: string, f?: string, v?: string, d?: number, b?: number, versions?: number, kept?: boolean }} FootSong
 *   a gate row's song carries what the catalog would say: its family's versions and whether it is kept
 */

/** The player's song now, by id ('' when none), and whether it sounds. */
function usePlaying(live) {
  const A = live ? g.AudioPlayer : null;
  useStore(A);
  if (!A || typeof A.getState !== 'function') return { id: '', on: false };
  const st = A.getState() || {};
  const cur = Array.isArray(st.queue) ? st.queue[st.qi] : null;
  const key = cur && typeof cur.key === 'string' ? cur.key : '';
  return { id: key.indexOf('song:') === 0 ? key.slice(5) : '', on: st.status === 'playing' || st.status === 'loading' };
}

/** A gate row's songs (states.json's, as open.songs: an array; 1h's `songs: true` is the ... menu's alone). @returns {FootSong[]} */
const gateSongs = (gate) => (gate && gate.open && Array.isArray(gate.open.songs) ? gate.open.songs : []);

/**
 * Songs from this letter (1l). `songs` the catalog's verbatim songs for it; `letterKey` '<volKey>:<id>'; `title` the
 * player's label for them.
 * @param {{ songs: FootSong[], letterKey: string, title: string, gate: any, go?: (route: any) => void }} props
 */
function LetterSongs({ songs, letterKey, title, gate, go }) {
  const live = !gate;
  const C = live ? g.SongCatalog : null;
  const playing = usePlaying(live);
  /** @type {FootSong[]} one row per song, led by the version that sings the letter's words (main's leads) */
  const leads = [];
  const seen = new Set();
  for (const s of songs) {
    const fam = s.f || s.id;
    if (!seen.has(fam)) { seen.add(fam); leads.push(s); }
  }
  const songsPlace = !!placeFor('songs');
  const ids = songs.map((s) => s.id);
  return (
    <div className="lfg" data-foot="songs">
      <span className="label">Songs from this letter</span>
      <div className="lfs">
        {leads.slice(0, CARD_SONGS).map((lead) => {
          const fam = C && lead.f ? C.familyById(lead.f) : null;
          const count = gate ? lead.versions || 1 : fam ? C.versionsOf(fam).length : 1;
          const name = (fam && fam.t) || lead.t || '';
          const playingSong = playing.id && C ? C.songById(playing.id) : null;
          const current = !!(playingSong && playingSong.f === lead.f);
          const on = current && playing.on;
          const play = () => {
            const A = live ? g.AudioPlayer : null;
            if (!A) return;
            if (current) { A.toggle(); return; }
            A.playSongs({ ids, startId: lead.id, label: title || 'Songs of this letter' });
          };
          const thumb = C && typeof C.songThumbUrl === 'function' ? C.songThumbUrl(lead, 256)
            : g.SongCatalog && typeof g.SongCatalog.songThumbUrl === 'function' ? g.SongCatalog.songThumbUrl(lead, 256) : '';
          const versions = count > 1 && (
            <div className="s">
              {songsPlace && live
                ? <button type="button" className="vers" onClick={(e) => { e.stopPropagation(); if (go) go({ place: 'song', family: lead.f }); }}
                  aria-label={'All ' + count + ' versions of ' + name}>{count} versions<Icon name="chev" /></button>
                : <span className="vers">{count} versions</span>}
            </div>
          );
          return (
            <div key={lead.f || lead.id} className="row song" onClick={play}>
              {thumb ? <img className="sc" src={thumb} alt="" decoding="async" /> : <span className="sc" />}
              <div className="tx">
                <div className="t">{name}</div>
                {versions || <div className="s"><i>{lead.v || 'Songs of the Letters'}</i></div>}
              </div>
              {lead.d ? <span className="ln num">{songClock(lead.d)}</span> : null}
              <button type="button" className={'rp' + (on ? ' on' : '')} aria-label={(on ? 'Pause ' : 'Play ') + name}
                onClick={(e) => { e.stopPropagation(); play(); }}>
                <Icon name={on ? 'pause' : 'play'} size={16} />
              </button>
            </div>
          );
        })}
      </div>
      {leads.length > CARD_SONGS && songsPlace && (
        <button type="button" className="lfr" onClick={() => { if (live && go) go({ place: 'songs', list: 'sung:' + letterKey }); }}>
          <span className="tx">All {leads.length} songs of this letter</span><Icon name="chev" />
        </button>
      )}
      <SongsKeep ids={ids} noteKey={'keep-letter-' + letterKey} gate={gate}
        label={songs.length > 1 ? 'Keep these ' + songs.length + ' songs' : 'Keep this song'} />
    </div>
  );
}

/**
 * Main's SongKeepAction in the kit: Keep (size) / On this phone (size) / Keeping... with Cancel / Needs a connection.
 * A gate boot keeps nothing: its songs' own bytes make the button's size.
 * @param {{ ids: string[], noteKey: string, label: string, gate: any }} props
 */
function SongsKeep({ ids, noteKey, label, gate }) {
  const keep = gate ? null : g.SongKeep;
  useStore(keep);
  const online = useOnline(gate);
  if (gate) {
    const bytes = gateSongs(gate).reduce((n, s) => n + (Number(s.b) || 0), 0);
    return <button type="button" className="btn2 sm lfk"><Icon name="downCircle" />{label + ' · ' + songBytes(bytes)}</button>;
  }
  if (!keep || typeof keep.availability !== 'function' || !ids.length) return null;
  const avail = keep.availability();
  if (avail === 'none') return null;
  if (avail === 'ios-tab') return <p className="lfk-line">Add VOTReader to your Home Screen to keep songs</p>;
  const p = keep.progressOf(ids);
  const note = typeof keep.noteFor === 'function' ? keep.noteFor(noteKey) : null;
  let body;
  if (p.kept === p.total) {
    body = <p className="lfk-line"><Icon name="checkCircle" />{(p.total > 1 ? 'All ' + p.total + ' on this phone' : 'On this phone') + ' · ' + songBytes(p.bytes)}</p>;
  } else if (p.busy) {
    body = (
      <p className="lfk-line" role="status">
        <Icon name="downCircle" />{'Keeping ' + p.kept + ' of ' + p.total + '...'}
        <button type="button" className="textbtn sm" onClick={() => keep.cancel(ids)}>Cancel</button>
      </p>
    );
  } else {
    body = (
      <button type="button" className="btn2 sm lfk" disabled={!online} onClick={() => { void keep.keep(ids, noteKey); }}>
        <Icon name="downCircle" />{label + ' · ' + songBytes(p.needBytes)}
      </button>
    );
  }
  return (
    <>
      {body}
      {!online && p.kept < p.total && !p.busy && <p className="lfk-line">Needs a connection</p>}
      {note && <p className="lfk-line" role="status">{note}</p>}
    </>
  );
}

/**
 * @param {{ letter: any, volKey: string, gate: any, onGo?: (route: any) => void }} props
 */
export function LetterFoot({ letter, volKey, gate, onGo }) {
  const live = !gate;
  const { before, after } = React.useMemo(() => footGroups(letter), [letter]);
  const letterKey = letter && volKey ? volKey + ':' + letter.id : '';
  const found = useVerbatimSongs(live ? letterKey : '', null);
  /** @type {FootSong[]} */
  const songs = gate ? gateSongs(gate) : found;
  if (!before.length && !after.length && !songs.length) return null;
  return (
    <div className="lft">
      {before.map((grp) => <Group key={grp.id} group={grp} live={live} onGo={onGo} />)}
      {songs.length > 0 && <LetterSongs songs={songs} letterKey={letterKey} title={letter.title} gate={gate} go={onGo} />}
      {after.map((grp) => <Group key={grp.id} group={grp} live={live} onGo={onGo} />)}
    </div>
  );
}
