// One clock for the fusion, and how far each kind of molecule gets on it.
//
// The slider is not a clock: it slows each stage by a different amount, because the stages differ a thousand times in
// how long they take. This file gives the real time at each point of the slider, and from that time alone works out
// everything that spreads by random motion: glutamate leaving through the pore and spreading in the cleft, lipids
// mixing between the two membranes, and proteins moving out of the vesicle. So at any one point of the slider all of
// them have had the same time, and each has gone as far as its own diffusion coefficient allows.
//
// Times are in milliseconds from the moment the pore opens. Lengths are in nanometres.
import { shape, D, PH } from './profile.js';

// Measured values, each with where it was read.
export const T_CA = 0.06;        // ms from calcium entry to fusion: 60 microseconds (Sabatini & Regehr, Nature 384:170, 1996)
export const D_GLU = 3.3e5;      // nm^2/ms: glutamate in the cleft, 0.33 um^2/ms, a third of free solution (Nielsen, DiGregorio & Silver,
                                 // Neuron 42:757, 2004; the value is quoted in Zheng, Scimemi & Rusakov, Biophys J 95:4584, 2008)
export const D_LIPID = 5400;     // nm^2/ms: a phospholipid in a cell membrane over distances under 230 nm, 5.4 um^2/s
                                 // (Fujiwara et al., J Cell Biol 157:1071, 2002). The drawn patch is 240 nm across.
export const D_PROTEIN = 200;    // nm^2/ms: a vesicle protein just after fusion, 0.2 um^2/s (synaptobrevin, synaptotagmin and
                                 // synaptophysin spread at 0.20 to 0.35 um^2/s: Gimber et al., Nat Commun 6:8392, 2015)
export const T_CLEFT = 1.2;      // ms: glutamate in a whole synaptic cleft falls with this time constant (Clements et al., Science 258:1498, 1992)
export const AMPA_OFF = 2.5;     // ms: an AMPA receptor closes this long after glutamate has gone (2.3 to 3.0 ms: Colquhoun,
                                 // Jonas & Sakmann, J Physiol 458:261, 1992). An NMDA receptor keeps its glutamate for the whole of the slider.
export const BOUND = { ampa: 2, nmda: 2 };   // glutamates drawn bound: an AMPA receptor has four sites and opens once two are
                                 // filled (Rosenmund, Stern-Bach & Stevens, Science 280:1596, 1998); an NMDA receptor has two (Laube, Kuhse & Betz, J Neurosci 18:2954, 1998)
// The page's own choice, not measured: how long the pore takes to reach 3 nm, and then to open into the omega shape.
// The flattening after that takes tens of milliseconds, as in the inference view (its collapse time is typically 30 ms).
export const T_PORE = 0.1, T_OMEGA = 0.3, T_MERGED = 40, T_END = 120;
export const R_GLU = 0.35;       // nm: the radius of a glutamate molecule, which the pore must exceed before any can pass
export const PORE_T = 1.5e-4;    // ms: the time one molecule takes to diffuse through the 10 nm pore (length^2 / 2 D_GLU)

// The real time at progress p. Before calcium the docked vesicle waits, for any length of time.
export function clock(p) {
  if (p <= PH.CA) return -T_CA;
  if (p < PH.PORE) return -T_CA * (PH.PORE - p) / (PH.PORE - PH.CA);
  if (p < PH.DILATE) return T_PORE * (p - PH.PORE) / (PH.DILATE - PH.PORE);
  if (p < PH.OMEGA) return T_PORE + (T_OMEGA - T_PORE) * (p - PH.DILATE) / (PH.OMEGA - PH.DILATE);
  if (p < PH.MERGED) return T_OMEGA * Math.pow(T_MERGED / T_OMEGA, (p - PH.OMEGA) / (PH.MERGED - PH.OMEGA));
  return T_MERGED * Math.pow(T_END / T_MERGED, Math.min(1, (p - PH.MERGED) / (1 - PH.MERGED)));
}
// The progress at which the clock reads t (from PH.CA, where it starts, to 1).
export function unclock(t) {
  if (t <= -T_CA) return PH.CA;
  if (t < 0) return PH.PORE + (PH.PORE - PH.CA) * t / T_CA;
  if (t < T_PORE) return PH.PORE + (PH.DILATE - PH.PORE) * t / T_PORE;
  if (t < T_OMEGA) return PH.DILATE + (PH.OMEGA - PH.DILATE) * (t - T_PORE) / (T_OMEGA - T_PORE);
  if (t < T_MERGED) return PH.OMEGA + (PH.MERGED - PH.OMEGA) * Math.log(t / T_OMEGA) / Math.log(T_MERGED / T_OMEGA);
  return Math.min(1, PH.MERGED + (1 - PH.MERGED) * Math.log(t / T_MERGED) / Math.log(T_END / T_MERGED));
}

