// Engine: the model. A gasoline four-stroke with four cylinders in a row, cruising at 60 mph.
// Everything the page draws or prints comes from here: where the piston is at each crank angle,
// how far each valve is open, the pressure and temperature of the gas, and how crowded its molecules are.
// Angles are in degrees of crankshaft for one cylinder's cycle: 0 = piston at the top as intake begins,
// 0-180 intake, 180-360 compression, 360 = top again (the burn), 360-540 power, 540-720 exhaust.

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a + (b - a) * t;
export const wrap = (phi) => ((phi % 720) + 720) % 720;
const RAD = Math.PI / 180;

// ---- sizes, in metres (the 3D model in shaders.js uses the same numbers)
export const BORE = 0.042;          // cylinder radius: 84 mm across
export const CRANK = 0.045;         // crank throw: the stroke is twice this, 90 mm
export const ROD = 0.145;           // connecting rod, between its two pins
export const PIN_TO_TOP = 0.030;    // from the piston's pin up to its top face
export const DECK = 0.2207;         // height of the top of the block above the crankshaft's axis
export const ROOF = 0.015;          // the chamber's roof rises this far above the deck along its ridge
export const ROOF_SLOPE = 0.35;
export const PITCH = 0.096;         // from one cylinder to the next
export const X4 = -0.144;           // cylinder 4, the one the page zooms into, along the crankshaft
export const XC = -0.1615;          // the cross cut: through the middle of cylinder 4's nearer pair of valves
export const VALVE_AXIS = [0, 0.9455, 0.3256], VALVE_SEAT = [0, DECK + 0.0083, 0.019], VALVE_R = [0.016, 0.0138];
export const PLUG_GAP = [X4, DECK + 0.0092, 0];
export const FIRING = [1, 3, 4, 2];
export const OFFSET = [0, 540, 180, 360];      // how far each cylinder's cycle runs behind cylinder 1's
export const phiOf = (phi4, cyl) => wrap(phi4 + 360 - OFFSET[cyl - 1]);   // a cylinder's own angle, from cylinder 4's

export const pinY = (phi) => { const s = CRANK * Math.sin(phi * RAD); return CRANK * Math.cos(phi * RAD) + Math.sqrt(ROD * ROD - s * s); };
export const pistonTop = (phi) => pinY(phi) + PIN_TO_TOP;
export const TOP_TDC = pistonTop(0), TOP_BDC = pistonTop(180);
export const AREA = Math.PI * BORE * BORE;
export const V_CLEAR = AREA * (DECK - TOP_TDC) + AREA * ROOF - ROOF_SLOPE * 4 * BORE ** 3 / 3;   // gap above the piston at the top, plus the roof
export const V_SWEPT = AREA * 2 * CRANK;
export const RATIO = (V_CLEAR + V_SWEPT) / V_CLEAR;
export const volume = (phi) => V_CLEAR + AREA * (TOP_TDC - pistonTop(phi));

// ---- valves: opened by the camshafts, which turn once for every two turns of the crankshaft
export const IVO = -10, IVC = 220, EVO = 490, EVC = 730, LIFT = 0.009;
const bump = (u) => (u > 0 && u < 1 ? LIFT * Math.sin(Math.PI * u) ** 2 : 0);
export const liftIn = (phi) => bump(wrap(phi - IVO) / (IVC - IVO));
export const liftEx = (phi) => bump(wrap(phi - EVO) / (EVC - EVO));
export const camAngle = (phi, exhaust) => (phi - (exhaust ? (EVO + EVC) / 2 : (IVO + IVC) / 2)) / 2;   // degrees the bump is past pointing at its valve
// The least gap between a valve's lower edge and the piston, at one angle.
export function valveGap(phi) {
  let g = 1;
  for (const [lift, r] of [[liftIn(phi), VALVE_R[0]], [liftEx(phi), VALVE_R[1]]]) g = Math.min(g, VALVE_SEAT[1] - lift * VALVE_AXIS[1] - r * VALVE_AXIS[2] - pistonTop(phi));
  return g;
}

