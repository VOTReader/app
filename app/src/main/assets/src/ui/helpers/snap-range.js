/* Snap an annotation range to whole-word boundaries. If the user's
   selection lands mid-word on either side, expand outward to the
   nearest word start / word end. Matches the convention of every
   major reader app (Kindle, Apple Books, LDS Gospel Library) — the
   selection always commits to whole words. This also eliminates the
   mid-word wrap problem entirely, because mark elements now always
   align with word boundaries in the rendered text. */
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
