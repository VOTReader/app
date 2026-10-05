// @ts-nocheck
/* bc1 (Corbin via hub 2026-10-05): Cloudflare Web Analytics counts visits to the WEBSITE only. The phone
   app loads the same index.html from https://appassets.androidplatform.net, so the beacon is injected by a
   host check instead of a static <script src>: the app, the review preview and a local server send nothing. */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HTML = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app/src/main/assets/index.html'), 'utf8');
const LOADER = HTML.split('<script>').slice(1).map((s) => s.split('</script>')[0]).find((s) => s.includes('cloudflareinsights'));

/** Run the page's own loader as if the page were served from `host`. */
const runOn = (host) => new Function('location', LOADER)({ hostname: host });
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
