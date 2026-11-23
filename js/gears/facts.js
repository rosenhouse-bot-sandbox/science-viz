// Gears on a cube and an octahedron: every sentence on the page. Numbers are put in from model.js.
import { SHAPES } from './model.js?v=4f4725d3';

const by = Object.fromEntries(SHAPES.map((s) => [s.id, s]));
const deg = (r) => `${(r * 180 / Math.PI).toFixed(1).replace(/\.0$/, '')}°`;

export const ANSWER = {
  title: 'Yes, it works.',
  body: 'Touching gears spin opposite ways, so each corner needs an even number of gears. An octahedron has 4 per corner. A cube has 3.',
};

export const KEY = 'Gold and blue spin opposite ways.';

export const HOW = [
  `Bevel gears: every tooth points at the center, so neighbors mesh at any angle (${deg(by.cube4.shaft)} on the cube, ${deg(by.octa.shaft)} on the octahedron).`,
];
