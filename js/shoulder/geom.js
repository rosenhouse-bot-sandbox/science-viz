// Shoulder: geometry shared by the page and its tests. Vectors are plain [x, y, z] arrays in millimetres;
// the scene's axes are x toward the body's left (the right arm lies at -x), y up, z forward.
// A built muscle is a list of slices along a curved centerline; each slice holds its own frame
// (U across the muscle, W through its thickness) and the upper and lower edge of its outline at K
// points across. bandMesh() turns one band of slices into a closed surface.

export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]), norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  mean: ps => { const m = [0, 0, 0]; for (const p of ps) { m[0] += p[0]; m[1] += p[1]; m[2] += p[2]; } return V.mul(m, 1 / ps.length); },
};
// rotate p about an axis k (unit) through point o by angle a
export function rot(p, o, k, a) {
  const d = V.sub(p, o), c = Math.cos(a), s = Math.sin(a), kd = V.dot(k, d), kx = V.cross(k, d);
  return V.add(o, [d[0] * c + kx[0] * s + k[0] * kd * (1 - c), d[1] * c + kx[1] * s + k[1] * kd * (1 - c), d[2] * c + kx[2] * s + k[2] * kd * (1 - c)]);
}

// principal axes of a point set (power iteration on covariance)
export function pca(ps) {
  const m = V.mean(ps), C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of ps) { const d = V.sub(p, m); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; }
  const mv = (M, x) => [V.dot(M[0], x), V.dot(M[1], x), V.dot(M[2], x)];
  const ax = []; let M = C.map(r => r.slice());
  for (let n = 0; n < 2; n++) {
    let x = V.norm([1, 0.7, 0.3 + n]);
    for (let it = 0; it < 80; it++) x = V.norm(mv(M, x));
    const l = V.dot(x, mv(M, x)); ax.push(x);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] -= l * x[i] * x[j];
  }
  ax.push(V.norm(V.cross(ax[0], ax[1])));
  return { m, ax };
}

export const K = 16;
// Build a closed mesh for one band. Ring: K points along the top (left to right), K along the bottom (right to left).
// opts: swell(t) -> thickness factor; hole(t, s, top) -> bool, s across the width 0..1
// where outline point j sits across a slice, from 0 (lo) to 1 (hi): the first and last sit just inside the edges, so
// the outline reaches the muscle's real edge
export const binU = (j) => 0.01 + 0.98 * j / (K - 1);
export function bandMesh(b, opts = {}) {
  const S = b.sl.length, M = 2 * K, pos = [], tt = [], idx = [], ring = [];
  const at = (s, uu, vv) => V.add(s.c, V.add(V.mul(s.U, uu), V.mul(s.W, vv)));
  for (let i = 0; i < S; i++) {
    const s = b.sl[i], t = i / (S - 1), k2 = opts.swell ? opts.swell(t) : 1, r = [];
    for (let j = 0; j < M; j++) {
      const top = j < K, jj = top ? j : M - 1 - j, uu = s.lo + binU(jj) * (s.hi - s.lo);
      const mid = (s.top[jj] + s.bot[jj]) / 2, h = Math.max(0.3, (s.top[jj] - s.bot[jj]) / 2) * k2;
      r.push(pos.length / 3); pos.push(...at(s, uu, mid + (top ? h : -h))); tt.push(t, binU(jj), top ? 1 : 0);
    }
    ring.push(r);
  }
  const cen = i => V.mean(ring[i].map(r => pos.slice(3 * r, 3 * r + 3)));   // each end is closed at its outline's middle
  const capA = pos.length / 3; pos.push(...cen(0)); tt.push(0, 0.5, 0);
  const capB = pos.length / 3; pos.push(...cen(S - 1)); tt.push(1, 0.5, 0);
  for (let i = 0; i + 1 < S; i++) for (let j = 0; j < M; j++) {
    const a = ring[i][j], bq = ring[i][(j + 1) % M], c = ring[i + 1][j], d = ring[i + 1][(j + 1) % M];
    if (opts.hole) { const top = j < K, jj = top ? j : M - 1 - j; if (opts.hole((i + 0.5) / (S - 1), binU(jj), top)) continue; }
    idx.push(a, c, bq, bq, c, d);
  }
  for (let j = 0; j < M; j++) { idx.push(capA, ring[0][j], ring[0][(j + 1) % M]); idx.push(capB, ring[S - 1][(j + 1) % M], ring[S - 1][j]); }
  return { pos, tt, idx, stride: 3 };
}

// sphere fit (least squares) for the humeral head
export function sphereFit(ps) {
  // normal equations for [2x 2y 2z 1] c = x²+y²+z²
  const A = Array.from({ length: 4 }, () => [0, 0, 0, 0]), B = [0, 0, 0, 0];
  for (const p of ps) { const r = [2 * p[0], 2 * p[1], 2 * p[2], 1], b = V.dot(p, p); for (let i = 0; i < 4; i++) { B[i] += r[i] * b; for (let j = 0; j < 4; j++) A[i][j] += r[i] * r[j]; } }
  for (let i = 0; i < 4; i++) { let mx = i; for (let k = i + 1; k < 4; k++) if (Math.abs(A[k][i]) > Math.abs(A[mx][i])) mx = k; [A[i], A[mx]] = [A[mx], A[i]]; [B[i], B[mx]] = [B[mx], B[i]];
    for (let k = 0; k < 4; k++) if (k !== i) { const f = A[k][i] / A[i][i]; for (let j = i; j < 4; j++) A[k][j] -= f * A[i][j]; B[k] -= f * B[i]; } }
  const c = B.map((b, i) => b / A[i][i]);
  return { c: c.slice(0, 3), r: Math.sqrt(c[3] + c[0] * c[0] + c[1] * c[1] + c[2] * c[2]) };
}

