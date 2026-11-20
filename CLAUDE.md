# Developing this site

Guidance for anyone, human or agent, changing this repository. The README describes what each
experience is and where its code lives.

## Ground rules

- Static site, no build step, no dependencies. (One exception, which Gabe chose: Graph layout loads
  the real ELK and the real TALA from jsDelivr, pinned to a version, only when the visitor asks for
  them. Nothing else may load code from another host.) Plain HTML, CSS and ES modules, served as-is from
  GitHub Pages (`.github/workflows/pages.yml` publishes `main`). (`tests/` is not part of the site:
  it needs Node and a Playwright installed outside the repository.)
- Run it with `python3 -m http.server 8000` from the repository root. ES modules do not load from
  `file://`.
- Each experience is self-contained: `v2/` (Rainbows), `vesicle/`, `optics/` (Optics workshop),
  `dag/` (Graph layout), `maple/` (Japanese maple) and `engine/` (Engine) have their own page, stylesheet (`css/`) and modules (`js/`). Do not change one while working on
  another.
  The one thing they share is controller support, `js/gamepad/gamepad.js` and `css/gamepad.css`: each
  page gives it a short mapping onto its own camera, zoom and scale functions.
- Physics claims must be true. Numbers shown on screen come from the model in code
  (`js/v2/optics.js` for v2), not from text typed into a caption. Where a picture simplifies or
  exaggerates, say so on screen and in the README.
- Use wavelength and color correctly. Wavelength is a property of the light; color is what we
  perceive. White light is a mix of many wavelengths, not "every color at once". Write "short
  wavelengths, which we see as blue", and "drawn in gold" for a color that is only the picture's.

## Writing the text

- Write on-screen text, captions, briefs, info cards and README prose with the `prose-lint` skill
  (`.claude/skills/prose-lint/SKILL.md`). It asks for short, complete sentences, plain words, no
  metaphor, constraints before objectives, and each fact said once, and it checks the text against what
  the code draws. Run `.claude/skills/prose-lint/check.sh <files>` on the files you change. Gabe built
  the rules by picking between rewrites, so add new examples to the skill when he corrects a sentence.

## Modern Web Guidance

Before writing or changing any HTML, CSS or client-side JavaScript, consult
[Modern Web Guidance](https://github.com/GoogleChrome/modern-web-guidance) and follow it where it
applies. It is a set of current web-platform best practices (accessibility, forms, CSS, motion,
performance, security, canvas and WebGL) maintained by the browser vendors and MDN.

Search for the capability you are about to build, then read the matching guide:

```sh
npx -y modern-web-guidance@latest search "range slider"
npx -y modern-web-guidance@latest retrieve "slider"
```

Without network access to npm, clone the repository and read the guides under
`skills/modern-web-guidance/guides/`. Start with the discipline guides: `accessibility`, `html`,
`css`, `forms`, `motion`, `performance`, `security`.

**Browser support:** features that are Baseline Widely available need no fallback. Newer features
are welcome only when they are feature-detected or degrade harmlessly, and only with fallbacks
that add no dependency. No polyfills.

What that guidance has meant here so far, and should keep meaning:

- Honour `prefers-reduced-motion`: no camera drift, no flying zoom between scales, and the
  animation starts paused. Anything that moves on its own needs a visible Pause control.
- Use native controls (`<button>`, `<input type="range">`, `<input type="checkbox">`) with real
  labels. Everything reachable by pointer must be reachable by keyboard.
- A canvas is opaque to assistive technology. Keep the story, the numbers and the controls in the
  DOM beside it, and announce changes through a live region.
- Drive all animation from `requestAnimationFrame` (it stops in hidden tabs), recover from a lost
  WebGL context, and keep start-up work in short tasks.
- Keep the page's `<meta>` Content-Security-Policy tight: no inline scripts or event handlers, and
  add a host to it only when a page really needs one.
- Never build HTML from text that came from the URL or the user. Readouts are built from numbers.

## Checking a change

Before pushing:

- `node --check` every changed module.
- For v2, run the smooth-interaction tests: `node tests/smooth/run.mjs --quick` after any change,
  and the full `node tests/smooth/run.mjs` after changing a slider, a flight between scales, the
  particles or the panel's layout. They drag every slider and press every button one frame at a
  time on a stepped clock and report anything that jumps, flashes, shifts under the pointer or
  depends on the route taken. Read `tests/smooth/out/report.md` and look at `contact.png`. A new
  finding is yours to fix, or to record in `tests/smooth/accepted.json` with the reason it is
  meant. `tests/smooth/README.md` says what the tests can and cannot see.
- For the Optics workshop, run `node tests/optics/run.mjs`. It plays every challenge with a mouse, a
  finger and the keyboard, and fails if one cannot be won. A new challenge needs a known solution
  added to `PLAYS` there. Numbers in a challenge's text must match what the trace gives.
  Also run `node tests/optics/layout.mjs`: it steps every slider through every value and fails if
  anything in the panel or the bench moves or changes size (a number that gains a digit and wraps).
- For Vesicle fusion, run `node tests/vesicle/placement.mjs` after changing the membrane shape or
  where a protein sits. It steps through the whole event without a GPU and fails if any protein is
  on the wrong side of a membrane or pushed into one. It cannot judge what only looks wrong, so
  also step through the stages by eye.
- For Graph layout, run `node tests/dag/run.mjs` (no browser needed): it lays out every sample graph
  with both methods over a spread of settings and fails if nodes overlap, an edge misses its node, a
  cycle is left, or two runs differ. Then `node tests/dag/page.mjs` presses every control at a desktop
  and a phone size and fails on a console error or a panel wider than the screen. A new sample graph
  goes in `SAMPLES` in `js/dag/graphs.js` and is picked up by both. The page must keep saying which
  pictures come from its own step-by-step code and which from the real ELK and TALA.
- For Japanese maple, run `node tests/maple/model.mjs` (no browser needed) after changing the
  calendar, a pigment curve, an absorption band or the tree: it fails if an event happens out of
  order or a leaf's computed colour gets the wrong name. Then `node tests/maple/page.mjs` (about a
  quarter of an hour with a graphics card, about an hour without one): it presses every control at a desktop and a phone size, steps both sliders end
  to end comparing each picture with the one before, and fails on a jump, a control that moved, or a
  console error. Leaf colours must stay computed from the pigment amounts; do not type them in.
  The page is one 3D model: never fade one picture into another or swap one for another between
  scales; move the camera or the object. The test draws WebGL in software, so it is slow; on a
  machine with a graphics card look at the page itself as well.
  After changing any file under `js/maple/` or `css/maple.css`, run `node tests/maple/stamp.mjs`: it
  writes one shared version into every address that loads one of them (`model.js?v=...`), so that a
  browser never pairs a new file with an old cached copy of another. Both tests fail if the stamp is
  out of date.
