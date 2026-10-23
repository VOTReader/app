/* ═══════════════════════════════════════════════════════════════════════
   LinksScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Helpers ─────────────────────────────────────────────────────── */

/* Human-readable category label for a link endpoint.
   Mirrors the logic in LinkCard inside index.html so the two surfaces
   stay in sync. */
export function _linkEndpointCategory(ep) {
  if (!ep) return '';
  if (ep.type === 'bible') return (typeof bookCategory === 'function') ? bookCategory(ep.bookId) : 'Bible';
  if (ep.type === 'study') return 'Matthew Study Bible';
  if (ep.type === 'study-letter') return ep.collection || 'Bible Study';
  if (ep.type === 'letter') return ep.collection || 'Letter';
  if (ep.type === 'wtlb') return ep.collection || 'Words To Live By';
  if (ep.type === 'blessed') return 'The Blessed';
  if (ep.type === 'holy-days') return 'Holy Days';
  return ep.type || '';
}

/* W49: the Bible, the VOT letters and the Bible Studies load lazily. Until the
   corpus an endpoint lives in has landed it cannot be checked, and an
   unchecked endpoint counts as fine: a fresh session's Links screen used to
   call every Bible, letter and study link broken and offer to delete it. */
function _bibleLoaded(/** @type {any} */ bookId) {
  if (bookId === 'matthew') return !!((typeof _matthew === 'function') && _matthew());
  return typeof BOOKS !== 'undefined';
}
function _votLoaded() {
  var c = /** @type {any} */ (window).__votCorpus;
  return !c || !!c.loaded;   // no lazy loader (an old shell): the letters are there
}
function _studiesLoaded() { return typeof BIBLE_STUDIES !== 'undefined'; }
var STUDIES_PENDING = 'studies-pending';

/* 'ok' | 'broken' | 'unknown' (its corpus has not landed) | STUDIES_PENDING
   (only the Bible Studies, not loaded yet, can say). Cheap: loaded globals
   only, no fetches. */
export function _endpointState(/** @type {any} */ ep) {
  if (!ep || !ep.type || !ep.key) return 'broken';
  if (ep.type === 'bible') {
    var books = (typeof _allBooks === 'function') ? _allBooks() : {};
    if (ep.bookId && books[ep.bookId]) return 'ok';
    return _bibleLoaded(ep.bookId) ? 'broken' : 'unknown';
  }
  if (ep.type === 'study' || ep.type === 'journal') return _endpointResolvesLoaded(ep) ? 'ok' : 'broken';
  if (typeof findEntryContext !== 'function') return 'ok';   // can't verify: assume OK
  var kind = ep.type === 'letter' ? 'letter' : ep.type === 'wtlb' ? 'wtlb' : ep.type === 'blessed' ? 'blessed' : ep.type === 'holy-days' ? 'holy-days' : null;
  var id = ep.letterId || ep.entryId || (ep.key && ep.key.split(':')[1]) || null;
  if (!id) return 'broken';
  if (findEntryContext(id, kind)) return 'ok';
  // Not found: broken only once every corpus it could live in has landed. A
  // study chapter (and an untyped or letter end) can be in the Bible Studies.
  if (ep.type !== 'study-letter' && !_votLoaded()) return 'unknown';
  if ((ep.type === 'study-letter' || kind === null || kind === 'letter') && !_studiesLoaded()) return STUDIES_PENDING;
  return 'broken';
}

/* "Is this endpoint still navigable?" — false only when it is known broken. */
export function _endpointResolves(/** @type {any} */ ep) {
  return _endpointState(ep) !== 'broken';
}

/* The checks for the endpoints whose corpus is always there or that judge
   their own loading (Matthew, the journal). */
