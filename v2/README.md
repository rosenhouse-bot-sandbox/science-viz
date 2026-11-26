# Rainbows: what must stay true

The `realism-audit` skill reads this before an audit and adds to it after. One line each, in Gabe's words where he gave them, with the date. What the page simplifies is said on screen and in the top `README.md`, not here.

## Rules

- It is one world, not a set of nested animations. Nothing jumps, pops in or changes size between scales. (2026-11-11)
- A ray seen at one scale is there at the next. The sunlight into a drop must not appear from nowhere on the way in. (2026-11-12)
- From Surface to Molecules the camera does not turn, and the water side stays blue, "so we maintain a sense of direction". (2026-11-12)
- Draw fewer things, not better extras. "There's enough going on there already." (2026-11-12)
- No floating labels on the picture. Only angle numbers, Air, Water, Night and the color keys. Facts go in the panel. (2026-11-11)
- Wavelength belongs to the light. Color is what we see. (2026-11-12)
- A flight across several scales does not slow at the scales it passes. (2026-11-12)
- Clouds do not drift over a globe that does not turn. (2026-11-18)
- Numbers on screen come from `js/v2/optics.js`.

## Checked and right

Do not report these again.

- Fresnel shares and Snell angles.
- "96% polarized" is the share, the usual figure.
- The edge of day and night at Orbit.
- Marked drops fall slower than the rain. Gabe chose to keep that and say it on screen. (2026-11-20)

## Open

- The smooth tests report "sweep Drop bowpos" and "sweep Molecules lambda" on main. (2026-11-20)

## Taking frames

- Ready: `window.__rainbows`. Time is stepped through `__rainbows.dbg`; `tests/smooth/inject.js` shows how.
- Speed: a screenshot takes 20 to 60 s in software. The page lowers its canvas resolution when frames are slow, so make frames one size before comparing them.
- Tests: `tests/smooth/run.mjs` finds jumps that a still frame cannot show. Add a reported jump to `scenarios.mjs` first, then fix it.
