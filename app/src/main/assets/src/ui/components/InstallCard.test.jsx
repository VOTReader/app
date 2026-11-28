// @ts-nocheck
/* INSTALLING FROM THE BROWSER: the popup on Home (once earned, newcomer 2026-11-27), the Settings row and its steps.
   The end-of-chapter card these tests began with (ip1, 2026-09-25) left the reading flow in 814baf2f6 and was deleted
   on 2026-11-27, with its tests; the steps sheet's tests moved to the Settings row, which opens the same sheet. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import React from 'react';
import * as ReactDOM from 'react-dom';
import { InstallRow, InstallPopup, ownBrowserUrl, _resetInstallCardSession, _resetInstallPopupSession as _resetPopupOnly } from './InstallCard.jsx';
import { _resetUnasked, markFirstRunSession } from '../../utils/unasked.js';

/** A new session: the popup's own memory and the one-a-session gate both start again. */
const _resetInstallPopupSession = () => { _resetPopupOnly(); _resetUnasked(); };
import { attachInstallCapture, _resetInstallCapture } from '../../utils/install-offer.js';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36',
  firefoxDesktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
  chromeDesktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
  firefoxAndroid: 'Mozilla/5.0 (Android 15; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/154.0 Mobile/15E148 Safari/604.1',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15',
  messengerAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S901U Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/480.0.0.0.0;]',
  messengerIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/500.0.0;FBDV/iPhone15,2;FBSN/iOS;FBSV/18.5]',
};
const KEY = 'vot-install-offer';
let ua = UA.iphone;
let readItems = { 'v1:genesis:1': 1 };
/** Three finished readings: the install offer is earned (install-offer's READINGS_TO_EARN). */
const EARNED = { 'v1:genesis:1': 1, 'v1:genesis:2': 1, 'v1:genesis:3': 1 };

