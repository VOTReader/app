/* AutoScrollControl — the hands-free reading transport's on-screen pill.
   ─────────────────────────────────────────────────────────────────
   The controller's own contract is pinned in hooks/use-autoscroll.test.js
   against a manual clock. This suite covers what the COMPONENT owes:
   render gating, the portal (a fixed pill inside .pager-track would be
   displaced by the swipe-settle transform), the speed controls, and the
   body-class handshake that lets colliding chrome + thumbnail capture
   stand down. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { AutoScrollControl, AutoScrollContext, measureWordsPerLine } from './AutoScrollControl.jsx';

// ReactDOM is a runtime global in the app (bundle-a UMD); bare test hosts
// must supply it before the portal renders.
/** @type {any} */ (globalThis).ReactDOM = ReactDOM;

function makeCfg(overrides = {}) {
  return {
    enabled: true,
    speedLpm: 16,
    autoNext: false,
    endDwellMs: 2500,
    keepScreenOnPref: true,
    onSpeedChange: vi.fn(),
    onDwellChange: vi.fn(),
    ...overrides,
  };
}

const PAGER = { peek: () => null, onNext: vi.fn(), onPrev: vi.fn() };

const LH = 20; // px per line in the fixture

/**
 * jsdom does not lay text out — every box is zero-sized and getClientRects()
 * is empty — so the honest words/line measurement finds nothing to measure.
 * The harness owns this DOM: stub the geometry here rather than teaching
 * production code to pretend.
 *
 * Each entry is [text, visual lines, client rects, tag]. The two counts are
 * separate on purpose: a BLOCK paragraph (LetterView puts data-hl-key on the
 * `<p>` itself) reports exactly ONE client rect however many lines it wraps
 * to, while an inline span reports one per line. Both shapes ship.
 */
function paintSpans(el, spans) {
  for (const [text, lines, rects = lines, tag = 'span'] of spans) {
    const node = document.createElement(tag);
    node.setAttribute('data-hl-key', 'k' + el.children.length);
    node.textContent = text;
    node.style.lineHeight = LH + 'px';
    node.getClientRects = () => /** @type {any} */ (new Array(rects).fill({}));
    node.getBoundingClientRect = () => /** @type {any} */ ({ height: lines * LH, top: 0, left: 0, width: 100 });
    el.appendChild(node);
  }
}

function mount(cfg, props = {}) {
  const { spans, ...rest } = props;
  const scrollRef = { current: document.createElement('div') };
  document.body.appendChild(scrollRef.current);
  if (spans) paintSpans(scrollRef.current, spans);
  const utils = render(
    <AutoScrollContext.Provider value={cfg}>
      <AutoScrollControl scrollRef={scrollRef} pager={PAGER} placeKey="psalms-23" {...rest} />
    </AutoScrollContext.Provider>
  );
  return { ...utils, scrollRef };
}

beforeEach(() => {
  if (!window.matchMedia) {
    /** @type {any} */ (window).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
  }
});
afterEach(() => {
  cleanup();
  document.body.className = '';
  vi.restoreAllMocks();
});

describe('render gating', () => {
  it('renders nothing until the reader turns it on in Settings', () => {
    mount(makeCfg({ enabled: false }));
    expect(document.querySelector('.ascroll-pill')).toBeNull();
  });

  it('renders nothing on a screen with no pager (non-reading screens)', () => {
    mount(makeCfg(), { pager: null });
    expect(document.querySelector('.ascroll-pill')).toBeNull();
  });

  it('renders the pill when enabled on a reading screen', () => {
    mount(makeCfg());
    expect(document.querySelector('.ascroll-pill')).not.toBeNull();
    expect(screen.getByLabelText('Start auto-scroll')).toBeTruthy();
  });
});

describe('portal', () => {
  it('mounts to <body>, NOT inside the pager track', () => {
    // A position:fixed element inside .pager-track resolves against the
    // track's transform during a swipe settle and slides off-screen with it.
    const { container } = mount(makeCfg());
    const pill = document.querySelector('.ascroll-pill');
    expect(pill).not.toBeNull();
    expect(container.contains(pill)).toBe(false);
    expect(pill.parentElement).toBe(document.body);
  });

  it('leaves no orphaned node behind on unmount', () => {
    const { unmount } = mount(makeCfg());
    expect(document.querySelector('.ascroll-pill')).not.toBeNull();
    unmount();
    expect(document.querySelector('.ascroll-pill')).toBeNull();
  });
});

