// Shared by both layouts: the picture of the input, a seeded random number, and the measurements
// read out in the panel. Lengths are in the page's own units; a node is `nodeW` by `nodeH` of them.

export function rng(seed) {   // mulberry32
  let a = (seed | 0) + 0x6D2B79F5;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// The input: every node on a grid, in the order the file lists them.
export function inputGrid(n, o) {
  const cw = o.nodeW + 26, ch = o.nodeH + 30;
  const cols = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * o.aspect * ch / cw))));
  const rows = Math.ceil(n / cols), pos = [];
  for (let i = 0; i < n; i++) pos.push([((i % cols) - (cols - 1) / 2) * cw, (Math.floor(i / cols) - (rows - 1) / 2) * ch]);
  return pos;
}

// k points evenly along the straight line from a to b (k >= 2)
export function along(a, b, k) {
  const out = [];
  for (let i = 0; i < k; i++) { const f = i / (k - 1); out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); }
  return out;
}

export function bounds(pos, o, extra) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pos) { x0 = Math.min(x0, p[0] - o.nodeW / 2); x1 = Math.max(x1, p[0] + o.nodeW / 2); y0 = Math.min(y0, p[1] - o.nodeH / 2); y1 = Math.max(y1, p[1] + o.nodeH / 2); }
  for (const b of extra || []) { x0 = Math.min(x0, b.x); x1 = Math.max(x1, b.x + b.w); y0 = Math.min(y0, b.y); y1 = Math.max(y1, b.y + b.h); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// An edge as straight pieces: curves are cut into short chords.
export function flatten(e) {
  if (e.kind !== 'curve') return e.pts;
  const out = [e.pts[0]], p = e.pts;
  for (let i = 0; i + 3 < p.length; i += 3) {
    for (let k = 1; k <= 8; k++) {
      const t = k / 8, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      out.push([a * p[i][0] + b * p[i + 1][0] + c * p[i + 2][0] + d * p[i + 3][0], a * p[i][1] + b * p[i + 1][1] + c * p[i + 2][1] + d * p[i + 3][1]]);
    }
  }
  return out;
}

// ---- crossings ----
// Two edges cross where one passes from one side of the other to the other side. That can be at a
// point inside both lines, at a bend of one or both, at the end of a chord of a curve, or along a
// run that the two share and leave on opposite sides: each of these is one crossing. Two edges
// that only touch, or share a run and leave it on the same side, do not cross, and neither do two
// that meet at an end.
const TOL = 1e-6;
function tidy(l) {   // the line without repeated points, with the distance along it to each point
  const pts = [l[0]], at = [0];
  for (let i = 1; i < l.length; i++) {
    const p = pts[pts.length - 1], d = Math.hypot(l[i][0] - p[0], l[i][1] - p[1]);
    if (d > TOL) { pts.push(l[i]); at.push(at[at.length - 1] + d); }
  }
  return { pts, at, len: at[at.length - 1] };
}
// the direction a line runs just before (back) or just after (forth) the place a distance s along it
function heading(L, s, forth) {
  const { pts, at } = L, n = pts.length;
  let i = 0;
  if (forth) { while (i < n - 2 && at[i + 1] <= s + 10 * TOL) i++; } else { while (i < n - 2 && at[i + 1] < s - 10 * TOL) i++; }
  const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], d = Math.hypot(dx, dy) || 1;
  return forth ? [dx / d, dy / d] : [-dx / d, -dy / d];
}
const turn = (u, v) => { const a = Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]); return a < 0 ? a + 2 * Math.PI : a; };
// On which side of a line a ray leaves it: the line comes in along `back` and goes on along `forth`.
const side = (ray, back, forth) => turn(forth, ray) < turn(forth, back);
export function crossingsOf(lineA, lineB) {
  const A = lineA.pts ? lineA : tidy(lineA), B = lineB.pts ? lineB : tidy(lineB);
  if (A.pts.length < 2 || B.pts.length < 2) return 0;
  // every place the two lines meet: [from, to] along A and [from, to] along B
  const met = [];
  for (let i = 0; i + 1 < A.pts.length; i++) {
    const a = A.pts[i], b = A.pts[i + 1], ux = b[0] - a[0], uy = b[1] - a[1], la = A.at[i + 1] - A.at[i];
    const ax0 = Math.min(a[0], b[0]) - TOL, ax1 = Math.max(a[0], b[0]) + TOL, ay0 = Math.min(a[1], b[1]) - TOL, ay1 = Math.max(a[1], b[1]) + TOL;
    for (let j = 0; j + 1 < B.pts.length; j++) {
      const c = B.pts[j], d = B.pts[j + 1];
      if (Math.max(c[0], d[0]) < ax0 || Math.min(c[0], d[0]) > ax1 || Math.max(c[1], d[1]) < ay0 || Math.min(c[1], d[1]) > ay1) continue;
      const vx = d[0] - c[0], vy = d[1] - c[1], lb = B.at[j + 1] - B.at[j], den = ux * vy - uy * vx;
      const wx = c[0] - a[0], wy = c[1] - a[1];
      if (Math.abs(den) > 1e-9 * la * lb) {
        const t = (wx * vy - wy * vx) / den, u = (wx * uy - wy * ux) / den;
        if (t < -TOL / la || t > 1 + TOL / la || u < -TOL / lb || u > 1 + TOL / lb) continue;
        const sa = A.at[i] + Math.min(1, Math.max(0, t)) * la, sb = B.at[j] + Math.min(1, Math.max(0, u)) * lb;
        met.push([sa, sa, sb, sb]);
      } else {   // parallel: they meet only if one lies along the other
        if (Math.abs(wx * uy - wy * ux) / la > TOL) continue;
        const tc = (wx * ux + wy * uy) / la, td = ((d[0] - a[0]) * ux + (d[1] - a[1]) * uy) / la;   // where c and d fall along ab
        const lo = Math.max(0, Math.min(tc, td)), hi = Math.min(la, Math.max(tc, td));
        if (hi < lo - TOL) continue;
        const onB = (s) => B.at[j] + Math.min(1, Math.max(0, (s - tc) / (td - tc))) * lb, b0 = onB(lo), b1 = onB(hi);
        met.push([A.at[i] + lo, A.at[i] + Math.max(lo, hi), Math.min(b0, b1), Math.max(b0, b1)]);
      }
    }
  }
  // meetings that touch along both lines are one meeting (a shared run, with any bends in it)
  const near = 20 * TOL, group = met.map((_, k) => k), find = (k) => { while (group[k] !== k) k = group[k] = group[group[k]]; return k; };
  for (let p = 0; p < met.length; p++) for (let q = p + 1; q < met.length; q++) {
    const m = met[p], w = met[q];
    if (m[0] <= w[1] + near && w[0] <= m[1] + near && m[2] <= w[3] + near && w[2] <= m[3] + near) group[find(p)] = find(q);
  }
  const whole = new Map();
  met.forEach((m, k) => { const r = find(k), w = whole.get(r); if (!w) whole.set(r, m.slice()); else { w[0] = Math.min(w[0], m[0]); w[1] = Math.max(w[1], m[1]); w[2] = Math.min(w[2], m[2]); w[3] = Math.max(w[3], m[3]); } });
  let n = 0;
  for (const [a0, a1, b0, b1] of whole.values()) {
    if (a0 < near || b0 < near || a1 > A.len - near || b1 > B.len - near) continue;   // an end of a line is in it: they meet, they do not cross
    // B comes to the meeting at one end of it and leaves at the other: on the same side of A, or on opposite sides?
    const same = a1 - a0 < near || (() => { const p = pointAt(B, b0), q0 = pointAt(A, a0), q1 = pointAt(A, a1); return Math.hypot(p[0] - q0[0], p[1] - q0[1]) <= Math.hypot(p[0] - q1[0], p[1] - q1[1]); })();
    const at0 = (ray) => side(ray, heading(A, a0, false), heading(A, a0, true)), at1 = (ray) => side(ray, heading(A, a1, false), heading(A, a1, true));
    const comes = heading(B, b0, false), goes = heading(B, b1, true);
    if ((same ? at0(comes) : at1(comes)) !== (same ? at1(goes) : at0(goes))) n++;
  }
  return n;
}
function pointAt(L, s) {
  const { pts, at } = L;
  let i = 0;
  while (i < pts.length - 2 && at[i + 1] < s) i++;
  const f = (s - at[i]) / (at[i + 1] - at[i]);
  return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
}

