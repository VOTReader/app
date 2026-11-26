import { describe, it, expect } from 'vitest';
import { cleanVotesMap, mergeVotesMaps, readBackupMeta, applyBackupMeta } from './song-votes-backup.js';

describe('song-votes-backup (data-rest-n1)', () => {
  it('keeps only well-formed votes', () => {
    expect(cleanVotesMap({ a: { v: 1, at: 3 }, b: { v: 0, at: 1 }, c: null, d: { v: -1 } })).toEqual({ a: { v: 1, at: 3 }, d: { v: -1, at: 0 } });
    expect(cleanVotesMap([1])).toEqual({});
    expect(cleanVotesMap(null)).toEqual({});
  });

  it('merge: newest at wins, a tie keeps the live vote, nothing is taken away', () => {
    const { merged, changed } = mergeVotesMaps({ a: { v: 1, at: 5 }, b: { v: -1, at: 5 } }, { a: { v: -1, at: 5 }, b: { v: 1, at: 6 }, c: { v: 1, at: 1 } });
    expect(merged).toEqual({ a: { v: 1, at: 5 }, b: { v: 1, at: 6 }, c: { v: 1, at: 1 } });
    expect(changed).toBe(true);
    expect(mergeVotesMaps({ a: { v: 1, at: 5 } }, { a: { v: 1, at: 2 } }).changed).toBe(false);
  });

  it('read and apply through an adapter; a read that throws throws', async () => {
    const db = new Map();
    const idb = { get: async (_s, k) => db.get(k), put: async (_s, k, v) => { db.set(k, v); } };
    expect(await readBackupMeta(idb)).toBe(null);
    expect(await applyBackupMeta(idb, { 'song-votes': { a: { v: 1, at: 2 } } })).toBe(true);
    expect(await applyBackupMeta(idb, { 'song-votes': { a: { v: 1, at: 2 } } })).toBe(false);
    expect(await applyBackupMeta(idb, null)).toBe(false);
    expect(await readBackupMeta(idb)).toEqual({ 'song-votes': { a: { v: 1, at: 2 } } });
    await expect(readBackupMeta({ get: async () => { throw new Error('x'); } })).rejects.toThrow('x');
  });
});
