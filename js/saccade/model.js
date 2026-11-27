// Overshoot saccades: the model. Everything the page draws and every number it shows comes from here.
// Angles are in degrees, times in seconds, lengths in millimeters. Pure code, no page: tests run it in Node.
//
// The head's frame: x to the person's right, y up, z backward (out of the back of the head), so the eyes
// look down -z at a screen 600 mm away. Each eye's center is the origin of its own frame.

export const STEP = 0.001;                       // the simulation steps 1 ms at a time
export const TRACE_S = 2;                        // the trace in the panel, and the ticks on the screen, keep this much of the past
export const INSET_DEG = 5;                     // the inset shows this much of what the right eye sees, side to side

// ---- sizes ----
export const EYE_R = 12;                         // radius of the eyeball (axial length about 24 mm)
export const IPD = 63;                           // distance between the eye centers
export const SCREEN = { d: 600, w: 530, h: 300 }; // a 24-inch screen at 60 cm, centered at eye height

// ---- pursuit: the smooth following movement ----
export const PURSUIT = {
  latency: 0.1,                                  // the eye starts to follow about 100 ms after the target moves [carl, leigh]
  tau: 0.04,                                     // how fast eye speed settles to its new value (this model's choice)
  max: 60,                                       // fastest the model will follow, degrees per second
  gain: { healthy: 0.95, poor: 0.5 },            // eye speed ÷ target speed. 0.95 is typical of healthy adults at
                                                 // these speeds [leigh]; 0.5 is this page's example of poor pursuit
};

// ---- catch-up saccades: the quick jumps ----
export const CATCHUP = {
  latency: 0.125,                                // a jump starts about 125 ms after the brain decides [trigger]
  still: 0.2,                                    // to a target that is standing still it takes about 200 ms [leigh]
  txe: [0.04, 0.18],                             // no jump while the eye will reach the target in 40 to 180 ms [trigger]
  peMin: 0.5,                                    // and none while the eye is within 0.5° of the target (model's choice)
  sample: 0.09,                                  // the jump is sized from what the eye saw 90 ms before it starts [trigger]
  pe: 0.9,                                       // measured size: 0.9 × the distance to the target [amplitude]
  rs: 0.109,                                     // plus 0.109 s × the slip, for slip up to 15°/s [amplitude]
  rsKnee: 15, rsFast: 0.09,                      // and 0.09 s × each °/s of slip above 15 [amplitude]
  over: { accurate: 1, overshoot: 4 / 3 },       // the "overshoot" setting makes each jump 4/3 of that size (this page's example)
  scatter: 0.068,                                // saccades of one size to a still target scatter by this share of their size
                                                 // (the standard deviation of their gain) [amplitude, Table 1]. A jump "lands on
                                                 // the target" when it ends within this share of its own size of the target's middle.
};
// how near the target's middle a jump of this size must end to count as on it
export const landTol = (amp) => CATCHUP.scatter * Math.abs(amp);

// ---- how long a jump lasts: the main sequence ----
export const MAIN_SEQ = { a: 0.023, b: 0.0027 }; // duration = 23 ms + 2.7 ms per degree [collewijn]
export const duration = (amp) => MAIN_SEQ.a + MAIN_SEQ.b * Math.abs(amp);
// the path through a jump: a smooth start and stop (minimum jerk). Its peak speed is 1.875 × size ÷ duration.
export const mj = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * u * (10 + u * (-15 + 6 * u)));
export const MJ_PEAK = 1.875;
export const peakSpeed = (amp) => MJ_PEAK * Math.abs(amp) / duration(amp);

// ---- the nerve signal to each muscle (motor neurons, measured in monkeys) ----
// rate = r0 + k × position + r × speed, each along the muscle's own pull, never below 0 [robinson]
export const NEURON = { r0: 100, k: 4, r: 0.95, max: 800 };

// ---- the target ----
export const TARGET = { amp: 12, still: 1 };    // swings 12° either side of center; "still" below 1°/s
// A target that swings back and forth in a regular way is predictable. After one full swing, pursuit no longer
// lags: the brain moves the eye with the target, not behind it [barnes]. One swing is this page's choice. What is learned
// belongs to one swing: when the swing's speed changes, either way, it is learned again.
export const learnTime = (speed, A = TARGET.amp) => 2 * Math.PI * A / Math.max(1, speed);

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const len2 = (x, y) => Math.hypot(x, y);
// The target swings like a pendulum (a sine wave), as in clinical pursuit tests. speed is its top speed, at the center.
export const swing = (ph, A = TARGET.amp) => A * Math.sin(ph);
// the phase that puts it at x going right (to pick up again where a dragged target was left)
export const unswing = (x, A = TARGET.amp) => Math.asin(clamp(x / A, -1, 1));

