/* The welcome and Show me around (zv1, group 10, picture 8a-welcome): the gate draws the picture alone in the window; a
   real boot opens on the welcome only on a first visit (main's AboutSeenFlagStore unset, nothing being read); Begin
   reading and Show me around keep main's flag and go Home; the tour rings each tab, then Home's gear, and its end keeps
   main's TourDoneFlagStore. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { V2App } from './App.jsx';
import { firstVisit } from './first-run-facts.js';
import { startTour, endTour, clampBox } from './screens/WelcomeScreen.jsx';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const button = (root, name) => [...root.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === name);

/** A flag store of main's shape. */
const flagStore = (on = false) => ({ on, is() { return this.on; }, set: vi.fn(function set() { this.on = true; }) });

describe('the 8a gate', () => {
  afterEach(() => { cleanup(); delete html.dataset.gate; });

  it('draws the picture alone: the mark, the title, Begin reading and Show me around, no bars', async () => {
    const { container } = render(<V2App gateId="8a-welcome" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    const page = container.querySelector('.content.welcome');
    expect(page).not.toBe(null);
    expect(container.querySelector('.v2-phone').className).toContain('bare');
    expect(container.querySelector('.tb')).toBe(null);
    expect(container.querySelector('.tabbar')).toBe(null);
    expect(page.querySelector('img.appicon').getAttribute('src')).toBe('icons/icon-512.png');
    expect(page.querySelector('.overline').textContent).toBe('VOTReader');
    expect(page.querySelector('h1').textContent).toBe('The Volumes of Truth');
    expect([...page.querySelectorAll('.stack.wel button')].map((b) => b.textContent)).toEqual(['Begin reading', 'Show me around']);
    expect(page.querySelector('.fine').textContent).toMatch(/what you mark stays on this phone\.$/);
  });

  it('every control is inert on a gate boot', async () => {
    const about = flagStore();
    g.AboutSeenFlagStore = about;
    try {
      const { container } = render(<V2App gateId="8a-welcome" />);
      click(button(container, 'Begin reading'));
      click(button(container, 'Show me around'));
      expect(container.querySelector('.content.welcome')).not.toBe(null);
      expect(about.set).not.toHaveBeenCalled();
      expect(document.querySelector('.tour')).toBe(null);
    } finally { delete g.AboutSeenFlagStore; }
  });
});

describe('firstVisit', () => {
  it('is main rule: the About flag unset and nothing being read', () => {
    expect(firstVisit({})).toBe(false); // before bundle-b: never
    expect(firstVisit({ AboutSeenFlagStore: flagStore(true) })).toBe(false);
    expect(firstVisit({ AboutSeenFlagStore: flagStore(false) })).toBe(true);
    const reading = { isReady: () => true, get: () => ({ activeReadKey: 'volume-one' }) };
    expect(firstVisit({ AboutSeenFlagStore: flagStore(false), StateStore: reading })).toBe(false);
    const fresh = { isReady: () => true, get: () => ({ settings: {} }) };
    expect(firstVisit({ AboutSeenFlagStore: flagStore(false), StateStore: fresh })).toBe(true);
    const broken = { isReady: () => true, get: () => { throw new Error('no state'); } };
    expect(firstVisit({ AboutSeenFlagStore: flagStore(false), StateStore: broken })).toBe(true);
  });
});

describe('clampBox', () => {
  it('keeps the ring 2 px inside the window: the first tab at the left edge, the gear in the corner', () => {
    expect(clampBox(-6, 711, 132, 75, 360, 780)).toEqual({ left: 2, top: 711, width: 124, height: 67 });
    expect(clampBox(306, -2, 60, 60, 360, 780)).toEqual({ left: 306, top: 2, width: 52, height: 56 });
    expect(clampBox(100, 100, 40, 40, 360, 780)).toEqual({ left: 100, top: 100, width: 40, height: 40 });
    expect(clampBox(-6, -6, 10, 10, 0, 0)).toEqual({ left: -6, top: -6, width: 10, height: 10 });
  });
});

describe('a real boot', () => {
  /** @type {ReturnType<typeof flagStore>} */ let about;
  /** @type {ReturnType<typeof flagStore>} */ let toured;

  beforeEach(() => {
    about = flagStore();
    toured = flagStore();
    g.AboutSeenFlagStore = about;
    g.TourDoneFlagStore = toured;
    g.StateStore = { isReady: () => true, get: () => ({ settings: {} }), set: () => {} };
  });
  afterEach(() => {
    act(() => endTour());
    cleanup();
    for (const k of ['AboutSeenFlagStore', 'TourDoneFlagStore', 'StateStore']) delete g[k];
  });

  it('a first visit opens on the welcome; Begin reading keeps main flag and goes Home', () => {
    const { container } = render(<V2App gateId={null} />);
    expect(container.querySelector('.content.welcome')).not.toBe(null);
    click(button(container, 'Begin reading'));
    expect(about.set).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.content.welcome')).toBe(null);
    expect(container.querySelector('.tabbar .tab.on').textContent).toBe('Home');
    expect(document.querySelector('.tour')).toBe(null);
  });

  it('a reader who has been here before opens on Home', () => {
    about.on = true;
    const { container } = render(<V2App gateId={null} />);
    expect(container.querySelector('.content.welcome')).toBe(null);
    expect(container.querySelector('.tabbar .tab.on').textContent).toBe('Home');
  });

  it('Show me around goes Home and rings each tab, then the gear; Done keeps main tour flag', async () => {
    const { container } = render(<V2App gateId={null} />);
    click(button(container, 'Show me around'));
    expect(about.set).toHaveBeenCalledTimes(1);
    const tabs = [...container.querySelectorAll('.tabbar .tab')];
    const card = () => document.querySelector('.tour .tour-card');
    await waitFor(() => expect(card()).not.toBe(null));
    expect(document.querySelector('.tour').getAttribute('role')).toBe('dialog');
    const seen = [];
    for (let i = 0; i < 4; i++) {
      await waitFor(() => expect(card().querySelector('.overline').textContent).toBe('Show me around · ' + (i + 1) + ' of 4'));
      seen.push(card().querySelector('.t').textContent);
      click(button(card(), i < 3 ? 'Next' : 'Done'));
    }
    expect(seen).toEqual(['Home', 'Search', 'Notes', 'Settings']);
    expect(tabs[0].textContent).toBe('Home');
    expect(document.querySelector('.tour')).toBe(null);
    expect(toured.set).toHaveBeenCalledTimes(1);
  });

  it('Leave and Escape end the tour where it stands', async () => {
    about.on = true;
    render(<V2App gateId={null} />);
    act(() => startTour());
    await waitFor(() => expect(document.querySelector('.tour-card')).not.toBe(null));
    click(button(document.querySelector('.tour-card'), 'Leave'));
    expect(document.querySelector('.tour')).toBe(null);
    expect(toured.set).toHaveBeenCalledTimes(1);

    act(() => startTour());
    await waitFor(() => expect(document.querySelector('.tour-card')).not.toBe(null));
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(document.querySelector('.tour')).toBe(null);
  });

  it('a stop whose control is not on the page is passed over', async () => {
    about.on = true;
    const { container } = render(<V2App gateId={null} />);
    // Notes, a root: its top bar has no gear, so the last stop gives way and the tour ends after Notes
    click([...container.querySelectorAll('.tabbar .tab')][2]);
    act(() => startTour());
    for (let i = 0; i < 3; i++) {
      await waitFor(() => expect(document.querySelector('.tour-card .overline').textContent).toBe('Show me around · ' + (i + 1) + ' of 4'));
      click(button(document.querySelector('.tour-card'), 'Next'));
    }
    await waitFor(() => expect(document.querySelector('.tour')).toBe(null));
    expect(toured.set).toHaveBeenCalled();
  });
});
