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

import { AudioPlayer } from '../../utils/audio-player.js';
import { BIBLE_AUDIO_EDITIONS } from '../../utils/audio-track.js';
import { ChevronIcon, PauseIcon, PlayIcon, TextIcon, hasTextDestination, renditionRemainingLabel, useAudioPositions } from '../components/AudioShelf.jsx';

/** 'bible-*' volKeys are recorded Bible editions, not letter collections. */
function isBibleVol(volKey) {
  return typeof volKey === 'string' && volKey.lastIndexOf('bible-', 0) === 0;
}

/**
 * The source's display label plus its caller-ordered items (preface first
 * where one exists). An unknown volKey resolves to an empty source rather
 * than throwing — a stale tab must render a way back, not a blank screen.
 *
 * @param {string} volKey
 * @returns {{ label: string, items: Array<any>, col: any }}
 */
function resolveSource(volKey) {
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
  return { label: col.label || '', items: preface ? [preface, ...letters] : letters, col };
}

/** Letters, or entries for the WTLB/Blessed/Holy-Days families. */
function itemNoun(col, count) {
  const entry = !!(col && col.kind && col.kind !== 'letter');
  return count === 1 ? (entry ? 'entry' : 'letter') : (entry ? 'entries' : 'letters');
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
export function AudioCollectionScreen({ volKey, onBack, backLabel = 'Listening Library', onOpenText, onSearch, onHistory, onSettings, theme, onThemeChange }) {
  React.useSyncExternalStore(AudioPlayer.subscribe, AudioPlayer.getVersion);
  useAudioPositions();

  const bible = isBibleVol(volKey);
  // Letter audio needs the lazy VOT corpus (registry + manifest); the Bible
  // editions ride bundle-a and must never wait on it.
  React.useEffect(() => {
    if (!bible && typeof window.__loadVotCorpus === 'function') void window.__loadVotCorpus();
  }, [bible]);
  React.useSyncExternalStore(
    React.useCallback((callback) => typeof window.__votCorpus !== 'undefined' ? window.__votCorpus.subscribe(callback) : () => {}, []),
    () => typeof window.__votCorpus !== 'undefined' ? window.__votCorpus.getVersion() : 0
  );

  const [openVoices, setOpenVoices] = React.useState(/** @type {string | null} */ (null));
  // One book's chapters, disclosed. Rendered only while open — a Bible edition
  // lists 66 books and Psalms alone would put 150 rows on the page uninvited.
  const [openChapters, setOpenChapters] = React.useState(/** @type {string | null} */ (null));

  const { label, items, col } = resolveSource(volKey);
  const playable = items.filter((item) => item && item.id && AudioPlayer.hasAudio(volKey, item.id));
  const missing = items.length - playable.length;
  const sections = bible ? null : AudioPlayer.sectionsFor(volKey);
  // Per ROW, through the one rule every Listening Library surface uses: a
  // collection that declares a letter screen, or any Bible edition (whose
  // tracks open the book's chapter in the reader). The screen-level `!bible`
  // gate withheld the icon from Bible rows that hasTextDestination resolves.
  const canOpenText = typeof onOpenText === 'function';

  const state = AudioPlayer.getState();
  const queue = Array.isArray(state.queue) ? state.queue : [];
  const current = queue[state.qi] || null;
  const live = state.status === 'playing' || state.status === 'loading';

  const nav = LibraryNav({ onBack, backLabel, showHome: false, onSearch, onHistory, onSettings, theme, onThemeChange });

  if (!label && !items.length) {
    return (
      <ScreenLayout navChildren={nav}>
        <div className="audio-library-screen">
          <header className="audio-library-hero">
            <div className="audio-library-eyebrow">Listening Library</div>
            <h1>Recordings</h1>
          </header>
          <div className="audio-library-empty">This source has no recordings to show. Step back to the Listening Library to choose another.</div>
        </div>
      </ScreenLayout>
    );
  }

  const countLine = bible
    ? (playable.length === 1 ? 'One book' : 'All ' + playable.length + ' books')
    : (missing === 0
      ? 'All ' + items.length + ' ' + itemNoun(col, items.length) + ' have recordings'
      : playable.length + ' of ' + items.length + ' ' + itemNoun(col, items.length) + ' have recordings');

  const playFrom = (item) => {
    if (current && current.key === volKey + ':' + item.id) { AudioPlayer.toggle(); return; }
    if (bible) AudioPlayer.playBibleBook({ volKey, bookId: item.id, label });
    else AudioPlayer.playCollection({ volKey, items, collectionLabel: label, startId: item.id });
  };

  return (
    <ScreenLayout navChildren={nav}>
      <div className="audio-library-screen">
        <header className="audio-library-hero">
          <div className="audio-library-eyebrow">Listening Library</div>
          <h1>{label}</h1>
          <p className="audio-library-intro">{countLine}</p>
          {playable.length ? (
            <button type="button" className="audio-library-primary-action" onClick={() => AudioPlayer.playCollection({ volKey, items, collectionLabel: label })}>
              <PlayIcon /><span>Play all</span>
            </button>
          ) : null}
        </header>

        {sections ? (
          <section className="audio-library-section" aria-labelledby="audio-collection-sections">
            <div className="audio-library-section-head"><div><span>In longer sittings</span><h2 id="audio-collection-sections">Compilations</h2></div></div>
            <div className="audio-collection-chips">
              {sections.map((section, index) => (
                <button key={section[1] || index} type="button" onClick={() => AudioPlayer.playSection(volKey, index, label)}>
                  <PlayIcon /><span>{section[0]}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="audio-library-section" aria-labelledby="audio-collection-list">
          <div className="audio-library-section-head">
            <div><span>{bible ? 'Book by book' : 'In order'}</span><h2 id="audio-collection-list">Recordings</h2></div>
            <strong aria-label={playable.length + ' recordings'}>{playable.length}</strong>
          </div>
          {playable.length ? (
            <div className="audio-library-list">
              {playable.map((item) => {
                const key = volKey + ':' + item.id;
                const renditions = AudioPlayer.renditionsFor(volKey, item, label);
                const primary = renditions[0] || null;
                const isCurrent = !!(current && current.key === key);
                const rowPlaying = isCurrent && live;
                const parts = primary ? primary.tracks.length : 0;
                const reader = primary ? AudioPlayer.readerLabel(primary.reader) : null;
                // A Bible book's "parts" ARE its chapters — every shipped
                // edition is recorded one chapter at a time — and the row's own
                // disclosure below already calls them that (B2, 2026-08-10).
                const meta = [parts > 1 ? parts + (bible ? ' chapters' : ' parts') : null, reader].filter(Boolean).join(' · ');
                const remaining = primary ? renditionRemainingLabel(primary.tracks) : '';
                const voicesOpen = openVoices === item.id;
                // A per-chapter Bible book is a list of recordings, not one:
                // the row discloses them so a chapter can be started from the
                // Listening Library instead of only from the reader.
                const chapters = bible && parts > 1 ? primary.tracks : null;
                const chaptersOpen = !!chapters && openChapters === item.id;
                return (
                  <article key={item.id} className={'audio-collection-item' + (isCurrent ? ' is-current' : '')}>
                    <div className="audio-library-row">
                      <button
                        type="button"
                        className={'audio-library-row-play' + (rowPlaying ? ' is-playing' : '')}
                        onClick={() => playFrom(item)}
                        aria-label={(rowPlaying ? 'Pause ' : 'Play ') + (item.title || 'this recording')}
                        aria-pressed={rowPlaying}
                      >
                        {rowPlaying ? <PauseIcon /> : <PlayIcon />}
                      </button>
                      <div className="audio-library-row-copy">
                        <strong>{!bible && item.num ? <span className="audio-collection-num">{item.num}</span> : null}{item.title}</strong>
                        {meta ? <small>{meta}</small> : null}
                      </div>
                      <div className="audio-library-row-actions">
                        {remaining ? <span className="audio-library-remaining">{remaining}</span> : null}
                        {renditions.length > 1 ? (
                          <button
                            type="button"
                            className={'audio-collection-voices' + (voicesOpen ? ' is-open' : '')}
                            onClick={() => setOpenVoices(voicesOpen ? null : item.id)}
                            aria-expanded={voicesOpen}
                            aria-controls={'audio-voices-' + item.id}
                            aria-label={renditions.length + ' voices for ' + (item.title || 'this recording')}
                          >
                            <span>{renditions.length} voices</span><ChevronIcon />
                          </button>
                        ) : null}
                        {chapters ? (
                          <button
                            type="button"
                            className={'audio-collection-voices' + (chaptersOpen ? ' is-open' : '')}
                            onClick={() => setOpenChapters(chaptersOpen ? null : item.id)}
                            aria-expanded={chaptersOpen}
                            aria-controls={'audio-chapters-' + item.id}
                            aria-label={chapters.length + ' chapters of ' + (item.title || 'this book')}
                          >
                            <span>{chapters.length} chapters</span><ChevronIcon />
                          </button>
                        ) : null}
                        {canOpenText && hasTextDestination({ key }) ? (
                          <button type="button" className="audio-library-icon-button" onClick={() => onOpenText({ key })} aria-label={'Open text for ' + (item.title || 'this recording')} title="Open text"><TextIcon /></button>
                        ) : null}
                      </div>
                    </div>
                    {voicesOpen ? (
                      <div className="audio-collection-voice-list" id={'audio-voices-' + item.id}>
                        {renditions.map((rendition) => {
                          const name = AudioPlayer.readerLabel(rendition.reader) || 'This reading';
                          const playingThis = !!(current && rendition.tracks.some((track) => track.url === current.url));
                          return (
                            <div key={rendition.reader || name} className={'audio-collection-voice' + (playingThis ? ' is-current' : '')}>
                              <button
                                type="button"
                                className="audio-library-row-play"
                                onClick={() => AudioPlayer.playCollection({ volKey, items, collectionLabel: label, startId: item.id, startReader: rendition.reader })}
                                aria-label={'Play ' + (item.title || 'this recording') + ' — ' + name}
                              >
                                <PlayIcon />
                              </button>
                              <span>{name}{rendition.tracks.length > 1 ? ' · ' + rendition.tracks.length + ' parts' : ''}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                    {chaptersOpen ? (
                      <div className="audio-collection-voice-list" id={'audio-chapters-' + item.id}>
                        {chapters.map((track, index) => {
                          const chapterNum = index + 1;
                          const playingThis = !!(current && current.url === track.url);
                          return (
                            <div key={track.url} className={'audio-collection-voice' + (playingThis ? ' is-current' : '')}>
                              <button
                                type="button"
                                className="audio-library-row-play"
                                onClick={() => AudioPlayer.playBibleBook({ volKey, bookId: item.id, label, chapterNum })}
                                aria-label={'Play ' + (item.title || 'this book') + ' ' + chapterNum}
                              >
                                <PlayIcon />
                              </button>
                              <span>{track.partLabel || ('Chapter ' + chapterNum)}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="audio-library-empty">No recordings here yet. They arrive as each reading is finished.</div>
          )}
          {missing > 0 ? <p className="audio-collection-note">{missing} {itemNoun(col, missing)} {missing === 1 ? 'awaits' : 'await'} recording.</p> : null}
        </section>
      </div>
    </ScreenLayout>
  );
}
