// @ts-nocheck
/* THE INSTALL CARD (ip1, 2026-09-25; mockups lanes/myweb/out/mockups/ip1/ip1-r2-*.png).
   At the end of a chapter or letter, in the browser only, once the reader has finished a chapter: "Keep VOTReader on
   your home screen". Chromium that handed over its install event gets a real INSTALL VOTREADER button; iPhone Safari,
   Samsung Internet, Android Chrome without the event and desktop Chrome/Edge get SHOW ME HOW, a sheet of numbered
   steps with a picture each. Never in the APK, an installed app, Firefox desktop or an in-app browser. Maybe later
   (or the X) snoozes it 21 days, Don't ask again ends it, and it shows in one place a session. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import React from 'react';
import * as ReactDOM from 'react-dom';
import { InstallCard, _resetInstallCardSession, isInstallCardOnScreen, subscribeInstallCardOnScreen } from './InstallCard.jsx';
import { attachInstallCapture, _resetInstallCapture } from '../../utils/install-offer.js';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36',
  firefoxDesktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
};
const KEY = 'vot-install-offer';
let ua = UA.iphone;
let readItems = { 'v1:genesis:1': 1 };

beforeEach(() => {
  globalThis.ReactDOM = ReactDOM;   // the app's global (bundle-a)
  ua = UA.iphone;
  readItems = { 'v1:genesis:1': 1 };
  Object.defineProperty(window.navigator, 'userAgent', { configurable: true, get: () => ua });
  globalThis.StateStore = { get: () => ({ readItems }), subscribe: () => () => {}, getVersion: () => 1 };
  globalThis.StorageHealth = { _isStandalone: () => false };
  globalThis.PlatformBridge = { isAndroid: false };
  localStorage.removeItem(KEY);
  _resetInstallCardSession();
  _resetInstallCapture();
});
afterEach(() => {
  cleanup();
  delete globalThis.StateStore; delete globalThis.StorageHealth; delete globalThis.PlatformBridge;
  localStorage.removeItem(KEY);
});

const card = (c) => c.querySelector('.install-card');

describe('InstallCard: who sees it', () => {
  it('an iPhone reader who has finished a chapter sees the card with SHOW ME HOW and the app\'s own icon', () => {
    const { container } = render(<InstallCard unitKey="genesis:1" />);
    expect(card(container)).not.toBeNull();
    expect(card(container).querySelector('.install-card-title').textContent).toBe('Keep VOTReader on your home screen');
    expect(card(container).querySelector('.install-card-primary').textContent).toBe('Show me how');
    expect(card(container).querySelector('img.install-card-icon').getAttribute('src')).toBe('icons/icon-192.png');
  });

  it('nobody in the APK, in an installed app, in Firefox desktop, or before a finished chapter', () => {
    globalThis.PlatformBridge.isAndroid = true;
    let v = render(<InstallCard unitKey="a" />);
    expect(card(v.container)).toBeNull(); cleanup();
    globalThis.PlatformBridge.isAndroid = false;
    globalThis.StorageHealth._isStandalone = () => true;
    v = render(<InstallCard unitKey="a" />);
    expect(card(v.container)).toBeNull(); cleanup();
    globalThis.StorageHealth._isStandalone = () => false;
    ua = UA.firefoxDesktop;
    v = render(<InstallCard unitKey="a" />);
    expect(card(v.container)).toBeNull(); cleanup();
    ua = UA.iphone; readItems = {};
    v = render(<InstallCard unitKey="a" />);
    expect(card(v.container)).toBeNull();
  });

  it('inert (the swipe preview) renders nothing', () => {
    const { container } = render(<InstallCard unitKey="a" inert />);
    expect(card(container)).toBeNull();
  });

  it('once a session: a second chapter does not show it again', () => {
    const one = render(<InstallCard unitKey="genesis:1" />);
    expect(card(one.container)).not.toBeNull();
    const two = render(<InstallCard unitKey="genesis:2" />);
    expect(card(two.container)).toBeNull();
  });
});

describe('InstallCard: the steps', () => {
  it('iPhone: SHOW ME HOW opens four numbered steps with pictures; Done closes and asks again later', () => {
    const { container } = render(<InstallCard unitKey="a" />);
    act(() => { fireEvent.click(card(container).querySelector('.install-card-primary')); });
    const sheet = document.querySelector('.install-steps');
    expect(sheet.getAttribute('role')).toBe('dialog');
    expect([...sheet.querySelectorAll('.install-step img')].map((i) => i.getAttribute('src')))
      .toEqual(['install/ios-1.jpg', 'install/ios-2.jpg', 'install/ios-3.jpg', 'install/ios-4.jpg']);
    expect([...sheet.querySelectorAll('.install-step-title')].map((t) => t.textContent))
      .toEqual(['Tap the ••• button', 'Tap Share', 'Tap Add to Home Screen', 'Tap Add']);
    act(() => { fireEvent.click(sheet.querySelector('.install-steps-done')); });
    expect(document.querySelector('.install-steps')).toBeNull();
    expect(card(container)).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY))).toMatchObject({ dismissals: 1 });
  });

  it('Samsung Internet and Android Chrome without the install event get their own steps', () => {
    ua = UA.samsung;
    let v = render(<InstallCard unitKey="a" />);
    act(() => { fireEvent.click(card(v.container).querySelector('.install-card-primary')); });
    expect(document.querySelectorAll('.install-step img')[0].getAttribute('src')).toBe('install/samsung-1.jpg');
    cleanup(); _resetInstallCardSession();
    ua = UA.android;
    v = render(<InstallCard unitKey="a" />);
    act(() => { fireEvent.click(card(v.container).querySelector('.install-card-primary')); });
    expect([...document.querySelectorAll('.install-step img')].map((i) => i.getAttribute('src')))
      .toEqual(['install/android-1.jpg', 'install/android-2.jpg', 'install/android-3.jpg']);
  });
});

describe('InstallCard: the browser\'s own install', () => {
  it('Chromium handed over its event: INSTALL VOTREADER opens the browser\'s dialog; accepted ends the offer', async () => {
    ua = UA.android;
    attachInstallCapture(window);
    const prompt = vi.fn(() => Promise.resolve());
    const e = new Event('beforeinstallprompt');
    e.prompt = prompt; e.userChoice = Promise.resolve({ outcome: 'accepted' });
    act(() => { window.dispatchEvent(e); });
    const { container } = render(<InstallCard unitKey="a" />);
    const btn = card(container).querySelector('.install-card-primary');
    expect(btn.textContent).toBe('Install');
    await act(async () => { fireEvent.click(btn); await Promise.resolve(); await Promise.resolve(); });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(card(container)).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY))).toMatchObject({ never: true });
  });

  /* W56 (sweep 2026-10-13): an install from the browser's own menu (or the address-bar icon) fires appinstalled
     and nothing else. The card only lost its event, so it fell back to SHOW ME HOW for an app already on the
     home screen, and with nothing stored it asked again in the browser tab every session. */
  it('installed from the browser menu while the card is up: it goes, and later sessions never ask', () => {
    ua = UA.android;
    attachInstallCapture(window);
    const e = new Event('beforeinstallprompt');
    e.prompt = vi.fn(() => Promise.resolve()); e.userChoice = Promise.resolve({ outcome: 'accepted' });
    act(() => { window.dispatchEvent(e); });
    let v = render(<InstallCard unitKey="a" />);
    expect(card(v.container).querySelector('.install-card-primary').textContent).toBe('Install');
    act(() => { window.dispatchEvent(new Event('appinstalled')); });
    expect(card(v.container), 'no SHOW ME HOW for an app already installed').toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY))).toMatchObject({ never: true });
    cleanup(); _resetInstallCardSession(); _resetInstallCapture();
    v = render(<InstallCard unitKey="b" />);
    expect(card(v.container), 'the browser tab, next session').toBeNull();
  });

  it('installed while no card was on screen: the next card to mount records it and stays away', () => {
    ua = UA.android;
    attachInstallCapture(window);
    act(() => { window.dispatchEvent(new Event('appinstalled')); });
    const v = render(<InstallCard unitKey="a" />);
    expect(card(v.container)).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY))).toMatchObject({ never: true });
  });
});

