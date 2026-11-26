// @ts-nocheck — semantic.js and on-idle.js are stood in for; the words index is built for real.
/* platform-2 (audit 2026-11-23): the words index, once built at launch, started the meaning search's ~45 MB download
   with no network check, on Data Saver and mobile data too. On such a link launch starts nothing, and the first text
   search the model was not ready for starts it, behind that search. */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const sem = vi.hoisted(() => ({ starts: 0 }));
vi.mock('./semantic.js', async (orig) => {
  const real = await orig();
  return {
    ...real,
    startSemantic: () => { sem.starts++; return Promise.resolve(false); },
    semanticStatus: () => ({ status: 'off', failure: null, units: 0, where: '' }),
    semanticDocs: async () => null,
    semanticReady: () => new Promise(() => {}),
  };
});
vi.mock('../utils/on-idle.js', () => ({ onIdle: (fn) => { fn(); return () => {}; } }));

/** A fresh engine: each test's launch builds its own index. */
async function freshEngine() { vi.resetModules(); return (await import('./engine.js')).VotSearchMini; }

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'of', 'and']), SYNONYM_MAP: {}, BOOK_ABBREVS: {}, BOOK_DISPLAY: {}, NAMED_PASSAGES: [],
  NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {}, VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v1', screen: 'vot-one-letter', dataVar: 'LETTERS_V1', prefaceVar: null, label: 'Volume One' }],
  OT_BOOK_IDS: [], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const LETTERS_V1 = [
  { id: 'garment', num: 1, title: 'All Things Pass', blocks: [{ segments: [{ v: 'Hear Me. The earth will grow old like a garment, and all its works shall be burned up.' }] }] },
  { id: 'silver', num: 2, title: 'The Silver Cord', blocks: [{ segments: [{ v: 'Hear Me. The silver cord is loosed and the golden bowl is broken, says The Lord.' }] }] },
];

const defs = [];
function define(obj, name, value) {
  const had = Object.getOwnPropertyDescriptor(obj, name);
  Object.defineProperty(obj, name, { value, configurable: true, writable: true });
  defs.push(() => { if (had) Object.defineProperty(obj, name, had); else delete obj[name]; });
}

describe('the meaning download waits for an unmetered link (platform-2)', () => {
  let prev;
  beforeAll(() => {
    prev = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    globalThis.BOOKS = {};
    globalThis.LETTERS_V1 = LETTERS_V1;
  });
  afterAll(() => {
    window.VotSearchData = prev;
    delete globalThis.BOOKS;
    delete globalThis.LETTERS_V1;
    while (defs.length) defs.pop()();
  });
  beforeEach(() => { sem.starts = 0; });

  it('Data Saver: the built index starts no meaning download; the first text search starts it, once', async () => {
    define(navigator, 'connection', { type: 'wifi', saveData: true });
    const VotSearchMini = await freshEngine();
    await VotSearchMini.init();
    await new Promise((r) => setTimeout(r, 0));
    expect(sem.starts).toBe(0);
    const r = await VotSearchMini.search('earth grow old garment');
    expect(r.meaningLater).toBe(true);
    expect(sem.starts).toBe(1);
    await VotSearchMini.search('silver cord loosed');
    expect(sem.starts).toBe(1);
  });

  it('a desktop browser that reports no type starts it once the index is up, as before', async () => {
    define(navigator, 'connection', { effectiveType: '4g' });
    define(navigator, 'userAgent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36');
    const VotSearchMini = await freshEngine();
    await VotSearchMini.init();
    await new Promise((r) => setTimeout(r, 0));
    expect(sem.starts).toBeGreaterThan(0);
  });
});
