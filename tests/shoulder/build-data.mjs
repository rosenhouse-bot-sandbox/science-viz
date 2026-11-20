// Builds the Shoulder page's data from the BodyParts3D meshes (not kept in the repository):
//   shoulder/data/bones.bin, bones.json   the bones, as scanned (positions packed to 16 bits per axis)
//   shoulder/data/muscles.json            the built muscles: slices fitted to the scanned muscles
//   tests/shoulder/data/scans.bin, .json  the scanned muscles themselves, for review.mjs
//
//   curl -O https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_BP3D_4.0_obj_99.zip
//   unzip isa_BP3D_4.0_obj_99.zip -d /some/dir
//   node tests/shoulder/build-data.mjs /some/dir/isa_BP3D_4.0_obj_99
//
// BodyParts3D, © The Database Center for Life Science, licensed under CC Attribution 4.0 International.
import fs from 'node:fs';
import path from 'node:path';
import { V, sphereFit } from '../../js/shoulder/geom.js';
import { fitMuscle } from './fit.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const src = process.argv[2];
if (!src) { console.error('usage: node tests/shoulder/build-data.mjs <folder with the BodyParts3D FJ*.obj files>'); process.exit(1); }

// BodyParts3D element files (FMA concept in brackets). Right side.
export const BONES = {
  scapula: 3384, clavicle: 3362, humerus: 3368, radius: 3349, ulna: 3391,          // FMA13395, 13322, 23130, 23464, 23467
  rib1: 3334, rib2: 3336, rib3: 3338, rib4: 3340, rib5: 3342, rib6: 3344, rib7: 3346, // FMA7857 ... 8229
  manubrium: 3290, sternum: 3178,                                                     // FMA7486, 7487
};
export const MUSCLES = {
  supra: 1506, infra: 1500, tminor: 1508, subscap: 1504,                              // FMA32544, 32547, 32553, 13414
  deltA: 1468, deltM: 1467, deltP: 1513,                                              // clavicular, acromial, spinal parts of the deltoid
};
const BANDS = {};   // the middle deltoid wraps over the top of the shoulder: fitted as two bands

// read an OBJ, turning BodyParts3D's axes (x to the body's left, y backward, z up) into the page's (x left, y up, z forward)
function load(id) {
  const v = [], f = [];
  for (const l of fs.readFileSync(path.join(src, `FJ${id}.obj`), 'utf8').split('\n')) {
    if (l.startsWith('v ')) { const [, x, y, z] = l.trim().split(/\s+/).map(Number); v.push([x, z, -y]); }
    else if (l.startsWith('f ')) { const ix = l.trim().split(/\s+/).slice(1).map((s) => parseInt(s) - 1); for (let k = 1; k + 1 < ix.length; k++) f.push(ix[0], ix[k], ix[k + 1]); }
  }
  return { v, f };
}

// pack meshes: per mesh a box, positions as Uint16 across the box, then Uint16 indices
function pack(meshes, binFile) {
  const index = [], chunks = []; let off = 0;
  for (const [name, m] of Object.entries(meshes)) {
    const lo = [0, 1, 2].map((i) => Math.min(...m.v.map((p) => p[i]))), hi = [0, 1, 2].map((i) => Math.max(...m.v.map((p) => p[i])));
    const q = new Uint16Array(m.v.length * 3);
    m.v.forEach((p, j) => { for (let i = 0; i < 3; i++) q[3 * j + i] = Math.round((p[i] - lo[i]) / (hi[i] - lo[i]) * 65535); });
    if (m.v.length > 65535) throw new Error(name + ' has too many vertices for 16-bit indices');
    const ix = Uint16Array.from(m.f);
    index.push({ name, nv: m.v.length, ni: ix.length, off, lo: lo.map((x) => +x.toFixed(3)), hi: hi.map((x) => +x.toFixed(3)) });
    chunks.push(Buffer.from(q.buffer), Buffer.from(ix.buffer)); off += q.byteLength + ix.byteLength;
  }
  fs.writeFileSync(binFile, Buffer.concat(chunks));
  return index;
}

const bones = Object.fromEntries(Object.entries(BONES).map(([k, id]) => [k, load(id)]));
const scans = Object.fromEntries(Object.entries(MUSCLES).map(([k, id]) => [k, load(id)]));

