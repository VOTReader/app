/* The navigation stream (w3): the double-tap's way back, the eased flyTo, the journey, the
   go-to and the doors in. The camera, the journey and the selection are wired as the screen wires
   them (contracts.test.jsx's harness), with a frame loop that runs on demand. */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebCamera } from './use-web-camera.js';
import { useWebSelection } from './use-web-selection.js';
import { useJourney } from './use-journey.js';

const TOTAL = 31102;
const graph = () => ({
  total: TOTAL, count: 2, buckets: [{ off: 0, len: 2, off20: 2, off10: 2, segments: 8, chunks: [[100, 20100]] }],
  books: [{ id: 'genesis-plain', title: 'Genesis', abbr: 'Gen' }],
  chapters: [[0, 1, 0, TOTAL]], chapterOfVerse: new Uint16Array(TOTAL),
  from: new Uint16Array([100, 200]), to: new Uint16Array([20100, 300]), votes: new Int16Array([7, 30]),
  votEdges: [], prophecy: [{ a: 5, b: 9000 }], votLinks: [], chunkSize: 256,
});

function mount() {
  const g = graph();
  const schedule = vi.fn();
  const setAnnounce = vi.fn();
  const hook = renderHook(() => {
    const modeRef = React.useRef('canonical');
    const cam = useWebCamera({ graph: g, density: 'famous', modeRef, schedule });
    const journey = useJourney();
    const resumeRef = React.useRef(null);
    const personalRef = React.useRef(null);
    const elevatorRef = React.useRef(null);
    const badgeBoxesRef = React.useRef([]);
    const overlayFrameRef = React.useRef(null);
    const railOpts = React.useCallback(() => ({}), []);
    const sel = useWebSelection({
      graph: g, mode: 'canonical', density: 'famous', showUnderlay: false, resumeRef,
      camRef: cam.camRef, viewRef: cam.viewRef, focusRef: cam.focusRef, viewFor: cam.viewFor, yFrameFor: cam.yFrameFor,
      personalRef, railOpts, elevatorRef, badgeBoxesRef, overlayFrameRef, flyTo: cam.flyTo, journey, schedule, setAnnounce,
    });
    return { cam, sel, journey };
  });
  const { cam } = hook.result.current;
  cam.viewRef.current = { W: 800, H: 360, DPR: 1 };
  cam.camRef.current = { x: 15551, ppv: 8, total: TOTAL, y: 0 };
  return { hook, g, schedule, setAnnounce, get: () => hook.result.current };
}

describe('the double-tap takes back its first tap (A1): the selection keeps a way back', () => {
  it('snapshot before a tap, then restore: the card the tap opened goes, and what was open returns', () => {
    const { get } = mount();
    act(() => { get().sel.openPanel({ mode: 'connection', arc: 1 }); });
    const before = get().cam.focusRef.current;
    const undo = get().sel.handlersRef.current.snapshot();
    act(() => { get().sel.openPanel({ mode: 'verse', verse: 100 }); });
    expect(get().sel.detail).toMatchObject({ kind: 'verse' });
    act(() => { undo(); });
    expect(get().sel.detail).toMatchObject({ kind: 'arc', index: 1 });
    expect(get().cam.focusRef.current, 'the focus is the one before the tap, whole').toBe(before);
  });

  it('a first tap on empty sky with nothing open: the way back is nothing open', () => {
    const { get } = mount();
    const undo = get().sel.handlersRef.current.snapshot();
    act(() => { get().sel.openPanel({ mode: 'connection', arc: 0 }); });
    act(() => { undo(); });
    expect(get().sel.detail).toBeNull();
    expect(get().cam.focusRef.current.arc).toBe(-1);
  });
});
