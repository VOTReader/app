/* ═══════════════════════════════════════════════════════════════════════
   JournalHubScreen — Cluster B (esbuild bundle-b.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { UiIcon } from '../components/UiIcon.jsx';
import { ActionSheet } from '../components/SelectField.jsx';
import { Segmented, EmptyState } from '../components/UiParts.jsx';
import { ListSearch, ListLine } from '../components/LibraryList.jsx';

/* The entry menu (mock v2 l-jmenu) and the three-step delete kept as one sheet with a step bar (l-jdel). Owner call
   2026-07-28: the triple confirm alone gates an entry delete; the type-DELETE ritual is reserved for the Settings
   erase-all wipe. `startStep` 1 opens straight on Delete's first step (the viewer's Delete). */
const DELETE_STEPS = [
  null,
  { ask: 'Delete this entry?', go: 'Continue' },
  { ask: 'Are you sure? This cannot be undone.', go: 'I am sure' },
  { ask: 'Last step: permanently remove this entry?', go: 'Delete forever' },
];

export function JournalCardMenu(props) {
  var entry = props.entry;
  var _step = React.useState(props.startStep || 0);
  var step = _step[0]; var setStep = _step[1];
  if (!entry) return null;
  function close() { setStep(0); props.onClose && props.onClose(); }
  var title = (typeof JournalHelpers !== 'undefined' && JournalHelpers.entryDisplayTitle(entry)) || 'Untitled';
  var when = typeof JournalHelpers !== 'undefined'
    ? JournalHelpers.shortDate(entry.updated || entry.created) + ' \xB7 ' + JournalHelpers.shortTime(entry.updated || entry.created) : '';
  var actions = [
    !props.hideOpen ? { id: 'open', icon: 'book', label: 'Open', onSelect: function() { props.onOpen(); } } : null,
    { id: 'edit', icon: 'pen', label: 'Edit', onSelect: function() { props.onEdit(); } },
    { id: 'pin', icon: 'pin', label: entry.pinned ? 'Unpin' : 'Pin to the top', onSelect: function() { props.onTogglePin(); } },
    { id: 'del', icon: 'trash', label: 'Delete entry', danger: true, keepOpen: true, onSelect: function() { setStep(1); } },
  ].filter(Boolean);
  var summary = step > 0 && typeof JournalStore !== 'undefined' && JournalStore.associatedDataSummary
    ? JournalStore.associatedDataSummary(entry.id) : null;
  var st = DELETE_STEPS[step];
  return step === 0 ? (
    <ActionSheet id="journal-card-menu" open onClose={close} title={title} sub={when} actions={actions} portal className="jrn-entry-sheet ui-row-sheet" />
  ) : (
    <ActionSheet id="journal-card-menu" open onClose={close} title="Delete this entry?" portal className="jrn-del-sheet"
      confirm={{ label: st.go, danger: true, onConfirm: function() {
        if (step < 3) { setStep(step + 1); return false; }
        props.onDelete();
        return true;
      } }}>
      <div className="jrn-del-steps" role="progressbar" aria-label="Delete steps" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step}>
        <i className="is-on" /><i className={step >= 2 ? 'is-on' : ''} /><i className={step >= 3 ? 'is-on' : ''} />
      </div>
      <div className="ui-group is-inset jrn-del-entry">
        <div className="ui-row no-lead"><span className="ui-row-text"><span className="ui-row-title">{title}</span><span className="ui-row-meta">{when}</span></span></div>
      </div>
      <p className="jrn-tripledel-question">
        {'Step ' + step + ' of 3. ' + st.ask + (summary ? ' ' + summary.charAt(0).toUpperCase() + summary.slice(1) + ' inside the entry are deleted with it.' : '')}
      </p>
    </ActionSheet>
  );
}

