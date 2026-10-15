/* DownloadsPage - Settings > Downloads (v2lis B1; picture 7f-downloads, design's dz16; v2-gaps 15).

   Main's "On this phone" shelf (ui/screens/AudioOfflineScreen.jsx) as a Settings page: the lede, main's status lines (each
   only when it applies), one row per recording with where it is from and its size, Update when it was uploaded again, a
   trash that removes it (a letter's parts or a Bible book's chapters ask first, as main's group Remove did). Under it the
   download settings main kept on other screens: Download only on Wi-Fi (main's Listening switch), Songs kept on this
   phone (main's SongsKeptRow) and the Garden's Image quality (main's four tiers). Last, Remove all with main's confirm.
   A real boot reads and drives bundle-d's OfflineAudio and SongKeep; a gate boot shows states.json's seed, inert. */
import { Icon } from '../Icon.jsx';
import { definePlace, placeFor } from '../places.js';
import { Sheet } from '../Sheet.jsx';
import { useVotCorpus } from '../corpus.js';
import { ChoiceSheet, SwitchRow } from './SettingsPages.jsx';
import { writeSetting, here } from '../settings-pages.js';
import { sizeLabel } from '../settings-facts.js';
import {
  shelfRows, ledeLine, emptyLine, wifiLine, songsLine, gardenLine, gardenOptions, liveShelf, emptyGateShelf, recordings,
} from '../downloads-facts.js';

const g = /** @type {any} */ (globalThis);
const NO_SUB = () => () => {};
const ZERO = () => 0;

/** Re-renders when a bundle-d store says it changed (never on a gate boot). */
function useStore(store) {
  const live = !!(store && typeof store.subscribe === 'function' && typeof store.getVersion === 'function');
  React.useSyncExternalStore(live ? store.subscribe : NO_SUB, live ? store.getVersion : ZERO);
}

