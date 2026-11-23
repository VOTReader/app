/**
 * tools/gen-restored-nt.test.js — tests for tools/gen-restored-nt.mjs.
 *
 * The script runs at import, exports nothing, takes no arguments, and writes
 * bible-rnkjv.js + bible-rkjv.js into the real data dir, so it cannot be
 * imported into vitest. Each case mirrors the real script into a throwaway
 * repo tree with fixture books.js / matthew-plain.js / bible-kjv.js, then
 * runs the script as a child process, exactly as the build does. The
 * generator resolves its data dir from the script's own location, so the
 * mirror's layout is the whole trick: nothing is read from or written to
 * the real tree. Fully offline, deterministic. Precedent:
 * tools/build-kjv-twin.test.js (votreader-tests-3 item 1).
 *
 * Fixture verses are the real NKJV/KJV wording where the verse exercises a
 * rule as written; verses marked SYNTHETIC are invented because the corpus
 * has no real verse for that rule: the "Jesus Christ's" possessive, a bare
 * "Messias"/"Messiah" outside the John glosses (the only real "Messias"
 * verses are the exceptions themselves), and the leftover-token verse.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync,
  rmSync, existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, 'gen-restored-nt.mjs');

const BOOKS_OBJ = {
  john: { id: 'john', title: 'John', chapters: [
    { num: 1, sections: [{ verses: [
      { n: 25, text: 'And they asked him, and said to him, "Why then do you baptize if you are not the Christ, nor Elijah, nor the Prophet?"' },
      { n: 41, text: 'He first found his own brother Simon, and said to him, "We have found the Messiah, which is, being interpreted, the Christ."' },
    ] }] },
    { num: 4, sections: [{ verses: [
      { n: 25, text: 'The woman said to Him, "I know that Messiah is coming, who is called Christ."' },
    ] }] },
    { num: 7, sections: [{ verses: [
      { n: 26, text: 'Do the rulers know indeed that this is truly the Christ?' },
    ] }] },
  ] },
  acts: { id: 'acts', title: 'Acts', chapters: [
    { num: 2, sections: [{ verses: [
      { n: 36, text: 'Therefore let all the house of Israel know assuredly that God has made this Jesus, whom you crucified, both Lord and Christ.' },
    ] }] },
    { num: 7, sections: [{ verses: [
      { n: 45, text: 'which our fathers, having received it in turn, also brought with Joshua into the land possessed by the Gentiles, whom God drove out before the face of our fathers until the days of David,' },
    ] }] },
    { num: 11, sections: [{ verses: [
      { n: 26, text: 'And the disciples were first called Christians in Antioch.' },
    ] }] },
    { num: 13, sections: [{ verses: [
      { n: 6, text: 'Now when they had gone through the island to Paphos, they found a certain sorcerer, a false prophet, a Jew whose name was Bar-Jesus,' },
    ] }] },
  ] },
  colossians: { id: 'colossians', title: 'Colossians', chapters: [
    { num: 4, sections: [{ verses: [
      { n: 11, text: 'and Jesus who is called Justus. These are my only fellow workers for the kingdom of God who are of the circumcision; they have proved to be a comfort to me.' },
    ] }] },
  ] },
  romans: { id: 'romans', title: 'Romans', chapters: [
    { num: 6, sections: [{ verses: [
      { n: 8, text: 'Now if we died with Christ, we believe that we shall also live with Him.' },
    ] }] },
    { num: 8, sections: [{ verses: [
      { n: 39, text: 'nor height nor depth, nor any other created thing, shall be able to separate us from the love of God which is in Christ Jesus our Lord.' },
      // SYNTHETIC: no real NT verse carries the "Jesus Christ's" possessive.
      { n: 99, text: "We remember the grace of Jesus Christ's coming in glory." },
    ] }] },
  ] },
  '1john': { id: '1john', title: '1 John', chapters: [
    { num: 2, sections: [{ verses: [
      { n: 18, text: 'Little children, it is the last hour; and as you have heard that the Antichrist is coming, even now many antichrists have come, by which we know that it is the last hour.' },
      { n: 22, text: 'Who is a liar but he who denies that Jesus is the Christ? He is antichrist who denies the Father and the Son.' },
    ] }] },
  ] },
  '1corinthians': { id: '1corinthians', title: '1 Corinthians', chapters: [
    { num: 3, sections: [{ verses: [
      { n: 23, text: "And you are Christ's, and Christ is God's." },
    ] }] },
  ] },
  '2corinthians': { id: '2corinthians', title: '2 Corinthians', chapters: [
    { num: 4, sections: [{ verses: [
      { n: 5, text: "For we do not preach ourselves, but Christ Jesus the Lord, and ourselves your bondservants for Jesus' sake." },
    ] }] },
  ] },
  mark: { id: 'mark', title: 'Mark', chapters: [
    { num: 1, sections: [{ verses: [
      // SYNTHETIC: the corpus has no bare "Messiah" outside the John glosses.
      { n: 99, text: 'The Messiah has come to save His people.' },
    ] }] },
  ] },
};

const MATTHEW_PLAIN_OBJ = {
  chapters: [
    { num: 1, sections: [{ verses: [
      { n: 1, text: 'The book of the genealogy of Jesus Christ, the Son of David, the Son of Abraham:' },
      { n: 2, text: 'Abraham begot Isaac, Isaac begot Jacob, and Jacob begot Judah and his brothers.' },
      { n: 21, text: 'And she will bring forth a Son, and you shall call His name JESUS, for He will save His people from their sins.' },
    ] }] },
    { num: 16, sections: [{ verses: [
      { n: 16, text: 'Simon Peter answered and said, "You are the Christ, the Son of the living God."' },
      { n: 20, text: 'Then He commanded His disciples that they should tell no one that He was Jesus the Christ.' },
    ] }] },
    { num: 24, sections: [{ verses: [
      { n: 24, text: 'For false christs and false prophets will rise and show great signs and wonders to deceive, if possible, even the elect.' },
    ] }] },
    { num: 27, sections: [{ verses: [
      { n: 37, text: 'And they put up over His head the accusation written against Him: THIS IS JESUS THE KING OF THE JEWS.' },
    ] }] },
  ],
};

const BIBLE_KJV_OBJ = {
  john: {
    1: [
      { n: 1, text: 'In the beginning was the Word, and the Word was with God, and the Word was God.' },
      { n: 25, text: 'And they asked him, and said unto him, Why baptizest thou then, if thou be not that Christ, nor Elias, neither that prophet?' },
      { n: 41, text: 'He first findeth his own brother Simon, and saith unto him, We have found the Messias, which is, being interpreted, the Christ.' },
      // SYNTHETIC: the only real "Messias" verses are the John glosses.
      { n: 99, text: 'The Messias will tell us all things.' },
    ],
    3: [
      { n: 16, text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish.' },
    ],
    4: [
      { n: 25, text: 'The woman saith unto him, I know that Messias cometh, which is called Christ.' },
    ],
  },
  acts: {
    3: [
      { n: 20, text: 'And he shall send Jesus Christ, which before was preached unto you:' },
    ],
    7: [
      { n: 45, text: 'Which also our fathers that came after brought in with Jesus into the possession of the Gentiles, whom God drave out before the face of our fathers, unto the days of David;' },
    ],
  },
  hebrews: {
    4: [
      { n: 8, text: 'For if Jesus had given them rest, then would he not afterward have spoken of another day.' },
    ],
  },
  // The real bible-kjv.js keys Matthew as 'matthew-plain' — that is the id
  // the generator's NT list looks up, and the shipped bible-rkjv.js carries
  // a 'matthew-plain' key (no 'matthew' key).
  'matthew-plain': {
    24: [
      { n: 24, text: 'For there shall arise false Christs, and false prophets, and shall shew great signs and wonders; insomuch that, if it were possible, they shall deceive the very elect.' },
    ],
  },
};

const mirrors = [];
afterEach(() => { for (const m of mirrors.splice(0)) rmSync(m, { recursive: true, force: true }); });

/** A throwaway repo mirror with the real script + fixture data files. */
function mirror({ books = BOOKS_OBJ, matthewPlain = MATTHEW_PLAIN_OBJ, bibleKjv = BIBLE_KJV_OBJ } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'vot-restored-nt-'));
  mirrors.push(root);
  const toolsDir = join(root, 'tools');
  mkdirSync(toolsDir, { recursive: true });
  copyFileSync(SCRIPT, join(toolsDir, 'gen-restored-nt.mjs'));
  const dataDir = join(root, 'app', 'src', 'main', 'assets', 'src', 'data');
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, 'books.js'), `var BOOKS = ${JSON.stringify(books)};\n`);
  writeFileSync(join(dataDir, 'matthew-plain.js'), `var MATTHEW_PLAIN = ${JSON.stringify(matthewPlain)};\n`);
  writeFileSync(join(dataDir, 'bible-kjv.js'), `var BIBLE_KJV = ${JSON.stringify(bibleKjv)};\n`);
  return { root, dataDir };
}