// ---- the simulation ----
// cond: 'healthy' or 'poor'. speed: the target's speed in °/s. auto: the target moves by itself.
export function makeSim({ cond = 'healthy', sacc = 'accurate', speed = 20, auto = true } = {}) {
  const N = 4096;                                // 4 s of history, one sample per ms
  const B = { th: new Float32Array(N), tv: new Float32Array(N), eh: new Float32Array(N), ev: new Float32Array(N),
    vth: new Float32Array(N), vtv: new Float32Array(N), ph: new Float32Array(N), pv: new Float32Array(N), sac: new Uint8Array(N) };
  const s = { t: 0, k: 0, cond, sacc, speed, auto, ph: 0, autoSince: 0, T: [0, 0], Tv: [0, 0], E: [0, 0], Ve: [0, 0], Vp: [0, 0], sac: null, pending: null,
    events: [], lastEnd: -1, from: null, to: null };
  const at = (j) => ((j % N) + N) % N;
  // the way the target moved at step j, as a unit vector, or null if it stood still
  const way = (j) => { const J = at(j), h = B.vth[J], v = B.vtv[J], l = len2(h, v); return j > 0 && l > 1e-3 ? [h / l, v / l] : null; };
  // the target's velocity at step j. A finger drags it unevenly, so that is averaged over the 20 ms before; the swing
  // is smooth and needs no averaging (an average over the time before would also be 10 ms old).
  const tvel = (j) => { if (s.auto) return [B.vth[at(j)], B.vtv[at(j)]]; let h = 0, v = 0; for (let i = 0; i < 20; i++) { h += B.vth[at(j - i)]; v += B.vtv[at(j - i)]; } return [h / 20, v / 20]; };

  const learned = () => s.auto && s.t - s.autoSince >= learnTime(s.speed);
  // the learned swing: where the target will be dt from now
  const ahead = (dt) => swing(s.ph + s.speed / TARGET.amp * dt);
  function step() {
    s.k++; s.t += STEP; const k = s.k, i = at(k);
    // the target
    const T0 = s.T.slice();
    if (s.auto) { s.ph += s.speed / TARGET.amp * STEP; s.T = [swing(s.ph), 0]; }
    let jump = false;
    if (!s.auto && s.to) { const f = s.to.n > 0 ? 1 / s.to.n : 1; s.T = [s.T[0] + (s.to.p[0] - s.T[0]) * f, s.T[1] + (s.to.p[1] - s.T[1]) * f]; s.to.n = Math.max(0, s.to.n - 1); jump = s.to.jump; s.to.jump = false; }
    // a target that jumps has not moved across the screen, so it has no speed (as when a clinic switches one dot off and another on)
    s.Tv = jump ? [0, 0] : [(s.T[0] - T0[0]) / STEP, (s.T[1] - T0[1]) / STEP];
    B.th[i] = s.T[0]; B.tv[i] = s.T[1]; B.vth[i] = s.Tv[0]; B.vtv[i] = s.Tv[1];
    // pursuit: the eye's smooth speed heads for gain × the target's speed as it was a latency ago. Once the swing is
    // learned the brain sends the command early by as much as the eye is slow to answer, so the eye's speed is
    // gain × the target's speed now, with no lag.
    const g = PURSUIT.gain[s.cond], w = s.speed / TARGET.amp;
    const vt = learned() ? [s.speed * Math.cos(s.ph) - PURSUIT.tau * s.speed * w * Math.sin(s.ph), 0] : tvel(k - Math.round(PURSUIT.latency / STEP));
    let dh = g * vt[0], dv = g * vt[1]; const m = len2(dh, dv); if (m > PURSUIT.max) { dh *= PURSUIT.max / m; dv *= PURSUIT.max / m; }
    s.Vp[0] += (dh - s.Vp[0]) * STEP / PURSUIT.tau; s.Vp[1] += (dv - s.Vp[1]) * STEP / PURSUIT.tau;
    // the eye: pursuit, plus the jump if one is under way (the two add [amplitude])
    let mh = s.Vp[0] * STEP, mv = s.Vp[1] * STEP;
    if (s.sac) {
      const q = s.sac, u0 = (s.t - STEP - q.t0) / q.D, u1 = (s.t - q.t0) / q.D, d = mj(u1) - mj(u0);
      mh += q.A[0] * d; mv += q.A[1] * d;
    }
    s.E[0] += mh; s.E[1] += mv; s.Ve = [mh / STEP, mv / STEP];
    if (s.sac && s.t - s.sac.t0 >= s.sac.D - 1e-9) end(s.sac);
    B.eh[i] = s.E[0]; B.ev[i] = s.E[1]; B.ph[i] = s.Vp[0]; B.pv[i] = s.Vp[1]; B.sac[i] = s.sac ? 1 : 0;
    // a jump that is due starts now
    if (s.pending && s.t >= s.pending.at - 1e-9) start();
    // decide whether to jump: the eye-crossing rule [trigger]
    if (!s.sac && !s.pending) {
      const pe = [s.T[0] - s.E[0], s.T[1] - s.E[1]], d = len2(pe[0], pe[1]);
      if (d > CATCHUP.peMin) {
        const v = tvel(k), u = [pe[0] / d, pe[1] / d], rs = (v[0] - s.Vp[0]) * u[0] + (v[1] - s.Vp[1]) * u[1];
        const txe = rs >= 0 ? Infinity : d / -rs;                     // when the eye will cross the target, at today's speeds
        if (txe < CATCHUP.txe[0] || txe > CATCHUP.txe[1]) s.pending = { at: s.t + (len2(s.Tv[0], s.Tv[1]) < TARGET.still ? CATCHUP.still : CATCHUP.latency), decided: s.t };
      }
    }
  }
  function start() {
    s.pending = null;
    const j = s.k - Math.round(CATCHUP.sample / STEP), J = at(j), v = tvel(j);
    const pe = [B.th[J] - B.eh[J], B.tv[J] - B.ev[J]];
    const rs = [v[0] - B.ph[J], v[1] - B.pv[J]];
    if (learned()) {
      // A learned swing is known ahead, and so is how the eyes will follow it: at gain × its speed. The slip that
      // counts is then the mean slip to come, from the moment of sampling to the end of the jump (the time the measured
      // rule allows for [amplitude, Eq. 2]), not the slip at the moment of sampling. So a jump made as the target slows
      // before a turn is sized for where the target will be.
      const g = PURSUIT.gain[s.cond], a0 = len2(CATCHUP.pe * pe[0] + CATCHUP.rs * rs[0], CATCHUP.pe * pe[1] + CATCHUP.rs * rs[1]);
      const H = CATCHUP.sample + duration(a0);
      rs[0] = (1 - g) * (ahead(H - CATCHUP.sample) - B.th[J]) / H;
    }
    const m = len2(rs[0], rs[1]);
    const w = m <= CATCHUP.rsKnee ? CATCHUP.rs : (CATCHUP.rs * CATCHUP.rsKnee + CATCHUP.rsFast * (m - CATCHUP.rsKnee)) / m;  // seconds
    const f = CATCHUP.over[s.sacc];
    const A = [f * (CATCHUP.pe * pe[0] + w * rs[0]), f * (CATCHUP.pe * pe[1] + w * rs[1])], a = len2(A[0], A[1]);
    if (a < 0.1) return;
    s.sac = { t0: s.t, D: duration(a), A, amp: a, E0: s.E.slice(), T0: s.T.slice(), Tv0: tvel(s.k), auto: s.auto };
  }
  function end(q) {
    s.sac = null; s.lastEnd = s.t;
    const E1 = [s.E[0], s.E[1]], v = q.Tv0, sp = len2(v[0], v[1]);
    const ev = { t0: q.t0, t1: s.t, Tv0: q.Tv0, amp: q.amp, D: q.D, peak: peakSpeed(q.amp), A: q.A, E0: q.E0, E1, T0: q.T0, T1: s.T.slice() };
    const tol = landTol(q.amp); ev.tol = tol;
    if (sp >= TARGET.still || (q.auto && sp > 1e-6)) {
      // moving target: the kinds used in clinical studies of pursuit [sanz]. A swinging target is never still: at the
      // end of its swing it is turning, and ahead is the way it moves at the moment the jump starts, as on the trace.
      const u = [v[0] / sp, v[1] / sp], along = q.A[0] * u[0] + q.A[1] * u[1];
      const behind = (q.T0[0] - q.E0[0]) * u[0] + (q.T0[1] - q.E0[1]) * u[1], ahead = (E1[0] - s.T[0]) * u[0] + (E1[1] - s.T[1]) * u[1];
      ev.ahead = ahead;
      ev.kind = along < 0 ? 'backup' : behind > tol && ahead > tol ? 'overshoot' : behind > tol ? 'catchup' : ahead > tol ? 'anticipatory' : 'other';
    } else {
      // still target: past it, short of it, or on it, along the jump
      const u = [q.A[0] / q.amp, q.A[1] / q.amp], past = (E1[0] - s.T[0]) * u[0] + (E1[1] - s.T[1]) * u[1];
      ev.ahead = past; ev.kind = past > tol ? 'past' : past < -tol ? 'short' : 'on';
    }
    s.events.push(ev); if (s.events.length > 400) s.events.shift();
  }

  return {
    s, B, N, at,
    // run for a while of simulated time. With the target held by a finger, `p` is where it is now; the target moves
    // there evenly over the steps.
    advance(dt, p = null) {
      const n = Math.max(0, Math.round(dt / STEP));
      if (p && !s.auto) s.to = { p, n };
      for (let i = 0; i < n; i++) step();
      return n;
    },
    set(o) {
      if (o.cond) s.cond = o.cond;
      if (o.sacc) s.sacc = o.sacc;
      // a new speed is a new swing: it is learned again, whether it is faster or slower
      if (o.speed !== undefined && o.speed !== s.speed) { const x = s.T[0] / TARGET.amp, c = Math.cos(s.ph); s.speed = o.speed; if (s.auto) { s.ph = Math.atan2(x, c); s.autoSince = s.t; } }
      if (o.auto !== undefined && o.auto !== s.auto) { s.auto = o.auto; if (s.auto) { s.ph = unswing(s.T[0]); s.autoSince = s.t; } s.to = null; }
    },
    // put the target somewhere at once (a tap on the screen): a step, as in a clinic's saccade test
    place(p) { s.auto = false; s.to = { p, n: 1, jump: true }; },
    // eye speed ÷ target speed while following, over the last 2 s, leaving out the jumps. null when the target is still.
    gain(win = 2) {
      let num = 0, den = 0, n = 0;
      for (let j = s.k - Math.round(win / STEP); j <= s.k; j++) {
        if (j < 1) continue; const J = at(j); if (B.sac[J]) continue;
        const vh = B.vth[J], vv = B.vtv[J], v2 = vh * vh + vv * vv; if (v2 < 4) continue;
        num += (B.ph[J] * vh + B.pv[J] * vv) / Math.sqrt(v2); den += Math.sqrt(v2); n++;
      }
      return n > 200 ? num / den : null;
    },
    recent(win = 5) { return s.events.filter((e) => e.t1 > s.t - win); },
    learned,
    // The trace: how far the eyes are ahead of the target (+) or behind it (-), along the way the target moves, over
    // the last `win` seconds, one point every `every` steps. "Ahead" turns into "behind" when the target turns round,
    // though neither the eye nor the target jumps. So the line is broken there: `lines` are the unbroken pieces
    // ([t, degrees] points) and `turns` the times of the turns. Within a piece the value changes only as fast as the
    // eye and the target move.
    trace(win = 2, every = 2) {
      const n = Math.min(s.k - 1, Math.round(win / STEP)), lines = [], turns = [];
      // the way the target moves at the start: the last time it moved before then, or the first time after
      let u = null;
      for (let j = s.k - n; j > Math.max(0, s.k - N + 1) && !u; j--) u = way(j);
      for (let j = s.k - n; j <= s.k && !u; j++) u = way(j);
      u = u || [1, 0];
      let line = [];
      for (let j = s.k - n; j <= s.k; j++) {
        const J = at(j), w = way(j), t = s.t - (s.k - j) * STEP;
        if (w && w[0] * u[0] + w[1] * u[1] < 0) { if (line.length) lines.push(line); line = []; turns.push(t); }
        if (w) u = w;
        if ((s.k - j) % every === 0 || !line.length) line.push([t, (B.eh[J] - B.th[J]) * u[0] + (B.ev[J] - B.tv[J]) * u[1]]);
      }
      if (line.length) lines.push(line);
      return { lines, turns, dots: s.events.filter((e) => e.kind === 'overshoot' && e.t1 > s.t - win).map((e) => [e.t1, e.ahead]) };
    },
    eyeVel() { return s.Ve.slice(); },
  };
}

