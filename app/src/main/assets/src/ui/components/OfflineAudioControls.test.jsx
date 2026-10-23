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
  OfflineRowStatus, OfflineCollectionAction, OfflineCollectionMark, DownloadWhenOnline, HeroDownload, TrackOnPhone, downloadWhenOnline, formatBytes, offlineMenuItems, useOfflineState,
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

describe('a recording row: what the phone holds, and the next step', () => {
  it('on the web (no store) says nothing at all', () => {
    fakeStore({ available: false });
    const { container } = render(<OfflineRowStatus tracks={[T('a')]} name="Letter a" />);
    expect(container.textContent).toBe('');
  });

  it('offers Download with its size, and a tap hands the reading to the phone', () => {
    const s = fakeStore();
    s.st.sizes.set(U('a'), 18_000_000);
    const { getByRole } = render(<OfflineRowStatus tracks={[T('a', { partLabel: null })]} name="Letter a" />);
    const btn = getByRole('button', { name: /download letter a/i });
    expect(btn.textContent).toMatch(/Download · 18 MB/);
    fireEvent.click(btn);
    expect(s.download).toHaveBeenCalledWith([{ url: U('a'), key: 'one:a', title: 'Letter a' }]);
  });

  it('asks the phone for the sizes it shows', () => {
    const s = fakeStore();
    render(<OfflineRowStatus tracks={[T('a'), T('b')]} name="Letter a" />);
    expect(s.requestSizes).toHaveBeenCalledWith([U('a'), U('b')]);
  });

  it('shows the download going, and Cancel stops it', () => {
    const s = fakeStore();
    s.st.sizes.set(U('a'), 1000);
    s.st.status.set(U('a'), 'downloading');
    s.st.progress.set(U('a'), { bytes: 620, total: 1000 });
    const { container, getByRole } = render(<OfflineRowStatus tracks={[T('a')]} name="Letter a" />);
    expect(container.textContent).toMatch(/Downloading 62%/);
    fireEvent.click(getByRole('button', { name: /cancel/i }));
    expect(s.cancel).toHaveBeenCalledWith([U('a')]);
  });

  // ra6: Download only on Wi-Fi holds what is queued on mobile data; the row says why it is not moving.
  it('queued while downloads wait for Wi-Fi, the row says Waiting for Wi-Fi, and Cancel still stops it', () => {
    const s = fakeStore();
    s.waiting = () => true;
    s.st.status.set(U('a'), 'queued');
    const { container, getByRole } = render(<OfflineRowStatus tracks={[T('a')]} name="Letter a" />);
    expect(container.textContent).toMatch(/Waiting for Wi-Fi/);
    expect(container.textContent).not.toMatch(/Downloading/);
    fireEvent.click(getByRole('button', { name: /cancel/i }));
    expect(s.cancel).toHaveBeenCalledWith([U('a')]);
    // One of the unit's parts on its way: it is downloading, whatever waits behind it.
    s.st.status.set(U('a'), 'downloading');
    act(() => s.bump());
    expect(container.textContent).toMatch(/Downloading 0%/);
  });

  it('Download all waiting for Wi-Fi says so with the count', () => {
    const s = fakeStore();
    s.waiting = () => true;
    s.st.status.set(U('a'), 'queued');
    s.st.status.set(U('b'), 'queued');
    save(s, 'c', 1000);
    const { container } = render(<OfflineCollectionAction units={[[T('a')], [T('b')], [T('c')]]} label="Volume One" />);
    expect(container.textContent).toMatch(/Waiting for Wi-Fi · 1 of 3 on this phone/);
  });

  it('says On this phone with the size once every part is there', () => {
    const s = fakeStore();
    save(s, 'a', 16_000_000);
    const { container, queryByRole } = render(<OfflineRowStatus tracks={[T('a')]} name="Letter a" />);
    expect(container.textContent).toMatch(/On this phone · 16 MB/);
    expect(queryByRole('button')).toBeNull();
  });

  it('a failure offers Retry, and a full phone says so plainly', () => {
    const s = fakeStore();
    s.st.status.set(U('a'), 'failed');
    s.st.failure.set(U('a'), 'network');
    const first = render(<OfflineRowStatus tracks={[T('a')]} name="Letter a" />);
    expect(first.container.textContent).toMatch(/Download failed/);
    fireEvent.click(first.getByRole('button', { name: /retry/i }));
    expect(s.download).toHaveBeenCalledTimes(1);
    first.unmount();
    s.st.failure.set(U('a'), 'space');
    const second = render(<OfflineRowStatus tracks={[T('a')]} name="Letter a" />);
    expect(second.container.textContent).toMatch(/Not enough room on this phone/);
  });

  it('with no signal, a recording not on the phone says it needs a connection', () => {
    fakeStore();
    setOnline(false);
    const { container, queryByRole } = render(<OfflineRowStatus tracks={[T('a')]} name="Letter a" />);
    expect(container.textContent).toMatch(/Needs a connection/);
    expect(queryByRole('button')).toBeNull();
  });

  it('offline, the row of the recording playing says it plays from the buffer, not that it needs a connection (RC.5)', () => {
    fakeStore();
    setOnline(false);
    globalThis.AudioPlayer = { ...globalThis.AudioPlayer, getShape: () => 'x', getState: () => ({ status: 'playing', queue: [T('a')], qi: 0 }) };
    const { container } = render(<OfflineRowStatus tracks={[T('a')]} name="Letter a" />);
    expect(container.textContent).toMatch(/Playing from the buffer/);
    expect(container.textContent).not.toMatch(/Needs a connection/);
    const other = render(<OfflineRowStatus tracks={[T('b')]} name="Letter b" />);
    expect(other.container.textContent).toMatch(/Needs a connection/);
  });

  it('follows the store live (a download finishing turns the row)', () => {
    const s = fakeStore();
    s.st.status.set(U('a'), 'queued');
    const { container } = render(<OfflineRowStatus tracks={[T('a')]} name="Letter a" />);
    // Queued behind another: Waiting, with no empty bar (brief section 7 item 7: it read "Downloading 0%").
    expect(container.textContent).toMatch(/^Waiting/);
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    act(() => { s.st.status.set(U('a'), 'downloading'); s.st.progress.set(U('a'), { bytes: 0, total: -1 }); s.bump(); });
    expect(container.textContent).toMatch(/Downloading 0%/);
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
    act(() => { save(s, 'a', 5_000_000); s.bump(); });
    expect(container.textContent).toMatch(/On this phone · 5 MB/);
  });
});

