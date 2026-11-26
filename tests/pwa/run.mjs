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
//   5. As a Home Screen app: each launch checks for a new version, and a small note says how it went.
//      Fails if a launch with nothing new does not say "Up to date", if a new version does not reload
//      the page once and say so, or if a failed update, a stopped server or no network says nothing.
import fs from 'node:fs';
import path from 'node:path';
import { build } from '../../.github/sw.mjs';
import { root, findChromium, serve, SOFT_GL } from '../lib/serve.mjs';
import { PAGES as SITE, covers } from '../lib/pages.mjs';

// A piece of each page's own text to look for once it has loaded.
const TEXT = {
  home: 'Science visualizations', rainbows: 'Rainbows', vesicle: 'Vesicle', optics: 'Optics', graph: 'Graph layout',
  maple: 'maple', engine: 'Engine', shoulder: 'Shoulder', saccade: 'saccade', gears: 'Gear', gearsmake: 'Gear',
};
covers(TEXT, 'tests/pwa/run.mjs');
const PAGES = Object.entries(TEXT).map(([name, text]) => [SITE[name], text]);
const FONT_HOSTS = /^fonts\.(googleapis|gstatic)\.com$/, CDN = /^cdn\.jsdelivr\.net$/;

const QUICK = process.argv.includes('--quick'); // home and Rainbows only
let fails = 0;
const fail = (what) => { fails++; console.log('FAIL ' + what); };

// dates.json is written at deploy time; make one as the workflow does, and remove it afterwards.
const madeDates = !fs.existsSync(path.join(root, 'dates.json'));
if (madeDates) { const { execFileSync } = await import('node:child_process'); execFileSync('node', [path.join(root, '.github/dates.mjs')], { cwd: root }); }
process.on('exit', () => { if (madeDates) fs.rmSync(path.join(root, 'dates.json'), { force: true }); });

let sw = build(), changed = null, up = true, bad = null; // bad: a path answered with an error (test 5)
const kept = new Set(JSON.parse(sw.text.match(/^const FILES = (.*);$/m)[1]));
const { server, base } = await serve({
  host: '127.0.0.1', headers: { 'cache-control': 'no-cache' },
  handle(p, req, res) {
    if (!up) { req.socket.destroy(); return true; }
    if (p === bad) { res.writeHead(500); res.end(); return true; }
    if (p === '/sw.js') { res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-cache' }); res.end(sw.text); return true; }
    return false;
  },
  body: (p, data) => (changed && p === changed.path ? Buffer.from(changed.body) : data),
});
// Connections are kept open between requests; "stopping" the server must close them too.
const sockets = new Set(); server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
const down = () => { up = false; for (const s of sockets) s.destroy(); };

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

const browser = await findChromium().launch({ args: SOFT_GL });
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

// 5. The Home Screen app. Each new tab is a launch (a new session); navigator.standalone says "app".
up = true;
const app = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true, serviceWorkers: 'allow' });
await app.addInitScript(() => Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true }));
async function launch(name, expect, { reloads = false } = {}) {
  const page = await app.newPage(), errors = [];
  let loads = 0;
  page.on('load', () => loads++);
  page.on('pageerror', (e) => errors.push(String(e)));
  try { await page.goto(base, { waitUntil: 'load', timeout: 60000 }); } catch (e) { fail(`app ${name}: did not open: ${e.message.split('\n')[0]}`); }
  let said = '';
  for (let i = 0; i < 300 && !said; i++) {
    said = await page.evaluate(() => document.querySelector('.pwa-note')?.textContent || '').catch(() => '');
    if (!said) await page.waitForTimeout(100);
  }
  if (expect === null) { if (said) fail(`app ${name}: said "${said}", expected nothing`); }
  else if (!expect.test(said)) fail(`app ${name}: said "${said || 'nothing'}", expected ${expect}`);
  if (reloads !== (loads > 1)) fail(`app ${name}: ${loads > 1 ? 'reloaded' : 'did not reload'}`);
  for (const e of errors) fail(`app ${name}: ${e.slice(0, 200)}`);
  console.log(`app ${name}: ${said ? '"' + said + '"' : 'no note'}${loads > 1 ? ' (reloaded once)' : ''}`);
  return page;
}
const version = (v) => { sw = { text: sw.text.replace(/^const VERSION = '(\w+)';$/m, `const VERSION = '${v}';`) }; };
version('app0first');
await (await launch('first launch', null)).evaluate(() => navigator.serviceWorker.ready);
await new Promise((r) => setTimeout(r, 1500));
await launch('nothing new', /^Up to date$/);
version('app1update');
const upd = await launch('new version', /^Updated to the latest version$/, { reloads: true });
if (!(await upd.evaluate(() => caches.keys())).includes('site-app1update')) fail('app new version: the new copy is not kept');
version('app2broken'); bad = '/css/slider.css';
await launch('update fails', /^Could not update/);
bad = null; version('app1update');
down();
await launch('server stopped', /^(Could not check|Offline)/);
up = true; await app.setOffline(true);
await launch('no network', /^Offline/);
await app.close();

await browser.close(); server.close();
console.log(fails ? `${fails} failure(s)` : 'all passed');
process.exit(fails ? 1 : 0);
