/* ci10: the deploy publishes the newest commit on main whose CI is green.
   ci9 published only a commit that was still main's tip when its own CI finished, so a busy
   main starved the site: nothing went live for over an hour on 2026-09-25. */
import { describe, it, expect } from 'vitest';
import { pickTarget, dispatchTarget } from './deploy-target.mjs';

describe('pickTarget - the newest green commit on main', () => {
  it('publishes the tip when the tip is green', () => {
    expect(pickTarget([
      { sha: 'old', status: 'ahead', behind: 3 },
      { sha: 'tip', status: 'identical', behind: 0 },
    ])).toBe('tip');
  });

  it('publishes the newest green commit while the tip is still in CI (the starvation case)', () => {
    // 2026-09-25: b1f8d91a went green one commit behind 8e4d2277; ci9 skipped it.
    expect(pickTarget([
      { sha: '92f0b90a-parent', status: 'ahead', behind: 4 },
      { sha: 'b1f8d91a', status: 'ahead', behind: 1 },
      { sha: '598e749d', status: 'ahead', behind: 5 },
    ])).toBe('b1f8d91a');
  });

  it('an old commit re-run green later still loses to a newer green commit (never backwards)', () => {
    // Order is the API's (newest run first): the re-run of 'old' is listed first.
    expect(pickTarget([
      { sha: 'old', status: 'ahead', behind: 9 },
      { sha: 'newer', status: 'ahead', behind: 2 },
    ])).toBe('newer');
  });

  it('never publishes a commit that is not on main (a tag or fork branch named main)', () => {
    expect(pickTarget([
      { sha: 'tag-only', status: 'diverged', behind: 0 },
      { sha: 'future', status: 'behind', behind: 0 },
    ])).toBeNull();
    expect(pickTarget([
      { sha: 'tag-only', status: 'diverged', behind: 0 },
      { sha: 'onmain', status: 'ahead', behind: 7 },
    ])).toBe('onmain');
  });

  it('publishes nothing when no recent CI run is green', () => {
    expect(pickTarget([])).toBeNull();
  });

  it('ignores a malformed compare', () => {
    expect(pickTarget([{ sha: 'x', status: 'ahead', behind: undefined }])).toBeNull();
    expect(pickTarget([{ sha: 'x', status: 'ahead', behind: -1 }])).toBeNull();
  });
});

describe('dispatchTarget - the manual override', () => {
  it('publishes the dispatched commit only when it is main\'s tip', () => {
    expect(dispatchTarget('abc', 'abc')).toBe('abc');
    expect(dispatchTarget('branch-head', 'abc')).toBeNull();
    expect(dispatchTarget('abc', '')).toBeNull();
  });
});