export function JournalHubScreen(props) {
  var useState = React.useState;

  var onBack = props.onBack;
  // Opening or editing an entry from the hub is not a card tap, so drop the
  // journal→journal back frames (JournalViewerScreen's onJournalCard) that
  // lead INTO it: a stale one made the entry show "Back to <the entry it was
  // once linked from>" and sent back there (v046). Not on mount: another tab
  // sitting on journal-home mounts the hub on a tab switch, and this tab's
  // chain must survive that. Same drop as navigateToLink's journal branch.
  function dropBackFramesInto(eid) {
    var jst = (typeof window !== 'undefined') ? window.__journalBackStack : null;
    if (!jst || !jst.length) return;
    var kept = jst.filter(function(f) { return !f || f.destId !== eid; });
    if (kept.length !== jst.length) { jst.length = 0; Array.prototype.push.apply(jst, kept); }
  }
  var onOpenEntry = props.onOpenEntry && function(eid) { dropBackFramesInto(eid); props.onOpenEntry(eid); };
  var onEditEntry = props.onEditEntry && function(eid) { dropBackFramesInto(eid); props.onEditEntry(eid); };
  var onCreateEntry = props.onCreateEntry;

  // Subscribe to JournalStore — hub re-renders on any entry mutation.
  React.useSyncExternalStore(
    React.useCallback(function(cb) { return JournalStore.subscribe(cb); }, []),
    function() { return JournalStore.getVersion(); }
  );

  var _tab = useState('all');
  var tab = _tab[0]; var setTab = _tab[1];

  var _q = useState('');
  var query = _q[0]; var setQuery = _q[1];

  var _sortNewest = useState(true);
  var sortNewest = _sortNewest[0]; var setSortNewest = _sortNewest[1];

  var _menuEntry = useState(null);
  var menuEntry = _menuEntry[0]; var setMenuEntry = _menuEntry[1];

  var allEntries = JournalStore.all();

  // ─── Unclaimed recordings (journal-3 clause (b)) ───────────
  // Skipping the prune is only half of "never deleted, and always visible".
  // A record nothing references and nothing shows is preserved and invisible,
  // which the user cannot tell apart from lost. This is where the whole set
  // can be seen at once, which is also why recovery lives here rather than on
  // the block that is missing its bytes: one path, with everything in view.
  var _unclaimed = useState([]);
  var unclaimed = _unclaimed[0]; var setUnclaimed = _unclaimed[1];
  var _discarding = useState(null);
  var discarding = _discarding[0]; var setDiscarding = _discarding[1];

  var storeVersion = JournalStore.getVersion();
  React.useEffect(function() {
    var cancelled = false;
    if (typeof JournalMediaStore === 'undefined' || !JournalMediaStore.unclaimed) return undefined;
    // marker AND unreferenced — the marker alone is not authoritative, since
    // it is written in one transaction and cleared in another.
    JournalMediaStore.unclaimed(JournalStore.collectAllMediaIds())
      .then(function(rows) { if (!cancelled) setUnclaimed(rows || []); })
      .catch(function() { /* a failed read must not take the hub down */ });
    return function() { cancelled = true; };
  }, [storeVersion, setUnclaimed]);

  function recoverUnclaimed(rec) {
    // No samples: the waveform degrades to a flat bar. Inventing samples would
    // draw a picture of audio nobody has measured.
    var e = JournalStore.add({
      title: '',
      blocks: [{ type: 'audio', mediaId: rec.id, duration: rec.duration || 0, samples: null }],
    });
    // W16 refuter: an entry with content like any other, so it counts once (every
    // delete or exit prune of a counted entry takes one back).
    try { if (typeof JournalStatsStore !== 'undefined') JournalStatsStore.recordNewEntry((e && e.created) || Date.now()); } catch (_e) { /* stats are best-effort */ }
    if (JournalStore.linkMediaWhenSaved) JournalStore.linkMediaWhenSaved([rec.id]);   // the marker clears once the new entry is on disk
    setUnclaimed(function(list) { return list.filter(function(r) { return r.id !== rec.id; }); });
  }

  function discardUnclaimed(rec) {
    JournalMediaStore.delete(rec.id);
    setDiscarding(null);
    setUnclaimed(function(list) { return list.filter(function(r) { return r.id !== rec.id; }); });
  }

  function renderUnclaimed() {
    if (!unclaimed.length) return null;
    var n = unclaimed.length;
    return (
      <div className="jrn-unclaimed">
        <div className="jrn-unclaimed-head">
          {n === 1
            ? '1 recording was saved but never attached to an entry.'
            : n + ' recordings were saved but never attached to an entry.'}
        </div>
        {unclaimed.map(function(rec) {
          var when = (typeof JournalHelpers !== 'undefined' && JournalHelpers.longDate)
            ? JournalHelpers.longDate(rec.created) : '';
          var len = (typeof JournalHelpers !== 'undefined' && JournalHelpers.formatDuration)
            ? JournalHelpers.formatDuration(rec.duration || 0) : '';
          return (
            <div className="jrn-unclaimed-row" key={rec.id}>
              <span className="jrn-unclaimed-when">{when}{len ? ' · ' + len : ''}</span>
              {discarding === rec.id ? (
                <ConfirmStrip
                  className="jrn-unclaimed-confirm"
                  question="Delete this recording?"
                  yesLabel="Yes, delete"
                  onCancel={function() { setDiscarding(null); }}
                  onConfirm={function() { discardUnclaimed(rec); }}
                />
              ) : (
                <span className="jrn-unclaimed-actions">
                  <button className="jrn-unclaimed-recover" onClick={function() { recoverUnclaimed(rec); }}>Recover</button>
                  <button className="jrn-unclaimed-discard" onClick={function() { setDiscarding(rec.id); }}>Discard</button>
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function deleteEntry(id) { JournalStore.remove(id); }
  function togglePin(id) { JournalStore.togglePin(id); }

  // ─── Entry card render ─────────────────────────────────────
  function renderCard(entry) {
    var title = JournalHelpers.entryDisplayTitle(entry);
    var preview = JournalHelpers.previewText(entry, 160);
    // id-datasafe 121: in a search the card shows the words around the hit, marked.
    var snip = searchQ && typeof JournalHelpers.searchSnippet === 'function' ? JournalHelpers.searchSnippet(entry, searchQ, 120) : null;
    var attachments = JournalHelpers.attachmentSummary(entry);
    var moodClass = entry.mood ? entry.mood : '';

    // W36: the options button is a SIBLING of the role=button open control.
    // Nested inside it, Enter on the button bubbled to the card's onKeyDown and
    // opened the entry, and a role=button's children are presentational, so a
    // screen reader lost the button. A click anywhere on the card still opens.
    return (
      <div
        key={entry.id}
        className={'jrn-card' + (entry.pinned ? ' pinned' : '')}
        onClick={function(e) {
          const t = /** @type {Element} */ (e.target);
          if (t.closest && t.closest('.jrn-card-menu-btn')) return;
          onOpenEntry && onOpenEntry(entry.id);
        }}
      >
        <div
          className="jrn-card-open"
          role="button"
          tabIndex={0}
          onKeyDown={function(e) {
            if (e.target !== e.currentTarget) return;
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenEntry && onOpenEntry(entry.id); }
          }}
        >
          <h3 className={'jrn-card-title' + (title ? '' : ' untitled')}>{title || 'Untitled'}</h3>
          {snip ? (
            <p className="jrn-card-preview jrn-card-snippet">
              {snip.where && <span className="jrn-card-hit-where">{snip.where === 'excerpt' ? 'In an excerpt: ' : snip.where === 'caption' ? 'In a caption: ' : 'In a tag: '}</span>}
              {snip.before}<mark>{snip.hit}</mark>{snip.after}
            </p>
          ) : preview && <p className="jrn-card-preview">{preview}</p>}
          {attachments.length > 0 && (
            <div className="jrn-card-attachments">
              {attachments.map(function(a, i) {
                return <span key={i} className="jrn-attach">{a.label}</span>;
              })}
            </div>
          )}
          {entry.tags && entry.tags.length > 0 && (
            <div className="jrn-tags">
              {entry.tags.slice(0, 4).map(function(t, i) {
                return <span key={i} className="jrn-tag">{'#' + t}</span>;
              })}
            </div>
          )}
          {/* Mock v2 l-jrn: the time under the words. A05.3: a time from an edit says so. */}
          <span className="jrn-card-date">
            {moodClass && moodClass !== 'none' ? <span className={'jrn-card-mood ' + moodClass} aria-hidden="true" /> : null}
            {entry.pinned && (
              <svg className="jrn-card-pin-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-label="Pinned" role="img">
                <path d="M9 4.5 L19.5 15 M15 3.5 a1.5 1.5 0 0 1 0 2.1 L13 7.5 l1.8 4.6 -2 2 -8.4 -8.4 2-2 4.6 1.8 1.9-1.9 a1.5 1.5 0 0 1 2.1 0z" />
                <path d="M8 12 L3 19" />
              </svg>
            )}
            {(entry.updated && entry.created && entry.updated - entry.created > 60000 ? 'Edited ' : '') + JournalHelpers.shortDate(entry.updated || entry.created)}
            <span className="jrn-card-time">{' \xB7 ' + JournalHelpers.shortTime(entry.updated || entry.created)}</span>
          </span>
        </div>
        <button
          className="jrn-card-menu-btn"
          onClick={function(e) { e.stopPropagation(); setMenuEntry(entry); }}
          aria-label="Entry options"
          aria-haspopup="dialog"
          aria-expanded={!!(menuEntry && menuEntry.id === entry.id)}
          title="Options"
        >
          <UiIcon name="more" />
        </button>
      </div>
    );
  }

  // ─── All-entries / Pinned tabs ──────────────────────────────
  // W36: search reads the whole entry (JournalHelpers.searchText), built once
  // per entry per store version: each keystroke re-renders on the same version
  // and reuses it; any entry mutation bumps the version and rebuilds lazily.
  var searchCacheRef = React.useRef(/** @type {{ v: number, map: Map<string, string> }} */ ({ v: -1, map: new Map() }));
  function entrySearchText(e) {
    var c = searchCacheRef.current;
    if (c.v !== storeVersion) { c.v = storeVersion; c.map = new Map(); }
    var t = c.map.get(e.id);
    if (t === undefined) { t = JournalHelpers.searchText(e); c.map.set(e.id, t); }
    return t;
  }

  var searchQ = query.trim().toLowerCase().replace(/\s+/g, ' ');
  function matching(list) {
    return searchQ ? list.filter(function(e) { return entrySearchText(e).indexOf(searchQ) >= 0; }) : list;
  }

  function renderEntries(list, isPinnedTab) {
    var filtered = matching(list).slice().sort(function(a, b) {
      var ad = a.updated || a.created || 0;
      var bd = b.updated || b.created || 0;
      if (ad !== bd) return sortNewest ? (bd - ad) : (ad - bd);
      if (a.id === b.id) return 0;
      var cmp = a.id < b.id ? -1 : 1;
      return sortNewest ? cmp : -cmp;
    });

    return (
      <>
        {/* One empty-state pattern (n118, rule 15): an empty tab shows its how-to and one button, no search or sort. */}
        {list.length > 0 && (
          <>
            <ListSearch className="jrn-search" placeholder="Search entries"
              label={isPinnedTab ? 'Search pinned entries' : 'Search journal entries'} value={query} onChange={setQuery} />
            <ListLine count={filtered.length} of={list.length} noun="entry" sort={sortNewest ? 'newest' : 'oldest'}
              onSort={function(id) { setSortNewest(id !== 'oldest'); }} />
          </>
        )}
        {filtered.length === 0 ? (
          list.length > 0 ? (
            <EmptyState icon="search" title="No matches" text="Try a different search term." />
          ) : isPinnedTab ? (
            <EmptyState icon="pin" title="No pinned entries" text="Pin an entry from its menu and it waits here, at hand."
              action={{ label: 'All entries', onClick: function() { setTab('all'); } }} />
          ) : (
            <EmptyState icon="journal" title="No entries yet"
              text="Write what you are learning; an entry can hold letters, bookmarks, photos and voice recordings."
              action={onCreateEntry ? { label: 'Write your first entry', icon: 'pen', onClick: function() { onCreateEntry(); } } : null} />
          )
        ) : (
          <div className="jrn-list">{filtered.map(renderCard)}</div>
        )}
      </>
    );
  }

  var pinnedEntries = allEntries.filter(function(e) { return e.pinned; });
  // The pill shows wherever the empty state's own button does not (mock v2 l-jrn0: the button is in the middle).
  var showPill = !!onCreateEntry && allEntries.length > 0;

  return (
    <ScreenLayout utility={{ title: 'Journal', onBack: onBack, backLabel: 'Back to Library' }}>
      <div className="jrn-hub lib-screen">
        {/* POL5: no switch while there is nothing to switch between (mock v2 l-jrn0 draws none) */}
        {allEntries.length > 0 ? <Segmented label="Show" options={[{ id: 'all', label: 'All entries' }, { id: 'pinned', label: 'Pinned' }]} value={tab} onChange={setTab} /> : null}
        {renderUnclaimed()}
        {(tab === 'all' || allEntries.length === 0) && renderEntries(allEntries, false)}
        {tab === 'pinned' && allEntries.length > 0 && renderEntries(pinnedEntries, true)}
        {showPill ? (
          <button className="jrn-fab jrn-fab-newentry" onClick={function() { onCreateEntry(); }} aria-label="New entry">
            <UiIcon name="pen" />
            <span className="jrn-fab-newentry-label">New entry</span>
          </button>
        ) : null}
        {menuEntry && (
          <JournalCardMenu
            entry={menuEntry}
            onClose={function() { setMenuEntry(null); }}
            onOpen={function() { onOpenEntry && onOpenEntry(menuEntry.id); }}
            onEdit={function() { onEditEntry ? onEditEntry(menuEntry.id) : (onOpenEntry && onOpenEntry(menuEntry.id)); }}
            onTogglePin={function() { togglePin(menuEntry.id); }}
            onDelete={function() { deleteEntry(menuEntry.id); }}
          />
        )}
      </div>
    </ScreenLayout>
  );
}
