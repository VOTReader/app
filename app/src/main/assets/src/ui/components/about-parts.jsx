/* ═══════════════════════════════════════════════════════════════════════
   about-parts — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   WS3 settings (ab-about, ab-new): what About, Settings and the What's new
   sheet share. useBuildInfo asks the running build and the published one
   (moved here from SettingsScreen, unchanged); versionWords is About's
   short form of it; LinkRow is a list row that is a real link. */

import { UiIcon } from './UiIcon.jsx';

/** The running build and the published one, asked once per mount. @returns {[any, () => Promise<void>]} */
export function useBuildInfo() {
  const [buildInfo, setBuildInfo] = React.useState(/** @type {any} */ ({ state: 'loading', running: null, server: null }));
  const refresh = React.useCallback(async () => {
    setBuildInfo((/** @type {any} */ b) => ({ ...b, state: 'loading' }));
    // typeof guards: these three live in bundle-b and reach bundle-d as ambient globals, so they are absent in any
    // host that renders without the stores bundle (the vitest harness does exactly that).
    const running = (typeof getBuildVersion === 'function') ? await getBuildVersion() : null;
    if (!running) {
      // No service worker to ask: the Android WebView (assets ship inside the APK) or a first visit before the SW
      // has taken control. ANDROID: the APK ships its own assets/service-worker.js, and under WebViewAssetLoader the
      // relative './service-worker.js' that fetchServerBuildVersion fetches resolves to the INSTALLED build's own
      // copy, so it lands in `running`, not `server`. WEB: deliberately not given that fallback: off Android an
      // uncontrolled page is a first visit, and the deployed file describes the server, not this page.
      const installed = (PlatformBridge.isAndroid && typeof fetchServerBuildVersion === 'function')
        ? await fetchServerBuildVersion()
        : null;
      setBuildInfo(installed
        ? { state: 'installed', running: installed, server: null }
        : { state: 'no-sw', running: null, server: null });
      return;
    }
    const server = (typeof fetchServerBuildVersion === 'function') ? await fetchServerBuildVersion() : null;
    setBuildInfo({ state: 'ok', running, server });
  }, []);
  React.useEffect(() => { void refresh(); }, [refresh]);
  return [buildInfo, refresh];
}

/** About's words for a build: "Version 1.0.2", one line of verdict, "Build fceb645278 · corpus c77". @param {any} b */
export function versionWords(b) {
  const isAndroid = typeof PlatformBridge !== 'undefined' && !!PlatformBridge && !!PlatformBridge.isAndroid;
  if (!b || b.state === 'loading') return { title: 'Version', line: 'Checking…', build: '' };
  if (b.state === 'no-sw' || !b.running) {
    return { title: 'Version', build: '',
      line: isAndroid ? 'Installed app build. New versions arrive by installing an update.' : 'Not yet kept offline on this device.' };
  }
  const m = /^v([\d.]+)-([0-9a-f]+)$/.exec(String(b.running.cacheVersion || ''));
  const title = 'Version ' + (m ? m[1] : String(b.running.cacheVersion || 'unknown'));
  const build = [m ? 'Build ' + m[2] : '', b.running.corpusVersion ? 'corpus ' + b.running.corpusVersion : ''].filter(Boolean).join(' · ');
  let line;
  if (b.state === 'installed') line = 'Installed on this phone. New versions arrive by installing an update.';
  else if (!b.server) line = 'Could not reach the server to compare';
  else if (b.server.cacheVersion === b.running.cacheVersion) line = 'Up to date with the published version';
  else line = 'An update is available. Reopen the app to apply it.';
  return { title, line, build };
}

/** A list row that is a link out (opens in the browser). @param {{ href: string, icon: string, title: string, meta?: string }} props */
export function LinkRow({ href, icon, title, meta }) {
  return (
    <div className="ui-row ws3-link-row">
      <a className="ui-row-main" href={href} target="_blank" rel="noopener noreferrer">
        <span className="ui-row-lead" aria-hidden="true"><UiIcon name={icon} /></span>
        <span className="ui-row-text">
          <span className="ui-row-title">{title}</span>
          {meta ? <span className="ui-row-meta">{meta}</span> : null}
        </span>
      </a>
    </div>
  );
}

/** The tour's length in words, as the Settings root says it. */
export function tourMeta() {
  const t = typeof TourController !== 'undefined' ? TourController : null;
  return t && typeof t.stopsWord === 'function' && typeof t.minutesWord === 'function'
    ? `A short tour: ${t.stopsWord()} stops, about ${t.minutesWord()} minutes` : 'A short tour of the app';
}
