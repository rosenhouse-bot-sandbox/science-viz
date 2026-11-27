// Checks the Optics workshop's model without a browser: the laws in optics/REALISM.md, worked out
// here a second way and compared with what the page's own code gives over a spread of settings.
// It fails if a ray bends anywhere but at a surface or by anything but Snell's law, if light passes
// something drawn as solid, if a blur on screen is smaller than the wave nature of light allows, if
// a meter of light rises when no more light lands, if the picture's stated size is not where the
// light goes, if a part enters another, if a lens that is bent changes its focal length, if a
// number in the text is not the model's, if a sensor is not at its best focus, if the glasses that
// win are not the eye's error moved to the lens, or if a known solution no longer wins.
//
//   node tests/optics/model.mjs          # Node 22, nothing else
//
// OPTICS_JS=<folder> checks another copy of js/optics (used to show that a check fails on old code).

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PLAYS, settings } from './plays.mjs';

const root = process.env.OPTICS_JS ? path.resolve(process.env.OPTICS_JS) : path.join(import.meta.dirname, '../../js/optics');
const load = (f) => import(pathToFileURL(path.join(root, f)).href);
const M = await load('levels.js'), T = await load('trace.js'), G = await load('glass.js');
const { LEVELS, run } = M, say = M.say || ((v) => v), { trace, paraxial } = T;

const fails = new Map();
let section = '';
const fail = (msg) => { const k = section; if (!fails.has(k)) fails.set(k, []); fails.get(k).push(msg); };
const check = (ok, msg) => { if (!ok) fail(typeof msg === 'function' ? msg() : msg); };
const begin = (name) => { section = name; };

const lv = (id) => LEVELS.find((l) => l.id === id);
const def = (L) => Object.fromEntries(L.params.map((q) => [q.id, q.value]));
const R = (id, p) => run(lv(id), { ...def(lv(id)), ...p });
// about n values of a slider, on its own steps, with both ends
const some = (q, n) => {
  if (q.options) return q.options.map((_, i) => i);
  const steps = Math.round((q.max - q.min) / q.step), k = Math.max(1, Math.round(steps / (n - 1))), out = [];
  for (let i = 0; i <= steps; i += k) out.push(+(q.min + i * q.step).toFixed(6));
  if (out[out.length - 1] !== q.max) out.push(q.max);
  return out;
};
function* grid(L, n) {
  const lists = L.params.map((q) => some(q, (n && n[q.id]) || (L.params.length >= 3 ? 6 : 12))), idx = lists.map(() => 0);
  for (;;) {
    yield Object.fromEntries(L.params.map((q, i) => [q.id, lists[i][idx[i]]]));
    let k = 0; while (k < idx.length && ++idx[k] === lists[k].length) idx[k++] = 0;
    if (k === idx.length) return;
  }
}
const num = (t) => { const m = /[−-]?\d+(\.\d+)?/.exec(String(t)); return m ? +m[0].replace('−', '-') : NaN; };
const at = (p) => JSON.stringify(p);
const item = (b, t) => b.items.filter((o) => o.t === t);
const keyText = (L, b) => L.key.map(([, text]) => say(text, b));
const DEG = Math.PI / 180;

// ── geometry worked out here, not taken from the page ─────────────────────────────────────────────
const conicX = (s, y) => s.vx + y * y / (s.R * (1 + Math.sqrt(1 - (1 + s.Q) * y * y / (s.R * s.R))));
const onSurf = (s, x, y) => {
  if (s.kind === 'arc') return Math.abs(Math.hypot(x - s.cx, y - s.cy) - s.r) < 1e-6 && (x - s.cx) * s.side > 0 && Math.abs(y - s.cy) <= s.h + 1e-9 && Math.abs(y - s.cy) >= s.hmin - 1e-9;
  if (s.kind === 'conic') return Math.abs(y) <= s.h + 1e-9 && Math.abs(y) >= s.hmin - 1e-9 && Math.abs(conicX(s, y) - x) < 1e-6;
  const ex = s.bx - s.ax, ey = s.by - s.ay, l = Math.hypot(ex, ey), u = ((x - s.ax) * ex + (y - s.ay) * ey) / l / l, d = ((x - s.ax) * ey - (y - s.ay) * ex) / l;
  return Math.abs(d) < 1e-6 && u >= -1e-9 && u <= 1 + 1e-9;
};
const normal = (s, x, y) => {
  let n;
  if (s.kind === 'arc') n = [(x - s.cx) / s.r, (y - s.cy) / s.r];
  else if (s.kind === 'conic') { n = [(1 + s.Q) * (x - s.vx) - s.R, y]; const l = Math.hypot(...n); n = [n[0] / l, n[1] / l]; }
  else { const ex = s.bx - s.ax, ey = s.by - s.ay, l = Math.hypot(ex, ey); n = [-ey / l, ex / l]; }
  return n[0] > 0 ? [-n[0], -n[1]] : n;                 // pointing left
};
// does the path cross the line a-b, strictly inside both?
const crosses = (P, ax, ay, bx, by) => {
  for (let i = 0; i + 3 < P.length; i += 2) {
    const dx = P[i + 2] - P[i], dy = P[i + 3] - P[i + 1], ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((ax - P[i]) * ey - (ay - P[i + 1]) * ex) / den, u = ((ax - P[i]) * dy - (ay - P[i + 1]) * dx) / den;
    if (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6) return true;
  }
  return false;
};
// Bessel J1 by its integral, (1/π)·∫ cos(θ − x·sin θ) dθ over 0..π (Simpson's rule): not the page's series.
const J1 = (x) => { const n = 2000; let s = 0; for (let i = 0; i <= n; i++) { const th = Math.PI * i / n; s += (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) * Math.cos(th - x * Math.sin(th)); } return s / (3 * n); };
const bisect = (fn, a, b) => { for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if ((fn(a) < 0) === (fn(m) < 0)) a = m; else b = m; } return (a + b) / 2; };
// The Airy pattern (2·J1(x)/x)², x = π·r/(λ·N). Across its first dark ring: 2·x0/π wavelengths times the f-number.
const AIRY = 2 * bisect(J1, 3, 4.5) / Math.PI;
// The page's measure of blur is twice the root-mean-square radius. For the Gaussian exp(−r²/2σ²) as
// wide as the Airy pattern at half height: half height at r = σ·√(2·ln 2), rms radius σ·√2, so the
// blur is (full width at half height) / √(ln 2).
const WAVE = 2 * bisect((x) => (2 * J1(x) / x) ** 2 - 0.5, 1, 2.5) / Math.PI / Math.sqrt(Math.LN2);

