// Builds and draws the synapse: lipids, proteins, transmitter and the hazy surroundings.
// Units are nanometres. y points into the sending cell; the cleft is below y = 0.
import { program, instancedVAO, rng, sstep, lerp } from './glx.js';
import { compute, surf, outline, drift, tethers, D, RHO0, CLEFT, TABW, BAREA, PH, ARRIVE, CA_IN, CA_BOUND, DOCK_GAP, SNARE_REACH, TETHER, WALK } from './profile.js';
import { clock, unclock, kinetics, lipidSpread, proteinSpread, spreadAfter, released, arrivalTime, T_END, T_UNBIND, BOUND, PORE_T, D_GLU, REL_N } from './kinetics.js';
import * as SH from './shaders.js';
import { irmBeam, irmOptics, hue } from './irm.js';
import { optics, buildBench, beamPath, QUENCH, QUENCH_O, GAP, GLASS_TOP, GLASS_BOT, LENS_Y, MM, UM, F_OBJ, N_GLASS, CELL, SPOT, spot, domeY } from './vitro.js';

const PI = Math.PI, TAU = 2 * PI;
export const PATCH = 120;            // radius of membrane drawn lipid by lipid
const LIPID_AREA = 0.68;             // nm^2 per lipid in a fluid bilayer
const GLU_PER_NM3 = 0.0903;          // 150 mM glutamate
const NT_MAX = 26000, BALL_MAX = 11000;
export const NT_STRIDE = 11, NT_BIND = 190;       // floats per glutamate instance; the binders are among the first NT_BIND
// How many copies of each protein the vesicle carries (Takamori et al., Cell 127:831, 2006: 69.8 synaptobrevins and
// 15.2 synaptotagmins on an average vesicle), and how many of the synaptobrevins carry the tag on the microscope.
export const COPIES = { synaptobrevin: 70, synaptotagmin: 15, tagged: 36 };
export const CUT_CENTRE = PI / 2;

export const COLORS = {
  vesicle: [0.97, 0.69, 0.30], vesicleIn: [0.94, 0.53, 0.22],
  plasma: [0.34, 0.57, 0.88], plasmaOut: [0.29, 0.49, 0.80],
  post: [0.52, 0.47, 0.70], postIn: [0.44, 0.39, 0.61],
  syntaxin: [0.92, 0.26, 0.28], snap25: [0.33, 0.80, 0.42], synaptobrevin: [0.36, 0.33, 1.0],
  synaptotagmin: [0.72, 0.48, 0.96], calcium: [1.0, 0.90, 0.28], glutamate: [1.0, 0.36, 0.74],
  phluorin: [0.30, 1.0, 0.40], emission: [0.45, 1.0, 0.35], ofp: [1.0, 0.50, 0.10], emissionO: [1.0, 0.56, 0.14],
  channel: [0.86, 0.70, 0.34], ampa: [0.20, 0.72, 0.66], nmda: [0.86, 0.50, 0.30],
  tether: [0.16, 0.60, 0.66], pump: [0.62, 0.70, 0.82], physin: [0.95, 0.56, 0.64], vglut: [0.72, 0.80, 0.30], rab: [0.93, 0.92, 0.84],
  sodium: [0.62, 0.92, 1.0], adhesion: [0.62, 0.62, 0.74],
};

const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const mixv = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// A protein cannot go where it does not fit. Each kind is given the height of its bulk above the
// membrane and that bulk's radius (cytoplasmic side), or for a tagged synaptobrevin the room its
// tag needs inside the pore. While the neck is narrow the wedge of cytoplasm around it is only a
// few nanometres high, so a proton pump has to wait on the vesicle until the neck has opened wide.
const BULK = { pump: [9.6, 5.4], rab: [2.9, 1.5], physin: [0.9, 0.9], vglut: [0.8, 0.8], syt: [4.0, 2.6], free: [0, 1.35] };
const gateCache = { R: 0, g: null };
// For each kind, the progress from which it fits everywhere between the vesicle and the cell membrane.
function gates(R) {
  if (gateCache.R === R) return gateCache.g;
  const g = {}, open = new Set(Object.keys(BULK)), o = new Float64Array(6); let tab = null;
  for (const k of open) g[k] = PH.PORE + 0.02;
  for (let p = 1; p >= PH.PORE + 0.02 && open.size; p -= 0.01) {
    const S = compute(p, R, tab), yc = S.h, Ro = S.Rc + D, Av = S.Av[0]; tab = S.tab;
    for (let i = 0; i <= 1500 && open.size; i++) {
      surf(S, 0, (Av + 900) * i / 1500, 0, o);
      const r = o[0], y = o[1], nr = o[3], ny = o[4], onCap = Math.abs(Math.hypot(r, y - yc) - Ro) < 0.05 && ny > Math.cos(S.theta) - 0.02;
      for (const k of open) {
        const [H, rad] = BULK[k]; let ok;
        if (k === 'free') ok = onCap || ny > 0.98 || r - 2 * D * nr >= rad;
        else {
          const tr = r + nr * H, ty = y + ny * H;
          ok = ty - rad >= D - 0.4 && (onCap || S.theta <= PI / 2 || Math.hypot(tr, ty - yc) >= Ro + rad - 0.4);
        }
        if (!ok) { g[k] = p + 0.01; open.delete(k); }
      }
    }
  }
  gateCache.R = R; gateCache.g = g;
  return g;
}

// Where a protein that rides on the vesicle sits: fixed until there is room for it to leave, then
// spreading by random motion across the merged membrane, as far as the time since then allows
// (proteinSpread in kinetics.js). Returns [area coordinate, azimuth].
function freeSite(S, fr, p, gate) {
  const uv = Math.sqrt(S.Av[0] / PI), sg = proteinSpread(p, S.R, gate);
  const ux = fr.u * uv * Math.cos(fr.phi) + sg * fr.g1, uz = fr.u * uv * Math.sin(fr.phi) + sg * fr.g2;
  let a = PI * (ux * ux + uz * uz);
  if (!S.fused[1]) a = Math.min(a, S.Av[0] * 0.985);
  return [a, Math.atan2(uz, ux)];
}

