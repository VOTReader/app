/* ═══════════════════════════════════════════════════════════════════════
   LinkPicker — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The "pick a link target" sheet, in three modes (SESSION-2 overhaul,
   UX-BATCH-2026-07-12):

     Search — the original nav-index search (titles, refs, abbreviations)
              PLUS full-text results from the MiniSearch engine ("In the
              text"), so a remembered PHRASE finds its verse/letter, not
              just a remembered title. Content docs map to nav items via
              contentDocToNavItem; Hidden Manna can never surface (it has
              no nav item, and the mapper returns null).
     Browse — the app's own top-down hierarchy as a drill-down tree
              (Bible → book → chapter grid; each Volumes collection →
              entries; Studies → chapters; Matthew Study Bible → chapter
              grid), so picking a target works exactly like navigating.
     Recent — the user's link NETWORK: recently created links as
              From ⇄ To endpoint chips; tapping an endpoint reuses that
              exact (already-refined) place as the new target in one tap.

   All three modes feed the same create/refine pipeline (createLinkTo /
   reuseEndpoint), so journal card/excerpt modes get them for free.
   ═══════════════════════════════════════════════════════════════════════ */

export function LinkPicker({ sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText, onClose, onRequestRefine, lastCreatedLink, onLinkCreated, mode, onPickTarget }) {
  const [input, setInput] = React.useState('');
  const [view, setView] = React.useState('search'); // 'search' | 'browse' | 'recent'
  const [browsePath, setBrowsePath] = React.useState(/** @type {any[]} */ ([]));
  // Full-text results: null = idle (no query / too short), 'building' =
  // engine still preparing its index, [] / [...] = resolved rows.
  const [contentHits, setContentHits] = React.useState(/** @type {any} */ (null));
  const inputRef = React.useRef(null);
  // Re-read RecentNavStore every render so newly-added picks float to the top
  // without remounting the picker. Cheap localStorage read; runs at most once
  // per render.
  const [, setRecentTick] = React.useState(0);
  const bumpRecent = React.useCallback(() => setRecentTick(t => t + 1), []);
  const recent = RecentNavStore.list();
  React.useEffect(() => {
    // Guard INSIDE the timeout + clear it on unmount — the callback fires
    // 50ms later, by which point a fast close would have nulled the ref.
    const t = setTimeout(() => { if (inputRef.current) inputRef.current.focus(); }, 50);
    return () => clearTimeout(t);
  }, []);

  // Warm everything the picker's three modes depend on. The corpora loaders
  // are idempotent + async-notify-only (Q8 contract); buildNavIndex re-derives
  // when they land (signature memo), so Browse/Search fill in as data arrives.
  // bundle-e carries the MiniSearch engine — kick it plus a deferred index
  // init so the "In the text" group is warm by the time the user has typed.
  React.useEffect(() => {
    ['__loadBibleCorpus', '__loadVotCorpus', '__loadMatthewCorpus'].forEach((f) => {
      if (typeof (/** @type {any} */ (window))[f] === 'function') (/** @type {any} */ (window))[f]();
    });
    try { if (typeof loadBibleStudies === 'function') loadBibleStudies(); } catch (_e) { /* best-effort */ }
    if (typeof (/** @type {any} */ (window)).__loadScreensE === 'function') (/** @type {any} */ (window)).__loadScreensE();
    const t = setTimeout(() => {
      const eng = (/** @type {any} */ (window)).VotSearchMini;
      if (eng && typeof eng.init === 'function') eng.init().catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, []);

  // Android back button closes the picker (same save/restore pattern as every
  // other overlay in the app — picks up the previous closer on unmount).
  React.useEffect(() => {
    const prev = window.__closeSheet;
    window.__closeSheet = onClose;
    return () => { window.__closeSheet = prev || null; };
  }, [onClose]);

  // Compute nav-index search results (or empty when input is empty)
  const results = React.useMemo(() => {
    if (!input.trim()) return [];
    return searchNavIndex(input.trim(), 30).map(s => s.item);
  }, [input]);

  // Identity key for de-duplicating a content hit against a nav hit for the
  // same destination (a query matching a letter's TITLE and its BODY should
  // list that letter once, in the titles group).
  const rowKey = (it) => it.kind + '|' + (it.bookId || '') + '|' + (it.chapter || '') + '|' + (it.verse || '')
    + '|' + (it.letterId || it.entryId || '') + '|' + (it.studyChapterId || '');

  // Full-text search — debounced; rides the MiniSearch engine (bundle-e).
  // Structured/reference queries return no text results by design (the
  // nav-index ref hit already answers those), so the group simply hides.
  React.useEffect(() => {
    if (view !== 'search') return undefined;
    const q = input.trim();
    if (q.length < 3) { setContentHits(null); return undefined; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const eng = (/** @type {any} */ (window)).VotSearchMini;
      if (!eng) { setContentHits(null); return; }
      try {
        if (!eng.getState().ready) setContentHits('building');
        const res = await eng.search(q, { limit: 40 });
        if (cancelled) return;
        const navKeys = new Set(results.map(rowKey));
        const seen = new Set();
        const rows = [];
        const terms = (res.parsedTerms && res.parsedTerms.length) ? res.parsedTerms : q.split(/\s+/);
        for (const r of (res && res.results) || []) {
          const item = contentDocToNavItem(r.doc);
          if (!item) continue;
          const k = rowKey(item);
          if (seen.has(k) || navKeys.has(k)) continue;
          seen.add(k);
          rows.push({ item, snippet: eng.snippet(r.doc.text || '', terms, 110) });
          if (rows.length >= 8) break;
        }
        setContentHits(rows);
      } catch (_e) {
        if (!cancelled) setContentHits(null); // engine unavailable — group hides
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `results` is derived from `input` (useMemo on the same dep); listing input alone re-fires exactly when the query changes without double-firing on the memo identity.
  }, [input, view]);

  const createLinkTo = React.useCallback((item) => {
    if (!item) return;
    const target = navItemToEndpoint(item);
    if (!target) return;
    RecentNavStore.add(item);

    // mode === 'card' → return the target directly without prompting for an
    // excerpt. Used by Journal's "Insert card" flow when the user only wants
    // a chapter/letter title (no body excerpt).
    if (mode === 'card' && onPickTarget) {
      onPickTarget(target, item);
      return;
    }

    // Refinement step:
    //   Bible/study chapter without a specific verse → verse picker
    //   Letter/WTLB/Blessed/Holy-Days → excerpt picker (text range)
    //   In 'excerpt' mode we ALWAYS run the picker (even for already-versed
    //   refs like "Eph 6:5") so the user can narrow further; in link/picker
    //   default mode we only refine when a chapter has no verse yet.
    const needsVersePicker =
      (target.type === 'bible' || target.type === 'study') &&
      (mode === 'excerpt' || !target.verse);
    const needsExcerptPicker =
      target.type === 'letter' || target.type === 'wtlb' ||
      target.type === 'blessed' || target.type === 'holy-days' ||
      target.type === 'study-letter';
    if (needsVersePicker || needsExcerptPicker) {
      onRequestRefine && onRequestRefine({
        kind: needsVersePicker ? 'verse' : 'excerpt',
        target, item
      });
      return; // refinement screen takes over (it leaves us back here on confirm)
    }

    // Source-less mode without refinement (rare — only Bible refs with both
    // book and verse pre-supplied AND not in excerpt mode). In picker mode,
    // hand the target back; in link mode, require a source to persist.
    if (mode === 'card' || mode === 'excerpt') {
      onPickTarget && onPickTarget(target, item);
      return;
    }
    if (!sourceKey) return;
    // Direct create: stay open so user can confirm (✓) or undo (×).
    const sourceEndpoint = buildSourceEndpoint(sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText);
    const newLink = persistLink(sourceEndpoint, target);
    if (newLink) {
      bumpRecent();
      onLinkCreated(newLink);
    }
  }, [sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText, bumpRecent, onLinkCreated, mode, onPickTarget, onRequestRefine]);

  // Reuse a stored link endpoint as the new target, verbatim — it is already
  // refined (verse span / excerpt range included), so no refinement step.
  const reuseEndpoint = React.useCallback((ep) => {
    if (!ep || !ep.key) return;
    const target = { ...ep };
    if (mode === 'card' || mode === 'excerpt') {
      onPickTarget && onPickTarget(target, { label: target.label || '', collection: target.collection || '' });
      return;
    }
    if (!sourceKey) return;
    const sourceEndpoint = buildSourceEndpoint(sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText);
    const newLink = persistLink(sourceEndpoint, target);
    if (newLink) {
      bumpRecent();
      onLinkCreated(newLink);
    }
  }, [mode, onPickTarget, sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText, bumpRecent, onLinkCreated]);

  // Undo the most-recently-created link WITHOUT closing the picker, so the
  // user can immediately re-pick the correct target. Closing (× / hardware
  // back) intentionally KEEPS the created link — matching every other sheet
  // in the app where × is a neutral dismiss, not a discard. (The old header
  // red-× that silently removed the link on close was the app's only sheet
  // where dismiss meant destroy; Undo now owns that, clearly labelled.)
  const undoLastLink = React.useCallback(() => {
    if (!lastCreatedLink) return;
    LinkStore.remove(lastCreatedLink.id);
    onLinkCreated(null);
    // Return focus to the search field so re-picking is one action away.
    if (inputRef.current) inputRef.current.focus();
  }, [lastCreatedLink, onLinkCreated]);

  // Render a row for a nav item (used in Results / Recent-picks / Browse
  // lists; `extra` renders a snippet line under the label for text hits).
  const renderItemRow = (item, key, extra) => (
    <button
      key={key}
      className="navpick-row"
      onClick={() => createLinkTo(item)}
    >
      <div className={"navpick-row-icon navpick-row-icon-" + item.kind}>
        {item.kind === 'bible-chapter' ? (item.category === 'Old Testament' ? 'OT' : 'NT') :
          item.kind === 'study-chapter' ? 'SB' :
          item.kind === 'study-letter-chapter' ? 'LS' :
          (COL_NAV_ICON.get(item.collection) || '?')}
      </div>
      <div className="navpick-row-text">
        <div className="navpick-row-label">{item.label}</div>
        {extra ? <div className="navpick-row-snippet">{extra}</div> : <div className="navpick-row-cat">{item.category || ''}</div>}
      </div>
    </button>
  );

  /* ── Browse tree rendering ───────────────────────────────────────────── */
  const tree = view === 'browse' ? buildNavTree() : null;
  const browseTop = browsePath.length ? browsePath[browsePath.length - 1] : null;
  const pushBrowse = (node) => setBrowsePath((p) => [...p, node]);
  const popBrowse = () => setBrowsePath((p) => p.slice(0, -1));

  const renderBrowseGroupRow = (key, icon, iconKind, label, count, onOpen) => (
    <button key={key} className="navpick-row" onClick={onOpen}>
      <div className={"navpick-row-icon" + (iconKind ? " navpick-row-icon-" + iconKind : "")}>{icon}</div>
      <div className="navpick-row-text">
        <div className="navpick-row-label">{label}</div>
        <div className="navpick-row-cat">{count}</div>
      </div>
      <span className="navpick-row-chevron">{"›"}</span>
    </button>
  );

  const renderBrowse = () => {
    if (!tree) return null;
    // Level 0 — the app's own top-level sections, in home-menu order.
    if (!browseTop) {
      const rows = [];
      if (tree.bibleBooks.length) {
        rows.push(renderBrowseGroupRow('bible', 'OT', 'bible-chapter', 'The Holy Bible', tree.bibleBooks.length + ' books',
          () => pushBrowse({ type: 'bible', label: 'The Holy Bible' })));
      }
      if (tree.matthewChapters.length) {
        rows.push(renderBrowseGroupRow('msb', 'SB', 'study-chapter', 'Matthew Study Bible', tree.matthewChapters.length + ' chapters',
          () => pushBrowse({ type: 'chapters', label: 'Matthew Study Bible', chapters: tree.matthewChapters })));
      }
      tree.collections.forEach((c) => {
        rows.push(renderBrowseGroupRow('col:' + c.label, COL_NAV_ICON.get(c.label) || '?', c.entries[0] && c.entries[0].kind, c.label,
          c.entries.length + (c.entries.length === 1 ? ' entry' : ' entries'),
          () => pushBrowse({ type: 'entries', label: c.label, entries: c.entries })));
      });
      tree.studies.forEach((s) => {
        rows.push(renderBrowseGroupRow('study:' + s.label, 'LS', 'study-letter-chapter', s.label, s.chapters.length + ' chapters',
          () => pushBrowse({ type: 'entries', label: s.label, entries: s.chapters })));
      });
      if (!rows.length) {
        return (
          <div className="navpick-empty">
            <div className="navpick-empty-title">Loading the library…</div>
            <div className="navpick-empty-hint">The books and letters are still loading — this list fills in automatically.</div>
          </div>
        );
      }
      return <>{rows}</>;
    }
    // Level 1 under The Holy Bible — book list.
    if (browseTop.type === 'bible') {
      return (
        <>
          {tree.bibleBooks.map((b) => renderBrowseGroupRow(b.bookId,
            b.category === 'Old Testament' ? 'OT' : 'NT', 'bible-chapter',
            b.title, b.chapters.length + (b.chapters.length === 1 ? ' chapter' : ' chapters'),
            () => pushBrowse({ type: 'chapters', label: b.title, chapters: b.chapters })))}
        </>
      );
    }
    // Chapter grid (a Bible book or the Matthew Study Bible).
    if (browseTop.type === 'chapters') {
      return (
        <div className="navpick-ch-grid">
          {browseTop.chapters.map((ch) => (
            <button key={ch.chapter} className="navpick-ch-btn" onClick={() => createLinkTo(ch)}>{ch.chapter}</button>
          ))}
        </div>
      );
    }
    // Entry list (a letters collection or a study's chapters).
    if (browseTop.type === 'entries') {
      return <>{browseTop.entries.map((e, i) => renderItemRow(e, 'b' + i))}</>;
    }
    return null;
  };

  /* ── Recent links (the link network) ─────────────────────────────────── */
  const recentLinks = view === 'recent'
    ? ((typeof LinkStore !== 'undefined' && LinkStore.all) ? LinkStore.all().slice().sort((a, b) => (b.created || 0) - (a.created || 0)).slice(0, 25) : [])
    : [];

  const renderRecentLinks = () => {
    if (!recentLinks.length) {
      return (
        <div className="navpick-empty">
          <div className="navpick-empty-title">No links yet</div>
          <div className="navpick-empty-hint">Links you create will appear here, so you can link to the same places again in one tap.</div>
        </div>
      );
    }
    return (
      <>
        <div className="navpick-hintline">Tap either end of a link to use that place again.</div>
        {recentLinks.map((l) => (
          <div key={l.id} className="navpick-link-row">
            <button className="navpick-link-endpoint" onClick={() => reuseEndpoint(l.source)}>
              <span className="navpick-link-ep-eyebrow">From</span>
              <span className="navpick-link-ep-label">{(l.source && l.source.label) || '—'}</span>
            </button>
            <span className="navpick-link-arrow" aria-hidden="true">{"⇄"}</span>
            <button className="navpick-link-endpoint" onClick={() => reuseEndpoint(l.target)}>
              <span className="navpick-link-ep-eyebrow">To</span>
              <span className="navpick-link-ep-label">{(l.target && l.target.label) || '—'}</span>
            </button>
          </div>
        ))}
      </>
    );
  };

  const isEmptyQuery = !input.trim();
  const VIEW_TABS = [
    { id: 'search', label: 'Search' },
    { id: 'browse', label: 'Browse' },
    { id: 'recent', label: 'Recent' },
  ];

  return (
    <div className="link-picker-overlay" onClick={onClose}>
      <div className="link-picker-sheet navpick-sheet" onClick={e => e.stopPropagation()}>
        {/* Header: title + neutral close (×). Close KEEPS any created link;
            undo lives in the success strip below, clearly separated. */}
        <div className="navpick-header">
          <span className="navpick-title">{mode === 'card' ? "Embed a Card" : mode === 'excerpt' ? "Embed an Excerpt" : "Create a Link"}</span>
          <button
            className="navpick-close"
            onClick={onClose}
            aria-label={lastCreatedLink ? "Done" : "Close"}
          >
            ×
          </button>
        </div>
        {/* Source context — reminds the user WHAT they are linking FROM.
            Only in link mode (card/excerpt journal-insert flows have no
            source passage). */}
        {!mode && sourceKey && (
          <div className="navpick-context">
            <span className="navpick-context-label">Linking from</span>
            <span className="navpick-context-source">{sourceLabel || 'this passage'}</span>
            {sourceText ? (
              <span className="navpick-context-excerpt">{'“' + (sourceText.length > 90 ? sourceText.slice(0, 88) + '…' : sourceText) + '”'}</span>
            ) : null}
          </div>
        )}
        {/* Success strip — confirms a link was created + offers a clearly
            separated Undo (destructive) without closing the picker, so the
            user can re-pick if they linked the wrong target. */}
        {lastCreatedLink && (
          <div className="navpick-success" role="status">
            <svg className="navpick-success-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="navpick-success-text">
              Link created{lastCreatedLink.target && lastCreatedLink.target.label ? ' · ' + lastCreatedLink.target.label : ''}
            </span>
            <button className="navpick-undo" onClick={undoLastLink} aria-label="Undo this link">Undo</button>
          </div>
        )}
        {/* Mode tabs — Search (find it) / Browse (walk the menus) / Recent
            (reuse the link network). */}
        <div className="navpick-tabs" role="tablist" aria-label="How to pick a target">
          {VIEW_TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={view === t.id}
              className={"navpick-tab" + (view === t.id ? " active" : "")}
              onClick={() => setView(t.id)}
            >{t.label}</button>
          ))}
        </div>
        {/* Search input (rounded pill matching reference) — search view only */}
        {view === 'search' && (
          <div className="navpick-search-wrap">
            <input
              ref={inputRef}
              className="navpick-search-input"
              placeholder="Search titles, references, or any phrase…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && results.length > 0) createLinkTo(results[0]); }}
            />
          </div>
        )}
        {/* Browse breadcrumb — back one level + where you are */}
        {view === 'browse' && browsePath.length > 0 && (
          <div className="navpick-crumb">
            <button className="navpick-crumb-back" onClick={popBrowse} aria-label="Back one level">{"‹"}</button>
            <span className="navpick-crumb-label">{browsePath[browsePath.length - 1].label}</span>
          </div>
        )}
        {/* Body */}
        <div className="navpick-body">
          {view === 'browse' ? renderBrowse() :
          view === 'recent' ? renderRecentLinks() :
          isEmptyQuery ? (
            recent.length > 0 ? (
              <>
                <div className="navpick-section-label">Recent</div>
                {recent.map((item, i) => renderItemRow(item, 'r' + i))}
              </>
            ) : (
              <div className="navpick-empty">
                <div className="navpick-empty-title">Search to link</div>
                <div className="navpick-empty-hint">Try a title, a reference like &quot;Eph 6:5&quot;, or any phrase you remember — the text itself is searched too.</div>
              </div>
            )
          ) : (
            <>
              {results.length > 0 && (
                <>
                  <div className="navpick-section-label">Titles &amp; places</div>
                  {results.map((item, i) => renderItemRow(item, 's' + i))}
                </>
              )}
              {contentHits === 'building' && (
                <div className="navpick-hintline">Preparing text search — the first run can take a few seconds…</div>
              )}
              {Array.isArray(contentHits) && contentHits.length > 0 && (
                <>
                  <div className="navpick-section-label">In the text</div>
                  {contentHits.map((h, i) => renderItemRow(h.item, 'c' + i, h.snippet ? '“' + h.snippet + '”' : null))}
                </>
              )}
              {results.length === 0 && (!Array.isArray(contentHits) || contentHits.length === 0) && contentHits !== 'building' && (
                <div className="navpick-empty">
                  <div className="navpick-empty-title">No matches</div>
                  <div className="navpick-empty-hint">Try &quot;Genesis 1&quot;, &quot;Eph 6:5&quot;, &quot;The Wide Path&quot;, or a phrase from the passage you want.</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
