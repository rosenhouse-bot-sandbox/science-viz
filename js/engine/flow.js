// Engine: how the gas moves. Each dot of gas is followed from the intake pipe, through the intake valves, into
// the cylinder, through compression and the burn, out past the exhaust valves and down the exhaust pipe. No dot is
// made or lost on the way: the number of dots in the cylinder at each crank angle is the mass of gas the model
// (model.js) has there.
//
// How: while a valve is open, the gas under the cylinder head moves as a flow without swirl (a potential flow),
// worked out once on a grid of 1.75 mm cells: in through the open valves' gaps and spreading through the chamber,
// or the other way. Below the head the gas moves with the piston. While both valves are shut the gas is squeezed
// or let spread evenly. The dots are then moved along that flow, one degree of crankshaft at a time, and the
// path of each is kept, so the picture at any angle is the same however it was reached.
// The fuel does not come in with the air: its dots leave the injector's tip one after another while it sprays,
// fly out along the spray, slowing as they drag air with them, and from then on go where the gas goes. While the
// flame spreads, the gas it has burned is about three times hotter than the gas ahead of it at the same pressure,
// so it takes three times the room: the dots are moved out from the plug, so that the burned gas fills the flame's
// sphere and the unburned gas is squeezed into what is left (see expand).
// Not modeled: turbulence, the tumble and swirl of a real intake, and pressure waves in the pipes.
import * as M from './model.js?v=2b7405db';

const { clamp, mix, DECK, BORE, ROOF, ROOF_SLOPE, EVO, IVC, SPARK } = M;
export const FUEL_SHARE = 1 / 15;                                    // fuel to air, by mass
export const INJ = [-0.012, DECK + 0.0015, 0.0375];                  // the injector's tip (as in shaders.js)
const SPRAY_DIR = (() => { const l = Math.hypot(0.3, 0.62, 0.79); return [0.3 / l, -0.62 / l, -0.79 / l]; })();      // down, and in toward the cylinder's axis
const SPRAY_LEN = 0.062, SPRAY_K = 9, SPRAY_DEG = 30, SPRAY_SPREAD = 0.15;   // how far a drop could fly, m; the degrees in which its speed falls by e; how long it is followed as spray; the cone's spread
const SPRAY_V = (() => { const l = Math.hypot(SPRAY_DIR[1], SPRAY_DIR[2]); return [0, -SPRAY_DIR[2] / l, SPRAY_DIR[1] / l]; })(), SPRAY_U = [SPRAY_V[1] * SPRAY_DIR[2] - SPRAY_V[2] * SPRAY_DIR[1], SPRAY_V[2] * SPRAY_DIR[0] - SPRAY_V[0] * SPRAY_DIR[2], SPRAY_V[0] * SPRAY_DIR[1] - SPRAY_V[1] * SPRAY_DIR[0]];
// where a dot of fuel that left the tip at `t0` is, `t` degrees later, flying out along its own line in the cone (a, b in -1..1)
function sprayAt(t, a, b, top, out) {
  const s = SPRAY_LEN * (1 - Math.exp(-t / SPRAY_K)), u = SPRAY_U, v = SPRAY_V;
  for (let k = 0; k < 3; k++) out[k] = INJ[k] + s * (SPRAY_DIR[k] + SPRAY_SPREAD * (a * u[k] + b * v[k]));
  out[1] = Math.max(out[1], top + 0.0004);
}
// The burned gas's room: p (a point of the evenly spread gas) moved for a flame of radius Rf about the plug whose burned gas
// is E times thinner than the unburned. Near the top the chamber is a flat disc, so the gas is moved sideways: each line
// out from the cylinder's axis (where the plug is) at one height between piston and roof keeps its own gas, the burned
// part of it filling the line's stretch inside the flame and the rest squeezed into what is left.
const PY = M.PLUG_GAP[1];
export function expand(p, top, Rf, E) {
  const x = p[0], z = p[2], rho = Math.hypot(x, z); if (rho < 1e-7) return;
  const H0 = DECK + ROOF - top, sl = ROOF_SLOPE * Math.abs(z) / rho, h = (r) => H0 - sl * r;
  const eta = clamp((p[1] - top) / h(rho), 0, 1), d2 = (r) => r * r + (top + eta * h(r) - PY) ** 2, R2 = Rf * Rf;
  if (d2(0) >= R2 || d2(BORE) < R2) return;      // a line the flame has not reached, or has wholly crossed
  const W = (r) => H0 * r * r / 2 - sl * r * r * r / 3, WB = W(BORE);      // the gas between the axis and r
  let a = 0, b = BORE; for (let k = 0; k < 30; k++) { const m = (a + b) / 2; if (d2(m) < R2) a = m; else b = m; }
  const gb = W((a + b) / 2) / WB, f = W(rho) / WB, fb = gb / (E - gb * (E - 1)), all = fb * E + 1 - fb;
  const want = (f < fb ? f * E / all : (fb * E + f - fb) / all) * WB;
  a = 0; b = BORE; for (let k = 0; k < 34; k++) { const m = (a + b) / 2; if (W(m) < want) a = m; else b = m; }
  const r2 = (a + b) / 2; p[0] = x / rho * r2; p[2] = z / rho * r2; p[1] = top + eta * h(r2);
}
export const burnRoom = (phi) => (phi > SPARK && phi < M.FLAME_OUT ? { Rf: M.flameR(phi), E: M.tempBurned(phi) / M.tempUnburned(phi) } : null);
const AX = M.VALVE_AXIS, VS = M.VALVE_SEAT, VX = 0.0175;            // the valves sit 17.5 mm either side of the cylinder's middle
export const RP = 0.0102;                                            // radius of the gas drawn in a port, m
const P1 = [0, VS[1] + AX[1] * 0.022, VS[2] + AX[2] * 0.022], P0 = [0, VS[1] + AX[1] * 0.001, VS[2] + AX[2] * 0.001];
const P2 = [0, DECK + 0.050, 0.060], P3 = [0, DECK + 0.060, 0.20];   // the port's bend, and the end of the pipe (as in shaders.js)
const PIPE = (() => { const l = Math.hypot(P3[1] - P2[1], P3[2] - P2[2]); return [(P3[1] - P2[1]) / l, (P3[2] - P2[2]) / l]; })();
const JOIN = 0.09;                                                   // past here a cylinder's two ports are one pipe
const A_PIPE = Math.PI * RP * RP + 4 * RP * VX;
const YB = DECK - 0.007;                                             // the flow under the head is worked out above this height
const LIFT_D = 0.006, HEAD_R = 0.0149;                               // the valve as the grid has it: 6 mm open
const H = 0.00175, X0 = -25 * H, Z0 = -25 * H, NX = 50, NY = 46, NZ = 90, ZG = Z0 + NZ * H;   // the grid; past ZG the pipe's flow is even
export const Z_IN = 0.23, Z_END = 0.19;                             // a dot is followed from here in the intake pipe; the pipes are drawn to Z_END
export const SPACING = 0.0054;                                       // one dot for each cube of gas this wide, at the intake pipe's density
const LIFE = 4 * 720;                                                // a dot still inside after four cycles is let go

