// Fits each built muscle to the BodyParts3D scan of the same muscle, and measures how close the fit is.
// Used by build-data.mjs (which writes shoulder/data/muscles.json) and review.mjs (Gabe's scan check).
import { V, pca, K, bandMesh, binU } from '../../js/shoulder/geom.js';

export function samples(scan, n = 9000) {
  const { v, f } = scan, A = [];
  let tot = 0;
  for (let i = 0; i < f.length; i += 3) { const a = v[f[i]], b = v[f[i + 1]], c = v[f[i + 2]]; tot += V.len(V.cross(V.sub(b, a), V.sub(c, a))) / 2; A.push(tot); }
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out = [];
  for (let s = 0; s < n; s++) {
    const r = rnd() * tot; let lo = 0, hi = A.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (A[m] < r) lo = m + 1; else hi = m; }
    const a = v[f[3 * lo]], b = v[f[3 * lo + 1]], c = v[f[3 * lo + 2]]; let x = rnd(), y = rnd(); if (x + y > 1) { x = 1 - x; y = 1 - y; }
    out.push(V.add(a, V.add(V.mul(V.sub(b, a), x), V.mul(V.sub(c, a), y))));
  }
  return out;
}
const QT = 0.9;   // envelope quantile: ignore the outermost 10% of samples in each bin (sampling noise, slab slope)
// Fit a muscle scan with k bands. Pass 1 slices along the straight long axis to find a centerline; pass 2
// re-slices perpendicular to that curved centerline, each slice with its own frame (U across, V thickness).
// Each slice's outline is where its plane cuts the scan (or, failing that, the envelope of the scan's surface points
// near the plane). ins: a point near the insertion.
export function fitMuscle(scan0, k, ins, N = 40) {
  const pts = samples(scan0, 30000), all = pca(pts), bands = [];
  const groups = [];
  if (k === 1) groups.push(pts);
  else {
    const s = pts.map(p => V.dot(V.sub(p, all.m), all.ax[1])).sort((a, b) => a - b);
    const q = i => s[Math.min(s.length - 1, Math.floor(i / k * s.length))];
    for (let i = 0; i < k; i++) { const lo = i ? q(i) : -1e9, hi = i < k - 1 ? q(i + 1) : 1e9; groups.push(pts.filter(p => { const t = V.dot(V.sub(p, all.m), all.ax[1]); return t >= lo && t < hi; })); }
  }
  for (const g of groups) {
    const { m, ax } = pca(g);
    let a = ax[0], u0 = k > 1 ? V.norm(V.sub(all.ax[1], V.mul(ax[0], V.dot(all.ax[1], ax[0])))) : ax[1];
    let ts = g.map(p => V.dot(V.sub(p, m), a)), t0 = Math.min(...ts), t1 = Math.max(...ts);
    const e0 = V.add(m, V.mul(a, t0)), e1 = V.add(m, V.mul(a, t1));
    if (V.len(V.sub(e0, ins)) < V.len(V.sub(e1, ins))) { a = V.mul(a, -1); u0 = V.mul(u0, -1); ts = ts.map(t => -t); [t0, t1] = [-t1, -t0]; }
    // pass 1: centroids of straight slices
    const step = (t1 - t0) / N; let C = [];
    for (let i = 0; i <= N; i++) { const tc = t0 + step * (0.3 + i * (N - 0.6) / N); const P = g.filter((p, j) => Math.abs(ts[j] - tc) < step * 0.6); C.push(P.length > 8 ? V.mean(P) : null); }
    for (let i = 0; i < C.length; i++) if (!C[i]) C[i] = C[i - 1] || C.find(Boolean);
    for (let it = 0; it < 3; it++) C = C.map((c, i) => i === 0 || i === C.length - 1 ? c : V.mean([C[i - 1], c, c, C[i + 1]]));
    // grow the centerline past each end, following the points that lie beyond it (a tendon turning over the ball, a broad origin)
    for (const end of [0, 1]) for (let it = 0; it < 12; it++) {
      const e = end ? C[C.length - 1] : C[0], pr = end ? C[C.length - 2] : C[1], T = V.norm(V.sub(e, pr));
      const near = []; for (const p of g) { let bi = 0, bd = 1e18; for (let i = 0; i < C.length; i++) { const d = V.sub(p, C[i]), dd = V.dot(d, d); if (dd < bd) { bd = dd; bi = i; } } if (bi === (end ? C.length - 1 : 0)) { const al = V.dot(V.sub(p, e), T); if (al > step * 0.4 && al < step * 2.2) near.push(p); } }
      if (near.length < 15) break;
      let nc = V.mean(near);
      // turn at most 12 degrees per node: a cross-section as wide as a fan-shaped muscle cannot follow a sharp bend
      const dd = V.sub(nc, e), al = Math.max(V.dot(dd, T), step * 0.5), lat = V.sub(dd, V.mul(T, V.dot(dd, T))), ll = V.len(lat), lim = Math.tan(12 * Math.PI / 180) * al;
      nc = V.add(e, V.add(V.mul(T, al), ll > lim ? V.mul(lat, lim / ll) : lat));
      if (end) C.push(nc); else C.unshift(nc);
    }
    // smooth the joins between the first centerline and the grown ends (ends kept)
    for (let it = 0; it < 4; it++) C = C.map((c, i) => i === 0 || i === C.length - 1 ? c : V.mean([C[i - 1], c, c, C[i + 1]]));
    // frames along the centerline
    const F = C.map((c, i) => { const T = V.norm(V.sub(C[Math.min(i + 1, C.length - 1)], C[Math.max(i - 1, 0)])); const U = V.norm(V.sub(u0, V.mul(T, V.dot(u0, T)))); return { c, T, U, W: V.cross(T, U) }; });
    // arc-length parameter of each point: nearest centerline segment
    const L = [0]; for (let i = 1; i < C.length; i++) L.push(L[i - 1] + V.len(V.sub(C[i], C[i - 1])));
    const sl = F.map(() => []);
    for (const p of g) {
      let best = 1e18, bi = 0;
      for (let i = 0; i < C.length; i++) { const d = V.sub(p, C[i]), along = V.dot(d, F[i].T), dd = V.dot(d, d) - along * along + (Math.abs(along) > step * 0.55 ? (Math.abs(along) - step * 0.55) ** 2 * 50 : 0); if (dd < best) { best = dd; bi = i; } }
      const d = V.sub(p, C[bi]); if (Math.abs(V.dot(d, F[bi].T)) < step * 0.6) sl[bi].push([V.dot(d, F[bi].U), V.dot(d, F[bi].W)]);
    }
    const out = [];
    for (let i = 0; i < sl.length; i++) {
      const P = sl[i];
      if (P.length < 16) { out.push(null); continue; }
      const us = P.map(p => p[0]).sort((x, y) => x - y), lo = us[Math.floor(us.length * 0.02)], hi = us[Math.ceil(us.length * 0.98) - 1];
      const bins = Array.from({ length: K }, () => []);
      for (const [u, v] of P) bins[Math.min(K - 1, Math.max(0, Math.round(((u - lo) / (hi - lo + 1e-9) - 0.01) / 0.98 * (K - 1))))].push(v);
      const top = [], bot = [];
      for (const bn of bins) { if (bn.length < 3) { top.push(null); bot.push(null); continue; } bn.sort((x, y) => x - y); const md = bn[bn.length >> 1];
        const up = bn.filter(v => v >= md), dn = bn.filter(v => v <= md); top.push(up[Math.min(up.length - 1, Math.floor(up.length * QT))]); bot.push(dn[Math.floor(dn.length * (1 - QT))]); }
      for (const arr of [top, bot]) for (let j = 0; j < K; j++) if (arr[j] == null) { let l = j - 1, r = j + 1; while (l >= 0 && arr[l] == null) l--; while (r < K && arr[r] == null) r++; arr[j] = l >= 0 && r < K ? (arr[l] + arr[r]) / 2 : l >= 0 ? arr[l] : arr[r] ?? 0; }
      // a bin with few samples (often at the edges) gives a ragged edge: take the median of each bin and its neighbours
      const med3 = (arr) => arr.map((x, j) => [arr[Math.max(0, j - 1)], x, arr[Math.min(K - 1, j + 1)]].sort((a, b) => a - b)[1]);
      out.push({ ...F[i], lo, hi, top: med3(top), bot: med3(bot) });
    }
    // Where the slice's plane cuts the scan near the centerline, take that cut outline itself: its width, and its
    // highest and lowest point at each outline position. The point envelopes above stay only where there is no
    // usable cut.
    for (let i = 0; i < out.length; i++) {
      const cut = section(scan0, F[i]); if (!cut) continue;
      let { lo, hi } = cut;
      if (k > 1 && out[i]) { lo = Math.max(lo, out[i].lo); hi = Math.min(hi, out[i].hi); }
      if (hi - lo < 1) continue;
      const top = [], bot = [];
      for (let j = 0; j < K; j++) { const vs = cut.at(lo + binU(j) * (hi - lo)); top.push(vs.length ? Math.max(...vs) : null); bot.push(vs.length ? Math.min(...vs) : null); }
      for (const arr of [top, bot]) for (let j = 0; j < K; j++) if (arr[j] == null) { let l = j - 1, r = j + 1; while (l >= 0 && arr[l] == null) l--; while (r < K && arr[r] == null) r++; arr[j] = l >= 0 && r < K ? (arr[l] + arr[r]) / 2 : l >= 0 ? arr[l] : arr[r] ?? 0; }
      // an oblique cut (where the centerline bends) can catch a stretch of the muscle that is not this cross-section:
      // keep the outline only if every point of it is near the scan
      const sNew = { ...F[i], lo, hi, top, bot }, m = bandMesh({ sl: [sNew, sNew] }), Q = [];
      for (let q = 0; q < 2 * K; q++) Q.push([m.pos[3 * q], m.pos[3 * q + 1], m.pos[3 * q + 2]]);
      const mids = Q.map((p, q) => V.mul(V.add(p, Q[(q + 1) % Q.length]), 0.5));
      if (Math.max(...surfDist([...Q, ...mids], scan0)) < 3) out[i] = sNew;
    }
    for (let i = 0; i < out.length; i++) if (!out[i]) { const h = [...out.slice(0, i)].reverse().find(Boolean) || out.slice(i).find(Boolean); out[i] = { ...F[i], lo: h.lo * 0.6, hi: h.hi * 0.6, top: h.top.map(x => x * 0.6), bot: h.bot.map(x => x * 0.6) }; }
    // and along the muscle: a bin that jumps away from both neighbouring slices takes their median
    const med = (f) => out.map((s, i) => (i === 0 || i === out.length - 1 ? f(s) : [f(out[i - 1]), f(s), f(out[i + 1])].sort((a, b) => a - b)[1]));
    const tops = Array.from({ length: K }, (_, j) => med((s) => s.top[j])), bots = Array.from({ length: K }, (_, j) => med((s) => s.bot[j]));
    out.forEach((s, i) => { s.top = s.top.map((_, j) => tops[j][i]); s.bot = s.bot.map((_, j) => bots[j][i]); });
    const sm = out.map((s, i) => { const nb = [out[i - 1], s, s, out[i + 1]].filter(Boolean), av = f => nb.reduce((q, n) => q + f(n), 0) / nb.length;
      return { ...s, lo: av(n => n.lo), hi: av(n => n.hi), top: s.top.map((_, j) => av(n => n.top[j])), bot: s.bot.map((_, j) => av(n => n.bot[j])) }; });
    bands.push({ a, u0, sl: sm });
  }
  return bands;
}