// ---- where the eyes look ----
// The gaze (h right, v up, from the point between the eyes) meets the screen here, in mm in the head's frame.
export function onScreen(h, v, d = SCREEN.d) {
  const r = Math.PI / 180;
  return [d * Math.tan(h * r), d * Math.tan(v * r) / Math.cos(h * r), -d];
}
// and back: the gaze angles that land on a point of the screen
export function gazeOf(p) {
  const d = -p[2], h = Math.atan2(p[0], d), v = Math.atan2(p[1] * Math.cos(h), d);
  return [h * 180 / Math.PI, v * 180 / Math.PI];
}
// Each eye turns to look at the same point on the screen, so the two lines of sight meet there.
export const eyeCenter = (side) => [side * IPD / 2, 0, 0];      // side +1 the right eye, -1 the left
export function eyeGaze(side, P) {
  const c = eyeCenter(side), d = [P[0] - c[0], P[1] - c[1], P[2] - c[2]], l = Math.hypot(...d);
  return d.map((x) => x / l);
}
// Listing's law: the eye turns from straight ahead to a new direction about an axis square to straight ahead,
// so it does not twist about its line of sight. Returns a 3 × 3 rotation (rows).
export function listing(dir) {
  const f = [0, 0, -1], ax = [f[1] * dir[2] - f[2] * dir[1], f[2] * dir[0] - f[0] * dir[2], f[0] * dir[1] - f[1] * dir[0]];
  const s = Math.hypot(...ax), c = clamp(f[0] * dir[0] + f[1] * dir[1] + f[2] * dir[2], -1, 1);
  if (s < 1e-9) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const [x, y, z] = ax.map((a) => a / s), C = 1 - c;
  return [[c + x * x * C, x * y * C - z * s, x * z * C + y * s], [y * x * C + z * s, c + y * y * C, y * z * C - x * s], [z * x * C - y * s, z * y * C + x * s, c + z * z * C]];
}
export const rot = (R, p) => [R[0][0] * p[0] + R[0][1] * p[1] + R[0][2] * p[2], R[1][0] * p[0] + R[1][1] * p[1] + R[1][2] * p[2], R[2][0] * p[0] + R[2][1] * p[1] + R[2][2] * p[2]];
// how far each eye is turned, as a rotation vector in degrees: (up, -right, twist)
export function turnOf(dir) {
  const h = Math.atan2(dir[0], -dir[2]) * 180 / Math.PI, v = Math.asin(clamp(dir[1], -1, 1)) * 180 / Math.PI;
  return [v, -h, 0];
}