describe('InstallCard: saying no', () => {
  it('Not now hides it and snoozes it, and counts the dismissal', () => {
    let v = render(<InstallCard unitKey="a" />);
    act(() => { fireEvent.click(card(v.container).querySelector('.install-card-later')); });
    expect(card(v.container)).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY)).snoozeUntil).toBeGreaterThan(Date.now());
    cleanup(); _resetInstallCardSession();
    v = render(<InstallCard unitKey="a" />);
    expect(card(v.container), 'snoozed').toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY))).toMatchObject({ dismissals: 1 });
  });

  /* U01.3/U06.5: the card is one line under Next now: the offer, Install (or Show me how) and Not now. */
  it('is one line: the offer, its one action and Not now, nothing else to read', () => {
    const v = render(<InstallCard unitKey="a" />);
    const c = card(v.container);
    expect([...c.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Show me how', 'Not now']);
    expect(c.querySelector('.install-card-body')).toBeNull();
  });
});

/* search200 UX B1: a search jump is not the reader finishing the chapter.
   With no read item (mark-as-read off, or a first visit) the card's one signal is "the reader scrolled to
   this chapter's end". A search hit near the end landed the end on screen with the page already scrolled, so
   the jump itself offered the card, and the long-press tip then sat on its heading. The end now counts only
   when the reader's own hand moved the page: a drag, a wheel, a scroll key, the scrollbar. A tap (the find
   pill's next, a link) and a programmatic scroll (a jump, a restore) are not. */
