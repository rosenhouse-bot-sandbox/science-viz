// Laws of the Vesicle fusion model, checked without a browser.
//
//   node tests/vesicle/model.mjs            (about three minutes; --quick leaves out the inference check)
//
// Runs the scene's own modules in Node with a stand-in for WebGL, and fails if:
//   - glutamate, lipids and proteins are not on one clock: at every step glutamate has spread farthest, the lipids
//     next and the proteins least; glutamate is still in the drawn patch after the Release stage; a glutamate dot
//     changes size with its place;
//   - glutamate is made or lost, a receptor shows glutamate that no drawn molecule has brought, a receptor holds more
//     than it binds, or glutamate is drawn anywhere but in the transmitter cloud;
//   - the pore holds more glutamate than its width holds at the lumen's concentration, or the lumen empties from one end;
//   - the gap, the neck or the SNAREs move before calcium has bound, or calcium is in the cell before the channels open;
//   - a tether's link is not one fixed length in every frame, holds the vesicle beyond its length, or is let go of;
//   - the arriving vesicle's path is not a random walk alike in all three directions, or it tumbles without its proteins;
//   - the same vesicle carries different proteins in the two views;
//   - the camera's trace is not made from the tags the picture draws;
//   - the top sheet of lipid has a hole;
//   - the camera's readout of our vesicle does not show pHluorin dark in the acid and the orange protein doubling;
//   - the vesicle is still standing when the Merged stage says it has flattened;
//   - after a setting changes, a 90% range is shown before the sampler has walked in from where it started.
// Where the model lacks a function a check needs, that check fails and says what is missing.
import * as SC from '../../js/vesicle/scene.js';
import * as PR from '../../js/vesicle/profile.js';
import * as SH from '../../js/vesicle/shaders.js';
import * as VT from '../../js/vesicle/vitro.js';
import * as IR from '../../js/vesicle/irm.js';
import * as INF from '../../js/vesicle/infer.js';

const KI = await import('../../js/vesicle/kinetics.js').catch(() => null);
const quick = process.argv.includes('--quick');
const gl = new Proxy({}, { get: (t, k) => typeof k === 'symbol' ? undefined : /^[A-Z0-9_]+$/.test(k) ? k
  : (...a) => k === 'getShaderParameter' ? true : k === 'getProgramParameter' ? (a[1] === 'ACTIVE_UNIFORMS' ? 0 : true) : k === 'getAttribLocation' ? 0 : {} });
const { PH, D, ARRIVE } = PR, PI = Math.PI;
const scene = new SC.Scene(gl);
let fails = 0, checks = 0;
const fail = (what) => { fails++; if (fails <= 60) console.log('FAIL ' + what); };
const check = (name, fn) => { checks++; const before = fails; try { fn(); } catch (e) { fail(`${name}: ${e.message}`); } console.log(`${fails === before ? 'ok  ' : 'BAD '} ${name}`); };
const need = (obj, keys, what) => { const miss = keys.filter((k) => !obj || !(k in obj)); if (miss.length) throw new Error(`the model has no ${miss.join(', ')} (${what})`); };
const run = (p, diam = 42, vitro = false, extra = {}) => { scene.update({ p, diam, cut: 0, dist: 165, vitro, angle: 68, ...extra }, 1); return scene; };
const balls = (s = scene) => { const d = s.dynData, out = []; for (let b = 0; b < s.dyn.n; b++) { const k = b * 8; out.push({ x: d[k], y: d[k + 1], z: d[k + 2], r: d[k + 3], c: [d[k + 4], d[k + 5], d[k + 6]], cat: Math.floor(d[k + 7] / 8) }); } return out; };
const same = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 1e-4;
// A ball the arriving vesicle carries, put back where it would be if the vesicle had not wandered or turned.
const uncarry = (q, V) => { const x = q.x - V.C[0] - V.off[0], y = q.y - V.C[1], z = q.z - V.C[2] - V.off[2], M = V.M; return [M[0] * x + M[3] * y + M[6] * z, M[1] * x + M[4] * y + M[7] * z, M[2] * x + M[5] * y + M[8] * z]; };
const range = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);

