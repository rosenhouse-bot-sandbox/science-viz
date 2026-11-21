// Opens the Overshoot saccades page at a desktop and a phone size (the phone with reduced motion), then:
//  - checks that time runs by itself, except with reduced motion;
//  - presses every zoom stop and both kinds of pursuit;
//  - sweeps the Zoom slider end to end with time stopped, comparing each picture with the one before: a step that
//    changes the picture far more than the steps either side of it is reported as a jump;
//  - steps the speed sliders, and runs time at real speed, checking that no control or number moves or changes size;
//  - taps the screen in the picture and checks that the target goes there and the eyes follow;
//  - presses Make the target jump, the tick box and a muscle's name.
// Fails on a console error, a jump, a control that moved, a blank picture, or a panel wider than the screen.
//
//   node tests/saccade/page.mjs            # needs Node 22 and Playwright, installed outside the repository
//   node tests/saccade/page.mjs --quick    # desktop only, coarser sweeps
//   node tests/saccade/page.mjs --shots    # also writes a picture of each stop to tests/saccade/out/
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { stamp } from './stamp.mjs';

{ const r = stamp(true); if (r.stale.length) { console.error(`The version stamp is out of date in: ${r.stale.join(', ')}. Run: node tests/saccade/stamp.mjs`); process.exit(1); } }

