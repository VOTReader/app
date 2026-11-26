/* test-spawn — spawnSync / execFileSync for tests, with the child's stdio in files instead of pipes.
 *
 * Why: in the pre-commit hook's fast run (VOT_VITEST_FAST=1, vitest.config.js) every vmThreads worker is a thread of
 * ONE Windows process, and libuv spawns with CreateProcess(bInheritHandles=TRUE). A child that another worker (or
 * vitest, starting a forks worker) creates while this spawn's stdout pipe exists inherits the pipe's write end, and
 * spawnSync waits for EOF on that pipe: for the unrelated child to exit. Beside search-bench/make-targets that was
 * 45-85 s a case, past the 20 s timeout (check-css-tokens and check-type-scale 11-26, git-env 10-14). Nothing waits
 * on a file, so a test that imports these instead of node:child_process's cannot be held.
 *
 * Same call shape and result as node's, for what the tests use: cwd, env, encoding, input, timeout, windowsHide, ...
 * A call that sets its own `stdio` goes straight to node's (the caller chose). One difference: execFileSync's
 * stderr comes back on the result/error instead of being echoed to the parent's stderr.
 */
import * as cp from 'node:child_process';
import { openSync, closeSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { threadId } from 'node:worker_threads';

/** A unique temp path per call (pid, worker thread and a random tag: vmThreads loads this module once per test file
 *  in one process). Each call deletes its own files once read, so nothing needs a dir or an exit hook. */
let seq = 0;
const TAG = Math.random().toString(36).slice(2, 8);
const scratch = () => join(tmpdir(), `vot-spawn-${process.pid}-${threadId}-${TAG}-${++seq}`);

/** @param {string} cmd @param {readonly string[] | object} [args] @param {object} [opts] */
export function spawnSync(cmd, args, opts) {
  if (!Array.isArray(args)) { opts = /** @type {object} */ (args); args = []; }
  const o = /** @type {any} */ ({ ...(opts || {}) });
  if (o.stdio !== undefined) return cp.spawnSync(cmd, /** @type {string[]} */ (args), o);
  const base = scratch();
  /** @type {number[]} */ const fds = [];
  /** @type {string[]} */ const made = [];
  /** @param {string} ext @param {string} mode */
  const open = (ext, mode) => { made.push(base + ext); const fd = openSync(base + ext, mode); fds.push(fd); return fd; };
  try {
    let stdin = /** @type {'ignore' | number} */ ('ignore');
    if (o.input != null) { writeFileSync(base + '.in', o.input); stdin = open('.in', 'r'); }
    const out = open('.out', 'w');
    const err = open('.err', 'w');
    const { input, encoding, maxBuffer, ...rest } = o;
    const r = cp.spawnSync(cmd, /** @type {string[]} */ (args), { ...rest, stdio: [stdin, out, err] });
    for (const fd of fds.splice(0)) closeSync(fd);
    /** @param {string} name */
    const read = (name) => {
      const b = readFileSync(base + name);
      return encoding && encoding !== 'buffer' ? b.toString(encoding) : b;
    };
    const stdout = read('.out');
    const stderr = read('.err');
    return { ...r, stdout, stderr, output: [null, stdout, stderr] };
  } finally {
    for (const fd of fds) closeSync(fd);
    for (const f of made) { try { unlinkSync(f); } catch { /* already gone */ } }
  }
}

/** Like node's: returns stdout, throws on a spawn error or a non-zero exit (err.status / .stdout / .stderr set). */
export function execFileSync(cmd, args, opts) {
  if (!Array.isArray(args)) { opts = args; args = []; }
  if (opts && /** @type {any} */ (opts).stdio !== undefined) return cp.execFileSync(cmd, args, opts);
  const r = /** @type {any} */ (spawnSync(cmd, args, opts));
  if (r.error) throw r.error;
  if (r.status !== 0) {
    const e = /** @type {any} */ (new Error(`Command failed: ${[cmd, ...args].join(' ')}\n${r.stderr}`));
    Object.assign(e, { status: r.status, signal: r.signal, pid: r.pid, stdout: r.stdout, stderr: r.stderr, output: r.output });
    throw e;
  }
  return r.stdout;
}
