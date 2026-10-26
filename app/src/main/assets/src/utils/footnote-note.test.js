// @ts-nocheck -- reads the corpus through node's fs + vm
/* footnote-note (share-fn, Corbin 2026-10-25): a note footnote's markers, the
 * lines they point at, its Bible references and its source letter become
 * pieces the sheet can make followable; the words stay exactly as published. */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { runInNewContext } from 'vm';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { parseFootnoteNote, joinFootnoteNote, hasFollowable, inAppTitleForUrl, findTitleIn, titleKey } from './footnote-note.js';
import { COLLECTIONS } from '../data/scripture-resolution.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, '..', 'data');

const DD = '“Yet understand this: In times past I overlooked the ignorance of the people. Yet now I command all people everywhere to repent in sincerity and in truth.[A] In like manner, I have overlooked the ignorance of those who call The Messiah by another name. Yet now I command all who have ears to hear, to call upon His name as it is, was, and has always been, and not as they presume it to be.[B] Indeed I am calling all tribes, tongues, peoples and nations to embrace Him as He truly is, and not as the churches of men would have Him be, says The Lord.” (From “Death and Deliverance”)\n\nA. Acts 17:30 — “Truly, these times of ignorance God overlooked, but now commands all men everywhere to repent,”\nB. Zephaniah 3:9 — “For then I will restore to the peoples a pure language, That they all may call on the name of the LORD, To serve Him with one accord.”';

const kinds = (pieces) => pieces.filter((p) => p.t !== 'text');

describe('parseFootnoteNote', () => {
  it('reads "Proclaim The Name of The Lord" footnote 2: two markers, two note lines, two refs, the source letter', () => {
    const n = parseFootnoteNote(DD);
    expect(kinds(n.body)).toEqual([
      { t: 'mark', v: '[A]', id: 'A' },
      { t: 'mark', v: '[B]', id: 'B' },
      { t: 'letter', v: '“Death and Deliverance”', title: 'Death and Deliverance', excerpt: expect.stringMatching(/^Yet understand this: In times past .* in truth\. In like manner, .*says The Lord\.$/) },
    ]);
    expect(n.notes.map((l) => kinds(l.pieces))).toEqual([
      [{ t: 'label', v: 'A.', id: 'A' }, { t: 'ref', v: 'Acts 17:30', ref: 'Acts 17:30' }],
      [{ t: 'label', v: 'B.', id: 'B' }, { t: 'ref', v: 'Zephaniah 3:9', ref: 'Zephaniah 3:9' }],
    ]);
    expect(joinFootnoteNote(n)).toBe(DD);
  });

  it('reads references in running text: a range, a whole chapter, two in one note; not "Volume Three"', () => {
    const refs = (t) => kinds(parseFootnoteNote(t).body).filter((p) => p.t === 'ref').map((p) => p.ref);
    expect(refs('Zechariah 6:9-13 — In Zechariah 6:11, the original Hebrew word')).toEqual(['Zechariah 6:9-13', 'Zechariah 6:11']);
    expect(refs('Matthew 3')).toEqual(['Matthew 3']);
    expect(refs('Also See: John 9:6-7')).toEqual(['John 9:6-7']);
    expect(refs('(An excerpt from "Death and Deliverance" - Volume Three)')).toEqual([]);
    expect(refs('Jude 1:3 and Obadiah 30')).toEqual(['Jude 1:3']);   // Obadiah has one chapter
    expect(refs('1 John 4:1 and 2 Peter 2:17')).toEqual(['1 John 4:1', '2 Peter 2:17']);
  });

  it('leaves a marker with no line to point at as text, and a plain note as one piece', () => {
    expect(kinds(parseFootnoteNote('a note[A] with no notes').body)).toEqual([]);
    const plain = parseFootnoteNote('“Women” in this context refers to the churches of men');
    expect(plain.body).toEqual([{ t: 'text', v: '“Women” in this context refers to the churches of men' }]);
    expect(hasFollowable(plain)).toBe(false);
  });
});