const roofAt = (z) => DECK + ROOF - ROOF_SLOPE * Math.abs(z);
const AREA = M.AREA, V_HEAD = AREA * (DECK - YB) + AREA * ROOF - ROOF_SLOPE * 4 * BORE ** 3 / 3;     // the chamber above YB
function seg(py, pz, a, b) { const ay = py - a[1], az = pz - a[2], by = b[1] - a[1], bz = b[2] - a[2], t = clamp((ay * by + az * bz) / (by * by + bz * bz), 0, 1); return Math.hypot(ay - by * t, az - bz * t); }
// Distance from the middle line of a port. z is folded: positive toward the port's own side.
function portDist(x, y, z) {
  const fx = z > JOIN ? Math.max(Math.abs(x) - VX, 0) : Math.abs(x) - VX;
  return Math.hypot(fx, Math.min(seg(y, z, P0, P1), seg(y, z, P1, P2), seg(y, z, P2, P3)));
}
// Negative inside the space the gas has: the chamber over a piston whose top is at `top`, and the four ports. The valves are left out.
export function spaceDist(x, y, z, top) {
  const ch = Math.max(Math.hypot(x, z) - BORE, top - y, (y - roofAt(z)) * 0.94);
  return Math.min(ch, portDist(x, y, z) - RP - 0.0006, portDist(x, y, -z) - RP - 0.0006);
}
export const inChamber = (x, y, z) => y < roofAt(z) + 1e-5 && x * x + z * z < BORE * BORE;

// While a valve is open the dots are moved in a copy of the chamber in which that valve is always 6 mm open (the
// grid's valve). `warp` takes a point of the copy to the real chamber, where the valve is open by `lift`: the layer of
// gas between the valve's head and its seat is thinned or thickened to the real gap, and the gas under the head is
// moved with the head, by less the nearer it is to the piston. `unwarp` goes back. z folded; `floor` is the piston's top.
const HB_D = -LIFT_D - 0.0012;
function warpT(t, lo, lift) {
  if (t >= 0 || t <= lo) return t;
  if (t >= -LIFT_D) return t * lift / LIFT_D;
  if (t >= HB_D) return t + LIFT_D - lift;
  return lo + (t - lo) * (-lift - 0.0012 - lo) / (HB_D - lo);
}
function warp(x, y, z, lift, floor, out, back = false) {
  out[0] = x; out[1] = y; out[2] = z;
  const qx = Math.abs(x) - VX, qy = y - VS[1], qz = z - VS[2], t = qy * AX[1] + qz * AX[2];
  const rad = Math.hypot(qx, qy - AX[1] * t, qz - AX[2] * t), wr = 1 - M.smooth(HEAD_R + 0.001, HEAD_R + 0.009, rad);
  if (wr <= 0 || t > 0.0001) return;
  const lo = Math.max(t - (y - floor) / AX[1], HB_D - 0.020);
  let tn;
  if (!back) tn = t + wr * (warpT(t, lo, lift) - t);
  else { let a = t - 0.012, b = t + 0.012; for (let i = 0; i < 34; i++) { const m = (a + b) / 2; if (m + wr * (warpT(m, lo, lift) - m) < t) a = m; else b = m; } tn = (a + b) / 2; }
  out[1] = y + AX[1] * (tn - t); out[2] = z + AX[2] * (tn - t);
}
// Negative inside the gas of that copy: the chamber over a floor, the ports, less the open side's valves. z folded to the open side.
// The copy's valve has no taper between head and stem. A dot may so pass through where the real valve's taper is; there it is
// hidden by the valve, as gas behind the valve would be.
function copyDist(x, y, z, floor) {
  const ch = Math.max(Math.hypot(x, z) - (BORE - 0.0006), floor - y, (y - roofAt(z)) * 0.94);
  const d = Math.min(ch, portDist(x, y, z) - RP - 0.0006, portDist(x, y, -z) - RP - 0.0006);
  const qx = Math.abs(x) - VX, qy = y - VS[1], qz = z - VS[2], t = qy * AX[1] + qz * AX[2], rad = Math.hypot(qx, qy - AX[1] * t, qz - AX[2] * t);
  return Math.max(d, -Math.max(rad - HEAD_R, HB_D - t, t + LIFT_D), -Math.max(rad - 0.003, -t, t - 0.098));      // the copy's valve: a flat head and a stem
}

