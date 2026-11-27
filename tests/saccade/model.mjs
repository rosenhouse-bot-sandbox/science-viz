// Checks the Overshoot saccades model against what the sources say, in Node (no browser):
//  - saccade timing and top speed against measured ranges (the main sequence);
//  - pursuit gain as measured comes out as the gain that was set;
//  - at every speed of the target from 5 to 40°/s: no saccade overshoots with the measured sizing rule, nearly all do
//    with the overshoot setting, poor pursuit makes many more saccades, and healthy pursuit of a learned swing neither
//    lags nor needs a saccade back at a turn;
//  - every saccade's kind fits its definition (where it started and landed, against the target, judged by the scatter
//    of a landing of its size);
//  - a new speed of the swing is learned again, faster or slower;
//  - the trace steps only at saccades, and breaks where the target turns round;
//  - a saccade to a still target starts about 200 ms after the target jumps, and lands on it;
//  - each muscle turns the eye the textbook way, and gets shorter when the eye turns its way;
//  - no muscle path goes into the eye; the eyes do not twist about the line of sight (Listing's law);
//  - no two muscles' bodies share space, and where two cross the right one rides over the other;
//  - the nerve signals: a burst to the muscle that turns the eye, a pause in the one that opposes it,
//    and the same signal to the two muscles that turn the two eyes the same way (Hering's law);
//  - two runs give the same result.
//
//   node tests/saccade/model.mjs
import * as M from '../../js/saccade/model.js';
const { makeSim, duration, peakSpeed, PULL, MUSCLES, musclePath, listing, eyeGaze, onScreen, turnOf, rate, EYE_R, CATCHUP, PURSUIT, NEURON, STEP, learnTime } = M;
// the share of its size by which a saccade may miss the target's middle and still count as on it
const landTol = M.landTol || (() => NaN);
import { staleStamp } from '../stamp.mjs';

