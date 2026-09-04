/* Backup container codec (v3 streaming export/import) — web side.
   ──────────────────────────────────────────────────────────────────────
   The legacy v1/v2 backup is ONE JSON object with every media blob base64-
   inlined, built + parsed whole — it cannot do GB-scale (the whole payload,
   +33% base64, lives in heap several times; see BACKUP-STREAMING-PLAN.txt).

   v3 replaces that with a STREAMING container: a small JSON manifest (the
   stores + per-blob METADATA, no bytes) followed by each media blob's RAW
   bytes in a length-prefixed frame. Nothing ever holds more than one blob
   (and the small manifest) at a time, and there is no base64 inflation.

   Why a bespoke length-prefixed container and not a .zip: a standard zip caps
   the total archive at 4 GB without ZIP64, and the bar is "as much as the
   device can store" (>4 GB is in scope). Hand-rolling correct ZIP64 on the
   ONLY-backup path is too bug-prone, and vendoring a zip lib adds a dependency
   the project deliberately avoids. This format is the opposite: so simple it is
   hard to get wrong (8-byte magic, 64-bit lengths, raw frames), fully auditable,
   dependency-free, recoverable from this spec alone, and trivially streamable on
   both platforms (web here; Android writes/reads the identical frames natively).

   ON-DISK LAYOUT (all integers big-endian):
     [8]            magic  = "VOTBACK1" (ASCII)
     [8]            manifest length, bytes (uint64)
     [manifestLen]  manifest, UTF-8 JSON
     for each media[i] in manifest.media, IN ORDER:
       [8]          blob length, bytes (uint64)
       [blobLen]    blob raw bytes
   The manifest's `media` array carries one metadata object per frame, in the
   same order as the frames; entry i in the array pairs with frame i. Each
   metadata object SHOULD carry `size` (the blob byte length) so the reader can
   verify the frame length matches (truncation / corruption detection).

   The MANIFEST shape itself is the caller's concern (backup-v3 builder) — this
   codec only frames an arbitrary manifest object + an ordered blob sequence.

   WEB-ONLY: this codec runs in the PWA (a modern browser). The Android APK does
   the identical framing in native Kotlin over the SAF stream — it does NOT use
   this module. Global-scope module; concatenated into bundle-d; no import/export
   of app globals (only the explicit exports below).
*/

// 8-byte ASCII signature. A legacy v1/v2 backup is JSON and starts with '{'
// (0x7B); a v3 container starts with 'V' (0x56) — the import side detects the
// format by sniffing the first byte(s), so the two never collide.
export const CONTAINER_MAGIC = new Uint8Array([0x56, 0x4f, 0x54, 0x42, 0x41, 0x43, 0x4b, 0x31]); // "VOTBACK1"

// Read each blob in <=1 MB slices so peak memory stays bounded regardless of a
// single blob's size (images/audio are MB-scale, but never assume).
const READ_CHUNK = 1024 * 1024;

/** Encode a JS number (0 .. 2^53-1, i.e. every real file size — far past the 4 GB
 *  point a 32-bit zip would overflow) as 8 big-endian bytes WITHOUT BigInt (keeps
 *  the chrome108 bundle target happy). Exported for direct boundary testing. */
export function encodeUint64BE(n) {
  const b = new Uint8Array(8);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, Math.floor(n / 0x100000000), false); // high 32
  dv.setUint32(4, n % 0x100000000, false);             // low 32
  return b;
}

/** Inverse of encodeUint64BE over an 8-byte view. */
export function decodeUint64BE(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, 8);
  return dv.getUint32(0, false) * 0x100000000 + dv.getUint32(4, false);
}

// BAK-INTEGRITY: a 4-byte CRC-32 of the MANIFEST bytes is appended as a trailing
// frame (new exports) so silent corruption of the manifest — where every
// structured store lives — is detected on import. The manifest is the critical,
// irreplaceable data; media frames are already length-checked. A plain checksum
// (not a crypto hash) is the right tool for accidental bit-flips and is trivially
// byte-identical to Kotlin's java.util.zip.CRC32 (both are standard IEEE CRC-32).
// Old readers already tolerate trailing bytes (see readContainer's trailing-byte
// warning), so this is backward- AND forward-compatible with no magic bump.
export const CONTAINER_CRC_LEN = 4;
// Keep this aligned with StorageManager.MAX_V3_MANIFEST_SIZE. The manifest is
// the only v3 frame read wholly into memory, so reject it before arrayBuffer().
export const MAX_V3_MANIFEST_BYTES = 16 * 1024 * 1024;

