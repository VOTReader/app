function snapRangeToWords(text, start, end) {
  if (!text || typeof text !== 'string') return { start, end };
  start = Math.max(0, Math.min(start, text.length));
  end = Math.max(0, Math.min(end, text.length));
  const isWord = (c) => !!c && /[\w’’-]/.test(c);
  // Only snap start backward to include the full beginning word.
  // End is left exactly where the user released — no forward expansion.
  while (start > 0 && isWord(text[start - 1]) && isWord(text[start])) start--;
  return { start, end };
}

/* Build a highlight key for a Bible verse */
function bibleHlKey(bookId, chapter, verse) { return 'bible:' + bookId + ':' + chapter + ':' + verse; }
/* Build a highlight key for a letter block */
function letterHlKey(letterId, blockIdx) { return 'letter:' + letterId + ':' + blockIdx; }
/* Build a highlight key for a WTLB paragraph */
function wtlbHlKey(entryId, paraIdx) { return 'wtlb:' + entryId + ':' + paraIdx; }
/* Build a highlight key for a study chapter block */
function studyHlKey(chapterId, blockIdx) { return 'study:' + chapterId + ':' + blockIdx; }