// ── 1. rays: straight, Snell at glass, equal angles at a mirror, stop at anything opaque ──────────
begin('rays obey Snell and the mirror law, bend only at a surface, and stop at what is opaque');
{
  let worstSnell = 0, worstMirror = 0, vertices = 0;
  for (const L of LEVELS) for (const p of grid(L)) {
    const out = run(L, p), b = out.b, scene = { surfaces: b.surfaces, bounds: L.bounds };
    check(out.m.share >= 0 && out.m.share <= 1 + 1e-12, () => `${L.id} ${at(p)}: more light lands than was sent`);
    for (const ray of [...b.draw, ...b.probe.filter((_, i) => i % 8 === 0)]) {
      const o = trace(scene, ray), P = o.pts;
      if (P.some((v) => !isFinite(v))) { fail(`${L.id} ${at(p)}: a ray has a point that is not a number`); continue; }
      for (let i = 2; i < P.length - 2; i += 2) {
        const x = P[i], y = P[i + 1];
        let d1 = [x - P[i - 2], y - P[i - 1]], d2 = [P[i + 2] - x, P[i + 3] - y];
        const l1 = Math.hypot(...d1), l2 = Math.hypot(...d2); d1 = d1.map((v) => v / l1); d2 = d2.map((v) => v / l2);
        const ss = scene.surfaces.filter((s) => onSurf(s, x, y));
        if (!ss.length) { fail(`${L.id} ${at(p)}: a ray bends in mid air at ${x.toFixed(2)}, ${y.toFixed(2)}`); continue; }
        if (ss.some((s) => s.act === 'absorb' || s.act === 'target')) { fail(`${L.id} ${at(p)}: a ray passes an opaque surface at ${x.toFixed(2)}, ${y.toFixed(2)}`); continue; }
        const s = ss[0], [nx, ny] = normal(s, x, y); vertices++;
        const c1 = d1[0] * nx + d1[1] * ny, c2 = d2[0] * nx + d2[1] * ny, s1 = d1[0] * ny - d1[1] * nx, s2 = d2[0] * ny - d2[1] * nx;
        if (s.act === 'mirror') { worstMirror = Math.max(worstMirror, Math.abs(c1 + c2), Math.abs(s1 - s2)); continue; }
        const going = c1 < 0, n1 = (going ? s.nL : s.nR).n(ray.nm), n2 = (going ? s.nR : s.nL).n(ray.nm);
        if (Math.sign(c1) !== Math.sign(c2)) { check(n1 * Math.abs(s1) / n2 > 1, `${L.id} ${at(p)}: glass reflects a ray that should pass`); continue; }
        worstSnell = Math.max(worstSnell, Math.abs(n1 * s1 - n2 * s2));
      }
    }
  }
  check(worstSnell < 1e-9, `Snell's law is off by ${worstSnell}`);
  check(worstMirror < 1e-9, `the mirror law is off by ${worstMirror}`);
  console.log(`rays: ${vertices} bends checked; Snell within ${worstSnell.toExponential(1)}, mirrors within ${worstMirror.toExponential(1)}`);
}

