/* smoke.js's read helper — a thing that paints over a window is read once it is there.
   ─────────────────────────────────────────────────────────────────────────────
   The WebKit smoke on the live origin read `mark.hl-mark` exactly once at sleep(600) after
   opening the WTLB Introduction; the marks paint at 600 ms in 5 runs of 8 and at 800 ms in 3
   (the Verifier's hunt, 2026-09-11), so the single read lost 3 of 8. waitUntil polls until the
   predicate holds (cap 4 s) and reports WHEN it held, so the report carries the paint time.
   smoke.js is a browser-pasted classic script (an IIFE over `window`), so it is evaluated
   here against jsdom's window and the helper read back from votSmoke._waitUntil. */

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let waitUntil;
beforeAll(() => {
  const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'smoke.js'), 'utf8');
  // A classic script, run the way the console / smoke-ci run it: in the page's global scope.
  new Function('window', 'document', src)(window, document);
  waitUntil = window.votSmoke._waitUntil;
});
afterEach(() => { vi.useRealTimers(); });

describe('smoke.js waitUntil — the read waits for the paint instead of sampling one moment', () => {
  it('a predicate that turns true at 800 ms is read at ~800 ms, not lost at 600', async () => {
    vi.useFakeTimers();
    let painted = false;
    setTimeout(() => { painted = true; }, 800);                 // the marks paint at 800 ms (3 of 8 live runs)
    const p = waitUntil(() => painted, 4000, 100);
    await vi.advanceTimersByTimeAsync(600);
    expect(painted, 'at 600 ms the single read of the old smoke would have seen nothing').toBe(false);
    await vi.advanceTimersByTimeAsync(400);
    const at = await p;
    expect(at).toBeGreaterThanOrEqual(800);
    expect(at).toBeLessThan(1000);                              // read on the first poll after the paint
  });

  it('a predicate that is already true reads at once (0 ms)', async () => {
    vi.useFakeTimers();
    const p = waitUntil(() => true, 4000, 100);
    await vi.advanceTimersByTimeAsync(0);
    expect(await p).toBe(0);
  });

  it('a predicate that never holds resolves -1 at the cap, never earlier', async () => {
    vi.useFakeTimers();
    let done = null;
    waitUntil(() => false, 4000, 100).then((v) => { done = v; });
    await vi.advanceTimersByTimeAsync(3900);
    expect(done, 'still waiting inside the cap').toBe(null);
    await vi.advanceTimersByTimeAsync(200);
    expect(done).toBe(-1);
  });

  it('a predicate that throws counts as not yet (the page mid-paint), not as a crash of the wait', async () => {
    vi.useFakeTimers();
    let n = 0;
    const p = waitUntil(() => { n += 1; if (n < 3) throw new Error('not mounted yet'); return true; }, 4000, 100);
    await vi.advanceTimersByTimeAsync(300);
    expect(await p).toBeGreaterThanOrEqual(200);
  });
});