// A tagged synaptobrevin near a pore too narrow for its tag waits just above it.
function roomy(S, a, phi, tmp) {
  const Av = S.Av[0];
  for (let k = 0; k < 60 && a > Av * 0.6; k++, a -= 8) {
    surf(S, 0, a, phi, tmp);
    const r = Math.hypot(tmp[0], tmp[2]), nr = (tmp[3] * tmp[0] + tmp[5] * tmp[2]) / Math.max(r, 1e-6);
    if (tmp[4] > 0.98 || r - 2 * D * nr >= 1.35 || (Math.abs(Math.hypot(r, tmp[1] - S.hV) - S.Rc - D) < 0.05 && tmp[4] > Math.cos(S.theta) - 0.02)) break;
  }
  return a;
}
// A spent SNARE complex spreads from this progress on: by then it lies along one membrane.
const SNARE_FREE = 0.56;
// Where one SNARE complex is: syntaxin's anchor in the cell membrane (area aS, azimuth phiS) and synaptobrevin's
// (aB, phiB). Until calcium has bound nothing moves. Winding then draws the anchors toward the neck. Once the complex
// lies in one membrane it spreads by random motion like any other protein; it lies along the cell membrane and
// does not climb the dome, so its walk turns back at the neck.
function snareSite(S, sn, p, gate) {
  const Av = S.Av[0], uv2 = Av / PI, near = sstep(CA_BOUND, PH.STALK, p), sb = lerp(10, 5.5, near), IN = 5.5;
  const u0 = Math.sqrt(uv2 + Math.pow(lerp(9, IN, near), 2)), sg = proteinSpread(p, S.R, SNARE_FREE);
  const ux = u0 * Math.cos(sn.phi) + sg * sn.g1, uz = u0 * Math.sin(sn.phi) + sg * sn.g2, umin = Math.sqrt(uv2 + IN * IN);
  let u = Math.hypot(ux, uz); if (u < umin) u = 2 * umin - u;
  const phi = sg > 0 ? Math.atan2(uz, ux) : sn.phi, rs = Math.sqrt(Math.max(IN * IN, u * u - uv2)), aS = Av + PI * rs * rs, dphi = 0.9 / Math.max(rs, 3);
  const wJoin = sstep(Math.max(PH.PORE, gate.free - 0.03), 0.58, p);
  return { phi, rs, aS, phiS: phi + dphi * wJoin, phiB: phi - dphi * wJoin, aB: lerp(Av - PI * sb * sb, aS, wJoin) };
}
// Where the fluorescent tag of a synaptobrevin at A hangs (A: its point on the cytoplasmic leaflet, and the normal).
// The tag hangs into the lumen. Inside a narrow pore it has to lie along the pore's axis. The orange barrel hangs
// from the far end of the green one on a short flexible linker. With room it folds to one side; in a narrow pore
// the two have to go through in single file. Returns the two barrels' centres (c, c2) and the lines they lie on.
function tagAt(A) {
  let dir = shade(A.n, -1);
  const rA = Math.hypot(A.p[0], A.p[2]), nR = rA > 1e-3 ? (A.n[0] * A.p[0] + A.n[2] * A.p[2]) / rA : 0, rB = rA - 2 * D * nR;
  if (nR > 0.05 && rB - 4.9 * nR < 1.3) {
    const ax = [0, A.n[1] < 0 ? 1 : -1, 0];
    for (let t = 0.1; t <= 1.001; t += 0.1) { dir = norm(mixv(shade(A.n, -1), ax, t)); if (rB + 4.9 * (dir[0] * A.p[0] + dir[2] * A.p[2]) / rA >= 1.3) break; }
  }
  const base = add(A.p, A.n, -2 * D), side = norm(cross(dir, Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const fold = 1 - sstep(0.05, 0.25, nR) * (1 - sstep(1.3, 5, rB - 4.9 * nR));
  const dir2 = norm(mixv(dir, add(shade(dir, 0.25), side, 1), fold)), hinge = add(base, dir, 6.0);
  return { base, dir, hinge, dir2, c: add(base, dir, 3.6), c2: add(hinge, dir2, 1.6) };
}
// The arriving vesicle's pose at progress p: everything it carries is turned about its centre C and moved by off.
function vesPose(S, p) { const dr = drift(p, S.R); return { off: [dr.x, 0, dr.z], M: dr.M, C: [0, S.hV, 0], dr }; }
const carried = (VM, q) => { const x = q[0] - VM.C[0], y = q[1] - VM.C[1], z = q[2] - VM.C[2], M = VM.M;
  return [M[0] * x + M[1] * y + M[2] * z + VM.C[0] + VM.off[0], M[3] * x + M[4] * y + M[5] * z + VM.C[1], M[6] * x + M[7] * y + M[8] * z + VM.C[2] + VM.off[2]]; };
// The camera's trace is the light from within about TRACE_R nm of the fusion site, at TRACE_N moments of the event.
export const TRACE_R = 130, TRACE_N = 72;
export const traceWeight = (x, z) => Math.exp(-(x * x + z * z) / (2 * TRACE_R * TRACE_R));
// The membrane points of the tagged synaptobrevins: the six in SNARE complexes, then the tagged free ones.
// The picture and the camera's trace both start from this list.
function taggedSites(S, p, gate, snares, free, tmp) {
  const out = [], at = (a, phi) => { surf(S, 0, a, phi, tmp); return { p: [tmp[0], tmp[1], tmp[2]], n: [tmp[3], tmp[4], tmp[5]] }; };
  for (const sn of snares) { const g = snareSite(S, sn, p, gate); out.push(at(roomy(S, g.aB, g.phiB, tmp), g.phiB)); }
  for (const fr of free) if (fr.tagged) { const site = freeSite(S, fr, p, gate.free); out.push(at(roomy(S, site[0], site[1], tmp), site[1])); }
  return out;
}

// ---- the lipids ------------------------------------------------------------------------------------
// Every lipid has a place on a flat map of its leaflet in which equal areas are equal: the vesicle's lipids fill a disc
// of the vesicle's area, and the cell membrane's lie outside it, each pushed out from the axis by that area. Both are
// laid out on one sunflower spiral (lipid i at area (i + 1/2) a, turned i golden angles), the cell membrane's carrying
// on where the vesicle's ends. A spiral like that stays evenly packed however much area is added at its centre, so
// the sheet has no gaps at any stage. (A lattice of rows does not: pushed out from the axis it opens into spokes.)
const GOLDEN = PI * (3 - Math.sqrt(5));
const spin = (leaf) => GOLDEN * (leaf ? 1 : -1);
const vesicleCount = (R, leaf, q) => { const Rl = R + (leaf ? -D : D); return Math.round(4 * PI * Rl * Rl * q / LIPID_AREA); };
// The turn that makes the cell membrane's spiral carry on from the vesicle's last lipid.
export const seamTurn = (R, leaf, q) => (vesicleCount(R, leaf, q) * spin(leaf)) % TAU;
// The vesicle's lipids, seven numbers each: place on the unit disc of the flat map (2), a Gaussian pair, a seed, 4 * leaflet, size.
export function vesicleLipids(R, q) {
  const r = rng(11), out = [];
  for (let leaf = 0; leaf < 2; leaf++) {
    const n = vesicleCount(R, leaf, q), g = spin(leaf);
    for (let i = 0; i < n; i++) {
      const u = Math.sqrt((i + 0.5) / n), ph = i * g + leaf;
      out.push(u * Math.cos(ph), u * Math.sin(ph), r.gauss(), r.gauss(), r(), 4 * leaf, 1);
    }
  }
  return new Float32Array(out);
}
// The two flat membranes' lipids, in the same seven numbers: the sending cell's (kind 1; nPM of them, placed in nm on
// their own sheet as it is before any vesicle joins it), then the receiving cell's (kind 2, fewer and larger).
export function sheetLipids(q) {
  const area = LIPID_AREA / q, r = rng(7), out = [], s = Math.sqrt(2 * area / Math.sqrt(3));
  for (let leaf = 0; leaf < 2; leaf++) {
    const n = Math.round(PI * (PATCH + 3) * (PATCH + 3) / area), g = spin(leaf);
    for (let i = 0; i < n; i++) {
      const rr = Math.sqrt((i + 0.5) * area / PI), ph = i * g + leaf;
      out.push(rr * Math.cos(ph), rr * Math.sin(ph), r.gauss(), r.gauss(), r(), 1 + 4 * leaf, 1);
    }
  }
  const nPM = out.length / 7, coarse = 1.3;            // the far membrane is drawn with fewer, larger headgroups
  for (let leaf = 0; leaf < 2; leaf++) {
    const sp = s * coarse, dz = sp * Math.sqrt(3) / 2, nj = Math.ceil(PATCH / dz), ni = Math.ceil(PATCH / sp) + 1, ox = r() * sp, oz = r() * dz;
    for (let j = -nj; j <= nj; j++) for (let i = -ni; i <= ni; i++) {
      const x = (i + 0.5 * (j & 1)) * sp + ox + (r() - 0.5) * sp * 0.34, z = j * dz + oz + (r() - 0.5) * sp * 0.34;
      if (x * x + z * z > PATCH * PATCH) continue;
      out.push(x, z, r.gauss(), r.gauss(), r(), 2 + 4 * leaf, coarse);
    }
  }
  return { data: new Float32Array(out), nPM };
}

export class Scene {
  constructor(gl) {
    this.gl = gl;
    this.P = {
      head: program(gl, SH.lipidHeadVS, SH.sphereFS), tail: program(gl, SH.tailVS, SH.tailFS),
      ball: program(gl, SH.ballVS, SH.sphereFS), ballHalo: program(gl, SH.ballVS, SH.haloFS),
      nt: program(gl, SH.transmitterVS, SH.sphereFS), ntHalo: program(gl, SH.transmitterVS, SH.haloFS),
      sheet: program(gl, SH.sheetVS, SH.sheetFS), sky: program(gl, SH.skyVS, SH.skyFS),
      glow: program(gl, SH.skyVS, SH.glowFS), field: program(gl, SH.fieldVS, SH.fieldFS),
      mesh: program(gl, SH.meshVS, SH.meshFS), beam: program(gl, SH.beamVS, SH.beamFS), line: program(gl, SH.lineVS, SH.lineFS),
    };
    this.corners = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.tabTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tabTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, TABW, 4, 0, gl.RGBA, gl.FLOAT, null);
    for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
    for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
    const mk = (layout, stride) => { const b = gl.createBuffer(); return { b, vao: instancedVAO(gl, this.corners, b, layout, stride), n: 0 }; };
    this.ves = mk([4, 3], 7); this.sheetLipids = mk([4, 3], 7);
    this.nt = mk([3, 4, 4], NT_STRIDE); this.scenery = mk([4, 4], 8); this.dyn = mk([4, 4], 8);
    this.dynData = new Float32Array(BALL_MAX * 8);
    this.emptyVAO = gl.createVertexArray();
    this.S = null; this.key = ''; this.labels = [];
    this.buildProteins(); this.buildScenery(); this.buildSheets(); this.buildTransmitter();
    // In vitro: the bench under the cell, cell nuclei, and the laser beam.
    this.bench = buildBench(gl);
    this.nuclei = mk([4, 4], 8);
    const nd = []; for (const q of this.bench.nuclei) nd.push(q[0], q[1], q[2], q[3], 0.34, 0.38, 0.62, 3);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nuclei.b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(nd), gl.STATIC_DRAW); this.nuclei.n = nd.length / 8;
    this.beamBuf = gl.createBuffer(); this.beamVAO = gl.createVertexArray();
    gl.bindVertexArray(this.beamVAO); gl.bindBuffer(gl.ARRAY_BUFFER, this.beamBuf);
    [[0, 3, 0], [1, 3, 12], [2, 4, 24], [3, 3, 40]].forEach(([loc, size, off]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 52, off); });
    gl.bindVertexArray(null);
    this.opt = optics(68); this.emit = []; this.fluor = 0; this.fluorO = 0; this.labelText = {};
    this.buildCell();
    this.lineBuf = gl.createBuffer(); this.lineVAO = gl.createVertexArray();
    gl.bindVertexArray(this.lineVAO); gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    [[0, 3, 0], [1, 4, 12]].forEach(([loc, size, off]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 28, off); });
    gl.bindVertexArray(null);
  }

  // ---- static geometry -------------------------------------------------------------------------
  setQuality(q) {
    this.q = q;
    const area = LIPID_AREA / q, gl = this.gl;
    this.spacing = Math.sqrt(2 * area / Math.sqrt(3));
    this.headR = this.spacing * 0.53;
    const { data, nPM } = sheetLipids(q);
    this.nPM = nPM;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sheetLipids.b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    this.sheetLipids.n = data.length / 7;
    this.vesR = -1; this.key = '';
  }

  buildVesicle(R) {
    const gl = this.gl, out = vesicleLipids(R, this.q);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ves.b);
    gl.bufferData(gl.ARRAY_BUFFER, out, gl.DYNAMIC_DRAW);
    this.ves.n = out.length / 7; this.vesR = R;
  }

  // Each glutamate molecule: a home in the lumen (a point of the unit ball), and its own random numbers: e decides
  // when it leaves (kinetics.js), the Gaussian pair where it goes in the cleft, w how it crosses the gap.
  // A few are the ones that bind a receptor: each binding site takes the molecule whose own direction points most
  // nearly at it, and that molecule stops there when it arrives. They are among the first NT_BIND, which are drawn
  // for every size of vesicle, so the bound molecules always come out of the cloud and the total stays the same.
  buildTransmitter() {
    const gl = this.gl, r = rng(23), d = new Float32Array(NT_MAX * NT_STRIDE);
    for (let i = 0; i < NT_MAX; i++) {
      let x, y, z;
      do { x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 2 - 1; } while (x * x + y * y + z * z > 1);
      d.set([x, y, z, r(), r.gauss(), r.gauss(), r(), 0, 0, 0, 0], i * NT_STRIDE);
    }
    const taken = new Set();
    for (const rc of this.receptors) {
      rc.bound = [];
      for (const q of rc.sites) {
        const want = Math.atan2(q[2], q[0]), rr = Math.hypot(q[0], q[2]); let best = -1, miss = 9;
        for (let i = 0; i < NT_BIND; i++) {
          const g1 = d[i * NT_STRIDE + 4], g2 = d[i * NT_STRIDE + 5], g = Math.hypot(g1, g2);
          if (taken.has(i) || g < 0.7 || g > 2.2) continue;
          const m = Math.abs(((Math.atan2(g2, g1) - want + PI) % TAU + TAU) % TAU - PI);
          if (m < miss) { miss = m; best = i; }
        }
        taken.add(best);
        const k = best * NT_STRIDE, g = Math.hypot(d[k + 4], d[k + 5]);
        d[k + 4] = g * q[0] / rr; d[k + 5] = g * q[2] / rr;
        d.set([q[0], q[1], q[2], rc.nmda ? 2 : 1], k + 7);
        rc.bound.push({ i: best, e: d[k + 3], g, r: rr });
      }
    }
    this.ntData = d;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nt.b);
    gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW);
  }

  buildSheets() {
    const gl = this.gl, rings = [PATCH - 14, PATCH, 150, 200, 280, 420, 700, 1300, 2600, 5000, 10000, 24000], seg = 72, v = [];
    for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < seg; i++) {
      const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU, r0 = rings[k], r1 = rings[k + 1];
      const p = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
      v.push(...p(r0, a0), ...p(r1, a0), ...p(r1, a1), ...p(r0, a0), ...p(r1, a1), ...p(r0, a1));
    }
    this.sheetVAO = gl.createVertexArray();
    gl.bindVertexArray(this.sheetVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.sheetN = v.length / 2;
  }

  // Fixed cast of proteins. Angles are chosen so some sit on each side of the default cutaway.
  buildProteins() {
    const r = rng(5), r2 = rng(41);
    this.snares = []; this.syts = [];
    for (let k = 0; k < 6; k++) {
      // g1, g2: the direction and share of its random walk once it is free to spread (as for every protein here).
      this.snares.push({ phi: CUT_CENTRE + PI / 6 + k * PI / 3 + (r() - 0.5) * 0.16, yaw: (r(), r(), (r() - 0.5) * 4.5), g1: r2.gauss(), g2: r2.gauss() });
      this.syts.push({ phi: CUT_CENTRE + k * PI / 3 + (r() - 0.5) * 0.2 + PI / 3, g1: (r(), r(), r2.gauss()), g2: r2.gauss() });
    }
    for (let i = 0; i < 30; i++) { r(); r(); r.gauss(); r.gauss(); }      // (keeps the numbers below as they were)
    this.channels = [{ phi: 3.55, r: 30 }, { phi: 5.9, r: 37 }, { phi: 1.75, r: 44 }];
    this.receptors = [];
    let guard = 0;
    while (this.receptors.length < 19 && guard++ < 4000) {
      const rr = 72 * Math.sqrt(r()), a = r() * TAU, x = rr * Math.cos(a), z = rr * Math.sin(a);
      if (this.receptors.some(o => Math.hypot(o.x - x, o.z - z) < 11.5)) continue;
      this.receptors.push({ x, z, rot: r() * PI, nmda: this.receptors.length % 5 === 4, r: rr });
    }
    // Where glutamate binds: BOUND of a receptor's four subunits each hold one molecule, in the cleft-side domain.
    for (const rc of this.receptors) {
      const k = rc.nmda ? 1.12 : 1; rc.sites = [];
      for (let j = 0; j < 4 && rc.sites.length < (rc.nmda ? BOUND.nmda : BOUND.ampa); j += 2) {
        const a = rc.rot + j * PI / 2, cx = Math.cos(a), sz = Math.sin(a);
        rc.sites.push([rc.x + 3.2 * cx * k + sz * 0.5, -CLEFT + D + 3.9, rc.z + 3.2 * sz * k - cx * 0.5]);
      }
    }
    this.links = [];
    for (let i = 0; i < 12; i++) { const a = r() * TAU, rr = 48 + r() * 60; this.links.push({ a, r: rr, bend: (r() - 0.5) * 3, ph: r() * 9 }); }
    // The vesicle's own proteins, in the numbers counted on an average synaptic vesicle (Takamori et al., Cell
    // 127:831, 2006): about 70 synaptobrevins, 15 synaptotagmins, 30 synaptophysins, 10 glutamate transporters,
    // 10 Rab3 and one or two proton pumps. Six of the synaptobrevins and six of the synaptotagmins are at the fusion
    // site (above). The rest share one even spiral over the upper four fifths of the vesicle, so that no two are in
    // the same place. The same vesicle is drawn in the cell and on the microscope; there, COPIES.tagged of its
    // synaptobrevins carry the fluorescent tag.
    const kinds = [...Array(COPIES.synaptobrevin - 6).fill('free'), ...Array(30).fill('physin'), ...Array(10).fill('vglut'), ...Array(10).fill('rab'), ...Array(COPIES.synaptotagmin - 6).fill('syt')];
    const N = kinds.length, r3 = rng(29), pa = CUT_CENTRE + 2.2, pu = 0.33, CLEAR = 0.19;
    this.coat = []; this.free = [];
    for (let j = 0; j < N; j++) {
      const kind = kinds[(j * 47) % N]; let u = Math.sqrt(0.035 + 0.78 * (j + 0.5) / N), phi = j * 2.39996 + 0.4;
      // Nothing stands under the proton pump: a site closer to it than its ring is moved out to the ring's edge.
      const dx = u * Math.cos(phi) - pu * Math.cos(pa), dz = u * Math.sin(phi) - pu * Math.sin(pa), dd = Math.hypot(dx, dz);
      if (dd < CLEAR) { const x = pu * Math.cos(pa) + dx / dd * CLEAR, z = pu * Math.sin(pa) + dz / dd * CLEAR; u = Math.hypot(x, z); phi = Math.atan2(z, x); }
      const site = { kind, u, phi, g1: r3.gauss(), g2: r3.gauss(), rot: r3() * TAU };
      if (kind === 'free') { site.tagged = this.free.length < COPIES.tagged - 6; this.free.push(site); } else this.coat.push(site);
    }
    // The pump is far bulkier than the rest and diffuses slowly, so it ends up not far from where it came in.
    this.coat.push({ kind: 'pump', u: pu, phi: pa, g1: 0.28 * Math.cos(pa), g2: 0.28 * Math.sin(pa), rot: 0 });
  }

  buildScenery() {
    const gl = this.gl, r = rng(3), out = [];
    const ball = (x, y, z, rad, c, style) => out.push(x, y, z, rad, c[0], c[1], c[2], style);
    const amber = [0.80, 0.58, 0.30];
    // Reserve pool of vesicles, and a few more docked along the active zone. None stands where the arriving vesicle
    // can go: its walk stays within WALK.side of the axis, less near the membrane (profile.js), and the largest
    // vesicle the size slider allows must pass.
    const RMAX = 45 - 2.4 + D, Y0 = 45 - 2.4 + 2 * RHO0 + DOCK_GAP;
    const inWay = (rr, y, rad) => { for (let a = 0; a <= 175; a += 5) if (Math.hypot(Math.max(0, rr - Math.min(WALK.side, 10 + 0.9 * a)), y - Y0 - a) < RMAX + rad + 3) return true; return false; };
    const ves = []; this.reserve = null; this.docked = [];
    let guard = 0;
    while (ves.length < 230 && guard++ < 40000) {
      const a = r() * TAU, rr = 520 * Math.sqrt(r()), y = 62 + 480 * Math.pow(r(), 1.25), rad = 19 + r() * 5;
      const p = [rr * Math.cos(a), y, rr * Math.sin(a)];
      if (Math.hypot(p[0], p[1] - 10, p[2]) < 98) continue;
      if (inWay(Math.hypot(p[0], p[2]), y, rad)) continue;        // the way down to the release site stays clear
      if (ves.some(v => Math.hypot(v[0] - p[0], v[1] - p[1], v[2] - p[2]) < v[3] + rad + 5)) continue;
      ves.push([...p, rad]);
      if (!this.reserve && p[2] < -90 && y > 110 && y < 190 && Math.abs(p[0]) < 120) this.reserve = [p[0], p[1] + rad, p[2]];
    }
    for (const [a, rr] of [[0.5, 104], [2.5, 150], [4.3, 118], [5.6, 205], [3.4, 255], [1.3, 290]]) {
      const rad = 20 + r() * 3; ves.push([rr * Math.cos(a), rad + D + 3.5, rr * Math.sin(a), rad]);
      this.docked.push([rr * Math.cos(a), rr * Math.sin(a), rad]);
    }
    for (const v of ves) ball(v[0], v[1], v[2], v[3], shade(amber, 0.85 + 0.3 * r()), 2);
    this.reserve = this.reserve || [ves[0][0], ves[0][1] + ves[0][3], ves[0][2]];
    // A mitochondrion far behind: the terminal's power supply.
    const m0 = [-330, 430, -520], m1 = [300, 360, -640];
    for (let i = 0; i <= 26; i++) { const p = mixv(m0, m1, i / 26); ball(p[0], p[1] + Math.sin(i * 0.5) * 14, p[2], 118 + 10 * Math.sin(i * 0.9), [0.62, 0.30, 0.34], 3); }
    this.mito = [-60, 520, -570];
    // Microtubules and actin filaments.
    const chain = (a, b, rad, step, c, style, wob) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.ceil(len / step);
      for (let i = 0; i <= n; i++) { const p = mixv(a, b, i / n); ball(p[0] + Math.sin(i * 0.11) * wob, p[1] + Math.cos(i * 0.07) * wob, p[2], rad, c, style); }
    };
    chain([-760, 300, -250], [720, 215, -430], 12.5, 9, [0.42, 0.62, 0.60], 0, 10);
    chain([-640, 470, 180], [560, 590, -180], 12.5, 9, [0.42, 0.62, 0.60], 0, 14);
    for (let i = 0; i < 12; i++) {
      const a = r() * TAU, rr = 150 + r() * 330, p = [rr * Math.cos(a), 60 + r() * 300, rr * Math.sin(a)];
      const dir = norm([r() - 0.5, (r() - 0.5) * 0.8, r() - 0.5]), len = 140 + r() * 220;
      chain(p, add(p, dir, len), 3.6, 4.2, [0.78, 0.44, 0.46], 0, 3);
    }
    this.sceneryCell = out.length / 8;
    // Postsynaptic density: the scaffold that holds receptors under the release site.
    for (let i = 0; i < 1100; i++) {
      const a = r() * TAU, rr = 190 * Math.sqrt(r()), dep = Math.pow(r(), 1.6);
      ball(rr * Math.cos(a), -CLEFT - D - 3.2 - dep * 34, rr * Math.sin(a), 1.9 + r() * 2.6, shade([0.60, 0.42, 0.62], 0.75 + 0.4 * r()), 0);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.scenery.b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.STATIC_DRAW);
    this.scenery.n = out.length / 8;
  }

  // The rest of our cell at micrometre scale: the other vesicles near the glass (some of which
  // fuse earlier or later than the one in focus), and enough interior to give the view depth.
  buildCell() {
    const gl = this.gl, r = rng(17), out = [];
    const ball = (x, y, z, rad, c, style) => out.push(x, y, z, rad, c[0], c[1], c[2], style);
    const inCell = () => { for (;;) { const a = r() * TAU, rr = CELL.r * 0.96 * Math.sqrt(r()); const x = CELL.x + rr * Math.cos(a), z = CELL.z + rr * Math.sin(a); if (Math.hypot(x, z) > 380) return [x, z]; } };
    this.neigh = [];
    for (let i = 0; i < 420; i++) {
      const [x, z] = inCell();
      if (this.neigh.some((n) => Math.hypot(n.x - x, n.z - z) < 110)) continue;
      // Just under half fuse at their own moment, up to T_END ms before our pore opens or after it; the rest stay
      // docked. t is that moment on the one clock (kinetics.js), in ms from our pore opening.
      const off = r() < 0.45 ? -1.5 + 2.9 * r() : null;
      this.neigh.push({ x, z, rad: 19 + r() * 5, off, t: off === null ? null : -Math.sign(off) * T_END * Math.pow(Math.abs(off) / 1.5, 3), k: 0.75 + 0.5 * r() });
    }
    // Vesicles deeper in the cytoplasm, out of the laser's reach.
    for (let i = 0; i < 1700; i++) {
      const [x, z] = inCell(), top = domeY(x, z);
      if (top < 260 || Math.hypot(x, z) < 700) continue;
      ball(x, 70 + (Math.min(top, 2600) - 170) * Math.pow(r(), 1.6), z, 19 + r() * 6, shade([0.80, 0.58, 0.30], 0.8 + 0.35 * r()), 2);
    }
    const chain = (a, b, rad, step, c, style, wob) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.ceil(len / step), ph = r() * 9;
      for (let i = 0; i <= n; i++) { const q = mixv(a, b, i / n), w = Math.sin(i * step / 900 + ph) * wob; ball(q[0] + w, q[1] + Math.cos(i * step / 700 + ph) * wob * 0.3, q[2] - w * 0.6, rad, c, style); }
    };
    // Mitochondria.
    for (let i = 0; i < 22; i++) {
      const [x, z] = inCell(), top = domeY(x, z);
      if (top < 1500 || Math.hypot(x, z) < 1800 || Math.hypot(x - CELL.x, z - CELL.z) < 3300) continue;
      const a = r() * TAU, len = 900 + r() * 1500, y = 500 + r() * Math.min(1800, top - 1100);
      chain([x, y, z], [x + Math.cos(a) * len, y + (r() - 0.5) * 300, z + Math.sin(a) * len], 210 + r() * 60, 150, [0.66, 0.33, 0.37], 3, 120);
    }
    // Actin stress fibres along the footprint, and microtubules running out from beside the nucleus.
    for (let i = 0; i < 9; i++) {
      const a = 0.5 + (r() - 0.5) * 0.7, off = (i - 4) * 1900 + r() * 500, hl = Math.sqrt(Math.max(0, CELL.r * CELL.r * 0.84 - off * off));
      const cx = CELL.x - Math.sin(a) * off, cz = CELL.z + Math.cos(a) * off;
      chain([cx - Math.cos(a) * hl, 95, cz - Math.sin(a) * hl], [cx + Math.cos(a) * hl, 95, cz + Math.sin(a) * hl], 30, 55, [0.62, 0.36, 0.40], 0, 0);
    }
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU + r() * 0.3, len = CELL.r * (0.55 + 0.33 * r()), o = [CELL.x + Math.cos(a) * 2600, 900, CELL.z + Math.sin(a) * 2600];
      chain(o, [CELL.x + Math.cos(a) * len, 160 + 200 * r(), CELL.z + Math.sin(a) * len], 26, 55, [0.42, 0.62, 0.60], 0, 60);
    }
    this.cellStuff = { b: gl.createBuffer(), n: out.length / 8 };
    this.cellStuff.vao = instancedVAO(gl, this.corners, this.cellStuff.b, [4, 4], 8);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cellStuff.b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.STATIC_DRAW);
  }

  // ---- per-frame state -------------------------------------------------------------------------
  update(st, time) {
    const gl = this.gl, R = st.diam / 2 - 2.4, key = st.p.toFixed(5) + '|' + R;
    if (this.vesR !== R) this.buildVesicle(R);
    if (key !== this.key) {
      this.S = compute(st.p, R, this.S && this.S.tab);
      gl.bindTexture(gl.TEXTURE_2D, this.tabTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TABW, 4, gl.RGBA, gl.FLOAT, this.S.tab);
      this.key = key;
    }
    const S = this.S, p = st.p;
    S.hV = S.h + (S.fused[0] ? 0 : S.extra);
    // While it arrives the vesicle wanders and tumbles as one body (drift in profile.js): everything it carries is
    // turned about its centre and moved with it (vx), the lipids and the glutamate in their shaders (uVes, uVesRot).
    this.vesMove = vesPose(S, p);
    const VM = this.vesMove, dr = VM.dr, vx = (q) => carried(VM, q);
    let OWN = 0;      // how far the balls being placed go with the vesicle (1: they are carried by it)
    S.Rin = R - D - 0.9;
    this.glutamate = Math.round(GLU_PER_NM3 * 4 / 3 * PI * Math.pow(S.Rin, 3));
    const cut = this.cutNow(st), half = cut * PI / 360;
    const kept = (x, z) => half < 0.002 || Math.abs(((Math.atan2(z, x) - CUT_CENTRE + PI) % TAU + TAU) % TAU - PI) >= half;

    const d = this.dynData; let n = 0;
    // Each ball carries a category, so the legend can pick out one kind of molecule.
    let CAT = 0;
    const ball = (q, rad, c, style = 0, cat = CAT) => { if (n >= BALL_MAX) return; if (OWN > 0) q = OWN >= 1 ? vx(q) : mixv(q, vx(q), OWN); const k = n++ * 8; d[k] = q[0]; d[k + 1] = q[1]; d[k + 2] = q[2]; d[k + 3] = rad; d[k + 4] = c[0]; d[k + 5] = c[1]; d[k + 6] = c[2]; d[k + 7] = style + 8 * cat; };
    const tmp = new Float64Array(6);
    const at = (leaf, a, phi) => { surf(S, leaf, a, phi, tmp); return { p: [tmp[0], tmp[1], tmp[2]], n: [tmp[3], tmp[4], tmp[5]] }; };
    const strand = (a, b, steps, rad, c) => { for (let i = 0; i <= steps; i++) ball(mixv(a, b, i / steps), rad, c); };
    const Av = S.Av[0], C = COLORS;
    const anchors = {}, gate = gates(R);
    const vitro = !!st.vitro, opt = this.opt = optics(st.angle);
    this.emit = [];
    // Superecliptic pHluorin: a pH-sensitive GFP fused to the end of synaptobrevin that faces the
    // vesicle interior. At the vesicle's pH 5.5 it is dark; once the pore lets the acid out it
    // shines, in proportion to the laser intensity at its height above the glass. A second
    // protein, CyOFP1, follows it on the same chain. The same laser excites it, it emits at a
    // longer wavelength (drawn in orange), and the acid only halves it: before the pore opens its
    // light already says how deep in the field the vesicle sits.
    const unq = sstep(PH.PORE, PH.PORE + 0.04, p);
    const tag = (A, draw) => {
      const { base, dir, hinge, dir2, c, c2 } = tagAt(A);
      const cT = vx(c), c2T = vx(c2), E = opt.at(cT[1] + GAP), E2 = opt.at(c2T[1] + GAP);
      const b = E * (QUENCH + (1 - QUENCH) * unq), lit = b > 0.05, bo = E2 * (QUENCH_O + (1 - QUENCH_O) * unq), litO = bo > 0.05;
      this.emit.push([cT[0], cT[2], b, cT[1], bo]);
      if (!draw) return cT;
      const own = OWN; OWN = 1;
      const col = lit ? shade(C.phluorin, Math.min(1.25, 0.3 + 1.5 * b)) : [0.30, 0.40, 0.34];
      ball(add(base, dir, 0.9), 0.34, shade(C.synaptobrevin, 0.9), 0, 5);
      for (const t of [2.3, 3.6, 4.9]) ball(add(base, dir, t), 1.15, col, lit ? 1 : 0, lit ? 13 : 14);
      const colO = litO ? shade(C.ofp, Math.min(1.25, 0.3 + 1.5 * bo)) : [0.42, 0.33, 0.27];
      for (const t of [0.3, 1.6, 2.9]) ball(add(hinge, dir2, t), 1.15, colO, litO ? 1 : 0, 20);
      OWN = own;
      return cT;
    };

    // SNARE complexes. Syntaxin (red) and SNAP-25 (green) belong to the plasma membrane,
    // synaptobrevin (blue) to the vesicle. Zipping the four helices from their far ends toward
    // the membrane anchors is what drags the two bilayers together.
    // They stay half wound until calcium has bound; the rest of the winding is what closes the gap.
    const Lb = 11.5, zip = lerp(0.42, 1, sstep(CA_BOUND, PH.STALK, p));
    const wCis = sstep(PH.PORE + 0.02, 0.6, p);
    // While the vesicle is still on its way the SNAREs have not met: syntaxin and SNAP-25 wait as a
    // bundle on the plasma membrane, and synaptobrevin hangs free from the vesicle. They engage
    // once it is within SNARE_REACH, and from there their winding pulls it down to the docked place.
    const apart = sstep(0.4 * SNARE_REACH, SNARE_REACH, S.approach);
    this.snares.forEach((sn) => {
      const { phi, rs, aS, phiS, phiB, aB } = snareSite(S, sn, p, gate);
      const Sx = at(0, aS, phiS), B = at(0, roomy(S, aB, phiB, tmp), phiB);
      const shown = kept(Sx.p[0], Sx.p[2]);
      if (vitro) tag(B, shown);
      if (!shown) return;
      const er = [Math.cos(phi), 0, Math.sin(phi)], et = [-Math.sin(phi), 0, Math.cos(phi)];
      // Before fusion the bundle lies in the wedge between the membranes; afterwards it rests on one.
      const M = mixv(mixv(Sx.p, B.p, 0.5), add(Sx.p, [0, 1, 0], 5), apart), rM = Math.hypot(M[0], M[2]), r2 = rM + 7;
      const vy = S.hV - S.approach * apart - Math.sqrt(Math.max(0, (S.Rc + D) * (S.Rc + D) - r2 * r2));
      const dirT = norm(add(add([0, 0, 0], er, 7), [0, 1, 0], (Math.max(vy, D + 3) + D) / 2 - M[1]));
      const S2 = at(0, Av + PI * (rs + Lb) * (rs + Lb), phi);
      const Q1 = add(Sx.p, Sx.n, 2.5), Q2 = add(S2.p, S2.n, 2.5);
      let dir = norm(mixv(dirT, norm(add(Q2, Q1, -1)), wCis));
      const yaw = sn.yaw * sstep(0.62, 0.96, p);
      if (yaw) { const c = Math.cos(yaw), s = Math.sin(yaw), k = Sx.n, kx = cross(k, dir), kd = k[0] * dir[0] + k[1] * dir[1] + k[2] * dir[2]; dir = norm([dir[0] * c + kx[0] * s + k[0] * kd * (1 - c), dir[1] * c + kx[1] * s + k[1] * kd * (1 - c), dir[2] * c + kx[2] * s + k[2] * kd * (1 - c)]); }
      const C0 = mixv(add(M, er, 1.2), Q1, wCis);
      const e1 = norm(cross(dir, Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0])), e2 = cross(dir, e1);
      const cols = [C.syntaxin, C.snap25, C.synaptobrevin, C.snap25];
      const ends = [add(Sx.p, Sx.n, 1.2), add(add(Sx.p, Sx.n, 2.1), et, 1.4), add(B.p, B.n, 1.2), add(add(Sx.p, Sx.n, 2.1), et, -1.4)];
      const bundle = (j, s) => { const ang = j * PI / 2 - 1.3 * s + sn.phi * 3; return add(add(add(C0, dir, Lb * (1 - s)), e1, 0.78 * Math.cos(ang)), e2, 0.78 * Math.sin(ang)); };
      const tips = [], heads = [];
      for (let j = 0; j < 4; j++) {
        const end = bundle(j, 1), off = add(ends[j], end, -1);
        heads.push(bundle(j, 0));
        for (let i = 0; i <= 27; i++) {
          const s = i / 27; let q = bundle(j, s), rad = 0.58;
          if (s > zip) { const u = (s - zip) / (1 - zip); q = add(q, off, u * u * (3 - 2 * u)); rad = 0.36; }
          // Synaptobrevin, not yet engaged: a loose strand reaching out from the vesicle.
          if (j === 2 && apart > 0) q = mixv(q, add(add(B.p, B.n, 1.2 + (1 - s) * Lb * 0.85), et, 2.2 * Math.sin(3.1 * s + sn.phi * 5) * (1 - s)), apart);
          OWN = j === 2 ? apart : 0; ball(q, rad, cols[j], 0, [3, 4, 5, 4][j]); OWN = 0;
          if (i === 27) tips.push(q);
        }
      }
      // Linkers and the two membrane-spanning helices.
      for (const [tip, A, c] of [[tips[0], Sx, C.syntaxin], [tips[2], B, C.synaptobrevin]]) {
        CAT = c === C.syntaxin ? 3 : 5; OWN = c === C.syntaxin ? 0 : apart;
        strand(tip, A.p, 3, 0.36, c);
        for (let t = 0.5; t <= 2 * D + 0.3; t += 0.55) ball(add(A.p, A.n, -t), 0.55, shade(c, 0.82));
        OWN = 0;
      }
      // SNAP-25's two helices are joined by a loop that is lipid-anchored to the plasma membrane.
      CAT = 4;
      const ctrl = add(add(C0, dir, Lb * 0.5), Sx.n, -2.6), lc = shade(C.snap25, 0.8);
      for (let i = 1; i < 12; i++) { const u = i / 12; ball(mixv(mixv(tips[1], ctrl, u), mixv(ctrl, heads[3], u), u), 0.3, lc); }
      if (!anchors.snare || sn.phi % TAU > 2.9 && sn.phi % TAU < 3.6) anchors.snare = add(C0, dir, Lb * 0.6);
    });

    // Tethers: rods standing on the active zone (Munc13 with RIM), each with a flexible link at its tip. The link is a
    // chain of one length, TETHER.link. It binds its site on the vesicle when the site comes within that length, and
    // from then on the vesicle cannot go further from the rod's tip than the chain allows. Slack is drawn as a coil,
    // and the chain is straight when the vesicle pulls it tight. It cannot pass through the vesicle: where the
    // straight line to its site would, the chain lies on the vesicle's surface. At hemifusion it lets go and stays on its rod.
    CAT = 19;
    const ctr = vx([0, S.hV, 0]), rSite = R + D + 0.6, NB = 30, up = Math.sqrt(TETHER.rod * TETHER.rod - TETHER.lean * TETHER.lean);
    this.tetherEnds = [];
    tethers(R).forEach((T, k) => {
      const F = at(0, Av + PI * Math.pow(R * 0.9 + 12, 2), T.phi);
      if (!kept(F.p[0], F.p[2])) return;
      const er = T.er, tip = add(add(F.p, F.n, up), er, -TETHER.lean), c = C.tether;
      for (let i = 0; i <= 12; i++) ball(mixv(add(F.p, F.n, -1.5), tip, i / 12), i > 9 ? 1.25 : 0.9, shade(c, 0.85 + 0.15 * (i % 2)));
      // Where the chain's far end is: on its site while it holds; otherwise a short way from the tip, on the side away from the vesicle.
      const site = vx(add([0, S.hV, 0], T.site)), away = add(tip, ctr, -1), gap = Math.hypot(away[0], away[1], away[2]);
      const rest = add(tip, norm(add(add(er, [0, 1, 0], 0.35), norm(away), 2.5 * (1 - sstep(rSite + 4, rSite + 18, gap)))), 7);
      const hold = p < 0 ? (dr.held[k] ? 1 : 1 - sstep(0, 3, dr.wait[k])) : 1 - sstep(PH.STALK, PH.STALK + 0.05, p);
      // The path with no slack: straight from the tip to the end, pushed out to the vesicle's surface where it would pass inside.
      const path = (w, q) => { const end = mixv(rest, site, w); let len = 0, prev = tip;
        for (let i = 1; i <= NB; i++) { let x = mixv(tip, end, i / NB); const o = add(x, ctr, -1), l = Math.hypot(o[0], o[1], o[2]); if (l < rSite && p < PH.STALK + 0.05) x = add(ctr, o, rSite / Math.max(l, 1e-6));
          len += Math.hypot(x[0] - prev[0], x[1] - prev[1], x[2] - prev[2]); prev = x; if (q) q.push(x); }
        return len; };
      let w = hold; for (let it = 0; it < 6 && w > 0 && w < 1 && path(w) > TETHER.link; it++) w *= 0.8;
      const base = [tip], taut = path(w, base);
      // Slack: the chain winds around that path, more loosely the more slack there is, and always on the side away from the vesicle.
      const coil = (amp, q) => { let len = 0, prev = tip;
        for (let i = 1; i <= NB; i++) { const u = i / NB, x0 = base[i], tg = norm(add(base[Math.min(NB, i + 1)], base[i - 1], -1)), out = norm(add(x0, ctr, -1));
          const sd = norm(cross(tg, out)), a = amp * Math.sin(PI * u), ph = TAU * 3 * u + k;
          const x = add(add(x0, out, a * (0.5 - 0.5 * Math.cos(ph))), sd, a * 0.5 * Math.sin(ph));
          len += Math.hypot(x[0] - prev[0], x[1] - prev[1], x[2] - prev[2]); prev = x; if (q) q.push(x); }
        return len; };
      let lo = 0, hi = 12; if (taut < TETHER.link) for (let it = 0; it < 22; it++) { const mid = (lo + hi) / 2; if (coil(mid) < TETHER.link) lo = mid; else hi = mid; }
      const pts = []; coil(lo, pts);
      for (const x of pts) ball(x, 0.32, c);
      this.tetherEnds.push({ tip, end: pts[NB - 1], site, held: p < 0 ? dr.held[k] : p < PH.STALK });
      if (k === 0) anchors.tether = tip;
    });

    // Calcium is flowing in by CA_IN and has bound synaptotagmin by CA_BOUND.
    const wCa = sstep(CA_IN, CA_BOUND, p);
    // The rest of the coat rides on the vesicle. Once the neck is wide enough for a protein, it spreads into the cell
    // membrane by its own random motion, far more slowly than the lipids around it.
    OWN = S.fused[0] ? 0 : 1;      // the coat rides on the vesicle
    this.coat.forEach((pr) => {
      const site = freeSite(S, pr, p, gate[pr.kind]), A = at(0, site[0], site[1]);
      if (!kept(A.p[0], A.p[2])) return;
      const nrm = A.n, t0 = norm(cross(nrm, Math.abs(nrm[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0])), t1 = cross(nrm, t0);
      const cr = Math.cos(pr.rot), sr = Math.sin(pr.rot), e1 = add(shade(t0, cr), t1, sr), e2 = add(shade(t0, -sr), t1, cr);
      const P = (a, b, h) => add(add(add(A.p, e1, a), e2, b), nrm, h);      // a, b across the membrane, h out of it
      if (pr.kind === 'physin') {
        // Synaptophysin: four helices through the membrane and a low cap on the cytoplasmic side.
        CAT = 16; const c = C.physin;
        for (const s of [-0.75, 0.75]) for (let h = -3.6; h <= 0.2; h += 0.95) ball(P(s, s * 0.4, h), 0.62, shade(c, 0.8));
        ball(P(0, 0, 0.9), 1.0, c);
      } else if (pr.kind === 'vglut') {
        // The glutamate transporter: a twelve-helix barrel, almost all of it inside the membrane.
        CAT = 17; const c = C.vglut;
        for (const h of [-3.3, -1.9, -0.5]) for (const s of [-0.9, 0.9]) ball(P(s, 0, h), 1.15, shade(c, 0.85));
        ball(P(0, 0, 0.8), 1.2, c);
      } else if (pr.kind === 'rab') {
        // Rab3: a small switch protein held to the surface by two lipid tails.
        CAT = 18; const c = C.rab;
        ball(P(0, 0, 0.5), 0.34, shade(c, 0.8)); ball(P(0.2, 0, 1.3), 0.34, shade(c, 0.8)); ball(P(0.4, 0, 2.9), 1.5, c);
      } else if (pr.kind === 'syt') {
        // A synaptotagmin away from the fusion site. Its two C2 domains stand clear of the vesicle; calcium binds them too.
        CAT = 6; const c = C.synaptotagmin, a = P(-1.2, 0, 2.9), b = P(1.4, 0, 5.2);
        for (let t = 0.5; t <= 2 * D + 0.3; t += 0.55) ball(P(0, 0, -t), 0.55, shade(c, 0.8));
        strand(A.p, a, 4, 0.33, shade(c, 0.9)); strand(a, b, 3, 0.33, shade(c, 0.9));
        for (const q of [a, b]) for (const [x, y, z] of [[0.8, 0.5, 0], [-0.8, 0.5, 0], [0, -0.6, 0.8], [0, -0.6, -0.8]]) ball(add(add(add(q, e1, x), nrm, y), e2, z), 1.25, c);
        if (wCa > 0.5) for (const o of [[0.9, 1.1, 0.4], [-0.7, 1.2, -0.5], [0.1, 1.3, -0.9]]) ball(add(add(add(b, e1, o[0]), nrm, o[1]), e2, o[2]), 0.3 * wCa, C.calcium, 1, 8);
      } else {
        // The proton pump (V-ATPase): a ring in the membrane, a stalk, and a head ten nanometres
        // across that stands well clear of everything else on the vesicle.
        CAT = 15; const c = C.pump;
        for (let k = 0; k < 8; k++) for (const h of [-3.0, -1.2]) ball(P(2.3 * Math.cos(k * PI / 4), 2.3 * Math.sin(k * PI / 4), h), 1.0, shade(c, 0.78));
        for (let h = 0.4; h <= 5.2; h += 1.2) ball(P(0, 0, h), 1.15, shade(c, 0.9));
        for (let k = 0; k < 6; k++) { ball(P(2.9 * Math.cos(k * PI / 3), 2.9 * Math.sin(k * PI / 3), 8.3), 2.3, shade(c, k % 2 ? 1.0 : 0.88)); ball(P(2.5 * Math.cos(k * PI / 3 + 0.5), 2.5 * Math.sin(k * PI / 3 + 0.5), 11.0), 2.0, shade(c, k % 2 ? 0.9 : 1.0)); }
        ball(P(0, 0, 9.6), 2.4, c);
        for (const s of [-1, 1]) for (let h = 1.0; h <= 8.0; h += 1.4) ball(P(4.6 * s, 0.6, h), 0.5, shade(c, 0.75));
        anchors.pump = P(0, 0, 12.5);
      }
    });
    OWN = 0;

    // The synaptobrevins that are not in a SNARE complex ride on the vesicle too. On the microscope some carry the tag.
    CAT = 5; OWN = 1;
    this.free.forEach((fr) => {
      const site = freeSite(S, fr, p, gate.free), A = at(0, roomy(S, site[0], site[1], tmp), site[1]), draw = kept(A.p[0], A.p[2]);
      if (draw) {
        const t0 = norm(cross(A.n, Math.abs(A.n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0])), lean = add(shade(t0, Math.sin(fr.rot)), cross(A.n, t0), Math.cos(fr.rot));
        for (let t = 0.5; t <= 2 * D + 0.3; t += 0.55) ball(add(A.p, A.n, -t), 0.55, shade(C.synaptobrevin, 0.82));
        for (let t = 0.6; t < 3.4; t += 0.62) ball(add(add(A.p, A.n, t), lean, t * 0.3), 0.36, C.synaptobrevin);
      }
      if (!vitro || !fr.tagged) return;
      const c = tag(A, draw);
      if (draw && !anchors.phl) anchors.phl = c;
    });
    OWN = 0; CAT = 0;
    if (vitro) {
      // Fluorescence leaves in every direction; the objective below catches about half of it.
      // Every other one of these is a 589 nm photon from the orange protein, which starts before the pore opens.
      const hash = (n) => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); };
      const lits = [this.emit.filter((e) => e[2] > 0.12), this.emit.filter((e) => e[4] > 0.12)];
      for (let j = 0; j < 80; j++) {
        const o = j & 1, lit = lits[o]; if (!lit.length) continue;
        const cyc = time * 0.5 + j * 0.6180339, ph = cyc % 1, id = Math.abs(Math.floor(cyc)) * 131 + j * 17, e = lit[id % lit.length];
        const dy = 1 - 2 * hash(id + 0.3), a = hash(id + 0.7) * TAU, dr = Math.sqrt(1 - dy * dy), L = 170 * ph;
        ball([e[0] + dr * Math.cos(a) * L, e[3] + dy * L, e[1] + dr * Math.sin(a) * L], 0.62 * (1 - ph) * Math.min(1, e[o ? 4 : 2] * 1.6), o ? C.emissionO : C.emission, 1, o ? 21 : 12);
      }
      this.fluor = this.emit.reduce((t, e) => t + e[2], 0) / COPIES.tagged; this.fluorO = this.emit.reduce((t, e) => t + e[4], 0) / COPIES.tagged;
      if (st.dist > 4000) ball([0, -6, 0], 0.005 * st.dist, add(shade(C.emission, Math.min(1, 0.08 + this.fluor * 1.6)), C.emissionO, Math.min(1, this.fluorO * 1.6)), 1, 12);
      // The laser footprint covers the whole cell, so every vesicle near the glass is in the
      // picture: most sit docked and dark, and some fuse a little before or after ours.
      this.emitN = [];
      let near = null;
      const now = clock(p);
      for (const nb of this.neigh) {
        // Every vesicle in the field is on the same clock: this one's pore opened nb.t ms after ours (or before).
        const since = nb.t === null ? -1 : now - nb.t, pc = nb.t === null ? 0 : unclock(since);
        const u = sstep(PH.PORE, PH.PORE + 0.04, pc), sink = sstep(PH.PORE, 0.72, pc);
        const h = GAP + lerp(nb.rad + D + 3.5, -5, sink);
        const spread = spreadAfter(since, Math.round(nb.rad - 2));
        const lit = 36 * opt.at(h) * spot(nb.x, nb.z) * nb.k, amp = lit * (QUENCH + (1 - QUENCH) * u), ampO = lit * (QUENCH_O + (1 - QUENCH_O) * u);
        this.emitN.push([nb.x, nb.z, amp, spread, ampO]);
        if (pc < 0.72) ball([nb.x, (nb.rad + D + 3.5) * (1 - sink), nb.z], nb.rad * (1 - 0.55 * sstep(0.5, 0.72, pc)), [0.86, 0.62, 0.30], 2, 1);
        const thin = 55 * 55 / (55 * 55 + spread * spread) / 36, glow = amp * thin, glowO = ampO * thin;
        // A soft glow on each side of the membrane, so a flash shows from inside the cell and from under the glass.
        // A vesicle that has not fused glows faintly in orange alone.
        if (glow + glowO > 0.03) for (const y of [9, -9]) ball([nb.x, y, nb.z], (30 + spread) * 0.5, add(shade(C.phluorin, Math.min(1.3, glow * 2.2)), C.ofp, Math.min(1.0, glowO * 1.5)), 4, 13);
        if (nb.t !== null && Math.abs(pc - 0.5) < 0.45 && (!near || Math.hypot(nb.x, nb.z) < Math.hypot(near[0], near[2]))) near = [nb.x, 30, nb.z];
      }
      anchors.neigh = near;
    }

    // Synaptotagmin, the calcium sensor: anchored in the vesicle, with two C2 domains that
    // plunge into the plasma membrane when calcium binds. These six are at the fusion site. Each is part of the
    // vesicle: it goes where the vesicle goes, and after fusion it spreads like the other proteins.
    CAT = 6;
    const wDock = wCa * (1 - sstep(0.42, 0.62, p));
    this.sytPos = [];
    this.syts.forEach((sy) => {
      const uv = Math.sqrt(Av / PI), st2 = Math.min(13, uv * 0.6), u0 = Math.sqrt(uv * uv - st2 * st2), sg = proteinSpread(p, R, gate.syt);
      const ux = u0 * Math.cos(sy.phi) + sg * sy.g1, uz = u0 * Math.sin(sy.phi) + sg * sy.g2, phi = sg > 0 ? Math.atan2(uz, ux) : sy.phi;
      const T = at(0, PI * (ux * ux + uz * uz), phi);
      if (!kept(T.p[0], T.p[2])) return;
      OWN = S.fused[0] ? 0 : 1;
      const er = [Math.cos(phi), 0, Math.sin(phi)], et = [-Math.sin(phi), 0, Math.cos(phi)];
      const rT = Math.hypot(T.p[0], T.p[2]);
      const pm = [T.p[0] / Math.max(rT, 1e-3) * (rT + 1), D + 1.9, T.p[2] / Math.max(rT, 1e-3) * (rT + 1)];
      const c2b = mixv(add(add(T.p, T.n, 5.2), et, 1.4), pm, wDock);
      const c2a = mixv(add(add(T.p, T.n, 2.9), et, -1.2), add(mixv(add(T.p, T.n, 2.6), c2b, 0.5), et, -2.6), wDock);
      const c = C.synaptotagmin;
      for (let t = 0.5; t <= 2 * D + 0.3; t += 0.55) ball(add(T.p, T.n, -t), 0.55, shade(c, 0.8));
      strand(T.p, c2a, 4, 0.33, shade(c, 0.9)); strand(c2a, c2b, 3, 0.33, shade(c, 0.9));
      for (const q of [c2a, c2b]) for (const [a, b, e] of [[0.8, 0.5, 0], [-0.8, 0.5, 0], [0, -0.6, 0.8], [0, -0.6, -0.8]]) ball(add(add(add(q, er, a), [0, 1, 0], b), et, e), 1.25, c);
      if (wCa > 0.5) for (const o of [[0.9, -1.1, 0.4], [-0.7, -1.2, -0.5], [0.1, -1.3, -0.9]]) ball(add(c2b, o), 0.3 * wCa, C.calcium, 1, 8);
      OWN = 0;
      this.sytPos.push(c2b);
      if (!anchors.syt) anchors.syt = vx(c2b);
    });

    // Voltage-gated calcium channels, and the calcium that rushes in when one opens.
    CAT = 0;
    // The channels open at PH.CA, when the nerve impulse arrives, and not before.
    const caFlow = sstep(PH.CA, CA_IN, p) * (1 - sstep(0.2, 0.3, p));
    this.channels.forEach((ch, ci) => {
      const A = at(0, Av + PI * ch.r * ch.r, ch.phi);
      if (!kept(A.p[0], A.p[2])) return;
      const er = [Math.cos(ch.phi), 0, Math.sin(ch.phi)], et = [-Math.sin(ch.phi), 0, Math.cos(ch.phi)];
      const mid = [A.p[0], 0, A.p[2]];
      for (let k = 0; k < 4; k++) {
        const a = k * PI / 2 + 0.4, o = add(add(mid, er, 2.1 * Math.cos(a)), et, 2.1 * Math.sin(a));
        for (const y of [-3.4, -1.2, 1.2, 3.6]) ball(add(o, [0, 1, 0], y), 1.75, shade(C.channel, y > 2 ? 0.85 : 1));
      }
      ball(add(add(mid, er, 2.6), [0, 1, 0], -6.4), 2.5, shade(C.channel, 0.78));
      ball(add(add(mid, et, -2.4), [0, 1, 0], 5.6), 1.9, shade(C.channel, 0.7));
      if (ci === 0) anchors.channel = add(mid, [0, 1, 0], 6);
      if (caFlow > 0.01) {
        const tgt = this.sytPos[ci % Math.max(1, this.sytPos.length)] || [0, 6, 0];
        for (let j = 0; j < 46; j++) {
          if ((j * 0.618) % 1 > caFlow) continue;
          const ph = (time * 0.34 + j * 0.3819 + ci * 0.21) % 1, wob = j * 12.9898;
          const jx = Math.sin(wob) * 0.5, jz = Math.cos(wob * 1.7) * 0.5;
          let q;
          if (ph < 0.4) q = add(mid, [jx, lerp(-11, 5, ph / 0.4), jz]);
          else { const u = (ph - 0.4) / 0.6; q = mixv(add(mid, [jx, 5, jz]), add(tgt, [Math.sin(wob * 2.3) * 7, Math.cos(wob * 3.1) * 4 + 3, Math.cos(wob * 2.9) * 7]), Math.sqrt(u)); }
          ball(q, 0.34 * (1 - Math.pow(ph, 4)), C.calcium, 1, 8);
        }
      }
    });

    // Adhesion molecules stitch the two cells together and set the width of the cleft.
    const AvT = S.Av[1];
    if (!vitro) this.links.forEach((ln) => {
      const top = at(1, AvT + PI * ln.r * ln.r, ln.a).p;
      if (!kept(top[0], top[2]) || Math.hypot(top[0], top[2]) > PATCH - 8) return;
      const bot = [top[0], -CLEFT + D, top[2]];
      for (let i = 0; i <= 15; i++) {
        const u = i / 15, q = mixv(top, bot, u), big = (i === 4 || i === 5 || i === 10 || i === 11);
        q[0] += Math.sin(u * PI) * ln.bend + Math.sin(time * 0.8 + ln.ph + u * 4) * 0.25;
        ball(q, big ? 1.25 : 0.72, shade(C.adhesion, big ? 1.05 : 0.85));
      }
    });

    // Glutamate receptors in the receiving cell. A receptor has glutamate from the moment the last of the drawn
    // molecules that bind it arrives (the same molecules, from the same formula, that the shader stops at its sites).
    // An AMPA receptor then opens and passes sodium, and lets its glutamate go at T_UNBIND. An NMDA receptor keeps
    // its glutamate; it is drawn shut, because at rest its channel is blocked.
    const yTop = -CLEFT + D, KIN = kinetics(R);
    let nearest = null;
    if (!vitro) this.receptors.forEach((rc, ri) => {
      rc.since = Math.max(...rc.bound.map((b) => arrivalTime(KIN, b.e, b.g, b.r)));
      if (!kept(rc.x, rc.z)) return;
      const has = rc.has = p > PH.PORE ? sstep(0, 0.03, p - unclock(rc.since)) * (rc.nmda ? 1 : 1 - sstep(-0.03, 0, p - unclock(T_UNBIND))) : 0, open = rc.nmda ? 0 : has;
      CAT = rc.nmda ? 10 : 9;
      const base = rc.nmda ? C.nmda : C.ampa, lit = mixv(base, [1, 1, 0.9], 0.3 * has), k = rc.nmda ? 1.12 : 1;
      for (let j = 0; j < 4; j++) {
        const a = rc.rot + j * PI / 2, cx = Math.cos(a), sz = Math.sin(a), pair = (j % 2 ? 1 : -1) * 0.5;
        const px = (rr, y, sq) => [rc.x + rr * cx * k + sq * -sz * pair, y, rc.z + rr * sz * k + sq * cx * pair];
        ball(px(1.5, yTop - D - 2.6, 0), 1.5, shade(base, 0.62));
        ball(px(1.6 - 0.25 * open, yTop - D, 0), 1.55, shade(base, 0.8));
        ball(px(1.7 + 0.5 * open, yTop + 1.0, 0), 1.3, shade(base, 0.9));
        ball(px(2.3, yTop + 3.9, 1.0), 1.85, lit);
        ball(px(2.5, yTop + 8.4 * k, 2.2), 2.0, shade(base, 1.05));
      }
      if (open > 0.3) for (let j = 0; j < 5; j++) {
        const ph = (time * 0.55 + j * 0.2 + ri * 0.137) % 1, y = lerp(yTop + 7, -CLEFT - 16, ph), sp = y < -CLEFT - D ? (-CLEFT - D - y) * 0.22 : 0.15;
        ball([rc.x + Math.sin(j * 7.1 + ri) * sp, y, rc.z + Math.cos(j * 5.3 + ri) * sp], 0.3 * open * (1 - ph * ph), C.sodium, 1, 0);
      }
      const score = Math.hypot(rc.x + 22, rc.z + 12);
      if (!rc.nmda && (!nearest || score < nearest.s)) nearest = { s: score, q: [rc.x, yTop + 10, rc.z] };
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn.b);
    gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, n * 8), gl.DYNAMIC_DRAW);
    this.dyn.n = n;

    // Where the on-screen labels point.
    const top = S.hV + S.Rc + D, face = CUT_CENTRE + half + 0.25, fx = Math.cos(face), fz = Math.sin(face);
    const here = [
      { id: 'vesicle', q: p < 0.8 ? [0, Math.min(top, S.hV + S.Rc + D), 0] : null },
      { id: 'stalk', q: p >= PH.STALK - 0.02 && p < PH.PORE ? [0, S.rho, 0] : null },
      { id: 'pore', q: p >= PH.PORE && p < 0.66 ? [0, S.rho, 0] : null },
      { id: 'glutamate', q: released(p, R) < 0.5 ? (cut > 25 ? vx([-S.Rin * 0.45, S.hV + S.Rin * 0.2, 0]) : null) : p < 0.74 ? [-14 - 30 * sstep(0.5, 0.7, p), -CLEFT / 2, -6] : null },
      { id: 'tether', q: p < PH.CA ? anchors.tether : null }, { id: 'pump', q: p < PH.OMEGA ? anchors.pump : null }, { id: 'snare', q: anchors.snare }, { id: 'syt', q: p < 0.62 ? anchors.syt : null }, { id: 'channel', q: anchors.channel },
    ];
    const cellSide = [{ id: 'reserve', q: this.reserve }, { id: 'mito', q: this.mito }];
    if (!vitro) this.labels = [...here,
      { id: 'receptor', q: nearest && nearest.q },
      { id: 'pre', q: [fx * 84, D, fz * 84] }, { id: 'cleft', q: [fx * 62, -CLEFT / 2, fz * 62] }, { id: 'post', q: [fx * 96, -CLEFT - D, fz * 96] },
      { id: 'psd', q: [fx * 30, -CLEFT - 16, fz * 30] }, ...cellSide];
    else {
      const x2 = F_OBJ * N_GLASS * Math.sin(opt.th), far = (id, q, min, max) => ({ id, q, min, max: max || 1e12, free: true });
      this.labels = [...here,
        { id: 'phl', q: anchors.phl, max: 1500 },
        { id: 'field', q: [fx * 46, GLASS_TOP + (opt.tir ? Math.min(opt.depth, 150) : 60), fz * 46], max: 3000 },
        ...(st.irm ? [{ id: 'fringe', q: [fx * 118, GLASS_TOP + this.irmAt(st.lambda).bright, fz * 118], max: 3000 }] : []),
        { id: 'membrane', q: [fx * 84, D, fz * 84] }, { id: 'gap', q: [fx * 66, -GAP / 2, fz * 66] },
        { id: 'glass', q: [fx * 100, GLASS_TOP, fz * 100], max: 3e4, free: true }, ...cellSide,
        { id: 'neigh', q: anchors.neigh, min: 700, max: 4e4, free: true }, far('spot', [9000, GLASS_TOP, 6500], 6e3, 3e5),
        far('cell', [CELL.x + 6000, 4200, CELL.z], 9e3, 6e5), far('coverslip', [6 * MM, GLASS_BOT / 2, 0], 1.5e5, 4e7),
        far('oil', [2.9 * MM, (GLASS_BOT + LENS_Y) / 2, 0], 6e5, 4e7), far('objective', [12.6 * MM, LENS_Y - 18 * MM, 0], 4e6),
        far('laser', [-x2, LENS_Y - 34 * MM, 0], 4e6), far('emission', [0, LENS_Y - 56 * MM, 0], 4e6),
        far('medium', [-9 * MM, 3.6 * MM, 0], 8e6), far('dish', [17.5 * MM, 7 * MM, 0], 8e6),
      ];
      this.labelText = {
        phl: unq > 0.5 ? 'Tag: both proteins lit' : 'Tag: pHluorin dark at pH 5.5, orange protein half lit',
        field: opt.tir ? `Evanescent field, 1/e at ${Math.round(opt.depth)} nm` : 'Refracted beam, no evanescent field',
      };
      if (st.irm) { const io = this.irmAt(st.lambda); this.labelText.fringe = `Reflection: brightest at ${Math.round(io.bright)} nm, darkest at ${Math.round(io.dark)} nm`; }
    }
    this.gapBottom = vitro ? -GAP + 1.4 : -CLEFT + D + 1.4;
    this.vitro = vitro; this.belief = st.belief || null;
    if (this.belief) this.labels.push({ id: 'ghost', q: [-(Math.min(S.Rc, 60) + D + 4) * 0.72, Math.max(6, Math.min(top * 0.72, 70)), 0], max: 2500, free: true });
    this.focusY = Math.max(-3, Math.min(13, 0.3 * (top - S.approach) - 2)) + 0.45 * S.approach;   // follow the vesicle part of the way up while it arrives
    this.kept = kept;
  }

  // The reflection camera's optics for a wavelength (the level lines do not depend on its focus).
  irmAt(lambda) { return this._io && this._io.lambda === lambda ? this._io : (this._io = irmOptics(lambda)); }

  // The cutaway is a close-up device; it closes as the camera pulls back to cell scale.
  cutNow(st) { return st.cut * (1 - sstep(3.4, 3.9, Math.log10(st.dist))); }

  // Rough line-of-sight test for labels: is q hidden behind a membrane or the vesicle?
  visible(q, eye) {
    const S = this.S, d = [q[0] - eye[0], q[1] - eye[1], q[2] - eye[2]];
    const blocked = (t) => t > 0.02 && t < 0.97 && this.kept(eye[0] + d[0] * t, eye[2] + d[2] * t);
    for (const y of this.vitro ? [0] : [0, -CLEFT]) if (Math.abs(d[1]) > 1e-6 && blocked((y - eye[1]) / d[1])) {
      const t = (y - eye[1]) / d[1];
      if (y < 0 || Math.hypot(eye[0] + d[0] * t, eye[2] + d[2] * t) > S.Rc * 0.9 || S.p < PH.DILATE) return false;
    }
    if (S.p < 0.74) {
      const o = [eye[0], eye[1] - S.hV, eye[2]], R = S.Rc + D;
      const a = d[0] * d[0] + d[1] * d[1] + d[2] * d[2], b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2], c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - R * R;
      const disc = b * b - a * c;
      if (disc > 0) { const sq = Math.sqrt(disc); if (blocked((-b - sq) / a) || blocked((-b + sq) / a)) return false; }
    }
    return true;
  }

  // ---- drawing ---------------------------------------------------------------------------------
  draw(cam, st, time) {
    const gl = this.gl, S = this.S, P = this.P, C = COLORS;
    const vitro = !!st.vitro, opt = this.opt, lg = Math.log10(cam.dist), nano = cam.dist < 2e4, cut = this.cutNow(st);
    const common = (pr) => {
      gl.useProgram(pr.p); const u = pr.u;
      gl.uniformMatrix4fv(u.uView, false, cam.view); gl.uniformMatrix4fv(u.uProj, false, cam.proj);
      gl.uniform3fv(u.uCamPos, cam.eye); gl.uniform3fv(u.uCamR, cam.basis.r); gl.uniform3fv(u.uCamU, cam.basis.u); gl.uniform3fv(u.uCamF, cam.basis.f);
      gl.uniform4f(u.uLens, cam.proj[0], cam.proj[5], cam.ox, cam.oy);
      gl.uniform2f(u.uViewport, cam.w, cam.h);
      gl.uniform4f(u.uFog, cam.dist * 0.9, 150 + cam.dist * 0.9, 45 + 0.45 * cam.dist, 190 + 1.5 * cam.dist);
      gl.uniform3fv(u.uFocus, cam.target); gl.uniform2f(u.uCut, CUT_CENTRE, cut * PI / 360);
      gl.uniform1f(u.uTime, time);
      if (vitro) gl.uniform4f(u.uTIR, GLASS_TOP, opt.tir ? 1 / opt.depth : 0, opt.I0 / 4, SPOT); else gl.uniform4f(u.uTIR, 0, 0, 0, 0);
      gl.uniform2f(u.uMode, vitro ? 1 : 0, sstep(3.6, 4.5, lg));
      gl.uniform1f(u.uHi, st.hi || 0);
      return u;
    };
    gl.viewport(0, 0, cam.w, cam.h);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    common(P.sky); gl.bindVertexArray(this.emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (vitro) {
      const g = common(P.glow);
      gl.uniform3f(g.uGlow, 3 * cam.dist + 800, 500 + cam.dist * 1.2, 0.17 * (1 - sstep(3.6, 4.3, lg)));
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.disable(gl.BLEND);
    }
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT);

    // Distant membranes.
    let u = common(P.sheet);
    gl.uniform1f(u.uGrain, this.spacing * 1.4);
    gl.bindVertexArray(this.sheetVAO);
    for (const [y, c] of [[D, C.plasma], [-D, C.plasmaOut], [-CLEFT + D, C.post], [-CLEFT - D, C.postIn]].slice(0, vitro ? 2 : 4)) {
      gl.uniform1f(u.uY, y); gl.uniform3fv(u.uSheetCol, c); gl.uniform4f(u.uFoot, CELL.x, CELL.z, vitro ? CELL.r * 0.985 : 0, y > -CLEFT / 2 ? 2 : 0); gl.drawArrays(gl.TRIANGLES, 0, this.sheetN);
    }

    gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    // Lipids.
    // How far a lipid has got by random motion since its leaflet joined the other membrane's (kinetics.js), and how
    // far the cell membrane's own pattern is turned so that it carries on from the vesicle's (see sheetLipids).
    const sig = [0, 1].map((leaf) => lipidSpread(S.p, S.R, leaf)), seam = [0, 1].map((leaf) => seamTurn(S.R, leaf, this.q));
    const lipidU = (pr) => {
      const v = common(pr);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tabTex); gl.uniform1i(v.uTab, 0);
      gl.uniform2f(v.uAv, S.Av[0], S.Av[1]); gl.uniform2f(v.uRW, S.rW[0], S.rW[1]);
      gl.uniform2f(v.uSigma, sig[0], sig[1]); gl.uniform2f(v.uSeam, seam[0], seam[1]);
      gl.uniform4f(v.uGeo, D, CLEFT, BAREA, PATCH);
      gl.uniform4f(v.uVes, this.vesMove.off[0], S.hV, this.vesMove.off[2], 0); gl.uniformMatrix3fv(v.uVesRot, true, this.vesMove.M);
      gl.uniform3fv(v.uCol, [...C.vesicle, ...C.vesicleIn, ...C.plasma, ...C.plasmaOut, ...C.post, ...C.postIn]);
      gl.uniform1f(v.uHeadR, this.headR);
      return v;
    };
    const both = () => { for (const b of [this.ves, this.sheetLipids]) { gl.bindVertexArray(b.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, vitro && b === this.sheetLipids ? this.nPM : b.n); } };
    if (nano) { lipidU(P.head); both(); }
    if (nano && cut > 1) { u = lipidU(P.tail); gl.uniform1f(u.uBand, Math.max(2.0, this.spacing * 1.9)); both(); }

    // Proteins and scenery.
    u = common(P.ball);
    gl.uniform3f(u.uBall, 1, 0, 0); gl.bindVertexArray(this.dyn.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.dyn.n);
    gl.uniform3f(u.uBall, 1, 1, 1); gl.bindVertexArray(this.scenery.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, cam.dist > 1e5 ? 0 : vitro ? this.sceneryCell : this.scenery.n);

    // Transmitter.
    const full = this.glutamate, shown = Math.min(NT_MAX, Math.round(full * (this.q < 0.6 ? 0.55 : 1)));
    const grow = Math.min(1.7, Math.cbrt(full / Math.max(1, shown)));
    const KIN = kinetics(S.R), lumenR = S.Rin - 0.6;
    const ntU = (pr, scale) => {
      const v = common(pr);
      gl.uniform4f(v.uNT, S.p > PH.PORE ? clock(S.p) : -1, S.hV, lumenR, S.rho);
      gl.uniform4f(v.uVes, this.vesMove.off[0], S.hV, this.vesMove.off[2], 0); gl.uniformMatrix3fv(v.uVesRot, true, this.vesMove.M);
      gl.uniform4f(v.uNT2, Math.max(0.15, S.neck - D - 0.6), -D - 1.4, this.gapBottom, 0.36);
      gl.uniform4f(v.uNT3, scale, PORE_T, 2 * D_GLU, vitro ? -1 : T_UNBIND);
      gl.uniform1fv(v.uRel, KIN.rel);
      gl.uniform3fv(v.uNTCol, C.glutamate);
      return v;
    };
    ntU(P.nt, grow); gl.bindVertexArray(this.nt.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nano ? shown : 0);
    const mesh = (m, alpha, shiny, glow = 0) => { gl.uniform3f(P.mesh.u.uMesh, alpha, shiny, glow); gl.bindVertexArray(m.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, m.n, m.inst); };
    if (vitro) {
      // Solid parts of the bench: the objective, and the nuclei of the cells in the dish.
      u = common(P.ball); gl.uniform3f(u.uBall, 1, 0, 0);
      gl.bindVertexArray(this.cellStuff.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, cam.dist > 2e5 ? 0 : this.cellStuff.n);
      gl.bindVertexArray(this.nuclei.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, cam.dist > 3000 ? this.nuclei.n : 0);
      u = common(P.mesh); mesh(this.bench.objective, 1, 0.7);
    }
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);

    // Glow.
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
    u = ntU(P.ntHalo, grow * 3.4); gl.uniform1f(u.uGlow, 0.30); gl.bindVertexArray(this.nt.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nano ? shown : 0);
    u = common(P.ballHalo); gl.uniform3f(u.uBall, 4.2, 0, 0); gl.uniform1f(u.uGlow, 0.55);
    gl.bindVertexArray(this.dyn.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.dyn.n);
    if (vitro) this.drawBench(cam, st, common, mesh);
    if (this.belief && cam.dist < 6000) this.drawBelief(common);
    gl.disable(gl.BLEND); gl.depthMask(true); gl.bindVertexArray(null);
  }

  // Everything see-through or glowing in the in vitro set-up, drawn after the solid scene.
  drawBench(cam, st, common, mesh) {
    const gl = this.gl, P = this.P, B = this.bench, opt = this.opt, lg = Math.log10(cam.dist);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);           // premultiplied, so tint and glow share one pass
    const glassTop = () => {
      const u = common(P.field), H = Math.min(1.1e7, 40 * cam.dist + 2000);
      gl.uniform4f(u.uWave, opt.kx, opt.ky, opt.kyMed, opt.delta);
      gl.uniform4f(u.uWave2, opt.r, 0, 1, 1 + 1.1 * sstep(3.2, 4.1, lg));
      const io = st.irm ? this.irmAt(st.lambda) : null, col = io ? hue(io.lambda) : [0, 0, 0];
      gl.uniform4f(u.uIrm, io ? io.kz : 0, io ? io.psi0 : 0, io ? 1 : 0, GAP); gl.uniform3f(u.uIrmCol, col[0], col[1] + 0.12, col[2] + 0.12);
      gl.uniform3f(u.uO, -H, GLASS_TOP, -H); gl.uniform3f(u.uA, 2 * H, 0, 0); gl.uniform3f(u.uB, 0, 0, 2 * H);
      gl.bindVertexArray(this.emptyVAO); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      // The same field in cross-section, painted on the two faces of the cutaway.
      const k = 1 - sstep(3.3, 3.9, lg);
      const cut = this.cutNow(st);
      if (cut > 1 && k > 0) {
        gl.uniform4f(u.uWave2, opt.r, 1, k, 0);
        const y0 = GLASS_TOP - 0.9 * cam.dist - 80, y1 = GLASS_TOP + 1.3 * cam.dist + 120;
        for (const sgn of [-1, 1]) {
          const a = CUT_CENTRE + sgn * cut * PI / 360, len = 2.4 * cam.dist + 200;
          gl.uniform3f(u.uO, 0, y0, 0); gl.uniform3f(u.uA, Math.cos(a) * len, 0, Math.sin(a) * len); gl.uniform3f(u.uB, 0, y1 - y0, 0);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
      }
    };
    const layers = [
      () => { common(P.mesh); mesh(B.oil, 1, 0.2); mesh(B.coverslip, 1, 0.12); },
      glassTop,
      () => { common(P.mesh); mesh(B.cells, sstep(3.3, 4.0, lg), 0.15); },
      () => { common(P.mesh); mesh(B.medium, 1, 0.12); mesh(B.dish, 1, 0.3); },
    ];
    if (cam.eye[1] < GLASS_TOP) layers.reverse();
    for (const f of layers) f();
    // Light paths, drawn through everything so they can be followed inside the objective.
    gl.disable(gl.DEPTH_TEST); gl.blendFunc(gl.ONE, gl.ONE);
    const fade = sstep(4.7, 5.4, lg);
    if (fade > 0) {
      const v = [];
      for (const sg of st.irm ? beamPath(opt).concat(irmBeam(st.lambda)) : beamPath(opt)) for (const [side, end] of [[-1, 0], [1, 0], [1, 1], [-1, 0], [1, 1], [-1, 1]]) v.push(...sg.a, ...sg.b, side, end, sg.w, sg.k, ...sg.c);
      const u = common(P.beam); gl.uniform1f(u.uBeam, 0.85 * fade);
      gl.bindVertexArray(this.beamVAO); gl.bindBuffer(gl.ARRAY_BUFFER, this.beamBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.DYNAMIC_DRAW); gl.drawArrays(gl.TRIANGLES, 0, v.length / 13);
    }
    const far = sstep(5.7, 6.5, lg);
    if (far > 0) { common(P.mesh); mesh(B.emission, 1, 0, (0.035 + 0.3 * Math.min(1, this.fluor)) * far); mesh(B.emissionO, 1, 0, 0.3 * Math.min(1, this.fluorO) * far); }
    gl.enable(gl.DEPTH_TEST);
  }

  // Inference view: where the membrane probably is. The gold band between the tallest and the
  // flattest plausible shapes holds 90% of the belief, its brighter core holds half, and the
  // line is the middle estimate. A thin band means the video has pinned the shape down.
  drawBelief(common) {
    const gl = this.gl, B = this.belief, tri = [], lin = [], AZ = 6, gold = [1.0, 0.78, 0.42], green = [0.35, 1.0, 0.45];
    const put = (arr, x, y, z, c, a) => arr.push(x, y, z, c[0], c[1], c[2], a);
    const planes = []; for (let k = 0; k < AZ; k++) { const az = CUT_CENTRE + PI / AZ + k * TAU / AZ; planes.push([Math.cos(az), Math.sin(az)]); }
    const O = (g) => outline(g.p, g.R);
    const band = (P, Q, a) => { for (const [cs, sn] of planes) for (let i = 0; i + 3 < P.length; i += 2) {
      const q = [[P[i], P[i + 1]], [P[i + 2], P[i + 3]], [Q[i + 2], Q[i + 3]], [Q[i], Q[i + 1]]];
      for (const k of [0, 1, 2, 0, 2, 3]) put(tri, q[k][0] * cs, q[k][1], q[k][0] * sn, gold, a);
    } };
    const edge = (P, a) => { for (const [cs, sn] of planes) for (let i = 0; i + 3 < P.length; i += 2) { put(lin, P[i] * cs, P[i + 1], P[i] * sn, gold, a); put(lin, P[i + 2] * cs, P[i + 3], P[i + 2] * sn, gold, a); } };
    const tall = O(B.tall), low = O(B.low);
    band(tall, low, 0.05); band(O(B.tall2), O(B.low2), 0.07);
    edge(tall, 0.22); edge(low, 0.22); edge(O(B.mid), 0.9);
    // How far the tags have probably spread: the same kind of band, as a ring on the membrane.
    const y = -D - 7, f = B.fused, ring = (r0, r1, a) => { for (let i = 0; i < 56; i++) {
      const a0 = i / 56 * TAU, a1 = (i + 1) / 56 * TAU, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const q = [[r0 * c0, r0 * s0], [r0 * c1, r0 * s1], [r1 * c1, r1 * s1], [r1 * c0, r1 * s0]];
      for (const k of [0, 1, 2, 0, 2, 3]) put(tri, q[k][0], y, q[k][1], green, a * f);
    } };
    if (f > 0.02) { ring(2 * B.sp[0], 2 * B.sp[4], 0.10); ring(2 * B.sp[1], 2 * B.sp[3], 0.14); }
    common(this.P.line);
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
    gl.bindVertexArray(this.lineVAO); gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tri), gl.DYNAMIC_DRAW); gl.drawArrays(gl.TRIANGLES, 0, tri.length / 7);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lin), gl.DYNAMIC_DRAW); gl.drawArrays(gl.LINES, 0, lin.length / 7);
    gl.enable(gl.DEPTH_TEST);
  }

  // Fluorescence at the fusion site across the whole event, for the camera's trace: at each of n moments, the light
  // of the same tags that the picture draws at that moment (taggedSites, tagAt), each weighted by how near the site
  // it is (TRACE_R). Where every tag is at each moment is cached until the vesicle size changes.
  fluorCurve(R, n = TRACE_N) {
    if (!this.curveCache || this.curveCache.R !== R || this.curveCache.n !== n) {
      const pts = [], tmp = new Float64Array(6), gate = gates(R); let tab = null;
      for (let i = 0; i < n; i++) {
        const p = -ARRIVE + (1 + ARRIVE) * i / (n - 1), S = compute(p, R, tab); tab = S.tab;
        S.hV = S.h + (S.fused[0] ? 0 : S.extra);
        const VM = vesPose(S, p);
        pts.push({ unq: sstep(PH.PORE, PH.PORE + 0.04, p), tags: taggedSites(S, p, gate, this.snares, this.free, tmp).map((A) => { const g = tagAt(A), c = carried(VM, g.c), c2 = carried(VM, g.c2); return [c[0], c[2], c[1], c2[1]]; }) });
      }
      this.curveCache = { R, n, pts };
    }
    // One curve per band: the same tags in the same light, each protein with its own answer to the acid.
    return [QUENCH, QUENCH_O].map((q, band) => this.curveCache.pts.map((pt) => pt.tags.reduce((t, s) => t + this.opt.at(s[2 + band] + GAP) * (q + (1 - q) * pt.unq) * traceWeight(s[0], s[1]), 0) / COPIES.tagged));
  }
}