let fails = 0;
const fail = (what) => { fails++; console.log('FAIL ' + what); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

{ const e = staleStamp('saccade'); if (e) fail(e); }

// ---- the main sequence: measured humans make a 10° saccade in about 40 to 60 ms at 300 to 500°/s [collewijn, bahill]
for (const [a, d0, d1, v0, v1] of [[1, 20, 35, 50, 120], [5, 30, 45, 200, 350], [10, 40, 60, 300, 500], [20, 60, 90, 400, 650]]) {
  const d = duration(a) * 1000, v = peakSpeed(a);
  if (d < d0 || d > d1) fail(`a ${a}° saccade lasts ${d.toFixed(0)} ms, outside ${d0} to ${d1} ms`);
  if (v < v0 || v > v1) fail(`a ${a}° saccade peaks at ${v.toFixed(0)}°/s, outside ${v0} to ${v1}°/s`);
}

// ---- pursuit and the saccades it needs, at every speed the slider offers
// The four stories on the page must be true wherever the slider stands. Each case runs until the swing is learned
// (one swing) and the eyes have settled (one more), then for 30 s.
//  - With the measured sizing rule, saccades land on the target or a little short of it [amplitude]: none is an
//    overshoot saccade, at any speed, with healthy or poor pursuit. Poor pursuit alone does not make saccades overshoot.
//  - With the page's "overshoot" setting nearly every saccade starts behind and lands ahead, at any speed.
//  - Poor pursuit needs many more saccades than healthy pursuit.
//  - Healthy pursuit of a learned swing does not lag, and needs no saccade back toward the target at a turn.
const runs = {}, SPEEDS = []; for (let v = 5; v <= 40; v++) SPEEDS.push(v);
// how far the eyes' smooth speed runs behind gain × the target's speed, in ms, over the last `win` seconds
function lagOf(m, win = 1) {
  const g = PURSUIT.gain[m.s.cond], n = Math.round(win / STEP); let best = 0, err = Infinity;
  for (let L = 0; L <= 200; L += 2) { let e = 0; for (let j = m.s.k - n; j <= m.s.k; j += 5) e += (m.B.ph[m.at(j)] - g * m.B.vth[m.at(j - L)]) ** 2; if (e < err) { err = e; best = L; } }
  return best;
}
for (const speed of SPEEDS) for (const sacc of ['accurate', 'overshoot']) for (const cond of ['healthy', 'poor']) {
  const m = makeSim({ cond, sacc, speed }), key = `${cond} ${sacc} ${speed}`; m.advance(2 * learnTime(speed)); const t0 = m.s.t; m.advance(30);
  const ev = m.s.events.filter((e) => e.t0 > t0), g = m.gain(), kinds = {};
  for (const e of ev) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
  const amp = ev.reduce((a, e) => a + e.amp, 0) / Math.max(1, ev.length);
  runs[key] = { ev, g, kinds, amp };
  if (g === null || !near(g, PURSUIT.gain[cond], 0.02)) fail(`${key}: pursuit measures a gain of ${g?.toFixed(3)}, set to ${PURSUIT.gain[cond]}`);
  const over = (kinds.overshoot || 0) / Math.max(1, ev.length);
  if (sacc === 'accurate' && kinds.overshoot) fail(`${key}: ${kinds.overshoot} of ${ev.length} saccades overshoot with the measured sizing rule`);
  if (sacc === 'overshoot' && over < 0.9) fail(`${key}: only ${kinds.overshoot || 0} of ${ev.length} saccades overshoot with the overshoot setting`);
  if (!ev.length) fail(`${key}: no saccade in 30 s`);
  const lag = lagOf(m);
  if (lag > 10) fail(`${key}: pursuit of a learned swing runs ${lag} ms behind the target`);
  if (cond === 'healthy' && kinds.backup) fail(`${key}: healthy pursuit of a learned swing made ${kinds.backup} saccades back toward the target`);
  const h = runs[`healthy ${sacc} ${speed}`];
  if (cond === 'poor' && ev.length < 3 * h.ev.length) fail(`${key}: poor pursuit makes ${ev.length} saccades, healthy pursuit ${h.ev.length}: not many more`);
  if (cond === 'poor' && sacc === 'overshoot' && (kinds.overshoot || 0) < 3 * (h.kinds.overshoot || 0)) fail(`${key}: ${kinds.overshoot} overshoot saccades, healthy pursuit ${h.kinds.overshoot}: not many more`);
  if (cond === 'poor' && h.amp > amp) fail(`${key}: saccades are smaller (${amp.toFixed(2)}°) than with healthy pursuit (${h.amp.toFixed(2)}°)`);
  // each kind fits its definition, and a saccade with the measured rule that starts behind lands on the target or a little short
  for (const e of ev) {
    if (!near(e.t1 - e.t0, e.D, 2 * STEP)) fail(`a saccade lasted ${((e.t1 - e.t0) * 1000).toFixed(1)} ms, not its ${(e.D * 1000).toFixed(1)} ms`);
    if (!near(e.tol, landTol(e.amp), 1e-12) || !near(e.tol, CATCHUP.scatter * e.amp, 1e-12)) fail('a saccade is not judged by the scatter of a landing of its size');
    if (!['overshoot', 'catchup', 'anticipatory', 'backup'].includes(e.kind)) continue;
    const dir = Math.sign(e.Tv0[0]) || 1, behind = (e.T0[0] - e.E0[0]) * dir, ahead = (e.E1[0] - e.T1[0]) * dir, along = e.A[0] * dir;
    if (e.kind === 'overshoot' && !(behind > e.tol && ahead > e.tol)) fail(`${key}: an overshoot saccade started ${behind.toFixed(2)}° behind and landed ${ahead.toFixed(2)}° ahead`);
    if (e.kind === 'catchup' && !(behind > e.tol && ahead <= e.tol + 1e-9)) fail(`${key}: a catch-up saccade landed ${ahead.toFixed(2)}° ahead`);
    if (e.kind === 'catchup' && sacc === 'accurate' && -ahead > 0.25 * e.amp) fail(`${key}: a ${e.amp.toFixed(2)}° saccade landed ${(-ahead).toFixed(2)}° short: more than a little`);
    if (e.kind === 'backup' && along >= 0) fail('a back-up saccade went the same way as the target');
  }
}
{
  const row = (k) => { const r = runs[k]; return `${k}: gain ${r.g.toFixed(2)}, mean size ${r.amp.toFixed(2)}° ${JSON.stringify(r.kinds)}`; };
  console.log('pursuit, 30 s of a learned swing:\n ' + [5, 20, 40].flatMap((v) => ['healthy accurate', 'poor accurate', 'healthy overshoot', 'poor overshoot'].map((c) => row(`${c} ${v}`))).join('\n '));
}

// ---- the first two swings at a speed. From the moment the swing is learned (one full swing) no saccade overshoots
// with the measured sizing rule, as the page's stories say. With the overshoot setting most saccades overshoot from the start.
for (const speed of SPEEDS) for (const cond of ['healthy', 'poor']) {
  const a = makeSim({ cond, sacc: 'accurate', speed }); a.advance(2 * learnTime(speed));
  const late = a.s.events.filter((e) => e.t0 > learnTime(speed) && e.kind === 'overshoot');
  if (late.length) fail(`${cond} accurate ${speed}: ${late.length} saccades overshoot in the swing after the swing is learned (the first ${(late[0].t0 - learnTime(speed)).toFixed(2)} s after)`);
  const o = makeSim({ cond, sacc: 'overshoot', speed }); o.advance(2 * learnTime(speed));
  const n = o.s.events.filter((e) => e.kind === 'overshoot').length;
  if (n <= o.s.events.length / 2) fail(`${cond} overshoot ${speed}: ${n} of ${o.s.events.length} saccades overshoot in the first two swings: not most`);
}

// ---- what is learned belongs to one swing: a new speed, faster or slower, is learned again over one swing
for (const to of [5, 30]) {
  const m = makeSim({ cond: 'healthy', speed: 20 }); m.advance(2 * learnTime(20));
  if (lagOf(m) > 10) fail(`the swing at 20°/s is not learned after two swings`);
  m.set({ speed: to }); m.advance(Math.min(1.5, 0.8 * learnTime(to)));
  const l0 = lagOf(m); if (l0 < 80) fail(`20 to ${to}°/s: just after the change pursuit runs ${l0} ms behind, as if the new swing were known already`);
  m.advance(learnTime(to)); const l1 = lagOf(m); if (l1 > 10) fail(`20 to ${to}°/s: one swing after the change pursuit still runs ${l1} ms behind`);
}

// ---- the trace: ahead (+) or behind (-) along the way the target moves. It may change only as fast as the eye and
// the target move, so its only steps are saccades. Where the target turns round the line is broken and the turn marked.
for (const [cond, sacc, speed] of [['healthy', 'accurate', 20], ['healthy', 'overshoot', 20], ['poor', 'overshoot', 20], ['healthy', 'overshoot', 40], ['poor', 'accurate', 5], ['poor', 'overshoot', 40]]) {
  const m = makeSim({ cond, sacc, speed }), key = `${cond} ${sacc} ${speed}`;
  if (typeof m.trace !== 'function') { fail('the model does not make the trace, so nothing checks it'); break; }
  let turns = 0;
  for (let i = 0; i < 12; i++) {
    m.advance(i ? 1.7 : 0.9); const tr = m.trace(2, 1), kOf = (t) => m.s.k - Math.round((m.s.t - t) / STEP);
    let pts = 0;
    for (const line of tr.lines) for (let q = 1; q < line.length; q++) {
      const k = kOf(line[q][0]), J = m.at(k), J0 = m.at(k - 1), d = Math.abs(line[q][1] - line[q - 1][1]); pts++;
      const moved = Math.abs(m.B.eh[J] - m.B.eh[J0]) + Math.abs(m.B.th[J] - m.B.th[J0]);
      if (d > moved + 1e-4) { fail(`${key}: the trace changes by ${d.toFixed(2)}° in 1 ms at ${line[q][0].toFixed(3)} s while the eye and the target move ${moved.toFixed(3)}°`); break; }
      if (d > 0.02 && !m.B.sac[J] && !m.B.sac[J0] && speed <= 20) { fail(`${key}: the trace steps by ${d.toFixed(2)}° at ${line[q][0].toFixed(3)} s with no saccade`); break; }
    }
    if (pts + tr.lines.length < Math.min(m.s.k - 1, 2000)) fail(`${key}: the trace has ${pts + tr.lines.length} points for 2 s`);
    if (tr.lines.length !== tr.turns.length + 1) fail(`${key}: ${tr.lines.length} pieces of line for ${tr.turns.length} turns`);
    for (const t of tr.turns) { turns++; const T = m.B.th[m.at(kOf(t))]; if (Math.abs(Math.abs(T) - 12) > 0.01) fail(`${key}: a turn is marked with the target at ${T.toFixed(2)}°, not at the end of its swing`); }
    for (const [t, a] of tr.dots) if (!m.s.events.some((e) => e.kind === 'overshoot' && e.t1 === t && e.ahead === a)) fail(`${key}: a dot on the trace is not an overshoot saccade`);
  }
  const want = m.s.t * speed / 12 / Math.PI;    // turns so far: one each half swing
  if (Math.abs(turns - want * 2 / 1.7) > 0.25 * want * 2 / 1.7 + 2) fail(`${key}: ${turns} turns marked on the trace in ${m.s.t.toFixed(0)} s, about ${(want * 2 / 1.7).toFixed(0)} expected`);
}

// ---- a jump of the target, as in a clinic's saccade test: the first saccade starts about 200 ms later. With the
// measured rule it lands a little short [leigh]; with the overshoot setting it goes past (hypermetria). A second,
// smaller saccade then brings the eyes onto the target.
for (const [sacc, first] of [['accurate', 'short'], ['overshoot', 'past']]) {
  const m = makeSim({ cond: 'healthy', sacc, auto: false }); m.advance(0.5); const t0 = m.s.t;
  m.place([10, 0]); m.advance(1.5);
  const ev = m.s.events.filter((x) => x.t0 > t0), e = ev[0];
  if (!e) { fail(`${sacc}: no saccade to a target that jumped`); continue; }
  const lat = (e.t0 - t0) * 1000;
  if (lat < 180 || lat > 260) fail(`${sacc}: a saccade to a still target started ${lat.toFixed(0)} ms after it jumped`);
  if (e.kind !== first) fail(`${sacc}: the first saccade to a still target was "${e.kind}", not "${first}"`);
  if (ev.length < 2) fail(`${sacc}: no second saccade corrected the first`);
  if (Math.abs(m.s.E[0] - 10) > CATCHUP.peMin + 1e-6) fail(`${sacc}: after a jump to 10°, the eyes ended at ${m.s.E[0].toFixed(2)}°`);
}
// a tap while the target is moving is also a jump to a still target. A saccade already planned before the tap may still
// go, but no new one starts within 180 ms of it, and the eyes reach the tapped spot.
for (const at of [2.9, 3, 3.1, 3.2]) {
  const m = makeSim({ cond: 'poor', speed: 20 }); m.advance(at); const t0 = m.s.t, planned = m.s.pending || m.s.sac ? 1 : 0;
  m.place([0, 5]); m.advance(1);
  const early = m.s.events.filter((x) => x.t0 > t0 && x.t0 < t0 + 0.18);
  if (early.length > planned) fail(`a saccade started ${((early[early.length - 1].t0 - t0) * 1000).toFixed(0)} ms after a tap on the moving target`);
  if (Math.hypot(m.s.E[0], m.s.E[1] - 5) > CATCHUP.peMin + 1e-6) fail(`1 s after a tap, the eyes are at ${m.s.E.map((x) => x.toFixed(2))}, not on the tapped spot`);
}

// ---- the muscles
const R0 = listing([0, 0, -1]);
const WANT = { lr: { h: 1 }, mr: { h: -1 }, sr: { v: 1 }, ir: { v: -1 }, so: { v: -1 }, io: { v: 1 } };
for (const m of MUSCLES) {
  const a = PULL[m.id], want = WANT[m.id];
  // the axis in (up, -right, twist) terms: a positive 'up' part turns the eye up; a negative '-right' part turns it right (out, for the right eye)
  if (want.h && Math.sign(-a[1]) !== want.h) fail(`${m.name} does not turn the right eye ${want.h > 0 ? 'out' : 'in'}`);
  if (want.v && Math.sign(a[0]) !== want.v) fail(`${m.name} does not turn the eye ${want.v > 0 ? 'up' : 'down'}`);
  // obliques twist the eye: superior oblique in (top toward the nose), inferior oblique out; and both turn it out
  if (m.id === 'so' && !(a[2] > 0 && -a[1] > 0)) fail('the superior oblique does not twist the eye in and turn it out');
  if (m.id === 'io' && !(a[2] < 0 && -a[1] > 0)) fail('the inferior oblique does not twist the eye out and turn it out');
  if (m.id === 'sr' && !(a[2] > 0 && -a[1] < 0)) fail('the superior rectus does not twist the eye in and turn it in');
  if (m.id === 'ir' && !(a[2] < 0 && -a[1] < 0)) fail('the inferior rectus does not twist the eye out and turn it in');
  // a muscle gets shorter when the eye turns the way it pulls
  const L0 = musclePath(m, R0).L, g = want.h ? [want.h * 20, 0] : [0, want.v * 15], L1 = musclePath(m, listing(eyeGaze(1, onScreen(...g)))).L;
  if (!(L1 < L0 - 0.5)) fail(`${m.name} is ${L1.toFixed(1)} mm with the eye turned its way, against ${L0.toFixed(1)} mm straight ahead`);
}
// no path goes into the eye, at any gaze
for (let h = -25; h <= 25; h += 5) for (let v = -15; v <= 15; v += 5) for (const side of [1, -1]) {
  const R = listing(eyeGaze(side, onScreen(h, v)));
  for (const m of MUSCLES) {
    const p = musclePath(m, R, side);
    for (const part of p.parts) for (let i = 0; i <= 40; i++) { const q = part.at(i / 40), r = Math.hypot(...q); if (r < EYE_R - 1e-6) { fail(`${m.name} goes ${(EYE_R - r).toFixed(2)} mm into the eye at ${h}°, ${v}°`); break; } }
  }
  // Listing's law: the turn has no twist about straight ahead
  const d = eyeGaze(side, onScreen(h, v)), Rr = listing(d), up = [Rr[0][1], Rr[1][1], Rr[2][1]];
  const ax = [Rr[2][1] - Rr[1][2], Rr[0][2] - Rr[2][0], Rr[1][0] - Rr[0][1]];
  if (Math.abs(ax[2]) > 1e-9) fail(`the eye twists at ${h}°, ${v}°`);
  if (Math.abs(up[0] * d[0] + up[1] * d[1] + up[2] * d[2]) > 1e-9) fail('the turned eye is not square to its line of sight');
}

// ---- the muscles' bodies, as drawn: no two share space at any gaze, and where two cross the right one is outside.
// The tendon of the superior oblique runs under the superior rectus, and the inferior oblique passes outside the
// inferior rectus. The check works on the points of the drawn tubes, not on the rule that lifts one over the other.
{
  const { TUBE, eyeMuscles, RIDES, WRAP_R } = M;
  if (!eyeMuscles) fail('the model does not build the muscles\' bodies, so nothing checks them for shared space');
  else {
    const { ns, na } = TUBE, P = (b, i, j) => [b.pos[(i * (na + 1) + j) * 3], b.pos[(i * (na + 1) + j) * 3 + 1], b.pos[(i * (na + 1) + j) * 3 + 2]];
    const ringsOf = (b) => Array.from({ length: ns }, (_, i) => { const pts = Array.from({ length: na }, (_, j) => P(b, i, j)); return { pts, c: [0, 1, 2].map((k) => pts.reduce((a, p) => a + p[k], 0) / na) }; });
    // how deep the point X lies inside a tube (mm from its skin), 0 if outside
    const depthIn = (X, rings) => {
      let best = 0;
      for (let k = 0; k < ns - 1; k++) {
        const a = rings[k], b = rings[k + 1], t = [b.c[0] - a.c[0], b.c[1] - a.c[1], b.c[2] - a.c[2]], l2 = t[0] * t[0] + t[1] * t[1] + t[2] * t[2];
        const dx = [X[0] - a.c[0], X[1] - a.c[1], X[2] - a.c[2]]; if (dx[0] * dx[0] + dx[1] * dx[1] + dx[2] * dx[2] > 64) continue;
        const u = (dx[0] * t[0] + dx[1] * t[1] + dx[2] * t[2]) / l2; if (u < 0 || u > 1) continue;
        const l = Math.sqrt(l2), tn = t.map((x) => x / l), ref = Math.abs(tn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        let e1 = [tn[1] * ref[2] - tn[2] * ref[1], tn[2] * ref[0] - tn[0] * ref[2], tn[0] * ref[1] - tn[1] * ref[0]]; const l1 = Math.hypot(...e1); e1 = e1.map((x) => x / l1);
        const e2 = [tn[1] * e1[2] - tn[2] * e1[1], tn[2] * e1[0] - tn[0] * e1[2], tn[0] * e1[1] - tn[1] * e1[0]];
        const c = [a.c[0] + t[0] * u, a.c[1] + t[1] * u, a.c[2] + t[2] * u], to2 = (p) => { const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]]; return [d[0] * e1[0] + d[1] * e1[1] + d[2] * e1[2], d[0] * e2[0] + d[1] * e2[1] + d[2] * e2[2]]; };
        const poly = a.pts.map((p, j) => to2([p[0] + (b.pts[j][0] - p[0]) * u, p[1] + (b.pts[j][1] - p[1]) * u, p[2] + (b.pts[j][2] - p[2]) * u])), x = to2(X);
        let inside = false, dmin = Infinity;
        for (let j = 0, i = na - 1; j < na; i = j++) {
          const [x1, y1] = poly[i], [x2, y2] = poly[j];
          if ((y1 > x[1]) !== (y2 > x[1]) && x[0] < (x2 - x1) * (x[1] - y1) / (y2 - y1) + x1) inside = !inside;
          const ex = x2 - x1, ey = y2 - y1, q = Math.max(0, Math.min(1, ((x[0] - x1) * ex + (x[1] - y1) * ey) / (ex * ex + ey * ey || 1)));
          dmin = Math.min(dmin, Math.hypot(x[0] - x1 - ex * q, x[1] - y1 - ey * q));
        }
        if (inside && dmin > best) best = dmin;
      }
      return best;
    };
    const shared = (A, B) => { let worst = 0; for (let i = 0; i < ns; i++) for (let j = 0; j < na; j++) worst = Math.max(worst, depthIn(P(A, i, j), B)); return worst; };
    // the check must see the old picture's fault: without the rule, these two pairs share space with the eye straight ahead
    { const old = eyeMuscles(R0, 1, [0, 0, 0], false), r = Object.fromEntries(Object.entries(old).map(([k, b]) => [k, ringsOf(b)]));
      for (const [o, i] of [['sr', 'so'], ['io', 'ir']]) if (shared(old[o], r[i]) < 0.2 && shared(old[i], r[o]) < 0.2) fail(`the check for shared space does not see ${o} and ${i} cross through each other when neither is lifted`); }
    // The target swings 12° either side of center, and a dragged target can be 13° up or down: over that range the
    // check is strict. Out to the sides of the screen (22°), where only a dragged or tapped target takes the eyes,
    // two bodies may still touch at the corners, by far less than they shared before: that is bounded here.
    let worstAll = 0, worstFar = 0;
    for (const h of [-22, -12, -8, -4, 0, 4, 8, 12, 22]) for (const v of [-13, 0, 13]) for (const side of [1, -1]) {
      const far = Math.abs(h) > 12;
      const R = listing(eyeGaze(side, onScreen(h, v))), bodies = eyeMuscles(R, side), r = Object.fromEntries(Object.entries(bodies).map(([k, b]) => [k, ringsOf(b)]));
      for (const a of MUSCLES) for (const b of MUSCLES) {
        if (a === b) continue;
        const d = shared(bodies[a.id], r[b.id]); if (far) worstFar = Math.max(worstFar, d); else worstAll = Math.max(worstAll, d);
        if (d > (far ? 1.2 : 0.05)) fail(`${a.name} is ${d.toFixed(2)} mm inside ${b.name} at ${h}°, ${v}° (${side > 0 ? 'right' : 'left'} eye)`);
      }
      for (const [o, list] of Object.entries(RIDES)) for (const i of list) {
        // the right order: no point straight beneath the inner muscle's skin (toward the eye's center) is inside the outer one
        let under = 0;
        // (of a muscle that runs through the loop, only the stretch from the loop to the eye crosses another)
        for (let q = bodies[i].first || 0; q < ns; q++) for (let j = 0; j < na; j++) { const Y = P(bodies[i], q, j), rho = Math.hypot(...Y); if (rho > 20) continue; for (let d = 0.25; rho - d > EYE_R - 1; d += 0.25) under = Math.max(under, depthIn(Y.map((x) => x * (rho - d) / rho), r[o])); }
        if (under > (far ? 1.2 : 0.05)) fail(`${o} passes under ${i} at ${h}°, ${v}°: it should ride over it`);
      }
      for (const m of MUSCLES) {
        const b = bodies[m.id], end = b.rings[ns - 1].C, p = musclePath(m, R, side, WRAP_R);
        if (Math.hypot(end[0] - b.I[0], end[1] - b.I[1], end[2] - b.I[2]) > 0.05) fail(`${m.name} does not end at its insertion at ${h}°, ${v}°`);
        if (b.L !== p.L) fail(`${m.name}'s length is not its path's length`);
        for (let i = 0; i < ns; i++) for (let j = 0; j < na; j++) { const q = P(b, i, j), rr = Math.hypot(...q); if (rr < EYE_R - 0.5) { fail(`${m.name}'s body goes ${(EYE_R - rr).toFixed(2)} mm into the eye at ${h}°, ${v}°`); i = ns; break; } }
      }
    }
    console.log(`muscles: the most any two share is ${worstAll.toFixed(3)} mm within 12° of center, ${worstFar.toFixed(2)} mm at 22°`);
  }
}

