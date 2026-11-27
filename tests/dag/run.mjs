// Lays out every sample graph with both methods over a spread of settings, without a browser, and
// fails if a layout breaks a rule that must always hold:
//   - every coordinate is a number, and no two nodes overlap in the finished picture
//   - layered: once the chosen edges are turned, no cycle is left, and every edge runs forward
//     through the layers (turned edges run backward)
//   - a routed edge starts on its source's border and ends on its target's
//   - with boxes, every node is inside its group's box and no two boxes overlap
//   - the same settings give the same layout twice (the search is seeded, not random)
//   - the crossings the page counts are the crossings of the lines as drawn, counted here a second way, at every step
//   - in the finished picture no edge runs through a node it does not join, and no two edges without
//     a node in common lie on one line (straight pieces only: two curved edges are not held to this)
//   - before the edges are routed, the page knows every node that a straight edge passes (it draws that stretch over the node)
//   - an edge is turned only for a reason the page can state: it is on a cycle of nodes, its boxes are
//     on a cycle of boxes, or File order was chosen and it points back in the file
//   - a turned edge is marked wherever it is drawn turned, and the last picture draws it its true way
//   - the search's score at each step is the score of that step's picture, by the formula in the README
//   - an edge's length is measured from border to border at every step
//
//   node tests/dag/run.mjs
import fs from 'node:fs';
import path from 'node:path';
import { SAMPLES, parseTopology } from '../../js/dag/graphs.js';
import { layered, breakCycles } from '../../js/dag/layered.js';
import { gridSearch } from '../../js/dag/search.js';
import * as common from '../../js/dag/common.js';

const { measure, flatten, straightCrossings } = common;

const root = path.resolve(import.meta.dirname, '../..');
const graphs = SAMPLES.map((s) => [s.id, s.graph || parseTopology(fs.readFileSync(path.join(root, 'dag', s.url), 'utf8'))]);
let fails = 0, runs = 0;
const fail = (what) => { fails++; console.log('FAIL ' + what); };
const base = { nodeW: 44, nodeH: 26, aspect: 1.4, gap: 22, dir: 'down', cyc: 'greedy', lay: 'longest', wmax: 4, sweeps: 6, lgap: 44, rt: 'ortho', grp: 'colour', seed: 1, tries: 2, flow: 3, cross: 5 };

