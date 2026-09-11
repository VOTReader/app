/* e2e-walk-lib — helpers shared by the update-reload / kill-cadence walks (pure; fake-clock testable).
   ─────────────────────────────────────────────────────────────────────────────
   settleRead(read, opts)       a position is a reading only once the scroller has been STILL.
                                update-walk-follow-sample-1: one sample taken while the read-along
                                follow was still moving read 887 against 900 and was classified as
                                "moved for no reason this walk can name"; the settled value was 698.
   classifyRestoredPages(urls, base)
                                kill-cadence-armd-sibling-1: a persistent profile restores the previous
                                session's tabs at relaunch, so a second document of the origin boots
                                the player beside the measured page. Count and name what the walk did
                                not open, so arm D can close it and the report can say it did.
   settleLine(r)                the one report sentence for a settleRead result. */

/**
 * Poll `read()` every `everyMs` until the value has not changed for `stillMs`, or `maxMs` has passed.
 * @param {() => any} read                       returns the current position (any value; compared with Object.is)
 * @param {{stillMs?:number, maxMs?:number, everyMs?:number, now?:() => number, sleep?:(ms:number) => Promise<void>}} [opts]
 * @returns {Promise<{y:any, settled:boolean, waitedMs:number, stillMs:number, samples:{t:number,y:any}[]}>}
 *   `samples` holds the first read and every CHANGE (not every poll), so a report can list the moves.
 */
export async function settleRead(read, opts = {}) {
  const stillMs = opts.stillMs ?? 250;
  const maxMs = opts.maxMs ?? 4000;
  const everyMs = opts.everyMs ?? 16;
  const now = opts.now || (() => performance.now());
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const t0 = now();
  let y = await read();
  let lastChangeAt = 0;
  const samples = [{ t: 0, y }];
  for (;;) {
    const t = now() - t0;
    const still = t - lastChangeAt;
    if (still >= stillMs) return { y, settled: true, waitedMs: t, stillMs: still, samples };
    if (t >= maxMs) return { y, settled: false, waitedMs: t, stillMs: still, samples };
    await sleep(everyMs);
    const v = await read();
    if (!Object.is(v, y)) {
      y = v;
      lastChangeAt = now() - t0;
      samples.push({ t: lastChangeAt, y });
    }
  }
}

/**
 * Partition the pages a browser has open at launch by whether they are the app's origin.
 * @param {string[]} urls   `(await browser.pages()).map((p) => p.url())`
 * @param {string} base     the walk's app URL; its origin is "the app"
 * @returns {{total:number, appTabs:number, appUrls:string[], others:string[]}}
 */
export function classifyRestoredPages(urls, base) {
  const origin = new URL(base).origin;
  const appUrls = [];
  const others = [];
  for (const u of urls) {
    let same = false;
    try { same = new URL(u).origin === origin; } catch { /* about:blank, chrome://, or junk: not the app */ }
    (same ? appUrls : others).push(u);
  }
  return { total: urls.length, appTabs: appUrls.length, appUrls, others };
}

/** @param {{y:any, settled:boolean, waitedMs:number, stillMs:number, samples:{t:number,y:any}[]}} r */
export function settleLine(r) {
  const moves = r.samples.length - 1;
  const path = moves ? ` after moving ${moves}x (${r.samples.map((s) => s.y).join(' -> ')})` : '';
  return r.settled
    ? `still at ${r.y} for ${Math.round(r.stillMs)} ms, read at +${Math.round(r.waitedMs)} ms${path}`
    : `NOT still: ${r.y} at +${Math.round(r.waitedMs)} ms, last move ${Math.round(r.stillMs)} ms ago${path}`;
}
