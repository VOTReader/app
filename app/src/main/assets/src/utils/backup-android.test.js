/* backup-android — the Android v3 streaming backup DRIVER (TEST-1).
   ─────────────────────────────────────────────────────────────────────
   The only-backup path on the primary platform had ZERO JS tests and sat
   outside the coverage scope (it lived in ui/screens/SettingsScreen.jsx).
   These tests round-trip a multi-frame export→import through a FAKE NATIVE
   bridge that models StorageManager.kt — base64 at the string boundary, raw
   bytes internally — and assert BYTE-IDENTITY. They pin exactly the off-by-one
   frame-boundary / dropped-final-partial-chunk class the audit flagged, plus
   the abort-on-failure and truncation guards.
   ───────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import {
  ANDROID_V3_CHUNK, u8ToBase64, base64ToU8, blobSliceToBase64,
  runV3AndroidExport, classifyV3ImportBegin, v3AndroidImportEntries,
} from './backup-android.js';

/* Deterministic byte pattern (no RNG) so failures are reproducible. */
const bytes = (n, seed = 0) => {
  const u8 = new Uint8Array(n);
  for (let i = 0; i < n; i++) u8[i] = (i * 31 + seed * 7 + 13) & 0xff;
  return u8;
};
const toArr = (u8) => Array.from(u8);
/** A node-friendly slicer (avoids FileReader); reads a Blob slice → base64. */
const sliceToBase64 = async (slice) => u8ToBase64(new Uint8Array(await slice.arrayBuffer()));

/**
 * A fake native bridge that models the real StorageManager.kt: export decodes
 * each base64 chunk to raw bytes and appends to the current length-framed blob;
 * import replays those exact bytes back, base64-ing at the boundary. The shared
 * `state` IS the "on-disk" file, so export-then-import is a true round-trip.
 */
function makeFakeNative() {
  const state = {
    manifestJson: null,
    blobs: /** @type {{size:number, bytes:number[]}[]} */ ([]),
    committed: false,
    finishCalls: /** @type {boolean[]} */ ([]),
    closed: false,
    readIdx: -1,
    readPos: 0,
  };
  const bridge = {
    // ── export ──
    v3ExportBegin(mj) { state.manifestJson = mj; return 'ok'; },
    v3ExportWriteBlob(sizeStr) { state.blobs.push({ size: Number(sizeStr), bytes: [] }); return 'ok'; },
    v3ExportChunk(b64) {
      const u8 = base64ToU8(b64);
      const cur = state.blobs[state.blobs.length - 1];
      for (let i = 0; i < u8.length; i++) cur.bytes.push(u8[i]);
      return 'ok';
    },
    v3ExportFinish(commit) {
      state.finishCalls.push(commit);
      if (commit) state.committed = true;
      return 'ok';
    },
    // ── import (replays exactly what export wrote) ──
    v3ImportBegin() { return 'v3:' + state.manifestJson; },
    v3ImportNextBlob() { state.readIdx += 1; state.readPos = 0; return String(state.blobs[state.readIdx].size); },
    v3ImportReadChunk(n) {
      const cur = state.blobs[state.readIdx];
      if (state.readPos >= cur.bytes.length) return '';
      const end = Math.min(state.readPos + n, cur.bytes.length);
      const slice = cur.bytes.slice(state.readPos, end);
      state.readPos = end;
      return u8ToBase64(Uint8Array.from(slice));
    },
    v3ImportClose() { state.closed = true; },
  };
  return { bridge, state };
}

describe('backup-android — base64 helpers', () => {
  it('u8ToBase64 / base64ToU8 are exact inverses across byte values', () => {
    const src = bytes(257, 3);                    // spans 0..255 + wrap
    expect(toArr(base64ToU8(u8ToBase64(src)))).toEqual(toArr(src));
  });
  it('round-trips the empty buffer', () => {
    expect(u8ToBase64(new Uint8Array(0))).toBe('');
    expect(base64ToU8('').length).toBe(0);
  });
  it('exposes the 512 KB bridge chunk size', () => {
    expect(ANDROID_V3_CHUNK).toBe(512 * 1024);
  });

  it('blobSliceToBase64 (the production FileReader slicer) reads a Blob slice to base64', async () => {
    const src = bytes(300, 7);
    const b64 = await blobSliceToBase64(new Blob([src]).slice(50, 200));
    expect(b64).toBe(u8ToBase64(src.subarray(50, 200)));
  });
});

