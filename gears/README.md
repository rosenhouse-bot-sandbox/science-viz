# Gear fidget: what must stay true

The `realism-audit` skill reads this before an audit and adds to it after. One line each, in Gabe's words where he gave them, with the date. What the page simplifies is said on screen and in the top `README.md`, not here.

## Rules

- It looks like the real brass toy, and it could be made. (2026-11-23)
- A tooth never enters another tooth. The body never touches a gear.
- Take apart moves only when the visitor moves it. Gears do not turn while apart.
- Workshop: "tools should touch the work, and never the machine." (2026-11-26; the tool post once hit the chuck, 2026-11-23)
- Workshop: cuts are as light as a real machinist takes them. The first ones were "way too aggressive". (2026-11-26)
- Workshop: a cut is shown being made, with chips, "not just snapshots of each step". Tools lift and wind back between passes. (2026-11-25, 2026-11-26)
- Workshop: a hole is there from the step that makes it, on every later step and on the finished toy. (2026-11-25)
- Workshop: the finished part matches its drawing.
- Workshop: it looks like photos of a real shop: a lit room, satin gray steel, cast paint. "No one keeps their lathe chuck polished." (2026-11-25, 2026-11-26)

## Checked and right

Do not report these again.

- A cube carries a ring of 4 gears, not 5 or 6. An octahedron carries 8. (`tests/gears/model.mjs`)

## Open

- None recorded.

## Taking frames

- Ready: `window.__gears?.drawn.shape`; workshop `window.__make?.cur`.
- Settle: `__gears.settle(); __gears.redraw()`; workshop `__make.at(t)` then `__make.redraw()`.
- Speed: the lit look takes seconds a frame in software. `?look=0` gives the plain lighting, which is right for checking shapes and wrong for checking the look.
- Tests: `tests/gears/model.mjs`, `make.mjs`, `collide.mjs` (about 5 minutes), `page.mjs`, `makepage.mjs`.
