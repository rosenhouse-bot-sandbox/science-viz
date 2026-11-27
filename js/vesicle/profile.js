// Geometry of the fusing membrane.
//
// The bilayer midplane is a surface of revolution made of three analytic pieces: a spherical cap
// (the vesicle), a toroidal fillet (the neck) and the flat plasma membrane. One angle, theta,
// carries the whole event: at theta = pi the cap is a complete sphere resting above the plane,
// at pi/2 it is an omega figure with a wide-open neck, and at 0 it has flattened into the plane.
//
// Each leaflet is the midplane offset by +/-D (the depth of its headgroups). Offsetting the neck
// inward makes the cytoplasmic leaflets meet first (the hemifusion stalk of the Kozlov-Markin
// model) while the far leaflets are still two separate, dimpled sheets. They meet later, and
// that is the moment the pore opens. Nothing is special-cased: the stalk, the hemifusion state
// and the pore all fall out of clipping the offset curves at the axis.
//
// Lipids ride on the surface by "area coordinate": the membrane area enclosed between the top
// of the vesicle and the lipid. Area is conserved, so as the vesicle flattens, its lipids pour
// through the neck and the surrounding membrane is pushed outward by exactly the right amount.
import { sstep, rng } from './glx.js';

export const D = 1.9;          // nm, midplane to headgroup centres
export const RHO0 = 3.2;       // nm, meridional radius of the neck when it first forms
export const CLEFT = 20;       // nm, midplane to midplane across the synaptic cleft
export const TABW = 2048;      // samples per lookup row
export const BAREA = Math.PI * 30 * 30;   // nm^2 of plasma membrane covered by the second row
// Before it docks the vesicle has to get there. Progress runs from -ARRIVE up to 0 while it arrives; from 0 on it is docked.
export const ARRIVE = 0.2;
export const PH = { CA: 0.10, STALK: 0.22, PORE: 0.36, DILATE: 0.50, OMEGA: 0.70, MERGED: 0.92 };
// Calcium comes first. The channels open at PH.CA, calcium is flowing by CA_IN and has bound synaptotagmin by CA_BOUND.
// Until it has bound, the gap between the membranes and the winding of the SNAREs do not change.
export const CA_IN = PH.CA + 0.02, CA_BOUND = PH.CA + 0.045;
export const DOCK_GAP = 5;     // nm that the half-wound SNAREs hold the docked vesicle above first contact; winding closes it
// A tether is a rod standing on the active zone with a flexible link at its tip. Rod and link together are 40 nm:
// filaments that tether vesicles to the active zone are shorter than 40 nm (Fernandez-Busnadiego et al., J Cell Biol
// 188:145, 2010). The link is a chain of one fixed length. Its end binds a site on the vesicle (Rab3) when that site
// comes within the link's length, and it cannot stretch after that.
export const TETHER = { rod: 17, link: 23, lean: 6,   // rod and link lengths; lean: how far the rod's tip stands inward of its foot
  phi: [Math.PI / 2 + 1.42, Math.PI / 2 - 1.55] };