// ---- this file's own measures, to hold against the page's ----
// Crossings a second way. One line is moved a hair in each of four directions and the crossings that
// are strictly inside both lines are counted; a true crossing is there every time, a touch is not.
// Two edges that leave one node, or enter one, may run together next to it; that stretch is cut off first.
const strictly = (a, b, c, d) => {
  const ux = b[0] - a[0], uy = b[1] - a[1], vx = d[0] - c[0], vy = d[1] - c[1], den = ux * vy - uy * vx;
  if (Math.abs(den) < 1e-12) return false;
  const t = ((c[0] - a[0]) * vy - (c[1] - a[1]) * vx) / den, u = ((c[0] - a[0]) * uy - (c[1] - a[1]) * ux) / den;
  return t > 0 && t < 1 && u > 0 && u < 1;
};
function apart(A, B) {   // the two lines without the stretch they share from their first points
  A = A.slice(); B = B.slice();
  const eq = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6;
  while (A.length > 1 && B.length > 1 && eq(A[0], B[0])) {
    if (eq(A[1], B[1])) { A.shift(); B.shift(); continue; }
    const ux = A[1][0] - A[0][0], uy = A[1][1] - A[0][1], vx = B[1][0] - B[0][0], vy = B[1][1] - B[0][1], la = Math.hypot(ux, uy), lb = Math.hypot(vx, vy);
    if (Math.abs(ux * vy - uy * vx) > 1e-9 * la * lb || ux * vx + uy * vy <= 0) break;
    if (la < lb) { A.shift(); B[0] = A[0]; } else { B.shift(); A[0] = B[0]; }
  }
  return [A, B];
}
function crossings2(lines, pairs) {
  let total = 0;
  const box = lines.map((l) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of l) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } return [x0 - 1, y0 - 1, x1 + 1, y1 + 1]; });
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    if (box[i][2] < box[j][0] || box[j][2] < box[i][0] || box[i][3] < box[j][1] || box[j][3] < box[i][1]) continue;
    let A = lines[i], B = lines[j];
    const [a, b] = pairs[i], [c, d] = pairs[j];
    if (a === c) [A, B] = apart(A, B);
    if (b === d) [A, B] = apart(A.slice().reverse(), B.slice().reverse());
    let least = Infinity;
    for (const [dx, dy] of [[0.61e-4, 0.79e-4], [-0.61e-4, -0.79e-4], [0.83e-4, -0.56e-4], [-0.83e-4, 0.56e-4]]) {
      let n = 0;
      for (let p = 1; p < A.length; p++) {
        const a0 = [A[p - 1][0] + dx, A[p - 1][1] + dy], a1 = [A[p][0] + dx, A[p][1] + dy];
        if (Math.max(a0[0], a1[0]) < box[j][0] || Math.min(a0[0], a1[0]) > box[j][2] || Math.max(a0[1], a1[1]) < box[j][1] || Math.min(a0[1], a1[1]) > box[j][3]) continue;
        for (let q = 1; q < B.length; q++) if (strictly(a0, a1, B[q - 1], B[q])) n++;
      }
      least = Math.min(least, n);
    }
    total += least;
  }
  return total;
}
// how far two lines run on top of each other
function sharedRun(A, B, tol = 0.3) {
  let len = 0;
  for (let p = 1; p < A.length; p++) for (let q = 1; q < B.length; q++) {
    const a = A[p - 1], b = A[p], c = B[q - 1], d = B[q], ux = b[0] - a[0], uy = b[1] - a[1], L = Math.hypot(ux, uy);
    if (L < 1e-9) continue;
    if (Math.abs((c[0] - a[0]) * -uy + (c[1] - a[1]) * ux) / L > tol || Math.abs((d[0] - a[0]) * -uy + (d[1] - a[1]) * ux) / L > tol) continue;
    const tc = ((c[0] - a[0]) * ux + (c[1] - a[1]) * uy) / L, td = ((d[0] - a[0]) * ux + (d[1] - a[1]) * uy) / L;
    const lo = Math.max(0, Math.min(tc, td)), hi = Math.min(L, Math.max(tc, td));
    if (hi - lo > 1e-6) len += hi - lo;
  }
  return len;
}
// does a line pass through the node centred at c, more than a unit inside its border?
function through(L, c, o) {
  const x0 = c[0] - o.nodeW / 2 + 1, x1 = c[0] + o.nodeW / 2 - 1, y0 = c[1] - o.nodeH / 2 + 1, y1 = c[1] + o.nodeH / 2 - 1;
  for (let i = 1; i < L.length; i++) {
    let t0 = 0, t1 = 1; const a = L[i - 1], b = L[i], dx = b[0] - a[0], dy = b[1] - a[1];
    const clip = (p, q) => { if (Math.abs(p) < 1e-12) return q >= 0; const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } return true; };
    if (clip(-dx, a[0] - x0) && clip(dx, x1 - a[0]) && clip(-dy, a[1] - y0) && clip(dy, y1 - a[1]) && t1 - t0 > 1e-9) return true;
  }
  return false;
}
// can a route along the arrows get from a to b?
function reaches(n, edges, a, b) {
  const out = Array.from({ length: n }, () => []); for (const [s, t] of edges) out[s].push(t);
  const seen = new Uint8Array(n), stack = [a]; seen[a] = 1;
  while (stack.length) { const v = stack.pop(); if (v === b) return true; for (const w of out[v]) if (!seen[w]) { seen[w] = 1; stack.push(w); } }
  return false;
}
// the search's score, from a picture's node centres alone
function scoreOf(g, pos, o) {
  const cw = o.nodeW + o.gap, ch = o.nodeH + o.gap, down = o.dir !== 'right';
  let s = 0;
  for (const [a, b] of g.edges) {
    const dx = Math.abs(pos[a][0] - pos[b][0]), dy = Math.abs(pos[a][1] - pos[b][1]);
    s += dx + dy + (dx > 1 && dy > 1 ? 30 : 0) + o.flow * 0.5 * Math.max(0, down ? pos[a][1] - pos[b][1] + ch : pos[a][0] - pos[b][0] + cw);
  }
  return Math.round(s + o.cross * 14 * straightCrossings(g.edges, pos.map((p) => p[0]), pos.map((p) => p[1])));
}