// ---- glutamate, one molecule at a time ------------------------------------------------------------
function cloud(p, diam) {
  need(KI, ['glutamate', 'clock'], 'the glutamate path in JavaScript');
  const s = run(p, diam), d = s.ntData, W = SC.NT_STRIDE, N = s.glutamate, R = diam / 2 - 2.4, top = -D - 1.4, bottom = s.gapBottom;
  const mol = [];
  for (let i = 0; i < N; i++) {
    const k = i * W, bind = d[k + 10] > 0.5 ? [d[k + 7], d[k + 8], d[k + 9], d[k + 10]] : null;
    mol.push({ i, y0: d[k + 1], bind, ...KI.glutamate([d[k + 3], d[k + 4], d[k + 5], d[k + 6]], bind, p, R, top, bottom) });
  }
  return { mol, N, R };
}

check('one clock: glutamate spreads farthest, then lipids, then proteins, and leaves the patch in the Release stage', () => {
  need(KI, ['lipidSpread', 'proteinSpread'], 'spreads on one clock');
  for (const diam of [30, 42, 70]) {
    const R = diam / 2 - 2.4;
    for (const p of range(PH.PORE + 0.01, 1, 60)) {
      const lip = Math.min(KI.lipidSpread(p, R, 0), KI.lipidSpread(p, R, 1)), pro = KI.proteinSpread(p, R);
      if (pro > 0 && lip < 2 * pro) fail(`${diam} nm, progress ${p.toFixed(3)}: proteins have spread ${pro.toFixed(1)} nm, lipids only ${lip.toFixed(1)} nm`);
      if (p < PH.DILATE) continue;
      const { mol } = cloud(p, diam), out = mol.filter((m) => m.where === 'cleft');
      const rms = Math.sqrt(out.reduce((t, m) => t + m.x * m.x + m.z * m.z, 0) / Math.max(1, out.length) / 2);
      if (out.length > 20 && rms < 3 * lip) fail(`${diam} nm, progress ${p.toFixed(3)}: glutamate has spread ${rms.toFixed(0)} nm, lipids ${lip.toFixed(0)} nm`);
    }
    const inPatch = (p) => cloud(p, diam).mol.filter((m) => m.where === 'cleft' && Math.hypot(m.x, m.z) < SC.PATCH).length;
    const N = run(0, diam).glutamate, a = inPatch(PH.OMEGA), b = inPatch(PH.MERGED);
    if (a > 0.12 * N) fail(`${diam} nm: ${a} of ${N} glutamate molecules are still in the drawn patch at the end of the Release stage`);
    if (b > 0) fail(`${diam} nm: ${b} glutamate molecules are still in the drawn patch when the vesicle has flattened`);
  }
  const rad = SH.transmitterVS.match(/float rad = [^;]*;/);
  if (!rad || /pos|fade|length|smoothstep/.test(rad[0])) fail(`a glutamate dot's size depends on where it is: ${rad && rad[0]}`);
});

check('glutamate is conserved, and a receptor shows only the molecules that have reached it', () => {
  need(KI, ['BOUND'], 'how many glutamates a receptor binds');
  for (const diam of [30, 42]) {
    for (const p of range(PH.PORE, 1, 64)) {
      const { mol, N } = cloud(p, diam), n = { lumen: 0, pore: 0, cleft: 0, bound: 0 };
      for (const m of mol) n[m.where]++;
      if (n.lumen + n.pore + n.cleft + n.bound !== N) fail(`${diam} nm, progress ${p.toFixed(3)}: ${n.lumen + n.pore + n.cleft + n.bound} molecules, not ${N}`);
      for (const rc of scene.receptors) {
        const want = rc.nmda ? KI.BOUND.nmda : KI.BOUND.ampa;
        if (rc.bound.length !== want) fail(`a${rc.nmda ? 'n NMDA' : 'n AMPA'} receptor binds ${rc.bound.length} glutamates, not ${want}`);
        if (!(rc.has > 0)) continue;
        for (const b of rc.bound) {
          const m = mol[b.i];
          if (m.where !== 'bound') fail(`${diam} nm, progress ${p.toFixed(3)}: a receptor at ${rc.r.toFixed(0)} nm shows glutamate that has not reached it (${m.where})`);
          else if (Math.hypot(m.x - m.bind[0], m.y - m.bind[1], m.z - m.bind[2]) > 0.01) fail('a bound molecule is not at its site');
        }
      }
      const glu = balls().filter((q) => q.cat === 7 || same(q.c, SC.COLORS.glutamate)).length;
      if (glu) fail(`${diam} nm, progress ${p.toFixed(3)}: ${glu} glutamate balls drawn besides the cloud`);
    }
  }
});

