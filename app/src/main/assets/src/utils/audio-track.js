// @ts-check
/*
   audio-track — trusted VOT release-asset track primitives

   Playback and the Listening Library both accept track-shaped data from
   durable storage. Keeping their URL policy and display normalization here
   means an imported favorite can never turn the app into a generic remote
   audio loader, while the player and library stay in agreement about what a
   valid VOT recording looks like.
*/

/** GitHub release location that owns every shipped VOT audio asset. */
export const AUDIO_RELEASE_PREFIX = 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/';

/** Sibling release owning the original whole-book Bible audiobooks
 *  (2026-08-09). A SEPARATE tag: GitHub enforces 1,000 assets per release and
 *  audio-v1 already carries ~729 letter tracks.
 *
 *  LEGACY, AND PERMANENT. Nothing queues from here any more — BRM ships
 *  per-chapter below — but saved Listening Library recordings and pre-switch
 *  resume snapshots hold these immutable URLs, so the tag stays live forever
 *  and the prefix stays in the trust boundary. Append-only; never prune. */
export const AUDIO_BIBLE_RELEASE_PREFIX = 'https://github.com/VOTReader/votreader-assets/releases/download/audio-bible-v1/';

/** The Word of Promise per-chapter releases. 1,189 chapter files exceed the
 *  1,000-asset/release cap, so the edition spans two tags — the testament is
 *  encoded in the asset name ('wop1_' OT / 'wop2_' NT) and picks the tag. */
export const AUDIO_WOP_OT_PREFIX = 'https://github.com/VOTReader/votreader-assets/releases/download/audio-wop-v1/';
export const AUDIO_WOP_NT_PREFIX = 'https://github.com/VOTReader/votreader-assets/releases/download/audio-wop-v2/';

/** BRM KJV per-chapter releases — the same two-tag shape as the Word of
 *  Promise ('brm1_' OT / 'brm2_' NT), and the edition's live source since
 *  2026-08-09. The whole-book tracks it replaced stay reachable through
 *  AUDIO_BIBLE_RELEASE_PREFIX above. */
export const AUDIO_BRM_OT_PREFIX = 'https://github.com/VOTReader/votreader-assets/releases/download/audio-brm-v1/';
export const AUDIO_BRM_NT_PREFIX = 'https://github.com/VOTReader/votreader-assets/releases/download/audio-brm-v2/';

/** World English Bible per-chapter releases (ebible.org recording, public
 *  domain) — 'web1_' OT / 'web2_' NT, the third recorded edition. */
export const AUDIO_WEB_OT_PREFIX = 'https://github.com/VOTReader/votreader-assets/releases/download/audio-web-v1/';
export const AUDIO_WEB_NT_PREFIX = 'https://github.com/VOTReader/votreader-assets/releases/download/audio-web-v2/';

/** Every release prefix a stored/played track may point at — the whole trust
 *  boundary. Anything else is rejected. */
const RELEASE_PREFIXES = Object.freeze([
  AUDIO_RELEASE_PREFIX,
  AUDIO_BIBLE_RELEASE_PREFIX,
  AUDIO_WOP_OT_PREFIX,
  AUDIO_WOP_NT_PREFIX,
  AUDIO_BRM_OT_PREFIX,
  AUDIO_BRM_NT_PREFIX,
  AUDIO_WEB_OT_PREFIX,
  AUDIO_WEB_NT_PREFIX,
]);