// how much of the piece from p to q lies inside the node at c: cut the piece where it meets the node's four sides, and add up the parts whose middle is inside
function hidden(p, q, c, o) {
  const hw = o.nodeW / 2, hh = o.nodeH / 2, ts = [0, 1];
  for (const [k, side] of [[0, c[0] - hw], [0, c[0] + hw], [1, c[1] - hh], [1, c[1] + hh]]) { const d = q[k] - p[k]; if (Math.abs(d) > 1e-12) { const t = (side - p[k]) / d; if (t > 0 && t < 1) ts.push(t); } }
  ts.sort((x, y) => x - y);
  let sum = 0;
  for (let i = 1; i < ts.length; i++) { const m = (ts[i - 1] + ts[i]) / 2, x = p[0] + (q[0] - p[0]) * m, y = p[1] + (q[1] - p[1]) * m; if (Math.abs(x - c[0]) < hw && Math.abs(y - c[1]) < hh) sum += (ts[i] - ts[i - 1]) * Math.hypot(q[0] - p[0], q[1] - p[1]); }
  return sum;
}
// the length of a picture's edges that can be seen: all of a routed edge, and of a line between two centres the part outside its two nodes
function seen(g, snap, o) {
  let sum = 0;
  snap.edges.forEach((e, k) => {
    const L = flatten(e), [s, t] = g.edges[k];
    for (let i = 1; i < L.length; i++) sum += Math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]) - (e.kind === 'line' ? hidden(L[i - 1], L[i], snap.pos[s], o) + hidden(L[i - 1], L[i], snap.pos[t], o) : 0);
  });
  return sum;
}

// what every picture must keep: `deep` also counts the crossings of every step a second way
function pictures(tag, g, o, out, deep) {
  const S = out.snaps, last = S.length - 1;
  const knows = typeof common.passed === 'function';
  if (!knows) fail(`${tag}: the page cannot tell which nodes a straight edge passes`);
  S.forEach((snap, st) => {
    if (deep || st === last) {
      const page = measure(snap.edges).crossings, mine = crossings2(snap.edges.map(flatten), g.edges);
      if (page !== mine) fail(`${tag}: step ${st} shows ${page} crossings, and its lines cross ${mine} times`);
      const long = measure(snap.edges, { pos: snap.pos, pairs: g.edges, o }).length, own = seen(g, snap, o);
      if (Math.abs(long - own) > 1e-6 * (1 + own)) fail(`${tag}: step ${st} shows the edge length ${long.toFixed(2)}, and ${own.toFixed(2)} of its lines can be seen`);
    }
    if (st === last || !deep || !knows) return;
    // before routing: a straight edge may pass a node, and the page must know which, to draw it over that node
    g.edges.forEach(([s, t], e) => {
      const mine = []; for (let v = 0; v < g.n; v++) if (v !== s && v !== t && through(snap.edges[e].pts, snap.pos[v], o)) mine.push(v);
      if (String(common.passed(snap.edges[e].pts, snap.pos, o, s, t)) !== String(mine)) fail(`${tag}: step ${st}, the page does not know every node that ${g.names[s]} to ${g.names[t]} passes`);
    });
  });
  // the finished picture
  const L = S[last].edges.map(flatten);
  g.edges.forEach(([s, t], e) => { for (let v = 0; v < g.n; v++) if (v !== s && v !== t && through(L[e], S[last].pos[v], o)) return fail(`${tag}: edge ${g.names[s]} to ${g.names[t]} runs through ${g.names[v]}`); });
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const [a, b] = g.edges[i], [c, d] = g.edges[j];
    if (a === c || b === d || a === d || b === c) continue;
    if (S[last].edges[i].kind === 'curve' && S[last].edges[j].kind === 'curve') continue;   // two curves that cross at a shallow angle run close for a way; that is not held against them here
    if (sharedRun(L[i], L[j]) > 2) return fail(`${tag}: ${g.names[a]} to ${g.names[b]} and ${g.names[c]} to ${g.names[d]} are drawn on one line`);
  }
}

