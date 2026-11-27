// Gears on a cube and an octahedron: what the part looks like at any moment of its machining, and where the tool is.
// A part's plan (plan.js) is laid out on a timeline in real seconds; state(t) replays every pass up to t.
//
// A lathe part is kept as two radii along its axis, sampled every 0.01 mm: the outside (ro) and the inside (ri).
// Where ro <= ri there is no metal. A mill part is a list of planes (it stays convex), with holes, gear gaps and a
// slot on top.
import { dot, cross, norm } from './model.js?v=cbfbfc46';
import { bodyFaces } from './model.js?v=cbfbfc46';

export const DZ = 0.01;
const LEAD = 0.5;                       // how far short of the metal a drill starts its feed, in mm
const RAPID = 0.8, CHANGE = 2.5;        // seconds to bring a tool in or pull it clear, and to change tools between steps
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, f) => a + (b - a) * f;

// ---- the timeline ----
// Every pass gets a start and an end in real seconds; a step starts with a tool change. Before the times are laid
// out the plan is played once (start: what the mill begins with, from plan.js), so that each pass knows the cut it
// really makes: a mill pass's travel is the travel the replay draws, a pass that would meet no metal is dropped,
// and each pass knows over which part of its travel the edge is in metal (eng: [from, to], as fractions; chips
// leave only then).
export function timeline(plan, start) {
  if (start) dryRun(plan, start);
  const out = [];
  let t = 0;
  plan.forEach((op, oi) => op.steps.forEach((st, si) => {
    const s0 = t; t += CHANGE;
    st.passes.forEach((p, pi) => {
      const len = passLength(p, op);
      const dur = Math.max(0.4, len / (p.feed || 1));
      const gap = pi ? between(st.passes[pi - 1], p, op) : RAPID;
      out.push({ op: oi, step: si, pass: pi, t0: t + gap, t1: t + gap + dur, p });
      t += gap + dur;
    });
    t += RAPID;
    st.t0 = s0; st.t1 = t;
  }));
  return { segs: out, T: t };
}
// how much metal a lathe state holds (in mm², a section's worth: enough to tell whether a pass removed any)
function metal(S) {
  let v = 0;
  for (let i = 0; i < S.n; i++) { if (S.ro[i] > S.ri[i]) v += S.ro[i] * S.ro[i] - S.ri[i] * S.ri[i]; if (S.ring && S.ring[i]) v += S.ring[i][1] * S.ring[i][1] - S.ring[i][0] * S.ring[i][0]; }
  return v;
}
function dryRun(plan, start) {
  let S = null, M = null;
  plan.forEach((op, oi) => {
    if (op.machine === 'lathe') S = latheStart(op, S && oi > 0 ? S : null);
    else if (!M) M = start.mill(S);
    for (const st of op.steps) {
      const keep = [];
      for (const p of st.passes) {
        if (op.machine === 'lathe') {
          // where along the pass the metal starts and stops coming off, to a twentieth of the pass
          if (p.k === 'thread') { lathePass(S, op, p, 1); p.eng = p.out ? null : [0, 1]; p.chip = 0.3; keep.push(p); continue; }
          const N = 20, ro0 = S.ro.slice(), ri0 = S.ri.slice(); let v = metal(S), a = -1, b = -1;
          for (let k = 1; k <= N; k++) { lathePass(S, op, p, k / N); const w = metal(S); if (w < v - 1e-7) { if (a < 0) a = k - 1; b = k; } v = w; }
          S.ring = null;
          if (a < 0) continue;                                     // the tool would pass through air: not a cut
          p.eng = [a / N, b / N];
          // the chip is as wide as the cut is deep: the smaller of how far in the tool went and how far along
          let deep = 0, cells = 0;
          for (let i = 0; i < S.n; i++) { const d = Math.max(ro0[i] - Math.max(S.ro[i], ri0[i]), Math.min(S.ri[i], ro0[i]) - ri0[i]); if (d > 1e-6) { deep = Math.max(deep, d); cells++; } }
          p.chip = Math.min(deep, cells * DZ);
          keep.push(p);
        } else {
          if (p.k === 'plane') {
            const R = planeR(p, start), arc = p.tool === 'fly' || p.tool === 'end';
            const geo = planeGeometry(M.planes, p, R, arc);
            if (!geo || geo.area < 1e-6) continue;                 // the cutter would pass over the part: not a cut
            p.geo = geo; p.len = geo.s1 - geo.s0;
            // the edge meets the face 0.5 mm after the start and leaves it 0.5 mm before the end (see planeGeometry)
            p.eng = [0.5 / p.len, 1 - (arc ? 0.5 : R + 0.5) / p.len];
            const top = Math.max(...bodyFaces(M.planes).flatMap((f) => f.poly.map((q) => dot(q, p.n))));
            p.chip = Math.min(top - p.d, 1);
          } else if (p.k === 'hole') {
            const h = M.holes.find((q) => dot(q.n, p.n) > 0.999), done = h ? (p.spot ? h.spot : h.depth) : 0, from = (p.from || 0) - LEAD;
            if (!(p.depth > done)) continue;                       // nothing left to drill here
            p.eng = [Math.max(0, (done - from) / (p.depth - from)), 1]; p.chip = p.spot ? 0.4 : p.d / 2;
          } else if (p.k === 'tap') { p.eng = p.out ? null : [0, 1]; p.chip = 0.3; }
          else if (p.k === 'gap') { p.eng = [0.5 / p.len, 1 - 0.2 / p.len]; p.chip = p.side ? 0.3 : Math.min(1, p.from - p.h); }
          else if (p.k === 'slot') { p.eng = p.eng || [0, 1]; p.chip = p.w || 0.4; }
          millPass(M, op, p, 1, start);
          keep.push(p);
        }
      }
      st.passes = keep;
    }
    if (op.machine === 'lathe' && op.steps.some((st) => st.passes.some((p) => p.k === 'part'))) S = keepFree(S, op);
  });
}
// the time from the end of one pass to the start of the next, by hand on a small machine: pull the tool clear, wind
// back to the start, turn the part if it must be turned (the dividing head's crank, the indexer), and feed in again.
// A tap or a die goes straight from cutting to backing out.
function between(a, b, op) {
  const same = (u, v) => u && v && dot(u, v) > 0.999;
  if (b.out) return 0;
  if (a.tool !== b.tool) return CHANGE + 1;
  if (op.machine === 'lathe') return 2;
  if (b.k === 'gap') return a.gap === b.gap ? 5 : 10;
  if (b.k === 'plane') return same(a.n, b.n) ? 4 : 6;
  if (b.k === 'hole' || b.k === 'tap') return same(a.n, b.n) ? 1.5 : 5;
  return 2;
}
function passLength(p, op) {
  if (p.k === 'face' || p.k === 'faceIn' || p.k === 'part') return Math.abs(p.r1 - p.r0);
  if (p.k === 'turn' || p.k === 'bore') { let l = 0; for (let i = 1; i < p.pts.length; i++) l += Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1]); return l; }
  if (p.k === 'drill') return Math.abs(p.z1 - p.z0);
  if (p.k === 'thread') return Math.abs(p.z1 - p.z0);
  if (p.k === 'hole') return p.depth - (p.from || 0) + LEAD;
  if (p.k === 'tap') return p.depth + (p.out ? 1 : 0);
  if (p.k === 'plane') return p.len;          // from the dry run: the travel the replay draws
  if (p.k === 'gap') return p.len;            // from the plan: from clear of the blank to past the small end
  if (p.k === 'slot' && p.len) return p.len;
  if (p.k === 'slot') return Math.abs(p.to - p.from);
  return 1;
}
const planeR = (p, start) => p.r || (p.tool === 'chamfer' ? 2 : (start.toolR || 6));

