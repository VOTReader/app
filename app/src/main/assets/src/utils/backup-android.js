/* ══════════════════════════════════════════════════════════════════════
   BACKUP-ANDROID — the v3 STREAMING backup DRIVER for the native bridge
   ══════════════════════════════════════════════════════════════════════
   ES module. Bundled wherever SettingsScreen lands (the only caller). No
   DOM globals beyond btoa/atob/Blob/FileReader, all injectable for tests.

   WHY (TEST-1): the v3 codec (backup-container.js) and the Kotlin framing
   (StorageManager.kt) are both byte-exact tested, and the bridge SURFACE is
   pinned — but the JS DRIVER LOOP that slices each media blob into <=512 KB
   base64 reads, threads v3ExportChunk/v3ImportReadChunk, and reassembles the
   frames lived inline in SettingsScreen.jsx (ui/screens — outside coverage and
   untested). It is the only-backup path on the primary platform; an off-by-one
   frame boundary or a dropped final partial chunk would pass the whole suite.
   This module is that driver, lifted into utils/ (a COVERED scope) with the
   bridge + slicer + decoder injectable, so a fake-native round-trip can assert
   byte-identity. PWA/web export goes through backup-container.js, not here.

   THE BRIDGE CONTRACT (native owns the on-disk VOTBACK1 framing; the JS side
   only sequences calls + base64s at the string boundary):
     EXPORT — caller opens the SAF sink (picker), then:
       v3ExportBegin(manifestJson)  -> 'ok' | 'error...'   (magic + manifest frame)
       per blob: v3ExportWriteBlob(String(size)) -> 'ok'    (start a length-framed blob)
                 v3ExportChunk(base64)  -> 'ok'             (decode + append raw bytes)
       v3ExportFinish(true)  -> 'ok'                        (flush + close)
       v3ExportFinish(false)                                (abort + delete partial)
     IMPORT — caller opens the SAF source (picker), then:
       v3ImportBegin() -> 'v3:<manifestJson>' | 'legacy:<json>' | 'error:<reason>' | other
       per blob: v3ImportNextBlob() -> String(size) | 'error:...'
                 v3ImportReadChunk(maxBytes) -> base64 | '' (frame done) | 'error:...'
       v3ImportClose()
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Native v3 EXPORT bridge surface (PlatformBridge.v3Export* or a fake).
 * @typedef {{
 *   v3ExportBegin: (manifestJson: string) => string,
 *   v3ExportWriteBlob: (sizeStr: string) => string,
 *   v3ExportChunk: (base64: string) => string,
 *   v3ExportFinish: (commit: boolean) => string,
 * }} V3ExportBridge
 */

/**
 * Native v3 IMPORT bridge surface (PlatformBridge.v3Import* or a fake).
 * @typedef {{
 *   v3ImportBegin: () => string,
 *   v3ImportNextBlob: () => string,
 *   v3ImportReadChunk: (maxBytes: number) => string,
 *   v3ImportClose?: () => void,
 * }} V3ImportBridge
 */

/** Slice size for the chunked native bridge: 512 KB, so peak memory is one
 *  slice regardless of total backup size (BACKUP-STREAMING-PLAN P3). */
export const ANDROID_V3_CHUNK = 512 * 1024;

/** Uint8Array → standard base64. Builds the binary string in 32 KB sub-chunks
 *  so String.fromCharCode.apply never blows the call-stack on a big slice. */
export function u8ToBase64(u8) {
  let binary = '';
  const STEP = 0x8000; // 32 KB — safely under the apply() arg-count limit
  for (let i = 0; i < u8.length; i += STEP) {
    binary += String.fromCharCode.apply(null, /** @type {any} */ (u8.subarray(i, i + STEP)));
  }
  return btoa(binary);
}

/** Standard base64 → Uint8Array (atob + charCodeAt). */
export function base64ToU8(b64) {
  const binary = atob(b64);
  const u8 = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) u8[i] = binary.charCodeAt(i);
  return u8;
}

/** Read one Blob slice to base64 via FileReader (the Android string bridge
 *  needs base64). The default slicer for runV3AndroidExport. */
export function blobSliceToBase64(blobSlice) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      try { resolve(u8ToBase64(new Uint8Array(/** @type {ArrayBuffer} */ (fr.result)))); }
      catch (e) { reject(e); }
    };
    fr.onerror = () => reject(fr.error || new Error('blob read failed'));
    fr.readAsArrayBuffer(blobSlice);
  });
}

/**
 * Drive the native v3 EXPORT: write the manifest frame, then stream each media
 * blob in <=chunkSize base64 slices, then commit. The SAF sink is assumed
 * already open (the caller's picker succeeded). On ANY bridge error this
 * ABORTS the open sink (v3ExportFinish(false), best-effort) and rethrows — so a
 * failure can never leave a truncated, misleading backup (the only backup must
 * fail clean). A zero-byte blob writes its frame header and no chunks, matching
 * the import reassembly (readChunk returns '' immediately).
 *
 * @param {object} args
 * @param {V3ExportBridge} args.bridge
 * @param {string} args.manifestJson                       JSON.stringify(built.manifest)
 * @param {Array<{ blob: Blob }>} args.mediaEntries        built.mediaEntries
 * @param {(slice: Blob) => Promise<string>} [args.sliceToBase64]  default blobSliceToBase64
 * @param {number} [args.chunkSize]                        default ANDROID_V3_CHUNK
 * @returns {Promise<void>} resolves once committed; rejects (after aborting) on failure
 */
