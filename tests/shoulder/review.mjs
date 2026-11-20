// Gabe's check: every built muscle against the scan of the same muscle (BodyParts3D), at rest.
// A muscle fails if more than 5% of either surface lies over 3 mm from the other, any point of the built
// surface lies over 6 mm from the scan, or its volume differs by more than 10%. The built surface is measured
// over its whole area (its corners and 8000 points spread over its faces), not only at its corners. No browser
// needed; about two minutes.
//
//   node tests/shoulder/review.mjs
import fs from 'node:fs';
import path from 'node:path';
import { bandMesh } from '../../js/shoulder/geom.js';
import { surfDist, volume, samples, windings } from './fit.mjs';

const root = path.resolve(import.meta.dirname, '../..');
export function unpack(json, bin) {
  const out = {};
  for (const m of json.meshes) {
    const q = new Uint16Array(bin.buffer, bin.byteOffset + m.off, m.nv * 3), ix = new Uint16Array(bin.buffer, bin.byteOffset + m.off + m.nv * 6, m.ni);
    const v = []; for (let j = 0; j < m.nv; j++) v.push([0, 1, 2].map((i) => m.lo[i] + q[3 * j + i] / 65535 * (m.hi[i] - m.lo[i])));
    out[m.name] = { v, f: Array.from(ix) };
  }
  return out;
}
export const scans = unpack(JSON.parse(fs.readFileSync(path.join(root, 'tests/shoulder/data/scans.json'))), fs.readFileSync(path.join(root, 'tests/shoulder/data/scans.bin')));
export const built = JSON.parse(fs.readFileSync(path.join(root, 'shoulder/data/muscles.json'))).muscles;

if (import.meta.url !== `file://${process.argv[1]}`) { /* imported */ } else run();
export function gridVolume(v, f, h = 1.5) {
  const lo = [0, 1, 2].map((i) => Math.min(...v.map((p) => p[i]))), hi = [0, 1, 2].map((i) => Math.max(...v.map((p) => p[i])));
  const G = [];
  for (let x = lo[0] + h / 2; x < hi[0]; x += h) for (let y = lo[1] + h / 2; y < hi[1]; y += h) for (let z = lo[2] + h / 2; z < hi[2]; z += h) G.push([x, y, z]);
  return windings(G, v, f).filter((w) => Math.abs(w) > 0.5).length * h ** 3;
}
function run() {
const LIMIT = { p95: 3, max: 6, vol: 10 };
let bad = 0;
const q = (a, p) => a[Math.floor(p * (a.length - 1))];
console.log('muscle     mean   95%    max   scan95  volume');
for (const [n, bands] of Object.entries(built)) {
  const P = [], idx = [], parts = []; let vb = 0;
  for (const sl of bands) {
    const m = bandMesh({ sl }), o = P.length, Q = [];
    for (let i = 0; i < m.pos.length; i += 3) Q.push([m.pos[i], m.pos[i + 1], m.pos[i + 2]]);
    P.push(...Q); for (const x of m.idx) idx.push(x + o);
    parts.push({ v: Q, f: m.idx });
  }
  // Points on the built surface: every corner, and 8000 spread over each band. A point the built muscle itself
  // encloses (where its surface folds over itself, or where two bands meet) cannot be seen and is not part of
  // its outer surface: its winding number is about 1 or more, against 1/2 on the outside.
  const all = [...P, ...parts.flatMap((b) => samples(b, 8000))];
  const wn = windings(all, P, idx), pts = all.filter((p, i) => Math.abs(wn[i]) < 0.8);
  const d = surfDist(pts, scans[n]).sort((a, b) => a - b), back = surfDist(scans[n].v, { v: P, f: idx }).sort((a, b) => a - b);
  // the built muscle's volume is what it encloses at least once: counted on a 1.5 mm grid
  vb = gridVolume(P, idx);
  const vs = volume(scans[n].v, scans[n].f), dv = (vb - vs) / vs * 100, mean = d.reduce((a, b) => a + b, 0) / d.length;
  const fails = [];
  if (q(d, 0.95) > LIMIT.p95) fails.push('built surface off the scan');
  if (d[d.length - 1] > LIMIT.max) fails.push('a spot over 6 mm off');
  if (q(back, 0.95) > LIMIT.p95) fails.push('part of the scan missed');
  if (Math.abs(dv) > LIMIT.vol) fails.push('volume');
  if (fails.length) bad++;
  console.log(n.padEnd(9), mean.toFixed(2).padStart(5), q(d, 0.95).toFixed(2).padStart(5), d[d.length - 1].toFixed(2).padStart(6), q(back, 0.95).toFixed(2).padStart(7), ((dv > 0 ? '+' : '') + dv.toFixed(1) + '%').padStart(7), fails.length ? 'FAIL: ' + fails.join(', ') : 'ok');
}
if (bad) { console.error(`${bad} muscle(s) do not match their scans`); process.exit(1); }
console.log('every built muscle matches its scan');
}
