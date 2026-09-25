/* ═══════════════════════════════════════════════════════════════════════
   A lazy screen bundle's own stylesheet (n7-08, tools/split-lazy-css.mjs).

   The rules of app.css that only bundle-e/-f/-g/-h use left the render-
   blocking dist/app.min.css for dist/screens-X.min.css. index.html's
   __makeLazyLoader loads that sheet beside its bundle. What must hold:
   - the script RUNS only once its stylesheet has landed (the routes draw a
     lazy screen the moment its component exists, so a script first would
     draw it unstyled);
   - the sheet sits right after the boot sheet's <link> (and any lazy sheet
     before it), never after the <style> blocks the journal and the
     highlights screen inject: those came after these rules in app.min.css;
   - a sheet that fails does not fail the screen;
   - a new worker claiming the page while the sheet is on its way reloads
     instead of running the NEW build's script (service-worker-1);
   - every lazy screen bundle names its sheet, and the worker precaches it.
   ═══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX = readFileSync(resolve(HERE, './index.html'), 'utf8');
const SW = readFileSync(resolve(HERE, './service-worker.js'), 'utf8');

function installIndexLoaders() {
  const m = INDEX.match(/<script>\s*(window\.__makeLazyLoader = function[\s\S]*?)<\/script>/);
  if (!m) throw new Error('could not find the __makeLazyLoader script in index.html');
  new Function(m[1])();
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const lazySheets = () => [...document.head.querySelectorAll('link[data-lazy-css]')].map((l) => l.getAttribute('href'));
const scripts = () => [...document.head.querySelectorAll('script[src]')].map((s) => s.getAttribute('src'));
const headOrder = () => [...document.head.children].map((e) => e.getAttribute('href') || e.getAttribute('src') || e.id || e.tagName.toLowerCase());
let reload;
let savedLocation;

beforeEach(() => {
  document.head.innerHTML = '<style id="custom-fonts"></style><link rel="stylesheet" href="dist/app.min.css"><style id="jrn-styles"></style>';
  reload = vi.fn();
  savedLocation = Object.getOwnPropertyDescriptor(window, 'location');
  Object.defineProperty(window, 'location', { configurable: true, value: { reload, href: 'http://localhost/index.html' } });
  installIndexLoaders();
});

afterEach(() => {
  for (const k of Object.keys(window)) if (/^__(makeLazyLoader|screens[EFGH]|loadScreens[EFGH]|bibleCorpus|loadBibleCorpus|matthewCorpus|loadMatthewCorpus|votCorpus|loadVotCorpus|votSwTookOver)$/.test(k)) delete window[k];
  if (savedLocation) Object.defineProperty(window, 'location', savedLocation);
  document.head.innerHTML = '';
});

describe('lazy screen stylesheets (n7-08)', () => {
  it('each lazy screen bundle loads its own sheet, and the worker precaches it (never as a critical asset)', () => {
    const critical = (SW.match(/const CRITICAL_ASSETS = new Set\(\[([\s\S]*?)\]\)/) || [])[1] || '';
    expect(critical).toBeTruthy();
    for (const x of ['e', 'f', 'g', 'h']) {
      expect(INDEX).toContain("__makeLazyLoader('screens-" + x + "', 'dist/bundle-" + x + ".js', null, 'dist/screens-" + x + ".min.css')");
      expect(SW).toContain("'./dist/screens-" + x + ".min.css',");
      expect(critical).not.toContain('screens-' + x + '.min.css');
    }
  });

  it('the script runs only once its stylesheet has landed; the screen is announced after both', async () => {
    const done = vi.fn();
    window.__loadScreensH().then(done);
    await flush();
    expect(lazySheets()).toEqual(['dist/screens-h.min.css']);
    expect(scripts(), 'no script before its stylesheet').toEqual([]);
    // It is fetched meanwhile, so waiting costs no second round trip.
    expect(document.head.querySelector('link[rel="preload"][as="script"]').getAttribute('href')).toBe('dist/bundle-h.js');
    document.head.querySelector('link[data-lazy-css]').onload();
    await flush();
    expect(scripts()).toEqual(['dist/bundle-h.js']);
    expect(window.__screensH.loaded).toBe(false);
    document.head.querySelector('script[src="dist/bundle-h.js"]').onload();
    await flush();
    expect(window.__screensH.loaded).toBe(true);
    expect(done).toHaveBeenCalled();
  });

  it('a sheet goes right after the boot sheet, a second one after the first: both before the injected <style> blocks', async () => {
    window.__loadScreensG();
    await flush();
    document.head.querySelector('link[href="dist/screens-g.min.css"]').onload();
    await flush();
    window.__loadScreensE();
    await flush();
    const order = headOrder().filter((x) => /css|styles|fonts/.test(x));
    expect(order).toEqual(['custom-fonts', 'dist/app.min.css', 'dist/screens-g.min.css', 'dist/screens-e.min.css', 'jrn-styles']);
  });

  it('a sheet that fails to load does not fail the screen, and leaves no dead <link>', async () => {
    const done = vi.fn();
    window.__loadScreensF().then(done);
    await flush();
    document.head.querySelector('link[data-lazy-css]').onerror();
    await flush();
    expect(lazySheets()).toEqual([]);
    expect(scripts()).toEqual(['dist/bundle-f.js']);
    document.head.querySelector('script[src="dist/bundle-f.js"]').onload();
    await flush();
    expect(done).toHaveBeenCalled();
    expect(window.__screensF.error).toBe(false);
  });

  it('a sheet stalled on a bad connection holds the screen back 8 s at most; a second load adds no second preload', async () => {
    vi.useFakeTimers();
    try {
      window.__loadScreensG().catch(() => {});
      await vi.advanceTimersByTimeAsync(7900);
      expect(scripts()).toEqual([]);
      await vi.advanceTimersByTimeAsync(200);
      expect(scripts()).toEqual(['dist/bundle-g.js']);
      document.head.querySelector('script[src="dist/bundle-g.js"]').onerror();   // the script fails; the reader taps Try again
      window.__loadScreensG().catch(() => {});
      window.__loadScreensG().catch(() => {});
      await vi.advanceTimersByTimeAsync(0);
      expect(document.head.querySelectorAll('link[rel="preload"]').length).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a new worker claiming the page while the sheet loads: reload, never the NEW build\'s script', async () => {
    window.__loadScreensE();
    await flush();
    window.__votSwTookOver = true;
    document.head.querySelector('link[data-lazy-css]').onload();
    await flush();
    expect(scripts()).toEqual([]);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('a loader without a sheet (the corpora) injects its script at once, as before', () => {
    window.__loadVotCorpus();
    expect(lazySheets()).toEqual([]);
    expect(scripts().length).toBe(1);
  });
});