// ---- evenly squeezed gas: a point of the chamber keeps its share of the gas to each side of it, below it and behind it
const zArea = (z, Hh) => { const s = Math.sqrt(Math.max(BORE * BORE - z * z, 0)), i1 = z * s + BORE * BORE * (Math.asin(clamp(z / BORE, -1, 1)) + Math.PI / 2);
  const i2 = z <= 0 ? 2 / 3 * s * s * s : 4 / 3 * BORE ** 3 - 2 / 3 * s * s * s; return Hh * i1 - ROOF_SLOPE * i2; };
function toLabel(x, y, z, top, out) {
  const Hh = DECK + ROOF - top, s = Math.sqrt(Math.max(BORE * BORE - z * z, 1e-12));
  out[0] = clamp(x / s, -1, 1); out[1] = clamp((y - top) / (roofAt(z) - top), 0, 1); out[2] = zArea(z, Hh) / zArea(BORE, Hh);
}
function fromLabel(lx, ly, lz, top, out) {
  const Hh = DECK + ROOF - top, tot = zArea(BORE, Hh), want = lz * tot;
  let a = -BORE, b = BORE, z = BORE * (2 * lz - 1);
  for (let i = 0; i < 40; i++) {
    const f = zArea(z, Hh) - want; if (f > 0) b = z; else a = z;
    const d = 2 * Math.sqrt(Math.max(BORE * BORE - z * z, 0)) * (Hh - ROOF_SLOPE * Math.abs(z));
    let zn = d > 1e-12 ? z - f / d : (a + b) / 2; if (!(zn > a && zn < b)) zn = (a + b) / 2;
    if (Math.abs(zn - z) < 1e-9) { z = zn; break; } z = zn;
  }
  out[0] = lx * Math.sqrt(Math.max(BORE * BORE - z * z, 0)); out[1] = top + ly * (roofAt(z) - top); out[2] = z;
}

// ---- the model's gas: how much is in the cylinder, and how crowded, with the intake pipe's gas as 1
const RHO0 = M.P_IN / M.T_IN;
export const density = (phi) => M.pressure(phi) / M.tempMean(phi) / RHO0;
export const gasIn = (phi) => density(phi) * M.volume(phi);            // m3 of intake-pipe gas
const RHO_OUT = density(700);                                          // in the exhaust pipe: what the cylinder's gas settles to
const d_ = (f, phi) => (f(phi + 0.25) - f(phi - 0.25)) / 0.5;
// the piston's top passes YB at these angles: nearer the top of its travel the chamber is handled squeezed
const PHI_B = (() => { let a = 0, b = 90; for (let i = 0; i < 50; i++) { const m = (a + b) / 2; if (M.pistonTop(m) > YB) a = m; else b = m; } return a; })();

