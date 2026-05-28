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

// ── helpers ──────────────────────────────────────────────────────

function ctx(letterIdx, letterId) {
  return letterId ? `letter[${letterIdx}] "${letterId}"` : `letter[${letterIdx}]`;
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
  for (let i = 0; i < letters.length - 1; i++) {
    const curr = letters[i];
    const next = letters[i + 1];
    if (!curr || !next) continue;
    const prefix = `${fileName}: chain[${i}→${i + 1}]`;

    if (curr.nextLetter) {
      if (curr.nextLetter.id !== next.id) {
        errors.push(`${prefix}: letter[${i}].nextLetter.id is "${curr.nextLetter.id}" but letter[${i + 1}].id is "${next.id}"`);
      }
    }
    if (next.prevLetter) {
      if (next.prevLetter.id !== curr.id) {
        errors.push(`${prefix}: letter[${i + 1}].prevLetter.id is "${next.prevLetter.id}" but letter[${i}].id is "${curr.id}"`);
      }
    }
  }

  // first letter should have prevLetter === null if present
  if (letters.length > 0 && letters[0] && letters[0].prevLetter !== undefined && letters[0].prevLetter !== null) {
    warnings.push(`${fileName}: first letter has non-null prevLetter`);
  }
  // last letter should have nextLetter === null if present
  if (letters.length > 0) {
    const last = letters[letters.length - 1];
    if (last && last.nextLetter !== undefined && last.nextLetter !== null) {
      warnings.push(`${fileName}: last letter has non-null nextLetter`);
    }
  }

  return { errors, warnings };
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

function runCli() {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');

  const dataDir = resolve(
    fileURLToPath(import.meta.url), '..', '..', 'app', 'src', 'main', 'assets', 'src', 'data'
  );

  let totalLetters = 0;
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const entry of FORMAT_A_FILES) {
    const filePath = resolve(dataDir, entry.file);
    const label = basename(entry.file);

    let data;
    try {
      data = loadDataFile(filePath, entry.arrayVar, entry.prefaceVar);
    } catch (e) {
      console.error(`LOAD ERROR: ${label}: ${e.message}`);
      totalErrors++;
      continue;
    }

    const { letters, preface } = data;

    if (!Array.isArray(letters)) {
      console.error(`LOAD ERROR: ${label}: variable "${entry.arrayVar}" is not an array`);
      totalErrors++;
      continue;
    }

    // Validate preface as a single-element array if present
    if (preface && typeof preface === 'object' && !Array.isArray(preface)) {
      const prefRes = validateFormatA([preface], { strict, fileName: `${label}(preface)` });
      for (const e of prefRes.errors) console.error(`  ERROR: ${e}`);
      for (const w of prefRes.warnings) console.warn(`  WARN:  ${w}`);
      totalErrors += prefRes.errors.length;
      totalWarnings += prefRes.warnings.length;
      totalLetters += 1;
    }

    // Validate the letter array
    const result = validateFormatA(letters, { strict, fileName: label });
    for (const e of result.errors) console.error(`  ERROR: ${e}`);
    for (const w of result.warnings) console.warn(`  WARN:  ${w}`);
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
    totalLetters += letters.length;

    const status = result.errors.length === 0 ? 'OK' : 'FAIL';
    console.log(`  ${label}: ${letters.length} letters${preface ? ' + preface' : ''} — ${status} (${result.errors.length} errors, ${result.warnings.length} warnings)`);
  }

  console.log(`\n=== TOTALS: ${totalLetters} letters validated, ${totalErrors} errors, ${totalWarnings} warnings ===`);

  if (strict && totalErrors > 0) {
    process.exit(1);
  }
}

// Run CLI when executed directly
const isMain = process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  runCli();
}
