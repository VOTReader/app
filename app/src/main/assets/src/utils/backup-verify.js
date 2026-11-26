/* ═══════════════════════════════════════════════════════════════════════
   backup-verify — read-only .votbak inspection (FABLE5-BACKLOG [15])
   ═══════════════════════════════════════════════════════════════════════
   Pure helpers behind Settings → Your data → "Verify a Backup". The heavy
   lifting (magic/frame/CRC checks) is the EXISTING import read path —
   readContainer on web, the v3ImportBegin/NextBlob/ReadChunk/Verify bridge
   walk on Android — run WITHOUT the apply step. These helpers only turn a
   parsed manifest (or a legacy v1/v2 payload — same envelope fields) into
   the human-readable report the row shows.

   Bundled into dist/bundle-d.js (imported by _entry-d alongside the other
   backup utils). */

import { formatBytes } from './format-bytes.js';
import { countStoreRecords } from './backup.js';

/**
 * Summarize a backup manifest (v3) or whole payload (legacy v1/v2 — same
 * envelope fields; `media` is an object map instead of an array).
 * Defensive throughout: a malformed field yields zeros, never a throw —
 * the envelope validator has already accepted the file by the time this
 * runs, so anything odd here is cosmetic.
 *
 * Records are counted from the store data the file CARRIES (`stores`, by the
 * exporter's own countStoreRecords), not from the `counts` its writer
 * declared: every backup written before countsVersion 2 declares 1 journal
 * entry however many it holds, and those files are the ones people verify
 * before they need them. `counts` stands in only when there is no `stores`
 * block.
 *
 * A v1 backup carries neither: its stores sit in `data` as the JSON strings
 * localStorage held, and the restore reads them from there (applyImportPayload's
 * V1 fallback). With no `stores` and no `counts`, the summary reads them from
 * `data` the same way, so a v1 file no longer verifies as 0 records across 0
 * data stores while its restore overwrites the library.
 *
 * Annotations are the one store whose record count is not the reader's unit.
 * vot-annotations persists hlKey → [marks], so the store rule counts annotated
 * passages, and five highlights in two verses are 2 records. With `stores` in
 * hand the summary counts the marks (`highlights`, the sum data-safety's
 * summarize and the storage banner print). A `counts`-only file cannot say how
 * many marks it holds, so its figure stays in its own unit
 * (`annotatedPassages`) and the report names it that way. Exactly one of the
 * two is ever non-zero.
 *
 * `absent` names the fields whose kind the file does not carry at all (no
 * store, no count): a restore leaves those kinds on the phone untouched, so a
 * "0" there would read as a wipe. `unknown` names the fields whose kind it
 * carries but cannot count: a counts-only file's highlights and read marks.
 * The counts sheet shows a dash for both, and 0 only for a kind the file
 * carries empty.
 *
 * @param {any} manifest
 * @returns {{
 *   date: string | null,
 *   records: number, storeCount: number,
 *   mediaCount: number, mediaBytes: number,
 *   notes: number, highlights: number, annotatedPassages: number,
 *   journal: number, bookmarks: number,
 *   links: number, plans: number, notebooks: number, readMarks: number,
 *   absent: string[], unknown: string[]
 * }}
 */
