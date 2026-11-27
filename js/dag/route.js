// Right-angle edge routes around the nodes. Used for every edge of the search layout, and for the
// edges between boxes of the layered one. `only` limits the work to some edges.

// Edges as horizontal and vertical runs. Lines are laid through every node's centre and just
// outside every node and box; an edge takes the cheapest path along those lines from its source to
// its target (A* search). A path pays for its length, for each bend, and for running along a line
// that an unrelated edge already uses, and more for running through a box that holds neither of
// its ends. It may not pass through another node, and it does not run along a line that an edge
// with a different source and a different target already uses, unless no other path is left.
// Where a node has no free side left, an edge that leaves it may share the short piece next to it
// with an edge that enters it.
export function routeOrtho(g, pos, boxes, o, only) {
  const N = g.n, hw = o.nodeW / 2, hh = o.nodeH / 2, m = Math.max(5, Math.min(o.gap / 3, 10));
  const lines = (vals) => { vals.sort((p, q) => p - q); const out = []; for (const v of vals) if (!out.length || v - out[out.length - 1] > 1.5) out.push(v); return out; };
  const xv = [], yv = [];
  for (const p of pos) { xv.push(p[0], p[0] - hw - m, p[0] + hw + m); yv.push(p[1], p[1] - hh - m, p[1] + hh + m); }
  for (const b of boxes) { xv.push(b.x - m, b.x + b.w + m); yv.push(b.y - m, b.y + b.h + m); }
  const ring = (a) => { a.unshift(a[0] - 2 * m, a[0] - m); a.push(a[a.length - 1] + m, a[a.length - 1] + 2 * m); return a; };   // two free lines round the outside
  const xs = ring(lines(xv)), ys = ring(lines(yv)), nx = xs.length, ny = ys.length;
  const nearest = (arr, v) => { let lo = 0, hi = arr.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < v) lo = mid + 1; else hi = mid; } return lo > 0 && v - arr[lo - 1] < arr[lo] - v ? lo - 1 : lo; };
  const owner = new Int32Array(nx * ny).fill(-1), inBox = new Int32Array(nx * ny).fill(-1);
  for (const b of boxes) for (let iy = 0; iy < ny; iy++) {
    if (ys[iy] < b.y - 1 || ys[iy] > b.y + b.h + 1) continue;
    for (let ix = 0; ix < nx; ix++) if (xs[ix] >= b.x - 1 && xs[ix] <= b.x + b.w + 1) inBox[iy * nx + ix] = b.k;
  }
  for (let v = 0; v < N; v++) for (let iy = 0; iy < ny; iy++) {
    if (Math.abs(ys[iy] - pos[v][1]) > hh + 1) continue;
    for (let ix = 0; ix < nx; ix++) if (Math.abs(xs[ix] - pos[v][0]) <= hw + 1) owner[iy * nx + ix] = v;
  }
  const usedH = Array.from({ length: nx * ny }, () => null), usedV = Array.from({ length: nx * ny }, () => null);
  const order = (only || g.edges.map((e, i) => i)).slice().sort((p, q) => {
    const d = (i) => Math.abs(pos[g.edges[i][0]][0] - pos[g.edges[i][1]][0]) + Math.abs(pos[g.edges[i][0]][1] - pos[g.edges[i][1]][1]);
    return d(p) - d(q) || p - q;
  });
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
  const cost = new Float64Array(nx * ny * 4), from = new Int32Array(nx * ny * 4), out = new Array(g.edges.length);
  for (const e of order) {
    const [s, t] = g.edges[e];
    const sx = nearest(xs, pos[s][0]), sy = nearest(ys, pos[s][1]), tx = nearest(xs, pos[t][0]), ty = nearest(ys, pos[t][1]), goal = ty * nx + tx;
    cost.fill(Infinity);
    const heap = [];   // [estimate, state]
    const push = (f, st) => { heap.push([f, st]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; const x = heap[p]; heap[p] = heap[i]; heap[i] = x; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let c = 2 * i + 1; if (c >= heap.length) break; if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++; if (heap[i][0] <= heap[c][0]) break; const x = heap[c]; heap[c] = heap[i]; heap[i] = x; i = c; } } return top; };
    const h = (ix, iy) => Math.abs(xs[ix] - xs[tx]) + Math.abs(ys[iy] - ys[ty]);
    const start = sy * nx + sx;
    let found = -1, strict = 2;
    const near = (n, ix, iy) => Math.abs(xs[ix] - pos[n][0]) <= hw + m + 2 && Math.abs(ys[iy] - pos[n][1]) <= hh + m + 2;
    const by = (n, ix, iy, jx, jy) => near(n, ix, iy) && near(n, jx, jy);   // the piece is next to node n
    const relax = (v, d, base, parent) => {
      for (let nd = 0; nd < 4; nd++) {
        if (d >= 0 && nd === (d + 2) % 4) continue;
        const ix = v % nx, iy = (v / nx) | 0, jx = ix + DX[nd], jy = iy + DY[nd];
        if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
        const w = jy * nx + jx, own = owner[w];
        if (own >= 0 && own !== s && own !== t) continue;
        const len = Math.abs(xs[jx] - xs[ix]) + Math.abs(ys[jy] - ys[iy]);
        const used = nd === 0 ? usedH[v] : nd === 2 ? usedH[w] : nd === 1 ? usedV[v] : usedV[w];
        let pen = inBox[w] >= 0 && inBox[w] !== Math.max(0, g.group[s]) && inBox[w] !== Math.max(0, g.group[t]) ? len * 1.5 : 0;   // a box the edge has no business in
        let taken = false;
        if (used) for (const f of used) if (g.edges[f][0] !== s && g.edges[f][1] !== t && !(strict < 2 && ((g.edges[f][1] === s && by(s, ix, iy, jx, jy)) || (g.edges[f][0] === t && by(t, ix, iy, jx, jy))))) { taken = true; pen += len * 2 + 25; }
        if (taken && strict) continue;
        const c = base + len + (d >= 0 && nd !== d ? 28 : 0) + pen, st = w * 4 + nd;
        if (c < cost[st]) { cost[st] = c; from[st] = parent; push(c + h(jx, jy), st); }
      }
    };
    for (const level of [2, 1, 0]) {   // apart from every other edge; then sharing the piece next to a node with an edge that comes the other way; then sharing where it must
      strict = level; cost.fill(Infinity); heap.length = 0;
      relax(start, -1, 0, -1);
      while (heap.length) {
        const [f, st] = pop(), v = (st / 4) | 0, d = st % 4;
        if (f - h(v % nx, (v / nx) | 0) > cost[st] + 1e-9) continue;
        if (v === goal) { found = st; break; }
        relax(v, d, cost[st], st);
      }
      if (found >= 0) break;
    }
    let pts = [];
    if (found < 0) pts = [[pos[s][0], pos[s][1]], [pos[t][0], pos[t][1]]];
    else {
      for (let st = found; st >= 0; st = from[st]) {
        const v = (st / 4) | 0, d = st % 4, pv = v - DX[d] - DY[d] * nx;
        (d === 0 ? usedH[pv] || (usedH[pv] = []) : d === 2 ? usedH[v] || (usedH[v] = []) : d === 1 ? usedV[pv] || (usedV[pv] = []) : usedV[v] || (usedV[v] = [])).push(e);
        pts.push([xs[v % nx], ys[(v / nx) | 0]]);
      }
      pts.push([xs[sx], ys[sy]]); pts.reverse();
    }
    pts = pts.filter((p, i) => i === 0 || i === pts.length - 1 || !((pts[i - 1][0] === p[0] && pts[i + 1][0] === p[0]) || (pts[i - 1][1] === p[1] && pts[i + 1][1] === p[1])));
    out[e] = clip(clip(pts, pos[s], hw, hh).reverse(), pos[t], hw, hh).reverse();
  }
  return out;
}

// Cut the start of a path back to where it leaves the node centred at c.
function clip(pts, c, hw, hh) {
  const inside = (p) => Math.abs(p[0] - c[0]) <= hw + 1e-6 && Math.abs(p[1] - c[1]) <= hh + 1e-6;
  const p = pts.slice();
  while (p.length > 2 && inside(p[1])) p.shift();
  if (p.length < 2 || !inside(p[0])) return p;
  const a = p[0], b = p[1], dx = b[0] - a[0], dy = b[1] - a[1];
  let f = 1;
  if (Math.abs(dx) > 1e-9) f = Math.min(f, ((dx > 0 ? c[0] + hw : c[0] - hw) - a[0]) / dx);
  if (Math.abs(dy) > 1e-9) f = Math.min(f, ((dy > 0 ? c[1] + hh : c[1] - hh) - a[1]) / dy);
  f = Math.max(0, f);
  p[0] = [a[0] + dx * f, a[1] + dy * f];
  return p;
}
