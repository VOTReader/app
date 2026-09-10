/* Journal media blocks vs the object-URL cap — the case that carries the row.
   ─────────────────────────────────────────────────────────────────────────
   journal-media-lru-claim (2026-09-10). RED FIRST.

   WHY THIS FILE EXISTS BESIDE THE STORE'S OWN CASES. journal-media-store.test.js
   proves the store honours a hold. It says NOTHING about whether anything takes one —
   and "the store can be told" and "the screen tells it" are different claims. The
   defect is the second: `useMediaUrl` resolves once per mediaId and keeps the string
   in React state, so a block that has already rendered never asks again, and the 25th
   resolution revokes the 1st block's URL while it is still on screen. `missing` is
   derived from the RECORD, so the block goes on reporting missing:false and paints a
   healthy <img> over a dead src.

   THE STORE HERE IS THE REAL ONE, not the vi.fn() stub the rest of the media suite
   uses. A stub cannot evict, so a stubbed harness prints green for this defect for
   free — the exact shape of an instrument that cannot reach the branch it is aimed at.
   fake-indexeddb + Node's Blob give the real store real bytes; the screens read the
   bare global `JournalMediaStore`, so assigning the real module to window is all the
   wiring it needs.

   THE MOUNT ORDER MATTERS AND IS NOT INCIDENTAL. Blocks mount 0..24, so ids the later
   blocks have not asked for yet are legitimately evictable when block 0 lands — those
   blocks then resolve a fresh URL and are fine. The assertion is therefore about what
   each block is CURRENTLY DISPLAYING, read out of the DOM after everything settles,
   never about the URL the store minted first. */

import { Blob as NodeBlob } from 'node:buffer';
// Before fake-indexeddb, same reason as the store suite: jsdom's Blob does not survive
// the structured-clone shim with its bytes intact.
/** @type {any} */ (globalThis).Blob = NodeBlob;

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { JournalImageBlock } from './JournalViewerScreen.jsx';
import { JournalMediaStore } from '../../stores/journal-media-store.js';

const N = 25;                     // one past URL_CACHE_MAX = 24
const ids = Array.from({ length: N }, (_v, i) => 'blk' + i);

let revoked = [];
let mint = 0;
let origCreate;
let origRevoke;

beforeAll(async () => {
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('vot-journal-media');
    req.onsuccess = () => resolve(undefined);
    req.onerror = () => resolve(undefined);
    req.onblocked = () => resolve(undefined);
  });
});

beforeEach(async () => {
  /** @type {any} */ (window).JournalMediaStore = JournalMediaStore;
  /** @type {any} */ (window).JournalHelpers = { formatDuration: () => '0:00' };
  /** @type {any} */ (window).ConfirmStrip = () => null;

  const already = await JournalMediaStore.allIds();
  await Promise.all(already.map((id) => JournalMediaStore.delete(id)));
  JournalMediaStore.releaseObjectUrls();

  origCreate = URL.createObjectURL;
  origRevoke = URL.revokeObjectURL;
  mint = 0;
  revoked = [];
  URL.createObjectURL = () => 'blob:blk-' + (++mint);
  URL.revokeObjectURL = (u) => { revoked.push(u); };

  for (let i = 0; i < N; i++) {
    await JournalMediaStore.put({ id: ids[i], type: 'image', blob: new Blob([new Uint8Array([i & 255])]) });
  }
  // put() caches a URL of its own. Drop those and reset the ledger so what follows
  // measures only what the MOUNTED blocks caused.
  JournalMediaStore.releaseObjectUrls();
  revoked = [];
});

afterEach(() => {
  cleanup();
  if (origCreate) URL.createObjectURL = origCreate;
  if (origRevoke) URL.revokeObjectURL = origRevoke;
  origCreate = null;
  origRevoke = null;
  delete (/** @type {any} */ (window).JournalMediaStore);
  delete (/** @type {any} */ (window).JournalHelpers);
  delete (/** @type {any} */ (window).ConfirmStrip);
});

/** Render every block and let all 25 objectUrl promises settle. */
async function mountAll(container) {
  let out;
  await act(async () => {
    out = render(
      <div>{ids.map((id) => <JournalImageBlock key={id} mediaId={id} caption={id} />)}</div>,
      container ? { container } : undefined,
    );
  });
  return out;
}

const srcsOf = (el) => Array.from(el.querySelectorAll('img')).map((img) => img.getAttribute('src'));

describe('25 journal image blocks on one entry — none of them goes blank', () => {
  it('not one URL a mounted block is displaying has been revoked', async () => {
    const { container } = await mountAll();
    const srcs = srcsOf(container);

    /* PRECONDITION AND ANTI-VACUITY IN ONE, and it is load-bearing: if the blocks
       rendered the loading placeholder instead of an <img>, `srcs` is empty and the
       assertion below is satisfied by a screen that showed the reader nothing. */
    expect(srcs.length).toBe(N);
    expect(srcs.filter((s) => typeof s === 'string' && s.startsWith('blob:')).length).toBe(N);
    expect(new Set(srcs).size).toBe(N);

    expect(srcs.filter((s) => revoked.includes(s))).toEqual([]);
  });

  it('unmounting the entry lets the cap work again — a hold that leaks kills the LRU', async () => {
    const { unmount } = await mountAll();
    const before = JournalMediaStore.releaseObjectUrls();   // 25 live while mounted
    expect(before).toBe(N);

    unmount();
    // With every block gone, nothing is held: 25 fresh resolutions must evict down to
    // the cap exactly as they did before this fix existed.
    revoked = [];
    const urls = [];
    for (let i = 0; i < N; i++) urls.push(await JournalMediaStore.objectUrl(ids[i]));
    expect(revoked).toEqual([urls[0]]);
    expect(JournalMediaStore.releaseObjectUrls()).toBe(24);
  });

  it('CONTROL: this harness can see a block go blank — the trim purge still empties one', async () => {
    /* Not built for the fix. It asks whether the instrument has teeth at all: if the
       assertions above pass because nothing in this file can observe a dead <img>, this
       case passes too and the file is worthless. A purge with the page visible makes
       every block re-resolve, and the URLs they were showing ARE revoked. */
    const { container } = await mountAll();
    const beforeSrcs = srcsOf(container);
    await act(async () => { JournalMediaStore.releaseObjectUrls(); });
    expect(beforeSrcs.filter((s) => revoked.includes(s)).length).toBe(N);
    const afterSrcs = srcsOf(container);
    expect(afterSrcs.length).toBe(N);
    expect(afterSrcs.filter((s) => beforeSrcs.includes(s))).toEqual([]);   // all re-minted
  });
});