export const SNARE_REACH = 12; // nm above docking at which the synaptobrevin strands meet syntaxin and SNAP-25
// Where the two tethers stand for a vesicle of midplane radius R, and the site each one binds on the vesicle
// (a vector from the vesicle's centre, in the vesicle's own frame: the point that faces the tip once docked).
export function tethers(R) {
  const y0 = R + 2 * RHO0 + DOCK_GAP, r0 = 0.9 * R + 12;
  return TETHER.phi.map((phi) => {
    const er = [Math.cos(phi), 0, Math.sin(phi)], foot = [r0 * er[0], D, r0 * er[2]];
    const tip = [foot[0] - TETHER.lean * er[0], D + Math.sqrt(TETHER.rod * TETHER.rod - TETHER.lean * TETHER.lean), foot[2] - TETHER.lean * er[2]];
    const v = [tip[0], tip[1] - y0, tip[2]], l = Math.hypot(v[0], v[1], v[2]), k = (R + D + 0.6) / l;
    return { phi, er, foot, tip, site: [v[0] * k, v[1] * k, v[2] * k] };
  });
}
// The arrival is one fixed random walk, the same on every visit: steps of the same size, in a random direction, as
// far sideways as up or down, and a random turn with each step (a sphere this size turns about 40 degrees for each
// 16 nm it wanders: turn per axis = sqrt(3/4) * step / radius). Nothing steers it. Three things bound it, and each
// is something it touches: the active zone below, a tether's link once that has bound (it cannot stretch), and at
// the end the SNARE strands, which wind and pull it the last SNARE_REACH nanometres to the docked place.
// The walk is made backward from the docked place, because a random walk run backward is a random walk. The seed is
// the first one whose walk is free for the early part, starts 95 to 145 nm up and stays within WALK.side of the axis
// (the way down that the scenery leaves clear).
export const WALK = { steps: 200, pull: 24, step: 7, hold: 26, side: 75 };
const rodrigues = (w) => {
  const th = Math.hypot(w[0], w[1], w[2]); if (th < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const k = [w[0] / th, w[1] / th, w[2] / th], c = Math.cos(th), s = Math.sin(th), t = 1 - c;
  return [c + k[0] * k[0] * t, k[0] * k[1] * t - k[2] * s, k[0] * k[2] * t + k[1] * s,
    k[1] * k[0] * t + k[2] * s, c + k[1] * k[1] * t, k[1] * k[2] * t - k[0] * s,
    k[2] * k[0] * t - k[1] * s, k[2] * k[1] * t + k[0] * s, c + k[2] * k[2] * t];
};
const mul = (a, b) => { const o = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]; return o; };
const turn = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
// The length of link that tether T needs to join its tip to its site on a vesicle whose centre is o above the docked
// place and which is turned by m. A link cannot pass through the vesicle: where the straight line from the tip to the
// site would, that part of it lies on the vesicle's surface instead.
const reach = (T, y0, o, m) => {
  const a = turn(m, T.site), w = [T.tip[0] - o[0], T.tip[1] - y0 - o[1], T.tip[2] - o[2]];      // from the vesicle's centre: the site, the tip
  const d = [a[0] - w[0], a[1] - w[1], a[2] - w[2]], d2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2], s2 = a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
  const t1 = (w[0] * w[0] + w[1] * w[1] + w[2] * w[2] - s2) / d2, dl = Math.sqrt(d2);          // where the line enters the vesicle (1: at the site itself)
  if (t1 >= 1 || t1 <= 0) return dl;
  const cs = ((w[0] + t1 * d[0]) * a[0] + (w[1] + t1 * d[1]) * a[1] + (w[2] + t1 * d[2]) * a[2]) / s2;
  return t1 * dl + Math.sqrt(s2) * Math.acos(Math.min(1, Math.max(-1, cs)));
};
function walk(R, seed) {
  const r = rng(seed), T = tethers(R), y0 = R + 2 * RHO0 + DOCK_GAP, Ro = R + D, N = WALK.steps, rot = Math.sqrt(0.75) * WALK.step / Ro;
  const pos = [[0, 0, 0]], inc = [], M = [[1, 0, 0, 0, 1, 0, 0, 0, 1]], cap = [N + 1, N + 1], held = [true, true];
  // Clear of both rods (a rod is a line of beads from its foot to its tip).
  const clear = (o) => T.every((t) => {
    const ax = [t.tip[0] - t.foot[0], t.tip[1] - t.foot[1], t.tip[2] - t.foot[2]], q = [o[0] - t.foot[0], y0 + o[1] - t.foot[1], o[2] - t.foot[2]];
    const s = Math.min(1, Math.max(0, (q[0] * ax[0] + q[1] * ax[1] + q[2] * ax[2]) / (ax[0] * ax[0] + ax[1] * ax[1] + ax[2] * ax[2])));
    return Math.hypot(q[0] - s * ax[0], q[1] - s * ax[1], q[2] - s * ax[2]) >= Ro + 1.6;
  });
  let o = [0, 0, 0], m = M[0];
  for (let j = 1; j <= N; j++) {
    let w = [0, 0, 0];
    if (j <= WALK.pull) o = [0, SNARE_REACH * sstep(0, WALK.pull, j), 0];
    else for (let tries = 0; tries < 60; tries++) {
      const o2 = [o[0] + WALK.step * r.gauss(), o[1] + WALK.step * r.gauss(), o[2] + WALK.step * r.gauss()], w2 = [rot * r.gauss(), rot * r.gauss(), rot * r.gauss()];
      if (o2[1] < SNARE_REACH || !clear(o2)) continue;
      const m2 = mul(rodrigues(w2), m), mh = mul(rodrigues([w2[0] / 2, w2[1] / 2, w2[2] / 2]), m), oh = [(o[0] + o2[0]) / 2, (o[1] + o2[1]) / 2, (o[2] + o2[2]) / 2];
      const next = held.slice(); let ok = true;
      for (let k = 0; k < 2 && ok; k++) {
        const d = reach(T[k], y0, o2, m2);
        if (held[k]) { if (d > 0.97 * TETHER.link) { if (j > WALK.pull + WALK.hold && d > TETHER.link) next[k] = false; else ok = false; } else if (reach(T[k], y0, oh, mh) > TETHER.link) ok = false; }
        else if (d <= TETHER.link || reach(T[k], y0, oh, mh) <= TETHER.link) ok = false;
      }
      if (!ok) continue;
      for (let k = 0; k < 2; k++) if (held[k] && !next[k]) { held[k] = false; cap[k] = j; }
      o = o2; m = m2; w = w2; break;
    }
    pos.push(o); inc.push(w); M.push(m);
  }
  const free = Math.max(cap[0], cap[1]);
  if (free > 0.6 * N || o[1] < 95 || o[1] > 145) return null;
  // It stays in the way down that the scenery leaves clear: within WALK.side of the axis, and less near the docked neighbours.
  for (const q of pos) if (q[1] > 170 || Math.hypot(q[0], q[2]) > Math.min(WALK.side, 10 + 0.9 * q[1])) return null;
  return { R, seed, pos, inc, M, cap, free, y0, T };
}
// The seed for each whole-nanometre diameter from 30 to 90 (the slider's stops), found once by that search, so that
// the page does not search while a slider moves. tests/vesicle/model.mjs checks every one.
const SEEDS = [140, 140, 635, 1688, 1909, 797, 797, 437, 437, 1151, 1380, 722, 722, 437, 437, 930, 2211, 1596, 3083, 45, 645, 1171, 1596, 1334, 51, 413, 1193, 572, 684, 684, 691, 210, 633, 225, 5097, 2113, 18, 18, 18, 1822, 1587, 2020, 551, 551, 4245, 941, 5748, 456, 456, 456, 302, 302, 327, 1083, 2, 1083, 2532, 2532, 2532, 2532, 2532];
const walks = new Map();
export function arrival(R, from = 0) {
  const key = Math.round(R * 1000), diam = 2 * (R + 2.4), i = Math.round(diam) - 30;
  if (!walks.has(key) || from) {
    let w = !from && Math.abs(diam - Math.round(diam)) < 1e-6 && SEEDS[i] ? walk(R, SEEDS[i]) : null;
    for (let seed = from || 1; seed < 20000 && !w; seed++) w = walk(R, seed);
    if (from) return w;
    if (walks.size > 80) walks.clear(); walks.set(key, w);
  }
  return walks.get(key);
}
// The arriving vesicle at progress p: how far above the docked place its centre is (y), how far to the side (x, z),
// how it is turned (M, row by row), which tethers hold it, how much link each tether needs to reach its site (reach),
// and how many steps of the walk are left before each tether binds (wait; 0 once it holds).
export function drift(p, R = 18.6) {
  const u = Math.min(1, Math.max(0, -p / ARRIVE));
  if (u <= 0) return { x: 0, y: 0, z: 0, M: [1, 0, 0, 0, 1, 0, 0, 0, 1], held: [true, true], reach: null, wait: [0, 0], at: 0 };
  const W = arrival(R), x = u * WALK.steps, i = Math.min(WALK.steps - 1, Math.floor(x)), f = x - i, a = W.pos[i], b = W.pos[i + 1], w = W.inc[i];
  const o = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f], M = mul(rodrigues([w[0] * f, w[1] * f, w[2] * f]), W.M[i]);
  const d = W.T.map((t) => reach(t, W.y0, o, M));
  return { x: o[0], y: o[1], z: o[2], M, held: d.map((dk, k) => x <= W.cap[k] - 1 && dk <= TETHER.link + 1e-9), reach: d, wait: W.cap.map((c) => Math.max(0, x - (c - 1))), at: x };
}
const PI = Math.PI, NC = 220, NF = 160;

