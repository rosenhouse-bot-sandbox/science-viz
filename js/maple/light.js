// The dots of sunlight that fall through the cut leaf at the Tissue and Cells scales, in micrometres. No WebGL, so Node
// can test it (tests/maple/model.mjs).
//
// Each dot stands for a little sunlight of one wavelength. It sets out with a lot drawn for how far it gets (an optical
// depth, from the exponential law, which does not depend on the pigments). As it reaches the top of each layer, the tall
// cells and then the loose cells, the pigments of the date shown decide: it is taken in there if its lot is used up in that
// layer, by chlorophyll or carotenoids at a chloroplast or by anthocyanin in a vacuole, with the chances the model gives
// that wavelength (model.js, thickness). The rest comes out underneath. So when the date changes, a dot keeps an old fate
// for at most the time it takes to cross one layer.
//
// How many dots fall goes with the light reaching the leaf on that date (k, a share of the year's most: lightAt in
// model.js). A dot that has finished waits before it sets out again: not at all in the most light of the year, longer
// the less light there is.
import { thickness, wavelengthRGB, bright, encode, clamp, mix } from './model.js?v=4d18d95f';
import { rng } from './gl.js?v=4d18d95f';

// how many at most, where along the wall, from and to what height, micrometres a second, a dot's radius, seconds a flash lasts;
// where a dot meets the tall cells and the loose cells (the leaf's layers: tall cells 41 um tall above its middle, loose cells from 27 um below it)
export const DOT = { n: 120, x: [-75, 155], top: 62, end: -128, v: 27, r: 2.7, die: 0.45, tall: 41 / 2 - 1.5, loose: -27 + 3 };
export const SHARE = { chl: 0.7, car: 0.7, anth: 0.83 };  // how much of each pigment is in the tall cells; the rest is in the loose cells below
export const PIGS = ['chl', 'car', 'anth'];
const FALL = (DOT.top + 15 - DOT.end) / DOT.v;             // about how long a dot takes to fall through
// The chance that a waiting dot sets out in the next dt seconds, when the light is k of the year's most and a dot is in flight for `fall` seconds.
export const wakeChance = (dt, k, fall) => k >= 1 ? 1 : k <= 0 ? 0 : 1 - Math.exp(-dt * k / ((1 - k) * fall));

// lane: the front row of cells, { tall: [...], loose: [...] }, each { x, y, z0, z1, plast: [[x, y, z], ...] }. lightNow(): k.
export function makeSunlight(lane, lightNow, seed = 311) {
  const RS = rng(seed), beams = Array.from({ length: DOT.n }, () => ({ idle: true }));
  const nearest = (list, x) => { let b = list[0]; for (const c of list) if (Math.abs(c.x - x) < Math.abs(b.x - x)) b = c; return b; };
  function fresh(b) {                                      // a dot sets out above the leaf, over one of the front row of tall cells, in line with its chloroplasts
    b.idle = false; b.l = 400 + 300 * RS(); b.c = bright(wavelengthRGB(b.l), 1.7).map(encode); b.dying = 0; b.kind = ''; b.stage = 0;
    const cell = nearest(lane.tall, mix(DOT.x[0], DOT.x[1], RS())), c = cell.plast[Math.floor(RS() * cell.plast.length)];
    b.cell = cell; b.x = c[0] + (RS() - 0.5) * 1.2; b.y = c[1]; b.z = b.z0 = DOT.top + RS() * 30; b.end = DOT.end;
    b.u = -Math.log(1 - RS()); b.pick = RS();
  }
  // The dot reaches the top of a layer (stage 0: the tall cells, 1: the loose cells): whether it is taken in there is decided now.
  function meet(b, p) {
    const up = b.stage === 0, t = thickness(p, b.l), part = PIGS.map((k) => t[k] * (up ? SHARE[k] : 1 - SHARE[k])), sum = part[0] + part[1] + part[2];
    b.stage = up ? 1 : 2;
    if (b.u >= sum) { b.u -= sum; return; }                // it gets through this layer
    let r = b.pick * sum, k = 0; while (k < 2 && r >= part[k]) { r -= part[k]; k++; }
    b.kind = PIGS[k]; b.stage = 2;
    if (up) {
      const cell = b.cell, depth = mix(DOT.tall, -DOT.tall, b.u / sum);
      if (k === 2) b.end = clamp(depth, cell.z0, cell.z1);
      else { let c = cell.plast[0], best = 1e9; for (const q of cell.plast) { const e = Math.abs(q[2] - depth) + 0.5 * Math.abs(q[0] - b.x); if (e < best) { best = e; c = q; } } b.end = c[2] + (RS() - 0.5) * 2; }
    } else {
      const cell = nearest(lane.loose, b.x);
      if (k === 2) b.end = cell.z0 + (RS() - 0.5) * 5;
      else { let c = cell.plast[0]; for (const q of cell.plast) if (Math.abs(q[0] - b.x) < Math.abs(c[0] - b.x)) c = q; b.end = c[2] + (RS() - 0.5) * 2; }
    }
    b.end = Math.min(b.end, b.z);
  }
  let started = false;
  // Moves the light on by dt seconds. p: the followed leaf's pigments. onOut(b): called for each dot that comes out under the leaf.
  function step(dt, p, onOut) {
    if (!started) { started = true; for (const b of beams) if (RS() < lightNow()) fresh(b); for (let i = 0; i < 400; i++) step(0.05 * (0.5 + RS()), p); }   // run on unseen first, so that the light is already falling all the way down when it is first shown
    const w = wakeChance(dt, lightNow(), FALL);
    for (const b of beams) {
      if (b.idle) { if (RS() < w) fresh(b); continue; }
      if (b.dying) { b.dying += dt / DOT.die; if (b.dying >= 1) b.idle = true; continue; }
      b.z -= dt * DOT.v;
      if (b.stage === 0 && b.z <= DOT.tall) meet(b, p);
      if (b.stage === 1 && b.z <= DOT.loose) meet(b, p);
      if (b.z > b.end) continue;
      if (b.kind && p[b.kind] > 0.001) { b.z = b.end; b.dying = 1e-6; } else if (b.kind) { b.kind = ''; b.end = DOT.end; } else { b.idle = true; if (onOut) onOut(b); }
    }
  }
  return { beams, step };
}
