import { describe, it, expect, vi } from 'vitest';
import { relay, ALLOW_ORIGIN, UPSTREAM } from '../src/index.js';

const BASE = 'https://audio.votreader.workers.dev';
const ok = (status = 200, extra = {}) => vi.fn(async () => new Response('abc', {
  status, headers: { 'Content-Length': '3', 'Content-Type': 'application/octet-stream', 'Set-Cookie': 'x=1', ...extra },
}));

describe('offline-audio relay (cf1)', () => {
  it('relays a release mp3 with CORS for the reader only, as audio/mpeg', async () => {
    const f = ok();
    const r = await relay(new Request(BASE + '/audio-v1/abc123.mp3'), f);
    expect(f).toHaveBeenCalledWith(UPSTREAM + 'audio-v1/abc123.mp3', expect.objectContaining({ method: 'GET', redirect: 'follow' }));
    expect(r.status).toBe(200);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ALLOW_ORIGIN);
    expect(r.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(r.headers.get('Content-Length')).toBe('3');
    expect(r.headers.get('Set-Cookie')).toBeNull();
    expect(await r.text()).toBe('abc');
  });

  it('passes Range through and answers 206 with Content-Range', async () => {
    const f = ok(206, { 'Content-Range': 'bytes 0-2/99' });
    const r = await relay(new Request(BASE + '/audio-brm-v3/brm-kjv_jonah.mp3', { headers: { Range: 'bytes=0-2' } }), f);
    expect(f.mock.calls[0][1].headers).toEqual({ Range: 'bytes=0-2' });
    expect(r.status).toBe(206);
    expect(r.headers.get('Content-Range')).toBe('bytes 0-2/99');
  });

  it('HEAD carries the size and no body', async () => {
    const f = ok();
    const r = await relay(new Request(BASE + '/audio-v1/abc.mp3', { method: 'HEAD' }), f);
    expect(f.mock.calls[0][1].method).toBe('HEAD');
    expect(r.headers.get('Content-Length')).toBe('3');
    expect(r.body).toBeNull();
  });

  it('answers the CORS preflight', async () => {
    const r = await relay(new Request(BASE + '/audio-v1/abc.mp3', { method: 'OPTIONS' }), ok());
    expect(r.status).toBe(204);
    expect(r.headers.get('Access-Control-Allow-Headers')).toBe('Range');
  });

  it.each([
    '/', '/audio-v1/', '/audio-v1/x.wav', '/songs-v1/a.mp3', '/garden-standard/a.mp3', '/audio-v1/%2e%2e/x.mp3',
    '/audio-v1/a/b.mp3', '/audio-v1/.x.mp3', '/https://evil.example/a.mp3', '/audio-v1/abc.mp3?u=https://evil.example',
  ])('refuses %s (no open proxy)', async (path) => {
    const f = ok();
    const r = await relay(new Request(BASE + path), f);
    expect(r.status).toBe(404);
    expect(f).not.toHaveBeenCalled();
  });

  it('refuses other methods and multi-part ranges', async () => {
    const f = ok();
    expect((await relay(new Request(BASE + '/audio-v1/a.mp3', { method: 'POST', body: 'x' }), f)).status).toBe(405);
    expect((await relay(new Request(BASE + '/audio-v1/a.mp3', { headers: { Range: 'bytes=0-1,5-9' } }), f)).status).toBe(416);
    expect(f).not.toHaveBeenCalled();
  });

  it('a missing asset is a 404, an upstream failure a 502', async () => {
    expect((await relay(new Request(BASE + '/audio-v1/a.mp3'), ok(404))).status).toBe(404);
    expect((await relay(new Request(BASE + '/audio-v1/a.mp3'), ok(500))).status).toBe(502);
    expect((await relay(new Request(BASE + '/audio-v1/a.mp3'), vi.fn(async () => { throw new Error('down'); }))).status).toBe(502);
  });
});
