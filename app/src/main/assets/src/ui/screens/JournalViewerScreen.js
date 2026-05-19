/* ═══════════════════════════════════════════════════════════════
   JOURNAL VIEWER SCREEN — read-only entry render
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Depends on: React, ScreenLayout, ThemeBtn, JournalStore,
     JournalMediaStore, JournalHelpers, navigateToLink, openInAppLetter,
     COL_BY_KEY (for letter-link routing).

   Props:
     entryId
     onBack()                           — back to hub
     onEdit()                           — pencil → editor
     onNavigateToLink(endpoint, meta)   — for outbound tap-through
     onOpenJournalEntry(targetId)       — for journal→journal links
     onSearch, onHistory, historyEnabled
     hlTick, setHlTick                  — to refresh after pin/delete
     theme, onThemeChange
═══════════════════════════════════════════════════════════════ */

/* Shared utility for rendering inline markup in p/h2/quote text.
   Returns an array of React nodes. Used by viewer + editor preview. */
function jrnRenderInline(text, callbacks) {
  if (!text) return null;
  callbacks = callbacks || {};
  // Tokenize: keep order of bold, italic, ref, links by scanning sequentially.
  var nodes = [];
  var keyCounter = 0;
  // Pattern matches any of our inline syntaxes
  var re = /\*\*([\s\S]+?)\*\*|_([^_\n]+?)_|\{\{ref:([^}]+)\}\}|\[\[(letter|bookmark|journal):([^\]]+)\]\]/g;
  var last = 0;
  var m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.substring(last, m.index));
    if (m[1] != null) {
      nodes.push(React.createElement('strong', { key: 'i' + (keyCounter++) }, m[1]));
    } else if (m[2] != null) {
      nodes.push(React.createElement('em', { key: 'i' + (keyCounter++) }, m[2]));
    } else if (m[3] != null) {
      var ref = m[3].trim();
      nodes.push(React.createElement('span', {
        key: 'i' + (keyCounter++),
        className: 'jrn-inline-ref',
        onClick: function() { callbacks.onScriptureRef && callbacks.onScriptureRef(ref); }
      }, ref));
    } else if (m[4] != null) {
      var kind = m[4]; var data = m[5].trim();
      var label = data;
      if (kind === 'letter') {
        var parts = data.split('/');
        var ctx = (typeof findEntryContext === 'function') ? findEntryContext(parts[1], 'letter') : null;
        if (ctx && ctx.title) label = ctx.title;
      } else if (kind === 'bookmark') {
        var b = (typeof BookmarkStore !== 'undefined') ? BookmarkStore.get(data) : null;
        if (b) label = b.label || 'Bookmark';
      } else if (kind === 'journal') {
        var je = (typeof JournalStore !== 'undefined') ? JournalStore.get(data) : null;
        if (je) label = JournalHelpers.entryDisplayTitle(je) || 'Journal Entry';
      }
      nodes.push(React.createElement('span', {
        key: 'i' + (keyCounter++),
        className: 'jrn-inline-' + kind,
        onClick: function() { callbacks.onInlineLink && callbacks.onInlineLink(kind, data); }
      }, label));
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.substring(last));
  return nodes;
}

/* JrnExpandable was promoted to its own shared module
   (src/components/ExpandableText.js) since Journal, Bookmarks and
   Notes all depend on it. It is still available globally here as
   `JrnExpandable` (back-compat alias) and as `ExpandableText`.
   The script tag loads BEFORE this file in index.html. */

/* Renders one block as read-only React. Used by viewer + editor preview.
   `entryId` + `blockIndex` (when passed) wire up data-hl-key/data-hl-dom on
   the rendered p/h2/quote so the app-wide annotation system (highlights,
   notes, links, bookmarks) picks up the paragraph automatically — same
   contract LetterView/WtlbEntryView use. */