// The outline where the plane through f.c across f.T cuts a closed mesh, in the slice's (U, W) coordinates: the
// closed piece nearest the centerline. Returns its extent across (lo, hi) and at(u), the heights where it crosses u.
function section(scan, f) {
  const { v, f: tri } = scan, segs = [];   // pieces are joined where their crossing points coincide (to 0.01 mm)
  const dist = v.map(p => V.dot(V.sub(p, f.c), f.T));
  const uvOf = (a, b) => { const t = dist[a] / (dist[a] - dist[b]), p = V.add(v[a], V.mul(V.sub(v[b], v[a]), t)), d = V.sub(p, f.c); return [V.dot(d, f.U), V.dot(d, f.W)]; };
  for (let i = 0; i < tri.length; i += 3) {
    const e = []; for (const [a, b] of [[tri[i], tri[i + 1]], [tri[i + 1], tri[i + 2]], [tri[i + 2], tri[i]]]) if ((dist[a] > 0) !== (dist[b] > 0)) { const q = uvOf(a, b); e.push([Math.round(q[0] * 100) + ',' + Math.round(q[1] * 100), q]); }
    if (e.length === 2) segs.push(e);
  }
  if (!segs.length) return null;
  // join segments that share an edge crossing into pieces
  const par = new Map(), find = (x) => { while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
  for (const [[k1], [k2]] of segs) { if (!par.has(k1)) par.set(k1, k1); if (!par.has(k2)) par.set(k2, k2); par.set(find(k1), find(k2)); }
  const pieces = new Map(); for (const sg of segs) { const r = find(sg[0][0]); if (!pieces.has(r)) pieces.set(r, []); pieces.get(r).push(sg); }
  // the nearest piece, and any other within 20 mm more (a muscle's ragged origin can cut as several small pieces)
  const near = [...pieces.values()].map(pc => [Math.min(...pc.map(([[, p]]) => Math.hypot(p[0], p[1]))), pc]), bd = Math.min(...near.map(x => x[0]));
  const best = near.filter(([d]) => d < bd + 20).flatMap(([, pc]) => pc);
  if (bd > 15) return null;
  const us = best.flatMap(([[, p], [, q]]) => [p[0], q[0]]);
  return { lo: Math.min(...us), hi: Math.max(...us), at: (u) => { const out = []; for (const [[, p], [, q]] of best) if ((p[0] - u) * (q[0] - u) < 0) out.push(p[1] + (q[1] - p[1]) * (u - p[0]) / (q[0] - p[0])); return out; } };
}

// Surface distance and volume: distance from points to a triangle mesh's surface, and enclosed volume.
function closest(p, a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const d = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const d1 = d(ab, ap), d2 = d(ac, ap); if (d1 <= 0 && d2 <= 0) return a;
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]], d3 = d(ab, bp), d4 = d(ac, bp); if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]]; }
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], d5 = d(ab, cp), d6 = d(ac, cp); if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]]; }
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return [b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])]; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den; return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
}
export function surfDist(P, mesh) {
  const { v, f } = mesh, T = [];
  for (let i = 0; i < f.length; i += 3) { const a = v[f[i]], b = v[f[i + 1]], c = v[f[i + 2]]; const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
    const r = Math.sqrt(Math.max(...[a, b, c].map(q => (q[0] - cx) ** 2 + (q[1] - cy) ** 2 + (q[2] - cz) ** 2))); T.push([a, b, c, cx, cy, cz, r]); }
  return P.map(p => { let best = 1e9;
    for (const [a, b, c, cx, cy, cz, r] of T) { const dc = Math.sqrt((p[0] - cx) ** 2 + (p[1] - cy) ** 2 + (p[2] - cz) ** 2) - r; if (dc >= best) continue;
      const q = closest(p, a, b, c), dd = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (dd < best) best = dd; }
    return best; });
}
export function volume(v, f) { let s = 0; for (let i = 0; i < f.length; i += 3) { const a = v[f[i]], b = v[f[i + 1]], c = v[f[i + 2]];
  s += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]); } return Math.abs(s / 6); }