// ---- landmarks, measured on the scanned bones
const hum = bones.humerus.v, top = Math.max(...hum.map((p) => p[1]));
const cap = hum.filter((p) => p[1] > top - 40), mid = cap.map((p) => p[0]).sort((a, b) => a - b)[cap.length >> 1];
const head = sphereFit(cap.filter((p) => p[0] > mid));                       // the ball: a sphere fitted to the inner half of the top 40 mm
const HC = head.c;
const bot = Math.min(...hum.map((p) => p[1]));
const EL = V.mean(hum.filter((p) => p[1] < bot + 14));                      // the elbow: the middle of the humerus's lowest 14 mm
const SCJ = bones.clavicle.v.reduce((a, p) => (p[0] > a[0] ? p : a));        // the collarbone's inner end, at the breastbone
const AC = bones.clavicle.v.reduce((a, p) => (p[0] < a[0] ? p : a));         // its outer end, at the acromion
const ROOT = bones.scapula.v.filter((p) => p[1] > HC[1] - 45 && p[1] < HC[1] - 5).reduce((a, p) => (p[0] > a[0] ? p : a));   // the inner edge of the shoulder blade, level with the joint
const GT = V.mean(hum.filter((p) => p[1] > HC[1] - 5 && p[0] < HC[0] - 12));   // the greater tuberosity: the outer bump where the supraspinatus attaches
const WRIST = bones.radius.v.reduce((a, p) => (p[1] < a[1] ? p : a));
const r3 = (p) => p.map((x) => +x.toFixed(2));
const marks = { HC: r3(HC), headR: +head.r.toFixed(2), EL: r3(EL), SCJ: r3(SCJ), AC: r3(AC), ROOT: r3(ROOT), GT: r3(GT), WRIST: r3(WRIST) };

// where each muscle ends on the arm: the fit runs from its origin (t = 0) to this end (t = 1)
const INS = {
  supra: GT, infra: V.add(GT, [0, -8, -14]), tminor: V.add(GT, [0, -25, -14]), subscap: V.add(HC, [10, -5, 22]),
  deltA: EL, deltM: EL, deltP: EL,
};

fs.mkdirSync(path.join(root, 'shoulder/data'), { recursive: true });
fs.mkdirSync(path.join(root, 'tests/shoulder/data'), { recursive: true });
const bi = pack(bones, path.join(root, 'shoulder/data/bones.bin'));
fs.writeFileSync(path.join(root, 'shoulder/data/bones.json'), JSON.stringify({ source: 'BodyParts3D, © The Database Center for Life Science, CC BY 4.0', marks, meshes: bi }) + '\n');
const si = pack(scans, path.join(root, 'tests/shoulder/data/scans.bin'));
fs.writeFileSync(path.join(root, 'tests/shoulder/data/scans.json'), JSON.stringify({ source: 'BodyParts3D, © The Database Center for Life Science, CC BY 4.0', meshes: si }) + '\n');

const out = {};
const rnd = (x) => +x.toFixed(2);
for (const n of Object.keys(MUSCLES)) {
  const bands = fitMuscle(scans[n], BANDS[n] || 1, INS[n]);
  out[n] = bands.map((b) => b.sl.map((s) => ({ c: s.c.map(rnd), U: s.U.map((x) => +x.toFixed(4)), W: s.W.map((x) => +x.toFixed(4)), lo: rnd(s.lo), hi: rnd(s.hi), top: s.top.map(rnd), bot: s.bot.map(rnd) })));
  console.log(n, bands.length, 'band(s),', bands.map((b) => b.sl.length).join('/'), 'slices');
}
fs.writeFileSync(path.join(root, 'shoulder/data/muscles.json'), JSON.stringify({ note: 'Built muscles, fitted to BodyParts3D scans by tests/shoulder/build-data.mjs', marks, muscles: out }) + '\n');
console.log('marks', marks);
for (const f of ['shoulder/data/bones.bin', 'shoulder/data/bones.json', 'shoulder/data/muscles.json', 'tests/shoulder/data/scans.bin']) console.log(f, (fs.statSync(path.join(root, f)).size / 1024).toFixed(0), 'KB');
