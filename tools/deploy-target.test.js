/* ci10: the deploy publishes the newest commit on main whose CI is green.
   ci9 published only a commit that was still main's tip when its own CI finished, so a busy
   main starved the site: nothing went live for over an hour on 2026-09-25. */
import { describe, it, expect } from 'vitest';
import { pickTarget, dispatchTarget, findTarget } from './deploy-target.mjs';

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
function fakeApi({ history, ciGreen, dispatches = [], failCompare = [] }) {
  const tip = history[history.length - 1];
  return async (path) => {
    if (path.endsWith('/git/ref/heads/main')) return { object: { sha: tip } };
    if (path.includes('/workflows/ci.yml/runs')) {
      return { workflow_runs: ciGreen.map((sha) => ({ head_sha: sha, head_repository: { full_name: 'o/r' } })) };
    }
    if (path.includes('/workflows/deploy-web.yml/runs')) {
      return { workflow_runs: dispatches.map((d, i) => ({ id: i + 1, head_sha: d.sha })) };
    }
    const jobs = /\/runs\/(\d+)\/jobs$/.exec(path);
    if (jobs) return { jobs: [{ name: 'deploy', conclusion: dispatches[Number(jobs[1]) - 1].deployed ? 'success' : 'skipped' }] };
    const cmp = /\/compare\/([^.]+)\.\.\.([^?]+)/.exec(path);
    if (cmp) {
      if (failCompare.includes(cmp[1])) throw new Error('GET compare: 500 diff taking too long');
      const i = history.indexOf(cmp[1]);
      if (i < 0) return { status: 'diverged', ahead_by: 1 };
      const behind = history.length - 1 - i;
      return { status: behind === 0 ? 'identical' : 'ahead', ahead_by: behind };
    }
    throw new Error(`unexpected ${path}`);
  };
}

describe('findTarget - the gate end to end, on a fake API', () => {
  const quiet = () => {};

  it('skipped manual dispatches do not push a real override out of view (the ci10 refutation)', async () => {
    // T2 was a red tip published by hand; five later dispatches off the tip skipped.
    const api = fakeApi({
      history: ['T1', 'T2', 'T3'],
      ciGreen: ['T1'],
      dispatches: [
        ...Array.from({ length: 5 }, () => ({ sha: 'elsewhere', deployed: false })),
        { sha: 'T2', deployed: true },
      ],
    });
    expect(await findTarget({ repo: 'o/r', api, log: quiet })).toBe('T2');
  });

  it('a compare that fails drops that candidate, not the gate', async () => {
    const api = fakeApi({ history: ['A', 'B', 'C'], ciGreen: ['B', 'A'], failCompare: ['B'] });
    expect(await findTarget({ repo: 'o/r', api, log: quiet })).toBe('A');
  });

  it('a tag named main (not in main\'s history) never publishes', async () => {
    const api = fakeApi({ history: ['A', 'B'], ciGreen: ['tag-commit'] });
    expect(await findTarget({ repo: 'o/r', api, log: quiet })).toBeNull();
  });

  it('the manual path publishes its commit only when it is the tip', async () => {
    const api = fakeApi({ history: ['A', 'B'], ciGreen: [] });
    expect(await findTarget({ repo: 'o/r', api, dispatchSha: 'B', log: quiet })).toBe('B');
    expect(await findTarget({ repo: 'o/r', api, dispatchSha: 'A', log: quiet })).toBeNull();
  });
});

describe('dispatchTarget - the manual override', () => {
  it('publishes the dispatched commit only when it is main\'s tip', () => {
    expect(dispatchTarget('abc', 'abc')).toBe('abc');
    expect(dispatchTarget('branch-head', 'abc')).toBeNull();
    expect(dispatchTarget('abc', '')).toBeNull();
  });
});