// ---- lathe ----
// the grid covers from a little inside the chuck to the free end
export function latheStart(op, prev) {
  if (prev) return { ...prev, ro: prev.ro.slice(), ri: prev.ri.slice(), thread: prev.thread && prev.thread.slice() };
  const a = op.zJaw - op.dir * 12, b = op.stock.free;
  const z0 = Math.min(a, b), n = Math.round(Math.abs(b - a) / DZ) + 1;
  const ro = new Float32Array(n).fill(op.stock.r), ri = new Float32Array(n);
  return { z0, n, ro, ri, thread: null, stockR: op.stock.r, sawn: op.stock.free };
}
const idx = (S, z) => (z - S.z0) / DZ;
// the radius of a path at z, over the part of it covered so far (progress f along its length), or null
function pathAt(pts, f) {
  let L = 0; const seg = [];
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); L += l; }
  let left = f * L; const cov = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (left >= seg[i - 1]) { cov.push(pts[i]); left -= seg[i - 1]; continue; }
    const u = seg[i - 1] ? left / seg[i - 1] : 0; cov.push([lerp(pts[i - 1][0], pts[i][0], u), lerp(pts[i - 1][1], pts[i][1], u)]); break;
  }
  return cov;
}
function rOnPath(cov, z) {
  let best = null;
  for (let i = 1; i < cov.length; i++) {
    const [za, ra] = cov[i - 1], [zb, rb] = cov[i];
    if ((z - za) * (z - zb) > 1e-12) continue;
    const r = Math.abs(zb - za) < 1e-9 ? Math.min(ra, rb) : lerp(ra, rb, (z - za) / (zb - za));
    best = best === null ? r : Math.min(best, r);
  }
  return best;
}
// apply pass p to the lathe state S, as far as progress f (0 to 1); returns where the tool's tip is: [z, r]
export function lathePass(S, op, p, f) {
  const beyond = (z, z0) => (op.dir > 0 ? z >= z0 - 1e-9 : z <= z0 + 1e-9);
  if (p.k === 'faceIn' && p.r0 > p.r1) {
    // fed in toward the center: the ring between the bore and the tool is still there until the tool reaches it
    const r = lerp(p.r0, p.r1, f), ring = new Array(S.n).fill(null);
    let any = false;
    for (let i = 0; i < S.n; i++) {
      const z = S.z0 + i * DZ; if (!beyond(z, p.z) || S.ri[i] >= p.r0) continue;
      if (r - S.ri[i] > 0.15) { ring[i] = [S.ri[i], r]; any = true; }
      S.ri[i] = p.r0;
    }
    S.ring = any ? ring : null;
    return [p.z, r];
  }
  if (p.k === 'face' || p.k === 'faceIn') {
    const r = lerp(p.r0, p.r1, f);
    for (let i = 0; i < S.n; i++) { const z = S.z0 + i * DZ; if (!beyond(z, p.z)) continue; if (p.k === 'face') S.ro[i] = Math.min(S.ro[i], r); else S.ri[i] = Math.max(S.ri[i], r); }
    return [p.z, r];
  }
  if (p.k === 'turn' || p.k === 'bore') {
    const cov = pathAt(p.pts, f);
    const zs = cov.map((q) => q[0]), lo = Math.min(...zs), hi = Math.max(...zs);
    const a = Math.max(0, Math.ceil(idx(S, lo))), b = Math.min(S.n - 1, Math.floor(idx(S, hi)));
    if (cov.length > 1) for (let i = a; i <= b; i++) { const r = rOnPath(cov, S.z0 + i * DZ); if (r === null) continue; if (p.k === 'turn') S.ro[i] = Math.min(S.ro[i], r); else S.ri[i] = Math.max(S.ri[i], r); }
    return cov[cov.length - 1];
  }
  if (p.k === 'drill') {
    const tip = lerp(p.z0, p.z1, f), into = -op.dir;       // the drill goes in toward the chuck
    for (let i = 0; i < S.n; i++) {
      const z = S.z0 + i * DZ, back = (z - tip) * -into;     // how far behind the tip, toward the free end
      if (back < 0) continue;
      let r = back * Math.tan(59 * Math.PI / 180);          // a 118° point
      if (p.pilot) r = back < p.pilot * 1.2 ? Math.min(p.pilot / 2, r) : Math.min(p.d / 2, p.pilot / 2 + (back - p.pilot * 1.2) * Math.tan(30 * Math.PI / 180));
      else r = Math.min(p.d / 2, r);
      S.ri[i] = Math.max(S.ri[i], r);
    }
    return [tip, 0];
  }
  if (p.k === 'part') {
    const r = lerp(p.r0, p.r1, f), za = op.dir > 0 ? p.z - p.w : p.z, zb = op.dir > 0 ? p.z : p.z + p.w;
    for (let i = Math.max(0, Math.ceil(idx(S, za))); i <= Math.min(S.n - 1, Math.floor(idx(S, zb))); i++) S.ro[i] = Math.min(S.ro[i], r);
    return [p.z, r];
  }
  if (p.k === 'thread') { const z = lerp(p.z0, p.z1, f); if (!p.out) S.thread = [Math.min(p.z0, z), Math.max(p.z0, z)]; return [z, 0]; }
  return [0, 0];
}
// after a part-off: keep only the piece on the free side
export function keepFree(S, op) {
  // find the last cut (no metal) seen from the free end
  const order = []; for (let i = 0; i < S.n; i++) order.push(i);
  if (op.dir > 0) order.reverse();
  let cut = -1, met = false;
  for (const i of order) { if (S.ro[i] > S.ri[i] + 1e-6) met = true; else if (met) { cut = i; break; } }
  if (cut < 0) return S;
  const a = op.dir > 0 ? cut : 0, b = op.dir > 0 ? S.n - 1 : cut;
  return { ...S, z0: S.z0 + a * DZ, n: b - a + 1, ro: S.ro.slice(a, b + 1), ri: S.ri.slice(a, b + 1), ring: null };
}
// the outline as closed loops of [r, z], one per separate piece, simplified, for turning into a mesh
export function outline(S) {
  const loops = [];
  let i = 0;
  while (i < S.n) {
    while (i < S.n && S.ro[i] <= S.ri[i] + 1e-6) i++;
    if (i >= S.n) break;
    let j = i; while (j + 1 < S.n && S.ro[j + 1] > S.ri[j + 1] + 1e-6) j++;
    const outer = [], inner = [];
    for (let k = i; k <= j; k++) { const z = S.z0 + k * DZ; outer.push([S.ro[k], z]); inner.push([S.ri[k], z]); }
    loops.push({ outer: simplify(outer), inner: simplify(inner), z0: S.z0 + i * DZ, z1: S.z0 + j * DZ });
    i = j + 1;
  }
  // a ring left inside a recess while it is faced toward the center
  for (let i = 0; S.ring && i < S.n; i++) {
    if (!S.ring[i]) continue;
    let j = i; while (j + 1 < S.n && S.ring[j + 1]) j++;
    const outer = [], inner = [];
    for (let k = i; k <= j; k++) { const z = S.z0 + k * DZ; outer.push([S.ring[k][1], z]); inner.push([S.ring[k][0], z]); }
    loops.push({ outer: simplify(outer), inner: simplify(inner), z0: S.z0 + i * DZ, z1: S.z0 + j * DZ });
    i = j;
  }
  return loops;
}
function simplify(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let k = 1; k < pts.length - 1; k++) {
    const a = out[out.length - 1], b = pts[k], c = pts[k + 1];
    const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(cr) > 1e-7 || Math.abs(b[0] - c[0]) > 0.02) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// ---- mill ----
