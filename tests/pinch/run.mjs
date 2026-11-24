// Puts two fingers on the picture of every page that has a zoom, at a phone size, and moves them:
//  - spreading the fingers zooms in and pinching them zooms out, and the Zoom (or Distance) slider moves with them;
//  - what a pinch gives is a state the slider can give (the slider's own value says the same as the picture's);
//  - pinching back by as much as was spread comes back to where it started;
//  - the browser's own zoom of the whole page never comes in;
//  - on Japanese maple and Engine, with Play on, no frame moves both the zoom and the date or crank angle;
//  - one finger alone does not zoom;
//  - one spread of the fingers (40 to 150 px apart) goes about one scale, not through all of them.
// Fails on any of those not holding, or on a console error.
//
//   node tests/pinch/run.mjs [maple engine shoulder vesicle rainbows]   # needs Node 22 and Playwright, installed outside the repository
//   node tests/pinch/run.mjs --shots                           # also writes pictures to tests/pinch/out/
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
let chromium;
for (const from of [import.meta.url, '/opt/node-tools/', process.execPath, '/']) { try { chromium = createRequire(from)('playwright').chromium; break; } catch { /* try the next place */ } }
if (!chromium) { console.error('Playwright is not installed. Install it outside the repository: npm install -g playwright && npx playwright install chromium'); process.exit(2); }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;
const args = process.argv.slice(2), shots = args.includes('--shots'), out = path.join(import.meta.dirname, 'out');
if (shots) fs.mkdirSync(out, { recursive: true });

// For each page: where it is, when it is ready, the slider a pinch should move, which way that slider goes when the
// fingers spread, and whether it has a clock that must wait while the zoom moves.
const PAGES = {
  maple: { url: 'maple/?res=0.2', slider: 'zoom', dir: 1, ready: () => !!window.__maple && !!document.getElementById('capTitle').textContent,
    timed: true, same: (v, s) => Math.abs(v - s.z) < 0.004 },
  engine: { url: 'engine/?res=0.2', slider: 'zoom', dir: 1, start: 1, ready: () => !!window.__engine && !!document.getElementById('capTitle').textContent,
    timed: true, same: (v, s) => Math.abs(v - s.z) < 0.004 },   // starts from the Engine scale: at Car the crank turns a whole cycle in one slow frame of this test, and looks still
  shoulder: { url: 'shoulder/?res=0.25', slider: 'zoom', dir: 1, ready: () => !!window.__shoulder && !!window.__shoulder.frame, same: (v, s) => Math.abs(v - s.z) < 0.004 },
  saccade: { url: 'saccade/?res=0.3', slider: 'zoom', dir: 1, ready: () => !!window.__saccade && !!window.__saccade.frame, timed: true, same: (v, s) => Math.abs(v - s.z) < 0.004 },
  vesicle: { url: 'vesicle/', slider: 'zoom', dir: -1, ready: () => !!document.getElementById('zoomV').textContent },
  rainbows: { url: 'v2/?debug=1', slider: null, dir: -1, wide: 60, ready: () => !!window.__rainbows && !window.__rainbows.busy },       // no Zoom slider here: a pinch moves the camera within the scale
};
const names = args.filter((a) => PAGES[a]); if (!names.length) names.push(...Object.keys(PAGES));

