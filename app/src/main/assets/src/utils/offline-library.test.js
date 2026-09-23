/* offline-library (B5) — the page's side of "is the offline library
   complete?": phases come only from a worker's answer, a repair shows
   "fixed" only on a fresh complete read, and no answer is never "complete". */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OfflineLibrary, askWorker, START_DELAY_MS, FIXED_SHOW_MS } from './offline-library.js';

/** A worker stand-in that answers each message type from a script. */
function fakeWorker(answers) {
  const asked = [];
  return {
    asked,
    postMessage(msg, ports) {
      asked.push(msg.type);
      const a = answers[msg.type];
      const reply = typeof a === 'function' ? a() : a;
      if (reply !== undefined && ports && ports[0]) ports[0].postMessage(reply);
    },
  };
}
const status = (missing) => ({ type: 'OFFLINE_STATUS', total: 60, missing, complete: missing.length === 0 });

beforeEach(() => { OfflineLibrary._reset(); });
afterEach(() => { OfflineLibrary._reset(); vi.useRealTimers(); });

describe('askWorker', () => {
  it('resolves the worker\'s OFFLINE_STATUS reply', async () => {
    const w = fakeWorker({ CHECK_OFFLINE: status(['./dist/bundle-a-bible.js']) });
    const r = await askWorker(w, 'CHECK_OFFLINE', 1000);
    expect(r && r.missing).toEqual(['./dist/bundle-a-bible.js']);
  });
  it('resolves null when there is no worker, or it never answers (an older build)', async () => {
    expect(await askWorker(null, 'CHECK_OFFLINE', 50)).toBeNull();
    expect(await askWorker(fakeWorker({}), 'CHECK_OFFLINE', 50)).toBeNull();
  });
  it('resolves null for a malformed reply rather than trusting it', async () => {
    const w = fakeWorker({ CHECK_OFFLINE: { type: 'OFFLINE_STATUS', complete: true } });
    expect(await askWorker(w, 'CHECK_OFFLINE', 200)).toBeNull();
  });
  it('resolves null when the worker could not read its caches (an error reply is not a status)', async () => {
    const w = fakeWorker({ CHECK_OFFLINE: { type: 'OFFLINE_STATUS', total: 0, missing: [], complete: false, error: 'boom' } });
    expect(await askWorker(w, 'CHECK_OFFLINE', 200)).toBeNull();
  });
  it('resolves null for a self-contradicting reply (incomplete with nothing missing)', async () => {
    const w = fakeWorker({ CHECK_OFFLINE: { type: 'OFFLINE_STATUS', total: 60, missing: [], complete: false } });
    expect(await askWorker(w, 'CHECK_OFFLINE', 200)).toBeNull();
  });
});

describe('OfflineLibrary.check', () => {
  it('incomplete library -> "incomplete" with the missing count', async () => {
    const w = fakeWorker({ CHECK_OFFLINE: status(['a', 'b', 'c']) });
    await OfflineLibrary.check(() => w, 1000);
    expect(OfflineLibrary.getState()).toEqual({ phase: 'incomplete', missing: 3 });
  });
  it('complete library -> "complete" (nothing to show)', async () => {
    await OfflineLibrary.check(() => fakeWorker({ CHECK_OFFLINE: status([]) }), 1000);
    expect(OfflineLibrary.getState().phase).toBe('complete');
  });
  it('no answer -> "unknown" (nothing to show, never a false alarm)', async () => {
    await OfflineLibrary.check(() => fakeWorker({}), 50);
    expect(OfflineLibrary.getState().phase).toBe('unknown');
  });
});

describe('OfflineLibrary.retry', () => {
  it('asks REPAIR_OFFLINE and shows "fixed" only when the fresh read is complete, then settles', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let repaired = false;
    const w = fakeWorker({
      CHECK_OFFLINE: status(['a', 'b']),
      REPAIR_OFFLINE: () => { repaired = true; return status([]); },
    });
    await OfflineLibrary.check(() => w, 1000);
    const p = OfflineLibrary.retry(1000);
    expect(OfflineLibrary.getState()).toEqual({ phase: 'retrying', missing: 2 });
    await p;
    expect(repaired).toBe(true);
    expect(w.asked).toEqual(['CHECK_OFFLINE', 'REPAIR_OFFLINE']);
    expect(OfflineLibrary.getState().phase).toBe('fixed');
    vi.advanceTimersByTime(FIXED_SHOW_MS + 1);
    expect(OfflineLibrary.getState().phase).toBe('complete');
  });
  it('a repair that leaves files out is "still" incomplete, with the new count', async () => {
    const w = fakeWorker({ CHECK_OFFLINE: status(['a', 'b']), REPAIR_OFFLINE: status(['b']) });
    await OfflineLibrary.check(() => w, 1000);
    await OfflineLibrary.retry(1000);
    expect(OfflineLibrary.getState()).toEqual({ phase: 'still', missing: 1 });
  });
  it('a repair with no answer is "still" incomplete - never "fixed"', async () => {
    const w = fakeWorker({ CHECK_OFFLINE: status(['a']) });
    await OfflineLibrary.check(() => w, 1000);
    await OfflineLibrary.retry(50);
    expect(OfflineLibrary.getState()).toEqual({ phase: 'still', missing: 1 });
  });
});

describe('OfflineLibrary.dismiss / start', () => {
  it('dismiss hides the notice without pretending the library is complete', async () => {
    await OfflineLibrary.check(() => fakeWorker({ CHECK_OFFLINE: status(['a']) }), 1000);
    OfflineLibrary.dismiss();
    expect(OfflineLibrary.getState()).toEqual({ phase: 'dismissed', missing: 1 });
  });
  it('start asks the ACTIVE worker once, after the boot delay', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const w = fakeWorker({ CHECK_OFFLINE: status(['a']) });
    const origSW = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve({ active: w }) } });
    try {
      OfflineLibrary.start();
      OfflineLibrary.start();                 // idempotent
      await Promise.resolve(); await Promise.resolve();
      expect(w.asked).toEqual([]);            // not before the delay
      vi.advanceTimersByTime(START_DELAY_MS + 1);
      expect(w.asked).toEqual(['CHECK_OFFLINE']);
    } finally {
      if (origSW) Object.defineProperty(navigator, 'serviceWorker', origSW);
      else delete /** @type {any} */ (navigator).serviceWorker;
    }
  });
});
