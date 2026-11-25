// Checks the Japanese maple's model without a browser: the calendar, each leaf's timetable, the
// pigment curves, the colours they give, and the tree. Fails if a number leaves its range, an event
// happens out of order, a colour comes out with the wrong name, or two builds of the tree differ.
//
//   node tests/maple/model.mjs
import * as M from '../../js/maple/model.js';
import { staleStamp } from '../stamp.mjs';
import { buildTree, place, leafShape, SPOT, DROOP, LOBES, bladeAt, foldOf, onBlade } from '../../js/maple/tree.js';
import { qrot } from '../../js/maple/gl.js';

let fails = 0;
{ const e = staleStamp('maple'); if (e) { fails++; console.log('FAIL ' + e); } }
const ok = (cond, what) => { if (!cond) { fails++; console.log('FAIL ' + what); } };

// the calendar
let prev = -1;
for (let i = 0; i <= 1000; i++) { const d = M.dayOf(i / 1000); ok(d > prev, `day rises at season ${i / 1000}`); ok(Math.abs(M.seasonOf(d) - i / 1000) < 1e-9, `season and day agree at ${i / 1000}`); prev = d; }
ok(M.dateOf(M.DAY_START).text === '25 March' && M.dateOf(M.DAY_END).text === '20 December', 'the year runs 25 March to 20 December');
ok(Math.abs(M.dayLength(172) - 14.4) < 0.15 && Math.abs(M.dayLength(355) - 9.6) < 0.15, 'day length at 35° N is about 14.4 h in June and 9.6 h in December');
for (let i = 1; i < M.PHASES.length; i++) ok(M.PHASES[i].at > M.PHASES[i - 1].at, 'phases are in order');

