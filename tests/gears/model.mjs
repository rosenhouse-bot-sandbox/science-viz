// Checks the gears without a browser. For each solid it checks:
//  - which sets can turn: the cube's ring of four and the octahedron's eight can, the cube with six cannot, and
//    the reason matches a loop of meshing gears with an odd count;
//  - every pair of meshing gears, turned through two tooth spacings: no tooth of one enters the other;
//  - the teeth do engage: holding one gear, the other can turn only by the backlash before it hits a tooth;
//  - the backlash is within JIS B 1705 grade 0 for the gear's module and size, and sh.slack is the free turn it gives;
//  - driven through the backlash (rest, drive): every driven tooth rests on its driver's flank, no tooth enters
//    another, and when the turn changes way the driven gears stand still until the driver has crossed the backlash;
//  - gears that do not mesh never come near each other, and the body that holds the axles touches no gear;
//  - a screw turns one turn for each thread pitch it comes out, and its thread is drawn as a helix of that pitch;
//  - the numbers the page shows (the angle between axes, the cone angle, the tooth count) are the ones it uses.
//
//   node tests/gears/model.mjs
import fs from 'node:fs';
import { SHAPES, makeShape, angles, rest, drive, inside, halfWidth, bodyPlanes, bodyFaces, parts, dot, norm, R_IN, R_OUT, MODULE, MM, screwTurn } from '../../js/gears/model.js';
import { smallParts } from '../../js/gears/mesh.js';

let fails = 0;
const fail = (what) => { fails++; console.log('FAIL ' + what); };
const deg = (r) => r * 180 / Math.PI;
const by = Object.fromEntries(SHAPES.map((s) => [s.id, s]));

// ---- which sets can turn ----
if (by.cube4.jammed) fail('the cube with 4 gears is jammed');
if (!by.cube6.jammed) fail('the cube with 6 gears can turn');
if (by.octa.jammed) fail('the octahedron with 8 gears is jammed');
// an independent check: a set of meshing gears can turn only if every loop of meshing gears has an even count
function oddLoop(sh) {
  const col = sh.normals.map(() => 0);
  for (let s = 0; s < col.length; s++) {
    if (col[s]) continue; col[s] = 1; const todo = [s];
    while (todo.length) { const i = todo.pop(); for (const e of sh.meshes) { const j = e.i === i ? e.j : e.j === i ? e.i : -1; if (j < 0) continue; if (!col[j]) { col[j] = -col[i]; todo.push(j); } else if (col[j] === col[i]) return true; } }
  }
  return false;
}
for (const sh of SHAPES) if (oddLoop(sh) !== sh.jammed) fail(`${sh.id}: jammed is ${sh.jammed}, but a loop with an odd count of gears is ${oddLoop(sh) ? '' : 'not '}there`);
for (const sh of SHAPES) {
  const want = { cube4: 2, cube6: 4, octa: 3 }[sh.id];
  if (sh.per.some((k) => k !== want)) fail(`${sh.id}: a gear meshes with ${sh.per.join(',')} others, not ${want}`);
  if (sh.meshes.length !== { cube4: 4, cube6: 12, octa: 12 }[sh.id]) fail(`${sh.id}: ${sh.meshes.length} meshing pairs`);
  for (const e of sh.meshes) if (!sh.jammed && sh.sign[e.i] !== -sh.sign[e.j]) fail(`${sh.id}: gears ${e.i} and ${e.j} turn the same way`);
}
// the numbers on the page
const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;
if (!near(deg(by.cube4.shaft), 90)) fail(`cube: axes meet at ${deg(by.cube4.shaft)}°`);
if (!near(deg(by.octa.shaft), deg(Math.acos(1 / 3)))) fail(`octahedron: axes meet at ${deg(by.octa.shaft)}°, not 180° less the dihedral angle`);
if (!near(by.octa.shaft + Math.acos(-1 / 3), Math.PI)) fail('octahedron: the axis angle and the dihedral angle do not add to 180°');

