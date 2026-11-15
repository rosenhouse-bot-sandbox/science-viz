// Drives every page with a simulated Xbox controller at the Steam Deck's size, 1280 × 800. The
// browser is given a made-up pad (navigator.getGamepads) whose sticks, triggers and buttons the test
// sets. On each page it checks that:
//   - nothing is added to the page before the pad connects;
//   - the ring can reach every control from every other, and really goes where it should;
//   - left and right change a slider, by one notch and then faster, and A presses a control;
//   - the right stick, the triggers and the bumpers do what the page's mapping says, and a trigger
//     half pressed zooms more slowly than one fully pressed;
//   - the picture of the pad lists exactly what is mapped, and nothing moves while it is open;
//   - B goes back, Menu returns to where a visit that came from the Deck began, and there are no errors.
//
//   node tests/gamepad/run.mjs [page ...]     # needs Node 22 and Playwright, installed outside the repository
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
let chromium;
for (const from of [import.meta.url, '/opt/node-tools/', process.execPath]) { try { chromium = createRequire(from)('playwright').chromium; break; } catch { /* try the next place */ } }
if (!chromium) { console.error('Playwright is not installed. Install it outside the repository: npm install -g playwright && npx playwright install chromium'); process.exit(2); }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/the-deck') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>Deck</title><a id="go" href="/?from=deck">Science</a>'); return; }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;

// What each page maps, and how to see from outside that it worked.
const ALL = ['move', 'a', 'b', 'view', 'rs', 'lt', 'rt', 'lb', 'rb'];
const PAGES = {
  home: { path: '', keys: ['move', 'a', 'view'] },
  rainbows: {
    path: 'v2/', keys: ALL, ready: () => !!window.__rainbows,
    look: () => window.__rainbows.cams[window.__rainbows.S.stage].gy, zoom: () => window.__rainbows.cams[window.__rainbows.S.stage].gd,
    stage: () => (window.__rainbows.busy ? null : window.__rainbows.S.stage), idle: () => !window.__rainbows.busy, everyStage: 5,
  },
  vesicle: {
    path: 'vesicle/?still', keys: ALL, blind: true,      // (not spinning or playing by itself; and nothing drawn, see open()) ready: () => document.getElementById('stageNo').textContent !== '',
    look: () => +document.getElementById('orbit').value, zoom: () => +document.getElementById('zoom').value,
    stage: () => document.getElementById('stageNo').textContent,
  },
  optics: {
    path: 'optics/', keys: ['move', 'a', 'b', 'view', 'lb', 'rb'], ready: () => !!window.__optics,
    before: () => { window.__optics.solved.add(window.__optics.LEVELS[0].id); },
    stage: () => window.__optics.S.i,
  },
  graph: {
    path: 'dag/#st=2', keys: ALL.filter((k) => k !== 'lt' && k !== 'rt'), ready: () => document.getElementById('graphFacts').textContent.includes('nodes'),
    stage: () => new URLSearchParams(location.hash.slice(1)).get('st'),
    pick: () => document.getElementById('pick').textContent,
  },
  maple: {
    path: 'maple/#z=1&s=0.3', keys: ALL.filter((k) => k !== 'rs'), ready: () => !!window.__maple, before: () => window.__maple.res(0.25),
    zoom: () => window.__maple.st.z, settle: () => window.__maple.settle(), idle: () => !window.__maple.busy, stage: () => (window.__maple.busy ? null : Math.round(window.__maple.st.z * 1000) / 1000),
  },
};

