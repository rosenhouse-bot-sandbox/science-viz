// Opens the gears page at a desktop and a phone size (the phone with reduced motion), then:
//  - checks that the gears turn by themselves, except with reduced motion;
//  - presses each shape, and checks the caption;
//  - drags a gear round its axis with the mouse: the gears turn, and the dragged one follows the pointer's way round;
//  - drags off the gears: the view turns and the gears do not;
//  - sweeps the Spin and Take apart sliders, comparing each picture with the one before: a step that changes the
//    picture far more than the steps either side of it is reported as a jump;
//  - plays for a while, and presses the color tick box, checking that no control moves or changes size.
// Fails on a console error, a jump, a control that moved, a blank picture, or a panel wider than the screen.
//
//   node tests/gears/page.mjs            # needs Node 22 and Playwright, installed outside the repository
//   node tests/gears/page.mjs --quick    # desktop only, coarser sweep
//   node tests/gears/page.mjs --shots    # also writes a picture of each solid to tests/gears/out/
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

const SNAP = () => { const c = document.getElementById('view'), s = window.__snap || (window.__snap = document.createElement('canvas')); s.width = 96; s.height = 60; const x = s.getContext('2d', { willReadFrequently: true }); window.__gears.redraw(); x.drawImage(c, 0, 0, 96, 60); return Array.from(x.getImageData(0, 0, 96, 60).data); };
const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return s / (a.length / 4) / 3; };
const spread = (a) => { let lo = 765, hi = 0; for (let i = 0; i < a.length; i += 4) { const v = a[i] + a[i + 1] + a[i + 2]; lo = Math.min(lo, v); hi = Math.max(hi, v); } return hi - lo; };
const SIZES = [['desktop', 1280, 800, 'no-preference'], ['phone, reduced motion', 390, 844, 'reduce']];
const WANT = { cube4: { title: 'Cube, 4', jam: false }, octa: { title: 'Octahedron, 8', jam: false } };

