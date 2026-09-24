// @ts-nocheck -- classic-global screen contract (OfflineAudio, AudioPlayer, ScreenLayout, LibraryNav are bundle globals).
/* DOWNLOADS TO THE PHONE (listening item 8; Corbin 2026-09-22 "yes after reset"; built to Codex's mockup round 1,
   option 1: lanes/readalong/out/mockups/offline/r1-1.png).
   A plain line under each recording row says what the phone holds and offers the next step - "Download · 18 MB",
   "Downloading 62%" with Cancel, "On this phone · 16 MB", "Download failed · Retry" (or "Not enough room on this
   phone") and, with no signal, "Needs a connection". Beside Play all, "Download all" asks first with the size and the
   phone's free space. "On this phone" lists every download with its size and a Remove, and Remove all asks first.
   Only in the Android app: on the web the store is unavailable and none of this renders. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { OfflineRowStatus, OfflineCollectionAction, formatBytes } from './OfflineAudioControls.jsx';
import { AudioOfflineScreen } from '../screens/AudioOfflineScreen.jsx';

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

  it('follows the store live (a download finishing turns the row)', () => {
    const s = fakeStore();
    s.st.status.set(U('a'), 'queued');
    const { container } = render(<OfflineRowStatus tracks={[T('a')]} name="Letter a" />);
    expect(container.textContent).toMatch(/Downloading/);
    act(() => { save(s, 'a', 5_000_000); s.bump(); });
    expect(container.textContent).toMatch(/On this phone · 5 MB/);
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
    fireEvent.click(getByRole('button', { name: /download all/i }));
    expect(container.textContent).toMatch(/Download Volume One\?/);
    expect(container.textContent).toMatch(/3 recordings · 210 MB/);
    expect(container.textContent).toMatch(/Free space on this phone: 1.5 GB/);
    // Downloads run while the app is open (SHOULD 9 of the refutation: no background service yet).
    expect(container.textContent).toMatch(/Keep VOTReader open until it finishes/);
    fireEvent.click(getByRole('button', { name: /download 210 MB/i }));
    expect(s.download.mock.calls[0][0].map((t) => t.url)).toEqual([U('b'), U('b2'), U('c')]);
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

describe('On this phone (the shelf)', () => {
  it('lists every download with its size, plays one, removes one, and asks before removing all', () => {
    const s = fakeStore();
    save(s, 'a', 18_000_000, 'I Am The Passover');
    save(s, 'b', 12_000_000, 'Matthew 1');
    const { container, getAllByRole, getByRole } = render(<AudioOfflineScreen onBack={() => {}} />);
    expect(container.querySelector('h1').textContent).toBe('On this phone');
    expect(container.textContent).toMatch(/2 recordings · 30 MB/);
    const rows = container.querySelectorAll('.audio-offline-item');
    expect([...rows].map((r) => r.querySelector('strong').textContent)).toEqual(['Matthew 1', 'I Am The Passover']);
    fireEvent.click(getAllByRole('button', { name: /^remove matthew 1/i })[0]);
    expect(s.remove).toHaveBeenCalledWith([U('b')]);
    fireEvent.click(getByRole('button', { name: /^play i am the passover/i }));
    expect(globalThis.AudioPlayer.playTrack).toHaveBeenCalledWith(expect.objectContaining({ url: U('a'), key: 'one:a', title: 'I Am The Passover' }));
    fireEvent.click(getByRole('button', { name: /^remove all/i }));
    expect(s.removeAll).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/Remove all 2 recordings \(30 MB\) from this phone\?/);
    fireEvent.click(getByRole('button', { name: /^yes, remove all/i }));
    expect(s.removeAll).toHaveBeenCalledTimes(1);
  });

  it('an empty shelf says how to fill it', () => {
    fakeStore();
    const { container } = render(<AudioOfflineScreen onBack={() => {}} />);
    expect(container.textContent).toMatch(/Nothing is on this phone yet/);
  });
});
