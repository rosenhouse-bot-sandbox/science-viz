// Checks the Engine page's model without a browser: the four strokes and what each valve does in them, that no
// valve reaches the piston, the camshafts' half speed, the burning order, the pressure through the cycle, the flow
// through the valves (with the pressure, no faster than sound, no gas made or lost), the one burn that the pressure
// and the flame front share, the gas at the spot the Molecules scale looks at, and the chemistry (every atom of the
// fuel and the oxygen is in a product). Also checks that the sizes written into the shaders are the model's and that
// the numbers in the page's words are the model's. Fails if a number leaves its range or an event happens out of order.
//
//   node tests/engine/model.mjs
import * as M from '../../js/engine/model.js';
import { ATOM, SHAPES, count, makeGroup, place, tiles, copies, MAX_ATOMS, MAX_COPIES } from '../../js/engine/mol.js';
import { WORLD_FS } from '../../js/engine/shaders.js';
import { readFileSync } from 'node:fs';
const MAIN_JS = readFileSync(new URL('../../js/engine/main.js', import.meta.url), 'utf8');
import { staleStamp } from '../stamp.mjs';

let fails = 0;
{ const e = staleStamp('engine'); if (e) { fails++; console.log('FAIL ' + e); } }
const ok = (cond, what) => { if (!cond) { fails++; console.log('FAIL ' + what); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---- geometry
ok(near(M.BORE * 2, 0.084, 1e-9) && near(M.CRANK * 2, 0.090, 1e-9), 'bore 84 mm, stroke 90 mm');
ok(near(M.V_SWEPT * 4 * 1e3, 2.0, 0.01), `four cylinders sweep 2.0 liters (${(M.V_SWEPT * 4e3).toFixed(3)})`);
ok(M.RATIO > 10 && M.RATIO < 11, `compression ratio ${M.RATIO.toFixed(2)} is between 10 and 11`);
ok(near(M.pistonTop(0), M.pistonTop(360), 1e-12) && near(M.TOP_TDC - M.TOP_BDC, 2 * M.CRANK, 1e-12), 'the piston is at the top at 0° and 360°, and travels one stroke');
ok(M.TOP_TDC < M.DECK && M.DECK - M.TOP_TDC < 0.003, 'at the top the piston stops just below the top of the block');
for (let a = 0; a < 720; a += 1) {
  const up = M.pistonTop(a + 0.5) > M.pistonTop(a), s = M.strokeOf(a);
  ok(up === (s === 1 || s === 3), `the piston goes ${s === 1 || s === 3 ? 'up' : 'down'} at ${a}° (${M.STROKES[s]})`);
  ok(near(M.volume(a), M.V_CLEAR + M.AREA * (M.TOP_TDC - M.pistonTop(a)), 1e-12) && M.volume(a) >= M.V_CLEAR - 1e-12, `volume at ${a}°`);
}

// ---- valves: which is open in which stroke, and never the piston
for (let a = 0; a < 720; a += 0.5) {
  const li = M.liftIn(a), le = M.liftEx(a), s = M.strokeOf(a);
  ok(li >= 0 && li <= M.LIFT + 1e-12 && le >= 0 && le <= M.LIFT + 1e-12, `valve lift within 0 to ${M.LIFT * 1e3} mm at ${a}°`);
  if (a > 230 && a < 480) ok(li === 0 && le === 0, `both valves are shut at ${a}° (${M.STROKES[s]})`);
  if (a > 20 && a < 170) ok(li > 0.0002 && le === 0, `only the intake valve is open at ${a}°`);
  if (a > 550 && a < 700) ok(le > 0.0002 && li === 0, `only the exhaust valve is open at ${a}°`);
  ok(M.valveGap(a) > 0.002, `a valve comes within ${(M.valveGap(a) * 1e3).toFixed(1)} mm of the piston at ${a}°`);
}
ok(M.liftIn(M.IVO + 1) > 0 && M.liftIn(M.IVO - 1) === 0 && M.liftIn(M.IVC - 1) > 0 && M.liftIn(M.IVC + 1) === 0, 'the intake valve opens and shuts at its stated angles');
ok(M.liftEx(M.EVO + 1) > 0 && M.liftEx(M.EVO - 1) === 0 && M.liftEx(M.EVC - 1) > 0 && M.liftEx(M.EVC + 1) === 0, 'the exhaust valve opens and shuts at its stated angles');
ok(M.IVO < 0 && M.IVO > -30 && M.IVC > 180 && M.IVC < 250 && M.EVO > 470 && M.EVO < 540 && M.EVC > 720 && M.EVC < 750, 'valve timing is in the usual range');
// camshafts: half the crankshaft's speed, and each bump points at its valve when the valve is widest open
for (const ex of [false, true]) {
  ok(near(M.camAngle(100 + 720, ex) - M.camAngle(100, ex), 360, 1e-9), 'a camshaft turns once in two turns of the crankshaft');
  let best = 0, at = 0; for (let a = 0; a < 720; a += 0.5) { const l = ex ? M.liftEx(a) : M.liftIn(a); if (l > best) { best = l; at = a; } }
  ok(Math.abs(((M.camAngle(at, ex) % 360) + 540) % 360 - 180) < 0.6, `the ${ex ? 'exhaust' : 'intake'} bump points at its valve at full lift`);
}

// ---- four cylinders: burning order 1, 3, 4, 2, half a turn apart
{
  const fires = [1, 2, 3, 4].map((c) => { for (let a = 0; a < 720; a += 0.5) if (near(M.phiOf(a, c), M.SPARK, 0.01)) return [a, c]; return [-1, c]; }).sort((p, q) => p[0] - q[0]);
  const order = fires.map((f) => f[1]), i1 = order.indexOf(1), turned = [...order.slice(i1), ...order.slice(0, i1)];
  ok(turned.join() === M.FIRING.join() && M.FIRING.join() === '1,3,4,2', `burning order is ${turned.join(', ')}`);
  for (let i = 1; i < 4; i++) ok(near(fires[i][0] - fires[i - 1][0], 180, 0.01), 'sparks are 180° apart');
  ok(M.phiOf(123, 4) === 123, 'the page follows cylinder 4');
  for (let a = 0; a < 720; a += 7) ok([1, 2, 3, 4].filter((c) => M.strokeOf(M.phiOf(a, c)) === 2).length === 1, `one cylinder is on its power stroke at ${a}°`);
  for (let a = 0; a < 720; a += 7) ok(near(M.pistonTop(M.phiOf(a, 1)), M.pistonTop(M.phiOf(a, 4)), 1e-9) && near(M.pistonTop(M.phiOf(a, 2)), M.pistonTop(M.phiOf(a, 3)), 1e-9), 'pistons 1 and 4 move together, and 2 and 3');
}

// ---- spark, burn, pressure
ok(M.SPARK > 320 && M.SPARK < 350, 'the spark comes 10 to 40° before the top');
ok(M.FLAME_OUT > 365 && M.FLAME_OUT < 395, `the front reaches the walls at ${M.FLAME_OUT.toFixed(0)}°`);
{ const ms = (M.FLAME_OUT - M.SPARK) / M.DEG_PER_S * 1e3, v = M.FAR / (ms / 1e3); ok(ms > 2 && ms < 4.5 && v > 8 && v < 25, `the burn takes ${ms.toFixed(1)} ms; the front moves ${v.toFixed(0)} m/s`); }
// one burn: the front is where the burned share of the mass puts it, so the pressure, the front and the dots agree
ok(M.burnedShare(M.FLAME_OUT) === 1 && M.burnedShare(M.FLAME_OUT - 2) < 1 && M.burnedShare(M.FLAME_OUT - 2) > 0.95, `all of the mixture has burned when the front has crossed, at ${M.FLAME_OUT.toFixed(1)}°, and not before`);
{ let worst = 0, at = 0, back = 0;
  for (let a = M.SPARK + 8; a < M.FLAME_OUT - 1; a += 1) {
    const xb = M.burnedShare(a), E = M.tempBurned(a) / M.tempUnburned(a), room = xb * E / (1 + xb * (E - 1)), d = Math.abs(M.ballShare(M.flameR(a), M.pistonTop(a)) - room);
    if (d > worst) { worst = d; at = a; }
    if (M.flameR(a + 1) < M.flameR(a) - 1e-9) back++;
  }
  ok(worst < 0.02, `the volume behind the front differs from the room the burned gas takes by ${(worst * 100).toFixed(1)}% of the chamber at ${at}° (2% allowed)`);
  ok(back === 0, 'the front only advances');
  ok(M.flameR(M.SPARK) === 0 && M.flameR(M.FLAME_OUT - 0.6) > 0.9 * M.FAR && M.flameR(M.FLAME_OUT - 0.6) <= M.FAR + 1e-9, `as the burn ends the front is ${(M.flameR(M.FLAME_OUT - 0.6) * 1e3).toFixed(0)} mm from the plug; the farthest corner is ${(M.FAR * 1e3).toFixed(0)} mm away`);
}
ok(M.SPOT_BURNS > M.SPARK && M.SPOT_BURNS < M.FLAME_OUT, 'the spot the Molecules scale looks at burns while the front is crossing');
ok(near(M.DEG_PER_S, M.RPM * 6, 1e-9) && near(1e6 / M.DEG_PER_S, 69.4, 0.1), '1° of crank takes 69 millionths of a second at 2,400 turns a minute');
ok(near(M.burnedShare(M.SPARK), 0, 1e-9) && M.burnedShare(400) > 0.97, 'the burn starts at the spark and is over by 40° after the top');
ok(M.PEAK.p / M.ATM > 18 && M.PEAK.p / M.ATM < 30 && M.PEAK.phi > 368 && M.PEAK.phi < 382, `peak pressure ${(M.PEAK.p / M.ATM).toFixed(1)} atm at ${M.PEAK.phi}°`);
{ const pc = M.pressure(M.SPARK) / M.ATM; ok(pc > 4 && pc < 9, `pressure at the spark is ${pc.toFixed(1)} atm`); }
for (let a = 0; a < 720; a += 0.5) {
  const p = M.pressure(a), g = M.gasAt(a);
  ok(p > 0.3e5 && p <= M.PEAK.p + 1, `pressure is in range at ${a}°`);
  ok(Math.abs(M.pressure(a + 0.5) - p) < 0.9e5, `pressure does not jump at ${a}°`);
  ok(g.T > 300 && g.T < 2700, `temperature at the spot is ${g.T.toFixed(0)} K at ${a}°`);
  ok(g.perNm3 > 0.0005 && g.perNm3 < 0.5, `molecules per cubic nanometre at ${a}°`);
  if (a > M.IVC && a < M.SPARK) ok(M.pressure(a + 0.5) > p && M.tempUnburned(a + 0.5) >= M.tempUnburned(a), `squeezing raises pressure and temperature at ${a}°`);
}
ok(M.tempUnburned(M.SPARK) > 550 && M.tempUnburned(M.SPARK) < 800, 'the mixture is 550 to 800 K at the spark');
ok(M.tempBurned(M.SPOT_BURNS) > 2200 && M.tempBurned(M.SPOT_BURNS) < 2600, 'freshly burned gas is 2,200 to 2,600 K');
ok(M.pressure(100) < M.P_IN && M.pressure(100) > 0.9 * M.P_IN && M.P_IN < M.ATM, `during intake the cylinder is below outside pressure (the throttle is mostly shut), and a little below the intake pipe's, which is what draws the air in (${(M.pressure(100) / M.ATM).toFixed(3)} atm against ${(M.P_IN / M.ATM).toFixed(3)})`);

// ---- flow through the valves: with the pressure, no faster than sound, and no gas made or lost
{
  const ring = (lift, r) => M.VALVE_CD * 2 * Math.min(2 * Math.PI * r * lift, Math.PI * (r - 0.003) ** 2);
  // the most that passes an opening in a second: at the speed of sound in it (for the ratio of heats 1.36, the stiffest gas the model uses)
  const sonic = (p, T, A) => { const g = 1.36; return A * p / Math.sqrt(287 * T) * Math.sqrt(g) * Math.pow(2 / (g + 1), (g + 1) / (2 * (g - 1))); };
  let fast = 0, fastAt = 0, against = 0, againstAt = 0, lost = 0, shutFlow = 0;
  for (let a = 0; a < 720; a += 0.5) {
    const b = a + 0.5, dt = 0.5 / M.DEG_PER_S, pa = M.pressure(a), pb = M.pressure(b), pHi = Math.max(pa, pb), pLo = Math.min(pa, pb), mid = a + 0.25;
    const fe = M.throughExhaust(a, b), fi = M.throughIntake(a, b), aE = ring(Math.max(M.liftEx(a), M.liftEx(b)), M.VALVE_R[1]), aI = ring(Math.max(M.liftIn(a), M.liftIn(b)), M.VALVE_R[0]);
    if (M.liftEx(mid) === 0 && M.liftEx(a) === 0 && M.liftEx(b) === 0 && fe !== 0) shutFlow++;
    if (M.liftIn(mid) === 0 && M.liftIn(a) === 0 && M.liftIn(b) === 0 && fi !== 0) shutFlow++;
    // out of the cylinder: from the cylinder's gas; into it: from the pipe's
    const capE = fe > 0 ? sonic(pHi, Math.max(M.tempMean(a), M.tempMean(b)) * 0.9, aE) : sonic(M.P_OUT, M.T_EX * 0.9, aE), capI = fi < 0 ? sonic(pHi, Math.max(M.tempMean(a), M.tempMean(b)) * 0.9, aI) : sonic(M.P_IN, M.T_FRESH, aI);
    for (const [f, cap] of [[Math.abs(fe), capE], [Math.abs(fi), capI]]) if (f > 1e-12) { const r = f / (cap * dt); if (r > fast) { fast = r; fastAt = a; } }
    if ((pLo > M.P_OUT * 1.01 && fe < -1e-12) || (pHi < M.P_OUT * 0.99 && fe > 1e-12) || (pLo > M.P_IN * 1.01 && fi > 1e-12) || (pHi < M.P_IN * 0.99 && fi < -1e-12)) { against++; againstAt = a; }
    lost = Math.max(lost, Math.abs(M.massIn(b) - M.massIn(a) - fi + fe) / M.massIn(M.IVC + 1));
  }
  ok(fast <= 1.02, `gas passes a valve at ${fast.toFixed(2)} times what the speed of sound allows, at ${fastAt}°`);
  ok(against === 0, `gas goes through a valve against the pressure in ${against} half degrees (the last at ${againstAt}°)`);
  ok(shutFlow === 0, 'gas passes a shut valve');
  ok(lost < 1e-6 && near(M.massIn(0), M.massIn(720), 1e-9 * M.massIn(300)) && near(M.pressure(0), M.pressure(720), 1), `the gas in the cylinder changes only by what passes the valves (worst ${(lost * 100).toExponential(1)}% of a charge in half a degree)`);
  ok(near(M.massIn(M.IVC + 5), M.massIn(M.EVO - 5), 1e-12), 'with both valves shut the amount of gas is fixed');
  // the exhaust: the gas rushes out through the opening valve before the piston turns, and the piston pushes out the rest
  const early = M.throughExhaust(M.EVO, 540) / M.massIn(M.EVO - 1), pEvo = M.pressure(M.EVO) / M.P_OUT;
  ok(pEvo > 1.5 && early > 0.25 && M.pressure(560) < 1.1 * M.P_OUT, `when the exhaust valve opens the gas is at ${pEvo.toFixed(1)} times the exhaust pipe's pressure; ${(early * 100).toFixed(0)}% of it has left by the bottom of the stroke`);
  for (let a = M.EVO + 1; a < M.EVO + 20; a += 1) ok(M.pressure(a) > 1.5 * M.P_OUT, `the exhaust does not all leave at once: still well above the pipe's pressure at ${a}°`);
  // the top, with both valves a little open: the cylinder is above the intake pipe's pressure, so burned gas goes back into the intake port and comes in again
  let most = 0, mostAt = 0; for (let a = 690; a < 780; a += 0.5) if (M.backIn(a) > most) { most = M.backIn(a); mostAt = a % 720; }
  ok(most > 0 && M.pressure(0) > M.P_IN && M.throughIntake(0, mostAt) < 0 && M.backIn(60) === 0, `at the top ${(most * 1e6).toFixed(1)} mg of burned gas is pushed back into the intake port (most at ${mostAt}°), and all of it has come in again by 60°`);
  ok(near(M.oldShare(M.IVC + 1), M.LEFT_OVER, 1e-9) && M.LEFT_OVER > 0 && M.LEFT_OVER < 0.5 && near(M.oldShare(M.EVO - 1), 1, 1e-9), `the charge holds burned gas left from the last cycle: ${(M.LEFT_OVER * 100).toFixed(1)}% of it`);
  ok(M.throughIntake(180, M.IVC) < 0, 'the rising piston pushes some mixture back before the intake valve shuts');
  // the work of the gas in one cycle is the area inside the loop of pressure against volume
  let work = 0, taken = 0; for (let x = 0; x < 720; x += 0.5) { const w = (M.pressure(x) + M.pressure(x + 0.5)) / 2 * (M.volume(x + 0.5) - M.volume(x)); work += w; if (x < 360 || x >= 540) taken -= w; }
  ok(work > 0 && work > taken, `the gas does ${work.toFixed(0)} J of work in a cycle (${(work * 4 * M.RPM / 120 / 1000).toFixed(1)} kW from four cylinders); the other three strokes take ${taken.toFixed(0)} J`);
}

// ---- the gas at the spot the Molecules scale looks at
{
  ok(M.SPOT_FRESH - M.SWEEP / 2 > 0 && M.SPOT_FRESH + M.SWEEP / 2 < M.INJECT[0], 'fresh air replaces the burned gas at the spot during intake, before the fuel is sprayed');
  ok(M.SPOT_FUEL > M.INJECT[1] && M.SPOT_FUEL < M.SPARK, 'fuel reaches the spot after the spray and before the spark');
  for (let a = 0; a < 720; a += 0.5) {
    const g = M.gasAt(a), h = M.gasAt(a + 0.5);
    ok(g.old >= 0 && g.old <= 1 && (g.old === 0 || a < M.SPOT_FRESH + M.SWEEP / 2), `burned gas of the last cycle is at the spot only until fresh air replaces it (${a}°)`);
    ok(g.fuel === (a > M.SPOT_FUEL && g.burn < 1 && a < 400), `fuel is at the spot only once the mixing gas has brought it, until it burns (${a}°)`);
    ok(Math.abs(h.perNm3 / g.perNm3 - 1) < 0.2, `the gas at the spot does not jump in density at ${a}° (${g.perNm3.toFixed(4)} to ${h.perNm3.toFixed(4)} molecules per cubic nanometer)`);
    ok(Math.abs(M.groupCount(a + 0.5) - M.groupCount(a)) < 1.5, `the group does not jump in size at ${a}°`);
  }
  const more = M.gasAt(M.SPARK).perNm3 / M.gasAt(100).perNm3;
  ok(more > 6.5 && more < 7.5, `at the spark the view holds ${more.toFixed(1)} times as many molecules as during intake (REALISM.md says about seven)`);
  ok(near(M.FASTER ** 2, M.tempBurned(M.SPOT_BURNS + M.BURN_SPAN[1]) / M.tempUnburned(M.SPOT_BURNS + M.BURN_SPAN[0]), 1e-9) && M.FASTER > 1.4 && M.FASTER < 2, `burned molecules move ${M.FASTER.toFixed(2)} times as fast: the square root of the temperatures' ratio`);
  // the burned gas's color and glow go by its temperature
  ok(M.heatOf(M.tempOld(450)) > 0.9 && M.heatOf(M.tempOld(100, false)) === 0 && M.heatOf(M.T_FRESH) === 0, 'burned gas is drawn hot while it is hot, and cooled once it is left over and mixed into the next charge');
  ok(M.glow(M.SPARK) === 0 && M.glow(380) > 10 * M.glow(540) && M.glow(300) === 0, 'the burned gas glows while it is hot, and no more once it has cooled');
  for (let a = M.SPARK + 1; a < 719; a += 0.5) ok(Math.abs(M.glow(a + 0.5) - M.glow(a)) < 3, `the glow does not step at ${a}°`);
}
ok(M.burnAt(M.SPOT_BURNS + M.BURN_SPAN[0] - 1e-6) === 0 && M.burnAt(M.SPOT_BURNS + M.BURN_SPAN[1] + 1e-6) === 1 && near(M.burnAt(M.SPOT_BURNS + (M.BURN_SPAN[0] + M.BURN_SPAN[1]) / 2), 0.5, 1e-6), 'the burn at the spot runs over its stated span');

// ---- chemistry: 2 C8H18 + 25 O2 -> 16 CO2 + 18 H2O, in air
{
  const C = { fuel: { C: 8, H: 18 }, o2: { O: 2 }, n2: { N: 2 }, co2: { C: 1, O: 2 }, h2o: { H: 2, O: 1 } }, mass = { C: 12.011, H: 1.008, O: 15.999, N: 14.007 };
  const tally = (kinds) => { const t = { C: 0, H: 0, O: 0, N: 0 }; for (const k of kinds) for (const [el, n] of Object.entries(C[k])) t[el] += n * M.MIX[k]; return t; };
  const before = tally(['fuel', 'o2', 'n2']), after = tally(['co2', 'h2o', 'n2']);
  ok(JSON.stringify(before) === JSON.stringify(after), `atoms balance: ${JSON.stringify(before)} against ${JSON.stringify(after)}`);
  for (const [shape, formula] of Object.entries({ fuel: C.fuel, o2: C.o2, n2: C.n2, co2: C.co2, h2o: C.h2o })) for (const el of 'CHON') ok(count(shape, el) === (formula[el] || 0), `the drawn ${shape} molecule has ${formula[el] || 0} ${el}`);
  ok(near(M.MIX.n2 / M.MIX.o2, 3.76, 0.02), 'air has 3.76 nitrogen molecules for each oxygen molecule');
  const w = (f) => Object.entries(f).reduce((s, [el, n]) => s + mass[el] * n, 0);
  const afr = (M.MIX.o2 * w(C.o2) + M.MIX.n2 * w(C.n2) * 1.0) / (M.MIX.fuel * w(C.fuel));
  ok(afr > 14.3 && afr < 15.3 && near(M.AIR_FUEL, afr, 0.5), `air to fuel by mass is ${afr.toFixed(1)} to 1 (argon left out)`);
  ok(M.GROUP_BEFORE === 121 && M.GROUP_AFTER === 128, 'the group is 121 molecules before the burn and 128 after');
  // the drawn group: each atom is tracked through the burn, so the count never changes
  const g = makeGroup(), out = new Float32Array(MAX_ATOMS * 8);
  const els = (n) => { const t = {}; for (let i = 0; i < n; i++) { const key = [out[i * 8 + 3].toFixed(4), out[i * 8 + 4].toFixed(3), out[i * 8 + 5].toFixed(3), out[i * 8 + 6].toFixed(3)].join(); t[key] = (t[key] || 0) + 1; } return t; };
  const total = before.C + before.H + before.O + before.N;
  let first = null;
  for (const a of [200, 330, M.SPOT_BURNS - 2, M.SPOT_BURNS, M.SPOT_BURNS + 1, M.SPOT_BURNS + 2, M.SPOT_BURNS + 4, 450, 700, 0, M.SPOT_FRESH - 3, M.SPOT_FRESH, M.SPOT_FRESH + 3, 60]) {
    const box = { x0: -1, x1: 1, y0: -1, y1: 1, dist: 1e6 }, each = copies(tiles(box, M.groupEdge(a))), n = place(g, a, 3.7, out, box), t = els(n);
    ok(n === total * each, `${n} atoms are drawn at ${a.toFixed(1)}° (expected ${total} in each of ${each} copies of the group)`);
    if (!first) first = t; else ok(JSON.stringify(Object.values(t).sort()) === JSON.stringify(Object.values(first).sort()), `the same atoms of each element are drawn at ${a.toFixed(1)}°`);
    for (let i = 0; i < n * 8; i++) ok(Number.isFinite(out[i]), 'atom positions are numbers');
  }
  ok(Object.keys(ATOM).sort().join('') === 'CHNO' && Object.keys(SHAPES).length === 5, 'four elements, five kinds of molecule');
  // What the eye sees at the Molecules scale on a desktop screen: the atoms inside the view, which widens with distance.
  // It must hold what the gas's density gives at every angle, also while one gas replaces another, and the mixture's share of fuel.
  const VIEW = { x0: -4.76, x1: 4.3, y0: -3.82, y1: 3.82, dist: 39.7 }, isC = (i) => Math.abs(out[i * 8 + 3] - ATOM.C.r) < 1e-6 && Math.abs(out[i * 8 + 4] - ATOM.C.col[0]) < 1e-6;
  const seen = (a, tau) => { const L = M.groupEdge(a), n = place(g, a, tau, out, VIEW); let all = 0, c = 0;
    for (let i = 0; i < n; i++) { const k = (out[i * 8 + 2] + VIEW.dist) / VIEW.dist, x = out[i * 8], y = out[i * 8 + 1]; if (k > 0.05 && x > VIEW.x0 * k && x < VIEW.x1 * k && y > VIEW.y0 * k && y < VIEW.y1 * k) { all++; if (isC(i)) c++; } }
    // the part of the three layers of copies that is in view, in cubes of the group
    const z0 = Math.max(-1.5 * L, -0.95 * VIEW.dist), z1 = 1.5 * L, room = (VIEW.x1 - VIEW.x0) * (VIEW.y1 - VIEW.y0) * ((z1 + VIEW.dist) ** 3 - (z0 + VIEW.dist) ** 3) / (3 * VIEW.dist ** 2) / L ** 3;
    return { all, c, want: total * room }; };
  for (let a = 0; a < 720; a += a < 60 || a > 680 ? 1 : 7) {
    let all = 0, want = 0; for (let k = 0; k < 12; k++) { const s = seen(a, 1.3 + 2.9 * k); all += s.all; want += s.want; }
    ok(copies(tiles(VIEW, M.groupEdge(a))) <= MAX_COPIES, `the view needs more copies of the group than are kept at ${a}°`);
    ok(all > 0.6 * want && all < 1.5 * want, `at ${a}° the view holds ${(all / 12).toFixed(0)} atoms; the gas's density gives ${(want / 12).toFixed(0)}`);
  }
  for (const a of [290, 300, 315, 330]) {
    let c = 0, all = 0; for (let k = 0; k < 12; k++) { const s = seen(a, 1.3 + 2.9 * k); c += s.c; all += s.all; }
    const share = c / all, mixture = M.MIX.fuel * 8 / total;
    ok(share > 0.5 * mixture && share < 1.6 * mixture, `at ${a}° 1 atom in ${(all / c).toFixed(0)} in view is the fuel's carbon; in the mixture it is 1 in ${(1 / mixture).toFixed(0)}`);
  }
  // the fuel is not at the spot until the mixing gas has brought it: no carbon in view before then
  { let c = 0; for (const a of [60, 120, 200, 250]) for (let k = 0; k < 6; k++) c += seen(a, 0.7 + 3.1 * k).c; ok(c === 0, `${c} carbon atoms are in view before the fuel reaches the spot`); }
  // room: the cube the group fills follows pressure and temperature
  const e0 = M.groupEdge(M.SPARK), e1 = M.groupEdge(M.SPOT_BURNS + 3), e2 = M.groupEdge(100);
  ok(e0 > 7 && e0 < 14 && e1 > e0 && e2 > e0 * 1.6, `the group's cube: ${e2.toFixed(0)} nm at intake, ${e0.toFixed(0)} nm at the spark, ${e1.toFixed(0)} nm just burned`);
}

// ---- the shaders draw the same engine
{
  const num = (name) => { const m = WORLD_FS.match(new RegExp(`\\b${name} = (-?[0-9.]+)`)); return m ? +m[1] : NaN; };
  for (const [name, v] of [['DECK', M.DECK], ['CR', M.CRANK], ['ROD', M.ROD], ['BORE', M.BORE], ['XC', M.XC], ['X4', M.X4], ['GAS_CUT', M.GAS_CUT]]) ok(near(num(name), v, 1e-9), `the shader's ${name} (${num(name)}) is the model's (${v})`);
  ok(WORLD_FS.includes('float OFF[4] = float[4](0., 540., 180., 360.)') && M.OFFSET.join() === '0,540,180,360', 'the shader has the model\'s burning order');
  ok(WORLD_FS.includes(`mod(phi + ${-M.IVO}., 720.) / ${M.IVC - M.IVO}.`) && WORLD_FS.includes(`mod(phi - ${M.EVO}., 720.) / ${M.EVC - M.EVO}.`), 'the shader has the model\'s valve timing');
  ok(!/pow\(max\(phi - /.test(WORLD_FS) && WORLD_FS.includes('uniform vec4 uRf, uGlow;') && /frontOf\[j\] = M\.flameR\(phi\); glowOf\[j\] = M\.glow\(phi\);/.test(MAIN_JS), 'the shader has no flame front or glow of its own: main.js gives it the model\'s for each cylinder');
  ok(WORLD_FS.includes(`phi > ${M.SPARK}. && phi < ${M.SPARK_END}.`) && M.SPARK_END - M.SPARK >= 15, `the shader's spark lasts the model's ${M.SPARK_MS} ms (${M.SPARK_END - M.SPARK}° of crankshaft)`);
  ok(WORLD_FS.includes(`length(q.xy) - ${(M.TIRE_R - 0.012).toFixed(2)}`) && WORLD_FS.includes(`- 0.012; }`), 'the shader\'s tire is the model\'s size');
  ok(WORLD_FS.includes('vec3(0., 0.9455, 0.3256)') && M.VALVE_AXIS.join() === '0,0.9455,0.3256', 'the shader has the model\'s valve axis');
  ok(!WORLD_FS.includes('phi > 70. && phi < 125.'), 'the shader draws no spray of its own: the fuel is dots that leave the injector (flow.js)');
  ok(/glow = M\.glow\(phi\)/.test(MAIN_JS) && /Math\.exp\(-glow \* glowPath\(/.test(MAIN_JS), 'main.js dims the dots behind the burned gas by the glow the shader draws');
  // one cut for the metal and the gas, at fixed planes, and one glow at every zoom
  ok(!/gasCut|uGasCut/.test(MAIN_JS) && !WORLD_FS.includes('uGasCut') && WORLD_FS.includes('float cutX(){ return gSlab ? GAS_CUT : XC; }') && WORLD_FS.includes('if (gEnd && p.x < cutX()) return vec4(0.);'), 'the gas is cut at the metal\'s cross cut, which does not move with the zoom');
  ok(!/j < 3 && was\.end/.test(MAIN_JS) && /cut1 = now\.end \? \(now\.slab \? M\.GAS_CUT : M\.XC\) : -1e9/.test(MAIN_JS), 'every cylinder\'s dots are drawn, cut where the metal is');
  // numbers in the page's words are the model's
  ok(!/nearly twice|1 molecule in 10 |One dot in 15|about 15 m\/s/.test(MAIN_JS) && MAIN_JS.includes('M.FASTER.toFixed(1)') && MAIN_JS.includes('Math.round(1 / M.LEFT_OVER)') && MAIN_JS.includes('Math.round(M.AIR_FUEL + 1)') && MAIN_JS.includes('FRONT_SPEED = M.FAR / (BURN_MS / 1000)'), 'the words on the page take their numbers from the model');
}

console.log(fails ? `${fails} failed` : 'engine model: all checks passed');
process.exit(fails ? 1 : 0);