describe('InstallCard: the end of the chapter is the reader\'s own scroll (search200 UX B1)', () => {
  let ios; let now; let scroller; let top;
  class FakeIO {
    constructor(cb) { this.cb = cb; this.els = []; ios.push(this); }
    observe(el) { this.els.push(el); }
    unobserve(el) { this.els = this.els.filter((e) => e !== el); }
    disconnect() { this.els = []; }
  }
  /** The observer reports `el` entering (or leaving) the screen. */
  const onScreen = (el, on) => act(() => { for (const io of ios.slice()) if (io.els.includes(el)) io.cb([{ target: el, isIntersecting: on }]); });
  const scrollTo = (y) => act(() => { top = y; fireEvent.scroll(scroller); });
  const mount = () => {
    const v = render(<InstallCard unitKey="genesis:1" />, { container: scroller });
    return { ...v, sentinel: scroller.querySelector('.install-card-sentinel') };
  };
  const newScroller = () => {
    scroller = document.createElement('div');
    scroller.className = 'screen-scroll';
    document.body.appendChild(scroller);
    top = 0;
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, get: () => top, set: (y) => { top = y; } });
  };
  beforeEach(() => {
    ios = []; now = 1_000_000; readItems = {};
    globalThis.IntersectionObserver = FakeIO;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    newScroller();
  });
  afterEach(() => {
    delete globalThis.IntersectionObserver;
    vi.restoreAllMocks();
    if (scroller.parentNode) scroller.parentNode.removeChild(scroller);
  });

  it('a search jump that lands at the end does not offer the card', () => {
    const { container, sentinel } = mount();
    scrollTo(1800);                     // the jump to the hit
    onScreen(sentinel, true);
    expect(card(container), 'the jump is not the reader at the end').toBeNull();
  });

  it('the reader dragging the page to the end offers it', () => {
    const { container, sentinel } = mount();
    fireEvent.touchMove(scroller); scrollTo(600);
    expect(card(container), 'not at the end yet').toBeNull();
    fireEvent.touchMove(scroller); scrollTo(1800);
    onScreen(sentinel, true);
    expect(card(container)).not.toBeNull();
  });

  it('landed at the end by the jump, then the reader scrolls: that is the reader at the end', () => {
    const { container, sentinel } = mount();
    scrollTo(1800); onScreen(sentinel, true);
    expect(card(container), 'the jump alone').toBeNull();
    fireEvent.wheel(scroller); scrollTo(1760);
    expect(card(container), 'the reader moved the page at the end').not.toBeNull();
  });

  it('a fling carries on after the finger lifts: its momentum is still the reader\'s', () => {
    const { container, sentinel } = mount();
    fireEvent.touchMove(scroller); now += 100; scrollTo(400);
    now += 2500; scrollTo(1800);        // momentum, long after the last touch
    onScreen(sentinel, true);
    expect(card(container)).not.toBeNull();
  });

  it('a tap (the find pill\'s next, a link) and a scroll long after the last touch are not the reader\'s', () => {
    const { container, sentinel } = mount();
    const next = document.createElement('button'); scroller.appendChild(next);
    fireEvent.touchStart(next); fireEvent.pointerDown(next); fireEvent.keyDown(next, { key: 'Enter' });
    scrollTo(1800); onScreen(sentinel, true);
    expect(card(container), 'a tap that jumps').toBeNull();
    onScreen(sentinel, false);
    fireEvent.touchMove(scroller); now += 2000; scrollTo(1700); onScreen(sentinel, true);
    expect(card(container), 'a restore two seconds after the last touch').toBeNull();
  });

  it('the scroll keys and the scrollbar are the reader\'s too', () => {
    let v = mount();
    fireEvent.keyDown(scroller, { key: 'End' }); scrollTo(1800); onScreen(v.sentinel, true);
    expect(card(v.container), 'End').not.toBeNull();
    cleanup(); _resetInstallCardSession();
    newScroller();
    v = mount();
    fireEvent.pointerDown(scroller); scrollTo(1800); onScreen(v.sentinel, true);
    expect(card(v.container), 'the scrollbar').not.toBeNull();
  });

  it('typing in a field is not a scroll key', () => {
    const { container, sentinel } = mount();
    const field = document.createElement('input'); scroller.appendChild(field);
    fireEvent.keyDown(field, { key: ' ' }); scrollTo(1800); onScreen(sentinel, true);
    expect(card(container)).toBeNull();
  });
});

