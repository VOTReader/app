/* ═══════════════════════════════════════════════════════════════════════
   SettingsScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

/* Session-4 — Text Size slider (replaces the WL1 4-step selector; the same
   settings.fontScale key persists the raw --font-scale multiplier as a
   numeric string, so old values "1"/"1.15"/"1.3"/"1.5" remain valid). The
   whole app IS the live preview (the root font-size updates as you drag),
   but the row carries its own preview line so the chosen body size is
   visible right in Settings. Icons + navigation chrome are px-pinned in
   app.css and never scale. */
/* Cap raised 1.6 → 3.0 (2026-08-02, owner: 160% was far too little on PC —
   he resorted to browser ctrl-zoom). Keep in sync with the SEC-3 clamp in
   use-settings.js and the boot-script clamp in index.html. */
function clampFontScale(v) {
  const f = parseFloat(String(v));
  return Number.isFinite(f) ? Math.min(3, Math.max(0.8, f)) : 1;
}

// Set immediately before an import applies; removed only when the apply
// completes (or provably never started). A crash mid-restore leaves it behind,
// and useRestoreGuard turns that into a loud boot prompt. Keep the literal in
// sync with RESTORE_INFLIGHT_KEY in hooks/use-restore-guard.js (classic-script
// seam — no import path from here; the lifecycle tests pin both sides).
const RESTORE_INFLIGHT_KEY = 'vot-restore-inflight';

// Android's native import refuses a v3 manifest over MAX_V3_MANIFEST_SIZE
// (16 MiB, StorageManager.kt). Warn at EXPORT time — while the data still
// lives on this device — once the manifest crosses 75% of that, so an
// unrestorable-on-phone backup is never first discovered on a wiped phone.
// ~12 MiB of typed JSON is implausible for one human; this is a tripwire.
const MANIFEST_WARN_BYTES = 12 * 1024 * 1024;
const MANIFEST_MAX_BYTES = 16 * 1024 * 1024;

/**
 * The toast after a backup is written. `problems` (ok:true, from
 * buildV3Manifest) names the stores whose newest change never reached disk —
 * a failed IDB put, or hydration still 'degraded'. The file itself is real and
 * complete apart from those, so the reader gets a count and a reason instead
 * of a flat "Backup saved." that overstates it or an abort that leaves them
 * with nothing (storage-backup-2 follow-up). The store ids stay in the console
 * warning backup.js already emits; a count is what the reader can act on.
 * Sticky (duration 0) whenever there is anything to read.
 * @param {string[]|undefined} problems
 * @param {boolean} nearLimit
 * @returns {{ text: string, sticky: boolean }}
 */
function _savedBackupToast(problems, nearLimit) {
  const n = problems ? problems.length : 0;
  const stale = n
    ? ' — ' + n + ' recent change' + (n === 1 ? '' : 's') + ' may be missing; your device could not finish saving '
      + (n === 1 ? 'it' : 'them') + ' before the backup was taken'
    : '';
  const limit = nearLimit
    ? ' Note: this backup is nearing the Android import size limit — it may soon fail to restore on a phone (desktop import is unaffected).'
    : '';
  return { text: 'Backup saved' + stale + '.' + limit, sticky: !!(n || nearLimit) };
}

function TextSizeSliderRow({ value, onChange }) {
  const v = clampFontScale(value);
  const pct = Math.round(v * 100);
  return (
    <div className="settings-row">
      <div className="settings-row-head">
        <span className="settings-row-label">Text Size</span>
        <span className="settings-row-grow" />
        <span className="settings-row-value">{pct === 100 ? "Standard" : pct + "%"}</span>
      </div>
      <div className="txtsize-controls">
        <input
          type="range"
          className="txtsize-slider"
          min="0.8"
          max="3"
          step="0.05"
          value={v}
          onChange={(e) => onChange(String(parseFloat(e.target.value)))}
          aria-label="Text size"
        />
        <span className="txtsize-value">{pct}%</span>
        <button
          type="button"
          className="txtsize-reset"
          disabled={pct === 100}
          onClick={() => onChange("1")}
        >Reset</button>
      </div>
      <div className="txtsize-preview">
        “Your word is a lamp to my feet and a light to my path.”
      </div>
      <div className="settings-row-desc">
        Slide to shrink or enlarge reading text anywhere in the app. Icons and
        navigation stay the same size. Independent of your device’s own
        font-size setting.
      </div>
    </div>
  );
}

/* Auto-scroll speed. Stored in LINES PER MINUTE, not px/second: the Text
   Size slider spans 80–300%, and a px/s speed would silently change reading
   pace by several× when the reader resizes text. The controller derives px
   from a measured line height, so this number means the same thing at every
   text size. A words/min figure is deliberately NOT offered here: it depends
   on how many words a line actually holds, which nothing on this screen can
   know. The reading pill measures that from the page in front of the reader
   and shows the real number there. */
function AutoScrollDwellRow({ value, onChange }) {
  const ms = clampEndDwell(value);
  const secs = Math.round(ms / 100) / 10;
  return (
    <div className="settings-row">
      <div className="settings-row-head">
        <span className="settings-row-label">Auto-Continue Pause</span>
        <span className="settings-row-grow" />
        <span className="settings-row-value">{secs === 0 ? 'None' : secs + 's'}</span>
      </div>
      <div className="txtsize-controls">
        <input
          type="range"
          className="txtsize-slider"
          min="0"
          max="15000"
          step="500"
          value={ms}
          onChange={(e) => onChange(String(clampEndDwell(e.target.value)))}
          aria-label="Pause before continuing to the next page, in seconds"
        />
        <span className="txtsize-value">{secs === 0 ? '0s' : secs + 's'}</span>
        <button
          type="button"
          className="txtsize-reset"
          disabled={ms === 2500}
          onClick={() => onChange('2500')}
        >Reset</button>
      </div>
      <div className="settings-row-desc">
        How long to wait at the end of the text before moving to the next page.
        The countdown stays visible on the pill the whole time, and tapping
        Cancel stops it. The pill’s ± adjust this too — even mid-countdown.
        Very short pages hold a little longer than this so a run of brief
        entries can’t flick past.
      </div>
    </div>
  );
}

function AutoScrollSpeedRow({ value, onChange }) {
  const v = clampLpm(value);
  return (
    <div className="settings-row">
      <div className="settings-row-head">
        <span className="settings-row-label">Scroll Speed</span>
        <span className="settings-row-grow" />
        <span className="settings-row-value">{v} lines/min</span>
      </div>
      <div className="txtsize-controls">
        <input
          type="range"
          className="txtsize-slider"
          min="4"
          max="40"
          step="1"
          value={v}
          onChange={(e) => onChange(String(clampLpm(e.target.value)))}
          aria-label="Auto-scroll speed in lines per minute"
        />
        <span className="txtsize-value">{v}/min</span>
        <button
          type="button"
          className="txtsize-reset"
          disabled={v === 16}
          onClick={() => onChange('16')}
        >Reset</button>
      </div>
      <div className="settings-row-desc">
        How fast the page moves on its own. The ± buttons on the reading
        pill adjust this too, without leaving the page — and the pill shows
        your words per minute, measured from the page you are on.
      </div>
    </div>
  );
}

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

/* NavChip — compact pill toggle for the Top-Nav Buttons group. */
function NavChip({ label, checked, onToggle, disabled = false }) {
  return (
    <label className={"settings-chip" + (disabled ? " settings-row-disabled" : "")}>
      <span className="settings-chip-label">{label}</span>
      <span className="settings-toggle">
        {/* P1-9: same switch contract as SettingsRow — the chip label IS
            inside the wrapping <label> so the name resolved, but explicit
            aria-label + role="switch" keeps every toggle in the app on one
            announced pattern ("<name>, switch, on/off"). */}
        <input type="checkbox" role="switch" checked={checked} aria-checked={!!checked} aria-label={label} disabled={!!disabled} onChange={disabled ? undefined : onToggle} />
        <span className="settings-toggle-track" />
        <span className="settings-toggle-thumb" />
      </span>
    </label>
  );
}

/* SettingsGroup — collapsible section shell (Settings redesign 2026-07-31).
   Every section is an accordion group: a tappable folio header (icon, Cinzel
   label + one-line plain-language summary + chevron) over an unmounted-
   while-closed body. Unmounted, not hidden — the auto-scroll disclosure
   discipline: closed content is out of tab order and screen-reader order,
   and the screen opens as a compact 8-line overview instead of a wall.
   Module scope so React identity is stable across SettingsScreen renders. */
function SettingsGroupIcon({ sectionId }) {
  const paths = {
    appearance: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.5 5.5 7 7M17 17l1.5 1.5M18.5 5.5 17 7M7 17l-1.5 1.5" /></>,
    reading: <><path d="M4.5 5.5c2.3-1 4.7-.8 7.5.7v12.2c-2.8-1.5-5.2-1.7-7.5-.7z" /><path d="M19.5 5.5c-2.3-1-4.7-.8-7.5.7v12.2c2.8-1.5 5.2-1.7 7.5-.7z" /><path d="M12 6.2v12.2" /></>,
    listening: <><path d="M5 9.5a7 7 0 0 1 14 0v2.3a2.3 2.3 0 0 1-2.3 2.3H15v-5h1.4a4.4 4.4 0 0 0-8.8 0H9v5H7.3A2.3 2.3 0 0 1 5 11.8z" /><path d="M15 14.1c-.4 2.5-1.5 3.8-3.3 3.8h-1.2" /></>,
    autoscroll: <><path d="M12 4v16M7.5 8.5 12 4l4.5 4.5M7.5 15.5 12 20l4.5-4.5" /></>,
    topnav: <><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="M7 9h3M14 9h3M7 14h3M14 14h3" /></>,
    features: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4M8.5 11h5M11 8.5v5" /></>,
    garden: <><path d="M4 19c3.8-5.4 7-8.1 10.2-8.1 2.1 0 3.9 1 5.8 3.1" /><path d="M5 17.5C4.3 12 6.9 7.7 12.5 5c.6 3.2-.3 5.7-2.7 7.5" /><path d="M4 20h16" /></>,
    data: <><path d="M5 5.5h14v13H5z" /><path d="M8 9h8M8 12h8M8 15h5" /></>,
    progress: <><circle cx="12" cy="12" r="8.5" /><path d="m8 12 2.6 2.7L16.5 9" /></>,
    help: <><circle cx="12" cy="12" r="8.5" /><path d="M9.4 9.6a2.6 2.6 0 1 1 3.8 2.3c-.8.4-1.2 1-1.2 1.9" /><path d="M12 17h.01" /></>,
  };
  return (
    <span className="settings-group-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        {paths[sectionId] || paths.appearance}
      </svg>
    </span>
  );
}

function SettingsGroup({ sectionId = 'settings', label, sub, open, onToggle, hidden = false, children = null }) {
  if (hidden) return null;
  return (
    <section className={'settings-section' + (open ? ' open' : '')} data-settings-group={sectionId}>
      <button type="button" className="settings-group-head" aria-expanded={open} aria-controls={'settings-group-' + sectionId} onClick={onToggle}>
        <SettingsGroupIcon sectionId={sectionId} />
        <span className="settings-group-titles">
          <span className="settings-section-label">{label}</span>
          {sub && <span className="settings-group-sub">{sub}</span>}
        </span>
        <span className={'settings-group-chevron' + (open ? ' open' : '')} aria-hidden="true">
          <svg viewBox="0 0 16 16" focusable="false"><path d="m3 6 5 5 5-5" /></svg>
        </span>
      </button>
      {open && <div className="settings-group-body" id={'settings-group-' + sectionId}>{children}</div>}
    </section>
  );
}