const root = path.resolve(import.meta.dirname, '../..');
let chromium;
for (const from of [import.meta.url, '/opt/node-tools/', process.execPath, '/']) { try { chromium = createRequire(from)('playwright').chromium; break; } catch { /* try the next place */ } }
if (!chromium) { console.error('Playwright is not installed. Install it outside the repository: npm install -g playwright && npx playwright install chromium'); process.exit(2); }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/saccade/`;
const quick = process.argv.includes('--quick'), shots = process.argv.includes('--shots'), out = path.join(import.meta.dirname, 'out');
if (shots) fs.mkdirSync(out, { recursive: true });

let fails = 0;
const fail = (what) => { fails++; console.log('FAIL ' + what); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

const SNAP = () => { const c = document.getElementById('view'), s = window.__snap || (window.__snap = document.createElement('canvas')); s.width = 64; s.height = 40; const x = s.getContext('2d', { willReadFrequently: true }); window.__saccade.redraw(); x.drawImage(c, 0, 0, 64, 40); return Array.from(x.getImageData(0, 0, 64, 40).data); };
const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return s / (a.length / 4) / 3; };
const spread = (a) => { let lo = 765, hi = 0; for (let i = 0; i < a.length; i += 4) { const v = a[i] + a[i + 1] + a[i + 2]; lo = Math.min(lo, v); hi = Math.max(hi, v); } return hi - lo; };
const SIZES = [['desktop', 1280, 800, 'no-preference'], ['phone, reduced motion', 390, 844, 'reduce']];

for (const [name, width, height, motion] of quick ? SIZES.slice(0, 1) : SIZES) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: motion, hasTouch: width < 600 });
  page.on('console', (m) => { if (m.type() === 'error') fail(`${name}: console: ${m.text()}`); });
  page.on('pageerror', (e) => fail(`${name}: ${e.message}`));
  await page.goto(base + '?res=0.3');
  await page.waitForFunction(() => window.__saccade?.frame && document.getElementById('capTitle').textContent, null, { timeout: 120000 });
  if (!(await page.$eval('#oops', (e) => e.hidden))) { fail(`${name}: the picture could not start`); await page.close(); continue; }
  const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const playing = () => page.evaluate(() => window.__saccade.st.play);
  if (motion === 'reduce' ? await playing() : !(await playing())) fail(`${name}: ${motion === 'reduce' ? 'time ran by itself with reduced motion' : 'time did not start running'}`);
  const settle = async () => { await page.evaluate(() => window.__saccade.settle()); await frame(); };
  const put = async (id, v) => { await page.$eval('#' + id, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, v); await frame(); };
  const fits = async (when) => { const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.getElementById('panel').scrollWidth, document.getElementById('panel').clientWidth]); if (w[0] > width || w[1] > w[2]) fail(`${name}: something is wider than the screen ${when} (${w.join(', ')})`); };
  const IDS = ['zoom', 'conds', 'play', 'speed', 'tspeed', 'auto', 'jump', 'trace', 'gainV', 'overV', 'lastV', 'peakV', 'landV', 'lrV', 'mrV', 'each'];
  const boxes = () => page.evaluate((ids) => { const sc = document.getElementById('panel').scrollTop; return ids.map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [r.x, r.y + sc, r.width, r.height].map((v) => Math.round(v)).join(','); }).join(' | '); }, IDS);   // in the panel's own frame, so that scrolling it is not a move
  const moved = (a, b) => { const A = a.split(' | '), B = b.split(' | '); return IDS.filter((_, i) => A[i] !== B[i]).map((id) => `${id} ${A[IDS.indexOf(id)]} -> ${B[IDS.indexOf(id)]}`).join('; '); };
  async function sweep(id, from, to, steps, when, pic = true) {
    const b0 = await boxes(); let prev = null; const ds = [];
    for (let k = 0; k <= steps; k++) {
      await put(id, from + (to - from) * k / steps); await settle();
      if (!pic) continue;
      const s = await page.evaluate(SNAP); if (prev) ds.push(diff(prev, s)); prev = s;
      if (k === 0 && spread(s) < 30) fail(`${name}: the picture is blank ${when}`);
    }
    ds.forEach((d, k) => {
      const near = ds.filter((_, j) => j !== k && Math.abs(j - k) <= 3).sort((a, b) => a - b), med = near[near.length >> 1] ?? 0;
      if (d > Math.max(6, 3 * med)) fail(`${name}: a jump sweeping ${id} ${when}, at step ${k + 1} of ${steps} (${d.toFixed(1)} against ${med.toFixed(1)} either side)`);
    });
    { const b1 = await boxes(); if (b1 !== b0) fail(`${name}: a control moved while sweeping ${id} ${when}: ${moved(b0, b1)}`); }
  }
  const n = quick ? 16 : 40;

  // every zoom stop and both kinds of pursuit
  for (const i of [0, 1, 2]) {
    await page.click(`#stops button[data-i="${i}"]`); await settle();
    for (const id of ['healthy', 'poor']) {
      await page.click(`#conds button[data-id="${id}"]`); await settle(); await fits(`at ${id}`);
      if (shots) await page.screenshot({ path: path.join(out, `${width > 600 ? 'desktop' : 'phone'}-${i}-${id}.png`) });
    }
  }
  { const a = await boxes(); await page.click('#conds button[data-id="healthy"]'); await frame(); const b = await boxes(); if (a !== b) fail(`${name}: switching the pursuit moved a control: ${moved(a, b)}`); }
  // the zoom, end to end, with time stopped: one camera move, no jumps
  for (const c of ['healthy', 'poor']) { await page.click(`#conds button[data-id="${c}"]`); await frame(); await sweep('zoom', 0, 2, n, `(${c})`); }
  await sweep('speed', 0, 6, 6, '', false); await sweep('tspeed', 5, 40, 7, '', false);
  // time running at real speed for a while: nothing in the panel moves as the numbers change
  await page.click('#stops button[data-i="0"]'); await settle(); await put('speed', 6);
  const b0 = await boxes(), t0 = await page.evaluate(() => window.__saccade.sim.s.t);
  await page.evaluate(() => { window.__saccade.st.play = true; window.__saccade.redraw(); });
  await page.click('#play'); await page.click('#play');                     // pause and play again, by the button
  if (!(await playing())) fail(`${name}: the Play button did not play`);
  await page.waitForTimeout(2500);
  const t1 = await page.evaluate(() => window.__saccade.sim.s.t);
  if (!(t1 > t0)) fail(`${name}: time did not move while playing`);
  { const b1 = await boxes(); if (b1 !== b0) fail(`${name}: a control moved while time ran: ${moved(b0, b1)}`); }
  const ev = await page.evaluate(() => window.__saccade.sim.s.events.length);
  if (!ev) fail(`${name}: no saccades were made`);
  await page.click('#play'); await frame(); if (await playing()) fail(`${name}: Play did not pause`);
  // a tap on the screen in the picture moves the target there, and the eyes follow with a saccade
  const box = await page.evaluate(() => { const s = window.__saccade, f = window.__saccade.frame; for (let y = 120; y < innerHeight - 50; y += 20) for (let x = 0; x < innerWidth; x += 20) { const g = s.pick(x, y); if (g && Math.abs(g[0] - 8) < 1.5 && Math.abs(g[1]) < 3) return [x, y, g]; } return null; });
  if (!box) fail(`${name}: no point of the picture lands on the screen near 8° right`);
  else {
    await page.evaluate(() => { window.__saccade.sim.place([-8, 0]); window.__saccade.sim.advance(1); });
    await page.mouse.click(box[0], box[1]); await frame();
    const r = await page.evaluate(() => { const s = window.__saccade; s.st.play = false; s.sim.advance(0.6); return { T: s.sim.s.T, E: s.sim.s.E, auto: s.st.auto }; });
    if (r.auto) fail(`${name}: a tap on the screen left the target swinging by itself`);
    if (Math.abs(r.T[0] - box[2][0]) > 0.6) fail(`${name}: a tap at ${box[2][0].toFixed(1)}° put the target at ${r.T[0].toFixed(1)}°`);
    if (Math.abs(r.E[0] - r.T[0]) > 0.6) fail(`${name}: the eyes did not reach the target after a tap (${r.E[0].toFixed(1)}° against ${r.T[0].toFixed(1)}°)`);
  }
  await page.click('#jump'); await frame();
  { const r = await page.evaluate(() => { const s = window.__saccade; s.st.play = false; s.sim.advance(0.6); return [s.sim.s.T[0], s.sim.s.E[0]]; }); if (Math.abs(Math.abs(r[0]) - 10) > 1e-6 || Math.abs(r[1] - r[0]) > 0.6) fail(`${name}: Make the target jump: target ${r[0]}°, eyes ${r[1]}°`); }
  await page.click('#auto'); await frame(); if (!(await page.evaluate(() => window.__saccade.st.auto))) fail(`${name}: the tick box did not set the target swinging`);
  await page.click('#each summary'); await page.hover('#muscleList li[data-id="so"] button'); await frame();
  if ((await page.evaluate(() => window.__saccade.st.pick)) !== 'so') fail(`${name}: pointing at a muscle's name did not pick it`);
  await fits('at the end');
  console.log(`${name}: done (${ev} saccades in the real-speed run)`);
  await page.close();
}
await browser.close(); server.close();
if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log('all passed');
