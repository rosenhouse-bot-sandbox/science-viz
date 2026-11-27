// The challenges. Each one is a brief, a few things the player can change, a scene built from
// those, and a score read off the traced rays. Text here states what the model does; every number
// shown while playing is computed from the trace.

import { AIR, BK7, F2, NSF10, CAF2, CR39, EYE, GREEN, WHITE, abbe } from './glass.js';
import { trace, beam, lens, stack, paraxial, seg, arc, conic, conicSag, mirror, WAVE_K } from './trace.js';

const DEG = Math.PI / 180;
const f0 = (v) => v.toFixed(0), f1 = (v) => v.toFixed(1), f2 = (v) => v.toFixed(2);
const signed = (v, d) => (v < 0 ? '−' : v > 0 ? '+' : '') + Math.abs(v).toFixed(d);
const mm = (R) => (isFinite(R) && Math.abs(R) < 1e5 ? f0(Math.abs(R)) + ' mm' : 'flat');
// A face of a lens in words: `out` is -1 for a front face, +1 for a back face.
const side = (R, out) => (isFinite(R) && Math.abs(R) < 1e5 ? (Math.sign(R) === -out ? 'bulging ' : 'hollow ') + f0(Math.abs(R)) + ' mm' : 'flat');
// A sentence, a key line or a note may be a function of what was built, so that its numbers are the model's.
export const say = (v, b) => (typeof v === 'function' ? v(b) : v);

// Light that arrives at the target, as numbers. `ring` weights each ray by its distance from the
// axis: on the axis of a round lens, a ray at height s stands for a ring of light of radius s.
// Rays may carry a group number c (a wavelength, or a direction); each group is also tallied alone,
// with its blur measured about the axis (`blur`) and about its own middle (`spread`).
//
// Light is a wave, so the traced spot is not the whole blur. `N` lists each group's f-number: how
// far its light travels from the opening to the target, over the opening's width. The wave spreads
// the light by WAVE_K·λ·N (see trace.js), and two independent spreads add as squares. Every blur
// handed on is the two together; `traced` keeps the rays' part and `wave` the wave's. `Nx` is the
// f-number across the picture, where that differs (light that lands on a slant).
function tally(scene, rays, ring, N, Nx) {
  let all = 0, got = 0, u2 = 0, via = 0, viaGot = 0, wave2 = 0;
  const hits = [], groups = [], s = [];
  for (const r of rays) {
    const w = ring ? Math.abs(r.s) : 1, o = trace(scene, r), c = r.c || 0;
    const G = groups[c] || (groups[c] = { w: 0, u: 0, u2: 0, nm: r.nm });
    all += w;
    const used = o.tags.has('part');
    if (used) via += w;
    if (o.end === 'target') { got += w; u2 += w * o.u * o.u; hits.push(o.u, w, c); s.push(r.s); if (used) viaGot += w; G.w += w; G.u += w * o.u; G.u2 += w * o.u * o.u; }
  }
  groups.forEach((G, c) => {
    G.wave = N ? WAVE_K * G.nm * 1e-6 * N[c] : 0;             // nm to mm
    G.waveX = Nx ? WAVE_K * G.nm * 1e-6 * Nx[c] : G.wave;
    G.traced = G.w ? 2 * Math.sqrt(G.u2 / G.w) : Infinity;
    G.tracedSpread = G.w ? 2 * Math.sqrt(Math.max(0, G.u2 / G.w - (G.u / G.w) ** 2)) : Infinity;
    G.blur = Math.hypot(G.traced, G.wave); G.spread = Math.hypot(G.tracedSpread, G.wave);
    wave2 += G.w * G.wave * G.wave;
  });
  const traced = got ? 2 * Math.sqrt(u2 / got) : Infinity, wave = got ? Math.sqrt(wave2 / got) : 0;
  return { share: all ? got / all : 0, viaShare: via ? viaGot / via : 0, via: all ? via / all : 0, viaGot,
    traced, wave, blur: Math.hypot(traced, wave), hits, groups, s };
}

// White light: the same bundle at each of three wavelengths.
const white = (src, n) => WHITE.flatMap((col, c) => beam({ ...src, n, nm: col.nm }).map((r) => ({ ...r, c, rgb: col.rgb })));
// Where the rays that leave a lens (a list of traces, with their weights) are tightest about the axis.
// Each ray leaves as a straight line y = a + b·x, so the plane where the ring-weighted mean square
// height is least has a closed form.
function bestFocus(scene, rays) {
  let sab = 0, sbb = 0;
  for (const r of rays) {
    const o = trace(scene, r), k = o.pts.length;
    if (o.end !== 'out' || k < 6) continue;
    const bb = (o.pts[k - 1] - o.pts[k - 3]) / (o.pts[k - 2] - o.pts[k - 4]), a = o.pts[k - 1] - bb * o.pts[k - 2], w = Math.abs(r.s);
    sab += w * a * bb; sbb += w * bb * bb;
  }
  return sbb ? -sab / sbb : NaN;
}
const GLASSES = [CAF2, BK7, F2, NSF10];
const focusRows = (surfaces, from) => WHITE.map((col) => [f0(col.nm) + ' nm focuses', f1(paraxial(surfaces, col.nm).at - from) + ' mm behind']);

// A crown glass lens of focal length f, bent by q: −1 is flat in front, 0 the same on both sides,
// +1 flat behind, and past those one face is hollow. Bending changes the faces and the thickness
// but not the focal length, so the curves are scaled until the thick lens has exactly f.
function bent(q, f, h) {
  const n = BK7.n(GREEN);
  let k = 1, L, R1, R2;
  for (let i = 0; i < 12; i++) {
    const c1 = k * (q + 1) / (2 * (n - 1) * f), c2 = k * (q - 1) / (2 * (n - 1) * f);
    R1 = Math.abs(c1) > 1e-9 ? 1 / c1 : Infinity; R2 = Math.abs(c2) > 1e-9 ? 1 / c2 : Infinity;
    L = lens({ x: 0, h, R1, R2, mat: BK7, tag: 'part' });
    k *= L.focal(GREEN) / f;
  }
  return { L, R1, R2 };
}
// The four sides of a straight bar from (ax, ay) to (bx, by), w wide.
function bar(ax, ay, bx, by, w, extra) {
  const l = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / l * w / 2, ny = (bx - ax) / l * w / 2;
  return [seg(ax + nx, ay + ny, bx + nx, by + ny, extra), seg(bx + nx, by + ny, bx - nx, by - ny, extra),
    seg(bx - nx, by - ny, ax - nx, ay - ny, extra), seg(ax - nx, ay - ny, ax + nx, ay + ny, extra)];
}
// The share of light that the two faces of a lens reflect away (Fresnel, head-on). It is not traced.
const reflected = (mat) => 1 - (1 - ((mat.n(GREEN) - 1) / (mat.n(GREEN) + 1)) ** 2) ** 2;
// The Sun's width in the sky from 1 AU: 1919 seconds of arc (NASA Sun Fact Sheet, nssdc.gsfc.nasa.gov).
const SUN_WIDTH = 1919 / 3600 * DEG;

