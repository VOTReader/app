/* useReadTracker — the multi-vector read detector (geometry-sweep design).
   ────────────────────────────────────────────────────────────────────
   The two HEADLINE cases are regression-locks on the old detector's
   structural holes (ScreenLayout's scroll≥90% trigger, deleted
   2026-08-03):
     1. FLICK: scroll-to-bottom in a second marked a letter read. Here:
        segments never continuously visible credit nothing.
     2. FITS-VIEWPORT: a WTLB entry with no scrollbar could NEVER
        auto-mark. Here: full visibility + required dwell completes
        with zero scroll events.
   The adversarial-review locks (2026-08-03, 12 confirmed findings):
     3. TALL blocks (> 2 viewports — long poetry, Text Size 300%) credit
        via the fill-the-viewport rule (IO thresholds structurally
        could not deliver this — the reason the design is a geometry
        sweep, not IntersectionObserver).
     4. A mid-visit DOM swap under the same placeKey (the headings
        toggle) keeps credit — state is keyed by hl-key STRING.
     5. Late-mounting content grows the coverage denominator (no
        shrunken-denominator false completions).
     6. The final frontier flush survives the meta global being nulled
        before cleanup (snapshot, not live read).
     7. Pace samples are reported at VISIT END with the final activeMs,
        never at the biased completion instant.
   Geometry is driven through stubbed getBoundingClientRect (jsdom has
   no layout).
*/

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useReadTracker } from './use-read-tracker.js';

const setRect = (el, top, height) => {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top, bottom: top + height, height, left: 0, right: 100, width: 100 }),
  });
};
const VIEW_H = 800;

/** Container with `n` [data-hl-key] paragraphs of `words` words each. */
function buildContent(n, words) {
  const root = document.createElement('div');
  setRect(root, 0, VIEW_H);
  Object.defineProperty(root, 'clientHeight', { configurable: true, value: VIEW_H });
  for (let i = 0; i < n; i++) root.appendChild(makePara('seg' + i, words));
  document.body.appendChild(root);
  return root;
}
function makePara(key, words) {
  const p = document.createElement('p');
  p.setAttribute('data-hl-key', key);
  p.textContent = Array.from({ length: words }, (_, w) => 'word' + w).join(' ');
  setRect(p, 100, 50);            // visible by default
  return p;
}
const show = (el) => setRect(el, 100, 50);
const hide = (el) => setRect(el, 5000, 50);
const paras = (root) => [...root.querySelectorAll('[data-hl-key]')];

let root = null;
let complete;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'Date', 'performance'] });
  complete = vi.fn();
  window.__onReadingComplete = complete;
  window.__readTrackerMeta = { key: 'v1:test:item' };
});

afterEach(() => {
  vi.useRealTimers();
  window.__onReadingComplete = null;
  window.__readTrackerMeta = null;
  delete /** @type {any} */ (globalThis).ReadingStatsStore;
  document.body.classList.remove('scroll-restoring');
  if (root) { root.remove(); root = null; }
});

const mount = (r) => renderHook(() => useReadTracker({ current: r }, false, 'visit-1'));

describe('useReadTracker — headline regressions vs the old trigger', () => {
  it('FLICK: segments that flash by credit nothing — no completion no matter how long', () => {
    root = buildContent(10, 50);           // 500 words
    mount(root);
    vi.advanceTimersByTime(600);           // sweep 1 sees everything visible…
    paras(root).forEach(hide);             // …but by sweep 2 it has flicked past
    vi.advanceTimersByTime(120000);        // two minutes on the screen after the flick
    expect(complete).not.toHaveBeenCalled();
  });

  it('FITS-VIEWPORT: full visibility + required dwell completes with ZERO scroll events', () => {
    root = buildContent(2, 45);            // 90 words → required = max(9000, 8000) = 9000ms
    mount(root);
    vi.advanceTimersByTime(8500);          // visible + crediting, but under required
    expect(complete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);          // past 9s + a sweep
    expect(complete).toHaveBeenCalledTimes(1);
    const payload = complete.mock.calls[0][0];
    expect(payload.words).toBe(90);
    expect(payload.coverage).toBeGreaterThanOrEqual(0.9);
    expect(payload.activeMs).toBeGreaterThanOrEqual(9000);
    vi.advanceTimersByTime(30000);         // once per visit — never re-fires
    expect(complete).toHaveBeenCalledTimes(1);
  });
});