for (const [name, width, height, motion] of quick ? SIZES.slice(0, 1) : SIZES) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: motion, hasTouch: width < 600 });
  page.on('console', (m) => { if (m.type() === 'error') fail(`${name}: console: ${m.text()}`); });
  page.on('pageerror', (e) => fail(`${name}: ${e.message}`));
  await page.goto(base + '?res=0.5');
  await page.waitForFunction(() => window.__gears?.drawn.shape && document.querySelector('#shapes button'), null, { timeout: 120000 });
  if (!(await page.$eval('#oops', (e) => e.hidden))) { fail(`${name}: the picture could not start`); await page.close(); continue; }
  const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const playing = () => page.evaluate(() => window.__gears.busy);
  if (motion === 'reduce' ? await playing() : !(await playing())) fail(`${name}: ${motion === 'reduce' ? 'the gears turned by themselves with reduced motion' : 'the gears did not start turning'}`);
  const settle = async () => { await page.evaluate(() => window.__gears.settle()); await frame(); };
  const put = async (id, v) => { await page.$eval('#' + id, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, v); await frame(); };
  const fits = async (when) => { const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.getElementById('panel').scrollWidth, document.getElementById('panel').clientWidth]); if (w[0] > width || w[1] > w[2]) fail(`${name}: something is wider than the screen ${when} (${w.join(', ')})`); };
  const IDS = ['shapes', 'play', 'turn', 'turnV', 'apart', 'color', 'key'];
  const boxes = () => page.evaluate((ids) => { const sc = document.getElementById('panel').scrollTop; return ids.map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [r.x, r.y + sc, r.width, r.height].map((v) => Math.round(v)).join(','); }).join(' | '); }, IDS);
  const moved = (a, b) => { const A = a.split(' | '), B = b.split(' | '); return IDS.filter((_, i) => A[i] !== B[i]).map((id) => `${id} ${A[IDS.indexOf(id)]} -> ${B[IDS.indexOf(id)]}`).join('; '); };
  const t = () => page.evaluate(() => window.__gears.st.t);
  await settle();

  // each solid
  const b0 = await boxes();
  for (const id of ['cube4', 'octa']) {
    await page.click(`#shapes button[data-id="${id}"]`); await frame();
    const got = await page.evaluate(() => ({ s: window.__gears.st.shape, dis: document.getElementById('turn').disabled, cap: document.querySelector(`#shapes [aria-pressed="true"]`)?.textContent }));
    if (got.s !== id) fail(`${name}: the ${id} button chose ${got.s}`);
    if (got.cap !== WANT[id].title) fail(`${name}: ${id} shows ${got.cap} as chosen`);
    if (got.dis !== WANT[id].jam) fail(`${name}: ${id}: the Turn slider is ${got.dis ? '' : 'not '}disabled`);
    const s = await page.evaluate(SNAP); if (spread(s) < 60) fail(`${name}: the picture of ${id} is blank`);
    { const b = await boxes(); if (b !== b0) fail(`${name}: choosing ${id} moved a control: ${moved(b0, b)}`); }
    await fits(`at ${id}`);
    if (shots) await page.screenshot({ path: path.join(out, `${width > 600 ? 'desktop' : 'phone'}-${id}.png`) });

    // drag a gear that faces the camera a quarter of the way round its axis
    const grip = await page.evaluate(() => {
      const G = window.__gears, sh = G.SHAPES.find((s) => s.id === G.st.shape);
      for (let i = 0; i < sh.normals.length; i++) {
        const [cx, cy, facing] = G.capAt(i); if (!facing) continue;
        for (let r = 30; r < 120; r += 6) for (let k = 0; k < 16; k++) { const a = k / 16 * 2 * Math.PI, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a); if (G.pick(x, y) === i) return { i, cx, cy, r, a, sign: sh.sign[i] }; }
      }
      return null;
    });
    if (!grip) { fail(`${name}: ${id}: found no gear to drag`); continue; }
    const t0 = await t();
    await page.mouse.move(grip.cx + grip.r * Math.cos(grip.a), grip.cy + grip.r * Math.sin(grip.a)); await page.mouse.down();
    for (let k = 1; k <= 12; k++) { const a = grip.a + k / 12 * Math.PI / 2; await page.mouse.move(grip.cx + grip.r * Math.cos(a), grip.cy + grip.r * Math.sin(a)); }
    await page.mouse.up(); await frame();
    const dt = (((await t()) - t0) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
    if (WANT[id].jam) { if (Math.abs(dt) > 1e-9) fail(`${name}: ${id}: a jammed gear turned by ${(dt * 180 / Math.PI).toFixed(1)}°`); }
    else if (Math.abs(dt) < 20 * Math.PI / 180) fail(`${name}: ${id}: dragging a gear a quarter turn on screen turned the gears ${(dt * 180 / Math.PI).toFixed(1)}°`);
    // off the gears, a drag turns the view and not the gears
    const y0 = await page.evaluate(() => window.__gears.st.yaw), t1 = await t();
    const corner = width > 600 ? [width - 60, height - 60] : [width - 30, 120];
    await page.mouse.move(...corner); await page.mouse.down(); await page.mouse.move(corner[0] - 80, corner[1], { steps: 6 }); await page.mouse.up(); await frame();
    if ((await page.evaluate(() => window.__gears.st.yaw)) === y0) fail(`${name}: ${id}: a drag off the gears did not turn the view`);
    if ((await t()) !== t1) fail(`${name}: ${id}: a drag off the gears turned the gears`);
    await page.mouse.dblclick(corner[0], corner[1]); await settle();
  }

  // the Spin slider and the Take apart slider: no jumps, nothing in the panel moves
  for (const [id, ctl, to] of [['cube4', 'turn', 45], ['octa', 'turn', 45], ['cube4', 'apart', 1], ['octa', 'apart', 1]]) {
    await page.click(`#shapes button[data-id="${id}"]`); await settle();
    const n = quick ? 24 : 50, ds = []; let prev = null; const bA = await boxes();
    for (let k = 0; k <= n; k++) {
      await put(ctl, ctl === 'turn' ? Math.round(k / n * to) : (k / n * to).toFixed(2)); const s = await page.evaluate(SNAP);
      if (prev) ds.push(diff(prev, s)); prev = s;
    }
    ds.forEach((d, k) => {
      const near = ds.filter((_, j) => j !== k && Math.abs(j - k) <= 3).sort((a, b) => a - b), med = near[near.length >> 1] ?? 0;
      if (d > Math.max(4, 3 * med)) fail(`${name}: ${id}: a jump moving ${ctl}, at step ${k + 1} of ${n} (${d.toFixed(1)} against ${med.toFixed(1)} either side)`);
    });
    { const b = await boxes(); if (b !== bA) fail(`${name}: ${id}: a control moved while moving ${ctl}: ${moved(bA, b)}`); }
    if (ctl === 'apart') {
      // taken apart, the gears do not mesh, so they cannot be turned
      if (!(await page.$eval('#turn', (e) => e.disabled))) fail(`${name}: ${id}: the Spin slider still works with the parts apart`);
      await put('apart', 0);
      if (await page.$eval('#turn', (e) => e.disabled)) fail(`${name}: ${id}: the Spin slider stays off once put back together`);
    }
  }

  // Play turns the gears, Pause stops them, and nothing moves meanwhile
  { const bA = await boxes(), t0 = await t();
    await page.click('#play'); if (!(await playing())) fail(`${name}: the Play button did not play`);
    await page.waitForTimeout(1500); if (!((await t()) !== t0)) fail(`${name}: the gears did not turn while playing`);
    await page.click('#play'); await frame(); if (await playing()) fail(`${name}: Play did not pause`);
    await page.click('#color'); await frame(); if (!(await page.evaluate(() => window.__gears.st.color))) fail(`${name}: the tick box did not turn the colors on`);
    await page.click('#color'); await frame();
    const b = await boxes(); if (b !== bA) fail(`${name}: a control moved while playing or coloring: ${moved(bA, b)}`); }
  await fits('at the end');
  console.log(`${name}: done`);
  await page.close();
}
await browser.close(); server.close();
if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log('all passed');
