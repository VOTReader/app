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

  // Category 3 — notYetImplemented warns but doesn't throw
  // (setKeepScreenOn moved out — has a real WakeLock impl as of W1.2 Tier B.1;
  //  openFilePicker + saveToDownloads moved out — Tier B.2 real impls;
  //  takeScreenshot moved out — Tier A html2canvas impl.
  //  All have their own describe blocks below.)
  it.each([
    'haptic',
    'requestMicPermission',
    'nativeRecordStop',
    'nativeRecordCancel',
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
// Web saveToDownloads — Blob + anchor click (W1.2 Tier B.2)
// ─────────────────────────────────────────────────────────────────────

describe('PlatformBridge — Web saveToDownloads (Blob + anchor)', () => {
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
  });

  it('creates Blob, anchors a download link, clicks it, returns "ok"', () => {
    const result = bridge.saveToDownloads('backup.json', '{"a":1}');
    expect(result).toBe('ok');
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(anchorEl.download).toBe('backup.json');
    expect(anchorEl.getAttribute('href')).toBe('blob:mock-url');
    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
  });

  it('revokes the object URL after click (deferred via setTimeout 0)', async () => {
    bridge.saveToDownloads('backup.json', '{}');
    // The setTimeout 0 hasn't fired yet
    expect(revokeObjectURLSpy).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');
    expect(anchorRemoveSpy).toHaveBeenCalledTimes(1);
  });

  it('returns "error:<reason>" when Blob construction throws', () => {
    const origBlob = globalThis.Blob;
    /** @type {any} */ (globalThis).Blob = function () { throw new Error('quota exceeded'); };
    const result = bridge.saveToDownloads('backup.json', '{}');
    expect(result).toMatch(/^error:/);
    expect(result).toMatch(/quota exceeded/);
    /** @type {any} */ (globalThis).Blob = origBlob;
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