describe('useReadTracker — vectors', () => {
  it('required time scales with content (1200 words → 2 minutes, not 8 seconds)', () => {
    root = buildContent(12, 100);          // 1200 words → 120000ms required
    mount(root);
    vi.advanceTimersByTime(100000);
    expect(complete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(21000);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('coverage gates at 90% by words: 8 of 10 segments read is not a completed read', () => {
    root = buildContent(10, 30);           // 300 words → required 30s
    mount(root);
    const els = paras(root);
    els.slice(8).forEach(hide);            // segments 8+9 never on screen
    vi.advanceTimersByTime(60000);         // twice the required time
    expect(complete).not.toHaveBeenCalled();
    show(els[8]);                          // 90% credited
    vi.advanceTimersByTime(2000);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('TALL segments (poetry blocks, 300% text size) credit via the fill-the-viewport rule', () => {
    // Review 2026-08-03 (3 independent lenses): IO thresholds could never
    // deliver this — a 3000px block never reaches ratio 0.5. Geometry can:
    // it fills 600 of the 800px viewport (>= 60%), so it credits.
    root = buildContent(2, 100);           // 200 words → required 20s
    const els = paras(root);
    setRect(els[0], -2000, 3000);          // tall block scrolled mid-way through
    show(els[1]);
    mount(root);
    vi.advanceTimersByTime(21000);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0].words).toBe(200);
  });

  it('a hidden document accrues no reading time', () => {
    root = buildContent(2, 45);            // required 9s
    mount(root);
    vi.advanceTimersByTime(2000);          // ~1.5s accrued while visible
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(600000);        // 10 minutes backgrounded — banks nothing
    expect(complete).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(9000);          // finish the required dwell in the foreground
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('does not bank dwell time before reading content mounts', () => {
    root = document.createElement('div');
    setRect(root, 0, VIEW_H);
    Object.defineProperty(root, 'clientHeight', { configurable: true, value: VIEW_H });
    document.body.appendChild(root);
    mount(root);
    vi.advanceTimersByTime(20000);         // loader/placeholder, no readable candidates
    root.appendChild(makePara('late', 90));
    vi.advanceTimersByTime(5000);
    expect(complete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);          // 90 words needs ~9s after content appears
    expect(complete).toHaveBeenCalledTimes(1);
  });
});

describe('useReadTracker — DOM churn resilience (review locks)', () => {
  it('SETTLE: content that mounts late grows the denominator (no shrunken-denominator completion)', () => {
    root = buildContent(1, 40);            // only block 0 mounted at t0
    mount(root);
    vi.advanceTimersByTime(600);
    for (let i = 1; i < 5; i++) root.appendChild(makePara('late' + i, 40)); // corpus settles: 200 words total
    paras(root).slice(1).forEach(hide);    // the late blocks are below the fold
    vi.advanceTimersByTime(60000);         // ages beyond any required time
    expect(complete).not.toHaveBeenCalled();   // 40/200 words is not a read letter
    paras(root).forEach(show);
    vi.advanceTimersByTime(21000);         // 200 words → 20s required
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0].words).toBe(200);
  });

  it('HEADINGS TOGGLE: a mid-visit DOM swap under the same placeKey keeps credit (hl-key state)', () => {
    root = buildContent(4, 50);            // 200 words → required 20s
    mount(root);
    vi.advanceTimersByTime(10000);         // everything credits; half the time banked
    // The view re-renders every block as NEW nodes with the SAME hl-keys
    // (exactly what BibleChapterView's headings toggle does).
    paras(root).forEach((p) => p.remove());
    for (let i = 0; i < 4; i++) root.appendChild(makePara('seg' + i, 50));
    vi.advanceTimersByTime(11000);         // remaining required time passes
    expect(complete).toHaveBeenCalledTimes(1);   // credit survived the swap
    expect(complete.mock.calls[0][0].words).toBe(200);
  });

  it('segments inside an [inert] subtree are excluded from coverage', () => {
    root = buildContent(2, 50);            // 100 words of real content
    const peek = document.createElement('div');
    peek.setAttribute('inert', '');
    const clone = makePara('clone', 500);  // a huge inert clone must not count
    peek.appendChild(clone);
    root.appendChild(peek);
    mount(root);
    vi.advanceTimersByTime(11000);         // 100 words → 10s required
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0].words).toBe(100);
  });
});

describe('useReadTracker — frontier + pace plumbing', () => {
  it('reports the partial-read frontier on unmount EVEN IF the meta global was nulled first', () => {
    const recordProgress = vi.fn();
    /** @type {any} */ (globalThis).ReadingStatsStore = { recordProgress };
    root = buildContent(6, 50);
    const els = paras(root);
    els.slice(2).forEach(hide);            // read only the first two paragraphs
    const h = mount(root);
    vi.advanceTimersByTime(2000);          // both credit
    window.__readTrackerMeta = null;       // the view's cleanup ran first (review lock #6)
    h.unmount();
    expect(recordProgress).toHaveBeenCalledWith('v1:test:item', 6, [0, 1], [50, 50, 50, 50, 50, 50]);
  });

  it('excludes nested annotation chrome from frontier indices and word weights', () => {
    const recordProgress = vi.fn();
    /** @type {any} */ (globalThis).ReadingStatsStore = { recordProgress };
    root = buildContent(2, 50);
    const icon = document.createElement('span');
    icon.className = 'hl-note-icon';
    icon.setAttribute('data-hl-key', 'seg0');
    root.children[0].appendChild(icon);
    hide(root.children[1]);
    const h = mount(root);
    vi.advanceTimersByTime(2000);
    h.unmount();
    expect(recordProgress).toHaveBeenCalledWith('v1:test:item', 2, [0], [50, 50]);
  });

  it('reports the end-of-visit pace sample for a COMPLETED read — not the completion instant', () => {
    const recordPaceSample = vi.fn();
    const recordProgress = vi.fn();
    /** @type {any} */ (globalThis).ReadingStatsStore = { recordPaceSample, recordProgress };
    root = buildContent(2, 45);            // 90 words → required 9s
    const h = mount(root);
    vi.advanceTimersByTime(10600);         // completes ~9-10s in
    expect(complete).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20000);         // keeps reading (re-reading, lingering)
    h.unmount();
    expect(recordPaceSample).toHaveBeenCalledTimes(1);
    const s = recordPaceSample.mock.calls[0][0];
    expect(s.words).toBe(90);
    expect(s.requiredMs).toBe(9000);
    expect(s.activeMs).toBeGreaterThan(25000);   // FINAL time, not the ~9s completion instant
  });

  it('NEVER moves the viewport — the saved scroll position owns resume (frontier jump retired)', () => {
    /** @type {any} */ (globalThis).ReadingStatsStore = {
      recordProgress: vi.fn(),
      firstUnreadIndex: vi.fn(() => 3),
    };
    root = buildContent(6, 50);
    root.scrollTop = 5000;                 // the user flicked to the bottom last visit
    Object.defineProperty(root.children[3], 'offsetTop', { configurable: true, value: 2000 });
    const scrollTo = vi.fn();
    root.scrollTo = scrollTo;
    mount(root);
    vi.advanceTimersByTime(60000);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(root.scrollTop).toBe(5000);
    expect(/** @type {any} */ (globalThis).ReadingStatsStore.firstUnreadIndex).not.toHaveBeenCalled();
  });

  it('does not credit the temporary scroll-memory viewport while the restore is in flight', () => {
    const recordProgress = vi.fn();
    /** @type {any} */ (globalThis).ReadingStatsStore = {
      recordProgress,
      firstUnreadIndex: vi.fn(() => 2),
    };
    root = buildContent(4, 50);
    paras(root).forEach(hide);
    show(root.children[3]);                 // mid-restore the viewport sits at the bottom
    document.body.classList.add('scroll-restoring');
    const h = mount(root);
    vi.advanceTimersByTime(1000);
    document.body.classList.remove('scroll-restoring');
    vi.advanceTimersByTime(600);            // settle sweep only — no credit banked yet
    h.unmount();
    expect(recordProgress).not.toHaveBeenCalled();
  });

  it('does nothing when inert (a swipe peek must never track)', () => {
    root = buildContent(3, 50);
    renderHook(() => useReadTracker({ current: root }, true, 'peek'));
    vi.advanceTimersByTime(60000);
    expect(complete).not.toHaveBeenCalled();
  });

  it('stays disarmed on screens with no reading bridge', () => {
    window.__onReadingComplete = null;
    root = buildContent(3, 50);
    mount(root);
    vi.advanceTimersByTime(60000);
    expect(complete).not.toHaveBeenCalled();
  });
});

