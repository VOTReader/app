/* ═══════════════════════════════════════════════════════════════
   JOURNAL HELPERS — block model, parsing, source resolution
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Depends on: COLLECTIONS, COL_BY_KEY, findEntryContext, _bookTitle,
     BookmarkStore, NoteStore, parseRefStr (all defined earlier).
   No React usage here — pure data helpers.

   BLOCK MODEL — one entry's `blocks` is an ordered array of these:
     { id, type:'p',           text:string }
     { id, type:'h2',          text:string }
     { id, type:'quote',       text:string, cite?:string }
     { id, type:'divider' }
     { id, type:'letter-card',   volKey, letterId }
     { id, type:'chapter-card',  bookId, chapter }
     { id, type:'verse-block',   ref }                  (e.g. 'John 3:16')
     { id, type:'bookmark-card', bookmarkId }
     { id, type:'note-card',     noteGroupId }
     { id, type:'journal-card',  entryId }              (intra-journal link)
     { id, type:'image',         mediaId, caption?:string }
     { id, type:'audio',         mediaId, caption?:string, duration?:number }

   INLINE marks inside p/h2/quote `text`:
     **bold**           — bold
     _italic_           — italic (single-underscore, matches WTLB syntax)
     {{ref:Book X:Y}}   — gold scripture chip
     [[letter:<volKey>/<letterId>]]   — gold underlined letter-link
     [[bookmark:<id>]]                — gold underlined bookmark link
     [[journal:<id>]]                 — gold underlined journal-link
═══════════════════════════════════════════════════════════════ */

