// Gears on a cube and an octahedron: building the parts as triangle meshes, for the assembled toy (scene.js) and
// for the workshop (shop.js). Every size comes from model.js. A mesh is plain arrays: positions, normals, and three
// numbers per corner for the shader (the first says which material).
import { R_IN, R_OUT, endAt } from './model.js?v=8d116acc';

export function grow() {
  const P = [], N = [], T = [], I = [];
  return { P, N, T, I, v(p, n, t) { P.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]); T.push(t[0], t[1], t[2]); return P.length / 3 - 1; },
    tri(a, b, c) { I.push(a, b, c); }, quad(a, b, c, d) { I.push(a, b, c, a, c, d); } };
}
export const dir = (th, ps) => [Math.sin(th) * Math.cos(ps), Math.sin(th) * Math.sin(ps), Math.cos(th)];
export const sc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const SEG = 72;

// a solid of revolution about z from a list of [radius, height] points; each segment is its own band, so edges
// stay sharp. t2: the shader's second number (lathe rings go by radius; a thread's by height).
export function lathe(g, pts, kind, seg = SEG, a0 = 0, a1 = 2 * Math.PI) {
  for (let k = 0; k + 1 < pts.length; k++) {
    const [r0, z0] = pts[k], [r1, z1] = pts[k + 1], dr = r1 - r0, dz = z1 - z0, l = Math.hypot(dr, dz) || 1, nr = dz / l, nz = -dr / l;
    if (l < 1e-9) continue;
    const a = [], b = [];
    for (let s = 0; s <= seg; s++) {
      const t = a0 + s / seg * (a1 - a0), c = Math.cos(t), si = Math.sin(t), n = [nr * c, nr * si, nz];
      a.push(g.v([r0 * c, r0 * si, z0], n, [kind, kind === 5 ? z0 : r0, 0])); b.push(g.v([r1 * c, r1 * si, z1], n, [kind, kind === 5 ? z1 : r1, 0]));
    }
    for (let s = 0; s < seg; s++) g.I.push(a[s], b[s], b[s + 1], a[s], b[s + 1], a[s + 1]);
  }
}
export function sphere(g, c, r, kind) {
  const st = 10, sl = 16, first = g.P.length / 3;
  for (let i = 0; i <= st; i++) for (let j = 0; j <= sl; j++) {
    const th = i / st * Math.PI, ph = j / sl * 2 * Math.PI, n = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
    g.v([c[0] + r * n[0], c[1] + r * n[1], c[2] + r * n[2]], n, [kind, 0, 0]);
  }
  for (let i = 0; i < st; i++) for (let j = 0; j < sl; j++) { const a = first + i * (sl + 1) + j, b = a + sl + 1; g.I.push(a, b, b + 1, a, b + 1, a + 1); }
}
// a flat polygon (corners counterclockwise seen from where n points)
export function poly(g, pts, n, t) {
  const ids = pts.map((p) => g.v(p, n, t));
  for (let k = 1; k + 1 < ids.length; k++) g.I.push(ids[0], ids[k], ids[k + 1]);
}
// a box between two corners, with the material t
export function box(g, lo, hi, t) {
  const [x0, y0, z0] = lo, [x1, y1, z1] = hi;
  poly(g, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0], t);
  poly(g, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], t);
  poly(g, [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0], t);
  poly(g, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], t);
  poly(g, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], t);
  poly(g, [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], [0, 0, -1], t);
}

