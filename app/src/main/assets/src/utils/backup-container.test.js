// @ts-nocheck — tests build Blobs + byte arrays directly
/* backup-container — the v3 streaming backup container codec (P1).
   ──────────────────────────────────────────────────────────────────────
   This is the foundation of the GB-scale export/import re-architecture (see
   BACKUP-STREAMING-PLAN.txt). It is the ONLY-backup data path, so the bar is
   exhaustive: byte-exact round-trip over binary data, the >4 GB length
   boundary (the whole reason we don't use a 32-bit zip), multi-chunk blobs,
   unicode manifests, and every corruption/truncation guard. */

import { describe, it, expect, vi } from 'vitest';
import {
  writeContainer, readContainer, isContainerMagic,
  encodeUint64BE, decodeUint64BE, CONTAINER_MAGIC,
} from './backup-container.js';

// Collect writeContainer's streamed chunks into one Blob (copy each chunk so a
// shared buffer can't alias).
async function pack(manifest, mediaEntries) {
  const chunks = [];
  const res = await writeContainer(manifest, mediaEntries, (u8) => { chunks.push(u8.slice()); });
  return { blob: new Blob(chunks), res };
}
async function bytesOf(blob) { return new Uint8Array(await blob.arrayBuffer()); }
function eqBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return false; }
  return true;
}
function pattern(n, seed = 0) {
  const u = new Uint8Array(n);
  for (let i = 0; i < n; i++) u[i] = (i * 31 + seed) & 0xFF;
  return u;
}
const blobOf = (u8) => new Blob([u8]);

describe('uint64 BE codec (>4 GB length support — the whole point vs a 32-bit zip)', () => {
  it('round-trips values across the 32-bit boundary and far past 4 GB', () => {
    const cases = [0, 1, 255, 256, 65535, 0xFFFFFFFF, 0x100000000,
      5 * 1024 * 1024 * 1024 /* 5 GB */, 17 * 1024 * 1024 * 1024 /* 17 GB */, Number.MAX_SAFE_INTEGER];
    for (const n of cases) expect(decodeUint64BE(encodeUint64BE(n))).toBe(n);
  });
  it('encodes big-endian, high word first (2^32 → 00 00 00 01 00 00 00 00)', () => {
    expect(Array.from(encodeUint64BE(0x100000000))).toEqual([0, 0, 0, 1, 0, 0, 0, 0]);
  });
});

describe('writeContainer / readContainer round-trip', () => {
  it('round-trips a manifest + media byte-exact, preserving order + metadata', async () => {
    const m1 = pattern(2000, 1), m2 = pattern(50, 7);
    const manifest = {
      app: 'VOTReader', exportVersion: 3,
      stores: { 'vot-notes': { g1: { text: 'hello' } } },
      media: [
        { id: 'a', mime: 'image/png', size: m1.length },
        { id: 'b', mime: 'audio/webm', size: m2.length },
      ],
    };
    const { blob, res } = await pack(manifest, [{ blob: blobOf(m1) }, { blob: blobOf(m2) }]);
    expect(res.mediaCount).toBe(2);
    const { manifest: out, entries } = await readContainer(blob);
    expect(out).toEqual(manifest);                       // manifest survives JSON round-trip
    expect(entries.map((e) => e.id)).toEqual(['a', 'b']); // frame order == manifest order
    expect(entries[0].meta.mime).toBe('image/png');
    expect(eqBytes(await bytesOf(entries[0].blob), m1)).toBe(true);
    expect(eqBytes(await bytesOf(entries[1].blob), m2)).toBe(true);
  });

  it('round-trips with NO media (manifest only)', async () => {
    const manifest = { app: 'VOTReader', exportVersion: 3, stores: {}, media: [] };
    const { blob } = await pack(manifest, []);
    const { manifest: out, entries } = await readContainer(blob);
    expect(out).toEqual(manifest);
    expect(entries).toEqual([]);
  });

  it('round-trips a blob larger than the 1 MB read chunk (multi-chunk write path)', async () => {
    const big = pattern(1024 * 1024 + 123, 3); // > READ_CHUNK → ≥2 slices
    const manifest = { app: 'VOTReader', exportVersion: 3, media: [{ id: 'big', size: big.length }] };
    const { blob } = await pack(manifest, [{ blob: blobOf(big) }]);
    const { entries } = await readContainer(blob);
    expect(eqBytes(await bytesOf(entries[0].blob), big)).toBe(true);
  });

  it('preserves all 256 byte values (true binary, not text)', async () => {
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i++) all[i] = i;
    const manifest = { app: 'VOTReader', exportVersion: 3, media: [{ id: 'x', size: 256 }] };
    const { blob } = await pack(manifest, [{ blob: blobOf(all) }]);
    const { entries } = await readContainer(blob);
    expect(eqBytes(await bytesOf(entries[0].blob), all)).toBe(true);
  });

  it('round-trips a unicode manifest (UTF-8)', async () => {
    const manifest = { app: 'VOTReader', exportVersion: 3, stores: { n: { t: 'héllo 🌟 שלום' } }, media: [] };
    const { blob } = await pack(manifest, []);
    const { manifest: out } = await readContainer(blob);
    expect(out).toEqual(manifest);
  });

  it('handles many entries', async () => {
    const N = 50;
    const blobs = []; const meta = [];
    for (let i = 0; i < N; i++) { const u = pattern(10 + i, i); blobs.push({ blob: blobOf(u) }); meta.push({ id: 'm' + i, size: u.length }); }
    const manifest = { app: 'VOTReader', exportVersion: 3, media: meta };
    const { blob } = await pack(manifest, blobs);
    const { entries } = await readContainer(blob);
    expect(entries.length).toBe(N);
    for (let i = 0; i < N; i++) expect(eqBytes(await bytesOf(entries[i].blob), pattern(10 + i, i))).toBe(true);
  });
});

