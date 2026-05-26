/* PlatformBridge — interface contract tests (W1.1).
   ─────────────────────────────────────────────────────────────
   Tests both Android (window.AndroidBridge present) and Web
   (window.AndroidBridge absent) impls of the W1.1 module.

   Strategy: vi.resetModules() + dynamic import lets us re-run the
   module's isAndroid detection under different window states.

   Android impl: pure-passthrough — every method delegates 1:1 to
   window.AndroidBridge.*; the mock fn assertions prove it.
   Web impl: skeleton — three categories (no-op / safe default /
   notYetImplemented warning) per the W1.1 contract.
   ─────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * The full 20-method surface mirroring AppInterface.kt @JavascriptInterface.
 * Methods are kept in the same order as the Kotlin file for review parity.
 */
const METHODS = [
  'setLightStatusBar',
  'setKeepScreenOn',
  'requestMicPermission',
  'startAudioSession',
  'endAudioSession',
  'nativeRecordStart',
  'nativeRecordPause',
  'nativeRecordResume',
  'nativeRecordAmplitude',
  'nativeRecordStop',
  'nativeRecordCancel',
  'setZoomEnabled',
  'resetZoom',
  'getZoomScale',
  'takeScreenshot',
  'openFilePicker',
  'saveToDownloads',
  'getCrashLog',
  'setImmersiveMode',
  'haptic',
];

/**
 * Build a complete mock AndroidBridge whose methods are all vitest spies
 * returning sensible defaults that match the native return contracts.
 * @returns {Record<string, any>}
 */
function mockAndroidBridge() {
  return {
    setLightStatusBar: vi.fn(),
    setKeepScreenOn: vi.fn(),
    requestMicPermission: vi.fn(),
    startAudioSession: vi.fn(),
    endAudioSession: vi.fn(),
    nativeRecordStart: vi.fn(() => 'ok'),
    nativeRecordPause: vi.fn(() => 'ok'),
    nativeRecordResume: vi.fn(() => 'ok'),
    nativeRecordAmplitude: vi.fn(() => 8192),
    nativeRecordStop: vi.fn(),
    nativeRecordCancel: vi.fn(),
    setZoomEnabled: vi.fn(),
    resetZoom: vi.fn(),
    getZoomScale: vi.fn(() => 1.5),
    takeScreenshot: vi.fn(() => 'data:image/jpeg;base64,abc'),
    openFilePicker: vi.fn(),
    saveToDownloads: vi.fn(() => 'ok'),
    getCrashLog: vi.fn(() => '[{"ts":0,"tag":"x","msg":"y"}]'),
    setImmersiveMode: vi.fn(),
    haptic: vi.fn(),
  };
}

/**
 * Force-reimport platform-bridge under whatever window.AndroidBridge state
 * is currently set. Returns the freshly-evaluated PlatformBridge export.
 */
async function importBridge() {
  vi.resetModules();
  const mod = await import('./platform-bridge.js');
  return mod.PlatformBridge;
}

// ─────────────────────────────────────────────────────────────────────
// Android impl: window.AndroidBridge present → pure passthrough
// ─────────────────────────────────────────────────────────────────────

