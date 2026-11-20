// Checks how the gas moves on the Engine page (js/engine/flow.js) without a browser: works out the dots' paths as
// the page does and fails if gas is made or lost, sits unevenly, is inside metal, or leaves any way but down the
// exhaust pipe.
//
//   node tests/engine/flow.mjs
import * as M from '../../js/engine/model.js';
import * as F from '../../js/engine/flow.js';

let fails = 0;
const ok = (cond, what) => { if (!cond) { fails++; console.log('FAIL ' + what); } };
const run = () => { const g = F.build(); let r; while (!(r = g.next()).done); return r.value; };
const t0 = Date.now(), P = run(), at = [0, 0, 0];
console.log(`${P.n} dots come in each cycle; their paths took ${((Date.now() - t0) / 1000).toFixed(1)} s to work out and hold ${P.time.length} points`);

// every dot of air comes in along the intake pipe, every dot of fuel at the injector's tip, and all leave along the exhaust pipe
let stay = 0;
for (let i = 0; i < P.n; i++) {
  const a = P.start[i], b = P.start[i + 1] - 1;
  ok(b > a, `dot ${i} has no path`); if (b <= a) continue;
  if (P.fuel[i]) ok(Math.hypot(P.pos[a * 3] * 1e-5 - F.INJ[0], P.pos[a * 3 + 1] * 1e-5 - F.INJ[1], P.pos[a * 3 + 2] * 1e-5 - F.INJ[2]) < 1e-4 && Math.abs(P.time[a] - P.injT[i]) < 1e-3, `fuel dot ${i} does not start at the injector's tip when it sprays`);
  else ok(P.pos[a * 3 + 2] * 1e-5 > F.Z_END, `dot ${i} does not start in the intake pipe`);
  if (P.pos[b * 3 + 2] * 1e-5 > -F.Z_END) stay++;
  for (let k = a; k < b; k++) if (!(P.time[k + 1] > P.time[k])) { ok(false, `dot ${i}'s path goes back in time`); break; }
}
ok(stay < P.n * 0.02, `${stay} of ${P.n} dots never leave by the exhaust pipe (a few may be let go after four cycles)`);

// through the cycle: as many dots in the cylinder as the model has gas there, evenly spread, none in metal. The air's
// dots are one cycle's charge less the fuel's share, and the fuel's come in through the injector as it sprays.
const charge = F.gasIn(M.IVC) / P.perDot;
let nFuel = 0; for (let i = 0; i < P.n; i++) nFuel += P.fuel[i];
const sprayed = (phi) => { let k = 0; for (let i = 0; i < P.n; i++) if (P.fuel[i] && P.injT[i] <= phi) k++; return k; };
const fresh = (phi) => (phi <= M.IVC ? M.clamp((F.gasIn(phi) - F.gasIn(0)) / (F.gasIn(M.IVC) - F.gasIn(0)), 0, 1) : 1);
let worst = 0, worstAt = 0, inMetal = 0, seen = 0, uneven = 0, unevenAt = 0;
for (let phi = 0; phi < 720; phi += 5) {
  const top = M.pistonTop(phi), h = M.DECK - top, bins = [0, 0, 0, 0]; let n = 0;
  for (let i = 0; i < P.n; i++) for (let k = 0; k < P.cycles; k++) {
    if (!F.at(P, i, phi + 720 * k, at, k)) continue; seen++;
    if (Math.abs(at[2]) < F.Z_END && F.spaceDist(at[0], at[1], at[2], top) > 0.0008) inMetal++;      // past Z_END the pipes are not drawn, nor the dots
    if (!F.inChamber(at[0], at[1], at[2])) continue; n++;
    if (at[1] < M.DECK) bins[Math.min(3, Math.floor((at[1] - top) / h * 4))]++;
  }
  const want = F.gasIn(phi) / P.perDot - nFuel * fresh(phi) + (phi <= M.IVC ? sprayed(phi) : nFuel), err = Math.abs(n - want) / charge;
  if (err > worst) { worst = err; worstAt = phi; }
  // (the burn and the spray are meant to be uneven; the burn is checked below)
  if (h > 0.03 && !F.burnRoom(phi) && !(phi > M.INJECT[0] && phi < M.INJECT[1] + 60)) { const each = h / 4 * M.AREA * F.density(phi) / P.perDot; for (const b of bins) if (Math.abs(b - each) / each > uneven) { uneven = Math.abs(b - each) / each; unevenAt = phi; } }
}
ok(worst < 0.03, `the dots in the cylinder differ from the model's gas by ${(worst * 100).toFixed(1)}% of a full charge at ${worstAt}° (3% allowed)`);
ok(inMetal < seen * 0.002, `${inMetal} of ${seen} dot positions are more than 0.8 mm inside metal`);
ok(uneven < 0.25, `a quarter of the cylinder's height holds ${(uneven * 100).toFixed(0)}% more or less gas than its share (25% allowed) at ${unevenAt}°`);
console.log(`dots in the cylinder against the model: worst ${(worst * 100).toFixed(1)}% of a full charge, at ${worstAt}°; most uneven quarter ${(uneven * 100).toFixed(0)}%, at ${unevenAt}°`);