// ---- the page's measures on pictures small enough to check by hand ----
{
  const n = (A, B) => (common.crossingsOf ? common.crossingsOf(A, B) : measure([{ pts: A, kind: 'line' }, { pts: B, kind: 'line' }]).crossings);
  const cases = [
    ['two lines that cross', [[0, 0], [10, 10]], [[0, 10], [10, 0]], 1],
    ['a crossing at a bend of one line', [[0, 0], [5, 5], [10, 0]], [[5, 10], [5, -5]], 1],
    ['a crossing where both lines bend', [[0, 0], [5, 5], [10, 5]], [[0, 10], [5, 5], [5, 0]], 1],
    ['two bends that touch', [[0, 0], [5, 5], [10, 0]], [[0, 10], [5, 5], [10, 10]], 0],
    ['a shared run left on opposite sides', [[0, 0], [0, 10], [10, 10], [10, 20]], [[20, 0], [10, 0], [10, 10], [0, 10], [0, 20], [-5, 20]], 1],
    ['a shared run left on the same side', [[0, 0], [5, 5], [15, 5], [20, 0]], [[0, 2], [5, 5], [15, 5], [20, 2]], 0],
    ['a shared run from a shared end', [[0, 0], [0, 10], [10, 10], [10, 20]], [[0, 0], [0, 10], [20, 10], [20, 20]], 0],
    ['an end on the other line', [[0, 0], [10, 0]], [[5, 0], [5, 10]], 0],
    ['a shared run with a bend in it, left on the same side', [[-5, 0], [0, 0], [0, 10], [10, 10], [10, 15]], [[0, -5], [0, 10], [10, 10], [15, 10]], 0],
    ['a shared run with a bend in it, left on opposite sides', [[-5, 0], [0, 0], [0, 10], [10, 10], [10, 15]], [[0, -5], [0, 10], [10, 10], [5, 15]], 1],
  ];
  for (const [what, A, B, want] of cases) for (const [P, Q] of [[A, B], [B, A], [A.slice().reverse(), B], [A, B.slice().reverse()]]) {
    const got = n(P, Q); if (got !== want) { fail(`${what}: counted ${got}, should be ${want}`); break; }
  }
  // two mirror-image curves cross at the ends of their chords
  const curves = [{ kind: 'curve', pts: [[0, 0], [0, 10], [20, 10], [20, 20]] }, { kind: 'curve', pts: [[20, 0], [20, 10], [0, 10], [0, 20]] }];
  if (measure(curves).crossings !== 1) fail(`two curves that cross once: counted ${measure(curves).crossings}`);
  // a straight edge between two nodes 100 apart, each 44 wide: 56 of it can be seen
  const two = measure([{ kind: 'line', pts: [[0, 0], [100, 0]] }], { pos: [[0, 0], [100, 0]], pairs: [[0, 1]], o: { nodeW: 44, nodeH: 26 } }).length;
  if (Math.abs(two - 56) > 1e-6) fail(`an edge between two nodes 100 apart and 44 wide measures ${two}, not 56 from border to border`);
  // the same line given in short pieces is the same length
  const cut = measure([{ kind: 'line', pts: [[0, 0], [10, 0], [20, 0], [85, 0], [100, 0]] }], { pos: [[0, 0], [100, 0]], pairs: [[0, 1]], o: { nodeW: 44, nodeH: 26 } }).length;
  if (Math.abs(cut - 56) > 1e-6) fail(`the same edge given in five pieces measures ${cut}, not 56`);
}

