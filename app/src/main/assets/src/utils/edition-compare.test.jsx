// @ts-nocheck: reads the edition files and index.html with node:fs
/* Compare editions (n166): a scripture sheet's reference in every other edition on this device.
   Editions in memory read where they are, editions on the device read from their file (never put
   on window), editions not downloaded are named and never fetched. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { editionVerse } from '../data/translations.js';
import { editionBookId } from '../data/scripture-resolution.js';
import { bibleReady, compareParts, compareText, compareEditions, readCompare, parseEditionFile, _resetCompareForTests } from './edition-compare.js';
import { OfflineEditions, editionUrl } from './offline-editions.js';
import { EditionCompare } from '../ui/components/EditionCompare.jsx';

const ASSETS = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OPTIONS = [
  { id: 'nkjv', label: 'NKJV', desc: 'New King James Version — default' },
  { id: 'rnkjv', label: 'NKJV-R', desc: 'NKJV Restored Name — x' },
  { id: 'web', label: 'WEB', desc: 'World English Bible — x' },
  { id: 'hnv', label: 'HNV', desc: 'Hebrew Names Version — x' },
  { id: 'kjv', label: 'KJV', desc: 'King James Version 1769 — x' },
  { id: 'rkjv', label: 'KJV-R', desc: 'KJV Restored Name — x', base: 'kjv' },
];
const BOOKS_STUB = {
  daniel: { id: 'daniel', title: 'Daniel', chapters: [{ num: 7, sections: [{ verses: [{ n: 13, text: 'NKJV 7:13' }, { n: 14, text: 'NKJV 7:14' }] }] }] },
  romans: { id: 'romans', title: 'Romans', chapters: [{ num: 16, sections: [{ verses: [{ n: 25, text: 'NKJV 16:25' }] }] }] },
  matthew: { id: 'matthew', title: 'Matthew', chapters: [{ num: 19, sections: [{ verses: [{ n: 14, text: 'NKJV Matthew 19:14' }] }] }] },
};
const FILES = {
  web: 'var BIBLE_WEB = {"daniel":{"7":[{"n":13,"text":"WEB 7:13"},{"n":14,"text":"WEB 7:14"}]},"matthew-plain":{"19":[{"n":14,"text":"WEB Matthew 19:14"}]}};',
  kjv: 'var BIBLE_KJV = {"daniel":{"7":[{"n":13,"text":"KJV 7:13"},{"n":14,"text":"KJV 7:14"}]}};',
  rkjv: '/* overlay */\nvar BIBLE_RKJV = {\n"mark":{"1":[{"n":1,"text":"RKJV Mark 1:1"}]}\n};\n',
  rnkjv: '/* overlay */\nvar BIBLE_RNKJV = {\n"mark":{"1":[{"n":1,"text":"RNKJV Mark 1:1"}]}\n};\n',
};

let swDescriptor;
let fetched;
beforeEach(() => {
  swDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  fetched = [];
  OfflineEditions._reset();
  _resetCompareForTests();
  vi.stubGlobal('TRANSLATION_OPTIONS', OPTIONS);
  window.__ALL_BOOKS = BOOKS_STUB;
  window.BIBLE_KJV = { daniel: { 7: [{ n: 13, text: 'KJV 7:13' }, { n: 14, text: 'KJV 7:14' }] } };
  // On the device: web, rkjv, rnkjv (kjv is in memory, hnv was never downloaded).
  const held = new Set(['web', 'rkjv', 'rnkjv'].map(editionUrl));
  vi.stubGlobal('caches', { match: vi.fn(async (url) => (held.has(url) ? {} : undefined)) });
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    fetched.push(url);
    const code = /bible-([a-z]+)\.js$/.exec(url)[1];
    return { ok: true, text: async () => FILES[code] };
  }));
  Object.defineProperty(navigator, 'serviceWorker', { value: { controller: {} }, configurable: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (swDescriptor) Object.defineProperty(navigator, 'serviceWorker', swDescriptor);
  else delete navigator.serviceWorker;
  delete window.__ALL_BOOKS;
  delete window.BIBLE_KJV;
  delete window.BIBLE_WEB;
  delete window.BIBLE_HNV;
  OfflineEditions._reset();
  _resetCompareForTests();
});

