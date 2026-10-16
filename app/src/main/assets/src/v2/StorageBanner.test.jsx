/* The storage strip (mw7, v2-gaps 33; design dz15 9f, 9g; main's StorageHealthBanner): main's order and words, design's
   two kinds, the head line, what each button does on a real boot (main's DataSafety and StorageHealth, Export to Your
   data), and the two gate rows drawn inert under the top bar. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { V2App, applyGateScroll } from './App.jsx';
import { GATE_STATES } from './gate.js';
import { pickBanner, splitHead, StorageBanner, TIER, offlineView } from './StorageBanner.jsx';
import './screens/LetterScreen.jsx';
import './screens/CollectionScreen.jsx';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const settle = (ms = 30) => act(() => new Promise((r) => { setTimeout(r, ms); }));
const button = (root, label) => [...root.querySelectorAll('.shb button')].find((b) => (b.textContent || b.getAttribute('aria-label')) === label);

const SNAP_AT = new Date(2026, 9, 13, 12).getTime();
const ON_13 = new Date(SNAP_AT).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
const MISSING = { name: 'auto', at: SNAP_AT, then: { highlights: 55, notes: 6, readMarks: 627 }, now: { highlights: 2, readMarks: 41 } };
/** every scenario at once: main's order decides which one shows */
const ALL = { versionTooNew: true, libraryElsewhere: 'changed', dataMissing: MISSING, tier: TIER.READONLY, writeFailedThisSession: true,
  privateModeLikely: true, storesDegraded: true, remaining: 1024 };

/** bundle-b's StorageHealth as v2 reads it: a report, a change signal, main's dismissals */
function fakeHealth(report) {
  const listeners = new Set();
  const dismissed = new Set();
  const H = {
    v: 0, report,
    subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    getVersion: () => H.v,
    getReport: () => H.report,
    isDismissed: (id) => dismissed.has(id),
    dismissScenario: vi.fn((id) => { dismissed.add(id); H.changed(); }),
    changed: () => act(() => { H.v += 1; listeners.forEach((cb) => cb()); }),
  };
  g.StorageHealth = H;
  return H;
}

afterEach(() => {
  cleanup();
  for (const k of ['StorageHealth', 'OfflineLibrary', 'DataSafety', 'PlatformBridge', 'COLLECTIONS', 'COL_BY_KEY', 'LETTERS_V1', 'StateStore', 'HistoryStore', 'matchMedia']) delete g[k];
  delete html.dataset.gate;
  vi.restoreAllMocks();
});

