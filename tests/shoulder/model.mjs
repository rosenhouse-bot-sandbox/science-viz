// Shoulder: checks of the model at many arm positions, with no browser. node tests/shoulder/model.mjs [count]
// (SHOW=1000 lists that many failures, not the first 40.)
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
//  - one muscle pulling alone moves the arm another way than the sources say it does, or lengthens along its pull;
//  - one muscle pulling alone on a lifted arm drops it further than its measured leverage allows;
//  - a muscle's leverage points more than 20° away from the measured leverage, on average over the measured poses, or
//    is under 0.8 or over 1.35 times its size (Axford 2024, tests/shoulder/axford.mjs);
//  - a muscle's length changes by more than 1.5 mm for one degree of the arm (no real muscle has that much leverage);
//  - the subscapularis's middle line passes more than 3 mm inside the shoulder blade;
//  - slices of a muscle lean over (a face turned more than LEAN.deg further from square to the muscle's middle line
//    than it is at rest) in more than LEAN.share of the muscles and poses tried, or a muscle's drawn volume leaves
//    VOL.hard of its volume at rest anywhere, or VOL.soft in more than VOL.share of them (the deltoid only up to a lift
//    of TIE_FADE[0]: above that its parts are drawn as their lines have them, and the test prints how they lean; and a
//    part drawn much narrower loses volume, since it is never drawn more than THICK times as thick);
//  - too many corners of one muscle are inside another (PARTS), at the poses where the parts of the deltoid once crossed
//    (for two parts of the deltoid, only up to a lift of TIE_FADE[0]: above that the model lets them overlap, and the
//    test prints how much);
//  - a gap opens between two parts of the deltoid: a slice of one stands more than PARTS.gap mm further from the
//    surface of the part beside it than at rest (the deltoid is one sheet);
//  - a slice of the deltoid is drawn more than PARTS.thick times as thick as at rest (it would stand up as a lobe);
//  - the healthy supraspinatus tendon is drawn thinner than THIN of its thickness under the acromion, with the arm
//    in the plane of the shoulder blade and turned 0° or 30° out;
//  - the bursa has a fold (a bend over BURSA.bend along it) or a corner deeper than BURSA.deep in bone, at those turns,
//    and turned 60° in or out up to a lift of 90°;
//    (These limits are what the model reaches, not what a shoulder does. Slices still lean and parts still overlap
//    in some poses, and with the arm high and turned in the tendon is still pressed and the bursa still folds.)
//  - the gap goes under what the model allows while the front or the middle of the deltoid pulls alone and the ball
//    rides up (as main.js poses it);
//  - a muscle that an exercise's words say does the work is not shorter half way through it than at its start;
//  - the arm bone's middle line comes nearer the ribs than RIB_FAR in an exercise (the bone is inside the arm);
//  - the sleeper stretch does not start with the forearm across the chest.
import { model, bones } from './load.mjs';
import { solid } from '../../js/shoulder/solid.js';
import { CLEAR, ROTS, closest, TIE_FADE, THICK } from '../../js/shoulder/model.js';
import { V } from '../../js/shoulder/geom.js';
import { EX_POSE } from '../../js/shoulder/exercises.js';
import { EXERCISES } from '../../js/shoulder/facts.js';
import { measured, inRange, DIAM } from './axford.mjs';
import { leverage, asVector } from './isb.mjs';

