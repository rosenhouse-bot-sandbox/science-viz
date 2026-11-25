// Gives every file of a page one shared version, written into each address that loads one of them:
// "model.js?v=1a2b3c4d". A browser keeps each file for a while, and without this a visitor could get a new
// main.js together with an old copy of a file it imports, which do not fit. With it, a changed file has a new
// address everywhere at once.
//
//   node tests/stamp.mjs                  # every stamped page; run after changing any file one of them loads
//   node tests/stamp.mjs maple engine     # some pages only
//   node tests/stamp.mjs --check          # fails if a stamp is out of date (the page tests run this)
//
// A page's files are its modules (js/<page>/*.js), its stylesheet (css/<page>.css), the shared modules those
// import directly (such as ../gl/gl.js or ../touch/slider.js), and the data in <page>/data/ if it has one. The
// version is written into the page's .html files, into every import in its modules, and into `const STAMP = '...'`
// where a module has one (Shoulder carries it into the fetches of its data).
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
export const STAMPED = ['maple', 'engine', 'shoulder', 'saccade', 'gears'];

const bare = (t) => t.replace(/(\.(?:js|css))\?v=[0-9a-f]+/g, '$1');
const IMPORT = /(from '(?:\.\/\w+|\.\.\/\w+\/\w+)\.js)(?=')/g, SHARED = /from '\.\.\/(\w+\/\w+\.js)(?:\?v=[0-9a-f]+)?'/g;
const STAMP = /const STAMP = '[0-9a-f]*'/;

export function stamp(page, check = false) {
  const dir = path.join(root, 'js', page), mods = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort().map((f) => path.join(dir, f));
  const css = path.join(root, 'css', page + '.css');
  const htmls = fs.readdirSync(path.join(root, page)).filter((f) => f.endsWith('.html')).sort().map((f) => path.join(root, page, f));
  const text = new Map([...mods, css, ...htmls].map((f) => [f, bare(fs.readFileSync(f, 'utf8'))]));
  const shared = [...new Set(mods.flatMap((f) => [...text.get(f).matchAll(SHARED)].map((m) => m[1])))].sort().map((f) => path.join(root, 'js', f));
  const h = createHash('sha256');
  for (const f of [...mods, css]) h.update(text.get(f).replace(STAMP, "const STAMP = ''"));
  for (const f of shared) h.update(fs.readFileSync(f, 'utf8'));
  const data = path.join(root, page, 'data');
  if (fs.existsSync(data)) for (const f of fs.readdirSync(data).filter((f) => /\.(json|bin)$/.test(f)).sort()) h.update(fs.readFileSync(path.join(data, f)));
  const v = h.digest('hex').slice(0, 8), stale = [];
  const own = new RegExp(`((?:js/${page}/\\w+\\.js|css/${page}\\.css))(?=")`, 'g');
  for (const [f, t] of text) {
    const out = htmls.includes(f) ? t.replace(own, `$1?v=${v}`) : t.replace(IMPORT, `$1?v=${v}`).replace(STAMP, `const STAMP = '${v}'`);
    if (out !== fs.readFileSync(f, 'utf8')) { stale.push(path.relative(root, f)); if (!check) fs.writeFileSync(f, out); }
  }
  return { v, stale };
}

// For the page tests: what to say when the page's stamp is out of date, or null when it is not.
export function staleStamp(page) {
  const r = stamp(page, true);
  return r.stale.length ? `the version stamp is out of date in: ${r.stale.join(', ')}. Run: node tests/stamp.mjs ${page}` : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), check = args.includes('--check'), only = args.filter((a) => !a.startsWith('--'));
  for (const p of only) if (!STAMPED.includes(p)) { console.error(`${p} is not stamped. Stamped pages: ${STAMPED.join(', ')}`); process.exit(2); }
  let bad = 0;
  for (const p of only.length ? only : STAMPED) {
    const r = stamp(p, check);
    if (check && r.stale.length) { bad++; console.error(`${p}: ${staleStamp(p)}`); }
    else console.log(`${p}: ${check ? `stamp ${r.v} is up to date` : `stamped ${r.v}${r.stale.length ? ': ' + r.stale.join(', ') : ' (nothing to change)'}`}`);
  }
  process.exit(bad ? 1 : 0);
}