function _endpointResolvesLoaded(/** @type {any} */ ep) {
  if (ep.type === 'study') {
    var M = (typeof _matthew === 'function') ? _matthew() : null;
    if (!M) return true; // matthew may not be loaded yet — don't mark broken
    return !!(M.chapters && M.chapters.find(function(c) { return c.num === ep.chapter; }));
  }
  // Journal endpoints: the entry may have been deleted — verify it exists.
  if (ep.type === 'journal') {
    if (typeof JournalStore === 'undefined') return true; // can't verify
    var jid = ep.entryId || (ep.key && ep.key.split(':')[1]) || null;
    return !!(jid && JournalStore.get(jid));
  }
  return true;
}

/* Re-render the moment a lazy corpus lands (index.html's __makeLazyLoader
   objects), so an "unknown" endpoint is checked for real (W49). */
var LAZY_CORPORA = ['__bibleCorpus', '__matthewCorpus', '__votCorpus'];
function _subscribeCorpora(/** @type {() => void} */ cb) {
  var offs = LAZY_CORPORA.map(function(name) {
    var c = /** @type {any} */ (window)[name];
    return c && typeof c.subscribe === 'function' ? c.subscribe(cb) : null;
  });
  return function() { offs.forEach(function(off) { if (typeof off === 'function') off(); }); };
}
function _corpusSignature() {
  return [_bibleLoaded(null), _bibleLoaded('matthew'), _votLoaded(), _studiesLoaded()].join('|');
}

/* Build a text string for the search index from an endpoint. */
export function _epSearchText(ep) {
  if (!ep) return '';
  return [ep.label || '', _linkEndpointCategory(ep), ep.text || '', ep.preview || ''].join(' ').toLowerCase();
}

/* ── LinkRow component ───────────────────────────────────────────── */
/**
 * @param {{ key?: any, lnk: any, onNavigateSource: any, onNavigateTarget: any, onLongPress: any }} props
 */
export function LinkRow({ lnk, onNavigateSource, onNavigateTarget, onLongPress }) {
  var src = lnk.source;
  var tgt = lnk.target;
  var date = (typeof relativeDate === 'function') ? relativeDate(lnk.created) : '';
  var srcCat = _linkEndpointCategory(src);
  var tgtCat = _linkEndpointCategory(tgt);
  var srcPreview = (src && (src.text || src.preview)) || '';
  var tgtPreview = (tgt && (tgt.text || tgt.preview)) || '';

  return (
    <div
      className="link-row"
      onContextMenu={function(e) { e.preventDefault(); if (onLongPress) onLongPress(lnk, e); }}
    >
      {/* Source side — tappable */}
      <button
        className="link-row-side link-row-source"
        onClick={function() { if (onNavigateSource) onNavigateSource(lnk); }}
        title={'Open source: ' + (src && src.label ? src.label : '')}
      >
        <span className="link-row-side-eyebrow">SOURCE</span>
        <span className="link-row-side-label">{src && src.label ? src.label : '(unknown)'}</span>
        {srcCat && <span className="link-row-side-cat">{srcCat}</span>}
        {srcPreview && <span className="link-row-side-preview">{srcPreview}</span>}
      </button>
      {/* Chain icon + date + a VISIBLE options affordance. The action sheet
          (Open source/target, Delete) was long-press-only — invisible, and
          inconsistent with BookmarkRow's ⋯ button. Same handler, now
          discoverable. */}
      <div className="link-row-mid">
        <svg
          className="link-row-chain"
          viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        {date && <span className="link-row-date">{date}</span>}
        <button
          className="link-row-more"
          onClick={function(e) { e.stopPropagation(); if (onLongPress) onLongPress(lnk, e); }}
          title="Link options"
          aria-label="Link options"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="19" r="1" />
          </svg>
        </button>
      </div>
      {/* Target side — tappable */}
      <button
        className="link-row-side link-row-target"
        onClick={function() { if (onNavigateTarget) onNavigateTarget(lnk); }}
        title={'Open target: ' + (tgt && tgt.label ? tgt.label : '')}
      >
        <span className="link-row-side-eyebrow">TARGET</span>
        <span className="link-row-side-label">{tgt && tgt.label ? tgt.label : '(unknown)'}</span>
        {tgtCat && <span className="link-row-side-cat">{tgtCat}</span>}
        {tgtPreview && <span className="link-row-side-preview">{tgtPreview}</span>}
      </button>
    </div>
  );
}