describe('editionVerse', () => {
  it('reads the edition, never the NKJV, for a verse it lacks', () => {
    expect(editionVerse('daniel', 7, 13, 'kjv')).toBe('KJV 7:13');
    expect(editionVerse('daniel', 7, 99, 'kjv')).toBeNull();
    expect(editionVerse('daniel', 7, 13, 'web')).toBeNull(); // not loaded, none lent
  });

  it('follows the versification alias, a blank verse counting as a miss', () => {
    const web = { romans: { 14: [{ n: 24, text: 'WEB doxology' }], 16: [{ n: 25, text: '' }] } };
    expect(editionVerse('romans', 16, 25, 'web', { web })).toBe('WEB doxology');
  });

  it('an overlay reads its base where it is silent; the NKJV overlay reads the NKJV verse', () => {
    const rkjv = { mark: { 1: [{ n: 1, text: 'RKJV' }] } };
    expect(editionVerse('mark', 1, 1, 'rkjv', { rkjv })).toBe('RKJV');
    expect(editionVerse('daniel', 7, 13, 'rkjv', { rkjv })).toBe('KJV 7:13');
    expect(editionVerse('daniel', 7, 13, 'rnkjv', { rnkjv: {} }, 'NKJV 7:13')).toBe('NKJV 7:13');
  });
});

describe('compareParts', () => {
  it('splits a compound cite into verse parts and leaves out what it cannot place', () => {
    expect(compareParts('Daniel 7:13-14; Romans 16:25')).toEqual([
      { label: 'Daniel 7:13-14', bookId: 'daniel', chapter: 7, from: 13, to: 14 },
      { label: 'Romans 16:25', bookId: 'romans', chapter: 16, from: 25, to: 25 },
    ]);
    expect(compareParts('Daniel 7')).toEqual([]);
    expect(compareParts('Hezekiah 1:1')).toEqual([]);
  });
});

describe('EditionCompare', () => {
  it('stays shut and reads nothing until asked', () => {
    render(<EditionCompare cite="Daniel 7:13" />);
    expect(screen.getByRole('button', { name: 'Compare editions' }).getAttribute('aria-expanded')).toBe('false');
    expect(fetched).toEqual([]);
  });

  it('shows each edition on the device under its name and names the one not downloaded, fetching only device files', async () => {
    render(<EditionCompare cite="Daniel 7:13" />);
    fireEvent.click(screen.getByRole('button', { name: 'Compare editions' }));
    await waitFor(() => expect(screen.getByText('WEB 7:13')).toBeTruthy());
    await waitFor(() => expect(screen.getAllByText('KJV 7:13')).toHaveLength(2)); // KJV, and KJV-R over it
    expect(screen.getByText('NKJV 7:13')).toBeTruthy(); // NKJV-R, silent here, reads the NKJV
    expect(screen.getByText('Not downloaded: HNV')).toBeTruthy();
    const labels = [...document.querySelectorAll('.sc-compare-ed')].map((n) => n.firstChild.textContent);
    expect(labels).toEqual(['NKJV-R', 'WEB', 'KJV', 'KJV-R']);
    expect(fetched.map((u) => /bible-([a-z]+)\.js$/.exec(u)[1]).sort()).toEqual(['rkjv', 'rnkjv', 'web']);
    expect(window.BIBLE_WEB).toBeUndefined(); // read and let go, never put on window
  });

  it("reads Matthew from each edition's plain Matthew, not the study book id (Corbin 10-24: every edition 'Not in this edition' on Matthew 19:14)", async () => {
    render(<EditionCompare cite="Matthew 19:14" />);
    fireEvent.click(screen.getByRole('button', { name: 'Compare editions' }));
    await waitFor(() => expect(screen.getByText('WEB Matthew 19:14')).toBeTruthy());
    expect(screen.getByText('NKJV Matthew 19:14')).toBeTruthy(); // NKJV-R, silent here, reads the NKJV
  });

  it('numbers the verses of a range', async () => {
    render(<EditionCompare cite="Daniel 7:13-14" />);
    fireEvent.click(screen.getByRole('button', { name: 'Compare editions' }));
    const webRow = () => [...document.querySelectorAll('.sc-compare-text')].find((p) => p.textContent.includes('WEB 7:14'));
    await waitFor(() => expect(webRow()).toBeTruthy());
    expect([...webRow().querySelectorAll('sup')].map((s) => s.textContent)).toEqual(['13', '14']);
    expect(webRow().textContent).toBe('13WEB 7:13 14WEB 7:14');
  });
});

describe('bibleReady', () => {
  it('is true while the NKJV Bible is on the page', () => {
    expect(bibleReady()).toBe(true);
  });

  it('reads the BOOKS global when __ALL_BOOKS is absent, and is false with neither', () => {
    delete window.__ALL_BOOKS;
    vi.stubGlobal('BOOKS', BOOKS_STUB);
    expect(bibleReady()).toBe(true);
    vi.unstubAllGlobals();
    expect(bibleReady()).toBe(false);
  });
});

