/* ═══════════════════════════════════════════════════════════════════════
   SettingsScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { settingsGlance, daysAgo } from '../../utils/settings-glance.js';
import { letterVoiceOptions } from './AudioLibraryScreen.jsx';
import { createBackupFlow } from '../../utils/backup-flow.js';
import { OfflineAudio } from '../../utils/offline-audio.js';
import { canTell, networkType } from '../../utils/download-gate.js';
import { OfflineLibraryStatus, OfflineLibraryReady } from '../components/OfflineLibraryBanner.jsx';
import { useBuildInfo, versionWords } from '../components/about-parts.jsx';
import { OfflineEditionsRow } from '../components/OfflineEditionsRow.jsx';
import { OfflineEditions, editionShownLabel } from '../../utils/offline-editions.js';
import { OPEN_YOUR_DATA_EVENT, takeYourDataAsk } from '../../utils/your-data-link.js';
import { passageLinkFor, PUBLIC_APP_URL } from '../../utils/passage-link.js';
import { siteUrl, pageTarget } from '../../utils/site-link.js';
import { passageSourceFor } from '../../utils/passage-copy.js';
import { SCRIPTURE_CHOICES, LETTER_CHOICES, endingChoice, endingKey, sharedText } from '../../utils/share-ending.js';
import { AudioPlayer } from '../../utils/audio-player.js';
import { UiIcon } from '../components/UiIcon.jsx';
import { ListRow, Segmented, SectionLabel, UiButton } from '../components/UiParts.jsx';
import { ActionSheet, SelectSheet } from '../components/SelectField.jsx';
import { SettingsNavRow, SettingsStepRow, SetRowText, DataRow, RadioRows } from '../components/SettingsRow.jsx';
import { settingsFindContext, SettingsSection, Findable, findMatches, useSettingsFind } from '../components/settings-find.jsx';
import { InstallRow } from '../components/InstallCard.jsx';

/* WS1 settings: the root's group titles (U 8.7, X-hidden 6 "Groups"), and the bar title of each group's screen. */
const GROUP_TITLES = {
  appearance: 'Appearance', reading: 'Reading', listening: 'Listening', autoscroll: 'Auto-scroll',
  features: 'Buttons and tools', share: 'Sharing', garden: 'A Return to The Garden', data: 'Your data',
  progress: 'Reading progress', help: 'Help',
};

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

function TextSizeSliderRow({ value, onChange }) {
  const v = clampFontScale(value);
  const pct = Math.round(v * 100);
  return (
    <div className="settings-row ws1-txtsize">
      {/* WS1 settings (st-look): the one preview on top, the slider between a small and a large A, the value under it. */}
      <div className="txtsize-preview">
        “Your word is a lamp to my feet and a light to my path.”
      </div>
      <div className="txtsize-controls">
        <span className="ws1-a is-small" aria-hidden="true">A</span>
        <input
          type="range"
          className="txtsize-slider"
          min="0.8"
          max="3"
          step="0.05"
          value={v}
          onChange={(e) => onChange(String(parseFloat(e.target.value)))}
          aria-label="Text size"
          aria-valuetext={pct === 100 ? 'Standard' : pct + ' percent'}
        />
        <span className="ws1-a is-large" aria-hidden="true">A</span>
      </div>
      <div className="ws1-txtsize-foot">
        <span className="txtsize-value">{pct === 100 ? 'Standard · 100%' : pct + '%'}</span>
        <span className="settings-row-grow" />
        {/* A09.11: shown only away from 100% (a disabled ghost at 30% read as broken), and named for what it does. */}
        {pct !== 100 && (
          <button
            type="button"
            className="txtsize-reset txtsize-reset-full"
            aria-label="Reset to 100%"
            onClick={() => onChange("1")}
          >Reset</button>
        )}
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
  // WS2 settings (st-auto): the wait at the end of the page as "− 2.5 s +", half a second a step, 0 to 15 s.
  const ms = clampEndDwell(value);
  const secs = Math.round(ms / 100) / 10;
  const set = (/** @type {number} */ n) => onChange(String(clampEndDwell(n)));
  return (
    <SettingsStepRow label="Wait before going on" desc="The countdown shows on the pill; Cancel stops it"
      find="auto continue pause dwell countdown" value={secs === 0 ? 'None' : secs + ' s'}
      lessLabel="Shorter wait" moreLabel="Longer wait" lessDisabled={ms <= 0} moreDisabled={ms >= 15000}
      onLess={() => set(ms - 500)} onMore={() => set(ms + 500)} />
  );
}

function AutoScrollSpeedRow({ value, onChange }) {
  // WS2 settings (st-auto): the speed card, "16 lines a minute" with Reset, then − slider +.
  const v = clampLpm(value);
  const set = (/** @type {number} */ n) => onChange(String(clampLpm(n)));
  return (
    <Findable text="speed scroll lines minute pace fast slow">
      <div className="settings-row ws2-speed">
        <div className="settings-row-head">
          <span className="settings-row-label">{v + (v === 1 ? ' line a minute' : ' lines a minute')}</span>
          <span className="settings-row-grow" />
          {v !== 16 ? <button type="button" className="txtsize-reset" onClick={() => onChange('16')}>Reset</button> : null}
        </div>
        <div className="txtsize-controls">
          <button type="button" className="settings-step-btn" aria-label="Slower" disabled={v <= 4} onClick={() => set(v - 1)}>{'−'}</button>
          <input type="range" className="txtsize-slider" min="4" max="40" step="1" value={v}
            onChange={(e) => set(Number(e.target.value))}
            aria-label="Auto-scroll speed in lines per minute"
            aria-valuetext={v + (v === 1 ? ' line' : ' lines') + ' per minute'} />
          <button type="button" className="settings-step-btn" aria-label="Faster" disabled={v >= 40} onClick={() => set(v + 1)}>+</button>
        </div>
      </div>
    </Findable>
  );
}

/* Tiny per-row confirm helpers. Each owns its own confirm state and
   renders either the row's button OR the standardized ConfirmStrip in
   the slot below the row. Defined at module scope (not inside
   SettingsScreen) so React identity stays stable across renders. */

function HistoryClearRow({ historyCount, onClearHistory }) {
  // WS2 settings (st-tools): the entry count with Clear history as a button beside it.
  const [confirming, setConfirming] = React.useState(false);
  const f = useSettingsFind('clear history entries reading history');
  if (!f.show) return null;
  return (
    <>
      <div className="settings-row ws2-history" data-found={f.place ? '' : undefined}>
        <div className="settings-row-head">
          <SetRowText place={f.place} label={<>{historyCount} {historyCount === 1 ? 'entry' : 'entries'}</>} />
          {!confirming && (
            <button type="button" className="ui-btn is-small is-danger ws2-text-btn" disabled={historyCount === 0}
              onClick={(e) => { e.stopPropagation(); setConfirming(true); }}>Clear history</button>
          )}
        </div>
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

/* NavChip — compact pill toggle for the Top bar group. */

/* SettingsGroup — collapsible section shell (Settings redesign 2026-07-31).
   Every section is an accordion group: a tappable folio header (icon, Cinzel
   label + one-line plain-language summary + chevron) over an unmounted-
   while-closed body. Unmounted, not hidden — the auto-scroll disclosure
   discipline: closed content is out of tab order and screen-reader order,
   and the screen opens as a compact 8-line overview instead of a wall.
   Module scope so React identity is stable across SettingsScreen renders. */
/* WS1 settings (st-root, 2026-11-11): each group is its own screen. `mode` says how a group draws:
   root   - one row on the Settings root (icon chip, name, current values, chevron); a tap opens its screen.
   screen - the open group's body alone (the bar carries its name); a closed group draws nothing.
   search - a matching group under its own small head, open, while the find field holds words.
   The head stays a .settings-group-head with aria-expanded in every mode, so the tour, the restore e2e and
   the tests find a group the same way they always did. */
const GROUP_ICONS = { appearance: 'sun', reading: 'book', listening: 'head', autoscroll: 'scroll', features: 'search',
  share: 'share', garden: 'img', data: 'data', progress: 'check', help: 'help' };
function SettingsGroup({ sectionId = 'settings', label, sub, open, onToggle, hidden = false, mode = 'search', tag = null, findWords = null, children = null }) {
  if (hidden) return null;
  if (mode === 'screen' && !open) return null;
  // WS2 settings (st-find): while finding, a group is no head, only its rows that match, each with its place.
  if (mode === 'search') {
    const Ctx = settingsFindContext();
    return (
      <section className="settings-section is-search open" data-settings-group={sectionId}>
        <div className="settings-group-body" id={'settings-group-' + sectionId}>
          <Ctx.Provider value={{ words: findWords || [], group: label, place: label }}>{children}</Ctx.Provider>
        </div>
      </section>
    );
  }
  const root = mode === 'root';
  return (
    <section className={'settings-section is-' + mode + (open ? ' open' : '')} data-settings-group={sectionId}>
      <button type="button" className={'settings-group-head' + (root ? ' ui-row ui-row-press' : '') + (mode === 'screen' ? ' ws1-sr-only' : '')}
        aria-expanded={open} aria-controls={open ? 'settings-group-' + sectionId : undefined} onClick={onToggle}
        tabIndex={mode === 'screen' ? -1 : undefined}>
        {root ? <span className="ui-row-lead" aria-hidden="true"><UiIcon name={GROUP_ICONS[sectionId] || 'gear'} /></span> : null}
        <span className={root ? 'ui-row-text' : 'settings-group-titles'}>
          <span className={(root ? 'ui-row-title ' : '') + 'settings-section-label'}>{label}</span>
          {sub && <span className={(root ? 'ui-row-meta ' : '') + 'settings-group-sub'}>{sub}</span>}
        </span>
        {root && tag ? <span className="ui-row-mark ws1-tag">{tag}</span> : null}
        {root ? <UiIcon name="chev" className="ui-row-chev" /> : (
          <span className={'settings-group-chevron' + (open ? ' open' : '')} aria-hidden="true">
            <svg viewBox="0 0 16 16" focusable="false"><path d="m3 6 5 5 5-5" /></svg>
          </span>
        )}
      </button>
      {open && <div className="settings-group-body" id={'settings-group-' + sectionId}>{children}</div>}
    </section>
  );
}

/** The root's cards: one .ui-group around a run of group rows, only on the root. */
function RootCard({ mode, children, last = false }) {
  if (mode === 'root') return <div className="ui-group ws1-root-card">{children}</div>;
  // WS4 settings (st-find): every found row in one card, as drawn (the groups' own cards go flat inside it; the
  // two root cards join edge to edge).
  if (mode === 'search') return <div className={'ui-group ws4-found-card' + (last ? ' is-last' : ' is-first')}>{children}</div>;
  return <>{children}</>;
}

/** WS4 settings (st-find): the typed words light up gold in each found row's name. CSS custom highlights
    (Chrome 105+) paint ranges without writing into React's DOM; without the API the rows are found, only unlit.
    @param {HTMLElement | null} el @param {string[]} words */
function paintFound(el, words) {
  const api = typeof CSS !== 'undefined' && /** @type {any} */ (CSS).highlights && typeof (/** @type {any} */ (window)).Highlight === 'function'
    ? /** @type {any} */ (CSS).highlights : null;
  if (!api) return;
  api.delete('ws4-find');
  if (!el || !words.length) return;
  const ranges = [];
  for (const t of el.querySelectorAll('[data-found] .settings-row-label, .ws4-backup-hit .ui-row-title')) {
    const node = t.firstChild;
    if (!node || node.nodeType !== 3) continue;
    const text = node.textContent || '';
    const re = /[A-Za-z0-9]+/g;
    let m;
    while ((m = re.exec(text))) {
      const w = m[0].toLowerCase();
      const q = words.filter((x) => w.startsWith(x)).sort((x, y) => y.length - x.length)[0];
      if (!q) continue;
      const r = document.createRange();
      r.setStart(node, m.index); r.setEnd(node, m.index + q.length);
      ranges.push(r);
    }
  }
  if (ranges.length) api.set('ws4-find', new (/** @type {any} */ (window)).Highlight(...ranges));
}

/* AudioRateRow — Listening → Default Speed.
   ═══════════════════════════════════════════════════════════════════════
   The one settings row with NO settings key. Playback speed has been owned
   by AudioLibraryStore.rate since the listening desk shipped: the desk
   writes it, the player rehydrates from it at every track start, backup
   carries it, and normalizeAudioRate clamps imported values into the 1 %
   domain (AUDIO_RATE_MIN..AUDIO_RATE_MAX). A settings.audioRate twin would be a second
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
  // The desk sets any 1 % rate (2026-09-21); a fine value the presets don't
  // carry is listed once as the current choice rather than rounded away.
  const listed = rates.some((rate) => Math.abs(rate - current) < 0.005) ? rates : [...rates, current].sort((a, b) => a - b);
  return (
    <SelectField
      eyebrow="Listening"
      title="Speed"
      label="Speed"
      desc="Same as the speed in the player"
      find="default rate playback fast slow"
      value={String(current)}
      options={listed.map((rate) => ({
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

/* SkipStepRow — Listening → Skip Buttons (player-1025, Corbin 10-25: "Make the 15s forward/backward button 10s by
   default, adjustable in settings (typed number, or incremented)"). One step for back and forward: the full player's
   two, the mini player's back, and in the phone app the lock screen's, notification's and headset's. − and + move it
   by 5 (to the next multiple of 5); the box takes any whole number, kept to 5-60. Module scope for a stable identity. */
const SKIP_STEP_BY = 5;
/** @param {{ value: unknown, onChange: (sec: number) => void }} props */
function SkipStepRow({ value, onChange }) {
  const clamp = (/** @type {unknown} */ v) => AudioPlayer.clampSkipSeconds(v);
  const sec = clamp(value);
  /** Text in the box while it is being typed in; null = showing the setting. */
  const [typed, setTyped] = React.useState(/** @type {string | null} */ (null));
  const set = (/** @type {number} */ n) => {
    const next = clamp(n);
    AudioPlayer.setSkipSeconds(next);
    if (next !== sec) onChange(next);
  };
  const commit = () => {
    if (typed !== null && typed.trim() !== '' && Number.isFinite(Number(typed))) set(Number(typed));
    setTyped(null);
  };
  const lo = clamp(0);
  const hi = clamp(1e9);
  const f = useSettingsFind('skip length seconds back forward jump buttons lock screen headphones');
  if (!f.show) return null;
  return (
    <div className="settings-row" data-found={f.place ? '' : undefined}>
      <div className="settings-row-head">
        <SetRowText place={f.place} label="Skip length" labelId="settings-skip-label" desc="Player, lock screen and headphones" />
        <span className="settings-step" role="group" aria-labelledby="settings-skip-label">
          <button type="button" className="settings-step-btn" aria-label="Shorter skip" disabled={sec <= lo}
            onClick={() => set(Math.ceil(sec / SKIP_STEP_BY) * SKIP_STEP_BY - SKIP_STEP_BY)}>{'−'}</button>
          <input type="number" inputMode="numeric" className="settings-step-input" aria-label="Skip seconds"
            min={lo} max={hi} step={1} value={typed === null ? String(sec) : typed}
            onFocus={() => setTyped('')} placeholder={String(sec)}
            onChange={(e) => setTyped(e.target.value)} onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); /** @type {HTMLInputElement} */ (e.target).blur(); }
              else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setTyped(null); }
            }} />
          <span className="settings-step-unit" aria-hidden="true">s</span>
          <button type="button" className="settings-step-btn" aria-label="Longer skip" disabled={sec >= hi}
            onClick={() => set(Math.floor(sec / SKIP_STEP_BY) * SKIP_STEP_BY + SKIP_STEP_BY)}>{'+'}</button>
        </span>
      </div>
    </div>
  );
}