describe('speed controls', () => {
  it('the ± buttons adjust speed without leaving the page', () => {
    const cfg = makeCfg({ speedLpm: 16 });
    mount(cfg);
    fireEvent.click(screen.getByLabelText('Faster'));
    expect(cfg.onSpeedChange).toHaveBeenCalledWith(18);
    fireEvent.click(screen.getByLabelText('Slower'));
    expect(cfg.onSpeedChange).toHaveBeenCalledWith(14);
  });

  it('clamps at both ends rather than running off the scale', () => {
    const fast = makeCfg({ speedLpm: 40 });
    mount(fast);
    expect(/** @type {any} */ (screen.getByLabelText('Faster')).disabled).toBe(true);
    cleanup();
    const slow = makeCfg({ speedLpm: 4 });
    mount(slow);
    expect(/** @type {any} */ (screen.getByLabelText('Slower')).disabled).toBe(true);
  });

  it('shows the speed in lines/min while paused — the unit that survives text resizing', () => {
    // No laid-out text on this page, so no measured rate to add (below).
    mount(makeCfg({ speedLpm: 22 }));
    expect(screen.getByRole('status').textContent).toBe('22 lines/min');
  });
});

/* ─────────────────────────────────────────────────────────────────────
   MEASURED words/min. The old ≈wpm figure in Settings multiplied by a
   hardcoded 9 words per line and admitted in a comment that it was a
   guess. The honest number needs the page, so it lives here.
   ───────────────────────────────────────────────────────────────────── */
describe('measured reading rate', () => {
  it('counts words against LAID-OUT lines, not elements', () => {
    const el = document.createElement('div');
    paintSpans(el, [['one two three four', 2], ['five six', 1]]);
    expect(measureWordsPerLine(el)).toBe(2); // 6 words / 3 lines
  });

  it('counts a BLOCK paragraph by its height, not its single client rect', () => {
    // LetterView hangs data-hl-key on the <p> itself. getClientRects() on a
    // block is one border box however many lines it wraps to — trusting it
    // would have reported 8 words per line as 8 words per PARAGRAPH.
    const el = document.createElement('div');
    paintSpans(el, [['a b c d e f g h i j k l', 4, 1, 'p']]);
    expect(measureWordsPerLine(el)).toBe(3); // 12 words / 4 lines
  });

  it('ignores the note icon and anything the page has not laid out', () => {
    const el = document.createElement('div');
    paintSpans(el, [
      ['one two three four', 2],
      ['', 1],                       // the note ICON also carries data-hl-key
      ['off screen entirely here', 0, 1], // content-visibility:auto — collapsed
    ]);
    expect(measureWordsPerLine(el)).toBe(2);
  });

  it('reports nothing rather than a fabricated rate on an unmeasurable page', () => {
    expect(measureWordsPerLine(document.createElement('div'))).toBe(0);
    expect(measureWordsPerLine(null)).toBe(0);
  });

  it('shows words/min on the pill once the page has been measured', async () => {
    // 8 words over 2 lines = 4 words/line; at 20 lines/min that is 80 wpm.
    mount(makeCfg({ speedLpm: 20 }), { spans: [['a b c d e f g h', 2]] });
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe('20 lines/min · ~80 wpm');
    });
  });

  it('re-derives it from the same measurement when the speed changes', async () => {
    const { rerender, scrollRef } = mount(makeCfg({ speedLpm: 20 }), { spans: [['a b c d e f g h', 2]] });
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('~80 wpm'));
    rerender(
      <AutoScrollContext.Provider value={makeCfg({ speedLpm: 30 })}>
        <AutoScrollControl scrollRef={scrollRef} pager={PAGER} placeKey="psalms-23" />
      </AutoScrollContext.Provider>
    );
    expect(screen.getByRole('status').textContent).toBe('30 lines/min · ~120 wpm');
  });
});

/* ─────────────────────────────────────────────────────────────────────
   The dwell knob. The moment you want to change the auto-continue pause
   is the moment the countdown is on screen — which is the worst possible
   moment to send the reader to Settings.
   ───────────────────────────────────────────────────────────────────── */
