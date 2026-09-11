// @vitest-environment jsdom
/* build-version — the announcer's ask is held OPEN (w-toast-ask-open, 2026-09-11).
   A decision taken at a fixed 3 s before the worker speaks was the defect: on a
   cold start of the live origin the reply lost the race to the page's own boot
   (or the worker it was posted to retired mid-ask), and 'unknown' or 'first' was
   decided in its place — a null decided into a value. Settings keeps its 3 s
   getBuildVersion() for its render; the announcer waits. */
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
const flush = () => new Promise((r) => setTimeout(r, 0));

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

  it('a worker retired before it answered is not waited on: the ask is re-posted to the new controller on controllerchange', async () => {
    const a = fakeWorker('A'), b = fakeWorker('B');
    const sw = fakeContainer(a);
    const announcer = awaitBuildVersion();
    await flush();
    expect(a.asks.length, 'asked once of the old worker').toBe(1);
    sw.controller = b;                                 // skipWaiting + claim: A is redundant, its queue gone
    sw.dispatchEvent(new Event('controllerchange'));
    await flush();
    expect(b.asks.length, 'asked again of the new one').toBe(1);
    b.answer('v1.0.2-dddddddddd');
    await vi.advanceTimersByTimeAsync(0);
    expect(await announcer).toEqual({ cacheVersion: 'v1.0.2-dddddddddd', corpusVersion: 'c45' });
    sw.dispatchEvent(new Event('controllerchange'));   // settled: no further asks
    await flush();
    expect(a.asks.length + b.asks.length).toBe(2);
  });

  it('uncontrolled (a first visit): null at once, so the caller can read the deployed file instead', async () => {
    fakeContainer(null);
    expect(await awaitBuildVersion()).toBeNull();
  });
});
