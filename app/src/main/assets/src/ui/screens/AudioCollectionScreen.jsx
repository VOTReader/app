/*
   AudioCollectionScreen -- every recording of ONE source, in reading order.

   Two shapes of source share this screen: a VOT letter collection (resolved
   through the COLLECTIONS registry globals) and a recorded Bible edition
   (resolved through BIBLE_AUDIO_EDITIONS + its manifest), whose rows are its
   BOOKS and whose chapters disclose beneath them. Only rows that
   actually have a recording are listed; the footer says plainly how many
   still await one, because a silent gap reads as a bug.

   A tap on a row starts the WHOLE source at that letter -- the forward-only
   album queue playCollection builds -- so listening continues past the end
   of the letter that was chosen. Where a letter has more than one complete
   reading, the row discloses the voices and each one starts the same queue
   on that rendition.
*/
import { OfflineCollectionMark, OfflineNote, rowOnPhone, useOfflineAudio, useOnline } from '../components/OfflineAudioControls.jsx';
import { CollectionDownload } from '../components/CollectionDownload.jsx';
import { ActionSheet } from '../components/SelectField.jsx';
import { EmptyState, ListGroup, ListRow, RowPlay, SectionLabel, Segmented, UiButton } from '../components/UiParts.jsx';
import { studyTitleParts } from '../../utils/study-titles.js';
import { editionName, editionReading } from './AudioBibleScreen.jsx';
import { UiIcon } from '../components/UiIcon.jsx';
import { audioLibraryStore } from '../components/AudioShelf.jsx';
import { toggleSavedRecording } from '../../utils/saved-shelf.js';
import { CoverageBadge } from '../components/CoverageBadge.jsx';
import { COVERAGE_READ_ALONG, bibleBookPartialDetail } from '../../utils/audio-coverage.js';
import { queueMenuItems } from '../components/queue-menu.js';
import { chapterTitleOf } from '../components/AudioShelf.jsx';
import { formatClock } from '../components/AudioSeekSlider.jsx';
import { queueTime } from '../components/PlayerSheets.jsx';
import { secondsOf, lengthsReady, lengthsStore } from '../../utils/audio-lengths.js';
import { useStoreVersionByName, useStoreVersion } from '../../hooks/use-store-version.js';

/* Cluster H (the Listening Library) - bundle-d since lz1 (2026-10-13); it
   rode lazy bundle-h from 2026-09-22, landing 24, and the player itself did
   NOT come along: AudioPlayer, the AudioShelf rows, icons
   and position hook, AudioSeekSlider, CoverageBadge and the audio tables stay
   in bundle-d, where AudioPlayerBar and AudioManagerSheet reach them on every
   screen. This file reads them as free globals at call time — one player, one
   shelf, one copy of each table. */

/** 'bible-*' volKeys are recorded Bible editions, not letter collections. */
/** Chapters a book shows before "Show all N chapters". */
const CHAPTERS_SHOWN = 7;

/** 'ot' for BIBLE_AUDIO_BOOKS' first 39 books, else 'nt'. @param {string} bookId @returns {'ot' | 'nt'} */
function bookHalf(bookId) {
  const books = typeof BIBLE_AUDIO_BOOKS !== 'undefined' && Array.isArray(BIBLE_AUDIO_BOOKS) ? BIBLE_AUDIO_BOOKS : [];
  const at = books.findIndex((b) => b[0] === bookId);
  return at >= 0 && at < 39 ? 'ot' : 'nt';
}

function isBibleVol(volKey) {
  return typeof volKey === 'string' && volKey.lastIndexOf('bible-', 0) === 0;
}

/**
 * 'study:<studyId>' names ONE Bible/Letter Study (the Studies screen, 2026-09-22):
 * its chapters are the items, and the player knows them as volKey 'study'
 * ("study:<chapterId>" in the manifest). Null for any other source.
 * @param {string} volKey
 * @returns {string | null}
 */
function studyIdOf(volKey) {
  return typeof volKey === 'string' && volKey.lastIndexOf('study:', 0) === 0 ? volKey.slice(6) : null;
}