// Downloads brief section 7 item 6: a whole Bible book started on one tap, with no size or room check (Genesis, 206 MB).
describe('a book row asks before it downloads', () => {
  const BOOK = ['g1', 'g2', 'g3', 'g4', 'g5'];
  it('a book asks with its count, size and the free space; Cancel downloads nothing, Download downloads it', () => {
    const s = fakeStore();
    for (const id of BOOK) s.st.sizes.set(U(id), 40e6);
    const { getByRole, container } = render(<OfflineRowStatus tracks={BOOK.map((id) => T(id))} name="Genesis" />);
    fireEvent.click(getByRole('button', { name: /download genesis to this phone/i }));
    expect(s.download).not.toHaveBeenCalled();
    const ask = getByRole('group', { name: 'Download Genesis' });
    expect(ask.textContent).toContain('5 recordings · 200 MB');
    expect(ask.textContent).toContain('Free space on this phone: 5 GB');
    fireEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(container.querySelector('.offline-confirm')).toBeNull();
    expect(s.download).not.toHaveBeenCalled();
    fireEvent.click(getByRole('button', { name: /download genesis to this phone/i }));
    fireEvent.click(getByRole('button', { name: 'Download 200 MB' }));
    expect(s.download).toHaveBeenCalledWith(BOOK.map((id) => expect.objectContaining({ url: U(id) })));
  });

  it('with no room it says so and will not start', () => {
    const s = fakeStore();
    s.st.free = 100e6;
    for (const id of BOOK) s.st.sizes.set(U(id), 40e6);
    const { getByRole } = render(<OfflineRowStatus tracks={BOOK.map((id) => T(id))} name="Genesis" />);
    fireEvent.click(getByRole('button', { name: /download genesis to this phone/i }));
    expect(getByRole('group', { name: 'Download Genesis' }).textContent).toContain('Not enough room');
    expect(getByRole('button', { name: 'Download 200 MB' }).disabled).toBe(true);
  });

  it('a letter in two parts still downloads on one tap', () => {
    const s = fakeStore();
    s.st.sizes.set(U('p1'), 9e6); s.st.sizes.set(U('p2'), 9e6);
    const { getByRole } = render(<OfflineRowStatus tracks={[T('p1'), T('p2')]} name="Christmas" />);
    fireEvent.click(getByRole('button', { name: /download christmas to this phone/i }));
    expect(s.download).toHaveBeenCalledTimes(1);
  });
});

