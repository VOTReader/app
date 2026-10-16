// @ts-nocheck — main's Garden helpers and stores, installed by hand as bundle-d / bundle-b publish them.
/* v2's Return to the Garden (zones v2p7; design dz14 pictures 9d-garden-notice, 9e-garden-page), over main's own
   utils/garden.js (tiers, URLs, image cache, preload): the first-visit notice from Home (its words, the tier it writes,
   the flag it sets, Go back), Home's row by that flag, the page (number, arrows and their ends, swipe, pinch latch,
   double-tap zoom, wheel, jump, the laptop's keys, the remembered page and main's heal, immersive mode, a failed page's
   Try again, preload and crawl) and the two pinned gate pictures, which fetch, write and remember nothing. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { V2App } from './App.jsx';
import { defineStart } from './places.js';
import { GATE_STATES } from './gate.js';
import { GardenScreen } from './screens/GardenScreens.jsx';
import { swipeDir, noticeLede, aboutSize, savedTier, rememberedPage, clampPage, tierOf } from './garden-facts.js';
import * as Garden from '../utils/garden.js';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const settle = (ms = 30) => act(() => new Promise((r) => { setTimeout(r, ms); }));
const texts = (root, sel) => [...root.querySelectorAll(sel)].map((n) => n.textContent);
const button = (root, name) => [...root.querySelectorAll('button')].find((b) => b.textContent === name || b.getAttribute('aria-label') === name) || null;
const GLOBALS = ['ReactDOM', 'StateStore', 'GardenPosStore', 'GardenWarningFlagStore', 'PlatformBridge', 'matchMedia', ...Object.keys(Garden)];

/** A touch event at points [[x, y], ...] (jsdom has no Touch constructor). */
function touch(el, type, touches, changed = touches) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  const pts = (list) => list.map(([x, y]) => ({ clientX: x, clientY: y }));
  Object.defineProperty(e, 'touches', { value: pts(touches) });
  Object.defineProperty(e, 'changedTouches', { value: pts(changed) });
  act(() => { el.dispatchEvent(e); });
  return e;
}

let store;
let pos;
let flag;
let bridge;
/** main's globals: utils/garden.js (bundle-d), the stores (bundle-b), the bridge. */
function install({ settings = {}, seen = false, page = null, posState = 'loaded', android = false } = {}) {
  g.ReactDOM = ReactDOM;
  Object.assign(g, Garden);
  store = { st: { settings }, isReady: () => true, get: () => store.st, set: vi.fn((s) => { store.st = s; }) };
  g.StateStore = store;
  const subs = new Set();
  pos = {
    state: posState, page, getState: () => pos.state, get: () => pos.page, set: vi.fn((n) => { pos.page = n; }),
    subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); },
    land: (n) => act(() => { pos.state = 'loaded'; pos.page = n; subs.forEach((cb) => cb()); }),
  };
  g.GardenPosStore = pos;
  flag = { v: seen, is: () => flag.v, set: vi.fn(() => { flag.v = true; }) };
  g.GardenWarningFlagStore = flag;
  bridge = { isAndroid: android, setImmersiveMode: vi.fn() };
  g.PlatformBridge = bridge;
}
function laptop() {
  g.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
}

/** @type {Array<() => void>} */
const undo = [];
beforeEach(() => { install(); });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  for (const k of GLOBALS) delete g[k];
  while (undo.length) undo.pop()();
  delete html.dataset.gate;
  vi.restoreAllMocks();
});

/** The Garden page alone, as the shell hands it a route. */
function page(route = { place: 'garden' }, props = {}) {
  const pop = vi.fn();
  const onReady = vi.fn();
  const r = render(<GardenScreen route={route} gate={null} facts={{}} desktop={false} device="phone" pop={pop} onReady={onReady}
    go={vi.fn()} replace={vi.fn()} openTab={vi.fn()} {...props} />);
  return { ...r, pop, onReady, n: () => r.container.querySelector('.gv-n').textContent, img: () => r.container.querySelector('.gv-img') };
}

