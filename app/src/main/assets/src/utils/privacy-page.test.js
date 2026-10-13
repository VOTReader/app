// @ts-nocheck -- reads privacy.html from disk with node APIs
// The privacy page says what reaches a host and when (sweep mw12): it said recordings and songs are fetched
// 'when you open them', but a letter page loads the song list and its songs' covers (Show songs on letter
// pages, on by default), and on the website opening a letter fetches the start of its recording (prewarm).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../privacy.html'), 'utf-8');
const section = (/<h2>Recordings, songs and pictures<\/h2>\s*<p>([\s\S]*?)<\/p>/.exec(html) || [])[1] || '';

describe('privacy.html: recordings, songs and pictures', () => {
  it('names what a letter page loads before anything is opened, and how to turn the songs off', () => {
    expect(section).toMatch(/Letter pages also load the list of songs and the covers of a letter's songs from votreader\.github\.io/);
    expect(section).toMatch(/Show songs on letter pages/);
  });
  it('says the website fetches the start of a letter\'s recording when the letter opens', () => {
    expect(section).toMatch(/on the website, opening a letter fetches the start of its recording/);
  });
});
