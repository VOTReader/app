/* ═══════════════════════════════════════════════════════════════════════
   SettingsScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { settingsGlance } from '../../utils/settings-glance.js';
import { createBackupFlow } from '../../utils/backup-flow.js';
import { songMakers } from './AboutScreen.jsx';

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

/* The new look's row chevron (rs2, the overhaul canvas): a hairline ›, the same stroke as the tab roots'. */
function RowChevron() {
  return (
    <svg className="settings-nav-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M9 5.5l6.5 6.5L9 18.5" /></svg>
  );
}

/* A row that opens a page: title, the current value under it, and a chevron (rs2). A real <button>. */
function SettingsNavRow({ title, sub = null, onClick, className = '' }) {
  return (
    <button type="button" className={'settings-nav-row' + (className ? ' ' + className : '')} onClick={onClick}>
      <span className="settings-nav-text">
        <span className="settings-nav-title">{title}</span>
        {sub && <span className="settings-nav-sub">{sub}</span>}
      </span>
      <RowChevron />
    </button>
  );
}

/* Appearance › Theme as two tiles (rs2, the canvas's Appearance board): the app has a dark and a light
   theme; the tile shows each one's page and line. One radiogroup, real buttons, the chosen one gold-edged. */
function ThemeTiles({ theme, onThemeChange }) {
  const tiles = [
    { id: 'dark', label: 'Dark' },
    { id: 'light', label: 'Light' },
  ];
  return (
    <div className="settings-row settings-theme-row">
      <p className="caps-label settings-caps" id="settings-theme-label">Theme</p>
      <div className="settings-theme-tiles" role="radiogroup" aria-labelledby="settings-theme-label">
        {tiles.map((t) => {
          const on = (theme === 'light' ? 'light' : 'dark') === t.id;
          return (
            <button key={t.id} type="button" role="radio" aria-checked={on} className={'settings-theme-tile settings-theme-' + t.id + (on ? ' on' : '')}
              onClick={() => { if (!on) onThemeChange(t.id); }}>
              <span className="settings-theme-swatch" aria-hidden="true"><span /></span>
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Help & about's own pages (rs2): About, Credits & licenses, Privacy ──
   Plain words, every claim true of THIS build: the credits list what the app ships (the translations
   in TRANSLATION_OPTIONS, the recorded editions in BIBLE_AUDIO_EDITIONS, the fonts and libraries in
   VENDORED-LIBS.md / fonts/), and the privacy page says what leaves the device and what does not
   (CLAUDE.md "No usage statistics": the one Cloudflare visit count is the exception, and it is named). */
function ExternalLink({ href, children }) {
  return (
    <a className="settings-ext-link" href={href} target="_blank" rel="noopener noreferrer">
      <span>{children}</span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M7 17 17 7M9 7h8v8" /></svg>
    </a>
  );
}

function AboutPage({ versionText }) {
  return (
    <div className="settings-info-page">
      <p className="settings-info-display">VOTReader</p>
      <p className="settings-info-version">{versionText}</p>
      <p>The Volumes of Truth are the Word of The Lord, given through His servant Timothy.</p>
      <p>This reader was made by a disciple for personal study; it is not the canonical source.</p>
      <p>Your notes, journal, and highlights stay on this device. Back them up in Settings › Your data.</p>
      <p>For the canonical text, audio, video, and PDFs, visit thevolumesoftruth.com.</p>
      <ExternalLink href="https://www.thevolumesoftruth.com">thevolumesoftruth.com</ExternalLink>
    </div>
  );
}

/* What each translation the app carries is, and on what terms (public domain unless named). */
const TRANSLATION_CREDITS = {
  nkjv: 'New King James Version. © 1982 Thomas Nelson.',
  rnkjv: 'The NKJV with the Name restored in the New Testament, prepared for this app with AI assistance.',
  kjv: 'King James Version, 1769 text. Public domain.',
  rkjv: 'The KJV with the Name restored in the New Testament, prepared for this app with AI assistance.',
  web: 'World English Bible. Public domain.',
  bsb: 'Berean Standard Bible. Public domain.',
  hnv: 'Hebrew Names Version of the World English Bible. Public domain.',
  asv: 'American Standard Version, 1901. Public domain.',
  lsv: 'Literal Standard Version. © Covenant Press, CC BY-SA 4.0.',
  ylt: "Young's Literal Translation, 1898. Public domain.",
};

function CreditsPage() {
  const translations = (typeof TRANSLATION_OPTIONS !== 'undefined' && Array.isArray(TRANSLATION_OPTIONS)) ? TRANSLATION_OPTIONS : [];
  const editions = Object.entries(/** @type {any} */ (globalThis).BIBLE_AUDIO_EDITIONS || {})
    .filter(([, ed]) => { const offered = /** @type {any} */ (globalThis).bibleAudioOffered; return typeof offered !== 'function' || offered(ed); });
  const readers = Object.values(/** @type {any} */ (globalThis).AUDIO_READERS || {}).map((r) => String(r).replace(/^Read by /, ''));
  const makers = songMakers();
  return (
    <div className="settings-info-page settings-credits">
      <p className="caps-label settings-caps">Scripture</p>
      <dl className="settings-credit-list">
        {translations.filter((o) => o && TRANSLATION_CREDITS[o.id]).map((o) => (
          <div key={o.id} className="settings-credit"><dt>{o.label}</dt><dd>{TRANSLATION_CREDITS[o.id]}</dd></div>
        ))}
      </dl>
      <p className="caps-label settings-caps">Audio</p>
      <dl className="settings-credit-list">
        {editions.map(([id, ed]) => (
          <div key={id} className="settings-credit"><dt>{String(/** @type {any} */ (ed).label || id).split(' · ')[0]}</dt><dd>{String(/** @type {any} */ (ed).label || '').split(' · ').slice(1).join(' · ') || /** @type {any} */ (ed).description || ''}</dd></div>
        ))}
        {readers.length > 0 && (
          <div className="settings-credit"><dt>Letters</dt><dd>{'Read by ' + readers.join(', ') + '.'}</dd></div>
        )}
        <div className="settings-credit"><dt>Songs</dt><dd>
          AI Songs of the Letters: songs made by members of the flock with Suno (suno.com), from the words of The Volumes of Truth. Shared freely, never sold.
          {makers.length ? ' With songs by ' + makers.join(', ') + ', and others of the flock.' : null}
        </dd></div>
      </dl>
      <p className="caps-label settings-caps">Data</p>
      {/* CC-BY obligation for the Scripture Web's cross-references: AboutScreen carries it too. */}
      <p className="settings-credit-line">
        Cross-reference data from{' '}
        <a href="https://www.openbible.info/labs/cross-references/" target="_blank" rel="noopener noreferrer"><em>OpenBible.info</em></a>
        , used under CC-BY.
      </p>
      <p className="caps-label settings-caps">Fonts &amp; code</p>
      <dl className="settings-credit-list">
        <div className="settings-credit"><dt>Fonts</dt><dd>EB Garamond, Cinzel and the reading fonts, under the SIL Open Font License 1.1.</dd></div>
        <div className="settings-credit"><dt>React</dt><dd>MIT License.</dd></div>
        <div className="settings-credit"><dt>MiniSearch</dt><dd>Search. MIT License.</dd></div>
        <div className="settings-credit"><dt>html2canvas</dt><dd>Tab pictures. MIT License.</dd></div>
      </dl>
    </div>
  );
}

function PrivacyPage() {
  return (
    <div className="settings-info-page">
      <p className="settings-info-display">Your privacy</p>
      <p>VOTReader has no accounts and no sign-in.</p>
      <p>Your notes, highlights, bookmarks, journal and reading record are kept only on this device. Nothing you write is sent anywhere.</p>
      <p>The app keeps no record of how you use it. The one count it makes: each time it opens while online, it sends one anonymous visit to Cloudflare Web Analytics, with no cookies and nothing you read or write. The numbers stay in the maker&rsquo;s Cloudflare account.</p>
      <p>Recordings, songs and Garden pictures stream from the app&rsquo;s own release files when you open them. A recording you save for offline is kept on this device.</p>
      <p>Backups are files you save yourself. The weekly copy, where the phone app makes one, goes to Downloads/VOTReader on this phone.</p>
    </div>
  );
}

const INFO_PAGES = {
  about: 'About',
  credits: 'Credits & licenses',
  privacy: 'Privacy',
};

/* SettingsGroup (rs2, the overhaul canvas): the Settings root is a list of rows, one per group, each
   with its current values under its name; a row opens the group as its own page. `paged` says a page
   is showing: then only open groups render, as sections (their head names the section when a search
   shows several at once; a lone page hides it, the page title says the same). Bodies stay unmounted
   while closed - the disclosure discipline: closed content is out of tab and screen-reader order.
   Module scope so React identity is stable across SettingsScreen renders. */
function SettingsGroup({ sectionId = 'settings', label, sub, open, paged = false, onToggle, hidden = false, children = null }) {
  if (hidden) return null;
  if (paged && !open) return null;
  if (!paged) {
    return (
      <section className="settings-section" data-settings-group={sectionId}>
        <button type="button" className="settings-group-head settings-nav-row" aria-expanded={false} aria-controls={'settings-group-' + sectionId} onClick={onToggle}>
          <span className="settings-nav-text settings-group-titles">
            <span className="settings-section-label settings-nav-title">{label}</span>
            {sub && <span className="settings-group-sub settings-nav-sub">{sub}</span>}
          </span>
          <RowChevron />
        </button>
      </section>
    );
  }
  return (
    <section className="settings-section open" data-settings-group={sectionId}>
      <button type="button" className="settings-group-head settings-page-section-head" aria-expanded={true} aria-controls={'settings-group-' + sectionId} onClick={onToggle}>
        <span className="settings-section-label">{label}</span>
      </button>
      <div className="settings-group-body" id={'settings-group-' + sectionId}>{children}</div>
    </section>
  );
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
      title="Default Speed"
      label="Default Speed"
      desc="How fast recordings play when you start one. The listening desk can still change speed for what is playing; whatever you leave it on becomes this setting, because both are the same preference."
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
    <div className="settings-row">
      <div className="settings-row-head">
        <span className="settings-row-label">Songs kept on this phone</span>
        <span className="settings-row-grow" />
        <button type="button" className="settings-select-trigger" aria-label={'Songs kept on this phone: ' + value + '. Manage'} onClick={(e) => { e.stopPropagation(); manage(); }}>
          <span className="settings-row-value">{value + ' · Manage'}</span>
          <span className="settings-select-chev">{"›"}</span>
        </button>
      </div>
    </div>
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

/** "today", "yesterday", or "N days ago" for a past time. @param {number} at */
function _daysAgo(at) {
  const day = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const n = Math.round((day(Date.now()) - day(at)) / 86400000);
  return n <= 0 ? 'today' : n === 1 ? 'yesterday' : n + ' days ago';
}

/** datasafe 10-05: when this device last finished an export (backup-flow.js LAST_EXPORT_KEY). */
function _lastBackupText() {
  let at = 0;
  try { at = Number(localStorage.getItem('vot-last-export')) || 0; } catch (_e) { /* no storage */ }
  return at ? 'Exported ' + _daysAgo(at) : 'Not exported from this device yet';
}

/** @param {{ where: string | null, count: number, newestAt: number }} st */
function _snapshotText(st) {
  if (!st.count) return 'The first is taken shortly after the app opens';
  const where = st.where === 'phone' ? 'kept on this phone' : 'kept in this browser (cleared with its site data)';
  return 'Newest ' + _daysAgo(st.newestAt) + ' · ' + st.count + ' ' + where;
}

/** dl-weekly: the weekly copy in Downloads. @param {{ on: boolean, count: number, newestAt: number }} w */
function _weeklyText(w) {
  if (!w.on) return 'Off';
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
/** Settings › Copy & Share › Share Includes (cp3): the link a tap on Share sends. */
const SHARE_LINK_OPTIONS = [
  { id: 'app', label: 'App Link', desc: 'Opens the passage in VOTReader, even offline, for anyone who has the app.' },
  { id: 'site', label: 'Website Link', desc: 'Opens the letter on thevolumesoftruth.com, for anyone, with a connection.' },
];

// rs2: eight groups, in the canvas's order (Appearance › Help & about). Old group words stay findable
// where their rows went: "auto scroll" and "mark as read" find Reading, "garden" finds Downloads & storage.
const SETTINGS_TOPICS = {
  appearance: 'appearance theme light dark text size font typeface top bar compact more menu icons',
  reading: 'reading bible translation chapter titles section headings restored names chapter letter page arrows scripture browser inline reference echoes reading position marker dot resume streak dwell time surprise me button random letter dice keep screen on double tap click fullscreen tabs auto scroll hands free speed continue pause mark as read progress book clear',
  listening: 'listening bible letter audio voice speed rate read along highlight playback follow turn page songs sung',
  features: 'search synonyms synonym filter stop words history clear',
  share: 'copy share sharing link links website app highlight passage words thevolumesoftruth',
  storage: 'downloads storage songs kept phone a return to the garden image quality pictures total app data size growth protection protect',
  data: 'your data backup back up export import restore verify check snapshots weekly copy downloads clear delete erase reset',
  // The tour's re-entry (Settings › Help & about › Show me around). Every group the screen renders needs a
  // row here: matchesGroup dereferences SETTINGS_TOPICS[id] for the first typed character, and a
  // group without one crashed the screen (2026-09-04, the Help group meeting this table).
  help: 'help about tour show me around guide welcome credits licenses license privacy app version updates diagnostic diagnostics log platform',
};

export function SettingsScreen({ settings, onToggle, onSetting, onBack, onSearch, onHistory, theme, onThemeChange, readItems, onClearBook, onClearAll, onClearHistory, historyCount, initialGroups = null }) {
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
  // The groups showing as a page (rs2). Empty on entry: the screen opens on its root list; a row
  // opens its group. `initialGroups` opens pages at mount (the test harness opens every group at
  // once, which only a search otherwise does). Session-local on purpose.
  const [openGroups, setOpenGroups] = React.useState(() => new Set(initialGroups || []));
  // Help & about's own pages (About, Credits & licenses, Privacy), over the Help & about page.
  const [infoPage, setInfoPage] = React.useState(/** @type {null | 'about' | 'credits' | 'privacy'} */ (null));
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
  // A page shows while a search runs or a group is open; the root list otherwise.
  const paged = searching || openGroups.size > 0;
  const groupProps = (id) => ({ sectionId: id, open: groupOpen(id), paged, hidden: !matchesGroup(id), onToggle: () => toggleGroup(id) });
  const changeSettingsQuery = (value) => { setSettingsQuery(value); setClosedMatches(new Set()); };
  const matchingCount = Object.keys(SETTINGS_TOPICS).filter(matchesGroup).length;
  // BACK FOLLOWS THE SHELL (rs2): overlay, then the page, then the screen. An info page goes back to
  // Help & about, a group page or a search back to the root list, and only the root leaves Settings.
  // Registered with the modal registry, so hardware Back and Escape take this step before the shell's
  // stack does; dialogs register after it while open, so they still close first.
  const closePage = React.useCallback(() => {
    if (infoPage) { setInfoPage(null); return; }
    if (settingsQuery) { setSettingsQuery(''); setClosedMatches(new Set()); return; }
    setOpenGroups(new Set());
  }, [infoPage, settingsQuery]);
  const pageOpen = paged || infoPage != null;
  useModalRegistry({ id: 'settings-page', dismiss: closePage, active: pageOpen });
  const handleBack = pageOpen ? closePage : onBack;
  // A new page starts at its top, as a pushed screen does.
  const pageKey = infoPage || (searching ? 'search' : [...openGroups].join(','));
  React.useEffect(() => {
    const scroller = document.querySelector('.screen-scroll');
    if (scroller && typeof scroller.scrollTo === 'function') scroller.scrollTo(0, 0);
  }, [pageKey]);
  const progressOpen = groupOpen('reading');
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
  // One page at a time (rs2): the stop's group replaces whatever page was showing.
  React.useEffect(() => {
    if (_tourGroup) { setInfoPage(null); setOpenGroups((prev) => (prev.size === 1 && prev.has(_tourGroup) ? prev : new Set([_tourGroup]))); }
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
  // datasafe 10-05: the automatic snapshots' line in Your Data (DataSafety lives in bundle-b).
  const [safety, setSafety] = React.useState(/** @type {{ where: string | null, count: number, newestAt: number } | null} */ (null));
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
      // or a first visit before the SW has taken control. Those two are different
      // questions and only one of them has an answer.
      //
      // ANDROID: the APK ships its own assets/service-worker.js (measured in the
      // installed launch build: assets/service-worker.js, CACHE_VERSION
      // v1.0.2-60a64a8486, CORPUS_VERSION c45), and MainActivity maps /assets/ to
      // AssetsPathHandler with the page loaded from
      // https://appassets.androidplatform.net/assets/index.html — so the relative
      // './service-worker.js' that fetchServerBuildVersion already fetches resolves
      // HERE to the installed build's own copy. Same function, same regex, no native
      // code and no new bridge verb. Only the MEANING of the answer changes with the
      // platform: on the web that file is what the SERVER has; on Android it is what
      // the reader INSTALLED, which is why it lands in `running` and not in `server`.
      //
      // WEB: deliberately NOT given the same fallback. Off Android an uncontrolled
      // page is a first visit, and the deployed service-worker.js would describe what
      // the server publishes, not what this page is running — a version the reader
      // could not act on and has no reason to trust.
      const installed = (PlatformBridge.isAndroid && typeof fetchServerBuildVersion === 'function')
        ? await fetchServerBuildVersion()
        : null;
      setBuildInfo(installed
        ? { state: 'installed', running: installed, server: null }
        : { state: 'no-sw', running: null, server: null });
      return;
    }
    const server = (typeof fetchServerBuildVersion === 'function') ? await fetchServerBuildVersion() : null;
    setBuildInfo({ state: 'ok', running, server });
  }, []);
  React.useEffect(() => { refreshBuildInfo(); }, [refreshBuildInfo]);

  const versionDisplayText = (() => {
    const fmt = (typeof formatBuildVersion === 'function') ? formatBuildVersion : ((s) => String(s || 'unknown'));
    if (buildInfo.state === 'loading') return 'Checking…';
    if (buildInfo.state === 'installed') {
      // Android, and we read the version out of the APK's own service-worker.js.
      // There is nothing to compare it against — an APK cannot update itself over
      // the web — so this states the build and stops, rather than inventing a
      // verdict about currency it has no evidence for.
      return fmt(buildInfo.running.cacheVersion)
        + ' · corpus ' + (buildInfo.running.corpusVersion || '?')
        + ' — the version installed on this device. New versions arrive by installing an update, not over the web.';
    }
    if (buildInfo.state === 'no-sw') {
      // Android reaches here only when the APK's own service-worker.js could not be
      // read, so the honest answer is still that there is no version to show.
      return PlatformBridge.isAndroid
        ? 'Installed app build — updates arrive by installing a new APK, not over the web.'
        : 'Not yet managed by the offline service worker on this device.';
    }
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
    if (storageInfo.persistDenied) return 'Browser denied protection. Back up regularly.';
    if (storageInfo.persistable) return 'Not active — tap "Protect now" to request protection from automatic browser cleanup.';
    // Not persisted, but there's no user-actionable persistence lever here
    // (installed app / Android APK / a Chromium browser that auto-decided /
    // Safari — whose real safeguard is "Add to Home Screen"). The data still
    // lives on this device; the honest guidance is to keep a backup.
    return 'Your data is saved on this device. Back up regularly to keep it safe.';
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
      ? `About ${used} of ${formatBytes(storageInfo.quota)} — everything this app stores on the device, including the offline library, songs kept on this phone and Garden images.`
      : `About ${used} — everything this app stores on the device, including the offline library, songs kept on this phone and Garden images.`;
  })();
  const userDataDisplayText = (() => {
    if (userData == null) return 'Calculating…';
    const total = formatBytes(userData.total);
    const mediaPart = userData.mediaCount > 0
      ? ` (includes ${userData.mediaCount} journal ${userData.mediaCount === 1 ? 'item' : 'items'} — ${formatBytes(userData.media)})`
      : '';
    return `About ${total}${mediaPart} — your highlights, notes, journal, bookmarks, links, reading progress, and history. This is what Back up now saves. Garden images are not counted here. Kept songs are not in it; a restore offers to download them again.`;
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
    confirmImport: (message) => new Promise((resolve) => {
      importConfirmResolveRef.current = resolve;
      setImportConfirm({ message });
    }),
    diagnosticLog,
  });

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


  const textScalePercent = Math.round(clampFontScale(settings.fontScale || '1') * 100);
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
  const glance = settingsGlance({
    settings, theme, textPercent: textScalePercent, fontLabel: selectedFontLabel,
    readerLabel, gardenLabel: gardenTier ? gardenTier.label + ' images' : null,
    appData: storageInfo.status === 'ready' && storageInfo.usage != null ? formatBytes(storageInfo.usage) : null,
    lastBackup: _lastBackupText(),
  });
  const tourNote = _tour && typeof _tour.stopsWord === 'function' && typeof _tour.minutesWord === 'function'
    ? `A short tour: ${_tour.stopsWord()} stops, about ${_tour.minutesWord()} minutes`
    : 'A short tour: a few stops, a few minutes';
  // The page's title: the open group's name, an info page's, or Settings (the root, a search).
  const GROUP_TITLES = {
    appearance: 'Appearance', reading: 'Reading', listening: 'Listening', features: 'Search & history',
    share: 'Copy & share', storage: 'Downloads & storage', data: 'Your data', help: 'Help & about',
  };
  const pageTitle = infoPage ? INFO_PAGES[infoPage]
    : (!searching && openGroups.size === 1) ? (GROUP_TITLES[[...openGroups][0]] || 'Settings')
      : 'Settings';
  const exportNow = (e) => { e.stopPropagation(); _runLockedBackupOperation(exportPersonalData); };

  return (
    <ScreenLayout
      navChildren={LibraryNav({
        // hide:['settings'] — you are already on Settings. Back steps out of a page before the screen.
        onBack: handleBack, backTitle: 'Back', hide: ['settings'],
        onHistory, onSearch, theme, onThemeChange,
      })}
    >
      <div className={'settings-screen rs2' + (textScalePercent >= 180 ? ' settings-large-type' : '') + (pageOpen ? ' settings-paged' : ' settings-root') + (!searching && openGroups.size === 1 && !infoPage ? ' settings-single' : '')}>
        <header className="settings-header">
          <h1 className="settings-title">{pageTitle}</h1>
        </header>

        {infoPage === 'about' && <AboutPage versionText={versionDisplayText} />}
        {infoPage === 'credits' && <CreditsPage />}
        {infoPage === 'privacy' && <PrivacyPage />}

        {!infoPage && (
        <div className="settings-groups">
        {(!paged || searching) && (
          <div className="settings-find">
            <label htmlFor="settings-find-input" className="sr-only">Find settings</label>
            <div className="settings-find-controls">
              <input ref={settingsFindRef} id="settings-find-input" type="search" placeholder="Find a setting: font, audio, backup" value={settingsQuery} onChange={(e) => changeSettingsQuery(e.target.value)} />
              {settingsQuery && <button type="button" onClick={() => { changeSettingsQuery(''); settingsFindRef.current?.focus(); }}>Clear filter</button>}
            </div>
            {searching && <p role="status">{matchingCount ? matchingCount + (matchingCount === 1 ? ' matching group' : ' matching groups') : 'No matching settings. Try font, audio, backup, or clear the filter.'}</p>}
          </div>
        )}

        <SettingsGroup label="Appearance" sub={glance.appearance} {...groupProps('appearance')}>
          <div className="settings-card">
            {/* Theme: the app's two themes as tiles (the canvas). Also in the ⋯ menu. */}
            <ThemeTiles theme={theme} onThemeChange={onThemeChange} />
            <TextSizeSliderRow
              value={settings.fontScale || "1"}
              onChange={(v) => onSetting("fontScale", v)}
            />
            {/* Reading Font (2026-07-31): settings.fontStyle holds any READING_FONTS id; "classic"/"modern"
                keep their historical meanings so persisted + backup-imported values stay valid. */}
            <FontPickerRow
              value={settings.fontStyle || "classic"}
              onSelect={(id) => onSetting("fontStyle", id)}
            />
            {/* The compact bar (2026-09-25; ui/components/MoreMenu.jsx) still decides whether Settings,
                History and the theme switch sit in the ⋯ menu. Its old Top-Nav chips governed icons no
                screen reads any more (rs2), so only this switch stays. */}
            <SettingsRow
              label="Compact Top Bar"
              desc="On (default): Settings, History, the light/dark switch and Text size sit in the ⋯ menu at the end of the top bar. Off: they sit in the bar as icons."
              checked={settings.compactTopBar !== false}
              onToggle={() => onToggle("compactTopBar")}
            />
          </div>
        </SettingsGroup>

        <SettingsGroup label="Reading" sub={glance.reading} {...groupProps('reading')}>
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
            {/* Dependent settings are UNMOUNTED, not disabled, while their dependency is off. Restored
                Names only ever appears inside titles/headings, so with both off the row is gone. */}
            {!(settings.showChapterTitle === false && settings.showSectionHeadings === false) && (
              <SettingsRow
                label="Restored Names"
                desc="Uses the proper Name of The Father (YAHUWAH) and The Son (YahuShua) in chapter titles and section headings — only where the underlying verses bear the Name. Verse text itself is never altered."
                checked={!!settings.restoredNames}
                onToggle={() => onToggle("restoredNames")}
              />
            )}
            {/* The default is Hidden (use-settings.js arrowLayout: "off"); the fallback says the same (rs2). */}
            <SelectField
              eyebrow="Reading"
              title="Page Arrows"
              label="Page Arrows"
              desc="Where the previous/next arrows live in a chapter or letter view."
              value={settings.arrowLayout || "off"}
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
            {/* Named for what it does, not its shape (2026-09-10); the tour's settings stop says the same. */}
            <SettingsRow
              label="Reading Position Marker"
              desc="Shows where you left off reading, in the top bar; tap it to go back. It follows you the moment you open any chapter or letter."
              checked={settings.showReadingDot}
              onToggle={() => onToggle("showReadingDot")}
            />
            <SettingsRow
              label="Mark as Read"
              desc="Chapters and letters are checked off automatically once you've genuinely read them — nearly all of the text seen, for about as long as reading it takes. A quick scroll to the bottom doesn't count. Re-reads add a small ×2, ×3 beside the check. Progress stops recording when this is off, but what's already saved is kept."
              checked={settings.markAsRead}
              onToggle={() => onToggle("markAsRead")}
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
              label="Tabs"
              desc="Keep several reading places open at once and flip between them — a chapter, a letter, a study, and back. Tabs share your settings, marks and history. Turning this off keeps the tabs you have; they come back when you turn it on."
              checked={!!settings.tabsEnabled}
              onToggle={() => onToggle("tabsEnabled")}
            />
            <SettingsRow
              label="Inline Reference Echoes"
              desc="In the Matthew Study Bible's inline mode, when a reference spans multiple verse ranges (e.g. verses 1-5 and 10-15), show a compact echo pill at the end of each additional range that scrolls back to the full note. Helps you see what references relate to as you read."
              checked={settings.showInlineEchoes !== false}
              onToggle={() => onToggle("showInlineEchoes")}
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
            {/* The Home button says "Surprise Me"; the row says the same, so a reader sent here
                by the tour finds it (it was "Random Letter Button" until 2026-09-10). */}
            <SettingsRow
              label="Surprise Me Button"
              desc="A breathing dice on the Home screen that opens a random chapter or letter when tapped."
              checked={settings.showSurpriseButton}
              onToggle={() => onToggle("showSurpriseButton")}
            />
          </div>

          {/* Auto-Scroll lives under Reading (rs2, audit part 1). Its sub-settings are UNMOUNTED while
              it is off: a greyed control still reads as something you might use. Auto-Continue Pause
              nests one level deeper — it means nothing unless Auto-Continue is on. */}
          <p className="caps-label settings-caps">Auto-Scroll</p>
          <div className="settings-card">
            <SettingsRow
              label="Auto-Scroll"
              desc="Adds a small play/pause pill to chapter and letter screens that scrolls the page for you at a steady reading pace. Touching the screen pauses it instantly; it picks back up a moment after you lift your finger. The pill fades out of the way while it runs."
              checked={!!settings.autoScroll}
              onToggle={() => onToggle("autoScroll")}
            />
            {!!settings.autoScroll && (
              <>
                <AutoScrollSpeedRow
                  value={settings.autoScrollLpm || "16"}
                  onChange={(v) => onSetting("autoScrollLpm", v)}
                />
                <SettingsRow
                  label="Auto-Continue"
                  desc="When auto-scroll reaches the end of the text, count down and turn to the next page on its own, the way a swipe does: on into the next chapter, letter, book, volume or study. It stops at the very end, and after a long unattended run."
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

          {/* Reading progress, book by book (was the Mark as Read group): clear marks per section or book. */}
          {settings.markAsRead && (
            <>
            <p className="caps-label settings-caps">Reading progress</p>
            <div className="progress-table">
              {PROGRESS_GROUPS.map((grp) => {
                const isOpen = openSections.has(grp.id);
                const sRead = sectionRead(grp);
                const sTotal = sectionTotal(grp);
                return (
                  <React.Fragment key={grp.id}>
                    <div className="progress-row">
                      <button
                        type="button"
                        className="progress-section-toggle"
                        aria-expanded={isOpen}
                        onClick={(e) => { e.stopPropagation(); toggleSection(grp.id); }}
                      >
                        <span aria-hidden="true" className="progress-section-caret">{isOpen ? "▾" : "▸"}</span>
                        <span className="progress-row-label">{grp.label}</span>
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
                        <div className="progress-row progress-genre-row">
                          <span className="progress-genre-label">{genre.label}</span>
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
            </>
          )}
        </SettingsGroup>

        {/* Listening (2026-08-09): one group owns every choice that shapes what you HEAR. */}
        <SettingsGroup label="Listening" sub={glance.listening} {...groupProps('listening')}>
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
                   classic-globals screen, and bibleAudioOffered beside it —
                   an edition whose assets are not on the release is offered
                   at no door, this one included). 'Off' is appended locally. */
                ...Object.entries(/** @type {any} */ (globalThis).BIBLE_AUDIO_EDITIONS || {})
                  .filter(([, ed]) => /** @type {any} */ (globalThis).bibleAudioOffered(ed))
                  .map(([id, ed]) => {
                  /* ONLY A CODE THE APP'S OWN REGISTRY CARRIES MAY REACH THE
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
                     Reading it off globalThis is `undefined` in the real app
                     while staying green in a harness that installs it as a
                     property. Pinned by a text gate in
                     SettingsScreen.editiondesc.test.jsx. */
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
            {/* Default Speed reads and writes the LISTENING LIBRARY, not a settings key (AudioRateRow). */}
            <AudioRateRow />
            <SettingsRow
              label="Read-Along Highlight"
              desc="While a recorded letter is playing, softly wash the sentence being read so your eye can follow the voice. It uses the timings that ship with the app; letters that don't have them simply play as before."
              checked={settings.readAlongHighlight !== false}
              onToggle={() => onToggle("readAlongHighlight")}
            />
            {/* Dependent row: with no wash there is nothing to follow, so it is UNMOUNTED, not greyed. */}
            {settings.readAlongHighlight !== false && (
              <SettingsRow
                label="Follow the Voice"
                desc="Let the page scroll a little on its own to keep the sentence being read inside the middle of the screen. It stands down the moment you scroll by hand, and never scrolls while auto-scroll is running."
                checked={settings.readAlongFollow !== false}
                onToggle={() => onToggle("readAlongFollow")}
              />
            )}
            {/* w-audio-continue (2026-09-11): the player continues in site order by itself (no switch — Pause is
                the off switch); this row governs the SCREEN only. "Turn the Page", not "Follow the audio". */}
            <SettingsRow
              label="Turn the Page with the Audio"
              desc="The reading moves with the audio. Off keeps the audio going; use Open the reading on the player."
              checked={settings.audioTurnPage !== false}
              onToggle={() => onToggle("audioTurnPage")}
            />
            <SettingsRow
              label="Show songs on letter pages"
              desc="Adds Hear It Sung beside Listen, and a Songs From This Letter card below the text, on letters the flock has sung. Off keeps the letter page text-only; the songs stay in the Listening Library."
              checked={settings.showLetterSongs !== false}
              onToggle={() => onToggle("showLetterSongs")}
            />
          </div>
        </SettingsGroup>

        <SettingsGroup label="Search & history" sub={glance.features} {...groupProps('features')}>
          <div className="settings-card">
            <SettingsRow
              label="Search"
              desc="Full-text search across all 66 books + Volumes. When off, the search button is hidden everywhere."
              checked={settings.searchEnabled !== false}
              onToggle={() => onToggle("searchEnabled")}
            />
            {/* Search's sub-settings unmount with it (redesign 2026-07-31). */}
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
              label="History"
              desc="Keep a running list of chapters and letters you've visited. When off, recording stops and the history button is hidden. Existing history is preserved."
              checked={settings.historyEnabled !== false}
              onToggle={() => onToggle("historyEnabled")}
            />
          </div>
          <HistoryClearRow historyCount={historyCount} onClearHistory={onClearHistory} />
        </SettingsGroup>

        {/* Copy & Share (cp3, Corbin 2026-09-27): which link a tap on Share sends, and whether a
            website link opens on the copied words highlighted. */}
        <SettingsGroup label="Copy & share" sub={glance.share} {...groupProps('share')}>
          <div className="settings-card">
            <SelectField
              eyebrow="Copy & Share"
              title="Share Includes"
              label="Share Includes"
              desc="The link a tap on Share puts under the passage. Hold Share, or right-click it on a computer, to pick the other one for a single share. Copy always adds the website link."
              value={settings.shareLink === 'site' ? 'site' : 'app'}
              options={SHARE_LINK_OPTIONS}
              onChange={(v) => onSetting("shareLink", v)}
            />
            <SettingsRow
              label="Highlight the Passage"
              desc="Off (default): a website link opens the letter itself, like thevolumesoftruth.com/The_Wide_Path. On: it opens the letter scrolled to the words you copied, highlighted."
              checked={!!settings.linkHighlight}
              onToggle={() => onToggle("linkHighlight")}
            />
          </div>
        </SettingsGroup>

        {/* Downloads & storage (rs2): what this device holds - songs kept, Garden pictures, and the sizes. */}
        <SettingsGroup label="Downloads & storage" sub={glance.storage} {...groupProps('storage')}>
          <div className="settings-card">
            <SongsKeptRow />
            <SelectField
              eyebrow="Downloads & storage"
              title="A Return to The Garden"
              label="Garden Image Quality"
              desc="Changing this re-downloads images at the selected quality next time you view them."
              value={settings.gardenTier || GARDEN_DEFAULT_TIER}
              options={GARDEN_TIERS.map((t) => ({
                id: t.id,
                label: `${t.label} · ${t.size}`,
                desc: `${t.res} · ${t.desc}`
              }))}
              onChange={(v) => onSetting("gardenTier", v)}
            />
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
          </div>
        </SettingsGroup>

        {/* Your data (rs2, sheet 33): the last backup first, with the one button that makes a new one;
            restore and check under it; the erase apart, last. Behaviour is the backup flow's, unchanged. */}
        <SettingsGroup label="Your data" sub={glance.data} {...groupProps('data')}>
          <div className="settings-backup-card">
            <p className="caps-label settings-caps">Last backup</p>
            {/* datasafe 10-05: passive, no nag - when this device last exported. */}
            <p className="settings-backup-when">{_lastBackupText()}</p>
            <p className="settings-backup-what">One file (votreader-backup-&lt;date&gt;.votbak) with every note, highlight, journal entry, bookmark, link, reading mark and setting on this device, saved to Downloads or the folder you choose. Keep it somewhere you control.</p>
            <button type="button" className="gold-pill settings-backup-btn" disabled={backupBusy} onClick={exportNow}>Back up now</button>
          </div>
          <div className="settings-card">
            {safety && safety.where && (
              <DataInfoRow label="Automatic snapshots" value={_snapshotText(safety)} />
            )}
            {weekly && weekly.supported && (
              <DataInfoRow label="Weekly copy" value={_weeklyText(weekly)}>
                <button className="settings-clear-btn" onClick={(e) => { e.stopPropagation(); toggleWeekly(); }}>{weekly.on ? 'Turn off' : 'Turn on'}</button>
              </DataInfoRow>
            )}
            <DataActionRow
              label="Restore from a backup"
              desc="Restore a previously exported backup file (a .votbak file). It replaces the kinds of data the backup holds with its contents; you are asked to confirm before anything is overwritten."
            >
              <button className="settings-clear-btn" disabled={backupBusy} onClick={(e) => { e.stopPropagation(); _runBackupOperation(importPersonalData); }}>Restore</button>
            </DataActionRow>
            <DataActionRow
              label="Check a backup"
              desc="Check a backup file without importing it: reads the whole file, verifies its structure and integrity checksum, and reports what it contains. Nothing on this device changes."
            >
              <button className="settings-clear-btn" disabled={backupBusy} onClick={(e) => { e.stopPropagation(); setVerifyReport(null); _runLockedBackupOperation(verifyBackupFile); }}>Check file</button>
            </DataActionRow>
            {verifyReport && (
              /* Always-visible result (NOT DataActionRow — its desc hides
                 behind the ⓘ toggle; a report the user just asked for must
                 not need a second tap). */
              <div className={'settings-row' + (verifyReport.level === 'warn' ? ' danger-zone' : '')}>
                <div className="settings-row-head">
                  <span className="settings-row-label">Check result</span>
                  <span className="settings-row-grow" />
                  <button className="settings-clear-btn" onClick={(e) => { e.stopPropagation(); setVerifyReport(null); }}>Dismiss</button>
                </div>
                <div className="settings-row-desc">{verifyReport.message}</div>
              </div>
            )}
          </div>
          <p className="caps-label settings-caps settings-danger-caps">Danger zone</p>
          <div className="settings-card">
            {/* One wide button (sheet 33's Danger zone row): the confirm sheet carries the full warning. */}
            <div className="settings-row danger-zone">
              <button type="button" className="settings-clear-btn danger settings-danger-wide" disabled={backupBusy} onClick={(e) => { e.stopPropagation(); setWipeText(''); setWipeConfirm(true); }}>Clear All My Data</button>
              <p className="settings-danger-note">Erases every note, highlight, journal entry, bookmark and reading mark on this device, and resets settings. It asks first, and cannot be undone.</p>
            </div>
          </div>
        </SettingsGroup>

        {/* Help & about (rs2, the canvas's SetHelp board). The tour is re-openable from here. */}
        <SettingsGroup label="Help & about" sub={glance.help} {...groupProps('help')}>
          <div className="settings-card">
            <SettingsNavRow className="settings-help-btn" title="Show me around" sub={tourNote} onClick={() => { if (typeof TourController !== 'undefined') TourController.start('settings'); }} />
            <SettingsNavRow title="About VOTReader" onClick={() => setInfoPage('about')} />
            <SettingsNavRow title="Credits & licenses" onClick={() => setInfoPage('credits')} />
            <SettingsNavRow title="Privacy" sub="Nothing you keep leaves this device" onClick={() => setInfoPage('privacy')} />
            <DataInfoRow label="App version" value={versionDisplayText}>
              <button
                className="settings-clear-btn"
                disabled={buildInfo.state === 'loading'}
                onClick={(e) => { e.stopPropagation(); refreshBuildInfo(); }}
              >Check</button>
            </DataInfoRow>
            <DataInfoRow label="Platform" value={_platformLabel(StorageHealth.getPlatform())} />
            {/* Diagnostic-log status row. Renders only when entries exist (Android: native BoundedLogTree
                merged with the JS DiagnosticLog; web: the JS DiagnosticLog). Included in the next backup. */}
            {diagnosticLog.length > 0 && (
              <DataActionRow
                label="Diagnostic Log"
                desc={`${diagnosticLog.length} recent ${diagnosticLog.length === 1 ? 'entry' : 'entries'} captured (warnings, errors, and timings; content URIs and file paths redacted). Included in your next backup. Last entry: ${new Date(diagnosticLog[diagnosticLog.length - 1].t).toLocaleString()}.`}
              >
                <span className="settings-row-value">{diagnosticLog.length} {diagnosticLog.length === 1 ? 'entry' : 'entries'}</span>
              </DataActionRow>
            )}
          </div>
        </SettingsGroup>
        </div>
        )}

        {!pageOpen && <p className="settings-save-note">Changes save on this device.</p>}

        {/* The wipe + import-overwrite overlays live OUTSIDE the groups: they are fixed-position
            sheets whose mount must not depend on a page being open — the import confirm in
            particular arrives ASYNC after a native file picker. */}
        {wipeConfirm && (
          <div
            className="note-sheet-overlay"
            onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) closeWipe(); }}
          >
            <div className="note-sheet settings-sheet" ref={wipeTrapRef} role="dialog" aria-modal="true" aria-labelledby="settings-wipe-title" onClick={(e) => e.stopPropagation()}>
              <div className="note-sheet-header">
                <div className="note-sheet-title" id="settings-wipe-title">Delete All Personal Data</div>
              </div>
              <p className="settings-sheet-text">
                This permanently erases every note, highlight, notebook, journal entry, bookmark, link, reading-progress mark, history record, saved tab, and the search cache, then resets all settings to defaults.{' '}
                <strong className="settings-sheet-warn">This cannot be undone.</strong> Back up first if you want to keep them.
              </p>
              <button type="button" className="settings-sheet-link" disabled={backupBusy} onClick={(e) => { closeWipe(); exportNow(e); }}>Back up now first</button>
              <p className="settings-sheet-hint">
                Type <strong>DELETE</strong> to confirm.
              </p>
              <input
                type="text"
                className="settings-sheet-input"
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
              />
              <div className="settings-sheet-actions">
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
        {/* Wave-0: the import-overwrite confirm sheet (replaces the native window.confirm).
            `proceed` closes the sheet itself before applying. */}
        {importConfirm && (
          <div
            className="note-sheet-overlay"
            onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) _settleImportConfirm(false); }}
          >
            <div className="note-sheet settings-sheet" ref={importTrapRef} role="dialog" aria-modal="true" aria-labelledby="settings-import-title" onClick={(e) => e.stopPropagation()}>
              <div className="note-sheet-header">
                <div className="note-sheet-title" id="settings-import-title">Import from Backup</div>
              </div>
              <p className="settings-sheet-text settings-sheet-pre">
                {importConfirm.message}
              </p>
              <div className="settings-sheet-actions">
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
      </div>
    </ScreenLayout>
  );
}