/**
 * Songs of the Letters kept on this phone (K1): how many and how big (catalog bytes), and Manage › to the Kept
 * list. SongKeep and the Songs screens live in bundle-d/h, read here as globals; no keep store, no row.
 */
function SongsKeptRow() {
  const keep = /** @type {any} */ (globalThis).SongKeep;
  React.useSyncExternalStore(
    React.useCallback((cb) => (keep ? keep.subscribe(cb) : () => {}), [keep]),
    () => (keep ? keep.getVersion() : 0)
  );
  if (!keep || keep.availability() === 'none') return null;
  const ids = keep.keptIds();
  const missing = keep.missing();
  const fmt = /** @type {any} */ (globalThis).formatSongBytes;
  const size = (/** @type {string[]} */ list) => (typeof fmt === 'function' ? ' · ' + fmt(keep.bytesOf(list)) : '');
  const value = ids.length ? ids.length + size(ids) : missing.length ? missing.length + ' to download again' : 'None yet';
  const manage = () => {
    const open = /** @type {any} */ (window).__openSongs;
    if (typeof open === 'function') open([{ k: 'list', v: 'kept' }], 'Settings');
  };
  return (
    <Findable text="songs kept on this phone music manage">
    <div className="settings-row">
      <div className="settings-row-head">
        <span className="settings-row-label">Songs kept on this phone</span>
        <span className="settings-row-grow" />
        <button type="button" className="settings-select-trigger" aria-label={'Songs kept on this phone: ' + value + '. Manage'} onClick={(e) => { e.stopPropagation(); manage(); }}>
          <span className="settings-row-value">{value + ' · Manage'}</span>
          <UiIcon name="chev" className="ui-row-chev" />
        </button>
      </div>
    </div>
    </Findable>
  );
}

/**
 * Settings › Listening › Downloads & storage (downloads brief 3a, picture 18): what is on the phone with a bar, opening
 * the Downloads screen's On this phone tab. Only where this app keeps downloads.
 */
function DownloadsStorageRow() {
  const off = OfflineAudio;
  React.useSyncExternalStore(
    React.useCallback((cb) => (off ? off.subscribe(cb) : () => {}), [off]),
    () => (off ? off.getVersion() : 0)
  );
  const open = /** @type {any} */ (window).__openDownloads;
  if (!off || !off.available() || typeof open !== 'function') return null;
  const n = off.items().length;
  const used = off.totalBytes();
  const free = off.freeBytes();
  const fmt = (/** @type {number} */ b) => (b >= 1e9 ? (b / 1e9).toFixed(1).replace(/\.0$/, '') + ' GB' : Math.max(1, Math.round(b / 1e6)) + ' MB');
  const value = [n ? (n === 1 ? '1 recording' : n + ' recordings') + ' · ' + fmt(used) : 'None yet', free >= 0 ? fmt(free) + ' free' : ''].filter(Boolean).join(' · ');
  // WS2 settings (st-listen): one Downloads row, its line what is on the phone, opening Downloads' On this phone tab.
  return <SettingsNavRow label="Downloads" desc={value} find="storage audio offline recordings space free"
    onClick={() => open({ tab: 'phone' }, 'Settings')} />;
}

/* WS3 settings (st-data, st-data2): one Your data row: the name, one plain line, then a value, a pill or a button. */
/* FSET (st-root): the About row says the facts, "Version 1.0.2 · up to date · What's new". Its own component, so the
   build check runs only while the root is showing. @param {{ onAbout: () => void }} props */
function AboutRootRow({ onAbout }) {
  const [buildInfo] = useBuildInfo();
  const v = versionWords(buildInfo);
  const verdict = buildInfo.state !== 'ok' || !buildInfo.server ? null
    : buildInfo.server.cacheVersion === (buildInfo.running && buildInfo.running.cacheVersion) ? 'up to date' : 'update ready';
  const meta = [v.title !== 'Version' ? v.title : 'Version', verdict, 'What’s new'].filter(Boolean).join(' · ');
  return <ListRow icon="info" title="About VOTReader" meta={meta} onClick={onAbout} />;
}

/* The Growth row's line (BACKLOG [30]: the sentence is the feature). The mock draws the line and the size, no bars. */
function growthLine(samples) {
  const first = samples[0];
  const delta = samples[samples.length - 1].b - first.b;
  const how = delta > 0 ? 'Grown by ' + formatBytes(delta) : delta < 0 ? 'Shrunk by ' + formatBytes(-delta) : 'Stayed level';
  return 'How fast your data grows. ' + how + ' across ' + samples.length + ' measurements since ' + first.d + '.';
}

/* WS3 settings (st-restore, st-verify): what a backup file holds, one line per kind. */
function BackupCounts({ s }) {
  const rows = [['Notes', s.notes], ['Highlights', s.highlights], ['Journal entries', s.journal], ['Bookmarks', s.bookmarks]];
  if (s.annotatedPassages) rows.splice(2, 0, ['Annotated passages', s.annotatedPassages]);
  return (
    <div className="ui-group is-inset ws3-counts">
      {rows.map(([k, n]) => (
        <div key={k} className="ws3-count"><span>{k}</span><span className="ws3-count-n">{Number(n || 0).toLocaleString('en-US')}</span></div>
      ))}
    </div>
  );
}

/** "9 November 2026" from an export date; '' when there is none. @param {string | null | undefined} iso */
function _backupDay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** The check's verdict, its sub line and its plain line, from the report backup-flow hands over. */
function _verifyWords(r) {
  const s = r.summary || null;
  const damaged = ['mismatch', 'malformed', 'trailing', 'truncated'].indexOf(r.integrity) >= 0;
  const title = !s ? 'This file could not be checked' : r.level === 'ok' ? 'This backup is intact'
    : damaged ? 'This backup may be damaged' : 'This backup could not be fully checked';
  let sub = null;
  if (s) {
    const how = r.kind === 'legacy' ? 'older format, no checksum' : r.integrity === 'ok' ? 'integrity check passed'
      : r.integrity === 'absent' ? 'no checksum in this file' : damaged ? 'integrity check failed' : 'the check did not finish';
    sub = (_backupDay(s.date) ? 'Backup from ' + _backupDay(s.date) + ' · ' : '') + how;
  }
  let line = r.message;
  if (s && r.level === 'ok') {
    line = s.records.toLocaleString('en-US') + (s.records === 1 ? ' record' : ' records') + ' across ' + s.storeCount
      + (s.storeCount === 1 ? ' data store' : ' data stores')
      + (s.mediaCount ? ', plus ' + s.mediaCount + (s.mediaCount === 1 ? ' media file' : ' media files') + (s.mediaBytes ? ' (' + formatBytes(s.mediaBytes) + ')' : '') : '')
      + '.' + (s.mediaCount && r.integrity === 'ok' ? ' Photos and voice memos were checked for size, not content.' : '');
  }
  return { s, title, sub, line };
}

/* TranslationInfoDesc — the Bible Translation row's More page (WS4 settings, st-restored): the Restored Name
   editions as a readable page (mock settings.html st-restored): the Name, the count, the rules as "X becomes Y"
   cards (four, then Three more rules), and the AI-assistance note (owner directive 2026-07-12). The full evidence
   trail and the generator live in RESTORED-NAMES-PLAN.txt / tools/gen-restored-nt.mjs; this is the reader's summary. */