// ---- meshing pairs: no tooth enters another, and the teeth engage ----
// points spread over gear j's teeth near the contact, as directions
function teethPoints(sh, j, m, t, ang) {
  const F = sh.frames[j], pr = sh.profile, out = [];
  const c = Math.atan2(dot(m, F.y), dot(m, F.x));
  for (let a = 0; a <= 24; a++) {
    const th = pr.root + 0.002 + (pr.tip - pr.root - 0.004) * a / 24;
    for (let b = 0; b <= 200; b++) {
      const ps = c + (b / 100 - 1) * 1.6 * sh.pitch, d = [0, 1, 2].map((k) => Math.sin(th) * (Math.cos(ps) * F.x[k] + Math.sin(ps) * F.y[k]) + Math.cos(th) * F.z[k]);
      if (inside(sh, j, t, d, ang)) out.push(d);
    }
  }
  return out;
}
function overlap(sh, e, t, extra = 0) {
  const ang = angles(sh, t); ang[e.i] += extra;
  let n = 0;
  for (const d of teethPoints(sh, e.j, e.m, t, ang)) if (inside(sh, e.i, t, d, ang)) n++;
  return n;
}
// points just inside the flanks of gear j's teeth near the contact m: a flank that meets the other gear puts one of
// these inside it, however thin the overlap
function flankPoints(sh, j, m, ang) {
  const F = sh.frames[j], pr = sh.profile, out = [], c = Math.atan2(dot(m, F.y), dot(m, F.x)), k0 = Math.round((c - ang[j]) / sh.pitch);
  for (let a = 0; a <= 48; a++) {
    const th = pr.root + 1e-4 + (pr.tip - pr.root - 2e-4) * a / 48, hw = halfWidth(pr, th) - 1e-7;
    for (let k = k0 - 2; k <= k0 + 2; k++) for (const s of [1, -1]) { const ps = ang[j] + k * sh.pitch + s * hw; out.push([0, 1, 2].map((q) => Math.sin(th) * (Math.cos(ps) * F.x[q] + Math.sin(ps) * F.y[q]) + Math.cos(th) * F.z[q])); }
  }
  return out;
}
const touching = (sh, e, ang) => flankPoints(sh, e.j, e.m, ang).some((d) => inside(sh, e.i, 0, d, ang)) || flankPoints(sh, e.i, e.m, ang).some((d) => inside(sh, e.j, 0, d, ang));
for (const sh of SHAPES) {
  if (sh.jammed) continue;
  let worst = 0, where = '';
  for (const e of sh.meshes) for (let k = 0; k < 24; k++) {
    const t = k / 24 * 2 * sh.pitch, n = overlap(sh, e, t);
    if (n > worst) { worst = n; where = `gears ${e.i} and ${e.j} at a turn of ${deg(t).toFixed(1)}°`; }
  }
  if (worst) fail(`${sh.id}: teeth overlap at ${worst} sample points, ${where}`);
  // hold gear j, turn gear i either way until a flank meets a flank: the free turn is sh.slack, at every place in the mesh
  const e = sh.meshes[0];
  for (let k = 0; k < 12; k++) for (const dir of [1, -1]) {
    const t = k / 12 * sh.pitch; let lo = 0, hi = 0.2 * sh.pitch;
    for (let it = 0; it < 24; it++) { const x = (lo + hi) / 2, ang = angles(sh, t); ang[e.i] += dir * x; if (touching(sh, e, ang)) hi = x; else lo = x; }
    const r = lo / sh.slack;
    if (r < 1 || r > 1.03) fail(`${sh.id}: at a turn of ${deg(t).toFixed(1)}°, one gear turns ${r.toFixed(3)} of the slack ${dir > 0 ? 'forward' : 'back'} before it meets a tooth`);
  }
  console.log(`${sh.id}: ${sh.meshes.length} meshing pairs turn freely, axes at ${deg(sh.shaft).toFixed(2)}°, cones of ${deg(sh.alpha).toFixed(2)}°, ${sh.profile.N} teeth`);
}

