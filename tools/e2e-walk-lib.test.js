/* e2e-walk-lib — the two readings the update-reload walk got wrong once each (2026-09-11).
   ─────────────────────────────────────────────────────────────────────────────
   1. update-walk-follow-sample-1: the walk classified the post-restore position from ONE
      sample and read 887 against 900 while the read-along follow was still scrolling
      toward 698 — "moved for no reason this walk can name". A position is a reading only
      once the scroller has been still.
   2. kill-cadence-armd-sibling-1: after the kill + relaunch on a PERSISTENT profile Chrome
      restores the previous session's app tab, so a second document of the origin boots the
      player beside the measured page. The walk must count and close what it did not open.
   Pure helpers, fake clock; the walk itself imports them. */

import { describe, it, expect } from 'vitest';
import { settleRead, classifyRestoredPages, settleLine } from './e2e-walk-lib.mjs';

/** A fake clock: `sleep` advances it; `now` reads it. */
function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}
/** read() hands out the series in order and repeats its last value forever. */
function series(values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe('settleRead — a position is a reading only once the scroller is still', () => {
  it('waits out a mid-scroll read and returns the settled position, not the first sample', async () => {
    const c = clock();
    const read = series([900, 887, 850, 780, 720, 698, 698, 698, 698, 698, 698, 698, 698, 698, 698, 698, 698, 698, 698, 698, 698, 698]);
    const r = await settleRead(read, { stillMs: 250, maxMs: 4000, everyMs: 16, now: c.now, sleep: c.sleep });
    expect(r.settled).toBe(true);
    expect(r.y).toBe(698);                 // sample 1 alone would have said 887
    expect(r.waitedMs).toBeGreaterThan(250);
    expect(r.stillMs).toBeGreaterThanOrEqual(250);
    // The moves are on the record, so a report can say what happened before it settled.
    expect(r.samples.map((s) => s.y)).toEqual([900, 887, 850, 780, 720, 698]);
  });

  it('a scroller still moving past the first still window is read only when it stops (the window resets on every change)', async () => {
    const c = clock();
    const moving = Array.from({ length: 30 }, (_, i) => 900 - i * 7);   // 30 moves over 464 ms of fake clock, then still at 697
    const r = await settleRead(series(moving), { stillMs: 250, maxMs: 4000, everyMs: 16, now: c.now, sleep: c.sleep });
    expect(r.settled).toBe(true);
    expect(r.y).toBe(697);                 // a window measured from the FIRST read would have returned 788 at +256 ms
    expect(r.samples).toHaveLength(30);
    expect(r.waitedMs).toBe(16 * 29 + 256);
  });

  it('an already-still scroller settles after exactly the still window', async () => {
    const c = clock();
    const r = await settleRead(series([698]), { stillMs: 250, maxMs: 4000, everyMs: 16, now: c.now, sleep: c.sleep });
    expect(r.settled).toBe(true);
    expect(r.y).toBe(698);
    expect(r.waitedMs).toBe(256);          // 16 × 16 ms polls: the first tick past 250
    expect(r.samples).toHaveLength(1);
  });

  it('a scroller that never settles is reported as NOT settled at the deadline, with its last position', async () => {
    const c = clock();
    let y = 0;
    const r = await settleRead(() => (y += 1), { stillMs: 250, maxMs: 1000, everyMs: 16, now: c.now, sleep: c.sleep });
    expect(r.settled).toBe(false);
    expect(r.waitedMs).toBeGreaterThanOrEqual(1000);
    expect(r.y).toBe(y);                   // the last read, never an earlier one
    expect(r.stillMs).toBeLessThan(250);
  });

  it('a null reading (no scroller yet) counts as a value, so a scroller appearing late is a change', async () => {
    const c = clock();
    const r = await settleRead(series([null, null, 900, 900, 900, 900, 900, 900, 900, 900, 900, 900, 900, 900, 900, 900, 900, 900, 900]), { stillMs: 250, maxMs: 4000, everyMs: 16, now: c.now, sleep: c.sleep });
    expect(r.settled).toBe(true);
    expect(r.y).toBe(900);
    expect(r.samples.map((s) => s.y)).toEqual([null, 900]);
  });
});

describe('classifyRestoredPages — what a persistent profile brought back at relaunch', () => {
  const BASE = 'http://127.0.0.1:4321/index.html';

  it('counts the restored APP tab on a persistent profile (the second document the walk never opened)', () => {
    const r = classifyRestoredPages(['about:blank', 'http://127.0.0.1:4321/index.html'], BASE);
    expect(r.total).toBe(2);
    expect(r.appTabs).toBe(1);
    expect(r.appUrls).toEqual(['http://127.0.0.1:4321/index.html']);
    expect(r.others).toEqual(['about:blank']);
  });

  it('a fresh launch (one blank page) has no app tab', () => {
    const r = classifyRestoredPages(['about:blank'], BASE);
    expect(r).toEqual({ total: 1, appTabs: 0, appUrls: [], others: ['about:blank'] });
  });

  it('another origin on the same host/port shape is not the app; a malformed url is tolerated', () => {
    const r = classifyRestoredPages(['http://127.0.0.1:9999/index.html', 'not a url', 'http://127.0.0.1:4321/?tab=2'], BASE);
    expect(r.appTabs).toBe(1);
    expect(r.appUrls).toEqual(['http://127.0.0.1:4321/?tab=2']);
    expect(r.others).toEqual(['http://127.0.0.1:9999/index.html', 'not a url']);
  });
});

describe('settleLine — the report sentence carries the moves, not only the verdict', () => {
  it('names the settled position, the still window and every move', () => {
    const line = settleLine({ y: 698, settled: true, waitedMs: 336, stillMs: 256, samples: [{ t: 0, y: 900 }, { t: 16, y: 887 }, { t: 80, y: 698 }] });
    expect(line).toBe('still at 698 for 256 ms, read at +336 ms after moving 2x (900 -> 887 -> 698)');
  });
  it('says NOT still when the deadline won', () => {
    const line = settleLine({ y: 41, settled: false, waitedMs: 1008, stillMs: 0, samples: [{ t: 0, y: 1 }, { t: 16, y: 2 }] });
    expect(line.startsWith('NOT still: 41 at +1008 ms')).toBe(true);
  });
});

/* Hub 11-20 (Corbin: "make the gate failures name the fix"): a failing walk prints where it stopped and one line
   holding the fix token, which the gate's summary, CI and a local run all show. The shapes every walk shares. */
import { FIX_TOKEN, fixLine, walkSite, noControl, waitTimedOut, stopUnreached, describeError, failureReport } from './e2e-walk-lib.mjs';

const fixesIn = (text) => text.split('\n').filter((l) => l.includes(FIX_TOKEN));
const STACK = [
  'TimeoutError: Navigation timeout of 30000 ms exceeded',
  '    at new Deferred (file:///D:/w/node_modules/puppeteer-core/lib/puppeteer/util/Deferred.js:57:34)',
  '    at CdpPage.goto (file:///D:/w/node_modules/puppeteer-core/lib/puppeteer/api/Page.js:582:43)',
  '    at fail (file:///D:/w/tools/e2e-walk-lib.mjs:10:5)',
  '    at open (file:///D:/w/tools/e2e-tabs-true.mjs:181:16)',
  '    at async main (file:///D:/w/tools/e2e-tabs-true.mjs:514:5)',
].join('\n');

describe('fix lines: one line, the token once, under 300 characters', () => {
  it('fixLine folds whitespace and caps the length', () => {
    const l = fixLine('change   the\nwording ' + 'x'.repeat(400));
    expect(l.startsWith(FIX_TOKEN)).toBe(true);
    expect(l).not.toContain('\n');
    expect(l.length).toBeLessThanOrEqual(300);
    expect(FIX_TOKEN).toBe('FIX' + ': ');
  });
  it('walkSite names the walk\'s own frame, not puppeteer\'s or the lib\'s', () => {
    expect(walkSite(STACK)).toBe('tools/e2e-tabs-true.mjs:181');
    expect(walkSite('Error: x\n    at node:internal/foo:1:1')).toBe(null);
  });
});

describe('the shapes every walk shares', () => {
  it('no control: the wording, the step, what was on screen, and both cases in the fix', () => {
    const e = noControl({ wording: '/^Continue$/', step: 'onboarding', seen: ['Skip', 'Next'], at: 'tools/e2e-tabs-true.mjs:516' });
    const r = failureReport(e, 'e2e-tabs');
    expect(r).toMatch(/^\[e2e-tabs\] FAILED at tools\/e2e-tabs-true\.mjs:516 \(step "onboarding"\): no control matching \/\^Continue\$\//);
    expect(r).toContain('on screen: "Skip", "Next"');
    const f = fixesIn(r);
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('renamed');
    expect(f[0]).toContain('step before');
  });
  it('a wait that timed out names what it waited for and how long', () => {
    const r = failureReport(waitTimedOut({ what: 'the Tabs screen', ms: 30000, step: 'open tabs', at: 'tools/x.mjs:9' }), 'x');
    expect(r).toContain('waited 30000 ms for the Tabs screen');
    expect(fixesIn(r)[0]).toContain('passes alone');
  });
  it('a stop not reached names the stop', () => {
    const r = failureReport(stopUnreached({ stop: 'web-focus', how: 'no button "Focus"', at: 'tools/e2e-contrast.mjs:300' }), 'e2e-contrast');
    expect(r).toContain('stop "web-focus" not reached: no button "Focus"');
    expect(fixesIn(r)[0]).toContain('web-focus');
  });
});

describe('puppeteer errors a walk did not catch get a step and a fix', () => {
  it('navigation timeout', () => {
    const e = Object.assign(new Error('Navigation timeout of 30000 ms exceeded'), { name: 'TimeoutError', stack: STACK });
    const r = failureReport(e, 'e2e-tabs');
    expect(r.split('\n')[0]).toBe('[e2e-tabs] FAILED at tools/e2e-tabs-true.mjs:181: TimeoutError: Navigation timeout of 30000 ms exceeded');
    expect(fixesIn(r)[0]).toMatch(/did not load in 30000 ms/);
  });
  it('waiting for a selector', () => {
    const e = Object.assign(new Error('Waiting for selector `.ans-row` failed: Waiting failed: 30000ms exceeded'), { name: 'TimeoutError', stack: STACK });
    expect(fixesIn(failureReport(e, 'w'))[0]).toContain('`.ans-row` never appeared');
  });
  it('waitForFunction', () => {
    const e = Object.assign(new Error('Waiting failed: 15000ms exceeded'), { name: 'TimeoutError', stack: STACK });
    expect(fixesIn(failureReport(e, 'w'))[0]).toContain('did not hold within 15000 ms');
  });
  it('an older walk\'s own no-control message', () => {
    expect(describeError(new Error('no control "/^1The Creation/"; visible: ["a"]')).fix).toContain('renamed');
  });
  it('an error of no known shape gets a place and no invented fix', () => {
    const r = failureReport(Object.assign(new Error('boom'), { stack: 'Error: boom\n    at main (file:///D:/w/tools/e2e-dock-geometry.mjs:40:3)' }), 'e2e-dock');
    expect(r).toBe('[e2e-dock] FAILED at tools/e2e-dock-geometry.mjs:40: Error: boom');
  });
});

/* Hub 11-20 (CI 44681552243, web-focus @0.49): the contrast stop pauses animations to read, so a fade still running
   was frozen half way and read as a contrast failure. A stop waits until no finite fade is running, capped. */
import { isFadeBlocking, waitForFades } from './e2e-walk-lib.mjs';

describe('isFadeBlocking: what a reading must wait for', () => {
  const a = (o) => ({ playState: 'running', iterations: 1, props: ['opacity'], ...o });
  it('a running finite fade of opacity, colour, background or filter blocks', () => {
    for (const p of ['opacity', 'color', 'background-color', 'fill', 'stroke', 'filter', 'visibility']) expect(isFadeBlocking(a({ props: [p] })), p).toBe(true);
  });
  it('an infinite one (a spinner, a pulse) never blocks, or the stop would never read', () => {
    expect(isFadeBlocking(a({ iterations: Infinity }))).toBe(false);
  });
  it('a finished, paused or idle one does not block; nor a move that changes no colour', () => {
    for (const s of ['finished', 'paused', 'idle']) expect(isFadeBlocking(a({ playState: s }))).toBe(false);
    expect(isFadeBlocking(a({ props: ['transform', 'width'] }))).toBe(false);
  });
});

describe('waitForFades: wait for the fades, cap the wait, name what still moved', () => {
  const fake = (seq) => { let i = 0; return { evaluate: async () => seq[Math.min(i++, seq.length - 1)] }; };
  const c = () => { let t = 0; return { now: () => t, sleep: async (ms) => { t += ms; } }; };
  it('returns once nothing blocks', async () => {
    const k = c();
    const r = await waitForFades(fake([['button.sw-btn opacity'], ['button.sw-btn opacity'], []]), { ...k, everyMs: 50 });
    expect(r).toEqual({ settled: true, waitedMs: 100, still: [] });
  });
  it('gives up at the cap and says which element was still moving', async () => {
    const k = c();
    const r = await waitForFades(fake([['div.toast opacity']]), { ...k, everyMs: 50, maxMs: 3000 });
    expect(r.settled).toBe(false);
    expect(r.waitedMs).toBe(3000);
    expect(r.still).toEqual(['div.toast opacity']);
  });
});

import { fixFor } from './e2e-walk-lib.mjs';

describe('fixFor: a walk\'s own table of finding -> fix', () => {
  const T = [[/covers the control/, (m) => `move the card off ${m[0]}`], [/ring/, 'wrap the ring']];
  it('the first row that matches; a function row sees the match', () => {
    expect(fixFor('settings: the card covers the control', T)).toBe('move the card off covers the control');
    expect(fixFor('x: the ring does not wrap', T)).toBe('wrap the ring');
  });
  it('null when no row matches: the walk does not invent a fix', () => {
    expect(fixFor('something new', T)).toBe(null);
  });
});

describe('the site of a shape built inside a walk\'s helper is the step that called it', () => {
  it('walkSite(stack, 1) skips the helper frame; first-run.mjs is never the site', () => {
    expect(walkSite(STACK, 1)).toBe('tools/e2e-tabs-true.mjs:514');
    const fr = 'Error: x\n    at domPress (file:///D:/w/tools/first-run.mjs:30:9)\n    at main (file:///D:/w/tools/e2e-tour.mjs:77:3)';
    expect(walkSite(fr)).toBe('tools/e2e-tour.mjs:77');
  });
  it('a real nested call: noControl in clickText names clickText\'s caller, and the fix names the same line', () => {
    const clickText = () => noControl({ wording: '/^Go$/', seen: [] });
    const step = () => clickText();   // this line is the site
    const e = step();
    const line = new Error().stack.split('\n')[1];   // a line of this test file, to read its name
    const file = /tools[\\/][^:()]+\.test\.js/.exec(line)[0].replace(/\\/g, '/');
    const here = Number(/:(\d+):\d+\)?$/.exec(line)[1]);
    expect(e.at).toBe(file + ':' + (here - 2));   // the `step` line that called clickText, not clickText's (here - 3)
    expect(e.fix).toContain(e.at);
  });
});
