#!/usr/bin/env node
// tools/regen-kjv.js
// Downloads all 66 books from the getbible.net API (source: Crosswire Bible Society /
// eBible.org, standardized 1769 Blayney revision, v3.1 updated 2023-07-19, GPL).
// API endpoint: https://api.getbible.net/v2/kjv/{book_number}.json  (66 calls total)
// Writes app/src/main/assets/src/data/bible-kjv.js in the exact format the app expects:
//   var BIBLE_KJV = { "genesis": { "1": [{ n: 1, text: "..." }, ...], "2": [...] }, ... }

import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// [getbible book number (1-based, canonical Bible order), app book ID]
// Source: https://api.getbible.net/v2/kjv/{num}.json
const BOOKS = [
  [1,  'genesis'],
  [2,  'exodus'],
  [3,  'leviticus'],
  [4,  'numbers'],
  [5,  'deuteronomy'],
  [6,  'joshua'],
  [7,  'judges'],
  [8,  'ruth'],
  [9,  '1samuel'],
  [10, '2samuel'],
  [11, '1kings'],
  [12, '2kings'],
  [13, '1chronicles'],
  [14, '2chronicles'],
  [15, 'ezra'],
  [16, 'nehemiah'],
  [17, 'esther'],
  [18, 'job'],
  [19, 'psalms'],
  [20, 'proverbs'],
  [21, 'ecclesiastes'],
  [22, 'songofsolomon'],
  [23, 'isaiah'],
  [24, 'jeremiah'],
  [25, 'lamentations'],
  [26, 'ezekiel'],
  [27, 'daniel'],
  [28, 'hosea'],
  [29, 'joel'],
  [30, 'amos'],
  [31, 'obadiah'],
  [32, 'jonah'],
  [33, 'micah'],
  [34, 'nahum'],
  [35, 'habakkuk'],
  [36, 'zephaniah'],
  [37, 'haggai'],
  [38, 'zechariah'],
  [39, 'malachi'],
  [40, 'matthew-plain'],  // 'matthew' key = Study Bible; 'matthew-plain' = KJV chapter nav
  [41, 'mark'],
  [42, 'luke'],
  [43, 'john'],
  [44, 'acts'],
  [45, 'romans'],
  [46, '1corinthians'],
  [47, '2corinthians'],
  [48, 'galatians'],
  [49, 'ephesians'],
  [50, 'philippians'],
  [51, 'colossians'],
  [52, '1thessalonians'],
  [53, '2thessalonians'],
  [54, '1timothy'],
  [55, '2timothy'],
  [56, 'titus'],
  [57, 'philemon'],
  [58, 'hebrews'],
  [59, 'james'],
  [60, '1peter'],
  [61, '2peter'],
  [62, '1john'],
  [63, '2john'],
  [64, '3john'],
  [65, 'jude'],
  [66, 'revelation'],
];

const BASE_URL = 'https://api.getbible.net/v2/kjv/';
const OUT_PATH  = path.join(__dirname, '../app/src/main/assets/src/data/bible-kjv.js');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return resolve(get(res.headers.location));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', chunk => buf += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); }
        catch (e) { reject(new Error(`JSON parse failed for ${url}: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const result = {};
  let totalVerses = 0;

  for (const [bookNum, bookId] of BOOKS) {
    const url = `${BASE_URL}${bookNum}.json`;
    process.stdout.write(`  ${String(bookNum).padStart(2)}. ${bookId.padEnd(20)} `);
    const data = await get(url);
    result[bookId] = {};
    let bookVerses = 0;
    for (const ch of data.chapters) {
      const chNum = String(ch.chapter);
      result[bookId][chNum] = ch.verses.map(v => ({
        n: v.verse,
        text: v.text,
      }));
      bookVerses += ch.verses.length;
    }
    totalVerses += bookVerses;
    console.log(`${data.chapters.length} ch / ${bookVerses} v`);
  }

  const output = `var BIBLE_KJV = ${JSON.stringify(result)};\n`;
  fs.writeFileSync(OUT_PATH, output, 'utf8');

  const kb = Math.round(fs.statSync(OUT_PATH).size / 1024);
  console.log(`\nDone. ${BOOKS.length} books, ${totalVerses} verses, ${kb} KB → ${OUT_PATH}`);
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