// while the flame spreads, the burned gas takes about three times the room of the unburned gas beside it (E times, by
// the model's temperatures). First the move itself, on evenly spread gas; then the dots, against how crowded the same
// sphere was just before the spark (the dots are not quite evenly spread to begin with).
const ratio = (phi, Rf, burnedOf) => {
  const top = M.pistonTop(phi); let nb = 0, nu = 0, inside = 0, vin = 0, vall = 0;
  for (let i = 0; i < P.n; i++) for (let k = 0; k < P.cycles; k++) {
    if (!F.at(P, i, phi + 720 * k, at, k) || !F.inChamber(at[0], at[1], at[2])) continue;
    const near = Math.hypot(at[0], at[1] - M.PLUG_GAP[1], at[2]) < Rf, burned = burnedOf ? burnedOf(i, phi + 720 * k) : near;
    if (burned) nb++; else nu++; if (near && !burned) inside++;
  }
  for (let s = 0; s < 60000; s++) { const x = (2 * hash01(s, 1) - 1) * M.BORE, z = (2 * hash01(s, 2) - 1) * M.BORE, y = top + hash01(s, 3) * (M.DECK + M.ROOF - top);
    if (!F.inChamber(x, y, z)) continue; vall++; if (Math.hypot(x, y - M.PLUG_GAP[1], z) < Rf) vin++; }
  return { dens: (nb / vin) / (nu / (vall - vin)), nb, inside };
};
const hash01 = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
for (const phi of [350, 360, 370]) {
  const R = F.burnRoom(phi), top = M.pistonTop(phi), p = [0, 0, 0]; let nb = 0, vin = 0, vall = 0;
  for (let s = 0; s < 100000; s++) { const x = (2 * hash01(s, 4) - 1) * M.BORE, z = (2 * hash01(s, 5) - 1) * M.BORE, y = top + hash01(s, 6) * (M.DECK + M.ROOF - top);
    if (!F.inChamber(x, y, z)) continue; vall++; if (Math.hypot(x, y - M.PLUG_GAP[1], z) < R.Rf) vin++;
    p[0] = x; p[1] = y; p[2] = z; F.expand(p, top, R.Rf, R.E); if (Math.hypot(p[0], p[1] - M.PLUG_GAP[1], p[2]) < R.Rf) nb++; }
  const d = (nb / vin) / ((vall - nb) / (vall - vin));
  ok(Math.abs(d * R.E - 1) < 0.05, `at ${phi}° evenly spread gas, once burned, is ${d.toFixed(3)} times as dense as unburned (want 1/${R.E.toFixed(2)})`);
}
for (const phi of [350, 360]) {
  const R = F.burnRoom(phi), burnedOf = (i, t) => { for (let b = 0; b < 4; b++) { const bt = P.burn[i * 4 + b]; if (bt <= t && bt > t - 360) return true; } return false; };
  const now = ratio(phi, R.Rf, burnedOf), before = ratio(M.SPARK - 1, R.Rf), d = now.dens / before.dens;
  ok(now.nb > 20 && Math.abs(d * R.E - 1) < 0.35, `at ${phi}° the burned dots are ${(1 / d).toFixed(2)} times thinner than before the spark, against the unburned (want ${R.E.toFixed(2)})`);
  ok(now.inside < 3, `at ${phi}° ${now.inside} unburned dots sit inside the flame`);
  console.log(`at ${phi}°: ${now.nb} burned dots; burned gas ${(1 / d).toFixed(2)} times thinner than unburned (model ${R.E.toFixed(2)})`);
}

// dots pass the valves only while they are open
for (const [phi, name] of [[300, 'compression'], [420, 'power']]) {
  let moved = 0;
  for (let i = 0; i < P.n; i++) for (let k = 0; k < P.cycles; k++) {
    if (!F.at(P, i, phi + 720 * k, at, k)) continue; const inA = F.inChamber(at[0], at[1], at[2]);
    if (F.at(P, i, phi + 40 + 720 * k, at, k) && inA !== F.inChamber(at[0], at[1], at[2])) moved++;
  }
  ok(moved === 0, `${moved} dots pass a shut valve during ${name}`);
}

// the same paths every time
{ const Q = run(); let same = Q.time.length === P.time.length; for (let i = 0; same && i < P.pos.length; i += 97) same = P.pos[i] === Q.pos[i]; ok(same, 'two runs give different paths'); }

console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