function checks(tag, g, o, out) {
  runs++;
  for (const [i, snap] of out.snaps.entries()) {
    for (const p of snap.pos) if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return fail(`${tag}: stage ${i} has a node without a place`);
    for (const e of snap.edges) for (const p of e.pts) if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return fail(`${tag}: stage ${i} has an edge without a path`);
    if (snap.edges.length !== g.edges.length) return fail(`${tag}: stage ${i} draws ${snap.edges.length} of ${g.edges.length} edges`);
  }
  const last = out.snaps[out.snaps.length - 1], pos = last.pos;
  for (let a = 0; a < g.n; a++) for (let b = a + 1; b < g.n; b++) if (Math.abs(pos[a][0] - pos[b][0]) < o.nodeW - 0.01 && Math.abs(pos[a][1] - pos[b][1]) < o.nodeH - 0.01) return fail(`${tag}: ${g.names[a]} and ${g.names[b]} overlap`);
  const onBorder = (p, c) => { const dx = Math.abs(p[0] - c[0]), dy = Math.abs(p[1] - c[1]); return dx <= o.nodeW / 2 + 0.6 && dy <= o.nodeH / 2 + 0.6 && (Math.abs(dx - o.nodeW / 2) < 0.6 || Math.abs(dy - o.nodeH / 2) < 0.6); };
  g.edges.forEach(([s, t], e) => { const p = last.edges[e].pts; if (!onBorder(p[0], pos[s]) || !onBorder(p[p.length - 1], pos[t])) fail(`${tag}: edge ${g.names[s]} to ${g.names[t]} does not join its nodes`); });
  const m = measure(last.edges);
  if (!Number.isFinite(m.length)) fail(`${tag}: length is not a number`);
}

// every node inside its own group's box, and no two boxes overlapping
function boxed(tag, g, o, snap) {
  const B = snap.boxes;
  if (B.length !== g.groups.length) return fail(`${tag}: ${B.length} boxes for ${g.groups.length} groups`);
  snap.pos.forEach((p, v) => { const b = B.find((x) => x.k === g.group[v]); if (p[0] - o.nodeW / 2 < b.x - 0.01 || p[0] + o.nodeW / 2 > b.x + b.w + 0.01 || p[1] - o.nodeH / 2 < b.y - 0.01 || p[1] + o.nodeH / 2 > b.y + b.h + 0.01) fail(`${tag}: ${g.names[v]} is outside its box`); });
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) if (B[i].x < B[j].x + B[j].w && B[j].x < B[i].x + B[i].w && B[i].y < B[j].y + B[j].h && B[j].y < B[i].y + B[i].h) fail(`${tag}: two boxes overlap`);
}