describe('dwell control', () => {
  const TIMER = 'Adjust the pause before the next page';

  it('offers no timer button when nothing ever waits', () => {
    mount(makeCfg({ autoNext: false }));
    expect(screen.queryByLabelText(TIMER)).toBeNull();
  });

  it('keeps the second row off the pill until it is asked for', () => {
    mount(makeCfg({ autoNext: true }));
    expect(screen.queryByLabelText('Longer pause before the next page')).toBeNull();
    fireEvent.click(screen.getByLabelText(TIMER));
    expect(screen.getByLabelText('Longer pause before the next page')).toBeTruthy();
    expect(document.querySelector('.ascroll-dwell-value').textContent).toBe('2.5s');
    fireEvent.click(screen.getByLabelText(TIMER));
    expect(screen.queryByLabelText('Longer pause before the next page')).toBeNull();
  });

  it('steps in half seconds and reads 0 the way Settings does', () => {
    const cfg = makeCfg({ autoNext: true, endDwellMs: 500 });
    mount(cfg);
    fireEvent.click(screen.getByLabelText(TIMER));
    fireEvent.click(screen.getByLabelText('Longer pause before the next page'));
    expect(cfg.onDwellChange).toHaveBeenCalledWith(1000);
    fireEvent.click(screen.getByLabelText('Shorter pause before the next page'));
    expect(cfg.onDwellChange).toHaveBeenCalledWith(0);
    cleanup();
    mount(makeCfg({ autoNext: true, endDwellMs: 0 }));
    fireEvent.click(screen.getByLabelText(TIMER));
    expect(document.querySelector('.ascroll-dwell-value').textContent).toBe('None');
  });

  it('clamps at both ends instead of writing an impossible dwell', () => {
    mount(makeCfg({ autoNext: true, endDwellMs: 0 }));
    fireEvent.click(screen.getByLabelText(TIMER));
    expect(/** @type {any} */ (screen.getByLabelText('Shorter pause before the next page')).disabled).toBe(true);
    cleanup();
    mount(makeCfg({ autoNext: true, endDwellMs: 15000 }));
    fireEvent.click(screen.getByLabelText(TIMER));
    expect(/** @type {any} */ (screen.getByLabelText('Longer pause before the next page')).disabled).toBe(true);
  });

  it('hides the row again if auto-continue is switched off underneath it', () => {
    const { rerender, scrollRef } = mount(makeCfg({ autoNext: true }));
    fireEvent.click(screen.getByLabelText(TIMER));
    expect(screen.getByLabelText('Longer pause before the next page')).toBeTruthy();
    rerender(
      <AutoScrollContext.Provider value={makeCfg({ autoNext: false })}>
        <AutoScrollControl scrollRef={scrollRef} pager={PAGER} placeKey="psalms-23" />
      </AutoScrollContext.Provider>
    );
    expect(screen.queryByLabelText('Longer pause before the next page')).toBeNull();
  });
});

describe('body-class handshake', () => {
  it('marks autoscroll-on while mounted so colliding chrome stands down', () => {
    const { unmount } = mount(makeCfg());
    expect(document.body.classList.contains('autoscroll-on')).toBe(true);
    unmount();
    expect(document.body.classList.contains('autoscroll-on')).toBe(false);
  });

  it('does not mark it when disabled', () => {
    mount(makeCfg({ enabled: false }));
    expect(document.body.classList.contains('autoscroll-on')).toBe(false);
  });
});

describe('dwell control during the countdown', () => {
  // peek('next') must resolve to a real screen or the controller stops at the
  // boundary instead of arming a dwell.
  const NEXT_PAGER = { peek: () => ({ kind: 'screen' }), onNext: vi.fn(), onPrev: vi.fn() };

  it('puts ± beside the countdown so the pause can be tuned while it runs', async () => {
    // An empty jsdom container is zero-height, so the transport reaches "the
    // end of the text" on its first frame — which is exactly the state under
    // test. The controller-side re-arm is pinned in use-autoscroll.test.js.
    const cfg = makeCfg({ autoNext: true, endDwellMs: 2500 });
    mount(cfg, { pager: NEXT_PAGER });
    fireEvent.click(screen.getByLabelText('Start auto-scroll'));
    await waitFor(() => expect(screen.getByLabelText('Cancel auto-advance')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Longer pause before the next page'));
    expect(cfg.onDwellChange).toHaveBeenCalledWith(3000);
    fireEvent.click(screen.getByLabelText('Shorter pause before the next page'));
    expect(cfg.onDwellChange).toHaveBeenCalledWith(2000);
  });
});

describe('accessibility', () => {
  it('every control carries a name, and the toggle reports its state', () => {
    mount(makeCfg({ autoNext: true }));
    const toggle = screen.getByLabelText('Start auto-scroll');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByLabelText('Faster')).toBeTruthy();
    expect(screen.getByLabelText('Slower')).toBeTruthy();
    const timer = screen.getByLabelText('Adjust the pause before the next page');
    expect(timer.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(timer);
    expect(timer.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Shorter pause before the next page')).toBeTruthy();
    expect(screen.getByLabelText('Longer pause before the next page')).toBeTruthy();
    // Speed changes are announced politely rather than on every frame.
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
  });
});