describe('garden-facts (main\'s helpers and words)', () => {
  it('main\'s swipe: over 60 px sideways and under 45 px up or down; left is next', () => {
    expect([swipeDir(-61, 0), swipeDir(61, 44), swipeDir(-60, 0), swipeDir(-100, 45), swipeDir(-100, -44)]).toEqual([1, -1, 0, 0, 1]);
  });

  it('the notice\'s words follow the picked tier and the window', () => {
    expect(aboutSize('~180 MB')).toBe('about 180 MB');
    expect(noticeLede(tierOf('standard'), 'phone')).toBe('209 high-resolution photographs, about 180 MB at the quality you pick. '
      + 'Pages stream from the internet as you read and are kept on this phone. Connect to Wi-Fi first: mobile data charges may apply, '
      + 'and leave room for them all.');
    expect(noticeLede(tierOf('ultra'), 'computer')).toContain('about 680 MB at the quality you pick. Pages stream from the internet as you read and are kept on this computer.');
  });

  it('the tier is main\'s setting (default Standard; an unknown id is main\'s default record); pages clamp to 1..209', () => {
    expect(savedTier()).toBe('standard');
    install({ settings: { gardenTier: 'native' } });
    expect(savedTier()).toBe('native');
    expect(tierOf('nope').id).toBe('standard');
    expect([clampPage(0), clampPage(1.7), clampPage(400), clampPage('x')]).toEqual([1, 1, 209, 1]);
  });

  it('the remembered page counts only once main\'s store has loaded, and only in range', () => {
    install({ page: 57 });
    expect(rememberedPage()).toBe(57);
    install({ page: 57, posState: 'loading' });
    expect(rememberedPage()).toBe(null);
    install({ page: 999 });
    expect(rememberedPage()).toBe(null);
  });
});

