// Checks the Japanese maple's model without a browser: the calendar, each leaf's timetable, the
// pigment curves, the colours they give, and the tree. Fails if a number leaves its range, an event
// happens out of order, a colour comes out with the wrong name, or two builds of the tree differ.
//
//   node tests/maple/model.mjs
import * as M from '../../js/maple/model.js';
import { staleStamp } from '../stamp.mjs';
import { buildTree, place, leafShape, SPOT, DROOP, LOBES, bladeAt, foldOf, onBlade } from '../../js/maple/tree.js';
import { qrot } from '../../js/maple/gl.js';
import { SEC, CELL, loosePlaces } from '../../js/maple/world.js';
import { makeSunlight, DOT, SHARE, PIGS } from '../../js/maple/light.js';

let fails = 0;
{ const e = staleStamp('maple'); if (e) { fails++; console.log('FAIL ' + e); } }
const ok = (cond, what) => { if (!cond) { fails++; console.log('FAIL ' + what); } };

// the calendar
let prev = -1;
for (let i = 0; i <= 1000; i++) { const d = M.dayOf(i / 1000); ok(d > prev, `day rises at season ${i / 1000}`); ok(Math.abs(M.seasonOf(d) - i / 1000) < 1e-9, `season and day agree at ${i / 1000}`); prev = d; }
ok(M.dateOf(M.DAY_START).text === '25 March' && M.dateOf(M.DAY_END).text === '31 December', 'the year runs 25 March to 31 December');
ok(Math.abs(M.dayLength(172) - 14.5) < 0.1 && Math.abs(M.dayLength(355) - 9.8) < 0.1, `day length at 35° N, sunrise to sunset with the air's bending, is about 14 h 30 min in June and 9 h 48 min in December (${M.dayLength(172).toFixed(2)}, ${M.dayLength(355).toFixed(2)})`);
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
  ok(t.d0 > 315 && t.d0 < 340 && t.drop > t.d0 + 16 && t.land <= M.DAY_END + 1e-9, 'a leaf turns, then falls, and has landed by the last day');
  ok(M.pigments(t.d0 - 0.01, t).absc === 0, 'the stalk does not begin to come away before the leaf begins to turn');
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
ok(mean(sunny, (l) => M.pigments(345, l.T).anth) > 3 * mean(shaded, (l) => M.pigments(345, l.T).anth), 'leaves in the sun make several times more anthocyanin');
// the crown against the Japan Meteorological Agency's normals for Acer palmatum at Kyoto, 1991 to 2020: the tree seen as a whole is
// mostly red with almost no green left on 5 December (day 339), and 80% of its leaves are down on 18 December (day 352)
{ const others = T.leaves.filter((l) => !l.focus); let turned = 0, fallen = 0;
  for (let d = 320; d <= 365 && !(turned && fallen); d += 0.25) {
    let on = 0, red = 0, down = 0;
    for (const l of others) { if (d >= l.T.drop) { down++; continue; } on++; const n = M.colourName(M.leafRGB(M.pigments(d, l.T))); if (n !== 'green' && n !== 'yellow-green') red++; }
    if (!turned && on && red / on >= 0.9) turned = d; if (!fallen && down / others.length >= 0.8) fallen = d; }
  ok(Math.abs(turned - 339) <= 4, `the crown is 90% turned within 4 days of 5 December (${M.dateOf(turned).text})`);
  ok(Math.abs(fallen - 352) <= 4, `80% of the leaves are down within 4 days of 18 December (${M.dateOf(fallen).text})`); }
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
ok(name(M.pigments(357, F)) === 'red', `the followed leaf at its peak is red (${name(M.pigments(357, F))})`);
const shade = M.timetable(0, 0.5, 0.5);
ok(['yellow', 'orange'].includes(name(M.pigments(shade.drop, shade))), `a shaded leaf falls yellow or orange (${name(M.pigments(shade.drop, shade))})`);
ok(M.peakReturned(M.returned(summer)) >= 540 && M.peakReturned(M.returned(summer)) <= 560, 'a green leaf sends back most near 550 nm');
for (const k of M.PIG) { const t = M.bandTable(k); let pk = 0; for (let i = 0; i < M.NS; i++) if (t[i] > t[pk]) pk = i; const l = M.nm(pk); ok(k === 'chl' ? (l >= 430 && l <= 445) || (l >= 670 && l <= 680) : k === 'car' ? l >= 440 && l <= 490 : l >= 520 && l <= 545, `${k} absorbs most where it should (${l} nm)`); }
const rs = M.returned(summer); for (let i = 0; i < M.NS; i++) ok(rs[i] > 0 && rs[i] < 1, 'the share of light that comes back is between 0 and 1');
for (let l = 400; l <= 700; l += 10) ok(M.wavelengthRGB(l).every((v) => v >= 0 && Number.isFinite(v)), `a colour for ${l} nm`);