function JournalBlockView({ block, callbacks, entryId, blockIndex }) {
  if (!block) return null;
  callbacks = callbacks || {};
  var b = block;
  var hlKey = entryId != null && blockIndex != null ? ('journal:' + entryId + ':' + blockIndex) : null;
  var hlProps = hlKey ? { 'data-hl-key': hlKey, 'data-hl-dom': true } : null;

  if (b.type === 'p') {
    return React.createElement('p', Object.assign({ className: 'jrn-p' }, hlProps || {}), jrnRenderInline(b.text || '', callbacks));
  }
  if (b.type === 'h2') {
    return React.createElement('h2', Object.assign({ className: 'jrn-h2' }, hlProps || {}), jrnRenderInline(b.text || '', callbacks));
  }
  if (b.type === 'quote') {
    var qText = b.text || '';
    var qLong = qText.length > 240;
    return React.createElement('div', { className: 'jrn-block-quote' },
      qLong
        ? React.createElement(JrnExpandable, {
            text: qText,
            threshold: 240,
            className: 'jrn-block-quote-body'
          })
        : React.createElement('div', Object.assign({ className: 'jrn-block-quote-body' }, hlProps || {}), jrnRenderInline(qText, callbacks)),
      b.cite && React.createElement('div', { className: 'jrn-block-quote-cite' }, b.cite)
    );
  }
  if (b.type === 'divider') {
    return React.createElement('div', { className: 'jrn-divider' }, '❖  ❖  ❖');
  }
  if (b.type === 'letter-card') {
    var lc = JournalHelpers.resolveLetterCard(b.volKey, b.letterId, b.excerpt);
    if (!lc) return React.createElement('div', { className: 'jrn-embed-letter', onClick: function() { callbacks.onLetterCard && callbacks.onLetterCard(b.volKey, b.letterId); } },
      React.createElement('div', { className: 'jrn-emb-eyebrow' }, 'Letter'),
      React.createElement('h4', { className: 'jrn-emb-title' }, b.letterId)
    );
    return React.createElement('div', { className: 'jrn-embed-letter' + (lc.isExcerpt ? ' is-excerpt' : ''), onClick: function() { callbacks.onLetterCard && callbacks.onLetterCard(b.volKey, b.letterId); }, role: 'button' },
      lc.date && React.createElement('div', { className: 'jrn-emb-date' }, lc.date),
      React.createElement('div', { className: 'jrn-emb-eyebrow' }, lc.isExcerpt ? lc.eyebrow + ' · Excerpt' : lc.eyebrow),
      React.createElement('h4', { className: 'jrn-emb-title' }, lc.title),
      lc.body && React.createElement(JrnExpandable, {
        text: lc.body,
        threshold: lc.isExcerpt ? 240 : 180,
        className: 'jrn-emb-body' + (lc.isExcerpt ? ' jrn-emb-excerpt' : '')
      })
    );
  }
  if (b.type === 'chapter-card') {
    var cc = JournalHelpers.resolveChapterCard(b.bookId, b.chapter);
    return React.createElement('div', { className: 'jrn-embed-chapter', onClick: function() { callbacks.onChapterCard && callbacks.onChapterCard(b.bookId, b.chapter, b.isStudy); }, role: 'button' },
      React.createElement('div', { className: 'jrn-emb-eyebrow' }, cc ? cc.eyebrow : 'Bible'),
      React.createElement('h4', { className: 'jrn-emb-title' }, cc ? cc.title : (b.bookId + ' ' + b.chapter))
    );
  }
  if (b.type === 'verse-block') {
    var vb = JournalHelpers.resolveVerseBlock(b.ref, b.text);
    var isExcerpt = !!b.partial || !!vb.isExcerpt;
    var verseText = vb.text || '';
    return React.createElement('div', { className: 'jrn-embed-verse' + (isExcerpt ? ' is-excerpt' : ''),
      onClick: function() {
        // Tap on a verse excerpt navigates back to the source chapter
        // (verse if available). Excerpt info isn't carried — see CLAUDE.md
        // §6.1 for the navigation contract.
        if (!callbacks.onChapterCard || b.bookId == null || b.chapter == null) return;
        callbacks.onChapterCard(b.bookId, b.chapter, b.isStudy, b.verse, b.verseEnd);
      },
      role: callbacks.onChapterCard && b.bookId != null ? 'button' : null,
      style: callbacks.onChapterCard && b.bookId != null ? { cursor: 'pointer' } : null
    },
      React.createElement('div', { className: 'jrn-emb-cite' }, isExcerpt ? vb.cite + ' · Excerpt' : vb.cite),
      verseText
        ? React.createElement(JrnExpandable, {
            text: verseText,
            threshold: 240,
            className: 'jrn-emb-text' + (isExcerpt ? ' jrn-emb-excerpt' : '')
          })
        : React.createElement('div', { className: 'jrn-emb-text' },
            React.createElement('em', { style: { color: 'var(--gold-dim)' } }, 'Verse text not available offline.'))
    );
  }
  if (b.type === 'bookmark-card') {
    var bc = JournalHelpers.resolveBookmarkCard(b.bookmarkId);
    return React.createElement('div', { className: 'jrn-embed-bookmark', onClick: function() { callbacks.onBookmarkCard && callbacks.onBookmarkCard(b.bookmarkId); }, role: 'button' },
      React.createElement('div', { className: 'jrn-emb-eyebrow' }, bc ? bc.eyebrow : 'Bookmark'),
      React.createElement('h4', { className: 'jrn-emb-title' }, bc ? bc.title : 'Bookmark'),
      bc && bc.body && React.createElement(JrnExpandable, { text: bc.body, threshold: 200, className: 'jrn-emb-body' })
    );
  }
  if (b.type === 'note-card') {
    var nc = JournalHelpers.resolveNoteCard(b.noteGroupId);
    // Tapping the body text expands/collapses it (read the full note
    // without leaving the journal). Tapping anywhere ELSE on the card
    // opens the note at its inline source location (NOT the notebook).
    return React.createElement('div', { className: 'jrn-embed-note', onClick: function() { callbacks.onNoteCard && callbacks.onNoteCard(b.noteGroupId); }, role: 'button' },
      React.createElement('div', { className: 'jrn-emb-eyebrow' }, nc ? nc.eyebrow : 'Note'),
      React.createElement('h4', { className: 'jrn-emb-title' }, nc ? nc.title : 'Note'),
      nc && nc.body && React.createElement(JrnExpandable, { text: nc.body, threshold: 200, className: 'jrn-emb-body', tapToToggle: true })
    );
  }
  if (b.type === 'journal-card') {
    var je = (typeof JournalStore !== 'undefined') ? JournalStore.get(b.entryId) : null;
    var jcPreview = je ? JournalHelpers.previewText(je, 320) : '';
    return React.createElement('div', { className: 'jrn-embed-journal', onClick: function() { callbacks.onJournalCard && callbacks.onJournalCard(b.entryId); }, role: 'button' },
      React.createElement('div', { className: 'jrn-emb-eyebrow' }, 'Linked Entry'),
      React.createElement('h4', { className: 'jrn-emb-title' }, je ? (JournalHelpers.entryDisplayTitle(je) || 'Untitled') : '(Deleted)'),
      jcPreview && React.createElement(JrnExpandable, { text: jcPreview, threshold: 180, className: 'jrn-emb-body' })
    );
  }
  if (b.type === 'notebook-card') {
    var nbc = JournalHelpers.resolveNotebookCard(b.notebookId);
    return React.createElement('div', {
      className: 'jrn-embed-notebook', role: 'button',
      onClick: function() { callbacks.onNotebookCard && callbacks.onNotebookCard(b.notebookId); }
    },
      React.createElement('div', { className: 'jrn-emb-notebook-icon' },
        React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.6', strokeLinecap: 'round', strokeLinejoin: 'round' },
          React.createElement('path', { d: 'M4 4h11l5 5v11a1 1 0 0 1-1 1H4z' }),
          React.createElement('polyline', { points: '15 4 15 9 20 9' }),
          React.createElement('line', { x1: '8', y1: '14', x2: '15', y2: '14' })
        )
      ),
      React.createElement('div', { className: 'jrn-emb-notebook-text' },
        React.createElement('div', { className: 'jrn-emb-eyebrow' }, nbc ? nbc.eyebrow : 'Notebook'),
        React.createElement('h4', { className: 'jrn-emb-title' }, nbc ? nbc.title : 'Notebook')
      ),
      React.createElement('span', { className: 'jrn-emb-notebook-arrow' }, '›')
    );
  }
  if (b.type === 'journal-excerpt') {
    // Text embedded from another journal entry. Render as a quote card
    // with an italic body, optional cite line, and a "From <source>" eyebrow
    // that opens the source entry.
    var srcTitle = b.sourceJournalTitle || '';
    if (!srcTitle && b.sourceJournalId && typeof JournalStore !== 'undefined') {
      var src = JournalStore.get(b.sourceJournalId);
      if (src) srcTitle = JournalHelpers.entryDisplayTitle(src) || 'Untitled';
    }
    var openSource = function(e) {
      if (e) e.stopPropagation();
      if (b.sourceJournalId && callbacks.onJournalCard) callbacks.onJournalCard(b.sourceJournalId);
    };
    return React.createElement('div', { className: 'jrn-embed-journal-excerpt' + (b.originType === 'h2' ? ' is-heading' : '') },
      srcTitle && React.createElement('div', { className: 'jrn-emb-eyebrow jrn-excerpt-source', onClick: openSource, role: 'button' }, 'From: ' + srcTitle),
      React.createElement(JrnExpandable, {
        text: b.text || '',
        threshold: 240,
        className: 'jrn-emb-excerpt-body' + (b.originType === 'quote' ? ' is-quote' : '')
      }),
      b.cite && React.createElement('div', { className: 'jrn-emb-cite' }, b.cite)
    );
  }
  if (b.type === 'image') {
    var srcImg = b.sourceJournalTitle || '';
    if (!srcImg && b.sourceJournalId && typeof JournalStore !== 'undefined') {
      var srcEnt = JournalStore.get(b.sourceJournalId);
      if (srcEnt) srcImg = JournalHelpers.entryDisplayTitle(srcEnt) || 'Untitled';
    }
    return React.createElement('div', { className: 'jrn-linked-wrap' + (b.sourceJournalId ? ' is-linked' : '') },
      b.sourceJournalId && srcImg && React.createElement('div', {
        className: 'jrn-emb-eyebrow jrn-excerpt-source',
        onClick: function() { if (callbacks.onJournalCard) callbacks.onJournalCard(b.sourceJournalId); },
        role: 'button'
      }, 'From: ' + srcImg),
      React.createElement(JournalImageBlock, { mediaId: b.mediaId, caption: b.caption })
    );
  }
  if (b.type === 'audio') {
    var srcAud = b.sourceJournalTitle || '';
    if (!srcAud && b.sourceJournalId && typeof JournalStore !== 'undefined') {
      var srcEnt2 = JournalStore.get(b.sourceJournalId);
      if (srcEnt2) srcAud = JournalHelpers.entryDisplayTitle(srcEnt2) || 'Untitled';
    }
    return React.createElement('div', { className: 'jrn-linked-wrap' + (b.sourceJournalId ? ' is-linked' : '') },
      b.sourceJournalId && srcAud && React.createElement('div', {
        className: 'jrn-emb-eyebrow jrn-excerpt-source',
        onClick: function() { if (callbacks.onJournalCard) callbacks.onJournalCard(b.sourceJournalId); },
        role: 'button'
      }, 'From: ' + srcAud),
      React.createElement(JournalAudioBlock, { mediaId: b.mediaId, duration: b.duration, caption: b.caption, samples: b.samples })
    );
  }
  return null;
}

