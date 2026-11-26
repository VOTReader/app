/* ═══════════════════════════════════════════════════════════════════════
   CollectionDownload — a collection's one Download button (W3-listen, 2026-11-11)
   ═══════════════════════════════════════════════════════════════════════
   listen.html au-coll / au-dlcoll. Corbin 11-11: Downloads is the one place to
   download, so a single letter has no download control anywhere; a whole
   collection keeps ONE button beside Play all. It asks once in a short sheet
   (the count and size, the voice, the free space) and then reads
   "On this phone". Single letters or several collections: Open Downloads.
   Cluster D (bundle-d.js), with the screen that draws it. */

import { ActionSheet, SelectSheet } from './SelectField.jsx';
import { ListGroup, ListRow, UiButton } from './UiParts.jsx';
import { SPACE_MARGIN, downloadWhenOnline, formatBytes, unitState, useOfflineAudio, useOnline } from './OfflineAudioControls.jsx';
import { READER_NAMES, countOf } from '../../utils/download-tree.js';

/** The voice choices for a download: the one Listen plays (the Letter voice setting), then each reader.
 *  @param {string[]} readers the reader codes this collection has @returns {{ id: string, label: string, desc?: string }[]} */
export function downloadVoiceOptions(readers) {
  const codes = Object.keys(READER_NAMES).filter((c) => !readers || readers.includes(c));
  return [
    { id: '', label: 'The one Listen plays', desc: 'Follows your Letter voice setting' },
    ...codes.map((c) => ({ id: c, label: READER_NAMES[/** @type {keyof typeof READER_NAMES} */ (c)] })),
  ];
}

/** @param {any} t a player track @param {string} name */
function _item(t, name) {
  return { url: t.url, key: t.key || '', title: (name || t.title || '') + (t.partLabel ? ' · ' + t.partLabel : '') };
}

/**
 * @param {{ label: string, unitsFor: (voice: string) => Array<{ name: string, tracks: any[] }>, readers?: string[],
 *   onOpenDownloads: (tab: 'choose' | 'phone') => void }} props
 *   unitsFor(voice) = each recording of the collection in that voice ('' = the one Listen plays), named for the shelf
 */
export function CollectionDownload({ label, unitsFor, readers, onOpenDownloads }) {
  const off = useOfflineAudio();
  const online = useOnline();
  const [open, setOpen] = React.useState(false);
  const [picking, setPicking] = React.useState(false);
  const [voice, setVoice] = React.useState('');
  if (!off) return null;
  const units = unitsFor(voice).filter((u) => u.tracks.length);
  const urls = units.flatMap((u) => u.tracks.map((t) => t.url));
  if (!urls.length) return null;
  const u = unitState(off, urls);
  // Fix list 13: whether the collection is on the phone is decided for the voice Listen plays. A picked voice that is
  // all there keeps the sheet (it says so), or the reader could not pick back the voice they wanted.
  const base = voice ? unitState(off, unitsFor('').flatMap((x) => x.tracks.map((t) => t.url))) : u;
  if (base.status === 'saved') {
    return <UiButton icon="check" onClick={() => onOpenDownloads('phone')} ariaLabel={'On this phone: ' + label}>On this phone</UiButton>;
  }
  if (u.status === 'downloading') {
    const done = units.filter((x) => x.tracks.every((t) => off.statusOf(t.url) === 'saved')).length;
    return <UiButton icon="dl" onClick={() => onOpenDownloads('phone')}>{'Downloading · ' + done + ' of ' + units.length}</UiButton>;
  }
  const todo = units.filter((x) => !x.tracks.every((t) => off.statusOf(t.url) === 'saved'));
  const tracks = todo.flatMap((x) => x.tracks.filter((t) => off.statusOf(t.url) !== 'saved').map((t) => _item(t, x.name)));
  const need = tracks.reduce((n, t) => (n === null || !off.sizeOf(t.url) ? null : n + off.sizeOf(t.url)), /** @type {number | null} */ (0));
  const free = off.freeBytes();
  const noRoom = need !== null && free > 0 && need + SPACE_MARGIN > free;
  const options = downloadVoiceOptions(readers);
  const voiceName = (options.find((o) => o.id === voice) || options[0]).label;
  const some = units.length - todo.length;
  const go = () => { downloadWhenOnline(off, tracks); setOpen(false); };
  const ask = () => { off.refresh(); off.requestSizes(urls); setOpen(true); };
  // Another voice is other files: their sizes are asked for too (the size on the button, the room check).
  const pick = (/** @type {string} */ v) => {
    setVoice(v);
    const theirs = unitsFor(v).flatMap((x) => x.tracks.map((t) => t.url));
    if (theirs.length) off.requestSizes(theirs);
  };
  const runsClosed = typeof off.runsClosed === 'function' && off.runsClosed();
  return (
    <>
      <UiButton icon="dl" onClick={ask} ariaLabel={'Download ' + label}>{some && todo.length ? 'Download the other ' + todo.length : 'Download'}</UiButton>
      <ActionSheet open={open} onClose={() => setOpen(false)} title={'Download ' + label} className="listen-dl-sheet">
        <ListGroup inset ariaLabel={'What downloads'}>
          <ListRow noLead one title={todo.length ? countOf(todo.length, 'recording') : 'All on this phone'} value={need ? formatBytes(need) : ''} />
          <ListRow noLead one title="Voice" value={voiceName} onClick={() => { setOpen(false); setPicking(true); }} />
          {free > 0 ? <ListRow noLead one title="Free on this phone" value={formatBytes(free)} /> : null}
        </ListGroup>
        {noRoom ? <p className="listen-dl-warn" role="alert">Not enough room: free some space on the phone first.</p> : null}
        <p className="listen-dl-note">
          {(runsClosed ? 'It goes on with VOTReader closed.' : 'Keep VOTReader open until it finishes.')
            + (online ? '' : ' It starts when you are back online.')
            + ' To pick single letters or several collections, open Downloads.'}
        </p>
        <div className="ui-sheet-foot">
          <UiButton onClick={() => { setOpen(false); onOpenDownloads('choose'); }}>Open Downloads</UiButton>
          <UiButton kind="primary" disabled={noRoom || !tracks.length} onClick={go}>{'Download' + (need ? ' ' + formatBytes(need) : '')}</UiButton>
        </div>
      </ActionSheet>
      <SelectSheet open={picking} onClose={() => { setPicking(false); setOpen(true); }} title="Voice to download" value={voice}
        options={options} onChange={pick} />
    </>
  );
}