export function shape(p, R) {
  let n;                       // radius of the neck measured at the midplane; negative before contact
  if (p < CA_BOUND) n = -RHO0;
  else if (p < PH.STALK) n = -RHO0 + (RHO0 - D) * sstep(CA_BOUND, PH.STALK, p);
  else if (p < PH.PORE) n = -D + 2 * D * sstep(PH.STALK, PH.PORE, p);
  else n = D + 1.6 * sstep(PH.PORE, PH.DILATE, p);
  const approach = p < 0 ? drift(p, R).y : 0;              // height still to come down before docking
  const extra = approach + DOCK_GAP * (1 - sstep(CA_BOUND, PH.STALK, p));   // plus the docking gap, which the SNAREs close as they wind
  const th50 = PI - Math.asin((D + 1.6 + RHO0) / (R + RHO0));
  let theta, rho = RHO0;
  if (p <= PH.DILATE) theta = PI - Math.asin(Math.max(0, n + RHO0) / (R + RHO0));
  else {
    // The vesicle is an omega at PH.OMEGA and has flattened into the membrane by PH.MERGED. After that only its proteins go on spreading.
    const q = p <= PH.OMEGA ? p : Math.min(1, PH.OMEGA + (p - PH.OMEGA) * (1 - PH.OMEGA) / (PH.MERGED - PH.OMEGA)), t = (q - PH.DILATE) / (1 - PH.DILATE);
    theta = Math.max(1e-3, th50 * (1 - sstep(0, 1, Math.pow(t, 0.8))));
    const g = Math.min(1, (th50 - theta) / (th50 - PI / 2));
    rho = RHO0 + Math.min(4.5, R * 0.22) * sstep(0, 1, g);
  }
  // Past the omega stage the cap keeps its area and spreads, so its radius of curvature grows.
  const Rc = theta >= PI / 2 ? R : R / Math.sqrt(1 - Math.cos(theta));
  const c = (Rc + rho) * Math.sin(theta), h = rho - (Rc + rho) * Math.cos(theta);
  return { p, R, theta, rho, Rc, c, h, extra, approach, neck: c - rho };
}

