/* tools/split-lazy-css.mjs (n7-08): which rules leave the render-blocking sheet, and why the cascade cannot change.
   The classifier (esbuild metafiles + the source scan) is stubbed: `lazy` maps a class to its lazy bundle, and
   `apart` lists class pairs never named together. */
import { describe, it, expect } from 'vitest';
import { splitCss, specificity, parseCss } from './split-lazy-css.mjs';

const split = (css, lazy, apart = []) => splitCss(
  css,
  (c) => lazy[c] || null,
  (x, y) => x === y || !apart.some(([a, b]) => (a === x && b === y) || (a === y && b === x)),
);

describe('split-lazy-css -- what moves', () => {
  it('a rule only a lazy bundle names moves to that bundle\'s sheet, in order, with its @media around it', () => {
    const css = '.a{color:red}.x{color:blue}@media(max-width:360px){.a{margin:0}.x{margin:1px}}.y{padding:0}';
    const out = split(css, { x: 'h', y: 'g' });
    expect(out.eager).toBe('.a{color:red}@media(max-width:360px){.a{margin:0}}');
    expect(out.lazy.h).toBe('.x{color:blue}@media(max-width:360px){.x{margin:1px}}');
    expect(out.lazy.g).toBe('.y{padding:0}');
    expect(out.lazy.e).toBe('');
    expect(out.moved).toEqual({ e: 0, f: 0, g: 1, h: 2 });
  });

  it('@font-face, @keyframes and comments stay in the boot sheet', () => {
    const css = '@font-face{font-family:X;src:url(x.woff2)}@keyframes spin{to{transform:rotate(1turn)}}.x{animation:spin 1s}';
    const out = split(css, { x: 'f' });
    expect(out.eager).toBe('@font-face{font-family:X;src:url(x.woff2)}@keyframes spin{to{transform:rotate(1turn)}}');
    expect(out.lazy.f).toBe('.x{animation:spin 1s}');
  });

  it('every alternative must name a lazy class of one bundle; :not() never counts', () => {
    expect(split('.x,.a{color:red}', { x: 'h' }).moved.h).toBe(0);
    expect(split('.x,.y{color:red}', { x: 'h', y: 'h' }).moved.h).toBe(1);
    expect(split('.x,.y{color:red}', { x: 'h', y: 'g' }).eager).toBe('.x,.y{color:red}');
    expect(split('.a:not(.x){color:red}', { x: 'h' }).moved.h).toBe(0);
    expect(split('body.light .x .a{color:red}', { x: 'h' }).moved.h).toBe(1);
  });

  it('a brace inside a string does not end the rule', () => {
    const out = split('.x:before{content:"}{"}.a{color:red}', { x: 'e' });
    expect(out.lazy.e).toBe('.x:before{content:"}{"}');
    expect(out.eager).toBe('.a{color:red}');
  });
});

describe('split-lazy-css -- the cascade stays as it was', () => {
  it('stays when a LATER boot rule of the same specificity sets the same property on what may be the same element', () => {
    expect(split('.x{color:red}.a{color:blue}', { x: 'h' }).moved.h).toBe(0);
  });

  it('moves when that later rule can never style the same box', () => {
    expect(split('.x{color:red}.a{color:blue}', { x: 'h' }, [['x', 'a']]).moved.h).toBe(1);              // never named together
    expect(split('.x:before{color:red}.a{color:blue}', { x: 'h' }).moved.h).toBe(1);                         // another box
    expect(split('.x span{color:red}.a p{color:blue}', { x: 'h' }, [['x', 'a']]).moved.h).toBe(1);          // another element
    expect(split('.x{color:red}.a.b{color:blue}', { x: 'h' }).moved.h).toBe(1);                              // it wins anyway
    expect(split('.x{color:red}.a{padding:0}', { x: 'h' }).moved.h).toBe(1);                                 // another property
  });

  it('an EARLIER boot rule never holds a rule back (it lost to it before and still does)', () => {
    expect(split('.a{color:blue}.x{color:red}', { x: 'h' }).moved.h).toBe(1);
  });

  it('shorthands and longhands, and properties that reset each other, count as one', () => {
    for (const [mine, later] of [['margin-left:0', 'margin:1px'], ['line-height:1', 'font:12px x'], ['top:0', 'inset:0'],
      ['row-gap:0', 'gap:1px'], ['align-items:start', 'place-items:end'], ['-webkit-mask:none', 'mask-image:none'], ['width:1px', 'inline-size:2px']]) {
      expect(split('.x{' + mine + '}.a{' + later + '}', { x: 'h' }).moved.h, mine + ' / ' + later).toBe(0);
    }
    expect(split('.x{--k:1}.a{--j:2}', { x: 'h' }).moved.h).toBe(1);
    expect(split('.x{--k:1}.a{--k:2}', { x: 'h' }).moved.h).toBe(0);
  });

  it('a later rule of ANOTHER lazy sheet holds it back (the sheets land in any order); one of its own does not', () => {
    expect(split('.x{color:red}.y{color:blue}', { x: 'h', y: 'g' }).moved).toEqual({ e: 0, f: 0, g: 1, h: 0 });
    expect(split('.x{color:red}.y{color:blue}', { x: 'h', y: 'h' }).moved.h).toBe(2);
  });

  it('decides from the last rule back: a later rule of its own sheet that had to stay holds it back too', () => {
    // .y must stay (the boot rule .a after it); then .x, overridable by .y, must stay as well.
    const out = split('.x{color:red}.y{color:blue}.a{color:green}', { x: 'h', y: 'h' });
    expect(out.moved.h).toBe(0);
    expect(out.eager).toBe('.x{color:red}.y{color:blue}.a{color:green}');
  });

  it('no byte is lost: the boot sheet plus the lazy sheets hold every rule once', () => {
    const css = '.a{color:red}.x{color:blue}@media(min-width:1px){.x{margin:0}.a{margin:0}}.y{padding:0}';
    const out = split(css, { x: 'h', y: 'e' }, [['x', 'a']]);
    const rules = (s) => parseCss(s).flatMap((n) => (n.kids ? n.kids : [n])).map((n) => n.rule + '{' + n.body + '}');
    expect([...rules(out.eager), ...Object.values(out.lazy).flatMap(rules)].sort()).toEqual(rules(css).sort());
  });
});

describe('split-lazy-css -- specificity', () => {
  it('counts ids, classes/attributes/pseudo-classes and elements/pseudo-elements as Selectors 4 does', () => {
    expect(specificity('.a')).toBe(1000);
    expect(specificity('body.light .a>span')).toBe(2002);
    expect(specificity('#x .a:hover::before')).toBe(1002001);
    expect(specificity('.a:not(.b,#c)')).toBe(1001000);
    expect(specificity('.a:where(.b .c)')).toBe(1000);
    expect(specificity('.a:is(.b,.c .d)')).toBe(3000);
    expect(specificity('button[disabled]:first-child')).toBe(2001);
    expect(specificity('.x:before')).toBe(1001);
    expect(specificity('*')).toBe(0);
  });
});
