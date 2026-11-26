// Every page of the site, by the name the tests use, and its address under the site's root. A new page goes here,
// and then every test that keeps its own table of pages fails until that table has the page too.
import fs from 'node:fs';
import path from 'node:path';
import { root } from './serve.mjs';

export const PAGES = {
  home: '', rainbows: 'rainbows/', vesicle: 'vesicle/', optics: 'optics/', graph: 'dag/', maple: 'maple/',
  engine: 'engine/', shoulder: 'shoulder/', saccade: 'saccade/', gears: 'gears/', gearsmake: 'gears/make.html',
};

// Pages on disk that are not in PAGES: a folder with an index.html, or another .html beside one. drafts/ is not part of the site.
// v2/ only sends an old link on to rainbows/ (js/moved.js), so it is not a page to test.
const MOVED = ['v2/index.html'];
export function unlisted() {
  const listed = new Set(Object.values(PAGES).map((u) => (u.endsWith('/') || u === '' ? u + 'index.html' : u)));
  const found = ['index.html'];
  for (const d of fs.readdirSync(root, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.startsWith('.') || ['tests', 'drafts', 'js', 'css', 'img', 'node_modules'].includes(d.name)) continue;
    const dir = path.join(root, d.name);
    if (!fs.existsSync(path.join(dir, 'index.html'))) continue;
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.html')) found.push(`${d.name}/${f}`);
  }
  return found.filter((f) => !listed.has(f) && !MOVED.includes(f));
}

// Stops a test whose own table (by page name) is missing a page, or names one that does not exist.
// `extra` are names the table may have that are not pages (the gamepad test's Deck).
export function covers(table, test, extra = []) {
  const missing = Object.keys(PAGES).filter((n) => !(n in table));
  const unknown = Object.keys(table).filter((n) => !(n in PAGES) && !extra.includes(n));
  const loose = unlisted();
  if (!missing.length && !unknown.length && !loose.length) return;
  if (loose.length) console.error(`Pages not in tests/lib/pages.mjs: ${loose.join(', ')}`);
  if (missing.length) console.error(`${test} has no entry for: ${missing.join(', ')}`);
  if (unknown.length) console.error(`${test} names pages that tests/lib/pages.mjs does not have: ${unknown.join(', ')}`);
  process.exit(2);
}

// The page names given on the command line (anything not starting with --), checked against `table`; all of them if none.
export function chosen(table, args = process.argv.slice(2)) {
  const only = args.filter((a) => !a.startsWith('--'));
  for (const n of only) if (!(n in table)) { console.error(`No page called ${n}. Pages: ${Object.keys(table).join(', ')}`); process.exit(2); }
  return only.length ? only : Object.keys(table);
}
