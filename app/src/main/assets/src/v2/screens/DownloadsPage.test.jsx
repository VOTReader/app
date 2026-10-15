/* Settings > Downloads (v2lis B1; picture 7f-downloads, design's dz16): main's "On this phone" shelf as a page, then the
   download settings main kept elsewhere (Download only on Wi-Fi, Songs kept on this phone, the Garden's Image quality) and
   Remove all with main's confirm. The gate shows states.json's seed and does nothing; a real boot reads and drives main's
   OfflineAudio, SongKeep and saved settings (fakes here), in main's words. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { V2App } from '../App.jsx';
import { DownloadsPage } from './DownloadsPage.jsx';
import { PLACES } from '../places.js';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const MB = 1024 * 1024;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const text = (root, sel) => { const n = root.querySelector(sel); return n ? n.textContent : null; };
const texts = (root, sel) => [...root.querySelectorAll(sel)].map((n) => n.textContent);
const rowByTitle = (root, t) => [...root.querySelectorAll('.srow')].find((r) => r.querySelector('.t') && r.querySelector('.t').textContent === t);
const dlRow = (root, t) => [...root.querySelectorAll('.row.dlr')].find((r) => text(r, '.t') === t);
const buttonByText = (root, t) => [...root.querySelectorAll('button')].find((b) => b.textContent === t);
const Page = /** @type {any} */ (DownloadsPage);

// Volume One as the corpus ships it (the first letters' ids and titles; scripture-resolution's record)
const ONE = { volKey: 'one', readKey: 'volume-one', globalName: 'LETTERS_V1', prefaceGlobal: 'LETTERS_V1_PREFACE', label: 'Volume One', kind: 'letter', letterScreen: 'vot-one-letter' };
const FIRST = [
  ['chosen-by-god', 'Chosen by God'],
  ['honor-not-the-day-of-the-dead-honor-god', 'Honor Not the Day of the Dead... Honor God'],
  ['christmas', 'Christmas'],
  ['wisdom-regarding-those-who-killed-the-messiah-who-is-called-christ', 'Wisdom Regarding Those Who Killed The Messiah, Who Is Called Christ'],
];
function installCorpus() {
  g.COLLECTIONS = [ONE];
  g.COL_BY_KEY = new Map([['one', ONE]]);
  g.LETTERS_V1 = Array.from({ length: 29 }, (_x, i) => ({ id: FIRST[i] ? FIRST[i][0] : 'v1-' + (i + 1), title: FIRST[i] ? FIRST[i][1] : 'Letter ' + (i + 1), num: i + 1, blocks: [] }));
  g.GARDEN_TIERS = [
    { id: 'mobile', label: 'Mobile', res: '2160px', size: '~110 MB', desc: 'Screen-native; light on cell data' },
    { id: 'standard', label: 'Standard', res: '2880px', size: '~180 MB', desc: 'Balanced default — great at 1× and 1.5× zoom' },
    { id: 'native', label: 'Native', res: '3600px', size: '~320 MB', desc: 'Full source detail; no upscaling' },
    { id: 'ultra', label: 'Ultra', res: '4600px', size: '~680 MB', desc: 'Maximum quality — for pixel-peepers' },
  ];
}

afterEach(() => {
  cleanup();
  for (const k of ['COLLECTIONS', 'COL_BY_KEY', 'LETTERS_V1', 'GARDEN_TIERS', 'OfflineAudio', 'SongKeep', 'StateStore', 'DownloadGate', 'AudioPlayer']) delete g[k];
  delete PLACES.songs;
  delete html.dataset.gate;
  localStorage.clear();
  vi.restoreAllMocks();
});

/** A saved recording as main's OfflineAudio lists it. */
const saved = (key, title, mb, hoursAgo, over = {}) => ({
  url: 'https://x/' + (key || 'nokey') + '/' + title.replace(/\W+/g, '-') + '.mp3', key, title, bytes: Math.round(mb * MB),
  savedAt: Date.UTC(2026, 9, 15, 12) - hoursAgo * 3600 * 1000, stale: false, ...over,
});

