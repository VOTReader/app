/* ═══════════════════════════════════════════════════════════════════════
   JournalEditorScreen — Cluster B (esbuild bundle-b.js)
   ═══════════════════════════════════════════════════════════════════════ */

/* JRNL-1 — a synchronous localStorage draft of the in-progress entry. localStorage.setItem
   is synchronous and survives a process kill, so it is the only thing that reliably
   persists the last edits when Android OOM-kills a BACKGROUNDED WebView before the async
   IDB write lands (JournalStore.update -> _save is fire-and-forget). Single slot, keyed
   internally by entryId; written on background-hide, recovered + consumed on re-open. */
var JOURNAL_DRAFT_KEY = 'vot-journal-draft';
function _readJournalDraft() {
  try { var s = localStorage.getItem(JOURNAL_DRAFT_KEY); return s ? JSON.parse(s) : null; }
  catch (_e) { return null; }
}
function _writeJournalDraft(eid, title, blocks, mood) {
  try {
    localStorage.setItem(JOURNAL_DRAFT_KEY, JSON.stringify({ entryId: eid, title: title, blocks: blocks, mood: mood, ts: Date.now() }));
  } catch (_e) { /* quota / unavailable — draft recovery is best-effort */ }
}
function _clearJournalDraft() {
  try { localStorage.removeItem(JOURNAL_DRAFT_KEY); } catch (_e) { /* unavailable */ }
}
/** Content signature for draft-vs-stored comparison (title + blocks + mood only). */
function _journalSig(o) {
  return JSON.stringify([(o && o.title) || '', (o && o.blocks) || [], (o && o.mood) || null]);
}

// Abnormal-path trace for the block drag — console.warn + DiagnosticLog so a
// failing device names itself (same pattern as [tabdrag]/[thumb]).
function _jrnDragTrace(msg) {
  try { console.warn('[jrndrag] ' + msg); } catch (_e) { /* ignore */ }
  try {
    if (typeof DiagnosticLog !== 'undefined' && DiagnosticLog && typeof DiagnosticLog.error === 'function') {
      DiagnosticLog.error('jrndrag', msg);
    }
  } catch (_e) { /* ignore */ }
}

