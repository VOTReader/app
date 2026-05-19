/* ═══════════════════════════════════════════════════════════════════════
   votSmoke — Phase-0 modularization safety net for VOTReader-studio
   ═══════════════════════════════════════════════════════════════════════
   This file is NOT loaded by the app (it lives in tools/, outside the
   shipped asset path). It is meant to be run IN the running app's page
   context — either:
     • Desktop:  preview_eval / DevTools console — paste the file, then
                 `votSmoke().then(r => console.log(JSON.stringify(r,null,2)))`
     • Android:  chrome://inspect → the WebView's console → same.

   WHY THIS EXISTS
   The codebase has no automated tests and no build step; modules are
   plain <script src> files sharing one global scope. The dominant
   regression when extracting code is therefore NOT logic bugs — it's:
     1. a module that fails to load / loads in the wrong order, so a
        global is `undefined` and the app white-screens, and
     2. a screen that silently stops rendering because a symbol moved.
   A globals audit + a screen-render walk catches ~all of that in
   seconds, deterministically, before it ships.

   CONTRACT
   votSmoke({ mutating=true, walk=true }) → Promise<report>
     report.ok           overall boolean (true = safe)
     report.summary      one-line pass/fail counts
     report.console      uncaught console.error strings seen during run
     report.globals      { missing:[...], presentCount, ok }
     report.dataWiring   COLLECTIONS → every collection's data resolves
     report.screens      [{ name, reached, crashed, detail }]
     report.annotation   round-trip result (marks render, no crash on
                          next/prev) — ALWAYS restores localStorage it
                          touched, even on failure.
   `mutating:false` skips the annotation round-trip (pure read-only).
   `walk:false` skips the UI screen walk (globals/console only — fast).

   IMPORTANT: the annotation check snapshots and restores vot-annotations
   / vot-notes within a single page session (no reload between seed and
   restore), so it never corrupts real user data. Do not add a reload to
   that section.
═══════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  // ── Expected top-level globals, grouped by module layer. Each name
  // here is a symbol the app cannot run without. If extraction drops or
  // mis-orders a module, the matching entry shows up in report.globals
  // .missing. Keep this list curated to TRUE globals (things inside
  // App()'s closure are intentionally excluded). ──────────────────────
  var EXPECTED_GLOBALS = {
    vendor: ['React', 'ReactDOM'],
    stores: [
      'CachedStore', 'AnnotationStore', 'NoteStore', 'LinkStore',
      'BookmarkStore', 'NotebookStore', 'RecentNavStore',
      'JournalStore', 'JournalStatsStore', 'JournalIndexStore',
      'JournalMediaStore'
    ],
    dataRegistry: ['COLLECTIONS', 'COL_BY_KEY', 'colLetterArr', 'colPreface'],
    scripture: [
      'parseRefStr', 'findBook', '_allBooks', '_matthew', '_studies',
      'parseScriptureRef', 'lookupVersesFromBooks', 'findEntryContext'
    ],
    renderers: [
      'applyDOMHighlights', 'applyNoteIcons', 'applyActiveNoteState',
      'applyDOMLinks', 'applyDOMBookmarks', 'snapRangeToWords',
      'findNoteIconInsertionPoint', '_fnTextRedundantWithLink',
      'StaticSubtree'
    ],
    components: [
      'App', 'ErrorBoundary', 'ScreenLayout', 'NavButtons', 'LibraryNav',
      'Segments', 'InAppLinkButton', 'FootnoteSheet', 'FootnoteListSection',
      'HighlightableText', 'LetterView', 'WtlbEntryView', 'BibleChapterView',
      'ChapterView', 'HomeScreen', 'LibraryScreen', 'NotesIndexScreen',
      'BookmarksScreen', 'HighlightsScreen', 'LinksScreen',
      'JournalHubScreen', 'JournalViewerScreen', 'JournalEditorScreen',
      'SettingsScreen', 'SearchScreen', 'HistoryScreen'
    ]
  };

  function now() { return (root.performance && performance.now()) || Date.now(); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // Resolve a symbol by BARE NAME, not window[name]. Classic-script
  // top-level `const`/`class`/`let` (e.g. AnnotationStore, COLLECTIONS,
  // StaticSubtree, ErrorBoundary) go into the global LEXICAL environment
  // — reachable by unqualified name across scripts, but NOT properties of
  // `window`. `function`/`var` decls AND extracted src/ modules (which
  // use `var X =`) are window-global. A direct eval sees both, so this
  // is the correct universal probe and it keeps working as inline consts
  // get extracted into src/ files.
  function resolve(name) {
    try { return eval('(typeof ' + name + ' !== "undefined") ? ' + name + ' : undefined'); }
    catch (e) { return undefined; }
  }
  function exists(name) {
    var v = resolve(name);
    return typeof v !== 'undefined' && v !== null;
  }

  function auditGlobals() {
    var missing = [];
    var present = 0;
    Object.keys(EXPECTED_GLOBALS).forEach(function (group) {
      EXPECTED_GLOBALS[group].forEach(function (name) {
        if (!exists(name)) missing.push(group + ':' + name);
        else present++;
      });
    });
    return { ok: missing.length === 0, missing: missing, presentCount: present };
  }

  // Validates the <script src> data wiring without hardcoding 15 data
  // global names: walk COLLECTIONS and confirm each collection's letters
  // (or preface) actually resolve to a non-empty array. A mis-ordered or
  // dropped data <script> shows up here as an empty/■ collection.
  function auditDataWiring() {
    var COLS = resolve('COLLECTIONS');
    if (!COLS) return { ok: false, detail: 'COLLECTIONS not resolvable' };
    var colLetterArr = resolve('colLetterArr');
    var colPreface = resolve('colPreface');
    var empty = [];
    try {
      COLS.forEach(function (col) {
        var arr = (typeof colLetterArr === 'function')
          ? colLetterArr(col) : (resolve(col.globalName) || []);
        var pref = (typeof colPreface === 'function') ? colPreface(col) : null;
        if ((!arr || arr.length === 0) && !pref) empty.push(col.volKey || col.label);
      });
    } catch (e) {
      return { ok: false, detail: 'threw: ' + (e && e.message) };
    }
    return { ok: empty.length === 0, emptyCollections: empty };
  }

  // CRASH detection MUST use innerText, never textContent: textContent of
  // <body> includes inline <script> SOURCE, and ErrorBoundary's code
  // literally contains the string "Something went wrong" — so textContent
  // matches on every screen (false positive). innerText is rendered text
  // only (scripts excluded), so it matches solely when the ErrorBoundary
  // UI is actually on screen.
  function isCrashed() {
    return /Something went wrong/i.test(document.body.innerText || '');
  }
  function appMounted() {
    var rootEl = document.getElementById('root');
    var crashed = isCrashed();
    return {
      ok: !!(rootEl && rootEl.children.length > 0) && !crashed,
      crashed: crashed,
      hasContent: !!(rootEl && rootEl.children.length > 0)
    };
  }

  // ── UI walk helpers ──────────────────────────────────────────────────
  function clickByText(re) {
    var els = [].slice.call(document.querySelectorAll('button,[role="button"],a'));
    var el = els.find(function (e) {
      var t = (e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '') +
              ' ' + (e.title || '');
      return re.test(t) && (e.textContent || '').length < 80;
    });
    if (el) { el.click(); return true; }
    return false;
  }
  function onHome() {
    // Home shows the main nav tiles. Detect via button TEXTCONTENT, not
    // body.innerText: the tile eyebrows ("Prophetic Letters", "Personal
    // Study") are CSS text-transform:uppercase, so innerText omits/alters
    // them while textContent keeps the raw string. Two+ distinct tiles
    // present ⇒ we're on the home grid (no other screen has them).
    var btns = [].slice.call(document.querySelectorAll('button,[role="button"]'));
    var hits = btns.filter(function (b) {
      return /Prophetic Letters|Personal Study|The Holy Bible|Study Editions/
        .test(b.textContent || '');
    }).length;
    return hits >= 2;
  }
  async function goHome() {
    for (var attempt = 0; attempt < 5; attempt++) {
      if (onHome()) return true;
      var btns = [].slice.call(document.querySelectorAll('button'));
      // Home affordance varies by screen: an icon button (title/aria
      // "Home") on reading screens, OR a text button "← Home" on index
      // screens (no title/aria). Match either; prefer an exact Home over
      // a generic back.
      var h = btns.find(function (b) {
        return /home/i.test((b.title || '') + ' ' + (b.getAttribute('aria-label') || '') +
          ' ' + (b.textContent || ''));
      });
      if (h) h.click();
      else {
        var back = btns.find(function (b) {
          return /back/i.test(b.getAttribute('aria-label') || '') ||
            (b.textContent || '').trim() === '‹' ||
            /^←/.test((b.textContent || '').trim());
        });
        if (back) back.click();
      }
      await sleep(300);
    }
    return onHome();
  }
  function screenState() {
    return {
      crashed: isCrashed(),
      heading: ((document.querySelector('h1,.letter-title,.notes-index-title,.jrn-hub-title') || {})
        .textContent || '').trim().slice(0, 50)
    };
  }

  // Each step: navigate from Home, assert no ErrorBoundary, record result.
  // Best-effort — distinguishes "couldn't find the entry point" (reached
  // =false) from "navigated but the screen crashed" (crashed=true), which
  // is the signal that matters for a modularization regression.
  async function walkScreens() {
    var out = [];
    // "reached" = we successfully navigated AWAY from home without
    // tripping the ErrorBoundary. This is robust: it relies on the
    // home-grid signal (button textContent, CSS-immune) and rendered
    // crash text, NOT brittle per-screen title regexes that broke on
    // CSS text-transform. A real modularization regression shows up as
    // crashed=true (screen threw) or reached=false (navigation no-op'd).
    async function step(name, fn) {
      var landed = await goHome();
      var detail = '';
      if (!landed) { out.push({ name: name, reached: false, crashed: false, detail: 'could not return home' }); return; }
      try { await fn(); } catch (e) { detail = 'threw:' + (e && e.message); }
      await sleep(300);
      var st = screenState();
      var reached = !onHome() && !st.crashed && !detail;
      out.push({ name: name, reached: reached, crashed: st.crashed,
        detail: detail || st.heading });
      if (st.crashed) await goHome();
    }
    async function lib(tileRe) {
      clickByText(/Personal Study|Library/); await sleep(320);
      clickByText(tileRe); await sleep(340);
    }

    await step('Volumes index', async function () {
      return clickByText(/Prophetic Letters/);
    });
    await step('Volume letter', async function () {
      clickByText(/Prophetic Letters/); await sleep(320);
      clickByText(/^Volume One/); await sleep(320);
      clickByText(/A Word of Warning|Chosen by God/); await sleep(200);
      return /letter-body|letter-para|letter-intro/.test(document.body.innerHTML);
    });
    await step('Scriptures browser', async function () {
      clickByText(/Holy Bible|The Scriptures/); await sleep(320);
      return /Scriptures of Truth|Genesis|Old Testament/.test(document.body.textContent || '');
    });
    await step('Studies browser', async function () {
      clickByText(/Study Editions|Studies/); await sleep(320);
      return /Matthew|Studies/.test(document.body.textContent || '');
    });
    await step('Search', async function () {
      clickByText(/^Search$|Search/); await sleep(300);
      return !!document.querySelector('input[type="search"],.search-screen,[class*="search"]');
    });
    await step('Library hub', async function () {
      clickByText(/Personal Study|Library/); await sleep(320);
      return /My Notes|My Bookmarks|My Journal/.test(document.body.textContent || '');
    });
    await step('Library → Notes', async function () { return lib(/My Notes/, /My Notes/); });
    await step('Library → Bookmarks', async function () { return lib(/My Bookmarks/, /My Bookmarks/); });
    await step('Library → Highlights', async function () { return lib(/My Marks|Highlights/, /Highlight|Underline/); });
    await step('Library → Links', async function () { return lib(/My Links/, /Link/); });
    await step('Library → Journal', async function () { return lib(/My Journal/, /Journal/); });
    await step('Settings', async function () {
      clickByText(/App Configuration|^Settings/); await sleep(360);
      return /TEXT & TRANSLATION|READING EXPERIENCE|Your Data/.test(document.body.textContent || '');
    });
    await goHome();
    return out;
  }

  // ── Annotation round-trip. Snapshots the two keys it touches, seeds a
  // heavily-overlapping set on one letter, navigates there, asserts marks
  // + icon render and that next→prev does not trip the ErrorBoundary
  // (the exact class of bug fixed in commit 2db70f5), then ALWAYS
  // restores the snapshot. No reload — snapshot lives in a closure var. ─
  async function annotationRoundTrip() {
    var KEYS = ['vot-annotations', 'vot-notes'];
    var snap = {};
    KEYS.forEach(function (k) { snap[k] = localStorage.getItem(k); });
    function bustCaches() {
      // Stores are global-lexical consts, not window props — resolve by
      // bare name so the seeded localStorage is actually re-read.
      ['AnnotationStore', 'NoteStore'].forEach(function (s) {
        var store = resolve(s);
        if (store && '_cache' in store) store._cache = null;
      });
    }
    function restore() {
      KEYS.forEach(function (k) {
        if (snap[k] === null) localStorage.removeItem(k);
        else localStorage.setItem(k, snap[k]);
      });
      bustCaches();
    }
    try {
      var lid = 'a-word-of-warning';
      var ann = {}, notes = {};
      for (var b = 0; b < 4; b++) {
        var key = 'letter:' + lid + ':' + b, arr = [];
        for (var i = 0; i < 10; i++) {
          var gid = 'smoke_' + b + '_' + i;
          var kind = i % 3 === 0 ? 'note' : (i % 3 === 1 ? 'highlight' : 'underline');
          arr.push({ id: gid, groupId: gid, kind: kind, color: 'yellow',
            start: i * 3, end: i * 3 + 14, text: 'x',
            created: Date.now(), updated: Date.now() });
          if (kind === 'note') notes[gid] = { groupId: gid, notebookIds: [],
            body: 'n', color: 'yellow', fullText: 'x', keys: [key],
            created: Date.now(), updated: Date.now() };
        }
        ann[key] = arr;
      }
      localStorage.setItem('vot-annotations', JSON.stringify(ann));
      localStorage.setItem('vot-notes', JSON.stringify(notes));
      bustCaches();

      await goHome(); await sleep(280);
      clickByText(/Prophetic Letters/); await sleep(320);
      clickByText(/^Volume One/); await sleep(320);
      clickByText(/A Word of Warning/); await sleep(600);

      var afterOpen = {
        crashed: isCrashed(),
        marks: document.querySelectorAll('mark.hl-mark').length,
        noteIcons: document.querySelectorAll('.hl-note-icon').length
      };
      // next → prev (the historical crash/corruption path)
      function arrow(dir) {
        var bb = [].slice.call(document.querySelectorAll(
          'button.nav-arrow-btn,button.chapter-nav-sticky-arrow'))
          .find(function (x) {
            return (x.getAttribute('aria-label') || '') ===
              (dir === 'next' ? 'Next letter' : 'Previous letter');
          });
        if (bb) bb.click();
      }
      arrow('next'); await sleep(550);
      arrow('prev'); await sleep(650);
      var afterNav = {
        crashed: isCrashed(),
        marks: document.querySelectorAll('mark.hl-mark').length
      };
      restore();
      return {
        ok: !afterOpen.crashed && !afterNav.crashed &&
            afterOpen.marks > 0 && afterNav.marks > 0,
        afterOpen: afterOpen, afterNav: afterNav, restored: true
      };
    } catch (e) {
      restore();
      return { ok: false, error: (e && e.message) || String(e), restored: true };
    }
  }

  // ── Orchestrator ─────────────────────────────────────────────────────
  root.votSmoke = async function votSmoke(opts) {
    opts = opts || {};
    var mutating = opts.mutating !== false;
    var walk = opts.walk !== false;
    var t0 = now();

    // Capture uncaught console.error for the duration of the run.
    var errs = [];
    var realErr = console.error;
    console.error = function () {
      try { errs.push([].slice.call(arguments).map(String).join(' ').slice(0, 200)); }
      catch (e) {}
      return realErr.apply(console, arguments);
    };

    var report = { startedAt: new Date().toISOString() };
    try {
      report.appMounted = appMounted();
      report.globals = auditGlobals();
      report.dataWiring = auditDataWiring();
      report.screens = walk ? await walkScreens() : 'skipped';
      report.annotation = mutating ? await annotationRoundTrip() : 'skipped';
    } finally {
      console.error = realErr;
    }
    report.console = { errorsSeen: errs.length, samples: errs.slice(0, 8) };

    var screenFails = walk
      ? report.screens.filter(function (s) { return s.crashed; }).length : 0;
    var screenUnreached = walk
      ? report.screens.filter(function (s) { return !s.reached && !s.crashed; }).length : 0;
    report.ok =
      report.appMounted.ok &&
      report.globals.ok &&
      report.dataWiring.ok &&
      screenFails === 0 &&
      (report.annotation === 'skipped' || report.annotation.ok) &&
      report.console.errorsSeen === 0;
    report.summary =
      (report.ok ? 'PASS' : 'FAIL') +
      ' | globals ' + (report.globals.ok ? 'ok' : report.globals.missing.length + ' missing') +
      ' | data ' + (report.dataWiring.ok ? 'ok' : 'EMPTY:' + (report.dataWiring.emptyCollections || []).join(',')) +
      ' | screens ' + (walk ? (screenFails + ' crashed, ' + screenUnreached + ' unreached') : 'skipped') +
      ' | annotation ' + (report.annotation === 'skipped' ? 'skipped' : (report.annotation.ok ? 'ok' : 'FAIL')) +
      ' | console.error ' + report.console.errorsSeen +
      ' | ' + Math.round(now() - t0) + 'ms';
    return report;
  };

  if (typeof console !== 'undefined') {
    console.log('[votSmoke] loaded — run: votSmoke().then(r=>console.log(JSON.stringify(r,null,2)))');
  }
})(typeof window !== 'undefined' ? window : this);
