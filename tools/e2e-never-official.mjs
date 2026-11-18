/**
 * e2e-never-official — the app never presents itself as the official website (Corbin 11-18 02:09, DECISIONS:
 * "It should NEVER look like it's portraying itself as the official website inside our app. Ever").
 *
 *   npm run e2e:official                     # exit 1 on any hit, or on a stop it could not reach
 *   node tools/e2e-never-official.mjs --json out.json
 *
 * Serves its own tree (serveOwnTree), walks a fresh profile at phone size (412x915) and, at every stop, reads what
 * the page draws and says: every text node, every aria-label / title / alt / placeholder, and document.title. Any
 * /official/i there FAILS, except inside the source's own running text (ALLOW below: an Answers page's body, a
 * letter's paragraphs), which stays word for word. Before the walk it reads the head (title and meta tags),
 * manifest.json and the Android strings the same way.
 *
 * Stops: the three roots, Settings and its About, Volumes and Volume One, a letter, the Bible and Genesis 1,
 * Studies, Search; then Answers: the landing, A–Z, About this collection, Charts & videos (every list open),
 * Saved, an Answers search, the introduction with its Contents sheet and share card, and then every topic, by the
 * site's own "Next" chain from the introduction and, for any the chain does not reach, from A–Z. A topic the walk
 * could not open FAILS: a page never opened was never read.
 */
import { resolve, dirname } from 'node:path';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import puppeteer from 'puppeteer';
import { serveOwnTree } from './e2e-read-serve.mjs';
import { throughFirstRun, declineTourOffer } from './first-run.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, '..', 'app', 'src', 'main', 'assets');
const argv = process.argv.slice(2);
const OUT = argv.includes('--json') ? argv[argv.indexOf('--json') + 1] : null;
const ONLY_ANSWERS = argv.includes('--answers');                                   // skip the rest of the app
const MAX = argv.includes('--max') ? +argv[argv.indexOf('--max') + 1] : Infinity; // topics (a dev cut; unreached then fail)
const RE = /official/i;
/** The source's own running text: its words stay word for word, "official" included. */
const ALLOW = '.ans-reading, .letter-para';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const hits = [];      // { stop, where, text }
const unreached = []; // { stop, why }
const stops = [];

/* ── outside the DOM: the head, the manifest, the Android strings ── */
{
  const html = readFileSync(resolve(ASSETS, 'index.html'), 'utf8');
  const head = html.slice(0, html.indexOf('</head>'));
  for (const m of head.matchAll(/<title>([^<]*)<\/title>|<meta\s[^>]*content="([^"]*)"[^>]*>/gi)) {
    const v = m[1] || m[2] || '';
    if (RE.test(v)) hits.push({ stop: 'index.html head', where: m[0].slice(0, 80), text: v });
  }
  const man = JSON.parse(readFileSync(resolve(ASSETS, 'manifest.json'), 'utf8'));
  const walkJson = (o, path) => {
    if (typeof o === 'string') { if (RE.test(o)) hits.push({ stop: 'manifest.json', where: path, text: o }); return; }
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walkJson(v, path + '.' + k);
  };
  walkJson(man, '$');
  const res = resolve(ASSETS, '..', 'res');
  for (const d of readdirSync(res).filter((n) => n.startsWith('values'))) {
    const f = resolve(res, d, 'strings.xml');
    if (!existsSync(f)) continue;
    for (const m of readFileSync(f, 'utf8').matchAll(/<string[^>]*name="([^"]+)"[^>]*>([^<]*)</g)) {
      if (RE.test(m[2])) hits.push({ stop: 'android ' + d + '/strings.xml', where: m[1], text: m[2] });
    }
  }
}

