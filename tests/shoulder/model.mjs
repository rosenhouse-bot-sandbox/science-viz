// Shoulder: checks of the model at many arm positions, with no browser. node tests/shoulder/model.mjs [count]
// It samples arm positions at random (seeded, so a failure can be replayed with the same seed) and fails if:
//  - a muscle at rest is not exactly the muscle fitted to the scans;
//  - the shoulder blade enters the ribs, or the arm bone comes nearer the acromion than the model allows;
//  - a muscle point is pushed into a bone it was not in at rest (more than a few, by more than 1 mm);
//  - a muscle folds back on itself along its length, or its length leaves a believable range;
//  - the bursa is not on the tendon's outer side, or impingement lights anything with the arm at rest;
//  - a muscle lengthens or shortens the wrong way for a movement whose direction is textbook knowledge
//    (turning out shortens infraspinatus and teres minor and lengthens subscapularis; turning in the reverse;
//    lifting the arm out to the side shortens supraspinatus and the middle deltoid).
import { model } from './load.mjs';
import { CLEAR, ROTS } from '../../js/shoulder/model.js';
import { V } from '../../js/shoulder/geom.js';

const N = +(process.argv[2] || 120), SEED = +(process.env.SEED || 7);
let seed = SEED; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const fails = []; const fail = (what, P) => { fails.push(`${what}  at ${JSON.stringify(P)}`); };
const pts = (f) => Array.from({ length: f.length / 3 }, (_, i) => [f[3 * i], f[3 * i + 1], f[3 * i + 2]]);
const HC = model.marks.HC;

// 1. at rest, every muscle is its fitted shape
{
  const T = model.pose({ elev: 0, plane: 30, rot: 0, elbow: 0 });
  for (const b of model.built) {
    const p = pts(model.muscle(b, T).pos); let worst = 0;
    p.forEach((q, i) => { worst = Math.max(worst, V.len(V.sub(q, b.rest[i]))); });
    if (worst > 1e-3) fail(`${b.id} at rest is ${worst.toFixed(3)} mm from its fitted shape`, { elev: 0 });
  }
}

// 2. random arm positions
const centers = (b, pos) => b.sl.map((_, i) => { let m = [0, 0, 0]; for (let j = 0; j < 32; j++) m = V.add(m, [pos[3 * (i * 32 + j)], pos[3 * (i * 32 + j) + 1], pos[3 * (i * 32 + j) + 2]]); return V.mul(m, 1 / 32); });
let worstNew = {}, lens = {};
for (let n = 0; n < N; n++) {
  const P = { elev: Math.round(rnd() * 150), plane: [0, 30, 90][Math.floor(rnd() * 3)], rot: Math.round(ROTS[0] + rnd() * (ROTS.at(-1) - ROTS[0])), elbow: 90 };
  const T = model.pose(P);
  if (model.ribPen({ scapula: T.scapula, clavicle: T.clavicle }) > 0) fail('the shoulder blade is in the ribs', P);
  const g = model.gap(T).mm; if (g < CLEAR - 0.05) fail(`gap ${g.toFixed(2)} mm, under ${CLEAR}`, P);
  for (const b of model.built) {
    const m = model.muscle(b, T), p = pts(m.pos);
    if (p.some((q) => q.some((x) => !Number.isFinite(x)))) { fail(`${b.id} has a corner that is not a number`, P); continue; }
    const r = m.length / m.rest; (lens[b.id] ||= []).push(r);
    if (r < 0.6 || r > 1.6) fail(`${b.id} length ${r.toFixed(2)} of rest`, P);
    // folds: the line through the slices' middles never turns back on itself
    const c = centers(b, m.pos);
    for (let i = 2; i < c.length; i++) { const a = V.sub(c[i - 1], c[i - 2]), d = V.sub(c[i], c[i - 1]); if (V.len(a) > 0.3 && V.len(d) > 0.3 && V.dot(V.norm(a), V.norm(d)) < -0.2) { fail(`${b.id} folds back at slice ${i}`, P); break; } }
    // new points inside bone
    let deep = 0;
    for (const k of Object.keys(model.SOL)) { const f = model.SOL[k], inv = model.invT(T[k]); p.forEach((q, i) => { if (!b.restIn[k][i] && f.depth(applyT(inv, q)) > 1) deep++; }); }
    worstNew[b.id] = Math.max(worstNew[b.id] || 0, deep / p.length);
    if (deep / p.length > 0.02) fail(`${b.id}: ${(100 * deep / p.length).toFixed(1)}% of its corners are more than 1 mm inside a bone they were not in at rest`, P);
  }
}
function applyT(T, p) { return V.add([V.dot(T.R[0], p), V.dot(T.R[1], p), V.dot(T.R[2], p)], T.t); }

// 3. the bursa lies on the tendon's outer side, and nothing is pressed at rest
{
  const T = model.pose({ elev: 0, plane: 30, rot: 0, elbow: 0 }), su = model.built[0], bu = model.bursa(0.8);
  const bp = pts(model.muscle(bu, T).pos), sp = pts(model.muscle(su, T).pos);
  const far = (ps) => ps.reduce((a, q) => a + V.len(V.sub(q, HC)), 0) / ps.length;
  const tendon = sp.filter((_, i) => su.t[i] > 0.62);
  if (far(bp) <= far(tendon)) fail('the bursa is not on the outer side of the tendon', { elev: 0 });
  const m = model.muscle(su, T); if (m.pressed.some((x) => x > 0)) fail('impingement lights the tendon with the arm at rest', { elev: 0 });
}

// 4. which way each muscle's length goes, against textbook directions
const len = (P) => Object.fromEntries(model.built.map((b) => { const m = model.muscle(b, model.pose({ elbow: 90, ...P })); return [b.id, m.length / m.rest]; }));
const rest = len({ elev: 0, plane: 30, rot: 0 }), out = len({ elev: 0, plane: 30, rot: 60 }), inn = len({ elev: 0, plane: 30, rot: -60 }), abd = len({ elev: 90, plane: 0, rot: 0 });
const want = [
  ['turning out shortens infraspinatus', out.infra < rest.infra], ['turning out shortens teres minor', out.tminor < rest.tminor], ['turning out lengthens subscapularis', out.subscap > rest.subscap],
  ['turning in lengthens infraspinatus', inn.infra > rest.infra], ['turning in lengthens teres minor', inn.tminor > rest.tminor], ['turning in shortens subscapularis', inn.subscap < rest.subscap],
  ['lifting out to the side shortens supraspinatus', abd.supra < rest.supra], ['lifting out to the side shortens the middle deltoid', abd.deltM < rest.deltM],
];
for (const [what, ok] of want) if (!ok) fail(what + ' (it does not)', {});

console.log(`${N} random arm positions, seed ${SEED}`);
for (const b of model.built) { const l = lens[b.id]; console.log(`  ${b.id.padEnd(8)} length ${Math.min(...l).toFixed(2)} to ${Math.max(...l).toFixed(2)} of rest; worst new points in bone ${(100 * worstNew[b.id]).toFixed(1)}%`); }
console.log(`  at rest, out 60°, in 60°, out to the side 90°: ` + ['infra', 'tminor', 'subscap', 'supra', 'deltM'].map((k) => `${k} ${rest[k].toFixed(2)}/${out[k].toFixed(2)}/${inn[k].toFixed(2)}/${abd[k].toFixed(2)}`).join(', '));
if (fails.length) { console.log(`\n${fails.length} failed:`); for (const f of fails.slice(0, 40)) console.log('  ' + f); process.exit(1); }
console.log('all passed');