/** @param {import('../places.js').PlaceProps} props */
export function DownloadsPage({ gate, device, desktop, go, onReady }) {
  const off = gate ? null : g.OfflineAudio;
  useStore(off);
  useStore(gate ? null : g.SongKeep);
  const [, setWrites] = React.useState(0);
  const [asking, setAsking] = React.useState(/** @type {null | { all: true } | { row: import('../downloads-facts.js').ShelfRow }} */ (null));
  const [picking, setPicking] = React.useState(false);
  const corpus = useVotCorpus();
  const f = gate ? (gate.facts && gate.facts.shelf) || emptyGateShelf() : liveShelf();
  // Opening the shelf asks whether anything on it was uploaded again (main's shelf, n2-01): the read-along timings
  // follow the new bytes, so the old file would drift.
  React.useEffect(() => {
    const o = gate ? null : g.OfflineAudio;
    try { if (o && o.available() && typeof o.checkForUpdates === 'function') o.checkForUpdates(); } catch (_e) { /* quiet */ }
  }, [gate]);
  // ready once the letters' corpus has answered, so a row says which letter it is
  React.useEffect(() => { if (corpus !== 'loading') onReady(); }, [corpus, onReady]);

  const where = here(device);
  const rows = f.loaded ? shelfRows(f.items, { updating: f.updating }) : [];
  const stale = f.items.filter((it) => it.stale && !f.updating.includes(it.url));
  const total = f.items.reduce((n, it) => n + (it.bytes || 0), 0);
  /** Main's store, unless this is a gate boot (then nothing happens). */
  const act = (fn) => { if (!gate && off) fn(off); };
  const set = (key, val) => { if (!gate && writeSetting(key, val)) setWrites((n) => n + 1); };
  const trash = (r) => {
    if (gate) return;
    if (r.items.length > 1) setAsking({ row: r });
    else act((o) => o.remove(r.urls));
  };
  const lines = [];
  if (stale.length > 1) lines.push({ t: 'Updates available · ' + recordings(stale.length), b: 'Update all', on: () => act((o) => o.update(stale)) });
  if (f.busy) lines.push({ t: (f.waiting ? 'Waiting for Wi-Fi · ' : 'Downloading · ') + recordings(f.busy) + ' to go', b: 'Cancel all', on: () => act((o) => o.cancelAll()) });
  if (f.failed.length) lines.push({ t: 'Did not download · ' + recordings(f.failed.length), b: 'Retry all', on: () => act((o) => o.download(f.failed)) });
  const garden = gardenLine(f.gardenTier);
  const songs = f.songs;
  const songsOpen = songs && placeFor('songs') ? () => { if (!gate) go({ place: 'songs', list: 'kept' }); } : null;
  const ask = asking && 'row' in asking ? asking.row : null;
  return (
    <>
      <div className="page-head g">
        <h1 className="display">Downloads</h1>
        <p className="lede">{ledeLine(f)}</p>
      </div>
      {lines.length > 0 && (
        <div className="g dl-head dls">
          {lines.map((l) => (
            <div key={l.b} className="dl-bar">
              <span>{l.t}</span>
              <button type="button" className="textbtn sm" onClick={l.on}>{l.b}</button>
            </div>
          ))}
        </div>
      )}
      {rows.length > 0 ? (
        <>
          <div className="g"><span className="label dll">Recordings</span></div>
          <div className="rows dlrs">
            {rows.map((r) => {
              const many = r.items.length > 1;
              return (
                <div key={r.id} className="row dlr">
                  <div className="tx"><div className="t">{r.title}</div><div className="s">{r.sub}</div></div>
                  {r.stale.length > 0 && !r.updating && (
                    <button type="button" className="textbtn sm" aria-label={'Update ' + r.title + ' on ' + where}
                      onClick={() => act((o) => o.update(r.stale))}>Update</button>
                  )}
                  <button type="button" className="ic" onClick={() => trash(r)}
                    aria-label={'Remove ' + r.title + (many ? ', ' + recordings(r.items.length) + ',' : '') + ' from ' + where}>
                    <Icon name="trash" />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      ) : f.available && f.loaded ? <p className="fine g dle">{emptyLine(where)}</p> : null}
      <div className="g settings dlx">
        {f.available && (
          <>
            <span className="label">Downloading</span>
            <SwitchRow t="Download only on Wi-Fi" s={wifiLine(f.canTell)} on={f.wifiOnly} onFlip={() => set('downloadWifiOnly', !f.wifiOnly)} />
          </>
        )}
        {songs && (
          <>
            <span className="label">Songs</span>
            {songsOpen ? (
              <button type="button" className="srow" onClick={songsOpen}>
                <span className="tx"><span className="t">{'Songs kept on ' + where}</span><span className="s">{songsLine(songs)}</span></span>
                <span className="chev"><Icon name="chev" /></span>
              </button>
            ) : (
              // v2 has no Songs page to open yet (zones' dz14): the row says what is kept and opens nothing
              <div className="srow">
                <div className="tx"><div className="t">{'Songs kept on ' + where}</div><div className="s">{songsLine(songs)}</div></div>
              </div>
            )}
          </>
        )}
        {garden && (
          <>
            <span className="label">A Return to The Garden</span>
            <button type="button" className="srow" onClick={() => { if (!gate) setPicking(true); }}>
              <span className="tx"><span className="t">Image quality</span><span className="s">{garden}</span></span>
              <span className="chev"><Icon name="chev" /></span>
            </button>
          </>
        )}
      </div>
      {f.items.length > 1 && (
        <div className="g dla">
          <button type="button" className="btn2" onClick={() => { if (!gate) setAsking({ all: true }); }}>Remove all</button>
        </div>
      )}
      {picking && (
        <ChoiceSheet title="Image quality" options={gardenOptions()} value={f.gardenTier} desktop={desktop}
          onPick={(id) => { setPicking(false); set('gardenTier', id); }} onClose={() => setPicking(false)} />
      )}
      {asking && (
        // the scrim, Escape and Back keep them (the safe answer)
        <Sheet kind="ask" label={ask ? 'Remove ' + ask.title : 'Remove all downloads'} onClose={() => setAsking(null)} desktop={desktop}>
          <div className="sh">{ask ? 'Remove ' + ask.title + ' (' + recordings(ask.items.length) + ', ' + sizeLabel(ask.bytes) + ') from ' + where + '?'
            : 'Remove all ' + recordings(f.items.length) + ' (' + sizeLabel(total) + ') from ' + where + '?'}</div>
          <p className="fine">They can be downloaded again.</p>
          <div className="stack">
            <button type="button" className="pill block danger"
              onClick={() => { setAsking(null); act((o) => (ask ? o.remove(ask.urls) : o.removeAll())); }}>
              <span>{ask ? 'Yes, remove' : 'Yes, remove all'}</span>
            </button>
            <button type="button" className="btn2 block" onClick={() => setAsking(null)}>Keep them</button>
          </div>
        </Sheet>
      )}
    </>
  );
}

definePlace('settings/downloads', { Screen: DownloadsPage, title: () => 'Downloads' });
