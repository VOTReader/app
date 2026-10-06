#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   tools/semantic-units.mjs — the passages the meaning search embeds (path to
   500, step 1, 2026-10-05)
   ═══════════════════════════════════════════════════════════════════════
   A reader who remembers what a passage SAYS, not its words, is found by the
   on-device model (src/search/semantic.js) comparing the query with every
   passage's vector. A passage ("unit") is one verse, or three sentences of any
   other text (stride two, so each sentence sits in two units), or a title.
   Each unit names its document by unitKey (stable across index builds and
   translations) and where it starts in the document's indexed text, so a hit
   the meaning found lands on that passage.

   Usage:  node tools/semantic-units.mjs <out.json>   (units for tools/build-semantic.py)
           node tools/semantic-units.mjs --check      (exit 1 when the shipped pack's units are stale)
   ═══════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { docs as buildDocs, unitKey, ASSETS } from './search-bench/corpus.mjs';

/** Sentence spans of a text, the way the units cut it: on sentence ends and the ✦ separator. */
function sentenceSpans(text) {
  const out = [];
  const re = /[^.!?;✦]+[.!?;]*["”’)]*/g;
  let m;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const s = raw.trim();
    if (s.split(/\s+/).length >= 3) out.push({ start: m.index + lead, end: m.index + lead + s.length });
  }
  return out;
}

export async function semanticUnits() {
  const D = await buildDocs();
  const keys = [];
  const keyIdx = new Map();
  const units = [];
  for (const d of D) {
    const k = unitKey(d);
    if (keyIdx.has(k)) continue; // one vector set per unit; a second doc of the same unit shares it
    keyIdx.set(k, keys.length);
    keys.push(k);
    const ki = keyIdx.get(k);
    const text = String(d.text || '');
    if (!text.trim()) continue;
    if (d.kind === 'verse') { units.push({ k: ki, s: 0, t: text.replace(/\s+/g, ' ').trim() }); continue; }
    const sp = sentenceSpans(text);
    if (!sp.length) units.push({ k: ki, s: 0, t: text.slice(0, 600).replace(/\s+/g, ' ').trim() });
    for (let i = 0; i < sp.length; i += 2) {
      const last = sp[Math.min(i + 2, sp.length - 1)];
      units.push({ k: ki, s: sp[i].start, t: text.slice(sp[i].start, last.end).replace(/\s+/g, ' ').trim() });
    }
    if (d.title) units.push({ k: ki, s: -1, t: String(d.title) });
  }
  return { keys, units };
}

/** What the pack was built from: its keys, unit starts and texts. A change in any means the vectors are stale. */
export function fingerprint({ keys, units }) {
  const h = crypto.createHash('sha256');
  h.update(keys.join('\n'));
  for (const u of units) h.update(`\n${u.k}|${u.s}|${u.t}`);
  return h.digest('hex').slice(0, 16);
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const arg = process.argv[2];
  const set = await semanticUnits();
  const fp = fingerprint(set);
  if (arg === '--check') {
    const man = JSON.parse(fs.readFileSync(path.join(ASSETS, 'semantic/manifest.json'), 'utf8'));
    if (man.fingerprint !== fp) {
      console.error(`semantic pack is stale: built from ${man.fingerprint}, the corpus now gives ${fp}. Run: node tools/semantic-units.mjs units.json && python tools/build-semantic.py units.json`);
      process.exit(1);
    }
    console.log(`semantic pack current (${fp}, ${set.units.length} units)`);
  } else if (arg) {
    fs.writeFileSync(arg, JSON.stringify({ fingerprint: fp, ...set }));
    console.log(`${set.units.length} units over ${set.keys.length} documents (${fp}) -> ${arg}`);
  } else {
    console.error('usage: node tools/semantic-units.mjs <out.json> | --check');
    process.exit(2);
  }
}