describe('inAppTitleForUrl / findTitleIn', () => {
  it('names the page of a thevolumesoftruth.com or answersonlygodcangive.com link, nothing else', () => {
    expect(inAppTitleForUrl('https://answersonlygodcangive.com/Regarding_True_Repentance')).toEqual({ title: 'Regarding True Repentance', answers: true });
    expect(inAppTitleForUrl('https://www.thevolumesoftruth.com/I_Am_Calling_You_Out!_(Part_2)..._Come_Out')).toEqual({ title: 'I Am Calling You Out! (Part 2)... Come Out', answers: false });
    expect(inAppTitleForUrl('https://www.thevolumesoftruth.com/Main_Page#The_Volumes_of_Truth_Online_Edition')).toBeNull();
    expect(inAppTitleForUrl('https://www.biblegateway.com/passage/?search=Matthew+3')).toBeNull();
    expect(inAppTitleForUrl('not a url')).toBeNull();
  });
  it('finds a title whatever its quotes and case, preferring the site the link named', () => {
    const keys = ['Volume Seven::The One Who Stays, Lets', 'Answers Only God Can Give::The One Who Stays, Lets', 'null::x'];
    expect(findTitleIn(keys, 'The One Who Stays, Lets', true)).toEqual({ collection: 'Answers Only God Can Give', letterTitle: 'The One Who Stays, Lets' });
    expect(findTitleIn(keys, 'the one who stays lets', false)).toEqual({ collection: 'Volume Seven', letterTitle: 'The One Who Stays, Lets' });
    expect(findTitleIn(keys, 'Nothing')).toBeNull();
    expect(titleKey('Regarding “Another Messiah”')).toBe(titleKey('Regarding "Another Messiah"'));
  });
});

/* ── The corpus (census 2026-10-25) ───────────────────────────────────── */
function globalsOf(file) {
  const ctx = {};
  runInNewContext(readFileSync(resolve(DATA, file), 'utf8'), ctx);
  return ctx;
}
const FILES = readdirSync(DATA).filter((f) => /^(volume-[a-z]+|letters-[a-z]+|lords-rebuke|holy-days|bible-studies|wtlb-[a-z]+|the-blessed|hidden-manna)\.js$/.test(f));
function noteFootnotes() {
  const out = [];
  const walk = (v) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    for (const [k, val] of Object.entries(v)) {
      if (k === 'footnotes' && val && typeof val === 'object') Object.values(val).forEach((fn) => { if (fn && fn.type === 'note') out.push(fn); });
      else walk(val);
    }
  };
  FILES.forEach((f) => walk(globalsOf(f)));
  return out;
}
/** The registry index.html builds (VOT_LETTER_REGISTRY), from the corpus files. */
function registryKeys() {
  const keys = [];
  const add = (label, v) => (Array.isArray(v) ? v : [v]).forEach((e) => { if (e && e.title && e.id) keys.push(label + '::' + e.title); });
  for (const col of COLLECTIONS) {
    const file = FILES.concat(['answers.js']).find((f) => { try { return col.globalName in globalsOf(f); } catch (_e) { return false; } });
    if (!file) continue;
    const g = globalsOf(file);
    add(col.registryLabel, g[col.globalName]);
    if (col.prefaceGlobal && g[col.prefaceGlobal]) add(col.registryLabel, g[col.prefaceGlobal]);
  }
  for (const s of globalsOf('bible-studies.js').BIBLE_STUDIES) if (s.title && s.slug) keys.push(s.title + '::' + s.title);
  return keys;
}

describe('footnote-note over every note footnote in the corpus', () => {
  const notes = noteFootnotes();

  it('keeps every note word for word', () => {
    expect(notes.length).toBeGreaterThan(120);
    expect(notes.filter((fn) => joinFootnoteNote(parseFootnoteNote(fn.text)) !== fn.text).map((fn) => fn.text.slice(0, 60))).toEqual([]);
  });

  it('finds the census: nested markers in 2 notes, a source letter in 3, references in 8', () => {
    const parsed = notes.map((fn) => parseFootnoteNote(fn.text));
    expect(parsed.filter((n) => n.notes.length).length).toBe(2);
    expect(parsed.filter((n) => n.body.some((p) => p.t === 'letter')).length).toBe(3);
    expect(parsed.filter((n) => n.body.concat(...n.notes.map((l) => l.pieces)).some((p) => p.t === 'ref')).length).toBe(8);
  });

  it('every source letter and every Answers or letter page a note links to is in the app', () => {
    const keys = registryKeys();
    const missing = [];
    for (const fn of notes) {
      for (const p of parseFootnoteNote(fn.text).body) if (p.t === 'letter' && !findTitleIn(keys, p.title)) missing.push(p.title);
      const page = fn.link ? null : inAppTitleForUrl(fn.url);   // a note with its own in-app link keeps it
      if (!page) continue;
      const hit = findTitleIn(keys, page.title, page.answers);
      if (!hit || (page.answers && hit.collection !== 'Answers Only God Can Give')) missing.push(fn.url);
    }
    expect(missing).toEqual([]);
  });
});
