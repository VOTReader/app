/* The deploy waits for green CI, and the job holding the Pages token runs no repository code.
   ─────────────────────────────────────────────────────────────────────────────────────────────
   Improvement sweep 2026-09-22, REPORT #9 (v12-01, v10-01). deploy-web.yml used to fire on the
   push beside CI and re-run a SUBSET of its gates, so CI-red commits went live (1b23d1e0,
   a5b66a31, b3113383, 60e84ce3); and its single job ran `npm ci`, lint, typecheck, vitest and the
   build - every devDependency's code - while holding pages: write and id-token: write.

   A workflow file has no runtime to test, so this reads its TEXT, the way the gates it guards
   are read. Line-level, not a YAML parse: the repo carries no direct YAML dependency, and the
   properties pinned here are all visible at a fixed indentation. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WF = readFileSync(join(ROOT, '.github/workflows/deploy-web.yml'), 'utf8').replace(/\r\n/g, '\n');
const code = (text) => text.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

/** The top-level block that starts with `name:` (e.g. 'on', 'permissions', 'jobs'). */
function topBlock(name) {
  const lines = WF.split('\n');
  const i = lines.findIndex((l) => l.startsWith(name + ':'));
  if (i < 0) return '';
  const out = [lines[i]];
  for (let j = i + 1; j < lines.length; j++) {
    if (/^\S/.test(lines[j]) && !lines[j].startsWith('#')) break;
    out.push(lines[j]);
  }
  return code(out.join('\n'));
}

/** Each job under `jobs:`, by id, as its own text. */
function jobs() {
  const block = topBlock('jobs').split('\n').slice(1);
  /** @type {Record<string, string>} */
  const byId = {};
  let id = null;
  for (const l of block) {
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(l);
    if (m) { id = m[1]; byId[id] = ''; continue; }
    if (id) byId[id] += l + '\n';
  }
  return byId;
}

/** The keys of a job's own `permissions:` map ('' when it has none). */
function permissionsOf(jobText) {
  const lines = jobText.split('\n');
  const i = lines.findIndex((l) => /^ {4}permissions:/.test(l));
  if (i < 0) return null;
  const inline = /permissions:\s*(\{.*\})\s*$/.exec(lines[i]);
  if (inline) return inline[1];
  const keys = [];
  for (let j = i + 1; j < lines.length && /^ {6}\S/.test(lines[j]); j++) keys.push(lines[j].trim());
  return keys.join(', ');
}