// Every goal is judged on the number the meter shows, so a meter never reads as meeting its goal
// when it does not (or the other way round).
// A bar that fills as the picture gets sharper. The player is after sharpness, so that is what the
// bar is called and what grows; the number beside it is the blur, which shrinks.
const sharp = (label, um, goal, digits = 0) => { const shown = um.toFixed(um < 10 ? digits : 0);
  return { label, goal: `blur ${goal} µm or less`, ok: +shown <= goal, frac: goal / um, text: isFinite(um) ? 'blur ' + shown + ' µm' : 'no light' }; };
// A quantity that has to land inside a band: drawn as a marker on a scale, not as a bar that fills.
const band = (label, value, lo, hi, min, max, digits) => { const shown = value.toFixed(digits);
  return { label, text: shown + ' mm', goal: `${lo} to ${hi} mm`, ok: +shown >= lo && +shown <= hi, range: { lo, hi, min, max, value } }; };
// A share of light as a whole percentage, with a goal it must reach.
const percent = (label, share, goal) => ({ label, text: f0(share * 100) + '%', goal: `${goal}% or more`, ok: +f0(share * 100) >= goal, frac: share * 100 / goal });
const all = (meters) => meters.every((m) => m.ok);

// Handles: how a drag on the picture changes a setting. `hit` says how near a point (in world
// units, with px per unit) is, or Infinity; `start` remembers the grab; `move` returns the value.
const slideX = (param, x, h, pad, ky) => ({ param, cursor: 'ew', knobs: [[x, ky]],
  hit: (wx, wy, k) => (Math.abs(wy) <= h + pad + 10 / k && Math.abs(wx - x) * k <= 26 ? Math.abs(wx - x) : Infinity),
  start: (wx, wy, v) => v - wx, move: (wx, wy, c) => wx + c });

// The candle bench of the first picture challenges: a candle d from a plate with a hole D across,
// a lens that fills the hole or nothing in it, and a screen. Two points of the candle are traced,
// its tip and its foot, each as a fan of light spread across the opening. Distances are from the
// plate, which is also the middle of the lens.
const TIP = 10, SCREEN = 19, HOLE = 16;      // the candle's half height, the screen's, and the widest hole (mm)
const candleLens = (D) => lens({ x: 0, h: D / 2, R1: 41.4, R2: -41.4, mat: BK7, tmin: 1, tag: 'part' });
const FOCAL = candleLens(HOLE).focal(GREEN);
function candle(level, p, { lens: has, D, d }) {
  const L = candleLens(D);
  const optics = [...(has ? L.surfaces : []), seg(0, D / 2, 0, SCREEN, { act: 'absorb' }), seg(0, -D / 2, 0, -SCREEN, { act: 'absorb' })];
  const surfaces = [...optics, seg(p.xs, -SCREEN, p.xs, SCREEN, { act: 'target' })];
  const x0 = level.bounds[0], xo = -d;
  // a ray from a point of the candle to (xa, s); drawn from the candle, or from the edge of the bench
  const toward = (yo, xa, s, more) => {
    const len = Math.hypot(xa - xo, s - yo), dx = (xa - xo) / len, dy = (s - yo) / len, x = Math.max(xo, x0 - 1);
    return { x, y: yo + (x - xo) * dy / dx, dx, dy, nm: GREEN, s, ...more };
  };
  // the fan is spread across the opening: the front rim of the lens, or the hole in the plate
  const xa = has ? L.outline[0] : 0;
  const fan = (yo, c, rgb, n, half) => Array.from({ length: n }, (_, i) => toward(yo, xa, n === 1 ? 0 : -half + 2 * half * i / (n - 1), { c, rgb }));
  const on = xo >= x0 + 4;
  // Where the middle of each point's light lands: the ray through the middle of the opening. The
  // picture's size and place come from these two, whatever part of the light the screen catches.
  const tall = { surfaces: [...optics, seg(p.xs, -1e4, p.xs, 1e4, { act: 'target' })], bounds: level.bounds };
  const chief = [TIP, -TIP].map((yo) => { const o = trace(tall, toward(yo, 0, 0)); return o.end === 'target' ? o.u : NaN; });
  return { surfaces, ring: true, L, d, D, has, chief, N: [p.xs / D, p.xs / D],
    draw: [...fan(TIP, 0, null, on ? 13 : 5, on ? 17 : D / 2 * 0.92), ...fan(-TIP, 1, [150, 205, 255], on ? 13 : 5, on ? 17 : D / 2 * 0.92)],
    probe: [...fan(TIP, 0, null, 121, D / 2 * 0.999), ...fan(-TIP, 1, null, 121, D / 2 * 0.999)],
    // The panel. A picture under 1 mm tall has no shape to show and is drawn as a dot. The light on
    // each part of the picture goes with the opening's area over the picture's area, so with
    // (D / distance to the screen)²: `light` is that, against the widest hole with the screen one
    // focal length back (the brightest sharp picture this lens can make).
    picture: { tip: TIP, half: SCREEN, at: chief, dot: Math.abs(chief[0] - chief[1]) < 1, light: (D / HOLE) ** 2 * (FOCAL / p.xs) ** 2 },
    items: [...(on ? [{ t: 'candle', x: xo, tip: TIP }] : []), ...(has ? [{ t: 'glass', outline: L.outline }] : []),
      { t: 'iris', x: 0, open: D / 2, h: SCREEN }, { t: 'sensor', x: p.xs, h: SCREEN }],
    handles: [slideX('xs', p.xs, SCREEN, 4, -SCREEN)] };
}
const worst = (m) => Math.max(m.groups[0] ? m.groups[0].spread : Infinity, m.groups[1] ? m.groups[1].spread : Infinity);
const sharpMM = (blur, goal) => ({ label: 'Sharpness', goal: `blur ${goal} mm or less`, ok: +f2(blur) <= goal, frac: goal / blur, text: isFinite(blur) ? 'blur ' + f2(blur) + ' mm' : 'no light' });
// how big the picture is, from where the middle of the light of the two points lands
const size = (b) => { const k = (b.chief[0] - b.chief[1]) / (2 * TIP); if (!isFinite(k)) return 'no light'; if (Math.abs(k) < 0.005) return 'a single spot'; return f2(Math.abs(k)) + ' times, ' + (k < 0 ? 'upside down' : 'upright'); };
// a distance in meters, rounded down so that a goal it has not reached never reads as reached
const inMeters = (d) => (Math.floor(d / 100 + 1e-6) / 10).toFixed(1) + ' m';