// ---- the burn: lit by the spark before the top, spreading from the plug as a front
export const SPARK = 335, INJECT = [70, 95];      // the spray lasts about 1.7 thousandths of a second
// The share of the mixture's mass that has burned. One curve drives the pressure, the temperature and the front.
const BURN_RAW = (phi) => 1 - Math.exp(-5 * Math.pow(Math.max(phi - SPARK - 5, 0) / 55, 3)), BURN_DONE = 0.99;
export const FLAME_OUT = SPARK + 5 + 55 * Math.cbrt(-Math.log(1 - BURN_DONE) / 5);      // all of it has burned: the front has reached the farthest corner
export const burnedShare = (phi) => (phi < SPARK + 5 ? 0 : Math.min(1, BURN_RAW(phi) / BURN_DONE));
export const GAS_CUT = X4 - 0.0015;     // at the Flame scale the engine and its gas are cut just in front of the spark plug, so the flame is seen from its start
export const SPOT = [X4 + 0.002, DECK + 0.0055, 0.0125];    // the spot in the gas that the Molecules scale looks at
export const SPOT_DIST = Math.hypot(SPOT[0] - PLUG_GAP[0], SPOT[1] - PLUG_GAP[1], SPOT[2] - PLUG_GAP[2]);
// The part of the chamber's volume inside a ball of radius R about the plug's gap, with the piston's top at `top`.
export function ballShare(R, top) {
  const n = 24, h = BORE / n, py = PLUG_GAP[1]; let inB = 0, all = 0;
  for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) {
    const x = (i + 0.5) * h, z = (k + 0.5) * h, r2 = x * x + z * z; if (r2 >= BORE * BORE) continue;
    const roof = DECK + ROOF - ROOF_SLOPE * z; all += roof - top;
    if (r2 < R * R) { const s = Math.sqrt(R * R - r2); inB += Math.max(0, Math.min(roof, py + s) - Math.max(top, py - s)); }
  }
  return inB / all;
}

// ---- the road
export const MPH = 60, SPEED = MPH * 0.44704, RPM = 2400, DEG_PER_S = RPM * 6;
export const TIRE_R = 0.342;      // the tire's radius, m: it rolls, so it turns SPEED / TIRE_R radians a second
// A coil's spark lasts about 1.5 thousandths of a second: a breakdown of a few billionths, then a glow while the coil empties
export const SPARK_MS = 1.5, SPARK_END = SPARK + Math.round(SPARK_MS / 1000 * DEG_PER_S);

