/* ci10: the deploy publishes the newest commit on main whose CI is green.
   ci9 published only a commit that was still main's tip when its own CI finished, so a busy
   main starved the site: nothing went live for over an hour on 2026-09-25. */
import { describe, it, expect } from 'vitest';
import { pickTarget, dispatchTarget, findTarget, floorDecision } from './deploy-target.mjs';

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

/** A fake GitHub API: history is main's commits oldest-first; compare derives from it. */
function fakeApi({ history, ciGreen = [], ciRed = [], failCompare = [] }) {
  const tip = history[history.length - 1];
  const runs = [
    ...ciGreen.map((sha) => ({ head_sha: sha, conclusion: 'success' })),
    ...ciRed.map((sha) => ({ head_sha: sha, conclusion: 'failure' })),
  ].map((r) => ({ ...r, head_repository: { full_name: 'o/r' } }));
  return async (path) => {
    if (path.endsWith('/git/ref/heads/main')) return { object: { sha: tip } };
    if (path.includes('/workflows/ci.yml/runs')) return { workflow_runs: runs };
    const cmp = /\/compare\/([^.]+)\.\.\.([^?]+)/.exec(path);
    if (cmp) {
      if (failCompare.includes(cmp[1])) throw new Error('GET compare: 500 diff taking too long');
      const b = history.indexOf(cmp[1]);
      const h = history.indexOf(cmp[2]);
      if (b < 0 || h < 0) return { status: 'diverged', ahead_by: 1 };
      if (h === b) return { status: 'identical', ahead_by: 0 };
      return h > b ? { status: 'ahead', ahead_by: h - b } : { status: 'behind', ahead_by: 0 };
    }
    throw new Error(`unexpected ${path}`);
  };
}

describe('findTarget - the gate end to end, on a fake API', () => {
  const quiet = () => {};
  const repo = 'o/r';

  it('publishes the newest green commit when it is newer than the live build', async () => {
    const api = fakeApi({ history: ['A', 'B', 'C', 'D'], ciGreen: ['C', 'A'], ciRed: ['D'] });
    expect(await findTarget({ repo, api, liveSha: 'B', log: quiet })).toBe('C');
  });

  it('never publishes behind the live build, whatever the run listing says (06:50Z, run 36104660970)', async () => {
    // A stale listing that holds only an old green commit: the live floor refuses it.
    const api = fakeApi({ history: ['old', 'B', 'C', 'D'], ciGreen: ['old'] });
    expect(await findTarget({ repo, api, liveSha: 'C', log: quiet })).toBeNull();
  });

  it('a manual override on a red tip is the floor until something newer goes green', async () => {
    const api = fakeApi({ history: ['T1', 'T2', 'T3'], ciGreen: ['T1'], ciRed: ['T2'] });
    expect(await findTarget({ repo, api, liveSha: 'T2', log: quiet })).toBeNull();
  });

  it('the pick that is already live publishes nothing', async () => {
    const api = fakeApi({ history: ['A', 'B'], ciGreen: ['B'] });
    expect(await findTarget({ repo, api, liveSha: 'B', log: quiet })).toBeNull();
  });

  it('no live build-sha.txt yet (the first deploy under ci10) publishes the pick', async () => {
    const api = fakeApi({ history: ['A', 'B'], ciGreen: ['B'] });
    expect(await findTarget({ repo, api, liveSha: '', log: quiet })).toBe('B');
  });

  it('a live build off main (history rewritten) publishes nothing; a dispatch overrides', async () => {
    const api = fakeApi({ history: ['A', 'B'], ciGreen: ['B'] });
    expect(await findTarget({ repo, api, liveSha: 'rewritten', log: quiet })).toBeNull();
  });

  it('red and cancelled runs are not candidates (the conclusion is checked, not the listing filter)', async () => {
    const api = fakeApi({ history: ['A', 'B'], ciGreen: ['A'], ciRed: ['B'] });
    expect(await findTarget({ repo, api, liveSha: '', log: quiet })).toBe('A');
  });

  it('a compare that fails drops that candidate, not the gate', async () => {
    const api = fakeApi({ history: ['A', 'B', 'C'], ciGreen: ['B', 'A'], failCompare: ['B'] });
    expect(await findTarget({ repo, api, log: quiet })).toBe('A');
  });

  it('a tag named main (not in main\'s history) never publishes', async () => {
    const api = fakeApi({ history: ['A', 'B'], ciGreen: ['tag-commit'] });
    expect(await findTarget({ repo, api, log: quiet })).toBeNull();
  });

  it('the manual path publishes its commit only when it is the tip', async () => {
    const api = fakeApi({ history: ['A', 'B'] });
    expect(await findTarget({ repo, api, dispatchSha: 'B', log: quiet })).toBe('B');
    expect(await findTarget({ repo, api, dispatchSha: 'A', log: quiet })).toBeNull();
  });
});

describe('floorDecision - only strictly newer than live publishes', () => {
  it('maps the compare of live...pick', () => {
    expect(floorDecision('ahead')).toBe('publish');
    for (const s of ['identical', 'behind', 'diverged', undefined]) expect(floorDecision(s)).not.toBe('publish');
  });
});
describe('dispatchTarget - the manual override', () => {
  it('publishes the dispatched commit only when it is main\'s tip', () => {
    expect(dispatchTarget('abc', 'abc')).toBe('abc');
    expect(dispatchTarget('branch-head', 'abc')).toBeNull();
    expect(dispatchTarget('abc', '')).toBeNull();
  });
});
