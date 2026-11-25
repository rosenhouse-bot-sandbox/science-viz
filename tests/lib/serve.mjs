// What the browser tests share: the repository's root, Playwright's Chromium, and a small web server for the site.
//
//   import { root, findChromium, serve, SOFT_GL } from '../lib/serve.mjs';
//   const { base, close } = await serve({ at: 'maple/' });
//   const browser = await findChromium().launch({ args: SOFT_GL });
//
// Playwright is not part of the repository (see CLAUDE.md); it is looked for where it is usually installed.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export const root = path.resolve(import.meta.dirname, '../..');

// WebGL drawn in software, for a machine with no graphics card
export const SOFT_GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

let found;
export function findChromium() {
  if (found) return found;
  for (const from of [import.meta.url, '/opt/node-tools/', process.execPath, '/']) { try { found = createRequire(from)('playwright').chromium; return found; } catch { /* try the next place */ } }
  console.error('Playwright is not installed. Install it outside the repository: npm install -g playwright && npx playwright install chromium');
  process.exit(2);
}

export const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.yaml': 'text/yaml', '.bin': 'application/octet-stream',
};

// Serves the repository as GitHub Pages does. Options:
//   at       the part of the address after the host that `base` ends with ('maple/'); '' for the site's root
//   host     'localhost' (the default) or '127.0.0.1'. js/pwa.js skips the service worker on localhost only.
//   headers  more response headers for every file, such as { 'cache-control': 'no-cache' }
//   handle   (p, req, res) => true when it has answered the request itself; p is the decoded path
//   body     (p, buffer) => what to send for that file instead of what is on disk
export async function serve({ at = '', host = 'localhost', headers = {}, handle, body } = {}) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (handle && handle(p, req, res)) return;
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(root, p);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    let data = fs.readFileSync(file);
    if (body) data = body(p, data);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', ...headers }); res.end(data);
  });
  await new Promise((r) => server.listen(0, host, r));
  const origin = `http://${host}:${server.address().port}`;
  return { server, origin, base: `${origin}/${at}`, close: () => server.close() };
}
