// @ts-nocheck: reads the edition files and index.html with node:fs
/* offline-editions (mw-oe1) — which Bible editions open offline on this device, and one
   "Download all" that fetches only the missing ones. The status comes from the caches,
   never from what a download believed it did. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { OfflineEditions, EDITION_BYTES, editionCodes, editionBytes, formatEditionBytes, editionUrl, editionShownLabel } from './offline-editions.js';
import { OfflineEditionsRow } from '../ui/components/OfflineEditionsRow.jsx';

const ASSETS = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OPTIONS = [
  { id: 'nkjv', label: 'NKJV' }, { id: 'web', label: 'WEB' }, { id: 'kjv', label: 'KJV' }, { id: 'rkjv', label: 'KJV-R', base: 'kjv' },
];

/** A cache that holds `held` urls; a fetch through the "worker" adds the url unless `fail` names its code. */
function stubWorld({ held = [], fail = [], controller = true } = {}) {
  const cached = new Set(held.map(editionUrl));
  const fetched = [];
  vi.stubGlobal('TRANSLATION_OPTIONS', OPTIONS);
  vi.stubGlobal('caches', { match: vi.fn(async (url) => (cached.has(url) ? {} : undefined)) });
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    fetched.push(url);
    const code = /bible-([a-z]+)\.js$/.exec(url)[1];
    if (fail.includes(code)) throw new TypeError('Failed to fetch');
    cached.add(url);
    return { ok: true, body: { cancel: vi.fn(async () => {}) } };
  }));
  Object.defineProperty(navigator, 'serviceWorker', { value: { controller: controller ? {} : null }, configurable: true });
  return { cached, fetched };
}

let swDescriptor;
beforeEach(() => {
  swDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  OfflineEditions._reset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (swDescriptor) Object.defineProperty(navigator, 'serviceWorker', swDescriptor);
  else delete /** @type {any} */ (navigator).serviceWorker;
  OfflineEditions._reset();
});

describe('the edition sizes', () => {
  it('EDITION_BYTES names every shipped edition but NKJV, at its file\'s real size (within 2 %)', () => {
    const html = readFileSync(resolve(ASSETS, 'index.html'), 'utf8');
    const block = /const TRANSLATION_OPTIONS = \[([\s\S]*?)\];/.exec(html)[1];
    const ids = [...block.matchAll(/id: '([a-z]+)'/g)].map((m) => m[1]).filter((id) => id !== 'nkjv');
    expect(Object.keys(EDITION_BYTES).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      const size = statSync(resolve(ASSETS, 'src/data/bible-' + id + '.js')).size;
      expect(Math.abs(EDITION_BYTES[id] - size) / size, id).toBeLessThan(0.02);
    }
  });

  it('sums and rounds to whole MB, never 0 MB', () => {
    expect(editionBytes(['web', 'kjv'])).toBe(EDITION_BYTES.web + EDITION_BYTES.kjv);
    expect(formatEditionBytes(editionBytes(['web', 'kjv']))).toBe('9 MB');
    expect(formatEditionBytes(1000)).toBe('1 MB');
  });

  it('editionCodes follows the picker and leaves NKJV (built in) out', () => {
    vi.stubGlobal('TRANSLATION_OPTIONS', OPTIONS);
    expect(editionCodes()).toEqual(['web', 'kjv', 'rkjv']);
  });
});

describe('OfflineEditions.check', () => {
  it('reads the caches: some held -> partial with both lists', async () => {
    stubWorld({ held: ['kjv'] });
    expect(await OfflineEditions.check()).toBe('partial');
    expect(OfflineEditions.getState()).toMatchObject({ have: ['kjv'], missing: ['web', 'rkjv'] });
  });

  it('all held -> complete', async () => {
    stubWorld({ held: ['web', 'kjv', 'rkjv'] });
    expect(await OfflineEditions.check()).toBe('complete');
  });

  it('no worker controls the page (it could not keep a download) -> unsupported', async () => {
    stubWorld({ controller: false });
    expect(await OfflineEditions.check()).toBe('unsupported');
  });

  it('the APK (every edition packaged) -> unsupported, the caches never asked', async () => {
    stubWorld();
    vi.stubGlobal('PlatformBridge', { isAndroid: true });
    expect(await OfflineEditions.check()).toBe('unsupported');
    expect(/** @type {any} */ (globalThis).caches.match).not.toHaveBeenCalled();
  });
});

