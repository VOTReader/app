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
 * Is this exactly one of VOT's immutable release audio assets?
 *
 * @param {unknown} url
 * @returns {boolean}
 */
export function isVotAudioUrl(url) {
  return typeof url === 'string' &&
    url.indexOf(AUDIO_RELEASE_PREFIX) === 0 &&
    ASSET_NAME.test(url.slice(AUDIO_RELEASE_PREFIX.length));
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
