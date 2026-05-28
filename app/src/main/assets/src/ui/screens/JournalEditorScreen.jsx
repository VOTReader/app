/* ═══════════════════════════════════════════════════════════════════════
   JournalEditorScreen — Cluster B (esbuild bundle-b.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function JournalEditorScreen(props) {
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;
  var useMemo = React.useMemo;

  var entryId = props.entryId;
  var onBack = props.onBack;
  var setHlTick = props.setHlTick;

  var initial = useMemo(function() {
    return entryId ? JournalStore.get(entryId) : null;
  }, [entryId]);

  // Local working state — we don't re-derive from JournalStore on hlTick
  // because that would clobber in-progress edits.
  var _title = useState((initial && initial.title) || '');
  var title = _title[0]; var setTitle = _title[1];

  var _blocks = useState((initial && initial.blocks) || JournalHelpers.defaultBlocks());
  var blocks = _blocks[0]; var setBlocks = _blocks[1];

  var _mood = useState((initial && initial.mood) || null);
  // TODO Q3-followup: setMood is never called — mood loads from the existing
  //   entry but the editor has no UI to change it. Likely a wiring gap
  //   (mood-picker UI was never built or got removed). Keeping the read
  //   plumbing intact so existing-mood persists round-trip; underscore on
  //   the setter marks "intentionally unused for now" per Q3 exit criteria.
  var mood = _mood[0]; var _setMood = _mood[1];

  var _saved = useState('Saved');
  var savedLabel = _saved[0]; var setSavedLabel = _saved[1];

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
  var _confirmDel = useState(null);
  var confirmDelIdx = _confirmDel[0]; var setConfirmDelIdx = _confirmDel[1];

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setConfirmDelIdx is a tuple-unpacked useState setter (identity-stable per React invariant; eslint can't trace this form back to its useState origin).
  }, [confirmDelIdx]);

  var fileInputRef = useRef(null);
  // activeTextareaRef tracks { idx, el, caret } so insertion knows where to
  // split. caret stays current via onSelect/onKeyUp/onClick on the textarea.
  var activeTextareaRef = useRef(null);
  var blocksContainerRef = useRef(null);
  var pendingFocusIdRef = useRef(null);  // block id to focus after the next render
  var firstRunRef = useRef(true);

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
    var t = setTimeout(function() {
      JournalStore.update(entryId, { title: title, blocks: blocks, mood: mood });
      setSavedLabel('Saved');
      if (setHlTick) setHlTick(function(tx) { return tx + 1; });
    }, 1200);
    return function() { clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSavedLabel is a tuple-unpacked useState setter (identity-stable); setHlTick is a prop from App() whose origin is useState (identity-stable per React invariant). Effect intent is debounced-save on content change, not on setter-identity churn.
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

  function commitSave() {
    // Synchronous immediate save, e.g. when navigating away via Done.
    if (!entryId) return;
    JournalStore.update(entryId, { title: titleRef.current, blocks: blocksRef.current, mood: moodRef.current });
    setSavedLabel('Saved');
    if (setHlTick) setHlTick(function(t) { return t + 1; });
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

  // ─── Block render — editable variants ───────────────────────
  function renderEditableBlock(b, idx) {
    var common = {
      key: b.id,
      className: 'jrn-block jrn-block-edit',
      'data-block-id': b.id
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
        </div>
      );
    }
    if (b.type === 'divider') {
      return (
        <div {...common}>
          <div className="jrn-divider">❖  ❖  ❖</div>
          {blockDeleteUI(idx)}
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
