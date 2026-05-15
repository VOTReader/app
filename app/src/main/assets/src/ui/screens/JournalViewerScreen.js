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

/* Renders one block as read-only React. Used by viewer + editor preview. */
function JournalBlockView({ block, callbacks }) {
  if (!block) return null;
  callbacks = callbacks || {};
  var b = block;

  if (b.type === 'p') {
    return React.createElement('p', { className: 'jrn-p' }, jrnRenderInline(b.text || '', callbacks));
  }
  if (b.type === 'h2') {
    return React.createElement('h2', { className: 'jrn-h2' }, jrnRenderInline(b.text || '', callbacks));
  }
  if (b.type === 'quote') {
    return React.createElement('div', { className: 'jrn-block-quote' },
      React.createElement('div', { style: { fontStyle: 'italic', color: 'var(--cream)', fontFamily: 'EB Garamond, serif', fontSize: '17px', lineHeight: 1.6 } }, jrnRenderInline(b.text || '', callbacks)),
      b.cite && React.createElement('div', { className: 'jrn-block-quote-cite' }, b.cite)
    );
  }
  if (b.type === 'divider') {
    return React.createElement('div', { className: 'jrn-divider' }, '❖  ❖  ❖');
  }
  if (b.type === 'letter-card') {
    var lc = JournalHelpers.resolveLetterCard(b.volKey, b.letterId);
    if (!lc) return React.createElement('div', { className: 'jrn-embed-letter', onClick: function() { callbacks.onLetterCard && callbacks.onLetterCard(b.volKey, b.letterId); } },
      React.createElement('div', { className: 'jrn-emb-eyebrow' }, 'Letter'),
      React.createElement('h4', { className: 'jrn-emb-title' }, b.letterId)
    );
    return React.createElement('div', { className: 'jrn-embed-letter', onClick: function() { callbacks.onLetterCard && callbacks.onLetterCard(b.volKey, b.letterId); }, role: 'button' },
      lc.date && React.createElement('div', { className: 'jrn-emb-date' }, lc.date),
      React.createElement('div', { className: 'jrn-emb-eyebrow' }, lc.eyebrow),
      React.createElement('h4', { className: 'jrn-emb-title' }, lc.title),
      lc.body && React.createElement('div', { className: 'jrn-emb-body' }, lc.body)
    );
  }
  if (b.type === 'chapter-card') {
    var cc = JournalHelpers.resolveChapterCard(b.bookId, b.chapter);
    return React.createElement('div', { className: 'jrn-embed-chapter', onClick: function() { callbacks.onChapterCard && callbacks.onChapterCard(b.bookId, b.chapter); }, role: 'button' },
      React.createElement('div', { className: 'jrn-emb-eyebrow' }, cc ? cc.eyebrow : 'Bible'),
      React.createElement('h4', { className: 'jrn-emb-title' }, cc ? cc.title : (b.bookId + ' ' + b.chapter))
    );
  }
  if (b.type === 'verse-block') {
    var vb = JournalHelpers.resolveVerseBlock(b.ref);
    return React.createElement('div', { className: 'jrn-embed-verse' },
      React.createElement('div', { className: 'jrn-emb-cite' }, vb.cite),
      React.createElement('div', { className: 'jrn-emb-text' }, vb.text || React.createElement('em', { style: { color: 'var(--gold-dim)' } }, 'Verse text not available offline.'))
    );
  }
  if (b.type === 'bookmark-card') {
    var bc = JournalHelpers.resolveBookmarkCard(b.bookmarkId);
    return React.createElement('div', { className: 'jrn-embed-bookmark', onClick: function() { callbacks.onBookmarkCard && callbacks.onBookmarkCard(b.bookmarkId); }, role: 'button' },
      React.createElement('div', { className: 'jrn-emb-eyebrow' }, bc ? bc.eyebrow : 'Bookmark'),
      React.createElement('h4', { className: 'jrn-emb-title' }, bc ? bc.title : 'Bookmark'),
      bc && bc.body && React.createElement('div', { className: 'jrn-emb-body' }, bc.body)
    );
  }
  if (b.type === 'note-card') {
    var nc = JournalHelpers.resolveNoteCard(b.noteGroupId);
    return React.createElement('div', { className: 'jrn-embed-note', onClick: function() { callbacks.onNoteCard && callbacks.onNoteCard(b.noteGroupId); }, role: 'button' },
      React.createElement('div', { className: 'jrn-emb-eyebrow' }, nc ? nc.eyebrow : 'Note'),
      React.createElement('h4', { className: 'jrn-emb-title' }, nc ? nc.title : 'Note'),
      nc && nc.body && React.createElement('div', { className: 'jrn-emb-body' }, nc.body)
    );
  }
  if (b.type === 'journal-card') {
    var je = (typeof JournalStore !== 'undefined') ? JournalStore.get(b.entryId) : null;
    return React.createElement('div', { className: 'jrn-embed-journal', onClick: function() { callbacks.onJournalCard && callbacks.onJournalCard(b.entryId); }, role: 'button' },
      React.createElement('div', { className: 'jrn-emb-eyebrow' }, 'Linked Entry'),
      React.createElement('h4', { className: 'jrn-emb-title' }, je ? (JournalHelpers.entryDisplayTitle(je) || 'Untitled') : '(Deleted)'),
      je && React.createElement('div', { className: 'jrn-emb-body' }, JournalHelpers.previewText(je, 120))
    );
  }
  if (b.type === 'image') {
    return React.createElement(JournalImageBlock, { mediaId: b.mediaId, caption: b.caption });
  }
  if (b.type === 'audio') {
    return React.createElement(JournalAudioBlock, { mediaId: b.mediaId, duration: b.duration, caption: b.caption });
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

/* Async audio block. */
function JournalAudioBlock({ mediaId, duration, caption }) {
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;
  var _src = useState(null);
  var src = _src[0]; var setSrc = _src[1];
  var audioRef = useRef(null);
  var _playing = useState(false);
  var playing = _playing[0]; var setPlaying = _playing[1];

  useEffect(function() {
    var cancelled = false;
    if (mediaId && typeof JournalMediaStore !== 'undefined') {
      JournalMediaStore.objectUrl(mediaId).then(function(url) {
        if (!cancelled) setSrc(url || null);
      });
    }
    return function() { cancelled = true; };
  }, [mediaId]);

  function toggle() {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
  }

  // Decorative static waveform
  var bars = [];
  for (var i = 0; i < 40; i++) {
    var h = 6 + Math.round(Math.abs(Math.sin(i * 0.6 + i * 0.13)) * 16);
    bars.push(React.createElement('div', { key: i, className: 'bar', style: { height: h + 'px' } }));
  }

  return React.createElement('div', { className: 'jrn-embed-audio' },
    React.createElement('button', { className: 'jrn-aud-play', onClick: toggle, 'aria-label': playing ? 'Pause' : 'Play' },
      React.createElement('svg', { viewBox: '0 0 24 24' },
        playing
          ? React.createElement('path', { d: 'M6 4h4v16H6zM14 4h4v16h-4z' })
          : React.createElement('path', { d: 'M6 3v18l16-9z' })
      )
    ),
    React.createElement('div', { className: 'jrn-aud-body' },
      React.createElement('div', { className: 'jrn-aud-waveform' }, bars),
      React.createElement('div', { className: 'jrn-aud-meta' },
        React.createElement('span', null, caption || 'Voice memo'),
        React.createElement('span', null, JournalHelpers.formatDuration(duration || 0))
      )
    ),
    src && React.createElement('audio', {
      ref: audioRef,
      src: src,
      style: { display: 'none' },
      onPlay: function() { setPlaying(true); },
      onPause: function() { setPlaying(false); },
      onEnded: function() { setPlaying(false); }
    })
  );
}

/* Main viewer screen */
function JournalViewerScreen(props) {
  var useState = React.useState;
  var useMemo = React.useMemo;
  var useEffect = React.useEffect;

  var entryId = props.entryId;
  var onBack = props.onBack;
  var onEdit = props.onEdit;
  var onNavigateToLink = props.onNavigateToLink;
  var onOpenJournalEntry = props.onOpenJournalEntry;
  var setHlTick = props.setHlTick;

  var entry = useMemo(function() {
    return entryId ? JournalStore.get(entryId) : null;
  }, [entryId, props.hlTick]);

  var _menuOpen = useState(false);
  var menuOpen = _menuOpen[0]; var setMenuOpen = _menuOpen[1];

  var _confirmDel = useState(false);
  var confirmDel = _confirmDel[0]; var setConfirmDel = _confirmDel[1];

  function bump() { if (setHlTick) setHlTick(function(t) { return t + 1; }); }

  if (!entry) {
    var navChildrenE = React.createElement(React.Fragment, null,
      React.createElement('button', { className: 'nav-home nav-back-icon', onClick: onBack, title: 'Back' }, '‹'),
      React.createElement(ThemeBtn, { theme: props.theme, onThemeChange: props.onThemeChange })
    );
    return React.createElement(ScreenLayout, { navChildren: navChildrenE },
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
    onChapterCard: function(bookId, chapter) {
      onNavigateToLink && onNavigateToLink({ type: 'bible', bookId: bookId, chapter: chapter }, sourceMeta);
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
      onOpenJournalEntry && onOpenJournalEntry(eid);
    },
    onScriptureRef: function(ref) {
      // Open scripture sheet if available
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

  var navChildren = React.createElement(React.Fragment, null,
    React.createElement('button', { className: 'nav-home nav-back-icon', onClick: onBack, title: 'Back', 'aria-label': 'Back' }, '‹'),
    React.createElement('button', { className: 'nav-search-btn', onClick: onEdit, title: 'Edit', 'aria-label': 'Edit' },
      React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.6' },
        React.createElement('path', { d: 'M12 20h9' }),
        React.createElement('path', { d: 'M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4z' })
      )
    ),
    React.createElement('button', { className: 'nav-search-btn', onClick: togglePin, title: entry.pinned ? 'Unpin' : 'Pin', 'aria-label': 'Pin', style: entry.pinned ? { color: 'var(--gold)' } : null },
      React.createElement('svg', { viewBox: '0 0 24 24', fill: entry.pinned ? 'currentColor' : 'none', stroke: 'currentColor', strokeWidth: '1.6' },
        React.createElement('path', { d: 'M12 17v5' }),
        React.createElement('path', { d: 'M5 12l7-9 7 9-3 1 3 5H8l3-5z' })
      )
    ),
    React.createElement('button', { className: 'nav-search-btn', onClick: function() { setMenuOpen(function(v) { return !v; }); }, title: 'More', 'aria-label': 'More' },
      React.createElement('svg', { viewBox: '0 0 24 24', fill: 'currentColor' },
        React.createElement('circle', { cx: '12', cy: '5', r: '1.5' }),
        React.createElement('circle', { cx: '12', cy: '12', r: '1.5' }),
        React.createElement('circle', { cx: '12', cy: '19', r: '1.5' })
      )
    )
  );

  var displayTitle = JournalHelpers.entryDisplayTitle(entry);

  return React.createElement(ScreenLayout, { navChildren: navChildren },
    React.createElement('div', { className: 'jrn-viewer' },
      React.createElement('div', { className: 'jrn-viewer-meta' },
        React.createElement('h1', { className: 'jrn-viewer-title' + (displayTitle ? '' : ' untitled') }, displayTitle || 'Untitled'),
        React.createElement('div', { className: 'jrn-viewer-date' },
          JournalHelpers.longDate(entry.created),
          entry.pinned && ' · Pinned'
        )
      ),
      menuOpen && React.createElement('div', { style: { padding: '0 22px 10px' } },
        React.createElement('button', { className: 'jrn-nb-action danger', onClick: function() { setConfirmDel(true); setMenuOpen(false); } }, 'Delete entry')
      ),
      confirmDel && React.createElement('div', { className: 'jrn-inline-confirm' },
        React.createElement('span', { className: 'jrn-inline-confirm-q' }, 'Delete this entry? This cannot be undone.'),
        React.createElement('button', { onClick: function() { setConfirmDel(false); } }, 'Cancel'),
        React.createElement('button', { className: 'danger', onClick: doDelete }, 'Yes, delete')
      ),
      React.createElement('div', { className: 'jrn-viewer-blocks' },
        (entry.blocks || []).map(function(b) {
          return React.createElement(JournalBlockView, { key: b.id, block: b, callbacks: callbacks });
        })
      )
    )
  );
}