// ── 2. what is drawn as solid is solid in the trace, and solid parts keep out of each other ───────
begin('light stops at every solid thing drawn, and solid parts do not overlap');
{
  let n = 0;
  for (const L of LEVELS) for (const p of grid(L)) {
    const { b } = run(L, p), scene = { surfaces: b.surfaces, bounds: L.bounds };
    const solids = [];
    for (const o of item(b, 'match')) solids.push(['the match stick', ...(o.stick ? o.stick.slice(0, 4) : [o.x + o.r, -o.r, o.x + o.r + 5, -19])]);
    for (const o of item(b, 'heliostat')) solids.push(['a heliostat post', o.px, 0, o.px, o.py - 0.1]);
    for (const o of item(b, 'iris')) solids.push(['a plate', o.x, o.open, o.x, o.h], ['a plate', o.x, -o.open, o.x, -o.h]);
    for (const o of item(b, 'sensor')) solids.push(['the sensor', o.x, (o.y || 0) - o.h, o.x, (o.y || 0) + o.h]);
    for (const ray of [...b.draw, ...b.probe.filter((_, i) => i % 4 === 0)]) {
      const P = trace(scene, ray).pts; n++;
      for (const [name, ...line] of solids) if (crosses(P, ...line)) { fail(`${L.id} ${at(p)}: light passes through ${name}`); break; }
    }
    // a plate never enters glass
    for (const o of item(b, 'iris')) for (const gl of item(b, 'glass')) for (let i = 0; i < gl.outline.length; i += 2) {
      const j = (i + 2) % gl.outline.length;
      if (crosses([gl.outline[i], gl.outline[i + 1], gl.outline[j], gl.outline[j + 1]], o.x, o.open, o.x, o.h)) { fail(`${L.id} ${at(p)}: the plate is inside the glass`); break; }
    }
  }
  // the landscape lens: at every bend, the plate at its nearest keeps clear of the rim
  const W = lv('wide');
  for (const q of some(W.params[0], 80)) for (const xi of [W.params[1].max, -8, -12]) {
    const { b } = run(W, { q, xi }), plate = item(b, 'iris')[0], gl = item(b, 'glass')[0];
    let rim = Infinity;
    for (let i = 0; i < gl.outline.length; i += 2) if (Math.abs(gl.outline[i + 1]) >= plate.open) rim = Math.min(rim, gl.outline[i]);
    check(plate.x <= rim - 0.3, () => `wide q ${q}, stop ${xi}: the plate is at ${plate.x.toFixed(2)} and the lens's rim reaches ${rim.toFixed(2)}`);
    check(!b.xi || W.params[1].show(xi, b) === (-plate.x).toFixed(1) + ' mm from the lens center', `wide q ${q}: the stop's readout is not where the plate is`);
  }
  // the candle's lens is in the hole
  for (const id of ['picture', 'far']) for (const D of some(lv('picture').params[1], 6)) {
    const { b } = R(id, { lens: 1, D }), plate = item(b, 'iris')[0], gl = item(b, 'glass')[0];
    const xs = gl.outline.filter((_, i) => i % 2 === 0), ys = gl.outline.filter((_, i) => i % 2);
    check(Math.min(...xs) < plate.x && Math.max(...xs) > plate.x && Math.abs(Math.max(...ys) - plate.open) < 1e-6, `${id} hole ${plate.open * 2}: the lens is not in the hole (it spans x ${Math.min(...xs).toFixed(1)} to ${Math.max(...xs).toFixed(1)}, half height ${Math.max(...ys)}; the plate is at ${plate.x}, hole ${plate.open})`);
  }
  console.log(`solids: ${n} rays against every stick, post, plate and sensor`);
}

