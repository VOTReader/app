// @vitest-environment jsdom
/* read-along.jsx (rv1 1b): the live wash is main's ReadAlongHighlight read from window; a gate paints a still wash and
   holds the player (so the gate) until it is on the page. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { LetterReadAlong, gateAt, stillWashes } from './read-along.jsx';

const g = /** @type {any} */ (globalThis);
const PLAYING = { item: { collection: 'one', n: 1 }, reader: 'B', at: 231, length: 608, paused: false };

/** A letter body with one [data-hl-key] block, and the wash beside it (as LetterScreen renders them). */
function Host({ gate, on = true, follow = true, withBody = true }) {
  const bodyRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  return (
    <div>
      {withBody && <div className="body" ref={bodyRef}><p data-hl-key="one-1:0">Text.</p></div>}
      <LetterReadAlong gate={gate} collection="one" n={1} volKey="one" letterId="one-1" bodyRef={bodyRef} on={on} follow={follow} />
    </div>
  );
}

/** main's audioSyncStore stand-in: the timings file lands when the test says so. */
function syncStore() {
  const listeners = new Set();
  let v = 0;
  g.__audioSyncStore = { subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); }, getVersion: () => v };
  return () => act(() => { v += 1; listeners.forEach((cb) => cb()); });
}

beforeEach(() => {
  g.letterHlKey = (id, i) => id + ':' + i;
  g.clearReadAlong = vi.fn();
});
afterEach(() => {
  cleanup();
  for (const k of ['letterHlKey', 'clearReadAlong', 'paintReadAlongAt', 'ReadAlongHighlight', '__audioSyncStore']) delete g[k];
});

describe('gateAt', () => {
  it("is the row's clock on the letter it plays, and null on any other or with nothing playing", () => {
    expect(gateAt({ playing: PLAYING }, 'one', 1)).toBe(231);
    expect(gateAt({ playing: PLAYING }, 'one', 2)).toBe(null);
    expect(gateAt({ playing: PLAYING }, 'two', 1)).toBe(null);
    expect(gateAt({}, 'one', 1)).toBe(null);
    expect(gateAt(null, 'one', 1)).toBe(null);
  });
});

describe('a real boot: main\'s ReadAlongHighlight over the one engine', () => {
  it('mounts window.ReadAlongHighlight on the body with the letter, its hl keys and the two switches', () => {
    const seen = [];
    g.ReadAlongHighlight = (p) => { seen.push(p); return null; };
    render(<Host gate={null} follow={false} />);
    const p = seen[seen.length - 1];
    expect(p.volKey).toBe('one');
    expect(p.letterId).toBe('one-1');
    expect(p.hlKeyFn).toBe(g.letterHlKey);
    expect(p.readAlongOn).toBe(true);
    expect(p.readAlongFollow).toBe(false);
    expect(p.mainRef.current.className).toBe('body');
  });

  it('renders nothing when bundle-d did not load (no component on window)', () => {
    const { container } = render(<Host gate={null} />);
    expect(container.querySelector('.body')).not.toBe(null);
    expect(stillWashes.pending()).toBe(0);
  });
});

describe('a gate boot: a still wash at playing.at, holding the gate until it is painted', () => {
  it('waits for the timings file, paints at the row\'s clock on the body, then lets the gate go', () => {
    const land = syncStore();
    let answer = 'waiting';
    g.paintReadAlongAt = vi.fn(() => answer);
    render(<Host gate={{ playing: PLAYING }} />);
    expect(stillWashes.pending()).toBe(1);
    const call = g.paintReadAlongAt.mock.calls[0][0];
    expect(call).toMatchObject({ volKey: 'one', letterId: 'one-1', time: 231 });
    expect(call.mainEl.className).toBe('body');
    answer = 'painted';
    land();
    expect(stillWashes.pending()).toBe(0);
  });

  it('a letter the gate is not playing paints nothing and holds nothing; so does read-along switched off', () => {
    g.paintReadAlongAt = vi.fn(() => 'painted');
    render(<Host gate={{ playing: { ...PLAYING, item: { collection: 'one', n: 2 } } }} />);
    expect(stillWashes.pending()).toBe(0);
    cleanup();
    render(<Host gate={{ playing: PLAYING }} on={false} />);
    expect(stillWashes.pending()).toBe(0);
    expect(g.paintReadAlongAt).not.toHaveBeenCalled();
  });

  it('holds while the body is not on the page yet, and lets go when it leaves', () => {
    g.paintReadAlongAt = vi.fn(() => 'painted');
    const { unmount } = render(<Host gate={{ playing: PLAYING }} withBody={false} />);
    expect(stillWashes.pending()).toBe(1);
    expect(g.paintReadAlongAt).not.toHaveBeenCalled();
    unmount();
    expect(stillWashes.pending()).toBe(0);
    expect(g.clearReadAlong).toHaveBeenCalled();
  });

  it('a page without main\'s painter (no bundle-d) never holds the gate', () => {
    render(<Host gate={{ playing: PLAYING }} />);
    expect(stillWashes.pending()).toBe(0);
  });
});
