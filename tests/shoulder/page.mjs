// Opens the Shoulder page at a desktop and a phone size (the phone with reduced motion), then:
//  - presses every condition, exercise, mode and zoom button;
//  - sweeps the Zoom, Lift, Turn and exercise sliders end to end in small steps, comparing each picture with the one
//    before: a step that changes the picture far more than the steps either side of it is reported as a jump;
//  - checks that no slider or button moves or changes size during a sweep;
//  - checks the labels on the picture: on the screen, clear of the panel and of each other;
//  - checks that with reduced motion an exercise does not play by itself;
//  - taps each muscle, sweeps its Contract slider, sweeps the arm's sliders with it pulling, and taps it again to let go.
// Fails on a console error, a jump, a control that moved, a blank picture, labels that overlap, or a panel wider
// than the screen.
//
//   node tests/shoulder/page.mjs            # needs Node 22 and Playwright, installed outside the repository
//   node tests/shoulder/page.mjs --quick    # desktop only, coarser sweeps
//   node tests/shoulder/page.mjs --shots    # also writes a picture of each condition and exercise to tests/shoulder/out/
import fs from 'node:fs';
import path from 'node:path';
import { staleStamp } from '../stamp.mjs';
import { EX_STILL } from '../../js/shoulder/exercises.js';
import { findChromium, serve, SOFT_GL } from '../lib/serve.mjs';

{ const e = staleStamp('shoulder'); if (e) { console.error(e); process.exit(1); } }

const { server, base } = await serve({ at: 'shoulder/' });
const quick = process.argv.includes('--quick'), shots = process.argv.includes('--shots'), out = path.join(import.meta.dirname, 'out');
if (shots) fs.mkdirSync(out, { recursive: true });

let fails = 0;
const fail = (what) => { fails++; console.log('FAIL ' + what); };
const browser = await findChromium().launch({ args: SOFT_GL });

const SNAP = () => { const c = document.getElementById('view'), s = window.__snap || (window.__snap = document.createElement('canvas')); s.width = 64; s.height = 40; const x = s.getContext('2d', { willReadFrequently: true }); window.__shoulder.redraw(); x.drawImage(c, 0, 0, 64, 40); return Array.from(x.getImageData(0, 0, 64, 40).data); };
const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return s / (a.length / 4) / 3; };
const spread = (a) => { let lo = 765, hi = 0; for (let i = 0; i < a.length; i += 4) { const v = a[i] + a[i + 1] + a[i + 2]; lo = Math.min(lo, v); hi = Math.max(hi, v); } return hi - lo; };
const SIZES = [['desktop', 1280, 800, 'no-preference'], ['phone, reduced motion', 390, 844, 'reduce']];

