/* e2e-plans: reading plans at a glance, in a real Chrome at phone width (task 2235, 2026-11-16).
   Seeds every plan state (tools/plan-states.mjs, dated around today) into the app's own ReadingPlanStore, then:
   H  Home's up-next card: its height and each plan row's, per state (Corbin 11-10: the plan card must not take over
      Home; 2235: no taller than at dc31d3e27). --home-only measures just this, so the same walk runs on an older tree.
   L  the Plans list: each row leads with its status, a plan that is behind has Catch up, Past plans holds the
      finished and the stopped plan.
   C  Catch up from the list opens the plan page on the Catch up sheet with its three ways forward.
   M  Manage plan (the bar's Manage): Pause, Start over, Stop; Stop is one tap and the toast's Undo puts it back.
   G  the Schedule's Manage (0430): the same sheet over the schedule; Back shuts it, then goes to the plan page.
   T  (in M) every control on the Manage sheet takes a press 21 px from its centre each way (a 44 px target, 0450).
   O  "Count only this plan's reading" (0450): a credited plan starts again from today with its dated reading; the toast's
      Undo puts the stored run back byte for byte, in memory and after a reboot (what IndexedDB holds).
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
const out = { home: {}, list: null, catchUp: null, manage: null, targets: null, schedule: null, start: null, ownOnly: null };

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
    two: ['ontrack', 'missed3'], ontrackPaused: ['ontrack', 'paused'], finished: ['finished'] };
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
    need(h.finished.rows.length === 1 && h.finished.eyebrows[0] === 'Plan finished', `H finished eyebrow (0430): ${JSON.stringify(h.finished)}`);

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
      // 0430: each running row's Manage, its height, and any name or status cut short (the list wraps, never cuts)
      manage: [...document.querySelectorAll('.plan-run-li')].map((li) => !!li.querySelector('.plan-manage-link')),
      heights: [...document.querySelectorAll('.plan-run-li')].map((li) => Math.round(li.getBoundingClientRect().height)),
      cut: [...document.querySelectorAll('.plan-list :is(.root-row-title, .root-row-sub)')].filter((e) => e.scrollWidth > e.clientWidth + 1 || getComputedStyle(e).textOverflow === 'ellipsis' && getComputedStyle(e).whiteSpace === 'nowrap').map((e) => e.textContent),
    }));
    await shot('list');
    const leads = out.list.rows.map((r) => r.replace(/^[^:]+: /, '').split(' · ')[0]);
    need(JSON.stringify(leads) === JSON.stringify(['On track', 'Done today', '1 day behind', '3 days behind', 'Paused', leads[5], 'On track']) && /^Not started$/.test(leads[5]),
      `L leads: ${JSON.stringify(leads)}`);
    need(out.list.catchUp.length === 2, `L Catch up buttons: ${JSON.stringify(out.list.catchUp)}`);
    need(out.list.past.length === 2 && out.list.past.some((s) => /^Stopped /.test(s)), `L Past plans: ${JSON.stringify(out.list.past)}`);
    need(out.list.manage.length === 7 && out.list.manage.every(Boolean), `L Manage on every row, paused too (0430): ${JSON.stringify(out.list.manage)}`);
    need(out.list.cut.length === 0, `L cut short (0430): ${JSON.stringify(out.list.cut)}`);

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
    // T: each control's press reaches 21 px from its centre, up, down, left and right (elementFromPoint, so a ::after counts)
    out.targets = await page.evaluate(async () => {
      const els = [...document.querySelectorAll('#plan-settings :is(.ui-chip, .plan-day-toggle, .plan-text-btn, .plan-date, .plan-time)')];
      const small = [];
      for (const el of els) {
        el.scrollIntoView({ block: 'center' });
        await new Promise((r) => setTimeout(r, 60));
        const b = el.getBoundingClientRect(); const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
        const miss = [[cx, cy - 21.5], [cx, cy + 21.5], [cx - 21.5, cy], [cx + 21.5, cy]].filter(([x, y]) => { const h = document.elementFromPoint(x, y); return !h || !(h === el || el.contains(h)); });
        if (miss.length) small.push((el.getAttribute('aria-label') || el.textContent || el.className).trim() + ' ' + Math.round(b.width) + 'x' + Math.round(b.height));
      }
      const days = [...document.querySelectorAll('#plan-settings .plan-day-toggle')].map((e) => Math.round(e.getBoundingClientRect().left));
      return { n: els.length, small, dayPitch: days.slice(1).map((x, i) => x - days[i]) };
    });
    need(out.targets.n >= 12 && out.targets.small.length === 0, `T Manage targets under 44 px: ${JSON.stringify(out.targets)}`);
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

    // G: the Schedule's Manage (0430): the same sheet over the schedule; Back shuts it, then goes to the plan page
    await page.evaluate(() => document.querySelector('.plan-run-row').click());
    await clickText(/^Whole schedule$/);
    await page.waitForFunction(() => / · Schedule$/.test((document.querySelector('.plan-bar-title') || {}).textContent || ''));
    const bar = () => page.evaluate(() => {
      const t = document.querySelector('.plan-bar-title'); const m = document.querySelector('.plan-manage-btn');
      const lh = t ? parseFloat(getComputedStyle(t).lineHeight) || 1 : 1;
      return { title: t ? t.textContent : null, lines: t ? Math.round(t.getBoundingClientRect().height / lh) : 0, titleW: t ? Math.round(t.getBoundingClientRect().width) : 0,
        manageW: m ? Math.round(m.getBoundingClientRect().width) : 0, sheet: !!document.getElementById('plan-settings') };
    });
    const sched = await bar();
    await clickText(/^Manage plan$/);
    await page.waitForSelector('#plan-settings');
    const open = await bar();
    await shot('schedule-manage');
    await page.keyboard.press('Escape');
    await sleep(600);
    const shut = await bar();
    await page.keyboard.press('Escape');
    await sleep(600);
    const backTo = await bar();
    out.schedule = { sched, open, shut, backTo };
    need(sched.manageW > 0 && !sched.sheet, `G schedule bar: ${JSON.stringify(sched)}`);
    need(open.sheet && open.title === sched.title, `G Manage over the schedule: ${JSON.stringify(open)}`);
    need(!shut.sheet && shut.title === sched.title, `G Back shuts the sheet: ${JSON.stringify(shut)}`);
    need(!backTo.sheet && backTo.title === sched.title.replace(/ · Schedule$/, ''), `G Back again, the plan page: ${JSON.stringify(backTo)}`);

    // S: a new plan starts at zero, whatever was read before (0245). Genesis 1-50 go in the read record, no plans.
    await page.evaluate(async () => {
      const st = window.StateStore.get() || {};
      const readItems = { ...(st.readItems || {}) };
      for (let c = 1; c <= 50; c++) readItems['v1:genesis:' + c] = 1;
      window.StateStore.set({ ...st, readItems });
      await window.StateStore.whenSaved();
    });
    // no plans (not seed(): after L the app reboots on the Library tab, where seed's wait for Home never ends)
    await page.evaluate(async () => { window.ReadingPlanStore.replaceAll([]); await window.ReadingPlanStore.whenSaved(); });
    await boot();
    console.error('[plans] S seeded');
    const marks = await page.evaluate(() => Object.keys((window.StateStore.get() || {}).readItems || {}).filter((k) => /^v1:genesis:/.test(k)).length);
    await clickText(/^Library$/, '.tabbar-tab, button');
    await clickText(/^Reading plans/);
    // the hub may still be settling (the Volumes load re-renders it): tap the row until the preview is up, at most 3 times
    const hits = [];
    for (let i = 0; i < 3 && !(await page.$('.plan-preview')); i++) {
      hits.push(await page.evaluate(() => { const el = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && /^Bible in a Year: Genesis/.test(b.getAttribute('aria-label') || b.textContent.trim()));
        if (!el) return null; el.scrollIntoView({ block: 'center' }); el.click(); return el.className; }));
      await page.waitForSelector('.plan-preview', { timeout: 4000 }).catch(() => {});
    }
    if (!(await page.$('.plan-preview'))) throw new Error('S: the preview did not open, taps hit ' + JSON.stringify(hits));
    if (hits.length > 1) console.error('[plans] S preview opened on tap', hits.length, JSON.stringify(hits));
    const preview = await page.evaluate(() => ({
      already: /Already read|Count my|read already/.test(document.querySelector('.plan-preview').textContent),
      week: [...document.querySelectorAll('[aria-label="Your first week"] .plan-day-portion')].map((e) => e.textContent),
    }));
    await shot('start-preview');
    console.error('[plans] S preview', JSON.stringify(preview), 'hits', JSON.stringify(hits));
    await clickText(/^Start plan$/);
    await page.waitForFunction(() => window.ReadingPlanStore.active().length === 1);
    console.error('[plans] S started');
    const run = await page.evaluate(async () => { await window.ReadingPlanStore.whenSaved(); const r = window.ReadingPlanStore.active()[0]; return { plan: r.plan, ticks: Object.keys(r.ticks || {}).length, credited: r.credited || 0 }; });
    await boot();   // a fresh boot reopens the tab it left (Library): Home is the Read tab's root
    if (!(await page.$('.home-root'))) await clickText(/^Read$/, '.tabbar-tab, button');
    console.error('[plans] S rebooted, home-root', !!(await page.$('.home-root')));
    await page.waitForFunction(() => !!document.querySelector('.upnext [data-plan]'));
    await sleep(500);
    const home = await page.evaluate(() => { const r = document.querySelector('.upnext [data-plan]'); return { eyebrow: (r.querySelector('.upnext-eyebrow') || r).textContent.trim(), text: r.textContent }; });
    await shot('start-home');
    const today = await page.evaluate(async () => {
      // plan-own: a new plan counts only its own reading, so the read is one opened from the plan (its sitting)
      const r0 = window.ReadingPlanStore.active()[0];
      window.ReadingPlanStore.setSitting({ runId: r0.id, keys: ['genesis:1', 'genesis:2', 'genesis:3'] });
      window.ReadingPlanStore.noteRead('genesis', 1);
      window.ReadingPlanStore.setSitting(null);
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

    // O: "Count only this plan's reading" (0450)
    await page.evaluate(async (r) => { window.ReadingPlanStore.replaceAll([r]); await window.ReadingPlanStore.whenSaved(); }, STATES.credited);
    await boot();
    console.error('[plans] O seeded');
    await clickText(/^Library$/, '.tabbar-tab, button');
    await clickText(/^Reading plans/);
    await page.waitForSelector('.plan-run-row');
    const stored = await page.evaluate(() => JSON.stringify(window.ReadingPlanStore.get('st-credited')));
    await clickText(/^Manage Bible in a Year$/);
    await page.waitForSelector('#plan-settings .plan-own-only-btn');
    const words = await page.evaluate(() => { const b = document.querySelector('#plan-settings .plan-own-only-btn'); b.scrollIntoView({ block: 'center' }); return b.closest('.plan-opt').innerText; });
    await sleep(500);
    await shot('own-only-manage');
    await page.evaluate(() => document.querySelector('#plan-settings .plan-own-only-btn').click());
    await page.waitForSelector('#vot-toast-plan-manage.show .vot-undo-btn');
    await sleep(500);
    const tk = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
    const after = await page.evaluate(() => {
      const S = window.ReadingPlanStore;
      return { toast: document.getElementById('vot-toast-plan-manage').textContent, old: (S.get('st-credited') || {}).status,
        active: S.active().map((r) => ({ old: r.id === 'st-credited', start: r.start, credited: r.credited || 0, ticks: Object.keys(r.ticks).length })),
        status: (document.querySelector('.plan-status') || {}).textContent || '', sheet: !!document.getElementById('plan-settings') };
    });
    await shot('own-only-after');
    await page.evaluate(() => document.querySelector('#vot-toast-plan-manage .vot-undo-btn').click());
    await sleep(500);
    const undoneO = await page.evaluate(async () => { await window.ReadingPlanStore.whenSaved(); return { json: JSON.stringify(window.ReadingPlanStore.get('st-credited')), n: window.ReadingPlanStore.all().length }; });
    await boot();
    const rebooted = await page.evaluate(() => JSON.stringify(window.ReadingPlanStore.get('st-credited')));
    out.ownOnly = { words, after, undoneSame: undoneO.json === stored, n: undoneO.n, rebootSame: rebooted === stored };
    need(/30 chapters you had read before this plan began count toward it\./.test(words) && /Starts the plan again from today/.test(words), `O words: ${JSON.stringify(words)}`);
    need(after.old === 'stopped' && after.active.length === 1 && !after.active[0].old && after.active[0].credited === 0 && after.active[0].start === tk
      && /^On track/.test(after.status) && !after.sheet && /^Started again from today/.test(after.toast), `O after the tap: ${JSON.stringify(after)}`);
    need(undoneO.json === stored && undoneO.n === 1, `O Undo not byte for byte: ${undoneO.json === stored} n=${undoneO.n}`);
    need(rebooted === stored, 'O after a reboot the stored run differs from before the tap');
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
if (!HOME_ONLY) console.log(JSON.stringify({ list: out.list, catchUp: out.catchUp, manage: out.manage, targets: out.targets, schedule: out.schedule, start: out.start, ownOnly: out.ownOnly }));
if (fails.length) { console.log(fails.length + ' finding(s):\n' + fails.map((f) => '  ' + f).join('\n') + '\nFAIL'); process.exit(HOME_ONLY ? 0 : 1); }
console.log('PASS');
