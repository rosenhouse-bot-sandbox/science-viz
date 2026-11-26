// Works every slider on every page with a finger, at an iPad size, as js/touch/slider.js should let it:
//  - the slider's row is at least 44px high, the page does not scroll or select text from it, and the knob is drawn
//    larger under a finger;
//  - a tap away from the knob takes hold at once (the slider shows `held` while the finger is down), glides there
//    without a jump and without going back, and ends where the finger was (on a Zoom line, the page's own flight);
//  - a finger put on the knob does not move it, and dragging it follows the finger, even with the finger wobbling up and
//    down and wandering off the row; the panel does not scroll;
//  - letting go sends one `change`;
//  - with reduced motion, a tap lands at once;
//  - a mouse press on the line still moves the knob there.
// And on every page, the home page too: two quick taps do not zoom the page, a long press does not select text, and
// no :hover look is left to stick after a tap (every :hover rule is inside @media (hover:hover)).
// Fails on any of those not holding, or on a console error.
//
//   node tests/touch/run.mjs [home rainbows vesicle optics graph maple engine shoulder saccade gears gearsmake] [--quick]
//   (--quick: only the first visible slider of each page). Needs Node 22 and Playwright, installed outside the repository.
//
// What it cannot see: these are Chromium's touches, not iPad Safari's. Safari's own slider grabs only on the knob and
// Chromium's does not, so a pass here says that our handling works, not that Safari leaves it alone. Try a real iPad.
import { findChromium, serve, SOFT_GL } from '../lib/serve.mjs';
import { covers, chosen } from '../lib/pages.mjs';

const { server, base } = await serve({ host: '127.0.0.1' });   // 127.0.0.1, not localhost: js/pwa.js skips the service worker on localhost only, and the worker is not wanted here either way

const PAGES = {
  home: { url: '', ready: () => !!document.querySelector('nav a'), noSliders: true },
  rainbows: { url: 'rainbows/?debug=1', ready: () => !!window.__rainbows && !window.__rainbows.busy },
  vesicle: { url: 'vesicle/', ready: () => !!document.getElementById('zoomV')?.textContent },
  optics: { url: 'optics/', ready: () => document.querySelectorAll('input[type=range]').length > 0 },
  graph: { url: 'dag/', ready: () => document.querySelectorAll('input[type=range]').length > 0 },
  maple: { url: 'maple/?res=0.2', ready: () => !!window.__maple && !!window.__maple.st, own: { zoom: '__maple' } },
  engine: { url: 'engine/?res=0.2', ready: () => !!window.__engine && !!window.__engine.st, own: { zoom: '__engine' } },
  shoulder: { url: 'shoulder/?res=0.25', ready: () => !!window.__shoulder && !!window.__shoulder.frame, own: { zoom: '__shoulder' } },
  saccade: { url: 'saccade/?res=0.3', ready: () => !!window.__saccade && !!window.__saccade.frame, own: { zoom: '__saccade' } },
  gears: { url: 'gears/', ready: () => document.querySelectorAll('input[type=range]').length > 0 },
  gearsmake: { url: 'gears/make.html', ready: () => !!document.getElementById('timeV')?.textContent },
};
const args = process.argv.slice(2), quick = args.includes('--quick');
covers(PAGES, 'tests/touch/run.mjs');
const names = chosen(PAGES, args);

let fails = 0, checked = 0;
const fail = (what) => { fails++; console.log('FAIL ' + what); };
const browser = await findChromium().launch({ args: SOFT_GL });
const W = 820, H = 1180;   // iPad Air, upright

// In the page: every slider a person can reach now (shown, enabled, not hidden under another control), brought into
// view by scrolling its panel only (never the page itself).
const LIST = () => {
  const out = [];
  for (const el of document.querySelectorAll('input[type=range]')) {
    if (el.disabled || !el.id || el.closest('[hidden],details:not([open])') || getComputedStyle(el).pointerEvents === 'none') continue;
    const r0 = el.getBoundingClientRect(); if (!r0.width || !r0.height || getComputedStyle(el).visibility === 'hidden' || +getComputedStyle(el).opacity === 0) continue;
    out.push(el.id);
  }
  return out;
};
const SHOW = (id) => {
  const el = document.getElementById(id);
  for (let p = el.parentElement; p; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight) {
      const r = el.getBoundingClientRect(), pr = p.getBoundingClientRect();
      if (r.top < pr.top + 8 || r.bottom > pr.bottom - 8) p.scrollTop += r.top - pr.top - pr.height / 2;
      break;
    }
  }
  const r = el.getBoundingClientRect(), k = parseFloat(getComputedStyle(el).getPropertyValue('--knob')) || 18;
  const x = r.left + r.width / 2, y = r.top + r.height / 2, top = document.elementFromPoint(x, y);
  const min = +el.min || 0, max = el.max === '' ? 100 : +el.max, step = el.step === 'any' ? 0 : +(el.step || 1);
  const scrolls = [...document.querySelectorAll('*')].filter((n) => n.scrollTop > 0).map((n) => n.scrollTop);
  return { r: { left: r.left, top: r.top, width: r.width, height: r.height }, k, min, max, step, value: +el.value,
    covered: !!top && top !== el && !el.contains(top), scrolls, pageY: scrollY,
    touchAction: getComputedStyle(el).touchAction, bodySelect: getComputedStyle(document.body).userSelect || getComputedStyle(document.body).webkitUserSelect };
};

