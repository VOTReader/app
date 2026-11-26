// @ts-nocheck — a fake NetworkInformation (an EventTarget with a type) stands in for navigator.connection
// ra6 (Corbin 2026-10-14, brief design-10): Download only on Wi-Fi, the gate the download stores share.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bulkDownloadsOk, canTell, downloadsWait, networkType, onGateChange, setWifiOnly, wifiOnly, _resetDownloadGate } from './download-gate.js';

/** navigator.connection as Chrome on Android keeps it: a type, and 'change' when it moves. */
function fakeConnection(type) {
  const c = new EventTarget();
  c.type = type;
  c.move = (next) => { c.type = next; c.dispatchEvent(new Event('change')); };
  return c;
}

const defs = [];
function define(obj, name, value) {
  const had = Object.getOwnPropertyDescriptor(obj, name);
  Object.defineProperty(obj, name, { value, configurable: true, writable: true });
  defs.push(() => { if (had) Object.defineProperty(obj, name, had); else delete obj[name]; });
}

beforeEach(() => { _resetDownloadGate(); });
afterEach(() => {
  while (defs.length) defs.pop()();
  delete window.AndroidBridge;
  _resetDownloadGate();
});

describe('download-gate (ra6)', () => {
  it('off by default: nothing waits, even on mobile data', () => {
    define(navigator, 'connection', fakeConnection('cellular'));
    expect(wifiOnly()).toBe(false);
    expect(downloadsWait()).toBe(false);
  });

  it('on, a browser download waits on mobile data and not on Wi-Fi', () => {
    const c = fakeConnection('cellular');
    define(navigator, 'connection', c);
    setWifiOnly(true);
    expect(downloadsWait()).toBe(true);
    c.type = 'wifi';
    expect(downloadsWait()).toBe(false);
    c.type = 'ethernet';
    expect(downloadsWait()).toBe(false);
  });

  it('a browser that cannot tell the connection type never waits, and says it cannot tell', () => {
    define(navigator, 'connection', { effectiveType: '4g' });   // desktop Chrome: no type
    setWifiOnly(true);
    expect(networkType()).toBe('');
    expect(canTell()).toBe(false);
    expect(downloadsWait()).toBe(false);
    define(navigator, 'connection', undefined);                 // Safari, Firefox
    expect(canTell()).toBe(false);
    expect(downloadsWait()).toBe(false);
  });

  it('only `true` turns it on', () => {
    for (const v of ['true', 1, {}, null, undefined]) { setWifiOnly(v); expect(wifiOnly()).toBe(false); }
    setWifiOnly(true);
    expect(wifiOnly()).toBe(true);
  });

  it('listeners hear the switch and the connection moving, once per change', () => {
    const c = fakeConnection('wifi');
    define(navigator, 'connection', c);
    const cb = vi.fn();
    const off = onGateChange(cb);
    setWifiOnly(true);
    setWifiOnly(true);   // every render pushes it: no change, no call
    expect(cb).toHaveBeenCalledTimes(1);
    c.move('cellular');
    expect(cb).toHaveBeenCalledTimes(2);
    expect(downloadsWait()).toBe(true);
    off();
    c.move('wifi');
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('the phone app is handed the switch: told once on the first push after a page load, then on each change', () => {
    const bridge = { offlineAudioWifiOnly: vi.fn() };
    window.AndroidBridge = bridge;
    expect(canTell()).toBe(true);   // the phone app tells for itself
    setWifiOnly(false);             // the store may hold a value from before this page loaded
    expect(bridge.offlineAudioWifiOnly).toHaveBeenLastCalledWith(false);
    setWifiOnly(false);
    expect(bridge.offlineAudioWifiOnly).toHaveBeenCalledTimes(1);
    setWifiOnly(true);
    expect(bridge.offlineAudioWifiOnly).toHaveBeenLastCalledWith(true);
    expect(bridge.offlineAudioWifiOnly).toHaveBeenCalledTimes(2);
  });

  it('an older shell without the bridge method is left alone', () => {
    window.AndroidBridge = {};
    expect(() => setWifiOnly(true)).not.toThrow();
    expect(wifiOnly()).toBe(true);
  });
});

/* platform-2 + web-platform-n2 (audit 2026-11-23): the meaning files and the song covers came on Data Saver and
   mobile data too. A large download nobody asked for starts only on a link the browser does not call metered. */
describe('bulkDownloadsOk (platform-2)', () => {
  const PIXEL = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
  const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
  it('Data Saver waits, on any link', () => {
    define(navigator, 'connection', Object.assign(fakeConnection('wifi'), { saveData: true }));
    expect(bulkDownloadsOk()).toBe(false);
  });
  it('mobile data waits; Wi-Fi and Ethernet go', () => {
    define(navigator, 'userAgent', PIXEL);
    define(navigator, 'connection', fakeConnection('cellular'));
    expect(bulkDownloadsOk()).toBe(false);
    navigator.connection.type = 'wifi';
    expect(bulkDownloadsOk()).toBe(true);
    navigator.connection.type = 'ethernet';
    expect(bulkDownloadsOk()).toBe(true);
    navigator.connection.type = 'unknown';
    expect(bulkDownloadsOk()).toBe(false);
  });
  it('a desktop browser that reports no type goes; a phone that cannot tell (an iPhone) waits', () => {
    define(navigator, 'connection', { effectiveType: '4g' });
    define(navigator, 'userAgent', DESKTOP);
    expect(bulkDownloadsOk()).toBe(true);
    define(navigator, 'connection', undefined);
    define(navigator, 'userAgent', IPHONE);
    expect(bulkDownloadsOk()).toBe(false);
  });
  it('the client hint wins over the user-agent string', () => {
    define(navigator, 'connection', undefined);
    define(navigator, 'userAgent', DESKTOP);
    define(navigator, 'userAgentData', { mobile: true });
    expect(bulkDownloadsOk()).toBe(false);
  });
  it('the phone app goes on any link: its files are on board', () => {
    define(navigator, 'connection', Object.assign(fakeConnection('cellular'), { saveData: true }));
    window.AndroidBridge = {};
    expect(bulkDownloadsOk()).toBe(true);
  });
});
