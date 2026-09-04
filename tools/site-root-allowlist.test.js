/**
 * security-privacy-4 / service-worker-8: the Pages deploy stages by exclusion,
 * so for months it published app.css, react.min.js, react-dom.min.js,
 * search-data.js and service-worker.test.js — 632,722 bytes measured on this
 * tree — because nothing said they should not ship.
 *
 * The staged root is now asserted POSITIVELY against the service worker's own
 * CORE_ASSETS. This pins the derivation: a root file the app caches is allowed,
 * a nested path is not a root file, and a bundle-inlined duplicate is not
 * allowed just because it sits next to the ones that are.
 */
import { describe, it, expect } from 'vitest';
import { allowedSiteRootFiles } from './list-runtime-src-assets.js';

describe('the published site root', () => {
  const allowed = allowedSiteRootFiles();

  it('is derived, not empty', () => {
    expect(allowed).toBeTruthy();
    expect(allowed.size).toBeGreaterThan(10);
  });

  it('allows what the app actually loads from the root', () => {
    for (const name of ['index.html', 'manifest.json', 'offline.html', 'html2canvas.min.js', 'splash.jpg']) {
      expect(allowed.has(name), `${name} should be publishable`).toBe(true);
    }
    // The worker cannot appear in its own CORE_ASSETS, so it is added by hand.
    expect(allowed.has('service-worker.js')).toBe(true);
  });

  it('refuses the bundle-inlined duplicates and the test file', () => {
    for (const name of ['app.css', 'react.min.js', 'react-dom.min.js', 'search-data.js', 'service-worker.test.js']) {
      expect(allowed.has(name), `${name} must not be publishable`).toBe(false);
    }
  });

  it('holds root basenames only — dist/, fonts/ and icons/ ship as directories', () => {
    for (const name of allowed) expect(name).not.toContain('/');
    expect(allowed.has('dist/app.min.css')).toBe(false);
  });

  it('leaves room for the Pages control files', () => {
    // A custom domain adds CNAME; a bare-path site can need .nojekyll. Neither
    // is an app asset, and neither should stop a deploy.
    expect(allowed.has('CNAME')).toBe(true);
    expect(allowed.has('.nojekyll')).toBe(true);
  });
});
