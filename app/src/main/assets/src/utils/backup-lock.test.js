/* backup-lock — W7 (sweep 2026-10-13): the boot hooks ask it whether another tab restores. */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { BACKUP_LOCK, LOCK_POLL_MS, backupLockBusy, canQueryBackupLock, whenBackupLockFree } from './backup-lock.js';

afterEach(() => { delete /** @type {any} */ (navigator.locks).query; });

describe('backupLockBusy', () => {
  it('names the lock backup.js holds across every import, export, verify and Clear All', () => {
    expect(BACKUP_LOCK).toBe('votreader-backup-import');
  });

  it('cannot say without a Web Locks query (the test shim): false, and canQueryBackupLock says so', async () => {
    expect(canQueryBackupLock()).toBe(false);
    expect(await backupLockBusy()).toBe(false);
  });

  it('true when a tab holds the backup lock, false when only other locks are held', async () => {
    /** @type {any} */ (navigator.locks).query = vi.fn()
      .mockResolvedValueOnce({ held: [{ name: BACKUP_LOCK, mode: 'exclusive' }], pending: [] })
      .mockResolvedValueOnce({ held: [{ name: 'vot-store:vot-history', mode: 'exclusive' }], pending: [] });
    expect(canQueryBackupLock()).toBe(true);
    expect(await backupLockBusy()).toBe(true);
    expect(await backupLockBusy()).toBe(false);
  });

  it('a query that throws counts as held, so a caller leaves the data alone', async () => {
    /** @type {any} */ (navigator.locks).query = vi.fn().mockRejectedValue(new Error('SecurityError'));
    expect(await backupLockBusy()).toBe(true);
  });
});

describe('whenBackupLockFree (W7 round 2: a restore whose tab dies after this tab looked)', () => {
  afterEach(() => { vi.useRealTimers(); });
  /** @param {() => boolean} held */
  function lockState(held) {
    /** @type {any} */ (navigator.locks).query = vi.fn(async () => ({ held: held() ? [{ name: BACKUP_LOCK, mode: 'exclusive' }] : [], pending: [] }));
  }

  it('runs once the lock has been free for two looks in a row, and only once', async () => {
    vi.useFakeTimers();
    let held = true;
    lockState(() => held);
    const fn = vi.fn();
    whenBackupLockFree(fn);
    await vi.advanceTimersByTimeAsync(LOCK_POLL_MS * 3);
    expect(fn).not.toHaveBeenCalled();             // held all along
    held = false;
    await vi.advanceTimersByTimeAsync(LOCK_POLL_MS);
    expect(fn).not.toHaveBeenCalled();             // free once is not enough
    await vi.advanceTimersByTimeAsync(LOCK_POLL_MS);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(LOCK_POLL_MS * 5);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('a lock taken again between two looks starts the count over', async () => {
    vi.useFakeTimers();
    const states = [false, true, false, false];
    lockState(() => (states.length ? /** @type {boolean} */ (states.shift()) : false));
    const fn = vi.fn();
    whenBackupLockFree(fn);
    await vi.advanceTimersByTimeAsync(LOCK_POLL_MS * 3);
    expect(fn).not.toHaveBeenCalled();             // free, held, free
    await vi.advanceTimersByTimeAsync(LOCK_POLL_MS);
    expect(fn).toHaveBeenCalledTimes(1);           // free, free
  });

  it('cancel stops the watch', async () => {
    vi.useFakeTimers();
    lockState(() => false);
    const fn = vi.fn();
    const cancel = whenBackupLockFree(fn);
    await vi.advanceTimersByTimeAsync(LOCK_POLL_MS);
    cancel();
    await vi.advanceTimersByTimeAsync(LOCK_POLL_MS * 4);
    expect(fn).not.toHaveBeenCalled();
  });
});
