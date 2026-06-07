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

describe('import guards against a corrupt / truncated stream', () => {
  const baseManifestMedia = [{ id: 'a', mime: 'image/png', size: 10 }];

  it('throws on a manifest-vs-frame size mismatch', async () => {
    const bridge = {
      v3ImportNextBlob: () => '7',                 // frame says 7, manifest says 10
      v3ImportReadChunk: () => '',
    };
    const gen = v3AndroidImportEntries({ bridge: /** @type {any} */ (bridge), media: baseManifestMedia, chunkSize: 1024 });
    await expect(gen.next()).rejects.toThrow(/size mismatch/);
  });

  it('BAK2: throws when a manifest media entry has no numeric size (parity with the web reader)', async () => {
    const bridge = { v3ImportNextBlob: () => '10', v3ImportReadChunk: () => '' };
    const gen = v3AndroidImportEntries({ bridge: /** @type {any} */ (bridge), media: [{ id: 'a', mime: 'image/png' }], chunkSize: 1024 });
    await expect(gen.next()).rejects.toThrow(/no numeric manifest size/);
  });

  it('throws on a truncated frame (fewer bytes than declared)', async () => {
    let served = false;
    const bridge = {
      v3ImportNextBlob: () => '10',
      v3ImportReadChunk: () => { if (served) return ''; served = true; return u8ToBase64(bytes(4, 1)); }, // only 4 of 10
    };
    const gen = v3AndroidImportEntries({ bridge: /** @type {any} */ (bridge), media: baseManifestMedia, chunkSize: 1024 });
    await expect(gen.next()).rejects.toThrow(/truncated frame/);
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
