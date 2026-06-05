/* W2.7a — StorageHealth tests.
   ─────────────────────────────
   Plain-module tests (no React). Exercises the detection engine, tier
   computation, risk flags, write-path integration, dismissal state,
   reactivity contract, and periodic refresh lifecycle through the
   public API with injected mock storage via _resetForTests.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StorageHealth } from './storage-health.js';
import { PlatformBridge } from './platform-bridge.js';
// D5: spy on the toast primitive so onWriteFailure tests don't touch real DOM
// and the dedup behavior is assertable.
import { showToast, hideToast } from './toast.js';
vi.mock('./toast.js', () => ({ showToast: vi.fn(), hideToast: vi.fn() }));

const { TIER, PLATFORM, RISK } = StorageHealth;

/** Helper: build a mock navigator.storage object. */
function mockStorage(opts = {}) {
  return {
    estimate: vi.fn().mockResolvedValue({
      quota: opts.quota ?? 2_400_000_000,
      usage: opts.usage ?? 45_000_000,
    }),
    persisted: vi.fn().mockResolvedValue(opts.persisted ?? true),
    persist: vi.fn().mockResolvedValue(opts.persistResult ?? true),
  };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  vi.mocked(showToast).mockClear();
  vi.mocked(hideToast).mockClear();
});

afterEach(() => {
  StorageHealth._resetForTests();
  vi.useRealTimers();
});

/* ═══════════════════════════════════════════════════════════════════
   Platform detection
   ═══════════════════════════════════════════════════════════════════ */