/** main's OfflineAudio as the page reads and drives it: items newest first, every action a spy, emit() = a store change. */
function fakeOffline({ items = [], busy = 0, failed = [], waiting = false, updating = [], available = true, loaded = true } = {}) {
  const listeners = new Set();
  let v = 0;
  const off = {
    items: [...items],
    available: () => available, loaded: () => loaded, subscribe: vi.fn((cb) => { listeners.add(cb); return () => listeners.delete(cb); }),
    getVersion: () => v,
    totalBytes: () => off.items.reduce((n, it) => n + it.bytes, 0),
    pending: () => ({ busy, failed }),
    waiting: () => waiting,
    isUpdating: (url) => updating.includes(url),
    remove: vi.fn(), update: vi.fn(), cancelAll: vi.fn(), download: vi.fn(), removeAll: vi.fn(), checkForUpdates: vi.fn(),
    emit(next) { off.items = next; v += 1; for (const cb of listeners) cb(); },
  };
  off.itemsFn = () => [...off.items].sort((a, b) => b.savedAt - a.savedAt);
  return { ...off, items: off.itemsFn, _off: off };
}

/** main's SongKeep: kept song ids newest first, their catalog bytes, the ones to download again. */
function fakeSongs({ kept = [], bytes = 0, missing = [], availability = 'ok' } = {}) {
  return { availability: () => availability, keptIds: () => kept, bytesOf: () => bytes, missing: () => missing, subscribe: () => () => {}, getVersion: () => 0 };
}

/** A ready StateStore holding `settings`; set() keeps what it was given. */
function fakeStore(settings = {}) {
  const store = { st: { settings }, isReady: () => true, get: () => store.st, set: vi.fn((s) => { store.st = s; }) };
  return store;
}

const bare = (props = {}) => render(<Page gate={null} desktop={false} device="phone" onReady={() => {}} go={vi.fn()} {...props} />);

