/**
 * W9.1 Format A data schema validator
 *
 * Validates the rich JSON-style letter format used by:
 *   Volumes 1-7, Lord's Rebuke, Letters to Flock,
 *   Letters from Timothy, Hidden Manna.
 *
 * Usage:
 *   node tools/validate-schemas.js [--strict]
 *
 * Exports:
 *   validateFormatA(letters, opts) => { errors: string[], warnings: string[] }
 */

import { readFileSync } from 'fs';
import { createContext, runInNewContext } from 'vm';
import { resolve, basename } from 'path';
import { fileURLToPath } from 'url';

// ── valid enum sets ──────────────────────────────────────────────

const VALID_BLOCK_TYPES = new Set([
  'para', 'poetry', 'closing', 'closing-fn', 'note', 'scripture', 'intro',
]);

const VALID_SEGMENT_TYPES = new Set([
  'text', 'italic', 'bold-italic', 'caps', 'fn', 'stanza-break', 'letter-link',
]);

// Footnote types
const VALID_FOOTNOTE_TYPES = new Set(['scripture', 'note']);

// Format B paragraph alignment
const VALID_ALIGN = new Set(['center', 'justify', 'left']);

// Holy Days entry types — the album is hybrid: each entry is either a
// Format A letter (type="letter") or a Format B entry (type="wtlb").
const VALID_HOLY_DAYS_TYPES = new Set(['wtlb', 'letter']);

// ── helpers ──────────────────────────────────────────────────────

function ctx(letterIdx, letterId) {
  return letterId ? `letter[${letterIdx}] "${letterId}"` : `letter[${letterIdx}]`;
}

/** Generic context label: `<noun>[<i>] "<id>"` (id optional). */
function ctxItem(noun, i, id) {
  return id ? `${noun}[${i}] "${id}"` : `${noun}[${i}]`;
}

// ── validateFormatA ──────────────────────────────────────────────