describe('OfflineEditions.downloadAll', () => {
  it('fetches only the missing editions, one at a time, and ends complete', async () => {
    const w = stubWorld({ held: ['kjv'] });
    expect(await OfflineEditions.downloadAll()).toBe('complete');
    expect(w.fetched).toEqual([editionUrl('web'), editionUrl('rkjv')]);
    expect(OfflineEditions.getState()).toMatchObject({ phase: 'complete', missing: [], done: 2, total: 2 });
  });

  it('a fetch that fails stops the run; the next run fetches only what is still missing', async () => {
    const w = stubWorld({ fail: ['kjv'] });
    expect(await OfflineEditions.downloadAll()).toBe('stopped');
    expect(OfflineEditions.getState()).toMatchObject({ have: ['web'], missing: ['kjv', 'rkjv'] });
    expect(w.fetched).toEqual([editionUrl('web'), editionUrl('kjv')]);
    w.fetched.length = 0;
    vi.mocked(globalThis.fetch).mockImplementation(async (url) => { w.fetched.push(url); w.cached.add(url); return /** @type {any} */ ({ ok: true }); });
    expect(await OfflineEditions.downloadAll()).toBe('complete');
    expect(w.fetched).toEqual([editionUrl('kjv'), editionUrl('rkjv')]);
  });

  it('a fetch that answers but leaves nothing in the cache (another build\'s copy) is not counted', async () => {
    stubWorld();
    vi.mocked(globalThis.fetch).mockImplementation(async () => /** @type {any} */ ({ ok: true }));
    expect(await OfflineEditions.downloadAll()).toBe('stopped');
    expect(OfflineEditions.getState().have).toEqual([]);
  });

  it('two taps share one run', async () => {
    const w = stubWorld();
    const a = OfflineEditions.downloadAll();
    const b = OfflineEditions.downloadAll();
    expect(a).toBe(b);
    await a;
    expect(w.fetched.length).toBe(3);
  });

  it('a check while downloading keeps the downloading phase', async () => {
    stubWorld();
    let release;
    vi.mocked(globalThis.fetch).mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const run = OfflineEditions.downloadAll();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await OfflineEditions.check();
    expect(OfflineEditions.getState().phase).toBe('downloading');
    release({ ok: false });
    expect(await run).toBe('stopped');
  });
});

describe('OfflineEditionsRow', () => {
  it('draws nothing where it cannot keep a download', async () => {
    stubWorld({ controller: false });
    const { container } = render(<OfflineEditionsRow translation="nkjv" />);
    await act(async () => {});
    expect(container.innerHTML).toBe('');
  });

  it('offers Download all with the size of what is missing, and runs it', async () => {
    const w = stubWorld({ held: ['kjv'] });
    render(<OfflineEditionsRow translation="nkjv" />);
    await act(async () => {});
    expect(screen.getByRole('status').textContent).toBe('1 of 3 on this device. The edition you pick downloads when you pick it.');
    const btn = screen.getByRole('button', { name: 'Download all · ' + formatEditionBytes(EDITION_BYTES.web + EDITION_BYTES.rkjv) });
    await act(async () => { fireEvent.click(btn); });
    await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe('All 3 are on this device and open offline. NKJV is built in.'));
    expect(w.fetched.length).toBe(2);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a stopped download says so and offers Try again', async () => {
    stubWorld({ fail: ['web'] });
    render(<OfflineEditionsRow translation="nkjv" />);
    await act(async () => {});
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Download all/ })); });
    await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe('0 of 3 on this device. The download stopped: check the connection.'));
    expect(screen.getByRole('button', { name: /^Try again · \d+ MB$/ })).toBeTruthy();
  });

  it('reads the caches again when the picked edition\'s script lands', async () => {
    const w = stubWorld();
    render(<OfflineEditionsRow translation="web" />);
    await act(async () => {});
    expect(screen.getByRole('status').textContent).toMatch(/^Only NKJV is on this device\./);
    w.cached.add(editionUrl('web'));
    const s = document.createElement('script');
    s.src = 'https://example.test/src/data/bible-web.js';
    document.body.appendChild(s);
    await act(async () => { s.dispatchEvent(new Event('load')); });
    expect(screen.getByRole('status').textContent).toMatch(/^1 of 3 on this device\./);
    s.remove();
  });
});

// U09.2 / s05.1: Home and Settings said "WEB" while the Bible showed NKJV (WEB picked offline, never downloaded).
describe('the picked edition as the reader sees it', () => {
  afterEach(() => { delete /** @type {any} */ (window).BIBLE_WEB; });

  it('says "· NKJV until it downloads" while the text is in neither memory nor the device', async () => {
    stubWorld({ held: ['kjv'] });
    await OfflineEditions.check();
    expect(editionShownLabel('web')).toBe('WEB · NKJV until it downloads');
    expect(editionShownLabel('nkjv')).toBe('NKJV');
  });

  it('names the edition alone once its text is in memory, or when it is on the device', async () => {
    stubWorld({ held: ['kjv'] });
    await OfflineEditions.check();
    /** @type {any} */ (window).BIBLE_WEB = {};
    expect(editionShownLabel('web')).toBe('WEB');
    delete /** @type {any} */ (window).BIBLE_WEB;
    stubWorld({ held: ['web'] });
    await OfflineEditions.check();
    expect(editionShownLabel('web')).toBe('WEB');
  });

  it('says nothing more where the store cannot tell (the APK, a page no worker controls)', async () => {
    stubWorld({ controller: false });
    await OfflineEditions.check();
    expect(OfflineEditions.getState().phase).toBe('unsupported');
    expect(editionShownLabel('web')).toBe('WEB');
  });
});
