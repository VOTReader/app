/* E2E proof of the read-detector chain in a COMPOSITING Chromium.
   ─────────────────────────────────────────────────────────────────
   WHY THIS EXISTS: the read tracker (use-read-tracker.js) measures real
   rendering geometry. jsdom has no layout, and a hidden/non-composited
   page (the in-app Browser pane, a backgrounded tab) delivers neither
   IntersectionObserver callbacks nor honest visibility — so the ONLY
   faithful verification of the full chain (genuine read → completion →
   count-valued readItems durable in IDB → ReadingStatsStore ledger/day
   bucket → partial-read frontier → frontier cleared on completion) is a
   headless-but-compositing browser. This drove out a P0 the fully-green
   unit suite could not see (vot-reading-stats missing from IDBAdapter →
   permanent 'degraded' hydration) on 2026-08-03.

   RUN (optional, ~40s):
     node tools/e2e-read-detector.mjs
   Expects "E2E PASS" on stdout; exits 1 otherwise. It serves the assets
   itself on an OS-assigned port, so nothing has to be started first and
   two runs cannot collide. The walk runs in its OWN browser context, so its
   storage starts empty and is discarded with the context — this harness
   never writes to, or deletes from, storage anything else can see.

   IT USED TO REQUIRE `python tools/preview-server.py 8097 ...` and hardcode
   http://127.0.0.1:8097. On 2026-09-04 four Envoys held servers on 8097 at
   once; Python's http.server sets allow_reuse_address, so every bind
   SUCCEEDED and which one answered a given connection was undefined. The
   gate reported PASS while serving another worktree's tree — proved by the
   served CACHE_VERSION not matching the tree under test, and by three of
   four request logs being completely empty during runs that "passed". A
   gate that can report green about a tree it never loaded is worse than a
   gate that flakes. Its two siblings each bind their own ephemeral port
   (e2e-readalong.mjs:122, smoke-ci.js); this one took the convention and
   not the design. Never reintroduce a fixed port here.

   The port fix makes a collision impossible; it does not make the run PROVE
   it loaded the right tree. So before the first navigation the harness now
   asserts that the CACHE_VERSION in the service-worker.js it is serving
   equals the one on disk here (tools/e2e-read-serve.mjs). Every build
   regenerates that string, so it is the cheapest honest fingerprint of
   "these are my bundles", and a mismatch aborts loudly rather than producing
   a green result about somebody else's work.
   ─────────────────────────────────────────────────────────────────── */
/* WHY THERE IS NO STATE-CLEARING STEP HERE, AND WHAT USED TO BE.
   ─────────────────────────────────────────────────────────────────
   Until 2026-09-04 this file made its own fresh state, right after the app
   first mounted:

     await page.evaluate(async () => {
       localStorage.clear();
       await new Promise((res) => {
         const rq = indexedDB.deleteDatabase('votreader');
         rq.onsuccess = rq.onerror = rq.onblocked = res;
       });
       location.reload();
     });

   Its purpose was determinism: the walk asserts COUNTS — readItems === 1,
   completions === 1, a frontier that exists and then does not — and every one
   of those is wrong if a previous run's data is still in the origin. The step
   was load-bearing, not hygiene.

   It was also the `e2e:read` hang, measured and root-caused by the Verifier
   (sessions\2026-09-03-orchestrator\e2e-hang-experiment.md). One run in twenty
   died at the 240 s protocolTimeout with `ProtocolError: Runtime.callFunctionOn
   timed out`. A console-channel probe — a different CDP stream, delivered even
   when a call's reply is not — showed the function reaching `ls-cleared` and
   then nothing, ever: `indexedDB.deleteDatabase('votreader')` fired **no
   success, no error and no blocked**. Confirmed from a second CDP session
   mid-hang, where a brand-new delete also settled nothing in six seconds while
   the same page answered an evaluate in 2 ms. The database was simply
   un-deletable at that moment, because this harness was deleting the app's live
   database out from under a page that was still booting and reopening it for
   every store write.

   `rq.onsuccess = rq.onerror = rq.onblocked = res;` reads as exhaustive — three
   handlers, every outcome covered. The real failure is NO OUTCOME AT ALL.

   So the determinism now comes from isolation instead of deletion: each run
   gets its own browser context, which is a separate storage partition, so
   there is nothing to clear and nothing that can refuse to be cleared. The
   walk still starts at onboarding, which is what a fresh profile looks like
   and what the /Continue/ + /Begin Reading/ clicks below already expect.

   TWO THINGS NOT TO DO HERE:
   - Do not bound that promise with a timeout instead. It converts a 240 s
     hang into a run that proceeds with DIRTY state, and the walk's assertions
     are counts in that very database — a quiet wrong answer in place of a
     loud one.
   - Do not reintroduce a storage-clearing evaluate "just in case". A context
     that needs clearing is not isolated, and the clearing is the thing that
     hangs.

   `location.reload()` went with the block. The Verifier's phase B established
   it was NOT the cause of the hang (removed, still hung twice), so it is not
   being sold as part of the fix; it existed only to re-boot the app after the
   wipe, and with nothing wiped there is nothing to re-boot.
   ─────────────────────────────────────────────────────────────────── */