check('the pore holds no more glutamate than the lumen\'s concentration allows, and the lumen thins evenly', () => {
  need(KI, ['released', 'R_GLU'], 'release through the pore');
  for (const diam of [42, 70]) {
    const R = diam / 2 - 2.4, Rin = R - D - 0.9, C0 = run(0, diam).glutamate / (4 / 3 * PI * Rin ** 3);
    for (const p of range(PH.PORE, PH.OMEGA, 70)) {
      const { mol } = cloud(p, diam), S = PR.compute(p, R), a = Math.max(0, S.neck - D - 0.6 - KI.R_GLU);
      const cap = PI * a * a * 2 * S.rho * C0 * (1 - KI.released(p, R)), inPore = mol.filter((m) => m.where === 'pore').length;
      if (inPore > cap + 3 * Math.sqrt(cap) + 2) fail(`${diam} nm, progress ${p.toFixed(3)}: ${inPore} molecules in the pore, which holds ${cap.toFixed(1)} at the lumen's concentration`);
      // Thirds of the lumen by height (in the vesicle's own frame): the fraction still inside is the same in each.
      const th = [[0, 0], [0, 0], [0, 0]];
      for (const m of mol) { const t = Math.min(2, Math.floor((m.y0 + 1) * 1.5)); th[t][0]++; if (m.where === 'lumen') th[t][1]++; }
      const f = th.map(([n, k]) => k / n), all = th.reduce((s, t) => s + t[1], 0) / mol.length;
      th.forEach(([n], j) => { const sd = Math.sqrt(all * (1 - all) / n); if (Math.abs(f[j] - all) > 4 * sd + 0.01) fail(`${diam} nm, progress ${p.toFixed(3)}: ${['the bottom', 'the middle', 'the top'][j]} third of the lumen keeps ${(f[j] * 100).toFixed(0)}%, the whole ${(all * 100).toFixed(0)}%`); });
    }
  }
});

check('calcium first: nothing moves toward fusion until calcium has bound', () => {
  const sytCa = () => { const B = balls(), syt = B.filter((q) => q.cat === 6); return B.some((q) => same(q.c, SC.COLORS.calcium) && syt.some((s) => Math.hypot(s.x - q.x, s.y - q.y, s.z - q.z) < 3)); };
  let pBound = null;
  for (const p of range(0, PH.STALK, 88)) {
    run(p);
    const ca = balls().filter((q) => same(q.c, SC.COLORS.calcium)).length;
    if (p < PH.CA && ca) fail(`progress ${p.toFixed(4)}: ${ca} calcium ions in the cell before the channels open`);
    if (pBound === null && sytCa()) pBound = p;
  }
  if (pBound === null) throw new Error('no calcium binds synaptotagmin before hemifusion');
  for (const diam of [30, 42, 70]) {
    const R = diam / 2 - 2.4, S0 = PR.shape(0, R), snare = (s) => balls(s).filter((q) => q.cat === 3 || q.cat === 4 || q.cat === 5).map((q) => [q.x, q.y, q.z]);
    const ref = snare(run(0, diam));
    for (const p of range(0, pBound, 30).slice(0, -1)) {
      const S = PR.shape(p, R);
      if (Math.abs(S.extra - S0.extra) > 1e-6 || Math.abs(S.neck - S0.neck) > 1e-6) fail(`${diam} nm, progress ${p.toFixed(4)}: the gap or the neck changes before calcium has bound (gap ${S0.extra.toFixed(2)} to ${S.extra.toFixed(2)} nm)`);
      const now = snare(run(p, diam)), moved = now.length !== ref.length ? Infinity : Math.max(0, ...now.map((q, i) => Math.hypot(q[0] - ref[i][0], q[1] - ref[i][1], q[2] - ref[i][2])));
      if (moved > 1e-3) fail(`${diam} nm, progress ${p.toFixed(4)}: the SNAREs move ${moved.toFixed(2)} nm before calcium has bound`);
    }
  }
  const o0 = run(0, 42, true).fluorO, o1 = run(pBound - 0.002, 42, true).fluorO, o2 = run(PH.STALK, 42, true).fluorO;
  if (Math.abs(o1 - o0) > 1e-6) fail('in vitro the orange spot changes before calcium has bound');
  if (!(o2 > o0 * 1.01)) fail('in vitro the orange spot does not brighten in the Trigger stage, as its caption says');
});

