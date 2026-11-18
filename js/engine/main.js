// Engine: the controller. Two numbers drive the page: the zoom (0 = car ... 4 = molecules) and the crank
// angle of the cylinder we follow (0 to 720 degrees, one cycle). Time runs slower the further in the zoom is.
// The picture is redrawn only when something changes.
import * as M from './model.js?v=095c6225';
import { makeGroup, place, centre, tiles, copies, LAYERS, MAX_COPIES, MAX_ATOMS } from './mol.js?v=095c6225';
import { WORLD_FS, FULL_VS, BLIT_FS, BALL_VS, BALL_FS } from './shaders.js?v=095c6225';
import { gamepad } from '../gamepad/gamepad.js';

const { clamp, smooth, mix, wrap } = M;
const $ = (id) => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const cv = $('view'), gl = cv.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
const EO = [1.30, 0.36, 0];                                  // where the engine's crankshaft middle is in the car, m
const e2w = (e) => [EO[0] - e[0], e[1] + EO[1], -e[2]];      // from the engine's own frame to the car's
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

// ---- the five scales: what must fit in the free part of the screen (metres), where the camera looks and from where
const FLAME_DIR = [1.0, 0.08, 0.15];        // nearly along the crankshaft, so that the spark plug shows between the two valves
const STOPS = [
  { id: 'car', name: 'Car', w: 5.7, h: 2.1, at: [0.08, 0.68, 0], dir: [-0.10, 0.13, 1] },
  { id: 'engine', name: 'Engine', w: 0.74, h: 0.96, at: e2w([-0.01, 0.235, 0]), dir: [0.34, 0.30, 1] },
  { id: 'cylinder', name: 'Cylinder', w: 0.27, h: 0.30, at: e2w([M.X4 - 0.012, 0.243, 0.012]), dir: [0.80, 0.34, 0.52] },
  { id: 'flame', name: 'Flame', w: 0.058, h: 0.042, at: e2w([M.GAS_CUT, M.DECK + 0.008, 0.0]), dir: FLAME_DIR },
  { id: 'molecules', name: 'Molecules', w: 8.6e-9, h: 5.6e-9, at: e2w(M.SPOT), dir: FLAME_DIR },
];
const LAST = STOPS.length - 1;
const TAN = Math.tan(13.5 * Math.PI / 180), BALL_TAN = Math.tan(5.5 * Math.PI / 180);
const NEAREST = 1.0e-3;                 // the world picture stops magnifying when the view is 1 mm tall: nothing in it is smaller
const SLOW = [[0, 1], [0.04, 1], [0.15, 60], [1, 60], [2, 600], [3, 6000], [3.5, 6000], [4, 60000]];   // how many times slower than real, by zoom
const slowAt = (z) => { for (let i = 1; i < SLOW.length; i++) if (z <= SLOW[i][0]) { const [a, sa] = SLOW[i - 1], [b, sb] = SLOW[i]; return Math.exp(mix(Math.log(sa), Math.log(sb), (z - a) / (b - a))); } return SLOW[SLOW.length - 1][1]; };
const BURN_LOOP = [325, 402], SPOT_LOOP = [M.SPOT_BURNS - 4, M.SPOT_BURNS + 8];
const loopAt = (z) => (z > 3.5 ? SPOT_LOOP : z > 2.5 ? BURN_LOOP : null);
const HOLD = 450;                       // ms after the zoom last moved before time runs again

const st = { z: 0, phi: 95, play: false };
let tau = 0, road = 0, phiSet = false;                  // the molecules' own clock; how far the road has gone by, m
let W = 1, H = 1, free = { x: 0, y: 0, w: 1, h: 1 }, wide = true;
let scale = 0.6, fixedScale = 0, sharp = false, idleAt = 0;      // how much smaller than the screen the world is drawn
let raf = 0, last = 0, dirty = true, broken = false, fly = null, zoomAt = -1e9, zNew = false, slowFrames = 0, fastFrames = 0;
const view = { cam: [0, 0, 0], fw: [0, 0, 1], rt: [1, 0, 0], up: [0, 1, 0], h: 1, hw: 1, k: 1, cx: 0, cy: 0 };

// ---- drawing ---------------------------------------------------------------------------------------
let world = null, blit = null, balls = null, fbo = null, tex = null, texW = 0, texH = 0, ballBuf = null, ballVao = null;
const ballData = new Float32Array((MAX_ATOMS + 14000) * 8), group = makeGroup();
function program(vs, fs) {
  const p = gl.createProgram();
  for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}
function start() {
  if (!gl) throw new Error('This browser does not offer WebGL 2.');
  world = program(FULL_VS, WORLD_FS); blit = program(FULL_VS, BLIT_FS); balls = program(BALL_VS, BALL_FS);
  tex = gl.createTexture(); fbo = gl.createFramebuffer();
  ballVao = gl.createVertexArray(); gl.bindVertexArray(ballVao);
  ballBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ballBuf); gl.bufferData(gl.ARRAY_BUFFER, ballData.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(0, 1);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(1, 1);
  gl.bindVertexArray(null);
}
try { start(); } catch (e) { console.error(e); broken = true; $('oops').hidden = false; $('oopsText').textContent = 'The 3D picture could not start on this device.'; }

// The size of the view against the slider: ln(height of the view in metres), straight between the stops.
function viewHeight(z) {
  const need = (s) => Math.max(s.h, s.w * free.h / free.w) * H / free.h;
  const i = Math.min(LAST - 1, Math.floor(z)), f = z - i;
  return Math.exp(mix(Math.log(need(STOPS[i])), Math.log(need(STOPS[i + 1])), f));
}
function aim(z) {
  const i = Math.min(LAST - 1, Math.floor(z)), f = z - i, s = i === LAST - 1 ? smooth(0, 0.3, f) : smooth(0, 1, f);
  const at = lerp3(STOPS[i].at, STOPS[i + 1].at, s), dir = unit(lerp3(unit(STOPS[i].dir), unit(STOPS[i + 1].dir), s));
  const h = viewHeight(z), hw = Math.max(h, NEAREST), d = hw / (2 * TAN);
  view.h = h; view.hw = hw; view.k = H / h;
  view.cam = [at[0] + dir[0] * d, at[1] + dir[1] * d, at[2] + dir[2] * d];
  view.fw = [-dir[0], -dir[1], -dir[2]]; view.rt = unit(cross(view.fw, [0, 1, 0])); view.up = cross(view.rt, view.fw);
  view.cx = (free.x + free.w / 2) / W * 2 - 1; view.cy = 1 - (free.y + free.h / 2) / H * 2;
}
// Where a point of the world falls on the screen, in CSS pixels (null behind the camera).
function project(p) {
  const v = sub(p, view.cam), d = dot(v, view.fw); if (d <= 1e-9) return null;
  const k = view.hw / view.h;      // past the nearest view the picture is only magnified
  return [((dot(v, view.rt) / (d * TAN) * (H / W)) * k + view.cx + 1) / 2 * W, (1 - (dot(v, view.up) / (d * TAN) * k + view.cy)) / 2 * H];
}
// How far each cut piece has faded away, 0 to 1: the hood and near fender, the near half of the block, the end slice.
const cuts = (z) => ({ car: smooth(0.15, 0.7, z), lift: smooth(0.7, 0.98, z), end: smooth(1.2, 1.75, z) });