let fails = 0;
const fail = (what) => { fails++; console.log('FAIL ' + what); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

for (const name of names) {
  const P = PAGES[name], W = 390, H = 844;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  page.on('console', (m) => { if (m.type() === 'error') fail(`${name}: console: ${m.text()}`); });
  page.on('pageerror', (e) => fail(`${name}: ${e.message}`));
  await page.goto(base + P.url);
  await page.waitForFunction(P.ready, null, { timeout: 180000 });
  await page.waitForTimeout(600);
  const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  // In the page: the zoom the page holds, the slider's own value, and how far the browser has zoomed the whole page.
  const look = () => page.evaluate((slider) => {
    const m = window.__maple || window.__engine || window.__shoulder || window.__saccade, r = window.__rainbows;
    return { own: m ? { z: m.st.z } : r ? { z: r.cams[r.S.stage].gd } : null, v: slider ? +document.getElementById(slider).value : null, page: window.visualViewport.scale };
  }, P.slider);
  const where = (s) => (P.slider ? s.v : s.own.z);
  // the fingers go on the picture, clear of the panel at the foot and of the buttons at the top
  const cx = W / 2, cy = 300;
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const two = (half) => [[cx - half, cy - half * 0.3], [cx + half, cy + half * 0.3]];
  // Moves two fingers from `a` apart to `b` apart in small steps, looking at the page after each one.
  async function pinch(a, b, label) {
    const steps = 12;
    await touch('touchStart', two(a));
    for (let i = 1; i <= steps; i++) {
      await touch('touchMove', two(a + (b - a) * i / steps)); await frame();
      const now = await look();
      if (now.page > 1.001) { fail(`${name}: ${label}: the browser zoomed the whole page (${now.page.toFixed(2)}x)`); break; }
      if (now.own && P.same && !P.same(now.v, now.own)) fail(`${name}: ${label}: the slider says ${now.v} and the picture ${now.own.z.toFixed(4)}`);
    }
    await touch('touchEnd', []); await frame();
    return look();
  }
  if (P.start !== undefined) { await page.$eval('#' + P.slider, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, P.start); await frame(); }
  // Time must be running for the check that it waits: every frame drawn from here on is watched for the zoom and the time both having moved.
  if (P.timed) {
    await page.waitForTimeout(2000);                    // these pages press Play themselves a moment after loading: let that happen first
    if (!(await page.evaluate(() => (window.__maple || window.__engine || window.__saccade).st.play))) await page.click('#play');
    await page.evaluate(() => { const m = window.__maple || window.__engine || window.__saccade, get = () => [m.drawn.z, window.__saccade ? m.drawn.t : window.__maple ? m.drawn.s : m.drawn.phi]; let [z, t] = get(); window.__both = 0; window.__frames = 0; const tick = () => { const [z1, t1] = get(); if (z1 !== z && t1 !== t) window.__both++; if (t1 !== t) window.__frames++; z = z1; t = t1; requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    await page.waitForFunction(() => window.__frames > 2, null, { timeout: 300000 }).catch(() => fail(`${name}: time did not run before the pinch`));
  }
  const s0 = await look();
  if (shots) await page.screenshot({ timeout: 300000, path: path.join(out, `${name}-0-start.png`) });

  // one finger alone must not zoom
  await touch('touchStart', [[cx, cy]]); for (let i = 1; i <= 6; i++) { await touch('touchMove', [[cx + i * 12, cy + i * 4]]); await frame(); } await touch('touchEnd', []); await frame();
  const s1 = await look();
  if (Math.abs(where(s1) - where(s0)) > 1e-6) fail(`${name}: one finger moved the zoom from ${where(s0)} to ${where(s1)}`);

  // spread, then pinch back by as much
  const range = P.slider ? await page.$eval('#' + P.slider, (el) => [+el.min, +el.max]) : null;
  const sIn = await pinch(40, P.wide || 150, 'fingers spread');
  if (shots) await page.screenshot({ timeout: 300000, path: path.join(out, `${name}-1-spread.png`) });
  if (!((where(sIn) - where(s1)) * P.dir > (range ? (range[1] - range[0]) * 0.02 : 1e-3))) fail(`${name}: spreading the fingers did not zoom in (${where(s1)} to ${where(sIn)})`);
  // a spread to nearly four times as far apart is about one scale (one unit of a Zoom slider), not a race through all of them
  if (P.slider && P.slider === 'zoom' && name !== 'vesicle' && Math.abs(where(sIn) - where(s1)) > 1.5) fail(`${name}: one spread of the fingers went ${Math.abs(where(sIn) - where(s1)).toFixed(2)} scales; it should be about one`);
  const sOut = await pinch(P.wide || 150, 40, 'fingers pinched');
  if (shots) await page.screenshot({ timeout: 300000, path: path.join(out, `${name}-2-pinched-back.png`) });
  if (!((where(sOut) - where(sIn)) * P.dir < 0)) fail(`${name}: pinching the fingers did not zoom out (${where(sIn)} to ${where(sOut)})`);
  if (Math.abs(where(sOut) - where(s1)) > (range ? (range[1] - range[0]) * 0.01 : 0.02 * Math.abs(where(s1)))) fail(`${name}: pinching back by as much as was spread ended at ${where(sOut)}, not at ${where(s1)} where it began`);

  // lifting one finger and putting it down somewhere else must not jump
  await touch('touchStart', two(60)); await touch('touchMove', two(64)); await frame(); const a = await look();
  await touch('touchMove', [two(64)[0]]); await touch('touchEnd', [two(64)[0]].slice(0, 0)); await frame();
  await touch('touchStart', [two(64)[0], [cx + 150, cy + 100]]); await touch('touchMove', [two(64)[0], [cx + 151, cy + 100]]); await frame(); const b = await look();
  await touch('touchEnd', []);
  if (Math.abs(where(b) - where(a)) > (range ? (range[1] - range[0]) * 0.01 : 0.02 * Math.abs(where(a)))) fail(`${name}: a finger put down again somewhere else jumped the zoom from ${where(a)} to ${where(b)}`);

  if (P.timed) { const both = await page.evaluate(() => window.__both); if (both) fail(`${name}: the zoom and the time moved together in ${both} frames`); }
  console.log(`${name}: one finger ${where(s0)} -> ${where(s1)}; spread -> ${(+where(sIn)).toFixed(3)}; pinched back -> ${(+where(sOut)).toFixed(3)}; page zoom ${sOut.page}`);
  await ctx.close();
}
await browser.close(); server.close();
console.log(fails ? `${fails} failed` : 'pinch: all passed');
process.exit(fails ? 1 : 0);