describe('useReadTracker — data-read-seg (rendered prose that is not annotatable)', () => {
  /* A letter's sectionIntro and a Bible section heading render in the reading
     flow but carry no data-hl-key (they are not annotatable). Before the
     detector unioned data-read-seg, a reader could scroll past visible intro
     prose and still satisfy coverage, and the detector's word total disagreed
     with countItemWords, which does count that prose. */
  const makeSeg = (segId, words) => {
    const p = document.createElement('p');
    p.setAttribute('data-read-seg', segId);
    p.textContent = Array.from({ length: words }, (_, w) => 'w' + w).join(' ');
    setRect(p, 100, 50);
    return p;
  };

  it('an UNREAD intro segment holds completion back', () => {
    root = buildContent(1, 50);            // one annotatable body block, visible
    const intro = makeSeg('intro-p:0', 50);
    hide(intro);                            // reader never scrolled the intro
    root.insertBefore(intro, root.firstChild);
    renderHook(() => useReadTracker({ current: root }, false, 'k'));
    vi.advanceTimersByTime(60000);
    expect(complete).not.toHaveBeenCalled(); // 50/100 words = 50% coverage
  });

  it('completes once the intro segment is read too', () => {
    root = buildContent(1, 50);
    const intro = makeSeg('intro-p:0', 50);
    root.insertBefore(intro, root.firstChild);   // both visible
    renderHook(() => useReadTracker({ current: root }, false, 'k'));
    vi.advanceTimersByTime(60000);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0].words).toBe(100);  // intro words counted
  });

  it('namespaces read-seg keys so they cannot collide with annotation keys', () => {
    const recordProgress = vi.fn();
    /** @type {any} */ (globalThis).ReadingStatsStore = { recordProgress, recordPaceSample: vi.fn() };
    root = buildContent(1, 20);
    root.insertBefore(makeSeg('seg0', 20), root.firstChild);  // same raw id as body key 'seg0'
    const h = renderHook(() => useReadTracker({ current: root }, false, 'k'));
    vi.advanceTimersByTime(3000);
    h.unmount();
    // 2 distinct segments credited — not 1 collapsed by a key collision.
    const call = recordProgress.mock.calls[recordProgress.mock.calls.length - 1];
    expect(call[1]).toBe(2);
    expect(call[2]).toEqual([0, 1]);
  });
});
