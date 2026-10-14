// @ts-check
/*
   The double-tap shared by two gestures (ra3, Corbin 2026-10-14: double-tap
   on reading text goes fullscreen and wins; a single tap jumps the audio at
   once, and the jump is undone if a second tap follows).

   hooks/use-fullscreen-gesture.js (bundle-b) recognizes the double-tap;
   ReadAlongHighlight (bundle-d) jumps the audio on its first tap. A module
   imported by both bundles is two copies, so they meet through a DOM event
   on `document`, fired as the gesture toggles fullscreen, and through these
   constants, which both copies read the same.
*/

/** Two taps closer together than this are one double-tap. */
export const DOUBLE_TAP_MS = 420;
/** ...and only when the second lands this close to the first. */
export const MAX_TAP_DISTANCE_PX = 32;
/** Fired on `document` when a double-tap toggles fullscreen; detail { x, y } is the second tap. */
export const FULLSCREEN_GESTURE_EVENT = 'vot-fullscreen-gesture';
