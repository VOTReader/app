// @ts-nocheck — a fake NetworkInformation (an EventTarget with a type) stands in for navigator.connection
// ra6 (Corbin 2026-10-14, brief design-10): Download only on Wi-Fi, the gate the download stores share.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { canTell, downloadsWait, networkType, onGateChange, setWifiOnly, wifiOnly, _resetDownloadGate } from './download-gate.js';

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