// ---- backlash ----
// JIS B 1705:1973 (bevel gears; the KHK Gear Guide, Technical Data, p. 725): each gear's share of a pair's backlash at the
// outer pitch circle is at least 10W and at most 25W micrometers for grade 0, W = cbrt(d) + 0.65 m.
for (const sh of SHAPES) {
  const m = MODULE[sh.solid], d = m * sh.teeth, W = Math.cbrt(d) + 0.65 * m, um = sh.profile.thin * Math.PI * m * 1000;
  if (um < 10 * W || um > 25 * W) fail(`${sh.id}: each tooth is thinned by ${um.toFixed(0)} µm, outside JIS B 1705 grade 0 (${(10 * W).toFixed(0)} to ${(25 * W).toFixed(0)} µm)`);
}
// Driven through the backlash. For every gear as the driver, at several turns, both ways: every mesh has its driven
// tooth on its driver's flank (a further 3% of the slack would put one inside the other) and no tooth in another, and
// the far side of each mesh is free by about twice the slack.
for (const sh of SHAPES) {
  if (sh.jammed) continue;
  let bad = '', n = 0;
  for (const d of sh.normals.keys()) for (const way of [1, -1]) for (const f of [0, 0.37, 0.71]) {
    const p = rest(sh, d, f * sh.pitch, way);
    for (const e of sh.meshes) {
      const [a, b] = sh.hops[d][e.i] < sh.hops[d][e.j] ? [e.i, e.j] : [e.j, e.i];   // a drives b
      const at = (dp) => { const q = p.slice(); q[b] += dp; return angles(sh, q); };
      n++;
      if (touching(sh, e, at(0))) bad ||= `gear ${b} enters gear ${a} (driver ${d})`;
      else if (!touching(sh, e, at(-way * 0.03 * sh.slack))) bad ||= `gear ${b} is not on gear ${a}'s driving flank (driver ${d})`;
      else if (touching(sh, e, at(way * 1.9 * sh.slack))) bad ||= `gear ${b} has no backlash on its far side (driver ${d})`;
    }
  }
  if (bad) fail(`${sh.id}: driven through the backlash, ${bad}`);
  // turn gear 0 on, then back: each gear stands still until the driver has gone back twice the slack for every mesh
  // between them, then follows; no tooth ever enters another
  const p = rest(sh, 0, 0, 1), step = sh.slack / 8, starts = sh.normals.map(() => null);
  let t = 0, inside2 = 0;
  for (let k = 0; k < 40; k++) { t += step; drive(sh, p, 0, t); }
  const top = t, held = p.slice();
  for (let k = 0; k < 80; k++) {
    t -= step; drive(sh, p, 0, t);
    p.forEach((v, i) => { if (i && starts[i] === null && Math.abs(v - held[i]) > 1e-9) starts[i] = top - t; });
    if (k % 4 === 0) for (const e of sh.meshes) if (touching(sh, e, angles(sh, p))) inside2++;
  }
  starts.forEach((s, i) => { if (!i) return; const want = 2 * sh.hops[0][i] * sh.slack;
    if (s === null || s < want - 1e-9 || s > want + step + 1e-9) fail(`${sh.id}: turned back, gear ${i} (${sh.hops[0][i]} meshes from the driver) starts after ${s === null ? 'never' : (s / sh.slack).toFixed(2) + ' slacks'}, not ${(want / sh.slack).toFixed(0)}`); });
  if (inside2) fail(`${sh.id}: turning back, teeth entered each other ${inside2} times`);
  // the visitor lets go and turns another gear, one way and then the other: every mesh stays within the slack
  let over = 0;
  for (const d of sh.normals.keys()) for (const [n, dir] of [[30, 1], [50, -1], [20, 1]]) for (let k = 0; k < n; k++) {
    drive(sh, p, d, p[d] + dir * step * (1 + d % 3));
    for (const e of sh.meshes) if (Math.abs(p[e.i] - p[e.j]) > sh.slack * (1 + 1e-9)) over++;
  }
  if (over) fail(`${sh.id}: turning one gear and then another, a mesh went past its slack ${over} times`);
  console.log(`${sh.id}: driven through the backlash at ${n} meshes; slack ${deg(sh.slack).toFixed(2)}° (${(2 * sh.profile.thin * Math.PI * MODULE[sh.solid] * 1000).toFixed(0)} µm a pair)`);
}

// the page says the cube's six gears fit together at rest, each tooth in a gap: they only cannot turn
{ const sh = by.cube6; let n = 0; for (const e of sh.meshes) n += overlap(sh, e, 0); if (n) fail(`cube6: at rest, teeth overlap at ${n} sample points`); }

// the page says any tooth count works: try a spread of them on both solids
for (const N of [9, 10, 11, 12, 13, 14, 16, 17, 20, 23]) for (const base of [by.cube4, by.octa]) {
  const sh = makeShape({ id: base.id, faces: base.faces, plain: base.plain, teeth: N });
  let worst = 0;
  for (const e of sh.meshes) for (let k = 0; k < 6; k++) worst = Math.max(worst, overlap(sh, e, k / 6 * sh.pitch));
  if (worst) fail(`${base.id} with ${N} teeth: teeth overlap at ${worst} sample points`);
}