// One gear in its own frame (axis along z), tooth 0 centered on the x axis: a disc with a bore for the bearing,
// and its teeth on a cone round the rim, every tooth surface aimed at the solid's center. The teeth's outer ends
// lie on the back cone and their inner ends on the front cone. cut (for the workshop): for each gap between teeth,
// how much of its length has been cut, from the outer end (0: not yet, 1: all); left out, every gap is cut.
export function gearMesh(pr, P, cut = null, kind = 0) {
  const half = pr.half, rows = pr.th.length, N = pr.N, a = pr.alpha;
  const pts = [];          // round the rim: polar angle, azimuth, a crease?, and which gap the point belongs to (-1: a tooth top)
  for (let k = 0; k < N; k++) {
    const c = k * 2 * half, rootW = pr.hw[0], L = k, R = (k + 1) % N;
    pts.push({ th: pr.root, ps: c - half, sharp: false, gap: L });
    for (let s = 1; s <= 3; s++) pts.push({ th: pr.root, ps: c - half + (half - rootW) * s / 3 * 0.999, sharp: s === 3, gap: L });
    for (let r = 1; r < rows; r++) pts.push({ th: pr.th[r], ps: c - pr.hw[r], sharp: r === rows - 1, gap: L });
    for (let s = 1; s < 4; s++) pts.push({ th: pr.tip, ps: c - pr.hw[rows - 1] + 2 * pr.hw[rows - 1] * s / 4, sharp: false, gap: -1 });
    for (let r = rows - 1; r >= 1; r--) pts.push({ th: pr.th[r], ps: c + pr.hw[r], sharp: r === rows - 1, gap: R });
    for (let s = 3; s >= 1; s--) pts.push({ th: pr.root, ps: c + half - (half - rootW) * s / 3 * 0.999, sharp: s === 3, gap: R });
  }
  const n = pts.length, g = grow(), K = [kind, 0, 0];
  // the polar angle of a point at cone distance s: an uncut stretch of a gap is still at the blank's top
  const partial = cut && cut.some((f) => f > 0 && f < 1);
  const bands = partial ? 28 : 1;
  const thAt = (j, s) => { const p = pts[j]; if (!cut || p.gap < 0) return p.th; const f = cut[p.gap]; return f > 0 && s >= R_OUT - f * (R_OUT - R_IN) - 1e-9 ? p.th : pr.tip; };
  const at = (j, s) => { const th = thAt(j, s); return sc(dir(th, pts[j].ps), endAt(pr, th, s)); };
  const S = []; for (let b = 0; b <= bands; b++) S.push(R_IN + (R_OUT - R_IN) * b / bands);
  // smooth normals across a tooth's flank, sharp at the tooth's top corners and the root fillet's ends
  const normalsAt = (s) => {
    const seg = [];
    for (let j = 0; j < n; j++) { const A = dir(thAt(j, s), pts[j].ps), B = dir(thAt((j + 1) % n, s), pts[(j + 1) % n].ps); seg.push(unit(sc(crs(sc([A[0] + B[0], A[1] + B[1], A[2] + B[2]], 0.5), sub(B, A)), -1))); }
    return seg;
  };
  for (let b = 0; b < bands; b++) {
    const s0 = S[b], s1 = S[b + 1], seg0 = normalsAt(s0), seg1 = normalsAt(s1);
    for (let j = 0; j < n; j++) {
      const j1 = (j + 1) % n, p0 = at(j, s0), p1 = at(j, s1), p2 = at(j1, s1), p3 = at(j1, s0);
      const same = thAt(j, s0) === thAt(j, s1) && thAt(j1, s0) === thAt(j1, s1);
      let na, nb, nc, nd;
      if (same) {
        const sm = (seg, q) => { if (pts[q].sharp) return null; const A = seg[(q - 1 + n) % n], B = seg[q]; return unit([A[0] + B[0], A[1] + B[1], A[2] + B[2]]); };
        na = sm(seg0, j) || seg0[j]; nb = sm(seg1, j) || seg1[j]; nc = sm(seg1, j1) || seg1[j]; nd = sm(seg0, j1) || seg0[j];
      } else { const f = unit(crs(sub(p1, p0), sub(p3, p0))); const fo = (f[0] * p0[0] + f[1] * p0[1] + f[2] * p0[2]) < 0 ? sc(f, -1) : f; na = nb = nc = nd = fo; }
      const i0 = g.v(p0, na, K), i1 = g.v(p1, nb, K), i2 = g.v(p2, nc, K), i3 = g.v(p3, nd, K);
      g.I.push(i0, i1, i2, i0, i2, i3);
    }
  }
  // the two ends: the teeth's ends on the back and front cones, then the flat disc in to the bore
  const bore = P.bearing.outer;
  for (const [s, z, sg] of [[R_OUT, P.front, 1], [R_IN, P.back, -1]]) {
    for (let j = 0; j < n; j++) {
      const j1 = (j + 1) % n, A = [at(j, s), at(j1, s)], B = [j, j1].map((q) => sc(dir(pr.root, pts[q].ps), endAt(pr, pr.root, s)));
      const C = [j, j1].map((q) => [bore * Math.cos(pts[q].ps), bore * Math.sin(pts[q].ps), z]);
      const cn = (q) => sc([Math.sin(a) * Math.cos(pts[q].ps), Math.sin(a) * Math.sin(pts[q].ps), Math.cos(a)], sg);
      const a0 = g.v(A[0], cn(j), K), a1 = g.v(A[1], cn(j1), K), b0 = g.v(B[0], cn(j), K), b1 = g.v(B[1], cn(j1), K);
      g.I.push(b0, a0, a1, b0, a1, b1);
      const [f0, f1, c0, c1] = [B[0], B[1], C[0], C[1]].map((p) => g.v(p, [0, 0, sg], K));
      g.I.push(c0, f0, f1, c0, f1, c1);
    }
  }
  lathe(g, [[bore, P.back], [bore, P.front]], kind, 96);
  return g;
}