beforeEach(() => {
  _resetUnasked();
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


/* The steps sheet, opened from the Settings row (it was opened from the end-of-chapter card until that card was
   deleted, newcomer 2026-11-27; these three tests moved with the sheet, unchanged in what they check). */
describe('InstallSteps: the numbered steps', () => {
  const openRow = () => { const v = render(<InstallRow />); act(() => { fireEvent.click(v.getByRole('button', { name: /Install VOTReader/ })); }); return v; };
  it('iPhone: four numbered steps with pictures; Done closes them', () => {
    openRow();
    const sheet = document.querySelector('.install-steps');
    expect(sheet.getAttribute('role')).toBe('dialog');
    expect([...sheet.querySelectorAll('.install-step img')].map((i) => i.getAttribute('src')))
      .toEqual(['install/ios-1.jpg', 'install/ios-2.jpg', 'install/ios-3.jpg', 'install/ios-4.jpg']);
    expect([...sheet.querySelectorAll('.install-step-title')].map((x) => x.textContent))
      .toEqual(['Tap the ••• button', 'Tap Share', 'Tap Add to Home Screen', 'Tap Add']);
    act(() => { fireEvent.click(sheet.querySelector('.install-steps-done')); });
    expect(document.querySelector('.install-steps')).toBeNull();
  });

  /* Focus used to go to Done, the first control, at the sheet's foot: a sheet taller than the screen opened
     scrolled to its last step (seen at 200% text, 2026-11-20). The sheet takes focus itself. */
  it('opens at its first step: focus is on the sheet, not on Done at its foot', () => {
    openRow();
    const sheet = document.querySelector('.install-steps');
    expect(document.activeElement).toBe(sheet);
    expect(sheet.getAttribute('aria-labelledby')).toBe(sheet.querySelector('.install-steps-title').id);
  });

  it('Samsung Internet and Android Chrome without the install event get their own steps', () => {
    ua = UA.samsung;
    openRow();
    expect(document.querySelectorAll('.install-step img')[0].getAttribute('src')).toBe('install/samsung-1.jpg');
    cleanup();
    ua = UA.android;
    openRow();
    // Walked on a real Chrome (2026-11-20): four taps, and the last one is the phone's own box.
    expect([...document.querySelectorAll('.install-step img')].map((i) => i.getAttribute('src')))
      .toEqual(['install/android-1.jpg', 'install/android-2.jpg', 'install/android-3.jpg', 'install/android-4.jpg']);
    expect([...document.querySelectorAll('.install-step-title')].map((x) => x.textContent))
      .toEqual(['Tap the menu', 'Tap Add to Home screen', 'Tap Install', 'Tap Add to home screen']);
  });
});

describe('InstallPopup: it comes up by itself', () => {
  const handOver = (outcome = 'accepted') => {
    attachInstallCapture(window);
    const e = new Event('beforeinstallprompt');
    e.prompt = vi.fn(() => Promise.resolve()); e.userChoice = Promise.resolve({ outcome });
    act(() => { window.dispatchEvent(e); });
    return e;
  };
  const ask = () => document.querySelector('.install-ask');
  beforeEach(() => { vi.useFakeTimers(); _resetInstallPopupSession(); ua = UA.android; readItems = EARNED; });
  afterEach(() => { vi.useRealTimers(); delete globalThis.TourController; });

  it('on Home, a moment after the browser says the app can be installed: the icon, one line, Install and Not now', () => {
    handOver();
    render(<InstallPopup screen="home" />);
    expect(ask()).toBeNull();                       // not in the same breath as the page
    act(() => { vi.advanceTimersByTime(1600); });
    expect(ask().getAttribute('role')).toBe('dialog');
    expect(ask().querySelector('.install-steps-title').textContent).toBe('Install VOTReader');
    expect(ask().querySelector('.install-steps-intro').textContent).toBe('Keep it on your home screen. It opens full screen, like an app.');
    expect(ask().querySelector('img.install-ask-icon').getAttribute('src')).toBe('icons/icon-192.png');
    expect([...ask().querySelectorAll('button, a')].map((b) => b.textContent)).toEqual(['Install', 'Not now']);
    expect(ask().querySelectorAll('.install-step').length).toBe(0);   // no walkthrough
  });

  it('Install is one tap to the browser\'s own dialog; on a phone the reader is then told what the phone asks next', async () => {
    const e = handOver('accepted');
    render(<InstallPopup screen="home" />);
    act(() => { vi.advanceTimersByTime(1600); });
    await act(async () => { fireEvent.click(ask().querySelector('.install-ask-go')); await Promise.resolve(); await Promise.resolve(); });
    expect(e.prompt).toHaveBeenCalledTimes(1);
    expect(ask()).toBeNull();
    expect(document.querySelector('.install-steps-title').textContent).toBe('Almost done');
    // Chrome's yes is not yet an icon on a phone: this browser is asked again in 21 days, not never.
    const s = JSON.parse(localStorage.getItem(KEY));
    expect(s.never).toBeUndefined();
    expect(s.snoozeUntil).toBeGreaterThan(Date.now());
  });

  it('on a computer Install is the whole of it: nothing more is shown, and it is written down', async () => {
    ua = UA.chromeDesktop;
    handOver('accepted');
    render(<InstallPopup screen="home" />);
    act(() => { vi.advanceTimersByTime(1600); });
    expect(ask().querySelector('.install-steps-intro').textContent).toMatch(/on this computer/);
    await act(async () => { fireEvent.click(ask().querySelector('.install-ask-go')); await Promise.resolve(); await Promise.resolve(); });
    expect(document.querySelector('.install-steps')).toBeNull();
    const s = JSON.parse(localStorage.getItem(KEY));
    expect(s.never).toBeUndefined();
    expect(s.installedAt).toBeGreaterThan(0);
    expect(s.snoozeUntil).toBeGreaterThan(Date.now());
  });

  /* newcomer (Corbin 2026-11-27, "I agree with your takes"): a showing counts when it shows, answered or not; the
     offer then rests 21 days, and after two showings not ended by an install it stops. It replaced his 11-21 "reoffers
     it every so often". */
  describe('two showings, then it stops', () => {
    const DAY = 86400000;
    const popupAfter = (state, wait = 1600) => {
      cleanup(); _resetInstallPopupSession(); _resetInstallCapture();
      localStorage.setItem(KEY, JSON.stringify(state));
      handOver();
      render(<InstallPopup screen="home" />);
      act(() => { vi.advanceTimersByTime(wait); });
      return ask();
    };
    it('one showing, rested 21 days: asked once more; after the second, never again', () => {
      expect(popupAfter({ dismissals: 1, snoozeUntil: Date.now() + DAY })).toBeNull();
      expect(popupAfter({ dismissals: 1, snoozeUntil: Date.now() - 1000 })).not.toBeNull();
      expect(JSON.parse(localStorage.getItem(KEY)).dismissals).toBe(2);
      expect(popupAfter({ dismissals: 2, snoozeUntil: Date.now() - 1000 })).toBeNull();
      expect(popupAfter({ dismissals: 7, snoozeUntil: Date.now() - 365 * DAY })).toBeNull();
    });
    it('an unanswered showing counts: it needs no tap to stop being new', () => {
      expect(popupAfter({})).not.toBeNull();
      const s = JSON.parse(localStorage.getItem(KEY));
      expect(s).toMatchObject({ dismissals: 1, pending: true });
      expect(s.snoozeUntil).toBeGreaterThan(Date.now() + 20 * DAY);
      expect(popupAfter(s, 5000), 'the next session, inside the 21 days').toBeNull();
    });
    it('Not now after the showing is the same one decline, not two', () => {
      expect(popupAfter({})).not.toBeNull();
      act(() => { fireEvent.click(ask().querySelector('.install-steps-done')); });
      expect(JSON.parse(localStorage.getItem(KEY))).toMatchObject({ dismissals: 1 });
      expect(JSON.parse(localStorage.getItem(KEY)).pending).toBeUndefined();
    });
    it('a showing ended by an install is no decline', async () => {
      ua = UA.chromeDesktop;
      expect(popupAfter({ dismissals: 1, snoozeUntil: Date.now() - 1000 })).not.toBeNull();
      await act(async () => { fireEvent.click(ask().querySelector('.install-ask-go')); await Promise.resolve(); await Promise.resolve(); });
      expect(JSON.parse(localStorage.getItem(KEY))).toMatchObject({ dismissals: 1 });
    });
    it('a phone that said "installed" 21 days ago and has never run from an icon is asked again; one that has is not', () => {
      const said = { installedAt: Date.now() - 22 * DAY, snoozeUntil: Date.now() - DAY };
      expect(popupAfter(said), 'no icon was ever used').not.toBeNull();
      expect(popupAfter({ ...said, standaloneAt: Date.now() - 2 * DAY, real: false }), 'the icon was used two days ago').toBeNull();
    });
    it('the Settings row stays the way in after it stops', () => {
      cleanup(); localStorage.setItem(KEY, JSON.stringify({ dismissals: 2 }));
      const v = render(<InstallRow />);
      expect(v.container.querySelector('.settings-help-install')).not.toBeNull();
    });
  });

  /* newcomer: the offer is earned. Never in the session the welcome ran in; after that, a later-day return with one
     finished reading, or three finished readings. */
  describe('earned, not on a clock', () => {
    const popup = (wait = 9000) => { cleanup(); handOver(); render(<InstallPopup screen="home" />); act(() => { vi.advanceTimersByTime(wait); }); return ask(); };
    afterEach(() => { delete globalThis.HistoryStore; });
    it('not with fewer than three finished readings and no earlier day', () => {
      readItems = { a: 1, b: 1 };
      expect(popup()).toBeNull();
    });
    it('three finished readings earn it', () => {
      readItems = EARNED;
      expect(popup()).not.toBeNull();
    });
    it('one finished reading and a reading on an earlier day earn it; none finished does not', () => {
      globalThis.HistoryStore = { list: () => [{ key: 'x', ts: Date.now() - 2 * 86400000 }] };
      readItems = { a: 1 };
      expect(popup()).not.toBeNull();
      _resetInstallPopupSession(); localStorage.removeItem(KEY);
      readItems = {};
      expect(popup()).toBeNull();
    });
    it('never in the session the welcome ran in, however much was read', () => {
      readItems = EARNED;
      markFirstRunSession();
      expect(popup()).toBeNull();
      _resetInstallPopupSession();
      expect(popup(), 'the next session').not.toBeNull();
    });
  });

  it('Not now closes it, waits 21 days, and it does not come back this session', () => {
    handOver();
    const v = render(<InstallPopup screen="home" />);
    act(() => { vi.advanceTimersByTime(1600); });
    act(() => { fireEvent.click(ask().querySelector('.install-steps-done')); });
    expect(ask()).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY))).toMatchObject({ dismissals: 1 });
    v.rerender(<InstallPopup screen="letter" />);
    v.rerender(<InstallPopup screen="home" />);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(ask()).toBeNull();
  });

  it('a later session inside the 21 days does not ask; after them it does', () => {
    handOver();
    localStorage.setItem(KEY, JSON.stringify({ dismissals: 1, snoozeUntil: Date.now() + 86400000 }));
    let v = render(<InstallPopup screen="home" />);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(ask()).toBeNull();
    v.unmount();
    localStorage.setItem(KEY, JSON.stringify({ dismissals: 1, snoozeUntil: Date.now() - 1000 }));
    v = render(<InstallPopup screen="home" />);
    act(() => { vi.advanceTimersByTime(1600); });
    expect(ask()).not.toBeNull();
  });

  it('never over a reading page: it waits for Home', () => {
    handOver();
    const v = render(<InstallPopup screen="letter" />);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(ask()).toBeNull();
    v.rerender(<InstallPopup screen="home" />);
    act(() => { vi.advanceTimersByTime(1600); });
    expect(ask()).not.toBeNull();
  });

  it('not over the tour or another dialog: the next arrival on Home asks instead', () => {
    handOver();
    globalThis.TourController = { getState: () => ({ active: true }) };
    const v = render(<InstallPopup screen="home" />);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(ask()).toBeNull();
    globalThis.TourController = { getState: () => ({ active: false }) };
    v.rerender(<InstallPopup screen="settings" />);
    v.rerender(<InstallPopup screen="home" />);
    act(() => { vi.advanceTimersByTime(1600); });
    expect(ask()).not.toBeNull();
  });

  it('nothing in the APK or in an installed app', () => {
    handOver();
    globalThis.PlatformBridge.isAndroid = true;
    render(<InstallPopup screen="home" />);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(ask()).toBeNull();
    cleanup();
    globalThis.PlatformBridge.isAndroid = false;
    globalThis.StorageHealth._isStandalone = () => true;
    render(<InstallPopup screen="home" />);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(ask()).toBeNull();
  });

  /* Corbin 2026-11-20: "build the same popup feature for safari and other browsers (not walkthroughs)". Only
     Chromium gives a page an install it can start; elsewhere the same popup says in one line where the
     browser's own is. */
  it('Safari on an iPhone: the same popup, one line saying where Safari keeps it, and Got it (no steps, no dead button)', () => {
    ua = UA.iphone;
    render(<InstallPopup screen="home" />);
    act(() => { vi.advanceTimersByTime(1600); });
    expect(ask().querySelector('.install-steps-title').textContent).toBe('Install VOTReader');
    expect(ask().querySelector('.install-steps-intro').textContent).toBe('Keep it on your home screen. It opens full screen, like an app.');
    expect(ask().querySelector('.install-ask-how').textContent).toBe('In Safari, tap Share (it may be under •••), then Add to Home Screen.');
    expect(ask().querySelector('.install-ask-go')).toBeNull();
    expect([...ask().querySelectorAll('button, a')].map((b) => b.textContent)).toEqual(['Got it', 'I already have it']);
    expect(ask().querySelectorAll('.install-step').length).toBe(0);
    act(() => { fireEvent.click(ask().querySelector('.install-steps-done')); });
    expect(ask()).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY))).toMatchObject({ dismissals: 1 });
  });

  it('each other browser gets its own line', () => {
    const lineFor = (agent) => {
      ua = agent; _resetInstallPopupSession(); localStorage.removeItem(KEY);
      render(<InstallPopup screen="home" />);
      act(() => { vi.advanceTimersByTime(8100); });
      const t = ask() && ask().querySelector('.install-ask-how').textContent;
      cleanup();
      return t;
    };
    expect(lineFor(UA.samsung)).toBe('Tap the three lines at the bottom right, then Add page to, then Home screen.');
    expect(lineFor(UA.android)).toBe('Tap the three dots at the top right, then Add to Home screen, then Install.');
    expect(lineFor(UA.firefoxAndroid)).toBe('Tap the three dots, then Add app to Home screen. It may say Install.');
    expect(lineFor(UA.iphoneChrome)).toBe('In your browser, tap Share, then Add to Home Screen.');
    expect(lineFor(UA.macSafari)).toBe('In the menu bar, choose File, then Add to Dock.');
  });

  /* A computer's Chrome or Edge hands a page its install event whenever the app can be installed and is not. No
     event after its time to send one: the app is there already (or the window is a private one), and the popup
     used to tell that reader to click an install icon the address bar no longer has. */
  it('a computer\'s Chrome with no install event is not asked: it has the app; when the event comes, it is asked with the button', () => {
    ua = UA.chromeDesktop;
    render(<InstallPopup screen="home" />);
    act(() => { vi.advanceTimersByTime(8100); });
    expect(ask(), 'no event: installed already').toBeNull();
    act(() => { vi.advanceTimersByTime(60000); });
    expect(ask()).toBeNull();
    handOver();                                       // the app was removed, or the browser has only now made up its mind
    act(() => { vi.advanceTimersByTime(1600); });
    expect(ask().querySelector('.install-ask-go').textContent).toBe('Install');
    expect(ask().querySelector('.install-ask-how')).toBeNull();
  });

  it('a Chromium is given time to hand over its install event; if it comes while the line is up, the line becomes the button', () => {
    ua = UA.android;
    render(<InstallPopup screen="home" />);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(ask()).toBeNull();                         // still waiting for the event, not yet describing the menu
    act(() => { vi.advanceTimersByTime(3500); });
    expect(ask().querySelector('.install-ask-how')).not.toBeNull();
    expect(ask().querySelector('.install-ask-go')).toBeNull();
    handOver();
    expect(ask().querySelector('.install-ask-how')).toBeNull();
    expect(ask().querySelector('.install-ask-go').textContent).toBe('Install');
  });

  it('Firefox on a computer has no install: no popup', () => {
    ua = UA.firefoxDesktop;
    render(<InstallPopup screen="home" />);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(ask()).toBeNull();
  });

  /* A link tapped in Messenger opens in Messenger's own browser, which cannot install anything (a reader,
     2026-11-20: "it showed up but didn't install to my phone"). The popup is the way out. */
  it('in Messenger\'s browser it offers Chrome: a link that opens this page there, and the words for when it does not', () => {
    ua = UA.messengerAndroid;
    render(<InstallPopup screen="home" />);
    act(() => { vi.advanceTimersByTime(1600); });
    expect(ask().querySelector('.install-steps-intro').textContent).toMatch(/inside another app, such as Messenger\. It cannot install apps\. Open VOTReader in Chrome/);
    const go = ask().querySelector('a.install-ask-go');
    expect(go.textContent).toBe('Open in Chrome');
    expect(go.getAttribute('href')).toBe(ownBrowserUrl('in-app-android', location.href));
    expect(ask().querySelector('.install-ask-note').textContent).toBe('If the button does nothing, tap the three dots at the top of this screen, then Open in Chrome.');
  });

  it('the way out is this page in the phone\'s own browser: an intent link for Chrome, x-safari for Safari', () => {
    expect(ownBrowserUrl('in-app-android', 'https://votreader.github.io/app/?p=letter%3Achristmas%3A1#top'))
      .toBe('intent://votreader.github.io/app/?p=letter%3Achristmas%3A1#Intent;scheme=https;package=com.android.chrome;end');
    expect(ownBrowserUrl('in-app-ios', 'https://votreader.github.io/app/')).toBe('x-safari-https://votreader.github.io/app/');
  });

  it('on an iPhone in Messenger it says Safari', () => {
    ua = UA.messengerIphone;
    render(<InstallPopup screen="home" />);
    act(() => { vi.advanceTimersByTime(1600); });
    expect(ask().querySelector('a.install-ask-go').textContent).toBe('Open in Safari');
    expect(ask().querySelector('a.install-ask-go').getAttribute('href')).toMatch(/^x-safari-http/);
  });

  /* The hub's read of the popup at 200% text in Messenger: Not now sat below the fold. The buttons are one block
     at the foot of the sheet (it sticks there in CSS) and the words, the note included, come before it. */
  it('its buttons are one block at the foot of the sheet, after every word', () => {
    ua = UA.messengerAndroid;
    render(<InstallPopup screen="home" />);
    act(() => { vi.advanceTimersByTime(1600); });
    const foot = ask().querySelector('.install-ask-actions');
    expect(foot).toBe(ask().lastElementChild);
    expect([...foot.children].map((b) => b.textContent)).toEqual(['Open in Chrome', 'Not now']);
    expect(ask().querySelector('.install-ask-note').compareDocumentPosition(foot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  /* rel33: the gate's tab walk (headless Chrome, "Chrome/" in its UA) met the popup's backdrop over the screens
     it photographs. A driven browser is nobody to ask; a walk that wants the popup says so. */
  describe('a driven browser', () => {
    const drive = (on) => Object.defineProperty(window.navigator, 'webdriver', { configurable: true, get: () => on });
    afterEach(() => { drive(false); delete globalThis.__votInstallPopup; });
    it('is not asked', () => {
      drive(true);
      handOver();
      render(<InstallPopup screen="home" />);
      act(() => { vi.advanceTimersByTime(20000); });
      expect(ask()).toBeNull();
    });
    it('is asked when the walk sets window.__votInstallPopup', () => {
      drive(true);
      globalThis.__votInstallPopup = true;
      handOver();
      render(<InstallPopup screen="home" />);
      act(() => { vi.advanceTimersByTime(1600); });
      expect(ask()).not.toBeNull();
    });
  });

  /* Corbin 2026-11-20: "if I try to install via chrome, the app icon doesn't appear". Chrome's own menu installs
     without a tap of ours: the page hears appinstalled and nothing else. */
  describe('an install made from Chrome\'s own menu', () => {
    const after = () => [...document.querySelectorAll('.install-steps-title')].filter((t) => t.textContent === 'Almost done');
    it('on a phone: "Almost done" comes up, once, on whatever screen; the popup does not ask after it', () => {
      attachInstallCapture(window);
      const v = render(<InstallPopup screen="letter" />);
      act(() => { window.dispatchEvent(new Event('appinstalled')); });
      expect(after().length).toBe(1);
      expect(JSON.parse(localStorage.getItem(KEY)).installedAt).toBeGreaterThan(0);   // written down; no "Not now" is counted
      act(() => { fireEvent.click(document.querySelector('.install-steps .install-steps-done')); });
      expect(after().length).toBe(0);
      v.rerender(<InstallPopup screen="home" />);
      act(() => { vi.advanceTimersByTime(20000); });
      expect(ask()).toBeNull();
      expect(after().length).toBe(0);
    });
    it('while the popup is up: the note takes its place', () => {
      handOver();
      render(<InstallPopup screen="home" />);
      act(() => { vi.advanceTimersByTime(1600); });
      expect(ask()).not.toBeNull();
      act(() => { window.dispatchEvent(new Event('appinstalled')); });
      expect(ask()).toBeNull();
      expect(after().length).toBe(1);
    });
    it('on a computer the install is done when Chrome says so: nothing more is said', () => {
      ua = UA.chromeDesktop;
      attachInstallCapture(window);
      render(<InstallPopup screen="home" />);
      act(() => { window.dispatchEvent(new Event('appinstalled')); });
      expect(after().length).toBe(0);
    });
    it('started from the Settings row with the popup mounted too: one sheet, counted once', async () => {
      const e = handOver('accepted');
      const v = render(<><InstallPopup screen="settings" /><InstallRow /></>);
      act(() => { window.dispatchEvent(new Event('appinstalled')); });   // Chrome may say this first
      await act(async () => { fireEvent.click(v.getByRole('button', { name: /Install VOTReader/ })); await Promise.resolve(); await Promise.resolve(); });
      expect(after().length).toBe(1);
      expect(JSON.parse(localStorage.getItem(KEY)).installedAt).toBeGreaterThan(0);
      expect(JSON.parse(localStorage.getItem(KEY)).dismissals).toBeUndefined();
      expect(e.prompt).toHaveBeenCalledTimes(0);       // the event went with the install; the row shows its steps
    });
  });

  it('goes when the screen changes under it: no answer, but the showing has counted (newcomer: it needs no tap)', () => {
    handOver();
    const v = render(<InstallPopup screen="home" />);
    act(() => { vi.advanceTimersByTime(1600); });
    expect(ask()).not.toBeNull();
    v.rerender(<InstallPopup screen="letter" />);
    expect(ask()).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY))).toMatchObject({ dismissals: 1, pending: true });
    v.rerender(<InstallPopup screen="home" />);
    act(() => { vi.advanceTimersByTime(20000); });
    expect(ask()).toBeNull();                          // once a session
  });

  /* Corbin 2026-11-20: "make sure you address the wrinkle you mentioned" (a reader who has the app was asked
     again in a browser tab after 21 days). A tab does not ask where the app is installed. */
  describe('where the app is installed already', () => {
    const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    const DAY = 86400000;
    afterEach(() => { delete window.navigator.getInstalledRelatedApps; });
    const browserSays = (apps) => { window.navigator.getInstalledRelatedApps = vi.fn(() => Promise.resolve(apps)); };

    it('the browser says the app is installed (a real app from Google Play): not asked', async () => {
      browserSays([{ platform: 'webapp', url: 'https://votreader.github.io/app/manifest.json' }]);
      render(<InstallPopup screen="home" />);
      await settle();
      act(() => { vi.advanceTimersByTime(20000); });
      expect(ask()).toBeNull();
    });

    it('a run from the app\'s own icon is written down, with what the browser said of it', async () => {
      browserSays([]);
      globalThis.StorageHealth._isStandalone = () => true;
      render(<InstallPopup screen="home" />);
      await settle();
      const s = JSON.parse(localStorage.getItem(KEY));
      expect(s.standaloneAt).toBeGreaterThan(Date.now() - 5000);
      expect(s.real).toBe(false);                      // a home-screen icon the browser cannot see (no Google Play)
      expect(ask()).toBeNull();
    });

    it('a tab on a phone whose icon was used in the last 21 days: not asked, even with the install event (that Chrome always offers)', async () => {
      browserSays([]);
      localStorage.setItem(KEY, JSON.stringify({ standaloneAt: Date.now() - 3 * DAY, real: false }));
      handOver();
      render(<InstallPopup screen="home" />);
      await settle();
      act(() => { vi.advanceTimersByTime(20000); });
      expect(ask()).toBeNull();
    });

    it('the icon unused for 21 days: asked again', async () => {
      browserSays([]);
      localStorage.setItem(KEY, JSON.stringify({ standaloneAt: Date.now() - 22 * DAY, real: false }));
      handOver();
      render(<InstallPopup screen="home" />);
      await settle();
      act(() => { vi.advanceTimersByTime(1600); });
      expect(ask()).not.toBeNull();
    });

    it('a reader who removed a real app and came back the same day (the reader of 2026-11-20): asked at once', async () => {
      browserSays([]);
      localStorage.setItem(KEY, JSON.stringify({ standaloneAt: Date.now() - 3600000, real: true }));
      handOver();
      render(<InstallPopup screen="home" />);
      await settle();
      act(() => { vi.advanceTimersByTime(1600); });
      expect(ask().querySelector('.install-ask-go').textContent).toBe('Install');
    });

    it('a computer whose Chrome offers to install has no app: asked', async () => {
      ua = UA.chromeDesktop;
      localStorage.setItem(KEY, JSON.stringify({ standaloneAt: Date.now() - 3600000 }));
      handOver();
      render(<InstallPopup screen="home" />);
      await settle();
      act(() => { vi.advanceTimersByTime(1600); });
      expect(ask()).not.toBeNull();
    });

    it('a computer whose Chrome does not offer, the app\'s window used lately: not told about the address bar', async () => {
      ua = UA.chromeDesktop;
      localStorage.setItem(KEY, JSON.stringify({ standaloneAt: Date.now() - 3600000 }));
      render(<InstallPopup screen="home" />);
      await settle();
      act(() => { vi.advanceTimersByTime(20000); });
      expect(ask()).toBeNull();
    });
  });
});

