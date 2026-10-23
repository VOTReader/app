/* useUpdateHold — hold the app-update reload while a sheet holds unsaved work
   (ds2, 2026-10-13; the why is in utils/update-hold.js). Released on unmount
   and whenever `active` turns false, so a closed sheet never pins the old build. */

import { holdUpdateReload } from '../utils/update-hold.js';

/**
 * @param {boolean} active - true while a reload would lose what is on screen
 * @param {string} reason - 'note', 'recording', ...
 * @param {{ remountOnly?: boolean }} [opts] - remountOnly: hold only the late-load remount
 */
export function useUpdateHold(active, reason, opts) {
  const remountOnly = !!(opts && opts.remountOnly);
  React.useEffect(() => (active ? holdUpdateReload(reason, { remountOnly }) : undefined), [active, reason, remountOnly]);
}