for (const [name, width, height, motion] of quick ? SIZES.slice(0, 1) : SIZES) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: motion, hasTouch: width < 600 });
  page.on('console', (m) => { if (m.type() === 'error') fail(`${name}: console: ${m.text()}`); });
  page.on('pageerror', (e) => fail(`${name}: ${e.message}`));
  await page.goto(base + '?res=0.25');
  await page.waitForFunction(() => window.__shoulder?.frame && document.getElementById('capTitle').textContent, null, { timeout: 120000 });
  if (!(await page.$eval('#oops', (e) => e.hidden))) { fail(`${name}: the picture could not start`); await page.close(); continue; }
  const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const settle = async () => { await page.evaluate(() => window.__shoulder.settle()); await frame(); };
  const put = async (id, v) => { await page.$eval('#' + id, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, v); await frame(); };
  const fits = async (when) => { const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.getElementById('panel').scrollWidth, document.getElementById('panel').clientWidth]); if (w[0] > width || w[1] > w[2]) fail(`${name}: something is wider than the screen ${when} (${w.join(', ')})`); };
  const labels = async (when) => {
    const r = await page.evaluate(() => { const p = document.getElementById('panel').getBoundingClientRect(); return { panel: [p.left, p.top, p.right, p.bottom], tags: [...document.querySelectorAll('.tag')].filter((e) => e.style.display !== 'none' && +e.style.opacity > 0.5).map((e) => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom, e.firstChild.textContent]; }) }; });
    const over = (a, b) => a[0] < b[2] - 1 && b[0] < a[2] - 1 && a[1] < b[3] - 1 && b[1] < a[3] - 1;
    for (const t of r.tags) { if (t[0] < -1 || t[1] < -1 || t[2] > width + 1 || t[3] > height + 1) fail(`${name}: label "${t[4]}" is off the screen ${when}`); if (over(t, r.panel)) fail(`${name}: label "${t[4]}" is under the panel ${when}`); }
    for (let i = 0; i < r.tags.length; i++) for (let j = i + 1; j < r.tags.length; j++) if (over(r.tags[i], r.tags[j])) fail(`${name}: labels "${r.tags[i][4]}" and "${r.tags[j][4]}" overlap ${when}`);
  };
  const boxes = () => page.evaluate(() => ['zoom', 'lift', 'turn', 'phase', 'play', 'flex'].map((id) => { const e = document.getElementById(id); if (e.closest('[hidden]')) return '-'; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v)).join(','); }).join(' | '));
  // a sweep: each step's change of the picture against the median step; also the controls must stay put
  async function sweep(id, from, to, steps, when) {
    const b0 = await boxes(); let prev = null; const ds = [];
    for (let k = 0; k <= steps; k++) {
      await put(id, from + (to - from) * k / steps); await settle();
      const s = await page.evaluate(SNAP); if (prev) ds.push(diff(prev, s)); prev = s;
      if (k === 0 && spread(s) < 30) fail(`${name}: the picture is blank ${when}`);
    }
    // a jump is a step that changes the picture far more than the steps either side of it (some stretches of a
    // sweep change the picture fast all along, which is not a jump)
    ds.forEach((d, k) => {
      const near = ds.filter((_, j) => j !== k && Math.abs(j - k) <= 3).sort((a, b) => a - b), med = near[near.length >> 1] ?? 0;
      if (d > Math.max(6, 3 * med)) fail(`${name}: a jump sweeping ${id} ${when}, at step ${k + 1} of ${steps} (${d.toFixed(1)} against ${med.toFixed(1)} either side)`);
    });
    if ((await boxes()) !== b0) fail(`${name}: a control moved while sweeping ${id} ${when}`);
  }
  const n = quick ? 12 : 30;

  // every zoom stop and every condition, labels checked at each
  for (const i of [0, 1, 2]) {
    await page.click(`#stops button[data-i="${i}"]`); await settle();
    for (const id of await page.$$eval('#conds button', (b) => b.map((x) => x.dataset.id))) {
      await page.click(`#conds button[data-id="${id}"]`); await settle(); await fits(`at ${id}`); await labels(`at stop ${i}, ${id}`);
      if (shots && width > 600) await page.screenshot({ path: path.join(out, `cond-${i}-${id}.png`) });
    }
  }
  // the sliders, in the conditions mode
  await page.click('#conds button[data-id="impingement"]');
  for (const z of [0, 1, 2]) { await put('zoom', z); await sweep('lift', 0, 150, n, `at zoom ${z}`); await labels(`at zoom ${z}, arm lifted`); }
  await put('lift', 45); for (const z of [0, 2]) { await put('zoom', z); await sweep('turn', -60, 60, n, `at zoom ${z}`); }
  await put('lift', 0); await put('turn', 0);
  for (const c of ['healthy', 'full']) { await page.click(`#conds button[data-id="${c}"]`); await sweep('zoom', 0, 2, n * 2, `(${c})`); }

  // each muscle pulling on its own: a tap pulls it, the Contract slider sweeps the pull, a second tap lets go; and
  // with a muscle pulling, the arm's sliders move where the pull starts from, smoothly
  await page.click('#each summary'); await frame();
  for (const id of await page.$$eval('#muscleList li', (l) => l.map((x) => x.dataset.id))) {
    await page.click(`#muscleList li[data-id="${id}"] button`); await settle();
    const st = await page.evaluate(() => ({ flex: window.__shoulder.st.flex, inLi: document.getElementById('flexCtl').parentNode.dataset.id, shown: !document.getElementById('flexCtl').hidden }));
    if (st.flex?.id !== id || st.flex.c !== 1) fail(`${name}: tapping ${id} did not pull it all the way (${JSON.stringify(st.flex)})`);
    if (!st.shown || st.inLi !== id) fail(`${name}: the Contract slider is not under ${id}`);
    for (const z of quick ? [0] : [0, 1]) { await put('zoom', z); await sweep('flex', 0, 100, n, `(${id}, zoom ${z})`); await labels(`(${id} pulling, zoom ${z})`); }
    await put('zoom', 0);
    if (id === 'deltM' || id === 'infra') { await sweep('lift', 0, 150, n, `with ${id} pulling`); await sweep('turn', -60, 60, n, `with ${id} pulling`); await put('lift', 0); await put('turn', 0); }
    await page.click(`#muscleList li[data-id="${id}"] button`); await settle();
    if (await page.evaluate(() => window.__shoulder.st.flex)) fail(`${name}: a second tap on ${id} did not let go`);
    if (await page.isVisible('#flexCtl')) fail(`${name}: the Contract slider stays after ${id} let go`);
  }
  await fits('after the muscles');

  // exercises
  await page.click('[data-mode="exercise"]'); await frame();
  for (const id of await page.$$eval('#exs button', (b) => b.map((x) => x.dataset.id))) {
    await page.click(`#exs button[data-id="${id}"]`); await frame();
    const playing = await page.evaluate(() => window.__shoulder.st.play);
    // a held pose (a plank) has no Play and no slider, and must not play
    if (EX_STILL.has(id)) {
      if (playing) fail(`${name}: the held ${id} pose plays`);
      if (await page.isVisible('#exPlay')) fail(`${name}: the held ${id} pose shows Play and the slider`);
      for (const z of quick ? [0] : [0, 1]) { await put('zoom', z); await labels(`(${id}, zoom ${z})`); }
      if (shots && width > 600) { await settle(); await page.screenshot({ path: path.join(out, `ex-${id}.png`) }); }
      continue;
    }
    if (!(await page.isVisible('#exPlay'))) fail(`${name}: the ${id} exercise has no Play`);
    if (motion === 'reduce' ? playing : !playing) fail(`${name}: the ${id} exercise ${motion === 'reduce' ? 'played by itself with reduced motion' : 'did not start playing'}`);
    for (const z of quick ? [0] : [0, 1]) { await put('zoom', z); await sweep('phase', 0, 1000, n, `(${id}, zoom ${z})`); await labels(`(${id}, zoom ${z})`); }
    if (shots && width > 600) { await put('phase', 500); await settle(); await page.screenshot({ path: path.join(out, `ex-${id}.png`) }); }
  }
  await page.click('#exs button[data-id="external"]'); await frame(); if (await page.evaluate(() => window.__shoulder.st.play)) { await page.click('#play'); await frame(); }
  await page.click('#play'); await frame(); if (!(await page.evaluate(() => window.__shoulder.st.play))) fail(`${name}: Play did not start the exercise`);
  await page.click('#play'); await frame(); if (await page.evaluate(() => window.__shoulder.st.play)) fail(`${name}: Play did not pause`);
  await fits('after the exercises');
  console.log(`${name}: done`);
  await page.close();
}
await browser.close(); server.close();
if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log('all passed');
