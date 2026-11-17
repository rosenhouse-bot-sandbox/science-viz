// Opens the Engine page at a desktop and a phone size (and the phone again with reduced motion), then:
//  - presses every scale button and Play, and works both sliders with the keyboard;
//  - checks that Play loops over the burn at the Flame and Molecules scales, and that time is slower further in;
//  - checks that the zoom and the crank angle never move in the same frame;
//  - checks the labels on the picture: on the screen, clear of the panel and of each other, and not too many at once;
//  - sweeps the Zoom slider end to end at three crank angles and the cycle slider end to end at every scale, one
//    small step at a time, comparing each picture with the one before. A step that changes the picture far more
//    than its neighbours do is reported as a jump;
//  - checks that neither slider nor the Play button moves or changes size during a sweep.
// Fails on a console error, a jump, a control that moved, a blank picture, or a panel wider than the screen.
//
//   node tests/engine/page.mjs            # needs Node 22 and Playwright, installed outside the repository
//   node tests/engine/page.mjs --shots    # also writes pictures of each scale to tests/engine/out/
//   node tests/engine/page.mjs --quick    # desktop only, coarser sweeps
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { stamp } from './stamp.mjs';

{ const r = stamp(true); if (r.stale.length) { console.error(`The version stamp is out of date in: ${r.stale.join(', ')}. Run: node tests/engine/stamp.mjs`); process.exit(1); } }

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
const base = `http://localhost:${server.address().port}/engine/`;
const shots = process.argv.includes('--shots'), quick = process.argv.includes('--quick'), out = path.join(import.meta.dirname, 'out');
if (shots) fs.mkdirSync(out, { recursive: true });

let fails = 0;
const fail = (what) => { fails++; console.log('FAIL ' + what); };
// The picture is WebGL. Without a graphics card Chromium draws it in software, which these switches allow.
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

// In the page: a small copy of the picture, as numbers.
const SNAP = () => { const c = document.getElementById('view'), s = window.__snap || (window.__snap = document.createElement('canvas')); s.width = 64; s.height = 40; const x = s.getContext('2d', { willReadFrequently: true }); window.__engine.redraw(); x.drawImage(c, 0, 0, 64, 40); return Array.from(x.getImageData(0, 0, 64, 40).data); };
const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return s / (a.length / 4) / 3; };
const spread = (a) => { let lo = 765, hi = 0; for (let i = 0; i < a.length; i += 4) { const v = a[i] + a[i + 1] + a[i + 2]; lo = Math.min(lo, v); hi = Math.max(hi, v); } return hi - lo; };
const SIZES = [['desktop', 1280, 800, 'no-preference'], ['phone', 390, 844, 'no-preference'], ['phone, reduced motion', 390, 844, 'reduce']];