describe('classifyV3ImportBegin', () => {
  it('classifies every native sniff result', () => {
    expect(classifyV3ImportBegin('error:too_large')).toEqual({ kind: 'error', reason: 'too_large' });
    expect(classifyV3ImportBegin('error:corrupt')).toEqual({ kind: 'error', reason: 'corrupt' });
    expect(classifyV3ImportBegin('legacy:{"a":1}')).toEqual({ kind: 'legacy', json: '{"a":1}' });
    expect(classifyV3ImportBegin('v3:{"media":[]}')).toEqual({ kind: 'v3', manifestJson: '{"media":[]}' });
    expect(classifyV3ImportBegin('not-a-backup')).toEqual({ kind: 'unknown' });
    expect(classifyV3ImportBegin('')).toEqual({ kind: 'unknown' });
    expect(classifyV3ImportBegin(/** @type {any} */ (null))).toEqual({ kind: 'unknown' });
  });
});

describe('round-trip export → import asserts byte-identity (multi-frame)', () => {
  it('preserves every blob bit-for-bit, including empty + exact-boundary + multi-chunk', async () => {
    const CH = 1024;   // tiny chunk forces multi-frame slicing without huge data
    // Sizes chosen to exercise the boundary arithmetic: empty, sub-chunk, exact
    // chunk, chunk+1 (the off-by-one), and several chunks + a partial tail.
    const sources = [
      { id: 'empty', mime: 'image/png', u8: bytes(0, 1) },
      { id: 'small', mime: 'audio/mp4', u8: bytes(10, 2) },
      { id: 'exact', mime: 'image/jpeg', u8: bytes(CH, 3) },
      { id: 'plus1', mime: 'image/jpeg', u8: bytes(CH + 1, 4) },
      { id: 'multi', mime: 'application/octet-stream', u8: bytes(CH * 3 + 7, 5) },
    ];
    const mediaEntries = sources.map((s) => ({ id: s.id, blob: new Blob([s.u8]) }));
    const manifest = {
      app: 'VOTReader', exportVersion: 3,
      media: sources.map((s) => ({ id: s.id, mime: s.mime, size: s.u8.length })),
    };

    const native = makeFakeNative();
    // No sliceToBase64 injection — exercises the PRODUCTION FileReader slicer
    // (the real export path; SettingsScreen calls runV3AndroidExport without one).
    await runV3AndroidExport({
      bridge: native.bridge,
      manifestJson: JSON.stringify(manifest),
      mediaEntries,
      chunkSize: CH,
    });
    expect(native.state.committed).toBe(true);
    expect(native.state.finishCalls).toEqual([true]);   // committed, never aborted

    // Import side: sniff → manifest → reassemble.
    const sniff = classifyV3ImportBegin(native.bridge.v3ImportBegin());
    expect(sniff.kind).toBe('v3');
    const parsed = JSON.parse(/** @type {any} */ (sniff).manifestJson);

    const out = [];
    for await (const entry of v3AndroidImportEntries({ bridge: native.bridge, media: parsed.media, chunkSize: CH })) {
      out.push({ id: entry.id, mime: entry.blob.type, u8: new Uint8Array(await entry.blob.arrayBuffer()) });
    }

    expect(out.map((o) => o.id)).toEqual(sources.map((s) => s.id));   // order + count preserved
    for (let i = 0; i < sources.length; i++) {
      expect(toArr(out[i].u8)).toEqual(toArr(sources[i].u8));         // BYTE-IDENTITY
      expect(out[i].mime).toBe(sources[i].mime);                      // mime carried from manifest
    }
  });

  it('round-trips a manifest with NO media (zero frames)', async () => {
    const native = makeFakeNative();
    const manifest = { exportVersion: 3, media: [] };
    await runV3AndroidExport({ bridge: native.bridge, manifestJson: JSON.stringify(manifest), mediaEntries: [], chunkSize: 1024 });
    expect(native.state.committed).toBe(true);
    const out = [];
    for await (const e of v3AndroidImportEntries({ bridge: native.bridge, media: [], chunkSize: 1024 })) out.push(e);
    expect(out).toEqual([]);
  });
});

