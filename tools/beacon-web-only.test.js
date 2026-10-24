// @ts-nocheck
/* bc1 (Corbin via hub 2026-10-05): Cloudflare Web Analytics counts visits to the WEBSITE only. The phone
   app loads the same index.html from https://appassets.androidplatform.net, so the beacon is injected by a
   host check instead of a static <script src>: the app, the review preview and a local server send nothing.
   cf-noagent (hub 2026-10-24: ~85 % of 30 days' counts were our own): nor an automated browser
   (navigator.webdriver) or a browser marked vot-no-stats, which ?nostats=1 sets (the S22 keeper's Chrome). */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HTML = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app/src/main/assets/index.html'), 'utf8');
const LOADER = HTML.split('<script>').slice(1).map((s) => s.split('</script>')[0]).find((s) => s.includes('cloudflareinsights'));

/** A localStorage stand-in (null = storage that throws, as a blocked one does). */
const store = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, m };
};
const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
/** Run the page's own loader as if the page were served from `host` (a real browser by default). */
const runOn = (host, { search = '', webdriver = false, ls = store() } = {}) =>
  new Function('location', 'navigator', 'localStorage', LOADER)({ hostname: host, search }, { webdriver }, ls);
const beacons = () => [...document.querySelectorAll('script[src*="cloudflareinsights"]')];

beforeEach(() => { for (const s of beacons()) s.remove(); });

describe('the Cloudflare beacon loads on the website only (bc1)', () => {
  it('no static beacon tag: every load goes through the host check', () => {
    expect(HTML).not.toMatch(/<script[^>]+src="https:\/\/static\.cloudflareinsights\.com/);
    expect(LOADER).toBeTruthy();
  });

  it('the website gets one beacon, with its token and spa off', () => {
    runOn('votreader.github.io');
    expect(beacons()).toHaveLength(1);
    expect(JSON.parse(beacons()[0].getAttribute('data-cf-beacon'))).toEqual({ token: '4daaa3064b7d4d93851405bf00114c92', spa: false });
  });

  it('the phone app, the preview and a local server get none', () => {
    for (const host of ['appassets.androidplatform.net', 'votreader-preview.pages.dev', 'localhost', '127.0.0.1']) runOn(host);
    expect(beacons()).toHaveLength(0);
  });
});

describe('our own opens load no beacon (cf-noagent)', () => {
  it('an automated browser (headless walks, check:live) gets none', () => {
    runOn('votreader.github.io', { webdriver: true });
    expect(beacons()).toHaveLength(0);
  });

  it('a browser marked vot-no-stats gets none', () => {
    runOn('votreader.github.io', { ls: store({ 'vot-no-stats': '1' }) });
    expect(beacons()).toHaveLength(0);
  });

  it('?nostats=1 marks the browser and skips this open and every later one', () => {
    const ls = store();
    runOn('votreader.github.io', { search: '?nostats=1', ls });
    expect(ls.m.get('vot-no-stats')).toBe('1');
    runOn('votreader.github.io', { ls });
    expect(beacons()).toHaveLength(0);
  });

  it('a look-alike query does not mark it; blocked storage still counts the visit', () => {
    const ls = store();
    runOn('votreader.github.io', { search: '?nostats=10', ls });
    expect(ls.m.has('vot-no-stats')).toBe(false);
    runOn('votreader.github.io', { ls: blocked });
    expect(beacons()).toHaveLength(2);
  });
});