// How much of the straight piece from p to q lies inside the node centered at c.
function inNode(p, q, c, hw, hh) {
  const dx = q[0] - p[0], dy = q[1] - p[1];
  let t0 = 0, t1 = 1;
  for (const [d, lo, hi] of [[dx, c[0] - hw - p[0], c[0] + hw - p[0]], [dy, c[1] - hh - p[1], c[1] + hh - p[1]]]) {
    if (Math.abs(d) < 1e-12) { if (lo > 0 || hi < 0) return 0; continue; }
    const a = lo / d, b = hi / d;
    t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
  }
  return t1 > t0 ? (t1 - t0) * Math.hypot(dx, dy) : 0;
}
// The nodes that a line passes over without joining them (s and t are the two it joins).
export function passed(pts, pos, o, s, t) {
  const hw = o.nodeW / 2 - 1, hh = o.nodeH / 2 - 1, out = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  for (let v = 0; v < pos.length; v++) {
    if (v === s || v === t) continue;
    const c = pos[v];
    if (c[0] + hw < x0 || c[0] - hw > x1 || c[1] + hh < y0 || c[1] - hh > y1) continue;
    for (let i = 1; i < pts.length; i++) if (inNode(pts[i - 1], pts[i], c, hw, hh) > 1e-9) { out.push(v); break; }
  }
  return out;
}

