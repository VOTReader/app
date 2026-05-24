/* ═══════════════════════════════════════════════════════════════════════
   LinkPicker — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function LinkPicker({ sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText, hlTick: _hlTick, setHlTick, onClose, onRequestRefine, lastCreatedLink, onLinkCreated, mode, onPickTarget }) {
  const [input, setInput] = React.useState('');
  const inputRef = React.useRef(null);
  // Re-read RecentNavStore every render so newly-added picks float to the top
  // without remounting the picker. Cheap localStorage read; runs at most once
  // per render.
  const [, setRecentTick] = React.useState(0);
  const bumpRecent = React.useCallback(() => setRecentTick(t => t + 1), []);
  const recent = RecentNavStore.list();
  React.useEffect(() => {
    if (inputRef.current) setTimeout(() => inputRef.current.focus(), 50);
  }, []);

  // Android back button closes the picker (same save/restore pattern as every
  // other overlay in the app — picks up the previous closer on unmount).
  React.useEffect(() => {
    const prev = window.__closeSheet;
    window.__closeSheet = onClose;
    return () => { window.__closeSheet = prev || null; };
  }, [onClose]);

  // Compute search results (or empty when input is empty)
  const results = React.useMemo(() => {
    if (!input.trim()) return [];
    return searchNavIndex(input.trim(), 30).map(s => s.item);
  }, [input]);

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
      setHlTick(t => t + 1);
      bumpRecent();
      onLinkCreated(newLink);
    }
  }, [sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText, setHlTick, bumpRecent, onLinkCreated, mode, onPickTarget]);

  // Render a row for a nav item (used in both Results and Recent lists)
  const renderItemRow = (item, key) => (
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
        <div className="navpick-row-cat">{item.category || ''}</div>
      </div>
    </button>
  );

  const isEmptyQuery = !input.trim();

  return (
    <div className="link-picker-overlay" onClick={onClose}>
      <div className="link-picker-sheet navpick-sheet" onClick={e => e.stopPropagation()}>
        {/* Header: title + red × (undo last link) + green ✓ (confirm & close) */}
        <div className="navpick-header">
          <span className="navpick-title">{mode === 'card' ? "Embed a Card" : mode === 'excerpt' ? "Embed an Excerpt" : "Link"}</span>
          <button
            className="navpick-close navpick-close-undo"
            onClick={() => {
              if (lastCreatedLink) {
                LinkStore.remove(lastCreatedLink.id);
                onLinkCreated(null);
              }
              onClose();
            }}
            aria-label="Cancel"
          >
            ×
          </button>
          {lastCreatedLink && (
            <button
              className="navpick-confirm-green"
              onClick={onClose}
              aria-label="Done"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
          )}
        </div>
        {/* Search input (rounded pill matching reference) */}
        <div className="navpick-search-wrap">
          <input
            ref={inputRef}
            className="navpick-search-input"
            placeholder="Search for verses, letters, or titles…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && results.length > 0) createLinkTo(results[0]); }}
          />
        </div>
        {/* Body: Recent OR Results */}
        <div className="navpick-body">
          {isEmptyQuery ? (
            recent.length > 0 ? (
              <>
                <div className="navpick-section-label">Recent</div>
                {recent.map((item, i) => renderItemRow(item, 'r' + i))}
              </>
            ) : (
              <div className="navpick-empty">
                <div className="navpick-empty-title">Search to link</div>
                <div className="navpick-empty-hint">Examples: &quot;Eph 6:5&quot;, &quot;v1l2&quot;, &quot;WTLB1 33&quot;, or a letter title.</div>
              </div>
            )
          ) : (
            results.length > 0 ? (
              <>
                <div className="navpick-section-label">Results</div>
                {results.map((item, i) => renderItemRow(item, 's' + i))}
              </>
            ) : (
              <div className="navpick-empty">
                <div className="navpick-empty-title">No matches</div>
                <div className="navpick-empty-hint">Try &quot;Genesis 1&quot;, &quot;Eph 6:5&quot;, &quot;V2 letter 5&quot;, &quot;The Wide Path&quot;, &quot;WTLB1 33&quot;.</div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
