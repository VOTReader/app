// @ts-nocheck
/* storage-backup-3 containment gate.
   ─────────────────────────────────────────────────────────────────────────
   `discardQueueOnRebase` tells CachedStore to THROW AWAY the queued ops on a
   rebase instead of replaying them. That is correct for a store whose writes
   are full replacements — StateStore's `set()` replaces the whole record, so
   a queue built from synthetic pending/degraded defaults would stomp the
   just-recovered real data if it replayed.

   On an INCREMENTAL store the same flag is silent data loss: every queued
   add/update/delete made while the store was pending would be discarded on
   recovery, with no error, no banner, and nothing in the diff to notice. The
   store would simply come back missing this session's writes.

   Nothing structural prevents that today — it is an ordinary option any
   store could pass. So this is the guard: the flag is pinned to exactly one
   store by name, and adding it anywhere else fails here. The Verifier asked
   what stops it reaching an incremental store; before this test the honest
   answer was "nobody would", which is not an answer.

   LIMIT, stated so nobody trusts this further than it goes: this reads the
   store sources as TEXT. It catches the literal `discardQueueOnRebase: true`
   that any real use would be written as; it would not catch the flag being
   set through a computed key or a spread of a variable. That is a deliberate
   trade — the same shape as tools/bundle-membership.test.js — because the
   failure it guards is someone copying the option in, not someone hiding it. */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const STORES_DIR = dirname(fileURLToPath(import.meta.url));

/** Every store source in this directory, excluding tests and bundle entries. */
function storeSources() {
  return readdirSync(STORES_DIR)
    .filter((f) => f.endsWith('.js') && !f.includes('.test.') && !f.startsWith('_entry'))
    .map((f) => ({ file: f, text: readFileSync(resolve(STORES_DIR, f), 'utf8') }));
}

describe('discardQueueOnRebase is pinned to StateStore (storage-backup-3)', () => {
  it('no store but state-store.js turns the flag on', () => {
    const setters = storeSources()
      .filter(({ text }) => /discardQueueOnRebase\s*:\s*true/.test(text))
      .map(({ file }) => file);
    expect(setters).toEqual(['state-store.js']);
  });

  it('state-store.js really does set it, so the pin is not vacuous', () => {
    const state = storeSources().find((s) => s.file === 'state-store.js');
    expect(state).toBeTruthy();
    expect(/discardQueueOnRebase\s*:\s*true/.test(state.text)).toBe(true);
  });
});