// ---- nerve signals
{
  if (!near(rate('lr', 1, [0, 0, 0], [0, 0, 0]), NEURON.r0, 1e-9)) fail('the signal at rest is not the resting rate');
  const sp = [0, -peakSpeed(10), 0], at = [0, -5, 0];          // halfway through a 10° saccade to the right
  const ag = rate('lr', 1, at, sp), an = rate('mr', 1, at, sp);
  if (ag < 400) fail(`the lateral rectus gets only ${ag.toFixed(0)} spikes/s during a saccade its way`);
  if (an > 0) fail(`the medial rectus is not silenced during a saccade the other way (${an.toFixed(0)} spikes/s)`);
  // Hering's law: the right eye's lateral rectus and the left eye's medial rectus get the same signal
  for (const h of [-20, -5, 5, 20]) {
    const P = onScreen(h, 0), tr = turnOf(eyeGaze(1, P)), tl = turnOf(eyeGaze(-1, P));
    const a = rate('lr', 1, tr, [0, 0, 0]), b = rate('mr', -1, tl, [0, 0, 0]);
    if (Math.abs(a - b) > 30) fail(`looking ${h}° to the side, the right eye's lateral rectus gets ${a.toFixed(0)} and the left eye's medial rectus ${b.toFixed(0)} spikes/s`);
  }
}

// ---- the same twice
{
  const a = makeSim({ cond: 'poor', speed: 25 }), b = makeSim({ cond: 'poor', speed: 25 }); a.advance(5); b.advance(5);
  if (a.s.E[0] !== b.s.E[0] || a.s.events.length !== b.s.events.length) fail('two runs gave different results');
}

if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log('model: all passed');