describe('9d: the notice, from Home', () => {
  it('first visit: Home\'s row opens the notice (not the Garden); a pick writes main\'s gardenTier; Go back leaves the flag', async () => {
    undo.push(defineStart(() => [{ place: 'home' }]));
    const { container } = render(<V2App gateId={null} />);
    await settle();
    await click(button(container, 'Return to the GardenThe Garden pages, full screen'));
    const sheet = document.querySelector('.sheet.gdn');
    expect(sheet).toBeTruthy();
    expect(container.querySelector('.gv')).toBe(null);
    expect(sheet.querySelector('.overline').textContent).toBe('A Return to The Garden');
    expect(sheet.querySelector('.sh').textContent).toBe('Before you begin');
    expect(texts(sheet, '.gdn-l span')).toEqual(['Image quality', 'You can change this anytime in Settings.']);
    expect(texts(sheet, '.srow.opt.gt .t')).toEqual(['Mobile~110 MB', 'Standard~180 MB', 'Native~320 MB', 'Ultra~680 MB']);
    expect(texts(sheet, '.srow.opt.gt .s')[1]).toBe('2880px · Balanced default — great at 1× and 1.5× zoom');
    expect(texts(sheet, '.srow.on .t')).toEqual(['Standard~180 MB']);
    expect(sheet.querySelectorAll('.ck').length).toBe(1);
    await click(sheet.querySelector('.srow.opt.gt'));
    expect(store.st.settings.gardenTier).toBe('mobile');
    expect(store.st.settings.touched.gardenTier).toBe(true);
    expect(texts(sheet, '.srow.on .t')).toEqual(['Mobile~110 MB']);
    expect(sheet.querySelector('.gdn-p').textContent).toContain('about 110 MB at the quality you pick');
    await click(button(sheet, 'Go back'));
    expect(document.querySelector('.sheet.gdn')).toBe(null);
    expect(flag.set).not.toHaveBeenCalled();
    expect(container.querySelector('.gv')).toBe(null);
    // again: the notice starts on the tier now saved
    await click(button(container, 'Return to the GardenThe Garden pages, full screen'));
    expect(texts(document, '.sheet.gdn .srow.on .t')).toEqual(['Mobile~110 MB']);
  });

  it('Open the Garden sets main\'s flag and opens the page where the reader left off; from then on the row goes straight there', async () => {
    install({ page: 57, settings: { gardenTier: 'mobile' } });
    undo.push(defineStart(() => [{ place: 'home' }]));
    const { container } = render(<V2App gateId={null} />);
    await settle();
    await click(button(container, 'Return to the GardenThe Garden pages, full screen'));
    await click(button(document.querySelector('.sheet.gdn'), 'Open the Garden'));
    expect(flag.set).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.sheet.gdn')).toBe(null);
    expect(container.querySelector('.gv-n').textContent).toBe('57 / 209');
    expect(container.querySelector('.gv-img').getAttribute('src')).toBe(Garden.gardenUrl(57, 'mobile'));
    // bare: no top bar, mini player or tabs over the photograph
    expect(container.querySelector('.tb, .tabbar, .mini')).toBe(null);
    await click(button(container, 'Back'));
    expect(container.querySelector('.gv')).toBe(null);
    await click(button(container, 'Return to the GardenThe Garden pages, full screen'));
    expect(document.querySelector('.sheet.gdn')).toBe(null);
    expect(container.querySelector('.gv-n').textContent).toBe('57 / 209');
  });

  it('the laptop: the notice is the kit\'s dialog and says this computer; the Garden\'s root takes .gvd, Home\'s does not', async () => {
    laptop();
    undo.push(defineStart(() => [{ place: 'home' }]));
    const { container } = render(<V2App gateId={null} />);
    await settle();
    expect(container.firstChild.className).toBe('v2 dk');
    await click(button(container, 'Return to the GardenThe Garden pages, full screen'));
    const dlg = document.querySelector('.dlg.gdn');
    expect(dlg).toBeTruthy();
    expect(dlg.querySelector('.gdn-p').textContent).toContain('kept on this computer.');
    await click(button(dlg, 'Open the Garden'));
    expect(container.firstChild.className).toBe('v2 dk bare gvd');
    expect(container.querySelector('.gv').dataset.zone).toBe('garden');
  });

  it('gate 9d: Home 500 px down with the notice open, Standard picked; a gate boot writes and sets nothing', async () => {
    const s = GATE_STATES['9d-garden-notice'];
    expect([s.stack, s.scroll, s.open, s.playing.paused]).toEqual([[{ place: 'home' }], 500, { sheet: 'garden-notice' }, true]);
    const { container } = render(<V2App gateId="9d-garden-notice" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(container.querySelector('.content').scrollTop).toBe(500);
    const sheet = document.querySelector('.sheet.gdn');
    expect(texts(sheet, '.srow.on .t')).toEqual(['Standard~180 MB']);
    expect(sheet.querySelector('.gdn-p').textContent).toBe(noticeLede(tierOf('standard'), 'phone'));
    await click(sheet.querySelectorAll('.srow.opt.gt')[3]);
    expect(sheet.querySelector('.gdn-p').textContent).toContain('about 680 MB');
    expect(store.set).not.toHaveBeenCalled();
    await click(button(sheet, 'Open the Garden'));
    expect(flag.set).not.toHaveBeenCalled();
  });
});

describe('9e: a Garden page', () => {
  it('the number, the photograph at main\'s address, the arrows and their ends; a change is remembered, the opening page is not', async () => {
    const p = page({ place: 'garden', page: 2 });
    expect(p.n()).toBe('2 / 209');
    expect(p.img().getAttribute('src')).toBe(Garden.gardenUrl(2, 'standard'));
    expect(p.img().getAttribute('alt')).toBe('Garden page 2');
    expect(pos.set).not.toHaveBeenCalled();
    await click(button(p.container, 'Previous page'));
    expect(p.n()).toBe('1 / 209');
    expect(button(p.container, 'Previous page').disabled).toBe(true);
    await click(button(p.container, 'Previous page'));
    expect(p.n()).toBe('1 / 209');
    expect(pos.set.mock.calls).toEqual([[1]]);
    cleanup();
    const end = page({ place: 'garden', page: 209 });
    expect(button(end.container, 'Next page').disabled).toBe(true);
    await click(button(end.container, 'Back'));
    expect(end.pop).toHaveBeenCalledTimes(1);
  });

  it('opens at the remembered page; a route\'s page wins; main\'s heal moves page 1 once the store lands', async () => {
    install({ page: 88 });
    expect(page().n()).toBe('88 / 209');
    cleanup();
    expect(page({ place: 'garden', page: 3 }).n()).toBe('3 / 209');
    cleanup();
    install({ posState: 'loading' });
    const p = page();
    expect(p.n()).toBe('1 / 209');
    await pos.land(120);
    expect(p.n()).toBe('120 / 209');
  });

  it('a sideways swipe turns the page; a vertical drag, a short one and a pinch lifted finger by finger do not', () => {
    const p = page({ place: 'garden', page: 10 });
    const area = p.container.querySelector('.gv-area');
    const swipe = (from, to) => { touch(area, 'touchstart', [from]); touch(area, 'touchend', [], [to]); };
    swipe([300, 400], [200, 410]);
    expect(p.n()).toBe('11 / 209');
    swipe([100, 400], [200, 400]);
    expect(p.n()).toBe('10 / 209');
    swipe([300, 400], [200, 470]);
    swipe([300, 400], [250, 400]);
    expect(p.n()).toBe('10 / 209');
    // two fingers down, then lifted one at a time far from where the first landed: never a swipe
    touch(area, 'touchstart', [[100, 400], [200, 400]]);
    touch(area, 'touchend', [[200, 400]], [[100, 400]]);
    touch(area, 'touchend', [], [[50, 400]]);
    expect(p.n()).toBe('10 / 209');
  });

  it('double-tap zooms 2.5x where tapped (keeping the centring) and back; a page turn starts unzoomed', () => {
    const p = page({ place: 'garden', page: 10 });
    const area = p.container.querySelector('.gv-area');
    const tap = () => { touch(area, 'touchstart', [[0, 0]]); touch(area, 'touchend', [], [[0, 0]]); };
    tap(); tap();
    expect(p.img().style.transform).toMatch(/^translate\(-50%, -50%\) translate\(.*\) scale\(2\.5\)$/);
    tap(); tap();
    expect(p.img().style.transform).toBe('');
    tap(); tap();
    // zoomed, a drag pans instead of turning the page
    touch(area, 'touchstart', [[300, 400]]);
    touch(area, 'touchend', [], [[100, 400]]);
    expect(p.n()).toBe('10 / 209');
    act(() => { button(p.container, 'Next page').click(); });
    expect(p.n()).toBe('11 / 209');
    expect(p.img().style.transform).toBe('');
  });

  it('the wheel zooms in and back out to 1', () => {
    const p = page({ place: 'garden', page: 10 });
    const area = p.container.querySelector('.gv-area');
    const wheel = (deltaY) => act(() => { area.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true })); });
    wheel(-100);
    expect(p.img().style.transform).toContain('scale(1.15)');
    wheel(100);
    expect(p.img().style.transform).toBe('');
  });

  it('the number opens main\'s jump: a page in range goes there, out of range stays; blur closes it', async () => {
    const p = page({ place: 'garden', page: 10 });
    await click(button(p.container, 'Jump to a page'));
    const input = p.container.querySelector('input[aria-label="Jump to page"]');
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute('placeholder')).toBe('1–209');
    const submit = (v) => act(() => {
      const el = p.container.querySelector('input[aria-label="Jump to page"]');
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    submit('120');
    expect(p.n()).toBe('120 / 209');
    await click(button(p.container, 'Jump to a page'));
    submit('0');
    expect(p.n()).toBe('120 / 209');
    await click(button(p.container, 'Jump to a page'));
    submit('210');
    expect(p.n()).toBe('120 / 209');
    await click(button(p.container, 'Jump to a page'));
    act(() => { p.container.querySelector('input').blur(); });
    expect(p.container.querySelector('input')).toBe(null);
  });

  it('Left and Right turn the page (not while typing a page number)', async () => {
    const p = page({ place: 'garden', page: 10 });
    const key = (k, target = document) => act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
    key('ArrowRight');
    key('ArrowRight');
    key('ArrowLeft');
    expect(p.n()).toBe('11 / 209');
    await click(button(p.container, 'Jump to a page'));
    key('ArrowRight', p.container.querySelector('input'));
    expect(p.container.querySelector('input')).toBeTruthy();
    act(() => { p.container.querySelector('input').blur(); });
    expect(p.n()).toBe('11 / 209');
  });

  it('Android goes immersive while the page is open (main\'s bridge), and back when it closes', () => {
    const p = page();
    expect(bridge.setImmersiveMode.mock.calls).toEqual([[true]]);
    p.unmount();
    expect(bridge.setImmersiveMode.mock.calls).toEqual([[true], [false]]);
  });

  it('a failed page says so with Try again, which drops main\'s cached entry and asks again', () => {
    const p = page({ place: 'garden', page: 10 });
    const first = p.img();
    act(() => { first.dispatchEvent(new Event('error')); });
    expect(texts(p.container, '.gv-msg span')).toEqual(['Failed to load — check your connection']);
    expect(p.img().className).toContain('loading');
    const key = Garden.gardenCacheKey(10, 'standard');
    expect(Garden.gardenImageCache[key]).toBeTruthy();
    act(() => { button(p.container, 'Try again').click(); });
    expect(Garden.gardenImageCache[key]).toBeUndefined();
    expect(p.img()).not.toBe(first);
  });

  it('a real boot preloads the page and main\'s look-ahead, then crawls from page 1 after 1.5 s, 0.5 s a page', () => {
    vi.useFakeTimers();
    install({ settings: { gardenTier: 'ultra' } });
    g.gardenPreload = vi.fn();
    g.gardenCrawled = new Set();
    page({ place: 'garden', page: 100 });
    // Ultra looks 2 ahead (main's gardenTierLimits)
    expect(g.gardenPreload.mock.calls).toEqual([[100, 'ultra'], [101, 'ultra'], [102, 'ultra']]);
    g.gardenPreload.mockClear();
    act(() => { vi.advanceTimersByTime(1499); });
    expect(g.gardenPreload).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(g.gardenPreload.mock.calls).toEqual([[1, 'ultra']]);
    act(() => { vi.advanceTimersByTime(500); });
    expect(g.gardenPreload.mock.calls).toEqual([[1, 'ultra'], [2, 'ultra']]);
  });
});