// ---- the grid and its three flows, each for 1 m3 per degree leaving through the open valves
// 0: gas comes up evenly through the bottom (the piston's push)   1: gas appears evenly through the chamber (it expands)
// 2: gas appears in the valves' throats (it expands as it passes them) and leaves down the pipe
function* makeGrid() {
  const n = NX * NY * NZ, id = new Int32Array(n).fill(-1), cells = [];
  const kind = new Uint8Array(n);      // 1 chamber, 2 port, 3 throat
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const x = X0 + (i + 0.5) * H, y = YB + (j + 0.5) * H, z = Z0 + (k + 0.5) * H;
    const ch = Math.hypot(x, z) < BORE && y < roofAt(z), pt = portDist(x, y, z) < RP;
    if (!ch && !pt) continue;
    const qx = Math.abs(x) - VX, qy = y - (VS[1] - AX[1] * LIFT_D), qz = z - (VS[2] - AX[2] * LIFT_D), t = qy * AX[1] + qz * AX[2], rad = Math.hypot(qx, qy - AX[1] * t, qz - AX[2] * t);
    if ((t > -0.0012 && t < 0 && rad < HEAD_R) || (t >= 0 && t < 0.098 && rad < 0.003)) continue;     // the valve's head and stem; its taper is left to the dots' own collisions
    const c = i + NX * (j + NY * k), ts = t - LIFT_D;
    id[c] = cells.length; cells.push(c); kind[c] = ch ? 1 : ts > 0.004 && ts < 0.013 && z < 0.045 ? 3 : 2;
    if (i === NX - 1 && j === NY - 1 && k % 6 === 5) yield;
  }
  yield;
  const N = cells.length, nb = new Int32Array(N * 6), diag = new Float32Array(N), STR = [1, NX, NX * NY];
  let nBottom = 0, nCh = 0, nTh = 0;
  for (let a = 0; a < N; a++) {
    const c = cells[a], i = c % NX, j = ((c / NX) | 0) % NY, k = (c / (NX * NY)) | 0, at = [i, j, k], lim = [NX, NY, NZ]; let d = 0;
    for (let s = 0; s < 6; s++) { const ax = s >> 1, dir = s & 1 ? 1 : -1, v = at[ax] + dir, o = v >= 0 && v < lim[ax] ? id[c + dir * STR[ax]] : -1; nb[a * 6 + s] = o; if (o >= 0) d++; }
    if (k === NZ - 1) d++;                                    // the pipe goes on: the flow leaves here
    diag[a] = d; if (j === 0 && kind[c] === 1) nBottom++; if (kind[c] === 1) nCh++; if (kind[c] === 3) nTh++;
  }
  const fields = [];
  for (let f = 0; f < 3; f++) {
    const b = new Float32Array(N), phi = new Float32Array(N), r = new Float32Array(N), p = new Float32Array(N), Ap = new Float32Array(N), zv = new Float32Array(N);
    for (let a = 0; a < N; a++) { const c = cells[a], j = ((c / NX) | 0) % NY; b[a] = (f === 0 ? (j === 0 && kind[c] === 1 ? 1 / nBottom : 0) : f === 1 ? (kind[c] === 1 ? 1 / nCh : 0) : (kind[c] === 3 ? 1 / nTh : 0)) / H; }
    // conjugate gradients on: sum over neighbors of (phi here - phi there) = what comes in here
    let rz = 0; for (let a = 0; a < N; a++) { r[a] = b[a]; zv[a] = r[a] / diag[a]; p[a] = zv[a]; rz += r[a] * zv[a]; }
    const rz0 = rz;
    for (let it = 0; it < 900 && rz > rz0 * 1e-10; it++) {
      let pAp = 0;
      for (let a = 0, o = 0; a < N; a++, o += 6) { let s = diag[a] * p[a]; for (let q = 0; q < 6; q++) { const m = nb[o + q]; if (m >= 0) s -= p[m]; } Ap[a] = s; pAp += s * p[a]; }
      const al = rz / pAp; let rzn = 0;
      for (let a = 0; a < N; a++) { phi[a] += al * p[a]; r[a] -= al * Ap[a]; zv[a] = r[a] / diag[a]; rzn += r[a] * zv[a]; }
      const be = rzn / rz; rz = rzn; for (let a = 0; a < N; a++) p[a] = zv[a] + be * p[a];
      if (it % 12 === 11) yield;
    }
    // speeds through the cells' faces, m per degree for 1 m3 per degree
    const U = [new Float32Array((NX + 1) * NY * NZ), new Float32Array(NX * (NY + 1) * NZ), new Float32Array(NX * NY * (NZ + 1))];
    const ok = [new Uint8Array(U[0].length), new Uint8Array(U[1].length), new Uint8Array(U[2].length)];
    const fi = [(i, j, k) => i + (NX + 1) * (j + NY * k), (i, j, k) => i + NX * (j + (NY + 1) * k), (i, j, k) => i + NX * (j + NY * k)];
    for (let a = 0; a < N; a++) {
      const c = cells[a], i = c % NX, j = ((c / NX) | 0) % NY, k = (c / (NX * NY)) | 0;
      for (let ax = 0; ax < 3; ax++) {
        const lo = nb[a * 6 + ax * 2], hi = nb[a * 6 + ax * 2 + 1], iL = fi[ax](i, j, k), iH = fi[ax](i + (ax === 0), j + (ax === 1), k + (ax === 2));
        ok[ax][iL] = ok[ax][iH] = 1;
        if (lo >= 0) U[ax][iL] = (phi[lo] - phi[a]) / H; else if (ax === 1 && j === 0 && f === 0 && kind[c] === 1) U[ax][iL] = 1 / (nBottom * H * H);
        if (hi >= 0) U[ax][iH] = (phi[a] - phi[hi]) / H; else if (ax === 2 && k === NZ - 1) U[ax][iH] = phi[a] / H;
      }
    }
    // along a wall the gas slides: faces that lie wholly in metal take the speed of the gas beside them
    const dims = [[NX + 1, NY, NZ], [NX, NY + 1, NZ], [NX, NY, NZ + 1]];
    for (let ax = 0; ax < 3; ax++) {
      const [a0, a1, a2] = dims[ax], u = U[ax], o = ok[ax];
      for (let pass = 0; pass < 3; pass++) {
        const add = [];
        for (let k = 0; k < a2; k++) for (let j = 0; j < a1; j++) for (let i = 0; i < a0; i++) {
          const c = i + a0 * (j + a1 * k); if (o[c]) continue;
          let s = 0, w = 0;
          if (i > 0 && o[c - 1]) { s += u[c - 1]; w++; } if (i < a0 - 1 && o[c + 1]) { s += u[c + 1]; w++; }
          if (j > 0 && o[c - a0]) { s += u[c - a0]; w++; } if (j < a1 - 1 && o[c + a0]) { s += u[c + a0]; w++; }
          if (k > 0 && o[c - a0 * a1]) { s += u[c - a0 * a1]; w++; } if (k < a2 - 1 && o[c + a0 * a1]) { s += u[c + a0 * a1]; w++; }
          if (w) add.push(c, s / w);
        }
        for (let q = 0; q < add.length; q += 2) { u[add[q]] = add[q + 1]; o[add[q]] = 1; }
      }
    }
    fields.push(U); yield;
  }
  return { fields, cells: N };
}
// The flow at a point of the grid: w[0..2] times the three flows, into out. z folded.
function sample(G, w, x, y, z, out) {
  out[0] = out[1] = out[2] = 0;
  const gx = (x - X0) / H; let gy = (y - YB) / H, gz = (z - Z0) / H;
  if (gy < 0 && gy > -2) gy = 0; if (gz > NZ && gz < NZ + 2) gz = NZ;      // half a step past the grid's lower edge or its end: the flow there is the flow at the edge
  if (gx < 0 || gx > NX || gy < 0 || gy > NY || gz < 0 || gz > NZ) return;
  for (let ax = 0; ax < 3; ax++) {
    const a0 = NX + (ax === 0), a1 = NY + (ax === 1), a2 = NZ + (ax === 2);
    const fx = ax === 0 ? gx : gx - 0.5, fy = ax === 1 ? gy : gy - 0.5, fz = ax === 2 ? gz : gz - 0.5;
    const i0 = clamp(Math.floor(fx), 0, a0 - 1), j0 = clamp(Math.floor(fy), 0, a1 - 1), k0 = clamp(Math.floor(fz), 0, a2 - 1);
    const i1 = Math.min(i0 + 1, a0 - 1), j1 = Math.min(j0 + 1, a1 - 1), k1 = Math.min(k0 + 1, a2 - 1);
    const tx = clamp(fx - i0, 0, 1), ty = clamp(fy - j0, 0, 1), tz = clamp(fz - k0, 0, 1);
    const c00 = i0 + a0 * (j0 + a1 * k0), c10 = i0 + a0 * (j1 + a1 * k0), c01 = i0 + a0 * (j0 + a1 * k1), c11 = i0 + a0 * (j1 + a1 * k1), dx = i1 - i0;
    let v = 0;
    for (let f = 0; f < 3; f++) {
      if (!w[f]) continue; const u = G.fields[f][ax];
      const a = u[c00] + (u[c00 + dx] - u[c00]) * tx, b = u[c10] + (u[c10 + dx] - u[c10]) * tx, c = u[c01] + (u[c01 + dx] - u[c01]) * tx, d = u[c11] + (u[c11 + dx] - u[c11]) * tx;
      v += w[f] * (a + (b - a) * ty + ((c + (d - c) * ty) - (a + (b - a) * ty)) * tz);
    }
    out[ax] = v;
  }
}

