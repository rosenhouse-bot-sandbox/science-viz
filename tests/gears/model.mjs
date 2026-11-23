// Checks the gears without a browser. For each solid it checks:
//  - which sets can turn: the cube's ring of four and the octahedron's eight can, the cube with six cannot, and
//    the reason matches a loop of meshing gears with an odd count;
//  - every pair of meshing gears, turned through two tooth spacings: no tooth of one enters the other;
//  - the teeth do engage: holding one gear, the other can turn only by the backlash before it hits a tooth;
//  - gears that do not mesh never come near each other, and the body that holds the axles touches no gear;
//  - the numbers the page shows (the angle between axes, the cone angle, the tooth count) are the ones it uses.
//
//   node tests/gears/model.mjs
import { SHAPES, makeShape, angles, inside, bodyPlanes, bodyFaces, parts, dot, norm, R_IN, R_OUT } from '../../js/gears/model.js';

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
for (const sh of SHAPES) {
  if (sh.jammed) continue;
  let worst = 0, where = '';
  for (const e of sh.meshes) for (let k = 0; k < 24; k++) {
    const t = k / 24 * 2 * sh.pitch, n = overlap(sh, e, t);
    if (n > worst) { worst = n; where = `gears ${e.i} and ${e.j} at a turn of ${deg(t).toFixed(1)}°`; }
  }
  if (worst) fail(`${sh.id}: teeth overlap at ${worst} sample points, ${where}`);
  // hold gear j, turn gear i a little further either way: it must hit a tooth within a small share of a spacing
  const e = sh.meshes[0];
  for (const t of [0, 0.31, 0.77].map((f) => f * sh.pitch)) for (const dir of [1, -1]) {
    let free = 0;
    for (let x = 0.002; x < 0.5; x += 0.002) { if (overlap(sh, e, t, dir * x * sh.pitch)) break; free = x; }
    if (free > 0.12) fail(`${sh.id}: at a turn of ${deg(t).toFixed(1)}°, one gear turns ${(free * 100).toFixed(0)}% of a tooth spacing ${dir > 0 ? 'forward' : 'back'} before it meets a tooth`);
    if (free === 0 && t === 0) fail(`${sh.id}: the teeth bind, with no room to turn`);
  }
  console.log(`${sh.id}: ${sh.meshes.length} meshing pairs turn freely, axes at ${deg(sh.shaft).toFixed(2)}°, cones of ${deg(sh.alpha).toFixed(2)}°, ${sh.profile.N} teeth`);
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

console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
