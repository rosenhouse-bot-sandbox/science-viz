// Gears on a cube and an octahedron, the workshop: does anything run into anything? Used by the tests, not by the
// page. In each frame one thing turns: on the lathe the spindle (chuck, jaws or collet, mandrel, the part), on the mill
// the tool (cutter, its holder, the spindle). What turns sweeps out a solid of revolution about its axis, so it is kept as
// an envelope: for each slice along the axis, the band of radii it fills. Everything that does not turn is cut into
// small triangles, and a corner of one of them inside a band is a collision.
const BIN = 0.25;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.sqrt(dot(a, a));
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const apply = (m, p) => [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);

// every triangle of an item in the world that `near` lets through, split until no edge is longer than `edge`
function triangles(it, edge, out, near = null) {
  const g = it.mesh.g; if (!g) return;
  const W = []; for (let i = 0; i < g.P.length / 3; i++) W.push(apply(it.M, [g.P[3 * i], g.P[3 * i + 1], g.P[3 * i + 2]]));
  const split = (a, b, c, depth) => {
    const ab = len(sub(a, b)), bc = len(sub(b, c)), ca = len(sub(c, a)), m = Math.max(ab, bc, ca);
    if (m <= edge || depth > 14) { out(a, b, c); return; }
    if (near && depth > 2 && !near(a, b, c, m)) return;
    if (m === ab) { const d = mid(a, b); split(a, d, c, depth + 1); split(d, b, c, depth + 1); }
    else if (m === bc) { const d = mid(b, c); split(a, b, d, depth + 1); split(a, d, c, depth + 1); }
    else { const d = mid(c, a); split(a, b, d, depth + 1); split(d, b, c, depth + 1); }
  };
  for (let i = 0; i < g.I.length; i += 3) {
    const a = W[g.I[i]], b = W[g.I[i + 1]], c = W[g.I[i + 2]];
    if (near && !near(a, b, c, Math.max(len(sub(a, b)), len(sub(b, c)), len(sub(c, a))))) continue;
    split(a, b, c, 0);
  }
}
// along the axis and out from it
const polar = (A, p) => { const d = sub(p, A.p), a = dot(d, A.s); return [a, len(sub(d, A.s.map((v) => v * a)))]; };

// the envelope of a turning item: bin -> [[rmin, rmax]]
const ENV = new WeakMap();
export function envelope(it, A) {
  const key = Array.from(it.M, (v) => v.toFixed(3)).join() + '|' + A.p.map((v) => v.toFixed(3)).join() + A.s.map((v) => v.toFixed(4)).join();
  let byKey = ENV.get(it.mesh.g); if (!byKey) ENV.set(it.mesh.g, byKey = new Map());
  if (byKey.has(key)) return byKey.get(key);
  const E = new Map(); byKey.set(key, E);
  triangles(it, 2, (a, b, c) => {
    const q = [a, b, c].map((p) => polar(A, p)), a0 = Math.min(q[0][0], q[1][0], q[2][0]), a1 = Math.max(q[0][0], q[1][0], q[2][0]);
    const r0 = Math.min(q[0][1], q[1][1], q[2][1]), r1 = Math.max(q[0][1], q[1][1], q[2][1]);
    for (let k = Math.floor(a0 / BIN); k <= Math.floor(a1 / BIN); k++) { const e = E.get(k); if (e) { e[0][0] = Math.min(e[0][0], r0); e[0][1] = Math.max(e[0][1], r1); } else E.set(k, [[r0, r1]]); }
  });
  return E;
}
// the envelope of a turned part, exactly, from its slices: x = dir (z - zJaw) along the spindle; a slice can hold
// two bands (a ring left inside a recess)
export function turnedEnvelope(S, dir, zJaw, dz) {
  const E = new Map(), bin = 0.05; E.bin = bin;
  const add = (k, b) => { const e = E.get(k); if (!e) { E.set(k, [b.slice()]); return; }
    const o = e.find((q) => b[0] <= q[1] + 0.05 && b[1] >= q[0] - 0.05); if (o) { o[0] = Math.min(o[0], b[0]); o[1] = Math.max(o[1], b[1]); } else e.push(b.slice()); };
  for (let i = 0; i < S.n; i++) {
    const k = Math.floor(dir * (S.z0 + i * dz - zJaw) / bin);
    if (S.ro[i] > S.ri[i] + 1e-6) add(k, [S.ri[i], S.ro[i]]);
    if (S.ring && S.ring[i]) add(k, S.ring[i]);
  }
  return E;
}
// how far point p is inside envelope E (0 if outside); a band thinner than 2 margins counts as a surface
function inside(E, A, p, margin) {
  const [a, r] = polar(A, p);
  // a point counts only if it is inside the slices a margin to either side too, so that a face that only touches
  // a slice's edge (a facing tool on the face it cuts) is not taken for a collision
  let d = Infinity;
  for (const x of [a - margin, a + margin]) {
    const e = E.get(Math.floor(x / (E.bin || BIN))), b = e && e.find((q) => r > q[0] && r < q[1]); if (!b) return 0;
    d = Math.min(d, r - b[0], b[1] - r);
  }
  return d > margin ? d : 0;
}

