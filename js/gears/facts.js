// Gears on a cube and an octahedron: every sentence on the page. Numbers are put in from model.js.
import { SHAPES, PRESSURE } from './model.js?v=5a90a021';

const by = Object.fromEntries(SHAPES.map((s) => [s.id, s]));
const deg = (r, d = 1) => `${(r * 180 / Math.PI).toFixed(d).replace(/\.0$/, '')}°`;
const cube = by.cube4, octa = by.octa;

// the answer to the question, always on screen
export const ANSWER = {
  title: 'Can gears cover an octahedron? Yes.',
  body: 'Two meshing gears turn opposite ways. So a loop of meshing gears can turn only if it has an even count. '
    + 'Around each corner of an octahedron, four gears make a loop. Around each corner of a cube, three do. '
    + 'So an octahedron can carry eight gears, and a cube only a ring of four.',
};

// what each choice shows
export const CAPTIONS = {
  cube4: { title: 'Four gears on a cube',
    body: `Each gear meshes with the two beside it. Their axes meet at the center at ${deg(cube.shaft)}. The top and bottom faces have no gears. Drag a gear to turn it.` },
  cube6: { title: 'Six gears on a cube jam',
    body: 'All six gears fit together, each tooth in a gap. But the top gear meshes with all four gears of the ring. Two of those turn one way and two turn the other way. The top gear cannot do both, so no gear can turn. The top and bottom gears are drawn in red.' },
  octa: { title: 'Eight gears on an octahedron',
    body: `Each gear meshes with three others. Their axes meet at the center at ${deg(octa.shaft)}, which is 180° less the angle between two faces. Drag a gear to turn it.` },
};

export const KEY = 'Gold and blue gears turn opposite ways.';
export const KEY_JAM = 'Gold and blue gears turn opposite ways. A red gear would have to turn both ways.';

// how the gears are made
export const HOW = [
  `These are bevel gears. Each gear's teeth lie on a cone with its tip at the center. Two meshing cones touch along the line from the center through the middle of the shared edge. So each cone's half-angle is half the angle between the axes: ${deg(cube.alpha)} on the cube and ${deg(octa.alpha)} on the octahedron.`,
  `The teeth are cut the way gear-cutting machines cut bevel gears. Each gear is rolled against a flat crown gear whose teeth have straight sides at ${deg(PRESSURE)}. Two gears cut by the same crown gear mesh with each other at any angle between their axes.`,
  'Each tooth is thinned by 5% of the tooth spacing so that meshing teeth do not bind. The page\'s tests turn every meshing pair and check that no tooth enters another.',
  `At every contact, a tooth of one gear must face a gap of the other. Each gear is turned to the angle that does this, one gear after another. Around each corner of the octahedron, and around the cube's ring, the angles agree whatever the tooth count. Here the cube's gears have ${cube.profile.N} teeth and the octahedron's ${octa.profile.N}. With ${cube.profile.N}, all six gears on the cube can also sit together.`,
  'The gray body in the middle stands for what holds the axles. It is drawn small enough to touch no gear.',
];
