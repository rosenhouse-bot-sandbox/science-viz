// Opens every page at iPad sizes, with touch, held upright and sideways and in split view, and fails if:
//  - the page is wider than the screen, or a panel is wider than itself;
//  - a control is off the screen where nothing scrolls to it, or something else sits on top of it;
//  - a control is smaller than a finger: 44 × 44 px at a tablet's width, 24 × 24 px in a narrow split view
//    (WCAG 2.5.5 and 2.5.8; links inside sentences are exempt);
//  - text is cut off inside its box;
//  - the page stops the visitor zooming (user-scalable=no, maximum-scale) or the console shows an error;
//  - turning the iPad from upright to sideways leaves anything of the above behind.
// On Vesicle fusion it also taps a label and checks its card opens, as a hover does with a mouse.
//
//   node tests/ipad/run.mjs                  # every page at every size (about 25 minutes without a graphics card)
//   node tests/ipad/run.mjs --quick          # iPad Air upright and sideways only
//   node tests/ipad/run.mjs maple engine     # some pages only (names as in tests/lib/pages.mjs)
//   node tests/ipad/run.mjs --shots          # also writes a picture of each page and size to tests/ipad/out/
//
// Needs Node 22 and Playwright, installed outside the repository. Chromium stands in for Safari: it has the
// iPad's sizes and a touch screen (pointer: coarse, hover: none), but not Safari's toolbars, the Home Screen's
// status bar (safe-area insets) or how Safari draws. Look at a real iPad as well.
import fs from 'node:fs';
import path from 'node:path';
import { findChromium, serve } from '../lib/serve.mjs';
import { PAGES, chosen, covers } from '../lib/pages.mjs';

const { server, base } = await serve();

// Every page of the site (tests/lib/pages.mjs).
covers(PAGES, 'tests/ipad/run.mjs');
// CSS pixels of the screen (a Home Screen app fills it). The split views are the iPad Air's, sideways.
const SIZES = [
  ['iPad Air, upright', 820, 1180], ['iPad Air, sideways', 1180, 820],
  ['iPad mini, upright', 744, 1133], ['iPad (older), sideways', 1024, 768],
  ['iPad Pro 13", upright', 1024, 1366], ['iPad Pro 13", sideways', 1366, 1024],
  ['split view, half', 590, 820], ['split view, a third', 375, 820],
];
const args = process.argv.slice(2), quick = args.includes('--quick'), shots = args.includes('--shots');
const pages = chosen(PAGES, args), sizes = quick ? SIZES.slice(0, 2) : SIZES;
const out = path.join(import.meta.dirname, 'out');
if (shots) fs.mkdirSync(out, { recursive: true });

let fails = 0;
const fail = (what) => { fails++; console.log('FAIL ' + what); };

// Everything the page can be asked about, measured inside it. Returns a list of problems.
function look(minTarget) {
  const W = innerWidth, H = innerHeight, bad = [];
  const shown = (e) => e.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  const name = (e) => (e.id ? '#' + e.id : e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).join('.') : ''))
    + (e.getAttribute('aria-label') ? ` [${e.getAttribute('aria-label')}]` : e.textContent.trim() ? ` "${e.textContent.trim().replace(/\s+/g, ' ').slice(0, 30)}"` : '');
  const scroller = (e) => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (/(auto|scroll)/.test(s.overflowY + s.overflowX) && (a.scrollHeight > a.clientHeight + 1 || a.scrollWidth > a.clientWidth + 1)) return a; } return null; };
  const fixed = (e) => { for (let a = e; a; a = a.parentElement) if (getComputedStyle(a).position === 'fixed') return true; return false; };
  const pageScrolls = document.scrollingElement.scrollHeight > H + 1;
  const meta = document.querySelector('meta[name=viewport]')?.content || '';
  if (/user-scalable\s*=\s*(no|0)|maximum-scale/.test(meta)) bad.push(`the viewport stops zooming (${meta})`);
  if (document.documentElement.scrollWidth > W + 1) bad.push(`the page is ${document.documentElement.scrollWidth}px wide on a ${W}px screen`);
  for (const p of document.querySelectorAll('.panel, #panel')) if (shown(p) && p.scrollWidth > p.clientWidth + 1) bad.push(`${name(p).slice(0, 20)} is ${p.scrollWidth}px wide inside ${p.clientWidth}px`);
  const controls = [...document.querySelectorAll('button, a[href], input, select, textarea, summary, [role=button], [tabindex]:not([tabindex="-1"])')].filter(shown);
  for (const e of controls) {
    const b = e.getBoundingClientRect();
    if (b.width === 0 && b.height === 0) continue;
    const sc = scroller(e), off = b.left < -1 || b.top < -1 || b.right > W + 1 || b.bottom > H + 1;
    if (off && !sc && !(pageScrolls && !fixed(e))) bad.push(`${name(e)} is off the screen at ${[b.left, b.top, b.width, b.height].map(Math.round)}`);
    if (!off) {
      const at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      const mine = !at || at === e || e.contains(at) || (e.labels && [...e.labels].some((l) => l.contains(at)));
      // a bar that sticks to the foot of a panel scrolls away from what it covers
      const sticky = at && sc && sc.contains(at) && [...function* () { for (let a = at; a && a !== sc; a = a.parentElement) yield a; }()].some((a) => getComputedStyle(a).position === 'sticky');
      if (!mine && !sticky) bad.push(`${name(e)} is under ${name(at)}`);
    }
    // a tick box or radio is pressed through its label
    const box = /^(checkbox|radio)$/.test(e.type) && e.labels?.[0] ? e.labels[0].getBoundingClientRect() : b;
    const inline = e.tagName === 'A' && !e.closest('nav') && getComputedStyle(e).display === 'inline';
    if (!inline && Math.min(box.width, box.height) < minTarget - 0.5) bad.push(`${name(e)} is ${Math.round(box.width)} × ${Math.round(box.height)} px, under ${minTarget} px for a finger`);
  }
  for (const e of document.querySelectorAll('body *')) {
    if (e.children.length || !e.textContent.trim() || !shown(e) || e.clientWidth <= 2) continue;   // (1 px boxes are text for screen readers only)
    const s = getComputedStyle(e);
    if (e.scrollWidth > e.clientWidth + 1 && s.overflowX !== 'visible' && s.textOverflow !== 'ellipsis') bad.push(`${name(e)} is cut off (${e.scrollWidth}px of text in ${e.clientWidth}px)`);
  }
  return bad;
}

