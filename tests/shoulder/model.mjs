// Shoulder: checks of the model at many arm positions, with no browser. node tests/shoulder/model.mjs [count]
// It samples arm positions at random (seeded, so a failure can be replayed with the same seed) and fails if:
//  - a muscle at rest is not exactly the muscle fitted to the scans;
//  - the shoulder blade or the arm enters the ribs, or the arm bone comes nearer the acromion than the model allows;
//  - a muscle point is pushed into a bone it was not in at rest (more than a few, by more than 1 mm);
//  - a muscle folds back on itself along its length, or its length leaves a believable range;
//  - the bursa is not on the tendon's outer side, or impingement lights anything with the arm at rest;
//  - a muscle lengthens or shortens the wrong way for a movement whose direction is textbook knowledge
//    (turning out shortens infraspinatus and teres minor and lengthens subscapularis; turning in the reverse;
//    lifting the arm out to the side shortens supraspinatus and the middle deltoid; taking it back shortens the back of
//    the deltoid; turning it out with the arm forward shortens infraspinatus);
//  - any of these fails at a pose that an exercise passes through, or where one muscle pulling alone takes the arm;
//  - one muscle pulling alone moves the arm another way than the sources say it does, or lengthens along its pull.
import { model, bones } from './load.mjs';
import { solid } from '../../js/shoulder/solid.js';
import { CLEAR, ROTS, closest } from '../../js/shoulder/model.js';
import { V } from '../../js/shoulder/geom.js';
import { EX_POSE } from '../../js/shoulder/exercises.js';

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
const poses = [];
for (let n = 0; n < N; n++) {
  // the planes worked out (0, 30, 90), and every fourth position a plane between them or a little past 90 (the pendulum)
  poses.push({ elev: Math.round(rnd() * 150), plane: n % 4 === 3 ? Math.round(rnd() * 102) : [0, 30, 90][Math.floor(rnd() * 3)], rot: Math.round(ROTS[0] + rnd() * (ROTS.at(-1) - ROTS[0])), elbow: 90 });
}
// and every exercise through its round, which reaches planes the random ones do not (back, and across the body)
for (const [ex, f] of Object.entries(EX_POSE)) for (let k = 0; k < 24; k++) poses.push({ ex, ...f(k / 24) });
// and where one muscle pulling alone takes the arm (model.contract), from a spread of starting poses
const STARTS = [{ elev: 0, plane: 30, rot: 0 }, { elev: 0, plane: 30, rot: -60 }, { elev: 0, plane: 30, rot: 60 }, { elev: 90, plane: 30, rot: 0 }, { elev: 150, plane: 30, rot: 0 },
  ...Object.entries(EX_POSE).map(([ex, f]) => ({ ex, ...f(0.5) }))];
