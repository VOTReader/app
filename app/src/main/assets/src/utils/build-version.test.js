// @vitest-environment jsdom
/* build-version — the announcer's ask is held OPEN (w-toast-ask-open, 2026-09-11).
   A decision taken at a fixed 3 s before the worker speaks was the defect: on a
   cold start of the live origin the reply lost the race to the page's own boot
   (or the worker it was posted to retired mid-ask), and 'unknown' or 'first' was
   decided in its place — a null decided into a value. Settings keeps its 3 s
   getBuildVersion() for its render; the announcer waits.
   The answer that decides comes from the worker that served THIS document. A
   takeover mid-ask settles null and the new worker is NOT asked: sw-register
   reloads onto it synchronously inside the same controllerchange (its handler is
   registered first, _entry-b.js), so an answer taken from it here would arrive
   before the reload commits, write the last-seen key and toast in a page being
   torn down, and the reloaded page would read 'same' and stay silent. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getBuildVersion, awaitBuildVersion } from './build-version.js';

/** A controller that records its asks and answers when told to. */
function fakeWorker(name) {
  const w = { name, asks: /** @type {MessagePort[]} */ ([]), postMessage(msg, transfer) { if (msg && msg.type === 'GET_VERSION') w.asks.push(transfer[0]); } };
  w.answer = (cacheVersion) => { const port = w.asks[w.asks.length - 1]; port.postMessage({ type: 'VERSION', cacheVersion, corpusVersion: 'c45' }); };
  return w;
}
/** navigator.serviceWorker with a settable controller and a real controllerchange event. */
function fakeContainer(controller) {
  const target = new EventTarget();
  const sw = { controller, addEventListener: target.addEventListener.bind(target), removeEventListener: target.removeEventListener.bind(target), dispatchEvent: target.dispatchEvent.bind(target) };
  Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true });
  return sw;
}
const flush = () => vi.advanceTimersByTimeAsync(0);   // fake timers are on: a real setTimeout would never fire

describe('awaitBuildVersion — the ask the announcer waits for', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });
  afterEach(() => { vi.useRealTimers(); delete /** @type {any} */ (navigator).serviceWorker; });

  it('an answer at 4 s still arrives — where getBuildVersion() (Settings) has already said null at 3 s', async () => {
    const a = fakeWorker('A');
    fakeContainer(a);
    const settings = getBuildVersion();
    const announcer = awaitBuildVersion();
    let settingsSaw = 'pending'; settings.then((v) => { settingsSaw = v; });
    let announcerSaw = 'pending'; announcer.then((v) => { announcerSaw = v; });
    await vi.advanceTimersByTimeAsync(3000);
    expect(settingsSaw, 'control: the render ask gave up at 3 s').toBeNull();
    expect(announcerSaw, 'the announcer is still waiting').toBe('pending');
    await vi.advanceTimersByTimeAsync(1000);
    a.answer('v1.0.2-cccccccccc');
    await vi.advanceTimersByTimeAsync(0);
    expect(await announcer).toEqual({ cacheVersion: 'v1.0.2-cccccccccc', corpusVersion: 'c45' });
  });

  it('a takeover mid-ask settles null and the new worker is NOT asked: it serves the next document, which asks for itself', async () => {
    const a = fakeWorker('A'), b = fakeWorker('B');
    const sw = fakeContainer(a);
    const announcer = awaitBuildVersion();
    expect(a.asks.length, 'asked once of the worker serving this document').toBe(1);
    sw.controller = b;                                 // skipWaiting + claim: A is redundant, its queue gone; sw-register is reloading onto B
    sw.dispatchEvent(new Event('controllerchange'));
    expect(b.asks.length, 'never asked — its answer would land in a page being torn down, write the key, and silence the page that follows').toBe(0);
    expect(await announcer, 'nothing decided here: the reloaded document decides').toBeNull();
    a.answer('v1.0.2-aaaaaaaaaa');                     // the retired worker's late word changes nothing
    await flush();
    expect(await announcer).toBeNull();
    sw.dispatchEvent(new Event('controllerchange'));   // settled: nothing listens
    await flush();
    expect(a.asks.length + b.asks.length).toBe(1);
  });

  it('uncontrolled (a first visit): null at once, so the caller can read the deployed file instead', async () => {
    fakeContainer(null);
    expect(await awaitBuildVersion()).toBeNull();
  });

  it('no serviceWorker at all (a WebView without it): null at once, no throw', async () => {
    delete /** @type {any} */ (navigator).serviceWorker;
    expect('serviceWorker' in navigator, 'precondition').toBe(false);
    expect(await awaitBuildVersion()).toBeNull();
  });
});
