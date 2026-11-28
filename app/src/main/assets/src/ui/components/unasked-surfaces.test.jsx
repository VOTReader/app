// @ts-nocheck — free-var globals stubbed per test
/* newcomer (2026-11-27): every unasked surface mounted together, the way the app mounts them (Home under the shell's
   overlays), over whole sessions: two never show in one session, whichever is due. utils/unasked.js is the gate. */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import React from 'react';
import * as ReactDOM from 'react-dom';
import { InstallPopup, _resetInstallPopupSession } from './InstallCard.jsx';
import { HomeScreen } from '../screens/HomeScreen.jsx';
import { NavButtons } from './NavButtons.jsx';
import { attachInstallCapture, _resetInstallCapture } from '../../utils/install-offer.js';
import { _resetUnasked, note, markFirstRunSession, spokeThisSession } from '../../utils/unasked.js';

const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const KEY = 'vot-install-offer';
let readItems;

beforeEach(async () => {
  vi.useFakeTimers();
  globalThis.ReactDOM = ReactDOM;
  Object.defineProperty(window.navigator, 'userAgent', { configurable: true, get: () => ANDROID });
  readItems = { a: 1, b: 1, c: 1 };
  globalThis.StateStore = { get: () => ({ readItems }), subscribe: () => () => {}, getVersion: () => 1 };
  globalThis.StorageHealth = { _isStandalone: () => false };
  globalThis.PlatformBridge = { isAndroid: false };
  globalThis.ScreenLayout = ({ children, navChildren, navEnd }) => <div><nav>{navChildren}{navEnd}</nav>{children}</div>;
  globalThis.ThemeBtn = () => null;
  globalThis.NavButtons = NavButtons;
  globalThis.HomeOrderStore = { get: () => ['volumes', 'scriptures', 'answers', 'studies'], set: () => {} };
  globalThis.translationLabel = () => 'NKJV';
  const { ReadingPlanStore } = await import('../../stores/reading-plan-store.js');
  ReadingPlanStore._resetForTests({ forceLoaded: true });
  window.ReadingPlanStore = ReadingPlanStore;
  localStorage.clear();
  _resetUnasked(); _resetInstallPopupSession(); _resetInstallCapture();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  ['StateStore', 'StorageHealth', 'PlatformBridge', 'ScreenLayout', 'ThemeBtn', 'NavButtons', 'HomeOrderStore', 'translationLabel'].forEach((k) => { delete globalThis[k]; });
  delete window.ReadingPlanStore;
  localStorage.clear();
  _resetUnasked();
});

/** One session on Home: the shell's overlays and the screen, as the app draws them, for `ms`. */
function session(ms = 10000) {
  cleanup(); _resetUnasked(); _resetInstallPopupSession(); _resetInstallCapture();
  attachInstallCapture(window);
  const e = new Event('beforeinstallprompt'); e.prompt = vi.fn(() => Promise.resolve()); e.userChoice = Promise.resolve({ outcome: 'dismissed' });
  act(() => { window.dispatchEvent(e); });
  const v = render(<><HomeScreen onSelect={() => {}} onSurprise={() => {}} showSurprise onSettings={() => {}} onSearch={() => {}} historyEnabled history={[]} readingPlans={[]} isRead={() => false} translation="nkjv" /><InstallPopup screen="home" /></>);
  act(() => { vi.advanceTimersByTime(ms); });
  return {
    install: !!document.querySelector('.install-ask'),
    plan: (v.container.textContent || '').includes('Start a reading plan'),
    tour: !!document.querySelector('.tour-prompt'),
  };
}
const count = (s) => [s.install, s.plan, s.tour].filter(Boolean).length;

describe('one unasked surface a session, all of them mounted', () => {
  it('install and the plan offer both due: install shows, the plan waits', () => {
    const s = session();
    expect(s).toEqual({ install: true, plan: false, tour: false });
  });
  it('the next session (install resting 21 days after its showing): the plan offer, alone', () => {
    session();
    const s = session();
    expect(s).toEqual({ install: false, plan: true, tour: false });
  });
  it('after What\'s new showed this session: neither', () => {
    cleanup(); _resetUnasked();
    note('whats-new');
    // a session that already spoke: mount without resetting the gate
    attachInstallCapture(window);
    const v = render(<><HomeScreen onSelect={() => {}} onSurprise={() => {}} showSurprise onSettings={() => {}} onSearch={() => {}} historyEnabled history={[]} readingPlans={[]} isRead={() => false} translation="nkjv" /><InstallPopup screen="home" /></>);
    act(() => { vi.advanceTimersByTime(10000); });
    expect(document.querySelector('.install-ask')).toBeNull();
    expect(v.container.textContent).not.toContain('Start a reading plan');
    expect(spokeThisSession()).toBe('whats-new');
  });
  it('the welcome\'s session: nothing at all, however much was read', () => {
    cleanup(); _resetUnasked();
    markFirstRunSession();
    const v = render(<><HomeScreen onSelect={() => {}} onSurprise={() => {}} showSurprise onSettings={() => {}} onSearch={() => {}} historyEnabled history={[]} readingPlans={[]} isRead={() => false} translation="nkjv" /><InstallPopup screen="home" /></>);
    act(() => { vi.advanceTimersByTime(10000); });
    expect(document.querySelector('.install-ask')).toBeNull();
    expect(v.container.textContent).not.toContain('Start a reading plan');
  });
  it('nothing read: nothing', () => {
    readItems = {};
    expect(count(session())).toBe(0);
  });
  it('over ten sessions, never two in one', () => {
    for (let i = 0; i < 10; i++) {
      const s = session();
      expect(count(s), 'session ' + i).toBeLessThanOrEqual(1);
      expect(s.tour).toBe(false);
    }
    expect(JSON.parse(localStorage.getItem(KEY)).dismissals).toBe(1);   // one showing; resting 21 days since
  });
});