// the tree
const T = buildTree(), T2 = buildTree();
ok(T.leaves.length > 5000 && T.leaves.length < 10000, `leaf count ${T.leaves.length} is between 5000 and 10000`);
ok(JSON.stringify(T.leaves.map((l) => [l.node, l.q, l.T.d0])) === JSON.stringify(T2.leaves.map((l) => [l.node, l.q, l.T.d0])), 'two builds give the same tree');
ok(T.bounds.y1 > 3 && T.bounds.y1 < 5.5 && T.bounds.x1 - T.bounds.x0 > 4 && T.bounds.x1 - T.bounds.x0 < 8 && T.bounds.z1 - T.bounds.z0 > 3 && T.bounds.z1 - T.bounds.z0 < 8, `the crown is 3 to 5.5 m tall, 4 to 8 m wide and 3 to 8 m deep (${T.bounds.y1.toFixed(1)}, ${(T.bounds.x1 - T.bounds.x0).toFixed(1)}, ${(T.bounds.z1 - T.bounds.z0).toFixed(1)})`);
ok(T.leaves.filter((l) => l.focus).length === 1, 'one leaf is followed');
for (const l of T.leaves) {
  const t = l.T;
  ok(t.bud >= M.DAY_START && t.bud < 100, 'buds open in the first fortnight');
  ok(t.d0 > 290 && t.d0 < 320 && t.drop > t.d0 + 20 && t.land <= M.DAY_END + 1e-9, 'a leaf turns, then falls, and has landed by the last day');
  if (!l.focus) ok(t.drop < T.focus.T.drop, 'the followed leaf is the last to fall');
  ok(l.g[1] >= 0 && l.g[1] < 0.04 && Math.hypot(l.g[0], l.g[2]) < 7, 'a fallen leaf lies on the lawn, within 7 m of the trunk');
  ok(l.len > 0.06 && l.len < 0.1 && Math.abs(Math.hypot(...l.q) - 1) < 1e-6, 'a leaf is 6 to 10 cm long and has a proper rotation');
  for (const d of [M.DAY_START, 200, t.d0 + 10, t.drop + 1, M.DAY_END]) { const o = place(l, d, {}); ok([...o.pos, ...o.q, o.size].every(Number.isFinite) && o.pos[1] > -1e-6, 'a leaf has a finite place above the ground');
  { const o = place(l, M.DAY_END, {}), s = l.len * o.size; for (const [x, y] of [[1, 0], [0.6, 0.6], [0.6, -0.6], [-0.2, 0.25], [-0.2, -0.25], [0, 0]]) { const w = qrot(o.q, [x * s, y * s, -DROOP * (x * x + y * y) * s]); if (o.pos[1] + w[1] < -1e-4) { ok(false, `a fallen leaf dips ${(-(o.pos[1] + w[1]) * 1000).toFixed(1)} mm below the lawn`); break; } } } }
  ok(place(l, M.DAY_END, {}).state === 2, 'every leaf is on the ground on the last day');
}
// a young leaf is folded like a fan and opens flat
ok(foldOf(0.07) === 1 && foldOf(1) === 0 && foldOf(0.3) > foldOf(0.5), 'a leaf is fully folded as it leaves the bud and flat when grown');
for (const [x, y] of [[0.47, 0.062], [0.3, 0.2], [0.1, -0.3]]) LOBES.forEach((l, i) => { const a = bladeAt(x, y, i, 0), b = onBlade(x, y); ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-12, 'an open leaf is the same shape whichever lobe a point is counted on'); });
{ const e = 1e-5; for (const f of [0.3, 0.7, 1]) for (const [x, y] of [[0.47, 0.062], [0.6, -0.05]]) { const p = bladeAt(x, y, 0, f), q = bladeAt(x, y + e, 0, f), flat = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2] + (onBlade(x, y + e)[2] - onBlade(x, y)[2]) * 0) / e; ok(flat > 0.9 && flat < 1.25, 'folding a lobe does not stretch it: ' + flat.toFixed(3)); } }
{ const tip = (i, f) => bladeAt(LOBES[i].len * Math.cos(LOBES[i].a), LOBES[i].len * Math.sin(LOBES[i].a), i, f); ok(Math.hypot(tip(1, 1)[0] - tip(2, 1)[0], tip(1, 1)[1] - tip(2, 1)[1]) < 0.5 * Math.hypot(tip(1, 0)[0] - tip(2, 0)[0], tip(1, 0)[1] - tip(2, 0)[1]), 'the lobes of a folded leaf lie closer together'); }
// sun leaves turn first and reddest
const sunny = T.leaves.filter((l) => l.sunny > 0.8 && !l.focus), shaded = T.leaves.filter((l) => l.sunny < 0.2);
const mean = (a, f) => a.reduce((s, x) => s + f(x), 0) / a.length;
ok(sunny.length > 50 && shaded.length > 50, 'the crown has both sunny and shaded leaves');
ok(mean(sunny, (l) => l.T.d0) < mean(shaded, (l) => l.T.d0) - 5, 'leaves in the sun turn at least five days before shaded ones');
ok(mean(sunny, (l) => M.pigments(335, l.T).anth) > 3 * mean(shaded, (l) => M.pigments(335, l.T).anth), 'leaves in the sun make several times more anthocyanin');
// the point the deeper scales look into is on the blade, clear of the lobe's middle vein
ok(SPOT[0] > 0.2 && SPOT[0] < 0.8 && Math.abs(SPOT[1]) > 0.03 && Math.abs(SPOT[1]) < 0.12, 'the spot is on the middle lobe beside its vein');
ok(leafShape.plain.length === 7 && leafShape.veins.length === 7, 'a leaf has seven lobes, each with a vein');

// the followed leaf, day by day
const F = M.FOCUS; let last = null, chlHalf = 0, anthHalf = 0, carMin = 1;
for (let d = M.DAY_START; d <= M.DAY_END; d += 0.25) {
  const p = M.pigments(d, F);
  for (const k of ['size', 'chl', 'car', 'anth', 'absc', 'fall']) ok(p[k] >= 0 && p[k] <= 1, `${k} is within 0..1 on day ${d}`);
  if (last) {
    for (const k of ['size', 'chl', 'car', 'anth', 'absc']) ok(Math.abs(p[k] - last[k]) < 0.03, `${k} changes smoothly at day ${d}`);
    ok(p.anth >= last.anth - 1e-12 && p.absc >= last.absc - 1e-12 && p.size >= last.size - 1e-12, 'anthocyanin, the cut and the blade only grow');
    if (d > F.d0) ok(p.chl <= last.chl + 1e-12, 'chlorophyll only falls in autumn');
  }
  if (!chlHalf && d > 200 && p.chl < 0.5) chlHalf = d;
  if (!anthHalf && p.anth > 0.5) anthHalf = d;
  if (d > 200) carMin = Math.min(carMin, p.car);
  last = p;
}
const summer = M.pigments(200, F);
ok(summer.chl === 1 && summer.car === 1 && summer.anth === 0 && summer.absc === 0, 'in summer: full chlorophyll and carotenoids, no anthocyanin, stalk whole');
ok(chlHalf > F.d0 && anthHalf > F.d0 && Math.abs(chlHalf - anthHalf) < 6, 'chlorophyll halves and anthocyanin half-fills within a few days of each other');
ok(carMin > 0.4, 'more than 40% of the carotenoids outlast the chlorophyll');
ok(M.pigments(F.drop - 0.01, F).absc > 0.99 && M.pigments(F.drop - 0.01, F).fall === 0, 'the leaf falls when the stalk is cut through, not before');

