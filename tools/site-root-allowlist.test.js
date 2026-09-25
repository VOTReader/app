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
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowedSiteRootFiles } from './list-runtime-src-assets.js';

describe('the published site root', () => {
  const allowed = allowedSiteRootFiles();

  it('is derived, not empty', () => {
    expect(allowed).toBeTruthy();
    expect(allowed.size).toBeGreaterThan(10);
  });

  it('allows what the app actually loads from the root', () => {
    for (const name of ['index.html', 'manifest.json', 'offline.html', 'html2canvas.min.js', 'study-cover-lamb.jpg']) {
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

  // sj1 (REPORT v06-05): splash.jpg, 481 KB, sat in CORE_ASSETS long after the
  // last thing that showed it was gone, so every client precached it, every
  // deploy published it and every APK carried it. Being in CORE_ASSETS makes a
  // file publishable; it must not be the only thing that names it.
  it('publishes nothing that only the precache list names', () => {
    const assets = resolve(dirname(fileURLToPath(import.meta.url)), '../app/src/main/assets');
    const texts = [];
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(jsx?|mjs|css|html|json)$/.test(e.name) && !/\.test\./.test(e.name)) {
          let t = readFileSync(p, 'utf-8');
          // The worker's own list is what is under test; its fetch handler still counts.
          if (e.name === 'service-worker.js' && dir === assets) t = t.replace(/const CORE_ASSETS = \[[\s\S]*?\];/, '');
          texts.push(t);
        }
      }
    };
    walk(assets);
    const control = new Set(['service-worker.js', 'CNAME', '.nojekyll', 'index.html']);
    const unreferenced = [...allowed].filter((name) => !control.has(name) && !texts.some((t) => t.includes(name)));
    expect(unreferenced).toEqual([]);
  });
});
