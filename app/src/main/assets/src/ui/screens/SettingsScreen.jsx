/* ═══════════════════════════════════════════════════════════════════════
   SettingsScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

/* WL1 — Text Size options for the SelectField in the Text & Translation
   section. The id is the raw --font-scale multiplier (string) applied to the
   root font-size; "1" = the app's standard size. */
const TEXT_SIZE_OPTIONS = [
  { id: "1", label: "Standard", desc: "The app's standard reading size." },
  { id: "1.15", label: "Large", desc: "15% larger text throughout." },
  { id: "1.3", label: "Larger", desc: "30% larger text throughout." },
  { id: "1.5", label: "Largest", desc: "50% larger text throughout." },
];

/* Tiny per-row confirm helpers. Each owns its own confirm state and
   renders either the row's button OR the standardized ConfirmStrip in
   the slot below the row. Defined at module scope (not inside
   SettingsScreen) so React identity stays stable across renders. */

function HistoryClearRow({ historyCount, onClearHistory }) {
  const [confirming, setConfirming] = React.useState(false);
  return (
    <>
      <div className="progress-row" style={{ background: 'var(--bg2)', borderTop: '1px solid var(--gold-border)', borderRadius: '4px', marginTop: '0.4rem' }}>
        <span className="progress-row-label" style={{ color: 'var(--cream-muted)' }}>Reading history</span>
        <span className="progress-row-tally">{historyCount} {historyCount === 1 ? 'entry' : 'entries'}</span>
        {!confirming && (
          <button
            className="settings-clear-btn"
            disabled={historyCount === 0}
            onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
          >Clear History</button>
        )}
      </div>
      {confirming && (
        <ConfirmStrip
          question="Clear all reading history?"
          yesLabel="Yes, clear"
          onCancel={() => setConfirming(false)}
          onConfirm={() => { onClearHistory(); setConfirming(false); }}
        />
      )}
    </>
  );
}

function SectionClearBtn({ label, disabled, onClear }) {
  const [confirming, setConfirming] = React.useState(false);
  if (confirming) {
    return (
      <ConfirmStrip
        question={`Clear all progress in "${label}"?`}
        yesLabel="Yes, clear"
        onCancel={() => setConfirming(false)}
        onConfirm={() => { onClear(); setConfirming(false); }}
      />
    );
  }
  return (
    <button
      className="settings-clear-btn"
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
    >Clear</button>
  );
}

function AllProgressClearRow({ totalRead, totalItems, onClearAll }) {
  const [confirming, setConfirming] = React.useState(false);
  return (
    <>
      <div className="progress-row total-row">
        <span className="progress-row-label">All Scriptures</span>
        <span className="progress-row-tally">{totalRead} / {totalItems}</span>
        {!confirming && (
          <button
            className="settings-clear-btn"
            disabled={totalRead === 0}
            onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
          >Clear All</button>
        )}
      </div>
      {confirming && (
        <ConfirmStrip
          question="Clear all reading progress across every book?"
          yesLabel="Yes, clear"
          onCancel={() => setConfirming(false)}
          onConfirm={() => { onClearAll(); setConfirming(false); }}
        />
      )}
    </>
  );
}

function _platformLabel(platform) {
  switch (platform) {
    case 'android-webview': return 'Android (App)';
    case 'safari-tab': return 'Safari';
    case 'safari-pwa': return 'Safari (Home Screen App)';
    case 'firefox': return 'Firefox';
    case 'chrome': return 'Chrome';
    case 'edge': return 'Edge';
    default: return 'Web Browser';
  }
}

/* ── v3 streaming backup — Android byte plumbing (BACKUP-STREAMING-PLAN P3) ──
   The Android WebView-69 floor lacks Blob.arrayBuffer()/.stream() (Chromium-76
   APIs) and Blob.text(), so the JS side cannot use the web backup-container.js
   codec; it reads blob slices via FileReader.readAsArrayBuffer and base64s them
   for the string bridge (native owns the binary framing). These helpers are
   WV69-safe (FileReader + chunked String.fromCharCode/btoa/atob — all ancient).
   base64 is the transient bridge encoding ONLY — never written to disk. */

// Per-chunk size for the bridge: 512 KB raw → ~683 KB base64 per call. Keeps
// peak heap bounded on budget devices regardless of total blob/backup size.
const ANDROID_V3_CHUNK = 512 * 1024;

/** Uint8Array → standard base64. Builds the binary string in 32 KB sub-chunks
 *  so String.fromCharCode.apply never blows the call-stack on a big slice. */
function _u8ToBase64(u8) {
  let binary = '';
  const STEP = 0x8000; // 32 KB — safely under the apply() arg-count limit
  for (let i = 0; i < u8.length; i += STEP) {
    binary += String.fromCharCode.apply(null, u8.subarray(i, i + STEP));
  }
  return btoa(binary);
}

/** Standard base64 → Uint8Array (WV69 atob + charCodeAt). */
function _base64ToU8(b64) {
  const binary = atob(b64);
  const u8 = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) u8[i] = binary.charCodeAt(i);
  return u8;
}

/** Read one Blob slice to base64 via FileReader (WV69-safe — no Blob.arrayBuffer). */
function _blobSliceToBase64(blobSlice) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      try { resolve(_u8ToBase64(new Uint8Array(/** @type {ArrayBuffer} */ (fr.result)))); }
      catch (e) { reject(e); }
    };
    fr.onerror = () => reject(fr.error || new Error('blob read failed'));
    fr.readAsArrayBuffer(blobSlice);
  });
}