for (const [name, width, height, motion] of quick ? SIZES.slice(0, 1) : SIZES) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: motion, hasTouch: width < 600 });
  page.on('console', (m) => { if (m.type() === 'error') fail(`${name}: console: ${m.text()}`); });
  page.on('pageerror', (e) => fail(`${name}: ${e.message}`));
  await page.goto(base + '?res=0.2');                             // a fifth of the pixels each way: drawn in software, the full picture takes seconds a frame
  await page.waitForFunction(() => window.__engine && document.getElementById('capTitle').textContent, null, { timeout: 120000 });
  if (!(await page.$eval('#oops', (e) => e.hidden))) { fail(`${name}: the picture could not start`); await page.close(); continue; }
  const state = () => page.evaluate(() => ({ ...window.__engine.st, busy: window.__engine.busy }));
  const idle = async () => { await page.evaluate(() => window.__engine.settle()); await page.waitForFunction(() => !window.__engine.busy, null, { timeout: 240000 }); };
  const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const put = async (id, v) => { await page.$eval('#' + id, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, v); await frame(); };
  const boxes = () => page.evaluate(() => ['zoom', 'cycle', 'play'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10).join(','); }).join(' | '));
  const fits = async (when) => { const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.getElementById('panel').scrollWidth, document.getElementById('panel').clientWidth]); if (w[0] > width || w[1] > w[2]) fail(`${name}: something is wider than the screen ${when} (${w.join(', ')})`); };

  // starting: the engine runs by itself unless the visitor asked for reduced motion
  if (motion === 'reduce') await page.waitForTimeout(1800); else await page.waitForFunction(() => window.__engine.st.play, null, { timeout: 20000 }).catch(() => {});
  let s = await state();
  if (motion === 'reduce' ? s.play : !s.play) fail(`${name}: the engine ${motion === 'reduce' ? 'ran by itself with reduced motion' : 'did not start running'}`);
  await page.click('#play'); await frame();
  if (motion !== 'reduce') { if ((await state()).play) fail(`${name}: Play did not pause`); if (await page.getAttribute('#play', 'aria-label') !== 'Play') fail(`${name}: the Play button's name did not change back`); }
  else { if (!(await state()).play) fail(`${name}: Play did not start the engine when pressed`); await page.click('#play'); }

  // every scale button; with reduced motion the change is immediate
  const stops = await page.$$('#stops button');
  if (stops.length !== 5) fail(`${name}: expected five scales, found ${stops.length}`);
  const titles = new Set();
  for (let i = stops.length - 1; i >= 0; i--) {
    await put('cycle', i === 4 ? 362 : i === 3 ? 360 : 95);
    await stops[i].click();
    if (motion === 'reduce') { await frame(); if (Math.abs((await state()).z - i) > 1e-6) fail(`${name}: with reduced motion the zoom did not go straight to scale ${i}`); }
    await idle(); await frame(); await page.waitForTimeout(250);
    s = await state();
    if (Math.abs(s.z - i) > 1e-6) fail(`${name}: scale button ${i} left the zoom at ${s.z}`);
    if (spread(await page.evaluate(SNAP)) < 30) fail(`${name}: nothing drawn at scale ${i}`);
    await fits(`at scale ${i}`);
    titles.add(await page.textContent('#capTitle'));
    if (await page.getAttribute(`#stops button:nth-child(${i + 1})`, 'aria-current') !== 'true') fail(`${name}: scale button ${i} is not marked as the current one`);
    if (shots) await page.screenshot({ path: path.join(out, `${name.replace(/\W+/g, '-')}-${i}.png`) });
    // the labels on the picture
    const L = await page.evaluate(() => { const pr = document.getElementById('panel').getBoundingClientRect(); return { panel: [pr.left, pr.top, pr.right, pr.bottom], tags: [...document.querySelectorAll('#labels .tag')].filter((e) => e.style.display !== 'none' && +e.style.opacity > 0.5).map((e) => { const r = e.getBoundingClientRect(); return { t: e.firstChild.textContent, num: e.classList.contains('num'), r: [r.left, r.top, r.right, r.bottom] }; }) }; });
    const hit = (a, b) => a[0] < b[2] - 1 && a[2] > b[0] + 1 && a[1] < b[3] - 1 && a[3] > b[1] + 1;
    if (i === 0 && L.tags.length) fail(`${name}: labels are shown at the Car scale`);
    if (i > 0 && !L.tags.length) fail(`${name}: no labels at scale ${i}`);
    if (L.tags.filter((t) => !t.num).length > 7) fail(`${name}: ${L.tags.length} labels at once at scale ${i}`);
    for (const t of L.tags) {
      if (t.r[0] < -1 || t.r[1] < -1 || t.r[2] > width + 1 || t.r[3] > height + 1) fail(`${name}: the label "${t.t}" runs off the screen at scale ${i}`);
      if (hit(t.r, L.panel)) fail(`${name}: the label "${t.t}" is over the panel at scale ${i}`);
      for (const u of L.tags) if (u !== t && !t.num && !u.num && hit(t.r, u.r)) fail(`${name}: the labels "${t.t}" and "${u.t}" overlap at scale ${i}`);
    }
    // the numbers come from the model
    if (i === 4) {
      if (!/2 C₈H₁₈ \+ 25 O₂ → 16 CO₂ \+ 18 H₂O/.test(await page.textContent('#eq'))) fail(`${name}: the reaction is not shown at Molecules`);
    } else if (!(await page.$eval('#eq', (e) => e.hidden))) fail(`${name}: the reaction is shown at scale ${i}`);
    if (i > 0) { const want = await page.evaluate(() => { const m = window.__engine.model; return m.pressure(window.__engine.st.phi) / m.ATM; }), got = parseFloat((await page.textContent('#n2v')).replace(',', '')); if (Math.abs(got - want) > 0.51) fail(`${name}: the pressure shown (${got}) is not the model's (${want.toFixed(2)}) at scale ${i}`); }
  }
  if (titles.size !== 5) fail(`${name}: the caption did not change at every scale`);

  // the four strokes each have their own text at the Cylinder scale
  await put('zoom', 2);
  { const t = new Set(); for (const a of [90, 270, 450, 630]) { await put('cycle', a); await page.waitForTimeout(260); t.add(await page.textContent('#capTitle')); } if (t.size !== 4) fail(`${name}: the caption does not name four strokes (${[...t].join('; ')})`); }

  // keyboard: both sliders and Play
  await put('zoom', 1); await put('cycle', 100); await page.focus('#zoom'); await page.keyboard.press('ArrowRight'); await frame();
  if (!((await state()).z > 1)) fail(`${name}: the arrow key did not move the Zoom slider`);
  await page.focus('#cycle'); await page.keyboard.press('ArrowRight'); await frame();
  if (Math.abs((await state()).phi - 105) > 1e-6) fail(`${name}: the arrow key did not move the cycle slider`);
  await page.focus('#play'); await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__engine.st.phi > 105.5, null, { timeout: 60000 }).catch(() => fail(`${name}: Space on Play did not turn the engine`));
  await page.keyboard.press('Space');
  if ((await state()).play) fail(`${name}: Space on Play did not pause`);
  if (!(await page.getAttribute('#zoom', 'aria-valuetext')) || !/\d+ degrees, \w+/.test(await page.getAttribute('#cycle', 'aria-valuetext'))) fail(`${name}: a slider has no spoken value`);

  // Play loops over the burn at Flame and at Molecules
  for (const [z, lo, hi] of [[3, 325, 402], [4, 350, 372]]) {
    await put('zoom', z); await put('cycle', 100); await idle(); await page.click('#play');
    await page.waitForTimeout(1500); const a = (await state()).phi; await page.waitForTimeout(1500); const b = (await state()).phi;
    if (a < lo || a > hi || b < lo || b > hi) fail(`${name}: Play at scale ${z} left the burn (${a.toFixed(1)}°, ${b.toFixed(1)}°)`);
    if (a === b) fail(`${name}: Play at scale ${z} does not move`);
    await page.click('#play');
  }
  // time is slower further in
  { const slow = []; for (const z of [0, 1, 2, 3, 4]) { await put('zoom', z); slow.push(await page.textContent('#slowV')); }
    const n = slow.map((t) => (t === 'Real speed' ? 1 : +t.replace(/[^0-9]/g, '')));
    for (let i = 1; i < 5; i++) if (!(n[i] > n[i - 1])) fail(`${name}: time is not slower at scale ${i} than at scale ${i - 1} (${slow.join(', ')})`); }

  // the zoom and the crank angle never move in the same frame
  if (name === 'desktop') {
    await put('cycle', 300); await put('zoom', 1); await idle();
    await page.evaluate(() => { const d = window.__engine.drawn; let z = d.z, a = d.phi; window.__both = 0; window.__watch = true; const tick = () => { if (d.z !== z && d.phi !== a) window.__both++; z = d.z; a = d.phi; if (window.__watch) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    await page.click('#play'); await page.waitForTimeout(900);
    await stops[2].click(); await page.waitForTimeout(200);
    const a0 = (await state()).phi; await page.waitForTimeout(900);
    if ((await state()).phi !== a0 && (await state()).z !== 2) fail(`${name}: the engine turned during a flight between scales`);
    await page.waitForFunction(() => window.__engine.st.z === 2, null, { timeout: 600000 });
    await page.waitForFunction((a0) => window.__engine.st.phi !== a0, a0, { timeout: 120000 }).catch(() => fail(`${name}: the engine did not go on after the flight ended`));
    await page.focus('#zoom'); for (let i = 0; i < 8; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(40); }
    await stops[1].click(); await page.waitForTimeout(500); await put('cycle', 400); await page.waitForTimeout(100); await put('cycle', 410);
    await page.waitForFunction(() => window.__engine.st.z === 1, null, { timeout: 600000 });
    const both = await page.evaluate(() => { window.__watch = false; return window.__both; });
    if (both) fail(`${name}: the zoom and the crank angle moved together in ${both} frames`);
    if ((await state()).play) fail(`${name}: moving the cycle slider did not pause the engine`);
    if (!(await page.$eval('#oops', (e) => e.hidden))) fail(`${name}: the "could not be drawn" notice is showing`);
  }

  // sweeps: no jumps in the picture, and no control moves
  await put('zoom', 0); await put('cycle', 95); await idle();
  const home = await boxes();
  const sweep = async (id, from, to, step, what) => {
    const r = await page.evaluate(async ([id, from, to, step, home]) => {
      const el = document.getElementById(id), c = document.getElementById('view'), s = document.createElement('canvas'); s.width = 64; s.height = 40;
      const x = s.getContext('2d', { willReadFrequently: true }), d = []; let prev = null, moved = null, n = 0;
      const boxes = () => ['zoom', 'cycle', 'play'].map((i) => { const r = document.getElementById(i).getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10).join(','); }).join(' | ');
      for (let v = from; step > 0 ? v <= to + 1e-9 : v >= to - 1e-9; v += step) {
        el.value = v; el.dispatchEvent(new Event('input', { bubbles: true }));
        if (n++ % 10 === 0) await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        window.__engine.redraw(); x.drawImage(c, 0, 0, 64, 40); const pic = x.getImageData(0, 0, 64, 40).data;
        if (prev) { let t = 0; for (let i = 0; i < pic.length; i += 4) t += Math.abs(pic[i] - prev[i]) + Math.abs(pic[i + 1] - prev[i + 1]) + Math.abs(pic[i + 2] - prev[i + 2]); d.push([t / (pic.length / 4) / 3, v]); }
        prev = pic;
        if (n % 10 === 1 && moved === null && boxes() !== home) moved = v;
      }
      return { d, moved };
    }, [id, from, to, step, home]);
    if (r.moved !== null) fail(`${name}: a slider or Play moved during ${what}, at ${id} = ${r.moved}`);
    const d = r.d;
    if (d.length < 20) fail(`${name}: ${what} took only ${d.length} steps`);
    for (let i = 0; i < d.length; i++) {
      const near = d.slice(Math.max(0, i - 6), i + 7).map((x) => x[0]).sort((a, b) => a - b), med = near[Math.floor(near.length / 2)];
      if (d[i][0] > 9 && d[i][0] > 5 * med + 4) fail(`${name}: the picture jumps during ${what}, at ${id} = ${d[i][1].toFixed(3)} (changed ${d[i][0].toFixed(1)}, neighbours ${med.toFixed(1)})`);
    }
    console.log(`  ${name}: ${what}: ${d.length} steps, largest change ${Math.max(...d.map((x) => x[0])).toFixed(1)}`);
  };
  if (name === 'desktop' || motion === 'reduce') {                                   // the phone without reduced motion draws the same pictures as with it
    const full = name === 'desktop' && !quick;
    for (const a of full ? [95, 362, 600] : [362]) { await put('cycle', a); await sweep('zoom', 0, 4, full ? 0.01 : 0.02, `a zoom in at ${a}°`); }
    for (const z of full ? [0, 1, 2, 3] : [2]) { await put('zoom', z); await sweep('cycle', 0, 720, full ? 2 : 4, `one cycle at scale ${z}`); }
    await put('zoom', 3); await sweep('cycle', 325, 402, 0.5, 'the burn at the Flame scale');
    await put('zoom', 4); await sweep('cycle', 352, 372, 0.5, 'the burn at the Molecules scale');
  }
  await fits('at the end');
  await page.close();
}
await browser.close(); server.close();
console.log(fails ? `${fails} failed` : 'engine page: all checks passed');
process.exit(fails ? 1 : 0);