// ── 3. light is a wave: no blur under the wave width ──────────────────────────────────────────────
begin('no blur shown, and no goal, is under the width the wave nature of light gives the spot');
{
  check(Math.abs(AIRY - 2.4393) < 1e-3, `the Airy width worked out here is ${AIRY}`);
  check(T.WAVE_K !== undefined && Math.abs(T.WAVE_K - WAVE) < 1e-4, `the model's wave width constant is ${T.WAVE_K}; worked out here it is ${WAVE.toFixed(5)}`);
  check(T.AIRY_K !== undefined && Math.abs(T.AIRY_K - AIRY) < 1e-4, `the model's Airy constant is ${T.AIRY_K}; worked out here it is ${AIRY.toFixed(5)}`);
  // each challenge's f-number, per kind of light, from the scene
  const lensOf = (b) => b.surfaces.filter((s) => s.tag === 'part' && s.act === 'refract');
  const height = (b) => { const o = item(b, 'glass')[0].outline; return 2 * Math.max(...o.filter((_, i) => i % 2)); };
  const fnums = {
    picture: (b) => { const pl = item(b, 'iris')[0], sc = item(b, 'sensor')[0], N = (sc.x - pl.x) / (2 * pl.open); return [N, N]; },
    camera: (b) => [paraxial(lensOf(b), 550).f / (2 * item(b, 'iris')[0].open)],
    colour: (b) => G.WHITE.map((c) => paraxial(lensOf(b), c.nm).f / height(b)),
    wide: (b) => { const N = paraxial(lensOf(b), 550).f / (2 * item(b, 'iris')[0].open); return [N, N / Math.cos(20 * DEG) ** 3]; },
    specs: (b) => { const e = item(b, 'eye')[0], len = e.cx + e.RB; return [Math.hypot(e.pupil, len - e.xj) / (2 * e.pupil * G.EYE.n(550))]; },
  };
  fnums.far = fnums.picture; fnums.doublet = fnums.colour;
  let n = 0, least = Infinity;
  for (const L of LEVELS) {
    if (!fnums[L.id]) continue;
    for (const p of grid(L, { D: 9, q: 9, near: 5, xs: 6, c1: 6, c: 8, xi: 6, P: 49 })) {
      const { b, m, score } = run(L, p), N = fnums[L.id](b);
      const floor = m.groups.map((Gr, c) => WAVE * b.probe.find((r) => (r.c || 0) === c).nm * 1e-6 * N[c]);
      if (!m.groups.some((Gr) => Gr.w)) continue;
      n++;
      m.groups.forEach((Gr, c) => { if (Gr.w) check(Gr.spread >= floor[c] * (1 - 1e-6) && Gr.blur >= floor[c] * (1 - 1e-6), () => `${L.id} ${at(p)}: the blur of light ${c} is ${(Math.min(Gr.spread, Gr.blur) * 1000).toFixed(2)} µm, under its wave width ${(floor[c] * 1000).toFixed(2)} µm`); });
      if (m.traced !== undefined) check(Math.abs(m.blur ** 2 - m.traced ** 2 - m.wave ** 2) <= 1e-9 * m.blur ** 2, `${L.id} ${at(p)}: the blur is not the traced and the wave width added as squares`);
      // the number on the meter, and the goal where it is met
      score.meters.filter((x) => /blur/.test(x.goal)).forEach((x, i) => {
        if (!/blur/.test(x.text)) return;
        const unit = /µm/.test(x.goal) ? 1000 : 1, digits = (x.text.split('.')[1] || '').replace(/\D/g, '').length, half = 0.5 * 10 ** -digits;
        const fl = (L.id === 'wide' ? floor[i] : Math.min(...floor)) * unit;
        least = Math.min(least, num(x.text) / fl);
        check(num(x.text) >= fl - half - 1e-9, () => `${L.id} ${at(p)}: the meter reads "${x.text}", under the wave width ${fl.toFixed(3)}`);
        if (x.ok) check(num(x.goal) >= fl - 1e-9, `${L.id} ${at(p)}: the goal "${x.goal}" is met under the wave width ${fl.toFixed(3)}`);
      });
    }
  }
  // closing the iris stops helping: the camera has a best opening inside its range
  const C = lv('camera'), Ds = some(C.params[1], 201), blur = Ds.map((D) => R('camera', { q: 0.7, D }).m.blur), best = blur.indexOf(Math.min(...blur));
  check(best > 0 && best < Ds.length - 1, `camera: the sharpest iris opening is ${Ds[best]} mm, an end of its range`);
  console.log(`wave: ${n} settings; wave width ${WAVE.toFixed(4)} λN (${AIRY.toFixed(4)} λN across the first dark ring); camera's sharpest opening f/${(50 / Ds[best]).toFixed(1)}, blur ${(blur[best] * 1000).toFixed(1)} µm; the least a meter reads is ${least.toFixed(2)} of its wave width`);
}

// ── 4. a measure of light is an amount ───────────────────────────────────────────────────────────
begin('a meter of light rises only when more light lands');
{
  const sol = settings('tower'), L = lv('tower');
  for (const k of ['t0', 't1', 't2']) {
    const rows = some(L.params[0], 81).map((t) => {
      const { b, score } = run(L, { ...sol, [k]: t }), scene = { surfaces: b.surfaces, bounds: L.bounds };
      return [b.probe.filter((r) => trace(scene, r).end === 'target').length, num(score.meters[0].text), score.glow, t];
    }).sort((a, c) => a[0] - c[0]);
    for (let i = 1; i < rows.length; i++) {
      const [n0, m0, g0, t0] = rows[i - 1], [n1, m1, g1, t1] = rows[i];
      if (m1 < m0 || (n1 === n0 && m1 !== m0)) { fail(`tower ${k}: ${n0} rays on the boiler read ${m0}% (tilt ${t0}) and ${n1} rays read ${m1}% (tilt ${t1})`); break; }
      if (g0 !== undefined && g1 < g0) { fail(`tower ${k}: the glow falls as more light lands`); break; }
    }
    check(rows[rows.length - 1][1] <= 100, `tower ${k}: the meter passes 100%`);
  }
  // the candle's light: what the hole lets through, less what misses the screen
  const P = lv('picture');
  for (const lens of [0, 1]) for (const D of [16, 12, 6, 1]) for (const xs of [30, 55, 70, 84]) {
    const { b, score } = run(P, { lens, D, xs }), scene = { surfaces: b.surfaces, bounds: P.bounds };
    let all = 0, got = 0; for (const r of b.probe) { all += Math.abs(r.s); if (trace(scene, r).end === 'target') got += Math.abs(r.s); }
    const want = (D / 16) ** 2 * got / all * 100;
    check(Math.abs(num(score.meters[1].text) - want) <= 0.5 + 1e-9, `picture ${at({ lens, D, xs })}: the light meter reads ${score.meters[1].text}; ${want.toFixed(1)}% lands on the screen`);
    // each part of the picture is lit by the opening's area over the picture's area
    if (b.picture.light !== undefined) { const ref = run(P, { lens, D: 16, xs: 30 }).b.picture.light; check(Math.abs(b.picture.light / ref - (D / 16) ** 2 * (30 / xs) ** 2) < 1e-9, `picture ${at({ lens, D, xs })}: the panel's brightness does not go with (hole / distance)²`); }
  }
  check(lv('picture').params.every((q) => q.id !== 'xs' || q.min === 30), 'picture: the check above assumes the screen starts 30 mm back');
  // the camera's inset dims with the light the iris lets through; the other insets do not dim
  for (const D of [24, 12, 4]) { const { b } = R('camera', { D }); check(b.spot.light !== undefined && Math.abs(b.spot.light - (D / 24) ** 2) < 1e-12, `camera iris ${D}: the inset keeps its light (${b.spot.light})`); }
  for (const id of ['colour', 'doublet', 'wide']) check((R(id, {}).b.spot.light ?? 1) === 1, `${id}: the inset is dimmed`);
}

