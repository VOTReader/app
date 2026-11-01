// @ts-nocheck — test-only (vitest)
/* useFrameScheduler at unmount (#60's leak hunt, item 2): a frame still pending when the Scripture
   Web closed was not cancelled. It ran the last draw and the after-frame callbacks once more, against
   a screen that was gone, and My Web's fade (capFractionNow asks for the next frame while it eases)
   could keep scheduling frames from there. Held by the leak harness: a frame or timer of the hook's
   that runs after the unmount fails the test. */
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { installLeakHarness, expectNoLeaks } from '../leak/leak-harness.js';
import { useFrameScheduler } from './use-frame-scheduler.js';

let h;
afterEach(() => { if (h) { h.restore(); h = null; } });

describe('useFrameScheduler at unmount', () => {
  it('a frame pending when the screen closes never runs: no last draw, no after-frame callbacks', async () => {
    const drawn = [], after = [];
    const { result, unmount } = renderHook(() => useFrameScheduler());
    result.current.drawRef.current = () => drawn.push(1);
    result.current.onFrame(() => after.push(1));
    act(() => { result.current.schedule(); });
    unmount();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(drawn, 'the last draw').toEqual([]);
    expect(after, 'the after-frame callbacks').toEqual([]);
    // and a late schedule() (a gesture listener's last event) asks for nothing
    act(() => { result.current.schedule(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(drawn).toEqual([]);
  });

  it('leaves no frame running after 20 open/close cycles, with My Web\'s fade under way', async () => {
    h = installLeakHarness();
    await expectNoLeaks(h, () => {
      const r = renderHook(() => useFrameScheduler());
      const s = r.result.current;
      // the draw reads the fade the way the renderer does, so a fade under way keeps asking
      s.drawRef.current = () => { s.capFractionNow(); };
      s.onFrame(() => {});
      s.live();
      s.schedule();
      return r;
    }, { label: 'useFrameScheduler' });
  });
});