// ---- the six muscles of the right eye (the left eye is its mirror image) ----
// Insertions: distance from the edge of the cornea along the surface [apt]. The cornea's edge is 5.2 mm from the
// eye's axis here, so it is 25.7° round from the front. Origins: a ring 4.5 mm across at the back of the orbit, which
// lies 13 mm toward the nose and 32 mm behind the eye's center. The two obliques run from the front of the orbit.
const LIMBUS = Math.asin(5.2 / EYE_R);
const APEX = [-13, 0, 32];
const recti = (deg, x, y) => { const a = LIMBUS + deg / EYE_R; return [x * Math.sin(a) * EYE_R, y * Math.sin(a) * EYE_R, -Math.cos(a) * EYE_R]; };
const unitAt = (v) => { const l = Math.hypot(...v); return v.map((x) => x * EYE_R / l); };
export const MUSCLES = [
  { id: 'lr', name: 'Lateral rectus', short: 'turns the eye out, away from the nose', ins: recti(6.9, 1, 0), org: [APEX[0] + 4.5, 0, APEX[2]], width: 9.2, tendon: 8.8 },
  { id: 'mr', name: 'Medial rectus', short: 'turns the eye in, toward the nose', ins: recti(5.3, -1, 0), org: [APEX[0] - 4.5, 0, APEX[2]], width: 10.3, tendon: 3.7 },
  { id: 'sr', name: 'Superior rectus', short: 'turns the eye up', ins: recti(7.9, 0, 1), org: [APEX[0], 4.5, APEX[2]], width: 10.6, tendon: 5.8 },
  { id: 'ir', name: 'Inferior rectus', short: 'turns the eye down', ins: recti(6.8, 0, -1), org: [APEX[0], -4.5, APEX[2]], width: 9.8, tendon: 5.5 },
  { id: 'so', name: 'Superior oblique', short: 'runs through a loop at the front of the orbit; turns the eye down and twists it', ins: unitAt([0.38, 0.55, 0.74]), org: [APEX[0] - 3, 6, APEX[2] - 2], troch: [-15, 14, -7], width: 8, tendon: 26 },
  { id: 'io', name: 'Inferior oblique', short: 'runs under the eye from the front; turns the eye up and twists it', ins: unitAt([0.6, -0.25, 0.76]), org: [-11, -14, -9], width: 9, tendon: 1.5 },
];
export const OPTIC = { exit: unitAt([-0.25, 0.03, 0.96]), apex: APEX };