check('a tether\'s link is one fixed length, holds only within it, and stays on its rod', () => {
  need(PR, ['TETHER'], 'a tether of fixed length');
  if (PR.TETHER.rod + PR.TETHER.link > 40) fail(`a tether is ${PR.TETHER.rod + PR.TETHER.link} nm; measured tethers are shorter than 40 nm`);
  let n0 = null;
  for (const diam of [30, 42, 70]) for (const vitro of [false, true]) for (const p of range(-ARRIVE, 1, 240)) {
    run(p, diam, vitro);
    const link = balls().filter((q) => q.cat === 19 && Math.abs(q.r - 0.32) < 1e-3), ends = scene.tetherEnds;
    if (n0 === null) n0 = link.length;
    if (link.length !== n0 || ends.length !== 2) { fail(`${diam} nm, progress ${p.toFixed(3)}: ${link.length} beads of link, not ${n0}`); continue; }
    const per = n0 / 2;
    ends.forEach((T, k) => {
      let len = 0, prev = T.tip;
      for (const q of link.slice(k * per, (k + 1) * per)) { len += Math.hypot(q.x - prev[0], q.y - prev[1], q.z - prev[2]); prev = [q.x, q.y, q.z]; }
      if (Math.abs(len - PR.TETHER.link) > 0.04 * PR.TETHER.link) fail(`${diam} nm, progress ${p.toFixed(3)}: link ${k} is ${len.toFixed(1)} nm long, not ${PR.TETHER.link}`);
      if (T.held) {
        const reach = Math.hypot(T.site[0] - T.tip[0], T.site[1] - T.tip[1], T.site[2] - T.tip[2]), off = Math.hypot(T.end[0] - T.site[0], T.end[1] - T.site[1], T.end[2] - T.site[2]);
        if (reach > PR.TETHER.link + 0.5) fail(`${diam} nm, progress ${p.toFixed(3)}: link ${k} holds a site ${reach.toFixed(1)} nm from its rod`);
        if (off > 1) fail(`${diam} nm, progress ${p.toFixed(3)}: link ${k} holds the vesicle but ends ${off.toFixed(1)} nm from its site`);
      }
    });
  }
});

check('the arrival is a random walk alike in every direction, and the vesicle tumbles with all it carries', () => {
  // The free part of the arrival: the first 40% of it, before any tether can hold.
  const ps = range(-ARRIVE, -0.6 * ARRIVE, 400), R = 18.6, st = [0, 0, 0];
  let up = 0, down = 0, prev = null;
  for (const p of ps) {
    const dr = PR.drift(p, R), q = [dr.x, PR.shape(p, R).approach, dr.z];
    if (prev) { for (let a = 0; a < 3; a++) st[a] += (q[a] - prev[a]) ** 2; if (q[1] > prev[1] + 1e-9) up++; else if (q[1] < prev[1] - 1e-9) down++; }
    prev = q;
  }
  const rms = st.map((v) => Math.sqrt(v / (ps.length - 1)));
  if (Math.max(...rms) > 1.3 * Math.min(...rms)) fail(`steps of the free walk are ${rms.map((v) => v.toFixed(2)).join(', ')} nm in x, height and z`);
  if (down > 1.6 * up) fail(`the free walk goes down ${down} times and up ${up} times: something steers it`);
  if ('arrival' in PR) for (let d = 30; d <= 90; d++) {
    const Rd = d / 2 - 2.4, W = PR.arrival(Rd);
    if (!W) { fail(`${d} nm: no arrival walk`); continue; }
    const last = PR.drift(-1e-4, Rd);
    if (!last.held.every(Boolean)) fail(`${d} nm: the walk does not end within reach of both tethers`);
  }
  // In the vesicle's own frame its synaptobrevins do not move while it wanders far from the membrane.
  let ref = null;
  for (const p of range(-ARRIVE, -0.12, 30)) {
    run(p); if (scene.S.approach < 25) continue;
    const V = scene.vesMove, sb = balls().filter((q) => q.cat === 5).map((q) => uncarry(q, V));
    const m = sb.reduce((t, q) => [t[0] + q[0] / sb.length, t[1] + q[1] / sb.length, t[2] + q[2] / sb.length], [0, 0, 0]);
    if (!ref) ref = m; else if (Math.hypot(m[0] - ref[0], m[1] - ref[1], m[2] - ref[2]) > 1) fail(`progress ${p.toFixed(3)}: the synaptobrevins move ${Math.hypot(m[0] - ref[0], m[1] - ref[1], m[2] - ref[2]).toFixed(1)} nm against the tumbling vesicle`);
  }
});

