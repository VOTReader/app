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
   written as an option line, which is how any real use would be written; it
   would not catch the flag being set through a computed key or a spread of a
   variable. That is a deliberate trade — the same shape as
   tools/bundle-membership.test.js — because the failure it guards is someone
   copying the option in, not someone hiding it.

   The third test is the non-vacuity proof, and it does NOT share its evidence
   with the first two: it feeds the matcher prose, not a file. That matters
   because the earlier unanchored matcher made this gate green on a tree where
   the real option line had been deleted — the doc comment alone satisfied it.
   A non-vacuity check that reuses the loose matcher it is meant to hold to
   account proves nothing. */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const STORES_DIR = dirname(fileURLToPath(import.meta.url));

/** The one matcher both directions of this gate use. Anchored to the start of
 *  a line and \t/space-only leading whitespace, because the option is written
 *  as an option line and nothing else is. The unanchored form this replaced
 *  used \s*, which crosses newlines, so state-store.js's own doc comment
 *  satisfied it -- see the third test. */
const SETS_FLAG = /^[ \t]*discardQueueOnRebase[ \t]*:[ \t]*true\b/m;

/** Every store source in this directory, excluding tests and bundle entries. */
function storeSources() {
  return readdirSync(STORES_DIR)
    .filter((f) => f.endsWith('.js') && !f.includes('.test.') && !f.startsWith('_entry'))
    .map((f) => ({ file: f, text: readFileSync(resolve(STORES_DIR, f), 'utf8') }));
}

describe('discardQueueOnRebase is pinned to StateStore (storage-backup-3)', () => {
  it('no store but state-store.js turns the flag on', () => {
    const setters = storeSources()
      .filter(({ text }) => SETS_FLAG.test(text))
      .map(({ file }) => file);
    expect(setters).toEqual(['state-store.js']);
  });

  it('state-store.js really does set it, so the pin is not vacuous', () => {
    const state = storeSources().find((s) => s.file === 'state-store.js');
    expect(state).toBeTruthy();
    expect(SETS_FLAG.test(state.text)).toBe(true);
  });

  it('the matcher reads option lines, not prose that names the option', () => {
    // state-store.js's own doc comment, verbatim (lines 60-61). An unanchored
    // matcher whose \s* crosses newlines is satisfied by THIS, which means the
    // gate above reports green on a tree where the real option line has been
    // deleted -- and a comment in any other store mentioning the flag fails the
    // first test. Both directions come from the same hole.
    const prose = [
      "   (CachedStore's pending/degraded contract), but `discardQueueOnRebase:",
      '   true` below tells _rebaseAndPromote to DROP the queue instead of',
    ].join('\n');
    expect(SETS_FLAG.test(prose)).toBe(false);

    // ...and it still reads the real thing, so this is not a matcher that
    // rejects everything.
    expect(SETS_FLAG.test('    discardQueueOnRebase: true,')).toBe(true);
  });
});
