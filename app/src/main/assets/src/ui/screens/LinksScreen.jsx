/* ═══════════════════════════════════════════════════════════════════════
   LinksScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Helpers ─────────────────────────────────────────────────────── */

/* Human-readable category label for a link endpoint.
   Mirrors the logic in LinkCard inside index.html so the two surfaces
   stay in sync. */
import { UiIcon } from '../components/UiIcon.jsx';
import { ActionSheet } from '../components/SelectField.jsx';
import { EmptyState, Notice, UiButton } from '../components/UiParts.jsx';
import { ListSearch, ListLine } from '../components/LibraryList.jsx';

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

/* ── LinkRow (mock v2 l-links): From and To, each opening its own end; a door to My Web; ONE menu ── */
/**
 * @param {{ key?: any, lnk: any, onNavigateSource: any, onNavigateTarget: any, onMenu: any, onMyWeb?: any }} props
 */
export function LinkRow({ lnk, onNavigateSource, onNavigateTarget, onMenu, onMyWeb }) {
  var src = lnk.source;
  var tgt = lnk.target;
  var date = (typeof relativeDate === 'function') ? relativeDate(lnk.created) : '';
  var half = function(ep, word, open) {
    var label = ep && ep.label ? ep.label : '(unknown)';
    var cat = _linkEndpointCategory(ep);
    var preview = (ep && (ep.text || ep.preview)) || '';
    return (
      <button type="button" className="link-half" onClick={function() { if (open) open(lnk); }} aria-label={word + ': ' + label + ', open it'}>
        <span className="link-half-word">{word}</span>
        <span className="link-half-title">{label}</span>
        {cat && <span className="link-half-cat">{cat}</span>}
        {preview && <span className="link-half-quote">{preview}</span>}
      </button>
    );
  };
  return (
    <div className="link-row" onContextMenu={function(e) { e.preventDefault(); if (onMenu) onMenu(lnk); }}>
      {half(src, 'From', onNavigateSource)}
      <div className="link-join" aria-hidden="true"><span><UiIcon name="link" size="sm" /></span></div>
      {half(tgt, 'To', onNavigateTarget)}
      <div className="link-foot">
        <span className="link-foot-date">{date}</span>
        {onMyWeb ? <button type="button" className="ui-link link-foot-web" onClick={function() { onMyWeb(lnk); }}>See in My Web<UiIcon name="chev" size="sm" /></button> : null}
        <button type="button" className="ui-row-menu" onClick={function() { if (onMenu) onMenu(lnk); }} aria-label="Link options" title="Link options" aria-haspopup="dialog">
          <UiIcon name="more" />
        </button>
      </div>
    </div>
  );
}

/* ── LinkRowActionSheet (mock v2 l-link-menu): the menu names the two places ── */
/** @param {{ lnk: any, onClose: () => void, onNavigateSource: any, onNavigateTarget: any, onMyWeb?: any, onDelete: any }} props */
export function LinkRowActionSheet({ lnk, onClose, onNavigateSource, onNavigateTarget, onMyWeb, onDelete }) {
  if (!lnk) return null;
  var from = lnk.source && lnk.source.label ? lnk.source.label : '(unknown)';
  var to = lnk.target && lnk.target.label ? lnk.target.label : '(unknown)';
  var when = (typeof relativeDate === 'function') ? relativeDate(lnk.created) : '';
  /** @type {any[]} */
  var actions = [
    { id: 'from', icon: 'note', label: 'Open ' + from, onSelect: function() { onNavigateSource(lnk); } },
    { id: 'to', icon: 'book', label: 'Open ' + to, onSelect: function() { onNavigateTarget(lnk); } },
  ];
  if (onMyWeb) actions.push({ id: 'web', icon: 'web', label: 'See in My Web', onSelect: function() { onMyWeb(lnk); } });
  actions.push({ id: 'delete', icon: 'trash', label: 'Delete link', danger: true, onSelect: function() { onDelete(lnk); } });
  return (
    <ActionSheet open={!!lnk} onClose={onClose} portal
      title={<>{from} <span className="link-arrow" aria-label="to">→</span> {to}</>}
      sub={when ? 'Linked ' + when.charAt(0).toLowerCase() + when.slice(1) : undefined}
      actions={actions} />
  );
}