describe('platform detection', () => {
  it('Chrome UA → chrome', () => {
    expect(StorageHealth._detectPlatform(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    )).toBe(PLATFORM.CHROME);
  });

  it('Edge UA → edge', () => {
    expect(StorageHealth._detectPlatform(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0'
    )).toBe(PLATFORM.EDGE);
  });

  it('Firefox UA → firefox', () => {
    expect(StorageHealth._detectPlatform(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0'
    )).toBe(PLATFORM.FIREFOX);
  });

  it('Safari UA (no Chrome token) → safari-tab', () => {
    expect(StorageHealth._detectPlatform(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
    )).toBe(PLATFORM.SAFARI_TAB);
  });

  it('genuine iOS Safari → safari-tab', () => {
    expect(StorageHealth._detectPlatform(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
    )).toBe(PLATFORM.SAFARI_TAB);
  });

  // U20: browsers that carry "Safari" but are NOT Safari must NOT receive the
  // Safari-specific 7-day-eviction warning / first-data-creation gate — they
  // fall to the conservative, SILENT UNKNOWN path instead of a wrong warning.
  it('Chrome-iOS (CriOS) → NOT safari (was misclassified)', () => {
    const p = StorageHealth._detectPlatform(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.0.0 Mobile/15E148 Safari/604.1'
    );
    expect(p).not.toBe(PLATFORM.SAFARI_TAB);
    expect(p).toBe(PLATFORM.UNKNOWN);
  });

  it('Firefox-iOS (FxiOS) → NOT safari', () => {
    expect(StorageHealth._detectPlatform(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/126.0 Mobile/15E148 Safari/605.1.15'
    )).not.toBe(PLATFORM.SAFARI_TAB);
  });

  it('Edge-iOS (EdgiOS) → edge, not safari', () => {
    expect(StorageHealth._detectPlatform(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 EdgiOS/125.0.0.0 Mobile/15E148 Safari/605.1.15'
    )).toBe(PLATFORM.EDGE);
  });

  it('DuckDuckGo-iOS → NOT safari (conservative silent path)', () => {
    expect(StorageHealth._detectPlatform(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 DuckDuckGo/7 Safari/605.1.15'
    )).not.toBe(PLATFORM.SAFARI_TAB);
  });

  it('in-app WebView with a Safari token (Line) → NOT safari', () => {
    expect(StorageHealth._detectPlatform(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/13.0.0 Safari/605.1.15'
    )).not.toBe(PLATFORM.SAFARI_TAB);
  });

  it('Android (PlatformBridge.isAndroid) → android-webview', () => {
    // U14: _detectPlatform now routes through the bridge's single source of
    // truth instead of probing window.AndroidBridge directly.
    const orig = PlatformBridge.isAndroid;
    PlatformBridge.isAndroid = true;
    try {
      expect(StorageHealth._detectPlatform()).toBe(PLATFORM.ANDROID_WEBVIEW);
    } finally {
      PlatformBridge.isAndroid = orig;
    }
  });

  it('empty UA → unknown', () => {
    expect(StorageHealth._detectPlatform('')).toBe(PLATFORM.UNKNOWN);
  });

  it('getPlatform caches after first call', async () => {
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: mockStorage() });
    expect(StorageHealth.getPlatform()).toBe(PLATFORM.CHROME);
    expect(StorageHealth.getPlatform()).toBe(PLATFORM.CHROME);
  });

  it('platform injected via _resetForTests overrides detection', async () => {
    StorageHealth._resetForTests({ platform: PLATFORM.SAFARI_TAB, storageApi: mockStorage() });
    const r = await StorageHealth.assess();
    expect(r.platform).toBe(PLATFORM.SAFARI_TAB);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   Tier computation (through assess)
   ═══════════════════════════════════════════════════════════════════ */

describe('tier computation', () => {
  it('healthy: <50% used, persisted, no risks', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage({ quota: 2_000_000_000, usage: 100_000_000, persisted: true }),
    });
    const r = await StorageHealth.assess();
    expect(r.tier).toBe(TIER.HEALTHY);
  });

  it('caution: >50% used', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage({ quota: 1_000_000_000, usage: 600_000_000, persisted: true }),
    });
    const r = await StorageHealth.assess();
    expect(r.tier).toBe(TIER.CAUTION);
  });

  it('caution: not persisted', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage({ quota: 2_000_000_000, usage: 100_000_000, persisted: false }),
    });
    const r = await StorageHealth.assess();
    expect(r.tier).toBe(TIER.CAUTION);
  });

  it('android-webview: persisted=false does NOT force caution (app-private storage is durable)', async () => {
    // On the installed APK the WebView's data is durable app-private storage,
    // so navigator.storage.persisted() returning false is meaningless — the
    // tier must stay healthy and report persisted:true (no false alarm).
    StorageHealth._resetForTests({
      platform: PLATFORM.ANDROID_WEBVIEW,
      storageApi: mockStorage({ quota: 2_000_000_000, usage: 100_000_000, persisted: false }),
    });
    const r = await StorageHealth.assess();
    expect(r.tier).toBe(TIER.HEALTHY);
    expect(r.persisted).toBe(true);
  });

  it('caution: safari-tab platform', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.SAFARI_TAB,
      storageApi: mockStorage({ quota: 2_000_000_000, usage: 100_000_000, persisted: true }),
    });
    const r = await StorageHealth.assess();
    expect(r.tier).toBe(TIER.CAUTION);
  });

  it('warning: >80% used', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage({ quota: 1_000_000_000, usage: 850_000_000, persisted: true }),
    });
    const r = await StorageHealth.assess();
    expect(r.tier).toBe(TIER.WARNING);
  });

  it('warning: quota < 100 MB', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage({ quota: 80_000_000, usage: 10_000_000, persisted: true }),
    });
    const r = await StorageHealth.assess();
    expect(r.tier).toBe(TIER.WARNING);
  });

  it('critical: >95% used', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage({ quota: 1_000_000_000, usage: 960_000_000, persisted: true }),
    });
    const r = await StorageHealth.assess();
    expect(r.tier).toBe(TIER.CRITICAL);
  });

  it('critical: quota < 50 MB', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage({ quota: 40_000_000, usage: 5_000_000, persisted: true }),
    });
    const r = await StorageHealth.assess();
    expect(r.tier).toBe(TIER.CRITICAL);
  });

  it('critical: private mode likely (Safari + tiny quota)', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.SAFARI_TAB,
      storageApi: mockStorage({ quota: 100_000_000, usage: 5_000_000, persisted: false }),
    });
    const r = await StorageHealth.assess();
    expect(r.tier).toBe(TIER.CRITICAL);
    expect(r.privateModeLikely).toBe(true);
  });

  it('private-mode heuristic does NOT fire on Chrome even with small quota', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage({ quota: 100_000_000, usage: 5_000_000, persisted: false }),
    });
    const r = await StorageHealth.assess();
    expect(r.privateModeLikely).toBe(false);
  });

  it('readonly: write failure this session', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage({ quota: 2_000_000_000, usage: 100_000_000, persisted: true }),
    });
    await StorageHealth.assess();
    StorageHealth.onWriteFailure(new Error('QuotaExceededError'));
    expect(StorageHealth.getReport().tier).toBe(TIER.READONLY);
  });

  it('higher severity wins: >95% beats not-persisted', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage({ quota: 1_000_000_000, usage: 960_000_000, persisted: false }),
    });
    const r = await StorageHealth.assess();
    expect(r.tier).toBe(TIER.CRITICAL);
  });

  it('exactly 50% → caution (boundary)', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage({ quota: 1_000_000_000, usage: 500_000_000, persisted: true }),
    });
    const r = await StorageHealth.assess();
    expect(r.tier).toBe(TIER.CAUTION);
  });

  it('just under 50% → healthy', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage({ quota: 1_000_000_000, usage: 499_999_999, persisted: true }),
    });
    const r = await StorageHealth.assess();
    expect(r.tier).toBe(TIER.HEALTHY);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   Risk flags
   ═══════════════════════════════════════════════════════════════════ */