// ── 5. the picture is where the light goes ───────────────────────────────────────────────────────
begin('the picture has the size and place the light gives it');
{
  const P = lv('picture'), sizeRow = (score) => score.rows.find((r) => /Picture/.test(r[0]))[1];
  for (const D of [16, 9, 1]) for (const xs of [30, 50, 70, 84]) {
    const { b, score } = run(P, { lens: 0, D, xs }), c = item(b, 'candle')[0], pl = item(b, 'iris')[0], sc = item(b, 'sensor')[0];
    const mag = (sc.x - pl.x) / (pl.x - c.x);                       // similar triangles through the hole
    check(sizeRow(score) === mag.toFixed(2) + ' times, upside down', `picture, no lens, hole ${D}, screen ${xs}: reads "${sizeRow(score)}"; through the hole it is ${mag.toFixed(2)} times`);
    check(score.rows[0][1] === (pl.x - c.x).toFixed(1) + ' mm', `picture: "Candle to hole" reads ${score.rows[0][1]}; it is ${(pl.x - c.x).toFixed(1)} mm`);
    check(P.params[2].show(xs, b) === (sc.x - pl.x).toFixed(1) + ' mm behind the hole', `picture: the screen's readout is not its distance from the hole`);
  }
  // with the lens and a small hole the light of each point is nearly a point: the size is where it lands
  for (const xs of [40, 60, 80]) {
    const { m, score } = run(P, { lens: 1, D: 1, xs }), mag = (m.groups[0].u / m.groups[0].w - m.groups[1].u / m.groups[1].w) / 20;
    check(Math.abs(num(sizeRow(score)) - Math.abs(mag)) <= 0.011, `picture, lens, screen ${xs}: reads "${sizeRow(score)}"; the light lands ${Math.abs(mag).toFixed(3)} times the candle apart`);
  }
  // the lens equation: the sharpest screen is near where 1/f = 1/d + 1/s puts it (a little nearer, for the edge rays)
  { const blurAt = (xs) => run(P, { lens: 1, D: 6, xs }).m.groups[0].spread, xs = some(P.params[2], 55), best = xs[xs.map(blurAt).indexOf(Math.min(...xs.map(blurAt)))];
    const { b } = run(P, { lens: 1, D: 6, xs: 50 }), f = b.L.focal(550), s = 1 / (1 / f - 1 / b.d);
    check(best <= s + 0.5 && best >= s - 3, `picture: the sharpest screen is at ${best} mm; the lens equation gives ${s.toFixed(1)} mm`); }
  // too small to have a shape: decided from the picture's own size, and never in the first candle challenge
  for (const p of grid(P)) check(run(P, p).b.picture.dot === false, `picture ${at(p)}: the panel would draw a dot (${run(P, p).b.picture.dot})`);
  const F = lv('far');
  for (const near of some(F.params[0], 101)) for (const xs of [30, 40, 66, 84]) {
    const { b } = run(F, { near, xs }), tall = Math.abs(b.chief ? b.chief[0] - b.chief[1] : NaN);
    check(b.picture.dot === (tall < 1), `far ${at({ near, xs })}: dot is ${b.picture.dot} for a picture ${tall.toFixed(2)} mm tall`);
  }
}

