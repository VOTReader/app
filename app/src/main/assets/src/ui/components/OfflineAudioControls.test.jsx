// @ts-nocheck -- classic-global screen contract (OfflineAudio, AudioPlayer, ScreenLayout, LibraryNav are bundle globals).
/* DOWNLOADS TO THE PHONE (listening item 8; Corbin 2026-09-22 "yes after reset"; built to Codex's mockup round 1,
   option 1: lanes/readalong/out/mockups/offline/r1-1.png).
   A plain line under each recording row says what the phone holds and offers the next step - "Download · 18 MB",
   "Downloading 62%" with Cancel, "On this phone · 16 MB", "Download failed · Retry" (or "Not enough room on this
   phone") and, with no signal, "Needs a connection". Beside Play all, "Download all" asks first with the size and the
   phone's free space. "On this phone" lists every download with its size and a Remove, and Remove all asks first.
   Only in the Android app: on the web the store is unavailable and none of this renders. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetToasts } from '../../utils/toast.js';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import {
  OfflineCollectionAction, OfflineCollectionMark, TrackOnPhone, downloadWhenOnline, formatBytes, useOfflineState,
} from './OfflineAudioControls.jsx';
import { AudioOfflineScreen, groupShelf } from '../screens/AudioOfflineScreen.jsx';

const U = (id) => 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/' + id + '.mp3';
const T = (id, extra = {}) => ({ key: 'one:' + id, title: 'Letter ' + id, url: U(id), ...extra });

/** A controllable stand-in for utils/offline-audio.js's OfflineAudio (a bundle-d global). */
function fakeStore({ available = true } = {}) {
  const listeners = new Set();
  const st = { saved: new Map(), status: new Map(), sizes: new Map(), progress: new Map(), failure: new Map(), free: 5e9, v: 0 };
  const bump = () => { st.v++; for (const cb of listeners) cb(); };
  const s = {
    st, bump,
    subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    getVersion: () => st.v,
    available: () => available,
    refresh: vi.fn(),
    statusOf: (u) => (st.saved.has(u) ? 'saved' : st.status.get(u) || 'none'),
    isSaved: (u) => st.saved.has(u),
    sizeOf: (u) => (st.saved.get(u) || {}).bytes || st.sizes.get(u) || null,
    progressOf: (u) => st.progress.get(u) || null,
    failureOf: (u) => st.failure.get(u) || null,
    items: () => [...st.saved.values()],
    totalBytes: () => [...st.saved.values()].reduce((n, i) => n + i.bytes, 0),
    freeBytes: () => st.free,
    requestSizes: vi.fn(),
    download: vi.fn(() => true),
    remove: vi.fn(),
    removeAll: vi.fn(),
    cancel: vi.fn(),
  };
  globalThis.OfflineAudio = s;
  return s;
}
const save = (s, id, bytes, title = 'Letter ' + id) => s.st.saved.set(U(id), { url: U(id), key: 'one:' + id, title, bytes, savedAt: s.st.saved.size + 1 });
function setOnline(v) { Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => v }); }

beforeEach(() => {
  setOnline(true);
  globalThis.ScreenLayout = ({ children }) => <main>{children}</main>;
  globalThis.LibraryNav = () => null;
  globalThis.AudioPlayer = { playTrack: vi.fn(), subscribe: () => () => {}, getVersion: () => 0, getState: () => ({ status: 'idle', queue: [], qi: 0 }) };
});
afterEach(() => {
  cleanup();
  _resetToasts();   // a Remove's Undo toast lives in document.body, outside cleanup's reach (shuffle seed 20261023)
  setOnline(true);
  for (const k of ['OfflineAudio', 'ScreenLayout', 'LibraryNav', 'AudioPlayer']) delete globalThis[k];
});

describe('formatBytes', () => {
  it('speaks in MB and GB, the way a phone does', () => {
    expect(formatBytes(18_000_000)).toBe('18 MB');
    expect(formatBytes(6_400_000)).toBe('6.4 MB');
    expect(formatBytes(1_480_000_000)).toBe('1.5 GB');
    expect(formatBytes(0)).toBe('');
  });
});

