/* ═══════════════════════════════════════════════════════════════════════
   SettingsScreen — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

function SettingsScreen({ settings, onToggle, onSetting, onBack, onSearch, onHistory, theme, onThemeChange, readItems, onClearBook, onClearAll, onClearHistory, historyCount }) {
  // Three-stage clear flow: { key, stage } — stage 0 is implicit (null = nothing pending).
  // Tapping anywhere else on the settings screen resets clearPending.
  const [clearPending, setClearPending] = React.useState(null);
  const [openSections, setOpenSections] = React.useState(new Set());
  // Type-to-confirm gate for the single most destructive action (wipes ALL
  // personal data, irreversible). Stronger than the 3-tap pattern used for
  // lesser clears — the user must type DELETE before it will run.
  const [wipeConfirm, setWipeConfirm] = React.useState(false);
  const [wipeText, setWipeText] = React.useState('');
  const wipeOk = wipeText.trim().toUpperCase() === 'DELETE';
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
    id: "volumes", label: "The Volumes of Truth",
    genres: [
    { label: "The Seven Volumes", books: [
      { id: "volume-one", label: "Volume One", total: LETTERS_V1.length },
      { id: "volume-two", label: "Volume Two", total: LETTERS.length },
      ...(LETTERS_V3.length > 0 ? [{ id: "volume-three", label: "Volume Three", total: LETTERS_V3.length }] : []),
      ...(LETTERS_V4.length > 0 ? [{ id: "volume-four", label: "Volume Four", total: LETTERS_V4.length }] : []),
      ...(LETTERS_V5.length > 0 ? [{ id: "volume-five", label: "Volume Five", total: LETTERS_V5.length }] : []),
      ...(LETTERS_V6.length > 0 ? [{ id: "volume-six", label: "Volume Six", total: LETTERS_V6.length }] : []),
      ...(LETTERS_V7.length > 0 ? [{ id: "volume-seven", label: "Volume Seven", total: LETTERS_V7.length }] : [])]
    },
    { label: "Books & Collections", books: [
      ...(LETTERS_TIMOTHY.length > 0 ? [{ id: "letters-timothy", label: "Letters from Timothy", total: LETTERS_TIMOTHY.length }] : []),
      ...(LETTERS_FLOCK.length > 0 ? [{ id: "little-flock", label: "Letters to The Little Flock", total: LETTERS_FLOCK.length + (LETTERS_FLOCK_PREFACE ? 1 : 0) }] : []),
      ...(LETTERS_REBUKE.length > 0 ? [{ id: "lords-rebuke", label: "The Lord's Rebuke", total: LETTERS_REBUKE.length + (LETTERS_REBUKE_PREFACE ? 1 : 0) }] : []),
      ...(colLetterArr(COL_BY_KEY.get('wtlb1')).length > 0 ? [{ id: "wtlb-one", label: "Words To Live By: Part One", total: colLetterArr(COL_BY_KEY.get('wtlb1')).length }] : []),
      ...(colLetterArr(COL_BY_KEY.get('wtlb2')).length > 0 ? [{ id: "wtlb-two", label: "Words To Live By: Part Two", total: colLetterArr(COL_BY_KEY.get('wtlb2')).length }] : []),
      ...(colLetterArr(COL_BY_KEY.get('blessed')).length > 0 ? [{ id: "the-blessed", label: "The Blessed", total: colLetterArr(COL_BY_KEY.get('blessed')).length }] : []),
      ...(colLetterArr(COL_BY_KEY.get('holydays')).length > 0 ? [{ id: "holy-days", label: "Regarding The Holy Days", total: colLetterArr(COL_BY_KEY.get('holydays')).length }] : [])]
    }]

  },
  {
    id: "nt", label: "New Testament",
    genres: [
    { label: "Gospels", books: [
      { id: "matthew-plain", label: "Matthew", total: BOOKS["matthew-plain"].chapters.length },
      { id: "mark", label: "Mark", total: BOOKS.mark.chapters.length },
      { id: "luke", label: "Luke", total: BOOKS.luke.chapters.length },
      { id: "john", label: "John", total: BOOKS.john.chapters.length }]
    },
    { label: "Acts", books: [
      { id: "acts", label: "Acts", total: BOOKS.acts.chapters.length }]
    },
    { label: "Paul's Epistles", books: [
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
      { id: "hebrews", label: "Hebrews", total: BOOKS.hebrews.chapters.length }]
    },
    { label: "General Epistles", books: [
      { id: "james", label: "James", total: BOOKS.james.chapters.length },
      { id: "1peter", label: "1 Peter", total: BOOKS["1peter"].chapters.length },
      { id: "2peter", label: "2 Peter", total: BOOKS["2peter"].chapters.length },
      { id: "1john", label: "1 John", total: BOOKS["1john"].chapters.length },
      { id: "2john", label: "2 John", total: BOOKS["2john"].chapters.length },
      { id: "3john", label: "3 John", total: BOOKS["3john"].chapters.length },
      { id: "jude", label: "Jude", total: BOOKS.jude.chapters.length }]
    },
    { label: "Revelation", books: [
      { id: "revelation", label: "Revelation", total: BOOKS.revelation.chapters.length }]
    }]

  },
  {
    id: "ot", label: "Old Testament",
    genres: [
    { label: "The Law", books: [
      { id: "genesis", label: "Genesis", total: BOOKS.genesis.chapters.length },
      { id: "exodus", label: "Exodus", total: BOOKS.exodus.chapters.length },
      { id: "leviticus", label: "Leviticus", total: BOOKS.leviticus.chapters.length },
      { id: "numbers", label: "Numbers", total: BOOKS.numbers.chapters.length },
      { id: "deuteronomy", label: "Deuteronomy", total: BOOKS.deuteronomy.chapters.length }]
    },
    { label: "History", books: [
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
      { id: "esther", label: "Esther", total: BOOKS.esther.chapters.length }]
    },
    { label: "Poetry & Wisdom", books: [
      { id: "job", label: "Job", total: BOOKS.job.chapters.length },
      { id: "psalms", label: "Psalms", total: BOOKS.psalms.chapters.length },
      { id: "proverbs", label: "Proverbs", total: BOOKS.proverbs.chapters.length },
      { id: "ecclesiastes", label: "Ecclesiastes", total: BOOKS.ecclesiastes.chapters.length },
      { id: "songofsolomon", label: "Song of Solomon", total: BOOKS.songofsolomon.chapters.length }]
    },
    { label: "Major Prophets", books: [
      { id: "isaiah", label: "Isaiah", total: BOOKS.isaiah.chapters.length },
      { id: "jeremiah", label: "Jeremiah", total: BOOKS.jeremiah.chapters.length },
      { id: "lamentations", label: "Lamentations", total: BOOKS.lamentations.chapters.length },
      { id: "ezekiel", label: "Ezekiel", total: BOOKS.ezekiel.chapters.length },
      { id: "daniel", label: "Daniel", total: BOOKS.daniel.chapters.length }]
    },
    { label: "Minor Prophets", books: [
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
      { id: "malachi", label: "Malachi", total: BOOKS.malachi.chapters.length }]
    }]

  },
  {
    id: "studies", label: "Studies",
    genres: [
    { label: "VOT Study Bible", books: [
      { id: "matthew", label: "Matthew Study Bible", total: (_matthew()?.chapters?.length || 0) }]
    },
    ...(_studies().filter((s) => !s.locked && s.chapters && s.chapters.length > 0).length > 0 ? [{
      label: "Bible Letter Studies",
      books: _studies().filter((s) => !s.locked && s.chapters && s.chapters.length > 0).map((s) => ({
        id: `bible-study-${s.slug}`,
        label: s.title,
        total: s.chapters.length
      }))
    }] : [])]

  }];


  const countFor = (bid) =>
  Object.keys(readItems).filter((k) => k.startsWith(`${VERSION_ID}:${bid}:`)).length;
  const allBooks = PROGRESS_GROUPS.flatMap((g) => g.genres.flatMap((gr) => gr.books));
  const totalRead = Object.keys(readItems).length;
  const totalItems = allBooks.reduce((s, b) => s + b.total, 0);
  const sectionBooks = (grp) => grp.genres.flatMap((gr) => gr.books);
  const sectionRead = (grp) => sectionBooks(grp).reduce((s, b) => s + countFor(b.id), 0);
  const sectionTotal = (grp) => sectionBooks(grp).reduce((s, b) => s + b.total, 0);
  const toggleSection = (id) => setOpenSections((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);else next.add(id);
    return next;
  });

  // ===== Personal-data export / import / clear =====
  const _collectVotKeys = () => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf('vot-') === 0) keys.push(k);
    }
    return keys;
  };
  const exportPersonalData = () => {
    try {
      const data = {};
      _collectVotKeys().forEach((k) => { data[k] = localStorage.getItem(k); });
      const payload = {
        app: 'VOTReader',
        exportVersion: 1,
        exportDate: new Date().toISOString(),
        data: data
      };
      const json = JSON.stringify(payload, null, 2);
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `votreader-backup-${stamp}.json`;
      // On Android WebView, blob: URL downloads don't work — use the
      // AndroidBridge to write directly to the Downloads folder.
      if (window.AndroidBridge && typeof window.AndroidBridge.saveToDownloads === 'function') {
        const result = window.AndroidBridge.saveToDownloads(filename, json);
        if (result === 'ok') {
          alert('Backup saved to your Downloads folder.');
        } else {
          console.warn('saveToDownloads error:', result);
          alert('Export failed. Please try again.');
        }
        return;
      }
      // Browser / PC fallback: Blob URL download.
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { try { URL.revokeObjectURL(url); a.remove(); } catch (e) {} }, 0);
    } catch (e) {
      console.warn('export failed', e);
      alert('Export failed. See console for details.');
    }
  };
  const importPersonalData = () => {
    // Shared logic: parse and apply a VOTReader JSON backup string.
    const _doImport = (jsonText) => {
      try {
        const parsed = JSON.parse(jsonText);
        if (!parsed || parsed.app !== 'VOTReader' || !parsed.data || typeof parsed.data !== 'object') {
          alert('This file does not look like a VOTReader backup.');
          return;
        }
        const dateLabel = parsed.exportDate ? new Date(parsed.exportDate).toLocaleString() : 'unknown date';
        const proceed = window.confirm(
          'Importing the backup from ' + dateLabel + ' will REPLACE all your current notes, highlights, notebooks, journal entries, bookmarks, links, reading progress, history, tabs, and settings on this device. This cannot be undone.\n\nContinue?'
        );
        if (!proceed) return;
        _collectVotKeys().forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
        Object.keys(parsed.data).forEach((k) => {
          if (k.indexOf('vot-') === 0 && typeof parsed.data[k] === 'string') {
            try { localStorage.setItem(k, parsed.data[k]); } catch (e) {
              console.warn('import: localStorage write failed for', k, e);
            }
          }
        });
        alert('Import complete. The app will now reload.');
        window.location.reload();
      } catch (err) {
        console.warn('import failed', err);
        alert('Import failed: ' + (err && err.message ? err.message : 'invalid file'));
      }
    };
    // On Android WebView, the native file picker is invoked via AndroidBridge.
    // Kotlin reads the file, base64-encodes it, and calls window.__onImportFile.
    if (window.AndroidBridge && typeof window.AndroidBridge.openFilePicker === 'function') {
      window.__onImportFile = (b64OrNull) => {
        window.__onImportFile = null;
        if (!b64OrNull) return; // user cancelled or read error
        try { _doImport(atob(b64OrNull)); } catch (e) { alert('Import failed: could not decode file.'); }
      };
      window.AndroidBridge.openFilePicker();
      return;
    }
    // Browser / PC fallback: <input type="file">.
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (re) => { _doImport(re.target.result); };
      reader.readAsText(file);
    };
    input.click();
  };
  const clearAllPersonalData = () => {
    try {
      _collectVotKeys().forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
      try { indexedDB.deleteDatabase('vot-thumbs'); } catch (e) {}
      try { indexedDB.deleteDatabase('vot-search-cache'); } catch (e) {}
      alert('All personal data cleared. The app will now reload.');
      window.location.reload();
    } catch (e) {
      console.warn('clear all personal data failed', e);
      alert('Clear failed. See console for details.');
    }
  };

  return (/*#__PURE__*/
    React.createElement(ScreenLayout, { navChildren: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/
      React.createElement("button", { className: "nav-home nav-back-icon", onClick: onBack, title: "Back", "aria-label": "Back" }, "\u2039"), /*#__PURE__*/
      React.createElement(HomeBtn, null), /*#__PURE__*/
      React.createElement("button", { className: "nav-search-btn", onClick: onHistory, title: "History", style: { marginLeft: 'auto' } }, /*#__PURE__*/
      React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6" }, /*#__PURE__*/React.createElement("polyline", { points: "1 4 1 10 7 10" }), /*#__PURE__*/React.createElement("path", { d: "M3.51 15a9 9 0 1 0 .49-5.01" }))
      ), /*#__PURE__*/
      React.createElement("button", { className: "nav-search-btn", onClick: onSearch, title: "Search" }, /*#__PURE__*/
      React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6" }, /*#__PURE__*/React.createElement("circle", { cx: "11", cy: "11", r: "8" }), /*#__PURE__*/React.createElement("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" }))
      ), /*#__PURE__*/
      React.createElement(ThemeBtn, { theme: theme, onThemeChange: onThemeChange })
      ) }, /*#__PURE__*/
    React.createElement("div", { className: "settings-screen", onClick: resetClearPending }, /*#__PURE__*/
    React.createElement("div", { className: "settings-header" }, /*#__PURE__*/
    React.createElement("div", { className: "settings-eyebrow" }, "VOT Study Bible"), /*#__PURE__*/
    React.createElement("h1", { className: "settings-title" }, "Settings"), /*#__PURE__*/
    React.createElement("div", { className: "settings-ornament" }, /*#__PURE__*/
    React.createElement("div", { className: "settings-ornament-line" }), /*#__PURE__*/
    React.createElement("div", { className: "settings-ornament-diamond" }), /*#__PURE__*/
    React.createElement("div", { className: "settings-ornament-line r" })
    )
    ), /*#__PURE__*/


    React.createElement("div", { className: "settings-section" }, /*#__PURE__*/
    React.createElement("div", { className: "settings-section-label" }, "Text & Translation"), /*#__PURE__*/
    React.createElement(SelectField, {
      eyebrow: "Text & Translation",
      title: "Bible Translation",
      label: "Bible Translation",
      desc: "Verse text for the 66-book reading flow. Section headings stay in place across translations. Does not affect the Matthew Study Bible, which uses its own curated text.",
      value: settings.translation || "nkjv",
      options: TRANSLATION_OPTIONS,
      onChange: (v) => onSetting("translation", v) }
    ), /*#__PURE__*/
    React.createElement(SettingsRow, {
      label: "Chapter Titles",
      desc: "Show the curated chapter title below the chapter number (e.g. 'The Creation', 'The Genealogy of YahuShua'). Applies universally. Tap the title in a chapter for a per-session focus mode.",
      checked: settings.showChapterTitle !== false,
      onToggle: () => onToggle("showChapterTitle") }
    ), /*#__PURE__*/
    React.createElement(SettingsRow, {
      label: "Section Headings",
      desc: "Show inline topic breaks between verses (e.g. 'The Fall', 'The Call of Abraham'). Applies universally. Tap any heading in a chapter for a per-session focus mode.",
      checked: settings.showSectionHeadings !== false,
      onToggle: () => onToggle("showSectionHeadings") }
    ), /*#__PURE__*/
    React.createElement(SettingsRow, {
      label: "Restored Names",
      desc: "Uses the proper Name of The Father (YAHUWAH) and The Son (YahuShua) in chapter titles and section headings \u2014 only where the underlying verses bear the Name. Verse text itself is never altered.",
      checked: !!settings.restoredNames,
      onToggle: () => onToggle("restoredNames"),
      disabled: settings.showChapterTitle === false && settings.showSectionHeadings === false,
      disabledReason: "Turn on Chapter Titles or Section Headings to use Restored Names \u2014 the Names only appear in those." }
    )
    ), /*#__PURE__*/


    React.createElement("div", { className: "settings-section" }, /*#__PURE__*/
    React.createElement("div", { className: "settings-section-label" }, "Reading Experience"), /*#__PURE__*/
    React.createElement(SelectField, {
      eyebrow: "Reading Experience",
      title: "Chapter Arrows",
      label: "Chapter & Letter Arrows",
      desc: "Where the previous/next arrows live in a chapter or letter view.",
      value: settings.arrowLayout || "split",
      options: ARROW_LAYOUT_OPTIONS,
      onChange: (v) => onSetting("arrowLayout", v) }
    ), /*#__PURE__*/
    React.createElement(SelectField, {
      eyebrow: "Reading Experience",
      title: "Scripture Browser",
      label: "Scripture Browser",
      desc: "How books are organized on the Scriptures screen.",
      value: settings.scriptureLayout || "genre",
      options: SCRIPTURE_LAYOUT_OPTIONS,
      onChange: (v) => onSetting("scriptureLayout", v) }
    ), /*#__PURE__*/
    React.createElement(SettingsRow, {
      label: "Inline Reference Echoes",
      desc: "In the Matthew Study Bible's inline mode, when a reference spans multiple verse ranges (e.g. verses 1-5 and 10-15), show a compact echo pill at the end of each additional range that scrolls back to the full note. Helps you see what references relate to as you read.",
      checked: settings.showInlineEchoes !== false,
      onToggle: () => onToggle("showInlineEchoes") }
    ), /*#__PURE__*/
    React.createElement(SettingsRow, {
      label: "Reading Position Dot",
      desc: "A pulsing gold dot in the upper right that takes you back to where you were last reading.",
      checked: settings.showReadingDot,
      onToggle: () => onToggle("showReadingDot") }
    ), /*#__PURE__*/
    settings.showReadingDot && /*#__PURE__*/
    React.createElement(SelectField, {
      label: "Reading Dot Dwell Time",
      desc: "How long you must stay on a page before the reading dot updates to that position. Shorter = updates faster; longer = requires more settled reading.",
      value: settings.dwellMs || "20000",
      options: [
        { id: "3000",  label: "3 seconds",  desc: "Updates almost immediately" },
        { id: "5000",  label: "5 seconds",  desc: "Very quick" },
        { id: "10000", label: "10 seconds", desc: "Quick" },
        { id: "15000", label: "15 seconds", desc: "Moderate" },
        { id: "20000", label: "20 seconds", desc: "Standard (default)" },
        { id: "30000", label: "30 seconds", desc: "Relaxed" },
        { id: "45000", label: "45 seconds", desc: "Deliberate" },
        { id: "60000", label: "60 seconds", desc: "Requires a full minute on the page" }
      ],
      onChange: (v) => onSetting("dwellMs", v) }
    ), /*#__PURE__*/
    React.createElement(SettingsRow, {
      label: "Random Letter Button",
      desc: "A breathing dice icon on the home screen that opens a random chapter or letter when tapped.",
      checked: settings.showSurpriseButton,
      onToggle: () => onToggle("showSurpriseButton") }
    ), /*#__PURE__*/
    React.createElement(SettingsRow, {
      label: "Settings Gear in Top Nav",
      desc: "Show the gear icon in the top nav of every reading screen for quick access. When off, Settings is only reachable from the home screen.",
      checked: settings.showSettingsGear,
      onToggle: () => onToggle("showSettingsGear") }
    ), /*#__PURE__*/
    React.createElement(SettingsRow, {
      label: "History in Top Nav",
      desc: "Show the history button (clock icon) in the top nav of chapter and letter views. When off, History is still reachable from the home screen.",
      checked: !!settings.historyInNav,
      onToggle: () => onToggle("historyInNav"),
      disabled: settings.historyEnabled === false,
      disabledReason: "Turn on History to enable this." }
    ), /*#__PURE__*/
    React.createElement(SettingsRow, {
      label: "Keep Screen On While Reading",
      desc: "Don't let the screen dim or lock while the app is open. Helpful for long reading sessions; turn off to save battery. Has no effect on desktop browsers.",
      checked: settings.keepScreenOn !== false,
      onToggle: () => onToggle("keepScreenOn") }
    )
    ), /*#__PURE__*/


    React.createElement("div", { className: "settings-section" }, /*#__PURE__*/
    React.createElement("div", { className: "settings-section-label" }, "Tabs, Search & History"), /*#__PURE__*/
    React.createElement(SettingsRow, {
      label: "Tabs",
      desc: "Run up to 999 independent reading places in parallel \u2014 flip between a chapter, a letter, a study, and back. All tabs share settings, theme, mark-as-read, history, and reading progress. Disabling preserves all your open tabs \u2014 they'll be waiting when you turn it back on.",
      checked: !!settings.tabsEnabled,
      onToggle: () => onToggle("tabsEnabled") }
    ), /*#__PURE__*/
    React.createElement(SettingsRow, {
      label: "Search",
      desc: "Full-text search across all 66 books + Volumes. When off, the search button is hidden everywhere.",
      checked: settings.searchEnabled !== false,
      onToggle: () => onToggle("searchEnabled") }
    ), /*#__PURE__*/
    React.createElement(SettingsRow, {
      label: "Filter Stop Words in Search",
      desc: "On (default): strip filler words (the, is, of, and, this, that, etc.) from queries of 5+ words so results focus on meaningful terms. Off: match every word exactly as typed. Turn off if a search is missing results you know are there \u2014 especially with KJV-style phrasing.",
      checked: settings.searchUseStopWords !== false,
      onToggle: () => onToggle("searchUseStopWords"),
      disabled: settings.searchEnabled === false,
      disabledReason: "Turn on Search to enable this." }
    ), /*#__PURE__*/
    React.createElement(SettingsRow, {
      label: "History",
      desc: "Keep a running list of chapters and letters you've visited. When off, recording stops and the history button is hidden. Existing history is preserved.",
      checked: settings.historyEnabled !== false,
      onToggle: () => onToggle("historyEnabled") }
    ),
    (() => {
      const histStage = getStage('history-clear');
      const histLabel = histStage === 0 ? 'Clear History' : CLEAR_LABELS[histStage];
      return (/*#__PURE__*/
        React.createElement("div", { className: "progress-row", style: { background: 'var(--bg2)', borderTop: '1px solid var(--gold-border)', borderRadius: '4px', marginTop: '0.4rem' } }, /*#__PURE__*/
        React.createElement("span", { className: "progress-row-label", style: { color: 'var(--cream-muted)' } }, "Reading history"), /*#__PURE__*/
        React.createElement("span", { className: "progress-row-tally" }, historyCount, " ", historyCount === 1 ? 'entry' : 'entries'), /*#__PURE__*/
        React.createElement("button", {
          className: CLEAR_CLASSES[histStage],
          disabled: historyCount === 0,
          onClick: handleClearTap('history-clear', onClearHistory) },
        histLabel)
        ));

    })()
    ), /*#__PURE__*/

    React.createElement("div", { className: "settings-section" }, /*#__PURE__*/
    React.createElement("div", { className: "settings-section-label" }, "A Return to The Garden"), /*#__PURE__*/
    React.createElement(SelectField, {
      eyebrow: "A Return to The Garden",
      title: "Image Quality",
      label: "Image Quality",
      desc: "Changing this re-downloads images at the selected quality next time you view them.",
      value: settings.gardenTier || GARDEN_DEFAULT_TIER,
      options: GARDEN_TIERS.map((t) => ({
        id: t.id,
        label: `${t.label} · ${t.size}`,
        desc: `${t.res} · ${t.desc}`
      })),
      onChange: (v) => onSetting("gardenTier", v) }
    )
    ), /*#__PURE__*/

    React.createElement("div", { className: "settings-section" }, /*#__PURE__*/
    React.createElement("div", { className: "settings-section-label" }, "Your Data"), /*#__PURE__*/
    React.createElement("div", { className: "settings-row" }, /*#__PURE__*/
    React.createElement("div", { className: "settings-row-text" }, /*#__PURE__*/
    React.createElement("div", { className: "settings-row-label" }, "Export Your Data"), /*#__PURE__*/
    React.createElement("div", { className: "settings-row-desc" }, "Download every note, highlight, notebook, journal entry, bookmark, link, reading-progress mark, history record, open tab, and setting stored on this device as a single JSON file. No credentials or login info — just your data. Save the file anywhere you control.")
    ), /*#__PURE__*/
    React.createElement("button", { className: "settings-clear-btn", onClick: (e) => { e.stopPropagation(); exportPersonalData(); } }, "Export")
    ), /*#__PURE__*/
    React.createElement("div", { className: "settings-row" }, /*#__PURE__*/
    React.createElement("div", { className: "settings-row-text" }, /*#__PURE__*/
    React.createElement("div", { className: "settings-row-label" }, "Import from Backup"), /*#__PURE__*/
    React.createElement("div", { className: "settings-row-desc" }, "Restore a previously exported JSON file. Replaces all current personal data on this device with the contents of the file. You will be asked to confirm before anything is overwritten.")
    ), /*#__PURE__*/
    React.createElement("button", { className: "settings-clear-btn", onClick: (e) => { e.stopPropagation(); importPersonalData(); } }, "Import")
    ),
    (() => {
      const closeWipe = () => { setWipeConfirm(false); setWipeText(''); };
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/
        React.createElement("div", { className: "settings-row" }, /*#__PURE__*/
          React.createElement("div", { className: "settings-row-text" }, /*#__PURE__*/
          React.createElement("div", { className: "settings-row-label" }, "Clear All Personal Data"), /*#__PURE__*/
          React.createElement("div", { className: "settings-row-desc" }, "Removes every note, highlight, notebook, journal entry, bookmark, link, reading-progress mark, history record, saved tab, tab thumbnail, and search cache. App settings will reset to defaults. This cannot be undone — export first if you want a backup.")
          ), /*#__PURE__*/
          React.createElement("button", { className: "settings-clear-btn danger", onClick: (e) => { e.stopPropagation(); setWipeText(''); setWipeConfirm(true); } }, "Clear All My Data")
        ),
        wipeConfirm && /*#__PURE__*/React.createElement("div", {
          className: "note-sheet-overlay",
          onClick: (e) => { e.stopPropagation(); if (e.target === e.currentTarget) closeWipe(); } }, /*#__PURE__*/
          React.createElement("div", { className: "note-sheet", onClick: (e) => e.stopPropagation() }, /*#__PURE__*/
            React.createElement("div", { className: "note-sheet-header" }, /*#__PURE__*/
              React.createElement("div", { className: "note-sheet-title" }, "Delete All Personal Data")
            ), /*#__PURE__*/
            React.createElement("div", { style: { color: "var(--cream)", fontSize: "0.9rem", lineHeight: "1.5", marginBottom: "14px" } },
              "This permanently erases every note, highlight, notebook, journal entry, bookmark, link, reading-progress mark, history record, saved tab, and the search cache, then resets all settings to defaults. ", /*#__PURE__*/
              React.createElement("strong", { style: { color: "#c0392b" } }, "This cannot be undone."), " Export your data first if you want a backup."
            ), /*#__PURE__*/
            React.createElement("div", { style: { color: "var(--cream-muted)", fontSize: "0.78rem", letterSpacing: "0.04em", marginBottom: "8px" } },
              "Type ", /*#__PURE__*/React.createElement("strong", { style: { color: "var(--gold)", letterSpacing: "0.15em" } }, "DELETE"), " to confirm."
            ), /*#__PURE__*/
            React.createElement("input", {
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
              onKeyDown: (e) => { if (e.key === 'Enter' && wipeOk) { closeWipe(); clearAllPersonalData(); } },
              style: {
                width: "100%", boxSizing: "border-box", textAlign: "center",
                fontFamily: "'Cinzel', serif", fontSize: "1rem", letterSpacing: "0.22em",
                textTransform: "uppercase", color: "var(--cream)",
                background: "var(--bg)", border: "1px solid var(--gold-border)",
                borderRadius: "6px", padding: "0.7rem 0.5rem", outline: "none", marginBottom: "18px"
              }
            }), /*#__PURE__*/
            React.createElement("div", { style: { display: "flex", gap: "10px", justifyContent: "flex-end" } }, /*#__PURE__*/
              React.createElement("button", { className: "settings-clear-btn", onClick: (e) => { e.stopPropagation(); closeWipe(); } }, "Cancel"), /*#__PURE__*/
              React.createElement("button", {
                className: "settings-clear-btn danger",
                disabled: !wipeOk,
                onClick: (e) => { e.stopPropagation(); if (!wipeOk) return; closeWipe(); clearAllPersonalData(); } },
              "Delete Everything")
            )
          )
        )
      );
    })()
    ), /*#__PURE__*/

    React.createElement("div", { className: "settings-section" }, /*#__PURE__*/
    React.createElement("div", { className: "settings-section-label" }, "Mark as Read"), /*#__PURE__*/
    React.createElement(SettingsRow, {
      label: "Mark as Read",
      desc: "Chapters and letters you've read past 90% are marked with a checkmark. Progress stops recording when this is off, but what's already saved is kept.",
      checked: settings.markAsRead,
      onToggle: () => onToggle("markAsRead") }
    ),
    settings.markAsRead && /*#__PURE__*/
    React.createElement("div", { className: "progress-table" },
    PROGRESS_GROUPS.map((grp) => {
      const isOpen = openSections.has(grp.id);
      const sRead = sectionRead(grp);
      const sTotal = sectionTotal(grp);
      const sectionKey = `section:${grp.id}`;
      const secStage = getStage(sectionKey);
      return (/*#__PURE__*/
        React.createElement(React.Fragment, { key: grp.id }, /*#__PURE__*/

        React.createElement("div", { className: "progress-row", style: { background: "var(--bg)", cursor: "pointer" },
          onClick: (e) => {e.stopPropagation();toggleSection(grp.id);resetClearPending();} }, /*#__PURE__*/
        React.createElement("span", { style: { color: "var(--gold-dim)", fontSize: "0.75rem", minWidth: "0.75rem" } },
        isOpen ? "▾" : "▸"
        ), /*#__PURE__*/
        React.createElement("span", { className: "progress-row-label", style: { color: "var(--gold)" } }, grp.label), /*#__PURE__*/
        React.createElement("span", { className: "progress-row-tally" }, sRead, " / ", sTotal), /*#__PURE__*/
        React.createElement("button", {
          className: CLEAR_CLASSES[secStage],
          disabled: sRead === 0,
          onClick: handleClearTap(sectionKey, () => sectionBooks(grp).forEach((b) => onClearBook(b.id))) },
        CLEAR_LABELS[secStage])
        ),

        isOpen && grp.genres.map((genre) => /*#__PURE__*/
        React.createElement(React.Fragment, { key: genre.label }, /*#__PURE__*/

        React.createElement("div", { className: "progress-row", style: { background: "var(--bg2)", paddingTop: "0.45rem", paddingBottom: "0.45rem", paddingLeft: "2rem" } }, /*#__PURE__*/
        React.createElement("span", { style: { fontFamily: "'Cinzel',serif", fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--gold-dim)", flex: 1 } },
        genre.label
        )
        ),

        genre.books.map((src) => {
          const bookKey = `book:${src.id}`;
          return (/*#__PURE__*/
            React.createElement("div", { key: src.id, style: { paddingLeft: "1rem" } }, /*#__PURE__*/
            React.createElement(ClearProgressRow, {
              label: src.label,
              total: src.total,
              count: countFor(src.id),
              stage: getStage(bookKey),
              onTap: handleClearTap(bookKey, () => onClearBook(src.id)) }
            )
            ));

        })
        )
        )
        ));

    }), /*#__PURE__*/
    React.createElement("div", { className: "progress-divider" }), /*#__PURE__*/
    React.createElement("div", { className: "progress-row total-row" }, /*#__PURE__*/
    React.createElement("span", { className: "progress-row-label" }, "All Scriptures"), /*#__PURE__*/
    React.createElement("span", { className: "progress-row-tally" }, totalRead, " / ", totalItems),
    (() => {
      const allStage = getStage("all");
      const label = allStage === 0 ? "Clear All" : CLEAR_LABELS[allStage];
      return (/*#__PURE__*/
        React.createElement("button", {
          className: CLEAR_CLASSES[allStage],
          disabled: totalRead === 0,
          onClick: handleClearTap("all", onClearAll) },
        label));

    })()
    )
    )

    )
    )
    ));

}