/* search200 UX B1: the long-press tip waits while the card is on screen (AnnotationHint reads this). */
describe('InstallCard: says when it is on screen', () => {
  let ios;
  class FakeIO {
    constructor(cb) { this.cb = cb; this.els = []; ios.push(this); }
    observe(el) { this.els.push(el); }
    unobserve(el) { this.els = this.els.filter((e) => e !== el); }
    disconnect() { this.els = []; }
  }
  const onScreen = (el, on) => act(() => { for (const io of ios.slice()) if (io.els.includes(el)) io.cb([{ target: el, isIntersecting: on }]); });
  beforeEach(() => { ios = []; });
  afterEach(() => { delete globalThis.IntersectionObserver; });

  it('on screen while the card is in view; not once it scrolls away, is dismissed or unmounts', () => {
    globalThis.IntersectionObserver = FakeIO;
    const v = render(<InstallCard unitKey="genesis:1" />);
    const section = card(v.container);
    expect(section, 'PRECONDITION: the card is shown').not.toBeNull();
    expect(isInstallCardOnScreen(), 'below the fold').toBe(false);
    onScreen(section, true);
    expect(isInstallCardOnScreen()).toBe(true);
    onScreen(section, false);
    expect(isInstallCardOnScreen(), 'scrolled away').toBe(false);
    onScreen(section, true);
    act(() => { fireEvent.click(section.querySelector('.install-card-later')); });
    expect(isInstallCardOnScreen(), 'Maybe later').toBe(false);
  });

  it('a card on screen that unmounts is no longer on screen', () => {
    globalThis.IntersectionObserver = FakeIO;
    const v = render(<InstallCard unitKey="genesis:1" />);
    onScreen(card(v.container), true);
    expect(isInstallCardOnScreen()).toBe(true);
    cleanup();
    expect(isInstallCardOnScreen(), 'unmounted').toBe(false);
  });

  it('without an observer a shown card counts as on screen and tells its subscribers; a hidden one does not', () => {
    const cb = vi.fn();
    const off = subscribeInstallCardOnScreen(cb);
    render(<InstallCard unitKey="genesis:1" />);
    expect(isInstallCardOnScreen()).toBe(true);
    expect(cb).toHaveBeenCalled();
    cleanup();
    expect(isInstallCardOnScreen()).toBe(false);
    off();
    readItems = {};
    render(<InstallCard unitKey="genesis:1" />);
    expect(isInstallCardOnScreen(), 'no card shown').toBe(false);
  });
});
