// Verifier probe (annotation-selection-8): what Range does a REAL Chrome
// triple-click produce over a reading paragraph? The SelectionToolbar's
// computeOffset walks SHOW_TEXT nodes only, so an ELEMENT boundary falls
// through to `charPos + offset` (out of range). This prints the boundary
// shapes Chrome actually hands the page, so the unit RED mirrors reality.
//
//   node tools/repro/annotation-selection-8.browser.mjs
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
  const d = (n) => ({
    nodeType: n.nodeType,
    name: n.nodeType === 3 ? '#text(' + JSON.stringify(n.data.slice(0, 20)) + ')' : n.nodeName + (n.id ? '#' + n.id : ''),
    childCount: n.childNodes.length,
  });
  return {
    text: r.toString(),
    start: d(r.startContainer), startOffset: r.startOffset,
    end: d(r.endContainer), endOffset: r.endOffset,
    isCollapsed: r.collapsed,
  };
}

const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(HTML);
  const out = {};
  // Triple-click mid-paragraph — the everyday "select this paragraph" gesture.
  const p0 = await page.$('#p0');
  const box = await p0.boundingBox();
  await page.mouse.click(box.x + 40, box.y + 10, { clickCount: 3 });
  out.tripleClickMid = await page.evaluate(describeRange);
  // Triple-click on the LAST paragraph (no following block to spill into).
  const p1 = await page.$('#p1');
  const b1 = await p1.boundingBox();
  await page.mouse.click(b1.x + 40, b1.y + 10, { clickCount: 3 });
  out.tripleClickLast = await page.evaluate(describeRange);
  // Double-click on the word inside <em> — a boundary on an inline edge.
  const em = await page.$('#p0 em');
  const be = await em.boundingBox();
  await page.mouse.click(be.x + be.width / 2, be.y + be.height / 2, { clickCount: 2 });
  out.doubleClickEm = await page.evaluate(describeRange);
  // Drag from the first word across the <em> to the end of the fn-ref sup.
  await page.mouse.move(box.x + 2, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height - 4, { steps: 8 });
  await page.mouse.up();
  out.dragToEnd = await page.evaluate(describeRange);
  console.log(JSON.stringify(out, null, 2));
} finally {
  await browser.close();
}