describe('compareText', () => {
  const parts = [{ label: 'Daniel 7:13-14', bookId: 'daniel', chapter: 7, from: 13, to: 14 }];

  it('reads the NKJV verse where the overlay is silent', () => {
    expect(compareText(parts, 'rnkjv', { rnkjv: {} })).toEqual([
      { label: 'Daniel 7:13-14', verses: [{ n: 13, text: 'NKJV 7:13' }, { n: 14, text: 'NKJV 7:14' }] },
    ]);
  });

  it('is silent where the NKJV book has no chapters, or no such chapter', () => {
    window.__ALL_BOOKS = { daniel: { id: 'daniel', title: 'Daniel' } };
    expect(compareText(parts, 'rnkjv', { rnkjv: {} })[0].verses).toEqual([
      { n: 13, text: null }, { n: 14, text: null },
    ]);
    window.__ALL_BOOKS = { daniel: { id: 'daniel', title: 'Daniel', chapters: [{ num: 8, sections: [{ verses: [{ n: 13, text: 'NKJV 8:13' }] }] }] } };
    expect(compareText(parts, 'rnkjv', { rnkjv: {} })[0].verses).toEqual([
      { n: 13, text: null }, { n: 14, text: null },
    ]);
  });

  it('reads a chapter kept as verses, not sections, and a chapter with neither', () => {
    window.__ALL_BOOKS = { daniel: { id: 'daniel', title: 'Daniel', chapters: [{ num: 7, verses: [{ n: 13, text: 'NKJV 7:13' }, { n: 14, text: 'NKJV 7:14' }] }] } };
    expect(compareText(parts, 'rnkjv', { rnkjv: {} })[0].verses).toEqual([
      { n: 13, text: 'NKJV 7:13' }, { n: 14, text: 'NKJV 7:14' },
    ]);
    window.__ALL_BOOKS = { daniel: { id: 'daniel', title: 'Daniel', chapters: [{ num: 7 }] } };
    expect(compareText(parts, 'rnkjv', { rnkjv: {} })[0].verses).toEqual([
      { n: 13, text: null }, { n: 14, text: null },
    ]);
  });

  it('reads across a section with no verses, and counts a blank or untexted verse as a miss', () => {
    window.__ALL_BOOKS = { daniel: { id: 'daniel', title: 'Daniel', chapters: [{ num: 7, sections: [{}, { verses: [{ n: 13, text: ' ' }, { n: 14, text: 42 }] }] }] } };
    expect(compareText(parts, 'rnkjv', { rnkjv: {} })[0].verses).toEqual([
      { n: 13, text: null }, { n: 14, text: null },
    ]);
  });
});

describe('compareEditions', () => {
  it('names only the editions in memory before any check', () => {
    expect(compareEditions()).toEqual({ shown: ['kjv'], missing: [] });
  });

  it('shows every edition on the device and names the missing one, after a check', async () => {
    await OfflineEditions.check();
    expect(compareEditions()).toEqual({ shown: ['rnkjv', 'web', 'kjv', 'rkjv'], missing: ['hnv'] });
  });

  it('shows everything on Android, where every edition is packaged', async () => {
    await OfflineEditions.check();
    vi.stubGlobal('PlatformBridge', { isAndroid: true });
    expect(compareEditions()).toEqual({ shown: ['rnkjv', 'web', 'hnv', 'kjv', 'rkjv'], missing: [] });
  });

  it('treats a null or bridgeless PlatformBridge as not Android', async () => {
    await OfflineEditions.check();
    vi.stubGlobal('PlatformBridge', null);
    expect(compareEditions().shown).toEqual(['rnkjv', 'web', 'kjv', 'rkjv']);
    vi.stubGlobal('PlatformBridge', {});
    expect(compareEditions().shown).toEqual(['rnkjv', 'web', 'kjv', 'rkjv']);
  });

  it('names an edition missing by its base, and leaves one with no base and no record unnamed', async () => {
    await OfflineEditions.check();
    vi.stubGlobal('TRANSLATION_OPTIONS', [
      ...OPTIONS,
      { id: 'zzmb', label: 'ZZ-MB', desc: 'x', base: 'kjv' },
      { id: 'zzhb', label: 'ZZ-HB', desc: 'x', base: 'web' },
      { id: 'zzno', label: 'ZZ-NO', desc: 'x' },
    ]);
    expect(compareEditions()).toEqual({ shown: ['rnkjv', 'web', 'kjv', 'rkjv'], missing: ['hnv', 'zzmb'] });
  });
});

