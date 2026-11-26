// @ts-nocheck
/* platform-3 (audit 2026-11-23): bundle-d holds regex lookbehinds, so Safari/iOS before 16.4 cannot parse it. App
   was never defined, the mount script threw, and the splash stayed for good under "The first open can take a minute on
   a slow connection.". The mount script now says what happened: a browser too old for the app, or (lookbehind fine) a
   page whose scripts did not all load. */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HTML = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app/src/main/assets/index.html'), 'utf8');
const MOUNT = HTML.split('<script>').slice(1).map((s) => s.split('</script>')[0]).find((s) => s.includes('ReactDOM.createRoot'));
const SPLASH = '<div class="hydration-loading" role="status" aria-live="polite"><div class="hydration-loading-text">VOTReader</div></div>';

/** Run the page's own mount script: App defined or not, a RegExp that knows lookbehind or not. */
function mount({ app, lookbehind = true }) {
  const rendered = [];
  const ReactDOM = { createRoot: () => ({ render: (el) => rendered.push(el) }) };
  const React = { createElement: (t) => t };
  const RE = lookbehind ? RegExp : function (src) { if (/\(\?<[=!]/.test(src)) throw new SyntaxError('Invalid regular expression: invalid group specifier name'); return new RegExp(src); };
  const scope = { ReactDOM, React, ErrorBoundary: 'EB', HydrationGate: 'HG', RegExp: RE, document };
  if (app) scope.App = app;
  const names = Object.keys(scope);
  new Function(...names, MOUNT)(...names.map((n) => scope[n]));
  return rendered;
}

beforeEach(() => { document.body.innerHTML = '<div id="root">' + SPLASH + '</div>'; });

describe('a browser that cannot run the app is told so (platform-3)', () => {
  it('App defined: the app mounts, the splash is left to React', () => {
    expect(mount({ app: 'App' })).toHaveLength(1);
    expect(document.querySelector('.boot-failed')).toBeNull();
  });
  it('no App and no lookbehind (Safari before 16.4): a "too old" message, not the endless splash', () => {
    expect(mount({ lookbehind: false })).toHaveLength(0);
    const box = document.querySelector('#root .boot-failed');
    expect(box).not.toBeNull();
    expect(box.getAttribute('role')).toBe('alert');
    expect(box.textContent).toMatch(/too old/);
    expect(box.textContent).toMatch(/16\.4/);
    expect(document.querySelector('.hydration-loading:not(.boot-failed)')).toBeNull();
  });
  it('no App in a browser that could run it: the scripts did not all load, and a reload is offered', () => {
    mount({});
    const box = document.querySelector('#root .boot-failed');
    expect(box.textContent).not.toMatch(/too old/);
    expect(box.textContent).toMatch(/did not finish loading/);
    expect(box.querySelector('button')).not.toBeNull();
  });
});
