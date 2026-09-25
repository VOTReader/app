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
 * commits behind the tip.
 *
 * And never backwards, by a floor rather than by trusting the run listing:
 * every build publishes build-sha.txt (the commit it built), and the gate
 * publishes its pick only when the pick is strictly newer than the live
 * build-sha.txt. On 2026-09-25 06:50Z GitHub's `status=success` run listing
 * answered with a stale set and the picker chose 982461f6, 53 commits behind
 * the tip, over a newer live build (run 36104660970); the floor makes that a
 * skip whatever the listing says. It also covers a manual override: a red tip
 * published by hand is the floor until a newer commit goes green. The same
 * pick as the live one is a skip too (nothing to publish).
 * * Usage (the deploy's gate job; GH_TOKEN needs actions: read + contents: read):
 *   REPO=owner/name GH_TOKEN=... LIVE_SHA_URL=https://.../build-sha.txt node tools/deploy-target.mjs
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
export async function findTarget({ repo, api, dispatchSha = '', liveSha = '', log = console.log }) {
  const tip = (await api(`repos/${repo}/git/ref/heads/main`)).object.sha;
  log(`main is at ${tip}`);

  if (dispatchSha) {
    const sha = dispatchTarget(dispatchSha, tip);
    log(`manual deploy of ${dispatchSha}: ${sha ? 'it is the tip' : 'not the tip, skipped'}`);
    return sha;
  }

  const shas = new Set();
  // Green CI runs of pushes to main in this repository. The listing is read
  // unfiltered and the conclusion checked here: the API's status=success filter
  // once returned a stale set (see the header). The branch filter also matches a
  // tag or a fork branch named main; the compare below drops anything not on main.
  const ci = await api(`repos/${repo}/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=30`);
  for (const r of ci.workflow_runs) {
    if (r.conclusion === 'success' && r.head_repository?.full_name === repo) shas.add(r.head_sha);
  }

  const compare = async (base, head) => {
    const cmp = await api(`repos/${repo}/compare/${base}...${head}?per_page=1`);
    return { status: cmp.status, behind: cmp.ahead_by };
  };
  const candidates = [];
  for (const s of shas) {
    // One failed compare (GitHub gives up on a huge diff) drops that candidate,
    // never the whole gate: a thrown gate would stop every deploy.
    try {
      candidates.push({ sha: s, ...(await compare(s, tip)) });
    } catch (e) {
      log(`::warning::compare ${s}...${tip} failed, candidate skipped: ${String(e.message).slice(0, 200)}`);
    }
  }
  const sha = pickTarget(candidates);
  if (!sha) {
    log('no green commit on main among the recent CI runs');
    return null;
  }
  log(`newest green commit on main: ${sha} (${candidates.find((c) => c.sha === sha).behind} behind the tip)`);

  // The floor: only strictly newer than what is live.
  if (!liveSha) {
    log('live build-sha.txt unknown (first deploy under ci10): publishing');
    return sha;
  }
  let rel;
  try {
    rel = await compare(liveSha, sha);
  } catch (e) {
    log(`::warning::compare live ${liveSha}...${sha} failed: not publishing (${String(e.message).slice(0, 200)})`);
    return null;
  }
  const decision = floorDecision(rel.status);
  log(`live is ${liveSha}: ${decision === 'publish' ? `publishing, ${rel.behind} newer` : decision}`);
  return decision === 'publish' ? sha : null;
}

/** compare(live...pick).status -> what to do. Only a strictly newer pick publishes. */
export function floorDecision(status) {
  if (status === 'ahead') return 'publish';
  if (status === 'identical') return 'already live, nothing to publish';
  if (status === 'behind') return '::warning::the pick is OLDER than the live build, not publishing';
  return `::warning::the pick and the live build have diverged (${status}), not publishing; a manual dispatch overrides`;
}

/**
 * The commit the live site was built from; '' when the site has none yet (404:
 * the first deploy under ci10). Any other failure throws, and the gate then
 * publishes nothing: without the floor it cannot prove the pick is newer.
 */
async function liveBuildSha() {
  const url = process.env.LIVE_SHA_URL;
  if (!url) throw new Error('LIVE_SHA_URL is required');
  const res = await fetch(`${url}?t=${Date.now()}`); // a fresh CDN key, past Pages' max-age=600
  if (res.status === 404) return '';
  if (!res.ok) throw new Error(`live build-sha.txt: HTTP ${res.status}`);
  const text = (await res.text()).trim();
  if (!/^[0-9a-f]{40}$/.test(text)) throw new Error(`live build-sha.txt is not a commit: ${text.slice(0, 60)}`);
  return text;
}

async function main() {
  const repo = process.env.REPO;
  if (!repo || !process.env.GH_TOKEN) throw new Error('REPO and GH_TOKEN are required');
  const sha = await findTarget({ repo, api: gh, dispatchSha: process.env.DISPATCH_SHA || '', liveSha: process.env.DISPATCH_SHA ? '' : await liveBuildSha() });
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
