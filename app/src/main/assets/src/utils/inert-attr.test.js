/* inertAttr — the `inert` attribute in the form the shipped React 18 writes.
   React 18 drops inert={true} with a warning, so the boolean form is
   inert="" via a spread object; off is no attribute at all. */
import { describe, it, expect } from 'vitest';
import { inertAttr } from './inert-attr.js';

describe('inertAttr', () => {
  it('returns { inert: "" } when on', () => {
    expect(inertAttr(true)).toEqual({ inert: '' });
  });

  it('returns {} when off', () => {
    expect(inertAttr(false)).toEqual({});
  });

  it('follows truthiness, not strict true', () => {
    expect(inertAttr(/** @type {any} */ (1))).toEqual({ inert: '' });
    expect(inertAttr(/** @type {any} */ ('x'))).toEqual({ inert: '' });
    expect(inertAttr(/** @type {any} */ (0))).toEqual({});
    expect(inertAttr(/** @type {any} */ (''))).toEqual({});
    expect(inertAttr(/** @type {any} */ (null))).toEqual({});
    expect(inertAttr(/** @type {any} */ (undefined))).toEqual({});
  });

  it('returns a fresh object every call', () => {
    const first = inertAttr(true);
    first.inert = 'tampered';
    expect(inertAttr(true)).toEqual({ inert: '' });
    expect(Object.keys(inertAttr(false))).toEqual([]);
  });

  it('the on object carries only the inert key', () => {
    expect(Object.keys(inertAttr(true))).toEqual(['inert']);
  });
});