// What the panel reports about a drawing: how many times two edges cross, and the summed length
// of the edges, both measured from the lines as drawn. Before the edges are routed each is a
// straight line between the centers of its two nodes; `ends` ({ pos, pairs, o }) then leaves out
// the two stretches inside those nodes, so that a length is border to border at every step.
export function measure(edges, ends) {
  const lines = edges.map((e) => tidy(flatten(e)));
  let length = 0, crossings = 0;
  const box = lines.map((L) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of L.pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } return [x0 - TOL, y0 - TOL, x1 + TOL, y1 + TOL]; });
  lines.forEach((L, k) => {
    length += L.len;
    if (!ends || edges[k].kind !== 'line' || L.pts.length < 2) return;
    const [s, t] = ends.pairs[k], hw = ends.o.nodeW / 2, hh = ends.o.nodeH / 2, n = L.pts.length;
    let hid = 0;   // the line may come in several pieces, and more than one can be inside a node
    for (let i = 1; i < n; i++) hid += inNode(L.pts[i - 1], L.pts[i], ends.pos[s], hw, hh) + inNode(L.pts[i - 1], L.pts[i], ends.pos[t], hw, hh);
    length -= Math.min(L.len, hid);
  });
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const A = box[i], B = box[j];
    if (A[2] < B[0] || B[2] < A[0] || A[3] < B[1] || B[3] < A[1]) continue;
    crossings += crossingsOf(lines[i], lines[j]);
  }
  return { crossings, length };
}

// Straight-line crossings between node centres, for the search's score.
export function straightCrossings(edges, x, y) {
  let c = 0;
  for (let i = 0; i < edges.length; i++) {
    const [a, b] = edges[i], ax = x[a], ay = y[a], bx = x[b], by = y[b];
    for (let j = i + 1; j < edges.length; j++) {
      const [p, q] = edges[j];
      if (p === a || p === b || q === a || q === b) continue;
      const d1 = (bx - ax) * (y[p] - ay) - (by - ay) * (x[p] - ax), d2 = (bx - ax) * (y[q] - ay) - (by - ay) * (x[q] - ax);
      if (d1 * d2 >= 0) continue;
      const d3 = (x[q] - x[p]) * (ay - y[p]) - (y[q] - y[p]) * (ax - x[p]), d4 = (x[q] - x[p]) * (by - y[p]) - (y[q] - y[p]) * (bx - x[p]);
      if (d3 * d4 < 0) c++;
    }
  }
  return c;
}

// ---- edge labels ----
// A label is { x, y, w, h, text }, with (x, y) its centre.

// The point a fraction f of the way along a line of straight pieces, and which piece it is on.
export function pointAlong(pts, f) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let left = total * f;
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (left <= len || i === pts.length - 1) { const t = len ? left / len : 0; return { p: [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t], i: i - 1 }; }
    left -= len;
  }
  return { p: pts[0].slice(), i: 0 };
}

// What this page's own layouts do: each label at the middle of its edge, and nothing more.
export function midLabels(edges, sizes) {
  return edges.map((e, k) => { const { p } = pointAlong(flatten(e), 0.5); return { x: p[0], y: p[1], w: sizes[k].w, h: sizes[k].h, text: sizes[k].text, e: k }; });
}

// How many labels lie over a node or over another label.
export function labelsCovered(labels, pos, o) {
  const hit = new Uint8Array(labels.length), over = (a, bx, by, bw, bh) => Math.abs(a.x - bx) < (a.w + bw) / 2 - 0.5 && Math.abs(a.y - by) < (a.h + bh) / 2 - 0.5;
  labels.forEach((a, i) => {
    for (const p of pos) if (over(a, p[0], p[1], o.nodeW, o.nodeH)) { hit[i] = 1; break; }
    for (let j = i + 1; j < labels.length; j++) if (over(a, labels[j].x, labels[j].y, labels[j].w, labels[j].h)) { hit[i] = 1; hit[j] = 1; }
  });
  return hit.reduce((n, v) => n + v, 0);
}