describe('pickBanner (main\'s _pickScenario: its order, its words)', () => {
  it('shows the most serious one only: newer version > another tab > data missing > save failed > private > almost full > low > slow', () => {
    const order = [];
    const r = { ...ALL };
    // readonly without a failed save is no strip of its own: with private mode gone it falls through to slow
    for (const peel of [() => delete r.versionTooNew, () => delete r.libraryElsewhere, () => delete r.dataMissing,
      () => delete r.writeFailedThisSession, () => delete r.privateModeLikely, () => { r.tier = TIER.CRITICAL; },
      () => { r.tier = TIER.WARNING; }, () => delete r.tier, () => delete r.storesDegraded]) {
      const b = pickBanner(r);
      order.push(b ? b.id : null);
      peel();
    }
    expect(order).toEqual(['newer-version', 'library-elsewhere', 'data-missing', 'write-failed', 'private-mode', 'storage-slow',
      'critical', 'warning', 'storage-slow']);
    expect(pickBanner(r)).toBe(null);
    expect(pickBanner(null)).toBe(null);
    expect(pickBanner({ tier: TIER.READONLY })).toBe(null);
    // a failed save is "storage is full" only when the store says it is read-only (main: else it is another strip's)
    expect(pickBanner({ writeFailedThisSession: true })).toBe(null);
    expect(pickBanner({ writeFailedThisSession: true, tier: TIER.CRITICAL }).id).toBe('critical');
  });

  it('a dismissed "data looks missing" steps aside for the next one; nothing else can be dismissed', () => {
    const r = { dataMissing: MISSING, tier: TIER.WARNING, remaining: 38 * 1024 * 1024 };
    expect(pickBanner(r)).toMatchObject({ id: 'data-missing', dismissable: true });
    expect(pickBanner(r, { dismissed: (id) => id === 'data-missing' }).id).toBe('warning');
    expect(pickBanner({ tier: TIER.CRITICAL }, { dismissed: () => true }).id).toBe('critical');
    const others = [{ versionTooNew: true }, { libraryElsewhere: 'changing' }, { tier: TIER.READONLY, writeFailedThisSession: true },
      { privateModeLikely: true }, { tier: TIER.CRITICAL }, { tier: TIER.WARNING }, { storesDegraded: true }];
    expect(others.map((x) => pickBanner(x).dismissable)).toEqual([false, false, false, false, false, false, false]);
  });

  it('main\'s words, with its numbers: the snapshot\'s date and counts, formatBytes\' size, its fallbacks', () => {
    expect(pickBanner({ dataMissing: MISSING }).text).toBe('Some of your data looks missing. On ' + ON_13 + ' you had 55 highlights, 6 notes, '
      + '627 read marks; now 2 highlights, 41 read marks. Restore adds back what is missing and keeps everything you have made since.');
    expect(pickBanner({ dataMissing: { at: SNAP_AT, then: { notes: 1, journal: 1, links: 2, bookmarks: 1 }, now: {} } }).text)
      .toContain('you had 1 note, 2 links, 1 bookmark, 1 journal entry; now nothing saved.');
    expect(pickBanner({ tier: TIER.WARNING, remaining: 38 * 1024 * 1024 }).text)
      .toBe('Storage is running low — 38.0 MB remaining. New notes and recordings may not save.');
    expect(pickBanner({ tier: TIER.WARNING }).text).toBe('Storage is running low — limited space remaining. New notes and recordings may not save.');
    expect(pickBanner({ tier: TIER.CRITICAL }).text)
      .toBe('Storage is almost full — very little remaining. Your data may not save. Export now to avoid losing it.');
    expect(pickBanner({ libraryElsewhere: 'changing' }).text).toBe("Your library is being changed in another tab (a backup restore or Clear All). Changes you make here won't be saved. Reload this tab when it's done.");
    expect(pickBanner({ libraryElsewhere: 'changed' }).text).toBe("Your library was changed in another tab. Reload to see it. Changes you make here won't be saved.");
    expect(pickBanner({ privateModeLikely: true }).text).toBe("You're in a private window. Nothing you save here will be kept when you close it.");
    expect(pickBanner({ storesDegraded: true }).text).toBe('Storage is slow to load. Your saved library will appear once it catches up; your place and settings changed before then may not be kept.');
  });

  it('design\'s two kinds: danger when data is at risk now, warn when it is time to act soon (private window too)', () => {
    const kind = (r) => pickBanner(r).kind;
    expect([{ versionTooNew: true }, { libraryElsewhere: 'changed' }, { dataMissing: MISSING }, { tier: TIER.READONLY, writeFailedThisSession: true },
      { tier: TIER.CRITICAL }].map(kind)).toEqual(['danger', 'danger', 'danger', 'danger', 'danger']);
    expect([{ privateModeLikely: true }, { tier: TIER.WARNING }, { storesDegraded: true }].map(kind)).toEqual(['warn', 'warn', 'warn']);
  });

  it('main\'s buttons: Reload on the web, none in the phone app (install the latest there); Export where storage runs out', () => {
    const labels = (r, env) => pickBanner(r, env).buttons.map((b) => b.label + ':' + b.act);
    expect(labels({ versionTooNew: true })).toEqual(['Reload:reload']);
    expect(pickBanner({ versionTooNew: true }).text).toContain('reload VOTReader to get the latest version.');
    expect(labels({ versionTooNew: true }, { android: true })).toEqual([]);
    expect(pickBanner({ versionTooNew: true }, { android: true }).text).toContain('Nothing on this device has been lost: install the latest version.');
    expect(labels({ libraryElsewhere: 'changed' }, { android: true })).toEqual(['Reload:reload']);
    expect(labels({ dataMissing: MISSING })).toEqual(['Restore:restore', 'Keep as is:keep']);
    expect(labels({ tier: TIER.READONLY, writeFailedThisSession: true })).toEqual(['Export now:export']);
    expect(labels({ tier: TIER.CRITICAL })).toEqual(['Export now:export']);
    expect(labels({ tier: TIER.WARNING })).toEqual(['Export data:export']);
    expect(labels({ privateModeLikely: true })).toEqual([]);
    expect(labels({ storesDegraded: true })).toEqual([]);
  });
});

