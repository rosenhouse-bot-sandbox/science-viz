// Opens the workshop page at a desktop and a phone size (the phone with reduced motion). For both toys and every part:
//  - the drawing: every piece of text sits inside the frame and clear of every other piece; the wheel zooms it;
//  - the machining: presses Next through every step, checking the step's title and tool, that the picture is not
//    blank, and that no control moves; then sets the time slider to its ends.
// Also follows the link from the gears page and checks it keeps the toy. Fails on a console error, overlapping text,
// a control that moved, a blank picture, or a panel wider than the screen.
//
//   node tests/gears/makepage.mjs            # needs Node 22 and Playwright, installed outside the repository
//   node tests/gears/makepage.mjs --quick    # desktop only, fewer pictures checked
//   node tests/gears/makepage.mjs --shots    # also writes a picture of every step to tests/gears/out/
import fs from 'node:fs';
import path from 'node:path';
import { staleStamp } from '../stamp.mjs';
import { findChromium, serve, SOFT_GL } from '../lib/serve.mjs';

{ const e = staleStamp('gears'); if (e) { console.error(e); process.exit(1); } }

const { server, base } = await serve({ at: 'gears/' });
const quick = process.argv.includes('--quick'), shots = process.argv.includes('--shots'), out = path.join(import.meta.dirname, 'out');
if (shots) fs.mkdirSync(out, { recursive: true });

let fails = 0;
const fail = (what) => { fails++; console.log('FAIL ' + what); };
const browser = await findChromium().launch({ args: SOFT_GL });


const SNAP = () => { const c = document.getElementById('view'), s = window.__snap || (window.__snap = document.createElement('canvas')); s.width = 96; s.height = 60; const x = s.getContext('2d', { willReadFrequently: true }); window.__make.redraw(); x.drawImage(c, 0, 0, 96, 60); return Array.from(x.getImageData(0, 0, 96, 60).data); };
const spread = (a) => { let lo = 765, hi = 0; for (let i = 0; i < a.length; i += 4) { const v = a[i] + a[i + 1] + a[i + 2]; lo = Math.min(lo, v); hi = Math.max(hi, v); } return hi - lo; };
// every piece of text on the sheet: inside the frame, and clear of every other piece of text
const SHEET = () => {
  const svg = document.querySelector('#sheet svg'); if (!svg) return { missing: true };
  const vb = svg.viewBox.baseVal, T = [...svg.querySelectorAll('text')].map((t) => { const b = t.getBBox(), m = t.getCTM(), sm = svg.getCTM().inverse().multiply(m);
    const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => [sm.a * x + sm.c * y + sm.e, sm.b * x + sm.d * y + sm.f]);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return { s: t.textContent, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; });
  const out = T.filter((t) => t.x0 < 5 || t.y0 < 5 || t.x1 > vb.width - 5 || t.y1 > vb.height - 5).map((t) => t.s);
  const hit = [], pad = 0.25;
  for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) { const a = T[i], b = T[j]; if (a.x0 + pad < b.x1 - pad && b.x0 + pad < a.x1 - pad && a.y0 + pad < b.y1 - pad && b.y0 + pad < a.y1 - pad) hit.push(`"${a.s}" and "${b.s}"`); }
  return { out, hit, n: T.length };
};
const SIZES = [['desktop', 1280, 800, 'no-preference'], ['phone, reduced motion', 390, 844, 'reduce']];

// the gears page links here, keeping the toy
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => fail(`gears page: ${e.message}`));
  await page.goto(base + '?res=0.5&look=0#s=octa');
  await page.waitForFunction(() => window.__gears?.drawn.shape, null, { timeout: 120000 });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 500)));
  await page.click('#more');
  await page.waitForFunction(() => window.__make?.cur, null, { timeout: 120000 });
  const s = await page.evaluate(() => window.__make.st.shape);
  if (s !== 'octa') fail(`the link from the gears page opened the ${s}, not the octahedron`);
  await page.close();
}

