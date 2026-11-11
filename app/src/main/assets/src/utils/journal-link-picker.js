/* The journal's LinkPicker hand-off (W2c, 2026-11-11): a picked card or excerpt becomes a journal
   block. Moved out of JournalInsertSheet.jsx so the editor's bottom bar can open the excerpt picker. */

/** Opens the LinkPicker for a card or an excerpt and hands the journal block it makes to
 * onInsertBlock. Used by the Insert sheet and by the editor's
 * Excerpt button (mock v2 l-jedit). */
export function openJournalLinkPicker(kind, onInsertBlock) {
  if (typeof window.__openLinkPickerForTarget !== 'function') {
    console.warn('LinkPicker bridge unavailable');
    return;
  }
  window.__openLinkPickerForTarget(kind, function(target, item) {
    try {
      var block = targetToJournalBlock(target, item, kind === 'excerpt');
      if (block && onInsertBlock) onInsertBlock(block);
    } catch (e) { console.warn('Insert ' + kind + ' failed', e); }
  });
}

export function targetToJournalBlock(target, item, asExcerpt) {
  if (!target) return null;
  var t = target.type;
  if (t === 'bible' || t === 'study') {
    var hasText = !!(target.text && target.text.length);
    var hasVerse = target.verse != null;
    if (asExcerpt && hasText) {
      var ref = target.label || ((target.bookId || '') + ' ' + (target.chapter || '')
        + (hasVerse ? (':' + target.verse + (target.verseEnd ? '-' + target.verseEnd : '')) : ''));
      return JournalHelpers.newBlock('verse-block', {
        ref: ref,
        text: target.text,
        partial: !!target.partial,
        bookId: target.bookId,
        chapter: target.chapter,
        verse: target.verse || null,
        verseEnd: target.verseEnd || null,
        isStudy: t === 'study'
      });
    }
    if (target.bookId != null && target.chapter != null) {
      return JournalHelpers.newBlock('chapter-card', {
        bookId: target.bookId,
        chapter: target.chapter,
        isStudy: t === 'study'
      });
    }
    return null;
  }
  if (t === 'letter' || t === 'wtlb' || t === 'blessed' || t === 'holy-days' || t === 'study-letter') {
    var letterId = target.letterId || target.entryId || target.studyChapterId;
    var volKey = target.volKey;
    if (!volKey && target.collection && typeof COLLECTIONS !== 'undefined') {
      for (var i = 0; i < COLLECTIONS.length; i++) {
        if (COLLECTIONS[i].label === target.collection) { volKey = COLLECTIONS[i].volKey; break; }
      }
    }
    if (!volKey && item && item.collection && typeof COLLECTIONS !== 'undefined') {
      for (var j = 0; j < COLLECTIONS.length; j++) {
        if (COLLECTIONS[j].label === item.collection) { volKey = COLLECTIONS[j].volKey; break; }
      }
    }
    var extra = { volKey: volKey, letterId: letterId };
    if (t === 'study-letter') {
      extra.studyId = target.studyId;
      extra.studyChapterId = target.studyChapterId || letterId;
    }
    if (asExcerpt && target.text) {
      extra.excerpt = target.text;
      extra.blockKey = target.blockKey || null;
      extra.start = target.start != null ? target.start : null;
      extra.end = target.end != null ? target.end : null;
    }
    if (!volKey || !letterId) return null;
    return JournalHelpers.newBlock('letter-card', extra);
  }
  return null;
}