export function summarizeBackupManifest(manifest) {
  const counts = (manifest && manifest.counts && typeof manifest.counts === 'object')
    ? manifest.counts : {};
  const isMap = (/** @type {any} */ v) => !!v && typeof v === 'object' && !Array.isArray(v);
  /** @type {Record<string, any> | null} */
  let stores = (manifest && isMap(manifest.stores)) ? manifest.stores : null;
  const declares = Object.keys(counts).some((k) => k !== '_media' && typeof counts[k] === 'number' && Number.isFinite(counts[k]));
  if (!stores && !declares && manifest && isMap(manifest.data)) {
    // v1: each store's localStorage JSON. Only objects and arrays are stores; a flag ('1') or any other
    // scalar is not a reader's record, and a string that does not parse is skipped, never thrown.
    /** @type {Record<string, any>} */ const fromData = {};
    for (const k of Object.keys(manifest.data)) {
      const raw = manifest.data[k];
      if (k.indexOf('vot-') !== 0 || typeof raw !== 'string') continue;
      try { const v = JSON.parse(raw); if (v && typeof v === 'object') fromData[k] = v; } catch (_e) { /* not a store */ }
    }
    if (Object.keys(fromData).length) stores = fromData;
  }
  let records = 0;
  let storeCount = 0;
  /** @type {Map<string, number>} */
  const byStore = new Map();
  const add = (k, n) => { byStore.set(k, n); records += n; storeCount += 1; };
  if (stores) {
    for (const k of Object.keys(stores)) add(k, countStoreRecords(stores[k]));
  } else {
    for (const k of Object.keys(counts)) {
      if (k === '_media') continue;
      const n = counts[k];
      if (typeof n === 'number' && Number.isFinite(n)) add(k, n);
    }
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
  const pick = (k) => byStore.get(k) || 0;
  let highlights = 0;
  if (stores) {
    const ann = stores['vot-annotations'];
    if (ann && typeof ann === 'object' && !Array.isArray(ann)) {
      for (const list of Object.values(ann)) if (Array.isArray(list)) highlights += list.length;
    }
  }
  // data-7: read marks live in vot-state's readItems, inside the one record the store rule counts for the
  // whole state; only a file that carries its stores can say how many (a counts-only file reads 0).
  let readMarks = 0;
  if (stores) {
    const st = stores['vot-state'];
    const items = st && typeof st === 'object' && !Array.isArray(st) ? st.readItems : null;
    if (items && typeof items === 'object' && !Array.isArray(items)) readMarks = Object.keys(items).length;
  }
  // What the file says nothing about. Media is carried by a v3 array, a v1/v2 id map or a declared _media count;
  // a restore without one leaves this phone's media alone (applyImportPayload only prunes when the file lists media).
  const has = (/** @type {string} */ k) => byStore.has(k);
  /** @type {string[]} */ const absent = [];
  /** @type {string[]} */ const unknown = [];
  if (!has('vot-notes')) absent.push('notes');
  if (!has('vot-annotations')) absent.push('highlights', 'annotatedPassages');
  else if (!stores) unknown.push('highlights');
  if (!has('vot-journal')) absent.push('journal');
  if (!has('vot-bookmarks')) absent.push('bookmarks');
  if (!has('vot-links')) absent.push('links');
  if (!has('vot-reading-plans')) absent.push('plans');
  if (!has('vot-notebooks') && !has('vot-journal-notebooks')) absent.push('notebooks');
  if (!has('vot-state')) absent.push('readMarks');
  else if (!stores) unknown.push('readMarks');
  if (!(Array.isArray(media) || (media && typeof media === 'object') || typeof counts._media === 'number')) absent.push('mediaCount');
  return {
    date: (manifest && typeof manifest.exportDate === 'string') ? manifest.exportDate : null,
    records,
    storeCount,
    mediaCount,
    mediaBytes,
    notes: pick('vot-notes'),
    highlights,
    annotatedPassages: stores ? 0 : pick('vot-annotations'),
    journal: pick('vot-journal'),
    bookmarks: pick('vot-bookmarks'),
    // data-7: a backup of plans, links and progress read as four zeros.
    links: pick('vot-links'),
    plans: pick('vot-reading-plans'),
    notebooks: pick('vot-notebooks') + pick('vot-journal-notebooks'),
    readMarks,
    absent,
    unknown,
  };
}

/**
 * Compose the user-facing verify report.
 *
 * @param {ReturnType<typeof summarizeBackupManifest>} s
 * @param {string} integrity  'ok' | 'absent' | 'mismatch' | 'malformed' |
 *                            'trailing' | 'truncated' — web readContainer /
 *                            native verify vocabularies both map onto these.
 *                            ANY OTHER VALUE reports that the check did not
 *                            complete, and never a defect in the file. The
 *                            native bridge returns `error:<reason>` when its
 *                            own verify session fails, and guessing on its
 *                            behalf is how an owner gets told a good backup is
 *                            corrupt.
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
 *   available on the path a reader can reach. Omitting it does NOT default the
 *   salvage to zero: the line drops its numbers and says some media could not
 *   be read back, because a caller that forgot an argument must not be able to
 *   tell the owner their media is gone.
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
  if (s.highlights) parts.push(s.highlights + (s.highlights === 1 ? ' highlight' : ' highlights'));
  if (s.annotatedPassages) {
    parts.push(s.annotatedPassages + (s.annotatedPassages === 1 ? ' annotated passage' : ' annotated passages'));
  }
  if (s.journal) parts.push(s.journal + (s.journal === 1 ? ' journal entry' : ' journal entries'));
  if (s.bookmarks) parts.push(s.bookmarks + (s.bookmarks === 1 ? ' bookmark' : ' bookmarks'));
  // data-7: the line named only the four kinds above, so a plans-and-progress backup's warning line named nothing.
  if (s.links) parts.push(s.links + (s.links === 1 ? ' link' : ' links'));
  if (s.notebooks) parts.push(s.notebooks + (s.notebooks === 1 ? ' notebook' : ' notebooks'));
  if (s.plans) parts.push(s.plans + (s.plans === 1 ? ' reading plan' : ' reading plans'));
  if (s.readMarks) parts.push(s.readMarks + (s.readMarks === 1 ? ' place marked read' : ' places marked read'));
  const detail = parts.length ? parts.join(', ') + ' — ' : '';
  const plural = s.mediaCount === 1 ? '' : 's';
  let mediaBit = '';
  if (integrity === 'truncated' && s.mediaCount) {
    if (salvaged) {
      // 'N of M', never M: M is what the export wrote, N is what survives.
      mediaBit = ', plus ' + salvaged.count + ' of ' + s.mediaCount + ' media file' + plural
        + ' still readable' + (salvaged.bytes ? ' (' + formatBytes(salvaged.bytes) + ')' : '');
    } else {
      // No count means NO NUMBER. Defaulting the salvage to 0 here would print
      // "0 of 42 media files still readable" about a backup that may be almost
      // whole — a caller that forgot an argument would be telling the owner
      // their media is gone. Unreachable on the web path (readContainer is the
      // only producer of 'truncated' and its caller passes the count), and
      // written this way because it will not stay unreachable: the Android
      // verify path calls with three arguments today only because
      // v3ImportVerify cannot return 'truncated' yet.
      mediaBit = ', and some of its ' + s.mediaCount + ' media file' + plural
        + ' could not be read back';
    }
  } else if (integrity !== 'truncated' && s.mediaCount) {
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
    // id-datasafe 156: the CRC covers the manifest (every record); media frames are only
    // walked to their declared lengths, so say what was checked and no more.
    tail = s.mediaCount
      ? 'Checksum passed: your records read back intact. Photos and voice memos were checked for size, not content.'
      : 'Checksum passed: your records read back intact.';
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
    // id-datasafe 157: plain words for a failed checksum (the file still imports).
    tail = 'WARNING: the checksum FAILED, so this file may be damaged. It can still be imported, but make a fresh Export as soon as possible.';
    level = 'warn';
  } else if (integrity === 'malformed' || integrity === 'trailing') {
    // Structure read fine, the trailer did not. Named explicitly rather than
    // left as a catch-all: this is a claim about the FILE, and it must only be
    // made for the two values that actually mean it.
    tail = 'WARNING: unexpected bytes at the end of the file — it may have been truncated or altered. Consider making a fresh Export.';
    level = 'warn';
  } else {
    // Anything this function does not recognise, and it is reachable today.
    // `StorageManager.v3ImportVerify()` returns `error:<reason>` when the
    // NATIVE verify session itself fails (AppInterface.kt's Failure branch),
    // and `SettingsScreen`'s Android verify hands that straight through. Until
    // this arm existed it fell into the trailing-bytes wording above: the
    // app's own check had failed to run, and the owner was told his backup had
    // unexpected bytes appended and to make a fresh Export — about a file that
    // may be perfectly good.
    //
    // A value the report does not understand is not evidence about the file.
    // Say that. The summary above is still real: the manifest was read and
    // envelope-validated before this ran, so the counts are as good here as
    // anywhere.
    tail = 'WARNING: this backup could not be checked — the integrity check did not complete, so nothing here says whether the file is damaged. What is listed above was read from it. Try Verify again, and make a fresh Export if it keeps failing.';
    level = 'warn';
  }
  return { message: body + tail, level };
}
