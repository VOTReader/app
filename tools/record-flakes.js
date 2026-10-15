/**
 * record-flakes.js - test:hook's flake log (nw9b, network 2026-10-13; idea from readalong 03:5x).
 *
 * tools/test-hook.sh re-runs a failed fast (vmThreads) run whole in the default pool. Green there used to pass the push
 * with only a console note, so a flaky test was retried, never fixed (readalong's W4 startMs 41001 vs 41000 at 03:42).
 * Now each test the fast run had red is appended to D:/Swarm/flakes.jsonl (one JSON line: at, lane, sha, branch, file,
 * test) and the pushing lane (SWARM_LANE: every VOTReader commit carries Corbin's identity, so the session that pushes
 * is the author) gets ONE inbox line per test it has never been paged for. The Console's inbox bridge delivers it.
 *
 *   node tools/record-flakes.js <vitest json report>      (test-hook.sh calls it; exit 0 always: it never blocks a push)
 *
 * No D:/Swarm (CI, another machine): it prints the tests and records nothing. VOT_SWARM_DIR overrides the folder.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const slash = (p) => String(p || '').replace(/\\/g, '/');

const firstLine = (s) => (String(s || '').split('\n').find((l) => l.trim()) || '').trim();

/** The red tests in a vitest JSON report: [{file (repo-relative), test (full name), error (the first line of the first
 *  failure message, so the next flake hunt can tell a timeout from a wrong value; nw27)}]; a file that failed to load
 *  is one entry. */
export function failedTests(report, root) {
  const base = slash(root || process.cwd()).replace(/\/$/, '') + '/';   // no resolve(): CI on Linux reads Windows paths too
  const rel = (f) => { const s = slash(f); return s.toLowerCase().startsWith(base.toLowerCase()) ? s.slice(base.length) : s; };
  const out = [];
  for (const file of report?.testResults || []) {
    const red = (file.assertionResults || []).filter((a) => a.status === 'failed');
    for (const a of red) {
      out.push({ file: rel(file.name), test: a.fullName || a.title || '(unnamed test)', error: firstLine((a.failureMessages || [])[0]).slice(0, 200) });
    }
    if (!red.length && file.status === 'failed') {
      const why = firstLine(file.message) || 'no message';
      out.push({ file: rel(file.name), test: `(file failed: ${why.slice(0, 160)})`, error: why.slice(0, 200) });
    }
  }
  return out;
}

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const key = (t) => `${t.file} > ${t.test}`;

/** Append the tests to <swarmDir>/flakes.jsonl and page <swarmDir>/lanes/<lane>/inbox.md once per never-paged test. */
export function recordFlakes({ tests, lane, sha, branch, swarmDir, now = new Date() }) {
  if (!tests.length || !swarmDir || !existsSync(swarmDir)) return { recorded: 0, paged: 0 };
  const log = join(swarmDir, 'flakes.jsonl');
  const seen = new Set();
  if (existsSync(log)) {
    for (const line of readFileSync(log, 'utf8').split('\n')) {
      try { const r = JSON.parse(line); if (r.paged) seen.add(key(r)); } catch { /* a torn line is skipped */ }
    }
  }
  const laneDir = lane ? join(swarmDir, 'lanes', lane) : '';
  const canPage = Boolean(laneDir && existsSync(laneDir));
  const fresh = canPage ? [...new Map(tests.filter((t) => !seen.has(key(t))).map((t) => [key(t), t])).values()] : [];
  const pagedKeys = new Set(fresh.map(key));
  appendFileSync(log, tests.map((t) => JSON.stringify({
    at: stamp(now), lane: lane || null, sha, branch, file: t.file, test: t.test, error: t.error || '', paged: pagedKeys.has(key(t)),
  }) + '\n').join(''));
  if (fresh.length) {
    const named = fresh.slice(0, 3).map(key).join('; ') + (fresh.length > 3 ? `; +${fresh.length - 3} more` : '');
    appendFileSync(join(laneDir, 'inbox.md'), `${pad(now.getHours())}:${pad(now.getMinutes())} test-hook: FLAKE `
      + `(red in the fast run, green in the default-pool re-run, so the push went through): ${named}. Make it `
      + `deterministic, or list the file in vitest.isolated.txt if it only fails in a VM context. `
      + `Record: ${slash(log)} (this test pages once).\n`);
  }
  return { recorded: tests.length, paged: fresh.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const tests = failedTests(JSON.parse(readFileSync(process.argv[2], 'utf8')), process.cwd());
    for (const t of tests) console.log(`[test:hook] FLAKE: ${key(t)}`);
    const git = (args) => { try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); } catch { return ''; } };
    const r = recordFlakes({ tests, lane: process.env.SWARM_LANE || '', sha: git(['rev-parse', 'HEAD']),
      branch: git(['rev-parse', '--abbrev-ref', 'HEAD']), swarmDir: process.env.VOT_SWARM_DIR || 'D:/Swarm' });
    if (r.recorded) console.log(`[test:hook] recorded ${r.recorded} in flakes.jsonl; paged ${r.paged} new to ${process.env.SWARM_LANE || 'nobody (no SWARM_LANE)'}`);
  } catch (e) {
    console.log(`[test:hook] flake record skipped: ${e.message}`);
  }
}