/** Recorded Bible editions the app knows how to stream. Registry lives here
 *  (not in the lazy manifest) so Settings can list editions before the Bible
 *  corpus loads. `volKey` prefixes every BIBLE_AUDIO_MANIFEST key; anything
 *  starting with 'bible-' routes to a Bible release. Future voices:
 *  add an entry + manifest rows + release assets — nothing else.
 *
 *  TWO NAMES, AND THEY ARE NOT INTERCHANGEABLE. The KEY of this registry is
 *  the EDITION ID — the aligner's spelling (tools/batch-align-bible.py's own
 *  EDITIONS keys) — and it is what names the read-along timing file
 *  `src/data/bible-sync-<id>.js` and its global `BIBLE_SYNC_<ID>`. The
 *  `volKey` names audio manifests, queues and settings, and nothing else.
 *  They coincide for brm-kjv and wop-nkjv and DIVERGE for web-ebible
 *  (volKey 'bible-web'), which is exactly why slicing 'bible-' off a volKey
 *  to guess an edition id is a silent 404 waiting for the WEB alignment.
 *  Cross that boundary only through bibleSyncEditionFor/bibleSyncGlobalFor
 *  below; utils/audio-track.editions.test.js gates the two lists against the
 *  shipper so they cannot drift apart again. */
/** The edition every book is guaranteed to be offered in — the fallback when
 *  a selected edition does not carry a book. Named once: resolveBibleAudio
 *  reads it, and a future partial edition must not turn it into a literal at
 *  each call site. */
export const BIBLE_AUDIO_DEFAULT = 'brm-kjv';

export const BIBLE_AUDIO_EDITIONS = Object.freeze({
  'brm-kjv': Object.freeze({
    label: 'KJV · Biblical Restoration Ministries',
    short: 'KJV · BRM',
    translation: 'kjv',
    volKey: 'bible-brm-kjv',
  }),
  'wop-nkjv': Object.freeze({
    label: 'NKJV · The Word of Promise (Dramatized)',
    short: 'NKJV · Dramatized',
    translation: 'nkjv',
    volKey: 'bible-wop-nkjv',
  }),
  'web-ebible': Object.freeze({
    label: 'WEB · World English Bible',
    short: 'WEB',
    translation: 'web',
    volKey: 'bible-web',
  }),
});

/** Reader code → the human name every surface prints. ONE registry: the
 *  player's `readerLabel()` reads it, the listening desk's Voice chips render
 *  it, and Settings builds the default-reader options from it — so a new
 *  reader code is one line here, not four scattered string literals.
 *
 *  Order is the app's reader RANK (Benjamin supersedes, then Timothy, then the
 *  synthesized readings), which is the order Settings offers them in. */
export const AUDIO_READERS = Object.freeze({
  B: 'Read by Benjamin',
  T: 'Read by Timothy',
  V: 'Text-to-speech',
  M: 'AI reading with music',
});

/**
 * Human label for a reader code, or null when unknown. `hasOwnProperty`, not a
 * bare index: 'toString' is not a reader.
 *
 * @param {unknown} code
 * @returns {string | null}
 */
export function audioReaderLabel(code) {
  return (typeof code === 'string' && Object.prototype.hasOwnProperty.call(AUDIO_READERS, code))
    ? AUDIO_READERS[/** @type {keyof typeof AUDIO_READERS} */ (code)]
    : null;
}

/* SettingsScreen is a classic-globals module (no imports) — publish the
   registries the same way AudioLibraryStore bridges across bundles. audio-track
   rides bundles b + d, both booted before the lazy Settings screen loads.
   AUDIO_PLAYBACK_RATES publishes itself beside its own declaration further
   down — reading a `const` before its initializer runs is a TDZ throw, not a
   hoisted undefined, so a registry is published where it is declared. */
if (typeof globalThis !== 'undefined') {
  /** @type {any} */ (globalThis).BIBLE_AUDIO_EDITIONS = BIBLE_AUDIO_EDITIONS;
  /** @type {any} */ (globalThis).AUDIO_READERS = AUDIO_READERS;
}

/** Registry entry for a settings.bibleAudio value, or null for 'off'/unknown. */
export function bibleAudioEdition(setting) {
  return (typeof setting === 'string' && Object.prototype.hasOwnProperty.call(BIBLE_AUDIO_EDITIONS, setting))
    ? BIBLE_AUDIO_EDITIONS[/** @type {keyof typeof BIBLE_AUDIO_EDITIONS} */ (setting)]
    : null;
}

