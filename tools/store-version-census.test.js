/* arch-5 (audit 2026-11-23): about two dozen components subscribed to a cross-bundle store or a lazy corpus by
   hand, each a copy of hooks/use-store-version.js's useStoreVersionByName:

     React.useSyncExternalStore(
       React.useCallback((cb) => (typeof X !== 'undefined' ? X.subscribe(cb) : () => {}), []),
       () => (typeof X !== 'undefined' ? X.getVersion() : 0));

   They now call useStoreVersionByName('X'). This census keeps a new hand copy from coming back. It matches only
   that exact guarded-by-name shape (bare name or window.__name); a store held in a variable or prop, or a snapshot
   other than getVersion, is a different hook and is left alone. */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'src', 'main', 'assets', 'src');

/** @param {string} dir @returns {string[]} */
function sources(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === 'vendor' || n === 'data' ? [] : sources(p);
    return /\.(js|jsx)$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}

/** The text of each React.useSyncExternalStore(...) call in a source. @param {string} t */
function calls(t) {
  const out = [];
  let i = 0;
  while ((i = t.indexOf('React.useSyncExternalStore(', i)) >= 0) {
    let j = t.indexOf('(', i);
    let depth = 0;
    for (; j < t.length; j++) {
      if (t[j] === '(') depth++;
      else if (t[j] === ')' && --depth === 0) break;
    }
    out.push(t.slice(i, j + 1));
    i = j + 1;
  }
  return out;
}

const NAME = "((?:window\\.)?[\\w$]+)";
const HAND_COPY = new RegExp("^React\\.useSyncExternalStoreReact\\.useCallback(?:function)?(\\w+)(?:=>)?\\{?(?:return)?typeof" + NAME
  + "!=='undefined'\\?\\2\\.subscribe\\1:(?:=>\\{\\}|function\\{\\});?\\}?,\\[\\],(?:function)?(?:=>)?\\{?(?:return)?typeof\\2!=='undefined'\\?\\2\\.getVersion:0;?\\}?,?$");

/** @param {string} call */
const isHandCopy = (call) => HAND_COPY.test(call.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '').replace(/[()]/g, ''));

describe('arch-5: no hand copy of useStoreVersionByName', () => {
  it('the matcher knows the shape, in both arrow and function form, and nothing looser', () => {
    expect(isHandCopy("React.useSyncExternalStore(\n React.useCallback((cb) => (typeof NoteStore !== 'undefined') ? NoteStore.subscribe(cb) : () => {}, []),\n () => (typeof NoteStore !== 'undefined') ? NoteStore.getVersion() : 0\n)")).toBe(true);
    expect(isHandCopy("React.useSyncExternalStore(React.useCallback(function(cb) { return (typeof JournalIndexStore !== 'undefined') ? JournalIndexStore.subscribe(cb) : function() {}; }, []), function() { return (typeof JournalIndexStore !== 'undefined') ? JournalIndexStore.getVersion() : 0; })")).toBe(true);
    expect(isHandCopy("React.useSyncExternalStore(React.useCallback((cb) => (typeof window.__votCorpus !== 'undefined' ? window.__votCorpus.subscribe(cb) : () => {}), []), () => (typeof window.__votCorpus !== 'undefined' ? window.__votCorpus.getVersion() : 0))")).toBe(true);
    // a store held in a prop re-subscribes on change: not this shape
    expect(isHandCopy("React.useSyncExternalStore(React.useCallback((cb) => (cat ? cat.subscribe(cb) : () => {}), [cat]), () => (cat ? cat.getVersion() : 0))")).toBe(false);
    // a different snapshot is a different hook
    expect(isHandCopy("React.useSyncExternalStore(React.useCallback((cb) => (typeof X !== 'undefined' ? X.subscribe(cb) : () => {}), []), () => (typeof X !== 'undefined' ? X.getShape() : 0))")).toBe(false);
  });

  it('src/ holds none outside a file that imports the store under that name', () => {
    const found = [];
    for (const f of sources(SRC)) {
      const t = readFileSync(f, 'utf-8');
      for (const c of calls(t)) {
        if (!isHandCopy(c)) continue;
        // dom-journal-chip imports JournalIndexStore as a module binding, which the by-name hook would not see.
        const name = c.match(/typeof\s+(?:window\.)?([\w$]+)/)[1];
        if (new RegExp('import\\s*\\{[^}]*\\b' + name + '\\b').test(t)) continue;
        found.push(relative(SRC, f).replace(/\\/g, '/') + ': ' + name);
      }
    }
    expect(found, 'use useStoreVersionByName(name) from hooks/use-store-version.js').toEqual([]);
  });
});
