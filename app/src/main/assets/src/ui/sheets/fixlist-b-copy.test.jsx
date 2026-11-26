// @ts-nocheck
// The app map fix list's wording entries for the shell sheets (lane fix-ui-b, 2026-11-26): each reads the source line
// the reader sees, so the old words cannot come back.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = (f) => readFileSync(resolve(here, f), 'utf8');

describe('#22 Link to… hints name the chips the reader sees', () => {
  it('says Inside the text and Titles and references, never Full text or Titles & refs', () => {
    const s = src('LinkPicker.jsx').split('\n').filter((l) => l.includes('navpick-empty-hint')).join('\n');
    expect(s).not.toMatch(/Full text/);
    expect(s).not.toMatch(/Titles &amp; refs|Titles & refs/);
    expect(s).toMatch(/Inside the text/);
    expect(s).toMatch(/Titles and references/);
  });
});

describe('#26 Pin tab names the button the Tabs bar has', () => {
  it('says Close all, not Clear All', () => {
    const s = src('TabActionSheet.jsx');
    expect(s).not.toMatch(/Close other tabs and Clear All/);
    expect(s).toMatch(/Close other tabs and Close all/);
  });
});

describe('#23 empty Bookmarks: Start reading opens Letter 1 like Notes, Links, History and Highlights', () => {
  it('the bookmarks route hands the screen onStartReading', () => {
    const s = src('../screen-routes.jsx');
    const at = s.indexOf("'bookmarks-index': () => _kickVot(");
    const block = s.slice(at, s.indexOf('/>', at));
    expect(block).toMatch(/onStartReading=\{\(\) => _openFirstLetter\('Bookmarks'\)\}/);
  });
});

describe('#32 a link whose place is gone says why', () => {
  it('both Open paths in LinksScreen call sayPlaceGone when the end is missing', () => {
    const s = src('../screens/LinksScreen.jsx');
    expect(s).toMatch(/if \(!endpoint\) \{ sayPlaceGone\(\); return; \}/);
    expect(s).toMatch(/if \(!lnk\.target\) \{ sayPlaceGone\(\); return; \}/);
  });
});
describe("#53 'Couldn't copy' uses the shared title, body and button classes", () => {
  it('ui-sheet-title, ui-sheet-body, ui-btn', () => {
    const s = src('CopyFallbackSheet.jsx');
    expect(s).toMatch(/className="ui-sheet-title copy-fallback-title"/);
    expect(s).toMatch(/className="ui-sheet-body copy-fallback-help"/);
    expect(s).toMatch(/className="ui-btn is-primary copy-fallback-btn primary"/);
    expect(s).toMatch(/className="ui-btn copy-fallback-btn"/);
  });
});

describe('#54 the Safari warning uses the shared title, body and button classes', () => {
  it('ui-sheet-title, ui-sheet-body, ui-btn on both Safari cards', () => {
    const s = src('../components/SafariFlows.jsx');
    expect(s).not.toMatch(/className="sh-modal-title"/);
    expect(s).not.toMatch(/className="sh-modal-text"/);
    expect(s).not.toMatch(/className="sh-modal-btn /);
    expect(s).toMatch(/ui-btn is-primary sh-modal-btn/);
  });
});
