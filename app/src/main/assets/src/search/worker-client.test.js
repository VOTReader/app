/* The search worker's client (sr9 refuter r1, 2026-10-14): a worker that goes quiet is given up and what it
   held is done on the page, so neither a search nor the meaning model waits on it for good; a worker that is
   still sending parts, or saying it is alive, is waited for however long that takes. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchWorker, resetSearchWorker } from './worker-client.js';
import { startSemantic, semanticDocs, semanticStatus, configureSemantic, resetSemantic } from './semantic.js';

/** What the fake worker answers, by op: (message, post) => void. An op with no entry is never answered. */
/** @type {Record<string, (m: any, post: (r: any) => void) => void>} */ let script = {};

class FakeWorker {
  constructor() {
    /** @type {any} */ this.onmessage = null;
    /** @type {any} */ this.onerror = null;
    /** @type {any} */ this.onmessageerror = null;
    this.terminated = false;
  }
  postMessage(/** @type {any} */ msg) {
    const post = (/** @type {any} */ m) => {
      if (!this.terminated) Promise.resolve().then(() => this.onmessage && this.onmessage({ data: { id: msg.id, ...m } }));
    };
    if (script[msg.op]) script[msg.op](msg, post);
  }
  terminate() { this.terminated = true; }
}

/** Posts `n` parts from `make(i)`, one every `everyMs`, then `last`. */
function drip(/** @type {(r: any) => void} */ post, /** @type {number} */ n, /** @type {number} */ everyMs, /** @type {(i: number) => any} */ make, /** @type {any} */ last) {
  let i = 0;
  const t = setInterval(() => {
    if (++i <= n) post(make(i));
    else { clearInterval(t); post(last); }
  }, everyMs);
}

/** A promise's state now: 'pending', or what it settled with. */
function watch(/** @type {Promise<any>} */ p) {
  const s = { state: /** @type {any} */ ('pending') };
  p.then((v) => { s.state = { value: v }; }, (e) => { s.state = { error: String(e && e.message) }; });
  return s;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('Worker', FakeWorker);
  script = { hello: (_m, post) => post({ done: true }) };
  resetSearchWorker();
  resetSemantic();
  // this thread's own start of the model finds no files (as in a test): it fails at once
  configureSemantic({ load: () => Promise.reject(new Error('no files here')) });
});

afterEach(() => {
  resetSearchWorker();
  resetSemantic();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('a restore', () => {
  it('is waited for while its parts keep coming, past the limit', async () => {
    script.restore = (_m, post) => drip(post, 6, 5000, (i) => ({ part: i }), { done: true });
    const parts = /** @type {any[]} */ ([]);
    const r = watch(/** @type {any} */ (searchWorker()).request('restore', {}, (/** @type {any} */ m) => parts.push(m.part), 20000));
    await vi.advanceTimersByTimeAsync(40000);
    expect(r.state).toEqual({ value: expect.objectContaining({ done: true }) });
    expect(parts).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('is refused when the worker goes quiet for the limit, and the worker is given up', async () => {
    script.restore = (_m, post) => post({ part: 1 });
    const r = watch(/** @type {any} */ (searchWorker()).request('restore', {}, () => {}, 20000));
    await vi.advanceTimersByTimeAsync(19000);
    expect(r.state).toBe('pending');
    await vi.advanceTimersByTimeAsync(2000);
    expect(r.state).toEqual({ error: 'search worker: no answer to restore' });
    expect(searchWorker()).toBeNull();
  });
});

describe('the meaning model on the worker', () => {
  it('a query the worker never answers ends, and this thread takes the model', async () => {
    script['meaning-start'] = (_m, post) => post({ done: true, ok: true, status: 'ready', units: 3 });
    expect(await startSemantic()).toBe(true);
    expect(semanticStatus().where).toBe('worker');
    const q = watch(semanticDocs('love', (k) => k));
    await vi.advanceTimersByTimeAsync(11000);
    expect(q.state).toEqual({ value: null });
    expect(semanticStatus().where).toBe('page');
  });

  it('a start the worker goes quiet on hands the model to this thread', async () => {
    const s = watch(startSemantic());
    await vi.advanceTimersByTimeAsync(31000);
    expect(s.state).toEqual({ value: false }); // this thread's start, with no files, failed: no hang
    expect(semanticStatus().where).toBe('page');
  });

  it('a start that keeps saying it is alive is waited for (a slow download)', async () => {
    script['meaning-start'] = (_m, post) => drip(post, 11, 5000, () => ({ alive: true }), { done: true, ok: true, status: 'ready', units: 3 });
    const s = watch(startSemantic());
    await vi.advanceTimersByTimeAsync(61000);
    expect(s.state).toEqual({ value: true });
    expect(semanticStatus().where).toBe('worker');
  });
});
