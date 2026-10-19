// @ts-nocheck — reads the corpus files the way the app's own gates do
/* answers-meta — the Answers sidecars (src/data/answers-meta.js, ANSWERS_META, c72), held to the text.

   tools/fetch-answers.py records what the site shows beyond the words (links, bare links, notes,
   underline / callout ranges, refMeta, attributions, sections, media) BESIDE each paragraph, never
   inside it: the paragraph text gains no markup, so highlights keyed on it stay where they are.
   Every sidecar names a place in a paragraph by a UTF-16 offset (what String.prototype indexes),
   and most also carry the words there, so a stale or misplaced offset is caught here, not on screen. */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const ctx = {};
runInNewContext(readFileSync(resolve(DATA, 'answers.js'), 'utf8'), ctx);
runInNewContext(readFileSync(resolve(DATA, 'answers-meta.js'), 'utf8'), ctx);
const A = ctx.ANSWERS, M = ctx.ANSWERS_META, SITE = ctx.ANSWERS_SITE_META;

const occ = (s, t, at) => { let c = 0, i = s.indexOf(t); while (i >= 0 && i < at) { c++; i = s.indexOf(t, i + 1); } return c; };
const each = (fn) => { for (const e of A) fn(e, M[e.id] || {}, e.paragraphs); };