// what runs into what. turning: the roles that turn; pairs whose contact is the cutting itself are skipped, except
// that the cutting tool is still checked against the part away from its edge (more than `edgeR` from `tip`)
export function collisions(items, A, tip, { turning, still, skip = [], cutPart = null, edgeR = 1.2, margin = 0.15 }) {
  const s = A.s, l = len(s), axis = { p: A.p, s: s.map((v) => v / l) };
  const spin = items.filter((it) => turning.includes(it.role) && it.mesh.g);
  const rest = items.filter((it) => still.includes(it.role) && it.mesh.g);
  const env = spin.map((it) => { const E = it.envelope || envelope(it, axis); let lo = Infinity, hi = -Infinity, rmax = 0; for (const [k, e] of E) { lo = Math.min(lo, k); hi = Math.max(hi, k); for (const b of e) rmax = Math.max(rmax, b[1]); } return { it, E, lo: lo * (E.bin || BIN), hi: (hi + 1) * (E.bin || BIN), rmax }; });
  const found = [];
  for (const it of rest) {
    for (const { it: o, E, lo, hi, rmax } of env) {
      if (skip.some(([x, y]) => (x === it.role && y === o.role) || (x === o.role && y === it.role))) continue;
      const edgeOnly = cutPart && ((it.role === cutPart[0] && o.role === cutPart[1]) || (it.role === cutPart[1] && o.role === cutPart[0]));
      let worst = 0, at = null;
      const test = (p) => {
        const d0 = sub(p, axis.p), a = dot(d0, axis.s); if (a < lo || a > hi) return;
        if (dot(d0, d0) - a * a > rmax * rmax) return;
        if (edgeOnly && tip && len(sub(p, tip)) < (it.edge || edgeR)) return;
        const d = inside(E, axis, p, margin); if (d > worst) { worst = d; at = p; }
      };
      // only the triangles that come near the turning thing's cylinder are split and tested
      const near = (a, b, c, m) => {
        const q = [a, b, c].map((p) => polar(axis, p));
        if (Math.max(q[0][0], q[1][0], q[2][0]) + m < lo || Math.min(q[0][0], q[1][0], q[2][0]) - m > hi) return false;
        return Math.min(q[0][1], q[1][1], q[2][1]) - m <= rmax;
      };
      triangles(it, 1, (a, b, c) => { test(a); test(b); test(c); test([(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]); }, near);
      if (worst > 0) found.push({ a: it.name, b: o.name, depth: +worst.toFixed(2), at: at.map((v) => +v.toFixed(1)) });
    }
  }
  return found;
}