for (const [name, width, height, motion] of quick ? SIZES.slice(0, 1) : SIZES) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: motion, hasTouch: width < 600 });
  page.on('console', (m) => { if (m.type() === 'error') fail(`${name}: console: ${m.text()}`); });
  page.on('pageerror', (e) => fail(`${name}: ${e.message}`));
  await page.goto(base + 'make.html?res=0.5&look=0');
  await page.waitForFunction(() => window.__make?.cur && document.querySelector('#parts button'), null, { timeout: 120000 });
  const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const fits = async (when) => { const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.getElementById('panel').scrollWidth, document.getElementById('panel').clientWidth]); if (w[0] > width || w[1] > w[2]) fail(`${name}: something is wider than the screen ${when} (${w.join(', ')})`); };
  const IDS = ['shapes', 'parts', 'views', 'prev', 'next', 'play', 'time'];
  const boxes = () => page.evaluate((ids) => { const sc = document.getElementById('panel').scrollTop; return ids.map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [r.x, r.y + sc, r.width, r.height].map((v) => Math.round(v)).join(','); }).join(' | '); }, IDS);
  const moved = (a, b) => { const A = a.split(' | '), B = b.split(' | '); return IDS.filter((_, i) => A[i] !== B[i]).map((id) => `${id} ${A[IDS.indexOf(id)]} -> ${B[IDS.indexOf(id)]}`).join('; '); };
  if (!(await page.$eval('#oops', (e) => e.hidden))) { fail(`${name}: the picture could not start`); await page.close(); continue; }
  const playing = await page.evaluate(() => window.__make.st.play);
  if (motion === 'reduce' && playing) fail(`${name}: the machining played by itself with reduced motion`);

  for (const shape of ['cube4', 'octa']) for (const part of ['gear', 'core', 'spacer', 'screw', 'bearing']) {
    const what = `${name}, ${shape} ${part}`;
    await page.click(`#shapes button[data-id="${shape}"]`); await page.click(`#parts button[data-id="${part}"]`);
    // the drawing
    await page.click('#views button[data-v="draw"]'); await frame();
    const sh = await page.evaluate(SHEET);
    if (sh.missing) fail(`${what}: no drawing`);
    else {
      if (sh.out.length) fail(`${what}: text outside the frame: ${sh.out.join(', ')}`);
      for (const h of sh.hit) fail(`${what}: text overlaps: ${h}`);
    }
    // zoom the drawing with the wheel, and back
    const box = await page.$eval('#sheet', (e) => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await page.mouse.move(box[0], box[1]); await page.mouse.wheel(0, -400); await frame();
    if (!(await page.$eval('#sheet svg', (e) => e.style.transform.includes('scale')))) fail(`${what}: the wheel does not zoom the drawing`);
    await page.focus('#sheet'); await page.keyboard.press('0'); await frame();
    await fits(`on the ${part} drawing`);
    // the machining
    await page.click('#views button[data-v="make"]'); await page.evaluate(() => window.__make.settle()); await frame();
    if (part === 'bearing') { if (!(await page.$eval('#makeBox', (e) => e.hidden))) fail(`${what}: the bearing shows machining steps`); continue; }
    const b0 = await boxes(), n = await page.evaluate(() => window.__make.cur.steps.length);
    for (let i = 0; i < n; i++) {
      const got = await page.evaluate(() => ({ title: document.getElementById('stepTitle').textContent, step: window.__make.st.step, tool: document.getElementById('stepTool').textContent }));
      if (got.step !== i) fail(`${what}: Next led to step ${got.step + 1}, not ${i + 1}`);
      if (!got.title.startsWith(`${i + 1}.`) || !got.tool) fail(`${what}: step ${i + 1} reads "${got.title}" with tool "${got.tool}"`);
      if (i === 0 || i === n - 1 || !quick) { const s = await page.evaluate(SNAP); if (spread(s) < 60) fail(`${what}: step ${i + 1}: the picture is blank`); }
      if (shots) await page.screenshot({ path: path.join(out, `make-${width > 600 ? 'desktop' : 'phone'}-${shape}-${part}-${i + 1}.png`) });
      const b = await boxes(); if (b !== b0) fail(`${what}: step ${i + 1} moved a control: ${moved(b0, b)}`);
      if (i < n - 1) { await page.click('#next'); await frame(); }
    }
    if (!(await page.$eval('#next', (e) => e.disabled))) fail(`${what}: Next is still on at the last step`);
    // the time slider, end to end
    for (const v of [0, 500, 1000]) await page.$eval('#time', (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
    await frame();
    const t = await page.evaluate(() => [window.__make.st.t, window.__make.cur.tl.T]);
    if (Math.abs(t[0] - t[1]) > 1e-6) fail(`${what}: the slider's end is not the end of the work (${t[0].toFixed(1)} of ${t[1].toFixed(1)} s)`);
    await fits(`while machining the ${part}`);
  }
  await page.close();
}
// The lit look (js/gears/look.js), which draws slowly without a graphics card: it starts without an error and
// draws the lathe and the mill.
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  page.on('console', (m) => { if (m.type() === 'error') fail(`lit: console: ${m.text()}`); });
  page.on('pageerror', (e) => fail(`lit: ${e.message}`));
  await page.goto(base + 'make.html?res=0.4#s=octa&p=gear&v=make');
  await page.waitForFunction(() => window.__make?.cur, null, { timeout: 180000 });
  if (!(await page.evaluate(() => window.__make.lit))) fail('lit: the page fell back to the plain lighting');
  for (const [where, f] of [['the lathe', 0.02], ['the mill', 0.6]]) {
    await page.evaluate((f) => window.__make.at(f * window.__make.cur.tl.T), f);
    if (spread(await page.evaluate(SNAP)) < 60) fail(`lit: the picture at ${where} is blank`);
  }
  console.log('lit: done');
  await page.close();
}
await browser.close(); server.close();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