export function JournalEditorScreen(props) {
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;
  var useMemo = React.useMemo;

  var entryId = props.entryId;
  var onBack = props.onBack;

  // JRNL-1: on open, recover a background-draft whose edits never reached IDB. Restore
  // ONLY when the draft is for THIS entry, is at least as recent as the last durable save
  // (draft.ts >= entry.updated), AND its content actually differs — so a stale or
  // already-saved draft can never clobber newer stored content. A recovered draft is KEPT
  // (a 2nd kill before the recovered edits are re-saved recovers again); a stale/identical
  // one is consumed by the effect below.
  var loaded = useMemo(function() {
    var entry = entryId ? JournalStore.get(entryId) : null;
    if (!entryId) return { initial: entry, draftAction: 'none' };
    var draft = _readJournalDraft();
    if (!draft || draft.entryId !== entryId) return { initial: entry, draftAction: 'none' };
    var entryUpdated = (entry && entry.updated) || 0;
    var hasNewerEdits = !!entry && draft.ts >= entryUpdated && _journalSig(draft) !== _journalSig(entry);
    if (hasNewerEdits) {
      return { initial: Object.assign({}, entry, { title: draft.title, blocks: draft.blocks, mood: draft.mood }), draftAction: 'keep' };
    }
    return { initial: entry, draftAction: 'clear' };
  }, [entryId]);
  var initial = loaded.initial;

  // Local working state — we don't re-derive from JournalStore on every
  // render because that would clobber in-progress edits.
  var _title = useState((initial && initial.title) || '');
  var title = _title[0]; var setTitle = _title[1];

  var _blocks = useState((initial && initial.blocks) || JournalHelpers.defaultBlocks());
  var blocks = _blocks[0]; var setBlocks = _blocks[1];

  var _mood = useState((initial && initial.mood) || null);
  // mood is a deliberately READ-ONLY field (CQ8): the editor preserves an
  // existing entry's mood across the save round-trip but exposes no picker UI
  // to change it — no mood-picker feature is planned. The setter is therefore
  // unused (underscore-marked); wire it from a picker if one is ever added.
  var mood = _mood[0]; var _setMood = _mood[1];

  const [savedLabel, setSavedLabel] = useState('Saved');

  var _showInsert = useState(false);
  var showInsert = _showInsert[0]; var setShowInsert = _showInsert[1];

  var _showRec = useState(false);
  var showRec = _showRec[0]; var setShowRec = _showRec[1];

  // W1.5(a.2) — Escape-key dispatch registrations for the two screen-local
  // sheets owned here (insert sheet + voice recording sheet). Both render
  // conditionally further down; we register/unregister via `active` so
  // the hook calls stay unconditional at the top of the component body.
  useModalRegistry({
    id: 'journal-insert-sheet',
    dismiss: function() { setShowInsert(false); },
    active: showInsert,
  });
  useModalRegistry({
    id: 'journal-recording-sheet',
    dismiss: function() { setShowRec(false); },
    active: showRec,
  });

  var _confirmAudioDelete = useState(null);  // idx of audio block awaiting delete confirm
  var confirmAudioDelete = _confirmAudioDelete[0]; var setConfirmAudioDelete = _confirmAudioDelete[1];

  // Per-block delete confirmation (any non-audio block) — holds the index
  // currently awaiting confirm, or null. Audio uses confirmAudioDelete
  // because its inline waveform layout has its own compact confirm strip
  // sized for the play-button row.
  const [confirmDelIdx, setConfirmDelIdx] = useState(null);

  // ─── Block drag-to-reorder (grip handle) ────────────────────
  // Block drag rides the SHARED pointer-events lifecycle (utils/press-drag.js
  // — createPressDrag, extracted from the tabs v2 redesign) with holdMs:0 —
  // the grip is an explicit affordance (touch-action:none), so the grab
  // starts the instant it's touched. This screen owns only the variable-
  // height geometry, the edge autoscroll, and the seamless commit; the
  // factory owns listeners, pointer identity, pointercancel, force-reset.
  var _dragIdx = useState(-1);
  var dragIdx = _dragIdx[0]; var setDragIdx = _dragIdx[1];
  var blockRefs = useRef([]);
  var dragIdxRef = useRef(-1);
  var dragTargetRef = useRef(-1);
  var dragCloneRef = useRef(null);
  var dragRectsRef = useRef([]);        // CONTAINER-coordinate rects (viewport + scrollTop) at grab
  var dragScrollerRef = useRef(null);
  var dragFingerOffYRef = useRef(0);
  var dragLastYRef = useRef(0);
  var dragAutoDirRef = useRef(0);       // -1 scroll up / 0 / 1 scroll down (edge autoscroll)
  var dragScrollRafRef = useRef(0);
  var dragZoneRef = useRef({ top: 0, bottom: 800, zone: 110 });  // visible scroll box + zone size, derived per move
  var dragZoneEnterTsRef = useRef(0);   // when the finger entered the current edge zone (speed ramp)
  var dragCtl = useRef(null);           // the shared createPressDrag instance

  // Unmount mid-gesture: one call tears down listeners, timers, ghost, and
  // landing. The reorder itself commits SYNCHRONOUSLY at release now, so
  // nothing can be parked; commitSave() still flushes any debounced edit.
  useEffect(function() {
    return function() {
      if (dragCtl.current) dragCtl.current.destroy();
      if (dragScrollRafRef.current) { clearTimeout(dragScrollRafRef.current); dragScrollRafRef.current = 0; }
      commitSave();
    };
  }, []);

  // Tap anywhere outside the ConfirmStrip fully cancels it. Capture phase
  // so the gesture is seen even if a child stops propagation; taps inside
  // .jrn-block-confirm (the strip itself) are ignored here. The opening
  // tap has finished propagating by the time this effect attaches, so it
  // never self-cancels.
  useEffect(function() {
    if (confirmDelIdx === null) return;
    function onDocDown(e) {
      var t = e.target;
      if (t && t.closest && t.closest('.jrn-block-confirm')) return;
      setConfirmDelIdx(null);
    }
    document.addEventListener('pointerdown', onDocDown, true);
    return function() { document.removeEventListener('pointerdown', onDocDown, true); };
  }, [confirmDelIdx]);

  var fileInputRef = useRef(null);
  // activeTextareaRef tracks { idx, el, caret } so insertion knows where to
  // split. caret stays current via onSelect/onKeyUp/onClick on the textarea.
  var activeTextareaRef = useRef(null);
  var blocksContainerRef = useRef(null);
  var pendingFocusRef = useRef(null);  // { id, caret } to focus after the next render
  var firstRunRef = useRef(true);
  // Set true right before inserting a media block so the next auto-save is
  // IMMEDIATE (not the 1.2s debounce) — see the auto-save effect below and
  // onFileChosen / onRecordingSaved.
  var immediateSaveRef = useRef(false);

  // Always-fresh refs that mirror the latest state. Used by the unmount
  // cleanup to flush, since useEffect cleanup closures capture stale state.
  var titleRef = useRef(title); titleRef.current = title;
  var blocksRef = useRef(blocks); blocksRef.current = blocks;
  var moodRef = useRef(mood); moodRef.current = mood;
  var entryIdRef = useRef(entryId); entryIdRef.current = entryId;

  // Auto-save: debounce 1.2s after any title/blocks/mood change. Each
  // render re-runs this effect, capturing the latest state in its closure.
  useEffect(function() {
    if (!entryId) return;
    if (firstRunRef.current) {
      // Skip the initial mount — that's just the loaded state, no save needed.
      firstRunRef.current = false;
      return;
    }
    setSavedLabel('Saving…');
    if (immediateSaveRef.current) {
      // A media block (image / voice memo) was just inserted — persist its
      // entry reference NOW, not after the 1.2s debounce, so a background-kill
      // in the window can't lose the block (and orphan its already-durable blob).
      immediateSaveRef.current = false;
      JournalStore.update(entryId, { title: title, blocks: blocks, mood: mood });
      setSavedLabel('Saved');
      return;
    }
    var t = setTimeout(function() {
      JournalStore.update(entryId, { title: title, blocks: blocks, mood: mood });
      setSavedLabel('Saved');
    }, 1200);
    return function() { clearTimeout(t); };
  }, [entryId, title, blocks, mood]);

  // Final flush on real unmount. Reads from refs so the latest state
  // is written, not the initial-render closure.
  useEffect(function() {
    return function() {
      var eid = entryIdRef.current;
      if (eid) {
        JournalStore.update(eid, { title: titleRef.current, blocks: blocksRef.current, mood: moodRef.current });
      }
    };
  }, []);

  // Flush pending edits when the page is BACKGROUNDED / hidden. On Android the
  // WebView can be OOM-killed while backgrounded WITHOUT firing React unmount,
  // so the unmount flush above never runs — the debounced save (1.2s) would
  // lose the last edits, and a just-inserted media block would lose its blob
  // reference, orphaning the (already-durable) blob, which the boot orphan-sweep
  // then deletes. pagehide + visibilitychange give a synchronous flush point
  // that survives the kill. (Mirrors use-scroll-memory's pagehide flush;
  // commitSave is hoisted and reads always-current refs, so these mount-only
  // listeners never capture stale state.)
  useEffect(function() {
    // JRNL-1: on background-hide, the best-effort async save (commitSave) AND a SYNCHRONOUS
    // localStorage draft that survives an OOM-kill of the backgrounded WebView (commitSave's
    // IDB write may not land). onHide reads always-current refs, so the mount-only []-deps
    // listeners never capture stale state.
    function onHide() {
      commitSave();
      var eid = entryIdRef.current;
      if (eid) _writeJournalDraft(eid, titleRef.current, blocksRef.current, moodRef.current);
    }
    function onVisibility() { if (document.visibilityState === 'hidden') onHide(); }
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return function() {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // JRNL-1: consume a draft that was stale/identical at open. A RECOVERED draft (see
  // `loaded`) is deliberately KEPT so a kill before the recovered edits are re-saved can
  // recover again; only stale/already-saved drafts for THIS entry are cleared here.
  useEffect(function() {
    if (loaded.draftAction === 'clear') _clearJournalDraft();
  }, [loaded]);

  function commitSave() {
    // Synchronous immediate save — Done nav, textarea blur, or page background.
    // Reads from refs so it's correct even when invoked from a long-lived
    // (mount-time) listener whose closure would otherwise be stale.
    var eid = entryIdRef.current;
    if (!eid) return;
    JournalStore.update(eid, { title: titleRef.current, blocks: blocksRef.current, mood: moodRef.current });
    setSavedLabel('Saved');
  }

  function scheduleSave() {
    // Kept for callsite compatibility — the useEffect above does the real work.
    setSavedLabel('Saving…');
  }

  // ─── Block mutations ────────────────────────────────────────
  function patchBlock(idx, patch) {
    setBlocks(function(arr) {
      var next = arr.slice();
      next[idx] = Object.assign({}, next[idx], patch);
      return next;
    });
    scheduleSave();
  }
  function deleteBlock(idx) {
    setBlocks(function(arr) {
      var next = arr.slice();
      var removed = next.splice(idx, 1)[0];
      // Drop the media blob too — but ONLY when nothing else needs it:
      //  1. not an embed of another entry's media (sourceJournalId set), AND
      //  2. no OTHER entry embeds this same mediaId (symmetric protection —
      //     deleting the SOURCE block must not orphan embeds elsewhere), AND
      //  3. this entry doesn't reuse the same mediaId in another block.
      if (removed && (removed.type === 'image' || removed.type === 'audio') && removed.mediaId) {
        var isLinkedEmbed = !!removed.sourceJournalId;
        var reusedHere = next.some(function(bb) {
          return (bb.type === 'image' || bb.type === 'audio') && bb.mediaId === removed.mediaId;
        });
        var referencedElsewhere = false;
        try {
          referencedElsewhere = (typeof JournalStore !== 'undefined' && JournalStore.isMediaReferencedElsewhere)
            ? JournalStore.isMediaReferencedElsewhere(removed.mediaId, entryIdRef.current)
            : false;
        } catch (_e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
        if (!isLinkedEmbed && !reusedHere && !referencedElsewhere) {
          try { JournalMediaStore.delete(removed.mediaId); } catch (_e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
        }
      }
      return next.length === 0 ? JournalHelpers.defaultBlocks() : next;
    });
    setConfirmDelIdx(null);
    setConfirmAudioDelete(null);
    scheduleSave();
  }
  function insertBlockAt(idx, block) {
    setBlocks(function(arr) {
      var next = arr.slice();
      next.splice(idx + 1, 0, block);
      return next;
    });
    scheduleSave();
  }

  // ─── Block drag-to-reorder mechanics ────────────────────────
  var setBlockRef = function(i) { return function(el) { blockRefs.current[i] = el; }; };

  // The dragged block's full slot delta (height + inter-block spacing) —
  // what its neighbors must shift by. Blocks have VARIABLE heights, so
  // this is measured from adjacent captured rects, not assumed uniform.
  function _dragSlotDelta() {
    var rects = dragRectsRef.current;
    var from = dragIdxRef.current;
    var r0 = rects[from];
    if (!r0) return 0;
    if (rects[from + 1]) return rects[from + 1].top - r0.top;
    if (rects[from - 1]) return r0.bottom - rects[from - 1].bottom;
    return r0.h;
  }

  // FLIP the siblings between the drag origin and the current target out
  // of the way. Exact for variable heights: removing block `from` shifts
  // everything after it up by its slot delta; re-inserting after/before
  // `to` cancels that shift for blocks outside the affected span.
  function _applyBlockShifts(to) {
    var from = dragIdxRef.current;
    var D = _dragSlotDelta();
    blockRefs.current.forEach(function(n, i) {
      if (!n || i === from) return;
      var shift = 0;
      if (from < to && i > from && i <= to) shift = -D;
      else if (from > to && i >= to && i < from) shift = D;
      n.style.transition = 'transform 0.18s cubic-bezier(0.2,0.8,0.3,1)';
      n.style.transform = shift ? 'translateY(' + shift + 'px)' : '';
    });
  }

  // Insertion index = how many OTHER blocks' centers sit above the dragged
  // block's center (container coordinates, so mid-drag autoscroll doesn't
  // invalidate the comparison). Handles variable heights cleanly.
  function _updateDragTarget(clientY) {
    var rects = dragRectsRef.current;
    var from = dragIdxRef.current;
    if (from < 0) return;
    var scroller = dragScrollerRef.current;
    var st = scroller ? scroller.scrollTop : 0;
    var r0 = rects[from];
    var cy = (clientY - dragFingerOffYRef.current) + (r0 ? r0.h / 2 : 0) + st;
    var idx = 0;
    for (var i = 0; i < rects.length; i++) {
      if (i === from || !rects[i]) continue;
      if (rects[i].cy < cy) idx++;
    }
    idx = Math.max(0, Math.min(rects.length - 1, idx));
    if (idx !== dragTargetRef.current) {
      dragTargetRef.current = idx;
      _applyBlockShifts(idx);
    }
  }

  // Edge autoscroll: a long entry must keep scrolling while the finger
  // parks near the top/bottom of the VISIBLE scroll area. Zones derive from
  // the scroller's own rect — the old window-edge zones buried most of the
  // top zone under the top nav, which is why long-distance drags felt
  // impossible. Speed = depth² curve × a time ramp (holding in the zone
  // accelerates, capped ~48px/tick ≈ 3000px/s) so top↔bottom drags across
  // very long entries are practical. 16ms timeout loop (~rAF cadence on a
  // visible page, but unlike rAF it still fires in hidden/headless test
  // hosts); re-derives the target each step because the content moves
  // under a stationary finger.
  function _updateAutoScroll(clientY) {
    var vh = window.innerHeight || 800;
    var top = 0, bottom = vh;
    var scroller = dragScrollerRef.current;
    if (scroller && scroller.getBoundingClientRect) {
      var r = scroller.getBoundingClientRect();
      // Degenerate rects (jsdom, mid-boot) fall back to the window box.
      if (r.bottom - r.top > 100) { top = Math.max(0, r.top); bottom = Math.min(vh, r.bottom); }
    }
    var zone = Math.min(150, Math.max(60, (bottom - top) * 0.22));
    var dir = clientY < top + zone ? -1 : (clientY > bottom - zone ? 1 : 0);
    if (dir !== dragAutoDirRef.current) dragZoneEnterTsRef.current = Date.now();
    dragAutoDirRef.current = dir;
    dragZoneRef.current = { top: top, bottom: bottom, zone: zone };
    if (dir !== 0 && !dragScrollRafRef.current) {
      var step = function() {
        dragScrollRafRef.current = 0;
        if (dragIdxRef.current < 0 || dragAutoDirRef.current === 0) return;
        if (dragCtl.current && !dragCtl.current.isDragging()) return; // engine ended the drag — never scroll on
        var sc = dragScrollerRef.current;
        if (!sc) return;
        var y = dragLastYRef.current;
        var d = dragAutoDirRef.current;
        var z = dragZoneRef.current;
        var depth = d < 0 ? (z.top + z.zone - y) : (y - (z.bottom - z.zone));
        var norm = Math.max(0, Math.min(1, depth / z.zone));
        var ramp = 1 + Math.min(1.4, (Date.now() - dragZoneEnterTsRef.current) / 900);
        var spd = Math.min(48, (6 + 24 * norm * norm) * ramp);
        sc.scrollTop += d * spd;
        _updateDragTarget(y);
        dragScrollRafRef.current = setTimeout(step, 16);
      };
      dragScrollRafRef.current = setTimeout(step, 16);
    }
  }

  // Drop commit — SYNCHRONOUS at release (the factory's onCommit): the
  // transforms clear + the reorder land in ONE paint of the final
  // arrangement (blocksRef is written in the same tick, so a pagehide/
  // unmount flush persists the NEW order immediately — the old parked-
  // commit window is gone), while the clone glides into its slot above the
  // hidden real block (blocks are keyed by id — the grabbed NODE persists
  // across the reorder and is the reveal target at landing).
  function commitBlockDrop() {
    dragAutoDirRef.current = 0;
    if (dragScrollRafRef.current) { clearTimeout(dragScrollRafRef.current); dragScrollRafRef.current = 0; }
    var from = dragIdxRef.current;
    if (from < 0) return;
    var to = dragTargetRef.current >= 0 ? dragTargetRef.current : from;
    var clone = dragCloneRef.current;
    var rects = dragRectsRef.current;
    var r0 = rects[from];
    blockRefs.current.forEach(function(n) {
      if (n) { n.style.transform = ''; n.style.transition = ''; }
    });
    dragIdxRef.current = -1;
    setDragIdx(-1);
    dragTargetRef.current = -1;
    var grabbedEl = blockRefs.current[from] || null;
    if (grabbedEl) grabbedEl.style.opacity = '0';
    try {
      if (to !== from) {
        var moved = JournalHelpers.moveBlock(blocksRef.current, from, to);
        if (moved !== blocksRef.current) {
          // Write the ref synchronously too: a pagehide/unmount flush in
          // the same tick must persist the NEW order, not wait a render.
          blocksRef.current = moved;
          setBlocks(moved);
          activeTextareaRef.current = null; // caret index is stale after a move
          scheduleSave();
        }
      }
    } catch (err) {
      _jrnDragTrace('reorder commit threw: ' + String(err).slice(0, 120));
    }
    if (clone && r0) {
      var st = dragScrollerRef.current ? dragScrollerRef.current.scrollTop : 0;
      var snapTop = to === from ? r0.top
        : (to > from ? (rects[to] ? rects[to].bottom - r0.h : r0.top)
                     : (rects[to] ? rects[to].top : r0.top));
      clone.style.transition = 'top 0.2s cubic-bezier(0.2,0.8,0.3,1)';
      clone.style.top = (snapTop - st) + 'px';
    }
    dragCloneRef.current = null;
    dragCtl.current.land(clone, grabbedEl, 210);
  }

  if (!dragCtl.current) {
    dragCtl.current = createPressDrag({
      holdMs: 0, // the grip IS the affordance — the grab starts instantly
      trace: _jrnDragTrace,
      onEngage: function(g) {
        var idx = g.idx;
        var container = blocksContainerRef.current;
        var el = blockRefs.current[idx];
        if (!container || !el) return; // nothing to drag — release no-ops (to===from)
        var scroller = container.closest('.screen-scroll') || document.documentElement;
        dragScrollerRef.current = scroller;
        // Open confirm strips target blocks BY INDEX — close them before the
        // indices move (and before their banner height skews the rect capture).
        setConfirmDelIdx(null);
        setConfirmAudioDelete(null);
        var st = scroller.scrollTop;
        dragRectsRef.current = blockRefs.current.map(function(n) {
          if (!n) return null;
          var r = n.getBoundingClientRect();
          return { top: r.top + st, bottom: r.bottom + st, cy: r.top + st + r.height / 2, h: r.height };
        });
        var rect = el.getBoundingClientRect();
        dragFingerOffYRef.current = g.startY - rect.top;
        dragLastYRef.current = g.startY;
        dragIdxRef.current = idx;
        dragTargetRef.current = idx;
        setDragIdx(idx);
        // Flying clone — framed card that follows the finger. React renders a
        // textarea's text via the value PROPERTY, which cloneNode does not
        // copy, so mirror form-field values onto the clone by hand.
        var clone = el.cloneNode(true);
        var srcFields = el.querySelectorAll('textarea, input');
        var dstFields = clone.querySelectorAll('textarea, input');
        for (var i = 0; i < srcFields.length; i++) {
          if (dstFields[i]) dstFields[i].value = srcFields[i].value;
        }
        clone.className = 'jrn-block drag-flying';
        clone.style.cssText = [
          'position:fixed',
          'top:' + rect.top + 'px',
          'left:' + rect.left + 'px',
          'width:' + rect.width + 'px',
          'height:' + rect.height + 'px',
          'z-index:9999',
          'pointer-events:none',
        ].join(';');
        document.body.appendChild(clone);
        dragCloneRef.current = clone;
        if (navigator.vibrate) { try { navigator.vibrate(35); } catch (_e) { /* unsupported — ignore */ } }
      },
      onDragMove: function(g, _x, y) {
        dragLastYRef.current = y;
        var c = dragCloneRef.current;
        if (c) c.style.top = (y - dragFingerOffYRef.current) + 'px';
        _updateAutoScroll(y);
        _updateDragTarget(y);
      },
      onCommit: function() { commitBlockDrop(); },
      onAbortDrag: function() {
        dragAutoDirRef.current = 0;
        if (dragScrollRafRef.current) { clearTimeout(dragScrollRafRef.current); dragScrollRafRef.current = 0; }
        if (dragCloneRef.current && dragCloneRef.current.parentNode)
          dragCloneRef.current.parentNode.removeChild(dragCloneRef.current);
        dragCloneRef.current = null;
        blockRefs.current.forEach(function(n) { if (n) { n.style.transform = ''; n.style.transition = ''; } });
        dragIdxRef.current = -1;
        setDragIdx(-1);
        dragTargetRef.current = -1;
      },
    });
  }

  function startBlockDrag(idx, clientX, clientY, pointerId) {
    dragCtl.current.start(idx, clientX, clientY, pointerId, blockRefs.current[idx]);
  }

  // ─── Insert below — a new block NEVER splits an existing one ─
  // Item 9 (UX-BATCH session 3): picking a media/card from the FAB + used
  // to split the focused paragraph in half at the caret. Now the new block
  // always lands BELOW the block the caret is in — the paragraph stays
  // whole and the caret goes back to exactly where it was, so typing keeps
  // flowing. If the insert becomes the last block, one trailing empty
  // paragraph is appended so there is always somewhere to write below it.
  function insertBlockBelow(block) {
    var info = activeTextareaRef.current;
    var idx = info && info.idx != null ? info.idx : -1;
    var next = blocks.slice();
    var focusTarget; // { id, caret } for the post-render focus effect
    if (idx >= 0 && idx < next.length) {
      var caret = info.caret != null ? info.caret : (info.el ? info.el.selectionStart : 0);
      focusTarget = { id: next[idx].id, caret: caret };
      next.splice(idx + 1, 0, block);
      if (idx + 1 === next.length - 1) next.push({ id: JournalHelpers.blockId(), type: 'p', text: '' });
    } else {
      // No caret context (e.g. picker insert with no focused textarea).
      // Append, then ensure EXACTLY ONE trailing empty paragraph to keep
      // writing in — never one-per-insert, which previously littered the
      // entry with blank gaps after several embeds.
      var last = next[next.length - 1];
      if (last && last.type === 'p' && !(last.text || '').trim()) {
        next.splice(next.length - 1, 0, block); // insert before the blank p
        focusTarget = { id: last.id, caret: 0 };
      } else {
        var tailId = JournalHelpers.blockId();
        next.push(block);
        next.push({ id: tailId, type: 'p', text: '' });
        focusTarget = { id: tailId, caret: 0 };
      }
    }
    setBlocks(next);
    pendingFocusRef.current = focusTarget;
    scheduleSave();
  }

  // After every render, if pendingFocusRef is set, focus that block's
  // textarea and put the caret back where the insert flow left it.
  useEffect(function() {
    var pf = pendingFocusRef.current;
    if (!pf) return;
    pendingFocusRef.current = null;
    var el = blocksContainerRef.current && blocksContainerRef.current.querySelector('[data-block-id="' + pf.id + '"] textarea');
    if (el) {
      try { el.focus(); el.setSelectionRange(pf.caret || 0, pf.caret || 0); } catch (_e) { /* DOM access — element may not exist or API unsupported */ }
    }
  });

  // ─── Insert sheet ───────────────────────────────────────────
  function openInsertSheet() {
    setShowInsert(true);
  }
  function handleBlockInsert(block) {
    insertBlockBelow(block);
  }
  function handleInsertImage() {
    if (fileInputRef.current) fileInputRef.current.click();
  }
  function handleInsertAudio() {
    setShowRec(true);
  }
  function handleInsertInline(token) {
    // Inline tokens (e.g. {{ref:…}}) go into the focused textarea at the
    // caret position when possible. The FAB → Inline path is mostly a
    // power-user shortcut; default flow uses block-level cards.
    var info = activeTextareaRef.current;
    if (info && info.idx != null) {
      var idx = info.idx;
      var cur = blocks[idx];
      if (cur && (cur.type === 'p' || cur.type === 'h2' || cur.type === 'quote')) {
        var caret = info.caret != null ? info.caret : (info.el ? info.el.selectionStart : (cur.text || '').length);
        var text = cur.text || '';
        var pad = (caret > 0 && !/\s$/.test(text.slice(0, caret))) ? ' ' : '';
        var newText = text.slice(0, caret) + pad + token + text.slice(caret);
        patchBlock(idx, { text: newText });
        return;
      }
    }
    insertBlockAt(blocks.length - 1, JournalHelpers.newBlock('p', { text: token }));
  }

  // ─── File picker (image) ────────────────────────────────────
  function onFileChosen(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    e.target.value = '';  // reset so same file can be re-picked later

    JournalMediaStore.compressImage(file, { maxDim: 1600, quality: 0.8 }).then(function(out) {
      return JournalMediaStore.put({
        type: 'image',
        blob: out.blob,
        mime: 'image/jpeg',
        width: out.width,
        height: out.height
      });
    }).then(function(mid) {
      immediateSaveRef.current = true;  // persist the new image block at once (skip the 1.2s debounce)
      insertBlockBelow(JournalHelpers.newBlock('image', { mediaId: mid, caption: '' }));
    }).catch(function(err) {
      if (typeof StorageHealth !== 'undefined') StorageHealth.onWriteFailure(err);
      showToast('Could not save that image.');
    });
  }

  // ─── Recording sheet save ───────────────────────────────────
  function onRecordingSaved(info) {
    setShowRec(false);
    if (!info || !info.mediaId) return;
    immediateSaveRef.current = true;  // persist the new audio block at once (skip the 1.2s debounce)
    insertBlockBelow(JournalHelpers.newBlock('audio', { mediaId: info.mediaId, duration: info.duration, caption: '', samples: info.samples || null }));
  }

  // ─── Caret tracking ─────────────────────────────────────────
  function trackCaret(idx, el) {
    if (!el) return;
    activeTextareaRef.current = { idx: idx, el: el, caret: el.selectionStart };
  }
  function focusTextarea(idx, el) {
    activeTextareaRef.current = { idx: idx, el: el, caret: el ? el.selectionStart : 0 };
  }

  // ─── Shared delete affordance ─────────────────────────────
  // Renders a small × in the corner of every editable block. Tap once →
  // a ConfirmStrip banner flips to the top of the block (order: -1 on
  // .jrn-block-confirm keeps that positioning). Audio blocks route
  // through their own onRequestDelete callback (the waveform layout
  // owns the strip), so we don't render a duplicate × on audio.
  function blockDeleteUI(idx) {
    if (confirmDelIdx === idx) {
      return (
        <ConfirmStrip
          className="jrn-block-confirm"
          question="Delete this block?"
          onCancel={() => setConfirmDelIdx(null)}
          onConfirm={() => deleteBlock(idx)}
        />
      );
    }
    return (
      <button
        className="jrn-block-del-btn"
        onClick={function(e) { e.stopPropagation(); setConfirmDelIdx(idx); }}
        title="Delete block"
        aria-label="Delete block"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    );
  }

  // ─── Shared drag affordance ─────────────────────────────────
  // A grip in the left gutter of every block (only when there are at
  // least two — a lone block has nowhere to go). Opposite corner from
  // the delete x, mirroring the tab cards' grab-left / destroy-right
  // separation. Grabbing it starts the drag immediately (no long-press).
  function blockDragUI(idx) {
    if (blocks.length < 2) return null;
    return (
      <button
        className="jrn-block-drag-btn"
        onPointerDown={function(e) {
          e.stopPropagation();
          if (e.isPrimary === false) return; // a second finger never owns a gesture
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          startBlockDrag(idx, e.clientX, e.clientY, e.pointerId);
        }}
        onDragStart={function(e) { e.preventDefault(); }}
        onClick={function(e) { e.stopPropagation(); e.preventDefault(); }}
        title="Drag to reorder"
        aria-label="Drag to reorder"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <circle cx="9" cy="6" r="1.7" /><circle cx="15" cy="6" r="1.7" />
          <circle cx="9" cy="12" r="1.7" /><circle cx="15" cy="12" r="1.7" />
          <circle cx="9" cy="18" r="1.7" /><circle cx="15" cy="18" r="1.7" />
        </svg>
      </button>
    );
  }

  // ─── Block render — editable variants ───────────────────────
  function renderEditableBlock(b, idx) {
    // Text blocks (p/h2/quote) get is-text: their delete × stays a whisper
    // until the block is focused — a per-paragraph always-on control read
    // as clutter ("not too crowded", session-3 plainness pass). Media/card
    // blocks keep the always-visible × (they have no focus state).
    var isText = b.type === 'p' || b.type === 'h2' || b.type === 'quote';
    var common = {
      key: b.id,
      className: 'jrn-block jrn-block-edit' + (isText ? ' is-text' : '') + (idx === dragIdx ? ' dragging' : ''),
      'data-block-id': b.id,
      ref: setBlockRef(idx)
    };
    if (b.type === 'p' || b.type === 'h2') {
      // Auto-growing textarea via the CSS grid-replica wrapper (.jrn-grow):
      // the wrapper's ::after renders data-rep invisibly in the same grid
      // cell, so the cell is always exactly as tall as the text. No JS
      // measuring — the old per-render height:auto collapse forced a layout
      // at the SHORT height, which clamped the scroller's scrollTop on long
      // entries (the Android "scroll keeps jumping while editing" glitch).
      return (
        <div {...common}>
          <div className={'jrn-grow ' + (b.type === 'h2' ? 'jrn-grow-h2' : 'jrn-grow-p')} data-rep={b.text || ''}>
            <textarea
              className={'jrn-block-textarea' + (b.type === 'h2' ? ' h2' : '')}
              rows={1}
              value={b.text || ''}
              placeholder={idx === 0 ? 'Start writing…' : ''}
              onChange={function(e) { patchBlock(idx, { text: e.target.value }); trackCaret(idx, e.target); }}
              onFocus={function(e) { focusTextarea(idx, e.target); }}
              onSelect={function(e) { trackCaret(idx, e.target); }}
              onKeyUp={function(e) { trackCaret(idx, e.target); }}
              onClick={function(e) { trackCaret(idx, e.target); }}
              onBlur={function(e) { trackCaret(idx, e.target); commitSave(); }}
            />
          </div>
          {blockDeleteUI(idx)}
          {blockDragUI(idx)}
        </div>
      );
    }
    if (b.type === 'quote') {
      return (
        <div {...common}>
          <div className="jrn-block-quote">
            <div className="jrn-grow jrn-grow-quote" data-rep={b.text || ''}>
              <textarea
                rows={1}
                value={b.text || ''}
                placeholder="Quoted text…"
                onChange={function(e) { patchBlock(idx, { text: e.target.value }); trackCaret(idx, e.target); }}
                onFocus={function(e) { focusTextarea(idx, e.target); }}
                onSelect={function(e) { trackCaret(idx, e.target); }}
                onKeyUp={function(e) { trackCaret(idx, e.target); }}
                onClick={function(e) { trackCaret(idx, e.target); }}
                onBlur={function(e) { trackCaret(idx, e.target); commitSave(); }}
              />
            </div>
            <input
              type="text"
              className="jrn-block-quote-cite"
              value={b.cite || ''}
              placeholder="Citation (optional)"
              onChange={function(e) { patchBlock(idx, { cite: e.target.value }); }}
              onBlur={function() { commitSave(); }}
            />
          </div>
          {blockDeleteUI(idx)}
          {blockDragUI(idx)}
        </div>
      );
    }
    if (b.type === 'divider') {
      return (
        <div {...common}>
          <div className="jrn-divider">❖  ❖  ❖</div>
          {blockDeleteUI(idx)}
          {blockDragUI(idx)}
        </div>
      );
    }
    if (b.type === 'image') {
      return (
        <div {...common}>
          <div className="jrn-embed-image">
            {/* Linked-from-journal embed surfaces the source attribution */}
            {b.sourceJournalId && b.sourceJournalTitle && <div className="jrn-linked-badge">{'From: ' + b.sourceJournalTitle}</div>}
            <JournalImageBlock mediaId={b.mediaId} />
            <input
              type="text"
              className="jrn-img-caption"
              placeholder="Caption (optional)"
              value={b.caption || ''}
              onChange={function(e) { patchBlock(idx, { caption: e.target.value }); }}
              onBlur={function() { commitSave(); }}
            />
          </div>
          {blockDeleteUI(idx)}
          {blockDragUI(idx)}
        </div>
      );
    }
    if (b.type === 'audio') {
      var confirming = confirmAudioDelete === idx;
      return (
        <div {...common}>
          {b.sourceJournalId && b.sourceJournalTitle && <div className="jrn-linked-badge">{'From: ' + b.sourceJournalTitle}</div>}
          <JournalAudioBlock
            mediaId={b.mediaId} duration={b.duration} caption={b.caption} samples={b.samples}
            editable={true}
            onRequestDelete={function() { setConfirmAudioDelete(idx); }}
            onCancelDelete={function() { setConfirmAudioDelete(null); }}
            onConfirmDelete={function() { setConfirmAudioDelete(null); deleteBlock(idx); }}
            confirming={confirming}
          />
          {blockDragUI(idx)}
        </div>
      );
    }
    // Everything else (letter-card, chapter-card, verse-block, bookmark-card,
    // note-card, journal-card, journal-excerpt) renders via JournalBlockView
    // for parity with the viewer, then gets the unified delete button.
    return (
      <div {...common}>
        <JournalBlockView block={b} callbacks={{}} />
        {blockDeleteUI(idx)}
      </div>
    );
  }

  // ─── Body click → focus last text block ─────────────────────
  function focusLastTextBlock(e) {
    // Only fire when the user taps blank space (not a block child).
    if (e.target !== e.currentTarget) return;
    var container = blocksContainerRef.current;
    if (!container) return;
    var tas = container.querySelectorAll('.jrn-block-textarea');
    if (tas.length > 0) {
      var last = tas[tas.length - 1];
      try { last.focus(); last.setSelectionRange(last.value.length, last.value.length); } catch (_e) { /* DOM access — element may not exist or API unsupported */ }
      return;
    }
    // No text block exists — append a fresh paragraph.
    var newId = JournalHelpers.blockId();
    pendingFocusRef.current = { id: newId, caret: 0 };
    setBlocks(function(arr) { return arr.concat([{ id: newId, type: 'p', text: '' }]); });
    scheduleSave();
  }

  // Drop stale refs when the block count shrinks (delete) so a future
  // drag's rect capture never reads a dead node. Ref callbacks repopulate.
  blockRefs.current.length = blocks.length;

  // ─── Nav (back left; saved indicator + right cluster) ───────
  // Standard app-wide Library nav. Editor specifics preserved: "Done"
  // back label, commitSave() before every navigation, and the "Saved"
  // status chip as a leftExtra (stays on the left, next to Home). The
  // textareas also commit on blur, so the bare HomeBtn is data-safe.
  var navChildren = LibraryNav({
    onBack: function() { commitSave(); onBack && onBack(); },
    backTitle: 'Done',
    leftExtras: <span className="jrn-saved-ind">{savedLabel}</span>,
    onSearch: props.onSearch ? function() { commitSave(); props.onSearch(); } : undefined,
    onHistory: props.onHistory ? function() { commitSave(); props.onHistory(); } : undefined,
    onSettings: props.onSettings ? function() { commitSave(); props.onSettings(); } : undefined,
    theme: props.theme,
    onThemeChange: props.onThemeChange
  });

  return (
    <ScreenLayout navChildren={navChildren}>
      <div className="jrn-editor">
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFileChosen} />
        <div className="jrn-editor-meta">
          <input
            className="jrn-editor-title"
            type="text"
            value={title}
            placeholder="Title"
            onChange={function(e) { setTitle(e.target.value); scheduleSave(); }}
            onBlur={function() { commitSave(); }}
          />
          {initial && initial.created ? (
            <div className="jrn-editor-date">
              {JournalHelpers.longDate(initial.created)}
              <span className="jrn-card-time">{' · ' + JournalHelpers.shortTime(initial.created)}</span>
            </div>
          ) : null}
        </div>
        <div ref={blocksContainerRef} className="jrn-blocks jrn-body-surface" onClick={focusLastTextBlock}>
          {blocks.map(function(b, idx) { return renderEditableBlock(b, idx); })}
        </div>
      </div>
      {/* Single + FAB. Voice recording is reached via + → Voice Recording
          (the standalone mic FAB was removed per user direction). */}
      {!showRec && (
        <button
          className="jrn-fab jrn-fab-plus"
          onClick={openInsertSheet}
          title="Insert" aria-label="Insert"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      )}
      {showInsert && (
        <JournalInsertSheet
          excludeJournalId={entryId}
          onClose={function() { setShowInsert(false); }}
          onInsertBlock={function(b) { handleBlockInsert(b); setShowInsert(false); }}
          onInsertImage={handleInsertImage}
          onRecordAudio={handleInsertAudio}
          onInsertInline={handleInsertInline}
        />
      )}
      {showRec && (
        <JournalRecordingSheet
          onSave={onRecordingSaved}
          onClose={function() { setShowRec(false); }}
        />
      )}
    </ScreenLayout>
  );
}
