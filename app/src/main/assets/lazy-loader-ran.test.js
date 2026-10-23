// @ts-nocheck
/* sweep v009: a lazy corpus whose bundle never ran must not count as loaded.
   ─────────────────────────────────────────────────────────────────────────
   As found (2026-10-14): index.html's __makeLazyLoader took the script's `load`
   event as success. `load` also fires for a script whose body failed to parse
   or threw part-way (those errors go to window.onerror, never to
   script.onerror), so a bundle that did not run still set loaded=true and
   error=false and resolved. __finishBibleInit returns quietly when BOOKS is
   undefined, bible-idx then renders null (a blank screen with no E1 "Try
   again"), and the resolved promise stays cached, so nothing ever retries.

   CONTRACT: a corpus counts as loaded only when every file its bundle
   concatenates (tools/build.py A_BIBLE / A_MATTHEW / A_VOT) has defined its
   globals. Otherwise the load fails the E1 way: error=true, the promise
   rejects, and the next load() injects the script again.

   index.html's loader script is evaluated verbatim, as the page runs it. jsdom
   never fetches a script, so each case plays the browser's part: it defines the
   globals the bundle's files declare (the bundle ran) or leaves some out (it
   did not), then fires `load`. The CONTROL case also guards the other way: a
   global the loader waits for that no member file declares would fail every
   real load, so it fails here first.

   ANOTHER BUILD'S COPY: offline, or just after a deploy, the service worker
   serves another build's bundle (service-worker.js otherBuildCopy), whose
   file list may differ from this build's. The worker appends one line to its
   end that marks window.__votOtherCorpus, so that mark, made during this load,
   is proof the copy ran to its last line: it loads although a global this
   build names is missing (it read before the fix, and must still, or a reader
   offline on a half-updated corpus loses the letters to a "Try again" that
   cannot work). A mark left from an earlier load, or another bundle's, proves
   nothing about this one. The mark is the worker's own line, run here. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSETS = dirname(fileURLToPath(import.meta.url));
const INDEX = readFileSync(resolve(ASSETS, 'index.html'), 'utf8');
const BUILD = readFileSync(resolve(ASSETS, '..', '..', '..', '..', 'tools', 'build.py'), 'utf8');

/** index.html's inline lazy-loader factory and the IIFE that builds the bible / matthew / vot loaders. */
function installIndexLoaders() {
  const m = INDEX.match(/<script>\s*(window\.__makeLazyLoader = function[\s\S]*?)<\/script>/);
  if (!m) throw new Error('could not find the __makeLazyLoader script in index.html');
  new Function(m[1])();
}

