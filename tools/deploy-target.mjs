/**
 * Which commit should the Pages deploy publish right now? (ci10)
 *
 * WHY THIS EXISTS
 * ci9 made each deploy publish only the commit whose CI run triggered it, and
 * only if that commit was still main's tip. On a busy main (a push every few
 * minutes, CI about 12) that is never true: every green run found a newer tip
 * and skipped, and nothing went live for over an hour on 2026-09-25 (runs
 * 36100134740, 36100861220, 36102158492) while main moved five commits on.
 *
 * The rule now: publish the NEWEST commit on main whose CI is green, whatever
 * run woke the deploy. "On main" means an ancestor of (or equal to) main's tip,
 * which keeps out a tag or a fork branch named main. "Newest" means fewest
 * commits behind the tip. The workflow runs one deploy at a time, and the
 * newest green commit only ever moves forward, so a deploy never goes backwards
 * - the ci9 refutation's case (an old CI re-run publishing over a newer build)
 * picks the newer commit instead. A manual override deploy (workflow_dispatch
 * on a red tip) counts as published-green too, so the next automatic run does
 * not step back behind it.
 *
 * Usage (the deploy's gate job; GH_TOKEN needs actions: read + contents: read):
 *   REPO=owner/name GH_TOKEN=... node tools/deploy-target.mjs
 *   REPO=... GH_TOKEN=... DISPATCH_SHA=<sha> node tools/deploy-target.mjs   # manual path
 * Writes publish=true|false and sha=<commit> to $GITHUB_OUTPUT (or stdout).
 */

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * candidates: [{ sha, status, behind }] where status/behind come from GitHub's
 * compare of candidate...tip ('identical' | 'ahead' mean the candidate is on
 * main; behind = how many commits the tip has that the candidate lacks).
 * Returns the sha of the newest on-main candidate, or null.
 */
export function pickTarget(candidates) {
  let best = null;
  for (const c of candidates) {
    if (c.status !== 'identical' && c.status !== 'ahead') continue;
    if (!Number.isInteger(c.behind) || c.behind < 0) continue;
    if (!best || c.behind < best.behind) best = c;
  }
  return best ? best.sha : null;
}

/**
 * The manual path: a dispatch publishes its own commit, and only when that
 * commit is main's tip (a dispatch of another branch must not reach the site).
 */
export function dispatchTarget(sha, tip) {
  return sha && tip && sha === tip ? sha : null;
}

async function gh(path) {
  const res = await fetch(`https://api.github.com/${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * The whole decision, with the GitHub API passed in (so tests can fake it).
 * Returns the sha to publish, or null.
 */
export async function findTarget({ repo, api, dispatchSha = '', log = console.log }) {
  const tip = (await api(`repos/${repo}/git/ref/heads/main`)).object.sha;
  log(`main is at ${tip}`);

  if (dispatchSha) {
    const sha = dispatchTarget(dispatchSha, tip);
    log(`manual deploy of ${dispatchSha}: ${sha ? 'it is the tip' : 'not the tip, skipped'}`);
    return sha;
  }

  const shas = new Set();
  // Green CI runs of pushes to main in this repository (the API's branch filter
  // also matches a tag or a fork branch named main; the compare below drops
  // anything not on main). 15 runs cover hours of a busy main and keep a gate
  // near 20 API calls.
  const ci = await api(`repos/${repo}/actions/workflows/ci.yml/runs?branch=main&event=push&status=success&per_page=15`);
  for (const r of ci.workflow_runs) if (r.head_repository?.full_name === repo) shas.add(r.head_sha);
  // The newest manual override that actually published (its deploy job succeeded;
  // a dispatch that skipped also ends 'success'). Overrides publish only the tip of
  // their moment, so the newest one is the only one that can outrank green CI; a
  // run of skipped dispatches must not push it out of view (the ci10 refutation).
  const manual = await api(`repos/${repo}/actions/workflows/deploy-web.yml/runs?event=workflow_dispatch&status=success&per_page=30`);
  for (const r of manual.workflow_runs) {
    const jobs = await api(`repos/${repo}/actions/runs/${r.id}/jobs`);
    if (jobs.jobs.some((j) => j.name === 'deploy' && j.conclusion === 'success')) { shas.add(r.head_sha); break; }
  }

  const candidates = [];
  for (const s of shas) {
    // One failed compare (GitHub gives up on a huge diff) drops that candidate,
    // never the whole gate: a thrown gate would stop every deploy.
    try {
      const cmp = await api(`repos/${repo}/compare/${s}...${tip}?per_page=1`);
      candidates.push({ sha: s, status: cmp.status, behind: cmp.ahead_by });
    } catch (e) {
      log(`::warning::compare ${s}...${tip} failed, candidate skipped: ${String(e.message).slice(0, 200)}`);
    }
  }
  const sha = pickTarget(candidates);
  const pick = candidates.find((c) => c.sha === sha);
  log(sha
    ? `newest green commit on main: ${sha} (${pick.behind} behind the tip)`
    : 'no green commit on main among the recent CI runs');
  return sha;
}

async function main() {
  const repo = process.env.REPO;
  if (!repo || !process.env.GH_TOKEN) throw new Error('REPO and GH_TOKEN are required');
  const sha = await findTarget({ repo, api: gh, dispatchSha: process.env.DISPATCH_SHA || '' });
  const out = `publish=${sha ? 'true' : 'false'}\nsha=${sha || ''}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, out);
  else process.stdout.write(out);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`deploy-target: ${e.message}`);
    process.exit(1);
  });
}