/**
 * The EDITION ID whose entry carries this volKey, or null. This is the
 * translation between the two names the registry holds: 'bible-web' is the
 * queue's name for a recording whose timings ship as 'web-ebible'.
 *
 * @param {unknown} volKey - e.g. 'bible-web'
 * @returns {string | null} e.g. 'web-ebible'
 */
export function bibleSyncEditionFor(volKey) {
  if (typeof volKey !== 'string' || !volKey) return null;
  for (const id of Object.keys(BIBLE_AUDIO_EDITIONS)) {
    if (BIBLE_AUDIO_EDITIONS[/** @type {keyof typeof BIBLE_AUDIO_EDITIONS} */ (id)].volKey === volKey) return id;
  }
  return null;
}

/**
 * The classic-script global a shipped timings file declares for this volKey's
 * edition — `BIBLE_SYNC_<ID>`, the edition id upper-cased with its hyphens as
 * underscores, exactly as tools/batch-align-bible.py writes it. Null for a
 * volKey no edition claims, which a caller must read as "paint nothing"
 * rather than indexing the globals with an empty name.
 *
 * @param {unknown} volKey - e.g. 'bible-web'
 * @returns {string | null} e.g. 'BIBLE_SYNC_WEB_EBIBLE'
 */
export function bibleSyncGlobalFor(volKey) {
  const id = bibleSyncEditionFor(volKey);
  return id ? 'BIBLE_SYNC_' + id.toUpperCase().replace(/-/g, '_') : null;
}

const ASSET_NAME = /^[A-Za-z0-9_-]+\.mp3$/;
const MAX_KEY = 240;
const MAX_TITLE = 240;
const MAX_SUB = 240;
const MAX_READER = 24;
const MAX_PART = 120;

/**
 * Build the canonical stream URL from a manifest's Drive-derived asset id.
 * Invalid ids become an empty string rather than widening the release path.
 *
 * @param {unknown} id
 * @returns {string}
 */
export function audioAssetUrl(id) {
  const asset = typeof id === 'string' ? id.trim() : '';
  return /^[A-Za-z0-9_-]+$/.test(asset) ? AUDIO_RELEASE_PREFIX + asset + '.mp3' : '';
}

/**
 * Canonical stream URL for a Bible-edition asset. The asset name picks its
 * release: the per-chapter editions carry a '<prefix><testament>_' stamp
 * ('wop1_'/'wop2_', 'brm1_'/'brm2_') routing to that edition's OT/NT tag.
 * Everything else falls through to audio-bible-v1, which is what the legacy
 * whole-book ids ('brm-kjv_genesis') still resolve to — note 'brm-kjv_' does
 * NOT match 'brm1_'/'brm2_', so old saved tracks keep their original host.
 * Same id policy as audioAssetUrl — invalid ids become ''.
 *
 * @param {unknown} id
 * @returns {string}
 */
/**
 * What an asset-name stamp says: which release hosts it, and which EDITION
 * recorded it. ONE table, because these are two readings of the same six
 * characters and a second copy is a second thing to drift — read-along has to
 * ask "which edition is playing" of the very name the URL builder routes on.
 *
 * A name matching no stamp is not a licence to guess: the URL falls through to
 * audio-bible-v1 (which is what the legacy whole-book ids resolve to) and the
 * edition reads as null.
 */
const BIBLE_ASSET_STAMPS = Object.freeze({
  wop1_: Object.freeze({ host: AUDIO_WOP_OT_PREFIX, edition: 'wop-nkjv' }),
  wop2_: Object.freeze({ host: AUDIO_WOP_NT_PREFIX, edition: 'wop-nkjv' }),
  brm1_: Object.freeze({ host: AUDIO_BRM_OT_PREFIX, edition: 'brm-kjv' }),
  brm2_: Object.freeze({ host: AUDIO_BRM_NT_PREFIX, edition: 'brm-kjv' }),
  web1_: Object.freeze({ host: AUDIO_WEB_OT_PREFIX, edition: 'web-ebible' }),
  web2_: Object.freeze({ host: AUDIO_WEB_NT_PREFIX, edition: 'web-ebible' }),
});

