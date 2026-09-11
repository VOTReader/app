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

let waitUntil, waitForMarks;
beforeAll(() => {
  const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'smoke.js'), 'utf8');
  // A classic script, run the way the console / smoke-ci run it: in the page's global scope.
  new Function('window', 'document', src)(window, document);
  waitUntil = window.votSmoke._waitUntil;
  waitForMarks = window.votSmoke._waitForMarks;
});
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

// The reading screen's DOM as ScreenLayout renders it: the live page in `.pager-viewport >
// .screen-scroll`, each neighbour pre-mounted as an inert `.pager-peek` with its own
// `.screen-scroll`, both painted by the same annotation pass.
function mountReadingScreen({ live, peek }) {
  document.body.innerHTML =
    '<div class="screen-layout"><div class="pager-viewport">' +
      `<div class="screen-scroll"><h1 class="hero-title">${live.title}</h1><p>${'<mark class="hl-mark">x</mark>'.repeat(live.marks)}</p></div>` +
      (peek ? `<div class="pager-peek pager-peek-prev" aria-hidden="true" inert=""><div class="screen-scroll"><h1 class="hero-title">${peek.title}</h1><p>${'<mark class="hl-mark">x</mark>'.repeat(peek.marks)}</p></div></div>` : '') +
    '</div></div>';
}

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

describe('smoke.js waitForMarks — the marks of the LIVE page, never a neighbour\'s inert peek', () => {
  // The first outing on the live origin: after next -> prev the prev peek (the letter just left,
  // 157 seeded marks) satisfied a document-wide count at +0 ms, and the live page — freshly
  // committed, not yet painted — then read 0 (letterAnn FAIL 8 of 8).
  it('marks on the inert peek alone do not end the wait; the live page painting does', async () => {
    vi.useFakeTimers();
    mountReadingScreen({ live: { title: 'The Wide Path', marks: 0 }, peek: { title: 'A Word of Warning', marks: 157 } });
    expect(document.querySelectorAll('mark.hl-mark').length, 'the peek IS in the document — a document-wide count would say painted').toBe(157);
    let at = null;
    waitForMarks(4000, /A Word of Warning/).then((v) => { at = v; });
    await vi.advanceTimersByTimeAsync(300);
    expect(at, 'still waiting: the live page is another letter, its marks are the peek\'s').toBe(null);
    // The pager commits the destination as the live page (no marks yet), then the pass paints.
    mountReadingScreen({ live: { title: 'A Word of Warning', marks: 0 }, peek: { title: 'The Wide Path', marks: 0 } });
    await vi.advanceTimersByTimeAsync(200);
    expect(at, 'the destination is live but unpainted: still waiting').toBe(null);
    mountReadingScreen({ live: { title: 'A Word of Warning', marks: 157 }, peek: { title: 'The Wide Path', marks: 0 } });
    await vi.advanceTimersByTimeAsync(100);
    expect(at).toBeGreaterThanOrEqual(600);
    expect(at).toBeLessThan(800);
  });

  it('without a title the wait still counts only the live page', async () => {
    vi.useFakeTimers();
    mountReadingScreen({ live: { title: 'Introduction', marks: 0 }, peek: { title: 'Next entry', marks: 12 } });
    let at = null;
    waitForMarks(4000).then((v) => { at = v; });
    await vi.advanceTimersByTimeAsync(200);
    expect(at).toBe(null);
    mountReadingScreen({ live: { title: 'Introduction', marks: 54 }, peek: { title: 'Next entry', marks: 12 } });
    await vi.advanceTimersByTimeAsync(100);
    expect(at).toBeGreaterThanOrEqual(200);
  });

  it('control: the live page already painted reads at once (0 ms) — the harness DOM is reachable', async () => {
    vi.useFakeTimers();
    mountReadingScreen({ live: { title: 'Introduction', marks: 54 }, peek: null });
    const p = waitForMarks(4000, /Introduction/i);
    await vi.advanceTimersByTimeAsync(0);
    expect(await p).toBe(0);
  });
});
