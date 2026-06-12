// Audit helper (Format B): dump WTLB One/Two + The Blessed entries to normalized
// JSON for HTML↔app comparison. One-shot tool.
import { readFileSync, writeFileSync } from 'fs';
import vm from 'vm';

const dataDir = 'app/src/main/assets/src/data';
const FILES = { 'wtlb-one': 'WTLB One', 'wtlb-two': 'WTLB Two', 'the-blessed': 'The Blessed' };

function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

// Strip Format-B inline markup to comparable prose; collect the markup targets.
function analyze(paragraphs) {
  const texts = [], refs = [], navs = [], attribs = [];
  for (const p of (paragraphs || [])) {
    const t = p && typeof p.text === 'string' ? p.text : '';
    for (const m of t.matchAll(/\{\{ref:([^}]+)\}\}/g)) refs.push(m[1].trim());
    for (const m of t.matchAll(/\{\{nav:([^}]+)\}\}/g)) navs.push(m[1].trim());
    for (const m of t.matchAll(/~\s*\[From\s+([^\]]+)\]/g)) attribs.push(norm(m[1]));
    let prose = t
      .replace(/\{\{ref:[^}]+\}\}/g, ' ')
      .replace(/\{\{nav:[^}]+\}\}/g, ' ')
      .replace(/~\s*\[From[^\]]+\]/g, ' ')
      .replace(/\*\*/g, '').replace(/_/g, '')
      .replace(/†/g, ' ');
    texts.push(prose);
  }
  const body = norm(texts.join(' '));
  return { body, words: body ? body.split(' ').length : 0, refs, navs, attribs };
}

const out = {};
for (const [file, label] of Object.entries(FILES)) {
  const src = readFileSync(`${dataDir}/${file}.js`, 'utf-8');
  const ctx = { window: {}, globalThis: {}, console };
  vm.createContext(ctx);
  try { vm.runInContext(src, ctx); } catch (e) { console.error(`[${file}] EVAL ERROR: ${e.message}`); continue; }
  const entries = [];
  for (const k of Object.keys(ctx)) {
    const v = ctx[k];
    if (Array.isArray(v) && v.length && v[0] && v[0].id && v[0].paragraphs) {
      for (const E of v) {
        if (!E || !E.paragraphs) continue;
        const a = analyze(E.paragraphs);
        entries.push({
          id: E.id, num: E.num, title: norm(E.title),
          paraCount: E.paragraphs.length,
          bodyText: a.body, bodyWords: a.words,
          bodyHead: a.body.split(' ').slice(0, 12).join(' '),
          bodyTail: a.body.split(' ').slice(-12).join(' '),
          refs: a.refs, navs: a.navs, attribs: a.attribs,
          scripturesKeys: E.scriptures ? Object.keys(E.scriptures) : [],
          prev: E.prevEntry ? E.prevEntry.id : null, next: E.nextEntry ? E.nextEntry.id : null,
        });
      }
    }
  }
  out[label] = entries;
}

writeFileSync('tools/_audit-fmtb-app.json', JSON.stringify(out));
console.log('Dumped Format B app data:');
for (const [label, arr] of Object.entries(out)) console.log(`  ${label}: ${arr.length} entries`);
