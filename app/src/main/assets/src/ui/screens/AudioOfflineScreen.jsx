/*
   AudioOfflineScreen -- "On this phone": every recording downloaded to the phone (listening item 8).

   Built to Codex's mockup round 1, option 1 (lanes/readalong/out/mockups/offline/r1-1.png): each download with its
   size, a tap on it plays it (with no signal too), a Remove per row, and Remove all, which asks first. The Listening
   Library hub's "On this phone" row opens it; it exists only in the Android app, where downloads are possible.
*/

/* Cluster H (esbuild bundle-h.js, lazy), with the other Listening Library screens. OfflineAudio and AudioPlayer stay
   in bundle-d and are read as free globals at call time - one store, one player (see _entry-h.js). */

import { useOfflineAudio, formatBytes } from '../components/OfflineAudioControls.jsx';

/**
 * @param {{
 *   onBack: () => void,
 *   backLabel?: string,
 *   onSearch?: () => void,
 *   onHistory?: () => void,
 *   onSettings?: () => void,
 *   theme?: any,
 *   onThemeChange?: (theme: any) => void,
 * }} props
 */
export function AudioOfflineScreen({ onBack, backLabel = 'Listening Library', onSearch, onHistory, onSettings, theme, onThemeChange }) {
  const off = useOfflineAudio();
  const [askingAll, setAskingAll] = React.useState(false);
  // Newest first: the one just downloaded is the one looked for.
  const items = off ? off.items().slice().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)) : [];
  const total = off ? off.totalBytes() : 0;
  const count = items.length === 1 ? '1 recording' : items.length + ' recordings';
  const play = (/** @type {any} */ it) => {
    if (typeof AudioPlayer !== 'undefined' && typeof AudioPlayer.playTrack === 'function') {
      AudioPlayer.playTrack({ key: it.key, title: it.title, url: it.url, sub: null, readerCode: '', partLabel: null });
    }
  };
  return (
    <ScreenLayout navChildren={LibraryNav({ onBack, backLabel, showHome: false, onSearch, onHistory, onSettings, theme, onThemeChange })}>
      <div className="audio-library-screen">
        <header className="audio-library-hero">
          <div className="audio-library-eyebrow">Listening Library</div>
          <h1>On this phone</h1>
          <p className="audio-library-intro">
            {items.length ? count + ' · ' + formatBytes(total) + '. They play with no signal.' : 'Recordings you download play with no signal.'}
          </p>
        </header>

        <section className="audio-library-section" aria-labelledby="audio-offline-list">
          <div className="audio-library-section-head">
            <div><span>Downloaded</span><h2 id="audio-offline-list">Recordings</h2></div>
            <strong aria-label={count}>{items.length}</strong>
          </div>
          {items.length ? (
            <div className="audio-library-list">
              {items.map((it) => (
                <article key={it.url} className="audio-offline-item">
                  <div className="audio-library-row">
                    <button type="button" className="audio-library-row-play" onClick={() => play(it)} aria-label={'Play ' + it.title}>
                      {typeof PlayIcon !== 'undefined' ? <PlayIcon /> : null}
                    </button>
                    <div className="audio-library-row-copy">
                      <strong>{it.title}</strong>
                      <small>{formatBytes(it.bytes)}</small>
                    </div>
                    <div className="audio-library-row-actions">
                      <button type="button" className="audio-offline-remove" onClick={() => off.remove([it.url])} aria-label={'Remove ' + it.title + ' from this phone'}>Remove</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="audio-library-empty">Nothing is on this phone yet. Download a recording from its row in a collection, or a whole collection at once, and it plays with no signal.</div>
          )}
          {/* With one recording its own Remove is the whole job (Codex critique of the built screens, 2026-09-24). */}
          {items.length > 1 ? (
            askingAll ? (
              <div className="offline-confirm" role="group" aria-label="Remove all downloads">
                <p className="offline-confirm-title">{'Remove all ' + count + ' (' + formatBytes(total) + ') from this phone?'}</p>
                <p className="offline-confirm-line">They can be downloaded again.</p>
                <div className="offline-confirm-actions">
                  <button type="button" className="offline-confirm-cancel" onClick={() => setAskingAll(false)}>Keep them</button>
                  <button type="button" className="offline-confirm-go" onClick={() => { off.removeAll(); setAskingAll(false); }}>Yes, remove all</button>
                </div>
              </div>
            ) : (
              <button type="button" className="audio-library-secondary-action audio-offline-remove-all" onClick={() => setAskingAll(true)}>Remove all</button>
            )
          ) : null}
        </section>
      </div>
    </ScreenLayout>
  );
}
