/* StorageHealthBanner tests.
   ──────────────────────────
   Tests the banner component's scenario-selection logic and render
   output. Stubs StorageHealth + formatBytes as globals (they live in
   bundle-b; bundle-d code references them as free variables).
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { StorageHealth } from '../../utils/storage-health.js';
import { formatBytes } from '../../utils/format-bytes.js';
import { StorageHealthBanner, useStorageHealth } from './StorageHealthBanner.jsx';
import { renderHook, act } from '@testing-library/react';

beforeEach(() => {
  globalThis.StorageHealth = StorageHealth;
  globalThis.formatBytes = formatBytes;
  StorageHealth._resetForTests({
    platform: 'chrome',
    storageApi: {
      estimate: () => Promise.resolve({ quota: 1e9, usage: 1e8 }),
      persisted: () => Promise.resolve(true),
    },
  });
});

afterEach(() => {
  cleanup();
});

/** Build a mock report with defaults. */
function mkReport(overrides) {
  return {
    tier: StorageHealth.TIER.HEALTHY,
    platform: 'chrome',
    quota: 1e9,
    usage: 1e8,
    persisted: true,
    percentUsed: 0.1,
    remaining: 9e8,
    risks: [],
    privateModeLikely: false,
    lastAssessedAt: Date.now(),
    writeFailedThisSession: false,
    ...overrides,
  };
}

/** Render the banner with a fixed report. */
function renderBanner(reportOverrides, props = {}) {
  const report = mkReport(reportOverrides);
  const origGetReport = StorageHealth.getReport;
  StorageHealth.getReport = () => report;
  const result = render(
    <StorageHealthBanner onNavigateSettings={props.onNavigateSettings || vi.fn()} />
  );
  StorageHealth.getReport = origGetReport;
  return { ...result, report };
}

/* ─── useStorageHealth hook ─────────────────────────────────────── */

describe('useStorageHealth hook', () => {
  it('returns the current report from StorageHealth', () => {
    const { result } = renderHook(() => useStorageHealth());
    expect(result.current.tier).toBe(StorageHealth.TIER.HEALTHY);
  });

  it('re-renders when StorageHealth bumps version', async () => {
    const { result } = renderHook(() => useStorageHealth());
    expect(result.current.tier).toBe(StorageHealth.TIER.HEALTHY);

    await act(async () => {
      StorageHealth.onWriteFailure(new Error('QuotaExceeded'));
    });

    expect(result.current.tier).toBe(StorageHealth.TIER.READONLY);
    expect(result.current.writeFailedThisSession).toBe(true);
  });
});

/* ─── Banner: HEALTHY (nothing rendered) ───────────────────────── */

describe('StorageHealthBanner — scenario 1 (healthy)', () => {
  it('renders nothing when tier is HEALTHY', () => {
    const { container } = renderBanner({ tier: StorageHealth.TIER.HEALTHY });
    expect(container.querySelector('.sh-banner')).toBeNull();
  });

  it('renders nothing when CAUTION but NOT not-persisted risk', () => {
    const { container } = renderBanner({
      tier: StorageHealth.TIER.CAUTION,
      risks: ['safari-7day'],
    });
    expect(container.querySelector('.sh-banner')).toBeNull();
  });
});

/* ─── Banner: scenario 2 (not-persisted) ───────────────────────── */

describe('StorageHealthBanner — scenario 2 (not persisted)', () => {
  it('shows gold banner with "Protect my data" button', () => {
    const { container } = renderBanner({
      tier: StorageHealth.TIER.CAUTION,
      risks: [StorageHealth.RISK.NOT_PERSISTED],
      persisted: false,
    });
    const banner = container.querySelector('.sh-banner');
    expect(banner).not.toBeNull();
    expect(banner.className).toContain('sh-banner-gold');
    expect(banner.textContent).toContain('protected from browser cleanup');
    expect(container.querySelector('.sh-banner-btn-primary').textContent).toBe('Protect my data');
  });

  it('has dismiss button', () => {
    const { container } = renderBanner({
      tier: StorageHealth.TIER.CAUTION,
      risks: [StorageHealth.RISK.NOT_PERSISTED],
    });
    expect(container.querySelector('.sh-banner-dismiss')).not.toBeNull();
  });

  it('disappears after dismissal via StorageHealth.dismissScenario', () => {
    const report = mkReport({
      tier: StorageHealth.TIER.CAUTION,
      risks: [StorageHealth.RISK.NOT_PERSISTED],
    });
    StorageHealth.getReport = () => report;
    const { container } = render(
      <StorageHealthBanner onNavigateSettings={vi.fn()} />
    );
    expect(container.querySelector('.sh-banner')).not.toBeNull();

    StorageHealth.dismissScenario('not-persisted');
    expect(StorageHealth.isDismissed('not-persisted')).toBe(true);
  });
});

/* ─── Banner: scenario 6 (warning) ────────────────────────────── */

