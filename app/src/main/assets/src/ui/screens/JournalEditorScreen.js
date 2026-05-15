/* ═══════════════════════════════════════════════════════════════
   JOURNAL EDITOR SCREEN — block-list editor
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Depends on: React, ScreenLayout, ThemeBtn, JournalStore,
     JournalMediaStore, JournalHelpers, JournalRecordingSheet,
     JournalInsertSheet, JournalNotebookSheet, JournalBlockView (viewer).

   Implementation choice (per Plan §15 Option A): paragraph/h2/quote
   blocks are textareas (auto-grow). Embed blocks are non-editable
   cards with delete buttons. Markdown shorthand (`**bold**`, `_italic_`,
   `{{ref:Book X:Y}}`, `[[letter:vol/id]]`) is visible while editing —
   trade-off for implementation simplicity, no contenteditable.

   Auto-save: 1.2s debounce after the last keystroke + on blur.

   Props:
     entryId
     onBack()            — back to viewer (or hub if no viewer)
     onSearch, onHistory, historyEnabled
     hlTick, setHlTick
     theme, onThemeChange
═══════════════════════════════════════════════════════════════ */

function JournalEditorScreen(props) {
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
  var mood = _mood[0]; var setMood = _mood[1];

  var _saved = useState('Saved');
  var savedLabel = _saved[0]; var setSavedLabel = _saved[1];

  var _showInsert = useState(false);
  var showInsert = _showInsert[0]; var setShowInsert = _showInsert[1];

  var _showRec = useState(false);
  var showRec = _showRec[0]; var setShowRec = _showRec[1];

  var _showNb = useState(false);
  var showNb = _showNb[0]; var setShowNb = _showNb[1];

  var _insertAfter = useState(null);  // index of block to insert AFTER
  var insertAfter = _insertAfter[0]; var setInsertAfter = _insertAfter[1];

  var fileInputRef = useRef(null);
  var activeTextareaRef = useRef(null);
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
      // If image/audio, drop the media blob too
      if (removed && (removed.type === 'image' || removed.type === 'audio') && removed.mediaId) {
        try { JournalMediaStore.delete(removed.mediaId); } catch (e) {}
      }
      return next.length === 0 ? JournalHelpers.defaultBlocks() : next;
    });
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

  // ─── Insert sheet ───────────────────────────────────────────
  function openInsertSheet(afterIdx) {
    setInsertAfter(afterIdx != null ? afterIdx : blocks.length - 1);
    setShowInsert(true);
  }
  function handleBlockInsert(block) {
    var at = insertAfter != null ? insertAfter : blocks.length - 1;
    insertBlockAt(at, block);
  }
  function handleInsertImage() {
    if (fileInputRef.current) fileInputRef.current.click();
  }
  function handleInsertAudio() {
    setShowRec(true);
  }
  function handleInsertInline(token) {
    // Append into the last-focused textarea if available, otherwise into
    // the last paragraph block.
    var ta = activeTextareaRef.current;
    if (ta && ta.idx != null) {
      var idx = ta.idx;
      var cur = blocks[idx];
      if (cur && (cur.type === 'p' || cur.type === 'h2' || cur.type === 'quote')) {
        var newText = (cur.text || '') + (cur.text && !cur.text.endsWith(' ') ? ' ' : '') + token;
        patchBlock(idx, { text: newText });
        return;
      }
    }
    // Fallback: append a new paragraph
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
      insertBlockAt(blocks.length - 1, JournalHelpers.newBlock('image', { mediaId: mid, caption: '' }));
    }).catch(function(err) {
      console.warn('Image insert failed', err);
      alert('Could not load that image.');
    });
  }

  // ─── Recording sheet save ───────────────────────────────────
  function onRecordingSaved(info) {
    setShowRec(false);
    if (!info || !info.mediaId) return;
    insertBlockAt(blocks.length - 1, JournalHelpers.newBlock('audio', { mediaId: info.mediaId, duration: info.duration, caption: '' }));
  }

  // ─── Mood cycling ───────────────────────────────────────────
  var moodOrder = [null, 'silver', 'deep', 'quiet'];
  function cycleMood() {
    var i = moodOrder.indexOf(mood);
    var next = moodOrder[(i + 1) % moodOrder.length];
    setMood(next);
    scheduleSave();
  }
  var moodClass = mood ? mood : 'none';

  // ─── Block render — editable variants ───────────────────────
  function renderEditableBlock(b, idx) {
    var common = {
      key: b.id,
      className: 'jrn-block'
    };
    if (b.type === 'p' || b.type === 'h2') {
      return React.createElement('div', common,
        React.createElement('textarea', {
          className: 'jrn-block-textarea' + (b.type === 'h2' ? ' h2' : ''),
          rows: 1,
          value: b.text || '',
          placeholder: b.type === 'h2' ? 'Heading…' : 'Write…',
          onChange: function(e) { patchBlock(idx, { text: e.target.value }); },
          onFocus: function() { activeTextareaRef.current = { idx: idx }; },
          onBlur: function() { commitSave(); },
          ref: function(el) { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }
        })
      );
    }
    if (b.type === 'quote') {
      return React.createElement('div', common,
        React.createElement('div', { className: 'jrn-block-quote' },
          React.createElement('textarea', {
            rows: 1,
            value: b.text || '',
            placeholder: 'Quoted text…',
            onChange: function(e) { patchBlock(idx, { text: e.target.value }); },
            onFocus: function() { activeTextareaRef.current = { idx: idx }; },
            onBlur: function() { commitSave(); },
            ref: function(el) { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }
          }),
          React.createElement('input', {
            type: 'text',
            className: 'jrn-block-quote-cite',
            style: { width: '100%', background: 'none', border: 'none', outline: 'none', fontFamily: 'Cinzel, serif', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--gold-dim)', marginTop: '8px' },
            value: b.cite || '',
            placeholder: 'Citation (optional)',
            onChange: function(e) { patchBlock(idx, { cite: e.target.value }); },
            onBlur: function() { commitSave(); }
          })
        ),
        React.createElement('button', { className: 'jrn-emb-delete', onClick: function() { deleteBlock(idx); }, title: 'Delete', 'aria-label': 'Delete' }, '×')
      );
    }
    if (b.type === 'divider') {
      return React.createElement('div', common,
        React.createElement('div', { className: 'jrn-divider' }, '❖  ❖  ❖'),
        React.createElement('button', { className: 'jrn-emb-delete', onClick: function() { deleteBlock(idx); }, title: 'Delete' }, '×')
      );
    }
    if (b.type === 'image') {
      return React.createElement('div', common,
        React.createElement('div', { className: 'jrn-embed-image' },
          React.createElement('button', { className: 'jrn-img-delete', onClick: function() { deleteBlock(idx); }, 'aria-label': 'Delete' }, '×'),
          React.createElement(JournalImageBlock, { mediaId: b.mediaId }),
          React.createElement('input', {
            type: 'text',
            className: 'jrn-img-caption',
            placeholder: 'Caption (optional)',
            value: b.caption || '',
            onChange: function(e) { patchBlock(idx, { caption: e.target.value }); },
            onBlur: function() { commitSave(); }
          })
        )
      );
    }
    if (b.type === 'audio') {
      return React.createElement('div', common,
        React.createElement(JournalAudioBlock, { mediaId: b.mediaId, duration: b.duration, caption: b.caption }),
        React.createElement('button', { className: 'jrn-emb-delete', onClick: function() { deleteBlock(idx); }, style: { display: 'flex' }, title: 'Delete' }, '×')
      );
    }
    // letter-card, chapter-card, verse-block, bookmark-card, note-card, journal-card: read-only embed view + delete
    return React.createElement('div', common,
      React.createElement(JournalBlockView, { block: b, callbacks: {} }),
      React.createElement('button', { className: 'jrn-emb-delete', onClick: function() { deleteBlock(idx); }, title: 'Delete', 'aria-label': 'Delete' }, '×')
    );
  }

  var entryNbIds = useMemo(function() {
    var e = JournalStore.get(entryId);
    return new Set((e && e.notebookIds) || []);
  }, [entryId, props.hlTick]);

  // ─── Nav ────────────────────────────────────────────────────
  var navChildren = React.createElement(React.Fragment, null,
    React.createElement('button', { className: 'nav-home nav-back-icon', onClick: function() { commitSave(); onBack && onBack(); }, title: 'Done', 'aria-label': 'Done' }, '‹'),
    React.createElement('span', { className: 'jrn-saved-ind' }, savedLabel),
    React.createElement(ThemeBtn, { theme: props.theme, onThemeChange: props.onThemeChange })
  );

  return React.createElement(ScreenLayout, { navChildren: navChildren },
    React.createElement('div', { className: 'jrn-editor' },
      React.createElement('input', { ref: fileInputRef, type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: onFileChosen }),
      React.createElement('div', { className: 'jrn-editor-meta' },
        React.createElement('input', {
          className: 'jrn-editor-title',
          type: 'text',
          value: title,
          placeholder: 'Untitled',
          onChange: function(e) { setTitle(e.target.value); scheduleSave(); },
          onBlur: function() { commitSave(); }
        }),
        React.createElement('div', { className: 'jrn-editor-row' },
          React.createElement('span', null, JournalHelpers.longDate(initial && initial.created)),
          React.createElement('span', { style: { opacity: 0.4 } }, '·'),
          React.createElement('div', { className: 'jrn-mood-dot ' + moodClass, title: 'Mood', onClick: cycleMood })
        )
      ),
      React.createElement('div', { className: 'jrn-blocks' },
        blocks.map(function(b, idx) {
          return React.createElement(React.Fragment, { key: b.id },
            renderEditableBlock(b, idx),
            React.createElement('div', { className: 'jrn-between-add', onClick: function() { openInsertSheet(idx); }, title: 'Insert' },
              React.createElement('span', { className: 'plus' }, '+')
            )
          );
        })
      ),
      React.createElement('div', { className: 'jrn-toolbar' },
        React.createElement('div', { className: 'jrn-toolbar-group' },
          React.createElement('button', { className: 'primary', onClick: function() { openInsertSheet(blocks.length - 1); } },
            React.createElement('svg', { viewBox: '0 0 24 24' }, React.createElement('path', { d: 'M12 5v14M5 12h14' })),
            ' Insert'
          )
        ),
        React.createElement('div', { className: 'jrn-toolbar-group' },
          React.createElement('button', { onClick: function() { setShowNb(true); }, title: 'Notebooks' },
            React.createElement('svg', { viewBox: '0 0 24 24' }, React.createElement('path', { d: 'M4 5a2 2 0 012-2h11l3 3v13a2 2 0 01-2 2H6a2 2 0 01-2-2z' }), React.createElement('path', { d: 'M8 7h6' }))
          )
        )
      )
    ),
    showInsert && React.createElement(JournalInsertSheet, {
      excludeJournalId: entryId,
      onClose: function() { setShowInsert(false); },
      onInsertBlock: function(b) { handleBlockInsert(b); setShowInsert(false); },
      onInsertImage: handleInsertImage,
      onRecordAudio: handleInsertAudio,
      onInsertInline: handleInsertInline
    }),
    showRec && React.createElement(JournalRecordingSheet, {
      onSave: onRecordingSaved,
      onClose: function() { setShowRec(false); }
    }),
    showNb && React.createElement(JournalNotebookSheet, {
      entryId: entryId,
      memberIds: entryNbIds,
      onClose: function() { setShowNb(false); commitSave(); },
      onChanged: function() { if (setHlTick) setHlTick(function(t) { return t + 1; }); }
    })
  );
}