describe('ANSWERS_META', () => {
  it('has one entry per Answers entry, and no other', () => {
    expect(Object.keys(M).sort()).toEqual(A.map((e) => e.id).sort());
  });

  it('a link names the words it sits on, at its offset, with their occurrence index', () => {
    let n = 0;
    each((e, m, P) => {
      for (const [k, items] of Object.entries(m.links || {})) for (const it of items) {
        n++;
        const t = P[k].text;
        expect(t.substr(it.at, it.text.length), `${e.id}:${k}`).toBe(it.text);
        expect(occ(t, it.text, it.at), `${e.id}:${k} occ`).toBe(it.occ);
        // 'contents' is the Main Page's "See left column for all topics" (the site's sidebar).
        expect(['topic', 'letter', 'study', 'search', 'external', 'scripture', 'contents'], `${e.id}:${k} kind`).toContain(it.kind);
      }
    });
    expect(n).toBe(710);   // c72: 556 topic + 85 letter + 26 study + 28 external + 10 search + 4 scripture + 1 contents
  });

  it('a bare link and a note sit after the 24 characters they say they follow', () => {
    each((e, m, P) => {
      for (const [k, items] of Object.entries(m.bareLinks || {})) for (const it of items) {
        const t = P[k].text;
        expect(it.at, `${e.id}:${k}`).toBeLessThanOrEqual(t.length);
        expect(t.slice(Math.max(0, it.at - 24), it.at), `${e.id}:${k}`).toBe(it.after);
      }
      for (const [k, items] of Object.entries(m.notes || {})) for (const it of items) {
        const t = P[k].text;
        expect(t.substr(it.at, it.marker.length), `${e.id}:${k}`).toBe(it.marker);
        expect(t.slice(Math.max(0, it.at - 24), it.at), `${e.id}:${k}`).toBe(it.after);
        if (it.note != null) expect(it.note > Number(k) && it.note < P.length, `${e.id}:${k} note`).toBe(true);
      }
    });
  });

  it('every mark range lies inside its paragraph', () => {
    each((e, m, P) => {
      for (const [k, mk] of Object.entries(m.marks || {})) {
        const L = P[k].text.length;
        for (const key of ['u', 'big', 'small']) for (const r of (mk[key] || [])) {
          expect(r[0] >= 0 && r[1] > 0 && r[0] + r[1] <= L, `${e.id}:${k} ${key} ${r}`).toBe(true);
        }
        if (mk.indent != null) expect(mk.indent, `${e.id}:${k} indent`).toBeGreaterThanOrEqual(1);
      }
    });
  });

  it('refMeta names a {{ref:}} the paragraph has, and never NKJV (the default)', () => {
    each((e, m, P) => {
      for (const [k, items] of Object.entries(m.refMeta || {})) {
        const refs = (P[k].text.match(/\{\{ref:[^}]*\}\}/g) || []).length;
        for (const it of items) {
          expect(it.i >= 0 && it.i < refs, `${e.id}:${k} i=${it.i} of ${refs}`).toBe(true);
          expect(it.version, `${e.id}:${k}`).not.toBe('NKJV');
          expect(typeof it.siteUrl).toBe('string');
        }
      }
    });
  });

  it('an attribution sidecar sits on a paragraph, a section on its heading', () => {
    each((e, m, P) => {
      for (const k of Object.keys(m.attr || {})) expect(P[k], `${e.id}:${k}`).toBeTruthy();
      for (const s of (m.sections || [])) {
        expect(s.at >= 0 && s.at <= P.length, `${e.id} section at ${s.at}`).toBe(true);
        if (!s.synthetic) expect(P[s.at].text, `${e.id}:${s.at}`).toBe('**' + s.title.replace(/_/g, '‗') + '**');
      }
      for (const md of (m.media || [])) {
        if (typeof md.at === 'number') expect(md.at >= -1 && md.at < P.length, `${e.id} media at ${md.at}`).toBe(true);
      }
    });
  });

  /* aogcg 1b: the decorations ride BESIDE the words. Every sidecar keyed by paragraph names one
     the entry has, and the paragraph text carries none of the site's markup, so a highlight keyed
     on wtlb:<id>:<index> and its text offsets stays where the reader put it. */
  it('every paragraph-keyed sidecar names a paragraph the entry has', () => {
    let keys = 0;
    each((e, m, P) => {
      for (const field of ['links', 'bareLinks', 'marks', 'notes', 'refMeta', 'attr']) {
        for (const k of Object.keys(m[field] || {})) {
          keys++;
          const i = Number(k);
          expect(Number.isInteger(i) && String(i) === k && i >= 0 && i < P.length, `${e.id} ${field}[${k}] of ${P.length}`).toBe(true);
        }
      }
    });
    expect(keys).toBeGreaterThan(0);
  });

  it('every bare link and note\'s `after` words occur in its paragraph', () => {
    each((e, m, P) => {
      for (const field of ['bareLinks', 'notes']) for (const [k, items] of Object.entries(m[field] || {})) {
        for (const it of items) expect(P[k].text.includes(it.after), `${e.id} ${field}[${k}] ${JSON.stringify(it.after)}`).toBe(true);
      }
    });
  });

  it('no paragraph text carries the site\'s markup (it lives in the sidecars)', () => {
    const MARKUP = ['<u>', '<u ', '</u>', '<sup', '<span', '<font', '<big', '<small', '<a ', '<br', '[[', ']]', '&nbsp;', '&amp;'];
    each((e, m, P) => {
      P.forEach((p, i) => {
        const hit = MARKUP.find((t) => String(p.text || '').includes(t));
        expect(hit, `${e.id}:${i}`).toBeUndefined();
      });
    });
  });

  it('the site chrome rides beside the corpus', () => {
    expect(SITE.sidebar.length).toBe(24);
    expect(SITE.sisterSites.length).toBe(9);
    expect(SITE.endCard).toBe('This ends Answers Only God Can Give - Topics');
  });

  it('every image sidecar names a vendored file the service worker precaches', () => {
    const ASSETS = resolve(DATA, '..', '..');
    const sw = readFileSync(resolve(ASSETS, 'service-worker.js'), 'utf8');
    const imgs = Object.entries(M).flatMap(([id, m]) => (m.media || []).filter((x) => x.kind === 'image').map((x) => [id, x]));
    expect(imgs.map(([id, x]) => `${id}@${x.at}`)).toEqual([
      'regarding-the-holy-days-of-god@198', 'regarding-the-holy-days-of-god@199',
      'regarding-the-holidays-of-men@148', 'answers-main-page@-1',
    ]);
    for (const [id, x] of imgs) {
      expect(existsSync(resolve(ASSETS, x.src)), `${id} ${x.src}`).toBe(true);
      expect(sw.includes(`'./${x.src}'`), `${x.src} in CORE_ASSETS`).toBe(true);
    }
  });
});