// ---- gears that do not mesh, and the body ----
for (const sh of SHAPES) {
  const tip = sh.profile.tip;
  sh.normals.forEach((a, i) => sh.normals.forEach((b, j) => {
    if (j <= i || sh.meshes.some((e) => (e.i === i && e.j === j))) return;
    const gap = Math.acos(dot(a, b)) - 2 * tip;
    if (gap < 0.05) fail(`${sh.id}: gears ${i} and ${j} do not mesh but come within ${deg(gap).toFixed(1)}° of each other`);
  }));
  // sample the body's surface: corners, edges, and across each face
  const faces = bodyFaces(bodyPlanes(sh)), pts = [];
  if (faces.length !== sh.normals.length + sh.plainNormals.length + { cube4: 12, cube6: 12, octa: 18 }[sh.id]) fail(`${sh.id}: the body has ${faces.length} faces`);
  for (const f of faces) {
    const P = f.poly, c = P.reduce((s, p) => [s[0] + p[0] / P.length, s[1] + p[1] / P.length, s[2] + p[2] / P.length], [0, 0, 0]);
    for (let k = 0; k < P.length; k++) for (let u = 0; u <= 10; u++) for (let v = 0; v <= 10 - u; v++) {
      const a = P[k], b = P[(k + 1) % P.length], w = 1 - u / 10 - v / 10;
      pts.push([0, 1, 2].map((x) => a[x] * u / 10 + b[x] * v / 10 + c[x] * w));
    }
  }
  // a gear's metal: the toothed band between its front and back cones, and the disc inside it
  const P = parts(sh);
  let hit = 0;
  for (const p of pts) {
    const r = Math.hypot(...p);
    for (let i = 0; i < sh.normals.length; i++) {
      const along = dot(p, sh.normals[i]), th = Math.acos(Math.max(-1, Math.min(1, along / r))), s = r * Math.cos(th - sh.alpha);
      if (th <= tip && s >= R_IN - 1e-9 && s <= R_OUT) hit++;
      else if (along >= P.back - 1e-9 && Math.sqrt(Math.max(0, r * r - along * along)) <= P.rootR) hit++;
    }
  }
  if (hit) fail(`${sh.id}: the body reaches into a gear at ${hit} sample points`);
}

// ---- the screw ----
// It comes out only by turning, one turn a pitch, until the thread has left the hole; then it stops turning.
{ const S = MM.screw;
  if (Math.abs(screwTurn(S.pitch) - 2 * Math.PI) > 1e-9) fail(`a screw coming out by one pitch turns ${(screwTurn(S.pitch) / 2 / Math.PI).toFixed(3)} turns`);
  if (Math.abs(screwTurn(S.threadL) / 2 / Math.PI - S.threadL / S.pitch) > 1e-9 || screwTurn(S.threadL + 5) !== screwTurn(S.threadL)) fail('a screw does not stop turning once its thread has left the hole');
  // the thread's corners carry their height in mm and how far round they are in turns, for the helix in the shader
  for (const sh of SHAPES) {
    const g = smallParts(parts(sh)).screw, u = parts(sh).u; let bad = 0, n = 0;
    for (let i = 0; i < g.P.length / 3; i++) if (g.T[3 * i] === 5) {
      n++; const x = g.P[3 * i], y = g.P[3 * i + 1], z = g.P[3 * i + 2], w = (((Math.atan2(y, x) / 2 / Math.PI) % 1) + 1) % 1;
      if (Math.abs(g.T[3 * i + 1] - z * u) > 1e-9 || Math.min(Math.abs(g.T[3 * i + 2] - w), 1 - Math.abs(g.T[3 * i + 2] - w)) > 1e-6) bad++;
    }
    if (!n || bad) fail(`${sh.id}: the screw's thread carries the wrong height or turn at ${bad} of ${n} corners`);
  }
  // the shader draws both threads, screw and hole, with the model's pitch and no number of its own
  const src = fs.readFileSync(new URL('../../js/gears/scene.js', import.meta.url), 'utf8');
  if (/sin\(vT\.y \* (260|20\.944)/.test(src) || (src.match(/thread\(\)/g) || []).length < 5 || !src.includes('vT.y / ${MM.screw.pitch')) fail('scene.js draws a thread with a pitch that is not MM.screw.pitch');
}

console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