// ---- pressure and temperature through the cycle, in steps of half a degree
// While both valves are shut the gas is squeezed, burns and expands. While a valve is open, gas flows through the ring
// between its head and its seat, from the higher pressure to the lower and no faster than sound, and the pressure in
// the cylinder follows from the gas that is left. So the exhaust takes time to rush out, some burned gas goes back into
// the intake port while both valves are open at the top, and the rising piston pushes some mixture back before the
// intake valve shuts. Not modeled: pressure waves in the pipes, and heat lost to the walls while a valve is open.
const K_B = 1.380649e-23, R_GAS = 287;
export const P_IN = 0.50e5;        // in the intake pipe at this light load, with the throttle mostly shut
export const P_OUT = 1.05e5;       // in the exhaust pipe
export const T_FRESH = 320;        // the air in the intake pipe, K
export const AIR_FUEL = 15.0, HEAT = 43.4e6, KEPT = 0.72;   // share of the fuel's heat that stays in the gas
export const VALVE_CD = 0.6;       // how much of the ring between head and seat the flow really uses
const N = 1440, STEP = 0.5, SUB = 20;
const P = new Float64Array(N + 1), TU = new Float64Array(N + 1), TB = new Float64Array(N + 1), XB = new Float64Array(N + 1), TM = new Float64Array(N + 1);
const MS = new Float64Array(N + 1), PK = new Float64Array(N + 1), FI = new Float64Array(N + 1), FE = new Float64Array(N + 1), OLD = new Float64Array(N + 1), RF = new Float64Array(N + 1);
// kg a second through an opening of area A from gas at (pu, Tu) to pressure pd: at most the speed of sound in the opening
function throughValve(pu, Tu, pd, A, g) {
  const r = Math.max(pd / pu, Math.pow(2 / (g + 1), g / (g - 1)));      // below this ratio the flow is choked
  return A * pu / Math.sqrt(R_GAS * Tu) * Math.sqrt(2 * g / (g - 1) * Math.max(0, Math.pow(r, 2 / g) - Math.pow(r, (g + 1) / g)));
}
const ringArea = (lift, r) => VALVE_CD * 2 * Math.min(2 * Math.PI * r * lift, Math.PI * (r - 0.003) ** 2);      // two valves; never more than the port behind them
export let T_IN = 385, T_EX = 1300, T_BACK = 1300, LEFT_OVER = 0.08, P_IVC = P_IN;      // the charge once mixed, K; the gas in the exhaust pipe, K; the burned gas pushed back into the intake port at the top, K; the share of the charge that is burned gas left from the last cycle
(function build() {
  // the state when the intake valve shuts (a first guess; a few cycles settle it)
  let p = P_IN, m = P_IN * volume(IVC) / (R_GAS * 385), mOld = 0.08 * m;
  for (let round = 0; round < 6; round++) {
    // both valves shut: squeeze, burn, expand
    const iC = Math.round(IVC / STEP), iE = Math.round(EVO / STEP), mass = m, Q = (m - mOld) / (AIR_FUEL + 1) * HEAT * KEPT;
    LEFT_OVER = mOld / m; T_IN = p * volume(IVC) / (m * R_GAS); P_IVC = p;
    for (let i = iC; i <= iE; i++) {
      const phi = i * STEP;
      if (i > iC) { const g = mix(1.33, 1.24, burnedShare(phi)), v0 = volume(phi - STEP), v1 = volume(phi); p += (g - 1) / v1 * Q * (burnedShare(phi) - burnedShare(phi - STEP)) - g * p / v1 * (v1 - v0); }
      P[i] = p; XB[i] = burnedShare(phi); MS[i] = mass; FI[i] = FE[i] = PK[i] = 0; OLD[i] = phi < SPARK ? mOld / m : 1;
      TU[i] = T_IN * Math.pow(p / P_IVC, 0.33 / 1.33); TM[i] = p * volume(phi) / (mass * R_GAS);
    }
    // a valve open: from the exhaust valve's opening, round the top, to the intake valve's closing
    let old = m, park = 0, parkOld = 0, parkH = 0, outM = 0, outH = 0, backM = 0, backH = 0;      // burned gas in the cylinder; gas pushed into the intake port, its burned part and its heat
    for (let i = iE; i !== iC; i = (i + 1) % N) {
      const j = i + 1; let dI = 0, dE = 0;
      for (let k = 0; k < SUB; k++) {
        const phi = i * STEP + (k + 0.5) * STEP / SUB, v0 = volume(phi - 0.5 * STEP / SUB), v1 = volume(phi + 0.5 * STEP / SUB), dt = STEP / SUB / DEG_PER_S;
        const T = p * v0 / (m * R_GAS), xo = old / m, g = mix(1.36, 1.28, xo), aE = ringArea(liftEx(phi), VALVE_R[1]), aI = ringArea(liftIn(phi), VALVE_R[0]);
        let H = 0;
        if (aE > 0) {
          if (p >= P_OUT) { const d = Math.min(throughValve(p, T, P_OUT, aE, g) * dt, 0.2 * m); m -= d; old -= d * xo; H -= d * T; dE += d; outM += d; outH += d * T; }
          else { const d = throughValve(P_OUT, T_EX, p, aE, g) * dt; m += d; old += d; H += d * T_EX; dE -= d; }
        }
        if (aI > 0) {
          if (p > P_IN) { const d = Math.min(throughValve(p, T, P_IN, aI, g) * dt, 0.2 * m); m -= d; old -= d * xo; H -= d * T; dI -= d; park += d; parkOld += d * xo; parkH += d * T; if (phi > 360 || phi < 90) { backM += d; backH += d * T; } }
          else if (park > 1e-12) { const Tp = parkH / park, d = Math.min(throughValve(P_IN, Tp, p, aI, g) * dt, park), f = d / park; m += d; old += parkOld * f; H += d * Tp; dI += d; parkOld -= parkOld * f; parkH -= parkH * f; park -= d; }
          else { const d = throughValve(P_IN, T_FRESH, p, aI, g) * dt; m += d; H += d * T_FRESH; dI += d; }
        }
        p += (-g * p * (v1 - v0) + g * R_GAS * H) / v1;
      }
      const phi = j * STEP;
      P[j] = p; MS[j] = m; PK[j] = phi > 360 || phi < 90 ? park : 0; FI[j] = dI; FE[j] = dE; OLD[j] = old / m; XB[j] = phi > EVO ? 1 : 0; TM[j] = p * volume(phi) / (m * R_GAS); TU[j] = TM[j];
      if (j === N) { P[0] = P[N]; MS[0] = MS[N]; OLD[0] = OLD[N]; TM[0] = TU[0] = TM[N]; XB[0] = 0; FI[0] = FE[0] = 0; PK[0] = PK[N]; }      // the cycle goes round
    }
    if (outM > 0) T_EX = outH / outM; if (backM > 0) T_BACK = backH / backM;
    mOld = old;
  }
  // burned gas: about 2,300 K where the front has just passed the spot, then following the pressure. Once all the gas has
  // burned it is one gas, at the cylinder's average, and stays so while it leaves.
  const iE = Math.round(EVO / STEP);
  for (let i = 0; i <= N; i++) { const phi = i * STEP; RF[i] = phi > SPARK && phi < FLAME_OUT ? 1 : 0; }
  const front = (i, pRef) => 2300 * Math.pow(P[i] / pRef, 0.24 / 1.24);
  // the front: the ball about the plug that holds the burned share of the mass, which is E times thinner than the rest
  let Rlast = 0, iRef = 0;
  for (let pass = 0; pass < 2; pass++) {      // (the burned gas's temperature needs the pressure when the front passes the spot, which needs the front)
    const pRef = P[iRef || Math.round(354 / STEP)]; Rlast = 0;
    for (let i = 0; i <= iE; i++) { const phi = i * STEP; TB[i] = phi < SPARK ? 0 : mix(front(i, pRef), TM[i], smooth(385, 430, phi)); }
    for (let i = Math.round(SPARK / STEP); i * STEP < FLAME_OUT; i++) {
      const phi = i * STEP, xb = XB[i], E = TB[i] / TU[i], yb = xb * E / (1 + xb * (E - 1)), top = pistonTop(phi);
      let a = Rlast, b = 0.06; for (let k = 0; k < 28; k++) { const mid = (a + b) / 2; if (ballShare(mid, top) < yb) a = mid; else b = mid; }
      RF[i] = Rlast = Math.max(Rlast, (a + b) / 2);
      if (!iRef || pass) { if (RF[i] >= SPOT_DIST && RF[i - 1] < SPOT_DIST) iRef = i; }
    }
  }
  for (let i = Math.ceil(FLAME_OUT / STEP); i <= N; i++) RF[i] = 1;      // all burned: the whole chamber is behind the front
  for (let i = iE + 1; i <= N; i++) TB[i] = TM[i];
})();
const at = (A, phi) => { const x = wrap(phi) / STEP, i = Math.floor(x), f = x - i; return A[i] + (A[Math.min(N, i + 1)] - A[i]) * f; };
export const pressure = (phi) => at(P, phi);                 // Pa
export const tempUnburned = (phi) => at(TU, phi);            // K
export const tempBurned = (phi) => at(TB, phi);              // K
export const tempMean = (phi) => at(TM, phi);                // K, of all the gas in the cylinder
export const massIn = (phi) => at(MS, phi);                  // kg of gas in the cylinder
export const backIn = (phi) => at(PK, phi);                   // kg of the cylinder's gas that is in the intake port, pushed back there at the top
export const oldShare = (phi) => at(OLD, phi);               // the share of it that has burned (this cycle's, or left from the last)
// kg that passed the intake valves into the cylinder, and the exhaust valves out of it, between two angles of one cycle (a < b)
const passed = (F, a, b) => { let s = 0; for (let i = Math.floor(a / STEP) + 1; i <= Math.ceil(b / STEP) && i <= N; i++) { const lo = Math.max(a, (i - 1) * STEP), hi = Math.min(b, i * STEP); if (hi > lo) s += F[i] * (hi - lo) / STEP; } return s; };
export const throughIntake = (a, b) => passed(FI, a, b), throughExhaust = (a, b) => passed(FE, a, b);
// how far the front has got from the plug, m (0 before the spark; 1, which is past every wall, once all has burned)
export const flameR = (phi) => { const p = wrap(phi); if (p <= SPARK) return 0; if (p >= FLAME_OUT) return 1; const x = p / STEP, i = Math.floor(x), b = RF[i + 1] >= 1 ? FAR : RF[i + 1]; return RF[i] + (b - RF[i]) * (x - i); };
export const FAR = Math.hypot(BORE, PLUG_GAP[1] - pistonTop(FLAME_OUT));      // from the plug to the farthest corner as the burn ends
// the angle at which the front reaches a point this far from the plug
export const flameAt = (dist) => { let a = SPARK, b = FLAME_OUT; for (let k = 0; k < 40; k++) { const m = (a + b) / 2; if (flameR(m) < dist) a = m; else b = m; } return (a + b) / 2; };
export const SPOT_BURNS = flameAt(SPOT_DIST);
export const ATM = 101325;
export let PEAK = { p: 0, phi: 0 };
for (let i = 0; i <= N; i++) if (P[i] > PEAK.p) PEAK = { p: P[i], phi: i * STEP };
// The burned gas's own light, and the color of its dots, go by its temperature. heat: 0 cooled, 1 hot.
export const heatOf = (T) => smooth(600, 1600, T);
export const GLOW = 9.5;      // how strongly the burned gas glows and hides what is behind it, per meter, for gas at 1 atm and 1,000 K as hot as it gets
export const glow = (phi) => { const p = wrap(phi); if (p <= SPARK) return 0; const T = tempBurned(p), k = clamp((T - 900) / 1400, 0, 1); return GLOW * (pressure(p) / ATM) / (T / 1000) * k * k; };
// the temperature of a cylinder's gas where it has burned, at its own angle: this cycle's burned gas (own), or gas left from the last cycle and mixed into the charge
export const tempOld = (phi, own = true) => { const p = wrap(phi); return own && p > SPARK ? tempBurned(p) : p > IVC && p < EVO ? tempUnburned(p) : tempMean(p); };

