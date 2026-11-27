// Checks what the Rainbows page draws and says against its own model, in Node (no browser):
//  - Surface: each beam is drawn by its irradiance, so the reflected and passed beams, each times its width,
//    add up to the arriving one; straight on (0°) s and p are drawn alike, and the beam leaving is never
//    drawn with more light than arrived;
//  - Drop: a ray to the eye is drawn by its own weight, so no ray comes or goes at more than a trace of
//    alpha as the drop moves through the bow; the twice-reflected rays leave at their own bow, near 51°, and
//    are no more than the first bow's set; the caption's shares are the whole face's; the readout says what
//    its polarization number is, and gives the real angle with the colours spread;
//  - Rain: the slowdowns come from the measured fall speed of the page's 2 mm drop; a marked drop is drawn
//    at full strength all the way down, and comes back only at the top of the rain; the panel names the
//    color each marked drop is drawn in; the caption does not say there is no bow while the outer bow is up;
//  - Molecules: the light keeps the polarization set at Surface, and the electrons swing as far as the
//    field in the water drives them;
//  - the colour drawn while a wavelength slider moves: it arrives within the smooth test's 24 held frames
//    after its paused drag, changes steadily, without the bursts an ease in nanometres gave, and no frame of it
//    is undone by the next where it turns back.
//
//   node tests/rainbows/model.mjs
import * as O from '../../js/rainbows/optics.js';
import * as surface from '../../js/rainbows/stages/surface.js';
import * as drop from '../../js/rainbows/stages/drop.js';
import * as rain from '../../js/rainbows/stages/rain.js';
import * as atoms from '../../js/rainbows/stages/atoms.js';

let fails = 0;
const fail = what => { fails++; console.log('FAIL ' + what); };
const need = (f, name) => { if (typeof f !== 'function' && typeof f !== 'object') { fail(`${name} is not exported`); return false; } return true; };
const DEG = Math.PI / 180;

// ---- Surface: the glow of each beam
if (need(surface.beamGlow, 'surface beamGlow')) {
  for (const cross of ['enter', 'back', 'exit']) for (const pol of ['s', 'p']) {
    const top = surface.maxAngle({ cross });
    for (let a = 0; a <= top; a += 0.5) {
      const g = surface.beamGlow({ cross, pol, theta: a, lambda: 550 });
      const sum = g.reflected + g.passed * g.width;
      if (Math.abs(sum - g.arriving) > 1e-9) fail(`Surface, ${cross}, ${pol}, ${a}°: reflected and passed light add up to ${sum.toFixed(4)} of the arriving`);
    }
    const s0 = surface.beamGlow({ cross, pol: 's', theta: 0, lambda: 550 }), p0 = surface.beamGlow({ cross, pol: 'p', theta: 0, lambda: 550 });
    if (Math.abs(s0.passed - p0.passed) > 1e-5 || Math.abs(s0.reflected - p0.reflected) > 1e-5) fail(`Surface, ${cross}, 0°: s and p are drawn differently (${s0.passed.toFixed(3)} and ${p0.passed.toFixed(3)})`);
    if (s0.passed > 1) fail(`Surface, ${cross}, 0°: the passed beam is drawn brighter (${s0.passed.toFixed(3)}) than the beam that arrived`);
  }
}

// ---- Drop: rays to the eye fade in and out by their own weight
if (need(drop.ensure, 'drop ensure') && need(drop.eyeAlpha, 'drop eyeAlpha')) {
  // the drop slid through the red edge of the bow a slider step at a time
  let prev = null, worst = 0, at = 0;
  for (let k = 0; k <= 60; k++) {
    const bowpos = +(0.8 + k * 0.01).toFixed(2), c = drop.ensure({ bowpos, exag: false, second: false });
    const now = new Map(c.eye.map(r => [`${r.sp.l}:${r.b}`, drop.eyeAlpha(r.w, c.share)]));
    if (prev) for (const key of new Set([...now.keys(), ...prev.keys()])) {
      const d = Math.abs((now.get(key) ?? 0) - (prev.get(key) ?? 0));
      if (!(now.has(key) && prev.has(key)) && d > worst) { worst = d; at = bowpos; }
    }
    prev = now;
  }
  if (worst > 0.06) fail(`Drop: a ray to the eye comes or goes at alpha ${worst.toFixed(2)} in one slider step (at ${at})`);
}

