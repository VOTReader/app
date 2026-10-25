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
import { compareParts, parseEditionFile, _resetCompareForTests } from './edition-compare.js';
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

describe('parseEditionFile', () => {
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
