// Gears on a cube and an octahedron: the workshop's drawings. One sheet per part, drawn the way a machinist
// expects: third-angle views, sections hatched, every size the part needs and no more, a title block. All numbers
// come from spec.js. The sheet is built as SVG from numbers only.
import { gearSpec, spacerSpec, screwSpec, coreSpec, bearingSpec, MATERIAL } from './spec.js?v=04d3d5af';
import { dot, cross, norm } from './model.js?v=04d3d5af';

const NS = 'http://www.w3.org/2000/svg';
const D = Math.PI / 180;
const f2 = (v) => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2), fa = (r) => `${(r / D).toFixed(2)}°`;
function el(name, attrs = {}, parent) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, typeof v === 'number' ? +v.toFixed(3) : v);
  if (parent) parent.append(e);
  return e;
}
const TXT = 2.5, ARROW = 2.2;

// ---- a sheet and its drawing tools ----
function sheet(W, H) {
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', class: 'drawing' });
  const defs = el('defs', {}, svg);
  const pat = el('pattern', { id: 'hatch', patternUnits: 'userSpaceOnUse', width: 1.1, height: 1.1, patternTransform: 'rotate(45)' }, defs);
  el('line', { x1: 0, y1: 0, x2: 0, y2: 1.1, class: 'hl' }, pat);
  el('rect', { x: 0, y: 0, width: W, height: H, class: 'paper' }, svg);
  el('rect', { x: 5, y: 5, width: W - 10, height: H - 10, class: 'frame' }, svg);
  const g = el('g', {}, svg);
  const S = {
    svg, g, W, H,
    line(a, b, cls = 'ol') { el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: cls }, g); },
    path(pts, cls = 'ol', closed = false) { el('path', { d: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(3)} ${p[1].toFixed(3)}`).join('') + (closed ? 'Z' : ''), class: cls }, g); },
    circle(c, r, cls = 'ol') { el('circle', { cx: c[0], cy: c[1], r, class: cls }, g); },
    text(p, s, opts = {}) {
      const t = el('text', { x: p[0], y: p[1], class: opts.cls || 'dt', 'text-anchor': opts.anchor || 'middle', ...(opts.rot ? { transform: `rotate(${opts.rot.toFixed(2)} ${p[0].toFixed(3)} ${p[1].toFixed(3)})` } : {}) }, g);
      t.textContent = s; return t;
    },
    arrow(tip, dir) {   // a filled arrowhead at tip, pointing along dir (unit)
      const n = [-dir[1], dir[0]], b = [tip[0] - dir[0] * ARROW, tip[1] - dir[1] * ARROW];
      S.path([tip, [b[0] + n[0] * ARROW * 0.18, b[1] + n[1] * ARROW * 0.18], [b[0] - n[0] * ARROW * 0.18, b[1] - n[1] * ARROW * 0.18]], 'ah', true);
    },
    // a dimension line from A to B (sheet), with extension lines from the part's points pa and pb to it.
    // The text reads from the bottom or the left, and sits just above the line; a short dimension puts its
    // arrows outside and its text past B.
    dimLine(A, B, label, pa, pb) {
      for (const [p, q] of [[pa, A], [pb, B]]) {
        if (!p) continue;
        const d = [q[0] - p[0], q[1] - p[1]], L = Math.hypot(...d);
        if (L < 1.2) continue;
        const u = [d[0] / L, d[1] / L];
        S.line([p[0] + u[0] * 0.8, p[1] + u[1] * 0.8], [q[0] + u[0] * 1.5, q[1] + u[1] * 1.5], 'dl');
      }
      const d = [B[0] - A[0], B[1] - A[1]], L = Math.hypot(...d) || 1, u = [d[0] / L, d[1] / L];
      let ang = Math.atan2(u[1], u[0]) / D; if (ang > 89.5) ang -= 180; if (ang <= -90.5) ang += 180;
      const up = [Math.sin(ang * D), -Math.cos(ang * D)], tw = label.length * TXT * 0.6;
      const room = L > tw + 2 * ARROW + 1;
      if (L > 2 * ARROW + 0.6) { S.line(A, B, 'dl'); }
      if (room || L > 2 * ARROW + 0.6) { S.arrow(A, [-u[0], -u[1]]); S.arrow(B, u); }
      else { S.line([A[0] - u[0] * 4, A[1] - u[1] * 4], [B[0] + u[0] * 4, B[1] + u[1] * 4], 'dl'); S.arrow(A, u); S.arrow(B, [-u[0], -u[1]]); }
      let m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
      if (!room) {   // the text goes past the end that reads last
        const fw = Math.cos(ang * D) * u[0] + Math.sin(ang * D) * u[1] >= 0 ? 1 : -1, E = fw > 0 ? B : A;
        const k = ARROW + 1.5 + tw / 2; m = [E[0] + fw * u[0] * k, E[1] + fw * u[1] * k];
        S.line(E, [E[0] + fw * u[0] * (k + tw / 2), E[1] + fw * u[1] * (k + tw / 2)], 'dl');
      }
      S.text([m[0] + up[0] * 0.8, m[1] + up[1] * 0.8], label, { rot: ang });
    },
    // horizontal, at sheet height y, between the x of sheet points p and q
    hdim(p, q, y, label) { S.dimLine([p[0], y], [q[0], y], label, p, q); },
    // vertical, at sheet x, between the y of p and q
    vdim(p, q, x, label) { S.dimLine([x, p[1]], [x, q[1]], label, p, q); },
    // aligned with a and b, offset by off to the left of a to b
    dim(a, b, off, label) {
      const d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(...d) || 1, n = [d[1] / L, -d[0] / L];
      S.dimLine([a[0] + n[0] * off, a[1] + n[1] * off], [b[0] + n[0] * off, b[1] + n[1] * off], label, a, b);
    },
    // a note with a leader from a point on the part
    note(from, at, lines, anchor = 'start') {
      S.line(from, at, 'dl'); S.circle(from, 0.45, 'dot');
      const end = [at[0] + (anchor === 'start' ? 2 : -2), at[1]]; S.line(at, end, 'dl');
      lines.forEach((s, i) => S.text([end[0] + (anchor === 'start' ? 0.8 : -0.8), at[1] + 0.9 + i * TXT * 1.25], s, { anchor, cls: 'nt' }));
    },
    centerLine(a, b) { S.line(a, b, 'cl'); },
    // an angle between two rays from v (sheet), drawn as an arc of radius r, measured counterclockwise from a1 to a2 (radians, sheet y down)
    angle(v, a1, a2, r, label) {
      const pts = []; for (let k = 0; k <= 24; k++) { const a = a1 + (a2 - a1) * k / 24; pts.push([v[0] + r * Math.cos(a), v[1] + r * Math.sin(a)]); }
      S.path(pts, 'dl');
      S.arrow(pts[0], norm2([pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]])); S.arrow(pts[24], norm2([pts[24][0] - pts[23][0], pts[24][1] - pts[23][1]]));
      const am = (a1 + a2) / 2; S.text([v[0] + (r + 3.2) * Math.cos(am), v[1] + (r + 3.2) * Math.sin(am) + 0.9], label);
    },
    label(p, s) { S.text(p, s, { cls: 'vl' }); },
  };
  return S;
}
const norm2 = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
// a view: part coordinates (u right, v up) to the sheet at scale k, origin at o
const view = (o, k) => (u, v) => [o[0] + k * u, o[1] - k * v];

function titleBlock(S, rows) {
  const w = 96, h = 6 * rows.length + 2, x = S.W - 5 - w, y = S.H - 5 - h;
  el('rect', { x, y, width: w, height: h, class: 'tb' }, S.g);
  rows.forEach(([k, v], i) => {
    const yy = y + 5 + i * 6;
    if (i) S.line([x, yy - 4.6], [x + w, yy - 4.6], 'tbl');
    S.text([x + 2, yy], k, { anchor: 'start', cls: 'tk' }); S.text([x + 30, yy], v, { anchor: 'start', cls: i === 0 ? 'tt' : 'tv' });
  });
  // third-angle projection symbol
  const sx = x - 22, sy = S.H - 14;
  S.path([[sx, sy - 3], [sx + 8, sy - 4.5], [sx + 8, sy + 4.5], [sx, sy + 3]], 'ol', true);
  S.circle([sx + 15, sy], 4.5); S.circle([sx + 15, sy], 2.6);
  S.line([sx - 2, sy], [sx + 22, sy], 'cl'); S.line([sx + 15, sy - 6], [sx + 15, sy + 6], 'cl');
  return { x, y, w, h };
}
function table(S, x, y, rows, w = 96) {
  const h = 4.6 * rows.length + 2;
  el('rect', { x, y, width: w, height: h, class: 'tb' }, S.g);
  rows.forEach(([k, v], i) => { const yy = y + 4.4 + i * 4.6; S.text([x + 2, yy], k, { anchor: 'start', cls: 'tk' }); S.text([x + w - 2, yy], v, { anchor: 'end', cls: 'tv' }); });
  return h;
}
const scaleText = (k) => (k >= 1 ? `${k}:1` : `1:${1 / k}`);
const GENERAL = 'Unless noted: ±0.05, angles ±0.25°. Break sharp edges 0.05.';

// ---- the gear ----
function gearSheet(sh, S) {
  const g = gearSpec(sh), k = 8;
  const { tipOut: T, rootOut: B, tipIn: Ti, rootIn: Bi, zo, zi } = g, rb = g.bore / 2;
  // the section: the axis runs left to right, from the cone's tip (the toy's center) to the outer face
  const V = view([30, 98], k), x = (z) => V(z, 0)[0], y = (r) => V(0, r)[1];
  const prof = [[zi, rb], [zi, Bi.r], [Ti.z, Ti.r], [T.z, T.r], [zo, B.r], [zo, rb]];
  const pIn = [g.coneIn * Math.cos(g.alpha), g.coneIn * Math.sin(g.alpha)], pOut = [g.coneOut * Math.cos(g.alpha), g.coneOut * Math.sin(g.alpha)];
  for (const s of [1, -1]) {
    S.path(prof.map(([z, r]) => V(z, s * r)), 'sec', true);
    S.line(V(Bi.z, s * Bi.r), V(zo, s * B.r), 'thin');                 // the root line, seen past the cut
    S.line(V(pIn[0] - 0.4, s * (pIn[1] - 0.4 * Math.tan(g.alpha))), V(pOut[0] + 0.3, s * (pOut[1] + 0.3 * Math.tan(g.alpha))), 'cl');
    S.line(V(0, 0), V(pIn[0] - 0.4, s * (pIn[1] - 0.4 * Math.tan(g.alpha))), 'ph');   // the pitch cone, back to its tip
  }
  S.line(V(zi, rb), V(zi, -rb)); S.line(V(zo, rb), V(zo, -rb));   // the bore's ends, seen past the cut
  S.centerLine(V(-1.2, 0), V(zo + 1.6, 0));
  const apex = V(0, 0);
  S.line([apex[0] - 1.2, apex[1] - 1.2], [apex[0] + 1.2, apex[1] + 1.2], 'ol'); S.line([apex[0] - 1.2, apex[1] + 1.2], [apex[0] + 1.2, apex[1] - 1.2], 'ol');
  S.text([apex[0], apex[1] + 5], 'cone tip:', { cls: 'nt' }); S.text([apex[0], apex[1] + 8], 'the toy\'s center', { cls: 'nt' });
  // diameters: the outer ones to the right, the inner ones to the left
  const R = x(zo);
  S.vdim(V(T.z, -T.r), V(T.z, T.r), R + 9, `Ø${f2(2 * T.r)}`);
  S.vdim(V(zo, -B.r), V(zo, B.r), R + 17, `Ø${f2(2 * B.r)}`);
  S.vdim(V(zo, -rb), V(zo, rb), R + 25, 'Ø4 H7');
  S.vdim(V(Ti.z, -Ti.r), V(Ti.z, Ti.r), x(Ti.z) - 9, `Ø${f2(2 * Ti.r)}`);
  S.vdim(V(zi, -Bi.r), V(zi, Bi.r), x(Ti.z) - 17, `Ø${f2(2 * Bi.r)}`);
  // lengths along the axis
  const lo = y(-T.r);
  S.hdim(V(zi, -Bi.r), V(zo, -B.r), lo + 8, f2(zo - zi));
  S.hdim(V(Ti.z, -Ti.r), V(zo, -B.r), lo + 16, f2(zo - Ti.z));
  S.hdim(V(0, 0), V(zo, -rb), lo + 24, `${f2(zo)}`);
  S.text([(apex[0] + R) / 2, lo + 29], 'mounting distance', { cls: 'nt' });
  S.hdim(V(T.z, T.r), V(zo, B.r), y(T.r) - 7, f2(zo - T.z));
  // the cone angles
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  S.note(mid(V(Ti.z, Ti.r), V(T.z, T.r)), [x(Ti.z) - 6, y(T.r) - 6], [`face angle ${fa(g.tip)}`], 'end');
  S.note(mid(V(T.z, T.r), V(zo, B.r)), [R + 30, y(T.r) - 4], [`back cone ${fa(Math.PI / 2 - g.alpha)} to the axis`]);
  S.note(mid(V(Ti.z, -Ti.r), V(zi, -Bi.r)), [x(Ti.z) - 22, y(-Ti.r) + 3], [`front cone ${fa(Math.PI / 2 - g.alpha)}`], 'end');
  S.label([(apex[0] + R) / 2, 16], `SECTION  ${scaleText(k)}`);

  // the outer face, looking along the axis: the teeth where they end on the back cone
  const k2 = 4.5, c = [242, 47], P = (u, v) => [c[0] + k2 * u, c[1] - k2 * v];
  const pr = sh.profile, pts = [];
  const at = (th, ps) => { const rho = g.coneOut / Math.cos(th - g.alpha) / g.u, r = rho * Math.sin(th) * g.u; return [r * Math.cos(ps), r * Math.sin(ps)]; };
  for (let t = 0; t < pr.N; t++) {
    const cc = t * 2 * pr.half + Math.PI / 2;
    pts.push(at(pr.root, cc - pr.half));
    for (let r = 0; r < pr.th.length; r++) pts.push(at(pr.th[r], cc - pr.hw[r]));
    for (let r = pr.th.length - 1; r >= 0; r--) pts.push(at(pr.th[r], cc + pr.hw[r]));
  }
  S.path(pts.map(([u, v]) => P(u, v)), 'ol', true);
  S.circle(c, k2 * rb); S.circle(c, k2 * g.pitchD / 2, 'cl');
  S.centerLine([c[0] - k2 * T.r - 3, c[1]], [c[0] + k2 * T.r + 3, c[1]]); S.centerLine([c[0], c[1] - k2 * T.r - 3], [c[0], c[1] + k2 * T.r + 3]);
  S.note(P(g.pitchD / 2 * Math.cos(-2.4), g.pitchD / 2 * Math.sin(-2.4)), [c[0] - k2 * T.r - 2, c[1] + k2 * T.r - 2], [`pitch Ø${f2(g.pitchD)}`], 'end');
  S.note(P(rb * Math.cos(2.5), rb * Math.sin(2.5)), [c[0] - k2 * T.r - 2, c[1] - k2 * T.r * 0.7], ['681X bearing', 'pressed in flush'], 'end');
  S.label([c[0], 8 + 4], `OUTER FACE  ${scaleText(k2)}`);

  // the gear's data
  const rows = [['Teeth', `${g.N}`], ['Module, outer end', `${g.m}`], ['Pressure angle', '20°'], ['Shaft angle', fa(g.shaft)], ['Pitch angle', fa(g.alpha)],
    ['Face angle', fa(g.tip)], ['Root angle', fa(g.root)], ['Pitch diameter', f2(g.pitchD)], ['Outer cone distance', f2(g.coneOut)], ['Face width', f2(g.face)],
    ['Addendum / dedendum', `${f2(g.addendum)} / ${f2(g.dedendum)}`], ['Backlash, at pitch', f2(g.backlash)], ['Form cutter', `module ${g.m}, No. ${g.cutter}`], ['Mates with', 'the same gear']];
  table(S, S.W - 5 - 96, 99, rows);
  return { title: `Gear, ${sh.solid === 'cube' ? 'cube' : 'octahedron'}`, qty: sh.solid === 'cube' ? 4 : 8, scale: `${scaleText(k)}, ${scaleText(k2)}`, notes: ['Cut the teeth one gap at a time.', 'Check the mesh in pairs.'] };
}

// ---- the core: orthographic views of the polyhedron ----
function polyView(S, c, k, faces, eye, right, holes, opts = {}) {
  const up = cross(eye, right), P = (p) => [c[0] + k * dot(p, right), c[1] - k * dot(p, up)];
  const edges = new Map();
  for (const f of faces) {
    const vis = dot(f.n, eye) > 1e-6;
    for (let i = 0; i < f.poly.length; i++) {
      const a = f.poly[i], b = f.poly[(i + 1) % f.poly.length], key = [a, b].map((p) => p.map((x) => x.toFixed(4)).join(',')).sort().join('|');
      const e = edges.get(key) || { a, b, vis: false }; e.vis = e.vis || vis; edges.set(key, e);
    }
  }
  for (const e of edges.values()) if (e.vis) S.line(P(e.a), P(e.b)); else if (opts.hidden) S.line(P(e.a), P(e.b), 'hid');
  // holes on faces turned toward the viewer: the tap drill drawn full, the thread's outside as a three-quarter circle
  for (const h of holes) {
    const f = dot(h.n, eye); if (f < 0.2) continue;
    const ring = (r, a0 = 0, a1 = 2 * Math.PI) => { const n = h.n, t = norm(Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0])), s = cross(n, t), pts = []; for (let i = 0; i <= 48; i++) { const a = a0 + (a1 - a0) * i / 48; pts.push(P([0, 1, 2].map((q) => h.c[q] + r * (Math.cos(a) * t[q] + Math.sin(a) * s[q])))); } return pts; };
    S.path(ring(h.drill / 2), 'ol'); S.path(ring(h.major / 2, 0.3, 0.3 + 1.5 * Math.PI), 'thin');
    const cc = P(h.c); S.line([cc[0] - k * 1.4, cc[1]], [cc[0] + k * 1.4, cc[1]], 'cl'); S.line([cc[0], cc[1] - k * 1.4], [cc[0], cc[1] + k * 1.4], 'cl');
  }
  return P;
}
function coreSheet(sh, S) {
  const c = coreSpec(sh), cube = sh.solid === 'cube';
  const holes = c.holes.map((h) => ({ n: h.n, c: h.c, drill: c.tap.drill, major: 1.4 }));
  const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1], cl = (P, cc, r) => { S.centerLine([cc[0] - r, cc[1]], [cc[0] + r, cc[1]]); S.centerLine([cc[0], cc[1] - r], [cc[0], cc[1] + r]); };
  if (cube) {
    // third angle: top above the front, right side to its right
    const k = 7, h = c.across / 2, r = k * h, fc = [66, 134], tc = [66, 134 - 2 * r - 22], rc = [66 + 2 * r + 30, 134];
    const Pf = polyView(S, fc, k, c.faces, Z, X, holes), Pt = polyView(S, tc, k, c.faces, Y, X, holes), Pr = polyView(S, rc, k, c.faces, X, [0, 0, -1], holes);
    cl(Pf, fc, r + 3); cl(Pt, tc, r + 3); cl(Pr, rc, r + 3);
    S.label([fc[0], fc[1] + r + 20], 'FRONT'); S.label([tc[0] - r - 16, tc[1]], 'TOP'); S.label([rc[0], rc[1] + r + 20], 'RIGHT');
    S.hdim(Pf([-h, -h, h]), Pf([h, -h, h]), fc[1] + r + 9, `${f2(c.across)} ±0.02`);
    S.vdim(Pf([-h, -h, h]), Pf([-h, h, h]), fc[0] - r - 9, `${f2(c.across)} ±0.02`);
    S.hdim(Pr([h, -h, h]), Pr([h, -h, -h]), rc[1] + r + 9, `${f2(c.across)} ±0.02`);
    S.note(Pt([h - c.chamfer * 0.5, h, -h + c.chamfer * 0.5]), [tc[0] + r + 14, tc[1] - r + 4], [`12 edges, ${c.chamfer} × 45°`]);
    S.note(Pr([h, 0.55, -0.55]), [rc[0] + r + 10, rc[1] - r + 2], ['4× M1.4 × 0.3, 3 deep', `tap drill Ø${c.tap.drill}, ${c.tap.drillDepth} deep`, 'in the middle of the four sides.', 'Top and bottom stay plain.']);
    return { title: 'Core, cube', qty: 1, scale: scaleText(k), notes: ['From 10 mm square bar.'] };
  }
  // the octahedron: along a corner, along an edge, and square to a face
  const k = 5.2, h = c.corner, r = k * h, n = norm([1, 1, 1]), d = c.planes.find((q) => q.kind === 'face').d, e = c.planes.find((q) => q.kind === 'edge').d;
  const fc = [58, 100], ac = [58 + 2 * r + 38, 100], bc = [S.W - 44, 70];
  const Pf = polyView(S, fc, k, c.faces, Z, X, holes);
  const eA = norm([1, -1, 0]), rA = norm([1, 1, 0]), Pa = polyView(S, ac, k, c.faces, eA, rA, holes);
  cl(Pf, fc, r + 3); cl(Pa, ac, r + 3);
  S.label([fc[0], fc[1] + r + 22], 'ALONG A CORNER'); S.label([ac[0], ac[1] + r + 22], 'ALONG AN EDGE');
  S.hdim(Pf([-h, -h * 0.2, h]), Pf([h, -h * 0.2, h]), fc[1] + r + 9, `${f2(2 * h)} corner flats`);
  S.vdim(Pf([-h * 0.2, -h, h]), Pf([-h * 0.2, h, h]), fc[0] - r - 9, f2(2 * h));
  // across faces (seen edge on here), across edge flats
  S.dim(Pa(n.map((q) => -q * d)), Pa(n.map((q) => q * d)), k * 7.6, `${f2(2 * d)} across faces`);
  S.hdim(Pa(rA.map((q) => -q * e)), Pa(rA.map((q) => q * e)), ac[1] + r + 9, `${f2(2 * e)} across edge flats`);
  S.note(Pa([0.4, 0.4, h - 0.05]), [ac[0] + 10, ac[1] - r - 7], [`edge flats ${f2(c.chamfer)} wide`]);
  S.text([ac[0], ac[1] + r + 28], `faces at ${fa(Math.acos(1 / Math.sqrt(3)))} to the corner flats`, { cls: 'nt' });
  // square to a face: the hole in the middle of its triangle
  const v = norm(cross([0, 0, 1], n)), Pb = polyView(S, bc, k, c.faces, n, v, holes);
  S.label([bc[0], bc[1] + r + 12], 'SQUARE TO A FACE');
  S.note(Pb(n.map((q) => q * d + 0.4)), [bc[0] - r + 6, bc[1] - r - 8], ['8× M1.4 × 0.3, 3 deep', `tap drill Ø${c.tap.drill}, ${c.tap.drillDepth} deep`, 'in the middle of each face'], 'end');
  return { title: 'Core, octahedron', qty: 1, scale: scaleText(k), notes: ['From 16 mm square bar.'] };
}

// ---- the spacer, the screw, the bearing ----
function spacerSheet(sh, S) {
  const s = spacerSpec(sh), k = 25, c = [100, 96], V = view([c[0] - k * s.L / 2, c[1]], k), ch = 0.1, x = (z) => V(z, 0)[0];
  const ro = s.od / 2, ri = s.id / 2;
  for (const sg of [1, -1]) S.path([[0, ri + ch], [0, ro - ch], [ch, ro], [s.L - ch, ro], [s.L, ro - ch], [s.L, ri + ch], [s.L - ch, ri], [ch, ri]].map(([z, r]) => V(z, sg * r)), 'sec', true);
  for (const z of [0, ch, s.L - ch, s.L]) S.line(V(z, ri), V(z, -ri), z === 0 || z === s.L ? 'ol' : 'thin');   // the bore's far side, past the cut
  S.centerLine(V(-0.4, 0), V(s.L + 0.4, 0));
  S.hdim(V(0, -ro + ch), V(s.L, -ro + ch), V(0, -ro)[1] + 9, `${f2(s.L)} ±0.01`);
  S.vdim(V(s.L, -ro), V(s.L, ro), x(s.L) + 10, `Ø${f2(s.od)}`);
  S.vdim(V(0, -ri), V(0, ri), x(0) - 10, `Ø${f2(s.id)}`);
  S.note(V(s.L - ch / 2, ro - ch / 2), [x(s.L) + 22, V(0, ro)[1] - 10], ['0.1 × 45°, both ends,', 'inside and out']);
  S.label([c[0], V(0, -ro)[1] + 24], `SECTION  ${scaleText(k)}`);
  S.note(V(s.L, (ri + ro) / 2), [x(s.L) + 22, c[1] + 4], ['Ends flat and parallel', 'within 0.01: this sets', 'the gear\'s height.']);
  return { title: `Spacer, ${sh.solid === 'cube' ? 'cube' : 'octahedron'}`, qty: sh.solid === 'cube' ? 4 : 8, scale: scaleText(k), notes: ['From 3 mm round bar.'] };
}
function screwSheet(sh, S) {
  const s = screwSpec(sh), z = s.z, k = 13, c = [100, 92], V = view([c[0] - k * s.length / 2, c[1]], k), ce = s.chamferEnd, x = (zz) => V(zz, 0)[0], y = (r) => V(0, r)[1];
  const r = { th: s.thread / 2, sh: s.shoulder / 2, bo: s.boss / 2, fl: s.flange / 2 };
  const top = [[0, r.th - ce], [ce, r.th], [z.thread, r.th], [z.thread, r.sh], [z.shoulder, r.sh], [z.shoulder, r.bo], [z.boss, r.bo], [z.boss, r.fl], [z.top - 0.1, r.fl], [z.top, r.fl - 0.1], [z.top, 0]];
  S.path([...top.map(([zz, rr]) => V(zz, rr)), ...top.slice().reverse().map(([zz, rr]) => V(zz, -rr))], 'ol', true);
  for (const [zz, rr] of [[ce, r.th], [z.thread, r.th], [z.shoulder, r.sh], [z.boss, r.bo], [z.top - 0.1, r.fl - 0.1]]) S.line(V(zz, rr), V(zz, -rr), 'ol');
  // the thread: its root drawn thin, and where the full thread ends
  for (const sg of [1, -1]) S.line(V(ce * 0.5, sg * s.threadMinor / 2), V(z.thread - 0.15, sg * s.threadMinor / 2), 'thin');
  S.line(V(z.thread - 0.15, r.th), V(z.thread - 0.15, -r.th), 'thin');
  // the slot, hidden in this view
  for (const sg of [1, -1]) S.line(V(z.top - s.slotD, sg * s.slot / 2), V(z.top, sg * s.slot / 2), 'hid');
  S.line(V(z.top - s.slotD, s.slot / 2), V(z.top - s.slotD, -s.slot / 2), 'hid');
  S.centerLine(V(-0.5, 0), V(z.top + 0.6, 0));
  const lo = y(-r.fl);
  S.hdim(V(0, -r.th), V(z.thread, -r.th), lo + 8, f2(s.threadL));
  S.hdim(V(z.thread, -r.sh), V(z.shoulder, -r.sh), lo + 8, `${f2(s.shoulderL)} ±0.01`);
  S.hdim(V(z.shoulder, -r.bo), V(z.boss, -r.bo), lo + 16, f2(s.bossH));
  S.hdim(V(z.boss, -r.fl), V(z.top, -r.fl), lo + 8, f2(s.thick));
  S.hdim(V(0, -r.th), V(z.top, -r.fl), lo + 24, f2(s.length));
  S.vdim(V(z.top, -r.fl), V(z.top, r.fl), x(z.top) + 9, `Ø${f2(s.flange)}`);
  S.note(V((z.thread + z.shoulder) / 2, r.sh), [x(z.thread) - 6, y(r.fl) - 4], [`Ø${f2(s.shoulder)} g6, ground smooth:`, 'the bearing turns on this'], 'end');
  S.note(V(z.thread * 0.6, r.th), [x(0) - 4, y(r.fl) + 14], [`M${s.thread} × ${s.pitch}`, `${ce} × 45° at the end`], 'end');
  S.note(V((z.shoulder + z.boss) / 2, r.bo), [x(z.top) + 8, y(r.fl) - 4], [`boss Ø${f2(s.boss)}`]);
  S.label([c[0], lo + 34], `SIDE  ${scaleText(k)}`);
  // the head, end on
  const e = [222, 74], H = (u, v) => [e[0] + k * u, e[1] - k * v];
  S.circle(e, k * r.fl); S.circle(e, k * (r.fl - 0.1), 'thin');
  const xw = Math.sqrt((r.fl - 0.1) ** 2 - (s.slot / 2) ** 2);
  S.line(H(-xw, s.slot / 2), H(xw, s.slot / 2)); S.line(H(-xw, -s.slot / 2), H(xw, -s.slot / 2));
  S.centerLine([e[0] - k * r.fl - 3, e[1]], [e[0] + k * r.fl + 3, e[1]]); S.centerLine([e[0], e[1] - k * r.fl - 3], [e[0], e[1] + k * r.fl + 3]);
  S.vdim(H(xw * 0.55, -s.slot / 2), H(xw * 0.55, s.slot / 2), H(xw * 0.55, 0)[0], f2(s.slot));
  S.text([e[0], e[1] - k * r.fl - 6], `slot ${s.slot} wide, ${s.slotD} deep`, { cls: 'nt' });
  S.label([e[0], e[1] + k * r.fl + 10], `HEAD  ${scaleText(k)}`);
  return { title: `Shoulder screw, ${sh.solid === 'cube' ? 'cube' : 'octahedron'}`, qty: sh.solid === 'cube' ? 4 : 8, scale: scaleText(k), notes: ['From 7 mm round bar.', 'The shoulder\'s end clamps the spacer.'] };
}
function bearingSheet(sh, S) {
  const b = bearingSpec(), k = 18, c = [100, 96], V = view(c, k), w = b.B / 2, x = (u) => V(u, 0)[0];
  for (const sg of [1, -1]) {
    S.path([[-w, b.d / 2], [-w, b.innerOD / 2], [w, b.innerOD / 2], [w, b.d / 2]].map(([u, v]) => V(u, sg * v)), 'sec', true);
    S.path([[-w, b.outerID / 2], [-w, b.D / 2], [w, b.D / 2], [w, b.outerID / 2]].map(([u, v]) => V(u, sg * v)), 'sec', true);
    el('circle', { cx: V(0, sg * b.pitch / 2)[0], cy: V(0, sg * b.pitch / 2)[1], r: k * b.ball / 2, class: 'ball' }, S.g);
  }
  S.line(V(-w, b.d / 2), V(-w, -b.d / 2)); S.line(V(w, b.d / 2), V(w, -b.d / 2));
  S.centerLine(V(-w - 0.4, 0), V(w + 0.4, 0));
  S.hdim(V(-w, -b.D / 2), V(w, -b.D / 2), V(0, -b.D / 2)[1] + 9, `${b.B}`);
  S.vdim(V(w, -b.D / 2), V(w, b.D / 2), x(w) + 10, `Ø${b.D}`);
  S.vdim(V(-w, -b.d / 2), V(-w, b.d / 2), x(-w) - 10, `Ø${b.d}`);
  S.label([c[0], V(0, -b.D / 2)[1] + 24], `SECTION  ${scaleText(k)}`);
  S.text([180, 80], `${b.name}: bought, not made.`, { cls: 'nt', anchor: 'start' });
  S.text([180, 84], 'Open, deep groove, steel.', { cls: 'nt', anchor: 'start' });
  S.text([180, 92], 'Press it into the gear,', { cls: 'nt', anchor: 'start' });
  S.text([180, 96], 'flush with the outer face,', { cls: 'nt', anchor: 'start' });
  S.text([180, 100], 'with a drop of retaining compound.', { cls: 'nt', anchor: 'start' });
  return { title: 'Ball bearing 681X', qty: sh.solid === 'cube' ? 4 : 8, scale: scaleText(k), notes: [] };
}

export function drawing(part, sh) {
  const W = 297, H = 210, S = sheet(W, H);
  const make = { gear: gearSheet, core: coreSheet, spacer: spacerSheet, screw: screwSheet, bearing: bearingSheet }[part];
  const info = make(sh, S);
  titleBlock(S, [['Part', info.title], ['Material', part === 'bearing' ? 'Steel, bought' : MATERIAL], ['Quantity', `${info.qty}`], ['Scale', info.scale], ['Units', 'mm'], ['Tolerance', '±0.05 unless noted']]);
  info.notes.concat([GENERAL]).forEach((s, i) => S.text([8, H - 8 - (info.notes.length - i) * 4], s, { anchor: 'start', cls: 'nt' }));
  S.svg.setAttribute('aria-label', `Drawing: ${info.title}, all sizes in millimeters.`);
  return S.svg;
}
