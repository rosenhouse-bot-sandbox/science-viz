// Writes screenshots of the Overshoot saccades page for a reviewer to look at: each stop with healthy and poor
// pursuit, the moment after an overshoot saccade lands, the muscles during a saccade, the camera between stops, and
// a phone at twice the sharpness.
//
//   node tests/saccade/shots.mjs <out dir>
import fs from 'node:fs';
import path from 'node:path';
import { findChromium, serve, SOFT_GL } from '../lib/serve.mjs';

const out = path.resolve(process.argv[2] || path.join(import.meta.dirname, 'out'));
fs.mkdirSync(out, { recursive: true });
const { server, base } = await serve({ at: 'saccade/' });
const browser = await findChromium().launch({ args: SOFT_GL });
for (const [tag, w, h, dsf] of [['desktop', 1280, 800, 1], ['phone', 390, 844, 2]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, hasTouch: w < 600 });
  const errs = []; page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(base);
  await page.waitForFunction(() => window.__saccade?.frame, null, { timeout: 60000 });
  const go = (o) => page.evaluate((o) => {
    const s = window.__saccade; s.st.play = false; s.settle();
    if (o.cond) { s.st.cond = o.cond; s.sim.set({ cond: o.cond }); }
    if (o.sacc) { s.st.sacc = o.sacc; s.sim.set({ sacc: o.sacc }); }
    if (o.z !== undefined) s.st.z = o.z;
    if (o.run) s.sim.advance(o.run);
    // stop just after an overshoot saccade lands (or, with o.mid, halfway through a saccade)
    if (o.after || o.mid) { const n0 = s.sim.s.events.length; for (let i = 0; i < 6000; i++) { s.sim.advance(0.001); const q = s.sim.s.sac; if (o.mid && q && s.sim.s.t - q.t0 >= q.D / 2) break; const e = s.sim.s.events[s.sim.s.events.length - 1]; if (o.after && s.sim.s.events.length > n0 && e.kind === o.after) { s.sim.advance(o.wait || 0.02); break; } } }
    s.redraw();
  }, o);
  const shot = async (name, o) => { await go(o); await page.waitForTimeout(200); await page.screenshot({ path: path.join(out, `${tag}-${name}.png`) }); };
  await shot('1-screen-poor-overshoot', { cond: 'poor', sacc: 'overshoot', z: 0, run: 2, after: 'overshoot' });
  await shot('2-screen-poor-accurate', { cond: 'poor', sacc: 'accurate', z: 0, run: 2 });
  await shot('2b-screen-healthy', { cond: 'healthy', sacc: 'accurate', z: 0, run: 2 });
  await shot('3-eyes-poor', { cond: 'poor', sacc: 'overshoot', z: 1, after: 'overshoot' });
  await shot('4-muscles-mid-saccade', { cond: 'poor', z: 2, mid: true });
  if (tag === 'desktop') for (const z of [0.25, 0.5, 0.75, 1.25, 1.5, 1.75]) await shot(`5-between-${z}`, { z });
  console.log(tag, 'errors', JSON.stringify(errs));
  await page.close();
}
await browser.close(); server.close();
