// Gears on a cube and an octahedron, the workshop: brass chips. While a tool cuts, chips fly off it and fall under
// gravity, and the ones that have landed pile up until the setup ends. Everything is worked out from the machine
// time, so dragging the time slider shows the same chips as playing does. Free-cutting brass breaks into small
// curled pieces, so each chip is a short curled strip. Where a chip comes from, which way it flies and where it
// lands are the picture's choice, not worked out from the cut.
import { grow } from './mesh.js?v=6ca5dca9';

const G = 9810;                 // mm/s², down
const PER_S = 60;               // chips a second of playing time
const FLY = 0.6;                // the longest a chip is drawn in the air, in seconds of playing time
const PILE = 700;               // at most this many chips lie in the pile
const rnd = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };

// the times while cutting, for one setup: [t0, t1] of every pass whose step turns the spindle
export function cutting(plan, tl, op) {
  const out = [];
  for (const q of tl.segs) if (q.op === op && plan[op].steps[q.step].rpm > 0) out.push([q.t0, q.t1]);
  return out;
}

// spans: from cutting(); t: machine time; rate: machine seconds per second of playing time;
// src: { at, vel(i) -> [vx, vy, vz] mm/s, size } where chips come off now; up: the world's up axis (1: y, 2: z);
// floor(p): the height a chip stops at, at point p; pile(i) -> { p, size } where the i-th landed chip lies
export function chipMesh({ spans, t, rate, src, up, floor, pile }) {
  const g = grow(), dt = rate / PER_S, life = FLY * rate;
  let made = 0;
  // the chips in the air: made in the last moment, at the tool, flying out and falling
  if (src) for (const [a, b] of spans) {
    if (b < t - life || a > t) continue;
    for (let i = Math.ceil(Math.max(a, t - life) / dt); i * dt <= Math.min(b, t); i++) {
      const s = (t - i * dt) / rate, v = src.vel(i), p = src.at.map((x, k) => x + v[k] * s - (k === up ? G * s * s / 2 : 0));
      if (p[up] < floor(p)) continue;
      chip(g, p, src.size * (0.6 + 0.6 * rnd(i, 3)), i, s * 40);
    }
  }
  // the pile: one chip for every so many made so far
  for (const [a, b] of spans) { if (a > t) break; made += (Math.min(b, t) - a) / dt; }
  const n = Math.min(PILE, Math.floor(made / 2));
  for (let i = 0; i < n; i++) { const q = pile(i); chip(g, q.p, q.size * (0.6 + 0.6 * rnd(i, 3)), i + 7919, 0); }
  return g;
}

// one chip: a strip bent round a little more than half a turn, turned every way by its number i, tumbling by spin
function chip(g, c, size, i, spin) {
  const r = size * 0.45, w = size * 0.35, arc = 2.2 + 1.2 * rnd(i, 4), N = 5;
  const ax = [rnd(i, 5) - 0.5, rnd(i, 6) - 0.5, rnd(i, 7) - 0.5], l = Math.hypot(...ax) || 1, k = ax.map((x) => x / l);
  const ang = rnd(i, 8) * 6.283 + spin;
  // a turn by ang about k (Rodrigues), as a function
  const co = Math.cos(ang), si = Math.sin(ang);
  const rot = (v) => { const d = k[0] * v[0] + k[1] * v[1] + k[2] * v[2], x = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
    return [0, 1, 2].map((j) => v[j] * co + x[j] * si + k[j] * d * (1 - co)); };
  const ids = [];
  for (let s = 0; s <= N; s++) {
    const a = -arc / 2 + arc * s / N, ca = Math.cos(a), sa = Math.sin(a), z = (s / N - 0.5) * w * 0.8;   // a little twist along it
    const n = rot([ca, sa, 0]);
    for (const e of [-1, 1]) { const p = rot([r * ca, r * sa, e * w / 2 + z]); ids.push(g.v([c[0] + p[0], c[1] + p[1], c[2] + p[2]], n, [6, 0, 0])); }
  }
  for (let s = 0; s < N; s++) { const a = ids[2 * s], b = ids[2 * s + 1], d = ids[2 * s + 2], e = ids[2 * s + 3]; g.I.push(a, b, e, a, e, d); }
}
export { rnd };