// ── 6. bending a lens keeps its focal length; the text's numbers are the model's ─────────────────
begin('a number in the text is the model\'s');
{
  const lensOf = (b) => b.surfaces.filter((s) => s.tag === 'part' && s.act === 'refract');
  for (const [id, re] of [['camera', /lens, (\d+) mm/], ['wide', /lens, (\d+) mm/], ['picture', /lens, (\d+) mm/], ['far', /lens, (\d+) mm/]]) {
    const L = lv(id), q = L.params.find((x) => x.id === 'q') || L.params.find((x) => x.id === 'D');
    for (const v of q ? some(q, 36) : [0]) {
      const { b } = R(id, q ? { [q.id]: v, lens: 1 } : {}), said = +re.exec(keyText(L, b).join(' | '))[1], f = paraxial(lensOf(b), 550).f;
      check(Math.abs(f - said) <= (q && q.id === 'q' ? 0.01 : 0.5), `${id} ${q ? q.id + ' ' + v : ''}: the key says a ${said} mm lens; its focal length is ${f.toFixed(2)} mm`);
    }
  }
  { const L = lv('wide'), { b } = R('wide', {}), key = keyText(L, b).join(' | '), hole = 2 * item(b, 'iris')[0].open, f = paraxial(lensOf(b), 550).f;
    check(+/f\/(\d+)/.exec(key)[1] === Math.round(f / hole), `wide: the key says f/${/f\/(\d+)/.exec(key)[1]}; the lens is f/${(f / hole).toFixed(1)}`);
    check(+/a ([\d.]+) mm hole/.exec(key)[1] === +hole.toFixed(1), `wide: the key's hole is not the plate's (${hole})`);
    for (const q of some(L.params[0], 71)) { const t = L.params[0].show(q, R('wide', { q }).b); check(!/flat mm|undefined|NaN/.test(t) && /mm|flat/.test(t), `wide q ${q}: the faces read "${t}"`); } }
  // scale notes and sizes in the keys
  const tall = (b) => { const o = item(b, 'glass')[0].outline; return 2 * Math.max(...o.filter((_, i) => i % 2)); };
  for (const L of LEVELS) {
    const { b } = run(L, { ...def(L), ...(L.id === 'picture' ? { lens: 1 } : {}) }), key = keyText(L, b).join(' | ');
    let m;
    if ((m = /Lens (\d+) mm across/.exec(L.scale))) check(+m[1] === Math.round(tall(b)), `${L.id}: the scale note says the lens is ${m[1]} mm across; it is ${tall(b)}`);
    if ((m = /Candle (\d+) mm tall/.exec(L.scale))) check(+m[1] === 2 * item(b, 'candle')[0].tip, `${L.id}: the scale note's candle is not the candle's height`);
    if ((m = /Bench (\d+) mm long/.exec(L.scale))) check(+m[1] === L.bounds[2] - L.bounds[0], `${L.id}: the scale note says the bench is ${m[1]} mm long; it is ${L.bounds[2] - L.bounds[0]}`);
    if ((m = /Tower (\d+) m tall/.exec(L.scale))) check(+m[1] === item(b, 'tower')[0].y1, `${L.id}: the scale note's tower is not the tower's height`);
    if ((m = /Eye ([\d.]+) mm long/.exec(L.scale))) { const e = item(b, 'eye')[0]; check(Math.abs(+m[1] - (e.cx + e.RB)) < 0.006, `${L.id}: the scale note says the eye is ${m[1]} mm long; it is ${e.cx + e.RB}`); }
    if ((m = /hole, (\d+) mm/.exec(key))) check(+m[1] === 2 * item(b, 'iris')[0].open, `${L.id}: the key's hole is not the plate's`);
    if ((m = /Match head, ([\d.]+) mm/.exec(key))) check(+m[1] === 2 * item(b, 'match')[0].r, `${L.id}: the key's match head is not the head's size`);
    if ((m = /mirrors, (\d+) m/.exec(key))) { const s = item(b, 'heliostat')[0].m; check(Math.abs(Math.hypot(s.bx - s.ax, s.by - s.ay) - m[1]) < 1e-9, `${L.id}: the key's mirror is not the mirror's width`); }
    if ((m = /reflects about (\d+)%/.exec(key))) { const n = G.BK7.n(550), r = ((n - 1) / (n + 1)) ** 2; check(+m[1] === Math.round((1 - (1 - r) ** 2) * 100), `${L.id}: the key's reflected share is not what the glass's index gives`); }
    if ((m = /1 mm across for every (\d+) mm/.exec(L.learned))) check(Math.abs(+m[1] - 1 / (1919 / 3600 * DEG)) <= 5, `${L.id}: the Sun's image is not its width in the sky (1919 seconds of arc) times the focal length`);
  }
  // the glasses, by their catalog numbers (index at 587.6 nm and Abbe number), and by name
  const abbe = (mat) => (mat.n(587.56) - 1) / (mat.n(486.13) - mat.n(656.27));
  for (const [name, nd, V] of [['N-BK7', 1.5168, 64.17], ['F2', 1.62004, 36.37], ['N-SF10', 1.72828, 28.53], ['CaF2', 1.43384, 95.0]]) {
    const mat = Object.values(G).find((x) => x && x.n && Math.abs(x.n(587.56) - nd) < 2e-4 && Math.abs(abbe(x) - V) < 0.2);
    check(mat && new RegExp('\\(' + name + '\\)').test(mat.name), `glass: no glass named ${name} with index ${nd} and Abbe number ${V} (${mat ? 'the one with those numbers is called "' + mat.name + '"' : 'none has those numbers'})`);
  }
}