describe('gate 9e', () => {
  it('page 40 at Standard, full screen; it fetches, crawls, remembers and turns immersive on nothing (web)', async () => {
    expect(GATE_STATES['9e-garden-page'].stack).toEqual([{ place: 'home' }, { place: 'garden', page: 40 }]);
    g.gardenPreload = vi.fn();
    const { container } = render(<V2App gateId="9e-garden-page" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(container.querySelector('.gv-n').textContent).toBe('40 / 209');
    expect(container.querySelector('.gv-img').getAttribute('src')).toBe(Garden.gardenUrl(40, 'standard'));
    expect(container.querySelector('.gv-img').className).toBe('gv-img still');
    expect(container.querySelector('.gv').parentElement.className).toBe('content garden');
    expect(container.querySelector('.tb, .tabbar, .mini')).toBe(null);
    await click(button(container, 'Next page'));
    expect(container.querySelector('.gv-n').textContent).toBe('41 / 209');
    expect(pos.set).not.toHaveBeenCalled();
    expect(g.gardenPreload).not.toHaveBeenCalled();
    expect(bridge.setImmersiveMode).not.toHaveBeenCalled();
  });

  it('on the phone app, a gate boot goes immersive as the picture is drawn (no system bars)', async () => {
    install({ android: true });
    render(<V2App gateId="9e-garden-page" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(bridge.setImmersiveMode.mock.calls).toEqual([[true]]);
  });
});