// While the two membranes are joined only by a narrow neck, molecules of one reach the other more slowly than on a
// flat sheet: a random walker on a sphere of radius R takes about R^2 (2 ln(2R / e) - 1) / D to find a hole of radius
// e, against R^2 / 2D to leave a flat disc of the same area. The ratio of the two slows the mixing; it is 1 once the
// neck is as wide as the vesicle.
const slow = (R, e) => Math.max(1, 2 * (2 * Math.log(2 * R / Math.max(0.3, e)) - 1));

export const REL_N = 64, REL_MAX = 14;       // the release table: times at which exp(-L) of the glutamate is left, L = REL_MAX (j / 63)^2
const NG = 1561, P0 = PH.STALK, DP = (1 - P0) / (NG - 1);
const cache = new Map();
// Everything that depends on the vesicle's size, tabulated along the slider from the stalk to the end.
export function kinetics(R) {
  const key = Math.round(R * 1000);
  if (cache.has(key)) return cache.get(key);
  const K = { R, t: new Float64Array(NG), s2: [new Float64Array(NG), new Float64Array(NG)], J: new Float64Array(NG), L: new Float64Array(NG), rel: new Float32Array(REL_N) };
  const Rin = R - D - 0.9, V = 4 / 3 * Math.PI * Rin * Rin * Rin;
  let t0 = 0, f0 = null;
  for (let i = 0; i < NG; i++) {
    const p = P0 + DP * i, S = shape(p, R), t = clock(p);
    // Glutamate leaves through the pore no faster than diffusion carries it: the pore's conductance for a molecule of
    // radius R_GLU (a tube of the pore's length, plus the approach to each mouth), over the volume of the lumen.
    const a = Math.max(0, S.neck - D - 0.6 - R_GLU), len = 2 * S.rho;
    const f = [2 * D_LIPID / slow(R + D, S.neck + D), p >= PH.PORE ? 2 * D_LIPID / slow(R - D, S.neck - D) : 0,
      p >= PH.PORE ? 1 / slow(R, S.neck) : 0, p >= PH.PORE ? D_GLU * Math.PI * a * a / ((len + Math.PI * a / 2) * V) : 0];
    if (i) { const dt = t - t0; K.s2[0][i] = K.s2[0][i - 1] + (f[0] + f0[0]) / 2 * dt; K.s2[1][i] = K.s2[1][i - 1] + (f[1] + f0[1]) / 2 * dt; K.J[i] = K.J[i - 1] + (f[2] + f0[2]) / 2 * dt; K.L[i] = K.L[i - 1] + (f[3] + f0[3]) / 2 * dt; }
    K.t[i] = t; t0 = t; f0 = f;
  }
  for (let j = 0, i = 0; j < REL_N; j++) {
    const L = REL_MAX * (j / (REL_N - 1)) * (j / (REL_N - 1));
    while (i < NG - 2 && K.L[i + 1] <= L) i++;
    const w = K.L[i + 1] - K.L[i];
    K.rel[j] = K.t[i] + (K.t[i + 1] - K.t[i]) * (w > 0 ? Math.min(1, Math.max(0, (L - K.L[i]) / w)) : 0);
  }
  if (cache.size > 80) cache.clear();
  cache.set(key, K);
  return K;
}
const look = (arr, p) => { const x = Math.min(NG - 1.000001, Math.max(0, (p - P0) / DP)), i = Math.floor(x); return arr[i] + (arr[i + 1] - arr[i]) * (x - i); };

