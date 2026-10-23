// @ts-nocheck - ScreenLayout / LibraryNav / OfflineAudio are free globals, as in ReadingPlansScreen.test.jsx
/* mw18 S6: Plan details saves the next 7 days' recordings to the phone, each chapter or letter its own recording,
   through the same confirm as a collection's Download all. Only where downloads work. */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { ReadingPlansScreen } from './ReadingPlansScreen.jsx';
import { ReadingPlanStore } from '../../stores/reading-plan-store.js';
import { startCatalogPlan } from '../../data/plan-catalog.js';
import { dayItems } from '../../data/plan-engine.js';

const U = (k) => 'https://example.test/audio/' + k + '.mp3';

/** The parts of utils/offline-audio.js's OfflineAudio that the controls read. */
function fakeStore() {
  const listeners = new Set();
  const st = { saved: new Set(), v: 0 };
  const s = {
    st,
    bump: () => { st.v++; for (const cb of listeners) cb(); },
    subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    getVersion: () => st.v,
    available: () => true,
    refresh: vi.fn(),
    statusOf: (u) => (st.saved.has(u) ? 'saved' : 'none'),
    sizeOf: () => 1e6,
    progressOf: () => null,
    failureOf: () => null,
    freeBytes: () => 5e9,
    waiting: () => false,
    requestSizes: vi.fn(),
    download: vi.fn(() => true),
    cancel: vi.fn(),
  };
  globalThis.OfflineAudio = s;
  return s;
}

beforeEach(() => {
  globalThis.ScreenLayout = ({ children }) => <main>{children}</main>;
  globalThis.LibraryNav = () => null;
  globalThis.ConfirmStrip = () => null;
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
  localStorage.clear();
  ReadingPlanStore._resetForTests({ forceLoaded: true });
  globalThis.ReadingPlanStore = ReadingPlanStore;
});
afterEach(() => { cleanup(); delete globalThis.ReadingPlanStore; delete globalThis.OfflineAudio; });

const base = (o) => ({ readingPlans: [], isRead: () => false, onPlansMoved: vi.fn(), onRead: vi.fn(), onBack: vi.fn(), ...o });
const planTracks = vi.fn((refs) => refs.map((r) => ({ url: U(r.bid + '-' + r.cid), key: r.bid + ':' + r.cid, title: r.bid + ' ' + r.cid })));

describe('Download this week’s audio (S6; one verb, Download, brief section 7 item 13)', () => {
  it('is not offered where downloads do not work', () => {
    ReadingPlanStore.put(startCatalogPlan('bible-year', null, new Date()));
    render(<ReadingPlansScreen {...base({ planTracks })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plan details' }));
    expect(screen.queryByRole('button', { name: /(Save|Download) this week/ })).toBeNull();
  });

  it('asks first, then saves the next 7 days, one recording per chapter', () => {
    const off = fakeStore();
    const run = startCatalogPlan('bible-year', null, new Date());
    ReadingPlanStore.put(run);
    render(<ReadingPlansScreen {...base({ planTracks })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plan details' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download this week’s audio' }));
    const week = [0, 1, 2, 3, 4, 5, 6].flatMap((d) => dayItems(run, d));
    expect(screen.getByText('Download the next 7 days of your plan?')).toBeTruthy();
    expect(screen.getByText(week.length + ' recordings · ' + week.length + ' MB')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Download \d+ MB$/ }));
    const sent = off.download.mock.calls[0][0];
    expect(sent.length).toBe(week.length);
    expect(sent[0]).toEqual({ url: U('genesis-1'), key: 'genesis:1', title: 'genesis 1' });
  });

  it('says so once the week is on the phone', () => {
    const off = fakeStore();
    const run = startCatalogPlan('bible-year', null, new Date());
    ReadingPlanStore.put(run);
    for (let d = 0; d < 7; d++) for (const it of dayItems(run, d)) off.st.saved.add(U(it.k.replace(':', '-')));
    render(<ReadingPlansScreen {...base({ planTracks })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plan details' }));
    expect(screen.getByText('This week’s audio is on this phone')).toBeTruthy();
  });
});

describe('Keep the next 7 days on this phone (dl-d5, call 5A: on by default)', () => {
  afterEach(() => { delete window.AndroidBridge; });

  it('a running plan shows the switch on; turning it off is kept on the plan', () => {
    fakeStore();
    window.AndroidBridge = { offlineAudioWifiOnly: () => {} };   // the phone app: it can tell Wi-Fi from mobile data
    const run = startCatalogPlan('bible-year', null, new Date());
    ReadingPlanStore.put(run);
    render(<ReadingPlansScreen {...base({ planTracks })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plan details' }));
    const sw = screen.getByRole('checkbox', { name: 'Keep the next 7 days on this phone (on Wi-Fi)' });
    expect(sw.checked).toBe(true);
    fireEvent.click(sw);
    expect(ReadingPlanStore.get(run.id).autoAudio).toBe(false);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Keep the next 7 days on this phone (on Wi-Fi)' }));
    expect(ReadingPlanStore.get(run.id).autoAudio).toBe(true);
    expect(screen.getByRole('button', { name: 'Download this week’s audio' })).toBeTruthy();   // the manual button stays
  });

  it('is not shown where the app cannot tell Wi-Fi from mobile data', () => {
    fakeStore();
    ReadingPlanStore.put(startCatalogPlan('bible-year', null, new Date()));
    render(<ReadingPlansScreen {...base({ planTracks })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plan details' }));
    expect(screen.queryByRole('checkbox', { name: /Keep the next 7 days/ })).toBeNull();
  });
});