/* AudioRateRow — Listening → Default Speed.
   ═══════════════════════════════════════════════════════════════════════
   The one settings row with NO settings key. Playback speed has been owned
   by AudioLibraryStore.rate since the listening desk shipped: the desk
   writes it, the player rehydrates from it at every track start, backup
   carries it, and normalizeAudioRate snaps imported values onto the closed
   AUDIO_PLAYBACK_RATES set. A settings.audioRate twin would be a second
   truth needing a sync rule in both directions — so this row reads and
   writes the store itself.

   The write goes through AudioPlayer.setPlaybackRate where the player
   exists: that call persists to this same store AND retimes whatever is
   playing right now (setting only the store would leave a live recording
   at the old speed until the next track). With no player module loaded,
   the store write alone is the whole job.

   Module scope so React identity is stable across SettingsScreen renders. */
function AudioRateRow() {
  const store = /** @type {any} */ (globalThis).AudioLibraryStore;
  // Re-render when the desk (or an import) changes the rate behind us.
  React.useSyncExternalStore(
    React.useCallback((cb) => (store && typeof store.subscribe === 'function') ? store.subscribe(cb) : () => {}, [store]),
    () => (store && typeof store.getVersion === 'function') ? store.getVersion() : 0
  );
  const rates = /** @type {number[]} */ (/** @type {any} */ (globalThis).AUDIO_PLAYBACK_RATES) || [];
  // No store (or no rate registry) = nothing honest to show or write.
  if (!store || typeof store.getPlaybackRate !== 'function' || rates.length === 0) return null;
  const current = store.getPlaybackRate();
  return (
    <SelectField
      eyebrow="Listening"
      title="Default Speed"
      label="Default Speed"
      desc="How fast recordings play when you start one. The listening desk can still change speed for what is playing; whatever you leave it on becomes this setting, because both are the same preference."
      value={String(current)}
      options={rates.map((rate) => ({
        id: String(rate),
        label: rate + '×',
        desc: rate === 1 ? 'Normal speed' : rate < 1 ? 'Slower than recorded' : 'Faster than recorded',
      }))}
      onChange={(v) => {
        const rate = Number(v);
        const player = /** @type {any} */ (globalThis).AudioPlayer;
        if (player && typeof player.setPlaybackRate === 'function') player.setPlaybackRate(rate);
        else if (typeof store.setPlaybackRate === 'function') store.setPlaybackRate(rate);
      }}
    />
  );
}

/* DataInfoRow — compact label + value (+ optional action button) for "Your Data". */
function DataInfoRow({ label, value = null, children = null }) {
  return (
    <div className="settings-row">
      <div className="settings-row-head">
        <span className="settings-row-label">{label}</span>
        <span className="settings-row-grow" />
        {children}
      </div>
      {value != null && value !== '' && <div className="settings-data-value">{value}</div>}
    </div>
  );
}

/* StorageTrendValue — BACKLOG [30]. How the reader's own data has grown,
   from the samples recorded on each Settings visit (utils/user-data-size.js).

   The SENTENCE is the feature; the bars are decoration. A sparkline scaled
   to its own max flattens exactly the case that matters (steady slow growth
   looks identical to a spike), and it is unreadable to a screen reader — so
   the trend is stated in words first, the bars are aria-hidden, and the
   per-sample figures are exposed to assistive tech as an sr-only list.

   Day one shows text only: a single bar is noise, and a one-point line
   draws nothing. */
