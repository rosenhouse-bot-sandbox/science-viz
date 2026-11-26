---
name: realism-audit
description: Audit a page for things that could not happen in the real world (matter that appears or vanishes, parts that pass through each other, parts that move without being driven, speeds or numbers that disagree), then fix them and show before and after pictures. Use when asked for a realism audit or review, when someone says a picture "looks wrong", and before calling a new page done.
---

# realism-audit

A cheaper model works the page and takes frames. The strongest model derives the rules, reads the frames and the code, and decides what is wrong. This skill is the same for every page. The rules for one page are in that page's `REALISM.md` (`engine/REALISM.md`, `gears/REALISM.md`, and so on).

## Where rules come from

A rule is a law of physics, chemistry, anatomy or geometry, or a relation that was measured. Under each law, write what it forces the picture to show. Work them out for the page by asking:

- **What is conserved?** Matter, atoms, energy, light, area, volume, a count.
- **What cannot overlap or cross?** Solids, membranes, layers that keep their order.
- **What drives what?** A part moves only when something that touches it pushes or pulls it. A cause comes before its effect.
- **What relation ties two quantities?** If one is shown changing, the other changes with it, by the right amount.
- **What does the geometry force?** Angles, directions, parity, paths that must be straight or shortest.
- **What are the sizes, speeds and times, and their ratios?** One clock for everything in a scene.
- **What is random, and what is directed?**
- **What can the eye or the instrument really resolve?**

A remark that something looks wrong is evidence, not a rule. Find the law that the picture broke. Write the law and what follows from it, without the remark, who made it or when. One law usually has more consequences than the one that was noticed, so write those too and check them.

## Who does what

- **Reviewer**: you, on the strongest model at high effort. You derive the rules, read every frame, confirm each finding in the code, and fix.
- **Operators**: sub-agents on a cheaper model (Sonnet). An operator writes shot lists, runs them, and checks that each frame shows what was asked. An operator does not judge realism.
- **Second reader**: one fresh sub-agent on the strongest model. It gets the sheets, the words on screen and `REALISM.md`. It does not get the code or your findings.

This skill asks for those sub-agents. Run at most three captures at once on four cores.

## Steps

1. **Read the page's rules.** Read `<page>/REALISM.md`, the page's section of the top `README.md`, and the notes on the page itself. A simplification that the page says on screen is not a finding.
2. **Add to the rules before looking.** Go through every scene and control with the questions above. Add each law that is missing and what follows from it. For a new page, start from `REALISM-template.md` in this folder. Do this before taking a frame, so that the picture cannot argue you out of a rule.
3. **Read the code for candidates.** Note what the model computes and what is only drawn. Take numbers from the page's modules run in Node, never from a picture.
4. **Plan the sets.** A set steps one thing and holds the rest, so that motion shows from frame to frame. Give each set a note that says which rules it tests. Cover:
   - every stop, and between stops in small steps
   - one full cycle of anything that plays
   - every control and option
   - each moving part from several starting states, with the other parts in different places
   - sides the page does not open on (behind, below, inside)
   - a few seeded random states
   - desktop, and phone at twice the sharpness
5. **Operators take the frames.** Give each operator one page or one part of it, the sets, and the page's plan in `tests/audit/` to start from. The operator runs `node tests/audit/shots.mjs plan.json`. It returns the paths, and says which frames are blank, repeated or not what was asked.
6. **Read the frames against the rules.** Go through each sheet in order. A small sheet hides small breaks, so open the full frame wherever something looks off. Check:
   - each part alone: shape, size, place, color
   - parts together: what touches what, what drives what, what is in front, what is conserved, how fast one moves against another
   - the words and numbers in `states.json` against the picture beside them
7. **Confirm each candidate.** Find where it comes from in the code. Compare with a published measurement where one exists, and keep the source. Drop it if the page says it on screen, or if `REALISM.md` lists it under "Looks wrong, is right".
8. **Get the second read.** Add what the second reader finds, after confirming it the same way.
9. **Write the findings, worst first.** For each: page and stop, severity, the rule it breaks, what the page shows, the address that shows it (with its hash), the frames, the file and function. No fix in the finding.
   - **High**: a viewer learns something false.
   - **Medium**: something visibly could not happen, but the main idea survives.
   - **Low**: a simplification the page does not say.
10. **Fix**, unless asked only to report. Fix the model, not the picture. A fix that changes what the page teaches is the owner's choice: ask, and keep going on the rest. Where a test could have caught the finding, add the test (`tests/gears/collide.mjs` and `tests/vesicle/placement.mjs` began this way).
11. **Check again.** Run the same plans with `--out <after> --against <before>`. Read every before-and-after sheet, not only the sets that had findings. Run the page's tests from `CLAUDE.md`. Ask a fresh second reader to look at the transitions.
12. **Report.** Findings in order, each with its before-and-after picture. Say what was not seen (a real graphics card, a real phone, Safari).
13. **File what is still open.** Each finding that was not fixed becomes one GitHub issue, in the shape of step 9. Nothing open is kept in `REALISM.md`.
14. **Update `REALISM.md`.** For each finding, check that the law it broke is there with what follows from it. Under "Looks wrong, is right", add anything that was checked, is correct, and would be reported again.

## Every page

- Matter is conserved. Nothing appears from nowhere or vanishes.
- Nothing passes through a solid, a membrane or another part.
- A part moves only when something drives it, and the driver touches it.
- Anything shown at two zooms is shown at every zoom between them, at its true size.
- One object keeps its place, size and direction from scale to scale.
- If time is slowed N times, everything is slowed N times, or the page says what is not.
- Motion is only for what really moves.
- A finite patch is never drawn of something that is really everywhere.
- Numbers on screen agree with the picture and with each other.
- Light of one wavelength keeps it. Color is what we see.
- Anything simplified or drawn larger than life says so on screen.

## Taking frames

- `tests/audit/shots.mjs` writes numbered frames, the words on screen for each (`states.json`) and one sheet per set. A run that was cut off picks up where it stopped.
- `tests/audit/<page>.json` is a plan to start from. It holds how to tell that the page is ready, how to settle it, and a first set. Its `about` line says how slow the page is and what to avoid.
- Where WebGL is drawn in software a screenshot can take a minute. A plan with `canvas` reads the picture from the canvas. A page that is not playing needs a `settle` that draws, or the canvas reads as black.
- Do not put `+` in a hash value (`1e+06` is read wrongly).
- Do not judge a glide with reduced motion on. It makes the zoom jump on purpose.
- Do not edit a page's files while its page test runs. The test loads them live.
- The browser here is Chromium with software drawing. It says nothing about speed, and nothing about Safari.