describe('risk flags', () => {
  it('safari-tab → safari-7day + not-persisted risks', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.SAFARI_TAB,
      storageApi: mockStorage({ quota: 2_000_000_000, usage: 100_000_000, persisted: false }),
    });
    const r = await StorageHealth.assess();
    expect(r.risks).toContain(RISK.SAFARI_7DAY);
    expect(r.risks).toContain(RISK.NOT_PERSISTED);
  });

  it('android-webview: persisted=false does NOT raise the not-persisted risk (no "protect my data" banner on the APK)', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.ANDROID_WEBVIEW,
      storageApi: mockStorage({ quota: 2_000_000_000, usage: 100_000_000, persisted: false }),
    });
    const r = await StorageHealth.assess();
    expect(r.risks).not.toContain(RISK.NOT_PERSISTED);
    expect(r.persisted).toBe(true);
  });

  it('safari-pwa → ios-pwa-isolate risk', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.SAFARI_PWA,
      storageApi: mockStorage({ quota: 2_000_000_000, usage: 100_000_000, persisted: true }),
    });
    const r = await StorageHealth.assess();
    expect(r.risks).toContain(RISK.IOS_PWA_ISOLATE);
    expect(r.risks).not.toContain(RISK.SAFARI_7DAY);
  });

  it('low quota → low-quota risk', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage({ quota: 80_000_000, usage: 10_000_000, persisted: true }),
    });
    const r = await StorageHealth.assess();
    expect(r.risks).toContain(RISK.LOW_QUOTA);
  });

  it('critical quota → both low-quota and critical-quota risks', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage({ quota: 40_000_000, usage: 5_000_000, persisted: true }),
    });
    const r = await StorageHealth.assess();
    expect(r.risks).toContain(RISK.LOW_QUOTA);
    expect(r.risks).toContain(RISK.CRITICAL_QUOTA);
  });

  it('private mode → private-mode risk', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.SAFARI_TAB,
      storageApi: mockStorage({ quota: 100_000_000, usage: 5_000_000, persisted: false }),
    });
    const r = await StorageHealth.assess();
    expect(r.risks).toContain(RISK.PRIVATE_MODE);
  });

  it('write failure → write-failed risk', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage(),
    });
    await StorageHealth.assess();
    StorageHealth.onWriteFailure(new Error('quota'));
    expect(StorageHealth.getReport().risks).toContain(RISK.WRITE_FAILED);
  });

  it('quota declining between assessments → quota-declining risk', async () => {
    const api = mockStorage({ quota: 2_000_000_000, usage: 100_000_000, persisted: true });
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: api });
    await StorageHealth.assess();

    api.estimate.mockResolvedValue({ quota: 1_800_000_000, usage: 100_000_000 });
    const r = await StorageHealth.assess();
    expect(r.risks).toContain(RISK.QUOTA_DECLINING);
  });

  it('healthy Chrome → no risk flags', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage({ quota: 2_000_000_000, usage: 100_000_000, persisted: true }),
    });
    const r = await StorageHealth.assess();
    expect(r.risks).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   assess() — report shape and edge cases
   ═══════════════════════════════════════════════════════════════════ */

