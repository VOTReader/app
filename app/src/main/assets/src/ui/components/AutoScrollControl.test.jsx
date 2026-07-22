/* AutoScrollControl — the hands-free reading transport's on-screen pill.
   ─────────────────────────────────────────────────────────────────
   The controller's own contract is pinned in hooks/use-autoscroll.test.js
   against a manual clock. This suite covers what the COMPONENT owes:
   render gating, the portal (a fixed pill inside .pager-track would be
   displaced by the swipe-settle transform), the speed controls, and the
   body-class handshake that lets colliding chrome + thumbnail capture
   stand down. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { AutoScrollControl, AutoScrollContext } from './AutoScrollControl.jsx';

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
    ...overrides,
  };
}

const PAGER = { peek: () => null, onNext: vi.fn(), onPrev: vi.fn() };

function mount(cfg, props = {}) {
  const scrollRef = { current: document.createElement('div') };
  document.body.appendChild(scrollRef.current);
  const utils = render(
    <AutoScrollContext.Provider value={cfg}>
      <AutoScrollControl scrollRef={scrollRef} pager={PAGER} placeKey="psalms-23" {...props} />
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
    mount(makeCfg({ speedLpm: 22 }));
    expect(screen.getByRole('status').textContent).toBe('22 lines/min');
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

describe('accessibility', () => {
  it('every control carries a name, and the toggle reports its state', () => {
    mount(makeCfg());
    const toggle = screen.getByLabelText('Start auto-scroll');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByLabelText('Faster')).toBeTruthy();
    expect(screen.getByLabelText('Slower')).toBeTruthy();
    // Speed changes are announced politely rather than on every frame.
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
  });
});
