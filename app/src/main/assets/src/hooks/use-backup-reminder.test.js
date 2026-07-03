/* useBackupReminder — backup-freshness boot reminder.
   ─────────────────────────────────────────────────────────────────────
   Two layers under test:
     1. shouldRemindBackup — the pure decision fn (threshold matrix).
     2. useBackupReminder — the boot effect: settle timer → measureUserData
        (mocked via vi.mock) → real showToast DOM → lastBackupRemindedAt
        stamp → the "Export from Settings" button deep-links via goSettings.
   The toast utility is REAL (jsdom DOM assertions); only the IDB-touching
   measurement is mocked. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  shouldRemindBackup, useBackupReminder,
  BACKUP_STALE_MS, BACKUP_REMIND_COOLDOWN_MS, BACKUP_MIN_DATA_BYTES,
} from './use-backup-reminder.js';
import { _resetToasts } from '../utils/toast.js';

vi.mock('../utils/user-data-size.js', () => ({
  measureUserData: vi.fn(),
}));
import { measureUserData } from '../utils/user-data-size.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1780000000000; // fixed epoch for the matrix
const BIG = 200 * 1024;    // comfortably over the 50 KB floor

describe('shouldRemindBackup — pure decision matrix', () => {
  const base = { lastExportAt: null, lastRemindedAt: null, dataBytes: BIG, enabled: true, now: NOW };

  it('reminds when the user has never exported and has non-trivial data', () => {
    expect(shouldRemindBackup({ ...base })).toBe(true);
  });

  it('does NOT remind right after a fresh export', () => {
    expect(shouldRemindBackup({ ...base, lastExportAt: NOW - DAY })).toBe(false);
  });

  it('stale boundary: 29 days old is fresh, 31 days old is stale', () => {
    expect(shouldRemindBackup({ ...base, lastExportAt: NOW - 29 * DAY })).toBe(false);
    expect(shouldRemindBackup({ ...base, lastExportAt: NOW - 31 * DAY })).toBe(true);
  });

  it('exactly at the 30-day mark counts as stale (< is the fresh window)', () => {
    expect(shouldRemindBackup({ ...base, lastExportAt: NOW - BACKUP_STALE_MS })).toBe(true);
  });

  it('does NOT remind on a trivial profile (≤ 50 KB), even never-exported', () => {
    expect(shouldRemindBackup({ ...base, dataBytes: 10 * 1024 })).toBe(false);
    expect(shouldRemindBackup({ ...base, dataBytes: BACKUP_MIN_DATA_BYTES })).toBe(false);
    expect(shouldRemindBackup({ ...base, dataBytes: BACKUP_MIN_DATA_BYTES + 1 })).toBe(true);
  });

  it('does NOT remind when dataBytes is missing or malformed', () => {
    expect(shouldRemindBackup({ ...base, dataBytes: undefined })).toBe(false);
    expect(shouldRemindBackup({ ...base, dataBytes: NaN })).toBe(false);
  });

  it('the settings toggle silences it outright', () => {
    expect(shouldRemindBackup({ ...base, enabled: false })).toBe(false);
  });

  it('7-day cooldown: reminded 2 days ago = quiet, 8 days ago = remind again', () => {
    expect(shouldRemindBackup({ ...base, lastRemindedAt: NOW - 2 * DAY })).toBe(false);
    expect(shouldRemindBackup({ ...base, lastRemindedAt: NOW - 8 * DAY })).toBe(true);
    expect(shouldRemindBackup({ ...base, lastRemindedAt: NOW - BACKUP_REMIND_COOLDOWN_MS })).toBe(true);
  });

  it('a future-dated export stamp (clock rolled back) reads as fresh — no nag', () => {
    expect(shouldRemindBackup({ ...base, lastExportAt: NOW + 5 * DAY })).toBe(false);
  });

  it('a stale export + expired cooldown reminds', () => {
    expect(shouldRemindBackup({
      ...base, lastExportAt: NOW - 90 * DAY, lastRemindedAt: NOW - 10 * DAY,
    })).toBe(true);
  });
});

describe('useBackupReminder — boot effect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetToasts();
    vi.mocked(measureUserData).mockReset();
  });
  afterEach(() => {
    _resetToasts();
    vi.useRealTimers();
  });

  const settle = async () => { await vi.advanceTimersByTimeAsync(4000); };
  const toastEl = () => document.getElementById('vot-toast-backup');

  it('stale profile: shows the toast after the settle and stamps lastBackupRemindedAt', async () => {
    vi.mocked(measureUserData).mockResolvedValue({ total: BIG, structured: BIG, media: 0, mediaCount: 0 });
    const updateSetting = vi.fn();
    renderHook(() => useBackupReminder({ settings: {}, updateSetting, goSettings: vi.fn() }));
    expect(toastEl()).toBeNull(); // nothing before the settle
    await settle();
    const el = toastEl();
    expect(el).not.toBeNull();
    expect(el.classList.contains('show')).toBe(true);
    expect(el.textContent).toContain('backup');
    expect(updateSetting).toHaveBeenCalledWith('lastBackupRemindedAt', expect.any(Number));
  });

  it('does NOT fire after a fresh export', async () => {
    vi.mocked(measureUserData).mockResolvedValue({ total: BIG, structured: BIG, media: 0, mediaCount: 0 });
    const updateSetting = vi.fn();
    renderHook(() => useBackupReminder({
      settings: { lastExportAt: Date.now() - DAY }, updateSetting, goSettings: vi.fn(),
    }));
    await settle();
    expect(toastEl()).toBeNull();
    expect(updateSetting).not.toHaveBeenCalled();
  });

  it('toggle off: never even measures', async () => {
    vi.mocked(measureUserData).mockResolvedValue({ total: BIG, structured: BIG, media: 0, mediaCount: 0 });
    renderHook(() => useBackupReminder({
      settings: { backupReminder: false }, updateSetting: vi.fn(), goSettings: vi.fn(),
    }));
    await settle();
    expect(measureUserData).not.toHaveBeenCalled();
    expect(toastEl()).toBeNull();
  });

  it('7-day debounce: a recent reminder keeps this boot quiet', async () => {
    vi.mocked(measureUserData).mockResolvedValue({ total: BIG, structured: BIG, media: 0, mediaCount: 0 });
    const updateSetting = vi.fn();
    renderHook(() => useBackupReminder({
      settings: { lastBackupRemindedAt: Date.now() - 2 * DAY }, updateSetting, goSettings: vi.fn(),
    }));
    await settle();
    expect(toastEl()).toBeNull();
    expect(updateSetting).not.toHaveBeenCalled();
  });

  it('trivial data (< 50 KB): no toast', async () => {
    vi.mocked(measureUserData).mockResolvedValue({ total: 1024, structured: 1024, media: 0, mediaCount: 0 });
    renderHook(() => useBackupReminder({ settings: {}, updateSetting: vi.fn(), goSettings: vi.fn() }));
    await settle();
    expect(toastEl()).toBeNull();
  });

  it('the toast button deep-links to Settings and hides the toast', async () => {
    vi.mocked(measureUserData).mockResolvedValue({ total: BIG, structured: BIG, media: 0, mediaCount: 0 });
    const goSettings = vi.fn();
    renderHook(() => useBackupReminder({ settings: {}, updateSetting: vi.fn(), goSettings }));
    await settle();
    const btn = toastEl().querySelector('.vot-backup-btn');
    expect(btn).not.toBeNull();
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(goSettings).toHaveBeenCalledTimes(1);
    expect(toastEl().classList.contains('show')).toBe(false);
  });

  it('unmount before the settle cancels the check', async () => {
    vi.mocked(measureUserData).mockResolvedValue({ total: BIG, structured: BIG, media: 0, mediaCount: 0 });
    const { unmount } = renderHook(() => useBackupReminder({
      settings: {}, updateSetting: vi.fn(), goSettings: vi.fn(),
    }));
    unmount();
    await settle();
    expect(measureUserData).not.toHaveBeenCalled();
    expect(toastEl()).toBeNull();
  });

  it('a failed measurement stays silent (no toast, no throw)', async () => {
    vi.mocked(measureUserData).mockRejectedValue(new Error('idb down'));
    renderHook(() => useBackupReminder({ settings: {}, updateSetting: vi.fn(), goSettings: vi.fn() }));
    await settle();
    expect(toastEl()).toBeNull();
  });
});