export function SettingsScreen({ settings, onToggle, onSetting, onBack, onSearch, onHistory, theme, onThemeChange, readItems, onClearBook, onClearAll, onClearHistory, historyCount }) {
  // Q8: BOOKS + VOT corpora are lazy. PROGRESS_GROUPS reads BOOKS[...] keys
  // (for the NT section) AND LETTERS_V1/LETTERS/etc. globals (for the
  // Volumes section). Pre-fire both loaders on mount and subscribe so the
  // screen re-renders with full data once they arrive.
  React.useEffect(() => {
    if (typeof window.__loadBibleCorpus === 'function') {
      window.__loadBibleCorpus().catch((e) => console.warn('Bible corpus pre-load failed', e));
    }
    if (typeof window.__loadVotCorpus === 'function') {
      window.__loadVotCorpus().catch((e) => console.warn('VOT corpus pre-load failed', e));
    }
  }, []);
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof window.__bibleCorpus !== 'undefined') ? window.__bibleCorpus.subscribe(cb) : () => {}, []),
    () => (typeof window.__bibleCorpus !== 'undefined') ? window.__bibleCorpus.getVersion() : 0
  );
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof window.__votCorpus !== 'undefined') ? window.__votCorpus.subscribe(cb) : () => {}, []),
    () => (typeof window.__votCorpus !== 'undefined') ? window.__votCorpus.getVersion() : 0
  );
  const _BOOKS_READY = typeof BOOKS !== 'undefined' && !!BOOKS;
  const _VOT_READY = (typeof window.__votCorpus !== 'undefined') ? window.__votCorpus.loaded : false;

  const [openSections, setOpenSections] = React.useState(new Set());

  // W2.5 — navigator.storage estimate + persist. The hook reads once
  // on mount; the derived display strings below pick the right text
  // for each (status, persisted, persistDenied) combination.
  const storageInfo = useStorageInfo();
  const protectionDisplayText = (() => {
    if (storageInfo.status === 'loading') return 'Checking…';
    if (storageInfo.status === 'unavailable') return 'Persistence API unavailable on this browser.';
    if (storageInfo.persisted) return 'Active — your data is protected from automatic browser cleanup.';
    if (storageInfo.persistDenied) return 'Browser denied protection. Export regularly as a backup.';
    return 'Not active — tap "Protect now" to request protection from automatic browser cleanup.';
  })();
  const showProtectButton = storageInfo.status === 'ready'
    && !storageInfo.persisted
    && !storageInfo.persistDenied;

  // "Your data" = the bytes of the user's OWN content (the set Export
  // backs up): annotations, notes, journal + media, bookmarks, links,
  // notebooks, marked-as-read, history, saved tabs/settings. Measured
  // separately from the OS-level "total app data" (storageInfo.usage),
  // which also counts the regenerable corpus/search/thumbnail caches and
  // the Garden images. Garden is app data, never user data. Re-measured
  // when the screen mounts (cheap — JSON byte-length + blob sizes).
  const [userData, setUserData] = React.useState(/** @type {null | {total:number,structured:number,media:number,mediaCount:number}} */ (null));
  React.useEffect(() => {
    let alive = true;
    measureUserData().then((r) => { if (alive) setUserData(r); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const appDataDisplayText = (() => {
    if (storageInfo.status === 'loading') return 'Checking…';
    if (storageInfo.status === 'unavailable') return 'Storage info unavailable on this browser.';
    if (storageInfo.usage == null) return 'Storage info partially unavailable.';
    const used = formatBytes(storageInfo.usage);
    return storageInfo.quota != null
      ? `About ${used} of ${formatBytes(storageInfo.quota)} — everything this app stores on the device, including the offline library and Garden images.`
      : `About ${used} — everything this app stores on the device, including the offline library and Garden images.`;
  })();
  const userDataDisplayText = (() => {
    if (userData == null) return 'Calculating…';
    const total = formatBytes(userData.total);
    const mediaPart = userData.mediaCount > 0
      ? ` (includes ${userData.mediaCount} journal ${userData.mediaCount === 1 ? 'item' : 'items'} — ${formatBytes(userData.media)})`
      : '';
    return `About ${total}${mediaPart} — your highlights, notes, journal, bookmarks, links, reading progress, and history. This is what Export backs up. Garden images are not counted here.`;
  })();

  const [wipeConfirm, setWipeConfirm] = React.useState(false);
  const [wipeText, setWipeText] = React.useState('');
  // NK5c: diagnostic-log snapshot for the "Your Data" section. The bridge
  // (W1.2 Tier B.2) always exposes getCrashLog: Android merges the native
  // BoundedLogTree with the JS-side DiagnosticLog; web returns the JS
  // DiagnosticLog alone (W7.4). Empty on a clean session. Read once on
  // mount; the count is a static snapshot of "what would be exported now."
  const [diagnosticLog, setDiagnosticLog] = React.useState([]);
  React.useEffect(() => {
    try {
      const raw = PlatformBridge.getCrashLog();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setDiagnosticLog(parsed);
    } catch (e) {
      console.warn('getCrashLog read failed', e);
    }
  }, []);
  const wipeOk = wipeText.trim().toUpperCase() === 'DELETE';
  const VERSION_ID = "v1";

  const PROGRESS_GROUPS = (!_BOOKS_READY || !_VOT_READY) ? [] : [
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
    { label: "Acts", books: [{ id: "acts", label: "Acts", total: BOOKS.acts.chapters.length }] },
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
    { label: "Revelation", books: [{ id: "revelation", label: "Revelation", total: BOOKS.revelation.chapters.length }] }]
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
    if (next.has(id)) next.delete(id); else next.add(id);
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
  // ════════════════════════════════════════════════════════════════
  // EXPORT v2 / IMPORT v1+v2 (W2.6)
  // ════════════════════════════════════════════════════════════════
  // Payload schema:
  //   {
  //     app: 'VOTReader',
  //     exportVersion: 2,                  (v1 backups have 1 or absent)
  //     exportDate: ISO,
  //     diagnosticLog: [...],
  //     data: {                            (v1+v2: LS boot-shim ONLY in v2;
  //                                         v1 had FULL state here)
  //       'vot-state': '<reduced JSON>',
  //     },
  //     stores: { ... },                   (v2 ONLY: IDB-backed stores)
  //     media: { id: { type, mime, ..., data: base64 } }  (v2 ONLY)
  //   }
  //
  // V1 client reading v2: walks `data` only — restores theme +
  // fontStyle, ignores unknown top-level keys (stores, media) per
  // its existing filter loop. User keeps boot-shim settings;
  // everything else lost. Documented limitation.
  //
  // V2 client reading v1: detects exportVersion !== 2, falls back to
  // parsing `data` values as JSON strings (the pre-W2 format) and
  // calling replaceAll on each store inline. Full restore.
  //
  // V2 client reading v3+ (future): walks `data` + `stores` + `media`
  // it knows about; ignores unknown top-level keys (forward compat).
  //
  // 4 user-facing toast sites replace the pre-W2.6 alert() calls
  // per [[consolidate-dont-duplicate]] via the showToast utility.

  const _TOAST_ID = 'vot-toast-info';
  const _showToast = (html, durationMs) => showToast({
    id: _TOAST_ID, className: 'vot-toast', html: html, durationMs: durationMs == null ? 3500 : durationMs,
  });

  // The base64 codecs + the export-payload build + the import-apply data
  // plane live in utils/backup.js (extracted U14) so the export → wipe →
  // import → reload round-trip is testable end-to-end against the real
  // stores. This screen owns only the UI orchestration around them.

  /**
   * Map from IDB store name to its store object + the method used to
   * apply replacement. `setAll` for stores with whole-collection
   * primitives, `set` for single-value stores (StateStore, etc.),
   * `replaceAll` otherwise.
   */
  const _exportableStores = () => ({
    'vot-annotations':         { store: AnnotationStore,      method: 'replaceAll' },
    'vot-notes':               { store: NoteStore,            method: 'replaceAll' },
    'vot-bookmarks':           { store: BookmarkStore,        method: 'replaceAll' },
    'vot-links':               { store: LinkStore,            method: 'replaceAll' },
    'vot-notebooks':           { store: NotebookStore,        method: 'replaceAll' },
    'vot-journal':             { store: JournalStore,         method: 'replaceAll' },
    'vot-journal-notebooks':   { store: JournalNotebookStore, method: 'replaceAll' },
    'vot-journal-index':       { store: JournalIndexStore,    method: 'replaceAll' },
    'vot-journal-stats':       { store: JournalStatsStore,    method: 'replaceAll' },
    'vot-recent-nav':          { store: RecentNavStore,       method: 'replaceAll' },
    'vot-history':             { store: HistoryStore,         method: 'setAll' },
    'vot-prophecy-cards':      { store: ProphecyCardsStore,   method: 'setAll' },
    'vot-home-order':          { store: HomeOrderStore,       method: 'set' },
    'vot-state':               { store: StateStore,           method: 'set' },
  });
  /**
   * Boolean flag stores keyed by IDB store name. Imported via set()
   * when value is truthy; clear() otherwise.
   */
  const _flagStores = () => ({
    'vot-welcomed':              WelcomedFlagStore,
    'vot-about-seen':            AboutSeenFlagStore,
    'vot-garden-warning-acked':  GardenWarningFlagStore,
  });

  // Web export uses the v3 STREAMING container (GB-scale — never holds the whole
  // payload in memory; one blob at a time). Android keeps the proven v2 path
  // until its native streaming lands (P3), so the only-backup mechanism is never
  // broken mid-port. BACKUP-STREAMING-PLAN.txt.
  const _exportV3Web = async () => {
    try {
      _showToast('Preparing export…', 0);
      const built = await buildV3Manifest({
        storesMap: _exportableStores(),
        flagMap: _flagStores(),
        idbAdapter: IDBAdapter,
        mediaStore: JournalMediaStore,
        diagnosticLog: diagnosticLog,
      });
      if (!built.ok) {
        // buildV3Manifest fails LOUD (U6) on a store/media read failure — abort
        // rather than write a misleading, incomplete backup. (No media-limit case:
        // v3 streams, so there is no size cap.)
        hideToast(_TOAST_ID);
        _showToast('Export aborted — could not read: ' + built.problems.join(', ') + '. Nothing was saved. Please try again; if this repeats, your device storage may be failing.');
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `votreader-backup-${stamp}.votbak`;
      // The destination picker takes over the screen; drop the "Preparing…" toast.
      hideToast(_TOAST_ID);
      const sink = await PlatformBridge.openExportSink(filename);
      if (!sink) return; // user cancelled the picker — stay quiet
      _showToast('Saving backup…', 0);
      try {
        // Stream the container to the sink: only one media blob is in memory at
        // any moment, so this scales to whatever the device can store.
        await writeContainer(built.manifest, built.mediaEntries, sink.write);
        await sink.close();
        hideToast(_TOAST_ID);
        _showToast('Backup saved.');
      } catch (e) {
        hideToast(_TOAST_ID);
        console.warn('export write failed', e);
        _showToast('Export failed while writing. Please try again.');
      }
    } catch (e) {
      console.warn('export failed', e);
      hideToast(_TOAST_ID);
      _showToast('Export failed. See console for details.');
    }
  };

  // Android export uses the v3 STREAMING container via the native chunked bridge
  // (the WebView-69 floor can't run the web codec — see backup-container.js /
  // StorageManager.kt; native owns the framing). buildV3Manifest is SHARED with
  // the web path; only the container WRITE differs. Peak memory is one
  // ANDROID_V3_CHUNK slice, so this scales to whatever the device can store.
  // BACKUP-STREAMING-PLAN P3.
  const _exportV3Android = async () => {
    let opened = false;
    try {
      _showToast('Preparing export…', 0);
      const built = await buildV3Manifest({
        storesMap: _exportableStores(),
        flagMap: _flagStores(),
        idbAdapter: IDBAdapter,
        mediaStore: JournalMediaStore,
        diagnosticLog: diagnosticLog,
      });
      if (!built.ok) {
        // buildV3Manifest fails LOUD (U6) on a store/media read failure — abort
        // rather than write a misleading, incomplete backup. (No media-limit
        // case: v3 streams, so there is no size cap.)
        hideToast(_TOAST_ID);
        _showToast('Export aborted — could not read: ' + built.problems.join(', ') + '. Nothing was saved. Please try again; if this repeats, your device storage may be failing.');
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `votreader-backup-${stamp}.votbak`;
      // The destination picker takes over the screen; drop the "Preparing…" toast.
      hideToast(_TOAST_ID);
      // 1. SAF destination picker (async). Install the ready callback BEFORE launch.
      const ready = await new Promise((resolve) => {
        window.__onV3ExportReady = (status) => { window.__onV3ExportReady = null; resolve(status); };
        PlatformBridge.v3ExportOpen(filename);
      });
      if (ready === 'cancelled') return;                 // user dismissed the picker
      if (ready !== 'ok') throw new Error('picker: ' + ready);
      opened = true;
      _showToast('Saving backup…', 0);
      // 2. Write magic + manifest frame (native frames it — the manifest is the
      //    structured stores + per-blob METADATA only, bounded to MBs).
      let r = PlatformBridge.v3ExportBegin(JSON.stringify(built.manifest));
      if (r !== 'ok') throw new Error('begin: ' + r);
      // 3. Stream each media blob in <=ANDROID_V3_CHUNK slices — one slice in
      //    memory at a time (FileReader read; native decodes + appends raw bytes).
      for (const entry of built.mediaEntries) {
        const blob = entry.blob;
        r = PlatformBridge.v3ExportWriteBlob(String(blob.size));
        if (r !== 'ok') throw new Error('writeBlob: ' + r);
        for (let pos = 0; pos < blob.size; pos += ANDROID_V3_CHUNK) {
          const b64 = await _blobSliceToBase64(blob.slice(pos, Math.min(pos + ANDROID_V3_CHUNK, blob.size)));
          r = PlatformBridge.v3ExportChunk(b64);
          if (r !== 'ok') throw new Error('chunk: ' + r);
        }
      }
      // 4. Commit (flush + close).
      r = PlatformBridge.v3ExportFinish(true);
      if (r !== 'ok') throw new Error('finish: ' + r);
      opened = false;
      hideToast(_TOAST_ID);
      _showToast('Backup saved.');
    } catch (e) {
      console.warn('android v3 export failed', e);
      // Abort: close + delete the partial file so no truncated, misleading
      // backup is left behind (the only backup must fail clean).
      if (opened) { try { PlatformBridge.v3ExportFinish(false); } catch (_e) { /* best-effort */ } }
      hideToast(_TOAST_ID);
      _showToast('Export failed while writing. Please try again.');
    }
  };

  const exportPersonalData = async () => {
    // Both platforms now write the v3 STREAMING container (.votbak). Web streams
    // via openExportSink + writeContainer; Android via the native chunked bridge.
    // (The v2 buildExportPayload remains exported for rollback + the P5 fold.)
    if (PlatformBridge.isAndroid) { await _exportV3Android(); return; }
    await _exportV3Web();
  };

  const importPersonalData = () => {
    // Shared import tail: confirm dialog + degraded-store guard + apply + result
    // toast + reload. `parsed` is the v2 JSON payload OR the v3 manifest (same
    // envelope shape); applyFn(storesMap, flagMap) → { importFailures,
    // writeFailures, skippedStores }. ONE source of truth for both formats.
    const _confirmDegradeApplyReload = async (parsed, applyFn) => {
      const exportVersion = parsed.exportVersion || 1;
      const dateLabel = parsed.exportDate ? new Date(parsed.exportDate).toLocaleString() : 'unknown date';
      // Forward-compat: warn but proceed with the keys this client understands.
      const forwardCompatNote = exportVersion > 3
        ? '\n\nNOTE: This backup was created with a newer version of VOTReader. Some data may not be imported.'
        : '';
      // Summarize what's about to land for the confirm dialog.
      const summaryParts = [];
      if (parsed.stores && typeof parsed.stores === 'object') {
        const annData = parsed.stores['vot-annotations'];
        const annKeys = annData && typeof annData === 'object' ? Object.keys(annData).length : 0;
        const bkms = Array.isArray(parsed.stores['vot-bookmarks']) ? parsed.stores['vot-bookmarks'].length : 0;
        const jrn = parsed.stores['vot-journal'] && Array.isArray(parsed.stores['vot-journal'].list)
          ? parsed.stores['vot-journal'].list.length : 0;
        if (annKeys) summaryParts.push(`${annKeys} annotated keys`);
        if (bkms) summaryParts.push(`${bkms} bookmarks`);
        if (jrn) summaryParts.push(`${jrn} journal entries`);
      }
      // media is an object (v2) or an array of metadata (v3) — count either.
      const mediaCount = Array.isArray(parsed.media) ? parsed.media.length
        : (parsed.media && typeof parsed.media === 'object' ? Object.keys(parsed.media).length : 0);
      if (mediaCount) summaryParts.push(`${mediaCount} media items`);
      const summary = summaryParts.length ? ` This backup contains ${summaryParts.join(', ')}.` : '';

      // Soft, advisory free-space heads-up (P4). v3 streaming is uncapped, so a huge
      // backup is no longer refused; instead warn (don't block) if its media likely
      // won't fit in the device's remaining IDB budget. Best-effort: navigator.storage
      // .estimate is Chromium-61+ (works on the WV69 floor); a v3 manifest carries each
      // blob's `size`, so the total is exact. ADVISORY — a real write failure is still
      // caught (S3). Absent on a v2 legacy payload (media is base64, no size array).
      let spaceNote = '';
      try {
        const mediaTotal = Array.isArray(parsed.media)
          ? parsed.media.reduce((s, m) => s + (m && typeof m.size === 'number' ? m.size : 0), 0) : 0;
        if (mediaTotal > 0 && navigator.storage && typeof navigator.storage.estimate === 'function') {
          spaceNote = formatImportSpaceWarning(mediaTotal, await navigator.storage.estimate());
        }
      } catch (_e) { /* advisory only — never blocks the import */ }

      const proceed = window.confirm(
        `Importing the backup from ${dateLabel} will OVERWRITE the data types contained in this backup; any data type not included is left unchanged.${summary}${forwardCompatNote}${spaceNote} This cannot be undone.\n\nContinue?`
      );
      if (!proceed) return;

      _showToast('Importing… please wait.', 0);

      const storesMap = _exportableStores();
      const flagMap = _flagStores();

      // Guard: if any store is 'degraded' (IDB hydration timed out), the apply
      // would queue in memory and be lost on the upcoming reload.
      const hasDegraded = Object.values(storesMap).some(({ store }) => store.getState() === 'degraded')
        || Object.values(flagMap).some((s) => s.getState() === 'degraded');
      if (hasDegraded) {
        hideToast(_TOAST_ID);
        _showToast('Storage is temporarily unavailable. Please try again in a moment.');
        return;
      }

      // Apply + WAIT for every write to durably land before reloading (U1
      // barrier). applyFn SKIPS any section that fails shape validation so a
      // corrupt section can't overwrite good data.
      const { importFailures, writeFailures, skippedStores } = await applyFn(storesMap, flagMap);

      hideToast(_TOAST_ID);

      // S3: a write FAILING is not a validation skip — the imported data is in
      // the caches but did NOT durably land, so a reload would mix it with OLD
      // IDB data. Do NOT reload; keep the page up and ask the user to retry.
      if (writeFailures > 0) {
        _showToast(`Import incomplete — ${writeFailures} store${writeFailures > 1 ? 's' : ''} failed to save. Please retry the import and don't close the app.`);
        return;
      }

      const problems = [];
      if (importFailures > 0) problems.push(`${importFailures} error${importFailures > 1 ? 's' : ''}`);
      if (skippedStores.length > 0) {
        problems.push(`${skippedStores.length} section${skippedStores.length > 1 ? 's' : ''} skipped (invalid: ${skippedStores.join(', ')})`);
      }
      if (problems.length) {
        _showToast(`Import completed — ${problems.join('; ')} (check console). Reloading…`, 0);
      } else {
        _showToast('Import complete. Reloading…', 0);
      }
      // Short delay lets the toast render before reload (durability already guaranteed).
      setTimeout(() => window.location.reload(), 600);
    };

    // v3 streaming container import (web): read the file, validate, apply via applyV3.
    const _importV3Container = async (file) => {
      let read;
      try { read = await readContainer(file); }
      catch (e) {
        console.warn('v3 container read failed', e);
        _showToast('This backup file is corrupt or incomplete and could not be read.');
        return;
      }
      const { manifest, entries } = read;
      const envelopeErrors = validateImportEnvelope(manifest);
      if (envelopeErrors.length) {
        console.warn('import envelope invalid:', envelopeErrors);
        _showToast('This file does not look like a VOTReader backup.');
        return;
      }
      await _confirmDegradeApplyReload(manifest, (storesMap, flagMap) => applyV3(manifest, entries, {
        storesMap: storesMap,
        flagMap: flagMap,
        mediaStore: JournalMediaStore,
        validateStorePayload: validateStorePayload,
      }));
    };

    const _doImport = async (jsonText) => {
      try {
        const parsed = JSON.parse(jsonText);
        const envelopeErrors = validateImportEnvelope(parsed);
        if (envelopeErrors.length) {
          console.warn('import envelope invalid:', envelopeErrors);
          _showToast('This file does not look like a VOTReader backup.');
          return;
        }
        await _confirmDegradeApplyReload(parsed, (storesMap, flagMap) => applyImportPayload(parsed, {
          storesMap: storesMap,
          flagMap: flagMap,
          mediaStore: JournalMediaStore,
          validateStorePayload: validateStorePayload,
          validateMediaRecord: validateMediaRecord,
        }));
      } catch (err) {
        console.warn('import failed', err);
        hideToast(_TOAST_ID);
        _showToast('Import failed: ' + (err && err.message ? err.message : 'invalid file'));
      }
    };
    // Android v3 streaming import via the native chunked bridge. Native sniffs
    // the magic and returns "v3:<manifest>" (stream the blobs) or "legacy:<json>"
    // (a whole v1/v2 backup → reuse _doImport). For v3, the blobs feed applyV3
    // through an async-generator of {id, meta, blob} entries — the SAME applier
    // the web path uses — so only the SOURCE of the entries differs per platform.
    // BACKUP-STREAMING-PLAN P3.
    const _importV3Android = async () => {
      // 1. SAF source picker (async). Install the ready callback BEFORE launch.
      const ready = await new Promise((resolve) => {
        window.__onV3ImportReady = (status) => { window.__onV3ImportReady = null; resolve(status); };
        PlatformBridge.v3ImportOpen();
      });
      if (ready === 'cancelled') return;                  // user dismissed the picker
      if (ready !== 'ok') { _showToast('Import failed: ' + ready); return; }
      // 2. Open + sniff (native reads the magic, then the manifest OR the whole
      //    legacy file). Close the native stream on every non-v3 / error exit.
      let begin;
      try { begin = PlatformBridge.v3ImportBegin(); }
      catch (e) {
        console.warn('v3 import begin failed', e);
        try { PlatformBridge.v3ImportClose(); } catch (_e) { /* best-effort */ }
        _showToast('Import failed: could not read file.');
        return;
      }
      if (begin.indexOf('error:') === 0) {
        try { PlatformBridge.v3ImportClose(); } catch (_e) { /* best-effort */ }
        if (begin.slice(6) === 'too_large') {
          _showToast('That file is too large to import (over 50 MB). VOTReader backups are normally well under that — is it the right file?');
        } else {
          _showToast('This backup file is corrupt or incomplete and could not be read.');
        }
        return;
      }
      if (begin.indexOf('legacy:') === 0) {
        // Legacy v1/v2 JSON — already fully read by native; route to the v2 applier.
        try { PlatformBridge.v3ImportClose(); } catch (_e) { /* best-effort */ }
        await _doImport(begin.slice(7));
        return;
      }
      if (begin.indexOf('v3:') !== 0) {
        try { PlatformBridge.v3ImportClose(); } catch (_e) { /* best-effort */ }
        _showToast('This file does not look like a VOTReader backup.');
        return;
      }
      // 3. Parse + validate the v3 manifest.
      let manifest;
      try { manifest = JSON.parse(begin.slice(3)); }
      catch (e) {
        console.warn('v3 import manifest parse failed', e);
        try { PlatformBridge.v3ImportClose(); } catch (_e) { /* best-effort */ }
        _showToast('This backup file is corrupt or incomplete and could not be read.');
        return;
      }
      const envelopeErrors = validateImportEnvelope(manifest);
      if (envelopeErrors.length) {
        try { PlatformBridge.v3ImportClose(); } catch (_e) { /* best-effort */ }
        console.warn('import envelope invalid:', envelopeErrors);
        _showToast('This file does not look like a VOTReader backup.');
        return;
      }
      // 4. Stream the media frames as an async-gen of {id, meta, blob}; applyV3
      //    consumes it, reassembling each blob bounded (one frame at a time) from
      //    <=ANDROID_V3_CHUNK base64 chunks. A frame-length / size mismatch or a
      //    truncation throws — applyV3's fail-safe ordering keeps existing media.
      const media = Array.isArray(manifest.media) ? manifest.media : [];
      const entries = (async function* () {
        for (let i = 0; i < media.length; i++) {
          const meta = media[i];
          const sizeStr = PlatformBridge.v3ImportNextBlob();
          if (sizeStr.indexOf('error:') === 0) throw new Error('nextBlob: ' + sizeStr.slice(6));
          const declared = Number(sizeStr);
          if (meta && typeof meta.size === 'number' && meta.size !== declared) {
            throw new Error('size mismatch for ' + meta.id + ' (manifest ' + meta.size + ', frame ' + declared + ')');
          }
          const parts = [];
          let readTotal = 0;
          for (;;) {
            const chunk = PlatformBridge.v3ImportReadChunk(ANDROID_V3_CHUNK);
            if (chunk === '') break;                       // current frame fully read
            if (chunk.indexOf('error:') === 0) throw new Error('readChunk: ' + chunk.slice(6));
            const u8 = _base64ToU8(chunk);
            parts.push(u8);
            readTotal += u8.length;
          }
          if (readTotal !== declared) throw new Error('truncated frame for ' + (meta && meta.id));
          yield {
            id: meta ? meta.id : null,
            meta: meta || null,
            blob: new Blob(parts, { type: (meta && meta.mime) || 'application/octet-stream' }),
          };
        }
      })();
      // 5. Confirm + degraded-guard + apply + reload (shared helper). Close the
      //    native stream no matter what (success, cancel at the confirm, or error).
      try {
        await _confirmDegradeApplyReload(manifest, (storesMap, flagMap) => applyV3(manifest, entries, {
          storesMap: storesMap,
          flagMap: flagMap,
          mediaStore: JournalMediaStore,
          validateStorePayload: validateStorePayload,
        }));
      } catch (e) {
        console.warn('android v3 import failed', e);
        hideToast(_TOAST_ID);
        _showToast('Import failed — the file may be corrupt or incomplete. Please try again.');
      } finally {
        try { PlatformBridge.v3ImportClose(); } catch (_e) { /* best-effort */ }
      }
    };

    // Android: v3 streaming import (native sniffs v3 vs legacy v1/v2).
    if (PlatformBridge.isAndroid) {
      _importV3Android();
      return;
    }

    // Web: pick a File, sniff the first bytes, route a v3 container vs a legacy
    // v1/v2 JSON backup. pickImportFile() opens the picker synchronously in this
    // user gesture (the async IIFE runs sync up to the first await).
    (async () => {
      try {
        const file = await PlatformBridge.pickImportFile();
        if (!file) return; // user cancelled
        const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
        if (isContainerMagic(head)) {
          await _importV3Container(file);
        } else {
          // Legacy JSON. Guard the whole-file text read against a pathological
          // non-backup pick (v3 is the GB-scale path; legacy backups are small).
          if (file.size > 300 * 1024 * 1024) {
            _showToast('That file is too large to be a VOTReader backup.');
            return;
          }
          await _doImport(await file.text());
        }
      } catch (e) {
        console.warn('import failed', e);
        hideToast(_TOAST_ID);
        _showToast('Import failed: ' + (e && e.message ? e.message : 'invalid file'));
      }
    })();
  };

  /**
   * Wrap `indexedDB.deleteDatabase(name)` in a Promise that resolves
   * on success, error, blocked, or timeout. Critical deletes get a
   * longer timeout because hanging on those is worse than hanging
   * on a cache database.
   *
   * @param {string} name
   * @param {boolean} critical
   * @returns {Promise<void>}
   */
  const _deleteIdbDatabase = (name, critical) => new Promise((resolve) => {
    let settled = false;
    const finish = () => { if (!settled) { settled = true; resolve(); } };
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = finish;
      req.onerror = finish;
      req.onblocked = finish; // open connections — our IDBAdapter handles
                              // versionchange but a stuck listener could
                              // block; proceed anyway.
      // Timeout fallback so a stuck deletion doesn't block the UI
      // forever. 3s for user-data DBs, 1s for caches.
      setTimeout(finish, critical ? 3000 : 1000);
    } catch (_e) { finish(); }
  });

  const clearAllPersonalData = async () => {
    try {
      _collectVotKeys().forEach((k) => { try { localStorage.removeItem(k); } catch (_e) { /* localStorage access — disabled / quota / privacy mode non-fatal */ } });
      // W2.4 + W2.4-hotfix: Clear ALL user-data IDB databases. The
      // pre-hotfix version fired deleteDatabase() then reloaded
      // immediately — the deletion is async and the reload raced
      // ahead. If the new page's IDBAdapter.open() beat the
      // deletion, the database survived and "Clear All" silently
      // failed.
      //
      // Fix: await the critical deletions (votreader = 19 stores of
      // user data; vot-journal-media = audio + images) before
      // reload. Each delete has a 3s timeout fallback so a stuck
      // onblocked never hangs the UI; vot-thumbs + vot-search-cache
      // are caches and get a 1s timeout each.
      await Promise.all([
        _deleteIdbDatabase('votreader', true),
        _deleteIdbDatabase('vot-journal-media', true),
        _deleteIdbDatabase('vot-thumbs', false),
        _deleteIdbDatabase('vot-search-cache', false),
      ]);
      alert('All personal data cleared. The app will now reload.');
      window.location.reload();
    } catch (e) {
      console.warn('clear all personal data failed', e);
      alert('Clear failed. See console for details.');
    }
  };

  return (
    <ScreenLayout
      navChildren={
        <>
          <button className="nav-home nav-back-icon" onClick={onBack} title="Back" aria-label="Back">‹</button>
          <HomeBtn />
          <button className="nav-search-btn" onClick={onHistory} title="History" style={{ marginLeft: 'auto' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 .49-5.01" />
            </svg>
          </button>
          <button className="nav-search-btn" onClick={onSearch} title="Search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
          <ThemeBtn theme={theme} onThemeChange={onThemeChange} />
        </>
      }
    >
      <div className="settings-screen">
        <div className="settings-header">
          <div className="settings-eyebrow">VOT Study Bible</div>
          <h1 className="settings-title">Settings</h1>
          <div className="settings-ornament">
            <div className="settings-ornament-line" />
            <div className="settings-ornament-diamond" />
            <div className="settings-ornament-line r" />
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Text & Translation</div>
          <SelectField
            eyebrow="Text & Translation"
            title="Bible Translation"
            label="Bible Translation"
            desc="Verse text for the 66-book reading flow. Section headings stay in place across translations. Does not affect the Matthew Study Bible, which uses its own curated text."
            value={settings.translation || "nkjv"}
            options={TRANSLATION_OPTIONS}
            onChange={(v) => onSetting("translation", v)}
          />
          <SettingsRow
            label="Modern Fonts"
            desc="Use Cinzel headings and EB Garamond body text instead of your device's built-in serif font. The classic look is larger and more familiar; modern is more elegant."
            checked={settings.fontStyle === "modern"}
            onToggle={() => onSetting("fontStyle", settings.fontStyle === "modern" ? "classic" : "modern")}
          />
          <SelectField
            eyebrow="Text & Translation"
            title="Text Size"
            label="Text Size"
            desc="Scale all text larger for easier reading. Affects every screen. Independent of your device's own font-size setting."
            value={settings.fontScale || "1"}
            options={TEXT_SIZE_OPTIONS}
            onChange={(v) => onSetting("fontScale", v)}
          />
          <SettingsRow
            label="Chapter Titles"
            desc="Show the curated chapter title below the chapter number (e.g. 'The Creation', 'The Genealogy of YahuShua'). Applies universally. Tap the title in a chapter for a per-session focus mode."
            checked={settings.showChapterTitle !== false}
            onToggle={() => onToggle("showChapterTitle")}
          />
          <SettingsRow
            label="Section Headings"
            desc="Show inline topic breaks between verses (e.g. 'The Fall', 'The Call of Abraham'). Applies universally. Tap any heading in a chapter for a per-session focus mode."
            checked={settings.showSectionHeadings !== false}
            onToggle={() => onToggle("showSectionHeadings")}
          />
          <SettingsRow
            label="Restored Names"
            desc="Uses the proper Name of The Father (YAHUWAH) and The Son (YahuShua) in chapter titles and section headings — only where the underlying verses bear the Name. Verse text itself is never altered."
            checked={!!settings.restoredNames}
            onToggle={() => onToggle("restoredNames")}
            disabled={settings.showChapterTitle === false && settings.showSectionHeadings === false}
            disabledReason="Turn on Chapter Titles or Section Headings to use Restored Names — the Names only appear in those."
          />
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Reading Experience</div>
          <SelectField
            eyebrow="Reading Experience"
            title="Chapter Arrows"
            label="Chapter & Letter Arrows"
            desc="Where the previous/next arrows live in a chapter or letter view."
            value={settings.arrowLayout || "split"}
            options={ARROW_LAYOUT_OPTIONS}
            onChange={(v) => onSetting("arrowLayout", v)}
          />
          <SelectField
            eyebrow="Reading Experience"
            title="Scripture Browser"
            label="Scripture Browser"
            desc="How books are organized on the Scriptures screen."
            value={settings.scriptureLayout || "genre"}
            options={SCRIPTURE_LAYOUT_OPTIONS}
            onChange={(v) => onSetting("scriptureLayout", v)}
          />
          <SettingsRow
            label="Inline Reference Echoes"
            desc="In the Matthew Study Bible's inline mode, when a reference spans multiple verse ranges (e.g. verses 1-5 and 10-15), show a compact echo pill at the end of each additional range that scrolls back to the full note. Helps you see what references relate to as you read."
            checked={settings.showInlineEchoes !== false}
            onToggle={() => onToggle("showInlineEchoes")}
          />
          <SettingsRow
            label="Scrollbar Content Marker"
            desc="A small notch on the scrollbar showing where the reading content ends and the footnotes or navigation area begins."
            checked={!!settings.showScrollNotch}
            onToggle={() => onToggle("showScrollNotch")}
          />
          <SettingsRow
            label="Reading Position Dot"
            desc="A pulsing gold dot in the upper right that takes you back to where you were last reading."
            checked={settings.showReadingDot}
            onToggle={() => onToggle("showReadingDot")}
          />
          {settings.showReadingDot && (
            <SelectField
              label="Reading Dot Dwell Time"
              desc="How long you must stay on a page before the reading dot updates to that position. Shorter = updates faster; longer = requires more settled reading."
              value={settings.dwellMs || "20000"}
              options={[
                { id: "3000",  label: "3 seconds",  desc: "Updates almost immediately" },
                { id: "5000",  label: "5 seconds",  desc: "Very quick" },
                { id: "10000", label: "10 seconds", desc: "Quick" },
                { id: "15000", label: "15 seconds", desc: "Moderate" },
                { id: "20000", label: "20 seconds", desc: "Standard (default)" },
                { id: "30000", label: "30 seconds", desc: "Relaxed" },
                { id: "45000", label: "45 seconds", desc: "Deliberate" },
                { id: "60000", label: "60 seconds", desc: "Requires a full minute on the page" }
              ]}
              onChange={(v) => onSetting("dwellMs", v)}
            />
          )}
          <SettingsRow
            label="Random Letter Button"
            desc="A breathing dice icon on the home screen that opens a random chapter or letter when tapped."
            checked={settings.showSurpriseButton}
            onToggle={() => onToggle("showSurpriseButton")}
          />
          <SettingsRow
            label="Settings Gear in Top Nav"
            desc="Show the gear icon in the top nav of every reading screen for quick access. When off, Settings is only reachable from the home screen."
            checked={settings.showSettingsGear}
            onToggle={() => onToggle("showSettingsGear")}
          />
          <SettingsRow
            label="History in Top Nav"
            desc="Show the history button (clock icon) in the top nav of chapter and letter views. When off, History is still reachable from the home screen."
            checked={!!settings.historyInNav}
            onToggle={() => onToggle("historyInNav")}
            disabled={settings.historyEnabled === false}
            disabledReason="Turn on History to enable this."
          />
          <SettingsRow
            label="Keep Screen On While Reading"
            desc="Don't let the screen dim or lock while the app is open. Helpful for long reading sessions; turn off to save battery. Has no effect on desktop browsers."
            checked={settings.keepScreenOn !== false}
            onToggle={() => onToggle("keepScreenOn")}
          />
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Tabs, Search & History</div>
          <SettingsRow
            label="Tabs"
            desc="Run up to 999 independent reading places in parallel — flip between a chapter, a letter, a study, and back. All tabs share settings, theme, mark-as-read, history, and reading progress. Disabling preserves all your open tabs — they'll be waiting when you turn it back on."
            checked={!!settings.tabsEnabled}
            onToggle={() => onToggle("tabsEnabled")}
          />
          <SettingsRow
            label="Search"
            desc="Full-text search across all 66 books + Volumes. When off, the search button is hidden everywhere."
            checked={settings.searchEnabled !== false}
            onToggle={() => onToggle("searchEnabled")}
          />
          <SettingsRow
            label="Filter Stop Words in Search"
            desc="On (default): strip filler words (the, is, of, and, this, that, etc.) from queries of 5+ words so results focus on meaningful terms. Off: match every word exactly as typed. Turn off if a search is missing results you know are there — especially with KJV-style phrasing."
            checked={settings.searchUseStopWords !== false}
            onToggle={() => onToggle("searchUseStopWords")}
            disabled={settings.searchEnabled === false}
            disabledReason="Turn on Search to enable this."
          />
          <SettingsRow
            label="Synonym Search"
            desc="On (default): also match scripture synonyms — searching 'mercy' finds 'compassion', 'shepherd' finds 'pastor', 'faith' finds 'belief' and 'trust'. Exact-word matches always rank first. Off: match only the words you type."
            checked={settings.searchSynonyms !== false}
            onToggle={() => onToggle("searchSynonyms")}
            disabled={settings.searchEnabled === false}
            disabledReason="Turn on Search to enable this."
          />
          <SettingsRow
            label="History"
            desc="Keep a running list of chapters and letters you've visited. When off, recording stops and the history button is hidden. Existing history is preserved."
            checked={settings.historyEnabled !== false}
            onToggle={() => onToggle("historyEnabled")}
          />
          <HistoryClearRow historyCount={historyCount} onClearHistory={onClearHistory} />

        </div>

        <div className="settings-section">
          <div className="settings-section-label">A Return to The Garden</div>
          <SelectField
            eyebrow="A Return to The Garden"
            title="Image Quality"
            label="Image Quality"
            desc="Changing this re-downloads images at the selected quality next time you view them."
            value={settings.gardenTier || GARDEN_DEFAULT_TIER}
            options={GARDEN_TIERS.map((t) => ({
              id: t.id,
              label: `${t.label} · ${t.size}`,
              desc: `${t.res} · ${t.desc}`
            }))}
            onChange={(v) => onSetting("gardenTier", v)}
          />
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Your Data</div>
          <div className="settings-row">
            <div className="settings-row-text">
              <div className="settings-row-label">Platform</div>
              <div className="settings-row-desc">{_platformLabel(StorageHealth.getPlatform())}</div>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-text">
              <div className="settings-row-label">Total app data</div>
              <div className="settings-row-desc">{appDataDisplayText}</div>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-text">
              <div className="settings-row-label">Your data</div>
              <div className="settings-row-desc">{userDataDisplayText}</div>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-text">
              <div className="settings-row-label">Protection</div>
              <div className="settings-row-desc">{protectionDisplayText}</div>
            </div>
            {showProtectButton && (
              <button className="settings-clear-btn" onClick={(e) => { e.stopPropagation(); storageInfo.requestPersist(); }}>Protect now</button>
            )}
          </div>
          <div className="settings-row">
            <div className="settings-row-text">
              <div className="settings-row-label">Export Your Data</div>
              <div className="settings-row-desc">Download every note, highlight, notebook, journal entry, bookmark, link, reading-progress mark, history record, open tab, and setting stored on this device as a single JSON file. No credentials or login info — just your data. Save the file anywhere you control.</div>
            </div>
            <button className="settings-clear-btn" onClick={(e) => { e.stopPropagation(); exportPersonalData(); }}>Export</button>
          </div>
          <div className="settings-row">
            <div className="settings-row-text">
              <div className="settings-row-label">Import from Backup</div>
              <div className="settings-row-desc">Restore a previously exported JSON file. Replaces all current personal data on this device with the contents of the file. You will be asked to confirm before anything is overwritten.</div>
            </div>
            <button className="settings-clear-btn" onClick={(e) => { e.stopPropagation(); importPersonalData(); }}>Import</button>
          </div>
          {/* Diagnostic-log status row. Renders only when entries exist
              (Android: native BoundedLogTree merged with the JS DiagnosticLog;
              web: the JS DiagnosticLog). Hidden on a clean session to reduce
              UI noise. */}
          {diagnosticLog.length > 0 && (
            <div className="settings-row">
              <div className="settings-row-text">
                <div className="settings-row-label">Diagnostic Log</div>
                <div className="settings-row-desc">
                  {`${diagnosticLog.length} recent ${diagnosticLog.length === 1 ? 'entry' : 'entries'} captured (warnings, errors, and timings; content URIs and file paths redacted). Included in your next Export. Last entry: ${new Date(diagnosticLog[diagnosticLog.length - 1].t).toLocaleString()}.`}
                </div>
              </div>
            </div>
          )}
          {(() => {
            const closeWipe = () => { setWipeConfirm(false); setWipeText(''); };
            return (
              <>
                <div className="settings-row">
                  <div className="settings-row-text">
                    <div className="settings-row-label">Clear All Personal Data</div>
                    <div className="settings-row-desc">Removes every note, highlight, notebook, journal entry, bookmark, link, reading-progress mark, history record, saved tab, tab thumbnail, and search cache. App settings will reset to defaults. This cannot be undone — export first if you want a backup.</div>
                  </div>
                  <button className="settings-clear-btn danger" onClick={(e) => { e.stopPropagation(); setWipeText(''); setWipeConfirm(true); }}>Clear All My Data</button>
                </div>
                {wipeConfirm && (
                  <div
                    className="note-sheet-overlay"
                    onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) closeWipe(); }}
                  >
                    <div className="note-sheet" onClick={(e) => e.stopPropagation()}>
                      <div className="note-sheet-header">
                        <div className="note-sheet-title">Delete All Personal Data</div>
                      </div>
                      <div style={{ color: "var(--cream)", fontSize: "0.9rem", lineHeight: "1.5", marginBottom: "14px" }}>
                        This permanently erases every note, highlight, notebook, journal entry, bookmark, link, reading-progress mark, history record, saved tab, and the search cache, then resets all settings to defaults.{' '}
                        <strong style={{ color: "#c0392b" }}>This cannot be undone.</strong> Export your data first if you want a backup.
                      </div>
                      <div style={{ color: "var(--cream-muted)", fontSize: "0.78rem", letterSpacing: "0.04em", marginBottom: "8px" }}>
                        Type <strong style={{ color: "var(--gold)", letterSpacing: "0.15em" }}>DELETE</strong> to confirm.
                      </div>
                      <input
                        type="text"
                        value={wipeText}
                        autoFocus
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                        aria-label="Type DELETE to confirm"
                        placeholder="DELETE"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setWipeText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && wipeOk) { closeWipe(); clearAllPersonalData(); } }}
                        style={{
                          width: "100%", boxSizing: "border-box", textAlign: "center",
                          fontFamily: "'Cinzel', serif", fontSize: "1rem", letterSpacing: "0.22em",
                          textTransform: "uppercase", color: "var(--cream)",
                          background: "var(--bg)", border: "1px solid var(--gold-border)",
                          borderRadius: "6px", padding: "0.7rem 0.5rem", outline: "none", marginBottom: "18px"
                        }}
                      />
                      <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                        <button className="settings-clear-btn" onClick={(e) => { e.stopPropagation(); closeWipe(); }}>Cancel</button>
                        <button
                          className="settings-clear-btn danger"
                          disabled={!wipeOk}
                          onClick={(e) => { e.stopPropagation(); if (!wipeOk) return; closeWipe(); clearAllPersonalData(); }}
                        >
                          Delete Everything
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Mark as Read</div>
          <SettingsRow
            label="Mark as Read"
            desc="Chapters and letters you've read past 90% are marked with a checkmark. Progress stops recording when this is off, but what's already saved is kept."
            checked={settings.markAsRead}
            onToggle={() => onToggle("markAsRead")}
          />
          {settings.markAsRead && (
            <div className="progress-table">
              {PROGRESS_GROUPS.map((grp) => {
                const isOpen = openSections.has(grp.id);
                const sRead = sectionRead(grp);
                const sTotal = sectionTotal(grp);
                return (
                  <React.Fragment key={grp.id}>
                    <div
                      className="progress-row"
                      style={{ background: "var(--bg)", cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); toggleSection(grp.id); }}
                    >
                      <span style={{ color: "var(--gold-dim)", fontSize: "0.75rem", minWidth: "0.75rem" }}>
                        {isOpen ? "▾" : "▸"}
                      </span>
                      <span className="progress-row-label" style={{ color: "var(--gold)" }}>{grp.label}</span>
                      <span className="progress-row-tally">{sRead} / {sTotal}</span>
                      <SectionClearBtn
                        label={grp.label}
                        disabled={sRead === 0}
                        onClear={() => sectionBooks(grp).forEach((b) => onClearBook(b.id))}
                      />
                    </div>

                    {isOpen && grp.genres.map((genre) => (
                      <React.Fragment key={genre.label}>
                        <div className="progress-row" style={{ background: "var(--bg2)", paddingTop: "0.45rem", paddingBottom: "0.45rem", paddingLeft: "2rem" }}>
                          <span style={{ fontFamily: "'Cinzel',serif", fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--gold-dim)", flex: 1 }}>
                            {genre.label}
                          </span>
                        </div>

                        {genre.books.map((src) => (
                          <div key={src.id} style={{ paddingLeft: "1rem" }}>
                            <ClearProgressRow
                              label={src.label}
                              total={src.total}
                              count={countFor(src.id)}
                              onClear={() => onClearBook(src.id)}
                            />
                          </div>
                        ))}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                );
              })}
              <div className="progress-divider" />
              <AllProgressClearRow totalRead={totalRead} totalItems={totalItems} onClearAll={onClearAll} />
            </div>
          )}
        </div>
      </div>
    </ScreenLayout>
  );
}