describe('downloads a keyboard or screen reader can follow (n2-06)', () => {
  it('Download keeps focus: it lands on Cancel, then on the finished line, never the page top', () => {
    const s = fakeStore();
    s.st.sizes.set(U('a'), 1000);
    const { getByRole, container } = render(<OfflineRowStatus tracks={[T('a')]} name="Letter a" />);
    const btn = getByRole('button', { name: /download letter a/i });
    btn.focus();
    fireEvent.click(btn);
    s.st.status.set(U('a'), 'downloading');
    s.st.progress.set(U('a'), { bytes: 400, total: 1000 });
    act(() => s.bump());
    expect(document.activeElement).toBe(getByRole('button', { name: /cancel the download of letter a/i }));
    const bar = getByRole('progressbar', { name: /downloading letter a/i });
    expect(bar.getAttribute('aria-valuenow')).toBe('40');
    save(s, 'a', 1000);
    act(() => s.bump());
    expect(document.activeElement).toBe(container.querySelector('.offline-row.is-saved'));
  });

  it('a reader who taps plain page text has let go: the finished download does not pull focus back (sweep v105)', async () => {
    const s = fakeStore();
    s.st.sizes.set(U('a'), 1000);
    const { getByRole, container } = render(<OfflineRowStatus tracks={[T('a')]} name="Letter a" />);
    const btn = getByRole('button', { name: /download letter a/i });
    btn.focus();
    fireEvent.click(btn);
    s.st.status.set(U('a'), 'downloading');
    act(() => s.bump());
    const cancel = getByRole('button', { name: /cancel the download of letter a/i });
    expect(document.activeElement).toBe(cancel);
    // A tap on text that cannot take focus: the button blurs with nowhere to go and stays in the page.
    cancel.blur();
    expect(document.activeElement).toBe(document.body);
    await act(async () => {});
    save(s, 'a', 1000);
    act(() => s.bump());
    const line = container.querySelector('.offline-row.is-saved');
    expect(line).not.toBeNull();
    expect(document.activeElement).toBe(document.body);
    expect(line.hasAttribute('tabindex')).toBe(false);
  });

  it('a reader who only left the window still holds the row: focus follows the finished download', async () => {
    const s = fakeStore();
    s.st.sizes.set(U('a'), 1000);
    const { getByRole, container } = render(<OfflineRowStatus tracks={[T('a')]} name="Letter a" />);
    getByRole('button', { name: /download letter a/i }).focus();
    s.st.status.set(U('a'), 'downloading');
    act(() => s.bump());
    const cancel = getByRole('button', { name: /cancel the download of letter a/i });
    expect(document.activeElement).toBe(cancel);
    // The window loses focus (another app): a blur with nowhere to go, but the page's focus stays on Cancel.
    fireEvent.focusOut(cancel, { relatedTarget: null });
    await act(async () => {});
    expect(document.activeElement).toBe(cancel);
    save(s, 'a', 1000);
    act(() => s.bump());
    expect(document.activeElement).toBe(container.querySelector('.offline-row.is-saved'));
  });

  it('a row that never had focus never takes it', () => {
    const s = fakeStore();
    const other = document.createElement('button');
    document.body.appendChild(other);
    other.focus();
    render(<OfflineRowStatus tracks={[T('a')]} name="Letter a" />);
    s.st.status.set(U('a'), 'downloading');
    act(() => s.bump());
    expect(document.activeElement).toBe(other);
    other.remove();
  });

  it('news is read out once, in one polite live region: not what happened before the screen opened', () => {
    const s = fakeStore();
    let news = { seq: 3, text: 'Download finished' };
    s.news = () => news;
    render(<OfflineRowStatus tracks={[T('a')]} name="Letter a" />);
    render(<OfflineRowStatus tracks={[T('b')]} name="Letter b" />);
    const regions = document.querySelectorAll('#offline-audio-status');
    expect(regions).toHaveLength(1);
    expect(regions[0].getAttribute('role')).toBe('status');
    expect(regions[0].textContent).toBe('');
    news = { seq: 4, text: 'Downloading 12 recordings' };
    act(() => s.bump());
    expect(regions[0].textContent).toBe('Downloading 12 recordings');
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

  it('a row menu offers Download with its size, Download the rest for a part-saved book, Remove once saved, Cancel while on its way', () => {
    const s = fakeStore();
    s.st.sizes.set(U('a'), 11e6); s.st.sizes.set(U('b'), 4e6); s.st.sizes.set(U('b2'), 6e6);
    const texts = (tracks, online = true) => offlineMenuItems({ off: s, online, tracks, name: 'X' }).map((i) => i.text);
    expect(texts([T('a')])).toEqual(['Download · 11 MB']);
    expect(texts([T('a')], false)).toEqual(['Download when online']);
    save(s, 'b', 4e6);
    expect(texts([T('b'), T('b2')])).toEqual(['Download the rest · 6 MB', 'Remove · 4 MB']);
    s.st.status.set(U('a'), 'downloading');
    expect(texts([T('a')])).toEqual(['Cancel download']);
    s.st.status.delete(U('a'));
    s.st.free = 150e6;   // under 11 MB + the 200 MB the phone keeps free
    const [item] = offlineMenuItems({ off: s, online: true, tracks: [T('a')], name: 'X' });
    expect(item.text).toBe('Not enough room · 11 MB');
    expect(item.disabled).toBe(true);
  });

  it('with no signal, a store that cannot wait holds the download and sends it the moment the signal returns', () => {
    const s = fakeStore();
    let offline = true;
    const subs = new Set();
    globalThis.NetStatus = { isOffline: () => offline, subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); }, getVersion: () => 0 };
    const row = render(<OfflineRowStatus tracks={[T('a')]} name="Letter a" quiet />);
    expect(row.container.textContent).toBe('');
    act(() => downloadWhenOnline(s, [{ url: U('a'), key: 'one:a', title: 'Letter a' }]));
    expect(s.download).not.toHaveBeenCalled();
    // Held, it reads as waiting, not as nothing.
    expect(row.container.textContent).toMatch(/Waiting/);
    offline = false;
    act(() => { for (const cb of [...subs]) cb(); });
    expect(s.download).toHaveBeenCalledWith([{ url: U('a'), key: 'one:a', title: 'Letter a' }]);
    expect(row.container.textContent).toBe('');
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
describe('beside the Listen pill (D4b)', () => {
  it('Download · 10 MB, then a ring with 4 of 10 MB whose tap cancels, then a tick with On this phone', () => {
    const s = fakeStore();
    s.st.sizes.set(U('a'), 10e6);
    const view = render(<HeroDownload tracks={[T('a')]} name="Chosen by God" />);
    fireEvent.click(view.getByRole('button', { name: 'Download Chosen by God, 10 MB' }));
    expect(s.download).toHaveBeenCalledWith([{ url: U('a'), key: 'one:a', title: 'Chosen by God' }]);
    s.st.status.set(U('a'), 'downloading'); s.st.progress.set(U('a'), { bytes: 4e6 });
    act(() => s.bump());
    expect(view.container.querySelector('.hero-dl-cap').textContent).toBe('4 of 10 MB');
    fireEvent.click(view.getByRole('button', { name: /^Cancel the download of Chosen by God/ }));
    expect(s.cancel).toHaveBeenCalledWith([U('a')]);
    s.st.status.delete(U('a')); save(s, 'a', 10e6);
    act(() => s.bump());
    expect(view.container.textContent).toBe('On this phone');
  });

  it('offline it offers nothing for a recording not on the phone (the pill says so), and still shows the tick', () => {
    const s = fakeStore();
    setOnline(false);
    const view = render(<HeroDownload tracks={[T('a')]} name="A" />);
    expect(view.container.textContent).toBe('');
    save(s, 'a', 1e6);
    act(() => s.bump());
    expect(view.container.textContent).toBe('On this phone');
  });

  it('Download when online queues it and then says it will', () => {
    const s = fakeStore();
    const view = render(<DownloadWhenOnline tracks={[T('a')]} name="A" />);
    fireEvent.click(view.getByRole('button', { name: 'Download when online' }));
    expect(s.download).toHaveBeenCalledWith([{ url: U('a'), key: 'one:a', title: 'A' }]);
    s.st.status.set(U('a'), 'queued');
    act(() => s.bump());
    expect(view.container.querySelector('.hero-dl-held').textContent).toBe('It will download when you’re back online.');
  });
});

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
    expect(container.querySelector('.dl-shelf-kicker').textContent).toBe('The Volumes of Truth');
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
    expect([...container.querySelectorAll('.dl-shelf-kicker')].map((k) => k.textContent)).toEqual(['The Volumes of Truth', 'The Bible · KJV · BRM']);
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

  it('shows what is on its way and what did not download, with Cancel all and Retry all (n2-05)', () => {
    const s = fakeStore();
    s.cancelAll = vi.fn();
    const failed = [{ url: U('c'), key: 'one:c', title: 'Letter c' }];
    s.pending = () => ({ busy: 12, failed });
    const { container, getByRole } = render(<AudioOfflineScreen onBack={() => {}} />);
    expect(container.textContent).toMatch(/Downloading · 12 recordings to go/);
    expect(container.textContent).toMatch(/Did not download · 1 recording/);
    fireEvent.click(getByRole('button', { name: /^cancel all/i }));
    expect(s.cancelAll).toHaveBeenCalledTimes(1);
    fireEvent.click(getByRole('button', { name: /^retry all/i }));
    expect(s.download).toHaveBeenCalledWith(failed);
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