// the cut a plane pass makes, laid out once: where the tool's axis starts and ends along u, and the face's middle.
// A fly cutter's bit (or an end mill's bottom edge) cuts on a circle of radius R round the axis, so the edge between cut and uncut is that circle's
// front arc; the pass ends once the arc has crossed the whole face (v: across the feed; vc: the axis's line).
export function planeGeometry(planes, p, R, arc = false) {
  const f = bodyFaces([...planes, { n: p.n, d: p.d, kind: 'this' }]).find((q) => q.kind === 'this');
  if (!f) return null;
  let area = 0; for (let i = 1; i + 1 < f.poly.length; i++) { const a = f.poly[i].map((x, k) => x - f.poly[0][k]), b = f.poly[i + 1].map((x, k) => x - f.poly[0][k]); area += Math.hypot(...cross(a, b)) / 2; }
  const us = f.poly.map((q) => dot(q, p.u)), c = f.poly.reduce((s, q) => [s[0] + q[0] / f.poly.length, s[1] + q[1] / f.poly.length, s[2] + q[2] / f.poly.length], [0, 0, 0]);
  if (!arc) return { s0: Math.min(...us) - R - 0.5, s1: Math.max(...us) + R + 0.5, c, poly: f.poly, area };
  const v = cross(p.n, p.u), vc = dot(c, v), w = Math.max(...f.poly.map((q) => Math.abs(dot(q, v) - vc))), sag = w < R ? R - Math.sqrt(R * R - w * w) : R;
  return { s0: Math.min(...us) - R - 0.5, s1: Math.max(...us) - R + sag + 0.5, c, poly: f.poly, v, vc, w, area };
}
// a mill state: planes (the part so far), the plane being cut (with how far along), holes, gaps, slot
export function millStart(planes, extra = {}) { return { planes: planes.slice(), cut: null, holes: [], gaps: null, slot: null, ...extra }; }