describe('splitHead (the strip\'s head line)', () => {
  it('takes the first sentence, a dash and a number inside it included, and keeps the rest whole', () => {
    expect(splitHead('Storage is running low — 38.0 MB remaining. New notes and recordings may not save.'))
      .toEqual(['Storage is running low — 38.0 MB remaining.', 'New notes and recordings may not save.']);
    expect(splitHead("Your library was changed in another tab. Reload to see it. Changes you make here won't be saved."))
      .toEqual(['Your library was changed in another tab.', "Reload to see it. Changes you make here won't be saved."]);
    expect(splitHead('One sentence only.')).toEqual(['One sentence only.', '']);
    expect(splitHead('No stop at all')).toEqual(['No stop at all', '']);
  });
});

describe('StorageBanner on a real boot (bundle-b\'s StorageHealth and DataSafety)', () => {
  it('nothing while all is well; the strip comes and goes as the report changes', async () => {
    const H = fakeHealth(null);
    const { container } = render(<StorageBanner gate={null} go={vi.fn()} />);
    expect(container.querySelector('.shb')).toBe(null);
    H.report = { tier: TIER.WARNING, remaining: 38 * 1024 * 1024 };
    await H.changed();
    const strip = container.querySelector('.shb');
    expect(strip.className).toBe('shb warn');
    expect(strip.getAttribute('role')).toBe('alert');
    expect(strip.getAttribute('data-banner')).toBe('warning');
    expect(strip.querySelector('.shb-h').textContent).toBe('Storage is running low — 38.0 MB remaining.');
    expect(strip.querySelector('.shb-t').textContent).toBe('Storage is running low — 38.0 MB remaining. New notes and recordings may not save.');
    H.report = {};
    await H.changed();
    expect(container.querySelector('.shb')).toBe(null);
  });

  it('a report that throws shows nothing (the page stays usable)', () => {
    fakeHealth(null).getReport = () => { throw new Error('not ready'); };
    const { container } = render(<StorageBanner gate={null} go={vi.fn()} />);
    expect(container.querySelector('.shb')).toBe(null);
  });

  it('data looks missing: Restore and Keep as is are main\'s; the x dismisses it as main does and the strip goes', async () => {
    const H = fakeHealth({ dataMissing: MISSING });
    g.DataSafety = { restoreMissing: vi.fn(() => Promise.resolve()), acceptCurrent: vi.fn(() => Promise.reject(new Error('busy'))) };
    const { container } = render(<StorageBanner gate={null} go={vi.fn()} />);
    expect(container.querySelector('.shb').className).toBe('shb danger dis');
    expect([...container.querySelectorAll('.shb-a button')].map((b) => b.className + ':' + b.textContent)).toEqual(['pill:Restore', 'btn2:Keep as is']);
    await click(button(container, 'Restore'));
    expect(g.DataSafety.restoreMissing).toHaveBeenCalledTimes(1);
    await click(button(container, 'Keep as is'));
    expect(g.DataSafety.acceptCurrent).toHaveBeenCalledTimes(1);
    await settle(0);
    await click(button(container, 'Dismiss'));
    expect(H.dismissScenario).toHaveBeenCalledWith('data-missing');
    expect(container.querySelector('.shb')).toBe(null);
  });

  it('Export goes to Settings > Your data; the phone app\'s newer-version strip has no button', async () => {
    fakeHealth({ tier: TIER.CRITICAL, remaining: 2 * 1024 * 1024 });
    const go = vi.fn();
    const { container, unmount } = render(<StorageBanner gate={null} go={go} />);
    expect(container.querySelector('.shb').className).toBe('shb danger');
    await click(button(container, 'Export now'));
    expect(go).toHaveBeenCalledWith({ place: 'settings/your-data' });
    expect(container.querySelector('.shb .ic.x')).toBe(null);
    unmount();
    fakeHealth({ versionTooNew: true });
    g.PlatformBridge = { isAndroid: true };
    const app = render(<StorageBanner gate={null} go={go} />);
    expect(app.container.querySelector('.shb').getAttribute('data-banner')).toBe('newer-version');
    expect(app.container.querySelector('.shb-a')).toBe(null);
  });
});

