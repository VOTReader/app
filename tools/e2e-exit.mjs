/* e2e-exit — the exit code of an e2e walk that threw (W76, sweep 2026-10-13).
   The walks share one contract: exit 0 = every assertion held, 1 = a FAIL line says which,
   2 = the walk could not be driven. A throw is classified here so a real regression is never
   reported as a harness fault (e2e-study-audio's catch rewrote its exit 1 into 2). */

/**
 * @param {number} exitCode  the code the walk set before throwing (0 = none)
 * @param {number} priorFailures  FAIL lines recorded before the throw
 * @returns {number}
 */
export function exitAfterThrow(exitCode, priorFailures) {
  if (exitCode) return exitCode;          // the walk classified it before throwing
  return priorFailures > 0 ? 1 : 2;       // a regression already found stays the finding
}
