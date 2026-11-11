/* ═══════════════════════════════════════════════════════════════════════
   BookmarksScreen — Cluster G (bundle-d since lz1; lazy bundle-g before)
   ═══════════════════════════════════════════════════════════════════════
   My Bookmarks is a screen a reader opens on purpose, never on boot, so it
   travelled with the other Personal Study screens in lazy bundle-g rather
   than costing every launch its parse (lanes/myweb/out/perf-report-2026-09-22.md
   §6) until lz1 (2026-10-13) folded bundle-g into bundle-d. Two pieces of
   this file could not come along then and live in the app shell's own
   files, where the always-present shell can always reach them:
   BookmarkPopover (ui/sheets/BookmarkPopover.jsx) and the two hlKey
   derivations (utils/bookmark-source.js).

   Which is why the screen still asks for those derivations the way every
   lazy bundle once asked bundle-d for a shared law — as a free global at
   call time, through the two guards below. BookmarkRow and its action sheet have no
   reader outside this file, so they ride with the screen.
   ═══════════════════════════════════════════════════════════════════════ */

import { ActionSheet } from '../components/SelectField.jsx';
import { ListRow, EmptyState } from '../components/UiParts.jsx';
import { ListSearch, ListLine } from '../components/LibraryList.jsx';

/* The bundle-d slots, guarded so that rendering this screen alone (a test,
   or a host without bundle-d's slots) degrades to the raw key rather
   than throwing. */
function srcLabel(hlKey) {
  return (typeof _bookmarkSourceLabel === 'function') ? _bookmarkSourceLabel(hlKey) : String(hlKey || 'Bookmark');
}
function srcEndpoint(hlKey) {
  return (typeof _bookmarkSourceEndpoint === 'function') ? _bookmarkSourceEndpoint(hlKey) : null;
}

/** Where a bookmark is, beyond its name: "Volume One" for a letter, "Studies", "Journal" (bookmark-source.js). */
function srcPlace(hlKey) {
  return (typeof _bookmarkSourcePlace === 'function') ? _bookmarkSourcePlace(hlKey) : '';
}

/**
 * A bookmark's name, said once (bug: the card repeated it): the reader's label, or the place's own name when the
 * label is that name or empty.
 * @param {any} bkm @param {string} source @returns {{ name: string, where: string }}
 */
export function bookmarkWords(bkm, source) {
  var label = String(bkm.label || '').trim();
  var same = !label || label.toLowerCase() === String(source || '').trim().toLowerCase();
  var place = srcPlace(bkm.hlKey);
  return { name: same ? (source || label || 'Bookmark') : label, where: [same ? '' : source, place].filter(Boolean).join(' · ') };
}

/* ── BookmarkRow (mock v2 l-book): the bookmark icon, the name once, then where it is and when; ONE menu ── */
/**
 * @param {{ key?: any, bkm: any, source?: string, onNavigate: any, onMenu: any }} props
 */
export function BookmarkRow({ bkm, source = '', onNavigate, onMenu }) {
  var sourceLabel = source || srcLabel(bkm.hlKey);
  var words = bookmarkWords(bkm, sourceLabel);
  var date = (typeof relativeDate === 'function') ? relativeDate(bkm.updated || bkm.created) : '';
  return (
    <ListRow icon="mark" className="bkm-row" title={words.name} meta={[words.where, date].filter(Boolean).join(' · ')}
      onClick={function() { if (onNavigate) onNavigate(bkm); }}
      menu={{ label: 'Bookmark options', onClick: function() { if (onMenu) onMenu(bkm); } }} />
  );
}

/* ── BookmarkRowActionSheet (mock v2 l-book-menu): Open, Rename, Delete bookmark in plain words; Rename and Delete
   each open their own sheet (rule 13: no menu inside a menu). ── */
export function BookmarkRowActionSheet({ bkm, onClose, onNavigate, onRename, onDelete }) {
  if (!bkm) return null;
  var source = srcLabel(bkm.hlKey);
  var words = bookmarkWords(bkm, source);
  var thought = bkm.thought && String(bkm.thought).trim();
  return (
    <ActionSheet open={!!bkm} onClose={onClose} title={words.name} sub={words.where || undefined} portal
      actions={[
        { id: 'open', icon: 'book', label: 'Open', onSelect: function() { onNavigate(bkm); } },
        { id: 'rename', icon: 'pen', label: 'Rename', onSelect: function() { onRename(bkm); } },
        { id: 'delete', icon: 'trash', label: 'Delete bookmark', danger: true, onSelect: function() { onDelete(bkm); } },
      ]}>
      {thought ? <p className="bkm-thought">{thought}</p> : null}
    </ActionSheet>
  );
}

/* The orders the sort sheet offers, each a branch of displayBookmarks' comparator (C2-C [C10]). */
export var BOOKMARK_SORTS = Object.freeze([
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'source-az', label: 'Place A-Z' },
  { id: 'label-az', label: 'Name A-Z' },
]);