function sizeTarget() {
  const dpr = Math.min(devicePixelRatio || 1, 2), s = fixedScale || (sharp ? 1 : scale);
  const w = Math.max(2, Math.round(W * dpr * s)), h = Math.max(2, Math.round(H * dpr * s));
  if (w !== texW || h !== texH) {
    texW = w; texH = h;
    gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  }
}
const SUN = unit([0.42, 0.66, 0.62]);
const hash = (a, b, c, d) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647 + d * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// The dots that stand for gas, at sizes between the ones drawn in the cylinder and the molecules: each size a hundredth,
// then a tenth, of the last. They are always there; they are drawn once they are big enough to see.
const DOT_R = [85e3, 8.5e3, 850, 85, 8.5, 0.85];         // nm
// A size of dot is drawn while it is between a few pixels and a fair part of the screen across; the next size takes over from it.
const dotShow = (rpx, rmin) => smooth(rmin, rmin * 2.2, rpx) * (1 - smooth(28, 70, rpx));
// The part of the picture the gas must fill, in nm from the spot looked at: the free part of the screen and a little under the panel's edge.
function gasBox(pxPerNm, hNm) {
  const cx = free.x + free.w / 2, cy = free.y + free.h / 2, pad = 48;
  return { x0: -Math.min(cx, free.w / 2 + pad) / pxPerNm, x1: Math.min(W - cx, free.w / 2 + pad) / pxPerNm, y0: -Math.min(H - cy, free.h / 2 + pad) / pxPerNm, y1: Math.min(cy, free.h / 2 + pad) / pxPerNm, dist: hNm / (2 * BALL_TAN) };
}
// How fully the molecules are drawn, 0 to 1. They come into view once their atoms are big enough to see, and never as
// a patch: only when copies of the group can fill the whole view. The smallest dots give way to them at the same rate.
const MOL_BUDGET = 200;
function molShow(box, pxPerNm) {
  const L = M.groupEdge(st.phi), f = 1 + 1.5 * L / box.dist, need = ((box.x1 - box.x0) * f / L + 1) * ((box.y1 - box.y0) * f / L + 1) * LAYERS;
  return smooth(9, 20, pxPerNm) * (1 - smooth(0.55 * MOL_BUDGET, MOL_BUDGET, need));
}
function gasDots(n, box, pxPerNm, mols) {
  const g = M.gasAt(st.phi), stale = g.burn > 0.5 || wrap(st.phi) >= M.SPARK + 60 || wrap(st.phi) < 8;
  const rmin = Math.max(3, Math.sqrt(W * H * 3 / 8000) / 6.6), hotGas = g.burn > 0.5 && M.tempBurned(st.phi) > 1500;
  DOT_R.forEach((r, lv) => {
    const rpx = r * pxPerNm, show = lv === DOT_R.length - 1 ? smooth(rmin, rmin * 2.2, rpx) * (1 - mols) : dotShow(rpx, rmin); if (show <= 0) return;
    const cell = r * 6.6, x0 = Math.floor((box.x0 * 1.05 - r) / cell), x1 = Math.floor((box.x1 * 1.05 + r) / cell), y0 = Math.floor((box.y0 * 1.05 - r) / cell), y1 = Math.floor((box.y1 * 1.05 + r) / cell);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) * 3 > 11000) return;
    for (let k = 0; k < 3; k++) for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
      const o = n * 8, fuel = !stale && g.fuel && hash(i, j, k, lv + 40) < 1 / 15, c = stale ? (hotGas ? [1.0, 0.54, 0.16] : [0.56, 0.47, 0.40]) : fuel ? [0.30, 0.95, 0.42] : [0.36, 0.64, 1.0];
      ballData[o] = (i + 0.5 + 0.56 * (hash(i, j, k, lv) - 0.5)) * cell; ballData[o + 1] = (j + 0.5 + 0.56 * (hash(i, j, k, lv + 10) - 0.5)) * cell; ballData[o + 2] = (k + 0.5 + 0.56 * (hash(i, j, k, lv + 20) - 0.5)) * cell;
      ballData[o + 3] = r; ballData[o + 4] = c[0]; ballData[o + 5] = c[1]; ballData[o + 6] = c[2]; ballData[o + 7] = (stale ? 0.5 : fuel ? 0.9 : 0.6) * show; n++;
    }
  });
  return n;
}
const drawn = { z: -1, phi: -1 };        // what the picture on the screen shows
function draw() {
  aim(st.z); sizeTarget(); drawn.z = st.z; drawn.phi = st.phi;
  const c = cuts(st.z), u = world.u;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, texW, texH); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
  gl.useProgram(world.p);
  gl.uniform2f(u.uRes, texW, texH); gl.uniform2f(u.uCenter, view.cx, view.cy);
  gl.uniform3fv(u.uCam, view.cam); gl.uniform3fv(u.uRt, view.rt); gl.uniform3fv(u.uUp, view.up); gl.uniform3fv(u.uFw, view.fw); gl.uniform3fv(u.uSun, SUN);
  gl.uniform1f(u.uTan, TAN); gl.uniform1f(u.uPhi, wrap(st.phi + 360));
  gl.uniform1f(u.uCutCar, c.car); gl.uniform1f(u.uCutLift, c.lift); gl.uniform1f(u.uCutEnd, c.end);
  gl.uniform1f(u.uGas, st.z < 0.3 ? 0 : st.z < 0.8 ? 1 : 2); gl.uniform1f(u.uGasStep, clamp(view.hw / 420, 0.00028, 0.003)); gl.uniform1f(u.uRoad, road % 900); gl.uniform1f(u.uGasCut, mix(M.XC, M.GAS_CUT, smooth(2.3, 2.85, st.z)));
  gl.uniform1f(u.uDots, 1 - smooth(28, 70, 0.85e-3 * view.k));      // the cylinder's dots, 0.85 mm in radius, give way to the smaller sizes
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  // onto the screen, magnified once the zoom has passed the nearest view the world is drawn at
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cv.width, cv.height);
  gl.useProgram(blit.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(blit.u.uT, 0);
  const k = view.h / view.hw;      // 1, or less when magnifying about the spot looked at
  gl.uniform2f(blit.u.uRes, cv.width, cv.height); gl.uniform4f(blit.u.uZoom, (view.cx + 1) / 2, (view.cy + 1) / 2, k, 0.96 * smooth(3.3, 3.75, st.z));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  // balls: the finer dots, then the molecules
  if (view.h < 0.02) {
    const hNm = view.h * 1e9, pxPerNm = H / hNm, box = gasBox(pxPerNm, hNm);
    let mols = molShow(box, pxPerNm); if (mols > 0 && copies(tiles(box, M.groupEdge(st.phi))) > MAX_COPIES) mols = 0;
    let n = gasDots(0, box, pxPerNm, mols);      // the dots first: the molecules are drawn over them
    if (mols > 0) n = place(group, st.phi, tau, ballData, box, mols, n);
    if (n) {
      gl.useProgram(balls.p); gl.bindVertexArray(ballVao); gl.bindBuffer(gl.ARRAY_BUFFER, ballBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, ballData, 0, n * 8);
      const dist = hNm / (2 * BALL_TAN);
      gl.uniform2f(balls.u.uRes, cv.width, cv.height); gl.uniform2f(balls.u.uCenter, view.cx, view.cy); gl.uniform1f(balls.u.uTan, BALL_TAN); gl.uniform1f(balls.u.uDist, dist); gl.uniform1f(balls.u.uFog, Math.max(hNm * 1.1, 6));
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
      gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.bindVertexArray(null);
    }
  }
}