const N = +(process.argv[2] || 120), SEED = +(process.env.SEED || 7);
let seed = SEED; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const fails = []; const fail = (what, P) => { fails.push(`${what}  at ${JSON.stringify(P)}`); };
const pts = (f) => Array.from({ length: f.length / 3 }, (_, i) => [f[3 * i], f[3 * i + 1], f[3 * i + 2]]);
const HC = model.marks.HC;
// the limits of the shape checks (9 to 14 below)
const LEAN = { deg: 25, share: 0.06 }, VOL = { hard: [0.65, 1.18], soft: [0.88, 1.14], share: 0.02 }, PARTS = { share: 0.12, deep: 2, gap: 4, thick: 1.35 }, THIN = 0.5, BURSA = { bend: 110, deep: 1.5 }, RIB_FAR = 38;
const deg = (c) => Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
const ringOf = (p, i) => p.slice(i * 32, i * 32 + 32);
// the way a slice faces: the normal of its outline
const facing = (r) => { const m = V.mean(r); let A = [0, 0, 0]; for (let j = 0; j < r.length; j++) A = V.add(A, V.cross(V.sub(r[j], m), V.sub(r[(j + 1) % r.length], m))); return V.norm(A); };
// how far each slice's face is turned from square to the middle line, in degrees
const leans = (b, p) => { const c = b.sl.map((_, i) => V.mean(ringOf(p, i))); return c.map((_, i) => (i < 1 || i > c.length - 2 ? 0 : deg(Math.abs(V.dot(facing(ringOf(p, i)), V.norm(V.sub(c[i + 1], c[i - 1]))))))); };
const volumeOf = (p, idx) => { let v = 0; for (let i = 0; i < idx.length; i += 3) v += V.dot(p[idx[i]], V.cross(p[idx[i + 1]], p[idx[i + 2]])) / 6; return Math.abs(v); };
const AT_REST = {};

// 1. at rest, every muscle is its fitted shape
{
  const T = model.pose({ elev: 0, plane: 30, rot: 0, elbow: 0 });
  for (const b of model.built) {
    const p = pts(model.muscle(b, T).pos); let worst = 0;
    p.forEach((q, i) => { worst = Math.max(worst, V.len(V.sub(q, b.rest[i]))); });
    if (worst > 1e-3) fail(`${b.id} at rest is ${worst.toFixed(3)} mm from its fitted shape`, { elev: 0 });
    AT_REST[b.id] = { lean: leans(b, p), vol: volumeOf(p, b.mesh.idx), p };
  }
}

