// Checks that the site installs as a Home Screen app and works with no network.
//
//   node tests/pwa/run.mjs           # needs Node 22 and Playwright, installed outside the repository
//   node tests/pwa/run.mjs --quick   # the landing page and Rainbows only
//
// It serves the repository on 127.0.0.1 (js/pwa.js skips the service worker on "localhost"), with
// sw.js filled in by .github/sw.mjs as a deploy would. Then:
//   1. The manifest names its icons, and each icon is the size it says.
//   2. Each page is opened with the network up. Fails if a page asks for a file of this site that the
//      service worker does not keep, or for anything on another host besides the web fonts (and, on
//      Graph layout only, the real ELK and TALA, which load when asked).
//   3. The server is stopped and each page is opened again. Fails if any file of the site does not
//      arrive, on a console error, or if a page's own text is missing.
//   4. The server comes back with one file changed. Fails if the page does not get the new file at
//      once, or if the service worker does not install the new version and drop the old copy.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { build } from '../../.github/sw.mjs';

const root = path.resolve(import.meta.dirname, '../..');
let chromium;
for (const from of [import.meta.url, '/opt/node-tools/', process.execPath]) { try { chromium = createRequire(from)('playwright').chromium; break; } catch { /* try the next place */ } }
if (!chromium) { console.error('Playwright is not installed. Install it outside the repository: npm install -g playwright && npx playwright install chromium'); process.exit(2); }

// The pages, and a piece of each one's own text to look for once it has loaded.
const PAGES = [
  ['', 'Science visualizations'], ['v2/', 'Rainbows'], ['vesicle/', 'Vesicle'], ['optics/', 'Optics'],
  ['dag/', 'Graph layout'], ['maple/', 'maple'], ['engine/', 'Engine'], ['shoulder/', 'Shoulder'],
  ['saccade/', 'saccade'], ['gears/', 'Gear'], ['gears/make.html', 'Gear'],
];
const FONT_HOSTS = /^fonts\.(googleapis|gstatic)\.com$/, CDN = /^cdn\.jsdelivr\.net$/;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.yaml': 'text/yaml', '.bin': 'application/octet-stream' };

const QUICK = process.argv.includes('--quick'); // home and Rainbows only
let fails = 0;
const fail = (what) => { fails++; console.log('FAIL ' + what); };

// dates.json is written at deploy time; make one as the workflow does, and remove it afterwards.
const madeDates = !fs.existsSync(path.join(root, 'dates.json'));
if (madeDates) { const { execFileSync } = await import('node:child_process'); execFileSync('node', [path.join(root, '.github/dates.mjs')], { cwd: root }); }
process.on('exit', () => { if (madeDates) fs.rmSync(path.join(root, 'dates.json'), { force: true }); });

let sw = build(), changed = null, up = true;
const kept = new Set(JSON.parse(sw.text.match(/^const FILES = (.*);$/m)[1]));
const server = http.createServer((req, res) => {
  if (!up) { req.socket.destroy(); return; }
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/sw.js') { res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-cache' }); res.end(sw.text); return; }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(file);
  if (changed && p === changed.path) body = Buffer.from(changed.body);
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(body);
});
// Connections are kept open between requests; "stopping" the server must close them too.
const sockets = new Set(); server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
const down = () => { up = false; for (const s of sockets) s.destroy(); };
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

// 1. The manifest and its icons.
const man = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
if (man.display !== 'standalone' || man.start_url !== './' || man.scope !== './') fail('manifest: display, start_url or scope');
for (const ic of man.icons) {
  const f = path.join(root, ic.src);
  if (!fs.existsSync(f)) { fail(`manifest: no ${ic.src}`); continue; }
  const b = fs.readFileSync(f), [w, h] = [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (`${w}x${h}` !== ic.sizes) fail(`manifest: ${ic.src} is ${w}x${h}, not ${ic.sizes}`);
  if (!kept.has(ic.src)) fail(`manifest: ${ic.src} is not kept`);
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'allow' });

