// Engine: the molecules. One small group of gas at the spot the Molecules scale looks at: two fuel molecules
// with exactly the oxygen they need and the nitrogen that comes with it in air. Every atom is followed through
// the burn, so that none appears or disappears: 2 C8H18 + 25 O2 -> 16 CO2 + 18 H2O.
import { MIX, gasAt, groupEdge, INJECT, wrap, smooth, mix, clamp } from './model.js?v=e513c19b';

export const ATOM = {      // radius in nm (about 0.85 of the van der Waals radius), and the usual model colors
  C: { r: 0.145, col: [0.17, 0.18, 0.20] }, H: { r: 0.095, col: [0.90, 0.90, 0.90] }, O: { r: 0.130, col: [0.86, 0.13, 0.10] }, N: { r: 0.133, col: [0.16, 0.32, 0.92] },
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// iso-octane (2,2,4-trimethylpentane), standing for gasoline's many hydrocarbons: 8 carbons, then 18 hydrogens set around them
const OCTANE = (() => {
  const C = [[0, 0, 0], [0.126, 0.089, 0], [0.126, 0.178, 0.126], [0.126, 0.178, -0.126], [0.252, 0, 0], [0.378, 0.089, 0], [0.504, 0, 0], [0.378, 0.178, 0.126]];
  const B = [[0, 1], [1, 2], [1, 3], [1, 4], [4, 5], [5, 6], [5, 7]], out = C.map((c) => ['C', c]);
  C.forEach((c, i) => {
    const nb = B.filter((b) => b.includes(i)).map((b) => unit(sub(C[b[0] === i ? b[1] : b[0]], c))), k = 4 - nb.length; if (!k) return;
    const base = unit(nb.reduce((a, v) => sub(a, v), [0, 0, 0]));
    let dirs;
    if (k === 1) dirs = [base];
    else if (k === 2) { const pp = unit(cross(nb[0], nb[1])); dirs = [1, -1].map((s) => unit([0, 1, 2].map((m) => base[m] * 0.58 + s * pp[m] * 0.82))); }
    else {      // a methyl group: its hydrogens sit between the bonds of the carbon it hangs on, seen along the bond
      const j0 = B.find((b) => b.includes(i)), nbr = j0[0] === i ? j0[1] : j0[0], oth = B.find((b) => b.includes(nbr) && !b.includes(i)), v = unit(sub(C[oth[0] === nbr ? oth[1] : oth[0]], C[nbr]));
      const dv = v[0] * base[0] + v[1] * base[1] + v[2] * base[2], a = unit([0, 1, 2].map((m) => v[m] - base[m] * dv)), b = cross(base, a); dirs = [0, 1, 2].map((j) => { const t = j * 2.094 + Math.PI; return unit([0, 1, 2].map((m) => base[m] * 0.334 + (a[m] * Math.cos(t) + b[m] * Math.sin(t)) * 0.943)); }); }
    for (const d of dirs) out.push(['H', [c[0] + d[0] * 0.109, c[1] + d[1] * 0.109, c[2] + d[2] * 0.109]]);
  });
  return out.map(([el, p]) => [el, [p[0] - 0.25, p[1] - 0.09, p[2]]]);
})();
export const SHAPES = {
  fuel: OCTANE,
  o2: [['O', [-0.0604, 0, 0]], ['O', [0.0604, 0, 0]]],
  n2: [['N', [-0.0549, 0, 0]], ['N', [0.0549, 0, 0]]],
  co2: [['C', [0, 0, 0]], ['O', [-0.116, 0, 0]], ['O', [0.116, 0, 0]]],
  h2o: [['O', [0, 0, 0]], ['H', [0.0958, 0, 0]], ['H', [-0.024, 0.0927, 0]]],
};
export const count = (shape, el) => SHAPES[shape].filter((a) => a[0] === el).length;

export function makeGroup() {
  let seed = 20261117; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const mol = (kind, c0) => ({ kind, c0: c0 || [R(), R(), R()], amp: [0.22 + 0.2 * R(), 0.22 + 0.2 * R(), 0.22 + 0.2 * R()], w: [0.25 + 0.4 * R(), 0.25 + 0.4 * R(), 0.25 + 0.4 * R()], ph: [6.28 * R(), 6.28 * R(), 6.28 * R()],
    axis: unit([R() - .5, R() - .5, R() - .5]), spin: (R() < .5 ? -1 : 1) * (0.5 + R()), a0: 6.28 * R(), slow: { fuel: 0.5, o2: 0.94, co2: 0.8, h2o: 1.25 }[kind] || 1, leave: 680 + 24 * R(), g: 0 });      // slow: heavier molecules move more slowly
  const before = [], after = [];
  const fuel = [mol('fuel', [0.40, 0.56, 0.42]), mol('fuel', [0.63, 0.40, 0.55])];
  fuel.forEach((m) => { m.amp = [0.05, 0.05, 0.05]; });       // the fuel stays near the middle of the view
  before.push(...fuel);
  const o2 = []; for (let i = 0; i < MIX.o2; i++) o2.push(mol('o2')); before.push(...o2);
  const n2 = []; for (let i = 0; i < MIX.n2; i++) n2.push(mol('n2')); before.push(...n2);
  // products form near the fuel molecule their carbon and hydrogen came from, and then scatter
  const co2 = [], h2o = [];
  for (let f = 0; f < 2; f++) {
    for (let i = 0; i < MIX.co2 / 2; i++) co2.push(Object.assign(mol('co2', fuel[f].c0.map((v) => v + (R() - .5) * 0.5)), { f }));
    for (let i = 0; i < MIX.h2o / 2; i++) h2o.push(Object.assign(mol('h2o', fuel[f].c0.map((v) => v + (R() - .5) * 0.5)), { f }));
  }
  after.push(...co2, ...h2o);
  // every atom: where it is before (molecule and place in it) and after
  const atoms = [];
  const win = (f) => (f === 0 ? [0.04, 0.56] : [0.44, 0.96]);      // the two fuel molecules burn one after the other
  // oxygen: the 25 pairs nearest the first fuel molecule first; each fuel molecule needs 25 oxygen atoms
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const oAtoms = [...o2].sort((a, b) => d2(a.c0, fuel[0].c0) - d2(b.c0, fuel[0].c0)).flatMap((m) => [0, 1].map((k) => ({ m, k })));
  let oi = 0;
  for (let f = 0; f < 2; f++) {
    const cs = co2.filter((m) => m.f === f), hs = h2o.filter((m) => m.f === f), w = win(f);
    let ci = 0, hi = 0;
    SHAPES.fuel.forEach(([el, off], k) => {
      if (el === 'C') { atoms.push({ el, mR: fuel[f], offR: off, mP: cs[ci], offP: SHAPES.co2[0][1], w }); ci++; }
      else { atoms.push({ el, mR: fuel[f], offR: off, mP: hs[hi >> 1], offP: SHAPES.h2o[1 + (hi & 1)][1], w }); hi++; }
    });
    for (const m of cs) for (const k of [1, 2]) { const o = oAtoms[oi++]; atoms.push({ el: 'O', mR: o.m, offR: SHAPES.o2[o.k][1], mP: m, offP: SHAPES.co2[k][1], w }); }
    for (const m of hs) { const o = oAtoms[oi++]; atoms.push({ el: 'O', mR: o.m, offR: SHAPES.o2[o.k][1], mP: m, offP: SHAPES.h2o[0][1], w }); }
  }
  fuel.forEach((m, f) => { m.g = f; });
  for (const a of atoms) if (a.mR.kind === 'o2') a.mR.g = Math.max(a.mR.g, a.mP.f);      // an oxygen molecule arrives with the later of the two fuel molecules it feeds
  atoms.forEach((a) => { a.f = a.mP.f; });
  for (const m of n2) SHAPES.n2.forEach(([el, off]) => atoms.push({ el, mR: m, offR: off, mP: m, offP: off, w: null }));
  return { before, after, atoms, fuel, o2, n2, co2, h2o };
}

const rot = (m, off, tau) => {     // turn a place in the molecule by the molecule's own slow tumbling
  const a = m.a0 + m.spin * tau * 0.6 * m.slow, c = Math.cos(a), s = Math.sin(a), [x, y, z] = m.axis, d = x * off[0] + y * off[1] + z * off[2];
  return [off[0] * c + (y * off[2] - z * off[1]) * s + x * d * (1 - c), off[1] * c + (z * off[0] - x * off[2]) * s + y * d * (1 - c), off[2] * c + (x * off[1] - y * off[0]) * s + z * d * (1 - c)];
};
// Around the end of the cycle the burned gas at the spot leaves and fresh air arrives, both moving across the view.
// So that there is always gas in view, the old molecules leave a few at a time while the new ones come in behind
// them. An atom is drawn in its old molecule until that has left, then in the new one, which is still out of view.
const SHIFT = 3.2;                                           // how far out of view, in widths of the group's cube
const OUT = (f) => 680 + 10 * f, IN = (g) => 702 + 10 * g;      // the products of each fuel molecule leave, then its fuel and oxygen come in
function flowOf(m, p) {
  const pp = p < 120 ? p + 720 : p;
  if (m.kind === 'n2') return pp <= m.leave + 19 ? SHIFT * smooth(m.leave, m.leave + 18, pp) : -SHIFT * (1 - smooth(m.leave + 20, m.leave + 38, pp));
  if (m.kind === 'co2' || m.kind === 'h2o') return pp > 600 ? SHIFT * smooth(OUT(m.f), OUT(m.f) + 20, pp) : 0;
  return pp > 600 ? -SHIFT * (1 - smooth(IN(m.g), IN(m.g) + 20, pp)) : 0;
}
// A molecule's middle within the group's cube, in nm from the spot, without the flow. tau is the molecules' own clock.
function local(m, phi, tau, L) {
  const p = wrap(phi), late = m.kind === 'fuel' ? 3 * (1 - smooth(INJECT[0] + 10, INJECT[1] + 25, p < 120 ? 0 : p > 600 ? 0 : p)) * (p > 600 ? 0 : 1) : 0;   // the fuel comes in from above once it is sprayed
  return [0, 1, 2].map((i) => (m.c0[i] - 0.5 + m.amp[i] * Math.sin(m.w[i] * tau * m.slow + m.ph[i]) + (i === 1 ? late : 0)) * L);
}
// Where a molecule's middle is, in nm from the spot.
export function centre(m, phi, tau, L) { const c = local(m, phi, tau, L); c[0] += flowOf(m, wrap(phi)) * L; return c; }
// The group is repeated around itself, as many times as it takes to fill the view: gas goes on in every direction.
// Copies are turned, each its own way, so the repeat is hard to see.
const turn = (v, t, o) => {
  const s = t & 4 ? -1 : 1, k = t & 3;
  if (k === 0) { o[0] = s * v[0]; o[1] = s * v[1]; o[2] = v[2]; } else if (k === 1) { o[0] = v[1]; o[1] = s * v[2]; o[2] = s * v[0]; }
  else if (k === 2) { o[0] = s * v[2]; o[1] = v[0]; o[2] = s * v[1]; } else { o[0] = -v[0]; o[1] = s * v[2]; o[2] = s * v[1]; }
};
const turnOf = (ix, iy, iz) => { if (!(ix || iy || iz)) return 0; let h = (ix * 374761393 + iy * 668265263 + iz * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) % 8; };
export const LAYERS = 3;      // copies along the line of sight
// The copies that cover a view. box: how far the view reaches from the spot to the left, right, bottom and top (x0 x1 y0 y1,
// in nm, at the spot's own distance) and how far the eye is from the spot (dist). The farthest copies must cover a little more.
export function tiles(box, L) {
  const f = 1 + 1.5 * L / box.dist, n = (v) => Math.max(1, Math.ceil((v * f + 0.5) / L - 0.5));
  return { x0: -n(-box.x0), x1: n(box.x1), y0: -n(-box.y0), y1: n(box.y1), reach: Math.max(-box.x0, box.x1) * f };
}
export const copies = (t) => (t.x1 - t.x0 + 1) * (t.y1 - t.y0 + 1) * LAYERS;
// How far, in widths of the cube, the gas that leaves must move so that no copy of it is left in a view that reaches this far.
export const shiftFor = (reach, L) => Math.max(SHIFT, 2 * reach / L + 1.2) / SHIFT;
// Fills out (x y z radius, r g b a per atom) from the place `start` on and returns how many atoms it now holds.
// alpha is 1 (drawn fully) or less while the molecules come into view.
export function place(group, phi, tau, out, box, alpha = 1, start = 0) {
  const p = wrap(phi), L = groupEdge(phi), x = gasAt(phi).burn, t = tiles(box, L), far = shiftFor(t.reach, L), al = 1 + clamp(alpha, 0, 1);
  const memo = new Map(), v = [0, 0, 0];
  const mid = (m) => { let c = memo.get(m); if (!c) { c = local(m, phi, tau, L); memo.set(m, c); } return c; };
  let n = start;
  for (const a of group.atoms) {
    const old = a.w && p > OUT(a.f) + 20, e = a.w && !old ? smooth(a.w[0], a.w[1], x) : 0, at = ATOM[a.el];
    const cR = mid(a.mR), oR = rot(a.mR, a.offR, tau);
    let q = [cR[0] + oR[0], cR[1] + oR[1], cR[2] + oR[2]], flow = flowOf(a.mR, p);
    if (e > 0) { const cP = mid(a.mP), oP = rot(a.mP, a.offP, tau); q = [0, 1, 2].map((i) => mix(q[i], cP[i] + oP[i], e)); flow = mix(flow, flowOf(a.mP, p), e); }
    flow *= far;
    for (let ix = t.x0; ix <= t.x1; ix++) for (let iy = t.y0; iy <= t.y1; iy++) for (let iz = -1; iz <= 1; iz++) {
      const o = n * 8; turn(q, turnOf(ix, iy, iz), v);
      out[o] = v[0] + (ix + flow) * L; out[o + 1] = v[1] + iy * L; out[o + 2] = v[2] + iz * L; out[o + 3] = at.r; out[o + 4] = at.col[0]; out[o + 5] = at.col[1]; out[o + 6] = at.col[2]; out[o + 7] = al; n++;
    }
  }
  return n;
}
export const ATOMS = 2 * 26 + 25 * 2 + 94 * 2, MAX_COPIES = 330, MAX_ATOMS = MAX_COPIES * ATOMS;