describe('InstallRow: Settings > Help > Install VOTReader', () => {
  it('shows where this browser can install, and opens the steps for it', () => {
    const { getByRole } = render(<InstallRow />);
    act(() => { fireEvent.click(getByRole('button', { name: /Install VOTReader/ })); });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.querySelector('.install-steps-title').textContent).toBe('Add to Home Screen');
  });

  it('shows no row in the APK, an installed app or Firefox desktop; on a computer it goes once Chrome says installed', () => {
    globalThis.PlatformBridge.isAndroid = true;
    let v = render(<InstallRow />);
    expect(v.container.querySelector('.settings-help-install')).toBeNull(); cleanup();
    globalThis.PlatformBridge.isAndroid = false;
    globalThis.StorageHealth._isStandalone = () => true;
    v = render(<InstallRow />);
    expect(v.container.querySelector('.settings-help-install')).toBeNull(); cleanup();
    globalThis.StorageHealth._isStandalone = () => false;
    ua = UA.firefoxDesktop;
    v = render(<InstallRow />);
    expect(v.container.querySelector('.settings-help-install')).toBeNull(); cleanup();
    ua = UA.chromeDesktop;
    attachInstallCapture(window);
    v = render(<InstallRow />);
    expect(v.container.querySelector('.settings-help-install')).not.toBeNull();
    act(() => { window.dispatchEvent(new Event('appinstalled')); });
    expect(v.container.querySelector('.settings-help-install')).toBeNull();
  });

  /* 2026-11-20, walked on Android 16 / Chrome 133 / Pixel launcher: Chrome answers accepted and fires
     appinstalled BEFORE the phone's own "Add to home screen" box is answered; Cancel or Back there leaves no
     icon. The row used to vanish at that moment and the reader was left with nothing. */
  it('on Android the row stays after Chrome says installed: the phone may not have added the icon', () => {
    ua = UA.android;
    attachInstallCapture(window);
    const v = render(<InstallRow />);
    act(() => { window.dispatchEvent(new Event('appinstalled')); });
    expect(v.container.querySelector('.settings-help-install')).not.toBeNull();
  });

  it('with the browser own prompt in hand, a tap opens that dialog', async () => {
    ua = UA.android;
    attachInstallCapture(window);
    const prompt = vi.fn(() => Promise.resolve());
    const e = new Event('beforeinstallprompt');
    e.prompt = prompt; e.userChoice = Promise.resolve({ outcome: 'accepted' });
    act(() => { window.dispatchEvent(e); });
    const { getByRole } = render(<InstallRow />);
    await act(async () => { fireEvent.click(getByRole('button', { name: /Install VOTReader/ })); await Promise.resolve(); await Promise.resolve(); });
    expect(prompt).toHaveBeenCalledTimes(1);
    // On a phone Chrome's yes is not yet an icon: the offer waits 21 days, it does not end.
    expect(JSON.parse(localStorage.getItem(KEY)).installedAt).toBeGreaterThan(0);
    expect(JSON.parse(localStorage.getItem(KEY)).snoozeUntil).toBeGreaterThan(Date.now());
    expect(JSON.parse(localStorage.getItem(KEY)).never).toBeUndefined();
  });

  it('Android, after Install: says what the phone asks next and where the icon lands; the row stays for a second try', async () => {
    ua = UA.android;
    attachInstallCapture(window);
    const e = new Event('beforeinstallprompt');
    e.prompt = vi.fn(() => Promise.resolve()); e.userChoice = Promise.resolve({ outcome: 'accepted' });
    act(() => { window.dispatchEvent(e); });
    const { getByRole, container } = render(<InstallRow />);
    await act(async () => { fireEvent.click(getByRole('button', { name: /Install VOTReader/ })); await Promise.resolve(); await Promise.resolve(); });
    act(() => { window.dispatchEvent(new Event('appinstalled')); });   // Chrome fires it before the phone's box is answered
    const sheet = document.querySelector('.install-steps');
    expect(sheet.getAttribute('role')).toBe('dialog');
    expect(sheet.querySelector('.install-steps-title').textContent).toBe('Almost done');
    expect([...sheet.querySelectorAll('.install-step-title')].map((t) => t.textContent))
      .toEqual(['Tap Add to home screen', 'Look on your home screen', 'Not there?', 'Still not there?']);
    expect(sheet.querySelector('.install-step-note').textContent).toMatch(/Cancel leaves no icon/);
    // Android 17's launcher puts the new icon on the second home page (walked 2026-11-20): the note says to look there.
    expect(sheet.querySelectorAll('.install-step-note')[1].textContent).toBe('Swipe sideways too: many phones put a new icon on the second page. It can take a minute.');
    expect(sheet.querySelectorAll('.install-step-note')[2].textContent).toMatch(/list of apps/);
    // Where the launcher holds the button's icon back (Android 16 QPR1 and later, GrapheneOS), dragging places it.
    expect(sheet.querySelectorAll('.install-step-note')[3].textContent).toBe('Install again: Settings, then Install VOTReader. When the box in the picture comes up, press and hold the icon in it and drag it onto your home screen.');
    // The phone's own box is pictured; the second step is words only and takes the picture's room.
    expect([...sheet.querySelectorAll('.install-step img')].map((i) => i.getAttribute('src'))).toEqual(['install/android-4.jpg']);
    expect(sheet.querySelectorAll('.install-step')[1].classList.contains('install-step-plain')).toBe(true);
    act(() => { fireEvent.click(sheet.querySelector('.install-steps-done')); });
    expect(document.querySelector('.install-steps')).toBeNull();
    // Chrome's event is used up: a second tap shows the steps by hand.
    expect(container.querySelector('.settings-help-install')).not.toBeNull();
    act(() => { fireEvent.click(getByRole('button', { name: /Install VOTReader/ })); });
    expect(document.querySelectorAll('.install-step').length).toBe(4);
  });

  it('a computer, after Install: nothing more to say (Chrome opens the app in its own window)', async () => {
    ua = UA.chromeDesktop;
    attachInstallCapture(window);
    const e = new Event('beforeinstallprompt');
    e.prompt = vi.fn(() => Promise.resolve()); e.userChoice = Promise.resolve({ outcome: 'accepted' });
    act(() => { window.dispatchEvent(e); });
    const { getByRole } = render(<InstallRow />);
    await act(async () => { fireEvent.click(getByRole('button', { name: /Install VOTReader/ })); await Promise.resolve(); await Promise.resolve(); });
    expect(document.querySelector('.install-steps')).toBeNull();
  });

  /* 2026-11-20: a reader tapped the link in Messenger: the app "showed up but didn't install", and Settings had
     no Install row at all. Messenger's browser cannot install; the row now says where to go. */
  it('in Messenger\'s browser the row is there and sends the reader to Chrome, in words (no pictures)', () => {
    ua = UA.messengerAndroid;
    const { getByRole } = render(<InstallRow />);
    act(() => { fireEvent.click(getByRole('button', { name: /Install VOTReader/ })); });
    const sheet = document.querySelector('.install-steps');
    expect(sheet.querySelector('.install-steps-title').textContent).toBe('Open in Chrome first');
    expect(sheet.querySelector('.install-steps-intro').textContent).toMatch(/Messenger or Facebook.*cannot add VOTReader/);
    expect([...sheet.querySelectorAll('.install-step-title')].map((t) => t.textContent))
      .toEqual(['Tap the menu', 'Tap Open in Chrome', 'Come back here in Chrome']);
    expect(sheet.querySelectorAll('.install-step img').length).toBe(0);
    expect(sheet.querySelectorAll('.install-step-plain').length).toBe(3);
  });

  it('on an iPhone in Messenger it says Safari', () => {
    ua = UA.messengerIphone;
    const { getByRole } = render(<InstallRow />);
    act(() => { fireEvent.click(getByRole('button', { name: /Install VOTReader/ })); });
    expect(document.querySelector('.install-steps-title').textContent).toBe('Open in Safari first');
    expect(document.querySelectorAll('.install-step-note')[2].textContent).toBe('Settings, then Install VOTReader.');
    expect([...document.querySelectorAll('.install-step-title')].map((t) => t.textContent))
      .toEqual(['Tap the menu', 'Tap Open in Safari', 'Come back here in Safari']);
  });
});

