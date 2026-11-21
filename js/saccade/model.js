// Overshoot saccades: the model. Everything the page draws and every number it shows comes from here.
// Angles are in degrees, times in seconds, lengths in millimeters. Pure code, no page: tests run it in Node.
//
// The head's frame: x to the person's right, y up, z backward (out of the back of the head), so the eyes
// look down -z at a screen 600 mm away. Each eye's center is the origin of its own frame.

export const STEP = 0.001;                       // the simulation steps 1 ms at a time

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
  sample: 0.09,                                  // the jump is sized from what the eye saw 90 ms before it starts [amplitude]
  slipMax: 15,                                   // the slip that counts toward the size stops growing at 15°/s [amplitude]
  lead: 0.2,                                     // the slip is multiplied by this time and added (model's choice, see facts.js)
  onTarget: 0.4,                                 // a jump "lands on the target" within this distance: the drawn target's radius
};

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
export const TARGET = { amp: 12, still: 1, learn: 1 };  // swings 12° either side of center; "still" below 1°/s
// A target that swings back and forth in a regular way is predictable. After about a second of it, pursuit no longer
// lags by its latency: the brain moves the eye with the target, not 100 ms behind it [barnes].

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const len2 = (x, y) => Math.hypot(x, y);
// The target swings like a pendulum (a sine wave), as in clinical pursuit tests. speed is its top speed, at the center.
export const swing = (ph, A = TARGET.amp) => A * Math.sin(ph);
// the phase that puts it at x going right (to pick up again where a dragged target was left)
export const unswing = (x, A = TARGET.amp) => Math.asin(clamp(x / A, -1, 1));

// ---- the simulation ----
// cond: 'healthy' or 'poor'. speed: the target's speed in °/s. auto: the target moves by itself.
export function makeSim({ cond = 'healthy', speed = 20, auto = true } = {}) {
  const N = 4096;                                // 4 s of history, one sample per ms
  const B = { th: new Float32Array(N), tv: new Float32Array(N), eh: new Float32Array(N), ev: new Float32Array(N),
    vth: new Float32Array(N), vtv: new Float32Array(N), ph: new Float32Array(N), pv: new Float32Array(N), sac: new Uint8Array(N) };
  const s = { t: 0, k: 0, cond, speed, auto, ph: 0, autoSince: 0, T: [0, 0], Tv: [0, 0], E: [0, 0], Ve: [0, 0], Vp: [0, 0], sac: null, pending: null,
    events: [], lastEnd: -1, from: null, to: null };
  const at = (j) => ((j % N) + N) % N;
  // the target's velocity, averaged over the 20 ms before step j (one sample is jittery when a finger drags it)
  const tvel = (j) => { let h = 0, v = 0; for (let i = 0; i < 20; i++) { h += B.vth[at(j - i)]; v += B.vtv[at(j - i)]; } return [h / 20, v / 20]; };

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
    // pursuit: the eye's smooth speed heads for gain × the target's speed as it was a latency ago
    const learned = s.auto && s.t - s.autoSince >= TARGET.learn;
    const g = PURSUIT.gain[s.cond], vt = tvel(k - (learned ? 0 : Math.round(PURSUIT.latency / STEP)));
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
        if (txe < CATCHUP.txe[0] || txe > CATCHUP.txe[1]) s.pending = { at: s.t + (len2(v[0], v[1]) < TARGET.still ? CATCHUP.still : CATCHUP.latency), decided: s.t };
      }
    }
  }
  function start() {
    s.pending = null;
    const j = s.k - Math.round(CATCHUP.sample / STEP), J = at(j), v = tvel(j);
    const pe = [B.th[J] - B.eh[J], B.tv[J] - B.ev[J]];
    let rs = [v[0] - B.ph[J], v[1] - B.pv[J]]; const m = len2(rs[0], rs[1]); if (m > CATCHUP.slipMax) rs = rs.map((x) => x * CATCHUP.slipMax / m);
    const A = [pe[0] + rs[0] * CATCHUP.lead, pe[1] + rs[1] * CATCHUP.lead], a = len2(A[0], A[1]);
    if (a < 0.1) return;
    s.sac = { t0: s.t, D: duration(a), A, amp: a, E0: s.E.slice(), T0: s.T.slice(), Tv0: tvel(s.k) };
  }
  function end(q) {
    s.sac = null; s.lastEnd = s.t;
    const E1 = [s.E[0], s.E[1]], v = q.Tv0, sp = len2(v[0], v[1]);
    const ev = { t0: q.t0, t1: s.t, Tv0: q.Tv0, amp: q.amp, D: q.D, peak: peakSpeed(q.amp), A: q.A, E0: q.E0, E1, T0: q.T0, T1: s.T.slice() };
    const tol = CATCHUP.onTarget;
    if (sp >= TARGET.still) {
      // moving target: the kinds used in clinical studies of pursuit [sanz]
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
      if (o.speed !== undefined && o.speed !== s.speed) { const x = s.T[0] / TARGET.amp, c = Math.cos(s.ph); s.speed = o.speed; if (s.auto) s.ph = Math.atan2(x, c); }
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
export const OPTIC = { exit: unitAt([-0.25, -0.08, 0.96]), apex: APEX };

// the straight run from a fixed point O to the eye, then the arc round the eye to the insertion I (both in the eye's
// frame, I already turned with the eye). Returns the points along it and its length. r: radius it wraps at.
export function wrap(O, I, r = EYE_R, n = 0) {
  const lo = Math.hypot(...O), e1 = O.map((x) => x / lo);
  const d = I[0] * e1[0] + I[1] * e1[1] + I[2] * e1[2];
  let e2 = [I[0] - d * e1[0], I[1] - d * e1[1], I[2] - d * e1[2]]; const l2 = Math.hypot(...e2); e2 = e2.map((x) => x / l2);
  const thI = Math.atan2(I[0] * e2[0] + I[1] * e2[1] + I[2] * e2[2], d), ri = Math.hypot(...I);
  const thT = Math.acos(clamp(r / lo, -1, 1));
  const P = (th, rr) => [rr * (Math.cos(th) * e1[0] + Math.sin(th) * e2[0]), rr * (Math.cos(th) * e1[1] + Math.sin(th) * e2[1]), rr * (Math.cos(th) * e1[2] + Math.sin(th) * e2[2])];
  const normal = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  if (thI <= thT) {                                        // the insertion can be seen from O: a straight line
    const L = Math.hypot(I[0] - O[0], I[1] - O[1], I[2] - O[2]);
    return { L, straight: L, arc: 0, T: I, normal, at: (u) => [O[0] + (I[0] - O[0]) * u, O[1] + (I[1] - O[1]) * u, O[2] + (I[2] - O[2]) * u] };
  }
  const T = P(thT, r), Ls = Math.sqrt(Math.max(0, lo * lo - r * r)), La = ri * (thI - thT), L = Ls + La;
  return { L, straight: Ls, arc: La, T, normal,
    at: (u) => { const s = u * L; if (s <= Ls) { const f = s / Ls; return [O[0] + (T[0] - O[0]) * f, O[1] + (T[1] - O[1]) * f, O[2] + (T[2] - O[2]) * f]; } return P(thT + (s - Ls) / ri, ri); } };
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