// a screw's head: a flange with a slot across it, from z0 to z1, radius R, in the screw's frame
function slottedFlange(g, R, z0, z1, w, depth, kind) {
  const zs = z1 - depth, hw = w / 2, a = Math.asin(Math.min(1, hw / R));
  lathe(g, [[R, z0], [R, zs]], kind);
  // the top, either side of the slot, and the cylinder above the slot's floor
  for (const side of [1, -1]) {
    const from = side > 0 ? a : Math.PI + a, to = side > 0 ? Math.PI - a : 2 * Math.PI - a, seg = 40, ids = [];
    lathe(g, [[R, zs], [R, z1]], kind, seg, from, to);
    const c = g.v([0, side * hw, z1], [0, 0, 1], [kind, 0, 0]);
    for (let s = 0; s <= seg; s++) { const t = from + (to - from) * s / seg; ids.push(g.v([R * Math.cos(t), R * Math.sin(t), z1], [0, 0, 1], [kind, R, 0])); }
    for (let s = 0; s < seg; s++) g.I.push(c, ids[s], ids[s + 1]);
    // the slot's wall on this side
    const x = Math.sqrt(R * R - hw * hw);
    poly(g, side > 0 ? [[-x, hw, zs], [x, hw, zs], [x, hw, z1], [-x, hw, z1]] : [[x, -hw, zs], [-x, -hw, zs], [-x, -hw, z1], [x, -hw, z1]], [0, -side, 0], [kind, 0, 0]);
  }
  const x = Math.sqrt(R * R - hw * hw);
  poly(g, [[-x, -hw, zs], [x, -hw, zs], [x, hw, zs], [-x, hw, zs]], [0, 0, 1], [kind, 0, 0]);
}

// the small parts, in a gear's frame, at their assembled places: the bearing's rings and a ball, the spacer, the screw
export function smallParts(P) {
  const B = P.bearing, mid = B.mid, w = B.width / 2, ch = 0.15 * (B.outer - B.outerID);
  const outer = grow(); lathe(outer, [[B.outerID, mid - w], [B.outer - ch, mid - w], [B.outer, mid - w + ch], [B.outer, mid + w - ch], [B.outer - ch, mid + w], [B.outerID, mid + w], [B.outerID, mid - w]], 3);
  const inner = grow(); lathe(inner, [[B.inner, mid - w], [B.innerOD, mid - w], [B.innerOD, mid + w], [B.inner, mid + w], [B.inner, mid - w]], 3);
  const ball = grow(); sphere(ball, [0, 0, 0], B.ball, 3);
  const W = P.washer, washer = grow(); lathe(washer, [[W.inner, P.core], [W.inner, W.top], [W.outer, W.top], [W.outer, P.core], [W.inner, P.core]], 4);
  const S = P.screw, z0 = P.front + S.bossH, z1 = z0 + S.thick, tEnd = P.core - S.into, c = S.thread * 0.25;
  const screw = grow();
  lathe(screw, [[S.boss, P.front], [S.boss, z0], [S.flange, z0]], 1);
  slottedFlange(screw, S.flange, z0, z1, S.slot, S.slotD, 1);
  lathe(screw, [[S.post, S.shoulderEnd], [S.post, P.front], [S.boss, P.front]], 1);
  lathe(screw, [[S.thread, S.shoulderEnd], [S.post, S.shoulderEnd]], 1);
  lathe(screw, [[S.thread, tEnd + c], [S.thread, S.shoulderEnd]], 5);
  lathe(screw, [[0, tEnd], [S.thread - c, tEnd], [S.thread, tEnd + c]], 1);
  return { outer, inner, ball, washer, screw, mid };
}
