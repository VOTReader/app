/* A build the app starts at launch (search200 wave 3, U10.3) runs in the page's idle time.
   ─────────────────────────────────────────────────────────────────────────────
   init({ background: true }) builds the index a chunk per idle turn (requestIdleCallback,
   bounded by a timeout), so a reader turning pages meanwhile is never behind it. A search
   or the Search screen asking for the index (init without `background`) takes the build
   to full speed from its next chunk: the reader who is waiting is not paced to idle time. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'is', 'my', 'of', 'and']),
  SYNONYM_MAP: {},
  BOOK_ABBREVS: { psalms: 'psalms', ps: 'psalms' },
  BOOK_DISPLAY: { psalms: 'Psalms' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {}, VOLUME_COLLECTIONS: [],
  OT_BOOK_IDS: ['psalms'], NT_BOOK_IDS: [], GENRE_GROUPS: { poetry: ['psalms'] },
  WORD_NUMS: {}, ROMAN_NUMS: {},
};
// 1,500 verses: three chunks of the build's 500
const verses = Array.from({ length: 1500 }, (_, i) => ({ n: i + 1, text: 'The LORD is my shepherd verse ' + i }));
const BOOKS = { psalms: { id: 'psalms', title: 'Psalms', chapters: [{ num: 23, sections: [{ heading: '', verses }] }] } };

describe('a background build runs in idle time', () => {
  /** @type {any} */ let E;
  /** @type {Array<{ fn: Function, opts: any }>} */ let idle;
  let prevData, prevRic, prevCic, prevCaches;
  beforeEach(async () => {
    const g = /** @type {any} */ (globalThis);
    prevData = window.VotSearchData; prevRic = g.requestIdleCallback; prevCic = g.cancelIdleCallback; prevCaches = g.caches;
    window.VotSearchData = VOT_DATA;
    g.BOOKS = BOOKS;
    g.caches = undefined;   // no warm index: a cold build
    idle = [];
    // idle callbacks are queued, and run only when the test says the page is idle
    g.requestIdleCallback = (fn, opts) => { idle.push({ fn, opts }); return idle.length; };
    g.cancelIdleCallback = (tok) => { if (idle[tok - 1]) idle[tok - 1].fn = null; };
    vi.resetModules();
    E = (await import('./engine.js')).VotSearchMini;
  });
  afterEach(() => {
    const g = /** @type {any} */ (globalThis);
    window.VotSearchData = prevData; g.requestIdleCallback = prevRic; g.cancelIdleCallback = prevCic; g.caches = prevCaches;
    delete g.BOOKS;
  });
  const settle = () => new Promise((r) => setTimeout(r, 30));
  const runIdle = () => { const q = idle; idle = []; for (const c of q) if (c.fn) c.fn({ didTimeout: false, timeRemaining: () => 50 }); };

  it('waits for an idle turn between chunks, each bounded by a timeout', async () => {
    let done = false;
    E.init({ background: true }).then(() => { done = true; });
    await settle();
    expect(done).toBe(false);   // held at its first idle turn while the page is busy
    const waiting = idle.filter((c) => c.fn);
    expect(waiting.length).toBeGreaterThan(0);
    expect(waiting.every((c) => c.opts && c.opts.timeout > 0)).toBe(true);
    for (let i = 0; i < 10 && !done; i++) { runIdle(); await settle(); }
    expect(done).toBe(true);
    expect(E.getState().ready).toBe(true);
    expect((await E.search('shepherd')).results.length).toBeGreaterThan(0);
  });

  // measure:s22 (2026-10-29): 500 documents at once held the S22's main thread 130-350 ms a chunk, under the
  // Scripture Web's pan. A background chunk is what its idle turn has room for, SLICE_MS when the turn timed out.
  it('a background chunk is sized by its idle turn, not 500 at once', async () => {
    let t = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => (t += 1));   // 1 ms a reading
    try {
      /** @type {number[]} */ const seen = [];
      let done = false;
      E.init({ background: true, onProgress: (n) => seen.push(n) }).then(() => { done = true; });
      await settle();
      const busy = () => { const q = idle; idle = []; for (const c of q) if (c.fn) c.fn({ didTimeout: true, timeRemaining: () => 0 }); };
      for (let i = 0; i < 3; i++) { busy(); await settle(); }
      const paced = seen.map((n, i) => n - (i ? seen[i - 1] : 0));
      expect(paced.length).toBeGreaterThanOrEqual(3);
      expect(paced.every((d) => d >= 1 && d <= 8)).toBe(true);   // SLICE_MS of a 1 ms clock
      E.init();   // the Search screen opens: full speed, 500 a chunk
      for (let i = 0; i < 20 && !done; i++) await settle();
      expect(done).toBe(true);
      const steps = seen.map((n, i) => n - (i ? seen[i - 1] : 0));
      expect(steps.slice(paced.length)).toContain(500);
      expect(seen[seen.length - 1]).toBe(1500);
    } finally { clock.mockRestore(); }
  });

  it('a foreground init takes a background build to full speed', async () => {
    let done = false;
    E.init({ background: true });
    await settle();
    expect(E.getState().building).toBe(true);
    E.init().then(() => { done = true; });   // the Search screen opens: no idle turn runs from here on
    for (let i = 0; i < 20 && !done; i++) await settle();
    expect(done).toBe(true);
    expect(E.getState().ready).toBe(true);
  });

  it('a foreground build never waits for idle time', async () => {
    let done = false;
    E.init().then(() => { done = true; });
    for (let i = 0; i < 20 && !done; i++) await settle();
    expect(done).toBe(true);
  });
});