// The match: its head is a ball, and its stick a bar that runs down and back from under the head.
const HEAD = 0.75, STICK = [HEAD, -HEAD, HEAD + 5, -19, 1.1];

// The eye of the glasses challenge. One surface does all its bending (the "reduced eye"), and it is
// a little too long for that surface. The surface flattens toward its edge by just enough to give
// the eye the spherical aberration of an average real eye. Kingston and Cox, Clinical Ophthalmology
// 7:933 (2013), measured 1,124 eyes: on average +0.18 µm of Zernike spherical aberration over a
// 6.0 mm pupil. The r⁴ part of that mode is 6·√5·c·(h/r)⁴ of extra path at height h. A ray's turn is
// the slope of the path, so the eye is stronger at height h than at its middle by 24·√5·c·h²/r⁴.
const EYE_SA = { c: 0.18e-3, r: 3 };                                    // mm
export const eyeSA = (h) => 24 * Math.sqrt(5) * EYE_SA.c * h * h / EYE_SA.r ** 4 * 1000;   // diopters
export const EYEBALL = { LEN: 23.45, RB: 11.2, RC: 5.55, PUPIL: 1.5, VERTEX: 12 };
// The eye's error: how much weaker light must arrive at the cornea to focus on the retina. Light
// that would focus there comes from the eye's far point, 1/K in front of it. A lens VERTEX in
// front of the eye needs K / (1 + VERTEX·K) to do the same: its light spreads on the way.
export const EYE_K = (EYE.n(GREEN) / EYEBALL.LEN - (EYE.n(GREEN) - 1) / EYEBALL.RC) * 1000;
export const EYE_NEED = EYE_K / (1 + EYEBALL.VERTEX / 1000 * EYE_K);
// How much stronger (diopters) a one-surface eye of conic constant Q is for a ray at height h than
// for one at its middle. The light comes from the far point, as it does through the right glasses
// and as it does (run backward) when an eye's aberration is measured.
export function surfaceSA(Q, h) {
  const n = EYE.n(GREEN), s = conic(0, EYEBALL.RC, Q, h * 1.3, { act: 'refract', nL: AIR, nR: EYE }), xo = 1000 / EYE_K;
  const o = trace({ surfaces: [s], bounds: [-1000, -100, 1000, 100] }, { x: xo, y: 0, dx: -xo, dy: h, nm: GREEN });
  const sl = (o.pts[5] - o.pts[3]) / (o.pts[4] - o.pts[2]);
  return (n / (o.pts[2] - o.pts[3] / sl) - n / EYEBALL.LEN) * 1000;
}
// The eye turns about the centre of the cornea's curve, so that far in front of the retina is what
// turns an angle in the world into a distance on the retina: micrometers for one minute of arc.
const ARCMIN = (EYEBALL.LEN - EYEBALL.RC) * 1000 * Math.PI / 10800;
// The conic constant that gives the measured amount at the edge of this eye's pupil (found by halving).
export const CORNEA_Q = (() => {
  let a = -0.99, b = 0;
  for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (surfaceSA(m, EYEBALL.PUPIL) < eyeSA(EYEBALL.PUPIL)) a = m; else b = m; }
  return (a + b) / 2;
})();
// A spectacle lens of back vertex power P (diopters), its back face at x2. Both faces curve the
// same way (a meniscus), as real ones do. The front face is this page's choice: 6 D for no power,
// flatter for a spreading lens and steeper for a gathering one. The back face then follows from P.
function spectacle(P, x2) {
  const n = CR39.n(GREEN), F1 = (P > 0 ? 6 + P : 6 + P / 2) / 1000, R1 = (n - 1) / F1;
  let R2 = R1, L;
  for (let i = 0; i < 12; i++) {
    L = lens({ x: 0, h: 20, R1, R2, mat: CR39, tmin: 1.5, tag: 'part' });
    R2 = (1 - n) / (P / 1000 - F1 / (1 - L.t * F1 / n));      // back vertex power = F2 + F1 / (1 − t·F1/n)
  }
  return lens({ x: x2 - L.t / 2, h: 20, R1, R2, mat: CR39, tmin: 1.5, tag: 'part' });
}

// The blur the glasses must reach, and where two benches end (mm). The model test checks that every setting focuses short of the end.
const SPECS_GOAL = 6, DOUBLET_END = 112, WIDE_END = 72;

// The heliostat field.
const FIELD = { SUN: 40 * DEG, XT: 150, Y0: 82, Y1: 100, PIV: [[22, 7], [64, 7], [106, 7]], W: 8 };
const boiler = () => [
  seg(FIELD.XT, FIELD.Y0, FIELD.XT, FIELD.Y1, { act: 'target' }),
  seg(FIELD.XT, 0, FIELD.XT, FIELD.Y0, { act: 'absorb' }), seg(FIELD.XT, FIELD.Y1, FIELD.XT + 9, FIELD.Y1, { act: 'absorb' }), seg(FIELD.XT + 9, 0, FIELD.XT + 9, FIELD.Y1, { act: 'absorb' }),
  seg(-400, 0, 400, 0, { act: 'absorb' })];
const heliostat = (i, tilt) => mirror(FIELD.PIV[i][0], FIELD.PIV[i][1], (90 - tilt) * DEG, FIELD.W, { tag: 'part' });
// The sunlight headed for one mirror: a beam as wide as the mirror, so a mirror turned from the Sun catches less of it.
const sunbeam = (i, half, n) => { const [px, py] = FIELD.PIV[i], dir = -FIELD.SUN, back = 150; return beam({ ox: px - Math.cos(dir) * back, oy: py - Math.sin(dir) * back, angle: dir, half, n, nm: GREEN }); };
// The most light the three mirrors can put on the boiler: each mirror's best over every tilt its
// slider has, added up. The boiler's meter is measured against this fixed amount.
let fieldBest = 0;
function fieldFull(q, bounds) {
  if (fieldBest) return fieldBest;
  for (let i = 0; i < FIELD.PIV.length; i++) {
    let best = 0;
    for (let t = q.min; t <= q.max + 1e-9; t += q.step) {
      const scene = { surfaces: [...boiler(), heliostat(i, t)], bounds };
      let n = 0; for (const r of sunbeam(i, FIELD.W / 2, 81)) if (trace(scene, r).end === 'target') n++;
      best = Math.max(best, n);
    }
    fieldBest += best;
  }
  return fieldBest;
}

