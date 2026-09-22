/* ═══════════════════════════════════════════════════════════════════════
   CoverageBadge — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════

   One small word on a library row: can this be read along with, only listened
   to, or is there nothing recorded yet? The state comes from audio-coverage.js
   (one law, two screens); this file only dresses it.

   Colour is never the message: the badge SAYS "Read-along" / "Listening only" /
   "No recording", and its title carries the sentence behind the word, so a
   screen reader and a colour-blind reader get the same answer as everyone else.
*/

import { coverageCopy } from '../../utils/audio-coverage.js';

/**
 * @param {{ state: 'read-along' | 'listening-only' | 'no-recording', detail?: string | null }} props
 *   `detail` is the honest count beside a partly recorded work ("14 of 16 parts").
 */
export function CoverageBadge({ state, detail }) {
  const copy = coverageCopy(state);
  return (
    <span className="coverage-badge-wrap">
      <span className={'coverage-badge coverage-badge-' + state} title={copy.title}>{copy.label}</span>
      {detail ? <span className="coverage-badge-detail">{detail}</span> : null}
    </span>
  );
}
