/* ═══════════════════════════════════════════════════════════════════════
   useReadTracker — the multi-vector "did they actually read it" detector
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into bundle-b via _entry-b.js; called from
   ScreenLayout (Cluster D) as a bare global, once per screen instance.

   REPLACES the old ScreenLayout trigger (scroll ≥90% toward the sentinel
   → fire), which had two structural holes the owner hit:
     - no time vector at all — a one-second flick to the bottom marked a
       5,000-word letter read;
     - it lived inside an onScroll handler, so content that FITS the
       viewport (most WTLB entries) never fired a scroll event and could
       never auto-mark. It was also accidentally coupled to the
       progress-bar setting (the effect bailed on !showProgress).

   THREE VECTORS, ONE DECISION:
     1. COVERAGE — per-segment exposure, keyed by the [data-hl-key] value
        every reading view already stamps on its text blocks (the same
        selector measureWordsPerLine trusts). A segment credits after
        ~800 ms of CONTINUOUS meaningful visibility, so a fast flick past
        a segment credits nothing. Content that fits the viewport starts
        at 100% coverage by itself — exactly right; time alone gates it.
     2. ACTIVE TIME — visibility-honest wall time on the screen. The
        sweep only accrues while the document is visible, and a tick
        delta is capped so a throttled background timer can't bank hours.
     3. EXPECTED TIME — required dwell scales with the content:
        clamp(words × 100 ms  [= words ÷ 600 wpm], 8 s, 300 s).

     READ  ⇔  coverage ≥ 90% (by words)  AND  activeMs ≥ required.

   GEOMETRY SWEEP, NOT IntersectionObserver (adversarial review
   2026-08-03, three independent lenses): IO with practical thresholds
   structurally cannot credit a block taller than ~2 viewports — after
   the ratio-0 crossing no further callback fires while the block fills
   the screen, so long poetry blocks (and everything at Text Size 300%)
   never credit. And IO holds element references, so a mid-visit DOM
   swap (the BibleChapterView headings toggle re-renders every verse
   under the SAME placeKey) silently detached the whole observation set.
   Instead, each 500 ms sweep re-queries the candidates and measures
   getBoundingClientRect against the live root rect — one batched
   read-only layout pass per armed sweep (07-28 responsiveness
   discipline: batched at 2 Hz on reading screens only, never per
   frame). Credit state lives in a Map keyed by the hl-key STRING, so
   re-rendered DOM (headings toggle, late-settling corpus mounts)
   keeps its credit and newly-mounted blocks join the denominator
   automatically. Word counts are computed once per key and cached.

   On completion it fires window.__onReadingComplete(payload) — the
   same bridge the old trigger used (per-view inert-clone guards keep
   working) — with { words, activeMs, coverage }, at most once per
   screen visit (placeKey). useReadProgress.markRead turns that payload
   into the ledger increment + ReadingStatsStore completion record.

   PACE SAMPLING happens at VISIT END, not at the completion instant:
   completion fires the moment activeMs crosses the required floor, so
   a completion-time sample is biased toward exactly the 600-wpm
   ceiling on every fits-viewport page. The cleanup reports the FINAL
   activeMs via ReadingStatsStore.recordPaceSample, which also rejects
   sessions that ended at the minimum (walk-away noise).

   FRONTIER REPORTING: while a read is in progress, credited segment
   indices (document order) flow throttled into
   ReadingStatsStore.recordProgress under window.__readTrackerMeta.key
   (set by useMarkAsRead; snapshotted locally so cleanup ordering can't
   lose the final flush). That data powers resume-at-first-unread-
   paragraph — and, later, the held per-letter skim indicator.

   The walk-away edge (screen left open on a fits-viewport page)
   credits the LEDGER by design — adjudicated with the owner
   2026-08-03: acceptable noise on a personal device; the pace-sample
   boundary guard keeps such sessions out of the wpm evidence.
   ═══════════════════════════════════════════════════════════════════════ */

import { countTextWords } from '../utils/word-count.js';

// Tunables — one place, documented above.
var SEGMENT_CREDIT_MS = 800;      // continuous meaningful visibility to credit
var SWEEP_MS = 500;               // sweep cadence (single interval per screen)
var TICK_CAP_MS = 2000;           // max active-time credit per sweep tick
var COVERAGE_REQUIRED = 0.9;      // by words
var MS_PER_WORD = 100;            // 600 wpm reading ceiling
var REQUIRED_FLOOR_MS = 8000;
var REQUIRED_CAP_MS = 300000;
var PROGRESS_REPORT_MS = 5000;    // frontier flush cadence while reading
// A segment is "meaningfully visible" when half of it is on screen, or —
// for blocks taller than the viewport — when it fills most of the viewport.
var RATIO_CREDIT = 0.5;
var TALL_FILL_RATIO = 0.6;

/**
 * @typedef {{ words: number, visibleSince: number | null, credited: boolean }} SegState
 */