var JournalHelpers = (function() {

  function blockId() {
    return 'b_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  function newBlock(type, extra) {
    return Object.assign({ id: blockId(), type: type }, extra || {});
  }

  function defaultBlocks() {
    return [ newBlock('p', { text: '' }) ];
  }

  /* Walk every block + every inline mark, return a deduped list of
     external resource keys (refKeys for JournalIndexStore). */
  function collectRefs(entry) {
    var seen = {};
    var out = [];
    function push(key) {
      if (key && !seen[key]) { seen[key] = true; out.push(key); }
    }
    var blocks = (entry && entry.blocks) || [];
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      switch (b.type) {
        case 'letter-card':
          if (b.volKey && b.letterId) push('letter:' + b.volKey + '/' + b.letterId);
          break;
        case 'chapter-card':
          if (b.bookId && b.chapter != null) push('chapter:' + b.bookId + ':' + b.chapter);
          break;
        case 'verse-block':
          if (b.ref) push('scripture:' + b.ref);
          break;
        case 'bookmark-card':
          if (b.bookmarkId) push('bookmark:' + b.bookmarkId);
          break;
        case 'note-card':
          if (b.noteGroupId) push('note:' + b.noteGroupId);
          break;
        case 'journal-card':
          if (b.entryId) push('journal:' + b.entryId);
          break;
        case 'notebook-card':
          if (b.notebookId) push('notebook:' + b.notebookId);
          break;
        case 'p':
        case 'h2':
        case 'quote': {
          // Inline marks
          var text = b.text || '';
          // Scripture refs
          var refRe = /\{\{ref:([^}]+)\}\}/g;
          var m;
          while ((m = refRe.exec(text)) !== null) push('scripture:' + m[1].trim());
          // [[letter:vol/id]], [[bookmark:id]], [[journal:id]]
          var lnkRe = /\[\[(letter|bookmark|journal):([^\]]+)\]\]/g;
          while ((m = lnkRe.exec(text)) !== null) {
            var kind = m[1];
            var ref = m[2].trim();
            if (kind === 'letter') push('letter:' + ref);
            else if (kind === 'bookmark') push('bookmark:' + ref);
            else if (kind === 'journal') push('journal:' + ref);
          }
          break;
        }
      }
    }
    return out;
  }

  /* Plain-text preview of an entry — for card previews in the hub.
     Picks the first paragraph or quote block, returns up to ~180 chars
     with markdown stripped. Falls back to the first embed's title. */
  function previewText(entry, maxLen) {
    maxLen = maxLen || 180;
    var blocks = (entry && entry.blocks) || [];
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.type === 'p' || b.type === 'quote' || b.type === 'h2') {
        if (b.text && b.text.trim()) {
          var t = b.text
            .replace(/\{\{ref:([^}]+)\}\}/g, '$1')
            .replace(/\[\[(letter|bookmark|journal):[^\]]+\]\]/g, '')
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/_(.+?)_/g, '$1')
            .replace(/\s+/g, ' ')
            .trim();
          if (t.length > maxLen) t = t.substring(0, maxLen).trim() + '…';
          return t;
        }
      }
    }
    // No prose blocks — describe embeds
    for (var j = 0; j < blocks.length; j++) {
      var b2 = blocks[j];
      if (b2.type === 'image') return '[Image]';
      if (b2.type === 'audio') return '[Voice recording]';
      if (b2.type === 'letter-card') {
        var ctx = (typeof findEntryContext === 'function') ? findEntryContext(b2.letterId, 'letter') : null;
        return ctx && ctx.title ? '[Letter: ' + ctx.title + ']' : '[Letter]';
      }
      if (b2.type === 'chapter-card') {
        var title = (typeof _bookTitle === 'function') ? _bookTitle(b2.bookId) : b2.bookId;
        return '[' + title + ' ' + b2.chapter + ']';
      }
      if (b2.type === 'verse-block') return '[' + (b2.ref || 'Scripture') + ']';
      if (b2.type === 'bookmark-card') return '[Bookmark]';
      if (b2.type === 'note-card') return '[Note]';
      if (b2.type === 'journal-excerpt') {
        var ex = (b2.text || '').replace(/\s+/g, ' ').trim();
        if (ex) return ex.length > maxLen ? ex.substring(0, maxLen).trim() + '…' : ex;
        return '[Linked excerpt]';
      }
      // Don't recurse into the linked entry — that risks an A→B→A loop and
      // is also visually noisy. A bare label is enough for the card preview.
      if (b2.type === 'journal-card') return '[Linked journal entry]';
      if (b2.type === 'notebook-card') {
        var rnb = resolveNotebookCard(b2.notebookId);
        return rnb ? '[Notebook: ' + rnb.title + ']' : '[Notebook]';
      }
      if (b2.type === 'divider') continue;
    }
    return '';
  }

  /* Short summary of embeds for the attachment chip row on entry cards. */
  function attachmentSummary(entry) {
    var counts = { image: 0, audio: 0, letter: 0, chapter: 0, verse: 0, bookmark: 0, note: 0, journal: 0 };
    var blocks = (entry && entry.blocks) || [];
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.type === 'image') counts.image++;
      else if (b.type === 'audio') counts.audio++;
      else if (b.type === 'letter-card') counts.letter++;
      else if (b.type === 'chapter-card') counts.chapter++;
      else if (b.type === 'verse-block') counts.verse++;
      else if (b.type === 'bookmark-card') counts.bookmark++;
      else if (b.type === 'note-card') counts.note++;
      else if (b.type === 'journal-card') counts.journal++;
    }
    var out = [];
    if (counts.letter) out.push({ kind: 'letter', label: counts.letter + (counts.letter === 1 ? ' letter' : ' letters') });
    if (counts.chapter) out.push({ kind: 'chapter', label: counts.chapter + (counts.chapter === 1 ? ' chapter' : ' chapters') });
    if (counts.verse) out.push({ kind: 'verse', label: counts.verse + (counts.verse === 1 ? ' scripture' : ' scriptures') });
    if (counts.bookmark) out.push({ kind: 'bookmark', label: counts.bookmark + (counts.bookmark === 1 ? ' bookmark' : ' bookmarks') });
    if (counts.note) out.push({ kind: 'note', label: counts.note + (counts.note === 1 ? ' note' : ' notes') });
    if (counts.image) out.push({ kind: 'image', label: counts.image + (counts.image === 1 ? ' image' : ' images') });
    if (counts.audio) out.push({ kind: 'audio', label: 'Voice · ' + (counts.audio > 1 ? counts.audio + ' clips' : (blocks.find(function(b){return b.type==='audio';})?.duration ? formatDuration(blocks.find(function(b){return b.type==='audio';}).duration) : 'memo')) });
    if (counts.journal) out.push({ kind: 'journal', label: counts.journal + (counts.journal === 1 ? ' link' : ' links') });
    return out;
  }

  function formatDuration(seconds) {
    if (!seconds && seconds !== 0) return '';
    seconds = Math.round(seconds);
    var m = Math.floor(seconds / 60);
    var s = String(seconds % 60).padStart(2, '0');
    return m + ':' + s;
  }

  /* Resolve a letter-card refKey into a human label + body preview.
     `excerpt` (optional) overrides the default derived body — used by the
     "+ → Excerpt" flow so the card displays the user-selected text.
     Returns { title, eyebrow, body, date, isExcerpt } or null. */
  function resolveLetterCard(volKey, letterId, excerpt) {
    if (typeof COL_BY_KEY === 'undefined' || typeof findEntryContext !== 'function') return null;
    var col = COL_BY_KEY.get(volKey);
    if (!col) return null;
    var ctx = findEntryContext(letterId, col.kind === 'letter' ? 'letter' : col.kind);
    if (!ctx || !ctx.entry) return null;
    var e = ctx.entry;
    var body;
    if (excerpt && typeof excerpt === 'string' && excerpt.trim().length) {
      // Don't truncate here — the viewer renderer handles collapse/expand
      // for long bodies via JrnExpandable.
      return {
        title: e.title || ctx.title || letterId,
        eyebrow: col.label,
        body: excerpt,
        date: e.date || '',
        isExcerpt: true
      };
    }
    body = '';
    if (e.blocks && e.blocks.length) {
      for (var i = 0; i < e.blocks.length; i++) {
        var b = e.blocks[i];
        if (b.type === 'para' && b.segments) {
          body = b.segments.map(function(s) { return s.v || ''; }).join(' ').trim();
          if (body) break;
        }
      }
    }
    if (!body && e.paragraphs && e.paragraphs.length) {
      body = (e.paragraphs[0].text || '').replace(/\{\{[^}]+\}\}/g, '').replace(/[_*]/g, '').trim();
    }
    return {
      title: e.title || ctx.title || letterId,
      eyebrow: col.label,
      body: body.length > 180 ? body.substring(0, 180) + '…' : body,
      date: e.date || ''
    };
  }

  /* Resolve a chapter-card to label info. */
  function resolveChapterCard(bookId, chapter) {
    if (typeof _bookTitle !== 'function') return null;
    return { title: _bookTitle(bookId) + ' ' + chapter, eyebrow: 'Bible Chapter' };
  }

  /* Resolve a bookmark-card. */
  function resolveBookmarkCard(bookmarkId) {
    if (typeof BookmarkStore === 'undefined') return null;
    var b = BookmarkStore.get(bookmarkId);
    if (!b) return null;
    var label = b.label || 'Bookmark';
    return {
      title: label,
      eyebrow: 'Bookmark',
      body: b.thought || ''
    };
  }

  /* Resolve a note-card. */
  function resolveNoteCard(noteGroupId) {
    if (typeof NoteStore === 'undefined') return null;
    var n = NoteStore.get(noteGroupId);
    if (!n) return null;
    var anchor = (n.fullText || '').substring(0, 100);
    return {
      title: 'Note',
      eyebrow: 'My Note',
      body: n.body || anchor
    };
  }

  /* Resolve a notebook-card. notebookId may be the literal
     'uncategorized' (the system bucket) or a NotebookStore id. */
  function resolveNotebookCard(notebookId) {
    if (notebookId === 'uncategorized') {
      return { title: 'Uncategorized', eyebrow: 'Notebook', deleted: false };
    }
    if (typeof NotebookStore === 'undefined') return null;
    var nb = NotebookStore.get(notebookId);
    if (!nb) return { title: '(Deleted notebook)', eyebrow: 'Notebook', deleted: true };
    return { title: nb.name || 'Notebook', eyebrow: 'Notebook', deleted: false };
  }

  /* Look up a single block by its (entryId, blockId) — used by the
     journal-to-journal embed flow to read the source block's data
     (image mediaId, audio mediaId, text content). */
  function getBlockFromEntry(entryId, blockId) {
    if (typeof JournalStore === 'undefined') return null;
    var e = JournalStore.get(entryId);
    if (!e) return null;
    var blocks = e.blocks || [];
    for (var i = 0; i < blocks.length; i++) {
      if (blocks[i].id === blockId) return blocks[i];
    }
    return null;
  }

  /* For the block-picker UI: produce a short label describing a block
     ("Image", "Voice memo · 0:42", first 60 chars of text, etc.). */
  function describeBlock(block) {
    if (!block) return '';
    switch (block.type) {
      case 'image':         return '[Image]' + (block.caption ? ' — ' + block.caption : '');
      case 'audio':         return '[Voice memo' + (block.duration ? ' · ' + formatDuration(block.duration) : '') + ']' + (block.caption ? ' — ' + block.caption : '');
      case 'p':
      case 'h2':            {
        var t = (block.text || '').replace(/\{\{ref:([^}]+)\}\}/g, '$1').replace(/\[\[(letter|bookmark|journal):[^\]]+\]\]/g, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/_(.+?)_/g, '$1').replace(/\s+/g, ' ').trim();
        return t.length > 90 ? t.substring(0, 90) + '…' : t;
      }
      case 'quote':         {
        var q = (block.text || '').replace(/\s+/g, ' ').trim();
        return '“' + (q.length > 80 ? q.substring(0, 80) + '…' : q) + '”';
      }
      case 'divider':       return '— Divider —';
      case 'letter-card':   return '[Letter card]';
      case 'chapter-card':  return '[Chapter card]';
      case 'verse-block':   return '[' + (block.ref || 'Scripture') + ']';
      case 'bookmark-card': return '[Bookmark]';
      case 'note-card':     return '[Note]';
      case 'journal-card':  return '[Linked journal entry]';
      case 'notebook-card': {
        var rb = resolveNotebookCard(block.notebookId);
        return '[Notebook: ' + (rb ? rb.title : 'Notebook') + ']';
      }
      case 'journal-excerpt': {
        var qe = (block.text || '').replace(/\s+/g, ' ').trim();
        return qe.length > 80 ? qe.substring(0, 80) + '…' : qe;
      }
    }
    return block.type;
  }

  /* Whether a block can be embedded into another journal as a standalone
     excerpt. Excludes structural pieces (dividers) and externally-resolved
     cards that have their own embed flow (Card / Excerpt buttons). */
  function isEmbeddableBlock(block) {
    if (!block) return false;
    return ['p', 'h2', 'quote', 'image', 'audio'].indexOf(block.type) >= 0;
  }

  /* Build the inserted-block shape for a journal-block embed. `source`
     is the source entry; `block` is the source block. Returns a new
     block (with its own id) that carries source attribution + shares
     the same mediaId for image/audio. The editor's deleteBlock checks
     for `sourceJournalId` and skips JournalMediaStore.delete so the
     source's media isn't wiped from IDB when the embed is removed. */
  function embedBlockFromJournal(source, block) {
    if (!source || !block) return null;
    var meta = {
      sourceJournalId: source.id,
      sourceBlockId: block.id,
      sourceJournalTitle: entryDisplayTitle(source) || 'Untitled'
    };
    if (block.type === 'image') {
      return newBlock('image', Object.assign({}, meta, {
        mediaId: block.mediaId,
        caption: block.caption || ''
      }));
    }
    if (block.type === 'audio') {
      return newBlock('audio', Object.assign({}, meta, {
        mediaId: block.mediaId,
        duration: block.duration,
        caption: block.caption || '',
        samples: block.samples || null
      }));
    }
    if (block.type === 'p' || block.type === 'h2' || block.type === 'quote') {
      return newBlock('journal-excerpt', Object.assign({}, meta, {
        text: block.text || '',
        originType: block.type,
        cite: block.cite || ''
      }));
    }
    return null;
  }

  /* Resolve a verse-block ref to verse text. When `overrideText` is
     provided (Excerpt picker captured a user-selected span), it wins —
     the verse-block renders the exact text the user picked even if it
     starts mid-verse or spans multiple verses. Otherwise we fall back
     to the centralized resolveVerseText lookup. */
  function resolveVerseBlock(ref, overrideText) {
    if (overrideText && typeof overrideText === 'string' && overrideText.trim().length) {
      return { cite: ref, text: overrideText, isExcerpt: true };
    }
    var text = '';
    if (typeof window.resolveVerseText === 'function') {
      try { text = window.resolveVerseText(ref) || ''; } catch (e) {}
    }
    return { cite: ref, text: text };
  }

  /* Convert a refKey from JournalIndexStore back to the navigation
     endpoint expected by navigateToLink. Returns null if the kind
     isn't externally navigable (image/audio etc). */
  function refKeyToEndpoint(refKey) {
    if (!refKey) return null;
    var sep = refKey.indexOf(':');
    if (sep < 0) return null;
    var kind = refKey.substring(0, sep);
    var rest = refKey.substring(sep + 1);
    if (kind === 'letter') {
      var slash = rest.indexOf('/');
      if (slash < 0) return null;
      var volKey = rest.substring(0, slash);
      var letterId = rest.substring(slash + 1);
      var col = (typeof COL_BY_KEY !== 'undefined') ? COL_BY_KEY.get(volKey) : null;
      return col ? { type: col.kind === 'letter' ? 'letter' : col.kind, key: refKey, letterId: letterId, entryId: letterId, screen: col.letterScreen } : null;
    }
    if (kind === 'chapter') {
      var parts = rest.split(':');
      return { type: 'bible', key: refKey, bookId: parts[0], chapter: parseInt(parts[1] || '0', 10) };
    }
    if (kind === 'bookmark') {
      var b = (typeof BookmarkStore !== 'undefined') ? BookmarkStore.get(rest) : null;
      if (!b || typeof _bookmarkSourceEndpoint !== 'function') return null;
      return _bookmarkSourceEndpoint(b.hlKey);
    }
    if (kind === 'note') {
      var n = (typeof NoteStore !== 'undefined') ? NoteStore.get(rest) : null;
      if (!n || typeof noteSourceNav !== 'function') return null;
      return noteSourceNav(n);
    }
    if (kind === 'scripture') {
      // No clean nav for an arbitrary scripture ref — caller can show the
      // scripture sheet inline instead. Return null to signal "no nav".
      return null;
    }
    return null;
  }

  /* Title of an entry for display — uses entry.title or auto-generates from
     date + first prose chunk if blank. */
  function entryDisplayTitle(entry, dateFn) {
    if (entry.title && entry.title.trim()) return entry.title;
    var preview = previewText(entry, 50);
    if (preview && preview.length > 5) return preview;
    return '';
  }

  /* Date string in a fixed short format (e.g. "May 14"). */
  function shortDate(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getDate();
  }

  /* Long date — for the viewer/editor header (e.g. "May 14, 2026"). */
  function longDate(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  /* Very concise time, e.g. "4:54p" / "11:08a" — shown subtly next to
     the date. Entries already store millisecond `created`/`updated`, so
     this is purely a display concern (the sort always had the precision). */
  function shortTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var h = d.getHours();
    var m = d.getMinutes();
    var ap = h < 12 ? 'a' : 'p';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ':' + (m < 10 ? '0' + m : m) + ap;
  }

  return {
    blockId: blockId,
    newBlock: newBlock,
    defaultBlocks: defaultBlocks,
    collectRefs: collectRefs,
    previewText: previewText,
    attachmentSummary: attachmentSummary,
    formatDuration: formatDuration,
    resolveLetterCard: resolveLetterCard,
    resolveChapterCard: resolveChapterCard,
    resolveBookmarkCard: resolveBookmarkCard,
    resolveNoteCard: resolveNoteCard,
    resolveNotebookCard: resolveNotebookCard,
    resolveVerseBlock: resolveVerseBlock,
    refKeyToEndpoint: refKeyToEndpoint,
    entryDisplayTitle: entryDisplayTitle,
    shortDate: shortDate,
    shortTime: shortTime,
    longDate: longDate,
    // Journal-to-journal block embed helpers
    getBlockFromEntry: getBlockFromEntry,
    describeBlock: describeBlock,
    isEmbeddableBlock: isEmbeddableBlock,
    embedBlockFromJournal: embedBlockFromJournal
  };
})();