// ---- labels on the picture ---------------------------------------------------------------------------
// Each has the range of zoom it shows in, a point of the model (engine frame unless `world`), and how far from
// that point its text sits, as fractions of the free height. Each term is explained in the small line under it.
const top4 = () => M.pistonTop(st.phi), burning = () => { const p = wrap(st.phi); return p > M.SPARK + 4 && p < M.FLAME_OUT - 2; };
const LABELS = [
  { z: [0.42, 0.78], text: 'Engine', sub: 'four cylinders in a row', at: () => [0.02, 0.385, 0], d: [-0.10, -0.17] },
  { z: [0.86, 1.45], text: 'Camshaft', sub: 'its bumps open the valves that let gas in and out', at: () => [0.11, 0.3415 + 0.013, -0.0577], d: [-0.10, -0.115] },
  { z: [0.86, 1.45], text: 'Piston', sub: 'slides up and down in its cylinder', at: () => [M.X4, top4() - 0.02, -0.04], d: [0.15, -0.10] },
  { z: [0.86, 1.45], text: 'Connecting rod', sub: 'joins the piston to the crankshaft', at: () => [M.X4, M.pinY(st.phi) * 0.55, -0.011], d: [0.17, -0.03] },
  { z: [0.86, 1.45], text: 'Crankshaft', sub: 'turned by the rods', at: () => [-0.249, 0, -0.03], d: [0.10, 0.13] },
  { z: [0.86, 1.45], text: 'Timing belt', sub: 'crankshaft turns camshafts, 2 turns to 1', at: () => [0.246, 0.16, -0.071], d: [-0.10, 0.10], side: 'r', wideOnly: true },
  ...[1, 2, 3, 4].map((n) => ({ z: [0.86, 1.45], text: String(n), num: true, at: () => [0.144 - 0.096 * (n - 1), M.DECK - 0.012, -0.081], d: [0, 0] })),
  { z: [1.6, 2.55], text: 'Intake valve', sub: 'lets air in', at: () => { const l = M.liftIn(st.phi); return [M.XC, M.DECK + 0.03 - l * 0.95, 0.029 - l * 0.33]; }, d: [0.15, 0.10] },
  { z: [1.6, 2.55], text: 'Exhaust valve', sub: 'lets burned gas out', at: () => { const l = M.liftEx(st.phi); return [M.XC, M.DECK + 0.03 - l * 0.95, -0.029 + l * 0.33]; }, d: [-0.20, 0.06], side: 'r' },
  { z: [1.6, 2.55], text: 'Spark plug', sub: 'lights the mixture', at: () => [M.X4 - 0.005, M.DECK + 0.085, 0], d: [0.10, -0.24] },
  { z: [1.6, 2.55], text: 'Fuel injector', sub: 'sprays gasoline into the cylinder', at: () => [M.X4 - 0.016, M.DECK + 0.034, 0.110], d: [0.05, 0.20] },
  { z: [1.6, 2.55], text: 'Camshaft', sub: 'its bump pushes the valve open', at: () => [M.XC + 0.03, 0.3415 + 0.014, -0.0577], d: [-0.02, -0.10], wideOnly: true },
  { z: [1.6, 2.55], text: 'Piston', at: () => [M.X4 - 0.03, top4() - 0.018, -0.028], d: [0.21, 0.10] },
  { z: [2.7, 3.12], text: 'Spark plug', sub: 'its spark lights the mixture', at: () => [M.X4 - 0.003, M.DECK + 0.0165, 0], d: [0.10, -0.24] },
  { z: [2.7, 3.12], text: 'Flame front', sub: 'the thin layer that is burning', show: () => burning() && M.flameR(st.phi) > 0.005,
    at: () => { const s = Math.min(M.flameR(st.phi), 0.024); return [M.GAS_CUT, M.DECK + 0.003, s]; }, d: [0.12, 0.22] },
  { z: [2.7, 3.12], text: 'Burned gas', show: () => wrap(st.phi) > M.SPARK + 8 && wrap(st.phi) < 560, at: () => [M.GAS_CUT, M.DECK + 0.004, -0.5 * Math.min(M.flameR(st.phi), 0.02)], d: [-0.14, 0.22], side: 'r' },
];
const NS = 'http://www.w3.org/2000/svg';
for (const L of LABELS) {
  L.el = document.createElement('div'); L.el.className = 'tag' + (L.num ? ' num' : '') + (L.side === 'r' ? ' r' : ''); L.el.append(L.text);
  if (L.sub) { const s = document.createElement('small'); s.textContent = L.sub; L.el.append(s); }
  L.el.style.display = 'none'; $('labels').append(L.el);
  if (!L.num) { L.line = document.createElementNS(NS, 'line'); L.dot = document.createElementNS(NS, 'circle'); L.dot.setAttribute('r', 3); $('leaders').append(L.line, L.dot); L.line.style.display = L.dot.style.display = 'none'; }
}
// labels on single molecules at the Molecules scale
const MOL_LABELS = [
  { text: 'Fuel', sub: 'iso-octane: 8 carbon, 18 hydrogen atoms', pick: group.fuel, when: (x) => x < 0.3 && M.gasAt(st.phi).fuel && wrap(st.phi) > M.INJECT[1] + 25, d: [0.10, -0.20] },
  { text: 'Oxygen', sub: 'two oxygen atoms', pick: group.o2, when: (x) => x < 0.02, d: [-0.08, 0.15], side: 'r' },
  { text: 'Nitrogen', sub: 'two nitrogen atoms; most of the air', pick: group.n2, when: () => true, d: [0.10, 0.17] },
  { text: 'Carbon dioxide', sub: 'one carbon, two oxygen atoms', pick: group.co2, when: (x) => x > 0.98, d: [-0.08, -0.16], side: 'r' },
  { text: 'Water', sub: 'one oxygen, two hydrogen atoms; a hot vapor', pick: group.h2o, when: (x) => x > 0.98, d: [0.08, -0.15] },
];
for (const L of MOL_LABELS) {
  L.el = document.createElement('div'); L.el.className = 'tag' + (L.side === 'r' ? ' r' : ''); L.el.append(L.text);
  const s = document.createElement('small'); s.textContent = L.sub; L.el.append(s); L.el.style.display = 'none'; $('labels').append(L.el);
  L.line = document.createElementNS(NS, 'line'); L.dot = document.createElementNS(NS, 'circle'); L.dot.setAttribute('r', 3); $('leaders').append(L.line, L.dot); L.line.style.display = L.dot.style.display = 'none';
}
let placed = [];
function putLabel(L, pt, op) {
  const on = !!pt && op > 0.02 && pt[0] > free.x + 8 && pt[0] < free.x + free.w - 8 && pt[1] > free.y + 8 && pt[1] < free.y + free.h - 8;
  const disp = on ? '' : 'none';
  if (L.el.style.display !== disp) { L.el.style.display = disp; if (L.line) L.line.style.display = L.dot.style.display = disp; }
  if (!on) return;
  if (!L.w) { L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
  const f = free.h * (wide ? 1 : 0.8), tx = clamp(pt[0] + L.d[0] * f, free.x + (L.side === 'r' ? L.w + 6 : 6), free.x + free.w - (L.side === 'r' ? 6 : L.w + 6)), ty0 = clamp(pt[1] + L.d[1] * f, free.y + L.h / 2 + (tx + (L.side === 'r' ? 0 : L.w) > W - 150 ? 50 : 6),      // clear of the scale bar in the corner
    free.y + free.h - L.h / 2 - 6);
  let ty = ty0;
  if (!L.num) {      // keep clear of the labels already placed: step down past them, or up if there is no room below
    const x0 = L.side === 'r' ? tx - L.w : tx, hit = (y) => placed.find((r) => x0 < r[2] + 6 && x0 + L.w > r[0] - 6 && y - L.h / 2 < r[3] + 3 && y + L.h / 2 > r[1] - 3);
    for (let i = 0, r; i < 6 && (r = hit(ty)); i++) ty = r[3] + L.h / 2 + 4;
    if (ty > free.y + free.h - 20) { ty = ty0; for (let i = 0, r; i < 6 && (r = hit(ty)); i++) ty = r[1] - L.h / 2 - 4; }
    placed.push([x0, ty - L.h / 2, x0 + L.w, ty + L.h / 2]);
  }
  L.el.style.opacity = op.toFixed(2);
  L.el.style.transform = L.num ? `translate(${pt[0].toFixed(1)}px,${pt[1].toFixed(1)}px) translate(-50%,-50%)` : `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) translate(${L.side === 'r' ? '-100%' : '0'},-50%)`;
  if (L.line) {
    for (const [k, v] of [['x1', pt[0]], ['y1', pt[1]], ['x2', tx + (L.side === 'r' ? 5 : -5)], ['y2', ty]]) L.line.setAttribute(k, v.toFixed(1));
    L.dot.setAttribute('cx', pt[0].toFixed(1)); L.dot.setAttribute('cy', pt[1].toFixed(1)); L.line.style.opacity = L.dot.style.opacity = op.toFixed(2);
  }
}
function labels() {
  const z = st.z; placed = [];
  for (const L of LABELS) {
    const op = (wide || !L.wideOnly) && (!L.show || L.show()) ? smooth(L.z[0], L.z[0] + 0.1, z) * (1 - smooth(L.z[1] - 0.1, L.z[1], z)) : 0;
    putLabel(L, op > 0.02 ? project(L.world ? L.at() : e2w(L.at())) : null, op);
  }
  // molecules: the one of each kind nearest the middle of the view, so that the label stays on a molecule in view
  const op = smooth(3.93, 3.99, z), hNm = view.h * 1e9, x = M.gasAt(st.phi).burn, Lg = M.groupEdge(st.phi);
  for (const L of MOL_LABELS) {
    let pt = null;
    if (op > 0.02 && L.when(x)) {
      let best = null, bd = 1e9;
      const dist = hNm / (2 * BALL_TAN);      // the one in view that is nearest the middle and nearest the eye; the one already labeled is kept while it stays
      for (const m of L.pick) {
        const c = centre(m, st.phi, tau, Lg), zc = c[2] + dist; if (Math.abs(c[2]) > hNm || zc <= 0) continue;
        const q = [((c[0] / (zc * BALL_TAN) * (H / W)) + view.cx + 1) / 2 * W, (1 - (c[1] / (zc * BALL_TAN) + view.cy)) / 2 * H];
        if (q[0] < free.x + 30 || q[0] > free.x + free.w - 30 || q[1] < free.y + 30 || q[1] > free.y + free.h - 30) continue;
        const d = Math.hypot(q[0] - free.x - free.w / 2, q[1] - free.y - free.h / 2) / free.h + c[2] / hNm * 0.6 + (L.cur === m ? -0.25 : 0);
        if (d < bd) { bd = d; best = q; L.next = m; }
      }
      if (best) { L.cur = L.next; pt = best; }
    }
    putLabel(L, pt, op);
  }
}

// ---- the panel -----------------------------------------------------------------------------------
const shown = {};
const set = (id, text) => { if (shown[id] !== text) { shown[id] = text; $(id).textContent = text; } };
const num = (v) => Math.round(v).toLocaleString('en-US');
const fmtLen = (m) => (m >= 1 ? `${+m.toPrecision(1)} m` : m >= 0.01 ? `${+(m * 100).toPrecision(1)} cm` : m >= 1e-3 ? `${+(m * 1e3).toPrecision(1)} mm` : m >= 1e-6 ? `${+(m * 1e6).toPrecision(1)} µm` : `${+(m * 1e9).toPrecision(1)} nm`);
function scaleBar() {
  const want = 96 / view.k, e = Math.pow(10, Math.floor(Math.log10(want))), n = want / e >= 5 ? 5 : want / e >= 2 ? 2 : 1, len = n * e, text = fmtLen(len);
  $('scaleBar').style.width = (len * view.k).toFixed(1) + 'px'; set('scaleText', text);
  return text;
}
const PEAK_ATM = M.PEAK.p / M.ATM, AFTER_TOP = Math.round(M.PEAK.phi - 360), BURN_MS = (M.FLAME_OUT - M.SPARK) / M.DEG_PER_S * 1000, FRONT_SPEED = 0.047 / (BURN_MS / 1000);
const CAP = {
  car: () => ['Sixty miles an hour', `At ${M.MPH} mph in top gear this engine's main shaft, the crankshaft, turns ${num(M.RPM)} times a minute: ${M.RPM / 60} times a second. Slide Zoom to go under the hood. Time slows as you go in, so that each step can be seen.`],
  engine: () => ['Four pistons, one shaft', 'Each burn of fuel pushes one piston down its cylinder. A connecting rod turns that push into rotation of the crankshaft. One trip of a piston down or up is a stroke, and only every fourth stroke is a burn: the power stroke. The four cylinders burn in the order 1, 3, 4, 2, half a turn apart, so one of them is always on its power stroke. A cylinder glows from its spark until its burned gas has cooled. The belt turns the two camshafts once for every two turns of the crankshaft.'],
  cylinder: (s) => [
    ['Intake: air and fuel come in', 'The piston goes down and the intake valve is open, so air flows in past it. The injector sprays gasoline straight into the cylinder, where it mixes with the air: about 15 parts of air to 1 of fuel, by mass.'],
    ['Compression: the mixture is squeezed', `The intake valve closes shortly after the piston starts back up; then both valves are shut. The piston squeezes the air and fuel into about a tenth of the volume. Squeezing heats the mixture and crowds its molecules together. A spark lights it when the crankshaft still has ${360 - M.SPARK}° to turn before the piston reaches the top.`],
    ['Power: the burned gas pushes the piston', `Burning makes the gas very hot, so its pressure rises to ${num(PEAK_ATM)} times that of the outside air just after the top. That pressure pushes the piston down, and the connecting rod turns the crankshaft. This is the only stroke in which the gas drives the piston. The exhaust valve starts to open ${540 - M.EVO}° before the bottom.`],
    ['Exhaust: the burned gas leaves', 'The exhaust valve is open. The piston comes up and pushes the burned gas out; then the cycle starts again. In the intake, compression and exhaust strokes it is the crankshaft that moves the piston, kept turning by the other cylinders and by a heavy flywheel on its end (not drawn).'],
  ][s],
  flame: (s, p) => (p >= 400 && p < 540 ? ['The burned gas expands', 'All of the mixture has burned. The hot gas pushes the piston down, and cools as it spreads into the growing volume.']
    : p < M.SPARK || p >= 540
    ? ['Between burns', `The spark plug makes a spark across its gap ${360 - M.SPARK}° of crankshaft before the piston reaches the top. Press Play to watch the burn, or drag the cycle slider to the end of Compression.`]
    : p < M.FLAME_OUT
      ? ['The burn spreads from the spark', `The spark lights the mixture next to the plug. The thin layer that is burning, the flame front, moves outward at about ${num(FRONT_SPEED)} m/s and crosses the cylinder in about ${Math.round(BURN_MS)} thousandths of a second. The spark comes before the top so that the pressure peaks just after it.`]
      : ['The front reaches the walls', `The flame front has crossed the cylinder; the last of the mixture, next to the walls, is still burning. The pressure peaks ${AFTER_TOP}° after the top, at ${num(PEAK_ATM)} times that of the outside air.`]),
  molecules: (s, p) => {
    const g = M.gasAt(p);
    if (g.burn > 0 && g.burn < 1) return ['Burning', 'The flame front is passing this spot. The fuel\'s carbon and hydrogen atoms leave it and bond to oxygen atoms instead. Breaking the old bonds takes energy; the new bonds to oxygen release more. The difference ends up as faster motion of all the molecules: heat. Atoms are drawn going straight to their new partners; the real route runs through many short-lived fragments.'];
    if (g.burn >= 1 && p >= 400 && p < 560) return ['Expanding and cooling', 'The burned gas pushes the piston down. As it spreads into the growing volume its molecules move apart and slow down: the gas cools and its pressure falls.'];
    if (g.burn >= 1 && p < 560) return ['Carbon dioxide and water', 'Every carbon atom is now in a carbon dioxide molecule and every pair of hydrogen atoms in a water molecule. Nearly all the nitrogen is unchanged. The molecules now move nearly twice as fast and have spread apart, squeezing the mixture that has not burned yet. Once all of it has burned, the molecules throughout the cylinder strike the piston harder and more often than before: that is the pressure that pushes it down.'];
    if (g.burn >= 1 || p < 30) return ['Burned gas leaves, fresh air arrives', 'The burned gas has spread out and cooled, and is pushed out past the exhaust valve. Fresh air follows through the intake valve.'];
    if (!g.fuel || p < M.INJECT[1] + 25) return ['Air', `Air is mostly nitrogen molecules, each two nitrogen atoms, and one part in five oxygen molecules, each two oxygen atoms. At intake pressure they are about ${Math.cbrt(1 / g.perNm3).toFixed(1)} nm apart, so only a few are in view. Fuel reaches this spot a little after the injector starts to spray.`];
    if (p <= M.IVC) return ['Fuel and air, mixed', 'One fuel molecule for every 12 or 13 oxygen molecules and 47 nitrogen molecules: exactly enough oxygen to burn it. The gasoline has evaporated, so its molecules are spread singly among the air\'s.'];
    return ['Fuel and air, squeezed together', 'One fuel molecule for every 12 or 13 oxygen molecules and 47 nitrogen molecules: exactly enough oxygen to burn it. As the piston rises the same molecules are crowded into less room, and they move faster: the gas is hotter and its pressure higher.'];
  },
};
const NOTE = {
  car: '',
  engine: 'The near half of the block and its cover are left out to show the pistons. Not drawn: oil, coolant, the throttle, the gearbox and the exhaust system. The engine is drawn set lengthwise with its belt end toward the driver; in a car that end faces the front, or the side when the engine is set crosswise, as in most cars.',
  cylinder: 'The end of the engine is cut off and left out. Dots stand for gas: far fewer and far larger than molecules, and in the picture\'s own colors, since air and gasoline vapor are colorless. The tan layer of dots on the piston is burned gas left over from the last cycle; really it mixes through the fresh air. One dot in 15 is drawn as fuel, its share of the mixture by mass; by count fuel is 1 molecule in 60.',
  flame: 'Burned gas is drawn glowing orange so that it can be told apart. A real gasoline flame gives off only faint light, at short visible wavelengths, which we see as blue.',
  molecules: 'Atoms are drawn in the usual model colors, at their real spacing for this pressure and temperature, each atom a little smaller than its real size so that the molecules\' shapes can be seen. Real molecules fly in straight lines between collisions; here each drifts about one place so that it stays in view. Iso-octane stands for the many hydrocarbons in gasoline. The burn of this group is stretched out so that it can be followed: a real flame front passes a spot this small in a few millionths of a second, the fuel breaks up through many short-lived pieces that are not drawn, and about 1 molecule in 100 of the burned gas is carbon monoxide or nitric oxide. Also not drawn: argon, 1 molecule in 100 of air, and the burned gas left from the last cycle, about 1 molecule in 10 before the burn. The molecules\' own motion is slowed far more than the engine\'s, or it would be a blur.',
};
const KEYS = { gas: [['#5ca3ff', 'air'], ['#4df26b', 'fuel'], ['#ff8a2a', 'burned gas, hot'], ['#8f7866', 'burned gas, cooled']], atoms: [['#3d3f45', 'carbon'], ['#ececec', 'hydrogen'], ['#e2382f', 'oxygen'], ['#3f66f0', 'nitrogen']], none: [] };
function key(which) {
  if (shown.key === which) return; shown.key = which;
  const el = $('key'); el.textContent = '';
  for (const [c, t] of KEYS[which]) { const s = document.createElement('span'), i = document.createElement('i'); i.style.setProperty('--c', c); s.append(i, t); el.append(s); }
}
// The pressure in the cylinder we follow through one cycle, with the present moment marked.
const ctx = $('chart').getContext('2d');
function chart() {
  const w = 672, h = 208, L = 44, R = 10, T = 12, B = 30, top = Math.ceil(PEAK_ATM / 5) * 5;
  const X = (phi) => L + (w - L - R) * phi / 720, Y = (atm) => h - B - (h - T - B) * atm / top;
  ctx.clearRect(0, 0, w, h);
  ctx.font = '500 20px "JetBrains Mono", ui-monospace, monospace'; ctx.textBaseline = 'middle';
  const bands = ['rgba(143,196,255,.13)', 'rgba(201,211,234,.10)', 'rgba(255,154,60,.14)', 'rgba(165,159,152,.11)'];
  for (let s = 0; s < 4; s++) { ctx.fillStyle = bands[s]; ctx.fillRect(X(s * 180), T, X(180) - X(0), h - T - B); }
  ctx.strokeStyle = 'rgba(234,240,255,.22)'; ctx.lineWidth = 1; ctx.fillStyle = '#AAB6D6'; ctx.textAlign = 'right';
  for (let a = 0; a <= top; a += top > 20 ? 10 : 5) { ctx.beginPath(); ctx.moveTo(L, Y(a)); ctx.lineTo(w - R, Y(a)); ctx.stroke(); ctx.fillText(String(a), L - 8, Y(a)); }
  ctx.textAlign = 'center'; for (let d = 0; d <= 720; d += 180) ctx.fillText(d + '°', clamp(X(d), L + 14, w - R - 26), h - B + 17);
  ctx.strokeStyle = '#EAF0FF'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.beginPath();
  for (let d = 0; d <= 720; d += 2) { const x = X(d), y = Y(M.pressure(d) / M.ATM); if (d) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  ctx.stroke();
  const p = wrap(st.phi), x = X(p), y = Y(M.pressure(p) / M.ATM);
  ctx.strokeStyle = 'rgba(234,240,255,.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, h - B); ctx.stroke();
  ctx.fillStyle = '#ffb13b'; ctx.strokeStyle = '#05070F'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 8, 0, 6.2832); ctx.fill(); ctx.stroke();
}
const slowText = (s) => (s < 1.5 ? 'Real speed' : `Slowed ${num(+s.toPrecision(s < 100 ? 1 : 2))}×`);
function sync() {
  const lvl = Math.round(st.z), stop = STOPS[lvl], p = wrap(st.phi), stroke = M.strokeOf(p), bar = scaleBar();
  const zi = $('zoom'), ci = $('cycle');
  if (Math.abs(zi.value - st.z) > 0.0015) zi.value = st.z;
  zi.style.setProperty('--v', (st.z / LAST * 100) + '%');
  zi.setAttribute('aria-valuetext', `${stop.name}, scale bar ${bar}`);
  set('zoomV', stop.name);
  const pv = Math.round(p * 2) / 2;
  if (shown.pv !== pv) { shown.pv = pv; ci.value = pv; ci.setAttribute('aria-valuetext', `${Math.round(p)} degrees, ${M.STROKES[stroke]}`); }
  for (const b of $('stops').children) b.setAttribute('aria-current', String(+b.dataset.i === lvl));
  [...$('zticks').children].forEach((t, i) => t.classList.toggle('on', i === lvl));
  [...$('strokes').children].forEach((t, i) => t.classList.toggle('on', i === stroke));
  set('slowV', slowText(slowAt(st.z)));
  const loop = loopAt(st.z), pl = st.play ? 'Pause' : lvl === 4 ? 'Play the burn of this group of molecules' : loop ? 'Play the burn' : 'Play';
  if (shown.play !== pl) { shown.play = pl; $('play').setAttribute('aria-pressed', String(st.play)); $('play').setAttribute('aria-label', pl); }

  const [title, body] = CAP[stop.id](stroke, p), capKey = stop.id + title;
  if (shown.cap !== capKey) {
    const first = shown.cap === undefined; shown.cap = capKey;
    const apply = () => { $('capTitle').textContent = title; $('capBody').textContent = body; $('capScale').textContent = stop.name; $('note').textContent = NOTE[stop.id]; $('cap').classList.remove('swap'); };
    if (first || reduced) apply(); else { $('cap').classList.add('swap'); setTimeout(() => { if (shown.cap === capKey) apply(); }, 180); }
  }
  set('capPhase', slowAt(st.z) < 1.5 ? 'real speed' : `${slowText(slowAt(st.z)).toLowerCase()} · ${M.STROKES[stroke].toLowerCase()} stroke`);
  key(st.z > 3.9 ? 'atoms' : lvl >= 2 ? 'gas' : 'none');

  const g = M.gasAt(p), T = lvl === 4 ? g.T : (M.tempMean(p) || g.T), atm = M.pressure(p) / M.ATM;
  if (lvl === 0) { set('n1k', 'road speed'); set('n1v', `${M.MPH} mph`); set('n2k', 'turns of the crankshaft a minute'); set('n2v', num(M.RPM)); set('n3k', 'burns a second in each cylinder'); set('n3v', String(M.RPM / 120)); }
  else {
    set('n1k', 'crank angle, cylinder 4'); set('n1v', `${Math.round(p)}°`);
    set('n2k', 'pressure in it, in atmospheres'); set('n2v', atm < 9.95 ? atm.toFixed(1) + ' atm' : num(atm) + ' atm');
    const K = Math.round(T / 10) * 10; set('n3k', `${lvl === 4 ? 'gas at this spot' : 'its gas, on average'}: ${num(Math.round((K * 9 / 5 - 459.67) / 10) * 10)} °F`); set('n3v', `${num(K)} K`);
  }
  set('chartCap', `Pressure in cylinder 4 through one cycle, in atmospheres (outside air is 1). Peak: ${num(PEAK_ATM)}, ${AFTER_TOP}° after the top.`);
  const ck = Math.round(p); if (shown.chart !== ck) { shown.chart = ck; chart(); }
  const n = Math.round(M.groupCount(p)), edge = M.groupEdge(p);
  set('eq', lvl === 4 ? '2 C₈H₁₈ + 25 O₂ → 16 CO₂ + 18 H₂O' : ''); $('eq').hidden = lvl !== 4;
  set('eqNow', lvl === 4 ? `This group: ${n} molecules in a cube ${edge.toFixed(0)} nm wide, with ${M.MIX.n2} nitrogen molecules that pass through unchanged.` : ''); $('eqNow').hidden = lvl !== 4;
  writeHash();
}
let hashAt = 0;
function writeHash() { const now = performance.now(); if (now - hashAt < 400) { clearTimeout(writeHash.t); writeHash.t = setTimeout(writeHash, 420); return; } hashAt = now; const h = `#z=${st.z.toFixed(3)}&a=${(Math.round(wrap(st.phi) * 2) / 2)}`; if (location.hash !== h) history.replaceState(null, '', h); }
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1)); let any = false;
  if (q.has('z') && isFinite(+q.get('z'))) { st.z = clamp(+q.get('z'), 0, LAST); any = true; }
  if (q.has('a') && isFinite(+q.get('a'))) { st.phi = wrap(+q.get('a')); any = true; }
  return any;
}

