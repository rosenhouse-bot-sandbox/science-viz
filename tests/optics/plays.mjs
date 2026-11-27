// A known solution of each Optics workshop challenge, shared by the browser test (run.mjs, which
// plays it) and the model test (model.mjs, which checks that it wins). What to do in each
// challenge: choices to click, sliders to set by keyboard, then knobs to drag (from a world point,
// where the knob is when the challenge opens; `rev` when the value rises as the pointer goes left).
export const PLAYS = {
  burn: { keys: { c: 15 }, drags: [{ param: 'x', at: [-50, -21], to: -61 }] },
  picture: { clicks: { lens: 1 }, keys: { D: 13 }, drags: [{ param: 'xs', at: [50, -19], to: 65 }] },
  far: { keys: { near: 0.05 }, drags: [{ param: 'xs', at: [66, -19], to: 40 }] },
  specs: { keys: { P: -3.5 }, drags: [] },
  camera: { keys: { q: 0.7 }, drags: [{ param: 'D', at: [-6, 12], to: 12.8 }] },
  colour: { clicks: { glass: 0 }, keys: { c: 11.5 }, drags: [] },
  doublet: { clicks: { glass: 1 }, keys: { c1: 45.5, c: -2 }, drags: [] },
  wide: { keys: { q: -2.25 }, drags: [{ param: 'xi', at: [-6, -21], to: -11.5 }] },
  tower: { keys: {}, drags: [{ param: 't0', at: [22, -6], to: 3.5 }, { param: 't1', at: [64, -6], to: -2 }, { param: 't2', at: [106, -6], to: -10.75 }] },
};
// The same as plain settings.
export const settings = (id) => ({ ...PLAYS[id].clicks, ...PLAYS[id].keys, ...Object.fromEntries(PLAYS[id].drags.map((d) => [d.param, d.to])) });
