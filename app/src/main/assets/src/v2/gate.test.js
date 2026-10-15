/* The ?gate=<id> hook (mw4): which pages it acts on, what each known id fakes, and the "painted" wait the shooters
   (design's desk.py and the S22 gate) rely on: fonts loaded, then two frames. */
import { describe, it, expect, vi } from 'vitest';
import { readGateId, gateState, markGate, whenPainted, GATE_STATES, GATE_NOW, LIVE_HOSTS } from './gate.js';

const at = (hostname, search) => ({ hostname, search });

describe('readGateId', () => {
  it('reads ?gate=<id> on a local or preview build', () => {
    expect(readGateId(at('127.0.0.1', '?gate=4a-settings'))).toBe('4a-settings');
    expect(readGateId(at('appassets.androidplatform.net', '?x=1&gate=1a-letter'))).toBe('1a-letter');
  });
  it('is null with no id, an empty id, or no location', () => {
    expect(readGateId(at('127.0.0.1', ''))).toBe(null);
    expect(readGateId(at('127.0.0.1', '?gate='))).toBe(null);
    expect(readGateId(null)).toBe(null);
  });
  it('never acts on the live website', () => {
    expect(LIVE_HOSTS).toContain('votreader.github.io');
    expect(readGateId(at('votreader.github.io', '?gate=4a-settings'))).toBe(null);
  });
});

describe('gate states', () => {
  it('knows the foundation screens, and nothing inherited from Object', () => {
    expect(gateState('4a-settings')).toBe(GATE_STATES['4a-settings']);
    expect(gateState('1a-letter')).toBe(GATE_STATES['1a-letter']);
    expect(gateState('constructor')).toBe(null);
    expect(gateState('9z-nothing')).toBe(null);
  });
  it('4a-settings: Settings opened from Home (Back says Home), its facts on the frozen Wednesday', () => {
    const s = GATE_STATES['4a-settings'];
    expect(s.stack.map((r) => r.place)).toEqual(['home', 'settings']);
    expect(s.facts.now).toBe(GATE_NOW);
    expect(new Date(GATE_NOW).getUTCDay()).toBe(3);
    expect(s.facts.lastExportAt).toBe(GATE_NOW - 2 * 24 * 3600 * 1000);
  });
  it('1a-letter: Volume One letter 1 under Volume One under Home', () => {
    expect(GATE_STATES['1a-letter'].stack).toEqual([
      { place: 'home' }, { place: 'collection', collection: 'one' }, { place: 'letter', collection: 'one', n: 1 },
    ]);
  });
});

describe('markGate / whenPainted', () => {
  it('markGate writes <html data-gate>', () => {
    markGate('waiting');
    expect(document.documentElement.dataset.gate).toBe('waiting');
    markGate('ready');
    expect(document.documentElement.dataset.gate).toBe('ready');
    delete document.documentElement.dataset.gate;
  });

  it('resolves only after the three faces load, fonts.ready, and two frames', async () => {
    const order = [];
    let releaseFonts;
    const loaded = new Promise((res) => { releaseFonts = res; });
    const fonts = { load: vi.fn(() => loaded.then(() => order.push('face'))), ready: Promise.resolve() };
    const frames = [];
    const raf = (cb) => { order.push('frame'); frames.push(cb); };
    let done = false;
    const p = whenPainted(/** @type {any} */ ({ fonts }), raf).then(() => { done = true; });
    await Promise.resolve();
    expect(fonts.load).toHaveBeenCalledTimes(3);
    expect(frames.length).toBe(0);
    releaseFonts();
    await vi.waitFor(() => expect(frames.length).toBe(1));
    frames.shift()();
    await Promise.resolve();
    expect(done).toBe(false);
    expect(frames.length).toBe(1);
    frames.shift()();
    await p;
    expect(done).toBe(true);
    expect(order).toEqual(['face', 'face', 'face', 'frame', 'frame']);
  });

  it('a face that fails to load still paints (the measure then fails on its own)', async () => {
    const fonts = { load: vi.fn(() => Promise.reject(new Error('404'))), ready: Promise.resolve() };
    await expect(whenPainted(/** @type {any} */ ({ fonts }), (cb) => cb())).resolves.toBe(undefined);
  });
});
