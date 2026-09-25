/* ═══════════════════════════════════════════════════════════════════════
   reading-plans — the schedules behind the Today card (rp1, REPORT v16-03)
   ═══════════════════════════════════════════════════════════════════════
   Two plans, kept on the device, no accounts:
     bible-year  Genesis to Revelation, 1,189 chapters over 365 days.
     volumes     every letter of the Volumes in site order (READING_CHAIN),
                 at a pace the reader picks (letters a day).
   A plan is only { id, start: 'YYYY-MM-DD', pace? }. Whether a day is done is
   never stored: it is read from the app's own read record (readItems,
   `v1:<bookId|readKey>:<chapter|letterId>`) through a predicate, so reading a
   chapter from anywhere ticks the plan, and a plan can never disagree with
   the ticks the reader already sees in the indexes.

   The Bible schedule is a fixed table, not the loaded corpus, so a day's
   portion never moves (the corpus loads lazily and could be absent). Days
   split the canon by chapter count, as the classic one-year plans do: day d
   reads chapters [round(d * 1189 / 365), round((d + 1) * 1189 / 365)).

   Pure: no state, no DOM, no storage.
   ═══════════════════════════════════════════════════════════════════════ */

/** [bookId as in BOOKS, title, chapters], canonical order (index.html BIBLE_BOOK_LIST). */
export const BIBLE_BOOKS = Object.freeze([
  ['genesis', 'Genesis', 50], ['exodus', 'Exodus', 40], ['leviticus', 'Leviticus', 27], ['numbers', 'Numbers', 36],
  ['deuteronomy', 'Deuteronomy', 34], ['joshua', 'Joshua', 24], ['judges', 'Judges', 21], ['ruth', 'Ruth', 4],
  ['1samuel', '1 Samuel', 31], ['2samuel', '2 Samuel', 24], ['1kings', '1 Kings', 22], ['2kings', '2 Kings', 25],
  ['1chronicles', '1 Chronicles', 29], ['2chronicles', '2 Chronicles', 36], ['ezra', 'Ezra', 10],
  ['nehemiah', 'Nehemiah', 13], ['esther', 'Esther', 10], ['job', 'Job', 42], ['psalms', 'Psalms', 150],
  ['proverbs', 'Proverbs', 31], ['ecclesiastes', 'Ecclesiastes', 12], ['songofsolomon', 'Song of Solomon', 8],
  ['isaiah', 'Isaiah', 66], ['jeremiah', 'Jeremiah', 52], ['lamentations', 'Lamentations', 5], ['ezekiel', 'Ezekiel', 48],
  ['daniel', 'Daniel', 12], ['hosea', 'Hosea', 14], ['joel', 'Joel', 3], ['amos', 'Amos', 9], ['obadiah', 'Obadiah', 1],
  ['jonah', 'Jonah', 4], ['micah', 'Micah', 7], ['nahum', 'Nahum', 3], ['habakkuk', 'Habakkuk', 3],
  ['zephaniah', 'Zephaniah', 3], ['haggai', 'Haggai', 2], ['zechariah', 'Zechariah', 14], ['malachi', 'Malachi', 4],
  ['matthew-plain', 'Matthew', 28], ['mark', 'Mark', 16], ['luke', 'Luke', 24], ['john', 'John', 21], ['acts', 'Acts', 28],
  ['romans', 'Romans', 16], ['1corinthians', '1 Corinthians', 16], ['2corinthians', '2 Corinthians', 13],
  ['galatians', 'Galatians', 6], ['ephesians', 'Ephesians', 6], ['philippians', 'Philippians', 4],
  ['colossians', 'Colossians', 4], ['1thessalonians', '1 Thessalonians', 5], ['2thessalonians', '2 Thessalonians', 3],
  ['1timothy', '1 Timothy', 6], ['2timothy', '2 Timothy', 4], ['titus', 'Titus', 3], ['philemon', 'Philemon', 1],
  ['hebrews', 'Hebrews', 13], ['james', 'James', 5], ['1peter', '1 Peter', 5], ['2peter', '2 Peter', 3],
  ['1john', '1 John', 5], ['2john', '2 John', 1], ['3john', '3 John', 1], ['jude', 'Jude', 1], ['revelation', 'Revelation', 22],
]);

export const BIBLE_YEAR_DAYS = 365;

/** Every chapter in order: { bid, cid, title }. Built once. */
const _CHAPTERS = (function () {
  var out = [];
  for (var b = 0; b < BIBLE_BOOKS.length; b++) {
    for (var c = 1; c <= BIBLE_BOOKS[b][2]; c++) out.push({ bid: BIBLE_BOOKS[b][0], cid: c, title: BIBLE_BOOKS[b][1] });
  }
  return out;
})();
export const BIBLE_CHAPTER_COUNT = _CHAPTERS.length;

/**
 * A run of items as a reader says it: "Genesis 1-4", "Psalms 119",
 * "Genesis 50 - Exodus 3".
 * @param {{ title: string, cid: number }[]} items
 * @returns {string}
 */
function _chapterLabel(items) {
  if (!items.length) return '';
  var a = items[0], z = items[items.length - 1];
  if (a.title === z.title) return a.cid === z.cid ? a.title + ' ' + a.cid : a.title + ' ' + a.cid + '-' + z.cid;
  return a.title + ' ' + a.cid + ' - ' + z.title + ' ' + z.cid;
}

/**
 * Day `day` (0-based) of Bible in a Year. Out of range -> no items.
 * @param {number} day
 * @returns {{ items: { bid: string, cid: number }[], label: string }}
 */