// the straight run from a fixed point O to the eye, then the arc round the eye to the insertion I (both in the eye's
// frame, I already turned with the eye). Returns the points along it and its length. r: radius it wraps at.
export function wrap(O, I, r = EYE_R, n = 0, contact = null) {
  const lo = Math.hypot(...O), e1 = O.map((x) => x / lo);
  const d = I[0] * e1[0] + I[1] * e1[1] + I[2] * e1[2];
  let e2 = [I[0] - d * e1[0], I[1] - d * e1[1], I[2] - d * e1[2]]; const l2 = Math.hypot(...e2); e2 = e2.map((x) => x / l2);
  const thI = Math.atan2(I[0] * e2[0] + I[1] * e2[1] + I[2] * e2[2], d), ri = Math.hypot(...I);
  // the path leaves O straight, meets the eye where it first can (thT round from O's direction), or sooner if held
  // down at `contact`, and then lies on the eye
  const thFree = Math.acos(clamp(r / lo, -1, 1)), thT = contact === null ? thFree : Math.min(thFree, contact);
  const P = (th, rr) => [rr * (Math.cos(th) * e1[0] + Math.sin(th) * e2[0]), rr * (Math.cos(th) * e1[1] + Math.sin(th) * e2[1]), rr * (Math.cos(th) * e1[2] + Math.sin(th) * e2[2])];
  const normal = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  if (thI <= thT) {                                        // the insertion can be seen from O: a straight line
    const L = Math.hypot(I[0] - O[0], I[1] - O[1], I[2] - O[2]);
    return { L, straight: L, arc: 0, T: I, normal, at: (u) => [O[0] + (I[0] - O[0]) * u, O[1] + (I[1] - O[1]) * u, O[2] + (I[2] - O[2]) * u] };
  }
  const T = P(thT, r), Ls = Math.hypot(T[0] - O[0], T[1] - O[1], T[2] - O[2]), La = ri * (thI - thT), L = Ls + La;
  return { L, straight: Ls, arc: La, T, normal, thT, thI, on: (th) => P(th, r),
    // on the eye the path comes down evenly from r, where it first touches, to the insertion's own distance (with one
    // radius for the whole arc the path would step inward where the straight run ends)
    at: (u) => { const s = u * L; if (s <= Ls) { const f = s / Ls; return [O[0] + (T[0] - O[0]) * f, O[1] + (T[1] - O[1]) * f, O[2] + (T[2] - O[2]) * f]; }
      const g = La > 0 ? (s - Ls) / La : 1, e = g * g * (3 - 2 * g); return P(thT + (s - Ls) / ri, r + (ri - r) * e); } };
}
// a muscle's path for the eye turned by R (right eye; side -1 mirrors it). Returns { parts: [wrap...], L }.
export function musclePath(m, R, side = 1, r = EYE_R) {
  const mir = (p) => [side * p[0], p[1], p[2]], I = rot(R, mir(m.ins));
  if (m.troch) { const a = mir(m.org), b = mir(m.troch), L0 = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const w = wrap(b, I, r);
    return { parts: [{ L: L0, at: (u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u], normal: null }, w], L: L0 + w.L, I }; }
  const w = wrap(mir(m.org), I, r); return { parts: [w], L: w.L, I };
}
// the axis each muscle turns the eye about when it pulls, with the eye straight ahead: r × F at the point where the
// muscle meets the eye. A unit vector in the same (up, -right, twist) terms as turnOf.
export const PULL = Object.fromEntries(MUSCLES.map((m) => {
  const I = m.ins, O = m.troch || m.org, w = wrap(O, I), Pt = w.T, F = [O[0] - Pt[0], O[1] - Pt[1], O[2] - Pt[2]];
  const t = [Pt[1] * F[2] - Pt[2] * F[1], Pt[2] * F[0] - Pt[0] * F[2], Pt[0] * F[1] - Pt[1] * F[0]], l = Math.hypot(...t);
  return [m.id, t.map((x) => x / l)];
}));
// pulling axis for the left eye: the mirror image (a turning axis flips its y and z when x is mirrored)
export const pullFor = (id, side) => { const a = PULL[id]; return side > 0 ? a : [a[0], -a[1], -a[2]]; };
// nerve signal in spikes per second for a muscle, given the eye's turn (deg) and turning speed (deg/s) as rotation vectors
export function rate(id, side, turn, speed) {
  const a = pullFor(id, side), p = a[0] * turn[0] + a[1] * turn[1] + a[2] * turn[2], v = a[0] * speed[0] + a[1] * speed[1] + a[2] * speed[2];
  return clamp(NEURON.r0 + NEURON.k * p + NEURON.r * v, 0, NEURON.max);
}