/* ── LinkRowActionSheet ──────────────────────────────────────────── */
export function LinkRowActionSheet({ lnk, onClose, onNavigateSource, onNavigateTarget, onDelete }) {
  var useState = React.useState;
  var _state = useState(false);
  var confirming = _state[0];
  var setConfirming = _state[1];
  var trapRef = useFocusTrap(!!lnk);

  if (!lnk) return null;

  var doDelete = function() {
    LinkStore.remove(lnk.id);
    onDelete();
    onClose();
  };

  return (
    <div className="link-action-overlay" onClick={onClose}>
      <div className="link-action-sheet" ref={trapRef} role="dialog" aria-modal="true" aria-label="Link actions" onClick={function(e) { e.stopPropagation(); }}>
        <SheetHandle onClose={onClose} />
        {!confirming && (
          <>
            <button className="link-action-btn" onClick={function() { onNavigateSource(lnk); onClose(); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              <span>Open Source</span>
            </button>
            <button className="link-action-btn" onClick={function() { onNavigateTarget(lnk); onClose(); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
              <span>Open Target</span>
            </button>
            <button className="link-action-btn link-action-btn-danger" onClick={function() { setConfirming(true); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
              </svg>
              <span>Delete Link</span>
            </button>
          </>
        )}
        {confirming && (
          <ConfirmStrip
            style={{ padding: '14px 12px' }}
            question="Delete this link?"
            onCancel={function() { setConfirming(false); }}
            onConfirm={doDelete}
          />
        )}
      </div>
    </div>
  );
}

/* The sort cycle, in the order the one button steps through it. Each `mode`
   IS a branch of displayLinks' comparator; adding a mode to one without the
   other is what produced the dead branches C2-C [C10] found. */
var SORT_CYCLE = [
  { mode: 'recent',    label: 'Sort: Newest ↓' },
  { mode: 'oldest',    label: 'Sort: Oldest ↑' },
  { mode: 'source-az', label: 'Sort: Source A-Z' },
  { mode: 'target-az', label: 'Sort: Target A-Z' },
];

/* ── LinksScreen ─────────────────────────────────────────────────── */
export function LinksScreen(props) {
  var onBack = props.onBack;
  var onNavigateToSource = props.onNavigateToSource;
  var onNavigateToTarget = props.onNavigateToTarget;
  var theme = props.theme;
  var onThemeChange = props.onThemeChange;
  var onSearch = props.onSearch;
  var onHistory = props.onHistory;

  // Subscribe to LinkStore — index re-renders on any link mutation.
  React.useSyncExternalStore(
    React.useCallback(function(cb) { return LinkStore.subscribe(cb); }, []),
    function() { return LinkStore.getVersion(); }
  );
  // (props.onHome drives the empty state's one button; historyEnabled is accepted but unused.)

  var useState = React.useState;
  var useMemo = React.useMemo;

  var _sq = useState('');
  var searchQuery = _sq[0];
  var setSearchQuery = _sq[1];

  var _ss = useState('recent');
  var sortMode = _ss[0];
  var setSortMode = _ss[1];

  // (Pre-Q3.3f-dead: var _sm = useState(false) + showSortMenu/setShowSortMenu
  //  destructure — neither half was referenced. Removed.)
  //
  // C2-C [C10]: 'source-az' and 'target-az' were IMPLEMENTED in the comparator
  // below and unreachable from the UI — the control was a two-state
  // recent/oldest toggle, so half the sort logic was dead weight that read as
  // a finished feature. The toggle becomes a CYCLE over the same one button
  // (this screen's existing control shape), so the comparator's four branches
  // and the affordance finally describe each other.
  var nextSort = function() {
    setSortMode(function(m) {
      var i = SORT_CYCLE.findIndex(function(s) { return s.mode === m; });
      return SORT_CYCLE[(i + 1) % SORT_CYCLE.length].mode;
    });
  };
  var sortLabel = (SORT_CYCLE.find(function(s) { return s.mode === sortMode; }) || SORT_CYCLE[0]).label;

  var _as = useState(null);
  var actionTarget = _as[0];
  var setActionTarget = _as[1];

  // W1.5(a.2) — Escape-key dispatch registration for the long-press
  // action sheet rendered at the bottom of this screen.
  useModalRegistry({
    id: 'link-row-action-sheet',
    dismiss: function() { setActionTarget(null); },
    active: !!actionTarget,
  });

  var allLinks = LinkStore.all();

  var displayLinks = useMemo(function() {
    var q = searchQuery.trim().toLowerCase();
    var filtered = q
      ? allLinks.filter(function(lnk) {
          return _epSearchText(lnk.source).includes(q) || _epSearchText(lnk.target).includes(q);
        })
      : allLinks.slice();

    filtered.sort(function(a, b) {
      if (sortMode === 'oldest') return (a.created || 0) - (b.created || 0);
      if (sortMode === 'source-az') {
        var la = (a.source && a.source.label) ? a.source.label.toLowerCase() : '';
        var lb = (b.source && b.source.label) ? b.source.label.toLowerCase() : '';
        return la < lb ? -1 : la > lb ? 1 : 0;
      }
      if (sortMode === 'target-az') {
        var ta = (a.target && a.target.label) ? a.target.label.toLowerCase() : '';
        var tb = (b.target && b.target.label) ? b.target.label.toLowerCase() : '';
        return ta < tb ? -1 : ta > tb ? 1 : 0;
      }
      return (b.created || 0) - (a.created || 0);
    });
    return filtered;
  }, [allLinks, searchQuery, sortMode]);

  // W49: an end whose corpus has not landed is unknown, never broken; the
  // check re-runs when a corpus lands (the signature) or the studies load.
  var corpusSig = React.useSyncExternalStore(_subscribeCorpora, _corpusSignature);
  var _st = useState(0);
  var studiesTick = _st[0];
  var setStudiesTick = _st[1];
  var checkKey = corpusSig + '|' + studiesTick;
  var brokenCheck = useMemo(function() {
    var broken = [], needsStudies = false;
    allLinks.forEach(function(lnk) {
      var s = _endpointState(lnk.source), t = _endpointState(lnk.target);
      if (s === 'broken' || t === 'broken') broken.push(lnk);
      else if (s === STUDIES_PENDING || t === STUDIES_PENDING) needsStudies = true;
    });
    return { broken: broken, needsStudies: needsStudies, checkedAt: checkKey };
  }, [allLinks, checkKey]);
  var brokenLinks = brokenCheck.broken;
  var needsStudies = brokenCheck.needsStudies;
  // Only the Bible Studies can say whether these study links still lead
  // somewhere: load them (once per need) and check again.
  React.useEffect(function() {
    if (!needsStudies) return undefined;
    var w = /** @type {any} */ (window);
    var load = typeof w.loadBibleStudies === 'function' ? w.loadBibleStudies : null;
    if (!load) return undefined;
    var live = true;
    // s21.5: a failed load (offline, a bad fetch) leaves the links as
    // "unknown, assume OK" instead of an unhandled rejection.
    var loading;
    try { loading = Promise.resolve(load()); } catch (err) { loading = Promise.reject(err); }
    loading.then(function() { if (live) setStudiesTick(function(n) { return n + 1; }); })
      .catch(function() { /* studies unavailable: nothing is called broken */ });
    return function() { live = false; };
  }, [needsStudies, setStudiesTick]);

  // (Pre-Q3.3f-dead: var sortLabels = {...} — defined but never referenced.)

  var navigateToEndpoint = function(endpoint, label) {
    if (!endpoint) return;
    if (typeof onNavigateToSource === 'function') {
      onNavigateToSource(endpoint, { sourceLetterTitle: label || 'My Links' });
    }
  };

  var onNavigateSource = function(lnk) {
    navigateToEndpoint(lnk.source, 'My Links');
  };

  var onNavigateTarget = function(lnk) {
    if (!lnk.target) return;
    if (typeof onNavigateToTarget === 'function') {
      onNavigateToTarget(lnk.target, { sourceLetterTitle: 'My Links' });
    } else {
      navigateToEndpoint(lnk.target, 'My Links');
    }
  };

  var onDeleteFromSheet = function() {};

  // Standard app-wide Library nav (back + Home left, icon cluster right).
  var navChildren = LibraryNav({
    onBack: onBack, onSearch: onSearch, onHistory: onHistory,
    onSettings: props.onSettings,
    theme: theme, onThemeChange: onThemeChange
  });

  return (
    <ScreenLayout navChildren={navChildren}>
      <div className="links-screen">
        {/* Header */}
        <header className="study-head">
          <h1 className="study-head-title">Links</h1>
          <span className="study-head-count">
            {allLinks.length}
            {allLinks.length === 1 ? ' link' : ' links'}
          </span>
        </header>

        {/* Search, then the sort CYCLE (C2-C [C10]). One empty-state pattern (n118): an empty
            list shows its how-to and one button, no search box or sort. */}
        {allLinks.length > 0 && (
          <>
            <input
              className="notes-index-search"
              type="search"
              placeholder="Search links…"
              aria-label="Search links"
              value={searchQuery}
              onChange={function(e) { setSearchQuery(e.target.value); }}
            />
            <div className="notes-index-controls" style={{ marginTop: '0.7rem' }}>
              <button
                className="notes-index-sort-btn"
                style={{ marginLeft: 'auto' }}
                onClick={nextSort}
                title="Cycle sort order"
              >
                {sortLabel}
              </button>
            </div>
          </>
        )}

        {/* Broken links callout */}
        {brokenLinks.length > 0 && !searchQuery && (
          <div className="links-broken-callout">
            <span className="links-broken-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </svg>
            </span>
            <span className="links-broken-text">
              {brokenLinks.length}
              {brokenLinks.length === 1
                ? ' link points to content that can no longer be found (the source or target was deleted).'
                : ' links point to content that can no longer be found (a source or target was deleted).'}
              {' Tap ⋮ on a link to remove it.'}
            </span>
          </div>
        )}

        {/* Empty state: no links at all */}
        {allLinks.length === 0 && (
          <div className="notes-empty">
            <div className="notes-empty-title">No Links Yet</div>
            <div className="notes-empty-hint">
              Select text in any letter or Bible chapter, tap Link in the toolbar, and pick a destination. Your links will appear here.
            </div>
            {props.onHome && (
              <button type="button" className="empty-cta" onClick={function() { props.onHome(); }}>Start reading</button>
            )}
          </div>
        )}

        {/* Empty state: no matches */}
        {allLinks.length > 0 && displayLinks.length === 0 && (
          <div className="notes-empty">
            <div className="notes-empty-title">No Matches</div>
            <div className="notes-empty-hint">Try a different search term.</div>
          </div>
        )}

        {/* Link rows */}
        {displayLinks.length > 0 && (
          <div className="notes-index-list" style={{ marginTop: '0.75rem' }}>
            {displayLinks.map(function(lnk) {
              return (
                <LinkRow
                  key={lnk.id}
                  lnk={lnk}
                  onNavigateSource={onNavigateSource}
                  onNavigateTarget={onNavigateTarget}
                  onLongPress={function(l) { setActionTarget(l); }}
                />
              );
            })}
          </div>
        )}

        {/* Action sheet (long-press on a row) */}
        {actionTarget && (
          <LinkRowActionSheet
            lnk={actionTarget}
            onClose={function() { setActionTarget(null); }}
            onNavigateSource={function(lnk) { onNavigateSource(lnk); setActionTarget(null); }}
            onNavigateTarget={function(lnk) { onNavigateTarget(lnk); setActionTarget(null); }}
            onDelete={onDeleteFromSheet}
          />
        )}
      </div>
    </ScreenLayout>
  );
}