// ---- time ----------------------------------------------------------------------------------------
function measure() {
  for (const L of [...LABELS, ...MOL_LABELS]) L.w = 0;
  W = innerWidth; H = innerHeight; wide = W >= 900 || (W > H && H <= 520);
  const pr = $('panel').getBoundingClientRect();
  free = wide ? { x: pr.right + 8, y: 0, w: Math.max(80, W - pr.right - 8), h: H } : { x: 0, y: 0, w: W, h: Math.max(80, pr.top) };
  const dpr = Math.min(devicePixelRatio || 1, 2); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  touch();
}
function kick() { if (!raf) raf = requestAnimationFrame(frame); }
function frame(now) {
  raf = 0;
  if (broken) return;
  const raw = last ? (now - last) / 1000 : 0.016, dt = Math.min(0.05, raw); last = now;
  const zooming = !!fly || now - zoomAt < HOLD || zNew; zNew = false;
  const phiNew = phiSet; phiSet = false;
  if (fly && phiNew) dirty = true;      // the cycle slider was moved during a flight: the flight waits this frame
  else if (fly) {
    const goal = fly.to, d = goal - st.z, step = Math.sign(d) * Math.min(Math.abs(d), dt * Math.max(0.35, Math.abs(d) * 2.2));
    st.z += step; if (Math.abs(goal - st.z) < 1e-4) { st.z = goal; fly = null; zoomAt = now; } dirty = true;
  }
  if (st.play && !zooming) {
    const s = slowAt(st.z), loop = loopAt(st.z);
    st.phi += dt * M.DEG_PER_S / s; road += dt * M.SPEED / s; tau += dt * Math.sqrt(M.gasAt(st.phi).T / 700);
    if (loop) { if (st.phi > loop[1] || st.phi < loop[0]) st.phi = loop[0]; } else st.phi = wrap(st.phi);
    dirty = true;
  }
  // draw the world smaller when frames are slow, larger again when they are quick; when nothing moves, draw it once at full size
  const moving = dirty;
  if (moving && !fixedScale) {
    if (sharp) { sharp = false; }
    else if (raw > 0.030) { fastFrames = 0; if (++slowFrames > 2) { scale = Math.max(0.3, scale * 0.85); slowFrames = 0; } }
    else if (raw < 0.019) { slowFrames = 0; if (++fastFrames > 40) { scale = Math.min(1, scale * 1.12); fastFrames = 0; } }
    idleAt = now;
  } else if (!fixedScale && !sharp && scale < 1 && now - idleAt > 260) { sharp = true; dirty = true; }
  if (dirty) {
    dirty = false;
    try { draw(); labels(); sync(); } catch (e) { oops(e); }
  }
  if (st.play || fly || (!sharp && scale < 1 && !fixedScale)) kick(); else last = 0;
}
const touch = () => { dirty = true; kick(); };
function oops(e) { console.error(e); if (broken) return; broken = true; fly = null; st.play = false; $('oops').hidden = false; }
function zoomTo(z) {
  z = clamp(z, 0, LAST);
  if (reduced) { fly = null; st.z = z; zoomAt = performance.now(); zNew = true; } else fly = { to: z };
  touch();
}
function setZoom(z) { fly = null; zoomAt = performance.now(); zNew = true; st.z = clamp(z, 0, LAST); touch(); }
function togglePlay() {
  if (!st.play) { const loop = loopAt(st.z); if (loop && (st.phi < loop[0] || st.phi > loop[1] - 0.5)) st.phi = loop[0]; }
  st.play = !st.play; touch();
}