// 2. random arm positions
const centers = (b, pos) => b.sl.map((_, i) => { let m = [0, 0, 0]; for (let j = 0; j < 32; j++) m = V.add(m, [pos[3 * (i * 32 + j)], pos[3 * (i * 32 + j) + 1], pos[3 * (i * 32 + j) + 2]]); return V.mul(m, 1 / 32); });
let worstNew = {}, lens = {}; const worstLean = {}, vols = {}, tally = { n: 0, lean: 0, vol: 0 }, high = { n: 0, lean: 0, vol: 9 };
const poses = [];
for (let n = 0; n < N; n++) {
  // the planes worked out (0, 30, 90), and every fourth position a plane between them or a little past 90 (the pendulum)
  poses.push({ elev: Math.round(rnd() * 150), plane: n % 4 === 3 ? Math.round(rnd() * 102) : [0, 30, 90][Math.floor(rnd() * 3)], rot: Math.round(ROTS[0] + rnd() * (ROTS.at(-1) - ROTS[0])), elbow: 90 });
}
// and every exercise through its round, which reaches planes the random ones do not (back, and across the body)
for (const [ex, f] of Object.entries(EX_POSE)) for (let k = 0; k < 24; k++) poses.push({ ex, ...f(k / 24) });
// and where one muscle pulling alone takes the arm (model.contract), from a spread of starting poses
const STARTS = [{ elev: 0, plane: 30, rot: 0 }, { elev: 0, plane: 30, rot: -60 }, { elev: 0, plane: 30, rot: 60 }, { elev: 90, plane: 30, rot: 0 }, { elev: 150, plane: 30, rot: 0 }, { elev: 120, plane: 30, rot: 0 },
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
    // 9. slices stay square to the muscle's line, and the muscle keeps its volume
    // (the deltoid above a lift of TIE_FADE[0] is drawn as its lines have it, without the ties: counted apart and printed)
    const ln = leans(b, p), over = Math.max(...ln.map((x, i) => x - AT_REST[b.id].lean[i])), vr = volumeOf(p, b.mesh.idx) / AT_REST[b.id].vol;
    if (b.cuff === false && P.elev > TIE_FADE[0]) { high.n++; if (over > LEAN.deg) high.lean++; high.vol = Math.min(high.vol, vr); continue; }
    worstLean[b.id] = Math.max(worstLean[b.id] || 0, over);
    tally.n++; if (over > LEAN.deg) tally.lean++;
    (vols[b.id] ||= []).push(vr);
    if (vr < VOL.soft[0] || vr > VOL.soft[1]) tally.vol++;
    if (vr < VOL.hard[0] || vr > VOL.hard[1]) fail(`${b.id}: its drawn volume is ${vr.toFixed(2)} of its volume at rest`, P);
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
if (tally.lean / tally.n > LEAN.share) fail(`in ${(100 * tally.lean / tally.n).toFixed(0)}% of the muscles and poses tried a slice leans more than ${LEAN.deg}° further than at rest (the limit is ${100 * LEAN.share}%)`, {});
if (tally.vol / tally.n > VOL.share) fail(`in ${(100 * tally.vol / tally.n).toFixed(1)}% of the muscles and poses tried the drawn volume is outside ${VOL.soft.join(' to ')} of rest (the limit is ${100 * VOL.share}%)`, {});
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
// a muscle that lifts does so from its first degrees (every pull from hanging once began by only turning the arm:
// poseOf could not tell which way a lift of under half a degree went)
const early = Object.fromEntries(pulls.filter((p) => p.S === STARTS[0]).map((p) => [p.b.id, p.path[Math.min(5, p.path.length - 1)]]));
for (const id of ['supra', 'deltA', 'deltM', 'deltP']) want.push([`${id} moves the hanging arm away from the body within its first 5°`, early[id].elev > 3]);
// the front of the deltoid still lifts an arm that is turned in as far as it goes (the pull once stopped dead at a limit)
{ const e = pulls.find((p) => p.S === STARTS[1] && p.b.id === 'deltA').path.at(-1); want.push(['the front of the deltoid lifts an arm that is turned in 60°', e.elev > 15 && e.rot > -61]); }
// a muscle with nowhere to go does not creep (the subscapularis with the arm turned in as far as it goes)
{ const pth = pulls.find((p) => p.S === STARTS[1] && p.b.id === 'subscap').path; want.push(['the subscapularis stays put with the arm turned in 60°', pth.length < 4]); }
// the deltoid turns the arm about its length far less than the cuff does (Hik and Ackland 2019, pooled leverage:
// back of the deltoid 7 mm, infraspinatus 25 mm). Its slices once went round the arm with every turn, which made
// the back of it as strong a turner as the infraspinatus.
{ const mmOf = (id, P) => { const b = model.built.find((x) => x.id === id); return model.length(b, model.pose({ elbow: 90, plane: 30, elev: 0, ...P })) * b.L0; };
  const turn = (id) => Math.abs(mmOf(id, { rot: 20 }) - mmOf(id, { rot: -20 }));
  for (const id of ['deltA', 'deltM', 'deltP']) want.push([`turning the hanging arm changes the length of ${id} less than half as much as the infraspinatus's`, turn(id) < 0.5 * turn('infra')]); }
for (const { b, S, path } of pulls) {
  if (path.some((q, i) => i && q.len > path[i - 1].len + 1e-6)) fail(`${b.id} lengthens somewhere along its own pull`, S);
  if (S === STARTS[0] && path.length < 30) fail(`${b.id} pulls the arm only ${path.length - 1}° from hanging`, S);
}
// With the arm lifted, the infraspinatus, the teres minor and the back of the deltoid have little leverage for lowering
// it (Ackland 2008, Axford 2024): pulling alone, each mostly turns the arm or takes it back. They once dropped it
// 10° to 25°, because a muscle's bend followed the bone's turn and not a taut line.
for (const [S, least] of [[STARTS[3], { infra: 88, tminor: 80, deltP: 78 }], [STARTS[5], { infra: 115, tminor: 105, deltP: 103 }]]) for (const [id, lo] of Object.entries(least)) {
  const e = pulls.find((p) => p.S === S && p.b.id === id).path.at(-1); want.push([`${id} pulling alone from a lift of ${S.elev}° leaves the arm above ${lo}° (it ends at ${e.elev.toFixed(0)}°)`, e.elev >= lo]);
}
for (const [what, ok] of want) if (!ok) fail(what + ' (it does not)', {});

// 6. each muscle's leverage against the measured leverage (Axford 2024), over the poses that were measured: the same
// joint angles, the shoulder blade still, the measured figures scaled to this ball. Leverage has a direction (the axis
// the muscle turns the arm about) and a size; the direction is compared from 20° of elevation up, because below that
// the plane and the turn are nearly one angle.
const AXFORD = { supra: ['Supra'], infra: ['Infra'], tminor: ['TMinor'], subscap: ['SubSup', 'SubInf'], deltA: ['AntDelt'], deltM: ['LatDelt'], deltP: ['PostDelt'] };
const against = {};
for (const b of model.built) {
  const names = AXFORD[b.id]; if (!names) continue;
  let ang = 0, size = 0, n = 0;
  for (const E of [20, 30, 40, 50, 60]) for (const P of [-20, 0, 20, 40, 60]) for (const f of [0.15, 0.5, 0.85]) {
    const R = -0.5 * P - 50 + 60 * f; if (!inRange(E, P, R)) throw new Error('a pose outside the measured range');
    const m = measured(E, P, R), their = {}; for (const k of ['elev', 'plane', 'rot']) their[k] = (2 * model.headR / DIAM) * names.reduce((s, x) => s + m[k][x], 0) / names.length;
    const a = asVector(leverage(b, E, P, R), E, P), t = asVector(their, E, P);
    ang += Math.acos(Math.max(-1, Math.min(1, V.dot(a, t) / (V.len(a) * V.len(t))))) * 180 / Math.PI; size += V.len(a) / V.len(t); n++;
  }
  against[b.id] = { ang: ang / n, size: size / n };
  if (ang / n > 20) fail(`${b.id}: its leverage points ${(ang / n).toFixed(0)}° away from the measured leverage, on average`, {});
  if (size / n < 0.8 || size / n > 1.35) fail(`${b.id}: its leverage is ${(size / n).toFixed(2)} times the measured leverage, on average`, {});
}

// 7. no jumps: one degree of the arm never changes a muscle's length by more than 1.5 mm (that would be 86 mm of
// leverage, twice the ball's width). A taut line over a ball can flip to the ball's other side; this catches it.
const jump = {};
{
  const mmOf = (b, P) => model.lineMm(b, model.pose({ ...P, elbow: 90, quick: true }));
  for (let elev = 0; elev <= 149; elev += 10) for (let plane = -30; plane <= 100; plane += 10) for (let rot = -60; rot <= 89; rot += 10) for (const b of model.built) {
    if (b.id === 'bursa') continue;
    const P = { elev, plane, rot }, l0 = mmOf(b, P);
    for (const k of ['elev', 'plane', 'rot']) { const d = Math.abs(mmOf(b, { ...P, [k]: P[k] + 1 }) - l0); jump[b.id] = Math.max(jump[b.id] || 0, d); if (!(d <= 1.5)) fail(`${b.id} changes length by ${d.toFixed(1)} mm for one degree of ${k}`, P); }
  }
}

// 8. the subscapularis lies on the front of the shoulder blade, so its middle line must not pass through the blade
{
  const b = model.built.find((x) => x.id === 'subscap'), sol = model.SOL.scapula; let worst = 0;
  for (const elev of [0, 30, 60, 90, 120, 150]) for (const plane of [-30, 0, 30, 60, 90]) for (const rot of [-60, -30, 0, 30, 60, 90]) {
    const P = { elev, plane, rot, elbow: 90 }, T = model.pose({ ...P, quick: true }), inv = model.invT(T.scapula);
    const d = Math.max(...model.lineOf(b, T).map((p) => sol.depth(applyT(inv, p)))); worst = Math.max(worst, d);
    if (d > 3) fail(`the subscapularis's middle line is ${d.toFixed(1)} mm inside the shoulder blade`, P);
  }
  jump.subscapInBlade = worst;
}

// 10. parts that lie side by side do not share space: at the poses where the parts of the deltoid, and the
// infraspinatus and teres minor, once ran through each other, no more than PARTS.share of one part's corners are more
// than PARTS.deep mm inside another part
const shape = { parts: 0, partsAt: '', high: 0, highAt: '', gap: 0, gapAt: '', thick: 0, thickAt: '', thin: 9, bend: 0, deep: 0, pullGap: 9, rib: 1e9, ribAt: '' };
const DELT = ['deltA', 'deltM', 'deltP'];
for (const [elev, plane, rot, elbow = 90] of [[60, 30, 0], [90, 30, 0], [90, 30, 60], [150, 30, 0], [25, -90, 0], [0, 30, 60], [90, 90, 0], [90, 0, 90], [35, 105, -90, 45], [90, 90, -90], [30, -90, 0, 0]]) {
  const P = { elev, plane, rot, elbow }, T = model.pose(P), at = model.built.map((b) => { const m = model.muscle(b, T); return { b, p: pts(m.pos), sol: solid({ pos: m.pos, idx: b.mesh.idx }, 1.5) }; });
  for (const x of at) for (const y of at) if (x !== y) {
    const n = x.p.filter((q) => y.sol.depth(q) > PARTS.deep).length / x.p.length;
    if (DELT.includes(x.b.id) && DELT.includes(y.b.id) && elev > TIE_FADE[0]) { if (n > shape.high) { shape.high = n; shape.highAt = `${x.b.id} in ${y.b.id} at lift ${elev}`; } continue; }
    if (n > shape.parts) { shape.parts = n; shape.partsAt = `${x.b.id} in ${y.b.id} at lift ${elev}, plane ${plane}, turn ${rot}`; }
    if (n > PARTS.share) fail(`${(100 * n).toFixed(0)}% of the corners of ${x.b.id} are more than ${PARTS.deep} mm inside ${y.b.id}`, P);
  }
}
// 10b. the deltoid is one sheet: no gap opens between its parts, and no part of it stands up as a lobe. A slice's gap
// is 0 if a corner of it is inside the other part, and otherwise how far its nearest corner is from the other part's
// surface (its triangles); its thickness is the furthest its top face stands from its bottom face. Both against rest,
// over the middle of the part (20% to 90% of its length: at the ends the parts are fixed to bone, apart).
{
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.hypot(a[0], a[1], a[2]);
  const triD = (p, a, b, c) => {                                    // from a point to a triangle (Ericson, Real-Time Collision Detection 5.1.5)
    const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap); if (d1 <= 0 && d2 <= 0) return len(ap);
    const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp); if (d3 >= 0 && d4 <= d3) return len(bp);
    const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) return len(sub(ap, V.mul(ab, d1 / (d1 - d3))));
    const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp); if (d6 >= 0 && d5 <= d6) return len(cp);
    const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) return len(sub(ap, V.mul(ac, d2 / (d2 - d6))));
    const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return len(sub(bp, V.mul(sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6)))));
    const den = 1 / (va + vb + vc); return len(sub(ap, V.add(V.mul(ab, vb * den), V.mul(ac, vc * den))));
  };
  const B = Object.fromEntries(model.built.map((b) => [b.id, b]));
  const inc = Object.fromEntries(DELT.map((id) => { const idx = B[id].mesh.idx, m = Array.from({ length: B[id].rest.length }, () => []); for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) m[idx[t + k]].push(t); return [id, m]; }));
  const gaps = (x, px, y, py) => { const idx = B[y].mesh.idx, so = solid({ pos: new Float32Array(py.flat()), idx }, 1.5);
    return Array.from({ length: B[x].S }, (_, i) => { const near = [];
      for (let j = 0; j < 32; j++) { const q = px[i * 32 + j]; if (so.depth(q) > 0.3) return 0; let d = 1e9; for (const r of py) d = Math.min(d, len(sub(q, r))); near.push([d, q]); }
      near.sort((a, b) => a[0] - b[0]); let best = 1e9;
      for (const [d, q] of near.slice(0, 4)) { const tris = new Set(); py.forEach((r, v) => { if (len(sub(q, r)) < d + 10) for (const t of inc[y][v]) tris.add(t); }); for (const t of tris) best = Math.min(best, triD(q, py[idx[t]], py[idx[t + 1]], py[idx[t + 2]])); }
      return best; }); };
  const segD = (q, a, b) => { const e = sub(b, a), l2 = dot(e, e), f = l2 > 1e-9 ? Math.max(0, Math.min(1, dot(sub(q, a), e) / l2)) : 0; return len(sub(q, V.add(a, V.mul(e, f)))); };
  const thick = (p, i) => { let m = 0; for (let j = 1; j < 15; j++) { let d = 1e9; for (let k = 16; k < 31; k++) d = Math.min(d, segD(p[i * 32 + j], p[i * 32 + k], p[i * 32 + k + 1])); m = Math.max(m, d); } return m; };
  const PAIRS = [['deltA', 'deltM'], ['deltM', 'deltA'], ['deltP', 'deltM'], ['deltM', 'deltP']];
  const G0 = PAIRS.map(([x, y]) => gaps(x, AT_REST[x].p, y, AT_REST[y].p)), H0 = Object.fromEntries(DELT.map((id) => [id, B[id].sl.map((_, i) => thick(AT_REST[id].p, i))]));
  const mid = (b, i) => i >= 0.2 * b.S && i <= 0.9 * b.S;
  const list = [[60, 30, 0], [90, 30, 0], [90, 30, 60], [90, 30, -60], [90, 30, -30], [90, 30, 30], [105, 30, 0], [120, 30, 0], [135, 30, 0], [150, 30, 0], [150, 30, -30], [149, 30, 20], [145, 30, -51],
    [25, -90, 0], [0, 30, 60], [90, 90, 0], [90, 0, 90], [35, 105, -90, 45], [90, 90, -90], [90, 90, -130], [30, -90, 0, 0]].map(([elev, plane, rot, elbow = 90]) => ({ elev, plane, rot, elbow }));
  for (const f of Object.values(EX_POSE)) for (const ph of [0, 0.25, 0.5]) list.push(f(ph));
  const seen = new Set();
  for (const P of list) {
    const key = JSON.stringify(P); if (seen.has(key)) continue; seen.add(key);
    const T = model.pose(P), M = Object.fromEntries(DELT.map((id) => [id, pts(model.muscle(B[id], T).pos)])), where = `at lift ${P.elev.toFixed(0)}, plane ${P.plane.toFixed(0)}, turn ${P.rot.toFixed(0)}`;
    PAIRS.forEach(([x, y], k) => { let worst = 0; gaps(x, M[x], y, M[y]).forEach((g, i) => { if (mid(B[x], i)) worst = Math.max(worst, g - G0[k][i]); });
      if (worst > shape.gap) { shape.gap = worst; shape.gapAt = `${x} from ${y} ${where}`; }
      if (worst > PARTS.gap) fail(`a gap opens between ${x} and ${y}: ${worst.toFixed(1)} mm more than at rest`, P); });
    for (const id of DELT) { let worst = 0; B[id].sl.forEach((_, i) => { if (mid(B[id], i) && H0[id][i] > 2) worst = Math.max(worst, thick(M[id], i) / H0[id][i]); });
      if (worst > shape.thick) { shape.thick = worst; shape.thickAt = `${id} ${where}`; }
      if (worst > PARTS.thick) fail(`${id} is drawn ${worst.toFixed(2)} times as thick as at rest (a lobe)`, P); }
  }
}
// 11. the healthy tendon keeps its thickness under the acromion, and the bursa on it has no fold and is not in bone
{
  const su = model.built[0], th = (p, i, j) => V.len(V.sub(p[i * 32 + j], p[i * 32 + 31 - j])), p0 = AT_REST.supra.p;
  for (const rot of [-60, 0, 30, 60]) for (let elev = 0; elev <= (Math.abs(rot) > 30 ? 90 : 150); elev += 15) {
    const P = { elev, plane: 30, rot, elbow: 90 }, T = model.pose(P), m = model.muscle(su, T), p = pts(m.pos);
    if (rot === 0 || rot === 30) {
      let thin = 9; for (let i = Math.round(0.72 * (su.S - 1)); i < su.S - 2; i++) for (let j = 3; j <= 12; j++) thin = Math.min(thin, th(p, i, j) / th(p0, i, j));
      shape.thin = Math.min(shape.thin, thin);
      if (thin < THIN) fail(`the healthy supraspinatus tendon is drawn ${thin.toFixed(2)} of its thickness`, P);
    }
    for (const mm of [0.8, 3]) {
      const bu = model.bursa(mm), bp = pts(model.bursaOn(bu, m.pos, T).pos); let bend = 0, deep = 0;
      for (let j = 2; j < 14; j++) for (let i = 2; i < bu.S; i++) { const a = V.sub(bp[(i - 1) * 32 + j], bp[(i - 2) * 32 + j]), d = V.sub(bp[i * 32 + j], bp[(i - 1) * 32 + j]); if (V.len(a) > 0.2 && V.len(d) > 0.2) bend = Math.max(bend, deg(V.dot(V.norm(a), V.norm(d)))); }
      for (const k of ['scapula', 'humerus']) { const inv = model.invT(T[k]); for (const q of bp) deep = Math.max(deep, model.SOL[k].depth(applyT(inv, q))); }
      shape.bend = Math.max(shape.bend, bend); shape.deep = Math.max(shape.deep, deep);
      if (bend > BURSA.bend) fail(`the bursa (${mm} mm) has a fold of ${bend.toFixed(0)}°`, P);
      if (deep > BURSA.deep) fail(`the bursa (${mm} mm) is ${deep.toFixed(1)} mm inside bone`, P);
    }
  }
}
// 12. the gap holds while the front or the middle of the deltoid pulls alone and the ball rides up 3 mm with the
// pull, as main.js poses it (poseNow)
for (const { b, S, path } of pulls) {
  if (!['deltA', 'deltM'].includes(b.id) || S.ex) continue;
  path.forEach((q, i) => {
    if (i % 2 && i !== path.length - 1) return;
    const g = model.gap(model.pose({ elev: q.elev, plane: q.plane, rot: q.rot, elbow: 90, up: 3 * i / Math.max(1, path.length - 1) })).mm; shape.pullGap = Math.min(shape.pullGap, g);
    if (g < CLEAR - 0.05) fail(`gap ${g.toFixed(2)} mm at step ${i} of the pull of ${b.id}, with the ball riding up`, S);
  });
}
// 13. in an exercise whose words say which muscles do the work, each of them is shorter half way through than at the start
for (const ex of EXERCISES) {
  if (ex.role !== 'works' || !EX_POSE[ex.id]) continue;
  const at = (ph) => { const T = model.pose(EX_POSE[ex.id](ph)); return Object.fromEntries(ex.works.map((id) => [id, model.length(model.built.find((b) => b.id === id), T)])); };
  const a = at(0), h = at(0.5);
  for (const id of ex.works) if (!(h[id] < a[id])) fail(`${ex.name}: ${id} is marked as working and is not shorter half way (${a[id].toFixed(3)} to ${h[id].toFixed(3)})`, {});
}
// 14. the arm bone is inside the arm, so in an exercise its middle line (below the ball) stays RIB_FAR mm from the
// ribs; and the sleeper stretch starts with the forearm across the chest (pointing toward the body's middle line)
{
  const RIBP = []; for (const r of ['rib1', 'rib2', 'rib3', 'rib4', 'rib5', 'rib6', 'rib7', 'sternum', 'manubrium']) { const p = bones[r].pos; for (let i = 0; i < p.length; i += 9) RIBP.push([p[i], p[i + 1], p[i + 2]]); }
  const EL = model.marks.EL, axis = [0.3, 0.45, 0.6, 0.75, 0.9, 1].map((f) => V.add(HC, V.mul(V.sub(EL, HC), f)));
  for (const [ex, f] of Object.entries(EX_POSE)) for (let k = 0; k < 12; k++) {
    const P = f(k / 12), T = model.pose(P); let near = 1e9;
    for (const a of axis) { const q = applyT(T.humerus, a); for (const r of RIBP) near = Math.min(near, V.len(V.sub(q, r))); }
    if (near < shape.rib) { shape.rib = near; shape.ribAt = `${ex} at ${(k / 12).toFixed(2)}`; }
    if (near < RIB_FAR) fail(`${ex}: the arm bone's middle line is ${near.toFixed(0)} mm from the ribs`, P);
  }
  // the forearm's direction: from the elbow to the far end of the radius
  const rp = pts(bones.radius.pos), wrist = rp.reduce((a, q) => (V.len(V.sub(q, EL)) > V.len(V.sub(a, EL)) ? q : a));
  const T = model.pose(EX_POSE.sleeper(0)), dir = V.norm(V.sub(applyT(T.forearm, wrist), applyT(T.forearm, EL)));
  const mid = V.norm([-HC[0], 0, 0]);                              // from the shoulder toward the body's middle line
  if (V.dot(dir, mid) < 0.8) fail(`the sleeper stretch starts with the forearm ${deg(V.dot(dir, mid)).toFixed(0)}° from across the chest`, EX_POSE.sleeper(0));
}

