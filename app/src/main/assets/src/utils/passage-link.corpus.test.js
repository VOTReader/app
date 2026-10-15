// @ts-nocheck -- reads the corpus and the Android shell's SharedLink.kt through node's fs + vm
/* passage-link against the real corpus (sweep v008, 2026-10-15).
 *
 * PUBLIC_KEY once capped an entry id at 120 characters, and four letter ids
 * are longer: three in Volume Seven (the longest is 149) and the Holy Days
 * letter "I Shall Remove My Hand and My Spirit Shall Be Withdrawn..." (139).
 * Share sent those passages as a bare quote with no link, and an incoming ?p=
 * for one was refused, both by the page and by the installed app's App Link
 * reader (SharedLink.kt keeps its own copy of the rule). Every id a reader
 * keys a block with has to travel, both ways. */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { runInNewContext } from 'vm';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { letterHlKey, wtlbHlKey, entryHlBase } from './hl-keys.js';
import { publicPassageKey, passageLinkFor, sharedPassageKey } from './passage-link.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, '..', 'data');
const SHARED_LINK_KT = resolve(HERE, '..', '..', '..', 'java', 'com', 'votreader', 'sacredui', 'SharedLink.kt');

function globalsOf(file) {
  const ctx = {};
  runInNewContext(readFileSync(resolve(DATA, file), 'utf8'), ctx);
  return ctx;
}

/** Every `id` of a corpus global: an array of entries, or one entry (a preface). */
function idsOf(value) {
  const items = Array.isArray(value) ? value : [value];
  return items.filter((it) => it && typeof it.id === 'string').map((it) => it.id);
}

// LetterView keys a block letter:<id>:<n>; WtlbEntryView keys it wtlb:<id>:<n>.
const VOLUME_FILES = readdirSync(DATA).filter((f) => /^volume-[a-z]+\.js$/.test(f));
const LETTER_FILES = [...VOLUME_FILES, 'letters-flock.js', 'letters-timothy.js', 'lords-rebuke.js', 'hidden-manna.js'];
const WTLB_FILES = ['wtlb-one.js', 'wtlb-two.js', 'the-blessed.js', 'answers.js'];

function corpusKeys() {
  const keys = [];
  for (const f of LETTER_FILES) {
    for (const v of Object.values(globalsOf(f))) for (const id of idsOf(v)) keys.push(letterHlKey(id, 0));
  }
  for (const f of WTLB_FILES) {
    for (const v of Object.values(globalsOf(f))) for (const id of idsOf(v)) keys.push(wtlbHlKey(id, 0));
  }
  // A Holy Days entry is keyed the way its reader paints it (hl-keys.js).
  for (const e of globalsOf('holy-days.js').HOLY_DAYS) keys.push(entryHlBase('holy-days', e.id) + ':0');
  // The letter-format Bible Studies key their chapters through LetterView too.
  for (const s of globalsOf('bible-studies.js').BIBLE_STUDIES) {
    for (const c of s.chapters || []) keys.push(letterHlKey(c.id, 0));
  }
  return keys;
}

/** SharedLink.kt's PUBLIC_KEY (the installed app's reader of an incoming link), as a JS RegExp. */
function sharedLinkKtRule() {
  const kt = readFileSync(SHARED_LINK_KT, 'utf8');
  const m = kt.match(/val PUBLIC_KEY = Regex\(([\s\S]*?)\)\s*\n/);
  if (!m) throw new Error('SharedLink.kt: PUBLIC_KEY not found');
  const literals = [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1].replace(/\\\\/g, '\\'));
  return new RegExp(literals.join(''));
}

describe('passage-link: every corpus passage may travel', () => {
  const keys = corpusKeys();
  const HOLY_DAYS_LONG = 'letter:i-shall-remove-my-hand-and-my-spirit-shall-be-withdrawn-and-that-purposed-from-the-beginning-shall-be-done-it-shall-be-accomplished-swiftly:0';

  it('reads the whole corpus, the long ids included', () => {
    expect(VOLUME_FILES.length).toBe(7);
    expect(keys.length).toBeGreaterThan(800);
    expect(keys).toContain(HOLY_DAYS_LONG);
    expect(Math.max(...keys.map((k) => k.length))).toBeGreaterThan(120);
  });

  it('gives every block key of every collection a link (Share)', () => {
    expect(keys.filter((k) => publicPassageKey(k) !== k)).toEqual([]);
  });

  it('opens every such link again in the page (an incoming ?p=)', () => {
    const lost = keys.filter((k) => {
      const link = passageLinkFor(k);
      return !link || sharedPassageKey(new URL(link).search) !== k;
    });
    expect(lost).toEqual([]);
  });

  it('opens every such link in the installed app too (SharedLink.kt keeps the same rule)', () => {
    const kt = sharedLinkKtRule();
    expect(keys.filter((k) => !kt.test(k))).toEqual([]);
    // The two copies agree at the cap and past it.
    for (const k of ['letter:' + 'a'.repeat(200) + ':1', 'letter:' + 'a'.repeat(201) + ':1', 'journal:abc:0']) {
      expect(kt.test(k), k).toBe(publicPassageKey(k) === k);
    }
  });
});
