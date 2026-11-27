// Overshoot saccades: the 3D picture. Two eyes with their six muscles and optic nerves, and the screen they
// watch, all at true size in mm. The screen's picture (grid, target, where the eyes land) is drawn on a 2D canvas
// and shown on the screen as a texture. Nothing here decides anything: it draws what model.js computes.
import { program, meshBuffers, normals, perspective, lookAt, mul4 } from '../gl/gl.js?v=5e5ad9d2';
import { EYE_R, MUSCLES, OPTIC, SCREEN, TUBE, tube, eyeMuscles, eyeCenter, rot, onScreen } from './model.js?v=5e5ad9d2';

const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec3 aT;
uniform mat4 uVP, uM; out vec3 vW, vN, vT, vL;
void main(){ vec4 w = uM * vec4(aPos, 1.); vW = w.xyz; vN = mat3(uM) * aNor; vT = aT; vL = aPos; gl_Position = uVP * w; }`;
const FS = `#version 300 es
precision highp float;
in vec3 vW, vN, vT, vL; out vec4 o;
uniform vec3 uCol, uCam; uniform mat4 uM; uniform int uKind; uniform float uAlpha, uPupil; uniform sampler2D uTex;
float hash(float n){ return fract(sin(n) * 43758.5453); }
float noise(float x){ float i = floor(x), f = fract(x); return mix(hash(i), hash(i + 1.), f * f * (3. - 2. * f)); }
float gRim = 1.;
vec3 gRimCol = vec3(0.6, 0.75, 1.0);
vec3 lit(vec3 base, vec3 n, float spec, float shine){
  vec3 v = normalize(uCam - vW);
  vec3 L1 = normalize(vec3(0.45, 0.85, -0.55)), L2 = normalize(vec3(-0.7, 0.2, 0.4));
  float d1 = max(dot(n, L1), 0.), d2 = max(dot(n, L2), 0.), d3 = max(dot(n, v), 0.);
  float hemi = 0.5 + 0.5 * n.y;
  vec3 c = base * (0.14 + 0.1 * hemi + 0.62 * d1 + 0.18 * d2 * vec3(0.75, 0.85, 1.1) + 0.3 * d3);   // the last light comes from the camera
  float s = pow(max(dot(n, normalize(L1 + v)), 0.), shine) * spec;
  float rim = pow(1. - max(dot(n, v), 0.), 3.) * 0.18 * gRim;
  return c + vec3(s) + rim * gRimCol;
}
void main(){
  vec3 n = normalize(vN); if (dot(n, uCam - vW) < 0.) n = -n;   // light the side that faces the camera, whichever way its triangles wind
  if (uKind == 7) {                    // the backdrop: a dark gradient
    float y = vL.y * 0.5 + 0.5, r = length(vL.xy * vec2(0.8, 1.0));
    o = vec4(mix(vec3(0.018, 0.024, 0.05), vec3(0.05, 0.065, 0.11), y) * (1.1 - 0.35 * r), 1.); return;
  }
  if (uKind == 2) {                    // the screen: its picture, lit from within
    vec3 t = texture(uTex, vT.xy).rgb; o = vec4(t, 1.); return;
  }
  if (uKind == 6) {                    // a line of sight: drawn in light blue, brightest at the eye
    float a = uAlpha * (1. - 0.55 * vT.x) * (1. - abs(vT.y * 2. - 1.));
    o = vec4(uCol * a, a); return;
  }
  if (uKind == 1) {                    // the white of the eye; the inside, seen past the iris, is dark
    if (!gl_FrontFacing) { o = vec4(0.05, 0.02, 0.02, 1.); return; }
    n = normalize(mat3(uM) * vT);                            // the exact sphere's normal, so the shading has no bands
    float back = smoothstep(-0.2, 0.9, vT.z);
    vec3 base = mix(vec3(0.96, 0.93, 0.88), vec3(0.93, 0.8, 0.75), back);
    gRim = 0.5; gRimCol = vec3(1.0, 0.9, 0.85);
    o = vec4(lit(base, n, 0.12, 30.), 1.); return;
  }
  if (uKind == 3) {                    // the iris and pupil (vT.x: 0 at the center, 1 at the edge; vT.y: angle)
    float r = vT.x, a = vT.y;
    if (r < uPupil) { o = vec4(vec3(0.012), 1.); return; }
    float q = (r - uPupil) / (1. - uPupil);
    float streak = noise(a * 38.) * 0.6 + noise(a * 91. + q * 4.) * 0.4;
    vec3 outer = vec3(0.22, 0.36, 0.52), inner = vec3(0.55, 0.42, 0.22);
    vec3 base = mix(inner, outer, smoothstep(0.12, 0.45, q)) * (0.7 + 0.55 * streak);
    base *= 1. - 0.65 * smoothstep(0.82, 1., q);              // the darker ring at the iris edge
    o = vec4(lit(base, n, 0.05, 20.) * 0.9, 1.); return;
  }
  if (uKind == 4) {                    // the clear cornea: only its shine and its edge show
    vec3 v = normalize(uCam - vW);
    float f = pow(1. - max(dot(n, v), 0.), 4.);
    float s = pow(max(dot(n, normalize(normalize(vec3(0.45, 0.85, -0.55)) + v)), 0.), 160.) * 1.4
            + pow(max(dot(n, normalize(normalize(vec3(-0.5, 0.4, -0.75)) + v)), 0.), 300.) * 0.6;
    float a = clamp(0.03 + 0.45 * f + s, 0., 1.);
    o = vec4(vec3(1.) * a, a); return;
  }
  if (uKind == 5) {                    // a muscle (vT.x: mm from the insertion, vT.y: how hard it is driven, vT.z: tendon length)
    float tendon = 1. - smoothstep(vT.z - 4., vT.z + 4., vT.x);
    // A muscle driven harder is drawn brighter, but only where it faces the camera. Toward its outline it keeps one
    // color whatever its signal, so that a brighter muscle does not look wider: its width follows its length alone.
    float face = smoothstep(0.25, 0.75, max(dot(n, normalize(uCam - vW)), 0.));
    vec3 m = mix(vec3(0.62, 0.2, 0.18), vec3(1.0, 0.32, 0.25), clamp(vT.y, 0., 1.) * face);
    if (vT.y < -0.5) m = vec3(1.0, 0.78, 0.3);              // the muscle picked in the panel, drawn in gold
    vec3 base = mix(m, vec3(0.95, 0.92, 0.86), tendon);
    gRim = 0.25 * (1. - tendon); gRimCol = vec3(1.0, 0.85, 0.8);
    vec3 c = lit(base, n, mix(0.12, 0.15, tendon), mix(18., 30., tendon)) + base * 0.1 * tendon;
    c += vec3(1.0, 0.35, 0.2) * 0.35 * clamp(vT.y - 0.6, 0., 1.) * (1. - tendon) * face;
    if (vT.y < -0.5) c += vec3(0.25, 0.18, 0.05);
    o = vec4(c, 1.); return;
  }
  o = vec4(lit(uCol, n, 0.15, 30.), uAlpha);
}`;

// ---- meshes ----
function sphereCap(r, th0, th1, nTh, nPh, center = [0, 0, 0]) {
  // polar angle th measured from the front (-z); aT = the point's direction
  const pos = [], tt = [], idx = [];
  for (let i = 0; i <= nTh; i++) {
    const th = th0 + (th1 - th0) * i / nTh;
    for (let j = 0; j <= nPh; j++) {
      const ph = 2 * Math.PI * j / nPh, d = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), -Math.cos(th)];
      pos.push(center[0] + r * d[0], center[1] + r * d[1], center[2] + r * d[2]); tt.push(...d);
    }
  }
  for (let i = 0; i < nTh; i++) for (let j = 0; j < nPh; j++) { const a = i * (nPh + 1) + j, b = a + nPh + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  return { pos: new Float32Array(pos), tt: new Float32Array(tt), idx: new Uint16Array(idx) };
}
function disc(r, z, nR, nPh) {
  const pos = [], tt = [], idx = [], nor = [];
  for (let i = 0; i <= nR; i++) for (let j = 0; j <= nPh; j++) {
    const q = i / nR, ph = 2 * Math.PI * j / nPh, rr = r * q;
    pos.push(rr * Math.cos(ph), rr * Math.sin(ph), z - 0.25 * q * q); tt.push(q, ph, 0); nor.push(0, 0, -1);
  }
  for (let i = 0; i < nR; i++) for (let j = 0; j < nPh; j++) { const a = i * (nPh + 1) + j, b = a + nPh + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  return { pos: new Float32Array(pos), tt: new Float32Array(tt), idx: new Uint16Array(idx), nor: new Float32Array(nor) };
}
function box(c, s) {   // a box: center c, half sizes s
  const pos = [], nor = [], idx = [];
  const F = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];
  for (const [ax, sg] of F) {
    const u = (ax + 1) % 3, v = (ax + 2) % 3, base = pos.length / 3;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = [0, 0, 0]; p[ax] = sg * s[ax]; p[u] = a * s[u]; p[v] = b * s[v]; pos.push(c[0] + p[0], c[1] + p[1], c[2] + p[2]); const nn = [0, 0, 0]; nn[ax] = sg; nor.push(...nn); }
    if (sg > 0) idx.push(base, base + 1, base + 2, base, base + 2, base + 3); else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  return { pos, nor, idx };
}
function merge(list) {
  const pos = [], nor = [], idx = [];
  for (const m of list) { const b = pos.length / 3; pos.push(...m.pos); nor.push(...m.nor); idx.push(...m.idx.map((i) => i + b)); }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint16Array(idx), tt: new Float32Array(pos.length) };
}
// a ring (torus) of tube radius rt round the z axis... placed with a matrix
function torus(R, rt, n1, n2) {
  const pos = [], nor = [], idx = [];
  for (let i = 0; i <= n1; i++) for (let j = 0; j <= n2; j++) {
    const a = 2 * Math.PI * i / n1, b = 2 * Math.PI * j / n2, c = [Math.cos(a), Math.sin(a), 0], nn = [c[0] * Math.cos(b), c[1] * Math.cos(b), Math.sin(b)];
    pos.push(R * c[0] + rt * nn[0], R * c[1] + rt * nn[1], rt * nn[2]); nor.push(...nn);
  }
  for (let i = 0; i < n1; i++) for (let j = 0; j < n2; j++) { const a = i * (n2 + 1) + j, b = a + n2 + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint16Array(idx), tt: new Float32Array(pos.length) };
}

const NS = TUBE.ns, NA = TUBE.na;                        // samples along a muscle and round it (the shapes are made in model.js)
function tubeIndex(ns, na) {
  const idx = [];
  for (let i = 0; i < ns - 1; i++) for (let j = 0; j < na; j++) { const a = i * (na + 1) + j, b = a + na + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  return new Uint16Array(idx);
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

const GAZE_RING = 0.75;                                  // radius in degrees of the ring round the place the eyes look (the target's is 0.4)

export function makeScene(gl) {
  const P = program(gl, VS, FS), u = P.u;
  const mk = (m) => { const b = meshBuffers(gl, m.pos.length / 3, m.idx); b.setPos(m.pos); b.setNor(m.nor || normals(m.pos, m.idx)); b.setTT(m.tt); return b; };
  const LIMBUS = Math.asin(5.2 / EYE_R);
  const sclera = mk(sphereCap(EYE_R, LIMBUS, Math.PI, 40, 56));
  const iris = mk(disc(6.1, -10.25, 18, 72));
  // the cornea: part of a smaller sphere, radius 7.8 mm, standing out in front of the white of the eye
  const cc = [0, 0, -5], c = sphereCap(7.8, 0, Math.acos((10.8 - 5) / 7.8) + 0.02, 14, 56, cc);
  const cornea = mk({ ...c, nor: (() => { const nn = new Float32Array(c.pos.length); for (let i = 0; i < c.pos.length; i += 3) { const d = norm(sub([c.pos[i], c.pos[i + 1], c.pos[i + 2]], cc)); nn.set(d, i); } return nn; })() });
  // the screen: a bezel, the picture, a stand
  const S = SCREEN, z = -S.d;
  const bez = merge([box([0, 0, z - 9], [S.w / 2 + 10, S.h / 2 + 10, 7]), box([0, -S.h / 2 - 95, z - 30], [22, 90, 8]), box([0, -S.h / 2 - 188, z - 30], [120, 4, 90])]);
  const bezel = mk(bez);
  const scr = { pos: new Float32Array([-S.w / 2, -S.h / 2, z + 0.5, S.w / 2, -S.h / 2, z + 0.5, S.w / 2, S.h / 2, z + 0.5, -S.w / 2, S.h / 2, z + 0.5]), nor: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), tt: new Float32Array([0, 1, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0]), idx: new Uint16Array([0, 1, 2, 0, 2, 3]) };
  const screen = mk(scr);
  const back = mk({ pos: new Float32Array([-1, -1, 0.9999, 1, -1, 0.9999, 1, 1, 0.9999, -1, 1, 0.9999]), nor: new Float32Array(12), tt: new Float32Array(12), idx: new Uint16Array([0, 1, 2, 0, 2, 3]) });
  const loop = mk(torus(1.9, 0.55, 20, 8));                 // the trochlea: the loop the superior oblique runs through
  // the muscles and optic nerves change shape every frame
  const tIdx = tubeIndex(NS, NA), tubes = [];
  const buffers = () => ({ b: meshBuffers(gl, NS * (NA + 1), tIdx, true), tt: new Float32Array(NS * (NA + 1) * 3) });
  for (let i = 0; i < 2 * (MUSCLES.length + 1); i++) tubes.push(buffers());
  const beam = meshBuffers(gl, 8, new Uint16Array([0, 1, 2, 1, 3, 2, 4, 5, 6, 5, 7, 6]), true);
  // the screen's picture
  const tex = [0, 1].map(() => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; });
  const pic = document.createElement('canvas'); pic.width = 1024; pic.height = Math.round(1024 * S.h / S.w);
  const ctx = pic.getContext('2d');

  // the screen's picture, in screen pixels: x from the left, y from the top
  const px = (h, v) => { const q = onScreen(h, v); return [(q[0] / S.w + 0.5) * pic.width, (0.5 - q[1] / S.h) * pic.height]; };
  function paint(f, withGaze) {
    const W = pic.width, H = pic.height;
    ctx.fillStyle = '#0a0f1c'; ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6); g.addColorStop(0, 'rgba(40,55,90,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // a grid, one line per degree, brighter every 5°
    for (let d = -24; d <= 24; d++) {
      ctx.strokeStyle = d % 5 ? 'rgba(160,180,230,0.07)' : 'rgba(160,180,230,0.2)'; ctx.lineWidth = d ? 1.2 : 2;
      ctx.beginPath(); for (let v = -14; v <= 14; v += 2) { const q = px(d, v); v === -14 ? ctx.moveTo(...q) : ctx.lineTo(...q); } ctx.stroke();
      if (Math.abs(d) <= 14) { ctx.beginPath(); for (let h = -24; h <= 24; h += 2) { const q = px(h, d); h === -24 ? ctx.moveTo(...q) : ctx.lineTo(...q); } ctx.stroke(); }
    }
    const deg = px(1, 0)[0] - px(0, 0)[0];
    if (withGaze) {
      // Marks an eye tracker would add, drawn first so that none of them covers the target.
      // Where overshoot saccades landed, as small orange ticks. Each stays as long as its dot stays on the trace in
      // the panel (age runs from 0 to 1) and grows faint toward the end.
      for (const L of f.landed) { const q = px(...L.p), a = 1 - L.age * L.age; ctx.strokeStyle = `rgba(255,154,77,${(0.95 * a).toFixed(3)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(q[0], q[1] - deg * 0.7); ctx.lineTo(q[0], q[1] + deg * 0.7); ctx.stroke(); }
      // where the eyes have looked over the last 0.4 s, then where they look now, drawn in light blue
      const tr = f.trail;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 1; i < tr.length; i++) {
        const a = px(tr[i - 1][0], tr[i - 1][1]), b = px(tr[i][0], tr[i][1]);
        ctx.strokeStyle = `rgba(127,214,255,${(0.75 * i / tr.length).toFixed(3)})`; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
      }
      // a thin ring round the place the eyes look, wider than the target, so that the target shows inside it
      const E = px(...f.E);
      ctx.strokeStyle = 'rgba(5,8,16,0.85)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(E[0], E[1], deg * GAZE_RING, 0, 7); ctx.stroke();
      ctx.strokeStyle = '#7fd6ff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(E[0], E[1], deg * GAZE_RING, 0, 7); ctx.stroke();
    }
    // the target, drawn in gold and last: 0.8° across, with a faint halo no wider than itself
    const T = px(...f.T);
    const tg = ctx.createRadialGradient(T[0], T[1], deg * 0.3, T[0], T[1], deg * 0.65); tg.addColorStop(0, 'rgba(255,215,115,0.4)'); tg.addColorStop(1, 'rgba(255,215,115,0)');
    ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(T[0], T[1], deg * 0.65, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd773'; ctx.beginPath(); ctx.arc(T[0], T[1], deg * 0.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff6dc'; ctx.beginPath(); ctx.arc(T[0], T[1], deg * 0.12, 0, 7); ctx.fill();
  }
  function upload(t) { gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pic); gl.generateMipmap(gl.TEXTURE_2D); }

  const ident = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const place = (R, t) => new Float32Array([R[0][0], R[1][0], R[2][0], 0, R[0][1], R[1][1], R[2][1], 0, R[0][2], R[1][2], R[2][2], 0, t[0], t[1], t[2], 1]);
  // a ring that faces along direction d
  const facing = (d, t) => { const zz = norm(d), xx = norm(Math.abs(zz[1]) < 0.9 ? cross([0, 1, 0], zz) : cross([1, 0, 0], zz)), yy = cross(zz, xx); return place([[xx[0], yy[0], zz[0]], [xx[1], yy[1], zz[1]], [xx[2], yy[2], zz[2]]], t); };

  // build the eyes' moving parts for this frame. f.eyes: [{ side, R, P, drive: {id: 0..1} }]
  // The muscles' shapes come from model.js (eyeMuscles), where the tests check that no two share space.
  function build(f) {
    let k = 0;
    for (const e of f.eyes) {
      const ctr = eyeCenter(e.side), bodies = eyeMuscles(e.R, e.side, ctr);
      for (const m of MUSCLES) {
        const b = bodies[m.id], T = tubes[k++], tag = e.pick === m.id ? -1 : e.drive[m.id], end = b.rings[NS - 1].s;
        // for the shader: mm from the insertion, how hard the muscle is driven (or -1 for the one picked), tendon length
        for (let i = 0; i < NS; i++) for (let j = 0; j <= NA; j++) { const q = (i * (NA + 1) + j) * 3; T.tt[q] = end - b.rings[i].s; T.tt[q + 1] = tag; T.tt[q + 2] = m.tendon; }
        T.b.setPos(b.pos); T.b.setNor(b.nor); T.b.setTT(T.tt);
      }
      // the optic nerve: from the back of the eye, a little toward the nose, to the back of the orbit, with slack
      const mir = (p) => [e.side * p[0], p[1], p[2]], ex = rot(e.R, mir(OPTIC.exit)), nOut = norm(ex), ap = mir(OPTIC.apex);
      const P0 = add(ex, mul(nOut, -1.5)), P1 = add(ex, mul(nOut, 11)), P2 = add(ap, [e.side * 3, -1, -9]), P3 = ap;
      const bez = (s) => { const t = s / 40, a = 1 - t; return add(add(mul(P0, a * a * a), mul(P1, 3 * a * a * t)), add(mul(P2, 3 * a * t * t), mul(P3, t * t * t))).map((x, i) => x + ctr[i]); };
      const fr = (s) => cross(norm(sub(bez(Math.min(40, s + 0.5)), bez(Math.max(0, s - 0.5)))), [0, 1, 0]);
      const nerve = tube(bez, 40, fr, () => [1.8, 1.8, 0], ctr), T = tubes[k++];
      T.tt.fill(0); T.b.setPos(nerve.pos); T.b.setNor(nerve.nor); T.b.setTT(T.tt);
    }
  }

  // draw: cam { vp, pos }, region { x, y, w, h } in device pixels; opts.inside (the eye's own view: only the screen)
  function draw(f, cam, region, opts = {}) {
    gl.viewport(region.x, region.y, region.w, region.h);
    gl.enable(gl.SCISSOR_TEST); gl.scissor(region.x, region.y, region.w, region.h);
    gl.clearColor(0.02, 0.027, 0.055, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(P.p);
    gl.uniform3fv(u.uCam, cam.pos); gl.uniform1f(u.uAlpha, 1); gl.uniform1f(u.uPupil, f.pupil);
    gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.uniformMatrix4fv(u.uVP, false, ident); gl.uniformMatrix4fv(u.uM, false, ident); gl.uniform1i(u.uKind, 7); back.draw();
    gl.depthMask(true);
    gl.uniformMatrix4fv(u.uVP, false, cam.vp);
    const one = (mesh, kind, M = ident, col = [1, 1, 1]) => { gl.uniform1i(u.uKind, kind); gl.uniformMatrix4fv(u.uM, false, M); gl.uniform3fv(u.uCol, col); mesh.draw(); };
    gl.disable(gl.CULL_FACE);
    one(bezel, 0, ident, [0.075, 0.08, 0.095]);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[opts.inside ? 0 : 1]); gl.uniform1i(u.uTex, 0);
    one(screen, 2);
    if (!opts.inside) {
      for (const e of f.eyes) {
        const M = place(e.R, eyeCenter(e.side));
        one(sclera, 1, M); one(iris, 3, M);
      }
      gl.uniform3fv(u.uCol, [0.93, 0.86, 0.66]); gl.uniformMatrix4fv(u.uM, false, ident);
      tubes.slice(0, f.eyes.length * (MUSCLES.length + 1)).forEach((T, i) => { gl.uniform1i(u.uKind, i % (MUSCLES.length + 1) === MUSCLES.length ? 0 : 5); T.b.draw(); });
      for (const e of f.eyes) {
        const ctr = eyeCenter(e.side), mir = (p) => [e.side * p[0], p[1], p[2]];
        const so = MUSCLES.find((m) => m.id === 'so');
        one(loop, 0, facing([e.side * 0.2, 0.3, -1], add(ctr, mir(so.troch))), [0.9, 0.88, 0.8]);
      }
      // the clear corneas and the lines of sight, see-through, last
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      for (const e of f.eyes) one(cornea, 4, place(e.R, eyeCenter(e.side)));
      if (f.beams) {
        const pts = [], tt = [];
        for (const e of f.eyes) {
          const a = add(eyeCenter(e.side), rot(e.R, [0, 0, -12.8])), b = f.P, d = norm(sub(b, a)), side = norm(cross(d, norm(sub(cam.pos, a)))), w = f.beamW;
          for (const [p, x] of [[a, 0], [b, 1]]) { pts.push(...add(p, mul(side, -w)), ...add(p, mul(side, w))); tt.push(x, 0, 0, x, 1, 0); }
        }
        beam.setPos(new Float32Array(pts)); beam.setTT(new Float32Array(tt)); beam.setNor(new Float32Array(pts.length));
        gl.blendFunc(gl.ONE, gl.ONE); gl.uniform1i(u.uKind, 6); gl.uniform3fv(u.uCol, [0.5, 0.84, 1.0]); gl.uniform1f(u.uAlpha, f.beams); gl.uniformMatrix4fv(u.uM, false, ident); beam.draw();
      }
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
    gl.disable(gl.SCISSOR_TEST);
  }
  return { build, draw, paint, upload: (i) => upload(tex[i]) };
}

// a camera: from a point, looking at another, with the field of view (vertical, radians) and the region's shape
export function camera(pos, at, up, fov, aspect, near = 2, far = 5000) {
  return { pos, vp: mul4(perspective(fov, aspect, near, far), lookAt(pos, at, up)) };
}
