/* The v2 shell (mw4): the ?gate=<id> boot (state with no taps, <html data-gate>, the reader's storage untouched), Back
   (top bar and Android's), the three tabs, the laptop rail, and the root that loads the stores on a real boot. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { V2App, V2Root, routeTitle } from './App.jsx';
import { GATE_STATES } from './gate.js';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });

const LETTERS = [
  { num: 1, title: 'Chosen by God', date: '8/31/04', from: 'From The Lord, Our God and Savior',
    blocks: [{ type: 'para', segments: [{ t: 'bold-italic', v: 'Thus says The Lord to His servant:' }, { t: 'text', v: 'Many things.' }] }] },
  { num: 2, title: 'Honor Not the Day of the Dead... Honor God', blocks: [] },
];

beforeEach(() => {
  g.COL_BY_KEY = new Map([['one', { volKey: 'one', label: 'Volume One', globalName: 'LETTERS_V1' }]]);
  g.LETTERS_V1 = LETTERS;
});
afterEach(() => {
  cleanup();
  delete g.COL_BY_KEY; delete g.LETTERS_V1; delete g.__loadVotCorpus; delete g.HydrationGate; delete g.matchMedia;
  delete html.dataset.gate;
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('a gate boot', () => {
  it('4a-settings: Settings from Home, the six rows, Home lit, then data-gate=ready', async () => {
    const { container } = render(<V2App gateId="4a-settings" />);
    expect(container.querySelector('.tb .title').textContent).toBe('Home');
    expect(container.querySelector('.tb button').getAttribute('aria-label')).toBe('Back to Home');
    expect(container.querySelectorAll('.srow').length).toBe(6);
    expect(container.querySelector('.srow .s').textContent).toBe('Standard size · Slate · comfortable lines');
    expect(container.querySelector('.tab[aria-current="page"]').textContent).toBe('Home');
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
  });

  it('1a-letter: the letter under Volume One, the next letter at the end', async () => {
    const { container } = render(<V2App gateId="1a-letter" />);
    expect(container.querySelector('.tb .title').textContent).toBe('Volume One');
    expect(container.querySelector('.overline').textContent).toBe('Volume One · Letter 1');
    expect(container.querySelector('h1').textContent).toBe('Chosen by God');
    expect(container.querySelector('h1').className).toBe('display');
    expect(container.querySelector('.meta').textContent).toBe('8/31/04From The Lord, Our God and Savior');
    expect(container.querySelector('.nextcard .k').textContent).toBe('Next · Letter 2');
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
  });

  it('waits for a lazy volume before it says ready', async () => {
    delete g.LETTERS_V1;
    let finish;
    g.__loadVotCorpus = vi.fn(() => new Promise((res) => { finish = () => { g.LETTERS_V1 = LETTERS; res(undefined); }; }));
    const { container } = render(<V2App gateId="1a-letter" />);
    await waitFor(() => expect(html.dataset.gate).toBe('waiting'));
    expect(container.querySelector('h1')).toBe(null);
    await act(async () => { finish(); });
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(container.querySelector('h1').textContent).toBe('Chosen by God');
  });

  it('an id this build does not know says so by name', async () => {
    render(<V2App gateId="9z-nothing" />);
    await waitFor(() => expect(html.dataset.gate).toBe('unknown'));
  });

  it("leaves the reader's storage byte-identical for every gate id", async () => {
    localStorage.setItem('vot-state', JSON.stringify({ theme: 'light', settings: { fontScale: 1.2 } }));
    localStorage.setItem('vot-other', 'x');
    const before = JSON.stringify(Object.entries({ ...localStorage }).sort());
    const writes = [vi.spyOn(Storage.prototype, 'setItem'), vi.spyOn(Storage.prototype, 'removeItem'), vi.spyOn(Storage.prototype, 'clear')];
    const idbOpen = g.indexedDB ? vi.spyOn(g.indexedDB, 'open') : null;
    // main's stores loaded and writable: a gate boot still records no reading (reading-record.js) and holds no bridge
    g.StateStore = { isReady: () => true, get: () => ({}), set: vi.fn() };
    g.HistoryStore = { isReady: () => true, list: () => [], add: vi.fn() };
    const bridges = [g.__onReadingComplete, g.__votAudioListened];
    for (const id of Object.keys(GATE_STATES)) {
      delete html.dataset.gate;
      render(<V2App gateId={id} />);
      await waitFor(() => expect(html.dataset.gate).toBe('ready'));
      expect([id, g.__onReadingComplete, g.__votAudioListened]).toEqual([id, ...bridges]);
      cleanup();
    }
    writes.forEach((w) => expect(w).not.toHaveBeenCalled());
    if (idbOpen) expect(idbOpen).not.toHaveBeenCalled();
    expect(g.StateStore.set).not.toHaveBeenCalled();
    expect(g.HistoryStore.add).not.toHaveBeenCalled();
    delete g.StateStore;
    delete g.HistoryStore;
    expect(JSON.stringify(Object.entries({ ...localStorage }).sort())).toBe(before);
  });
});

describe('navigation', () => {
  it('Back in the top bar and Android Back pop the stack; at a root Android may leave', async () => {
    const { container } = render(<V2App gateId="1a-letter" />);
    click(container.querySelector('.tb button'));
    expect(container.querySelector('.tb .title').textContent).toBe('Home');
    let r;
    act(() => { r = g.handleAndroidBack(); });
    expect(r).toBe('true');
    expect(container.querySelector('.tb .appname').textContent).toBe('VOTReader');
    act(() => { r = g.handleAndroidBack(); });
    expect(r).toBe('false');
  });

  it('the next-letter card replaces the letter (Back still says Volume One)', () => {
    const { container } = render(<V2App gateId="1a-letter" />);
    click(container.querySelector('.nextcard'));
    expect(container.querySelector('h1').textContent).toBe('Honor Not the Day of the Dead... Honor God');
    expect(container.querySelector('h1').className).toBe('display long');
    expect(container.querySelector('.tb .title').textContent).toBe('Volume One');
  });

  it('a tab opens its own root and lights', () => {
    const { container } = render(<V2App gateId="4a-settings" />);
    const tabs = [...container.querySelectorAll('.tabbar .tab')];
    expect(tabs.map((t) => t.textContent)).toEqual(['Home', 'Search', 'Notes']);
    click(tabs[2]);
    expect(container.querySelector('.tab[aria-current="page"]').textContent).toBe('Notes');
    expect(container.querySelector('.tb .appname')).not.toBe(null);
  });

  it('routeTitle names each place', () => {
    expect(routeTitle({ place: 'collection', collection: 'one' })).toBe('Volume One');
    expect(routeTitle({ place: 'letter', collection: 'one', n: 2 })).toBe('Honor Not the Day of the Dead... Honor God');
    expect(routeTitle({ place: 'settings' })).toBe('Settings');
  });
});

describe('layout and root', () => {
  it('a window 1024 px or wider gets the laptop rail and one column', () => {
    g.matchMedia = vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    const { container } = render(<V2App gateId="4a-settings" />);
    expect(container.querySelector('.v2.dk nav.rail')).not.toBe(null);
    expect(container.querySelector('.tabbar')).toBe(null);
    expect(container.querySelectorAll('.srow')[3].querySelector('.s').textContent).toBe('1 recording on this computer · 48 MB');
  });

  it('a real boot waits for HydrationGate; a gate boot never mounts it', () => {
    g.HydrationGate = ({ children }) => <div data-testid="hg">{children}</div>;
    const real = render(<V2Root gateId={null} />);
    expect(real.container.querySelector('[data-testid="hg"] .v2')).not.toBe(null);
    cleanup();
    const gated = render(<V2Root gateId="4a-settings" />);
    expect(gated.container.querySelector('[data-testid="hg"]')).toBe(null);
    expect(gated.container.querySelector('.v2')).not.toBe(null);
  });
});
