import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { handle, sweep, traitKey, ORIGINS, RATE_PER_HOUR, WINDOW_MS } from '../src/index.js';
import { webcrypto } from 'node:crypto';

// the Worker runtime has Web Crypto; the hook's vmThreads pool (test:hook) does not
if (!globalThis.crypto || !globalThis.crypto.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

/** The slice of the D1 API the Worker uses, over node:sqlite. */
function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(join(process.cwd(), 'votes', 'schema.sql'), 'utf8'));
  const prep = (sql) => ({
    bind: (...a) => {
      const s = db.prepare(sql.replace(/\?(\d+)/g, (_, n) => `?${n}`));
      return {
        first: async () => s.get(...a) ?? null,
        all: async () => ({ results: s.all(...a) }),
        run: async () => { const r = s.run(...a); return { meta: { changes: Number(r.changes) } }; },
      };
    },
  });
  return { prepare: prep, raw: db };
}

const BASE = 'https://votes.votreader.workers.dev';
const NOW = Date.UTC(2026, 9, 23, 12);
const SONG = 'a1b2c3d4e5f6';
const PHONE = { w: 412, h: 915, dpr: 2.625, tz: 'America/Denver' };
let env;

const vote = (body, ip = '1.2.3.4', now = NOW) => handle(new Request(BASE + '/v1/vote', {
  method: 'POST', body: JSON.stringify(body),
  headers: { 'Content-Type': 'application/json', Origin: ORIGINS[0], 'CF-Connecting-IP': ip },
}), env, now);
const tallies = async (now = NOW) => (await (await handle(new Request(BASE + '/v1/tallies'), env, now)).json()).songs;
const like = (install, at = NOW, extra = {}) => vote({ install, song: SONG, v: 1, at, traits: PHONE, ...extra });

describe('song votes (sync sy4)', () => {
  beforeEach(() => { env = { DB: d1(), SALT: 'test-salt' }; });

  it('a like counts, and a clear takes it back', async () => {
    expect((await like('install-aaaaaaaaaaaa')).status).toBe(204);
    expect(await tallies()).toEqual({ [SONG]: [1, 1] });
    await vote({ install: 'install-aaaaaaaaaaaa', song: SONG, v: 0, at: NOW + 1000 });
    expect(await tallies()).toEqual({});
  });

  it('a retry or an older vote arriving late changes nothing', async () => {
    await like('install-aaaaaaaaaaaa', NOW);
    await like('install-aaaaaaaaaaaa', NOW);                      // the outbox resent it
    await vote({ install: 'install-aaaaaaaaaaaa', song: SONG, v: 0, at: NOW - 5000 });  // an older clear, late
    expect(await tallies()).toEqual({ [SONG]: [1, 1] });
  });

  it('two people on one network with different phones count twice', async () => {
    await like('install-aaaaaaaaaaaa');
    await like('install-bbbbbbbbbbbb', NOW + 1, { traits: { ...PHONE, w: 360, h: 800 } });
    expect((await tallies())[SONG][0]).toBe(2);
  });

  it('the same phone reinstalled counts once, whichever like arrives first', async () => {
    await like('install-aaaaaaaaaaaa', NOW);
    await like('install-bbbbbbbbbbbb', NOW + 60_000);
    expect((await tallies())[SONG][0]).toBe(1);
    env = { DB: d1(), SALT: 'test-salt' };
    await like('install-bbbbbbbbbbbb', NOW + 60_000);              // the newer like lands first
    await like('install-aaaaaaaaaaaa', NOW);                       // the older one late
    expect((await tallies())[SONG][0]).toBe(1);
  });

  it('a like older than 30 days is liked, not recent', async () => {
    await like('install-aaaaaaaaaaaa', NOW - WINDOW_MS - 1, {});
    // a vote dated in the past is accepted up to 90 days back (an outbox that waited)
    expect(await tallies()).toEqual({ [SONG]: [1, 0] });
  });

  it('refuses a malformed vote and never accepts a thumbs-down', async () => {
    for (const bad of [{ install: 'x', song: SONG, v: 1, at: NOW }, { install: 'install-aaaaaaaaaaaa', song: 'nope', v: 1, at: NOW },
      { install: 'install-aaaaaaaaaaaa', song: SONG, v: -1, at: NOW }, { install: 'install-aaaaaaaaaaaa', song: SONG, v: 1, at: NOW + 3600e3 }]) {
      expect((await vote(bad)).status).toBe(400);
    }
    expect(await tallies()).toEqual({});
  });

  it('rate-limits one address', async () => {
    for (let i = 0; i < RATE_PER_HOUR; i++) await vote({ install: 'install-aaaaaaaaaaaa', song: SONG, v: i % 2, at: NOW + i });
    expect((await vote({ install: 'install-aaaaaaaaaaaa', song: SONG, v: 1, at: NOW + 999 })).status).toBe(429);
    expect((await vote({ install: 'install-cccccccccccc', song: SONG, v: 1, at: NOW }, '5.6.7.8')).status).toBe(204);
  });

  it('keeps no raw address, and forgets the hashes after 30 days', async () => {
    await like('install-aaaaaaaaaaaa', NOW);
    const row = env.DB.raw.prepare('SELECT * FROM votes').get();
    expect(JSON.stringify(row)).not.toContain('1.2.3.4');
    await sweep(env, NOW + WINDOW_MS + 1);
    const after = env.DB.raw.prepare('SELECT iph, trh FROM votes').get();
    expect(after).toEqual({ iph: null, trh: null });
  });

  it('answers CORS for the reader only', async () => {
    const r = await vote({ install: 'install-aaaaaaaaaaaa', song: SONG, v: 1, at: NOW });
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGINS[0]);
    const other = await handle(new Request(BASE + '/v1/tallies', { headers: { Origin: 'https://evil.example' } }), env, NOW);
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('a trait key carries only the four coarse traits', () => {
    expect(traitKey({ w: 412, h: 915, dpr: 2.625, tz: 'America/Denver', ua: 'secret' })).toBe('412,915,2.63,America/Denver');
  });
});