const pulls = [];
for (const S of STARTS) for (const b of model.built) {
  const path = model.contract(b, { elbow: 90, ...S }); pulls.push({ b, S, path });
  for (const k of [Math.floor((path.length - 1) / 2), path.length - 1]) if (k > 0) poses.push({ pull: b.id, ...path[k], len: undefined });
}
// the chest's bones, and every tenth point of the arm's, for checking that the arm stays out of the chest
const CHEST = ['rib1', 'rib2', 'rib3', 'rib4', 'rib5', 'rib6', 'rib7', 'manubrium', 'sternum'].map((r) => solid(bones[r], 1));
const every = (b) => { const p = bones[b].pos, o = []; for (let i = 0; i < p.length; i += 30) o.push([p[i], p[i + 1], p[i + 2]]); return o; };
const ARM = { humerus: every('humerus'), forearm: [...every('radius'), ...every('ulna')] };
for (const P of poses) {
  const T = model.pose(P);
  const inChest = Object.entries(ARM).reduce((n, [k, ps]) => n + ps.filter((q) => CHEST.some((c) => c.depth(applyT(T[k], q)) > 1)).length, 0);
  if (inChest) fail(`the arm is in the chest (${inChest} points)`, P);
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
  // the bursa lies on the tendon as posed, whatever the condition: no corner of its underside more than 2 mm from the
  // tendon's top face (it once lifted off at a high lift, and a worn tendon came up through it)
  const su = model.built[0];
  for (const [cond, shape] of [['healthy', null], ['tendinopathy', (t) => (t > 0.72 ? { thick: 1.5 } : null)]]) {
    const tp = pts(model.muscle(su, T, shape ? { shape } : {}).pos), bu = model.bursa(0.8), tris = [];
    for (let i = Math.floor(0.6 * (su.S - 1)); i + 1 < su.S; i++) for (let j = 0; j + 1 < 16; j++) { const a = tp[i * 32 + j], b = tp[i * 32 + j + 1], c = tp[(i + 1) * 32 + j], d = tp[(i + 1) * 32 + j + 1]; tris.push([a, b, c], [b, d, c]); }
    // its underside within the tendon's width (past the edges it carries on beyond the tendon)
    const bp = pts(model.bursaOn(bu, tp.flat()).pos).filter((_, i) => bu.at[i].cap === undefined && !bu.at[i].top && bu.at[i].s > 0.1 && bu.at[i].s < 0.9);
    const off = Math.max(...bp.map((q) => Math.min(...tris.map(([a, b, c]) => V.len(V.sub(q, closest(q, a, b, c)))))));
    if (off > 2) fail(`the bursa (${cond}) is ${off.toFixed(1)} mm off the tendon`, P);
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
const back = len({ elev: 25, plane: -90, rot: 0, elbow: 0 }), fwd90 = len({ elev: 90, plane: 90, rot: 0, elbow: 0 }), side90 = len({ elev: 90, plane: 0, rot: 0, elbow: 0 });
const fwdIn = len({ elev: 90, plane: 90, rot: -80 }), fwdOut = len({ elev: 90, plane: 90, rot: 0 });
const want = [
  ['turning out shortens infraspinatus', out.infra < rest.infra], ['turning out shortens teres minor', out.tminor < rest.tminor], ['turning out lengthens subscapularis', out.subscap > rest.subscap],
  ['turning in lengthens infraspinatus', inn.infra > rest.infra], ['turning in lengthens teres minor', inn.tminor > rest.tminor], ['turning in shortens subscapularis', inn.subscap < rest.subscap],
  ['lifting out to the side shortens supraspinatus', abd.supra < rest.supra], ['lifting out to the side shortens the middle deltoid', abd.deltM < rest.deltM],
  // the movements the newer exercises add: the arm back, from forward to out to the side at shoulder height, and turning
  // out with the arm forward
  ['the arm back shortens the back of the deltoid', back.deltP < rest.deltP], ['the arm back lengthens the front of the deltoid', back.deltA > rest.deltA],
  ['forward to out at shoulder height shortens the back of the deltoid', side90.deltP < fwd90.deltP], ['forward to out at shoulder height lengthens the front of the deltoid', side90.deltA > fwd90.deltA],
  ['turning out with the arm forward shortens infraspinatus', fwdOut.infra < fwdIn.infra], ['turning out with the arm forward lengthens subscapularis', fwdOut.subscap > fwdIn.subscap],
];
// 5. one muscle pulling alone, from the arm hanging, moves it the way the sources say that muscle does; and along
// every pull the muscle only ever shortens
const end = Object.fromEntries(pulls.filter((p) => p.S === STARTS[0]).map((p) => [p.b.id, p.path.at(-1)]));
want.push(
  ['the supraspinatus lifts the arm out to the side', end.supra.elev > 20 && Math.abs(end.supra.plane) < 60],
  ['the infraspinatus turns the arm out', end.infra.rot > 20], ['the teres minor turns the arm out', end.tminor.rot > 20],
  ['the subscapularis turns the arm in', end.subscap.rot < -20],
  ['the front of the deltoid lifts the arm forward and turns it in', end.deltA.elev > 15 && end.deltA.plane > 45 && end.deltA.plane < 135 && end.deltA.rot < 0],
  ['the middle of the deltoid lifts the arm out to the side', end.deltM.elev > 20 && Math.abs(end.deltM.plane) < 30],
  ['the back of the deltoid takes the arm back and turns it out', end.deltP.elev > 10 && end.deltP.plane < -45 && end.deltP.rot > 0]);
for (const { b, S, path } of pulls) {
  if (path.some((q, i) => i && q.len > path[i - 1].len + 1e-6)) fail(`${b.id} lengthens somewhere along its own pull`, S);
  if (S === STARTS[0] && path.length < 30) fail(`${b.id} pulls the arm only ${path.length - 1}° from hanging`, S);
}
for (const [what, ok] of want) if (!ok) fail(what + ' (it does not)', {});

console.log(`${N} random arm positions, seed ${SEED}, and ${poses.length - N} from the exercises`);
for (const b of model.built) { const l = lens[b.id]; console.log(`  ${b.id.padEnd(8)} length ${Math.min(...l).toFixed(2)} to ${Math.max(...l).toFixed(2)} of rest; worst new points in bone ${(100 * worstNew[b.id]).toFixed(1)}%`); }
console.log(`  at rest, out 60°, in 60°, out to the side 90°: ` + ['infra', 'tminor', 'subscap', 'supra', 'deltM'].map((k) => `${k} ${rest[k].toFixed(2)}/${out[k].toFixed(2)}/${inn[k].toFixed(2)}/${abd[k].toFixed(2)}`).join(', '));
if (fails.length) { console.log(`\n${fails.length} failed:`); for (const f of fails.slice(0, 40)) console.log('  ' + f); process.exit(1); }
console.log('all passed');