/* The orders the sort sheet offers, each a branch of displayLinks' comparator (C2-C [C10]). */
export var LINK_SORTS = Object.freeze([
  { id: 'recent', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'source-az', label: 'From A-Z' },
  { id: 'target-az', label: 'To A-Z' },
]);

/* ── LinksScreen ─────────────────────────────────────────────────── */
export function LinksScreen(props) {
  var onBack = props.onBack;
  var onNavigateToSource = props.onNavigateToSource;
  var onNavigateToTarget = props.onNavigateToTarget;

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

  // C2-C [C10]: the comparator's four orders are all reachable, from the sort sheet (LINK_SORTS).
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

  var _dl = useState(null);
  var deleting = _dl[0];
  var setDeleting = _dl[1];
  var closeAction = React.useCallback(function() { setActionTarget(null); }, [setActionTarget]);
  var closeDelete = React.useCallback(function() { setDeleting(null); }, [setDeleting]);
  var onMyWeb = props.onOpenMyWeb ? function() { props.onOpenMyWeb(); } : null;

  return (
    <ScreenLayout utility={{ title: 'Links', onBack: onBack }}>
      <div className="links-screen lib-screen">
        {allLinks.length === 0 ? (
          <>
            <EmptyState icon="link" title="No links yet"
              text="Select some words while you read, tap Link, and choose the passage they belong with. Your links also draw My Web."
              action={props.onHome ? { label: 'Start reading', onClick: function() { (props.onStartReading || props.onHome)(); } } : null} />
            {onMyWeb ? <div className="links-empty-web"><UiButton kind="text" icon="web" onClick={onMyWeb}>Open My Web</UiButton></div> : null}
          </>
        ) : (
          <>
            <ListSearch placeholder="Search links" value={searchQuery} onChange={setSearchQuery} />
            {/* Broken links: the one notice style (W1 Notice). */}
            {brokenLinks.length > 0 && !searchQuery && (
              <Notice tone="warn" icon="link" className="links-broken"
                title={brokenLinks.length === 1 ? '1 link leads nowhere' : brokenLinks.length + ' links lead nowhere'}
                text={(brokenLinks.length === 1
                  ? 'Its source or target was deleted.'
                  : 'A source or target was deleted.') + ' Remove one with its menu.'} />
            )}
            <ListLine count={displayLinks.length} of={allLinks.length} noun="link" sort={sortMode} onSort={setSortMode} options={LINK_SORTS} />
            {displayLinks.length === 0
              ? <p className="lib-none">No links match “{searchQuery.trim()}”.</p>
              : (
                <div className="notes-index-list">
                  {displayLinks.map(function(lnk) {
                    return <LinkRow key={lnk.id} lnk={lnk} onNavigateSource={onNavigateSource} onNavigateTarget={onNavigateTarget}
                      onMenu={setActionTarget} onMyWeb={onMyWeb} />;
                  })}
                </div>
              )}
          </>
        )}

        <LinkRowActionSheet lnk={actionTarget} onClose={closeAction} onNavigateSource={onNavigateSource}
          onNavigateTarget={onNavigateTarget} onMyWeb={onMyWeb} onDelete={setDeleting} />
        <ActionSheet open={!!deleting} onClose={closeDelete} title="Delete this link?" portal
          confirm={{ label: 'Delete', danger: true, onConfirm: function() { if (deleting) LinkStore.remove(deleting.id); } }}>
          Both passages stay; only the link between them goes.
        </ActionSheet>
      </div>
    </ScreenLayout>
  );
}