function poly() { return { r: [], y: [], nr: [], ny: [], a: [0] }; }
function push(P, r, y, nr, ny) {
  const k = P.r.length;
  if (k) P.a.push(P.a[k - 1] + PI * (P.r[k - 1] + r) * Math.hypot(r - P.r[k - 1], y - P.y[k - 1]));
  P.r.push(r); P.y.push(y); P.nr.push(nr); P.ny.push(ny);
}
// Sample one leaflet (offset o from the midplane) as one or two polylines with cumulative area.
function leaflet(S, o) {
  const sg = o > 0 ? 1 : -1, Rs = S.Rc + o, rf = S.rho - o;
  const fused = S.c >= rf - 1e-9;
  const A = poly();
  const lift = fused ? 0 : S.extra;
  for (let i = 0; i <= NC; i++) {
    const al = S.theta * i / NC, s = Math.sin(al), co = Math.cos(al);
    push(A, Rs * s, S.h + lift + Rs * co, sg * s, sg * co);
  }
  const fil = (P, from, to, dy) => {
    for (let i = 1; i <= NF; i++) {
      const ps = from + (to - from) * i / NF, s = Math.sin(ps), co = Math.cos(ps);
      push(P, Math.max(0, S.c - rf * s), S.rho + dy - rf * co, sg * s, sg * co);
    }
  };
  if (fused) { fil(A, S.theta, 0, 0); return { fused, o, sg, A, B: null }; }
  const q = Math.min(1, S.c / rf), psA = Math.asin(q), psB = PI - psA;
  if (psB < S.theta) fil(A, S.theta, psB, lift);
  const B = poly();
  push(B, 0, S.rho - rf * Math.cos(psA), sg * Math.sin(psA), sg * Math.cos(psA));
  if (psA > 1e-6) fil(B, psA, 0, 0);
  return { fused, o, sg, A, B };
}
// Point on a polyline at cumulative area a; past its end the membrane is flat.
function at(P, L, a, out, k, hint) {
  const n = P.r.length, end = P.a[n - 1];
  if (a > end) {       // strictly past it: the last sample of a free vesicle is its own pole, not the plane
    out[k] = Math.sqrt(P.r[n - 1] * P.r[n - 1] + (a - end) / PI); out[k + 1] = L.o; out[k + 2] = 0; out[k + 3] = L.sg;
    return n - 1;
  }
  let i = hint;
  while (i < n - 2 && P.a[i + 1] < a) i++;
  const w = P.a[i + 1] - P.a[i], t = w > 0 ? (a - P.a[i]) / w : 0;
  // Interpolate r^2 rather than r: exact on a cone, and it keeps the poles round.
  out[k] = Math.sqrt(P.r[i] * P.r[i] + (P.r[i + 1] * P.r[i + 1] - P.r[i] * P.r[i]) * t);
  out[k + 1] = P.y[i] + (P.y[i + 1] - P.y[i]) * t;
  out[k + 2] = P.nr[i] + (P.nr[i + 1] - P.nr[i]) * t;
  out[k + 3] = P.ny[i] + (P.ny[i + 1] - P.ny[i]) * t;
  return i;
}

