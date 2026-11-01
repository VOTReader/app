/* Page-side walker for tools/leak-walk.mjs (leak hunt, 2026-11-01).
   window.__walk.legs: one function per journey; each starts at Home, opens a screen
   (or a reader tab) the way a reader does, by clicking what is on screen, and goes
   back Home. cycle(name) runs one; it resolves true when every step found its target. */
(function () {
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function btns() { return [].slice.call(document.querySelectorAll('button,[role="button"],a,[role="tab"]')); }
  function click(re) {
    var el = btns().find(function (e) {
      if (e.closest('[inert],[aria-hidden="true"]')) return false;
      var t = (e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '') + ' ' + (e.title || '');
      return re.test(t) && (e.textContent || '').length < 120;
    });
    if (el) { el.click(); return true; } return false;
  }
  function onHome() { return btns().filter(function (b) { return /Prophetic Letters|Personal Study|The Holy Bible|Study Editions/.test(b.textContent || ''); }).length >= 2; }
  async function home() {
    for (var a = 0; a < 6; a++) {
      if (onHome()) return true;
      if (typeof window.__goHome === 'function') { window.__goHome(); await sleep(250); continue; }
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(250);
    }
    return onHome();
  }
  async function seq(steps) {
    if (!(await home())) return false;
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      if (typeof s === 'function') { var r = await s(); if (r === false) return false; }
      else if (!click(s)) { window.__walkMiss = String(s); return false; }
      await sleep(350);
    }
    await sleep(300);
    await home();
    await sleep(200);
    return true;
  }
  var legs = {};
  window.__walk = { legs: legs, home: home, click: click, sleep: sleep, seq: seq,
    cycle: async function (name) { try { return await legs[name](); } catch (e) { window.__walkErr = String(e); return false; } },
    texts: function () { return btns().map(function (b) { return (b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 60); }).filter(Boolean); } };
})();
(function () {
  var w = window.__walk, L = w.legs, S = w.seq;
  L.volumeLetter = function () { return S([/Prophetic Letters/, /^Volume One/, /A Word of Warning/]); };
  L.letterNext = function () { return S([/Prophetic Letters/, /^Volume Two/, /The Wide Path/, /Next Letter/]); };
  L.wtlb = function () { return S([/Prophetic Letters/, /Words To Live By: Part One/, /Introduction/]); };
  L.garden = function () { return S([/Prophetic Letters/, /A Return to The Garden/]); };
  L.bible = function () { return S([/The Holy Bible/, /^Gospels/, /ChaptersMark/, /^1The Baptism/]); };
  L.answers = function () { return S([/Topics & Doctrines/, /^Main Page/]); };
  L.studies = function () { return S([/Study Editions/, /Purity - Bible/, function () { return w.click(/^\s*1/) ; }]); };
  L.matthewStudy = function () { return S([/Study Editions/, /New Tes/, function () { return w.click(/^\s*1/); }]); };
  L.audioLib = function () { return S([/Audio Readings/, /♪The Volumes of Truth/]); };
  L.songs = function () { return S([/Sung by the Flock/]); };
  L.notes = function () { return S([/Personal Study/, /^Notes/]); };
  L.links = function () { return S([/Personal Study/, /^Links/]); };
  L.journal = function () { return S([/Personal Study/, /^Journal/]); };
  L.bookmarks = function () { return S([/Personal Study/, /^Bookmarks/]); };
  L.highlights = function () { return S([/Personal Study/, /^Highlights/]); };
  L.progress = function () { return S([/Personal Study/, /^Progress/]); };
  L.plans = function () { return S([/Personal Study/, /^Reading plans/]); };
  L.settings = function () { return S([/App Configuration/]); };
  L.history = function () { return S([/Recently Visited/]); };
  L.about = function () { return S([/About VOTReader/]); };
})();
(function () {
  var w = window.__walk, L = w.legs, S = w.seq;
  var all = function (re) { return [].slice.call(document.querySelectorAll('button')).filter(function (b) { return re.test(b.getAttribute('aria-label') || ''); }); };
  L.tabOpenClose = function () {
    return S([/^▢/, /New tab/, /Prophetic Letters/, /^Volume Three/, function () { var b = [].slice.call(document.querySelectorAll('button')).find(function (x) { return /~\d+ min/.test(x.textContent || ''); }); if (b) b.click(); return true; },
      /^▢/, function () { var c = all(/^Close tab:/); if (c.length < 2) return false; c[c.length - 1].click(); return true; }]);
  };
  var flip = 0;
  L.tabSwitch = async function () {
    // needs a second tab: make one once
    if (!(await w.home())) return false;
    w.click(/^▢/); await w.sleep(350);
    if (all(/^Switch to/).length < 2) { w.click(/New tab/); await w.sleep(350); w.click(/Prophetic Letters/); await w.sleep(350); w.click(/^Volume Two/); await w.sleep(350); w.click(/The Wide Path/); await w.sleep(400); w.click(/^▢/); await w.sleep(350); }
    var s = all(/^Switch to/); if (s.length < 2) return false;
    s[(flip++) % 2].click(); await w.sleep(500);
    return true;
  };
})();