/**
 * @param {object[]} letters - array of Format A letter objects
 * @param {{ strict?: boolean, fileName?: string }} [opts]
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateFormatA(letters, opts = {}) {
  const errors = [];
  const warnings = [];
  const fileName = opts.fileName || '(unknown)';

  if (!Array.isArray(letters)) {
    errors.push(`${fileName}: expected an array, got ${typeof letters}`);
    return { errors, warnings };
  }

  for (let i = 0; i < letters.length; i++) {
    const letter = letters[i];
    if (!letter || typeof letter !== 'object' || Array.isArray(letter)) {
      errors.push(`${fileName}: letter[${i}] is not a plain object`);
      continue;
    }

    const id = letter.id;
    const prefix = `${fileName}: ${ctx(i, id)}`;

    // ── required top-level fields ───────────────────────────────
    if (typeof id !== 'string' || id.length === 0) {
      errors.push(`${prefix}: missing or empty "id" (string)`);
    }
    if (typeof letter.title !== 'string' || letter.title.length === 0) {
      errors.push(`${prefix}: missing or empty "title" (string)`);
    }
    if (!Array.isArray(letter.blocks)) {
      errors.push(`${prefix}: missing or non-array "blocks"`);
    }

    // footnotes + nkjv — required per letter (can be empty objects)
    const footnotes = letter.footnotes;
    const nkjv = letter.nkjv;
    if (!footnotes || typeof footnotes !== 'object' || Array.isArray(footnotes)) {
      errors.push(`${prefix}: missing or non-object "footnotes"`);
    }
    if (!nkjv || typeof nkjv !== 'object' || Array.isArray(nkjv)) {
      errors.push(`${prefix}: missing or non-object "nkjv"`);
    }

    // ── optional typed fields ───────────────────────────────────
    if (letter.num !== undefined && typeof letter.num !== 'number') {
      errors.push(`${prefix}: "num" must be a number if present`);
    }
    for (const optStr of ['date', 'from', 'spoken', 'forLine', 'audioUrl',
      'soundcloudUrl', 'videoVoiceUrl', 'videoMusicUrl',
      'metaAddendum', 'metaAddendumUrl', 'metaAddendumInternal']) {
      if (letter[optStr] !== undefined && typeof letter[optStr] !== 'string') {
        errors.push(`${prefix}: "${optStr}" must be a string if present`);
      }
    }

    // relatedTopics
    if (letter.relatedTopics !== undefined) {
      if (!Array.isArray(letter.relatedTopics)) {
        errors.push(`${prefix}: "relatedTopics" must be an array if present`);
      } else {
        for (let ri = 0; ri < letter.relatedTopics.length; ri++) {
          const rt = letter.relatedTopics[ri];
          if (!rt || typeof rt.label !== 'string') {
            errors.push(`${prefix}: relatedTopics[${ri}] missing "label" (string)`);
          }
          if (!rt || typeof rt.url !== 'string') {
            errors.push(`${prefix}: relatedTopics[${ri}] missing "url" (string)`);
          }
        }
      }
    }

    // prevLetter / nextLetter
    validateNavLink(letter.prevLetter, 'prevLetter', prefix, errors);
    validateNavLink(letter.nextLetter, 'nextLetter', prefix, errors);

    // ── blocks ──────────────────────────────────────────────────
    const fnRefsUsed = new Set();

    if (Array.isArray(letter.blocks)) {
      for (let bi = 0; bi < letter.blocks.length; bi++) {
        const block = letter.blocks[bi];
        const bp = `${prefix} block[${bi}]`;

        if (!block || typeof block !== 'object') {
          errors.push(`${bp}: not an object`);
          continue;
        }

        if (!VALID_BLOCK_TYPES.has(block.type)) {
          errors.push(`${bp}: invalid block type "${block.type}"`);
          continue;
        }

        switch (block.type) {
          case 'para':
          case 'closing-fn':
          case 'intro':
            if (!Array.isArray(block.segments)) {
              errors.push(`${bp}: type="${block.type}" requires "segments" array`);
            } else {
              validateSegments(block.segments, bp, errors, fnRefsUsed);
            }
            break;

          case 'poetry':
            if (!Array.isArray(block.lines)) {
              errors.push(`${bp}: type="poetry" requires "lines" array`);
            } else {
              for (let li = 0; li < block.lines.length; li++) {
                const line = block.lines[li];
                if (!Array.isArray(line)) {
                  errors.push(`${bp} lines[${li}]: must be an array`);
                } else {
                  validateSegments(line, `${bp} lines[${li}]`, errors, fnRefsUsed);
                }
              }
            }
            break;

          case 'closing':
          case 'note':
            if (typeof block.text !== 'string') {
              errors.push(`${bp}: type="${block.type}" requires "text" (string)`);
            }
            break;

          case 'scripture':
            // scripture blocks have varied structure in the spec;
            // accept segments, text, or lines
            break;
        }
      }
    }

    // ── footnote validation ─────────────────────────────────────
    if (footnotes && typeof footnotes === 'object' && !Array.isArray(footnotes)) {
      const fnKeys = Object.keys(footnotes);

      for (const fnKey of fnKeys) {
        const fn = footnotes[fnKey];
        const fp = `${prefix} footnote["${fnKey}"]`;

        if (!fn || typeof fn !== 'object') {
          errors.push(`${fp}: not an object`);
          continue;
        }

        if (!VALID_FOOTNOTE_TYPES.has(fn.type)) {
          errors.push(`${fp}: invalid footnote type "${fn.type}" (expected "scripture" or "note")`);
          continue;
        }

        if (fn.type === 'scripture') {
          if (typeof fn.ref !== 'string' || fn.ref.length === 0) {
            errors.push(`${fp}: scripture footnote missing "ref" (string)`);
          } else if (nkjv && typeof nkjv === 'object' && !Array.isArray(nkjv)) {
            if (!(fn.ref in nkjv)) {
              errors.push(`${fp}: ref "${fn.ref}" not found in nkjv dict`);
            }
          }
        }

        if (fn.type === 'note') {
          if (typeof fn.text !== 'string' || fn.text.length === 0) {
            errors.push(`${fp}: note footnote missing "text" (string)`);
          }
        }
      }

      // orphan detection — footnotes not referenced by any fn segment
      for (const fnKey of fnKeys) {
        if (!fnRefsUsed.has(fnKey)) {
          warnings.push(`${prefix}: footnote "${fnKey}" defined but never referenced by an fn segment`);
        }
      }

      // fn segments referencing non-existent footnotes
      for (const ref of fnRefsUsed) {
        if (!(ref in footnotes)) {
          errors.push(`${prefix}: fn segment references footnote "${ref}" which does not exist`);
        }
      }
    }

    // ── nkjv orphan detection ───────────────────────────────────
    if (nkjv && typeof nkjv === 'object' && !Array.isArray(nkjv) &&
        footnotes && typeof footnotes === 'object' && !Array.isArray(footnotes)) {
      const fnRefs = new Set();
      for (const fnKey of Object.keys(footnotes)) {
        const fn = footnotes[fnKey];
        if (fn && fn.type === 'scripture' && typeof fn.ref === 'string') {
          fnRefs.add(fn.ref);
        }
      }
      for (const nkjvKey of Object.keys(nkjv)) {
        if (!fnRefs.has(nkjvKey)) {
          warnings.push(`${prefix}: nkjv key "${nkjvKey}" not referenced by any scripture footnote`);
        }
      }
    }
  }

  // ── chain validation ──────────────────────────────────────────
  validateChain(letters, fileName, errors, warnings, 'prevLetter', 'nextLetter', 'letter');

  return { errors, warnings };
}

/**
 * Validate prev/next chain consistency across an ordered item array.
 * Generalized so Format A (prevLetter/nextLetter, noun="letter") and the
 * Holy Days album (prevEntry/nextEntry, noun="entry") share one impl.
 * @param {object[]} items
 * @param {string} fileName
 * @param {string[]} errors
 * @param {string[]} warnings
 * @param {string} prevKey
 * @param {string} nextKey
 * @param {string} noun
 */