// How far a lipid of one membrane has got into the other by progress p, along one axis (nm). Leaflet 0 is the pair of
// sheets that face each other and join at the stalk; leaflet 1 is the far pair, which join when the pore opens.
export const lipidSpread = (p, R, leaf) => Math.sqrt(look(kinetics(R).s2[leaf], p));
// The same for a protein that could not leave the vesicle before progress `gate` (and never before the pore).
export const proteinSpread = (p, R, gate = PH.PORE) => { const K = kinetics(R), g = Math.max(gate, PH.PORE); return p <= g ? 0 : Math.sqrt(2 * D_PROTEIN * (look(K.J, p) - look(K.J, g))); };
// The same for a vesicle whose pore opened t ms ago (another vesicle in the field, on the same clock). Past the end
// of the slider the membrane is flat and the spread goes on.
// Where another vesicle in the field is in its own fusion, if its pore opens t ms after ours: all are on the one clock.
export const other = (p, t) => unclock(clock(p) - t);
export const spreadAfter = (t, R) => { const K = kinetics(R); return t <= 0 ? 0 : Math.sqrt(2 * D_PROTEIN * (t <= T_END ? look(K.J, unclock(t)) : K.J[NG - 1] + t - T_END)); };
// The fraction of the glutamate that has left the vesicle by progress p.
export const released = (p, R) => (p <= PH.PORE ? 0 : 1 - Math.exp(-look(kinetics(R).L, p)));

// When the molecule with random number e (0 to 1) leaves: the time at which the fraction released reaches e.
// The vertex shader does the same sum from the same table (transmitterVS in shaders.js).
export function releaseTime(K, e) {
  const L = -Math.log(Math.max(1e-6, 1 - e)), x = Math.min(REL_N - 1.001, (REL_N - 1) * Math.sqrt(L / REL_MAX)), i = Math.floor(x);
  return K.rel[i] + (K.rel[i + 1] - K.rel[i]) * (x - i);
}
// Where a molecule is across the gap a time dt after it entered at the top (or `from` below the top): a random walk
// between two walls.
export function across(dt, w, top, bottom, from = 0) {
  const n3 = Math.sqrt(-2 * Math.log(Math.max(w, 1e-4))) * Math.cos(6.2831853 * ((w * 97.13) % 1)), h = top - bottom;
  const m = (from + Math.sqrt(2 * D_GLU * dt) * Math.abs(n3)) % (2 * h);
  return top - (m < h ? m : 2 * h - m);
}
// When a molecule aimed at a receptor a distance r from the pore gets there: its release, the pore, and the time for
// its own random number g (the length of its Gaussian pair) to carry it that far.
export const arrivalTime = (K, e, g, r) => releaseTime(K, e) + PORE_T + r * r / (2 * D_GLU * g * g);
// An AMPA receptor lets its glutamate go this long after the pore opened: when the cleft has cleared, plus AMPA_OFF.
export const T_UNBIND = T_CLEFT + AMPA_OFF;
// One glutamate molecule at progress p. seed: [e, g1, g2, w] (uniform, a Gaussian pair, uniform), as in the instance
// buffer. bind: null, or [x, y, z, kind] for a molecule that binds a receptor site there (kind 1 AMPA, 2 NMDA).
// Returns where it is ('lumen', 'pore', 'cleft' or 'bound'), and outside the lumen its place (x, y, z).
// The vertex shader draws from the same formulas (transmitterVS in shaders.js); tests/vesicle/model.mjs counts with this one.
export function glutamate(seed, bind, p, R, top, bottom) {
  const K = kinetics(R), t = clock(p), dt = t - releaseTime(K, seed[0]);
  if (p <= PH.PORE || dt < 0) return { where: 'lumen' };
  if (dt < PORE_T) return { where: 'pore', dt, x: 0, z: 0 };
  let t0 = dt - PORE_T, ox = 0, oz = 0, from = 0;
  if (bind) {
    const tb = bind[0] * bind[0] + bind[2] * bind[2], ta = tb / (2 * D_GLU * (seed[1] * seed[1] + seed[2] * seed[2])), off = bind[3] < 1.5 ? T_UNBIND : Infinity;
    if (t0 >= ta && t < off) return { where: 'bound', dt, x: bind[0], y: bind[1], z: bind[2] };
    if (t >= off && t0 >= ta) { t0 = t - off; ox = bind[0]; oz = bind[2]; from = top - bind[1]; }
    else if (t0 > 0.6 * ta) { const s = Math.sqrt(2 * D_GLU * t0), k = (t0 / ta - 0.6) / 0.4, y = across(t0, seed[3], top, bottom); return { where: 'cleft', dt, x: s * seed[1], z: s * seed[2], y: y + (bind[1] - y) * k * k * (3 - 2 * k) }; }
  }
  const s = Math.sqrt(2 * D_GLU * t0);
  return { where: 'cleft', dt, x: ox + s * seed[1], z: oz + s * seed[2], y: across(t0, seed[3], top, bottom, from) };
}