// ---- Drop: after two reflections
if (need(drop.ensure, 'drop ensure')) {
  const c = drop.ensure({ bowpos: 0.5, exag: false, second: true });
  if (!c.second?.length) fail('Drop: "Follow a second reflection" traces no rays near the second bow');
  else {
    if (c.second.length > c.cone.length) fail(`Drop: ${c.second.length} twice-reflected rays drawn, more than the first bow's ${c.cone.length}`);
    for (const r of c.second) {
      const n = r.sp.n, o = r.tr.outs.find(x => x.order === 2), th = O.antisolarAngle(o.dir);
      if (Math.abs(th - O.bowAngle(n, 2)) > 0.31 * DEG) { fail(`Drop: a twice-reflected ray at ${r.sp.l} nm leaves at ${(th / DEG).toFixed(2)}°, not at its bow, ${(O.bowAngle(n, 2) / DEG).toFixed(2)}°`); break; }
      // drawn on the eye's side of the axis, as the first bow's rays to the eye are
      const y = Math.cos(r.phi) * o.dir[1];
      if (y > 0) { fail('Drop: a twice-reflected ray is drawn leaving away from the eye\'s side'); break; }
    }
  }
}

// ---- Drop: the words
{
  const N = 20000, n = O.nWater(550), sh = { '-1': 0, 0: 0, 1: 0, 2: 0 };
  for (let j = 0; j < N; j++) { const b = (j + 0.5) / N; for (const o of O.traceDrop(b, n, 2).outs) sh[o.order] += o.I * 2 * b / N; }
  const cap = drop.default.caption({ focus: 'sun', mode: 'ray' }).body;
  for (const [k, what] of [[-1, 'off the front'], [0, 'through the back'], [1, 'after one reflection']]) {
    const p = Math.round(sh[k] * 100) + '%';
    if (!cap.includes(p)) fail(`Drop caption: the whole face sends ${p} ${what}, and the caption does not say so: "${cap}"`);
  }
  const S = { bowpos: 0.5, exag: false, second: false, mode: 'ray', focus: 'both' }, ro = drop.default.readout(S);
  if (/Secondary bow/.test(ro)) fail('Drop readout: "Secondary bow" labels the rainbow ray\'s twice-reflected light, which is not in the outer bow');
  const t = O.traceDrop(O.bowB(n), n, 2), share = Math.round(t.outs[2].Is / t.outs[2].I * 100);
  if (!ro.includes(`${share}% vibrating along the bow`)) fail(`Drop readout: ${share}% is the share of the light vibrating along the bow, and the readout does not say that`);
  const real = drop.eyeAngle({ bowpos: 0.5, exag: false }), wide = drop.default.readout({ ...S, exag: true });
  if (!wide.includes(`${(real / DEG).toFixed(1)}° from the antisolar point`)) fail(`Drop readout with the colours spread: the drop really sits ${(real / DEG).toFixed(1)}°, not as the readout says`);
}

