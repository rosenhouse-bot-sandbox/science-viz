// Gears on a cube and an octahedron: every sentence on the page. Numbers are put in from model.js.
import { SHAPES } from './model.js?v=5019cb4a';

const by = Object.fromEntries(SHAPES.map((s) => [s.id, s]));
const deg = (r) => `${(r * 180 / Math.PI).toFixed(1).replace(/\.0$/, '')}°`;

export const ANSWER = {
  title: 'Can you do it with an octahedron? Yes.',
  body: 'Gears that touch spin opposite ways. Go around any corner and you need an even number of gears, or two of them end up fighting. '
    + 'An octahedron has four faces at every corner, so all eight gears turn. A cube has three. That\'s why the toy only has gears on four sides.',
};

export const CAPTIONS = {
  cube4: { title: 'The cube', body: `Four gears in a ring, like the toy. Neighbors meet at ${deg(by.cube4.shaft)}. Drag a gear to spin them all.` },
  octa: { title: 'The octahedron', body: `Eight gears, each touching three others. Neighbors meet at ${deg(by.octa.shaft)}, so the teeth are cut to that angle. Drag a gear to spin them all.` },
};

export const KEY = 'Gold and blue gears spin opposite ways.';

export const HOW = [
  'Each gear is a bevel gear. Its teeth all point at the center of the shape, which lets it mesh with a neighbor at any angle.',
  'The tooth shapes are worked out the way a gear-cutting machine makes them. A test spins every pair and checks that the teeth never hit each other.',
  'Each gear turns on a ball bearing, held to a brass core by a flanged screw. A thick washer lifts it far enough that the teeth clear the core.',
];