describe('deploy-web.yml - the deploy waits for green CI (v12-01)', () => {
  it('starts on a completed CI run on main, not on the push', () => {
    const on = topBlock('on');
    expect(on).toMatch(/\n {2}workflow_run:\n {4}workflows: \[CI\]\n {4}types: \[completed\]\n {4}branches: \[main\]/);
    expect(on, 'a push trigger would publish beside CI again, before it is green').not.toMatch(/\n {2}push:/);
    expect(on, 'the manual override stays').toMatch(/\n {2}workflow_dispatch:/);
  });

  it('publishes the newest green commit on main, picked by tools/deploy-target.mjs (ci10)', () => {
    // ci9 published only the triggering commit, and only while it was main's tip; a busy main
    // starved the site for over an hour on 2026-09-25. The ci9 refutation's cases (an old CI
    // re-run publishing over a newer build; a tag named main) are pinned in deploy-target.test.js.
    const all = jobs();
    const gate = code(all.gate || '');
    expect(gate).toContain('run: node tools/deploy-target.mjs');
    expect(gate, 'the picker comes from main, never from the run that woke the deploy').toMatch(/ref: main\n/);
    expect(gate).toMatch(/outputs:\n\s+publish: \$\{\{ steps\.target\.outputs\.publish \}\}\n\s+sha: \$\{\{ steps\.target\.outputs\.sha \}\}/);
    expect(gate, 'the gate no longer filters on the waking run: any CI completion on main re-picks').not.toMatch(/\n {4}if:/);
    const build = code(all.build || '');
    expect(build).toMatch(/needs: gate/);
    expect(build).toContain("if: needs.gate.outputs.publish == 'true' && github.run_attempt == 1");
    expect(code(all.deploy || '')).toMatch(/needs: build/);
  });

  it('the live site carries the commit it was built from, and the gate reads it as the floor', () => {
    // 06:50Z 2026-09-25 (run 36104660970): a stale run listing picked a commit 53 behind the tip and
    // published it over a newer build. The floor refuses anything not strictly newer than live.
    const all = jobs();
    expect(code(all.build || '')).toContain('git rev-parse HEAD > _site/build-sha.txt');
    expect(code(all.gate || '')).toMatch(/LIVE_SHA_URL: https:\/\/votreader\.github\.io\/app\/build-sha\.txt/);
  });

  it('a re-run never publishes: "Re-run failed jobs" keeps the gate\'s old pick (the ci10 refutation)', () => {
    // An older run whose build or deploy failed, re-run after a newer deploy, would publish its
    // older commit over the newer one. Both jobs that can lead to a publish run on attempt 1 only.
    const all = jobs();
    expect(code(all.build || '')).toMatch(/\n {4}if: [^\n]*github\.run_attempt == 1/);
    expect(code(all.deploy || '')).toMatch(/\n {4}if: github\.run_attempt == 1\n/);
  });

  it('runs one deploy at a time, gate to publish, so a later pick never lands before an earlier one', () => {
    // A job-level group (ci9) serialized only the publish step: two gates could pick in one order
    // and publish in the other. At the workflow level a newer waiting run replaces an older
    // waiting one, which is harmless now that every run re-picks the newest green commit.
    expect(topBlock('concurrency')).toMatch(/^concurrency:\n {2}group: pages\n {2}cancel-in-progress: false/);
    expect(code(jobs().deploy || ''), 'no second, job-level group').not.toMatch(/concurrency:/);
  });

  it('checks out exactly the SHA the gate picked, without leaving a token in .git', () => {
    const build = code(jobs().build || '');
    expect(build).toMatch(/ref: \$\{\{ needs\.gate\.outputs\.sha \}\}/);
    expect(build).toContain('persist-credentials: false');
    expect(code(jobs().gate || '')).toContain('persist-credentials: false');
  });
});

describe('deploy-web.yml - no repository code runs beside the Pages token (v10-01)', () => {
  it('grants nothing at the workflow level', () => {
    expect(topBlock('permissions').trim()).toBe('permissions: {}');
  });

  it('every job that runs a command or checks out the repo holds read-only permissions and nothing that publishes', () => {
    const all = jobs();
    const runners = Object.entries(all).filter(([, t]) => /\n\s+run:|actions\/checkout@/.test(code(t)));
    expect(runners.length, 'the build job was not found - this measured nothing').toBeGreaterThan(0);
    for (const [id, t] of runners) {
      // The gate also lists CI runs (actions: read, ci10); the build needs only the code.
      expect(permissionsOf(t), `${id} permissions`).toBe(id === 'gate' ? 'contents: read, actions: read' : 'contents: read');
    }
  });

  it('the job holding pages / id-token runs only the Pages actions, on the artifact the build uploaded', () => {
    const all = jobs();
    const publishers = Object.entries(all).filter(([, t]) => /pages: write|id-token: write/.test(permissionsOf(t) || ''));
    expect(publishers.map(([id]) => id)).toEqual(['deploy']);
    const deploy = code(all.deploy);
    expect(deploy).toMatch(/needs: build/);
    expect(deploy, 'no command runs here').not.toMatch(/\n\s+run:/);
    expect(deploy, 'no checkout: nothing from the repository executes').not.toContain('actions/checkout@');
    const uses = [...deploy.matchAll(/uses: ([^@\s]+)@([0-9a-f]{40}) /g)].map((m) => m[1]);
    expect(uses).toEqual(['actions/configure-pages', 'actions/deploy-pages']);
    expect(code(all.build)).toMatch(/uses: actions\/upload-pages-artifact@[0-9a-f]{40} /);
  });
});