// Full state for a given progress and vesicle radius, including the lookup table the GPU reads:
// four rows of (r, y, normal r, normal y), two per leaflet. Row A spans the vesicle's own area,
// row B the first BAREA of plasma membrane beyond it; further out the membrane is a plane.
export function compute(p, R, tab) {
  const S = shape(p, R);
  S.tab = tab || new Float32Array(TABW * 4 * 4);
  S.Av = [4 * PI * (R + D) * (R + D), 4 * PI * (R - D) * (R - D)];
  S.fused = [false, false]; S.rW = [0, 0];
  for (let leaf = 0; leaf < 2; leaf++) {
    const L = leaflet(S, leaf ? -D : D), Av = S.Av[leaf];
    S.fused[leaf] = L.fused;
    const A1 = L.A.a[L.A.a.length - 1];
    let o = leaf * 2 * TABW * 4, hint = 0;
    for (let i = 0; i < TABW; i++) hint = at(L.A, L, (L.fused ? Av : A1) * i / (TABW - 1), S.tab, o + i * 4, hint);
    o += TABW * 4; hint = 0;
    const PB = L.fused ? L.A : L.B, base = L.fused ? Av : 0;
    for (let i = 0; i < TABW; i++) hint = at(PB, L, base + BAREA * i / (TABW - 1), S.tab, o + i * 4, hint);
    S.rW[leaf] = S.tab[o + (TABW - 1) * 4];
  }
  return S;
}

// Same lookup the vertex shader does, for placing proteins. Writes position and normal into out[0..5].
export function surf(S, leaf, a, phi, out) {
  const Av = S.Av[leaf], cs = Math.cos(phi), sn = Math.sin(phi), T = S.tab;
  let r, y, nr, ny;
  const row = (rw, t) => {
    const i = Math.min(TABW - 2, Math.floor(t)), f = t - i, k = (rw * TABW + i) * 4;
    r = T[k] + (T[k + 4] - T[k]) * f; y = T[k + 1] + (T[k + 5] - T[k + 1]) * f;
    nr = T[k + 2] + (T[k + 6] - T[k + 2]) * f; ny = T[k + 3] + (T[k + 7] - T[k + 3]) * f;
  };
  if (a < Av) row(leaf * 2, Math.max(0, a) / Av * (TABW - 1));
  else if (a - Av < BAREA) row(leaf * 2 + 1, (a - Av) / BAREA * (TABW - 1));
  else { r = Math.sqrt(S.rW[leaf] * S.rW[leaf] + (a - Av - BAREA) / PI); y = leaf ? -D : D; nr = 0; ny = leaf ? -1 : 1; }
  const l = Math.hypot(nr, ny) || 1;
  out[0] = r * cs; out[1] = y; out[2] = r * sn; out[3] = nr / l * cs; out[4] = ny / l; out[5] = nr / l * sn;
  return out;
}

// Midplane profile as a fixed-length list of [r, y] points, for sketching a vesicle's outline
// cheaply. Every outline has the same number of points, so two can be joined into a band.
export function outline(p, R) {
  const S = shape(p, R), pts = [], lift = S.neck < -D ? S.extra : 0;
  for (let i = 0; i <= 26; i++) { const a = S.theta * i / 26; pts.push(S.Rc * Math.sin(a), S.h + lift + S.Rc * Math.cos(a)); }
  for (let i = 1; i <= 14; i++) {
    const ps = S.theta * (1 - i / 14), r = S.c - S.rho * Math.sin(ps);
    pts.push(Math.max(0, r), S.rho - S.rho * Math.cos(ps) + (ps > Math.PI / 2 ? lift : 0));
  }
  pts.push(Math.max(S.c, 0) + 0.5 * R, 0);
  return pts;
}
