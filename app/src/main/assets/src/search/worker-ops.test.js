/* The search worker's side (sr9 refuter r1, 2026-10-14): while the meaning model loads, the worker tells the
   page it is alive every few seconds, so the page waits out a slow download and gives up only a silent worker. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleWorkerMessage } from './worker-ops.js';
import { configureSemantic, resetSemantic } from './semantic.js';

afterEach(() => {
  resetSemantic();
  vi.useRealTimers();
});

describe('meaning-start', () => {
  it('says it is alive every 5 s while the model loads, and stops once it answers', async () => {
    vi.useFakeTimers();
    // a download that takes 12 s and then drops
    configureSemantic({ load: () => new Promise((_r, reject) => setTimeout(() => reject(new Error('dropped')), 12000)) });
    const posts = /** @type {any[]} */ ([]);
    const done = handleWorkerMessage({ id: 7, op: 'meaning-start', base: 'http://localhost/' }, (m) => posts.push(m));
    await vi.advanceTimersByTimeAsync(12500);
    await done;
    expect(posts.filter((m) => m.alive)).toEqual([{ id: 7, alive: true }, { id: 7, alive: true }]);
    const last = posts[posts.length - 1];
    expect(last).toMatchObject({ id: 7, done: true, ok: false });
    await vi.advanceTimersByTimeAsync(20000);
    expect(posts[posts.length - 1]).toBe(last); // nothing after the answer
  });
});
