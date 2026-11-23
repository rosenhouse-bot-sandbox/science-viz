// Writes dates.json for the landing page: when each experience was started and last changed,
// taken from git history. The Pages workflow runs this just before it uploads the site, so the
// file is published but never committed. The page turns the timestamps into "Nov 2026" and
// "5 hours ago" in the visitor's browser, so the relative time never goes stale between deploys.
//
//   node .github/dates.mjs            (needs full history: actions/checkout with fetch-depth: 0)
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

// The folders and files that make up each experience. Rainbows began as the drafts board in
// September 2026, before v2/ existed.
const PAGES = {
  'v2': ['v2', 'js/v2', 'css/v2.css', 'drafts'],
  'vesicle': ['vesicle', 'js/vesicle', 'css/vesicle.css'],
  'optics': ['optics', 'js/optics', 'css/optics.css'],
  'dag': ['dag', 'js/dag', 'css/dag.css'],
  'maple': ['maple', 'js/maple', 'css/maple.css'],
  'engine': ['engine', 'js/engine', 'css/engine.css'],
  'shoulder': ['shoulder', 'js/shoulder', 'css/shoulder.css'],
  'saccade': ['saccade', 'js/saccade', 'css/saccade.css'],
  'gears': ['gears', 'js/gears', 'css/gears.css'],
};

const log = (paths) => execFileSync('git', ['log', '--format=%cI', '--', ...paths], { encoding: 'utf8' })
  .split('\n').filter(Boolean);

const out = {};
for (const [page, paths] of Object.entries(PAGES)) {
  const times = log(paths);
  if (!times.length) throw new Error(`no commits touch ${page}: is the checkout shallow?`);
  out[page] = { started: times[times.length - 1], updated: times[0] };
}
writeFileSync('dates.json', JSON.stringify(out, null, 1) + '\n');
console.log(out);