describe('assess', () => {
  it('returns a complete report shape', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage({ quota: 2_000_000_000, usage: 200_000_000, persisted: true }),
    });
    const r = await StorageHealth.assess();
    expect(r).toMatchObject({
      tier: TIER.HEALTHY,
      platform: PLATFORM.CHROME,
      quota: 2_000_000_000,
      usage: 200_000_000,
      persisted: true,
      writeFailedThisSession: false,
      privateModeLikely: false,
    });
    expect(r.percentUsed).toBeCloseTo(0.1);
    expect(r.remaining).toBe(1_800_000_000);
    expect(r.lastAssessedAt).toBeGreaterThan(0);
    expect(Array.isArray(r.risks)).toBe(true);
  });

  it('storage API unavailable → fallback report with nulls', async () => {
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: null });
    const r = await StorageHealth.assess();
    expect(r.tier).toBe(TIER.HEALTHY);
    expect(r.quota).toBeNull();
    expect(r.usage).toBeNull();
    expect(r.persisted).toBeNull();
  });

  it('storage API unavailable + prior write failure → fallback stays READONLY', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage(),
    });
    await StorageHealth.assess();
    StorageHealth.onWriteFailure(new Error('quota'));
    await vi.advanceTimersByTimeAsync(0);

    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: null });
    StorageHealth.onWriteFailure(new Error('quota'));
    const r = await StorageHealth.assess();
    expect(r.tier).toBe(TIER.READONLY);
    expect(r.risks).toContain(RISK.WRITE_FAILED);
  });

  it('estimate() rejects → quota/usage null', async () => {
    const api = {
      estimate: vi.fn().mockRejectedValue(new Error('boom')),
      persisted: vi.fn().mockResolvedValue(false),
    };
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: api });
    const r = await StorageHealth.assess();
    expect(r.quota).toBeNull();
    expect(r.usage).toBeNull();
  });

  it('persisted() rejects → treated as false', async () => {
    const api = {
      estimate: vi.fn().mockResolvedValue({ quota: 1_000_000_000, usage: 100_000_000 }),
      persisted: vi.fn().mockRejectedValue(new Error('denied')),
    };
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: api });
    const r = await StorageHealth.assess();
    expect(r.persisted).toBe(false);
    expect(r.tier).toBe(TIER.CAUTION);
  });

  it('estimate returns missing fields → null', async () => {
    const api = {
      estimate: vi.fn().mockResolvedValue({}),
      persisted: vi.fn().mockResolvedValue(true),
    };
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: api });
    const r = await StorageHealth.assess();
    expect(r.quota).toBeNull();
    expect(r.usage).toBeNull();
    expect(r.percentUsed).toBeNull();
    expect(r.remaining).toBeNull();
  });

  it('concurrent calls are coalesced — estimate called only once', async () => {
    const api = mockStorage();
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: api });

    const [r1, r2, r3] = await Promise.all([
      StorageHealth.assess(),
      StorageHealth.assess(),
      StorageHealth.assess(),
    ]);

    expect(api.estimate).toHaveBeenCalledTimes(1);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
  });

  it('getReport returns default before first assess', () => {
    StorageHealth._resetForTests();
    const r = StorageHealth.getReport();
    expect(r.tier).toBe(TIER.HEALTHY);
    expect(r.quota).toBeNull();
    expect(r.lastAssessedAt).toBe(0);
  });

  it('getReport returns cached report after assess', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage({ quota: 500_000_000, usage: 100_000_000 }),
    });
    await StorageHealth.assess();
    const r = StorageHealth.getReport();
    expect(r.quota).toBe(500_000_000);
    expect(r.usage).toBe(100_000_000);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   checkBeforeWrite
   ═══════════════════════════════════════════════════════════════════ */

describe('checkBeforeWrite', () => {
  it('ok when plenty of space', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage({ quota: 2_000_000_000, usage: 100_000_000, persisted: true }),
    });
    await StorageHealth.assess();
    const result = StorageHealth.checkBeforeWrite(1_000_000);
    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('ok with warning when projected usage crosses 80%', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage({ quota: 1_000_000_000, usage: 790_000_000, persisted: true }),
    });
    await StorageHealth.assess();
    const result = StorageHealth.checkBeforeWrite(20_000_000);
    expect(result.ok).toBe(true);
    expect(result.reason).toBe('warning');
  });

  it('not ok when projected usage crosses 95%', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage({ quota: 1_000_000_000, usage: 940_000_000, persisted: true }),
    });
    await StorageHealth.assess();
    const result = StorageHealth.checkBeforeWrite(20_000_000);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('critical');
  });

  it('not ok when write-failed flag is set', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage({ quota: 2_000_000_000, usage: 100_000_000, persisted: true }),
    });
    await StorageHealth.assess();
    StorageHealth.onWriteFailure(new Error('quota'));
    const result = StorageHealth.checkBeforeWrite(1000);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('write-failed');
  });

  it('ok when no report exists yet', () => {
    StorageHealth._resetForTests();
    const result = StorageHealth.checkBeforeWrite(1_000_000);
    expect(result.ok).toBe(true);
  });

  it('ok when quota/usage are null', async () => {
    const api = {
      estimate: vi.fn().mockResolvedValue({}),
      persisted: vi.fn().mockResolvedValue(true),
    };
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: api });
    await StorageHealth.assess();
    const result = StorageHealth.checkBeforeWrite(1_000_000);
    expect(result.ok).toBe(true);
  });

  it('critical when quota is zero', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage({ quota: 0, usage: 0, persisted: true }),
    });
    await StorageHealth.assess();
    const result = StorageHealth.checkBeforeWrite(1_000);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('critical');
  });
});