function validateChain(items, fileName, errors, warnings, prevKey, nextKey, noun) {
  for (let i = 0; i < items.length - 1; i++) {
    const curr = items[i];
    const next = items[i + 1];
    if (!curr || !next) continue;
    const prefix = `${fileName}: chain[${i}→${i + 1}]`;
    if (curr[nextKey]) {
      if (curr[nextKey].id !== next.id) {
        errors.push(`${prefix}: ${noun}[${i}].${nextKey}.id is "${curr[nextKey].id}" but ${noun}[${i + 1}].id is "${next.id}"`);
      }
    }
    if (next[prevKey]) {
      if (next[prevKey].id !== curr.id) {
        errors.push(`${prefix}: ${noun}[${i + 1}].${prevKey}.id is "${next[prevKey].id}" but ${noun}[${i}].id is "${curr.id}"`);
      }
    }
  }
  if (items.length > 0 && items[0] && items[0][prevKey] !== undefined && items[0][prevKey] !== null) {
    warnings.push(`${fileName}: first ${noun} has non-null ${prevKey}`);
  }
  if (items.length > 0) {
    const last = items[items.length - 1];
    if (last && last[nextKey] !== undefined && last[nextKey] !== null) {
      warnings.push(`${fileName}: last ${noun} has non-null ${nextKey}`);
    }
  }
}

// ── segment validation ──────────────────────────────────────────

function validateSegments(segments, pathPrefix, errors, fnRefsUsed) {
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    const sp = `${pathPrefix} seg[${si}]`;

    if (!seg || typeof seg !== 'object') {
      errors.push(`${sp}: not an object`);
      continue;
    }

    if (!VALID_SEGMENT_TYPES.has(seg.t)) {
      errors.push(`${sp}: invalid segment type "${seg.t}"`);
      continue;
    }

    switch (seg.t) {
      case 'text':
      case 'italic':
      case 'bold-italic':
      case 'caps':
        if (typeof seg.v !== 'string') {
          errors.push(`${sp}: type="${seg.t}" requires "v" (string)`);
        }
        break;

      case 'fn':
        if (typeof seg.v !== 'string' || seg.v.length === 0) {
          errors.push(`${sp}: type="fn" requires "v" (non-empty string)`);
        } else {
          fnRefsUsed.add(seg.v);
        }
        break;

      case 'stanza-break':
        // v is optional for stanza-break
        break;

      case 'letter-link':
        // letter-link has label + link, not v
        if (typeof seg.label !== 'string') {
          errors.push(`${sp}: type="letter-link" requires "label" (string)`);
        }
        if (!seg.link || typeof seg.link !== 'object') {
          errors.push(`${sp}: type="letter-link" requires "link" (object)`);
        }
        break;
    }
  }
}

// ── nav link validation ─────────────────────────────────────────

function validateNavLink(nav, fieldName, prefix, errors) {
  if (nav === undefined || nav === null) return;
  if (typeof nav !== 'object' || Array.isArray(nav)) {
    errors.push(`${prefix}: "${fieldName}" must be an object or null`);
    return;
  }
  if (typeof nav.id !== 'string' || nav.id.length === 0) {
    errors.push(`${prefix}: ${fieldName}.id must be a non-empty string`);
  }
  if (typeof nav.title !== 'string' || nav.title.length === 0) {
    errors.push(`${prefix}: ${fieldName}.title must be a non-empty string`);
  }
}

// ── Format B (WTLB One/Two, The Blessed) ─────────────────────────

/**
 * @param {object[]} entries - array of Format B entry objects
 * @param {{ strict?: boolean, fileName?: string, scriptures?: object }} [opts]
 *   opts.scriptures - dict of "Ref" → text used to cross-check {{ref:…}}
 *   (WTLB/Blessed store this in a separate module-level variable).
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateFormatB(entries, opts = {}) {
  const errors = [];
  const warnings = [];
  const fileName = opts.fileName || '(unknown)';
  const scriptures = opts.scriptures && typeof opts.scriptures === 'object' && !Array.isArray(opts.scriptures)
    ? opts.scriptures : null;

  if (!Array.isArray(entries)) {
    errors.push(`${fileName}: expected an array, got ${typeof entries}`);
    return { errors, warnings };
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${fileName}: entry[${i}] is not a plain object`);
      continue;
    }
    validateFormatBEntry(entry, `${fileName}: ${ctxItem('entry', i, entry.id)}`, errors, warnings, scriptures);
  }

  return { errors, warnings };
}

/**
 * Validate a single Format B entry (no chain). Shared by validateFormatB
 * and validateHolyDays (type="wtlb").
 */