describe('integrity + error detection (only-backup path — must fail loud)', () => {
  it('throws on a truncated media frame', async () => {
    const m1 = pattern(500, 9);
    const manifest = { app: 'VOTReader', exportVersion: 3, media: [{ id: 'a', size: m1.length }] };
    const { blob } = await pack(manifest, [{ blob: blobOf(m1) }]);
    await expect(readContainer(blob.slice(0, blob.size - 10))).rejects.toThrow(/truncated/);
  });

  it('throws on a frame-length / manifest-size mismatch (corruption)', async () => {
    const m1 = pattern(10, 2);
    const manifest = { app: 'VOTReader', exportVersion: 3, media: [{ id: 'a', size: 999 }] }; // lies: real frame is 10
    const { blob } = await pack(manifest, [{ blob: blobOf(m1) }]);
    await expect(readContainer(blob)).rejects.toThrow(/size mismatch/);
  });

  it('throws on bad magic (a legacy JSON file is not a v3 container)', async () => {
    const legacy = new Blob([new TextEncoder().encode('{"app":"VOTReader","exportVersion":2}      ')]);
    await expect(readContainer(legacy)).rejects.toThrow(/bad magic/);
  });

  it('throws on a file too small to be a container', async () => {
    await expect(readContainer(new Blob([new Uint8Array(4)]))).rejects.toThrow(/too small/);
  });

  it('throws on a manifest that is not valid JSON', async () => {
    // hand-build: magic + len(3) + "{ x" (invalid json), no media
    const bad = new TextEncoder().encode('{ x');
    const blob = new Blob([CONTAINER_MAGIC, encodeUint64BE(bad.length), bad]);
    await expect(readContainer(blob)).rejects.toThrow(/not valid JSON/);
  });

  it('throws on a manifest media entry with no numeric size — the integrity check must not be bypassable (BAK-2)', async () => {
    const m1 = pattern(40, 4);
    const manifest = { app: 'VOTReader', exportVersion: 3, media: [{ id: 'a' }] }; // size omitted
    const { blob } = await pack(manifest, [{ blob: blobOf(m1) }]);
    await expect(readContainer(blob)).rejects.toThrow(/no numeric size/);
  });

  it('warns (but still reads the real frames) on unexpected trailing bytes (BAK-4)', async () => {
    const m1 = pattern(30, 6);
    const manifest = { app: 'VOTReader', exportVersion: 3, media: [{ id: 'a', size: m1.length }] };
    const { blob } = await pack(manifest, [{ blob: blobOf(m1) }]);
    const tampered = new Blob([blob, new Uint8Array([1, 2, 3, 4])]); // 4 extra bytes appended
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { entries } = await readContainer(tampered);
      expect(entries.length).toBe(1);
      expect(eqBytes(await bytesOf(entries[0].blob), m1)).toBe(true); // the declared frame still reads exactly
      expect(warn.mock.calls.some((a) => /trailing byte/.test(String(a[0])))).toBe(true);
    } finally { warn.mockRestore(); }
  });
});

describe('isContainerMagic (format sniff for the import router)', () => {
  it('detects the v3 magic and rejects a legacy JSON head + a short head', () => {
    expect(isContainerMagic(CONTAINER_MAGIC)).toBe(true);
    expect(isContainerMagic(new TextEncoder().encode('{"app":'))).toBe(false);
    expect(isContainerMagic(new Uint8Array(2))).toBe(false);
    expect(isContainerMagic(null)).toBe(false);
  });
});
