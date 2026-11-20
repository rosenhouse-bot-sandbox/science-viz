// Inside a scanned bone, and how deep. Each bone is turned into a grid of cells in its own resting frame:
// a ray is cast up through each column and the cells between its crossings of the surface are inside. Then
// each inside cell is given its distance to the nearest outside cell (a chamfer distance, in mm).
// box: [lo, hi] corners to limit the grid to the part that matters.
export function solid(mesh, h = 1.5, box = null) {
  const p = mesh.pos, f = mesh.idx;
  const lo = [0, 1, 2].map((i) => { let m = 1e9; for (let k = i; k < p.length; k += 3) m = Math.min(m, p[k]); return Math.max(m, box ? box[0][i] : -1e9) - 2 * h; });
  const hi = [0, 1, 2].map((i) => { let m = -1e9; for (let k = i; k < p.length; k += 3) m = Math.max(m, p[k]); return Math.min(m, box ? box[1][i] : 1e9) + 2 * h; });
  const n = [0, 1, 2].map((i) => Math.max(1, Math.ceil((hi[i] - lo[i]) / h))), cols = Array.from({ length: n[0] * n[2] }, () => []);
  for (let t = 0; t < f.length; t += 3) {
    const a = 3 * f[t], b = 3 * f[t + 1], c = 3 * f[t + 2];
    const x0 = Math.min(p[a], p[b], p[c]), x1 = Math.max(p[a], p[b], p[c]), z0 = Math.min(p[a + 2], p[b + 2], p[c + 2]), z1 = Math.max(p[a + 2], p[b + 2], p[c + 2]);
    for (let i = Math.max(0, Math.ceil((x0 - lo[0]) / h - 0.5)); i < n[0] && lo[0] + (i + 0.5) * h <= x1; i++) for (let k = Math.max(0, Math.ceil((z0 - lo[2]) / h - 0.5)); k < n[2] && lo[2] + (k + 0.5) * h <= z1; k++) {
      const x = lo[0] + (i + 0.5) * h, z = lo[2] + (k + 0.5) * h;
      const ax = p[a] - x, az = p[a + 2] - z, bx = p[b] - x, bz = p[b + 2] - z, cx = p[c] - x, cz = p[c + 2] - z;
      const w0 = bx * cz - bz * cx, w1 = cx * az - cz * ax, w2 = ax * bz - az * bx, s = w0 + w1 + w2;
      if (Math.abs(s) < 1e-12 || !((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0))) continue;
      cols[i * n[2] + k].push((w0 * p[a + 1] + w1 * p[b + 1] + w2 * p[c + 1]) / s);
    }
  }
  const N1 = n[1], N2 = n[2], at = (i, j, k) => (i * N2 + k) * N1 + j;
  const D = new Float32Array(n[0] * n[1] * n[2]);
  cols.forEach((ys, ik) => {
    ys.sort((x, y) => x - y);
    for (let q = 0; q + 1 < ys.length; q += 2) for (let j = Math.max(0, Math.ceil((ys[q] - lo[1]) / h - 0.5)); j < N1 && lo[1] + (j + 0.5) * h < ys[q + 1]; j++) D[ik * N1 + j] = 1e9;
  });
  // chamfer distance inside: two sweeps over the grid
  const W = [];
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) if (a || b || c) W.push([a, b, c, h * Math.hypot(a, b, c)]);
  const fwd = W.filter(([a, b, c]) => a < 0 || (a === 0 && (c < 0 || (c === 0 && b < 0)))), back = W.filter((w) => !fwd.includes(w));
  const sweep = (ws, dir) => {
    for (let ii = 0; ii < n[0]; ii++) { const i = dir > 0 ? ii : n[0] - 1 - ii;
      for (let kk = 0; kk < N2; kk++) { const k = dir > 0 ? kk : N2 - 1 - kk;
        for (let jj = 0; jj < N1; jj++) { const j = dir > 0 ? jj : N1 - 1 - jj, x = at(i, j, k); if (D[x] === 0) continue;
          let m = D[x];
          for (const [a, b, c, w] of ws) { const I = i + a, J = j + b, Kk = k + c; const v = I < 0 || J < 0 || Kk < 0 || I >= n[0] || J >= N1 || Kk >= N2 ? 0 : D[at(I, J, Kk)]; if (v + w < m) m = v + w; }
          D[x] = m; } } }
  };
  sweep(fwd, 1); sweep(back, -1);
  // depth at a point (0 outside), by blending the eight cells round it
  const cell = (i, j, k) => (i < 0 || j < 0 || k < 0 || i >= n[0] || j >= N1 || k >= N2 ? 0 : D[at(i, j, k)]);
  const depth = (q) => {
    const x = (q[0] - lo[0]) / h - 0.5, y = (q[1] - lo[1]) / h - 0.5, z = (q[2] - lo[2]) / h - 0.5, i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), fx = x - i, fy = y - j, fz = z - k;
    if (i < -1 || j < -1 || k < -1 || i >= n[0] || j >= N1 || k >= N2) return 0;
    let s = 0;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) s += cell(i + a, j + b, k + c) * (a ? fx : 1 - fx) * (b ? fy : 1 - fy) * (c ? fz : 1 - fz);
    return s;
  };
  const inside = (q) => { const i = Math.floor((q[0] - lo[0]) / h), j = Math.floor((q[1] - lo[1]) / h), k = Math.floor((q[2] - lo[2]) / h); return cell(i, j, k) > 0; };
  // the way out: down the slope of the depth
  const out = (q) => { const e = h * 0.7, g = [0, 1, 2].map((i) => { const a = q.slice(), b = q.slice(); a[i] += e; b[i] -= e; return depth(b) - depth(a); }), l = Math.hypot(...g); return l > 1e-9 ? g.map((x) => x / l) : null; };
  return { inside, depth, out, n, h };
}
