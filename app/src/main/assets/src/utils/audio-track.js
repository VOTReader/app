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

/** Every release prefix a stored/played track may point at — the whole trust
 *  boundary. Anything else is rejected. */
const RELEASE_PREFIXES = Object.freeze([
  AUDIO_RELEASE_PREFIX,
  AUDIO_BIBLE_RELEASE_PREFIX,
  AUDIO_WOP_OT_PREFIX,
  AUDIO_WOP_NT_PREFIX,
  AUDIO_BRM_OT_PREFIX,
  AUDIO_BRM_NT_PREFIX,
]);

/** Recorded Bible editions the app knows how to stream. Registry lives here
 *  (not in the lazy manifest) so Settings can list editions before the Bible
 *  corpus loads. `volKey` prefixes every BIBLE_AUDIO_MANIFEST key; anything
 *  starting with 'bible-' routes to a Bible release. Future voices:
 *  add an entry + manifest rows + release assets — nothing else. */
export const BIBLE_AUDIO_EDITIONS = Object.freeze({
  'brm-kjv': Object.freeze({
    label: 'KJV · Biblical Restoration Ministries',
    translation: 'kjv',
    volKey: 'bible-brm-kjv',
  }),
  'wop-nkjv': Object.freeze({
    label: 'NKJV · The Word of Promise (Dramatized)',
    translation: 'nkjv',
    volKey: 'bible-wop-nkjv',
  }),
});

/* SettingsScreen is a classic-globals module (no imports) — publish the
   registry the same way AudioLibraryStore bridges across bundles. audio-track
   rides bundles b + d, both booted before the lazy Settings screen loads. */
if (typeof globalThis !== 'undefined') /** @type {any} */ (globalThis).BIBLE_AUDIO_EDITIONS = BIBLE_AUDIO_EDITIONS;

/** Registry entry for a settings.bibleAudio value, or null for 'off'/unknown. */
export function bibleAudioEdition(setting) {
  return (typeof setting === 'string' && Object.prototype.hasOwnProperty.call(BIBLE_AUDIO_EDITIONS, setting))
    ? BIBLE_AUDIO_EDITIONS[/** @type {keyof typeof BIBLE_AUDIO_EDITIONS} */ (setting)]
    : null;
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
export function bibleAudioAssetUrl(id) {
  const asset = typeof id === 'string' ? id.trim() : '';
  if (!/^[A-Za-z0-9_-]+$/.test(asset)) return '';
  const prefix = asset.lastIndexOf('wop1_', 0) === 0 ? AUDIO_WOP_OT_PREFIX
    : asset.lastIndexOf('wop2_', 0) === 0 ? AUDIO_WOP_NT_PREFIX
    : asset.lastIndexOf('brm1_', 0) === 0 ? AUDIO_BRM_OT_PREFIX
    : asset.lastIndexOf('brm2_', 0) === 0 ? AUDIO_BRM_NT_PREFIX
    : AUDIO_BIBLE_RELEASE_PREFIX;
  return prefix + asset + '.mp3';
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

/** Standard rates intentionally offered by the listening UI. */
export const AUDIO_PLAYBACK_RATES = Object.freeze([0.75, 1, 1.25, 1.5, 2]);

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
