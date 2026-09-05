/* ═══════════════════════════════════════════════════════════════════════
   backup-verify — read-only .votbak inspection (FABLE5-BACKLOG [15])
   ═══════════════════════════════════════════════════════════════════════
   Pure helpers behind Settings → Your Data → "Verify a Backup". The heavy
   lifting (magic/frame/CRC checks) is the EXISTING import read path —
   readContainer on web, the v3ImportBegin/NextBlob/ReadChunk/Verify bridge
   walk on Android — run WITHOUT the apply step. These helpers only turn a
   parsed manifest (or a legacy v1/v2 payload — same envelope fields) into
   the human-readable report the row shows.

   Bundled into dist/bundle-d.js (imported by _entry-d alongside the other
   backup utils). */

import { formatBytes } from './format-bytes.js';

/**
 * Summarize a backup manifest (v3) or whole payload (legacy v1/v2 — same
 * envelope fields; `media` is an object map instead of an array).
 * Defensive throughout: a malformed field yields zeros, never a throw —
 * the envelope validator has already accepted the file by the time this
 * runs, so anything odd here is cosmetic.
 *
 * @param {any} manifest
 * @returns {{
 *   date: string | null,
 *   records: number, storeCount: number,
 *   mediaCount: number, mediaBytes: number,
 *   notes: number, annotations: number, journal: number, bookmarks: number
 * }}
 */
export function summarizeBackupManifest(manifest) {
  const counts = (manifest && manifest.counts && typeof manifest.counts === 'object')
    ? manifest.counts : {};
  let records = 0;
  let storeCount = 0;
  for (const k of Object.keys(counts)) {
    if (k === '_media') continue;
    const n = counts[k];
    if (typeof n === 'number' && Number.isFinite(n)) { records += n; storeCount += 1; }
  }
  const media = manifest ? manifest.media : null;
  let mediaCount = 0;
  let mediaBytes = 0;
  const tally = (m) => { if (m && typeof m.size === 'number') mediaBytes += m.size; };
  if (Array.isArray(media)) {            // v3 manifest: metadata array
    mediaCount = media.length;
    media.forEach(tally);
  } else if (media && typeof media === 'object') {  // v1/v2: id → record map
    const vals = Object.values(media);
    mediaCount = vals.length;
    vals.forEach(tally);
  } else if (typeof counts._media === 'number') {
    mediaCount = counts._media;
  }
  const pick = (k) => (typeof counts[k] === 'number' ? counts[k] : 0);
  return {
    date: (manifest && typeof manifest.exportDate === 'string') ? manifest.exportDate : null,
    records,
    storeCount,
    mediaCount,
    mediaBytes,
    notes: pick('vot-notes'),
    annotations: pick('vot-annotations'),
    journal: pick('vot-journal'),
    bookmarks: pick('vot-bookmarks'),
  };
}

/**
 * Compose the user-facing verify report.
 *
 * @param {ReturnType<typeof summarizeBackupManifest>} s
 * @param {string} integrity  'ok' | 'absent' | 'mismatch' | 'malformed' |
 *                            'trailing' | 'truncated' — web readContainer /
 *                            native verify vocabularies both map onto these.
 * @param {'v3'|'legacy'} kind
 * @param {{ count: number, bytes: number } | null} [salvaged]
 *   REQUIRED when `integrity` is 'truncated': the media frames the reader
 *   actually got back, from its own entries array. storage-backup-1 made
 *   readContainer SALVAGE a damaged media stream instead of throwing, which
 *   is right for import — but the manifest still declares every frame the
 *   export wrote, so `s.mediaCount` becomes a claim about bytes this file can
 *   no longer produce. Verify exists to tell the owner what the file can give
 *   back; reporting the claim instead of the salvage is how someone keeps a
 *   gutted backup and deletes the source. readContainer is the only producer
 *   of 'truncated' and its caller has `entries` in hand, so this is always
 *   available on the path a reader can reach; omitting it costs the media
 *   line entirely rather than printing an optimistic one.
 * @returns {{ message: string, level: 'ok' | 'warn' }}
 */
export function formatVerifyReport(s, integrity, kind, salvaged) {
  let when = 'date unknown';
  if (s.date) {
    const d = new Date(s.date);
    if (!Number.isNaN(d.getTime())) when = d.toLocaleString();
  }
  const parts = [];
  if (s.notes) parts.push(s.notes + (s.notes === 1 ? ' note' : ' notes'));
  if (s.annotations) parts.push(s.annotations + (s.annotations === 1 ? ' highlight' : ' highlights'));
  if (s.journal) parts.push(s.journal + (s.journal === 1 ? ' journal entry' : ' journal entries'));
  if (s.bookmarks) parts.push(s.bookmarks + (s.bookmarks === 1 ? ' bookmark' : ' bookmarks'));
  const detail = parts.length ? parts.join(', ') + ' — ' : '';
  const plural = s.mediaCount === 1 ? '' : 's';
  let mediaBit = '';
  if (integrity === 'truncated') {
    // 'N of M', never M: M is what the export wrote, N is what survives.
    const got = salvaged ? salvaged.count : 0;
    const gotBytes = salvaged ? salvaged.bytes : 0;
    if (s.mediaCount) {
      mediaBit = ', plus ' + got + ' of ' + s.mediaCount + ' media file' + plural
        + ' still readable' + (gotBytes ? ' (' + formatBytes(gotBytes) + ')' : '');
    }
  } else if (s.mediaCount) {
    mediaBit = ', plus ' + s.mediaCount + ' media file' + plural
      + (s.mediaBytes ? ' (' + formatBytes(s.mediaBytes) + ')' : '');
  }
  const body = 'Backup from ' + when + ': ' + detail + s.records
    + ' record' + (s.records === 1 ? '' : 's') + ' across ' + s.storeCount
    + ' data store' + (s.storeCount === 1 ? '' : 's') + mediaBit + '. ';

  let tail;
  let level = /** @type {'ok'|'warn'} */ ('ok');
  if (kind === 'legacy') {
    tail = 'Older text-format backup — contents read back correctly (this format carries no checksum).';
  } else if (integrity === 'ok') {
    tail = 'Integrity check passed — the file looks intact.';
  } else if (integrity === 'absent') {
    tail = 'Contents read back correctly. (No checksum — this backup predates integrity checksums; your next Export will include one.)';
  } else if (integrity === 'truncated') {
    // Its own branch, not the catch-all below: that one diagnoses the OPPOSITE
    // failure — bytes appended after the last frame. This file is short, or a
    // frame disagrees with its manifest entry; either way the media stream
    // could not be walked to the end. Saying 'unexpected bytes at the end'
    // about a file that is merely cut off sends the owner looking for the
    // wrong thing.
    tail = 'WARNING: the media in this backup could not be read all the way through. '
      + 'Everything listed above can still be restored; the rest of the media is lost. '
      + 'Make a fresh Export.';
    level = 'warn';
  } else if (integrity === 'mismatch') {
    tail = 'WARNING: the integrity check FAILED — this file may be corrupted. Your data here still imported-readable, but make a fresh Export as soon as possible.';
    level = 'warn';
  } else { // 'malformed' / 'trailing' — structure read fine, trailer didn't
    tail = 'WARNING: unexpected bytes at the end of the file — it may have been truncated or altered. Consider making a fresh Export.';
    level = 'warn';
  }
  return { message: body + tail, level };
}