const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ---- following the dots
// Returns, in steps (a generator, so that the page can do the work a little at a time), the paths of all the dots
// that come in during one cycle. The same dots come in every cycle, so the gas at angle phi is every path at
// phi, phi + 720, phi + 1440 and phi + 2160.
export function* build() {
  const G = yield* makeGrid();
  // the dots waiting in the intake pipe: one cycle's worth, evenly spread
  const perCycle = gasIn(IVC) - gasIn(719.75), LEN = perCycle / A_PIPE, layers = Math.round(LEN / SPACING), dl = LEN / layers;
  const X = [], Y = [], Z = [];
  for (let l = 0; l < layers; l++) for (let a = -4; a <= 4; a++) for (let b = -2; b <= 2; b++) {
    const s = l * 45 + (a + 4) * 5 + b + 2, jx = 0.56 * (hash(s, 1) - 0.5), jy = 0.56 * (hash(s, 2) - 0.5), jl = 0.56 * (hash(s, 3) - 0.5);
    const cx = (a + 0.5 * (l & 1) + jx) * SPACING, cy = (b + 0.5 * ((l >> 1) & 1) + jy) * SPACING;
    if (Math.hypot(Math.max(Math.abs(cx) - VX, 0), cy) > RP - 0.0002) continue;
    const along = Z_IN - ZG + (l + 0.5 + jl) * dl;      // beyond the grid's end, along the pipe
    X.push(cx); Y.push(P2[1] + (ZG - P2[2]) / PIPE[1] * PIPE[0] + cy + along * PIPE[0]); Z.push(ZG + along * PIPE[1]);
  }
  const N = X.length, perDot = perCycle / N;
  // one dot in 15 is fuel: it is not in the pipe but waits at the injector's tip until its moment in the spray
  const fuel = new Uint8Array(N), injT = new Float32Array(N).fill(1e9), sprayA = new Float32Array(N), sprayB = new Float32Array(N);
  { let nf = 0; for (let i = 0; i < N; i++) if (hash(i, 77) < FUEL_SHARE) fuel[i] = 1, nf++;
    for (let i = 0, k = 0; i < N; i++) if (fuel[i]) {
      injT[i] = M.INJECT[0] + (M.INJECT[1] - M.INJECT[0]) * (k++ + 0.5) / nf;
      const r = Math.sqrt(hash(i, 5)), th = 2 * Math.PI * hash(i, 6); sprayA[i] = r * Math.cos(th); sprayB[i] = r * Math.sin(th);
      X[i] = INJ[0]; Y[i] = INJ[1]; Z[i] = INJ[2]; } }      // each dot stands for this much gas; the pattern is one cycle's length of pipe, so each cycle's dots follow on from the last
  const px = Float64Array.from(X), py = Float64Array.from(Y), pz = Float64Array.from(Z);
  const lab = new Uint8Array(N), gone = new Uint8Array(N), t0 = new Float32Array(N).fill(-1);
  const rec = Array.from({ length: N }, () => []), burns = Array.from({ length: N }, () => []), fuelAt = new Float32Array(N).fill(1e9);
  const lastT = new Float32Array(N).fill(-1e9), prevS = new Float64Array(N * 4), hasPrev = new Uint8Array(N), trav = new Float32Array(N);
  const v = [0, 0, 0], w = [0, 0, 0], q = [0, 0, 0], o3 = [0, 0, 0];
  // where dot i is in the engine: out of the copy, and squeezed with the chamber when the piston is near the top
  const phys = (i, top, squeezed, side, lift) => {
    if (lab[i]) { fromLabel(px[i], py[i], pz[i], top, o3); if (room) expand(o3, top, room.Rf, room.E); return o3; }
    if (side) { warp(px[i], py[i], pz[i] * side, lift, squeezed ? YB : top, o3); o3[2] *= side; } else { o3[0] = px[i]; o3[1] = py[i]; o3[2] = pz[i]; }
    if (squeezed && inChamber(o3[0], o3[1], o3[2]) && o3[1] >= YB - 1e-6) { toLabel(o3[0], o3[1], o3[2], YB, q); fromLabel(q[0], q[1], q[2], top, o3); }
    return o3;
  };
  let room = null;      // the burned gas's room at the angle being kept
  // Once out of the spray, the fuel mixes into the air (turbulence, not modeled as such): each dot of fuel drifts to its own
  // place in gas spread evenly, which it reaches as the intake valve closes. Air and fuel are then both spread evenly.
  const fuelHome = new Float32Array(N * 3); for (let i = 0; i < N; i++) if (fuel[i]) { fuelHome[i * 3] = 0.94 * (2 * hash(i, 11) - 1); fuelHome[i * 3 + 1] = 0.05 + 0.9 * hash(i, 12); fuelHome[i * 3 + 2] = 0.03 + 0.94 * hash(i, 13); }
  const fh = [0, 0, 0];
  const mixFuel = (i, b, top, p) => {
    if (!fuel[i] || b <= injT[i] + SPRAY_DEG || b > IVC) return p;
    const w = M.smooth(injT[i] + SPRAY_DEG, IVC, b); fromLabel(fuelHome[i * 3], fuelHome[i * 3 + 1], fuelHome[i * 3 + 2], top, fh);
    p[0] = mix(p[0], fh[0], w); p[1] = mix(p[1], fh[1], w); p[2] = mix(p[2], fh[2], w); return p;
  };
  const toCopy = (i, side, lift, floor) => { warp(px[i], py[i], pz[i] * side, lift, floor, q, true); py[i] = q[1]; pz[i] = q[2] * side; };
  const marks = []; for (let d = 0; d <= 720; d += 2) marks.push(d); marks.push(PHI_B, 720 - PHI_B); marks.sort((a, b) => a - b);
  let alive = N, tMax = 0;
  for (let cyc = 0; cyc < 6 && alive > 0; cyc++) {
    for (let s = 0; s + 1 < marks.length; s++) {
      const a = marks[s], b = marks[s + 1], dphi = b - a; if (dphi < 1e-9) continue;
      const mid = (a + b) / 2, T = cyc * 720;
      const closed = mid > IVC && mid < EVO, side = mid < 360 ? 1 : -1, squeezed = !closed && (mid < PHI_B || mid > 720 - PHI_B);
      const top = M.pistonTop(mid), vp = d_(M.pistonTop, mid), rho = density(mid), D = -d_(density, mid) / rho, out = -d_(gasIn, mid);     // out: intake-pipe m3 leaving the cylinder per degree
      const rhoPort = side > 0 ? 1 : RHO_OUT;
      const liftOf = (phi, sd) => (sd > 0 ? M.liftIn(phi) : M.liftEx(phi));
      if (closed) {
        if (a === IVC) for (let i = 0; i < N; i++) if (!gone[i]) { let p = phys(i, M.pistonTop(IVC), false, 1, 0); if (cyc === 0) p = mixFuel(i, IVC, M.pistonTop(IVC), p); if (inChamber(p[0], p[1], p[2])) { toLabel(p[0], p[1], p[2], M.pistonTop(IVC), q); px[i] = q[0]; py[i] = q[1]; pz[i] = q[2]; lab[i] = 1; } else { px[i] = p[0]; py[i] = p[1]; pz[i] = p[2]; } }
      } else {
        if (a === EVO) for (let i = 0; i < N; i++) if (!gone[i]) { if (lab[i]) { fromLabel(px[i], py[i], pz[i], M.pistonTop(EVO), q); px[i] = q[0]; py[i] = q[1]; pz[i] = q[2]; lab[i] = 0; } toCopy(i, -1, 0, M.pistonTop(EVO)); }
        if (a === 0 && cyc > 0) for (let i = 0; i < N; i++) if (!gone[i]) { warp(px[i], py[i], -pz[i], M.liftEx(720), YB, q); px[i] = q[0]; py[i] = q[1]; pz[i] = -q[2]; toCopy(i, 1, M.liftIn(0), YB); }
        let Qc, Qp;
        if (squeezed) { const rhoD = gasIn(mid) / V_HEAD; w[0] = 0; w[1] = Qc = out / rhoD; Qp = out / rhoPort; w[2] = Qp - Qc; }
        else { const alpha = (vp + D * (YB - top)) * AREA, beta = D * V_HEAD; Qc = alpha + beta; Qp = Qc * rho / rhoPort; w[0] = alpha; w[1] = beta; w[2] = Qp - Qc; }
        const pipeV = Qp / A_PIPE, floor = squeezed ? YB : top, lift = liftOf(mid, side);
        for (let i = 0; i < N; i++) {
          if (gone[i]) continue;
          if (fuel[i] && cyc === 0 && b <= injT[i] + SPRAY_DEG) {      // fuel waiting in the injector, or flying out in the spray
            if (b > injT[i]) { sprayAt(b - injT[i], sprayA[i], sprayB[i], M.pistonTop(b), o3); px[i] = o3[0]; py[i] = o3[1]; pz[i] = o3[2]; toCopy(i, side, lift, floor); }
            continue;
          }
          let x = px[i], y = py[i], z = pz[i], left = dphi, guard = 0;
          while (left > 1e-9 && guard++ < 400) {
            const zs = z * side; let mode;
            if (zs > ZG) { mode = 2; v[0] = 0; v[1] = pipeV * PIPE[0]; v[2] = pipeV * PIPE[1]; }
            else if (!squeezed && y < YB && inChamber(x, y, z)) { mode = 1; v[0] = 0; v[1] = vp + D * (y - top); v[2] = 0; }
            else { mode = 0; sample(G, w, x, y, zs, v); }
            const sp = Math.hypot(v[0], v[1], v[2]), h = mode === 0 ? Math.min(left, 0.4 * H / Math.max(sp, 1e-12)) : left;
            if (sp < 1e-9 && mode === 0) break;      // gas that is not moving, as in the port whose valves are shut
            if (mode === 0) {      // midpoint step
              const mx = x + v[0] * h / 2, my = y + v[1] * h / 2, mz = zs + v[2] * h / 2; sample(G, w, mx, my, mz, v);
              x += v[0] * h; y += v[1] * h; z += v[2] * h * side;
            } else if (mode === 1) { y += (vp + D * (y + v[1] * h / 2 - top)) * h; }
            else { y += v[1] * h; z += v[2] * h * side; }
            left -= h; trav[i] += sp * h;
            if (mode !== 2 && y > DECK - 0.010) {      // keep out of the metal
              for (let it = 0; it < 2; it++) {
                const zf = z * side, d = copyDist(x, y, zf, floor) + 0.0001; if (d <= 0) break;
                const e = 0.0002, gx = copyDist(x + e, y, zf, floor) - copyDist(x - e, y, zf, floor), gy = copyDist(x, y + e, zf, floor) - copyDist(x, y - e, zf, floor), gz = copyDist(x, y, zf + e, floor) - copyDist(x, y, zf - e, floor), gl = Math.hypot(gx, gy, gz) || 1;
                x -= gx / gl * d; y -= gy / gl * d; z -= gz / gl * d * side;
              }
            }
            if (trav[i] > 0.004 && left > 1e-9 && t0[i] >= 0) {      // a quick dot: keep its path between the steps too
              const tn = T + b - left, fl = squeezed ? YB : M.pistonTop(b - left); warp(x, y, z * side, lift, fl, o3); o3[2] *= side;
              if (squeezed && inChamber(o3[0], o3[1], o3[2]) && o3[1] >= YB - 1e-6) { toLabel(o3[0], o3[1], o3[2], YB, q); fromLabel(q[0], q[1], q[2], M.pistonTop(b - left), o3); }
              if (cyc === 0) mixFuel(i, b - left, M.pistonTop(b - left), o3);
              rec[i].push(tn, o3[0], o3[1], o3[2]); lastT[i] = tn; hasPrev[i] = 0; trav[i] = 0;
            }
          }
          if (!squeezed && inChamber(x, y, z) && y < M.pistonTop(b) + 0.0003) y = M.pistonTop(b) + 0.0003;
          px[i] = x; py[i] = y; pz[i] = z;
        }
        if (b === 720 - PHI_B) for (let i = 0; i < N; i++) if (!gone[i] && inChamber(px[i], py[i], pz[i]) && py[i] < YB) py[i] = YB;
      }
      // keep the path, and note when a dot is reached by the fuel and by the flame
      const tb = T + b, topB = M.pistonTop(b), shut = b > IVC && b <= EVO, sqB = !shut && (b <= PHI_B || b > 720 - PHI_B), Rf = M.flameR(b), sideB = shut ? 0 : side, liftB = shut ? 0 : liftOf(b, side);
      room = shut ? burnRoom(b) : null;
      for (let i = 0; i < N; i++) {
        if (gone[i]) continue;
        if (fuel[i] && t0[i] < 0) {      // a dot of fuel starts at the injector's tip, the moment it leaves it
          if (cyc > 0 || b <= injT[i]) continue;
          t0[i] = T + injT[i]; fuelAt[i] = t0[i]; rec[i].push(t0[i], INJ[0], INJ[1], INJ[2]); lastT[i] = t0[i];
        }
        const p = phys(i, topB, sqB, sideB, liftB); if (cyc === 0) mixFuel(i, b, topB, p);
        const x = p[0], y = p[1], z = p[2];
        if (t0[i] < 0) { if (z < Z_IN) t0[i] = tb; else continue; }
        const inside = inChamber(x, y, z), r = rec[i];
        if (inside) {
          if (b > SPARK && b < 400 && Math.hypot(x, y - M.PLUG_GAP[1], z) < Rf && (!burns[i].length || tb - burns[i][burns[i].length - 1] > 360)) burns[i].push(tb);
        }
        const n = r.length, far = n ? Math.hypot(x - r[n - 3], y - r[n - 2], z - r[n - 1]) : 1;
        const end = -z > 0.20 || tb - t0[i] >= LIFE;
        if (!n || far > 0.003 || tb - lastT[i] >= 8 || end || (room && inside)) {      // (while the flame spreads, every step: the gas it pushes moves unevenly)
          if (n && hasPrev[i] && far > 0.003 && prevS[i * 4] > lastT[i] + 1e-6) r.push(prevS[i * 4], prevS[i * 4 + 1], prevS[i * 4 + 2], prevS[i * 4 + 3]);
          r.push(tb, x, y, z); lastT[i] = tb; hasPrev[i] = 0; trav[i] = 0;
        } else { prevS[i * 4] = tb; prevS[i * 4 + 1] = x; prevS[i * 4 + 2] = y; prevS[i * 4 + 3] = z; hasPrev[i] = 1; }
        if (end) { gone[i] = 1; alive--; tMax = Math.max(tMax, tb); }
      }
      room = null;
      if (s % 2 === 1) yield;
    }
  }
  // pack
  let total = 0; for (const r of rec) total += r.length / 4;
  const start = new Uint32Array(N + 1), time = new Float32Array(total), pos = new Int16Array(total * 3), burn = new Float32Array(N * 4).fill(1e9);
  for (let i = 0, o = 0; i < N; i++) {
    start[i] = o; const r = rec[i];
    for (let k = 0; k < r.length; k += 4, o++) { time[o] = r[k]; pos[o * 3] = Math.round(r[k + 1] * 1e5); pos[o * 3 + 1] = Math.round(r[k + 2] * 1e5); pos[o * 3 + 2] = Math.round(r[k + 3] * 1e5); }
    start[i + 1] = o; for (let k = 0; k < Math.min(4, burns[i].length); k++) burn[i * 4 + k] = burns[i][k];
  }
  return { n: N, start, time, pos, burn, fuel, fuelAt, injT, perDot, cells: G.cells, cycles: Math.ceil(tMax / 720), hint: new Uint32Array(N * 8) };
}

// The paths are kept as points a few millimeters apart, with straight lines between.
// Where dot i of the paths is at time t (degrees since the paths began), into out; false if it is not in the engine then.
export function at(F, i, t, out, slot = 0) {
  const a = F.start[i], b = F.start[i + 1] - 1; if (b <= a || t < F.time[a] || t > F.time[b]) return false;
  let k = F.hint[i * 8 + slot]; if (k < a || k >= b || F.time[k] > t || F.time[k + 1] < t) { let lo = a, hi = b; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (F.time[m] <= t) lo = m; else hi = m; } k = lo; F.hint[i * 8 + slot] = k; }
  const u = (t - F.time[k]) / Math.max(F.time[k + 1] - F.time[k], 1e-9), p = F.pos, o = k * 3;
  out[0] = (p[o] + (p[o + 3] - p[o]) * u) * 1e-5; out[1] = (p[o + 1] + (p[o + 4] - p[o + 1]) * u) * 1e-5; out[2] = (p[o + 2] + (p[o + 5] - p[o + 2]) * u) * 1e-5;      // kept in hundredths of a millimeter
  return true;
}
