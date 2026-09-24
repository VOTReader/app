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

  it('goes on only for a SUCCESSFUL CI run of a PUSH to main in THIS repository (a fork PR from a branch named main must not reach the token)', () => {
    const gate = code(jobs().gate || '');
    expect(gate).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(gate).toContain("github.event.workflow_run.event == 'push'");
    expect(gate).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(gate).toContain('github.event.workflow_run.head_repository.full_name == github.repository');
  });

  it('publishes only a commit that is still main\'s tip (an older green run must never replace a newer deploy)', () => {
    // The ci9 refutation's MED finding (lanes/docs/out/ci9-refute.md): re-running an old
    // commit's CI, or a dispatch while an older CI ran, published it over the newer one.
    // The same check stops a TAG named main (CI runs on tags, and reports the tag as the branch).
    const all = jobs();
    const gate = code(all.gate || '');
    expect(gate).toMatch(/git ls-remote [^\n]*refs\/heads\/main/);
    expect(gate).toMatch(/publish=true/);
    expect(gate).toMatch(/outputs:\n\s+publish: \$\{\{ steps\.tip\.outputs\.publish \}\}/);
    const build = code(all.build || '');
    expect(build).toMatch(/needs: gate/);
    expect(build).toContain("if: needs.gate.outputs.publish == 'true'");
    expect(code(all.deploy || '')).toMatch(/needs: build/);
  });

  it('the pages concurrency group sits on the deploy job, so a skipped run cannot cancel a waiting deploy', () => {
    // The refutation's LOW: at the workflow level every CI completion - red, cancelled, a fork PR -
    // queued a run that then skipped, and a newer queued run replaces a waiting one.
    expect(topBlock('concurrency'), 'no workflow-level concurrency').toBe('');
    expect(code(jobs().deploy || '')).toMatch(/concurrency:\n\s+group: pages\n\s+cancel-in-progress: false/);
  });

  it('checks out exactly the SHA CI proved, without leaving a token in .git', () => {
    const build = code(jobs().build || '');
    expect(build).toMatch(/ref: \$\{\{ github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/);
    expect(build).toContain('persist-credentials: false');
  });
});

describe('deploy-web.yml - no repository code runs beside the Pages token (v10-01)', () => {
  it('grants nothing at the workflow level', () => {
    expect(topBlock('permissions').trim()).toBe('permissions: {}');
  });

  it('every job that runs a command or checks out the repo holds contents: read and nothing that publishes', () => {
    const all = jobs();
    const runners = Object.entries(all).filter(([, t]) => /\n\s+run:|actions\/checkout@/.test(code(t)));
    expect(runners.length, 'the build job was not found - this measured nothing').toBeGreaterThan(0);
    for (const [id, t] of runners) {
      expect(permissionsOf(t), `${id} permissions`).toBe('contents: read');
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
