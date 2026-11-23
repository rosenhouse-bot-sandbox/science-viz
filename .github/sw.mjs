// Writes the service worker's file list and version into sw.js. The Pages workflow runs this just
// before it uploads the site (after dates.mjs, so dates.json is on the list); the result is
// published but never committed, so the list can never be out of date.
//
//   node .github/sw.mjs          (rewrites sw.js in place; do not commit the result)
//
// The list is every file a page can load: each page (a folder with an index.html, kept as "dag/"),
// the other HTML pages beside them, the other files in those folders, and everything under js/,
// css/ and img/. Notes (*.md), tests/, drafts/ and dotfiles are left out.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SKIP = new Set(['tests', 'drafts', 'node_modules']);

function walk(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) => {
    const rel = dir ? dir + '/' + d.name : d.name;
    if (d.name.startsWith('.')) return [];
    return d.isDirectory() ? walk(rel) : [rel];
  });
}

export function siteFiles() {
  const top = fs.readdirSync(ROOT, { withFileTypes: true });
  const pages = top.filter((d) => d.isDirectory() && !d.name.startsWith('.') && !SKIP.has(d.name) && fs.existsSync(path.join(ROOT, d.name, 'index.html'))).map((d) => d.name);
  const files = ['index.html', 'manifest.webmanifest', ...['dates.json'].filter((f) => fs.existsSync(path.join(ROOT, f)))];
  for (const dir of [...pages, 'js', 'css', 'img']) files.push(...walk(dir));
  return files.filter((f) => !f.endsWith('.md')).sort();
}

// The address each file is kept under: a folder's index.html is kept as the folder.
export const keyOf = (f) => f.replace(/(^|\/)index\.html$/, '$1');

// The Google Fonts stylesheets the pages ask for.
export function fontSheets(files) {
  const out = new Set();
  for (const f of files.filter((x) => x.endsWith('.html'))) {
    for (const [, u] of fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(/href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/g)) out.add(u.replaceAll('&amp;', '&'));
  }
  return [...out].sort();
}

export function build() {
  const files = siteFiles(), h = createHash('sha256');
  for (const f of files) { h.update(f + '\0'); h.update(fs.readFileSync(path.join(ROOT, f))); }
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const js = (v) => JSON.stringify(v, null, 1).replace(/\n\s*/g, ' ');
  const out = sw
    .replace(/^const VERSION = .*;$/m, `const VERSION = '${h.digest('hex').slice(0, 12)}';`)
    .replace(/^const FILES = .*;$/m, `const FILES = ${js(files.map(keyOf))};`)
    .replace(/^const FONTS = .*;$/m, `const FONTS = ${js(fontSheets(files))};`);
  if (out === sw) throw new Error('sw.js has no VERSION, FILES and FONTS lines to fill in');
  return { text: out, files };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { text, files } = build();
  fs.writeFileSync(path.join(ROOT, 'sw.js'), text);
  console.log(`sw.js: ${files.length} files`);
}