function validateFormatBEntry(entry, prefix, errors, warnings, scriptures) {
  if (typeof entry.id !== 'string' || entry.id.length === 0) {
    errors.push(`${prefix}: missing or empty "id" (string)`);
  }
  if (typeof entry.title !== 'string' || entry.title.length === 0) {
    errors.push(`${prefix}: missing or empty "title" (string)`);
  }
  if (entry.num !== undefined && typeof entry.num !== 'number') {
    errors.push(`${prefix}: "num" must be a number if present`);
  }
  for (const optStr of ['sourceLabel', 'type']) {
    if (entry[optStr] !== undefined && typeof entry[optStr] !== 'string') {
      errors.push(`${prefix}: "${optStr}" must be a string if present`);
    }
  }
  if (entry.scriptures !== undefined &&
      (typeof entry.scriptures !== 'object' || Array.isArray(entry.scriptures))) {
    errors.push(`${prefix}: "scriptures" must be an object if present`);
  }

  // A per-entry scriptures dict (Holy Days) takes precedence over the
  // module-level one passed in opts (WTLB/Blessed).
  const refDict = (entry.scriptures && typeof entry.scriptures === 'object' && !Array.isArray(entry.scriptures)
    && Object.keys(entry.scriptures).length > 0)
    ? entry.scriptures : scriptures;

  if (!Array.isArray(entry.paragraphs)) {
    errors.push(`${prefix}: missing or non-array "paragraphs"`);
    return;
  }
  for (let pi = 0; pi < entry.paragraphs.length; pi++) {
    const para = entry.paragraphs[pi];
    const pp = `${prefix} paragraph[${pi}]`;
    if (!para || typeof para !== 'object') {
      errors.push(`${pp}: not an object`);
      continue;
    }
    if (!VALID_ALIGN.has(para.align)) {
      errors.push(`${pp}: invalid align "${para.align}" (expected center|justify|left)`);
    }
    if (typeof para.text !== 'string') {
      errors.push(`${pp}: missing "text" (string)`);
    } else {
      validateInlineRefs(para.text, pp, errors, warnings, refDict);
    }
  }
}

/**
 * Validate inline {{nav:…}} and {{ref:…}} patterns in Format B text.
 * - {{nav:bookId:chapter}} → must be 2 colon-separated parts, chapter numeric (ERROR if not)
 * - {{ref:Book Ch:V}} → non-empty (ERROR if empty); existence checked against
 *   the scriptures dict only when one is provided AND non-empty (WARNING on miss,
 *   since some refs may resolve through a global resolver rather than the dict).
 */
function validateInlineRefs(text, prefix, errors, warnings, scriptures) {
  const navRe = /\{\{nav:([^}]*)\}\}/g;
  let m;
  while ((m = navRe.exec(text)) !== null) {
    const parts = m[1].split(':');
    if (parts.length !== 2 || parts[0].length === 0 || !/^\d+$/.test(parts[1])) {
      errors.push(`${prefix}: malformed nav link "{{nav:${m[1]}}}" (expected {{nav:bookId:chapter}})`);
    }
  }
  const refRe = /\{\{ref:([^}]*)\}\}/g;
  while ((m = refRe.exec(text)) !== null) {
    const ref = m[1];
    if (ref.trim().length === 0) {
      errors.push(`${prefix}: empty inline ref "{{ref:}}"`);
      continue;
    }
    if (scriptures && Object.keys(scriptures).length > 0 && !(ref in scriptures)) {
      warnings.push(`${prefix}: inline ref "${ref}" not found in scriptures dict`);
    }
  }
}

// ── Holy Days (hybrid album — Format A or B per entry.type) ──────

