/* v2 Settings' Downloads row on a real boot (v2lis, v2-gaps 15; picture 4a-settings): it counts the recordings main's
   OfflineAudio keeps on this device and their size, keeps its plain line where nothing can be kept or before the store
   has read what it holds, and follows the store as recordings come and go. A gate boot says what its picture says. */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { SettingsPlace } from './SettingsScreen.jsx';
import { downloadFacts, readFacts } from '../settings-facts.js';
import { GATE_STATES } from '../gate.js';

const g = /** @type {any} */ (globalThis);
const MB = 1024 * 1024;
const PLAIN = 'Recordings saved for listening offline';

/** main's OfflineAudio as v2 reads it: what it holds, whether it has read that yet, and its subscription. */
function fakeStore({ available = true, loaded = true, items = /** @type {any[]} */ ([]), bytes = 0 } = {}) {
  const subs = new Set();
  let version = 0;
  const s = {
    available: () => available, loaded: () => loaded, items: () => items, totalBytes: () => bytes,
    getVersion: () => version,
    subscribe: (cb) => { subs.add(cb); return () => { subs.delete(cb); }; },
    /** the store changed (a download landed, a removal, the first read): its subscribers hear it */
    set(next) {
      if ('loaded' in next) loaded = next.loaded;
      if ('items' in next) items = next.items;
      if ('bytes' in next) bytes = next.bytes;
      version += 1;
      act(() => { subs.forEach((cb) => cb()); });
    },
  };
  g.OfflineAudio = s;
  return s;
}
const rec = (n) => ({ url: 'https://x/r' + n + '.mp3', key: 'one:' + n, title: 'Letter ' + n, bytes: 1, savedAt: n });
const downloadsSub = (root) => [...root.querySelectorAll('.srow')][3].querySelector('.s').textContent;
const Place = /** @type {any} */ (SettingsPlace);

afterEach(() => { cleanup(); delete g.OfflineAudio; });

describe('downloadFacts', () => {
  it('counts the recordings kept and their bytes once the store has read them', () => {
    fakeStore({ items: [rec(1), rec(2)], bytes: 48 * MB });
    expect(downloadFacts()).toEqual({ count: 2, bytes: 48 * MB });
    fakeStore({ items: [], bytes: 0 });
    expect(downloadFacts()).toEqual({ count: 0, bytes: 0 });
  });
  it('is null with no store, where nothing can be kept, before the first read, or when the store throws', () => {
    expect(downloadFacts()).toBeNull();
    fakeStore({ available: false });
    expect(downloadFacts()).toBeNull();
    fakeStore({ loaded: false });
    expect(downloadFacts()).toBeNull();
    g.OfflineAudio = { available: () => true, loaded: () => true, items: () => { throw new Error('bridge'); }, totalBytes: () => 0 };
    expect(downloadFacts()).toBeNull();
  });
});

describe('Settings > Downloads row', () => {
  it('a real boot keeps its plain line until the store reads, then follows it', () => {
    const store = fakeStore({ loaded: false });
    const { container } = render(<Place facts={readFacts({})} device="phone" gate={null} go={() => {}} />);
    expect(downloadsSub(container)).toBe(PLAIN);
    store.set({ loaded: true, items: [rec(1), rec(2)], bytes: 48 * MB });
    expect(downloadsSub(container)).toBe('2 recordings on this phone · 48 MB');
    store.set({ items: [rec(2)], bytes: 20 * MB });
    expect(downloadsSub(container)).toBe('1 recording on this phone · 20 MB');
    store.set({ items: [], bytes: 0 });
    expect(downloadsSub(container)).toBe('Nothing saved on this phone yet');
  });
  it('names the computer on a laptop, and says the plain line where nothing can be kept', () => {
    fakeStore({ items: [rec(1)], bytes: 640 * 1024 });
    const { container } = render(<Place facts={readFacts({})} device="computer" gate={null} go={() => {}} />);
    expect(downloadsSub(container)).toBe('1 recording on this computer · 640 KB');
    cleanup();
    fakeStore({ available: false });
    const again = render(<Place facts={readFacts({})} device="phone" gate={null} go={() => {}} />);
    expect(downloadsSub(again.container)).toBe(PLAIN);
  });
  it("a gate boot says its picture's words whatever the store holds", () => {
    fakeStore({ items: [rec(1), rec(2), rec(3)], bytes: 900 * MB });
    const gate = GATE_STATES['4a-settings'];
    const { container } = render(<Place facts={gate.facts} device="phone" gate={gate} go={() => {}} />);
    expect(downloadsSub(container)).toBe('1 recording on this phone · 48 MB');
  });
});