// colours, from the spectra
const name = (p) => M.colourName(M.leafRGB(p));
ok(name(M.pigments(M.DAY_START + 12, F)) === 'yellow-green', `a new leaf is yellow-green (${name(M.pigments(M.DAY_START + 12, F))})`);
ok(name(summer) === 'green', `a summer leaf is green (${name(summer)})`);
ok(name(M.pigments(335, F)) === 'red', `the followed leaf at its peak is red (${name(M.pigments(335, F))})`);
const shade = M.timetable(0, 0.5, 0.5);
ok(['yellow', 'orange'].includes(name(M.pigments(shade.drop, shade))), `a shaded leaf falls yellow or orange (${name(M.pigments(shade.drop, shade))})`);
ok(M.peakReturned(M.returned(summer)) >= 540 && M.peakReturned(M.returned(summer)) <= 560, 'a green leaf sends back most near 550 nm');
for (const k of M.PIG) { const t = M.bandTable(k); let pk = 0; for (let i = 0; i < M.NS; i++) if (t[i] > t[pk]) pk = i; const l = M.nm(pk); ok(k === 'chl' ? (l >= 430 && l <= 445) || (l >= 670 && l <= 680) : k === 'car' ? l >= 440 && l <= 490 : l >= 520 && l <= 545, `${k} absorbs most where it should (${l} nm)`); }
const rs = M.returned(summer); for (let i = 0; i < M.NS; i++) ok(rs[i] > 0 && rs[i] < 1, 'the share of light that comes back is between 0 and 1');
for (let l = 400; l <= 700; l += 10) ok(M.wavelengthRGB(l).every((v) => v >= 0 && Number.isFinite(v)), `a colour for ${l} nm`);

// the Sun at five in the afternoon, and what the pigments take in
{ const up = (d) => M.sunAt(d).el * 180 / Math.PI;
  ok(Math.abs(up(172) - 25) < 1, `at midsummer the Sun is 25 degrees up at five (${up(172).toFixed(1)})`);
  ok(up(172) > up(125) && up(125) > up(84) && up(84) > up(303) && up(303) > up(320) && up(320) > up(354), 'the Sun is highest in summer and lower each week of autumn');
  ok(Math.abs(up(320)) < 1.5 && up(354) < 0, 'it is on the horizon in mid November and has set by late December');
  for (let d = M.DAY_START; d < M.DAY_END; d++) ok(Math.abs(M.sunAt(d + 1).el - M.sunAt(d).el) < 0.01 && Math.abs(M.sunAt(d + 1).az - M.sunAt(d).az) < 0.01, 'the Sun moves smoothly from day to day');
  const red = M.pigments(335, F);
  ok(M.takenIn(summer, 450) > 0.9 && M.takenIn(summer, 675) > 0.9 && M.takenIn(summer, 550) < 0.6, 'a summer leaf takes in most of the blue and red light and least of the green');
  ok(M.takenIn(red, 550) > 0.9 && M.takenIn(red, 675) < 0.3, 'a red leaf takes in the green light and lets the red go by');
  for (let l = 400; l <= 700; l += 5) { const t = M.thickness(summer, l), r = M.returned(summer); ok(Math.abs(Math.log((r[(l - 400) / 5] - 0.035) / (0.6 - 0.035)) + t.chl + t.car + t.anth + 0.45 * Math.exp(-(l - 400) / 70)) < 1e-9, 'the dots of light and the leaf colour use the same numbers'); } }

console.log(fails ? `${fails} failed` : `model: all checks passed (${T.leaves.length} leaves)`);
process.exit(fails ? 1 : 0);