describe('gate 7f-downloads', () => {
  it('the picture: lede, Downloading bar, four rows (one Bible book as one row), the settings groups, Remove all', async () => {
    installCorpus();
    const { container: c } = render(<V2App gateId="7f-downloads" />);
    expect(text(c, '.page-head h1.display')).toBe('Downloads');
    expect(text(c, '.page-head .lede')).toBe('6 recordings · 40.4 MB. They play with no signal.');
    expect(texts(c, '.dl-head .dl-bar span')).toEqual(['Downloading · 2 recordings to go']);
    expect(texts(c, '.dl-head .dl-bar .textbtn')).toEqual(['Cancel all']);
    expect(text(c, '.label.dll')).toBe('Recordings');
    expect(texts(c, '.rows.dlrs .row.dlr .t')).toEqual(['Chosen by God', 'Honor Not the Day of the Dead... Honor God', 'Christmas', 'John']);
    expect(texts(c, '.rows.dlrs .row.dlr .s')).toEqual([
      'Volume One · Letter 1 · 9.6 MB', 'Volume One · Letter 2 · 8.4 MB', 'Volume One · Letter 3 · 7.9 MB · Update available',
      'Bible · 3 chapters · 14.5 MB',
    ]);
    expect(texts(c, '.row.dlr .textbtn')).toEqual(['Update']);
    expect(dlRow(c, 'Christmas').querySelector('.textbtn').getAttribute('aria-label')).toBe('Update Christmas on this phone');
    expect([...c.querySelectorAll('.row.dlr .ic')].map((b) => b.getAttribute('aria-label'))).toEqual([
      'Remove Chosen by God from this phone', 'Remove Honor Not the Day of the Dead... Honor God from this phone',
      'Remove Christmas from this phone', 'Remove John, 3 recordings, from this phone',
    ]);
    expect(c.querySelector('.row.dlr .ic svg')).not.toBeNull();
    expect(texts(c, '.settings.dlx .label')).toEqual(['Downloading', 'Songs', 'A Return to The Garden']);
    const wifi = rowByTitle(c, 'Download only on Wi-Fi');
    expect([wifi.getAttribute('role'), wifi.getAttribute('aria-checked')]).toEqual(['switch', 'false']);
    expect(text(wifi, '.s')).toBe('Downloads wait for Wi-Fi, so they never use mobile data');
    expect(text(rowByTitle(c, 'Songs kept on this phone'), '.s')).toBe('2 · 7.6 MB');
    // its chevron comes with v2's Songs page (zones' dz14): the next describe pins both ways
    expect(text(rowByTitle(c, 'Image quality'), '.s')).toBe('Standard · ~180 MB · 2880px');
    expect(texts(c, '.g.dla .btn2')).toEqual(['Remove all']);
    expect(text(c, '.tb .title')).toBe('Settings');
    expect(text(c, '.tab[aria-current="page"]')).toBe('Home');
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
  });

  it('is inert: no store is read or driven, nothing is written, no sheet opens', async () => {
    installCorpus();
    const store = fakeStore({});
    g.StateStore = store;
    const off = fakeOffline({ items: [saved('one:christmas', 'Christmas', 2, 1)] });
    g.OfflineAudio = off;
    g.DownloadGate = { setWifiOnly: vi.fn() };
    const { container: c } = render(<V2App gateId="7f-downloads" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    click(dlRow(c, 'Chosen by God').querySelector('.ic'));
    click(dlRow(c, 'John').querySelector('.ic'));
    click(dlRow(c, 'Christmas').querySelector('.textbtn'));
    click(buttonByText(c, 'Cancel all'));
    click(rowByTitle(c, 'Download only on Wi-Fi'));
    click(rowByTitle(c, 'Image quality'));
    click(buttonByText(c, 'Remove all'));
    expect(c.querySelector('.sheet')).toBeNull();
    expect(rowByTitle(c, 'Download only on Wi-Fi').getAttribute('aria-checked')).toBe('false');
    expect(texts(c, '.rows.dlrs .row.dlr .t')).toHaveLength(4);
    const o = off._off;
    for (const fn of [o.remove, o.update, o.cancelAll, o.removeAll, o.download, o.checkForUpdates, o.subscribe, store.set, g.DownloadGate.setWifiOnly]) {
      expect(fn).not.toHaveBeenCalled();
    }
    expect(localStorage.length).toBe(0);
  });

  it('the laptop says this computer', () => {
    installCorpus();
    const { container: c } = render(<Page gate={{ stack: [], facts: {} }} desktop device="computer" onReady={() => {}} go={vi.fn()} />);
    // the gate's seed with no shelf facts: an empty shelf in the laptop's words
    expect(text(c, '.page-head .lede')).toBe('Recordings you download play with no signal.');
    expect(text(c, '.dle')).toBe('Nothing is on this computer yet. Download a recording from its row in a collection, or a whole collection at once, and it plays with no signal.');
  });
});

describe('Settings opens it', () => {
  it('4a\'s Downloads row opens the page, titled Downloads, Back to Settings', async () => {
    installCorpus();
    const { container: c } = render(<V2App gateId="4a-settings" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    click(rowByTitle(c, 'Downloads'));
    expect(text(c, '.page-head h1.display')).toBe('Downloads');
    expect(text(c, '.tb .title')).toBe('Settings');
  });
});

describe('a real boot (main\'s stores)', () => {
  const shelf = () => [
    saved('one:chosen-by-god', 'Chosen by God', 9.6, 1),
    // a letter in two parts: one row
    saved('one:wisdom-regarding-those-who-killed-the-messiah-who-is-called-christ', 'Wisdom Regarding Those Who Killed The Messiah, Who Is Called Christ · Part 2', 6, 2),
    saved('one:wisdom-regarding-those-who-killed-the-messiah-who-is-called-christ', 'Wisdom Regarding Those Who Killed The Messiah, Who Is Called Christ · Part 1', 5, 2.5),
    saved('one:christmas', 'Christmas', 7.9, 3, { stale: true }),
    saved('bible-brm-kjv:john', 'John 2', 4.6, 4),
    saved('bible-brm-kjv:john', 'John 1', 4.9, 4.1),
  ];

  it('groups main\'s items by recording, newest first, and says where each is from', () => {
    installCorpus();
    g.OfflineAudio = fakeOffline({ items: shelf() });
    const { container: c } = bare();
    expect(text(c, '.page-head .lede')).toBe('6 recordings · 38 MB. They play with no signal.');
    expect(texts(c, '.row.dlr .t')).toEqual(['Chosen by God', 'Wisdom Regarding Those Who Killed The Messiah, Who Is Called Christ', 'Christmas', 'John']);
    expect(texts(c, '.row.dlr .s')).toEqual([
      'Volume One · Letter 1 · 9.6 MB', 'Volume One · Letter 4 · 2 parts · 11 MB', 'Volume One · Letter 3 · 7.9 MB · Update available',
      'Bible · 2 chapters · 9.5 MB',
    ]);
    expect(c.querySelector('.dl-head')).toBeNull();
    // opening the page asks the store whether anything on it was uploaded again (main's shelf, n2-01)
    expect(g.OfflineAudio._off.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('a recording\'s trash removes it at once; a group asks first in main\'s words; Update fetches the new bytes', () => {
    installCorpus();
    const off = fakeOffline({ items: shelf() });
    g.OfflineAudio = off;
    const { container: c } = bare();
    click(dlRow(c, 'Chosen by God').querySelector('.ic'));
    expect(off._off.remove).toHaveBeenCalledWith([shelf()[0].url]);
    click(dlRow(c, 'Christmas').querySelector('.textbtn'));
    expect(off._off.update).toHaveBeenCalledWith([shelf()[3]]);
    const john = dlRow(c, 'John').querySelector('.ic');
    expect(john.getAttribute('aria-label')).toBe('Remove John, 2 recordings, from this phone');
    click(john);
    expect(off._off.remove).toHaveBeenCalledTimes(1);
    const sheet = c.querySelector('.sheet.ask');
    expect(text(sheet, '.sh')).toBe('Remove John (2 recordings, 9.5 MB) from this phone?');
    expect(text(sheet, '.fine')).toBe('They can be downloaded again.');
    expect(texts(sheet, 'button').filter((t) => t)).toEqual(['Yes, remove', 'Keep them']);
    click(buttonByText(sheet, 'Keep them'));
    expect(c.querySelector('.sheet')).toBeNull();
    expect(off._off.remove).toHaveBeenCalledTimes(1);
    click(john);
    click(buttonByText(c.querySelector('.sheet.ask'), 'Yes, remove'));
    expect(off._off.remove).toHaveBeenLastCalledWith([shelf()[5].url, shelf()[4].url]);
    expect(c.querySelector('.sheet')).toBeNull();
  });

  it('an update on its way says Updating, with no Update button', () => {
    installCorpus();
    const items = shelf();
    g.OfflineAudio = fakeOffline({ items, updating: [items[3].url] });
    const { container: c } = bare();
    expect(text(dlRow(c, 'Christmas'), '.s')).toBe('Volume One · Letter 3 · 7.9 MB · Updating');
    expect(dlRow(c, 'Christmas').querySelector('.textbtn')).toBeNull();
  });

  it('main\'s status lines, each only when it applies: Updates available (2+), Downloading, Did not download', () => {
    installCorpus();
    const items = shelf();
    items[0].stale = true;
    const failed = [{ url: 'https://x/f.mp3', key: 'one:v1-9', title: 'Letter 9' }];
    const off = fakeOffline({ items, busy: 1, failed });
    g.OfflineAudio = off;
    const { container: c } = bare();
    expect(texts(c, '.dl-head .dl-bar span')).toEqual(['Updates available · 2 recordings', 'Downloading · 1 recording to go', 'Did not download · 1 recording']);
    click(buttonByText(c, 'Update all'));
    expect(off._off.update).toHaveBeenCalledWith([items[0], items[3]]);
    click(buttonByText(c, 'Cancel all'));
    expect(off._off.cancelAll).toHaveBeenCalledTimes(1);
    click(buttonByText(c, 'Retry all'));
    expect(off._off.download).toHaveBeenCalledWith(failed);
  });

  it('downloads held for Wi-Fi say so in the bar, as 4c\'s queue does', () => {
    installCorpus();
    g.OfflineAudio = fakeOffline({ items: shelf(), busy: 2, waiting: true });
    const { container: c } = bare();
    expect(texts(c, '.dl-head .dl-bar span')).toEqual(['Waiting for Wi-Fi · 2 recordings to go']);
  });

  it('Remove all asks first with main\'s words, then empties the shelf through main\'s removeAll', () => {
    installCorpus();
    const off = fakeOffline({ items: shelf() });
    g.OfflineAudio = off;
    const { container: c } = bare();
    click(buttonByText(c, 'Remove all'));
    const sheet = c.querySelector('.sheet.ask');
    expect(sheet.getAttribute('aria-label')).toBe('Remove all downloads');
    expect(text(sheet, '.sh')).toBe('Remove all 6 recordings (38 MB) from this phone?');
    expect(text(sheet, '.fine')).toBe('They can be downloaded again.');
    click(buttonByText(sheet, 'Yes, remove all'));
    expect(off._off.removeAll).toHaveBeenCalledTimes(1);
    expect(c.querySelector('.sheet')).toBeNull();
  });

  it('follows the store: a removal re-draws the rows; one recording has no Remove all; empty says main\'s words, the settings stay', () => {
    installCorpus();
    const off = fakeOffline({ items: shelf() });
    g.OfflineAudio = off;
    const { container: c } = bare();
    act(() => off._off.emit([saved('one:christmas', 'Christmas', 7.9, 3)]));
    expect(texts(c, '.row.dlr .t')).toEqual(['Christmas']);
    expect(text(c, '.page-head .lede')).toBe('1 recording · 7.9 MB. They play with no signal.');
    expect(c.querySelector('.dla')).toBeNull();
    act(() => off._off.emit([]));
    expect(c.querySelector('.row.dlr')).toBeNull();
    expect(c.querySelector('.label.dll')).toBeNull();
    expect(text(c, '.page-head .lede')).toBe('Recordings you download play with no signal.');
    expect(text(c, '.dle')).toBe('Nothing is on this phone yet. Download a recording from its row in a collection, or a whole collection at once, and it plays with no signal.');
    expect(texts(c, '.settings.dlx .label')).toEqual(['Downloading', 'A Return to The Garden']);
  });

  it('where nothing can be kept (a Safari tab, a private window): says so; no shelf, no Wi-Fi switch', () => {
    installCorpus();
    g.OfflineAudio = fakeOffline({ available: false });
    const { container: c } = bare();
    expect(text(c, '.page-head .lede')).toBe('This browser cannot keep recordings, so here they play only with a signal.');
    expect(c.querySelector('.dle')).toBeNull();
    expect(rowByTitle(c, 'Download only on Wi-Fi')).toBeUndefined();
    expect(c.querySelector('.dla')).toBeNull();
    expect(texts(c, '.settings.dlx .label')).toEqual(['A Return to The Garden']);
  });

  it('before the store has read what it holds: the plain lede, no empty words yet', () => {
    installCorpus();
    g.OfflineAudio = fakeOffline({ loaded: false });
    const { container: c } = bare();
    expect(text(c, '.page-head .lede')).toBe('Recordings you download play with no signal.');
    expect(c.querySelector('.dle')).toBeNull();
  });

  it('Download only on Wi-Fi flips main\'s key and tells the download stores', () => {
    installCorpus();
    g.OfflineAudio = fakeOffline({ items: shelf() });
    const store = fakeStore({ downloadWifiOnly: false });
    g.StateStore = store;
    g.DownloadGate = { setWifiOnly: vi.fn(), canTell: () => true };
    const { container: c } = bare();
    const wifi = () => rowByTitle(c, 'Download only on Wi-Fi');
    expect(wifi().getAttribute('aria-checked')).toBe('false');
    click(wifi());
    expect(store.st.settings).toEqual({ downloadWifiOnly: true, touched: { downloadWifiOnly: true } });
    expect(g.DownloadGate.setWifiOnly).toHaveBeenCalledWith(true);
    expect(wifi().getAttribute('aria-checked')).toBe('true');
    click(wifi());
    expect(store.st.settings.downloadWifiOnly).toBe(false);
    expect(g.DownloadGate.setWifiOnly).toHaveBeenLastCalledWith(false);
  });

  it('a browser that cannot tell Wi-Fi from mobile data says so rather than promise it (main\'s words)', () => {
    installCorpus();
    g.OfflineAudio = fakeOffline({});
    g.DownloadGate = { setWifiOnly: vi.fn(), canTell: () => false };
    const { container: c } = bare();
    expect(text(rowByTitle(c, 'Download only on Wi-Fi'), '.s')).toBe('This browser cannot tell Wi-Fi from mobile data, so here downloads always go ahead');
  });

  it('Songs kept on this phone: main\'s count and size, or what to download again, or None yet; hidden where songs cannot be kept', () => {
    installCorpus();
    g.OfflineAudio = fakeOffline({});
    g.SongKeep = fakeSongs({ kept: ['s1', 's2'], bytes: 7.6 * MB });
    let r = bare();
    expect(text(rowByTitle(r.container, 'Songs kept on this phone'), '.s')).toBe('2 · 7.6 MB');
    cleanup();
    g.SongKeep = fakeSongs({ missing: ['s1', 's2', 's3'] });
    r = bare();
    expect(text(rowByTitle(r.container, 'Songs kept on this phone'), '.s')).toBe('3 to download again');
    cleanup();
    g.SongKeep = fakeSongs({});
    r = bare();
    expect(text(rowByTitle(r.container, 'Songs kept on this phone'), '.s')).toBe('None yet');
    cleanup();
    g.SongKeep = fakeSongs({ availability: 'none' });
    r = bare();
    expect(rowByTitle(r.container, 'Songs kept on this phone')).toBeUndefined();
  });

  it('the Songs row opens the kept songs once v2 has a Songs page, and is a plain line until then', () => {
    installCorpus();
    g.OfflineAudio = fakeOffline({});
    g.SongKeep = fakeSongs({ kept: ['s1'], bytes: 3 * MB });
    let go = vi.fn();
    let r = bare({ go });
    let row = rowByTitle(r.container, 'Songs kept on this phone');
    expect(row.tagName).not.toBe('BUTTON');
    expect(row.querySelector('.chev')).toBeNull();
    cleanup();
    PLACES.songs = { Screen: () => null };
    go = vi.fn();
    r = bare({ go });
    row = rowByTitle(r.container, 'Songs kept on this phone');
    expect(row.tagName).toBe('BUTTON');
    click(row);
    expect(go).toHaveBeenCalledWith({ place: 'songs', list: 'kept' });
  });

  it('Image quality: main\'s four tiers in a sheet; a pick writes main\'s gardenTier', () => {
    installCorpus();
    g.OfflineAudio = fakeOffline({});
    const store = fakeStore({});
    g.StateStore = store;
    const { container: c } = bare();
    expect(text(rowByTitle(c, 'Image quality'), '.s')).toBe('Standard · ~180 MB · 2880px');
    click(rowByTitle(c, 'Image quality'));
    const sheet = c.querySelector('.sheet.pick');
    expect(text(sheet, '.sh')).toBe('Image quality');
    expect(texts(sheet, '.srow.opt .t')).toEqual(['Mobile · ~110 MB', 'Standard · ~180 MB', 'Native · ~320 MB', 'Ultra · ~680 MB']);
    expect(texts(sheet, '.srow.opt .s')[0]).toBe('2160px · Screen-native; light on cell data');
    expect(sheet.querySelector('.srow.opt.on .t').textContent).toBe('Standard · ~180 MB');
    click(rowByTitle(sheet, 'Mobile · ~110 MB'));
    expect(store.st.settings).toEqual({ gardenTier: 'mobile', touched: { gardenTier: true } });
    expect(c.querySelector('.sheet')).toBeNull();
    expect(text(rowByTitle(c, 'Image quality'), '.s')).toBe('Mobile · ~110 MB · 2160px');
  });

  it('says ready once the letters\' corpus has answered, so the rows say which letter', async () => {
    installCorpus();
    g.OfflineAudio = fakeOffline({ items: shelf() });
    const onReady = vi.fn();
    bare({ onReady });
    await waitFor(() => expect(onReady).toHaveBeenCalled());
  });
});