function runScript(root) {
  const r = spawnSync(process.execPath, [join(root, 'tools', 'gen-restored-nt.mjs')], {
    encoding: 'utf8', cwd: root,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

/** Parse an emitted overlay file back into its var. */
function parseOverlay(file, varName) {
  const sb = {};
  runInNewContext(readFileSync(file, 'utf8'), sb, { filename: file });
  return sb[varName];
}

function countVerses(map) {
  let n = 0;
  for (const b of Object.values(map)) for (const ch of Object.values(b)) n += ch.length;
  return n;
}

function verse(map, book, ch, n) {
  const v = map[book] && map[book][String(ch)] && map[book][String(ch)].find((x) => x.n === n);
  return v ? v.text : undefined;
}

describe('gen-restored-nt', () => {
  it('writes both sparse overlays with the rules applied', () => {
    const { root, dataDir } = mirror();
    const r = runScript(root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('bible-rnkjv.js: 18 verses across 8 books');
    expect(r.stdout).toContain('bible-rkjv.js: 8 verses across 4 books');
    expect(r.stdout).toContain('Replacement stats:');
    expect(existsSync(join(dataDir, 'bible-rnkjv.js'))).toBe(true);
    expect(existsSync(join(dataDir, 'bible-rkjv.js'))).toBe(true);

    const rnkjv = parseOverlay(join(dataDir, 'bible-rnkjv.js'), 'BIBLE_RNKJV');
    expect(countVerses(rnkjv)).toBe(18);
    // Pairs, in the commanded order, and the caps naming verse.
    expect(verse(rnkjv, 'matthew-plain', 1, 1)).toBe('The book of the genealogy of YahuShua HaMashiach, the Son of David, the Son of Abraham:');
    expect(verse(rnkjv, 'matthew-plain', 1, 21)).toBe('And she will bring forth a Son, and you shall call His name YAHUSHUA, for He will save His people from their sins.');
    expect(verse(rnkjv, 'matthew-plain', 27, 37)).toBe('And they put up over His head the accusation written against Him: THIS IS YAHUSHUA THE KING OF THE JEWS.');
    expect(verse(rnkjv, 'romans', 8, 39)).toBe('nor height nor depth, nor any other created thing, shall be able to separate us from the love of God which is in YahuShua HaMashiach our Lord.');
    // The definite title absorbs "the"; the bare title does not.
    expect(verse(rnkjv, 'matthew-plain', 16, 16)).toBe('Simon Peter answered and said, "You are HaMashiach, the Son of the living God."');
    expect(verse(rnkjv, 'john', 1, 25)).toBe('And they asked him, and said to him, "Why then do you baptize if you are not HaMashiach, nor Elijah, nor the Prophet?"');
    expect(verse(rnkjv, 'romans', 6, 8)).toBe('Now if we died with Mashiach, we believe that we shall also live with Him.');
    // Rule order: "Jesus the Christ" reads as the pair, not a leftover.
    expect(verse(rnkjv, 'matthew-plain', 16, 20)).toBe('Then He commanded His disciples that they should tell no one that He was YahuShua HaMashiach.');
    // Possessives: "Jesus Christ's" before the bare pair, "Christ's", "Jesus'".
    expect(verse(rnkjv, 'romans', 8, 99)).toBe("We remember the grace of YahuShua HaMashiach's coming in glory.");
    expect(verse(rnkjv, '1corinthians', 3, 23)).toBe("And you are Mashiach's, and Mashiach is God's.");
    expect(verse(rnkjv, '2corinthians', 4, 5)).toBe("For we do not preach ourselves, but YahuShua HaMashiach the Lord, and ourselves your bondservants for YahuShua's sake.");
    // Acts 2:36: the Lord-and-Christ case falls out of the general rule.
    expect(verse(rnkjv, 'acts', 2, 36)).toBe('Therefore let all the house of Israel know assuredly that God has made this YahuShua, whom you crucified, both Lord and Mashiach.');
    // The John glosses, by their exceptions (meaning, not transliteration).
    expect(verse(rnkjv, 'john', 1, 41)).toBe('He first found his own brother Simon, and said to him, "We have found the Mashiach, which is, being interpreted, the Anointed."');
    expect(verse(rnkjv, 'john', 4, 25)).toBe('The woman said to Him, "I know that Mashiach is coming, who is called the Anointed."');
    // A bare Messiah, and a bare "false christs" plural.
    expect(verse(rnkjv, 'mark', 1, 99)).toBe('The Mashiach has come to save His people.');
    expect(verse(rnkjv, 'matthew-plain', 24, 24)).toBe('For false messiahs and false prophets will rise and show great signs and wonders to deceive, if possible, even the elect.');
    // The masked tokens and the skip leave the verse out of the overlay.
    expect(verse(rnkjv, 'acts', 11, 26)).toBeUndefined();
    expect(verse(rnkjv, 'acts', 13, 6)).toBeUndefined();
    expect(verse(rnkjv, '1john', 2, 18)).toBeUndefined();
    expect(rnkjv.colossians).toBeUndefined();
    expect(verse(rnkjv, 'acts', 7, 45)).toBeUndefined();
    expect(verse(rnkjv, 'matthew-plain', 1, 2)).toBeUndefined();

    const rkjv = parseOverlay(join(dataDir, 'bible-rkjv.js'), 'BIBLE_RKJV');
    expect(countVerses(rkjv)).toBe(8);
    expect(verse(rkjv, 'john', 1, 41)).toBe('He first findeth his own brother Simon, and saith unto him, We have found the Mashiach, which is, being interpreted, the Anointed.');
    expect(verse(rkjv, 'john', 4, 25)).toBe('The woman saith unto him, I know that Mashiach cometh, which is called the Anointed.');
    // "that Christ" is bare (no printed "the"), so it is Mashiach, not HaMashiach.
    expect(verse(rkjv, 'john', 1, 25)).toBe('And they asked him, and said unto him, Why baptizest thou then, if thou be not that Mashiach, nor Elias, neither that prophet?');
    expect(verse(rkjv, 'john', 1, 99)).toBe('The Mashiach will tell us all things.');
    expect(verse(rkjv, 'acts', 3, 20)).toBe('And he shall send YahuShua HaMashiach, which before was preached unto you:');
    // The KJV-only Joshua exceptions: the referent is Joshua, not the Lord.
    expect(verse(rkjv, 'acts', 7, 45)).toBe('Which also our fathers that came after brought in with Joshua into the possession of the Gentiles, whom God drave out before the face of our fathers, unto the days of David;');
    expect(verse(rkjv, 'hebrews', 4, 8)).toBe('For if Joshua had given them rest, then would he not afterward have spoken of another day.');
    expect(verse(rkjv, 'matthew-plain', 24, 24)).toBe('For there shall arise false Messiahs, and false prophets, and shall shew great signs and wonders; insomuch that, if it were possible, they shall deceive the very elect.');
    expect(verse(rkjv, 'john', 1, 1)).toBeUndefined();
    expect(verse(rkjv, 'john', 3, 16)).toBeUndefined();
  });

  it('is deterministic: a second run writes byte-identical overlays', () => {
    const { root, dataDir } = mirror();
    expect(runScript(root).status).toBe(0);
    const first = [readFileSync(join(dataDir, 'bible-rnkjv.js'), 'utf8'), readFileSync(join(dataDir, 'bible-rkjv.js'), 'utf8')];
    expect(runScript(root).status).toBe(0);
    expect(readFileSync(join(dataDir, 'bible-rnkjv.js'), 'utf8')).toBe(first[0]);
    expect(readFileSync(join(dataDir, 'bible-rkjv.js'), 'utf8')).toBe(first[1]);
  });

  it('fails loud when an exception verse lacks its find string', () => {
    const badKjv = JSON.parse(JSON.stringify(BIBLE_KJV_OBJ));
    badKjv.acts[7][0].text = 'Which also our fathers that came after brought in with Joshua into the possession of the Gentiles, whom God drave out before the face of our fathers, unto the days of David;';
    const { root, dataDir } = mirror({ bibleKjv: badKjv });
    const r = runScript(root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('exception [kjv acts 7:45]');
    expect(r.stderr).toContain('"with Jesus into" occurs 0x (want exactly 1)');
    expect(existsSync(join(dataDir, 'bible-rnkjv.js'))).toBe(false);
    expect(existsSync(join(dataDir, 'bible-rkjv.js'))).toBe(false);
  });

  it('fails loud when a leftover token survives the rules', () => {
    const badBooks = JSON.parse(JSON.stringify(BOOKS_OBJ));
    badBooks.luke = { id: 'luke', title: 'Luke', chapters: [
      { num: 1, sections: [{ verses: [
        // SYNTHETIC: a bare lowercase "christs" no rule restores.
        { n: 99, text: 'Beware of christs who deceive the flock.' },
      ] }] },
    ] };
    const { root } = mirror({ books: badBooks });
    const r = runScript(root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('leftover token [nkjv luke 1:99]');
  });
});
