// @ts-nocheck — reads the shipped bible-rvr.js and index.html as text
/* The Reina-Valera 1960 as shipped (es1, 2026-10-14; tools/regen-rvr.js).
   validate-schemas owns the verse set (every KJV-reference verse, no extra, no
   blank). This file pins what that gate cannot see: the registry row the loader
   accepts, the two verses the RVR1960 splits and the KJV numbering joins, and
   the source flaws the import had to beat - the bolls.life copy's old typos and
   inline markup, and a YouVersion scrape that lost the space at every poetry
   line break ("unidosContra"). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const RVR = vm.runInNewContext(readFileSync(resolve(here, 'bible-rvr.js'), 'utf8') + '\n;BIBLE_RVR');
const verse = (book, ch, n) => (RVR[book][String(ch)].find((v) => v.n === n) || {}).text;

describe('RVR1960 registry row', () => {
  const html = readFileSync(resolve(here, '../../index.html'), 'utf8');
  const row = (html.match(/\{ id: 'rvr',[^\n]*\}/) || [])[0] || '';
  it('is in TRANSLATION_OPTIONS with an id the loader accepts, a Spanish lang and a Spanish name', () => {
    expect(row).not.toBe('');
    expect('rvr').toMatch(/^[a-z]{2,8}$/);                // translations.js loadTranslation's guard
    expect(row).toContain("label: 'RVR1960'");
    expect(row).toContain("lang: 'es'");
    expect(row).toContain("desc: 'Reina-Valera 1960 (Español) — ");  // translationName = the part before " — "
  });
});

describe('bible-rvr.js text', () => {
  it('reads the verses a reader checks first', () => {
    expect(verse('john', 3, 16)).toBe('Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito, para que todo aquel que en él cree, no se pierda, mas tenga vida eterna.');
    expect(verse('psalms', 23, 1)).toBe('Jehová es mi pastor; nada me faltará.');
    expect(verse('matthew-plain', 1, 1)).toMatch(/^Libro de la genealogía de Jesucristo, hijo de David, hijo de Abraham\.$/);
    expect(RVR.matthew).toBeUndefined();                 // 'matthew' is the Study Bible; the chapter nav is matthew-plain
  });
  it('joins the two verses the RVR1960 splits into the verse the KJV numbering keeps them in', () => {
    expect(verse('psalms', 47, 9)).toMatch(/Abraham; Porque de Dios son los escudos de la tierra; Él es muy exaltado\.$/);
    expect(verse('psalms', 47, 10)).toBeUndefined();
    expect(verse('3john', 1, 14)).toMatch(/cara a cara\. La paz sea contigo\./);
    expect(verse('3john', 1, 15)).toBeUndefined();
  });
  it('carries the publisher\'s text, not the old typos of the bolls.life copy', () => {
    expect(verse('genesis', 11, 2)).toContain('se establecieron allí');   // bolls: "estabecieron"
    expect(verse('2kings', 6, 23)).toContain('a su señor');               // bolls: "seÑor"
    expect(verse('2chronicles', 31, 14)).toContain('el levita Coré');     // bolls: "levitaCoré"
    expect(verse('habakkuk', 3, 17)).toContain('Y los labrados no den mantenimiento');  // bolls: "labrados 2 no den"
  });
  it('keeps Selah and leaves Psalm titles and footnotes out', () => {
    expect(verse('psalms', 3, 2)).toBe('Muchos son los que dicen de mí: No hay para él salvación en Dios. Selah');
    expect(verse('psalms', 3, 1)).toMatch(/^¡Oh Jehová, cuánto se han multiplicado mis adversarios!/);
  });
  it('has no markup, stray marks, doubled punctuation or lost line-break spaces anywhere', () => {
    const bad = [];
    for (const [book, chapters] of Object.entries(RVR)) {
      for (const [ch, verses] of Object.entries(chapters)) {
        for (const v of verses) {
          const t = v.text;
          if (/[<>=|\\[\]{}*_#@~^`\d]/.test(t)              // markup, footnote numbers
            || /[a-záéíóúüñ][A-ZÁÉÍÓÚÑ]/.test(t)            // "unidosContra": a poetry line glued on
            || /\s{2}|^\s|\s$/.test(t)
            || / [,;:.!?)]/.test(t)                         // "Jerusalén ."
            || /([,;:])\1/.test(t)) bad.push(`${book} ${ch}:${v.n} ${t.slice(0, 80)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