describe('Download all, beside Play all', () => {
  const units = [[T('a')], [T('b'), T('b2')], [T('c')]];

  it('asks first with the count, the size and the phone\'s free space, then downloads what is not there yet', () => {
    const s = fakeStore();
    save(s, 'a', 10_000_000);
    s.st.sizes.set(U('b'), 60_000_000); s.st.sizes.set(U('b2'), 40_000_000); s.st.sizes.set(U('c'), 110_000_000);
    s.st.free = 1_480_000_000;
    const { getByRole, container } = render(<OfflineCollectionAction units={units} label="Volume One" />);
    // One of three already on the phone: it says so, and offers the other two with their size (brief section 7 item 8,
    // pictures 10 and 14).
    expect(container.textContent).toMatch(/1 of 3 on this phone/);
    fireEvent.click(getByRole('button', { name: 'Download the other 2 · 210 MB' }));
    expect(container.textContent).toMatch(/Download Volume One\?/);
    // Counted in recordings as the rows count them: b in two parts is one (item 12).
    expect(container.textContent).toMatch(/2 recordings · 210 MB/);
    expect(container.textContent).toMatch(/Free space on this phone: 1.5 GB/);
    // Downloads run while the app is open (SHOULD 9 of the refutation: no background service yet).
    expect(container.textContent).toMatch(/Keep VOTReader open until it finishes/);
    fireEvent.click(getByRole('button', { name: /download 210 MB/i }));
    expect(s.download.mock.calls[0][0].map((t) => t.url)).toEqual([U('b'), U('b2'), U('c')]);
  });

  // dl-rework E (defect 17): "Keep VOTReader open" showed where the phone app downloads with the app closed.
  it('says Keep VOTReader open only where it is true', () => {
    const s = fakeStore();
    s.st.sizes.set(U('b'), 60_000_000);
    s.runsClosed = () => true;
    const { getByRole, container } = render(<OfflineCollectionAction units={[[T('b')], [T('c')]]} label="Volume One" />);
    fireEvent.click(getByRole('button', { name: /^Download all/ }));
    expect(container.textContent).not.toMatch(/Keep VOTReader open/);
    expect(container.textContent).toMatch(/It goes on with VOTReader closed\./);
  });

  it('a size not known yet leaves the total open ("at least"), not hidden (brief section 7 item 9)', () => {
    const s = fakeStore();
    s.st.sizes.set(U('a'), 10_000_000); s.st.sizes.set(U('b'), 60_000_000);   // b2 and c not answered yet
    const { getByRole, container } = render(<OfflineCollectionAction units={units} label="Volume One" />);
    fireEvent.click(getByRole('button', { name: /download all/i }));
    expect(container.textContent).toMatch(/3 recordings · at least 70 MB/);
  });

  it('refuses a download the phone has no room for', () => {
    const s = fakeStore();
    s.st.sizes.set(U('a'), 300_000_000); s.st.sizes.set(U('b'), 1); s.st.sizes.set(U('b2'), 1); s.st.sizes.set(U('c'), 1);
    s.st.free = 350_000_000;   // under the download + the 200 MB the phone keeps free
    const { getByRole, container } = render(<OfflineCollectionAction units={units} label="Volume One" />);
    fireEvent.click(getByRole('button', { name: /download all/i }));
    expect(container.textContent).toMatch(/Not enough room/);
    expect(getByRole('button', { name: /download 300 MB/i }).disabled).toBe(true);
  });

  it('says All on this phone when everything is there, and nothing on the web', () => {
    const s = fakeStore();
    for (const id of ['a', 'b', 'b2', 'c']) save(s, id, 1_000_000);
    const first = render(<OfflineCollectionAction units={units} label="Volume One" />);
    expect(first.container.textContent).toMatch(/All on this phone/);
    first.unmount();
    fakeStore({ available: false });
    const web = render(<OfflineCollectionAction units={units} label="Volume One" />);
    expect(web.container.textContent).toBe('');
  });
});