/* Async image block: fetches Blob URL from IDB on mount. */
function JournalImageBlock({ mediaId, caption }) {
  var useState = React.useState;
  var useEffect = React.useEffect;
  var _src = useState(null);
  var src = _src[0]; var setSrc = _src[1];
  useEffect(function() {
    var cancelled = false;
    if (mediaId && typeof JournalMediaStore !== 'undefined') {
      JournalMediaStore.objectUrl(mediaId).then(function(url) {
        if (!cancelled) setSrc(url || null);
      });
    }
    return function() { cancelled = true; };
  }, [mediaId]);

  return React.createElement('div', { className: 'jrn-embed-image' },
    src
      ? React.createElement('img', { src: src, alt: caption || '' })
      : React.createElement('div', { style: { width: '100%', height: '180px', background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold-dim)', fontStyle: 'italic', fontFamily: 'EB Garamond, serif' } }, 'Image unavailable'),
    caption && React.createElement('div', { className: 'jrn-img-caption', style: { padding: '8px 14px' } }, caption)
  );
}

/* Async audio block. Play left, waveform/scrub middle, optional inline
   delete-with-confirm right. Used in viewer (read-only) AND editor
   (editable=true + onRequestDelete/onConfirmDelete/onCancelDelete +
   confirming). When `samples` is provided (Float array from recording
   capture), the waveform renders the real shape rather than a decorative
   sine. */
function JournalAudioBlock(props) {
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;
  var mediaId = props.mediaId;
  var duration = props.duration;
  var caption = props.caption;
  var samples = props.samples;
  var editable = !!props.editable;
  var confirming = !!props.confirming;

  var _src = useState(null);
  var src = _src[0]; var setSrc = _src[1];
  var audioRef = useRef(null);
  var _playing = useState(false);
  var playing = _playing[0]; var setPlaying = _playing[1];
  var _progress = useState(0);  // 0..1
  var progress = _progress[0]; var setProgress = _progress[1];
  var _curTime = useState(0);
  var curTime = _curTime[0]; var setCurTime = _curTime[1];

  useEffect(function() {
    var cancelled = false;
    if (mediaId && typeof JournalMediaStore !== 'undefined') {
      JournalMediaStore.objectUrl(mediaId).then(function(url) {
        if (!cancelled) setSrc(url || null);
      });
    }
    return function() { cancelled = true; };
  }, [mediaId]);

  function toggle(e) {
    if (e) { e.stopPropagation(); }
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
  }

  function onTimeUpdate() {
    var a = audioRef.current;
    if (!a) return;
    var dur = duration || a.duration || 0;
    setCurTime(a.currentTime || 0);
    setProgress(dur > 0 ? Math.min(1, (a.currentTime || 0) / dur) : 0);
  }

  function seekFromEvent(e) {
    if (!audioRef.current) return;
    var rect = e.currentTarget.getBoundingClientRect();
    var x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    var ratio = Math.max(0, Math.min(1, x / rect.width));
    var dur = duration || audioRef.current.duration || 0;
    if (dur > 0) {
      audioRef.current.currentTime = ratio * dur;
      setProgress(ratio);
      setCurTime(ratio * dur);
    }
  }

  // Build the waveform bars from captured samples when available, else
  // fall back to a gentle decorative pattern.
  var barCount = 40;
  var bars = [];
  for (var i = 0; i < barCount; i++) {
    var h;
    if (samples && samples.length) {
      var idx = Math.min(samples.length - 1, Math.floor(i * samples.length / barCount));
      h = Math.max(4, Math.min(22, Math.round(samples[idx] * 22)));
    } else {
      h = 6 + Math.round(Math.abs(Math.sin(i * 0.6 + i * 0.13)) * 16);
    }
    bars.push(React.createElement('div', {
      key: i,
      className: 'bar' + (progress > 0 && (i / barCount) <= progress ? ' is-played' : ''),
      style: { height: h + 'px' }
    }));
  }

  var deleteUI = null;
  if (editable) {
    if (confirming) {
      deleteUI = React.createElement('div', { className: 'jrn-aud-delete-confirm', onClick: function(e) { e.stopPropagation(); } },
        React.createElement('span', { className: 'jrn-aud-delete-q' }, 'Delete?'),
        React.createElement('button', {
          className: 'jrn-aud-delete-cancel',
          onClick: function(e) { e.stopPropagation(); props.onCancelDelete && props.onCancelDelete(); },
          'aria-label': 'Cancel'
        }, '×'),
        React.createElement('button', {
          className: 'jrn-aud-delete-yes',
          onClick: function(e) { e.stopPropagation(); props.onConfirmDelete && props.onConfirmDelete(); },
          'aria-label': 'Confirm delete'
        },
          React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2.4', strokeLinecap: 'round', strokeLinejoin: 'round' },
            React.createElement('polyline', { points: '20 6 9 17 4 12' })
          )
        )
      );
    } else {
      deleteUI = React.createElement('button', {
        className: 'jrn-aud-delete', title: 'Delete', 'aria-label': 'Delete',
        onClick: function(e) { e.stopPropagation(); props.onRequestDelete && props.onRequestDelete(); }
      },
        React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.8', strokeLinecap: 'round', strokeLinejoin: 'round' },
          React.createElement('polyline', { points: '3 6 5 6 21 6' }),
          React.createElement('path', { d: 'M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6' }),
          React.createElement('path', { d: 'M10 11v6M14 11v6' })
        )
      );
    }
  }

  var dur = duration || 0;
  var timeStr = JournalHelpers.formatDuration(curTime || 0) + ' / ' + JournalHelpers.formatDuration(dur);

  return React.createElement('div', { className: 'jrn-embed-audio' + (editable ? ' is-editable' : '') },
    React.createElement('button', { className: 'jrn-aud-play', onClick: toggle, 'aria-label': playing ? 'Pause' : 'Play' },
      React.createElement('svg', { viewBox: '0 0 24 24', fill: 'currentColor' },
        playing
          ? React.createElement('path', { d: 'M6 4h4v16H6zM14 4h4v16h-4z' })
          : React.createElement('path', { d: 'M6 3v18l16-9z' })
      )
    ),
    React.createElement('div', { className: 'jrn-aud-body' },
      React.createElement('div', {
        className: 'jrn-aud-waveform',
        onClick: seekFromEvent,
        role: 'slider', 'aria-label': 'Seek',
        style: { cursor: 'pointer' }
      }, bars),
      React.createElement('div', { className: 'jrn-aud-meta' },
        React.createElement('span', null, caption || 'Voice memo'),
        React.createElement('span', null, timeStr)
      )
    ),
    deleteUI,
    src && React.createElement('audio', {
      ref: audioRef,
      src: src,
      style: { display: 'none' },
      onPlay: function() { setPlaying(true); },
      onPause: function() { setPlaying(false); },
      onEnded: function() { setPlaying(false); setProgress(0); setCurTime(0); },
      onTimeUpdate: onTimeUpdate
    })
  );
}

