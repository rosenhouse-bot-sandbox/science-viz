# Engine: what must stay true

The `realism-audit` skill reads this before an audit and adds to it after. One line each, in Gabe's words where he gave them, with the date. What the page simplifies is said on screen and in the top `README.md`, not here.

## Rules

- Gas is never made or lost. It leaves only down the exhaust pipe, never through metal or a shut valve. The exhaust once looked like "it's just disappearing". (2026-11-18)
- A dot of gas is never faded in or out to hide a gap in the flow.
- "Reserve graphical motion for actual physical phenomena." A cut piece fades away where it is. Moving parts are never cut. (2026-11-17)
- One 3D model. No picture is swapped for another.
- Gas is drawn across the whole view or not at all. A block of molecules in empty space "looks unnatural". (2026-11-17)
- Gas is shown at every zoom between Flame and Molecules, denser where the pressure is higher. (2026-11-18)
- Every cylinder follows its own phase. The camshafts turn at half the crankshaft's speed. A valve never reaches the piston.
- The wheels turn as fast as the road passes under them. (2026-11-18)
- When the picture is ahead of what a reader expects, the caption says why. The spot at Molecules burns before the top of the stroke. (2026-11-17)
- Numbers on screen come from `js/engine/model.js`, and so do the sizes in the shaders.
- The Car opens slowed 60 times, because real speed flashed. Real speed is a button. (2026-11-18)
- Labels are wanted on this page. (2026-11-17)

## Checked and right

Do not report these again.

- Green dots in the port before the spray: mixture pushed back from the cylinder.

## Open

- None recorded.

## Taking frames

- Ready: `window.__engine?.flow` (the gas paths take a few seconds to work out).
- Pose: `__engine.set(z, phi)`, with `phi` the crank angle from 0 to 720. It draws at once.
- Speed: ray-marched, so slow in software. Use `?res=0.5` and read the canvas. The labels are not on the canvas.
- Tests: `tests/engine/model.mjs`, `flow.mjs`, `page.mjs`.