/* D4 (downloads brief 3h, 3j; pictures 10, 14, 17): the ring + count under a collection's title, a row's ... menu, and
   "Download when online". */
describe('on-phone marks, the row menu and Download when online (D4)', () => {
  const units = [[T('a')], [T('b'), T('b2')], [T('c')]];
  afterEach(() => { delete globalThis.NetStatus; });

  it('the collection mark counts rows as the rows count them, and says nothing while none is on the phone', () => {
    const s = fakeStore();
    const view = render(<OfflineCollectionMark units={units} />);
    expect(view.container.textContent).toBe('');
    save(s, 'a', 1e6); save(s, 'b', 1e6);   // b2 not yet: letter b is not on the phone
    act(() => s.bump());
    expect(view.container.textContent).toBe('1 of 3 on this phone');
    save(s, 'b2', 1e6); save(s, 'c', 1e6);
    act(() => s.bump());
    expect(view.container.textContent).toBe('All 3 on this phone');
    expect(view.container.querySelector('.offline-mark.is-all .offline-ring-tick')).toBeTruthy();
  });

  it('with no signal, a store that cannot wait holds the download and sends it the moment the signal returns', () => {
    const s = fakeStore();
    let offline = true;
    const subs = new Set();
    globalThis.NetStatus = { isOffline: () => offline, subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); }, getVersion: () => 0 };
    act(() => downloadWhenOnline(s, [{ url: U('a'), key: 'one:a', title: 'Letter a' }]));
    expect(s.download).not.toHaveBeenCalled();
    offline = false;
    act(() => { for (const cb of [...subs]) cb(); });
    expect(s.download).toHaveBeenCalledWith([{ url: U('a'), key: 'one:a', title: 'Letter a' }]);
    act(() => { for (const cb of [...subs]) cb(); });
    expect(s.download).toHaveBeenCalledTimes(1);
  });

  it('a store that waits for a signal itself (dl-d2: it has reason()) takes the download at once, and online it always does', () => {
    const s = fakeStore();
    globalThis.NetStatus = { isOffline: () => true, subscribe: () => () => {}, getVersion: () => 0 };
    s.reason = () => 'offline';
    downloadWhenOnline(s, [{ url: U('a'), key: '', title: 'a' }]);
    expect(s.download).toHaveBeenCalledTimes(1);
    delete s.reason;
    globalThis.NetStatus.isOffline = () => false;
    downloadWhenOnline(s, [{ url: U('b'), key: '', title: 'b' }]);
    expect(s.download).toHaveBeenCalledTimes(2);
  });

  it('Download all offline reads Download when online and still asks first', () => {
    const s = fakeStore();
    setOnline(false);
    s.st.sizes.set(U('a'), 1e6); s.st.sizes.set(U('b'), 1e6); s.st.sizes.set(U('b2'), 1e6); s.st.sizes.set(U('c'), 1e6);
    const { getByRole, container } = render(<OfflineCollectionAction units={units} label="Volume One" note={false} />);
    fireEvent.click(getByRole('button', { name: 'Download when online' }));
    expect(container.textContent).toMatch(/Download Volume One\?/);
    fireEvent.click(getByRole('button', { name: /download 4 MB/i }));
    expect(s.download.mock.calls[0][0]).toHaveLength(4);
  });
});

/* D4b (picture 15): the control beside a Listen pill, and Download when online under one that cannot play. */
describe('history and Up next rows (D4c)', () => {
  it('a row on the phone ends its line with the tick; one that is not, and the web, add nothing', () => {
    const s = fakeStore();
    save(s, 'a', 1e6);
    expect(render(<TrackOnPhone url={U('a')} />).container.querySelector('.offline-tick')).toBeTruthy();
    expect(render(<TrackOnPhone url={U('b')} />).container.textContent).toBe('');
    fakeStore({ available: false });
    expect(render(<TrackOnPhone url={U('a')} />).container.textContent).toBe('');
  });
});