/**
 * The source's display label plus its caller-ordered items (preface first
 * where one exists). An unknown volKey resolves to an empty source rather
 * than throwing — a stale tab must render a way back, not a blank screen.
 *
 * @param {string} volKey
 * @returns {{ label: string, items: Array<any>, col: any, preface?: any }}
 */
function resolveSource(volKey) {
  const studyId = studyIdOf(volKey);
  if (studyId) {
    const studies = typeof BIBLE_STUDIES !== 'undefined' && Array.isArray(BIBLE_STUDIES) ? BIBLE_STUDIES : [];
    const study = studies.find((entry) => entry && (entry.id === studyId || entry.slug === studyId)) || null;
    return { label: study ? study.title || '' : '', items: study && Array.isArray(study.chapters) ? study.chapters : [], col: { kind: 'chapter' } };
  }
  if (isBibleVol(volKey)) {
    const edition = Object.values(BIBLE_AUDIO_EDITIONS).find((entry) => entry && entry.volKey === volKey) || null;
    const books = typeof BIBLE_AUDIO_BOOKS !== 'undefined' && Array.isArray(BIBLE_AUDIO_BOOKS) ? BIBLE_AUDIO_BOOKS : [];
    const manifest = typeof BIBLE_AUDIO_MANIFEST !== 'undefined' ? BIBLE_AUDIO_MANIFEST : null;
    const items = books
      .map((book) => ({ id: book[0], title: book[1] }))
      .filter((book) => !!(manifest && manifest[volKey + ':' + book.id]));
    return { label: edition ? edition.label : '', items, col: null };
  }
  const col = typeof COL_BY_KEY !== 'undefined' && volKey ? COL_BY_KEY.get(volKey) : null;
  if (!col) return { label: '', items: [], col: null };
  const preface = typeof colPreface === 'function' ? colPreface(col) : null;
  const letters = typeof colLetterArr === 'function' ? (colLetterArr(col) || []) : [];
  return { label: col.label || '', items: preface ? [preface, ...letters] : letters, col, preface };
}

/** Letters, a study's chapters, or entries for the WTLB and Blessed families. The Holy Days hold letters: their
 *  Read tile says 'N Letters' (VolumesHome), and the two screens name a collection's pieces alike (L4). */
export function itemNoun(col, count) {
  if (col && col.kind === 'chapter') return count === 1 ? 'chapter' : 'chapters';
  const entry = !!(col && col.kind && col.kind !== 'letter' && col.kind !== 'holy-days');
  return count === 1 ? (entry ? 'entry' : 'letter') : (entry ? 'entries' : 'letters');
}

/** A reading's whole length from the lengths baked into the build (U04.1), or 0 while any part is unknown.
 *  @param {any[]} tracks @returns {number} */
export function tracksSeconds(tracks) {
  let total = 0;
  for (const t of tracks || []) { const s = secondsOf(t && t.url); if (!(s > 0)) return 0; total += s; }
  return total;
}

/** The hero's count line, from the list the Read tile counts (colLetterArr): letters counted as letters and the
 *  preface named on its own. It said 'All 30 letters have recordings' for Volume One, whose Read tile says
 *  '29 Letters' - the preface counted as a letter (zones L4, 2026-10-05; VolumesHome.parity.test.jsx). */
export function recordingsLine(col, items, playable, preface) {
  const n = items.length - (preface ? 1 : 0);
  const heard = playable.length - (preface && playable.indexOf(preface) >= 0 ? 1 : 0);
  return (heard === n ? 'All ' + n : heard + ' of ' + n) + ' ' + itemNoun(col, n) + (heard < playable.length ? ' and the preface' : '') + ' have recordings';
}

/**
 * @param {{
 *   volKey: string,
 *   onBack: () => void,
 *   backLabel?: string,
 *   onOpenText: (track: any) => void,
 *   onSearch: () => void,
 *   onHistory: () => void,
 *   onSettings: () => void,
 *   theme: any,
 *   onThemeChange: (theme: any) => void,
 * }} props
 */
