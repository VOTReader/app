/**
 * tools/plan-states.test.js — tests for tools/plan-states.mjs.
 *
 * planStates(now) and STATES are exported, and the CLI is behind a
 * main-module guard, so the module imports cleanly into vitest. The states
 * are built with the app's own plan engine, catalog and builder, and
 * characterized here through the engine's own runStatus. The date is fixed
 * (2026-11-19, local noon) so every dated expectation is stable wherever
 * the test runs.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { planStates, STATES } from './plan-states.mjs';
import { runStatus } from '../app/src/main/assets/src/data/plan-engine.js';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SCRIPT = resolve(HERE, 'plan-states.mjs');

// Local noon: todayKey and the engine both read local dates.
const NOW = new Date('2026-11-19T12:00:00');

function runCli(args = []) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: ROOT });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

describe('STATES', () => {
  it('names the nine states in order', () => {
    expect(STATES).toEqual(['ontrack', 'donetoday', 'missed1', 'missed3', 'paused', 'notstarted', 'finished', 'stopped', 'custom']);
  });
});

describe('planStates', () => {
  it('returns every state plus credited, each with its own id', async () => {
    const all = await planStates(NOW);
    expect(Object.keys(all).sort()).toEqual([...STATES, 'credited'].sort());
    for (const [name, run] of Object.entries(all)) expect(run.id).toBe('st-' + name);
  });

  it('ontrack: five days read, today not read yet', async () => {
    const { ontrack } = await planStates(NOW);
    expect(ontrack.plan).toBe('bible-year');
    expect(ontrack.status).toBe('running');
    expect(ontrack.start).toBe('2026-11-14');
    expect(Object.keys(ontrack.ticks)).toHaveLength(16);
    const st = runStatus(ontrack, NOW);
    expect(st.doneToday).toBe(false);
    expect(st.behind).toBe(0);
  });

  it('donetoday: today read too', async () => {
    const { donetoday } = await planStates(NOW);
    expect(Object.keys(donetoday.ticks)).toHaveLength(20);
    const st = runStatus(donetoday, NOW);
    expect(st.doneToday).toBe(true);
    expect(st.behind).toBe(0);
  });

  it('missed1 and missed3: behind by exactly that many days', async () => {
    const { missed1, missed3 } = await planStates(NOW);
    expect(runStatus(missed1, NOW).behind).toBe(1);
    expect(runStatus(missed1, NOW).doneToday).toBe(false);
    expect(runStatus(missed3, NOW).behind).toBe(3);
  });

  it('paused: paused three days ago', async () => {
    const { paused } = await planStates(NOW);
    expect(paused.status).toBe('paused');
    expect(paused.paused).toBe('2026-11-16');
  });

  it('notstarted: nothing read, starts in four days', async () => {
    const { notstarted } = await planStates(NOW);
    expect(Object.keys(notstarted.ticks)).toHaveLength(0);
    expect(notstarted.start).toBe('2026-11-23');
  });

  it('finished: Ruth read through, finished today, not yet seen', async () => {
    const { finished } = await planStates(NOW);
    expect(finished.status).toBe('finished');
    expect(finished.plan).toBe('custom');
    expect(finished.name).toBe('Ruth in four days');
    expect(finished.finished).toBe('2026-11-19');
    expect(finished.seen).toBe(false);
    expect(Object.keys(finished.ticks)).toHaveLength(4);
    expect(runStatus(finished, NOW).doneToday).toBe(true);
  });

  it('stopped: stopped six days ago on day 10', async () => {
    const { stopped } = await planStates(NOW);
    expect(stopped.status).toBe('stopped');
    expect(stopped.stopped).toBe('2026-11-13');
  });

  it('custom: the built plan, three short books, day 5, on track', async () => {
    const { custom } = await planStates(NOW);
    expect(custom.plan).toBe('custom');
    expect(custom.name).toBe('Three short books');
    expect(Object.keys(custom.ticks)).toHaveLength(8);
    expect(runStatus(custom, NOW).behind).toBe(0);
  });

  it('credited: Genesis 1-30 counted from before it began', async () => {
    const { credited } = await planStates(NOW);
    expect(credited.credited).toBe(30);
    expect(Object.keys(credited.ticks)).toHaveLength(62);
    expect(runStatus(credited, NOW).behind).toBe(0);
  });
});

describe('CLI', () => {
  it('--list prints the nine states', () => {
    const r = runCli(['--list']);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(STATES.join('\n'));
  });

  it('--json prints the asked states as JSON', () => {
    const r = runCli(['--json', 'ontrack,finished', '--date', '2026-11-19']);
    expect(r.status).toBe(0);
    const runs = JSON.parse(r.stdout);
    expect(runs).toHaveLength(2);
    expect(runs[0].id).toBe('st-ontrack');
    expect(runs[1].id).toBe('st-finished');
  });

  it('an unknown state exits 2 and says so', () => {
    const r = runCli(['--json', 'nope', '--date', '2026-11-19']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('unknown state: nope');
  });
});