// ---- the gas at the spot the Molecules scale looks at
// how far the burn has got there: 0 before the front arrives, 1 once it has passed. The real front passes one
// molecule-sized spot in a few millionths of a second; it is stretched over 4 degrees here so it can be followed.
export const BURN_SPAN = [-1.2, 2.8];
export const burnAt = (phi) => (wrap(phi) < SPARK ? 0 : clamp((wrap(phi) - SPOT_BURNS - BURN_SPAN[0]) / (BURN_SPAN[1] - BURN_SPAN[0]), 0, 1));
// What gas the spot holds comes from the paths of the dots of gas (flow.js): the burned gas of one cycle stays at the spot
// until the fresh air of the next reaches it, and the fuel reaches it later still. These two angles are read from the
// paths, and tests/engine/flow.mjs fails if the dots at the spot stop agreeing with them.
export const SPOT_FRESH = 35, SPOT_FUEL = 268;
export const SWEEP = 16;      // the change of gas at the spot is drawn over this many degrees, so that it can be followed
// how much of the gas at the spot is fresh, 0 to 1, as the fresh air of this cycle replaces the burned gas of the last
export const freshAt = (phi) => { const p = wrap(phi); return p > 360 ? 0 : clamp((p - SPOT_FRESH + SWEEP / 2) / SWEEP, 0, 1); };
export function gasAt(phi) {
  phi = wrap(phi);
  const x = burnAt(phi), p = pressure(phi), u = freshAt(phi), old = phi < SPARK ? 1 - u : 0;
  // the burned gas left at the spot cools as its pressure falls, until the fresh air replaces it
  const T = old > 0 ? mix(tempMean(phi), tempBurned(719.5) * Math.pow(p / pressure(719.5), 0.24 / 1.24), old) : x <= 0 ? tempUnburned(phi) : mix(tempUnburned(phi), tempBurned(phi), smooth(0, 1, x));
  return { p, T, burn: x, old, perNm3: p / (K_B * T) * 1e-27, fuel: phi > SPOT_FUEL && x < 1 };
}
// One fuel molecule's worth of a mixture with exactly enough air: C8H18 + 12.5 O2 (+ 47 N2) -> 8 CO2 + 9 H2O (+ 47 N2)
export const MIX = { fuel: 2, o2: 25, n2: 94, co2: 16, h2o: 18 };
export const GROUP_BEFORE = MIX.fuel + MIX.o2 + MIX.n2, GROUP_AFTER = MIX.co2 + MIX.h2o + MIX.n2;
// how many molecules the group is: the burned group until the fresh gas has replaced it at the spot
export const groupCount = (phi) => { const g = gasAt(phi); return mix(GROUP_BEFORE, GROUP_AFTER, Math.max(g.burn, g.old)); };
// the edge, in nm, of the cube that this group of molecules fills
export function groupEdge(phi) { return Math.cbrt(groupCount(phi) / gasAt(phi).perNm3); }
// how many times faster the molecules move once burned, at the spot: the square root of the temperatures' ratio
export const FASTER = Math.sqrt(tempBurned(SPOT_BURNS + BURN_SPAN[1]) / tempUnburned(SPOT_BURNS + BURN_SPAN[0]));

export const STROKES = ['Intake', 'Compression', 'Power', 'Exhaust'];
export const strokeOf = (phi) => Math.floor(wrap(phi) / 180);
