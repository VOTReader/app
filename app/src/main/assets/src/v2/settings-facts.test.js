/* v2 Settings' six rows (picture 4a-settings) and where a real boot reads their facts from (mw4). */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFacts, savedFacts, settingsRows, speedLabel, bibleAudioLabel, sizeLabel, agoLabel } from './settings-facts.js';
import { GATE_STATES, GATE_NOW } from './gate.js';

const DAY = 24 * 3600 * 1000;
const subs = (rows) => rows.map((r) => r.sub);

describe('settingsRows', () => {
  it('says what the picture says for the gate facts (phone)', () => {
    const rows = settingsRows(GATE_STATES['4a-settings'].facts, { device: 'phone' });
    expect(rows.map((r) => r.title)).toEqual(['Text and theme', 'Reading', 'Listening', 'Downloads', 'Your data', 'Help and about']);
    expect(subs(rows)).toEqual([
      'Standard size · Slate · comfortable lines',
      'NKJV · double-tap for full screen',
      'Benjamin first · KJV Bible audio · 1×',
      '1 recording on this phone · 48 MB',
      'Last exported 2 days ago',
      'Show me around · privacy · version',
    ]);
  });
  it('names the computer on a laptop, and counts recordings in the plural', () => {
    const f = { ...GATE_STATES['4a-settings'].facts };
    expect(settingsRows(f, { device: 'computer' })[3].sub).toBe('1 recording on this computer · 48 MB');
    f.downloads = { count: 3, bytes: 1.5 * 1024 * 1024 * 1024 };
    expect(settingsRows(f, { device: 'computer' })[3].sub).toBe('3 recordings on this computer · 1.5 GB');
    f.downloads = { count: 0, bytes: 0 };
    expect(settingsRows(f)[3].sub).toBe('Nothing saved on this phone yet');
  });
  it('drops the double-tap clause when the reader turned it off', () => {
    expect(settingsRows({ ...readFacts({}), doubleTapFullscreen: false })[1].sub).toBe('NKJV');
  });
});

describe('readFacts', () => {
  it("main's defaults read as the picture's words", () => {
    const f = readFacts({});
    expect(subs(settingsRows(f)).slice(0, 3)).toEqual([
      'Standard size · Slate · comfortable lines', 'NKJV · double-tap for full screen', 'Benjamin first · KJV Bible audio · 1×',
    ]);
  });
  it('maps the saved font scale, theme, reader, translation and speed', () => {
    const f = readFacts({ fontScale: 1.15, translation: 'kjv', letterReader: 'T', bibleAudio: 'off' }, { theme: 'light', speed: 1.25 });
    expect(subs(settingsRows(f)).slice(0, 3)).toEqual([
      'Larger size · Paper · comfortable lines', 'KJV · double-tap for full screen', 'Timothy first · Bible audio off · 1.25×',
    ]);
    expect(readFacts({ fontScale: '0.9' }).textSize).toBe('smaller');
  });
  it("ignores main's orphan trueBlack key (main has dark and light only)", () => {
    expect(readFacts({ trueBlack: true }, { theme: 'dark' }).page).toBe('slate');
  });
});

describe('savedFacts (a real boot)', () => {
  const ls = () => /** @type {any} */ (globalThis).localStorage;
  afterEach(() => { ls().clear(); vi.restoreAllMocks(); });

  it('reads vot-state from StateStore once it has loaded, not the boot shim', () => {
    ls().setItem('vot-state', JSON.stringify({ theme: 'light', settings: { fontScale: 1 } }));
    const g = {
      localStorage: ls(),
      StateStore: { isReady: () => true, get: () => ({ theme: 'dark', settings: { translation: 'kjv', letterReader: 'B' } }) },
      AudioLibraryStore: { getPlaybackRate: () => 1.5 },
    };
    const f = savedFacts(g);
    expect(f.page).toBe('slate');
    expect(f.translation).toBe('kjv');
    expect(f.speed).toBe(1.5);
  });
  it('falls back to the boot shim before the store loads, and never writes', () => {
    ls().setItem('vot-state', JSON.stringify({ theme: 'light', settings: { fontScale: 1.2 } }));
    const set = vi.spyOn(Storage.prototype, 'setItem');
    const f = savedFacts({ localStorage: ls(), StateStore: { isReady: () => false, get: () => { throw new Error('not loaded'); } } });
    expect(f.page).toBe('paper');
    expect(f.textSize).toBe('larger');
    expect(f.speed).toBe(1);
    expect(set).not.toHaveBeenCalled();
  });
  it('survives no storage at all', () => {
    expect(savedFacts({}).translation).toBe('nkjv');
  });
});

describe('labels', () => {
  it('speed', () => {
    expect(speedLabel(1)).toBe('1×');
    expect(speedLabel(1.25)).toBe('1.25×');
    expect(speedLabel(undefined)).toBe('1×');
  });
  it('Bible audio: the edition table first, else the key tail', () => {
    expect(bibleAudioLabel('brm-kjv', {})).toBe('KJV Bible audio');
    expect(bibleAudioLabel('x-web', { 'x-web': { translation: 'web' } })).toBe('WEB Bible audio');
    expect(bibleAudioLabel('off', {})).toBe('Bible audio off');
  });
  it('size picks its unit from the rounded figure', () => {
    expect(sizeLabel(48 * 1024 * 1024)).toBe('48 MB');
    expect(sizeLabel(1023.97 * 1024)).toBe('1 MB');
    expect(sizeLabel(640 * 1024)).toBe('640 KB');
    expect(sizeLabel(1.2 * 1024 * 1024 * 1024)).toBe('1.2 GB');
  });
  it('ago', () => {
    expect(agoLabel(GATE_NOW - 3600 * 1000, GATE_NOW)).toBe('today');
    expect(agoLabel(GATE_NOW - DAY, GATE_NOW)).toBe('yesterday');
    expect(agoLabel(GATE_NOW - 2 * DAY, GATE_NOW)).toBe('2 days ago');
    expect(agoLabel(GATE_NOW - 13 * DAY, GATE_NOW)).toBe('13 days ago');
    expect(agoLabel(GATE_NOW - 14 * DAY, GATE_NOW)).toBe('2 weeks ago');
    expect(agoLabel(GATE_NOW - 75 * DAY, GATE_NOW)).toBe('2 months ago');
  });
});