// ---- the muscles' bodies: what the picture draws, and what the tests check for shared space ----
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], vmul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vnorm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const smooth = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
export const TUBE = { ns: 56, na: 14 };                  // samples along a muscle and round it
export const WRAP_R = EYE_R + 0.45;                      // where a muscle rides on the eye, its middle line is this far from the eye's center
// The shape of a muscle across its length: half width and half thickness (mm) at s mm from its origin and e mm from
// its insertion. Rectus muscles are about 10 mm wide and 2 to 4 mm thick at the belly [the sizes are rounded]; each
// ends in a thin flat tendon at the eye.
export function muscleShape(m, s, e) {
  const tw = m.width / 2;
  if (m.id === 'so') {
    // the superior oblique: a round belly to near the loop at the front, then a round tendon through it, which
    // fans out flat on its way to the eye
    if (e > m.tendon + 10) return [1.0 + 1.3 * smooth(s / 10), 1.0 + 1.1 * smooth(s / 10)];
    if (e > m.tendon) { const f = smooth((e - m.tendon) / 10); return [1.0 + 1.3 * f, 0.9 + 1.2 * f]; }
    const f = smooth(1 - e / m.tendon * 1.25); return [1.1 + (tw - 1.1) * f, 1.0 - 0.84 * f];
  }
  const belly = m.id === 'io' ? [4.3, 1.8] : [4.6, 2.0];
  const w0 = 1.4 + (belly[0] - 1.4) * smooth((s - 2) / 12), h0 = 1.0 + (belly[1] - 1.0) * smooth((s - 2) / 12);
  const toT = smooth((e - m.tendon) / 7);                 // 1 on the belly, 0 at the start of the tendon
  const w = m.id === 'io' ? w0 + (tw - w0) * (1 - toT) : w0 * toT + (tw * (0.85 + 0.15 * (1 - e / Math.max(1, m.tendon)))) * (1 - toT);
  const h = h0 * toT + 0.16 * (1 - toT);
  return [w, h];
}
// A tube along a path: TUBE.ns rings of TUBE.na + 1 points. at(s): the path's point s mm along it. frame(s, p): a
// direction across the tube's width. shape(s, e): [half width, half thickness, lift]; lift moves the ring's middle
// outward from `center` (the eye's center). extra[i], if given, lifts ring i further. Near the eye a ring is bent to
// lie round it. Returns the points, their normals, and each ring's middle and frame (ringsOnly: just the rings).
export function tube(at, L, frame, shape, center, extra = null, ringsOnly = false) {
  const { ns, na } = TUBE, pos = ringsOnly ? null : new Float32Array(ns * (na + 1) * 3), nor = ringsOnly ? null : new Float32Array(ns * (na + 1) * 3), rings = [];
  let prevW = null;
  for (let i = 0; i < ns; i++) {
    const s = L * i / (ns - 1), p = at(s), p2 = at(Math.min(L, s + 0.05)), p1 = at(Math.max(0, s - 0.05));
    const t = vnorm(vsub(p2, p1));
    let w = frame(s, p); w = vnorm(vsub(w, vmul(t, vdot(w, t))));
    if (prevW && vdot(w, prevW) < 0) w = vmul(w, -1);
    prevW = w;
    let b = vcross(t, w); if (vdot(b, vsub(p, center)) < 0) b = vmul(b, -1);
    const [hw, hh, lift = 0] = shape(s, L - s), C = vadd(p, vmul(b, lift + (extra ? extra[i] : 0))), rC = Math.hypot(...vsub(C, center)), out1 = vnorm(vsub(C, center));
    // near the eye the muscle lies on it: its width curves round the eye instead of standing off it flat
    const k2 = rC < EYE_R + 4 ? smooth((EYE_R + 4 - rC) / 3) : 0;
    for (let j = 0; j <= na && !ringsOnly; j++) {
      const a = 2 * Math.PI * j / na, ca = Math.cos(a), sa = Math.sin(a), k = (i * (na + 1) + j) * 3;
      let q = vadd(C, vadd(vmul(w, hw * ca), vmul(b, hh * sa))), nn = vnorm(vadd(vmul(w, ca / hw), vmul(b, sa / hh)));
      if (k2 > 0) {
        const d = vnorm(vsub(q, center)), q2 = vadd(center, vmul(d, rC + vdot(b, out1) * hh * sa));
        q = vadd(vmul(q, 1 - k2), vmul(q2, k2));
        const n2 = vnorm(vadd(vmul(d, sa), vmul(w, ca * 0.6))); nn = vnorm(vadd(vmul(nn, 1 - k2), vmul(n2, k2)));
      }
      pos.set(q, k); nor.set(nn, k);
    }
    rings.push({ s, C: vsub(C, center), t, w, b, hw, hh, rC, k2 });
  }
  return { pos, nor, rings, L };
}
// Where two muscles cross, one lies on the eye and the other rides over it. The tendon of the superior oblique runs
// under the superior rectus [shumway]. The inferior oblique passes between the inferior rectus and the floor of the
// orbit, so it is the outer one, and it ends under the lateral rectus [gupta]. Each rider: those beneath it.
export const RIDES = { sr: ['so'], io: ['ir'], lr: ['io', 'so'] };
const RIDE_GAP = 0.3;                                    // mm kept between the two where they cross
const NEAR_EYE = EYE_R + 10;                             // one muscle rides over another only this near the eye: farther back they lie side by side
// On the shortest path the superior oblique's tendon would hang in the air over the inner edge of the superior rectus
// and pass through it on the way down to the eye. A rectus drawn tight would hold it down. So the tendon is drawn
// meeting the eye sooner: a little before the place where the superior rectus first lies over its way (HELD names the
// holder), and from there it lies on the eye. Its length stays the shortest path's length.
export const HELD = { so: 'sr' };
// how far round from the loop's direction (radians) the tendon may first touch the eye, given the holder's rings
function contactFor(w0, holder, hwSelf) {
  const O = w0.on(0), e1 = vmul(O, 1 / WRAP_R), n = w0.normal, e2 = vcross(n, e1); let best = w0.thT;
  for (const r of holder.rings) { if (r.rC > WRAP_R + 4) continue;
    for (const f of [-1, 0, 1]) { const E = vadd(r.C, vmul(r.w, f * r.hw)), th = Math.atan2(vdot(E, e2), vdot(E, e1)); if (th < -0.5) continue;
      const c = th - 0.3 + 3 * (1 - smooth((hwSelf + 2.5 - Math.abs(vdot(E, n))) / 1.5)) + 3 * (1 - smooth(WRAP_R + 4 - r.rC)); if (c < best) best = c; } }
  return Math.max(0.05, best);
}
const L0 = {};                                            // each muscle's length with the eye looking straight ahead
const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
// One muscle's body for the eye turned by R, about the eye's center `center`. under: the built bodies it rides over.
// holder: the body (its rings on the shortest path are enough) that holds this one's tendon down onto the eye.
// A muscle keeps its volume: as it shortens its belly grows wider and thicker, and as it lengthens it thins. Its
// thickness does not follow its nerve signal. The length is the path's length, whatever the body rides over.
export function muscleBody(m, R, side = 1, center = [0, 0, 0], under = null, holder = null) {
  const path = musclePath(m, R, side, WRAP_R), L = path.L, key = m.id + side, { ns } = TUBE;
  let parts = path.parts, Ld = L;
  if (m.troch && holder) { const O = [side * m.troch[0], m.troch[1], m.troch[2]], w0 = parts[1], sign = vdot(vcross(w0.on(0), w0.on(0.1)), w0.normal) < 0 ? -1 : 1;
    const held = wrap(O, path.I, WRAP_R, 0, contactFor({ on: w0.on, thT: w0.thT, normal: vmul(w0.normal, sign) }, holder, 1.5)); parts = [parts[0], held]; Ld = parts[0].L + held.L; }
  const last = parts[parts.length - 1];
  const at0 = (s) => { for (const p of parts) { if (s <= p.L || p === last) return p.at(Math.min(1, s / p.L)); s -= p.L; } return null; };
  const at = (s) => vadd(at0(s), center);
  if (!(key in L0)) L0[key] = musclePath(m, I3, side, WRAP_R).L;
  const swell = Math.sqrt(L0[key] / L), nW = last.normal, frame = () => nW;
  const shape = (s, e) => { const [w, h] = muscleShape(m, s, e), g = e > m.tendon + 3 ? swell : 1, hh = h * g; return [w * g, hh, Math.max(0, hh - 0.35)]; };
  let body = tube(at, Ld, frame, shape, center, null, !!under), extra = null;
  if (under) {
    // Lift each ring along its own outward direction until its inner face is clear of every stretch of muscle beneath
    // it. A stretch is beneath a ring when the two overlap as seen along that direction; the lift comes in smoothly
    // as they come to overlap, so that nothing jumps as the eye turns.
    const need = new Float32Array(ns), sp = Ld / (ns - 1), M = 1.5, W = 4;
    for (let i = 0; i < ns; i++) {
      const r = body.rings[i], nearI = smooth(NEAR_EYE + 1 - r.rC); if (nearI <= 0) continue;
      const b = r.b, t = r.t, w = r.w, C = r.C;
      for (const u of under) { const su = u.L / (ns - 1) * 0.5;
        for (let k = u.first || 0; k < ns; k++) {
          const q = u.rings[k], dx = q.C[0] - C[0], dy = q.C[1] - C[1], dz = q.C[2] - C[2]; if (dx * dx + dy * dy + dz * dz > 225) continue;
          const nearK = smooth((u.onEye || NEAR_EYE) + 1 - q.rC); if (nearK <= 0) continue;
          const off = dx * b[0] + dy * b[1] + dz * b[2];
          const ww = Math.abs(q.w[0] * w[0] + q.w[1] * w[1] + q.w[2] * w[2]), tw = Math.abs(q.t[0] * w[0] + q.t[1] * w[1] + q.t[2] * w[2]);
          const wt = Math.abs(q.w[0] * t[0] + q.w[1] * t[1] + q.w[2] * t[2]), tt = Math.abs(q.t[0] * t[0] + q.t[1] * t[1] + q.t[2] * t[2]);
          const aw = Math.abs(dx * w[0] + dy * w[1] + dz * w[2]) - (r.hw + q.hw * ww + su * tw), at2 = Math.abs(dx * t[0] + dy * t[1] + dz * t[2]) - (sp * 0.5 + q.hw * wt + su * tt);
          if (aw >= M || at2 >= M) continue;
          // how far the stretch reaches along the ring's outward direction, past the ring's inner face
          const wb = Math.abs(q.w[0] * b[0] + q.w[1] * b[1] + q.w[2] * b[2]), nb = Math.abs(q.b[0] * b[0] + q.b[1] * b[1] + q.b[2] * b[2]);
          const lam = Math.min(8, off + Math.sqrt(q.hw * wb * q.hw * wb + q.hh * nb * q.hh * nb) + r.hh + RIDE_GAP); if (lam <= 0) continue;
          const v = lam * smooth((M - aw) / M) * smooth((M - at2) / M) * nearI * nearK; if (v > need[i]) need[i] = v;
        } }
    }
    if (need.some((v) => v > 0)) {
      // spread the lift over W rings each way and smooth it, never below what a ring asked for; it dies away over the
      // last 1.2 mm, so that the muscle still ends where it is fixed to the eye
      const wide = new Float32Array(ns); extra = new Float32Array(ns);
      for (let i = 0; i < ns; i++) for (let k = Math.max(0, i - W); k <= Math.min(ns - 1, i + W); k++) wide[i] = Math.max(wide[i], need[k]);
      for (let i = 0; i < ns; i++) { let a = 0; for (let k = i - W; k <= i + W; k++) a += wide[clamp(k, 0, ns - 1)]; extra[i] = a / (2 * W + 1) * smooth((Ld - body.rings[i].s) / 1.2); }
      body = tube(at, Ld, frame, shape, center, extra);
    } else body = tube(at, Ld, frame, shape, center);
  }
  body.extra = extra; body.L = L; body.I = vadd(path.I, center);
  // of a muscle that runs through the loop, only the stretch from the loop to the eye can lie under another, and of
  // that stretch only what lies on the eye: the free run down from the loop is not something to ride over
  if (m.troch) { body.first = body.rings.findIndex((r) => r.s >= parts[0].L); body.onEye = WRAP_R + 2; }
  return body;
}
// all six bodies of one eye: first those that lie on the eye, then each rider over what is beneath it.
// ride: false leaves every muscle on its shortest path, through whatever it crosses (the tests use it to see the fault).
export function eyeMuscles(R, side = 1, center = [0, 0, 0], ride = true) {
  const out = {}, by = Object.fromEntries(MUSCLES.map((m) => [m.id, m]));
  if (!ride) { for (const m of MUSCLES) out[m.id] = muscleBody(m, R, side, center); return out; }
  for (const m of MUSCLES) if (!RIDES[m.id]) out[m.id] = muscleBody(m, R, side, center, null, HELD[m.id] ? muscleBody(by[HELD[m.id]], R, side, center, []) : null);
  for (const id of ['sr', 'io', 'lr']) out[id] = muscleBody(by[id], R, side, center, RIDES[id].map((k) => out[k]));
  return out;
}