export async function runV3AndroidExport(args) {
  const bridge = args.bridge;
  const slice = args.sliceToBase64 || blobSliceToBase64;
  const CH = args.chunkSize || ANDROID_V3_CHUNK;
  const entries = Array.isArray(args.mediaEntries) ? args.mediaEntries : [];
  try {
    let r = bridge.v3ExportBegin(args.manifestJson);
    if (r !== 'ok') throw new Error('begin: ' + r);
    for (const entry of entries) {
      const blob = entry.blob;
      r = bridge.v3ExportWriteBlob(String(blob.size));
      if (r !== 'ok') throw new Error('writeBlob: ' + r);
      for (let pos = 0; pos < blob.size; pos += CH) {
        const b64 = await slice(blob.slice(pos, Math.min(pos + CH, blob.size)));
        r = bridge.v3ExportChunk(b64);
        if (r !== 'ok') throw new Error('chunk: ' + r);
      }
    }
    r = bridge.v3ExportFinish(true);
    if (r !== 'ok') throw new Error('finish: ' + r);
  } catch (e) {
    // The sink is open by contract → abort it so no partial file survives.
    try { bridge.v3ExportFinish(false); } catch (_e) { /* best-effort */ }
    throw e;
  }
}

/**
 * Classify the string returned by v3ImportBegin(): native sniffs the magic and
 * returns one of four shapes. Pure string logic — split out so the dispatch is
 * unit-testable apart from the UI flow.
 *
 * @param {string} begin
 * @returns {{ kind: 'error', reason: string }
 *   | { kind: 'legacy', json: string }
 *   | { kind: 'v3', manifestJson: string }
 *   | { kind: 'unknown' }}
 */
export function classifyV3ImportBegin(begin) {
  const s = (begin == null) ? '' : String(begin);
  if (s.indexOf('error:') === 0) return { kind: 'error', reason: s.slice(6) };
  if (s.indexOf('legacy:') === 0) return { kind: 'legacy', json: s.slice(7) };
  if (s.indexOf('v3:') === 0) return { kind: 'v3', manifestJson: s.slice(3) };
  return { kind: 'unknown' };
}

/**
 * Async-generator of `{ id, meta, blob }` for applyV3, reassembling each media
 * frame from the native import bridge: nextBlob → declared size, then read
 * <=chunkSize base64 chunks until '' (frame end), accumulating raw bytes one
 * frame at a time (peak memory = one frame). Throws on a bridge error, a
 * manifest-vs-frame size mismatch, or a truncated frame (bytes read != declared)
 * — applyV3's decode-all-then-swap ordering keeps existing media on a throw.
 *
 * @param {object} args
 * @param {V3ImportBridge} args.bridge
 * @param {Array<any>} args.media                       manifest.media (per-blob metas)
 * @param {number} [args.chunkSize]                     default ANDROID_V3_CHUNK
 * @param {(b64: string) => Uint8Array} [args.b64ToU8]  default base64ToU8
 * @returns {AsyncGenerator<{ id: any, meta: any, blob: Blob }>}
 */
export async function* v3AndroidImportEntries(args) {
  const bridge = args.bridge;
  const CH = args.chunkSize || ANDROID_V3_CHUNK;
  const dec = args.b64ToU8 || base64ToU8;
  const list = Array.isArray(args.media) ? args.media : [];
  for (let i = 0; i < list.length; i++) {
    const meta = list[i];
    const sizeStr = bridge.v3ImportNextBlob();
    if (sizeStr.indexOf('error:') === 0) throw new Error('nextBlob: ' + sizeStr.slice(6));
    const declared = Number(sizeStr);
    if (meta && typeof meta.size === 'number' && meta.size !== declared) {
      throw new Error('size mismatch for ' + meta.id + ' (manifest ' + meta.size + ', frame ' + declared + ')');
    }
    /** @type {any[]} */
    const parts = [];   // BlobPart[]; `any` sidesteps the Uint8Array<ArrayBufferLike> vs ArrayBuffer mismatch
    let readTotal = 0;
    for (;;) {
      const chunk = bridge.v3ImportReadChunk(CH);
      if (chunk === '') break;                       // current frame fully read
      if (chunk.indexOf('error:') === 0) throw new Error('readChunk: ' + chunk.slice(6));
      const u8 = dec(chunk);
      parts.push(u8);
      readTotal += u8.length;
    }
    if (readTotal !== declared) throw new Error('truncated frame for ' + (meta && meta.id));
    yield {
      id: meta ? meta.id : null,
      meta: meta || null,
      blob: new Blob(parts, { type: (meta && meta.mime) || 'application/octet-stream' }),
    };
  }
}