import puppeteer from 'puppeteer';
import { serveOwnTree } from './e2e-read-serve.mjs';

// ONE origin, and this file does not build it. serveOwnTree() binds the port,
// proves the bytes it is serving are this tree's, and hands back the URL --
// so there is no second place an origin can come from, and no way to keep the
// server while navigating somewhere else. That combination passed the harness
// test 3/3 when it was possible; it is not possible now.
const { server, url: URL } = await serveOwnTree();
// Say what was served. serveOwnTree() has already proved these bytes are this
// tree's, but a run whose log does not name its own origin is the shape that
// let four worktrees share port 8097 and still print PASS.
console.log('[e2e-read] serving', URL);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  // The walk is 31-39 s, quiet machine or busy. This ceiling exists so a hang
  // surfaces in minutes instead of hanging the run -- NOT as headroom for a slow
  // CDP call on a loaded machine.
  //
  // The comment that used to sit here said the opposite: that the 191 s
  // 'ProtocolError: Runtime.callFunctionOn timed out' was a loaded shared runner
  // 'with no real failure behind it'. Measured 2026-09-04, over 17 runs on a
  // known base: passes cluster at 30-39 s and failures land at 241 s and 244 s --
  // ON the ceiling, which contention cannot produce -- and runs at 100%, 100% and
  // 87% CPU all passed while an 18% CPU run failed. It is a hang. Load does not
  // predict it.
  //
  // WHICH CDP call hung is now KNOWN, and this paragraph used to say it was not.
  // It was the awaited state-clearing evaluate, and it hung because
  // `indexedDB.deleteDatabase('votreader')` fired none of its three events --
  // not success, not error, not blocked -- so `awaitPromise: true` correctly
  // never returned. That block is gone; the walk gets a fresh browser context
  // instead (see the note above the launch). Full record in
  // sessions\2026-09-03-orchestrator\e2e-hang-experiment.md.
  //
  // Two things from that investigation are worth keeping even though the cause
  // is settled, because both are general and both cost someone an afternoon:
  // a `waitForFunction` option timeout bounds its POLLING LOOP, not the
  // individual Runtime.callFunctionOn round-trip inside it, so `{ timeout:
  // 30000 }` on a call does NOT exclude it as a 240 s culprit; and a guard that
  // enumerates the ways an operation can finish is no guard at all against its
  // not finishing.
  //
  // THIS CEILING STAYS, and not because the known hang might come back. It is
  // the only thing that turns any future orphaned CDP call into a bounded
  // failure with a stack instead of a wedged run.
  //
  // What IS settled, and the reason to leave this number alone: raising a ceiling
  // cannot help a hang. The response is not late, it is never coming. Raise it and
  // you buy a longer wait for the same failure while hiding the shape that
  // identifies it. smoke-ci.js:157 already says this ('a hang consumes whatever
  // timeout it's given (600s was hit too)') and pairs its ceiling with a retry
  // loop. If this fires, look for an orphaned CDP call -- not at the machine.
  protocolTimeout: 240000,
});
/* An isolated storage partition per run. `browser.newPage()` would share the
   default context's origin storage with anything else this browser opens, and
   with whatever a previous run left there. */