export function AudioCollectionScreen({ volKey, onBack, backLabel = 'Back to Listen', onOpenText }) {
  // Not the 1 Hz clock: nothing here draws it (s18.3).
  React.useSyncExternalStore(React.useCallback((cb) => AudioPlayer.subscribe(cb), []), AudioPlayer.getShape);
  useAudioPositions();
  // Recording lengths (U04.1) ride a lazy file: paint again when it lands.
  useStoreVersion(lengthsStore);
  React.useEffect(() => { void lengthsReady(); }, []);

  const bible = isBibleVol(volKey);
  // A study's recordings are 'study:<chapterId>' to the player, whatever study
  // this screen shows; every other source is its own player volKey.
  const study = studyIdOf(volKey);
  const srcKey = study ? 'study' : volKey;
  // Letter audio needs the lazy VOT corpus (registry + manifest); the Bible
  // editions ride bundle-a and must never wait on it.
  React.useEffect(() => {
    if (!bible && typeof window.__loadVotCorpus === 'function') void window.__loadVotCorpus();
  }, [bible]);
  // A study also needs its own lazy file, the studies registry.
  const [, setStudiesLanded] = React.useState(0);
  React.useEffect(() => {
    if (!study) return undefined;
    let live = true;
    const load = /** @type {any} */ (window).loadBibleStudies;
    if (typeof load === 'function') Promise.resolve(load()).then(() => { if (live) setStudiesLanded((n) => n + 1); }, () => {});
    return () => { live = false; };
  }, [study]);
  useStoreVersionByName('__votCorpus');

  // The row whose menu sheet is open (listen.html au-rowmenu), by item id.
  const [menuFor, setMenuFor] = React.useState(/** @type {string | null} */ (null));
  // The Save star on every row (X-hidden-decisions: "Save a recording" was hidden in the player's menu).
  const library = audioLibraryStore();
  React.useSyncExternalStore(
    React.useCallback((cb) => (library && typeof library.subscribe === 'function' ? library.subscribe(cb) : () => {}), [library]),
    React.useCallback(() => (library && typeof library.getVersion === 'function' ? library.getVersion() : 0), [library])
  );
  // Downloads to the phone (item 8): the store where downloads are possible (the Android app, or a browser: cf1), else null; and the signal.
  const offline = useOfflineAudio();
  const online = useOnline();
  // One book's chapters, disclosed. Rendered only while open — a Bible edition
  // lists 66 books and Psalms alone would put 150 rows on the page uninvited.
  const [openChapters, setOpenChapters] = React.useState(/** @type {string | null} */ (null));
  // A book's chapters past the first seven wait behind "Show all N chapters" (listen.html au-chapters).
  const [allChapters, setAllChapters] = React.useState(/** @type {string | null} */ (null));
  // The Old / New Testament switch (au-books): the half the playing book is in, else the Old.
  const [half, setHalf] = React.useState(() => {
    const st = AudioPlayer.getState();
    const now = Array.isArray(st.queue) ? st.queue[st.qi] : null;
    const id = now && typeof now.key === 'string' && now.key.indexOf(volKey + ':') === 0 ? now.key.slice(volKey.length + 1) : '';
    return id && bookHalf(id) === 'nt' ? 'nt' : 'ot';
  });

  const { label, items, col } = resolveSource(volKey);
  const playable = items.filter((item) => item && item.id && AudioPlayer.hasAudio(srcKey, item.id));
  const missing = items.length - playable.length;
  const sections = bible || study ? null : AudioPlayer.sectionsFor(volKey);
  // Per ROW, through the one rule every Listening Library surface uses: a
  // collection that declares a letter screen, or any Bible edition (whose
  // tracks open the book's chapter in the reader). The screen-level `!bible`
  // gate withheld the icon from Bible rows that hasTextDestination resolves.
  const canOpenText = typeof onOpenText === 'function';
  // A partly recorded study names what a listener will skip (Codex critique 4,
  // 2026-09-23: Lamb's '14 of 16' left the two unnamed), each name opening its
  // text; past three names it only counts them.
  const textOnly = study && playable.length ? items.filter((item) => item && item.id && playable.indexOf(item) < 0) : [];

  const state = AudioPlayer.getState();
  const queue = Array.isArray(state.queue) ? state.queue : [];
  const current = queue[state.qi] || null;
  const live = state.status === 'playing' || state.status === 'loading';

  // A Bible edition's bar says its name ("KJV"); the line under it says the reading (listen.html au-books).
  const edition = bible ? Object.values(BIBLE_AUDIO_EDITIONS).find((entry) => entry && entry.volKey === volKey) || null : null;
  // A study's bar says its own name ("Purity"); what it is goes on the line under it (listen.html au-study).
  const studyName = study && label ? studyTitleParts(label).head || label : '';
  const utility = { title: (edition ? editionName(edition) : studyName || label) || 'Recordings', onBack, backLabel };

  if (!label && !items.length) {
    return (
      <ScreenLayout utility={utility}>
        <div className="audio-library-screen listen-screen">
          <EmptyState icon="music" title="No recordings to show" text="This source has no recordings yet; choose another in Listen."
            action={{ label: 'Back to Listen', onClick: onBack }} />
        </div>
      </ScreenLayout>
    );
  }

  // listen.html au-coll: "29 recordings · 2 h 5 min" (the hero's long sentence went with the hero).
  const countLine = bible
    ? (playable.length === 1 ? 'One book' : playable.length + ' books')
    : study ? 'Bible/Letter Study · ' + playable.length + (playable.length === 1 ? ' chapter' : ' chapters')
      : playable.length + (playable.length === 1 ? ' recording' : ' recordings');

  // The reading each row's own Play plays: what a download saves (AudioPlayer.playbackTracks, item 8).
  const ownTracks = (item) => (typeof AudioPlayer.playbackTracks === 'function'
    ? AudioPlayer.playbackTracks(srcKey, item, label)
    : ((AudioPlayer.renditionsFor(srcKey, item, label)[0] || { tracks: [] }).tracks));

  // With no signal in the phone app, Play all plays only what is on the phone (the player passes over the rest), so
  // the button says so instead of promising the whole collection (Codex critique of the built screens, 2026-09-24).
  const onPhone = offline && !online
    ? playable.filter((item) => { const own = ownTracks(item); return own.length > 0 && own.every((t) => offline.isSaved(t.url)); }).length
    : 0;
  const playAllLabel = onPhone === 1 ? 'Play the one on this phone' : onPhone > 1 ? 'Play the ' + onPhone + ' on this phone' : 'Play all';
  // RC.3: offline with none of it on the phone, the hero says that rather than 'All 29 letters have recordings'
  // over rows that each say 'Not on this phone'. RC.4: and the gold button leads to saving them, not to a toast.
  const noneHere = !online && !bible && playable.length > 0
    && !(offline && playable.some((item) => ownTracks(item).some((t) => offline.isSaved(t.url))));
  const saveFirst = noneHere && !!offline && typeof window.__openDownloads === 'function';
  // U04.1: the whole collection's length beside its count, once every reading's length is known.
  let totalSec = 0;
  if (online && !bible) {
    for (const item of playable) { const s = tracksSeconds(ownTracks(item)); if (!s) { totalSec = 0; break; } totalSec += s; }
  }
  const heroLine = noneHere ? 'On this phone: 0 of ' + playable.length + ' · needs a connection'
    : (edition ? editionReading(edition) + ' · ' : '') + countLine + (totalSec > 0 ? ' · ' + queueTime(totalSec) : '');
  // The testament switch shows only for an edition with books in both halves.
  const halves = bible ? { ot: playable.filter((item) => bookHalf(item.id) === 'ot').length, nt: playable.filter((item) => bookHalf(item.id) === 'nt').length } : null;
  const split = !!(halves && halves.ot && halves.nt);
  const shownItems = split ? playable.filter((item) => bookHalf(item.id) === half) : playable;

  const playFrom = (item) => {
    if (current && current.key === srcKey + ':' + item.id) { AudioPlayer.toggle(); return; }
    if (bible) AudioPlayer.playBibleBook({ volKey, bookId: item.id, label });
    else AudioPlayer.playCollection({ volKey: srcKey, items, collectionLabel: label, startId: item.id });
  };

  // The collection's one Download (au-dlcoll): each row's reading in the voice the sheet picks, '' = the one Listen plays.
  const unitsFor = (/** @type {string} */ voice) => playable.map((item) => {
    const own = ownTracks(item);
    const pick = voice ? AudioPlayer.renditionsFor(srcKey, item, label).find((/** @type {any} */ r) => r.reader === voice) : null;
    return { name: item.title || label, tracks: pick ? pick.tracks : own };
  });
  const readers = [...new Set(playable.flatMap((item) => AudioPlayer.renditionsFor(srcKey, item, label).map((/** @type {any} */ r) => r.reader)).filter(Boolean))];
  const openDownloads = (/** @type {'choose' | 'phone'} */ tab) => {
    if (typeof window.__openDownloads === 'function') window.__openDownloads({ tab, focus: volKey }, label);
  };
  const noun = bible ? 'book' : itemNoun(col, 1);
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);
  /** @type {Record<string, { title: string, sub: string, actions: any[] }>} */
  const sheets = {};

  return (
    <ScreenLayout utility={utility}>
      <div className="audio-library-screen listen-screen listen-coll">
        {offline ? <OfflineNote text={'You’re offline. Showing what’s on this phone.'} /> : null}
        <p className="listen-sum">{heroLine}</p>
        {offline && !bible && playable.length ? <OfflineCollectionMark units={playable.map(ownTracks)} /> : null}
        {textOnly.length ? (
          <p className="audio-collection-text-only">
            {textOnly.length > 3 ? textOnly.length + ' ' + itemNoun(col, textOnly.length) + ' are text only' : (
              <>
                {'Text only: '}
                {textOnly.map((item, i) => (
                  <React.Fragment key={item.id}>
                    {i ? ', ' : null}
                    {canOpenText
                      ? <button type="button" className="audio-collection-text-only-link" onClick={() => onOpenText({ key: srcKey + ':' + item.id })}>{item.title}</button>
                      : item.title}
                  </React.Fragment>
                ))}
              </>
            )}
          </p>
        ) : null}
        {playable.length ? (
          <div className="ui-btn-row listen-coll-actions">
            {saveFirst ? (
              <UiButton kind="primary" icon="dl" onClick={() => openDownloads('choose')}>Save recordings to play offline</UiButton>
            ) : (
              <UiButton kind="primary" icon="play" onClick={() => AudioPlayer.playCollection({ volKey: srcKey, items, collectionLabel: label })}>{playAllLabel}</UiButton>
            )}
            {/* The one Download for the whole collection (Corbin 11-11): no single letter has one. A Bible edition
                downloads from Downloads, by edition, testament or book. */}
            {offline && !bible && !saveFirst ? <CollectionDownload label={label} unitsFor={unitsFor} readers={readers} onOpenDownloads={openDownloads} /> : null}
            {offline && bible && typeof window.__openDownloads === 'function'
              ? <UiButton icon="dl" onClick={() => openDownloads('choose')}>Download</UiButton> : null}
          </div>
        ) : null}
        {split && halves ? (
          <Segmented label="Testament" value={half} onChange={(v) => setHalf(v)}
            options={[{ id: 'ot', label: 'Old Testament · ' + halves.ot }, { id: 'nt', label: 'New Testament · ' + halves.nt }]} />
        ) : null}

        {sections ? (
          <section className="listen-coll-sections" aria-labelledby="audio-collection-sections">
            <SectionLabel id="audio-collection-sections">In longer sittings</SectionLabel>
            <div className="ui-chips">
              {sections.map((section, index) => (
                <button key={section[1] || index} type="button" className="ui-chip" onClick={() => AudioPlayer.playSection(volKey, index, label)}>
                  <UiIcon name="play" size="sm" filled /><span>{section[0]}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {playable.length ? (
          <ListGroup className="listen-recs" ariaLabel={playable.length + ' recordings'}>
            {shownItems.map((item) => {
              const key = srcKey + ':' + item.id;
              const renditions = AudioPlayer.renditionsFor(srcKey, item, label);
              const primary = renditions[0] || null;
              // The reading the row's own Play plays (the Letter Voice where that reader recorded it, ra5): the row
              // names ITS reader and length, not the manifest primary's.
              const plays = ownTracks(item);
              const reading = (plays[0] && renditions.find((/** @type {any} */ r) => r.tracks[0] && r.tracks[0].url === plays[0].url)) || primary;
              const isCurrent = !!(current && current.key === key);
              const rowPlaying = isCurrent && live;
              const parts = reading ? reading.tracks.length : 0;
              const reader = reading ? AudioPlayer.readerLabel(reading.reader) : null;
              // U04.1: the reading's length from the build's baked lengths, so it shows offline too.
              const secs = reading ? tracksSeconds(reading.tracks) : 0;
              // A Bible book's "parts" ARE its chapters; its length in hours and minutes, never "215:01" (X lengths).
              const length = secs ? (bible ? queueTime(secs) : formatClock(secs)) : null;
              const meta = [parts > 1 ? parts + (bible ? ' chapters' : ' parts') : null, reader, length].filter(Boolean).join(' · ');
              // A Bible book whose read-along ships before every chapter is aligned says how far it goes (Corbin 10-23).
              const partly = bible ? bibleBookPartialDetail(volKey, item.id) : null;
              const remaining = reading ? renditionRemainingLabel(reading.tracks) : '';
              const own = offline ? plays : [];
              // No signal and not on the phone: the row cannot play (item 8).
              const unavailable = !!offline && !online && !(own.length && own.every((/** @type {any} */ t) => offline.isSaved(t.url)));
              const chapters = bible && parts > 1 ? primary.tracks : null;
              const chaptersOpen = !!chapters && openChapters === item.id;
              // State only (rule 12): a tick once it is on the phone; a book part on it says how much.
              const held = offline ? rowOnPhone(offline, own) : null;
              const heldLine = held && held.state === 'part' ? held.saved + ' of ' + held.count + ' on this phone' : '';
              // RC.5: the one playing from its buffer says so, not 'Not on this phone'.
              const line = unavailable ? (rowPlaying ? 'Playing from the buffer' : 'Not on this phone') : [meta, heldLine, remaining].filter(Boolean).join(' · ');
              const opensText = canOpenText && hasTextDestination({ key });
              const openText = () => onOpenText(current && current.key === key ? current : { key });
              const starTrack = plays[0] || (primary && primary.tracks[0]) || null;
              const starred = !!(library && starTrack && typeof library.isSaved === 'function' && library.isSaved(starTrack));
              const name = item.title || label;
              const toggleStar = () => { if (starTrack) toggleSavedRecording(library, starTrack); };
              // The menu (au-rowmenu): Play next, Add to the end of Up next, Save, Open the letter; a letter read by
              // more than one voice offers the others here, a Bible book its chapters. No download: Downloads has it.
              const queued = unavailable ? [] : queueMenuItems({ tracks: plays, name });
              sheets[item.id] = {
                title: name,
                sub: [label, !bible && item.num ? Noun + ' ' + item.num : null, reader, length].filter(Boolean).join(' · '),
                actions: [
                  ...queued.map((q) => ({ id: q.id, icon: q.id === 'next' ? 'next' : 'plus', label: q.id === 'queue' ? 'Add to the end of Up next' : q.text, onSelect: q.onSelect })),
                  ...(starTrack ? [{ id: 'save', icon: 'star', label: starred ? 'Remove from Saved' : 'Save', onSelect: toggleStar }] : []),
                  ...renditions.filter((/** @type {any} */ r) => r !== reading).map((/** @type {any} */ r) => ({
                    id: 'voice-' + (r.reader || ''), icon: 'mic', label: 'Play in another voice: ' + (AudioPlayer.readerLabel(r.reader) || 'this reading'),
                    onSelect: () => AudioPlayer.playCollection({ volKey: srcKey, items, collectionLabel: label, startId: item.id, startReader: r.reader }),
                  })),
                  ...(chapters ? [{ id: 'chapters', icon: 'list', label: chaptersOpen ? 'Hide the chapters' : 'Show the ' + chapters.length + ' chapters',
                    onSelect: () => setOpenChapters(chaptersOpen ? null : item.id) }] : []),
                  ...(opensText ? [{ id: 'open', icon: 'book', label: 'Open the ' + noun, onSelect: openText }] : []),
                ],
              };
              return (
                <React.Fragment key={item.id}>
                  <ListRow
                    className={'listen-rec' + (unavailable ? ' is-unavailable' : '') + (chapters ? ' listen-book' : '') + (chaptersOpen ? ' is-open' : '')}
                    onClick={chapters ? () => setOpenChapters(chaptersOpen ? null : item.id) : undefined} chevron={!!chapters}
                    ariaLabel={chapters ? (chaptersOpen ? 'Hide the chapters of ' : 'Show the chapters of ') + name : undefined}
                    current={isCurrent}
                    lead={<RowPlay label={(rowPlaying ? 'Pause ' : 'Play ') + (item.title || 'this recording')} playing={rowPlaying} onClick={() => playFrom(item)} />}
                    title={<>{!bible && item.num ? <span className="listen-rec-num">{item.num}</span> : null}{item.title}</>}
                    meta={<>{line}{partly ? <CoverageBadge state={COVERAGE_READ_ALONG} detail={partly} /> : null}</>}
                    mark={!unavailable && held && held.state === 'saved' ? { tick: true, label: 'On this phone' } : null}
                    star={starTrack && !bible ? { on: starred, label: starred ? 'Remove ' + name + ' from Saved' : 'Save ' + name, onClick: toggleStar } : null}
                    menu={{ label: 'More for ' + name, onClick: () => setMenuFor(item.id) }}
                  />
                  {chaptersOpen ? (
                    <div className="listen-chapters" id={'audio-chapters-' + item.id} role="group" aria-label={'Chapters of ' + name}>
                      {(allChapters === item.id ? chapters : chapters.slice(0, CHAPTERS_SHOWN)).map((/** @type {any} */ track, /** @type {number} */ index) => {
                        const chapterNum = index + 1;
                        const playingThis = !!(current && current.url === track.url);
                        // listen.html au-chapters: the number, its headings under it, the length at the right.
                        return (
                          <ListRow key={track.url} current={playingThis}
                            lead={<RowPlay label={'Play ' + name + ' ' + chapterNum} onClick={() => AudioPlayer.playBibleBook({ volKey, bookId: item.id, label, chapterNum })} />}
                            title={track.partLabel || ('Chapter ' + chapterNum)} meta={chapterTitleOf(track) || null}
                            value={secondsOf(track.url) ? formatClock(secondsOf(track.url)) : ''} />
                        );
                      })}
                      {allChapters !== item.id && chapters.length > CHAPTERS_SHOWN ? (
                        <button type="button" className="ui-link listen-chapters-all" onClick={() => setAllChapters(item.id)}>
                          {'Show all ' + chapters.length + ' chapters'}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </React.Fragment>
              );
            })}
          </ListGroup>
        ) : (
          <EmptyState icon="music" title="No recordings here yet" text="They arrive as each reading is finished." />
        )}
        {missing > 0 ? <p className="listen-coll-note">{missing} {itemNoun(col, missing)} {missing === 1 ? 'awaits' : 'await'} recording.</p> : null}
      </div>
      {menuFor && sheets[menuFor] ? (
        <ActionSheet open onClose={() => setMenuFor(null)} title={sheets[menuFor].title} sub={sheets[menuFor].sub} actions={sheets[menuFor].actions} />
      ) : null}
    </ScreenLayout>
  );
}