// ---- Rain: how fast the drops fall
{
  const F = rain.FALL_SPEEDS;
  if (!F) fail('rain FALL_SPEEDS is not exported');
  else {
    // the page's drop is 2 mm across (Drop's RADIUS); measured, it falls at 6.5 m/s (Gunn and Kinzer 1949; Foote and du Toit 1969 fit)
    if (Math.abs((drop.RADIUS ?? NaN) * 2 - 2e-3) > 1e-9) fail('Drop: the page\'s drop is no longer 2 mm across: change the fall speed with it');
    if (F.real !== 6.5) fail(`Rain: a 2 mm drop falls at 6.5 m/s, not ${F.real}`);
    const ro = rain.default.readout({ sun: 14, mode: 'ray' });
    for (const [v, what] of [[F.rain, 'Rain shown'], [F.marked, 'Marked drops']]) {
      const k = Math.round(6.5 / v);
      if (!ro.includes(`about ${k}× slower than real`)) fail(`Rain readout: ${what.toLowerCase()} fall about ${k}× slower than a 2 mm drop`);
    }
  }
}
// ---- Rain: the marked drops
if (need(rain.heroes, 'rain heroes')) {
  for (const sun of [0, 14, 30, 40]) {
    const P = 9 / (1.1 / 16), last = new Map();
    for (let T = 0; T < 2 * P; T += 0.5) {
      const hs = rain.heroes({ sun }, T);
      if (hs.length !== 4) { fail(`Rain, Sun ${sun}°: ${hs.length} marked drops at ${T} s, not 4`); break; }
      hs.forEach((h, i) => {
        if (h.P[1] < 8 && h.fade < 1) fail(`Rain, Sun ${sun}°: marked drop ${i + 1} is faded to ${h.fade.toFixed(2)} at ${h.P[1].toFixed(2)} m, in mid-fall`);
        const was = last.get(i);
        if (was !== undefined && h.P[1] > was + 1e-9 && !(was < 0.1 && h.P[1] > 8.8)) fail(`Rain, Sun ${sun}°: marked drop ${i + 1} went up from ${was.toFixed(2)} to ${h.P[1].toFixed(2)} m, and not from the ground to the top`);
        last.set(i, h.P[1]);
      });
      if (fails > 20) break;
    }
  }
  // The panel names the color each marked drop is drawn in. A drop inside a wavelength's bow angle also
  // sends the longer wavelengths, so it is drawn paler and redder than that wavelength: a name taken from
  // the wavelength (indigo for a drop drawn near white) disagrees with the picture.
  if (need(rain.seenName, 'rain seenName')) {
    const RANGE = { red: [[0, 30], [295, 360]], orange: [[0, 60]], yellow: [[30, 105]], green: [[75, 185]], blue: [[155, 265]], violet: [[235, 325]] };
    const look = c => { const g = c.map(v => Math.pow(Math.max(0, v), 1 / 2.2)), hi = Math.max(...g), lo = Math.min(...g), d = hi - lo;
      const h = d ? 60 * (hi === g[0] ? ((g[1] - g[2]) / d + 6) % 6 : hi === g[1] ? (g[2] - g[0]) / d + 2 : (g[0] - g[1]) / d + 4) : 0;
      return { h, sat: hi ? d / hi : 0 }; };
    let named = 0;
    for (let T = 0; T < 140; T += 0.25) for (const h of rain.heroes({ sun: 14 }, T)) {
      const name = rain.seenName(h), { h: hue, sat } = look(h.col), word = name.replace(/, outer bow$/, '').replace(/^pale /, '');
      if (name === 'dark') { if (h.level > 0.2) fail(`Rain: a marked drop drawn at ${(h.level * 100).toFixed(0)}% is named dark`); continue; }
      named++;
      if (word === 'white') { if (sat > 0.2) fail(`Rain: a marked drop at ${(h.th / DEG).toFixed(2)}° is named "${name}" but is drawn at hue ${hue.toFixed(0)}°, ${(sat * 100).toFixed(0)}% from white`); continue; }
      if (sat < 0.08) fail(`Rain: a marked drop at ${(h.th / DEG).toFixed(2)}° is named "${name}" but is drawn white`);
      else if (!(RANGE[word] || []).some(([a, b]) => hue >= a && hue <= b)) fail(`Rain: a marked drop at ${(h.th / DEG).toFixed(2)}° is named "${name}" but is drawn at hue ${hue.toFixed(0)}°`);
      if (!/^pale /.test(name) && sat < 0.25) fail(`Rain: a marked drop at ${(h.th / DEG).toFixed(2)}° is named "${name}" but is drawn pale`);
      if (fails > 20) break;
    }
    if (named < 50) fail(`Rain: only ${named} marked drops named, too few to check`);
  }
  const B2 = O.bowAngle(O.nWater(550), 2) / DEG;
  for (const sun of [43, 47, 50]) {
    const c = rain.default.caption({ sun, focus: 'both', mode: 'ray' });
    if (sun < B2 && !/outer bow/.test(c.body)) fail(`Rain caption at Sun ${sun}°: the outer bow is still up, and the caption does not say so`);
    if (/no bow/.test(c.title)) fail(`Rain caption at Sun ${sun}°: "${c.title}" while the outer bow is still up`);
  }
}

// ---- Molecules: polarization and the electrons' swing
if (need(atoms.setup, 'atoms setup') && need(atoms.swingPerField, 'atoms swingPerField')) {
  for (const tilt of [0, 30, 59.4, 75]) for (const pol of ['s', 'p']) {
    const S = { lambda: 550, tilt, pol }, c = atoms.setup(S), n = O.nWater(550), th = tilt * DEG;
    const ci = Math.cos(th), cT = Math.sqrt(1 - (Math.sin(th) / n) ** 2);
    const t = pol === 's' ? 2 * ci / (ci + n * cT) : 2 * ci / (n * ci + cT);
    if (Math.abs(c.t - t) > 1e-12) fail(`Molecules, ${pol}, ${tilt}°: E in the water is drawn ${c.t.toFixed(4)} of the arriving one, and Fresnel gives ${t.toFixed(4)}`);
    const inPlane = Math.abs(c.eT[1]) < 1e-12 && Math.abs(c.eI[1]) < 1e-12, across = Math.abs(c.eT[1]) === 1;
    if (pol === 'p' && !inPlane) fail(`Molecules, p, ${tilt}°: E is not drawn in the plane of the bend`);
    if (pol === 's' && !across) fail(`Molecules, s, ${tilt}°: E is not drawn across the plane of the bend`);
    const dot = c.eT[0] * c.dt[0] + c.eT[2] * c.dt[2];
    if (Math.abs(dot) > 1e-12) fail(`Molecules, ${pol}, ${tilt}°: E in the water is not at right angles to the way the light goes`);
  }
  // the swing is the field there times one number: so it shrinks with t as the light comes in more steeply
  const sw = tilt => { const S = { lambda: 550, tilt, pol: 's' }, c = atoms.setup(S); return atoms.swingPerField(S) * c.t; };
  const ratio = sw(75) / sw(0), t75 = atoms.setup({ lambda: 550, tilt: 75, pol: 's' }).t / atoms.setup({ lambda: 550, tilt: 0, pol: 's' }).t;
  if (Math.abs(ratio - t75) > 1e-9) fail(`Molecules: the electrons swing ${ratio.toFixed(3)} as far at 75° as at 0°, while the field there is ${t75.toFixed(3)} as strong`);
}