/* ═══════════════════════════════════════════════════════════════════
   onWriteFailure / onWriteSuccess
   ═══════════════════════════════════════════════════════════════════ */

describe('write-path integration', () => {
  it('onWriteFailure transitions to READONLY', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage({ quota: 2_000_000_000, usage: 100_000_000, persisted: true }),
    });
    await StorageHealth.assess();
    expect(StorageHealth.getReport().tier).toBe(TIER.HEALTHY);

    StorageHealth.onWriteFailure(new Error('QuotaExceeded'));
    expect(StorageHealth.getReport().tier).toBe(TIER.READONLY);
    expect(StorageHealth.getReport().writeFailedThisSession).toBe(true);
    expect(StorageHealth.getReport().risks).toContain(RISK.WRITE_FAILED);
  });

  it('onWriteFailure adds write-failed risk without duplicating', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage(),
    });
    await StorageHealth.assess();
    StorageHealth.onWriteFailure(new Error('a'));
    StorageHealth.onWriteFailure(new Error('b'));

    const risks = StorageHealth.getReport().risks;
    const writeFailedCount = risks.filter(r => r === RISK.WRITE_FAILED).length;
    expect(writeFailedCount).toBe(1);
  });

  /* D5 — per-action write-failure toast (cooldown-deduped). */
  it('onWriteFailure shows a write-fail toast, deduped within the cooldown', () => {
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: mockStorage() });
    StorageHealth.onWriteFailure(new Error('quota'));
    StorageHealth.onWriteFailure(new Error('quota')); // same instant → suppressed
    StorageHealth.onWriteFailure(new Error('quota'));
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(vi.mocked(showToast).mock.calls[0][0].id).toBe('vot-toast-writefail');
    expect(vi.mocked(showToast).mock.calls[0][0].ariaLive).toBe('assertive');
  });

  it('re-shows the write-fail toast once the cooldown elapses', () => {
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: mockStorage() });
    StorageHealth.onWriteFailure(new Error('quota'));
    expect(showToast).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(8001); // past WRITE_FAIL_TOAST_COOLDOWN_MS (8000)
    StorageHealth.onWriteFailure(new Error('quota'));
    expect(showToast).toHaveBeenCalledTimes(2);
  });

  it('onWriteSuccess hides the toast + resets cooldown so the next failure toasts immediately', async () => {
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: mockStorage() });
    await StorageHealth.assess();
    StorageHealth.onWriteFailure(new Error('quota'));
    expect(showToast).toHaveBeenCalledTimes(1);
    await StorageHealth.onWriteSuccess();
    expect(hideToast).toHaveBeenCalledWith('vot-toast-writefail');
    StorageHealth.onWriteFailure(new Error('quota')); // cooldown reset → immediate
    expect(showToast).toHaveBeenCalledTimes(2);
  });

  it('onWriteSuccess clears READONLY and re-assesses', async () => {
    const api = mockStorage({ quota: 2_000_000_000, usage: 100_000_000, persisted: true });
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: api });
    await StorageHealth.assess();

    StorageHealth.onWriteFailure(new Error('quota'));
    expect(StorageHealth.getReport().tier).toBe(TIER.READONLY);

    await StorageHealth.onWriteSuccess();
    expect(StorageHealth.getReport().tier).toBe(TIER.HEALTHY);
    expect(StorageHealth.getReport().writeFailedThisSession).toBe(false);
  });

  it('onWriteSuccess is a no-op when no failure recorded', async () => {
    const api = mockStorage();
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: api });
    await StorageHealth.assess();
    const vBefore = StorageHealth.getVersion();

    await StorageHealth.onWriteSuccess();
    expect(StorageHealth.getVersion()).toBe(vBefore);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   reassessIfCautious
   ═══════════════════════════════════════════════════════════════════ */