for (const [id, g] of graphs) {
  for (const cyc of ['greedy', 'dfs', 'file']) {
    const rev = breakCycles(g, cyc), deg = new Int32Array(g.n), out = Array.from({ length: g.n }, () => []);
    g.edges.forEach(([s, t], i) => { const [u, v] = rev[i] ? [t, s] : [s, t]; out[u].push(v); deg[v]++; });
    const ready = []; let seen = 0;
    for (let v = 0; v < g.n; v++) if (!deg[v]) ready.push(v);
    while (ready.length) { const v = ready.pop(); seen++; for (const w of out[v]) if (--deg[w] === 0) ready.push(w); }
    if (seen !== g.n) fail(`${id}: a cycle is left after "${cyc}"`);
    for (const lay of ['longest', 'tight', 'width']) for (const rt of ['ortho', 'poly', 'curve']) for (const dir of ['down', 'right']) for (const sweeps of [0, 6]) for (const gap of [8, 22, 60]) for (const grp of g.groups.length ? ['colour', 'box'] : ['colour']) {
      const o = { ...base, cyc, lay, rt, dir, sweeps, gap, grp, wmax: 3 }, tag = `${id} layered ${cyc}/${lay}/${rt}/${dir}/${sweeps}/${gap}/${grp}`;
      const r = layered(g, o);
      checks(tag, g, o, r);
      pictures(tag, g, o, r, g.n < 20 || (sweeps === 6 && gap === 22));
      // a turned edge is marked from Turn on, drawn turned until Route, and drawn its true way at Route
      r.snaps.forEach((snap, st) => snap.edges.forEach((e, k) => { if (!!e.mark !== (st >= 1 && r.rev[k]) || !!e.turned !== (st >= 1 && st < 5 && r.rev[k])) fail(`${tag}: step ${st}, edge ${k} is turned and not marked, or drawn turned in the finished picture`); }));
      // why each edge was turned
      {
        const T = r.facts.turned, mine = { cycle: 0, boxes: 0, file: 0 }, boxes = grp === 'box';
        const boxEdges = boxes ? g.edges.filter(([s, t]) => g.group[s] !== g.group[t]).map(([s, t]) => [g.group[s], g.group[t]]) : [];
        g.edges.forEach(([s, t], e) => {
          if (!r.rev[e]) return;
          if (reaches(g.n, g.edges, t, s)) return mine.cycle++;
          if (boxes && g.group[s] !== g.group[t]) { mine.boxes++; if (cyc !== 'file' && !reaches(g.groups.length, boxEdges, g.group[t], g.group[s])) fail(`${tag}: ${g.names[s]} to ${g.names[t]} is turned, and it is on no cycle of nodes or of boxes`); return; }
          mine.file++;
          if (cyc !== 'file') fail(`${tag}: ${g.names[s]} to ${g.names[t]} is turned, and it is on no cycle`);
          else if (t > s) fail(`${tag}: ${g.names[s]} to ${g.names[t]} is turned by File order, and it does not point back in the file`);
        });
        if (!T || T.cycle !== mine.cycle || T.boxes !== mine.boxes || T.file !== mine.file) fail(`${tag}: the page's reasons for its turned edges are ${JSON.stringify(T)}, and the edges give ${JSON.stringify(mine)}`);
      }
      const pos = r.snaps[4].pos, ax = dir === 'down' ? 1 : 0;
      // forward through the layers: every edge without boxes, and with boxes the edges inside one box
      g.edges.forEach(([s, t], e) => { if ((grp === 'colour' || g.group[s] === g.group[t]) && (pos[t][ax] - pos[s][ax]) * (r.rev[e] ? -1 : 1) <= 0) fail(`${tag}: edge ${g.names[s]} to ${g.names[t]} does not run forward`); });
      if (grp === 'box') boxed(tag, g, o, r.snaps[5]);
    }
  }
  for (const dir of ['down', 'right']) for (const seed of [1, 7]) for (const gap of [8, 22, 60]) for (const flow of [0, 10]) for (const aspect of [0.6, 1.8]) {
    const o = { ...base, dir, seed, gap, flow, aspect }, tag = `${id} search ${dir}/${seed}/${gap}/${flow}/${aspect}`;
    const r = gridSearch(g, o);
    checks(tag, g, o, r);
    pictures(tag, g, o, r, true);
    // the score beside each picture is that picture's
    const f = r.facts, shown = [f.inputScore, f.firstScore, f.tries[f.best]];
    for (let st = 0; st < 3; st++) if (shown[st] !== scoreOf(g, r.snaps[st].pos, o)) fail(`${tag}: step ${st} shows the score ${shown[st]}, and its picture scores ${scoreOf(g, r.snaps[st].pos, o)}`);
    r.thumbs.forEach((pos, i) => { if (scoreOf(g, pos, o) !== f.tries[i]) fail(`${tag}: try ${i + 1} shows the score ${f.tries[i]}, and its picture scores ${scoreOf(g, pos, o)}`); });
    if (f.tries[f.best] !== Math.min(...f.tries)) fail(`${tag}: the kept try is not the lowest`);
    if (g.groups.length) boxed(tag, g, o, r.snaps[3]);
    if (JSON.stringify(gridSearch(g, o).snaps[3].pos) !== JSON.stringify(r.snaps[3].pos)) fail(`${tag}: two runs differ`);
  }
  // more tries reach other arrangements, such as a node with an edge on each of its four sides
  if (g.n < 20) for (const dir of ['down', 'right']) for (const seed of [7, 23]) for (const cross of [0, 5]) {
    const o = { ...base, dir, seed, cross, tries: 12, flow: 0, aspect: 1 }, tag = `${id} search ${dir}/${seed}/12 tries/crossings ${cross}`;
    const r = gridSearch(g, o);
    checks(tag, g, o, r);
    pictures(tag, g, o, r, false);
  }
}
const topo = graphs[0][1];
if (topo.n !== 55 || topo.edges.length !== 62 || topo.loops.length !== 1 || topo.repeats !== 2 || topo.groups.length !== 9) fail(`topology file read as ${topo.n} nodes, ${topo.edges.length} edges, ${topo.loops.length} loops, ${topo.repeats} repeats, ${topo.groups.length} groups`);
console.log(`${runs} layouts, ${fails} failures`);
process.exit(fails ? 1 : 0);
