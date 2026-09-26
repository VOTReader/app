/* ===================================================================
   Bookmark source-label + source-endpoint resolution — converts a bookmark
   hlKey into a human label and a navigation endpoint
   ===================================================================
   Global-scope module. Bundled into bundle-d via _entry-d.js.

   These two derivations lived inside BookmarksScreen.jsx until the screen
   left the cold-boot path for the lazy bundle-g. They cannot travel with it:
   the app shell (AppShellSheets), SelectionToolbar, JournalInsertSheet,
   journal-helpers and HighlightsScreen all read them as free globals, on
   screens a reader reaches without ever opening My Bookmarks. They are the
   bookmark twin of utils/note-source.js, and they stay where the shell is.

   Bundled helpers:
   - _bookmarkSourceLabel
   - _bookmarkSourceEndpoint
   =================================================================== */

/* ── Source label for a bookmark ─────────────────────────────── */
import { _bookTitle } from './note-source.js';

export function _bookmarkSourceLabel(hlKey) {
  if (!hlKey) return 'Bookmark';
  var parts = hlKey.split(':');
  var kind = parts[0];

  if (kind === 'bible') {
    var bookId = parts[1];
    var chap = parts[2];
    var verse = parts[3];
    let title = (typeof _bookTitle === 'function') ? _bookTitle(bookId) : bookId;
    return verse ? (title + ' ' + chap + ':' + verse) : (title + ' ' + chap);
  }

  if (kind === 'study') {
    var raw = parts[1] || '';
    var m = raw.match(/^(.+)-(\d+)$/);
    var bookName = m ? (m[1].charAt(0).toUpperCase() + m[1].slice(1)) : raw;
    var chapNum = m ? m[2] : '';
    var vs = parts[2] || '';
    if (!vs) return bookName;
    // n6-11: a study note's key carries a suffix ("12-s0", "panel-s0");
    // the label names the verse (or the chapter) and says what it is.
    var vm = vs.match(/^(\d+)(.*)$/);
    if (vm) return bookName + ' ' + chapNum + ':' + vm[1] + (vm[2] ? ' (study note)' : '');
    return bookName + ' ' + chapNum + ' (study notes)';
  }

  if (kind === 'letter' || kind === 'wtlb' || kind === 'blessed' || kind === 'holy-days') {
    var id = parts[1];
    if (typeof findEntryContext === 'function') {
      var ctx = findEntryContext(id, kind === 'letter' ? 'letter' : kind);
      if (ctx && ctx.title) return ctx.title;
    }
    return id;
  }
  if (kind === 'journal') {
    var eid = parts[1];
    var je = (typeof JournalStore !== 'undefined') ? JournalStore.get(eid) : null;
    if (je) {
      let title = (typeof JournalHelpers !== 'undefined' && JournalHelpers.entryDisplayTitle)
        ? (JournalHelpers.entryDisplayTitle(je) || 'Untitled')
        : (je.title || 'Untitled');
      return 'Journal · ' + title;
    }
    return 'Journal Entry';
  }

  return hlKey;
}

export function _bookmarkSourceEndpoint(hlKey) {
  if (!hlKey) return null;
  var parts = hlKey.split(':');
  var kind = parts[0];

  if (kind === 'bible') {
    return { type: 'bible', key: hlKey, bookId: parts[1], chapter: parseInt(parts[2] || '0', 10), verse: parseInt(parts[3] || '0', 10) };
  }
  if (kind === 'study') {
    var m = (parts[1] || '').match(/^(.+)-(\d+)$/);
    if (m) return { type: 'study', key: hlKey, bookId: m[1], chapter: parseInt(m[2], 10), verse: parseInt(parts[2] || '0', 10) };
  }
  if (kind === 'letter' || kind === 'wtlb' || kind === 'blessed' || kind === 'holy-days') {
    var ctx = (typeof findEntryContext === 'function') ? findEntryContext(parts[1], kind) : null;
    return { type: kind, key: hlKey, letterId: parts[1], entryId: parts[1], screen: ctx ? ctx.screen : null };
  }
  if (kind === 'journal') {
    return { type: 'journal', key: hlKey, entryId: parts[1], screen: 'journal-viewer' };
  }
  return null;
}