/* ── BookmarksScreen ─────────────────────────────────────────── */
export function BookmarksScreen(props) {
  var onBack = props.onBack;
  var onNavigateToSource = props.onNavigateToSource;

  // Subscribe to BookmarkStore — re-renders when any bookmark mutates.
  var bkmVer = React.useSyncExternalStore(
    React.useCallback(function(cb) { return BookmarkStore.subscribe(cb); }, []),
    function() { return BookmarkStore.getVersion(); }
  );

  var useState = React.useState;
  var useMemo = React.useMemo;

  var _sq = useState('');
  var searchQuery = _sq[0];
  var setSearchQuery = _sq[1];

  // C2-C [C10]: all four orders the comparator has are reachable, now from the sort sheet.
  var _ss = useState('newest');
  var sortMode = _ss[0];
  var setSortMode = _ss[1];

  var _as = useState(null);
  var actionTarget = _as[0];
  var setActionTarget = _as[1];
  var _rn = useState(null);
  var renaming = _rn[0];
  var setRenaming = _rn[1];
  var _rv = useState('');
  var renameValue = _rv[0];
  var setRenameValue = _rv[1];
  var _dl = useState(null);
  var deleting = _dl[0];
  var setDeleting = _dl[1];
  var closeAction = React.useCallback(function() { setActionTarget(null); }, [setActionTarget]);
  var closeRename = React.useCallback(function() { setRenaming(null); }, [setRenaming]);
  var closeDelete = React.useCallback(function() { setDeleting(null); }, [setDeleting]);

  /* One list and one source label per bookmark per store version (sweep W69): a fresh slice per
     render kept the memo below from ever holding, and the search and every row each resolved the
     label again (a corpus or journal lookup). */
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the store version: all() is the live array
  var allBookmarks = useMemo(function() { return BookmarkStore.all().slice(); }, [bkmVer]);
  var sourceOf = useMemo(function() {
    var m = new Map();
    allBookmarks.forEach(function(bkm) { var t = srcLabel(bkm.hlKey); m.set(bkm, { text: t, lower: t.toLowerCase() }); });
    return m;
  }, [allBookmarks]);

  var displayBookmarks = useMemo(function() {
    var q = searchQuery.trim().toLowerCase();
    var filtered = q
      ? allBookmarks.filter(function(bkm) {
          var label = (bkm.label || '').toLowerCase();
          // n163: the reader's own thought on a bookmark is searchable too
          var thought = (bkm.thought || '').toLowerCase();
          return label.includes(q) || sourceOf.get(bkm).lower.includes(q) || thought.includes(q);
        })
      : allBookmarks.slice();
    filtered.sort(function(a, b) {
      if (sortMode === 'oldest') return (a.created || 0) - (b.created || 0);
      if (sortMode === 'source-az') {
        var la = sourceOf.get(a).lower;
        var lb = sourceOf.get(b).lower;
        return la < lb ? -1 : la > lb ? 1 : 0;
      }
      if (sortMode === 'label-az') {
        var xa = (a.label || '').toLowerCase();
        var xb = (b.label || '').toLowerCase();
        return xa < xb ? -1 : xa > xb ? 1 : 0;
      }
      return (b.updated || b.created || 0) - (a.updated || a.created || 0);
    });
    return filtered;
  }, [allBookmarks, sourceOf, searchQuery, sortMode]);

  var navigateToBookmark = function(bkm) {
    var endpoint = srcEndpoint(bkm.hlKey);
    if (!endpoint) return;
    if (typeof onNavigateToSource === 'function') {
      onNavigateToSource(endpoint, { sourceLetterTitle: 'My Bookmarks' });
    }
  };

  var saveRename = function() {
    var v = renameValue.trim();
    if (!v || !renaming) return false;
    BookmarkStore.update(renaming.id, { label: v });
    return true;
  };

  return (
    <ScreenLayout utility={{ title: 'Bookmarks', onBack: onBack }}>
      <div className="bkm-screen lib-screen">
        {/* One empty-state pattern (rule 15): how it fills (the bar's bookmark button), one button, no search box. */}
        {allBookmarks.length === 0 ? (
          <EmptyState icon="mark" title="No bookmarks yet"
            text="Tap the bookmark at the top of any letter or chapter to keep your place. Your bookmarks collect here."
            action={props.onHome ? { label: 'Start reading', onClick: function() { (props.onStartReading || props.onHome)(); } } : null} />
        ) : (
          <>
            <ListSearch placeholder="Search bookmarks" value={searchQuery} onChange={setSearchQuery} />
            <ListLine count={displayBookmarks.length} of={allBookmarks.length} noun="bookmark" sort={sortMode} onSort={setSortMode} options={BOOKMARK_SORTS} />
            {displayBookmarks.length === 0
              ? <p className="lib-none">No bookmarks match “{searchQuery.trim()}”.</p>
              : (
                <div className="ui-group bkm-list" role="group" aria-label="Bookmarks">
                  {displayBookmarks.map(function(bkm) {
                    return <BookmarkRow key={bkm.id} bkm={bkm} source={sourceOf.get(bkm).text} onNavigate={navigateToBookmark} onMenu={setActionTarget} />;
                  })}
                </div>
              )}
          </>
        )}

        <BookmarkRowActionSheet
          bkm={actionTarget}
          onClose={closeAction}
          onNavigate={navigateToBookmark}
          onRename={function(bkm) { setRenameValue(bkm.label || srcLabel(bkm.hlKey)); setRenaming(bkm); }}
          onDelete={setDeleting}
        />
        <ActionSheet open={!!renaming} onClose={closeRename} title="Rename bookmark" portal
          confirm={{ label: 'Save', onConfirm: saveRename, disabled: !renameValue.trim() }}>
          <label className="ui-field is-square lib-name">
            <input type="text" autoFocus value={renameValue} placeholder="Bookmark name" aria-label="Bookmark name" maxLength={200}
              onChange={function(e) { setRenameValue(e.target.value); }} />
          </label>
        </ActionSheet>
        <ActionSheet open={!!deleting} onClose={closeDelete} title="Delete this bookmark?" portal
          confirm={{ label: 'Delete', danger: true, onConfirm: function() { if (deleting) BookmarkStore.remove(deleting.id); } }}>
          {deleting ? bookmarkWords(deleting, srcLabel(deleting.hlKey)).name + ' is removed from your bookmarks.' : null}
        </ActionSheet>
      </div>
    </ScreenLayout>
  );
}
