/* h1104-19: offline, a lazy file that failed to load was asked for again by the next render, forever.
   ─────────────────────────────────────────────────────────────────────────
   As found (2026-11-04): many screens ask index.html's __makeLazyLoader for their corpus FROM RENDER (screen-routes'
   _kickVot on Library, Notes, Journal, Bookmarks, My Progress, Answers, the Scripture Web; audio-lengths' lengthOf on
   every Listening row). A failed load bumps the corpus, the bump re-renders, the render asks again, and the retry's
   own bump and the next failure re-render once more: offline that never ends (a script tag, a re-render and two
   diagnostic errors per round, for as long as the screen is open). And nothing tried again when the network came
   back, so a screen that had failed offline stayed broken until a tap or a restart.

   CONTRACT: a load that failed is not tried again by an ask that follows it within RETRY_GAP_MS (the renders its own
   failure caused); an explicit retry (load(true): Try again) always is, and the browser's 'online' event retries
   every failed loader on its own. index.html's loader script is evaluated verbatim, as in lazy-loader-ran.test.js. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSETS = dirname(fileURLToPath(import.meta.url));
const INDEX = readFileSync(resolve(ASSETS, 'index.html'), 'utf8');
const PATH = 'dist/bundle-a-vot.js';

/** The 'online' listeners each install adds, removed after the case (the app installs its loaders once). */
const listeners = [];
function installIndexLoaders() {
  const add = window.addEventListener.bind(window);
  const spy = vi.spyOn(window, 'addEventListener').mockImplementation((t, fn, o) => { if (t === 'online') listeners.push(fn); return add(t, fn, o); });
  try { run(); } finally { spy.mockRestore(); }
}
function run() {
  const m = INDEX.match(/<script>\s*(window\.__makeLazyLoader = function[\s\S]*?)<\/script>/);
  if (!m) throw new Error('could not find the __makeLazyLoader script in index.html');
  new Function(m[1])();
}
const injected = () => [...document.head.querySelectorAll('script[src]')].filter((s) => s.getAttribute('src') === PATH);
const failLatest = () => { const s = injected(); s[s.length - 1].dispatchEvent(new Event('error')); };
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  for (const k of ['__makeLazyLoader', '__bibleCorpus', '__loadBibleCorpus', '__matthewCorpus', '__loadMatthewCorpus',
    '__votCorpus', '__loadVotCorpus', '__votSwTookOver', '__votOtherCorpus']) delete window[k];
  document.head.innerHTML = '';
  for (const fn of listeners.splice(0)) window.removeEventListener('online', fn);
  vi.useRealTimers();
});

describe('a lazy load that failed offline (h1104-19)', () => {
  it('a screen that asks again on every render after the failure does not loop', async () => {
    installIndexLoaders();
    const corpus = window.__votCorpus;
    // a render-phase kick: every bump re-renders, and the render asks for the corpus again
    corpus.subscribe(() => { window.__loadVotCorpus().catch(() => {}); });
    window.__loadVotCorpus().catch(() => {});
    for (let round = 0; round < 10 && injected().length; round++) { failLatest(); await flush(); }
    expect(injected(), 'every failure was asked for again by the render it caused').toHaveLength(1);
    expect(corpus.error).toBe(true);
  });

  it('Try again (an explicit retry) fetches it again at once; a later ask does too', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    installIndexLoaders();
    window.__loadVotCorpus().catch(() => {});
    failLatest();
    window.__loadVotCorpus().catch(() => {});
    expect(injected()).toHaveLength(1);
    window.__loadVotCorpus(true).catch(() => {});
    expect(injected(), 'Try again did nothing').toHaveLength(2);
    failLatest();
    vi.advanceTimersByTime(10000);
    window.__loadVotCorpus().catch(() => {});
    expect(injected(), 'a new ask, well after the failure, must try again').toHaveLength(3);
  });

  it('the network coming back retries a failed load on its own, and it loads', async () => {
    installIndexLoaders();
    window.__loadVotCorpus().catch(() => {});
    failLatest();
    await flush();
    window.dispatchEvent(new Event('online'));
    expect(injected(), 'nothing tried again when the network came back').toHaveLength(2);
    window.__finishVotInit = () => {};
    for (const g of ['LETTERS_V1', 'LETTERS', 'LETTERS_V3', 'LETTERS_V4', 'LETTERS_V5', 'LETTERS_V6', 'LETTERS_V7',
      'LETTERS_TIMOTHY', 'LETTERS_FLOCK', 'LETTERS_REBUKE', 'WTLB_ONE', 'WTLB_TWO', 'WTLB_SCRIPTURES', 'THE_BLESSED',
      'HOLY_DAYS', 'HIDDEN_MANNA', 'AUDIO_MANIFEST']) window[g] = {};
    const s = injected();
    s[s.length - 1].dispatchEvent(new Event('load'));
    expect(window.__votCorpus.loaded).toBe(true);
    window.dispatchEvent(new Event('online'));
    expect(injected(), 'a loaded corpus is never fetched again').toHaveLength(2);
    for (const g of ['__finishVotInit', 'LETTERS_V1', 'LETTERS', 'LETTERS_V3', 'LETTERS_V4', 'LETTERS_V5', 'LETTERS_V6', 'LETTERS_V7',
      'LETTERS_TIMOTHY', 'LETTERS_FLOCK', 'LETTERS_REBUKE', 'WTLB_ONE', 'WTLB_TWO', 'WTLB_SCRIPTURES', 'THE_BLESSED',
      'HOLY_DAYS', 'HIDDEN_MANNA', 'AUDIO_MANIFEST']) delete window[g];
  });

  it('a corpus nobody asked for is not fetched when the network comes back', () => {
    installIndexLoaders();
    window.dispatchEvent(new Event('online'));
    expect(injected()).toHaveLength(0);
  });
});