/** Quoted members of build.py's top-level `NAME = [ ... ]` block, comments stripped. */
function members(name) {
  const m = BUILD.match(new RegExp(`^${name} = \\[([\\s\\S]*?)^\\]`, 'm'));
  if (!m) throw new Error(`${name} not found in tools/build.py`);
  const body = m[1].split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
  return [...body.matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/** The top-level `var` names a corpus source file declares: what it defines when it runs. */
function declared(file) {
  return [...readFileSync(resolve(ASSETS, file), 'utf8').matchAll(/^var\s+([A-Za-z_$][\w$]*)/gm)].map((x) => x[1]);
}

const CORPORA = [
  { list: 'A_BIBLE', path: 'dist/bundle-a-bible.js', corpus: '__bibleCorpus', load: '__loadBibleCorpus', finish: '__finishBibleInit' },
  { list: 'A_MATTHEW', path: 'dist/bundle-a-matthew.js', corpus: '__matthewCorpus', load: '__loadMatthewCorpus', finish: '__finishMatthewInit' },
  { list: 'A_VOT', path: 'dist/bundle-a-vot.js', corpus: '__votCorpus', load: '__loadVotCorpus', finish: '__finishVotInit' },
];

const defined = new Set();
/** Play a bundle's files running: each one's top-level vars land on window. */
function run(files) {
  for (const f of files) for (const g of declared(f)) { window[g] = {}; defined.add(g); }
}
const injected = (path) => [...document.head.querySelectorAll('script[src]')].filter((s) => s.getAttribute('src') === path);

/** service-worker.js's otherBuildCopy, verbatim: another build's file plus the line the worker appends to it. */
const otherBuildCopy = (() => {
  const m = readFileSync(resolve(ASSETS, 'service-worker.js'), 'utf8').match(/^async function otherBuildCopy\([\s\S]*?^\}$/m);
  if (!m) throw new Error('could not find otherBuildCopy in service-worker.js');
  return new Function(`return (${m[0]});`)();
})();
/** Run in this page what the worker appends to another build's copy of `path`: that copy reaching its last line. */
async function runWorkerMark(path) {
  const res = await otherBuildCopy(new Response(''), './' + path);
  new Function(await res.text())();
}

/** Start a load, let `whileLoading` play the script's body, fire `load` the way the browser does, and report how the promise settled. */
async function loadAndFire(c, whileLoading) {
  const settled = window[c.load]().then(() => 'resolved', () => 'rejected');
  const scripts = injected(c.path);
  expect(scripts.length, `${c.load}() injected no ${c.path}`).toBeGreaterThan(0);
  if (whileLoading) await whileLoading();
  scripts[scripts.length - 1].dispatchEvent(new Event('load'));
  return settled;
}

function reset() {
  for (const k of ['__makeLazyLoader', '__bibleCorpus', '__loadBibleCorpus', '__matthewCorpus', '__loadMatthewCorpus',
    '__votCorpus', '__loadVotCorpus', '__votSwTookOver', '__votOtherCorpus', ...CORPORA.map((c) => c.finish)]) delete window[k];
  for (const g of defined) delete window[g];
  defined.clear();
  document.head.innerHTML = '';
}
afterEach(reset);

describe.each(CORPORA)('$path: `load` is not proof the bundle ran', (c) => {
  it('the parser read the build list', () => {
    expect(members(c.list).length).toBeGreaterThan(0);
    for (const f of members(c.list)) expect(declared(f).length, `${f} declares no top-level var`).toBeGreaterThan(0);
  });

  it('RED: a bundle that loaded but never ran (a parse error, or a throw in its first file) is an E1 error and Try again fetches it again', async () => {
    installIndexLoaders();
    expect(await loadAndFire(c), 'the load promise resolved over a bundle that defined nothing').toBe('rejected');
    expect(window[c.corpus].loaded, 'the corpus is marked loaded but none of its globals exist').toBe(false);
    expect(window[c.corpus].error, 'no E1 error, so the route never offers "Try again"').toBe(true);
    window[c.load]().catch(() => {});
    expect(injected(c.path), 'the retry reused the cached promise instead of fetching the bundle again').toHaveLength(2);
  });

  it('RED: whichever file of the bundle did not run, the load fails', async () => {
    const files = members(c.list);
    for (const skipped of files) {
      reset();
      installIndexLoaders();
      run(files.filter((f) => f !== skipped));
      expect(await loadAndFire(c), `the load resolved although ${skipped} never ran`).toBe('rejected');
      expect(window[c.corpus].loaded, `marked loaded although ${skipped} never ran`).toBe(false);
      expect(window[c.corpus].error).toBe(true);
    }
  });

  it('CONTROL: a bundle whose every file ran is loaded, runs its finish hook once and resolves', async () => {
    installIndexLoaders();
    const finish = vi.fn();
    window[c.finish] = finish;
    run(members(c.list));
    expect(await loadAndFire(c), 'a bundle that ran in full was refused: the loader waits for a global no member file declares').toBe('resolved');
    expect(window[c.corpus].loaded).toBe(true);
    expect(window[c.corpus].error).toBe(false);
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: another build\'s copy that ran to its end loads, though it lacks a file this build names', async () => {
    installIndexLoaders();
    const files = members(c.list);
    expect(await loadAndFire(c, () => { run(files.slice(0, -1)); return runWorkerMark(c.path); }),
      `another build's ${c.path} ran to its last line without ${files[files.length - 1]} and was refused: offline, the corpus is lost`).toBe('resolved');
    expect(window[c.corpus].loaded).toBe(true);
    expect(window[c.corpus].error).toBe(false);
  });

  it('RED: a mark from an earlier load, or another bundle\'s, does not make a bundle that never ran count as run', async () => {
    window.__votOtherCorpus = ['./' + c.path];
    installIndexLoaders();
    const others = CORPORA.filter((o) => o !== c);
    expect(await loadAndFire(c, async () => { for (const o of others) await runWorkerMark(o.path); }),
      'a stale or foreign mark vouched for a bundle that defined nothing').toBe('rejected');
    expect(window[c.corpus].loaded).toBe(false);
    expect(window[c.corpus].error).toBe(true);
  });
});

/* s01.6: a script that neither loads nor errors (a stalled fetch) left the
   route on a spinner forever. A watchdog turns that into the E1 error path,
   whose "Try again" fetches the bundle again; a copy that lands late still
   counts. */
describe('a stalled corpus load (s01.6)', () => {
  afterEach(() => { vi.useRealTimers(); });
  const c = CORPORA[0];

  it('RED: after the watchdog, a load that never settled is an E1 error and Try again fetches again', async () => {
    vi.useFakeTimers();
    installIndexLoaders();
    const settled = window[c.load]().then(() => 'resolved', () => 'rejected');
    vi.advanceTimersByTime(44000);
    expect(window[c.corpus].error).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(await settled).toBe('rejected');
    expect(window[c.corpus].error, 'no E1 error, so the route spins forever').toBe(true);
    window[c.load]().catch(() => {});
    expect(injected(c.path)).toHaveLength(2);
  });

  it('a stalled copy that lands after the watchdog still loads the corpus', async () => {
    vi.useFakeTimers();
    installIndexLoaders();
    window[c.load]().catch(() => {});
    vi.advanceTimersByTime(46000);
    expect(window[c.corpus].error).toBe(true);
    run(members(c.list));
    injected(c.path)[0].dispatchEvent(new Event('load'));
    expect(window[c.corpus].loaded).toBe(true);
    expect(window[c.corpus].error).toBe(false);
  });
});