console.log(`${N} random arm positions, seed ${SEED}, and ${poses.length - N} from the exercises`);
for (const b of model.built) { const l = lens[b.id]; console.log(`  ${b.id.padEnd(8)} length ${Math.min(...l).toFixed(2)} to ${Math.max(...l).toFixed(2)} of rest; worst new points in bone ${(100 * worstNew[b.id]).toFixed(1)}%`); }
console.log('  leverage against measured (Axford 2024): ' + Object.entries(against).map(([id, a]) => `${id} ${a.ang.toFixed(0)}° off, ${a.size.toFixed(2)} times`).join('; '));
console.log('  largest change of length for one degree: ' + model.built.filter((b) => b.id !== 'bursa').map((b) => `${b.id} ${jump[b.id].toFixed(2)} mm`).join(', ') + `; the subscapularis's line at most ${jump.subscapInBlade.toFixed(1)} mm inside the blade`);
console.log(`  a slice leans over ${LEAN.deg}° more than at rest in ${(100 * tally.lean / tally.n).toFixed(1)}% of muscles and poses, and the volume is outside ${VOL.soft.join(' to ')} in ${(100 * tally.vol / tally.n).toFixed(1)}%`);
console.log('  slices lean at most (more than at rest): ' + model.built.map((b) => `${b.id} ${worstLean[b.id].toFixed(0)}°`).join(', ') + '; volume of rest: ' + model.built.map((b) => `${b.id} ${Math.min(...vols[b.id]).toFixed(2)} to ${Math.max(...vols[b.id]).toFixed(2)}`).join(', '));
console.log(`  the deltoid above a lift of ${TIE_FADE[0]}°: a slice leans over ${LEAN.deg}° more than at rest in ${(100 * high.lean / Math.max(1, high.n)).toFixed(0)}% of parts and poses; smallest volume ${high.vol.toFixed(2)} of rest`);
console.log(`  most of one part inside another: ${(100 * shape.parts).toFixed(0)}% (${shape.partsAt}); two parts of the deltoid above a lift of ${TIE_FADE[0]}°: ${(100 * shape.high).toFixed(0)}% (${shape.highAt}); widest gap between parts of the deltoid, more than at rest: ${shape.gap.toFixed(1)} mm (${shape.gapAt}); thickest slice of the deltoid: ${shape.thick.toFixed(2)} of rest (${shape.thickAt}; the model's limit is ${THICK}); healthy tendon thinnest ${shape.thin.toFixed(2)} of rest; bursa's sharpest bend ${shape.bend.toFixed(0)}°, deepest in bone ${shape.deep.toFixed(1)} mm; smallest gap in a pull with the ball riding up ${shape.pullGap.toFixed(2)} mm; arm bone nearest the ribs in an exercise ${shape.rib.toFixed(0)} mm (${shape.ribAt})`);
console.log(`  at rest, out 60°, in 60°, out to the side 90°: ` + ['infra', 'tminor', 'subscap', 'supra', 'deltM'].map((k) => `${k} ${rest[k].toFixed(2)}/${out[k].toFixed(2)}/${inn[k].toFixed(2)}/${abd[k].toFixed(2)}`).join(', '));
if (fails.length) { console.log(`\n${fails.length} failed:`); for (const f of fails.slice(0, +(process.env.SHOW || 40))) console.log('  ' + f); process.exit(1); }
console.log('all passed');