describe('BAK-INTEGRITY: v3AndroidImportEntries onDone verify callback', () => {
  const mkBridge = (verifyResult) => ({
    v3ImportBegin: () => 'v3:{"exportVersion":3,"media":[]}',
    v3ImportNextBlob: () => '0',
    v3ImportReadChunk: () => '',
    v3ImportVerify: () => verifyResult,
  });

  it('calls onDone with the verify result after every frame is consumed', async () => {
    let done = null;
    for await (const _e of v3AndroidImportEntries({ bridge: mkBridge('ok'), media: [], onDone: (v) => { done = v; } })) { /* drain */ }
    expect(done).toBe('ok');
  });

  it('propagates a mismatch result to onDone', async () => {
    let done = null;
    for await (const _e of v3AndroidImportEntries({ bridge: mkBridge('mismatch'), media: [], onDone: (v) => { done = v; } })) { /* drain */ }
    expect(done).toBe('mismatch');
  });

  it('onDone gets "absent" when the bridge has no v3ImportVerify (older native)', async () => {
    let done = null;
    const bridge = { v3ImportBegin: () => 'v3:x', v3ImportNextBlob: () => '0', v3ImportReadChunk: () => '' };
    for await (const _e of v3AndroidImportEntries({ bridge: /** @type {any} */ (bridge), media: [], onDone: (v) => { done = v; } })) { /* drain */ }
    expect(done).toBe('absent');
  });

  it('does NOT call onDone if iteration is abandoned early (no spurious warning on cancel)', async () => {
    let called = false;
    let readCount = 0;
    const bridge = {
      v3ImportBegin: () => 'v3:x',
      v3ImportNextBlob: () => '3',
      v3ImportReadChunk: () => { readCount += 1; return readCount === 1 ? btoa('abc') : ''; },
      v3ImportVerify: () => 'ok',
    };
    const gen = v3AndroidImportEntries({
      bridge: /** @type {any} */ (bridge),
      media: [{ id: 'a', mime: 'x', size: 3 }],
      chunkSize: 1024,
      onDone: () => { called = true; },
    });
    await gen.next();       // pull the (only) frame
    await gen.return(undefined); // abandon before the generator reaches its post-loop onDone
    expect(called).toBe(false);
  });
});

describe('export aborts the open sink on any bridge failure (no truncated backup)', () => {
  const failAt = (step) => {
    const calls = [];
    const ok = (name) => () => { calls.push(name); return name === step ? 'error' : 'ok'; };
    return {
      calls,
      bridge: {
        v3ExportBegin: ok('begin'),
        v3ExportWriteBlob: ok('writeBlob'),
        v3ExportChunk: ok('chunk'),
        v3ExportFinish: (commit) => { calls.push('finish:' + commit); return 'ok'; },
      },
    };
  };

  it.each(['begin', 'writeBlob', 'chunk', 'finish'])('a %s failure rejects AND aborts (finish(false))', async (step) => {
    const f = failAt(step === 'finish' ? '__never' : step);   // see note below
    // For the 'finish' case we need v3ExportFinish(true) to fail; override it.
    if (step === 'finish') {
      f.bridge.v3ExportFinish = (commit) => { f.calls.push('finish:' + commit); return commit ? 'error' : 'ok'; };
    }
    const manifest = { media: [{ id: 'x', size: 3 }] };
    const mediaEntries = [{ id: 'x', blob: new Blob([bytes(3, 9)]) }];
    await expect(runV3AndroidExport({
      bridge: /** @type {any} */ (f.bridge), manifestJson: JSON.stringify(manifest), mediaEntries, sliceToBase64, chunkSize: 1024,
    })).rejects.toThrow();
    // The abort MUST fire: a finish(false) call is present after the failure.
    expect(f.calls).toContain('finish:false');
  });
});

describe('backup-android-1: a container cut mid-frame salvages, it does not fail the read', () => {
  // The web reader already does this (storage-backup-1): a media-frame problem
  // stops enumeration and returns the manifest plus every frame read cleanly,
  // tagged integrity 'truncated'. The Android walk threw instead, so the SAME
  // damaged file reported "3 of 42 media files still readable" on the web and
  // "corrupt, could not be read" on Android — and the Android verdict is the one
  // that makes a reader delete a 99%-restorable backup and trust the source.
  const media42 = Array.from({ length: 42 }, (_, i) => ({ id: 'm' + i, mime: 'image/png', size: 10 }));

  /**
   * A bridge whose container is cut partway through frame `cutAt`.
   * `how` picks where the cut lands: 'data' = mid-frame bytes (readChunk stops
   * short), 'chunkEof' = the native reader hits EOF mid-frame (error:truncated),
   * 'header' = the cut lands inside the 8-byte frame length (nextBlob EOFs).
   */
  const cutBridge = (cutAt, how) => {
    let frame = -1;
    let servedThisFrame = false;
    return {
      v3ImportNextBlob: () => {
        frame += 1;
        servedThisFrame = false;
        if (frame === cutAt && how === 'header') return 'error:truncated';
        return '10';
      },
      v3ImportReadChunk: () => {
        if (frame === cutAt && how === 'chunkEof') return 'error:truncated';
        if (servedThisFrame) return '';
        servedThisFrame = true;
        // The cut frame yields fewer bytes than it declared, then ends.
        return u8ToBase64(bytes(frame === cutAt ? 4 : 10, frame));
      },
      v3ImportVerify: () => 'ok',
    };
  };

  const drain = async (bridge, media) => {
    const out = [];
    let done = null;
    let salvaged = null;
    for await (const e of v3AndroidImportEntries({
      bridge: /** @type {any} */ (bridge),
      media,
      chunkSize: 1024,
      onDone: (v, s) => { done = v; salvaged = s || null; },
    })) out.push(e);
    return { out, done, salvaged };
  };

  it.each(['data', 'chunkEof', 'header'])('a cut in the %s of frame 3 yields the 3 clean frames and reports truncated', async (how) => {
    const { out, done, salvaged } = await drain(cutBridge(3, how), media42);
    expect(out.map((e) => e.id)).toEqual(['m0', 'm1', 'm2']);
    expect(done).toBe('truncated');
    expect(salvaged).toEqual({ count: 3, bytes: 30 });
  });

  it('does not run the trailing CRC verify on a cut file — the stream never reached it', async () => {
    let verifyCalls = 0;
    const bridge = cutBridge(3, 'data');
    bridge.v3ImportVerify = () => { verifyCalls += 1; return 'ok'; };
    const { done } = await drain(bridge, media42);
    expect(verifyCalls).toBe(0);
    expect(done).toBe('truncated');
  });

  it('an undamaged 42-frame container still reports the real CRC result and no salvage count', async () => {
    // The control. Without it, "reports truncated" would pass just as happily
    // against a walk that had started calling every file truncated.
    const { out, done, salvaged } = await drain(cutBridge(-1, 'data'), media42);
    expect(out).toHaveLength(42);
    expect(done).toBe('ok');
    expect(salvaged).toBe(null);
  });

  it('a broken bridge session still throws — it is not evidence about the file', async () => {
    // 'no_session' means the app lost its own import stream. Reporting "0 of 42
    // readable" for that would be a claim about the backup that nothing checked.
    const bridge = { v3ImportNextBlob: () => 'error:no_session', v3ImportReadChunk: () => '' };
    const gen = v3AndroidImportEntries({ bridge: /** @type {any} */ (bridge), media: media42, chunkSize: 1024 });
    await expect(gen.next()).rejects.toThrow(/nextBlob: no_session/);
  });
});