async function open(url, name, offline) {
  const page = await ctx.newPage(), seen = [], errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => seen.push(r.url()));
  page.on('requestfailed', (r) => { const u = new URL(r.url()); if (u.origin + '/' === base) fail(`${name}: ${u.pathname} did not arrive (${r.failure()?.errorText})`); });
  try { await page.goto(base + url, { waitUntil: 'load', timeout: 60000 }); } catch (e) { fail(`${name}: did not open: ${e.message.split('\n')[0]}`); await page.close(); return null; }
  await page.waitForTimeout(1500);
  for (const e of errors) fail(`${name}: console: ${e.slice(0, 200)}`);
  return { page, seen };
}

// 2. Every page with the network up.
const first = await open('', 'online home');
await first.page.evaluate(() => navigator.serviceWorker.ready);
await first.page.reload(); // now under the service worker's control
if (!(await first.page.evaluate(() => !!navigator.serviceWorker.controller))) fail('the service worker does not control the page');
await first.page.close();
for (const [url, text] of (QUICK ? PAGES.slice(0, 2) : PAGES)) {
  const r = await open(url, 'online ' + (url || 'home'));
  if (!r) continue;
  if (url === 'dag/') { await r.page.selectOption('#graph', 'topology'); await r.page.waitForTimeout(800); }
  for (const s of r.seen) {
    const u = new URL(s);
    if (u.origin + '/' === base) {
      const key = u.pathname.slice(1).replace(/(^|\/)index\.html$/, '$1');
      if (key !== 'sw.js' && !kept.has(key)) fail(`${url || 'home'}: loads ${key}, which the service worker does not keep`);
    } else if (!FONT_HOSTS.test(u.hostname) && !(url === 'dag/' && CDN.test(u.hostname)) && u.protocol.startsWith('http')) fail(`${url || 'home'}: loads ${u.href} from another host`);
  }
  if (!(await r.page.locator('body').innerText()).includes(text)) fail(`online ${url || 'home'}: no "${text}" on the page`);
  await r.page.close();
}
console.log(`online: ${PAGES.length} pages, ${kept.size} files kept`);

// 3. No network.
down();
for (const [url, text] of (QUICK ? PAGES.slice(0, 2) : PAGES)) {
  const r = await open(url, 'offline ' + (url || 'home'), true);
  if (!r) continue;
  if (url === 'dag/') { await r.page.selectOption('#graph', 'topology'); await r.page.waitForTimeout(800); if ((await r.page.locator('#status').innerText()).includes('could not be loaded')) fail('offline dag/: the topology file did not load'); }
  if (!(await r.page.locator('body').innerText()).includes(text)) fail(`offline ${url || 'home'}: no "${text}" on the page`);
  const fonts = await r.page.evaluate(() => document.fonts.ready.then(() => [...document.fonts].filter((f) => f.status === 'loaded').length));
  if (!fonts) console.log(`note: offline ${url || 'home'}: no web font loaded (fallback fonts in use)`);
  await r.page.close();
}
console.log('offline: done');

// 4. A deploy that changes a file: the page gets it at once, and the new copy replaces the old.
up = true;
changed = { path: '/js/home.js', body: fs.readFileSync(path.join(root, 'js/home.js'), 'utf8') + '\nwindow.__changed = 1;\n' };
sw = { text: sw.text.replace(/^const VERSION = '(\w+)';$/m, "const VERSION = 'changed1234';") };
const p = (await open('', 'after a deploy')).page;
if (!(await p.evaluate(() => window.__changed))) fail('after a deploy: the page did not get the changed file');
await p.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
const swapped = await p.evaluate(async () => {
  for (let i = 0; i < 300; i++) {
    const k = await caches.keys();
    if (k.includes('site-changed1234') && !k.some((x) => x.startsWith('site-') && x !== 'site-changed1234')) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
});
if (!swapped) fail('after a deploy: the new version did not replace the old copy');
down();
await p.reload();
if (!(await p.evaluate(() => window.__changed))) fail('after a deploy, offline: the kept copy is the old file');

await browser.close(); server.close();
console.log(fails ? `${fails} failure(s)` : 'all passed');
process.exit(fails ? 1 : 0);