check('the same vesicle carries the same proteins in both views', () => {
  for (const p of [-0.1, 0, 0.3, 0.6, 1]) {
    const count = (vitro) => { const B = balls(run(p, 42, vitro)); return { sb: B.filter((q) => q.cat === 5 && Math.abs(q.r - 0.55) < 1e-3).length, syt: B.filter((q) => q.cat === 6).length }; };
    const a = count(false), b = count(true);
    if (a.sb !== b.sb) fail(`progress ${p}: ${a.sb} synaptobrevin anchor beads in the cell, ${b.sb} on the glass`);
    if (a.syt !== b.syt) fail(`progress ${p}: ${a.syt} synaptotagmin beads in the cell, ${b.syt} on the glass`);
  }
  const nsb = scene.snares.length + scene.free.length, nsyt = scene.syts.length + scene.coat.filter((c) => c.kind === 'syt').length;
  if (nsb < 60 || nsyt < 13) fail(`the vesicle carries ${nsb} synaptobrevins and ${nsyt} synaptotagmins; about 70 and 15 are counted`);
});

check('the camera\'s trace is made from the tags the picture draws', () => {
  const R = 18.6, n = 72, curve = scene.fluorCurve(R, n), w = SC.traceWeight || ((x, z) => Math.exp(-(x * x + z * z) / (2 * 130 * 130)));
  for (let i = 0; i < n; i += 3) {
    const p = -ARRIVE + (1 + ARRIVE) * i / (n - 1), s = run(p, 42, true);
    const sum = [2, 4].map((at) => s.emit.reduce((t, e) => t + e[at] * w(e[0], e[1]), 0) / s.emit.length);
    for (const band of [0, 1]) if (Math.abs(curve[band][i] - sum[band]) > 0.01 * Math.max(sum[band], 0.01)) fail(`progress ${p.toFixed(3)}, ${band ? 589 : 510} nm: trace ${curve[band][i].toFixed(4)}, picture ${sum[band].toFixed(4)}`);
  }
});

check('the top sheet of lipid has no hole at any stage', () => {
  need(SC, ['vesicleLipids', 'sheetLipids', 'seamTurn'], 'the lipids\' places on the flat map');
  const q = 1, area = 0.68 / q, s = Math.sqrt(2 * area / Math.sqrt(3)), ves = SC.vesicleLipids(18.6, q), sh = SC.sheetLipids(q).data;
  for (const leaf of [0, 1]) {
    const Rl = 18.6 + (leaf ? -D : D), uv = Math.sqrt(4 * Rl * Rl), seam = SC.seamTurn(18.6, leaf, q), c = Math.cos(seam), sn = Math.sin(seam), pts = [];
    for (let i = 0; i < ves.length; i += 7) if (ves[i + 5] === 4 * leaf) pts.push([ves[i] * uv, ves[i + 1] * uv]);
    for (let i = 0; i < sh.length; i += 7) if (sh[i + 5] === 1 + 4 * leaf) {
      const x = sh[i] * c - sh[i + 1] * sn, z = sh[i] * sn + sh[i + 1] * c, r = Math.hypot(x, z), k = Math.sqrt(uv * uv + r * r) / Math.max(r, 1e-4);
      if (r * k < uv + 40) pts.push([x * k, z * k]);
    }
    // The flat map keeps area, so a hole on it is a hole in the sheet.
    const cell = 2, grid = new Map(), key = (x, z) => Math.floor(x / cell) + ',' + Math.floor(z / cell);
    for (const p of pts) { const k = key(p[0], p[1]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p); }
    let worst = 0;
    for (let r = Math.max(1, uv - 12); r < uv + 30; r += 0.35) for (let a = 0; a < 2 * PI; a += 0.35 / r) {
      const x = r * Math.cos(a), z = r * Math.sin(a); let best = Infinity;
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (const p of grid.get(key(x + i * cell, z + j * cell)) || []) best = Math.min(best, Math.hypot(p[0] - x, p[1] - z));
      worst = Math.max(worst, best);
    }
    if (worst > 0.9 * s) fail(`${leaf ? 'inner' : 'outer'} sheet: a point near the foot of the dome is ${worst.toFixed(2)} nm from the nearest lipid; lipids are ${s.toFixed(2)} nm apart`);
  }
});