const browser = await findChromium().launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const pg of pages) {
  for (const [size, width, height] of sizes) {
    const where = `${pg}, ${size} (${width} × ${height})`, t0 = Date.now();
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true, isMobile: false, reducedMotion: 'reduce' });
    page.on('pageerror', (e) => fail(`${where}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) fail(`${where}: console: ${m.text()}`); });
    // (the site has no favicon, and dates.json is written only when the site is published)
    page.on('response', (r) => { if (r.status() >= 400 && !/\/(favicon\.ico|dates\.json)$/.test(r.url())) fail(`${where}: ${r.status()} for ${r.url().replace(base, '/')}`); });
    await page.goto(base + PAGES[pg], { waitUntil: 'load' });
    await page.waitForTimeout(4000);    // pages build their models and lay out in the first frames
    const minTarget = width >= 600 ? 44 : 24;
    const seen = new Set();
    const check = async (when) => { for (const b of await page.evaluate(look, minTarget)) if (!seen.has(b)) { seen.add(b); fail(`${where}${when}: ${b}`); } };
    await check('');
    if (shots) await page.screenshot({ path: path.join(out, `${pg}-${width}x${height}.png`), timeout: 120000 });
    // The same iPad turned the other way, without reloading: the layout must follow.
    if (width !== height && size.startsWith('iPad Air')) {
      await page.setViewportSize({ width: height, height: width });
      await page.waitForTimeout(1500);
      await check(', turned');
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(1500);
      await check(', turned back');
    }
    // A finger cannot hover: on Vesicle a tap on a label opens the card a mouse gets by hovering.
    if (pg === 'vesicle' && width >= 600) {
      // In software the picture draws a few frames a second and the labels ride on things that drift, so a
      // tap sent from here lands a frame late, beside the label. Instead: find what a finger at the label's
      // middle would touch, in the same frame, and click that.
      let opened = 'no label to tap';
      for (let i = 0; i < 20 && opened === 'no label to tap'; i++) {
        if (i) await page.waitForTimeout(500);
        opened = await page.evaluate(() => {
          const t = [...document.querySelectorAll('.tag.on')].find((t) => { const b = t.getBoundingClientRect(); return b.top > 70 && b.bottom < innerHeight - 20 && b.right < innerWidth - 20; });
          if (!t) return 'no label to tap';
          const b = t.firstChild.getBoundingClientRect(), hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          if (!t.contains(hit)) return 'a finger on a label touches ' + (hit?.tagName || 'nothing');
          hit.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); hit.click();
          return t.querySelector('.pop').checkVisibility() || 'a tap on a label did not open its card';
        });
      }
      if (opened !== true) fail(`${where}: ${opened}`);
      else {
        await page.touchscreen.tap(width / 2 + 40, 30);
        await page.waitForTimeout(200);
        if (await page.evaluate(() => [...document.querySelectorAll('.tag .pop')].some((p) => p.checkVisibility()))) fail(`${where}: a tap elsewhere did not close the label's card`);
      }
    }
    await page.close();
    console.log(`${where}: checked in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
}
await browser.close(); server.close();
console.log(fails ? `${fails} failures` : `iPad sizes: ${pages.length} pages at ${sizes.length} sizes, no failures`);
process.exit(fails ? 1 : 0);