const context = await browser.createBrowserContext();
try {
  const page = await context.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const r = document.getElementById('root');
    return !!r && r.children.length > 0;
  }, { timeout: 30000 });

  /* A CLICK THAT FINDS NOTHING IS AN ERROR, NOT A `false`.
     This returned true/false and every one of its five call sites discarded
     it, so a click that matched no button was completely silent and surfaced
     many steps later as `opened: null` with no cause to read. One guard here
     covers all five sites: it throws, and it names the pattern it looked for. */
  const clickText = async (re) => {
    const hit = await page.evaluate((reSrc) => {
      const re2 = new RegExp(reSrc);
      const el = [...document.querySelectorAll('button,[role=button],[class*=tile],[class*=card],[class*=row]')]
        .find((b) => re2.test(b.textContent) && b.textContent.length < 120);
      if (el) { el.click(); return true; }
      return false;
    }, re.source);
    if (!hit) throw new Error(`walk found nothing to click matching /${re.source}/`);
    return true;
  };

  /* WAIT FOR THE SCREEN, NEVER FOR A DURATION.
     ─────────────────────────────────────────────────────────────────
     These four steps used to be `click(); await sleep(N)`, tuned on this
     machine — and they were carrying slack that did not belong to them. The
     reset block that used to sit above (localStorage.clear + deleteDatabase +
     location.reload + a 1500 ms sleep + a second #root wait) spent two to
     three seconds here for its own reasons, and the corpus landed inside it.
     Removing the reset removed that slack, and on GitHub's ubuntu-latest
     runner 900 ms after "Volume One" was not enough for the index to render:
     `opened: null`, then `segs: 0`, then `preface not marked read=1: {}`.
     Twenty local runs never showed it. (Run 33942768839.)

     A sleep long enough for the slowest runner is a sleep wasted on every
     other one, and it silently becomes too short again the next time
     something upstream changes. So each step now waits for the thing the NEXT
     step needs, with a bounded timeout that fails loudly and names the step. */
  const waitForScreen = async (label, fn, ...args) => {
    try { await page.waitForFunction(fn, { timeout: 30000 }, ...args); }
    catch (e) { throw new Error(`walk stalled waiting for ${label}: ${(e && e.message) || e}`); }
  };
  const HAS_TEXT = (src) => {
    const rx = new RegExp(src);
    return [...document.querySelectorAll('button,[role=button],[class*=tile],[class*=card],[class*=row]')]
      .some((b) => rx.test(b.textContent) && b.textContent.length < 120);
  };

  /* ONE PATTERN PER STEP, for the wait AND the click.
     ─────────────────────────────────────────────────────────────────
     Waiting for the button you are about to click is only worth something if
     both halves look for the SAME thing. When they were written separately
     they drifted, silently. The wait took a JS STRING, and in a string `\d` is
     just `d` — so `waitForScreen('the volumes screen', HAS_TEXT, 'Volume One(?!\d)')`
     built /Volume One(?!d)/ while the click beneath it used /Volume One(?!\d)/. A wait that can be satisfied by something the
     click then rejects is a wait that resolved for the wrong reason — the same
     class as the silent `clickText` boolean above, where the step could not
     say where it went wrong.

     `re.source` is what HAS_TEXT needs and it comes from the one regex, so
     there is no second spelling to keep in step. `between` exists for the one
     step that has to warm the corpus after the screen renders and before the
     click; it is not a hook looking for a use. */
  const waitThenClick = async (label, re, between) => {
    await waitForScreen(label, HAS_TEXT, re.source);
    if (between) await between();
    await clickText(re);
  };

  // Onboarding (fresh profile) → Home → Prophetic Letters → Volume One.
  //
  // The #root wait above proves only that SOMETHING rendered. On ubuntu-latest
  // that is not yet the About screen, so this click fired into a page with no
  // button, returned false into a void, and the walk then spent 30 s waiting
  // for "Begin Reading" while page 1 sat there showing "Continue" — run
  // 33945493524, green on this machine and on the pre-rebase base. Every step
  // below waits for the button it is about to click; this one now does too.
  await waitThenClick('the onboarding Continue button', /Continue/);
  await waitThenClick('the Begin Reading button', /Begin Reading/);
  await waitThenClick('Home', /Prophetic Letters/);
  await waitThenClick('the volumes screen', /Volume One(?!\d)/, () => page.evaluate(
    () => { if (typeof window.__loadVotCorpus === 'function') window.__loadVotCorpus(); },
  ));
  // The one that failed on the runner: the index rows are what `opened` below
  // clicks, so wait for THEM rather than for a plausible number of milliseconds.
  await waitForScreen('the Volume One index rows', () => [...document.querySelectorAll(
    '.vol-index button, .vol-index [role=button], .vol-index li, .vol-index [class*=row]',
  )].some((b) => b.querySelector('.idx-min-chip')));

  // Open the preface (first chip row).
  const opened = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.vol-index button, .vol-index [role=button], .vol-index li, .vol-index [class*=row]')].filter((b) => b.querySelector('.idx-min-chip') && !b.querySelector('[class*=row] [class*=row]'));
    if (!rows.length) return null;
    rows[0].click();
    return rows[0].textContent.trim().slice(0, 40);
  });
  console.log('opened:', opened);
  await sleep(800);

  const meta = await page.evaluate(() => ({
    segs: document.querySelectorAll('[data-hl-key]').length,
    bridge: typeof window.__onReadingComplete,
    key: window.__readTrackerMeta && window.__readTrackerMeta.key,
    vis: document.visibilityState,
  }));
  console.log('armed:', JSON.stringify(meta));

  // GENUINE READ: dwell at top, then step through with pauses (each step
  // holds segments visible >800ms; total dwell exceeds words*100ms).
  const scrollStep = async (top) => page.evaluate((t) => {
    const sc = [...document.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 100 && e.clientHeight > 300);
    if (sc) sc.scrollTop = t;
    return sc ? sc.scrollHeight : -1;
  }, top);
  await sleep(3500);
  await scrollStep(450); await sleep(3000);
  await scrollStep(900); await sleep(3000);
  await scrollStep(1400); await sleep(4000);

  const result1 = await page.evaluate(async () => {
    // readItems lives in the IDB vot-state record (LS holds only the boot shim).
    const st = await new Promise((res) => {
      const rq = indexedDB.open('votreader');
      rq.onsuccess = () => {
        const db = rq.result;
        try {
          const tx = db.transaction(['vot-state'], 'readonly');
          const g = tx.objectStore('vot-state').getAll();
          g.onsuccess = () => { db.close(); const all = g.result || []; const merged = Object.assign({}, ...all.map((r) => (r && r.value) ? { [r.key || r.id]: r.value } : r)); res(merged); };
          g.onerror = () => { db.close(); res({}); };
        } catch (e) { db.close(); res({ err: String(e) }); }
      };
      rq.onerror = () => res({});
    });
    const s = (typeof ReadingStatsStore !== 'undefined') ? ReadingStatsStore.get() : null;
    return {
      readItems: st.readItems || (st['vot-state'] && st['vot-state'].readItems) || null, stKeys: Object.keys(st).slice(0,8),
      words: s && s.totalWordsRead, completions: s && s.totalCompletions,
      activeMs: s && s.totalActiveMs, days: s && s.wordsByDay,
      progressKeys: s ? Object.keys(s.progress || {}) : null,
    };
  });
  console.log('AFTER FULL READ:', JSON.stringify(result1));

  // PARTIAL READ: back to the index, open a multi-block letter, read only
  // the top, flick to the bottom for less than the 800ms credit floor, then
  // navigate away. The honest reading frontier says "first unread block"
  // while the saved scroll position says "bottom" — reopening must land at
  // the SAVED POSITION (the frontier jump was retired 2026-08-04); the
  // frontier data itself must still be recorded.
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /back/i.test(x.getAttribute('aria-label') || '')); if (b) b.click(); });
  await sleep(900);
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.vol-index button, .vol-index [role=button], .vol-index li, .vol-index [class*=row]')].filter((b) => b.querySelector('.idx-min-chip') && !b.querySelector('[class*=row] [class*=row]'));
    if (rows[3]) rows[3].click();
  });
  await sleep(600);
  const key2 = await page.evaluate(() => window.__readTrackerMeta && window.__readTrackerMeta.key);
  await sleep(3000);  // read only the visible top — partial
  await scrollStep(1000000);
  await sleep(100);   // too brief to credit the bottom, but scroll memory sees it
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /back/i.test(x.getAttribute('aria-label') || '')); if (b) b.click(); });
  await sleep(1200);

  const result2 = await page.evaluate(() => {
    const s = ReadingStatsStore.get();
    return { progress: s.progress || {} };
  });
  console.log('AFTER PARTIAL READ:', JSON.stringify({ key2, progressKeys: Object.keys(result2.progress), entry: result2.progress[key2] }));
  const partialEntry = result2.progress[key2];
  const partialCredited = new Set((partialEntry && partialEntry.c) || []);
  let expectedUnread = null;
  if (partialEntry) {
    for (let i = 0; i < partialEntry.b; i++) {
      if (!partialCredited.has(i)) { expectedUnread = i; break; }
    }
  }

  // Reopen that same letter. Scroll memory restores the bottom and NOTHING
  // moves it afterwards.
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.vol-index button, .vol-index [role=button], .vol-index li, .vol-index [class*=row]')].filter((b) => b.querySelector('.idx-min-chip') && !b.querySelector('[class*=row] [class*=row]'));
    if (rows[3]) rows[3].click();
  });
  await sleep(2200);
  const resume = await page.evaluate((key, expected) => {
    const sc = document.querySelector('.screen-layout > .pager-viewport > .screen-scroll');
    const cands = sc ? [...sc.querySelectorAll('[data-hl-key]')].filter((el) => !el.parentElement?.closest('[data-hl-key]')) : [];
    const blocks = cands.length;
    const firstUnread = ReadingStatsStore.firstUnreadIndex(key, blocks);
    const target = expected != null && cands[expected] && sc
      ? (cands[expected].getBoundingClientRect().top - sc.getBoundingClientRect().top) + sc.scrollTop
      : -1;
    return {
      keyNow: window.__readTrackerMeta && window.__readTrackerMeta.key,
      blocks,
      firstUnread,
      expectedUnread: expected,
      progress: ReadingStatsStore.getProgress(key),
      scrollTop: sc ? sc.scrollTop : -1,
      maxTop: sc ? sc.scrollHeight - sc.clientHeight : -1,
      viewport: sc ? sc.clientHeight : -1,
      target,
    };
  }, key2, expectedUnread);
  console.log('AFTER REOPEN (scroll-position resume):', JSON.stringify(resume));

  // Assertions
  const fails = [];
  if (!result1.readItems || result1.readItems['v1:volume-one:a-word-of-warning'] !== 1) fails.push('preface not marked read=1: ' + JSON.stringify(result1.readItems));
  if (!(result1.words > 50)) fails.push('totalWordsRead not recorded: ' + result1.words);
  if (result1.completions !== 1) fails.push('completions != 1: ' + result1.completions);
  if (!result2.progress[key2] || !result2.progress[key2].c || result2.progress[key2].c.length < 1) fails.push('no frontier recorded for partial read of ' + key2);
  if (result2.progress[key2] && result2.progress[key2].c.length >= result2.progress[key2].b) fails.push('partial fixture credited every block; resume frontier is useless');
  if (result2.progress[key2] && !(result2.progress[key2].w < result2.progress[key2].tw)) fails.push('word-weighted partial progress missing: ' + JSON.stringify(result2.progress[key2]));
  if (!(resume.firstUnread > 0)) fails.push('no useful first-unread index after reopen: ' + JSON.stringify(resume));
  // target === -1 means the expected block (or the scroller) could not be
  // located — that must FAIL loudly, not degrade into a vacuous pass.
  if (resume.target < 0) fails.push('frontier target block not locatable (selector/expectedUnread broke): ' + JSON.stringify(resume));
  // Non-vacuity: the saved bottom and the frontier block must be MORE than a
  // viewport apart, or "landed at the saved position" proves nothing.
  else if (!(resume.maxTop > resume.viewport && Math.abs(resume.maxTop - resume.target) > resume.viewport)) fails.push('fixture too short to distinguish scroll-restore from a frontier jump: ' + JSON.stringify(resume));
  else if (!(Math.abs(resume.scrollTop - resume.maxTop) <= resume.viewport)) fails.push('reopen did not resume at the SAVED scroll position (frontier jump back?): ' + JSON.stringify(resume));
  if (result2.progress['v1:volume-one:a-word-of-warning']) fails.push('completed item still has a frontier (should be cleared)');

  if (fails.length) { console.error('E2E FAIL:\n  ' + fails.join('\n  ')); process.exitCode = 1; }
  else console.log('E2E PASS — completion, ledger, day bucket, frontier, frontier-clear all verified in a real compositing Chromium.');
} finally {
  // The context goes first: closing it discards this run's storage partition,
  // which is what makes the next run's counts trustworthy.
  await context.close();
  await browser.close();
  server.close();
}
