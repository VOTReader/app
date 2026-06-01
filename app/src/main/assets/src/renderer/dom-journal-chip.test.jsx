// @ts-nocheck — tests stub JournalIndexStore + COLLECTIONS globals
/* dom-journal-chip — the JournalChip component + pure refKey builders. */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import {
  JournalChip, jrnRefKeyForLetter, jrnRefKeyForChapter,
  jrnRefKeyForBookmark, jrnRefKeyForLetterByLabel,
} from './dom-journal-chip.jsx';
import { COLLECTIONS } from '../data/scripture-resolution.js';

describe('jrnRefKey builders', () => {
  it('jrnRefKeyForLetter', () => {
    expect(jrnRefKeyForLetter('one', 'wide-path')).toBe('letter:one/wide-path');
    expect(jrnRefKeyForLetter('', 'x')).toBeNull();
    expect(jrnRefKeyForLetter('one', '')).toBeNull();
  });
  it('jrnRefKeyForChapter (chapter 0 is valid)', () => {
    expect(jrnRefKeyForChapter('genesis', 1)).toBe('chapter:genesis:1');
    expect(jrnRefKeyForChapter('genesis', 0)).toBe('chapter:genesis:0');
    expect(jrnRefKeyForChapter('', 1)).toBeNull();
    expect(jrnRefKeyForChapter('genesis', null)).toBeNull();
  });
  it('jrnRefKeyForBookmark', () => {
    expect(jrnRefKeyForBookmark('bkm1')).toBe('bookmark:bkm1');
    expect(jrnRefKeyForBookmark('')).toBeNull();
  });

  describe('jrnRefKeyForLetterByLabel', () => {
    afterEach(() => { delete window.COLLECTIONS; });
    it('resolves a volume label to its volKey-based refKey', () => {
      window.COLLECTIONS = COLLECTIONS;
      expect(jrnRefKeyForLetterByLabel('Volume Two', 'foo')).toBe('letter:two/foo');
    });
    it('returns null for an unknown label or missing args', () => {
      window.COLLECTIONS = COLLECTIONS;
      expect(jrnRefKeyForLetterByLabel('No Such Volume', 'foo')).toBeNull();
      expect(jrnRefKeyForLetterByLabel('', 'foo')).toBeNull();
    });
    it('returns null when COLLECTIONS is unavailable', () => {
      expect(jrnRefKeyForLetterByLabel('Volume Two', 'foo')).toBeNull();
    });
  });
});

describe('JournalChip', () => {
  afterEach(() => {
    cleanup();
    delete window.JournalIndexStore;
  });

  const stubStore = (ids) => {
    window.JournalIndexStore = {
      entriesReferencing: () => ids,
      subscribe: () => () => {},
      getVersion: () => 0,
    };
  };

  it('renders null when there is no refKey', () => {
    stubStore(['j1']);
    const { container } = render(<JournalChip refKey={null} />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders null when no entries reference the key', () => {
    stubStore([]);
    const { container } = render(<JournalChip refKey="chapter:genesis:1" />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders a chip with the entry count when references exist', () => {
    stubStore(['j1', 'j2']);
    const { container } = render(<JournalChip refKey="chapter:genesis:1" />);
    const btn = container.querySelector('button.jrn-inbound-chip');
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('title')).toBe('2 journal entries');
    expect(container.querySelector('.jrn-inbound-chip-badge').textContent).toBe('2');
  });

  it('uses the singular noun for one entry', () => {
    stubStore(['j1']);
    const { container } = render(<JournalChip refKey="chapter:genesis:1" />);
    expect(container.querySelector('button').getAttribute('title')).toBe('1 journal entry');
  });

  it('fires onClick with the refKey + label', () => {
    stubStore(['j1']);
    let clicked = null;
    const { container } = render(<JournalChip refKey="chapter:genesis:1" label="Genesis 1" onClick={(k, l) => { clicked = { k, l }; }} />);
    container.querySelector('button').dispatchEvent(new window.Event('click', { bubbles: true }));
    expect(clicked).toEqual({ k: 'chapter:genesis:1', l: 'Genesis 1' });
  });
});
