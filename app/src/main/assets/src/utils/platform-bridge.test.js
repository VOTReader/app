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
  'saveToFile',
  'getCrashLog',
  'setImmersiveMode',
  'haptic',
  'isAndroid',
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
    saveToFile: vi.fn(),
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

  it('exposes exactly the 21 expected keys', () => {
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
    // saveToFile is now fire-and-forget (async SAF picker on Android);
    // the result arrives via window.__onExportComplete, so the bridge
    // method itself returns void and just delegates.
    ['saveToFile', ['notes.json', '{}']],
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
    // getCrashLog is NO LONGER a pure passthrough — W7.4 merges the native
    // BoundedLogTree with the JS DiagnosticLog. See its own describe below.
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

  it('exposes the same 21 keys as Android impl (uniform shape)', () => {
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

  // Category 3 — notYetImplemented warns but doesn't throw
  // (Most methods now have real impls in their own describe blocks below:
  //   setKeepScreenOn (Tier B.1), openFilePicker + saveToFile (Tier B.2),
  //   takeScreenshot (Tier A), setImmersiveMode + setZoomEnabled + resetZoom
  //   (Tier B.3), recording methods (Tier C). Only haptic remains — its JS
  //   wiring is post-W1; see [[haptic-bridge-ready]].)
  it.each([
    'haptic',
  ])('notYetImplemented method %s warns once but does not throw', (name) => {
    expect(() => bridge[name](0)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(name));
  });

  it('warnings are tagged with [PlatformBridge]', () => {
    bridge.haptic(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[PlatformBridge]'));
  });

  // Tier B.3: zoom methods are DELIBERATE no-ops on web (verify inertness
  // per [[verify-inertness-not-equivalence]]). Browsers handle zoom
  // natively; CSS hacks would interfere with the Garden image's pinch.
  it('setZoomEnabled is silent no-op on web (no warn, no throw)', () => {
    bridge.setZoomEnabled(true);
    bridge.setZoomEnabled(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('resetZoom is silent no-op on web', () => {
    bridge.resetZoom();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Web setImmersiveMode — Fullscreen API (W1.2 Tier B.3)
// ─────────────────────────────────────────────────────────────────────

describe('PlatformBridge — Web setImmersiveMode (Fullscreen API)', () => {
  /** @type {any} */ let bridge;
  /** @type {any} */ let warnSpy;
  /** @type {any} */ let mockRequestFullscreen;
  /** @type {any} */ let mockExitFullscreen;

  beforeEach(async () => {
    /** @type {any} */ (globalThis).window = globalThis.window || /** @type {any} */ ({});
    delete (/** @type {any} */ (globalThis.window).AndroidBridge);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockRequestFullscreen = vi.fn(() => Promise.resolve());
    mockExitFullscreen = vi.fn(() => Promise.resolve());
    /** @type {any} */ (document.documentElement).requestFullscreen = mockRequestFullscreen;
    /** @type {any} */ (document).exitFullscreen = mockExitFullscreen;
    /** @type {any} */ (document).fullscreenElement = null;
    bridge = await importBridge();
  });

  afterEach(() => {
    warnSpy.mockRestore();
    delete (/** @type {any} */ (document.documentElement)).requestFullscreen;
    delete (/** @type {any} */ (document)).exitFullscreen;
    delete (/** @type {any} */ (document)).fullscreenElement;
  });

  it('setImmersiveMode(true) calls documentElement.requestFullscreen', () => {
    bridge.setImmersiveMode(true);
    expect(mockRequestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('setImmersiveMode(false) calls document.exitFullscreen only when in fullscreen', () => {
    // Not in fullscreen — no exit attempt
    bridge.setImmersiveMode(false);
    expect(mockExitFullscreen).not.toHaveBeenCalled();
    // Pretend we entered fullscreen
    /** @type {any} */ (document).fullscreenElement = document.documentElement;
    bridge.setImmersiveMode(false);
    expect(mockExitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('swallows requestFullscreen rejection (user-gesture blocked) with a warn', async () => {
    mockRequestFullscreen.mockImplementation(() => Promise.reject(new Error('Permissions check failed')));
    expect(() => bridge.setImmersiveMode(true)).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/setImmersiveMode\(true\)/);
  });

  it('silently no-ops when Fullscreen API is absent', () => {
    delete (/** @type {any} */ (document.documentElement)).requestFullscreen;
    delete (/** @type {any} */ (document)).exitFullscreen;
    expect(() => bridge.setImmersiveMode(true)).not.toThrow();
    expect(() => bridge.setImmersiveMode(false)).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Web openFilePicker — DOM input + FileReader (W1.2 Tier B.2)
// ─────────────────────────────────────────────────────────────────────

describe('PlatformBridge — Web openFilePicker (DOM input + FileReader)', () => {
  /** @type {any} */ let bridge;
  /** @type {any} */ let inputEl;
  /** @type {any} */ let inputClickSpy;
  /** @type {any} */ let createElementSpy;

  beforeEach(async () => {
    /** @type {any} */ (globalThis).window = globalThis.window || /** @type {any} */ ({});
    delete (/** @type {any} */ (globalThis.window).AndroidBridge);
    delete (/** @type {any} */ (globalThis.window)).__onImportFile;
    // Stub document.createElement('input') so we can intercept .click() + simulate file selection
    inputEl = /** @type {any} */ ({
      type: '',
      accept: '',
      onchange: null,
      click: vi.fn(),
    });
    inputClickSpy = inputEl.click;
    const realCreate = document.createElement.bind(document);
    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'input') return /** @type {any} */ (inputEl);
      return realCreate(tag);
    });
    bridge = await importBridge();
  });

  afterEach(() => {
    createElementSpy.mockRestore();
    delete (/** @type {any} */ (globalThis.window)).__onImportFile;
  });

  it('synchronously creates a file input and calls .click() in the same callstack', () => {
    bridge.openFilePicker();
    expect(inputEl.type).toBe('file');
    expect(inputEl.accept).toBe('application/json,.json');
    expect(inputClickSpy).toHaveBeenCalledTimes(1);
    // click() fires sync — must not be wrapped in a Promise / setTimeout per
    // [[file-input-user-gesture]] (browsers block programmatic click outside user gesture).
  });

  it('fires window.__onImportFile(base64) when a file is picked (preserves Android contract)', async () => {
    const cb = vi.fn();
    /** @type {any} */ (globalThis.window).__onImportFile = cb;
    bridge.openFilePicker();

    // Stub FileReader so onload fires immediately with a data URL
    const origFileReader = globalThis.FileReader;
    /** @this {any} */
    function MockFileReader() {
      /** @type {any} */ const self = this;
      self.readAsDataURL = (/** @type {any} */ _file) => {
        // Immediately simulate onload with a data URL — base64 of '{"a":1}'
        setTimeout(() => {
          if (self.onload) self.onload({ target: { result: 'data:application/json;base64,eyJhIjoxfQ==' } });
        }, 0);
      };
    }
    /** @type {any} */ (globalThis).FileReader = MockFileReader;

    // Simulate user picking a file
    /** @type {any} */ (inputEl).onchange({ target: { files: [/** @type {any} */ ({ name: 'backup.json' })] } });
    await new Promise((r) => setTimeout(r, 5));

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('eyJhIjoxfQ==');  // pure base64, prefix stripped

    /** @type {any} */ (globalThis).FileReader = origFileReader;
  });

  it('fires window.__onImportFile(null) when user cancels (no file selected)', () => {
    const cb = vi.fn();
    /** @type {any} */ (globalThis.window).__onImportFile = cb;
    bridge.openFilePicker();
    // No file selected — onchange fires with empty files
    /** @type {any} */ (inputEl).onchange({ target: { files: null } });
    expect(cb).toHaveBeenCalledWith(null);
  });

  it('fires window.__onImportFile(null) when FileReader errors', async () => {
    const cb = vi.fn();
    /** @type {any} */ (globalThis.window).__onImportFile = cb;
    bridge.openFilePicker();

    const origFileReader = globalThis.FileReader;
    /** @this {any} */
    function MockFileReaderErr() {
      /** @type {any} */ const self = this;
      self.readAsDataURL = () => {
        setTimeout(() => { if (self.onerror) self.onerror(); }, 0);
      };
    }
    /** @type {any} */ (globalThis).FileReader = MockFileReaderErr;

    /** @type {any} */ (inputEl).onchange({ target: { files: [{ name: 'x' }] } });
    await new Promise((r) => setTimeout(r, 5));
    expect(cb).toHaveBeenCalledWith(null);

    /** @type {any} */ (globalThis).FileReader = origFileReader;
  });

  it('does not throw when window.__onImportFile is not installed', () => {
    delete (/** @type {any} */ (globalThis.window)).__onImportFile;
    bridge.openFilePicker();
    expect(() => /** @type {any} */ (inputEl).onchange({ target: { files: null } })).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Web saveToFile — Blob + anchor click → __onExportComplete (W1.2 Tier B.2)
// ─────────────────────────────────────────────────────────────────────

describe('PlatformBridge — Web saveToFile (Blob + anchor → __onExportComplete)', () => {
  /** @type {any} */ let bridge;
  /** @type {any} */ let createElementSpy;
  /** @type {any} */ let createObjectURLSpy;
  /** @type {any} */ let revokeObjectURLSpy;
  /** @type {any} */ let anchorClickSpy;
  /** @type {any} */ let anchorRemoveSpy;
  /** @type {any} */ let anchorEl;

  beforeEach(async () => {
    /** @type {any} */ (globalThis).window = globalThis.window || /** @type {any} */ ({});
    delete (/** @type {any} */ (globalThis.window).AndroidBridge);
    // Build a REAL <a> element (jsdom HTMLAnchorElement) so document.body.appendChild()
    // doesn't reject it as "not of type Node." Spy click + remove on the real instance.
    const realCreate = document.createElement.bind(document);
    anchorEl = /** @type {any} */ (realCreate('a'));
    anchorClickSpy = vi.fn();
    anchorEl.click = anchorClickSpy;
    anchorRemoveSpy = vi.spyOn(anchorEl, 'remove');
    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') return anchorEl;
      return realCreate(tag);
    });
    createObjectURLSpy = vi.fn(() => 'blob:mock-url');
    revokeObjectURLSpy = vi.fn();
    /** @type {any} */ (globalThis).URL.createObjectURL = createObjectURLSpy;
    /** @type {any} */ (globalThis).URL.revokeObjectURL = revokeObjectURLSpy;
    bridge = await importBridge();
  });

  afterEach(() => {
    createElementSpy.mockRestore();
    anchorRemoveSpy.mockRestore();
    delete (/** @type {any} */ (globalThis.window).__onExportComplete);
  });

  it('creates Blob, anchors a download link, clicks it, reports "ok"', () => {
    const cb = vi.fn();
    /** @type {any} */ (globalThis.window).__onExportComplete = cb;
    const ret = bridge.saveToFile('backup.json', '{"a":1}');
    expect(ret).toBeUndefined(); // fire-and-forget: no sync return value
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(anchorEl.download).toBe('backup.json');
    expect(anchorEl.getAttribute('href')).toBe('blob:mock-url');
    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('ok');
  });

  it('revokes the object URL after click (deferred via setTimeout 0)', async () => {
    /** @type {any} */ (globalThis.window).__onExportComplete = vi.fn();
    bridge.saveToFile('backup.json', '{}');
    // The setTimeout 0 hasn't fired yet
    expect(revokeObjectURLSpy).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');
    expect(anchorRemoveSpy).toHaveBeenCalledTimes(1);
  });

  it('reports "error:<reason>" via __onExportComplete when Blob construction throws', () => {
    const cb = vi.fn();
    /** @type {any} */ (globalThis.window).__onExportComplete = cb;
    const origBlob = globalThis.Blob;
    /** @type {any} */ (globalThis).Blob = function () { throw new Error('quota exceeded'); };
    bridge.saveToFile('backup.json', '{}');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toMatch(/^error:/);
    expect(cb.mock.calls[0][0]).toMatch(/quota exceeded/);
    /** @type {any} */ (globalThis).Blob = origBlob;
  });

  it('does not throw when __onExportComplete is absent', () => {
    delete (/** @type {any} */ (globalThis.window).__onExportComplete);
    expect(() => bridge.saveToFile('backup.json', '{}')).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Web setKeepScreenOn — WakeLock fire-and-forget (W1.2 Tier B.1)
// ─────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────
// Web setKeepScreenOn — WakeLock fire-and-forget (W1.2 Tier B.1)
// ─────────────────────────────────────────────────────────────────────

describe('PlatformBridge — Web setKeepScreenOn (WakeLock)', () => {
  /** @type {any} */ let bridge;
  /** @type {any} */ let warnSpy;
  /** @type {any} */ let mockSentinel;
  /** @type {any} */ let mockRequest;
  /** @type {any} */ let mockRelease;

  beforeEach(async () => {
    /** @type {any} */ (globalThis).window = globalThis.window || /** @type {any} */ ({});
    delete (/** @type {any} */ (globalThis.window).AndroidBridge);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockRelease = vi.fn(() => Promise.resolve());
    mockSentinel = { released: false, release: mockRelease };
    mockRequest = vi.fn(() => Promise.resolve(mockSentinel));
    /** @type {any} */ (globalThis.navigator).wakeLock = { request: mockRequest };
    bridge = await importBridge();
  });

  afterEach(() => {
    warnSpy.mockRestore();
    delete (/** @type {any} */ (globalThis.navigator)).wakeLock;
  });

  it('setKeepScreenOn(true) requests WakeLock for screen, returns void (fire-and-forget)', async () => {
    const result = bridge.setKeepScreenOn(true);
    expect(result).toBeUndefined();  // contract: void return, not Promise
    // The internal Promise resolves async; flush microtasks
    await new Promise((r) => setTimeout(r, 0));
    expect(mockRequest).toHaveBeenCalledWith('screen');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('setKeepScreenOn(true) twice while held = no double-acquire (no second request call)', async () => {
    bridge.setKeepScreenOn(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockRequest).toHaveBeenCalledTimes(1);
    // Second call — sentinel still held + not released
    bridge.setKeepScreenOn(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockRequest).toHaveBeenCalledTimes(1);  // still only the one call
  });

  it('setKeepScreenOn(false) releases the held sentinel', async () => {
    bridge.setKeepScreenOn(true);
    await new Promise((r) => setTimeout(r, 0));  // acquire
    bridge.setKeepScreenOn(false);
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('setKeepScreenOn(false) when nothing held = no-op (no release call)', () => {
    bridge.setKeepScreenOn(false);
    expect(mockRelease).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('logs warn but does not throw when WakeLock.request rejects', async () => {
    mockRequest.mockImplementation(() => Promise.reject(new Error('document not visible')));
    expect(() => bridge.setKeepScreenOn(true)).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/setKeepScreenOn\(true\)/);
    expect(warnSpy.mock.calls[0][0]).toMatch(/\[PlatformBridge\]/);
  });

  it('de-duplicates repeat failures with the same reason (no log spam)', async () => {
    mockRequest.mockImplementation(() => Promise.reject(new Error('document not visible')));
    // Simulate the useSettings effect firing many times (e.g. on each
    // settings mutation) — each call triggers a fresh wakeLock.request that
    // rejects, but only the FIRST rejection should log.
    for (let i = 0; i < 5; i++) {
      bridge.setKeepScreenOn(true);
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('a new failure reason resets the de-dup and logs again', async () => {
    mockRequest.mockImplementation(() => Promise.reject(new Error('reason A')));
    bridge.setKeepScreenOn(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(warnSpy).toHaveBeenCalledTimes(1);
    // Same reason — no re-log
    bridge.setKeepScreenOn(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(warnSpy).toHaveBeenCalledTimes(1);
    // Different reason — log again
    mockRequest.mockImplementation(() => Promise.reject(new Error('reason B')));
    bridge.setKeepScreenOn(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('successful acquire resets the de-dup flag', async () => {
    // First call fails
    mockRequest.mockImplementation(() => Promise.reject(new Error('reason A')));
    bridge.setKeepScreenOn(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(warnSpy).toHaveBeenCalledTimes(1);
    // Recovery: release any held sentinel + change behavior to succeed once
    mockRequest.mockImplementation(() => Promise.resolve(mockSentinel));
    bridge.setKeepScreenOn(true);
    await new Promise((r) => setTimeout(r, 0));
    // Now release and try again with same failure reason — should log again
    bridge.setKeepScreenOn(false);
    mockRequest.mockImplementation(() => Promise.reject(new Error('reason A')));
    bridge.setKeepScreenOn(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('skips piling-up requests while one is in flight', async () => {
    // Deferred-resolve mock: only resolve when we explicitly call resolveFn
    /** @type {(value: any) => void} */ let resolveFn = () => {};
    mockRequest.mockImplementation(
      () => new Promise((resolve) => { resolveFn = resolve; })
    );
    bridge.setKeepScreenOn(true);  // starts request 1 — in-flight
    bridge.setKeepScreenOn(true);  // 2nd call while in-flight — should skip
    bridge.setKeepScreenOn(true);  // 3rd call — also skipped
    expect(mockRequest).toHaveBeenCalledTimes(1);
    // Resolve the in-flight request
    resolveFn(mockSentinel);
    await new Promise((r) => setTimeout(r, 0));
    // Now sentinel is held; further calls early-return on "already held"
    bridge.setKeepScreenOn(true);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('silently no-ops when navigator.wakeLock is absent (older browsers / http://)', async () => {
    delete (/** @type {any} */ (globalThis.navigator)).wakeLock;
    bridge = await importBridge();
    expect(() => bridge.setKeepScreenOn(true)).not.toThrow();
    expect(() => bridge.setKeepScreenOn(false)).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
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
// Web recording — MediaRecorder + AnalyserNode (W1.2 Tier C)
// ─────────────────────────────────────────────────────────────────────

describe('PlatformBridge — Web recording (MediaRecorder + AnalyserNode)', () => {
  /** @type {any} */ let bridge;
  /** @type {any} */ let mockGetUserMedia;
  /** @type {any} */ let mockTracks;
  /** @type {any} */ let mockStream;
  /** @type {any} */ let mockRecorder;
  /** @type {any} */ let mockMediaRecorderCtor;
  /** @type {any} */ let mockAnalyser;
  /** @type {any} */ let mockAudioCtxClose;
  /** @type {any} */ let mockSource;
  /** @type {any} */ let recOnDataAvailable;
  /** @type {any} */ let recOnStop;

  /** @param {string[]} supported  list of mime types isTypeSupported returns true for */
  function setupMediaRecorderMock(supported) {
    mockMediaRecorderCtor = vi.fn();
    /** @type {any} */ (globalThis).MediaRecorder = function (/** @type {any} */ stream, /** @type {any} */ opts) {
      mockMediaRecorderCtor(stream, opts);
      mockRecorder = {
        state: 'inactive',
        mimeType: (opts && opts.mimeType) || 'audio/webm',
        set ondataavailable(fn) { recOnDataAvailable = fn; },
        set onstop(fn) { recOnStop = fn; },
        start: vi.fn(function (/** @type {any} */ _interval) { mockRecorder.state = 'recording'; }),
        pause: vi.fn(function () { mockRecorder.state = 'paused'; }),
        resume: vi.fn(function () { mockRecorder.state = 'recording'; }),
        stop: vi.fn(function () {
          mockRecorder.state = 'inactive';
          // Simulate the browser firing onstop synchronously (real impl is async,
          // but we control that timing via awaits in tests where it matters).
          if (recOnStop) setTimeout(() => recOnStop(), 0);
        }),
      };
      return mockRecorder;
    };
    /** @type {any} */ (globalThis.MediaRecorder).isTypeSupported = (/** @type {string} */ m) => supported.indexOf(m) >= 0;
  }

  beforeEach(async () => {
    /** @type {any} */ (globalThis).window = globalThis.window || /** @type {any} */ ({});
    delete (/** @type {any} */ (globalThis.window).AndroidBridge);
    // MediaStream + tracks
    mockTracks = [
      { stop: vi.fn(), kind: 'audio' },
    ];
    mockStream = {
      getTracks: vi.fn(() => mockTracks),
    };
    mockGetUserMedia = vi.fn(() => Promise.resolve(mockStream));
    /** @type {any} */ (globalThis.navigator).mediaDevices = { getUserMedia: mockGetUserMedia };
    // MediaRecorder stub — default to webm/opus supported
    setupMediaRecorderMock(['audio/webm;codecs=opus']);
    // AudioContext + AnalyserNode + MediaStreamSource
    mockAudioCtxClose = vi.fn();
    mockSource = { connect: vi.fn() };
    mockAnalyser = {
      fftSize: 0,
      frequencyBinCount: 128,
      getByteTimeDomainData: vi.fn(),
    };
    /** @type {any} */ (globalThis.window).AudioContext = function () {
      this.createMediaStreamSource = vi.fn(() => mockSource);
      this.createAnalyser = vi.fn(() => mockAnalyser);
      this.close = mockAudioCtxClose;
    };
    bridge = await importBridge();
  });

  afterEach(() => {
    delete (/** @type {any} */ (globalThis.navigator)).mediaDevices;
    delete (/** @type {any} */ (globalThis)).MediaRecorder;
    delete (/** @type {any} */ (globalThis.window)).AudioContext;
    delete (/** @type {any} */ (globalThis.window)).__onMicPermissionResult;
    delete (/** @type {any} */ (globalThis.window)).__onNativeRecordingComplete;
  });

  // ── requestMicPermission ──

  it('requestMicPermission fires __onMicPermissionResult(true) on getUserMedia success', async () => {
    const cb = vi.fn();
    /** @type {any} */ (globalThis.window).__onMicPermissionResult = cb;
    bridge.requestMicPermission();
    expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(cb).toHaveBeenCalledWith(true);
  });

  it('requestMicPermission fires __onMicPermissionResult(false) on getUserMedia rejection', async () => {
    mockGetUserMedia.mockImplementation(() => Promise.reject(new Error('NotAllowedError')));
    const cb = vi.fn();
    /** @type {any} */ (globalThis.window).__onMicPermissionResult = cb;
    bridge.requestMicPermission();
    await new Promise((r) => setTimeout(r, 0));
    expect(cb).toHaveBeenCalledWith(false);
  });

  it('requestMicPermission fires (false) when navigator.mediaDevices is absent', () => {
    delete (/** @type {any} */ (globalThis.navigator)).mediaDevices;
    const cb = vi.fn();
    /** @type {any} */ (globalThis.window).__onMicPermissionResult = cb;
    bridge.requestMicPermission();
    expect(cb).toHaveBeenCalledWith(false);
  });

  // ── nativeRecordStart ──

  it('nativeRecordStart returns "ok" with webm/opus when supported', async () => {
    bridge.requestMicPermission();
    await new Promise((r) => setTimeout(r, 0));
    expect(bridge.nativeRecordStart()).toBe('ok');
    expect(mockMediaRecorderCtor).toHaveBeenCalledWith(mockStream, { mimeType: 'audio/webm;codecs=opus' });
    expect(mockRecorder.start).toHaveBeenCalledWith(250);  // 250ms chunk interval preserved
  });

  it('nativeRecordStart falls back to ogg/opus when webm/opus unsupported', async () => {
    setupMediaRecorderMock(['audio/ogg;codecs=opus']);
    bridge = await importBridge();
    bridge.requestMicPermission();
    await new Promise((r) => setTimeout(r, 0));
    expect(bridge.nativeRecordStart()).toBe('ok');
    expect(mockMediaRecorderCtor).toHaveBeenCalledWith(mockStream, { mimeType: 'audio/ogg;codecs=opus' });
  });

  it('nativeRecordStart returns "error:unsupported-codec" when NEITHER webm/opus NOR ogg/opus supported (no wav fallback)', async () => {
    setupMediaRecorderMock([]);  // nothing supported
    bridge = await importBridge();
    bridge.requestMicPermission();
    await new Promise((r) => setTimeout(r, 0));
    expect(bridge.nativeRecordStart()).toBe('error:unsupported-codec');
    // Track cleanup must run — leak prevention per [[mediastream-track-cleanup]]
    expect(mockTracks[0].stop).toHaveBeenCalled();
  });

  it('nativeRecordStart returns "error:no-stream" when called before requestMicPermission', () => {
    expect(bridge.nativeRecordStart()).toBe('error:no-stream');
  });

  it('nativeRecordStart pre-allocates AnalyserNode buffer at start (not per amplitude call)', async () => {
    bridge.requestMicPermission();
    await new Promise((r) => setTimeout(r, 0));
    bridge.nativeRecordStart();
    expect(mockAnalyser.fftSize).toBe(256);
    // Probe amplitude — getByteTimeDomainData should be called with the SAME buffer instance each time
    bridge.nativeRecordAmplitude();
    bridge.nativeRecordAmplitude();
    const callA = mockAnalyser.getByteTimeDomainData.mock.calls[0][0];
    const callB = mockAnalyser.getByteTimeDomainData.mock.calls[1][0];
    expect(callA).toBe(callB);  // SAME instance, not a fresh allocation
    expect(callA).toBeInstanceOf(Uint8Array);
    expect(callA.length).toBe(mockAnalyser.frequencyBinCount);
  });

  // ── nativeRecordAmplitude ──

  it('nativeRecordAmplitude returns 0 when not recording', () => {
    expect(bridge.nativeRecordAmplitude()).toBe(0);
  });

  it('nativeRecordAmplitude maps RMS [0,1] to amp [0,32767] (Android contract)', async () => {
    bridge.requestMicPermission();
    await new Promise((r) => setTimeout(r, 0));
    bridge.nativeRecordStart();
    // Stub time-domain data: all values 192 → (192-128)/128 = 0.5 → RMS = 0.5 → amp ≈ 16384
    mockAnalyser.getByteTimeDomainData.mockImplementation((/** @type {Uint8Array} */ buf) => {
      for (let i = 0; i < buf.length; i++) buf[i] = 192;
    });
    const amp = bridge.nativeRecordAmplitude();
    expect(amp).toBeCloseTo(16384, -2);  // within ±100
  });

  // ── pause / resume ──

  it('nativeRecordPause returns "ok" and updates state', async () => {
    bridge.requestMicPermission();
    await new Promise((r) => setTimeout(r, 0));
    bridge.nativeRecordStart();
    expect(bridge.nativeRecordPause()).toBe('ok');
    expect(mockRecorder.pause).toHaveBeenCalledTimes(1);
  });

  it('nativeRecordPause returns "error:not-recording" if not currently recording', () => {
    expect(bridge.nativeRecordPause()).toBe('error:not-recording');
  });

  it('nativeRecordResume returns "ok" after pause', async () => {
    bridge.requestMicPermission();
    await new Promise((r) => setTimeout(r, 0));
    bridge.nativeRecordStart();
    bridge.nativeRecordPause();
    expect(bridge.nativeRecordResume()).toBe('ok');
    expect(mockRecorder.resume).toHaveBeenCalledTimes(1);
  });

  it('nativeRecordResume returns "error:not-paused" if not currently paused', async () => {
    bridge.requestMicPermission();
    await new Promise((r) => setTimeout(r, 0));
    bridge.nativeRecordStart();
    expect(bridge.nativeRecordResume()).toBe('error:not-paused');
  });

  // ── nativeRecordStop ──

  it('nativeRecordStop triggers onstop which fires __onNativeRecordingComplete with base64 + duration + mime', async () => {
    const completeCb = vi.fn();
    /** @type {any} */ (globalThis.window).__onNativeRecordingComplete = completeCb;
    bridge.requestMicPermission();
    await new Promise((r) => setTimeout(r, 0));
    bridge.nativeRecordStart();
    // Simulate a chunk being captured before stop
    if (recOnDataAvailable) recOnDataAvailable({ data: new Blob(['x'], { type: 'audio/webm' }) });
    bridge.nativeRecordStop();
    // Wait for onstop's chain (Blob → FileReader → base64 → callback).
    // Use vi.waitFor instead of a fixed real-time setTimeout to make this
    // assertion deterministic under heavy combined-suite load — FileReader
    // microtasks can stretch past a 20ms wait when ~25 test files run
    // concurrently (the long-flagged platform-bridge.test.js flake). The
    // poller fires the assertion every 10ms until it passes or hits the
    // 1s ceiling; typical pass is under 50ms.
    await vi.waitFor(() => expect(completeCb).toHaveBeenCalledTimes(1), { timeout: 1000 });
    const [b64, durMs, mime] = completeCb.mock.calls[0];
    expect(typeof b64).toBe('string');
    expect(typeof durMs).toBe('number');
    expect(mime).toBe('audio/webm;codecs=opus');
  });

  it('nativeRecordStop cleans up — stops MediaStream tracks (no mic indicator leak)', async () => {
    bridge.requestMicPermission();
    await new Promise((r) => setTimeout(r, 0));
    bridge.nativeRecordStart();
    bridge.nativeRecordStop();
    // onstop's .finally() runs _webRecorderCleanup after the Blob → base64
    // chain resolves. vi.waitFor polls until cleanup actually completed
    // rather than guessing at a fixed wait — same load-resilience fix.
    await vi.waitFor(() => {
      expect(mockTracks[0].stop).toHaveBeenCalledTimes(1);
      expect(mockAudioCtxClose).toHaveBeenCalledTimes(1);
    }, { timeout: 1000 });
  });

  // ── nativeRecordCancel ──

  it('nativeRecordCancel stops tracks WITHOUT firing __onNativeRecordingComplete', async () => {
    const completeCb = vi.fn();
    /** @type {any} */ (globalThis.window).__onNativeRecordingComplete = completeCb;
    bridge.requestMicPermission();
    await new Promise((r) => setTimeout(r, 0));
    bridge.nativeRecordStart();
    bridge.nativeRecordCancel();
    // Cancel's cleanup is synchronous BUT the assertion still needs the
    // same poll-until-pass discipline so the test is uniform with the
    // stop variant above. Without polling, a sufficiently slow combined-
    // suite run can win the race and check before cancel's tracks.stop()
    // actually executed.
    await vi.waitFor(() => {
      expect(mockTracks[0].stop).toHaveBeenCalledTimes(1);
      expect(mockAudioCtxClose).toHaveBeenCalledTimes(1);
    }, { timeout: 1000 });
    // Negative assertion: by the time the positive cleanup polled
    // through, any spurious completion callback would have fired too.
    expect(completeCb).not.toHaveBeenCalled();
  });

  it('nativeRecordCancel is safe when no recording in progress (no-op)', () => {
    expect(() => bridge.nativeRecordCancel()).not.toThrow();
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

// ─────────────────────────────────────────────────────────────────────
// getCrashLog — DiagnosticLog merge (W7.4)
// ─────────────────────────────────────────────────────────────────────

describe('PlatformBridge — getCrashLog (DiagnosticLog merge, W7.4)', () => {
  /** @type {any} */ let bridge;
  /** @type {any} */ let DiagnosticLog;

  // Import the bridge AND the DiagnosticLog it uses from the SAME module
  // generation: vi.resetModules() re-evaluates diagnostic-log.js fresh, so we
  // import it AFTER the reset (and before any further reset) so the test's
  // reference is the same singleton the bridge writes through.
  async function load() {
    vi.resetModules();
    const dlMod = await import('./diagnostic-log.js');
    DiagnosticLog = dlMod.DiagnosticLog;
    DiagnosticLog.clear();
    const pbMod = await import('./platform-bridge.js');
    bridge = pbMod.PlatformBridge;
  }

  afterEach(() => {
    delete (/** @type {any} */ (globalThis.window).AndroidBridge);
    if (DiagnosticLog) DiagnosticLog.clear();
    vi.restoreAllMocks();
  });

  it('web: returns the JS DiagnosticLog entries as a JSON string', async () => {
    /** @type {any} */ (globalThis).window = globalThis.window || /** @type {any} */ ({});
    delete (/** @type {any} */ (globalThis.window).AndroidBridge);
    await load();
    DiagnosticLog.warn('store', 'boom');
    const parsed = JSON.parse(bridge.getCrashLog());
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ lvl: 'W', tag: 'store', msg: 'boom' });
  });

  it('web: empty DiagnosticLog → "[]"', async () => {
    /** @type {any} */ (globalThis).window = globalThis.window || /** @type {any} */ ({});
    delete (/** @type {any} */ (globalThis.window).AndroidBridge);
    await load();
    expect(bridge.getCrashLog()).toBe('[]');
  });

  it('android: merges native BoundedLogTree + JS entries, sorted by timestamp', async () => {
    /** @type {any} */ (globalThis).window = globalThis.window || /** @type {any} */ ({});
    // Native log: two entries at t=10 and t=30 (Kotlin { t, lvl, tag, msg } shape).
    const nativeLog = JSON.stringify([
      { t: 10, lvl: 'W', tag: 'native', msg: 'a' },
      { t: 30, lvl: 'E', tag: 'native', msg: 'c' },
    ]);
    /** @type {any} */ (globalThis.window).AndroidBridge = { getCrashLog: () => nativeLog };
    await load();
    // Pin the JS entry to t=20 so the interleave assertion is deterministic.
    vi.spyOn(Date, 'now').mockReturnValue(20);
    DiagnosticLog.warn('js', 'b');
    const merged = JSON.parse(bridge.getCrashLog());
    expect(merged.map((/** @type {any} */ e) => e.msg)).toEqual(['a', 'b', 'c']);
    expect(merged.map((/** @type {any} */ e) => e.t)).toEqual([10, 20, 30]);
  });

  it('android: malformed native log falls back to JS-only (no throw)', async () => {
    /** @type {any} */ (globalThis).window = globalThis.window || /** @type {any} */ ({});
    /** @type {any} */ (globalThis.window).AndroidBridge = { getCrashLog: () => 'not json{' };
    await load();
    DiagnosticLog.warn('js', 'survives');
    const merged = JSON.parse(bridge.getCrashLog());
    expect(merged).toHaveLength(1);
    expect(merged[0].msg).toBe('survives');
  });

  it('android: non-array native payload is ignored', async () => {
    /** @type {any} */ (globalThis).window = globalThis.window || /** @type {any} */ ({});
    /** @type {any} */ (globalThis.window).AndroidBridge = { getCrashLog: () => '{"t":1}' };
    await load();
    expect(JSON.parse(bridge.getCrashLog())).toEqual([]);
  });
});