describe('On this phone (the shelf, pictures 11-13)', () => {
  beforeEach(() => { globalThis.COLLECTIONS = [{ volKey: 'one', label: 'Volume One' }, { volKey: 'two', label: 'Volume Two' }]; });
  afterEach(() => { delete globalThis.COLLECTIONS; delete globalThis.BIBLE_AUDIO_EDITIONS; delete globalThis.BIBLE_AUDIO_BOOKS; });

  it('groups downloads like the tree, plays one, and asks before removing all', () => {
    const s = fakeStore();
    save(s, 'a', 18_000_000, 'I Am The Passover');
    save(s, 'b', 12_000_000, 'Matthew 1');
    const { container, getByRole } = render(<AudioOfflineScreen onBack={() => {}} />);
    expect(container.querySelector('h1').textContent).toBe('Downloads');
    expect(getByRole('tab', { name: 'On this phone' }).getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('.dl-storage-line').textContent).toBe('Recordings 30 MB · 5 GB free on this phone');
    expect(container.querySelector('.dl-shelf-section .dl-shelf-kicker').textContent).toBe('The Volumes of Truth');
    const head = container.querySelector('.dl-shelf-head');
    expect(head.textContent).toMatch(/Volume One2 recordings · 30 MB/);
    expect([...container.querySelectorAll('.dl-shelf-title')].map((x) => x.textContent)).toEqual(['I Am The Passover', 'Matthew 1']);
    fireEvent.click(getByRole('button', { name: /^play i am the passover/i }));
    expect(globalThis.AudioPlayer.playTrack).toHaveBeenCalledWith(expect.objectContaining({ url: U('a'), key: 'one:a', title: 'I Am The Passover' }));
    fireEvent.click(getByRole('button', { name: 'Remove all downloads' }));
    expect(s.removeAll).not.toHaveBeenCalled();
    const sheet = getByRole('dialog');
    expect(sheet.textContent).toMatch(/Remove all downloads from this phone\?/);
    expect(sheet.textContent).toMatch(/2 recordings · 30 MB\. You can download them again any time\./);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Remove' }));
    expect(s.removeAll).toHaveBeenCalledTimes(1);
  });

  // Downloads brief section 7 item 14: a single Remove had no Undo. The row steps aside at once; the file goes when the
  // toast does, so Undo keeps the very file.
  it('a single × can be taken back for 5 s, and the file goes only when that time is up', () => {
    vi.useFakeTimers();
    try {
      const s = fakeStore();
      save(s, 'a', 18_000_000, 'I Am The Passover');
      save(s, 'b', 12_000_000, 'Matthew 1');
      const { container, getByRole, queryAllByRole } = render(<AudioOfflineScreen onBack={() => {}} />);
      fireEvent.click(getByRole('button', { name: /^remove matthew 1 from this phone/i }));
      expect(queryAllByRole('button', { name: /^remove matthew 1/i })).toHaveLength(0);
      const toast = document.getElementById('vot-toast-offline-removed');
      expect(toast.textContent).toBe('Removed Matthew 1 · 12 MBUndo');
      expect(s.remove).not.toHaveBeenCalled();
      act(() => { toast.querySelector('.vot-undo-btn').click(); });
      expect(s.remove).not.toHaveBeenCalled();
      expect(container.querySelectorAll('.dl-shelf-row')).toHaveLength(2);
      fireEvent.click(getByRole('button', { name: /^remove matthew 1 from this phone/i }));
      act(() => { vi.advanceTimersByTime(5100); });
      expect(s.remove).toHaveBeenCalledWith([U('b')]);
    } finally { vi.useRealTimers(); }
  });

  it('a letter in parts is one row, and its × takes every part', () => {
    vi.useFakeTimers();
    try {
      const s = fakeStore();
      s.st.saved.set(U('x1'), { url: U('x1'), key: 'one:x', title: 'Christmas · Part 1', bytes: 5e6, savedAt: 1 });
      s.st.saved.set(U('x2'), { url: U('x2'), key: 'one:x', title: 'Christmas · Part 2', bytes: 6e6, savedAt: 2 });
      const { container, getByRole } = render(<AudioOfflineScreen onBack={() => {}} />);
      expect([...container.querySelectorAll('.dl-shelf-row')].map((r) => r.textContent)).toEqual(['Christmas11 MB']);
      fireEvent.click(getByRole('button', { name: /^remove christmas from this phone/i }));
      act(() => { vi.advanceTimersByTime(5100); });
      expect(s.remove).toHaveBeenCalledWith([U('x1'), U('x2')]);
    } finally { vi.useRealTimers(); }
  });

  // Codex critique of the built screens (2026-09-24, 5): with one recording, its own × is the whole job.
  it('a shelf of one offers no Remove all', () => {
    const s = fakeStore();
    save(s, 'a', 18_000_000, 'I Am The Passover');
    const { container, queryByRole, getByRole } = render(<AudioOfflineScreen onBack={() => {}} />);
    expect(container.querySelectorAll('.dl-shelf-row')).toHaveLength(1);
    expect(getByRole('button', { name: /^remove i am the passover/i })).toBeTruthy();
    expect(queryByRole('button', { name: 'Remove all downloads' })).toBeNull();
  });

  it('a Bible book sits under its edition, chapters in order, and its ⋯ removes it after asking (n2-04, picture 12)', () => {
    const s = fakeStore();
    globalThis.BIBLE_AUDIO_EDITIONS = { 'brm-kjv': { volKey: 'bible-brm-kjv', short: 'KJV · BRM' } };
    globalThis.BIBLE_AUDIO_BOOKS = [['genesis', 'Genesis']];
    const ch = (n, at) => s.st.saved.set(U('gen' + n), { url: U('gen' + n), key: 'bible-brm-kjv:genesis', title: 'Genesis · Chapter ' + n, bytes: 1_000_000, savedAt: at });
    ch(10, 1); ch(2, 3); ch(1, 2);
    save(s, 'a', 18_000_000, 'I Am The Passover');
    const { container, getByRole } = render(<AudioOfflineScreen onBack={() => {}} />);
    expect([...container.querySelectorAll('.dl-shelf-section .dl-shelf-kicker')].map((k) => k.textContent)).toEqual(['The Volumes of Truth', 'The Bible · KJV · BRM']);
    fireEvent.click(getByRole('button', { name: /^Genesis3 chapters · 3 MB/ }));
    const book = container.querySelectorAll('.dl-shelf-branch')[1];
    expect([...book.querySelectorAll('.dl-shelf-title')].map((x) => x.textContent)).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 10']);
    fireEvent.click(getByRole('button', { name: 'More for Genesis' }));
    fireEvent.click(within(getByRole('dialog')).getByRole('button', { name: 'Remove · 3 MB' }));
    expect(s.remove).not.toHaveBeenCalled();
    const sheet = getByRole('dialog');
    expect(sheet.textContent).toMatch(/Remove Genesis from this phone\?/);
    expect(sheet.textContent).toMatch(/3 chapters · 3 MB/);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Remove' }));
    expect(s.remove).toHaveBeenCalledWith([U('gen1'), U('gen2'), U('gen10')]);
  });

  it('sorts by size, and a group\'s Choose more opens the tree', () => {
    const s = fakeStore();
    s.st.saved.set(U('t'), { url: U('t'), key: 'two:t', title: 'Big one', bytes: 90e6, savedAt: 1 });
    save(s, 'a', 18_000_000, 'Small one');
    const { container, getByRole } = render(<AudioOfflineScreen onBack={() => {}} />);
    const heads = () => [...container.querySelectorAll('.dl-shelf-head strong')].map((x) => x.textContent);
    expect(heads()).toEqual(['Volume One', 'Volume Two']);
    fireEvent.change(container.querySelector('.dl-sort select'), { target: { value: 'size' } });
    expect(heads()).toEqual(['Volume Two', 'Volume One']);
    fireEvent.click(getByRole('button', { name: 'More for Volume Two' }));
    fireEvent.click(within(getByRole('dialog')).getByRole('button', { name: 'Choose more…' }));
    expect(getByRole('tab', { name: 'Choose' }).getAttribute('aria-selected')).toBe('true');
  });

  it('groupShelf keeps a download with no key on its own, and a letter\'s parts together', () => {
    const it = (id, key, title, at) => ({ url: U(id), key, title, bytes: 1, savedAt: at });
    const g = groupShelf([it('p2', 'one:x', 'X · Part 2', 1), it('p1', 'one:x', 'X · Part 1', 2), it('z', '', 'recovered-id', 3)]);
    expect(g.map((x) => x.title)).toEqual(['recovered-id', 'X']);
    expect(g[1].items.map((x) => x.title)).toEqual(['X · Part 1', 'X · Part 2']);
  });

  it('offers an update for a recording uploaded again, and checks when it opens (n2-01)', () => {
    const s = fakeStore();
    s.checkForUpdates = vi.fn();
    s.update = vi.fn(() => true);
    s.isUpdating = () => false;
    save(s, 'a', 18_000_000, 'I Am The Passover');
    s.st.saved.get(U('a')).stale = true;
    const { container, getByRole } = render(<AudioOfflineScreen onBack={() => {}} />);
    expect(s.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(container.textContent).toMatch(/Update available/);
    fireEvent.click(getByRole('button', { name: /^update i am the passover/i }));
    expect(s.update).toHaveBeenCalledWith([expect.objectContaining({ url: U('a') })]);
  });

  it('shows what is on its way and what did not download, with Cancel all and Retry (n2-05; picture 08)', () => {
    const s = fakeStore();
    s.cancelAll = vi.fn();
    const failed = [{ url: U('c'), key: 'one:c', title: 'Letter c' }];
    s.pending = () => ({ busy: 12, failed });
    s.failureOf = () => 'network';
    const { container, getByRole } = render(<AudioOfflineScreen onBack={() => {}} />);
    expect(container.textContent).toMatch(/Downloading · 12 recordings to go/);
    expect(container.textContent).toMatch(/Letter cNo connection when it tried/);
    fireEvent.click(getByRole('button', { name: /^cancel all/i }));
    expect(s.cancelAll).not.toHaveBeenCalled();   // it asks first (dl-rework E, defect 30)
    fireEvent.click(getByRole('button', { name: 'Cancel downloads' }));
    expect(s.cancelAll).toHaveBeenCalledTimes(1);
    fireEvent.click(getByRole('button', { name: 'Retry Letter c' }));
    expect(s.download).toHaveBeenCalledWith(failed, { priority: 'tap' });
  });

  // dl-rework A (defect 2): every reading of a letter merged into one row with no reader, and × removed them all.
  it('each reading of a letter is a row of its own, named by its reader; its × removes only that reading', () => {
    vi.useFakeTimers();
    try {
      const s = fakeStore();
      globalThis.AudioPlayer = {
        playTrack: vi.fn(),
        renditionsFor: (volKey, item) => (volKey === 'one' && item.id === 'x'
          ? [{ reader: 'B', tracks: [{ url: U('xb1') }, { url: U('xb2') }] }, { reader: 'T', tracks: [{ url: U('xt') }] }] : []),
      };
      s.st.saved.set(U('xb1'), { url: U('xb1'), key: 'one:x', title: 'Christmas · Part 1', bytes: 5e6, savedAt: 1 });
      s.st.saved.set(U('xt'), { url: U('xt'), key: 'one:x', title: 'Christmas', bytes: 4e6, savedAt: 2 });
      const { container, getByRole } = render(<AudioOfflineScreen onBack={() => {}} />);
      const rows = [...container.querySelectorAll('.dl-shelf-row')].map((r) => r.textContent);
      expect(rows).toEqual(['ChristmasTimothy4 MB', 'Christmas · Part 1Benjamin1 of 2 parts · 5 MB']);
      fireEvent.click(getByRole('button', { name: /^remove christmas · timothy from this phone/i }));
      act(() => { vi.advanceTimersByTime(5100); });
      expect(s.remove).toHaveBeenCalledWith([U('xt')]);
      fireEvent.click(getByRole('button', { name: /^play christmas · part 1 · benjamin/i }));
      expect(globalThis.AudioPlayer.playTrack).toHaveBeenCalledWith(expect.objectContaining({ url: U('xb1'), readerCode: 'B' }));
    } finally { vi.useRealTimers(); }
  });

  // dl-rework E: the Choose tab showed the strip but not what did not download.
  it('what did not download yet shows on the Choose tab too', () => {
    const s = fakeStore();
    s.pending = () => ({ busy: 0, failed: [{ url: U('c'), key: 'one:c', title: 'Letter c' }] });
    s.later = () => [{ url: U('c'), key: 'one:c', title: 'Letter c', reason: 'server', status: 503, tries: 5, at: Date.now() + 12 * 60000 }];
    const { container, getByRole } = render(<AudioOfflineScreen onBack={() => {}} />);
    fireEvent.click(getByRole('tab', { name: 'Choose' }));
    expect(container.textContent).toMatch(/Didn’t download yet/);
    expect(container.textContent).toMatch(/Letter cThe server had a problem \(503\) · tries again in 12 min/);
  });

  // dl-rework D (defect 10): the list stopped at 30, and a waiting row had no control.
  it('the waiting list pages 50 at a time, and each waiting one can be taken off', () => {
    const s = fakeStore();
    const q = Array.from({ length: 61 }, (_, i) => ({ url: U('w' + i), key: 'one:w' + i, title: 'Letter ' + i }));
    s.queue = () => q;
    s.actives = () => [U('w0')];
    s.pending = () => ({ busy: 61, failed: [] });
    s.statusOf = (u) => (u === U('w0') ? 'downloading' : 'queued');
    s.progressOf = () => null;
    const { container, getByRole } = render(<AudioOfflineScreen onBack={() => {}} />);
    expect(container.querySelectorAll('.dl-queue-row:not(.is-more)')).toHaveLength(51);
    fireEvent.click(getByRole('button', { name: 'Show 10 more · 10 still waiting' }));
    expect(container.querySelectorAll('.dl-queue-row:not(.is-more)')).toHaveLength(61);
    fireEvent.click(getByRole('button', { name: 'Take Letter 60 off the queue' }));
    expect(s.cancel).toHaveBeenCalledWith([U('w60')]);
  });

  // dl-rework E: nothing said what had finished.
  it('Finished: each set with how much of it is on the phone, a whole set said plainly, the latest first', () => {
    const s = fakeStore();
    globalThis.BIBLE_AUDIO_EDITIONS = { 'brm-kjv': { volKey: 'bible-brm-kjv', short: 'KJV · BRM' } };
    globalThis.BIBLE_AUDIO_BOOKS = [['ruth', 'Ruth']];
    globalThis.COLLECTIONS = [{ volKey: 'one', label: 'Volume One', cardId: 'one' }];
    globalThis.colLetterArr = () => [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }];
    globalThis.colPreface = () => null;
    globalThis.AudioPlayer = {
      playTrack: vi.fn(),
      playbackTracks: (volKey, item) => (volKey === 'bible-brm-kjv'
        ? (item.id === 'ruth' ? [1, 2].map((n) => ({ url: U('ruth' + n), partLabel: 'Chapter ' + n })) : [])
        : [{ url: U(item.id), readerCode: 'B' }]),
      renditionsFor: (volKey, item) => (volKey === 'one' ? [{ reader: 'B', tracks: [{ url: U(item.id) }] }] : []),
    };
    s.st.saved.set(U('ruth1'), { url: U('ruth1'), key: 'bible-brm-kjv:ruth', title: 'Ruth 1', bytes: 1e6, savedAt: 10 });
    s.st.saved.set(U('ruth2'), { url: U('ruth2'), key: 'bible-brm-kjv:ruth', title: 'Ruth 2', bytes: 1e6, savedAt: 30 });
    s.st.saved.set(U('a'), { url: U('a'), key: 'one:a', title: 'A', bytes: 1e6, savedAt: 20 });
    try {
      const { container } = render(<AudioOfflineScreen onBack={() => {}} />);
      const fin = container.querySelector('.dl-finished');
      expect([...fin.querySelectorAll('.dl-finished-set')].map((x) => x.textContent))
        .toEqual(['All of KJV · BRM is on this phone · 2 chapters', 'Volume One: 1 of 2 letters']);
      expect([...fin.querySelectorAll('.dl-finished-title')].map((x) => x.textContent)).toEqual(['Ruth 2', 'A', 'Ruth 1']);
    } finally {
      delete globalThis.colLetterArr; delete globalThis.colPreface;
    }
  });

  it('In line (picture 08): the one downloading with its bytes, then each waiting with its place', () => {
    const s = fakeStore();
    const q = [{ url: U('h'), key: 'one:h', title: 'Honor God' }, { url: U('x'), key: 'one:x', title: 'Christmas' }, { url: U('d'), key: 'one:d', title: '' }];
    s.queue = () => q;
    s.pending = () => ({ busy: 3, failed: [] });
    s.statusOf = (u) => (u === U('h') ? 'downloading' : 'queued');
    s.progressOf = (u) => (u === U('h') ? { bytes: 4_100_000, total: 7_000_000 } : null);
    const { container } = render(<AudioOfflineScreen onBack={() => {}} />);
    const rows = [...container.querySelectorAll('.dl-queue-row')].map((r) => r.textContent);
    expect(rows[0]).toBe('Honor God4.1 of 7 MB');
    expect(rows[1]).toBe('ChristmasWaiting · 1st in line');
    expect(rows[2]).toMatch(/Waiting · 2nd in line$/);
    expect(container.querySelector('.dl-queue-count').textContent).toBe('3');
  });

  it('nothing on the phone opens Choose; the empty shelf says how to fill it', () => {
    fakeStore();
    const { container, getByRole } = render(<AudioOfflineScreen onBack={() => {}} />);
    expect(getByRole('tab', { name: 'Choose' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(getByRole('tab', { name: 'On this phone' }));
    expect(container.textContent).toMatch(/Nothing is on this phone yet\. In Choose, tick what you want/);
  });
});

/* Downloads brief 2026-10-23, 3h: one hook counts for every badge, the picker and the player's offline ticks (L4). */
describe('useOfflineState', () => {
  afterEach(() => { delete globalThis.AudioLengths; });
  function Probe({ target }) {
    const st = useOfflineState(target);
    return <output>{JSON.stringify(st)}</output>;
  }
  const read = (c) => JSON.parse(c.querySelector('output').textContent);

  it('counts what is on the phone, the bytes and the baked seconds of a set', () => {
    const s = fakeStore();
    save(s, 'a', 100);
    s.st.sizes.set(U('b'), 300);
    globalThis.AudioLengths = { secondsOf: (u) => ({ [U('a')]: 60, [U('b')]: 90 })[u] ?? null, lengthsStore: { subscribe: () => () => {}, getVersion: () => 0 } };
    const { container } = render(<Probe target={[U('a'), { url: U('b') }]} />);
    expect(read(container)).toEqual(expect.objectContaining({ status: 'none', saved: 1, count: 2, bytes: 400, remaining: 300, seconds: 150 }));
  });

  it('seconds are null while any recording of the set has none; null where downloads are not possible', () => {
    const s = fakeStore();
    globalThis.AudioLengths = { secondsOf: (u) => (u === U('a') ? 60 : null), lengthsStore: { subscribe: () => () => {}, getVersion: () => 0 } };
    const { container, rerender } = render(<Probe target={[U('a'), U('b')]} />);
    expect(read(container).seconds).toBeNull();
    s.available = () => false;
    rerender(<Probe target={[U('a')]} />);
    expect(read(container)).toBeNull();
  });
});