/* The topics the walk must open: every entry Answers lists. */
const ctxA = {};
runInNewContext(readFileSync(resolve(ASSETS, 'src', 'data', 'answers.js'), 'utf8'), ctxA);
const TITLES = ctxA.ANSWERS.map((e) => e.title);
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const { server, url: BASE } = await serveOwnTree();
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--renderer-process-limit=2', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let code = 0;
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 160)));
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.setRequestInterception(true);
  page.on('request', (r) => { if (/votreader-assets|audio\.votreader|\.mp3(\?|$)|cloudflareinsights|youtube|ytimg/.test(r.url())) r.respond({ status: 404, body: '' }); else r.continue(); });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#root') && document.querySelector('#root').children.length > 0, { timeout: 30000 });
  await sleep(1500);

  const ev = (fn, ...a) => page.evaluate(fn, ...a);
  const esc = async (n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press('Escape'); await sleep(300); } };
  const tap = async (src, root = '') => {
    const r = await ev((src, root) => {
      const re = new RegExp(src, 'i');
      const els = [...document.querySelectorAll(`${root} :is(button,[role="button"],a,.ui-row,.ui-row-press,.root-row,.tabbar-tab,[role="tab"])`)].filter((e) => { const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0; });
      const lab = (e) => (e.textContent || '').replace(/\s+/g, ' ').trim();
      const el = els.find((e) => re.test(lab(e))) || els.find((e) => re.test(e.getAttribute('aria-label') || ''));
      if (!el) return 'NOT FOUND ' + src;
      el.scrollIntoView({ block: 'center' }); el.click(); return null;
    }, src, root);
    if (r) throw new Error(r);
    await sleep(900);
  };
  const click = (sel, t, nth = 0) => ev((sel, t, nth) => {
    const els = [...document.querySelectorAll(sel)].filter((x) => x.getBoundingClientRect().width > 0 && (!t || new RegExp(t, 'i').test((x.getAttribute('aria-label') || x.textContent).replace(/\s+/g, ' ').trim())));
    const b = els[nth]; if (!b) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true;
  }, sel, t, nth);
  const tab = async (l) => {
    await esc(2);
    for (let i = 0; i < 4 && !(await ev(() => [...document.querySelectorAll('.tabbar-tab')].some((b) => b.getBoundingClientRect().width > 0))); i++) {
      await ev(() => { const b = [...document.querySelectorAll('button')].find((x) => /^(go back|back)/i.test((x.getAttribute('aria-label') || '').trim()) && x.getBoundingClientRect().width > 0); if (b) b.click(); else history.back(); }); await sleep(900);
    }
    for (let k = 0; k < 2; k++) { await ev((l) => { const b = [...document.querySelectorAll('.tabbar-tab')].find((x) => x.textContent.trim().startsWith(l)); if (b) b.click(); }, l); await sleep(800); }
  };

  /** Read every drawn word and every spoken label on the page now; a hit outside ALLOW fails. */
  const check = async (stop) => {
    await sleep(400);
    const found = await ev((ALLOW, src) => {
      const re = new RegExp(src, 'i');
      const out = [];
      const where = (el) => { const p = []; for (let e = el; e && e !== document.body && p.length < 4; e = e.parentElement) p.unshift(e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '')); return p.join(' > '); };
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const p = n.parentElement;
        if (!p || p.closest('script, style, noscript, template')) continue;
        if (re.test(n.textContent) && !p.closest(ALLOW)) out.push({ where: where(p), text: n.textContent.trim().slice(0, 140) });
      }
      for (const el of document.querySelectorAll('[aria-label], [title], [alt], [placeholder], [aria-description], [aria-roledescription]')) {
        if (el.closest(ALLOW) || el.closest('head')) continue;
        for (const a of ['aria-label', 'title', 'alt', 'placeholder', 'aria-description', 'aria-roledescription']) {
          const v = el.getAttribute(a);
          if (v && re.test(v)) out.push({ where: where(el) + ' @' + a, text: v.slice(0, 140) });
        }
      }
      if (re.test(document.title)) out.push({ where: 'document.title', text: document.title });
      return out;
    }, ALLOW, RE.source);
    for (const f of found) hits.push({ stop, ...f });
    stops.push(stop);
    console.log(`${stop.padEnd(34)} ${found.length ? 'HIT ' + found.length : 'ok'}`);
    for (const f of found.slice(0, 4)) console.log(`    ${f.where.slice(0, 90)}: "${f.text}"`);
  };
  const step = async (name, fn) => {
    if (ONLY_ANSWERS && !/^(answers|topic)/.test(name)) return;
    try { await fn(); } catch (e) { unreached.push({ stop: name, why: String(e.message || e).slice(0, 300) }); console.log(`${name.padEnd(34)} UNREACHED ${String(e.message || e).slice(0, 200)}`); await esc(3); }
  };
  const toAnswers = async () => { await tab('Read'); await tap('^topics & doctrines'); await sleep(1200); };
  const topicTitle = () => ev(() => { const h = document.querySelector('.ans-page h1'); return h ? h.textContent.replace(/\s+/g, ' ').trim() : null; });
  const waitTopic = async (prev) => {
    for (let i = 0; i < 40; i++) {
      const t = await topicTitle();
      const ready = await ev(() => !!document.querySelector('.ans-page .ans-reading > *') && !!document.querySelector('.ans-foot-nav'));
      if (t && t !== prev && ready) { await sleep(500); return t; }
      await sleep(250);
    }
    throw new Error('topic did not open (after "' + prev + '")');
  };

  await throughFirstRun(page).catch((e) => unreached.push({ stop: 'first-run', why: e.message }));
  await sleep(800);
  await declineTourOffer(page); await sleep(300);

  /* ── the rest of the app ── */
  await step('roots', async () => { await tab('Read'); await check('read'); await tab('Listen'); await check('listen'); await tab('Library'); await check('library'); });
  await step('settings', async () => {
    await tab('Read'); await tap('^quick settings$'); await tap('^settings$'); await sleep(800); await check('settings');
    await ev(() => { const s = [...document.querySelectorAll('.screen-scroll')].filter((e) => e.getBoundingClientRect().width > 0).pop(); if (s) s.scrollTop = s.scrollHeight; }); await sleep(400);
    if (await click('button, a, [role="button"], .ui-row, .ui-row-press', '^about')) { await sleep(900); await check('settings-about'); }
  });
  await step('volumes', async () => {
    await tab('Read'); await tap('volumes of truth'); await check('volumes');
    await tap('^volume one'); await sleep(900); await check('volume-one');
    await ev(() => { const r = [...document.querySelectorAll('.screen-scroll .ui-row-press, .screen-scroll .ui-row, .screen-scroll a, .screen-scroll [role="button"]')].filter((e) => e.getBoundingClientRect().width > 0 && /\w{4}/.test(e.textContent)); const b = r.find((e) => /^\s*\d/.test(e.textContent)) || r[2]; if (b) b.click(); }); await sleep(1500);
    await check('a-letter');
  });
  await step('bible', async () => {
    await tab('Read'); await tap('^(the )?(holy bible|bible|scriptures)'); await check('bible');
    await tap('^the law'); await tap('^genesis'); await sleep(600);
    await ev(() => { const b = [...document.querySelectorAll('.screen-scroll button, .screen-scroll [role="button"]')].find((x) => /^(chapter )?1$/i.test((x.getAttribute('aria-label') || x.textContent).trim())); if (b) b.click(); }); await sleep(1500);
    await check('genesis-1');
  });
  await step('studies', async () => { await tab('Read'); await tap('^(bible )?stud(y|ies)'); await check('studies'); });
  await step('search', async () => {
    await tab('Read'); await tap('^search'); await check('search');
    await ev(() => { const e = document.querySelector('input'); if (e) e.focus(); }); await page.keyboard.type('faith', { delay: 20 }); await page.keyboard.press('Enter'); await sleep(1500);
    await check('search-results');
  });

  /* ── Answers ── */
  await step('answers-landing', async () => {
    await toAnswers(); await check('answers-landing');
    if (!(await click('.ans-head-link', '^A–Z$'))) throw new Error('no A–Z');
    await sleep(900); await check('answers-a-z');
    await click('.ans-head-link', '^By group$'); await sleep(600);
    if (!(await click('a[role="button"]', '^About this collection'))) throw new Error('no About this collection');
    await sleep(800); await check('answers-about'); await esc();
  });
  await step('answers-media', async () => {
    await toAnswers();
    if (!(await click('.ans-icon-row, .ans-tile-btn', 'chart'))) throw new Error('no Charts & videos');
    await sleep(900);
    for (const t of ['^All \\d', '^Playlists', '^Audio & PDF']) { await click('button, [role="button"]', t); await sleep(500); }
    await check('answers-media');
  });
  await step('answers-saved', async () => {
    await toAnswers();
    if (!(await click('.ans-icon-row, .ans-tile-btn', 'saved'))) throw new Error('no Saved');
    await sleep(900); await check('answers-saved');
  });
  await step('answers-search', async () => {
    await toAnswers();
    for (const q of ['youtube', 'introduction', 'website']) {
      await ev(() => { const e = document.querySelector('.ans-search-input'); if (e) { e.focus(); e.select(); } });
      await page.keyboard.press('Backspace');
      await page.keyboard.type(q, { delay: 15 }); await sleep(900);
      await check('answers-search "' + q + '"');
    }
  });

  /* every topic: the introduction, then the site's own Next chain, then A–Z for any it does not reach */
  const seen = new Set();
  await step('answers-introduction', async () => {
    await toAnswers();
    if (!(await click('.ans-start-row'))) throw new Error('no Start here row');
    const t = await waitTopic(null); seen.add(t);
    await check('topic: ' + t);
    await ev(() => { const h = document.querySelector('.ans-hero'); if (h) h.closest('.screen-scroll').scrollTop = 1800; }); await sleep(600);
    if (await click('.ans-runhead')) { await sleep(700); await check('introduction: Contents sheet'); await esc(); }
    await ev(() => { const s = document.querySelector('.ans-hero'); if (s) s.closest('.screen-scroll').scrollTop = 0; }); await sleep(400);
    try { await tap('^more$'); if (await click('button, [role="menuitem"]', '^share as a card$')) { await sleep(900); await check('introduction: share card'); } await esc(2); } catch (_e) { await esc(2); }
  });
  await step('answers-next-chain', async () => {
    // the introduction again: closing the share card's menu took the walk back out to the landing
    await toAnswers();
    if (!(await click('.ans-start-row'))) throw new Error('no Start here row');
    await waitTopic(null);
    for (let i = 0; i < TITLES.length + 5; i++) {
      const prev = await topicTitle();
      const went = await ev(() => {
        const nav = document.querySelector('.ans-foot-nav'); if (!nav) return 'no .ans-foot-nav; h1 ' + (document.querySelector('.ans-page h1') || {}).textContent + '; dialogs ' + document.querySelectorAll('[role=dialog]').length;
        const rows = [...nav.querySelectorAll('a, button, [role="button"]')];
        const next = rows.find((r) => /^Next/.test((r.querySelector('.ans-row-sub') || {}).textContent || ''))
          || rows.find((r) => /^Proceed to:/.test((r.querySelector('.ans-row-sub') || {}).textContent || '') && !r.getAttribute('href')?.startsWith('http'));
        if (!next) return 'rows: ' + rows.map((r) => r.textContent.replace(/\s+/g, ' ').slice(0, 40)).join(' | ');
        next.scrollIntoView({ block: 'center' }); next.click(); return true;
      });
      if (went !== true) { console.log('next chain: no Next row after "' + prev + '": ' + went); break; }
      const t = await waitTopic(prev).catch((e) => { console.log('next chain: ' + e.message); return null; });
      if (!t || seen.has(t)) { if (t) console.log('next chain: back at "' + t + '"'); break; }
      if (seen.size >= MAX) break;
      seen.add(t); await check('topic: ' + t);
    }
  });
  const missing = TITLES.filter((t) => !seen.has(norm(t)));
  console.log(`next chain reached ${seen.size} of ${TITLES.length}; ${missing.length} by A–Z`);
  for (const title of missing.slice(0, Math.max(0, MAX - seen.size))) {
    await step('topic: ' + title, async () => {
      await toAnswers();
      await click('.ans-head-link', '^A–Z$'); await sleep(700);
      const ok = await ev((title) => {
        const n = (s) => String(s || '').replace(/\s+/g, ' ').trim();
        const r = [...document.querySelectorAll('.ans-box a, .ans-box button, .ans-box [role="button"]')].find((e) => n((e.querySelector('.ans-row-title') || e).textContent) === n(title));
        if (!r) return false; r.scrollIntoView({ block: 'center' }); r.click(); return true;
      }, title);
      if (!ok) throw new Error('not in A–Z: ' + title);
      const t = await waitTopic(null); seen.add(t);
      await check('topic: ' + t);
    });
  }
  const never = TITLES.filter((t) => !seen.has(norm(t)));
  for (const t of never) if (!unreached.some((u) => u.stop === 'topic: ' + t)) unreached.push({ stop: 'topic: ' + t, why: 'never opened' });
  if (errors.length) console.log('page errors:', errors.slice(0, 5).join(' | '));
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${stops.length} stops read; ${hits.length} hit(s); ${unreached.length} unreached`);
for (const h of hits) console.log(`HIT  ${h.stop}: ${h.where}: "${h.text}"`);
for (const u of unreached) console.log(`UNREACHED  ${u.stop}: ${u.why}`);
if (OUT) writeFileSync(OUT, JSON.stringify({ stops, hits, unreached }, null, 1));
if (hits.length || unreached.length) code = 1;
console.log(code ? 'FAIL' : 'PASS: nothing the app draws or says calls a page official');
process.exit(code);
