/* End-to-end search quality on the REAL corpus (2026-09-27).
   ─────────────────────────────────────────────────────────────────
   The fixture suites (src/search/*.test.js) pin the engine's rules on a dozen
   hand-made verses; none of them can say whether a reader who types "for god so
   loved the world" or "Vengeance Is Mine" still finds John 3:16 or Volume Seven
   Letter 55 in the corpus that ships. This runs the queries readers actually type
   (tools/e2e-search.cases.json) against the BUILT app in headless Chrome, every
   corpus loaded and the index built exactly as the search screen builds it, and
   asks the engine what the screen asks it (limit 6000, 400 per collection).

   A case names a query and what must surface for it:
     q          the query as typed
     corpus     'all' (default) | 'scriptures' | 'volumes'
     top        the intended result must rank within this many (the screen's Best
                Matches row is the top 5, and it is all a phone shows of a long
                result set before a group is opened)
     ref / title / letterId   what the intended result is (any given must match)
     parse      the reference parse must carry these fields ({ kind, bookId, ... })
     corrected  the word a typo must be corrected to; null = no correction at all
     places     { minimum: n }: the intended result's text must hold at least n
                find-bar places for the card's terms (what the reader steps through)
     why        who found it, or what it guards
   A run that checks nothing fails. Exit 1 on any failing case, with a line each.

   Local: `npm run e2e:search` (after `npm run build`). CI: a step after the build.
   Serves its own tree on an OS-assigned port (e2e-read-serve.mjs serveOwnTree).
   ─────────────────────────────────────────────────────────────────── */
import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
import { serveOwnTree } from './e2e-read-serve.mjs';

const CASES = JSON.parse(readFileSync(new URL('./e2e-search.cases.json', import.meta.url), 'utf8')).cases;
const VERBOSE = process.argv.includes('--verbose');

const { server, url } = await serveOwnTree();
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'], protocolTimeout: 600000 });
let failed = 0;
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const r = document.getElementById('root'); return !!r && r.children.length > 0; });
  // Every corpus, the search bundle and the studies, then the index: what SearchScreen does on mount.
  await page.evaluate(async () => {
    const loaders = ['__loadBibleCorpus', '__loadMatthewCorpus', '__loadVotCorpus', '__loadAnswersCorpus', '__loadScreensE'];
    await Promise.all(loaders.map((n) => (typeof window[n] === 'function' ? window[n]() : null)));
    if (typeof window.loadBibleStudies === 'function') await window.loadBibleStudies();
    await window.VotSearchMini.init();
  });

  const outcomes = await page.evaluate(async (cases) => {
    const E = window.VotSearchMini;
    const SYN = (window.VotSearchData && window.VotSearchData.SYNONYM_MAP) || {};
    /** The terms a card marks: SearchScreen's expandSnippetTerms (synonyms on) plus the hit's own. */
    const cardTerms = (r, hit) => {
      const tq = r.textQuery;
      const base = (tq && tq.phrase ? [tq.phrase] : []).concat(r.parsedTerms || []);
      const all = new Set(base);
      for (const t of r.parsedTerms || []) for (const g of SYN[String(t).toLowerCase()] || []) all.add(g);
      for (const t of (hit && hit.terms) || []) all.add(t);
      return [...all];
    };
    const matches = (doc, c) => (!c.ref || doc.ref === c.ref) && (!c.title || doc.title === c.title) && (!c.letterId || doc.letterId === c.letterId);
    const out = [];
    for (const c of cases) {
      const res = { q: c.q, corpus: c.corpus || 'all', problems: [] };
      try {
        if (c.parse) {
          const p = E.parse(c.q) || {};
          for (const k of Object.keys(c.parse)) {
            if (p[k] !== c.parse[k]) res.problems.push('parse.' + k + ' = ' + JSON.stringify(p[k]) + ', want ' + JSON.stringify(c.parse[k]));
          }
        }
        if (c.top || c.corrected !== undefined || c.places) {
          const r = await E.search(c.q, { limit: 6000, perVolume: 400, corpus: c.corpus || 'all' });
          const results = r.results || [];
          const at = (c.ref || c.title || c.letterId) ? results.findIndex((x) => matches(x.doc, c)) : -1;
          res.rank = at < 0 ? null : at + 1;
          res.top3 = results.slice(0, 3).map((x) => x.doc.ref + (x.doc.kind !== 'verse' && x.doc.title ? ' (' + x.doc.title + ')' : ''));
          if (c.top && (at < 0 || at >= c.top)) res.problems.push('rank ' + (at < 0 ? 'absent' : at + 1) + ', want top ' + c.top);
          if (c.corrected !== undefined) {
            const got = (r.corrections || []).map((x) => x.to);
            if (c.corrected === null ? got.length : got[0] !== c.corrected) res.problems.push('corrected to ' + JSON.stringify(got) + ', want ' + JSON.stringify(c.corrected));
          }
          if (c.places) {
            const hit = at >= 0 ? results[at] : null;
            const n = hit ? E.findPlaces(hit.doc.text || '', cardTerms(r, hit), 120).length : 0;
            res.places = n;
            if (n < c.places.minimum) res.problems.push('places ' + n + ', want at least ' + c.places.minimum);
          }
        }
      } catch (e) {
        res.problems.push('threw ' + String(e));
      }
      out.push(res);
    }
    return out;
  }, CASES);

  if (!outcomes.length) { console.log('[e2e-search] NOTHING-CHECKED: no cases ran'); failed = 1; }
  for (const o of outcomes) {
    if (o.problems.length) {
      failed++;
      console.log('[e2e-search] FAIL ' + JSON.stringify(o.q) + ' (' + o.corpus + '): ' + o.problems.join('; ') + (o.top3 ? '  | top: ' + o.top3.join(' / ') : ''));
    } else if (VERBOSE) {
      console.log('[e2e-search] ok   ' + JSON.stringify(o.q) + ' (' + o.corpus + ')' + (o.rank ? ' rank ' + o.rank : '') + (o.places != null ? ' places ' + o.places : ''));
    }
  }
  if (errors.length) { failed++; console.log('[e2e-search] FAIL page errors: ' + errors.join(' | ')); }
  const bad = outcomes.filter((o) => o.problems.length).length;
  console.log('[e2e-search] ' + (outcomes.length - bad) + '/' + outcomes.length + ' cases pass' + (failed ? ' — FAILED' : ' — OK'));
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