const RESTORED_RULES = [
  ['Jesus', 'YahuShua', '“YAH Is Salvation” (Zechariah 6:11). The naming verses and the cross inscription keep their capitals: YAHUSHUA (Matthew 1:21; John 19:19).'],
  ['Jesus Christ', 'YahuShua HaMashiach', 'Christ Jesus too: always in the commanded order of the Name.'],
  ['Christ', 'HaMashiach', '“Ha” is Hebrew for “the,” so “the Christ” becomes simply HaMashiach (Matthew 16:16).'],
  ['False christs', 'false messiahs', 'A generic plural, not His title. “Antichrist” and “Christian” are unchanged.'],
  ['His Christ', 'His Mashiach', 'Hebrew never puts “Ha” on a possessed title (Acts 4:26): “the Lord’s Mashiach” (Luke 2:26), “called Mashiach” (Matthew 1:16), “both Lord and Mashiach” (Acts 2:36).'],
  ['Messiah, in John’s notes', 'the Anointed', 'John’s translation notes render the meaning, so they don’t repeat themselves (John 1:41; 4:25).'],
  ['Bar-Jesus, Justus', 'unchanged', 'Other bearers of the name are untouched (Acts 13:6; Colossians 4:11), and the KJV’s two Joshua verses (Acts 7:45; Hebrews 4:8) now read “Joshua,” as in the NKJV.'],
];
function TranslationInfoDesc() {
  const [all, setAll] = React.useState(false);
  const rules = all ? RESTORED_RULES : RESTORED_RULES.slice(0, 4);
  return (
    <>
      <p className="ws4-rn-quote">“His name is YahuShua HaMashiach”</p>
      <p className="ws4-rn-src">“Death and Deliverance”; “Proclaim The Name of The Lord”</p>
      <p>These editions restore the Name across the New Testament: <strong>1,212 NKJV and 1,217 KJV verses</strong>, each
        checked against the Textus Receptus, the Greek text behind both versions. The Old Testament is not yet restored.</p>
      <div className="ws4-rn-rules">
        {rules.map(([from, to, why]) => (
          <div key={from} className="ws4-rn-rule">
            <div className="ws4-rn-pair"><span className="ws4-rn-from">{from}</span><span className="ws4-rn-arrow">becomes</span><span>{to}</span></div>
            <div className="ws4-rn-why">{why}</div>
          </div>
        ))}
        <button type="button" className="ws4-rn-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? 'Fewer rules' : 'Three more rules'}<UiIcon name="down" size="sm" />
        </button>
      </div>
      <p><strong>Please note:</strong> the Restored Name editions were prepared with AI assistance (Claude Fable 5, 2026).
        Every change was rule-generated and machine-checked against the Greek, but errors are possible. Where a rendering
        matters, compare the base NKJV or KJV.</p>
    </>
  );
}

/* WS3 settings (st-prog): a Reading progress row: the name over a thin bar, "N of M", and Clear, which asks first. */
function ProgressRow({ label, read, total, canClear, onClear, question, open = false, onToggle = null, sub = false }) {
  const [confirming, setConfirming] = React.useState(false);
  if (confirming) {
    return (
      <ConfirmStrip question={question} yesLabel="Yes, clear"
        onCancel={() => setConfirming(false)} onConfirm={() => { onClear(); setConfirming(false); }} />
    );
  }
  const pct = total > 0 ? Math.min(100, Math.round((read / total) * 100)) : 0;
  const tally = <span className="progress-row-tally">{read.toLocaleString('en-US')} of {total.toLocaleString('en-US')}</span>;
  const name = (
    <span className="ws3-prog-name">
      <span className="progress-row-label">{label}</span>
      {sub ? null : <span className="ui-progress ws3-prog-bar" aria-hidden="true"><span style={{ width: pct + '%' }} /></span>}
    </span>
  );
  return (
    <div className={'progress-row ws3-prog-row' + (sub ? ' is-sub' : '')}>
      {onToggle ? (
        <button type="button" className="progress-section-toggle" aria-expanded={open} onClick={(e) => { e.stopPropagation(); onToggle(); }}>
          <span className="ws3-prog-chev" aria-hidden="true"><UiIcon name={open ? 'down' : 'chev'} size="sm" /></span>
          {name}{tally}
        </button>
      ) : <>{name}{tally}</>}
      <button type="button" className={'settings-clear-btn ws3-clear' + (sub ? ' is-text' : '')} aria-label={'Clear ' + label}
        disabled={!canClear} onClick={(e) => { e.stopPropagation(); setConfirming(true); }}>Clear</button>
    </div>
  );
}

function ClearAllMarks({ canClear, onClearAll }) {
  const [confirming, setConfirming] = React.useState(false);
  return (
    <div className="ws3-clear-all">
      {confirming ? (
        <ConfirmStrip question="Clear all read marks and saved positions? Reading totals and streaks are kept." yesLabel="Yes, clear"
          onCancel={() => setConfirming(false)} onConfirm={() => { onClearAll(); setConfirming(false); }} />
      ) : (
        <UiButton wide danger className="ws3-clear-all-btn" disabled={!canClear} onClick={() => setConfirming(true)}>Clear all read marks</UiButton>
      )}
      <p className="ws3-foot">Clearing removes read marks and saved positions. Totals and streaks are kept.</p>
    </div>
  );
}

const _daysAgo = (/** @type {number} */ at) => daysAgo(at);

/** The live streak dwell in words ("20 seconds", "1 minute"), from settings.dwellMs (A09.12). @param {unknown} ms */
function _dwellWords(ms) {
  const n = Number(ms);
  const secs = Math.round((Number.isFinite(n) && n > 0 ? n : 20000) / 1000);
  if (secs === 60) return '1 minute';
  return secs + (secs === 1 ? ' second' : ' seconds');
}

/** datasafe 10-05: when this device last finished an export (backup-flow.js LAST_EXPORT_KEY). */
function _lastBackupAt() {
  let at = 0;
  try { at = Number(localStorage.getItem('vot-last-export')) || 0; } catch (_e) { /* no storage */ }
  return at;
}
function _lastBackupText() {
  const at = _lastBackupAt();
  return at ? 'Exported ' + _daysAgo(at) : 'Not exported from this device yet';
}

/** @param {{ where: string | null, count: number, newestAt: number, tooBig?: number }} st */
function _snapshotText(st) {
  // ds5 s34.1: past the cap no copy is taken; say so where the copies are described.
  if (st.tooBig) return 'Paused: your library is too big for an automatic copy (' + Math.round(st.tooBig / 1048576) + ' MB). Back up now to keep a copy.';
  if (!st.count) return 'The first is taken shortly after the app opens';
  const where = st.where === 'phone' ? 'kept on this phone' : 'kept in this browser (cleared with its site data)';
  return 'Newest ' + _daysAgo(st.newestAt) + ' · ' + st.count + ' ' + where;
}