/* Corbin 2026-11-21: "Be careful with firefox and safari, we don't want to install over a preexisting pwa". Looked up
   the same day: only Chromium answers getInstalledRelatedApps or sends an install event; Safari and Firefox tell a page
   nothing, and an iPhone's or a Mac's installed copy keeps its own storage, so a Safari tab cannot even leave itself a
   note. Adding it again there makes a second copy that starts empty. So where the browser cannot say, the popup warns
   about a second copy and takes the reader's word. */
describe('InstallPopup: where the browser cannot say whether the app is installed', () => {
  const DAY = 86400000;
  const ask = () => document.querySelector('.install-ask');
  const have = () => [...ask().querySelectorAll('button')].find((b) => b.textContent === 'I already have it');
  const popup = (state) => {
    cleanup(); _resetInstallPopupSession(); _resetInstallCapture();
    if (state) localStorage.setItem(KEY, JSON.stringify(state)); else localStorage.removeItem(KEY);
    render(<InstallPopup screen="home" />);
    act(() => { vi.advanceTimersByTime(9000); });
    return ask();
  };
  beforeEach(() => { vi.useFakeTimers(); _resetInstallPopupSession(); readItems = EARNED; });
  afterEach(() => { vi.useRealTimers(); });

  it('Safari on an iPhone warns that adding it again makes a second, empty copy', () => {
    ua = UA.iphone;
    expect(popup(null).querySelector('.install-ask-have-note').textContent)
      .toBe('Already on your Home Screen? Open it there. Adding it again makes a second copy that starts empty.');
  });
  it('Safari on a Mac says Dock', () => {
    ua = UA.macSafari;
    expect(popup(null).querySelector('.install-ask-have-note').textContent)
      .toBe('Already in your Dock? Open it there. Adding it again makes a second copy that starts empty.');
  });
  it('Firefox on Android says only to open the one that is there', () => {
    ua = UA.firefoxAndroid;
    expect(popup(null).querySelector('.install-ask-have-note').textContent).toBe('Already on your Home screen? Open it there.');
  });
  it('"I already have it" closes the popup, is written down, and is no Not now', () => {
    ua = UA.iphone;
    popup({ dismissals: 1 });
    act(() => { fireEvent.click(have()); });
    expect(ask()).toBeNull();
    const s = JSON.parse(localStorage.getItem(KEY));
    expect(s.dismissals).toBe(1);   // the showing counted itself, and "I already have it" takes it back
    expect(s.haveAt).toBeGreaterThan(0);
    expect(s.snoozeUntil).toBeGreaterThan(Date.now() + 179 * DAY);
  });
  it('a reader who said so is not asked again at 21 days, and is at 180', () => {
    ua = UA.iphone;
    const at = Date.now();
    expect(popup({ haveAt: at - 22 * DAY, snoozeUntil: at + 158 * DAY })).toBeNull();
    expect(popup({ haveAt: at - 181 * DAY, snoozeUntil: at - DAY })).not.toBeNull();
  });
  it('a browser that hands over its install is not asked for the reader\'s word: it can tell', () => {
    ua = UA.android;
    cleanup(); _resetInstallPopupSession(); _resetInstallCapture();
    attachInstallCapture(window);
    const e = new Event('beforeinstallprompt');
    e.prompt = vi.fn(() => Promise.resolve()); e.userChoice = Promise.resolve({ outcome: 'dismissed' });
    act(() => { window.dispatchEvent(e); });
    render(<InstallPopup screen="home" />);
    act(() => { vi.advanceTimersByTime(9000); });
    expect([...ask().querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Install', 'Not now']);
    expect(ask().querySelector('.install-ask-have-note')).toBeNull();
  });
});