describe('the gate rows (9f, 9g): drawn from the row under the top bar, inert', () => {
  const ONE = { volKey: 'one', label: 'Volume One', globalName: 'LETTERS_V1' };
  function installCorpus() {
    g.COLLECTIONS = [ONE];
    g.COL_BY_KEY = new Map([['one', ONE]]);
    g.LETTERS_V1 = [{ id: 'chosen-by-god', num: 1, title: 'Chosen by God', blocks: [{ type: 'p', text: 'Thus says The Lord to His servant.' }] },
      { id: 'honor', num: 2, title: 'Honor', blocks: [{ type: 'p', text: 'x' }] }];
  }

  it('the rows hold main\'s report parts', () => {
    expect(GATE_STATES['9f-data-missing'].facts.storage.dataMissing).toEqual(MISSING);
    expect(GATE_STATES['9g-storage-low'].facts.storage).toEqual({ tier: 'warning', remaining: 38 * 1024 * 1024 });
    expect(GATE_STATES['1f-footnotes'].scroll).toEqual({ to: '.body .fnl', gap: 5, deskGap: 63 });
  });

  it('9f: Home under the danger strip; Restore, Keep as is and the x do nothing; the live report is not read', async () => {
    installCorpus();
    const H = fakeHealth({ tier: TIER.WARNING, remaining: 1 });
    g.DataSafety = { restoreMissing: vi.fn(), acceptCurrent: vi.fn() };
    const { container } = render(<V2App gateId="9f-data-missing" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    const strip = container.querySelector('.shb');
    expect(strip.className).toBe('shb danger dis');
    expect(strip.previousElementSibling.classList.contains('tb')).toBe(true);
    expect(strip.querySelector('.shb-h').textContent).toBe('Some of your data looks missing.');
    for (const label of ['Restore', 'Keep as is', 'Dismiss']) await click(button(container, label));
    expect(g.DataSafety.restoreMissing).not.toHaveBeenCalled();
    expect(g.DataSafety.acceptCurrent).not.toHaveBeenCalled();
    expect(H.dismissScenario).not.toHaveBeenCalled();
    expect(container.querySelectorAll('.shb')).toHaveLength(1);
  });

  it('9g: Volume One, Letter 1 under the warn strip; Export data stays on the letter', async () => {
    installCorpus();
    const { container } = render(<V2App gateId="9g-storage-low" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(container.querySelector('.shb').className).toBe('shb warn');
    expect(container.querySelector('.shb-t').textContent).toBe('Storage is running low — 38.0 MB remaining. New notes and recordings may not save.');
    await click(button(container, 'Export data'));
    await settle();
    expect(container.querySelector('h1').textContent).toBe('Chosen by God');
  });
});

describe('applyGateScroll: deskGap', () => {
  it('the laptop takes deskGap where its picture puts the element elsewhere; the phone keeps gap', () => {
    const page = () => {
      const el = document.createElement('div');
      el.innerHTML = '<div class="col"><div class="tb"></div><div class="body"><div class="fnl"></div></div></div>';
      el.getBoundingClientRect = () => /** @type {any} */ ({ top: 0 });
      el.querySelector('.tb').getBoundingClientRect = () => /** @type {any} */ ({ bottom: 57 });
      el.querySelector('.fnl').getBoundingClientRect = () => /** @type {any} */ ({ top: 1057 });
      return el;
    };
    const row = GATE_STATES['1f-footnotes'].scroll;
    const desk = page();
    applyGateScroll(desk, row, true);
    expect(desk.scrollTop).toBe(1000 - 63);
    const phone = page();
    applyGateScroll(phone, row, false);
    expect(phone.scrollTop).toBe(1000 - 5);
    const plain = page();
    applyGateScroll(plain, { to: '.fnl', gap: 5 }, true);
    expect(plain.scrollTop).toBe(1000 - 5);
  });
});

/** bundle-d's OfflineLibrary as v2 reads it: main's state, its change signal, and the three calls the strip makes */
function fakeOffline(state) {
  const listeners = new Set();
  const L = {
    v: 0, state,
    subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    getVersion: () => L.v,
    getState: () => L.state,
    start: vi.fn(),
    retry: vi.fn(() => Promise.resolve('fixed')),
    dismiss: vi.fn(),
    set: (next) => act(() => { L.state = next; L.v += 1; listeners.forEach((cb) => cb()); }),
  };
  g.OfflineLibrary = L;
  return L;
}

describe('the offline library strip (dz25 9j; main\'s OfflineLibraryBanner in the storage strip\'s slot)', () => {
  it('main\'s words for each phase; nothing while unknown, complete or dismissed', () => {
    expect(offlineView({ phase: 'incomplete', missing: 3 })).toEqual({ lead: 'Offline library incomplete.', detail: '3 files did not download.', retry: true, close: true });
    expect(offlineView({ phase: 'incomplete', missing: 1 }).detail).toBe('1 file did not download.');
    expect(offlineView({ phase: 'retrying', missing: 3 })).toEqual({ lead: 'Downloading 3 missing files…', detail: '', retry: false, close: true });
    expect(offlineView({ phase: 'retrying', missing: 1 }).lead).toBe('Downloading 1 missing file…');
    expect(offlineView({ phase: 'fixed', missing: 0 })).toEqual({ lead: 'Offline library complete.', detail: '', retry: false, close: false });
    expect(offlineView({ phase: 'still', missing: 2 })).toEqual({ lead: 'Offline library incomplete.',
      detail: '2 files are still missing. Connect to the internet, then retry.', retry: true, close: true });
    expect(offlineView({ phase: 'still', missing: 1 }).detail).toBe('1 file is still missing. Connect to the internet, then retry.');
    for (const phase of ['unknown', 'complete', 'dismissed']) expect(offlineView({ phase, missing: 3 })).toBe(null);
    expect(offlineView(null)).toBe(null);
  });

  it('a real boot: gold information with Retry and the x, main\'s check started once; Retry and Dismiss are main\'s', async () => {
    fakeHealth({});
    const L = fakeOffline({ phase: 'incomplete', missing: 3 });
    const { container } = render(<StorageBanner gate={null} go={() => {}} />);
    const strip = container.querySelector('.shb');
    expect(strip.className).toBe('shb gold dis');
    expect(strip.getAttribute('role')).toBe('status');
    expect(strip.querySelector('.shb-h').textContent).toBe('Offline library incomplete.');
    expect(strip.querySelector('.shb-t').textContent).toBe('Offline library incomplete. 3 files did not download.');
    expect(L.start).toHaveBeenCalledTimes(1);
    await click(button(container, 'Retry'));
    expect(L.retry).toHaveBeenCalledTimes(1);
    L.set({ phase: 'retrying', missing: 3 });
    expect(container.querySelector('.shb-t').textContent).toBe('Downloading 3 missing files…');
    expect(button(container, 'Retry')).toBe(undefined);
    L.set({ phase: 'fixed', missing: 0 });
    expect(container.querySelector('.shb').className).toBe('shb gold');
    expect(container.querySelectorAll('.shb button')).toHaveLength(0);
    L.set({ phase: 'still', missing: 2 });
    await click(button(container, 'Dismiss'));
    expect(L.dismiss).toHaveBeenCalledTimes(1);
    L.set({ phase: 'dismissed', missing: 2 });
    expect(container.querySelector('.shb')).toBe(null);
  });

  it('data danger comes first: a storage strip takes the slot, and the offline one waits under it', async () => {
    const H = fakeHealth({ privateModeLikely: true });
    fakeOffline({ phase: 'incomplete', missing: 3 });
    const { container } = render(<StorageBanner gate={null} go={() => {}} />);
    expect(container.querySelectorAll('.shb')).toHaveLength(1);
    expect(container.querySelector('.shb').className).toBe('shb warn');
    H.report = {};
    H.changed();
    expect(container.querySelector('.shb').className).toBe('shb gold dis');
  });

  it('9j: Home under the gold strip, from the row; Retry and the x do nothing; the live library is not read', async () => {
    const ONE = { volKey: 'one', label: 'Volume One', globalName: 'LETTERS_V1' };
    g.COLLECTIONS = [ONE];
    g.COL_BY_KEY = new Map([['one', ONE]]);
    g.LETTERS_V1 = [{ id: 'chosen-by-god', num: 1, title: 'Chosen by God', blocks: [{ type: 'p', text: 'Thus says The Lord.' }] }];
    const L = fakeOffline({ phase: 'still', missing: 9 });
    expect(GATE_STATES['9j-offline-incomplete'].facts.offline).toEqual({ phase: 'incomplete', missing: 3 });
    const { container } = render(<V2App gateId="9j-offline-incomplete" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    const strip = container.querySelector('.shb');
    expect(strip.className).toBe('shb gold dis');
    expect(strip.previousElementSibling.classList.contains('tb')).toBe(true);
    expect(strip.querySelector('.shb-t').textContent).toBe('Offline library incomplete. 3 files did not download.');
    for (const label of ['Retry', 'Dismiss']) await click(button(container, label));
    expect(L.start).not.toHaveBeenCalled();
    expect(L.retry).not.toHaveBeenCalled();
    expect(L.dismiss).not.toHaveBeenCalled();
  });
});