/**
 * @param {object[]} entries - HOLY_DAYS array (each entry is type "letter" or "wtlb")
 * @param {{ strict?: boolean, fileName?: string }} [opts]
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateHolyDays(entries, opts = {}) {
  const errors = [];
  const warnings = [];
  const fileName = opts.fileName || '(unknown)';

  if (!Array.isArray(entries)) {
    errors.push(`${fileName}: expected an array, got ${typeof entries}`);
    return { errors, warnings };
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${fileName}: entry[${i}] is not a plain object`);
      continue;
    }
    const label = `${fileName}: ${ctxItem('entry', i, entry.id)}`;
    if (!VALID_HOLY_DAYS_TYPES.has(entry.type)) {
      errors.push(`${label}: invalid or missing "type" "${entry.type}" (expected "letter" or "wtlb")`);
      continue;
    }
    // Dispatch to the matching per-item validator. The single-element
    // reuse keeps the full Format A / B rule sets without duplicating them;
    // prevLetter/nextLetter are absent here (Holy Days uses prevEntry/
    // nextEntry), so the reused per-item chain checks are inert.
    const sub = entry.type === 'letter'
      ? validateFormatA([entry], { fileName: label })
      : validateFormatB([entry], { fileName: label, scriptures: entry.scriptures });
    for (const e of sub.errors) errors.push(e);
    for (const w of sub.warnings) warnings.push(w);
  }

  // Album chain runs on the prevEntry/nextEntry fields.
  validateChain(entries, fileName, errors, warnings, 'prevEntry', 'nextEntry', 'entry');

  return { errors, warnings };
}

// ── Format C (Bible books: books.js, matthew-plain, books-restored) ──

/**
 * @param {object|object[]} books - object-of-books (BOOKS), single book
 *   (MATTHEW_PLAIN), or array of books.
 * @param {{ strict?: boolean, fileName?: string, chromeOnly?: boolean }} [opts]
 *   opts.chromeOnly - books-restored.js carries chapter/section chrome only
 *   (verses live in books.js); skip the verse-level requirements.
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateFormatC(books, opts = {}) {
  const errors = [];
  const warnings = [];
  const fileName = opts.fileName || '(unknown)';
  const chromeOnly = !!opts.chromeOnly;

  /** @type {Array<[string, any]>} */
  let bookList;
  if (Array.isArray(books)) {
    bookList = books.map((b, i) => [String(i), b]);
  } else if (books && typeof books === 'object' &&
             ('chapters' in books || 'id' in books || 'title' in books)) {
    // Single book — identified by its own top-level book fields. (An
    // object-of-books is keyed by book id, so it has none of these.)
    // Detect by field presence, not by chapters being a valid array, so a
    // malformed single book still reports "missing chapters" cleanly.
    bookList = [[books.id || '0', books]];
  } else if (books && typeof books === 'object') {
    bookList = Object.entries(books);                // object-of-books
  } else {
    errors.push(`${fileName}: expected an object or array of books, got ${typeof books}`);
    return { errors, warnings };
  }

  for (const [key, book] of bookList) {
    const prefix = `${fileName}: book "${(book && book.id) || key}"`;
    if (!book || typeof book !== 'object' || Array.isArray(book)) {
      errors.push(`${prefix}: not a plain object`);
      continue;
    }
    // Chrome-only files (books-restored) key each book by its id in the
    // enclosing object and carry no per-book id/title — those live in
    // books.js. Require them only for full book files.
    if (!chromeOnly) {
      if (typeof book.id !== 'string' || book.id.length === 0) {
        errors.push(`${prefix}: missing or empty "id" (string)`);
      }
      if (typeof book.title !== 'string' || book.title.length === 0) {
        errors.push(`${prefix}: missing or empty "title" (string)`);
      }
    } else {
      if (book.id !== undefined && typeof book.id !== 'string') {
        errors.push(`${prefix}: "id" must be a string if present`);
      }
      if (book.title !== undefined && typeof book.title !== 'string') {
        errors.push(`${prefix}: "title" must be a string if present`);
      }
    }
    if (book.subtitle !== undefined && typeof book.subtitle !== 'string') {
      errors.push(`${prefix}: "subtitle" must be a string if present`);
    }
    if (!Array.isArray(book.chapters)) {
      errors.push(`${prefix}: missing or non-array "chapters"`);
      continue;
    }
    for (let ci = 0; ci < book.chapters.length; ci++) {
      const ch = book.chapters[ci];
      const cp = `${prefix} chapter[${ci}]`;
      if (!ch || typeof ch !== 'object') {
        errors.push(`${cp}: not an object`);
        continue;
      }
      if (typeof ch.num !== 'number') {
        errors.push(`${cp}: missing "num" (number)`);
      }
      if (ch.title !== undefined && typeof ch.title !== 'string') {
        errors.push(`${cp}: "title" must be a string if present`);
      }
      if (!Array.isArray(ch.sections)) {
        errors.push(`${cp}: missing or non-array "sections"`);
        continue;
      }
      // Verse numbering ascends across the whole chapter (sections concatenate).
      let lastN = null;
      for (let si = 0; si < ch.sections.length; si++) {
        const sec = ch.sections[si];
        const sp = `${cp} section[${si}]`;
        if (!sec || typeof sec !== 'object') {
          errors.push(`${sp}: not an object`);
          continue;
        }
        if (sec.heading !== undefined && typeof sec.heading !== 'string') {
          errors.push(`${sp}: "heading" must be a string if present`);
        }
        if (chromeOnly) {
          // Chrome-only files carry headings, not verses.
          if (sec.verses !== undefined && !Array.isArray(sec.verses)) {
            errors.push(`${sp}: "verses" must be an array if present`);
          }
          continue;
        }
        if (!Array.isArray(sec.verses)) {
          errors.push(`${sp}: missing or non-array "verses"`);
          continue;
        }
        for (let vi = 0; vi < sec.verses.length; vi++) {
          const v = sec.verses[vi];
          const vp = `${sp} verse[${vi}]`;
          if (!v || typeof v !== 'object') {
            errors.push(`${vp}: not an object`);
            continue;
          }
          if (typeof v.n !== 'number') {
            errors.push(`${vp}: missing "n" (number)`);
            continue;
          }
          if (typeof v.text !== 'string') {
            errors.push(`${vp}: missing "text" (string)`);
          }
          if (lastN !== null) {
            if (v.n <= lastN) {
              errors.push(`${cp}: verse numbering not ascending — n=${v.n} follows n=${lastN}`);
            } else if (v.n > lastN + 1) {
              warnings.push(`${cp}: verse gap — n jumps from ${lastN} to ${v.n}`);
            }
          }
          lastN = v.n;
        }
      }
    }
  }

  return { errors, warnings };
}

