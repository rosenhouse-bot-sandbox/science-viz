// Shoulder: the arm's pose through each exercise, p from 0 to 1 over one round. The words for each exercise, and
// the muscles it works, are in facts.js. Poses are of the arm relative to the body (model.js): the body is not drawn
// lying, leaning or bending.
const wave = (p) => (1 - Math.cos(2 * Math.PI * p)) / 2;   // 0 at the start, 1 halfway, back to 0
export const EX_POSE = {
  // one swing forward and back, one side to side, then one circle. Each grows from rest and dies back to it, so that
  // one part runs into the next without a change of direction at speed.
  pendulum: (p) => {
    const part = Math.min(2, Math.floor(p * 3)), u = p * 3 - part, th = 2 * Math.PI * u, r = 12 * Math.sin(Math.PI * u) ** 2;
    const fwd = part === 1 ? 0 : r * Math.sin(th), side = part === 0 ? 0 : part === 1 ? r * Math.sin(th) : r * Math.cos(th) - r;
    return { elev: 90 + fwd, plane: 90 + side, rot: 0, elbow: 0 };
  },
  // lying on the side, upper arm forward on the bed, elbow bent: the forearm starts pointing up from the bed, which is
  // across the body (the wiper's start, below), and is pressed down toward the bed, which turns the arm further in
  sleeper: (p) => ({ elev: 90, plane: 90, rot: -90 - 40 * wave(p), elbow: 90 }),
  external: (p) => ({ elev: 0, plane: 30, rot: 60 * wave(p), elbow: 90 }),
  internal: (p) => ({ elev: 0, plane: 30, rot: -60 * wave(p), elbow: 90 }),
  external90: (p) => ({ elev: 90, plane: 0, rot: 90 * wave(p), elbow: 90 }),
  // upper arm forward at shoulder height, elbow bent: the forearm turns from across the chest to straight up
  wiper: (p) => ({ elev: 90, plane: 90, rot: -80 + 80 * wave(p), elbow: 90 }),
  // from the hand in front of the other hip, arm turned in, to up and out past the head, arm turned out. The start
  // keeps the arm bone as far from the ribs as it is with the arm hanging (the arm's own flesh and the chest's lie
  // between them), so the upper arm goes forward of the chest before it goes across, and the elbow is bent.
  pnf: (p) => { const u = wave(p); return { elev: 35 + 115 * u, plane: 105 - 75 * u, rot: -90 + 150 * u, elbow: 45 * (1 - u) }; },
  // the arm hangs toward the floor (forward from the body) and is lifted out to the side, level with the shoulder
  bentRaise: (p) => ({ elev: 90, plane: 90 - 90 * wave(p), rot: 0, elbow: 0 }),
  // straight arm from a little in front of the body to a little behind it
  extension: (p) => { const x = 20 - 45 * wave(p); return { elev: Math.abs(x), plane: x >= 0 ? 90 : -90, rot: 0, elbow: 0 }; },
  // straight arms forward at shoulder height, pulled back until the elbows are out to the sides and bent, hands up
  highRow: (p) => { const u = wave(p); return { elev: 90, plane: 90 - 90 * u, rot: 90 * u, elbow: 90 * u }; },
  // lying face down over the ball, arms hanging, lifted out to the sides with the thumbs turned up
  prone: (p) => { const u = wave(p); return { elev: 90, plane: 90 - 90 * u, rot: 60 * u, elbow: 0 }; },
  // held poses: the shoulder does not move
  thoracic: () => ({ elev: 125, plane: 60, rot: 20, elbow: 140 }),
  plank: () => ({ elev: 90, plane: 90, rot: 0, elbow: 90 }),
  sidePlank: () => ({ elev: 90, plane: 0, rot: 0, elbow: 90 }),
};
// exercises in which the shoulder holds still: no Play and no slider
export const EX_STILL = new Set(['thoracic', 'plank', 'sidePlank']);
// seconds for one round. The pendulum swings as a hanging arm does by its own weight: about 1.4 s a swing (a straight
// arm about 0.75 m long, as a rod swinging from one end: 2π √(2L / 3g)), three swings.
export const EX_SECONDS = { pendulum: 3 * 2 * Math.PI * Math.sqrt(2 * 0.75 / (3 * 9.81)) };
