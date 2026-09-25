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
import { InstallCard, _resetInstallCardSession } from './InstallCard.jsx';
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
    expect(btn.textContent).toBe('Install VOTReader');
    await act(async () => { fireEvent.click(btn); await Promise.resolve(); await Promise.resolve(); });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(card(container)).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY))).toMatchObject({ never: true });
  });
});

describe('InstallCard: saying no', () => {
  it('Maybe later hides it and snoozes it; the X is the same', () => {
    let v = render(<InstallCard unitKey="a" />);
    act(() => { fireEvent.click(card(v.container).querySelector('.install-card-later')); });
    expect(card(v.container)).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY)).snoozeUntil).toBeGreaterThan(Date.now());
    cleanup(); _resetInstallCardSession();
    v = render(<InstallCard unitKey="a" />);
    expect(card(v.container), 'snoozed').toBeNull();
    cleanup(); _resetInstallCardSession(); localStorage.removeItem(KEY);
    v = render(<InstallCard unitKey="a" />);
    act(() => { fireEvent.click(card(v.container).querySelector('.install-card-close')); });
    expect(JSON.parse(localStorage.getItem(KEY))).toMatchObject({ dismissals: 1 });
  });

  it('Don\'t ask again ends it for good', () => {
    const v = render(<InstallCard unitKey="a" />);
    act(() => { fireEvent.click(card(v.container).querySelector('.install-card-never')); });
    expect(card(v.container)).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY))).toMatchObject({ never: true });
  });
});