for (const name of names) {
  const P = PAGES[name];
  for (const motion of ['no-preference', 'reduce']) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: false, reducedMotion: motion });
    const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
    page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fail(`${name}: console: ${m.text()}`); });
    page.on('response', (r) => { if (r.status() >= 400 && !/favicon\.ico|dates\.json/.test(r.url())) fail(`${name}: ${r.status()} for ${r.url()}`); });   // dates.json is written only on publish
    page.on('pageerror', (e) => fail(`${name}: ${e.message}`));
    await page.goto(base + P.url);
    await page.waitForFunction(P.ready, null, { timeout: 300000, polling: 500 });
    await page.waitForTimeout(800);
    await page.evaluate(() => { window.__changes = {}; addEventListener('change', (e) => { if (e.target.id) window.__changes[e.target.id] = (window.__changes[e.target.id] || 0) + 1; }, true); });
    const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y, id: 1 })) });
    const read = (id) => page.evaluate((id) => { const el = document.getElementById(id); return { v: +el.value, held: el.classList.contains('held'), changes: window.__changes[id] || 0 }; }, id);
    // Waits until the value has held still for 12 frames: a glide over a few whole steps can show the same step for several frames.
    const settle = async (id) => { let last = NaN, still = 0; for (let i = 0; i < 400 && still < 12; i++) { await page.evaluate(() => new Promise((r) => requestAnimationFrame(r))); const v = (await read(id)).v; still = v === last ? still + 1 : 0; last = v; } return last; };

    if (motion === 'no-preference') {
      const pg = await page.evaluate(() => {
        const ta = (el) => getComputedStyle(el).touchAction, sticky = [];
        const walk = (rules, inHover) => { for (const r of rules) {
          if (r.cssRules && r.media) walk(r.cssRules, inHover || /hover:\s*hover/.test(r.media.mediaText));
          else if (r.selectorText && r.selectorText.includes(':hover') && !inHover) sticky.push(r.selectorText);
        } };
        for (const sh of document.styleSheets) { try { walk(sh.cssRules, false); } catch { /* another host's sheet */ } }
        return { html: ta(document.documentElement), body: ta(document.body), select: getComputedStyle(document.body).userSelect || getComputedStyle(document.body).webkitUserSelect, sticky };
      });
      if (pg.html !== 'manipulation' && pg.body !== 'manipulation') fail(`${name}: two quick taps can zoom the page (touch-action ${pg.html} / ${pg.body})`);
      if (pg.select !== 'none') fail(`${name}: a long press can select the page's text`);
      if (pg.sticky.length) fail(`${name}: these stay lit after a tap, outside @media (hover:hover): ${pg.sticky.join(' | ')}`);
    }
    if (P.noSliders) { await ctx.close(); if (motion === 'no-preference') console.log(`${name}: page checks done`); continue; }
    let ids = await page.evaluate(LIST);
    if (!ids.length) { fail(`${name}: no slider to try`); await ctx.close(); continue; }
    if (quick || motion === 'reduce') ids = ids.slice(0, 1);
    for (const id of ids) {
      const s = await page.evaluate(SHOW, id), span = s.max - s.min, tol = Math.max(s.step, span * 0.03);
      const where = `${name} #${id}${motion === 'reduce' ? ' (reduced motion)' : ''}`;
      if (s.covered) { fail(`${where}: something covers the slider`); continue; }
      checked++;
      if (s.r.height < 44) fail(`${where}: the row is ${s.r.height}px high, under a finger's 44`);
      if (s.touchAction !== 'pinch-zoom') fail(`${where}: touch-action is ${s.touchAction}, so a drag on it can scroll the panel`);
      const y = s.r.top + s.r.height / 2, left = s.r.left + s.k / 2, w = s.r.width - s.k;
      const xOf = (v) => left + (v - s.min) / span * w;
      const vOf = (x) => s.min + Math.min(1, Math.max(0, (x - left) / w)) * span;
      const snap = (v) => (s.step ? s.min + Math.round((v - s.min) / s.step) * s.step : v);
      const own = P.own && P.own[id];

      // 1. A tap away from the knob: held at once, glides without a jump or turning back, ends where it was aimed.
      const f = (s.value - s.min) / span < 0.5 ? 0.8 : 0.2, x1 = left + f * w, aim = snap(vOf(x1));
      const before = (await read(id)).changes;
      // the value at every frame, recorded in the page (this test's own round trips span several frames)
      await page.evaluate((id) => { const el = document.getElementById(id), rec = window.__rec = [+el.value]; const go = () => { if (window.__rec !== rec) return; rec.push(+el.value); requestAnimationFrame(go); }; requestAnimationFrame(go); }, id);
      await touch('touchStart', [[x1, y]]);
      await frame();
      let r = await read(id);
      if (!r.held) fail(`${where}: a tap on the line did not take hold of the slider`);
      if (motion === 'reduce' && Math.abs(r.v - aim) > tol) fail(`${where}: with reduced motion a tap should land at once (${r.v}, aimed at ${aim})`);
      await touch('touchEnd', []);
      const end = await settle(id);
      const seen = await page.evaluate(() => { const r = window.__rec; window.__rec = null; return r; });
      const own1 = own ? await page.evaluate((g) => window[g].st.z, own) : end;
      if (Math.abs(end - aim) > tol || Math.abs(own1 - aim) > tol) fail(`${where}: a tap at ${aim.toFixed(3)} ended at ${end.toFixed(3)}${own ? ` (the page's zoom ${own1.toFixed(3)})` : ''}`);
      const dir = Math.sign(aim - s.value);
      for (let i = 1; i < seen.length; i++) if ((seen[i] - seen[i - 1]) * dir < -tol / 3) { fail(`${where}: the glide turned back (${seen[i - 1]} then ${seen[i]})`); break; }
      if (motion !== 'reduce' && span / Math.max(s.step, 1e-9) >= 20) {
        const big = Math.max(...seen.slice(1).map((v, i) => Math.abs(v - seen[i])));
        if (big > Math.abs(aim - s.value) * 0.6) fail(`${where}: the knob jumped ${big.toFixed(3)} of the way ${Math.abs(aim - s.value).toFixed(3)} in one frame`);
      }
      r = await read(id);
      if (r.held) fail(`${where}: still held after the finger lifted`);
      if (r.changes - before !== 1) fail(`${where}: letting go sent ${r.changes - before} change events, not 1`);

      // 2. A finger on the knob: no jump on the press; a drag follows, wobbling and leaving the row; nothing scrolls.
      const v0 = (await read(id)).v, k0 = xOf(v0), dx = (v0 - s.min) / span < 0.5 ? w * 0.3 : -w * 0.3;
      const scrolls0 = (await page.evaluate(SHOW, id)).scrolls.join();
      await touch('touchStart', [[k0 + 3, y]]); await frame();
      r = await read(id);
      if (Math.abs(r.v - v0) > Math.max(s.step, span * 0.012)) fail(`${where}: a finger on the knob moved it from ${v0} to ${r.v}`);
      const steps = 10;
      for (let i = 1; i <= steps; i++) await touch('touchMove', [[k0 + 3 + dx * i / steps, y + (i % 2 ? 9 : -9) + (i > 6 ? 60 : 0)]]);
      await frame(); await frame();
      r = await read(id);
      const want = snap(vOf(k0 + dx) );
      if (Math.abs(r.v - want) > tol) fail(`${where}: dragging the knob to ${want.toFixed(3)} left it at ${r.v.toFixed(3)}`);
      if (!r.held) fail(`${where}: the slider let go when the finger left the row`);
      await touch('touchEnd', []); await settle(id);
      const after = await page.evaluate(SHOW, id);
      if (after.scrolls.join() !== scrolls0 || after.pageY !== s.pageY) fail(`${where}: dragging the slider scrolled something`);

      // 3. A mouse press on the line still moves the knob there.
      if (motion !== 'reduce') {
        const v1 = (await read(id)).v, x3 = left + ((v1 - s.min) / span < 0.5 ? 0.7 : 0.3) * w, aim3 = snap(vOf(x3));
        await page.mouse.click(x3, y);
        const end3 = await settle(id);
        if (Math.abs(end3 - aim3) > tol) fail(`${where}: a mouse press at ${aim3.toFixed(3)} ended at ${end3.toFixed(3)}`);
      }
      console.log(`${where}: ok so far`);
    }
    await ctx.close();
  }
}
await browser.close(); server.close();
console.log(fails ? `${fails} failure(s) on ${checked} sliders` : `touch: ${checked} sliders, no failures`);
process.exit(fails ? 1 : 0);