// the Sun at 4 PM Japan time in Kyoto, and the light it gives
{ const up = (d) => M.sunAt(d).el * 180 / Math.PI;
  ok(Math.abs(up(172) - 36.8) < 1, `at midsummer the Sun is about 37 degrees up at 4 PM (${up(172).toFixed(1)})`);
  ok(Math.abs(up(352) - 7.5) < 0.5, `on 18 December the Sun is about 7.5 degrees up at 4 PM (${up(352).toFixed(1)})`);
  for (let d = M.DAY_START; d <= M.DAY_END; d += 0.5) ok(up(d) > 5, `the Sun is at least 5 degrees up at 4 PM on every day shown (${M.dateOf(d).text}: ${up(d).toFixed(1)})`);
  ok(up(172) > up(125) && up(125) > up(84) && up(84) > up(303) && up(303) > up(320) && up(320) > up(339), 'the Sun is highest in summer and lower each week of autumn');
  ok(M.sunAt(172).az < M.sunAt(339).az && M.sunAt(172).az > 0, 'in the afternoon the Sun is west of south, and further south in December');
  for (let d = M.DAY_START; d < M.DAY_END; d++) ok(Math.abs(M.sunAt(d + 1).el - M.sunAt(d).el) < 0.01 && Math.abs(M.sunAt(d + 1).az - M.sunAt(d).az) < 0.01, 'the Sun moves smoothly from day to day');
  // the light on the leaf: the dots of light fall at a rate in step with it (issue 56: light after sunset)
  const full = M.lightAt(172).total;
  ok(full > 50000 && full < 80000, `full summer light on a level leaf at 4 PM is 50,000 to 80,000 lux (${Math.round(full)})`);
  for (let h = 15; h <= 20; h += 0.25) for (let d = 1; d <= 365; d += 2) { const L = M.lightAt(d, h); if (L.deg < 0) { ok(L.total / full < 0.01, `once the Sun is down less than 1% of the summer light is left (${M.dateOf(d).text} at ${h} h: ${(L.total / full * 100).toFixed(2)}%)`); ok(L.direct === 0 || L.deg > -0.833, 'no direct sunlight after sunset'); } }
  { let prev = Infinity; for (let h = 15; h <= 19; h += 0.05) { const t = M.lightAt(300, h).total; ok(t <= prev + 1e-9, `the light only falls as the Sun goes down (${h.toFixed(2)} h)`); prev = t; } }
  for (let d = M.DAY_START; d <= M.DAY_END; d++) { const r = M.lightAt(d).rel; ok(r > 0 && r <= 1, 'the share of the year\'s most light is between 0 and 1'); }
  ok(M.lightAt(352).rel < 0.25 * M.lightAt(172).rel, 'in December the leaf gets well under a quarter of the light it gets in June at the same hour');
  const red = M.pigments(357, F);
  ok(M.takenIn(summer, 450) > 0.9 && M.takenIn(summer, 675) > 0.9 && M.takenIn(summer, 550) < 0.6, 'a summer leaf takes in most of the blue and red light and least of the green');
  ok(M.takenIn(red, 550) > 0.9 && M.takenIn(red, 675) < 0.3, 'a red leaf takes in the green light and lets the red go by');
  for (let l = 400; l <= 700; l += 5) { const t = M.thickness(summer, l), r = M.returned(summer); ok(Math.abs(Math.log((r[(l - 400) / 5] - 0.035) / (0.6 - 0.035)) + t.chl + t.car + t.anth + 0.45 * Math.exp(-(l - 400) / 70)) < 1e-9, 'the dots of light and the leaf colour use the same numbers'); } }

// every leaf hangs from wood: each pair of leaves sits on a drawn twig or branch
{ const near = (p) => { let m = Infinity; for (const g of T.segs) { const d = g.b.map((v, i) => v - g.a[i]), q = p.map((v, i) => v - g.a[i]), t = M.clamp((q[0] * d[0] + q[1] * d[1] + q[2] * d[2]) / (d[0] * d[0] + d[1] * d[1] + d[2] * d[2])); m = Math.min(m, Math.hypot(q[0] - d[0] * t, q[1] - d[1] * t, q[2] - d[2] * t)); } return m; };
  let worst = 0; for (const n of T.nodes) worst = Math.max(worst, near(n.p));
  ok(worst < 0.005, `every leaf's foot is on a drawn twig (the farthest is ${(worst * 100).toFixed(1)} cm off)`); }