// generalized winding number of points about a closed triangle mesh (1 inside, 0 outside, 1/2 on the surface;
// 2 where a self-overlapping surface folds over itself)
export function windings(P, v, f) {
  const T = new Float64Array(f.length * 3);
  for (let i = 0; i < f.length; i++) { const q = v[f[i]]; T[3 * i] = q[0]; T[3 * i + 1] = q[1]; T[3 * i + 2] = q[2]; }
  return P.map(([px, py, pz]) => {
    let w = 0;
    for (let i = 0; i < T.length; i += 9) {
      const ax = T[i] - px, ay = T[i + 1] - py, az = T[i + 2] - pz, bx = T[i + 3] - px, by = T[i + 4] - py, bz = T[i + 5] - pz, cx = T[i + 6] - px, cy = T[i + 7] - py, cz = T[i + 8] - pz;
      const la = Math.sqrt(ax * ax + ay * ay + az * az), lb = Math.sqrt(bx * bx + by * by + bz * bz), lc = Math.sqrt(cx * cx + cy * cy + cz * cz);
      const det = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
      w += Math.atan2(det, la * lb * lc + (ax * bx + ay * by + az * bz) * lc + (bx * cx + by * cy + bz * cz) * la + (cx * ax + cy * ay + cz * az) * lb);
    }
    return w / (2 * Math.PI);
  });
}
export const winding = (p, v, f) => windings([p], v, f)[0];