/** The stamp entry an asset name carries, or null. Stamps are 5 characters. */
function _stampOf(asset) {
  const stamp = asset.slice(0, 5);
  return Object.prototype.hasOwnProperty.call(BIBLE_ASSET_STAMPS, stamp)
    ? BIBLE_ASSET_STAMPS[stamp] : null;
}

export function bibleAudioAssetUrl(id) {
  const asset = typeof id === 'string' ? id.trim() : '';
  if (!/^[A-Za-z0-9_-]+$/.test(asset)) return '';
  const stamp = _stampOf(asset);
  return (stamp ? stamp.host : AUDIO_BIBLE_RELEASE_PREFIX) + asset + '.mp3';
}

/**
 * The edition id THE STAMP TABLE NAMES for this asset id, or null.
 *
 * NOT the answer to "which edition is the reader hearing" — that is
 * resolveBibleAudio's `paint`, which reads the track's own key and proves it
 * against the manifest. This is a fact about the NAME, and it exists so the
 * one-table invariant stays checkable: every stamp bibleAudioAssetUrl routes
 * on also names an edition, so the two readings of an asset name can never
 * disagree.
 *
 * The old docstring said "the EDITION ID that recorded this asset", which is
 * what invited it to be used as identity, and it cannot serve as identity: an
 * edition whose assets are archive ids (TSOT Matthew's 28 Drive ids) carries
 * no stamp, so this returns null for a recording that is playing perfectly
 * well. A wrong comment is part of a defect, so it is part of the fix.
 *
 * @param {unknown} assetId  e.g. 'brm2_john_001'
 * @returns {string | null}  e.g. 'brm-kjv'
 */
export function bibleEditionOfAsset(assetId) {
  const asset = typeof assetId === 'string' ? assetId.trim() : '';
  if (!/^[A-Za-z0-9_-]+$/.test(asset)) return null;
  const stamp = _stampOf(asset);
  return stamp ? stamp.edition : null;
}

/**
 * The edition id of the recording a track holds, or null.
 *
 * Legacy whole-book tracks resolve to null here and that is correct: their
 * clock is book-relative, so per-chapter verse timings would be wrong against
 * them.
 *
 * @param {any} track
 * @param {any} manifest — BIBLE_AUDIO_MANIFEST, or null before the corpus loads
 * @returns {string | null}
 */
function _paintEditionOf(track, manifest) {
  const key = (track && typeof track.key === 'string') ? track.key : '';
  const divider = key.indexOf(':');
  // A CHEAP SHAPE REJECT, NOT A CORRECTNESS GUARD, and the difference is
  // measured: biting this line out leaves the suite green, because a malformed
  // key finds no manifest row and the row check answers null anyway. It is
  // here to keep a garbage string out of the lookup, and it says so rather
  // than being read later as the thing that makes this function safe.
  if (divider < 1 || divider >= key.length - 1) return null;
  const rows = manifest && manifest[key];
  if (!Array.isArray(rows)) return null;
  const asset = _assetIdOfTrack(track);
  if (!asset || !rows.some((row) => row && row[0] === asset)) return null;
  return bibleSyncEditionFor(key.slice(0, divider));
}

/** The asset id inside a track's stream URL, or ''. */
function _assetIdOfTrack(track) {
  const url = (track && typeof track.url === 'string') ? track.url : '';
  const tail = url.slice(url.lastIndexOf('/') + 1);
  return tail.slice(-4).toLowerCase() === '.mp3' ? tail.slice(0, -4) : '';
}

