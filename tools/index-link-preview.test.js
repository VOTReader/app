/* n6-04 (sweep 2, 09-25): a shared passage link (?p=) previewed as a bare
   "VOTReader" in chats: index.html had no description or Open Graph tags.
   Crawlers do not run JS, so the card is the app's, the same for every link. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../app/src/main/assets/index.html'), 'utf8');
const meta = (attr, name) => {
  const m = html.match(new RegExp('<meta ' + attr + '="' + name + '" content="([^"]+)"'));
  return m ? m[1] : null;
};

describe('index.html link preview (n6-04)', () => {
  it('has a description and the Open Graph card a chat app reads', () => {
    expect(meta('name', 'description')).toMatch(/Volumes of Truth/);
    expect(meta('property', 'og:title')).toBe('VOTReader');
    expect(meta('property', 'og:description')).toMatch(/Volumes of Truth/);
    expect(meta('property', 'og:type')).toBe('website');
    expect(meta('property', 'og:url')).toBe('https://votreader.github.io/app/');
    expect(meta('name', 'twitter:card')).toBe('summary');
  });

  it('points og:image at an icon that ships, by an absolute address', () => {
    const img = meta('property', 'og:image');
    expect(img).toMatch(/^https:\/\/votreader\.github\.io\/app\/icons\/icon-\d+\.png$/);
    const file = resolve(dirname(fileURLToPath(import.meta.url)), '../app/src/main/assets', img.replace('https://votreader.github.io/app/', ''));
    expect(() => readFileSync(file)).not.toThrow();
  });
});