describe('PlatformBridge — Android impl (passthrough)', () => {
  /** @type {Record<string, any>} */
  let mockAB;
  /** @type {any} */
  let bridge;

  beforeEach(async () => {
    mockAB = mockAndroidBridge();
    /** @type {any} */ (globalThis).window = globalThis.window || /** @type {any} */ ({});
    /** @type {any} */ (globalThis.window).AndroidBridge = mockAB;
    bridge = await importBridge();
  });

  afterEach(() => {
    delete (/** @type {any} */ (globalThis.window).AndroidBridge);
  });

  it('exposes exactly the 20 expected methods', () => {
    const actual = Object.keys(bridge).sort();
    const expected = [...METHODS].sort();
    expect(actual).toEqual(expected);
  });

  /** @type {Array<[string, any[]]>} */
  const voidCases = [
    ['setLightStatusBar', [true]],
    ['setKeepScreenOn', [false]],
    ['setImmersiveMode', [true]],
    ['setZoomEnabled', [false]],
    ['resetZoom', []],
    ['haptic', [2]],
    ['startAudioSession', []],
    ['endAudioSession', []],
    ['requestMicPermission', []],
    ['nativeRecordStop', []],
    ['nativeRecordCancel', []],
    ['openFilePicker', []],
  ];
  it.each(voidCases)('void method %s delegates with args %o', (name, args) => {
    bridge[name](...args);
    expect(mockAB[name]).toHaveBeenCalledTimes(1);
    expect(mockAB[name]).toHaveBeenCalledWith(...args);
  });

  /** @type {Array<[string, any[], any]>} */
  const valueCases = [
    ['nativeRecordStart', [], 'ok'],
    ['nativeRecordPause', [], 'ok'],
    ['nativeRecordResume', [], 'ok'],
    ['nativeRecordAmplitude', [], 8192],
    ['getZoomScale', [], 1.5],
    ['takeScreenshot', [0, 1024, 80], 'data:image/jpeg;base64,abc'],
    ['saveToDownloads', ['notes.json', '{}'], 'ok'],
    ['getCrashLog', [], '[{"ts":0,"tag":"x","msg":"y"}]'],
  ];
  it.each(valueCases)('value method %s returns native result and forwards args %o', (name, args, expected) => {
    const result = bridge[name](...args);
    expect(result).toBe(expected);
    expect(mockAB[name]).toHaveBeenCalledTimes(1);
    expect(mockAB[name]).toHaveBeenCalledWith(...args);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Web impl: window.AndroidBridge absent → placeholders
// ─────────────────────────────────────────────────────────────────────

describe('PlatformBridge — Web impl (placeholders)', () => {
  /** @type {any} */
  let bridge;
  /** @type {any} */
  let warnSpy;

  beforeEach(async () => {
    /** @type {any} */ (globalThis).window = globalThis.window || /** @type {any} */ ({});
    delete (/** @type {any} */ (globalThis.window).AndroidBridge);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    bridge = await importBridge();
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('exposes the same 20 methods as Android impl (uniform shape)', () => {
    const actual = Object.keys(bridge).sort();
    const expected = [...METHODS].sort();
    expect(actual).toEqual(expected);
  });

  // Category 1 — genuine no-ops do not warn
  /** @type {Array<[string, any[]]>} */
  const noopCases = [
    ['setLightStatusBar', [true]],
    ['startAudioSession', []],
    ['endAudioSession', []],
  ];
  it.each(noopCases)('genuine no-op %s does not warn', (name, args) => {
    bridge[name](...args);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // Category 2 — safe defaults
  it('getZoomScale returns 1.0 on web', () => {
    expect(bridge.getZoomScale()).toBe(1.0);
  });
  it('getCrashLog returns valid empty JSON array string on web', () => {
    const out = bridge.getCrashLog();
    expect(out).toBe('[]');
    expect(JSON.parse(out)).toEqual([]);
  });
  it('nativeRecordAmplitude returns 0 on web', () => {
    expect(bridge.nativeRecordAmplitude()).toBe(0);
  });
  it('takeScreenshot returns empty string on web (W1.x html2canvas pending)', () => {
    expect(bridge.takeScreenshot(0, 1024, 80)).toBe('');
  });

  // Recording methods preserve "error:<reason>" string contract
  /** @type {Array<[string, any[]]>} */
  const recordErrorCases = [
    ['nativeRecordStart', []],
    ['nativeRecordPause', []],
    ['nativeRecordResume', []],
  ];
  it.each(recordErrorCases)('%s returns error contract string on web', (name, args) => {
    expect(bridge[name](...args)).toBe('error:web-impl-pending');
  });

  it('saveToDownloads returns error string AND warns on web', () => {
    const result = bridge.saveToDownloads('notes.json', '{}');
    expect(result).toBe('error:web-impl-pending');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('saveToDownloads'));
  });

  // Category 3 — notYetImplemented warns but doesn't throw
  it.each([
    'setImmersiveMode',
    'setKeepScreenOn',
    'setZoomEnabled',
    'resetZoom',
    'haptic',
    'openFilePicker',
    'requestMicPermission',
    'nativeRecordStop',
    'nativeRecordCancel',
  ])('notYetImplemented method %s warns once but does not throw', (name) => {
    expect(() => bridge[name](0)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(name));
  });

  it('warnings are tagged with [PlatformBridge]', () => {
    bridge.openFilePicker();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[PlatformBridge]'));
  });
});

// ─────────────────────────────────────────────────────────────────────
// Detection edge cases
// ─────────────────────────────────────────────────────────────────────

describe('PlatformBridge — detection edge cases', () => {
  afterEach(() => {
    /** @type {any} */ (globalThis).window = globalThis.window || /** @type {any} */ ({});
    delete (/** @type {any} */ (globalThis.window).AndroidBridge);
  });

  it('falsy AndroidBridge value selects Web impl (matches JournalRecordingSheet:214 truthy check)', async () => {
    /** @type {any} */ (globalThis).window = globalThis.window || /** @type {any} */ ({});
    /** @type {any} */ (globalThis.window).AndroidBridge = null;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bridge = await importBridge();
    // Web impl returns 1.0; Android impl would crash trying to call null.getZoomScale()
    expect(bridge.getZoomScale()).toBe(1.0);
    warnSpy.mockRestore();
  });

  it('truthy AndroidBridge value selects Android impl', async () => {
    /** @type {any} */ (globalThis).window = globalThis.window || /** @type {any} */ ({});
    /** @type {any} */ (globalThis.window).AndroidBridge = { getZoomScale: () => 2.5 };
    const bridge = await importBridge();
    expect(bridge.getZoomScale()).toBe(2.5);
  });
});