/**
 * The two different questions a Bible surface asks about editions, answered
 * from DIFFERENT inputs and never confused for one another.
 *
 *   offer  — which edition this BOOK is offered in. The selected edition when
 *            BIBLE_AUDIO_MANIFEST carries rows for it, else the default, else
 *            null. Resolves with NOTHING playing, because the Listen pill has
 *            to render before any audio exists. It FALLS BACK, and that is its
 *            whole job: one partial edition must not blank 65 books.
 *   paint  — which edition the recording CURRENTLY PLAYING belongs to, read
 *            from the track's own KEY and PROVED against the manifest row that
 *            key names. Null when nothing plays, when the track carries no
 *            key, when the key names no edition we know, and when the edition
 *            it names does not carry the asset.
 *
 * `paint` NEVER falls back to `offer`. A fallback there would fire on exactly
 * the case the fallback exists for — a reader on a book the selected edition
 * lacks, playing a library track from a third edition — and paint one
 * edition's clock over another's voice.
 *
 * @param {{settings?:any, bookId?:string, track?:any}} opts
 * @returns {{offer: any, paint: any}}  registry entries, or null
 */
export function resolveBibleAudio(opts) {
  const o = opts || {};
  const selected = bibleAudioEdition(o.settings && o.settings.bibleAudio);
  const manifest = /** @type {any} */ (globalThis).BIBLE_AUDIO_MANIFEST || null;
  const carries = (ed) => !!(ed && manifest && o.bookId
    && manifest[ed.volKey + ':' + o.bookId]);
  // No bookId asked about → no per-book question to answer, so the selection
  // stands as given. With one, a selected edition that lacks the book yields to
  // the default rather than removing the pill from that book entirely.
  let offer = selected;
  if (selected && o.bookId && !carries(selected)) {
    const fallback = BIBLE_AUDIO_EDITIONS[BIBLE_AUDIO_DEFAULT];
    offer = carries(fallback) ? fallback : null;
  }
  // Paint reads the KEY, not the asset name. The player builds every track's
  // key as `volKey + ':' + letterId`, so the edition is already on the object;
  // reading it out of the NAME instead was reaching for the instrument next to
  // the question, and it cannot see an edition whose assets are archive ids
  // (TSOT Matthew's 28 Drive ids carry no stamp, so paint was null for every
  // one of them and the wash went dead whatever timings shipped).
  //
  // The manifest row is what turns the key from a claim into a fact. A key is
  // stored data and a restored row can name an edition it does not hold; the
  // asset id comes from the URL, so requiring the row that key names to
  // CONTAIN it proves the key rather than trusting it. Without that, a lying
  // key paints one edition's clock over another's voice — the defect this
  // resolver exists to prevent, arriving through a different door.
  const editionId = _paintEditionOf(o.track, manifest);
  return { offer: offer || null, paint: (editionId && BIBLE_AUDIO_EDITIONS[editionId]) || null };
}

/**
 * Is this exactly one of VOT's immutable release audio assets? The
 * RELEASE_PREFIXES list IS the boundary — nothing else qualifies.
 *
 * @param {unknown} url
 * @returns {boolean}
 */
export function isVotAudioUrl(url) {
  if (typeof url !== 'string') return false;
  const prefix = RELEASE_PREFIXES.find((p) => url.indexOf(p) === 0);
  return !!prefix && ASSET_NAME.test(url.slice(prefix.length));
}

/** @param {unknown} value @param {number} max @returns {string} */
function _text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Normalize untrusted persisted data into the public audio-player Track shape.
 * The returned object is always a new value, so callers can safely store it
 * without retaining references into an import payload.
 *
 * @param {unknown} value
 * @returns {{ key: string | null, title: string, sub: string | null, url: string, readerCode: string, partLabel: string | null } | null}
 */
export function normalizeAudioTrack(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  if (typeof raw.url !== 'string' || !isVotAudioUrl(raw.url)) return null;
  const key = _text(raw.key, MAX_KEY);
  const sub = _text(raw.sub, MAX_SUB);
  const partLabel = _text(raw.partLabel, MAX_PART);
  return {
    key: key || null,
    title: _text(raw.title, MAX_TITLE) || 'Untitled recording',
    sub: sub || null,
    url: raw.url,
    readerCode: _text(raw.readerCode, MAX_READER),
    partLabel: partLabel || null,
  };
}

