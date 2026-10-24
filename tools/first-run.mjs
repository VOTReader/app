/* first-run — the one way a walk gets from a fresh profile's About pages to Home.
   ─────────────────────────────────────────────────────────────────────────────
   First run is: About (one or more Continue pages) → Begin Reading → since n114 (52553a0c7, 2026-10-23)
   Volume One, Letter 1 "Chosen by God", with the tour offer over it → the letter's top-bar Home → Home.
   Every walk that starts from a fresh profile calls throughFirstRun(page), so the next change to that
   path is one edit here instead of fifteen.

   `page` needs only evaluate(fn, ...args) (puppeteer's Page, or e2e-tour-device's CDP shim).
   `press(label)` clicks the button whose aria-label or text starts with `label`; the default is a DOM
   click, and a walk that must touch for real (adb taps on the device) passes its own.
   declineTourOffer(page) presses the offer's Later (named "Maybe later") when it is up.
   throughFirstRun returns where Begin Reading landed: 'letter' (then Home was pressed) or 'home' (an older build). */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** True when a visible button's aria-label or text starts with `label`. */
const hasButton = (page, label) => page.evaluate((l) => [...document.querySelectorAll('button,[role=button]')]
  .some((b) => (b.getAttribute('aria-label') || b.textContent || '').trim().replace(/\s+/g, ' ').startsWith(l)
    && b.getBoundingClientRect().width > 0), label);

/** The default press: a DOM click on the first visible match. Throws when there is none. */
async function domPress(page, label) {
  const hit = await page.evaluate((l) => {
    const b = [...document.querySelectorAll('button,[role=button]')]
      .find((x) => (x.getAttribute('aria-label') || x.textContent || '').trim().replace(/\s+/g, ' ').startsWith(l)
        && x.getBoundingClientRect().width > 0);
    if (b) /** @type {HTMLElement} */ (b).click();
    return !!b;
  }, label);
  if (!hit) throw new Error(`first-run: no "${label}" button to press`);
}

/**
 * @param {{ evaluate: (fn: any, ...args: any[]) => Promise<any> }} page
 * @param {{ press?: (label: string) => Promise<void>, timeoutMs?: number }} [opts]
 * @returns {Promise<'letter' | 'home'>}
 */
export async function throughFirstRun(page, opts = {}) {
  const press = opts.press || ((label) => domPress(page, label));
  const deadline = Date.now() + (opts.timeoutMs || 30000);
  const until = async (what, test) => {
    for (;;) {
      const v = await test();
      if (v) return v;
      if (Date.now() > deadline) throw new Error(`first-run: timed out waiting for ${what}`);
      await sleep(250);
    }
  };
  // About: Continue through its pages until Begin Reading shows (About can render a beat after #root).
  await until('Begin Reading', async () => {
    if (await hasButton(page, 'Begin Reading')) return true;
    if (await hasButton(page, 'Continue')) { await press('Continue'); await sleep(400); }
    return false;
  });
  await press('Begin Reading');
  // Begin Reading opens the first letter; its top bar's Home goes on to Home.
  const landed = await until('the first letter or Home', () => page.evaluate(() => (document.querySelector('.home-nav-item') ? 'home'
    : document.querySelector('.letter-para') && document.querySelector('button[aria-label="Home"]') ? 'letter' : null)));
  if (landed === 'letter') {
    await press('Home');
    await until('Home', () => page.evaluate(() => !!document.querySelector('.home-nav-item')));
  }
  return landed;
}

/** Decline the tour offer if it is up ("Later" on screen, named "Maybe later"); true when it was. */
export function declineTourOffer(page) {
  return page.evaluate(() => {
    const b = [...document.querySelectorAll('.tour-prompt button, button')]
      .find((x) => /^Maybe later$/.test((x.getAttribute('aria-label') || x.textContent || '').trim()));
    if (b) /** @type {HTMLElement} */ (b).click();
    return !!b;
  });
}
