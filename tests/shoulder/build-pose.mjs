// Works out how far the arm turns out as it lifts (model.js, turnOut) and stores it in shoulder/data/pose.json,
// so that the page need not work it out while it starts. Run after changing the bones, the pose or CLEAR.
//   node tests/shoulder/build-pose.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fresh } from './load.mjs';
const t = fresh().makeTable();
fs.writeFileSync(path.join(import.meta.dirname, '../../shoulder/data/pose.json'), JSON.stringify(t) + '\n');
for (const [pl, rows] of Object.entries(t.planes)) console.log(pl, rows.filter((_, i) => i % 3 === 0).map((r, i) => `${i * 15}: ir ${r.ir} glide ${r.glide.join("/")} ribs ${r.ribs}`).join("\n   "));