// ── 7. every goal is judged on the number shown ──────────────────────────────────────────────────
begin('a meter that reads as meeting its goal meets it, and nothing reads "NaN"');
{
  let n = 0;
  for (const L of LEVELS) for (const p of grid(L, L.id === 'far' ? { near: 101, xs: 4 } : null)) {
    const { b, score } = run(L, p); n++;
    const texts = [...score.meters.map((m) => m.text), ...score.rows.map((r) => r[1]), ...L.params.filter((q) => q.show).map((q) => q.show(p[q.id], b))];
    for (const t of texts) check(!/NaN|undefined|Infinity/.test(t), `${L.id} ${at(p)}: reads "${t}"`);
    if (L.id === 'doublet') for (const t of texts) check(!/none|nowhere/.test(t), `${L.id} ${at(p)}: reads "${t}"`);
    const oks = score.meters.map((m) => {
      const ok = m.ok ?? Math.min(1, Math.max(0, isFinite(m.frac) ? m.frac : 0)) >= 1;
      let want, r;
      if ((r = /blur ([\d.]+) (µm|mm) or less/.exec(m.goal))) want = /blur/.test(m.text) && num(m.text) <= +r[1];
      else if ((r = /(\d+)% or more/.exec(m.goal))) want = num(m.text) >= +r[1];
      else if ((r = /f\/(\d+) or brighter/.exec(m.goal))) want = num(m.text) <= +r[1];
      else if ((r = /(\d+) m or more/.exec(m.goal))) want = /very far/.test(m.text) || (/ m$/.test(m.text) && num(m.text) >= +r[1]);
      else if ((r = /(\d+) to (\d+) mm/.exec(m.goal))) want = num(m.text) >= +r[1] && num(m.text) <= +r[2];
      else { fail(`${L.id}: a goal this test cannot read: "${m.goal}"`); return ok; }
      check(ok === want, `${L.id} ${at(p)}: "${m.label}" reads "${m.text}" against "${m.goal}" and counts as ${ok ? 'met' : 'not met'}`);
      return ok;
    });
    check(score.solved === oks.every(Boolean), `${L.id} ${at(p)}: solved is ${score.solved} with meters ${oks}`);
  }
  console.log(`meters: ${n} settings`);
}

// ── 8. a sensor that focuses itself is at the best focus, on the bench ───────────────────────────
begin('the sensor reaches the best focus at every setting');
{
  let n = 0;
  for (const id of ['camera', 'colour', 'doublet', 'wide']) {
    const L = lv(id);
    for (const p of grid(L, { q: 8, D: 6, c: 9, c1: 5, xi: 4 })) {
      const { b } = run(L, p), sc = item(b, 'sensor')[0]; n++;
      const glass = Math.max(...item(b, 'glass').flatMap((o) => o.outline.filter((_, i) => i % 2 === 0)));
      if (!(sc.x > glass && sc.x + 3.5 <= L.bounds[2])) { fail(`${id} ${at(p)}: the sensor is at ${sc.x.toFixed(1)}; the bench runs from the lens (${glass.toFixed(1)}) to ${L.bounds[2]}`); continue; }
      // the light's mean square distance from the axis, on a screen at x
      const rest = b.surfaces.filter((s) => s.act !== 'target'), rays = b.probe.filter((r) => id !== 'wide' || !r.c);
      const ms = (x) => { const scene = { surfaces: [...rest, { kind: 'seg', ax: x, ay: -60, bx: x, by: 60, act: 'target' }], bounds: L.bounds }; let w = 0, u2 = 0; for (const r of rays) { const o = trace(scene, r); if (o.end === 'target') { w += Math.abs(r.s); u2 += Math.abs(r.s) * o.u * o.u; } } return u2 / w; };
      const here = ms(sc.x);
      check(ms(sc.x - 0.2) >= here && ms(sc.x + 0.2) >= here, `${id} ${at(p)}: the light is tighter 0.2 mm from the sensor than on it`);
    }
  }
  console.log(`sensor: ${n} settings`);
}