// ── Format D (Bible Studies: bible-studies.js) ───────────────────

/**
 * @param {object[]} studies - BIBLE_STUDIES array
 * @param {{ strict?: boolean, fileName?: string }} [opts]
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateFormatD(studies, opts = {}) {
  const errors = [];
  const warnings = [];
  const fileName = opts.fileName || '(unknown)';

  if (!Array.isArray(studies)) {
    errors.push(`${fileName}: expected an array, got ${typeof studies}`);
    return { errors, warnings };
  }

  for (let i = 0; i < studies.length; i++) {
    const study = studies[i];
    const prefix = `${fileName}: ${ctxItem('study', i, study && study.id)}`;
    if (!study || typeof study !== 'object' || Array.isArray(study)) {
      errors.push(`${prefix}: not a plain object`);
      continue;
    }
    if (typeof study.id !== 'string' || study.id.length === 0) {
      errors.push(`${prefix}: missing or empty "id" (string)`);
    }
    if (typeof study.title !== 'string' || study.title.length === 0) {
      errors.push(`${prefix}: missing or empty "title" (string)`);
    }
    for (const optStr of ['slug', 'coverImage', 'prefaceId', 'subtitle']) {
      if (study[optStr] !== undefined && typeof study[optStr] !== 'string') {
        errors.push(`${prefix}: "${optStr}" must be a string if present`);
      }
    }
    if (study.order !== undefined && typeof study.order !== 'number') {
      errors.push(`${prefix}: "order" must be a number if present`);
    }
    if (study.singlePage !== undefined && typeof study.singlePage !== 'boolean') {
      errors.push(`${prefix}: "singlePage" must be a boolean if present`);
    }

    // chapters — required; collect ids so parts.chapterIds can be cross-checked
    const chapterIds = new Set();
    if (!Array.isArray(study.chapters)) {
      errors.push(`${prefix}: missing or non-array "chapters"`);
    } else {
      for (let ci = 0; ci < study.chapters.length; ci++) {
        const ch = study.chapters[ci];
        const cp = `${prefix} chapter[${ci}]`;
        if (!ch || typeof ch !== 'object') {
          errors.push(`${cp}: not an object`);
          continue;
        }
        if (typeof ch.id !== 'string' || ch.id.length === 0) {
          errors.push(`${cp}: missing or empty "id" (string)`);
        } else {
          chapterIds.add(ch.id);
        }
        if (ch.num !== undefined && typeof ch.num !== 'number') {
          errors.push(`${cp}: "num" must be a number if present`);
        }
        if (ch.title !== undefined && typeof ch.title !== 'string') {
          errors.push(`${cp}: "title" must be a string if present`);
        }
        if (ch.blocks !== undefined && !Array.isArray(ch.blocks)) {
          errors.push(`${cp}: "blocks" must be an array if present`);
        }
      }
    }

    // parts — optional (only multi-part studies have them)
    if (study.parts !== undefined) {
      if (!Array.isArray(study.parts)) {
        errors.push(`${prefix}: "parts" must be an array if present`);
      } else {
        for (let pi = 0; pi < study.parts.length; pi++) {
          const part = study.parts[pi];
          const pp = `${prefix} part[${pi}]`;
          if (!part || typeof part !== 'object') {
            errors.push(`${pp}: not an object`);
            continue;
          }
          if (typeof part.title !== 'string' || part.title.length === 0) {
            errors.push(`${pp}: missing or empty "title" (string)`);
          }
          if (!Array.isArray(part.chapterIds)) {
            errors.push(`${pp}: missing or non-array "chapterIds"`);
          } else {
            for (let cii = 0; cii < part.chapterIds.length; cii++) {
              const cid = part.chapterIds[cii];
              if (typeof cid !== 'string') {
                errors.push(`${pp}: chapterIds[${cii}] is not a string`);
                continue;
              }
              // Only enforce resolution when the study actually lists chapters
              // (partial studies may carry parts before chapters are populated).
              if (chapterIds.size > 0 && !chapterIds.has(cid)) {
                errors.push(`${pp}: chapterId "${cid}" does not match any chapter in study.chapters`);
              }
            }
          }
        }
      }
    }
  }

  return { errors, warnings };
}

// ── CLI runner ───────────────────────────────────────────────────

/** @type {Array<{file: string, arrayVar: string, prefaceVar?: string}>} */
const FORMAT_A_FILES = [
  { file: 'volume-one.js',      arrayVar: 'LETTERS_V1',      prefaceVar: 'LETTERS_V1_PREFACE' },
  { file: 'volume-two.js',      arrayVar: 'LETTERS',         prefaceVar: null },
  { file: 'volume-three.js',    arrayVar: 'LETTERS_V3',      prefaceVar: 'LETTERS_V3_PREFACE' },
  { file: 'volume-four.js',     arrayVar: 'LETTERS_V4',      prefaceVar: 'LETTERS_V4_PREFACE' },
  { file: 'volume-five.js',     arrayVar: 'LETTERS_V5',      prefaceVar: 'LETTERS_V5_PREFACE' },
  { file: 'volume-six.js',      arrayVar: 'LETTERS_V6',      prefaceVar: 'LETTERS_V6_PREFACE' },
  { file: 'volume-seven.js',    arrayVar: 'LETTERS_V7',      prefaceVar: 'LETTERS_V7_PREFACE' },
  { file: 'lords-rebuke.js',    arrayVar: 'LETTERS_REBUKE',  prefaceVar: 'LETTERS_REBUKE_PREFACE' },
  { file: 'letters-timothy.js', arrayVar: 'LETTERS_TIMOTHY', prefaceVar: 'LETTERS_TIMOTHY_PREFACE' },
  { file: 'letters-flock.js',   arrayVar: 'LETTERS_FLOCK',   prefaceVar: 'LETTERS_FLOCK_PREFACE' },
  { file: 'hidden-manna.js',    arrayVar: 'HIDDEN_MANNA',    prefaceVar: null },
];