describe('reassessIfCautious', () => {
  it('no-op when healthy', async () => {
    const api = mockStorage({ quota: 2_000_000_000, usage: 100_000_000, persisted: true });
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: api });
    await StorageHealth.assess();
    api.estimate.mockClear();

    StorageHealth.reassessIfCautious();
    // Should not have called assess (no new estimate call)
    await vi.advanceTimersByTimeAsync(0);
    expect(api.estimate).not.toHaveBeenCalled();
  });

  it('re-assesses when tier is caution', async () => {
    const api = mockStorage({ quota: 2_000_000_000, usage: 100_000_000, persisted: false });
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: api });
    await StorageHealth.assess();
    expect(StorageHealth.getReport().tier).toBe(TIER.CAUTION);
    api.estimate.mockClear();

    StorageHealth.reassessIfCautious();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.estimate).toHaveBeenCalled();
  });
});

/* ═══════════════════════════════════════════════════════════════════
   requestPersistence
   ═══════════════════════════════════════════════════════════════════ */

describe('requestPersistence', () => {
  it('granted → returns true and re-assesses', async () => {
    const api = mockStorage({ persisted: false, persistResult: true });
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: api });
    await StorageHealth.assess();
    expect(StorageHealth.getReport().persisted).toBe(false);

    const result = await StorageHealth.requestPersistence();
    expect(result).toBe(true);
    expect(api.persist).toHaveBeenCalledTimes(1);
  });

  it('denied → returns false, no re-assess', async () => {
    const api = mockStorage({ persisted: false, persistResult: false });
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: api });
    await StorageHealth.assess();
    api.estimate.mockClear();

    const result = await StorageHealth.requestPersistence();
    expect(result).toBe(false);
    expect(api.estimate).not.toHaveBeenCalled();
  });

  it('persist() throws → returns false', async () => {
    const api = {
      estimate: vi.fn().mockResolvedValue({ quota: 1_000_000_000, usage: 100_000_000 }),
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockRejectedValue(new Error('nope')),
    };
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: api });
    const result = await StorageHealth.requestPersistence();
    expect(result).toBe(false);
  });

  it('persist() not available → returns false', async () => {
    const api = {
      estimate: vi.fn().mockResolvedValue({ quota: 1_000_000_000, usage: 100_000_000 }),
      persisted: vi.fn().mockResolvedValue(false),
    };
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: api });
    const result = await StorageHealth.requestPersistence();
    expect(result).toBe(false);
  });

  it('storage API unavailable → returns false', async () => {
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: null });
    const result = await StorageHealth.requestPersistence();
    expect(result).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   checkFirstDataCreation (Safari 7-day gate)
   ═══════════════════════════════════════════════════════════════════ */

