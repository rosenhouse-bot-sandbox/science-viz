// Shoulder: pictures of randomly chosen states of the page, for the review pass (a reviewer who has not seen the
// code checks each picture and its words against anatomy and the medical literature). Seeded, so that a finding
// can be shown again with the same seed.
//
//   node tests/shoulder/shots.mjs [count] [seed]     # writes tests/shoulder/out/review/NN.png and states.json
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
let chromium;
for (const from of [import.meta.url, '/opt/node-tools/', process.execPath, '/']) { try { chromium = createRequire(from)('playwright').chromium; break; } catch { /* try the next place */ } }
if (!chromium) { console.error('Playwright is not installed.'); process.exit(2); }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const N = +(process.argv[2] || 30), SEED = +(process.argv[3] || 1);
let seed = SEED; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296), pick = (a) => a[Math.floor(rnd() * a.length)];
const out = path.join(import.meta.dirname, 'out/review'); fs.mkdirSync(out, { recursive: true });
const CONDS = ['healthy', 'tendinopathy', 'partial', 'full', 'bursitis', 'impingement'], EXS = ['pendulum', 'sleeper', 'external', 'internal', 'external90'];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('page error: ' + e.message));
await page.goto(`http://localhost:${server.address().port}/shoulder/`);
await page.waitForFunction(() => window.__shoulder?.frame, null, { timeout: 120000 });
const states = [];
for (let i = 0; i < N; i++) {
  const z = pick([0, 1, 2, 2, rnd() * 2]).toFixed(2), ex = rnd() < 0.3;
  const h = ex ? `z=${z}&ex=${pick(EXS)}&p=${rnd().toFixed(3)}` : `z=${z}&c=${pick(CONDS)}&lift=${Math.round(pick([0, rnd() * 150, rnd() * 150]))}&turn=${Math.round(pick([0, rnd() * 120 - 60]))}`;
  await page.evaluate((h) => { location.hash = h; }, h);
  await page.evaluate(() => { __shoulder.st.yaw = 0; __shoulder.st.pitch = 0; __shoulder.settle(); __shoulder.redraw(); });
  const info = await page.evaluate(() => ({
    title: document.getElementById('capTitle').textContent, body: document.getElementById('capBody').textContent, note: document.getElementById('note').textContent,
    numbers: [...document.querySelectorAll('#nums > div')].map((d) => d.querySelector('dd').textContent + ' ' + d.querySelector('dt').textContent),
    labels: [...document.querySelectorAll('.tag')].filter((e) => e.style.display !== 'none' && +e.style.opacity > 0.5).map((e) => e.textContent),
    muscles: [...document.querySelectorAll('#muscleList li')].map((li) => li.querySelector('span').textContent + ' ' + li.querySelector('b').textContent),
    zoom: document.getElementById('zoomV').textContent,
  }));
  const file = String(i + 1).padStart(2, '0') + '.png';
  await page.screenshot({ path: path.join(out, file) });
  states.push({ file, hash: h, ...info });
  console.log(file, h);
}
fs.writeFileSync(path.join(out, 'states.json'), JSON.stringify({ seed: SEED, states }, null, 1));
await browser.close(); server.close();
