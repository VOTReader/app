// node render.mjs [name ...]  -> renders/<name>-dark.png and -light.png from screens/<name>.html
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const names = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync('screens').filter(f => f.endsWith('.html') && !f.startsWith('_')).map(f => f.replace('.html', ''));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
for (const n of names) {
  const html = fs.readFileSync(`screens/${n}.html`, 'utf8');
  const land = /<body[^>]*class="[^"]*landscape/.test(html);
  const size = (html.match(/<body[^>]*data-size="(\d+)x(\d+)"/) || []).slice(1).map(Number);
  const themes = /data-themes="dark"/.test(html) ? ['dark'] : ['dark', 'light'];
  for (const t of themes) {
    const ctx = await browser.newContext({ viewport: size.length ? { width: size[0], height: size[1] } : land ? { width: 915, height: 412 } : { width: 412, height: 915 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(`http://127.0.0.1:8095/docs/design/2026-09-mockups/html/screens/${n}.html?theme=${t}`);
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 8000 }).catch(() => errs.push('sprite not ready'));
    await page.waitForFunction(() => !document.querySelector('canvas') || document.documentElement.dataset.drawn === '1', null, { timeout: 20000 }).catch(() => errs.push('canvas not drawn'));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `renders/${n}-${t}.png` });
    console.log('rendered', n, t, errs.length ? 'ERRORS: ' + errs.join(' | ') : '');
    await ctx.close();
  }
}
await browser.close();
