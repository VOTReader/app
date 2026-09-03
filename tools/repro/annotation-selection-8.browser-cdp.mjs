// Verifier probe (annotation-selection-8), CDP variant: puppeteer's
// mouse.click({clickCount}) did not synthesize a multi-click selection in
// headless Chrome, so drive Input.dispatchMouseEvent directly with the
// clickCount Chrome uses for word (2) and paragraph (3) selection.
//
//   node tools/repro/annotation-selection-8.browser-cdp.mjs
import puppeteer from 'puppeteer';

const HTML = `<!doctype html><meta charset="utf-8">
<style>body{font:18px/1.5 serif;padding:24px;width:360px}</style>
<div class="letter-body">
  <p data-hl-key="letter:a:0" id="p0">In the beginning <em>God</em> created the heaven<span class="fn-ref">1</span> and the earth.</p>
  <p data-hl-key="letter:a:1" id="p1">And the earth was without form, and void.</p>
</div>`;

function describeRange() {
  const s = window.getSelection();
  if (!s || s.rangeCount === 0) return { rangeCount: 0 };
  const r = s.getRangeAt(0);
  const d = (n) => (n.nodeType === 3
    ? '#text(' + JSON.stringify(n.data.slice(0, 18)) + ')'
    : n.nodeName + (n.id ? '#' + n.id : '') + '[' + n.childNodes.length + ' children]');
  return { text: r.toString(), start: d(r.startContainer), startOffset: r.startOffset, end: d(r.endContainer), endOffset: r.endOffset, collapsed: r.collapsed };
}

const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(HTML);
  const cdp = await page.createCDPSession();
  const multiClick = async (x, y, count) => {
    for (let n = 1; n <= count; n++) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: n });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: n });
    }
  };
  const out = {};
  const b0 = await (await page.$('#p0')).boundingBox();
  await multiClick(b0.x + 40, b0.y + 10, 3);
  out.tripleClickFirstParagraph = await page.evaluate(describeRange);
  const b1 = await (await page.$('#p1')).boundingBox();
  await multiClick(b1.x + 40, b1.y + 10, 3);
  out.tripleClickLastParagraph = await page.evaluate(describeRange);
  const be = await (await page.$('#p0 em')).boundingBox();
  await multiClick(be.x + be.width / 2, be.y + be.height / 2, 2);
  out.doubleClickInsideEm = await page.evaluate(describeRange);
  const bf = await (await page.$('#p0 .fn-ref')).boundingBox();
  await multiClick(bf.x + bf.width / 2, bf.y + bf.height / 2, 2);
  out.doubleClickOnFnRef = await page.evaluate(describeRange);
  for (const k in out) {
    const v = out[k];
    console.log(k, '| text:', JSON.stringify(v.text), '| start:', v.start, v.startOffset, '| end:', v.end, v.endOffset, '| collapsed:', v.collapsed);
  }
} finally {
  await browser.close();
}
