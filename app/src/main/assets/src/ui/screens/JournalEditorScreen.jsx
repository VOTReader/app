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
  // Imperative-DOM drag like TabsOverview/HomeScreen, but with NO
  // long-press phase: the grip is an explicit affordance (touch-action:
  // none), so the grab starts the instant it's touched. State machine
  // carries the same hardening as the tab drag: the drop-commit parks in
  // finishBlockDragRef (a new grab flushes it), moves/lifts are matched
  // to the pointer that owns the drag, and the commit body is
  // try/finally so the refs can never stay poisoned.
  var _dragIdx = useState(-1);
  var dragIdx = _dragIdx[0]; var setDragIdx = _dragIdx[1];
  var blockRefs = useRef([]);
  var dragIdxRef = useRef(-1);
  var dragTargetRef = useRef(-1);
  var dragCloneRef = useRef(null);
  var dragRectsRef = useRef([]);        // CONTAINER-coordinate rects (viewport + scrollTop) at grab
  var dragScrollerRef = useRef(null);
  var dragTouchIdRef = useRef(null);    // pointer that owns the drag ('mouse' for pointer)
  var finishBlockDragRef = useRef(null);
  var dragCommitTimerRef = useRef(null);
  var dragCleanupRef = useRef(null);
  var dragFingerOffYRef = useRef(0);
  var dragLastYRef = useRef(0);
  var dragAutoDirRef = useRef(0);       // -1 scroll up / 0 / 1 scroll down (edge autoscroll)
  var dragScrollRafRef = useRef(0);
  var lastDragEvtRef = useRef(0);       // last time the active drag saw one of its own events (zombie detector)

  // Tear down listeners, the rAF autoscroll loop, and the flying clone if
  // the editor unmounts mid-drag; flush a parked commit so the reorder is
  // not lost (finish() updates blocksRef synchronously, and commitSave()
  // persists it even though the store-flush cleanup ran on the old array).
  useEffect(function() {
    return function() {
      if (dragCleanupRef.current) dragCleanupRef.current();
      if (dragScrollRafRef.current) { clearTimeout(dragScrollRafRef.current); dragScrollRafRef.current = 0; }
      if (finishBlockDragRef.current) { finishBlockDragRef.current(); commitSave(); }
      if (dragCloneRef.current && dragCloneRef.current.parentNode)
        dragCloneRef.current.parentNode.removeChild(dragCloneRef.current);
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
  var pendingFocusIdRef = useRef(null);  // block id to focus after the next render
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

  // Multi-touch discipline (same contract as TabsOverview): only the
  // pointer that grabbed the grip moves the block or ends the drag.
  function _dragPoint(e) {
    if (e.touches) {
      for (var i = 0; i < e.touches.length; i++)
        if (e.touches[i].identifier === dragTouchIdRef.current) return e.touches[i];
      return null;
    }
    return dragTouchIdRef.current === 'mouse' ? e : null;
  }
  function _dragEnded(e) {
    if (!e.changedTouches) return dragTouchIdRef.current === 'mouse';
    for (var i = 0; i < e.changedTouches.length; i++)
      if (e.changedTouches[i].identifier === dragTouchIdRef.current) return true;
    for (var j = 0; j < e.touches.length; j++)
      if (e.touches[j].identifier === dragTouchIdRef.current) return false;
    return true; // ours vanished without a changedTouches entry (some touchcancels)
  }

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
  // parks near the top/bottom edge. 16ms timeout loop (~rAF cadence on a
  // visible page, but unlike rAF it still fires in hidden/headless test
  // hosts); speed scales with how deep into the edge zone the finger
  // sits; re-derives the target each step because the content moves
  // under a stationary finger.
  function _updateAutoScroll(clientY) {
    var vh = window.innerHeight || 800;
    var EDGE = 110;
    var dir = clientY < EDGE ? -1 : (clientY > vh - EDGE ? 1 : 0);
    dragAutoDirRef.current = dir;
    if (dir !== 0 && !dragScrollRafRef.current) {
      var step = function() {
        dragScrollRafRef.current = 0;
        if (dragIdxRef.current < 0 || dragAutoDirRef.current === 0) return;
        var scroller = dragScrollerRef.current;
        if (!scroller) return;
        var y = dragLastYRef.current;
        var d = dragAutoDirRef.current;
        var depth = d < 0 ? (EDGE - y) : (y - (vh - EDGE));
        scroller.scrollTop += d * (4 + Math.min(18, depth * 0.25));
        _updateDragTarget(y);
        dragScrollRafRef.current = setTimeout(step, 16);
      };
      dragScrollRafRef.current = setTimeout(step, 16);
    }
  }

  function startBlockDrag(idx, clientY, pointerId) {
    // A just-dropped drag parks its commit while the snap animation plays;
    // flush it so this grab is never silently swallowed.
    if (finishBlockDragRef.current) finishBlockDragRef.current();
    // Zombie self-heal: a LIVE drag sees its own events continuously. If a
    // drag is "active" but has seen nothing for seconds, its end event was
    // lost — abort it, uncommitted, and let this fresh grab proceed.
    if (dragIdxRef.current >= 0 && Date.now() - lastDragEvtRef.current > 2500) {
      if (dragCleanupRef.current) dragCleanupRef.current();
      if (dragScrollRafRef.current) { clearTimeout(dragScrollRafRef.current); dragScrollRafRef.current = 0; }
      if (dragCloneRef.current && dragCloneRef.current.parentNode)
        dragCloneRef.current.parentNode.removeChild(dragCloneRef.current);
      dragCloneRef.current = null;
      blockRefs.current.forEach(function(n) { if (n) { n.style.transform = ''; n.style.transition = ''; } });
      dragIdxRef.current = -1;
      setDragIdx(-1);
      dragTargetRef.current = -1;
    }
    if (dragIdxRef.current >= 0) return;
    var container = blocksContainerRef.current;
    var el = blockRefs.current[idx];
    if (!container || !el) return;
    var scroller = container.closest('.screen-scroll') || document.documentElement;
    dragScrollerRef.current = scroller;
    // Open confirm strips target blocks BY INDEX — close them before the
    // indices move (and before their banner height skews the rect capture).
    setConfirmDelIdx(null);
    setConfirmAudioDelete(null);
    dragTouchIdRef.current = pointerId != null ? pointerId : 'mouse';
    var st = scroller.scrollTop;
    dragRectsRef.current = blockRefs.current.map(function(n) {
      if (!n) return null;
      var r = n.getBoundingClientRect();
      return { top: r.top + st, bottom: r.bottom + st, cy: r.top + st + r.height / 2, h: r.height };
    });
    var rect = el.getBoundingClientRect();
    dragFingerOffYRef.current = clientY - rect.top;
    dragLastYRef.current = clientY;
    dragIdxRef.current = idx;
    dragTargetRef.current = idx;
    lastDragEvtRef.current = Date.now();
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

    var onMove = function(e) {
      var p = _dragPoint(e);
      if (!p) return;
      lastDragEvtRef.current = Date.now();
      if (e.cancelable) { try { e.preventDefault(); } catch (_er) { /* passive — ignore */ } }
      dragLastYRef.current = p.clientY;
      var c = dragCloneRef.current;
      if (c) c.style.top = (p.clientY - dragFingerOffYRef.current) + 'px';
      _updateAutoScroll(p.clientY);
      _updateDragTarget(p.clientY);
    };
    var onEnd = function(e) {
      if (!_dragEnded(e)) return;
      if (dragCleanupRef.current) dragCleanupRef.current();
      endBlockDrag();
    };
    // CAPTURE phase — document-capture runs before ScreenLayout's
    // tap-suppressor can stopPropagation a long-hold lift over the grip
    // (a button = interactive target; see the TabsOverview comment).
    document.addEventListener('touchmove', onMove, { passive: false, capture: true });
    document.addEventListener('touchend', onEnd, true);
    document.addEventListener('touchcancel', onEnd, true);
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseup', onEnd, true);
    dragCleanupRef.current = function() {
      document.removeEventListener('touchmove', onMove, { capture: true });
      document.removeEventListener('touchend', onEnd, true);
      document.removeEventListener('touchcancel', onEnd, true);
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onEnd, true);
      dragCleanupRef.current = null;
    };
    if (navigator.vibrate) { try { navigator.vibrate(35); } catch (_e) { /* unsupported — ignore */ } }
  }

  function endBlockDrag() {
    dragTouchIdRef.current = null;
    dragAutoDirRef.current = 0;
    if (dragScrollRafRef.current) { clearTimeout(dragScrollRafRef.current); dragScrollRafRef.current = 0; }
    if (dragIdxRef.current < 0) return;
    var from = dragIdxRef.current;
    var to = dragTargetRef.current >= 0 ? dragTargetRef.current : from;
    var clone = dragCloneRef.current;
    var rects = dragRectsRef.current;
    var r0 = rects[from];
    // Snap the clone to the slot it will occupy, then commit + clean up.
    if (clone && r0) {
      var st = dragScrollerRef.current ? dragScrollerRef.current.scrollTop : 0;
      var snapTop = to === from ? r0.top
        : (to > from ? (rects[to] ? rects[to].bottom - r0.h : r0.top)
                     : (rects[to] ? rects[to].top : r0.top));
      clone.style.transition = 'top 0.2s cubic-bezier(0.2,0.8,0.3,1)';
      clone.style.top = (snapTop - st) + 'px';
    }
    var finish = function() {
      if (finishBlockDragRef.current !== finish) return;
      finishBlockDragRef.current = null;
      clearTimeout(dragCommitTimerRef.current);
      try {
        if (clone && clone.parentNode) clone.parentNode.removeChild(clone);
        dragCloneRef.current = null;
        blockRefs.current.forEach(function(n) {
          if (n) { n.style.transform = ''; n.style.transition = ''; }
        });
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
      } finally {
        dragIdxRef.current = -1;
        setDragIdx(-1);
        dragTargetRef.current = -1;
      }
    };
    finishBlockDragRef.current = finish;
    dragCommitTimerRef.current = setTimeout(finish, 220);
  }

  // ─── Cursor-aware insertion ─────────────────────────────────
  // The "single body surface" UX: when the user picks a media/card from
  // the FAB +, we split the focused paragraph at the cursor, drop the
  // new block in between, and create a continuation paragraph that we
  // auto-focus so typing keeps flowing.
  function insertAtCursor(block) {
    var info = activeTextareaRef.current;
    var idx = info && info.idx != null ? info.idx : -1;
    var cur = idx >= 0 ? blocks[idx] : null;
    var supportsSplit = cur && (cur.type === 'p' || cur.type === 'h2' || cur.type === 'quote');
    if (!supportsSplit) {
      // No useful caret context (e.g. picker insert with no focused
      // textarea). Append the block, then ensure EXACTLY ONE trailing
      // empty paragraph to keep writing in — never one-per-insert, which
      // previously littered the entry with blank gaps after several embeds.
      var tailIdNoSplit = JournalHelpers.blockId();
      setBlocks(function(arr) {
        var next = arr.slice();
        // Reuse a trailing empty paragraph if there already is one.
        var last = next[next.length - 1];
        if (last && last.type === 'p' && !(last.text || '').trim()) {
          next.splice(next.length - 1, 0, block); // insert before the blank p
        } else {
          next.push(block);
          next.push({ id: tailIdNoSplit, type: 'p', text: '' });
        }
        return next;
      });
      pendingFocusIdRef.current = tailIdNoSplit;
      scheduleSave();
      return;
    }
    var caret = info.caret != null ? info.caret : (info.el ? info.el.selectionStart : (cur.text || '').length);
    var text = cur.text || '';
    var head = text.slice(0, caret);
    var tail = text.slice(caret);
    var tailId = JournalHelpers.blockId();
    var tailBlock = { id: tailId, type: cur.type === 'h2' ? 'p' : cur.type, text: tail };
    if (cur.type === 'quote') tailBlock.cite = '';
    setBlocks(function(arr) {
      var next = arr.slice();
      next[idx] = Object.assign({}, next[idx], { text: head });
      next.splice(idx + 1, 0, block);
      next.splice(idx + 2, 0, tailBlock);
      return next;
    });
    pendingFocusIdRef.current = tailId;
    scheduleSave();
  }

  // After every render, if pendingFocusIdRef is set, focus that block's
  // textarea and move the caret to the start of the tail text.
  useEffect(function() {
    var pid = pendingFocusIdRef.current;
    if (!pid) return;
    pendingFocusIdRef.current = null;
    var el = blocksContainerRef.current && blocksContainerRef.current.querySelector('[data-block-id="' + pid + '"] textarea');
    if (el) {
      try { el.focus(); el.setSelectionRange(0, 0); } catch (_e) { /* DOM access — element may not exist or API unsupported */ }
    }
  });

  // ─── Insert sheet ───────────────────────────────────────────
  function openInsertSheet() {
    setShowInsert(true);
  }
  function handleBlockInsert(block) {
    insertAtCursor(block);
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
      insertAtCursor(JournalHelpers.newBlock('image', { mediaId: mid, caption: '' }));
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
    insertAtCursor(JournalHelpers.newBlock('audio', { mediaId: info.mediaId, duration: info.duration, caption: '', samples: info.samples || null }));
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
        onTouchStart={function(e) { e.stopPropagation(); if (e.touches && e.touches[0]) startBlockDrag(idx, e.touches[0].clientY, e.touches[0].identifier); }}
        onMouseDown={function(e) { e.stopPropagation(); if (e.button === 0) startBlockDrag(idx, e.clientY); }}
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
    var common = {
      key: b.id,
      className: 'jrn-block jrn-block-edit' + (idx === dragIdx ? ' dragging' : ''),
      'data-block-id': b.id,
      ref: setBlockRef(idx)
    };
    if (b.type === 'p' || b.type === 'h2') {
      return (
        <div {...common}>
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
            ref={function(el) { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
          />
          {blockDeleteUI(idx)}
          {blockDragUI(idx)}
        </div>
      );
    }
    if (b.type === 'quote') {
      return (
        <div {...common}>
          <div className="jrn-block-quote">
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
              ref={function(el) { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
            />
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
    pendingFocusIdRef.current = newId;
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