/** Bare-global, typeof-guarded store calls (cluster-B idiom). */
function _reportProgress(key, blocks, credited, segmentWords) {
  if (typeof ReadingStatsStore !== 'undefined' && ReadingStatsStore) {
    try { ReadingStatsStore.recordProgress(key, blocks, credited, segmentWords); }
    catch (e) { console.warn('read-tracker progress report failed', e); }
  }
}
function _reportPace(words, activeMs, requiredMs) {
  if (typeof ReadingStatsStore !== 'undefined' && ReadingStatsStore) {
    try { ReadingStatsStore.recordPaceSample({ words: words, activeMs: activeMs, requiredMs: requiredMs }); }
    catch (e) { console.warn('read-tracker pace report failed', e); }
  }
}

/**
 * The detector. Mounted by ScreenLayout on every screen; it self-arms
 * only while a reading view holds the __onReadingComplete bridge, so on
 * every other screen the sweep is a single property check per 500 ms.
 *
 * @param {{ current: Element | null }} scrollRef  the screen's scroll container
 * @param {boolean} inert     peek clones never track
 * @param {string} placeKey   identity of the screen visit; change = reset
 * @returns {void}
 */
export function useReadTracker(scrollRef, inert, placeKey) {
  React.useEffect(() => {
    if (inert) return undefined;

    /** @type {Map<string, SegState>} state per hl-key, stable across re-renders */
    var byKey = new Map();
    var totalWords = 0;       // sum over every key ever seen this visit
    var creditedWords = 0;
    var requiredMs = 0;
    var completedFired = false;
    var activeMs = 0;
    var lastTick = /** @type {number | null} */ (null);
    var lastReportAt = 0;
    var reportedCount = 0;
    var frontierDone = false;
    var frontierAttempts = 0;
    var frontierBaseTop = /** @type {number | null} */ (null);
    var trackKeySnapshot = /** @type {string | null} */ (null);

    // Current candidates in document order, excluding [inert] subtrees
    // (portaled peek clones must never contribute). Falls back to the
    // whole container as one segment for any future view shape.
    var candidates = function(root) {
      var nodes = root.querySelectorAll('[data-hl-key]');
      /** @type {Array<{ el: Element, key: string }>} */
      var out = [];
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].closest && nodes[i].closest('[inert]')) continue;
        // Annotation/bookmark icons can repeat their owner's data-hl-key.
        // Only the outermost key-bearing node is reading content; nested
        // chrome would otherwise change block indices as marks come and go.
        var parent = nodes[i].parentElement && nodes[i].parentElement.closest('[data-hl-key]');
        if (parent) continue;
        out.push({ el: nodes[i], key: String(nodes[i].getAttribute('data-hl-key')) });
      }
      if (out.length === 0 && countTextWords(root.textContent) > 0) {
        out.push({ el: root, key: '__root' });
      }
      return out;
    };

    // ── Frontier resume (owner-directed 2026-08-03): smarter than scroll-
    // position resume. If a PREVIOUS visit left a frontier (first segment
    // never actually READ — e.g. the user flicked to the bottom, so scroll
    // memory says "bottom" but the reading record says "paragraph 2"),
    // jump there once, AFTER use-scroll-memory's restore settles. The
    // saved exact position wins whenever the frontier is within one
    // viewport of it.
    var maybeFrontierResume = function(root, cands) {
      if (frontierDone) return;
      var meta = window.__readTrackerMeta;
      if (!meta || !meta.key) { frontierDone = true; return; }
      frontierAttempts += 1;
      if (frontierAttempts > 12) { frontierDone = true; return; }
      if (document.body && document.body.classList.contains('scroll-restoring')) return;
      // Yank guard (review P2): once the USER has scrolled this visit, a
      // late frontier jump is a rug-pull, not a resume. The baseline is
      // captured on the first post-restore sweep (never mid-restore, which
      // would read a scroll position still in flight); meaningful drift
      // after that cancels the jump forever.
      if (frontierBaseTop == null) { frontierBaseTop = root.scrollTop; return; }
      if (Math.abs(root.scrollTop - frontierBaseTop) > 48) { frontierDone = true; return; }
      frontierDone = true;
      if (typeof ReadingStatsStore === 'undefined' || !ReadingStatsStore) return;
      var idx = null;
      try { idx = ReadingStatsStore.firstUnreadIndex(meta.key, cands.length); }
      catch (_e) { return; }
      if (idx == null || !cands[idx]) return;
      var el = /** @type {HTMLElement} */ (cands[idx].el);
      var top = el.offsetTop || 0;
      var viewport = root.clientHeight || 0;
      if (Math.abs(root.scrollTop - top) <= viewport) return; // already looking at it
      var target = Math.max(0, top - Math.round(viewport * 0.1));
      if (typeof root.scrollTo === 'function') root.scrollTo({ top: target, behavior: 'auto' });
      else root.scrollTop = target;
    };

    var flushProgress = function(force, cands) {
      if (!trackKeySnapshot || completedFired || byKey.size === 0) return;
      /** @type {number[]} */
      var credited = [];
      for (var i = 0; i < cands.length; i++) {
        var s = byKey.get(cands[i].key);
        if (s && s.credited) credited.push(i);
      }
      if (credited.length === 0 || credited.length === reportedCount) return;
      var now = Date.now();
      if (!force && now - lastReportAt < PROGRESS_REPORT_MS) return;
      lastReportAt = now;
      reportedCount = credited.length;
      var weights = cands.map(function(cand) {
        var state = byKey.get(cand.key);
        return state ? state.words : countTextWords(cand.el.textContent);
      });
      _reportProgress(trackKeySnapshot, cands.length, credited, weights);
    };

    var lastCands = /** @type {Array<{ el: Element, key: string }>} */ ([]);

    var sweep = function() {
      // Self-arm: only reading views bind the completion bridge. On every
      // other screen this line is the entire cost of the tracker.
      if (!window.__onReadingComplete) return;
      if (document.visibilityState === 'hidden') { lastTick = null; return; }
      var root = scrollRef && scrollRef.current;
      if (!root) return;
      var meta = window.__readTrackerMeta;
      if (!trackKeySnapshot && meta && meta.key) trackKeySnapshot = String(meta.key);

      // Re-query every sweep: keys are stable across re-renders, so a
      // headings toggle or late corpus settle keeps credit and extends the
      // denominator instead of orphaning detached elements.
      var cands = candidates(root);
      lastCands = cands;
      if (cands.length === 0) { lastTick = null; return; }
      var now = performance.now();
      if (lastTick != null) activeMs += Math.min(now - lastTick, TICK_CAP_MS);
      lastTick = now;
      for (var c = 0; c < cands.length; c++) {
        if (!byKey.has(cands[c].key)) {
          var w = countTextWords(cands[c].el.textContent);
          byKey.set(cands[c].key, { words: w, visibleSince: null, credited: false });
          totalWords += w;
          requiredMs = Math.min(Math.max(totalWords * MS_PER_WORD, REQUIRED_FLOOR_MS), REQUIRED_CAP_MS);
        }
      }

      maybeFrontierResume(root, cands);

      // One batched read-only geometry pass: the root rect once, then each
      // UNCREDITED present segment's rect. Fresh root height every sweep —
      // rotation/resize/keyboard never leave a stale threshold.
      var rootRect = root.getBoundingClientRect();
      var rootH = rootRect.height || root.clientHeight || 0;
      for (var i = 0; i < cands.length; i++) {
        var s = byKey.get(cands[i].key);
        if (!s || s.credited) continue;
        var r = cands[i].el.getBoundingClientRect();
        var visibleH = Math.min(r.bottom, rootRect.bottom) - Math.max(r.top, rootRect.top);
        var meaningful = visibleH > 0 && (
          visibleH >= r.height * RATIO_CREDIT ||
          (rootH > 0 && visibleH >= rootH * TALL_FILL_RATIO)
        );
        if (meaningful) {
          if (s.visibleSince == null) s.visibleSince = now;
          else if (now - s.visibleSince >= SEGMENT_CREDIT_MS) {
            s.credited = true;
            creditedWords += s.words;
          }
        } else {
          s.visibleSince = null;   // left the viewport — the 800 ms clock resets
        }
      }

      if (!completedFired && totalWords > 0) {
        var coverage = creditedWords / totalWords;
        if (coverage >= COVERAGE_REQUIRED && activeMs >= requiredMs) {
          completedFired = true;
          var fire = window.__onReadingComplete;
          try {
            if (fire) fire({ words: totalWords, activeMs: Math.round(activeMs), coverage: coverage });
          } catch (e) { console.warn('read completion handler failed', e); }
        }
      }
      flushProgress(false, cands);
    };

    var interval = setInterval(sweep, SWEEP_MS);
    // Backgrounding pauses the active clock; returning restarts it cleanly.
    var onVis = function() { if (document.visibilityState === 'hidden') lastTick = null; };
    document.addEventListener('visibilitychange', onVis);

    return function() {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
      // Leaving mid-read: persist the frontier so a later visit resumes at
      // the first paragraph never actually read. (trackKeySnapshot, not the
      // live meta — the view's own cleanup may have nulled the global first.)
      flushProgress(true, lastCands);
      // A COMPLETED read reports its true end-of-visit pace here — see the
      // header's pace-sampling note.
      if (completedFired && totalWords > 0) {
        _reportPace(totalWords, Math.round(activeMs), requiredMs);
      }
    };
    // placeKey identifies the VISIT: navigation to another chapter remounts
    // the tracking state even when the component instance is reused.
  }, [scrollRef, inert, placeKey]);
}