describe('checkFirstDataCreation', () => {
  it('non-Safari platform → shouldBlock false', () => {
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME });
    expect(StorageHealth.checkFirstDataCreation()).toEqual({ shouldBlock: false });
  });

  it('Safari tab, first call → shouldBlock true', () => {
    StorageHealth._resetForTests({ platform: PLATFORM.SAFARI_TAB });
    const result = StorageHealth.checkFirstDataCreation();
    expect(result.shouldBlock).toBe(true);
    expect(result.reason).toBe('safari-7day');
  });

  it('Safari tab, second call → shouldBlock false (shown this session)', () => {
    StorageHealth._resetForTests({ platform: PLATFORM.SAFARI_TAB });
    StorageHealth.checkFirstDataCreation();
    expect(StorageHealth.checkFirstDataCreation().shouldBlock).toBe(false);
  });

  it('Safari tab, dismissed → shouldBlock false', () => {
    StorageHealth._resetForTests({ platform: PLATFORM.SAFARI_TAB });
    StorageHealth.dismissScenario('safari-7day');
    expect(StorageHealth.checkFirstDataCreation().shouldBlock).toBe(false);
  });

  it('Safari PWA → shouldBlock false (PWA is safe from 7-day eviction)', () => {
    StorageHealth._resetForTests({ platform: PLATFORM.SAFARI_PWA });
    expect(StorageHealth.checkFirstDataCreation().shouldBlock).toBe(false);
  });

  it('resets across _resetForTests', () => {
    StorageHealth._resetForTests({ platform: PLATFORM.SAFARI_TAB });
    StorageHealth.checkFirstDataCreation();
    expect(StorageHealth.checkFirstDataCreation().shouldBlock).toBe(false);

    StorageHealth._resetForTests({ platform: PLATFORM.SAFARI_TAB });
    expect(StorageHealth.checkFirstDataCreation().shouldBlock).toBe(true);
  });

  it('bumps version when shouldBlock fires', () => {
    StorageHealth._resetForTests({ platform: PLATFORM.SAFARI_TAB });
    const vBefore = StorageHealth.getVersion();
    StorageHealth.checkFirstDataCreation();
    expect(StorageHealth.getVersion()).toBe(vBefore + 1);
  });

  it('does not bump version when shouldBlock is false', () => {
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME });
    const vBefore = StorageHealth.getVersion();
    StorageHealth.checkFirstDataCreation();
    expect(StorageHealth.getVersion()).toBe(vBefore);
  });

  it('sets safariGateBlocked in report when shouldBlock fires', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.SAFARI_TAB,
      storageApi: { estimate: () => Promise.resolve({ quota: 1e9, usage: 1e6 }), persisted: () => Promise.resolve(false) },
    });
    await StorageHealth.assess();
    expect(StorageHealth.getReport().safariGateBlocked).toBe(false);
    StorageHealth.checkFirstDataCreation();
    expect(StorageHealth.getReport().safariGateBlocked).toBe(true);
  });

  it('dismissScenario clears safariGateBlocked', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.SAFARI_TAB,
      storageApi: { estimate: () => Promise.resolve({ quota: 1e9, usage: 1e6 }), persisted: () => Promise.resolve(false) },
    });
    await StorageHealth.assess();
    StorageHealth.checkFirstDataCreation();
    expect(StorageHealth.getReport().safariGateBlocked).toBe(true);
    StorageHealth.dismissScenario('safari-7day');
    expect(StorageHealth.getReport().safariGateBlocked).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   setStoresDegraded (E5)
   ═══════════════════════════════════════════════════════════════════ */

describe('setStoresDegraded (E5)', () => {
  const healthyApi = {
    estimate: () => Promise.resolve({ quota: 1e9, usage: 1e6 }),
    persisted: () => Promise.resolve(true),
  };

  it('default report carries storesDegraded:false', () => {
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME });
    expect(StorageHealth.getReport().storesDegraded).toBe(false);
  });

  it('flips the report flag + bumps version', async () => {
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: healthyApi });
    await StorageHealth.assess();
    expect(StorageHealth.getReport().storesDegraded).toBe(false);
    const vBefore = StorageHealth.getVersion();
    StorageHealth.setStoresDegraded(true);
    expect(StorageHealth.getReport().storesDegraded).toBe(true);
    expect(StorageHealth.getVersion()).toBe(vBefore + 1);
  });

  it('clearing flips it back + bumps again', async () => {
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: healthyApi });
    await StorageHealth.assess();
    StorageHealth.setStoresDegraded(true);
    const v = StorageHealth.getVersion();
    StorageHealth.setStoresDegraded(false);
    expect(StorageHealth.getReport().storesDegraded).toBe(false);
    expect(StorageHealth.getVersion()).toBe(v + 1);
  });

  it('no-op early-return: setting the same value does not bump', () => {
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME });
    StorageHealth.setStoresDegraded(true);
    const v = StorageHealth.getVersion();
    StorageHealth.setStoresDegraded(true);
    expect(StorageHealth.getVersion()).toBe(v);
  });

  it('resets across _resetForTests', () => {
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME });
    StorageHealth.setStoresDegraded(true);
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME });
    expect(StorageHealth.getReport().storesDegraded).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   Dismissal state
   ═══════════════════════════════════════════════════════════════════ */

