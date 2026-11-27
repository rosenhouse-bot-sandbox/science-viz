// Gears on a cube and an octahedron, the workshop: what holds the part in each setup, and how much of the part it
// touches. The picture (make.js) places the vise, the collets and the V block from these; the tests check that every
// holding surface is big enough at every cutting step. Lengths in mm, areas in mm².
import { dot, bodyFaces } from './model.js?v=42230d28';

export const VISE = { floor: 30, jawTop: 56 };            // heights above the table (the vise is drawn to these in shop.js)
export const SQUARE = 7;                                   // half the square collet's bore, across its flats
export const VBLOCK = { half: 7, front: 2, back: 24 };     // the V block: a 14 mm square bar; where it ends toward the part, and in the collet
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function area(poly) { let s = 0; for (let i = 1; i + 1 < poly.length; i++) s += Math.hypot(...crs(sub(poly[i], poly[0]), sub(poly[i + 1], poly[0]))) / 2; return s; }
// the part of a polygon with n · p <= d
export function clip(poly, n, d) {
  const out = [];
  for (let k = 0; k < poly.length; k++) {
    const p = poly[k], q = poly[(k + 1) % poly.length], dp = dot(n, p) - d, dq = dot(n, q) - d;
    if (dp <= 0) out.push(p);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) { const f = dp / (dp - dq); out.push(p.map((x, i) => x + (q[i] - x) * f)); }
  }
  return out;
}
// the part's extent on the machine (R: part to machine, row-major), across the jaws (y) and up (z)
export function boxOf(planes, R) {
  let z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const f of bodyFaces(planes)) for (const q of f.poly) { const y = R[3] * q[0] + R[4] * q[1] + R[5] * q[2], z = R[6] * q[0] + R[7] * q[1] + R[8] * q[2]; z0 = Math.min(z0, z); z1 = Math.max(z1, z); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { z0, z1, y0, y1 };
}
// In the vise the part sits on parallels (hp high) with its top 4 mm above the jaws, more under a big chamfer mill,
// whose cone reaches down past the edge it cuts. grip: how far up the part's sides the jaws reach.
export function viseSeat(height, tool) {
  const top = VISE.jawTop - 1 + Math.max(4, tool.type === 'chamfer' ? tool.d / 2 + 1 : 0), hp = Math.max(4, top - height - VISE.floor);
  return { hp, grip: VISE.jawTop - VISE.floor - hp };
}
// the faces of the part that lie flat against something: normal n, at the part's extreme that way, cut down to `keep`
// (a list of [normal, d] half-spaces)
function flats(planes, n, keep) {
  let ext = -Infinity, a = 0;
  const faces = bodyFaces(planes);
  for (const f of faces) for (const q of f.poly) ext = Math.max(ext, dot(q, n));
  for (const f of faces) if (dot(f.n, n) > 1 - 1e-6 && Math.abs(dot(f.poly[0], n) - ext) < 1e-6) a += area(keep.reduce((p, [m, d]) => (p.length ? clip(p, m, d) : p), f.poly));
  return { a, ext };
}
// what holds a mill part, for a setup (op), one of its steps, and the part's planes: [{ name, area }]
export function holding(op, step, planes) {
  const out = [];
  if (op.hold === 'vise') {
    const R = step.rot, y = [R[3], R[4], R[5]], z = [R[6], R[7], R[8]], box = boxOf(planes, R), seat = viseSeat(box.z1 - box.z0, step.tool);
    for (const s of [1, -1]) out.push({ name: s > 0 ? 'fixed jaw' : 'moving jaw', area: flats(planes, y.map((v) => v * s), [[z, box.z0 + seat.grip]]).a });
    // the two parallels under it, each 3 mm wide, just inside a jaw: a rest, not a clamp
    for (const s of [1, -1]) out.push({ name: 'parallel', rest: true, area: flats(planes, z.map((v) => -v), [[y.map((v) => v * s), s > 0 ? box.y1 - 0.5 : -box.y0 - 0.5], [y.map((v) => -v * s), s > 0 ? -(box.y1 - 3.5) : box.y0 + 3.5]]).a });
  } else if (op.hold === 'indexer' && !op.seat) {
    // a square collet: its four flats on the part's four sides, as far in as the part goes
    const ax = op.axis, lo = Math.min(...bodyFaces(planes).flatMap((f) => f.poly.map((q) => dot(q, ax))));
    for (const n of sides(ax)) { const f = flats(planes, n, [[ax, lo + op.inside]]); out.push({ name: 'collet flat', area: Math.abs(f.ext - SQUARE) < 0.03 ? f.a : 0 }); }
  } else if (op.hold === 'indexer') {
    // the V block: two of the part's finished faces seated in the V, each with a screw into the part's own tapped hole
    const ax = op.axis, [b1, b2] = barSides();
    for (const n of op.seat) out.push({ name: 'V seat', area: flats(planes, n, [[ax, -VBLOCK.front], [b1, VBLOCK.half], [b2, VBLOCK.half], [b1.map((v) => -v), VBLOCK.half], [b2.map((v) => -v), VBLOCK.half]]).a });
  }
  return out;
}
// the four directions square to an axis along part y, for the collet's flats (x and z) or, turned 45°, the V block's sides
const sides = (ax, turned = false) => (turned ? [[1, 0, 1], [1, 0, -1], [-1, 0, -1], [-1, 0, 1]].map((v) => v.map((x) => x / Math.SQRT2)) : [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1]]);
export const barSides = () => sides(null, true);
// On the lathe: the radius the chuck's jaws or the collet close on, and how much of the part's length they hold at
// that radius, from the lathe state at the start of the setup
export function gripOf(S, op) {
  if (!S) return { r: 5, len: 10 };
  let r = 0, len = 0;
  const inside = (i) => { const x = op.dir * (S.z0 + i * 0.01 - op.zJaw); return x < 0 && x > -10; };
  for (let i = 0; i < S.n; i++) if (inside(i) && S.ro[i] > S.ri[i]) r = Math.max(r, S.ro[i]);
  for (let i = 0; i < S.n; i++) if (inside(i) && Math.abs(S.ro[i] - r) < 0.005) len += 0.01;
  return { r: r || 5, len };
}
