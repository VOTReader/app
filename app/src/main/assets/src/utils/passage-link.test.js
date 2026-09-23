/* A passage as a link that opens there (A8, 2026-09-22). The link carries one
   PUBLIC corpus key and nothing else: never the reader's journal, notes,
   playback or backup. These pin the key rule, the address and the round trip. */
import { describe, it, expect } from 'vitest';
import { PUBLIC_APP_URL, publicPassageKey, passageLinkFor, sharedPassageKey, withPassageLink } from './passage-link.js';

describe('passage-link: which keys may travel', () => {
  it('accepts the canonical public keys (utils/hl-keys.js)', () => {
    for (const k of ['bible:john:3:16', 'bible:1-john:4:7', 'study:matthew-5:12', 'study:matthew-5:12-s0',
      'letter:the-wide-path:3', 'wtlb:charity:0', 'blessed:introduction:2', 'holy-days:passover:1']) {
      expect(publicPassageKey(k), k).toBe(k);
    }
  });

  it('drops a character range and keeps the block', () => {
    expect(publicPassageKey('bible:john:3:16:4-19')).toBe('bible:john:3:16');
    expect(publicPassageKey('letter:the-wide-path:3:10-42')).toBe('letter:the-wide-path:3');
  });

  it('refuses the reader’s own writing and anything malformed or hostile', () => {
    for (const k of ['journal:abc123:0', 'note:x', 'bible:john:x:1', 'bible:john:3', 'bible:JOHN:3:16', 'javascript:alert(1)',
      'letter:../../etc:1', 'letter:a b:1', 'bible:john:3:16\nhttps://evil', '', null, undefined, 42]) {
      expect(publicPassageKey(/** @type {any} */ (k)), String(k)).toBeNull();
    }
  });
});

describe('passage-link: the address', () => {
  it('points at the public site, whatever origin the app runs on', () => {
    expect(passageLinkFor('bible:john:3:16')).toBe(PUBLIC_APP_URL + '?p=bible%3Ajohn%3A3%3A16');
    expect(PUBLIC_APP_URL).toBe('https://votreader.github.io/app/');
  });

  it('is null for a key that may not travel', () => {
    expect(passageLinkFor('journal:abc:0')).toBeNull();
  });

  it('round-trips every public key through the address the app reads at boot', () => {
    for (const k of ['bible:john:3:16', 'study:matthew-5:12-s0', 'letter:the-wide-path:3', 'wtlb:charity:0']) {
      const link = /** @type {string} */ (passageLinkFor(k));
      expect(sharedPassageKey(new URL(link).search)).toBe(k);
    }
  });

  it('reads nothing from an address without a valid ?p=', () => {
    expect(sharedPassageKey('')).toBeNull();
    expect(sharedPassageKey('?x=1')).toBeNull();
    expect(sharedPassageKey('?p=journal%3Aabc%3A0')).toBeNull();
    expect(sharedPassageKey('?p=%E0%A4%A')).toBeNull();
  });
});

describe('passage-link: what Share sends', () => {
  it('adds the reference and the link under the quote', () => {
    expect(withPassageLink('For God so loved the world', 'bible:john:3:16', 'John 3:16'))
      .toBe('For God so loved the world\n\nJohn 3:16\nhttps://votreader.github.io/app/?p=bible%3Ajohn%3A3%3A16');
  });

  it('sends the quote alone when the passage may not travel', () => {
    expect(withPassageLink('my own words', 'journal:abc:0', 'Journal')).toBe('my own words');
    expect(withPassageLink('no key', null, null)).toBe('no key');
  });
});
