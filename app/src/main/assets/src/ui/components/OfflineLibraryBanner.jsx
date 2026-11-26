/* ═══════════════════════════════════════════════════════════════════════
   OfflineLibraryBanner — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   "Offline library incomplete" with a Retry that downloads only the
   missing files (B5, 2026-09-22). Subscribes to OfflineLibrary
   (utils/offline-library.js) through useSyncExternalStore and starts its
   once-per-load check on mount.

   It shares the top strip with StorageHealthBanner, which renders it only
   when it has no storage scenario of its own: data danger comes first.
   Same .sh-banner look (Codex mockup variant B, lanes/docs/out/b5-mockups.html),
   but role="status": a missing offline file is news, not an alarm.

   b5l (2026-09-23): variant B puts the strip IN the page, between the nav
   and the content. Fixed and unspaced, it covered the top 44 px of every
   page and the chapter arrows. Like the player bar and TourPrompt it now
   declares itself - body.offline-strip-open and its measured height in
   --offline-strip-h - and app.css opens that much room under the nav and
   moves the arrows below it.
   ═══════════════════════════════════════════════════════════════════════ */

import { OfflineLibrary } from '../../utils/offline-library.js';
import { Notice } from './UiParts.jsx';
import { useStoreVersion } from '../../hooks/use-store-version.js';

/**
 * A strip under the top nav takes layout room while it shows: it declares body.offline-strip-open and its measured
 * height in --offline-strip-h, and app.css opens that much room under the page's nav. Shared with the storage banner
 * (cz3, 2026-10-05), which used to sit fixed over the nav and hide Back and Home; the two never show together.
 * @param {boolean} shown
 */
export function useTopStrip(shown) {
  const ref = React.useRef(/** @type {HTMLDivElement|null} */ (null));
  React.useLayoutEffect(() => {
    if (!shown) return undefined;
    const root = document.documentElement;
    const measure = () => { const el = ref.current; const h = el ? el.getBoundingClientRect().height : 0; if (h) root.style.setProperty('--offline-strip-h', Math.ceil(h * 10) / 10 + 'px'); };
    document.body.classList.add('offline-strip-open');
    measure();
    const ro = typeof ResizeObserver !== 'undefined' && ref.current ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(ref.current);
    return () => { if (ro) ro.disconnect(); document.body.classList.remove('offline-strip-open'); root.style.removeProperty('--offline-strip-h'); };
  }, [shown]);
  return ref;
}

/** @param {number} n @param {string} one @param {string} many */
function count(n, one, many) { return n === 1 ? '1 ' + one : n + ' ' + many; }

/**
 * U09.5 (UX wave 3): what Settings > Your Data says of the offline library, standing (the banner only appears after a
 * download run, so a reader could not see whether the books would open on a plane).
 * @param {string} phase @param {number} missing @returns {string}
 */
export function offlineLibraryWords(phase, missing) {
  if (phase === 'complete' || phase === 'fixed') return 'Ready. Every book opens without a connection.';
  if (phase === 'retrying') return 'Downloading ' + count(missing, 'missing file', 'missing files') + '…';
  if (phase === 'incomplete' || phase === 'still' || phase === 'dismissed') return 'Not ready. ' + count(missing, 'file is', 'files are') + ' missing.';
  return 'Not ready yet.';
}

/** The Settings line, with Retry while files are missing. */
export function OfflineLibraryStatus() {
  useStoreVersion(OfflineLibrary);
  React.useEffect(() => { OfflineLibrary.start(); }, []);
  const { phase, missing } = OfflineLibrary.getState();
  const retry = phase === 'incomplete' || phase === 'still' || phase === 'dismissed';
  return (
    <span className="offline-library-status">
      {phase === 'complete' || phase === 'fixed' ? 'Every book opens without a connection.' : offlineLibraryWords(phase, missing)}
      {retry ? <>{' '}<button type="button" className="settings-clear-btn" onClick={() => { OfflineLibrary.retry(); }}>Retry</button></> : null}
    </span>
  );
}

/** FSET (st-data2): "Ready" as a pill at the Settings row's right, once every book is kept. */
export function OfflineLibraryReady() {
  useStoreVersion(OfflineLibrary);
  const { phase } = OfflineLibrary.getState();
  return phase === 'complete' || phase === 'fixed' ? <span className="ws3-pill is-ready">Ready</span> : null;
}

export function OfflineLibraryBanner() {
  useStoreVersion(OfflineLibrary);
  React.useEffect(() => { OfflineLibrary.start(); }, []);
  const { phase, missing } = OfflineLibrary.getState();

  /** @type {{ lead: string, detail: string, retry: boolean, close: boolean } | null} */
  let view = null;
  if (phase === 'incomplete') {
    view = { lead: 'Offline library incomplete.', detail: count(missing, 'file did not download.', 'files did not download.'), retry: true, close: true };
  } else if (phase === 'retrying') {
    view = { lead: 'Downloading ' + count(missing, 'missing file', 'missing files') + '…', detail: '', retry: false, close: true };
  } else if (phase === 'fixed') {
    view = { lead: 'Offline library complete.', detail: '', retry: false, close: false };
  } else if (phase === 'still') {
    view = {
      lead: 'Offline library incomplete.',
      detail: count(missing, 'file is still missing.', 'files are still missing.') + ' Connect to the internet, then retry.',
      retry: true,
      close: true,
    };
  }
  const ref = useTopStrip(!!view);
  if (!view) return null;

  return (
    // WS6 (mock sy-notices): the one notice style, Retry at its right, the x only while it can go.
    <div className="sh-banner sh-banner-gold offline-library-banner" ref={ref}>
      <Notice icon="dl" inline title={view.lead.replace(/\.$/, '')} text={view.detail}
        actions={view.retry ? [{ label: 'Retry', onClick: () => { OfflineLibrary.retry(); } }] : []}
        onDismiss={view.close ? () => OfflineLibrary.dismiss() : undefined} />
    </div>
  );
}