// the cells: a grown leaf cell is mostly vacuole, which presses the chloroplasts into a thin layer against the wall
{ const half = SEC.tall / 2, R = CELL.r, pl = [];
  for (let j = 0; j < 7; j++) for (let m = 0; m < 5; m++) { const a = -Math.PI / 2 + (m + ((j + 1) & 1) * 0.5) * 2 * Math.PI / 5; pl.push([Math.cos(a) * CELL.wallR, Math.sin(a) * CELL.wallR, (j - 3) * (2 * half - 5) / 7, a]); }   // the followed cell's 35, placed as world.js places them
  const inCap = (x, y, z, r, h) => { const zz = Math.max(0, Math.abs(z) - (h - r)); return x * x + y * y + zz * zz < r * r; };
  let cell = 0, vac = 0, pla = 0; const n = 60;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < 4 * n; k++) {
    const x = ((i + 0.5) / n * 2 - 1) * R, y = ((j + 0.5) / n * 2 - 1) * R, z = ((k + 0.5) / (4 * n) * 2 - 1) * half; if (!inCap(x, y, z, R, half)) continue; cell++;
    let inP = false; for (const p of pl) { const dx = x - p[0], dy = y - p[1], dz = z - p[2], c = Math.cos(p[3]), s = Math.sin(p[3]); if (((dx * c + dy * s) / CELL.plast[0]) ** 2 + ((dy * c - dx * s) / CELL.plast[1]) ** 2 + (dz / CELL.plast[2]) ** 2 < 1) { inP = true; break; } }
    if (inP) pla++; else if (inCap(x, y, z, CELL.vacR, half - CELL.vacGap)) vac++; }
  ok(vac / cell > 0.7 && vac / cell < 0.85, `the vacuole is 70 to 85% of a tall cell (${(vac / cell * 100).toFixed(0)}%; chloroplasts ${(pla / cell * 100).toFixed(0)}%)`);
  ok(CELL.r - CELL.vacR < 1 && CELL.wallR + CELL.plast[0] > CELL.vacR && CELL.wallR + CELL.plast[0] < CELL.r, 'the chloroplasts lie in a layer under a micrometre thick between the vacuole and the wall');
  const top = SEC.tall / 2 - SEC.tall, skinTop = (SEC.lower + SEC.bottom) / 2 + 5.4;
  for (const c of loosePlaces()) { const reach = Math.max(...c.sc); ok(c.cz + reach <= top && c.cz - reach >= skinTop, `a loose cell lies between the tall cells and the lower skin (${(c.cz - reach).toFixed(1)} to ${(c.cz + reach).toFixed(1)} um)`); }
  ok(DOT.tall === SEC.tall / 2 - 1.5 && DOT.loose === SEC.loose + 3, 'the dots of light meet the layers where the cells are'); }

// the dots of light: they fall at a rate in step with the light, and each is judged by the pigments of the date shown as it reaches each layer
{ const cellsAt = (z0, z1) => { const out = []; for (let x = -100; x <= 180; x += 12.4) { const plast = []; for (let z = z0; z <= z1; z += 5) plast.push([x - 2, 3, z], [x + 2, 3, z + 2.5]); out.push({ x, y: 6, z0, z1, plast }); } return out; };
  const lane = { tall: cellsAt(-17, 17), loose: cellsAt(-35, -35) };
  const count = (k) => { const L = makeSunlight(lane, () => k, 9); let n = 0, t = 0; for (let i = 0; i < 2000; i++) { L.step(0.05, M.pigments(200, F)); if (i > 400) { n += L.beams.filter((b) => !b.idle).length; t++; } } return n / t; };
  const full = count(1), dim = count(0.13), dark = count(0.005);
  ok(full > 0.8 * DOT.n, `in the most light nearly every dot is falling (${full.toFixed(0)} of ${DOT.n})`);
  ok(dim > 0.08 * full && dim < 0.2 * full, `in 13% of that light, about 13% as many dots fall (${(dim / full * 100).toFixed(0)}%)`);
  ok(dark < 0.01 * full, `after sunset almost no dots fall (${(dark / full * 100).toFixed(2)}%)`);
  // summer, then the date jumps to a red leaf: once the dots already below the tall cells have gone, those that come out are the ones the red leaf lets through
  const L = makeSunlight(lane, () => 1, 21), green = M.pigments(200, F), red = M.pigments(357, F);
  for (let i = 0; i < 400; i++) L.step(0.05, green);
  const cross = (DOT.tall - DOT.end) / DOT.v; let out = 0, through = 0, want = 0;
  for (let t = 0; t < 60; t += 0.05) L.step(0.05, red, (b) => { if (t > cross + 0.1) { out++; if (b.l > 495 && b.l < 575) through++; } });
  let all = 0; for (let l = 400; l <= 700; l++) { const T = 1 - M.takenIn(red, l); all += T; if (l > 495 && l < 575) want += T; }
  ok(through <= 2 + 2 * want / all * out, `after the date changes, a red leaf lets through no more dots at 495 to 575 nm than the model says (${through} of ${out}; the model gives ${(want / all * out).toFixed(1)})`);
  let early = 0; const L2 = makeSunlight(lane, () => 1, 22); for (let i = 0; i < 400; i++) L2.step(0.05, green);
  for (let t = 0; t < cross + 0.05; t += 0.05) L2.step(0.05, red, (b) => { if (b.l > 495 && b.l < 575) early++; });
  ok(early > 0, 'just after the change, dots already past the leaf\'s layers still come out (the test sees the dots)'); }

console.log(fails ? `${fails} failed` : `model: all checks passed (${T.leaves.length} leaves)`);
process.exit(fails ? 1 : 0);