check('the camera reads pHluorin dark in the acid and the orange protein doubling at the pore', () => {
  const ctx = { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }, cv = { getContext: () => ctx };
  const cam = new VT.Camera(cv, cv);
  const read = (p) => {
    const s = run(p, 42, true), o = s.opt, W = 5.5 / 36, emit = s.emit.map((e) => [e[0], e[1], e[2] * W, 0, e[4] * W]), own = emit.length;
    for (const [x, z, rad] of s.docked) { const b = 36 * W * o.at(VT.GAP + rad + 6); emit.push([x, z, VT.QUENCH * b, 0, VT.QUENCH_O * b]); }
    for (const e of s.emitN) emit.push([e[0], e[1], e[2] * W, e[3], e[4] * W]);
    const bg = 0.035 + 0.05 * (o.I0 / 4) * Math.min(o.depth, 2600) / 100; let g = 0, r = 0;
    for (let i = 0; i < 60; i++) { cam.render(emit, bg, true, 1, IR.orangeBlur(), own); g += cam.site; r += cam.siteO; }
    return [g / 60, r / 60];
  };
  need(cam, ['site', 'siteO'], 'a readout of our vesicle alone');
  const a = read(0.3), b = read(PH.PORE + 0.08);
  if (!(a[0] < 0.1 * b[0])) fail(`docked, the 510 nm readout is ${a[0].toFixed(1)} photons, ${(a[0] / b[0] * 100).toFixed(0)}% of its value once the pore is open`);
  if (!(b[1] / a[1] > 1.7 && b[1] / a[1] < 2.3)) fail(`the 589 nm readout goes from ${a[1].toFixed(1)} to ${b[1].toFixed(1)} photons when the pore opens; the caption says it doubles`);
});

check('the vesicle has flattened when the Merged stage begins', () => {
  for (const diam of [30, 42, 70]) for (const p of range(PH.MERGED, 1, 8)) {
    const S = PR.shape(p, diam / 2 - 2.4), top = S.h + S.Rc + D;
    if (top > D + 0.5) fail(`${diam} nm, progress ${p.toFixed(3)}: the vesicle still stands ${(top - D).toFixed(1)} nm above the membrane`);
  }
});

if (!quick) check('after a setting changes, no range is shown until the sampler has walked in', () => {
  const tr = [119, Math.log(42), Math.log(30) + 0.4, Math.log(30) - 0.3, Math.log(0.2), 40];
  const set = { dt: 10, power: 1.5, angle: 68, prior: 1, irm: false, lambda: 630, focus: 0 }, col = new Float32Array(20000);
  const widths = (s) => INF.PARAMS.map((_, i) => { const n = s.column(i, col, 12000); if (!n) return Infinity; const q = INF.quantiles(col, n, [0.05, 0.95]); return q[1] - q[0]; });
  const shown = (s) => !('ready' in s) || s.ready;
  const ex = new INF.Experiment(set); ex.simulate(tr, 10);
  const s = new INF.Sampler(ex, 7, false); s.observe(ex.nf);
  let n = 0; while (!shown(s) && n < 8000) { s.sweep(); n++; }
  for (let i = 0; i < 150; i++) s.sweep();          // what the page does in about two seconds
  const early = widths(s);
  for (let i = 0; i < 3000; i++) s.sweep();
  const late = widths(s);
  early.forEach((w, i) => { if (w > 1.6 * late[i]) fail(`a new event with the whole video seen: the first ${INF.PARAMS[i].name.toLowerCase()} range shown is ${(w / late[i]).toFixed(1)} times the settled one`); });
  // The same event, recorded with three times the light: no range may come out wider than it was.
  const ex2 = new INF.Experiment({ ...set, power: 4.5 }); ex2.simulate(tr, 10);
  if ('retarget' in s) s.retarget(ex2); else s.reset(ex2);
  s.observe(ex2.nf); n = 0;
  while (!shown(s) && n < 8000) { s.sweep(); n++; }
  for (let i = 0; i < 150; i++) s.sweep();
  widths(s).forEach((w, i) => { if (w > 1.3 * late[i]) fail(`with more light the ${INF.PARAMS[i].name.toLowerCase()} range shown widens ${(w / late[i]).toFixed(1)} times`); });
});

console.log(`${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
