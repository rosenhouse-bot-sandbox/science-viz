// Checks the Overshoot saccades model against what the sources say, in Node (no browser):
//  - saccade timing and top speed against measured ranges (the main sequence);
//  - pursuit gain as measured comes out as the gain that was set;
//  - healthy pursuit makes few overshoot saccades and poor pursuit makes mostly overshoot saccades;
//  - every saccade's kind fits its definition (where it started and landed, against the target);
//  - a saccade to a still target starts about 200 ms after the target jumps, and lands on it;
//  - each muscle turns the eye the textbook way, and gets shorter when the eye turns its way;
//  - no muscle path goes into the eye; the eyes do not twist about the line of sight (Listing's law);
//  - the nerve signals: a burst to the muscle that turns the eye, a pause in the one that opposes it,
//    and the same signal to the two muscles that turn the two eyes the same way (Hering's law);
//  - two runs give the same result.
//
//   node tests/saccade/model.mjs
import { makeSim, duration, peakSpeed, PULL, MUSCLES, musclePath, listing, eyeGaze, onScreen, turnOf, rate, EYE_R, CATCHUP, PURSUIT, NEURON, STEP } from '../../js/saccade/model.js';
import { stamp } from './stamp.mjs';

let fails = 0;
const fail = (what) => { fails++; console.log('FAIL ' + what); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

{ const r = stamp(true); if (r.stale.length) fail(`the version stamp is out of date in ${r.stale.join(', ')}: run node tests/saccade/stamp.mjs`); }

// ---- the main sequence: measured humans make a 10° saccade in about 40 to 60 ms at 300 to 500°/s [collewijn, bahill]
for (const [a, d0, d1, v0, v1] of [[1, 20, 35, 50, 120], [5, 30, 45, 200, 350], [10, 40, 60, 300, 500], [20, 60, 90, 400, 650]]) {
  const d = duration(a) * 1000, v = peakSpeed(a);
  if (d < d0 || d > d1) fail(`a ${a}° saccade lasts ${d.toFixed(0)} ms, outside ${d0} to ${d1} ms`);
  if (v < v0 || v > v1) fail(`a ${a}° saccade peaks at ${v.toFixed(0)}°/s, outside ${v0} to ${v1}°/s`);
}

// ---- pursuit and the saccades it needs
const runs = {};
for (const cond of ['healthy', 'poor']) for (const speed of [10, 20, 30]) {
  const m = makeSim({ cond, speed }); m.advance(12);
  const ev = m.recent(10), g = m.gain(), kinds = {};
  for (const e of ev) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
  runs[cond + speed] = { ev, g, kinds };
  if (g === null || !near(g, PURSUIT.gain[cond], cond === 'poor' ? 0.05 : 0.04)) fail(`${cond} pursuit at ${speed}°/s measures a gain of ${g?.toFixed(3)}, set to ${PURSUIT.gain[cond]}`);
  const over = (kinds.overshoot || 0) / Math.max(1, ev.length);
  if (cond === 'healthy' && over > 0.3) fail(`healthy pursuit at ${speed}°/s: ${(over * 100).toFixed(0)}% of saccades overshoot`);
  if (cond === 'poor' && speed >= 20 && over < 0.5) fail(`poor pursuit at ${speed}°/s: only ${(over * 100).toFixed(0)}% of saccades overshoot`);
  if (cond === 'poor' && (kinds.overshoot || 0) <= (runs['healthy' + speed].kinds.overshoot || 0)) fail(`poor pursuit at ${speed}°/s makes no more overshoot saccades than healthy pursuit`);
  if (cond === 'poor' && ev.length <= runs['healthy' + speed].ev.length) fail(`poor pursuit at ${speed}°/s makes no more saccades than healthy pursuit`);
  // each kind fits its definition
  for (const e of m.s.events) {
    if (!['overshoot', 'catchup', 'anticipatory', 'backup'].includes(e.kind)) continue;
    const dir = Math.sign(e.Tv0[0]) || 1, behind = (e.T0[0] - e.E0[0]) * dir, ahead = (e.E1[0] - e.T1[0]) * dir, along = e.A[0] * dir;
    if (e.kind === 'overshoot' && !(behind > CATCHUP.onTarget && ahead > CATCHUP.onTarget)) fail(`an overshoot saccade started ${behind.toFixed(2)}° behind and landed ${ahead.toFixed(2)}° ahead`);
    if (e.kind === 'catchup' && !(behind > CATCHUP.onTarget && Math.abs(ahead) <= CATCHUP.onTarget + 1e-9 || ahead < -CATCHUP.onTarget)) fail(`a catch-up saccade landed ${ahead.toFixed(2)}° ahead`);
    if (e.kind === 'backup' && along >= 0) fail('a back-up saccade went the same way as the target');
    if (!near(e.t1 - e.t0, e.D, 2 * STEP)) fail(`a saccade lasted ${((e.t1 - e.t0) * 1000).toFixed(1)} ms, not its ${(e.D * 1000).toFixed(1)} ms`);
  }
}
console.log('pursuit:', Object.entries(runs).map(([k, r]) => `${k} gain ${r.g.toFixed(2)} ${JSON.stringify(r.kinds)}`).join('; '));

// ---- a jump of the target, as in a clinic's saccade test
{
  const m = makeSim({ cond: 'healthy', auto: false }); m.advance(0.5); const t0 = m.s.t;
  m.place([10, 0]); m.advance(1);
  const e = m.s.events.find((x) => x.t0 > t0);
  if (!e) fail('no saccade to a target that jumped');
  else {
    const lat = (e.t0 - t0) * 1000;
    if (lat < 180 || lat > 260) fail(`a saccade to a still target started ${lat.toFixed(0)} ms after it jumped`);
    if (Math.abs(m.s.E[0] - 10) > CATCHUP.onTarget) fail(`after a jump to 10°, the eyes ended at ${m.s.E[0].toFixed(2)}°`);
    if (e.kind !== 'on') fail(`a saccade to a still target was "${e.kind}"`);
  }
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
