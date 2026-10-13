/* backup-lock — W7 (sweep 2026-10-13): the boot hooks ask it whether another tab restores. */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { BACKUP_LOCK, backupLockBusy, canQueryBackupLock } from './backup-lock.js';

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
