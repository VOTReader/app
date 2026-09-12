// @ts-nocheck
/* A JS number interpolated raw into GLSL is a shader that compiles only while
 * the number happens to carry a fraction.
 * ═══════════════════════════════════════════════════════════════════════════
 * Measured by the Verifier through the real compiler (headless WebGL2, ANGLE,
 * a broken-shader control rejected in every arm): `FLYOVER_FLOOR = 0.35`
 * links; `= 1` emits `float flyFloor = 1;` and the vertex shader FAILS —
 * "ERROR: '=' : cannot convert from 'const int' to 'highp float'" — with every
 * unit test green, and `= 1.0` fails identically, because `String(1.0)` is
 * `'1'`. GLSL ES 3.00 has no int→float conversion, and the ruling on the
 * fly-over ("visibility must never decrease with zoom") is satisfiable only by
 * exactly that edit, so the realistic follow-up blanks the whole web.
 *
 * The same door stands open for FAN_FLOOR (0.25), APEX_LIFT (1.15) and
 * CEIL_SOFTNESS (1.9): tune any of them to a whole number and the shader is
 * gone. One helper formats the literal, and every interpolation in the two
 * GLSL templates routes through it — this file is what keeps that true.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as geo from './geometry.js';

/* Namespace import on purpose: a missing named export would fail the whole
   file at link time, and the RED wants a quotable assertion instead. */
const glslFloat = geo.glslFloat;

/* dirname(fileURLToPath(import.meta.url)), the house form: Vite rewrites
   `new URL('./x', import.meta.url)` into an asset URL, which is not file scheme. */
const SOURCE = fs.readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'geometry.js'), 'utf8');

/** The `${...}` expressions inside a template body that do NOT route through
 *  glslFloat. Pure, so the control below can prove it on a fixture. */
function rawSites(templateBody) {
  const out = [];
  for (const m of templateBody.matchAll(/\$\{([\s\S]*?)\}/g)) {
    if (!/^\s*glslFloat\(/.test(m[1])) out.push(m[1].trim());
  }
  return out;
}

/** Every `${...}` expression inside a template body, formatted or not. */
function allSites(templateBody) {
  return [...templateBody.matchAll(/\$\{([\s\S]*?)\}/g)].map((m) => m[1].trim());
}

/** Bare integer literals left in a GLSL string once every float literal
 *  (`1.`, `.5`, `0.35`, `1e-3`) is removed. Identifiers such as `x0` and
 *  `vec2` keep their digits because there is no word boundary inside them. */
function bareInts(glsl) {
  const stripped = glsl.replace(/\d+\.\d*(e[+-]?\d+)?|\.\d+(e[+-]?\d+)?|\d+e[+-]?\d+/gi, ' ');
  return stripped.match(/\b\d+\b/g) || [];
}

const TEMPLATES = ['threadShapeGLSL'];
function templateBody(name) {
  const m = SOURCE.match(new RegExp('export const ' + name + ' = `([\\s\\S]*?)`;'));
  if (!m) throw new Error('glsl-float.test: could not find the ' + name + ' template in geometry.js');
  return m[1];
}

describe('glslFloat — a JS number rendered as a GLSL float literal', () => {
  it('exists as an export of geometry.js', () => {
    expect(typeof glslFloat).toBe('function');
  });

  it('gives a whole number a fraction: 1 and 1.0 both become "1.0" — JS cannot tell them apart, which is the whole hazard', () => {
    expect(glslFloat(1)).toBe('1.0');
    expect(glslFloat(1.0)).toBe('1.0');
    expect(glslFloat(24)).toBe('24.0');
    expect(glslFloat(0)).toBe('0.0');
  });

  it('leaves a fractional number as it is', () => {
    expect(glslFloat(0.35)).toBe('0.35');
    expect(glslFloat(1.15)).toBe('1.15');
    expect(glslFloat(-0.5)).toBe('-0.5');
  });

  it('refuses a value that is not a number, rather than emitting "NaN" into a shader', () => {
    expect(() => glslFloat(NaN)).toThrow();
    expect(() => glslFloat(undefined)).toThrow();
    expect(() => glslFloat(Infinity)).toThrow();
  });
});

describe('every constant interpolated into the GLSL templates routes through glslFloat', () => {
  it('control: the site finder sees a raw interpolation and passes a formatted one', () => {
    // Plain strings, so the ${ is text and not an interpolation of THIS file.
    expect(rawSites('float flyFloor = ${FLYOVER_FLOOR};')).toEqual(['FLYOVER_FLOOR']);
    expect(rawSites('float flyFloor = ${glslFloat(FLYOVER_FLOOR)};')).toEqual([]);
    expect(rawSites('float k = ${FAN_FLOOR} + ${1 - FAN_FLOOR}*x;')).toEqual(['FAN_FLOOR', '1 - FAN_FLOOR']);
  });

  it('has no raw interpolation in threadShapeGLSL — THIS is the case with teeth today', () => {
    for (const name of TEMPLATES) {
      expect({ template: name, raw: rawSites(templateBody(name)) }).toEqual({ template: name, raw: [] });
    }
  });

  it('is not reading an empty region: the constant the shader template inlines is seen as a site, twice', () => {
    // The true law interpolates ONE constant (SPLIT_MARGIN, at the two sites
    // where the split strip lifts its bridge above the frame); the six the
    // morph and the fly-over law carried went with them.
    const sites = TEMPLATES.flatMap((name) => allSites(templateBody(name)).map((s) => s.replace(/^glslFloat\(|\)$/g, '').trim()));
    expect(sites).toEqual(['SPLIT_MARGIN', 'SPLIT_MARGIN']);
  });
});

describe('the emitted GLSL carries no bare integer literal', () => {
  it('control: the stripper keeps a bare 1 and eats 2., 1e-3, .5 and the digit in x0', () => {
    expect(bareInts('float f = 1; float g = 2.; float h = 1e-3; float i = .5; vec2 x0;')).toEqual(['1']);
  });

  it('threadShapeGLSL: none — and this one CAN fail today: SPLIT_MARGIN is the whole number 2, so a raw `${SPLIT_MARGIN}` would emit `2*hw`', () => {
    expect(geo.SPLIT_MARGIN).toBe(2);
    expect(bareInts(geo.threadShapeGLSL)).toEqual([]);
    expect(geo.threadShapeGLSL).toContain('2.0*hw');
  });
});
