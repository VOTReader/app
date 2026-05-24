(() => {
  // app/src/main/assets/src/utils/hl-keys.js
  function bibleHlKey2(bookId, chapter, verse) {
    return "bible:" + bookId + ":" + chapter + ":" + verse;
  }
  function letterHlKey2(letterId, blockIdx) {
    return "letter:" + letterId + ":" + blockIdx;
  }
  function wtlbHlKey2(entryId, paraIdx) {
    return "wtlb:" + entryId + ":" + paraIdx;
  }
  function studyHlKey2(chapterId, blockIdx) {
    return "study:" + chapterId + ":" + blockIdx;
  }

  // app/src/main/assets/src/utils/dates.js
  function relativeDate2(ts) {
    if (!ts) return "";
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 6e4);
    if (min < 1) return "Just now";
    if (min < 60) return min + "m ago";
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + "h ago";
    const d = Math.floor(hr / 24);
    if (d < 7) return d + "d ago";
    if (d < 30) return Math.floor(d / 7) + "w ago";
    const date = new Date(ts);
    return date.toLocaleDateString(void 0, { month: "short", day: "numeric" });
  }
  function timeAgo2(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 6e4);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}w ago`;
    return `${Math.floor(days / 30)}mo ago`;
  }

  // app/src/main/assets/src/utils/garden.js
  var GARDEN_TOTAL2 = 209;
  var GARDEN_TIERS2 = [
    { id: "mobile", label: "Mobile", res: "2160px", size: "~110 MB", tag: "garden-mobile", desc: "Screen-native; light on cell data" },
    { id: "standard", label: "Standard", res: "2880px", size: "~180 MB", tag: "garden-standard", desc: "Balanced default \u2014 great at 1\xD7 and 1.5\xD7 zoom" },
    { id: "native", label: "Native", res: "3600px", size: "~320 MB", tag: "garden-native", desc: "Full source detail; no upscaling" },
    { id: "ultra", label: "Ultra", res: "4600px", size: "~680 MB", tag: "garden-ultra", desc: "Maximum quality \u2014 for pixel-peepers" }
  ];
  var GARDEN_DEFAULT_TIER2 = "standard";
  var gardenImageCache2 = {};
  function getGardenTier2(id) {
    return (
      /** @type {GardenTier} */
      GARDEN_TIERS2.find((t) => t.id === id) || GARDEN_TIERS2.find((t) => t.id === GARDEN_DEFAULT_TIER2)
    );
  }
  function gardenUrl2(n, tierId) {
    const tier = getGardenTier2(tierId);
    return `https://github.com/corbinlythgoe/votreader-assets/releases/download/${tier.tag}/garden_${String(n).padStart(3, "0")}.jpg`;
  }
  function gardenCacheKey2(n, tierId) {
    return `${tierId}:${n}`;
  }
  function gardenPreload2(n, tierId) {
    if (n < 1 || n > GARDEN_TOTAL2) return;
    const key = gardenCacheKey2(n, tierId);
    if (gardenImageCache2[key]) return;
    const img = new Image();
    img.src = gardenUrl2(n, tierId);
    gardenImageCache2[key] = img;
  }
  function gardenIsCached2(n, tierId) {
    const img = gardenImageCache2[gardenCacheKey2(n, tierId)];
    return !!(img && img.complete && img.naturalWidth > 0);
  }

  // app/src/main/assets/src/utils/tabs.js
  function describeTab2(tab) {
    const s = tab.screen || "home";
    const resolveBook = (id) => id ? id === "matthew" ? MATTHEW : id === "matthew-plain" ? MATTHEW_PLAIN : BOOKS[id] : null;
    const book = resolveBook(tab.bookId);
    if (s === "matthew-ch" || s === "bible-ch") {
      const title = book ? `${book.title} \xB7 Ch. ${tab.chapterNum ?? "?"}` : "Reading";
      const ot = book && OT_BOOK_IDS && OT_BOOK_IDS.has(book.id);
      const subtitle = book ? book.id === "matthew" || book.id === "matthew-plain" ? "New Testament \xB7 Gospels" : ot ? "Old Testament" : "New Testament" : "Scripture";
      return { title, subtitle };
    }
    if (s === "bible-idx" || s === "matthew-idx") {
      const title = book ? book.title : "Book";
      return { title, subtitle: book && OT_BOOK_IDS && OT_BOOK_IDS.has(book.id) ? "Old Testament" : "New Testament" };
    }
    if (s === "scriptures-home") return { title: "Scriptures", subtitle: "The Scriptures of Truth" };
    if (s === "scripture-genre") return { title: tab.genreId || "Scriptures", subtitle: "Browse by genre" };
    const _ltrCol = COL_BY_LETTER_SC.get(s);
    if (_ltrCol) {
      const l = colLetterArr(_ltrCol).find((e) => e.id === tab.letterId);
      return { title: l?.title || (_ltrCol.kind === "letter" ? "Letter" : "Entry"), subtitle: _ltrCol.label };
    }
    const _idxCol = COL_BY_INDEX_SC.get(s);
    if (_idxCol) return { title: _idxCol.label, subtitle: _idxCol.kind === "letter" ? "Letter index" : "Entry index" };
    if (s === "volumes-home") return { title: "Volumes", subtitle: "The Volumes of Truth" };
    if (s === "studies-home") return { title: "Studies", subtitle: "Letter Studies \xB7 Matthew Study Bible" };
    if (s === "bible-study-index") {
      const _study = _studies().find((st) => st.slug === tab.studyId);
      return { title: _study?.title || "Study", subtitle: "Bible Letter Study" };
    }
    if (s === "bible-study-chapter") {
      const _study = _studies().find((st) => st.slug === tab.studyId);
      const _ch = _study && _study.chapters && _study.chapters.find((c) => c.id === tab.studyChapterId);
      return { title: _ch?.title || "Study Chapter", subtitle: _study?.title || "Bible Letter Study" };
    }
    if (s === "garden-view") return { title: `The Garden \xB7 Page ${tab.gardenPage ?? 1}`, subtitle: "A Return to The Garden" };
    if (s === "search") return { title: tab.searchQuery ? `"${tab.searchQuery}"` : "Search", subtitle: "Full-text search" };
    if (s === "history") return { title: "History", subtitle: "Recently visited" };
    if (s === "settings") return { title: "Settings", subtitle: "App configuration" };
    return { title: "Home", subtitle: "VOT Study Bible" };
  }
  function tabContentKey2(tab) {
    return `${tab.screen || "home"}|${tab.bookId || ""}|${tab.chapterNum ?? ""}|${tab.letterId || ""}|${tab.studyId || ""}|${tab.studyChapterId || ""}|${tab.genreId || ""}|${tab.gardenPage ?? ""}`;
  }
  function tabHasProgressBar2(tab) {
    return READING_SCREENS.has(tab.screen);
  }
  function scrollKeyForTab2(tab) {
    const s = tab.screen;
    if (s === "matthew-ch" || s === "bible-ch") return `${tab.bookId}-${tab.chapterNum}`;
    if (s === "bible-study-chapter") return `study-${tab.studyId || ""}-${tab.studyChapterId || ""}`;
    if (s === "hm-letter") return `entry-${tab.letterId}`;
    const _sc = COL_BY_LETTER_SC.get(s);
    if (_sc) {
      const pfx = _sc.kind === "holy-days" ? "holyday" : _sc.kind === "letter" ? "letter" : _sc.kind;
      return `${pfx}-${tab.letterId}`;
    }
    return s || "home";
  }

  // app/src/main/assets/src/utils/nav-index.js
  function buildNavIndex() {
    if (window.__NAV_INDEX) return window.__NAV_INDEX;
    const items = [];
    const books = _allBooks();
    Object.values(books).forEach((book) => {
      if (!book || !book.chapters) return;
      const titleLc = book.title.toLowerCase();
      const titleNoSpace = titleLc.replace(/\s+/g, "");
      const abbrevs = {
        "genesis": "gen",
        "exodus": "exo",
        "leviticus": "lev",
        "numbers": "num",
        "deuteronomy": "deut",
        "joshua": "josh",
        "judges": "judg",
        "1samuel": "1sam",
        "2samuel": "2sam",
        "1kings": "1kgs",
        "2kings": "2kgs",
        "1chronicles": "1chr",
        "2chronicles": "2chr",
        "nehemiah": "neh",
        "psalms": "ps",
        "proverbs": "prov",
        "ecclesiastes": "ecc",
        "songofsolomon": "song",
        "isaiah": "isa",
        "jeremiah": "jer",
        "lamentations": "lam",
        "ezekiel": "eze",
        "daniel": "dan",
        "hosea": "hos",
        "obadiah": "oba",
        "jonah": "jon",
        "micah": "mic",
        "nahum": "nah",
        "habakkuk": "hab",
        "zephaniah": "zeph",
        "haggai": "hag",
        "zechariah": "zech",
        "malachi": "mal",
        "matthew": "mt",
        "mark": "mk",
        "luke": "lk",
        "john": "jn",
        "romans": "rom",
        "1corinthians": "1cor",
        "2corinthians": "2cor",
        "galatians": "gal",
        "ephesians": "eph",
        "philippians": "phil",
        "colossians": "col",
        "1thessalonians": "1thess",
        "2thessalonians": "2thess",
        "1timothy": "1tim",
        "2timothy": "2tim",
        "titus": "titus",
        "philemon": "phlm",
        "hebrews": "heb",
        "james": "jas",
        "1peter": "1pet",
        "2peter": "2pet",
        "1john": "1jn",
        "2john": "2jn",
        "3john": "3jn",
        "jude": "jude",
        "revelation": "rev"
      };
      const abbr = abbrevs[book.id] || titleLc.slice(0, 3);
      book.chapters.forEach((ch) => {
        const aliases = [
          titleLc + " " + ch.num,
          titleNoSpace + ch.num,
          abbr + " " + ch.num,
          abbr + ch.num,
          // First-3-letters fallback
          titleLc.slice(0, 3) + " " + ch.num
        ];
        items.push({
          kind: "bible-chapter",
          bookId: book.id,
          chapter: ch.num,
          label: book.title + " " + ch.num,
          category: bookCategory(book.id),
          title: book.title,
          aliases: aliases.map((a) => a.toLowerCase())
        });
      });
    });
    const NAV_KIND = { letter: "letter", wtlb: "wtlb-entry", blessed: "blessed-entry", "holy-days": "holy-days-entry" };
    const VOL_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
    const NAV_ALIAS_BASES = {
      timothy: ["timothy", "tim", "letters from timothy", "lft"],
      flock: ["flock", "letters to the flock", "lttf", "ltf"],
      rebuke: ["rebuke", "the lord's rebuke", "lr", "lord's rebuke"],
      wtlb1: ["wtlb1", "wtlb 1", "wtlb part one", "words to live by 1", "wtlb one"],
      wtlb2: ["wtlb2", "wtlb 2", "wtlb part two", "words to live by 2", "wtlb two"],
      blessed: ["blessed", "the blessed"],
      holydays: ["holy days", "hd"]
    };
    for (const col of COLLECTIONS) {
      if (col.volKey === "hm") continue;
      const navKind = NAV_KIND[col.kind] || "letter";
      const isLetter = navKind === "letter";
      const vn = VOL_NUM[col.volKey];
      const bases = NAV_ALIAS_BASES[col.volKey];
      const category = col.volKey === "holydays" ? "Holy Days" : col.label;
      const pref = colPreface(col);
      if (pref && pref.id) {
        const pAliases = [pref.title.toLowerCase()];
        if (vn) pAliases.push(col.label.toLowerCase() + " preface", "v" + vn + " preface");
        if (bases) bases.forEach((b) => pAliases.push(b + " preface"));
        items.push({
          kind: navKind,
          collection: col.label,
          screen: col.letterScreen,
          letterId: pref.id,
          letterNum: 0,
          label: pref.title,
          category,
          title: pref.title,
          aliases: pAliases
        });
      }
      colLetterArr(col).forEach((entry) => {
        const aliases = [entry.title.toLowerCase()];
        if (vn && entry.num != null) {
          aliases.push(
            "v" + vn + "l" + entry.num,
            "v" + vn + " l" + entry.num,
            "vol " + vn + " letter " + entry.num,
            "volume " + vn + " letter " + entry.num,
            col.label.toLowerCase() + " letter " + entry.num,
            col.label.toLowerCase() + " " + entry.num,
            "v" + vn + " " + entry.num,
            "vol" + vn + " " + entry.num
          );
        }
        if (bases) {
          bases.forEach((b) => {
            aliases.push(b + " " + (entry.num != null ? entry.num : ""));
            if (entry.num != null) {
              aliases.push(b + entry.num);
              if (col.kind === "wtlb") aliases.push(b + " #" + entry.num);
            }
          });
        }
        const item = {
          kind: navKind,
          collection: col.label,
          screen: col.letterScreen,
          label: entry.title,
          category,
          title: entry.title,
          aliases
        };
        if (isLetter) {
          item.letterId = entry.id;
          item.letterNum = entry.num;
        } else {
          item.entryId = entry.id;
          item.entryNum = entry.num;
        }
        items.push(item);
      });
    }
    if (Array.isArray(window.BIBLE_STUDIES)) {
      window.BIBLE_STUDIES.forEach((study) => {
        if (!study || !Array.isArray(study.chapters)) return;
        const studyKey = (study.slug || study.id || "").toLowerCase();
        const studyTitleLc = (study.title || "").toLowerCase();
        study.chapters.forEach((ch) => {
          if (!ch || !ch.id) return;
          const chTitle = ch.title || "Chapter " + (ch.num != null ? ch.num : ch.id);
          items.push({
            kind: "study-letter-chapter",
            collection: study.title || "Bible Study",
            screen: "bible-study-chapter",
            studyId: study.slug || study.id,
            studyChapterId: ch.id,
            letterId: ch.id,
            // for openLinkPicker compat
            chapterNum: ch.num,
            label: chTitle,
            category: "Bible Studies",
            title: chTitle,
            aliases: [
              chTitle.toLowerCase(),
              studyTitleLc,
              studyKey + " " + (ch.num != null ? ch.num : ""),
              studyKey + (ch.num != null ? ch.num : "")
            ].filter(Boolean)
          });
        });
      });
    }
    var _m = _matthew();
    if (_m && Array.isArray(_m.chapters)) {
      _m.chapters.forEach((ch) => {
        items.push({
          kind: "study-chapter",
          bookId: "matthew",
          chapter: ch.num,
          screen: "matthew-ch",
          label: "Matthew Study Bible \u2014 Chapter " + ch.num + (ch.title ? ": " + ch.title : ""),
          category: "Bible Studies",
          title: ch.title || "Chapter " + ch.num,
          aliases: [
            "matthew study " + ch.num,
            "msb " + ch.num,
            "msb" + ch.num,
            "matthew sb " + ch.num,
            "matthew study bible " + ch.num
          ]
        });
      });
    }
    window.__NAV_INDEX = items;
    return items;
  }
  function searchNavIndex2(query, limit) {
    limit = limit || 30;
    if (!query) return [];
    const q = query.toLowerCase().trim();
    const items = buildNavIndex();
    const scored = [];
    const refP = parseRefStr(q);
    let bibleRefHit = null;
    if (refP) {
      const bookKey = findBook(refP.rawBook);
      if (bookKey) {
        const books = _allBooks();
        const bookEntry = books[bookKey];
        if (bookEntry && bookEntry.chapters) {
          const chRec = bookEntry.chapters.find((c) => c.num === refP.chapter);
          if (chRec) {
            const isStudy = bookEntry.id === "matthew";
            const lbl = bookEntry.title + " " + refP.chapter + (refP.verse != null ? ":" + refP.verse + (refP.verseEnd ? "-" + refP.verseEnd : "") : "");
            bibleRefHit = isStudy ? {
              kind: "study-chapter",
              bookId: bookEntry.id,
              chapter: refP.chapter,
              verse: refP.verse,
              verseEnd: refP.verseEnd,
              screen: "matthew-ch",
              label: lbl,
              category: "Study Bible",
              title: bookEntry.title
            } : {
              kind: "bible-chapter",
              bookId: bookEntry.id,
              chapter: refP.chapter,
              verse: refP.verse,
              verseEnd: refP.verseEnd,
              label: lbl,
              category: bookCategory(bookEntry.id),
              title: bookEntry.title
            };
            scored.push({ item: bibleRefHit, score: 1e3 });
          }
        }
      }
    }
    for (const item of items) {
      if (bibleRefHit && (item.kind === "bible-chapter" || item.kind === "study-chapter") && item.bookId === bibleRefHit.bookId && item.chapter === bibleRefHit.chapter) {
        continue;
      }
      let best = 0;
      for (const a of item.aliases) {
        if (a === q) {
          best = Math.max(best, 900);
          continue;
        }
        if (a.startsWith(q)) {
          best = Math.max(best, 700 - (a.length - q.length));
          continue;
        }
        const idx = a.indexOf(q);
        if (idx >= 0) {
          best = Math.max(best, 400 - idx);
          continue;
        }
      }
      const titleLc = (item.title || "").toLowerCase();
      if (titleLc.includes(q)) best = Math.max(best, 200);
      if (best > 0) scored.push({ item, score: best });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }
  function navItemPreview(it) {
    if (it.kind === "bible-chapter") {
      const b = _allBooks()[it.bookId];
      if (!b) return "";
      const ch = b.chapters && b.chapters.find((c) => c.num === it.chapter);
      if (!ch) return "";
      if (it.verse) {
        const v = ch.sections && ch.sections.flatMap((s) => s.verses).find((v2) => v2.n === it.verse);
        return v ? v.text : "";
      }
      return ch.sections && ch.sections[0] && ch.sections[0].heading || "";
    }
    if (it.kind === "study-chapter") {
      const M = _matthew();
      if (!M) return "";
      const ch = M.chapters && M.chapters.find((c) => c.num === it.chapter);
      if (!ch) return "";
      if (it.verse) {
        const v = ch.verses && ch.verses.find((v2) => v2.n === it.verse);
        return v ? v.text : "";
      }
      return ch.title || "";
    }
    return "";
  }
  function navItemToEndpoint2(it) {
    if (it.kind === "bible-chapter") {
      const hasVerse = it.verse != null;
      const key = hasVerse ? bibleHlKey(it.bookId, it.chapter, it.verse) : "bible:" + it.bookId + ":" + it.chapter;
      return {
        type: "bible",
        key,
        bookId: it.bookId,
        chapter: it.chapter,
        verse: hasVerse ? it.verse : null,
        label: it.label,
        preview: navItemPreview(it)
      };
    }
    if (it.kind === "letter") {
      return {
        type: "letter",
        key: "letter:" + it.letterId + ":0",
        letterId: it.letterId,
        screen: it.screen,
        collection: it.collection,
        label: it.label,
        preview: ""
      };
    }
    if (it.kind === "wtlb-entry" || it.kind === "blessed-entry" || it.kind === "holy-days-entry") {
      const _type = it.kind === "holy-days-entry" ? "holy-days" : it.kind === "blessed-entry" ? "blessed" : "wtlb";
      return {
        type: _type,
        key: "wtlb:" + it.entryId + ":0",
        entryId: it.entryId,
        screen: it.screen,
        collection: it.collection,
        label: it.label,
        preview: ""
      };
    }
    if (it.kind === "study-chapter") {
      const v = it.verse || null;
      const key = v ? "study:" + it.bookId + "-" + it.chapter + ":" + v : "study:" + it.bookId + "-" + it.chapter + ":0";
      return {
        type: "study",
        key,
        bookId: it.bookId,
        chapter: it.chapter,
        verse: v,
        screen: it.screen || "matthew-ch",
        label: it.label,
        preview: navItemPreview(it)
      };
    }
    if (it.kind === "study-letter-chapter") {
      return {
        type: "study-letter",
        key: "letter:" + it.studyChapterId + ":0",
        letterId: it.studyChapterId,
        studyId: it.studyId,
        studyChapterId: it.studyChapterId,
        screen: it.screen || "bible-study-chapter",
        collection: it.collection,
        label: it.label,
        preview: ""
      };
    }
    return null;
  }
  function buildSourceEndpoint2(sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText) {
    const parts = sourceKey.split(":");
    const excerpt = sourceStart != null ? { start: sourceStart, end: sourceEnd, text: sourceText } : {};
    if (parts[0] === "bible") {
      return { type: "bible", key: sourceKey, bookId: parts[1], chapter: parseInt(parts[2], 10), verse: parseInt(parts[3], 10), label: sourceLabel || sourceKey };
    }
    if (parts[0] === "study") {
      const m = parts[1].match(/^(.+)-(\d+)$/);
      const bookId = m ? m[1] : "matthew";
      const chapter = m ? parseInt(m[2], 10) : null;
      const verse = parts[2] && parts[2] !== "0" ? parseInt(parts[2], 10) : null;
      return { type: "study", key: sourceKey, bookId, chapter, verse, screen: "matthew-ch", label: sourceLabel || sourceKey };
    }
    if (parts[0] === "letter" || parts[0] === "wtlb" || parts[0] === "blessed" || parts[0] === "holy-days") {
      const id = parts[1];
      const ctx = findEntryContext(id, parts[0]);
      if (ctx && ctx.kind === "study-letter") {
        return {
          type: "study-letter",
          key: sourceKey,
          letterId: id,
          studyId: ctx.studyId,
          studyChapterId: ctx.studyChapterId,
          screen: ctx.screen,
          collection: ctx.collection,
          label: sourceLabel || ctx.title,
          ...excerpt
        };
      }
      if (ctx) {
        const base = {
          type: ctx.kind,
          key: sourceKey,
          screen: ctx.screen,
          collection: ctx.collection,
          label: sourceLabel || ctx.title,
          ...excerpt
        };
        if (ctx.kind === "letter") base.letterId = id;
        else base.entryId = id;
        return base;
      }
      if (parts[0] === "letter") return { type: "letter", key: sourceKey, letterId: id, label: sourceLabel || sourceKey, ...excerpt };
      if (parts[0] === "wtlb") return { type: "wtlb", key: sourceKey, entryId: id, label: sourceLabel || sourceKey, ...excerpt };
      return { type: parts[0], key: sourceKey, label: sourceLabel || sourceKey, ...excerpt };
    }
    if (parts[0] === "journal") {
      const eid = parts[1];
      let label = sourceLabel;
      if (!label && typeof JournalStore !== "undefined") {
        const je = JournalStore.get(eid);
        if (je && typeof JournalHelpers !== "undefined") {
          label = "Journal \xB7 " + (JournalHelpers.entryDisplayTitle(je) || "Untitled");
        }
      }
      return { type: "journal", key: sourceKey, entryId: eid, screen: "journal-viewer", label: label || sourceKey, ...excerpt };
    }
    return { type: parts[0], key: sourceKey, label: sourceLabel || sourceKey, ...excerpt };
  }

  // app/src/main/assets/src/utils/note-source.js
  function _bookTitle2(bookId) {
    if (typeof BIBLE_BOOK_LIST !== "undefined") {
      const b = BIBLE_BOOK_LIST.find((x) => x.id === bookId);
      if (b) return b.title;
    }
    return bookId.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
  }
  function _verseRangeLabel(nums) {
    if (!nums.length) return "";
    const sorted = [...new Set(nums)].sort((a, b) => a - b);
    const parts = [];
    let s = sorted[0], p = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === p + 1) {
        p = sorted[i];
        continue;
      }
      parts.push(s === p ? String(s) : s + "-" + p);
      s = p = sorted[i];
    }
    parts.push(s === p ? String(s) : s + "-" + p);
    return parts.join(", ");
  }
  function noteSourceLabel2(note) {
    const keys = note.keys || [];
    if (!keys.length) return "Note";
    const first = keys[0];
    const parts0 = first.split(":");
    const kind = parts0[0];
    if (kind === "bible" || kind === "study") {
      const byChap = /* @__PURE__ */ new Map();
      keys.forEach((k) => {
        const p = k.split(":");
        let book, chap, verse;
        if (kind === "study") {
          book = p[1];
          chap = (p[1].match(/-(\d+)$/) || [])[1] || "";
          verse = parseInt(p[2] || "0", 10);
        } else {
          book = p[1];
          chap = p[2];
          verse = parseInt(p[3] || "0", 10);
        }
        const ck = book + ":" + chap;
        if (!byChap.has(ck)) byChap.set(ck, []);
        byChap.get(ck).push(verse);
      });
      const segs = [];
      byChap.forEach((verses, ck) => {
        const [book, chap] = ck.split(":");
        const title = kind === "bible" ? _bookTitle2(book) : (
          // study key shape e.g. "matthew-22"; strip off the chapter half
          (function() {
            const m = book.match(/^(.+)-(\d+)$/);
            return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : book;
          })()
        );
        segs.push(title + " " + chap + ":" + _verseRangeLabel(verses.filter(Boolean)));
      });
      return segs.join(" \xB7 ");
    }
    if (kind === "letter" || kind === "wtlb" || kind === "blessed" || kind === "holy-days") {
      const id = parts0[1];
      if (typeof findEntryContext === "function") {
        const ctx = findEntryContext(id, kind);
        if (ctx && ctx.title) return ctx.title;
      }
      return id;
    }
    if (kind === "journal") {
      const eid = parts0[1];
      const je = typeof JournalStore !== "undefined" ? JournalStore.get(eid) : null;
      if (je) {
        const title = typeof JournalHelpers !== "undefined" && JournalHelpers.entryDisplayTitle ? JournalHelpers.entryDisplayTitle(je) || "Untitled" : je.title || "Untitled";
        return "Journal \xB7 " + title;
      }
      return "Journal Entry";
    }
    return first;
  }
  function noteSourceNav2(note) {
    const keys = note.keys || [];
    if (!keys.length) return null;
    const k = keys[0];
    const p = k.split(":");
    const kind = p[0];
    if (kind === "bible") {
      return { type: "bible", key: k, bookId: p[1], chapter: parseInt(p[2], 10), verse: parseInt(p[3], 10) };
    }
    if (kind === "study") {
      const m = (p[1] || "").match(/^(.+)-(\d+)$/);
      if (m) return { type: "study", key: k, bookId: m[1], chapter: parseInt(m[2], 10), verse: parseInt(p[2] || "0", 10) };
    }
    if (kind === "letter" || kind === "wtlb" || kind === "blessed" || kind === "holy-days") {
      const ctx = typeof findEntryContext === "function" ? findEntryContext(p[1], kind) : null;
      return {
        type: kind,
        key: k,
        letterId: p[1],
        entryId: p[1],
        screen: ctx ? ctx.screen : null
      };
    }
    if (kind === "journal") {
      return {
        type: "journal",
        key: k,
        entryId: p[1],
        screen: "journal-viewer"
      };
    }
    return null;
  }

  // app/src/main/assets/src/utils/book-category.js
  function bookCategory2(bookId) {
    var ot = typeof OT_BOOK_IDS !== "undefined" ? OT_BOOK_IDS : _OT_BOOKS_INLINE;
    return ot.has(bookId) ? "Old Testament" : "New Testament";
  }

  // app/src/main/assets/src/utils/scripture-parse.js
  function firstVerseOfRef(refStr) {
    const stripped = refStr.replace(/^\d+:\s*/, "").trim();
    const m = stripped.match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  }
  function parseRefRanges2(refStr) {
    const stripped = refStr.replace(/^\d+:\s*/, "").trim();
    const parts = stripped.split(/,\s*/);
    const ranges = [];
    for (const p of parts) {
      const m = p.match(/(\d+)(?:\s*-\s*(\d+))?/);
      if (m) ranges.push({ start: parseInt(m[1], 10), end: parseInt(m[2] || m[1], 10) });
    }
    return ranges;
  }
  function lastVerseOfFirstRange(refStr) {
    const ranges = parseRefRanges2(refStr);
    return ranges.length > 0 ? ranges[0].end : firstVerseOfRef(refStr);
  }
  function echoVersesForRef(refStr) {
    const ranges = parseRefRanges2(refStr);
    if (ranges.length <= 1) return [];
    return ranges.slice(1).map((r) => r.end);
  }
  function getNotesForVerse2(chapter, verseNum) {
    const scriptures = (chapter.scriptures || []).filter((s) => lastVerseOfFirstRange(s.ref) === verseNum);
    const votNotes = (chapter.votNotes || []).filter((n) => lastVerseOfFirstRange(n.ref) === verseNum);
    return { scriptures, votNotes };
  }
  function getEchoesForVerse2(chapter, verseNum) {
    const scriptures = (chapter.scriptures || []).filter((s) => echoVersesForRef(s.ref).includes(verseNum));
    const votNotes = (chapter.votNotes || []).filter((n) => echoVersesForRef(n.ref).includes(verseNum));
    return { scriptures, votNotes };
  }
  function parseRefRange(ref) {
    const clean = ref.replace(/\s*\(.*?\)\s*/g, "").trim();
    const cm = clean.match(/:(\d+(?:\s*,\s*\d+)+)$/);
    if (cm) {
      const nums = cm[1].split(/\s*,\s*/).map(Number);
      if (nums.length >= 2) return { start: nums[0], end: nums[nums.length - 1], verses: nums };
    }
    const m = clean.match(/:(\d+)(?:-(\d+))?$/);
    if (!m) return null;
    const start = parseInt(m[1], 10);
    const end = m[2] ? parseInt(m[2], 10) : start;
    return end > start ? { start, end } : null;
  }
  function splitIntoVerses2(text, ref) {
    const range = parseRefRange(ref);
    if (!range) return null;
    const verseNums = range.verses || Array.from({ length: range.end - range.start + 1 }, (_, i) => range.start + i);
    const count = verseNums.length;
    if (count < 2) return null;
    const numAlt = verseNums.map(String);
    const markerRx = new RegExp(`(?:^|(?<=\\s))(${numAlt.join("|")})\\.\\s+`, "g");
    const markers = [];
    let mm;
    while ((mm = markerRx.exec(text)) !== null) {
      markers.push({ vNum: parseInt(mm[1], 10), start: mm.index, markerEnd: mm.index + mm[0].length });
    }
    let prefixLen = 0;
    const cap = Math.min(markers.length, count);
    for (let i = 0; i < cap; i++) {
      if (markers[i].vNum !== verseNums[i]) break;
      prefixLen++;
    }
    if (prefixLen > 0) {
      const segments2 = [];
      for (let i = 0; i < prefixLen; i++) {
        const textStart = markers[i].markerEnd;
        const textEnd = i + 1 < prefixLen ? markers[i + 1].start : text.length;
        const verseText = text.slice(textStart, textEnd).trim();
        segments2.push({ vNum: markers[i].vNum, text: verseText });
      }
      return segments2;
    }
    const superMap = { "\u2070": 0, "\xB9": 1, "\xB2": 2, "\xB3": 3, "\u2074": 4, "\u2075": 5, "\u2076": 6, "\u2077": 7, "\u2078": 8, "\u2079": 9 };
    function parseSuperNum(s) {
      let n = 0;
      for (const ch of s) {
        if (!(ch in superMap)) return -1;
        n = n * 10 + superMap[ch];
      }
      return n;
    }
    const superRx = /[\u2070\u00b9\u00b2\u00b3\u2074-\u2079]+/g;
    const superMarkers = [];
    let sm;
    while ((sm = superRx.exec(text)) !== null) {
      const vn = parseSuperNum(sm[0]);
      if (verseNums.includes(vn)) {
        superMarkers.push({ vNum: vn, start: sm.index, markerEnd: sm.index + sm[0].length });
      }
    }
    if (superMarkers.length > 0 && superMarkers[0].vNum !== verseNums[0]) {
      superMarkers.unshift({ vNum: verseNums[0], start: 0, markerEnd: 0 });
    }
    if (superMarkers.length === count) {
      let superExact = true;
      for (let i = 0; i < count; i++) {
        if (superMarkers[i].vNum !== verseNums[i]) {
          superExact = false;
          break;
        }
      }
      if (superExact) {
        const segs = [];
        for (let i = 0; i < count; i++) {
          const tStart = superMarkers[i].markerEnd;
          const tEnd = i + 1 < count ? superMarkers[i + 1].start : text.length;
          segs.push({ vNum: superMarkers[i].vNum, text: text.slice(tStart, tEnd).trim() });
        }
        return segs;
      }
    }
    let chunks = text.split(/(?<=[.!?])\s+(?=[A-Z\u201c\u2018])/).filter(Boolean);
    if (chunks.length < count) {
      const commaChunks = text.split(/, (?=the )/).filter(Boolean);
      if (commaChunks.length >= count) {
        chunks = commaChunks.map((c, i) => i === 0 ? c : "the " + c);
      }
    }
    if (chunks.length < count) {
      return [{ vNum: range.start, text }];
    }
    const perVerse = Math.floor(chunks.length / count);
    const remainder = chunks.length % count;
    const segments = [];
    let idx = 0;
    for (let v = 0; v < count; v++) {
      const take = perVerse + (v < remainder ? 1 : 0);
      const joined = chunks.slice(idx, idx + take).join(", ");
      segments.push({ vNum: range.start + v, text: joined });
      idx += take;
    }
    return segments;
  }

  // app/src/main/assets/src/utils/highlight.jsx
  function normalizeForHighlight(s) {
    return String(s || "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").toLowerCase();
  }
  function splitWithHighlight2(text, needle, keyPrefix) {
    if (!text || !needle) return null;
    const hay = normalizeForHighlight(text);
    const need = normalizeForHighlight(needle);
    if (!need || need.length > hay.length) return null;
    const idx = hay.indexOf(need);
    if (idx === -1) return null;
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + need.length);
    const after = text.slice(idx + need.length);
    return /* @__PURE__ */ React.createElement(React.Fragment, null, before, /* @__PURE__ */ React.createElement("mark", { key: `${keyPrefix}-mark`, className: "letter-highlight" }, match), after);
  }
  function highlightExcerptInDom2(mainEl, excerpt) {
    if (!mainEl || !excerpt) return [];
    const tokenize = (s) => normalizeForHighlight(s).match(/[a-z0-9']+/g) || [];
    const stripFnRefs = (el) => {
      const clone = el.cloneNode(true);
      clone.querySelectorAll(".fn-ref").forEach((f) => f.replaceWith(document.createTextNode(" ")));
      return clone.textContent;
    };
    const exTokens = tokenize(excerpt);
    if (exTokens.length === 0) return [];
    const paraEls = Array.from(mainEl.querySelectorAll("p, div.letter-poetry, div.letter-closing, div.letter-closing-fn"));
    const stream = [];
    const ranges = [];
    paraEls.forEach((el) => {
      const tks = tokenize(stripFnRefs(el));
      if (tks.length === 0) return;
      const start = stream.length;
      for (const t of tks) stream.push(t);
      ranges.push({ el, start, end: stream.length });
    });
    if (stream.length === 0) return [];
    const findAnchor = (anchorLen) => {
      if (anchorLen > exTokens.length) anchorLen = exTokens.length;
      if (anchorLen < 1) return -1;
      const need = exTokens.slice(0, anchorLen);
      const first = need[0];
      outer: for (let i = 0; i <= stream.length - need.length; i++) {
        if (stream[i] !== first) continue;
        for (let j = 1; j < need.length; j++) if (stream[i + j] !== need[j]) continue outer;
        return i;
      }
      return -1;
    };
    let anchor = findAnchor(8);
    if (anchor === -1) anchor = findAnchor(6);
    if (anchor === -1) anchor = findAnchor(4);
    if (anchor === -1) return [];
    let exIdx = 0;
    let stIdx = anchor;
    let lastMatchedStreamIdx = anchor;
    const maxDrift = Math.max(8, Math.floor(exTokens.length * 0.25));
    let drift = 0;
    while (exIdx < exTokens.length && stIdx < stream.length) {
      const want = exTokens[exIdx];
      if (stream[stIdx] === want) {
        lastMatchedStreamIdx = stIdx;
        exIdx++;
        stIdx++;
        continue;
      }
      let foundAt = -1;
      const lookahead = Math.min(3, stream.length - stIdx);
      for (let k = 1; k < lookahead; k++) {
        if (stream[stIdx + k] === want) {
          foundAt = stIdx + k;
          break;
        }
      }
      if (foundAt !== -1) {
        lastMatchedStreamIdx = foundAt;
        exIdx++;
        stIdx = foundAt + 1;
        continue;
      }
      exIdx++;
      drift++;
      if (drift > maxDrift) break;
    }
    const hits = ranges.filter((r) => r.start <= lastMatchedStreamIdx && r.end > anchor);
    if (hits.length === 0) return [];
    if (hits.length >= ranges.length || hits.length / ranges.length >= 0.85) return [];
    const wrapped = [];
    const isSkippable = (n) => {
      let p = n.parentNode;
      while (p && p.nodeType === 1) {
        if (p.classList) {
          if (p.classList.contains("fn-ref")) return true;
          if (p.classList.contains("inline-scrip-ref")) return true;
          if (p.tagName === "MARK" && p.classList.contains("letter-highlight")) return true;
        }
        p = p.parentNode;
      }
      return false;
    };
    hits.forEach((r) => {
      const tw = document.createTreeWalker(r.el, NodeFilter.SHOW_TEXT);
      const textNodes = [];
      let n;
      while (n = tw.nextNode()) {
        if (!n.nodeValue || !n.nodeValue.trim()) continue;
        if (isSkippable(n)) continue;
        textNodes.push(n);
      }
      textNodes.forEach((tn) => {
        const m = document.createElement("mark");
        m.className = "letter-highlight";
        tn.parentNode.insertBefore(m, tn);
        m.appendChild(tn);
        wrapped.push(m);
      });
    });
    if (wrapped.length === 0) return [];
    hits[0].el.scrollIntoView({ block: "center" });
    setTimeout(() => {
      wrapped.forEach((m) => {
        const parent = m.parentNode;
        if (!parent) return;
        while (m.firstChild) parent.insertBefore(m.firstChild, m);
        parent.removeChild(m);
        parent.normalize();
      });
    }, 8400);
    return hits.map((r) => r.el);
  }

  // app/src/main/assets/src/utils/render-text.jsx
  function renderTextWithScripRefs2(text, baseClassName, onScripClick, highlightText) {
    if (!text) return baseClassName ? /* @__PURE__ */ React.createElement("span", { className: baseClassName }, text) : text;
    const hasRef = text.includes("{{ref:");
    if (!hasRef) {
      if (highlightText) {
        const hl = splitWithHighlight(text, highlightText, "hl");
        if (hl) return baseClassName ? /* @__PURE__ */ React.createElement("span", { className: baseClassName }, hl) : hl;
      }
      return baseClassName ? /* @__PURE__ */ React.createElement("span", { className: baseClassName }, text) : text;
    }
    const parts = text.split(/(\{\{ref:[^}]+\}\})/g);
    return parts.map((part, i) => {
      const m = part.match(/^\{\{ref:(.+)\}\}$/);
      if (m) {
        const ref = m[1].trim();
        return /* @__PURE__ */ React.createElement(
          "a",
          {
            key: i,
            className: "inline-scrip-ref",
            href: "#",
            onClick: (e) => {
              e.preventDefault();
              onScripClick && onScripClick(ref);
            },
            title: ref
          },
          ref
        );
      }
      if (!part) return null;
      let content = part;
      if (highlightText) {
        const hl = splitWithHighlight(part, highlightText, `hl-${i}`);
        if (hl) content = hl;
      }
      return baseClassName ? /* @__PURE__ */ React.createElement("span", { key: i, className: baseClassName }, content) : /* @__PURE__ */ React.createElement(React.Fragment, { key: i }, content);
    });
  }

  // app/src/main/assets/src/utils/search.js
  function srchGroupKey2(doc) {
    if (!doc) return "other";
    const k = doc.kind;
    if (k === "verse" || k === "chapter-title" || k === "heading") return doc.bookId === "matthew" ? "matthew" : "bible";
    if (k === "study-note" || k === "cross-ref") return "matthew-study";
    if (k === "letter" || k === "letter-title" || k === "footnote") return doc.volumeId || "letters";
    if (k === "wtlb" || k === "wtlb-title") return doc.volumeId || "wtlb";
    if (k === "blessed" || k === "blessed-title") return "blessed";
    if (k === "holy-day" || k === "holy-day-title") return "holydays";
    if (k === "bible-study") return "bible-studies";
    return "other";
  }

  // app/src/main/assets/src/stores/thumb-store.js
  var THUMB_DB = "vot-thumbs";
  var THUMB_STORE = "thumbs";
  var _thumbDbPromise = null;
  function openThumbDB() {
    if (_thumbDbPromise) return _thumbDbPromise;
    _thumbDbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(THUMB_DB, 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(THUMB_STORE)) db.createObjectStore(THUMB_STORE);
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = () => resolve(null);
      } catch (_e) {
        resolve(null);
      }
    });
    return _thumbDbPromise;
  }
  function idbPut(key, value) {
    return openThumbDB().then((db) => {
      if (!db) return;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(THUMB_STORE, "readwrite");
          tx.objectStore(THUMB_STORE).put(value, key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        } catch (_e) {
          resolve();
        }
      });
    });
  }
  function idbDelete(key) {
    return openThumbDB().then((db) => {
      if (!db) return;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(THUMB_STORE, "readwrite");
          tx.objectStore(THUMB_STORE).delete(key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch (_e) {
          resolve();
        }
      });
    });
  }
  function idbReadAll() {
    return openThumbDB().then((db) => {
      if (!db) return {};
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(THUMB_STORE, "readonly");
          const store = tx.objectStore(THUMB_STORE);
          const out = {};
          const req = store.openCursor();
          req.onsuccess = (e) => {
            const c = e.target.result;
            if (c) {
              out[c.key] = c.value;
              c.continue();
            } else
              resolve(out);
          };
          req.onerror = () => resolve(out);
        } catch (_e) {
          resolve({});
        }
      });
    });
  }

  // app/src/main/assets/src/data/translations.js
  var _translationPromises = {};
  var _translationLoaded = {};
  var _bibleStudiesPromise = null;
  function loadTranslation2(code) {
    if (!code || code === "nkjv") return Promise.resolve();
    const globalName = "BIBLE_" + code.toUpperCase();
    if (window[globalName]) {
      _translationLoaded[code] = true;
      return Promise.resolve();
    }
    if (_translationPromises[code]) return _translationPromises[code];
    _translationPromises[code] = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "src/data/bible-" + code + ".js";
      script.async = true;
      script.onload = () => {
        _translationLoaded[code] = true;
        resolve();
      };
      script.onerror = () => {
        resolve();
      };
      document.head.appendChild(script);
    });
    return _translationPromises[code];
  }
  function loadBibleStudies2() {
    if (typeof BIBLE_STUDIES !== "undefined") return Promise.resolve();
    if (_bibleStudiesPromise) return _bibleStudiesPromise;
    _bibleStudiesPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "src/data/bible-studies.js";
      script.async = true;
      script.onload = () => {
        resolve();
      };
      script.onerror = () => {
        resolve();
      };
      document.head.appendChild(script);
    });
    return _bibleStudiesPromise;
  }
  function translateVerse2(bookId, chNum, verse, translation) {
    if (!translation || translation === "nkjv") return verse.text;
    const data = window["BIBLE_" + translation.toUpperCase()];
    if (!data) return verse.text;
    const verses = data[bookId] && data[bookId][chNum];
    if (!verses) return verse.text;
    for (let i = 0; i < verses.length; i++) {
      if (verses[i].n === verse.n) return verses[i].text;
    }
    return verse.text;
  }

  // app/src/main/assets/src/ui/components/Segments.jsx
  function Segments2({ segments, activeFn, onFnClick, onScripClick, onLetterClick, onInAppLink, studyMode: _studyMode, footnotes: _footnotes, highlightText }) {
    return segments.map((seg, i) => {
      if (seg.t === "fn") {
        return /* @__PURE__ */ React.createElement(
          "span",
          {
            key: i,
            className: `fn-ref${activeFn === seg.v ? " active" : ""}`,
            "data-fn-num": seg.v,
            onClick: () => onFnClick(seg.v),
            title: `Footnote ${seg.v}`
          },
          seg.v
        );
      }
      if (seg.t === "letter-link") {
        if (seg.link && onInAppLink) {
          return /* @__PURE__ */ React.createElement("span", { key: i, className: "letter-link-ref", onClick: () => onInAppLink(seg.link) }, seg.label);
        }
        return /* @__PURE__ */ React.createElement("span", { key: i, className: "letter-link-ref", onClick: () => onLetterClick && onLetterClick(seg.letterId, seg.screen) }, seg.label);
      }
      if (seg.t === "stanza-break") return /* @__PURE__ */ React.createElement("div", { key: i, className: "stanza-break" });
      const prevV = i > 0 ? segments[i - 1].v || "" : "";
      const v = seg.v && /^[\w([{"\u201c\u2018]/.test(seg.v) && /\S$/.test(prevV) ? " " + seg.v : seg.v || "";
      if (seg.t === "bold-italic") return /* @__PURE__ */ React.createElement(React.Fragment, { key: i }, renderTextWithScripRefs(v, "bold-italic", onScripClick, highlightText));
      if (seg.t === "italic") return /* @__PURE__ */ React.createElement(React.Fragment, { key: i }, renderTextWithScripRefs(v, "italic-text", onScripClick, highlightText));
      if (seg.t === "caps") return /* @__PURE__ */ React.createElement("span", { key: i, style: { fontWeight: 600, letterSpacing: "0.03em" } }, v);
      return /* @__PURE__ */ React.createElement(React.Fragment, { key: i }, renderTextWithScripRefs(v, null, onScripClick, highlightText));
    });
  }

  // app/src/main/assets/src/ui/components/ProphecyCard.jsx
  function ProphecyCard2({ type, tag, label, blocks, fnProps, stateKey, statesRef, onSaveStates, expandSignal }) {
    const stored = statesRef && statesRef.current[stateKey];
    const [expanded, setExpandedRaw] = React.useState(stored !== void 0 ? stored : true);
    const setExpanded = (val) => {
      setExpandedRaw((prev) => {
        const next = typeof val === "function" ? val(prev) : val;
        if (statesRef) {
          statesRef.current[stateKey] = next;
          onSaveStates && onSaveStates();
        }
        return next;
      });
    };
    React.useEffect(() => {
      if (expandSignal !== void 0 && expandSignal !== null && expandSignal !== 0) {
        const newVal = expandSignal > 0;
        setExpandedRaw(newVal);
        if (statesRef) statesRef.current[stateKey] = newVal;
      }
    }, [expandSignal]);
    const cls = `prophecy-card pc-${type}`;
    const cardFnProps = fnProps;
    return /* @__PURE__ */ React.createElement("div", { className: cls }, /* @__PURE__ */ React.createElement("div", { className: "prophecy-card-header", onClick: () => setExpanded((e) => !e) }, /* @__PURE__ */ React.createElement("span", { className: "prophecy-card-tag" }, tag), /* @__PURE__ */ React.createElement("span", { className: `prophecy-card-chevron${expanded ? "" : " collapsed"}` }, "\u25BC")), /* @__PURE__ */ React.createElement("div", { className: `prophecy-card-body${expanded ? "" : " collapsed"}` }, label && /* @__PURE__ */ React.createElement("div", { className: "prophecy-card-sublabel" }, label), blocks.map((block, bi) => {
      if (block.type === "para") return /* @__PURE__ */ React.createElement("p", { key: bi, className: "letter-para" }, /* @__PURE__ */ React.createElement(Segments, { ..._extends({ segments: block.segments }, cardFnProps) }));
      if (block.type === "poetry") return /* @__PURE__ */ React.createElement("div", { key: bi, className: "letter-poetry" }, block.lines.map((line, li) => /* @__PURE__ */ React.createElement("div", { key: li, className: "poetry-line" }, /* @__PURE__ */ React.createElement(Segments, { ..._extends({ segments: line }, fnProps) }))));
      if (block.type === "heading") return /* @__PURE__ */ React.createElement("h2", { key: bi, className: `study-heading study-heading-l${block.level || 3}` }, block.text);
      return null;
    })));
  }

  // app/src/main/assets/src/ui/components/ProphecyGroup.jsx
  function ProphecyGroup2({ block, fnProps, expandSignal, groupKey, statesRef, onSaveStates }) {
    return /* @__PURE__ */ React.createElement("div", { className: "prophecy-group" }, block.label && /* @__PURE__ */ React.createElement("div", { className: "prophecy-group-label" }, block.label), block.intro && block.intro.length > 0 && /* @__PURE__ */ React.createElement(ProphecyCard, { type: "intro", tag: "Introduction", blocks: block.intro, fnProps, expandSignal, stateKey: groupKey + ":intro", statesRef, onSaveStates }), block.ot && block.ot.blocks && block.ot.blocks.length > 0 && /* @__PURE__ */ React.createElement(ProphecyCard, { type: "ot", tag: "Old Testament Prophecy", label: block.ot.label, blocks: block.ot.blocks, fnProps, expandSignal, stateKey: groupKey + ":ot", statesRef, onSaveStates }), block.nt && block.nt.blocks && block.nt.blocks.length > 0 && /* @__PURE__ */ React.createElement(ProphecyCard, { type: "nt", tag: "Fulfilled in the New Testament", label: block.nt.label, blocks: block.nt.blocks, fnProps, expandSignal, stateKey: groupKey + ":nt", statesRef, onSaveStates }), block.vot && block.vot.blocks && block.vot.blocks.length > 0 && /* @__PURE__ */ React.createElement(ProphecyCard, { type: "vot", tag: "Fulfillment in the Volumes of Truth", label: block.vot.label, blocks: block.vot.blocks, fnProps, expandSignal, stateKey: groupKey + ":vot", statesRef, onSaveStates }));
  }

  // app/src/main/assets/src/ui/components/VerseWithNumbers.jsx
  function VerseWithNumbers2({ text, refStr }) {
    const segments = splitIntoVerses(text, refStr);
    if (!segments) {
      const cleaned = (text || "").replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, "");
      return /* @__PURE__ */ React.createElement("span", null, cleaned);
    }
    return /* @__PURE__ */ React.createElement("span", null, segments.map((seg, i) => /* @__PURE__ */ React.createElement("span", { key: i }, /* @__PURE__ */ React.createElement("sup", { className: "verse-sup" }, seg.vNum), seg.text.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, ""), i < segments.length - 1 ? " " : "")));
  }
  function _fnTextRedundantWithLink2(text, link) {
    if (!text || !link || !link.letterTitle) return false;
    const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "");
    const payload = String(text).replace(/^\s*(see also|also see|also read|see)\s*:?\s*/i, "").trim().replace(/^["“‘']+/, "").replace(/["”’'.\s]+$/, "");
    return norm(payload) === norm(link.letterTitle);
  }

  // app/src/main/assets/src/ui/components/InAppLinkButton.jsx
  function InAppLinkButton2({ link, onActivate, compact, label }) {
    if (!link || !onActivate) return null;
    const title = link.letterTitle || label || "Open in App";
    if (compact) {
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "footnote-list-link-btn fn-list-rich",
          onClick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            onActivate(link);
          }
        },
        /* @__PURE__ */ React.createElement("span", { className: "fn-list-rich-body" }, /* @__PURE__ */ React.createElement("span", { className: "fn-list-rich-eyebrow" }, "Open in App"), /* @__PURE__ */ React.createElement("span", { className: "fn-list-rich-title" }, title)),
        /* @__PURE__ */ React.createElement("span", { className: "chev" }, "\u203A")
      );
    }
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "fn-sheet-link-btn",
        onClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          onActivate(link);
        }
      },
      /* @__PURE__ */ React.createElement("span", { className: "fn-sheet-link-body" }, /* @__PURE__ */ React.createElement("span", { className: "fn-sheet-link-eyebrow" }, "Open in App"), /* @__PURE__ */ React.createElement("span", { className: "fn-sheet-link-title" }, title)),
      /* @__PURE__ */ React.createElement("span", { className: "fn-sheet-link-chevron" }, "\u203A")
    );
  }

  // app/src/main/assets/src/ui/components/FootnoteSheet.jsx
  function FootnoteSheet2({ num, fn, nkjv, footnotes, onClose, onInAppLink, onNavigate }) {
    const isOpen = num !== null;
    const verse = fn?.type === "scripture" ? nkjv?.[fn.ref] || null : null;
    const orderedKeys = footnotes ? Object.keys(footnotes).sort((a, b) => {
      const na = parseInt(a, 10), nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    }) : [];
    const curIdx = num != null ? orderedKeys.indexOf(String(num)) : -1;
    const prevKey = curIdx > 0 ? orderedKeys[curIdx - 1] : null;
    const nextKey = curIdx >= 0 && curIdx < orderedKeys.length - 1 ? orderedKeys[curIdx + 1] : null;
    const total = orderedKeys.length;
    const showNav = total > 1 && onNavigate && curIdx !== -1;
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: `fn-sheet-backdrop${isOpen ? " open" : ""}`, onClick: onClose }), /* @__PURE__ */ React.createElement("div", { className: `fn-sheet${isOpen ? " open" : ""}` }, /* @__PURE__ */ React.createElement("div", { className: "fn-sheet-handle" }), fn && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "fn-sheet-num-row" }, /* @__PURE__ */ React.createElement("div", { className: "fn-sheet-num" }, "Footnote ", num, showNav && /* @__PURE__ */ React.createElement("span", { className: "fn-sheet-num-of" }, " of ", total)), showNav && /* @__PURE__ */ React.createElement("div", { className: "fn-sheet-nav" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "fn-sheet-nav-btn",
        onClick: () => prevKey != null && onNavigate(prevKey),
        disabled: prevKey == null,
        "aria-label": "Previous footnote",
        title: "Previous footnote"
      },
      "\u2039"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "fn-sheet-nav-btn",
        onClick: () => nextKey != null && onNavigate(nextKey),
        disabled: nextKey == null,
        "aria-label": "Next footnote",
        title: "Next footnote"
      },
      "\u203A"
    ))), fn.type === "scripture" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { className: "fn-sheet-ref" }, fn.ref), verse ? /* @__PURE__ */ React.createElement("div", { className: "fn-sheet-verse" }, /* @__PURE__ */ React.createElement(ScriptureVerseText, { text: verse, cite: fn.ref })) : /* @__PURE__ */ React.createElement("div", { className: "fn-sheet-verse-missing" }, "Verse text isn\u2019t available for this reference. The footnote points to ", /* @__PURE__ */ React.createElement("strong", null, fn.ref), ", but no matching entry was found in this letter\u2019s scripture dictionary."), fn.seeAlso && /* @__PURE__ */ React.createElement("div", { className: "fn-sheet-see-also" }, /* @__PURE__ */ React.createElement("span", { className: "fn-sheet-see-also-label" }, "Also see"), /* @__PURE__ */ React.createElement(
      InAppLinkButton,
      {
        link: { collection: fn.seeAlso.collection, letterTitle: fn.seeAlso.letterTitle, excerpt: fn.seeAlso.excerpt },
        onActivate: onInAppLink,
        label: fn.seeAlso.label || fn.seeAlso.letterTitle
      }
    ))) : /* @__PURE__ */ React.createElement(React.Fragment, null, fn.text && !(fn.link && _fnTextRedundantWithLink(fn.text, fn.link)) && /* @__PURE__ */ React.createElement("div", { className: "fn-sheet-note" }, fn.text), fn.link && /* @__PURE__ */ React.createElement(InAppLinkButton, { link: fn.link, onActivate: onInAppLink }), fn.url && /* @__PURE__ */ React.createElement("div", { className: fn.link || fn.text ? "fn-sheet-url-extra" : "fn-sheet-note" }, /* @__PURE__ */ React.createElement("a", { href: fn.url, target: "_blank", rel: "noopener noreferrer", className: "fn-link" }, fn.link || fn.text ? "Open external link" : fn.url)), !fn.text && !fn.link && !fn.url && /* @__PURE__ */ React.createElement("div", { className: "fn-sheet-verse-missing" }, "This footnote has no content attached.")))));
  }

  // app/src/main/assets/src/ui/components/ScriptureVerseText.jsx
  function ScriptureVerseText2({ text, cite }) {
    const parts = text.split(" | ");
    if (parts.length > 1) {
      const normalizedCite = (cite || "").trim();
      return /* @__PURE__ */ React.createElement("div", { className: "sc-sheet-compound" }, parts.map((part, i) => {
        const dashIdx = part.indexOf(" \u2014 ");
        if (dashIdx !== -1) {
          const label = part.slice(0, dashIdx).trim();
          const verse = part.slice(dashIdx + 3);
          const showLabel = label && label !== normalizedCite;
          return /* @__PURE__ */ React.createElement("div", { key: i, className: "sc-sheet-compound-part" }, showLabel && /* @__PURE__ */ React.createElement("span", { className: "sc-sheet-compound-label" }, label), /* @__PURE__ */ React.createElement(VerseWithNumbers, { text: verse, refStr: label || cite }));
        }
        return /* @__PURE__ */ React.createElement("div", { key: i, className: "sc-sheet-compound-part" }, /* @__PURE__ */ React.createElement(VerseWithNumbers, { text: part, refStr: cite }));
      }));
    }
    return /* @__PURE__ */ React.createElement(VerseWithNumbers, { text, refStr: cite });
  }

  // app/src/main/assets/src/ui/components/ScriptureSheet.jsx
  function ScriptureSheet2({ activeRef, onClose }) {
    const isOpen = activeRef !== null;
    const verseText = activeRef ? MATTHEW_NKJV[activeRef.cite] : null;
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: `fn-sheet-backdrop${isOpen ? " open" : ""}`, onClick: onClose }), /* @__PURE__ */ React.createElement("div", { className: `fn-sheet${isOpen ? " open" : ""}` }, /* @__PURE__ */ React.createElement("div", { className: "fn-sheet-handle" }), activeRef && verseText && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { className: "sc-sheet-tag" }, "Scripture Reference \xB7 ", activeRef.ref), /* @__PURE__ */ React.createElement("span", { className: "sc-sheet-cite" }, activeRef.cite), /* @__PURE__ */ React.createElement("div", { className: "sc-sheet-verse" }, /* @__PURE__ */ React.createElement(ScriptureVerseText, { text: verseText, cite: activeRef.cite })))));
  }

  // app/src/main/assets/src/ui/components/ExpandableVerse.jsx
  var EXPAND_THRESHOLD = 130;
  var MIN_HIDDEN_WORDS = 20;
  function ExpandableVerse2({ text, refStr }) {
    const [expanded, setExpanded] = React.useState(false);
    let previewText = text;
    let previewRef = refStr;
    if (text.includes(" | ")) {
      const firstPart = text.split(" | ")[0];
      const dashIdx = firstPart.indexOf(" \u2014 ");
      if (dashIdx !== -1) {
        previewRef = firstPart.slice(0, dashIdx).trim();
        previewText = firstPart.slice(dashIdx + 3);
      } else {
        previewText = firstPart;
      }
    }
    const hiddenPortion = previewText.slice(EXPAND_THRESHOLD).trim();
    const hiddenWords = hiddenPortion.split(/\s+/).filter(Boolean).length;
    const isLong = text.length > EXPAND_THRESHOLD && hiddenWords >= MIN_HIDDEN_WORDS;
    const fullContent = /* @__PURE__ */ React.createElement(ScriptureVerseText, { text, cite: refStr });
    const truncatedContent = /* @__PURE__ */ React.createElement(VerseWithNumbers, { text: previewText.slice(0, EXPAND_THRESHOLD).trimEnd() + "\u2026", refStr: previewRef });
    return /* @__PURE__ */ React.createElement("span", { className: "footnote-list-verse" }, isLong && !expanded ? truncatedContent : fullContent, isLong && /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          setExpanded((v) => !v);
        },
        style: {
          display: "inline-block",
          marginLeft: "0.5em",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--gold)",
          fontFamily: "'Cinzel', serif",
          fontSize: "0.72rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          padding: "0",
          verticalAlign: "middle",
          lineHeight: 1
        }
      },
      expanded ? "Show less \u25B2" : "Read more \u25BC"
    ));
  }

  // app/src/main/assets/src/ui/components/ThemeBtn.jsx
  function ThemeBtn2({ theme, onThemeChange }) {
    const next = theme === "dark" ? "light" : "dark";
    const title = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
    return /* @__PURE__ */ React.createElement("button", { className: "nav-theme-btn", onClick: () => onThemeChange(next), title }, theme === "dark" ? /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "5" }), /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "1", x2: "12", y2: "3" }), /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "21", x2: "12", y2: "23" }), /* @__PURE__ */ React.createElement("line", { x1: "4.22", y1: "4.22", x2: "5.64", y2: "5.64" }), /* @__PURE__ */ React.createElement("line", { x1: "18.36", y1: "18.36", x2: "19.78", y2: "19.78" }), /* @__PURE__ */ React.createElement("line", { x1: "1", y1: "12", x2: "3", y2: "12" }), /* @__PURE__ */ React.createElement("line", { x1: "21", y1: "12", x2: "23", y2: "12" }), /* @__PURE__ */ React.createElement("line", { x1: "4.22", y1: "19.78", x2: "5.64", y2: "18.36" }), /* @__PURE__ */ React.createElement("line", { x1: "18.36", y1: "5.64", x2: "19.78", y2: "4.22" })) : /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8" }, /* @__PURE__ */ React.createElement("path", { d: "M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" })));
  }

  // app/src/main/assets/src/ui/components/ScreenLayout.jsx
  function ScreenLayout2({ navChildren, children, showProgress, hideTabsBtn }) {
    const ref = React.useCallback((el) => {
      __scrollEl = el;
    }, []);
    React.useEffect(() => {
      if (!showProgress) return;
      const onScroll = () => {
        if (!__scrollEl) return;
        const { scrollTop, scrollHeight, clientHeight } = __scrollEl;
        const sentinel = __scrollEl.querySelector(".reading-end");
        let max;
        if (sentinel) {
          const containerTop = __scrollEl.getBoundingClientRect().top;
          const sentinelTop = sentinel.getBoundingClientRect().top;
          const sentinelOffset = sentinelTop - containerTop + scrollTop;
          max = Math.max(sentinelOffset - clientHeight, 1);
        } else {
          max = Math.max(scrollHeight - clientHeight, 1);
        }
        const pct = Math.min(scrollTop / max, 1);
        if (pct >= 0.9 && window.__onReadingComplete) window.__onReadingComplete();
      };
      let el = null;
      const attach = () => {
        if (__scrollEl !== el) {
          if (el) el.removeEventListener("scroll", onScroll);
          el = __scrollEl;
          if (el) el.addEventListener("scroll", onScroll, { passive: true });
        }
      };
      attach();
      const poll = setInterval(attach, 300);
      return () => {
        clearInterval(poll);
        if (el) el.removeEventListener("scroll", onScroll);
      };
    }, [showProgress]);
    return /* @__PURE__ */ React.createElement("div", { className: "screen-layout" }, /* @__PURE__ */ React.createElement("nav", { className: "top-nav" }, navChildren, hideTabsBtn ? null : /* @__PURE__ */ React.createElement(TabsNavBtn, null)), /* @__PURE__ */ React.createElement("div", { className: "screen-scroll", ref }, children));
  }

  // app/src/main/assets/src/ui/components/ModeToggle.jsx
  function ModeToggle2({ mode, onChange, showStudy, onShowStudyChange }) {
    if (!showStudy) {
      return /* @__PURE__ */ React.createElement("div", { className: "mode-toggle-wrap" }, /* @__PURE__ */ React.createElement("div", { className: "mode-toggle" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "mode-btn active",
          onClick: () => onShowStudyChange(true),
          title: "Show study notes, references, and further reading"
        },
        /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "9" }), /* @__PURE__ */ React.createElement("path", { d: "M9 12l2 2 4-4" })),
        "On"
      )));
    }
    const isPdf = mode === "pdf";
    return /* @__PURE__ */ React.createElement("div", { className: "mode-toggle-wrap" }, /* @__PURE__ */ React.createElement("div", { className: "mode-toggle" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "mode-btn active",
        onClick: () => onChange(isPdf ? "inline" : "pdf"),
        title: isPdf ? "PDF Mode \u2014 tap to switch to Inline" : "Inline Mode \u2014 tap to switch to PDF"
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8" }, isPdf ? /* @__PURE__ */ React.createElement("path", { d: "M2 6h20M2 12h20M2 18h12" }) : /* @__PURE__ */ React.createElement("path", { d: "M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" })),
      isPdf ? "PDF" : "Inline"
    ), /* @__PURE__ */ React.createElement("div", { className: "mode-divider" }), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "mode-btn",
        onClick: () => onShowStudyChange(false),
        title: "Hide study notes, references, and further reading"
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "9" }), /* @__PURE__ */ React.createElement("line", { x1: "4.5", y1: "4.5", x2: "19.5", y2: "19.5" })),
      "Off"
    )));
  }
  function renderCommentaryCite2(text) {
    if (!text) return text;
    const rx = /\b((?:[123]\s)?[A-Z][a-z]+(?:\s+[A-Za-z]+)*\s+\d+:\d+(?:[-,\s\d]+)?)\b/g;
    const parts = [];
    let last = 0, m;
    while ((m = rx.exec(text)) !== null) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      parts.push(/* @__PURE__ */ React.createElement("span", { key: m.index, className: "inline-scrip-ref" }, m[0]));
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts.length ? parts : text;
  }

  // app/src/main/assets/src/ui/components/InlineNotes.jsx
  function InlineNotes2({ scriptures, votNotes, onScriptureClick, onVotLetterClick }) {
    if (!scriptures.length && !votNotes.length) return null;
    return /* @__PURE__ */ React.createElement("div", { className: "inline-notes" }, scriptures.map((s, i) => {
      const hasVerse = !!MATTHEW_NKJV[s.cite];
      return hasVerse ? /* @__PURE__ */ React.createElement("button", { key: `s${i}`, className: "inline-note-scripture", onClick: () => onScriptureClick && onScriptureClick(s) }, /* @__PURE__ */ React.createElement("span", { className: "inline-note-tag" }, s.ref), /* @__PURE__ */ React.createElement("span", { className: "inline-note-cite" }, s.cite), /* @__PURE__ */ React.createElement("span", { className: "inline-note-chevron" }, "\u203A")) : /* @__PURE__ */ React.createElement("div", { key: `s${i}`, className: "inline-note-scripture inline-note-plain" }, /* @__PURE__ */ React.createElement("span", { className: "inline-note-tag" }, s.ref), /* @__PURE__ */ React.createElement("span", { className: "inline-note-cite" }, renderCommentaryCite(s.cite)));
    }), votNotes.map((n, i) => {
      const canTap = onVotLetterClick && !!resolveVotLetter(n.vol, n.letter);
      const hm = isHiddenManna(n);
      const badge = hm ? /* @__PURE__ */ React.createElement("span", { className: "inline-vot-hm", title: "Hidden Manna \u2014 The Word of The Lord Spoken to Timothy" }, "HM") : canTap ? /* @__PURE__ */ React.createElement("span", { className: "inline-vot-chevron" }, "\u203A") : null;
      const inner = /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "inline-vot-header" }, /* @__PURE__ */ React.createElement("span", { className: "inline-vot-ref" }, n.ref), /* @__PURE__ */ React.createElement("span", { className: "inline-vot-vol" }, n.vol), badge), /* @__PURE__ */ React.createElement("div", { className: "inline-vot-letter" }, '"', n.letter, '"'), n.excerpt && /* @__PURE__ */ React.createElement("div", { className: "inline-vot-excerpt" }, n.excerpt));
      return canTap ? /* @__PURE__ */ React.createElement(
        "button",
        {
          key: `v${i}`,
          className: "inline-vot-note inline-vot-note-tappable",
          onClick: () => onVotLetterClick(n.vol, n.letter, n.excerpt)
        },
        inner
      ) : /* @__PURE__ */ React.createElement("div", { key: `v${i}`, className: "inline-vot-note" }, inner);
    }));
  }

  // app/src/main/assets/src/ui/components/InlineEcho.jsx
  function InlineEcho2({ scriptures, votNotes }) {
    if (!scriptures.length && !votNotes.length) return null;
    const scrollToRef = (ref) => {
      const ranges = parseRefRanges(ref);
      if (ranges.length > 0) {
        const target = document.getElementById(`v-${ranges[0].end}`);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };
    return /* @__PURE__ */ React.createElement("div", { className: "inline-echo" }, scriptures.map((s, i) => /* @__PURE__ */ React.createElement("button", { key: `es${i}`, className: "inline-echo-pill", onClick: () => scrollToRef(s.ref), title: `See note at ${s.ref}` }, /* @__PURE__ */ React.createElement("span", { className: "echo-arrow" }, "\u2191"), /* @__PURE__ */ React.createElement("span", null, s.ref))), votNotes.map((n, i) => /* @__PURE__ */ React.createElement("button", { key: `ev${i}`, className: "inline-echo-pill", onClick: () => scrollToRef(n.ref), title: `See note at ${n.ref}` }, /* @__PURE__ */ React.createElement("span", { className: "echo-arrow" }, "\u2191"), /* @__PURE__ */ React.createElement("span", null, n.ref, " \u2014 ", n.vol))));
  }

  // app/src/main/assets/src/ui/components/StudyPanels.jsx
  function StudyPanels2({ scriptures, votNotes, onScriptureClick, onVotLetterClick }) {
    const hasScriptures = scriptures && scriptures.length > 0;
    const hasVot = votNotes && votNotes.length > 0;
    if (!hasScriptures && !hasVot) return null;
    return /* @__PURE__ */ React.createElement("div", { className: "study-panels" }, hasScriptures && /* @__PURE__ */ React.createElement("div", { className: "study-panel-group" }, /* @__PURE__ */ React.createElement("div", { className: "study-panel-group-title" }, "Scripture References"), /* @__PURE__ */ React.createElement("div", { className: "scripture-refs" }, scriptures.map((s, i) => {
      const hasVerse = !!MATTHEW_NKJV[s.cite];
      return hasVerse ? /* @__PURE__ */ React.createElement("button", { key: i, className: "scripture-ref", onClick: () => onScriptureClick && onScriptureClick(s) }, /* @__PURE__ */ React.createElement("span", { className: "scripture-ref-tag" }, s.ref), /* @__PURE__ */ React.createElement("span", { className: "scripture-ref-text" }, s.cite), /* @__PURE__ */ React.createElement("span", { className: "scripture-ref-chevron" }, "\u203A")) : /* @__PURE__ */ React.createElement("div", { key: i, className: "scripture-ref scripture-ref-note" }, /* @__PURE__ */ React.createElement("span", { className: "scripture-ref-tag" }, s.ref), /* @__PURE__ */ React.createElement("span", { className: "scripture-ref-text" }, renderCommentaryCite(s.cite)));
    }))), hasVot && /* @__PURE__ */ React.createElement("div", { className: "study-panel-group" }, /* @__PURE__ */ React.createElement("div", { className: "study-panel-group-title" }, "Volumes of Truth Notes"), /* @__PURE__ */ React.createElement("div", { className: "vot-notes" }, votNotes.map((n, i) => {
      const canTap = onVotLetterClick && !!resolveVotLetter(n.vol, n.letter);
      const hm = isHiddenManna(n);
      const badge = hm ? /* @__PURE__ */ React.createElement("span", { className: "vot-note-hm", title: "Hidden Manna \u2014 The Word of The Lord Spoken to Timothy" }, "HM") : canTap ? /* @__PURE__ */ React.createElement("span", { className: "vot-note-chevron" }, "\u203A") : null;
      const inner = /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "vot-note-header" }, /* @__PURE__ */ React.createElement("span", { className: "vot-note-ref" }, n.ref), /* @__PURE__ */ React.createElement("span", { className: "vot-note-vol" }, n.vol), badge), /* @__PURE__ */ React.createElement("div", { className: "vot-note-letter" }, "\u201C", n.letter, "\u201D"), n.excerpt && /* @__PURE__ */ React.createElement("div", { className: "vot-note-excerpt" }, n.excerpt));
      return canTap ? /* @__PURE__ */ React.createElement("button", { key: i, className: "vot-note vot-note-tappable", onClick: () => onVotLetterClick(n.vol, n.letter, n.excerpt) }, inner) : /* @__PURE__ */ React.createElement("div", { key: i, className: "vot-note" }, inner);
    }))));
  }

  // app/src/main/assets/src/ui/components/ChapterBookmarkBtn.jsx
  function ChapterBookmarkBtn2({ chapterBookmark, hlTick }) {
    const hlKey = chapterBookmark && chapterBookmark.hlKey;
    const existing = React.useMemo(
      () => hlKey && typeof BookmarkStore !== "undefined" ? BookmarkStore.getForKey(hlKey) : [],
      // eslint-disable-next-line react-hooks/exhaustive-deps -- cache-bust signal: hlTick bumps on store mutation, forces memo recompute (ARCHITECTURE.md §"Annotation rendering")
      [hlKey, hlTick]
    );
    if (!hlKey || typeof BookmarkStore === "undefined") return null;
    const isBookmarked = existing.length > 0;
    const onClick = (e) => {
      e.stopPropagation();
      if (isBookmarked) {
        const rect = e.currentTarget.getBoundingClientRect();
        const ids = existing.map((b) => b.id);
        if (window.__openBookmarkPopover) {
          window.__openBookmarkPopover(ids, rect.left + rect.width / 2, rect.bottom + 4, chapterBookmark.hlKey);
        }
        return;
      }
      if (window.__bookmarkCreate) {
        window.__bookmarkCreate({
          hlKey: chapterBookmark.hlKey,
          sourceLabel: chapterBookmark.label || "",
          excerpt: "",
          defaultLabel: chapterBookmark.label || "Chapter bookmark"
        });
      } else {
        BookmarkStore.add({
          id: typeof bkmId === "function" ? bkmId() : "bkm_" + Date.now(),
          hlKey: chapterBookmark.hlKey,
          label: chapterBookmark.label || "Chapter bookmark",
          thought: "",
          created: Date.now(),
          updated: Date.now()
        });
        if (window.__bumpHlTick) window.__bumpHlTick();
      }
    };
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "nav-bookmark-btn" + (isBookmarked ? " nav-bookmark-btn-active" : ""),
        onClick,
        title: isBookmarked ? "Open bookmark options" : "Bookmark this chapter",
        "aria-label": isBookmarked ? "Open bookmark options" : "Bookmark this chapter"
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z", fill: isBookmarked ? "currentColor" : "none" }))
    );
  }

  // app/src/main/assets/src/ui/components/NavButtons.jsx
  function NavButtons2({ onSettings, onHistory, onSearch, theme, onThemeChange, reading, chapterBookmark, hlTick, journalRefKey: _journalRefKey, journalRefLabel: _journalRefLabel }) {
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "settings-gear-btn", onClick: onSettings, title: "Settings" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "3" }), /* @__PURE__ */ React.createElement("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" }))), /* @__PURE__ */ React.createElement("button", { className: reading ? "nav-search-btn nav-history-reading" : "nav-search-btn", onClick: onHistory, title: "History" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6" }, /* @__PURE__ */ React.createElement("polyline", { points: "1 4 1 10 7 10" }), /* @__PURE__ */ React.createElement("path", { d: "M3.51 15a9 9 0 1 0 .49-5.01" }))), /* @__PURE__ */ React.createElement("button", { className: "nav-search-btn", onClick: onSearch, title: "Search" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6" }, /* @__PURE__ */ React.createElement("circle", { cx: "11", cy: "11", r: "8" }), /* @__PURE__ */ React.createElement("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" }))), chapterBookmark && /* @__PURE__ */ React.createElement(ChapterBookmarkBtn, { chapterBookmark, hlTick }), /* @__PURE__ */ React.createElement(ThemeBtn, { theme, onThemeChange }));
  }

  // app/src/main/assets/src/ui/components/ProphecyExpandToggle.jsx
  function ProphecyExpandToggle2({ allExpanded, onToggle }) {
    return /* @__PURE__ */ React.createElement("div", { className: "mode-toggle-wrap" }, /* @__PURE__ */ React.createElement("div", { className: "mode-toggle" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "mode-btn active",
        onClick: () => onToggle(!allExpanded),
        title: allExpanded ? "Collapse all cards" : "Expand all cards"
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8" }, allExpanded ? /* @__PURE__ */ React.createElement("polyline", { points: "6 15 12 9 18 15" }) : /* @__PURE__ */ React.createElement("polyline", { points: "6 9 12 15 18 9" })),
      allExpanded ? "Collapse" : "Expand"
    )));
  }

  // app/src/main/assets/src/ui/components/HomeBtn.jsx
  function HomeBtn2() {
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "nav-search-btn",
        onClick: () => window.__goHome && window.__goHome(),
        title: "Home",
        "aria-label": "Home"
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M3 10.5L12 3l9 7.5" }), /* @__PURE__ */ React.createElement("path", { d: "M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" }))
    );
  }

  // app/src/main/assets/src/ui/components/TabsNavBtn.jsx
  function TabsNavBtn2() {
    const ctx = React.useContext(TabsContext);
    if (!ctx || !ctx.enabled) return null;
    const { count, onOpen, isOnTabsScreen } = ctx;
    const label = count > 99 ? "99+" : String(count);
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        className: `tabs-nav-btn${isOnTabsScreen ? " active" : ""}`,
        onClick: onOpen,
        title: `${count} tab${count === 1 ? "" : "s"} open`,
        "aria-label": `Open tabs (${count} open)`
      },
      /* @__PURE__ */ React.createElement("span", { className: "tabs-nav-btn-glyph" }, "\u25A2"),
      /* @__PURE__ */ React.createElement("span", { className: "tabs-nav-btn-count" }, label)
    );
  }

  // app/src/main/assets/src/ui/components/LibraryNav.jsx
  function LibraryNav2(opts) {
    opts = opts || {};
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "nav-home nav-back-icon",
        onClick: opts.onBack,
        title: opts.backTitle || "Back",
        "aria-label": opts.backTitle || "Back"
      },
      "\u2039"
    ), /* @__PURE__ */ React.createElement(HomeBtn, null), opts.leftExtras || null, /* @__PURE__ */ React.createElement(
      NavButtons,
      {
        onSettings: opts.onSettings,
        onHistory: opts.onHistory,
        onSearch: opts.onSearch,
        theme: opts.theme,
        onThemeChange: opts.onThemeChange
      }
    ), opts.rightExtras || null);
  }

  // app/src/main/assets/src/ui/components/FootnoteListSection.jsx
  function FootnoteListSection2({ footnotes, nkjv, highlightedFn, onInAppLink }) {
    const entries = Object.entries(footnotes);
    if (entries.length === 0) return null;
    const scrollToBubble = (num) => {
      try {
        const el = document.querySelector(`.fn-ref[data-fn-num="${num}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch (_e) {
      }
    };
    return /* @__PURE__ */ React.createElement("div", { className: "footnote-list" }, /* @__PURE__ */ React.createElement("div", { className: "footnote-list-header" }, "Footnotes"), entries.map(([num, fn]) => /* @__PURE__ */ React.createElement(
      "div",
      {
        key: num,
        id: `fn-item-${num}`,
        className: `footnote-list-item${highlightedFn === num ? " pulse" : ""}`,
        role: "button",
        tabIndex: 0,
        onClick: () => scrollToBubble(num),
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            scrollToBubble(num);
          }
        },
        title: `Jump back to footnote ${num} in the body`
      },
      /* @__PURE__ */ React.createElement("div", { className: "footnote-list-num" }, num, "."),
      /* @__PURE__ */ React.createElement("div", null, fn.type === "scripture" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { className: "footnote-list-ref" }, fn.ref), nkjv[fn.ref] ? /* @__PURE__ */ React.createElement(ExpandableVerse, { text: nkjv[fn.ref], refStr: fn.ref }) : /* @__PURE__ */ React.createElement("span", { className: "footnote-list-missing" }, " \u2014 verse text not available"), fn.seeAlso && /* @__PURE__ */ React.createElement("div", { style: { marginTop: "0.5rem" } }, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'Cinzel',serif", fontSize: "0.6rem", letterSpacing: "0.18em", color: "var(--gold-dim)", textTransform: "uppercase", marginRight: "0.4rem" } }, "Also see:"), /* @__PURE__ */ React.createElement("span", { style: { fontStyle: "italic" } }, fn.seeAlso.label || fn.seeAlso.letterTitle), /* @__PURE__ */ React.createElement(InAppLinkButton, { compact: true, link: { collection: fn.seeAlso.collection, letterTitle: fn.seeAlso.letterTitle, excerpt: fn.seeAlso.excerpt }, onActivate: onInAppLink }))) : /* @__PURE__ */ React.createElement(React.Fragment, null, fn.text && !(fn.link && _fnTextRedundantWithLink(fn.text, fn.link)) && /* @__PURE__ */ React.createElement("span", { className: "footnote-list-note-text" }, fn.text, fn.link && " "), fn.link && /* @__PURE__ */ React.createElement(InAppLinkButton, { compact: true, link: fn.link, onActivate: onInAppLink }), fn.url && /* @__PURE__ */ React.createElement("span", { className: fn.link || fn.text ? "footnote-list-url-extra" : "footnote-list-note-text" }, /* @__PURE__ */ React.createElement("a", { href: fn.url, target: "_blank", rel: "noopener noreferrer", className: "fn-link", onClick: (e) => e.stopPropagation() }, fn.link || fn.text ? "Open external link" : fn.url)), !fn.text && !fn.link && !fn.url && /* @__PURE__ */ React.createElement("span", { className: "footnote-list-missing" }, "(no content attached)")))
    )));
  }
  window.__setInsets = function(top, bottom) {
    document.documentElement.style.setProperty("--inset-top", top + "px");
    document.documentElement.style.setProperty("--inset-bottom", bottom + "px");
  };

  // app/src/main/assets/src/ui/components/StickyChapterNav.jsx
  function StickyChapterNav2({ onPrev, onNext, prevDisabled, nextDisabled, prevLabel, nextLabel }) {
    return /* @__PURE__ */ React.createElement("div", { className: "chapter-nav-sticky" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "chapter-nav-sticky-arrow",
        disabled: !!prevDisabled,
        onClick: onPrev,
        title: prevLabel || "Previous",
        "aria-label": prevLabel || "Previous"
      },
      "\u2039"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "chapter-nav-sticky-arrow",
        disabled: !!nextDisabled,
        onClick: onNext,
        title: nextLabel || "Next",
        "aria-label": nextLabel || "Next"
      },
      "\u203A"
    ));
  }

  // app/src/main/assets/src/ui/components/ClearProgressRow.jsx
  function ClearProgressRow2({ label, total, count, stage, onTap }) {
    if (count === 0) return /* @__PURE__ */ React.createElement("div", { className: "progress-row" }, /* @__PURE__ */ React.createElement("span", { className: "progress-row-label" }, label), /* @__PURE__ */ React.createElement("span", { className: "progress-row-tally" }, "0 / ", total), /* @__PURE__ */ React.createElement("button", { className: "settings-clear-btn", disabled: true }, "Clear"));
    return /* @__PURE__ */ React.createElement("div", { className: "progress-row" }, /* @__PURE__ */ React.createElement("span", { className: "progress-row-label" }, label), /* @__PURE__ */ React.createElement("span", { className: "progress-row-tally" }, count, " / ", total), /* @__PURE__ */ React.createElement("button", { className: CLEAR_CLASSES[stage], onClick: onTap }, CLEAR_LABELS[stage]));
  }

  // app/src/main/assets/src/ui/components/SrchCard.jsx
  function SrchCard2({ entry, terms, onSelect, isDirect }) {
    if (isDirect) {
      return /* @__PURE__ */ React.createElement("button", { className: "srch-card card-direct", onClick: () => onSelect(entry) }, /* @__PURE__ */ React.createElement("div", { className: "srch-card-top" }, /* @__PURE__ */ React.createElement("span", { className: "srch-card-ref" }, entry.__label)), /* @__PURE__ */ React.createElement("div", { className: "srch-card-snippet" }, entry.__sub || "Go"));
    }
    const doc = entry.doc;
    const meta = SRCH_KIND_LABEL[doc.kind] || { label: doc.kind, cls: "" };
    const refLine = doc.ref || (doc.title || "") + (doc.chapterNum ? " " + doc.chapterNum : "");
    const body = doc.kind === "heading" ? doc.heading || doc.text : doc.kind === "chapter-title" || doc.kind === "letter-title" || doc.kind === "wtlb-title" || doc.kind === "blessed-title" || doc.kind === "holy-day-title" ? doc.title || doc.text : doc.text;
    return /* @__PURE__ */ React.createElement("button", { className: "srch-card", onClick: () => onSelect(entry) }, /* @__PURE__ */ React.createElement("div", { className: "srch-card-top" }, /* @__PURE__ */ React.createElement("span", { className: "srch-card-ref" }, refLine), /* @__PURE__ */ React.createElement("span", { className: "srch-card-badge " + (meta.cls || "") }, meta.label), doc.translation && doc.translation !== "nkjv" && /* @__PURE__ */ React.createElement("span", { className: "srch-card-badge" }, doc.translation.toUpperCase()), doc.heading && doc.kind === "verse" && /* @__PURE__ */ React.createElement("span", { className: "srch-card-badge badge-heading" }, doc.heading.length > 28 ? doc.heading.slice(0, 28) + "\u2026" : doc.heading)), /* @__PURE__ */ React.createElement("div", { className: "srch-card-snippet" }, /* @__PURE__ */ React.createElement(SrchSnippet, { text: body || "", terms })));
  }

  // app/src/main/assets/src/ui/components/SrchSnippet.jsx
  function SrchSnippet2({ text, terms, maxLen = 180 }) {
    if (!text) return null;
    const snippet = window.VotSearch.snippet(text, terms || [], maxLen);
    const spans = window.VotSearch.highlightSpans(snippet, terms || []);
    return /* @__PURE__ */ React.createElement("span", null, spans.map(
      (s, i) => s.hit ? /* @__PURE__ */ React.createElement("mark", { key: i, className: "search-highlight" }, s.text) : /* @__PURE__ */ React.createElement(React.Fragment, { key: i }, s.text)
    ));
  }

  // app/src/main/assets/src/ui/components/SrchGroup.jsx
  function SrchGroup2({ gkey, items, terms, onSelect, defaultOpen }) {
    const [open, setOpen] = React.useState(defaultOpen !== false);
    const meta = SRCH_GROUP_META[gkey] || { label: gkey };
    return /* @__PURE__ */ React.createElement("div", { className: "srch-group" + (open ? "" : " collapsed") }, /* @__PURE__ */ React.createElement("button", { className: "srch-group-header", onClick: () => setOpen((o) => !o) }, /* @__PURE__ */ React.createElement("span", null, meta.label, /* @__PURE__ */ React.createElement("span", { className: "srch-group-count-inline" }, " \xB7 ", items.length, " ", items.length === 1 ? "match" : "matches")), /* @__PURE__ */ React.createElement("span", { className: "srch-group-count" }, open ? "\u25BE" : "\u25B8")), /* @__PURE__ */ React.createElement("div", { className: "srch-group-items" }, items.map((entry, i) => /* @__PURE__ */ React.createElement(SrchCard, { key: i, entry, terms, onSelect }))));
  }

  // app/src/main/assets/src/ui/components/SettingsRow.jsx
  function SettingsRow2({ label, desc, checked, onToggle, disabled, disabledReason }) {
    return /* @__PURE__ */ React.createElement("div", { className: `settings-row${disabled ? " settings-row-disabled" : ""}` }, /* @__PURE__ */ React.createElement("div", { className: "settings-row-text" }, /* @__PURE__ */ React.createElement("div", { className: "settings-row-label" }, label), desc && /* @__PURE__ */ React.createElement("div", { className: "settings-row-desc" }, desc), disabled && disabledReason && /* @__PURE__ */ React.createElement("div", { className: "settings-row-disabled-hint" }, disabledReason)), /* @__PURE__ */ React.createElement("label", { className: "settings-toggle" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "checkbox",
        checked,
        disabled: !!disabled,
        onChange: disabled ? void 0 : onToggle
      }
    ), /* @__PURE__ */ React.createElement("div", { className: "settings-toggle-track" }), /* @__PURE__ */ React.createElement("div", { className: "settings-toggle-thumb" })));
  }

  // app/src/main/assets/src/ui/components/SelectField.jsx
  function SelectField2({ eyebrow, title, label, desc, value, options, onChange }) {
    const [open, setOpen] = React.useState(false);
    const selected = options.find((o) => o.id === value) || options[0];
    React.useEffect(() => {
      if (!open) return;
      const prev = window.__closeSheet;
      window.__closeSheet = () => setOpen(false);
      return () => {
        window.__closeSheet = prev || null;
      };
    }, [open]);
    return /* @__PURE__ */ React.createElement("div", { className: "settings-row", style: { flexDirection: "column", alignItems: "stretch" } }, /* @__PURE__ */ React.createElement("div", { className: "settings-row-text", style: { marginBottom: "0.7rem" } }, /* @__PURE__ */ React.createElement("div", { className: "settings-row-label" }, label), /* @__PURE__ */ React.createElement("div", { className: "settings-row-desc" }, desc)), /* @__PURE__ */ React.createElement("button", { className: "select-field", onClick: (e) => {
      e.stopPropagation();
      setOpen(true);
    } }, /* @__PURE__ */ React.createElement("div", { className: "select-field-body" }, /* @__PURE__ */ React.createElement("span", { className: "select-field-label" }, selected.label), selected.desc ? /* @__PURE__ */ React.createElement("span", { className: "select-field-caption" }, selected.desc) : null), /* @__PURE__ */ React.createElement("span", { className: "select-field-chevron" }, "\u203A")), open && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "select-sheet-backdrop open", onClick: () => setOpen(false) }), /* @__PURE__ */ React.createElement("div", { className: "select-sheet", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "select-sheet-handle" }), eyebrow ? /* @__PURE__ */ React.createElement("div", { className: "select-sheet-eyebrow" }, eyebrow) : null, /* @__PURE__ */ React.createElement("div", { className: "select-sheet-title" }, title || label), /* @__PURE__ */ React.createElement("div", { className: "select-sheet-ornament" }, /* @__PURE__ */ React.createElement("div", { className: "select-sheet-ornament-line" }), /* @__PURE__ */ React.createElement("div", { className: "select-sheet-ornament-diamond" }, "\u2726"), /* @__PURE__ */ React.createElement("div", { className: "select-sheet-ornament-line r" })), /* @__PURE__ */ React.createElement("div", { className: "select-sheet-options" }, options.map((opt) => {
      const isSelected = opt.id === value;
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          key: opt.id,
          className: `select-sheet-option${isSelected ? " selected" : ""}`,
          onClick: () => {
            onChange(opt.id);
            setOpen(false);
          }
        },
        /* @__PURE__ */ React.createElement("div", { className: "select-sheet-option-main" }, /* @__PURE__ */ React.createElement("span", { className: "select-sheet-option-label" }, opt.label), isSelected ? /* @__PURE__ */ React.createElement("span", { className: "select-sheet-option-check" }, "\u2713") : null),
        opt.desc ? /* @__PURE__ */ React.createElement("div", { className: "select-sheet-option-desc" }, opt.desc) : null
      );
    })))));
  }

  // app/src/main/assets/src/ui/components/VolumeLetterIndex.jsx
  function VolumeLetterIndex2({ volumeTitle, eyebrow, letters, preface, onSelect, onSelectPreface, currentLetter, isRead, markAsReadEnabled, columns }) {
    const currentRef = React.useRef(null);
    React.useEffect(() => {
      if (currentRef.current) {
        currentRef.current.scrollIntoView({ block: "center", behavior: "instant" });
      }
    }, []);
    return /* @__PURE__ */ React.createElement("div", { className: "vol-index" }, /* @__PURE__ */ React.createElement("div", { className: "vol-index-header" }, /* @__PURE__ */ React.createElement("div", { className: "vol-index-eyebrow" }, eyebrow || "The Volumes of Truth"), /* @__PURE__ */ React.createElement("h1", { className: "vol-index-title" }, volumeTitle), /* @__PURE__ */ React.createElement("div", { className: "vol-index-ornament" }, /* @__PURE__ */ React.createElement("div", { className: "vol-index-ornament-line" }), /* @__PURE__ */ React.createElement("div", { className: "vol-index-ornament-diamond" }), /* @__PURE__ */ React.createElement("div", { className: "vol-index-ornament-line r" }))), /* @__PURE__ */ React.createElement("div", { className: `chapter-cards${columns === 2 ? " two-col" : ""}` }, preface && (columns === 2 ? /* @__PURE__ */ React.createElement("button", { className: "chapter-card-btn", onClick: () => onSelectPreface && onSelectPreface(preface.id) }, /* @__PURE__ */ React.createElement("div", { className: "two-col-inner" }, /* @__PURE__ */ React.createElement("div", { className: "two-col-num" }, "0"), /* @__PURE__ */ React.createElement("div", { className: "two-col-title" }, preface.title))) : /* @__PURE__ */ React.createElement("button", { className: "chapter-card-btn", onClick: () => onSelectPreface && onSelectPreface(preface.id) }, /* @__PURE__ */ React.createElement("span", { className: "chapter-card-num" }, "0"), /* @__PURE__ */ React.createElement("div", { className: "chapter-card-divider" }), /* @__PURE__ */ React.createElement("div", { className: "chapter-card-info" }, /* @__PURE__ */ React.createElement("div", { className: "chapter-card-label" }, "Preface"), /* @__PURE__ */ React.createElement("div", { className: "chapter-card-title" }, preface.title)), markAsReadEnabled && isRead(preface.id) && /* @__PURE__ */ React.createElement("span", { className: "read-check", style: { marginLeft: "0.4rem" } }, "\u2713"))), letters.map((letter) => {
      const isCurrent = letter.id === currentLetter;
      if (columns === 2) {
        return /* @__PURE__ */ React.createElement(
          "button",
          {
            key: letter.id,
            className: `chapter-card-btn${isCurrent ? " is-current" : ""}`,
            ref: isCurrent ? currentRef : null,
            onClick: () => onSelect(letter.id)
          },
          /* @__PURE__ */ React.createElement("div", { className: "two-col-inner" }, /* @__PURE__ */ React.createElement("div", { className: "two-col-num" }, letter.num), /* @__PURE__ */ React.createElement("div", { className: "two-col-title" }, letter.title))
        );
      }
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          key: letter.id,
          className: `chapter-card-btn${isCurrent ? " is-current" : ""}`,
          ref: isCurrent ? currentRef : null,
          onClick: () => onSelect(letter.id)
        },
        /* @__PURE__ */ React.createElement("span", { className: "chapter-card-num" }, letter.num),
        /* @__PURE__ */ React.createElement("div", { className: "chapter-card-divider" }),
        /* @__PURE__ */ React.createElement("div", { className: "chapter-card-info" }, /* @__PURE__ */ React.createElement("div", { className: "chapter-card-label" }, letter.date), /* @__PURE__ */ React.createElement("div", { className: "chapter-card-title" }, letter.title)),
        markAsReadEnabled && isRead(letter.id) && /* @__PURE__ */ React.createElement("span", { className: "read-check", style: { marginLeft: "0.4rem" } }, "\u2713")
      );
    })));
  }

  // app/src/main/assets/src/ui/components/HistoryEntryCard.jsx
  function HistoryEntryCard2({ entry, onSelect }) {
    const isLetter = entry.type === "letter";
    const isStudy = entry.type === "study-chapter";
    const num = isLetter ? entry.letterNum : entry.chapterNum;
    const title = isLetter ? entry.letterTitle : entry.chapterTitle || null;
    const _volCol = entry.volumeScreen ? COL_BY_INDEX_SC.get(entry.volumeScreen) : null;
    const cardLabel = isStudy ? studyAbbrev(entry.studySlug, entry.studyTitle) : isLetter ? entry.volume === 1 ? "Volume One" : _volCol ? _volCol.label : "Volume Two" : entry.bookTitle;
    const fallback = isLetter ? `Letter ${num}` : isStudy ? `Part ${num}` : `Chapter ${num}`;
    return /* @__PURE__ */ React.createElement("button", { className: "chapter-card-btn", onClick: () => onSelect(entry) }, /* @__PURE__ */ React.createElement("span", { className: "chapter-card-num" }, num), /* @__PURE__ */ React.createElement("div", { className: "chapter-card-divider" }), /* @__PURE__ */ React.createElement("div", { className: "chapter-card-info" }, /* @__PURE__ */ React.createElement("div", { className: "chapter-card-label" }, cardLabel), /* @__PURE__ */ React.createElement("div", { className: "chapter-card-title" }, title || fallback)), /* @__PURE__ */ React.createElement("div", { className: "history-entry-time" }, timeAgo(entry.ts)));
  }

  // app/src/main/assets/src/ui/components/NoteRow.jsx
  function NoteRow2({ note, onTap }) {
    const sourceLabel = noteSourceLabel(note);
    const date = relativeDate(note.updated || note.created);
    const noteNbs = (note.notebookIds || []).map((id) => NotebookStore.get(id)).filter(Boolean);
    const swatchBg = {
      yellow: "#ffd700",
      green: "#76ff03",
      pink: "#ff4081",
      red: "#f44336",
      orange: "#ff9100",
      blue: "#2196f3",
      purple: "#ba68c8",
      teal: "#00bcd4",
      brown: "#8d6e63",
      gray: "#9e9e9e",
      cyan: "#00bcd4"
    }[note.color] || "#ffd700";
    const Exp = typeof JrnExpandable !== "undefined" ? JrnExpandable : null;
    const bodyText = note.body || "";
    const anchorText = note.fullText || "";
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "note-row",
        role: "button",
        tabIndex: 0,
        onClick: () => onTap(note),
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onTap(note);
          }
        }
      },
      /* @__PURE__ */ React.createElement("span", { className: "note-row-swatch", style: { background: swatchBg } }),
      /* @__PURE__ */ React.createElement("span", { className: "note-row-body" }, /* @__PURE__ */ React.createElement("span", { className: "note-row-source-line" }, /* @__PURE__ */ React.createElement("span", { className: "note-row-source" }, sourceLabel), date && /* @__PURE__ */ React.createElement("span", { className: "note-row-date" }, date)), bodyText && (Exp && bodyText.length > 160 ? /* @__PURE__ */ React.createElement(Exp, { text: bodyText, threshold: 160, className: "note-row-preview note-row-preview-expandable", tapToToggle: true }) : /* @__PURE__ */ React.createElement("span", { className: "note-row-preview" }, bodyText)), anchorText && (Exp && anchorText.length > 160 ? /* @__PURE__ */ React.createElement(Exp, { text: "\u201C" + anchorText + "\u201D", threshold: 160, className: "note-row-anchor note-row-anchor-expandable", tapToToggle: true }) : /* @__PURE__ */ React.createElement("span", { className: "note-row-anchor" }, "\u201C", anchorText, "\u201D")), noteNbs.length > 0 && /* @__PURE__ */ React.createElement("span", { className: "note-row-tags" }, noteNbs.slice(0, 2).map((nb) => /* @__PURE__ */ React.createElement("span", { key: nb.id, className: "note-row-nb" }, /* @__PURE__ */ React.createElement("svg", { className: "note-row-nb-icon", viewBox: "0 0 24 24" }, /* @__PURE__ */ React.createElement("path", { d: "M4 4h11l5 5v11a1 1 0 0 1-1 1H4z" }), /* @__PURE__ */ React.createElement("polyline", { points: "15 4 15 9 20 9" })), nb.name)), noteNbs.length > 2 && /* @__PURE__ */ React.createElement("span", { className: "note-row-nb" }, "+", noteNbs.length - 2)))
    );
  }

  // app/src/main/assets/src/ui/components/LinkCard.jsx
  function LinkCard2({ lnk, hlKey, isBlockScope, onNavigate, setHlTick }) {
    const [expanded, setExpanded] = React.useState(false);
    const [confirmRemove, setConfirmRemove] = React.useState(false);
    const matchesSide = (k) => isBlockScope ? k === hlKey || k.startsWith(hlKey + ":") : k === hlKey;
    const isSource = matchesSide(lnk.source.key);
    const other = isSource ? lnk.target : lnk.source;
    const thisSide = isSource ? lnk.source : lnk.target;
    const isOutbound = isSource;
    const preview = resolveVerseText(other);
    const otherText = other.text || preview || "";
    const usingFromFallback = !otherText && !!thisSide.text;
    const rawText = otherText || thisSide.text || "";
    const isLong = rawText.length > 150;
    const chainSvg = /* @__PURE__ */ React.createElement("svg", { className: "link-card-chain", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }), /* @__PURE__ */ React.createElement("path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" }));
    const doRemove = (e) => {
      e.stopPropagation();
      LinkStore.remove(lnk.id);
      setHlTick((t) => t + 1);
    };
    return /* @__PURE__ */ React.createElement("div", { className: "link-card", onClick: confirmRemove ? void 0 : (() => onNavigate && onNavigate(other)) }, /* @__PURE__ */ React.createElement("div", { className: "link-card-header" }, /* @__PURE__ */ React.createElement("div", { className: "link-card-ref" }, /* @__PURE__ */ React.createElement("span", { className: "link-card-direction" }, isOutbound ? "to " : "from "), other.label), chainSvg), /* @__PURE__ */ React.createElement("div", { className: "link-card-cat" }, other.type === "bible" ? bookCategory(other.bookId) : other.type === "study" ? "Matthew Study Bible" : other.type === "study-letter" ? other.collection || "Bible Study" : other.type === "letter" ? other.collection || "Letter" : other.type === "wtlb" ? other.collection || "Words To Live By" : other.type === "blessed" ? "The Blessed" : other.type === "holy-days" ? "Holy Days" : ""), lnk.created && /* @__PURE__ */ React.createElement("div", { className: "link-card-date" }, relativeDate(lnk.created)), /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "link-card-preview",
        style: expanded ? { display: "block", WebkitLineClamp: "unset", overflow: "visible" } : void 0
      },
      (other.type === "bible" || other.type === "study") && other.verse && /* @__PURE__ */ React.createElement("strong", null, other.verse + " "),
      usingFromFallback && /* @__PURE__ */ React.createElement("em", { className: "link-card-from-label" }, "From: "),
      rawText
    ), !confirmRemove && /* @__PURE__ */ React.createElement("div", { className: "link-card-actions" }, isLong && /* @__PURE__ */ React.createElement(
      "span",
      {
        className: "link-card-show-more",
        onClick: (e) => {
          e.stopPropagation();
          setExpanded((x) => !x);
        }
      },
      expanded ? "Show less" : "Show more"
    ), /* @__PURE__ */ React.createElement(
      "span",
      {
        className: "link-card-remove",
        onClick: (e) => {
          e.stopPropagation();
          setConfirmRemove(true);
        }
      },
      "Remove link"
    )), confirmRemove && /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "ann-chip-confirm",
        style: { padding: "10px 12px" },
        onClick: (e) => e.stopPropagation()
      },
      /* @__PURE__ */ React.createElement("span", { className: "ann-chip-confirm-q" }, "Remove this link?"),
      /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "ann-chip-confirm-btn ann-chip-confirm-cancel",
          onClick: (e) => {
            e.stopPropagation();
            setConfirmRemove(false);
          }
        },
        "Cancel"
      ),
      /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "ann-chip-confirm-btn ann-chip-confirm-yes",
          onClick: doRemove
        },
        "Yes, remove"
      )
    ));
  }

  // app/src/main/assets/src/ui/components/LinkIcon.jsx
  function LinkIcon2({ hlKey, hlTick, onClick, prefix }) {
    const links = React.useMemo(
      () => prefix ? LinkStore.getForKeyPrefix(hlKey) : LinkStore.getForKey(hlKey),
      // eslint-disable-next-line react-hooks/exhaustive-deps -- cache-bust signal: hlTick bumps on store mutation, forces memo recompute (ARCHITECTURE.md §"Annotation rendering")
      [hlKey, hlTick, prefix]
    );
    if (!links || links.length === 0) return null;
    return /* @__PURE__ */ React.createElement(
      "span",
      {
        className: "verse-link-icon",
        onClick: (e) => {
          e.stopPropagation();
          onClick && onClick(hlKey);
        },
        title: links.length + " link" + (links.length > 1 ? "s" : "")
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24" }, /* @__PURE__ */ React.createElement("path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }), /* @__PURE__ */ React.createElement("path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" }))
    );
  }

  // app/src/main/assets/src/ui/components/BookmarkIcon.jsx
  function BookmarkIcon2({ hlKey, hlTick }) {
    const bookmarks = React.useMemo(
      () => BookmarkStore.getForKeyPrefix(hlKey),
      // eslint-disable-next-line react-hooks/exhaustive-deps -- cache-bust signal: hlTick bumps on store mutation, forces memo recompute (ARCHITECTURE.md §"Annotation rendering")
      [hlKey, hlTick]
    );
    if (!bookmarks || bookmarks.length === 0) return null;
    const ids = bookmarks.map((b) => b.id);
    const open = (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (ids.length === 1 && window.__bookmarkEdit) {
        window.__bookmarkEdit(ids[0], { atSource: true });
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      if (window.__openBookmarkPopover) {
        window.__openBookmarkPopover(ids, rect.left + rect.width / 2, rect.bottom + 4, hlKey);
      }
    };
    return /* @__PURE__ */ React.createElement(
      "span",
      {
        className: "inline-bookmark-icon" + (ids.length > 1 ? " inline-bookmark-icon-multi" : ""),
        onClick: open,
        title: ids.length === 1 ? "Bookmark" : ids.length + " bookmarks"
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "currentColor", stroke: "currentColor" }, /* @__PURE__ */ React.createElement(
        "path",
        {
          fill: "currentColor",
          stroke: "currentColor",
          strokeWidth: "1.5",
          strokeLinejoin: "round",
          d: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"
        }
      ))
    );
  }

  // app/src/main/assets/src/ui/screens/LetterView.jsx
  function LetterView2({ letter, onHome, onNavigate, onStudyNavigate, prevBoundary, onPrevBoundary, nextBoundary, onNextBoundary, onSearch, onSettings, onHistory, theme, onThemeChange, surpriseAnchor, onMarkRead, onUnmark: _onUnmark, isRead: _isRead, markAsReadEnabled, showProgressBar, volumeLabel, studyMode, onLetterClick, onInAppLink, backHint, onBack, prophecyCardStatesRef, saveProphecyCardStates, hlTick, onLinkOpen: _onLinkOpen }) {
    const wrappedInAppLink = onInAppLink ? (link) => onInAppLink(link, { sourceLetterTitle: letter.title, sourceVolumeLabel: volumeLabel }) : null;
    const [highlightedFn, setHighlightedFn] = React.useState(null);
    const [sheetFn, setSheetFn] = React.useState(null);
    const [_surpriseBlockId, setSurpriseBlockId] = React.useState(null);
    const [highlightExcerpt, setHighlightExcerpt] = React.useState(null);
    const [expandSignal, setExpandSignal] = React.useState(0);
    const [allExpanded, setAllExpanded] = React.useState(true);
    const hasProphecyGroups = letter.blocks.some((b) => b.type === "prophecy-group");
    const mainRef = React.useRef(null);
    useMarkAsRead(markAsReadEnabled, onMarkRead);
    React.useEffect(() => {
      setHighlightedFn(null);
      setSheetFn(null);
      setScripRef(null);
      setSurpriseBlockId(null);
      const pending = window.__pendingHighlight;
      if (pending && pending.letterId === letter.id && pending.excerpt) {
        setHighlightExcerpt(pending.excerpt);
        window.__pendingHighlight = null;
      } else {
        setHighlightExcerpt(null);
      }
    }, [letter.id]);
    React.useEffect(() => {
      if (!highlightExcerpt) return;
      const timer = setTimeout(() => {
        const mark = mainRef.current && mainRef.current.querySelector("mark.letter-highlight");
        if (mark) {
          mark.scrollIntoView({ block: "center" });
          return;
        }
        highlightExcerptInDom(mainRef.current, highlightExcerpt);
      }, 80);
      return () => clearTimeout(timer);
    }, [highlightExcerpt]);
    React.useEffect(() => {
      if (!surpriseAnchor || surpriseAnchor.type !== "excerpt") return;
      const excerpt = surpriseAnchor.text;
      const blocks = letter.blocks || [];
      let foundId = null;
      for (let i = 0; i < blocks.length; i++) {
        const segs = blocks[i].segments || [];
        const blockText = segs.map((s) => s.v || "").join(" ");
        if (blockText.includes(excerpt.slice(0, 40))) {
          foundId = `letter-block-${i}`;
          break;
        }
      }
      if (!foundId) return;
      setSurpriseBlockId(foundId);
      const timer = setTimeout(() => {
        const el = document.getElementById(foundId);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
      const fadeTimer = setTimeout(() => setSurpriseBlockId(null), 4e3);
      return () => {
        clearTimeout(timer);
        clearTimeout(fadeTimer);
      };
    }, [surpriseAnchor, letter.id]);
    const handleFnClick = (num) => {
      setSheetFn((prev) => prev === num ? null : num);
    };
    const [scripRef, setScripRef] = React.useState(null);
    const handleScripClick = (ref) => {
      setScripRef(ref);
    };
    React.useEffect(() => {
      var closer = sheetFn !== null ? () => setSheetFn(null) : scripRef !== null ? () => setScripRef(null) : null;
      if (!closer) return;
      var prev = window.__closeSheet;
      window.__closeSheet = closer;
      return () => {
        window.__closeSheet = prev || null;
      };
    }, [sheetFn, scripRef]);
    const fnProps = { activeFn: sheetFn != null ? sheetFn : highlightedFn, onFnClick: handleFnClick, onScripClick: handleScripClick, onLetterClick, onInAppLink: wrappedInAppLink, studyMode, footnotes: studyMode ? letter.footnotes : null, highlightText: highlightExcerpt };
    React.useEffect(() => {
      const root = mainRef.current;
      if (!root) return;
      const active = sheetFn != null ? sheetFn : highlightedFn;
      root.querySelectorAll(".fn-ref.active").forEach((e) => e.classList.remove("active"));
      if (active != null) {
        const el = root.querySelector('.fn-ref[data-fn-num="' + String(active).replace(/"/g, '\\"') + '"]');
        if (el) el.classList.add("active");
      }
    }, [sheetFn, highlightedFn, letter.id]);
    const hasFn = letter.footnotes ? Object.keys(letter.footnotes).length > 0 : false;
    return /* @__PURE__ */ React.createElement(
      ScreenLayout,
      {
        showProgress: showProgressBar,
        navChildren: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "nav-volume nav-back-icon", onClick: onHome, title: `\u2190 ${volumeLabel || "Volume Two"}`, "aria-label": `Back to ${volumeLabel || "Volume Two"}` }, "\u2039"), /* @__PURE__ */ React.createElement(HomeBtn, null), /* @__PURE__ */ React.createElement("div", { className: "nav-arrows" }, /* @__PURE__ */ React.createElement(
          "button",
          {
            className: "nav-arrow-btn",
            disabled: !letter.prevLetter && !prevBoundary,
            onClick: () => letter.prevLetter ? onNavigate(letter.prevLetter.id) : onPrevBoundary && onPrevBoundary(),
            title: "Previous",
            "aria-label": "Previous letter"
          },
          "\u2039"
        ), /* @__PURE__ */ React.createElement(
          "button",
          {
            className: "nav-arrow-btn",
            disabled: !letter.nextLetter && !nextBoundary,
            onClick: () => letter.nextLetter ? onNavigate(letter.nextLetter.id) : onNextBoundary && onNextBoundary(),
            title: "Next",
            "aria-label": "Next letter"
          },
          "\u203A"
        )), /* @__PURE__ */ React.createElement(
          NavButtons,
          {
            onSettings,
            onHistory,
            onSearch,
            theme,
            onThemeChange,
            reading: true,
            chapterBookmark: letter ? { hlKey: "letter:" + letter.id, label: letter.title || "Letter bookmark" } : null,
            journalRefKey: typeof jrnRefKeyForLetterByLabel === "function" ? jrnRefKeyForLetterByLabel(volumeLabel || "Volume Two", letter && letter.id) : null,
            journalRefLabel: letter && letter.title,
            hlTick
          }
        ))
      },
      /* @__PURE__ */ React.createElement(
        StickyChapterNav,
        {
          onPrev: () => letter.prevLetter ? onNavigate(letter.prevLetter.id) : onPrevBoundary && onPrevBoundary(),
          onNext: () => letter.nextLetter ? onNavigate(letter.nextLetter.id) : onNextBoundary && onNextBoundary(),
          prevDisabled: !letter.prevLetter && !prevBoundary,
          nextDisabled: !letter.nextLetter && !nextBoundary,
          prevLabel: "Previous letter",
          nextLabel: "Next letter"
        }
      ),
      backHint && /* @__PURE__ */ React.createElement("div", { className: "back-hint-row" }, /* @__PURE__ */ React.createElement("button", { className: "back-hint-pill", onClick: onBack, "aria-label": "Back to source letter" }, /* @__PURE__ */ React.createElement("span", { className: "back-hint-arrow" }, "\u2039"), "Back to", " ", /* @__PURE__ */ React.createElement("span", { className: "back-hint-title" }, backHint.volumeLabel ? `${backHint.volumeLabel} \xB7 ${backHint.title}` : backHint.title))),
      /* @__PURE__ */ React.createElement("header", { className: "hero" }, /* @__PURE__ */ React.createElement("div", { className: `hero-bg ${studyMode ? "study" : "vol"}` }), /* @__PURE__ */ React.createElement("div", { className: "hero-content" }, /* @__PURE__ */ React.createElement("div", { className: "hero-eyebrow" }, volumeLabel || "Volume Two", " ", "\xA0\xB7\xA0", " ", studyMode ? letter.num === 0 ? "Preface" : `Chapter ${letter.num}` : letter.num === 0 ? "Preface" : `Letter ${letter.num}`), /* @__PURE__ */ React.createElement("h1", { className: `hero-title${letter.title && letter.title.length > 25 ? " hero-title-long" : ""}` }, letter.title), letter.subtitle && /* @__PURE__ */ React.createElement("div", { className: "hero-subtitle" }, letter.subtitle), /* @__PURE__ */ React.createElement("div", { className: "hero-ornament" }, /* @__PURE__ */ React.createElement("div", { className: "hero-ornament-line" }), /* @__PURE__ */ React.createElement("div", { className: "hero-ornament-diamond" }), /* @__PURE__ */ React.createElement("div", { className: "hero-ornament-line r" })))),
      /* @__PURE__ */ React.createElement("div", { className: "page-wrapper" }, /* @__PURE__ */ React.createElement("div", { className: "letter-meta" }, /* @__PURE__ */ React.createElement("div", { className: "meta-date" }, letter.date), /* @__PURE__ */ React.createElement("div", { className: "meta-from" }, letter.from), /* @__PURE__ */ React.createElement("div", { className: "meta-spoken" }, letter.spoken), /* @__PURE__ */ React.createElement("div", { className: "meta-for" }, letter.forLine), letter.noteLine && /* @__PURE__ */ React.createElement("div", { className: "meta-note" }, letter.noteLine), letter.metaAddendum && /* @__PURE__ */ React.createElement("div", { className: "meta-addendum" }, "Addendum to", " ", letter.metaAddendumLink && wrappedInAppLink ? /* @__PURE__ */ React.createElement("a", { href: "#", onClick: (e) => {
        e.preventDefault();
        wrappedInAppLink(letter.metaAddendumLink);
      } }, letter.metaAddendum) : letter.metaAddendumInternal ? /* @__PURE__ */ React.createElement("a", { href: "#", onClick: (e) => {
        e.preventDefault();
        onNavigate(letter.metaAddendumInternal);
      } }, letter.metaAddendum) : /* @__PURE__ */ React.createElement("a", { href: letter.metaAddendumUrl, target: "_blank", rel: "noopener noreferrer" }, letter.metaAddendum)), letter.preamble && /* @__PURE__ */ React.createElement("div", { className: "meta-preamble" }, letter.preamble)), letter.sectionIntro && letter.sectionIntro.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "section-intro-quote" }, letter.sectionIntro.map((block, si) => {
        if (block.type === "heading") return /* @__PURE__ */ React.createElement("h3", { key: si, className: "section-intro-heading" }, block.text);
        if (!block.segments) return null;
        return /* @__PURE__ */ React.createElement("p", { key: si, className: "section-intro-text" }, /* @__PURE__ */ React.createElement(Segments, { segments: block.segments, ...fnProps }));
      })), /* @__PURE__ */ React.createElement("div", { className: "content-layout" }, /* @__PURE__ */ React.createElement("main", { className: "letter-body", ref: mainRef }, letter.blocks.map((block, bi) => {
        if (block.type === "intro") return /* @__PURE__ */ React.createElement("p", { key: letter.id + ":" + bi, className: "letter-intro", "data-hl-key": letterHlKey(letter.id, bi), "data-hl-dom": true }, /* @__PURE__ */ React.createElement(StaticSubtree, null, /* @__PURE__ */ React.createElement(Segments, { segments: block.segments, ...fnProps })));
        if (block.type === "heading") return /* @__PURE__ */ React.createElement("h2", { key: bi, className: `study-heading study-heading-l${block.level || 2}` }, block.text);
        if (block.type === "para") return /* @__PURE__ */ React.createElement("p", { key: letter.id + ":" + bi, className: "letter-para", "data-hl-key": letterHlKey(letter.id, bi), "data-hl-dom": true }, /* @__PURE__ */ React.createElement(StaticSubtree, null, /* @__PURE__ */ React.createElement(Segments, { segments: block.segments, ...fnProps })));
        if (block.type === "poetry") {
          if (block.lines) return /* @__PURE__ */ React.createElement("div", { key: letter.id + ":" + bi, className: "letter-poetry", "data-hl-key": letterHlKey(letter.id, bi), "data-hl-dom": true }, /* @__PURE__ */ React.createElement(StaticSubtree, null, block.lines.map((line, li) => /* @__PURE__ */ React.createElement("div", { key: li, className: "poetry-line" }, /* @__PURE__ */ React.createElement(Segments, { segments: line, ...fnProps })))));
          return /* @__PURE__ */ React.createElement("div", { key: letter.id + ":" + bi, className: "letter-poetry", "data-hl-key": letterHlKey(letter.id, bi), "data-hl-dom": true }, /* @__PURE__ */ React.createElement(StaticSubtree, null, (block.segments || []).map((seg, li) => {
            const lineSeg = { ...seg, v: (seg.v || "").replace(/^\n/, "") };
            return /* @__PURE__ */ React.createElement("div", { key: li, className: "poetry-line" }, /* @__PURE__ */ React.createElement(Segments, { segments: [lineSeg], ...fnProps }));
          })));
        }
        if (block.type === "closing") return /* @__PURE__ */ React.createElement("div", { key: letter.id + ":" + bi, className: "letter-closing", "data-hl-key": letterHlKey(letter.id, bi), "data-hl-dom": true }, /* @__PURE__ */ React.createElement(StaticSubtree, null, block.text));
        if (block.type === "closing-fn") return /* @__PURE__ */ React.createElement("div", { key: letter.id + ":" + bi, className: "letter-closing-fn", "data-hl-key": letterHlKey(letter.id, bi), "data-hl-dom": true }, /* @__PURE__ */ React.createElement(StaticSubtree, null, /* @__PURE__ */ React.createElement(Segments, { segments: block.segments, ...fnProps })));
        if (block.type === "prophecy-group") return /* @__PURE__ */ React.createElement(
          ProphecyGroup,
          {
            key: bi,
            block,
            fnProps,
            expandSignal,
            groupKey: letter.id + ":" + bi,
            statesRef: prophecyCardStatesRef,
            onSaveStates: saveProphecyCardStates
          }
        );
        if (block.type === "cover-image") return /* @__PURE__ */ React.createElement("div", { key: bi, className: "study-cover-inline" }, /* @__PURE__ */ React.createElement("img", { src: block.src, alt: "Study cover" }));
        if (block.type === "study-image") return /* @__PURE__ */ React.createElement("div", { key: bi }, /* @__PURE__ */ React.createElement("div", { className: "study-image-block" }, /* @__PURE__ */ React.createElement("img", { src: block.src, alt: block.alt || "Study diagram" })), block.caption && /* @__PURE__ */ React.createElement("p", { className: "study-image-caption" }, block.caption));
        return null;
      }), /* @__PURE__ */ React.createElement("div", { className: "reading-end" }), hasFn && /* @__PURE__ */ React.createElement(FootnoteListSection, { footnotes: letter.footnotes, nkjv: letter.nkjv, highlightedFn, onInAppLink: wrappedInAppLink }), /* @__PURE__ */ React.createElement("div", { className: "ornament-divider" }, /* @__PURE__ */ React.createElement("div", { className: "ornament-divider-line" }), /* @__PURE__ */ React.createElement("div", { className: "ornament-divider-symbol" }, "\u2726"), /* @__PURE__ */ React.createElement("div", { className: "ornament-divider-line" })), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav" }, letter.prevLetter ? /* @__PURE__ */ React.createElement("button", { className: "bottom-nav-card", onClick: () => onNavigate(letter.prevLetter.id) }, /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-label" }, "\u2039 Previous Letter"), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-title" }, letter.prevLetter.title)) : prevBoundary ? /* @__PURE__ */ React.createElement("button", { className: "bottom-nav-card", onClick: onPrevBoundary }, /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-label" }, prevBoundary.short ? `\u2039 Previous \xB7 ${prevBoundary.short}` : "\u2039 Previous Book"), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-title" }, prevBoundary.title)) : /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-card placeholder" }, /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-label" }, "\u2039 Previous Letter"), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-title" }, "\u2014")), letter.nextLetter ? /* @__PURE__ */ React.createElement("button", { className: "bottom-nav-card next", onClick: () => onNavigate(letter.nextLetter.id) }, /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-label" }, "Next Letter \u203A"), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-title" }, letter.nextLetter.title)) : nextBoundary ? /* @__PURE__ */ React.createElement("button", { className: "bottom-nav-card next", onClick: onNextBoundary }, /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-label" }, nextBoundary.short ? `Next \xB7 ${nextBoundary.short} \u203A` : "Next Book \u203A"), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-title" }, nextBoundary.title)) : letter.nextLetterExternal ? /* @__PURE__ */ React.createElement("a", { className: "bottom-nav-card next", href: letter.nextLetterExternal.url, target: "_blank", rel: "noopener noreferrer" }, /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-label" }, "Next Letter \u203A"), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-title" }, letter.nextLetterExternal.title)) : /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-card next placeholder" }, /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-label" }, "Next Letter \u203A"), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-title" }, "\u2014"))), /* @__PURE__ */ React.createElement("div", { className: "related-section" }, letter.addendum && /* @__PURE__ */ React.createElement("div", { className: "related-card" }, /* @__PURE__ */ React.createElement("div", { className: "related-card-title" }, "Also Read"), letter.addendumLink && wrappedInAppLink ? /* @__PURE__ */ React.createElement("a", { className: "related-link", href: "#", onClick: (e) => {
        e.preventDefault();
        wrappedInAppLink(letter.addendumLink);
      } }, letter.addendum) : letter.addendumInternal ? /* @__PURE__ */ React.createElement("a", { className: "related-link", href: "#", onClick: (e) => {
        e.preventDefault();
        onNavigate(letter.addendumInternal);
      } }, letter.addendum) : /* @__PURE__ */ React.createElement("a", { className: "related-link", href: letter.addendumUrl, target: "_blank", rel: "noopener noreferrer" }, letter.addendum)), letter.relatedTopics?.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "related-card" }, /* @__PURE__ */ React.createElement("div", { className: "related-card-title" }, "Related Topics"), letter.relatedTopics.map(
        (t, i) => t.link && wrappedInAppLink ? /* @__PURE__ */ React.createElement("a", { key: i, className: "related-link", href: "#", onClick: (e) => {
          e.preventDefault();
          wrappedInAppLink(t.link);
        } }, t.label) : t.internalStudy && onStudyNavigate ? /* @__PURE__ */ React.createElement("a", { key: i, className: "related-link", href: "#", onClick: (e) => {
          e.preventDefault();
          onStudyNavigate(t.internalStudy);
        } }, t.label) : /* @__PURE__ */ React.createElement("a", { key: i, className: "related-link", href: t.url, target: "_blank", rel: "noopener noreferrer" }, t.label)
      )), letter.bibleStudies?.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "related-card" }, /* @__PURE__ */ React.createElement("div", { className: "related-card-title" }, "Bible Study"), letter.bibleStudies.map(
        (s, i) => s.link && wrappedInAppLink ? /* @__PURE__ */ React.createElement("a", { key: i, className: "related-link", href: "#", onClick: (e) => {
          e.preventDefault();
          wrappedInAppLink(s.link);
        } }, s.label) : s.internalStudy && onStudyNavigate ? /* @__PURE__ */ React.createElement("a", { key: i, className: "related-link", href: "#", onClick: (e) => {
          e.preventDefault();
          onStudyNavigate(s.internalStudy);
        } }, s.label) : /* @__PURE__ */ React.createElement("a", { key: i, className: "related-link", href: s.url, target: "_blank", rel: "noopener noreferrer" }, s.label)
      )), (letter.audioUrl || letter.soundcloudUrl) && /* @__PURE__ */ React.createElement("div", { className: "related-card" }, /* @__PURE__ */ React.createElement("div", { className: "related-card-title" }, "Audio"), letter.audioUrl && /* @__PURE__ */ React.createElement("a", { className: "related-link", href: letter.audioUrl, target: "_blank", rel: "noopener noreferrer" }, "\u266A Audio Recording"), letter.soundcloudUrl && /* @__PURE__ */ React.createElement("a", { className: "related-link", href: letter.soundcloudUrl, target: "_blank", rel: "noopener noreferrer" }, "\u266A Listen on SoundCloud")), /* @__PURE__ */ React.createElement("div", { className: "related-card" }, /* @__PURE__ */ React.createElement("div", { className: "related-card-title" }, "Videos"), letter.videos?.map((v, i) => /* @__PURE__ */ React.createElement("a", { key: i, className: "related-link", href: v.url, target: "_blank", rel: "noopener noreferrer" }, "\u25B6 ", v.label)), letter.videoVoiceUrl && /* @__PURE__ */ React.createElement("a", { className: "related-link", href: letter.videoVoiceUrl, target: "_blank", rel: "noopener noreferrer" }, "\u25B6 ", letter.videoVoiceLabel || "Video (with voice over)"), letter.videoMusicUrl && /* @__PURE__ */ React.createElement("a", { className: "related-link", href: letter.videoMusicUrl, target: "_blank", rel: "noopener noreferrer" }, "\u25B6 Video (excerpts set to music)"), /* @__PURE__ */ React.createElement("a", { className: "related-link", href: "https://www.youtube.com/user/trumpetcallofgod", target: "_blank", rel: "noopener noreferrer" }, /* @__PURE__ */ React.createElement("span", { style: { color: "#cc4444" } }, "\u25B6"), " Official YouTube Channel")))))),
      /* @__PURE__ */ React.createElement(
        FootnoteSheet,
        {
          num: sheetFn,
          fn: sheetFn ? letter.footnotes[sheetFn] : null,
          nkjv: letter.nkjv,
          footnotes: letter.footnotes,
          onNavigate: (newKey) => setSheetFn(newKey),
          onClose: () => setSheetFn(null),
          onInAppLink: (link) => {
            setSheetFn(null);
            wrappedInAppLink && wrappedInAppLink(link);
          }
        }
      ),
      /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: `fn-sheet-backdrop${scripRef ? " open" : ""}`, onClick: () => setScripRef(null) }), /* @__PURE__ */ React.createElement("div", { className: `fn-sheet${scripRef ? " open" : ""}` }, /* @__PURE__ */ React.createElement("div", { className: "fn-sheet-handle" }), scripRef && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { className: "sc-sheet-tag" }, "Scripture Reference"), /* @__PURE__ */ React.createElement("span", { className: "sc-sheet-cite" }, scripRef), (() => {
        const baked = letter.nkjv && letter.nkjv[scripRef];
        const looked = !baked ? lookupVersesFromBooks(scripRef) : null;
        const text = baked || looked;
        return text ? /* @__PURE__ */ React.createElement("div", { className: "sc-sheet-verse" }, /* @__PURE__ */ React.createElement(ScriptureVerseText, { text, cite: scripRef })) : /* @__PURE__ */ React.createElement("div", { className: "sc-sheet-verse", style: { color: "var(--cream-dim)", fontStyle: "italic" } }, "Verse text not available in app data");
      })()))),
      hasProphecyGroups && /* @__PURE__ */ React.createElement(
        ProphecyExpandToggle,
        {
          allExpanded,
          onToggle: (expand) => {
            setAllExpanded(expand);
            setExpandSignal(expand ? expandSignal >= 0 ? expandSignal + 1 : 1 : expandSignal <= 0 ? expandSignal - 1 : -1);
            if (prophecyCardStatesRef) {
              const prefix = letter.id + ":";
              Object.keys(prophecyCardStatesRef.current).forEach((k) => {
                if (k.startsWith(prefix)) prophecyCardStatesRef.current[k] = expand;
              });
              saveProphecyCardStates && saveProphecyCardStates();
            }
          }
        }
      )
    );
  }

  // app/src/main/assets/src/ui/screens/WtlbEntryView.jsx
  function WtlbEntryView2({ entry, partLabel, onHome, onNavigate, onSearch, onSettings, onHistory, onNavToChapter, prevBoundary, onPrevBoundary, nextBoundary, onNextBoundary, theme, onThemeChange, onMarkRead, onUnmark: _onUnmark, isRead: _isRead, markAsReadEnabled, showProgressBar, scripturesDict, indexLabel: _indexLabel, footnotesMode, backHint, onBack, hlTick, onLinkOpen: _onLinkOpen, onInAppLink }) {
    const [scriptureRef, setScriptureRef] = React.useState(null);
    const [scriptureText, setScriptureText] = React.useState(null);
    const [highlightedFn, setHighlightedFn] = React.useState(null);
    const wtlbMainRef = React.useRef(null);
    React.useEffect(() => {
      const pending = window.__pendingHighlight;
      if (!pending || pending.letterId !== entry.id || !pending.excerpt) return;
      window.__pendingHighlight = null;
      const excerpt = pending.excerpt;
      const t = setTimeout(() => highlightExcerptInDom(wtlbMainRef.current, excerpt), 80);
      return () => clearTimeout(t);
    }, [entry.id]);
    const refAnalysis = React.useMemo(() => {
      const perParagraph = [];
      const refNumMap = {};
      const orderedRefs = [];
      let num = 0;
      entry.paragraphs.forEach((p) => {
        const arr = [];
        const re = /\{\{ref:([^}]+)\}\}/g;
        let m;
        while ((m = re.exec(p.text)) !== null) {
          const ref = m[1].trim();
          const after = p.text.slice(m.index + m[0].length);
          const stripped = after.replace(/\{\{(?:ref|nav):[^}]+\}\}/g, "");
          const hasWordChar = /\w/.test(stripped);
          const hasLaterMarker = /\{\{(?:ref|nav):/.test(after);
          const trailing = !hasWordChar && !hasLaterMarker;
          let n = null;
          if (footnotesMode && !trailing) {
            if (!(ref in refNumMap)) {
              num++;
              refNumMap[ref] = num;
              orderedRefs.push(ref);
            }
            n = refNumMap[ref];
          }
          arr.push({ ref, trailing, num: n });
        }
        perParagraph.push(arr);
      });
      return { perParagraph, refNumMap, orderedRefs };
    }, [entry.id, footnotesMode]);
    const lookupVerse = (ref) => {
      const perEntry = entry.scriptures || {};
      const dict = scripturesDict || WTLB_SCRIPTURES;
      return perEntry[ref] || dict[ref] || null;
    };
    React.useEffect(() => {
      if (scriptureRef === null) return;
      var prev = window.__closeSheet;
      window.__closeSheet = () => setScriptureRef(null);
      return () => {
        window.__closeSheet = prev || null;
      };
    }, [scriptureRef]);
    const openSheetForRef = (ref) => {
      setScriptureRef(ref);
      setScriptureText(lookupVerse(ref));
    };
    const handleBubbleClick = (ref, _n) => {
      openSheetForRef(ref);
    };
    useMarkAsRead(markAsReadEnabled, onMarkRead);
    React.useEffect(() => {
      setScriptureRef(null);
      setScriptureText(null);
      setHighlightedFn(null);
    }, [entry.id]);
    React.useEffect(() => {
      const root = wtlbMainRef.current;
      if (!root) return;
      root.querySelectorAll(".fn-ref.active").forEach((e) => e.classList.remove("active"));
      if (highlightedFn != null) {
        const el = root.querySelector('.fn-ref[data-fn-num="' + String(highlightedFn).replace(/"/g, '\\"') + '"]');
        if (el) el.classList.add("active");
      }
    }, [highlightedFn, entry.id]);
    const prevEntry = entry.prevEntry;
    const nextEntry = entry.nextEntry;
    const _attrCollectionLabel = (volStr) => {
      if (!volStr) return null;
      const s = String(volStr).trim().toLowerCase();
      const NUMS = { "1": "One", "2": "Two", "3": "Three", "4": "Four", "5": "Five", "6": "Six", "7": "Seven" };
      if (NUMS[s]) return "Volume " + NUMS[s];
      const WORDS = ["one", "two", "three", "four", "five", "six", "seven"];
      if (WORDS.includes(s)) return "Volume " + s.charAt(0).toUpperCase() + s.slice(1);
      return null;
    };
    const renderLine = (line, consumeRef) => {
      const parts = line.split(/(\*\*.*?\*\*|_.*?_|\{\{ref:[^}]+\}\}|\{\{nav:[^}]+\}\}|\[From [^\]]+\])/g);
      return parts.map((seg, si) => {
        if (!seg) return null;
        if (seg.startsWith("**") && seg.endsWith("**")) return /* @__PURE__ */ React.createElement("strong", { key: si }, renderLine(seg.slice(2, -2), consumeRef));
        if (seg.startsWith("_") && seg.endsWith("_")) return /* @__PURE__ */ React.createElement("em", { key: si }, renderLine(seg.slice(1, -1), consumeRef));
        const attrMatch = seg.match(/^\[From ["“”](.+?)["“”]\s*~\s*Volume\s+(\d+|[A-Za-z]+)\]$/);
        if (attrMatch && onInAppLink) {
          const title = attrMatch[1];
          const collection = _attrCollectionLabel(attrMatch[2]);
          if (collection) {
            return /* @__PURE__ */ React.createElement(
              "span",
              {
                key: si,
                className: "letter-link-ref",
                onClick: () => onInAppLink(
                  { collection, letterTitle: title },
                  { sourceLetterTitle: entry.title, sourceVolumeLabel: partLabel || null }
                ),
                title: 'Open "' + title + '" in ' + collection
              },
              seg
            );
          }
        }
        const refMatch = seg.match(/^\{\{ref:(.+)\}\}$/);
        if (refMatch) {
          const ref = refMatch[1].trim();
          const info = consumeRef();
          if (info && footnotesMode && !info.trailing && info.num != null) {
            const n = info.num;
            return /* @__PURE__ */ React.createElement(
              "span",
              {
                key: si,
                className: `fn-ref${highlightedFn === n ? " active" : ""}`,
                "data-fn-num": n,
                onClick: () => handleBubbleClick(ref, n),
                title: `Footnote ${n}`
              },
              n
            );
          }
          return /* @__PURE__ */ React.createElement("a", { key: si, className: "wtlb-cite", href: "#", onClick: (e) => {
            e.preventDefault();
            openSheetForRef(ref);
          } }, "(", ref, ")");
        }
        const navMatch = seg.match(/^\{\{nav:([^:]+):(\d+)\}\}$/);
        if (navMatch) {
          const bookId = navMatch[1], ch = parseInt(navMatch[2], 10);
          const bookTitle = BOOKS[bookId]?.title || bookId;
          return /* @__PURE__ */ React.createElement("a", { key: si, className: "fn-link", href: "#", onClick: (e) => {
            e.preventDefault();
            onNavToChapter(bookId, ch);
          } }, "[", bookTitle, " ", ch, "]");
        }
        return /* @__PURE__ */ React.createElement(React.Fragment, { key: si }, seg);
      });
    };
    return /* @__PURE__ */ React.createElement(
      ScreenLayout,
      {
        showProgress: showProgressBar,
        navChildren: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "nav-home nav-back-icon", onClick: onHome, title: "\u2190 Index", "aria-label": "Back to Index" }, "\u2039"), /* @__PURE__ */ React.createElement(HomeBtn, null), /* @__PURE__ */ React.createElement("div", { className: "nav-arrows" }, /* @__PURE__ */ React.createElement(
          "button",
          {
            className: "nav-arrow-btn",
            disabled: !prevEntry && !prevBoundary,
            onClick: () => prevEntry ? onNavigate(prevEntry.id) : onPrevBoundary && onPrevBoundary(),
            title: "Previous",
            "aria-label": "Previous entry"
          },
          "\u2039"
        ), /* @__PURE__ */ React.createElement(
          "button",
          {
            className: "nav-arrow-btn",
            disabled: !nextEntry && !nextBoundary,
            onClick: () => nextEntry ? onNavigate(nextEntry.id) : onNextBoundary && onNextBoundary(),
            title: "Next",
            "aria-label": "Next entry"
          },
          "\u203A"
        )), /* @__PURE__ */ React.createElement(
          NavButtons,
          {
            onSettings,
            onHistory,
            onSearch,
            theme,
            onThemeChange,
            reading: true,
            chapterBookmark: entry ? { hlKey: "wtlb:" + entry.id, label: entry.title || (partLabel ? partLabel + " \u2014 Entry " + entry.num : "Bookmark") } : null,
            hlTick
          }
        ))
      },
      /* @__PURE__ */ React.createElement(
        StickyChapterNav,
        {
          onPrev: () => prevEntry ? onNavigate(prevEntry.id) : onPrevBoundary && onPrevBoundary(),
          onNext: () => nextEntry ? onNavigate(nextEntry.id) : onNextBoundary && onNextBoundary(),
          prevDisabled: !prevEntry && !prevBoundary,
          nextDisabled: !nextEntry && !nextBoundary,
          prevLabel: "Previous entry",
          nextLabel: "Next entry"
        }
      ),
      backHint && /* @__PURE__ */ React.createElement("div", { className: "back-hint-row" }, /* @__PURE__ */ React.createElement("button", { className: "back-hint-pill", onClick: onBack, "aria-label": "Back to source letter" }, /* @__PURE__ */ React.createElement("span", { className: "back-hint-arrow" }, "\u2039"), "Back to", " ", /* @__PURE__ */ React.createElement("span", { className: "back-hint-title" }, backHint.volumeLabel ? `${backHint.volumeLabel} \xB7 ${backHint.title}` : backHint.title))),
      /* @__PURE__ */ React.createElement("header", { className: "hero" }, /* @__PURE__ */ React.createElement("div", { className: "hero-bg vol" }), /* @__PURE__ */ React.createElement("div", { className: "hero-content" }, /* @__PURE__ */ React.createElement("div", { className: "hero-eyebrow" }, partLabel, " ", "\xA0\xB7\xA0", " ", entry.num), /* @__PURE__ */ React.createElement("h1", { className: "hero-title" }, entry.title), /* @__PURE__ */ React.createElement("div", { className: "hero-ornament" }, /* @__PURE__ */ React.createElement("div", { className: "hero-ornament-line" }), /* @__PURE__ */ React.createElement("div", { className: "hero-ornament-diamond" }), /* @__PURE__ */ React.createElement("div", { className: "hero-ornament-line r" })))),
      /* @__PURE__ */ React.createElement("div", { className: "page-wrapper" }, /* @__PURE__ */ React.createElement("div", { className: "content-layout" }, /* @__PURE__ */ React.createElement("main", { className: "letter-body", ref: wtlbMainRef }, entry.paragraphs.map((p, pi) => {
        const paraRefs = refAnalysis.perParagraph[pi] || [];
        let refCursor = 0;
        const consumeRef = () => paraRefs[refCursor++];
        return /* @__PURE__ */ React.createElement(
          "p",
          {
            key: entry.id + ":" + pi,
            style: { textAlign: p.align },
            className: p.align === "center" ? "letter-poetry" : "letter-para",
            "data-hl-key": wtlbHlKey(entry.id, pi),
            "data-hl-dom": true
          },
          /* @__PURE__ */ React.createElement(StaticSubtree, null, p.text.split("\n").map((line, li, arr) => /* @__PURE__ */ React.createElement(React.Fragment, { key: li }, renderLine(line, consumeRef), li < arr.length - 1 && /* @__PURE__ */ React.createElement("br", null))))
        );
      }), /* @__PURE__ */ React.createElement("div", { className: "reading-end" }), footnotesMode && refAnalysis.orderedRefs.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "footnote-list wtlb-footnote-list" }, /* @__PURE__ */ React.createElement("div", { className: "footnote-list-header" }, "Footnotes"), refAnalysis.orderedRefs.map((ref) => {
        const num = refAnalysis.refNumMap[ref];
        const verseText = lookupVerse(ref);
        return /* @__PURE__ */ React.createElement("div", { key: ref, id: `wtlb-fn-${entry.id}-${num}`, className: `footnote-list-item${highlightedFn === num ? " pulse" : ""}` }, /* @__PURE__ */ React.createElement("div", { className: "footnote-list-num" }, num, "."), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "footnote-list-ref" }, ref), verseText && /* @__PURE__ */ React.createElement(ExpandableVerse, { text: verseText, refStr: ref })));
      })), /* @__PURE__ */ React.createElement("div", { className: "ornament-divider" }, /* @__PURE__ */ React.createElement("div", { className: "ornament-divider-line" }), /* @__PURE__ */ React.createElement("div", { className: "ornament-divider-symbol" }, "\u2726"), /* @__PURE__ */ React.createElement("div", { className: "ornament-divider-line" })), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav" }, prevEntry ? /* @__PURE__ */ React.createElement("button", { className: "bottom-nav-card", onClick: () => onNavigate(prevEntry.id) }, /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-label" }, "\u2039 Previous"), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-title" }, prevEntry.title)) : prevBoundary ? /* @__PURE__ */ React.createElement("button", { className: "bottom-nav-card", onClick: onPrevBoundary }, /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-label" }, prevBoundary.short ? `\u2039 Previous \xB7 ${prevBoundary.short}` : "\u2039 Previous"), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-title" }, prevBoundary.title)) : /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-card placeholder" }, /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-label" }, "\u2039 Previous"), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-title" }, "\u2014")), nextEntry ? /* @__PURE__ */ React.createElement("button", { className: "bottom-nav-card next", onClick: () => onNavigate(nextEntry.id) }, /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-label" }, "Next \u203A"), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-title" }, nextEntry.title)) : nextBoundary ? /* @__PURE__ */ React.createElement("button", { className: "bottom-nav-card next", onClick: onNextBoundary }, /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-label" }, nextBoundary.short ? `Next \xB7 ${nextBoundary.short} \u203A` : "Next \u203A"), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-title" }, nextBoundary.title)) : /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-card next placeholder" }, /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-label" }, "Next \u203A"), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-title" }, "\u2014")))))),
      /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: `fn-sheet-backdrop${scriptureRef ? " open" : ""}`, onClick: () => setScriptureRef(null) }), /* @__PURE__ */ React.createElement("div", { className: `fn-sheet${scriptureRef ? " open" : ""}` }, /* @__PURE__ */ React.createElement("div", { className: "fn-sheet-handle" }), scriptureRef && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { className: "sc-sheet-tag" }, "Scripture Reference"), /* @__PURE__ */ React.createElement("span", { className: "sc-sheet-cite" }, scriptureRef), scriptureText ? /* @__PURE__ */ React.createElement("div", { className: "sc-sheet-verse" }, /* @__PURE__ */ React.createElement(ScriptureVerseText, { text: scriptureText, cite: scriptureRef })) : /* @__PURE__ */ React.createElement("div", { className: "sc-sheet-verse", style: { color: "var(--cream-dim)", fontStyle: "italic" } }, "Verse text not available in app data"))))
    );
  }

  // app/src/main/assets/src/ui/screens/BibleChapterView.jsx
  function BibleChapterView2({ book, chapter, onIndex, onNavigate, prevBook, nextBook, onPrevBook, onNextBook, nextBoundaryTitle, prevBoundaryTitle, onSearch, onSettings, onHistory, theme, onThemeChange, surpriseAnchor, onMarkRead, markAsReadEnabled, showProgressBar, translation, restoredNames, showChapterTitle, showSectionHeadings, titleFocusHidden, setTitleFocusHidden, headingsFocusHidden, setHeadingsFocusHidden, hlTick, onLinkOpen, backHint, onTapThroughBack }) {
    const [highlightedVerses, setHighlightedVerses] = React.useState([]);
    const restoredCh = restoredNames && typeof BOOKS_RESTORED !== "undefined" && BOOKS_RESTORED[book.id] && BOOKS_RESTORED[book.id].chapters.find((c) => c.num === chapter.num) || null;
    const displayChapterTitle = restoredCh && restoredCh.title || chapter.title;
    const getSectionHeading = (si, sec) => {
      if (restoredCh && restoredCh.sections && restoredCh.sections[si] && restoredCh.sections[si].heading) {
        return restoredCh.sections[si].heading;
      }
      return sec.heading;
    };
    React.useEffect(() => {
      if (!surpriseAnchor || surpriseAnchor.type !== "verse") return;
      const vs = surpriseAnchor.verses;
      setHighlightedVerses(vs);
      const timer = setTimeout(() => {
        const el = document.getElementById(`v-${vs[0]}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
      const fadeTimer = setTimeout(() => setHighlightedVerses([]), 4e3);
      return () => {
        clearTimeout(timer);
        clearTimeout(fadeTimer);
      };
    }, [surpriseAnchor]);
    const prevCh = book.chapters.find((c) => c.num === chapter.num - 1);
    const nextCh = book.chapters.find((c) => c.num === chapter.num + 1);
    useMarkAsRead(markAsReadEnabled, onMarkRead);
    return /* @__PURE__ */ React.createElement(
      ScreenLayout,
      {
        showProgress: showProgressBar,
        navChildren: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "nav-home nav-back-icon", onClick: onIndex, title: `\u2190 ${book.title}`, "aria-label": `Back to ${book.title}` }, "\u2039"), /* @__PURE__ */ React.createElement(HomeBtn, null), /* @__PURE__ */ React.createElement("div", { className: "nav-arrows" }, /* @__PURE__ */ React.createElement(
          "button",
          {
            className: "nav-arrow-btn",
            disabled: !prevCh && !prevBook,
            onClick: () => prevCh ? onNavigate(prevCh.num) : onPrevBook && onPrevBook(),
            title: "Previous",
            "aria-label": "Previous chapter"
          },
          "\u2039"
        ), /* @__PURE__ */ React.createElement(
          "button",
          {
            className: "nav-arrow-btn",
            disabled: !nextCh && !nextBook,
            onClick: () => nextCh ? onNavigate(nextCh.num) : onNextBook && onNextBook(),
            title: "Next",
            "aria-label": "Next chapter"
          },
          "\u203A"
        )), /* @__PURE__ */ React.createElement(
          NavButtons,
          {
            onSettings,
            onHistory,
            onSearch,
            theme,
            onThemeChange,
            reading: true,
            chapterBookmark: book && chapter ? { hlKey: "bible:" + book.id + ":" + chapter.num, label: (book.title || book.id) + " " + chapter.num } : null,
            journalRefKey: book && chapter && typeof jrnRefKeyForChapter === "function" ? jrnRefKeyForChapter(book.id, chapter.num) : null,
            journalRefLabel: book && chapter ? (book.title || book.id) + " " + chapter.num : null,
            hlTick
          }
        ))
      },
      /* @__PURE__ */ React.createElement(
        StickyChapterNav,
        {
          onPrev: () => prevCh ? onNavigate(prevCh.num) : onPrevBook && onPrevBook(),
          onNext: () => nextCh ? onNavigate(nextCh.num) : onNextBook && onNextBook(),
          prevDisabled: !prevCh && !prevBook,
          nextDisabled: !nextCh && !nextBook,
          prevLabel: "Previous chapter",
          nextLabel: "Next chapter"
        }
      ),
      backHint && /* @__PURE__ */ React.createElement("div", { className: "back-hint-row" }, /* @__PURE__ */ React.createElement("button", { className: "back-hint-pill", onClick: onTapThroughBack, "aria-label": "Back to source" }, /* @__PURE__ */ React.createElement("span", { className: "back-hint-arrow" }, "\u2039"), "Back to", " ", /* @__PURE__ */ React.createElement("span", { className: "back-hint-title" }, backHint.volumeLabel ? `${backHint.volumeLabel} \xB7 ${backHint.title}` : backHint.title))),
      (() => {
        const titleEffective = showChapterTitle && !titleFocusHidden;
        const canFocusTitle = showChapterTitle && displayChapterTitle;
        const hasCuratedTitle = !!displayChapterTitle;
        const titleText = titleEffective && hasCuratedTitle ? displayChapterTitle : book.subtitle;
        const titleIsTappable = titleEffective && hasCuratedTitle;
        return /* @__PURE__ */ React.createElement("header", { className: "hero" }, /* @__PURE__ */ React.createElement("div", { className: `hero-bg${OT_BOOK_IDS.has(book.id) ? " ot" : ""}` }), /* @__PURE__ */ React.createElement("div", { className: "hero-content" }, /* @__PURE__ */ React.createElement("div", { className: "hero-eyebrow" }, book.title, " ", "\xA0\xB7\xA0", " Chapter ", chapter.num), /* @__PURE__ */ React.createElement(
          "h1",
          {
            className: `hero-title${titleIsTappable ? " hero-title-tappable" : ""}`,
            onClick: titleIsTappable ? () => setTitleFocusHidden && setTitleFocusHidden(true) : void 0,
            title: titleIsTappable ? "Tap to hide chapter title" : void 0,
            role: titleIsTappable ? "button" : void 0
          },
          titleText
        ), canFocusTitle && titleFocusHidden && /* @__PURE__ */ React.createElement(
          "button",
          {
            className: "hero-subtitle-restore",
            onClick: () => setTitleFocusHidden && setTitleFocusHidden(false),
            title: "Show chapter title",
            "aria-label": "Show chapter title"
          },
          "+ Show chapter title"
        ), /* @__PURE__ */ React.createElement("div", { className: "hero-ornament" }, /* @__PURE__ */ React.createElement("div", { className: "hero-ornament-line" }), /* @__PURE__ */ React.createElement("div", { className: "hero-ornament-diamond" }), /* @__PURE__ */ React.createElement("div", { className: "hero-ornament-line r" }))));
      })(),
      /* @__PURE__ */ React.createElement("div", { className: "page-wrapper" }, /* @__PURE__ */ React.createElement("div", { className: "chapter-body" }, showSectionHeadings && headingsFocusHidden && chapter.sections.some((s) => s.heading || s.letter) && /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "hero-subtitle-restore headings-restore",
          onClick: () => setHeadingsFocusHidden && setHeadingsFocusHidden(false),
          title: "Show section headings",
          "aria-label": "Show section headings"
        },
        "+ Show section headings"
      ), (() => {
        const POETIC_BOOKS = /* @__PURE__ */ new Set(["psalms", "proverbs", "songofsolomon", "lamentations", "ecclesiastes"]);
        const isPoetry = POETIC_BOOKS.has(book.id);
        const headingsVisible = showSectionHeadings && !headingsFocusHidden;
        const renderVerse = (v, vi) => {
          const vHlKey = bibleHlKey(book.id, chapter.num, v.n);
          const vText = translateVerse(book.id, chapter.num, v, translation);
          return /* @__PURE__ */ React.createElement("span", { key: vi, id: `v-${v.n}`, className: `verse${highlightedVerses.includes(v.n) ? " verse-surprise" : ""}` }, /* @__PURE__ */ React.createElement("span", { className: "verse-num" }, v.n), /* @__PURE__ */ React.createElement(HighlightableText, { text: vText, hlKey: vHlKey, hlTick }), /* @__PURE__ */ React.createElement(LinkIcon, { hlKey: vHlKey, hlTick, onClick: onLinkOpen }), /* @__PURE__ */ React.createElement(BookmarkIcon, { hlKey: vHlKey, hlTick }), " ");
        };
        if (!headingsVisible) {
          const allVerses = chapter.sections.flatMap((s) => s.verses);
          return /* @__PURE__ */ React.createElement("div", { className: `verses-block${isPoetry ? " is-poetry" : ""}` }, allVerses.map(renderVerse));
        }
        return chapter.sections.map((sec, si) => /* @__PURE__ */ React.createElement("div", { key: si, className: "section-block" }, sec.letter ? /* @__PURE__ */ React.createElement(
          "div",
          {
            className: "section-heading-psalm119 section-heading-tappable",
            onClick: () => setHeadingsFocusHidden && setHeadingsFocusHidden(true),
            title: "Tap to hide headings",
            role: "button"
          },
          /* @__PURE__ */ React.createElement("span", { className: "hebrew-letter" }, sec.letter),
          /* @__PURE__ */ React.createElement("span", { className: "hebrew-letter-name" }, getSectionHeading(si, sec))
        ) : sec.heading ? /* @__PURE__ */ React.createElement(
          "div",
          {
            className: "section-heading section-heading-tappable",
            onClick: () => setHeadingsFocusHidden && setHeadingsFocusHidden(true),
            title: "Tap to hide headings",
            role: "button"
          },
          getSectionHeading(si, sec)
        ) : null, /* @__PURE__ */ React.createElement("div", { className: `verses-block${isPoetry ? " is-poetry" : ""}` }, sec.verses.map(renderVerse))));
      })(), /* @__PURE__ */ React.createElement("div", { className: "reading-end" }), /* @__PURE__ */ React.createElement("div", { className: "ornament-divider" }, /* @__PURE__ */ React.createElement("div", { className: "ornament-divider-line" }), /* @__PURE__ */ React.createElement("div", { className: "ornament-divider-symbol" }, "\u2726"), /* @__PURE__ */ React.createElement("div", { className: "ornament-divider-line" })), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav" }, prevCh ? /* @__PURE__ */ React.createElement("button", { className: "bottom-nav-card", onClick: () => onNavigate(prevCh.num) }, /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-label" }, "\u2039 Previous"), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-title" }, book.title, " ", prevCh.num)) : prevBook ? /* @__PURE__ */ React.createElement("button", { className: "bottom-nav-card", onClick: onPrevBook }, /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-label" }, "\u2039 Previous Book"), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-title" }, prevBoundaryTitle || `${prevBook.title} ${prevBook.chapters[prevBook.chapters.length - 1].num}`)) : /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-card placeholder" }, /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-label" }, "\u2039 Previous"), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-title" }, "\u2014")), nextCh ? /* @__PURE__ */ React.createElement("button", { className: "bottom-nav-card next", onClick: () => onNavigate(nextCh.num) }, /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-label" }, "Next \u203A"), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-title" }, book.title, " ", nextCh.num)) : nextBook ? /* @__PURE__ */ React.createElement("button", { className: "bottom-nav-card next", onClick: onNextBook }, /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-label" }, "Next Book \u203A"), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-title" }, nextBoundaryTitle || `${nextBook.title} 1`)) : /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-card next placeholder" }, /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-label" }, "Next \u203A"), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-title" }, "\u2014")))))
    );
  }

  // app/src/main/assets/src/ui/screens/ChapterView.jsx
  function ChapterView2({ book, chapter, mode, showStudy, showEchoes, showChapterTitle, titleFocusHidden, setTitleFocusHidden, onIndex, onNavigate, prevBoundary, onPrevBoundary, nextBoundary, onNextBoundary, onSearch, onSettings, onHistory, theme, onThemeChange, surpriseAnchor, onMarkRead, markAsReadEnabled, showProgressBar, onVotLetterClick, hlTick, onLinkOpen, backHint, onTapThroughBack }) {
    const [activeScripRef, setActiveScripRef] = React.useState(null);
    const [highlightedVerses, setHighlightedVerses] = React.useState([]);
    React.useEffect(() => {
      if (!activeScripRef) return;
      var prev = window.__closeSheet;
      window.__closeSheet = () => setActiveScripRef(null);
      return () => {
        window.__closeSheet = prev || null;
      };
    }, [activeScripRef]);
    React.useEffect(() => {
      if (!surpriseAnchor || surpriseAnchor.type !== "verse") return;
      const vs = surpriseAnchor.verses;
      setHighlightedVerses(vs);
      const timer = setTimeout(() => {
        const el = document.getElementById(`v-${vs[0]}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
      const fadeTimer = setTimeout(() => setHighlightedVerses([]), 4e3);
      return () => {
        clearTimeout(timer);
        clearTimeout(fadeTimer);
      };
    }, [surpriseAnchor]);
    const prevCh = book.chapters.find((c) => c.num === chapter.num - 1);
    const nextCh = book.chapters.find((c) => c.num === chapter.num + 1);
    const verses = chapter.verses || [];
    useMarkAsRead(markAsReadEnabled, onMarkRead);
    const hasLinks = chapter.links && chapter.links.length > 0;
    return /* @__PURE__ */ React.createElement(
      ScreenLayout,
      {
        showProgress: showProgressBar,
        navChildren: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "nav-home nav-back-icon", onClick: onIndex, title: `\u2190 ${book.title}`, "aria-label": `Back to ${book.title}` }, "\u2039"), /* @__PURE__ */ React.createElement(HomeBtn, null), /* @__PURE__ */ React.createElement("div", { className: "nav-arrows" }, /* @__PURE__ */ React.createElement(
          "button",
          {
            className: "nav-arrow-btn",
            disabled: !prevCh && !prevBoundary,
            onClick: () => prevCh ? onNavigate(prevCh.num) : onPrevBoundary && onPrevBoundary(),
            title: "Previous",
            "aria-label": "Previous chapter"
          },
          "\u2039"
        ), /* @__PURE__ */ React.createElement(
          "button",
          {
            className: "nav-arrow-btn",
            disabled: !nextCh && !nextBoundary,
            onClick: () => nextCh ? onNavigate(nextCh.num) : onNextBoundary && onNextBoundary(),
            title: "Next",
            "aria-label": "Next chapter"
          },
          "\u203A"
        )), /* @__PURE__ */ React.createElement(
          NavButtons,
          {
            onSettings,
            onHistory,
            onSearch,
            theme,
            onThemeChange,
            reading: true,
            chapterBookmark: chapter ? { hlKey: "study:matthew-" + chapter.num, label: "Matthew " + chapter.num + " (Study)" } : null,
            hlTick
          }
        ))
      },
      /* @__PURE__ */ React.createElement(
        StickyChapterNav,
        {
          onPrev: () => prevCh ? onNavigate(prevCh.num) : onPrevBoundary && onPrevBoundary(),
          onNext: () => nextCh ? onNavigate(nextCh.num) : onNextBoundary && onNextBoundary(),
          prevDisabled: !prevCh && !prevBoundary,
          nextDisabled: !nextCh && !nextBoundary,
          prevLabel: "Previous chapter",
          nextLabel: "Next chapter"
        }
      ),
      backHint && /* @__PURE__ */ React.createElement("div", { className: "back-hint-row" }, /* @__PURE__ */ React.createElement("button", { className: "back-hint-pill", onClick: onTapThroughBack, "aria-label": "Back to source" }, /* @__PURE__ */ React.createElement("span", { className: "back-hint-arrow" }, "\u2039"), "Back to", " ", /* @__PURE__ */ React.createElement("span", { className: "back-hint-title" }, backHint.volumeLabel ? `${backHint.volumeLabel} \xB7 ${backHint.title}` : backHint.title))),
      /* @__PURE__ */ React.createElement("header", { className: "hero" }, /* @__PURE__ */ React.createElement("div", { className: "hero-bg" }), /* @__PURE__ */ React.createElement("div", { className: "hero-content" }, /* @__PURE__ */ React.createElement("div", { className: "hero-eyebrow" }, "Matthew ", "\xA0\xB7\xA0", " Chapter ", chapter.num), /* @__PURE__ */ React.createElement("h1", { className: "hero-title" }, "Chapter ", chapter.num), chapter.title && showChapterTitle && (!titleFocusHidden ? /* @__PURE__ */ React.createElement(
        "div",
        {
          className: "hero-subtitle hero-subtitle-tappable",
          onClick: () => setTitleFocusHidden && setTitleFocusHidden(true),
          title: "Tap to hide summary",
          role: "button"
        },
        chapter.title
      ) : /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "hero-subtitle-restore",
          onClick: () => setTitleFocusHidden && setTitleFocusHidden(false),
          title: "Show summary",
          "aria-label": "Show chapter summary"
        },
        "+ Show summary"
      )), /* @__PURE__ */ React.createElement("div", { className: "hero-ornament" }, /* @__PURE__ */ React.createElement("div", { className: "hero-ornament-line" }), /* @__PURE__ */ React.createElement("div", { className: "hero-ornament-diamond" }), /* @__PURE__ */ React.createElement("div", { className: "hero-ornament-line r" })))),
      /* @__PURE__ */ React.createElement("div", { className: "page-wrapper" }, /* @__PURE__ */ React.createElement("div", { className: "chapter-body" }, mode === "pdf" ? (
        /* ── PDF MODE: clean flowing verse text + study panels below ── */
        /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "verses-block" }, verses.map((v, vi) => {
          const vHlKey = studyHlKey(book.id + "-" + chapter.num, v.n);
          return /* @__PURE__ */ React.createElement("span", { key: vi, id: `v-${v.n}`, className: `verse${highlightedVerses.includes(v.n) ? " verse-surprise" : ""}` }, /* @__PURE__ */ React.createElement("span", { className: "verse-num" }, v.n), /* @__PURE__ */ React.createElement(HighlightableText, { text: v.text, hlKey: vHlKey, hlTick: typeof hlTick !== "undefined" ? hlTick : 0 }), /* @__PURE__ */ React.createElement(LinkIcon, { hlKey: vHlKey, hlTick, onClick: onLinkOpen }), /* @__PURE__ */ React.createElement(BookmarkIcon, { hlKey: vHlKey, hlTick }), " ");
        })), showStudy && /* @__PURE__ */ React.createElement(
          StudyPanels,
          {
            scriptures: chapter.scriptures || [],
            votNotes: chapter.votNotes || [],
            onScriptureClick: setActiveScripRef,
            onVotLetterClick
          }
        ))
      ) : (
        /* ── INLINE MODE: notes after each verse ── */
        /* @__PURE__ */ React.createElement("div", { className: "verses-inline" }, verses.map((v, vi) => {
          const { scriptures, votNotes } = getNotesForVerse(chapter, v.n);
          const echoes = showEchoes ? getEchoesForVerse(chapter, v.n) : { scriptures: [], votNotes: [] };
          const hasEchoes = echoes.scriptures.length > 0 || echoes.votNotes.length > 0;
          const vHlKey = studyHlKey(book.id + "-" + chapter.num, v.n);
          return /* @__PURE__ */ React.createElement("div", { key: vi, id: `v-${v.n}`, className: `verse-row${highlightedVerses.includes(v.n) ? " verse-surprise" : ""}` }, /* @__PURE__ */ React.createElement("div", { className: "verse-line" }, /* @__PURE__ */ React.createElement("span", { className: "verse-num" }, v.n), /* @__PURE__ */ React.createElement(HighlightableText, { text: v.text, hlKey: vHlKey, hlTick: typeof hlTick !== "undefined" ? hlTick : 0 }), /* @__PURE__ */ React.createElement(LinkIcon, { hlKey: vHlKey, hlTick, onClick: onLinkOpen }), /* @__PURE__ */ React.createElement(BookmarkIcon, { hlKey: vHlKey, hlTick })), showStudy && (scriptures.length > 0 || votNotes.length > 0) && /* @__PURE__ */ React.createElement(InlineNotes, { scriptures, votNotes, onScriptureClick: setActiveScripRef, onVotLetterClick }), showStudy && hasEchoes && /* @__PURE__ */ React.createElement(InlineEcho, { scriptures: echoes.scriptures, votNotes: echoes.votNotes }));
        }))
      ), /* @__PURE__ */ React.createElement("div", { className: "reading-end" }), showStudy && hasLinks && /* @__PURE__ */ React.createElement("div", { className: "study-panel-group", style: { marginTop: "2rem" } }, /* @__PURE__ */ React.createElement("div", { className: "study-panel-group-title" }, "Further Study"), /* @__PURE__ */ React.createElement("div", { className: "study-links" }, chapter.links.map((link, i) => /* @__PURE__ */ React.createElement("a", { key: i, href: link.url, target: "_blank", rel: "noopener noreferrer", className: "study-link" }, link.label)))), /* @__PURE__ */ React.createElement("div", { className: "ornament-divider" }, /* @__PURE__ */ React.createElement("div", { className: "ornament-divider-line" }), /* @__PURE__ */ React.createElement("div", { className: "ornament-divider-symbol" }, "\u2726"), /* @__PURE__ */ React.createElement("div", { className: "ornament-divider-line" })), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav" }, prevCh ? /* @__PURE__ */ React.createElement("button", { className: "bottom-nav-card", onClick: () => onNavigate(prevCh.num) }, /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-label" }, "\u2039 Previous"), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-title" }, "Matthew ", prevCh.num)) : prevBoundary ? /* @__PURE__ */ React.createElement("button", { className: "bottom-nav-card", onClick: onPrevBoundary }, /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-label" }, "\u2039 Previous Book"), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-title" }, prevBoundary.title)) : /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-card placeholder" }, /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-label" }, "\u2039 Previous"), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-title" }, "\u2014")), nextCh ? /* @__PURE__ */ React.createElement("button", { className: "bottom-nav-card next", onClick: () => onNavigate(nextCh.num) }, /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-label" }, "Next \u203A"), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-title" }, "Matthew ", nextCh.num)) : nextBoundary ? /* @__PURE__ */ React.createElement("button", { className: "bottom-nav-card next", onClick: onNextBoundary }, /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-label" }, "Next Book \u203A"), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-title" }, nextBoundary.title)) : /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-card next placeholder" }, /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-label" }, "Next \u203A"), /* @__PURE__ */ React.createElement("div", { className: "bottom-nav-title" }, "\u2014"))))),
      /* @__PURE__ */ React.createElement(ScriptureSheet, { activeRef: activeScripRef, onClose: () => setActiveScripRef(null) })
    );
  }

  // app/src/main/assets/src/ui/screens/LibraryScreen.jsx
  function LibraryScreen2({ onBack, onOpenNotes, onOpenLinks, onOpenBookmarks, onOpenJournal, onOpenHighlights, hlTick, theme, onThemeChange, onSearch, onHistory, onSettings, historyEnabled: _historyEnabled }) {
    const noteCount = React.useMemo(() => NoteStore.count(), [hlTick]);
    const linkCount = React.useMemo(() => LinkStore.all().length, [hlTick]);
    const bookmarkCount = React.useMemo(() => typeof BookmarkStore !== "undefined" ? BookmarkStore.count() : 0, [hlTick]);
    const journalCount = React.useMemo(() => typeof JournalStore !== "undefined" ? JournalStore.count() : 0, [hlTick]);
    const highlightCount = React.useMemo(() => {
      if (typeof AnnotationStore === "undefined") return 0;
      const data = AnnotationStore.all() || {};
      const seen = {};
      Object.keys(data).forEach((k) => (data[k] || []).forEach((a) => {
        if (a.kind === "highlight" || a.kind === "underline") seen[a.groupId || a.id] = 1;
      }));
      return Object.keys(seen).length;
    }, [hlTick]);
    const noteDetail = noteCount === 0 ? "No notes yet" : noteCount + (noteCount === 1 ? " note" : " notes");
    const linkDetail = linkCount === 0 ? "No links yet" : linkCount + (linkCount === 1 ? " link" : " links");
    const tiles = [
      {
        id: "notes",
        eyebrow: "My Notes",
        title: "Notes",
        detail: noteDetail,
        onClick: onOpenNotes,
        icon: /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24" }, /* @__PURE__ */ React.createElement("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }), /* @__PURE__ */ React.createElement("polyline", { points: "14 2 14 8 20 8" }), /* @__PURE__ */ React.createElement("line", { x1: "8", y1: "13", x2: "16", y2: "13" }), /* @__PURE__ */ React.createElement("line", { x1: "8", y1: "17", x2: "16", y2: "17" }))
      },
      {
        id: "links",
        eyebrow: "My Links",
        title: "Links",
        detail: linkDetail,
        onClick: onOpenLinks,
        icon: /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24" }, /* @__PURE__ */ React.createElement("path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }), /* @__PURE__ */ React.createElement("path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" }))
      },
      {
        id: "journal",
        eyebrow: "My Journal",
        title: "Journal",
        detail: journalCount === 0 ? "No entries yet" : journalCount + (journalCount === 1 ? " entry" : " entries"),
        onClick: onOpenJournal,
        icon: /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24" }, /* @__PURE__ */ React.createElement("path", { d: "M19 4H8a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h11z" }), /* @__PURE__ */ React.createElement("line", { x1: "9", y1: "9", x2: "16", y2: "9" }), /* @__PURE__ */ React.createElement("line", { x1: "9", y1: "13", x2: "16", y2: "13" }))
      },
      {
        id: "bookmarks",
        eyebrow: "My Bookmarks",
        title: "Bookmarks",
        detail: bookmarkCount === 0 ? "No bookmarks yet" : bookmarkCount + (bookmarkCount === 1 ? " bookmark" : " bookmarks"),
        onClick: onOpenBookmarks,
        icon: /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24" }, /* @__PURE__ */ React.createElement("path", { d: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" }))
      },
      {
        id: "highlights",
        eyebrow: "My Marks",
        title: "Highlights & Underlines",
        detail: highlightCount === 0 ? "No marks yet" : highlightCount + (highlightCount === 1 ? " mark" : " marks"),
        onClick: onOpenHighlights,
        icon: /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24" }, /* @__PURE__ */ React.createElement("path", { d: "M9 11l-4 4 4 4 11-11-4-4-7 7" }), /* @__PURE__ */ React.createElement("line", { x1: "13", y1: "7", x2: "17", y2: "11" }))
      }
    ];
    return /* @__PURE__ */ React.createElement(
      ScreenLayout,
      {
        navChildren: LibraryNav({ onBack, onSearch, onHistory, onSettings, theme, onThemeChange })
      },
      /* @__PURE__ */ React.createElement("div", { className: "library-screen" }, /* @__PURE__ */ React.createElement("div", { className: "library-eyebrow" }, "Personal Study"), /* @__PURE__ */ React.createElement("h1", { className: "library-title" }, "Library"), /* @__PURE__ */ React.createElement("p", { className: "library-sub" }, "Your collected notes, reflections, and saved passages."), /* @__PURE__ */ React.createElement("div", { className: "library-grid" }, tiles.map((t) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: t.id,
          className: "library-tile" + (t.placeholder ? " placeholder" : ""),
          onClick: t.placeholder ? void 0 : t.onClick,
          disabled: t.placeholder
        },
        /* @__PURE__ */ React.createElement("span", { className: "library-tile-icon" }, t.icon),
        /* @__PURE__ */ React.createElement("span", { className: "library-tile-eyebrow" }, t.eyebrow),
        /* @__PURE__ */ React.createElement("span", { className: "library-tile-title" }, t.title),
        /* @__PURE__ */ React.createElement("span", { className: "library-tile-detail" }, t.detail),
        !t.placeholder && /* @__PURE__ */ React.createElement("span", { className: "library-tile-arrow" }, "\u203A")
      ))))
    );
  }

  // app/src/main/assets/src/ui/screens/NotesIndexScreen.jsx
  function NotesIndexScreen2({ onBack, onHome: _onHome, onOpenNote, onNavigateToSource, hlTick, setHlTick, theme, onThemeChange, onSearch, onHistory, onSettings, historyEnabled: _historyEnabled }) {
    const allNotes = React.useMemo(() => NoteStore.list(), [hlTick]);
    const notebooks = React.useMemo(() => NotebookStore.list(), [hlTick]);
    const _notesRet = typeof window !== "undefined" && window.__notesReturnCtx || null;
    const [tab, setTab] = React.useState(_notesRet && _notesRet.tab || "notebooks");
    const [drilledNbId, setDrilledNbId] = React.useState(_notesRet && _notesRet.drilledNbId || null);
    React.useEffect(() => {
      if (typeof window !== "undefined" && window.__notesReturnCtx) window.__notesReturnCtx = null;
    }, []);
    const [newNbInline, setNewNbInline] = React.useState(false);
    const [newNbName, setNewNbName] = React.useState("");
    const [renaming, setRenaming] = React.useState(false);
    const [renameValue, setRenameValue] = React.useState("");
    const [confirmDeleteNb, setConfirmDeleteNb] = React.useState(false);
    const [allNotesSort, setAllNotesSort] = React.useState("newest");
    const [drilledSort, setDrilledSort] = React.useState("newest");
    const currentSourceTitle = () => {
      if (drilledNbId === "uncategorized") return "Uncategorized";
      if (drilledNbId) {
        const nb = NotebookStore.get(drilledNbId);
        if (nb && nb.name) return nb.name;
      }
      return "My Notes";
    };
    const onRowTap = (note) => {
      const nav = noteSourceNav(note);
      if (nav) {
        window.__pendingOpenNote = note.groupId;
        window.__notesReturnCtx = { tab, drilledNbId };
        onNavigateToSource(nav, { sourceLetterTitle: currentSourceTitle() });
      } else {
        onOpenNote(note.groupId);
      }
    };
    const counts = React.useMemo(() => {
      const c = { __uncategorized: 0 };
      notebooks.forEach((nb) => {
        c[nb.id] = 0;
      });
      allNotes.forEach((n) => {
        const ids = n.notebookIds || [];
        if (ids.length === 0) c.__uncategorized++;
        else ids.forEach((id) => {
          if (id in c) c[id]++;
        });
      });
      return c;
    }, [allNotes, notebooks]);
    const sortList = (list, mode) => {
      const arr = [...list];
      arr.sort((a, b) => (b.updated || b.created || 0) - (a.updated || a.created || 0));
      if (mode === "oldest") arr.reverse();
      return arr;
    };
    const drilledNotes = React.useMemo(() => {
      if (!drilledNbId) return [];
      let list;
      if (drilledNbId === "uncategorized") {
        list = allNotes.filter((n) => !n.notebookIds || n.notebookIds.length === 0);
      } else {
        list = allNotes.filter((n) => (n.notebookIds || []).includes(drilledNbId));
      }
      return sortList(list, drilledSort);
    }, [allNotes, drilledNbId, drilledSort]);
    const allNotesSorted = React.useMemo(() => sortList(allNotes, allNotesSort), [allNotes, allNotesSort]);
    const createNotebook = () => {
      const trimmed = newNbName.trim();
      if (!trimmed) return;
      NotebookStore.add(trimmed);
      setHlTick((t) => t + 1);
      setNewNbName("");
      setNewNbInline(false);
    };
    const drilledNb = drilledNbId && drilledNbId !== "uncategorized" ? NotebookStore.get(drilledNbId) : null;
    const drilledTitle = drilledNbId === "uncategorized" ? "Uncategorized" : drilledNb ? drilledNb.name : "";
    const startRename = () => {
      if (!drilledNb) return;
      setRenameValue(drilledNb.name);
      setRenaming(true);
    };
    const commitRename = () => {
      const trimmed = renameValue.trim();
      if (trimmed && drilledNb) {
        NotebookStore.rename(drilledNb.id, trimmed);
        setHlTick((t) => t + 1);
      }
      setRenaming(false);
    };
    const deleteCurrent = () => {
      if (!drilledNb) return;
      NotebookStore.remove(drilledNb.id);
      setHlTick((t) => t + 1);
      setConfirmDeleteNb(false);
      setDrilledNbId(null);
    };
    return /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren: LibraryNav({ onBack, onSearch, onHistory, onSettings, theme, onThemeChange }) }, /* @__PURE__ */ React.createElement("div", { className: "notes-index-screen" }, /* @__PURE__ */ React.createElement("div", { className: "notes-index-header" }, /* @__PURE__ */ React.createElement("h1", { className: "notes-index-title" }, "My Notes"), /* @__PURE__ */ React.createElement("span", { className: "notes-index-count" }, allNotes.length, allNotes.length === 1 ? " note" : " notes")), !drilledNbId && /* @__PURE__ */ React.createElement("div", { className: "notes-tabs" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "notes-tab" + (tab === "notebooks" ? " active" : ""),
        onClick: () => setTab("notebooks")
      },
      "Notebooks"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "notes-tab" + (tab === "all-notes" ? " active" : ""),
        onClick: () => setTab("all-notes")
      },
      "All Notes"
    )), drilledNbId && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "nb-drilled-header" }, /* @__PURE__ */ React.createElement("button", { className: "nb-drilled-back", onClick: () => {
      setDrilledNbId(null);
      setRenaming(false);
      setConfirmDeleteNb(false);
    }, title: "Back to Notebooks", "aria-label": "Back to Notebooks" }, "\u2039"), renaming ? /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "nb-drilled-rename",
        autoFocus: true,
        type: "text",
        value: renameValue,
        onChange: (e) => setRenameValue(e.target.value),
        onKeyDown: (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitRename();
          } else if (e.key === "Escape") setRenaming(false);
        },
        maxLength: 60
      }
    ) : /* @__PURE__ */ React.createElement("span", { className: "nb-drilled-title" }, drilledTitle), renaming ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "nb-drilled-action", onClick: commitRename, title: "Save name" }, "Save"), /* @__PURE__ */ React.createElement("button", { className: "nb-drilled-action", onClick: () => setRenaming(false), title: "Cancel rename" }, "Cancel")) : drilledNb && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "nb-drilled-action", onClick: startRename, title: "Rename notebook" }, "Rename"), /* @__PURE__ */ React.createElement("button", { className: "nb-drilled-action danger", onClick: () => setConfirmDeleteNb(true), title: "Delete notebook" }, "Delete"))), confirmDeleteNb && /* @__PURE__ */ React.createElement("div", { className: "ann-chip-confirm", style: { padding: "10px 12px", marginBottom: "0.8rem" } }, /* @__PURE__ */ React.createElement("span", { className: "ann-chip-confirm-q" }, "Delete \u201C", drilledTitle, "\u201D? Notes will move to Uncategorized."), /* @__PURE__ */ React.createElement("button", { className: "ann-chip-confirm-btn ann-chip-confirm-cancel", onClick: () => setConfirmDeleteNb(false) }, "Cancel"), /* @__PURE__ */ React.createElement("button", { className: "ann-chip-confirm-btn ann-chip-confirm-yes", onClick: deleteCurrent }, "Yes, delete")), drilledNotes.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "notes-index-controls" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "notes-index-sort-btn",
        onClick: () => setDrilledSort((s) => s === "newest" ? "oldest" : "newest"),
        style: { marginLeft: "auto" },
        title: "Toggle sort order"
      },
      drilledSort === "newest" ? "Sort: Newest \u2193" : "Sort: Oldest \u2191"
    )), drilledNotes.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "notes-empty" }, /* @__PURE__ */ React.createElement("div", { className: "notes-empty-title" }, "Nothing here yet"), /* @__PURE__ */ React.createElement("div", { className: "notes-empty-hint" }, drilledNbId === "uncategorized" ? "Notes that aren't in any notebook will appear here." : "Add notes to this notebook from the \u22EF menu on any note.")) : /* @__PURE__ */ React.createElement("div", { className: "notes-index-list" }, drilledNotes.map((note) => /* @__PURE__ */ React.createElement(NoteRow, { key: note.groupId, note, onTap: onRowTap })))), !drilledNbId && tab === "notebooks" && /* @__PURE__ */ React.createElement("div", { className: "nb-card-grid" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "nb-card uncategorized",
        onClick: () => setDrilledNbId("uncategorized")
      },
      /* @__PURE__ */ React.createElement("span", { className: "nb-card-eyebrow" }, "Default"),
      /* @__PURE__ */ React.createElement("span", { className: "nb-card-name" }, "Uncategorized"),
      /* @__PURE__ */ React.createElement("span", { className: "nb-card-count" }, counts.__uncategorized, counts.__uncategorized === 1 ? " note" : " notes"),
      /* @__PURE__ */ React.createElement("span", { className: "nb-card-arrow" }, "\u203A")
    ), notebooks.map((nb) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key: nb.id,
        className: "nb-card",
        onClick: () => setDrilledNbId(nb.id)
      },
      /* @__PURE__ */ React.createElement("span", { className: "nb-card-eyebrow" }, "Notebook"),
      /* @__PURE__ */ React.createElement("span", { className: "nb-card-name" }, nb.name),
      /* @__PURE__ */ React.createElement("span", { className: "nb-card-count" }, counts[nb.id] || 0, (counts[nb.id] || 0) === 1 ? " note" : " notes"),
      /* @__PURE__ */ React.createElement("span", { className: "nb-card-arrow" }, "\u203A")
    )), newNbInline ? /* @__PURE__ */ React.createElement("div", { className: "nb-card", style: { cursor: "default" } }, /* @__PURE__ */ React.createElement("div", { className: "nb-card-create-form" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "nb-card-create-input",
        autoFocus: true,
        type: "text",
        placeholder: "Notebook name\u2026",
        value: newNbName,
        onChange: (e) => setNewNbName(e.target.value),
        onKeyDown: (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            createNotebook();
          } else if (e.key === "Escape") {
            setNewNbInline(false);
            setNewNbName("");
          }
        },
        maxLength: 60
      }
    ), /* @__PURE__ */ React.createElement("div", { className: "nb-card-create-actions" }, /* @__PURE__ */ React.createElement("button", { className: "note-sheet-secondary", onClick: () => {
      setNewNbInline(false);
      setNewNbName("");
    }, style: { padding: "7px 10px" } }, "Cancel"), /* @__PURE__ */ React.createElement("button", { className: "note-sheet-save" + (newNbName.trim() ? "" : " disabled"), onClick: createNotebook, disabled: !newNbName.trim(), style: { padding: "7px 10px" } }, "Create")))) : /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "nb-card new-notebook",
        onClick: () => setNewNbInline(true)
      },
      /* @__PURE__ */ React.createElement("span", { className: "nb-card-plus" }, "+"),
      /* @__PURE__ */ React.createElement("span", { className: "nb-card-name" }, "New Notebook")
    )), !drilledNbId && tab === "all-notes" && /* @__PURE__ */ React.createElement(React.Fragment, null, allNotes.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "notes-index-controls" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "notes-index-sort-btn",
        onClick: () => setAllNotesSort((s) => s === "newest" ? "oldest" : "newest"),
        style: { marginLeft: "auto" },
        title: "Toggle sort order"
      },
      allNotesSort === "newest" ? "Sort: Newest \u2193" : "Sort: Oldest \u2191"
    )), allNotes.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "notes-empty" }, /* @__PURE__ */ React.createElement("div", { className: "notes-empty-title" }, "No Notes Yet"), /* @__PURE__ */ React.createElement("div", { className: "notes-empty-hint" }, "Long-press text in any chapter, tap Note in the toolbar, and your notes will appear here.")) : /* @__PURE__ */ React.createElement("div", { className: "notes-index-list" }, allNotesSorted.map((note) => /* @__PURE__ */ React.createElement(NoteRow, { key: note.groupId, note, onTap: onRowTap }))))));
  }

  // app/src/main/assets/src/ui/screens/VolumesHome.jsx
  function VolumesHome2({ onSelect, onBack, onSearch, onHistory, onSettings, theme, onThemeChange }) {
    const collections = [
      { id: "lords-rebuke", title: "The Lord's Rebuke", sub: "Correction & Warning", locked: LETTERS_REBUKE.length === 0 },
      { id: "words-to-live-by-1", title: "Words To Live By: Part One", sub: `${WTLB_ONE.length} Entries \xB7 Words of Wisdom`, locked: false },
      { id: "words-to-live-by-2", title: "Words To Live By: Part Two", sub: `${WTLB_TWO.length} Entries \xB7 More Words of Wisdom`, locked: false },
      { id: "the-blessed", title: "The Blessed", sub: colLetterArr(COL_BY_KEY.get("blessed")).length > 0 ? `${colLetterArr(COL_BY_KEY.get("blessed")).length} Entries \xB7 Blessings & Promises` : "Blessings & Promises", locked: colLetterArr(COL_BY_KEY.get("blessed")).length === 0 },
      { id: "little-flock", title: "Letters to The Little Flock", sub: LETTERS_FLOCK.length > 0 ? `${LETTERS_FLOCK.length} Letters` : "Personal Instruction", locked: LETTERS_FLOCK.length === 0 },
      { id: "letters-timothy", title: "Letters from Timothy", sub: LETTERS_TIMOTHY.length > 0 ? `${LETTERS_TIMOTHY.length} Letters` : "A Servant's Pen", locked: LETTERS_TIMOTHY.length === 0 },
      { id: "holy-days", title: "Regarding The Holy Days", sub: colLetterArr(COL_BY_KEY.get("holydays")).length > 0 ? `${colLetterArr(COL_BY_KEY.get("holydays")).length} Letters \xB7 Appointed Times` : "Appointed Times", locked: colLetterArr(COL_BY_KEY.get("holydays")).length === 0 }
    ];
    const volumes = [
      { id: "volume-one", title: "Volume One", detail: `${LETTERS_V1.length} Letters`, sub: "2004 \u2013 2006", locked: false },
      { id: "volume-two", title: "Volume Two", detail: `${LETTERS.length} Letters`, sub: "2004 \u2013 2010", locked: false },
      { id: "volume-three", title: "Volume Three", detail: LETTERS_V3.length > 0 ? `${LETTERS_V3.length} Letters` : null, sub: "2006 \u2013 2010", locked: LETTERS_V3.length === 0 },
      { id: "volume-four", title: "Volume Four", detail: LETTERS_V4.length > 0 ? `${LETTERS_V4.length} Letters` : null, sub: "2010 \u2013 2011", locked: LETTERS_V4.length === 0 },
      { id: "volume-five", title: "Volume Five", detail: LETTERS_V5.length > 0 ? `${LETTERS_V5.length} Letters` : null, sub: "2011 \u2013 2014", locked: LETTERS_V5.length === 0 },
      { id: "volume-six", title: "Volume Six", detail: LETTERS_V6.length > 0 ? `${LETTERS_V6.length} Letters` : null, sub: "2011 \u2013 2014", locked: LETTERS_V6.length === 0 },
      { id: "volume-seven", title: "Volume Seven", detail: LETTERS_V7.length > 0 ? `${LETTERS_V7.length} Letters` : null, sub: "2005 \u2013 2014", locked: LETTERS_V7.length === 0 }
    ];
    return /* @__PURE__ */ React.createElement(
      ScreenLayout,
      {
        navChildren: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "nav-home", onClick: onBack }, "\u2190 Home"), /* @__PURE__ */ React.createElement(NavButtons, { onSettings, onHistory, onSearch, theme, onThemeChange }))
      },
      /* @__PURE__ */ React.createElement("div", { className: "home-screen volumes-landing" }, /* @__PURE__ */ React.createElement("div", { className: "home-eyebrow" }, "Prophetic Letters"), /* @__PURE__ */ React.createElement("h1", { className: "home-title" }, "The Volumes of Truth"), /* @__PURE__ */ React.createElement("p", { className: "home-sub" }, "Letters from The Lord, Our God and Savior"), /* @__PURE__ */ React.createElement("div", { className: "home-ornament" }, /* @__PURE__ */ React.createElement("div", { className: "home-ornament-line" }), /* @__PURE__ */ React.createElement("div", { className: "home-ornament-diamond" }), /* @__PURE__ */ React.createElement("div", { className: "home-ornament-line r" })), /* @__PURE__ */ React.createElement("div", { className: "genre-columns" }, /* @__PURE__ */ React.createElement("div", { className: "genre-col genre-col-stretch" }, /* @__PURE__ */ React.createElement("div", { className: "genre-col-label" }, "The Seven Volumes"), volumes.map((v, _i) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: v.id,
          className: `genre-tile${v.locked ? " locked" : ""}`,
          onClick: () => !v.locked && onSelect(v.id)
        },
        /* @__PURE__ */ React.createElement("div", { className: "genre-tile-title" }, v.title),
        (v.detail || v.sub) && /* @__PURE__ */ React.createElement("div", { className: "genre-tile-sub" }, [v.detail, v.sub].filter(Boolean).join(" \xB7 ")),
        v.locked && /* @__PURE__ */ React.createElement("div", { className: "genre-tile-badge" }, "Coming Soon")
      ))), /* @__PURE__ */ React.createElement("div", { className: "genre-col genre-col-stretch" }, /* @__PURE__ */ React.createElement("div", { className: "genre-col-label" }, "Collections"), collections.map((b, _i) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: b.id,
          className: `genre-tile${b.locked ? " locked" : ""}`,
          onClick: () => !b.locked && onSelect(b.id)
        },
        /* @__PURE__ */ React.createElement("div", { className: "genre-tile-title" }, b.title),
        b.sub && /* @__PURE__ */ React.createElement("div", { className: "genre-tile-sub" }, b.sub),
        b.locked && /* @__PURE__ */ React.createElement("div", { className: "genre-tile-badge" }, "Coming Soon")
      ))), /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "genre-tile genre-full-width",
          style: { textAlign: "center", padding: "1.4rem 1rem" },
          onClick: () => onSelect("garden")
        },
        /* @__PURE__ */ React.createElement("div", { className: "genre-tile-title" }, "A Return to The Garden"),
        /* @__PURE__ */ React.createElement("div", { className: "genre-tile-sub" }, "209 Pages \xB7 A Visual Journey")
      )))
    );
  }

  // app/src/main/assets/src/ui/screens/StudiesHome.jsx
  function StudiesHome2({ studies, studiesLoading, onSelectStudy, onBack, onSearch, onHistory, onSettings, theme, onThemeChange }) {
    const list = studies || [];
    return /* @__PURE__ */ React.createElement(
      ScreenLayout,
      {
        navChildren: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "nav-home", onClick: onBack }, "\u2190 Home"), /* @__PURE__ */ React.createElement(NavButtons, { onSettings, onHistory, onSearch, theme, onThemeChange }))
      },
      /* @__PURE__ */ React.createElement("div", { className: "vol-index" }, /* @__PURE__ */ React.createElement("div", { className: "vol-index-header" }, /* @__PURE__ */ React.createElement("div", { className: "vol-index-eyebrow" }, "In-Depth Bible Studies"), /* @__PURE__ */ React.createElement("h1", { className: "vol-index-title" }, "Studies"), /* @__PURE__ */ React.createElement("div", { className: "vol-index-subtitle" }, "Bible/Letter Studies & The VOT Matthew Study Bible"), /* @__PURE__ */ React.createElement("div", { className: "vol-index-ornament" }, /* @__PURE__ */ React.createElement("div", { className: "vol-index-ornament-line" }), /* @__PURE__ */ React.createElement("div", { className: "vol-index-ornament-diamond" }), /* @__PURE__ */ React.createElement("div", { className: "vol-index-ornament-line r" }))), /* @__PURE__ */ React.createElement("div", { className: "chapter-cards" }, list.length === 0 && studiesLoading && /* @__PURE__ */ React.createElement("div", { className: "sc-sheet-loading", style: { textAlign: "center", padding: "1.5rem 0" } }, "Loading studies\u2026"), list.length === 0 && !studiesLoading && /* @__PURE__ */ React.createElement("div", { className: "studies-empty" }, "Letter Studies coming soon."), list.map((s, i) => {
        const isMatthew = !!s.isMatthewStudy;
        const chCount = s.chapters ? s.chapters.length : 0;
        const displayCount = s.parts ? s.parts.length : chCount;
        const partsLabel = isMatthew ? `${chCount} Chapters \xB7 Inline Commentary` : s.singlePage ? "Reference" : displayCount > 0 ? `${displayCount} ${displayCount === 1 ? "Part" : "Parts"} \xB7 Bible Study` : "Coming Soon";
        return /* @__PURE__ */ React.createElement(
          "button",
          {
            key: s.id,
            className: `chapter-card-btn${s.locked ? " is-locked" : ""}`,
            onClick: () => !s.locked && onSelectStudy(s.slug || s.id),
            disabled: s.locked
          },
          /* @__PURE__ */ React.createElement("span", { className: "chapter-card-num" }, i + 1),
          /* @__PURE__ */ React.createElement("div", { className: "chapter-card-divider" }),
          /* @__PURE__ */ React.createElement("div", { className: "chapter-card-info" }, /* @__PURE__ */ React.createElement("div", { className: "chapter-card-label" }, s.locked ? "Coming Soon" : partsLabel), /* @__PURE__ */ React.createElement("div", { className: "chapter-card-title" }, s.title))
        );
      }), /* @__PURE__ */ React.createElement("a", { className: "chapter-card-btn study-external-card", href: "https://answersonlygodcangive.com/", target: "_blank", rel: "noopener noreferrer" }, /* @__PURE__ */ React.createElement("span", { className: "chapter-card-num" }, "\u2197"), /* @__PURE__ */ React.createElement("div", { className: "chapter-card-divider" }), /* @__PURE__ */ React.createElement("div", { className: "chapter-card-info" }, /* @__PURE__ */ React.createElement("div", { className: "chapter-card-label" }, "External Site"), /* @__PURE__ */ React.createElement("div", { className: "chapter-card-title" }, "AnswersOnlyGodCanGive.com")))))
    );
  }

  // app/src/main/assets/src/ui/screens/HistoryScreen.jsx
  function HistoryScreen2({ history, onBack, onSelect, onSearch, onSettings, theme, onThemeChange, onPruneDay }) {
    const now = /* @__PURE__ */ new Date();
    const curY = now.getFullYear(), curM = now.getMonth(), curD = now.getDate();
    const { currentDays, tree } = React.useMemo(() => {
      const curMs = /* @__PURE__ */ new Map();
      const ys = /* @__PURE__ */ new Map();
      for (const entry of history) {
        const d = new Date(entry.ts);
        const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
        if (y === curY && m === curM) {
          if (!curMs.has(day)) curMs.set(day, []);
          curMs.get(day).push(entry);
          continue;
        }
        const wkStart = new Date(y, m, day - d.getDay());
        const wkKey = `${wkStart.getFullYear()}-${wkStart.getMonth()}-${wkStart.getDate()}`;
        if (!ys.has(y)) ys.set(y, /* @__PURE__ */ new Map());
        const ms = ys.get(y);
        if (!ms.has(m)) ms.set(m, /* @__PURE__ */ new Map());
        const ws = ms.get(m);
        if (!ws.has(wkKey)) ws.set(wkKey, { weekStart: wkStart, days: /* @__PURE__ */ new Map() });
        const wd = ws.get(wkKey).days;
        if (!wd.has(day)) wd.set(day, []);
        wd.get(day).push(entry);
      }
      const sortDesc = (a, b) => b[0] - a[0];
      const currentDays2 = [...curMs.entries()].sort(sortDesc).map(([day, entries]) => ({ day, entries }));
      const treeArr = [...ys.entries()].sort(sortDesc).map(([y, ms]) => ({
        year: y,
        months: [...ms.entries()].sort(sortDesc).map(([m, ws]) => ({
          month: m,
          weeks: [...ws.entries()].sort((a, b) => b[1].weekStart - a[1].weekStart).map(([wkKey, wkData]) => ({
            key: wkKey,
            weekStart: wkData.weekStart,
            days: [...wkData.days.entries()].sort(sortDesc).map(([d, entries]) => ({ day: d, entries }))
          }))
        }))
      }));
      return { currentDays: currentDays2, tree: treeArr };
    }, [history, curY, curM]);
    const [overrides, setOverrides] = React.useState({});
    const yest = new Date(curY, curM, curD - 1);
    const yestY = yest.getFullYear(), yestM = yest.getMonth(), yestD = yest.getDate();
    const recentYearId = tree.length > 0 ? `y:${tree[0].year}` : null;
    const recentMonthIds = /* @__PURE__ */ new Set();
    const recentWeekIds = /* @__PURE__ */ new Set();
    for (const yg of tree) {
      if (yg.months.length > 0) {
        const mg = yg.months[0];
        recentMonthIds.add(`ym:${yg.year}-${mg.month}`);
        if (mg.weeks.length > 0) {
          recentWeekIds.add(`ymw:${yg.year}-${mg.month}-${mg.weeks[0].key}`);
        }
      }
    }
    const defaultOpen = (id) => {
      if (id === `cd:${curY}-${curM}-${curD}`) return true;
      if (id === `cd:${yestY}-${yestM}-${yestD}`) return true;
      if (id === recentYearId) return true;
      if (recentMonthIds.has(id)) return true;
      if (recentWeekIds.has(id)) return true;
      return false;
    };
    const isOpen = (id) => id in overrides ? overrides[id] : defaultOpen(id);
    const toggle = (id) => setOverrides((prev) => ({ ...prev, [id]: !(id in prev ? prev[id] : defaultOpen(id)) }));
    const [pending, setPending] = React.useState(null);
    const pendingTimer = React.useRef(null);
    const pendingBtnRef = React.useRef(null);
    const requestPrune = (dayId, y, m, d) => {
      if (pending === dayId) {
        onPruneDay(y, m, d);
        setPending(null);
        if (pendingTimer.current) clearTimeout(pendingTimer.current);
      } else {
        setPending(dayId);
        if (pendingTimer.current) clearTimeout(pendingTimer.current);
        pendingTimer.current = setTimeout(() => {
          setPending((cur) => cur === dayId ? null : cur);
        }, 5e3);
      }
    };
    React.useEffect(() => () => {
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    }, []);
    React.useEffect(() => {
      if (!pending) return;
      const onDocTap = (e) => {
        const btn = pendingBtnRef.current;
        if (btn && btn.contains(e.target)) return;
        setPending(null);
        if (pendingTimer.current) clearTimeout(pendingTimer.current);
      };
      document.addEventListener("click", onDocTap, true);
      return () => document.removeEventListener("click", onDocTap, true);
    }, [pending]);
    const dupeCount = (entries) => {
      const seen = /* @__PURE__ */ new Set();
      let n = 0;
      for (const e of entries) {
        if (seen.has(e.key)) n++;
        else seen.add(e.key);
      }
      return n;
    };
    const dayLabel = (y, m, d) => {
      if (y === curY && m === curM && d === curD) return "Today";
      const yest2 = new Date(curY, curM, curD - 1);
      if (y === yest2.getFullYear() && m === yest2.getMonth() && d === yest2.getDate()) return "Yesterday";
      const date = new Date(y, m, d);
      return `${WEEKDAY_NAMES[date.getDay()]} \xB7 ${MONTH_ABBR[m]} ${d}`;
    };
    const renderDaySection = (year, month, dg, isCurrent) => {
      const dId = isCurrent ? `cd:${year}-${month}-${dg.day}` : `ymd:${year}-${month}-${dg.day}`;
      const dOpen = isOpen(dId);
      const dupes = dupeCount(dg.entries);
      const isPending = pending === dId;
      return /* @__PURE__ */ React.createElement("div", { key: dId, className: "history-day-section" }, /* @__PURE__ */ React.createElement("button", { className: "history-day-header", onClick: () => toggle(dId) }, /* @__PURE__ */ React.createElement("span", { className: "history-day-label" }, dayLabel(year, month, dg.day)), dg.entries.length > 1 && /* @__PURE__ */ React.createElement("span", { className: "history-day-count" }, "\xB7 ", dg.entries.length), /* @__PURE__ */ React.createElement("span", { className: "history-day-spacer" }), /* @__PURE__ */ React.createElement("span", { className: `history-chevron${dOpen ? " is-open" : ""}` }, "\u203A")), dOpen && dupes > 0 && /* @__PURE__ */ React.createElement("div", { className: "history-dedupe-row" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          ref: isPending ? pendingBtnRef : null,
          className: `history-dedupe-btn${isPending ? " is-pending" : ""}`,
          onClick: () => requestPrune(dId, year, month, dg.day)
        },
        isPending ? `Tap again to confirm \u2014 removes ${dupes}` : `Deduplicate (${dupes})`
      )), dOpen && /* @__PURE__ */ React.createElement("div", { className: "chapter-cards" }, dg.entries.map((entry, i) => /* @__PURE__ */ React.createElement(HistoryEntryCard, { key: entry.key + ":" + entry.ts + ":" + i, entry, onSelect }))));
    };
    return /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "nav-home nav-back-icon", onClick: onBack, title: "Back", "aria-label": "Back" }, "\u2039"), /* @__PURE__ */ React.createElement(HomeBtn, null), /* @__PURE__ */ React.createElement("button", { className: "settings-gear-btn", onClick: onSettings, title: "Settings" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "3" }), /* @__PURE__ */ React.createElement("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" }))), /* @__PURE__ */ React.createElement("button", { className: "nav-search-btn", onClick: onSearch, title: "Search" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6" }, /* @__PURE__ */ React.createElement("circle", { cx: "11", cy: "11", r: "8" }), /* @__PURE__ */ React.createElement("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" }))), /* @__PURE__ */ React.createElement(ThemeBtn, { theme, onThemeChange })) }, /* @__PURE__ */ React.createElement("div", { className: "vol-index history-screen" }, /* @__PURE__ */ React.createElement("div", { className: "vol-index-header" }, /* @__PURE__ */ React.createElement("div", { className: "vol-index-eyebrow" }, "Reading Activity"), /* @__PURE__ */ React.createElement("h1", { className: "vol-index-title" }, "History"), /* @__PURE__ */ React.createElement("div", { className: "vol-index-ornament" }, /* @__PURE__ */ React.createElement("div", { className: "vol-index-ornament-line" }), /* @__PURE__ */ React.createElement("div", { className: "vol-index-ornament-diamond" }), /* @__PURE__ */ React.createElement("div", { className: "vol-index-ornament-line r" }))), history.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "history-empty" }, /* @__PURE__ */ React.createElement("div", { className: "history-empty-sigil" }, "\u2726"), /* @__PURE__ */ React.createElement("div", { className: "history-empty-title" }, "The scroll is blank."), /* @__PURE__ */ React.createElement("div", { className: "history-empty-body" }, "Every chapter, letter, and study you visit will land here \u2014 a trail of what the Spirit has led you through. Begin reading and this will populate.")) : /* @__PURE__ */ React.createElement(React.Fragment, null, currentDays.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "history-current-section" }, currentDays.map((dg) => renderDaySection(curY, curM, dg, true))), tree.map((yg) => {
      const yId = `y:${yg.year}`;
      const yOpen = isOpen(yId);
      return /* @__PURE__ */ React.createElement("div", { key: yg.year, className: "history-year-section" }, /* @__PURE__ */ React.createElement("button", { className: "history-year-header", onClick: () => toggle(yId) }, /* @__PURE__ */ React.createElement("span", { className: "history-year-rule" }), /* @__PURE__ */ React.createElement("span", { className: "history-year-label" }, yg.year), /* @__PURE__ */ React.createElement("span", { className: "history-year-rule r" }), /* @__PURE__ */ React.createElement("span", { className: `history-chevron${yOpen ? " is-open" : ""}` }, "\u203A")), yOpen && yg.months.map((mg) => {
        const mId = `ym:${yg.year}-${mg.month}`;
        const mOpen = isOpen(mId);
        const monthTotal = mg.weeks.reduce((s, wk) => s + wk.days.reduce((s2, d) => s2 + d.entries.length, 0), 0);
        return /* @__PURE__ */ React.createElement("div", { key: mg.month, className: "history-month-section" }, /* @__PURE__ */ React.createElement("button", { className: "history-month-header", onClick: () => toggle(mId) }, /* @__PURE__ */ React.createElement("span", { className: "history-month-label" }, MONTH_NAMES[mg.month]), /* @__PURE__ */ React.createElement("span", { className: "history-month-count" }, monthTotal), /* @__PURE__ */ React.createElement("span", { className: `history-chevron${mOpen ? " is-open" : ""}` }, "\u203A")), mOpen && mg.weeks.map((wg) => {
          const wId = `ymw:${yg.year}-${mg.month}-${wg.key}`;
          const wOpen = isOpen(wId);
          const weekTotal = wg.days.reduce((s, d) => s + d.entries.length, 0);
          const wsLabel = `Week of ${MONTH_ABBR[wg.weekStart.getMonth()]} ${wg.weekStart.getDate()}`;
          return /* @__PURE__ */ React.createElement("div", { key: wg.key, className: "history-week-section" }, /* @__PURE__ */ React.createElement("button", { className: "history-week-header", onClick: () => toggle(wId) }, /* @__PURE__ */ React.createElement("span", { className: "history-week-label" }, wsLabel), /* @__PURE__ */ React.createElement("span", { className: "history-week-count" }, weekTotal), /* @__PURE__ */ React.createElement("span", { className: `history-chevron${wOpen ? " is-open" : ""}` }, "\u203A")), wOpen && wg.days.map((dg) => renderDaySection(yg.year, mg.month, dg, false)));
        }));
      }));
    }))));
  }

  // app/src/main/assets/src/ui/screens/AboutScreen.jsx
  function AboutScreen2({ onContinue, onBack, onSearch, onHistory, theme, onThemeChange }) {
    return /* @__PURE__ */ React.createElement(
      ScreenLayout,
      {
        navChildren: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "nav-home nav-back-icon", onClick: onBack, title: "Back", "aria-label": "Back" }, "\u2039"), /* @__PURE__ */ React.createElement(HomeBtn, null), /* @__PURE__ */ React.createElement("button", { className: "nav-search-btn", onClick: onHistory, title: "History", style: { marginLeft: "auto" } }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6" }, /* @__PURE__ */ React.createElement("polyline", { points: "1 4 1 10 7 10" }), /* @__PURE__ */ React.createElement("path", { d: "M3.51 15a9 9 0 1 0 .49-5.01" }))), /* @__PURE__ */ React.createElement("button", { className: "nav-search-btn", onClick: onSearch, title: "Search" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6" }, /* @__PURE__ */ React.createElement("circle", { cx: "11", cy: "11", r: "8" }), /* @__PURE__ */ React.createElement("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" }))), /* @__PURE__ */ React.createElement(ThemeBtn, { theme, onThemeChange }))
      },
      /* @__PURE__ */ React.createElement("div", { className: "about-screen" }, /* @__PURE__ */ React.createElement("div", { className: "about-card" }, /* @__PURE__ */ React.createElement("div", { className: "about-diamonds", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("span", { className: "about-diamond" }), /* @__PURE__ */ React.createElement("span", { className: "about-diamond" }), /* @__PURE__ */ React.createElement("span", { className: "about-diamond" })), /* @__PURE__ */ React.createElement("h1", { className: "about-heading" }, "About VOTReader"), /* @__PURE__ */ React.createElement("div", { className: "about-body" }, /* @__PURE__ */ React.createElement("p", null, "The Volumes of Truth are the Word of The Lord, given through His servant Timothy."), /* @__PURE__ */ React.createElement("p", null, "This reader was made by a disciple for personal study and reflection. It is not the canonical source."), /* @__PURE__ */ React.createElement("p", null, "Your notes, journal, and highlights stay on this device. Use Settings \u2192 Export to save them to a file you control."), /* @__PURE__ */ React.createElement("p", null, "For the canonical text, audio, video, and PDF files, visit", " ", /* @__PURE__ */ React.createElement("a", { href: "https://www.thevolumesoftruth.com", target: "_blank", rel: "noopener noreferrer" }, /* @__PURE__ */ React.createElement("em", null, "thevolumesoftruth.com")), ".")), /* @__PURE__ */ React.createElement("div", { className: "about-diamonds", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("span", { className: "about-diamond" }), /* @__PURE__ */ React.createElement("span", { className: "about-diamond" }), /* @__PURE__ */ React.createElement("span", { className: "about-diamond" })), /* @__PURE__ */ React.createElement("button", { className: "about-continue", onClick: onContinue, "aria-label": "Continue" }, "Continue")))
    );
  }

  // app/src/main/assets/src/ui/screens/SettingsScreen.jsx
  function SettingsScreen2({ settings, onToggle, onSetting, onBack, onSearch, onHistory, theme, onThemeChange, readItems, onClearBook, onClearAll, onClearHistory, historyCount }) {
    const [clearPending, setClearPending] = React.useState(null);
    const [openSections, setOpenSections] = React.useState(/* @__PURE__ */ new Set());
    const [wipeConfirm, setWipeConfirm] = React.useState(false);
    const [wipeText, setWipeText] = React.useState("");
    const wipeOk = wipeText.trim().toUpperCase() === "DELETE";
    const VERSION_ID = "v1";
    const getStage = (key) => clearPending && clearPending.key === key ? clearPending.stage : 0;
    const handleClearTap = (key, action) => (e) => {
      e.stopPropagation();
      const s = getStage(key);
      if (s < 2) {
        setClearPending({ key, stage: s + 1 });
      } else {
        action();
        setClearPending(null);
      }
    };
    const resetClearPending = () => setClearPending(null);
    const PROGRESS_GROUPS = [
      {
        id: "volumes",
        label: "The Volumes of Truth",
        genres: [
          {
            label: "The Seven Volumes",
            books: [
              { id: "volume-one", label: "Volume One", total: LETTERS_V1.length },
              { id: "volume-two", label: "Volume Two", total: LETTERS.length },
              ...LETTERS_V3.length > 0 ? [{ id: "volume-three", label: "Volume Three", total: LETTERS_V3.length }] : [],
              ...LETTERS_V4.length > 0 ? [{ id: "volume-four", label: "Volume Four", total: LETTERS_V4.length }] : [],
              ...LETTERS_V5.length > 0 ? [{ id: "volume-five", label: "Volume Five", total: LETTERS_V5.length }] : [],
              ...LETTERS_V6.length > 0 ? [{ id: "volume-six", label: "Volume Six", total: LETTERS_V6.length }] : [],
              ...LETTERS_V7.length > 0 ? [{ id: "volume-seven", label: "Volume Seven", total: LETTERS_V7.length }] : []
            ]
          },
          {
            label: "Books & Collections",
            books: [
              ...LETTERS_TIMOTHY.length > 0 ? [{ id: "letters-timothy", label: "Letters from Timothy", total: LETTERS_TIMOTHY.length }] : [],
              ...LETTERS_FLOCK.length > 0 ? [{ id: "little-flock", label: "Letters to The Little Flock", total: LETTERS_FLOCK.length + (LETTERS_FLOCK_PREFACE ? 1 : 0) }] : [],
              ...LETTERS_REBUKE.length > 0 ? [{ id: "lords-rebuke", label: "The Lord's Rebuke", total: LETTERS_REBUKE.length + (LETTERS_REBUKE_PREFACE ? 1 : 0) }] : [],
              ...colLetterArr(COL_BY_KEY.get("wtlb1")).length > 0 ? [{ id: "wtlb-one", label: "Words To Live By: Part One", total: colLetterArr(COL_BY_KEY.get("wtlb1")).length }] : [],
              ...colLetterArr(COL_BY_KEY.get("wtlb2")).length > 0 ? [{ id: "wtlb-two", label: "Words To Live By: Part Two", total: colLetterArr(COL_BY_KEY.get("wtlb2")).length }] : [],
              ...colLetterArr(COL_BY_KEY.get("blessed")).length > 0 ? [{ id: "the-blessed", label: "The Blessed", total: colLetterArr(COL_BY_KEY.get("blessed")).length }] : [],
              ...colLetterArr(COL_BY_KEY.get("holydays")).length > 0 ? [{ id: "holy-days", label: "Regarding The Holy Days", total: colLetterArr(COL_BY_KEY.get("holydays")).length }] : []
            ]
          }
        ]
      },
      {
        id: "nt",
        label: "New Testament",
        genres: [
          {
            label: "Gospels",
            books: [
              { id: "matthew-plain", label: "Matthew", total: BOOKS["matthew-plain"].chapters.length },
              { id: "mark", label: "Mark", total: BOOKS.mark.chapters.length },
              { id: "luke", label: "Luke", total: BOOKS.luke.chapters.length },
              { id: "john", label: "John", total: BOOKS.john.chapters.length }
            ]
          },
          { label: "Acts", books: [{ id: "acts", label: "Acts", total: BOOKS.acts.chapters.length }] },
          {
            label: "Paul's Epistles",
            books: [
              { id: "romans", label: "Romans", total: BOOKS.romans.chapters.length },
              { id: "1corinthians", label: "1 Corinthians", total: BOOKS["1corinthians"].chapters.length },
              { id: "2corinthians", label: "2 Corinthians", total: BOOKS["2corinthians"].chapters.length },
              { id: "galatians", label: "Galatians", total: BOOKS.galatians.chapters.length },
              { id: "ephesians", label: "Ephesians", total: BOOKS.ephesians.chapters.length },
              { id: "philippians", label: "Philippians", total: BOOKS.philippians.chapters.length },
              { id: "colossians", label: "Colossians", total: BOOKS.colossians.chapters.length },
              { id: "1thessalonians", label: "1 Thessalonians", total: BOOKS["1thessalonians"].chapters.length },
              { id: "2thessalonians", label: "2 Thessalonians", total: BOOKS["2thessalonians"].chapters.length },
              { id: "1timothy", label: "1 Timothy", total: BOOKS["1timothy"].chapters.length },
              { id: "2timothy", label: "2 Timothy", total: BOOKS["2timothy"].chapters.length },
              { id: "titus", label: "Titus", total: BOOKS.titus.chapters.length },
              { id: "philemon", label: "Philemon", total: BOOKS.philemon.chapters.length },
              { id: "hebrews", label: "Hebrews", total: BOOKS.hebrews.chapters.length }
            ]
          },
          {
            label: "General Epistles",
            books: [
              { id: "james", label: "James", total: BOOKS.james.chapters.length },
              { id: "1peter", label: "1 Peter", total: BOOKS["1peter"].chapters.length },
              { id: "2peter", label: "2 Peter", total: BOOKS["2peter"].chapters.length },
              { id: "1john", label: "1 John", total: BOOKS["1john"].chapters.length },
              { id: "2john", label: "2 John", total: BOOKS["2john"].chapters.length },
              { id: "3john", label: "3 John", total: BOOKS["3john"].chapters.length },
              { id: "jude", label: "Jude", total: BOOKS.jude.chapters.length }
            ]
          },
          { label: "Revelation", books: [{ id: "revelation", label: "Revelation", total: BOOKS.revelation.chapters.length }] }
        ]
      },
      {
        id: "ot",
        label: "Old Testament",
        genres: [
          {
            label: "The Law",
            books: [
              { id: "genesis", label: "Genesis", total: BOOKS.genesis.chapters.length },
              { id: "exodus", label: "Exodus", total: BOOKS.exodus.chapters.length },
              { id: "leviticus", label: "Leviticus", total: BOOKS.leviticus.chapters.length },
              { id: "numbers", label: "Numbers", total: BOOKS.numbers.chapters.length },
              { id: "deuteronomy", label: "Deuteronomy", total: BOOKS.deuteronomy.chapters.length }
            ]
          },
          {
            label: "History",
            books: [
              { id: "joshua", label: "Joshua", total: BOOKS.joshua.chapters.length },
              { id: "judges", label: "Judges", total: BOOKS.judges.chapters.length },
              { id: "ruth", label: "Ruth", total: BOOKS.ruth.chapters.length },
              { id: "1samuel", label: "1 Samuel", total: BOOKS["1samuel"].chapters.length },
              { id: "2samuel", label: "2 Samuel", total: BOOKS["2samuel"].chapters.length },
              { id: "1kings", label: "1 Kings", total: BOOKS["1kings"].chapters.length },
              { id: "2kings", label: "2 Kings", total: BOOKS["2kings"].chapters.length },
              { id: "1chronicles", label: "1 Chronicles", total: BOOKS["1chronicles"].chapters.length },
              { id: "2chronicles", label: "2 Chronicles", total: BOOKS["2chronicles"].chapters.length },
              { id: "ezra", label: "Ezra", total: BOOKS.ezra.chapters.length },
              { id: "nehemiah", label: "Nehemiah", total: BOOKS.nehemiah.chapters.length },
              { id: "esther", label: "Esther", total: BOOKS.esther.chapters.length }
            ]
          },
          {
            label: "Poetry & Wisdom",
            books: [
              { id: "job", label: "Job", total: BOOKS.job.chapters.length },
              { id: "psalms", label: "Psalms", total: BOOKS.psalms.chapters.length },
              { id: "proverbs", label: "Proverbs", total: BOOKS.proverbs.chapters.length },
              { id: "ecclesiastes", label: "Ecclesiastes", total: BOOKS.ecclesiastes.chapters.length },
              { id: "songofsolomon", label: "Song of Solomon", total: BOOKS.songofsolomon.chapters.length }
            ]
          },
          {
            label: "Major Prophets",
            books: [
              { id: "isaiah", label: "Isaiah", total: BOOKS.isaiah.chapters.length },
              { id: "jeremiah", label: "Jeremiah", total: BOOKS.jeremiah.chapters.length },
              { id: "lamentations", label: "Lamentations", total: BOOKS.lamentations.chapters.length },
              { id: "ezekiel", label: "Ezekiel", total: BOOKS.ezekiel.chapters.length },
              { id: "daniel", label: "Daniel", total: BOOKS.daniel.chapters.length }
            ]
          },
          {
            label: "Minor Prophets",
            books: [
              { id: "hosea", label: "Hosea", total: BOOKS.hosea.chapters.length },
              { id: "joel", label: "Joel", total: BOOKS.joel.chapters.length },
              { id: "amos", label: "Amos", total: BOOKS.amos.chapters.length },
              { id: "obadiah", label: "Obadiah", total: BOOKS.obadiah.chapters.length },
              { id: "jonah", label: "Jonah", total: BOOKS.jonah.chapters.length },
              { id: "micah", label: "Micah", total: BOOKS.micah.chapters.length },
              { id: "nahum", label: "Nahum", total: BOOKS.nahum.chapters.length },
              { id: "habakkuk", label: "Habakkuk", total: BOOKS.habakkuk.chapters.length },
              { id: "zephaniah", label: "Zephaniah", total: BOOKS.zephaniah.chapters.length },
              { id: "haggai", label: "Haggai", total: BOOKS.haggai.chapters.length },
              { id: "zechariah", label: "Zechariah", total: BOOKS.zechariah.chapters.length },
              { id: "malachi", label: "Malachi", total: BOOKS.malachi.chapters.length }
            ]
          }
        ]
      },
      {
        id: "studies",
        label: "Studies",
        genres: [
          {
            label: "VOT Study Bible",
            books: [
              { id: "matthew", label: "Matthew Study Bible", total: _matthew()?.chapters?.length || 0 }
            ]
          },
          ..._studies().filter((s) => !s.locked && s.chapters && s.chapters.length > 0).length > 0 ? [{
            label: "Bible Letter Studies",
            books: _studies().filter((s) => !s.locked && s.chapters && s.chapters.length > 0).map((s) => ({
              id: `bible-study-${s.slug}`,
              label: s.title,
              total: s.chapters.length
            }))
          }] : []
        ]
      }
    ];
    const countFor = (bid) => Object.keys(readItems).filter((k) => k.startsWith(`${VERSION_ID}:${bid}:`)).length;
    const allBooks = PROGRESS_GROUPS.flatMap((g) => g.genres.flatMap((gr) => gr.books));
    const totalRead = Object.keys(readItems).length;
    const totalItems = allBooks.reduce((s, b) => s + b.total, 0);
    const sectionBooks = (grp) => grp.genres.flatMap((gr) => gr.books);
    const sectionRead = (grp) => sectionBooks(grp).reduce((s, b) => s + countFor(b.id), 0);
    const sectionTotal = (grp) => sectionBooks(grp).reduce((s, b) => s + b.total, 0);
    const toggleSection = (id) => setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    const _collectVotKeys = () => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf("vot-") === 0) keys.push(k);
      }
      return keys;
    };
    const exportPersonalData = () => {
      try {
        const data = {};
        _collectVotKeys().forEach((k) => {
          data[k] = localStorage.getItem(k);
        });
        const payload = {
          app: "VOTReader",
          exportVersion: 1,
          exportDate: (/* @__PURE__ */ new Date()).toISOString(),
          data
        };
        const json = JSON.stringify(payload, null, 2);
        const stamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        const filename = `votreader-backup-${stamp}.json`;
        if (window.AndroidBridge && typeof window.AndroidBridge.saveToDownloads === "function") {
          const result = window.AndroidBridge.saveToDownloads(filename, json);
          if (result === "ok") {
            alert("Backup saved to your Downloads folder.");
          } else {
            console.warn("saveToDownloads error:", result);
            alert("Export failed. Please try again.");
          }
          return;
        }
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          try {
            URL.revokeObjectURL(url);
            a.remove();
          } catch (_e) {
          }
        }, 0);
      } catch (e) {
        console.warn("export failed", e);
        alert("Export failed. See console for details.");
      }
    };
    const importPersonalData = () => {
      const _doImport = (jsonText) => {
        try {
          const parsed = JSON.parse(jsonText);
          if (!parsed || parsed.app !== "VOTReader" || !parsed.data || typeof parsed.data !== "object") {
            alert("This file does not look like a VOTReader backup.");
            return;
          }
          const dateLabel = parsed.exportDate ? new Date(parsed.exportDate).toLocaleString() : "unknown date";
          const proceed = window.confirm(
            "Importing the backup from " + dateLabel + " will REPLACE all your current notes, highlights, notebooks, journal entries, bookmarks, links, reading progress, history, tabs, and settings on this device. This cannot be undone.\n\nContinue?"
          );
          if (!proceed) return;
          _collectVotKeys().forEach((k) => {
            try {
              localStorage.removeItem(k);
            } catch (_e) {
            }
          });
          Object.keys(parsed.data).forEach((k) => {
            if (k.indexOf("vot-") === 0 && typeof parsed.data[k] === "string") {
              try {
                localStorage.setItem(k, parsed.data[k]);
              } catch (e) {
                console.warn("import: localStorage write failed for", k, e);
              }
            }
          });
          alert("Import complete. The app will now reload.");
          window.location.reload();
        } catch (err) {
          console.warn("import failed", err);
          alert("Import failed: " + (err && err.message ? err.message : "invalid file"));
        }
      };
      if (window.AndroidBridge && typeof window.AndroidBridge.openFilePicker === "function") {
        window.__onImportFile = (b64OrNull) => {
          window.__onImportFile = null;
          if (!b64OrNull) return;
          try {
            _doImport(atob(b64OrNull));
          } catch (_e) {
            alert("Import failed: could not decode file.");
          }
        };
        window.AndroidBridge.openFilePicker();
        return;
      }
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.onchange = (ev) => {
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (re) => {
          _doImport(re.target.result);
        };
        reader.readAsText(file);
      };
      input.click();
    };
    const clearAllPersonalData = () => {
      try {
        _collectVotKeys().forEach((k) => {
          try {
            localStorage.removeItem(k);
          } catch (_e) {
          }
        });
        try {
          indexedDB.deleteDatabase("vot-thumbs");
        } catch (_e) {
        }
        try {
          indexedDB.deleteDatabase("vot-search-cache");
        } catch (_e) {
        }
        alert("All personal data cleared. The app will now reload.");
        window.location.reload();
      } catch (e) {
        console.warn("clear all personal data failed", e);
        alert("Clear failed. See console for details.");
      }
    };
    return /* @__PURE__ */ React.createElement(
      ScreenLayout,
      {
        navChildren: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "nav-home nav-back-icon", onClick: onBack, title: "Back", "aria-label": "Back" }, "\u2039"), /* @__PURE__ */ React.createElement(HomeBtn, null), /* @__PURE__ */ React.createElement("button", { className: "nav-search-btn", onClick: onHistory, title: "History", style: { marginLeft: "auto" } }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6" }, /* @__PURE__ */ React.createElement("polyline", { points: "1 4 1 10 7 10" }), /* @__PURE__ */ React.createElement("path", { d: "M3.51 15a9 9 0 1 0 .49-5.01" }))), /* @__PURE__ */ React.createElement("button", { className: "nav-search-btn", onClick: onSearch, title: "Search" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6" }, /* @__PURE__ */ React.createElement("circle", { cx: "11", cy: "11", r: "8" }), /* @__PURE__ */ React.createElement("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" }))), /* @__PURE__ */ React.createElement(ThemeBtn, { theme, onThemeChange }))
      },
      /* @__PURE__ */ React.createElement("div", { className: "settings-screen", onClick: resetClearPending }, /* @__PURE__ */ React.createElement("div", { className: "settings-header" }, /* @__PURE__ */ React.createElement("div", { className: "settings-eyebrow" }, "VOT Study Bible"), /* @__PURE__ */ React.createElement("h1", { className: "settings-title" }, "Settings"), /* @__PURE__ */ React.createElement("div", { className: "settings-ornament" }, /* @__PURE__ */ React.createElement("div", { className: "settings-ornament-line" }), /* @__PURE__ */ React.createElement("div", { className: "settings-ornament-diamond" }), /* @__PURE__ */ React.createElement("div", { className: "settings-ornament-line r" }))), /* @__PURE__ */ React.createElement("div", { className: "settings-section" }, /* @__PURE__ */ React.createElement("div", { className: "settings-section-label" }, "Text & Translation"), /* @__PURE__ */ React.createElement(
        SelectField,
        {
          eyebrow: "Text & Translation",
          title: "Bible Translation",
          label: "Bible Translation",
          desc: "Verse text for the 66-book reading flow. Section headings stay in place across translations. Does not affect the Matthew Study Bible, which uses its own curated text.",
          value: settings.translation || "nkjv",
          options: TRANSLATION_OPTIONS,
          onChange: (v) => onSetting("translation", v)
        }
      ), /* @__PURE__ */ React.createElement(
        SettingsRow,
        {
          label: "Chapter Titles",
          desc: "Show the curated chapter title below the chapter number (e.g. 'The Creation', 'The Genealogy of YahuShua'). Applies universally. Tap the title in a chapter for a per-session focus mode.",
          checked: settings.showChapterTitle !== false,
          onToggle: () => onToggle("showChapterTitle")
        }
      ), /* @__PURE__ */ React.createElement(
        SettingsRow,
        {
          label: "Section Headings",
          desc: "Show inline topic breaks between verses (e.g. 'The Fall', 'The Call of Abraham'). Applies universally. Tap any heading in a chapter for a per-session focus mode.",
          checked: settings.showSectionHeadings !== false,
          onToggle: () => onToggle("showSectionHeadings")
        }
      ), /* @__PURE__ */ React.createElement(
        SettingsRow,
        {
          label: "Restored Names",
          desc: "Uses the proper Name of The Father (YAHUWAH) and The Son (YahuShua) in chapter titles and section headings \u2014 only where the underlying verses bear the Name. Verse text itself is never altered.",
          checked: !!settings.restoredNames,
          onToggle: () => onToggle("restoredNames"),
          disabled: settings.showChapterTitle === false && settings.showSectionHeadings === false,
          disabledReason: "Turn on Chapter Titles or Section Headings to use Restored Names \u2014 the Names only appear in those."
        }
      )), /* @__PURE__ */ React.createElement("div", { className: "settings-section" }, /* @__PURE__ */ React.createElement("div", { className: "settings-section-label" }, "Reading Experience"), /* @__PURE__ */ React.createElement(
        SelectField,
        {
          eyebrow: "Reading Experience",
          title: "Chapter Arrows",
          label: "Chapter & Letter Arrows",
          desc: "Where the previous/next arrows live in a chapter or letter view.",
          value: settings.arrowLayout || "split",
          options: ARROW_LAYOUT_OPTIONS,
          onChange: (v) => onSetting("arrowLayout", v)
        }
      ), /* @__PURE__ */ React.createElement(
        SelectField,
        {
          eyebrow: "Reading Experience",
          title: "Scripture Browser",
          label: "Scripture Browser",
          desc: "How books are organized on the Scriptures screen.",
          value: settings.scriptureLayout || "genre",
          options: SCRIPTURE_LAYOUT_OPTIONS,
          onChange: (v) => onSetting("scriptureLayout", v)
        }
      ), /* @__PURE__ */ React.createElement(
        SettingsRow,
        {
          label: "Inline Reference Echoes",
          desc: "In the Matthew Study Bible's inline mode, when a reference spans multiple verse ranges (e.g. verses 1-5 and 10-15), show a compact echo pill at the end of each additional range that scrolls back to the full note. Helps you see what references relate to as you read.",
          checked: settings.showInlineEchoes !== false,
          onToggle: () => onToggle("showInlineEchoes")
        }
      ), /* @__PURE__ */ React.createElement(
        SettingsRow,
        {
          label: "Reading Position Dot",
          desc: "A pulsing gold dot in the upper right that takes you back to where you were last reading.",
          checked: settings.showReadingDot,
          onToggle: () => onToggle("showReadingDot")
        }
      ), settings.showReadingDot && /* @__PURE__ */ React.createElement(
        SelectField,
        {
          label: "Reading Dot Dwell Time",
          desc: "How long you must stay on a page before the reading dot updates to that position. Shorter = updates faster; longer = requires more settled reading.",
          value: settings.dwellMs || "20000",
          options: [
            { id: "3000", label: "3 seconds", desc: "Updates almost immediately" },
            { id: "5000", label: "5 seconds", desc: "Very quick" },
            { id: "10000", label: "10 seconds", desc: "Quick" },
            { id: "15000", label: "15 seconds", desc: "Moderate" },
            { id: "20000", label: "20 seconds", desc: "Standard (default)" },
            { id: "30000", label: "30 seconds", desc: "Relaxed" },
            { id: "45000", label: "45 seconds", desc: "Deliberate" },
            { id: "60000", label: "60 seconds", desc: "Requires a full minute on the page" }
          ],
          onChange: (v) => onSetting("dwellMs", v)
        }
      ), /* @__PURE__ */ React.createElement(
        SettingsRow,
        {
          label: "Random Letter Button",
          desc: "A breathing dice icon on the home screen that opens a random chapter or letter when tapped.",
          checked: settings.showSurpriseButton,
          onToggle: () => onToggle("showSurpriseButton")
        }
      ), /* @__PURE__ */ React.createElement(
        SettingsRow,
        {
          label: "Settings Gear in Top Nav",
          desc: "Show the gear icon in the top nav of every reading screen for quick access. When off, Settings is only reachable from the home screen.",
          checked: settings.showSettingsGear,
          onToggle: () => onToggle("showSettingsGear")
        }
      ), /* @__PURE__ */ React.createElement(
        SettingsRow,
        {
          label: "History in Top Nav",
          desc: "Show the history button (clock icon) in the top nav of chapter and letter views. When off, History is still reachable from the home screen.",
          checked: !!settings.historyInNav,
          onToggle: () => onToggle("historyInNav"),
          disabled: settings.historyEnabled === false,
          disabledReason: "Turn on History to enable this."
        }
      ), /* @__PURE__ */ React.createElement(
        SettingsRow,
        {
          label: "Keep Screen On While Reading",
          desc: "Don't let the screen dim or lock while the app is open. Helpful for long reading sessions; turn off to save battery. Has no effect on desktop browsers.",
          checked: settings.keepScreenOn !== false,
          onToggle: () => onToggle("keepScreenOn")
        }
      )), /* @__PURE__ */ React.createElement("div", { className: "settings-section" }, /* @__PURE__ */ React.createElement("div", { className: "settings-section-label" }, "Tabs, Search & History"), /* @__PURE__ */ React.createElement(
        SettingsRow,
        {
          label: "Tabs",
          desc: "Run up to 999 independent reading places in parallel \u2014 flip between a chapter, a letter, a study, and back. All tabs share settings, theme, mark-as-read, history, and reading progress. Disabling preserves all your open tabs \u2014 they'll be waiting when you turn it back on.",
          checked: !!settings.tabsEnabled,
          onToggle: () => onToggle("tabsEnabled")
        }
      ), /* @__PURE__ */ React.createElement(
        SettingsRow,
        {
          label: "Search",
          desc: "Full-text search across all 66 books + Volumes. When off, the search button is hidden everywhere.",
          checked: settings.searchEnabled !== false,
          onToggle: () => onToggle("searchEnabled")
        }
      ), /* @__PURE__ */ React.createElement(
        SettingsRow,
        {
          label: "Filter Stop Words in Search",
          desc: "On (default): strip filler words (the, is, of, and, this, that, etc.) from queries of 5+ words so results focus on meaningful terms. Off: match every word exactly as typed. Turn off if a search is missing results you know are there \u2014 especially with KJV-style phrasing.",
          checked: settings.searchUseStopWords !== false,
          onToggle: () => onToggle("searchUseStopWords"),
          disabled: settings.searchEnabled === false,
          disabledReason: "Turn on Search to enable this."
        }
      ), /* @__PURE__ */ React.createElement(
        SettingsRow,
        {
          label: "History",
          desc: "Keep a running list of chapters and letters you've visited. When off, recording stops and the history button is hidden. Existing history is preserved.",
          checked: settings.historyEnabled !== false,
          onToggle: () => onToggle("historyEnabled")
        }
      ), (() => {
        const histStage = getStage("history-clear");
        const histLabel = histStage === 0 ? "Clear History" : CLEAR_LABELS[histStage];
        return /* @__PURE__ */ React.createElement("div", { className: "progress-row", style: { background: "var(--bg2)", borderTop: "1px solid var(--gold-border)", borderRadius: "4px", marginTop: "0.4rem" } }, /* @__PURE__ */ React.createElement("span", { className: "progress-row-label", style: { color: "var(--cream-muted)" } }, "Reading history"), /* @__PURE__ */ React.createElement("span", { className: "progress-row-tally" }, historyCount, " ", historyCount === 1 ? "entry" : "entries"), /* @__PURE__ */ React.createElement(
          "button",
          {
            className: CLEAR_CLASSES[histStage],
            disabled: historyCount === 0,
            onClick: handleClearTap("history-clear", onClearHistory)
          },
          histLabel
        ));
      })()), /* @__PURE__ */ React.createElement("div", { className: "settings-section" }, /* @__PURE__ */ React.createElement("div", { className: "settings-section-label" }, "A Return to The Garden"), /* @__PURE__ */ React.createElement(
        SelectField,
        {
          eyebrow: "A Return to The Garden",
          title: "Image Quality",
          label: "Image Quality",
          desc: "Changing this re-downloads images at the selected quality next time you view them.",
          value: settings.gardenTier || GARDEN_DEFAULT_TIER,
          options: GARDEN_TIERS.map((t) => ({
            id: t.id,
            label: `${t.label} \xB7 ${t.size}`,
            desc: `${t.res} \xB7 ${t.desc}`
          })),
          onChange: (v) => onSetting("gardenTier", v)
        }
      )), /* @__PURE__ */ React.createElement("div", { className: "settings-section" }, /* @__PURE__ */ React.createElement("div", { className: "settings-section-label" }, "Your Data"), /* @__PURE__ */ React.createElement("div", { className: "settings-row" }, /* @__PURE__ */ React.createElement("div", { className: "settings-row-text" }, /* @__PURE__ */ React.createElement("div", { className: "settings-row-label" }, "Export Your Data"), /* @__PURE__ */ React.createElement("div", { className: "settings-row-desc" }, "Download every note, highlight, notebook, journal entry, bookmark, link, reading-progress mark, history record, open tab, and setting stored on this device as a single JSON file. No credentials or login info \u2014 just your data. Save the file anywhere you control.")), /* @__PURE__ */ React.createElement("button", { className: "settings-clear-btn", onClick: (e) => {
        e.stopPropagation();
        exportPersonalData();
      } }, "Export")), /* @__PURE__ */ React.createElement("div", { className: "settings-row" }, /* @__PURE__ */ React.createElement("div", { className: "settings-row-text" }, /* @__PURE__ */ React.createElement("div", { className: "settings-row-label" }, "Import from Backup"), /* @__PURE__ */ React.createElement("div", { className: "settings-row-desc" }, "Restore a previously exported JSON file. Replaces all current personal data on this device with the contents of the file. You will be asked to confirm before anything is overwritten.")), /* @__PURE__ */ React.createElement("button", { className: "settings-clear-btn", onClick: (e) => {
        e.stopPropagation();
        importPersonalData();
      } }, "Import")), /* @__PURE__ */ (() => {
        const closeWipe = () => {
          setWipeConfirm(false);
          setWipeText("");
        };
        return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "settings-row" }, /* @__PURE__ */ React.createElement("div", { className: "settings-row-text" }, /* @__PURE__ */ React.createElement("div", { className: "settings-row-label" }, "Clear All Personal Data"), /* @__PURE__ */ React.createElement("div", { className: "settings-row-desc" }, "Removes every note, highlight, notebook, journal entry, bookmark, link, reading-progress mark, history record, saved tab, tab thumbnail, and search cache. App settings will reset to defaults. This cannot be undone \u2014 export first if you want a backup.")), /* @__PURE__ */ React.createElement("button", { className: "settings-clear-btn danger", onClick: (e) => {
          e.stopPropagation();
          setWipeText("");
          setWipeConfirm(true);
        } }, "Clear All My Data")), wipeConfirm && /* @__PURE__ */ React.createElement(
          "div",
          {
            className: "note-sheet-overlay",
            onClick: (e) => {
              e.stopPropagation();
              if (e.target === e.currentTarget) closeWipe();
            }
          },
          /* @__PURE__ */ React.createElement("div", { className: "note-sheet", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "note-sheet-header" }, /* @__PURE__ */ React.createElement("div", { className: "note-sheet-title" }, "Delete All Personal Data")), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--cream)", fontSize: "0.9rem", lineHeight: "1.5", marginBottom: "14px" } }, "This permanently erases every note, highlight, notebook, journal entry, bookmark, link, reading-progress mark, history record, saved tab, and the search cache, then resets all settings to defaults.", " ", /* @__PURE__ */ React.createElement("strong", { style: { color: "#c0392b" } }, "This cannot be undone."), " Export your data first if you want a backup."), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--cream-muted)", fontSize: "0.78rem", letterSpacing: "0.04em", marginBottom: "8px" } }, "Type ", /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--gold)", letterSpacing: "0.15em" } }, "DELETE"), " to confirm."), /* @__PURE__ */ React.createElement(
            "input",
            {
              type: "text",
              value: wipeText,
              autoFocus: true,
              autoCapitalize: "characters",
              autoCorrect: "off",
              spellCheck: false,
              "aria-label": "Type DELETE to confirm",
              placeholder: "DELETE",
              onClick: (e) => e.stopPropagation(),
              onChange: (e) => setWipeText(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter" && wipeOk) {
                  closeWipe();
                  clearAllPersonalData();
                }
              },
              style: {
                width: "100%",
                boxSizing: "border-box",
                textAlign: "center",
                fontFamily: "'Cinzel', serif",
                fontSize: "1rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--cream)",
                background: "var(--bg)",
                border: "1px solid var(--gold-border)",
                borderRadius: "6px",
                padding: "0.7rem 0.5rem",
                outline: "none",
                marginBottom: "18px"
              }
            }
          ), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "10px", justifyContent: "flex-end" } }, /* @__PURE__ */ React.createElement("button", { className: "settings-clear-btn", onClick: (e) => {
            e.stopPropagation();
            closeWipe();
          } }, "Cancel"), /* @__PURE__ */ React.createElement(
            "button",
            {
              className: "settings-clear-btn danger",
              disabled: !wipeOk,
              onClick: (e) => {
                e.stopPropagation();
                if (!wipeOk) return;
                closeWipe();
                clearAllPersonalData();
              }
            },
            "Delete Everything"
          )))
        ));
      })()), /* @__PURE__ */ React.createElement("div", { className: "settings-section" }, /* @__PURE__ */ React.createElement("div", { className: "settings-section-label" }, "Mark as Read"), /* @__PURE__ */ React.createElement(
        SettingsRow,
        {
          label: "Mark as Read",
          desc: "Chapters and letters you've read past 90% are marked with a checkmark. Progress stops recording when this is off, but what's already saved is kept.",
          checked: settings.markAsRead,
          onToggle: () => onToggle("markAsRead")
        }
      ), settings.markAsRead && /* @__PURE__ */ React.createElement("div", { className: "progress-table" }, PROGRESS_GROUPS.map((grp) => {
        const isOpen = openSections.has(grp.id);
        const sRead = sectionRead(grp);
        const sTotal = sectionTotal(grp);
        const sectionKey = `section:${grp.id}`;
        const secStage = getStage(sectionKey);
        return /* @__PURE__ */ React.createElement(React.Fragment, { key: grp.id }, /* @__PURE__ */ React.createElement(
          "div",
          {
            className: "progress-row",
            style: { background: "var(--bg)", cursor: "pointer" },
            onClick: (e) => {
              e.stopPropagation();
              toggleSection(grp.id);
              resetClearPending();
            }
          },
          /* @__PURE__ */ React.createElement("span", { style: { color: "var(--gold-dim)", fontSize: "0.75rem", minWidth: "0.75rem" } }, isOpen ? "\u25BE" : "\u25B8"),
          /* @__PURE__ */ React.createElement("span", { className: "progress-row-label", style: { color: "var(--gold)" } }, grp.label),
          /* @__PURE__ */ React.createElement("span", { className: "progress-row-tally" }, sRead, " / ", sTotal),
          /* @__PURE__ */ React.createElement(
            "button",
            {
              className: CLEAR_CLASSES[secStage],
              disabled: sRead === 0,
              onClick: handleClearTap(sectionKey, () => sectionBooks(grp).forEach((b) => onClearBook(b.id)))
            },
            CLEAR_LABELS[secStage]
          )
        ), isOpen && grp.genres.map((genre) => /* @__PURE__ */ React.createElement(React.Fragment, { key: genre.label }, /* @__PURE__ */ React.createElement("div", { className: "progress-row", style: { background: "var(--bg2)", paddingTop: "0.45rem", paddingBottom: "0.45rem", paddingLeft: "2rem" } }, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'Cinzel',serif", fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--gold-dim)", flex: 1 } }, genre.label)), genre.books.map((src) => {
          const bookKey = `book:${src.id}`;
          return /* @__PURE__ */ React.createElement("div", { key: src.id, style: { paddingLeft: "1rem" } }, /* @__PURE__ */ React.createElement(
            ClearProgressRow,
            {
              label: src.label,
              total: src.total,
              count: countFor(src.id),
              stage: getStage(bookKey),
              onTap: handleClearTap(bookKey, () => onClearBook(src.id))
            }
          ));
        }))));
      }), /* @__PURE__ */ React.createElement("div", { className: "progress-divider" }), /* @__PURE__ */ React.createElement("div", { className: "progress-row total-row" }, /* @__PURE__ */ React.createElement("span", { className: "progress-row-label" }, "All Scriptures"), /* @__PURE__ */ React.createElement("span", { className: "progress-row-tally" }, totalRead, " / ", totalItems), (() => {
        const allStage = getStage("all");
        const label = allStage === 0 ? "Clear All" : CLEAR_LABELS[allStage];
        return /* @__PURE__ */ React.createElement(
          "button",
          {
            className: CLEAR_CLASSES[allStage],
            disabled: totalRead === 0,
            onClick: handleClearTap("all", onClearAll)
          },
          label
        );
      })()))))
    );
  }

  // app/src/main/assets/src/ui/screens/HomeScreen.jsx
  function HomeScreen2({ onSelect, onSurprise, showSurprise, onSettings, onSearch, onHistory, historyEnabled, onInfo, onAbout, history: _history, theme, onThemeChange }) {
    const ITEMS_BY_ID = {
      volumes: { id: "volumes", eyebrow: "Prophetic Letters", title: "The Volumes of Truth", detail: "Letters from The Lord, Our God and Savior" },
      scriptures: { id: "scriptures", eyebrow: "The Holy Bible", title: "The Scriptures of Truth", detail: "Genesis to Revelation \xB7 NKJV" },
      studies: { id: "studies", eyebrow: "Study Editions", title: "Studies", detail: "Letter Studies \xB7 Matthew Study Bible" },
      library: { id: "library", eyebrow: "Personal Study", title: "Library", detail: "Notes, journal & bookmarks" },
      settings: { id: "settings", eyebrow: "App Configuration", title: "Settings", detail: "Display, themes & preferences" },
      history: { id: "history", eyebrow: "Recently Visited", title: "History", detail: "Resume where you left off" }
    };
    const DEFAULT_ORDER = ["volumes", "scriptures", "studies", "library", "settings", "history"];
    const [order, setOrder] = React.useState(() => {
      try {
        const saved = JSON.parse(localStorage.getItem("vot-home-order") || "null");
        if (Array.isArray(saved) && saved.length === DEFAULT_ORDER.length && DEFAULT_ORDER.every((id) => saved.includes(id))) return saved;
      } catch (_e) {
      }
      return DEFAULT_ORDER;
    });
    const [pressingIdx, setPressingIdx] = React.useState(-1);
    const [dragIdx, setDragIdx] = React.useState(-1);
    const cardRefs = React.useRef([]);
    const pressTimerRef = React.useRef(null);
    const visualDelayTimerRef = React.useRef(null);
    const pressStartYRef = React.useRef(0);
    const pressStartTsRef = React.useRef(0);
    const tileHeightRef = React.useRef(80);
    const dragIdxRef = React.useRef(-1);
    const targetIdxRef = React.useRef(-1);
    const pressingIdxRef = React.useRef(-1);
    const orderRef = React.useRef(order);
    const justDraggedRef = React.useRef(false);
    const activeCleanupRef = React.useRef(null);
    const dragCloneRef = React.useRef(null);
    const fingerOffsetYRef = React.useRef(0);
    const naturalCardTopsRef = React.useRef([]);
    React.useEffect(() => {
      dragIdxRef.current = dragIdx;
    }, [dragIdx]);
    React.useEffect(() => {
      pressingIdxRef.current = pressingIdx;
    }, [pressingIdx]);
    React.useEffect(() => {
      orderRef.current = order;
    }, [order]);
    React.useEffect(() => () => {
      clearTimeout(pressTimerRef.current);
      if (activeCleanupRef.current) activeCleanupRef.current();
      if (dragCloneRef.current && dragCloneRef.current.parentNode)
        dragCloneRef.current.parentNode.removeChild(dragCloneRef.current);
    }, []);
    const setCardRef = (i) => (el) => {
      cardRefs.current[i] = el;
    };
    const clearInlineTransforms = () => {
      cardRefs.current.forEach((el) => {
        if (!el) return;
        el.style.transform = "";
        el.style.transition = "";
        el.style.zIndex = "";
        el.style.opacity = "";
      });
    };
    const applySiblingShifts = (newTarget) => {
      const from = dragIdxRef.current;
      const h = tileHeightRef.current;
      cardRefs.current.forEach((el, i) => {
        if (!el || i === from) return;
        let shift = 0;
        if (from < newTarget && i > from && i <= newTarget) shift = -h;
        else if (from > newTarget && i < from && i >= newTarget) shift = h;
        el.style.transition = "transform 0.22s cubic-bezier(0.2,0.8,0.3,1)";
        el.style.transform = `translateY(${shift}px)`;
      });
    };
    const startPress = (idx, clientY) => {
      if (pressingIdxRef.current >= 0 || dragIdxRef.current >= 0) return;
      pressStartYRef.current = clientY;
      pressStartTsRef.current = Date.now();
      pressingIdxRef.current = idx;
      clearTimeout(visualDelayTimerRef.current);
      visualDelayTimerRef.current = setTimeout(() => {
        if (pressingIdxRef.current === idx && dragIdxRef.current < 0) {
          setPressingIdx(idx);
        }
      }, 280);
      const onMove = (e) => {
        const y = e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY;
        if (dragIdxRef.current >= 0 && e.cancelable) {
          try {
            e.preventDefault();
          } catch (_err) {
          }
        }
        if (dragIdxRef.current >= 0) {
          const clone = dragCloneRef.current;
          if (clone) {
            clone.style.transition = "none";
            clone.style.top = y - fingerOffsetYRef.current + "px";
            clone.style.transform = "scale(1.05)";
          }
          const naturalTops = naturalCardTopsRef.current;
          const h = tileHeightRef.current || 80;
          const centerY = y - fingerOffsetYRef.current + h * 0.5;
          let newTarget = 0;
          for (let i = 1; i < naturalTops.length; i++) {
            if (centerY >= naturalTops[i] - h * 0.3) newTarget = i;
          }
          newTarget = Math.max(0, Math.min(orderRef.current.length - 1, newTarget));
          if (newTarget !== targetIdxRef.current) {
            targetIdxRef.current = newTarget;
            applySiblingShifts(newTarget);
          }
        } else if (pressingIdxRef.current >= 0) {
          if (Math.abs(y - pressStartYRef.current) > 10) {
            clearTimeout(pressTimerRef.current);
            clearTimeout(visualDelayTimerRef.current);
            setPressingIdx(-1);
            pressingIdxRef.current = -1;
            if (Date.now() - pressStartTsRef.current > 400) {
              justDraggedRef.current = true;
              setTimeout(() => {
                justDraggedRef.current = false;
              }, 300);
            }
          }
        }
      };
      const onEnd = () => {
        if (activeCleanupRef.current) activeCleanupRef.current();
        endPress();
      };
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onEnd);
      document.addEventListener("touchcancel", onEnd);
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onEnd);
      activeCleanupRef.current = () => {
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onEnd);
        document.removeEventListener("touchcancel", onEnd);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onEnd);
        activeCleanupRef.current = null;
      };
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = setTimeout(() => {
        if (cardRefs.current[0] && cardRefs.current[1]) {
          tileHeightRef.current = cardRefs.current[1].offsetTop - cardRefs.current[0].offsetTop;
        } else if (cardRefs.current[0]) {
          tileHeightRef.current = cardRefs.current[0].offsetHeight + 10;
        }
        justDraggedRef.current = true;
        setPressingIdx(-1);
        setDragIdx(idx);
        targetIdxRef.current = idx;
        const el = cardRefs.current[idx];
        if (el) {
          const rect = el.getBoundingClientRect();
          fingerOffsetYRef.current = pressStartYRef.current - rect.top;
          naturalCardTopsRef.current = cardRefs.current.map((r) => r ? r.getBoundingClientRect().top : 0);
          const clone = el.cloneNode(true);
          clone.className = "home-nav-item drag-flying";
          clone.style.cssText = [
            "position:fixed",
            "top:" + rect.top + "px",
            "left:" + rect.left + "px",
            "width:" + rect.width + "px",
            "height:" + rect.height + "px",
            "z-index:9999",
            "pointer-events:none",
            "margin:0",
            "box-sizing:border-box",
            "transition:transform 0.16s cubic-bezier(0.2,0.8,0.3,1)",
            "transform:scale(1.05)"
          ].join(";");
          document.body.appendChild(clone);
          dragCloneRef.current = clone;
        }
        if (navigator.vibrate) {
          try {
            navigator.vibrate(55);
          } catch (_e) {
          }
        }
      }, 1380);
    };
    const endPress = () => {
      clearTimeout(pressTimerRef.current);
      clearTimeout(visualDelayTimerRef.current);
      const wasPressing = pressingIdxRef.current >= 0;
      const wasDragging = dragIdxRef.current >= 0;
      setPressingIdx(-1);
      pressingIdxRef.current = -1;
      if (wasDragging) {
        const from = dragIdxRef.current;
        const to = targetIdxRef.current >= 0 ? targetIdxRef.current : from;
        const clone = dragCloneRef.current;
        if (clone) {
          const snapTop = naturalCardTopsRef.current[to] ?? naturalCardTopsRef.current[from] ?? 0;
          clone.style.transition = "top 0.22s cubic-bezier(0.2,0.8,0.3,1), transform 0.22s cubic-bezier(0.2,0.8,0.3,1)";
          clone.style.top = snapTop + "px";
          clone.style.transform = "scale(1)";
        }
        setTimeout(() => {
          if (clone && clone.parentNode) clone.parentNode.removeChild(clone);
          dragCloneRef.current = null;
          clearInlineTransforms();
          if (to !== from && to >= 0) {
            const newOrder = [...orderRef.current];
            const [moved] = newOrder.splice(from, 1);
            newOrder.splice(to, 0, moved);
            setOrder(newOrder);
            try {
              localStorage.setItem("vot-home-order", JSON.stringify(newOrder));
            } catch (_e) {
            }
          }
          setDragIdx(-1);
          targetIdxRef.current = -1;
          setTimeout(() => {
            justDraggedRef.current = false;
          }, 120);
        }, 240);
      } else if (wasPressing) {
        if (Date.now() - pressStartTsRef.current > 400) {
          justDraggedRef.current = true;
          setTimeout(() => {
            justDraggedRef.current = false;
          }, 300);
        }
      }
    };
    const handleTap = (id) => {
      if (id === "settings") {
        onSettings();
        return;
      }
      if (id === "history") {
        onHistory();
        return;
      }
      onSelect(id);
    };
    const isFirstVisit = !window.__homeAnimShown;
    React.useEffect(() => {
      window.__homeAnimShown = true;
    }, []);
    const orderedItems = order.map((id) => ITEMS_BY_ID[id]).filter((item) => {
      if (!item) return false;
      if (item.id === "history" && historyEnabled === false) return false;
      return true;
    });
    return /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "nav-search-btn", onClick: onInfo, title: "Welcome image", "aria-label": "Show welcome image", style: { marginRight: "0.25rem", color: "var(--gold)" } }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "currentColor" }, /* @__PURE__ */ React.createElement("rect", { x: "10.5", y: "2", width: "3", height: "20", rx: "1" }), /* @__PURE__ */ React.createElement("rect", { x: "4", y: "8", width: "16", height: "3", rx: "1" }))), /* @__PURE__ */ React.createElement("button", { className: "nav-search-btn", onClick: onAbout, title: "About VOTReader", "aria-label": "About VOTReader", style: { marginRight: "auto", color: "var(--gold)" } }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "9.5" }), /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "11", x2: "12", y2: "17", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "7.5", r: "1.2", fill: "currentColor", stroke: "none" }))), /* @__PURE__ */ React.createElement("button", { className: "nav-search-btn", onClick: onSearch, title: "Search" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6" }, /* @__PURE__ */ React.createElement("circle", { cx: "11", cy: "11", r: "8" }), /* @__PURE__ */ React.createElement("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" }))), /* @__PURE__ */ React.createElement(ThemeBtn, { theme, onThemeChange })) }, /* @__PURE__ */ React.createElement("div", { className: `home-screen home-screen-app${isFirstVisit ? "" : " home-fast"}` }, /* @__PURE__ */ React.createElement("h1", { className: "home-main-title" }, "The Volumes of Truth"), /* @__PURE__ */ React.createElement("div", { className: "home-main-amp", "aria-hidden": "true" }, "&"), /* @__PURE__ */ React.createElement("h2", { className: "home-main-title2" }, "The Scriptures of Truth"), /* @__PURE__ */ React.createElement("div", { className: "home-ornament" }, /* @__PURE__ */ React.createElement("div", { className: "home-ornament-line" }), /* @__PURE__ */ React.createElement("div", { className: "home-ornament-diamond" }), /* @__PURE__ */ React.createElement("div", { className: "home-ornament-line r" })), /* @__PURE__ */ React.createElement("div", { className: "home-nav-list" }, orderedItems.map((item, i) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key: item.id,
        ref: setCardRef(i),
        className: `home-nav-item${i === pressingIdx ? " pressing" : ""}${i === dragIdx ? " dragging" : ""}`,
        onTouchStart: (e) => {
          if (e.touches && e.touches[0]) startPress(i, e.touches[0].clientY);
        },
        onMouseDown: (e) => {
          if (e.button === 0) startPress(i, e.clientY);
        },
        onClick: (e) => {
          if (justDraggedRef.current) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          handleTap(item.id);
        }
      },
      /* @__PURE__ */ React.createElement("span", { className: "hni-text" }, /* @__PURE__ */ React.createElement("span", { className: "hni-eyebrow" }, item.eyebrow), /* @__PURE__ */ React.createElement("span", { className: "hni-title" }, item.title), /* @__PURE__ */ React.createElement("span", { className: "hni-detail" }, item.detail)),
      /* @__PURE__ */ React.createElement("span", { className: "hni-arrow" }, "\u203A")
    ))), isFirstVisit && /* @__PURE__ */ React.createElement("span", { className: "home-rearrange-hint" }, "Hold to rearrange")), showSurprise && /* @__PURE__ */ React.createElement("button", { className: "surprise-fab", onClick: onSurprise, title: "Open a Random Chapter or Letter", "aria-label": "Surprise Me" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("rect", { x: "3", y: "3", width: "18", height: "18", rx: "3.5" }), /* @__PURE__ */ React.createElement("circle", { cx: "8", cy: "8", r: "1.15", fill: "currentColor", stroke: "none" }), /* @__PURE__ */ React.createElement("circle", { cx: "16", cy: "8", r: "1.15", fill: "currentColor", stroke: "none" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "1.15", fill: "currentColor", stroke: "none" }), /* @__PURE__ */ React.createElement("circle", { cx: "8", cy: "16", r: "1.15", fill: "currentColor", stroke: "none" }), /* @__PURE__ */ React.createElement("circle", { cx: "16", cy: "16", r: "1.15", fill: "currentColor", stroke: "none" }))));
  }

  // app/src/main/assets/src/ui/screens/SearchScreen.jsx
  function SearchScreen2({ query, onQueryChange, settings, onSettingsChange, onSelect, onBack, searchScope, searchContext, onToggleScope, onCommand }) {
    const inputRef = React.useRef(null);
    const [state, setState] = React.useState({ phase: "idle", parsed: null, results: [], terms: [], error: null, total: 0 });
    const [buildInfo, setBuildInfo] = React.useState({ ready: false, building: false, progress: null });
    const [showSuggest, setShowSuggest] = React.useState(false);
    const [suggestions, setSuggestions] = React.useState([]);
    const debounceRef = React.useRef(null);
    React.useEffect(() => {
      if (!window.VotSearch) {
        setBuildInfo({ ready: false, building: false, progress: null, error: "Search engine failed to load. Check browser console." });
        return;
      }
      if (window.VotSearch.getState().ready) {
        setBuildInfo({ ready: true, building: false, progress: null });
        return;
      }
      setBuildInfo({ ready: false, building: true, progress: null });
      window.VotSearch.init({
        onProgress: (done, total) => setBuildInfo((b) => ({ ...b, progress: { done, total } }))
      }).then(() => setBuildInfo({ ready: true, building: false, progress: null })).catch((err) => setBuildInfo({ ready: false, building: false, progress: null, error: err?.message || String(err) }));
    }, []);
    React.useEffect(() => {
      const t = setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 80);
      return () => clearTimeout(t);
    }, []);
    const [suggestDismissed, setSuggestDismissed] = React.useState(false);
    React.useEffect(() => {
      setSuggestDismissed(false);
    }, [query]);
    React.useEffect(() => {
      const q = (query || "").trim();
      if (!q || q.length < 1 || q.length > 40) {
        setSuggestions([]);
        setShowSuggest(false);
        return;
      }
      const s = window.VotSearch.suggest(q, { max: 8 });
      setSuggestions(s);
      setShowSuggest(s.length > 0 && !buildInfo.building && !suggestDismissed);
    }, [query, buildInfo.building, suggestDismissed]);
    React.useEffect(() => {
      if (!buildInfo.ready) return;
      const q = (query || "").trim();
      if (!q) {
        setState({ phase: "idle", parsed: null, results: [], terms: [], error: null, total: 0 });
        return;
      }
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        window.VotSearch.search(q, {
          translation: settings.translation || "nkjv",
          useStopWords: settings.searchUseStopWords !== false,
          scope: searchScope || null,
          corpus: settings.searchCorpus || "all",
          limit: 400
        }).then((r) => {
          const terms = r.parsed && r.parsed.kind === "text" ? [r.parsed.phrase].filter(Boolean).concat(r.parsedTerms || []) : [];
          setState({ phase: "done", parsed: r.parsed, results: r.results || [], terms, error: r.error ? String(r.error) : null, total: (r.results || []).length });
        }).catch((err) => {
          setState({ phase: "done", parsed: null, results: [], terms: [], error: err?.message || String(err), total: 0 });
        });
      }, 140);
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }, [query, buildInfo.ready, settings.translation, settings.searchUseStopWords, settings.searchCorpus, searchScope]);
    React.useEffect(() => {
      if (state.parsed && state.parsed.kind === "command") {
        if (onCommand) onCommand(state.parsed.action);
      }
    }, [state.parsed]);
    const grouped = React.useMemo(() => {
      if (!state.results.length) return [];
      const groups = {};
      for (let i = 0; i < state.results.length; i++) {
        const entry = state.results[i];
        const g = srchGroupKey(entry.doc);
        if (!groups[g]) groups[g] = [];
        groups[g].push(entry);
      }
      const keys = Object.keys(groups);
      keys.sort((a, b) => {
        const aTop = groups[a][0]?.score || 0;
        const bTop = groups[b][0]?.score || 0;
        if (aTop !== bTop) return bTop - aTop;
        return (SRCH_GROUP_META[a]?.order || 99) - (SRCH_GROUP_META[b]?.order || 99);
      });
      return keys.map((k) => ({ key: k, items: groups[k] }));
    }, [state.results]);
    const directEntries = React.useMemo(() => {
      const p = state.parsed;
      if (!p) return [];
      const curCorpus = settings.searchCorpus || "all";
      const allowBible = curCorpus === "all" || curCorpus === "scriptures";
      const allowLetter = curCorpus === "all" || curCorpus === "volumes";
      const out = [];
      if ((p.kind === "ref-bible" || p.kind === "named-passage") && allowBible) {
        const lbl = p.bookTitle + " " + p.chapter + (p.chapterEnd ? "\u2013" + p.chapterEnd : "") + (p.verseStart ? ":" + p.verseStart + (p.verseEnd ? "-" + p.verseEnd : "") : "");
        out.push({ __direct: true, __corpus: curCorpus, __label: lbl, __sub: p.kind === "named-passage" ? "Named passage \u2014 open" : "Open chapter", ref: p });
      } else if (p.kind === "ref-letter" && allowLetter) {
        out.push({ __direct: true, __corpus: curCorpus, __label: p.label, __sub: "Open letter", ref: p });
      } else if (p.kind === "ref-book" && allowBible) {
        out.push({ __direct: true, __corpus: curCorpus, __label: p.bookTitle, __sub: "Open book index", ref: p });
      }
      return out;
    }, [state.parsed, settings.searchCorpus]);
    const topResults = React.useMemo(() => {
      if (!state.results.length) return [];
      if (directEntries.length > 0) return [];
      const corpus = settings.searchCorpus || "all";
      if (corpus !== "all") return [];
      if (grouped.length <= 1) return [];
      return state.results.slice(0, 5);
    }, [state.results, grouped.length, settings.searchCorpus, directEntries.length]);
    const didYouMean = React.useMemo(() => {
      if (!state.parsed || state.parsed.kind !== "text" || state.results.length) return null;
      const q = (query || "").trim();
      if (!q || q.length < 4 || q.length > 15) return null;
      if (/\s/.test(q)) return null;
      if (/[0-9:.,;-]/.test(q)) return null;
      const guess = window.VotSearch.fuzzyBookSuggest(q);
      if (!guess) return null;
      const disp = window.VotSearchData.BOOK_DISPLAY[guess] || guess;
      if (disp.toLowerCase() === q.toLowerCase()) return null;
      return { original: q, suggestion: disp, rewrite: disp };
    }, [state.parsed, state.results.length, query]);
    const clearQuery = () => {
      onQueryChange("");
      setShowSuggest(false);
      setSuggestDismissed(true);
    };
    const fireSuggestion = (sug) => {
      onQueryChange(sug.query);
      setShowSuggest(false);
      setSuggestDismissed(true);
    };
    const handleKey = (e) => {
      if (e.key === "Escape") {
        if (showSuggest) {
          setShowSuggest(false);
          setSuggestDismissed(true);
        } else if (query) {
          clearQuery();
        } else
          onBack();
      }
    };
    return /* @__PURE__ */ React.createElement(ScreenLayout, { hideTabsBtn: true, navChildren: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "nav-home", onClick: onBack, "aria-label": "Back" }, "\u2190"), /* @__PURE__ */ React.createElement("div", { className: "srch-input-row" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        ref: inputRef,
        className: "search-input",
        type: "text",
        placeholder: "Search scriptures, volumes, studies\u2026",
        value: query,
        onChange: (e) => onQueryChange(e.target.value),
        onFocus: () => setShowSuggest(suggestions.length > 0),
        onKeyDown: handleKey,
        autoComplete: "off",
        autoCorrect: "off",
        spellCheck: false
      }
    ), query ? /* @__PURE__ */ React.createElement("button", { className: "srch-clear-btn", onClick: clearQuery }, "\u2715") : null)) }, /* @__PURE__ */ React.createElement("div", { className: "search-screen" }, /* @__PURE__ */ React.createElement("div", { className: "srch-corpus-row", role: "tablist", "aria-label": "Search corpus" }, [
      { k: "all", label: "All" },
      { k: "scriptures", label: "Scriptures" },
      { k: "volumes", label: "Volumes" }
    ].map((opt) => {
      const active = (settings.searchCorpus || "all") === opt.k;
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          key: opt.k,
          role: "tab",
          "aria-selected": active,
          className: "srch-corpus-btn" + (active ? " active" : ""),
          onClick: () => onSettingsChange("searchCorpus", opt.k)
        },
        opt.label
      );
    })), searchContext && /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "srch-scope-chip " + (searchScope ? "active" : ""),
        onClick: onToggleScope
      },
      searchScope ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { className: "srch-scope-chip-icon" }, "\u2713"), /* @__PURE__ */ React.createElement("span", null, "Scoped to ", searchContext.label), /* @__PURE__ */ React.createElement("span", { className: "srch-scope-chip-x" }, "\u2715")) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { className: "srch-scope-chip-icon" }, "\u2315"), /* @__PURE__ */ React.createElement("span", null, "Search in ", searchContext.label))
    ), buildInfo.error && /* @__PURE__ */ React.createElement("div", { className: "srch-error" }, buildInfo.error), buildInfo.building && !buildInfo.progress && /* @__PURE__ */ React.createElement("div", { className: "srch-progress" }, /* @__PURE__ */ React.createElement("span", null, "Building search index\u2026")), buildInfo.building && buildInfo.progress && /* @__PURE__ */ React.createElement("div", { className: "srch-progress" }, /* @__PURE__ */ React.createElement("span", null, "Building search index\u2026 ", buildInfo.progress.done.toLocaleString(), " / ", buildInfo.progress.total.toLocaleString()), /* @__PURE__ */ React.createElement("div", { className: "srch-progress-bar" }, /* @__PURE__ */ React.createElement("div", { className: "srch-progress-bar-fill", style: { width: 100 * buildInfo.progress.done / Math.max(1, buildInfo.progress.total) + "%" } }))), showSuggest && suggestions.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "srch-suggest" }, suggestions.map((s, i) => /* @__PURE__ */ React.createElement("button", { key: i, className: "srch-suggest-item", onMouseDown: (e) => {
      e.preventDefault();
      fireSuggestion(s);
    } }, /* @__PURE__ */ React.createElement("span", { className: "srch-suggest-kind" }, s.kind), /* @__PURE__ */ React.createElement("span", { className: "srch-suggest-label" }, s.label), s.hint && /* @__PURE__ */ React.createElement("span", { className: "srch-suggest-hint" }, s.hint)))), state.error && /* @__PURE__ */ React.createElement("div", { className: "srch-error" }, "Error: ", state.error), !query && buildInfo.ready && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "srch-empty-hero" }, /* @__PURE__ */ React.createElement("h3", null, "Search everything"), /* @__PURE__ */ React.createElement("p", null, "Verses, letters, study notes, headings, footnotes \u2014 across all 66 books and every Volume.")), /* @__PURE__ */ React.createElement("div", { className: "srch-section-label" }, "Quick picks"), /* @__PURE__ */ React.createElement("div", { className: "srch-quick-row" }, SRCH_QUICK_PICKS.map((q) => /* @__PURE__ */ React.createElement("button", { key: q, className: "srch-quick-chip", onClick: () => onQueryChange(q.toLowerCase()) }, q)))), didYouMean && /* @__PURE__ */ React.createElement("div", { className: "srch-did-you-mean" }, "No results for \u201C", didYouMean.original, "\u201D \u2014 did you mean ", /* @__PURE__ */ React.createElement("button", { onClick: () => onQueryChange(didYouMean.rewrite) }, didYouMean.suggestion), "?"), query && buildInfo.ready && state.phase === "done" && state.results.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "srch-results-summary" }, "Found ", /* @__PURE__ */ React.createElement("strong", null, state.results.length, " ", state.results.length === 1 ? "match" : "matches"), " across ", /* @__PURE__ */ React.createElement("strong", null, grouped.length, " ", grouped.length === 1 ? "section" : "sections")), directEntries.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "srch-groups" }, directEntries.map((d, i) => /* @__PURE__ */ React.createElement(SrchCard, { key: "d" + i, entry: d, terms: [], onSelect, isDirect: true }))), topResults.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "srch-top-results" }, /* @__PURE__ */ React.createElement("div", { className: "srch-section-label" }, "Best Matches"), topResults.map((entry, i) => /* @__PURE__ */ React.createElement(SrchCard, { key: "top" + i, entry, terms: state.terms, onSelect }))), grouped.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "srch-groups" }, grouped.map((g, i) => /* @__PURE__ */ React.createElement(
      SrchGroup,
      {
        key: g.key + "|" + query,
        gkey: g.key,
        items: g.items,
        terms: state.terms,
        onSelect,
        defaultOpen: state.results.length <= 30 || i < 5
      }
    ))), query && buildInfo.ready && state.phase === "done" && state.results.length === 0 && directEntries.length === 0 && !didYouMean && /* @__PURE__ */ React.createElement("div", { className: "search-no-results" }, "No results for \u201C", query.trim(), "\u201D")));
  }

  // app/src/main/assets/src/ui/screens/BibleStudyIndex.jsx
  function BibleStudyIndex2({ study, onSelect, onBack, onSearch, onHistory, onSettings, currentChapter, theme, onThemeChange, isRead, markAsReadEnabled }) {
    const currentRef = React.useRef(null);
    const [expandedPart, setExpandedPart] = React.useState(null);
    React.useEffect(() => {
      if (currentChapter && study.parts) {
        const ownerPart = study.parts.find((p) => p.chapterIds.includes(currentChapter));
        if (ownerPart) setExpandedPart(ownerPart.num);
      }
    }, []);
    React.useEffect(() => {
      if (currentRef.current) {
        setTimeout(() => currentRef.current.scrollIntoView({ behavior: "smooth", block: "center" }), 180);
      }
    }, [expandedPart]);
    const resolveChapter = (cid) => (study.chapters || []).find((c) => c.id === cid);
    const renderChapterCard = (ch) => {
      if (!ch) return null;
      const isCurrent = ch.id === currentChapter;
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          key: ch.id,
          ref: isCurrent ? currentRef : null,
          className: `chapter-card-btn${isCurrent ? " is-current" : ""}`,
          onClick: () => onSelect(ch.id)
        },
        /* @__PURE__ */ React.createElement("span", { className: "chapter-card-num" }, ch.num),
        /* @__PURE__ */ React.createElement("div", { className: "chapter-card-divider" }),
        /* @__PURE__ */ React.createElement("div", { className: "chapter-card-info" }, ch.title ? /* @__PURE__ */ React.createElement("div", { className: "chapter-card-title" }, ch.title) : /* @__PURE__ */ React.createElement("div", { className: "chapter-card-title untitled" }, "Part ", ch.num)),
        markAsReadEnabled && isRead(ch.id) && /* @__PURE__ */ React.createElement("span", { className: "read-check" }, "\u2713")
      );
    };
    const navBar = /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "nav-home", onClick: onBack }, "\u2190 Studies"), /* @__PURE__ */ React.createElement(HomeBtn, null), /* @__PURE__ */ React.createElement(NavButtons, { onSettings, onHistory, onSearch, theme, onThemeChange }));
    return /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren: navBar }, /* @__PURE__ */ React.createElement("div", { className: "vol-index" }, /* @__PURE__ */ React.createElement("div", { className: "vol-index-header" }, /* @__PURE__ */ React.createElement("div", { className: "vol-index-eyebrow" }, "Bible/Letter Study"), /* @__PURE__ */ React.createElement("h1", { className: "vol-index-title" }, study.title), study.subtitle && /* @__PURE__ */ React.createElement("div", { className: "vol-index-subtitle" }, study.subtitle), /* @__PURE__ */ React.createElement("div", { className: "vol-index-ornament" }, /* @__PURE__ */ React.createElement("div", { className: "vol-index-ornament-line" }), /* @__PURE__ */ React.createElement("div", { className: "vol-index-ornament-diamond" }), /* @__PURE__ */ React.createElement("div", { className: "vol-index-ornament-line r" }))), /* @__PURE__ */ React.createElement("div", { className: "chapter-cards" }, study.parts ? /* @__PURE__ */ React.createElement(React.Fragment, null, study.prefaceId && renderChapterCard(resolveChapter(study.prefaceId)), study.parts.map((part) => {
      const partChapters = part.chapterIds.map(resolveChapter).filter(Boolean);
      const sectionCount = partChapters.length;
      const isSingleSection = sectionCount === 1;
      const isOpen = expandedPart === part.num;
      if (isSingleSection) {
        const ch = partChapters[0];
        const isCurrent = ch && ch.id === currentChapter;
        return /* @__PURE__ */ React.createElement(
          "button",
          {
            key: part.num,
            ref: isCurrent ? currentRef : null,
            className: `part-group-card${isCurrent ? " is-expanded" : ""}`,
            onClick: () => ch && onSelect(ch.id)
          },
          /* @__PURE__ */ React.createElement("div", { className: "part-group-info" }, /* @__PURE__ */ React.createElement("div", { className: "part-group-num" }, "Part ", part.num), /* @__PURE__ */ React.createElement("div", { className: "part-group-title" }, part.title), part.subtitle && /* @__PURE__ */ React.createElement("div", { className: "part-group-subtitle" }, part.subtitle)),
          markAsReadEnabled && ch && isRead(ch.id) && /* @__PURE__ */ React.createElement("span", { className: "read-check" }, "\u2713")
        );
      }
      return /* @__PURE__ */ React.createElement(React.Fragment, { key: part.num }, /* @__PURE__ */ React.createElement(
        "button",
        {
          className: `part-group-card${isOpen ? " is-expanded" : ""}`,
          onClick: () => setExpandedPart(isOpen ? null : part.num)
        },
        /* @__PURE__ */ React.createElement("div", { className: "part-group-info" }, /* @__PURE__ */ React.createElement("div", { className: "part-group-num" }, "Part ", part.num), /* @__PURE__ */ React.createElement("div", { className: "part-group-title" }, part.title), part.subtitle && /* @__PURE__ */ React.createElement("div", { className: "part-group-subtitle" }, part.subtitle)),
        /* @__PURE__ */ React.createElement("span", { className: `part-chevron${isOpen ? " is-open" : ""}` }, "\u203A")
      ), isOpen && /* @__PURE__ */ React.createElement("div", { className: "part-chapters" }, partChapters.map((ch) => renderChapterCard(ch))));
    })) : (
      /* Flat chapter list fallback for studies without parts */
      (study.chapters || []).map((ch) => renderChapterCard(ch))
    ))));
  }

  // app/src/main/assets/src/ui/screens/ChapterIndex.jsx
  function ChapterIndex2({ book, onSelect, onBack, onSearch, onHistory, onSettings, currentChapter, theme, onThemeChange, isRead, markAsReadEnabled, restoredNames, showChapterTitle }) {
    const currentRef = React.useRef(null);
    React.useEffect(() => {
      if (currentRef.current) {
        setTimeout(() => currentRef.current.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
      }
    }, []);
    const getChapterTitle = (ch) => {
      if (showChapterTitle === false) return null;
      if (restoredNames && typeof BOOKS_RESTORED !== "undefined" && BOOKS_RESTORED[book.id]) {
        const r = BOOKS_RESTORED[book.id].chapters.find((c) => c.num === ch.num);
        if (r && r.title) return r.title;
      }
      return ch.title;
    };
    return /* @__PURE__ */ React.createElement(
      ScreenLayout,
      {
        navChildren: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "nav-home", onClick: onBack }, "\u2190 Books"), /* @__PURE__ */ React.createElement(HomeBtn, null), /* @__PURE__ */ React.createElement(NavButtons, { onSettings, onHistory, onSearch, theme, onThemeChange }))
      },
      /* @__PURE__ */ React.createElement("div", { className: "vol-index" }, /* @__PURE__ */ React.createElement("div", { className: "vol-index-header" }, /* @__PURE__ */ React.createElement("div", { className: "vol-index-eyebrow" }, "Scriptures of Truth"), /* @__PURE__ */ React.createElement("h1", { className: "vol-index-title" }, book.title), /* @__PURE__ */ React.createElement("div", { className: "vol-index-subtitle" }, book.subtitle), /* @__PURE__ */ React.createElement("div", { className: "vol-index-ornament" }, /* @__PURE__ */ React.createElement("div", { className: "vol-index-ornament-line" }), /* @__PURE__ */ React.createElement("div", { className: "vol-index-ornament-diamond" }), /* @__PURE__ */ React.createElement("div", { className: "vol-index-ornament-line r" }))), /* @__PURE__ */ React.createElement("div", { className: "chapter-cards" }, book.chapters.map((ch, _i) => {
        const isCurrent = ch.num === currentChapter;
        return /* @__PURE__ */ React.createElement(
          "button",
          {
            key: ch.num,
            ref: isCurrent ? currentRef : null,
            className: `chapter-card-btn${isCurrent ? " is-current" : ""}`,
            onClick: () => onSelect(ch.num)
          },
          /* @__PURE__ */ React.createElement("span", { className: "chapter-card-num" }, ch.num),
          /* @__PURE__ */ React.createElement("div", { className: "chapter-card-divider" }),
          /* @__PURE__ */ React.createElement("div", { className: "chapter-card-info" }, (() => {
            const t = getChapterTitle(ch);
            return t ? /* @__PURE__ */ React.createElement("div", { className: "chapter-card-title" }, t) : /* @__PURE__ */ React.createElement("div", { className: "chapter-card-title untitled" }, "Chapter ", ch.num);
          })()),
          markAsReadEnabled && isRead(ch.num) && /* @__PURE__ */ React.createElement("span", { className: "read-check" }, "\u2713")
        );
      })))
    );
  }

  // app/src/main/assets/src/ui/screens/GardenView.jsx
  var GARDEN_PRELOAD_AHEAD = 5;
  var GARDEN_CRAWL_DELAY = 500;
  function GardenView2({ page, onPageChange, onBack, theme: _theme, onThemeChange: _onThemeChange, tier }) {
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState(false);
    const [jumpMode, setJumpMode] = React.useState(false);
    const [jumpInput, setJumpInput] = React.useState("");
    const jumpRef = React.useRef(null);
    const crawlRef = React.useRef(null);
    const pageRef = React.useRef(page);
    pageRef.current = page;
    React.useEffect(() => {
      if (window.AndroidBridge?.setImmersiveMode) window.AndroidBridge.setImmersiveMode(true);
      return () => {
        if (window.AndroidBridge?.setImmersiveMode) window.AndroidBridge.setImmersiveMode(false);
      };
    }, []);
    React.useEffect(() => {
      setError(false);
      setLoading(!gardenIsCached(page, tier));
      if (window.AndroidBridge?.resetZoom) window.AndroidBridge.resetZoom();
    }, [page, tier]);
    React.useEffect(() => {
      gardenPreload(page, tier);
      for (let i = page + 1; i <= Math.min(page + GARDEN_PRELOAD_AHEAD, GARDEN_TOTAL); i++) {
        gardenPreload(i, tier);
      }
    }, [page, tier]);
    React.useEffect(() => {
      let cancelled = false;
      let crawlPage = 1;
      const crawlNext = () => {
        if (cancelled) return;
        while (crawlPage <= GARDEN_TOTAL && gardenImageCache[gardenCacheKey(crawlPage, tier)]) crawlPage++;
        if (crawlPage > GARDEN_TOTAL) return;
        const cur = pageRef.current;
        if (crawlPage >= cur && crawlPage <= cur + GARDEN_PRELOAD_AHEAD) {
          crawlPage++;
        }
        if (crawlPage <= GARDEN_TOTAL && !gardenImageCache[gardenCacheKey(crawlPage, tier)]) {
          gardenPreload(crawlPage, tier);
          crawlPage++;
        }
        crawlRef.current = setTimeout(crawlNext, GARDEN_CRAWL_DELAY);
      };
      crawlRef.current = setTimeout(crawlNext, 1500);
      return () => {
        cancelled = true;
        if (crawlRef.current) clearTimeout(crawlRef.current);
      };
    }, [tier]);
    React.useEffect(() => {
      if (jumpMode && jumpRef.current) jumpRef.current.focus();
    }, [jumpMode]);
    const goNext = () => {
      if (page < GARDEN_TOTAL) onPageChange(page + 1);
    };
    const goPrev = () => {
      if (page > 1) onPageChange(page - 1);
    };
    const handleJump = () => {
      const n = parseInt(jumpInput, 10);
      if (n >= 1 && n <= GARDEN_TOTAL) onPageChange(n);
      setJumpMode(false);
      setJumpInput("");
    };
    React.useEffect(() => {
      if (window.AndroidBridge?.setZoomEnabled) window.AndroidBridge.setZoomEnabled(true);
      return () => {
        if (window.AndroidBridge?.setZoomEnabled) window.AndroidBridge.setZoomEnabled(false);
      };
    }, []);
    return /* @__PURE__ */ React.createElement("div", { className: "garden-fullscreen" }, /* @__PURE__ */ React.createElement("div", { className: "garden-top-bar" }, /* @__PURE__ */ React.createElement("button", { className: "garden-back-btn", onClick: onBack }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("polyline", { points: "15 18 9 12 15 6" }))), jumpMode ? /* @__PURE__ */ React.createElement("form", { className: "garden-jump-form", onSubmit: (e) => {
      e.preventDefault();
      handleJump();
    } }, /* @__PURE__ */ React.createElement(
      "input",
      {
        ref: jumpRef,
        type: "number",
        min: "1",
        max: GARDEN_TOTAL,
        className: "garden-jump-input",
        value: jumpInput,
        onChange: (e) => setJumpInput(e.target.value),
        onBlur: () => {
          setJumpMode(false);
          setJumpInput("");
        },
        placeholder: `1\u2013${GARDEN_TOTAL}`
      }
    ), /* @__PURE__ */ React.createElement("span", { className: "garden-jump-hint" }, "/ ", GARDEN_TOTAL)) : /* @__PURE__ */ React.createElement("button", { className: "garden-page-counter", onClick: () => setJumpMode(true) }, page, " / ", GARDEN_TOTAL)), /* @__PURE__ */ React.createElement("div", { className: "garden-image-area" }, loading && /* @__PURE__ */ React.createElement("div", { className: "garden-loading" }, /* @__PURE__ */ React.createElement("div", { style: { color: "rgba(255,255,255,0.6)", fontSize: "0.9rem" } }, error ? "Failed to load \u2014 check your connection" : `Loading page ${page}...`)), /* @__PURE__ */ React.createElement(
      "img",
      {
        key: `${tier}-${page}`,
        src: gardenUrl(page, tier),
        alt: `Garden page ${page}`,
        className: "garden-page-img",
        style: { opacity: loading ? 0 : 1, transition: "opacity 0.3s" },
        onLoad: () => setLoading(false),
        onError: () => {
          setLoading(true);
          setError(true);
        }
      }
    )), /* @__PURE__ */ React.createElement("div", { className: "garden-bottom-bar" }, /* @__PURE__ */ React.createElement("button", { className: "garden-arrow-btn", onClick: goPrev, disabled: page <= 1 }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("polyline", { points: "15 18 9 12 15 6" }))), /* @__PURE__ */ React.createElement("button", { className: "garden-arrow-btn", onClick: goNext, disabled: page >= GARDEN_TOTAL }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("polyline", { points: "9 6 15 12 9 18" })))));
  }

  // app/src/main/assets/src/ui/screens/ScriptureGenre.jsx
  function ScriptureGenre2({ genreId, onSelect, onBack, onSearch, onHistory, onSettings, theme, onThemeChange }) {
    const genre = [...SCRIPTURE_GENRES.ot, ...SCRIPTURE_GENRES.nt].find((g) => g.id === genreId);
    if (!genre) return null;
    const testament = SCRIPTURE_GENRES.nt.some((g) => g.id === genreId) ? "New Testament" : "Old Testament";
    return /* @__PURE__ */ React.createElement(
      ScreenLayout,
      {
        navChildren: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "nav-home", onClick: onBack }, "\u2190 Scriptures"), /* @__PURE__ */ React.createElement(HomeBtn, null), /* @__PURE__ */ React.createElement(NavButtons, { onSettings, onHistory, onSearch, theme, onThemeChange }))
      },
      /* @__PURE__ */ React.createElement("div", { className: "vol-index" }, /* @__PURE__ */ React.createElement("div", { className: "vol-index-header" }, /* @__PURE__ */ React.createElement("div", { className: "vol-index-eyebrow" }, testament), /* @__PURE__ */ React.createElement("h1", { className: "vol-index-title" }, genre.label), /* @__PURE__ */ React.createElement("div", { className: "vol-index-ornament" }, /* @__PURE__ */ React.createElement("div", { className: "vol-index-ornament-line" }), /* @__PURE__ */ React.createElement("div", { className: "vol-index-ornament-diamond" }), /* @__PURE__ */ React.createElement("div", { className: "vol-index-ornament-line r" }))), /* @__PURE__ */ React.createElement("div", { className: "chapter-cards" }, genre.books.map((b, i) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: b.id,
          className: "chapter-card-btn",
          onClick: () => onSelect(b.id)
        },
        /* @__PURE__ */ React.createElement("span", { className: "chapter-card-num" }, i + 1),
        /* @__PURE__ */ React.createElement("div", { className: "chapter-card-divider" }),
        /* @__PURE__ */ React.createElement("div", { className: "chapter-card-info" }, /* @__PURE__ */ React.createElement("div", { className: "chapter-card-label" }, b.detail), /* @__PURE__ */ React.createElement("div", { className: "chapter-card-title" }, b.title))
      ))))
    );
  }

  // app/src/main/assets/src/ui/screens/ScripturesHome.jsx
  function ScripturesHome2({ onSelect, onGenre, onBack, onSearch, onHistory, onSettings, theme, onThemeChange, onMatthewStudy: _onMatthewStudy, layout }) {
    const handleTile = (group) => {
      if (group.single) {
        onSelect(group.books[0].id, true);
      } else
        onGenre(group.id);
    };
    const handleBook = (id) => {
      onSelect(id);
    };
    const allGenres = [...SCRIPTURE_GENRES.ot, ...SCRIPTURE_GENRES.nt];
    const allBooks = allGenres.flatMap((g) => g.books);
    const navBar = /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "nav-home", onClick: onBack }, "\u2190 Home"), /* @__PURE__ */ React.createElement(NavButtons, { onSettings, onHistory, onSearch, theme, onThemeChange }));
    const hero = /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "home-eyebrow" }, "New King James Version"), /* @__PURE__ */ React.createElement("h1", { className: "home-title" }, "The Scriptures of Truth"), /* @__PURE__ */ React.createElement("div", { className: "home-ornament" }, /* @__PURE__ */ React.createElement("div", { className: "home-ornament-line" }), /* @__PURE__ */ React.createElement("div", { className: "home-ornament-diamond" }), /* @__PURE__ */ React.createElement("div", { className: "home-ornament-line r" })));
    if (layout === "genre" || !layout) return /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren: navBar }, /* @__PURE__ */ React.createElement("div", { className: "home-screen scriptures-landing" }, hero, /* @__PURE__ */ React.createElement("div", { className: "genre-columns" }, /* @__PURE__ */ React.createElement("div", { className: "genre-col genre-col-stretch" }, /* @__PURE__ */ React.createElement("div", { className: "genre-col-label" }, "Old Testament"), SCRIPTURE_GENRES.ot.map((g) => {
      const totalCh = g.books.reduce((s, b) => s + (BOOKS[b.id]?.chapters.length || 0), 0);
      const bookCount = g.books.length;
      const bookLabel = `${bookCount} ${bookCount === 1 ? "Book" : "Books"}`;
      return /* @__PURE__ */ React.createElement("button", { key: g.id, className: "genre-tile", onClick: () => handleTile(g) }, /* @__PURE__ */ React.createElement("div", { className: "genre-tile-title" }, g.label), /* @__PURE__ */ React.createElement("div", { className: "genre-tile-sub" }, bookLabel, " \xB7 ", totalCh, " Chapters"));
    })), /* @__PURE__ */ React.createElement("div", { className: "genre-col genre-col-stretch" }, /* @__PURE__ */ React.createElement("div", { className: "genre-col-label" }, "New Testament"), SCRIPTURE_GENRES.nt.map((g) => {
      const totalCh = g.books.reduce((s, b) => s + (BOOKS[b.id]?.chapters.length || 0), 0);
      const bookCount = g.books.length;
      const bookLabel = `${bookCount} ${bookCount === 1 ? "Book" : "Books"}`;
      return /* @__PURE__ */ React.createElement("button", { key: g.id, className: "genre-tile", onClick: () => handleTile(g) }, /* @__PURE__ */ React.createElement("div", { className: "genre-tile-title" }, g.label), /* @__PURE__ */ React.createElement("div", { className: "genre-tile-sub" }, bookLabel, " \xB7 ", totalCh, " Chapters"));
    })))));
    if (layout === "compact") return /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren: navBar }, /* @__PURE__ */ React.createElement("div", { className: "home-screen" }, hero, /* @__PURE__ */ React.createElement("div", { className: "compact-list" }, [
      { label: "Old Testament", genres: SCRIPTURE_GENRES.ot },
      { label: "New Testament", genres: SCRIPTURE_GENRES.nt }
    ].map((section) => /* @__PURE__ */ React.createElement(React.Fragment, { key: section.label }, /* @__PURE__ */ React.createElement("div", { className: "compact-list-header", style: { fontSize: "0.65rem", color: "var(--gold)", marginTop: "0.8rem" } }, section.label), section.genres.map((g) => /* @__PURE__ */ React.createElement("div", { key: g.id, className: "compact-list-group" }, /* @__PURE__ */ React.createElement("div", { className: "compact-list-header" }, g.label), g.books.map((b) => /* @__PURE__ */ React.createElement("button", { key: b.id, className: "compact-list-item", onClick: () => handleBook(b.id) }, /* @__PURE__ */ React.createElement("span", { className: "compact-list-title" }, b.title), /* @__PURE__ */ React.createElement("span", { className: "compact-list-detail" }, b.detail))))))))));
    if (layout === "grid") return /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren: navBar }, /* @__PURE__ */ React.createElement("div", { className: "home-screen" }, hero, /* @__PURE__ */ React.createElement("div", { className: "flat-grid" }, allBooks.map((b) => /* @__PURE__ */ React.createElement("button", { key: b.id, className: "flat-grid-card", onClick: () => handleBook(b.id) }, /* @__PURE__ */ React.createElement("div", { className: "flat-grid-title" }, b.title), /* @__PURE__ */ React.createElement("div", { className: "flat-grid-detail" }, b.detail))))));
    const otBooks = SCRIPTURE_GENRES.ot.flatMap((g) => g.books);
    const ntBooks = SCRIPTURE_GENRES.nt.flatMap((g) => g.books);
    let canonNum = 0;
    return /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren: navBar }, /* @__PURE__ */ React.createElement("div", { className: "home-screen" }, hero, /* @__PURE__ */ React.createElement("div", { className: "canon-scroll" }, /* @__PURE__ */ React.createElement("div", { className: "canon-scroll-divider" }, "Old Testament"), otBooks.map((b) => {
      canonNum++;
      return /* @__PURE__ */ React.createElement("button", { key: b.id, className: "canon-card", style: { animationDelay: `${canonNum * 0.3 % 5}s` }, onClick: () => handleBook(b.id) }, /* @__PURE__ */ React.createElement("span", { className: "canon-card-num" }, String(canonNum).padStart(2, "0")), /* @__PURE__ */ React.createElement("div", { className: "canon-card-body" }, /* @__PURE__ */ React.createElement("div", { className: "canon-card-title" }, b.title), CANON_SUBTITLES[b.id] && /* @__PURE__ */ React.createElement("div", { className: "canon-card-sub" }, CANON_SUBTITLES[b.id]), /* @__PURE__ */ React.createElement("div", { className: "canon-card-detail" }, b.detail)));
    }), /* @__PURE__ */ React.createElement("div", { className: "canon-scroll-divider" }, "New Testament"), ntBooks.map((b) => {
      canonNum++;
      return /* @__PURE__ */ React.createElement("button", { key: b.id, className: "canon-card", style: { animationDelay: `${canonNum * 0.3 % 5}s` }, onClick: () => handleBook(b.id) }, /* @__PURE__ */ React.createElement("span", { className: "canon-card-num" }, String(canonNum).padStart(2, "0")), /* @__PURE__ */ React.createElement("div", { className: "canon-card-body" }, /* @__PURE__ */ React.createElement("div", { className: "canon-card-title" }, b.title), CANON_SUBTITLES[b.id] && /* @__PURE__ */ React.createElement("div", { className: "canon-card-sub" }, CANON_SUBTITLES[b.id]), /* @__PURE__ */ React.createElement("div", { className: "canon-card-detail" }, b.detail)));
    }))));
  }

  // app/src/main/assets/src/ui/screens/LinksScreen.jsx
  function _linkEndpointCategory(ep) {
    if (!ep) return "";
    if (ep.type === "bible") return typeof bookCategory === "function" ? bookCategory(ep.bookId) : "Bible";
    if (ep.type === "study") return "Matthew Study Bible";
    if (ep.type === "study-letter") return ep.collection || "Bible Study";
    if (ep.type === "letter") return ep.collection || "Letter";
    if (ep.type === "wtlb") return ep.collection || "Words To Live By";
    if (ep.type === "blessed") return "The Blessed";
    if (ep.type === "holy-days") return "Holy Days";
    return ep.type || "";
  }
  function _endpointResolves(ep) {
    if (!ep || !ep.type || !ep.key) return false;
    if (ep.type === "bible") {
      var books = typeof _allBooks === "function" ? _allBooks() : {};
      return !!(ep.bookId && books[ep.bookId]);
    }
    if (ep.type === "study") {
      var M = typeof _matthew === "function" ? _matthew() : null;
      if (!M) return true;
      return !!(M.chapters && M.chapters.find(function(c) {
        return c.num === ep.chapter;
      }));
    }
    if (ep.type === "journal") {
      if (typeof JournalStore === "undefined") return true;
      var jid = ep.entryId || ep.key && ep.key.split(":")[1] || null;
      return !!(jid && JournalStore.get(jid));
    }
    if (typeof findEntryContext === "function") {
      var kind = ep.type === "letter" ? "letter" : ep.type === "wtlb" ? "wtlb" : ep.type === "blessed" ? "blessed" : ep.type === "holy-days" ? "holy-days" : null;
      var id = ep.letterId || ep.entryId || ep.key && ep.key.split(":")[1] || null;
      if (!id) return false;
      var ctx = findEntryContext(id, kind);
      return !!ctx;
    }
    return true;
  }
  function _epSearchText(ep) {
    if (!ep) return "";
    return [ep.label || "", _linkEndpointCategory(ep), ep.text || "", ep.preview || ""].join(" ").toLowerCase();
  }
  function LinkRow({ lnk, onNavigateSource, onNavigateTarget, onLongPress }) {
    var src = lnk.source;
    var tgt = lnk.target;
    var date = typeof relativeDate === "function" ? relativeDate(lnk.created) : "";
    var srcCat = _linkEndpointCategory(src);
    var tgtCat = _linkEndpointCategory(tgt);
    var srcPreview = src && (src.text || src.preview) || "";
    var tgtPreview = tgt && (tgt.text || tgt.preview) || "";
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "link-row",
        onContextMenu: function(e) {
          e.preventDefault();
          if (onLongPress) onLongPress(lnk, e);
        }
      },
      /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "link-row-side link-row-source",
          onClick: function() {
            if (onNavigateSource) onNavigateSource(lnk);
          },
          title: "Open source: " + (src && src.label ? src.label : "")
        },
        /* @__PURE__ */ React.createElement("span", { className: "link-row-side-eyebrow" }, "SOURCE"),
        /* @__PURE__ */ React.createElement("span", { className: "link-row-side-label" }, src && src.label ? src.label : "(unknown)"),
        srcCat && /* @__PURE__ */ React.createElement("span", { className: "link-row-side-cat" }, srcCat),
        srcPreview && /* @__PURE__ */ React.createElement("span", { className: "link-row-side-preview" }, srcPreview)
      ),
      /* @__PURE__ */ React.createElement("div", { className: "link-row-mid" }, /* @__PURE__ */ React.createElement(
        "svg",
        {
          className: "link-row-chain",
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: "1.6",
          strokeLinecap: "round",
          strokeLinejoin: "round"
        },
        /* @__PURE__ */ React.createElement("path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }),
        /* @__PURE__ */ React.createElement("path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" })
      ), date && /* @__PURE__ */ React.createElement("span", { className: "link-row-date" }, date)),
      /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "link-row-side link-row-target",
          onClick: function() {
            if (onNavigateTarget) onNavigateTarget(lnk);
          },
          title: "Open target: " + (tgt && tgt.label ? tgt.label : "")
        },
        /* @__PURE__ */ React.createElement("span", { className: "link-row-side-eyebrow" }, "TARGET"),
        /* @__PURE__ */ React.createElement("span", { className: "link-row-side-label" }, tgt && tgt.label ? tgt.label : "(unknown)"),
        tgtCat && /* @__PURE__ */ React.createElement("span", { className: "link-row-side-cat" }, tgtCat),
        tgtPreview && /* @__PURE__ */ React.createElement("span", { className: "link-row-side-preview" }, tgtPreview)
      )
    );
  }
  function LinkRowActionSheet({ lnk, onClose, onNavigateSource, onNavigateTarget, onDelete }) {
    var useState2 = React.useState;
    var _state = useState2(false);
    var confirming = _state[0];
    var setConfirming = _state[1];
    if (!lnk) return null;
    var doDelete = function() {
      LinkStore.remove(lnk.id);
      onDelete();
      onClose();
    };
    return /* @__PURE__ */ React.createElement("div", { className: "link-action-overlay", onClick: onClose }, /* @__PURE__ */ React.createElement("div", { className: "link-action-sheet", onClick: function(e) {
      e.stopPropagation();
    } }, /* @__PURE__ */ React.createElement("div", { className: "link-action-handle" }), !confirming && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "link-action-btn", onClick: function() {
      onNavigateSource(lnk);
      onClose();
    } }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "10" }), /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "8", x2: "12", y2: "16" }), /* @__PURE__ */ React.createElement("line", { x1: "8", y1: "12", x2: "16", y2: "12" })), /* @__PURE__ */ React.createElement("span", null, "Open Source")), /* @__PURE__ */ React.createElement("button", { className: "link-action-btn", onClick: function() {
      onNavigateTarget(lnk);
      onClose();
    } }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M5 12h14" }), /* @__PURE__ */ React.createElement("polyline", { points: "12 5 19 12 12 19" })), /* @__PURE__ */ React.createElement("span", null, "Open Target")), /* @__PURE__ */ React.createElement("button", { className: "link-action-btn link-action-btn-danger", onClick: function() {
      setConfirming(true);
    } }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("polyline", { points: "3 6 5 6 21 6" }), /* @__PURE__ */ React.createElement("path", { d: "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" }), /* @__PURE__ */ React.createElement("path", { d: "M10 11v6" }), /* @__PURE__ */ React.createElement("path", { d: "M14 11v6" })), /* @__PURE__ */ React.createElement("span", null, "Delete Link"))), confirming && /* @__PURE__ */ React.createElement("div", { className: "ann-chip-confirm", style: { padding: "14px 12px" } }, /* @__PURE__ */ React.createElement("span", { className: "ann-chip-confirm-q" }, "Delete this link?"), /* @__PURE__ */ React.createElement("button", { className: "ann-chip-confirm-btn ann-chip-confirm-cancel", onClick: function() {
      setConfirming(false);
    } }, "Cancel"), /* @__PURE__ */ React.createElement("button", { className: "ann-chip-confirm-btn ann-chip-confirm-yes", onClick: doDelete }, "Yes, delete"))));
  }
  function LinksScreen2(props) {
    var onBack = props.onBack;
    var onNavigateToSource = props.onNavigateToSource;
    var onNavigateToTarget = props.onNavigateToTarget;
    var hlTick = props.hlTick;
    var setHlTick = props.setHlTick;
    var theme = props.theme;
    var onThemeChange = props.onThemeChange;
    var onSearch = props.onSearch;
    var onHistory = props.onHistory;
    var useState2 = React.useState;
    var useMemo = React.useMemo;
    var _sq = useState2("");
    var searchQuery = _sq[0];
    var setSearchQuery = _sq[1];
    var _ss = useState2("recent");
    var sortMode = _ss[0];
    var setSortMode = _ss[1];
    var _as = useState2(null);
    var actionTarget = _as[0];
    var setActionTarget = _as[1];
    var allLinks = useMemo(function() {
      return LinkStore.all();
    }, [hlTick]);
    var displayLinks = useMemo(function() {
      var q = searchQuery.trim().toLowerCase();
      var filtered = q ? allLinks.filter(function(lnk) {
        return _epSearchText(lnk.source).includes(q) || _epSearchText(lnk.target).includes(q);
      }) : allLinks.slice();
      filtered.sort(function(a, b) {
        if (sortMode === "oldest") return (a.created || 0) - (b.created || 0);
        if (sortMode === "source-az") {
          var la = a.source && a.source.label ? a.source.label.toLowerCase() : "";
          var lb = b.source && b.source.label ? b.source.label.toLowerCase() : "";
          return la < lb ? -1 : la > lb ? 1 : 0;
        }
        if (sortMode === "target-az") {
          var ta = a.target && a.target.label ? a.target.label.toLowerCase() : "";
          var tb = b.target && b.target.label ? b.target.label.toLowerCase() : "";
          return ta < tb ? -1 : ta > tb ? 1 : 0;
        }
        return (b.created || 0) - (a.created || 0);
      });
      return filtered;
    }, [allLinks, searchQuery, sortMode]);
    var brokenLinks = useMemo(function() {
      return allLinks.filter(function(lnk) {
        return !_endpointResolves(lnk.source) || !_endpointResolves(lnk.target);
      });
    }, [allLinks]);
    var navigateToEndpoint = function(endpoint, label) {
      if (!endpoint) return;
      if (typeof onNavigateToSource === "function") {
        onNavigateToSource(endpoint, { sourceLetterTitle: label || "My Links" });
      }
    };
    var onNavigateSource = function(lnk) {
      navigateToEndpoint(lnk.source, "My Links");
    };
    var onNavigateTarget = function(lnk) {
      if (!lnk.target) return;
      if (typeof onNavigateToTarget === "function") {
        onNavigateToTarget(lnk.target, { sourceLetterTitle: "My Links" });
      } else {
        navigateToEndpoint(lnk.target, "My Links");
      }
    };
    var onDeleteFromSheet = function() {
      if (typeof setHlTick === "function") setHlTick(function(t) {
        return t + 1;
      });
    };
    var navChildren = LibraryNav({
      onBack,
      onSearch,
      onHistory,
      onSettings: props.onSettings,
      theme,
      onThemeChange
    });
    return /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren }, /* @__PURE__ */ React.createElement("div", { className: "links-screen" }, /* @__PURE__ */ React.createElement("div", { className: "notes-index-header" }, /* @__PURE__ */ React.createElement("h1", { className: "notes-index-title" }, "My Links"), /* @__PURE__ */ React.createElement("span", { className: "notes-index-count" }, allLinks.length, allLinks.length === 1 ? " link" : " links")), /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "notes-index-search",
        type: "search",
        placeholder: "Search links\u2026",
        value: searchQuery,
        onChange: function(e) {
          setSearchQuery(e.target.value);
        }
      }
    ), /* @__PURE__ */ React.createElement("div", { className: "notes-index-controls", style: { marginTop: "0.7rem" } }, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "notes-index-sort-btn",
        style: { marginLeft: "auto" },
        onClick: function() {
          setSortMode(function(m) {
            return m === "oldest" ? "recent" : "oldest";
          });
        },
        title: "Toggle sort order"
      },
      sortMode === "oldest" ? "Sort: Oldest \u2191" : "Sort: Newest \u2193"
    )), brokenLinks.length > 0 && !searchQuery && /* @__PURE__ */ React.createElement("div", { className: "links-broken-callout" }, /* @__PURE__ */ React.createElement("span", { className: "links-broken-icon" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }), /* @__PURE__ */ React.createElement("path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" }), /* @__PURE__ */ React.createElement("line", { x1: "2", y1: "2", x2: "22", y2: "22" }))), /* @__PURE__ */ React.createElement("span", { className: "links-broken-text" }, brokenLinks.length, brokenLinks.length === 1 ? " link points to content that can no longer be found (the source or target was deleted)." : " links point to content that can no longer be found (a source or target was deleted).", " Long-press a link to remove it.")), allLinks.length === 0 && /* @__PURE__ */ React.createElement("div", { className: "notes-empty" }, /* @__PURE__ */ React.createElement("div", { className: "notes-empty-title" }, "No Links Yet"), /* @__PURE__ */ React.createElement("div", { className: "notes-empty-hint" }, "Select text in any letter or Bible chapter, tap Link in the toolbar, and pick a destination. Your links will appear here.")), allLinks.length > 0 && displayLinks.length === 0 && /* @__PURE__ */ React.createElement("div", { className: "notes-empty" }, /* @__PURE__ */ React.createElement("div", { className: "notes-empty-title" }, "No Matches"), /* @__PURE__ */ React.createElement("div", { className: "notes-empty-hint" }, "Try a different search term.")), displayLinks.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "notes-index-list", style: { marginTop: "0.75rem" } }, displayLinks.map(function(lnk) {
      return /* @__PURE__ */ React.createElement(
        LinkRow,
        {
          key: lnk.id,
          lnk,
          onNavigateSource,
          onNavigateTarget,
          onLongPress: function(l) {
            setActionTarget(l);
          }
        }
      );
    })), actionTarget && /* @__PURE__ */ React.createElement(
      LinkRowActionSheet,
      {
        lnk: actionTarget,
        onClose: function() {
          setActionTarget(null);
        },
        onNavigateSource: function(lnk) {
          onNavigateSource(lnk);
          setActionTarget(null);
        },
        onNavigateTarget: function(lnk) {
          onNavigateTarget(lnk);
          setActionTarget(null);
        },
        onDelete: onDeleteFromSheet
      }
    )));
  }

  // app/src/main/assets/src/ui/screens/BookmarksScreen.jsx
  function _bookmarkSourceLabel2(hlKey) {
    if (!hlKey) return "Bookmark";
    var parts = hlKey.split(":");
    var kind = parts[0];
    if (kind === "bible") {
      var bookId = parts[1];
      var chap = parts[2];
      var verse = parts[3];
      let title = typeof _bookTitle === "function" ? _bookTitle(bookId) : bookId;
      return verse ? title + " " + chap + ":" + verse : title + " " + chap;
    }
    if (kind === "study") {
      var raw = parts[1] || "";
      var m = raw.match(/^(.+)-(\d+)$/);
      var bookName = m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : raw;
      var chapNum = m ? m[2] : "";
      var vs = parts[2] || "";
      return vs ? bookName + " " + chapNum + ":" + vs : bookName;
    }
    if (kind === "letter" || kind === "wtlb" || kind === "blessed" || kind === "holy-days") {
      var id = parts[1];
      if (typeof findEntryContext === "function") {
        var ctx = findEntryContext(id, kind === "letter" ? "letter" : kind);
        if (ctx && ctx.title) return ctx.title;
      }
      return id;
    }
    if (kind === "journal") {
      var eid = parts[1];
      var je = typeof JournalStore !== "undefined" ? JournalStore.get(eid) : null;
      if (je) {
        let title = typeof JournalHelpers !== "undefined" && JournalHelpers.entryDisplayTitle ? JournalHelpers.entryDisplayTitle(je) || "Untitled" : je.title || "Untitled";
        return "Journal \xB7 " + title;
      }
      return "Journal Entry";
    }
    return hlKey;
  }
  function _bookmarkSourceEndpoint2(hlKey) {
    if (!hlKey) return null;
    var parts = hlKey.split(":");
    var kind = parts[0];
    if (kind === "bible") {
      return { type: "bible", key: hlKey, bookId: parts[1], chapter: parseInt(parts[2] || "0", 10), verse: parseInt(parts[3] || "0", 10) };
    }
    if (kind === "study") {
      var m = (parts[1] || "").match(/^(.+)-(\d+)$/);
      if (m) return { type: "study", key: hlKey, bookId: m[1], chapter: parseInt(m[2], 10), verse: parseInt(parts[2] || "0", 10) };
    }
    if (kind === "letter" || kind === "wtlb" || kind === "blessed" || kind === "holy-days") {
      var ctx = typeof findEntryContext === "function" ? findEntryContext(parts[1], kind) : null;
      return { type: kind, key: hlKey, letterId: parts[1], entryId: parts[1], screen: ctx ? ctx.screen : null };
    }
    if (kind === "journal") {
      return { type: "journal", key: hlKey, entryId: parts[1], screen: "journal-viewer" };
    }
    return null;
  }
  function BookmarkRow({ bkm, onNavigate, onLongPress, editingId, onEditStart: _onEditStart, onEditSave, onEditCancel }) {
    var useState2 = React.useState;
    var useEffect2 = React.useEffect;
    var useRef = React.useRef;
    var inputRef = useRef(null);
    var _editState = useState2(bkm.label || "");
    var editValue = _editState[0];
    var setEditValue = _editState[1];
    var isEditing = editingId === bkm.id;
    var sourceLabel = _bookmarkSourceLabel2(bkm.hlKey);
    var date = typeof relativeDate === "function" ? relativeDate(bkm.updated || bkm.created) : "";
    var hasThought = !isEditing && bkm.thought && bkm.thought.trim();
    useEffect2(function() {
      if (isEditing) {
        setEditValue(bkm.label || "");
        setTimeout(function() {
          if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
          }
        }, 50);
      }
    }, [isEditing]);
    var commitEdit = function() {
      var v = editValue.trim();
      if (v) onEditSave(bkm.id, v);
      else onEditCancel();
    };
    var onKeyDown = function(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        commitEdit();
      } else if (e.key === "Escape") {
        onEditCancel();
      }
    };
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "bkm-row",
        onContextMenu: function(e) {
          e.preventDefault();
          if (onLongPress) onLongPress(bkm, e);
        }
      },
      /* @__PURE__ */ React.createElement(
        "div",
        {
          className: "bkm-row-content" + (isEditing ? " is-disabled" : ""),
          role: "button",
          tabIndex: isEditing ? -1 : 0,
          onClick: function() {
            if (!isEditing && onNavigate) onNavigate(bkm);
          },
          onKeyDown: function(e) {
            if ((e.key === "Enter" || e.key === " ") && !isEditing && onNavigate) {
              e.preventDefault();
              onNavigate(bkm);
            }
          }
        },
        /* @__PURE__ */ React.createElement("span", { className: "bkm-row-source" }, sourceLabel),
        isEditing ? /* @__PURE__ */ React.createElement(
          "input",
          {
            ref: inputRef,
            className: "bkm-row-edit-input",
            type: "text",
            value: editValue,
            onChange: function(e) {
              setEditValue(e.target.value);
            },
            onKeyDown,
            onBlur: commitEdit,
            onClick: function(e) {
              e.stopPropagation();
            },
            placeholder: "Bookmark label",
            maxLength: 200
          }
        ) : /* @__PURE__ */ React.createElement("span", { className: "bkm-row-label" }, bkm.label || "(no label)"),
        hasThought && (typeof JrnExpandable !== "undefined" ? /* @__PURE__ */ React.createElement("div", { className: "bkm-row-thought", onClick: function(e) {
          e.stopPropagation();
        } }, /* @__PURE__ */ React.createElement(JrnExpandable, { text: bkm.thought, threshold: 140, className: "bkm-row-thought-body" })) : /* @__PURE__ */ React.createElement("span", { className: "bkm-row-thought" }, bkm.thought))
      ),
      /* @__PURE__ */ React.createElement("div", { className: "bkm-row-meta" }, date && /* @__PURE__ */ React.createElement("span", { className: "bkm-row-date" }, date), /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "bkm-row-more",
          onClick: function(e) {
            e.stopPropagation();
            if (onLongPress) onLongPress(bkm, e);
          },
          title: "Options",
          "aria-label": "Bookmark options"
        },
        /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "5", r: "1" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "1" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "19", r: "1" }))
      ))
    );
  }
  function BookmarkRowActionSheet({ bkm, onClose, onNavigate, onEditLabel, onEditThought, onDelete }) {
    var useState2 = React.useState;
    var _state = useState2(false);
    var confirming = _state[0];
    var setConfirming = _state[1];
    var _te = useState2(false);
    var editingThought = _te[0];
    var setEditingThought = _te[1];
    var _tt = useState2("");
    var thoughtText = _tt[0];
    var setThoughtText = _tt[1];
    if (!bkm) return null;
    var hasThought = !!(bkm.thought && bkm.thought.trim());
    function startEditThought() {
      setThoughtText(bkm.thought || "");
      setEditingThought(true);
      setConfirming(false);
    }
    function saveThought() {
      BookmarkStore.update(bkm.id, { thought: thoughtText });
      if (typeof onEditThought === "function") onEditThought();
      setEditingThought(false);
      onClose();
    }
    function cancelEditThought() {
      setEditingThought(false);
      setThoughtText("");
    }
    var doDelete = function() {
      BookmarkStore.remove(bkm.id);
      onDelete();
      onClose();
    };
    return /* @__PURE__ */ React.createElement("div", { className: "link-action-overlay", onClick: onClose }, /* @__PURE__ */ React.createElement("div", { className: "link-action-sheet", onClick: function(e) {
      e.stopPropagation();
    } }, /* @__PURE__ */ React.createElement("div", { className: "link-action-handle" }), !confirming && !editingThought && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "link-action-btn", onClick: function() {
      onNavigate(bkm);
      onClose();
    } }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }), /* @__PURE__ */ React.createElement("polyline", { points: "15 3 21 3 21 9" }), /* @__PURE__ */ React.createElement("line", { x1: "10", y1: "14", x2: "21", y2: "3" })), /* @__PURE__ */ React.createElement("span", null, "Open Bookmark")), /* @__PURE__ */ React.createElement("button", { className: "link-action-btn", onClick: function() {
      onEditLabel(bkm.id);
      onClose();
    } }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" }), /* @__PURE__ */ React.createElement("path", { d: "M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" })), /* @__PURE__ */ React.createElement("span", null, "Edit Label")), /* @__PURE__ */ React.createElement("button", { className: "link-action-btn", onClick: startEditThought }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" })), /* @__PURE__ */ React.createElement("span", null, hasThought ? "Edit Thought" : "Add Thought")), /* @__PURE__ */ React.createElement("button", { className: "link-action-btn link-action-btn-danger", onClick: function() {
      setConfirming(true);
    } }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("polyline", { points: "3 6 5 6 21 6" }), /* @__PURE__ */ React.createElement("path", { d: "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" }), /* @__PURE__ */ React.createElement("path", { d: "M10 11v6" }), /* @__PURE__ */ React.createElement("path", { d: "M14 11v6" })), /* @__PURE__ */ React.createElement("span", null, "Delete Bookmark"))), editingThought && !confirming && /* @__PURE__ */ React.createElement("div", { className: "bkm-action-thought-edit" }, /* @__PURE__ */ React.createElement("div", { className: "bkm-action-thought-prompt" }, "Why did you bookmark this?"), /* @__PURE__ */ React.createElement(
      "textarea",
      {
        className: "bkm-popover-thought-textarea",
        autoFocus: true,
        value: thoughtText,
        placeholder: "A few words for your future self\u2026",
        onChange: function(e) {
          setThoughtText(e.target.value);
        },
        onKeyDown: function(e) {
          if (e.key === "Escape") {
            e.preventDefault();
            cancelEditThought();
          }
        }
      }
    ), /* @__PURE__ */ React.createElement("div", { className: "bkm-action-thought-actions" }, /* @__PURE__ */ React.createElement("button", { className: "link-action-btn", onClick: cancelEditThought }, /* @__PURE__ */ React.createElement("span", null, "Cancel")), /* @__PURE__ */ React.createElement("button", { className: "link-action-btn", onClick: saveThought, style: { color: "var(--gold)" } }, /* @__PURE__ */ React.createElement("span", null, "Save")))), confirming && /* @__PURE__ */ React.createElement("div", { className: "ann-chip-confirm", style: { padding: "14px 12px" } }, /* @__PURE__ */ React.createElement("span", { className: "ann-chip-confirm-q" }, "Delete this bookmark?"), /* @__PURE__ */ React.createElement("button", { className: "ann-chip-confirm-btn ann-chip-confirm-cancel", onClick: function() {
      setConfirming(false);
    } }, "Cancel"), /* @__PURE__ */ React.createElement("button", { className: "ann-chip-confirm-btn ann-chip-confirm-yes", onClick: doDelete }, "Yes, delete"))));
  }
  function BookmarkPopover2({ bkmIds, x, y, onClose, onNavigate, onDeleteDone }) {
    var useState2 = React.useState;
    var _ci = useState2(null);
    var confirmingId = _ci[0];
    var setConfirmingId = _ci[1];
    var _ei = useState2(null);
    var editingId = _ei[0];
    var setEditingId = _ei[1];
    var _et = useState2("");
    var editText = _et[0];
    var setEditText = _et[1];
    var _tick = useState2(0);
    var setTick = _tick[1];
    function bump() {
      setTick(function(t) {
        return t + 1;
      });
    }
    if (!bkmIds || !bkmIds.length) return null;
    var bookmarks = bkmIds.map(function(id) {
      return BookmarkStore.get(id);
    }).filter(Boolean);
    if (!bookmarks.length) {
      onClose();
      return null;
    }
    function doDelete(bkm) {
      BookmarkStore.remove(bkm.id);
      onDeleteDone && onDeleteDone();
      if (bookmarks.length <= 1) onClose();
      else setConfirmingId(null);
    }
    function startEditThought(bkm) {
      setEditingId(bkm.id);
      setEditText(bkm.thought || "");
      setConfirmingId(null);
    }
    function saveThought(bkm) {
      BookmarkStore.update(bkm.id, { thought: editText });
      setEditingId(null);
      bump();
    }
    function cancelEditThought() {
      setEditingId(null);
      setEditText("");
    }
    var popX = Math.max(8, Math.min(x - 80, window.innerWidth - 320));
    var popY = Math.max(8, y);
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { position: "fixed", inset: 0, zIndex: 8800 }, onClick: onClose }), /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "bkm-popover",
        style: { left: popX, top: popY, zIndex: 8801 },
        onClick: function(e) {
          e.stopPropagation();
        }
      },
      bookmarks.map(function(bkm) {
        var isConfirming = confirmingId === bkm.id;
        var isEditing = editingId === bkm.id;
        var dateStr = typeof relativeDate === "function" ? relativeDate(bkm.created) : "";
        var hasThought = !!(bkm.thought && bkm.thought.trim().length);
        return /* @__PURE__ */ React.createElement("div", { key: bkm.id, className: "bkm-popover-item" }, !isConfirming && !isEditing && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "bkm-popover-label" }, bkm.label || "(no label)"), dateStr && /* @__PURE__ */ React.createElement("div", { className: "bkm-popover-date" }, dateStr), hasThought && /* @__PURE__ */ React.createElement("div", { className: "bkm-popover-thought" }, bkm.thought), /* @__PURE__ */ React.createElement("div", { className: "bkm-popover-actions" }, /* @__PURE__ */ React.createElement("button", { className: "bkm-popover-btn", onClick: function() {
          onNavigate(bkm);
          onClose();
        } }, "Open"), /* @__PURE__ */ React.createElement("button", { className: "bkm-popover-btn", onClick: function() {
          startEditThought(bkm);
        } }, hasThought ? "Edit Thought" : "Add Thought"), /* @__PURE__ */ React.createElement("button", { className: "bkm-popover-btn bkm-popover-btn-danger", onClick: function() {
          setConfirmingId(bkm.id);
        } }, "Delete"))), isEditing && /* @__PURE__ */ React.createElement("div", { className: "bkm-popover-thought-edit" }, /* @__PURE__ */ React.createElement("div", { className: "bkm-popover-label" }, bkm.label || "(no label)"), /* @__PURE__ */ React.createElement(
          "textarea",
          {
            className: "bkm-popover-thought-textarea",
            autoFocus: true,
            value: editText,
            placeholder: "Why did you bookmark this?",
            onChange: function(e) {
              setEditText(e.target.value);
            },
            onKeyDown: function(e) {
              if (e.key === "Escape") {
                e.preventDefault();
                cancelEditThought();
              }
            }
          }
        ), /* @__PURE__ */ React.createElement("div", { className: "bkm-popover-actions" }, /* @__PURE__ */ React.createElement("button", { className: "bkm-popover-btn", onClick: cancelEditThought }, "Cancel"), /* @__PURE__ */ React.createElement("button", { className: "bkm-popover-btn bkm-popover-btn-primary", onClick: function() {
          saveThought(bkm);
        } }, "Save"))), isConfirming && /* @__PURE__ */ React.createElement("div", { className: "ann-chip-confirm", style: { padding: "8px 10px" } }, /* @__PURE__ */ React.createElement("span", { className: "ann-chip-confirm-q" }, "Delete this bookmark?"), /* @__PURE__ */ React.createElement("button", { className: "ann-chip-confirm-btn ann-chip-confirm-cancel", onClick: function() {
          setConfirmingId(null);
        } }, "Cancel"), /* @__PURE__ */ React.createElement("button", { className: "ann-chip-confirm-btn ann-chip-confirm-yes", onClick: function() {
          doDelete(bkm);
        } }, "Yes, delete")));
      })
    ));
  }
  function BookmarksScreen2(props) {
    var onBack = props.onBack;
    var onNavigateToSource = props.onNavigateToSource;
    var hlTick = props.hlTick;
    var setHlTick = props.setHlTick;
    var theme = props.theme;
    var onThemeChange = props.onThemeChange;
    var onSearch = props.onSearch;
    var onHistory = props.onHistory;
    var useState2 = React.useState;
    var useMemo = React.useMemo;
    var _sq = useState2("");
    var searchQuery = _sq[0];
    var setSearchQuery = _sq[1];
    var _ss = useState2("recent");
    var sortMode = _ss[0];
    var setSortMode = _ss[1];
    var _as = useState2(null);
    var actionTarget = _as[0];
    var setActionTarget = _as[1];
    var _ei = useState2(null);
    var editingId = _ei[0];
    var setEditingId = _ei[1];
    var allBookmarks = useMemo(function() {
      return BookmarkStore.all().slice();
    }, [hlTick]);
    var displayBookmarks = useMemo(function() {
      var q = searchQuery.trim().toLowerCase();
      var filtered = q ? allBookmarks.filter(function(bkm) {
        var srcLabel = _bookmarkSourceLabel2(bkm.hlKey).toLowerCase();
        var label = (bkm.label || "").toLowerCase();
        return label.includes(q) || srcLabel.includes(q);
      }) : allBookmarks.slice();
      filtered.sort(function(a, b) {
        if (sortMode === "oldest") return (a.created || 0) - (b.created || 0);
        if (sortMode === "source-az") {
          var la = _bookmarkSourceLabel2(a.hlKey).toLowerCase();
          var lb = _bookmarkSourceLabel2(b.hlKey).toLowerCase();
          return la < lb ? -1 : la > lb ? 1 : 0;
        }
        if (sortMode === "label-az") {
          var xa = (a.label || "").toLowerCase();
          var xb = (b.label || "").toLowerCase();
          return xa < xb ? -1 : xa > xb ? 1 : 0;
        }
        return (b.updated || b.created || 0) - (a.updated || a.created || 0);
      });
      return filtered;
    }, [allBookmarks, searchQuery, sortMode]);
    var navigateToBookmark = function(bkm) {
      var endpoint = _bookmarkSourceEndpoint2(bkm.hlKey);
      if (!endpoint) return;
      if (typeof onNavigateToSource === "function") {
        onNavigateToSource(endpoint, { sourceLetterTitle: "My Bookmarks" });
      }
    };
    var onDeleteDone = function() {
      if (typeof setHlTick === "function") setHlTick(function(t) {
        return t + 1;
      });
    };
    var onEditSave = function(id, newLabel) {
      BookmarkStore.update(id, { label: newLabel });
      if (typeof setHlTick === "function") setHlTick(function(t) {
        return t + 1;
      });
      setEditingId(null);
    };
    var navChildren = LibraryNav({
      onBack,
      onSearch,
      onHistory,
      onSettings: props.onSettings,
      theme,
      onThemeChange
    });
    return /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren }, /* @__PURE__ */ React.createElement("div", { className: "bkm-screen" }, /* @__PURE__ */ React.createElement("div", { className: "notes-index-header" }, /* @__PURE__ */ React.createElement("h1", { className: "notes-index-title" }, "My Bookmarks"), /* @__PURE__ */ React.createElement("span", { className: "notes-index-count" }, allBookmarks.length, allBookmarks.length === 1 ? " bookmark" : " bookmarks")), /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "notes-index-search",
        type: "search",
        placeholder: "Search bookmarks\u2026",
        value: searchQuery,
        onChange: function(e) {
          setSearchQuery(e.target.value);
        }
      }
    ), /* @__PURE__ */ React.createElement("div", { className: "notes-index-controls", style: { marginTop: "0.7rem" } }, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "notes-index-sort-btn",
        style: { marginLeft: "auto" },
        onClick: function() {
          setSortMode(function(m) {
            return m === "oldest" ? "recent" : "oldest";
          });
        },
        title: "Toggle sort order"
      },
      sortMode === "oldest" ? "Sort: Oldest \u2191" : "Sort: Newest \u2193"
    )), allBookmarks.length === 0 && /* @__PURE__ */ React.createElement("div", { className: "notes-empty" }, /* @__PURE__ */ React.createElement("div", { className: "notes-empty-title" }, "No Bookmarks Yet"), /* @__PURE__ */ React.createElement("div", { className: "notes-empty-hint" }, "Select text in any letter or Bible chapter, then tap Bookmark in the toolbar. Your bookmarks will appear here.")), allBookmarks.length > 0 && displayBookmarks.length === 0 && /* @__PURE__ */ React.createElement("div", { className: "notes-empty" }, /* @__PURE__ */ React.createElement("div", { className: "notes-empty-title" }, "No Matches"), /* @__PURE__ */ React.createElement("div", { className: "notes-empty-hint" }, "Try a different search term.")), displayBookmarks.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "notes-index-list", style: { marginTop: "0.75rem" } }, displayBookmarks.map(function(bkm) {
      return /* @__PURE__ */ React.createElement(
        BookmarkRow,
        {
          key: bkm.id,
          bkm,
          onNavigate: navigateToBookmark,
          onLongPress: function(b) {
            setActionTarget(b);
          },
          editingId,
          onEditStart: function(id) {
            setEditingId(id);
          },
          onEditSave,
          onEditCancel: function() {
            setEditingId(null);
          }
        }
      );
    })), actionTarget && /* @__PURE__ */ React.createElement(
      BookmarkRowActionSheet,
      {
        bkm: actionTarget,
        onClose: function() {
          setActionTarget(null);
        },
        onNavigate: function(bkm) {
          navigateToBookmark(bkm);
          setActionTarget(null);
        },
        onEditLabel: function(id) {
          setEditingId(id);
          setActionTarget(null);
        },
        onEditThought: function() {
          if (setHlTick) setHlTick(function(t) {
            return t + 1;
          });
        },
        onDelete: onDeleteDone
      }
    )));
  }

  // app/src/main/assets/src/ui/screens/HighlightsScreen.jsx
  (function injectHighlightStyles() {
    if (typeof document === "undefined" || document.getElementById("hlx-styles")) return;
    var R = [];
    R.push(".hlx-screen { padding: 0 0 90px; }");
    R.push(".hlx-header { padding: 18px 22px 4px; }");
    R.push(".hlx-eyebrow { font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--gold-dim); display: block; }");
    R.push(".hlx-title { font-family: var(--font-cinzel); color: var(--gold); font-size: 22px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; margin: 4px 0 2px; }");
    R.push(".hlx-count { font-family: var(--font-garamond); font-style: italic; color: var(--cream-dim); font-size: 13px; }");
    R.push(".hlx-controls { padding: 10px 18px 6px; display: flex; flex-direction: column; gap: 10px; }");
    R.push(".hlx-search { background: var(--bg2); border: 1px solid var(--border); border-radius: 999px; padding: 8px 14px; color: var(--cream); font-family: var(--font-garamond); font-size: 14px; outline: none; box-sizing: border-box; }");
    R.push("body.light .hlx-search { background: #f7f2e8; color: #2a2520; border-color: var(--gold-border); }");
    R.push(".hlx-search:focus { border-color: var(--gold); }");
    R.push(".hlx-sort-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }");
    R.push(".hlx-sort-label { font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold-dim); }");
    R.push(".hlx-sort-btn { background: var(--bg2); border: 1px solid var(--border); color: var(--cream-dim); font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; padding: 5px 11px; border-radius: 999px; cursor: pointer; }");
    R.push(".hlx-sort-btn.active { background: var(--gold-faint); border-color: var(--gold); color: var(--gold); }");
    R.push(".hlx-sort-btn:hover { color: var(--gold); }");
    R.push(".hlx-filter-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding-top: 4px; }");
    R.push(".hlx-type-chip { appearance: none; -webkit-appearance: none; background: var(--bg2); border: 1px solid var(--border); color: var(--cream-dim); font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; padding: 5px 11px; border-radius: 999px; cursor: pointer; flex: 0 0 auto; }");
    R.push(".hlx-type-chip.active { background: var(--gold-faint); border-color: var(--gold); color: var(--gold); }");
    R.push(".hlx-type-chip:hover { color: var(--gold); }");
    R.push(".hlx-color-all { appearance: none; -webkit-appearance: none; background: var(--bg2); border: 1px solid var(--border); color: var(--cream-dim); font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; padding: 5px 11px; border-radius: 999px; cursor: pointer; flex: 0 0 auto; }");
    R.push(".hlx-color-all.active { background: var(--gold-faint); border-color: var(--gold); color: var(--gold); }");
    R.push(".hlx-color-dot { appearance: none; -webkit-appearance: none; box-sizing: border-box; width: 24px; height: 24px; min-width: 24px; flex: 0 0 24px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.15); cursor: pointer; padding: 0; margin: 0; line-height: 0; font-size: 0; transition: transform 0.1s, border-color 0.12s; }");
    R.push(".hlx-color-dot:hover { transform: scale(1.12); }");
    R.push(".hlx-color-dot.active { border-color: var(--cream); box-shadow: 0 0 0 2px var(--gold), 0 0 6px var(--gold-glow); transform: scale(1.12); }");
    R.push(".hlx-list { padding: 8px 14px; display: flex; flex-direction: column; gap: 8px; }");
    R.push(".hlx-row { display: flex; gap: 12px; padding: 12px 14px; background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; cursor: pointer; transition: background 0.15s, border-color 0.15s; }");
    R.push("body.light .hlx-row { background: #faf5e7; }");
    R.push(".hlx-row:hover { background: var(--bg3); border-color: var(--gold-border); }");
    R.push(".hlx-row:active { transform: scale(0.995); }");
    R.push(".hlx-swatch { flex-shrink: 0; width: 14px; height: 14px; border-radius: 4px; margin-top: 3px; border: 1px solid rgba(255,255,255,0.12); }");
    R.push(".hlx-swatch.is-underline { background: transparent !important; border-radius: 0; height: 0; margin-top: 10px; border: none; border-bottom: 3px solid; width: 16px; }");
    R.push(".hlx-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }");
    R.push(".hlx-top { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }");
    R.push(".hlx-source { font-family: var(--font-cinzel); font-size: 13px; color: var(--gold); letter-spacing: 0.03em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%; }");
    R.push(".hlx-kind { font-family: var(--font-cinzel); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold-dim); border: 1px solid var(--gold-border); border-radius: 999px; padding: 1px 7px; }");
    R.push(".hlx-text { font-family: var(--font-garamond); font-style: italic; font-size: 14px; color: var(--cream-dim); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }");
    R.push("body.light .hlx-text { color: #5a4f3d; }");
    R.push(".hlx-date { font-family: var(--font-cinzel); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold-dim); margin-top: 2px; }");
    R.push(".hlx-empty { padding: 60px 30px; text-align: center; }");
    R.push(".hlx-empty-title { font-family: var(--font-cinzel); color: var(--gold); font-size: 18px; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; }");
    R.push(".hlx-empty-hint { font-family: var(--font-garamond); font-style: italic; color: var(--cream-dim); font-size: 15px; line-height: 1.5; max-width: 320px; margin: 0 auto; }");
    var el = document.createElement("style");
    el.id = "hlx-styles";
    el.textContent = R.join("\n");
    document.head.appendChild(el);
  })();
  var _HL_COLOR_ORDER = ["yellow", "green", "pink", "red", "orange", "blue", "purple", "teal", "brown", "gray"];
  var _HL_COLOR_HEX = {
    yellow: "#ffd700",
    green: "#76ff03",
    pink: "#ff4081",
    red: "#f44336",
    orange: "#ff9100",
    blue: "#2196f3",
    purple: "#ba68c8",
    teal: "#00bcd4",
    brown: "#8d6e63",
    gray: "#9e9e9e",
    cyan: "#00bcd4"
  };
  function _hlColorHex(c) {
    return _HL_COLOR_HEX[c] || "#ffd700";
  }
  function _hlColorIndex(c) {
    var i = _HL_COLOR_ORDER.indexOf(c === "cyan" ? "teal" : c);
    return i < 0 ? 99 : i;
  }
  function _collectMarks() {
    if (typeof AnnotationStore === "undefined") return [];
    var data = AnnotationStore.all() || {};
    var groups = {};
    Object.keys(data).forEach(function(hlKey) {
      var arr = data[hlKey] || [];
      for (var i = 0; i < arr.length; i++) {
        var a = arr[i];
        if (a.kind !== "highlight" && a.kind !== "underline") continue;
        var gid = a.groupId || a.id;
        var g = groups[gid];
        if (!g) {
          g = groups[gid] = {
            groupId: gid,
            kind: a.kind,
            color: a.color || "yellow",
            hlKey,
            created: a.created || 0,
            updated: a.updated || a.created || 0,
            segs: []
          };
        }
        g.segs.push({ key: hlKey, start: a.start || 0, text: a.text || "", created: a.created || 0 });
        if ((a.created || 0) < g.created || g.created === 0) {
          g.created = a.created || 0;
          g.hlKey = hlKey;
        }
        if ((a.updated || a.created || 0) > g.updated) g.updated = a.updated || a.created || 0;
      }
    });
    return Object.keys(groups).map(function(gid) {
      var g = groups[gid];
      g.segs.sort(function(x, y) {
        return x.created - y.created || x.start - y.start;
      });
      g.text = g.segs.map(function(s) {
        return s.text;
      }).join(" ").replace(/\s+/g, " ").trim();
      return g;
    });
  }
  function HighlightRow(props) {
    var m = props.mark;
    var sourceLabel = typeof _bookmarkSourceLabel === "function" ? _bookmarkSourceLabel(m.hlKey) : m.hlKey;
    var date = typeof relativeDate === "function" ? relativeDate(m.updated || m.created) : "";
    var hex = _hlColorHex(m.color);
    var isUnderline = m.kind === "underline";
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "hlx-row",
        role: "button",
        tabIndex: 0,
        onClick: function() {
          props.onNavigate && props.onNavigate(m);
        },
        onKeyDown: function(e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            props.onNavigate && props.onNavigate(m);
          }
        }
      },
      /* @__PURE__ */ React.createElement(
        "span",
        {
          className: "hlx-swatch" + (isUnderline ? " is-underline" : ""),
          style: isUnderline ? { borderBottomColor: hex } : { background: hex }
        }
      ),
      /* @__PURE__ */ React.createElement("span", { className: "hlx-body" }, /* @__PURE__ */ React.createElement("span", { className: "hlx-top" }, /* @__PURE__ */ React.createElement("span", { className: "hlx-source" }, sourceLabel), /* @__PURE__ */ React.createElement("span", { className: "hlx-kind" }, isUnderline ? "Underline" : "Highlight")), m.text && /* @__PURE__ */ React.createElement("span", { className: "hlx-text" }, "\u201C", m.text, "\u201D"), date && /* @__PURE__ */ React.createElement("span", { className: "hlx-date" }, date))
    );
  }
  function HighlightsScreen2(props) {
    var useState2 = React.useState;
    var useMemo = React.useMemo;
    var onBack = props.onBack;
    var onNavigateToSource = props.onNavigateToSource;
    var hlTick = props.hlTick;
    var _sn = useState2(true);
    var sortNewest = _sn[0];
    var setSortNewest = _sn[1];
    var _q = useState2("");
    var query = _q[0];
    var setQuery = _q[1];
    var _tf = useState2("all");
    var typeFilter = _tf[0];
    var setTypeFilter = _tf[1];
    var _cf = useState2(null);
    var colorFilter = _cf[0];
    var setColorFilter = _cf[1];
    var marks = useMemo(function() {
      return _collectMarks();
    }, [hlTick]);
    var presentColors = useMemo(function() {
      var seen = {};
      marks.forEach(function(m) {
        seen[m.color === "cyan" ? "teal" : m.color] = 1;
      });
      return _HL_COLOR_ORDER.filter(function(c) {
        return seen[c];
      });
    }, [marks]);
    var sorted = useMemo(function() {
      var q = query.trim().toLowerCase();
      var list = q ? marks.filter(function(m) {
        var lbl = typeof _bookmarkSourceLabel === "function" ? _bookmarkSourceLabel(m.hlKey) : "";
        return (m.text || "").toLowerCase().indexOf(q) >= 0 || (lbl || "").toLowerCase().indexOf(q) >= 0;
      }) : marks.slice();
      if (typeFilter !== "all") {
        list = list.filter(function(m) {
          return m.kind === typeFilter;
        });
      }
      if (colorFilter) {
        list = list.filter(function(m) {
          return (m.color === "cyan" ? "teal" : m.color) === colorFilter;
        });
      }
      list.sort(function(a, b) {
        var ad = a.updated || a.created || 0;
        var bd = b.updated || b.created || 0;
        if (ad !== bd) return sortNewest ? bd - ad : ad - bd;
        var ak = (a.hlKey || "") + "|" + (a.text || "");
        var bk = (b.hlKey || "") + "|" + (b.text || "");
        if (ak === bk) return 0;
        var cmp = ak < bk ? -1 : 1;
        return sortNewest ? cmp : -cmp;
      });
      return list;
    }, [marks, sortNewest, query, typeFilter, colorFilter]);
    function navigate(m) {
      var ep = typeof _bookmarkSourceEndpoint === "function" ? _bookmarkSourceEndpoint(m.hlKey) : null;
      if (ep && onNavigateToSource) onNavigateToSource(ep, { sourceLetterTitle: "My Highlights" });
    }
    function typeChip(val, label) {
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "hlx-type-chip" + (typeFilter === val ? " active" : ""),
          onClick: function() {
            setTypeFilter(val);
          }
        },
        label
      );
    }
    var navChildren = LibraryNav({
      onBack,
      onSearch: props.onSearch,
      onHistory: props.onHistory,
      onSettings: props.onSettings,
      theme: props.theme,
      onThemeChange: props.onThemeChange
    });
    return /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren }, /* @__PURE__ */ React.createElement("div", { className: "hlx-screen" }, /* @__PURE__ */ React.createElement("div", { className: "hlx-header" }, /* @__PURE__ */ React.createElement("span", { className: "hlx-eyebrow" }, "My Marks"), /* @__PURE__ */ React.createElement("h1", { className: "hlx-title" }, "Highlights & Underlines"), /* @__PURE__ */ React.createElement("span", { className: "hlx-count" }, marks.length + (marks.length === 1 ? " mark" : " marks"))), marks.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "hlx-controls" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "hlx-search",
        type: "text",
        placeholder: "Search marks\u2026",
        value: query,
        onChange: function(e) {
          setQuery(e.target.value);
        }
      }
    ), /* @__PURE__ */ React.createElement("div", { className: "hlx-sort-row" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "notes-index-sort-btn",
        onClick: function() {
          setSortNewest(function(v) {
            return !v;
          });
        },
        title: "Toggle sort order"
      },
      sortNewest ? "Sort: Newest \u2193" : "Sort: Oldest \u2191"
    )), /* @__PURE__ */ React.createElement("div", { className: "hlx-filter-row" }, /* @__PURE__ */ React.createElement("span", { className: "hlx-sort-label" }, "Type"), typeChip("all", "All"), typeChip("highlight", "Highlights"), typeChip("underline", "Underlines")), presentColors.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "hlx-filter-row" }, /* @__PURE__ */ React.createElement("span", { className: "hlx-sort-label" }, "Color"), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "hlx-color-all" + (colorFilter === null ? " active" : ""),
        onClick: function() {
          setColorFilter(null);
        }
      },
      "All"
    ), presentColors.map(function(c) {
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          key: c,
          type: "button",
          className: "hlx-color-dot" + (colorFilter === c ? " active" : ""),
          style: { backgroundColor: _hlColorHex(c) },
          title: c.charAt(0).toUpperCase() + c.slice(1),
          "aria-label": "Filter " + c,
          onClick: function() {
            setColorFilter(colorFilter === c ? null : c);
          }
        }
      );
    }))), sorted.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "hlx-empty" }, /* @__PURE__ */ React.createElement("div", { className: "hlx-empty-title" }, marks.length === 0 ? "No Marks Yet" : "No Matches"), /* @__PURE__ */ React.createElement("div", { className: "hlx-empty-hint" }, marks.length === 0 ? "Select any passage while reading and tap a color to highlight or underline it. Your marks collect here." : "Try a different search term.")) : /* @__PURE__ */ React.createElement("div", { className: "hlx-list" }, sorted.map(function(m) {
      return /* @__PURE__ */ React.createElement(HighlightRow, { key: m.groupId, mark: m, onNavigate: navigate });
    }))));
  }

  // app/src/main/assets/src/ui/sheets/TabsOverview.jsx
  function TabsOverview2({ tabs, activeTabIdx, onSelect, onClose, onNewTab, onLongPress, onClearAll, clearAllStage, onDedupe, MAX_TABS, thumbnails }) {
    const total = tabs.length;
    const handleLongPress = React.useRef(null);
    const startLongPress = (idx) => (_e) => {
      handleLongPress.current = setTimeout(() => {
        onLongPress && onLongPress(idx);
        handleLongPress.current = null;
      }, 520);
    };
    const cancelLongPress = () => {
      if (handleLongPress.current) {
        clearTimeout(handleLongPress.current);
        handleLongPress.current = null;
      }
    };
    const dupeCount = React.useMemo(() => {
      const seen = /* @__PURE__ */ new Map();
      let dupes = 0;
      tabs.forEach((t) => {
        const k = tabContentKey(t);
        if (seen.has(k)) dupes++;
        else
          seen.set(k, true);
      });
      return dupes;
    }, [tabs]);
    const clearLabelLocal = clearAllStage === 0 ? "Clear All" : CLEAR_LABELS[clearAllStage];
    const clearClassLocal = CLEAR_CLASSES[clearAllStage];
    const resetClearOnOutsideTap = (_e) => {
      if (clearAllStage > 0) onClearAll && onClearAll(-1);
    };
    return /* @__PURE__ */ React.createElement("div", { className: "tabs-overview", onClick: resetClearOnOutsideTap }, /* @__PURE__ */ React.createElement("div", { className: "tabs-overview-header" }, /* @__PURE__ */ React.createElement("div", { className: "tabs-overview-eyebrow" }, "Reading Places"), /* @__PURE__ */ React.createElement("h1", { className: "tabs-overview-title" }, "Tabs"), /* @__PURE__ */ React.createElement("div", { className: "tabs-overview-ornament" }, /* @__PURE__ */ React.createElement("div", { className: "tabs-overview-ornament-line" }), /* @__PURE__ */ React.createElement("div", { className: "tabs-overview-ornament-diamond" }, "\u2726"), /* @__PURE__ */ React.createElement("div", { className: "tabs-overview-ornament-line r" })), /* @__PURE__ */ React.createElement("div", { className: "tabs-overview-meta" }, total, " / ", MAX_TABS, " ", total === 1 ? "tab" : "tabs", " open"), /* @__PURE__ */ React.createElement("div", { className: "tabs-overview-actions" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: clearClassLocal,
        onClick: (e) => {
          e.stopPropagation();
          onClearAll();
        },
        disabled: total <= 1 && clearAllStage === 0
      },
      clearLabelLocal
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "tabs-action-btn",
        onClick: (e) => {
          e.stopPropagation();
          onDedupe();
        },
        disabled: dupeCount === 0,
        title: dupeCount === 0 ? "No duplicate tabs" : `Merge ${dupeCount} duplicate ${dupeCount === 1 ? "tab" : "tabs"}`
      },
      "Deduplicate",
      dupeCount > 0 ? ` \xB7 ${dupeCount}` : ""
    ))), /* @__PURE__ */ React.createElement("div", { className: "tabs-overview-grid" }, tabs.map((t, i) => {
      const { title, subtitle } = describeTab(t);
      const scrollKey = scrollKeyForTab(t);
      const saved = t.scrollPositions && t.scrollPositions[scrollKey];
      const pctLive = saved == null ? 0 : typeof saved === "object" && typeof saved.pct === "number" ? saved.pct : 0;
      const isActive = i === activeTabIdx;
      const thumb = thumbnails ? thumbnails[tabContentKey(t)] : null;
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          key: i,
          className: `tab-card${isActive ? " active" : ""}${thumb ? " has-thumb" : ""}`,
          onClick: () => onSelect(i),
          onTouchStart: startLongPress(i),
          onTouchEnd: cancelLongPress,
          onTouchMove: cancelLongPress,
          onMouseDown: startLongPress(i),
          onMouseUp: cancelLongPress,
          onMouseLeave: cancelLongPress
        },
        /* @__PURE__ */ React.createElement(
          "button",
          {
            className: "tab-card-close",
            onClick: (e) => {
              e.stopPropagation();
              onClose(i);
            },
            title: "Close tab",
            "aria-label": "Close tab"
          },
          "\xD7"
        ),
        /* @__PURE__ */ React.createElement("div", { className: "tab-card-thumb-wrap" }, thumb ? /* @__PURE__ */ React.createElement("img", { className: "tab-card-thumb", src: thumb, alt: "" }) : /* @__PURE__ */ React.createElement("div", { className: "tab-card-thumb-placeholder" }, /* @__PURE__ */ React.createElement("div", { className: "tab-card-thumb-sigil" }, "\u2726")), /* @__PURE__ */ React.createElement("div", { className: "tab-card-thumb-scrim" })),
        /* @__PURE__ */ React.createElement("div", { className: "tab-card-body" }, /* @__PURE__ */ React.createElement("div", { className: "tab-card-eyebrow" }, "Tab ", i + 1, " / ", total), /* @__PURE__ */ React.createElement("div", { className: "tab-card-title" }, title), /* @__PURE__ */ React.createElement("div", { className: "tab-card-subtitle" }, subtitle), tabHasProgressBar(t) && /* @__PURE__ */ React.createElement("div", { className: "tab-card-progress" }, /* @__PURE__ */ React.createElement("div", { className: "tab-card-progress-fill", style: { width: `${Math.round(pctLive * 100)}%` } })))
      );
    }), total < MAX_TABS && /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "tab-card tab-card-new",
        onClick: () => onNewTab(),
        title: "New tab",
        "aria-label": "New tab"
      },
      /* @__PURE__ */ React.createElement("span", { className: "tab-card-new-plus" }, "+"),
      /* @__PURE__ */ React.createElement("span", { className: "tab-card-new-label" }, "New Tab")
    )));
  }

  // app/src/main/assets/src/ui/sheets/TabActionSheet.jsx
  function TabActionSheet2({ idx, total, onCloseOthers, onCloseToRight, onDismiss }) {
    React.useEffect(() => {
      if (idx == null) return;
      const prev = window.__closeSheet;
      window.__closeSheet = onDismiss;
      return () => {
        window.__closeSheet = prev || null;
      };
    }, [idx, onDismiss]);
    if (idx == null) return null;
    const tabNum = idx + 1;
    const hasOthers = total > 1;
    const hasRightTabs = idx < total - 1;
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "select-sheet-backdrop open", onClick: onDismiss }), /* @__PURE__ */ React.createElement("div", { className: "select-sheet", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "select-sheet-handle" }), /* @__PURE__ */ React.createElement("div", { className: "select-sheet-eyebrow" }, "Tab ", tabNum), /* @__PURE__ */ React.createElement("div", { className: "select-sheet-title" }, "Tab actions"), /* @__PURE__ */ React.createElement("div", { className: "select-sheet-ornament" }, /* @__PURE__ */ React.createElement("div", { className: "select-sheet-ornament-line" }), /* @__PURE__ */ React.createElement("div", { className: "select-sheet-ornament-diamond" }, "\u2726"), /* @__PURE__ */ React.createElement("div", { className: "select-sheet-ornament-line r" })), /* @__PURE__ */ React.createElement("div", { className: "select-sheet-options" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "select-sheet-option",
        disabled: !hasOthers,
        style: !hasOthers ? { opacity: 0.42, cursor: "not-allowed" } : void 0,
        onClick: hasOthers ? () => {
          onCloseOthers();
          onDismiss();
        } : void 0
      },
      /* @__PURE__ */ React.createElement("div", { className: "select-sheet-option-main" }, /* @__PURE__ */ React.createElement("span", { className: "select-sheet-option-label" }, "Close other tabs")),
      /* @__PURE__ */ React.createElement("div", { className: "select-sheet-option-desc" }, "Keep only this tab open. ", hasOthers ? `${total - 1} other ${total - 1 === 1 ? "tab" : "tabs"} will be closed.` : "No other tabs to close.")
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "select-sheet-option",
        disabled: !hasRightTabs,
        style: !hasRightTabs ? { opacity: 0.42, cursor: "not-allowed" } : void 0,
        onClick: hasRightTabs ? () => {
          onCloseToRight();
          onDismiss();
        } : void 0
      },
      /* @__PURE__ */ React.createElement("div", { className: "select-sheet-option-main" }, /* @__PURE__ */ React.createElement("span", { className: "select-sheet-option-label" }, "Close tabs to the right")),
      /* @__PURE__ */ React.createElement("div", { className: "select-sheet-option-desc" }, hasRightTabs ? `Close ${total - tabNum} ${total - tabNum === 1 ? "tab" : "tabs"} after this one.` : "No tabs to the right.")
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "select-sheet-option",
        onClick: onDismiss,
        style: { borderStyle: "dashed" }
      },
      /* @__PURE__ */ React.createElement("div", { className: "select-sheet-option-main" }, /* @__PURE__ */ React.createElement("span", { className: "select-sheet-option-label" }, "Cancel"))
    ))));
  }

  // app/src/main/assets/src/ui/sheets/MultiNotePopover.jsx
  function MultiNotePopover2({ payload, onClose, onPick }) {
    if (!payload) return null;
    const { groupIds, x, y } = payload;
    const notes = groupIds.map((gid) => NoteStore.get(gid)).filter(Boolean);
    if (notes.length === 0) return null;
    const popW = 320;
    const px = Math.max(8, Math.min(x - popW / 2, window.innerWidth - popW - 8));
    const py = Math.max(8, y + 12);
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "multinote-overlay", onClick: onClose }), /* @__PURE__ */ React.createElement("div", { className: "multinote-popover", style: { left: px, top: py, width: popW } }, /* @__PURE__ */ React.createElement("div", { className: "multinote-header" }, notes.length, " notes here"), notes.map((n) => {
      const swatchBg = {
        yellow: "#ffd700",
        green: "#76ff03",
        pink: "#ff4081",
        red: "#f44336",
        orange: "#ff9100",
        blue: "#2196f3",
        purple: "#ba68c8",
        teal: "#00bcd4",
        brown: "#8d6e63",
        gray: "#9e9e9e",
        cyan: "#00bcd4"
      }[n.color] || "#ffd700";
      const noteNbs = (n.notebookIds || []).map((id) => NotebookStore.get(id)).filter(Boolean);
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          key: n.groupId,
          className: "multinote-row",
          onClick: () => onPick(n.groupId)
        },
        /* @__PURE__ */ React.createElement("span", { className: "multinote-row-swatch", style: { background: swatchBg } }),
        /* @__PURE__ */ React.createElement("span", { className: "multinote-row-body" }, /* @__PURE__ */ React.createElement("span", { className: "multinote-row-preview" }, n.body || (n.fullText ? "\u201C" + n.fullText + "\u201D" : "Empty note")), /* @__PURE__ */ React.createElement("span", { className: "multinote-row-meta" }, relativeDate(n.updated || n.created), noteNbs.length > 0 && " \xB7 " + noteNbs.map((nb) => nb.name).join(" \xB7 ")))
      );
    })));
  }

  // app/src/main/assets/src/ui/sheets/NotebookPickerSheet.jsx
  function NotebookPickerSheet2({ groupId, hlTick, setHlTick, onClose }) {
    const note = React.useMemo(() => NoteStore.get(groupId), [groupId, hlTick]);
    const notebooks = React.useMemo(() => NotebookStore.list(), [hlTick]);
    const [newName, setNewName] = React.useState("");
    const [confirmDeleteNb, setConfirmDeleteNb] = React.useState(null);
    const inputRef = React.useRef(null);
    if (!note) return null;
    const memberIds = new Set(note.notebookIds || []);
    const createNotebook = () => {
      const trimmed = newName.trim();
      if (!trimmed) return;
      const nb = NotebookStore.add(trimmed);
      if (nb) {
        NoteStore.toggleNotebook(groupId, nb.id);
        setHlTick((t) => t + 1);
        setNewName("");
      }
    };
    const toggle = (nbId) => {
      NoteStore.toggleNotebook(groupId, nbId);
      setHlTick((t) => t + 1);
    };
    const deleteNb = (nbId) => {
      NotebookStore.remove(nbId);
      setHlTick((t) => t + 1);
      setConfirmDeleteNb(null);
    };
    return /* @__PURE__ */ React.createElement("div", { className: "nb-picker-overlay", onClick: onClose }, /* @__PURE__ */ React.createElement("div", { className: "nb-picker", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "nb-picker-header" }, /* @__PURE__ */ React.createElement("span", { className: "nb-picker-title" }, memberIds.size > 0 ? "Manage Notebooks" : "Add to Notebook"), /* @__PURE__ */ React.createElement("button", { className: "nb-picker-close", onClick: onClose, "aria-label": "Close" }, "\xD7")), /* @__PURE__ */ React.createElement("div", { className: "nb-picker-new" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        ref: inputRef,
        className: "nb-picker-new-input",
        type: "text",
        placeholder: "New notebook name\u2026",
        value: newName,
        onChange: (e) => setNewName(e.target.value),
        onKeyDown: (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            createNotebook();
          }
        },
        maxLength: 60
      }
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "nb-picker-new-btn" + (newName.trim() ? "" : " disabled"),
        onClick: createNotebook,
        disabled: !newName.trim()
      },
      "Create"
    )), notebooks.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "nb-picker-empty" }, "No notebooks yet. Type a name above to create your first one.") : /* @__PURE__ */ React.createElement("div", { className: "nb-picker-list" }, notebooks.map((nb) => {
      if (confirmDeleteNb === nb.id) {
        return /* @__PURE__ */ React.createElement("div", { key: nb.id, className: "ann-chip-confirm", style: { padding: "10px 12px" } }, /* @__PURE__ */ React.createElement("span", { className: "ann-chip-confirm-q" }, "Delete \u201C", nb.name, "\u201D? Notes will move to Uncategorized."), /* @__PURE__ */ React.createElement("button", { className: "ann-chip-confirm-btn ann-chip-confirm-cancel", onClick: () => setConfirmDeleteNb(null) }, "Cancel"), /* @__PURE__ */ React.createElement("button", { className: "ann-chip-confirm-btn ann-chip-confirm-yes", onClick: () => deleteNb(nb.id) }, "Yes, delete"));
      }
      const checked = memberIds.has(nb.id);
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          key: nb.id,
          className: "nb-picker-row" + (checked ? " checked" : ""),
          onClick: () => toggle(nb.id),
          role: "button"
        },
        /* @__PURE__ */ React.createElement("span", { className: "nb-picker-check" }, checked && /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24" }, /* @__PURE__ */ React.createElement("polyline", { points: "20 6 9 17 4 12" }))),
        /* @__PURE__ */ React.createElement("span", { className: "nb-picker-name" }, nb.name),
        /* @__PURE__ */ React.createElement(
          "button",
          {
            className: "nb-picker-row-delete",
            onClick: (e) => {
              e.stopPropagation();
              setConfirmDeleteNb(nb.id);
            },
            title: "Delete notebook",
            "aria-label": "Delete notebook"
          },
          "\xD7"
        )
      );
    }))));
  }

  // app/src/main/assets/src/ui/sheets/NoteSheet.jsx
  function NoteSheet2({ groupId, startInEditMode, hlTick, setHlTick, onClose, onOpenNotebookPicker }) {
    const note = React.useMemo(() => NoteStore.get(groupId), [groupId, hlTick]);
    const segs = React.useMemo(() => AnnotationStore.getByGroup(groupId), [groupId, hlTick]);
    const [mode, setMode] = React.useState(startInEditMode ? "edit" : "read");
    const [body, setBody] = React.useState(note ? note.body || "" : "");
    const [menuOpen, setMenuOpen] = React.useState(false);
    const [confirmDelete, setConfirmDelete] = React.useState(false);
    const [showColors, setShowColors] = React.useState(false);
    const textareaRef = React.useRef(null);
    React.useEffect(() => {
      if (mode === "edit" && textareaRef.current) {
        textareaRef.current.focus();
        const len = textareaRef.current.value.length;
        textareaRef.current.setSelectionRange(len, len);
      }
    }, [mode]);
    if (!note || !segs.length) {
      return null;
    }
    const color = note.color || "yellow";
    const anchor = note.fullText || segs.map((s) => s.ann.text || "").join(" \u2026 ");
    const truncatedAnchor = anchor.length > 220 ? anchor.slice(0, 220) + "\u2026" : anchor;
    const save = () => {
      NoteStore.update(groupId, { body });
      setHlTick((t) => t + 1);
      onClose();
    };
    const cancelEdit = () => {
      setBody(note.body || "");
      if (startInEditMode && !note.body) {
        AnnotationStore.convertGroup(groupId, "highlight");
        NoteStore.remove(groupId);
        setHlTick((t) => t + 1);
        onClose();
        return;
      }
      setMode("read");
    };
    const recolor = (c) => {
      AnnotationStore.recolorGroup(groupId, c);
      NoteStore.update(groupId, { color: c });
      setHlTick((t) => t + 1);
      setShowColors(false);
      setMenuOpen(false);
    };
    const remove = () => {
      AnnotationStore.removeGroup(groupId);
      NoteStore.remove(groupId);
      setHlTick((t) => t + 1);
      onClose();
    };
    const share = () => {
      const text = anchor + (note.body ? "\n\n" + note.body : "");
      if (navigator.share) navigator.share({ text }).catch(() => {
      });
      else navigator.clipboard.writeText(text).catch(() => {
      });
      setMenuOpen(false);
    };
    const closeOverlay = () => {
      if (menuOpen) {
        setMenuOpen(false);
        setConfirmDelete(false);
        setShowColors(false);
        return;
      }
      onClose();
    };
    const openColorPicker = () => {
      setShowColors(true);
      setMenuOpen(false);
      setConfirmDelete(false);
    };
    return /* @__PURE__ */ React.createElement("div", { className: "note-sheet-overlay", onClick: closeOverlay }, /* @__PURE__ */ React.createElement("div", { className: "note-sheet", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "note-sheet-header" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "note-sheet-color-dot ann-chip-color-btn",
        "data-color": color,
        onClick: openColorPicker,
        title: "Change color",
        "aria-label": "Change note color"
      }
    ), /* @__PURE__ */ React.createElement("div", { className: "note-sheet-title" }, mode === "edit" ? note.body ? "Edit note" : "New note" : "Note"), mode === "read" && /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "note-sheet-menu-btn",
        onClick: () => {
          setMenuOpen((v) => !v);
          setShowColors(false);
          setConfirmDelete(false);
        },
        "aria-label": "Options"
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "currentColor" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "5", r: "1.7" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "1.7" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "19", r: "1.7" }))
    )), showColors ? /* @__PURE__ */ React.createElement("div", { className: "note-sheet-menu-colors" }, /* @__PURE__ */ React.createElement("button", { className: "ann-chip-back", onClick: () => setShowColors(false), title: "Back" }, "\u2039"), HL_COLORS.map((c) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key: c,
        className: "ann-chip-color-btn" + (color === c ? " active" : ""),
        "data-color": c,
        onClick: () => recolor(c),
        title: c
      }
    ))) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "note-sheet-anchor" }, "\u201C", truncatedAnchor, "\u201D"), mode === "read" && (note.updated || note.created) && /* @__PURE__ */ React.createElement("div", { className: "note-sheet-date" }, relativeDate(note.updated || note.created)), mode === "edit" && /* @__PURE__ */ React.createElement("div", { className: "note-edit-colors" }, HL_COLORS.map((c) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key: c,
        className: "ann-chip-color-btn" + (color === c ? " active" : ""),
        "data-color": c,
        onClick: () => recolor(c),
        title: c
      }
    ))), mode === "read" && (note.notebookIds || []).length > 0 && /* @__PURE__ */ React.createElement("div", { className: "note-sheet-nb-chips" }, (note.notebookIds || []).map((id) => {
      const nb = NotebookStore.get(id);
      if (!nb) return null;
      return /* @__PURE__ */ React.createElement("span", { key: id, className: "note-sheet-nb-chip" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24" }, /* @__PURE__ */ React.createElement("path", { d: "M4 4h11l5 5v11a1 1 0 0 1-1 1H4z" }), /* @__PURE__ */ React.createElement("polyline", { points: "15 4 15 9 20 9" })), nb.name);
    })), mode === "read" ? note.body ? /* @__PURE__ */ React.createElement("div", { className: "note-sheet-body" }, note.body) : /* @__PURE__ */ React.createElement("div", { className: "note-sheet-empty" }, "Empty note. Tap \u22EF \u2192 Edit to add text.") : /* @__PURE__ */ React.createElement(
      "textarea",
      {
        ref: textareaRef,
        className: "note-sheet-textarea",
        value: body,
        onChange: (e) => setBody(e.target.value),
        placeholder: "Write your note\u2026",
        onFocus: () => {
          setTimeout(() => {
            try {
              textareaRef.current && textareaRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
            } catch (_e) {
            }
          }, 220);
        }
      }
    ), mode === "edit" && /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "note-edit-nb-row",
        onClick: () => {
          onOpenNotebookPicker && onOpenNotebookPicker(groupId);
        }
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M4 4h11l5 5v11a1 1 0 0 1-1 1H4z" }), /* @__PURE__ */ React.createElement("polyline", { points: "15 4 15 9 20 9" })),
      (note.notebookIds || []).length > 0 ? (note.notebookIds || []).map((id) => {
        const nb = NotebookStore.get(id);
        return nb ? nb.name : null;
      }).filter(Boolean).join(", ") || "Add to notebook\u2026" : "Add to notebook\u2026"
    ), mode === "edit" && /* @__PURE__ */ React.createElement("div", { className: "note-sheet-footer" }, /* @__PURE__ */ React.createElement("button", { className: "note-sheet-secondary", onClick: cancelEdit }, "Cancel"), /* @__PURE__ */ React.createElement("button", { className: "note-sheet-save", onClick: save }, "Save")), mode === "read" && menuOpen && /* @__PURE__ */ React.createElement("div", { className: "note-sheet-menu" }, confirmDelete ? /* @__PURE__ */ React.createElement("div", { className: "ann-chip-confirm" }, /* @__PURE__ */ React.createElement("span", { className: "ann-chip-confirm-q" }, "Delete this note?"), /* @__PURE__ */ React.createElement("button", { className: "ann-chip-confirm-btn ann-chip-confirm-cancel", onClick: () => setConfirmDelete(false) }, "Cancel"), /* @__PURE__ */ React.createElement("button", { className: "ann-chip-confirm-btn ann-chip-confirm-yes", onClick: remove }, "Yes, delete")) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "note-sheet-menu-item", onClick: () => {
      setMenuOpen(false);
      setMode("edit");
    } }, "Edit note"), /* @__PURE__ */ React.createElement("button", { className: "note-sheet-menu-item", onClick: () => {
      setMenuOpen(false);
      openColorPicker();
    } }, "Change color"), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "note-sheet-menu-item",
        onClick: () => {
          setMenuOpen(false);
          onOpenNotebookPicker && onOpenNotebookPicker(groupId);
        }
      },
      (note.notebookIds || []).length > 0 ? "Manage notebooks\u2026" : "Add to notebook\u2026"
    ), /* @__PURE__ */ React.createElement("button", { className: "note-sheet-menu-item", onClick: share }, "Share"), /* @__PURE__ */ React.createElement("button", { className: "note-sheet-menu-item danger", onClick: () => setConfirmDelete(true) }, "Delete note"))))));
  }

  // app/src/main/assets/src/ui/sheets/LetterExcerptPickerScreen.jsx
  function LetterExcerptPickerScreen2({ refineRequest, sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText, setHlTick, onClose, returnTargetInsteadOfLink }) {
    const target = refineRequest.target;
    const item = refineRequest.item;
    const bodyRef = React.useRef(null);
    const [selInfo, setSelInfo] = React.useState(null);
    const entry = React.useMemo(() => {
      const id = target.letterId || target.entryId || target.studyChapterId;
      if (!id) return null;
      const ctx = findEntryContext(id);
      return ctx ? ctx.entry : null;
    }, [target.letterId, target.entryId, target.studyChapterId]);
    const blocks = React.useMemo(() => {
      if (!entry) return [];
      if (entry.paragraphs) {
        return entry.paragraphs.map((p, i) => ({
          key: String(i),
          text: (p.text || "").replace(/_([^_]+)_/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\{\{ref:([^}]+)\}\}/g, "$1").replace(/\{\{nav:([^}]+)\}\}/g, "")
        }));
      }
      if (entry.blocks) {
        return entry.blocks.map((b, i) => {
          let text = "";
          if (b.type === "para" || b.type === "closing-fn" || b.type === "intro") {
            text = (b.segments || []).map((s) => s.t === "fn" ? "" : s.v || "").join("");
          } else if (b.type === "closing") {
            text = b.text || "";
          } else if (b.type === "poetry") {
            text = (b.lines || b.segments || []).map(
              (line) => Array.isArray(line) ? line.map((s) => s.t === "fn" ? "" : s.v || "").join("") : line && line.t === "fn" ? "" : line && line.v || ""
            ).join("\n");
          } else if (b.type === "note" || b.type === "scripture") {
            text = b.text || "";
          }
          return { key: String(i), text };
        }).filter((b) => b.text.trim().length > 0);
      }
      return [];
    }, [entry]);
    React.useEffect(() => {
      const prev = window.__closeSheet;
      window.__closeSheet = () => onClose(null);
      return () => {
        window.__closeSheet = prev || null;
      };
    }, [onClose]);
    const captureSelectionSync = React.useCallback(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
      const range = sel.getRangeAt(0);
      const startNode = range.startContainer;
      const blockEl = startNode.nodeType === 3 ? startNode.parentElement.closest("[data-block-key]") : startNode.closest && startNode.closest("[data-block-key]");
      if (!blockEl || !bodyRef.current || !bodyRef.current.contains(blockEl)) return null;
      const blockKey = blockEl.dataset.blockKey;
      const fullText = blockEl.textContent;
      const preRange = document.createRange();
      preRange.selectNodeContents(blockEl);
      preRange.setEnd(range.startContainer, range.startOffset);
      var start = preRange.toString().length;
      var end = start + range.toString().length;
      var snapped = snapRangeToWords(fullText, start, end);
      start = snapped.start;
      return { blockKey, start, end, text: fullText.slice(start, end) };
    }, []);
    const captureSelection = React.useCallback(() => {
      setTimeout(function() {
        const info = captureSelectionSync();
        if (info) setSelInfo(info);
      }, 150);
    }, [captureSelectionSync]);
    const confirmLink = React.useCallback(() => {
      const refinedTarget = { ...target };
      var info = selInfo || captureSelectionSync();
      if (info) {
        refinedTarget.blockKey = info.blockKey;
        refinedTarget.start = info.start;
        refinedTarget.end = info.end;
        refinedTarget.text = info.text;
        refinedTarget.preview = info.text;
        refinedTarget.partial = true;
        const baseKey = target.key.split(":").slice(0, 2).join(":");
        refinedTarget.key = baseKey + ":" + info.blockKey + ":" + info.start + "-" + info.end;
      }
      if (returnTargetInsteadOfLink) {
        onClose(refinedTarget);
        return;
      }
      const sourceEndpoint = buildSourceEndpoint(sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText);
      const newLink = persistLink(sourceEndpoint, refinedTarget);
      if (newLink) setHlTick((t) => t + 1);
      onClose(newLink || null);
    }, [selInfo, captureSelectionSync, target, sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText, setHlTick, onClose, returnTargetInsteadOfLink]);
    if (!entry) {
      return /* @__PURE__ */ React.createElement("div", { className: "picker-screen" }, /* @__PURE__ */ React.createElement("div", { className: "picker-header" }, /* @__PURE__ */ React.createElement("button", { className: "picker-back", onClick: () => onClose(null), "aria-label": "Back" }, "\u2190"), /* @__PURE__ */ React.createElement("span", { className: "picker-title" }, "Select Text to Link")), /* @__PURE__ */ React.createElement("div", { className: "picker-empty" }, "Letter not found."));
    }
    const titleText = entry.title || item.label;
    const subtitleText = item.collection || (target.type === "blessed" ? "The Blessed" : target.type === "holy-days" ? "Holy Days" : "");
    const hasSelection = !!selInfo;
    return /* @__PURE__ */ React.createElement("div", { className: "picker-screen" }, /* @__PURE__ */ React.createElement("div", { className: "picker-header" }, /* @__PURE__ */ React.createElement("button", { className: "picker-back", onClick: () => onClose(null), "aria-label": "Back" }, "\u2190"), /* @__PURE__ */ React.createElement("span", { className: "picker-title" }, "Select Text to Link"), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "picker-confirm",
        onClick: confirmLink,
        "aria-label": "Confirm",
        title: hasSelection ? "Link this excerpt" : "Link the whole letter"
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("polyline", { points: "20 6 9 17 4 12" }))
    )), /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "picker-body picker-body-letter",
        ref: bodyRef,
        onMouseUp: captureSelection,
        onTouchEnd: captureSelection
      },
      /* @__PURE__ */ React.createElement("div", { className: "picker-letter-title" }, titleText),
      subtitleText && /* @__PURE__ */ React.createElement("div", { className: "picker-letter-subtitle" }, subtitleText),
      hasSelection && /* @__PURE__ */ React.createElement("div", { className: "picker-selection-hint" }, '"' + (selInfo.text.length > 80 ? selInfo.text.slice(0, 77) + "\u2026" : selInfo.text) + '"'),
      !hasSelection && /* @__PURE__ */ React.createElement("div", { className: "picker-selection-hint picker-selection-hint-empty" }, "Long-press and drag to select an excerpt, then tap \u2713. Tap \u2713 without selecting to link the whole letter."),
      blocks.map((b) => /* @__PURE__ */ React.createElement(
        "p",
        {
          key: b.key,
          "data-block-key": b.key,
          className: "picker-letter-block"
        },
        b.text
      ))
    ));
  }

  // app/src/main/assets/src/ui/sheets/VersePickerScreen.jsx
  function VersePickerScreen2({ refineRequest, sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText, setHlTick, onClose, returnTargetInsteadOfLink }) {
    const target = refineRequest.target;
    const item = refineRequest.item;
    const isStudy = target.type === "study";
    const bodyRef = React.useRef(null);
    const [selInfo, setSelInfo] = React.useState(null);
    const chapter = React.useMemo(() => {
      if (isStudy) {
        const M = _matthew();
        return M && M.chapters.find((c) => c.num === target.chapter) || null;
      }
      const b = _allBooks()[target.bookId];
      return b && b.chapters.find((c) => c.num === target.chapter) || null;
    }, [isStudy, target.bookId, target.chapter]);
    const verses = React.useMemo(() => {
      if (!chapter) return [];
      if (chapter.verses) return chapter.verses;
      if (chapter.sections) return chapter.sections.flatMap((s) => s.verses);
      return [];
    }, [chapter]);
    React.useEffect(() => {
      const prev = window.__closeSheet;
      window.__closeSheet = () => onClose(null);
      return () => {
        window.__closeSheet = prev || null;
      };
    }, [onClose]);
    const captureSelectionSync = React.useCallback(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
      const range = sel.getRangeAt(0);
      const startN = range.startContainer;
      const endN = range.endContainer;
      const startVerseEl = (startN.nodeType === 3 ? startN.parentElement : startN).closest("[data-verse]");
      const endVerseEl = (endN.nodeType === 3 ? endN.parentElement : endN).closest("[data-verse]");
      if (!startVerseEl || !endVerseEl) return null;
      if (!bodyRef.current || !bodyRef.current.contains(startVerseEl) || !bodyRef.current.contains(endVerseEl)) return null;
      const startVerse = parseInt(startVerseEl.getAttribute("data-verse"), 10);
      const endVerse = parseInt(endVerseEl.getAttribute("data-verse"), 10);
      function offsetWithinVerseText(verseEl, container, offset) {
        const textEl = verseEl.querySelector(".picker-verse-text");
        if (!textEl) return 0;
        const r = document.createRange();
        r.selectNodeContents(textEl);
        try {
          r.setEnd(container, offset);
        } catch (_e) {
          return 0;
        }
        return r.toString().length;
      }
      let charStart = offsetWithinVerseText(startVerseEl, range.startContainer, range.startOffset);
      let charEnd = offsetWithinVerseText(endVerseEl, range.endContainer, range.endOffset);
      const startVText = (verses.find((v) => v.n === startVerse) || {}).text || "";
      const endVText = (verses.find((v) => v.n === endVerse) || {}).text || "";
      const snappedStart = snapRangeToWords(startVText, charStart, startVText.length).start;
      const snappedEndPos = snapRangeToWords(endVText, 0, charEnd).end;
      charStart = Math.max(0, Math.min(snappedStart, startVText.length));
      charEnd = Math.max(0, Math.min(snappedEndPos, endVText.length));
      return {
        verseStart: startVerse,
        verseEnd: endVerse,
        charStart,
        charEnd,
        text: sel.toString()
      };
    }, [verses]);
    const captureSelection = React.useCallback(() => {
      setTimeout(function() {
        const info = captureSelectionSync();
        if (info) setSelInfo(info);
      }, 150);
    }, [captureSelectionSync]);
    const handleVerseTap = React.useCallback((vn) => {
      const v = verses.find((x) => x.n === vn);
      if (!v) return;
      setSelInfo({
        verseStart: vn,
        verseEnd: vn,
        charStart: 0,
        charEnd: (v.text || "").length,
        text: v.text || ""
      });
      try {
        const sel = window.getSelection();
        sel && sel.removeAllRanges && sel.removeAllRanges();
      } catch (_e) {
      }
    }, [verses]);
    const confirmLink = React.useCallback(() => {
      const refinedTarget = { ...target };
      const info = selInfo || captureSelectionSync();
      if (!info) {
        onClose(null);
        return;
      }
      const v1 = info.verseStart;
      const v2 = info.verseEnd;
      refinedTarget.verse = v1;
      if (v2 && v2 !== v1) refinedTarget.verseEnd = v2;
      const v1Obj = verses.find((v) => v.n === v1) || null;
      const v2Obj = verses.find((v) => v.n === v2) || null;
      const v2FullLen = v2Obj ? (v2Obj.text || "").length : 0;
      const isPartialStart = info.charStart > 0;
      const isPartialEnd = info.charEnd < v2FullLen;
      const isPartial = isPartialStart || isPartialEnd;
      if (isPartial) {
        refinedTarget.charStart = info.charStart;
        refinedTarget.charEnd = info.charEnd;
        refinedTarget.partial = true;
      }
      const verseFrag = v1 + (v2 && v2 !== v1 ? "-" + v2 : "");
      let baseKey;
      if (isStudy) {
        baseKey = "study:" + target.bookId + "-" + target.chapter + ":" + verseFrag;
      } else {
        baseKey = bibleHlKey(target.bookId, target.chapter, v1) + (v2 && v2 !== v1 ? "-" + v2 : "");
      }
      refinedTarget.key = isPartial ? baseKey + ":" + info.charStart + "-" + info.charEnd : baseKey;
      const baseLabel = item.title || target.label.replace(/\s\d+(?::\d+(?:-\d+)?)?$/, "");
      refinedTarget.label = baseLabel + " " + target.chapter + ":" + verseFrag;
      refinedTarget.text = info.text;
      refinedTarget.preview = info.text || v1Obj && v1Obj.text || "";
      if (returnTargetInsteadOfLink) {
        onClose(refinedTarget);
        return;
      }
      const sourceEndpoint = buildSourceEndpoint(sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText);
      const newLink = persistLink(sourceEndpoint, refinedTarget);
      if (newLink) setHlTick((t) => t + 1);
      onClose(newLink || null);
    }, [selInfo, captureSelectionSync, target, item, isStudy, verses, sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText, setHlTick, onClose, returnTargetInsteadOfLink]);
    if (!chapter) {
      return /* @__PURE__ */ React.createElement("div", { className: "picker-screen" }, /* @__PURE__ */ React.createElement("div", { className: "picker-header" }, /* @__PURE__ */ React.createElement("button", { className: "picker-back", onClick: () => onClose(null), "aria-label": "Back" }, "\u2190"), /* @__PURE__ */ React.createElement("span", { className: "picker-title" }, "Select Verse")), /* @__PURE__ */ React.createElement("div", { className: "picker-empty" }, "Chapter not found."));
    }
    const titleText = (item.title || target.label.replace(/\s\d+$/, "")) + " " + target.chapter;
    const hasSelection = !!selInfo;
    const previewText = selInfo ? selInfo.text || "" : "";
    return /* @__PURE__ */ React.createElement("div", { className: "picker-screen" }, /* @__PURE__ */ React.createElement("div", { className: "picker-header" }, /* @__PURE__ */ React.createElement("button", { className: "picker-back", onClick: () => onClose(null), "aria-label": "Back" }, "\u2190"), /* @__PURE__ */ React.createElement("span", { className: "picker-title" }, "Select Text"), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "picker-confirm",
        onClick: confirmLink,
        "aria-label": "Confirm",
        title: hasSelection ? "Use this excerpt" : "Use the whole chapter"
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("polyline", { points: "20 6 9 17 4 12" }))
    )), /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "picker-body picker-body-letter",
        onTouchEnd: captureSelection,
        onMouseUp: captureSelection
      },
      /* @__PURE__ */ React.createElement("div", { className: "picker-letter-title" }, titleText),
      /* @__PURE__ */ React.createElement("div", { className: "picker-letter-subtitle" }, isStudy ? "Matthew Study Bible" : "Bible Chapter"),
      /* @__PURE__ */ React.createElement(
        "div",
        {
          className: "picker-selection-hint" + (hasSelection ? "" : " picker-selection-hint-empty")
        },
        hasSelection ? previewText : "Highlight any portion to link. Or tap a verse number to grab the whole verse."
      ),
      /* @__PURE__ */ React.createElement("div", { ref: bodyRef, className: "picker-verses" }, verses.map((v) => /* @__PURE__ */ React.createElement(
        "p",
        {
          key: v.n,
          className: "picker-verse-selectable",
          "data-verse": v.n
        },
        /* @__PURE__ */ React.createElement(
          "span",
          {
            className: "picker-verse-num",
            onClick: function(e) {
              e.stopPropagation();
              handleVerseTap(v.n);
            }
          },
          v.n + " "
        ),
        /* @__PURE__ */ React.createElement("span", { className: "picker-verse-text" }, v.text)
      )))
    ));
  }

  // app/src/main/assets/src/ui/sheets/LinkPicker.jsx
  function LinkPicker2({ sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText, hlTick: _hlTick, setHlTick, onClose, onRequestRefine, lastCreatedLink, onLinkCreated, mode, onPickTarget }) {
    const [input, setInput] = React.useState("");
    const inputRef = React.useRef(null);
    const [, setRecentTick] = React.useState(0);
    const bumpRecent = React.useCallback(() => setRecentTick((t) => t + 1), []);
    const recent = RecentNavStore.list();
    React.useEffect(() => {
      if (inputRef.current) setTimeout(() => inputRef.current.focus(), 50);
    }, []);
    React.useEffect(() => {
      const prev = window.__closeSheet;
      window.__closeSheet = onClose;
      return () => {
        window.__closeSheet = prev || null;
      };
    }, [onClose]);
    const results = React.useMemo(() => {
      if (!input.trim()) return [];
      return searchNavIndex(input.trim(), 30).map((s) => s.item);
    }, [input]);
    const createLinkTo = React.useCallback((item) => {
      if (!item) return;
      const target = navItemToEndpoint(item);
      if (!target) return;
      RecentNavStore.add(item);
      if (mode === "card" && onPickTarget) {
        onPickTarget(target, item);
        return;
      }
      const needsVersePicker = (target.type === "bible" || target.type === "study") && (mode === "excerpt" || !target.verse);
      const needsExcerptPicker = target.type === "letter" || target.type === "wtlb" || target.type === "blessed" || target.type === "holy-days" || target.type === "study-letter";
      if (needsVersePicker || needsExcerptPicker) {
        onRequestRefine && onRequestRefine({
          kind: needsVersePicker ? "verse" : "excerpt",
          target,
          item
        });
        return;
      }
      if (mode === "card" || mode === "excerpt") {
        onPickTarget && onPickTarget(target, item);
        return;
      }
      if (!sourceKey) return;
      const sourceEndpoint = buildSourceEndpoint(sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText);
      const newLink = persistLink(sourceEndpoint, target);
      if (newLink) {
        setHlTick((t) => t + 1);
        bumpRecent();
        onLinkCreated(newLink);
      }
    }, [sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText, setHlTick, bumpRecent, onLinkCreated, mode, onPickTarget, onRequestRefine]);
    const renderItemRow = (item, key) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key,
        className: "navpick-row",
        onClick: () => createLinkTo(item)
      },
      /* @__PURE__ */ React.createElement("div", { className: "navpick-row-icon navpick-row-icon-" + item.kind }, item.kind === "bible-chapter" ? item.category === "Old Testament" ? "OT" : "NT" : item.kind === "study-chapter" ? "SB" : item.kind === "study-letter-chapter" ? "LS" : COL_NAV_ICON.get(item.collection) || "?"),
      /* @__PURE__ */ React.createElement("div", { className: "navpick-row-text" }, /* @__PURE__ */ React.createElement("div", { className: "navpick-row-label" }, item.label), /* @__PURE__ */ React.createElement("div", { className: "navpick-row-cat" }, item.category || ""))
    );
    const isEmptyQuery = !input.trim();
    return /* @__PURE__ */ React.createElement("div", { className: "link-picker-overlay", onClick: onClose }, /* @__PURE__ */ React.createElement("div", { className: "link-picker-sheet navpick-sheet", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "navpick-header" }, /* @__PURE__ */ React.createElement("span", { className: "navpick-title" }, mode === "card" ? "Embed a Card" : mode === "excerpt" ? "Embed an Excerpt" : "Link"), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "navpick-close navpick-close-undo",
        onClick: () => {
          if (lastCreatedLink) {
            LinkStore.remove(lastCreatedLink.id);
            onLinkCreated(null);
          }
          onClose();
        },
        "aria-label": "Cancel"
      },
      "\xD7"
    ), lastCreatedLink && /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "navpick-confirm-green",
        onClick: onClose,
        "aria-label": "Done"
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("polyline", { points: "20 6 9 17 4 12" }))
    )), /* @__PURE__ */ React.createElement("div", { className: "navpick-search-wrap" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        ref: inputRef,
        className: "navpick-search-input",
        placeholder: "Search for verses, letters, or titles\u2026",
        value: input,
        onChange: (e) => setInput(e.target.value),
        onKeyDown: (e) => {
          if (e.key === "Enter" && results.length > 0) createLinkTo(results[0]);
        }
      }
    )), /* @__PURE__ */ React.createElement("div", { className: "navpick-body" }, isEmptyQuery ? recent.length > 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "navpick-section-label" }, "Recent"), recent.map((item, i) => renderItemRow(item, "r" + i))) : /* @__PURE__ */ React.createElement("div", { className: "navpick-empty" }, /* @__PURE__ */ React.createElement("div", { className: "navpick-empty-title" }, "Search to link"), /* @__PURE__ */ React.createElement("div", { className: "navpick-empty-hint" }, 'Examples: "Eph 6:5", "v1l2", "WTLB1 33", or a letter title.')) : results.length > 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "navpick-section-label" }, "Results"), results.map((item, i) => renderItemRow(item, "s" + i))) : /* @__PURE__ */ React.createElement("div", { className: "navpick-empty" }, /* @__PURE__ */ React.createElement("div", { className: "navpick-empty-title" }, "No matches"), /* @__PURE__ */ React.createElement("div", { className: "navpick-empty-hint" }, 'Try "Genesis 1", "Eph 6:5", "V2 letter 5", "The Wide Path", "WTLB1 33".')))));
  }

  // app/src/main/assets/src/ui/sheets/LinkSidebar.jsx
  function LinkSidebar2({ hlKey, hlTick, setHlTick, onClose, onNavigate }) {
    const isBlockScope = hlKey && (hlKey.startsWith("letter:") || hlKey.startsWith("wtlb:") || hlKey.startsWith("blessed:") || hlKey.startsWith("holy-days:"));
    const links = React.useMemo(
      () => isBlockScope ? LinkStore.getForKeyPrefix(hlKey) : LinkStore.getForKey(hlKey),
      // eslint-disable-next-line react-hooks/exhaustive-deps -- cache-bust signal: hlTick bumps on store mutation, forces memo recompute (ARCHITECTURE.md §"Annotation rendering")
      [hlKey, hlTick, isBlockScope]
    );
    React.useEffect(() => {
      if (!hlKey) return;
      const prev = window.__closeSheet;
      window.__closeSheet = onClose;
      return () => {
        window.__closeSheet = prev || null;
      };
    }, [hlKey, onClose]);
    if (!hlKey) return null;
    const countStr = links.length === 0 ? "No links" : links.length === 1 ? "1 link" : links.length + " links";
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "link-sidebar-overlay", onClick: onClose }), /* @__PURE__ */ React.createElement("div", { className: "link-sidebar" }, /* @__PURE__ */ React.createElement("div", { className: "link-sidebar-header" }, /* @__PURE__ */ React.createElement("button", { className: "link-sidebar-close", onClick: onClose, title: "Close" }, "\xD7"), /* @__PURE__ */ React.createElement("span", { className: "link-sidebar-title" }, "Links")), /* @__PURE__ */ React.createElement("div", { className: "link-sidebar-date" }, countStr), /* @__PURE__ */ React.createElement("div", { className: "link-sidebar-body" }, links.length === 0 && /* @__PURE__ */ React.createElement("div", { className: "link-sidebar-empty" }, "No links yet"), links.map((lnk) => /* @__PURE__ */ React.createElement(LinkCard, { key: lnk.id, lnk, hlKey, isBlockScope, onNavigate, setHlTick })))));
  }

  // app/src/main/assets/src/ui/sheets/SelectionToolbar.jsx
  function SelectionToolbar2({ hlTick, setHlTick, onLinkRequest, onNoteRequest, onBookmarkRequest }) {
    const [visible, setVisible] = React.useState(false);
    const [pos, setPos] = React.useState({ x: 0, y: 0 });
    const [selInfo, setSelInfo] = React.useState(null);
    const [activeStyle, setActiveStyle] = React.useState("highlight");
    const toolbarRef = React.useRef(null);
    const suppressRef = React.useRef(false);
    const computeOffset = React.useCallback((container, node, offset) => {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
      let charPos = 0;
      while (walker.nextNode()) {
        if (walker.currentNode === node) return charPos + offset;
        charPos += walker.currentNode.textContent.length;
      }
      return charPos + offset;
    }, []);
    const findHlContainer = React.useCallback((node) => {
      let el = node.nodeType === 3 ? node.parentElement : node;
      while (el && !el.dataset.hlKey) el = el.parentElement;
      return el;
    }, []);
    const dragRef = React.useRef(false);
    const selChangeTimerRef = React.useRef(null);
    const tapTargetRef = React.useRef(null);
    const tapPosRef = React.useRef({ x: 0, y: 0 });
    React.useEffect(() => {
      window.__hideSelectionToolbar = () => {
        setVisible(false);
        try {
          const s = window.getSelection();
          if (s) s.removeAllRanges();
        } catch (_e) {
        }
      };
      return () => {
        window.__hideSelectionToolbar = null;
      };
    }, []);
    React.useEffect(() => {
      const computeAndShow = () => {
        if (suppressRef.current) return;
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
          setVisible(false);
          return;
        }
        const range = sel.getRangeAt(0);
        const text = (() => {
          try {
            const frag = range.cloneContents();
            frag.querySelectorAll(".fn-ref, .hl-note-icon").forEach(function(el) {
              el.remove();
            });
            return frag.textContent.trim();
          } catch (_e) {
            return sel.toString().trim();
          }
        })();
        if (!text) {
          setVisible(false);
          return;
        }
        const container = findHlContainer(range.startContainer);
        const endContainer = findHlContainer(range.endContainer);
        const isMultiVerse = !container || !endContainer || endContainer !== container;
        if (isMultiVerse) {
          const allHlContainers = Array.from(document.querySelectorAll("[data-hl-key]")).filter(function(c) {
            return range.intersectsNode(c);
          });
          if (allHlContainers.length === 0) {
            setVisible(false);
            return;
          }
          setSelInfo({ hlKey: null, start: 0, end: 0, text, existingHl: null, multiVerse: true, multiContainers: allHlContainers });
        } else {
          const hlKey = container.dataset.hlKey;
          const start = computeOffset(container, range.startContainer, range.startOffset);
          const end = computeOffset(container, range.endContainer, range.endOffset);
          if (start >= end) {
            setVisible(false);
            return;
          }
          const existing = HighlightStore.get(hlKey).find((h) => h.start <= start && h.end >= end);
          setSelInfo({ hlKey, start, end, text, existingHl: existing || null, multiVerse: false });
        }
        const rect = range.getBoundingClientRect();
        const toolbarW = 320;
        let x = rect.left + rect.width / 2 - toolbarW / 2;
        x = Math.max(8, Math.min(x, window.innerWidth - toolbarW - 8));
        let y = rect.top - 10;
        if (y < 80) y = rect.bottom + 10;
        setPos({ x, y });
        setVisible(true);
      };
      const onSelectionChange = () => {
        if (suppressRef.current) return;
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
          if (selChangeTimerRef.current) {
            clearTimeout(selChangeTimerRef.current);
            selChangeTimerRef.current = null;
          }
          setTimeout(() => {
            if (!suppressRef.current) {
              const s = window.getSelection();
              if (!s || s.isCollapsed) setVisible(false);
            }
          }, 150);
        } else if (!dragRef.current) {
          if (selChangeTimerRef.current) clearTimeout(selChangeTimerRef.current);
          selChangeTimerRef.current = setTimeout(function() {
            selChangeTimerRef.current = null;
            computeAndShow();
          }, 350);
        }
      };
      const onPointerDown = (e) => {
        if (toolbarRef.current && toolbarRef.current.contains(e.target)) return;
        tapTargetRef.current = e.target;
        tapPosRef.current = { x: e.clientX || 0, y: e.clientY || 0 };
        dragRef.current = true;
        setVisible(false);
      };
      const onPointerUp = (e) => {
        if (!dragRef.current) return;
        dragRef.current = false;
        const sel = window.getSelection();
        const isCollapsed = !sel || sel.isCollapsed;
        const tapTarget = tapTargetRef.current;
        const pos2 = e && e.clientX ? { x: e.clientX, y: e.clientY } : tapPosRef.current;
        if (isCollapsed && tapTarget) {
          const el = tapTarget.nodeType === 3 ? tapTarget.parentElement : tapTarget;
          const iconEl = el && el.closest(".hl-note-icon");
          if (iconEl) {
            const gids = (iconEl.getAttribute("data-group-ids") || iconEl.getAttribute("data-group-id") || "").split(",").filter(Boolean);
            if (gids.length > 1 && window.__showMultiNote) {
              window.__showMultiNote(gids, pos2.x, pos2.y);
              return;
            }
            if (gids.length === 1 && window.__openNote) {
              window.__openNote(gids[0]);
              return;
            }
          }
          const markEl = el && el.closest("mark.hl-mark");
          if (markEl) {
            const groupId = markEl.getAttribute("data-group-id") || markEl.getAttribute("data-hl-id");
            const kind = markEl.getAttribute("data-kind") || "highlight";
            const containerEl = markEl.closest("[data-hl-key]");
            const hlKey = containerEl ? containerEl.getAttribute("data-hl-key") : null;
            if (groupId && hlKey) {
              if (kind === "note") {
                const overlapGids = /* @__PURE__ */ new Set([groupId]);
                try {
                  const stack = document.elementsFromPoint(pos2.x, pos2.y);
                  stack.forEach((n) => {
                    if (n.matches && n.matches('mark.hl-note[data-kind="note"]')) {
                      const g = n.getAttribute("data-group-id");
                      if (g) overlapGids.add(g);
                    }
                  });
                } catch (_e) {
                }
                if (overlapGids.size > 1 && window.__showMultiNote) {
                  window.__showMultiNote([...overlapGids], pos2.x, pos2.y);
                  return;
                }
                if (window.__openNote) {
                  window.__openNote(groupId);
                  return;
                }
              }
              if (window.__showAnnChip) {
                window.__showAnnChip(pos2.x, pos2.y + 12, hlKey, groupId);
                return;
              }
            }
          }
        }
        setTimeout(computeAndShow, 150);
      };
      const onContextMenu = (e) => {
        const hlContainer = e.target.closest("[data-hl-key]");
        if (hlContainer) e.preventDefault();
        const iconEl = e.target.closest(".hl-note-icon");
        if (iconEl) {
          const gid = iconEl.getAttribute("data-group-id");
          if (gid && window.__openNote) {
            setVisible(false);
            window.__openNote(gid);
            return;
          }
        }
        const mark = e.target.closest("mark.hl-mark");
        if (mark) {
          const groupId = mark.getAttribute("data-group-id") || mark.getAttribute("data-hl-id");
          const kind = mark.getAttribute("data-kind") || "highlight";
          const container = mark.closest("[data-hl-key]");
          const hlKey = container ? container.getAttribute("data-hl-key") : null;
          if (groupId && hlKey) {
            setVisible(false);
            if (kind === "note" && window.__openNote) {
              window.__openNote(groupId);
              return;
            }
            if (window.__showAnnChip) {
              window.__showAnnChip(e.clientX, e.clientY, hlKey, groupId);
              return;
            }
          }
        }
        setTimeout(computeAndShow, 80);
      };
      document.addEventListener("selectionchange", onSelectionChange);
      document.addEventListener("pointerdown", onPointerDown);
      document.addEventListener("pointerup", onPointerUp);
      document.addEventListener("touchend", onPointerUp);
      document.addEventListener("contextmenu", onContextMenu);
      return () => {
        document.removeEventListener("selectionchange", onSelectionChange);
        document.removeEventListener("pointerdown", onPointerDown);
        document.removeEventListener("pointerup", onPointerUp);
        document.removeEventListener("touchend", onPointerUp);
        document.removeEventListener("contextmenu", onContextMenu);
      };
    }, [computeOffset, findHlContainer, hlTick]);
    const applyHighlight = React.useCallback((color) => {
      if (!selInfo) return;
      suppressRef.current = true;
      const kind = activeStyle === "underline" ? "underline" : "highlight";
      if (selInfo.multiVerse) {
        const sel = window.getSelection();
        const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
        const containers = selInfo.multiContainers || (range ? Array.from(document.querySelectorAll("[data-hl-key]")).filter(function(c) {
          return range.intersectsNode(c);
        }) : []);
        const groupId = hlId();
        const groupsToRemove = /* @__PURE__ */ new Set();
        containers.forEach(function(container) {
          var hlKey = container.dataset.hlKey;
          var containerLen = container.textContent.length;
          var start = range && container.contains(range.startContainer) ? computeOffset(container, range.startContainer, range.startOffset) : 0;
          var end = range && container.contains(range.endContainer) ? computeOffset(container, range.endContainer, range.endOffset) : containerLen;
          AnnotationStore.get(hlKey).forEach(function(h) {
            if (h.start === start && h.end === end && h.groupId) groupsToRemove.add(h.groupId);
          });
        });
        groupsToRemove.forEach(function(gid) {
          AnnotationStore.removeGroup(gid);
          NoteStore.remove(gid);
        });
        containers.forEach(function(container) {
          var hlKey = container.dataset.hlKey;
          var containerText = container.textContent;
          var containerLen = containerText.length;
          var rawStart = range && container.contains(range.startContainer) ? computeOffset(container, range.startContainer, range.startOffset) : 0;
          var rawEnd = range && container.contains(range.endContainer) ? computeOffset(container, range.endContainer, range.endOffset) : containerLen;
          var snap = snapRangeToWords(containerText, rawStart, rawEnd);
          if (snap.start >= snap.end) return;
          AnnotationStore.add(hlKey, {
            id: hlId(),
            groupId,
            kind,
            start: snap.start,
            end: snap.end,
            color,
            text: containerText.slice(snap.start, snap.end),
            created: Date.now()
          });
        });
      } else {
        const container = document.querySelector('[data-hl-key="' + selInfo.hlKey.replace(/"/g, '\\"') + '"]');
        const containerText = container ? container.textContent : selInfo.text;
        const snap = snapRangeToWords(containerText, selInfo.start, selInfo.end);
        const existing = AnnotationStore.get(selInfo.hlKey);
        const groupsToRemove = /* @__PURE__ */ new Set();
        existing.forEach((h) => {
          if (h.start === snap.start && h.end === snap.end && h.groupId) groupsToRemove.add(h.groupId);
        });
        groupsToRemove.forEach((gid) => {
          AnnotationStore.removeGroup(gid);
          NoteStore.remove(gid);
        });
        const id = hlId();
        AnnotationStore.add(selInfo.hlKey, {
          id,
          groupId: id,
          kind,
          start: snap.start,
          end: snap.end,
          color,
          text: containerText.slice(snap.start, snap.end),
          created: Date.now()
        });
      }
      window.getSelection().removeAllRanges();
      setVisible(false);
      setHlTick((t) => t + 1);
      setTimeout(() => {
        suppressRef.current = false;
      }, 300);
    }, [selInfo, activeStyle, setHlTick, computeOffset]);
    const removeHighlight = React.useCallback(() => {
      if (!selInfo) return;
      suppressRef.current = true;
      const sel = window.getSelection();
      const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
      const containers = selInfo.multiVerse ? selInfo.multiContainers || (range ? Array.from(document.querySelectorAll("[data-hl-key]")).filter((c) => range.intersectsNode(c)) : []) : [document.querySelector('[data-hl-key="' + (selInfo.hlKey || "").replace(/"/g, '\\"') + '"]')].filter(Boolean);
      const removedGroups = /* @__PURE__ */ new Set();
      containers.forEach(function(container) {
        if (!container) return;
        var hlKey = container.dataset.hlKey;
        var containerLen = container.textContent.length;
        var start = selInfo.multiVerse ? range && container.contains(range.startContainer) ? computeOffset(container, range.startContainer, range.startOffset) : 0 : selInfo.start;
        var end = selInfo.multiVerse ? range && container.contains(range.endContainer) ? computeOffset(container, range.endContainer, range.endOffset) : containerLen : selInfo.end;
        AnnotationStore.get(hlKey).forEach(function(h) {
          if (h.start < end && h.end > start && h.groupId && !removedGroups.has(h.groupId)) {
            removedGroups.add(h.groupId);
            AnnotationStore.removeGroup(h.groupId);
            NoteStore.remove(h.groupId);
          }
        });
      });
      window.getSelection().removeAllRanges();
      setVisible(false);
      setHlTick((t) => t + 1);
      setTimeout(() => {
        suppressRef.current = false;
      }, 300);
    }, [selInfo, setHlTick, computeOffset]);
    const copyText = React.useCallback(() => {
      if (!selInfo) return;
      navigator.clipboard.writeText(selInfo.text).catch(() => {
      });
      window.getSelection().removeAllRanges();
      setVisible(false);
    }, [selInfo]);
    const handleLink = React.useCallback(() => {
      if (!selInfo) return;
      window.getSelection().removeAllRanges();
      setVisible(false);
      var linkInfo = selInfo;
      if (selInfo.multiVerse && selInfo.multiContainers && selInfo.multiContainers.length > 0) {
        linkInfo = Object.assign({}, selInfo, { hlKey: selInfo.multiContainers[0].dataset.hlKey });
      }
      onLinkRequest && onLinkRequest(linkInfo);
    }, [selInfo, onLinkRequest]);
    const handleNote = React.useCallback(() => {
      if (!selInfo) return;
      const sel = window.getSelection();
      const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
      let groupId;
      if (selInfo.multiVerse) {
        const containers = selInfo.multiContainers || (range ? Array.from(document.querySelectorAll("[data-hl-key]")).filter((c) => range.intersectsNode(c)) : []);
        let convertTarget = null;
        containers.forEach(function(container) {
          if (convertTarget) return;
          var hlKey = container.dataset.hlKey;
          var containerLen = container.textContent.length;
          var start = range && container.contains(range.startContainer) ? computeOffset(container, range.startContainer, range.startOffset) : 0;
          var end = range && container.contains(range.endContainer) ? computeOffset(container, range.endContainer, range.endOffset) : containerLen;
          AnnotationStore.get(hlKey).forEach(function(h) {
            if (convertTarget) return;
            if (h.start < end && h.end > start && h.kind !== "note" && h.groupId) {
              convertTarget = h.groupId;
            }
          });
        });
        if (convertTarget) {
          AnnotationStore.convertGroup(convertTarget, "note");
          groupId = convertTarget;
        } else {
          groupId = hlId();
          containers.forEach(function(container) {
            var hlKey = container.dataset.hlKey;
            var containerText = container.textContent;
            var containerLen = containerText.length;
            var rawStart = range && container.contains(range.startContainer) ? computeOffset(container, range.startContainer, range.startOffset) : 0;
            var rawEnd = range && container.contains(range.endContainer) ? computeOffset(container, range.endContainer, range.endOffset) : containerLen;
            var snap = snapRangeToWords(containerText, rawStart, rawEnd);
            if (snap.start >= snap.end) return;
            AnnotationStore.add(hlKey, {
              id: hlId(),
              groupId,
              kind: "note",
              start: snap.start,
              end: snap.end,
              color: "yellow",
              text: containerText.slice(snap.start, snap.end),
              created: Date.now()
            });
          });
        }
      } else {
        const container = document.querySelector('[data-hl-key="' + selInfo.hlKey.replace(/"/g, '\\"') + '"]');
        const containerText = container ? container.textContent : selInfo.text;
        const snap = snapRangeToWords(containerText, selInfo.start, selInfo.end);
        if (snap.start >= snap.end) {
          window.getSelection().removeAllRanges();
          setVisible(false);
          return;
        }
        const existing = AnnotationStore.get(selInfo.hlKey).find(
          (h) => h.start <= snap.start && h.end >= snap.end && h.kind !== "note"
        );
        if (existing) {
          AnnotationStore.convertGroup(existing.groupId, "note");
          groupId = existing.groupId;
        } else {
          const id = hlId();
          groupId = id;
          AnnotationStore.add(selInfo.hlKey, {
            id,
            groupId: id,
            kind: "note",
            start: snap.start,
            end: snap.end,
            color: "yellow",
            text: containerText.slice(snap.start, snap.end),
            created: Date.now()
          });
        }
      }
      const segs = AnnotationStore.getByGroup(groupId);
      if (segs.length === 0) {
        window.getSelection().removeAllRanges();
        setVisible(false);
        return;
      }
      const fullText = segs.map((s) => s.ann.text || "").join(" \u2026 ");
      const keys = [...new Set(segs.map((s) => s.key))];
      const existingNote = NoteStore.get(groupId);
      NoteStore.set(groupId, {
        color: segs[0] ? segs[0].ann.color : "yellow",
        fullText,
        keys,
        body: existingNote ? existingNote.body : ""
      });
      window.getSelection().removeAllRanges();
      setVisible(false);
      setHlTick((t) => t + 1);
      onNoteRequest && onNoteRequest(
        groupId,
        /*startInEditMode=*/
        true
      );
    }, [selInfo, setHlTick, onNoteRequest, computeOffset]);
    const handleShare = React.useCallback(() => {
      if (!selInfo) return;
      const text = selInfo.text;
      if (navigator.share) {
        navigator.share({ text }).catch(() => {
        });
      } else {
        navigator.clipboard.writeText(text).catch(() => {
        });
      }
      window.getSelection().removeAllRanges();
      setVisible(false);
    }, [selInfo]);
    const handleSearch = React.useCallback(() => {
      if (!selInfo) return;
      const text = selInfo.text;
      window.getSelection().removeAllRanges();
      setVisible(false);
      window.__pendingSearchQuery = text;
      if (window.__goSearch) window.__goSearch();
    }, [selInfo]);
    const handleBookmark = React.useCallback(() => {
      if (!selInfo) return;
      var hlKey = selInfo.hlKey;
      if (selInfo.multiVerse && selInfo.multiContainers && selInfo.multiContainers.length > 0) {
        hlKey = selInfo.multiContainers[0].dataset.hlKey;
      }
      if (!hlKey) {
        window.getSelection().removeAllRanges();
        setVisible(false);
        return;
      }
      var container = document.querySelector('[data-hl-key="' + hlKey.replace(/"/g, '\\"') + '"]');
      var containerText = container ? container.textContent : selInfo.text || "";
      var snap = typeof snapRangeToWords === "function" ? snapRangeToWords(containerText, selInfo.start || 0, selInfo.end || 0) : { start: selInfo.start || 0, end: selInfo.end || 0 };
      var labelText = "";
      if (container && snap.end > snap.start) {
        labelText = containerText.slice(snap.start, snap.end).trim();
      }
      if (!labelText && selInfo.text) {
        labelText = selInfo.text.trim();
      }
      if (labelText.length > 120) labelText = labelText.slice(0, 117) + "...";
      if (!labelText) {
        var parts = hlKey.split(":");
        var kind = parts[0];
        if (kind === "bible" || kind === "study") {
          labelText = "Bookmark";
        } else if (kind === "letter" || kind === "wtlb" || kind === "blessed" || kind === "holy-days") {
          var ctx = typeof findEntryContext === "function" ? findEntryContext(parts[1], kind) : null;
          labelText = ctx && ctx.title ? "Bookmark in " + ctx.title : "Bookmark";
        } else {
          labelText = "Bookmark";
        }
      }
      var storedKey = hlKey;
      if (snap.end > snap.start) {
        storedKey = hlKey + ":" + snap.start + "-" + snap.end;
      }
      var excerpt = "";
      if (container && snap.end > snap.start) {
        excerpt = containerText.slice(snap.start, snap.end);
      }
      if (!excerpt && selInfo.text) {
        excerpt = selInfo.text;
      }
      if (excerpt.length > 220) excerpt = excerpt.slice(0, 217) + "...";
      var sourceLabel = typeof _bookmarkSourceLabel === "function" ? _bookmarkSourceLabel(storedKey) : "";
      window.getSelection().removeAllRanges();
      setVisible(false);
      if (typeof window.__bookmarkCreate === "function") {
        window.__bookmarkCreate({
          hlKey: storedKey,
          sourceLabel,
          excerpt,
          defaultLabel: labelText
        });
      } else {
        BookmarkStore.add({
          id: typeof bkmId === "function" ? bkmId() : "bkm_" + Date.now(),
          hlKey: storedKey,
          label: labelText,
          thought: "",
          created: Date.now(),
          updated: Date.now()
        });
        if (typeof setHlTick === "function") setHlTick(function(t) {
          return t + 1;
        });
      }
      if (typeof onBookmarkRequest === "function") onBookmarkRequest(storedKey);
    }, [selInfo, setHlTick, onBookmarkRequest]);
    if (!visible || !selInfo) return null;
    var mv = selInfo.multiVerse;
    var mvCanHighlight = mv && selInfo.multiContainers && selInfo.multiContainers.length > 0;
    var showColors = !mv || mvCanHighlight;
    var mvHasExisting = mvCanHighlight && (selInfo.multiContainers || []).some(function(c) {
      return HighlightStore.get(c.dataset.hlKey).length > 0;
    });
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        ref: toolbarRef,
        className: "sel-toolbar",
        style: { left: pos.x, top: pos.y, transform: "translateY(-100%)" },
        onPointerDown: (e) => {
          e.stopPropagation();
          suppressRef.current = true;
        },
        onPointerUp: () => {
          setTimeout(() => {
            suppressRef.current = false;
          }, 300);
        }
      },
      showColors && /* @__PURE__ */ React.createElement("div", { className: "sel-toolbar-row sel-toolbar-styles" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "sel-style-btn" + (activeStyle === "highlight" ? " active" : ""),
          onClick: () => setActiveStyle("highlight"),
          title: "Highlight"
        },
        "A"
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "sel-style-btn sel-style-btn-underline" + (activeStyle === "underline" ? " active" : ""),
          onClick: () => setActiveStyle("underline"),
          title: "Underline"
        },
        "A"
      ), /* @__PURE__ */ React.createElement("div", { className: "sel-toolbar-divider" }), /* @__PURE__ */ React.createElement("div", { className: "sel-toolbar-colors" }, HL_COLORS.map((c) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: c,
          className: "sel-color-btn sel-color-" + activeStyle + (selInfo.existingHl && selInfo.existingHl.color === c && (selInfo.existingHl.kind || "highlight") === activeStyle ? " active" : ""),
          "data-color": c,
          onClick: () => applyHighlight(c),
          title: c
        }
      )), (selInfo.existingHl || mvHasExisting) && /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "sel-color-btn sel-color-clear",
          onClick: removeHighlight,
          title: "Remove highlight"
        },
        "\u2715"
      ))),
      /* @__PURE__ */ React.createElement("div", { className: "sel-toolbar-row sel-toolbar-actions" }, !mv && /* @__PURE__ */ React.createElement("button", { className: "sel-action-btn", onClick: handleNote, title: "Note" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24" }, /* @__PURE__ */ React.createElement("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }), /* @__PURE__ */ React.createElement("polyline", { points: "14 2 14 8 20 8" }), /* @__PURE__ */ React.createElement("line", { x1: "8", y1: "13", x2: "16", y2: "13" }), /* @__PURE__ */ React.createElement("line", { x1: "8", y1: "17", x2: "16", y2: "17" })), /* @__PURE__ */ React.createElement("span", null, "Note")), showColors && /* @__PURE__ */ React.createElement("button", { className: "sel-action-btn", onClick: handleLink, title: "Link" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24" }, /* @__PURE__ */ React.createElement("path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }), /* @__PURE__ */ React.createElement("path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" })), /* @__PURE__ */ React.createElement("span", null, "Link")), /* @__PURE__ */ React.createElement("button", { className: "sel-action-btn", onClick: copyText, title: "Copy" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24" }, /* @__PURE__ */ React.createElement("rect", { x: "9", y: "9", width: "13", height: "13", rx: "2", ry: "2" }), /* @__PURE__ */ React.createElement("path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" })), /* @__PURE__ */ React.createElement("span", null, "Copy")), /* @__PURE__ */ React.createElement("button", { className: "sel-action-btn", onClick: handleShare, title: "Share" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24" }, /* @__PURE__ */ React.createElement("circle", { cx: "18", cy: "5", r: "3" }), /* @__PURE__ */ React.createElement("circle", { cx: "6", cy: "12", r: "3" }), /* @__PURE__ */ React.createElement("circle", { cx: "18", cy: "19", r: "3" }), /* @__PURE__ */ React.createElement("line", { x1: "8.59", y1: "13.51", x2: "15.42", y2: "17.49" }), /* @__PURE__ */ React.createElement("line", { x1: "15.41", y1: "6.51", x2: "8.59", y2: "10.49" })), /* @__PURE__ */ React.createElement("span", null, "Share")), /* @__PURE__ */ React.createElement("button", { className: "sel-action-btn", onClick: handleSearch, title: "Search" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24" }, /* @__PURE__ */ React.createElement("circle", { cx: "11", cy: "11", r: "8" }), /* @__PURE__ */ React.createElement("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" })), /* @__PURE__ */ React.createElement("span", null, "Search")), /* @__PURE__ */ React.createElement("button", { className: "sel-action-btn", onClick: handleBookmark, title: "Bookmark" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24" }, /* @__PURE__ */ React.createElement("path", { d: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" })), /* @__PURE__ */ React.createElement("span", null, "Bookmark")))
    );
  }

  // app/src/main/assets/src/ui/sheets/AnnotationActionChip.jsx
  function AnnotationActionChip2({ chip, setHlTick, onClose, onNoteRequest }) {
    const [mode, setMode] = React.useState("main");
    const lastGroupRef = React.useRef(null);
    React.useEffect(() => {
      if (chip && chip.groupId !== lastGroupRef.current) {
        lastGroupRef.current = chip.groupId;
        setMode("main");
      }
    }, [chip]);
    if (!chip) return null;
    const { x, y, hlKey, groupId } = chip;
    const ann = (AnnotationStore.get(hlKey) || []).find((h) => h.groupId === groupId);
    if (!ann) return null;
    const kind = ann.kind || "highlight";
    const kindLabel = kind === "underline" ? "underline" : "highlight";
    const widthByMode = { main: 200, confirm: 280, colors: 320 };
    const cw = widthByMode[mode] || 200;
    const cx = Math.max(8, Math.min(x - cw / 2, window.innerWidth - cw - 8));
    const cy = Math.max(8, y + 10);
    const remove = () => {
      AnnotationStore.removeGroup(groupId);
      NoteStore.remove(groupId);
      setHlTick((t) => t + 1);
      onClose();
    };
    const recolor = (color) => {
      AnnotationStore.recolorGroup(groupId, color);
      if (kind === "note") NoteStore.update(groupId, { color });
      setHlTick((t) => t + 1);
      onClose();
    };
    const convertToNote = () => {
      AnnotationStore.convertGroup(groupId, "note");
      const segs = AnnotationStore.getByGroup(groupId);
      const fullText = segs.map((s) => s.ann.text || "").join(" \u2026 ");
      const keys = [...new Set(segs.map((s) => s.key))];
      NoteStore.set(groupId, { color: ann.color, fullText, keys, body: "" });
      setHlTick((t) => t + 1);
      onClose();
      if (onNoteRequest) onNoteRequest(
        groupId,
        /*startInEditMode=*/
        true
      );
    };
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
      "div",
      {
        style: { position: "fixed", inset: 0, zIndex: 2999 },
        onClick: onClose,
        onContextMenu: (e) => {
          e.preventDefault();
          onClose();
        }
      }
    ), /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "ann-chip",
        style: { position: "fixed", left: cx, top: cy, zIndex: 3e3 },
        onClick: (e) => e.stopPropagation()
      },
      mode === "main" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "ann-chip-btn danger",
          onClick: () => setMode("confirm"),
          title: "Remove"
        },
        /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24" }, /* @__PURE__ */ React.createElement("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), /* @__PURE__ */ React.createElement("line", { x1: "6", y1: "6", x2: "18", y2: "18" })),
        /* @__PURE__ */ React.createElement("span", null, "Remove")
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "ann-chip-btn",
          onClick: () => setMode("colors"),
          title: "Recolor"
        },
        /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "8" }), /* @__PURE__ */ React.createElement("circle", { cx: "8", cy: "9", r: "1.4", fill: "currentColor", stroke: "none" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "7", r: "1.4", fill: "currentColor", stroke: "none" }), /* @__PURE__ */ React.createElement("circle", { cx: "16", cy: "9", r: "1.4", fill: "currentColor", stroke: "none" }), /* @__PURE__ */ React.createElement("circle", { cx: "17", cy: "14", r: "1.4", fill: "currentColor", stroke: "none" })),
        /* @__PURE__ */ React.createElement("span", null, "Color")
      ), kind !== "note" && /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "ann-chip-btn",
          onClick: convertToNote,
          title: "Convert to note"
        },
        /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24" }, /* @__PURE__ */ React.createElement("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }), /* @__PURE__ */ React.createElement("polyline", { points: "14 2 14 8 20 8" }), /* @__PURE__ */ React.createElement("line", { x1: "8", y1: "13", x2: "16", y2: "13" }), /* @__PURE__ */ React.createElement("line", { x1: "8", y1: "17", x2: "16", y2: "17" })),
        /* @__PURE__ */ React.createElement("span", null, "Note")
      )),
      mode === "confirm" && /* @__PURE__ */ React.createElement("div", { className: "ann-chip-confirm" }, /* @__PURE__ */ React.createElement("span", { className: "ann-chip-confirm-q" }, "Remove this ", kindLabel, "?"), /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "ann-chip-confirm-btn ann-chip-confirm-cancel",
          onClick: () => setMode("main")
        },
        "Cancel"
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "ann-chip-confirm-btn ann-chip-confirm-yes",
          onClick: remove
        },
        "Yes, remove"
      )),
      mode === "colors" && /* @__PURE__ */ React.createElement("div", { className: "ann-chip-colors" }, /* @__PURE__ */ React.createElement("button", { className: "ann-chip-back", onClick: () => setMode("main"), title: "Back" }, "\u2039"), HL_COLORS.map((c) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: c,
          className: "ann-chip-color-btn" + (ann.color === c ? " active" : ""),
          "data-color": c,
          onClick: () => recolor(c),
          title: c
        }
      )))
    ));
  }

  // app/src/main/assets/src/ui/sheets/BookmarkCreateSheet.jsx
  function BookmarkCreateSheet2({ pending, onConfirm, onCancel, onDelete, onOpen }) {
    var useState2 = React.useState;
    var useEffect2 = React.useEffect;
    var useRef = React.useRef;
    var labelRef = useRef(null);
    var isEditMode = !!(pending && pending.editId);
    var _label = useState2(
      isEditMode ? pending.currentLabel || "" : pending && pending.defaultLabel || ""
    );
    var label = _label[0];
    var setLabel = _label[1];
    var _thought = useState2(isEditMode ? pending.currentThought || "" : "");
    var thought = _thought[0];
    var setThought = _thought[1];
    var _confirmDel = useState2(false);
    var confirmingDelete = _confirmDel[0];
    var setConfirmingDelete = _confirmDel[1];
    var initialRef = useRef({ label: "", thought: "" });
    var pendingEditId = pending && pending.editId;
    var pendingHlKey = pending && pending.hlKey;
    useEffect2(function() {
      if (!pending) return;
      if (pending.editId) {
        setLabel(pending.currentLabel || "");
        setThought(pending.currentThought || "");
        initialRef.current = {
          label: pending.currentLabel || "",
          thought: pending.currentThought || ""
        };
      } else {
        setLabel(pending.defaultLabel || "");
        setThought("");
        initialRef.current = {
          label: pending.defaultLabel || "",
          thought: ""
        };
      }
      setConfirmingDelete(false);
      setTimeout(function() {
        if (labelRef.current) {
          labelRef.current.focus();
          labelRef.current.select();
        }
      }, 60);
    }, [pendingEditId, pendingHlKey]);
    var canSave;
    if (isEditMode) {
      canSave = label.trim() !== initialRef.current.label.trim() || thought.trim() !== initialRef.current.thought.trim();
    } else {
      canSave = label.trim().length > 0;
    }
    useEffect2(function() {
      if (!pending) return;
      var prev = window.__closeSheet;
      window.__closeSheet = onCancel;
      return function() {
        window.__closeSheet = prev || null;
      };
    }, [pending, onCancel]);
    if (!pending) return null;
    function commit() {
      var trimmedLabel = label.trim() || pending.defaultLabel || pending.currentLabel || "Bookmark";
      var trimmedThought = thought.trim();
      onConfirm({
        editId: pending.editId || null,
        hlKey: pending.hlKey,
        label: trimmedLabel,
        thought: trimmedThought
      });
    }
    function handleDelete() {
      if (!confirmingDelete) {
        setConfirmingDelete(true);
        return;
      }
      if (typeof onDelete === "function") onDelete(pending.editId);
    }
    function handleOpen() {
      if (typeof onOpen === "function") onOpen(pending.editId);
    }
    var title = isEditMode ? "Edit Bookmark" : "New Bookmark";
    var saveTitle = isEditMode ? "Save changes" : "Save bookmark";
    return /* @__PURE__ */ React.createElement("div", { className: "link-picker-overlay", onClick: onCancel }, /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "link-picker-sheet navpick-sheet bkm-create-sheet" + (isEditMode ? " bkm-create-sheet-edit" : ""),
        onClick: function(e) {
          e.stopPropagation();
        }
      },
      /* @__PURE__ */ React.createElement("div", { className: "navpick-header" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "navpick-close navpick-close-undo",
          onClick: onCancel,
          "aria-label": "Cancel"
        },
        "\xD7"
      ), /* @__PURE__ */ React.createElement("span", { className: "navpick-title" }, title), /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "navpick-confirm-green",
          onClick: canSave ? commit : void 0,
          disabled: !canSave,
          "aria-label": saveTitle,
          title: canSave ? saveTitle : isEditMode ? "No changes to save" : "Add a label"
        },
        /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("polyline", { points: "20 6 9 17 4 12" }))
      )),
      /* @__PURE__ */ React.createElement("div", { className: "bkm-create-body" }, pending.sourceLabel && /* @__PURE__ */ React.createElement("div", { className: "bkm-create-source" }, pending.sourceLabel), pending.excerpt && /* @__PURE__ */ React.createElement("div", { className: "bkm-create-excerpt" }, "\u201C", pending.excerpt, "\u201D"), /* @__PURE__ */ React.createElement("div", { className: "bkm-create-field-label" }, "Label"), /* @__PURE__ */ React.createElement(
        "input",
        {
          ref: labelRef,
          className: "bkm-create-label-input",
          type: "text",
          value: label,
          onChange: function(e) {
            setLabel(e.target.value);
          },
          onKeyDown: function(e) {
            if (e.key === "Enter") {
              e.preventDefault();
              if (canSave) commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          },
          placeholder: "A short name for this bookmark\u2026",
          maxLength: 200
        }
      ), /* @__PURE__ */ React.createElement("div", { className: "bkm-create-field-label" }, "A Thought", /* @__PURE__ */ React.createElement("span", { className: "bkm-create-field-hint" }, " (optional \u2014 why did you save this?)")), /* @__PURE__ */ React.createElement(
        "textarea",
        {
          className: "bkm-create-thought-input",
          value: thought,
          onChange: function(e) {
            setThought(e.target.value);
          },
          onKeyDown: function(e) {
            if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              if (canSave) commit();
            }
          },
          placeholder: "A few words for your future self\u2026",
          rows: 4
        }
      ), isEditMode && /* @__PURE__ */ React.createElement("div", { className: "bkm-create-edit-actions" }, !pending.atSource && /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "bkm-create-edit-btn",
          onClick: handleOpen,
          title: "Open this passage"
        },
        /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }), /* @__PURE__ */ React.createElement("polyline", { points: "15 3 21 3 21 9" }), /* @__PURE__ */ React.createElement("line", { x1: "10", y1: "14", x2: "21", y2: "3" })),
        /* @__PURE__ */ React.createElement("span", null, "Open Source")
      ), !confirmingDelete && /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "bkm-create-edit-btn bkm-create-edit-btn-danger",
          onClick: handleDelete,
          title: "Delete this bookmark"
        },
        /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("polyline", { points: "3 6 5 6 21 6" }), /* @__PURE__ */ React.createElement("path", { d: "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" }), /* @__PURE__ */ React.createElement("path", { d: "M10 11v6" }), /* @__PURE__ */ React.createElement("path", { d: "M14 11v6" })),
        /* @__PURE__ */ React.createElement("span", null, "Delete")
      ), confirmingDelete && /* @__PURE__ */ React.createElement("div", { className: "ann-chip-confirm bkm-create-edit-confirm" }, /* @__PURE__ */ React.createElement("span", { className: "ann-chip-confirm-q" }, "Delete bookmark?"), /* @__PURE__ */ React.createElement("button", { className: "ann-chip-confirm-btn ann-chip-confirm-cancel", onClick: function() {
        setConfirmingDelete(false);
      } }, "Cancel"), /* @__PURE__ */ React.createElement("button", { className: "ann-chip-confirm-btn ann-chip-confirm-yes", onClick: handleDelete }, "Yes, delete"))))
    ));
  }

  // app/src/main/assets/src/ui/sheets/NotebookManagerSheet.jsx
  function NotebookManagerSheet({ hlTick, setHlTick, onClose }) {
    const notebooks = React.useMemo(() => NotebookStore.list(), [hlTick]);
    const [newName, setNewName] = React.useState("");
    const [renameId, setRenameId] = React.useState(null);
    const [renameValue, setRenameValue] = React.useState("");
    const [confirmDeleteId, setConfirmDeleteId] = React.useState(null);
    const counts = React.useMemo(() => {
      const map = {};
      NoteStore.list().forEach((n) => {
        (n.notebookIds || []).forEach((id) => {
          map[id] = (map[id] || 0) + 1;
        });
      });
      return map;
    }, [hlTick]);
    const createNotebook = () => {
      const trimmed = newName.trim();
      if (!trimmed) return;
      NotebookStore.add(trimmed);
      setHlTick((t) => t + 1);
      setNewName("");
    };
    const startRename = (nb) => {
      setRenameId(nb.id);
      setRenameValue(nb.name);
    };
    const commitRename = () => {
      const trimmed = renameValue.trim();
      if (trimmed && renameId) {
        NotebookStore.rename(renameId, trimmed);
        setHlTick((t) => t + 1);
      }
      setRenameId(null);
      setRenameValue("");
    };
    const cancelRename = () => {
      setRenameId(null);
      setRenameValue("");
    };
    const deleteNb = (id) => {
      NotebookStore.remove(id);
      setHlTick((t) => t + 1);
      setConfirmDeleteId(null);
    };
    return /* @__PURE__ */ React.createElement("div", { className: "nb-picker-overlay", onClick: onClose }, /* @__PURE__ */ React.createElement("div", { className: "nb-picker", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "nb-picker-header" }, /* @__PURE__ */ React.createElement("span", { className: "nb-picker-title" }, "Manage Notebooks"), /* @__PURE__ */ React.createElement("button", { className: "nb-picker-close", onClick: onClose, "aria-label": "Close" }, "\xD7")), /* @__PURE__ */ React.createElement("div", { className: "nb-picker-new" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "nb-picker-new-input",
        type: "text",
        placeholder: "New notebook name\u2026",
        value: newName,
        onChange: (e) => setNewName(e.target.value),
        onKeyDown: (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            createNotebook();
          }
        },
        maxLength: 60
      }
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "nb-picker-new-btn" + (newName.trim() ? "" : " disabled"),
        onClick: createNotebook,
        disabled: !newName.trim()
      },
      "Create"
    )), notebooks.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "nb-picker-empty" }, "No notebooks yet. Type a name above to create your first one.") : /* @__PURE__ */ React.createElement("div", { className: "nb-picker-list" }, notebooks.map((nb) => {
      if (confirmDeleteId === nb.id) {
        return /* @__PURE__ */ React.createElement("div", { key: nb.id, className: "ann-chip-confirm", style: { padding: "10px 12px" } }, /* @__PURE__ */ React.createElement("span", { className: "ann-chip-confirm-q" }, "Delete \u201C", nb.name, "\u201D? Notes will move to Uncategorized."), /* @__PURE__ */ React.createElement("button", { className: "ann-chip-confirm-btn ann-chip-confirm-cancel", onClick: () => setConfirmDeleteId(null) }, "Cancel"), /* @__PURE__ */ React.createElement("button", { className: "ann-chip-confirm-btn ann-chip-confirm-yes", onClick: () => deleteNb(nb.id) }, "Yes, delete"));
      }
      if (renameId === nb.id) {
        return /* @__PURE__ */ React.createElement("div", { key: nb.id, className: "nb-picker-row checked", style: { gap: "8px" } }, /* @__PURE__ */ React.createElement(
          "input",
          {
            className: "nb-picker-new-input",
            type: "text",
            autoFocus: true,
            value: renameValue,
            onChange: (e) => setRenameValue(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename();
              } else if (e.key === "Escape") cancelRename();
            },
            maxLength: 60,
            style: { flex: 1 }
          }
        ), /* @__PURE__ */ React.createElement("button", { className: "nb-picker-row-delete", onClick: cancelRename, title: "Cancel" }, "\u2715"), /* @__PURE__ */ React.createElement("button", { className: "nb-picker-new-btn", onClick: commitRename }, "Save"));
      }
      const count = counts[nb.id] || 0;
      return /* @__PURE__ */ React.createElement("div", { key: nb.id, className: "nb-picker-row", style: { cursor: "default" } }, /* @__PURE__ */ React.createElement("span", { className: "nb-picker-name" }, nb.name), /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'Cinzel',serif", fontSize: "0.52rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--cream-muted)", marginRight: "8px" } }, count, count === 1 ? " note" : " notes"), /* @__PURE__ */ React.createElement("button", { className: "nb-picker-row-delete", onClick: () => startRename(nb), title: "Rename", style: { color: "var(--cream-muted)", padding: "4px 8px" } }, "\u270E"), /* @__PURE__ */ React.createElement("button", { className: "nb-picker-row-delete", onClick: () => setConfirmDeleteId(nb.id), title: "Delete notebook", "aria-label": "Delete notebook" }, "\xD7"));
    }))));
  }

  // app/src/main/assets/src/app.jsx
  var { useState, useEffect, useCallback } = React;
  function App() {
    var sharedViewProps, _navToChapter, _idxNav;
    const saved = useSavedState();
    const tabState = useTabs({ saved });
    const { tabField, activeTab, tabs, activeTabIdx, updateActiveTab } = tabState;
    const [screen, setScreen] = tabField("screen");
    const [bookId, setBookId] = tabField("bookId");
    const [chapterNum, setChapterNum] = tabField("chapterNum");
    const [letterId, setLetterId] = tabField("letterId");
    const [studyId, setStudyId] = tabField("studyId");
    const [studyChapterId, setStudyChapterId] = tabField("studyChapterId");
    const [fromStudies, setFromStudies] = tabField("fromStudies");
    const [mode, setMode] = tabField("mode");
    const [showStudy, setShowStudy] = tabField("showStudy");
    const [genreId, setGenreId] = tabField("genreId");
    const [surpriseAnchor, setSurpriseAnchor] = tabField("surpriseAnchor");
    const [theme, setTheme] = useState(saved.theme || "dark");
    const [_translationTick, setTranslationTick] = useState(0);
    const [_studiesTick, setStudiesTick] = useState(0);
    const [studiesLoading, setStudiesLoading] = useState(false);
    const [hlTick, setHlTick] = useState(0);
    const {
      annChip,
      setAnnChip,
      linkSidebarKey,
      openLinkSidebar,
      closeLinkSidebar,
      linkPickerSource,
      openLinkPicker,
      closeLinkPicker,
      linkRefineRequest,
      setLinkRefineRequest,
      lastLinkCreated,
      setLastLinkCreated,
      linkPickerMode,
      linkPickerOnPickRef,
      noteSheetTarget,
      setNoteSheetTarget,
      openNoteSheet,
      closeNoteSheet,
      notebookPickerTarget,
      setNotebookPickerTarget,
      multiNotePayload,
      setMultiNotePayload,
      bookmarkPopoverPayload,
      setBookmarkPopoverPayload,
      bookmarkCreatePending,
      setBookmarkCreatePending,
      inboundJournalPayload,
      setInboundJournalPayload
    } = useSheetOrchestration({
      screen,
      letterId,
      bookId,
      chapterNum,
      studyId,
      studyChapterId,
      setHlTick
    });
    useEffect(() => {
      window.__bumpHlTick = () => setHlTick((t) => t + 1);
      return () => {
        delete window.__bumpHlTick;
      };
    }, []);
    useEffect(() => {
      if (!window.visualViewport) return;
      const vv = window.visualViewport;
      const root = document.documentElement;
      const update = () => {
        const diff = Math.max(0, window.innerHeight - vv.height);
        const kh = diff > 80 ? diff : 0;
        root.style.setProperty("--keyboard-height", kh + "px");
      };
      vv.addEventListener("resize", update);
      vv.addEventListener("scroll", update);
      update();
      return () => {
        vv.removeEventListener("resize", update);
        vv.removeEventListener("scroll", update);
        root.style.setProperty("--keyboard-height", "0px");
      };
    }, []);
    useEffect(() => {
      const t = setTimeout(() => {
        try {
          applyDOMHighlights();
        } catch (e) {
          console.error("applyDOMHighlights failed", e);
        }
        try {
          applyDOMLinks();
        } catch (e) {
          console.error("applyDOMLinks failed", e);
        }
        try {
          applyDOMBookmarks();
        } catch (e) {
          console.error("applyDOMBookmarks failed", e);
        }
        try {
          applyNoteIcons();
        } catch (e) {
          console.error("applyNoteIcons failed", e);
        }
        try {
          applyActiveNoteState();
        } catch (e) {
          console.error("applyActiveNoteState failed", e);
        }
        if (window.__pendingOpenNote) {
          const gid = window.__pendingOpenNote;
          window.__pendingOpenNote = null;
          setTimeout(() => {
            if (NoteStore.get(gid)) setNoteSheetTarget({ groupId: gid, startInEditMode: false });
          }, 60);
        }
        if (window.__pendingScrollHlKey) {
          const sk = window.__pendingScrollHlKey;
          window.__pendingScrollHlKey = null;
          setTimeout(() => {
            try {
              const el = document.querySelector('[data-hl-key="' + sk.replace(/"/g, '\\"') + '"]');
              if (el) el.scrollIntoView({ block: "center" });
            } catch (_e) {
            }
          }, 70);
        }
      }, 0);
      return () => clearTimeout(t);
    }, [hlTick, screen, letterId]);
    useEffect(() => {
      window.__activeNoteGroup = noteSheetTarget ? noteSheetTarget.groupId : null;
      applyActiveNoteState();
    }, [noteSheetTarget, hlTick]);
    const [tabsOverviewOpen, setTabsOverviewOpen] = useState(false);
    const [lastReadChapters, setLastReadChapters] = useState(saved.lastReadChapters || {});
    const [lastReadLetterMap, setLastReadLetterMap] = useState(() => {
      const map = { ...saved.lastReadLetterMap || {} };
      if (saved.lastReadLetter && !map.two) map.two = saved.lastReadLetter;
      if (saved.lastReadLetterV1 && !map.one) map.one = saved.lastReadLetterV1;
      return map;
    });
    const prophecyCardStatesRef = React.useRef(() => {
      try {
        return JSON.parse(localStorage.getItem("vot-prophecy-cards") || "{}");
      } catch (_e) {
        return {};
      }
    });
    if (typeof prophecyCardStatesRef.current === "function") prophecyCardStatesRef.current = prophecyCardStatesRef.current();
    const saveProphecyCardStates = useCallback(() => {
      try {
        localStorage.setItem("vot-prophecy-cards", JSON.stringify(prophecyCardStatesRef.current));
      } catch (_e) {
      }
    }, []);
    const setLastReadForVol = (volId, id) => {
      setLastReadLetterMap((prev) => ({ ...prev, [volId]: id }));
    };
    const goToLetterFromMatthew = (vol, letter2, excerpt) => {
      const dest = resolveVotLetter(vol, letter2);
      if (!dest) return;
      pushFromLetter({
        sourceScreen: "matthew-ch",
        sourceBookId: "matthew",
        sourceChapterNum: chapterNum,
        sourceLetterId: null,
        sourceStudyId: null,
        sourceStudyChapterId: null,
        sourceLetterTitle: `Matthew ${chapterNum}`,
        sourceVolumeLabel: null
      });
      if (excerpt) {
        window.__pendingHighlight = { excerpt, letterId: dest.id };
      } else {
        window.__pendingHighlight = null;
      }
      setFromMatthewCh({ chapterNum });
      if (dest.isStudy) {
        setStudyId(dest.studyId);
        setStudyChapterId(dest.studyChapterId);
        setActiveReadKey(dest.activeReadKey);
      } else {
        setLetterId(dest.id);
        setActiveReadKey("vol:" + dest.volKey, () => setLastReadForVol(dest.volKey, dest.id));
      }
      setScreen(dest.screen);
    };
    const {
      setFromLetterStack,
      pushFromLetter,
      tapThroughBack,
      fromLetterRef,
      backHint
    } = useFromLetterStack({
      tabField,
      screen,
      bookId,
      chapterNum,
      letterId,
      studyId,
      studyChapterId,
      setScreen,
      setBookId,
      setChapterNum,
      setLetterId,
      setStudyId,
      setStudyChapterId
    });
    const openInAppLetter = (target, meta) => {
      if (!target || !target.letterTitle) return;
      const dest = resolveVotLetter(target.collection, target.letterTitle);
      if (!dest) return;
      let destSnapshot = null;
      if (dest.isStudy) {
        destSnapshot = { screen: "bible-study-chapter", bookId: null, chapterNum: null, letterId: null, studyId: dest.studyId, studyChapterId: dest.studyChapterId };
      } else {
        destSnapshot = { screen: dest.screen, bookId: null, chapterNum: null, letterId: dest.id, studyId: null, studyChapterId: null };
      }
      pushFromLetter({
        sourceScreen: screen,
        sourceLetterId: letterId,
        sourceBookId: bookId,
        sourceChapterNum: chapterNum,
        sourceStudyId: studyId,
        sourceStudyChapterId: studyChapterId,
        sourceLetterTitle: meta && meta.sourceLetterTitle ? meta.sourceLetterTitle : null,
        sourceVolumeLabel: meta && meta.sourceVolumeLabel ? meta.sourceVolumeLabel : null,
        destSnapshot
      });
      if (target.excerpt) {
        window.__pendingHighlight = { excerpt: target.excerpt, letterId: dest.id };
      } else {
        window.__pendingHighlight = null;
      }
      if (dest.isStudy) {
        setStudyId(dest.studyId);
        setStudyChapterId(dest.studyChapterId);
        setActiveReadKey(dest.activeReadKey);
      } else {
        setLetterId(dest.id);
        setActiveReadKey("vol:" + dest.volKey, () => setLastReadForVol(dest.volKey, dest.id));
      }
      setScreen(dest.screen);
    };
    const [readItems, setReadItems] = useState(saved.readItems || {});
    const [gardenPage, setGardenPage] = tabField("gardenPage");
    const [gardenWarningOpen, setGardenWarningOpen] = useState(false);
    const { settings, setSettings, toggleSetting, updateSetting } = useSettings({
      savedSettings: saved.settings,
      theme
    });
    useEffect(() => {
      if (!settings.tabsEnabled && tabsOverviewOpen) setTabsOverviewOpen(false);
    }, [settings.tabsEnabled, tabsOverviewOpen]);
    useEffect(() => {
      const code = settings.translation;
      if (!code || code === "nkjv") return;
      loadTranslation(code).then(() => setTranslationTick((v) => v + 1));
    }, [settings.translation]);
    useEffect(() => {
      const needsStudies = screen === "studies-home" || screen === "bible-study-index" || screen === "bible-study-chapter";
      if (!needsStudies) return;
      if (typeof BIBLE_STUDIES !== "undefined") return;
      setStudiesLoading(true);
      loadBibleStudies().then(() => {
        setStudiesLoading(false);
        setStudiesTick((v) => v + 1);
      });
    }, [screen]);
    useEffect(() => {
      setClearAllStage(0);
    }, [tabsOverviewOpen]);
    const [titleFocusHidden, setTitleFocusHidden] = tabField("titleFocusHidden");
    const [headingsFocusHidden, setHeadingsFocusHidden] = tabField("headingsFocusHidden");
    const [showWelcome, setShowWelcome] = useState(() => {
      try {
        return !localStorage.getItem("vot-welcomed");
      } catch (_e) {
        return true;
      }
    });
    const [isOnline, setIsOnline] = useState(false);
    useEffect(() => {
      let cancelled = false;
      const check = () => {
        fetch("https://www.thevolumesoftruth.com/favicon.ico", { mode: "no-cors", cache: "no-store" }).then(() => {
          if (!cancelled) setIsOnline(true);
        }).catch(() => {
          if (!cancelled) setIsOnline(false);
        });
      };
      check();
      return () => {
        cancelled = true;
      };
    }, [showWelcome]);
    const dismissWelcome = () => {
      try {
        localStorage.setItem("vot-welcomed", "1");
      } catch (_e) {
      }
      setShowWelcome(false);
      try {
        if (!localStorage.getItem("vot-about-seen")) {
          setNavOrigin({ screen: "home", bookId: null, chapterNum: null, letterId: null, studyId: null, studyChapterId: null });
          setScreen("about");
        }
      } catch (_e) {
      }
    };
    const [searchQuery, setSearchQuery] = tabField("searchQuery");
    const [fromSearch, setFromSearch] = tabField("fromSearch");
    const [fromMatthewCh, setFromMatthewCh] = tabField("fromMatthewCh");
    const [fromWtlb, setFromWtlb] = tabField("fromWtlb");
    const [searchOrigin, setSearchOrigin] = tabField("searchOrigin");
    const [searchScope, setSearchScope] = tabField("searchScope");
    const [searchContext, setSearchContext] = tabField("searchContext");
    const [navOrigin, setNavOrigin] = tabField("navOrigin");
    const { readHistory, addToHistory, clearHistory, pruneHistoryDay } = useHistory(settings.historyEnabled);
    const { tabThumbnails, setTabThumbnails, captureActiveTabThumbnail } = useThumbnails({
      tabs,
      activeTabIdx,
      activeTab,
      tabsEnabled: settings.tabsEnabled,
      tabsOverviewOpen
    });
    const navOriginRef = useRefMirror(navOrigin);
    const { flushScrollToActiveTab } = useScrollMemory({
      screen,
      bookId,
      chapterNum,
      letterId,
      studyId,
      studyChapterId,
      activeTab,
      activeTabIdx,
      updateActiveTab,
      surpriseAnchor,
      tabsOverviewOpen
    });
    const { activeReadKey, setActiveReadKey, cancelDwell } = useReadingDwell({
      dwellMs: settings.dwellMs,
      initialActiveReadKey: saved.activeReadKey || null
    });
    const {
      openNewTab,
      switchToTab,
      closeTab,
      closeOtherTabs,
      closeTabsToTheRight,
      closeAllTabs,
      deduplicateTabs,
      tabActionIdx,
      setTabActionIdx,
      disableTabsPromptOpen,
      setDisableTabsPromptOpen,
      clearAllStage,
      setClearAllStage,
      lastTabCloseStrikes,
      MAX_TABS
    } = useTabActions({ tabState, cancelDwell, setTabThumbnails });
    usePersistedState({
      tabs,
      activeTabIdx,
      theme,
      lastReadChapters,
      lastReadLetterMap,
      activeReadKey,
      settings,
      readItems
    });
    const ALL_BOOKS = { matthew: MATTHEW, ...BOOKS };
    window.__ALL_BOOKS = ALL_BOOKS;
    const book = bookId ? ALL_BOOKS[bookId] : null;
    const chapter = book && chapterNum != null ? book.chapters.find((c) => c.num === chapterNum) : null;
    function _findLetter(volKey) {
      if (!letterId) return null;
      var col = COL_BY_KEY.get(volKey);
      var arr = colLetterArr(col), pref = colPreface(col);
      return arr.find(function(l) {
        return l.id === letterId;
      }) || (pref && pref.id === letterId ? pref : null);
    }
    const letter = _findLetter("two");
    const letterV1 = _findLetter("one");
    const letterV3 = _findLetter("three");
    const letterV4 = _findLetter("four");
    const letterV5 = _findLetter("five");
    const letterV6 = _findLetter("six");
    const letterV7 = _findLetter("seven");
    const letterTimothy = _findLetter("timothy");
    const letterFlock = _findLetter("flock");
    const letterRebuke = _findLetter("rebuke");
    const wtlb1Entry = _findLetter("wtlb1");
    const wtlb2Entry = _findLetter("wtlb2");
    const blessedEntry = _findLetter("blessed");
    const hdEntry = _findLetter("holydays");
    const hmEntry = _findLetter("hm");
    const goHome = () => {
      setFromSearch(false);
      setFromWtlb(null);
      setFromLetterStack([]);
      window.__pendingHighlight = null;
      window.__pendingScrollHlKey = null;
      setScreen("home");
      setBookId(null);
      setChapterNum(null);
    };
    const goScripturesHome = () => {
      setScreen("scriptures-home");
      setBookId(null);
      setChapterNum(null);
      setGenreId(null);
    };
    const goScriptureGenre = (gid) => {
      setGenreId(gid);
      setScreen("scripture-genre");
    };
    const goVolumesHome = () => {
      setScreen("volumes-home");
    };
    const goSettings = () => {
      setNavOrigin({ screen, bookId, chapterNum, letterId, studyId, studyChapterId });
      setScreen("settings");
    };
    const goHistory = () => {
      setNavOrigin({ screen, bookId, chapterNum, letterId, studyId, studyChapterId });
      setScreen("history");
    };
    const goAbout = () => {
      setNavOrigin({ screen, bookId, chapterNum, letterId, studyId, studyChapterId });
      setScreen("about");
    };
    const goLibrary = () => {
      setNavOrigin({ screen, bookId, chapterNum, letterId, studyId, studyChapterId });
      setScreen("library");
    };
    const [journalEntryId, setJournalEntryId] = useState(null);
    const { navigateToLink } = useNavigateToLink({
      closeLinkSidebar,
      pushFromLetter,
      screen,
      bookId,
      chapterNum,
      letterId,
      studyId,
      studyChapterId,
      setScreen,
      setBookId,
      setChapterNum,
      setLetterId,
      setStudyId,
      setStudyChapterId,
      setSurpriseAnchor,
      setJournalEntryId
    });
    const goJournalHub = () => {
      setNavOrigin({ screen, bookId, chapterNum, letterId, studyId, studyChapterId });
      setScreen("journal-home");
    };
    const goJournalViewer = (eid) => {
      if (eid) {
        setJournalEntryId(eid);
        setScreen("journal-viewer");
      }
    };
    const goJournalEditor = (eid) => {
      if (eid) {
        setJournalEntryId(eid);
        setScreen("journal-editor");
      }
    };
    const createAndEditJournal = () => {
      if (typeof JournalStore === "undefined") return;
      const e = JournalStore.add();
      if (typeof JournalStatsStore !== "undefined") {
        const newMilestones = JournalStatsStore.recordNewEntry(e.created);
        if (newMilestones && newMilestones.length) {
          newMilestones.forEach((m) => jrnShowMilestoneToast(m));
        }
      }
      setHlTick((t) => t + 1);
      setJournalEntryId(e.id);
      setScreen("journal-editor");
    };
    const goNotesIndex = () => {
      setNavOrigin({ screen, bookId, chapterNum, letterId, studyId, studyChapterId });
      setScreen("notes-index");
    };
    const goLinksIndex = () => {
      setNavOrigin({ screen, bookId, chapterNum, letterId, studyId, studyChapterId });
      setScreen("links-index");
    };
    const goBookmarksIndex = () => {
      setNavOrigin({ screen, bookId, chapterNum, letterId, studyId, studyChapterId });
      setScreen("bookmarks-index");
    };
    const goHighlightsIndex = () => {
      setNavOrigin({ screen, bookId, chapterNum, letterId, studyId, studyChapterId });
      setScreen("highlights-index");
    };
    const goTabs = () => {
      if (!settings.tabsEnabled) return;
      flushScrollToActiveTab();
      captureActiveTabThumbnail();
      setTabsOverviewOpen(true);
    };
    const goNavOrigin = () => {
      const o = navOriginRef.current;
      setNavOrigin(null);
      if (o) {
        setScreen(o.screen);
        if (o.bookId !== void 0) setBookId(o.bookId);
        if (o.chapterNum !== void 0) setChapterNum(o.chapterNum);
        if (o.letterId !== void 0) setLetterId(o.letterId);
        if (o.studyId !== void 0) setStudyId(o.studyId);
        if (o.studyChapterId !== void 0) setStudyChapterId(o.studyChapterId);
      } else
        goHome();
    };
    const goSearch = () => {
      setSearchOrigin({ screen, bookId, chapterNum, letterId });
      let ctx = null;
      if (screen === "matthew-ch") {
        ctx = { kind: "book", bookId: "matthew", label: "Matthew" };
      } else if (screen === "bible-ch" && bookId) {
        const bk = BOOKS[bookId];
        ctx = { kind: "book", bookId, label: bk ? bk.title : bookId };
      } else {
        const _scCol = COL_BY_LETTER_SC.get(screen);
        if (_scCol) ctx = { kind: "volume", volumeId: _scCol.searchVolId, label: _scCol.label };
      }
      setSearchContext(ctx);
      setSearchScope(null);
      if (window.__pendingSearchQuery) {
        setSearchQuery(window.__pendingSearchQuery);
        window.__pendingSearchQuery = null;
      }
      setScreen("search");
    };
    useEffect(() => {
      window.__goSearch = goSearch;
      return () => {
        window.__goSearch = null;
      };
    });
    const goSearchOrigin = () => {
      const o = searchOriginRef.current;
      if (o) {
        setSearchOrigin(null);
        setScreen(o.screen);
        if (o.bookId !== void 0) setBookId(o.bookId);
        if (o.chapterNum !== void 0) setChapterNum(o.chapterNum);
        if (o.letterId !== void 0) setLetterId(o.letterId);
      } else
        goHome();
    };
    const VERSION_ID = "v1";
    const getReadKey = (bid, cid) => `${VERSION_ID}:${bid}:${cid}`;
    const isRead = (bid, cid) => !!readItems[getReadKey(bid, cid)];
    const markRead = (bid, cid) => {
      if (!settings.markAsRead) return;
      const key = getReadKey(bid, cid);
      if (!readItems[key]) setReadItems((prev) => ({ ...prev, [key]: true }));
    };
    const unmarkRead = (bid, cid) => {
      const key = getReadKey(bid, cid);
      setReadItems((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    };
    const clearAllProgress = () => setReadItems({});
    const goToLastRead = () => {
      if (!activeReadKey) return;
      if (activeReadKey.startsWith("vol:")) {
        const volKey = activeReadKey.slice(4);
        const col = COL_BY_KEY.get(volKey);
        const lid = lastReadLetterMap[volKey] || null;
        if (lid && col) {
          setLetterId(lid);
          setScreen(col.letterScreen);
        }
      } else if (activeReadKey.startsWith("bible-study-")) {
        const slug = activeReadKey.slice("bible-study-".length);
        const chId = lastReadChapters[activeReadKey];
        const study = getStudyById(slug);
        if (study && chId) {
          selectStudyChapter(slug, chId);
        } else if (study) {
          selectStudy(slug);
        }
      } else {
        const ch = lastReadChapters[activeReadKey];
        if (ch) {
          setBookId(activeReadKey);
          setChapterNum(ch);
          setScreen(activeReadKey === "matthew" ? "matthew-ch" : "bible-ch");
        }
      }
    };
    const goColIdx = (volKey) => {
      const c = COL_BY_KEY.get(volKey);
      if (c && c.indexScreen) setScreen(c.indexScreen);
    };
    const handleScriptureSelect = (id, clearGenre) => {
      if (clearGenre) setGenreId(null);
      if (id === "matthew") {
        setBookId("matthew");
        setChapterNum(null);
        setScreen("matthew-idx");
      } else if (BOOKS[id]) {
        setBookId(id);
        if (BOOKS[id].chapters.length === 1) {
          setChapterNum(1);
          setScreen("bible-ch");
        } else {
          setChapterNum(null);
          setScreen("bible-idx");
        }
      }
    };
    const handleVolumeSelect = (id) => {
      const col = COL_BY_CARD.get(id);
      if (col && col.indexScreen) {
        setScreen(col.indexScreen);
        return;
      }
      if (id === "garden") {
        let acked = false;
        try {
          acked = !!localStorage.getItem("vot-garden-warning-acked");
        } catch (_e) {
        }
        if (acked) setScreen("garden-view");
        else
          setGardenWarningOpen(true);
      }
    };
    const srchVolLookup = (searchVolId) => {
      const col = COL_BY_SEARCH_ID.get(searchVolId);
      if (!col) return null;
      return { screen: col.letterScreen, lastReadFn: (id) => setLastReadForVol(col.volKey, id), activeKey: "vol:" + col.volKey };
    };
    const SRCH_VOL_MAP = new Proxy({}, { get: (_, key) => srchVolLookup(key) });
    const srchResolveLetterId = (volumeId, letterNum, letterId2) => {
      if (letterId2) return letterId2;
      if (letterNum == null) return null;
      const col = COL_BY_SEARCH_ID.get(volumeId);
      if (!col) return null;
      const arr = colLetterArr(col);
      for (let i = 0; i < arr.length; i++) if (arr[i] && arr[i].num === letterNum) return arr[i].id;
      const pref = colPreface(col);
      if (pref && (letterNum === 0 || arr.length === 0)) return pref.id;
      return null;
    };
    const handleSearchSelect = (entry) => {
      setFromSearch(true);
      if (entry && entry.__direct && entry.ref) {
        const r = entry.ref;
        const useStudyMatthew = entry.__corpus !== "scriptures";
        if (r.kind === "ref-bible" || r.kind === "named-passage") {
          const matthewHit = r.bookId === "matthew" || r.bookId === "matthew-plain";
          const effectiveBookId = matthewHit ? useStudyMatthew ? "matthew" : "matthew-plain" : r.bookId;
          setBookId(effectiveBookId);
          setChapterNum(r.chapter);
          if (r.verseStart) {
            const vs = [];
            const vEnd = r.verseEnd || r.verseStart;
            for (let v = r.verseStart; v <= vEnd; v++) vs.push(v);
            setSurpriseAnchor({ type: "verse", verses: vs });
          } else {
            setSurpriseAnchor(null);
          }
          setScreen(effectiveBookId === "matthew" ? "matthew-ch" : "bible-ch");
          return;
        }
        if (r.kind === "ref-letter") {
          const vm = SRCH_VOL_MAP[r.volumeId];
          if (!vm) return;
          const lid = srchResolveLetterId(r.volumeId, r.letterNum, r.letterId);
          if (!lid) return;
          setLetterId(lid);
          if (vm.activeKey) setActiveReadKey(vm.activeKey, () => vm.lastReadFn(lid));
          else vm.lastReadFn(lid);
          setScreen(vm.screen);
          return;
        }
        if (r.kind === "ref-book") {
          const matthewHit = r.bookId === "matthew" || r.bookId === "matthew-plain";
          const effectiveBookId = matthewHit ? useStudyMatthew ? "matthew" : "matthew-plain" : r.bookId;
          setBookId(effectiveBookId);
          setChapterNum(null);
          setScreen(effectiveBookId === "matthew" ? "matthew-idx" : "bible-idx");
          return;
        }
        return;
      }
      const doc = entry && entry.doc;
      if (!doc) return;
      const k = doc.kind;
      if (k === "verse" || k === "chapter-title" || k === "heading" || k === "study-note" || k === "cross-ref") {
        setBookId(doc.bookId);
        setChapterNum(doc.chapterNum);
        if (doc.verseNum) {
          setSurpriseAnchor({ type: "verse", verses: [doc.verseNum] });
        } else {
          setSurpriseAnchor(null);
        }
        setScreen(doc.bookId === "matthew" ? "matthew-ch" : "bible-ch");
        return;
      }
      if (k === "letter" || k === "letter-title" || k === "footnote" || k === "wtlb" || k === "wtlb-title" || k === "blessed" || k === "blessed-title" || k === "holy-day" || k === "holy-day-title") {
        const vm = SRCH_VOL_MAP[doc.volumeId];
        if (!vm || !doc.letterId) return;
        setLetterId(doc.letterId);
        if (vm.activeKey) setActiveReadKey(vm.activeKey, () => vm.lastReadFn(doc.letterId));
        else vm.lastReadFn(doc.letterId);
        setScreen(vm.screen);
        return;
      }
      if (k === "bible-study") {
        setStudyId(doc.letterId || null);
        setStudyChapterId(doc.chapterNum || null);
        setScreen("bible-study-chapter");
        return;
      }
    };
    const handleSearchCommand = (action) => {
      if (action === "home") {
        setScreen("home");
        return;
      }
      if (action === "settings") {
        goSettings && goSettings();
        return;
      }
      if (action === "scriptures") {
        setScreen("scriptures-home");
        return;
      }
      if (action === "volumes") {
        setScreen("volumes-home");
        return;
      }
      if (action === "clear-query") {
        setSearchQuery("");
        return;
      }
      if (action === "rebuild-index") {
        if (window.VotSearch) window.VotSearch.rebuild().catch(() => {
        });
        return;
      }
      if (action === "random") {
        handleSurprise();
        return;
      }
    };
    useEffect(() => {
      if (screen === "matthew-ch" && chapterNum) {
        const ch = MATTHEW.chapters.find((c) => c.num === chapterNum);
        addToHistory({ type: "chapter", bookId: "matthew", bookTitle: "Matthew", chapterNum, chapterTitle: ch?.title || null });
      } else if (screen === "bible-ch" && bookId && chapterNum) {
        const book2 = BOOKS[bookId];
        const ch = book2?.chapters.find((c) => c.num === chapterNum);
        addToHistory({ type: "chapter", bookId, bookTitle: book2?.title || bookId, chapterNum, chapterTitle: ch?.title || null });
      } else if (letterId) {
        var _hcol = COL_BY_LETTER_SC.get(screen);
        if (_hcol) {
          var _he = _findLetter(_hcol.volKey);
          if (_he) addToHistory({ type: "letter", letterId, letterTitle: _he.title, letterNum: _he.num || null, volumeScreen: _hcol.indexScreen });
        }
      } else if (screen === "bible-study-chapter" && studyId && studyChapterId) {
        const study = getStudyById(studyId);
        const ch = getStudyChapter(study, studyChapterId);
        if (study && ch) addToHistory({ type: "study-chapter", studyId, studyChapterId, studyTitle: study.title, studySlug: study.slug, chapterTitle: ch.title, chapterNum: ch.num });
      }
    }, [screen, bookId, chapterNum, letterId, studyId, studyChapterId]);
    const fromMatthewChRef = useRefMirror(fromMatthewCh);
    const searchOriginRef = useRefMirror(searchOrigin);
    useEffect(() => {
      const t = setTimeout(() => {
        try {
          if (typeof JournalStore === "undefined" || typeof JournalMediaStore === "undefined") return;
          const referenced = JournalStore.collectAllMediaIds();
          JournalMediaStore.pruneOrphans(referenced).then((n) => {
            if (n) console.info("Journal media orphan sweep removed", n, "blob(s)");
          }).catch((e) => console.warn("Journal media orphan sweep failed", e));
        } catch (e) {
          console.warn("Journal media orphan sweep threw", e);
        }
      }, 4e3);
      return () => clearTimeout(t);
    }, []);
    useEffect(() => {
      window.__goHome = () => {
        setFromSearch(false);
        setFromWtlb(null);
        setFromLetterStack([]);
        window.__pendingHighlight = null;
        setScreen("home");
        setBookId(null);
        setChapterNum(null);
      };
      return () => {
        if (window.__goHome) delete window.__goHome;
      };
    }, []);
    const handleSelect = (id) => {
      if (id === "scriptures") goScripturesHome();
      else if (id === "volumes") goVolumesHome();
      else if (id === "studies") {
        setFromStudies(false);
        setGenreId(null);
        goStudiesHome();
      } else if (id === "library") goLibrary();
    };
    const handleSurprise = () => {
      const pool = [
        ...MATTHEW.chapters.map((ch) => ({ _k: "matthew", num: ch.num })),
        ...BIBLE_BOOK_LIST.flatMap((b) => b.chapters.map((ch) => ({ _k: "bible", bookId: b.id, num: ch.num }))),
        ..._studies().filter((s) => !s.locked && s.chapters && s.chapters.length > 0).flatMap((s) => s.chapters.map((ch) => ({ _k: "study", studyId: s.id, chId: ch.id })))
      ];
      for (const col of COLLECTIONS) {
        if (!col.surpriseType) continue;
        for (const l of colLetterArr(col)) pool.push({ _k: "col", volKey: col.volKey, id: l.id });
      }
      const pick = pool[Math.floor(Math.random() * pool.length)];
      setSurpriseAnchor(null);
      if (pick._k === "matthew") {
        setBookId("matthew");
        setChapterNum(pick.num);
        setScreen("matthew-ch");
      } else if (pick._k === "bible") {
        setBookId(pick.bookId);
        setChapterNum(pick.num);
        setScreen("bible-ch");
      } else if (pick._k === "study") {
        selectStudyChapter(pick.studyId, pick.chId);
      } else {
        const col = COL_BY_KEY.get(pick.volKey);
        if (!col) return;
        setLetterId(pick.id);
        setActiveReadKey("vol:" + col.volKey, () => setLastReadForVol(col.volKey, pick.id));
        setScreen(col.letterScreen);
      }
    };
    const selectMatthewCh = (num) => {
      setChapterNum(num);
      setScreen("matthew-ch");
      setActiveReadKey("matthew", () => setLastReadChapters((prev) => ({ ...prev, matthew: num })));
    };
    const goMatthewIdx = () => {
      setChapterNum(null);
      setScreen("matthew-idx");
    };
    const STUDIES = _studies();
    const getStudyById = (id) => STUDIES.find((s) => s.id === id) || null;
    const getStudyChapter = (study, chId) => study && study.chapters ? study.chapters.find((c) => c.id === chId) : null;
    const studyReadKey = (slug) => `bible-study-${slug}`;
    const goStudiesHome = () => {
      setScreen("studies-home");
    };
    useAndroidBack({
      screen,
      bookId,
      genreId,
      fromSearch,
      fromStudies,
      fromMatthewCh,
      studyId,
      fromWtlb,
      tabsOverviewOpen,
      journalEntryId,
      fromLetterRef,
      setScreen,
      setBookId,
      setChapterNum,
      setLetterId,
      setStudyId,
      setStudyChapterId,
      setFromLetterStack,
      setFromSearch,
      setFromStudies,
      setFromWtlb,
      setFromMatthewCh,
      setTabsOverviewOpen,
      cancelDwell,
      goNavOrigin,
      goHome,
      goSearchOrigin,
      goScripturesHome,
      goStudiesHome,
      goVolumesHome,
      goJournalViewer,
      getStudyById
    });
    const selectStudy = (id) => {
      const study = getStudyById(id);
      if (!study || study.locked || !study.chapters?.length) return;
      setStudyId(id);
      if (study.chapters.length === 1 || study.singlePage) {
        const ch = study.chapters[0];
        setStudyChapterId(ch.id);
        setActiveReadKey(studyReadKey(study.slug), () => setLastReadChapters((prev) => ({ ...prev, [studyReadKey(study.slug)]: ch.id })));
        setScreen("bible-study-chapter");
      } else {
        setStudyChapterId(null);
        setActiveReadKey(studyReadKey(study.slug));
        setScreen("bible-study-index");
      }
    };
    const selectStudyChapter = (sid, chId) => {
      const study = getStudyById(sid);
      if (!study) return;
      setStudyId(sid);
      setStudyChapterId(chId);
      setActiveReadKey(studyReadKey(study.slug), () => setLastReadChapters((prev) => ({ ...prev, [studyReadKey(study.slug)]: chId })));
      setScreen("bible-study-chapter");
    };
    const MATTHEW_CHAIN_ENTRY = {
      id: "matthew-study",
      slug: "matthew-study",
      title: "The Volumes of Truth New Testament Study Bible - The Book of Matthew",
      isMatthewStudy: true,
      chapters: (_matthew() || {}).chapters || []
    };
    const CHAIN_ORDER = [
      "more-than-a-man",
      "matthew-study",
      "purity",
      "state-of-the-dead",
      "grace-and-the-law",
      "lamb-of-god",
      "trinity-exposed",
      "odds-chart"
    ];
    const UNIFIED_CHAIN = CHAIN_ORDER.map((slug) => slug === "matthew-study" ? MATTHEW_CHAIN_ENTRY : STUDIES.find((s) => s.id === slug)).filter((e) => e && (e.isMatthewStudy || !e.locked && e.chapters && e.chapters.length > 0));
    const chainIdx = (slug) => UNIFIED_CHAIN.findIndex((e) => e.slug === slug);
    const prevChainEntry = (slug) => {
      const i = chainIdx(slug);
      return i > 0 ? UNIFIED_CHAIN[i - 1] : null;
    };
    const nextChainEntry = (slug) => {
      const i = chainIdx(slug);
      return i >= 0 && i < UNIFIED_CHAIN.length - 1 ? UNIFIED_CHAIN[i + 1] : null;
    };
    const goToChainEntryFirst = (slug) => () => {
      if (slug === "matthew-study") {
        setFromStudies(true);
        setBookId("matthew");
        setChapterNum(1);
        setScreen("matthew-ch");
        setActiveReadKey("matthew", () => setLastReadChapters((prev) => ({ ...prev, matthew: 1 })));
        return;
      }
      const s = getStudyById(slug);
      if (!s || !s.chapters?.length) return;
      selectStudyChapter(slug, s.chapters[0].id);
    };
    const goToChainEntryLast = (slug) => () => {
      if (slug === "matthew-study") {
        setFromStudies(true);
        const lastNum = MATTHEW.chapters[MATTHEW.chapters.length - 1].num;
        setBookId("matthew");
        setChapterNum(lastNum);
        setScreen("matthew-ch");
        setActiveReadKey("matthew", () => setLastReadChapters((prev) => ({ ...prev, matthew: lastNum })));
        return;
      }
      const s = getStudyById(slug);
      if (!s || !s.chapters?.length) return;
      selectStudyChapter(slug, s.chapters[s.chapters.length - 1].id);
    };
    const selectBibleCh = (num) => {
      setChapterNum(num);
      setScreen("bible-ch");
      setActiveReadKey(bookId, () => setLastReadChapters((prev) => ({ ...prev, [bookId]: num })));
    };
    const goBibleIdx = () => {
      setChapterNum(null);
      setScreen("bible-idx");
    };
    const goToRevelationLast = () => {
      const rev = BOOKS.revelation;
      setBookId("revelation");
      setChapterNum(rev.chapters[rev.chapters.length - 1].num);
      setScreen("bible-ch");
    };
    const _first = (arr, volKey, scr) => () => {
      if (arr.length > 0) {
        const id = arr[0].id;
        setLetterId(id);
        setActiveReadKey("vol:" + volKey, () => setLastReadForVol(volKey, id));
        setScreen(scr);
      }
    };
    const _last = (arr, volKey, scr) => () => {
      if (arr.length > 0) {
        const id = arr[arr.length - 1].id;
        setLetterId(id);
        setActiveReadKey("vol:" + volKey, () => setLastReadForVol(volKey, id));
        setScreen(scr);
      }
    };
    const _firstPreface = (preface, arr, volKey, scr) => () => {
      const id = preface ? preface.id : arr.length > 0 ? arr[0].id : null;
      if (id) {
        setLetterId(id);
        setActiveReadKey("vol:" + volKey, () => setLastReadForVol(volKey, id));
        setScreen(scr);
      }
    };
    var _goFirst = {}, _goLast = {};
    COLLECTIONS.forEach(function(col) {
      if (!col.letterScreen) return;
      var arr = colLetterArr(col);
      var pref = colPreface(col);
      _goFirst[col.volKey] = pref ? _firstPreface(pref, arr, col.volKey, col.letterScreen) : _first(arr, col.volKey, col.letterScreen);
      _goLast[col.volKey] = _last(arr, col.volKey, col.letterScreen);
    });
    const goToGardenFirst = () => {
      setGardenPage(1);
      setScreen("garden-view");
    };
    const boundaryConfig = (volKey, entry) => {
      const sourceCol = COL_BY_KEY.get(volKey);
      if (!sourceCol) return { prevBoundary: null, onPrevBoundary: null, nextBoundary: null, onNextBoundary: null };
      const hasPrev = !!(entry && (entry.prevLetter || entry.prevEntry));
      const hasNext = !!(entry && (entry.nextLetter || entry.nextEntry));
      const idx = READING_CHAIN.indexOf(volKey);
      let prevBoundary = null, onPrevBoundary = null, nextBoundary = null, onNextBoundary = null;
      if (!hasPrev) {
        if (volKey === "one") {
          prevBoundary = { short: "Revelation", title: `Revelation \xB7 Chapter ${BOOKS.revelation.chapters[BOOKS.revelation.chapters.length - 1].num}` };
          onPrevBoundary = goToRevelationLast;
        } else if (idx > 0) {
          for (let i = idx - 1; i >= 0; i--) {
            const pCol = COL_BY_KEY.get(READING_CHAIN[i]);
            const pArr = colLetterArr(pCol);
            if (pArr.length === 0) continue;
            prevBoundary = { short: _boundaryShort(sourceCol, pCol), title: pArr[pArr.length - 1].title || pCol.short };
            onPrevBoundary = _goLast[pCol.volKey];
            break;
          }
        }
      }
      if (!hasNext) {
        if (volKey === "holydays") {
          nextBoundary = { short: "A Return to the Garden", title: "A Return to the Garden" };
          onNextBoundary = goToGardenFirst;
        } else if (idx >= 0 && idx < READING_CHAIN.length - 1) {
          for (let i = idx + 1; i < READING_CHAIN.length; i++) {
            const nCol = COL_BY_KEY.get(READING_CHAIN[i]);
            const nArr = colLetterArr(nCol);
            if (nArr.length === 0) continue;
            const pref = colPreface(nCol);
            nextBoundary = { short: _boundaryShort(sourceCol, nCol), title: (pref ? pref.title : nArr[0].title) || nCol.short };
            onNextBoundary = _goFirst[nCol.volKey];
            break;
          }
        }
      }
      return { prevBoundary, onPrevBoundary, nextBoundary, onNextBoundary };
    };
    const bookIdx = book ? BIBLE_BOOK_LIST.findIndex((b) => b.id === bookId) : -1;
    const prevBibleBook = bookIdx > 0 ? BIBLE_BOOK_LIST[bookIdx - 1] : null;
    const nextBibleBook = bookIdx >= 0 && bookIdx < BIBLE_BOOK_LIST.length - 1 ? BIBLE_BOOK_LIST[bookIdx + 1] : null;
    const goNextBibleBook = () => {
      if (!nextBibleBook) return;
      setBookId(nextBibleBook.id);
      setChapterNum(nextBibleBook.chapters[0].num);
      setScreen("bible-ch");
    };
    const goPrevBibleBook = () => {
      if (!prevBibleBook) return;
      setBookId(prevBibleBook.id);
      setChapterNum(prevBibleBook.chapters[prevBibleBook.chapters.length - 1].num);
      setScreen("bible-ch");
    };
    const chIsFirst = chapter && !book?.chapters.find((c) => c.num === chapter.num - 1);
    const chIsLast = chapter && !book?.chapters.find((c) => c.num === chapter.num + 1);
    const bcvPrevBook = chIsFirst ? prevBibleBook : null;
    const bcvOnPrevBook = goPrevBibleBook;
    const bcvPrevBoundaryTitle = null;
    const bcvNextBook = chIsLast ? bookId === "revelation" ? { title: "Volume One", chapters: [{ num: 1 }] } : nextBibleBook : null;
    const bcvOnNextBook = chIsLast && bookId === "revelation" ? _goFirst.one : goNextBibleBook;
    const bcvNextBoundaryTitle = chIsLast && bookId === "revelation" ? "Volume One \xB7 Letter 1" : null;
    const tabsCtxValue = React.useMemo(() => ({
      enabled: !!settings.tabsEnabled,
      count: tabs.length,
      activeIdx: activeTabIdx,
      onOpen: goTabs,
      isOnTabsScreen: tabsOverviewOpen
      // eslint-disable-next-line react-hooks/exhaustive-deps -- goTabs is an App()-local nav helper (line 554) whose body only calls state setters + reads stable values; adding it to deps would force this useMemo to rebuild on every parent render (since goTabs identity changes per render), defeating the memoization. The TabsContext consumers only need a fresh value when the LISTED deps change.
    }), [settings.tabsEnabled, tabs.length, activeTabIdx, tabsOverviewOpen]);
    function colReadNavProps(volKey, clearSurprise) {
      var rk = COL_BY_KEY.get(volKey).readKey;
      return {
        onMarkRead: () => markRead(rk, letterId),
        onUnmark: () => unmarkRead(rk, letterId),
        isRead: (id) => isRead(rk, id),
        onNavigate: (id) => {
          if (clearSurprise) setSurpriseAnchor(null);
          setLetterId(id);
          setActiveReadKey("vol:" + volKey, () => setLastReadForVol(volKey, id));
        },
        onHome: () => goColIdx(volKey)
      };
    }
    function colIdxProps(volKey) {
      var col = COL_BY_KEY.get(volKey);
      var nav = (id) => {
        setLetterId(id);
        setActiveReadKey("vol:" + volKey, () => setLastReadForVol(volKey, id));
        setScreen(col.letterScreen);
      };
      return {
        onSelect: nav,
        onSelectPreface: col.prefaceGlobal ? nav : void 0,
        currentLetter: settings.showReadingDot && activeReadKey === "vol:" + volKey ? lastReadLetterMap[volKey] || null : null,
        isRead: (id) => isRead(col.readKey, id),
        markAsReadEnabled: settings.markAsRead
      };
    }
    return /* @__PURE__ */ React.createElement(TabsContext.Provider, { value: tabsCtxValue }, null, settings.showReadingDot && activeReadKey && !LETTER_SCREEN_SET.has(screen) && !["matthew-ch", "bible-ch", "search", "garden-view", "settings", "history", "library", "notes-index", "links-index", "bookmarks-index", "highlights-index", "journal-home", "journal-viewer", "journal-editor", "about"].includes(screen) && /* @__PURE__ */ React.createElement("button", { className: "reading-dot-global", onClick: goToLastRead, title: "Resume reading" }, /* @__PURE__ */ React.createElement("span", { className: "rdg-inner" })), showWelcome && /* @__PURE__ */ React.createElement("div", { style: {
      position: "fixed",
      inset: 0,
      zIndex: 9999,
      backgroundImage: 'url("splash.jpg")',
      backgroundColor: "#0a0e1a",
      backgroundSize: "contain",
      backgroundPosition: "center center",
      backgroundRepeat: "no-repeat",
      display: "flex",
      flexDirection: "column"
    } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "flex-end" } }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: dismissWelcome,
        style: {
          margin: "calc(var(--inset-top, 0px) + 1rem) 1rem 0 0",
          background: "rgba(0,0,0,0.55)",
          border: "1.5px solid rgba(255,255,255,0.35)",
          borderRadius: "50%",
          width: "2.4rem",
          height: "2.4rem",
          color: "#fff",
          fontSize: "1.2rem",
          lineHeight: 1,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }
      },
      "\u2715"
    )), isOnline && /* @__PURE__ */ React.createElement(
      "a",
      {
        href: "https://www.thevolumesoftruth.com",
        target: "_blank",
        rel: "noopener noreferrer",
        style: {
          position: "absolute",
          left: "50%",
          top: "37%",
          transform: "translateX(-50%)",
          width: "60%",
          maxWidth: "400px",
          height: "8%",
          zIndex: 1,
          borderBottom: "1.5px solid #6cacf0"
        }
      }
    )), settings.tabsEnabled && tabsOverviewOpen && /* @__PURE__ */ React.createElement("div", { className: "tabs-overview-layer" }, /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "nav-home", onClick: () => setTabsOverviewOpen(false) }, "\u2190 Back"), /* @__PURE__ */ React.createElement(HomeBtn, null)) }, /* @__PURE__ */ React.createElement(
      TabsOverview,
      {
        tabs,
        activeTabIdx,
        onSelect: (i) => {
          lastTabCloseStrikes.current = 0;
          switchToTab(i);
          setTabsOverviewOpen(false);
        },
        onClose: (i) => closeTab(i),
        onNewTab: () => {
          lastTabCloseStrikes.current = 0;
          openNewTab();
          setTabsOverviewOpen(false);
        },
        onLongPress: (i) => setTabActionIdx(i),
        onClearAll: (signal) => {
          if (signal === -1) {
            setClearAllStage(0);
            return;
          }
          if (clearAllStage === 0) setClearAllStage(1);
          else if (clearAllStage === 1) setClearAllStage(2);
          else {
            closeAllTabs();
            setClearAllStage(0);
            lastTabCloseStrikes.current = 0;
          }
        },
        clearAllStage,
        onDedupe: () => deduplicateTabs(),
        MAX_TABS,
        thumbnails: tabThumbnails
      }
    ))), tabActionIdx != null && /* @__PURE__ */ React.createElement(
      TabActionSheet,
      {
        idx: tabActionIdx,
        total: tabs.length,
        onCloseOthers: () => {
          closeOtherTabs(tabActionIdx);
          lastTabCloseStrikes.current = 0;
        },
        onCloseToRight: () => {
          closeTabsToTheRight(tabActionIdx);
          lastTabCloseStrikes.current = 0;
        },
        onDismiss: () => setTabActionIdx(null)
      }
    ), disableTabsPromptOpen && /* @__PURE__ */ React.createElement("div", { className: "disable-tabs-overlay", onClick: () => setDisableTabsPromptOpen(false) }, /* @__PURE__ */ React.createElement("div", { className: "disable-tabs-dialog", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "disable-tabs-eyebrow" }, "You keep closing your last tab"), /* @__PURE__ */ React.createElement("h2", { className: "disable-tabs-title" }, "Disable tabs?"), /* @__PURE__ */ React.createElement("div", { className: "disable-tabs-body" }, "Tabs let you juggle multiple reading places \u2014 a chapter, a letter, a study in parallel. If you only read one at a time, disabling tabs hides the switcher and this close button. You can re-enable tabs anytime in Settings \u2014 your open tabs will be waiting."), /* @__PURE__ */ React.createElement("div", { className: "disable-tabs-actions" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "disable-tabs-btn secondary",
        onClick: () => setDisableTabsPromptOpen(false)
      },
      "Keep Tabs On"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "disable-tabs-btn primary",
        onClick: () => {
          updateSetting("tabsEnabled", false);
          setDisableTabsPromptOpen(false);
          setTabsOverviewOpen(false);
        }
      },
      "Disable Tabs"
    )))), screen === "settings" && /* @__PURE__ */ React.createElement(
      SettingsScreen,
      {
        settings,
        onToggle: toggleSetting,
        onSetting: updateSetting,
        onBack: goNavOrigin,
        onSearch: goSearch,
        onHistory: goHistory,
        readItems,
        onClearBook: (bid) => setReadItems((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((k) => {
            if (k.startsWith(`${VERSION_ID}:${bid}:`)) delete next[k];
          });
          return next;
        }),
        onClearAll: clearAllProgress,
        onClearHistory: clearHistory,
        historyCount: readHistory.length,
        theme,
        onThemeChange: setTheme
      }
    ), screen === "search" && /* @__PURE__ */ React.createElement(
      SearchScreen,
      {
        query: searchQuery,
        onQueryChange: setSearchQuery,
        settings,
        onSettingsChange: (key, val) => setSettings((prev) => ({ ...prev, [key]: val })),
        onSelect: handleSearchSelect,
        onCommand: handleSearchCommand,
        onBack: goSearchOrigin,
        searchScope,
        searchContext,
        onToggleScope: () => setSearchScope((prev) => prev ? null : searchContext)
      }
    ), screen === "home" && /* @__PURE__ */ React.createElement(
      HomeScreen,
      {
        onSelect: handleSelect,
        onSurprise: handleSurprise,
        showSurprise: settings.showSurpriseButton,
        onSettings: goSettings,
        onSearch: goSearch,
        onHistory: goHistory,
        historyEnabled: settings.historyEnabled !== false,
        onInfo: () => setShowWelcome(true),
        onAbout: goAbout,
        history: readHistory,
        theme,
        onThemeChange: setTheme
      }
    ), screen === "about" && /* @__PURE__ */ React.createElement(
      AboutScreen,
      {
        onContinue: () => {
          try {
            localStorage.setItem("vot-about-seen", "1");
          } catch (_e) {
          }
          goNavOrigin();
        },
        onBack: () => {
          try {
            localStorage.setItem("vot-about-seen", "1");
          } catch (_e) {
          }
          goNavOrigin();
        },
        onSearch: goSearch,
        onHistory: goHistory,
        theme,
        onThemeChange: setTheme
      }
    ), screen === "history" && /* @__PURE__ */ React.createElement(
      HistoryScreen,
      {
        history: readHistory,
        onBack: goNavOrigin,
        onSelect: (entry) => {
          if (entry.type === "study-chapter") {
            const study = getStudyById(entry.studyId);
            if (!study) return;
            setStudyId(entry.studyId);
            setStudyChapterId(entry.studyChapterId);
            setActiveReadKey(studyReadKey(study.slug), () => setLastReadChapters((prev) => ({ ...prev, [studyReadKey(study.slug)]: entry.studyChapterId })));
            setScreen("bible-study-chapter");
          } else if (entry.type === "letter") {
            setLetterId(entry.letterId);
            var _hc = entry.volumeScreen && COL_BY_INDEX_SC.get(entry.volumeScreen) || (entry.volume === 1 ? COL_BY_KEY.get("one") : COL_BY_KEY.get("two"));
            setActiveReadKey("vol:" + _hc.volKey, () => setLastReadForVol(_hc.volKey, entry.letterId));
            setScreen(_hc.letterScreen);
          } else {
            setBookId(entry.bookId);
            setChapterNum(entry.chapterNum);
            setActiveReadKey(entry.bookId, () => setLastReadChapters((prev) => ({ ...prev, [entry.bookId]: entry.chapterNum })));
            setScreen(entry.bookId === "matthew" ? "matthew-ch" : "bible-ch");
          }
        },
        onSearch: goSearch,
        onSettings: goSettings,
        onHistory: goHistory,
        onPruneDay: pruneHistoryDay,
        theme,
        onThemeChange: setTheme
      }
    ), screen === "library" && /* @__PURE__ */ React.createElement(
      LibraryScreen,
      {
        onBack: goHome,
        onOpenNotes: goNotesIndex,
        onOpenLinks: goLinksIndex,
        onOpenBookmarks: goBookmarksIndex,
        onOpenJournal: goJournalHub,
        onOpenHighlights: goHighlightsIndex,
        onSearch: goSearch,
        onHistory: goHistory,
        onSettings: goSettings,
        historyEnabled: settings.historyEnabled !== false,
        hlTick,
        theme,
        onThemeChange: setTheme
      }
    ), screen === "highlights-index" && typeof HighlightsScreen !== "undefined" && /* @__PURE__ */ React.createElement(
      HighlightsScreen,
      {
        onSettings: goSettings,
        onBack: () => setScreen("library"),
        onHome: goHome,
        onNavigateToSource: (endpoint, meta) => {
          if (endpoint) {
            setNavOrigin({ screen: "highlights-index" });
            navigateToLink(endpoint, meta || { sourceLetterTitle: "My Highlights" });
          }
        },
        onSearch: goSearch,
        onHistory: goHistory,
        historyEnabled: settings.historyEnabled !== false,
        hlTick,
        setHlTick,
        theme,
        onThemeChange: setTheme
      }
    ), screen === "journal-home" && typeof JournalHubScreen !== "undefined" && /* @__PURE__ */ React.createElement(
      JournalHubScreen,
      {
        onSettings: goSettings,
        onBack: () => setScreen("library"),
        onHome: goHome,
        onOpenEntry: (eid) => goJournalViewer(eid),
        onEditEntry: (eid) => goJournalEditor(eid),
        onCreateEntry: createAndEditJournal,
        onSearch: goSearch,
        onHistory: goHistory,
        historyEnabled: settings.historyEnabled !== false,
        hlTick,
        setHlTick,
        theme,
        onThemeChange: setTheme
      }
    ), screen === "journal-viewer" && typeof JournalViewerScreen !== "undefined" && /* @__PURE__ */ React.createElement(
      JournalViewerScreen,
      {
        onSettings: goSettings,
        entryId: journalEntryId,
        onBack: () => setScreen("journal-home"),
        onHome: goHome,
        onEdit: () => setScreen("journal-editor"),
        onNavigateToLink: (endpoint, meta) => {
          if (endpoint) {
            setNavOrigin({ screen: "journal-viewer" });
            navigateToLink(endpoint, meta || { sourceLetterTitle: "My Journal" });
          }
        },
        onOpenJournalEntry: (eid) => goJournalViewer(eid),
        onOpenNotebook: (nbId) => {
          window.__notesReturnCtx = { tab: "notebooks", drilledNbId: nbId };
          setNavOrigin({ screen: "journal-viewer" });
          setScreen("notes-index");
        },
        onSearch: goSearch,
        onHistory: goHistory,
        historyEnabled: settings.historyEnabled !== false,
        hlTick,
        setHlTick,
        theme,
        onThemeChange: setTheme
      }
    ), screen === "journal-editor" && typeof JournalEditorScreen !== "undefined" && /* @__PURE__ */ React.createElement(
      JournalEditorScreen,
      {
        onSettings: goSettings,
        entryId: journalEntryId,
        onBack: () => goJournalViewer(journalEntryId),
        onHome: goHome,
        onSearch: goSearch,
        onHistory: goHistory,
        historyEnabled: settings.historyEnabled !== false,
        hlTick,
        setHlTick,
        theme,
        onThemeChange: setTheme
      }
    ), screen === "notes-index" && /* @__PURE__ */ React.createElement(
      NotesIndexScreen,
      {
        onSettings: goSettings,
        onBack: () => setScreen("library"),
        onHome: goHome,
        onOpenNote: (gid) => setNoteSheetTarget({ groupId: gid, startInEditMode: false }),
        onNavigateToSource: (endpoint, meta) => {
          if (endpoint) {
            setNavOrigin({ screen: "notes-index" });
            navigateToLink(endpoint, meta || { sourceLetterTitle: "My Notes" });
          }
        },
        onSearch: goSearch,
        onHistory: goHistory,
        historyEnabled: settings.historyEnabled !== false,
        hlTick,
        setHlTick,
        theme,
        onThemeChange: setTheme
      }
    ), screen === "links-index" && /* @__PURE__ */ React.createElement(
      LinksScreen,
      {
        onSettings: goSettings,
        onBack: () => setScreen("library"),
        onHome: goHome,
        onNavigateToSource: (endpoint, meta) => {
          if (endpoint) {
            setNavOrigin({ screen: "links-index" });
            navigateToLink(endpoint, meta || { sourceLetterTitle: "My Links" });
          }
        },
        onNavigateToTarget: (endpoint, meta) => {
          if (endpoint) {
            setNavOrigin({ screen: "links-index" });
            navigateToLink(endpoint, meta || { sourceLetterTitle: "My Links" });
          }
        },
        onSearch: goSearch,
        onHistory: goHistory,
        historyEnabled: settings.historyEnabled !== false,
        hlTick,
        setHlTick,
        theme,
        onThemeChange: setTheme
      }
    ), screen === "bookmarks-index" && /* @__PURE__ */ React.createElement(
      BookmarksScreen,
      {
        onSettings: goSettings,
        onBack: () => setScreen("library"),
        onHome: goHome,
        onNavigateToSource: (endpoint, meta) => {
          if (endpoint) {
            setNavOrigin({ screen: "bookmarks-index" });
            navigateToLink(endpoint, meta || { sourceLetterTitle: "My Bookmarks" });
          }
        },
        onSearch: goSearch,
        onHistory: goHistory,
        historyEnabled: settings.historyEnabled !== false,
        hlTick,
        setHlTick,
        theme,
        onThemeChange: setTheme
      }
    ), screen === "scriptures-home" && /* @__PURE__ */ React.createElement(
      ScripturesHome,
      {
        onSelect: handleScriptureSelect,
        onGenre: goScriptureGenre,
        onBack: goHome,
        onSearch: goSearch,
        onHistory: goHistory,
        onSettings: goSettings,
        onMatthewStudy: () => {
          setBookId("matthew");
          setChapterNum(null);
          setScreen("matthew-idx");
        },
        theme,
        onThemeChange: setTheme,
        layout: settings.scriptureLayout
      }
    ), screen === "scripture-genre" && genreId && /* @__PURE__ */ React.createElement(
      ScriptureGenre,
      {
        genreId,
        onSelect: handleScriptureSelect,
        onBack: goScripturesHome,
        onSearch: goSearch,
        onHistory: goHistory,
        onSettings: goSettings,
        theme,
        onThemeChange: setTheme
      }
    ), screen === "volumes-home" && /* @__PURE__ */ React.createElement(
      VolumesHome,
      {
        onSelect: handleVolumeSelect,
        onBack: goHome,
        onSearch: goSearch,
        onHistory: goHistory,
        onSettings: goSettings,
        theme,
        onThemeChange: setTheme
      }
    ), screen === "matthew-idx" && /* @__PURE__ */ React.createElement(
      ChapterIndex,
      {
        book: MATTHEW,
        onSelect: selectMatthewCh,
        onBack: () => {
          if (fromStudies) {
            setFromStudies(false);
            goStudiesHome();
          } else {
            goHome();
          }
        },
        onSearch: goSearch,
        onHistory: goHistory,
        onSettings: goSettings,
        currentChapter: settings.showReadingDot && activeReadKey === "matthew" ? lastReadChapters["matthew"] || null : null,
        isRead: (num) => isRead("matthew", num),
        markAsReadEnabled: settings.markAsRead,
        theme,
        onThemeChange: setTheme
      }
    ), screen === "matthew-ch" && chapter && (() => {
      const mtLastNum = MATTHEW.chapters[MATTHEW.chapters.length - 1].num;
      const atFirstCh = chapter.num === 1;
      const atLastCh = chapter.num === mtLastNum;
      const chainPrev = fromStudies && atFirstCh ? prevChainEntry("matthew-study") : null;
      const chainNext = fromStudies && atLastCh ? nextChainEntry("matthew-study") : null;
      return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
        ChapterView,
        {
          book: MATTHEW,
          chapter,
          mode,
          showStudy,
          showEchoes: settings.showInlineEchoes !== false,
          showChapterTitle: settings.showChapterTitle !== false,
          titleFocusHidden,
          setTitleFocusHidden,
          onIndex: goMatthewIdx,
          onNavigate: (num) => {
            setSurpriseAnchor(null);
            selectMatthewCh(num);
          },
          onMarkRead: () => markRead("matthew", chapterNum),
          markAsReadEnabled: settings.markAsRead,
          showProgressBar: settings.showProgressBar,
          prevBoundary: chainPrev ? { short: studyShortTitle(chainPrev.title), title: studyShortTitle(chainPrev.title) } : null,
          onPrevBoundary: chainPrev ? () => {
            setFromStudies(true);
            goToChainEntryLast(chainPrev.slug)();
          } : null,
          nextBoundary: chainNext ? { short: studyShortTitle(chainNext.title), title: studyShortTitle(chainNext.title) } : null,
          onNextBoundary: chainNext ? () => {
            setFromStudies(true);
            goToChainEntryFirst(chainNext.slug)();
          } : null,
          onSearch: goSearch,
          onSettings: goSettings,
          onHistory: goHistory,
          theme,
          onThemeChange: setTheme,
          surpriseAnchor,
          onVotLetterClick: goToLetterFromMatthew,
          backHint,
          onTapThroughBack: tapThroughBack,
          hlTick,
          onLinkOpen: openLinkSidebar
        }
      ), /* @__PURE__ */ React.createElement(ModeToggle, { mode, onChange: setMode, showStudy, onShowStudyChange: setShowStudy }));
    })(), screen === "studies-home" && /* @__PURE__ */ React.createElement(
      StudiesHome,
      {
        studies: UNIFIED_CHAIN,
        studiesLoading,
        onSelectStudy: (slug) => {
          if (slug === "matthew-study") {
            setFromStudies(true);
            setBookId("matthew");
            setChapterNum(null);
            setScreen("matthew-idx");
          } else {
            selectStudy(slug);
          }
        },
        onBack: goHome,
        onSearch: goSearch,
        onHistory: goHistory,
        onSettings: goSettings,
        theme,
        onThemeChange: setTheme
      }
    ), screen === "bible-study-index" && studyId && (() => {
      const study = getStudyById(studyId);
      if (!study) return studiesLoading ? /* @__PURE__ */ React.createElement("div", { className: "sc-sheet-loading", style: { display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" } }, "Loading\u2026") : null;
      return /* @__PURE__ */ React.createElement(
        BibleStudyIndex,
        {
          study,
          onSelect: (chId) => selectStudyChapter(studyId, chId),
          onBack: goStudiesHome,
          onSearch: goSearch,
          onHistory: goHistory,
          onSettings: goSettings,
          currentChapter: settings.showReadingDot && activeReadKey === studyReadKey(study.slug) ? lastReadChapters[studyReadKey(study.slug)] || null : null,
          isRead: (chId) => isRead(studyReadKey(study.slug), chId),
          markAsReadEnabled: settings.markAsRead,
          theme,
          onThemeChange: setTheme
        }
      );
    })(), screen === "bible-idx" && book && /* @__PURE__ */ React.createElement(
      ChapterIndex,
      {
        book,
        onSelect: selectBibleCh,
        onBack: genreId ? () => setScreen("scripture-genre") : goScripturesHome,
        onSearch: goSearch,
        onHistory: goHistory,
        onSettings: goSettings,
        currentChapter: settings.showReadingDot && activeReadKey === bookId ? lastReadChapters[bookId] || null : null,
        isRead: (num) => isRead(bookId, num),
        markAsReadEnabled: settings.markAsRead,
        restoredNames: settings.restoredNames,
        showChapterTitle: settings.showChapterTitle !== false,
        theme,
        onThemeChange: setTheme
      }
    ), screen === "bible-ch" && book && chapter && /* @__PURE__ */ React.createElement(
      BibleChapterView,
      {
        book,
        chapter,
        onIndex: book?.chapters.length === 1 ? genreId ? () => setScreen("scripture-genre") : goScripturesHome : goBibleIdx,
        onNavigate: (num) => {
          setSurpriseAnchor(null);
          selectBibleCh(num);
        },
        onMarkRead: () => markRead(bookId, chapterNum),
        markAsReadEnabled: settings.markAsRead,
        showProgressBar: settings.showProgressBar,
        translation: settings.translation,
        restoredNames: settings.restoredNames,
        showChapterTitle: settings.showChapterTitle !== false,
        showSectionHeadings: settings.showSectionHeadings !== false,
        titleFocusHidden,
        setTitleFocusHidden,
        headingsFocusHidden,
        setHeadingsFocusHidden,
        prevBook: bcvPrevBook,
        nextBook: bcvNextBook,
        onPrevBook: bcvOnPrevBook,
        onNextBook: bcvOnNextBook,
        prevBoundaryTitle: bcvPrevBoundaryTitle,
        nextBoundaryTitle: bcvNextBoundaryTitle,
        onSearch: goSearch,
        onSettings: goSettings,
        onHistory: goHistory,
        theme,
        onThemeChange: setTheme,
        surpriseAnchor,
        backHint,
        onTapThroughBack: tapThroughBack,
        hlTick,
        onLinkOpen: openLinkSidebar
      }
    ), void (_idxNav = function() {
      return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "nav-home", onClick: goVolumesHome }, "\u2190 Volumes"), /* @__PURE__ */ React.createElement(HomeBtn, null), /* @__PURE__ */ React.createElement(NavButtons, { onSettings: goSettings, onHistory: goHistory, onSearch: goSearch, theme, onThemeChange: setTheme }));
    }), screen === "vot-index" && /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren: _idxNav() }, /* @__PURE__ */ React.createElement(VolumeLetterIndex, { volumeTitle: "Volume Two", letters: LETTERS, ...colIdxProps("two") })), screen === "vot-one-index" && /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren: _idxNav() }, /* @__PURE__ */ React.createElement(VolumeLetterIndex, { volumeTitle: "Volume One", letters: LETTERS_V1, preface: LETTERS_V1_PREFACE, ...colIdxProps("one") })), void (sharedViewProps = {
      onSearch: goSearch,
      onSettings: goSettings,
      onHistory: goHistory,
      theme,
      onThemeChange: setTheme,
      surpriseAnchor,
      onInAppLink: openInAppLetter,
      backHint,
      hlTick,
      onLinkOpen: openLinkSidebar,
      onBack: () => window.handleAndroidBack && window.handleAndroidBack(),
      markAsReadEnabled: settings.markAsRead,
      showProgressBar: settings.showProgressBar
    }), void (_navToChapter = (bid, ch) => {
      setFromWtlb(screen);
      setBookId(bid);
      setChapterNum(ch);
      setScreen("bible-ch");
    }), screen === "bible-study-chapter" && studyId && studyChapterId && (() => {
      const study = getStudyById(studyId);
      const ch = getStudyChapter(study, studyChapterId);
      if (!study || !ch) return studiesLoading ? /* @__PURE__ */ React.createElement("div", { className: "sc-sheet-loading", style: { display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" } }, "Loading\u2026") : null;
      const idx = study.chapters.findIndex((c) => c.id === studyChapterId);
      const prevCh = idx > 0 ? study.chapters[idx - 1] : null;
      const nextCh = idx < study.chapters.length - 1 ? study.chapters[idx + 1] : null;
      const prevEntry = !prevCh ? prevChainEntry(studyId) : null;
      const nextEntry = !nextCh ? nextChainEntry(studyId) : null;
      const pick = (chVal, studyVal, empty) => {
        if (chVal === void 0 || chVal === null) return studyVal != null ? studyVal : empty;
        if (Array.isArray(chVal)) return chVal.length ? chVal : studyVal || empty;
        return chVal;
      };
      const letterShim = {
        id: ch.id,
        title: ch.title,
        subtitle: ch.subtitle || null,
        num: ch.num,
        date: null,
        from: null,
        spoken: null,
        forLine: null,
        preamble: ch.part ? `Part ${ch.part}` : null,
        blocks: ch.blocks || [],
        sectionIntro: ch.sectionIntro || null,
        footnotes: ch.footnotes || {},
        nkjv: ch.nkjv || {},
        prevLetter: prevCh ? { id: prevCh.id, title: prevCh.title } : null,
        nextLetter: nextCh ? { id: nextCh.id, title: nextCh.title } : null,
        relatedTopics: pick(ch.relatedTopics, study.relatedTopics, []),
        bibleStudies: pick(ch.bibleStudies, study.bibleStudies, []),
        videos: pick(ch.videos, study.videos, []),
        audioUrl: pick(ch.audioUrl, study.audioUrl, null),
        soundcloudUrl: pick(ch.soundcloudUrl, study.soundcloudUrl, null),
        videoVoiceUrl: pick(ch.videoVoiceUrl, study.videoVoiceUrl, null),
        videoVoiceLabel: pick(ch.videoVoiceLabel, study.videoVoiceLabel, null),
        videoMusicUrl: pick(ch.videoMusicUrl, study.videoMusicUrl, null),
        addendum: pick(ch.addendum, study.addendum, null)
      };
      const jumpToStudy = (targetSlug) => {
        if (targetSlug === "matthew-study") {
          setFromStudies(true);
          setBookId("matthew");
          setChapterNum(null);
          setScreen("matthew-idx");
          return;
        }
        const target = getStudyById(targetSlug);
        if (!target || target.locked) return;
        selectStudy(targetSlug);
      };
      const handleLetterClick = (lid, sc) => {
        setFromStudies(true);
        setLetterId(lid);
        const _col = COL_BY_LETTER_SC.get(sc);
        if (_col) setActiveReadKey(_col.readKey);
        setScreen(sc);
      };
      return /* @__PURE__ */ React.createElement(
        LetterView,
        {
          ...sharedViewProps,
          letter: letterShim,
          studyMode: true,
          volumeLabel: study.title,
          onHome: () => {
            if (study.chapters.length > 1) {
              setStudyChapterId(null);
              setScreen("bible-study-index");
            } else {
              goStudiesHome();
            }
          },
          onNavigate: (chId) => {
            setSurpriseAnchor(null);
            selectStudyChapter(studyId, chId);
          },
          onStudyNavigate: jumpToStudy,
          onLetterClick: handleLetterClick,
          onMarkRead: () => markRead(studyReadKey(study.slug), studyChapterId),
          onUnmark: () => unmarkRead(studyReadKey(study.slug), studyChapterId),
          isRead: (id) => isRead(studyReadKey(study.slug), id),
          prevBoundary: prevEntry ? { short: studyShortTitle(prevEntry.title), title: studyShortTitle(prevEntry.title) } : null,
          onPrevBoundary: prevEntry ? goToChainEntryLast(prevEntry.slug) : null,
          nextBoundary: nextEntry ? { short: studyShortTitle(nextEntry.title), title: studyShortTitle(nextEntry.title) } : null,
          onNextBoundary: nextEntry ? goToChainEntryFirst(nextEntry.slug) : null,
          prophecyCardStatesRef,
          saveProphecyCardStates
        }
      );
    })(), screen === "vot-one-letter" && letterV1 && /* @__PURE__ */ React.createElement(LetterView, { ...sharedViewProps, ...colReadNavProps("one", true), ...boundaryConfig("one", letterV1), letter: letterV1, volumeLabel: "Volume One" }), screen === "vot-letter" && letter && /* @__PURE__ */ React.createElement(LetterView, { ...sharedViewProps, ...colReadNavProps("two", true), ...boundaryConfig("two", letter), letter }), screen === "vot-three-index" && /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren: _idxNav() }, /* @__PURE__ */ React.createElement(VolumeLetterIndex, { volumeTitle: "Volume Three", letters: LETTERS_V3, preface: LETTERS_V3_PREFACE, ...colIdxProps("three") })), screen === "vot-three-letter" && letterV3 && /* @__PURE__ */ React.createElement(LetterView, { ...sharedViewProps, ...colReadNavProps("three", true), ...boundaryConfig("three", letterV3), letter: letterV3, volumeLabel: "Volume Three" }), screen === "vot-four-index" && /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren: _idxNav() }, /* @__PURE__ */ React.createElement(VolumeLetterIndex, { volumeTitle: "Volume Four", letters: LETTERS_V4, preface: LETTERS_V4_PREFACE, ...colIdxProps("four") })), screen === "vot-four-letter" && letterV4 && /* @__PURE__ */ React.createElement(LetterView, { ...sharedViewProps, ...colReadNavProps("four", true), ...boundaryConfig("four", letterV4), letter: letterV4, volumeLabel: "Volume Four" }), screen === "vot-five-index" && /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren: _idxNav() }, /* @__PURE__ */ React.createElement(VolumeLetterIndex, { volumeTitle: "Volume Five", letters: LETTERS_V5, preface: LETTERS_V5_PREFACE, ...colIdxProps("five") })), screen === "vot-five-letter" && letterV5 && /* @__PURE__ */ React.createElement(LetterView, { ...sharedViewProps, ...colReadNavProps("five", true), ...boundaryConfig("five", letterV5), letter: letterV5, volumeLabel: "Volume Five" }), screen === "vot-six-index" && /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren: _idxNav() }, /* @__PURE__ */ React.createElement(VolumeLetterIndex, { volumeTitle: "Volume Six", letters: LETTERS_V6, preface: LETTERS_V6_PREFACE, ...colIdxProps("six") })), screen === "vot-six-letter" && letterV6 && /* @__PURE__ */ React.createElement(LetterView, { ...sharedViewProps, ...colReadNavProps("six", true), ...boundaryConfig("six", letterV6), letter: letterV6, volumeLabel: "Volume Six" }), screen === "vot-seven-index" && /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren: _idxNav() }, /* @__PURE__ */ React.createElement(VolumeLetterIndex, { volumeTitle: "Volume Seven", letters: LETTERS_V7, preface: LETTERS_V7_PREFACE, ...colIdxProps("seven") })), screen === "vot-seven-letter" && letterV7 && /* @__PURE__ */ React.createElement(LetterView, { ...sharedViewProps, ...colReadNavProps("seven", true), ...boundaryConfig("seven", letterV7), letter: letterV7, volumeLabel: "Volume Seven" }), screen === "vot-timothy-index" && /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren: _idxNav() }, /* @__PURE__ */ React.createElement(VolumeLetterIndex, { volumeTitle: "Letters from Timothy", eyebrow: "The Volumes of Truth", letters: LETTERS_TIMOTHY, preface: LETTERS_TIMOTHY_PREFACE, ...colIdxProps("timothy") })), screen === "vot-timothy-letter" && letterTimothy && /* @__PURE__ */ React.createElement(LetterView, { ...sharedViewProps, ...colReadNavProps("timothy", true), ...boundaryConfig("timothy", letterTimothy), letter: letterTimothy, volumeLabel: "Letters from Timothy" }), screen === "vot-flock-index" && /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren: _idxNav() }, /* @__PURE__ */ React.createElement(VolumeLetterIndex, { volumeTitle: "Letters to The Lord's Little Flock", eyebrow: "The Volumes of Truth", letters: LETTERS_FLOCK, preface: LETTERS_FLOCK_PREFACE, ...colIdxProps("flock") })), screen === "vot-flock-letter" && letterFlock && /* @__PURE__ */ React.createElement(LetterView, { ...sharedViewProps, ...colReadNavProps("flock", true), ...boundaryConfig("flock", letterFlock), letter: letterFlock, volumeLabel: "Letters to The Lord's Little Flock" }), screen === "vot-rebuke-index" && /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren: _idxNav() }, /* @__PURE__ */ React.createElement(VolumeLetterIndex, { volumeTitle: "The Lord's Rebuke", eyebrow: "A Testament Against The World", letters: LETTERS_REBUKE, preface: LETTERS_REBUKE_PREFACE, ...colIdxProps("rebuke") })), screen === "vot-rebuke-letter" && letterRebuke && /* @__PURE__ */ React.createElement(LetterView, { ...sharedViewProps, ...colReadNavProps("rebuke", true), ...boundaryConfig("rebuke", letterRebuke), letter: letterRebuke, volumeLabel: "The Lord's Rebuke" }), screen === "wtlb-one-index" && /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren: _idxNav() }, /* @__PURE__ */ React.createElement(VolumeLetterIndex, { volumeTitle: "Words To Live By", eyebrow: "Part One \xB7 Words of Wisdom", letters: WTLB_ONE, columns: 2, ...colIdxProps("wtlb1") })), screen === "wtlb-one-entry" && wtlb1Entry && /* @__PURE__ */ React.createElement(WtlbEntryView, { ...sharedViewProps, ...colReadNavProps("wtlb1"), ...boundaryConfig("wtlb1", wtlb1Entry), entry: wtlb1Entry, partLabel: "Part One", onNavToChapter: _navToChapter }), screen === "wtlb-two-index" && /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren: _idxNav() }, /* @__PURE__ */ React.createElement(VolumeLetterIndex, { volumeTitle: "Words To Live By", eyebrow: "Part Two \xB7 More Words of Wisdom", letters: WTLB_TWO, columns: 2, ...colIdxProps("wtlb2") })), screen === "wtlb-two-entry" && wtlb2Entry && /* @__PURE__ */ React.createElement(WtlbEntryView, { ...sharedViewProps, ...colReadNavProps("wtlb2"), ...boundaryConfig("wtlb2", wtlb2Entry), entry: wtlb2Entry, partLabel: "Part Two", onNavToChapter: _navToChapter }), screen === "blessed-index" && /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren: _idxNav() }, /* @__PURE__ */ React.createElement(VolumeLetterIndex, { volumeTitle: "The Blessed", eyebrow: "Blessings & Promises", letters: colLetterArr(COL_BY_KEY.get("blessed")).map((e) => ({ ...e, date: e.sourceLabel || "" })), ...colIdxProps("blessed") })), screen === "blessed-entry" && blessedEntry && /* @__PURE__ */ React.createElement(WtlbEntryView, { ...sharedViewProps, ...colReadNavProps("blessed"), ...boundaryConfig("blessed", blessedEntry), entry: blessedEntry, partLabel: "The Blessed", onNavToChapter: _navToChapter }), screen === "holy-days-index" && /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "nav-home", onClick: goVolumesHome }, "\u2190 Volumes"), /* @__PURE__ */ React.createElement(HomeBtn, null), /* @__PURE__ */ React.createElement(NavButtons, { onSettings: goSettings, onHistory: goHistory, onSearch: goSearch, theme, onThemeChange: setTheme })) }, typeof HOLY_DAYS_META !== "undefined" && (HOLY_DAYS_META.audioPlaylist || HOLY_DAYS_META.videoPlaylist) && /* @__PURE__ */ React.createElement("div", { className: "hd-playlists" }, HOLY_DAYS_META.audioPlaylist && /* @__PURE__ */ React.createElement("a", { className: "hd-playlist-btn", href: HOLY_DAYS_META.audioPlaylist, target: "_blank", rel: "noopener noreferrer" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6" }, /* @__PURE__ */ React.createElement("path", { d: "M9 18V5l12-2v13" }), /* @__PURE__ */ React.createElement("circle", { cx: "6", cy: "18", r: "3" }), /* @__PURE__ */ React.createElement("circle", { cx: "18", cy: "16", r: "3" })), /* @__PURE__ */ React.createElement("span", { className: "hd-playlist-label" }, "Audio Playlist"), /* @__PURE__ */ React.createElement("span", { className: "hd-playlist-sub" }, "Listen on Bandcamp")), HOLY_DAYS_META.videoPlaylist && /* @__PURE__ */ React.createElement("a", { className: "hd-playlist-btn", href: HOLY_DAYS_META.videoPlaylist, target: "_blank", rel: "noopener noreferrer" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6" }, /* @__PURE__ */ React.createElement("polygon", { points: "23 7 16 12 23 17 23 7" }), /* @__PURE__ */ React.createElement("rect", { x: "1", y: "5", width: "15", height: "14", rx: "2", ry: "2" })), /* @__PURE__ */ React.createElement("span", { className: "hd-playlist-label" }, "Video Playlist"), /* @__PURE__ */ React.createElement("span", { className: "hd-playlist-sub" }, "Watch on YouTube"))), /* @__PURE__ */ React.createElement(VolumeLetterIndex, { volumeTitle: "Regarding The Holy Days", eyebrow: "The Appointed Times", letters: colLetterArr(COL_BY_KEY.get("holydays")).map((e) => ({ ...e, date: e.date || e.sourceLabel || "" })), ...colIdxProps("holydays") })), screen === "holy-days-entry" && hdEntry && (() => {
      const bc = boundaryConfig("holydays", hdEntry);
      if (hdEntry.type === "wtlb") {
        return /* @__PURE__ */ React.createElement(WtlbEntryView, { ...sharedViewProps, ...colReadNavProps("holydays"), ...bc, entry: hdEntry, partLabel: "Regarding The Holy Days", onNavToChapter: _navToChapter, footnotesMode: true });
      }
      const letterShim = { ...hdEntry, prevLetter: hdEntry.prevEntry || null, nextLetter: hdEntry.nextEntry || null };
      return /* @__PURE__ */ React.createElement(LetterView, { ...sharedViewProps, ...colReadNavProps("holydays"), ...bc, letter: letterShim, volumeLabel: "Regarding The Holy Days" });
    })(), screen === "hm-letter" && hmEntry && (() => {
      const letterShim = { ...hmEntry, prevLetter: null, nextLetter: null };
      const goHomeFromHM = () => {
        if (fromMatthewChRef.current) {
          setFromMatthewCh(null);
          setScreen("matthew-ch");
        } else {
          goHome();
        }
      };
      return /* @__PURE__ */ React.createElement(LetterView, { ...sharedViewProps, ...colReadNavProps("hm"), letter: letterShim, volumeLabel: "Hidden Manna", onHome: goHomeFromHM, onNavigate: (id) => {
        setLetterId(id);
      } });
    })(), screen === "garden-view" && /* @__PURE__ */ React.createElement(
      GardenView,
      {
        page: gardenPage,
        onPageChange: (p) => setGardenPage(p),
        onBack: goVolumesHome,
        theme,
        onThemeChange: setTheme,
        tier: settings.gardenTier || GARDEN_DEFAULT_TIER
      }
    ), gardenWarningOpen && (() => {
      const selectedTier = getGardenTier(settings.gardenTier);
      return /* @__PURE__ */ React.createElement("div", { className: "garden-warning-overlay", onClick: () => setGardenWarningOpen(false) }, /* @__PURE__ */ React.createElement("div", { className: "garden-warning-modal", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "garden-warning-title" }, "Before You Begin"), /* @__PURE__ */ React.createElement("div", { className: "garden-warning-body" }, /* @__PURE__ */ React.createElement("em", null, "A Return to The Garden"), " contains ", /* @__PURE__ */ React.createElement("strong", null, "209 high-resolution photographs"), " totaling approximately ", /* @__PURE__ */ React.createElement("strong", null, selectedTier.size), " at the selected quality. Pages stream from the internet as you read and are cached on your device.", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("br", null), "For the best experience, connect to ", /* @__PURE__ */ React.createElement("strong", null, "Wi-Fi"), " before proceeding. Mobile data charges may apply otherwise.", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("br", null), "Please also ensure your device has sufficient ", /* @__PURE__ */ React.createElement("strong", null, "free storage"), " available to cache the full collection."), /* @__PURE__ */ React.createElement("div", { className: "garden-tier-selector" }, /* @__PURE__ */ React.createElement("div", { className: "garden-tier-label" }, "Image Quality"), /* @__PURE__ */ React.createElement("div", { className: "garden-tier-hint" }, "You can change this anytime from the Settings menu."), GARDEN_TIERS.map((t) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: t.id,
          className: `garden-tier-option${settings.gardenTier === t.id ? " selected" : ""}`,
          onClick: () => setSettings((s) => ({ ...s, gardenTier: t.id }))
        },
        /* @__PURE__ */ React.createElement("div", { className: "garden-tier-option-main" }, /* @__PURE__ */ React.createElement("span", { className: "garden-tier-option-name" }, t.label), /* @__PURE__ */ React.createElement("span", { className: "garden-tier-option-size" }, t.size)),
        /* @__PURE__ */ React.createElement("div", { className: "garden-tier-option-desc" }, t.res, " \xB7 ", t.desc)
      ))), /* @__PURE__ */ React.createElement("div", { className: "garden-warning-actions" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "garden-warning-btn garden-warning-btn-cancel",
          onClick: () => setGardenWarningOpen(false)
        },
        "Go Back"
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "garden-warning-btn garden-warning-btn-proceed",
          onClick: () => {
            try {
              localStorage.setItem("vot-garden-warning-acked", "1");
            } catch (_e) {
            }
            setGardenWarningOpen(false);
            setScreen("garden-view");
          }
        },
        "Proceed"
      ))));
    })(), /* @__PURE__ */ React.createElement(
      SelectionToolbar,
      {
        hlTick,
        setHlTick,
        onLinkRequest: openLinkPicker,
        onNoteRequest: openNoteSheet,
        onBookmarkRequest: function(_bkm) {
        }
      }
    ), annChip && /* @__PURE__ */ React.createElement(
      AnnotationActionChip,
      {
        chip: annChip,
        setHlTick,
        onClose: () => setAnnChip(null),
        onNoteRequest: openNoteSheet
      }
    ), linkSidebarKey && /* @__PURE__ */ React.createElement(
      LinkSidebar,
      {
        hlKey: linkSidebarKey,
        hlTick,
        setHlTick,
        onClose: closeLinkSidebar,
        onNavigate: navigateToLink
      }
    ), linkPickerSource && !linkRefineRequest && /* @__PURE__ */ React.createElement(
      LinkPicker,
      {
        sourceKey: linkPickerSource.key,
        sourceLabel: linkPickerSource.label,
        sourceStart: linkPickerSource.start,
        sourceEnd: linkPickerSource.end,
        sourceText: linkPickerSource.text,
        hlTick,
        setHlTick,
        onClose: closeLinkPicker,
        onRequestRefine: setLinkRefineRequest,
        lastCreatedLink: lastLinkCreated,
        onLinkCreated: setLastLinkCreated,
        mode: linkPickerMode,
        onPickTarget: linkPickerMode ? (target, item) => {
          if (linkPickerOnPickRef.current) linkPickerOnPickRef.current(target, item);
          closeLinkPicker();
        } : null
      }
    ), linkRefineRequest && linkRefineRequest.kind === "verse" && linkPickerSource && /* @__PURE__ */ React.createElement(
      VersePickerScreen,
      {
        refineRequest: linkRefineRequest,
        sourceKey: linkPickerSource.key,
        sourceLabel: linkPickerSource.label,
        sourceStart: linkPickerSource.start,
        sourceEnd: linkPickerSource.end,
        sourceText: linkPickerSource.text,
        setHlTick,
        returnTargetInsteadOfLink: !!linkPickerMode,
        onClose: (result) => {
          if (linkPickerMode) {
            if (result && linkPickerOnPickRef.current) linkPickerOnPickRef.current(result);
            if (result) {
              closeLinkPicker();
            } else {
              setLinkRefineRequest(null);
            }
            return;
          }
          setLinkRefineRequest(null);
          if (result) setLastLinkCreated(result);
        }
      }
    ), linkRefineRequest && linkRefineRequest.kind === "excerpt" && linkPickerSource && /* @__PURE__ */ React.createElement(
      LetterExcerptPickerScreen,
      {
        refineRequest: linkRefineRequest,
        sourceKey: linkPickerSource.key,
        sourceLabel: linkPickerSource.label,
        sourceStart: linkPickerSource.start,
        sourceEnd: linkPickerSource.end,
        sourceText: linkPickerSource.text,
        setHlTick,
        returnTargetInsteadOfLink: !!linkPickerMode,
        onClose: (result) => {
          if (linkPickerMode) {
            if (result && linkPickerOnPickRef.current) linkPickerOnPickRef.current(result);
            if (result) {
              closeLinkPicker();
            } else {
              setLinkRefineRequest(null);
            }
            return;
          }
          setLinkRefineRequest(null);
          if (result) setLastLinkCreated(result);
        }
      }
    ), noteSheetTarget && /* @__PURE__ */ React.createElement(
      NoteSheet,
      {
        key: noteSheetTarget.groupId + ":" + (noteSheetTarget.startInEditMode ? "edit" : "read"),
        groupId: noteSheetTarget.groupId,
        startInEditMode: noteSheetTarget.startInEditMode,
        hlTick,
        setHlTick,
        onClose: closeNoteSheet,
        onOpenNotebookPicker: (gid) => setNotebookPickerTarget(gid)
      }
    ), notebookPickerTarget && /* @__PURE__ */ React.createElement(
      NotebookPickerSheet,
      {
        groupId: notebookPickerTarget,
        hlTick,
        setHlTick,
        onClose: () => setNotebookPickerTarget(null)
      }
    ), multiNotePayload && /* @__PURE__ */ React.createElement(
      MultiNotePopover,
      {
        payload: multiNotePayload,
        onClose: () => setMultiNotePayload(null),
        onPick: (gid) => {
          setMultiNotePayload(null);
          setNoteSheetTarget({ groupId: gid, startInEditMode: false });
        }
      }
    ), bookmarkPopoverPayload && /* @__PURE__ */ React.createElement(
      BookmarkPopover,
      {
        bkmIds: bookmarkPopoverPayload.bkmIds,
        x: bookmarkPopoverPayload.x,
        y: bookmarkPopoverPayload.y,
        onNavigate: (bkm) => {
          const endpoint = typeof _bookmarkSourceEndpoint === "function" ? _bookmarkSourceEndpoint(bkm.hlKey) : null;
          setBookmarkPopoverPayload(null);
          if (endpoint) navigateToLink(endpoint, { sourceLetterTitle: "Bookmark" });
        },
        onDeleteDone: () => setHlTick((t) => t + 1),
        onClose: () => setBookmarkPopoverPayload(null)
      }
    ), inboundJournalPayload && typeof JournalInboundSheet !== "undefined" && /* @__PURE__ */ React.createElement(
      JournalInboundSheet,
      {
        refKey: inboundJournalPayload.refKey,
        resourceLabel: inboundJournalPayload.label,
        onClose: () => setInboundJournalPayload(null),
        onOpenEntry: (entry) => {
          setInboundJournalPayload(null);
          if (entry && entry.id) goJournalViewer(entry.id);
        }
      }
    ), bookmarkCreatePending && /* @__PURE__ */ React.createElement(
      BookmarkCreateSheet,
      {
        pending: bookmarkCreatePending,
        onCancel: () => setBookmarkCreatePending(null),
        onConfirm: (bkm) => {
          if (!bkm || !bkm.hlKey) {
            setBookmarkCreatePending(null);
            return;
          }
          if (bkm.editId) {
            BookmarkStore.update(bkm.editId, { label: bkm.label, thought: bkm.thought || "" });
          } else {
            BookmarkStore.add({
              id: typeof bkmId === "function" ? bkmId() : "bkm_" + Date.now(),
              hlKey: bkm.hlKey,
              label: bkm.label,
              thought: bkm.thought || "",
              created: Date.now(),
              updated: Date.now()
            });
          }
          setBookmarkCreatePending(null);
          setHlTick((t) => t + 1);
        },
        onDelete: (editId) => {
          if (editId && typeof BookmarkStore !== "undefined") BookmarkStore.remove(editId);
          setBookmarkCreatePending(null);
          setHlTick((t) => t + 1);
        },
        onOpen: (editId) => {
          if (!editId) return;
          const bkm = BookmarkStore.get(editId);
          if (!bkm) {
            setBookmarkCreatePending(null);
            return;
          }
          const endpoint = typeof _bookmarkSourceEndpoint === "function" ? _bookmarkSourceEndpoint(bkm.hlKey) : null;
          setBookmarkCreatePending(null);
          if (endpoint) navigateToLink(endpoint, { sourceLetterTitle: "Bookmark" });
        }
      }
    ));
  }

  // app/src/main/assets/src/ui/_entry-d.js
  Object.assign(window, {
    // Utilities
    bibleHlKey: bibleHlKey2,
    letterHlKey: letterHlKey2,
    wtlbHlKey: wtlbHlKey2,
    studyHlKey: studyHlKey2,
    relativeDate: relativeDate2,
    timeAgo: timeAgo2,
    GARDEN_TOTAL: GARDEN_TOTAL2,
    GARDEN_TIERS: GARDEN_TIERS2,
    GARDEN_DEFAULT_TIER: GARDEN_DEFAULT_TIER2,
    gardenImageCache: gardenImageCache2,
    getGardenTier: getGardenTier2,
    gardenUrl: gardenUrl2,
    gardenCacheKey: gardenCacheKey2,
    gardenPreload: gardenPreload2,
    gardenIsCached: gardenIsCached2,
    describeTab: describeTab2,
    tabContentKey: tabContentKey2,
    tabHasProgressBar: tabHasProgressBar2,
    scrollKeyForTab: scrollKeyForTab2,
    buildNavIndex,
    searchNavIndex: searchNavIndex2,
    navItemPreview,
    navItemToEndpoint: navItemToEndpoint2,
    buildSourceEndpoint: buildSourceEndpoint2,
    _bookTitle: _bookTitle2,
    _verseRangeLabel,
    noteSourceLabel: noteSourceLabel2,
    noteSourceNav: noteSourceNav2,
    bookCategory: bookCategory2,
    firstVerseOfRef,
    parseRefRanges: parseRefRanges2,
    lastVerseOfFirstRange,
    echoVersesForRef,
    getNotesForVerse: getNotesForVerse2,
    getEchoesForVerse: getEchoesForVerse2,
    parseRefRange,
    splitIntoVerses: splitIntoVerses2,
    normalizeForHighlight,
    splitWithHighlight: splitWithHighlight2,
    highlightExcerptInDom: highlightExcerptInDom2,
    renderTextWithScripRefs: renderTextWithScripRefs2,
    srchGroupKey: srchGroupKey2,
    // Late stores + data
    THUMB_DB,
    THUMB_STORE,
    _thumbDbPromise,
    openThumbDB,
    idbPut,
    idbDelete,
    idbReadAll,
    _translationPromises,
    _translationLoaded,
    _bibleStudiesPromise,
    loadTranslation: loadTranslation2,
    loadBibleStudies: loadBibleStudies2,
    translateVerse: translateVerse2,
    // Components
    Segments: Segments2,
    ProphecyCard: ProphecyCard2,
    ProphecyGroup: ProphecyGroup2,
    VerseWithNumbers: VerseWithNumbers2,
    _fnTextRedundantWithLink: _fnTextRedundantWithLink2,
    InAppLinkButton: InAppLinkButton2,
    FootnoteSheet: FootnoteSheet2,
    ScriptureVerseText: ScriptureVerseText2,
    ScriptureSheet: ScriptureSheet2,
    EXPAND_THRESHOLD,
    MIN_HIDDEN_WORDS,
    ExpandableVerse: ExpandableVerse2,
    ThemeBtn: ThemeBtn2,
    ScreenLayout: ScreenLayout2,
    ModeToggle: ModeToggle2,
    renderCommentaryCite: renderCommentaryCite2,
    InlineNotes: InlineNotes2,
    InlineEcho: InlineEcho2,
    StudyPanels: StudyPanels2,
    ChapterBookmarkBtn: ChapterBookmarkBtn2,
    NavButtons: NavButtons2,
    ProphecyExpandToggle: ProphecyExpandToggle2,
    HomeBtn: HomeBtn2,
    TabsNavBtn: TabsNavBtn2,
    LibraryNav: LibraryNav2,
    FootnoteListSection: FootnoteListSection2,
    StickyChapterNav: StickyChapterNav2,
    ClearProgressRow: ClearProgressRow2,
    SrchCard: SrchCard2,
    SrchSnippet: SrchSnippet2,
    SrchGroup: SrchGroup2,
    SettingsRow: SettingsRow2,
    SelectField: SelectField2,
    VolumeLetterIndex: VolumeLetterIndex2,
    HistoryEntryCard: HistoryEntryCard2,
    NoteRow: NoteRow2,
    LinkCard: LinkCard2,
    LinkIcon: LinkIcon2,
    BookmarkIcon: BookmarkIcon2,
    // Screens
    LetterView: LetterView2,
    WtlbEntryView: WtlbEntryView2,
    BibleChapterView: BibleChapterView2,
    ChapterView: ChapterView2,
    LibraryScreen: LibraryScreen2,
    NotesIndexScreen: NotesIndexScreen2,
    VolumesHome: VolumesHome2,
    StudiesHome: StudiesHome2,
    HistoryScreen: HistoryScreen2,
    AboutScreen: AboutScreen2,
    SettingsScreen: SettingsScreen2,
    HomeScreen: HomeScreen2,
    SearchScreen: SearchScreen2,
    BibleStudyIndex: BibleStudyIndex2,
    ChapterIndex: ChapterIndex2,
    GARDEN_PRELOAD_AHEAD,
    GARDEN_CRAWL_DELAY,
    GardenView: GardenView2,
    ScriptureGenre: ScriptureGenre2,
    ScripturesHome: ScripturesHome2,
    _linkEndpointCategory,
    _endpointResolves,
    _epSearchText,
    LinkRow,
    LinkRowActionSheet,
    LinksScreen: LinksScreen2,
    _bookmarkSourceLabel: _bookmarkSourceLabel2,
    _bookmarkSourceEndpoint: _bookmarkSourceEndpoint2,
    BookmarkRow,
    BookmarkRowActionSheet,
    BookmarkPopover: BookmarkPopover2,
    BookmarksScreen: BookmarksScreen2,
    _HL_COLOR_ORDER,
    _HL_COLOR_HEX,
    _hlColorHex,
    _hlColorIndex,
    _collectMarks,
    HighlightRow,
    HighlightsScreen: HighlightsScreen2,
    // Sheets
    TabsOverview: TabsOverview2,
    TabActionSheet: TabActionSheet2,
    MultiNotePopover: MultiNotePopover2,
    NotebookPickerSheet: NotebookPickerSheet2,
    NoteSheet: NoteSheet2,
    LetterExcerptPickerScreen: LetterExcerptPickerScreen2,
    VersePickerScreen: VersePickerScreen2,
    LinkPicker: LinkPicker2,
    LinkSidebar: LinkSidebar2,
    SelectionToolbar: SelectionToolbar2,
    AnnotationActionChip: AnnotationActionChip2,
    BookmarkCreateSheet: BookmarkCreateSheet2,
    NotebookManagerSheet,
    // App (composition root)
    App
  });
})();