export function biblePortion(day) {
  if (!(day >= 0 && day < BIBLE_YEAR_DAYS)) return { items: [], label: '' };
  var from = Math.round(day * BIBLE_CHAPTER_COUNT / BIBLE_YEAR_DAYS);
  var to = Math.round((day + 1) * BIBLE_CHAPTER_COUNT / BIBLE_YEAR_DAYS);
  var run = _CHAPTERS.slice(from, to);
  return { items: run.map(function (c) { return { bid: c.bid, cid: c.cid }; }), label: _chapterLabel(run) };
}

/**
 * The Volumes in site order: every preface and letter of each READING_CHAIN
 * collection that has a letter screen. Needs the VOT corpus loaded; an
 * empty list means it is not (yet).
 * @param {{ chain: string[], colByKey: Map<string, any>, letters: (col: any) => any[], preface: (col: any) => any }} src
 * @returns {{ bid: string, cid: string, title: string, volKey: string, short: string }[]}
 */
export function volumeSequence(src) {
  var out = [];
  for (var i = 0; i < src.chain.length; i++) {
    var col = src.colByKey.get(src.chain[i]);
    if (!col || !col.letterScreen || !col.readKey) continue;
    var pref = src.preface(col);
    var arr = src.letters(col) || [];
    var list = pref ? [pref].concat(arr) : arr;
    for (var j = 0; j < list.length; j++) {
      var e = list[j];
      if (!e || !e.id) continue;
      out.push({ bid: col.readKey, cid: e.id, title: e.title || e.id, volKey: col.volKey, short: col.short || col.label || '' });
    }
  }
  return out;
}

/**
 * Day `day` of the Volumes plan at `pace` letters a day.
 * @param {{ bid: string, cid: string, title: string, short: string }[]} seq
 * @param {number} day
 * @param {number} pace
 * @returns {{ items: { bid: string, cid: string }[], label: string }}
 */
export function volumesPortion(seq, day, pace) {
  var p = Math.max(1, Math.floor(pace) || 1);
  if (!(day >= 0)) return { items: [], label: '' };
  var run = seq.slice(day * p, (day + 1) * p);
  if (!run.length) return { items: [], label: '' };
  var a = run[0], z = run[run.length - 1];
  var label = run.length === 1 ? a.short + ': ' + a.title
    : a.short === z.short ? a.short + ': ' + a.title + ' + ' + (run.length - 1) + ' more'
    : a.short + ': ' + a.title + ' - ' + z.short + ': ' + z.title;
  return { items: run.map(function (e) { return { bid: e.bid, cid: e.cid }; }), label: label };
}

/** How many days the Volumes plan takes at `pace`. */
export function volumesDays(seq, pace) {
  return Math.ceil(seq.length / Math.max(1, Math.floor(pace) || 1));
}

/**
 * Whole local days from `start` ('YYYY-MM-DD') to the date `now` falls on.
 * Counts calendar dates, so a DST change or the hour of day never shifts it.
 * @param {string} start
 * @param {Date} now
 * @returns {number}
 */
export function dayIndex(start, now) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start || '');
  if (!m) return 0;
  var a = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  var b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((b - a) / 86400000);
}

/** 'YYYY-MM-DD' of `now`'s local date. */
export function localDateKey(now) {
  var mm = String(now.getMonth() + 1).padStart(2, '0'), dd = String(now.getDate()).padStart(2, '0');
  return now.getFullYear() + '-' + mm + '-' + dd;
}

/**
 * Where a plan stands today.
 * @param {{ id: string, start: string, pace?: number }} plan
 * @param {Date} now
 * @param {(bid: string, cid: string | number) => boolean} isRead
 * @param {{ bid: string, cid: string, title: string, short: string }[]} [seq]  the Volumes sequence (volumes plan only)
 * @returns {{ day: number, totalDays: number, today: { items: any[], label: string }, todayDone: boolean,
 *             doneDays: number, behind: number, catchUpDay: number, finished: boolean, percent: number } | null}
 */
export function planStatus(plan, now, isRead, seq) {
  if (!plan || !plan.start) return null;
  var isBible = plan.id === 'bible-year';
  if (!isBible && plan.id !== 'volumes') return null;
  if (!isBible && !(seq && seq.length)) return null;       // the Volumes are not loaded yet
  var totalDays = isBible ? BIBLE_YEAR_DAYS : volumesDays(seq || [], plan.pace || 1);
  var portion = isBible ? biblePortion : function (d) { return volumesPortion(seq || [], d, plan.pace || 1); };
  var allRead = function (items) {
    if (!items.length) return false;
    for (var i = 0; i < items.length; i++) if (!isRead(items[i].bid, items[i].cid)) return false;
    return true;
  };
  var day = Math.max(0, Math.min(dayIndex(plan.start, now), totalDays - 1));
  var doneDays = 0, catchUpDay = -1;
  for (var d = 0; d < totalDays; d++) {
    if (allRead(portion(d).items)) doneDays++;
    else if (d < day && catchUpDay < 0) catchUpDay = d;
  }
  var behind = 0;
  for (var e = 0; e < day; e++) if (!allRead(portion(e).items)) behind++;
  var today = portion(day);
  return {
    day: day, totalDays: totalDays, today: today, todayDone: allRead(today.items),
    doneDays: doneDays, behind: behind, catchUpDay: catchUpDay,
    finished: doneDays === totalDays, percent: Math.floor(doneDays * 100 / totalDays),
  };
}