// ---- the colour drawn while a wavelength slider moves
if (need(O.easeWavelength, 'optics easeWavelength')) {
  const gam = l => O.wlRGB(l).map(x => 255 * Math.pow(Math.min(1, Math.max(0, x)), 1 / 2.2));
  const step = (a, b) => { const p = gam(a), q = gam(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
  const run = targets => { let d = targets[0]; const ch = [], st = {}; for (const s of targets) { const e = O.easeWavelength(d, Math.round(s), 1 / 60, st); ch.push(step(d, e)); d = e; } return { d, ch }; };
  const lin = (out, a, b, k) => { for (let i = 1; i <= k; i++) out.push(a + (b - a) * i / k); return out; };
  // the smooth test's paused round trip on the Molecules scale (250 to 700 nm and back), then 24 held frames
  for (const m of [6, 7, 9, 12, 16, 24, 48]) {
    const seq = lin(lin([250], 250, 700, m), 700, 250, m), held = Array(24).fill(250);
    const { d } = run([...seq, ...held]);
    if (d !== 250) fail(`colour ease: after a ${m}-frame drag back to 250 nm and 24 frames held, the colour drawn is still at ${d.toFixed(1)} nm`);
  }
  // the smooth test's sweeps (slowly there and back, then quickly): the colour drawn changes by a bounded
  // amount in any one frame (an ease in nanometres moved it by up to 250 of 255 where hue changes fastest)
  const hold = (o, k) => { for (let i = 0; i < k; i++) o.push(o[o.length - 1]); return o; };
  for (const [lo, n] of [[400, 12], [400, 24], [400, 40], [400, 80], [250, 24]]) {
    const seq = hold([lo], 11); lin(seq, lo, 700, n); hold(seq, 4); lin(seq, 700, lo, n); hold(seq, 4); lin(seq, lo, 700, 6); hold(seq, 8); lin(seq, 700, lo, 6); hold(seq, 16);
    const { ch } = run(seq), most = Math.max(...ch);
    if (most > 110) fail(`colour ease: a ${n}-frame sweep from ${lo} to 700 nm changes the colour drawn by ${most.toFixed(0)} of 255 in one frame`);
  }
  // the smooth test's sweep gesture whole (the slider jumps to its start, then slow, fast and paused drags there
  // and back): no frame of the colour drawn is undone by the next, as when the colour turns straight back where
  // the slider passes it or where it catches up with a slider coming the other way (the smooth test's one-frame
  // flash). Measured along the colour's path: a step of more than 0.3% of it, then a frame back within 45% of it.
  for (const lo of [250, 380, 400]) for (const n of [12, 24, 32, 48, 80]) {
    const m = Math.round(n * 0.6), seq = hold([550], 11);
    seq.push(lo); lin(seq, lo, 700, n); hold(seq, 4); lin(seq, 700, lo, n); hold(seq, 4); lin(seq, lo, 700, 6); hold(seq, 8); lin(seq, 700, lo, 6); hold(seq, 40);
    lin(seq, lo, 700, m); lin(seq, 700, lo, m); hold(seq, 24);
    let d = seq[0]; const xs = [], st = {};
    for (const g of seq) { d = O.easeWavelength(d, Math.round(g), 1 / 60, st); xs.push(O.colourArc(d)); }
    for (let i = 1; i + 1 < xs.length; i++) {
      const a = Math.abs(xs[i] - xs[i - 1]), c = Math.abs(xs[i + 1] - xs[i - 1]);
      if (a > 0.003 && c < 0.45 * a) { fail(`colour ease: in a ${n}-step sweep from ${lo} nm, frame ${i} of the colour drawn is undone by the next (${(a * 100).toFixed(1)}% of the path, then back within ${(c * 100).toFixed(1)}%)`); break; }
    }
  }
}

if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log('rainbows model: all passed');
