/* e2e-plans: reading plans at a glance, in a real Chrome at phone width (task 2235, 2026-11-16).
   Seeds every plan state (tools/plan-states.mjs, dated around today) into the app's own ReadingPlanStore, then:
   H  Home's up-next card: its height and each plan row's, per state (Corbin 11-10: the plan card must not take over
      Home; 2235: no taller than at dc31d3e27). --home-only measures just this, so the same walk runs on an older tree.
   L  the Plans list: each row leads with its status, a plan that is behind has Catch up, Past plans holds the
      finished and the stopped plan.
   C  Catch up from the list opens the plan page on the Catch up sheet with its three ways forward.
   M  Manage plan (the bar's Manage): Pause, Start over, Stop; Stop is one tap and the toast's Undo puts it back.
   S  a new plan starts at zero (0245, Corbin 11-17): a reader with Genesis 1-50 read starts Bible in a Year; the preview has
      no Already read row, the run holds no tick, Home's card says Day 1 with Genesis 1-3, and a read of Genesis 1 ticks it today.
   Run: node tools/e2e-plans.mjs [--home-only] [--shots DIR] [--json FILE]   (after npm run build; ~40 s)
   Exit 1 on a finding (except --home-only, which only measures). */
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { serveOwnTree } from './e2e-read-serve.mjs';
import { planStates } from './plan-states.mjs';

const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const HOME_ONLY = argv.includes('--home-only');
const SHOTS = opt('--shots') ? resolve(opt('--shots')) : null;
const JSON_OUT = opt('--json') ? resolve(opt('--json')) : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const W = 412, H = 915;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const need = (ok, msg) => { if (!ok) fails.push(msg); };
const out = { home: {}, list: null, catchUp: null, manage: null, start: null };