describe('import guards against a corrupt / truncated stream', () => {
  const baseManifestMedia = [{ id: 'a', mime: 'image/png', size: 10 }];

  // backup-android-1 changed the VERDICT on the three cases below, not the
  // detection: each is still caught at exactly the same point, but a damaged
  // media frame now ends the walk instead of failing the whole read, matching
  // what the web reader has done since storage-backup-1. With one frame in the
  // manifest and the damage in that frame, nothing is salvageable — so these
  // pin the floor of the salvage path: zero frames, still a report and not an
  // exception. The corresponding "some survived" cases are the 42-frame ones
  // above.
  const firstFrameDamaged = async (bridge, media) => {
    const out = [];
    let done = null;
    let salvaged = null;
    for await (const e of v3AndroidImportEntries({
      bridge: /** @type {any} */ (bridge), media, chunkSize: 1024,
      onDone: (v, sv) => { done = v; salvaged = sv || null; },
    })) out.push(e);
    expect(out).toEqual([]);
    expect(done).toBe('truncated');
    expect(salvaged).toEqual({ count: 0, bytes: 0 });
  };

  it('salvages on a manifest-vs-frame size mismatch', async () => {
    const bridge = {
      v3ImportNextBlob: () => '7',                 // frame says 7, manifest says 10
      v3ImportReadChunk: () => '',
    };
    await firstFrameDamaged(bridge, baseManifestMedia);
  });

  it('BAK2: salvages when a manifest media entry has no numeric size (parity with the web reader)', async () => {
    const bridge = { v3ImportNextBlob: () => '10', v3ImportReadChunk: () => '' };
    await firstFrameDamaged(bridge, [{ id: 'a', mime: 'image/png' }]);
  });

  it('salvages on a truncated frame (fewer bytes than declared)', async () => {
    let served = false;
    const bridge = {
      v3ImportNextBlob: () => '10',
      v3ImportReadChunk: () => { if (served) return ''; served = true; return u8ToBase64(bytes(4, 1)); }, // only 4 of 10
    };
    await firstFrameDamaged(bridge, baseManifestMedia);
  });

  it('propagates a native nextBlob error', async () => {
    const bridge = { v3ImportNextBlob: () => 'error:io', v3ImportReadChunk: () => '' };
    const gen = v3AndroidImportEntries({ bridge: /** @type {any} */ (bridge), media: baseManifestMedia, chunkSize: 1024 });
    await expect(gen.next()).rejects.toThrow(/nextBlob: io/);
  });

  it('propagates a native readChunk error', async () => {
    const bridge = { v3ImportNextBlob: () => '10', v3ImportReadChunk: () => 'error:read' };
    const gen = v3AndroidImportEntries({ bridge: /** @type {any} */ (bridge), media: baseManifestMedia, chunkSize: 1024 });
    await expect(gen.next()).rejects.toThrow(/readChunk: read/);
  });
});