describe('StorageHealthBanner — scenario 6 (warning)', () => {
  it('shows amber banner with remaining space', () => {
    const { container } = renderBanner({
      tier: StorageHealth.TIER.WARNING,
      remaining: 50 * 1024 * 1024,
    });
    const banner = container.querySelector('.sh-banner');
    expect(banner.className).toContain('sh-banner-amber');
    expect(banner.textContent).toContain('running low');
    expect(banner.textContent).toContain('50.0 MB');
  });

  it('shows "Export data" button', () => {
    const { container } = renderBanner({ tier: StorageHealth.TIER.WARNING, remaining: 30e6 });
    expect(container.querySelector('.sh-banner-btn').textContent).toBe('Export data');
  });

  it('is NOT dismissable', () => {
    const { container } = renderBanner({ tier: StorageHealth.TIER.WARNING, remaining: 30e6 });
    expect(container.querySelector('.sh-banner-dismiss')).toBeNull();
  });

  it('Export button calls onNavigateSettings', () => {
    const spy = vi.fn();
    const { container } = renderBanner(
      { tier: StorageHealth.TIER.WARNING, remaining: 30e6 },
      { onNavigateSettings: spy },
    );
    container.querySelector('.sh-banner-btn').click();
    expect(spy).toHaveBeenCalledOnce();
  });
});

/* ─── Banner: scenario 7 (critical) ───────────────────────────── */

describe('StorageHealthBanner — scenario 7 (critical)', () => {
  it('shows danger banner for critical quota', () => {
    const { container } = renderBanner({
      tier: StorageHealth.TIER.CRITICAL,
      remaining: 10 * 1024 * 1024,
    });
    const banner = container.querySelector('.sh-banner');
    expect(banner.className).toContain('sh-banner-danger');
    expect(banner.textContent).toContain('almost full');
    expect(banner.textContent).toContain('10.0 MB');
  });

  it('shows danger banner for write-failed (READONLY)', () => {
    const { container } = renderBanner({
      tier: StorageHealth.TIER.READONLY,
      writeFailedThisSession: true,
      remaining: 0,
    });
    const banner = container.querySelector('.sh-banner');
    expect(banner.className).toContain('sh-banner-danger');
    expect(banner.textContent).toContain("couldn't be saved");
  });

  it('is NOT dismissable', () => {
    const { container } = renderBanner({ tier: StorageHealth.TIER.CRITICAL, remaining: 5e6 });
    expect(container.querySelector('.sh-banner-dismiss')).toBeNull();
  });

  it('write-failed takes priority over critical-quota', () => {
    const { container } = renderBanner({
      tier: StorageHealth.TIER.READONLY,
      writeFailedThisSession: true,
      remaining: 10e6,
    });
    expect(container.querySelector('.sh-banner').textContent).toContain("couldn't be saved");
  });
});

/* ─── Banner: scenario 8 (private mode) ───────────────────────── */

describe('StorageHealthBanner — scenario 8 (private mode)', () => {
  it('shows danger banner for private browsing', () => {
    const { container } = renderBanner({
      tier: StorageHealth.TIER.CRITICAL,
      privateModeLikely: true,
    });
    const banner = container.querySelector('.sh-banner');
    expect(banner.className).toContain('sh-banner-danger');
    expect(banner.textContent).toContain('private window');
  });

  it('is NOT dismissable', () => {
    const { container } = renderBanner({ tier: StorageHealth.TIER.CRITICAL, privateModeLikely: true });
    expect(container.querySelector('.sh-banner-dismiss')).toBeNull();
  });

  it('private mode takes priority over critical-quota text', () => {
    const { container } = renderBanner({
      tier: StorageHealth.TIER.CRITICAL,
      privateModeLikely: true,
      remaining: 5e6,
    });
    const text = container.querySelector('.sh-banner').textContent;
    expect(text).toContain('private window');
    expect(text).not.toContain('almost full');
  });
});

/* ─── Priority order ───────────────────────────────────────────── */

describe('StorageHealthBanner — priority', () => {
  it('READONLY+writeFailed > privateModeLikely', () => {
    const { container } = renderBanner({
      tier: StorageHealth.TIER.READONLY,
      writeFailedThisSession: true,
      privateModeLikely: true,
    });
    expect(container.querySelector('.sh-banner').textContent).toContain("couldn't be saved");
  });

  it('WARNING > CAUTION not-persisted', () => {
    const { container } = renderBanner({
      tier: StorageHealth.TIER.WARNING,
      risks: [StorageHealth.RISK.NOT_PERSISTED],
      remaining: 30e6,
    });
    expect(container.querySelector('.sh-banner').className).toContain('sh-banner-amber');
  });

  it('CRITICAL > WARNING text', () => {
    const { container } = renderBanner({
      tier: StorageHealth.TIER.CRITICAL,
      remaining: 5e6,
    });
    expect(container.querySelector('.sh-banner').className).toContain('sh-banner-danger');
  });
});

/* ─── Null remaining fallback ──────────────────────────────────── */

describe('StorageHealthBanner — null remaining', () => {
  it('WARNING with null remaining shows "limited space"', () => {
    const { container } = renderBanner({ tier: StorageHealth.TIER.WARNING, remaining: null });
    expect(container.querySelector('.sh-banner').textContent).toContain('limited space');
  });

  it('CRITICAL with null remaining shows "very little"', () => {
    const { container } = renderBanner({ tier: StorageHealth.TIER.CRITICAL, remaining: null });
    expect(container.querySelector('.sh-banner').textContent).toContain('very little');
  });
});
