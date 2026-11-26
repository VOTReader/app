/* place-gone.js — one toast for an Open whose place is no longer in the app (fix list #32): a bookmark with no
   endpoint, a link reading 'Open (unknown)'. It used to close the sheet and open nothing, silently. */
import { showToast } from './toast.js';

export const PLACE_GONE_TEXT = 'That place is no longer in the app.';

export function sayPlaceGone() {
  showToast({ id: 'place-gone', className: 'vot-toast', ariaLive: 'polite', text: PLACE_GONE_TEXT });
}
