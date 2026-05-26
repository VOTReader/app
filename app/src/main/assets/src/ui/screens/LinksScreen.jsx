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

/* Cheap "is this endpoint still navigable?" check. We only use
   already-loaded globals — no extra fetches. Returns true if
   the endpoint resolves to a known destination. */
export function _endpointResolves(ep) {
  if (!ep || !ep.type || !ep.key) return false;
  if (ep.type === 'bible') {
    var books = (typeof _allBooks === 'function') ? _allBooks() : {};
    return !!(ep.bookId && books[ep.bookId]);
  }
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
  // For letter/wtlb/blessed/holy-days, try findEntryContext
  if (typeof findEntryContext === 'function') {
    var kind = ep.type === 'letter' ? 'letter' : ep.type === 'wtlb' ? 'wtlb' : ep.type === 'blessed' ? 'blessed' : ep.type === 'holy-days' ? 'holy-days' : null;
    var id = ep.letterId || ep.entryId || (ep.key && ep.key.split(':')[1]) || null;
    if (!id) return false;
    var ctx = findEntryContext(id, kind);
    return !!ctx;
  }
  return true; // can't verify — assume OK
}

/* Build a text string for the search index from an endpoint. */
export function _epSearchText(ep) {
  if (!ep) return '';
  return [ep.label || '', _linkEndpointCategory(ep), ep.text || '', ep.preview || ''].join(' ').toLowerCase();
}

/* ── LinkRow component ───────────────────────────────────────────── */
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
      {/* Chain icon + date */}
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

  if (!lnk) return null;

  var doDelete = function() {
    LinkStore.remove(lnk.id);
    onDelete();
    onClose();
  };

  return (
    <div className="link-action-overlay" onClick={onClose}>
      <div className="link-action-sheet" onClick={function(e) { e.stopPropagation(); }}>
        <div className="link-action-handle" />
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

/* ── LinksScreen ─────────────────────────────────────────────────── */
export function LinksScreen(props) {
  var onBack = props.onBack;
  var onNavigateToSource = props.onNavigateToSource;
  var onNavigateToTarget = props.onNavigateToTarget;
  var setHlTick = props.setHlTick;
  var theme = props.theme;
  var onThemeChange = props.onThemeChange;
  var onSearch = props.onSearch;
  var onHistory = props.onHistory;

  // Subscribe to LinkStore — index re-renders on any link mutation.
  React.useSyncExternalStore(
    React.useCallback(function(cb) { return LinkStore.subscribe(cb); }, []),
    function() { return LinkStore.getVersion(); }
  );
  // (onHome, historyEnabled props accepted by API but unused here.)

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

  var _as = useState(null);
  var actionTarget = _as[0];
  var setActionTarget = _as[1];

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

  var brokenLinks = useMemo(function() {
    return allLinks.filter(function(lnk) {
      return !_endpointResolves(lnk.source) || !_endpointResolves(lnk.target);
    });
  }, [allLinks]);

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

  var onDeleteFromSheet = function() {
    if (typeof setHlTick === 'function') setHlTick(function(t) { return t + 1; });
  };

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
        <div className="notes-index-header">
          <h1 className="notes-index-title">My Links</h1>
          <span className="notes-index-count">
            {allLinks.length}
            {allLinks.length === 1 ? ' link' : ' links'}
          </span>
        </div>

        {/* Search */}
        <input
          className="notes-index-search"
          type="search"
          placeholder="Search links…"
          value={searchQuery}
          onChange={function(e) { setSearchQuery(e.target.value); }}
        />

        {/* Controls row: single sort TOGGLE */}
        <div className="notes-index-controls" style={{ marginTop: '0.7rem' }}>
          <button
            className="notes-index-sort-btn"
            style={{ marginLeft: 'auto' }}
            onClick={function() { setSortMode(function(m) { return m === 'oldest' ? 'recent' : 'oldest'; }); }}
            title="Toggle sort order"
          >
            {sortMode === 'oldest' ? 'Sort: Oldest ↑' : 'Sort: Newest ↓'}
          </button>
        </div>

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
              {' Long-press a link to remove it.'}
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
