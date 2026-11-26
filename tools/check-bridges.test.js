/* check-bridges + kt-events-check (heart-7 + arch-10, audit 2026-11-23).
   Each case builds a throwaway repo mirror (BRIDGES.md, a page source, a Kotlin JsEvent file) and runs the
   real check on it, so both directions of drift are pinned, then the real tree is checked last. */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkBridges } from './check-bridges.mjs';
import { checkKtEvents } from './kt-events-check.mjs';
import { stripComments, jsBridgeSetters } from './bridge-scan.mjs';

const roots = [];
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });

/** 20 filler bridges, so the non-vacuity floors (20 setters, 20 entries, 10 JsEvents) are met. */
const FILL = Array.from({ length: 20 }, (_, i) => '__fill' + i);
const EVENTS = Array.from({ length: 10 }, (_, i) => '__ev' + i);

function mirror({ md = null, page = '', kt = '', extraEntries = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'vot-bridges-'));
  roots.push(root);
  const src = join(root, 'app', 'src', 'main', 'assets', 'src', 'utils');
  mkdirSync(src, { recursive: true });
  const java = join(root, 'app', 'src', 'main', 'java', 'x');
  mkdirSync(java, { recursive: true });
  const fillSet = [...FILL, ...EVENTS].map((n) => `window.${n} = () => {};`).join('\n');
  writeFileSync(join(src, 'bridges.js'), fillSet + '\n' + page);
  const ev = EVENTS.map((n, i) => `    data object E${i} : JsEvent("${n}")`).join('\n');
  writeFileSync(join(java, 'JsEvent.kt'), `sealed class JsEvent(val fn: String) {\n${ev}\n${kt}\n}\n`);
  const entries = [...FILL, ...EVENTS, ...extraEntries]
    .map((n) => `### \`${n}\`\n- **Setter:** \`src/utils/bridges.js\`\n`).join('\n');
  writeFileSync(join(root, 'BRIDGES.md'), md == null ? '# Bridges\n\n' + entries : md);
  return root;
}

describe('bridge-scan', () => {
  it('reads window, globalThis, JSDoc-cast and aliased setters, never == or comments', () => {
    const root = mirror({ page: [
      '/** @type {any} */ (window).__cast = 1;',
      'g.__alias = 2;',
      '_g().__call = 3;',
      'if (window.__cmp == 1) {}',
      '// window.__commented = 4;',
      '/* window.__block = 5; */',
      "const u = 'https://x.y/'; window.__afterUrl = 6;",
      'this.__mine = 7;',
    ].join('\n') });
    const names = [...jsBridgeSetters(root).keys()];
    expect(names).toEqual(expect.arrayContaining(['__cast', '__alias', '__call', '__afterUrl']));
    for (const n of ['__cmp', '__commented', '__block', '__mine']) expect(names).not.toContain(n);
  });
  it('keeps line numbers when it blanks a block comment', () => {
    expect(stripComments('a\n/* x\ny */\nb').split('\n')).toHaveLength(4);
  });
});

describe('check-bridges', () => {
  it('passes a mirror in step', () => {
    expect(checkBridges(mirror())).toEqual([]);
  });
  it('fails on a bridge the page sets that BRIDGES.md does not list', () => {
    const issues = checkBridges(mirror({ page: 'window.__newOne = () => {};' }));
    expect(issues.join('\n')).toMatch(/__newOne is set at src\/utils\/bridges\.js:\d+ but BRIDGES\.md does not list it/);
  });
  it('fails on a page function Kotlin calls that BRIDGES.md does not list', () => {
    const issues = checkBridges(mirror({ kt: '    data object Late : JsEvent("__late")', page: 'window.__late = () => {};' }));
    expect(issues.join('\n')).toMatch(/__late is called by the Kotlin host/);
  });
  it('fails on an entry nothing sets or calls any more', () => {
    const issues = checkBridges(mirror({ extraEntries: ['__gone'] }));
    expect(issues.join('\n')).toMatch(/lists __gone, which nothing sets or calls any more/);
  });
  it('fails on a Setter line naming a file that does not exist', () => {
    const root = mirror();
    const md = '# Bridges\n\n' + [...FILL, ...EVENTS].map((n) => `### \`${n}\`\n- **Setter:** \`src/utils/bridges.js\`\n`).join('\n')
      + '\n### `__fill0`\n- **Setter:** `src/ui/screens/Old.js:12`\n';
    writeFileSync(join(root, 'BRIDGES.md'), md);
    expect(checkBridges(root).join('\n')).toMatch(/names src\/ui\/screens\/Old\.js, which does not exist/);
  });
  it('refuses to pass on a scan that finds next to nothing', () => {
    const root = mirror();
    writeFileSync(join(root, 'BRIDGES.md'), '# Bridges\n');
    expect(checkBridges(root).join('\n')).toMatch(/only 0 .*entries/);
  });
  it('the real tree: BRIDGES.md is in step with the code', () => {
    expect(checkBridges()).toEqual([]);
  });
});

describe('kt-events-check', () => {
  it('passes a mirror whose every JsEvent has a receiver', () => {
    expect(checkKtEvents(mirror(), {}).issues).toEqual([]);
  });
  it('fails on a JsEvent the page never defines (a silent no-op on the device)', () => {
    const { issues } = checkKtEvents(mirror({ kt: '    data object Lost : JsEvent("__lost")' }), {});
    expect(issues.join('\n')).toMatch(/__lost is called by the Kotlin host .* never defines it/);
  });
  it('hears a receiver named as a string (window[cbName] = …)', () => {
    const root = mirror({ kt: '    data object Cb : JsEvent("__cb")', page: "const cbName = '__cb'; window[cbName] = () => {};" });
    expect(checkKtEvents(root, {}).issues).toEqual([]);
  });
  it('a KNOWN_UNWIRED entry passes, and is reported once it turns live or leaves Kotlin', () => {
    const root = mirror({ kt: '    data object Old : JsEvent("__old")' });
    const r = checkKtEvents(root, { __old: 'reason', __left: 'reason' });
    expect(r.issues).toEqual([]);
    expect(r.notes.join('\n')).toMatch(/__left is no longer called by Kotlin/);
  });
  it('refuses to pass when it reads fewer than 10 JsEvents', () => {
    const root = mirror();
    writeFileSync(join(root, 'app', 'src', 'main', 'java', 'x', 'JsEvent.kt'), 'sealed class JsEvent(val fn: String)\n');
    expect(checkKtEvents(root, {}).issues.join('\n')).toMatch(/found only 0 JsEvent/);
  });
  it('the real tree: every page function the Kotlin host calls has a receiver', () => {
    expect(checkKtEvents().issues).toEqual([]);
  });
});