let fails = 0;
const fail = (what) => { fails++; console.log('FAIL ' + what); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const BTN = { a: 0, b: 1, lb: 4, rb: 5, lt: 6, rt: 7, view: 8, menu: 9, up: 12, down: 13, left: 14, right: 15 };

// `blind` leaves out the 3D drawing itself. Vesicle fusion's hundred thousand lipids take seconds a
// frame without a graphics card, and this test is about the controls, the camera's numbers and the
// page around the picture, all of which carry on the same.
async function open(name, url, blind) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') fail(`${name}: console: ${m.text()}`); });
  page.on('pageerror', (e) => fail(`${name}: ${e.message}`));
  await page.addInitScript(() => {
    const pad = window.__pad = {
      id: 'Simulated Xbox controller', index: 0, connected: true, mapping: 'standard', timestamp: 0, plugged: false, buzzed: 0,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      vibrationActuator: { playEffect() { pad.buzzed++; return Promise.resolve('complete'); } },
    };
    Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value: () => (pad.plugged ? [pad] : []) });
  });
  if (blind) await page.addInitScript(() => { for (const k of ['drawArrays', 'drawArraysInstanced', 'drawElements', 'drawElementsInstanced']) WebGL2RenderingContext.prototype[k] = () => {}; });
  await page.goto(url);
  return page;
}
const frames = (page, n = 3) => page.evaluate((k) => new Promise((r) => { const f = () => (k-- > 0 ? requestAnimationFrame(f) : r()); f(); }), n);
const plug = async (page) => { await page.evaluate(() => { window.__pad.plugged = true; dispatchEvent(new Event('gamepadconnected')); }); await frames(page); };
const set = (page, k, v) => page.evaluate(([i, val]) => { window.__pad.buttons[i] = { pressed: val > 0.5, touched: val > 0, value: val }; }, [BTN[k], v]);
const axes = (page, a) => page.evaluate((v) => { window.__pad.axes = v; }, a);
// A short press, or a flick of a stick: down for exactly two frames however slowly the page is drawing, so that it never counts as held.
const brief = (page, on, off) => page.evaluate(([a, b]) => new Promise((r) => {
  const P = window.__pad, put = (v) => { if (v.i != null) P.buttons[v.i] = { pressed: v.v > 0.5, touched: v.v > 0, value: v.v }; else P.axes = v.axes; };
  put(a); requestAnimationFrame(() => requestAnimationFrame(() => { put(b); requestAnimationFrame(() => requestAnimationFrame(r)); }));
}), [on, off]);
// A hold: for at least so long and at least so many frames (a page drawn in software may take a second a frame).
const hold = (page, on, off, ms, n = 8) => page.evaluate(([a, b, ms, n]) => new Promise((r) => {
  const P = window.__pad, put = (v) => { if (v.i != null) P.buttons[v.i] = { pressed: v.v > 0.5, touched: v.v > 0, value: v.v }; else P.axes = v.axes; }, t0 = performance.now();
  put(a); const f = () => { if (--n > 0 || performance.now() - t0 < ms) requestAnimationFrame(f); else { put(b); requestAnimationFrame(() => requestAnimationFrame(r)); } }; requestAnimationFrame(f);
}), [on, off, ms, n]);
const tap = (page, k) => brief(page, { i: BTN[k], v: 1 }, { i: BTN[k], v: 0 });
const flick = (page, a) => brief(page, { axes: a }, { axes: [0, 0, 0, 0] });
const until = (page, fn, arg, ms = 30000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const here = (page) => page.evaluate(() => { const c = window.__gamepad.cur; return c ? (c.id || c.textContent.trim().slice(0, 30) || c.localName) : null; });

async function reach(page, name, when) {
  // from the ringed control, every other must be reachable by some run of directions
  const lost = await page.evaluate(() => {
    const G = window.__gamepad, all = G.candidates(), seen = new Set([G.cur]), todo = [G.cur];
    while (todo.length) { const el = todo.pop(); for (const d of ['up', 'down', 'left', 'right']) { if (G.keeps(el, d)) continue; const to = G.neighbour(el, d, all); if (to && !seen.has(to)) { seen.add(to); todo.push(to); } } }
    return all.filter((el) => !seen.has(el)).map((el) => el.id || el.textContent.trim().slice(0, 30) || el.localName);
  });
  if (lost.length) fail(`${name}${when}: the ring cannot reach ${lost.join(', ')}`);
  return page.evaluate(() => window.__gamepad.candidates().length);
}

async function run(name) {
  const P = PAGES[name], page = await open(name, base + P.path, P.blind);
  if (P.ready && !await until(page, P.ready, null, 120000)) { fail(`${name}: the page never became ready`); return; }
  await frames(page, 5);
  if (await page.evaluate(() => !!document.querySelector('.gp, link[href*="gamepad.css"]') || window.__gamepad.running)) fail(`${name}: something was added before a controller connected`);
  if (P.before) await page.evaluate(P.before);
  await plug(page);
  if (!await page.evaluate(() => window.__gamepad.running && !!document.querySelector('link[href*="gamepad.css"]'))) fail(`${name}: connecting the controller started nothing`);
  await until(page, () => getComputedStyle(document.querySelector('.gp-ring')).position === 'fixed', null, 5000);      // the stylesheet is in
  if (await page.evaluate(() => !document.querySelector('.gp-ring').hidden)) fail(`${name}: the ring showed before a direction was pressed`);

  // ---- the ring ----
  await tap(page, 'down');
  if (!await here(page)) { fail(`${name}: the D-pad did not bring up the ring`); return; }
  const count = await reach(page, name, '');
  // follow the D-pad and the stick for a while, and see the ring go where the layout says
  for (const d of ['down', 'down', 'right', 'up', 'left', 'down', 'down', 'down', 'up', 'down', 'down', 'down', 'down', 'down', 'right', 'down', 'down', 'up']) {
    const want = await page.evaluate((dir) => { const G = window.__gamepad, c = G.cur; if (G.keeps(c, dir)) return null; const to = G.neighbour(c, dir); window.__want = to || c; return to ? 'moves' : 'stays'; }, d);
    if (!want) continue;
    if (d === 'left' || d === 'up') await tap(page, d);
    else await flick(page, d === 'down' ? [0, 1, 0, 0] : [1, 0, 0, 0]);
    const ok = await page.evaluate(() => {
      const G = window.__gamepad, r = document.querySelector('.gp-ring'), a = r.getBoundingClientRect(), el = G.cur, lab = el.localName === 'input' && el.closest('label'), b = (lab || el).getBoundingClientRect();
      return [G.cur === window.__want, document.activeElement === G.cur, !r.hidden && Math.abs((a.left + a.right - b.left - b.right) / 2) < 8 && Math.abs((a.top + a.bottom - b.top - b.bottom) / 2) < 8 && a.width >= b.width,
        b.top >= -1 && b.bottom <= innerHeight + 1];
    });
    if (!ok[0]) fail(`${name}: ${d} took the ring to ${await here(page)}, not where the layout says`);
    if (want === 'stays') continue;      // (nowhere to go that way: the panel scrolls, and may take the ringed control out of sight)
    await page.waitForTimeout(150);      // (the ring glides)
    const ok2 = await page.evaluate(() => { const ring = document.querySelector('.gp-ring'), a = ring.getBoundingClientRect(), el = window.__gamepad.cur, lab = el.localName === 'input' && el.closest('label'), b = (lab || el).getBoundingClientRect(); return !ring.hidden && Math.abs(a.left - b.left) < 8 && Math.abs(a.top - b.top) < 8 && a.width >= b.width; });
    if (!ok[1]) fail(`${name}: the ringed control (${await here(page)}) does not have the keyboard's focus`);
    if (!ok2) fail(`${name}: the ring is not drawn round ${await here(page)}`);
    if (!ok[3]) fail(`${name}: the ringed control (${await here(page)}) was left off screen`);
    const clear = () => page.evaluate(() => { const el = window.__gamepad.cur, lab = el.localName === 'input' && el.closest('label'), b = (lab || el).getBoundingClientRect(), top = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2); return !top ? 'nothing' : top === el || el.contains(top) || top.contains(el) || (lab && lab.contains(top)) ? '' : `${top.localName}#${top.id}.${top.className}`; });
    if (await clear() && (await page.waitForTimeout(600), await clear())) fail(`${name}: the ringed control (${await here(page)}) is hidden under ${await clear()}`);
  }

  // ---- a slider ----
  const slider = await page.evaluate(() => {
    const G = window.__gamepad, el = G.candidates().find((c) => c.type === 'range'); if (!el) return null;
    G.ringTo(el); el.value = el.min; el.dispatchEvent(new Event('input', { bubbles: true }));
    window.__ev = { input: 0, change: 0 }; el.addEventListener('input', () => window.__ev.input++); el.addEventListener('change', () => window.__ev.change++);
    return { v: +el.value, step: +el.step || 1, span: el.max - el.min };
  });
  if (slider) {
    const val = () => page.evaluate(() => +window.__gamepad.cur.value), notch = slider.step * Math.max(1, Math.ceil(slider.span / slider.step / 200));
    await frames(page); const v0 = await val();
    await tap(page, 'right'); const v1 = await val();
    if (Math.abs(v1 - v0 - notch) > notch * 0.01 + 1e-9) fail(`${name}: one press moved the slider by ${v1 - v0}, not one notch (${notch})`);
    await hold(page, { i: BTN.right, v: 1 }, { i: BTN.right, v: 0 }, 1500, 14);
    const v2 = await val(), ev = await page.evaluate(() => window.__ev);
    if (v2 - v1 < 6 * notch) fail(`${name}: holding right for a second and a half moved the slider only ${v2 - v1}`);
    if (ev.input < 3 || ev.change < 1) fail(`${name}: the slider told the page of ${ev.input} moves and ${ev.change} releases`);
    await flick(page, [-1, 0, 0, 0]);
    if (!(await val() < v2)) fail(`${name}: the stick pushed left did not bring the slider back`);
    if (await page.evaluate(() => window.__gamepad.cur.type) !== 'range') fail(`${name}: left and right moved the ring off the slider`);
  }

  // ---- A ----
  const pressed = await page.evaluate(() => {
    const G = window.__gamepad, el = G.candidates().find((c) => c.type === 'checkbox') || G.candidates().find((c) => c.localName === 'button' && !c.closest('nav, .seg') && !/back|reload|share|more/i.test(c.id + c.className));
    if (!el) return null;
    G.ringTo(el); window.__clicks = 0; el.addEventListener('click', () => window.__clicks++);
    return true;
  });
  if (pressed) {
    const buzz0 = await page.evaluate(() => window.__pad.buzzed);
    await tap(page, 'a');
    const [clicks, buzz1] = await page.evaluate(() => [window.__clicks, window.__pad.buzzed]);
    if (clicks !== 1) fail(`${name}: A pressed ${await here(page)} ${clicks} times`);
    if (buzz1 !== buzz0 + 1) fail(`${name}: A did not rumble once`);
    await tap(page, 'a');       // and put it back
  }

  // ---- the right stick ----
  if (P.look) {
    const a = await page.evaluate(P.look);
    await hold(page, { axes: [0, 0, 1, 0] }, { axes: [0, 0, 0, 0] }, 500); await frames(page, 12); await page.waitForTimeout(600);      // (the stick is eased, so the camera coasts for a third of a second)
    const b = await page.evaluate(P.look);
    if (a === b) fail(`${name}: the right stick did not turn the camera`);
    await hold(page, { axes: [0, 0, 0.1, 0.1] }, { axes: [0, 0, 0, 0] }, 300); await frames(page, 12);
    const c = await page.evaluate(P.look);
    await page.waitForTimeout(300);
    if (c !== b || await page.evaluate(P.look) !== c) fail(`${name}: a stick resting just off centre moved the camera, or it kept moving after the stick was let go`);
  }
  if (P.pick) {
    await flick(page, [0, 0, 1, 0]);
    const one = await page.evaluate(P.pick);
    if (!one) fail(`${name}: a flick of the right stick picked nothing`);
    await flick(page, [0, 0, 1, 0]);
    if (await page.evaluate(P.pick) === one) fail(`${name}: a second flick picked the same thing`);
    if (!(await page.evaluate(() => window.__gamepad.keys().b)).includes('Let go')) fail(`${name}: B is not labelled as letting go`);
    await tap(page, 'b');
    if (await page.evaluate(P.pick) !== '' || !page.url().includes(P.path.split('#')[0])) fail(`${name}: B did not just let go of what was picked`);
  }
  // ---- the bumpers ----
  if (P.stage) {
    await page.emulateMedia({ reducedMotion: 'reduce' });      // (flights between scales are slow when 3D is drawn in software; with reduced motion they are short)
    const settled = async () => { if (P.settle) await page.evaluate(P.settle); if (P.idle) await until(page, P.idle, null, 180000); await page.waitForTimeout(250); return page.evaluate(P.stage); };
    await tap(page, 'lb'); await page.waitForTimeout(300);      // (a slider may have left the page between two scales)
    const s0 = await settled();
    await tap(page, 'rb'); await page.waitForTimeout(300); const s1 = await settled();
    if (s1 === s0) fail(`${name}: the right bumper did not go on from ${s0}`);
    await tap(page, 'lb'); await page.waitForTimeout(300); const s2 = await settled();
    if (s2 !== s0) fail(`${name}: the left bumper went to ${s2}, not back to ${s0}`);
    // the controls differ from scale to scale: the ring must reach all of them at each
    for (let i = 1; i < (P.everyStage || 0); i++) {
      await tap(page, 'rb'); await page.waitForTimeout(300); await settled(); await tap(page, 'down');
      if (!await here(page)) fail(`${name}: no ring at scale ${i + 1}`); else await reach(page, name, ` at scale ${i + 1}`);
    }
  }

  // ---- the triggers ---- (short pulls, so that the zoom does not reach its limit and stop there)
  if (P.zoom) {
    const move = async (k, v) => { const a = await page.evaluate(P.zoom); await hold(page, { i: BTN[k], v }, { i: BTN[k], v: 0 }, 120, 2); await frames(page, 30); await page.waitForTimeout(200); return await page.evaluate(P.zoom) - a; };
    const full = await move('rt', 1), back = await move('lt', 1), part = await move('rt', 0.4);
    if (!full || !back || Math.sign(full) === Math.sign(back)) fail(`${name}: the triggers did not zoom in and out (${full}, ${back})`);
    if (!part || Math.abs(part) > Math.abs(full) * 0.8) fail(`${name}: a trigger part pressed zoomed as fast as one fully pressed (${part} against ${full})`);
    await move('lt', 0.4);
  }
  // ---- a dialog of the page's own ----
  if (name === 'vesicle') {
    await page.click('#modeInfer'); await frames(page, 5);
    await page.evaluate(() => window.__gamepad.ringTo(document.getElementById('mathBtn')));
    await tap(page, 'a'); await tap(page, 'down');
    const inside = await page.evaluate(() => { const d = document.getElementById('math'), G = window.__gamepad; return [d.open, G.candidates().every((c) => d.contains(c)), d.contains(G.cur), d.contains(document.querySelector('.gp-ring'))]; });
    if (!inside.every(Boolean)) fail(`${name}: with the dialog open, [open, only its controls, ring on one, ring drawn in it] = ${inside}`);
    await tap(page, 'b');
    if (await page.evaluate(() => document.getElementById('math').open) || !page.url().includes('vesicle')) fail(`${name}: B did not close the dialog and stay on the page`);
    await page.click('#modeVivo'); await frames(page, 5);
  }

  // ---- the picture of the pad ----
  await tap(page, 'down');
  await tap(page, 'view');
  const pic = await page.evaluate(() => {
    const box = document.querySelector('.gp-help');
    return { open: !box.hidden && box.getBoundingClientRect().width > 0, rows: [...box.querySelectorAll('li:not([hidden])')].map((li) => li.dataset.k), blank: [...box.querySelectorAll('li:not([hidden]) span')].filter((s) => !s.textContent.trim()).length,
      lit: [...new Set([...box.querySelectorAll('svg .on')].map((g) => g.dataset.k))], keys: Object.keys(window.__gamepad.keys()), ring: !document.querySelector('.gp-ring').hidden,
      fits: box.querySelector('.gp-card').scrollWidth <= innerWidth && box.querySelector('.gp-card').getBoundingClientRect().height <= innerHeight };
  });
  const same = (a, b) => [...a].sort().join() === [...b].sort().join();
  if (!pic.open) fail(`${name}: View did not show the picture`);
  if (!same(pic.rows, P.keys) || !same(pic.lit, P.keys) || !same(pic.keys, P.keys) || pic.blank) fail(`${name}: the picture lists ${pic.rows}, lights ${pic.lit}; the mapping is ${P.keys}`);
  if (!pic.fits) fail(`${name}: the picture does not fit the screen`);
  if (pic.ring) fail(`${name}: the ring shows through the picture`);
  // nothing else answers while it is open
  const at = await here(page), st = P.stage ? await page.evaluate(P.stage) : 0;
  await tap(page, 'down'); await tap(page, 'rb'); await set(page, 'rt', 1); await axes(page, [0, 0, 1, 0]); await frames(page, 6);
  if (!await page.evaluate(() => document.querySelector('.gp-pad [data-k=rb]') && document.querySelector('.gp-pad [data-k=rt]').classList.contains('down') && document.querySelector('.gp-pad [data-k=rs]').classList.contains('down'))) fail(`${name}: the picture does not light the parts being pressed`);
  await set(page, 'rt', 0); await axes(page, [0, 0, 0, 0]); await frames(page);
  await tap(page, 'view');
  if (await page.evaluate(() => !document.querySelector('.gp-help').hidden)) fail(`${name}: View did not hide the picture`);
  await page.waitForTimeout(300);
  if (await here(page) !== at || (P.stage && await page.evaluate(P.stage) !== st)) fail(`${name}: the page answered the controller while the picture was open`);
  await tap(page, 'view'); await tap(page, 'b');
  if (await page.evaluate(() => !document.querySelector('.gp-help').hidden) || !page.url().startsWith(base + P.path.split(/[?#]/)[0])) fail(`${name}: B did not just close the picture`);
  await tap(page, 'menu'); await page.waitForTimeout(200);
  if (!page.url().startsWith(base + P.path.split(/[?#]/)[0])) fail(`${name}: Menu left the page, though it was not opened from the Deck`);

  // ---- unplugging, and B ----
  await page.evaluate(() => { window.__pad.plugged = false; dispatchEvent(new Event('gamepaddisconnected')); }); await frames(page);
  if (await page.evaluate(() => window.__gamepad.running || !document.querySelector('.gp-ring').hidden)) fail(`${name}: unplugging the controller left the ring up`);
  await plug(page);
  if (name === 'home') { await tap(page, 'b'); await page.waitForTimeout(200); if (page.url() !== base) fail(`${name}: B left the landing page`); }
  else {
    await set(page, 'b', 1);
    if (!await until(page, (u) => location.href === u, base, 60000)) fail(`${name}: B did not go back to the landing page (at ${page.url()})`);
  }
  console.log(`${name}: ${count} controls, all reached by the ring`);
  await page.context().close();
}

// A visit that starts at the Deck: in through the landing page, on to an experience with A, and Menu goes back.
async function deck() {
  const page = await open('deck', base + 'the-deck');
  await page.click('#go'); await page.waitForURL(base + '?from=deck');
  await plug(page);
  if (await page.evaluate(() => window.__gamepad.keys().menu) !== 'Back to the Deck') fail('deck: Menu is not labelled on a visit from the Deck');
  await tap(page, 'down');
  const first = await page.evaluate(() => window.__gamepad.cur.getAttribute('href'));
  await tap(page, 'down'); await tap(page, 'down');
  const href = await page.evaluate(() => window.__gamepad.cur.getAttribute('href'));
  if (href === first) fail('deck: the ring did not move down the list of experiences');
  await set(page, 'a', 1);
  if (!await until(page, (u) => location.href === u, base + href, 10000)) { fail(`deck: A did not open ${href}`); return; }
  // A is still held as the new page opens: it must not press anything there
  await until(page, () => !!window.__gamepad);
  await page.evaluate(() => { window.__pad.buttons[0] = { pressed: true, touched: true, value: 1 }; window.__pad.plugged = true; dispatchEvent(new Event('gamepadconnected')); });
  await frames(page, 5); await set(page, 'a', 0); await frames(page);
  if (!page.url().startsWith(base + href)) fail('deck: A held over from the page before pressed something');
  await set(page, 'menu', 1);
  if (!await until(page, (u) => location.href === u, base + 'the-deck', 10000)) fail(`deck: Menu did not return to the Deck (at ${page.url()})`);
  else console.log('deck: in from the Deck, on to ' + href + ' with A, and back with Menu');
  await page.context().close();
}

const only = process.argv.slice(2);
for (const name of Object.keys(PAGES)) if (!only.length || only.includes(name)) await run(name).catch((e) => fail(`${name}: ${e.message.split('\n')[0]} ${(e.stack.match(/run\.mjs:\d+/g) || []).join(' ')}`));
if (!only.length || only.includes('deck')) await deck().catch((e) => fail(`deck: ${e.message.split('\n')[0]}`));
await browser.close(); server.close();
console.log(fails ? `${fails} failure${fails > 1 ? 's' : ''}` : 'Controller: every page passed');
process.exit(fails ? 1 : 0);