const { server, url } = await serveOwnTree();
const profile = join(tmpdir(), 'vot-plans-' + process.pid);
rmSync(profile, { recursive: true, force: true });
const browser = await puppeteer.launch({ headless: true, userDataDir: profile, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
const STATES = await planStates(new Date());
let page;
try {
  page = (await browser.pages())[0] || await browser.newPage();
  page.setDefaultTimeout(30000);
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const boot = async () => {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const r = document.getElementById('root'); return !!r && r.children.length > 0 && typeof window.ReadingPlanStore === 'object'; });
    await page.waitForFunction(() => window.ReadingPlanStore.getState() === 'loaded');
    // a fresh profile opens on the welcome pages: Continue, Begin Reading (it opens a letter), then Home
    for (let i = 0; i < 20 && !(await page.evaluate(() => !!document.querySelector('.home-root'))); i++) {
      await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^(Continue|Begin Reading|Home$)/.test((x.getAttribute("aria-label") || x.textContent).trim())); if (b) b.click(); });
      await sleep(400);
    }
  };
  /** The runs of `names` as the only plans on the phone, then a fresh boot. */
  const seed = async (names) => {
    console.error('[plans] seed', names.join(','));
    await page.evaluate(async (runs) => { window.ReadingPlanStore.replaceAll(runs); await window.ReadingPlanStore.whenSaved(); }, names.map((n) => STATES[n]));
    console.error('[plans] saved');
    await boot();
    await page.waitForFunction(() => !!document.querySelector('.home-root'));
    await sleep(700);
  };
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); };
  const clickText = async (re, sel = 'button, [role="button"], a') => {
    for (let i = 0; i < 40; i++) {
      const ok = await page.evaluate((src, s) => {
        const rx = new RegExp(src);
        const el = [...document.querySelectorAll(s)].find((b) => b.getClientRects().length > 0 && (rx.test((b.getAttribute('aria-label') || '').trim()) || rx.test((b.textContent || '').trim())));
        if (!el) return false;
        el.click(); return true;
      }, re.source, sel);
      if (ok) { await sleep(500); return; }
      await sleep(250);
    }
    throw new Error(`walk: no control matching ${re}`);
  };

  console.error('[plans] boot'); await boot(); console.error('[plans] booted');
  // H: Home's card, one seeding per case
  const homeCases = { ontrack: ['ontrack'], behind: ['missed3'], donetoday: ['donetoday'], notstarted: ['notstarted'], paused: ['paused'],
    two: ['ontrack', 'missed3'], ontrackPaused: ['ontrack', 'paused'] };
  for (const [name, states] of Object.entries(homeCases)) {
    await seed(states);
    out.home[name] = await page.evaluate(() => {
      const card = document.querySelector('.upnext');
      const rows = card ? [...card.querySelectorAll('[data-plan]')] : [];
      return {
        card: card ? Math.round(card.getBoundingClientRect().height) : 0,
        rows: rows.map((r) => Math.round(r.getBoundingClientRect().height)),
        eyebrows: rows.map((r) => (r.querySelector('.upnext-eyebrow') || r).textContent.trim()),
        // 0130: the eyebrow row's width, the status's own width and Manage's (px): Manage sits beside the status when they fit
        widths: rows.map((r) => { const h = r.querySelector('.upnext-head'); if (!h) return null; const w = (el) => { if (!el) return 0; const g = document.createRange(); g.selectNodeContents(el); return Math.round(g.getBoundingClientRect().width); };
          const cs = getComputedStyle(h); return { row: Math.round(h.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)), gap: parseFloat(cs.columnGap) || 0, status: w(h.firstElementChild), manage: w(h.querySelector('.upnext-manage')) }; }),
      };
    });
    await shot('home-' + name);
  }
  if (!HOME_ONLY) {
    const h = out.home;
    need(h.behind.card === h.ontrack.card, `H behind: Home's card ${h.behind.card}px vs on track ${h.ontrack.card}px`);
    need(h.donetoday.card <= h.ontrack.card, `H done today: Home's card ${h.donetoday.card}px > on track ${h.ontrack.card}px`);
    need(/^On track · Day /.test(h.ontrack.eyebrows[0] || ''), `H on track eyebrow: ${h.ontrack.eyebrows[0]}`);
    need(/^3 days behind · finishes /.test(h.behind.eyebrows[0] || ''), `H behind eyebrow: ${h.behind.eyebrows[0]}`);
    need(h.paused.rows.length === 1 && /Paused/.test(h.paused.eyebrows[0]) && h.paused.rows[0] < h.ontrack.rows[0], `H paused line: ${JSON.stringify(h.paused)}`);

    // L: the list with every state
    await seed(['ontrack', 'donetoday', 'missed1', 'missed3', 'paused', 'notstarted', 'custom', 'finished', 'stopped']);
    await page.evaluate(() => window.ReadingPlanStore.put({ ...window.ReadingPlanStore.get('st-finished'), seen: true }));
    await clickText(/^Library$/, '.tabbar-tab, button');
    await clickText(/^Reading plans/);
    await page.waitForSelector('.plan-run-row');
    out.list = await page.evaluate(() => ({
      rows: [...document.querySelectorAll('.plan-run-row')].map((b) => b.getAttribute('aria-label')),
      catchUp: [...document.querySelectorAll('.plan-catchup-btn')].map((b) => b.getAttribute('aria-label')),
      past: [...document.querySelectorAll('[aria-label="Past plans"] .root-row-sub')].map((s) => s.textContent),
    }));
    await shot('list');
    const leads = out.list.rows.map((r) => r.replace(/^[^:]+: /, '').split(' · ')[0]);
    need(JSON.stringify(leads) === JSON.stringify(['On track', 'Done today', '1 day behind', '3 days behind', 'Paused', leads[5], 'On track']) && /^Not started$/.test(leads[5]),
      `L leads: ${JSON.stringify(leads)}`);
    need(out.list.catchUp.length === 2, `L Catch up buttons: ${JSON.stringify(out.list.catchUp)}`);
    need(out.list.past.length === 2 && out.list.past.some((s) => /^Stopped /.test(s)), `L Past plans: ${JSON.stringify(out.list.past)}`);

    // C: Catch up from the list
    await page.evaluate(() => [...document.querySelectorAll('.plan-catchup-btn')][1].click());
    await page.waitForSelector('#plan-adjust');
    out.catchUp = await page.evaluate(() => ({
      title: document.querySelector('#plan-adjust .plan-sheet-title').textContent,
      sub: document.querySelector('#plan-adjust .plan-sheet-sub').textContent,
      choices: [...document.querySelectorAll('#plan-adjust .root-row-title')].map((t) => t.textContent),
      page: document.querySelector('.plan-status') && document.querySelector('.plan-status').textContent,
    }));
    await shot('catchup');
    need(out.catchUp.title === 'Catch up' && out.catchUp.sub === out.catchUp.page, `C sheet: ${JSON.stringify(out.catchUp)}`);
    need(JSON.stringify(out.catchUp.choices) === JSON.stringify(['Read two days today', 'Keep my daily amount', 'Finish on time']), `C choices: ${JSON.stringify(out.catchUp.choices)}`);
    await page.keyboard.press('Escape');
    await sleep(500);

    // M: Manage plan, Stop with Undo
    await shot('plan-page');
    await clickText(/^Manage plan$/);
    await page.waitForSelector('#plan-settings');
    const actions = await page.evaluate(() => [...document.querySelectorAll('#plan-settings .plan-sheet-actions button')].map((b) => b.textContent));
    await shot('manage');
    await page.evaluate(() => [...document.querySelectorAll('#plan-settings .plan-sheet-actions button')].find((b) => b.textContent === 'Stop plan').click());
    await page.waitForSelector('#vot-toast-plan-manage.show .vot-undo-btn');
    const afterStop = await page.evaluate(() => ({ toast: document.getElementById('vot-toast-plan-manage').textContent, status: window.ReadingPlanStore.get('st-missed3').status, list: !!document.querySelector('.plan-list') }));
    await shot('stopped-toast');
    await page.evaluate(() => document.querySelector('#vot-toast-plan-manage .vot-undo-btn').click());
    await sleep(500);
    const undone = await page.evaluate(() => ({ status: window.ReadingPlanStore.get('st-missed3').status, rows: document.querySelectorAll('.plan-run-row').length }));
    out.manage = { actions, afterStop, undone };
    need(JSON.stringify(actions) === JSON.stringify(['Pause plan', 'Start over', 'Stop plan']), `M actions: ${JSON.stringify(actions)}`);
    need(afterStop.status === 'stopped' && afterStop.list && /^Stopped Three|^Stopped Bible in a Year/.test(afterStop.toast), `M stop: ${JSON.stringify(afterStop)}`);
    need(undone.status === 'running' && undone.rows === 7, `M undo: ${JSON.stringify(undone)}`);

    // S: a new plan starts at zero, whatever was read before (0245). Genesis 1-50 go in the read record, no plans.
    await page.evaluate(async () => {
      const st = window.StateStore.get() || {};
      const readItems = { ...(st.readItems || {}) };
      for (let c = 1; c <= 50; c++) readItems['v1:genesis:' + c] = 1;
      window.StateStore.set({ ...st, readItems });
      await window.StateStore.whenSaved();
    });
    await seed([]);
    const marks = await page.evaluate(() => Object.keys((window.StateStore.get() || {}).readItems || {}).filter((k) => /^v1:genesis:/.test(k)).length);
    await clickText(/^Library$/, '.tabbar-tab, button');
    await clickText(/^Reading plans/);
    await clickText(/^Bible in a Year: Genesis/);
    await page.waitForSelector('.plan-preview');
    const preview = await page.evaluate(() => ({
      already: /Already read|Count my|read already/.test(document.querySelector('.plan-preview').textContent),
      week: [...document.querySelectorAll('[aria-label="Your first week"] .plan-day-portion')].map((e) => e.textContent),
    }));
    await shot('start-preview');
    await clickText(/^Start plan$/);
    await sleep(500);
    const run = await page.evaluate(() => { const r = window.ReadingPlanStore.active()[0]; return r ? { plan: r.plan, ticks: Object.keys(r.ticks || {}).length, credited: r.credited || 0 } : null; });
    await boot();
    await page.waitForFunction(() => !!document.querySelector('.upnext [data-plan]'));
    await sleep(500);
    const home = await page.evaluate(() => { const r = document.querySelector('.upnext [data-plan]'); return { eyebrow: (r.querySelector('.upnext-eyebrow') || r).textContent.trim(), text: r.textContent }; });
    await shot('start-home');
    const today = await page.evaluate(async () => {
      window.ReadingPlanStore.noteRead('genesis', 1);
      await window.ReadingPlanStore.whenSaved();
      const d = new Date();
      return { ticks: window.ReadingPlanStore.active()[0].ticks, key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') };
    });
    out.start = { marks, preview, run, home, ticks: today.ticks };
    need(marks === 50, `S seed: ${marks} Genesis read marks, not 50`);
    need(!preview.already && JSON.stringify(preview.week) === JSON.stringify(['Genesis 1-3', 'Genesis 4-7', 'Genesis 8-10']), `S preview: ${JSON.stringify(preview)}`);
    need(run && run.plan === 'bible-year' && run.ticks === 0 && run.credited === 0, `S run: ${JSON.stringify(run)}`);
    need(/\bDay 1\b/.test(home.eyebrow) && /Genesis 1-3/.test(home.text), `S Home card: ${JSON.stringify(home)}`);
    need(JSON.stringify(today.ticks) === JSON.stringify({ 'genesis:1': today.key }), `S read after start: ${JSON.stringify(today)}`);
  }
} catch (e) {
  try { await page.screenshot({ path: join(tmpdir(), 'vot-plans-fail.png') }); console.error('[plans] failure shot', join(tmpdir(), 'vot-plans-fail.png'), await page.evaluate(() => [...document.querySelectorAll('button')].slice(0, 10).map((b) => (b.getAttribute('aria-label') || b.textContent).trim().slice(0, 24)).join(' | '))); } catch { /* no page */ }
  fails.push('walk: ' + ((e && e.message) || e));
} finally {
  await browser.close();
  server.close();
  rmSync(profile, { recursive: true, force: true });
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.home));
if (!HOME_ONLY) console.log(JSON.stringify({ list: out.list, catchUp: out.catchUp, manage: out.manage, start: out.start }));
if (fails.length) { console.log(fails.length + ' finding(s):\n' + fails.map((f) => '  ' + f).join('\n') + '\nFAIL'); process.exit(HOME_ONLY ? 0 : 1); }
console.log('PASS');
