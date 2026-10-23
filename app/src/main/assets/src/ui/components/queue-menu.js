/* ═══════════════════════════════════════════════════════════════════════
   queue-menu — "Play next" and "Add to queue" for a row's ⋯ menu (player
   brief 3c, pl-l2 L3). Cluster D: the Listening Library's collection rows and
   every song row (SongListRow) offer them; RowMenu draws them. Its own module,
   so the song parts and the player's sheets never import each other.
   ═══════════════════════════════════════════════════════════════════════ */

import { AudioPlayer, AUDIO_TOAST_ID } from '../../utils/audio-player.js';
import { showToast } from '../../utils/toast.js';

/**
 * "Play next" and "Add to queue" for a row's ⋯ menu (brief 3c): the row's recordings go right after the one playing
 * or at the end of Up next, and a toast says so. None over a restored bar whose queue is not rebuilt yet.
 * @param {{ tracks: any[], name: string }} props
 * @returns {Array<{ id: string, text: string, icon: string, onSelect: () => void }>}
 */
export function queueMenuItems({ tracks, name }) {
  const list = Array.isArray(tracks) ? tracks.filter(Boolean) : [];
  if (!list.length || AudioPlayer.getState().restoring) return [];
  const say = (/** @type {string} */ text) => showToast({ id: AUDIO_TOAST_ID, className: 'vot-toast', text, ariaLive: 'polite' });
  return [
    { id: 'next', text: 'Play next', icon: 'next', onSelect: () => { if (AudioPlayer.playNext(list)) say('Playing next: ' + name); } },
    { id: 'queue', text: 'Add to queue', icon: 'queue', onSelect: () => { if (AudioPlayer.addToQueue(list)) say('Added to Up next: ' + name); } },
  ];
}
