/* The stats dashboard: one phone-sized HTML page, server-rendered from the rollups.
   Numbers only, from the tables rollup() fills; no script, no external request. */

import { isoWeek } from '../../app/src/main/assets/src/utils/usage-schema.js';

const DAY = 86400000;
const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const weekOf = (day) => isoWeek(new Date(day + 'T12:00:00Z'));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Horizontal bars: rows of [label, value]. */
function bars(rows, { unit = '' } = {}) {
  if (!rows.length) return '<p class="none">Nothing yet.</p>';
  const max = Math.max(...rows.map((r) => r[1]), 1);
  return `<table class="bars">${rows.map(([label, v]) => `<tr><th>${esc(label)}</th><td><span style="width:${Math.max(2, Math.round((v / max) * 100))}%"></span></td><td class="n">${fmt(v)}${unit}</td></tr>`).join('')}</table>`;
}

/** Group [{k, v}] sums by k, sorted by value, top n. */
function top(rows, n) {
  const sum = new Map();
  for (const r of rows) sum.set(r.k, (sum.get(r.k) || 0) + r.v);
  return [...sum.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

export async function renderDash(db, now = Date.now()) {
  const since30 = utcDay(now - 29 * DAY);
  const since70 = utcDay(now - 69 * DAY);
  const since7 = utcDay(now - 6 * DAY);
  const since6m = utcDay(now - 183 * DAY);

  const act = (await db.prepare('SELECT day, plat, ver, d, w, m, first FROM actives WHERE day >= ?1').bind(since6m).all()).results;
  const met = (await db.prepare('SELECT day, name, key, plat, value FROM metrics WHERE day >= ?1').bind(since30).all()).results;
  const coh = (await db.prepare('SELECT day, iw, w FROM cohorts WHERE day >= ?1').bind(since70).all()).results;
  const rej = (await db.prepare('SELECT reason, SUM(n) AS n FROM rejects WHERE day >= ?1 GROUP BY reason ORDER BY n DESC').bind(since30).all()).results;

  // Active readers. d = first use that day, w = first that ISO week, m = first that month.
  const dau = new Map();
  const wau = new Map();
  const mau = new Map();
  const installs = new Map();
  for (const r of act) {
    if (r.day >= since30) dau.set(r.day, (dau.get(r.day) || 0) + r.d);
    if (r.day >= since70) {
      wau.set(weekOf(r.day), (wau.get(weekOf(r.day)) || 0) + r.w);
      installs.set(weekOf(r.day), (installs.get(weekOf(r.day)) || 0) + r.first);
    }
    mau.set(r.day.slice(0, 7), (mau.get(r.day.slice(0, 7)) || 0) + r.m);
  }
  const days = [];
  for (let t = now - 29 * DAY; t <= now; t += DAY) days.push(utcDay(t));
  const dauRows = days.map((d) => [d.slice(5), dau.get(d) || 0]);
  const today = dau.get(utcDay(now)) || 0;
  const wk = weekOf(utcDay(now));
  const mo = utcDay(now).slice(0, 7);

  const plat7 = top(act.filter((r) => r.day >= since7).map((r) => ({ k: r.plat, v: r.d })), 3);
  const ver7 = top(act.filter((r) => r.day >= since7).map((r) => ({ k: r.ver || '?', v: r.d })), 8);

  const m = (name) => met.filter((r) => r.name === name).map((r) => ({ k: r.key || '(all)', v: r.value }));
  const total = (name) => met.filter((r) => r.name === name).reduce((s, r) => s + r.value, 0);
  const listenMin = top(m('listen_s'), 12).map(([k, v]) => [k, v / 60]);

  // Retention: of the devices whose install week is X, how many were active in each later week.
  const cohort = new Map();
  for (const r of coh) {
    const row = cohort.get(r.iw) || new Map();
    row.set(weekOf(r.day), (row.get(weekOf(r.day)) || 0) + r.w);
    cohort.set(r.iw, row);
  }
  const weeks = [...new Set(coh.map((r) => weekOf(r.day)))].sort();
  const cohortRows = [...cohort.keys()].sort().slice(-8).map((iw) => {
    const row = cohort.get(iw);
    return `<tr><th>${esc(iw)}</th>${weeks.map((w) => `<td>${w < iw ? '' : fmt(row.get(w) || 0)}</td>`).join('')}</tr>`;
  });

  const zero = total('search_zero');
  const searches = total('search');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>VOTReader stats</title>
<style>
:root{--bg:#fbf8f2;--fg:#231f1a;--mute:#6f675c;--bar:#b8893b;--line:#e4dccd}
@media (prefers-color-scheme:dark){:root{--bg:#141210;--fg:#efe8dc;--mute:#a39a8c;--bar:#d6a655;--line:#2d2822}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif}
main{max-width:640px;margin:0 auto;padding:16px}
h1{font-size:20px;margin:4px 0 12px}h2{font-size:15px;margin:22px 0 6px;color:var(--mute);text-transform:uppercase;letter-spacing:.04em}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.kpi{border:1px solid var(--line);border-radius:10px;padding:10px}
.kpi b{display:block;font-size:24px}.kpi span{color:var(--mute);font-size:12px}
table{width:100%;border-collapse:collapse}th{font-weight:500;text-align:left;white-space:nowrap;padding:2px 8px 2px 0;max-width:46vw;overflow:hidden;text-overflow:ellipsis}
.bars td{padding:2px 0}.bars td:nth-child(2){width:55%}.bars span{display:block;height:10px;border-radius:3px;background:var(--bar)}
.n{text-align:right;padding-left:8px;font-variant-numeric:tabular-nums}.none,.note{color:var(--mute);font-size:13px}
.coh td{text-align:center;font-variant-numeric:tabular-nums;border-top:1px solid var(--line)}.scroll{overflow-x:auto}
</style></head><body><main>
<h1>VOTReader usage</h1>
<div class="kpis">
<div class="kpi"><b>${fmt(today)}</b><span>readers today</span></div>
<div class="kpi"><b>${fmt(wau.get(wk) || 0)}</b><span>this week (${esc(wk)})</span></div>
<div class="kpi"><b>${fmt(mau.get(mo) || 0)}</b><span>this month</span></div>
</div>
<h2>Readers per day (30 days)</h2>${bars(dauRows)}
<h2>Readers per week</h2>${bars([...wau.entries()].sort().slice(-10))}
<h2>New installs per week</h2>${bars([...installs.entries()].sort().slice(-10))}
<h2>Platform (7 days, reader-days)</h2>${bars(plat7)}
<h2>Versions (7 days)</h2>${bars(ver7)}
<h2>Most opened (30 days)</h2>${bars(top(m('open'), 20))}
<h2>Read to the end (30 days)</h2>${bars(top(m('read_done'), 12))}
<h2>Minutes listened (30 days)</h2>${bars(listenMin, { unit: ' min' })}
<h2>Audio errors (30 days)</h2>${bars(top(m('audio_err'), 10))}
<h2>Played while hidden without the media service (30 days)</h2>${bars(top(m('audio_hidden'), 6))}
<p class="note">Each count is a playback that went on with the screen off or the app hidden while Android's media service was not running - the silent-skip bug's condition. Seconds: ${fmt(total('audio_hidden_s'))}.</p>
<h2>Search (30 days)</h2><p>${fmt(searches)} searches, ${fmt(zero)} with no results${searches ? ` (${Math.round((zero / searches) * 100)} %)` : ''}. The words searched are never sent.</p>
<h2>Features (30 days)</h2>${bars(top(m('feat'), 16))}
<h2>Install prompt (30 days)</h2>${bars(top(m('install'), 6))}
<h2>Errors by kind (30 days)</h2>${bars(top(m('err'), 10))}
<h2>Cold start (30 days)</h2>${bars(top(m('boot'), 4))}
<h2>Retention by install week</h2><div class="scroll"><table class="coh"><tr><th></th>${weeks.map((w) => `<td>${esc(w.slice(5))}</td>`).join('')}</tr>${cohortRows.join('') || '<tr><td class="none">Nothing yet.</td></tr>'}</table></div>
<h2>Data honesty (30 days)</h2>${bars(rej.map((r) => [r.reason, r.n]))}
<p class="note">No device id and no IP are kept, so these are estimates: a reinstall or cleared app data counts as a new install; the app and the website on one phone count as two readers; one person with two phones counts twice. Readers who turned sharing off are not here. Refused batches and resends ("duplicate", ignored) are listed above.</p>
<p class="note">Updated ${esc(new Date(now).toISOString().slice(0, 16).replace('T', ' '))} UTC.</p>
</main></body></html>`;
}