/** @type {Uint32Array | null} */
let _crcTable = null;
function _crc32Table() {
  if (_crcTable) return _crcTable;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  _crcTable = t;
  return t;
}

/** Standard CRC-32 (IEEE 802.3, reflected poly 0xEDB88320) of [bytes] → uint32.
 *  Byte-for-byte identical to java.util.zip.CRC32 (the Kotlin export/import side).
 *  Exported for known-vector testing (crc32("123456789") === 0xCBF43926). */
export function crc32(bytes) {
  const t = _crc32Table();
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc = t[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/** Encode a uint32 CRC as 4 big-endian bytes. Exported for testing. */
export function encodeCrc32BE(crc) {
  const b = new Uint8Array(CONTAINER_CRC_LEN);
  new DataView(b.buffer).setUint32(0, crc >>> 0, false);
  return b;
}

function _bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return false; }
  return true;
}

/** Read a Blob slice to a Uint8Array (one bounded slice at a time). */
async function _sliceBytes(blob, start, end) {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

/**
 * Stream a v3 container to a write sink. Holds at most one ~1 MB slice in memory
 * at a time — safe for GB-scale total.
 *
 * @param {object} manifest - the manifest object (stores + media metadata, no bytes)
 * @param {Iterable<{blob: Blob}> | AsyncIterable<{blob: Blob}>} mediaEntries -
 *   the media blobs IN THE SAME ORDER as manifest.media
 * @param {(chunk: Uint8Array) => (void | Promise<void>)} write - the output sink
 * @returns {Promise<{bytesWritten: number, mediaCount: number}>}
 */
export async function writeContainer(manifest, mediaEntries, write) {
  let bytesWritten = 0;
  const emit = async (u8) => { await write(u8); bytesWritten += u8.length; };

  await emit(CONTAINER_MAGIC);
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  await emit(encodeUint64BE(manifestBytes.length));
  await emit(manifestBytes);

  let mediaCount = 0;
  for await (const entry of mediaEntries) {
    const blob = entry.blob;
    await emit(encodeUint64BE(blob.size));
    for (let pos = 0; pos < blob.size; pos += READ_CHUNK) {
      await emit(await _sliceBytes(blob, pos, Math.min(pos + READ_CHUNK, blob.size)));
    }
    mediaCount += 1;
  }
  // BAK-INTEGRITY: append the manifest CRC-32 as a trailing 4-byte frame.
  await emit(encodeCrc32BE(crc32(manifestBytes)));
  return { bytesWritten, mediaCount };
}

/**
 * Read a v3 container Blob. Returns the parsed manifest + one lazy Blob slice
 * per media frame (paired with manifest.media[i] by order). The returned blobs
 * are slices of the source — NOT read into memory until the caller reads them,
 * so this stays bounded even for a GB archive.
 *
 * Throws only when NOTHING is recoverable: bad magic, a truncated/oversized
 * manifest, or unparseable manifest JSON. A media-frame problem (a short
 * frame header, a frame that runs past EOF, or a manifest/frame `size`
 * disagreement) does NOT throw (storage-backup-1): the manifest above is
 * already fully read and parsed by that point, carrying every structured
 * store (journal, notes, bookmarks, links, reading stats, settings) — losing
 * it to a damaged TRAILING media blob would throw away a 99%-restorable
 * backup. Enumeration just stops there and returns the manifest plus
 * whatever media entries were read cleanly so far, tagged integrity
 * 'truncated'. This mirrors the Android native import path, where applyV3's
 * `for await` loop over the frame stream already catches exactly this class
 * of mid-stream failure and salvages the frames staged before it
 * (backup.js's media-apply loop) — readContainer was the one place that
 * pre-validated eagerly and threw before its caller ever got that chance.
 *
 * @param {Blob} blob - the whole container file (a File from the picker)
 * @returns {Promise<{ manifest: any, entries: Array<{id: any, meta: any, blob: Blob}>, integrity: string }>}
 *   integrity: 'ok' (CRC verified) | 'mismatch' (corrupt) | 'absent' (older backup,
 *   no CRC) | 'trailing' (unexpected non-CRC trailing bytes) | 'truncated' (the
 *   media stream ended early — manifest + earlier good frames still returned).
 *   Never throws on these.
 */
export async function readContainer(blob) {
  if (blob.size < CONTAINER_MAGIC.length + 8) {
    throw new Error('backup-container: file too small to be a v3 backup');
  }
  const magic = await _sliceBytes(blob, 0, CONTAINER_MAGIC.length);
  if (!_bytesEqual(magic, CONTAINER_MAGIC)) {
    throw new Error('backup-container: bad magic (not a v3 backup)');
  }
  let off = CONTAINER_MAGIC.length;

  const manifestLen = decodeUint64BE(await _sliceBytes(blob, off, off + 8));
  off += 8;
  if (manifestLen > MAX_V3_MANIFEST_BYTES) {
    throw new Error('backup-container: manifest exceeds the 16 MiB safety limit');
  }
  if (off + manifestLen > blob.size) throw new Error('backup-container: truncated manifest');
  const manifestBytes = await blob.slice(off, off + manifestLen).arrayBuffer();
  off += manifestLen;
  /** @type {any} */
  let manifest;
  try { manifest = JSON.parse(new TextDecoder().decode(manifestBytes)); }
  catch (_e) { throw new Error('backup-container: manifest is not valid JSON'); }

  const media = manifest && Array.isArray(manifest.media) ? manifest.media : [];
  const entries = [];
  // BAK-1 (storage-backup-1): a media-frame problem stops enumeration and
  // salvages rather than throwing — see the function doc comment above.
  // Sequential position tracking means a broken frame's byte range can't be
  // trusted, so we cannot skip ahead to try the NEXT frame; every entry up
  // to (not including) the broken one is still returned.
  let truncReason = '';
  for (let i = 0; i < media.length; i++) {
    if (off + 8 > blob.size) { truncReason = 'truncated frame header at media[' + i + ']'; break; }
    const len = decodeUint64BE(await _sliceBytes(blob, off, off + 8));
    const dataStart = off + 8;
    const frameEnd = dataStart + len;
    if (frameEnd > blob.size) { truncReason = 'truncated media frame for ' + (media[i] && media[i].id); break; }
    // BAK-2: every v3 manifest media entry MUST declare a numeric size — it is the
    // codec's primary corruption check (frame length vs declared size). A missing,
    // non-numeric, or disagreeing size is itself corruption (the v3 builder always
    // emits blob.size and an agreeing length) — treated the same as a short frame:
    // salvage everything before it rather than failing the whole read.
    if (!media[i] || typeof media[i].size !== 'number') {
      truncReason = 'media[' + i + '] has no numeric size in the manifest (corrupt)'; break;
    }
    if (media[i].size !== len) {
      truncReason = 'size mismatch for ' + media[i].id + ' (manifest ' + media[i].size + ', frame ' + len + ')'; break;
    }
    off = frameEnd;
    entries.push({
      id: media[i].id,
      meta: media[i],
      blob: blob.slice(dataStart, dataStart + len),
    });
  }
  if (truncReason) {
    console.warn('[backup-container] ' + truncReason + ' — salvaging the manifest + '
      + entries.length + ' of ' + media.length + ' good media frame(s).');
    return { manifest, entries, integrity: 'truncated' };
  }
  // BAK-INTEGRITY: the container MAY carry a trailing 4-byte CRC-32 of the manifest
  // bytes (new exports do; older ones end exactly at EOF). Verify it if present — a
  // mismatch is a corruption WARNING surfaced to the caller (integrity: 'mismatch'),
  // NOT a hard failure: the data still imports (user-data-safe; the checksum can
  // never block a restore). 'ok' = verified, 'absent' = an older backup with no CRC.
  let integrity = 'absent';
  const trailing = blob.size - off;
  if (trailing === CONTAINER_CRC_LEN) {
    const s = await _sliceBytes(blob, off, off + CONTAINER_CRC_LEN);
    const stored = ((s[0] << 24) | (s[1] << 16) | (s[2] << 8) | s[3]) >>> 0;
    const computed = crc32(new Uint8Array(manifestBytes));
    integrity = stored === computed ? 'ok' : 'mismatch';
    if (integrity === 'mismatch') {
      console.warn('[backup-container] manifest integrity check FAILED (CRC mismatch) — the backup may be corrupted.');
    }
  } else if (trailing > 0) {
    // BAK-4: unexpected trailing bytes that are NOT a 4-byte CRC — truncation-then-
    // append or corruption. The frames we needed are all read, so warn, don't fail.
    console.warn('[backup-container] ' + trailing + ' unexpected trailing byte(s) after the last media frame — file may be corrupt.');
    integrity = 'trailing';
  }
  return { manifest, entries, integrity };
}

/** Cheap format sniff: true if `head` (first bytes of a file) is a v3 container,
 *  so the import side can route v3 here vs. the legacy JSON path. */
export function isContainerMagic(head) {
  if (!head || head.length < CONTAINER_MAGIC.length) return false;
  return _bytesEqual(head.slice(0, CONTAINER_MAGIC.length), CONTAINER_MAGIC);
}