describe('readCompare', () => {
  const parts = () => compareParts('Daniel 7:13');

  it('reads without a liveness check and without TRANSLATION_OPTIONS', async () => {
    const p = parts();
    vi.stubGlobal('TRANSLATION_OPTIONS', undefined);
    const rows = [];
    await readCompare('Daniel 7:13', p, ['web'], (code, text) => rows.push([code, text]));
    expect(rows).toEqual([['web', [{ label: 'Daniel 7:13', verses: [{ n: 13, text: 'WEB 7:13' }] }]]]);
  });

  it('stops before the first edition when told it is no longer live', async () => {
    const onRow = vi.fn();
    await readCompare('Daniel 7:13', parts(), ['web', 'kjv'], onRow, () => false);
    expect(onRow).not.toHaveBeenCalled();
    expect(fetched).toEqual([]);
  });

  it('stops between editions when told it is no longer live', async () => {
    let calls = 0;
    const isLive = () => ++calls <= 2;
    const rows = [];
    await readCompare('Daniel 7:13', parts(), ['web', 'kjv'], (code, _text) => rows.push(code), isLive);
    expect(rows).toEqual(['web']);
  });

  it('stops after an edition, before its row, when told it is no longer live', async () => {
    let calls = 0;
    const isLive = () => ++calls <= 1;
    const rows = [];
    await readCompare('Daniel 7:13', parts(), ['web', 'kjv'], (code, _text) => rows.push(code), isLive);
    expect(rows).toEqual([]);
  });

  it('names the edition it could not read, null, when its file will not answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => { fetched.push(url); return { ok: false, status: 404, text: async () => '' }; }));
    const rows = [];
    await readCompare('Daniel 7:13', parts(), ['web'], (code, text) => rows.push([code, text]));
    expect(rows).toEqual([['web', null]]);
  });

  it('reads a cite once and answers the second look from memory', async () => {
    const rows = [];
    const run = async () => { await readCompare('Daniel 7:13', parts(), ['web'], (code, text) => rows.push([code, text])); };
    await run();
    await run();
    expect(fetched).toHaveLength(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(rows[1]);
  });

  it('keeps a borrowed base file while a later edition still needs it, and fetches it once', async () => {
    delete window.BIBLE_KJV;
    const rows = [];
    await readCompare('Daniel 7:13', parts(), ['kjv', 'rkjv'], (code, text) => rows.push([code, text]));
    expect(fetched.map((u) => /bible-([a-z]+)\.js$/.exec(u)[1])).toEqual(['kjv', 'rkjv']);
    expect(rows).toEqual([
      ['kjv', [{ label: 'Daniel 7:13', verses: [{ n: 13, text: 'KJV 7:13' }] }]],
      ['rkjv', [{ label: 'Daniel 7:13', verses: [{ n: 13, text: 'KJV 7:13' }] }]],
    ]);
  });
});

describe('parseEditionFile', () => {
  it('refuses a file that defines no edition object', () => {
    expect(() => parseEditionFile('nothing here')).toThrow('not an edition file');
  });

  it('reads every shipped edition file to the object its script defines', () => {
    const html = readFileSync(resolve(ASSETS, 'index.html'), 'utf8');
    const block = /const TRANSLATION_OPTIONS = \[([\s\S]*?)\];/.exec(html)[1];
    const ids = [...block.matchAll(/id: '([a-z]+)'/g)].map((m) => m[1]).filter((id) => id !== 'nkjv');
    for (const id of ids) {
      const data = parseEditionFile(readFileSync(resolve(ASSETS, 'src/data/bible-' + id + '.js'), 'utf8'));
      const first = data.genesis || data['matthew-plain'];
      expect(first, id).toBeTruthy();
      expect(typeof Object.values(first)[0][0].text, id).toBe('string');
    }
  });

  it('every book a cite can name is a book of every shipped full edition', () => {
    const books = readFileSync(resolve(ASSETS, 'src/data/books.js'), 'utf8');
    const ids = ['matthew', ...[...books.matchAll(/^ {2}"?([a-z0-9]+)"?: \{$/gm)].map((m) => m[1])];
    expect(ids.length).toBe(66);
    for (const code of ['web', 'bsb', 'hnv', 'kjv', 'asv', 'lsv', 'ylt', 'rvr']) {
      const data = parseEditionFile(readFileSync(resolve(ASSETS, 'src/data/bible-' + code + '.js'), 'utf8'));
      expect(ids.filter((b) => !data[editionBookId(b)]), code).toEqual([]);
    }
  });
});
