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
    // takeScreenshot is the one async method on the bridge — Android wraps
    // its sync native call in Promise.resolve to give consumers a uniform
    // Promise<string> shape (web returns html2canvas's genuine Promise).
    ['takeScreenshot', [0, 1024, 80], 'data:image/jpeg;base64,abc'],
    ['saveToDownloads', ['notes.json', '{}'], 'ok'],
    ['getCrashLog', [], '[{"ts":0,"tag":"x","msg":"y"}]'],
  ];
  it.each(valueCases)('value method %s returns native result and forwards args %o', async (name, args, expected) => {
    let result = bridge[name](...args);
    // Unwrap Promise if the method is async (currently only takeScreenshot)
    if (result && typeof result.then === 'function') result = await result;
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
  it('takeScreenshot returns empty string when html2canvas is unavailable', async () => {
    // html2canvas isn't loaded in the test env — bridge falls back to ''
    expect(await bridge.takeScreenshot(0, 1024, 80)).toBe('');
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
// Web takeScreenshot with html2canvas mocked (W1.2 Tier A integration)
// ─────────────────────────────────────────────────────────────────────

describe('PlatformBridge — Web takeScreenshot (html2canvas integration)', () => {
  /** @type {any} */ let bridge;

  beforeEach(async () => {
    /** @type {any} */ (globalThis).window = globalThis.window || /** @type {any} */ ({});
    delete (/** @type {any} */ (globalThis.window).AndroidBridge);
  });

  afterEach(() => {
    delete (/** @type {any} */ (globalThis)).html2canvas;
  });

  it('returns html2canvas data URL when canvas dims fit within maxDim', async () => {
    const stubCanvas = {
      width: 800,
      height: 600,
      toDataURL: vi.fn(() => 'data:image/jpeg;base64,FULLSIZE'),
    };
    /** @type {any} */ (globalThis).html2canvas = vi.fn(async () => stubCanvas);
    bridge = await importBridge();

    const result = await bridge.takeScreenshot(0, 1024, 80);
    expect(result).toBe('data:image/jpeg;base64,FULLSIZE');
    // jpegQuality 80 (int 0-100) converts to 0.8 for canvas.toDataURL
    expect(stubCanvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.8);
    expect(/** @type {any} */ (globalThis).html2canvas).toHaveBeenCalledTimes(1);
  });

  it('downscales when canvas exceeds maxDim', async () => {
    const stubCanvas = {
      width: 4000,
      height: 3000,
      toDataURL: vi.fn(() => 'data:image/jpeg;base64,FULL'),
    };
    /** @type {any} */ (globalThis).html2canvas = vi.fn(async () => stubCanvas);
    bridge = await importBridge();

    // Stub createElement('canvas') to return a controllable downscale target
    const downscaleCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        imageSmoothingEnabled: false,
        drawImage: vi.fn(),
      })),
      toDataURL: vi.fn(() => 'data:image/jpeg;base64,DOWNSCALED'),
    };
    const realCreate = document.createElement.bind(document);
    const spy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') return /** @type {any} */ (downscaleCanvas);
      return realCreate(tag);
    });

    const result = await bridge.takeScreenshot(0, 1024, 90);
    expect(result).toBe('data:image/jpeg;base64,DOWNSCALED');
    // 4000x3000 scaled by min(1024/4000, 1024/3000, 1) = 0.256 → 1024 x 768
    expect(downscaleCanvas.width).toBe(1024);
    expect(downscaleCanvas.height).toBe(768);
    expect(downscaleCanvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.9);

    spy.mockRestore();
  });

  it('returns empty string when html2canvas throws', async () => {
    /** @type {any} */ (globalThis).html2canvas = vi.fn(async () => {
      throw new Error('canvas fail');
    });
    bridge = await importBridge();

    expect(await bridge.takeScreenshot(0, 1024, 80)).toBe('');
  });

  it('topCropDp is accepted but unused on web (chrome hidden via classes)', async () => {
    const stubCanvas = {
      width: 800, height: 600,
      toDataURL: vi.fn(() => 'data:image/jpeg;base64,X'),
    };
    /** @type {any} */ (globalThis).html2canvas = vi.fn(async () => stubCanvas);
    bridge = await importBridge();

    // Multiple topCropDp values yield identical results — the param is web no-op
    const r1 = await bridge.takeScreenshot(0, 1024, 80);
    const r2 = await bridge.takeScreenshot(200, 1024, 80);
    expect(r1).toBe(r2);
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
