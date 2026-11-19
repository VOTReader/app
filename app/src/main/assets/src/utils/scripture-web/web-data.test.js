/* web-data — Cluster F (bundle-d)

   Tests for ensureScriptureWebData: the Scripture Web's graph asset
   (src/data/scripture-web-data.js) is injected as a script once, the same
   way bible-studies.js is loaded.

   The module keeps its in-flight promise in module state (_swDataPromise),
   so every test gets a fresh module (vi.resetModules + dynamic import) and
   window.SCRIPTURE_WEB_DATA is deleted between tests. The script the module
   creates is captured by spying on document.head.appendChild — the spy
   records the element instead of appending it, so jsdom never tries to
   fetch the asset — and onload / onerror are fired directly on it. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const DATA = { nodes: [{ id: 'gen-1-1' }], edges: [] };

async function loadModule() {
  vi.resetModules();
  return import('./web-data.js');
}

// Start a load and capture the script the module injects.
async function startLoad(mod, force) {
  const appendSpy = vi.spyOn(document.head, 'appendChild').mockImplementation((el) => el);
  const promise = mod.ensureScriptureWebData(force);
  const scripts = appendSpy.mock.calls.map(([el]) => /** @type {HTMLScriptElement} */ (el));
  return { promise, scripts, appendSpy };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  delete window.SCRIPTURE_WEB_DATA;
  vi.restoreAllMocks();
});

describe('fast path: data already in memory', () => {
  it('resolves with the data and appends no script', async () => {
    const mod = await loadModule();
    window.SCRIPTURE_WEB_DATA = DATA;
    const { promise, scripts, appendSpy } = await startLoad(mod);
    await expect(promise).resolves.toBe(DATA);
    expect(scripts).toHaveLength(0);
    appendSpy.mockRestore();
  });

  it('force with data in memory still takes the fast path (no re-inject)', async () => {
    const mod = await loadModule();
    window.SCRIPTURE_WEB_DATA = DATA;
    const { promise, scripts, appendSpy } = await startLoad(mod, true);
    await expect(promise).resolves.toBe(DATA);
    expect(scripts).toHaveLength(0);
    appendSpy.mockRestore();
  });
});

describe('first load', () => {
  it('appends exactly one script with the graph src, async', async () => {
    const mod = await loadModule();
    const { promise, scripts, appendSpy } = await startLoad(mod);
    expect(scripts).toHaveLength(1);
    expect(scripts[0].tagName).toBe('SCRIPT');
    expect(scripts[0].getAttribute('src')).toBe('src/data/scripture-web-data.js');
    expect(scripts[0].async).toBe(true);
    // Resolve the pending load out of band so no promise is left hanging.
    window.SCRIPTURE_WEB_DATA = DATA;
    scripts[0].onload(new Event('load'));
    await expect(promise).resolves.toBe(DATA);
    appendSpy.mockRestore();
  });

  it('a concurrent second call returns the same promise, no second script', async () => {
    const mod = await loadModule();
    const first = await startLoad(mod);
    const secondPromise = mod.ensureScriptureWebData();
    expect(secondPromise).toBe(first.promise);
    expect(first.appendSpy.mock.calls).toHaveLength(1);
    window.SCRIPTURE_WEB_DATA = DATA;
    first.scripts[0].onload(new Event('load'));
    await expect(first.promise).resolves.toBe(DATA);
    await expect(secondPromise).resolves.toBe(DATA);
    first.appendSpy.mockRestore();
  });

  it('onload with data defined resolves with it; a later call takes the fast path', async () => {
    const mod = await loadModule();
    const { promise, scripts, appendSpy } = await startLoad(mod);
    window.SCRIPTURE_WEB_DATA = DATA;
    scripts[0].onload(new Event('load'));
    await expect(promise).resolves.toBe(DATA);
    // Data now in memory: the next call resolves without appending.
    appendSpy.mockClear();
    await expect(mod.ensureScriptureWebData()).resolves.toBe(DATA);
    expect(appendSpy.mock.calls).toHaveLength(0);
    appendSpy.mockRestore();
  });

  it('onload without data rejects with the defined-nothing error and keeps the memo', async () => {
    const mod = await loadModule();
    const { promise, scripts, appendSpy } = await startLoad(mod);
    scripts[0].onload(new Event('load'));
    await expect(promise).rejects.toThrow('scripture-web-data.js loaded but defined nothing');
    // The memo is NOT cleared: a later call returns the same rejected
    // promise and appends no fresh script.
    appendSpy.mockClear();
    await expect(mod.ensureScriptureWebData()).rejects.toThrow('scripture-web-data.js loaded but defined nothing');
    expect(appendSpy.mock.calls).toHaveLength(0);
    appendSpy.mockRestore();
  });

  it('onerror rejects with the fetch error and clears the memo, so a retry appends a fresh script', async () => {
    const mod = await loadModule();
    const { promise, scripts, appendSpy } = await startLoad(mod);
    scripts[0].onerror(new Event('error'));
    await expect(promise).rejects.toThrow('Couldn’t fetch the cross-reference data.');
    // The memo was cleared: a retry appends a fresh script (same spy —
    // spying twice on appendChild would double-wrap it).
    appendSpy.mockClear();
    const retryPromise = mod.ensureScriptureWebData();
    expect(retryPromise).not.toBe(promise);
    expect(appendSpy.mock.calls).toHaveLength(1);
    const retryScript = /** @type {HTMLScriptElement} */ (appendSpy.mock.calls[0][0]);
    expect(retryScript).not.toBe(scripts[0]);
    window.SCRIPTURE_WEB_DATA = DATA;
    retryScript.onload(new Event('load'));
    await expect(retryPromise).resolves.toBe(DATA);
    appendSpy.mockRestore();
  });

  it('force during an in-flight load clears the memo and appends a second script', async () => {
    const mod = await loadModule();
    const first = await startLoad(mod);
    const secondPromise = mod.ensureScriptureWebData(true);
    expect(secondPromise).not.toBe(first.promise);
    expect(first.appendSpy.mock.calls).toHaveLength(2);
    const secondScript = /** @type {HTMLScriptElement} */ (first.appendSpy.mock.calls[1][0]);
    expect(secondScript).not.toBe(first.scripts[0]);
    expect(secondScript.getAttribute('src')).toBe('src/data/scripture-web-data.js');
    // Each load resolves on its own script's load.
    window.SCRIPTURE_WEB_DATA = DATA;
    first.scripts[0].onload(new Event('load'));
    await expect(first.promise).resolves.toBe(DATA);
    secondScript.onload(new Event('load'));
    await expect(secondPromise).resolves.toBe(DATA);
    first.appendSpy.mockRestore();
  });

  it('force with no load in flight starts a fresh load', async () => {
    const mod = await loadModule();
    const { promise, scripts, appendSpy } = await startLoad(mod, true);
    expect(scripts).toHaveLength(1);
    window.SCRIPTURE_WEB_DATA = DATA;
    scripts[0].onload(new Event('load'));
    await expect(promise).resolves.toBe(DATA);
    appendSpy.mockRestore();
  });
});