function StorageTrendValue({ samples }) {
  if (!samples || samples.length === 0) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const delta = last.b - first.b;
  const sentence = samples.length === 1
    ? `First measurement recorded — ${formatBytes(last.b)}. The trend appears the next day you open Settings.`
    : `Your data has ${delta > 0 ? 'grown' : delta < 0 ? 'shrunk' : 'stayed level'}${delta === 0 ? '' : ' by ' + formatBytes(Math.abs(delta))} across ${samples.length} measurements since ${first.d} — now ${formatBytes(last.b)}.`;
  const max = samples.reduce((m, s) => (s.b > m ? s.b : m), 0);
  return (
    <div className="settings-trend" role="group" aria-label="Your data size over time">
      <span>{sentence}</span>
      {samples.length > 1 && (
        <>
          <span className="sr-only">{samples.map((s) => `${s.d}: ${formatBytes(s.b)}`).join('. ')}</span>
          <div className="settings-trend-bars" aria-hidden="true">
            {samples.map((s) => (
              <div key={s.d} className="settings-trend-bar"
                style={max > 0 ? { height: Math.max(2, Math.round((s.b / max) * 24)) + 'px' } : undefined} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* DataActionRow — label + ⓘ-revealed description + action button. */
function DataActionRow({ label, desc = null, children = null, className = '' }) {
  const [showDesc, setShowDesc] = React.useState(false);
  return (
    <div className={'settings-row' + (className ? ' ' + className : '')}>
      <div className="settings-row-head">
        <span className="settings-row-label">{label}</span>
        {desc && (
          <button
            type="button"
            className="settings-info-btn"
            aria-label={(showDesc ? 'Hide description for ' : 'Show description for ') + label}
            aria-expanded={showDesc}
            onClick={(e) => { e.stopPropagation(); setShowDesc((v) => !v); }}
          >i</button>
        )}
        <span className="settings-row-grow" />
        {children}
      </div>
      {showDesc && desc && <div className="settings-row-desc">{desc}</div>}
    </div>
  );
}

/* TranslationInfoDesc — the Bible Translation row's ⓘ content: the base
   sentence, then the Restored-Name editions' reasoning laid out concisely,
   then the AI-assistance disclaimer (owner directive 2026-07-12). The full
   evidence trail and the generator live in RESTORED-NAMES-PLAN.txt /
   tools/gen-restored-nt.mjs — this block is the reader-facing summary. */
function TranslationInfoDesc() {
  return (
    <>
      Verse text for the 66-book reading flow. Section headings stay in place
      across translations. Does not affect the Matthew Study Bible, which uses
      its own curated text.
      <p>
        <strong>NKJV-R / KJV-R — the Restored Name editions.</strong> “His name
        is YahuShua HaMashiach” (“Death and Deliverance”; “Proclaim The Name of
        The Lord”). These editions restore the Name across the New Testament —
        1,212 NKJV and 1,217 KJV verses, each checked against the Textus
        Receptus, the Greek text behind both versions. The Old Testament is not
        yet restored.
      </p>
      <ul>
        <li>Jesus → YahuShua, “YAH Is Salvation” (Zechariah 6:11). The naming
        verses and the cross inscription keep their capitals: YAHUSHUA
        (Matthew 1:21; John 19:19).</li>
        <li>Jesus Christ and Christ Jesus → YahuShua HaMashiach — always in the
        commanded order of the Name.</li>
        <li>Christ standing alone → HaMashiach. “Ha” is Hebrew for “the,” so
        “the Christ” becomes simply HaMashiach (Matthew 16:16).</li>
        <li>Hebrew never puts “Ha” on a possessed title: “His Mashiach”
        (Acts 4:26), “the Lord’s Mashiach” (Luke 2:26), “called Mashiach”
        (Matthew 1:16), “both Lord and Mashiach” (Acts 2:36).</li>
        <li>“False christs” becomes “false messiahs” — a generic plural, not
        His title. “Antichrist” and “Christian” are unchanged.</li>
        <li>John’s translation notes render the meaning, “the Anointed,” so
        they don’t repeat themselves (John 1:41; 4:25).</li>
        <li>Other bearers of the name are untouched — Bar-Jesus (Acts 13:6),
        Jesus called Justus (Colossians 4:11) — and the KJV’s two Joshua verses
        (Acts 7:45; Hebrews 4:8) now read “Joshua,” as in the NKJV.</li>
      </ul>
      <p>
        <strong>Please note:</strong> the Restored Name editions were prepared
        with AI assistance (Claude Fable 5, 2026). Every change was
        rule-generated and machine-checked against the Greek, but errors are
        possible — where a rendering matters, compare the base NKJV or KJV.
      </p>
    </>
  );
}

function SectionClearBtn({ label, disabled, onClear }) {
  const [confirming, setConfirming] = React.useState(false);
  if (confirming) {
    return (
      <ConfirmStrip
        question={`Clear read marks and saved positions in "${label}"?`}
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

function AllProgressClearRow({ totalRead, totalItems, hasPartial, onClearAll }) {
  const [confirming, setConfirming] = React.useState(false);
  return (
    <>
      <div className="progress-row total-row">
        <span className="progress-row-label">All Scriptures</span>
        <span className="progress-row-tally">{totalRead} / {totalItems}</span>
        {!confirming && (
          <button
            className="settings-clear-btn"
            disabled={totalRead === 0 && !hasPartial}
            onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
          >Clear All</button>
        )}
      </div>
      {confirming && (
        <ConfirmStrip
          question="Clear all read marks and saved positions? Reading totals and streaks are kept."
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

/* The Android v3 streaming backup DRIVER (chunk size + base64 helpers + the
   export/import loops) lives in utils/backup-android.js — a covered, unit-tested
   module (TEST-1). The functions arrive here as globals via _entry-d.js. */

// Search groups by the reader's vocabulary, including controls hidden behind
// dependencies. A match opens its group; dependent rows still obey their toggles.
const SETTINGS_TOPICS = {
  appearance: 'appearance theme light dark text size font typeface',
  reading: 'reading bible translation chapter titles section headings restored names chapter letter arrows scripture browser inline reference echoes scrollbar content marker position dot streak dwell time random letter button surprise keep screen on double tap click fullscreen',
  listening: 'listening bible letter audio voice speed rate read along highlight playback follow',
  autoscroll: 'auto scroll hands free reading speed continue pause',
  topnav: 'top nav buttons icons settings gear history theme bookmark',
  features: 'search synonyms synonym filter stop words tabs history',
  garden: 'a return to the garden image quality pictures',
  data: 'your data backup export import restore verify storage privacy diagnostic diagnostics log app version updates clear delete reset platform total growth protection',
  progress: 'mark as read progress book reading clear',
  // The tour's re-entry (Settings › Help › Show me around). Every group the screen renders needs a
  // row here: matchesGroup dereferences SETTINGS_TOPICS[id] for the first typed character, and a
  // group without one crashed the screen (2026-09-04, the Help group meeting this table).
  help: 'help tour show me around guide about welcome',
};

export function SettingsScreen({ settings, onToggle, onSetting, onBack, onSearch, onHistory, theme, onThemeChange, readItems, onClearBook, onClearAll, onClearHistory, historyCount }) {
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof window.__bibleCorpus !== 'undefined') ? window.__bibleCorpus.subscribe(cb) : () => {}, []),
    () => (typeof window.__bibleCorpus !== 'undefined') ? window.__bibleCorpus.getVersion() : 0
  );
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof window.__votCorpus !== 'undefined') ? window.__votCorpus.subscribe(cb) : () => {}, []),
    () => (typeof window.__votCorpus !== 'undefined') ? window.__votCorpus.getVersion() : 0
  );
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof ReadingStatsStore !== 'undefined') ? ReadingStatsStore.subscribe(cb) : () => {}, []),
    () => (typeof ReadingStatsStore !== 'undefined') ? ReadingStatsStore.getVersion() : 0
  );
  const [openSections, setOpenSections] = React.useState(new Set());
  // Accordion state for the top-level setting GROUPS (redesign 2026-07-31).
  // All collapsed on entry — the screen reads as a scannable table of
  // contents; session-local on purpose (a fresh visit starts compact).
  const [openGroups, setOpenGroups] = React.useState(() => new Set());
  const [settingsQuery, setSettingsQuery] = React.useState('');
  const settingsFindRef = React.useRef(null);
  const [closedMatches, setClosedMatches] = React.useState(() => new Set());
  const queryWords = settingsQuery.toLowerCase().trim().split(/[\s-]+/).filter(Boolean);
  const searching = queryWords.length > 0;
  const matchesGroup = (id) => queryWords.every((word) => SETTINGS_TOPICS[id].includes(word));
  const groupOpen = (id) => searching ? matchesGroup(id) && !closedMatches.has(id) : openGroups.has(id);
  const toggleGroup = (id) => (searching ? setClosedMatches : setOpenGroups)((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const groupProps = (id) => ({ sectionId: id, open: groupOpen(id), hidden: !matchesGroup(id), onToggle: () => toggleGroup(id) });
  const changeSettingsQuery = (value) => { setSettingsQuery(value); setClosedMatches(new Set()); };
  const matchingCount = Object.keys(SETTINGS_TOPICS).filter(matchesGroup).length;
  const progressOpen = groupOpen('progress');
  // Only the progress table needs the corpora. Changing a font or exporting
  // a backup must not parse the whole library as a side effect.
  React.useEffect(() => {
    if (!progressOpen) return;
    for (const load of [window.__loadBibleCorpus, window.__loadVotCorpus]) {
      if (typeof load === 'function') load().catch((e) => console.warn('Progress corpus load failed', e));
    }
  }, [progressOpen]);
  // "Show me around" (review-tutorial): when the tour's stop needs a group open
  // (the backup stop rings Export inside Your Data), open it — whether Settings
  // mounted for the stop or was already on screen when the tour started here.
  const _tour = typeof TourController !== 'undefined' ? TourController : null;
  React.useSyncExternalStore(
    React.useCallback((cb) => (_tour ? _tour.subscribe(cb) : () => {}), [_tour]),
    () => (_tour ? _tour.getVersion() : 0)
  );
  const _tourGroup = _tour ? (() => { const t = _tour.getState(); return t.active && t.step && t.step.settingsGroup; })() : null;
  React.useEffect(() => {
    if (_tourGroup) setOpenGroups((prev) => (prev.has(_tourGroup) ? prev : new Set([...prev, _tourGroup])));
  }, [_tourGroup]);

  // W2.5 — navigator.storage estimate + persist. The hook reads once
  // on mount; the derived display strings below pick the right text
  // for each (status, persisted, persistDenied) combination.
  const storageInfo = useStorageInfo();

  // APP VERSION (2026-08-11) — which build is actually running, and is it the
  // newest one published? Added after a long misdiagnosis in which "the cache is
  // stale" and "this was never deployed" were indistinguishable from inside the
  // app, so the wrong fix got attempted repeatedly. `running` comes from the
  // controlling service worker (the only artifact that knows CACHE_VERSION and is
  // not itself inside the hash it is derived from); `server` is a read-only probe
  // of the deployed service-worker.js that installs nothing.
  const [buildInfo, setBuildInfo] = React.useState({ state: 'loading', running: null, server: null });
  const refreshBuildInfo = React.useCallback(async () => {
    setBuildInfo((b) => ({ ...b, state: 'loading' }));
    // typeof guards: these three live in bundle-b and reach this screen (bundle-e)
    // as ambient globals, so they are absent in any host that renders Settings
    // without the stores bundle — the vitest harness does exactly that. An
    // unguarded call throws inside a passive effect, which surfaces as an
    // unhandled test error rather than a failure, i.e. noise that hides real ones.
    const running = (typeof getBuildVersion === 'function') ? await getBuildVersion() : null;
    if (!running) {
      // No service worker to ask: the Android WebView (assets ship inside the APK)
      // or a first visit before the SW has taken control.
      setBuildInfo({ state: 'no-sw', running: null, server: null });
      return;
    }
    const server = (typeof fetchServerBuildVersion === 'function') ? await fetchServerBuildVersion() : null;
    setBuildInfo({ state: 'ok', running, server });
  }, []);
  React.useEffect(() => { refreshBuildInfo(); }, [refreshBuildInfo]);

  const versionDisplayText = (() => {
    if (buildInfo.state === 'loading') return 'Checking…';
    if (buildInfo.state === 'no-sw') {
      return PlatformBridge.isAndroid
        ? 'Installed app build — updates arrive by installing a new APK, not over the web.'
        : 'Not yet managed by the offline service worker on this device.';
    }
    const fmt = (typeof formatBuildVersion === 'function') ? formatBuildVersion : ((s) => String(s || 'unknown'));
    const runningText = fmt(buildInfo.running.cacheVersion)
      + ' · corpus ' + (buildInfo.running.corpusVersion || '?');
    if (!buildInfo.server) return runningText + ' — could not reach the server to compare.';
    if (buildInfo.server.cacheVersion === buildInfo.running.cacheVersion) {
      return runningText + ' — up to date with the published version.';
    }
    return runningText + ' — an update is available ('
      + fmt(buildInfo.server.cacheVersion) + '). Reopen the app to apply it.';
  })();
  const protectionDisplayText = (() => {
    if (storageInfo.status === 'loading') return 'Checking…';
    if (storageInfo.status === 'unavailable') return 'Persistence API unavailable on this browser.';
    if (storageInfo.persisted) return 'Active — your data is protected from automatic browser cleanup.';
    if (storageInfo.persistDenied) return 'Browser denied protection. Export regularly as a backup.';
    if (storageInfo.persistable) return 'Not active — tap "Protect now" to request protection from automatic browser cleanup.';
    // Not persisted, but there's no user-actionable persistence lever here
    // (installed app / Android APK / a Chromium browser that auto-decided /
    // Safari — whose real safeguard is "Add to Home Screen"). The data still
    // lives on this device; the honest guidance is to keep a backup.
    return 'Your data is saved on this device. Export a backup regularly to keep it safe.';
  })();
  const showProtectButton = storageInfo.status === 'ready' && storageInfo.persistable;

  // "Your data" = the bytes of the user's OWN content (the set Export
  // backs up): annotations, notes, journal + media, bookmarks, links,
  // notebooks, marked-as-read, history, saved tabs/settings. Measured
  // separately from the OS-level "total app data" (storageInfo.usage),
  // which also counts the regenerable corpus/search/thumbnail caches and
  // the Garden images. Garden is app data, never user data. Re-measured
  // when the screen mounts (cheap — JSON byte-length + blob sizes).
  const [userData, setUserData] = React.useState(/** @type {null | {total:number,structured:number,media:number,mediaCount:number}} */ (null));
  // BACKLOG [30]: the same measurement also feeds the growth series. Sampling
  // rides this existing effect deliberately — one sample per Settings mount,
  // never a timer and never at boot (this screen is in the lazy bundle-e), so
  // the trend costs nothing beyond what the "Your data" row already spends.
  const [dataSamples, setDataSamples] = React.useState(/** @type {Array<{d:string,b:number}>} */ ([]));
  React.useEffect(() => {
    let alive = true;
    measureUserData().then((r) => {
      if (!alive) return;
      setUserData(r);
      return recordUserDataSample(r.total).then((series) => { if (alive) setDataSamples(series); });
    }).catch(() => {});
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
  // Verify-a-Backup result — { message, level:'ok'|'warn' } | null. Rendered
  // as a row under the Verify button; screen-local (clears on nav away).
  const [verifyReport, setVerifyReport] = React.useState(
    /** @type {null | { message: string, level: 'ok' | 'warn' }} */ (null)
  );
  // Android's backup bridge completes through one global callback per picker.
  // Keep Export / Import / Verify mutually exclusive so a rapid second tap
  // cannot replace the callback or consume the first operation's native stream.
  const backupBusyRef = React.useRef(false);
  const backupReloadPendingRef = React.useRef(false);
  const [backupBusy, setBackupBusy] = React.useState(false);
  const _runBackupOperation = async (operation) => {
    if (backupBusyRef.current) return;
    backupBusyRef.current = true;
    backupReloadPendingRef.current = false;
    setBackupBusy(true);
    try { await operation(); }
    finally {
      // A completed import deliberately keeps the lock until its scheduled
      // reload. Re-enabling controls in that 0.6-5s window permits a second
      // picker/stream to start against data that is about to be torn down.
      if (!backupReloadPendingRef.current) {
        backupBusyRef.current = false;
        setBackupBusy(false);
      }
    }
  };
  // Export / Verify / Clear additionally hold the CROSS-TAB Web Lock the apply
  // paths take internally, so a second PWA tab can't export/verify/wipe against
  // a half-imported state. Import must NOT go through this wrapper — Web Locks
  // are not reentrant, and applyV3/applyImportPayload acquire the lock themselves.
  const _runLockedBackupOperation = (operation) => _runBackupOperation(async () => {
    try { await withBackupLock(operation); }
    catch (e) {
      if (/already in progress/.test(String(e && e.message))) {
        _showToast('Another backup operation is running in a different tab. Please wait for it to finish.');
        return;
      }
      throw e;
    }
  });
  // Wave-0 (dual-dismissal fix): the type-DELETE wipe dialog was registered
  // in NEITHER dismissal system, so hardware Back / Escape navigated away
  // underneath it (and left it rendering over the previous screen). It now
  // self-registers with the modal registry — the same pattern NoteSheet /
  // ConfirmStrip use — so the single dispatcher dismisses the DIALOG first.
  // The legacy window.__closeSheet system is deliberately NOT involved.
  const closeWipe = () => { setWipeConfirm(false); setWipeText(''); };
  useModalRegistry({ id: 'settings-wipe-dialog', dismiss: closeWipe, active: wipeConfirm });
  // [13] focus traps: Tab must not walk out of an open dialog into the
  // inert page behind it. One trap per dialog, engaged by the same flag
  // that renders it; the ref goes on the dialog's root element.
  const wipeTrapRef = useFocusTrap(wipeConfirm);
  // Wave-0: the import-overwrite confirm (formerly the app's last native
  // window.confirm) is an in-app sheet driven by this state — see
  // _confirmDegradeApplyReload. Registered for the same Back/Escape reason.
  const [importConfirm, setImportConfirm] = React.useState(null);
  // The confirm sheet is FIRE-AND-AWAIT: _confirmDegradeApplyReload shows it and
  // AWAITS the user's decision through this resolver, so its caller's cleanup —
  // the Android native v3ImportClose in _importV3Android's finally — brackets
  // the WHOLE import instead of firing the instant the dialog appears. That
  // premature close nulled the live native import stream (regression after the
  // blocking window.confirm became this async sheet), so the post-confirm apply
  // hit "no_session" and hung on "Importing… please wait". Settling from ANY
  // dismiss path (Import / Cancel / backdrop / Back / Escape) resolves it once.
  const importConfirmResolveRef = React.useRef(null);
  const _settleImportConfirm = React.useCallback((confirmed) => {
    setImportConfirm(null);
    const resolve = importConfirmResolveRef.current;
    importConfirmResolveRef.current = null;
    if (resolve) resolve(confirmed);
  }, []);
  // Unmounting mid-confirm must not strand the promise (its caller closes the
  // native import stream in a finally) — settle it false so cleanup still runs.
  React.useEffect(() => () => {
    const resolve = importConfirmResolveRef.current;
    importConfirmResolveRef.current = null;
    if (resolve) resolve(false);
  }, []);
  useModalRegistry({ id: 'settings-import-confirm', dismiss: () => _settleImportConfirm(false), active: importConfirm != null });
  const importTrapRef = useFocusTrap(importConfirm != null);
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

  /* The Mark-as-Read group table + per-source read counting live in
     utils/progress-stats.js (a bundle-d window global, shared with the
     My Progress dashboard). buildProgressGroups() returns [] until the
     BOOKS + VOT corpora are loaded — the subscriptions above re-render
     this screen when they land. */
  const PROGRESS_GROUPS = buildProgressGroups();
  const countFor = (bid) => countReadFor(readItems, bid);
  const frontierData = (typeof ReadingStatsStore !== 'undefined' && typeof ReadingStatsStore.get === 'function')
    ? ReadingStatsStore.get()
    : null;
  const frontierKeys = Object.keys((frontierData && frontierData.progress) || {})
    .filter((key) => key.indexOf(`${READ_VERSION_ID}:`) === 0);
  const hasFrontierFor = (bid) => frontierKeys.some((key) => key.indexOf(`${READ_VERSION_ID}:${bid}:`) === 0);
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
  // SEC1: route through textContent (opts.text), NOT innerHTML. Every caller here
  // passes a runtime-built status string (e.g. 'Import failed: ' + err.message,
  // 'could not read: ' + built.problems.join(', ')). None is trusted static markup,
  // so the innerHTML path was a latent stored-XSS shape (harmless today, but the
  // day a filename / journal title / file fragment is appended it becomes live).
  const _showToast = (msg, durationMs) => showToast({
    id: _TOAST_ID, className: 'vot-toast', text: msg, durationMs: durationMs == null ? 3500 : durationMs,
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
  const _exportableStores = () => {
    /** @type {Record<string, { store: any, method: string }>} */
    const stores = {
    'vot-annotations':         { store: AnnotationStore,      method: 'replaceAll' },
    'vot-notes':               { store: NoteStore,            method: 'replaceAll' },
    'vot-bookmarks':           { store: BookmarkStore,        method: 'replaceAll' },
    'vot-links':               { store: LinkStore,            method: 'replaceAll' },
    'vot-notebooks':           { store: NotebookStore,        method: 'replaceAll' },
    'vot-journal':             { store: JournalStore,         method: 'replaceAll' },
    'vot-journal-notebooks':   { store: JournalNotebookStore, method: 'replaceAll' },
    'vot-journal-index':       { store: JournalIndexStore,    method: 'replaceAll' },
    'vot-journal-stats':       { store: JournalStatsStore,    method: 'replaceAll' },
    'vot-reading-streak':      { store: ReadingStreakStore,   method: 'replaceAll' },
    'vot-reading-stats':       { store: ReadingStatsStore,    method: 'replaceAll' },
    'vot-garden-pos':          { store: GardenPosStore,       method: 'replaceAll' },
    'vot-recent-nav':          { store: RecentNavStore,       method: 'replaceAll' },
    'vot-history':             { store: HistoryStore,         method: 'setAll' },
    'vot-prophecy-cards':      { store: ProphecyCardsStore,   method: 'setAll' },
    'vot-home-order':          { store: HomeOrderStore,       method: 'set' },
    'vot-library-order':       { store: LibraryOrderStore,    method: 'set' },
    'vot-note-default':        { store: NoteDefaultStore,     method: 'replaceAll' },
    'vot-state':               { store: StateStore,           method: 'set' },
    };

    // AudioLibraryStore belongs to bundle-b. Resolve its runtime bridge only
    // when that bundle is present, so isolated UI/admin harnesses remain safe.
    const audioLibraryStore = /** @type {any} */ (globalThis).AudioLibraryStore;
    if (audioLibraryStore) {
      stores['vot-audio-library'] = { store: audioLibraryStore, method: 'replaceAll' };
    }
    // Same bundle, same guard — where the reader is inside each recording.
    const audioPositionsStore = /** @type {any} */ (globalThis).AudioPositionsStore;
    if (audioPositionsStore) {
      stores['vot-audio-positions'] = { store: audioPositionsStore, method: 'replaceAll' };
    }
    return stores;
  };
  /**
   * Boolean flag stores keyed by IDB store name. Imported via set()
   * when value is truthy; clear() otherwise.
   */
  const _flagStores = () => ({
    'vot-welcomed':              WelcomedFlagStore,
    'vot-about-seen':            AboutSeenFlagStore,
    'vot-garden-warning-acked':  GardenWarningFlagStore,
    // [D2]: the fourth flag has always existed (IDB v7) and was the only one
    // the backup skipped, so a restore re-pitched the annotation coach-mark
    // at a reader who had dismissed it.
    'vot-ann-hint-dismissed':    AnnHintDismissedFlagStore,
    // review-tutorial: "Show me around" done/skipped/never — carried so a restore does not re-pitch the strip.
    'vot-tour-done':             TourDoneFlagStore,
  });

  // Web export uses the v3 STREAMING container (GB-scale — never holds the whole
  // payload in memory; one blob at a time). Android keeps the proven v2 path
  // until its native streaming lands (P3), so the only-backup mechanism is never
  // broken mid-port. BACKUP-STREAMING-PLAN.txt.
  const _exportV3Web = async () => {
    try {
      _showToast('Preparing export…', 0);
      // U1 + persist-debounce race closer: a vot-state union still inside
      // usePersistedState's 250ms debounce window has NOT initiated a
      // StateStore.set, so the whenSaved() barrier inside buildV3Manifest
      // cannot cover it — it would be missing from the ONLY backup. Flush it
      // synchronously FIRST (no-op when nothing is pending; bridge owned by
      // usePersistedState, contract 5); the barrier then awaits the flushed
      // write before the manifest reads vot-state from IDB.
      if (typeof window.__flushPersistState === 'function') window.__flushPersistState();
      const built = await buildV3Manifest({
        storesMap: _exportableStores(),
        flagMap: _flagStores(),
        idbAdapter: IDBAdapter,
        mediaStore: JournalMediaStore,
        diagnosticLog: diagnosticLog,
      });
      if (!built.ok) {
        hideToast(_TOAST_ID);
        // buildV3Manifest fails LOUD (U6) only on a store or media read that
        // THREW — those bytes really are absent, so abort rather than write a
        // misleading, incomplete backup. A store that merely could not save its
        // newest change still exports and comes back on built.problems below;
        // refusing there would strand the reader in the one state the app tells
        // them to export. (No media-limit case: v3 streams, so no size cap.)
        _showToast('Export aborted — could not read: ' + built.problems.join(', ') + '. Nothing was saved. Please try again; if this repeats, your device storage may be failing.');
        return;
      }
      if (built.manifestBytes > MANIFEST_MAX_BYTES) {
        hideToast(_TOAST_ID);
        _showToast('Export aborted — the backup index is over the 16 MiB restore limit. Nothing was saved. Clear unneeded personal data, then export again.', 0);
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
        const saved = _savedBackupToast(built.problems, built.manifestBytes > MANIFEST_WARN_BYTES);
        if (saved.sticky) _showToast(saved.text, 0); else _showToast(saved.text);
        return true;
      } catch (e) {
        hideToast(_TOAST_ID);
        console.warn('export write failed', e);
        // BAK5: discard the partial write so no truncated .votbak is left behind.
        try { await sink.abort?.(); } catch (_e) { /* best-effort cleanup */ }
        _showToast('Export failed while writing. Please try again.');
      }
    } catch (e) {
      console.warn('export failed', e);
      hideToast(_TOAST_ID);
      // Wave-0: dropped the "See console for details." dev-speak — the detail
      // is in console.warn above; the user gets the actionable version.
      _showToast('Export failed. Please try again.');
    }
  };

  // Android export uses the v3 STREAMING container via the native chunked bridge
  // (Android streams natively rather than via the web codec — see backup-container.js /
  // StorageManager.kt; native owns the framing). buildV3Manifest is SHARED with
  // the web path; only the container WRITE differs. Peak memory is one 512 KB
  // bridge slice, so this scales to whatever the device can store. The streaming
  // loop itself lives in utils/backup-android.js (runV3AndroidExport — TEST-1).
  // BACKUP-STREAMING-PLAN P3.
  const _exportV3Android = async () => {
    try {
      _showToast('Preparing export…', 0);
      // Same U1 + persist-debounce race closer as _exportV3Web: flush any
      // vot-state union still inside usePersistedState's 250ms debounce
      // window BEFORE buildV3Manifest's whenSaved() barrier + IDB read
      // (no-op when nothing is pending; bridge owned by usePersistedState).
      if (typeof window.__flushPersistState === 'function') window.__flushPersistState();
      const built = await buildV3Manifest({
        storesMap: _exportableStores(),
        flagMap: _flagStores(),
        idbAdapter: IDBAdapter,
        mediaStore: JournalMediaStore,
        diagnosticLog: diagnosticLog,
      });
      if (!built.ok) {
        hideToast(_TOAST_ID);
        // Same contract as _exportV3Web: a read that THREW aborts; a store that
        // could not save its newest change still exports and is named on
        // built.problems below.
        _showToast('Export aborted — could not read: ' + built.problems.join(', ') + '. Nothing was saved. Please try again; if this repeats, your device storage may be failing.');
        return;
      }
      if (built.manifestBytes > MANIFEST_MAX_BYTES) {
        hideToast(_TOAST_ID);
        _showToast('Export aborted — the backup index is over the 16 MiB restore limit. Nothing was saved. Clear unneeded personal data, then export again.', 0);
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
      _showToast('Saving backup…', 0);
      // Stream the v3 container through the native bridge: the manifest frame,
      // then each media blob in <=512 KB base64 slices, then commit. On any
      // failure the driver aborts the open sink (v3ExportFinish(false)) so no
      // truncated, misleading backup survives (utils/backup-android.js — TEST-1).
      await runV3AndroidExport({
        bridge: PlatformBridge,
        manifestJson: JSON.stringify(built.manifest),
        mediaEntries: built.mediaEntries,
      });
      hideToast(_TOAST_ID);
      const saved = _savedBackupToast(built.problems, built.manifestBytes > MANIFEST_WARN_BYTES);
      if (saved.sticky) _showToast(saved.text, 0); else _showToast(saved.text);
      return true;
    } catch (e) {
      console.warn('android v3 export failed', e);
      hideToast(_TOAST_ID);
      _showToast('Export failed while writing. Please try again.');
    }
  };

  const exportPersonalData = async () => {
    // Both platforms now write the v3 STREAMING container (.votbak). Web streams
    // via openExportSink + writeContainer; Android via the native chunked bridge.
    // (The v2 buildExportPayload remains exported for rollback + the P5 fold.)
    if (PlatformBridge.isAndroid) await _exportV3Android();
    else await _exportV3Web();
  };

  const importPersonalData = async () => {
    // Shared import tail: confirm dialog + degraded-store guard + apply + result
    // toast + reload. `parsed` is the v2 JSON payload OR the v3 manifest (same
    // envelope shape); applyFn(storesMap, flagMap) → { importFailures,
    // writeFailures, skippedStores }. ONE source of truth for both formats.
    const _confirmDegradeApplyReload = async (parsed, applyFn, getIntegrity) => {
      const dateLabel = parsed.exportDate ? new Date(parsed.exportDate).toLocaleString() : 'unknown date';
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
      // .estimate is Chromium-61+; a v3 manifest carries each
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

      // Wave-0: this was the app's last native window.confirm — a blocking
      // dialog with no styling, no registry registration (Back navigated
      // underneath it), and browser chrome. Replaced with the same in-app
      // sheet pattern as the type-DELETE wipe dialog. The destructive
      // semantics are KEPT, not weakened: nothing is applied until the user
      // explicitly taps "Import & Overwrite"; Cancel / Back / Escape all
      // dismiss without touching data.
      // Show the sheet and AWAIT the user's decision. Resolving happens via
      // _settleImportConfirm from every dismiss path — so this async function
      // (and therefore the caller's finally, which closes the native import
      // stream on Android) does not complete until the import truly settles.
      const confirmed = await new Promise((resolve) => {
        importConfirmResolveRef.current = resolve;
        setImportConfirm({
          message: `Importing the backup from ${dateLabel} will OVERWRITE the data types contained in this backup; any data type not included is left unchanged.${summary}${spaceNote} This cannot be undone.`,
        });
      });
      if (!confirmed) return;                       // Cancel / backdrop / Back / Escape
      await _applyConfirmedImport(parsed, applyFn, getIntegrity);
    };

    // The post-confirm tail of an import: progress toast → degraded-store
    // guard → apply → result toast → reload. Runs ONLY from the confirm
    // sheet's "Import & Overwrite" button. `getIntegrity` (optional) is read
    // AFTER applyFn resolves — the Android v3 trailing CRC is only known once
    // every frame is consumed — and anything other than ok/absent joins the
    // completion problems.
    const _applyConfirmedImport = async (parsed, applyFn, getIntegrity) => {
      _showToast('Importing… please wait.', 0);

      const storesMap = _exportableStores();
      const flagMap = _flagStores();

      // Pending and degraded stores queue mutations in memory instead of
      // durably saving them. Import only after every store is loaded.
      const hasUnavailableStore = Object.values(storesMap).some(({ store }) => store.getState() !== 'loaded')
        || Object.values(flagMap).some((s) => s.getState() !== 'loaded');
      if (hasUnavailableStore) {
        hideToast(_TOAST_ID);
        _showToast('Storage is temporarily unavailable. Please try again in a moment.');
        return;
      }

      // Restore-inflight marker: set BEFORE the first mutation, removed only on
      // completion. If the process dies anywhere inside applyFn (crash, kill,
      // power loss) the marker survives and useRestoreGuard warns on next boot.
      // A handled failure below leaves it SET on purpose — writeFailures means
      // data did not durably land, and an unknown throw may have part-applied.
      let restoreMarker = null;
      try {
        restoreMarker = {
          previous: localStorage.getItem(RESTORE_INFLIGHT_KEY),
          token: String(Date.now()) + ':' + String(Math.random()),
        };
        localStorage.setItem(RESTORE_INFLIGHT_KEY, restoreMarker.token);
      } catch (_e) { restoreMarker = null; /* privacy mode */ }

      // Apply + WAIT for every write to durably land before reloading (U1
      // barrier). applyFn SKIPS any section that fails shape validation so a
      // corrupt section can't overwrite good data.
      let applied;
      try { applied = await applyFn(storesMap, flagMap); }
      catch (e) {
        // The apply paths hold a cross-tab Web Lock; contention gets its own
        // message instead of the generic corrupt-file one downstream. Nothing
        // ran in this tab, so restore whichever marker was present beforehand.
        if (/already in progress/.test(String(e && e.message))) {
          // This tab never mutated anything. Restore the marker it displaced
          // instead of deleting a concurrent import's crash warning.
          try {
            if (restoreMarker && localStorage.getItem(RESTORE_INFLIGHT_KEY) === restoreMarker.token) {
              if (restoreMarker.previous == null) localStorage.removeItem(RESTORE_INFLIGHT_KEY);
              else localStorage.setItem(RESTORE_INFLIGHT_KEY, restoreMarker.previous);
            }
          } catch (_e) { /* best-effort */ }
          hideToast(_TOAST_ID);
          _showToast('Another backup operation is running in a different tab. Please wait for it to finish.');
          return;
        }
        throw e;
      }
      const { importFailures, writeFailures, skippedStores, countMismatches } = applied;

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
      // BAK3: the manifest's `counts` block vs what actually landed. A clean import
      // always reconciles; a mismatch means a truncated/edited backup or a partial
      // media import — the user should know their only backup didn't fully restore.
      if (countMismatches && countMismatches.length > 0) {
        problems.push(`some records didn't restore (${countMismatches.join(', ')})`);
      }
      // BAK-INTEGRITY: every verify outcome other than ok/absent ('mismatch',
      // 'malformed', 'trailing') is a corruption warning — never a block (the
      // data already imported); warn + record durably.
      const integ = getIntegrity ? getIntegrity() : null;
      if (integ && integ !== 'ok' && integ !== 'absent') {
        console.warn('[import] v3 backup integrity check failed (' + integ + ')');
        try { if (window.DiagnosticLog) window.DiagnosticLog.warn('import', 'v3 backup integrity ' + integ + ' (android)'); } catch (_e) { /* best-effort */ }
        problems.push('the file failed its integrity check — some data may be corrupted');
      }
      if (problems.length) {
        // Wave-0: dropped "(check console)." dev-speak — details are in console.warn.
        _showToast(`Import completed — ${problems.join('; ')}. Reloading…`, 0);
      } else {
        _showToast('Import complete. Reloading…', 0);
      }
      // The apply is durable (writeFailures gate above) — the restore finished.
      try {
        if (!restoreMarker || localStorage.getItem(RESTORE_INFLIGHT_KEY) === restoreMarker.token) {
          localStorage.removeItem(RESTORE_INFLIGHT_KEY);
        }
      } catch (_e) { /* best-effort */ }
      // A clean import reloads fast; problems get reading time first — a 600ms
      // reload used to wipe the warning toast before anyone could read it.
      backupReloadPendingRef.current = true;
      setTimeout(() => window.location.reload(), problems.length ? 5000 : 600);
    };

    // BAK-INTEGRITY: a v3 backup carries a trailing CRC-32 of its manifest (all the
    // structured store data). A mismatch means it may be corrupted — but we NEVER
    // block the restore (the data still imports); we warn the user + record durably.
    const _warnBackupIntegrity = (platform, integrity) => {
      console.warn('[import] v3 backup integrity check failed (' + integrity + ')');
      try { if (window.DiagnosticLog) window.DiagnosticLog.warn('import', 'v3 backup integrity ' + integrity + ' (' + platform + ')'); } catch (_e) { /* best-effort */ }
      _showToast('Warning: this backup failed its integrity check — some data may be corrupted. It can still be imported.', 5000);
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
      // Every readContainer outcome other than ok/absent ('mismatch',
      // 'trailing') is a corruption warning — same classification as the
      // Verify-a-Backup report. Shown BEFORE the confirm sheet so the user
      // can still cancel.
      if (read.integrity !== 'ok' && read.integrity !== 'absent') _warnBackupIntegrity('web', read.integrity);
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
        // SEC2: never surface the raw JSON.parse/exception text — V8 folds a
        // fragment of the malformed input into err.message. Log it for diagnostics;
        // show the same generic message the other corrupt-file paths use.
        console.warn('import failed', err);
        hideToast(_TOAST_ID);
        _showToast('This backup file is corrupt or incomplete and could not be read.');
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
      // SEC2: log the raw native reason; show a generic, actionable message.
      if (ready !== 'ok') { console.warn('v3 import open failed:', ready); _showToast('Import failed — could not open the file. Please try again.'); return; }
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
      const sniff = classifyV3ImportBegin(begin);
      if (sniff.kind === 'error') {
        try { PlatformBridge.v3ImportClose(); } catch (_e) { /* best-effort */ }
        if (sniff.reason === 'too_large') {
          _showToast('That file is too large to import (over 50 MB). VOTReader backups are normally well under that — is it the right file?');
        } else {
          _showToast('This backup file is corrupt or incomplete and could not be read.');
        }
        return;
      }
      if (sniff.kind === 'legacy') {
        // Legacy v1/v2 JSON — already fully read by native; route to the v2 applier.
        try { PlatformBridge.v3ImportClose(); } catch (_e) { /* best-effort */ }
        await _doImport(sniff.json);
        return;
      }
      if (sniff.kind !== 'v3') {
        try { PlatformBridge.v3ImportClose(); } catch (_e) { /* best-effort */ }
        _showToast('This file does not look like a VOTReader backup.');
        return;
      }
      // 3. Parse + validate the v3 manifest.
      let manifest;
      try { manifest = JSON.parse(sniff.manifestJson); }
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
      //    <=512 KB base64 chunks. A size mismatch or truncation throws — applyV3's
      //    fail-safe ordering keeps existing media (utils/backup-android.js — TEST-1).
      // BAK-INTEGRITY: onDone fires (with the trailing manifest-CRC verify result)
      // ONLY once every frame is consumed — so cancelling the confirm below never
      // triggers a spurious warning (the generator never reaches onDone).
      let integrityResult = 'absent';
      const entries = v3AndroidImportEntries({
        bridge: PlatformBridge,
        media: Array.isArray(manifest.media) ? manifest.media : [],
        onDone: (v) => { integrityResult = v; },
      });
      // 5. Confirm + degraded-guard + apply + reload (shared helper). Close the
      //    native stream no matter what (success, cancel at the confirm, or error).
      try {
        await _confirmDegradeApplyReload(manifest, (storesMap, flagMap) => applyV3(manifest, entries, {
          storesMap: storesMap,
          flagMap: flagMap,
          mediaStore: JournalMediaStore,
          validateStorePayload: validateStorePayload,
        }), () => integrityResult);
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
      await _importV3Android();
      return;
    }

    // Web: pick a File, sniff the first bytes, route a v3 container vs a legacy
    // v1/v2 JSON backup. pickImportFile() opens the picker synchronously in this
    // user gesture (the async IIFE runs sync up to the first await).
    await (async () => {
      try {
        const file = await PlatformBridge.pickImportFile();
        if (!file) return; // user cancelled
        const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
        if (isContainerMagic(head)) {
          await _importV3Container(file);
        } else {
          // Legacy JSON whole-file text read. BAK4: cap at 50 MB to match Android
          // (StorageManager.MAX_IMPORT_SIZE) + the other web path
          // (WEB_MAX_IMPORT_BYTES) — v3 is the GB-scale streaming path, a legacy
          // v1/v2 backup is always well under this, so a larger pick is a
          // pathological non-backup that a 300 MB .text() read would OOM on a
          // budget device.
          if (file.size > 50 * 1024 * 1024) {
            _showToast('That file is too large to import (over 50 MB). VOTReader backups are normally well under that — is it the right file?');
            return;
          }
          await _doImport(await file.text());
        }
      } catch (e) {
        // SEC2: log for diagnostics; show a generic message, never the raw
        // exception text (may embed a fragment of the malformed file).
        console.warn('import failed', e);
        hideToast(_TOAST_ID);
        _showToast('This backup file is corrupt or incomplete and could not be read.');
      }
    })();
  };

  // ── Verify a Backup (FABLE5-BACKLOG [15]) ────────────────────────────────
  // Read-only .votbak inspection: run the ENTIRE import read path — magic,
  // manifest parse, envelope validation, per-frame size checks, trailing
  // CRC — and report what the file contains WITHOUT applying anything.
  // Catches a corrupt only-backup BEFORE the day it's needed. The result
  // renders as a row under the button (setVerifyReport); hard read failures
  // land there too, so the outcome is always visible in place.
  const _verifyFail = (msg) => {
    hideToast(_TOAST_ID);
    setVerifyReport({ message: msg, level: 'warn' });
  };
  const verifyBackupFile = () => {
    const _report = (manifest, integrity, kind) => {
      hideToast(_TOAST_ID);
      setVerifyReport(formatVerifyReport(summarizeBackupManifest(manifest), integrity, kind));
    };
    // Both platforms: envelope-validate the parsed manifest/payload first so a
    // random JSON file reports "not a backup", not a zero-count summary.
    const _checkEnvelope = (parsed) => {
      const errs = validateImportEnvelope(parsed);
      if (errs.length) {
        console.warn('verify: envelope invalid', errs);
        _verifyFail('This file does not look like a VOTReader backup.');
        return false;
      }
      return true;
    };

    if (PlatformBridge.isAndroid) {
      return (async () => {
        const ready = await new Promise((resolve) => {
          window.__onV3ImportReady = (status) => { window.__onV3ImportReady = null; resolve(status); };
          PlatformBridge.v3ImportOpen();
        });
        if (ready === 'cancelled') return;
        if (ready !== 'ok') { console.warn('verify open failed:', ready); _verifyFail('Could not open the file. Please try again.'); return; }
        let begin;
        try { begin = PlatformBridge.v3ImportBegin(); }
        catch (e) { console.warn('verify begin failed', e); try { PlatformBridge.v3ImportClose(); } catch (_e) { /* best-effort */ } _verifyFail('Could not read the file.'); return; }
        const sniff = classifyV3ImportBegin(begin);
        try {
          if (sniff.kind === 'error') {
            _verifyFail(sniff.reason === 'too_large'
              ? 'That file is too large to be a VOTReader backup (over 50 MB).'
              : 'This backup file is corrupt or incomplete and could not be read.');
            return;
          }
          if (sniff.kind === 'legacy') {
            let parsed;
            try { parsed = JSON.parse(sniff.json); }
            catch (e) { console.warn('verify legacy parse failed', e); _verifyFail('This backup file is corrupt or incomplete and could not be read.'); return; }
            if (!_checkEnvelope(parsed)) return;
            _report(parsed, 'absent', 'legacy');
            return;
          }
          if (sniff.kind !== 'v3') { _verifyFail('This file does not look like a VOTReader backup.'); return; }
          let manifest;
          try { manifest = JSON.parse(sniff.manifestJson); }
          catch (e) { console.warn('verify manifest parse failed', e); _verifyFail('This backup file is corrupt or incomplete and could not be read.'); return; }
          if (!_checkEnvelope(manifest)) return;
          // Drain every media frame (discarding the bytes) so the stream reaches
          // the trailing CRC — the generator runs the native verify via onDone.
          // Any frame-size mismatch or truncation throws = corruption caught.
          _showToast('Checking backup…', 0);
          let integrity = 'absent';
          try {
            const entries = v3AndroidImportEntries({
              bridge: PlatformBridge,
              media: Array.isArray(manifest.media) ? manifest.media : [],
              onDone: (v) => { integrity = v; },
            });
            for await (const _entry of entries) { /* verify-only: bytes discarded */ }
          } catch (e) {
            console.warn('verify frame walk failed', e);
            _verifyFail('This backup file is corrupt or incomplete — a media frame failed its size check.');
            return;
          }
          _report(manifest, integrity, 'v3');
        } finally {
          try { PlatformBridge.v3ImportClose(); } catch (_e) { /* best-effort */ }
        }
      })();
    }

    // Web: same routing as importPersonalData's picker path, minus the apply.
    return (async () => {
      try {
        const file = await PlatformBridge.pickImportFile();
        if (!file) return;
        const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
        if (isContainerMagic(head)) {
          _showToast('Checking backup…', 0);
          let read;
          try { read = await readContainer(file); }  // frame sizes verified inside
          catch (e) { console.warn('verify container read failed', e); _verifyFail('This backup file is corrupt or incomplete and could not be read.'); return; }
          if (!_checkEnvelope(read.manifest)) return;
          _report(read.manifest, read.integrity, 'v3');
        } else {
          if (file.size > 50 * 1024 * 1024) { _verifyFail('That file is too large to be a VOTReader backup (over 50 MB).'); return; }
          let parsed;
          try { parsed = JSON.parse(await file.text()); }
          catch (e) { console.warn('verify legacy parse failed', e); _verifyFail('This backup file is corrupt or incomplete and could not be read.'); return; }
          if (!_checkEnvelope(parsed)) return;
          _report(parsed, 'absent', 'legacy');
        }
      } catch (e) {
        console.warn('verify failed', e);
        _verifyFail('This backup file is corrupt or incomplete and could not be read.');
      }
    })();
  };

  /**
   * Wrap `indexedDB.deleteDatabase(name)` in a Promise that resolves
   * with whether deletion actually succeeded. Critical deletes get a
   * longer timeout because hanging on those is worse than hanging
   * on a cache database.
   *
   * @param {string} name
   * @param {boolean} critical
   * @returns {Promise<boolean>} true only when deletion completed
   */
  const _deleteIdbDatabase = (name, critical) => new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => { if (!settled) { settled = true; resolve(ok); } };
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => finish(true);
      req.onerror = () => finish(false);
      req.onblocked = () => finish(false); // open connections should close on
                                           // versionchange; otherwise fail visibly.
      // Timeout fallback so a stuck deletion doesn't block the UI
      // forever. 3s for user-data DBs, 1s for caches.
      setTimeout(() => finish(false), critical ? 3000 : 1000);
    } catch (_e) { finish(false); }
  });

  // Runs via _runLockedBackupOperation (mutex + cross-tab lock live there).
  const clearAllPersonalData = async () => {
    try {
      // NTV3: wipe the native Garden image disk cache too (Android: cacheDir/garden,
      // capped at 800 MB — it survived "Clear All" before because the JS wipe only
      // touched IDB + localStorage). Best-effort + a no-op on web; never block the
      // data wipe on it.
      try { PlatformBridge.clearGardenCache(); } catch (_e) { /* best-effort native cache wipe */ }
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
      // onblocked never hangs the UI; vot-thumbs + the two search-index
      // caches (Classic + MiniSearch) are regenerable caches and get a
      // 1s timeout each.
      const deleteResults = await Promise.all([
        _deleteIdbDatabase('votreader', true),
        _deleteIdbDatabase('vot-journal-media', true),
        _deleteIdbDatabase('vot-thumbs', false),
        _deleteIdbDatabase('vot-search-cache', false),
        _deleteIdbDatabase('vot-minisearch-cache', false),
      ]);
      if (!deleteResults[0] || !deleteResults[1]) {
        throw new Error('A personal-data database could not be deleted');
      }
      _collectVotKeys().forEach((k) => { try { localStorage.removeItem(k); } catch (_e) { /* localStorage access — disabled / quota / privacy mode non-fatal */ } });
      // Wave-0: was alert('All personal data cleared…') — a native blocking
      // dialog. Same toast-then-reload pattern the import path uses: the
      // persistent toast renders first, the 600ms delay lets it paint.
      _showToast('All personal data cleared. Reloading…', 0);
      // Keep the backup controls disabled through the reload window — a new
      // import starting against the just-wiped state would race the teardown.
      backupReloadPendingRef.current = true;
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      console.warn('clear all personal data failed', e);
      // Wave-0: was alert('Clear failed. See console for details.') — native
      // dialog + dev-speak. The diagnostics still go to console.warn above;
      // the user gets an actionable message, not a pointer to tooling.
      _showToast('Clear did not finish. Please try again.');
    }
  };

  const textScalePercent = Math.round(clampFontScale(settings.fontScale || '1') * 100);
  const selectedFont = typeof readingFontById === 'function'
    ? readingFontById(settings.fontStyle || 'classic')
    : null;
  const selectedFontLabel = selectedFont && selectedFont.label ? selectedFont.label : 'System Serif';

  return (
    <ScreenLayout
      navChildren={LibraryNav({
        // hide:['settings'] — you are already on Settings. The three icons
        // used to be hand-copied SVGs inline purely to omit the gear.
        onBack, backTitle: 'Back', hide: ['settings'],
        onHistory, onSearch, theme, onThemeChange,
      })}
    >
      <div className={'settings-screen' + (textScalePercent >= 180 ? ' settings-large-type' : '')}>
        <header className="settings-header">
          <h1 className="settings-title">Settings</h1>
          <p className="settings-intro">Shape the way you read, listen, and move through the library.</p>
          <dl className="settings-summary" aria-label="Current reading preferences">
            <div className="settings-summary-item">
              <dt>Theme</dt>
              <dd>{theme === 'light' ? 'Light' : 'Dark'}</dd>
            </div>
            <div className="settings-summary-item">
              <dt>Text</dt>
              <dd>{textScalePercent === 100 ? 'Standard' : textScalePercent + '%'}</dd>
            </div>
            <div className="settings-summary-item">
              <dt>Typeface</dt>
              <dd>{selectedFontLabel}</dd>
            </div>
          </dl>
          <p className="settings-save-note"><span aria-hidden="true" />Changes save on this device</p>
        </header>

        <div className="settings-groups">
        <div className="settings-find">
          <label htmlFor="settings-find-input">Find settings</label>
          <div className="settings-find-controls">
            <input ref={settingsFindRef} id="settings-find-input" type="search" placeholder="Try font, audio, or backup" value={settingsQuery} onChange={(e) => changeSettingsQuery(e.target.value)} />
            {settingsQuery && <button type="button" onClick={() => { changeSettingsQuery(''); settingsFindRef.current?.focus(); }}>Clear filter</button>}
          </div>
          {searching && <p role="status">{matchingCount ? matchingCount + (matchingCount === 1 ? ' matching group' : ' matching groups') : 'No matching settings. Try font, audio, backup, or clear the filter.'}</p>}
        </div>

        <SettingsGroup label="Appearance" sub="Theme, text size & reading font" {...groupProps('appearance')}>
          <div className="settings-card">
            <SettingsRow
              label="Light Theme"
              desc="Switch between the dark (default) and light reading themes. Also available as the sun/moon icon in the top nav, unless you hide it under Top-Nav Buttons."
              checked={theme === "light"}
              onToggle={() => onThemeChange(theme === "light" ? "dark" : "light")}
            />
            {/* [10] True Black toggle REMOVED 2026-08-03 (owner: "just make
                it default, looks better anyway") — pure-black surfaces are
                now the dark theme's own tokens in app.css. A persisted
                settings.trueBlack key is an ignored orphan. */}
            <TextSizeSliderRow
              value={settings.fontScale || "1"}
              onChange={(v) => onSetting("fontScale", v)}
            />
            {/* Reading Font (2026-07-31) — replaces the two-state "Modern
                Fonts" toggle. settings.fontStyle now holds any READING_FONTS
                id; "classic"/"modern" keep their historical meanings so
                persisted + backup-imported values stay valid. */}
            <FontPickerRow
              value={settings.fontStyle || "classic"}
              onSelect={(id) => onSetting("fontStyle", id)}
            />
          </div>
        </SettingsGroup>

        <SettingsGroup label="Reading" sub="Translation, headings & reading aids" {...groupProps('reading')}>
          <div className="settings-card">
            <SelectField
              eyebrow="Reading"
              title="Bible Translation"
              label="Bible Translation"
              desc={<TranslationInfoDesc />}
              value={settings.translation || "nkjv"}
              options={TRANSLATION_OPTIONS}
              onChange={(v) => onSetting("translation", v)}
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
            {/* Redesign 2026-07-31: dependent settings are UNMOUNTED, not
                disabled, while their dependency is off (the auto-scroll
                disclosure discipline, now applied screen-wide). Restored
                Names only ever appears inside titles/headings, so with both
                off the row is gone — it returns when either comes back. */}
            {!(settings.showChapterTitle === false && settings.showSectionHeadings === false) && (
              <SettingsRow
                label="Restored Names"
                desc="Uses the proper Name of The Father (YAHUWAH) and The Son (YahuShua) in chapter titles and section headings — only where the underlying verses bear the Name. Verse text itself is never altered."
                checked={!!settings.restoredNames}
                onToggle={() => onToggle("restoredNames")}
              />
            )}
            <SelectField
              eyebrow="Reading"
              title="Chapter Arrows"
              label="Chapter & Letter Arrows"
              desc="Where the previous/next arrows live in a chapter or letter view."
              value={settings.arrowLayout || "split"}
              options={ARROW_LAYOUT_OPTIONS}
              onChange={(v) => onSetting("arrowLayout", v)}
            />
            <SelectField
              eyebrow="Reading"
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
              desc="A pulsing gold dot in the top navigation bar that takes you back to where you were last reading. It follows you the moment you open any chapter or letter."
              checked={settings.showReadingDot}
              onToggle={() => onToggle("showReadingDot")}
            />
            <SelectField
              eyebrow="Reading"
              title="Reading Streak Dwell Time"
              label="Reading Streak Dwell Time"
              desc="How long you must stay reading before the day counts toward the reading streak on My Progress. The reading dot is not affected — it always follows where you are."
              value={settings.dwellMs || "20000"}
              options={[
                { id: "3000",  label: "3 seconds",  desc: "Counts almost immediately" },
                { id: "5000",  label: "5 seconds",  desc: "Very quick" },
                { id: "10000", label: "10 seconds", desc: "Quick" },
                { id: "15000", label: "15 seconds", desc: "Moderate" },
                { id: "20000", label: "20 seconds", desc: "Standard (default)" },
                { id: "30000", label: "30 seconds", desc: "Relaxed" },
                { id: "45000", label: "45 seconds", desc: "Deliberate" },
                { id: "60000", label: "60 seconds", desc: "Requires a full minute of reading" }
              ]}
              onChange={(v) => onSetting("dwellMs", v)}
            />
            <SettingsRow
              label="Random Letter Button"
              desc="A breathing dice icon on the home screen that opens a random chapter or letter when tapped."
              checked={settings.showSurpriseButton}
              onToggle={() => onToggle("showSurpriseButton")}
            />
            <SettingsRow
              label="Keep Screen On While Reading"
              desc="Don't let the screen dim or lock while the app is open. Helpful for long reading sessions; turn off to save battery. Has no effect on desktop browsers."
              checked={settings.keepScreenOn !== false}
              onToggle={() => onToggle("keepScreenOn")}
            />
            <SettingsRow
              label="Double-Tap / Click Fullscreen"
              desc="Double-tap an open area on a phone or double-click one on a computer to switch between fullscreen and regular view. Buttons, links, fields, navigation, and other controls are ignored. Turn this off to disable the shortcut."
              checked={settings.doubleTapFullscreen !== false}
              onToggle={() => onToggle("doubleTapFullscreen")}
            />
          </div>
        </SettingsGroup>

        {/* Listening (2026-08-09). The audio controls were scattered: the two
            voice pickers sat under Reading beside translation and headings,
            and the read-along toggles carried a comment promising this move.
            One group now owns every choice that shapes what you HEAR. */}
        <SettingsGroup label="Listening" sub="Voices, speed & read-along" {...groupProps('listening')}>
          <div className="settings-card">
            <SelectField
              eyebrow="Listening"
              title="Bible Audio"
              label="Bible Audio"
              desc="Recorded voice for the Listen button on Bible books and chapters. Every edition is recorded a chapter at a time, so Listen starts at the chapter you are on. Independent of the reading translation. More recorded editions can be added over time; Off hides the button."
              value={settings.bibleAudio || "brm-kjv"}
              options={[
                /* Registry source of truth: utils/audio-track.js
                   (BIBLE_AUDIO_EDITIONS, published as a global for this
                   classic-globals screen). 'Off' is appended locally. */
                ...Object.entries(/** @type {any} */ (globalThis).BIBLE_AUDIO_EDITIONS || {}).map(([id, ed]) => ({
                  id, label: /** @type {any} */ (ed).label,
                  /* B2 (2026-08-10): "Whole-book audiobook" was true of BRM
                     for one day in s3. All three shipped editions are 1,189
                     per-chapter recordings. */
                  desc: 'Per-chapter audiobook · ' + String(/** @type {any} */ (ed).translation || '').toUpperCase() + ' text',
                })),
                { id: "off", label: "Off", desc: "Hide the Bible Listen button" },
              ]}
              onChange={(v) => onSetting("bibleAudio", v)}
            />
            <SelectField
              eyebrow="Listening"
              title="Letter Voice"
              label="Letter Voice"
              desc="Preferred reader for the recorded Letters. Automatic uses each recording's own primary reading; choosing a reader starts every letter THEY have recorded in their voice, and letters they haven't keep the primary one. You can always switch voice for the recording that is playing from the listening desk."
              value={settings.letterReader || "auto"}
              options={[
                { id: "auto", label: "Automatic", desc: "Each recording's primary reading" },
                /* Registry source of truth: utils/audio-track.js (AUDIO_READERS,
                   published as a global for this classic-globals screen), in
                   the app's reader rank. */
                ...Object.entries(/** @type {any} */ (globalThis).AUDIO_READERS || {}).map(([id, label]) => ({
                  id, label: String(label), desc: 'Prefer this reading wherever it exists',
                })),
              ]}
              onChange={(v) => onSetting("letterReader", v)}
            />
            {/* Default Speed reads and writes the LISTENING LIBRARY, not a
                settings key: AudioLibraryStore has owned `rate` since the desk
                shipped (the player rehydrates from it at every track start), so
                a settings.audioRate twin would be a second truth to keep in
                sync. The write prefers AudioPlayer.setPlaybackRate — that IS
                the store write, plus it retimes whatever is playing right now —
                and falls back to the store when the player module is absent. */}
            <AudioRateRow />
            <SettingsRow
              label="Read-Along Highlight"
              desc="While a recorded letter is playing, softly wash the sentence being read so your eye can follow the voice. It uses the timings that ship with the app; letters that don't have them simply play as before."
              checked={settings.readAlongHighlight !== false}
              onToggle={() => onToggle("readAlongHighlight")}
            />
            {/* Dependent row: with no wash there is nothing to follow, so the
                scroll toggle is UNMOUNTED rather than greyed (the disclosure
                discipline the whole screen follows). */}
            {settings.readAlongHighlight !== false && (
              <SettingsRow
                label="Follow the Voice"
                desc="Let the page scroll a little on its own to keep the sentence being read inside the middle of the screen. It stands down the moment you scroll by hand, and never scrolls while auto-scroll is running."
                checked={settings.readAlongFollow !== false}
                onToggle={() => onToggle("readAlongFollow")}
              />
            )}
          </div>
        </SettingsGroup>

        <SettingsGroup label="Auto-Scroll" sub="Hands-free reading" {...groupProps('autoscroll')}>
          <div className="settings-card">
            <SettingsRow
              label="Auto-Scroll"
              desc="Adds a small play/pause pill to chapter and letter screens that scrolls the page for you at a steady reading pace. Touching the screen pauses it instantly; it picks back up a moment after you lift your finger. The pill fades out of the way while it runs."
              checked={!!settings.autoScroll}
              onToggle={() => onToggle("autoScroll")}
            />
            {/* Auto-scroll's sub-settings are COLLAPSED, not merely disabled,
                while the feature is off: a greyed control still occupies the
                page and still reads as something you might be able to use.
                They are unmounted, so they are also unreachable by tab/screen
                reader. Auto-Continue Pause nests one level deeper — it means
                nothing at all unless Auto-Continue is on. */}
            {!!settings.autoScroll && (
              <>
                <AutoScrollSpeedRow
                  value={settings.autoScrollLpm || "16"}
                  onChange={(v) => onSetting("autoScrollLpm", v)}
                />
                <SettingsRow
                  label="Auto-Continue"
                  desc="When auto-scroll reaches the end of the text, count down and move to the next chapter or letter on its own. It stops at the end of a book, a volume, or a study rather than crossing into a different collection — and it stops after a long unattended run."
                  checked={!!settings.autoScrollNext}
                  onToggle={() => onToggle("autoScrollNext")}
                />
                {!!settings.autoScrollNext && (
                  <AutoScrollDwellRow
                    value={settings.autoScrollEndMs || "2500"}
                    onChange={(v) => onSetting("autoScrollEndMs", v)}
                  />
                )}
              </>
            )}
          </div>
        </SettingsGroup>

        <SettingsGroup label="Top-Nav Buttons" sub="Icons in the reading bar" {...groupProps('topnav')}>
          <div className="settings-card">
            <div className="settings-chip-note">Which optional icons appear in the top bar. On compact phones, History stays in Home to preserve full-size touch targets; Settings does the same below 340px.</div>
            <div className="settings-chips">
              <NavChip label="Settings Gear" checked={settings.showSettingsGear} onToggle={() => onToggle("showSettingsGear")} />
              {/* Hidden (not greyed) while History itself is off — the chip
                  returns with the feature (Search, Tabs & History group). */}
              {settings.historyEnabled !== false && (
                <NavChip label="History" checked={!!settings.historyInNav} onToggle={() => onToggle("historyInNav")} />
              )}
              <NavChip label="Bookmark" checked={settings.showBookmarkNav !== false} onToggle={() => onToggle("showBookmarkNav")} />
              <NavChip label="Theme" checked={settings.showThemeBtn !== false} onToggle={() => onToggle("showThemeBtn")} />
            </div>
          </div>
        </SettingsGroup>

        <SettingsGroup label="Search, Tabs & History" sub="Find, multitask, revisit" {...groupProps('features')}>
          <div className="settings-card">
            <SettingsRow
              label="Search"
              desc="Full-text search across all 66 books + Volumes. When off, the search button is hidden everywhere."
              checked={settings.searchEnabled !== false}
              onToggle={() => onToggle("searchEnabled")}
            />
            {/* Search's sub-settings unmount with it (redesign 2026-07-31 —
                formerly greyed with a "Turn on Search" hint). */}
            {settings.searchEnabled !== false && (
              <>
                <SettingsRow
                  label="Synonym Search"
                  desc="On (default): also match scripture synonyms — searching 'mercy' finds 'compassion', 'shepherd' finds 'pastor', 'faith' finds 'belief' and 'trust'. Exact-word matches always rank first. Off: match only the words you type."
                  checked={settings.searchSynonyms !== false}
                  onToggle={() => onToggle("searchSynonyms")}
                />
                <SettingsRow
                  label="Filter Stop Words in Search"
                  desc="On (default): strip filler words (the, is, of, and, this, that, etc.) from queries of 5+ words so results focus on meaningful terms. Off: match every word exactly as typed. Turn off if a search is missing results you know are there — especially with KJV-style phrasing."
                  checked={settings.searchUseStopWords !== false}
                  onToggle={() => onToggle("searchUseStopWords")}
                />
              </>
            )}
            <SettingsRow
              label="Tabs"
              desc="Run up to 999 independent reading places in parallel — flip between a chapter, a letter, a study, and back. All tabs share settings, theme, mark-as-read, history, and reading progress. Disabling preserves all your open tabs — they'll be waiting when you turn it back on."
              checked={!!settings.tabsEnabled}
              onToggle={() => onToggle("tabsEnabled")}
            />
            <SettingsRow
              label="History"
              desc="Keep a running list of chapters and letters you've visited. When off, recording stops and the history button is hidden. Existing history is preserved."
              checked={settings.historyEnabled !== false}
              onToggle={() => onToggle("historyEnabled")}
            />
          </div>
          <HistoryClearRow historyCount={historyCount} onClearHistory={onClearHistory} />
        </SettingsGroup>

        <SettingsGroup label="A Return to The Garden" sub="Image quality" {...groupProps('garden')}>
          <div className="settings-card">
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
        </SettingsGroup>

        <SettingsGroup label="Your Data" sub="Backup, storage & privacy" {...groupProps('data')}>
          <div className="settings-card">
            <DataInfoRow label="App version" value={versionDisplayText}>
              <button
                className="settings-clear-btn"
                disabled={buildInfo.state === 'loading'}
                onClick={(e) => { e.stopPropagation(); refreshBuildInfo(); }}
              >Check</button>
            </DataInfoRow>
            <DataInfoRow label="Platform" value={_platformLabel(StorageHealth.getPlatform())} />
            <DataInfoRow label="Total app data" value={appDataDisplayText} />
            <DataInfoRow label="Your data" value={userDataDisplayText} />
            {dataSamples.length > 0 && (
              <DataInfoRow label="Growth" value={<StorageTrendValue samples={dataSamples} />} />
            )}
            <DataInfoRow label="Protection" value={protectionDisplayText}>
              {showProtectButton && (
                <button className="settings-clear-btn" onClick={(e) => { e.stopPropagation(); storageInfo.requestPersist(); }}>Protect now</button>
              )}
            </DataInfoRow>
            <DataActionRow
              label="Export Your Data"
              desc="Download every note, highlight, notebook, journal entry, bookmark, link, reading-progress mark, history record, open tab, and setting stored on this device as one backup file — look for a file named votreader-backup-<date>.votbak in your Downloads or the folder you chose. No credentials or login info — just your data. Save the file anywhere you control."
            >
              <button className="settings-clear-btn" disabled={backupBusy} onClick={(e) => { e.stopPropagation(); _runLockedBackupOperation(exportPersonalData); }}>Export</button>
            </DataActionRow>
            <DataActionRow
              label="Import from Backup"
              desc="Restore a previously exported backup file (a .votbak file). Replaces all current personal data on this device with the contents of the file. You will be asked to confirm before anything is overwritten."
            >
              <button className="settings-clear-btn" disabled={backupBusy} onClick={(e) => { e.stopPropagation(); _runBackupOperation(importPersonalData); }}>Import</button>
            </DataActionRow>
            <DataActionRow
              label="Verify a Backup"
              desc="Check a backup file without importing it: reads the whole file, verifies its structure and integrity checksum, and reports what it contains. Nothing on this device changes."
            >
              <button className="settings-clear-btn" disabled={backupBusy} onClick={(e) => { e.stopPropagation(); setVerifyReport(null); _runLockedBackupOperation(verifyBackupFile); }}>Verify</button>
            </DataActionRow>
            {verifyReport && (
              /* Always-visible result (NOT DataActionRow — its desc hides
                 behind the ⓘ toggle; a report the user just asked for must
                 not need a second tap). */
              <div className={'settings-row' + (verifyReport.level === 'warn' ? ' danger-zone' : '')}>
                <div className="settings-row-head">
                  <span className="settings-row-label">Verify Result</span>
                  <span className="settings-row-grow" />
                  <button className="settings-clear-btn" onClick={(e) => { e.stopPropagation(); setVerifyReport(null); }}>Dismiss</button>
                </div>
                <div className="settings-row-desc">{verifyReport.message}</div>
              </div>
            )}
            {/* Diagnostic-log status row. Renders only when entries exist
                (Android: native BoundedLogTree merged with the JS DiagnosticLog;
                web: the JS DiagnosticLog). Hidden on a clean session to reduce
                UI noise. */}
            {diagnosticLog.length > 0 && (
              <DataActionRow
                label="Diagnostic Log"
                desc={`${diagnosticLog.length} recent ${diagnosticLog.length === 1 ? 'entry' : 'entries'} captured (warnings, errors, and timings; content URIs and file paths redacted). Included in your next Export. Last entry: ${new Date(diagnosticLog[diagnosticLog.length - 1].t).toLocaleString()}.`}
              >
                <span className="settings-row-value">{diagnosticLog.length} {diagnosticLog.length === 1 ? 'entry' : 'entries'}</span>
              </DataActionRow>
            )}
            <DataActionRow
              className="danger-zone"
              label="Clear All Personal Data"
              desc="Removes every note, highlight, notebook, journal entry, bookmark, link, reading-progress mark, history record, saved tab, tab thumbnail, and search cache. App settings will reset to defaults. This cannot be undone — export first if you want a backup."
            >
              <button className="settings-clear-btn danger" disabled={backupBusy} onClick={(e) => { e.stopPropagation(); setWipeText(''); setWipeConfirm(true); }}>Clear All My Data</button>
            </DataActionRow>
          </div>
        </SettingsGroup>

        {/* The wipe + import-overwrite overlays live OUTSIDE the accordion
            groups (redesign 2026-07-31): they are fixed-position sheets whose
            mount must not depend on a group's open state — the import
            confirm in particular arrives ASYNC after a native file picker. */}
        {(() => {
            // closeWipe now lives at component scope (shared with the
            // useModalRegistry registration above) — same dialog, same
            // dismiss paths, but Back/Escape now close THIS first.
            return (
              <>
                {wipeConfirm && (
                  <div
                    className="note-sheet-overlay"
                    onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) closeWipe(); }}
                  >
                    <div className="note-sheet" ref={wipeTrapRef} role="dialog" aria-modal="true" aria-labelledby="settings-wipe-title" onClick={(e) => e.stopPropagation()}>
                      <div className="note-sheet-header">
                        <div className="note-sheet-title" id="settings-wipe-title">Delete All Personal Data</div>
                      </div>
                      <div style={{ color: "var(--cream)", fontSize: "var(--fs-14)", lineHeight: "1.5", marginBottom: "14px" }}>
                        This permanently erases every note, highlight, notebook, journal entry, bookmark, link, reading-progress mark, history record, saved tab, and the search cache, then resets all settings to defaults.{' '}
                        <strong style={{ color: "#c0392b" }}>This cannot be undone.</strong> Export your data first if you want a backup.
                      </div>
                      <div style={{ color: "var(--cream-muted)", fontSize: "var(--fs-12)", letterSpacing: "0.04em", marginBottom: "8px" }}>
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
                        onKeyDown={(e) => { if (e.key === 'Enter' && wipeOk) { closeWipe(); _runLockedBackupOperation(clearAllPersonalData); } }}
                        style={{
                          width: "100%", boxSizing: "border-box", textAlign: "center",
                          fontFamily: "'Cinzel', serif", fontSize: "var(--fs-16)", letterSpacing: "0.22em",
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
                          onClick={(e) => { e.stopPropagation(); if (!wipeOk) return; closeWipe(); _runLockedBackupOperation(clearAllPersonalData); }}
                        >
                          Delete Everything
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {/* Wave-0: the import-overwrite confirm sheet (replaces the
                    native window.confirm). Same overlay/sheet classes as the
                    wipe dialog; the danger-styled action button keeps the
                    weight of the choice visible. `proceed` closes the sheet
                    itself before applying. */}
                {importConfirm && (
                  <div
                    className="note-sheet-overlay"
                    onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) _settleImportConfirm(false); }}
                  >
                    <div className="note-sheet" ref={importTrapRef} role="dialog" aria-modal="true" aria-labelledby="settings-import-title" onClick={(e) => e.stopPropagation()}>
                      <div className="note-sheet-header">
                        <div className="note-sheet-title" id="settings-import-title">Import from Backup</div>
                      </div>
                      <div style={{ color: "var(--cream)", fontSize: "var(--fs-14)", lineHeight: "1.5", marginBottom: "18px", whiteSpace: "pre-line" }}>
                        {importConfirm.message}
                      </div>
                      <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                        <button className="settings-clear-btn" onClick={(e) => { e.stopPropagation(); _settleImportConfirm(false); }}>Cancel</button>
                        <button
                          className="settings-clear-btn danger"
                          onClick={(e) => { e.stopPropagation(); _settleImportConfirm(true); }}
                        >
                          Import &amp; Overwrite
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            );
          })()}

        <SettingsGroup label="Mark as Read" sub="Reading progress by book" {...groupProps('progress')}>
          <div className="settings-card">
            <SettingsRow
              label="Mark as Read"
              desc="Chapters and letters are checked off automatically once you've genuinely read them — nearly all of the text seen, for about as long as reading it takes. A quick scroll to the bottom doesn't count. Re-reads add a small ×2, ×3 beside the check. Progress stops recording when this is off, but what's already saved is kept."
              checked={settings.markAsRead}
              onToggle={() => onToggle("markAsRead")}
            />
          </div>
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
                      style={{ background: "var(--bg)" }}
                    >
                      <button
                        type="button"
                        className="progress-section-toggle"
                        aria-expanded={isOpen}
                        onClick={(e) => { e.stopPropagation(); toggleSection(grp.id); }}
                      >
                        <span aria-hidden="true" style={{ color: "var(--gold-dim)", fontSize: "var(--fs-12)", minWidth: "0.75rem" }}>
                          {isOpen ? "▾" : "▸"}
                        </span>
                        <span className="progress-row-label" style={{ color: "var(--gold)" }}>{grp.label}</span>
                        <span className="progress-row-tally">{sRead} / {sTotal}</span>
                      </button>
                      <SectionClearBtn
                        label={grp.label}
                        disabled={sRead === 0 && !sectionBooks(grp).some((b) => hasFrontierFor(b.id))}
                        onClear={() => sectionBooks(grp).forEach((b) => onClearBook(b.id))}
                      />
                    </div>

                    {isOpen && grp.genres.map((genre) => (
                      <React.Fragment key={genre.label}>
                        <div className="progress-row" style={{ background: "var(--bg2)", paddingTop: "0.45rem", paddingBottom: "0.45rem", paddingLeft: "2rem" }}>
                          <span style={{ fontFamily: "'Cinzel',serif", fontSize: "var(--fs-10)", letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--gold-dim)", flex: 1 }}>
                            {genre.label}
                          </span>
                        </div>

                        {genre.books.map((src) => (
                          <div key={src.id} style={{ paddingLeft: "1rem" }}>
                            <ClearProgressRow
                              label={src.label}
                              total={src.total}
                              count={countFor(src.id)}
                              hasPartial={hasFrontierFor(src.id)}
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
              <AllProgressClearRow totalRead={totalRead} totalItems={totalItems} hasPartial={frontierKeys.length > 0} onClearAll={onClearAll} />
            </div>
          )}
        </SettingsGroup>

        {/* review-tutorial: the tour is re-openable from here, whatever the Home strip decided. */}
        <SettingsGroup label="Help" sub="Show me around & About" {...groupProps('help')}>
          <div className="settings-card">
            <button type="button" className="settings-help-btn" onClick={() => { if (typeof TourController !== 'undefined') TourController.start('settings'); }}>Show me around</button>
            <p className="settings-help-note">A short tour of the app: six stops, about two minutes. It points at the real buttons; you can leave at any time.</p>
          </div>
        </SettingsGroup>
        </div>
      </div>
    </ScreenLayout>
  );
}
