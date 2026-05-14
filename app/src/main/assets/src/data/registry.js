function linkWtlbEntries(arr) {
  for (let i = 0; i < arr.length; i++) {
    arr[i].prevEntry = i > 0 ? { id: arr[i - 1].id, title: arr[i - 1].title } : null;
    arr[i].nextEntry = i < arr.length - 1 ? { id: arr[i + 1].id, title: arr[i + 1].title } : null;
  }
}

COLLECTIONS.forEach(function(col) {
  if (col.kind === 'wtlb' || col.kind === 'blessed') {
    var arr = colLetterArr(col);
    if (arr.length > 0) linkWtlbEntries(arr);
  }
});

function linkPreface(preface, letters) {
  if (!preface || !letters || letters.length === 0) return;
  preface.num = 0;
  preface.isPreface = true;
  preface.nextLetter = { id: letters[0].id, title: letters[0].title };
  letters[0].prevLetter = { id: preface.id, title: preface.title };
}

COLLECTIONS.forEach(function(col) {
  var pref = colPreface(col), arr = colLetterArr(col);
  if (pref) linkPreface(pref, arr);
});

const BIBLE_BOOK_LIST = [
  BOOKS.genesis, BOOKS.exodus, BOOKS.leviticus, BOOKS.numbers, BOOKS.deuteronomy,
  BOOKS.joshua, BOOKS.judges, BOOKS.ruth,
  BOOKS["1samuel"], BOOKS["2samuel"], BOOKS["1kings"], BOOKS["2kings"],
  BOOKS["1chronicles"], BOOKS["2chronicles"],
  BOOKS.ezra, BOOKS.nehemiah, BOOKS.esther,
  BOOKS.job, BOOKS.psalms, BOOKS.proverbs, BOOKS.ecclesiastes, BOOKS.songofsolomon,
  BOOKS.isaiah, BOOKS.jeremiah, BOOKS.lamentations, BOOKS.ezekiel, BOOKS.daniel,
  BOOKS.hosea, BOOKS.joel, BOOKS.amos, BOOKS.obadiah, BOOKS.jonah,
  BOOKS.micah, BOOKS.nahum, BOOKS.habakkuk, BOOKS.zephaniah,
  BOOKS.haggai, BOOKS.zechariah, BOOKS.malachi,
  BOOKS["matthew-plain"], BOOKS.mark, BOOKS.luke, BOOKS.john, BOOKS.acts,
  BOOKS.romans, BOOKS["1corinthians"], BOOKS["2corinthians"], BOOKS.galatians,
  BOOKS.ephesians, BOOKS.philippians, BOOKS.colossians,
  BOOKS["1thessalonians"], BOOKS["2thessalonians"],
  BOOKS["1timothy"], BOOKS["2timothy"], BOOKS.titus, BOOKS.philemon,
  BOOKS.hebrews,
  BOOKS.james, BOOKS["1peter"], BOOKS["2peter"],
  BOOKS["1john"], BOOKS["2john"], BOOKS["3john"], BOOKS.jude,
  BOOKS.revelation
];

if (typeof OT_BOOK_IDS === 'undefined') {
  var OT_BOOK_IDS = new Set(BIBLE_BOOK_LIST.slice(0, 39).map((b) => b.id));
}

const VOT_LETTER_REGISTRY = (() => {
  const reg = new Map();
  const add = (collection, entries, screen, volKey) => {
    if (!entries) return;
    const list = Array.isArray(entries) ? entries : [entries];
    for (const l of list) {
      if (!l || !l.title || !l.id) continue;
      reg.set(collection + "::" + l.title, { id: l.id, screen, volKey, activeReadKey: "vol:" + volKey });
    }
  };
  for (const col of COLLECTIONS) {
    const letters = colLetters(col);
    if (!letters) continue;
    const pref = colPreface(col);
    if (pref) add(col.registryLabel, pref, col.letterScreen, col.volKey);
    add(col.registryLabel, letters, col.letterScreen, col.volKey);
    if (col.volKey === 'hm') {
      for (const l of (Array.isArray(letters) ? letters : [])) {
        if (l && l.title && l.id) reg.set(l.title + "::" + l.title, { id: l.id, screen: col.letterScreen, volKey: col.volKey, activeReadKey: "vol:" + col.volKey });
      }
    }
  }
  var _bArr = colLetterArr(COL_BY_KEY.get('blessed'));
  if (_bArr.length > 0) {
    const intro = _bArr.find((e) => e.id === "introduction");
    if (intro) reg.set("null::The Blessed: More Declarations of Blessedness From The Lord, Our God and Savior", { id: intro.id, screen: "blessed-entry", volKey: "blessed", activeReadKey: "vol:blessed" });
  }
  for (const study of _studies()) {
    if (!study || !study.title || !study.slug) continue;
    const firstCh = study.chapters && study.chapters[0] || null;
    if (!firstCh) continue;
    reg.set(study.title + "::" + study.title, { id: firstCh.id, screen: "bible-study-chapter", studyId: study.slug, studyChapterId: firstCh.id, volKey: "study-" + study.slug, activeReadKey: "bible-study-" + study.slug, isStudy: true });
  }
  return reg;
})();

function resolveVotLetter(vol, letter) {
  if (!letter) return null;
  const key = (vol || "null") + "::" + letter;
  return VOT_LETTER_REGISTRY.get(key) || null;
}

const HIDDEN_MANNA_TITLES = new Set([
  "The Promise",
  "I Have Purged; Behold, I Shall Wipe Away and Restore",
  "Woe to Dallas"
]);

function isHiddenManna(n) {
  return !!n && HIDDEN_MANNA_TITLES.has((n.letter || "").trim());
}