/* ─── Shared pin icon SVG ────────────────────────────────────
   A thumbtack / push-pin — deliberately distinct from the
   bookmark-ribbon icon used elsewhere in the app. Diagonal
   pinned-tack silhouette so "pinned entry" never reads as
   "bookmark". Filled = pinned, outline = unpinned. */
function jrnPinIcon(filled) {
  return React.createElement('svg', { viewBox: '0 0 24 24', fill: filled ? 'currentColor' : 'none', stroke: 'currentColor', strokeWidth: '1.7', strokeLinecap: 'round', strokeLinejoin: 'round' },
    React.createElement('path', { d: 'M9 4.5 L19.5 15 M15 3.5 a1.5 1.5 0 0 1 0 2.1 L13 7.5 l1.8 4.6 -2 2 -8.4 -8.4 2-2 4.6 1.8 1.9-1.9 a1.5 1.5 0 0 1 2.1 0z' }),
    React.createElement('path', { d: 'M8 12 L3 19', stroke: 'currentColor', fill: 'none' })
  );
}

/* ─── Main viewer screen ─────────────────────────────────── */
function JournalViewerScreen(props) {
  var useState = React.useState;
  var useMemo = React.useMemo;

  var entryId = props.entryId;
  var onBack = props.onBack;
  var onHome = props.onHome;
  var onEdit = props.onEdit;
  var onNavigateToLink = props.onNavigateToLink;
  var onOpenJournalEntry = props.onOpenJournalEntry;
  var onOpenNotebook = props.onOpenNotebook;
  var setHlTick = props.setHlTick;

  var entry = useMemo(function() {
    return entryId ? JournalStore.get(entryId) : null;
  }, [entryId, props.hlTick]);

  // Triple-confirmation flow for entry deletion (Settings-style).
  // confirmStep: 0 = idle, 1 = first ask, 2 = second ask, 3 = final type-DELETE
  var _confirmStep = useState(0);
  var confirmStep = _confirmStep[0]; var setConfirmStep = _confirmStep[1];
  var _typedDelete = useState('');
  var typedDelete = _typedDelete[0]; var setTypedDelete = _typedDelete[1];

  function bump() { if (setHlTick) setHlTick(function(t) { return t + 1; }); }

  function startDelete() { setConfirmStep(1); setTypedDelete(''); }
  function nextDeleteStep() {
    if (confirmStep < 3) setConfirmStep(confirmStep + 1);
  }
  function cancelDelete() { setConfirmStep(0); setTypedDelete(''); }

  // ─── Journal→journal back-stack ─────────────────────────────
  // Self-contained breadcrumb (independent of the app's letter
  // tap-through stack). onJournalCard pushes the origin before
  // navigating; the pill + nav-back here pop it. Single-shot: the
  // pill only shows when the stack top's destId IS the entry we're
  // on, so navigating onward naturally hides it.
  if (typeof window !== 'undefined' && !window.__journalBackStack) window.__journalBackStack = [];
  var _jstack = (typeof window !== 'undefined' && window.__journalBackStack) || [];
  var jrnBack = (_jstack.length && entry && _jstack[_jstack.length - 1].destId === entry.id)
    ? _jstack[_jstack.length - 1] : null;
  function jrnGoBack() {
    if (jrnBack && _jstack.length) {
      _jstack.pop();
      if (onOpenJournalEntry) { onOpenJournalEntry(jrnBack.fromId); return; }
    }
    onBack && onBack();
  }

  // ─── Shared nav (back left, others right) ───────────────────
  function buildNavChildren(extras) {
    // Standard app-wide Library nav. Screen-specific actions (pin/delete)
    // ride along as rightExtras → far right of the icon cluster.
    return LibraryNav({
      onBack: jrnGoBack,
      onSearch: props.onSearch,
      onHistory: props.onHistory,
      onSettings: props.onSettings,
      theme: props.theme,
      onThemeChange: props.onThemeChange,
      rightExtras: (extras && extras.right) || null
    });
  }

  if (!entry) {
    return React.createElement(ScreenLayout, { navChildren: buildNavChildren() },
      React.createElement('div', { className: 'jrn-empty' },
        React.createElement('div', { className: 'jrn-empty-title' }, 'Entry Not Found'),
        React.createElement('div', { className: 'jrn-empty-hint' }, 'This journal entry may have been deleted.')
      )
    );
  }

  var sourceMeta = { sourceLetterTitle: 'My Journal · ' + (JournalHelpers.entryDisplayTitle(entry) || 'Entry') };

  var callbacks = {
    onLetterCard: function(volKey, letterId) {
      var ep = JournalHelpers.refKeyToEndpoint('letter:' + volKey + '/' + letterId);
      if (ep && onNavigateToLink) onNavigateToLink(ep, sourceMeta);
    },
    onChapterCard: function(bookId, chapter, isStudy, verse, verseEnd) {
      var endpoint = { type: isStudy ? 'study' : 'bible', bookId: bookId, chapter: chapter };
      if (verse != null) endpoint.verse = verse;
      if (verseEnd != null) endpoint.verseEnd = verseEnd;
      onNavigateToLink && onNavigateToLink(endpoint, sourceMeta);
    },
    onBookmarkCard: function(bid) {
      var ep = JournalHelpers.refKeyToEndpoint('bookmark:' + bid);
      if (ep && onNavigateToLink) onNavigateToLink(ep, sourceMeta);
    },
    onNoteCard: function(gid) {
      var ep = JournalHelpers.refKeyToEndpoint('note:' + gid);
      if (ep && onNavigateToLink) onNavigateToLink(ep, sourceMeta);
    },
    onJournalCard: function(eid) {
      // Push the origin so the destination shows a "Back to <this entry>"
      // pill and the nav-back returns here instead of dead-ending at the hub.
      if (eid && entry && eid !== entry.id && typeof window !== 'undefined') {
        if (!window.__journalBackStack) window.__journalBackStack = [];
        if (window.__journalBackStack.length > 20) window.__journalBackStack.shift();
        window.__journalBackStack.push({
          destId: eid,
          fromId: entry.id,
          fromTitle: JournalHelpers.entryDisplayTitle(entry) || 'Untitled'
        });
      }
      onOpenJournalEntry && onOpenJournalEntry(eid);
    },
    onNotebookCard: function(nbId) {
      if (onOpenNotebook) onOpenNotebook(nbId);
    },
    onScriptureRef: function(ref) {
      if (typeof window.__openScriptureSheet === 'function') {
        window.__openScriptureSheet(ref);
      }
    },
    onInlineLink: function(kind, data) {
      if (kind === 'letter') {
        var parts = data.split('/');
        callbacks.onLetterCard(parts[0], parts[1]);
      } else if (kind === 'bookmark') {
        callbacks.onBookmarkCard(data);
      } else if (kind === 'journal') {
        callbacks.onJournalCard(data);
      }
    }
  };

  function togglePin() {
    JournalStore.togglePin(entry.id);
    bump();
  }
  function doDelete() {
    JournalStore.remove(entry.id);
    bump();
    onBack && onBack();
  }

  // Pin + delete in the nav row (right side), edit moved to a FAB.
  var navExtras = React.createElement(React.Fragment, null,
    React.createElement('button', {
      className: 'nav-search-btn jrn-pin-btn' + (entry.pinned ? ' is-pinned' : ''),
      onClick: togglePin,
      title: entry.pinned ? 'Unpin entry' : 'Pin entry',
      'aria-label': entry.pinned ? 'Unpin entry' : 'Pin entry',
      'aria-pressed': !!entry.pinned
    }, jrnPinIcon(!!entry.pinned)),
    React.createElement('button', {
      className: 'nav-search-btn jrn-del-btn',
      onClick: startDelete,
      title: 'Delete entry',
      'aria-label': 'Delete entry'
    },
      React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.7', strokeLinecap: 'round', strokeLinejoin: 'round' },
        React.createElement('polyline', { points: '3 6 5 6 21 6' }),
        React.createElement('path', { d: 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' }),
        React.createElement('path', { d: 'M10 11v6M14 11v6' })
      )
    )
  );

  // Three-step delete confirmation UI — surfaces below the nav as a banner
  // so it can't be tapped past. Each step requires explicit affirmation.
  function renderDeleteBanner() {
    if (confirmStep === 0) return null;
    var stepLabel = confirmStep === 1 ? 'Step 1 of 3'
      : confirmStep === 2 ? 'Step 2 of 3'
      : 'Step 3 of 3';
    var question = confirmStep === 1 ? 'Delete this entry?'
      : confirmStep === 2 ? 'Are you sure? This cannot be undone.'
      : 'Type DELETE to permanently remove this entry.';
    return React.createElement('div', { className: 'jrn-tripledel jrn-tripledel-step' + confirmStep },
      React.createElement('div', { className: 'jrn-tripledel-step-label' }, stepLabel),
      React.createElement('div', { className: 'jrn-tripledel-question' }, question),
      confirmStep === 3 && React.createElement('input', {
        type: 'text',
        className: 'jrn-tripledel-input',
        placeholder: 'Type DELETE',
        value: typedDelete,
        autoFocus: true,
        onChange: function(e) { setTypedDelete(e.target.value); }
      }),
      React.createElement('div', { className: 'jrn-tripledel-actions' },
        React.createElement('button', { className: 'jrn-tripledel-cancel', onClick: cancelDelete }, 'Cancel'),
        confirmStep < 3 && React.createElement('button', { className: 'jrn-tripledel-next', onClick: nextDeleteStep },
          confirmStep === 1 ? 'Continue' : 'I am sure'
        ),
        confirmStep === 3 && React.createElement('button', {
          className: 'jrn-tripledel-final',
          onClick: doDelete,
          disabled: typedDelete.trim().toUpperCase() !== 'DELETE'
        }, 'Delete forever')
      )
    );
  }

  var displayTitle = JournalHelpers.entryDisplayTitle(entry);

  return React.createElement(ScreenLayout, { navChildren: buildNavChildren({ right: navExtras }) },
    React.createElement('div', { className: 'jrn-viewer' },
      // Single-shot "Back to <origin>" pill for journal→journal tap-throughs.
      jrnBack && React.createElement('div', { className: 'back-hint-row' },
        React.createElement('button', { className: 'back-hint-pill', onClick: jrnGoBack, 'aria-label': 'Back to ' + jrnBack.fromTitle },
          React.createElement('span', { className: 'back-hint-arrow' }, '‹'),
          'Back to ',
          React.createElement('span', { className: 'back-hint-title' }, jrnBack.fromTitle)
        )
      ),
      React.createElement('div', { className: 'jrn-viewer-meta' },
        React.createElement('h1', { className: 'jrn-viewer-title' + (displayTitle ? '' : ' untitled') }, displayTitle || 'Untitled'),
        React.createElement('div', { className: 'jrn-viewer-date' },
          JournalHelpers.longDate(entry.created),
          React.createElement('span', { className: 'jrn-card-time' }, ' · ' + JournalHelpers.shortTime(entry.created)),
          entry.pinned && ' · Pinned'
        )
      ),
      renderDeleteBanner(),
      React.createElement('div', { className: 'jrn-viewer-blocks' },
        (entry.blocks || []).map(function(b, i) {
          return React.createElement(JournalBlockView, {
            key: b.id, block: b, callbacks: callbacks,
            entryId: entry.id, blockIndex: i
          });
        })
      )
    ),
    // Edit FAB — bottom right, pencil icon. Taps open the editor.
    React.createElement('button', {
      className: 'jrn-fab jrn-fab-action is-edit',
      onClick: onEdit,
      title: 'Edit entry', 'aria-label': 'Edit entry'
    },
      React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.8', strokeLinecap: 'round', strokeLinejoin: 'round' },
        React.createElement('path', { d: 'M12 20h9' }),
        React.createElement('path', { d: 'M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4z' })
      )
    )
  );
}