describe('dismissal state', () => {
  it('isDismissed returns false for unknown scenarios', () => {
    StorageHealth._resetForTests();
    expect(StorageHealth.isDismissed('persist-banner')).toBe(false);
  });

  it('dismissScenario marks scenario as dismissed', () => {
    StorageHealth._resetForTests();
    StorageHealth.dismissScenario('persist-banner');
    expect(StorageHealth.isDismissed('persist-banner')).toBe(true);
  });

  it('dismissal is per-session (cleared by _resetForTests)', () => {
    StorageHealth._resetForTests();
    StorageHealth.dismissScenario('persist-banner');
    StorageHealth._resetForTests();
    expect(StorageHealth.isDismissed('persist-banner')).toBe(false);
  });

  it('dismissScenario bumps version', () => {
    StorageHealth._resetForTests();
    const v = StorageHealth.getVersion();
    StorageHealth.dismissScenario('persist-banner');
    expect(StorageHealth.getVersion()).toBe(v + 1);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   Reactivity — subscribe / getVersion
   ═══════════════════════════════════════════════════════════════════ */

describe('reactivity', () => {
  it('version increments on assess', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage(),
    });
    const v0 = StorageHealth.getVersion();
    await StorageHealth.assess();
    expect(StorageHealth.getVersion()).toBe(v0 + 1);
  });

  it('subscribers are notified on assess', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage(),
    });
    const cb = vi.fn();
    StorageHealth.subscribe(cb);
    await StorageHealth.assess();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops notifications', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage(),
    });
    const cb = vi.fn();
    const unsub = StorageHealth.subscribe(cb);
    unsub();
    await StorageHealth.assess();
    expect(cb).not.toHaveBeenCalled();
  });

  it('subscriber that throws does not block siblings', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage(),
    });
    const bad = vi.fn(() => { throw new Error('bad'); });
    const good = vi.fn();
    StorageHealth.subscribe(bad);
    StorageHealth.subscribe(good);
    await StorageHealth.assess();
    expect(bad).toHaveBeenCalled();
    expect(good).toHaveBeenCalled();
  });

  it('onWriteFailure bumps version', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage(),
    });
    await StorageHealth.assess();
    const v = StorageHealth.getVersion();
    StorageHealth.onWriteFailure(new Error('quota'));
    // onWriteFailure bumps once immediately, then assess bumps again
    expect(StorageHealth.getVersion()).toBeGreaterThan(v);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   start / stop lifecycle
   ═══════════════════════════════════════════════════════════════════ */

describe('start / stop', () => {
  it('start kicks off an initial assess', async () => {
    const api = mockStorage();
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: api });
    StorageHealth.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.estimate).toHaveBeenCalledTimes(1);
    StorageHealth.stop();
  });

  it('start is idempotent', async () => {
    const api = mockStorage();
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: api });
    StorageHealth.start();
    StorageHealth.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.estimate).toHaveBeenCalledTimes(1);
    StorageHealth.stop();
  });

  it('periodic refresh fires after REFRESH_INTERVAL_MS', async () => {
    const api = mockStorage();
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: api });
    StorageHealth.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.estimate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(300_000);
    expect(api.estimate).toHaveBeenCalledTimes(2);
    StorageHealth.stop();
  });

  it('stop clears interval — no more periodic refreshes', async () => {
    const api = mockStorage();
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: api });
    StorageHealth.start();
    await vi.advanceTimersByTimeAsync(0);
    StorageHealth.stop();
    api.estimate.mockClear();

    await vi.advanceTimersByTimeAsync(600_000);
    expect(api.estimate).not.toHaveBeenCalled();
  });

  it('stop is idempotent', () => {
    StorageHealth._resetForTests();
    expect(() => {
      StorageHealth.stop();
      StorageHealth.stop();
    }).not.toThrow();
  });
});

/* ═══════════════════════════════════════════════════════════════════
   _resetForTests
   ═══════════════════════════════════════════════════════════════════ */

describe('_resetForTests', () => {
  it('clears all state', async () => {
    StorageHealth._resetForTests({
      platform: PLATFORM.CHROME,
      storageApi: mockStorage(),
    });
    await StorageHealth.assess();
    StorageHealth.onWriteFailure(new Error('x'));
    StorageHealth.dismissScenario('test');

    StorageHealth._resetForTests();
    expect(StorageHealth.getReport().lastAssessedAt).toBe(0);
    expect(StorageHealth.getVersion()).toBe(0);
    expect(StorageHealth.isDismissed('test')).toBe(false);
  });

  it('accepts platform override', () => {
    StorageHealth._resetForTests({ platform: PLATFORM.FIREFOX });
    expect(StorageHealth.getPlatform()).toBe(PLATFORM.FIREFOX);
  });

  it('accepts storageApi override', async () => {
    const api = mockStorage({ quota: 999, usage: 111 });
    StorageHealth._resetForTests({ platform: PLATFORM.CHROME, storageApi: api });
    const r = await StorageHealth.assess();
    expect(r.quota).toBe(999);
    expect(r.usage).toBe(111);
  });
});