/** @type {Array<{file: string, arrayVar: string, scripturesFile?: string, scripturesVar?: string}>} */
const FORMAT_B_FILES = [
  { file: 'wtlb-one.js',    arrayVar: 'WTLB_ONE',    scripturesFile: 'wtlb-scriptures.js', scripturesVar: 'WTLB_SCRIPTURES' },
  { file: 'wtlb-two.js',    arrayVar: 'WTLB_TWO',    scripturesFile: 'wtlb-scriptures.js', scripturesVar: 'WTLB_SCRIPTURES' },
  { file: 'the-blessed.js', arrayVar: 'THE_BLESSED', scripturesFile: 'the-blessed.js',     scripturesVar: 'THE_BLESSED_SCRIPTURES' },
];

const HOLY_DAYS_FILE = { file: 'holy-days.js', arrayVar: 'HOLY_DAYS' };

/** @type {Array<{file: string, arrayVar: string, chromeOnly?: boolean}>} */
const FORMAT_C_FILES = [
  { file: 'books.js',          arrayVar: 'BOOKS' },
  { file: 'matthew-plain.js',  arrayVar: 'MATTHEW_PLAIN' },
  { file: 'books-restored.js', arrayVar: 'BOOKS_RESTORED', chromeOnly: true },
];

const FORMAT_D_FILES = [
  { file: 'bible-studies.js', arrayVar: 'BIBLE_STUDIES' },
];

// Intentionally NOT covered by the A/B/C/D validators — each is a distinct
// shape that postdates the W9.1 spec, deferred to a future Format-E pass:
//   matthew.js       — Study Bible (preface + sectionless annotated chapters)
//   matthew-nkjv.js  — ref→text scripture dict
//   bible-*.js       — translation verse maps (book → chapterNum → verses[])

/**
 * Load a Format A data file via vm.runInNewContext and return the
 * letter array (and optional preface).
 */
function loadDataFile(filePath, arrayVar, prefaceVar) {
  const code = readFileSync(filePath, 'utf-8');
  const sandbox = {};
  runInNewContext(code, sandbox);
  const letters = sandbox[arrayVar];
  const preface = prefaceVar ? sandbox[prefaceVar] : null;
  return { letters, preface };
}

/** Run a data file in a fresh VM context and return one global variable. */
function loadVar(filePath, varName) {
  const code = readFileSync(filePath, 'utf-8');
  const sandbox = {};
  runInNewContext(code, sandbox);
  return sandbox[varName];
}

/** Print a validation result + per-file status line. */
function emit(result, label, count, noun, extra) {
  for (const e of result.errors) console.error(`  ERROR: ${e}`);
  for (const w of result.warnings) console.warn(`  WARN:  ${w}`);
  const status = result.errors.length === 0 ? 'OK' : 'FAIL';
  console.log(`  ${label}: ${count} ${noun}${extra || ''} — ${status} (${result.errors.length} errors, ${result.warnings.length} warnings)`);
}

