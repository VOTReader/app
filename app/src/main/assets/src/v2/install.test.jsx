/* The install offer (zv1, group 10, picture 8b-install): the gate draws the picture over Volume One; offerNow is main's
   rules plus the picture's (the second visit, once a session, after the reader has moved off the first page, never over
   reading); a real boot in a browser opens it a moment after a move, and Install / Maybe later / Don't ask again /
   Show me how keep main's per-browser state. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { V2App } from './App.jsx';
import { offerNow, readOffer, _resetVisit } from './first-run-facts.js';
import { _resetOfferSession } from './screens/InstallOffer.jsx';
import { _resetInstallCapture } from '../utils/install-offer.js';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const button = (root, name) => [...root.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === name);
const offer = () => document.querySelector('[role="dialog"].inst');
const KEY = 'vot-install-offer';
const NOW = Date.UTC(2026, 9, 15, 12);

describe('the 8b gate', () => {
  afterEach(() => { cleanup(); delete html.dataset.gate; localStorage.removeItem(KEY); });

  it('draws the picture: Volume One under the offer, the browser own Install, Maybe later and Don’t ask again', async () => {
    const { container } = render(<V2App gateId="8b-install" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(container.querySelector('.tb .title').textContent).toBe('Home');
    const sheet = offer();
    expect(sheet.className).toBe('sheet inst');
    expect(sheet.getAttribute('aria-label')).toBe('Keep VOTReader on your home screen');
    expect(sheet.querySelector('.inst-h img.appicon.sm').getAttribute('src')).toBe('icons/icon-512.png');
    expect(sheet.querySelector('.inst-h .sh').textContent).toBe('Keep VOTReader on your home screen');
    expect(sheet.querySelector('.inst-p').textContent).toBe('Open it like an app, with one tap. Your reading and notes stay on this phone.');
    expect(sheet.querySelector('.pill.block').textContent).toBe('Install VOTReader');
    expect([...sheet.querySelectorAll('.inst-a .textbtn')].map((b) => [b.className, b.textContent]))
      .toEqual([['textbtn', 'Maybe later'], ['textbtn quiet', 'Don’t ask again']]);
  });

  it('every control is inert on a gate boot and nothing is written', () => {
    render(<V2App gateId="8b-install" />);
    click(button(offer(), 'Maybe later'));
    click(button(offer(), 'Don’t ask again'));
    click(button(offer(), 'Install VOTReader'));
    expect(offer()).not.toBe(null);
    expect(localStorage.getItem(KEY)).toBe(null);
  });
});

describe('offerNow', () => {
  const yes = { flow: 'android-chrome', visit: 2, state: {}, place: 'collection', moved: true, shown: false, now: NOW };

  it('the second visit on, after a move, over a page that is not reading', () => {
    expect(offerNow(yes)).toBe(true);
    expect(offerNow({ ...yes, visit: 1 })).toBe(false);
    expect(offerNow({ ...yes, moved: false })).toBe(false);
    for (const place of ['letter', 'bible-chapter', 'note', 'journal-entry', 'welcome']) expect(offerNow({ ...yes, place })).toBe(false);
  });

  it('never over the Garden: a full-screen photograph (a real boot put it over page 2)', () => {
    expect(offerNow({ ...yes, place: 'garden' })).toBe(false);
  });

  it('main rules: a browser that installs, once a session, snoozed, never, three dismissals', () => {
    expect(offerNow({ ...yes, flow: null })).toBe(false);
    expect(offerNow({ ...yes, shown: true })).toBe(false);
    expect(offerNow({ ...yes, state: { snoozeUntil: NOW + 1 } })).toBe(false);
    expect(offerNow({ ...yes, state: { snoozeUntil: NOW - 1 } })).toBe(true);
    expect(offerNow({ ...yes, state: { never: true } })).toBe(false);
    expect(offerNow({ ...yes, state: { dismissals: 3 } })).toBe(false);
  });
});

describe('a real boot in a browser', () => {
  /** @type {{ prompt: any, userChoice: Promise<any> } | null} */ let ev;

  /** this browser handed over its install event; the user will answer `outcome` */
  const handOver = (outcome) => {
    ev = { prompt: vi.fn(() => Promise.resolve()), userChoice: Promise.resolve({ outcome }) };
    g.__votInstallSlot.deferred = ev;
  };
  const settle = () => act(() => { vi.advanceTimersByTime(1600); });
  const moveTo = (container, label) => click([...container.querySelectorAll('.tabbar .tab')].find((t) => t.textContent === label));

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    _resetInstallCapture();
    _resetVisit();
    _resetOfferSession();
    localStorage.setItem(KEY, JSON.stringify({ visits: 1 }));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    _resetInstallCapture();
    localStorage.removeItem(KEY);
  });

  it('the second visit: nothing on the first page; a move, a moment, then the offer; Install takes the browser dialog', async () => {
    handOver('accepted');
    const { container } = render(<V2App gateId={null} />);
    expect(readOffer().visits).toBe(2);
    settle();
    expect(offer()).toBe(null);
    moveTo(container, 'Search');
    expect(offer()).toBe(null);
    settle();
    expect(offer()).not.toBe(null);
    await act(async () => { button(offer(), 'Install VOTReader').click(); });
    expect(ev.prompt).toHaveBeenCalled();
    expect(offer()).toBe(null);
    expect(readOffer()).toEqual({ never: true, visits: 2 });
  });

  it('the first visit never offers', () => {
    localStorage.removeItem(KEY);
    handOver('accepted');
    const { container } = render(<V2App gateId={null} />);
    moveTo(container, 'Search');
    settle();
    expect(offer()).toBe(null);
    expect(readOffer().visits).toBe(1);
  });

  it('Maybe later snoozes it and it does not come back this session; Don’t ask again ends it', () => {
    handOver('accepted');
    const { container } = render(<V2App gateId={null} />);
    moveTo(container, 'Search');
    settle();
    click(button(offer(), 'Maybe later'));
    expect(offer()).toBe(null);
    const s = readOffer();
    expect(s.dismissals).toBe(1);
    expect(s.snoozeUntil).toBeGreaterThan(Date.now());
    moveTo(container, 'Notes');
    settle();
    expect(offer()).toBe(null);
    cleanup();

    _resetOfferSession();
    localStorage.setItem(KEY, JSON.stringify({ visits: 4 }));
    _resetVisit();
    const again = render(<V2App gateId={null} />);
    moveTo(again.container, 'Notes');
    settle();
    click(button(offer(), 'Don’t ask again'));
    expect(readOffer()).toEqual({ never: true, visits: 5 });
  });

  it('a browser with no install event gets Show me how: its steps, a picture each; Done snoozes it', () => {
    const ua = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14; SM-S901U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0 Mobile Safari/537.36');
    try {
      const { container } = render(<V2App gateId={null} />);
      moveTo(container, 'Search');
      settle();
      click(button(offer(), 'Show me how'));
      const steps = document.querySelector('[role="dialog"].inst-steps');
      expect(steps.getAttribute('aria-label')).toBe('Add to Home Screen');
      expect([...steps.querySelectorAll('.inst-steps .t')].map((e) => e.textContent)).toEqual(['Tap the menu', 'Tap Install app', 'Tap Install']);
      expect(steps.querySelector('.inst-steps img').getAttribute('src')).toBe('install/android-1.jpg');
      click(button(steps, 'Done'));
      expect(document.querySelector('[role="dialog"]')).toBe(null);
      expect(readOffer().dismissals).toBe(1);
    } finally { ua.mockRestore(); }
  });

  it('never in the app: no flow', () => {
    handOver('accepted');
    g.PlatformBridge = { isAndroid: true };
    try {
      const { container } = render(<V2App gateId={null} />);
      moveTo(container, 'Search');
      settle();
      expect(offer()).toBe(null);
    } finally { delete g.PlatformBridge; }
  });
});