// ---- the whole part at time t ----
// returns { op, step, pass, seg, f, lathe: S | null, mill: M | null }; startOf(op) gives each setup's starting state
export function makeReplay(plan, tl, start) {
  // the state at the start of each setup, worked out once
  const atOp = [];
  let S = null, M = null;
  plan.forEach((op, oi) => {
    if (op.machine === 'lathe') S = latheStart(op, S && oi > 0 ? S : null);
    else if (!M) M = start.mill(S);
    atOp.push({ S: S && { ...S, ro: S.ro.slice(), ri: S.ri.slice() }, M: M && clone(M) });
    for (const g of tl.segs.filter((q) => q.op === oi)) {
      if (op.machine === 'lathe') lathePass(S, op, g.p, 1); else millPass(M, op, g.p, 1, start);
    }
    if (op.machine === 'lathe' && op.steps.some((st) => st.passes.some((p) => p.k === 'part'))) S = keepFree(S, op);
  });
  const final = { S, M };
  return {
    atOp, final,
    at(t) {
      const segs = tl.segs;
      // the setup is the one whose step holds t: it ends after its last pull-back, when the next step begins
      let oi = 0, si = 0;
      plan.forEach((o, i) => o.steps.forEach((st, j) => { if (t >= st.t0 - 1e-9) { oi = i; si = j; } }));
      const op = plan[oi];
      const base = atOp[oi], s = base.S && { ...base.S, ro: base.S.ro.slice(), ri: base.S.ri.slice(), thread: base.S.thread && base.S.thread.slice() }, m = base.M && clone(base.M);
      let tip = null, f = 0, cur = null;
      for (const q of segs) {
        if (q.op !== oi) continue;
        if (q.t0 > t) break;
        f = clamp((t - q.t0) / (q.t1 - q.t0), 0, 1); cur = q;
        tip = op.machine === 'lathe' ? lathePass(s, op, q.p, f) : millPass(m, op, q.p, f, start);
      }
      // a step that begins by setting the part up again by hand (the vise): the picture changes once, as the step begins
      if (cur && cur.step !== si && op.machine === 'mill' && op.steps[si].rot !== op.steps[cur.step].rot) { cur = null; tip = null; f = 0; }
      // the tools are changed half way through the move from one pass to the next, clear of the work
      const swapped = (next, w) => w > 0.5;
      // between passes the tool is pulled back: how far, 0 (cutting) to 1 (clear)
      let away = 1;
      if (cur && op.machine === 'lathe' && t > cur.t1) {
        // on the lathe: out the way it came (off the face, or out of a bore or recess, along the axis; off a turned
        // diameter, outward), across while clear, and in again at the next pass's start. `change` gives both ends of
        // the move and how far through it is, for the slides.
        const from = cur, next = segs[segs.indexOf(cur) + 1], end = tip, o1 = liftOf(cur.p, op, end), u = t - cur.t1;
        const gap = next && next.op === oi ? next.t0 - cur.t1 : Infinity, R = Math.min(RAPID, gap / 3);
        const at = (q, o, k) => [q[0] + o[0] * k, q[1] + o[1] * k];
        let change = null;
        if (gap === Infinity) { away = Math.min(1, u / R); tip = at(end, o1, away); change = { from, to: null, w: 0, end }; }
        else {
          const st0 = lathePass({ ...s, ro: s.ro.slice(), ri: s.ri.slice() }, op, next.p, 0), o2 = liftOf(next.p, op, st0);
          const w = smooth(clamp((u - R) / Math.max(1e-9, gap - 2 * R), 0, 1)), a = at(end, o1, 1), b = at(st0, o2, 1);
          if (u < R) { away = u / R; tip = at(end, o1, away); }
          else if (gap - u < R) { away = (gap - u) / R; tip = at(st0, o2, away); }
          else tip = [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
          change = { from, to: next, w, a, b, end, start: st0, out: u < R ? away : 1, in: gap - u < R ? away : 1 };
          if (swapped(next, w)) cur = next;
        }
        return { op: oi, step: cur.step, seg: cur, f: cur === from ? f : 0, tip, away, lathe: s, mill: m, change };
      }
      if (cur && t > cur.t1) {
        // on the mill: up off the work, back to where the next pass starts (turning the part to the next face or gap
        // on the way), and down again. `move` gives both ends of the move and how far through it is.
        const next = segs[segs.indexOf(cur) + 1];
        if (next && next.op === oi && op.steps[next.step].rot === op.steps[cur.step].rot) {
          const gap = next.t0 - cur.t1, u = t - cur.t1, R = Math.min(RAPID, gap / 3);
          away = Math.min(1, u / R, (gap - u) / R);
          const w = smooth(clamp((u - R) / Math.max(1e-9, gap - 2 * R), 0, 1));
          const to = millPass(clone(m), op, next.p, 0, start), move = { from: cur, to: next, w, a: tip, b: to };
          if (swapped(next, w)) { cur = next; f = 0; tip = to; }
          return { op: oi, step: cur.step, seg: cur, f, tip, away, lathe: s, mill: m, move };
        }
      }
      if (cur) {
        if (t <= cur.t1) away = 0;
        else away = clamp((t - cur.t1) / RAPID, 0, 1);
      } else {
        // before a setup's first pass: the tool waits clear of the work, then comes in to where that pass starts
        cur = segs.find((q) => q.op === oi && q.t0 > t) || segs.find((q) => q.op === oi); away = clamp((cur.t0 - t) / RAPID, 0, 1);
        if (op.machine === 'lathe') { const q = lathePass({ ...s, ro: s.ro.slice(), ri: s.ri.slice() }, op, cur.p, 0), o = liftOf(cur.p, op, q); tip = [q[0] + o[0] * away, q[1] + o[1] * away]; }
        else tip = millPass(clone(m), op, cur.p, 0, start);
      }
      return { op: oi, step: cur.step, seg: cur, f, tip, away, lathe: s, mill: m };
    },
  };
}
// which way a lathe tool comes off the work after a pass, in the part's [z, r]: off a turned diameter or a parting cut,
// outward; everything else (a face, a recess, a bore, a drill, the die) back along the axis toward the free end
// A drill fed in pecks comes right out of its hole, to 2 past the face, from wherever its tip is (q).
function liftOf(p, op, q) { return p.k === 'turn' || p.k === 'part' ? [0, 4] : p.k === 'drill' && p.face !== undefined ? [op.dir * Math.max(5, op.dir * (p.face - q[0]) + 2), 0] : [op.dir * 5, 0]; }
const smooth = (x) => x * x * (3 - 2 * x);
const clone = (M) => ({ ...M, planes: M.planes.slice(), holes: M.holes.map((h) => ({ ...h })), gaps: M.gaps && M.gaps.map((g) => g && { ...g, t: g.t.slice() }), slot: M.slot && M.slot.slice(), cut: null });

// What the passes on one tooth gap have cut so far (g: the gap's state; R: the cutter's radius; k: mm along the
// gap's bottom for each mm of cone distance). lev(s): the height of the gap's bottom above the finished bottom at
// cone distance s. Behind the cutter's lowest point it is the pass's level; ahead of it, under the cutter's arc, it
// rises; where the cutter has not been it is what the pass before left. trimmed(side, s, y): 0 to 1, whether a side
// pass's arc has reached height y on that flank.
export function gapCut(g, R, k = 1) {
  const arc = (x, s) => { if (x === null || x === undefined) return Infinity; const d = (x - s) * k; return d <= 0 ? 0 : d >= R ? Infinity : R - Math.sqrt(R * R - d * d); };
  return {
    lev: (s) => (!g || g.h === null ? Infinity : Math.min(g.h0 ?? Infinity, g.h + arc(g.x, s))),
    trimmed: (side, s, y) => { const e = arc(g && g.t[side > 0 ? 1 : 0], s); return e === Infinity ? 0 : clamp((y - e) / 0.04 + 0.5, 0, 1); },
    done: !!g && g.h === 0 && g.x === -Infinity && g.t[0] === -Infinity && g.t[1] === -Infinity,
  };
}

// a plane cut replaces any shallower cut with the same normal
// (kind: the cutter that made the face, which decides how the face looks)
function addPlane(planes, n, d, kind = 'cut') {
  const i = planes.findIndex((q) => dot(q.n, n) > 1 - 1e-9);
  if (i >= 0) { if (d < planes[i].d) planes[i] = { ...planes[i], d, kind }; } else planes.push({ n, d, kind });
}
// apply mill pass p as far as f; returns the tool's position: { at: point in part frame, axis, ... }
export function millPass(M, op, p, f, start) {
  if (p.k === 'plane') {
    const R = p.r || (p.tool === 'chamfer' ? 2 : (start.toolR || 6)), arc = p.tool === 'fly' || p.tool === 'end';
    const geo = p.geo || (p.geo = planeGeometry(M.planes, p, R, arc));
    if (!geo) { if (f >= 1) addPlane(M.planes, p.n, p.d, p.tool); return null; }
    const s = lerp(geo.s0, geo.s1, f);
    if (f >= 1) { addPlane(M.planes, p.n, p.d, p.tool); M.cut = null; }
    else M.cut = { n: p.n, d: p.d, u: p.u, s: s + R, kind: p.tool, ...(arc ? { R, v: geo.v, vc: geo.vc } : {}) };
    const c = geo.c, cu = dot(c, p.u);
    return { at: [0, 1, 2].map((k) => c[k] + p.u[k] * (s - cu)), n: p.n, u: p.u };
  }
  if (p.k === 'hole' || p.k === 'tap') {
    const face = M.planes.filter((q) => dot(q.n, p.n) > 0.999).reduce((a, q) => Math.min(a, q.d), Infinity);
    const c = p.n.map((x) => x * face);
    let h = M.holes.find((q) => dot(q.n, p.n) > 0.999);
    if (!h) { h = { n: p.n, c, d: 0, depth: 0, spot: 0, tap: 0 }; M.holes.push(h); }
    // a tap goes in a turn for every pitch of thread, and comes out the same way
    // (a drill starts LEAD above the face, or above where its last peck ended)
    const dep = p.out ? lerp(p.depth, -1, f) : lerp((p.from || 0) - (p.k === 'hole' ? LEAD : 0), p.depth, f);
    if (p.out) return { at: c.map((x, k) => x - p.n[k] * dep), n: p.n, hole: true, turns: Math.max(0, dep) / p.pitch };
    if (p.k === 'tap') h.tap = Math.max(h.tap, dep);
    else if (p.spot) h.spot = Math.max(h.spot, dep);
    else { h.d = p.d; h.depth = Math.max(h.depth, dep); }
    return { at: c.map((x, k) => x - p.n[k] * dep), n: p.n, hole: true, turns: p.k === 'tap' ? dep / p.pitch : undefined };
  }
  if (p.k === 'gap') {
    // each gap: the level its bottom was at before the pass now cutting it (h0) and that pass's level (h), in mm
    // above the finished bottom; where the cutter's lowest point is along the gap (x, mm from the cone's point;
    // -Infinity once the pass is through); and the same for the two side passes (t: minus side, plus side)
    if (!M.gaps) M.gaps = new Array(start.N).fill(null);
    const x = lerp(p.x0, p.x1, f), at = f >= 1 ? -Infinity : x, g = M.gaps[p.gap] || { h0: null, h: null, x: null, t: [null, null] };
    if (p.side === 0) M.gaps[p.gap] = { ...g, h0: p.from, h: p.h, x: at };
    else { const t = g.t.slice(); t[p.side > 0 ? 1 : 0] = at; M.gaps[p.gap] = { ...g, t }; }
    return { gap: p.gap, side: p.side, x, h: p.h };
  }
  if (p.k === 'slot') { const y = lerp(p.from, p.to, f); M.slot = [p.from, y, p.r || 0]; return { slot: y }; }
  return null;
}