/** dl-weekly: the weekly copy in Downloads. @param {{ on: boolean, count: number, newestAt: number, failure?: any }} w */
function _weeklyText(w) {
  if (!w.on) return 'Off';
  // id-datasafe 159: a copy that failed says so, and when the next try is.
  if (w.failure && w.failure.reason === 'too-big') return 'Paused: your library is too big for this copy. Back up now keeps all of it';
  if (w.failure) return 'The last copy could not be saved (' + _daysAgo(w.failure.at) + '). The app tries again a day later';
  if (!w.count) return 'Once a week to Downloads/VOTReader (the last 4 kept)';
  return 'Newest ' + _daysAgo(w.newestAt) + ' · in Downloads/VOTReader, the last 4 kept';
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
/** Settings › Sharing › Links I share point to (cp3): the link a tap on Share sends. WS2 settings (st-share): website first. */
const SHARE_LINK_OPTIONS = [
  { id: 'site', label: 'The website', desc: 'Opens the letter on thevolumesoftruth.com, for anyone, with a connection' },
  { id: 'app', label: 'The app', desc: 'Opens the passage in VOTReader, even offline, for anyone who has the app' },
];
/** The preview's words, quoted as passage-copy's quotedPassage quotes them (ASCII double quotes). */
export const SHARE_PREVIEW_QUOTE = '"The words you picked"';
/** The link the preview shows under its words: the one Share would send for The Wide Path's first paragraph,
    from passage-link (the app) or site-link (the website, the words as a text fragment when Highlight is on).
    @param {'app' | 'site'} which @param {boolean} highlight */
export function sharePreviewLink(which, highlight) {
  if (which === 'app') return passageLinkFor('letter:the-wide-path:1') || PUBLIC_APP_URL;
  return siteUrl(pageTarget('The Wide Path'), highlight ? [['The', 'words', 'you', 'picked']] : undefined);
}

/** SHARE1: the preview's two passages, named by the same functions Copy and Share use (utils/passage-copy.js
    passageSourceFor, with the reader's translation), so the preview says what the real text will. The Wide Path is
    named from its data when Volume Two is loaded, else from the same parts written out.
    @param {Record<string, any>} settings */
function previewSources(settings) {
  const highlight = !!settings.linkHighlight;
  const words = [['The', 'words', 'you', 'picked']];
  let scripture = null, letter = null;
  try { scripture = passageSourceFor(['bible:john:3:16']); } catch (_e) { scripture = null; }
  try { letter = passageSourceFor(['letter:the-wide-path:1'], words); } catch (_e) { letter = null; }
  return {
    scripture: scripture || { kind: /** @type {'scripture'} */ ('scripture'), place: 'John 3:16', translation: 'NKJV', title: 'John 3:16',
      citation: 'John 3:16 (NKJV)', siteLink: '', appLink: passageLinkFor('bible:john:3:16') || PUBLIC_APP_URL },
    letter: letter || { kind: /** @type {'letter'} */ ('letter'), place: 'Volume Two, Letter 1: The Wide Path', translation: '',
      title: 'The Wide Path', citation: 'Volume Two, Letter 1: The Wide Path \u00B7 3/28/05',
      siteLink: sharePreviewLink('site', highlight), appLink: sharePreviewLink('app', highlight) },
  };
}
export const SHARE_PREVIEW_VERSE = 'For God so loved the world that He gave His only begotten Son';

/** SHARE1: exactly what Copy or Share sends for the preview's passage of this kind, with these settings.
    @param {'copy' | 'share'} action @param {'scripture' | 'letter'} kind @param {Record<string, any>} settings */
export function sharePreviewText(action, kind, settings) {
  const src = previewSources(settings)[kind];
  return sharedText(kind === 'scripture' ? SHARE_PREVIEW_VERSE : 'The words you picked', src, { action, settings });
}

/** One preview text as the card shows it: the words, then each added paragraph, a line per line; links in gold.
    @param {{ text: string }} props */
function SharePreviewSample({ text }) {
  const paras = text.split('\n\n');
  return (
    <div className="ws2-share-sample">
      <p className="ws2-share-quote">{paras[0]}</p>
      {paras.slice(1).map((para, i) => (
        <p key={i} className="ws2-share-link">
          {para.split('\n').map((line, j) => <span key={j} className={'ws2-share-line' + (/^https?:/.test(line) ? '' : ' is-ref')}>{line}</span>)}
        </p>
      ))}
    </div>
  );
}

/** Settings > Sharing > When I copy / When I share: From the Scriptures and From the letters (the shared select
    rows), then what each sends for a sample passage. @param {{ action: 'copy' | 'share', settings: Record<string, any>,
    onSetting: (k: string, v: any) => void, preview: boolean }} props */
function ShareEndingSection({ action, settings, onSetting, preview }) {
  const heading = action === 'copy' ? 'When I copy' : 'When I share';
  const verb = action === 'copy' ? 'copy copied clipboard' : 'share shared send';
  return (
    <SettingsSection label={heading}>
      <SelectField eyebrow={heading} label="From the Scriptures" desc="A Bible passage"
        find={verb + ' scripture bible verse reference range translation version link'}
        value={endingChoice(settings, action, 'scripture')} options={SCRIPTURE_CHOICES}
        onChange={(v) => onSetting(endingKey(action, 'scripture'), v)} />
      <SelectField eyebrow={heading} label="From the letters" desc="And the other writings with a page on the website"
        find={verb + ' letter letters title citation date volume link website'}
        value={endingChoice(settings, action, 'letter')} options={LETTER_CHOICES}
        onChange={(v) => onSetting(endingKey(action, 'letter'), v)} />
      {preview ? (
        <div className="ws2-share-preview" aria-label={action === 'copy' ? 'What a copy looks like' : 'What a share looks like'}>
          <SharePreviewSample text={sharePreviewText(action, 'scripture', settings)} />
          <SharePreviewSample text={sharePreviewText(action, 'letter', settings)} />
        </div>
      ) : null}
    </SettingsSection>
  );
}

/* WS2 settings (st-arrows, X-hidden 6 "Chapter & Letter Arrows"): the picker says where the arrows sit, each with a
   small picture, and no option calls itself the default. Same ids and settings.arrowLayout key as index.html's list. */
const ARROW_WORDS = {
  split: ['One on each side', 'Arrows on opposite edges of the page'],
  right: ['Both on the right', 'For one-thumb reach, right hand'],
  left: ['Both on the left', 'For one-thumb reach, left hand'],
  nav: ['In the top bar', 'Two small arrows beside the title'],
  off: ['Hidden', 'Use the Previous and Next cards at the end of the page'],
};
const ARROW_DOTS = { split: [[3, 14], [25, 14]], right: [[25, 10], [25, 18]], left: [[3, 10], [3, 18]], nav: [[10, 3], [18, 3]], off: [] };
/** @param {{ id: string }} props */
function ArrowPicture({ id }) {
  return (
    <svg viewBox="0 0 28 28" width="28" height="28" focusable="false">
      {[9, 13, 17, 21].map((y) => <rect key={y} x="7" y={y} width="14" height="1.6" rx=".8" className="ws2-pic-line" />)}
      {(ARROW_DOTS[/** @type {'off'} */ (id)] || []).map(([x, y]) => <circle key={x + '-' + y} cx={x} cy={y} r="2.4" className="ws2-pic-dot" />)}
    </svg>
  );
}
function arrowOptions() {
  const list = typeof ARROW_LAYOUT_OPTIONS !== 'undefined' && Array.isArray(ARROW_LAYOUT_OPTIONS) ? ARROW_LAYOUT_OPTIONS : [];
  return list.map((/** @type {any} */ o) => {
    const w = ARROW_WORDS[/** @type {'off'} */ (o.id)];
    return { id: o.id, label: w ? w[0] : o.label, desc: w ? w[1] : o.desc, lead: <ArrowPicture id={o.id} /> };
  });
}

/* WS2 settings (st-find): the group topic table that opened whole groups is gone; each row is found by its own name,
   line and a few synonyms (the `find` words on the row), utils in components/settings-find.jsx. */
const BACKUP_WORDS = 'keep backup back up export save copy safe restore';

export function SettingsScreen({ settings, onToggle, onSetting, onBack, backLabel, onSearch: _onSearch, onHistory: _onHistory, theme, onThemeChange, readItems, onClearBook, onClearAll, onClearHistory, historyCount, onAbout = null, initialGroups = null, onSearchLibrary = null, onOpenPlans = null, onOpenGarden = null, onOpenProgress = null }) {
  const bibleVer = React.useSyncExternalStore(
    React.useCallback((cb) => (typeof window.__bibleCorpus !== 'undefined') ? window.__bibleCorpus.subscribe(cb) : () => {}, []),
    () => (typeof window.__bibleCorpus !== 'undefined') ? window.__bibleCorpus.getVersion() : 0
  );
  const votVer = React.useSyncExternalStore(
    React.useCallback((cb) => (typeof window.__votCorpus !== 'undefined') ? window.__votCorpus.subscribe(cb) : () => {}, []),
    () => (typeof window.__votCorpus !== 'undefined') ? window.__votCorpus.getVersion() : 0
  );
  // The Studies rows count Matthew and the Bible studies (mw17 A09.3).
  const matthewVer = React.useSyncExternalStore(
    React.useCallback((cb) => (typeof window.__matthewCorpus !== 'undefined') ? window.__matthewCorpus.subscribe(cb) : () => {}, []),
    () => (typeof window.__matthewCorpus !== 'undefined') ? window.__matthewCorpus.getVersion() : 0
  );
  // U09.2: the Bible Translation value says "· NKJV until it downloads" while that is what the Bible shows. The
  // Editions row beside it reads the caches; this only re-renders when it does.
  React.useSyncExternalStore(OfflineEditions.subscribe, OfflineEditions.getVersion);
  const [studiesTick, setStudiesTick] = React.useState(0);
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof ReadingStatsStore !== 'undefined') ? ReadingStatsStore.subscribe(cb) : () => {}, []),
    () => (typeof ReadingStatsStore !== 'undefined') ? ReadingStatsStore.getVersion() : 0
  );
  const [openSections, setOpenSections] = React.useState(new Set());
  // Accordion state for the top-level setting GROUPS (redesign 2026-07-31).
  // All collapsed on entry — the screen reads as a scannable table of
  // contents; session-local on purpose (a fresh visit starts compact).
  // WS1 settings: the open set IS the screen. Empty: the root (every group a row). One id: that group's
  // screen. `initialGroups` opens screens on arrival (the tests open them all; a deep link opens one).
  const [openGroups, setOpenGroups] = React.useState(() => new Set(initialGroups || []));
  const [settingsQuery, setSettingsQuery] = React.useState('');
  const settingsFindRef = React.useRef(null);
  const queryWords = settingsQuery.toLowerCase().replace(/[’'“”"]/g, '').trim().split(/[\s-]+/).filter(Boolean);
  const searching = queryWords.length > 0;
  const mode = searching ? 'search' : (openGroups.size ? 'screen' : 'root');
  // WS2 settings (st-find): while finding, every group draws its matching rows; the rows decide (settings-find.jsx).
  const groupOpen = (id) => searching || openGroups.has(id);
  // st-quality: on the root, the Garden row opens its picker directly.
  const [gardenPick, setGardenPick] = React.useState(false);
  const toggleGroup = (id) => setOpenGroups((prev) => {
    if (!searching && prev.size === 0) return new Set([id]);
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  // Auto-scroll is a screen inside Reading (st-auto): no row of its own on the root.
  const groupProps = (id) => ({ sectionId: id, mode, label: GROUP_TITLES[id], open: groupOpen(id), findWords: queryWords,
    hidden: mode === 'root' && id === 'autoscroll',
    onToggle: mode === 'root' && id === 'garden' ? () => setGardenPick(true) : () => toggleGroup(id) });
  const openScreen = (id) => setOpenGroups(new Set([id]));
  const screenTitle = mode === 'screen' ? GROUP_TITLES[[...openGroups][0]] || 'Settings' : 'Settings';
  const goUp = () => {
    if (mode === 'screen') { setOpenGroups(openGroups.has('autoscroll') && openGroups.size === 1 ? new Set(['reading']) : new Set()); return; }
    if (typeof onBack === 'function') onBack();
  };
  const changeSettingsQuery = (value) => setSettingsQuery(value);
  // The count of found rows, read off the page once they have drawn (each found row carries data-found).
  const groupsRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const [foundCount, setFoundCount] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = groupsRef.current;
    setFoundCount(searching && el ? el.querySelectorAll('[data-found]').length : 0);
  }, [searching, settingsQuery, settings, historyCount]);
  React.useLayoutEffect(() => {
    paintFound(searching ? groupsRef.current : null, queryWords);
    return () => paintFound(null, []);
  });
  // WS4 settings: the phone's Back inside a group's screen goes up to Settings (or Reading), as the bar's Back does,
  // instead of leaving Settings (window.__screenBack, the screen-internal level hooks/use-android-back.js calls).
  React.useEffect(() => {
    if (mode !== 'screen') return undefined;
    const fn = () => { goUp(); return true; };
    window.__screenBack = fn;
    return () => { if (window.__screenBack === fn) window.__screenBack = null; };
  });
  const backupHit = searching && findMatches(queryWords, BACKUP_WORDS);
  const progressOpen = !searching && openGroups.has('progress');
  // Only the progress table needs the corpora. Changing a font or exporting
  // a backup must not parse the whole library as a side effect.
  // The Studies rows need Matthew and the Bible studies too: without them the
  // table read Studies 0 / 0 on a first open (mw17 A09.3, as My Progress loads them).
  React.useEffect(() => {
    if (!progressOpen) return undefined;
    for (const load of [window.__loadBibleCorpus, window.__loadVotCorpus, window.__loadMatthewCorpus]) {
      if (typeof load === 'function') load().catch((e) => console.warn('Progress corpus load failed', e));
    }
    let alive = true;
    if (typeof loadBibleStudies === 'function') {
      Promise.resolve(loadBibleStudies())
        .then(() => { if (alive) setStudiesTick((t) => t + 1); })
        .catch((e) => console.warn('Progress studies load failed', e));
    }
    return () => { alive = false; };
  }, [progressOpen]);
  // "Show me around" (review-tutorial): when the tour's stop needs a group open
  // (the backup stop rings Export inside Your Data), open it — whether Settings
  // mounted for the stop or was already on screen when the tour started here.
  const _tour = typeof TourController !== 'undefined' ? TourController : null;
  React.useSyncExternalStore(
    React.useCallback((cb) => (_tour ? _tour.subscribe(cb) : () => {}), [_tour]),
    () => (_tour ? _tour.getVersion() : 0)
  );
  const startTour = () => { if (typeof TourController !== 'undefined') TourController.start('settings'); };
  const _tourGroup = _tour ?(() => { const t = _tour.getState(); return t.active && t.step && t.step.settingsGroup; })() : null;
  React.useEffect(() => {
    // One screen at a time: the stop's group replaces the one showing (PL-SETTINGS 1).
    if (_tourGroup) setOpenGroups((prev) => (prev.has(_tourGroup) ? prev : new Set([_tourGroup])));
  }, [_tourGroup]);
  // id-datasafe2 171: "Open Your Data" (the write-failure toast) lands here with the group
  // open and in view, whether Settings mounts for it or was already on screen.
  React.useEffect(() => {
    const take = () => {
      if (!takeYourDataAsk()) return;
      setSettingsQuery('');
      setOpenGroups((prev) => (prev.has('data') ? prev : new Set(['data'])));
      setTimeout(() => {
        const el = document.querySelector('[data-settings-group="data"]');
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' });
      }, 0);
    };
    take();
    window.addEventListener(OPEN_YOUR_DATA_EVENT, take);
    return () => window.removeEventListener(OPEN_YOUR_DATA_EVENT, take);
  }, []);

  // W2.5 — navigator.storage estimate + persist. The hook reads once
  // on mount; the derived display strings below pick the right text
  // for each (status, persisted, persistDenied) combination.
  const storageInfo = useStorageInfo();

  // datasafe 10-05: the automatic snapshots' line in Your Data (DataSafety lives in bundle-b).
  const [safety, setSafety] = React.useState(/** @type {{ where: string | null, count: number, newestAt: number, tooBig?: number } | null} */ (null));
  // dl-weekly: the weekly copy in Downloads (phone app, Android 10+).
  const [weekly, setWeekly] = React.useState(/** @type {{ supported: boolean, on: boolean, count: number, newestAt: number } | null} */ (null));
  React.useEffect(() => {
    if (typeof DataSafety !== 'undefined' && typeof DataSafety.weeklyStatus === 'function') setWeekly(DataSafety.weeklyStatus());
  }, []);
  const toggleWeekly = React.useCallback(() => {
    if (typeof DataSafety === 'undefined' || !weekly) return;
    DataSafety.setWeeklyOn(!weekly.on);
    setWeekly(DataSafety.weeklyStatus());
  }, [weekly]);
  React.useEffect(() => {
    let alive = true;
    if (typeof DataSafety !== 'undefined' && typeof DataSafety.status === 'function') {
      DataSafety.status().then((st) => { if (alive) setSafety(st); }, () => {});
    }
    return () => { alive = false; };
  }, []);
  // WS3 settings (st-data): Protection is a line and a pill; "Protect now" stays the button where the browser can be asked.
  const protection = (() => {
    if (storageInfo.status === 'loading') return { line: 'Checking…', pill: null };
    if (storageInfo.status === 'unavailable') return { line: 'This browser cannot protect stored data. Back up regularly to keep it safe.', pill: null };
    if (storageInfo.persisted) return { line: 'Your data is protected from automatic browser cleanup.', pill: 'Protected' };
    if (storageInfo.persistDenied) return { line: 'The browser said no. Back up regularly to keep it safe.', pill: 'Not protected' };
    if (storageInfo.persistable) return { line: 'Ask the browser to keep your data safe from automatic cleanup.', pill: null };
    // No lever here (installed app / Android APK / a Chromium browser that auto-decided / Safari): the data still
    // lives on this device; the honest guidance is to keep a backup.
    // The pill names where the data is, not a protection: this row cannot see whether anything backs it up.
    return { line: 'Your data is saved on this device. Back up regularly to keep it safe.', pill: 'On this device' };
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
  // never a timer and never at boot (the effect runs only when Settings mounts), so
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
  const storagePct = storageInfo.usage != null && storageInfo.quota ? Math.min(100, Math.max(1, Math.round((storageInfo.usage / storageInfo.quota) * 100))) : 0;
  const appDataDisplayText = storageInfo.status === 'loading' ? 'Checking…'
    : storageInfo.status === 'unavailable' ? 'Storage info unavailable on this browser.' : 'Storage info partially unavailable.';
  const userDataLine = 'Highlights, notes, journal, bookmarks, links, reading progress and history. This is what a backup holds.'
    + (userData && userData.mediaCount > 0
      ? ' Includes ' + (userData.mediaCount === 1 ? '1 journal photo or memo' : userData.mediaCount + ' journal photos and memos') + ' (' + formatBytes(userData.media) + ').'
      : '');

  const [wipeConfirm, setWipeConfirm] = React.useState(false);
  const [wipeText, setWipeText] = React.useState('');
  // What the dialog's own "Back up first" came to: null (not pressed, or running), 'saved', or 'none' (cancelled or failed).
  const [wipeBackup, setWipeBackup] = React.useState(/** @type {null | 'saved' | 'none'} */ (null));
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
  const backupReloadTimerRef = React.useRef(0);
  /**
   * A reload scheduled by utils/backup-flow.js's _scheduleBackupReload (after
   * an import applied, or Clear All): if the reader leaves before that lands,
   * reload NOW rather than never.
   *
   * Unmount means they navigated: app.jsx renders `<ErrorBoundary key={screen}>`
   * so the route subtree unmounts exactly when `screen` changes, and 'settings'
   * is a single route entry with no peek clone and no keyed remount.
   *
   * CANCELLING WOULD BE THE WRONG FIX. Both callers run after storage has been
   * REPLACED (an import applied) or WIPED, and the reload is what reboots into
   * it — _runBackupOperation even holds the busy lock through the window
   * because "a second picker/stream against data that is about to be torn down"
   * is the hazard. Cancel, and a reader who navigates at second two browses a
   * UI backed by stale in-memory state over replaced storage, with no reload
   * ever: a visible interruption traded for an invisible wrong answer.
   *
   * It fires on the REF, not on "a timer id exists" — the ref is the flag that
   * says storage was replaced, and clearing it before reload() is what keeps
   * this to exactly once even under a double-invoked cleanup.
   *
   * DELIBERATE CONSEQUENCE: an ErrorBoundary catch inside Settings also unmounts
   * this subtree, so a crash with a reload pending reloads. That is wanted — a
   * crash on the screen that just replaced storage is the last moment to still
   * be running against the old state.
   */
  React.useEffect(() => () => {
    if (backupReloadTimerRef.current) {
      window.clearTimeout(backupReloadTimerRef.current);
      backupReloadTimerRef.current = 0;
    }
    if (backupReloadPendingRef.current) {
      backupReloadPendingRef.current = false;
      window.location.reload();
    }
  }, []);
  const [backupBusy, setBackupBusy] = React.useState(false);
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
  // _confirmDegradeApplyReload in utils/backup-flow.js. Registered for the same Back/Escape reason.
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
  // WS3 settings (st-restore): the confirm is an ActionSheet with this id; it registers itself and traps focus.
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
  // The backup flows live in utils/backup-flow.js (v15-code-health-05); this
  // screen hands them its state and renders their rows and dialogs.
  const {
    _runBackupOperation, _runLockedBackupOperation,
    exportPersonalData, importPersonalData, verifyBackupFile, clearAllPersonalData,
  } = createBackupFlow({
    busyRef: backupBusyRef,
    reloadPendingRef: backupReloadPendingRef,
    reloadTimerRef: backupReloadTimerRef,
    setBusy: setBackupBusy,
    setVerifyReport,
    // FIRE-AND-AWAIT (see importConfirmResolveRef above): the sheet settles the
    // promise from every dismiss path, so the import's own cleanup brackets it.
    confirmImport: (message, details) => new Promise((resolve) => {
      importConfirmResolveRef.current = resolve;
      setImportConfirm({ message, ...(details || {}) });
    }),
    diagnosticLog,
  });

  /* The Mark-as-Read group table + per-source read counting live in
     utils/progress-stats.js (a bundle-d window global, shared with the
     My Progress dashboard). buildProgressGroups() returns [] until the
     BOOKS + VOT corpora are loaded — the subscriptions above re-render
     this screen when they land. */
  // Built when a corpus lands, not on every keystroke in the find box (s23.2). The
  // corpora themselves are keys too: a screen that loaded one bumps no tick here.
  const _matthewNow = typeof MATTHEW !== 'undefined' ? MATTHEW : null;
  const _studiesNow = typeof BIBLE_STUDIES !== 'undefined' ? BIBLE_STUDIES : null;
  const PROGRESS_GROUPS = React.useMemo(() => buildProgressGroups(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- buildProgressGroups reads the lazy corpora as globals; these keys say when they changed
    [bibleVer, votVer, matthewVer, studiesTick, _matthewNow, _studiesNow]);
  const countFor = (bid) => countReadFor(readItems, bid);
  const frontierData = (typeof ReadingStatsStore !== 'undefined' && typeof ReadingStatsStore.get === 'function')
    ? ReadingStatsStore.get()
    : null;
  const frontierKeys = Object.keys((frontierData && frontierData.progress) || {})
    .filter((key) => key.indexOf(`${READ_VERSION_ID}:`) === 0);
  const hasFrontierFor = (bid) => frontierKeys.some((key) => key.indexOf(`${READ_VERSION_ID}:${bid}:`) === 0);
  // The numerator counts the same books the denominator sums. Answers and Hidden Manna marks
  // (v1:answers:*, v1:hidden-manna:*) have no row here, so counting every readItems key let
  // "All Scriptures" pass the sum of the rows, and even its own total (sweep v075).
  const { totalRead, totalItems } = React.useMemo(() => {
    const allBooks = PROGRESS_GROUPS.flatMap((g) => g.genres.flatMap((gr) => gr.books));
    return {
      totalRead: allBooks.reduce((s, b) => s + countReadFor(readItems, b.id), 0),
      totalItems: allBooks.reduce((s, b) => s + b.total, 0),
    };
  }, [PROGRESS_GROUPS, readItems]);
  // Clear All wipes every read mark, off-table ones too, so it stays live while any exists.
  const hasAnyMark = Object.keys(readItems || {}).length > 0;
  const sectionBooks = (grp) => grp.genres.flatMap((gr) => gr.books);
  const sectionRead = (grp) => sectionBooks(grp).reduce((s, b) => s + countFor(b.id), 0);
  const sectionTotal = (grp) => sectionBooks(grp).reduce((s, b) => s + b.total, 0);
  const toggleSection = (id) => setOpenSections((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });


  const textScalePercent = Math.round(clampFontScale(settings.fontScale || '1') * 100);
  const bibleAudioEd = settings.bibleAudio === 'off' ? null
    : (/** @type {any} */ (globalThis).BIBLE_AUDIO_EDITIONS || {})[settings.bibleAudio || 'brm-kjv'];
  const bibleAudioShown = settings.bibleAudio === 'off' ? 'Off' : (bibleAudioEd && bibleAudioEd.label) || null;
  const selectedFont = typeof readingFontById === 'function'
    ? readingFontById(settings.fontStyle || 'classic')
    : null;
  const selectedFontLabel = selectedFont && selectedFont.label ? selectedFont.label : 'System Serif';
  // Each group's current values, shown under its name (the redesign, 2026-09-25; utils/settings-glance.js).
  const readerCode = settings.letterReader || 'auto';
  const readersById = /** @type {any} */ (globalThis).AUDIO_READERS || {};
  const readerLabel = readerCode !== 'auto' && Object.prototype.hasOwnProperty.call(readersById, readerCode)
    ? String(readersById[readerCode]).replace(/^Read by /, '') : null;
  const gardenTier = typeof GARDEN_TIERS !== 'undefined'
    ? GARDEN_TIERS.find((t) => t.id === (settings.gardenTier || GARDEN_DEFAULT_TIER)) : null;
  const translationOpt = typeof TRANSLATION_OPTIONS !== 'undefined' && Array.isArray(TRANSLATION_OPTIONS)
    ? TRANSLATION_OPTIONS.find((/** @type {any} */ o) => o && o.id === (settings.translation || 'nkjv')) : null;
  const glance = settingsGlance({
    settings, theme, translationLabel: translationOpt ? translationOpt.label : null, textPercent: textScalePercent, fontLabel: selectedFontLabel,
    readerLabel, gardenLabel: gardenTier ? gardenTier.label + ' images' : null,
    lastBackupAt: _lastBackupAt(),
  });

  // WS2 settings (st-quality): the Garden picker, from the Garden row on the root and on its own screen.
  const gardenOptions = (typeof GARDEN_TIERS !== 'undefined' ? GARDEN_TIERS : []).map((/** @type {any} */ t) => ({
    id: t.id, label: t.label + ' · about ' + String(t.size).replace(/^~\s*/, ''), desc: t.res + ' · ' + t.desc }));
  const gardenSub = (/** @type {any} */ (globalThis).GARDEN_TOTAL || 209) + ' photographs. Pages load from the internet as you read and are kept on this phone.';
  const gardenDoor = typeof onOpenGarden === 'function'
    ? <UiButton wide icon="img" className="ws2-garden-door" onClick={() => { setGardenPick(false); onOpenGarden(); }}>Open A Return to The Garden</UiButton> : null;

  return (
    <ScreenLayout
      hideTabsBtn
      utility={{
        title: screenTitle, onBack: goUp,
        backLabel: mode === 'screen' ? (openGroups.has('autoscroll') && openGroups.size === 1 ? 'Back to Reading' : 'Back to Settings') : backLabel,
      }}
    >
      <div className={'settings-screen ws1-settings is-' + mode + (textScalePercent >= 180 ? ' settings-large-type' : '')}>
        <h1 className="ws1-sr-only">{screenTitle}</h1>

        <div className="settings-groups" ref={groupsRef}>
        {mode !== 'screen' && (
          <div className="settings-find">
            <label htmlFor="settings-find-input" className="ws1-sr-only">Find settings</label>
            <div className={'ui-field ws1-find' + (searching ? ' is-on' : '')}>
              <UiIcon name="search" />
              <input ref={settingsFindRef} id="settings-find-input" type="search" placeholder="Find a setting" value={settingsQuery} onChange={(e) => changeSettingsQuery(e.target.value)} />
              {settingsQuery && <button type="button" className="ws1-find-clear" aria-label="Clear filter" onClick={() => { changeSettingsQuery(''); settingsFindRef.current?.focus(); }}><UiIcon name="x" size="sm" /></button>}
            </div>
            {searching && <p role="status" className={'ws1-find-status' + (foundCount ? ' ui-label' : '')}>{foundCount ? foundCount + (foundCount === 1 ? ' setting' : ' settings') : 'No matching settings. Try font, audio, backup, or clear the filter.'}</p>}
          </div>
        )}

        <RootCard mode={mode}>
        <SettingsGroup sub={glance.appearance} {...groupProps('appearance')}>
          {/* WS1 settings (st-look): Theme is Dark | Light (X-hidden 1 "theme"), then text size, then the font. */}
          <Findable text="theme dark light mode night day look colour color">
            <SectionLabel>Theme</SectionLabel>
            <Segmented label="Theme" className="ws1-theme" options={[{ id: 'dark', label: <><UiIcon name="moon" size="sm" />Dark</> }, { id: 'light', label: <><UiIcon name="sun" size="sm" />Light</> }]}
              value={theme === 'light' ? 'light' : 'dark'} onChange={(v) => { if (v !== theme) onThemeChange(v); }} />
          </Findable>
          {/* [10] True Black toggle REMOVED 2026-08-03 (owner: "just make
              it default, looks better anyway") — pure-black surfaces are
              now the dark theme's own tokens in app.css. A persisted
              settings.trueBlack key is an ignored orphan. */}
          <Findable text="text size font bigger smaller zoom letters scale">
            <SectionLabel>Text size</SectionLabel>
            <div className="settings-card">
              <TextSizeSliderRow
                value={settings.fontScale || "1"}
                onChange={(v) => onSetting("fontScale", v)}
              />
            </div>
          </Findable>
          <p className="ws1-note">Changes reading text everywhere in the app. Icons and menus stay the same size, and your phone’s own font size does not affect it.</p>
          {/* Reading Font (2026-07-31) — replaces the two-state "Modern
              Fonts" toggle. settings.fontStyle now holds any READING_FONTS
              id; "classic"/"modern" keep their historical meanings so
              persisted + backup-imported values stay valid. */}
          <SettingsSection label="Reading font">
            <FontPickerRow
              value={settings.fontStyle || "classic"}
              onSelect={(id) => onSetting("fontStyle", id)}
            />
          </SettingsSection>
          <p className="ws1-note">Theme and text size are also in every reader’s menu.</p>
        </SettingsGroup>

        {/* WS2 settings (st-read, st-read2): three sections, The Bible, The page, Your place, each row its name, the
            mock's short line and its control; then Kept elsewhere (Mark as read, Reading plans). */}
        <SettingsGroup sub={glance.reading} {...groupProps('reading')}>
          <SettingsSection label="The Bible">
            <SelectField
              eyebrow="Reading"
              title="Bible translation"
              label="Bible translation"
              desc={<TranslationInfoDesc />}
              line="Verse text for the 66 books"
              moreTitle="The Restored Name editions"
              moreLabel="NKJV-R · KJV-R"
              find="version edition restored name yahushua"
              value={settings.translation || "nkjv"}
              valueLabel={editionShownLabel(settings.translation || "nkjv")}
              options={TRANSLATION_OPTIONS.map((/** @type {any} */ o) => ({ ...o, desc: String(o.desc || '').replace(/\s—\s/g, ', ') }))}
              onChange={(v) => onSetting("translation", v)}
            />
            <OfflineEditionsRow translation={settings.translation || "nkjv"} />
            <SettingsRow
              label="Chapter titles"
              desc="The title under the chapter number, like “The Creation”"
              checked={settings.showChapterTitle !== false}
              onToggle={() => onToggle("showChapterTitle")}
            />
            <SettingsRow
              label="Section headings"
              desc="Topic breaks between verses, like “The Fall”"
              checked={settings.showSectionHeadings !== false}
              onToggle={() => onToggle("showSectionHeadings")}
            />
            {/* Redesign 2026-07-31: Restored names only ever appears inside titles/headings, so with both off the
                row is gone; it returns when either comes back. */}
            {!(settings.showChapterTitle === false && settings.showSectionHeadings === false) && (
              <SettingsRow
                label="Restored names"
                desc="The Father’s and The Son’s Names in titles and headings. Verse text is never altered."
                find="yahuwah yahushua name"
                checked={!!settings.restoredNames}
                onToggle={() => onToggle("restoredNames")}
              />
            )}
            <SelectField
              eyebrow="Reading"
              title="Scripture browser"
              label="Scripture browser"
              desc="How books are laid out on the Scriptures screen"
              find="genre grid list layout books"
              value={settings.scriptureLayout || "genre"}
              options={SCRIPTURE_LAYOUT_OPTIONS}
              onChange={(v) => onSetting("scriptureLayout", v)}
            />
          </SettingsSection>
          <SettingsSection label="The page">
            <SelectField
              eyebrow="Reading"
              title="Previous and next arrows"
              label="Previous and next arrows"
              desc="Where they sit on a chapter or letter"
              find="chapter letter arrows layout left right handed top bar"
              value={settings.arrowLayout || "split"}
              options={arrowOptions()}
              sheetFoot="Swiping sideways turns the page with any of these."
              onChange={(v) => onSetting("arrowLayout", v)}
            />
            {/* st-read2: Auto-scroll is a screen inside Reading; its row says the speed it is set to. */}
            {mode === 'screen' && (
              <SettingsNavRow label="Auto-scroll" desc="Hands-free reading. Start it from a reader’s menu."
                value={clampLpm(settings.autoScrollLpm || '16') + ' lines a minute'} onClick={() => openScreen('autoscroll')} />
            )}
            <SettingsRow
              label="Keep screen on while reading"
              desc="The screen does not dim or lock while the app is open"
              find="awake dim lock battery"
              checked={settings.keepScreenOn !== false}
              onToggle={() => onToggle("keepScreenOn")}
            />
            <SettingsRow
              label="Double-tap for full screen"
              desc="Double-tap an open area. Also in a reader’s menu."
              find="fullscreen click"
              checked={settings.doubleTapFullscreen !== false}
              onToggle={() => onToggle("doubleTapFullscreen")}
            />
            <SettingsRow
              label="Marks on the scrollbar"
              desc="A notch where the reading ends and the footnotes begin"
              find="notch scrollbar content marker"
              checked={!!settings.showScrollNotch}
              onToggle={() => onToggle("showScrollNotch")}
            />
            <SettingsRow
              label="Verses shown inline (Matthew Study Bible)"
              desc="When a study note covers several verse ranges, a small pill after each extra range leads back to the full note"
              find="echo pill inline reference echoes"
              checked={settings.showInlineEchoes !== false}
              onToggle={() => onToggle("showInlineEchoes")}
            />
          </SettingsSection>
          <SettingsSection label="Your place">
            {/* Named for what it does, not its shape (2026-09-10); the tour's settings stop names it too. A place
                opened from a search stays a look until it is read (utils/search-visit.js). */}
            <SettingsRow
              label="Reading position marker"
              desc="Shows where you left off, in the top bar. Tap it to go back."
              find="dot resume"
              checked={settings.showReadingDot}
              onToggle={() => onToggle("showReadingDot")}
            />
            {/* AOGCG (2026-10-22): off hides the path's ticks, counts and Continue and keeps what is stored (U16). */}
            <SettingsRow
              label="Answers progress"
              desc="Ticks and Continue on the Answers screen"
              find="answers reading path progress"
              checked={settings.answersReadingPath !== false}
              onToggle={() => onToggle("answersReadingPath")}
            />
            <SelectField
              eyebrow="Reading"
              title="Count a page as read after"
              label="Count a page as read after"
              desc="This long on one chapter or letter counts that day toward your reading streak"
              find="dwell time seconds reading streak"
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
              label="Surprise me button"
              desc="A dice on the Read tab that opens a random chapter or letter"
              find="random dice"
              checked={settings.showSurpriseButton}
              onToggle={() => onToggle("showSurpriseButton")}
            />
          </SettingsSection>
          {mode === 'screen' && (
            <>
              <SectionLabel>Kept elsewhere</SectionLabel>
              <div className="ui-group ws1-door">
                <ListRow icon="check" title="Mark as read" meta="Settings · Reading progress" onClick={() => openScreen('progress')} />
                {typeof onOpenPlans === 'function'
                  ? <ListRow icon="cal" title="Reading plans" meta="Library · reminders and the daily portion" onClick={onOpenPlans} /> : null}
              </div>
            </>
          )}
        </SettingsGroup>

        {/* Listening (2026-08-09): one group owns every choice that shapes what you HEAR. WS2 settings (st-listen):
            Voices, Playing, Read-along, Songs and downloads. The Wi-Fi and keep-ready switches stay here until the
            Downloads screen carries them (au-dlauto, the Listen family's). */}
        <SettingsGroup sub={glance.listening} {...groupProps('listening')}>
          <SettingsSection label="Voices">
            <SelectField
              eyebrow="Listening"
              title="Bible audio"
              label="Bible audio"
              /* FSET (st-listen): the chosen edition is the line under the name, as the mock draws it. */
              desc={bibleAudioShown || 'The recorded voice for Listen on Bible chapters'}
              valueStyle={bibleAudioShown ? { display: 'none' } : null}
              find="voice reader recording the recorded voice for listen on bible chapters off hides the button"
              value={settings.bibleAudio || "brm-kjv"}
              options={[
                /* Registry source of truth: utils/audio-track.js
                   (BIBLE_AUDIO_EDITIONS, published as a global for this
                   classic-globals screen, and bibleAudioOffered beside it —
                   an edition whose assets are not on the release is offered
                   at no door, this one included). 'Off' is appended locally. */
                ...Object.entries(/** @type {any} */ (globalThis).BIBLE_AUDIO_EDITIONS || {})
                  .filter(([, ed]) => /** @type {any} */ (globalThis).bibleAudioOffered(ed))
                  .map(([id, ed]) => {
                  /* B2 (2026-08-10): every shipped edition is recorded a chapter at a time; how many chapters that is
                     lives in the registry and its manifest, never in a number written here.

                     ONLY A CODE THE APP'S OWN REGISTRY CARRIES MAY REACH THE
                     READER. `translation` holds a real translation code for the
                     editions that have matching text ('kjv', 'web') and an
                     internal MARKER for the ones that do not ('vot-matthew'),
                     and toUpperCase cannot tell those apart — it printed
                     "Per-chapter audiobook · VOT-MATTHEW text" to readers from c48.
                     A positive match keeps the clause for the first kind and
                     drops it for the second.

                     NOT translationLabel(): it falls back to the NKJV strings
                     for an unknown code, which would describe Matthew as NKJV.

                     FREE VARIABLE, NOT globalThis: TRANSLATION_OPTIONS is a
                     top-level `const` in index.html, so it lives in the global
                     LEXICAL environment and is never assigned to window.
                     Reading it off globalThis is `undefined` in the real app —
                     every edition would silently lose its clause — while
                     staying green in a harness that installs it as a property.
                     Pinned by a text gate in
                     SettingsScreen.editiondesc.test.jsx, because no rendered
                     assertion can tell the two forms apart. */
                  const code = String(/** @type {any} */ (ed).translation || '');
                  const known = typeof TRANSLATION_OPTIONS !== 'undefined'
                    && Array.isArray(TRANSLATION_OPTIONS)
                    && TRANSLATION_OPTIONS.some((o) => o && o.id === code);
                  return {
                    id, label: /** @type {any} */ (ed).label,
                    // mt1: an edition's own one-line description (what the
                    // recording IS) rides between the form and the text clause.
                    desc: 'Per-chapter audiobook'
                      + (/** @type {any} */ (ed).description ? ' · ' + /** @type {any} */ (ed).description : '')
                      + (known ? ' · ' + code.toUpperCase() + ' text' : ''),
                  };
                }),
                { id: "off", label: "Off", desc: "Hide the Bible Listen button" },
              ]}
              onChange={(v) => onSetting("bibleAudio", v)}
            />
            <SelectField
              eyebrow="Listening"
              title="Letter voice"
              label="Letter voice"
              desc="The reader you prefer for the Letters"
              find="voice reader recording automatic"
              value={settings.letterReader || "auto"}
              /* One list with the Listen tab's Letter voice row (AudioLibraryScreen letterVoiceOptions: Automatic, then
                 utils/audio-track.js AUDIO_READERS in the app's reader rank). */
              options={letterVoiceOptions()}
              onChange={(v) => onSetting("letterReader", v)}
            />
          </SettingsSection>
          <SettingsSection label="Playing">
            {/* Speed reads and writes the LISTENING LIBRARY, not a settings key (AudioRateRow above). */}
            <AudioRateRow />
            <SkipStepRow value={settings.skipSeconds} onChange={(sec) => onSetting("skipSeconds", sec)} />
          </SettingsSection>
          <SettingsSection label="Read-along">
            <SettingsRow
              label="Highlight the words"
              desc="Softly marks the sentence being read"
              find="read along highlight wash"
              checked={settings.readAlongHighlight !== false}
              onToggle={() => onToggle("readAlongHighlight")}
            />
            {/* Dependent row: with no highlight there is nothing to follow, so the scroll switch is unmounted. */}
            {settings.readAlongHighlight !== false && (
              <SettingsRow
                label="Follow the voice"
                desc="Scrolls to keep that sentence in view"
                find="read along scroll"
                checked={settings.readAlongFollow !== false}
                onToggle={() => onToggle("readAlongFollow")}
              />
            )}
            {/* w-audio-continue (2026-09-11): the player continues in site order by itself; this row governs the
                SCREEN only. */}
            <SettingsRow
              label="Turn the page with the audio"
              desc="The reading moves on when the recording does"
              find="read along"
              checked={settings.audioTurnPage !== false}
              onToggle={() => onToggle("audioTurnPage")}
            />
          </SettingsSection>
          <SettingsSection label="Songs and downloads">
            <SettingsRow
              label="Show songs on letter pages"
              desc="Hear It Sung and Songs From This Letter"
              find="music sung"
              checked={settings.showLetterSongs !== false}
              onToggle={() => onToggle("showLetterSongs")}
            />
            <SongsKeptRow />
            <DownloadsStorageRow />
            {/* Download only on Wi-Fi (ra6): only where this app keeps downloads and can tell Wi-Fi from mobile data. */}
            {OfflineAudio.available() && canTell() && (
              <SettingsRow
                label="Download only on Wi-Fi"
                desc={settings.downloadWifiOnly === true
                  ? "Downloads wait for Wi-Fi, so they never use mobile data"
                  : "Off: downloads use mobile data too." + (networkType() ? " Big ones ask first." : "")}
                find="wifi wireless mobile data cellular"
                checked={settings.downloadWifiOnly === true}
                onToggle={() => onToggle("downloadWifiOnly")}
              />
            )}
            {OfflineAudio.available() && canTell() && (
              <SettingsRow
                label="Keep the next 3 ready"
                desc="While you listen, the next three download ahead"
                find="ready ahead offline"
                checked={settings.keepNextReady === true}
                onToggle={() => onToggle("keepNextReady")}
              />
            )}
          </SettingsSection>
        </SettingsGroup>

        {/* WS2 settings (st-auto): Auto-scroll on one screen inside Reading; every row always shown. */}
        <SettingsGroup sub={glance.autoscroll} {...groupProps('autoscroll')}>
          {mode === 'screen' && <p className="ws1-note ws2-intro">Scrolls the page for you at a steady reading pace. Touching the screen pauses it; it picks back up a moment after you lift your finger.</p>}
          <div className="settings-card">
            <SettingsRow
              label="Auto-scroll pill on reading pages"
              desc="A small play and pause pill on chapters and letters. Off: start it from a reader’s menu."
              find="auto scroll hands free"
              checked={!!settings.autoScroll}
              onToggle={() => onToggle("autoScroll")}
            />
          </div>
          <SettingsSection label="Speed">
            <AutoScrollSpeedRow
              value={settings.autoScrollLpm || "16"}
              onChange={(v) => onSetting("autoScrollLpm", v)}
            />
          </SettingsSection>
          <p className="ws1-note">The − and + on the pill change this too, without leaving the page, and the pill shows your words a minute.</p>
          <SettingsSection label="At the end of the page">
            <SettingsRow
              label="Go on to the next page"
              desc="Counts down, then turns to the next chapter, letter, book, volume or study"
              find="auto continue"
              checked={!!settings.autoScrollNext}
              onToggle={() => onToggle("autoScrollNext")}
            />
            <AutoScrollDwellRow
              value={settings.autoScrollEndMs || "2500"}
              onChange={(v) => onSetting("autoScrollEndMs", v)}
            />
          </SettingsSection>
          <p className="ws1-note">It stops at the very end, and after a long run with nobody there.</p>
        </SettingsGroup>

        {/* WS2 settings (st-tools): the old Top bar group and Search, Tabs & History in one screen, a section each. */}
        <SettingsGroup sub={glance.features} {...groupProps('features')}>
          <SettingsSection label="Search">
            <SettingsRow
              label="Search"
              desc="Off hides the search button everywhere"
              find="find"
              checked={settings.searchEnabled !== false}
              onToggle={() => onToggle("searchEnabled")}
            />
            {/* Search's sub-settings unmount with it (redesign 2026-07-31). */}
            {settings.searchEnabled !== false && (
              <>
                <SettingsRow
                  label="Synonym search"
                  desc="“mercy” also finds “compassion”. Exact words rank first."
                  find="synonyms"
                  checked={settings.searchSynonyms !== false}
                  onToggle={() => onToggle("searchSynonyms")}
                />
                <SettingsRow
                  label="Leave out filler words"
                  desc="Drops the, is, of, and from long searches. Turn off if a KJV phrase is missing."
                  find="filter stop words"
                  checked={settings.searchUseStopWords !== false}
                  onToggle={() => onToggle("searchUseStopWords")}
                />
              </>
            )}
          </SettingsSection>
          <SettingsSection label="Tabs">
            <SettingsRow
              label="Tabs"
              desc="Up to 50 reading places side by side. Off keeps your open tabs for later."
              checked={!!settings.tabsEnabled}
              onToggle={() => onToggle("tabsEnabled")}
            />
          </SettingsSection>
          <SettingsSection label="History">
            <SettingsRow
              label="History"
              desc="A list of the chapters and letters you have opened"
              checked={settings.historyEnabled !== false}
              onToggle={() => onToggle("historyEnabled")}
            />
            <HistoryClearRow historyCount={historyCount} onClearHistory={onClearHistory} />
          </SettingsSection>
          {/* The three tabs (2026-11-10) gave every screen one top bar; the bookmark on a reading page is its one
              optional icon. */}
          <SettingsSection label="Top bar">
            <SettingsRow
              label="Bookmark button"
              desc="On a reading page, beside Search"
              find="top bar nav icons"
              checked={settings.showBookmarkNav !== false}
              onToggle={() => onToggle("showBookmarkNav")}
            />
          </SettingsSection>
        </SettingsGroup>

        {/* Sharing (cp3, Corbin 2026-09-27). A copy of a letter ends with its link on thevolumesoftruth.com
            (utils/site-link.js); so does Share, unless the reader picks the app's. WS2 settings (st-share): the choice
            as two rows on the screen, Highlight the passage, then what a shared passage looks like. */}
        <SettingsGroup sub={glance.share} {...groupProps('share')}>
          {/* SHARE1 (Corbin 2026-11-12, "For links, make it controllable ... Share should be a different thing"): what
              Copy and Share add after the words, each set on its own, with what it sends under each. */}
          <ShareEndingSection action="copy" settings={settings} onSetting={onSetting} preview={mode === 'screen'} />
          <ShareEndingSection action="share" settings={settings} onSetting={onSetting} preview={mode === 'screen'} />
          <SettingsSection label="Links I share point to">
            <RadioRows label="Links I share point to" find="share link links copy website app"
              value={settings.shareLink === 'app' ? 'app' : 'site'} options={SHARE_LINK_OPTIONS}
              onChange={(v) => onSetting("shareLink", v)} />
          </SettingsSection>
          <p className="ws1-note">Wherever Copy or Share adds a link, it is this one; a passage with no page on the website, like the Bible, gets the app’s. After a share, the note at the bottom of the screen has “Use the other link” to send the other one for that share; holding Share, or right-clicking it on a computer, offers both first.</p>
          <SettingsSection label="Website links">
            <SettingsRow
              label="Highlight the passage"
              desc="The link opens the letter scrolled to the words you shared, highlighted. Off: it opens the letter itself."
              find="share link words"
              checked={!!settings.linkHighlight}
              onToggle={() => onToggle("linkHighlight")}
            />
          </SettingsSection>
        </SettingsGroup>

        {/* WS2 settings (st-quality): on the root the Garden row opens this picker directly; it ends in a door to
            the Garden itself. */}
        <SettingsGroup sub={glance.garden} {...groupProps('garden')}>
          <div className="settings-card">
            <SelectField
              eyebrow="A Return to The Garden"
              title="Image quality"
              label="Image quality"
              desc="Pages download again at this size the next time you view them"
              find="garden pictures images photographs resolution"
              value={settings.gardenTier || GARDEN_DEFAULT_TIER}
              options={gardenOptions}
              sheetSub={gardenSub}
              sheetFoot={gardenDoor}
              onChange={(v) => onSetting("gardenTier", v)}
            />
          </div>
        </SettingsGroup>
        </RootCard>
        <SelectSheet open={gardenPick} onClose={() => setGardenPick(false)} eyebrow="A Return to The Garden" title="Image quality"
          value={settings.gardenTier || GARDEN_DEFAULT_TIER} options={gardenOptions} sub={gardenSub}
          onChange={(v) => onSetting("gardenTier", v)}>{gardenDoor}</SelectSheet>

        <RootCard mode={mode} last>
        <SettingsGroup sub={glance.data} tag={_lastBackupAt() ? null : 'Back up'} {...groupProps('data')}>
          {/* WS3 settings (st-data): the backup first, as one gold button; restore and check under it.
              WS5 (st-find): while finding, the card stays out of the found rows; Also · Keep a backup is its door. */}
          {mode === 'search' ? null : <Findable text={'Backup Back up now ' + BACKUP_WORDS + ' votbak file last backup'}>
            <div className="settings-card ws3-backup">
              <div className="ws3-backup-label">Backup</div>
              <h2 className="ws3-backup-title">{_lastBackupAt() ? 'Backed up ' + _daysAgo(_lastBackupAt()) : 'Not backed up from this phone yet'}</h2>
              <p className="ws3-backup-line">One file (.votbak) with every note, highlight, notebook, journal entry, bookmark, link, reading mark, history record, open tab and setting. No login details, only your data.</p>
              <UiButton kind="primary" wide icon="dl" disabled={backupBusy} onClick={() => { _runLockedBackupOperation(exportPersonalData); }}>Back up now</UiButton>
            </div>
          </Findable>}
          <div className="settings-card">
            <SettingsNavRow icon="reset" label="Restore from a backup" desc="Replaces your data on this phone with a backup file (.votbak). You confirm first."
              find="import restore votbak load" disabled={backupBusy} onClick={() => { _runBackupOperation(importPersonalData); }} />
            <SettingsNavRow icon="check" label="Check a backup file" desc="Reads the whole file and says what is in it. Nothing on this phone changes."
              find="verify check test votbak" disabled={backupBusy} onClick={() => { setVerifyReport(null); _runLockedBackupOperation(verifyBackupFile); }} />
          </div>
          <SettingsSection label="Kept safe by themselves">
            {safety && safety.where ? (
              <DataRow label="Automatic snapshots" find="copies snapshot automatic" pill
                desc={safety.tooBig ? _snapshotText(safety) : 'The app keeps copies of your data by itself. ' + (safety.count ? _snapshotText(safety) + '.' : 'The first is taken shortly after it opens.')}
                value={safety.tooBig ? 'Paused' : safety.count ? (safety.count === 1 ? '1 copy' : safety.count + ' copies') : 'None yet'} />
            ) : null}
            {weekly && weekly.supported ? (
              <DataRow label="Weekly copy" desc={_weeklyText(weekly)} find="downloads weekly copy">
                <UiButton small className="ws2-pill-btn" onClick={() => { toggleWeekly(); }}>{weekly.on ? 'Turn off' : 'Turn on'}</UiButton>
              </DataRow>
            ) : null}
            <DataRow label="Protection" desc={protection.line} value={protection.pill} pill find="persist persistence storage cleanup protect">
              {showProtectButton ? <UiButton small className="ws2-pill-btn" onClick={() => { storageInfo.requestPersist(); }}>Protect now</UiButton> : null}
            </DataRow>
          </SettingsSection>
          {/* st-data2: how much is stored, then what goes wrong and starting over. */}
          <SettingsSection label="Storage">
            <Findable text="Storage total app data space quota used offline library songs Garden images">
              <div className="ws3-meter">
                {storageInfo.status === 'ready' && storageInfo.usage != null ? (
                  <>
                    <div className="ws3-meter-head">
                      <span className="ws3-meter-used">{formatBytes(storageInfo.usage)}</span>
                      {storageInfo.quota != null ? <span className="ws3-meter-of">of {formatBytes(storageInfo.quota)}</span> : null}
                    </div>
                    {storageInfo.quota ? (
                      <span className="ui-progress" role="progressbar" aria-label="Storage used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={storagePct}>
                        <span style={{ width: storagePct + '%' }} />
                      </span>
                    ) : null}
                  </>
                ) : <div className="ws3-meter-used is-text">{appDataDisplayText}</div>}
                <span className="settings-row-desc">Everything the app stores: the offline library, songs kept on this phone and Garden images.</span>
              </div>
            </Findable>
          </SettingsSection>
          <div className="settings-card">
            <DataRow label="Your data" desc={userDataLine} value={userData ? formatBytes(userData.total) : 'Calculating…'} find="size bytes" />
            {/* U09.5: the web's offline library, standing (the APK carries every book in itself). */}
            {!(typeof PlatformBridge !== 'undefined' && PlatformBridge && PlatformBridge.isAndroid)
              ? <DataRow label="Offline library" desc={<OfflineLibraryStatus />} find="offline books cache every book without a connection ready"><OfflineLibraryReady /></DataRow> : null}
            {dataSamples.length > 1 ? (
              <DataRow label="Growth" desc={growthLine(dataSamples)} value={formatBytes(dataSamples[dataSamples.length - 1].b)} find="trend size grows" />
            ) : null}
            <DownloadsStorageRow />
          </div>
          <SettingsSection label="If something goes wrong">
            {/* NK5c: the diagnostic log, always shown now (st-data2), with its count or "Nothing logged". */}
            <DataRow label="Diagnostic log" find="log errors crash diagnostic warnings"
              desc={'Warnings, errors and timings; file paths left out. Goes into your next backup.'
                + (diagnosticLog.length ? ' Last entry ' + new Date(diagnosticLog[diagnosticLog.length - 1].t).toLocaleString() + '.' : '')}
              value={diagnosticLog.length ? (diagnosticLog.length === 1 ? '1 entry' : diagnosticLog.length + ' entries') : 'Nothing logged'} />
            <DataRow label="Running on" desc="Where this copy of the app is installed" value={_platformLabel(StorageHealth.getPlatform())} find="platform browser android" />
          </SettingsSection>
          <SettingsSection label="Start over">
            <DataRow label="Delete all my data" className="ws3-danger" find="clear wipe erase reset delete everything personal"
              desc={'Every note, highlight, journal entry, bookmark, link, reading mark and tab, and the automatic copies'
                + (weekly && weekly.supported ? ' (the weekly copies in Downloads/VOTReader too)' : '') + '. Settings go back to their defaults.'}>
              <UiButton small danger className="ws3-danger-btn" ariaLabel="Delete all my data" disabled={backupBusy}
                onClick={() => { setWipeText(''); setWipeBackup(null); setWipeConfirm(true); }}>Delete</UiButton>
            </DataRow>
          </SettingsSection>
        </SettingsGroup>

        {/* The wipe dialog and the two backup sheets live OUTSIDE the groups (redesign 2026-07-31): their mount
            must not depend on a group's open state; the restore confirm arrives ASYNC after a native file picker. */}
        {wipeConfirm && (
          <div
            className="note-sheet-overlay ws3-dialog-overlay"
            onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) closeWipe(); }}
          >
            <div className="note-sheet ws3-dialog" ref={wipeTrapRef} role="dialog" aria-modal="true" aria-labelledby="settings-wipe-title" aria-describedby="settings-wipe-text" onClick={(e) => e.stopPropagation()}>
              <h2 className="ws3-dialog-title" id="settings-wipe-title">Delete all your data?</h2>
              <p className="ws3-dialog-text" id="settings-wipe-text">
                This removes every note, highlight, notebook, journal entry, bookmark, link, reading mark, history record and saved tab, the search cache and the automatic copies of your data{weekly && weekly.supported ? ', including the weekly copies in Downloads/VOTReader' : ''}. Settings go back to their defaults. This cannot be undone.
              </p>
              {/* WS3 settings (st-wipe): Back up first, inside the dialog; the dialog stays open while it runs. */}
              <UiButton wide icon="dl" className="ws3-dialog-backup" disabled={backupBusy}
                onClick={() => { setWipeBackup(null); _runLockedBackupOperation(async () => { setWipeBackup((await exportPersonalData()) ? 'saved' : 'none'); }); }}>Back up first</UiButton>
              {/* The dialog says what became of that backup: the toast sits behind it, and Delete waits while it runs. */}
              {backupBusy || wipeBackup ? (
                <p className="ws3-dialog-text" role="status">
                  {backupBusy ? 'Saving the backup…' : wipeBackup === 'saved' ? 'Backup saved.' : 'No backup was made. Your data has not been backed up.'}
                </p>
              ) : null}
              <input
                className="ws3-dialog-field"
                type="text"
                value={wipeText}
                autoFocus
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                aria-label="Type DELETE to confirm"
                placeholder="Type DELETE to confirm"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setWipeText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && wipeOk && !backupBusy) { closeWipe(); _runLockedBackupOperation(clearAllPersonalData); } }}
              />
              <div className="ui-btn-row">
                <UiButton onClick={() => { closeWipe(); }}>Cancel</UiButton>
                <UiButton danger disabled={!wipeOk || backupBusy}
                  onClick={() => { if (!wipeOk || backupBusy) return; closeWipe(); _runLockedBackupOperation(clearAllPersonalData); }}>Delete everything</UiButton>
              </div>
            </div>
          </div>
        )}
        {/* Wave-0 / WS3 settings (st-restore): the restore confirm. Nothing is applied until "Restore and overwrite";
            Cancel, the backdrop, Back and Escape all settle it false through onClose. */}
        <ActionSheet id="settings-import-confirm" open={importConfirm != null} onClose={() => _settleImportConfirm(false)}
          className="ws3-restore" label={importConfirm && _backupDay(importConfirm.date) ? 'Backup from ' + _backupDay(importConfirm.date) : null}
          title="Restore this backup?"
          confirm={{ label: 'Restore and overwrite', danger: true, onConfirm: () => { _settleImportConfirm(true); return false; } }}>
          {importConfirm && importConfirm.summary ? (
            <>
              <BackupCounts s={importConfirm.summary} />
              <p className="ws3-sheet-text">Restoring <strong>overwrites</strong> the kinds of data this backup contains. Any kind it does not include is left unchanged.{importConfirm.space || ''} This cannot be undone.</p>
            </>
          ) : importConfirm ? <p className="ws3-sheet-text">{importConfirm.message}</p> : null}
        </ActionSheet>
        {/* WS3 settings (st-verify): a check ends in a verdict, the counts, then Restore it or Done. */}
        {(() => {
          if (!verifyReport) return null;
          const v = _verifyWords(verifyReport);
          return (
            <ActionSheet id="settings-verify-result" open onClose={() => setVerifyReport(null)} className={'ws3-verify' + (verifyReport.level === 'warn' ? ' is-warn' : '')}
              title={v.title} sub={v.sub}>
              {v.s ? <BackupCounts s={v.s} /> : null}
              <p className="ws3-sheet-text">{v.line}</p>
              <div className="ui-sheet-foot ws3-sheet-foot">
                {v.s ? <UiButton disabled={backupBusy} onClick={() => { setVerifyReport(null); _runBackupOperation(importPersonalData); }}>Restore it</UiButton> : <span />}
                <UiButton kind="primary" onClick={() => setVerifyReport(null)}>Done</UiButton>
              </div>
            </ActionSheet>
          );
        })()}

        <SettingsGroup sub={glance.progress} {...groupProps('progress')}>
          <div className="settings-card">
            <SettingsRow
              label="Mark as read"
              desc="A chapter or letter is ticked once you have really read it: nearly all the text seen, for about as long as reading takes. A quick scroll to the end does not count."
              find="progress read marks checked"
              checked={settings.markAsRead}
              onToggle={() => onToggle("markAsRead")}
            />
            {typeof onOpenProgress === 'function' ? (
              <SettingsNavRow icon="chart" label="See your progress" desc="Library · Progress" find="progress totals streaks library" onClick={onOpenProgress} />
            ) : null}
          </div>
          {settings.markAsRead && !searching && (
            <>
              {/* WS3 settings (st-prog): the total is the label's aside (no longer "All Scriptures"); sections open to their books. */}
              <SectionLabel aside={totalRead.toLocaleString('en-US') + ' of ' + totalItems.toLocaleString('en-US')}>Read so far</SectionLabel>
              <div className="settings-card ws3-prog">
                {PROGRESS_GROUPS.map((grp) => {
                  const isOpen = openSections.has(grp.id);
                  const sRead = sectionRead(grp);
                  return (
                    <React.Fragment key={grp.id}>
                      <ProgressRow label={grp.label} read={sRead} total={sectionTotal(grp)} open={isOpen} onToggle={() => toggleSection(grp.id)}
                        canClear={sRead > 0 || sectionBooks(grp).some((b) => hasFrontierFor(b.id))}
                        question={`Clear read marks and saved positions in "${grp.label}"?`}
                        onClear={() => sectionBooks(grp).forEach((b) => onClearBook(b.id))} />
                      {isOpen ? (
                        <div className="ws3-prog-books">
                          {grp.genres.map((genre) => (
                            <React.Fragment key={genre.label}>
                              <div className="ws3-prog-genre">{genre.label}</div>
                              {genre.books.map((src) => (
                                <ProgressRow key={src.id} sub label={src.label} read={countFor(src.id)} total={src.total}
                                  canClear={countFor(src.id) > 0 || hasFrontierFor(src.id)}
                                  question={`Clear read marks and saved positions for “${src.label}”?`}
                                  onClear={() => onClearBook(src.id)} />
                              ))}
                            </React.Fragment>
                          ))}
                        </div>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </div>
              <ClearAllMarks canClear={hasAnyMark || frontierKeys.length > 0} onClearAll={onClearAll} />
            </>
          )}
        </SettingsGroup>
        </RootCard>

        {/* WS1 settings (st-root): Show me around and About VOTReader are rows of their own on the root. The
            section stays "help" (and .open) so the tour and smoke:ci's About step find the About row as before. */}
        {mode === 'root' && (
          <section className="settings-section is-root open" data-settings-group="help">
            <div className="ui-group ws1-root-card">
              <ListRow icon="help" title="Show me around" onClick={startTour}
                meta={'A short tour: ' + (_tour && typeof _tour.stopsWord === 'function' && typeof _tour.minutesWord === 'function' ? `${_tour.stopsWord()} stops, about ${_tour.minutesWord()} minutes` : 'a few stops, a few minutes')} />
              {/* PO2 19: the one place to install. It lived only in the Help group below, which the root never
                  opens, so since st-root (2026-11-11) no reader could reach it (found 2026-11-20). */}
              <InstallRow Row={ListRow} />
              {typeof onAbout === 'function' ? (
                <AboutRootRow onAbout={onAbout} />
              ) : null}
            </div>
            <p className="ws1-foot">Changes save on this phone.</p>
          </section>
        )}

        {/* review-tutorial: the tour is re-openable from here, whatever the Home strip decided. */}
        {mode !== 'root' && <SettingsGroup sub={glance.help} {...groupProps('help')}>
          <Findable text="show me around tour guide help welcome about votreader version credits install home screen app">
          <div className="settings-card settings-help-body">
            <button type="button" className="settings-help-btn" onClick={startTour}>Show me around</button>
            {/* The count comes from the tour (bundle-b's TourController, ambient here); with no
                controller on the page the note states no number rather than a stale one. */}
            <p className="settings-help-note">A short tour of the app: {_tour && typeof _tour.stopsWord === 'function' && typeof _tour.minutesWord === 'function' ? `${_tour.stopsWord()} stops, about ${_tour.minutesWord()} minutes` : 'a few stops, a few minutes'}. It points at the real buttons; you can leave at any time.</p>
            {/* PO2 19: the one place to install (never in the reading flow); drawn only while the app can be installed. */}
            <InstallRow />
            {/* A09.10: the group's summary promises About; this is it (the same screen Home's ⓘ opens). */}
            {typeof onAbout === 'function' ? (
              <button type="button" className="settings-help-about" onClick={onAbout}>
                <span>About VOTReader</span>
                <UiIcon name="chev" className="ui-row-chev" />
              </button>
            ) : null}
          </div>
          </Findable>
        </SettingsGroup>}
        {searching && (
          <>
            <SectionLabel>Also</SectionLabel>
            <div className="ui-group ws2-also">
              {backupHit ? <ListRow className="ws4-backup-hit" icon="data" title="Keep a backup" meta="Your data · Back up now" onClick={() => { changeSettingsQuery(''); openScreen('data'); }} /> : null}
              {typeof onSearchLibrary === 'function'
                ? <ListRow icon="search" title={'Search the library for “' + settingsQuery.trim() + '”'} onClick={() => onSearchLibrary(settingsQuery.trim())} /> : null}
            </div>
            <p className="ws1-note">A setting is found by any word in its name or in the line under it, and can be changed right here.</p>
          </>
        )}
        </div>
      </div>
    </ScreenLayout>
  );
}