function runCli() {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const dataDir = resolve(
    fileURLToPath(import.meta.url), '..', '..', 'app', 'src', 'main', 'assets', 'src', 'data'
  );

  const totals = { items: 0, errors: 0, warnings: 0 };
  const add = (result, n) => {
    totals.errors += result.errors.length;
    totals.warnings += result.warnings.length;
    totals.items += n;
  };
  const loadErr = (label, msg) => { console.error(`LOAD ERROR: ${label}: ${msg}`); totals.errors++; };

  // ── Format A ──
  console.log('Format A (letters):');
  for (const entry of FORMAT_A_FILES) {
    const label = basename(entry.file);
    let data;
    try { data = loadDataFile(resolve(dataDir, entry.file), entry.arrayVar, entry.prefaceVar); }
    catch (e) { loadErr(label, e.message); continue; }
    const { letters, preface } = data;
    if (!Array.isArray(letters)) { loadErr(label, `variable "${entry.arrayVar}" is not an array`); continue; }
    if (preface && typeof preface === 'object' && !Array.isArray(preface)) {
      const prefRes = validateFormatA([preface], { strict, fileName: `${label}(preface)` });
      add(prefRes, 1);
      for (const e of prefRes.errors) console.error(`  ERROR: ${e}`);
      for (const w of prefRes.warnings) console.warn(`  WARN:  ${w}`);
    }
    const result = validateFormatA(letters, { strict, fileName: label });
    add(result, letters.length);
    emit(result, label, letters.length, 'letters', preface ? ' + preface' : '');
  }

  // ── Format B ──
  console.log('\nFormat B (WTLB / The Blessed):');
  for (const entry of FORMAT_B_FILES) {
    const label = basename(entry.file);
    let entries, scriptures = null;
    try {
      entries = loadVar(resolve(dataDir, entry.file), entry.arrayVar);
      if (entry.scripturesFile) scriptures = loadVar(resolve(dataDir, entry.scripturesFile), entry.scripturesVar);
    } catch (e) { loadErr(label, e.message); continue; }
    if (!Array.isArray(entries)) { loadErr(label, `variable "${entry.arrayVar}" is not an array`); continue; }
    const result = validateFormatB(entries, { strict, fileName: label, scriptures });
    add(result, entries.length);
    emit(result, label, entries.length, 'entries', '');
  }

  // ── Holy Days (hybrid) ──
  console.log('\nHoly Days (hybrid album):');
  {
    const label = basename(HOLY_DAYS_FILE.file);
    let entries;
    try { entries = loadVar(resolve(dataDir, HOLY_DAYS_FILE.file), HOLY_DAYS_FILE.arrayVar); }
    catch (e) { loadErr(label, e.message); entries = undefined; }
    if (Array.isArray(entries)) {
      const result = validateHolyDays(entries, { strict, fileName: label });
      add(result, entries.length);
      emit(result, label, entries.length, 'entries', '');
    } else if (entries !== undefined) {
      loadErr(label, `variable "${HOLY_DAYS_FILE.arrayVar}" is not an array`);
    }
  }

  // ── Format C ──
  console.log('\nFormat C (Bible books):');
  for (const entry of FORMAT_C_FILES) {
    const label = basename(entry.file);
    let books;
    try { books = loadVar(resolve(dataDir, entry.file), entry.arrayVar); }
    catch (e) { loadErr(label, e.message); continue; }
    if (!books || typeof books !== 'object') { loadErr(label, `variable "${entry.arrayVar}" is not an object`); continue; }
    const result = validateFormatC(books, { strict, fileName: label, chromeOnly: entry.chromeOnly });
    const n = Array.isArray(books) ? books.length : (books.chapters ? 1 : Object.keys(books).length);
    add(result, n);
    emit(result, label, n, 'books', entry.chromeOnly ? ' (chrome)' : '');
  }

  // ── Format D ──
  console.log('\nFormat D (Bible Studies):');
  for (const entry of FORMAT_D_FILES) {
    const label = basename(entry.file);
    let studies;
    try { studies = loadVar(resolve(dataDir, entry.file), entry.arrayVar); }
    catch (e) { loadErr(label, e.message); continue; }
    if (!Array.isArray(studies)) { loadErr(label, `variable "${entry.arrayVar}" is not an array`); continue; }
    const result = validateFormatD(studies, { strict, fileName: label });
    add(result, studies.length);
    emit(result, label, studies.length, 'studies', '');
  }

  console.log(`\n=== TOTALS: ${totals.items} items validated, ${totals.errors} errors, ${totals.warnings} warnings ===`);
  if (strict && totals.errors > 0) process.exit(1);
}

// Run CLI when executed directly
const isMain = process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  runCli();
}