// ── 9. the glasses that win are the eye's error moved to the lens ────────────────────────────────
begin('the glasses: the eye, its lens and the power that wins');
{
  const L = lv('specs'), n = G.EYE.n(550), key = keyText(L, R('specs', {}).b).join(' | ');
  const parts = (P) => { const { b, score, m } = R('specs', { P }); return { b, score, m, cornea: b.surfaces.find((s) => s.act === 'refract' && s.nR === G.EYE), lens: b.surfaces.filter((s) => s.tag === 'part' && s.act === 'refract'), e: item(b, 'eye')[0] }; };
  const { cornea, e } = parts(0), len = e.cx + e.RB, Rc = cornea.kind === 'arc' ? cornea.r : cornea.R;
  // the eye's error: the light must arrive this much weaker to focus on the retina
  const K = (n / len - (n - 1) / Rc) * 1000;
  // spherical aberration: light from the far point, through the cornea 1.5 mm from its middle, against the measured average
  const far = 1000 / K, o = trace({ surfaces: [{ ...cornea, h: 4 }], bounds: [-1000, -100, 1000, 100] }, { x: far, y: 0, dx: -far, dy: 1.5, nm: 550 }), k = o.pts.length;
  const sl = (o.pts[k - 1] - o.pts[k - 3]) / (o.pts[k - 2] - o.pts[k - 4]), sa = (n / (o.pts[k - 4] - o.pts[k - 3] / sl) - n / len) * 1000;
  const measured = 24 * Math.sqrt(5) * 0.18e-3 * 1.5 ** 2 / 3 ** 4 * 1000;      // +0.18 µm of Zernike spherical aberration over a 6 mm pupil (Kingston and Cox 2013)
  check(Math.abs(sa / measured - 1) < 0.03, `the model eye is ${sa.toFixed(2)} D stronger 1.5 mm from its middle; an average eye is ${measured.toFixed(2)} D`);
  const wins = [];
  let best = [Infinity, 0], d = 0;
  for (const P of some(L.params[0], 49)) {
    const { b, score, m, lens } = parts(P);
    // the lens: a meniscus, its back face 12 mm from the eye, its power (one over its back focal length) the slider's
    const ax = trace({ surfaces: lens, bounds: [-100, -100, 100, 100] }, { x: -50, y: 0, dx: 1, dy: 0, nm: 550 }).pts, v2 = ax[4];
    d = -v2;
    const curve = (s) => (s.kind === 'seg' ? 0 : -s.side);
    check(curve(lens[0]) === curve(lens[1]) && curve(lens[0]) !== 0, `specs ${P} D: the faces of the lens do not curve the same way`);
    check(Math.abs(d - +/(\d+) mm from the eye/.exec(key)[1]) < 0.01, `specs ${P} D: the lens's back face is ${d.toFixed(2)} mm from the eye; the key says ${/(\d+) mm from the eye/.exec(key)[1]}`);
    if (P) { const back = paraxial(lens, 550).at - v2; check(Math.abs(1000 / back - P) < 0.01, `specs ${P} D: the lens's power is ${(1000 / back).toFixed(2)} D`);
      check(num(score.rows[0][1]) === Math.round(back), `specs ${P} D: its focal length reads ${score.rows[0][1]}; it is ${back.toFixed(0)} mm`); }
    if (score.solved) wins.push(P);
    if (m.blur < best[0]) best = [m.blur, P];
  }
  const need = K / (1 + d / 1000 * K);
  check(wins.length > 0, 'specs: no power wins');
  for (const P of wins) check(Math.abs(P - need) <= 0.25, `specs: ${P} D wins; the eye's error ${K.toFixed(2)} D moved ${d.toFixed(0)} mm to the lens is ${need.toFixed(2)} D`);
  check(Math.abs(best[1] - need) <= 0.25 && best[1] <= need, `specs: the sharpest power is ${best[1]} D; the eye's error at the lens is ${need.toFixed(2)} D, and the pupil's edge needs a little more`);
  // what the note says about it
  let r;
  if ((r = /This eye is ([\d.]+) D too strong/.exec(L.learned))) check(+r[1] === +(-K).toFixed(1), `specs: the note says the eye is ${r[1]} D too strong; it is ${(-K).toFixed(2)}`);
  if ((r = /it takes (−[\d.]+) D/.exec(L.learned))) check(num(r[1]) === +need.toFixed(1), `specs: the note says ${r[1]} D at the lens; it is ${need.toFixed(2)}`);
  if ((r = /only (\d+) µm tall/.exec(L.learned))) check(+r[1] === Math.round(5 * (len - Rc) * 1000 * Math.PI / 10800), 'specs: the note\'s 20/20 letter is not 5 minutes of arc on this retina');
  console.log(`glasses: the eye's error ${K.toFixed(2)} D, ${need.toFixed(2)} D at the lens; wins ${wins.join(', ')} D; edge of the pupil ${sa.toFixed(2)} D stronger`);
}

// ── 10. the known solutions win, and nothing is solved when it opens ─────────────────────────────
begin('the known solutions win');
for (const L of LEVELS) {
  check(PLAYS[L.id], `${L.id}: no known solution in plays.mjs`);
  check(!run(L, def(L)).score.solved, `${L.id}: solved when it opens`);
  if (PLAYS[L.id]) { const s = settings(L.id), { score } = R(L.id, s); check(score.solved, `${L.id}: ${at(s)} does not win (${score.meters.map((m) => m.text).join(', ')})`);
    for (const [k, v] of Object.entries(s)) { const q = L.params.find((x) => x.id === k); check(q && (q.options ? v < q.options.length : v >= q.min && v <= q.max), `${L.id}: ${k} = ${v} is not a setting the control has`); } }
  for (const q of L.params) check(q.options ? q.value < q.options.length : q.value >= q.min && q.value <= q.max, `${L.id}: ${q.id} opens outside its range`);
}

// ── report ───────────────────────────────────────────────────────────────────────────────────────
let total = 0;
for (const [name, list] of fails) {
  total += list.length;
  console.log(`\nFAIL ${name}: ${list.length}`);
  for (const m of list.slice(0, 6)) console.log('  ' + m);
  if (list.length > 6) console.log(`  ... and ${list.length - 6} more`);
}
console.log(total ? `\n${total} failure(s) in ${fails.size} of 10 checks` : '\nThe Optics model obeys its laws: 10 checks passed.');
process.exit(total ? 1 : 0);
