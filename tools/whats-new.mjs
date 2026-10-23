/**
 * What's new — the reader-facing changes behind an update, in plain words (up1, 2026-10-23).
 *
 * Corbin, 10-23: "VOTReader has been flashing 'VOTReader was just updated' at me all day long." The site now publishes
 * twice a day (tools/release-window.mjs), and the app says "Updated · What's new" at most once per release, opening a
 * plain list of what changed for the reader (utils/update-toast.js, WhatsNewSheet). This builds that list:
 *
 *   - from feat and fix commits only: chore, ci, test, docs, refactor, style, build and the like are left out, and so
 *     are feat/fix commits whose scope is internal (ci, build, deps, tools, test, e2e, gate, lint, types, docs) and the
 *     follow-up rounds a reviewer asked for;
 *   - in plain words: the subject without its "type(scope):" head, without the lane's work id ("up1 - ", "ds5 B3 - ")
 *     and without a trailing id in brackets ("(mw18 C9)");
 *   - a commit may say it better itself: a body line `What's new: <words>` replaces its subject (one line each, any
 *     number), and `What's new: none` keeps it out.
 *
 * Output: { generated, since, items: [{ t, text }] }, newest first, at most MAX_ITEMS. `t` is the commit time (epoch
 * ms); the app shows the items newer than the last ones it showed (or, the first time, newer than `since`).
 *
 * Usage:
 *   Deploy (deploy-web.yml's build job): REPO=owner/name GH_TOKEN=... BASE=<live sha> HEAD=<sha> \
 *     node tools/whats-new.mjs --compare --prev <live whats-new.json or nothing> --out _site/whats-new.json
 *     (the commits GitHub's compare lists between what is live and what is about to be, added to what the live file
 *     already lists; a failure keeps the live file's items and never fails the deploy)
 *   APK (app/build.gradle.kts, every build): node tools/whats-new.mjs --git --out <generated assets>/whats-new.json
 *     (the newest commits of the local history; the app shows those newer than the build the phone had)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const MAX_ITEMS = 100;
const KEEP_TYPES = new Set(['feat', 'fix']);
const INTERNAL_SCOPES = new Set(['ci', 'build', 'deps', 'tools', 'tool', 'test', 'tests', 'e2e', 'gate', 'gates', 'lint',
  'types', 'typecheck', 'docs', 'dev', 'swarm', 'bench', 'coverage']);

/**
 * The plain-words lines one commit message gives the reader (none, one, or its own `What's new:` lines).
 * @param {string} message the whole commit message
 * @returns {string[]}
 */
export function linesOf(message) {
  const text = String(message || '').replace(/\r\n/g, '\n');
  const own = [...text.matchAll(/^What's new:\s*(.+?)\s*$/gim)].map((m) => m[1]);
  if (own.some((l) => /^none\.?$/i.test(l))) return [];
  if (own.length) return own.map(sentence).filter(Boolean);
  const subject = text.split('\n')[0].trim();
  const m = /^([a-z]+)(?:\(([^)]*)\))?!?:\s*(.+)$/.exec(subject);
  if (!m || !KEEP_TYPES.has(m[1])) return [];
  const scopes = (m[2] || '').split(/[,/]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (scopes.length && scopes.every((s) => INTERNAL_SCOPES.has(s))) return [];
  let words = m[3];
  if (/\brefuter\b|\breview round\b/i.test(words)) return [];   // the follow-up a reviewer asked for, not news
  words = stripIds(words);
  const s = sentence(words);
  return s ? [s] : [];
}

/** The subject without the lane's work id at its head or a bracketed id at its end. @param {string} s */
export function stripIds(s) {
  let out = s.trim();
  // "up1 - ", "ds5 B3 - ", "mw18 C8/C9/C11 - ", "rp-s1 - ", "Wave 3 batch B3 - ": a short head holding a digit, then " - "
  const cut = out.indexOf(' - ');
  if (cut > 0 && cut <= 28 && /\d/.test(out.slice(0, cut))) out = out.slice(cut + 3);
  // "... (mw18 C9)", "... (call 4A)", "... (sweep W14)": a trailing bracket that holds an id
  out = out.replace(/\s*\((?=[^()]*\d)[^()]{1,30}\)\s*$/, '');
  return out.trim();
}

/** Capitalised, one line, ending in a full stop. @param {string} s */
function sentence(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim().replace(/[.;:,\s]+$/, '');
  if (!t) return '';
  return t[0].toUpperCase() + t.slice(1) + '.';
}

/**
 * The items for a list of commits, newest first, the same words once.
 * @param {{ t: number, message: string }[]} commits any order
 * @param {{ t: number, text: string }[]} [prev] items already published
 */
export function buildItems(commits, prev = []) {
  /** @type {{ t: number, text: string }[]} */
  const fresh = [];
  for (const c of commits) for (const text of linesOf(c.message)) fresh.push({ t: Number(c.t) || 0, text });
  const all = [...fresh, ...(Array.isArray(prev) ? prev : [])].filter((i) => i && typeof i.text === 'string' && Number.isFinite(i.t));
  all.sort((a, b) => b.t - a.t);
  const seen = new Set();
  const out = [];
  for (const i of all) {
    const k = i.text.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ t: i.t, text: i.text });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

async function compareCommits(repo, base, head, token) {
  const res = await fetch(`https://api.github.com/repos/${repo}/compare/${base}...${head}`, {
    headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}), 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (!res.ok) throw new Error(`compare ${base}...${head}: HTTP ${res.status}`);
  const d = await res.json();
  const commits = (d.commits || []).map((c) => ({ t: Date.parse(c.commit.committer.date), message: c.commit.message }));
  const since = d.base_commit ? Date.parse(d.base_commit.commit.committer.date) : null;
  return { commits, since };
}

function gitCommits(n) {
  const out = execFileSync('git', ['log', `-n${n}`, '--format=%ct%x1f%B%x1e'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\x1e').map((r) => r.trim()).filter(Boolean).map((r) => {
    const [ct, ...rest] = r.split('\x1f');
    return { t: Number(ct) * 1000, message: rest.join('\x1f') };
  });
}

function readJson(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch (_e) { return null; }
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  const out = arg('--out');
  if (!out) { console.error('usage: whats-new.mjs (--compare | --git) [--prev file] --out file'); process.exit(2); }
  const prev = readJson(arg('--prev') || '') || {};
  const prevItems = Array.isArray(prev.items) ? prev.items : [];
  /** @type {{ generated: string, since: number | null, items: { t: number, text: string }[] }} */
  let doc;
  try {
    if (args.includes('--git')) {
      doc = { generated: new Date().toISOString(), since: null, items: buildItems(gitCommits(300)) };
    } else {
      const { REPO, GH_TOKEN, BASE, HEAD } = process.env;
      if (!REPO || !HEAD) throw new Error('REPO and HEAD are needed');
      const { commits, since } = BASE ? await compareCommits(REPO, BASE, HEAD, GH_TOKEN) : { commits: [], since: null };
      doc = { generated: new Date().toISOString(), since, items: buildItems(commits, prevItems) };
    }
  } catch (e) {
    // Never fail a deploy or a build over the notes: keep what was there (the app then shows nothing new).
    console.error('whats-new: ' + ((e && e.message) || e) + ' - keeping the previous items');
    doc = { generated: new Date().toISOString(), since: Number(prev.since) || null, items: prevItems.slice(0, MAX_ITEMS) };
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(doc) + '\n');
  console.error(`whats-new: ${doc.items.length} item(s) -> ${out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();
