# Writer brief: search queries as real people type them

You are writing search queries for a Bible-and-letters reading app (VOTReader). Real readers come back to something they
read once, a week ago, and type what they remember into the search box on a phone. Your job: for each target in your
packet, write the ONE query that reader would type, in the style the target names.

Rules
- Read ONLY your packet file and this brief. Do not open, search or read any other file, code or folder (no app code, no
  other packets). You must not know how the search works; write as a reader, not to please an engine.
- Write as a person recalls something a week after reading it once: nothing memory would not hold. Lowercase is normal;
  people rarely type punctuation. No quotation marks unless the style says so. No references (no "John 3:16") unless asked.
- The MARKED text is what the reader remembers (`sentence`). For whole-unit styles it is the letter or entry as a whole.
- One query per target. Plain text, 2 to 16 words unless the style says otherwise.

Styles
- `exact`: a 6-12 word run copied exactly from the marked sentence (case and punctuation may drop, as typed on a phone).
  Pick the part a reader would actually remember, not always the start.
- `misremembered`: a 6-12 word piece of the marked sentence with 1-2 words remembered wrong: a synonym, a tense, a
  plural, you/thee or will/shall swapped, a small word dropped or added. Natural memory slips, not random edits.
- `paraphrase`: the meaning of the marked sentence in your own everyday words, as someone who remembers the idea but not
  the wording. Keep at most one or two of its distinctive key words. NEVER copy more than 4 consecutive words from it.
- `rare`: a 2-4 word unusual phrase from the marked sentence that sticks in memory (an odd image, a name, a striking word
  pair). Copy it as it is written (it must appear in the sentence word for word, ignoring case and punctuation).
- `gist`: describe what the passage is about so you could find it again, with one name or distinctive key word from it,
  5-12 words ("where god says the fig tree is a sign of summer"). Do not quote more than 4 consecutive words.
- `middle`: the marked sentence sits in the middle of a long paragraph. Type 6-14 words of it as you remember it: mostly
  accurate, one small slip allowed.
- `crossover` with `variant: kjv`: the reader learned this verse in the King James Version. Type 6-14 words of the KJV
  wording given in `kjv` (thee, thou, shall, unto ... as written there), as remembered from the KJV.
- `crossover` with `variant: restored-names`: the reader calls Jesus "YahuShua" (sometimes typed "yahushua"). Type 6-12
  words of the verse with that name in place of Jesus (and "The Messiah" for Christ if it appears).
- `title`: the reader half-remembers the title of the letter or entry: type it with one or two words wrong, dropped,
  reordered, or only the memorable part of a long title. Never the exact full title.
- `firstwords`: the reader remembers how the letter starts (the marked sentence, after the usual "Thus says The Lord"
  opener). Type its first 5-10 words as remembered.
- `typos`: type a 5-10 word piece of the marked sentence fast on a phone: all lowercase, 1-3 typos (a neighbouring key, a
  dropped or doubled letter, a missing apostrophe, two words run together). Keep it recognisable.
- `unitgist`: the reader wants this whole letter again and remembers what it is about, not its title. Type 3-10 words
  describing its subject the way people do ("letter about the catholic church being a harlot"). Do not copy the title.

Output
Write a JSON array to the output path your packet names, one object per target, in packet order:
`[{"id": "t001", "q": "your query"}, ...]`. Then reply with one line: how many you wrote.