export const LEVELS = [
  // ───────────────────────────────────────────────────────────── 1
  {
    id: 'burn', nav: 'Match', unit: 'mm', scale: 'Bench 126 mm long',
    title: 'Light the match',
    task: 'Slide the lens and change its curve until the sunlight meets on the match head.',
    brief: 'Sunlight arrives from the left as parallel rays. Drag the white knob to slide the lens along its rail.',
    learned: `A lens that bulges in the middle bends parallel rays to one meeting point, its focus. The distance from lens to focus is the focal length, and stronger curves make it shorter. Look at the outermost rays: they cross a little early. That is spherical aberration, and it comes back in the camera challenge. The Sun is traced here as a single far-off point. Its real image is a disc about 1 mm across for every ${f0(1 / SUN_WIDTH / 10) * 10} mm of focal length.`,
    key: [['k-ray', 'Sunlight, one wavelength (550 nm)'], ['k-glass', `Crown glass lens. A real lens reflects about ${f0(reflected(BK7) * 100)}% of the light away. That loss is not traced.`], ['k-target', `Match head, ${f1(2 * HEAD)} mm`]],
    bounds: [-112, -25, 14, 25],
    params: [
      { id: 'x', label: 'Lens position', min: -78, max: -42, step: 0.25, value: -50, show: (v) => f1(-v) + ' mm from the match' },
      { id: 'c', label: 'Curve of the faces', min: 5, max: 25, step: 0.1, value: 6.5, show: (v) => 'radius ' + f0(1000 / v) + ' mm' },
    ],
    build(p) {
      const R = 1000 / p.c;
      const L = lens({ x: p.x, h: 15, R1: R, R2: -R, mat: BK7, tag: 'part' });
      // the head is a ball that counts the light on its lit side; the stick stops what passes under it
      const surfaces = [...L.surfaces,
        arc(HEAD, 0, HEAD, -1, HEAD, { act: 'target' }), arc(HEAD, 0, HEAD, 1, HEAD, { act: 'absorb' }),
        ...bar(...STICK, { act: 'absorb' })];
      const src = { ox: -112, oy: 0, half: 14.6, nm: GREEN };
      return { surfaces, ring: true, L,
        draw: beam({ ...src, n: 15 }), probe: beam({ ...src, n: 241 }),
        items: [{ t: 'axis' }, { t: 'rail', x0: -78, x1: -42, y: -21 }, { t: 'post', x: p.x, y0: -15, y1: -21 },
          { t: 'glass', outline: L.outline }, { t: 'match', x: 0, r: HEAD, stick: STICK }],
        handles: [slideX('x', p.x, 15, 6, -21)] };
    },
    score(m, b, p) {
      const meters = [percent('Light on the match head', m.viaShare, 90)];
      return { solved: all(meters), meters,
        rows: [['Focal length of the lens', f1(b.L.focal(GREEN)) + ' mm'], ['Lens to match', f1(-p.x) + ' mm']] };
    },
  },
  // ───────────────────────────────────────────────────────────── picture
  {
    id: 'picture', nav: 'Picture', unit: 'mm', scale: `Candle ${f0(2 * TIP)} mm tall`,
    title: 'Make a picture',
    task: 'Put a sharp, bright picture of the candle on the screen.',
    brief: 'Every point of the candle sends light out in all directions. Light from the tip of the flame is drawn in gold, and light from the foot of the candle is drawn in pale blue. The panel shows what lands on the screen. Blur is twice the average radius of one point’s spot.',
    learned: 'A picture is sharp when the light from each point of the candle lands on its own point of the screen. A small hole does it by blocking nearly all of the light. A lens bends the whole fan of light from a point back to a point, but at one distance only. That is focusing.',
    key: [['k-ray', 'Light from the tip of the flame'], ['k-ray2', 'Light from the foot of the candle'], ['k-stop', 'Plate with a hole'], ['k-glass', `Crown glass lens, ${f0(candleLens(HOLE).focal(GREEN))} mm`], ['k-target', 'Screen'], ['k-inset', 'Panel: the picture on the screen, made from the traced light. Its brightness is compressed so that a dim picture still shows.']],
    bounds: [-108, -20, 88, 20], aside: true,
    params: [
      { id: 'lens', label: 'In the hole', options: ['Nothing', 'A lens'], value: 0 },
      { id: 'D', label: 'Size of the hole', min: 1, max: HOLE, step: 0.5, value: HOLE, show: (v) => f1(v) + ' mm across' },
      { id: 'xs', label: 'Screen', min: 30, max: 84, step: 1, value: 50, show: (v) => f1(v) + ' mm behind the hole' },
    ],
    build(p) { return candle(this, p, { lens: p.lens, D: p.D, d: 100 }); },
    score(m, b, p) {
      // the light that lands on the screen, against all that the widest hole lets through
      const light = (p.D / HOLE) ** 2 * m.share, meters = [sharpMM(worst(m), 0.5), percent('Light on the screen', light, 50)];
      if (light < 0.0995) meters[1].text = f1(light * 100) + '%';
      return { solved: all(meters), meters,
        rows: [['Candle to hole', f1(b.d) + ' mm'], ['Picture, against the candle', size(b)]] };
    },
  },
  // ───────────────────────────────────────────────────────────── far
  {
    id: 'far', nav: 'Far', unit: 'mm', scale: 'Lens 10 mm across',
    title: 'Step back',
    task: 'Carry the candle far away, and keep its picture sharp.',
    brief: 'The same bench. Slide the candle away and watch the light that gets through the hole.',
    learned: 'Rays from a far-off point reach the lens parallel to each other. The lens focuses them to a small spot, one focal length behind it. That spot is the picture of the point, and the smaller it is, the sharper the picture.',
    key: [['k-ray', 'Light from the tip of the flame'], ['k-ray2', 'Light from the foot of the candle'], ['k-stop', 'Plate with a hole, 10 mm'], ['k-glass', `Crown glass lens, ${f0(candleLens(10).focal(GREEN))} mm`], ['k-target', 'Screen'], ['k-inset', 'Panel: the picture on the screen, made from the traced light. A candle too far off to show its shape is drawn as a dot big enough to see.']],
    bounds: [-108, -20, 88, 20], aside: true,
    params: [
      // the slider and the candle move the same way: left is further off
      { id: 'near', label: 'Candle', min: 0, max: 1, step: 0.01, value: 1, show: (v, b) => (b.d < 1000 ? f0(b.d) + ' mm away' : b.d < 1e5 ? inMeters(b.d) + ' away' : 'very far away') },
      { id: 'xs', label: 'Screen', min: 30, max: 84, step: 1, value: 66, show: (v) => f1(v) + ' mm behind the hole' },
    ],
    build(p) { return candle(this, p, { lens: 1, D: 10, d: p.near > 0.001 ? 100 / (p.near * p.near) : 1e7 }); },
    score(m, b) {
      const meters = [sharpMM(worst(m), 0.3), { label: 'Distance', text: b.d < 1000 ? f0(b.d) + ' mm' : b.d < 1e5 ? inMeters(b.d) : 'very far', goal: '5 m or more', ok: b.d >= 5000, frac: (1 - Math.sqrt(100 / b.d)) / (1 - Math.sqrt(100 / 5000)) }];
      return { solved: all(meters), meters,
        rows: [['Focal length of the lens', f1(b.L.focal(GREEN)) + ' mm'], ['Picture, against the candle', size(b)]] };
    },
  },
  // ───────────────────────────────────────────────────────────── 2
  {
    id: 'specs', nav: 'Glasses', unit: 'mm', scale: `Eye ${f2(EYEBALL.LEN)} mm long`,
    title: 'Fit a pair of glasses',
    task: 'Choose the lens power that puts the focus back on the retina and clears the eye chart.',
    brief: 'This eye is relaxed and looking far. It is a little too long, so light from a distant point meets in front of the retina and lands as a blur. That is nearsightedness. The chart shows what this eye makes of an eye chart across the room.',
    learned: `A lens that is thinner in the middle spreads light, which pushes the focus further back. Opticians measure power in diopters, one over the focal length in meters, negative for a spreading lens. Look at the lens. The stronger it is, the thicker the edge. This eye is ${f1(-EYE_K)} D too strong for its length. From ${f0(EYEBALL.VERTEX)} mm in front it takes ${signed(EYE_NEED, 1)} D to cancel that, and a little more for light through the edge of the pupil. A letter on the 20/20 line is only ${f0(5 * ARCMIN)} µm tall on the retina, so the blur must be far smaller.`,
    key: [['k-ray', 'Light from a far-off point (550 nm)'], ['k-glass', `Spectacle lens, 40 mm across, ${f0(EYEBALL.VERTEX)} mm from the eye`], ['k-target', 'Retina'], ['k-inset', 'Chart: an eye chart as this eye sees it. The bottom row is the 20/20 line.']],
    bounds: [-27, -21.5, 25, 21.5], aside: true,
    params: [
      { id: 'P', label: 'Power of the lens', min: -8, max: 4, step: 0.25, value: 0, show: (v) => signed(v, 2) + ' D' },
    ],
    build(p) {
      const { LEN, RB, RC, PUPIL, VERTEX } = EYEBALL, cx = LEN - RB, Q = CORNEA_Q;
      // where the cornea meets the eyeball: −Q·x² + 2·(RC − cx)·x + cx² − RB² = 0
      const qb = 2 * (RC - cx), qc = cx * cx - RB * RB, xj = 2 * qc / (-qb + Math.sqrt(qb * qb + 4 * Q * qc)), hj = Math.sqrt(2 * RC * xj - (1 + Q) * xj * xj);
      const L = spectacle(p.P, -VERTEX);
      const cornea = conic(0, RC, Q, hj, { act: 'refract', nL: AIR, nR: EYE });
      const surfaces = [...L.surfaces, cornea,
        arc(cx, 0, RB, -1, RB, { act: 'absorb', hmin: hj }),
        seg(xj, PUPIL, xj, hj, { act: 'absorb' }), seg(xj, -PUPIL, xj, -hj, { act: 'absorb' }),
        arc(cx, 0, RB, 1, RB, { act: 'target' })];
      const src = { ox: -27, oy: 0, nm: GREEN };
      const outline = Array.from({ length: 25 }, (_, i) => { const y = hj - 2 * hj * i / 24; return [conicSag(RC, Q, y), y]; }).flat();
      // The wave's spread: the pupil is the opening, inside the eye, where the wavelength is λ/n.
      return { surfaces, ring: true, L, back: paraxial(L.surfaces, GREEN).at - L.v2,
        N: [Math.hypot(PUPIL, LEN - xj) / (2 * PUPIL * EYE.n(GREEN))],
        draw: beam({ ...src, half: 9, n: 19 }), probe: beam({ ...src, half: 2.4, n: 241 }),
        chart: { umPerArcmin: ARCMIN },
        items: [{ t: 'axis' }, { t: 'eye', cx, RB, xj, hj, pupil: PUPIL, cornea: outline }, { t: 'glass', outline: L.outline }],
        handles: [] };
    },
    score(m, b, p) {
      const meters = [sharp('Sharpness on the retina', m.blur * 1000, SPECS_GOAL, 1)];
      return { solved: all(meters), meters,
        rows: [['Its focal length', p.P ? signed(b.back, 0) + ' mm' : 'none'],
          ['Lens thickness, middle', f1(b.L.t) + ' mm'], ['Lens thickness, edge', f1(b.L.edge) + ' mm']] };
    },
  },
  // ───────────────────────────────────────────────────────────── 3
  {
    id: 'camera', nav: 'Camera', unit: 'mm', scale: 'Lens 26 mm across',
    title: 'A sharp, bright camera lens',
    task: 'Find a lens shape that is sharp without closing the iris past f/4.',
    brief: 'This is one 50 mm lens with a distant point of light. Wide open, the picture is bright but soft. Closing the iris sharpens it and blocks more of the light. Drag a white knob to open or close the iris.',
    learned: 'Rays through the edge of a spherical lens bend too much and cross early. That is spherical aberration. It grows steeply with the opening, so closing the iris shrinks it, at the cost of light. Close it too far and the blur grows again, because light is a wave and a small opening spreads it. Shape matters as well. With the curved face toward the distant scene both faces share the bending, and the blur is about a quarter of what the same glass gives turned around. Real camera lenses stack several elements so the errors of one cancel those of the next. Only light along the axis is traced here; blur off the axis and other wavelengths are for later challenges.',
    key: [['k-ray', 'Light from a far-off point (550 nm)'], ['k-glass', 'Crown glass lens, 50 mm'], ['k-stop', 'Iris'], ['k-target', 'Sensor, at the best focus'], ['k-inset', 'Inset: a night scene as this sensor records it, magnified. It shows stars, two of them close together, and a lit window. It dims as the iris closes. The dimming is compressed so that the scene still shows. The bar is as wide as the blur you are allowed.']],
    bounds: [-46, -20, 64, 20],
    params: [
      { id: 'q', label: 'Lens shape', min: -1, max: 1, step: 0.05, value: -1, show: (v, b) => 'front ' + mm(b.R1) + ', back ' + mm(b.R2) },
      { id: 'D', label: 'Iris opening', min: 4, max: 24, step: 0.1, value: 24, show: (v, b) => f1(v) + ' mm, f/' + f1(b.fnum) },
    ],
    build(p) {
      const H = 13, XI = -6, { L, R1, R2 } = bent(p.q, 50, H);
      const open = p.D / 2, wide = this.params[1].max;
      const front = [...L.surfaces,
        seg(XI, open, XI, 18, { act: 'absorb' }), seg(XI, -open, XI, -18, { act: 'absorb' })];
      const src = { ox: -46, oy: 0, nm: GREEN };
      const probe = beam({ ...src, half: Math.min(open, H) * 0.999, n: 241 });
      const xs = bestFocus({ surfaces: front, bounds: this.bounds }, probe);      // autofocus
      const f = L.focal(GREEN);
      return { surfaces: [...front, seg(xs, -12, xs, 12, { act: 'target' })], ring: true, L, R1, R2, xs, f, fnum: f / p.D, N: [f / p.D],
        draw: beam({ ...src, half: 12.6, n: 15 }), probe,
        // the inset dims by the share of light the iris lets through
        spot: { goal: 0.040, unit: 'µm', per: 1000, light: (p.D / wide) ** 2 },
        items: [{ t: 'axis' }, { t: 'glass', outline: L.outline }, { t: 'iris', x: XI, open, h: 18 }, { t: 'sensor', x: xs, h: 12 }],
        // Drag a blade up or down: a tenth of a millimetre of opening for each pixel, so a thumb
        // can find f/4. The knob follows more slowly than the finger.
        handles: [{ param: 'D', cursor: 'ns', knobs: [[XI, open], [XI, -open]],
          hit: (wx, wy, k) => (Math.abs(wx - XI) * k <= 26 && Math.abs(wy) >= open - 16 / k && Math.abs(wy) <= 18 + 16 / k ? Math.abs(wx - XI) : Infinity),
          start: (wx, wy, v, k) => ({ v, wy, k, up: wy < 0 ? -1 : 1 }), move: (wx, wy, c) => c.v + (wy - c.wy) * c.up * c.k * 0.1 }] };
    },
    score(m, b) {
      const meters = [sharp('Sharpness', m.blur * 1000, 40),
        // the bar is the light let through, against what f/4 lets through
        { label: 'Brightness', text: 'f/' + f1(b.fnum), goal: 'f/4 or brighter', ok: +f1(b.fnum) <= 4, frac: (4.05 / b.fnum) ** 2 }];
      return { solved: all(meters), meters,
        rows: [['Light let through, against wide open', f0(100 * b.spot.light) + '%'], ['Sensor sits', f1(b.xs - b.L.v2) + ' mm behind the lens']] };
    },
  },
  // ───────────────────────────────────────────────────────────── colour
  {
    id: 'colour', nav: 'Color', unit: 'mm', scale: 'Lens 16 mm across',
    title: 'Chase the color fringe',
    task: 'Pick a glass and set the curve for a 100 mm lens that lands the wavelengths closest together.',
    brief: 'White light is a mix of many wavelengths, and glass slows the short ones more than the long ones. So a lens brings short wavelengths, which we see as blue, to a nearer focus than long ones, which we see as red. A white point lands with colored fringes.',
    learned: `Every glass bends short wavelengths more than long ones. The Abbe number says how little the bending varies: fluorite, at ${f0(abbe(CAF2))}, spreads the wavelengths least, which is why long camera lenses use it. Notice that a glass with a higher index needs gentler curves for the same focal length. No single glass brings every wavelength to one focus, though. With one simple lens that spread, chromatic aberration, is set by the width of the lens and the Abbe number. A stronger curve adds spherical aberration on top. The cure is the next challenge.`,
    key: [['k-ray', 'White light, traced at 486, 546 and 656 nm, each drawn in the color we see it as. Sharpness counts all three.'], ['k-glass', 'Lens'], ['k-target', 'Sensor, at the best focus'], ['k-inset', 'Inset: a night scene as this sensor records it, magnified. It shows white stars, two of them close together, and a white window. Any color in it is the lens’s doing. The bar is as wide as the blur you are allowed.']],
    bounds: [-30, -14, 150, 14],
    params: [
      { id: 'glass', label: 'Glass', options: ['Fluorite', 'Crown', 'Flint', 'Dense flint'], value: 3 },
      // the weakest curve still focuses fluorite, the weakest glass, on the bench
      { id: 'c', label: 'Curve of the faces', min: 8, max: 16, step: 0.25, value: 8, show: (v) => 'radius ' + f0(1000 / v) + ' mm' },
    ],
    build(p) {
      const mat = GLASSES[p.glass], R = 1000 / p.c, H = 8;
      const L = lens({ x: 0, h: H, R1: R, R2: -R, mat, tag: 'part' });
      const src = { ox: -30, oy: 0 }, probe = white({ ...src, half: H - 0.1 }, 81);
      const xs = bestFocus({ surfaces: L.surfaces, bounds: this.bounds }, probe);
      return { surfaces: [...L.surfaces, seg(xs, -11, xs, 11, { act: 'target' })], ring: true, L, mat, xs,
        f: paraxial(L.surfaces, WHITE[1].nm).f, N: WHITE.map((col) => paraxial(L.surfaces, col.nm).f / (2 * H)),
        draw: white({ ...src, half: 7.4 }, 7), probe,
        spot: { goal: 0.070, unit: 'µm', per: 1000 },
        items: [{ t: 'axis' }, { t: 'glass', outline: L.outline }, { t: 'sensor', x: xs, h: 11 }],
        handles: [] };
    },
    score(m, b) {
      const meters = [sharp('Sharpness', m.blur * 1000, 70), band('Focal length', b.f, 90, 110, 40, 150, 0)];
      return { solved: all(meters), meters,
        rows: [['Index of this glass', b.mat.n(587.56).toFixed(3)], ['Its Abbe number', f0(abbe(b.mat))], ...focusRows(b.L.surfaces, b.L.v2)] };
    },
  },
  // ───────────────────────────────────────────────────────────── doublet
  {
    id: 'doublet', nav: 'Doublet', unit: 'mm', scale: 'Lens 12 mm across',
    title: 'An achromatic doublet',
    task: 'Design a 50 mm lens from two cemented glasses that brings all the wavelengths to one sharp point.',
    brief: 'A crown glass lens sits in front, with a second lens cemented behind it. Set the curve of the front lens, choose the glass of the second, and shape its back face. Shaped right, the second lens brings the wavelengths that the first one separated back together.',
    learned: 'A lens that spreads light separates the wavelengths the opposite way to one that gathers it. Flint glass separates them nearly twice as strongly as crown for the same bending, so a weak spreading lens of flint cancels all of the crown lens’s chromatic error and only a bit more than half of its power. Made of crown as well, it cannot: cancelling the chromatic error would cancel the focusing too. This is the achromatic doublet (the name means without color), the front lens of telescopes and binoculars since the 1750s. It trims spherical aberration as well, which is why the spot shrank so far. Dense flint cancels the chromatic error too, but with these shapes it leaves more spherical aberration behind, so the choice of glass pair decides how sharp the lens can be.',
    key: [['k-ray', 'White light, traced at 486, 546 and 656 nm, each drawn in the color we see it as. Sharpness counts all three.'], ['k-glass', 'Crown lens in front, your lens cemented behind'], ['k-target', 'Sensor, at the best focus'], ['k-inset', 'Inset: a night scene as this sensor records it, magnified. It shows white stars, two of them close together, and a white window. Any color in it is the lens’s doing. The bar is as wide as the blur you are allowed.']],
    bounds: [-16, -11, DOUBLET_END, 11],
    params: [
      // the ranges stop where the pair would no longer focus on the bench
      { id: 'c1', label: 'Curve of the front lens', min: 40, max: 60, step: 0.5, value: 40, show: (v) => 'radius ' + f1(1000 / v) + ' mm' },
      { id: 'glass', label: 'Glass of the second lens', options: ['Crown', 'Flint', 'Dense flint'], value: 0 },
      { id: 'c', label: 'Its back face', min: -45, max: 4, step: 0.25, value: -30,
        show: (v) => (Math.abs(v) < 0.126 ? 'flat' : 'radius ' + f0(1000 / Math.abs(v)) + ' mm, ' + (v < 0 ? 'bulging' : 'hollow')) },
    ],
    build(p) {
      const mat = GLASSES[p.glass + 1], RC = 1000 / p.c1, H = 6;
      const K = stack({ x: 0, h: H, R: [RC, -RC, Math.abs(p.c) < 0.126 ? Infinity : 1000 / p.c], mats: [BK7, mat], tag: 'part' });
      const src = { ox: -16, oy: 0 }, probe = white({ ...src, half: H * 0.98 }, 81);
      const xs = bestFocus({ surfaces: K.surfaces, bounds: this.bounds }, probe);
      return { surfaces: [...K.surfaces, seg(xs, -9, xs, 9, { act: 'target' })], ring: true, K, mat, xs,
        f: paraxial(K.surfaces, WHITE[1].nm).f, N: WHITE.map((col) => paraxial(K.surfaces, col.nm).f / (2 * H)),
        draw: white({ ...src, half: H * 0.93 }, 7), probe,
        spot: { goal: 0.006, unit: 'µm', per: 1000 },
        items: [{ t: 'axis' }, { t: 'glass', outline: K.outlines[0] }, { t: 'glass', outline: K.outlines[1], flint: p.glass > 0 }, { t: 'sensor', x: xs, h: 9 }],
        handles: [] };
    },
    score(m, b) {
      const meters = [sharp('Sharpness', m.blur * 1000, 6, 1), band('Focal length', b.f, 48, 52, 30, 70, 1)];
      return { solved: all(meters), meters,
        rows: [['Abbe numbers, front and back', f0(abbe(BK7)) + ' and ' + f0(abbe(b.mat))],
          ...focusRows(b.K.surfaces, b.K.back)] };
    },
  },
  // ───────────────────────────────────────────────────────────── wide
  {
    id: 'wide', nav: 'Wide', unit: 'mm', scale: 'Lens 32 mm across',
    title: 'A lens for landscapes',
    task: 'Bend the lens and slide the stop until the picture is sharp at its edge as well as its middle.',
    brief: 'A stop is a plate with a hole in it, like the iris in the camera challenge. Only light through the hole reaches the sensor. Gold light comes from straight ahead and makes the middle of the picture. Pale blue light, of the same wavelength, comes from 20° off to one side and makes the edge. Sliding the stop lets in the same amount of light, but it changes where the side light crosses the lens. Drag the white knob and watch the pale blue rays. The gold rays stay in the center.',
    learned: 'Off the axis a simple lens smears a point into a comet shape (coma), and focuses it on a curved surface where the sensor is flat. Each patch of the lens makes its own errors, because light meets the glass there at its own angle. The stop picks the patch. The further the stop sits from the lens, the further from the center the light from the side crosses the glass, while light from straight ahead keeps to the center. With the lens bent into a meniscus, hollow side to the scene, and the stop at the right distance, those errors nearly cancel. William Wollaston found this in 1812, and his landscape lens went into simple cameras for well over a century. Only an up-and-down slice of each beam is traced here, so the error of the sideways slice (astigmatism) is not counted.',
    key: [['k-ray', 'Light from straight ahead (550 nm)'], ['k-ray2', 'Light from 20° off to one side (also 550 nm)'], ['k-glass', (b) => `Crown glass lens, ${f0(b.f)} mm`], ['k-stop', (b) => `Stop: a plate with a ${f1(b.D)} mm hole, which makes this an f/${f0(b.f / b.D)} lens`], ['k-target', 'Sensor, at the best focus for the middle'], ['k-inset', 'Inset: stars as the sensor records them, magnified, in the middle of the picture (left half) and at its edge (right half). At the edge only the up-and-down smear is traced.']],
    bounds: [-46, -24, WIDE_END, 30],
    params: [
      { id: 'q', label: 'Lens faces', min: -2.5, max: 1, step: 0.05, value: 0, show: (v, b) => side(b.R1, -1) + ', ' + side(b.R2, 1) },
      { id: 'xi', label: 'Stop position', min: -30, max: -6, step: 0.25, value: -6, show: (v, b) => f1(-b.xi) + ' mm from the lens center' },   // slider and stop move the same way
    ],
    build(p) {
      const H = 16, D = 5.45, ANGLE = 20 * DEG, { L, R1, R2 } = bent(p.q, 60, H);
      // The plate cannot enter the glass. A lens that is hollow in front reaches forward at its rim,
      // and the rim stops the plate there (and pushes it along when the lens is bent further).
      const stop = this.params[1], xi = Math.min(p.xi, Math.floor((L.outline[0] - 0.75) / stop.step) * stop.step);
      const front = [...L.surfaces, seg(xi, D / 2, xi, 21, { act: 'absorb' }), seg(xi, -D / 2, xi, -21, { act: 'absorb' })];
      // two bundles through the stop: straight ahead, and from 20° below the axis
      const bundle = (angle, n, c, rgb, fill) => beam({ ox: xi - 70 * Math.cos(angle), oy: -70 * Math.sin(angle), angle, half: D / 2 * Math.cos(angle) * fill, n, nm: GREEN }).map((r) => ({ ...r, c, rgb }));
      const probe = [...bundle(0, 81, 0, null, 0.999), ...bundle(ANGLE, 81, 1, null, 0.999)];
      const xs = bestFocus({ surfaces: front, bounds: this.bounds }, probe.filter((r) => !r.c));
      const f = L.focal(GREEN), cos = Math.cos(ANGLE);
      // The wave's spread. From the side the hole looks narrower by cos, the light travels further
      // by 1/cos, and it lands on a slant that stretches it up and down by 1/cos again.
      return { surfaces: [...front, seg(xs, -23, xs, 29, { act: 'target' })], ring: false, L, R1, R2, xs, xi, D, f,
        N: [f / D, f / (D * cos ** 3)], Nx: [f / D, f / (D * cos)],
        fix: xi !== p.xi ? { xi } : null,
        draw: [...bundle(0, 7, 0, null, 0.92), ...bundle(ANGLE, 7, 1, [150, 205, 255], 0.92)], probe,
        off: trace({ surfaces: L.surfaces, bounds: this.bounds }, bundle(ANGLE, 1, 1, null, 0)[0]).pts[3],   // where the middle ray from the side meets the lens
        spot: { goal: 0.060, unit: 'µm', per: 1000, low: true, slices: true },
        items: [{ t: 'axis' }, { t: 'glass', outline: L.outline }, { t: 'iris', x: xi, open: D / 2, h: 21 }, { t: 'sensor', x: xs, h: 26, y: 3 }],
        handles: [{ param: 'xi', cursor: 'ew', knobs: [[xi, -21]],
          hit: (wx, wy, k) => (Math.abs(wx - xi) * k <= 26 && Math.abs(wy) <= 21 + 12 / k ? Math.abs(wx - xi) : Infinity),
          start: (wx, wy, v) => v - wx, move: (wx, wy, c) => wx + c }] };
    },
    score(m, b) {
      const mid = m.groups[0] ? m.groups[0].spread * 1000 : Infinity, edge = m.groups[1] ? m.groups[1].spread * 1000 : Infinity;
      const meters = [sharp('Sharp in the middle', mid, 40), sharp('Sharp at the edge', edge, 60)];
      return { solved: all(meters), meters,
        rows: [['Light from the side crosses the lens', f1(Math.abs(b.off)) + ' mm off center'], ['Sensor sits', f1(b.xs - b.L.v2) + ' mm behind the lens']] };
    },
  },
  // ───────────────────────────────────────────────────────────── tower
  {
    id: 'tower', nav: 'Tower', unit: 'm', scale: `Tower ${f0(FIELD.Y1)} m tall`,
    title: 'Aim the heliostats',
    task: 'Tilt each mirror so that its sunlight lands on the boiler at the top of the tower.',
    brief: 'A solar power tower boils its working fluid with sunlight bounced off a field of flat mirrors. The Sun stands 40° above the horizon behind the field. Drag a white knob sideways to tilt its mirror.',
    learned: 'A mirror sends light off at the same angle it arrived at, so each mirror must face exactly halfway between the Sun and the boiler. That is why every mirror in the field needs its own tilt, and why, as the Sun crosses the sky, each one turns at half the Sun’s rate. Real plants steer thousands of mirrors this way all day. The Sun is traced here as a point; its half-degree width smears each beam by about a meter over these distances.',
    key: [['k-ray', 'Sunlight headed for the mirrors (the rest is not drawn)'], ['k-mirror', `Heliostat mirrors, ${f0(FIELD.W)} m`], ['k-target', 'Boiler. 100% is the most light these three mirrors can send it.']],
    bounds: [8, -11, 166, 112],
    params: [0, 1, 2].map((i) => ({ id: 't' + i, label: ['Near', 'Middle', 'Far'][2 - i] + ' mirror tilt', min: -25, max: 25, step: 0.25, value: [14, -14, 12][i],
      show: (v) => (v ? f2(Math.abs(v)) + '° ' + (v > 0 ? 'toward the tower' : 'toward the Sun') : 'level') })),
    build(p) {
      const { XT, Y0, Y1, PIV, W } = FIELD;
      const surfaces = boiler();
      const draw = [], probe = [], items = [{ t: 'ground' }, { t: 'tower', x: XT, w: 9, y0: Y0, y1: Y1 }], handles = [];
      PIV.forEach(([px, py], i) => {
        const m = heliostat(i, p['t' + i]);
        // the mirror, and the post it stands on (which stops light too)
        surfaces.push(m, seg(px, 0, px, py - 0.05, { act: 'absorb' }));
        items.push({ t: 'heliostat', px, py, m });
        draw.push(...sunbeam(i, 3.9, 5));
        probe.push(...sunbeam(i, W / 2, 81));
        // Drag sideways on a mirror: 0.15° for each pixel, so a thumb can set a quarter of a degree.
        handles.push({ param: 't' + i, cursor: 'ew', knobs: [[px, -6]],
          hit: (wx, wy, k) => (Math.abs(wx - px) * k <= 30 && wy >= -6 - 30 / k && wy <= py + 30 / k ? Math.abs(wx - px) : Infinity),
          start: (wx, wy, v, k) => ({ v, wx, k }), move: (wx, wy, c) => c.v + (wx - c.wx) * c.k * 0.15 });
      });
      return { surfaces, ring: false, draw, probe, items, handles, full: fieldFull(this.params[0], this.bounds) };
    },
    score(m, b) {
      // the light on the boiler, against the most these mirrors can send it: an amount, so it only rises when more light lands
      const share = m.viaGot / b.full;
      const meters = [percent('Mirror light on the boiler', share, 90)];
      return { solved: all(meters), glow: share, meters, rows: [] };
    },
  },
];

// Trace a level at settings p. Returns everything the page draws and reports.
export function run(level, p) {
  const b = level.build(p);
  const scene = { surfaces: b.surfaces, bounds: level.bounds };
  const paths = b.draw.map((r) => trace(scene, r));
  const m = tally(scene, b.probe, b.ring, b.N, b.Nx);
  return { b, paths, m, score: level.score(m, b, p) };
}