// ---- controls ------------------------------------------------------------------------------------
STOPS.forEach((s, i) => {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = s.name; b.dataset.i = i; b.style.left = (i / LAST * 100) + '%'; b.addEventListener('click', () => zoomTo(i)); $('stops').append(b);
  const t = document.createElement('i'); t.style.left = (i / LAST * 100) + '%'; $('zticks').append(t);
});
M.STROKES.forEach((s) => { const t = document.createElement('span'); t.textContent = s; $('strokes').append(t); });
// A press on the Zoom line away from its knob glides there, as a press on a scale's name does, and the knob glides with
// the picture. A drag of the knob follows the finger directly; so does a drag that began on the line, once the glide has caught up with it.
let glide = false;
$('zoom').addEventListener('pointerdown', (e) => {
  const r = e.currentTarget.getBoundingClientRect(), knob = 18, x = r.left + knob / 2 + st.z / LAST * (r.width - knob);
  glide = !reduced && Math.abs(e.clientX - x) > knob / 2 + 8;
});
for (const type of ['pointerup', 'pointercancel']) addEventListener(type, () => { glide = false; });
$('zoom').addEventListener('input', (e) => {
  const v = +e.target.value;
  if (glide && (fly || Math.abs(v - st.z) > 0.03)) { zoomTo(v); e.target.value = st.z; } else { glide = false; setZoom(v); }
});
$('cycle').addEventListener('input', (e) => { st.phi = +e.target.value; shown.pv = +e.target.value; st.play = false; phiSet = true; touch(); });
$('play').addEventListener('click', togglePlay);
// An arrow key moves a slider by a step that can be seen: a twentieth of a scale, or a few degrees (half a degree among the molecules).
$('zoom').addEventListener('keydown', (e) => { const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key]; if (!d) return; e.preventDefault(); setZoom(st.z + d * 0.05); });
$('cycle').addEventListener('keydown', (e) => { const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key]; if (!d) return; e.preventDefault(); st.phi = clamp(wrap(st.phi) + d * (st.z > 3.5 ? 0.5 : st.z > 2.5 ? 1 : 5), 0, 720); st.play = false; phiSet = true; touch(); });
cv.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(st.z - e.deltaY * (e.deltaMode ? 0.03 : 0.0012)); }, { passive: false });
// Two fingers on the picture: spreading them zooms in and pinching them zooms out, exactly as dragging the Zoom
// slider does, and the slider follows. One full spread is about one scale. While the browser's own zoom is in, the
// pinch is left to the browser, so that there is always a way back out.
const pinchBy = (g) => setZoom(st.z + g * 0.9);
const fingers = new Map(); let span = 0;
const pageZoomed = () => (window.visualViewport ? visualViewport.scale : 1) > 1.01;
const leavePinch = () => cv.classList.toggle('pagezoom', pageZoomed());
if (window.visualViewport) { visualViewport.addEventListener('resize', leavePinch); leavePinch(); }
const spanOf = () => { const [a, b] = [...fingers.values()]; return Math.max(24, Math.hypot(a[0] - b[0], a[1] - b[1])); };
cv.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; fingers.set(e.pointerId, [e.clientX, e.clientY]); span = fingers.size === 2 ? spanOf() : 0; });
cv.addEventListener('pointermove', (e) => {
  if (!fingers.has(e.pointerId)) return;
  fingers.set(e.pointerId, [e.clientX, e.clientY]);
  if (fingers.size !== 2 || pageZoomed()) { span = 0; return; }
  const d = spanOf();
  if (span) pinchBy(Math.log(d / span));
  span = d;
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) cv.addEventListener(type, (e) => { fingers.delete(e.pointerId); span = 0; });
$('reload').addEventListener('click', () => location.reload());
// A controller: the triggers zoom, and the bumpers fly to the scale before or after.
gamepad({
  zoom: { move(v, dt) { setZoom(st.z + v * 0.9 * dt); } },
  prev: { label: 'Zoom out to the scale before', press: () => zoomTo(Math.ceil((fly ? fly.to : st.z) - 1e-6) - 1) },
  next: { label: 'Zoom in to the next scale', press: () => zoomTo(Math.floor((fly ? fly.to : st.z) + 1e-6) + 1) },
});
cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); broken = true; $('oops').hidden = false; });
cv.addEventListener('webglcontextrestored', () => location.reload());
addEventListener('resize', measure);
addEventListener('hashchange', () => { if (readHash()) { st.play = false; fly = null; touch(); } });
document.fonts?.ready.then(measure);

const fromLink = readHash();
{ const k = +new URLSearchParams(location.search).get('res'); if (k > 0) fixedScale = k; }
measure();
// for the tests: a coarser picture, a flight ended at once, a redraw that waits for the graphics card
window.__engine = { st, view, drawn, redraw() { if (broken) return; draw(); labels(); sync(); gl.finish(); }, free: () => free, stops: STOPS, model: M, get busy() { return !!(fly || st.play); }, res(k) { fixedScale = k; touch(); },
  settle() { if (fly) { st.z = fly.to; fly = null; } zoomAt = -1e9; touch(); }, set(z, phi) { if (broken) return; st.z = z; if (phi !== undefined) st.phi = phi; fly = null; st.play = false; aim(st.z); draw(); labels(); sync(); gl.finish(); },
  tick(s) { tau += s; }, get scale() { return fixedScale || (sharp ? 1 : scale); } };
if (!reduced && !fromLink) setTimeout(() => { if (!st.play && !fly && zoomAt < 0) { st.play = true; touch(); } }, 1200);
