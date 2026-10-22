/* Nearby that is actually nearby (A6): the list is re-derived where the camera comes to rest.
   It was worked out once, when Nearby opened, and stayed on that chapter however far the reader
   then flew. The camera now says where it settled (settledAt: the chapter in the lens, once no
   frame has moved it for SETTLE_MS) and the list reads it; mid-gesture it holds still. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebCamera, SETTLE_MS } from './use-web-camera.js';
import { useWebSelection } from './use-web-selection.js';
import { useJourney } from './use-journey.js';
import { useFrameScheduler } from './use-frame-scheduler.js';

let rafQueue = [];
const tick = () => { const q = rafQueue; rafQueue = []; act(() => { for (const cb of q) cb(performance.now()); }); };
beforeEach(() => {
  rafQueue = [];
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  vi.stubGlobal('requestAnimationFrame', (cb) => { rafQueue.push(cb); return rafQueue.length; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const TOTAL = 31102, SPLIT = 15000;
/* Two chapters: Genesis 1 holds verses 0..14999 and thread 0 (100 to 200); Genesis 2 the rest
   and thread 1 (20000 to 20100). */
const graph = () => {
  const chapterOfVerse = new Uint16Array(TOTAL);
  chapterOfVerse.fill(1, SPLIT);
  return {
    total: TOTAL, count: 2, buckets: [{ off: 0, len: 2, off20: 2, off10: 2, segments: 8, chunks: [[100, 20100]] }],
    books: [{ id: 'genesis-plain', title: 'Genesis', abbr: 'Gen' }],
    chapters: [[0, 1, 0, SPLIT], [0, 2, SPLIT, TOTAL - SPLIT]], chapterOfVerse,
    from: new Uint16Array([100, 20000]), to: new Uint16Array([200, 20100]), votes: new Int16Array([7, 9]),
    votEdges: [], prophecy: [], votLinks: [], chunkSize: 256,
  };
};

function mount() {
  const g = graph();
  const hook = renderHook(() => {
    const frames = useFrameScheduler();
    frames.drawRef.current = () => {};
    const modeRef = React.useRef('canonical');
    const cam = useWebCamera({ graph: g, density: 'famous', modeRef, schedule: frames.schedule, animate: frames.animate, onFrame: frames.onFrame });
    const journey = useJourney({ flyTo: cam.flyTo });
    const none = React.useRef(null);
    const boxes = React.useRef([]);
    const railOpts = React.useCallback(() => ({}), []);
    const sel = useWebSelection({
      graph: g, mode: 'canonical', density: 'famous', showUnderlay: false, resumeRef: none,
      camRef: cam.camRef, viewRef: cam.viewRef, focusRef: cam.focusRef, viewFor: cam.viewFor, yFrameFor: cam.yFrameFor,
      personalRef: none, railOpts, elevatorRef: none, badgeBoxesRef: boxes, overlayFrameRef: none, flyTo: cam.flyTo, journey,
      schedule: frames.schedule, setAnnounce: () => {}, settledAt: cam.settledAt,
    });
    return { cam, sel, frames };
  });
  const { cam } = hook.result.current;
  cam.viewRef.current = { W: 800, H: 360, DPR: 1 };
  cam.camRef.current = { x: 150, ppv: 8, total: TOTAL, y: 0 };
  return { get: () => hook.result.current };
}

const words = (get) => JSON.stringify(get().sel.listItems);

describe('Nearby follows the camera (A6)', () => {
  it('re-derived where the camera settles, not where Nearby was opened; still while it moves', () => {
    const { get } = mount();
    act(() => { get().sel.setListOpen(true); });
    expect(words(get)).toContain('Genesis 1');
    expect(words(get)).not.toContain('Genesis 2');
    // a flight across to Genesis 2, frame by frame
    for (const x of [6000, 12000, 18000, 20050]) {
      get().cam.camRef.current.x = x;
      act(() => { get().frames.schedule(); });
      tick();
      act(() => { vi.advanceTimersByTime(SETTLE_MS / 4); });
    }
    expect(words(get), 'mid-flight the list holds still').not.toContain('Genesis 2');
    act(() => { vi.advanceTimersByTime(SETTLE_MS); });
    expect(words(get), 'at rest it is the chapter in view').toContain('Genesis 2');
    expect(words(get)).not.toContain('Genesis 1');
  });

  it('a frame that does not move the camera (a hover) neither re-derives nor holds it off', () => {
    const { get } = mount();
    act(() => { get().sel.setListOpen(true); });
    act(() => { get().frames.schedule(); });
    tick();
    act(() => { vi.advanceTimersByTime(SETTLE_MS * 2); });
    const settled = get().cam.settledAt, list = get().sel.listItems;
    expect(settled).toBe(0);
    for (let i = 0; i < 3; i++) {
      act(() => { get().frames.schedule(); });
      tick();
      act(() => { vi.advanceTimersByTime(SETTLE_MS * 2); });
    }
    expect(get().cam.settledAt).toBe(settled);
    expect(get().sel.listItems, 'the same chapter: the same list, not a new one').toBe(list);
  });
});