/**
 * The part label a player surface should PRINT beside a title — or null when
 * printing it would only echo the title back.
 *
 * Since the per-chapter Bible editions began titling each track by its chapter
 * (2026-08-10, C2-A/A4), a chapter carries BOTH `title` "Genesis 2" and
 * `partLabel` "Chapter 2": the bar read "Genesis 2 · Chapter 2" and the desk's
 * head line said the number a third time in the same glance. The part label is
 * still the authoritative chapter (the jump-to-text, the read credit and the
 * voice switch all parse it), so it is the DISPLAY that suppresses, never the
 * data.
 *
 * The rule is deliberately narrow — TITLE-UNIQUE: suppress only when the title
 * already ends with the exact number the label names, as a separate word. So
 * "Chapter 2" beside "Genesis 12" survives (2 is not that title's last word),
 * as does every non-chapter label ("Part 2", "Addendum") and every Bible track
 * whose title names no chapter (a legacy whole-book recording).
 *
 * @param {unknown} title
 * @param {unknown} partLabel
 * @returns {string | null}
 */
export function displayPartLabel(title, partLabel) {
  const label = typeof partLabel === 'string' ? partLabel.trim() : '';
  if (!label) return null;
  const match = label.match(/^Chapter (\d+)$/);
  if (!match) return label;
  const text = typeof title === 'string' ? title.trim() : '';
  const number = match[1];
  const at = text.length - number.length;
  // A separate trailing word: the digits must end the title AND be preceded by
  // a space (never by another digit, which is what makes "Genesis 12" safe).
  if (at > 0 && text.slice(at) === number && /\s/.test(text.charAt(at - 1))) return null;
  return label;
}

/* ── durable-resume policy ────────────────────────────────────────────────
   Shared here rather than owned by the player, because the Listening Library
   surfaces have to describe the SAME judgment the player acts on: a row that
   says "2:10 left" and a tap that restarts from zero would be a lie. Pure
   constants, so both bundles import them directly (no runtime bridge). */

/** Below this many seconds a recording restarts — dropping a listener into
 *  the middle of an opening line is worse than replaying half a minute. */
export const AUDIO_RESUME_MIN_SEC = 30;
/** At or past this fraction of the length a recording reads as FINISHED: a
 *  place to start again, not a place to return to. */
export const AUDIO_RESUME_END_FRACTION = 0.97;
/** Rewind on resume — a few words of context beat an exact splice. */
export const AUDIO_RESUME_REWIND_SEC = 5;

/** Standard rates intentionally offered by the listening UI. This closed set IS
 *  the trust boundary for playback speed: the desk's radiogroup renders from it
 *  and `normalizeAudioRate` snaps every imported value onto it, so adding a step
 *  is a one-line change and nothing may pin the array's LENGTH. */
export const AUDIO_PLAYBACK_RATES = Object.freeze([0.75, 1, 1.25, 1.5, 1.75, 2]);

/* Published for the classic-globals Settings screen (Listening → Default
   Speed), the same bridge BIBLE_AUDIO_EDITIONS / AUDIO_READERS use above.
   Declared HERE, next to the const, because the publish block above runs
   before this initializer. */
if (typeof globalThis !== 'undefined') {
  /** @type {any} */ (globalThis).AUDIO_PLAYBACK_RATES = AUDIO_PLAYBACK_RATES;
}

/**
 * Imported values must land on a tested, comprehensible rate. A nearby
 * floating-point representation (for example 1.2500000001) still resolves to
 * its intended preset.
 *
 * @param {unknown} value
 * @returns {number}
 */
export function normalizeAudioRate(value) {
  const number = Number(value);
  return AUDIO_PLAYBACK_RATES.find((rate) => Math.abs(rate - number) < 0.001) || 1;
}