- For Engine, run `node tests/engine/model.mjs` (no browser needed) after changing the engine's sizes, the
  valve timing, the burn, the pressure model or the molecules: it fails if a valve is open in the wrong
  stroke or reaches the piston, a camshaft is not at half speed, the burning order is wrong, the peak
  pressure leaves its range, an atom is lost in the reaction, or a size in the shaders is not the model's.
  After changing how the gas moves (`js/engine/flow.js`), the valve timing or the pressure model, run
  `node tests/engine/flow.mjs` (no browser needed): it works out the paths of the gas dots and fails if gas is
  made or lost against the model, sits unevenly in the cylinder, is inside metal, passes a shut valve, or leaves
  any way but down the exhaust pipe. A dot of gas is never faded in or out to hide a gap in the flow.
  Then `node tests/engine/page.mjs` (`--quick` for the desktop only): it presses every control at a
  desktop and a phone size, checks the labels, steps both sliders end to end comparing each picture with
  the one before, and fails on a jump, a control that moved, labels that overlap, or a console error.
  Numbers on screen must stay computed from `js/engine/model.js`. The page is one 3D model, as the maple
  is, and no picture is swapped for another. A cut piece fades away where it is and does not move (Gabe's
  rule for this page: motion is kept for what really moves). Moving parts are never cut. After changing any file under `js/engine/` or `css/engine.css`, run `node tests/engine/stamp.mjs`.
  The picture is ray-marched in a fragment shader, which is slow in software; on a machine with a
  graphics card look at the page itself as well, and on a phone.
- After changing `js/gamepad/`, `css/gamepad.css`, a page's `gamepad({ ... })` mapping, or which
  controls a page has, run `node tests/gamepad/run.mjs` (or with page names: `home`, `rainbows`,
  `vesicle`, `optics`, `graph`, `maple`, `engine`, `deck`). It drives each page with a simulated Xbox
  controller at 1280 × 800 and fails if the ring cannot reach a control, a stick, trigger or bumper
  does nothing, or the picture of the pad does not list exactly what the page maps. A new page
  needs a mapping, and an entry in `PAGES` there.
- After changing how a page zooms, or what a finger on its picture does, run `node tests/pinch/run.mjs`
  (or with page names: `maple`, `engine`, `vesicle`, `rainbows`). It puts two simulated fingers on the
  picture at a phone size and fails if spreading them does not zoom in, the slider does not move with
  them, the browser zooms the whole page, or the zoom and the time move in the same frame. A pinch
  must go through the same state as the page's Zoom slider. It cannot stand in for a real phone.
- A frozen screenshot does not show a jump. When a person reports one, first add the gesture to
  `tests/smooth/scenarios.mjs` and see the report show it, then fix it.
- Load each affected page in a browser with the console open, at a desktop width and at a phone
  width (390 × 844), and step through every scale and control.
- For v2, also check with reduced motion switched on, and with only the keyboard.
